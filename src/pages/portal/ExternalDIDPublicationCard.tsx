import { useState } from 'react'
import { api, type SetupSession } from '@/lib/api'

export function ExternalDIDPublicationCard({ session, onValidated }: {
  session: SetupSession
  onValidated: () => void
}) {
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')

  if (session.connection_source !== 'external' || session.status !== 'awaiting_did_publication') return null

  async function validate() {
    setError('')
    setValidating(true)
    try {
      await api.validatePublishedDID(session.id)
      onValidated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not validate the published DID')
    } finally {
      setValidating(false)
    }
  }

  return (
    <div className="p-card" style={{ marginBottom: 20, borderColor: 'hsl(var(--primary)/.35)' }}>
      <div className="card-header">
        <h3 className="card-title">Publish your VTA DID log</h3>
        <p className="card-desc">Your DID hosting is outside this farm. Upload the generated <span className="p-mono">did.jsonl</span> to your hosting service, then validate it here.</p>
      </div>
      <div className="card-content p-col gap-16">
        <div>
          <div className="p-label">1. Download the generated DID log</div>
          <a className="btn btn-outline btn-sm" href={api.didLogDownloadURL(session.id)} download={`${session.id}-vta.did.jsonl`}>Download did.jsonl</a>
        </div>
        <div>
          <div className="p-label">2. Upload it to your DID hosting</div>
          <div className="field-hint">Publish the file at this exact address. If your hosting service requires an ACL, also authorize the VTA DID to update its log.</div>
          <p className="p-mono text-xs" style={{ wordBreak: 'break-all' }}>{session.did_log_url}</p>
        </div>
        <div>
          <div className="p-label">3. Validate publication</div>
          <div className="field-hint">Validation fetches the public log and verifies it matches this VTA DID before provisioning can continue.</div>
          {session.vta_did && <p className="p-mono text-xs" style={{ wordBreak: 'break-all' }}>{session.vta_did}</p>}
        </div>
        {error && <p className="text-sm" style={{ color: 'hsl(var(--destructive))', margin: 0 }}>{error}</p>}
      </div>
      <div className="card-footer between">
        <span className="field-hint" style={{ marginTop: 0 }}>You can leave this page and validate later from the session page.</span>
        <button className="btn btn-default" onClick={validate} disabled={validating}>
          {validating ? 'Validating…' : 'Validate DID'}
        </button>
      </div>
    </div>
  )
}
