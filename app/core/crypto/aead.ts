import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'

/** XChaCha20-Poly1305 seal. Returns ciphertext with the 16-byte tag appended. */
export function aeadSeal(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, nonce, aad).encrypt(plaintext)
}

/** XChaCha20-Poly1305 open. Throws if authentication fails. */
export function aeadOpen(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, nonce, aad).decrypt(ciphertext)
}
