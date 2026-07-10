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

const ALL_COMPONENTS: UpgradeComponent[] = ['vta', 'mediator', 'dids', 'vtc']

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

interface ComponentRow {
  images: Array<{ tag: string; image: string; latest?: boolean }>
  image: string // selected target
  include: boolean
  unavailable?: string // registry not configured / fetch failed
}

interface UpgradeModalProps {
  /** Session unique_ids to upgrade, or 'all' for every eligible session. */
  selection: string[] | 'all'
  /** Components pre-checked in the configure step. */
  defaultComponents?: UpgradeComponent[]
  /** Open straight into the progress view of an existing batch. */
  batchId?: number
  /** didUpgrade: whether a batch ran (parent should refresh its list). */
  onClose: (didUpgrade: boolean) => void
}

export function UpgradeModal({ selection, defaultComponents = ['vta'], batchId: initialBatchId, onClose }: UpgradeModalProps) {
  const [rows, setRows] = useState<Record<UpgradeComponent, ComponentRow> | null>(null)
  const [preview, setPreview] = useState<{ targets: UpgradeTarget[]; skipped: UpgradeSkipped[] } | null>(null)
  const [batchId, setBatchId] = useState<number | null>(initialBatchId ?? null)
  const [batch, setBatch] = useState<UpgradeBatchDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Configure phase: load every component's tag list once, default to latest.
  useEffect(() => {
    if (batchId !== null) return
    let stopped = false
    Promise.all(ALL_COMPONENTS.map(component =>
      api.adminListImages(component)
        .then(images => ({ component, images, error: '' }))
        .catch((err: unknown) => ({
          component, images: [] as ComponentRow['images'],
          error: err instanceof Error ? err.message : 'unavailable',
        })),
    )).then(results => {
      if (stopped) return
      const next = {} as Record<UpgradeComponent, ComponentRow>
      for (const r of results) {
        const latest = r.images.find(i => i.latest) ?? r.images[0]
        next[r.component] = {
          images: r.images,
          image: latest?.image ?? '',
          include: defaultComponents.includes(r.component) && !r.error && r.images.length > 0,
          unavailable: r.error || undefined,
        }
      }
      setRows(next)
    })
    return () => { stopped = true }
    // defaultComponents is stable for the modal's lifetime — load once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId])

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

  const chosen = rows
    ? ALL_COMPONENTS.filter(c => rows[c].include && rows[c].image)
        .map(c => ({ component: c, image: rows[c].image }))
    : []

  const submit = useCallback((dryRun: boolean) => {
    setBusy(true); setError('')
    api.createUpgrade({
      components: chosen,
      dry_run: dryRun || undefined,
      ...(selection === 'all' ? { all: true } : { session_ids: selection }),
    })
      .then(res => {
        if (dryRun) setPreview({ targets: res.targets, skipped: res.skipped })
        else if (res.id) setBatchId(res.id)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Request failed'))
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selection])

  function act(fn: (id: number) => Promise<unknown>) {
    if (batchId === null) return
    setBusy(true); setError('')
    fn(batchId)
      .then(() => api.getUpgrade(batchId).then(setBatch))
      .catch(err => setError(err instanceof Error ? err.message : 'Request failed'))
      .finally(() => setBusy(false))
  }

  function updateRow(component: UpgradeComponent, patch: Partial<ComponentRow>) {
    setRows(prev => prev ? { ...prev, [component]: { ...prev[component], ...patch } } : prev)
    setPreview(null)
    setError('')
  }

  const terminal = batch?.status === 'completed' || batch?.status === 'cancelled'
  const didUpgrade = batchId !== null

  return (
    <div className="p-overlay">
      <div className="p-dialog" style={{ maxWidth: 620 }}>
        {batchId === null ? (
          <>
            <div className="dialog-header">
              <h3 className="dialog-title">Upgrade sessions</h3>
              <p className="dialog-desc">
                {selection === 'all'
                  ? 'Roll new images out to every eligible running session.'
                  : `Roll new images out to ${selection.length} selected session${selection.length === 1 ? '' : 's'}.`}
                {' '}Pick the components to upgrade — sessions are upgraded one task at a time, and the batch pauses on the first failure.
              </p>
            </div>
            <div className="dialog-body">
              {rows === null ? (
                <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Loading image lists…</p>
              ) : ALL_COMPONENTS.map(component => {
                const row = rows[component]
                return (
                  <div key={component} className="p-row" style={{ alignItems: 'center', gap: 10 }}>
                    <label className="p-row" style={{ alignItems: 'center', gap: 8, minWidth: 130, fontSize: 13, cursor: row.unavailable ? 'not-allowed' : 'pointer' }}>
                      <input type="checkbox" checked={row.include} disabled={!!row.unavailable}
                        onChange={e => updateRow(component, { include: e.target.checked })} />
                      {componentLabels[component]}
                    </label>
                    {row.unavailable ? (
                      <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{row.unavailable}</span>
                    ) : (
                      <select className="p-select p-mono" style={{ fontSize: 12, flex: 1 }} value={row.image}
                        disabled={!row.include}
                        onChange={e => updateRow(component, { image: e.target.value })}>
                        {row.images.map(i => (
                          <option key={i.image} value={i.image}>
                            {i.tag}{i.latest ? ' (latest)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}

              {preview && (
                <div style={{ fontSize: 13 }}>
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>{preview.targets.length}</strong> upgrade task{preview.targets.length === 1 ? '' : 's'} will run
                    {preview.skipped.length > 0 && <> · {preview.skipped.length} skipped</>}
                  </p>
                  {preview.skipped.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'hsl(var(--muted-foreground))' }}>
                      {preview.skipped.map((s, i) => (
                        <li key={i}>
                          <span className="p-mono">{s.session_id}</span>
                          {s.component && <> ({s.component})</>} — {s.reason}
                        </li>
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
                <button className="btn btn-default" type="button" disabled={busy || chosen.length === 0} onClick={() => submit(true)}>
                  {busy ? 'Checking…' : 'Preview'}
                </button>
              ) : (
                <button className="btn btn-default" type="button"
                  disabled={busy || preview.targets.length === 0} onClick={() => submit(false)}>
                  {busy ? 'Starting…' : `Run ${preview.targets.length} upgrade${preview.targets.length === 1 ? '' : 's'}`}
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
                  Components: {batch.components.map(c => componentLabels[c]).join(', ')}
                  {batch.status === 'paused' && ' — paused after a failure. Resume to continue with the remaining tasks, or cancel the batch.'}
                </p>
              )}
            </div>
            <div className="dialog-body" style={{ maxHeight: 360, overflowY: 'auto' }}>
              {batch === null ? (
                <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Loading…</p>
              ) : batch.tasks.map((t, i) => (
                <div key={`${t.session_id}-${t.component}-${i}`} className="p-row" style={{ alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span className="p-mono" style={{ fontSize: 12, minWidth: 70 }}>{t.session_id || '(deleted)'}</span>
                  <span className="p-badge badge-secondary">{t.component}</span>
                  <span style={{ color: 'hsl(var(--muted-foreground))', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.vta_name}
                    <span className="p-mono" style={{ fontSize: 11.5 }}> {imageTag(t.from_image)} → {imageTag(t.to_image)}</span>
                  </span>
                  <span className={`p-badge ${taskBadge(t.status)}`} title={t.error_msg || undefined}>{t.status}</span>
                </div>
              ))}
              {batch?.tasks.some(t => t.status === 'failed' && t.error_msg) && (
                <div style={{ fontSize: 12, color: 'hsl(var(--destructive))' }}>
                  {batch.tasks.filter(t => t.status === 'failed' && t.error_msg).map((t, i) => (
                    <p key={i} style={{ margin: '2px 0' }}>
                      <span className="p-mono">{t.session_id}</span> ({t.component}): {t.error_msg}
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
