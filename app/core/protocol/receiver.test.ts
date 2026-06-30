import { describe, expect, it } from 'vitest'
import { decodePcm, encodeText } from '../ohloud'
import { chirpSamples, headerSamples } from './frame'
import { FrameReceiver } from './receiver'

const FAST = { memLog2: 12, time: 1, lanes: 1 }
const PW = 'correct horse battery staple'

// Feed a PCM buffer to the receiver in fixed-size chunks (simulating mic blocks).
function feedInChunks(rx: FrameReceiver, pcm: Float32Array, chunk: number): void {
  for (let i = 0; i < pcm.length && !rx.isDone; i += chunk)
    rx.feed(pcm.subarray(i, Math.min(i + chunk, pcm.length)))
}

describe('streaming FrameReceiver', () => {
  it('auto-syncs, reads the header, and emits a decodable frame', () => {
    const msg = 'listen closely 🧸'
    const { pcm } = encodeText(msg, PW, { kdf: FAST })

    // Channel: leading silence + the frame + trailing silence, light noise.
    const buf = new Float32Array(5000 + pcm.length + 5000)
    buf.set(pcm, 5000)
    let x = 5
    for (let i = 0; i < buf.length; i++) {
      x = (x * 1103515245 + 12345) & 0x7FFFFFFF
      buf[i] = buf[i]! + ((x >>> 10) / 0x1FFFFF - 0.5) * 0.03
    }

    let synced = false
    let header = false
    let frame: Float32Array | null = null
    const rx = new FrameReceiver({
      onSync: () => { synced = true },
      onHeader: () => { header = true },
      onComplete: (f) => { frame = f },
    })

    feedInChunks(rx, buf, 1024) // 1024-sample mic blocks

    expect(synced).toBe(true)
    expect(header).toBe(true)
    expect(rx.isDone).toBe(true)
    expect(frame).not.toBeNull()

    const out = decodePcm(frame!, PW)
    expect(out.text).toBe(msg)
  })

  it('reports an error for an unreadable header', () => {
    const { pcm } = encodeText('x', PW, { kdf: FAST })
    const buf = pcm.slice()
    // Wipe the entire header span (after the chirp) so RS cannot recover it.
    const chirp = chirpSamples(48000)
    const header = headerSamples(48000)
    for (let i = chirp; i < chirp + header; i++)
      buf[i] = 0
    let errored = false
    const rx = new FrameReceiver({
      onError: () => {
        errored = true
      },
    })
    feedInChunks(rx, buf, 2048)
    expect(errored).toBe(true)
  })
})
