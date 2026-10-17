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
        label.trim(), parsedCount, selectedImage, crypto.randomUUID(),
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
            <thead><tr><th>Batch</th><th>Status</th><th>Claimed / Total</th><th>Image</th><th>Created</th><th /></tr></thead>
            <tbody>
              {batches.map(batch => {
                const phase = batchPhase(batch)
                return (
                  <tr key={batch.id} className="pool-row" tabIndex={0} role="link"
                    onClick={() => openBatch(batch)} onKeyDown={event => openWithKeyboard(event, batch)}>
                    <td><strong>{batch.label}</strong><div className="p-muted p-mono">Batch #{batch.id}</div></td>
                    <td><span className={`p-badge ${phase.cls}`}>{phase.label}</span></td>
                    <td>{batch.counts.running + batch.counts.activating} / {batch.counts.total}</td>
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
