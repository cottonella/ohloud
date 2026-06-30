// Speaker playback of a PCM frame via the Web Audio API. Browser/Electron only.
// Open from a user gesture so the AudioContext is allowed to start.

export interface PlaybackHandle {
  stop: () => void
  /** Resolves when playback finishes (or is stopped). */
  finished: Promise<void>
}

export interface AudioOutput {
  /**
   * The output context's ACTUAL sample rate. Encode at this rate so the buffer
   * plays with no hidden browser resampling: iOS routinely ignores a *requested*
   * rate, and the fallback resampler mangles coherent OFDM (Fast mode) even though
   * it leaves non-coherent MFSK (Robust) intact. Letting the codec resample to
   * this rate with its own windowed-sinc keeps the OFDM grid pristine.
   */
  sampleRate: number
  play: (pcm: Float32Array) => PlaybackHandle
  close: () => void
}

/** Open the speaker at its native rate. Call from a user gesture (required on iOS). */
export async function openAudioOutput(): Promise<AudioOutput> {
  const ctx = new AudioContext()
  if (ctx.state === 'suspended')
    await ctx.resume()

  return {
    sampleRate: ctx.sampleRate,
    play(pcm: Float32Array): PlaybackHandle {
      const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate)
      buffer.getChannelData(0).set(pcm)

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)

      let resolve: () => void = () => {}
      const finished = new Promise<void>((r) => {
        resolve = r
      })
      source.onended = () => resolve()
      source.start()

      return {
        stop: () => {
          try {
            source.stop()
          }
          catch {
            // already stopped
          }
        },
        finished,
      }
    },
    close: () => {
      void ctx.close()
    },
  }
}
