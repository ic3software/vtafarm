import { API_BASE, type UserInfo } from './api'

const TYPES = {
  request: 'https://trusttasks.org/spec/auth/oob/request/0.2',
  redeem: 'https://trusttasks.org/spec/auth/oob/redeem/0.2',
  cancel: 'https://trusttasks.org/spec/auth/oob/cancel/0.1',
} as const

export interface KeyringSignInConfig {
  farm_did: string
  link_host: string
  flow: string
  portal_url: string
}

export interface KeyringRequest {
  requestId: string
  claimClosesAt: number
  triggerLink: string
}

export interface KeyringRedeemResult {
  subject: string
  sessionEndsAt: string
  user: UserInfo
}

export interface KeyringAccountChoice {
  bindingId: number
  displayName: string
}

export class KeyringSignInError extends Error {
  readonly code: string
  readonly details: Record<string, unknown>
  readonly retryable: boolean

  constructor(
    code: string,
    message: string,
    details: Record<string, unknown> = {},
    retryable = false,
  ) {
    super(message)
    this.name = 'KeyringSignInError'
    this.code = code
    this.details = details
    this.retryable = retryable
  }
}

interface SigningKey {
  did: string
  verificationMethod: string
  keypair: CryptoKeyPair
}

let signingKey: SigningKey | null = null

export async function fetchKeyringSignInConfig(): Promise<KeyringSignInConfig> {
  const response = await fetch(`${API_BASE}/api/v1/auth/keyring/config`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const body = await response.json().catch(() => ({})) as Partial<KeyringSignInConfig> & { error?: string }
  if (!response.ok || !body.farm_did || !body.link_host || !body.flow || !body.portal_url) {
    throw new Error(body.error ?? 'Keyring sign-in is unavailable.')
  }
  return body as KeyringSignInConfig
}

export async function openKeyringRequest(config: KeyringSignInConfig): Promise<KeyringRequest> {
  signingKey = await generateSigningKey()
  const payload = await send(config, TYPES.request, { purpose: 'login', mode: 'scan' })
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
  const claimClosesAt = typeof payload.claimClosesAt === 'string' ? Date.parse(payload.claimClosesAt) : Number.NaN
  if (!/^[A-Za-z0-9_-]{22,43}$/.test(requestId) || !Number.isFinite(claimClosesAt)) {
    throw new Error('The Farm returned an unreadable Keyring sign-in request.')
  }
  const triggerLink = buildTriggerLink(config, requestId, Math.floor(claimClosesAt / 1000))
  return { requestId, claimClosesAt, triggerLink }
}

export async function redeemKeyringRequest(config: KeyringSignInConfig, requestId: string, signal?: AbortSignal, bindingId?: number): Promise<KeyringRedeemResult> {
  const requestPayload = bindingId
    ? { requestId, ext: { 'com.ic3software.vtafarm': { bindingId } } }
    : { requestId }
  const payload = await send(config, TYPES.redeem, requestPayload, signal)
  const extension = payload.ext as Record<string, unknown> | undefined
  const farm = extension?.['com.ic3software.vtafarm'] as { user?: UserInfo } | undefined
  if (typeof payload.subject !== 'string' || typeof payload.sessionEndsAt !== 'string' || !farm?.user?.unique_id) {
    throw new Error('The Farm completed sign-in without account details.')
  }
  return { subject: payload.subject, sessionEndsAt: payload.sessionEndsAt, user: farm.user }
}

export async function cancelKeyringRequest(config: KeyringSignInConfig, requestId: string): Promise<void> {
  try {
    await send(config, TYPES.cancel, { requestId })
  } catch {
    // Expiry or a wallet decision may have ended it first.
  } finally {
    signingKey = null
  }
}

export function forgetKeyringRequest(): void {
  signingKey = null
}

async function send(config: KeyringSignInConfig, type: string, payload: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (!signingKey) throw new Error('The browser sign-in key is gone; start again.')
  const document = await signDocument({
    id: `urn:uuid:${crypto.randomUUID()}`,
    type,
    issuer: signingKey.did,
    recipient: config.farm_did,
    issuedAt: isoSeconds(new Date()),
    payload,
  }, signingKey)
  const response = await fetch(`${API_BASE}/trust-task/trust-tasks`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(document),
    signal,
  })
  const body = await response.json().catch(() => null) as { type?: string; payload?: Record<string, unknown> } | null
  if (response.ok && body?.payload && !body.type?.includes('/trust-task-error/')) return body.payload

  const errorPayload = body?.payload ?? {}
  const rawCode = typeof errorPayload.code === 'string' ? errorPayload.code : `http${response.status}`
  const code = rawCode.includes(':') ? rawCode.slice(rawCode.lastIndexOf(':') + 1) : rawCode
  throw new KeyringSignInError(
    code,
    typeof errorPayload.message === 'string' ? errorPayload.message : 'The Farm refused this Keyring sign-in.',
    (errorPayload.details as Record<string, unknown>) ?? {},
    errorPayload.retryable === true,
  )
}

async function generateSigningKey(): Promise<SigningKey> {
  const keypair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']) as CryptoKeyPair
  if (keypair.privateKey.extractable) throw new Error('Refusing an extractable sign-in key.')
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keypair.publicKey))
  const multikey = `z${base58Encode(new Uint8Array([0xed, 0x01, ...publicKey]))}`
  const did = `did:key:${multikey}`
  return { did, verificationMethod: `${did}#${multikey}`, keypair }
}

async function signDocument(document: Record<string, unknown>, key: SigningKey): Promise<Record<string, unknown>> {
  const proof = {
    type: 'DataIntegrityProof',
    cryptosuite: 'eddsa-jcs-2022',
    verificationMethod: key.verificationMethod,
    created: isoSeconds(new Date(Date.now() - 60_000)),
    proofPurpose: 'authentication',
  }
  const [proofHash, documentHash] = await Promise.all([
    sha256(jcs(proof)),
    sha256(jcs(document)),
  ])
  const message = new Uint8Array(proofHash.length + documentHash.length)
  message.set(proofHash)
  message.set(documentHash, proofHash.length)
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', key.keypair.privateKey, message))
  return { ...document, proof: { ...proof, proofValue: `z${base58Encode(signature)}` } }
}

function buildTriggerLink(config: KeyringSignInConfig, requestId: string, expiry: number): string {
  const from = config.farm_did.replace(/[&=#%]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  const link = `${config.link_host.replace(/\/$/, '')}/t#_from=${from}&_id=${requestId}&_exp=${expiry}&_type=${config.flow}`
  // eslint-disable-next-line no-control-regex
  if (!/^[\x00-\x7f]*$/.test(link) || link.length > 251) throw new Error('The Keyring sign-in link is too long to encode safely.')
  return link
}

function isoSeconds(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

function jcs(value: unknown): string {
  const seen = new WeakSet<object>()
  const encode = (item: unknown): string => {
    if (item === null || typeof item === 'boolean') return JSON.stringify(item)
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new Error('JCS rejects non-finite numbers.')
      return Object.is(item, -0) ? '0' : String(item)
    }
    if (typeof item === 'string') return JSON.stringify(item)
    if (Array.isArray(item)) {
      if (seen.has(item)) throw new Error('Circular JCS input.')
      seen.add(item)
      const result = `[${item.map(encode).join(',')}]`
      seen.delete(item)
      return result
    }
    if (typeof item === 'object') {
      const object = item as Record<string, unknown>
      if (seen.has(object)) throw new Error('Circular JCS input.')
      seen.add(object)
      const result = `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${encode(object[key])}`).join(',')}}`
      seen.delete(object)
      return result
    }
    throw new Error('Value cannot be represented as JSON.')
  }
  return encode(value)
}

const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''
  const digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] * 256
      digits[index] = carry % 58
      carry = Math.floor(carry / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }
  let result = ''
  for (const byte of bytes) {
    if (byte !== 0) break
    result += '1'
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) result += base58Alphabet[digits[index]]
  return result
}
