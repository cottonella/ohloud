// Crypto-free modem round-trip helpers shared by the bench runner and the
// robustness regression test. (Encryption is bytes-in/bytes-out and doesn't
// affect channel robustness, so it's skipped to keep things fast.)

import { sha256 } from '@noble/hashes/sha2.js'
import { fecDecode, fecEncode } from '../app/core/fec/blocks'
import { assembleFrame, parseFrame } from '../app/core/protocol/frame'
import { encodeWireHeader } from '../app/core/protocol/wire-header'

export const SAMPLE_RATE = 48000

export function randomBytes(n: number, seed: number): Uint8Array {
  let s = seed >>> 0
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    out[i] = (s >>> 16) & 0xFF
  }
  return out
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length)
    return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i])
      return false
  }
  return true
}

/** Encrypt-free: blob → FEC → MFSK → chirp-framed PCM. */
export function modemEncodeFrame(blob: Uint8Array): Float32Array {
  const { data, meta } = fecEncode(blob, { nsym: 64 })
  const header = encodeWireHeader({
    protoVer: 1,
    mode: 0,
    fec: 0,
    flags: 0,
    blobLen: blob.length,
    blockCount: meta.blockCount,
    fecNsym: 64,
    tailHash: sha256(blob).subarray(0, 16),
  })
  return assembleFrame(header, data, SAMPLE_RATE)
}

/** PCM → sync + demod → FEC decode → blob (null if unrecoverable). */
export function modemDecodeFrame(pcm: Float32Array): Uint8Array | null {
  try {
    const { header, fecData } = parseFrame(pcm, SAMPLE_RATE)
    return fecDecode(fecData, { origLen: header.blobLen, blockCount: header.blockCount, nsym: header.fecNsym })
  }
  catch {
    return null
  }
}
