import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type AdminDashboard, type ApiError, type ImageOption, type PoolBatch } from '@/lib/api'
import { imageLabel, imageTag } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const imageSelectContentStyle = { maxHeight: 'min(18rem, var(--radix-select-content-available-height))' }

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function batchPhase(batch: PoolBatch): { label: string; cls: string } {
  const counts = batch.counts
  if (counts.deleting > 0) return { label: 'Cleaning up', cls: 'badge-warning' }
  if (counts.creating > 0) return { label: 'Preparing', cls: 'badge-warning' }
  if (counts.claiming > 0 || counts.activating > 0) return { label: 'Distributing', cls: 'badge-warning' }
  if (counts.failed > 0) return { label: 'Needs attention', cls: 'badge-destructive' }
  if (counts.waiting > 0) return { label: 'Ready', cls: 'badge-success' }
  if (counts.running > 0) return { label: 'Distributed', cls: 'badge-success' }
  return { label: 'Empty', cls: 'badge-secondary' }
}

export function PoolBatchesView() {
  const navigate = useNavigate()
  const [batches, setBatches] = useState<PoolBatch[]>([])
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  const [images, setImages] = useState<ImageOption[]>([])
  const [label, setLabel] = useState('')
  const [count, setCount] = useState('')
  const [purpose, setPurpose] = useState<PoolBatch['purpose']>('admin_station')
  const [selectedImage, setSelectedImage] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [nextBatches, nextDashboard] = await Promise.all([api.listPoolBatches(), api.adminDashboard()])
      setBatches(nextBatches)
      setDashboard(nextDashboard)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pooled VTA inventory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
      void api.adminListImages('vta').then(options => {
        setImages(options)
        const preferred = options.find(option => option.latest) ?? options[0]
        if (preferred) setSelectedImage(preferred.image)
      }).catch(() => {})
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const needsPolling = useMemo(() => batches.some(batch =>
    batch.counts.creating > 0 || batch.counts.activating > 0 || batch.counts.deleting > 0,
  ), [batches])

  const publicSummary = useMemo(() => batches.reduce((summary, batch) => {
    if (batch.purpose !== 'public_signup') return summary
    summary.batches += 1
    summary.enabled += batch.public_signup_enabled_at ? 1 : 0
    summary.total += batch.counts.total
    summary.preparing += batch.counts.creating
    summary.ready += batch.counts.available
    summary.availableToPublic += batch.public_signup_enabled_at ? batch.counts.available : 0
    summary.reserved += batch.counts.reserved
    summary.handedOut += batch.counts.handed_out
    summary.failedUnclaimed += batch.counts.failed_unclaimed
    return summary
  }, { batches: 0, enabled: 0, total: 0, preparing: 0, ready: 0, availableToPublic: 0, reserved: 0, handedOut: 0, failedUnclaimed: 0 }), [batches])

  useEffect(() => {
    if (!needsPolling) return
    let stopped = false
    let timer: number | undefined
    const poll = async () => {
      await load()
      if (!stopped) timer = window.setTimeout(() => { void poll() }, 3000)
    }
    timer = window.setTimeout(() => { void poll() }, 3000)
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [load, needsPolling])

  const available = dashboard?.estimates.vta_only.count ?? 0
  const parsedCount = Number(count)
  const validCount = Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= available

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!label.trim()) {
      setError('Enter a batch name.')
      return
    }
    if (!validCount) {
      setError(`Enter a number between 1 and ${available}.`)
      return
    }
    if (!selectedImage) {
      setError('Select a VTA image.')
      return
    }
    setCreating(true)
    setError('')
    try {
      const created = await api.createPoolBatch(
        label.trim(), parsedCount, selectedImage, purpose, crypto.randomUUID(),
      )
      navigate(`/admin/pools/${created.id}`)
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.reason === 'insufficient_capacity' && apiError.available !== undefined) {
        setCount(String(apiError.available || ''))
      }
      setError(err instanceof Error ? err.message : 'Failed to create pool batch')
      await load()
    } finally {
      setCreating(false)
    }
  }

  function openBatch(batch: PoolBatch) {
    navigate(`/admin/pools/${batch.id}`)
  }

  function openWithKeyboard(event: KeyboardEvent<HTMLTableRowElement>, batch: PoolBatch) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openBatch(batch)
    }
  }

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>VTA pools</h1>
        </div>
      </div>

      {publicSummary.batches > 0 && (
        <div className="p-card pool-public-overview">
          <div className="card-header with-action">
            <div>
              <h2 className="card-title">Public signup inventory</h2>
              <p className="card-desc">Ready includes paused inventory. Available to public can be claimed right now.</p>
            </div>
            <span className={`p-badge ${publicSummary.enabled > 0 ? 'badge-success' : 'badge-secondary'}`}>
              {publicSummary.enabled} of {publicSummary.batches} enabled
            </span>
          </div>
          <div className="card-content">
            <div className="pool-stats pool-overview-stats">
              <div className="p-stat"><div className="k">Total</div><div className="v">{publicSummary.total}</div></div>
              <div className="p-stat"><div className="k">Ready</div><div className="v">{publicSummary.ready}</div></div>
              <div className="p-stat"><div className="k">Available to public</div><div className="v">{publicSummary.availableToPublic}</div></div>
              <div className="p-stat"><div className="k">Reserved</div><div className="v">{publicSummary.reserved}</div></div>
              <div className="p-stat"><div className="k">Handed out</div><div className="v">{publicSummary.handedOut}</div></div>
            </div>
            {publicSummary.enabled === 0 && publicSummary.ready > 0 && (
              <p className="pool-stock-warning">All public pools are paused. {publicSummary.ready} ready VTA{publicSummary.ready === 1 ? ' is' : 's are'} not publicly available.</p>
            )}
            {publicSummary.enabled > 0 && publicSummary.availableToPublic === 0 && (
              <p className="pool-stock-warning">No VTA is currently available to the public.</p>
            )}
            {(publicSummary.preparing > 0 || publicSummary.failedUnclaimed > 0) && (
              <div className="p-row gap-8 wrap-flex pool-inventory-notes">
                {publicSummary.preparing > 0 && <span className="p-badge badge-warning">{publicSummary.preparing} preparing</span>}
                {publicSummary.failedUnclaimed > 0 && <span className="p-badge badge-destructive">{publicSummary.failedUnclaimed} failed before claim</span>}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-card pool-create-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Create inventory</h3>
          </div>
          <div className="pool-capacity">
            <span className="pool-capacity-value">{dashboard ? available : '—'}</span>
            <span>VTA-only slots available now</span>
          </div>
        </div>
        <form onSubmit={submit} className="pool-create-form">
          <div className="pool-create-grid">
            <div>
              <label className="p-label" htmlFor="pool-label">Batch name</label>
              <input id="pool-label" className="p-input" maxLength={120} placeholder="Linux Plumbers Conference"
                value={label} onChange={event => setLabel(event.target.value)} disabled={creating} />
            </div>
            <div>
              <label className="p-label" htmlFor="pool-count">Number of VTAs</label>
              <input id="pool-count" className="p-input" type="number" min={1} max={Math.max(available, 1)}
                placeholder={available > 0 ? `Up to ${available}` : 'No capacity'}
                value={count} onChange={event => setCount(event.target.value)} disabled={creating || available < 1} />
            </div>
            <div>
              <label className="p-label" htmlFor="pool-purpose">Purpose</label>
              <Select value={purpose} onValueChange={value => setPurpose(value as PoolBatch['purpose'])} disabled={creating}>
                <SelectTrigger className="w-full" id="pool-purpose"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)">
                  <SelectItem value="admin_station">Admin claim station</SelectItem>
                  <SelectItem value="public_signup">Public signup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="p-label" htmlFor="pool-image">VTA image</label>
              {images.length > 0 ? (
                <Select value={selectedImage} onValueChange={setSelectedImage} disabled={creating}>
                  <SelectTrigger className="w-full" id="pool-image">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start"
                    className="w-(--radix-select-trigger-width)" style={imageSelectContentStyle}>
                    {images.map(option => (
                      <SelectItem key={option.image} value={option.image} className="p-mono">
                        {imageLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <input id="pool-image" className="p-input p-mono" placeholder="Loading images…" disabled />
              )}
            </div>
          </div>
          {error && <p className="pool-form-error">{error}</p>}
          <div>
            <button className="btn btn-default" type="submit"
              disabled={creating || !label.trim() || !validCount || !selectedImage}>
              {creating ? 'Creating accounts…' : validCount ? `Create ${parsedCount} pooled VTA${parsedCount === 1 ? '' : 's'}` : 'Create pool'}
            </button>
          </div>
        </form>
      </div>

      <div className="p-row pool-list-head">
        <h2 className="card-title">Batches</h2>
      </div>
      {loading ? (
        <div className="p-card"><div className="p-muted pool-empty-row">Loading…</div></div>
      ) : batches.length === 0 ? (
        <div className="p-empty">
          <div className="ic">◎</div>
          <h3>No pooled VTAs yet</h3>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="p-table pool-batches-table">
            <thead><tr><th>Batch</th><th>Purpose</th><th>Status</th><th>Handed out / Total</th><th>Image</th><th>Created</th><th /></tr></thead>
            <tbody>
              {batches.map(batch => {
                const phase = batchPhase(batch)
                return (
                  <tr key={batch.id} className="pool-row" tabIndex={0} role="link"
                    onClick={() => openBatch(batch)} onKeyDown={event => openWithKeyboard(event, batch)}>
                    <td><strong>{batch.label}</strong><div className="p-muted p-mono">Batch #{batch.id}</div></td>
                    <td>
                      <span className="p-badge badge-secondary">
                        {batch.purpose === 'public_signup'
                          ? `Public signup (${batch.public_signup_enabled_at ? 'Enabled' : 'Paused'})`
                          : 'Admin station'}
                      </span>
                    </td>
                    <td><span className={`p-badge ${phase.cls}`}>{phase.label}</span></td>
                    <td>{batch.counts.handed_out} / {batch.counts.total}</td>
                    <td><span className="p-mono pool-image-tag">{imageTag(batch.vta_image ?? '')}</span></td>
                    <td>{formatCreatedAt(batch.created_at)}</td>
                    <td><button type="button" className="btn btn-outline btn-sm">Open</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
