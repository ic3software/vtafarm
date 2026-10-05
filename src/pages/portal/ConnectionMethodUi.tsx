import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Dialog } from 'radix-ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { type IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faApple, faGooglePlay, faLinux } from '@fortawesome/free-brands-svg-icons'
import androidPlayStoreQr from '@/assets/android-play-store.svg'
import iosTestflightQr from '@/assets/ios-testflight.svg'

export type ConnectionMethod = 'local' | 'automatic'

const CONNECTION_METHODS: Array<{
  value: ConnectionMethod
  label: string
  downloadTitle: string
  downloads: Array<{
    label: string
    href: string
    icon: IconDefinition
    qr?: { src: string; store: string }
    instructions?: { platform: string; commands: string }
  }>
}> = [
  {
    value: 'automatic',
    label: 'Connect to Keyring',
    downloadTitle: 'Download Keyring',
    downloads: [
      { label: 'Download for iOS', href: 'https://testflight.apple.com/join/NQYt25SQ', icon: faApple, qr: { src: iosTestflightQr, store: 'TestFlight' } },
      { label: 'Google Play', href: 'https://play.google.com/store/apps/details?id=asml.bkc.harvard.wallet', icon: faGooglePlay, qr: { src: androidPlayStoreQr, store: 'Google Play' } },
    ],
  },
  {
    value: 'local',
    label: 'Connect to PNM',
    downloadTitle: 'Download PNM',
    downloads: [
      {
        label: 'Download for Linux',
        href: 'https://download.firstperson.dev/releases/latest/x86/pnm',
        icon: faLinux,
        instructions: { platform: 'Linux', commands: 'chmod +x pnm\n./pnm -h # verify it runs' },
      },
      {
        label: 'Download for macOS',
        href: 'https://download.firstperson.dev/releases/latest/macOS/pnm',
        icon: faApple,
        instructions: { platform: 'macOS', commands: 'chmod +x pnm\nxattr -d com.apple.quarantine pnm\n./pnm -h # verify it runs' },
      },
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
  const [copyFeedback, setCopyFeedback] = useState<{ href: string; status: 'copied' | 'error' } | null>(null)

  async function copyCommands(href: string, commands: string) {
    setCopyFeedback(null)
    try {
      await navigator.clipboard.writeText(commands)
      setCopyFeedback({ href, status: 'copied' })
    } catch {
      setCopyFeedback({ href, status: 'error' })
    }
  }

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
            <Dialog.Root key={download.href} onOpenChange={() => setCopyFeedback(null)}>
              <Dialog.Trigger asChild>
                <button className="btn btn-outline btn-sm" type="button">
                  <FontAwesomeIcon icon={download.icon} aria-hidden="true" />
                  {download.label}
                </button>
              </Dialog.Trigger>
              <Dialog.Overlay className="p-overlay" />
              <Dialog.Content className="p-dialog connection-download-dialog">
                <div className="dialog-header">
                  <Dialog.Title asChild><h3 className="dialog-title">
                    {download.instructions ? `Download PNM for ${download.instructions.platform}` : 'Download Keyring'}
                  </h3></Dialog.Title>
                  <Dialog.Description asChild>
                    <p className="dialog-desc">
                      {download.qr
                        ? <>Scan this QR code to open {download.qr.store} on your device.</>
                        : <>Download PNM, then open a terminal in the folder containing <code className="connection-command">pnm</code> and run these commands.</>}
                    </p>
                  </Dialog.Description>
                </div>
                <div className="dialog-body">
                  {download.qr
                    ? <img className="keyring-download-qr" src={download.qr.src} alt={`${download.qr.store} download QR code`} width={280} height={280} />
                    : download.instructions && (
                      <div className="p-console">
                        <div className="console-head">
                          <div className="dots" aria-hidden="true"><span /><span /><span /></div>
                          <span>{download.instructions.platform}</span>
                          <button
                            className="btn btn-ghost btn-sm pnm-copy-button"
                            type="button"
                            aria-label={`Copy ${download.instructions.platform} commands`}
                            onClick={() => {
                              if (download.instructions) void copyCommands(download.href, download.instructions.commands)
                            }}
                          >
                            {copyFeedback?.href === download.href && copyFeedback.status === 'copied' ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <pre className="pnm-install-commands"><code>{download.instructions.commands}</code></pre>
                      </div>
                    )}
                  {copyFeedback?.href === download.href && (copyFeedback.status === 'copied'
                    ? <span className="sr-only" role="status">Commands copied to clipboard.</span>
                    : <p className="dialog-desc" role="alert">Unable to copy. Select and copy the commands above.</p>)}
                </div>
                <div className="dialog-footer">
                  <Dialog.Close asChild><button className="btn btn-outline" type="button">Close</button></Dialog.Close>
                  <a className="btn btn-default" href={download.href} target="_blank" rel="noopener noreferrer">
                    {download.qr ? `Open ${download.qr.store}` : download.label}
                  </a>
                </div>
              </Dialog.Content>
            </Dialog.Root>
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
      Run <code className="connection-command">./pnm setup</code> on this computer, then paste the Admin DID it generates below.
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
