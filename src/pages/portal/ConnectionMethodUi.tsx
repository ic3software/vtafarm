import { QRCodeSVG } from 'qrcode.react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { type IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faApple, faGooglePlay, faLinux } from '@fortawesome/free-brands-svg-icons'

export type ConnectionMethod = 'local' | 'automatic'

const CONNECTION_METHODS: Array<{
  value: ConnectionMethod
  label: string
  downloadTitle: string
  downloads: Array<{ label: string; href: string; icon: IconDefinition }>
}> = [
  {
    value: 'automatic',
    label: 'Connect to Keyring',
    downloadTitle: 'Download Keyring',
    downloads: [
      { label: 'Download for iOS', href: 'https://testflight.apple.com/join/NQYt25SQ', icon: faApple },
      { label: 'Google Play', href: 'https://play.google.com/store/apps/details?id=asml.bkc.harvard.wallet', icon: faGooglePlay },
    ],
  },
  {
    value: 'local',
    label: 'Connect to PNM',
    downloadTitle: 'Download PNM',
    downloads: [
      { label: 'Download PNM', href: 'https://download.firstperson.dev/pnm/main/pnm', icon: faLinux },
    ],
  },
]

export function ConnectionMethodPicker({ name, value, onChange, disabled, automaticDisabled }: {
  name: string
  value: ConnectionMethod
  onChange: (method: ConnectionMethod) => void
  disabled?: boolean
  automaticDisabled?: boolean
}) {
  const selectedMethod = CONNECTION_METHODS.find(option => option.value === value)

  return (
    <>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} disabled={disabled}>
        <legend className="p-label">How would you like to connect?</legend>
        <div className="connection-methods">
          {CONNECTION_METHODS.map(option => {
            const optionDisabled = option.value === 'automatic' && automaticDisabled
            return (
              <label key={option.value} className={`connection-method connection-method-option${value === option.value ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={value === option.value}
                  disabled={optionDisabled}
                  onChange={() => onChange(option.value)}
                />
                {option.label}
                {option.value === 'automatic' && <span className="p-badge badge-default">Recommended</span>}
              </label>
            )
          })}
        </div>
      </fieldset>
      <div className="connection-downloads p-col gap-8">
        <h4 className="p-label" style={{ margin: 0 }}>{selectedMethod?.downloadTitle}</h4>
        <div className="p-row gap-8 wrap-flex">
          {selectedMethod?.downloads.map(download => (
            <a key={download.href} className="btn btn-outline btn-sm" href={download.href} target="_blank" rel="noopener noreferrer">
              <FontAwesomeIcon icon={download.icon} aria-hidden="true" />
              {download.label}
            </a>
          ))}
        </div>
      </div>
    </>
  )
}

export function KeyringConnectionPanel({ message, qr, expired, remaining, actionLabel, actionDisabled, onAction }: {
  message?: string | null
  qr?: string | null
  expired?: boolean
  remaining?: number
  actionLabel?: string | null
  actionDisabled?: boolean
  onAction?: () => void
}) {
  return (
    <>
      {!expired && message && <p role="status" aria-live="polite" style={{ margin: 0 }}>{message}</p>}

      {(qr || expired) && (
        <div className="connection-qr">
          <div className={`connection-qr-code${expired ? ' is-expired' : ''}`}>
            {qr
              ? <QRCodeSVG value={qr} size={280} level="M" marginSize={4} title="Keyring connection QR code" />
              : <div className="qr-expired-placeholder" aria-hidden="true" />}
            {expired && <span className="qr-expired-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="m6 6 12 12M18 6 6 18"/></svg>
            </span>}
          </div>
          {expired ? (
            <p className="qr-expired-message" role="status" aria-live="polite">
              <strong>QR code expired</strong>
              <span>Click “Generate replacement QR code” below to create a new one.</span>
            </p>
          ) : (
            <p className="qr-expiry" aria-live="off">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              QR code expires in <strong>{Math.floor((remaining ?? 0) / 60).toString().padStart(2, '0')}:{((remaining ?? 0) % 60).toString().padStart(2, '0')}</strong>
            </p>
          )}
        </div>
      )}

      {actionLabel && onAction && (
        <div className="p-row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-outline" type="button" disabled={actionDisabled} onClick={onAction}>
            {actionLabel}
          </button>
        </div>
      )}
    </>
  )
}

export function PnmSetupInstructions() {
  return (
    <p style={{ margin: 0 }}>
      Run <code className="connection-command">pnm setup</code> on this computer, then paste the Admin DID it generates below.
    </p>
  )
}

export function VtaDidCopyField({ vtaDid, copied, onCopy }: {
  vtaDid: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="connection-did-field">
      <span className="p-label">VTA DID</span>
      <div className="p-row gap-12" style={{ alignItems: 'center' }}>
        <p className="p-mono text-xs" style={{ minWidth: 0, flex: 1, margin: 0, overflowWrap: 'anywhere' }}>{vtaDid}</p>
        <button className="btn btn-outline btn-sm" type="button" onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  )
}

export function PnmAdminDidForm({ id, value, onChange, onSubmit, busy, inputDisabled, submitDisabled, submitLabel, busyLabel }: {
  id: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  busy: boolean
  inputDisabled?: boolean
  submitDisabled?: boolean
  submitLabel: string
  busyLabel: string
}) {
  return (
    <form className="p-col gap-16" onSubmit={event => { event.preventDefault(); onSubmit() }}>
      <div>
        <label className="p-label" htmlFor={id}>Admin DID</label>
        <input
          id={id}
          className="p-input p-mono"
          type="text"
          placeholder="did:key:z6Mk…"
          maxLength={128}
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={inputDisabled}
          required
        />
      </div>
      <div className="p-row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-default" type="submit" disabled={submitDisabled}>
          {busy
            ? <><svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>{busyLabel}</>
            : <>{submitLabel} <span className="arrow">→</span></>}
        </button>
      </div>
    </form>
  )
}
