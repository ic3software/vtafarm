import { useState } from 'react'
import {
  api,
  type ApiError,
  type UpgradeComponent,
} from '@/lib/api'

const LABELS: Record<UpgradeComponent, string> = {
  vta: 'VTA',
  mediator: 'Mediator',
  dids: 'DID Hosting',
  vtc: 'VTC',
}

const EDIT_COMPONENTS: UpgradeComponent[] = ['vta', 'vtc', 'mediator', 'dids']
const VTA_ONLY_COMPONENTS: UpgradeComponent[] = ['vta']

export function StackConfigEditor({ sessionId, admin = false, vtaOnly = false }: { sessionId?: string; admin?: boolean; vtaOnly?: boolean }) {
  const components = vtaOnly ? VTA_ONLY_COMPONENTS : EDIT_COMPONENTS
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<UpgradeComponent>('vta')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [validating, setValidating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [validated, setValidated] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [rollbackSucceeded, setRollbackSucceeded] = useState(false)
  const [success, setSuccess] = useState('')
  const [completion, setCompletion] = useState('')

  async function showEditor(component: UpgradeComponent) {
    setOpen(true)
    setLoading(true)
    setLoaded(false)
    setActive(component)
    setContent('')
    setError('')
    setRollbackSucceeded(false)
    setSuccess('')
    setCompletion('')
    setValidated(false)
    setConfirmed(false)
    setValidationErrors({})
    try {
      const response = admin
        ? await api.getPlatformStackConfig(component)
        : await api.getStackConfig(sessionId!, component)
      setContent(response.content)
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  function change(value: string) {
    setContent(value)
    setError('')
    setRollbackSucceeded(false)
    setValidated(false)
    setConfirmed(false)
    setSuccess('')
    setValidationErrors(previous => {
      const next = { ...previous }
      delete next[active]
      delete next.component
      return next
    })
  }

  async function validate() {
    setValidating(true)
    setValidated(false)
    setConfirmed(false)
    setError('')
    setRollbackSucceeded(false)
    setSuccess('')
    setValidationErrors({})
    try {
      if (admin) await api.validatePlatformStackConfig(active, content)
      else await api.validateStackConfig(sessionId!, active, content)
      setValidated(true)
      setSuccess('TOML syntax is valid. Review the warning below before applying.')
    } catch (err) {
      const apiErr = err as ApiError
      setValidated(false)
      setValidationErrors(apiErr.validationErrors ?? {})
      setError(apiErr.message || 'TOML validation failed')
    } finally {
      setValidating(false)
    }
  }

  async function apply() {
    setApplying(true)
    setError('')
    setRollbackSucceeded(false)
    setSuccess('')
    try {
      const response = admin
        ? await api.applyPlatformStackConfig(active, content)
        : await api.applyStackConfig(sessionId!, active, content)
      setCompletion(response.status === 'unchanged'
        ? 'No changes were needed.'
        : `Configuration applied. ${LABELS[active]} passed its readiness check.`)
      setValidated(false)
      setConfirmed(false)
      setOpen(false)
    } catch (err) {
      const apiErr = err as ApiError
      setConfirmed(false)
      setRollbackSucceeded(apiErr.rolledBack === true)
      setError(apiErr.rolledBack === true
        ? `Failed to apply ${LABELS[active]} configuration. Rolled back to the previous configuration; ${LABELS[active]} is running again.`
        : apiErr.rolledBack === false
          ? `Failed to apply ${LABELS[active]} configuration. Automatic rollback was incomplete; check ${LABELS[active]} immediately.`
          : apiErr.message || 'Failed to apply configuration')
    } finally {
      setApplying(false)
    }
  }

  const componentError = validationErrors[active]

  return (
    <>
      <div className="p-card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 className="card-title">TOML configuration</h3>
          <p className="card-desc">
            {vtaOnly
              ? 'Edit the runtime configuration for your VTA.'
              : 'Edit the runtime configuration for VTA, VTC, Mediator and DID Hosting.'}
          </p>
        </div>
        <div className="card-content p-col gap-12" style={{ paddingTop: 14 }}>
          <div className="p-row gap-8 wrap-flex">
            {components.map(component => (
              <button key={component} className="btn btn-outline btn-sm" onClick={() => showEditor(component)}>
                Edit {LABELS[component]}
              </button>
            ))}
          </div>
          <span className="field-hint" style={{ marginTop: 0 }}>
            {vtaOnly
              ? 'Applying changes briefly restarts your VTA. If it fails, the previous configuration is restored when possible.'
              : 'Applying changes briefly restarts only the selected component. If it fails, the previous configuration is restored when possible.'}
          </span>
          {completion && <div className="p-alert alert-success"><div className="grow"><p className="alert-desc">{completion}</p></div></div>}
        </div>
      </div>

      {open && (
        <div className="p-overlay">
          <div className="p-dialog" style={{ maxWidth: 960, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="dialog-header">
              <h3 className="dialog-title">Edit {LABELS[active]} configuration</h3>
              <p className="dialog-desc">
                This file may contain credentials. Do not paste it into tickets, chat, or source control.
              </p>
            </div>

            <div className="dialog-body" style={{ overflow: 'auto', flex: 1 }}>
              {validated && success && <div className="p-alert alert-success"><div className="grow"><p className="alert-desc">{success}</p></div></div>}
              {error && (
                <div className={`p-alert ${rollbackSucceeded ? 'alert-warning' : 'alert-destructive'}`}>
                  {rollbackSucceeded && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>}
                  <div className="grow"><p className="alert-desc">{error}</p></div>
                </div>
              )}
              {componentError && (
                <p className="p-mono" style={{ margin: 0, fontSize: 12, color: 'hsl(var(--destructive))', whiteSpace: 'pre-wrap' }}>
                  {componentError}
                </p>
              )}
              {Object.entries(validationErrors).filter(([name]) => name !== active).map(([name, message]) => (
                <p key={name} className="p-mono" style={{ margin: 0, fontSize: 12, color: 'hsl(var(--destructive))', whiteSpace: 'pre-wrap' }}>
                  {LABELS[name as UpgradeComponent] ?? name}: {message}
                </p>
              ))}
              {loading ? (
                <p className="p-muted text-sm">Loading configuration…</p>
              ) : (
                <div>
                  <label className="p-label" htmlFor={`stack-config-${active}`}>{LABELS[active]} config.toml</label>
                  <textarea
                    id={`stack-config-${active}`}
                    className="p-input p-mono"
                    style={{ minHeight: 390, padding: 12, resize: 'vertical', lineHeight: 1.5, whiteSpace: 'pre', tabSize: 2 }}
                    value={content}
                    onChange={event => change(event.target.value)}
                    disabled={validating || applying}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                </div>
              )}
              {validated && (
                <div className="p-alert alert-warning">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                  <div className="grow">
                    <p className="alert-title">{LABELS[active]} will restart</p>
                    <p className="alert-desc">
                      Only {LABELS[active]} is stopped. The API saves its current config, writes this version, and waits for its readiness check. If it fails, the API attempts to restore the previous config and restart {LABELS[active]}.
                    </p>
                    <label className="p-row gap-8 center text-sm" style={{ marginTop: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                      I understand this causes a brief outage.
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="dialog-footer between">
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={loading || validating || applying}>Close</button>
              <div className="p-row gap-8">
                <button className="btn btn-outline" onClick={validate} disabled={!loaded || loading || validating || applying}>
                  {validating ? 'Checking syntax…' : 'Check TOML syntax'}
                </button>
                <button className="btn btn-default" onClick={apply} disabled={!validated || !confirmed || applying}>
                  {applying ? 'Applying & restarting…' : 'Apply & restart'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
