import { useState } from 'react'
import { api, type SetupSession } from '@/lib/api'

// Both read the agent's live containers, so only a running agent offers them.
export function SessionExportCard({
  session,
  sessionId,
  admin = false,
}: {
  session: SetupSession
  sessionId: string
  admin?: boolean
}) {
  const [busy, setBusy] = useState<'configs' | 'logs' | null>(null)
  const [error, setError] = useState('')

  const ready = session.status === 'running'

  async function run(kind: 'configs' | 'logs') {
    setBusy(kind)
    setError('')
    try {
      if (kind === 'configs') {
        if (admin) await api.adminExportSessionConfigs(sessionId)
        else await api.exportSessionConfigs(sessionId)
      } else if (admin) {
        await api.adminExportSessionLogs(sessionId)
      } else {
        await api.exportSessionLogs(sessionId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to download ${kind}`)
    }
    setBusy(null)
  }

  return (
    <div className="p-card">
      <div className="card-header">
        <h3 className="card-title">Configs &amp; logs</h3>
        <p className="card-desc">
          <strong>Configs contain credentials.</strong> Treat them like passwords.
        </p>
      </div>
      <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
        <div className="p-row gap-8">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => run('configs')}
            disabled={!ready || busy !== null}
          >
            {busy === 'configs' ? 'Preparing…' : 'Download configs'}
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => run('logs')}
            disabled={!ready || busy !== null}
          >
            {busy === 'logs' ? 'Preparing…' : 'Download logs'}
          </button>
        </div>
        {error && (
          <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--destructive))' }}>{error}</p>
        )}
      </div>
    </div>
  )
}
