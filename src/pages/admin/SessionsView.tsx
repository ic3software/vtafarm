import { useState, useEffect, useCallback } from 'react'
import { api, type AdminSetupSession, type UpgradeBatchSummary } from '@/lib/api'
import { UpgradeModal } from './UpgradeModal'
import { imageTag } from '@/lib/utils'

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
  full_stack_with_vtc: 'Full stack + VTC',
}

function componentImages(s: AdminSetupSession): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  if (s.vta_image) rows.push(['vta', s.vta_image])
  if (s.mediator_image) rows.push(['mediator', s.mediator_image])
  if (s.dids_image) rows.push(['dids', s.dids_image])
  if (s.vtc_image) rows.push(['vtc', s.vtc_image])
  return rows
}

type ModalState =
  | { kind: 'create'; selection: string[] | 'all' }
  | { kind: 'progress'; batchId: number }
  | null

export function SessionsView() {
  const [sessions, setSessions] = useState<AdminSetupSession[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState>(null)
  const [activeBatch, setActiveBatch] = useState<UpgradeBatchSummary | null>(null)

  const fetchPage = useCallback((p: number) => (
    api.adminListSessions(p)
      .then(res => { setSessions(res.items); setTotal(res.total); setPage(res.page); setPageSize(res.page_size) })
      .catch(() => {})
      .finally(() => setLoading(false))
  ), [])

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

  // loading starts true, so the initial fetch needs no synchronous setState here.
  useEffect(() => { void fetchPage(1); void refreshActiveBatch() }, [fetchPage, refreshActiveBatch])

  function loadPage(p: number) {
    setLoading(true)
    void fetchPage(p)
  }

  function closeModal(didUpgrade: boolean) {
    setModal(null)
    void refreshActiveBatch()
    if (didUpgrade) {
      setSelected(new Set())
      setLoading(true)
      void fetchPage(page)
    }
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const eligibleOnPage = sessions.filter(s => s.status === 'running')
  const allPageSelected = eligibleOnPage.length > 0 && eligibleOnPage.every(s => selected.has(s.unique_id))

  function togglePageSelection() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allPageSelected) eligibleOnPage.forEach(s => next.delete(s.unique_id))
      else eligibleOnPage.forEach(s => next.add(s.unique_id))
      return next
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Sessions</h1>
          <p className="sub">All users' VTA setup sessions, newest first. Select running sessions to upgrade their images.</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setModal({ kind: 'create', selection: 'all' })}>
          Upgrade all…
        </button>
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
            Upgrade batch #{activeBatch.id} — {activeBatch.component} →{' '}
            <span className="p-mono" style={{ fontSize: 12 }}>{imageTag(activeBatch.image)}</span>
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => setModal({ kind: 'progress', batchId: activeBatch.id })}>
            View progress
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="p-row" style={{ alignItems: 'center', gap: 10, marginBottom: 14, fontSize: 13 }}>
          <span>{selected.size} selected</span>
          <button className="btn btn-default btn-sm" onClick={() => setModal({ kind: 'create', selection: [...selected] })}>
            Upgrade selected…
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
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
              <th>Status</th>
              <th>Images</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  Loading…
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  No sessions yet.
                </td>
              </tr>
            ) : sessions.map(s => (
              <tr key={s.id}>
                <td>
                  <input type="checkbox" checked={selected.has(s.unique_id)} disabled={s.status !== 'running'}
                    onChange={() => toggleSelected(s.unique_id)} aria-label={`Select session ${s.unique_id}`} />
                </td>
                <td>
                  <div className="p-row gap-8" style={{ alignItems: 'baseline' }}>
                    <span className="p-mono" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>#{s.id}</span>
                    <span className="p-mono" style={{ fontSize: 12 }}>{s.unique_id}</span>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-row" style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
          {total} session{total === 1 ? '' : 's'} · Page {page} of {totalPages}
        </span>
        <div className="p-row gap-8">
          <button
            className="btn btn-outline btn-sm"
            disabled={loading || page <= 1}
            onClick={() => loadPage(page - 1)}
          >
            Previous
          </button>
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
        <UpgradeModal selection={modal.selection} onClose={closeModal} />
      )}
      {modal?.kind === 'progress' && (
        <UpgradeModal selection={[]} batchId={modal.batchId} onClose={closeModal} />
      )}
    </section>
  )
}
