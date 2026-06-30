import { randomBytes, utf8ToBytes } from '@noble/ciphers/utils.js'
import { describe, expect, it } from 'vitest'
import { aeadOpen, aeadSeal } from './aead'
import { deriveCommitment, deriveEncKey, verifyCommitment } from './commitment'
import { hkdfSha256 } from './hkdf'
import { deriveMasterKey } from './kdf'

const FAST = { memLog2: 12, time: 1, lanes: 1 } // 4 MiB — fast for tests

describe('kdf (Argon2id)', () => {
  it('is deterministic for the same inputs', () => {
    const salt = new Uint8Array(16).fill(7)
    const a = deriveMasterKey('correct horse', salt, FAST)
    const b = deriveMasterKey('correct horse', salt, FAST)
    expect(a.length).toBe(32)
    expect([...a]).toEqual([...b])
  })

  it('differs by salt and by passphrase', () => {
    const s1 = new Uint8Array(16).fill(1)
    const s2 = new Uint8Array(16).fill(2)
    const base = deriveMasterKey('pw', s1, FAST)
    expect([...deriveMasterKey('pw', s2, FAST)]).not.toEqual([...base])
    expect([...deriveMasterKey('pw2', s1, FAST)]).not.toEqual([...base])
  })

  it('normalizes the passphrase to NFC', () => {
    const salt = new Uint8Array(16).fill(3)
    // U+00E9 (é) vs U+0065 U+0301 (e + combining accent) → same after NFC
    const a = deriveMasterKey('café', salt, FAST)
    const b = deriveMasterKey('café', salt, FAST)
    expect([...a]).toEqual([...b])
  })
})

describe('hkdf domain separation', () => {
  it('produces different keys for commit vs enc', () => {
    const mk = randomBytes(32)
    expect([...deriveCommitment(mk)]).not.toEqual([...deriveEncKey(mk)])
  })

  it('different info labels diverge', () => {
    const mk = randomBytes(32)
    expect([...hkdfSha256(mk, 'a')]).not.toEqual([...hkdfSha256(mk, 'b')])
  })
})

describe('commitment', () => {
  it('verifies the right key and rejects a wrong one', () => {
    const mk = randomBytes(32)
    const commit = deriveCommitment(mk)
    expect(verifyCommitment(mk, commit)).toBe(true)
    expect(verifyCommitment(randomBytes(32), commit)).toBe(false)
  })
})

describe('authenticated encryption', () => {
  it('round-trips', () => {
    const key = randomBytes(32)
    const nonce = randomBytes(24)
    const aad = utf8ToBytes('header')
    const msg = utf8ToBytes('top secret')
    const ct = aeadSeal(key, nonce, aad, msg)
    expect(ct.length).toBe(msg.length + 16)
    expect([...aeadOpen(key, nonce, aad, ct)]).toEqual([...msg])
  })

  it('fails on wrong AAD', () => {
    const key = randomBytes(32)
    const nonce = randomBytes(24)
    const ct = aeadSeal(key, nonce, utf8ToBytes('h1'), utf8ToBytes('x'))
    expect(() => aeadOpen(key, nonce, utf8ToBytes('h2'), ct)).toThrow()
  })

  it('fails on tampered ciphertext', () => {
    const key = randomBytes(32)
    const nonce = randomBytes(24)
    const aad = utf8ToBytes('h')
    const ct = aeadSeal(key, nonce, aad, utf8ToBytes('hello'))
    ct[0] ^= 0x01
    expect(() => aeadOpen(key, nonce, aad, ct)).toThrow()
  })
})
