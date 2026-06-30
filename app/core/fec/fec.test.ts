import { describe, expect, it } from 'vitest'
import { crc16, crc32 } from './crc'
import { gfDiv, gfInverse, gfMul } from './gf256'
import { ReedSolomonError, rsDecode, rsEncode } from './reed-solomon'

// Deterministic PRNG for reproducible corruption patterns.
function lcg(seed: number) {
  let x = seed >>> 0
  return () => {
    x = (x * 1103515245 + 12345) & 0x7FFFFFFF
    return (x >>> 8) & 0xFF
  }
}

function randomData(n: number, seed: number): Uint8Array {
  const next = lcg(seed)
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++)
    out[i] = next()
  return out
}

describe('gF(256) arithmetic', () => {
  it('multiplication has inverses', () => {
    for (let a = 1; a < 256; a++)
      expect(gfMul(a, gfInverse(a))).toBe(1)
  })

  it('div is the inverse of mul', () => {
    expect(gfDiv(gfMul(123, 45), 45)).toBe(123)
    expect(gfMul(0, 99)).toBe(0)
  })
})

describe('reed–Solomon encode/decode', () => {
  const NSYM = 32 // corrects up to 16 errors or 32 erasures

  it('round-trips with no errors', () => {
    const data = randomData(100, 1)
    const code = rsEncode(data, NSYM)
    expect(code.length).toBe(132)
    expect([...rsDecode(code, NSYM)]).toEqual([...data])
  })

  it('corrects up to nsym/2 random errors', () => {
    const data = randomData(120, 2)
    const code = rsEncode(data, NSYM)
    const corrupt = lcg(7)
    // 16 errors at distinct positions
    const positions = new Set<number>()
    while (positions.size < 16)
      positions.add(corrupt() % code.length)
    for (const p of positions)
      code[p] = code[p]! ^ (1 + (corrupt() & 0x7F))
    expect([...rsDecode(code, NSYM)]).toEqual([...data])
  })

  it('corrects up to nsym erasures', () => {
    const data = randomData(120, 3)
    const code = rsEncode(data, NSYM)
    const erasePos: number[] = []
    for (let i = 0; i < 32; i++) {
      erasePos.push(i * 3 % code.length)
      code[i * 3 % code.length] = 0xFF
    }
    const unique = [...new Set(erasePos)]
    expect([...rsDecode(code, NSYM, unique)]).toEqual([...data])
  })

  it('corrects a mix (2·errors + erasures ≤ nsym)', () => {
    const data = randomData(100, 4)
    const code = rsEncode(data, NSYM)
    // 10 erasures + 10 errors → 2*10 + 10 = 30 ≤ 32
    const erase = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45]
    for (const p of erase)
      code[p] = 0x00
    for (const p of [60, 65, 70, 75, 80, 85, 90, 95, 100, 105])
      code[p] = code[p]! ^ 0x5A
    expect([...rsDecode(code, NSYM, erase)]).toEqual([...data])
  })

  it('throws when there are too many errors', () => {
    const data = randomData(100, 5)
    const code = rsEncode(data, NSYM)
    for (let i = 0; i < 20; i++) // 20 > 16 correctable
      code[i] = code[i]! ^ 0xFF
    expect(() => rsDecode(code, NSYM)).toThrow(ReedSolomonError)
  })
})

describe('cRC', () => {
  it('crc16 (CCITT-FALSE) matches the known "123456789" check value', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x29B1)
  })

  it('crc32 matches the known "123456789" check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xCBF43926)
  })

  it('detects single-bit changes', () => {
    const a = new Uint8Array([1, 2, 3, 4])
    const b = new Uint8Array([1, 2, 3, 5])
    expect(crc16(a)).not.toBe(crc16(b))
    expect(crc32(a)).not.toBe(crc32(b))
  })
})
