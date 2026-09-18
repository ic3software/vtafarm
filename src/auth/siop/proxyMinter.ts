import type { VTAWalletProvider, WalletSessionBlob } from './wallet'

export function bearerFromSessionBlob(blob: WalletSessionBlob): string {
  const authorization = blob.headers?.find(header => header.name.toLowerCase() === 'authorization')
  const match = authorization ? /^\s*Bearer\s+(.+?)\s*$/i.exec(authorization.value) : null
  if (!match?.[1]) {
    throw new Error('The selected wallet identity cannot mint a SIOP login assertion.')
  }
  return match[1]
}

export async function mintIDToken(
  wallet: VTAWalletProvider,
  entryId: string,
  nonce: string,
  rpDID: string,
): Promise<string> {
  const result = await wallet.proxyLogin({
    entryId,
    nonce,
    target: { kind: 'did', did: rpDID },
  })
  return bearerFromSessionBlob(result.sessionBlob)
}
