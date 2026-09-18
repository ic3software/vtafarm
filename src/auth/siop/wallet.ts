export interface WalletTarget {
  kind: 'did'
  did: string
}

export interface WalletProfile {
  did: string
  entryId: string
  bound: boolean
}

export interface WalletSessionBlob {
  headers?: Array<{ name: string; value: string }>
}

export interface VTAWalletProvider {
  walletProfile(params: { target: WalletTarget }): Promise<WalletProfile>
  proxyLogin(params: {
    entryId: string
    nonce: string
    target: WalletTarget
  }): Promise<{ sessionBlob: WalletSessionBlob }>
}

declare global {
  interface Window {
    vtaWallet?: Partial<VTAWalletProvider>
  }
}

export function getWallet(): VTAWalletProvider | undefined {
  const wallet = window.vtaWallet
  if (wallet && typeof wallet.walletProfile === 'function' && typeof wallet.proxyLogin === 'function') {
    return wallet as VTAWalletProvider
  }
  return undefined
}

export function isWalletCancellation(error: unknown): boolean {
  const candidate = error as { name?: string; code?: string; message?: string }
  return candidate?.name === 'NotAllowedError' || candidate?.code === 'USER_CANCELLED' ||
    /cancel(?:led|ed)|denied/i.test(candidate?.message ?? '')
}
