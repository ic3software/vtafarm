import { useState, useEffect } from 'react'
import {
  api,
  type SetupSession,
  type SetupMode,
  type SessionUpgrade,
  type UpgradeComponent,
  type UpgradeTaskStatus,
} from '@/lib/api'
import { imageTag } from '@/lib/utils'

const componentLabels: Record<UpgradeComponent, string> = {
  vta: 'VTA',
  mediator: 'Mediator',
  dids: 'DID Hosting',
  vtc: 'VTC',
}

/** Components a session of this mode runs — mirrors the backend's UpgradeComponentModes. */
function modeComponents(mode: SetupMode): UpgradeComponent[] {
  if (mode === 'full_stack') return ['vta', 'mediator', 'dids']
  if (mode === 'full_stack_with_vtc') return ['vta', 'mediator', 'dids', 'vtc']
  return ['vta']
}

function currentImage(session: SetupSession, component: UpgradeComponent): string {
  if (component === 'vta') return session.vta_image ?? ''
  if (component === 'mediator') return session.mediator_image ?? ''
  if (component === 'dids') return session.dids_image ?? ''
  return session.vtc_image ?? ''
}

function taskBadge(status: UpgradeTaskStatus) {
  if (status === 'succeeded') return 'badge-success'
  if (status === 'failed') return 'badge-destructive'
  if (status === 'running') return 'badge-default'
  if (status === 'skipped') return 'badge-warning'
  return 'badge-secondary'
}

interface ImageOption {
  tag: string
  image: string
  latest?: boolean
}

interface ComponentRow {
  images: ImageOption[]
  unavailable?: string
}

/**
 * Change direction relative to the registry list (index 0 = newest).
 * Unknown when either image is no longer in the list.
 */
function direction(images: ImageOption[], from: string, to: string): 'upgrade' | 'downgrade' | 'change' {
  const fromIdx = images.findIndex(i => i.image === from)
  const toIdx = images.findIndex(i => i.image === to)
  if (fromIdx === -1 || toIdx === -1) return 'change'
  return toIdx < fromIdx ? 'upgrade' : 'downgrade'
}

const inFlight = (u: SessionUpgrade | null): u is SessionUpgrade => u?.status === 'running'

interface SessionVersionsCardProps {
  session: SetupSession
  /** Called when an upgrade reaches a terminal state, so the parent refetches the session's images. */
  onUpgraded: () => void
}

export function SessionVersionsCard({ session, onUpgraded }: SessionVersionsCardProps) {
  const components = modeComponents(session.mode)
  const [rows, setRows] = useState<Partial<Record<UpgradeComponent, ComponentRow>> | null>(null)
  const [selected, setSelected] = useState<Partial<Record<UpgradeComponent, string>>>({})
  const [upgrade, setUpgrade] = useState<SessionUpgrade | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Load each component's registry tag list once, and pick up an upgrade
  // already in flight (e.g. after a page reload).
  useEffect(() => {
    let stopped = false
    Promise.all(components.map(component =>
      api.listImages(component)
        .then(images => ({ component, images, error: '' }))
        .catch((err: unknown) => ({
          component, images: [] as ImageOption[],
          error: err instanceof Error ? err.message : 'unavailable',
        })),
    )).then(results => {
      if (stopped) return
      const next: Partial<Record<UpgradeComponent, ComponentRow>> = {}
      for (const r of results) next[r.component] = { images: r.images, unavailable: r.error || undefined }
      setRows(next)
    })
    api.getSessionUpgrade(session.id)
      .then(u => {
        if (stopped || u.status !== 'running') return
        setUpgrade(u)
        setShowResult(true)
      })
      .catch(() => {}) // 404 — never upgraded
    return () => { stopped = true }
    // components is derived from the session's mode, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  // Progress phase: poll until the upgrade reaches a terminal state.
  useEffect(() => {
    if (!inFlight(upgrade)) return
    let stopped = false
    const timer = setInterval(() => {
      api.getSessionUpgrade(session.id)
        .then(u => {
          if (stopped) return
          setUpgrade(u)
          if (u.status !== 'running') onUpgraded()
        })
        .catch(() => {})
    }, 3000)
    return () => { stopped = true; clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, upgrade?.status])

  const changes = components.flatMap(component => {
    const from = currentImage(session, component)
    const to = selected[component]
    return to && to !== from ? [{ component, from, to }] : []
  })

  function submit() {
    setBusy(true); setError('')
    api.createSessionUpgrade(session.id, changes.map(c => ({ component: c.component, image: c.to })))
      .then(u => {
        setUpgrade(u)
        setShowResult(true)
        setConfirming(false)
        setSelected({})
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Request failed'))
      .finally(() => setBusy(false))
  }

  function dismissResult() {
    setShowResult(false)
    setUpgrade(null)
    setSelected({})
    setError('')
  }

  const running = inFlight(upgrade)

  return (
    <div className="p-card">
      <div className="card-header with-action">
        <h3 className="card-title">Versions</h3>
        {running && (
          <span className="p-badge badge-default">
            <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 11, height: 11 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            updating
          </span>
        )}
      </div>
      <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
        {showResult && upgrade ? (
          <>
            {upgrade.tasks.map(t => (
              <div key={t.component} className="p-row between center" style={{ gap: 10 }}>
                <span className="p-muted text-sm" style={{ minWidth: 80 }}>{componentLabels[t.component]}</span>
                <span className="p-mono text-xs" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }} title={`${t.from_image} → ${t.to_image}`}>
                  {imageTag(t.from_image)} → {imageTag(t.to_image)}
                </span>
                <span className={`p-badge ${taskBadge(t.status)}`} title={t.error_msg || undefined}>{t.status}</span>
              </div>
            ))}
            {upgrade.status === 'paused' && (
              <p style={{ margin: 0, fontSize: 12, color: 'hsl(var(--destructive))' }}>
                Update stopped on a failure{(() => { const f = upgrade.tasks.find(t => t.status === 'failed' && t.error_msg); return f ? `: ${f.error_msg}` : '.' })()}
              </p>
            )}
            {upgrade.status === 'completed' && (
              <p style={{ margin: 0, fontSize: 12, color: 'hsl(var(--success))' }}>All components updated.</p>
            )}
            {!running && (
              <div>
                <button className="btn btn-outline btn-sm" onClick={dismissResult}>Done</button>
              </div>
            )}
          </>
        ) : rows === null ? (
          <p className="p-muted text-sm" style={{ margin: 0 }}>Loading versions…</p>
        ) : (
          <>
            {components.map(component => {
              const row = rows[component]
              const current = currentImage(session, component)
              // Keep the running image selectable even if the registry no
              // longer lists it — choosing it back just means "no change".
              const options = row && !row.unavailable
                ? (current && !row.images.some(i => i.image === current)
                    ? [{ tag: imageTag(current), image: current }, ...row.images]
                    : row.images)
                : []
              return (
                <div key={component} className="p-row between center" style={{ gap: 10 }}>
                  <span className="p-muted text-sm" style={{ minWidth: 80 }}>{componentLabels[component]}</span>
                  {!row || row.unavailable ? (
                    <span className="p-muted text-xs">{row?.unavailable ?? 'unavailable'}</span>
                  ) : (
                    <select
                      className="p-select p-mono"
                      style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                      value={selected[component] ?? current}
                      onChange={e => { setSelected(prev => ({ ...prev, [component]: e.target.value })); setError('') }}
                    >
                      {options.map(i => (
                        <option key={i.image} value={i.image}>
                          {i.tag}{i.latest ? ' (latest)' : ''}{i.image === current ? ' (current)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
            {error && <p style={{ margin: 0, fontSize: 12, color: 'hsl(var(--destructive))' }}>{error}</p>}
            <div className="p-row between center">
              <span className="field-hint" style={{ marginTop: 0 }}>Pick any version — newer or older.</span>
              <button className="btn btn-default btn-sm" disabled={changes.length === 0} onClick={() => setConfirming(true)}>
                Update
              </button>
            </div>
          </>
        )}
      </div>

      {/* Confirm overlay */}
      {confirming && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">Change versions?</h3>
              <p className="dialog-desc">
                Each component restarts on its new image — expect a short interruption while it rolls out.
              </p>
            </div>
            <div className="dialog-body">
              {changes.map(({ component, from, to }) => {
                const dir = direction(rows?.[component]?.images ?? [], from, to)
                return (
                  <div key={component} className="p-row center" style={{ gap: 10, fontSize: 13 }}>
                    <span style={{ minWidth: 90 }}>{componentLabels[component]}</span>
                    <span className={`p-badge ${dir === 'upgrade' ? 'badge-success' : dir === 'downgrade' ? 'badge-warning' : 'badge-secondary'}`}>
                      {dir}
                    </span>
                    <span className="p-mono" style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${from} → ${to}`}>
                      {imageTag(from)} → {imageTag(to)}
                    </span>
                  </div>
                )
              })}
              {error && <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-ghost" disabled={busy} onClick={() => { setConfirming(false); setError('') }}>Cancel</button>
              <button className="btn btn-default" disabled={busy || changes.length === 0} onClick={submit}>
                {busy
                  ? <><svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Starting…</>
                  : `Update ${changes.length} component${changes.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
