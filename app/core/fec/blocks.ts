// FEC block codec: split a blob into Reed–Solomon blocks, each carrying a CRC,
// interleaved for burst resilience (FORMAT.md B.7). This is the channel codec
// the wire layer wraps the encrypted container in.

import { crc16 } from './crc'
import { deinterleave, interleave } from './interleave'
import { ReedSolomonError, RS_BLOCK_MAX, rsDecode, rsEncode } from './reed-solomon'

const CRC_LEN = 2

export interface FecParams {
  /** Reed–Solomon parity bytes per 255-byte block (default 64 ⇒ RS(255,191)). */
  nsym?: number
}

export interface FecMeta {
  origLen: number
  blockCount: number
  nsym: number
}

export class FecDecodeError extends Error {
  readonly failedBlocks: number[]
  constructor(failedBlocks: number[]) {
    super(`unrecoverable FEC blocks: [${failedBlocks.join(', ')}]`)
    this.name = 'FecDecodeError'
    this.failedBlocks = failedBlocks
  }
}

function payloadPerBlock(nsym: number): number {
  return RS_BLOCK_MAX - nsym - CRC_LEN
}

/** Encode a blob into interleaved RS+CRC blocks. */
export function fecEncode(blob: Uint8Array, params: FecParams = {}): { data: Uint8Array, meta: FecMeta } {
  const nsym = params.nsym ?? 64
  const per = payloadPerBlock(nsym)
  if (per <= 0)
    throw new Error('nsym leaves no room for payload')

  const blockCount = Math.max(1, Math.ceil(blob.length / per))
  const k = RS_BLOCK_MAX - nsym // data bytes per block, incl. CRC
  const codewords: Uint8Array[] = []

  for (let i = 0; i < blockCount; i++) {
    const payload = new Uint8Array(per)
    payload.set(blob.subarray(i * per, i * per + per))

    const blockData = new Uint8Array(k)
    blockData.set(payload, 0)
    const crc = crc16(payload)
    blockData[per] = (crc >> 8) & 0xFF
    blockData[per + 1] = crc & 0xFF

    codewords.push(rsEncode(blockData, nsym))
  }

  return { data: interleave(codewords), meta: { origLen: blob.length, blockCount, nsym } }
}

/**
 * Decode interleaved RS+CRC blocks back to the original blob. A block is
 * considered failed if Reed–Solomon cannot correct it OR its CRC mismatches
 * (catching rare RS miscorrection). Throws FecDecodeError listing failed blocks
 * — which a fountain/retransmit layer would later heal.
 */
export function fecDecode(data: Uint8Array, meta: FecMeta): Uint8Array {
  const { nsym, blockCount, origLen } = meta
  const per = payloadPerBlock(nsym)
  const codewords = deinterleave(data, blockCount)

  const out = new Uint8Array(blockCount * per)
  const failed: number[] = []

  for (let i = 0; i < blockCount; i++) {
    let blockData: Uint8Array
    try {
      blockData = rsDecode(codewords[i]!, nsym)
    }
    catch (e) {
      if (e instanceof ReedSolomonError) {
        failed.push(i)
        continue
      }
      throw e
    }

    const payload = blockData.subarray(0, per)
    const crc = (blockData[per]! << 8) | blockData[per + 1]!
    if (crc16(payload) !== crc) {
      failed.push(i)
      continue
    }
    out.set(payload, i * per)
  }

  if (failed.length)
    throw new FecDecodeError(failed)

  return out.subarray(0, origLen)
}
