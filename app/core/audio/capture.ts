// Microphone capture → streaming FrameReceiver. Browser/Electron only.
// Speech DSP (echo cancel / AGC / noise suppression) is disabled — it would
// destroy the tones. Mic blocks are pulled via an inline AudioWorklet (defined
// as a Blob so there's no separate file to bundle).

import type { WireHeader } from '../protocol/wire-header'
import { FrameReceiver } from '../protocol/receiver'
import { rms } from './level'

const CAPTURE_WORKLET = `
class OhloudCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length)
      this.port.postMessage(channel.slice(0))
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

  const stopAll = (): void => {
    try {
      node.port.onmessage = null
      source.disconnect()
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
  })

  node.port.onmessage = (event: MessageEvent) => {
    const block = event.data as Float32Array
    opts.onLevel?.(rms(block))
    receiver.feed(block)
  }

  source.connect(node)
  // Some browsers only run a worklet that reaches the destination; route it
  // through a silent gain so nothing is actually heard.
  const sink = ctx.createGain()
  sink.gain.value = 0
  node.connect(sink).connect(ctx.destination)

  return { stop: stopAll }
}
