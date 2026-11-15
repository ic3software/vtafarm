import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Gauge, MemoryStick, Network, RefreshCw } from 'lucide-react'
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'

import { api, type MetricsLiveSample, type MetricsMeta, type MetricsRange, type MetricsResponse, type MetricsScope, type MetricsSeries, type MetricsTarget } from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
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

const componentLabels: Record<string, string> = {
  vta: 'VTA',
  mediator: 'Mediator',
  dids: 'DID Hosting',
  vtc: 'VTC',
  'trust-registry': 'Trust Registry',
}

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

function formatAxisBytes(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let scaled = Math.abs(value)
  let index = 0
  while (scaled >= 1024 && index < units.length - 1) { scaled /= 1024; index += 1 }
  return `${value < 0 ? '-' : ''}${Math.round(scaled)} ${units[index]}`
}

function formatCores(value: number): string {
  if (Math.abs(value) >= 1) return `${Number(value.toFixed(2))} cores`
  const millicores = value * 1000
  const fractionDigits = Math.abs(millicores) < 1 ? 2 : Math.abs(millicores) < 10 ? 1 : 0
  return `${Number(millicores.toFixed(fractionDigits))}m`
}

function formatAxisCores(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 1) {
    const cores = Number(value.toFixed(Math.abs(value) < 10 ? 1 : 0))
    return `${cores} ${cores === 1 ? 'core' : 'cores'}`
  }
  const millicores = value * 1000
  return `${Number(millicores.toFixed(Math.abs(millicores) < 10 ? 1 : 0))}m`
}

function niceAxisStep(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const fraction = value / magnitude
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * magnitude
}

function cpuAxisScale(maxCores: number): { max: number; ticks: number[] } {
  const maxMillicores = Math.max(1, maxCores * 1000)
  if (maxMillicores <= 1) return { max: 0.001, ticks: [0, 0.001] }
  const step = niceAxisStep(maxMillicores / 4)
  const axisMaxMillicores = Math.ceil(maxMillicores / step) * step
  const intervalCount = Math.round(axisMaxMillicores / step)
  return {
    max: axisMaxMillicores / 1000,
    ticks: Array.from({ length: intervalCount + 1 }, (_, index) => (index * step) / 1000),
  }
}

function latestSummary(series: MetricsSeries[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const item of series) {
    const point = item.points.at(-1)
    if (point) result[item.metric] = (result[item.metric] ?? 0) + point.value
  }
  return result
}

function trimLivePoints(points: MetricsSeries['points'], cutoff: number): MetricsSeries['points'] {
  const firstVisible = points.findIndex(point => point.timestamp >= cutoff)
  if (firstVisible < 0) return []
  return points.slice(Math.max(0, firstVisible - 1))
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
  }
  const cutoff = sample.observed_at - windowSeconds
  for (const item of current.series) item.points = trimLivePoints(item.points, cutoff)
  return {
    ...current,
    end: sample.observed_at,
    series: [...current.series],
    summary: { ...current.summary, ...latestSummary(sample.series) },
    warnings: sample.warnings,
  }
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

const tickIntervals: Record<TimeChoice, number> = {
  live: 75,
  '1h': 10 * 60,
  '6h': 30 * 60,
  '24h': 2 * 60 * 60,
  '7d': 12 * 60 * 60,
  '30d': 3 * 24 * 60 * 60,
}

function timeTicks([start, end]: [number, number], range: TimeChoice): number[] {
  const interval = tickIntervals[range]
  const timezoneOffset = new Date(start * 1000).getTimezoneOffset() * 60
  const first = Math.ceil((start - timezoneOffset) / interval) * interval + timezoneOffset
  const ticks: number[] = []
  for (let tick = first; tick <= end; tick += interval) ticks.push(tick)
  return ticks
}

function formatTimeTick(timestamp: number, range: TimeChoice): string {
  const date = new Date(timestamp * 1000)
  if (range === 'live') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (range === '1h' || range === '6h') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (range === '30d') return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  if (date.getHours() === 0) return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  if (range === '7d') return date.toLocaleTimeString([], { hour: 'numeric' })
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function MetricsSkeleton() {
  return (
    <>
      <div data-metrics-grid="summary" className="grid sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Card data-metrics-card="summary" key={index}>
            <CardHeader><Skeleton className="h-3 w-20" /></CardHeader>
            <CardContent><Skeleton className="h-8 w-24" /></CardContent>
          </Card>
        ))}
      </div>
      <div data-metrics-grid="charts" className="grid">
        {Array.from({ length: 3 }, (_, index) => (
          <Card data-metrics-card="chart" key={index}>
            <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
            <CardContent><Skeleton className="h-64 w-full" /></CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

function MetricChart({ title, icon: Icon, series, metrics, valueFormatter, axisValueFormatter = valueFormatter, timeDomain, timeRange }: {
  title: string
  icon: typeof Gauge
  series: MetricsSeries[]
  metrics: string[]
  valueFormatter: (value: number) => string
  axisValueFormatter?: (value: number) => string
  timeDomain: [number, number]
  timeRange: TimeChoice
}) {
  const data = useMemo(() => {
    const rows = metricRows(series, metrics)
    if (timeRange !== 'live' || rows.length === 0) return rows
    const displayRows = [...rows]
    if (displayRows[0].timestamp > timeDomain[0]) {
      displayRows.unshift({ ...displayRows[0], timestamp: timeDomain[0], sampleTimestamp: displayRows[0].timestamp })
    }
    const lastRow = displayRows.at(-1)
    if (lastRow && lastRow.timestamp < timeDomain[1]) {
      displayRows.push({ ...lastRow, timestamp: timeDomain[1], sampleTimestamp: lastRow.sampleTimestamp ?? lastRow.timestamp })
    }
    return displayRows
  }, [series, metrics, timeDomain, timeRange])
  const ticks = useMemo(() => timeTicks(timeDomain, timeRange), [timeDomain, timeRange])
  const dataMax = Math.max(0, ...data.flatMap(row => metrics.map(metric => row[metric] ?? 0)))
  const isCpuChart = metrics.includes('cpu_usage_cores')
  const currentYMax = isCpuChart ? Math.max(0.001, dataMax * 1.08) : (dataMax > 0 ? dataMax * 1.08 : 1)
  const [yDomainMax, setYDomainMax] = useState(currentYMax)
  if (currentYMax > yDomainMax) setYDomainMax(currentYMax)
  const cpuScale = isCpuChart ? cpuAxisScale(yDomainMax) : null
  const axisDomainMax = cpuScale?.max ?? yDomainMax
  const yTicks = cpuScale?.ticks
  const config = Object.fromEntries(metrics.map(metric => [metric, { label: metricLabels[metric], color: metricColors[metric] }])) as ChartConfig
  return (
    <Card data-metrics-card="chart">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0"><Icon aria-hidden="true" />{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? <p className="py-14 text-center text-sm text-muted-foreground">No samples in this range.</p> : (
          <ChartContainer config={config} className="h-64 w-full aspect-auto">
            <ComposedChart data={data} accessibilityLayer margin={{ left: 0, right: 16 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={timeDomain}
                allowDataOverflow
                ticks={ticks}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={32}
                tickFormatter={value => formatTimeTick(Number(value), timeRange)}
              />
              <YAxis domain={[0, axisDomainMax]} ticks={yTicks} allowDataOverflow tickLine={false} axisLine={false} tickMargin={10} width={64} tickFormatter={value => axisValueFormatter(Number(value))} />
              <ChartTooltip content={<ChartTooltipContent
                labelFormatter={(_value, payload) => {
                  const timestamp = payload?.[0]?.payload?.sampleTimestamp ?? payload?.[0]?.payload?.timestamp
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
              {metrics.map(metric => referenceMetrics.has(metric) ? (
                <Line key={metric} type="monotone" dataKey={metric} name={metricLabels[metric]} stroke={metricColors[metric]} strokeDasharray="6 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              ) : (
                <Area key={metric} type="monotone" dataKey={metric} name={metricLabels[metric]} stroke={metricColors[metric]} fill={metricColors[metric]} fillOpacity={0.08} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              ))}
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function SessionMetricsPanel({ sessionId }: { sessionId: string }) {
  const [meta, setMeta] = useState<MetricsMeta | null>(null)
  const [scope, setScope] = useState<Exclude<MetricsScope, 'pod'>>('component')
  const [component, setComponent] = useState('vta')
  const [timeChoice, setTimeChoice] = useState<TimeChoice>('1h')
  const [response, setResponse] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [liveState, setLiveState] = useState<'connecting' | 'connected' | 'degraded'>('connecting')
  const [liveNow, setLiveNow] = useState(() => Math.floor(Date.now() / 1000))
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    api.sessionMetricsMeta(sessionId).then(value => {
      if (!active) return
      setMeta(value)
      setComponent(value.components.includes('vta') ? 'vta' : (value.components[0] ?? 'vta'))
      setScope(value.mode === 'full_stack' ? 'stack' : 'component')
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load metrics') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [sessionId])

  const target = useMemo<MetricsTarget>(() => ({
    scope,
    ...(scope === 'component' ? { component } : {}),
  }), [scope, component])

  useEffect(() => {
    if (!meta) return
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
  }, [sessionId, meta, scope, component, timeChoice, target, refreshKey])

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

  if (!meta && loading) return <div className="metrics-root flex flex-col gap-5"><MetricsSkeleton /></div>
  if (!meta && error.trim().toLowerCase() === 'metrics are not configured') {
    return (
      <div className="metrics-root flex flex-col gap-5">
        <div data-metrics-toolbar><h2>Agent metrics</h2></div>
        <Card data-metrics-state="disabled">
          <CardContent>
            <Empty className="min-h-72">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Activity /></EmptyMedia>
                <EmptyTitle>Monitoring is not enabled</EmptyTitle>
                <EmptyDescription>
                  Monitoring has not been enabled by your administrator. Please contact your administrator for assistance.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    )
  }
  if (!meta) return <Alert variant="destructive"><AlertTriangle /><AlertTitle>Metrics unavailable</AlertTitle><AlertDescription>{error || 'The metrics service could not be reached.'}</AlertDescription></Alert>

  const summary = response?.summary ?? {}
  const ready = summary.pod_ready ?? 0
  const restarts = summary.container_restarts_total ?? 0
  const storageUsed = summary.persistent_volume_used_bytes ?? 0
  const storageCapacity = summary.persistent_volume_capacity_bytes ?? 0
  const selectedPodCount = scope === 'component'
    ? meta.pods.filter(item => item.component === component).length
    : meta.pods.length
  const availableRanges = meta.retention_days >= 30
    ? [...standardRanges, thirtyDayRange]
    : standardRanges
  const observedPodCount = new Set(response?.series.map(item => item.labels?.pod).filter(Boolean)).size
  const readyPodCount = summary.pod_total ?? (selectedPodCount || observedPodCount)
  const chartTimeDomain: [number, number] = timeChoice === 'live'
    ? [liveNow - (meta.live_window_seconds ?? defaultLiveWindowSeconds), liveNow]
    : [response?.start ?? 0, response?.end ?? 0]
  const chartScaleKey = `${timeChoice}:${scope}:${component}:${response?.start ?? 0}`
  const targetChoice = scope === 'stack' ? 'stack' : component

  return (
    <div className="metrics-root flex flex-col gap-5">
      <div data-metrics-toolbar className="flex flex-wrap items-center justify-between gap-4">
        <h2>Agent metrics</h2>
        <div className="ml-auto flex max-w-full items-center gap-2 overflow-x-auto">
          <ToggleGroup type="single" spacing={2} value={timeChoice} onValueChange={value => { if (!value) return; setLoading(true); setResponse(null); setError(''); setLiveState('connecting'); setTimeChoice(value as TimeChoice) }} aria-label="Metrics time range">
            {availableRanges.map(item => <ToggleGroupItem key={item.value} value={item.value}>{item.label}</ToggleGroupItem>)}
          </ToggleGroup>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Refresh metrics"
            disabled={loading}
            onClick={() => {
              setLoading(true)
              setError('')
              setLiveState('connecting')
              setRefreshKey(value => value + 1)
            }}
          >
            <RefreshCw data-icon />
          </Button>
        </div>
      </div>
      {meta.mode === 'full_stack' && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={2}
          value={targetChoice}
          onValueChange={value => {
            if (!value) return
            setLoading(true)
            setResponse(null)
            setError('')
            setLiveState('connecting')
            if (value === 'stack') setScope('stack')
            else { setScope('component'); setComponent(value) }
          }}
          aria-label="Metrics target"
          className="max-w-full flex-wrap justify-start"
        >
          <ToggleGroupItem value="stack">All</ToggleGroupItem>
          {meta.components.map(item => <ToggleGroupItem key={item} value={item}>{componentLabels[item] ?? item}</ToggleGroupItem>)}
        </ToggleGroup>
      )}
      {timeChoice === 'live' && liveState !== 'connected' && (
        <div>
          <Badge variant="secondary">{liveState === 'degraded' ? 'Live connection degraded; reconnecting' : 'Connecting to live metrics'}</Badge>
        </div>
      )}

      {error && <Alert variant="destructive"><AlertTriangle /><AlertTitle>Metrics query problem</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {response?.warnings?.map(warning => <Alert key={warning}><AlertTriangle /><AlertTitle>Partial data</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert>)}

      {loading && !response ? <MetricsSkeleton /> : !response?.series.length ? (
        <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia variant="icon"><Activity /></EmptyMedia><EmptyTitle>No metrics yet</EmptyTitle><EmptyDescription>The selected workload may still be starting, or Prometheus has not scraped its first sample.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <>
          <div data-metrics-grid="summary" className="grid sm:grid-cols-2 lg:grid-cols-5">
            <Card data-metrics-card="summary"><CardHeader><CardDescription>CPU now</CardDescription></CardHeader><CardContent><p>{formatCores(summary.cpu_usage_cores ?? 0)}</p></CardContent></Card>
            <Card data-metrics-card="summary"><CardHeader><CardDescription>Memory now</CardDescription></CardHeader><CardContent><p>{formatBytes(summary.memory_working_set_bytes ?? 0)}</p></CardContent></Card>
            <Card data-metrics-card="summary"><CardHeader><CardDescription>Storage used</CardDescription></CardHeader><CardContent><p>{formatBytes(storageUsed)}</p><span className="mt-1 block text-xs text-muted-foreground">of {formatBytes(storageCapacity)} total</span></CardContent></Card>
            <Card data-metrics-card="summary"><CardHeader><CardDescription>Ready pods</CardDescription></CardHeader><CardContent><p>{Math.round(ready)} / {readyPodCount}</p></CardContent></Card>
            <Card data-metrics-card="summary"><CardHeader><CardDescription>Container restarts</CardDescription></CardHeader><CardContent><p>{Math.round(restarts)}</p></CardContent></Card>
          </div>
          <div data-metrics-grid="charts" className="grid">
            <MetricChart key={`cpu:${chartScaleKey}`} title="CPU" icon={Gauge} series={response.series} metrics={['cpu_usage_cores', 'cpu_limit_cores']} valueFormatter={formatCores} axisValueFormatter={formatAxisCores} timeDomain={chartTimeDomain} timeRange={timeChoice} />
            <MetricChart key={`memory:${chartScaleKey}`} title="Memory" icon={MemoryStick} series={response.series} metrics={['memory_working_set_bytes', 'memory_limit_bytes']} valueFormatter={formatBytes} axisValueFormatter={formatAxisBytes} timeDomain={chartTimeDomain} timeRange={timeChoice} />
            <MetricChart key={`network:${chartScaleKey}`} title="Network" icon={Network} series={response.series} metrics={['network_receive_bytes_per_second', 'network_transmit_bytes_per_second']} valueFormatter={value => `${formatBytes(value)}/s`} axisValueFormatter={value => `${formatAxisBytes(value)}/s`} timeDomain={chartTimeDomain} timeRange={timeChoice} />
          </div>
        </>
      )}
    </div>
  )
}
