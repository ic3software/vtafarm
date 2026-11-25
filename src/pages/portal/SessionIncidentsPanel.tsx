import { useEffect, useState } from 'react'
import { Activity, Bell, CheckCircle2, Download, RefreshCw, TriangleAlert } from 'lucide-react'

import { api, type Incident } from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

const componentLabels: Record<Incident['component'], string> = {
  vta: 'VTA',
  mediator: 'Mediator',
  dids: 'DID Hosting',
  vtc: 'VTC',
  'trust-registry': 'Trust Registry',
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.ceil((seconds % 3600) / 60)
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`
}

interface SessionIncidentsPanelProps {
  sessionId: string
  onViewMetrics: () => void
}

export function SessionIncidentsPanel({ sessionId, onViewMetrics }: SessionIncidentsPanelProps) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api.sessionIncidents(sessionId).then(result => {
      if (active) setIncidents(result.incidents)
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load incidents')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [sessionId])

  async function refresh() {
    setRefreshing(true)
    setError('')
    try {
      const result = await api.sessionIncidents(sessionId)
      setIncidents(result.incidents)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load incidents')
    } finally {
      setRefreshing(false)
    }
  }

  async function markRead(incident: Incident, read: boolean) {
    try {
      const updated = await api.markSessionIncidentRead(sessionId, incident.id, read)
      setIncidents(current => current.map(item => item.id === updated.id ? updated : item))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the incident')
    }
  }

  async function downloadLogs(incident: Incident) {
    setDownloading(incident.id)
    setError('')
    try {
      await api.exportSessionIncidentLogs(sessionId, incident.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download related logs')
    } finally {
      setDownloading(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-label="Loading incidents">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Incidents</h2>
          <p className="text-sm text-muted-foreground">Resource pressure and availability events detected for this agent.</p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw data-icon="inline-start" className={refreshing ? 'animate-spin' : undefined} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Incident data is unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {incidents.length === 0 && !error ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                <EmptyTitle>No incidents detected</EmptyTitle>
                <EmptyDescription>CPU, memory, storage, restarts, and component availability are within their alert thresholds.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : incidents.map(incident => {
        const firing = incident.status === 'firing'
        const unread = !incident.read_at
        return (
          <Card key={incident.id} className={unread ? 'ring-2 ring-primary/25' : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {incident.severity === 'critical'
                  ? <TriangleAlert className="size-4 text-destructive" />
                  : <Bell className="size-4 text-amber-600" />}
                {incident.title}
              </CardTitle>
              <CardDescription>
                {componentLabels[incident.component]} · Started {formatDate(incident.started_at)}
              </CardDescription>
              <CardAction className="flex gap-2">
                <Badge variant={incident.severity === 'critical' ? 'destructive' : 'secondary'}>{incident.severity}</Badge>
                <Badge variant={firing ? 'outline' : 'secondary'}>{firing ? 'Active' : 'Resolved'}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed">{incident.message}</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                {incident.usage_percent !== undefined && (
                  <div>
                    <dt className="text-muted-foreground">Usage at alert</dt>
                    <dd className="font-medium">{incident.usage_percent.toFixed(1)}%</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Resource</dt>
                  <dd className="font-medium capitalize">{incident.resource || 'Availability'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Incident duration</dt>
                  <dd className="font-medium">
                    {firing ? 'Ongoing' : incident.downtime_seconds !== undefined ? formatDuration(incident.downtime_seconds) : 'Resolved'}
                  </dd>
                </div>
              </dl>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onViewMetrics}>
                <Activity data-icon="inline-start" />
                View metrics
              </Button>
              <Button variant="outline" onClick={() => void downloadLogs(incident)} disabled={downloading === incident.id}>
                <Download data-icon="inline-start" />
                {downloading === incident.id ? 'Preparing logs…' : 'Download related logs'}
              </Button>
              <Button variant="ghost" onClick={() => void markRead(incident, unread)}>
                {unread ? 'Mark as read' : 'Mark as unread'}
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
