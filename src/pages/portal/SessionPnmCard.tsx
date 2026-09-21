import { useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import { isValidAdminDid } from './portalUtils'

interface SessionPnmCardProps {
  sessionId: string
}

export function SessionPnmCard({ sessionId }: SessionPnmCardProps) {
  const [adminDid, setAdminDid] = useState('')
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warning, setWarning] = useState('')

  async function handleLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = adminDid.trim()

    if (!isValidAdminDid(trimmed)) {
      setError('Paste only the did:key value (e.g. did:key:z6Mk…) with no surrounding text, labels, quotes, or whitespace.')
      setNotice('')
      setWarning('')
      return
    }

    setError('')
    setNotice('')
    setWarning('')
    setLinking(true)
    try {
      const result = await api.addSessionAdmin(sessionId, trimmed)
      setAdminDid('')
      setNotice(result.already_present
        ? 'This PNM was already an administrator; nothing changed.'
        : 'The additional PNM can now administer this VTA.')
      if (result.warning) setWarning(result.warning)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link the PNM')
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="p-card">
      <div className="card-header">
        <h3 className="card-title">Link another PNM</h3>
      </div>
      <form className="card-content p-col gap-16" onSubmit={handleLink}>
        <div>
          <label className="p-label" htmlFor="additional-pnm-did">Admin DID</label>
          <input
            id="additional-pnm-did"
            className="p-input p-mono"
            type="text"
            placeholder="did:key:z6Mk…"
            value={adminDid}
            onChange={event => setAdminDid(event.target.value)}
            disabled={linking}
          />
        </div>

        {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>}
        {notice && <p role="status" style={{ margin: 0, fontSize: 13, color: 'hsl(var(--foreground))' }}>{notice}</p>}
        {warning && (
          <div className="p-alert alert-warning" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
            <div className="grow">
              <p className="alert-title">The PNM was linked, but the VTA did not come back up</p>
              <p className="alert-desc">{warning}</p>
            </div>
          </div>
        )}

        <div className="p-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-default" type="submit" disabled={linking || !adminDid.trim()}>
            {linking
              ? <><svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Linking — VTA restarting…</>
              : <>Link PNM <span className="arrow">→</span></>}
          </button>
        </div>
      </form>
    </div>
  )
}
