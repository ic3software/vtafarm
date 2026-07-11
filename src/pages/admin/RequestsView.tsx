import { useState, useEffect, useCallback } from 'react'
import { api, type SignupRequest, type SignupRequestsPage, type SignupApproveResult } from '@/lib/api'
import { pageNumbers } from '@/lib/utils'

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: browserTz })
}

function inviteUrl(token: string) {
  return `${window.location.origin}/register/${token}`
}

/** Display state derived from the request status plus its invitation's state. */
type RequestState = 'pending' | 'invited' | 'expired' | 'registered'

function requestState(r: SignupRequest): RequestState {
  if (r.status === 'pending') return 'pending'
  if (r.invite_used_at) return 'registered'
  if (r.invite_expires_at && new Date(r.invite_expires_at) < new Date()) return 'expired'
  return 'invited'
}

const stateLabels: Record<RequestState, string> = {
  pending: 'Pending',
  invited: 'Invited',
  expired: 'Invite expired',
  registered: 'Registered',
}

const stateBadge: Record<RequestState, string> = {
  pending: 'badge-warning',
  invited: 'badge-default',
  expired: 'badge-destructive',
  registered: 'badge-success',
}

export function RequestsView() {
  const [items, setItems] = useState<SignupRequest[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  // null = all states; filtering happens server-side (the list is paginated).
  const [filter, setFilter] = useState<RequestState | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState<number | string | null>(null)
  // Results of the last approve call — surfaces links whose email couldn't be sent.
  const [notice, setNotice] = useState<SignupApproveResult[] | null>(null)

  const [counts, setCounts] = useState<SignupRequestsPage['counts'] | null>(null)

  const fetchPage = useCallback((p: number) => (
    api.listSignupRequests(p, filter ?? undefined)
      .then(res => {
        setItems(res.items); setTotal(res.total); setPage(res.page)
        setPageSize(res.page_size); setCounts(res.counts)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  ), [filter])

  // loading starts true, so the initial fetch needs no synchronous setState
  // here. Re-runs on filter change (fetchPage's identity tracks filter);
  // setStateFilter sets loading before that happens.
  useEffect(() => { void fetchPage(1) }, [fetchPage])

  function loadPage(p: number) {
    setLoading(true)
    void fetchPage(p)
  }

  function setStateFilter(s: RequestState | null) {
    if (s === filter) return
    setLoading(true)
    setFilter(s)
  }

  // Everything except registered can be bulk-processed: pending gets its
  // first invitation, invited/expired get a fresh link re-sent.
  const eligibleOnPage = items.filter(r => requestState(r) !== 'registered')
  const allPageSelected = eligibleOnPage.length > 0 && eligibleOnPage.every(r => selected.has(r.id))

  function toggleSelected(r: SignupRequest) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(r.id)) next.delete(r.id)
      else next.add(r.id)
      return next
    })
  }

  function togglePageSelection() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allPageSelected) eligibleOnPage.forEach(r => next.delete(r.id))
      else eligibleOnPage.forEach(r => next.add(r.id))
      return next
    })
  }

  async function approve(ids: number[]) {
    setBusy(true)
    setNotice(null)
    try {
      const res = await api.approveSignupRequests(ids)
      setNotice(res.results)
      setSelected(new Set())
      setLoading(true)
      void fetchPage(page)
    } catch (err) {
      setNotice([{ id: 0, email_sent: false, error: err instanceof Error ? err.message : 'Approve failed' }])
    } finally {
      setBusy(false)
    }
  }

  async function copy(url: string, id: number | string) {
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const approvedCount = notice?.filter(r => !r.error).length ?? 0
  const sentCount = notice?.filter(r => r.email_sent).length ?? 0
  const problems = notice?.filter(r => r.error || !r.email_sent) ?? []

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Signup requests</h1>
          <p className="sub">Account requests from the public home page. Approve a request to email the visitor an invitation link.</p>
        </div>
      </div>

      <div className="p-row" style={{ gap: 8, marginBottom: 14 }}>
        <button
          className={`btn btn-sm ${filter === null ? 'btn-default' : 'btn-outline'}`}
          aria-pressed={filter === null}
          onClick={() => setStateFilter(null)}>
          All{counts ? ` (${counts.all})` : ''}
        </button>
        {(Object.keys(stateLabels) as RequestState[]).map(state => (
          <button key={state}
            className={`btn btn-sm ${filter === state ? 'btn-default' : 'btn-outline'}`}
            aria-pressed={filter === state}
            onClick={() => setStateFilter(state)}>
            {stateLabels[state]}{counts ? ` (${counts[state]})` : ''}
          </button>
        ))}
      </div>

      {notice && (
        <div style={{
          padding: '10px 14px', marginBottom: 14, fontSize: 13,
          border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', background: 'hsl(var(--muted) / 0.4)',
        }}>
          <div className="p-row" style={{ alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1 }}>
              <strong>{approvedCount}</strong> approved · <strong>{sentCount}</strong> email{sentCount === 1 ? '' : 's'} sent
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
          {problems.map((r, i) => (
            <div key={i} className="p-row" style={{ alignItems: 'center', gap: 10, marginTop: 6, color: 'hsl(var(--destructive))' }}>
              <span style={{ flex: 1 }}>
                {r.email || `#${r.id}`} — {r.error || r.email_error || 'email not sent'}
                {r.invite_url ? ' (copy the link and deliver it manually)' : ''}
              </span>
              {r.invite_url && (
                <button className="btn btn-outline btn-sm" onClick={() => copy(r.invite_url!, `notice-${i}`)}>
                  {copiedId === `notice-${i}` ? 'Copied!' : 'Copy link'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="p-row" style={{ alignItems: 'center', gap: 10, marginBottom: 14, fontSize: 13 }}>
          <span>{selected.size} selected</span>
          <button className="btn btn-default btn-sm" disabled={busy}
            onClick={() => approve([...selected])}>
            {busy ? 'Sending…' : 'Approve / Re-send selected'}
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
                  onChange={togglePageSelection} aria-label="Select all unregistered requests on this page" />
              </th>
              <th>Email</th>
              <th>Status</th>
              <th>Requested</th>
              <th>Email sent</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
                  {filter === null ? 'No signup requests yet.' : 'No requests match this filter.'}
                </td>
              </tr>
            ) : items.map(r => {
              const state = requestState(r)
              return (
                <tr key={r.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(r.id)} disabled={state === 'registered'}
                      onChange={() => toggleSelected(r)} aria-label={`Select request from ${r.email}`} />
                  </td>
                  <td style={{ fontSize: 13 }}>{r.email}</td>
                  <td><span className={`p-badge ${stateBadge[state]}`} style={{ fontSize: 11 }}>{stateLabels[state]}</span></td>
                  <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{fmt(r.created_at)}</td>
                  <td style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{r.email_sent_at ? fmt(r.email_sent_at) : '—'}</td>
                  <td className="col-actions">
                    <div className="p-row gap-8" style={{ justifyContent: 'flex-end' }}>
                      {state === 'invited' && r.invite_token && (
                        <button className="btn btn-ghost btn-sm" onClick={() => copy(inviteUrl(r.invite_token!), r.id)}>
                          {copiedId === r.id ? 'Copied!' : 'Copy link'}
                        </button>
                      )}
                      {state !== 'registered' && (
                        <button className="btn btn-default btn-sm" disabled={busy}
                          onClick={() => approve([r.id])}>
                          {state === 'pending' ? 'Approve' : 'Re-send'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="p-row" style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
          Total {total} request{total === 1 ? '' : 's'}
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
    </section>
  )
}
