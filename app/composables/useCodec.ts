// Promise-based wrapper around the codec Web Worker.

import type { TransmitMode } from '~/core'

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
    worker = new Worker(new URL('../workers/codec.worker.ts', import.meta.url), { type: 'module' })
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
    encodeText(text: string, passphrase: string, sampleRate = 48000, mode: TransmitMode = 'robust'): Promise<EncodeReply> {
      return call({ type: 'encodeText', text, passphrase, sampleRate, mode, kdf: GUI_KDF })
    },
    encodeFile(filename: string, content: Uint8Array, passphrase: string, sampleRate = 48000, mode: TransmitMode = 'robust'): Promise<EncodeReply> {
      return call({ type: 'encodeFile', filename, content, passphrase, sampleRate, mode, kdf: GUI_KDF }, [content.buffer])
    },
    decode(pcm: Float32Array, passphrase: string, sampleRate = 48000): Promise<DecodeReply> {
      return call({ type: 'decode', pcm, passphrase, sampleRate }, [pcm.buffer])
    },
  }
}
