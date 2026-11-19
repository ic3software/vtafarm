import { useState } from 'react'
import { api, type LogRange, type SetupSession } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const LOG_RANGES: Array<{ value: LogRange; days: 1 | 7 | 30; label: string }> = [
  { value: '1d', days: 1, label: '1 day' },
  { value: '7d', days: 7, label: '7 days' },
  { value: '30d', days: 30, label: '30 days' },
]

export function SessionExportCard({
  session,
  sessionId,
  retentionDays,
  admin = false,
}: {
  session: SetupSession
  sessionId: string
  retentionDays: 7 | 30
  admin?: boolean
}) {
  const [busy, setBusy] = useState<'configs' | 'logs' | null>(null)
  const [error, setError] = useState('')
  const [selectedLogRange, setSelectedLogRange] = useState<LogRange | null>(null)
  const selectedDays = LOG_RANGES.find(option => option.value === selectedLogRange)?.days ?? 0
  const logRange = selectedLogRange && selectedDays <= retentionDays
    ? selectedLogRange
    : '1d'

  const ready = session.status === 'running'

  async function run(kind: 'configs' | 'logs') {
    setBusy(kind)
    setError('')
    try {
      if (kind === 'configs') {
        if (admin) await api.adminExportSessionConfigs(sessionId)
        else await api.exportSessionConfigs(sessionId)
      } else if (admin) {
        await api.adminExportSessionLogs(sessionId, logRange)
      } else {
        await api.exportSessionLogs(sessionId, logRange)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to download ${kind}`)
    }
    setBusy(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-16 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configs</CardTitle>
            <CardDescription>
              <strong className="text-foreground">Contains credentials.</strong> Treat downloaded files like passwords.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => run('configs')}
              disabled={!ready || busy !== null}
            >
              {busy === 'configs' ? 'Preparing…' : 'Download configs'}
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logs</CardTitle>
            <CardDescription>
              Choose how much log history to include, up to {retentionDays} days.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <span className="text-sm font-medium">History range</span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-28 shrink-0">
                <Select value={logRange} onValueChange={value => setSelectedLogRange(value as LogRange)} disabled={busy !== null}>
                  <SelectTrigger aria-label="Log history range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)">
                    <SelectGroup>
                      {LOG_RANGES.filter(option => option.days <= retentionDays).map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => run('logs')}
                disabled={busy !== null}
              >
                {busy === 'logs' ? 'Preparing…' : 'Download logs'}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">{error}</p>
      )}
    </div>
  )
}
