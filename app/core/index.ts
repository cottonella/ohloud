// Public surface of the ohloud core (audio-free container + crypto layers).
// The acoustic modem / Web Audio layers will be added alongside these.

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
export { CorruptedError, FormatError, OhloudError, UnsupportedError, WrongPassphraseError } from './errors'
