import { useState, useEffect, useCallback } from 'react'
import { api, ALL_COMPONENTS, type AdminSessionsPage, type AdminSetupSession, type UpgradeBatchSummary, type UpgradeComponent } from '@/lib/api'
import { UpgradeModal } from './UpgradeModal'
import { imageTag, pageNumbers } from '@/lib/utils'

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: browserTz })
}

function statusBadge(status: string) {
  if (status === 'running') return 'badge-success'
  if (status === 'failed') return 'badge-destructive'
  if (status === 'awaiting_admin_did') return 'badge-warning'
  return 'badge-secondary'
}

const modeLabels: Record<string, string> = {
  vta_only: 'VTA only',
  full_stack: 'Full stack',
}

// Where the session's hostnames come from. `managed` is the default and by far
// the common case, so it stays visually quiet; the other two are worth noticing.
const domainBadge: Record<string, string> = {
  managed: 'badge-secondary',
  custom: 'badge-default',
  platform: 'badge-warning',
}

const modeComponents: Record<string, UpgradeComponent[]> = {
  vta_only: ['vta'],
  full_stack: ['vta', 'mediator', 'dids', 'vtc'],
}

function componentImages(s: AdminSetupSession): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  if (s.vta_image) rows.push(['vta', s.vta_image])
  if (s.mediator_image) rows.push(['mediator', s.mediator_image])
  if (s.dids_image) rows.push(['dids', s.dids_image])
  if (s.vtc_image) rows.push(['vtc', s.vtc_image])
  return rows
}

function isPlatform(s: AdminSetupSession) {
  return s.domain_type === 'platform'
}

// What the admin has to type to enable the delete button — the session's name,
// for every session. The platform stack used to be the exception, asking for
// its label while everything else asked for an opaque 8-char id; now that the
// name IS the identifier, the two are the same value and the exception is gone.
function confirmWord(s: AdminSetupSession) {
  return s.vta_name
}

type ModalState =
  | { kind: 'create'; selection: string[] | 'all'; defaultComponents: UpgradeComponent[] }
  | { kind: 'progress'; batchId: number }
  | null

export function SessionsView() {
  const [sessions, setSessions] = useState<AdminSetupSession[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  // vta_name → mode, so the upgrade modal can pre-check the right components
  const [selected, setSelected] = useState<Map<string, string>>(new Map())
  const [modal, setModal] = useState<ModalState>(null)
  const [activeBatch, setActiveBatch] = useState<UpgradeBatchSummary | null>(null)
  // null = all modes; filtering happens server-side (the list is paginated).
  const [modeFilter, setModeFilter] = useState<string | null>(null)
  const [counts, setCounts] = useState<AdminSessionsPage['counts'] | null>(null)
  // Delete is irreversible and reaches another user's session, so it's gated
  // behind a dialog that requires typing the session's name.
  const [deleteTarget, setDeleteTarget] = useState<AdminSetupSession | null>(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchPage = useCallback((p: number) => (
    api.adminListSessions(p, modeFilter ?? undefined)
      .then(res => {
        setSessions(res.items); setTotal(res.total); setPage(res.page)
        setPageSize(res.page_size); setCounts(res.counts)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  ), [modeFilter])

  // Surface a batch that is still running/paused (e.g. started in a previous
  // visit) so the admin can get back to its progress view.
  const refreshActiveBatch = useCallback(() => (
    api.listUpgrades()
      .then(batches => {
        const active = batches.find(b => b.status === 'running' || b.status === 'paused')
        setActiveBatch(active ?? null)
      })
      .catch(() => {})
  ), [])

  // loading starts true, so the initial fetch needs no synchronous setState
  // here. Re-runs on filter change (fetchPage's identity tracks modeFilter);
  // toggleModeFilter sets loading before that happens.
  useEffect(() => { void fetchPage(1); void refreshActiveBatch() }, [fetchPage, refreshActiveBatch])

  function loadPage(p: number) {
    setLoading(true)
    void fetchPage(p)
  }

  function setFilter(mode: string | null) {
    if (mode === modeFilter) return
    setLoading(true)
    setModeFilter(mode)
  }

  function closeModal(didUpgrade: boolean) {
    setModal(null)
    void refreshActiveBatch()
    if (didUpgrade) {
      setSelected(new Map())
      setLoading(true)
      void fetchPage(page)
    }
  }

  function askDelete(s: AdminSetupSession) {
    setDeleteTarget(s)
    setDeleteInput('')
    setDeleteError('')
  }

  async function handleDelete() {
    if (!deleteTarget || deleteInput !== confirmWord(deleteTarget)) return
    const { vta_name } = deleteTarget
    setDeleting(true)
    setDeleteError('')
    try {
      // The platform stack's confirm word is its label, and the API requires it
      // in the body — this input is what makes the request valid, not just a
      // client-side speed bump.
      await api.adminDeleteSession(vta_name, isPlatform(deleteTarget) ? deleteTarget.vta_name : undefined)
      setSelected(prev => {
        if (!prev.has(vta_name)) return prev
        const next = new Map(prev)
        next.delete(vta_name)
        return next
      })
      setDeleteTarget(null)
      // Deleting the only row on a page past the first leaves it empty.
      loadPage(sessions.length === 1 && page > 1 ? page - 1 : page)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete session')
    } finally {
      setDeleting(false)
    }
  }

  function toggleSelected(s: AdminSetupSession) {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(s.vta_name)) next.delete(s.vta_name)
      else next.set(s.vta_name, s.mode)
      return next
    })
  }

  const eligibleOnPage = sessions.filter(s => s.status === 'running')
  const allPageSelected = eligibleOnPage.length > 0 && eligibleOnPage.every(s => selected.has(s.vta_name))

  function togglePageSelection() {
    setSelected(prev => {
      const next = new Map(prev)
      if (allPageSelected) eligibleOnPage.forEach(s => next.delete(s.vta_name))
      else eligibleOnPage.forEach(s => next.set(s.vta_name, s.mode))
      return next
    })
  }

  // Union of the selected sessions' components — pre-checked in the modal.
  function selectedComponents(): UpgradeComponent[] {
    const set = new Set<UpgradeComponent>()
    for (const mode of selected.values()) {
      for (const c of modeComponents[mode] ?? ['vta']) set.add(c)
    }
    return set.size > 0 ? [...set] : ['vta']
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Sessions</h1>
          <p className="sub">All users' VTA setup sessions, newest first. Select running sessions to upgrade their images.</p>
        </div>
        <button className="btn btn-outline btn-sm"
          onClick={() => setModal({ kind: 'create', selection: 'all', defaultComponents: ALL_COMPONENTS })}>
          Upgrade all
        </button>
      </div>

      <div className="p-row" style={{ gap: 8, marginBottom: 14 }}>
        <button
          className={`btn btn-sm ${modeFilter === null ? 'btn-default' : 'btn-outline'}`}
          aria-pressed={modeFilter === null}
          onClick={() => setFilter(null)}>
          All{counts ? ` (${counts.all})` : ''}
        </button>
        {Object.entries(modeLabels).map(([mode, label]) => (
          <button key={mode}
            className={`btn btn-sm ${modeFilter === mode ? 'btn-default' : 'btn-outline'}`}
            aria-pressed={modeFilter === mode}
            onClick={() => setFilter(mode)}>
            {label}{counts ? ` (${counts[mode as keyof typeof counts] ?? 0})` : ''}
          </button>
        ))}
      </div>

      {activeBatch && (
        <div className="p-row" style={{
          alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13,
          border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', background: 'hsl(var(--muted) / 0.4)',
        }}>
          <span className={`p-badge ${activeBatch.status === 'paused' ? 'badge-warning' : 'badge-default'}`}>
            {activeBatch.status}
          </span>
          <span style={{ flex: 1 }}>
            Upgrade batch #{activeBatch.id} — {activeBatch.components.join(', ')}
            {activeBatch.initiator === 'user' && ' (user-initiated)'}
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => setModal({ kind: 'progress', batchId: activeBatch.id })}>
            View progress
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="p-row" style={{ alignItems: 'center', gap: 10, marginBottom: 14, fontSize: 13 }}>
          <span>{selected.size} selected</span>
          <button className="btn btn-default btn-sm"
            onClick={() => setModal({ kind: 'create', selection: [...selected.keys()], defaultComponents: selectedComponents() })}>
            Upgrade selected
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Map())}>
            Clear
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="p-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" checked={allPageSelected} disabled={eligibleOnPage.length === 0}
                  onChange={togglePageSelection} aria-label="Select all running sessions on this page" />
              </th>
              <th>Session</th>
              <th>User</th>
              <th>Name</th>
              <th>Mode</th>
              <th>Domain</th>
              <th>Status</th>
              <th>Images</th>
              <th>Created</th>
              <th className="col-actions">Delete</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  Loading…
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  No sessions yet.
                </td>
              </tr>
            ) : sessions.map(s => (
              <tr key={s.id}>
                <td>
                  <input type="checkbox" checked={selected.has(s.vta_name)} disabled={s.status !== 'running'}
                    onChange={() => toggleSelected(s)} aria-label={`Select session ${s.vta_name}`} />
                </td>
                <td>
                  <div className="p-row gap-8" style={{ alignItems: 'baseline' }}>
                    <span className="p-mono" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>#{s.id}</span>
                    <span className="p-mono" style={{ fontSize: 12 }}>{s.vta_name}</span>
                  </div>
                </td>
                <td><span className="p-mono" style={{ fontSize: 12 }}>{s.user_unique_id}</span></td>
                <td title={s.fqdn}>
                  <span style={{ fontSize: 13 }}>{s.vta_name}</span>
                  {s.vtc_name && (
                    <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}> · vtc: {s.vtc_name}</span>
                  )}
                </td>
                <td><span className="p-badge badge-default">{modeLabels[s.mode] ?? s.mode}</span></td>
                <td>
                  <span className={`p-badge ${domainBadge[s.domain_type] ?? 'badge-secondary'}`}>
                    {s.domain_type}
                  </span>
                </td>
                <td title={s.error_msg || undefined}>
                  <span className={`p-badge ${statusBadge(s.status)}`}>{s.status}</span>
                </td>
                <td>
                  {componentImages(s).map(([component, image]) => (
                    <div key={component} className="p-mono" title={image} style={{ fontSize: 11.5, lineHeight: 1.7 }}>
                      <span style={{ color: 'hsl(var(--muted-foreground))' }}>{component} </span>
                      {imageTag(image)}
                    </div>
                  ))}
                </td>
                <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>{fmt(s.created_at)}</td>
                <td className="col-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'hsl(var(--destructive))' }}
                    onClick={() => askDelete(s)}
                    aria-label={`Delete session ${s.vta_name}`}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-row" style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
          Total {total} session{total === 1 ? '' : 's'}
        </span>
        <div className="p-row gap-8" style={{ alignItems: 'center' }}>
          <button
            className="btn btn-outline btn-sm"
            disabled={loading || page <= 1}
            onClick={() => loadPage(page - 1)}
          >
            Previous
          </button>
          {pageNumbers(page, totalPages).map((p, i) => p === '…' ? (
            <span key={`gap-${i}`} style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>…</span>
          ) : (
            <button
              key={p}
              className={`btn btn-sm ${p === page ? 'btn-default' : 'btn-outline'}`}
              disabled={loading}
              onClick={() => { if (p !== page) loadPage(p) }}
            >
              {p}
            </button>
          ))}
          <button
            className="btn btn-outline btn-sm"
            disabled={loading || page >= totalPages}
            onClick={() => loadPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {modal?.kind === 'create' && (
        <UpgradeModal selection={modal.selection} defaultComponents={modal.defaultComponents} onClose={closeModal} />
      )}
      {modal?.kind === 'progress' && (
        <UpgradeModal selection={[]} batchId={modal.batchId} onClose={closeModal} />
      )}

      {deleteTarget && (
        <div className="p-overlay">
          <div className="p-dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">
                {isPlatform(deleteTarget) ? 'Delete the platform stack?' : 'Delete this session?'}
              </h3>
              {/* No FQDN: a name identifies a session on its own now that
                  vta_name is globally unique, and the hostname is in the row
                  behind this dialog. No owner on the platform stack either —
                  "user platform" is the system account, which says nothing. */}
              <p className="dialog-desc">
                Permanently destroys <span className="p-mono">{deleteTarget.vta_name}</span>
                {!isPlatform(deleteTarget) && <>
                  {' '}(user <span className="p-mono">{deleteTarget.user_unique_id}</span>)
                </>}
                {' '}— DNS, cluster resources, secrets and data. Cannot be undone.
              </p>
            </div>
            <div className="dialog-body">
              {isPlatform(deleteTarget) && (
                <div className="p-alert alert-destructive">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                  {/* Only the consequence. That this is the farm's own stack is
                      already the dialog's title, and repeating it here pushed
                      the one thing an admin cannot infer further down. */}
                  <div className="grow">
                    <p className="alert-title">Every VTA-only session loses its mediator and DID hosting.</p>
                  </div>
                </div>
              )}
              <div>
                <label className="p-label">
                  Type <span className="p-mono">{confirmWord(deleteTarget)}</span> to confirm
                </label>
                <input
                  className="p-input p-mono"
                  placeholder={confirmWord(deleteTarget)}
                  value={deleteInput}
                  onChange={e => setDeleteInput(e.target.value)}
                  autoFocus
                />
              </div>
              {deleteError && (
                <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{deleteError}</p>
              )}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </button>
              <button
                className="btn btn-destructive"
                onClick={handleDelete}
                disabled={deleting || deleteInput !== confirmWord(deleteTarget)}
              >
                {deleting ? 'Deleting…' : isPlatform(deleteTarget) ? 'Delete platform stack' : 'Delete session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
