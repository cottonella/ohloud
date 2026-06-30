// Microphone capture → streaming FrameReceiver. Browser/Electron only.
// Speech DSP (echo cancel / AGC / noise suppression) is disabled — it would
// destroy the tones. Mic blocks are pulled via an inline AudioWorklet (defined
// as a Blob so there's no separate file to bundle).
//
// The live level meter is driven by a SEPARATE AnalyserNode read at ~60 fps, so
// it stays smooth and accurate even while the decoder is busy searching for the
// chirp. The worklet batches samples (~2048) to keep message traffic light.

import type { WireHeader } from '../protocol/wire-header'
import { FrameReceiver } from '../protocol/receiver'
import { rms } from './level'

const CAPTURE_WORKLET = `
class OhloudCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buf = new Float32Array(2048)
    this._n = 0
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && ch.length) {
      for (let i = 0; i < ch.length; i++) {
        this._buf[this._n++] = ch[i]
        if (this._n === this._buf.length) {
          this.port.postMessage(this._buf.slice(0))
          this._n = 0
        }
      }
    }
    return true
  }
}
registerProcessor('ohloud-capture', OhloudCapture)
`

export interface ListenOptions {
  onLevel?: (level: number) => void
  onSync?: (offset: number) => void
  onHeader?: (header: WireHeader, frameSamples: number) => void
  onProgress?: (received: number, total: number) => void
  /** Fires once a complete frame is captured; pass it to `decodePcm`. */
  onComplete?: (framePcm: Float32Array, sampleRate: number) => void
  onError?: (error: Error) => void
}

export interface ListenHandle {
  stop: () => void
}

export async function startListening(opts: ListenOptions = {}): Promise<ListenHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false, channelCount: 1 },
  })
  const ctx = new AudioContext({ sampleRate: 48000 })
  if (ctx.state === 'suspended')
    await ctx.resume()

  const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }))
  await ctx.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)

  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'ohloud-capture')

  // Smooth level meter: tap an AnalyserNode and read it on rAF (fast attack,
  // slow release) — independent of the decode work.
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  source.connect(analyser)
  const levelBuf = new Float32Array(analyser.fftSize)
  let display = 0
  let raf = 0
  const pumpLevel = (): void => {
    analyser.getFloatTimeDomainData(levelBuf)
    const r = rms(levelBuf)
    display = r > display ? r : display * 0.82 + r * 0.18
    opts.onLevel?.(display)
    raf = requestAnimationFrame(pumpLevel)
  }
  raf = requestAnimationFrame(pumpLevel)

  const stopAll = (): void => {
    try {
      cancelAnimationFrame(raf)
      node.port.onmessage = null
      source.disconnect()
      analyser.disconnect()
      node.disconnect()
      for (const track of stream.getTracks())
        track.stop()
      void ctx.close()
    }
    catch {
      // already torn down
    }
  }

  const receiver = new FrameReceiver({
    onSync: opts.onSync,
    onHeader: opts.onHeader,
    onProgress: opts.onProgress,
    onError: (error) => {
      stopAll()
      opts.onError?.(error)
    },
    onComplete: (frame) => {
      stopAll()
      opts.onComplete?.(frame, ctx.sampleRate)
    },
  }, ctx.sampleRate)

  node.port.onmessage = (event: MessageEvent) => {
    receiver.feed(event.data as Float32Array)
  }

  source.connect(node)
  // Some browsers only run a worklet that reaches the destination; route it
  // through a silent gain so nothing is actually heard.
  const sink = ctx.createGain()
  sink.gain.value = 0
  node.connect(sink).connect(ctx.destination)

  return { stop: stopAll }
}
