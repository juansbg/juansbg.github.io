/**
 * The seal on a player's card.
 *
 * A player's projection carries their role, and the relay must never hold a
 * role in the clear, so the phone and the player agree a key the relay
 * cannot derive: each side makes an ECDH pair, the public halves travel
 * through the relay (the player's in its join, the narrator's in a hello),
 * and both derive the same AES-GCM key. The relay stores and forwards sealed
 * bytes it cannot read. Thirty lines, and the "does the server know who the
 * Family is" question is closed for good.
 */

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const

export interface KeyPair {
  /** The public half as a JSON Web Key, ready to send. */
  pub: string
  privateKey: CryptoKey
}

export const makeKeys = async (): Promise<KeyPair> => {
  const pair = await crypto.subtle.generateKey(CURVE, true, ['deriveKey'])
  return { pub: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey)), privateKey: pair.privateKey }
}

/** Both halves as JSON, so a page can keep its pair across a reload. */
export const exportKeys = async (keys: KeyPair): Promise<string> =>
  JSON.stringify({ pub: keys.pub, priv: await crypto.subtle.exportKey('jwk', keys.privateKey) })

export const importKeys = async (text: string): Promise<KeyPair | null> => {
  try {
    const parsed = JSON.parse(text) as { pub?: unknown; priv?: unknown }
    if (typeof parsed.pub !== 'string' || typeof parsed.priv !== 'object' || parsed.priv === null) return null
    const privateKey = await crypto.subtle.importKey('jwk', parsed.priv as JsonWebKey, CURVE, true, ['deriveKey'])
    return { pub: parsed.pub, privateKey }
  } catch {
    return null
  }
}

/** The key both sides share, from our private half and their public one. */
export const sharedKey = async (privateKey: CryptoKey, peerPub: string): Promise<CryptoKey> => {
  const peer = await crypto.subtle.importKey('jwk', JSON.parse(peerPub) as JsonWebKey, CURVE, true, [])
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peer },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

/** Text in, base64 of nonce and ciphertext out. */
export const seal = async (key: CryptoKey, text: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))
  const out = new Uint8Array(iv.length + cipher.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(cipher), iv.length)
  return toBase64(out)
}

/** The text back, or null if the seal does not fit this key. */
export const unseal = async (key: CryptoKey, sealed: string): Promise<string | null> => {
  try {
    const bytes = fromBase64(sealed)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
