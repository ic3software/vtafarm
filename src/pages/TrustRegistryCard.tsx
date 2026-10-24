import { useEffect, useRef, useState } from 'react'
import { api, type ImageOption, type TrustRegistryState } from '@/lib/api'
import { imageLabel } from '@/lib/utils'
import { trustRegistryPhaseLabel } from '@/lib/trustRegistry'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function TrustRegistryImagePicker({ image, onChange, admin = false }: { image: string; onChange: (image: string) => void; admin?: boolean }) {
  const [images, setImages] = useState<ImageOption[]>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const load = admin ? api.adminListImages : api.listImages
    load('trust-registry').then(options => {
      if (!active) return
      setImages(options)
      setError(options.length ? '' : 'No Trust Registry images are available.')
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load Trust Registry images.') })
    return () => { active = false }
  }, [admin, attempt])
  return <div className="p-col gap-8">
    <label className="p-label" htmlFor="trust-registry-image">Trust Registry image</label>
    <Select value={image} onValueChange={onChange} disabled={!images.length}>
      <SelectTrigger id="trust-registry-image" className="w-full"><SelectValue placeholder={error ? 'Images unavailable' : images.length ? 'Select an image' : 'Loading images…'} /></SelectTrigger>
      <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)" style={{ maxHeight: 'min(18rem, var(--radix-select-content-available-height))' }}>
        {images.map(option => <SelectItem key={option.image} value={option.image} className="p-mono">{imageLabel(option)}</SelectItem>)}
      </SelectContent>
    </Select>
    {error && <div role="alert"><p className="p-muted text-sm">{error}</p><button type="button" className="btn btn-outline btn-sm" onClick={() => setAttempt(n => n + 1)}>Reload images</button></div>}
  </div>
}

export function TrustRegistryCard({
  sessionId,
  admin = false,
  onEnabled,
}: {
  sessionId: string
  admin?: boolean
  onEnabled?: (registry: TrustRegistryState) => void
}) {
  const [registry, setRegistry] = useState<TrustRegistryState | null>(null)
  const [image, setImage] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const enabledReported = useRef(false)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const state = await (admin ? api.adminGetTrustRegistry() : api.getTrustRegistry(sessionId))
        if (active) {
          setRegistry(state)
          setImage(current => current || state.image)
          setLoadError('')
        }
      } catch (err) { if (active) setLoadError(err instanceof Error ? err.message : 'Could not load Trust Registry status.') }
    }
    void load()
    const interval = setInterval(() => { void load() }, 3000)
    return () => { active = false; clearInterval(interval) }
  }, [sessionId, admin, refresh])

  async function enable() {
    setSubmitting(true); setError('')
    try {
      const state = await (admin ? api.adminEnableTrustRegistry(image) : api.enableTrustRegistry(sessionId, image))
      setRegistry(state)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not enable Trust Registry.') }
    finally { setSubmitting(false) }
  }
  const enabling = registry?.state === 'enabling'
  const active = registry?.state === 'active'
  useEffect(() => {
    if (!active || !registry || enabledReported.current) return
    enabledReported.current = true
    onEnabled?.(registry)
  }, [active, registry, onEnabled])

  if (active) return null

  return <div className="p-card">
    <div className="card-header"><div className="p-row between center"><h3 className="card-title">Trust Registry</h3>
      {registry && <span className={`p-badge ${active ? 'badge-success' : registry.state === 'failed' ? 'badge-destructive' : enabling ? 'badge-warning' : 'badge-secondary'}`}>{active ? 'Enabled' : enabling ? 'Enabling…' : registry.state === 'failed' ? 'Enablement failed' : 'Not enabled'}</span>}
    </div></div>
    <div className="card-content p-col gap-16" aria-live="polite">
      {loadError && <div role="alert"><p className="p-muted text-sm">{loadError}</p><button className="btn btn-outline btn-sm" onClick={() => setRefresh(n => n + 1)}>Reload status</button></div>}
      {error && <p role="alert" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>}
      {!registry && !loadError && <p className="p-muted text-sm">Loading Registry status…</p>}
      {registry?.phase && registry.phase !== 'complete' && registry.state !== 'disabled' && <p className="text-sm">{trustRegistryPhaseLabel(registry.phase)}</p>}
      {registry?.image && <p className="p-mono text-sm" style={{ overflowWrap: 'anywhere' }}>{registry.image}</p>}
      {registry?.error && <p role="alert" style={{ color: 'hsl(var(--destructive))', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{registry.error}</p>}
      {registry && !active && !enabling && <>
        <TrustRegistryImagePicker image={image} onChange={setImage} admin={admin} />
        <div className="p-row center" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-default btn-sm" disabled={!image || submitting || !!loadError} onClick={() => void enable()}>{submitting ? 'Starting…' : registry.state === 'failed' ? 'Retry enablement' : 'Enable Trust Registry'}</button>
        </div>
      </>}
    </div>
  </div>
}
