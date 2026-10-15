import type { SetupStatus, UpgradeComponent } from '@/lib/api'

const recoveryComponents: Partial<Record<SetupStatus, UpgradeComponent>> = {
  deploy_dids: 'dids',
  deploy_mediator: 'mediator',
  deploy_vta: 'vta',
  deploy_vtc: 'vtc',
}

export function recoveryComponentForStage(stage?: SetupStatus): UpgradeComponent | null {
  return stage ? recoveryComponents[stage] ?? null : null
}
