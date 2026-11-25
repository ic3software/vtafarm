import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCircle2, ChevronLeft, ChevronRight, Download, RefreshCw, TriangleAlert } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { api, type Incident, type IncidentListOptions, type IncidentStatus } from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10
const INCIDENT_GRID_COLUMNS = 'xl:grid-cols-[minmax(16rem,1fr)_5rem_10.5rem_10.5rem_5rem_7rem_7.5rem]'

type RangeFilter = IncidentListOptions['range']
type StatusFilter = IncidentStatus | 'all'

function rangeFromQuery(value: string | null): RangeFilter {
  return value === '7d' || value === '30d' || value === 'all' ? value : '24h'
}

function statusFromQuery(value: string | null): StatusFilter {
  return value === 'firing' || value === 'resolved' ? value : 'all'
}

function pageFromQuery(value: string | null): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

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

function incidentDuration(incident: Incident): string {
  if (incident.status === 'firing') return 'Ongoing'
  return incident.downtime_seconds !== undefined ? formatDuration(incident.downtime_seconds) : 'Resolved'
}

interface SessionIncidentsPanelProps {
  sessionId: string
  onIncidentRead: () => void
}

export function SessionIncidentsPanel({ sessionId, onIncidentRead }: SessionIncidentsPanelProps) {
  const requestSequence = useRef(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const range = rangeFromQuery(searchParams.get('range'))
  const status = statusFromQuery(searchParams.get('status'))
  const page = pageFromQuery(searchParams.get('page'))
  const queryKey = `${sessionId}:${range}:${status}:${page}`
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const loading = loadedQuery !== queryKey

  useEffect(() => {
    const requestId = ++requestSequence.current
    api.sessionIncidents(sessionId, {
      range,
      status: status === 'all' ? undefined : status,
      page,
      limit: PAGE_SIZE,
    }).then(result => {
      if (requestId !== requestSequence.current) return
      setIncidents(result.incidents)
      setTotal(result.total ?? result.incidents.length)
      setTotalPages(result.total_pages ?? (result.incidents.length > 0 ? 1 : 0))
      setError('')
    }).catch(cause => {
      if (requestId === requestSequence.current) {
        setError(cause instanceof Error ? cause.message : 'Could not load incidents')
      }
    }).finally(() => {
      if (requestId === requestSequence.current) setLoadedQuery(queryKey)
    })
  }, [page, queryKey, range, sessionId, status])

  async function refresh() {
    const requestId = ++requestSequence.current
    setRefreshing(true)
    setError('')
    try {
      const result = await api.sessionIncidents(sessionId, {
        range,
        status: status === 'all' ? undefined : status,
        page,
        limit: PAGE_SIZE,
      })
      if (requestId !== requestSequence.current) return
      setIncidents(result.incidents)
      setTotal(result.total ?? result.incidents.length)
      setTotalPages(result.total_pages ?? (result.incidents.length > 0 ? 1 : 0))
    } catch (cause) {
      if (requestId === requestSequence.current) {
        setError(cause instanceof Error ? cause.message : 'Could not load incidents')
      }
    } finally {
      setRefreshing(false)
    }
  }

  async function markRead(incident: Incident) {
    try {
      const updated = await api.markSessionIncidentRead(sessionId, incident.id, true)
      setIncidents(current => current.map(item => item.id === updated.id ? updated : item))
      onIncidentRead()
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

  function updateRange(value: RangeFilter) {
    setError('')
    const next = new URLSearchParams(searchParams)
    if (value === '24h') next.delete('range')
    else next.set('range', value)
    next.delete('page')
    setSearchParams(next)
  }

  function updateStatus(value: StatusFilter) {
    setError('')
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('status')
    else next.set('status', value)
    next.delete('page')
    setSearchParams(next)
  }

  function updatePage(nextPage: number) {
    setError('')
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete('page')
    else next.set('page', String(nextPage))
    setSearchParams(next)
  }

  const firstRecord = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastRecord = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" aria-label="Incident filters">
          <div className="w-44">
            <Select value={range} onValueChange={value => updateRange(value as RangeFilter)}>
              <SelectTrigger size="sm" aria-label="Time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="24h">Past 24 hours</SelectItem>
                  <SelectItem value="7d">Past 7 days</SelectItem>
                  <SelectItem value="30d">Past 30 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="w-40">
            <Select value={status} onValueChange={value => updateStatus(value as StatusFilter)}>
              <SelectTrigger size="sm" aria-label="Incident status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="firing">Active</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={refreshing || loading}>
          <RefreshCw data-icon="inline-start" className={refreshing ? 'animate-spin' : undefined} />
          Refresh
        </Button>
      </div>

      {error && !loading && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Incident data is unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex flex-col gap-2" aria-label="Loading incidents">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : incidents.length === 0 && !error ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                <EmptyTitle>No incidents match these filters</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <CardHeader className={cn('hidden items-center gap-3 border-b bg-muted/30 px-4 py-2.5 text-xs font-medium text-muted-foreground xl:grid', INCIDENT_GRID_COLUMNS)}>
            <span className="pl-7">Incident</span>
            <span>Usage</span>
            <span>Started</span>
            <span>Resolved</span>
            <span>Duration</span>
            <span>Status</span>
            <span>Logs</span>
          </CardHeader>
          <CardContent className="p-0">
            {incidents.map(incident => {
              const firing = incident.status === 'firing'
              const unread = !incident.read_at
              const summary = (
                <span className="flex min-w-0 items-center gap-3">
                  <span className="relative shrink-0" title={`${incident.severity} incident`}>
                    {incident.severity === 'critical'
                      ? <TriangleAlert data-icon="inline-start" className="text-destructive" />
                      : <Bell data-icon="inline-start" className="text-muted-foreground" />}
                    {unread && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" aria-label="Unread" />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-semibold">{incident.title}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {componentLabels[incident.component]}
                      <span className="xl:hidden">
                        {' · '}{incident.usage_percent !== undefined ? `${incident.usage_percent.toFixed(1)}%` : 'No value'}{' · '}{incidentDuration(incident)}
                      </span>
                    </span>
                  </span>
                </span>
              )
              return (
                <div
                  key={incident.id}
                  className={cn(
                    'grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0',
                    INCIDENT_GRID_COLUMNS,
                    unread && 'bg-muted/30',
                  )}
                >
                  {unread ? (
                    <Button
                      variant="ghost"
                      className="h-auto min-w-0 justify-start p-0! text-left whitespace-normal"
                      onClick={() => void markRead(incident)}
                      aria-label={`Mark ${incident.title} as read`}
                    >
                      {summary}
                    </Button>
                  ) : summary}
                  <span className="hidden font-semibold tabular-nums xl:block">
                    {incident.usage_percent !== undefined ? `${incident.usage_percent.toFixed(1)}%` : '—'}
                  </span>
                  <span className="hidden whitespace-nowrap xl:block">{formatDate(incident.started_at)}</span>
                  <span className="hidden whitespace-nowrap xl:block">{incident.resolved_at ? formatDate(incident.resolved_at) : '—'}</span>
                  <span className="hidden font-medium xl:block">{incidentDuration(incident)}</span>
                  <span className="flex shrink-0 items-center justify-start">
                    <Badge variant={firing ? 'destructive' : 'outline'}>
                      {!firing && <CheckCircle2 data-icon="inline-start" />}
                      {firing ? 'Active' : 'Resolved'}
                    </Badge>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    aria-label={`Download logs for ${incident.title}`}
                    onClick={() => void downloadLogs(incident)}
                    disabled={downloading === incident.id}
                  >
                    <Download data-icon="inline-start" />
                    <span className="hidden xl:inline">{downloading === incident.id ? 'Preparing…' : 'Download logs'}</span>
                  </Button>
                </div>
              )
            })}
          </CardContent>
          <CardFooter className="flex flex-wrap justify-between gap-3 bg-transparent px-4 py-3 text-sm text-muted-foreground">
            <span>Showing {firstRecord}–{lastRecord} of {total}</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-label="Previous incident page"
                disabled={page <= 1}
                onClick={() => updatePage(Math.max(1, page - 1))}
              >
                <ChevronLeft data-icon="inline-start" />
                Previous
              </Button>
              <span className="min-w-20 text-center text-foreground">Page {page} of {Math.max(totalPages, 1)}</span>
              <Button
                size="sm"
                variant="outline"
                aria-label="Next incident page"
                disabled={page >= totalPages}
                onClick={() => updatePage(page + 1)}
              >
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
