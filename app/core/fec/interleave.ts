// Block interleaving: spreads a contiguous burst of channel errors across many
// FEC blocks, so each block sees only ~burst/blockCount errors (FORMAT.md B.7).

/** Interleave equal-length blocks by transmitting column-by-column. */
export function interleave(blocks: Uint8Array[]): Uint8Array {
  if (blocks.length === 0)
    return new Uint8Array(0)
  const len = blocks[0]!.length
  for (const b of blocks) {
    if (b.length !== len)
      throw new Error('interleave: blocks must be equal length')
  }
  const n = blocks.length
  const out = new Uint8Array(n * len)
  for (let col = 0; col < len; col++) {
    for (let row = 0; row < n; row++)
      out[col * n + row] = blocks[row]![col]!
  }
  return out
}

/** Inverse of `interleave`, given the original block count. */
export function deinterleave(data: Uint8Array, blockCount: number): Uint8Array[] {
  if (blockCount === 0)
    return []
  if (data.length % blockCount !== 0)
    throw new Error('deinterleave: length not divisible by blockCount')
  const len = data.length / blockCount
  const blocks = Array.from({ length: blockCount }, () => new Uint8Array(len))
  for (let col = 0; col < len; col++) {
    for (let row = 0; row < blockCount; row++)
      blocks[row]![col] = data[col * blockCount + row]!
  }
  return blocks
}
