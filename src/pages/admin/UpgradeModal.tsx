import { useState, useEffect, useCallback } from 'react'
import {
  api,
  type UpgradeComponent,
  type UpgradeBatchDetail,
  type UpgradeTarget,
  type UpgradeSkipped,
  type UpgradeTaskStatus,
} from '@/lib/api'
import { imageTag } from '@/lib/utils'

const componentLabels: Record<UpgradeComponent, string> = {
  vta: 'VTA',
  mediator: 'Mediator',
  dids: 'DID Hosting',
  vtc: 'VTC',
}

function taskBadge(status: UpgradeTaskStatus) {
  if (status === 'succeeded') return 'badge-success'
  if (status === 'failed') return 'badge-destructive'
  if (status === 'running') return 'badge-default'
  if (status === 'skipped') return 'badge-warning'
  return 'badge-secondary'
}

function batchBadge(status: string) {
  if (status === 'completed') return 'badge-success'
  if (status === 'paused') return 'badge-warning'
  if (status === 'cancelled') return 'badge-destructive'
  return 'badge-default'
}

interface UpgradeModalProps {
  /** Session unique_ids to upgrade, or 'all' for every eligible session. */
  selection: string[] | 'all'
  /** Open straight into the progress view of an existing batch. */
  batchId?: number
  /** didUpgrade: whether a batch ran (parent should refresh its list). */
  onClose: (didUpgrade: boolean) => void
}

export function UpgradeModal({ selection, batchId: initialBatchId, onClose }: UpgradeModalProps) {
  const [component, setComponent] = useState<UpgradeComponent>('vta')
  const [images, setImages] = useState<Array<{ tag: string; image: string; latest?: boolean }>>([])
  const [image, setImage] = useState('')
  const [preview, setPreview] = useState<{ targets: UpgradeTarget[]; skipped: UpgradeSkipped[] } | null>(null)
  const [batchId, setBatchId] = useState<number | null>(initialBatchId ?? null)
  const [batch, setBatch] = useState<UpgradeBatchDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Configure phase: load the component's tag list, defaulting to latest.
  // Stale state from a previous component is reset in the select's onChange.
  useEffect(() => {
    if (batchId !== null) return
    api.adminListImages(component)
      .then(list => {
        setImages(list)
        const latest = list.find(i => i.latest) ?? list[0]
        if (latest) setImage(latest.image)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load images'))
  }, [component, batchId])

  // Progress phase: poll the batch until it reaches a terminal state.
  useEffect(() => {
    if (batchId === null) return
    let stopped = false
    const load = () => {
      api.getUpgrade(batchId)
        .then(b => { if (!stopped) setBatch(b) })
        .catch(err => { if (!stopped) setError(err instanceof Error ? err.message : 'Failed to load batch') })
    }
    load()
    const timer = setInterval(() => {
      load()
    }, 3000)
    return () => { stopped = true; clearInterval(timer) }
  }, [batchId])

  const runPreview = useCallback(() => {
    setBusy(true); setError('')
    api.createUpgrade({
      component, image, dry_run: true,
      ...(selection === 'all' ? { all: true } : { session_ids: selection }),
    })
      .then(res => setPreview({ targets: res.targets, skipped: res.skipped }))
      .catch(err => setError(err instanceof Error ? err.message : 'Preview failed'))
      .finally(() => setBusy(false))
  }, [component, image, selection])

  const startUpgrade = useCallback(() => {
    setBusy(true); setError('')
    api.createUpgrade({
      component, image,
      ...(selection === 'all' ? { all: true } : { session_ids: selection }),
    })
      .then(res => { if (res.id) setBatchId(res.id) })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to start upgrade'))
      .finally(() => setBusy(false))
  }, [component, image, selection])

  function act(fn: (id: number) => Promise<unknown>) {
    if (batchId === null) return
    setBusy(true); setError('')
    fn(batchId)
      .then(() => api.getUpgrade(batchId).then(setBatch))
      .catch(err => setError(err instanceof Error ? err.message : 'Request failed'))
      .finally(() => setBusy(false))
  }

  const terminal = batch?.status === 'completed' || batch?.status === 'cancelled'
  const didUpgrade = batchId !== null

  return (
    <div className="p-overlay">
      <div className="p-dialog" style={{ maxWidth: 600 }}>
        {batchId === null ? (
          <>
            <div className="dialog-header">
              <h3 className="dialog-title">Upgrade sessions</h3>
              <p className="dialog-desc">
                {selection === 'all'
                  ? 'Roll a new image out to every eligible running session.'
                  : `Roll a new image out to ${selection.length} selected session${selection.length === 1 ? '' : 's'}.`}
                {' '}Sessions are upgraded a few at a time; the batch pauses on the first failure.
              </p>
            </div>
            <div className="dialog-body">
              <div>
                <label className="p-label">Component</label>
                <select className="p-select" value={component}
                  onChange={e => {
                    setComponent(e.target.value as UpgradeComponent)
                    setImages([]); setImage(''); setPreview(null); setError('')
                  }}>
                  {(Object.keys(componentLabels) as UpgradeComponent[]).map(c => (
                    <option key={c} value={c}>{componentLabels[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="p-label">Target image</label>
                <select className="p-select p-mono" style={{ fontSize: 12 }} value={image}
                  onChange={e => { setImage(e.target.value); setPreview(null) }}>
                  {images.map(i => (
                    <option key={i.image} value={i.image}>
                      {i.tag}{i.latest ? ' (latest)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {preview && (
                <div style={{ fontSize: 13 }}>
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>{preview.targets.length}</strong> session{preview.targets.length === 1 ? '' : 's'} will be
                    upgraded to <span className="p-mono">{imageTag(image)}</span>
                    {preview.skipped.length > 0 && <> · {preview.skipped.length} skipped</>}
                  </p>
                  {preview.skipped.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'hsl(var(--muted-foreground))' }}>
                      {preview.skipped.map(s => (
                        <li key={s.session_id}><span className="p-mono">{s.session_id}</span> — {s.reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {error && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-outline" type="button" disabled={busy} onClick={() => onClose(false)}>
                Cancel
              </button>
              {preview === null ? (
                <button className="btn btn-default" type="button" disabled={busy || !image} onClick={runPreview}>
                  {busy ? 'Checking…' : 'Preview'}
                </button>
              ) : (
                <button className="btn btn-default" type="button"
                  disabled={busy || preview.targets.length === 0} onClick={startUpgrade}>
                  {busy ? 'Starting…' : `Upgrade ${preview.targets.length} session${preview.targets.length === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="dialog-header">
              <div className="p-row gap-8" style={{ alignItems: 'center' }}>
                <h3 className="dialog-title" style={{ marginBottom: 0 }}>Upgrade batch #{batchId}</h3>
                {batch && <span className={`p-badge ${batchBadge(batch.status)}`}>{batch.status}</span>}
              </div>
              {batch && (
                <p className="dialog-desc" style={{ marginTop: 4 }}>
                  {componentLabels[batch.component]} → <span className="p-mono">{imageTag(batch.image)}</span>
                  {batch.status === 'paused' && ' — paused after a failure. Resume to continue with the remaining sessions, or cancel the batch.'}
                </p>
              )}
            </div>
            <div className="dialog-body" style={{ maxHeight: 360, overflowY: 'auto' }}>
              {batch === null ? (
                <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Loading…</p>
              ) : batch.tasks.map((t, i) => (
                <div key={t.session_id || i} className="p-row" style={{ alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span className="p-mono" style={{ fontSize: 12, minWidth: 70 }}>{t.session_id || '(deleted)'}</span>
                  <span style={{ color: 'hsl(var(--muted-foreground))', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.vta_name}
                    <span className="p-mono" style={{ fontSize: 11.5 }}> {imageTag(t.from_image)} → {imageTag(batch.image)}</span>
                  </span>
                  <span className={`p-badge ${taskBadge(t.status)}`} title={t.error_msg || undefined}>{t.status}</span>
                </div>
              ))}
              {batch?.tasks.some(t => t.status === 'failed' && t.error_msg) && (
                <div style={{ fontSize: 12, color: 'hsl(var(--destructive))' }}>
                  {batch.tasks.filter(t => t.status === 'failed' && t.error_msg).map((t, i) => (
                    <p key={t.session_id || i} style={{ margin: '2px 0' }}>
                      <span className="p-mono">{t.session_id}</span>: {t.error_msg}
                    </p>
                  ))}
                </div>
              )}
              {error && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
            </div>
            <div className="dialog-footer">
              {batch?.status === 'paused' && (
                <button className="btn btn-outline" type="button" disabled={busy} onClick={() => act(api.resumeUpgrade)}>
                  Resume
                </button>
              )}
              {(batch?.status === 'running' || batch?.status === 'paused') && (
                <button className="btn btn-outline" type="button" disabled={busy} onClick={() => act(api.cancelUpgrade)}>
                  Cancel batch
                </button>
              )}
              <button className="btn btn-default" type="button" onClick={() => onClose(didUpgrade)}>
                {terminal ? 'Done' : 'Close'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
