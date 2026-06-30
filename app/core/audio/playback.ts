// Speaker playback of a PCM frame via the Web Audio API. Browser/Electron only.
// Call from a user gesture so the AudioContext is allowed to start.

export interface PlaybackHandle {
  stop: () => void
  /** Resolves when playback finishes (or is stopped). */
  finished: Promise<void>
}

export async function playPcm(pcm: Float32Array, sampleRate = 48000): Promise<PlaybackHandle> {
  const ctx = new AudioContext({ sampleRate })
  if (ctx.state === 'suspended')
    await ctx.resume()

  const buffer = ctx.createBuffer(1, pcm.length, sampleRate)
  buffer.getChannelData(0).set(pcm)

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)

  let resolve: () => void = () => {}
  const finished = new Promise<void>((r) => {
    resolve = r
  })
  source.onended = () => {
    resolve()
    void ctx.close()
  }

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
}
