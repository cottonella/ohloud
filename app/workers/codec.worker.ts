// Web Worker: runs the Argon2id-heavy encode/decode off the main thread so the
// UI stays smooth and animated. Transfers PCM/byte buffers to avoid copies.

import { CorruptedError, UnsupportedError, WrongPassphraseError } from '../core/errors'
import { decodePcm, encodeFile, encodeText } from '../core/ohloud'

const ctx = globalThis as unknown as {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}

function classify(err: unknown): string {
  if (err instanceof WrongPassphraseError)
    return 'wrong-passphrase'
  if (err instanceof CorruptedError)
    return 'corrupted'
  if (err instanceof UnsupportedError)
    return 'unsupported'
  return 'error'
}

ctx.onmessage = (e: MessageEvent) => {
  const m = e.data
  try {
    if (m.type === 'encodeText' || m.type === 'encodeFile') {
      const r = m.type === 'encodeText'
        ? encodeText(m.text, m.passphrase, { sampleRate: m.sampleRate, kdf: m.kdf, mode: m.mode })
        : encodeFile(m.filename, m.content, m.passphrase, { sampleRate: m.sampleRate, kdf: m.kdf, mode: m.mode })
      ctx.postMessage(
        { id: m.id, ok: true, pcm: r.pcm, sampleRate: r.sampleRate, durationSec: r.durationSec, containerBytes: r.containerBytes },
        [r.pcm.buffer],
      )
    }
    else if (m.type === 'decode') {
      const r = decodePcm(m.pcm, m.passphrase, { sampleRate: m.sampleRate })
      ctx.postMessage(
        { id: m.id, ok: true, filename: r.filename, isText: r.isText, text: r.text, content: r.content },
        [r.content.buffer],
      )
    }
  }
  catch (err) {
    ctx.postMessage({ id: m.id, ok: false, error: classify(err), message: (err as Error).message })
  }
}
