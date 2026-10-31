import { useEffect, useState } from 'react'
import { memoryMi, memoryOptions } from '@/lib/resourceMemory'
import { api, type ImageOption, type ResourceDefaults, type UpgradeComponent } from '@/lib/api'
import { imageLabel, imageTag } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const components: Array<{ key: UpgradeComponent; label: string }> = [
  { key: 'mediator', label: 'Mediator' },
  { key: 'vtc', label: 'VTC' },
  { key: 'vta', label: 'VTA' },
  { key: 'dids', label: 'DID Hosting' },
  { key: 'trust-registry', label: 'Trust Registry' },
]
const memoryFields = ['memory_request', 'memory_limit'] as const

// Only the VTA pin is exposed for now; the API stores a pin per component.
const imageComponents: Array<{ key: UpgradeComponent; label: string }> = [
  { key: 'vta', label: 'VTA' },
]
// Radix Select rejects an empty item value, so "no pin" needs a sentinel that
// can never collide with a registry image reference.
const FOLLOW_LATEST = '__follow_latest__'
const imageSelectContentStyle = { maxHeight: 'min(18rem, var(--radix-select-content-available-height))' }

export function ResourceDefaultsView() {
  const [saved, setSaved] = useState<ResourceDefaults | null>(null)
  const [draft, setDraft] = useState<ResourceDefaults['resources'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<'saved' | 'restored' | 'image-saved' | ''>('')
  const [reload, setReload] = useState(0)

  const [imageOptions, setImageOptions] = useState<Partial<Record<UpgradeComponent, ImageOption[]>>>({})
  const [savedImages, setSavedImages] = useState<Partial<Record<UpgradeComponent, string>> | null>(null)
  const [draftImages, setDraftImages] = useState<Partial<Record<UpgradeComponent, string>>>({})
  const [imageError, setImageError] = useState('')
  const [imageSaving, setImageSaving] = useState<UpgradeComponent | ''>('')
  const [imageReload, setImageReload] = useState(0)

  useEffect(() => {
    let active = true
    api.adminResourceDefaults().then(data => {
      if (!active) return
      setSaved(data)
      setDraft(data.resources)
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Failed to load resource defaults')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])

  useEffect(() => {
    let active = true
    Promise.all([
      api.adminImageDefaults(),
      ...imageComponents.map(({ key }) => api.adminListImages(key).then(options => [key, options] as const)),
    ]).then(([defaults, ...lists]) => {
      if (!active) return
      setSavedImages(defaults.images)
      setDraftImages(defaults.images)
      setImageOptions(Object.fromEntries(lists))
    }).catch(err => {
      if (active) setImageError(err instanceof Error ? err.message : 'Failed to load image defaults')
    })
    return () => { active = false }
  }, [imageReload])

  const changed = !!draft && !!saved && components.some(({ key }) =>
    memoryFields.some(field => draft[key][field] !== saved.resources[key][field]),
  )

  async function save() {
    if (!draft) return
    setError('')
    setNotice('')
    for (const { key, label } of components) {
      const request = memoryMi(draft[key].memory_request)
      const limit = memoryMi(draft[key].memory_limit)
      if (!Number.isFinite(request) || !Number.isFinite(limit) || request < 16 || limit > 1024 || request > limit) {
        setError(`${label}: request and limit must be between 16Mi and 1Gi, with request ≤ limit.`)
        return
      }
    }
    setSaving(true)
    try {
      const data = await api.adminSaveResourceDefaults(components.map(({ key }) => ({
        component: key,
        memory_request: draft[key].memory_request,
        memory_limit: draft[key].memory_limit,
      })))
      setSaved(data)
      setDraft(data.resources)
      setNotice('saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save resource defaults')
    } finally {
      setSaving(false)
    }
  }

  async function saveImage(component: UpgradeComponent) {
    setError('')
    setNotice('')
    setImageSaving(component)
    try {
      const data = await api.adminSaveImageDefault(component, draftImages[component] ?? '')
      setSavedImages(data.images)
      setDraftImages(data.images)
      setNotice('image-saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save image default')
    } finally {
      setImageSaving('')
    }
  }

  const noticeText = {
    'saved': { title: 'Defaults saved', desc: 'New deployments and capacity estimates will use these values.' },
    'restored': { title: 'Factory defaults restored in the form', desc: 'Save to apply them.' },
    'image-saved': { title: 'Image default saved', desc: 'New agents created by users will preselect this image.' },
  } as const

  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Defaults</h1>
        </div>
      </div>
      {error && <div className="p-alert alert-destructive" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
      {notice && (
        <div className={`p-alert ${notice === 'restored' ? 'alert-info' : 'alert-success'}`} role="status" style={{ marginBottom: 16 }}>
          <div className="grow">
            <p className="alert-title">{noticeText[notice].title}</p>
            <p className="alert-desc">{noticeText[notice].desc}</p>
          </div>
        </div>
      )}

      <div className="p-card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 className="card-title">Image defaults</h3>
          <p className="card-desc">The image preselected for users on the create form. Without a pin, users get whatever the latest tag points to.</p>
        </div>
        <div className="card-content p-col gap-12">
          {imageError ? (
            <div role="alert">
              <p className="p-muted text-sm">{imageError}</p>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setImageError(''); setImageReload(value => value + 1) }}>Retry</button>
            </div>
          ) : !savedImages ? (
            <p className="p-muted" role="status">Loading image defaults…</p>
          ) : imageComponents.map(({ key, label }) => {
            const options = imageOptions[key] ?? []
            const savedImage = savedImages[key] ?? ''
            const draftImage = draftImages[key] ?? ''
            const stale = !!savedImage && !options.some(option => option.image === savedImage)
            const listed = stale ? [{ tag: imageTag(savedImage), image: savedImage }, ...options] : options
            const busy = imageSaving === key
            const selectId = `image-default-${key}`
            return (
              <div key={key}>
                <label className="p-label" htmlFor={selectId}>{label} image</label>
                {listed.length > 0 ? (
                  <Select value={draftImage || FOLLOW_LATEST} disabled={busy}
                    onValueChange={value => {
                      setDraftImages(prev => ({ ...prev, [key]: value === FOLLOW_LATEST ? '' : value }))
                      setNotice('')
                      setError('')
                    }}>
                    <SelectTrigger className="w-full" id={selectId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start"
                      className="w-(--radix-select-trigger-width)" style={imageSelectContentStyle}>
                      <SelectItem value={FOLLOW_LATEST}>Follow 'latest' (no pin)</SelectItem>
                      {listed.map(option => (
                        <SelectItem key={option.image} value={option.image} className="p-mono">
                          {imageLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <input id={selectId} className="p-input p-mono" placeholder="No images available" disabled />
                )}
                {stale && (
                  <div className="field-hint">
                    The pinned image is no longer in the registry. Users get the latest image until you choose another.
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-default" disabled={busy || draftImage === savedImage} onClick={() => void saveImage(key)}>
                    {busy ? 'Saving…' : 'Save image default'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="p-card">
        <div className="card-header">
          <h3 className="card-title">Resource defaults</h3>
          <p className="card-desc">Memory requests and limits for new deployments and capacity estimates.</p>
        </div>
        <div className="card-content">
          {loading ? <p className="p-muted" role="status">Loading defaults…</p> : !draft || !saved ? (
            <button className="btn btn-outline" onClick={() => { setError(''); setLoading(true); setReload(value => value + 1) }}>Retry</button>
          ) : (
            <>
              <div className="table-wrap">
                <table className="p-table">
                  <thead><tr><th>Component</th><th>Memory request</th><th>Memory limit</th></tr></thead>
                  <tbody>
                    {components.map(({ key, label }) => (
                      <tr key={key}>
                        <td>{label}</td>
                        {memoryFields.map(field => {
                          const current = draft[key][field]
                          const values = memoryOptions.includes(current) ? memoryOptions : [current, ...memoryOptions]
                          return (
                            <td key={field}>
                              <Select value={current} disabled={saving} onValueChange={value => {
                                setDraft(prev => prev && ({ ...prev, [key]: { ...prev[key], [field]: value } }))
                                setNotice('')
                                setError('')
                              }}>
                                <SelectTrigger aria-label={`${label} memory ${field === 'memory_request' ? 'request' : 'limit'}`} className="w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>{values.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                              </Select>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td><strong>Fullstack total</strong></td>
                      {memoryFields.map(field => (
                        <td key={field}><strong>{components.reduce((sum, { key }) => sum + memoryMi(draft[key][field]), 0)}Mi</strong></td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                <button className="btn btn-default" disabled={saving || !changed} onClick={save}>{saving ? 'Saving…' : 'Save defaults'}</button>
                <button className="btn btn-outline" disabled={saving} onClick={() => {
                  setDraft(saved.factory_defaults)
                  setError('')
                  setNotice('restored')
                }}>Restore factory defaults</button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
