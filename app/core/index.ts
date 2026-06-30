// Public surface of the ohloud core: crypto, container, FEC, DSP/modem,
// framing, the high-level encode/decode pipeline, and audio I/O.

// Audio I/O (browser) + streaming receiver
export { startListening } from './audio/capture'
export type { ListenHandle, ListenOptions } from './audio/capture'

export { peak, rms } from './audio/level'
export { micPermission } from './audio/permissions'
export type { MicPermission } from './audio/permissions'
export { playPcm } from './audio/playback'
export type { PlaybackHandle } from './audio/playback'
export * from './constants'
// Container
export type { ContainerHeader } from './container/header'
export { isTextFilename } from './container/is-text'

export { open } from './container/open'

export type { OpenResult } from './container/open'
export type { InnerRecord } from './container/record'
export { seal } from './container/seal'

export type { SealOptions } from './container/seal'
export { sealFile, sealText } from './container/text'

// DSP / modem
export { DEFAULT_MFSK, demodulateMfsk, modulateMfsk } from './dsp/mfsk'
export type { MfskConfig } from './dsp/mfsk'
export { CorruptedError, FormatError, OhloudError, UnsupportedError, WrongPassphraseError } from './errors'
// FEC (channel coding)
export { fecDecode, FecDecodeError, fecEncode } from './fec/blocks'
export type { FecMeta, FecParams } from './fec/blocks'
// High-level pipeline (primary API)
export { decodePcm, encodeFile, encodeText } from './ohloud'
export type { DecodeOptions, EncodeOptions, EncodeResult } from './ohloud'
export { FrameReceiver } from './protocol/receiver'
export type { FrameReceiverEvents } from './protocol/receiver'
