import { describe, expect, it } from 'vitest'
import { ByteReader, bytesEqualCT, ByteWriter, concat, fromHex, toHex, utf8Decode, utf8Encode } from './bytes'
import { FormatError } from './errors'

describe('binary reader/writer', () => {
  it('round-trips integers and bytes big-endian', () => {
    const payload = new Uint8Array([9, 8, 7])
    const buf = new ByteWriter()
      .u8(0xAB)
      .u16(0x1234)
      .u32(0xDEADBEEF)
      .u64(5_000_000_000) // > 2^32
      .bytes(payload)
      .toBytes()

    const rd = new ByteReader(buf)
    expect(rd.u8()).toBe(0xAB)
    expect(rd.u16()).toBe(0x1234)
    expect(rd.u32()).toBe(0xDEADBEEF)
    expect(rd.u64()).toBe(5_000_000_000)
    expect([...rd.bytes(3)]).toEqual([9, 8, 7])
    expect(rd.remaining).toBe(0)
  })

  it('throws on read past end', () => {
    const rd = new ByteReader(new Uint8Array([1, 2]))
    rd.u8()
    expect(() => rd.u32()).toThrow(FormatError)
  })

  it('reads from a subarray view correctly', () => {
    const backing = new Uint8Array([0, 0, 0x12, 0x34, 0])
    const rd = new ByteReader(backing.subarray(2, 4))
    expect(rd.u16()).toBe(0x1234)
  })
})

describe('helpers', () => {
  it('concat joins arrays', () => {
    expect([...concat(new Uint8Array([1]), new Uint8Array([2, 3]))]).toEqual([1, 2, 3])
  })

  it('utf8 round-trips unicode', () => {
    const s = 'héllo 🧸 世界'
    expect(utf8Decode(utf8Encode(s))).toBe(s)
  })

  it('hex round-trips', () => {
    const b = new Uint8Array([0x00, 0x0F, 0xFF, 0xA5])
    expect(toHex(b)).toBe('000fffa5')
    expect([...fromHex('000fffa5')]).toEqual([...b])
  })

  it('bytesEqualCT compares correctly', () => {
    expect(bytesEqualCT(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(bytesEqualCT(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(bytesEqualCT(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
  })
})
