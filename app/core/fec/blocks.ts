// FEC block codec: split a blob into Reed–Solomon blocks, each carrying a CRC,
// interleaved for burst resilience (FORMAT.md B.7). This is the channel codec
// the wire layer wraps the encrypted container in.

import { crc16 } from './crc'
import { deinterleave, interleave } from './interleave'
import { raptorDecode, raptorEncoder } from './raptorq'
import { ReedSolomonError, RS_BLOCK_MAX, rsDecode, rsEncode } from './reed-solomon'

const CRC_LEN = 2

export interface FecParams {
  /** Reed–Solomon parity bytes per 255-byte block (default 64 ⇒ RS(255,191)). */
  nsym?: number
  /** Fraction of extra RaptorQ repair blocks (0 = Reed–Solomon only, the default). */
  repair?: number
}

export interface FecMeta {
  origLen: number
  /** Total blocks transmitted — source blocks plus any repair blocks. */
  blockCount: number
  nsym: number
  /** Blocks are RaptorQ encoding symbols (a fountain across blocks), not raw chunks. */
  fountain: boolean
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

/** Encode a blob into interleaved RS+CRC blocks, optionally with RaptorQ repair. */
export function fecEncode(blob: Uint8Array, params: FecParams = {}): { data: Uint8Array, meta: FecMeta } {
  const nsym = params.nsym ?? 64
  const per = payloadPerBlock(nsym)
  if (per <= 0)
    throw new Error('nsym leaves no room for payload')

  const k = Math.max(1, Math.ceil(blob.length / per)) // source symbols/blocks
  const repairBlocks = params.repair ? Math.ceil(params.repair * k) : 0
  const fountain = repairBlocks > 0
  const n = k + repairBlocks
  const rsK = RS_BLOCK_MAX - nsym // data bytes per RS block, incl. CRC

  // Source symbols (per bytes each, final one zero-padded).
  const source: Uint8Array[] = []
  for (let i = 0; i < k; i++) {
    const sym = new Uint8Array(per)
    sym.set(blob.subarray(i * per, i * per + per))
    source.push(sym)
  }
  const enc = fountain ? raptorEncoder(source, per) : null

  const codewords: Uint8Array[] = []
  for (let esi = 0; esi < n; esi++) {
    const payload = fountain ? enc!.symbol(esi) : source[esi]!
    const blockData = new Uint8Array(rsK)
    blockData.set(payload, 0)
    const crc = crc16(payload)
    blockData[per] = (crc >> 8) & 0xFF
    blockData[per + 1] = crc & 0xFF
    codewords.push(rsEncode(blockData, nsym))
  }

  return { data: interleave(codewords), meta: { origLen: blob.length, blockCount: n, nsym, fountain } }
}

/**
 * Decode interleaved RS+CRC blocks back to the original blob. Each block is
 * checked by Reed–Solomon then CRC (catching rare RS miscorrection); a block that
 * fails both is an erasure. In fountain mode a RaptorQ solve reconstructs the
 * source from any K surviving blocks; otherwise every source block must arrive.
 * Throws FecDecodeError when too many blocks are lost to recover.
 */
export function fecDecode(data: Uint8Array, meta: FecMeta): Uint8Array {
  const { nsym, blockCount, origLen, fountain } = meta
  const per = payloadPerBlock(nsym)
  // Defense in depth at the allocation site: degenerate meta (per ≤ 0 → negative
  // buffer size / NaN block math, or blockCount < 1 → divide-by-zero deinterleave)
  // must fail as a recoverable decode error, never an uncaught RangeError.
  if (per <= 0 || blockCount < 1)
    throw new FecDecodeError([])
  const codewords = deinterleave(data, blockCount)

  const survivors: { esi: number, data: Uint8Array }[] = []
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
    survivors.push({ esi: i, data: payload.slice() })
  }

  if (fountain) {
    const k = Math.max(1, Math.ceil(origLen / per))
    const recovered = survivors.length >= k ? raptorDecode(survivors, k, per) : null
    if (!recovered)
      throw new FecDecodeError(failed)
    const out = new Uint8Array(k * per)
    for (let i = 0; i < k; i++)
      out.set(recovered[i]!, i * per)
    return out.subarray(0, origLen)
  }

  if (failed.length)
    throw new FecDecodeError(failed)

  const out = new Uint8Array(blockCount * per)
  for (const { esi, data: payload } of survivors)
    out.set(payload, esi * per)
  return out.subarray(0, origLen)
}
