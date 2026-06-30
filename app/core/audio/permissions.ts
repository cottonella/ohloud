// Microphone permission helpers. Browser/Electron only.

export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

/** Best-effort current mic permission state (not all browsers support query). */
export async function micPermission(): Promise<MicPermission> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return status.state as MicPermission
  }
  catch {
    return 'unknown'
  }
}
