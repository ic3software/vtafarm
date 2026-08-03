import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api, type SetupAvailability } from '@/lib/api'
import type { PortalContext } from './Portal'
import { statusBadge, timeAgo } from './portalUtils'

export function AgentsView() {
  const { sessions, sessionsLoading, loadSessions, betaAccess } = useOutletContext<PortalContext>()
  // Refresh on entering the tab. loadSessions is a stable useCallback in
  // Portal, so naming it here does not add a re-run.
  useEffect(() => { loadSessions() }, [loadSessions])
  const navigate = useNavigate()

  const [availability, setAvailability] = useState<SetupAvailability | null>(null)
  useEffect(() => { api.setupAvailability().then(setAvailability).catch(() => {}) }, [])

  // Don't send someone into a form they can't submit. Fail open: until
  // availability resolves — or if the call fails — the button stays live and
  // POST /setup remains the authoritative gate.
  // custom_target_allowed matters here too: a farm with no platform stack can
  // still create a VTA-only agent against a stack somebody shared, so the
  // button must not be disabled on the default path alone.
  const canCreate = !availability ||
    availability.vta_only.available ||
    availability.vta_only.custom_target_allowed === true ||
    (betaAccess && availability.full_stack.available)
  // With one mode blocked the reason is unambiguous; with both, VTA-only's is
  // the one that applies to every account.
  const blockedReason = availability?.vta_only.detail

  const active = sessions.filter(s => s.status === 'running').length
  const failed = sessions.filter(s => s.status === 'failed').length
  const provisioning = sessions.filter(s => !['running', 'failed'].includes(s.status)).length

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Your Agents</h1>
          <p className="sub">Verifiable Trust Agents provisioned to your account.</p>
        </div>
        <div className="p-row gap-8">
          <button className="btn btn-outline" onClick={loadSessions}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 2v6h6M21 12A9 9 0 0 0 6 5.3L3 8M21 22v-6h-6M3 12a9 9 0 0 0 15 6.7l3-2.7"/></svg>
            Refresh
          </button>
          <button
            className="btn btn-default"
            onClick={() => navigate('/portal/create')}
            disabled={!canCreate}
            title={canCreate ? undefined : blockedReason}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14"/></svg>
            Create VTA
          </button>
        </div>
      </div>

      {/* A disabled button with no reason is worse than no button. This is the
          shared mediator and DID hosting being absent — nothing the user can
          fix, so say so plainly rather than leaving them clicking. */}
      {!canCreate && blockedReason && (
        <div className="p-alert alert-warning" style={{ marginBottom: 20 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
          <div className="grow">
            <p className="alert-title">Agent creation is unavailable</p>
            <p className="alert-desc">{blockedReason}</p>
          </div>
        </div>
      )}

      <div className="p-stats" style={{ marginBottom: 24 }}>
        <div className="p-stat"><div className="k">Total</div><div className="v">{sessions.length}</div></div>
        <div className="p-stat"><div className="k">Active agents</div><div className="v">{active}</div></div>
        <div className="p-stat"><div className="k">Provisioning</div><div className="v">{provisioning}{provisioning > 0 && <small> · in progress</small>}</div></div>
        <div className="p-stat"><div className="k">Failed</div><div className="v">{failed}</div></div>
      </div>

      {sessionsLoading ? (
        <div className="p-empty"><p>Loading…</p></div>
      ) : sessions.length === 0 ? (
        <div className="p-empty">
          <div className="ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
              <rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
            </svg>
          </div>
          <h3>No agents yet</h3>
          <p>
            {canCreate
              ? 'Create your first Verifiable Trust Agent to get started.'
              : 'Agent creation isn’t available yet — check back once an admin has finished setting up the platform.'}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="p-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>URL</th>
                <th>Status</th>
                <th>Created</th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/portal/session/${s.id}`)}>
                  <td>
                    <div className="p-row">
                      <span className="p-avatar sq" style={{ width: 30, height: 30, fontSize: 11 }}>
                        {s.vta_name ? s.vta_name.slice(0, 2).toUpperCase() : `#${s.id}`}
                      </span>
                      <div className="p-col">
                        <span className="fw-600">{s.vta_name ?? `session-${s.id}`}</span>
                        <span className="p-mono text-xs p-muted">
                          {s.mode}
                          {/* Only worth naming when it isn't the default — a
                              "managed" tag on every row is noise. */}
                          {s.domain_type && s.domain_type !== 'managed' && s.domain && <> · {s.domain}</>}
                          {/* An orphaned agent still reads `running`, because it
                              is — nothing of its own was touched. Without a
                              marker here nothing on this row would give away
                              that it can no longer deliver a message. */}
                          {s.provider_gone && (
                            <span style={{ color: 'hsl(var(--destructive))' }}> · stack deleted</span>
                          )}
                          {!!s.connection_count && <> · {s.connection_count} connected</>}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="p-mono text-xs p-muted">{(s.mode === 'vta_only' ? s.url : s.urls?.vta) ?? '—'}</td>
                  <td>{statusBadge(s.status)}</td>
                  <td className="p-muted text-xs">{timeAgo(s.created_at)}</td>
                  <td className="col-actions">
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={e => { e.stopPropagation(); navigate(`/portal/session/${s.id}`) }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </section>
  )
}
