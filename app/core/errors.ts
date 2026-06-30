// Typed errors so callers (and the GUI) can distinguish failure modes —
// crucially "wrong passphrase" vs "corrupted/incomplete transmission".

export class OhloudError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** The supplied passphrase does not match (key-commitment check failed). */
export class WrongPassphraseError extends OhloudError {
  constructor(message = 'Wrong passphrase') {
    super(message)
  }
}

/** Data is malformed, truncated, or failed authentication/integrity. */
export class CorruptedError extends OhloudError {
  constructor(message = 'Data is corrupted or incomplete') {
    super(message)
  }
}

/** A version / suite / mode this build does not understand. */
export class UnsupportedError extends OhloudError {}

/** Structural parse error (bad magic, out-of-bounds, etc.). */
export class FormatError extends OhloudError {}
