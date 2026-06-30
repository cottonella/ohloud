// Checksums for per-block error detection (FORMAT.md B.7).

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, xorout 0. */
export function crc16(data: Uint8Array): number {
  let crc = 0xFFFF
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]! << 8
    for (let b = 0; b < 8; b++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF
  }
  return crc & 0xFFFF
}

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++)
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32 (ISO-HDLC / zlib): reflected, init 0xFFFFFFFF, xorout 0xFFFFFFFF. */
export function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++)
    c = CRC32_TABLE[(c ^ data[i]!) & 0xFF]! ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}
