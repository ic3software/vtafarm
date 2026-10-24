import type { TrustRegistryState } from '@/lib/api'
import { trustRegistryPhaseLabel } from '@/lib/trustRegistry'
import { imageTag } from '@/lib/utils'

function statusLabel(registry: TrustRegistryState) {
  if (registry.phase) return trustRegistryPhaseLabel(registry.phase)
  switch (registry.state) {
    case 'active': return 'Enabled'
    case 'enabling': return 'Enabling…'
    case 'failed': return 'Enablement failed'
    default: return 'Not enabled'
  }
}

export function TrustRegistryDetails({ registry }: { registry: TrustRegistryState }) {
  return (
    <div className="p-col gap-12">
      <div className="p-row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong className="text-sm">Status:</strong>
        <span className="text-sm">{statusLabel(registry)}</span>
      </div>
      <div className="p-row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong className="text-sm">Current Image:</strong>
        <span className="p-mono text-xs" style={{ overflowWrap: 'anywhere' }}>
          {registry.image ? imageTag(registry.image) : '—'}
        </span>
      </div>
      {registry.error && (
        <div className="p-alert alert-destructive" role="alert" style={{ alignItems: 'flex-start' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 9v4m0 4h.01M10.3 3.6 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/></svg>
          <div className="grow" style={{ minWidth: 0 }}>
            <p className="alert-title"><strong>Error:</strong></p>
            <pre className="p-mono text-xs" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{registry.error}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
