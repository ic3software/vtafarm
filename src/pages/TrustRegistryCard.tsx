import { useEffect, useRef, useState } from 'react'
import { Dialog } from 'radix-ui'
import { api, type ImageOption, type TrustRegistryState } from '@/lib/api'
import { imageLabel } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TrustRegistryDetails } from './TrustRegistryDetails'

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
  const enableRequested = useRef(false)
  const [successRegistry, setSuccessRegistry] = useState<TrustRegistryState | null>(null)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const state = await (admin ? api.adminGetTrustRegistry() : api.getTrustRegistry(sessionId))
        if (active) {
          setRegistry(state)
          setImage(current => current || state.image)
          setLoadError('')
          if (state.state === 'active' && !enabledReported.current) {
            enabledReported.current = true
            if (enableRequested.current) setSuccessRegistry(state)
            else onEnabled?.(state)
          }
        }
      } catch (err) { if (active) setLoadError(err instanceof Error ? err.message : 'Could not load Trust Registry status.') }
    }
    void load()
    const interval = setInterval(() => { void load() }, 3000)
    return () => { active = false; clearInterval(interval) }
  }, [sessionId, admin, refresh, onEnabled])

  async function enable() {
    setSubmitting(true); setError('')
    enableRequested.current = true
    try {
      const state = await (admin ? api.adminEnableTrustRegistry(image) : api.enableTrustRegistry(sessionId, image))
      setRegistry(state)
      if (state.state === 'active' && !enabledReported.current) {
        enabledReported.current = true
        setSuccessRegistry(state)
      }
    } catch (err) {
      enableRequested.current = false
      setError(err instanceof Error ? err.message : 'Could not enable Trust Registry.')
    }
    finally { setSubmitting(false) }
  }
  const enabling = registry?.state === 'enabling'
  const active = registry?.state === 'active'

  function closeSuccess() {
    setSuccessRegistry(null)
    if (successRegistry) onEnabled?.(successRegistry)
  }

  if (active) return successRegistry ? (
    <Dialog.Root open onOpenChange={open => { if (!open) closeSuccess() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="p-overlay" />
        <Dialog.Content className="p-dialog" style={{ maxWidth: 460 }} aria-describedby="trust-registry-success-description">
          <div className="dialog-header">
            <Dialog.Title asChild><h3 className="dialog-title">Trust Registry enabled</h3></Dialog.Title>
          </div>
          <div className="dialog-body">
            <div className="p-alert alert-success" role="status">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 6 9 17l-5-5"/></svg>
              <div className="grow">
                <p className="alert-title">Enablement complete</p>
                <Dialog.Description asChild>
                  <p className="alert-desc" id="trust-registry-success-description">Trust Registry is active and ready to use.</p>
                </Dialog.Description>
              </div>
            </div>
          </div>
          <div className="dialog-footer">
            <Dialog.Close asChild><button type="button" className="btn btn-default">Done</button></Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  ) : null

  return <div className="p-card">
    <div className="card-header"><div className="p-row between center"><h3 className="card-title">Trust Registry</h3>
      {registry && <span className={`p-badge ${active ? 'badge-success' : registry.state === 'failed' ? 'badge-destructive' : enabling ? 'badge-warning' : 'badge-secondary'}`}>{active ? 'Enabled' : enabling ? 'Enabling…' : registry.state === 'failed' ? 'Enablement failed' : 'Not enabled'}</span>}
    </div></div>
    <div className="card-content p-col gap-16" aria-live="polite">
      {loadError && <div role="alert"><p className="p-muted text-sm">{loadError}</p><button className="btn btn-outline btn-sm" onClick={() => setRefresh(n => n + 1)}>Reload status</button></div>}
      {error && <p role="alert" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>}
      {!registry && !loadError && <p className="p-muted text-sm">Loading Registry status…</p>}
      {registry && registry.state !== 'disabled' && <TrustRegistryDetails registry={registry} />}
      {registry && !active && !enabling && <>
        <TrustRegistryImagePicker image={image} onChange={setImage} admin={admin} />
        <div className="p-row center" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-default btn-sm" disabled={!image || submitting || !!loadError} onClick={() => void enable()}>{submitting ? 'Starting…' : registry.state === 'failed' ? 'Retry enablement' : 'Enable Trust Registry'}</button>
        </div>
      </>}
    </div>
  </div>
}
