import { api, type SIOPIdentity, type SIOPMetadata, type SIOPRole, type UserInfo } from '@/lib/api'
import { mintIDToken } from './proxyMinter'
import { getWallet } from './wallet'

export async function loadSIOPCapability(): Promise<{
  metadata: SIOPMetadata
  walletAvailable: boolean
}> {
  const metadata = await api.siopMetadata()
  return { metadata, walletAvailable: Boolean(getWallet()) }
}

async function walletAssertion(role: SIOPRole, purpose: 'login' | 'link') {
  const metadata = await api.siopMetadata()
  if (!metadata.enabled || !metadata.rp_did) {
    throw new Error('VTA Wallet login is not enabled on this server.')
  }
  const wallet = getWallet()
  if (!wallet) {
    throw new Error('VTA Wallet is not available. Enable the extension for this site and reload the page.')
  }
  const profile = await wallet.walletProfile({ target: { kind: 'did', did: metadata.rp_did } })
  if (!profile.did || !profile.entryId) {
    throw new Error('VTA Wallet did not return an identity for this site.')
  }
  if (purpose === 'login' && profile.bound) {
    throw new Error(`This wallet identity is not linked yet. Sign in with your passkey, then link it in ${role === 'admin' ? 'Security' : 'Settings'}.`)
  }
  const challenge = purpose === 'login'
    ? await api.siopLoginChallenge(role, profile.did)
    : await api.siopLinkChallenge(role, profile.did)
  const idToken = await mintIDToken(wallet, profile.entryId, challenge.challenge, metadata.rp_did)
  return { idToken, sessionId: challenge.session_id }
}

export async function loginWithVTAWallet(role: SIOPRole): Promise<UserInfo> {
  const assertion = await walletAssertion(role, 'login')
  const result = await api.siopLoginAuthenticate(role, assertion.sessionId, assertion.idToken)
  return result.user
}

export async function linkVTAWallet(role: SIOPRole, label: string): Promise<SIOPIdentity> {
  const assertion = await walletAssertion(role, 'link')
  return api.siopLinkAuthenticate(role, assertion.sessionId, assertion.idToken, label)
}
