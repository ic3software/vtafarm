import { ALL_COMPONENTS, type SetupMode, type SetupStatus, type UpgradeComponent } from '@/lib/api'

const recoveryComponents: Partial<Record<SetupStatus, UpgradeComponent>> = {
  deploy_dids: 'dids',
  deploy_mediator: 'mediator',
  deploy_vta: 'vta',
  deploy_vtc: 'vtc',
  step_trust_registry: 'trust-registry',
}

export function recoveryComponentForStage(stage?: SetupStatus): UpgradeComponent | null {
  return stage ? recoveryComponents[stage] ?? null : null
}

export function recoveryComponentsForSession(
  mode: SetupMode,
  stage?: SetupStatus,
  trustRegistryEnabled = false,
): UpgradeComponent[] {
  if (!recoveryComponentForStage(stage)) return []
  if (mode === 'vta_only') return stage === 'deploy_vta' ? ['vta'] : []
  return ALL_COMPONENTS.filter(component => component !== 'trust-registry' || trustRegistryEnabled)
}
