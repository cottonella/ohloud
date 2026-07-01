// Public surface of the ohloud core: crypto, container, FEC, DSP/modem,
// framing, the high-level encode/decode pipeline, and audio I/O.

// Audio I/O (browser) + streaming receiver
export { startListening } from './audio/capture'
export type { ListenHandle, ListenOptions } from './audio/capture'

export { peak, rms } from './audio/level'
export { micPermission } from './audio/permissions'
export type { MicPermission } from './audio/permissions'
export { openAudioOutput } from './audio/playback'
export type { AudioOutput, PlaybackHandle } from './audio/playback'
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
export { jingleDurationSec, jingleSamples, synthXylophoneJingle } from './dsp/jingle'
export { DEFAULT_MFSK, demodulateMfsk, modulateMfsk } from './dsp/mfsk'
export type { MfskConfig } from './dsp/mfsk'
export { bytesPerOfdmSymbol, demodulateOfdm, modulateOfdm, ofdmConfig } from './dsp/ofdm'
export type { Constellation, OfdmConfig } from './dsp/ofdm'
export { CorruptedError, FormatError, OhloudError, UnsupportedError, WrongPassphraseError } from './errors'
// FEC (channel coding)
export { fecDecode, FecDecodeError, fecEncode } from './fec/blocks'
export type { FecMeta, FecParams } from './fec/blocks'
// High-level pipeline (primary API)
export { decodePcm, encodeFile, encodeText, estimateDurationSec } from './ohloud'
export type { DecodeOptions, EncodeOptions, EncodeResult, TransmitMode } from './ohloud'
export { FrameReceiver } from './protocol/receiver'
export type { FrameReceiverEvents } from './protocol/receiver'
