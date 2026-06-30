import type { SealOptions } from './seal'
import { utf8Encode } from '../bytes'
import { TEXT_FILENAME } from '../constants'
import { seal } from './seal'

/** Seal a UTF-8 text message (becomes a `message.ohloudtxt` payload). */
export function sealText(text: string, passphrase: string, opts?: SealOptions): Uint8Array {
  return seal({ filename: TEXT_FILENAME, content: utf8Encode(text) }, passphrase, opts)
}

/** Seal arbitrary file bytes under the given filename. */
export function sealFile(filename: string, content: Uint8Array, passphrase: string, opts?: SealOptions): Uint8Array {
  return seal({ filename, content }, passphrase, opts)
}
