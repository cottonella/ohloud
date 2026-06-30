// Byte utilities: encoding, big-endian (de)serialization, constant-time compare.

import { FormatError } from './errors'

export function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

export function utf8Decode(b: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(b)
}

export function concat(...arrays: Uint8Array[]): Uint8Array {
  let total = 0
  for (const a of arrays)
    total += a.length
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrays) {
    out.set(a, off)
    off += a.length
  }
  return out
}

/** Constant-time equality (length is allowed to leak; inputs here are fixed-size). */
export function bytesEqualCT(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length)
    return false
  let diff = 0
  for (let i = 0; i < a.length; i++)
    diff |= a[i]! ^ b[i]!
  return diff === 0
}

/** Best-effort zeroization of sensitive byte buffers (JS can't guarantee it). */
export function wipe(...arrays: Uint8Array[]): void {
  for (const a of arrays)
    a.fill(0)
}

export function toHex(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++)
    s += b[i]!.toString(16).padStart(2, '0')
  return s
}

export function fromHex(s: string): Uint8Array {
  if (s.length % 2 !== 0)
    throw new FormatError('hex string has odd length')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++)
    out[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** Append-only big-endian writer. */
export class ByteWriter {
  private parts: Uint8Array[] = []
  private len = 0

  private push(b: Uint8Array): this {
    this.parts.push(b)
    this.len += b.length
    return this
  }

  u8(n: number): this {
    return this.push(new Uint8Array([n & 0xFF]))
  }

  u16(n: number): this {
    const b = new Uint8Array(2)
    new DataView(b.buffer).setUint16(0, n, false)
    return this.push(b)
  }

  u32(n: number): this {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, n, false)
    return this.push(b)
  }

  u64(n: number | bigint): this {
    const b = new Uint8Array(8)
    new DataView(b.buffer).setBigUint64(0, BigInt(n), false)
    return this.push(b)
  }

  bytes(b: Uint8Array): this {
    return this.push(b)
  }

  get length(): number {
    return this.len
  }

  toBytes(): Uint8Array {
    return concat(...this.parts)
  }
}

/** Sequential big-endian reader with bounds checks. */
export class ByteReader {
  private off = 0
  private view: DataView

  constructor(private buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  }

  private need(n: number): void {
    if (this.off + n > this.buf.length)
      throw new FormatError('unexpected end of data')
  }

  u8(): number {
    this.need(1)
    const v = this.view.getUint8(this.off)
    this.off += 1
    return v
  }

  u16(): number {
    this.need(2)
    const v = this.view.getUint16(this.off, false)
    this.off += 2
    return v
  }

  u32(): number {
    this.need(4)
    const v = this.view.getUint32(this.off, false)
    this.off += 4
    return v
  }

  u64(): number {
    this.need(8)
    const v = this.view.getBigUint64(this.off, false)
    this.off += 8
    if (v > BigInt(Number.MAX_SAFE_INTEGER))
      throw new FormatError('64-bit value exceeds safe integer range')
    return Number(v)
  }

  bytes(len: number): Uint8Array {
    this.need(len)
    const v = this.buf.subarray(this.off, this.off + len)
    this.off += len
    return v
  }

  get remaining(): number {
    return this.buf.length - this.off
  }
}
