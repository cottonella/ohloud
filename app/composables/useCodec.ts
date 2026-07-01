// Promise-based wrapper around the codec Web Worker, with a main-thread fallback.
//
// The worker keeps the Argon2id-heavy encode/decode off the UI thread. But a Web
// Worker can fail to start in an installed iOS PWA offline (the service worker
// won't serve a worker script, and even an inlined Blob worker is unreliable on
// the first offline use). So we PROBE the worker with a ping; if it doesn't
// answer, we run the identical codec on the main thread. The main thread never
// touches the network, so a send/receive always works offline — it just briefly
// blocks the UI during the key stretch.
import { decodePcm as coreDecode, encodeFile as coreEncodeFile, encodeText as coreEncodeText } from '../core/ohloud'
import CodecWorker from '../workers/codec.worker.ts?worker&inline'

interface Pending {
  resolve: (value: any) => void
  reject: (error: Error) => void
}

let worker: Worker | undefined
let seq = 0
const pending = new Map<number, Pending>()

// Strong but interactive Argon2id (32 MiB, ~3 s in pure JS). Stored per-message
// in the container, so only the sender's choice matters.
const GUI_KDF = { memLog2: 15, time: 3, lanes: 1 }

function getWorker(): Worker {
  if (!worker) {
    worker = new CodecWorker()
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data
      const p = pending.get(m.id)
      if (!p)
        return
      pending.delete(m.id)
      if (m.ok) {
        p.resolve(m)
      }
      else {
        const err = new Error(m.message) as Error & { code?: string }
        err.code = m.error
        p.reject(err)
      }
    }
    // A failed worker rejects everything pending (so nothing hangs) and lets the
    // next request fall through to the main-thread path.
    worker.onerror = () => {
      for (const p of pending.values())
        p.reject(Object.assign(new Error('codec worker failed'), { code: 'worker' }))
      pending.clear()
      worker = undefined
    }
  }
  return worker
}

function call(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ ...msg, id }, transfer)
  })
}

// One-shot liveness probe: does a Web Worker actually run in this context? (It
// doesn't in some offline iOS PWA states.) Cached for the session; if it fails,
// every call uses the main thread instead of hanging.
let workerReady: Promise<boolean> | undefined
function workerUsable(): Promise<boolean> {
  if (!workerReady) {
    workerReady = new Promise<boolean>((resolve) => {
      let w: Worker
      try {
        w = getWorker()
      }
      catch {
        resolve(false)
        return
      }
      const id = ++seq
      const timer = setTimeout(() => {
        pending.delete(id)
        resolve(false)
      }, 2500)
      pending.set(id, {
        resolve: () => { clearTimeout(timer); resolve(true) },
        reject: () => { clearTimeout(timer); resolve(false) },
      })
      try {
        w.postMessage({ type: 'ping', id })
      }
      catch {
        clearTimeout(timer)
        pending.delete(id)
        resolve(false)
      }
    })
  }
  return workerReady
}

// Yield once so the "Wrapping it up safely…" spinner can paint before a blocking
// main-thread run.
const yieldFrame = (): Promise<void> => new Promise(r => setTimeout(r, 0))

export interface EncodeReply {
  pcm: Float32Array
  sampleRate: number
  durationSec: number
  containerBytes: number
}

export interface DecodeReply {
  filename: string
  isText: boolean
  text?: string
  content: Uint8Array
}

export function useCodec() {
  // Warm the probe up front so the first send isn't delayed waiting for it.
  if (import.meta.client)
    void workerUsable()

  return {
    async encodeText(text: string, passphrase: string, sampleRate = 48000, mode: 'robust' | 'fast' = 'robust'): Promise<EncodeReply> {
      if (await workerUsable())
        return call({ type: 'encodeText', text, passphrase, sampleRate, mode, kdf: GUI_KDF })
      await yieldFrame()
      return coreEncodeText(text, passphrase, { sampleRate, kdf: GUI_KDF, mode })
    },
    async encodeFile(filename: string, content: Uint8Array, passphrase: string, sampleRate = 48000, mode: 'robust' | 'fast' = 'robust'): Promise<EncodeReply> {
      if (await workerUsable())
        return call({ type: 'encodeFile', filename, content, passphrase, sampleRate, mode, kdf: GUI_KDF }, [content.buffer])
      await yieldFrame()
      return coreEncodeFile(filename, content, passphrase, { sampleRate, kdf: GUI_KDF, mode })
    },
    async decode(pcm: Float32Array, passphrase: string, sampleRate = 48000): Promise<DecodeReply> {
      if (await workerUsable())
        return call({ type: 'decode', pcm, passphrase, sampleRate }, [pcm.buffer])
      await yieldFrame()
      return coreDecode(pcm, passphrase, { sampleRate })
    },
  }
}
