import { useEffect, useMemo, useState } from 'react'
import { api, type ImageOption, type SetupMode, type SetupStatus, type UpgradeComponent } from '@/lib/api'
import { imageLabel, imageTag } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { recoveryComponentsForSession } from './sessionRecovery'

const imageSelectContentStyle = { maxHeight: 'min(18rem, var(--radix-select-content-available-height))' }

const componentLabels: Record<UpgradeComponent, string> = {
  vta: 'VTA',
  mediator: 'Mediator',
  dids: 'DID Hosting',
  vtc: 'VTC',
  'trust-registry': 'Trust Registry',
}

interface RecoverySession {
  id: string
  mode: SetupMode
  failed_stage?: SetupStatus
  vta_image?: string
  mediator_image?: string
  dids_image?: string
  vtc_image?: string
}

interface ComponentRow {
  images: ImageOption[]
  selected: string
}

function currentImage(session: RecoverySession, component: UpgradeComponent) {
  if (component === 'vta') return session.vta_image ?? ''
  if (component === 'mediator') return session.mediator_image ?? ''
  if (component === 'dids') return session.dids_image ?? ''
  return session.vtc_image ?? ''
}

interface Props {
  session: RecoverySession
  admin?: boolean
  onClose: (started: boolean) => void
}

export function SessionRecoveryModal({ session, admin = false, onClose }: Props) {
  const components = useMemo(
    () => recoveryComponentsForSession(session.mode, session.failed_stage),
    [session.failed_stage, session.mode],
  )
  const [rows, setRows] = useState<Partial<Record<UpgradeComponent, ComponentRow>>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (components.length === 0) return
    let active = true
    Promise.all(components.map(component => {
      const request = admin ? api.adminListImages(component) : api.listImages(component)
      return request
        .then(images => ({ component, images, error: '' }))
        .catch((err: unknown) => ({
          component,
          images: [] as ImageOption[],
          error: err instanceof Error ? err.message : 'Failed to load images',
        }))
    })).then(results => {
      if (!active) return
      const next: Partial<Record<UpgradeComponent, ComponentRow>> = {}
      const failures: string[] = []
      for (const result of results) {
        if (result.error) {
          failures.push(`${componentLabels[result.component]}: ${result.error}`)
          continue
        }
        const current = currentImage(session, result.component)
        const selected = current || result.images[0]?.image || ''
        next[result.component] = { images: result.images, selected }
      }
      setRows(next)
      if (failures.length > 0) setError(failures.join(' · '))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [admin, components, session])

  function selectImage(component: UpgradeComponent, image: string) {
    setRows(current => {
      const row = current[component]
      return row ? { ...current, [component]: { ...row, selected: image } } : current
    })
  }

  async function submit() {
    const selected = components.flatMap(component => {
      const image = rows[component]?.selected
      return image ? [{ component, image }] : []
    })
    if (selected.length !== components.length) return
    setBusy(true)
    setError('')
    try {
      if (admin) await api.adminRecoverSession(session.id, selected)
      else await api.recoverSession(session.id, selected)
      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recovery')
      setBusy(false)
    }
  }

  if (components.length === 0) return null
  const ready = !loading && components.every(component => !!rows[component]?.selected)

  return (
    <div className="p-overlay">
      <div className="p-dialog" style={{ maxWidth: 620 }} role="dialog" aria-modal="true" aria-labelledby="recovery-title">
        <div className="dialog-header">
          <h3 className="dialog-title" id="recovery-title">
            Recover failed {session.mode === 'full_stack' ? 'full stack' : 'VTA'}
          </h3>
        </div>
        <div className="dialog-body">
          <div className="p-alert alert-warning" style={{ marginBottom: 16 }}>
            <div className="grow">
              <p className="alert-title">Persistent data is kept</p>
              <p className="alert-desc">
                Existing deployments are reconciled to these images, and later components use your selections. PVC data is preserved and completed setup jobs are not repeated.
              </p>
            </div>
          </div>
          {loading ? (
            <div className="p-col gap-12">
              {components.map(component => (
                <div key={component} className="p-row between center" style={{ gap: 10 }}>
                  <span className="p-muted text-sm" style={{ minWidth: 80 }}>{componentLabels[component]}</span>
                  <input className="p-input p-mono" style={{ fontSize: 12, flex: 1, minWidth: 0 }} placeholder="Loading versions…" disabled />
                </div>
              ))}
            </div>
          ) : components.map(component => {
            const row = rows[component]
            const current = currentImage(session, component)
            const options = row
              ? (current && !row.images.some(image => image.image === current)
                  ? [{ tag: imageTag(current), image: current }, ...row.images]
                  : row.images)
              : []
            return (
              <div key={component} className="p-row between center" style={{ gap: 10, marginBottom: 12 }}>
                <span className="p-muted text-sm" style={{ minWidth: 80 }}>{componentLabels[component]}</span>
                {!row || options.length === 0 ? (
                  <span className="p-muted text-xs">No images available</span>
                ) : (
                  <Select value={row.selected} disabled={busy} onValueChange={image => selectImage(component, image)}>
                    <SelectTrigger className="w-full p-mono" id={`recovery-image-${component}`}
                      aria-label={`${componentLabels[component]} version`}
                      style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start"
                      className="z-[110] w-(--radix-select-trigger-width)" style={imageSelectContentStyle}>
                      {options.map(image => (
                        <SelectItem key={image.image} value={image.image} className="p-mono">
                          {imageLabel(image)}{image.image === current ? ' (current)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )
          })}
          {error && <p style={{ margin: '12px 0 0', fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-ghost" disabled={busy} onClick={() => onClose(false)}>Cancel</button>
          <button className="btn btn-default" disabled={busy || !ready} onClick={submit}>
            {busy ? 'Starting…' : 'Recover and continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
