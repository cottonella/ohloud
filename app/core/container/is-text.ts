import { TEXT_EXTENSION } from '../constants'

/** A payload is "text" iff its filename carries the sentinel extension. */
export function isTextFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(TEXT_EXTENSION)
}
