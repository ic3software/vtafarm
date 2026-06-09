import { useNavigate, useOutletContext } from 'react-router-dom'
import type { PortalContext } from './Portal'
import { statusBadge, timeAgo } from './portalUtils'

export function AgentsView() {
  const { sessions, sessionsLoading, loadSessions } = useOutletContext<PortalContext>()
  const navigate = useNavigate()

  const active = sessions.filter(s => s.status === 'running').length
  const provisioning = sessions.filter(s => !['running', 'failed'].includes(s.status)).length

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Your Agents</h1>
          <p className="sub">Verifiable Trust Agents provisioned to your account.</p>
        </div>
      </div>

      <div className="p-grid-2" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 24 }}>
        <div className="p-stat"><div className="k">Active agents</div><div className="v">{active}</div></div>
        <div className="p-stat"><div className="k">Provisioning</div><div className="v">{provisioning}{provisioning > 0 && <small> · in progress</small>}</div></div>
        <div className="p-stat"><div className="k">Total</div><div className="v">{sessions.length}</div></div>
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
          <p>Create your first Verifiable Trust Agent to get started.</p>
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
                        <span className="p-mono text-xs p-muted">{s.mode}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-mono text-xs p-muted">{s.fqdn ?? '—'}</td>
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

      <button className="btn btn-ghost btn-sm" onClick={loadSessions} style={{ marginTop: 12 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 2v6h6M21 12A9 9 0 0 0 6 5.3L3 8M21 22v-6h-6M3 12a9 9 0 0 0 15 6.7l3-2.7"/></svg>
        Refresh
      </button>
    </section>
  )
}
