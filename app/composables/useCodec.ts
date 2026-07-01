// Promise-based wrapper around the codec Web Worker.
//
// The worker is inlined (`?worker&inline`) so it starts from an in-memory Blob
// with no separate network request. This is essential for the offline PWA: iOS
// Safari's service worker does not serve the `new Worker(url)` script fetch from
// cache, so a URL-based worker hangs on airplane mode ("Wrapping it up safely…").
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
    // If the worker fails to start or throws at the top level, reject everything
    // pending so the UI shows an error instead of hanging on "Wrapping it up…".
    worker.onerror = (e: ErrorEvent) => {
      const err = new Error(e.message || 'The codec worker failed to start') as Error & { code?: string }
      err.code = 'worker'
      for (const p of pending.values())
        p.reject(err)
      pending.clear()
      worker = undefined // let the next call rebuild it
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
  return {
    encodeText(text: string, passphrase: string, sampleRate = 48000, mode: 'robust' | 'fast' = 'robust'): Promise<EncodeReply> {
      return call({ type: 'encodeText', text, passphrase, sampleRate, mode, kdf: GUI_KDF })
    },
    encodeFile(filename: string, content: Uint8Array, passphrase: string, sampleRate = 48000, mode: 'robust' | 'fast' = 'robust'): Promise<EncodeReply> {
      return call({ type: 'encodeFile', filename, content, passphrase, sampleRate, mode, kdf: GUI_KDF }, [content.buffer])
    },
    decode(pcm: Float32Array, passphrase: string, sampleRate = 48000): Promise<DecodeReply> {
      return call({ type: 'decode', pcm, passphrase, sampleRate }, [pcm.buffer])
    },
  }
}
