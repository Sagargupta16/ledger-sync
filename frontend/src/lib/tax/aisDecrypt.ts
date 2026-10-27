/**
 * Decrypt an AIS (Annual Information Statement) JSON export in the browser.
 *
 * Ported from the on-device `parse_ais` of community/itr-agent
 * (`src/parsers/ais.ts`, `decryptAis`; MIT License, copyright 2026 Sagar
 * Gupta), with node:crypto replaced by WebCrypto. The portal's "Download
 * AIS-JSON" export is AES-256-CBC encrypted:
 *   chars[0:32]  hex-encoded 16-byte IV
 *   chars[32:64] hex-encoded 16-byte PBKDF2 salt
 *   rest         base64 (or hex) ciphertext
 *   key          PBKDF2-HMAC-SHA256(password, salt, 1000 iterations, 32 bytes)
 * The password embeds a fixed app pepper between PAN and date of birth. The
 * pepper is reverse-engineered from the AIS utility (verified across four
 * independent open-source implementations), NOT documented by the Income Tax
 * Department, so it can rotate; un-peppered variants stay as fallbacks.
 *
 * Privacy: the PAN and date of birth exist only as arguments to `decryptAis`
 * and the passwords derived from them for `deriveKey`. Nothing here stores,
 * logs or sends them, and no error message repeats them.
 */

const AIS_PEPPER = 'GQ39%*g'
const PBKDF2_ITERATIONS = 1000

export class AisDecryptError extends Error {}

function passwordCandidates(pan: string, dob: string): string[] {
  const dob8 = dob.replaceAll(/[-/.\s]/g, '')
  const panText = pan.trim()
  return [
    panText.toLowerCase() + AIS_PEPPER + dob8,
    panText.toLowerCase() + dob8,
    panText.toUpperCase() + dob8,
    panText.toUpperCase() + AIS_PEPPER + dob8,
  ]
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.floor(hex.length / 2))
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

function base64Bytes(encoded: string): Uint8Array<ArrayBuffer> {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0
  return bytes
}

/** Both decodings: a pure-hex string also passes the base64 charset test. */
function ciphertextCandidates(tail: string): Uint8Array<ArrayBuffer>[] {
  const out: Uint8Array<ArrayBuffer>[] = []
  if (/^[A-Za-z0-9+/]+=*$/.test(tail)) {
    try {
      out.push(base64Bytes(tail))
    } catch {
      // Base64 charset but not valid base64 (bad length); the hex reading may still work.
    }
  }
  if (/^[0-9a-fA-F]+$/.test(tail) && tail.length % 2 === 0) out.push(hexBytes(tail))
  return out
}

/** The header and ciphertext of an encrypted export, or an error naming what is wrong with the file. */
function readEnvelope(fileText: string) {
  let payload = fileText.trim()
  // Some exports wrap the payload as a JSON string literal.
  if (payload.startsWith('"')) {
    try {
      payload = String(JSON.parse(payload))
    } catch {
      // leave as-is
    }
  }
  if (payload.length < 96) throw new AisDecryptError('This file is too short to be an encrypted AIS JSON export.')
  if (!/^[0-9a-fA-F]{64}/.test(payload)) {
    throw new AisDecryptError(
      'This is not the encrypted AIS JSON. On the AIS portal choose Download, then JSON (not the PDF or the CSV).',
    )
  }
  const ciphertexts = ciphertextCandidates(payload.slice(64).replaceAll(/[\r\n]/g, ''))
  if (ciphertexts.length === 0) {
    throw new AisDecryptError('The encrypted part is neither base64 nor hex. Is this the AIS JSON download?')
  }
  return { iv: hexBytes(payload.slice(0, 32)), salt: hexBytes(payload.slice(32, 64)), ciphertexts }
}

/** The AES-256 key one password candidate derives from the file's salt. */
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt'],
  )
}

function isUtf8(bytes: ArrayBuffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

/** The document, or why this key and ciphertext did not give one. */
type Opened = { document: unknown } | 'wrong-key' | 'not-json'

async function openWith(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  ciphertext: Uint8Array<ArrayBuffer>,
): Promise<Opened> {
  let bytes: ArrayBuffer
  try {
    bytes = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext)
  } catch {
    return 'wrong-key' // the PKCS#7 padding check failed
  }
  // Read leniently first: the right key with one stray non-UTF-8 byte in the
  // payload still opens the file. Strictness only tells the failures apart.
  const text = new TextDecoder().decode(bytes)
  try {
    return { document: JSON.parse(text) as unknown }
  } catch {
    // A wrong key passes the padding check about 1 time in 255, and its bytes
    // are then noise that is almost surely not UTF-8 text.
    return /^\s*[[{]/.test(text) && isUtf8(bytes) ? 'not-json' : 'wrong-key'
  }
}

const FORMAT_CHANGED_MESSAGE =
  'Your PAN and date of birth opened the file, but its contents are not JSON: the AIS export format may have changed.'
const WRONG_KEY_MESSAGE =
  'That PAN and date of birth did not open this file. Check that the date of birth matches the one on your PAN (DDMMYYYY) and that this AIS belongs to that PAN. If both are right, the portal may have changed its password scheme.'

/**
 * Decrypt an AIS JSON export to its document. A file that is already plain
 * JSON is returned as parsed, with no password needed. Throws
 * `AisDecryptError` with a message that names the remedy.
 */
export async function decryptAis(fileText: string, credentials: { pan: string; dob: string }): Promise<unknown> {
  if (fileText.trimStart().startsWith('{')) {
    try {
      return JSON.parse(fileText) as unknown
    } catch {
      throw new AisDecryptError('This file starts like JSON but does not parse. Download the AIS JSON again.')
    }
  }
  const { iv, salt, ciphertexts } = readEnvelope(fileText)
  if (!credentials.pan.trim() || !credentials.dob.trim()) {
    throw new AisDecryptError('Enter your PAN and date of birth to open the file.')
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new AisDecryptError('This browser cannot decrypt the file here: it needs a secure (https) page.')
  }

  // A bad password fails the AES padding check, whereas a good one that yields
  // non-JSON means the payload format moved; the remedies differ, so keep them apart.
  let formatChanged = false
  for (const password of passwordCandidates(credentials.pan, credentials.dob)) {
    const key = await deriveKey(password, salt)
    for (const ciphertext of ciphertexts) {
      const result = await openWith(key, iv, ciphertext)
      if (typeof result === 'object') return result.document
      if (result === 'not-json') formatChanged = true
    }
  }
  throw new AisDecryptError(formatChanged ? FORMAT_CHANGED_MESSAGE : WRONG_KEY_MESSAGE)
}
