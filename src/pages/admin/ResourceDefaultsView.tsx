import { useEffect, useState } from 'react'
import { memoryMi, memoryOptions } from '@/lib/resourceMemory'
import { api, type ResourceDefaults, type UpgradeComponent } from '@/lib/api'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const components: Array<{ key: UpgradeComponent; label: string }> = [
  { key: 'mediator', label: 'Mediator' },
  { key: 'vtc', label: 'VTC' },
  { key: 'vta', label: 'VTA' },
  { key: 'dids', label: 'DID Hosting' },
]
const memoryFields = ['memory_request', 'memory_limit'] as const

export function ResourceDefaultsView() {
  const [saved, setSaved] = useState<ResourceDefaults | null>(null)
  const [draft, setDraft] = useState<ResourceDefaults['resources'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<'saved' | 'restored' | ''>('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    api.adminResourceDefaults().then(data => {
      if (!active) return
      setSaved(data)
      setDraft(data.resources)
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Failed to load resource defaults')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])

  const changed = !!draft && !!saved && components.some(({ key }) =>
    memoryFields.some(field => draft[key][field] !== saved.resources[key][field]),
  )

  async function save() {
    if (!draft) return
    setError('')
    setNotice('')
    for (const { key, label } of components) {
      const request = memoryMi(draft[key].memory_request)
      const limit = memoryMi(draft[key].memory_limit)
      if (!Number.isFinite(request) || !Number.isFinite(limit) || request < 16 || limit > 1024 || request > limit) {
        setError(`${label}: request and limit must be between 16Mi and 1Gi, with request ≤ limit.`)
        return
      }
    }
    setSaving(true)
    try {
      const data = await api.adminSaveResourceDefaults(components.map(({ key }) => ({
        component: key,
        memory_request: draft[key].memory_request,
        memory_limit: draft[key].memory_limit,
      })))
      setSaved(data)
      setDraft(data.resources)
      setNotice('saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save resource defaults')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Resource defaults</h1>
        </div>
      </div>
      {error && <div className="p-alert alert-destructive" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
      {notice && (
        <div className={`p-alert ${notice === 'saved' ? 'alert-success' : 'alert-info'}`} role="status" style={{ marginBottom: 16 }}>
          <div className="grow">
            <p className="alert-title">{notice === 'saved' ? 'Defaults saved' : 'Factory defaults restored in the form'}</p>
            <p className="alert-desc">{notice === 'saved' ? 'New deployments and capacity estimates will use these values.' : 'Save to apply them.'}</p>
          </div>
        </div>
      )}
      {loading ? <p className="p-muted" role="status">Loading defaults…</p> : !draft || !saved ? (
        <button className="btn btn-outline" onClick={() => { setError(''); setLoading(true); setReload(value => value + 1) }}>Retry</button>
      ) : (
        <>
          <div className="table-wrap">
            <table className="p-table">
              <thead><tr><th>Component</th><th>Memory request</th><th>Memory limit</th></tr></thead>
              <tbody>
                {components.map(({ key, label }) => (
                  <tr key={key}>
                    <td>{label}</td>
                    {memoryFields.map(field => {
                      const current = draft[key][field]
                      const values = memoryOptions.includes(current) ? memoryOptions : [current, ...memoryOptions]
                      return (
                        <td key={field}>
                          <Select value={current} disabled={saving} onValueChange={value => {
                            setDraft(prev => prev && ({ ...prev, [key]: { ...prev[key], [field]: value } }))
                            setNotice('')
                            setError('')
                          }}>
                            <SelectTrigger aria-label={`${label} memory ${field === 'memory_request' ? 'request' : 'limit'}`} className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>{values.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr>
                  <td><strong>Fullstack total</strong></td>
                  {memoryFields.map(field => (
                    <td key={field}><strong>{components.reduce((sum, { key }) => sum + memoryMi(draft[key][field]), 0)}Mi</strong></td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <button className="btn btn-default" disabled={saving || !changed} onClick={save}>{saving ? 'Saving…' : 'Save defaults'}</button>
            <button className="btn btn-outline" disabled={saving} onClick={() => {
              setDraft(saved.factory_defaults)
              setError('')
              setNotice('restored')
            }}>Restore factory defaults</button>
          </div>
        </>
      )}
    </section>
  )
}
