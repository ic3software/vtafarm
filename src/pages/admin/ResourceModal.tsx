import { useEffect, useMemo, useState } from 'react'
import {
  api,
  type AdminSessionResources,
  type ResourceProfile,
  type UpgradeComponent,
} from '@/lib/api'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ResourceSession = { id: string; mode: string }

interface Props {
  sessions: ResourceSession[]
  onClose: (didApply: boolean) => void
}

interface ResourceRow {
  component: UpgradeComponent
  memoryRequest: string
  memoryLimit: string
  currentValues: Array<{ memoryRequest: string; memoryLimit: string }>
  defaults: ResourceProfile
}

const requestOptions = ['64Mi', '128Mi', '256Mi', '512Mi']
const limitOptions = [...requestOptions, '1Gi', '2Gi']
const labels: Record<UpgradeComponent, string> = {
  vta: 'VTA',
  mediator: 'Mediator',
  dids: 'DID Hosting',
  vtc: 'VTC',
}

const modeComponents: Record<string, UpgradeComponent[]> = {
  vta_only: ['vta'],
  full_stack: ['vta', 'mediator', 'dids', 'vtc'],
}

function selectedComponents(sessions: ResourceSession[]) {
  const selected = new Set<UpgradeComponent>()
  for (const session of sessions) {
    for (const component of modeComponents[session.mode] ?? []) selected.add(component)
  }
  return (['vta', 'mediator', 'dids', 'vtc'] as UpgradeComponent[])
    .filter(component => selected.has(component))
}

function optionValues(current: string, options: string[]) {
  return current && !options.includes(current) ? [current, ...options] : options
}

function bytes(value: string) {
  const match = /^(\d+)(Mi|Gi)$/.exec(value)
  if (!match) return 0
  return Number(match[1]) * (match[2] === 'Gi' ? 1024 : 1)
}

function hasChanged(row: ResourceRow) {
  return row.currentValues.some(current => (
    row.memoryRequest !== current.memoryRequest
    || row.memoryLimit !== current.memoryLimit
  ))
}

function selectedMemory(row: ResourceRow) {
  return {
    memoryRequest: row.memoryRequest || row.defaults.memory_request,
    memoryLimit: row.memoryLimit || row.defaults.memory_limit,
  }
}

export function ResourceModal({ sessions, onClose }: Props) {
  const components = useMemo(() => selectedComponents(sessions), [sessions])
  const [rows, setRows] = useState<ResourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all(sessions.map(session => api.adminSessionResources(session.id)))
      .then(responses => {
        if (!active) return
        setRows(buildRows(responses, components, sessions.length > 1))
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load resources')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [components, sessions])

  function update(component: UpgradeComponent, change: Partial<ResourceRow>) {
    setRows(current => current.map(row => row.component === component
      ? { ...row, ...change }
      : row))
  }

  async function apply() {
    const changed = rows.filter(hasChanged)
    if (changed.length === 0) {
      setError('No resource changes to apply.')
      return
    }
    for (const row of changed) {
      const selected = selectedMemory(row)
      if (bytes(selected.memoryRequest) > bytes(selected.memoryLimit)) {
        setError(`${labels[row.component]} request cannot exceed its limit.`)
        return
      }
    }

    setApplying(true)
    setError('')
    try {
      const response = await api.adminApplySessionResources(
        sessions.map(session => session.id),
        changed.map(row => {
          const selected = selectedMemory(row)
          return {
            component: row.component,
            memory_request: selected.memoryRequest,
            memory_limit: selected.memoryLimit,
          }
        }),
      )
      const failures = response.results.filter(result => result.status !== 'applied')
      if (failures.length > 0) {
        setError(failures.map(result => `${result.session_id}/${result.component}: ${result.error}`).join('\n'))
        return
      }
      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply resources')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="p-overlay">
      <div className="p-dialog" style={{ maxWidth: 680 }}>
        <div className="dialog-header">
          <h3 className="dialog-title">Memory resources</h3>
          <p className="dialog-desc">
            {sessions.length === 1 ? sessions[0].id : `${sessions.length} selected sessions`}
          </p>
        </div>
        <div className="dialog-body">
          {loading ? <p className="p-muted">Loading current Deployment values…</p> : rows.map(row => (
            <div key={row.component} className="resource-card">
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontWeight: 600 }}>{labels[row.component]}</span>
              </div>
              <div className={`resource-fields${sessions.length === 1 ? ' with-default' : ''}`}>
                <label>
                  <span className="p-label">Memory request</span>
                  <Select
                    value={row.memoryRequest || undefined}
                    onValueChange={value => update(row.component, { memoryRequest: value })}
                  >
                    <SelectTrigger className="resource-select">
                      <SelectValue placeholder={row.defaults.memory_request} />
                    </SelectTrigger>
                    <SelectContent className="resource-select-content">
                      {optionValues(row.memoryRequest, requestOptions).map(value => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  <span className="p-label">Memory limit</span>
                  <Select
                    value={row.memoryLimit || undefined}
                    onValueChange={value => update(row.component, { memoryLimit: value })}
                  >
                    <SelectTrigger className="resource-select">
                      <SelectValue placeholder={row.defaults.memory_limit} />
                    </SelectTrigger>
                    <SelectContent className="resource-select-content">
                      {optionValues(row.memoryLimit, limitOptions).map(value => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {sessions.length === 1 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm resource-default"
                    onClick={() => update(row.component, {
                      memoryRequest: row.defaults.memory_request,
                      memoryLimit: row.defaults.memory_limit,
                    })}
                  >
                    Set to Default
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="p-alert alert-warning">
            <div className="grow">
              <p className="alert-title">Applying resources restarts each selected workload.</p>
              <p className="alert-desc">Changes are validated first, then rolled out one at a time and checked for readiness.</p>
            </div>
          </div>
          {error && <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)} disabled={applying}>Cancel</button>
          <button type="button" className="btn btn-default" onClick={apply} disabled={loading || applying || !rows.some(hasChanged)}>
            {applying ? 'Applying…' : 'Validate and apply'}
          </button>
        </div>
      </div>
    </div>
  )
}

function buildRows(
  responses: AdminSessionResources[],
  components: UpgradeComponent[],
  usesDefaultBaseline: boolean,
): ResourceRow[] {
  return components.map(component => {
    const resources = responses
      .map(response => response.resources.find(item => item.component === component))
      .filter(resource => resource !== undefined)
    const first = resources[0]
    if (!first) {
      throw new Error(`Missing ${component} resource data`)
    }
    const memoryRequest = usesDefaultBaseline
      ? first.defaults.memory_request
      : first.desired.memory_request
    const memoryLimit = usesDefaultBaseline
      ? first.defaults.memory_limit
      : first.desired.memory_limit
    return {
      component,
      memoryRequest,
      memoryLimit,
      currentValues: resources.map(resource => ({
        memoryRequest: resource.desired.memory_request,
        memoryLimit: resource.desired.memory_limit,
      })),
      defaults: first.defaults,
    }
  })
}
