import { randomBytes } from '@noble/ciphers/utils.js'
import { describe, expect, it } from 'vitest'
import { FLAG_COMPRESSED } from '../constants'
import { CorruptedError, WrongPassphraseError } from '../errors'
import { parseHeader } from './header'
import { open } from './open'
import { sealFile, sealText } from './text'

const FAST = { memLog2: 12, time: 1, lanes: 1 } // 4 MiB
const PW = 'correct horse battery staple'

// Deterministic large buffer (noble's randomBytes caps at 64 KiB/call).
function pseudoRandom(n: number): Uint8Array {
  const out = new Uint8Array(n)
  let x = 0x12345678
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7FFFFFFF
    out[i] = (x >>> 16) & 0xFF
  }
  return out
}

describe('container round-trips', () => {
  it('text message', () => {
    const msg = 'hello 🧸 — meet me at 6, key under the mat'
    const container = sealText(msg, PW, { kdf: FAST })
    const out = open(container, PW)
    expect(out.isText).toBe(true)
    expect(out.text).toBe(msg)
    expect(out.filename).toBe('message.ohloudtxt')
  })

  it('binary file', () => {
    const content = randomBytes(2048)
    const container = sealFile('photo.jpg', content, PW, { kdf: FAST })
    const out = open(container, PW)
    expect(out.isText).toBe(false)
    expect(out.filename).toBe('photo.jpg')
    expect([...out.content]).toEqual([...content])
  })

  it('empty content', () => {
    const container = sealFile('empty.bin', new Uint8Array(0), PW, { kdf: FAST })
    expect(open(container, PW).content.length).toBe(0)
  })

  it('unicode filename', () => {
    const container = sealFile('résumé 履歴書.pdf', new Uint8Array([1, 2, 3]), PW, { kdf: FAST })
    expect(open(container, PW).filename).toBe('résumé 履歴書.pdf')
  })

  it('1 MiB payload', () => {
    const content = pseudoRandom(1024 * 1024)
    const container = sealFile('big.bin', content, PW, { kdf: FAST })
    expect([...open(container, PW).content]).toEqual([...content])
  })
})

describe('compression', () => {
  it('sets the flag for compressible data', () => {
    const repetitive = new Uint8Array(5000).fill(65)
    const container = sealFile('a.txt', repetitive, PW, { kdf: FAST })
    expect(parseHeader(container).flags & FLAG_COMPRESSED).toBeTruthy()
  })

  it('leaves the flag clear for incompressible data', () => {
    const container = sealFile('a.bin', randomBytes(5000), PW, { kdf: FAST })
    expect(parseHeader(container).flags & FLAG_COMPRESSED).toBeFalsy()
  })
})

describe('failure modes are distinguishable', () => {
  it('wrong passphrase → WrongPassphraseError', () => {
    const container = sealText('secret', PW, { kdf: FAST })
    expect(() => open(container, 'nope')).toThrow(WrongPassphraseError)
  })

  it('tampered ciphertext → CorruptedError', () => {
    const container = sealText('secret', PW, { kdf: FAST })
    container[container.length - 1] ^= 0x01
    expect(() => open(container, PW)).toThrow(CorruptedError)
  })

  it('tampered header flags (AAD) → CorruptedError', () => {
    const container = sealText('secret', PW, { kdf: FAST })
    container[9] ^= 0xFF // flags byte is AAD-bound but not a KDF input
    expect(() => open(container, PW)).toThrow(CorruptedError)
  })

  it('tampered salt → WrongPassphraseError (commitment mismatch)', () => {
    const container = sealText('secret', PW, { kdf: FAST })
    container[10] ^= 0x01 // salt byte → different master key → commitment fails
    expect(() => open(container, PW)).toThrow(WrongPassphraseError)
  })
})
