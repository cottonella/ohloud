// Streaming frame receiver: fed mic audio in chunks, it searches a sliding
// window for the sync chirp, reads the RS-protected header to learn the exact
// frame length, then emits the complete frame PCM once enough has arrived.
// Pure logic (no Web Audio) so it's fully testable by feeding chunks.

import type { WireHeader } from './wire-header'
import { demodulateMfsk } from '../dsp/mfsk'
import { CHIRP_LEN, HEADER_SAMPLES, locateChirp, payloadSamples } from './frame'
import { decodeWireHeader, HEADER_CODED_LEN } from './wire-header'

export interface FrameReceiverEvents {
  /** Chirp found at this absolute sample offset. */
  onSync?: (offset: number) => void
  /** Header decoded; frame will be `frameSamples` long (≈ frameSamples/sampleRate s). */
  onHeader?: (header: WireHeader, frameSamples: number) => void
  /** Payload accumulation progress. */
  onProgress?: (received: number, total: number) => void
  /** A full frame is captured — hand it to `decodePcm`. */
  onComplete?: (framePcm: Float32Array) => void
  /** Header was unreadable, etc. */
  onError?: (error: Error) => void
}

type State = 'searching' | 'header' | 'payload' | 'done'

const SYNC_SCORE_MIN = 0.4
// Window searched for the chirp each tick — large enough to always contain a
// just-completed chirp+header, small enough to keep correlation cheap.
const SYNC_WINDOW = 2 * (CHIRP_LEN + HEADER_SAMPLES)

export class FrameReceiver {
  private buf = new Float32Array(0)
  private len = 0
  private state: State = 'searching'
  private chirpAbs = -1
  private frameSamples = 0

  constructor(private readonly events: FrameReceiverEvents = {}) {}

  get isDone(): boolean {
    return this.state === 'done'
  }

  reset(): void {
    this.buf = new Float32Array(0)
    this.len = 0
    this.state = 'searching'
    this.chirpAbs = -1
    this.frameSamples = 0
  }

  feed(chunk: Float32Array): void {
    if (this.state === 'done')
      return
    this.ensureCapacity(this.len + chunk.length)
    this.buf.set(chunk, this.len)
    this.len += chunk.length
    this.process()
  }

  private ensureCapacity(n: number): void {
    if (this.buf.length >= n)
      return
    let cap = Math.max(this.buf.length * 2, 1 << 15)
    while (cap < n)
      cap *= 2
    const next = new Float32Array(cap)
    next.set(this.buf.subarray(0, this.len))
    this.buf = next
  }

  private view(): Float32Array {
    return this.buf.subarray(0, this.len)
  }

  private process(): void {
    if (this.state === 'searching') {
      if (this.len < CHIRP_LEN + HEADER_SAMPLES)
        return
      const start = Math.max(0, this.len - SYNC_WINDOW)
      const { offset, score } = locateChirp(this.view(), start, this.len)
      if (score < SYNC_SCORE_MIN)
        return
      this.chirpAbs = offset
      this.state = 'header'
      this.events.onSync?.(offset)
    }

    if (this.state === 'header') {
      const headerEnd = this.chirpAbs + CHIRP_LEN + HEADER_SAMPLES
      if (this.len < headerEnd)
        return
      const coded = demodulateMfsk(this.view().subarray(this.chirpAbs + CHIRP_LEN, headerEnd), HEADER_CODED_LEN)
      let header: WireHeader
      try {
        header = decodeWireHeader(coded)
      }
      catch (error) {
        this.state = 'done'
        this.events.onError?.(error as Error)
        return
      }
      this.frameSamples = CHIRP_LEN + HEADER_SAMPLES + payloadSamples(header.blockCount)
      this.state = 'payload'
      this.events.onHeader?.(header, this.frameSamples)
    }

    if (this.state === 'payload') {
      const have = this.len - this.chirpAbs
      this.events.onProgress?.(Math.min(have, this.frameSamples), this.frameSamples)
      if (have < this.frameSamples)
        return
      const framePcm = this.view().subarray(this.chirpAbs, this.chirpAbs + this.frameSamples).slice()
      this.state = 'done'
      this.events.onComplete?.(framePcm)
    }
  }
}
