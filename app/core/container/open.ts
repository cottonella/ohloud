import { utf8Decode, wipe } from '../bytes'
import {
  FLAG_COMPRESSED,
  HEADER_AAD_LEN,
  HEADER_LEN,
  TAG_LEN,
} from '../constants'
import { aeadOpen } from '../crypto/aead'
import { deriveEncKey, verifyCommitment } from '../crypto/commitment'
import { deriveMasterKey } from '../crypto/kdf'
import { CorruptedError, FormatError, WrongPassphraseError } from '../errors'
import { decompress } from './compress'
import { parseHeader } from './header'
import { isTextFilename } from './is-text'
import { parseRecord } from './record'

export interface OpenResult {
  filename: string
  content: Uint8Array
  isText: boolean
  /** Decoded UTF-8 text, present iff `isText`. */
  text?: string
}

/**
 * Open an encrypted container (FORMAT.md A.5). Throws:
 *  - WrongPassphraseError  — key-commitment mismatch
 *  - CorruptedError        — auth/integrity/decompress failure
 *  - FormatError / UnsupportedError — structural / version problems
 */
export function open(container: Uint8Array, passphrase: string): OpenResult {
  if (container.length < HEADER_LEN + TAG_LEN)
    throw new FormatError('container too short')

  const headerBytes = container.subarray(0, HEADER_LEN)
  const h = parseHeader(headerBytes)
  const ciphertext = container.subarray(HEADER_LEN)

  if (ciphertext.length !== h.ctLen)
    throw new CorruptedError('ciphertext length mismatch')

  let masterKey: Uint8Array
  try {
    masterKey = deriveMasterKey(passphrase, h.salt, h.kdf)
  }
  catch {
    // Params passed validation but Argon2 still refused (or couldn't allocate on
    // a low-memory device) — surface a typed error, never an untyped throw.
    throw new CorruptedError('key derivation failed')
  }
  if (!verifyCommitment(masterKey, h.commit)) {
    wipe(masterKey)
    throw new WrongPassphraseError()
  }

  const encKey = deriveEncKey(masterKey)
  wipe(masterKey)
  const aad = headerBytes.subarray(0, HEADER_AAD_LEN)

  let plaintext: Uint8Array
  try {
    plaintext = aeadOpen(encKey, h.nonce, aad, ciphertext)
  }
  catch {
    throw new CorruptedError('authentication failed (corrupted or tampered)')
  }
  finally {
    wipe(encKey)
  }

  if (h.flags & FLAG_COMPRESSED) {
    try {
      plaintext = decompress(plaintext)
    }
    catch {
      throw new CorruptedError('decompression failed')
    }
  }

  const record = parseRecord(plaintext)
  const isText = isTextFilename(record.filename)

  return {
    filename: record.filename,
    content: record.content,
    isText,
    text: isText ? utf8Decode(record.content) : undefined,
  }
}
