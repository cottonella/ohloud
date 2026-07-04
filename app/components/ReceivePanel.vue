<script setup lang="ts">
import { startListening } from '~/core'

type Stage = 'idle' | 'blocked' | 'listening' | 'receiving' | 'captured' | 'decoding' | 'done' | 'error'

// Unique per instance, so each panel's pixelate filter has its own id.
let filterSeq = 0

const codec = useCodec()
const { celebrate } = useConfetti()
const sound = useXylophone()

const stage = ref<Stage>('idle')
const micLevel = ref(0)
const recvProgress = ref(0)
const passOpen = ref(false)
const errorMsg = ref('')
const result = ref<{ filename: string, isText: boolean, text?: string, content: Uint8Array } | null>(null)
// Received text stays hidden until the recipient chooses to look — it sits as coarse
// pixels that resolve into words on reveal, and dissolve back on hide. Copying works
// either way.
const revealed = ref(false)
const copied = ref(false)
const PIXEL_MAX = 13
// Single progress: 0 = hidden (opaque cover, no pixels seen), 1 = revealed (crisp).
const prog = ref(0)
const filterId = `ohloud-pixelate-${filterSeq++}`
// Coarse blocks that shrink to nothing as we resolve to crisp text.
const pixel = computed(() => PIXEL_MAX * (1 - prog.value))
const cell = computed(() => Math.max(1, pixel.value))
const textFilter = computed(() => (pixel.value > 1.1 ? `url(#${filterId})` : 'none'))
// The opaque cover fades over the first half, so the pixels underneath are only
// visible mid-transition — never while hidden.
const overlayOpacity = computed(() => Math.min(1, Math.max(0, (0.5 - prog.value) / 0.5)))

let listener: { stop: () => void } | null = null
let captured: { pcm: Float32Array, sampleRate: number } | null = null
let pixelRaf = 0
let abortAudio: AbortController | null = null
let retryAudio: (() => void) | null = null

function prefersReducedMotion() {
  return !!(import.meta.client && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

// Ease progress toward a target (easeInOutCubic); the cover fade + pixel resolve
// both follow it, so reveal and hide are exact mirrors.
function animateProg(to: number, duration = 850) {
  cancelAnimationFrame(pixelRaf)
  if (prefersReducedMotion()) {
    prog.value = to
    return
  }
  const from = prog.value
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration)
    const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    prog.value = from + (to - from) * eased
    if (t < 1)
      pixelRaf = requestAnimationFrame(step)
    else prog.value = to
  }
  pixelRaf = requestAnimationFrame(step)
}

function reveal() {
  revealed.value = true
  animateProg(1)
}

function hide() {
  revealed.value = false
  animateProg(0)
}

const insecure = computed(() => import.meta.client && !window.isSecureContext)

const teddyMood = computed(() => {
  if (stage.value === 'listening' || stage.value === 'receiving')
    return 'listening'
  if (stage.value === 'done')
    return 'happy'
  if (stage.value === 'error' || stage.value === 'blocked')
    return 'sad'
  return 'idle'
})

const levelPct = computed(() => Math.min(100, Math.round(micLevel.value * 320)))

async function listen() {
  errorMsg.value = ''
  result.value = null
  revealed.value = false
  copied.value = false
  prog.value = 0
  recvProgress.value = 0
  abortAudio = new AbortController()
  try {
    listener = await startListening({
      // A wedged iOS session (force-closed-and-relaunched app) delivers mic
      // silence behind a lit indicator. First wedge: try the reload experiment
      // (a fresh document in a fully-active app may negotiate a clean session);
      // a wedge that survives the reload gets the guided recovery card.
      signal: abortAudio.signal,
      onWedged: () => {
        // Audio is wedged — drop EVERY context we hold (the UI-sound one
        // included) so the OS can re-establish a clean session during the
        // recovery trip, then guide the user through it. A single surviving
        // context would deadlock the recovery.
        sound.release()
        stage.value = 'blocked'
      },
      onRetryAvailable: (retry) => {
        retryAudio = retry
      },
      onLevel: l => (micLevel.value = l),
      onSync: () => (stage.value = 'receiving'),
      onProgress: (r, t) => (recvProgress.value = t > 0 ? r / t : 0),
      onComplete: (frame, sampleRate) => {
        captured = { pcm: frame, sampleRate }
        stage.value = 'captured'
        passOpen.value = true
      },
      onError: (e) => {
        errorMsg.value = e.message
        stage.value = 'error'
      },
    })
    // The mic session is live now — safe to warm the UI-sound context for the
    // gesture-less success blip. Never before the wedge check (see onWedged).
    sound.unlock()
    stage.value = 'listening'
  }
  catch (e) {
    if ((e as Error).name === 'AbortError') {
      // The user backed out of the recovery wait — not an error.
      stage.value = 'idle'
    }
    else {
      errorMsg.value = (e as Error).name === 'NotAllowedError'
        ? 'Microphone permission was denied.'
        : (e as Error).message
      stage.value = 'error'
    }
  }
  finally {
    abortAudio = null
    retryAudio = null
  }
}

// The Continue tap after the recovery round trip — the user gesture iOS
// requires before it lets audio start again.
function retryBlocked() {
  retryAudio?.()
}

function cancelBlocked() {
  abortAudio?.abort()
}

function stop() {
  listener?.stop()
  listener = null
  stage.value = 'idle'
}

async function onKey(passphrase: string) {
  passOpen.value = false
  if (!captured)
    return
  stage.value = 'decoding'
  try {
    result.value = await codec.decode(captured.pcm.slice(), passphrase, captured.sampleRate)
    stage.value = 'done'
    void celebrate()
    sound.success()
  }
  catch (e) {
    const code = (e as Error & { code?: string }).code
    errorMsg.value = code === 'wrong-passphrase'
      ? 'That password didn\'t fit. Want to try again?'
      : 'The transmission came through incomplete or corrupted.'
    stage.value = 'error'
  }
}

function retryKey() {
  if (captured)
    passOpen.value = true
}

// The received filename is attacker-controlled (decoded from a transmission a
// hostile sender can craft). Strip anything that lets it traverse paths on
// download or visually spoof its extension (RTLO/bidi overrides) — both for the
// `download` attribute and for what we show the user.
function sanitizeFilename(raw: string): string {
  let out = ''
  for (const ch of raw) {
    const c = ch.codePointAt(0)!
    const isControl = c < 0x20 || c === 0x7F
    const isBidi = (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069) || c === 0x200E || c === 0x200F
    if (!isControl && !isBidi)
      out += ch
  }
  out = out.replace(/[/\\]+/g, '_').replace(/^\.+/, '').trim()
  return out.slice(0, 200) || 'download'
}

const safeFilename = computed(() => (result.value ? sanitizeFilename(result.value.filename) : ''))

async function downloadFile() {
  if (!result.value || result.value.isText)
    return
  const bytes = result.value.content
  const { invoke, isTauri } = await import('@tauri-apps/api/core')
  if (isTauri()) {
    // Browser downloads do nothing in a Tauri webview — hand the bytes to the
    // native save command, which prompts with the OS "Save As" dialog.
    await invoke('save_file', { name: safeFilename.value, contents: Array.from(bytes) })
    return
  }
  // .slice() re-homes the bytes onto a plain ArrayBuffer — BlobPart rejects
  // views typed over ArrayBufferLike (they could wrap a SharedArrayBuffer).
  const url = URL.createObjectURL(new Blob([bytes.slice()]))
  const a = document.createElement('a')
  a.href = url
  a.download = safeFilename.value
  a.click()
  URL.revokeObjectURL(url)
}

async function copyText() {
  const text = result.value?.text
  if (!text)
    return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  }
  catch {
    // clipboard unavailable — leave the button as-is
  }
}

function reset() {
  stage.value = 'idle'
  result.value = null
  revealed.value = false
  copied.value = false
  prog.value = 0
  captured = null
}

onBeforeUnmount(() => {
  abortAudio?.abort()
  listener?.stop()
  cancelAnimationFrame(pixelRaf)
})
</script>

<template>
  <div class="flex flex-col items-center gap-4 py-2 text-center">
    <div v-if="insecure" class="alert alert-warning text-sm">
      <AppIcon name="lock" :size="15" /> The microphone needs a secure page (https or localhost).
    </div>

    <TeddyBear :mood="teddyMood" :size="150" />

    <!-- idle -->
    <template v-if="stage === 'idle'">
      <p class="opacity-70">
        Press listen, then play the sound on the other device.
      </p>
      <button class="btn btn-primary btn-lg" :disabled="insecure" @click="listen">
        <AppIcon name="listen" /> Listen
      </button>
    </template>

    <!-- wedged iOS audio session — guide the proven recovery -->
    <template v-else-if="stage === 'blocked'">
      <p class="flex items-center justify-center gap-1.5 font-medium">
        <AppIcon name="lock" :size="16" /> iOS has muted the app's sound
      </p>
      <p class="max-w-xs text-sm opacity-70">
        A known iOS 26 bug mutes web apps after they're force-closed.
        <br><b>1.</b> Go to the Home Screen and reopen ohloud (or lock &amp; unlock).
        <br><b>2.</b> Tap Continue.
      </p>
      <button class="btn btn-primary" @click="retryBlocked">
        <AppIcon name="play" /> Continue
      </button>
      <button class="btn btn-ghost btn-sm" @click="cancelBlocked">
        Back
      </button>
    </template>

    <!-- listening / receiving -->
    <template v-else-if="stage === 'listening' || stage === 'receiving'">
      <p class="flex items-center justify-center gap-1.5 font-medium">
        {{ stage === 'receiving' ? 'Receiving… hold still' : 'Listening for a sound…' }}
        <AppIcon v-if="stage === 'receiving'" name="wave" :size="16" />
      </p>
      <div class="level-meter">
        <div class="level-fill" :style="{ width: `${levelPct}%` }" />
      </div>
      <progress v-if="stage === 'receiving'" class="progress progress-accent w-64" :value="recvProgress" max="1" />
      <button class="btn btn-ghost btn-sm" @click="stop">
        Stop
      </button>
    </template>

    <!-- decoding -->
    <template v-else-if="stage === 'captured' || stage === 'decoding'">
      <p class="font-medium">
        Got it! Unlocking…
      </p>
      <span v-if="stage === 'decoding'" class="loading loading-dots loading-md text-primary" />
    </template>

    <!-- done -->
    <template v-else-if="stage === 'done' && result">
      <p class="text-success flex items-center justify-center gap-1.5 text-lg font-bold">
        Delivered! <AppIcon name="sparkle" :size="18" />
      </p>
      <div v-if="result.isText" class="w-full max-w-md">
        <div class="secret-field">
          <div class="secret-text" :class="{ masked: !revealed }" :style="{ filter: textFilter }">
            {{ result.text }}
          </div>
          <!-- Opaque cover; its opacity rides the progress so pixels only show mid-reveal. -->
          <button
            type="button"
            class="secret-overlay"
            :style="{ opacity: overlayOpacity, pointerEvents: revealed ? 'none' : 'auto' }"
            :tabindex="revealed ? -1 : 0"
            :aria-hidden="revealed ? 'true' : 'false'"
            aria-label="Reveal message"
            @click="reveal"
          >
            <span class="secret-hint"><AppIcon name="eye" :size="18" /> Tap to reveal</span>
          </button>

          <!-- Hidden def: the pixelate filter, animated by shrinking its cell size. -->
          <svg class="pixel-svg" aria-hidden="true">
            <defs>
              <filter :id="filterId" color-interpolation-filters="sRGB">
                <feFlood :x="(cell - 1) / 2" :y="(cell - 1) / 2" width="1" height="1" flood-color="#000" />
                <feComposite :width="cell" :height="cell" />
                <feTile result="grid" />
                <feComposite in="SourceGraphic" in2="grid" operator="in" />
                <feMorphology operator="dilate" :radius="cell / 2" />
              </filter>
            </defs>
          </svg>

          <!-- Floating actions, above the overlay so Copy works masked or revealed. -->
          <div class="secret-actions">
            <button
              v-if="revealed"
              type="button"
              class="secret-btn"
              title="Hide"
              aria-label="Hide message"
              @click="hide"
            >
              <AppIcon name="eye-off" :size="17" />
            </button>
            <button
              type="button"
              class="secret-btn"
              :class="{ copied }"
              :title="copied ? 'Copied!' : 'Copy'"
              :aria-label="copied ? 'Copied' : 'Copy message'"
              @click="copyText"
            >
              <AppIcon :name="copied ? 'check' : 'copy'" :size="17" />
            </button>
          </div>
        </div>
      </div>
      <div v-else class="space-y-2">
        <p><AppIcon name="file" :size="15" /> <span class="font-medium">{{ safeFilename }}</span> <span class="opacity-60">({{ Math.ceil(result.content.length / 1024) }} KB)</span></p>
        <button class="btn btn-primary btn-sm" @click="downloadFile">
          <AppIcon name="download" /> Save file
        </button>
      </div>
      <button class="btn btn-ghost btn-sm" @click="reset">
        Listen again
      </button>
    </template>

    <!-- error -->
    <template v-else-if="stage === 'error'">
      <p class="alert alert-error text-sm">
        {{ errorMsg }}
      </p>
      <div class="flex gap-2">
        <button v-if="captured" class="btn btn-primary btn-sm" @click="retryKey">
          Try password again
        </button>
        <button class="btn btn-ghost btn-sm" @click="reset">
          Start over
        </button>
      </div>
    </template>

    <PassphraseModal :open="passOpen" title="Enter the password" @submit="onKey" @close="passOpen = false" />
  </div>
</template>

<style scoped>
.level-meter {
  width: 16rem;
  height: 1rem;
  border-radius: 999px;
  background: var(--color-base-300);
  overflow: hidden;
}
.level-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--color-success), var(--color-warning));
  transition: width 0.08s linear;
}
.secret-field {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 4rem;
  border-radius: var(--radius-box);
  background: var(--color-base-200);
  overflow: hidden;
}
.secret-text {
  width: 100%;
  /* Monospace so a received password or key is unambiguous — 0 vs O, l vs 1 —
     and so the reader can trust it character by character. */
  font-family: var(--font-mono);
  /* Vertically centred by the flex parent; extra end padding keeps multiline text
     clear of the floating action buttons. */
  padding: 0.85rem 1rem;
  padding-inline-end: 4.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  text-align: left;
}
.secret-text.masked {
  user-select: none;
}
/* Hidden host for the pixelate filter def. */
.pixel-svg {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}
.secret-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: inherit;
  background: var(--color-base-300);
  cursor: pointer;
  will-change: opacity;
}
.secret-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  background: var(--color-base-100);
  color: var(--color-base-content);
  box-shadow: 0 2px 8px oklch(40% 0.05 60 / 0.16);
  font-size: 0.9rem;
  font-weight: 500;
}
.secret-actions {
  position: absolute;
  top: 50%;
  right: 0.6rem;
  transform: translateY(-50%);
  z-index: 2;
  display: flex;
  gap: 0.3rem;
}
.secret-btn {
  display: grid;
  place-items: center;
  width: 1.95rem;
  height: 1.95rem;
  border-radius: 0.6rem;
  background: var(--color-base-100);
  color: var(--color-base-content);
  box-shadow: 0 1px 4px oklch(40% 0.05 60 / 0.14);
  cursor: pointer;
  transition:
    transform 0.12s ease,
    color 0.2s ease;
}
.secret-btn:hover {
  transform: translateY(-1px);
}
.secret-btn:active {
  transform: scale(0.92);
}
/* Animated checkmark — same colour as the copy icon; it pops and draws itself on. */
.secret-btn.copied :deep(svg) {
  animation: check-pop 0.35s ease;
}
.secret-btn.copied :deep(path) {
  stroke-dasharray: 22;
  animation: check-draw 0.4s ease-out;
}
@keyframes check-pop {
  0% {
    transform: scale(0.4);
  }
  55% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes check-draw {
  from {
    stroke-dashoffset: 22;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .secret-btn.copied :deep(svg),
  .secret-btn.copied :deep(path) {
    animation: none;
  }
}
</style>
