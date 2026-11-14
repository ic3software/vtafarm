import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Database, Gauge, MemoryStick, Network } from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

import { api, type MetricsLiveSample, type MetricsMeta, type MetricsRange, type MetricsResponse, type MetricsScope, type MetricsSeries, type MetricsTarget } from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type TimeChoice = 'live' | MetricsRange

const defaultLiveWindowSeconds = 5 * 60

const standardRanges: Array<{ value: TimeChoice; label: string }> = [
  { value: 'live', label: 'Live' },
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
]

const thirtyDayRange: { value: TimeChoice; label: string } = { value: '30d', label: '30d' }

const metricLabels: Record<string, string> = {
  cpu_usage_cores: 'Usage', cpu_requested_cores: 'Request', cpu_limit_cores: 'Limit',
  memory_working_set_bytes: 'Working set', memory_requested_bytes: 'Request', memory_limit_bytes: 'Limit',
  network_receive_bytes_per_second: 'Receive', network_transmit_bytes_per_second: 'Transmit',
  persistent_volume_used_bytes: 'Used', persistent_volume_capacity_bytes: 'Capacity',
}

const metricColors: Record<string, string> = {
  cpu_usage_cores: 'var(--color-chart-1)',
  cpu_limit_cores: 'var(--color-muted-foreground)',
  memory_working_set_bytes: 'var(--color-chart-1)',
  memory_limit_bytes: 'var(--color-muted-foreground)',
  network_receive_bytes_per_second: 'var(--color-chart-1)',
  network_transmit_bytes_per_second: 'var(--color-chart-2)',
  persistent_volume_used_bytes: 'var(--color-chart-1)',
  persistent_volume_capacity_bytes: 'var(--color-muted-foreground)',
}

const referenceMetrics = new Set([
  'cpu_limit_cores',
  'memory_limit_bytes',
  'persistent_volume_capacity_bytes',
])

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let scaled = Math.abs(value)
  let index = 0
  while (scaled >= 1024 && index < units.length - 1) { scaled /= 1024; index += 1 }
  return `${value < 0 ? '-' : ''}${scaled.toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

function formatCores(value: number): string {
  if (Math.abs(value) >= 1) return `${Number(value.toFixed(2))} cores`
  const millicores = value * 1000
  const fractionDigits = Math.abs(millicores) < 1 ? 2 : Math.abs(millicores) < 10 ? 1 : 0
  return `${Number(millicores.toFixed(fractionDigits))}m`
}

function latestSummary(series: MetricsSeries[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const item of series) {
    const point = item.points.at(-1)
    if (point) result[item.metric] = (result[item.metric] ?? 0) + point.value
  }
  return result
}

function mergeLive(current: MetricsResponse, sample: MetricsLiveSample, windowSeconds: number): MetricsResponse {
  const keyed = new Map(current.series.map(item => [`${item.metric}:${item.labels?.pod ?? ''}`, item]))
  for (const next of sample.series) {
    const key = `${next.metric}:${next.labels?.pod ?? ''}`
    const existing = keyed.get(key)
    if (!existing) {
      current.series.push(next)
      keyed.set(key, next)
      continue
    }
    for (const point of next.points) {
      if (existing.points.at(-1)?.timestamp !== point.timestamp) existing.points.push(point)
    }
    existing.points = existing.points.filter(point => point.timestamp >= sample.observed_at - windowSeconds)
  }
  return { ...current, end: sample.observed_at, series: [...current.series], summary: latestSummary(current.series), warnings: sample.warnings }
}

function metricRows(series: MetricsSeries[], metrics: string[]) {
  const rows = new Map<number, Record<string, number>>()
  for (const item of series.filter(candidate => metrics.includes(candidate.metric))) {
    for (const point of item.points) {
      const row = rows.get(point.timestamp) ?? { timestamp: point.timestamp }
      row[item.metric] = (row[item.metric] ?? 0) + point.value
      rows.set(point.timestamp, row)
    }
  }
  return [...rows.values()].sort((a, b) => a.timestamp - b.timestamp)
}

function MetricChart({ title, icon: Icon, series, metrics, valueFormatter, timeDomain }: {
  title: string
  icon: typeof Gauge
  series: MetricsSeries[]
  metrics: string[]
  valueFormatter: (value: number) => string
  timeDomain?: [number, number]
}) {
  const data = useMemo(() => metricRows(series, metrics), [series, metrics])
  const timeTicks = useMemo(() => {
    if (!timeDomain) return undefined
    const [start, end] = timeDomain
    const span = end - start
    return [0, 0.25, 0.5, 0.75, 1].map(position => start + span * position)
  }, [timeDomain])
  const dataMax = Math.max(0, ...data.flatMap(row => metrics.map(metric => row[metric] ?? 0)))
  const currentYMax = dataMax > 0 ? dataMax : 1
  const [yDomainMax, setYDomainMax] = useState(currentYMax)
  if (currentYMax > yDomainMax) setYDomainMax(currentYMax)
  const config = Object.fromEntries(metrics.map(metric => [metric, { label: metricLabels[metric], color: metricColors[metric] }])) as ChartConfig
  return (
    <Card data-metrics-card="chart">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Icon className="size-4" />{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? <p className="py-14 text-center text-sm text-muted-foreground">No samples in this range.</p> : (
          <ChartContainer config={config} className="h-64 w-full aspect-auto">
            <LineChart data={data} accessibilityLayer margin={{ left: 8, right: 16 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timestamp"
                type={timeDomain ? 'number' : 'category'}
                domain={timeDomain}
                allowDataOverflow={Boolean(timeDomain)}
                ticks={timeTicks}
                interval={timeDomain ? 0 : 'preserveEnd'}
                padding={{ left: 24, right: 24 }}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={32}
                tickFormatter={value => new Date(Number(value) * 1000).toLocaleTimeString([], {
                  hour: '2-digit', minute: '2-digit', ...(timeDomain ? { second: '2-digit' } : {}),
                })}
              />
              <YAxis domain={[0, yDomainMax]} allowDataOverflow tickLine={false} axisLine={false} tickMargin={10} width={72} tickFormatter={value => valueFormatter(Number(value))} />
              <ChartTooltip content={<ChartTooltipContent
                labelFormatter={(_value, payload) => {
                  const timestamp = payload?.[0]?.payload?.timestamp
                  return typeof timestamp === 'number' ? new Date(timestamp * 1000).toLocaleString() : ''
                }}
                formatter={(value, name, item) => (
                  <div className="flex w-full items-center gap-2">
                    <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="flex flex-1 items-center justify-between gap-4">
                      <span className="font-medium" style={{ color: item.color }}>{String(name)}</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">{valueFormatter(Number(value))}</span>
                    </span>
                  </div>
                )}
              />} />
              {metrics.map(metric => <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                name={metricLabels[metric]}
                stroke={metricColors[metric]}
                strokeDasharray={referenceMetrics.has(metric) ? '6 4' : undefined}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />)}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function SessionMetricsPanel({ sessionId }: { sessionId: string }) {
  const [meta, setMeta] = useState<MetricsMeta | null>(null)
  const [scope, setScope] = useState<MetricsScope>('component')
  const [component, setComponent] = useState('vta')
  const [pod, setPod] = useState('')
  const [timeChoice, setTimeChoice] = useState<TimeChoice>('1h')
  const [response, setResponse] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [liveState, setLiveState] = useState<'connecting' | 'connected' | 'degraded'>('connecting')
  const [liveNow, setLiveNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    let active = true
    api.sessionMetricsMeta(sessionId).then(value => {
      if (!active) return
      setMeta(value)
      if (value.mode === 'full_stack') setScope('stack')
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load metrics') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [sessionId])

  const target = useMemo<MetricsTarget>(() => ({
    scope,
    ...(scope === 'component' ? { component } : {}),
    ...(scope === 'pod' ? { pod } : {}),
  }), [scope, component, pod])

  useEffect(() => {
    if (!meta || (scope === 'pod' && !pod)) return
    if (timeChoice !== 'live') {
      let active = true
      api.sessionMetricsRange(sessionId, timeChoice, target).then(value => { if (active) setResponse(value) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load metrics') }).finally(() => { if (active) setLoading(false) })
      return () => { active = false }
    }

    const source = new EventSource(api.sessionMetricsLiveURL(sessionId, target), { withCredentials: true })
    source.addEventListener('status', () => { setLiveState('connected'); setLoading(false) })
    source.addEventListener('snapshot', event => { setResponse(JSON.parse((event as MessageEvent).data) as MetricsResponse); setLiveState('connected'); setLoading(false) })
    source.addEventListener('sample', event => {
      const sample = JSON.parse((event as MessageEvent).data) as MetricsLiveSample
      setResponse(current => current ? mergeLive(
        { ...current, series: current.series.map(item => ({ ...item, points: [...item.points] })) },
        sample,
        meta.live_window_seconds ?? defaultLiveWindowSeconds,
      ) : current)
      setLiveState('connected')
    })
    source.addEventListener('problem', event => { const problem = JSON.parse((event as MessageEvent).data) as { message: string }; setError(problem.message); setLiveState('degraded'); setLoading(false) })
    source.addEventListener('reconnect', () => setLiveState('connecting'))
    source.onerror = () => { setLiveState('degraded'); setLoading(false) }
    return () => source.close()
  }, [sessionId, meta, scope, component, pod, timeChoice, target])

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && timeChoice === 'live') setTimeChoice('1h')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [timeChoice])

  useEffect(() => {
    if (timeChoice !== 'live') return
    const updateClock = () => setLiveNow(Math.floor(Date.now() / 1000))
    updateClock()
    const interval = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(interval)
  }, [timeChoice])

  if (!meta && loading) return <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-72 md:col-span-2" /></div>
  if (!meta) return <Alert variant="destructive"><AlertTriangle /><AlertTitle>Metrics unavailable</AlertTitle><AlertDescription>{error || 'The metrics service could not be reached.'}</AlertDescription></Alert>

  const summary = response?.summary ?? {}
  const ready = summary.pod_ready ?? 0
  const restarts = summary.container_restarts_total ?? 0
  const selectedPodCount = scope === 'pod'
    ? 1
    : scope === 'component'
      ? meta.pods.filter(item => item.component === component).length
      : meta.pods.length
  const selectedPod = scope === 'pod' ? meta.pods.find(item => item.name === pod) : undefined
  const availableRanges = meta.retention_days >= 30
    ? [...standardRanges, thirtyDayRange]
    : standardRanges
  const observedPodCount = new Set(response?.series.map(item => item.labels?.pod).filter(Boolean)).size
  const readyPodCount = selectedPodCount || observedPodCount
  const liveTimeDomain: [number, number] | undefined = timeChoice === 'live'
    ? [liveNow - (meta.live_window_seconds ?? defaultLiveWindowSeconds), liveNow]
    : undefined
  const chartScaleKey = `${timeChoice}:${scope}:${component}:${pod}:${response?.start ?? 0}`

  return (
    <div className="metrics-root flex flex-col gap-5">
      <div data-metrics-toolbar className="flex flex-wrap items-center justify-between gap-4">
        <h2>Agent metrics</h2>
        <div className="ml-auto max-w-full overflow-x-auto">
          <ToggleGroup type="single" spacing={2} value={timeChoice} onValueChange={value => { if (!value) return; setLoading(true); setResponse(null); setError(''); setLiveState('connecting'); setTimeChoice(value as TimeChoice) }} aria-label="Metrics time range">
            {availableRanges.map(item => <ToggleGroupItem key={item.value} value={item.value}>{item.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      </div>
      {meta.mode === 'full_stack' && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Scope
            <Select value={scope} onValueChange={value => { setLoading(true); setError(''); setScope(value as MetricsScope); if (value === 'pod' && !pod) setPod(meta.pods[0]?.name ?? '') }}>
              <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectLabel>Target</SelectLabel><SelectItem value="stack">Entire stack</SelectItem><SelectItem value="component">Component</SelectItem><SelectItem value="pod">Pod</SelectItem></SelectGroup></SelectContent>
            </Select>
          </label>
          {scope === 'component' && <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Component
            <Select value={component} onValueChange={value => { setLoading(true); setError(''); setComponent(value) }}><SelectTrigger className="min-w-44"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectLabel>Components</SelectLabel>{meta.components.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup></SelectContent></Select>
          </label>}
          {scope === 'pod' && <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Pod
            <Select value={pod} onValueChange={value => { setLoading(true); setError(''); setPod(value) }}><SelectTrigger className="min-w-64"><SelectValue placeholder="Select a pod" /></SelectTrigger><SelectContent><SelectGroup><SelectLabel>Current pods</SelectLabel>{meta.pods.map(item => <SelectItem key={item.name} value={item.name}>{item.name} · {item.component}</SelectItem>)}</SelectGroup></SelectContent></Select>
          </label>}
        </div>
      )}
      {timeChoice === 'live' && liveState !== 'connected' && (
        <div>
          <Badge variant="secondary">{liveState === 'degraded' ? 'Live connection degraded; reconnecting' : 'Connecting to live metrics'}</Badge>
        </div>
      )}

      {error && <Alert variant="destructive"><AlertTriangle /><AlertTitle>Metrics query problem</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {selectedPod?.last_termination_reason && <Alert><AlertTriangle /><AlertTitle>Previous container termination</AlertTitle><AlertDescription>{selectedPod.last_termination_reason}{selectedPod.started_at ? ` · current pod started ${new Date(selectedPod.started_at).toLocaleString()}` : ''}</AlertDescription></Alert>}
      {response?.warnings?.map(warning => <Alert key={warning}><AlertTriangle /><AlertTitle>Partial data</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert>)}

      {loading && !response ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div> : !response?.series.length ? (
        <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia variant="icon"><Activity /></EmptyMedia><EmptyTitle>No metrics yet</EmptyTitle><EmptyDescription>The selected workload may still be starting, or Prometheus has not scraped its first sample.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <>
          <div data-metrics-grid="summary" className="grid sm:grid-cols-2 md:grid-cols-4">
            <Card data-metrics-card="summary"><CardHeader><CardDescription>CPU now</CardDescription></CardHeader><CardContent><p>{formatCores(summary.cpu_usage_cores ?? 0)}</p></CardContent></Card>
            <Card data-metrics-card="summary"><CardHeader><CardDescription>Memory now</CardDescription></CardHeader><CardContent><p>{formatBytes(summary.memory_working_set_bytes ?? 0)}</p></CardContent></Card>
            <Card data-metrics-card="summary"><CardHeader><CardDescription>Ready pods</CardDescription></CardHeader><CardContent><p>{Math.round(ready)} / {readyPodCount}</p></CardContent></Card>
            <Card data-metrics-card="summary"><CardHeader><CardDescription>Container restarts</CardDescription></CardHeader><CardContent><p>{Math.round(restarts)}</p></CardContent></Card>
          </div>
          <div data-metrics-grid="charts" className="grid">
            <MetricChart key={`cpu:${chartScaleKey}`} title="CPU" icon={Gauge} series={response.series} metrics={['cpu_usage_cores', 'cpu_limit_cores']} valueFormatter={formatCores} timeDomain={liveTimeDomain} />
            <MetricChart key={`memory:${chartScaleKey}`} title="Memory" icon={MemoryStick} series={response.series} metrics={['memory_working_set_bytes', 'memory_limit_bytes']} valueFormatter={formatBytes} timeDomain={liveTimeDomain} />
            <MetricChart key={`network:${chartScaleKey}`} title="Network" icon={Network} series={response.series} metrics={['network_receive_bytes_per_second', 'network_transmit_bytes_per_second']} valueFormatter={value => `${formatBytes(value)}/s`} timeDomain={liveTimeDomain} />
            <MetricChart key={`storage:${chartScaleKey}`} title="Persistent storage" icon={Database} series={response.series} metrics={['persistent_volume_used_bytes', 'persistent_volume_capacity_bytes']} valueFormatter={formatBytes} timeDomain={liveTimeDomain} />
          </div>
        </>
      )}
    </div>
  )
}
