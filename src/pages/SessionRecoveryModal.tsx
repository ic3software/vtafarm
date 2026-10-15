import { useEffect, useState } from 'react'
import { api, type ImageOption, type SetupStatus, type UpgradeComponent } from '@/lib/api'
import { imageLabel, imageTag } from '@/lib/utils'
import { recoveryComponentForStage } from './sessionRecovery'

const componentLabels: Record<UpgradeComponent, string> = {
  vta: 'VTA',
  mediator: 'Mediator',
  dids: 'DID Hosting',
  vtc: 'VTC',
}

interface RecoverySession {
  id: string
  failed_stage?: SetupStatus
  vta_image?: string
  mediator_image?: string
  dids_image?: string
  vtc_image?: string
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
  const component = recoveryComponentForStage(session.failed_stage)
  const current = component ? currentImage(session, component) : ''
  const [images, setImages] = useState<ImageOption[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!component) return
    let active = true
    const request = admin ? api.adminListImages(component) : api.listImages(component)
    request
      .then(options => {
        if (!active) return
        setImages(options)
        setSelected(options.find(option => option.image !== current)?.image ?? options[0]?.image ?? '')
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load images')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [admin, component, current])

  async function submit() {
    if (!component || !selected) return
    setBusy(true)
    setError('')
    try {
      if (admin) await api.adminRecoverSession(session.id, component, selected)
      else await api.recoverSession(session.id, component, selected)
      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recovery')
      setBusy(false)
    }
  }

  if (!component) return null

  return (
    <div className="p-overlay">
      <div className="p-dialog" style={{ maxWidth: 620 }} role="dialog" aria-modal="true" aria-labelledby="recovery-title">
        <div className="dialog-header">
          <h3 className="dialog-title" id="recovery-title">Recover failed {componentLabels[component]}</h3>
          <p className="dialog-desc">
            Retry <span className="p-mono">{session.failed_stage}</span> with a selected image, then continue from the next setup step.
          </p>
        </div>
        <div className="dialog-body">
          <div className="p-alert alert-warning" style={{ marginBottom: 16 }}>
            <div className="grow">
              <p className="alert-title">Persistent data is kept</p>
              <p className="alert-desc">This replaces only the failed component image. It does not roll back its PVC data or repeat completed setup jobs.</p>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="p-label">Current image</label>
            <div className="p-mono text-sm" title={current}>{current ? imageTag(current) : 'Unknown'}</div>
          </div>
          <div>
            <label className="p-label" htmlFor="recovery-image">Image to retry</label>
            <select
              id="recovery-image"
              className="p-select p-mono"
              value={selected}
              disabled={loading || busy || images.length === 0}
              onChange={event => setSelected(event.target.value)}
            >
              {loading && <option value="">Loading images…</option>}
              {!loading && images.length === 0 && <option value="">No images available</option>}
              {images.map(image => <option key={image.image} value={image.image}>{imageLabel(image)}</option>)}
            </select>
          </div>
          {selected === current && selected && (
            <p className="p-muted text-xs" style={{ marginTop: 8 }}>The same image will be retried. Choose another version if this build is broken.</p>
          )}
          {error && <p style={{ margin: '12px 0 0', fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-ghost" disabled={busy} onClick={() => onClose(false)}>Cancel</button>
          <button className="btn btn-default" disabled={busy || loading || !selected} onClick={submit}>
            {busy ? 'Starting…' : 'Recover and continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
