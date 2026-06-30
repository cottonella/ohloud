import { describe, expect, it } from 'vitest'
import { fecDecode, FecDecodeError, fecEncode } from './blocks'
import { deinterleave, interleave } from './interleave'

function seq(n: number, start = 0): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++)
    out[i] = (start + i) & 0xFF
  return out
}

describe('interleave', () => {
  it('round-trips and transposes', () => {
    const blocks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]
    const woven = interleave(blocks)
    expect([...woven]).toEqual([1, 4, 2, 5, 3, 6])
    const back = deinterleave(woven, 2)
    expect([...back[0]!]).toEqual([1, 2, 3])
    expect([...back[1]!]).toEqual([4, 5, 6])
  })
})

describe('fEC block codec', () => {
  it('round-trips clean data', () => {
    const blob = seq(2000, 3)
    const { data, meta } = fecEncode(blob)
    expect(meta.origLen).toBe(2000)
    expect([...fecDecode(data, meta)]).toEqual([...blob])
  })

  it('handles a single short block', () => {
    const blob = seq(10)
    const { data, meta } = fecEncode(blob)
    expect(meta.blockCount).toBe(1)
    expect([...fecDecode(data, meta)]).toEqual([...blob])
  })

  it('handles an empty blob', () => {
    const { data, meta } = fecEncode(new Uint8Array(0))
    expect(fecDecode(data, meta).length).toBe(0)
  })

  it('survives a burst spread across blocks by interleaving', () => {
    const blob = seq(3000, 7)
    const { data, meta } = fecEncode(blob) // nsym=64 ⇒ 32 correctable/block
    // A contiguous burst; interleaving spreads it to ~burst/blockCount per block.
    const burst = 20 * meta.blockCount // safely within per-block correction power
    for (let i = 500; i < 500 + burst; i++)
      data[i] = data[i]! ^ 0xFF
    expect([...fecDecode(data, meta)]).toEqual([...blob])
  })

  it('reports unrecoverable blocks when a burst is too large', () => {
    const blob = seq(1500, 1)
    const { data, meta } = fecEncode(blob)
    // Wipe a huge contiguous region → at least one block exceeds correction.
    for (let i = 0; i < data.length; i++)
      data[i] = 0
    let err: unknown
    try {
      fecDecode(data, meta)
    }
    catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(FecDecodeError)
    expect((err as FecDecodeError).failedBlocks.length).toBeGreaterThan(0)
  })
})
