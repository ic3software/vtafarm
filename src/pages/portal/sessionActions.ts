import { api } from '@/lib/api'

/**
 * Which routes a session's post-provisioning actions call.
 *
 * The portal and the admin panel authenticate with different cookies, and the
 * platform stack is owned by a passkey-less account no admin can impersonate —
 * so it needs the admin twins. Everything else about these flows is identical,
 * which is why the endpoints are a parameter to the shared hooks rather than a
 * second copy of them.
 */
export interface SessionActionApi {
  ackDidsEnroll: (id: string) => Promise<unknown>
  reissueDidsEnroll: (id: string) => Promise<{ dids_admin_enroll_url: string }>
  ackVtcInstall: (id: string) => Promise<unknown>
  reissueVtcInstall: (id: string) => Promise<{ install_url: string; claim_code: string }>
}

export const userSessionActions: SessionActionApi = {
  ackDidsEnroll: api.ackDidsEnroll,
  reissueDidsEnroll: api.reissueDidsEnroll,
  ackVtcInstall: api.ackVtcInstall,
  reissueVtcInstall: api.reissueVtcInstall,
}

export const adminSessionActions: SessionActionApi = {
  ackDidsEnroll: api.adminAckDidsEnroll,
  reissueDidsEnroll: api.adminReissueDidsEnroll,
  ackVtcInstall: api.adminAckVtcInstall,
  reissueVtcInstall: api.adminReissueVtcInstall,
}
