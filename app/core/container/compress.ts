import { deflateSync, inflateSync } from 'fflate'

/** Raw DEFLATE compression (pure-JS, no WASM). */
export function compress(data: Uint8Array): Uint8Array {
  return deflateSync(data, { level: 6 })
}

export function decompress(data: Uint8Array): Uint8Array {
  return inflateSync(data)
}
