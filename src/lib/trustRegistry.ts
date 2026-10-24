const TRUST_REGISTRY_PHASES: Record<string, string> = {
  queued: 'Waiting to begin',
  preflight: 'Checking compatibility',
  setup_key: 'Preparing Registry setup',
  grant_access: 'Granting Registry setup access',
  provision_identity: 'Creating Registry identity',
  deploy_registry: 'Starting Registry',
  publish_referral: 'Updating community discovery',
  configure_vtc: 'Connecting VTC',
  verify: 'Verifying connection',
  complete: 'Enabled',
}

export function trustRegistryPhaseLabel(phase: string) {
  return TRUST_REGISTRY_PHASES[phase] ?? phase.replaceAll('_', ' ')
}
