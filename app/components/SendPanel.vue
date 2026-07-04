<script setup lang="ts">
import type { AudioOutput } from '~/core'
import { estimateDurationSec, jingleDurationSec, openAudioOutput, synthXylophoneJingle } from '~/core'

type Stage = 'idle' | 'ready' | 'blocked' | 'encoding' | 'playing' | 'done' | 'error' | 'canceled'

const codec = useCodec()
const sound = useXylophone()

const mode = ref<'text' | 'file'>('text')
const speed = ref<'robust' | 'fast' | 'turbo'>('robust')
const text = ref('')
// The secret is masked by default (like a password) so it can't be read over
// the sender's shoulder; the eye button reveals it to check what was typed.
const showText = ref(false)
const file = ref<File | null>(null)
const dragOver = ref(false)

const stage = ref<Stage>('idle')
const passOpen = ref(false)
const errorMsg = ref('')
const durationSec = ref(0)
const outputRate = ref(0)
const progress = ref(0)
const pendingPass = ref('')
const speedSelect = ref<HTMLElement | null>(null)
const pillStyle = ref<Record<string, string>>({})
const pillReady = ref(false)

let playback: { stop: () => void, finished: Promise<void> } | null = null
let timer: ReturnType<typeof setInterval> | null = null
let canceled = false
let abortAudio: AbortController | null = null
let retryAudio: (() => void) | null = null

const hasInput = computed(() => (mode.value === 'text' ? text.value.length > 0 : file.value !== null))

// A quiet 500 ms cushion on each side of the transmission: the startup jingle
// can't bleed into the payload, and the completion blip can't bleed into a
// receiver that's still capturing. Belt-and-suspenders on top of the FEC.
const SETTLE_SEC = 0.5

const estimate = computed(() => {
  // Repair fraction is omitted on purpose: the estimator applies the same
  // per-mode FEC policy as the encoder, so the shown time tracks the frame.
  const j = jingleDurationSec() + SETTLE_SEC
  if (mode.value === 'text') {
    const bytes = new TextEncoder().encode(text.value).length
    return estimateDurationSec(bytes, 17, 48000, speed.value) + j
  }
  return file.value ? estimateDurationSec(file.value.size, file.value.name.length, 48000, speed.value) + j : 0
})

// Drives the description card under the speed selector: mascot, one-word tag,
// a professional blurb, and a speed/sturdiness meter (each out of 3). Accents
// are the mascots' candy stroke colors (ICON-THEME.md).
const SPEED_INFO = {
  robust: { icon: 'turtle', name: 'Robust', tag: 'Surest', accent: '#37B27C', speed: 1, sturdy: 3, blurb: 'Slow but sure — cuts through background noise and reaches any device. The safe bet.' },
  fast: { icon: 'rabbit', name: 'Fast', tag: 'Everyday', accent: '#E877AA', speed: 2, sturdy: 2, blurb: 'Quick, and forgiving of most rooms and hardware — a dependable everyday choice.' },
  turbo: { icon: 'rocket', name: 'Turbo', tag: 'Fastest', accent: '#5AA9F0', speed: 3, sturdy: 1, blurb: 'The fastest — for a calm room, close devices, and capable hardware.' },
} as const
const speedInfo = computed(() => SPEED_INFO[speed.value])

// The card slides toward the faster side when a quicker tier is picked, and
// back the other way when dropping down — direction feeds the CSS via --slide.
const SPEED_ORDER = { robust: 0, fast: 1, turbo: 2 }
const slideSign = ref(1)
watch(speed, (next, prev) => {
  slideSign.value = SPEED_ORDER[next] >= SPEED_ORDER[prev] ? 1 : -1
})

const estimateLabel = computed(() => {
  const s = estimate.value
  if (s < 60)
    return `~${Math.ceil(s)} s`
  return `~${Math.floor(s / 60)} min ${Math.ceil(s % 60)} s`
})

const teddyMood = computed(() => {
  if (stage.value === 'playing')
    return 'sending'
  if (stage.value === 'done')
    return 'happy'
  if (stage.value === 'error' || stage.value === 'canceled' || stage.value === 'blocked')
    return 'sad'
  return 'idle'
})

function onDrop(e: DragEvent) {
  dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) {
    file.value = f
    mode.value = 'file'
  }
}

function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) {
    file.value = f
    mode.value = 'file'
  }
}

function startProgress() {
  progress.value = 0
  const start = performance.now()
  timer = setInterval(() => {
    progress.value = Math.min(1, (performance.now() - start) / (durationSec.value * 1000))
  }, 80)
}

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function onKey(passphrase: string) {
  passOpen.value = false
  pendingPass.value = passphrase
  errorMsg.value = ''
  // Don't transmit yet — let the sender press Start so the receiver can begin
  // listening first (otherwise the opening chirp is missed).
  stage.value = 'ready'
}

// Encode + play. Reused by the initial Start and by Resend. Runs from a user
// gesture so the AudioContext is allowed to open (required on iOS).
async function start() {
  canceled = false
  stage.value = 'encoding'
  errorMsg.value = ''
  let output: AudioOutput | null = null
  abortAudio = new AbortController()
  try {
    // Open the speaker first and encode at its REAL rate — iOS often isn't 48 kHz,
    // and matching it avoids a lossy browser resample that would corrupt Fast/OFDM.
    // If iOS has wedged the audio session (force-closed-and-relaunched app), this
    // shows lock/unlock guidance and resolves by itself once the session thaws.
    output = await openAudioOutput({
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
    })
    // The speaker session is live now — safe to warm the UI-sound context for
    // the gesture-less success blip. Never before the wedge check (see onWedged).
    sound.unlock()
    stage.value = 'encoding'
    outputRate.value = output.sampleRate
    const reply = mode.value === 'text'
      ? await codec.encodeText(text.value, pendingPass.value, output.sampleRate, speed.value)
      : await codec.encodeFile(file.value!.name, new Uint8Array(await file.value!.arrayBuffer()), pendingPass.value, output.sampleRate, speed.value)

    // Lead with a cute glockenspiel jingle, then a quiet cushion so it can't
    // bleed into the payload; the receiver's chirp search scans past both.
    const jingle = synthXylophoneJingle(output.sampleRate)
    const settle = Math.round(SETTLE_SEC * output.sampleRate)
    const pcm = new Float32Array(jingle.length + settle + reply.pcm.length)
    pcm.set(jingle, 0)
    pcm.set(reply.pcm, jingle.length + settle)

    durationSec.value = pcm.length / output.sampleRate
    stage.value = 'playing'
    startProgress()
    playback = output.play(pcm)
    await playback.finished
    if (canceled) {
      stage.value = 'canceled'
    }
    else {
      progress.value = 1
      stage.value = 'done'
      // Give the receiver a quiet beat to finish capturing before the blip —
      // otherwise it could bleed into a mic that's still listening.
      setTimeout(() => sound.success(), SETTLE_SEC * 1000)
    }
  }
  catch (e) {
    if ((e as Error).name === 'AbortError') {
      // The user backed out of the lock/unlock wait — not an error.
      stage.value = 'ready'
    }
    else {
      errorMsg.value = (e as Error).message
      stage.value = 'error'
    }
  }
  finally {
    clearTimer()
    output?.close()
    playback = null
    abortAudio = null
    retryAudio = null
  }
}

// The Continue tap after a lock/unlock — the user gesture iOS requires
// before it lets audio start again.
function retryBlocked() {
  retryAudio?.()
}

function cancelBlocked() {
  abortAudio?.abort()
}

function stop() {
  // Mark canceled BEFORE stopping: stopping resolves `playback.finished`, which
  // resumes start() — it must see the cancel and land on 'canceled', not 'done'.
  canceled = true
  playback?.stop()
  clearTimer()
}

function reset() {
  stage.value = 'idle'
  progress.value = 0
  pendingPass.value = ''
}

let collapsedW = 0
let collapsedLabelW = 0
let gapPx = 0
let padLeftPx = 0

// Cache the geometry that never changes: a collapsed tab's baseline width, the gap,
// and the container's left padding. Computed from parts (icon via getBoundingClientRect
// since SVG offsetWidth is unreliable) — and crucially including the label's own
// horizontal padding, which keeps rendering even when the label text is clipped away.
function measureBase() {
  const root = speedSelect.value
  if (!root)
    return
  const tab = root.querySelector<HTMLElement>('.speed-tab')
  const labelIn = root.querySelector<HTMLElement>('.speed-tab-label-in')
  const icon = root.querySelector('.app-icon')
  if (!tab || !labelIn)
    return
  const tc = getComputedStyle(tab)
  const lc = getComputedStyle(labelIn)
  const tabPadX = (Number.parseFloat(tc.paddingLeft) || 0) + (Number.parseFloat(tc.paddingRight) || 0)
  collapsedLabelW = (Number.parseFloat(lc.paddingLeft) || 0) + (Number.parseFloat(lc.paddingRight) || 0)
  const iconW = icon ? icon.getBoundingClientRect().width : 30
  collapsedW = iconW + tabPadX + collapsedLabelW
  const cs = getComputedStyle(root)
  gapPx = Number.parseFloat(cs.columnGap || cs.gap || '0') || 0
  padLeftPx = Number.parseFloat(cs.paddingLeft) || 0
}

// Slide + resize the highlight pill to sit exactly under the active tab, whose name
// expands (so it's wider than the collapsed one).
function updatePill() {
  const root = speedSelect.value
  if (!root)
    return
  if (!collapsedW)
    measureBase()
  const tabs = Array.from(root.querySelectorAll<HTMLElement>('.speed-tab'))
  const activeIdx = tabs.findIndex(t => t.classList.contains('is-active'))
  if (activeIdx < 0 || !collapsedW)
    return
  const labelIn = tabs[activeIdx]!.querySelector<HTMLElement>('.speed-tab-label-in')
  const width = collapsedW - collapsedLabelW + (labelIn?.scrollWidth ?? 0)
  const left = padLeftPx + activeIdx * (collapsedW + gapPx)
  pillStyle.value = { transform: `translateX(${left}px)`, width: `${width}px` }
}

watch([speed, stage], () => nextTick(updatePill))
onMounted(() => nextTick(() => {
  updatePill()
  requestAnimationFrame(() => (pillReady.value = true))
}))

onBeforeUnmount(() => {
  playback?.stop()
  clearTimer()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Composer -->
    <div v-if="stage === 'idle' || stage === 'error'" class="space-y-4">
      <PillTabs
        v-model="mode"
        :options="[
          { value: 'text', label: 'Text', icon: 'text' },
          { value: 'file', label: 'File', icon: 'file' },
        ]"
      />

      <div v-if="mode === 'text'" class="secret-box">
        <textarea
          v-model="text"
          class="textarea textarea-bordered h-28 w-full text-base"
          :class="{ masked: !showText }"
          placeholder="Type a secret message, a password, anything…"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <button
          type="button"
          class="secret-toggle"
          :aria-pressed="showText"
          :aria-label="showText ? 'Hide secret' : 'Show secret'"
          :title="showText ? 'Hide' : 'Show'"
          @click="showText = !showText"
        >
          <AppIcon :name="showText ? 'eye-off' : 'eye'" :size="18" />
        </button>
      </div>

      <label
        v-else
        class="dropzone"
        :class="{ 'dropzone--over': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
      >
        <input type="file" class="hidden" @change="onPick">
        <AppIcon name="upload" :size="40" class="opacity-70" />
        <span v-if="file" class="font-medium">{{ file.name }} <span class="opacity-60">({{ Math.ceil(file.size / 1024) }} KB)</span></span>
        <span v-else class="opacity-70">Drop a file here, or click to browse</span>
      </label>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-medium opacity-70">Speed</span>
          <div ref="speedSelect" class="speed-select" role="tablist">
            <span class="speed-pill" :class="{ 'is-ready': pillReady }" :style="pillStyle" aria-hidden="true" />
            <button
              type="button"
              role="tab"
              :aria-selected="speed === 'robust'"
              class="speed-tab"
              :class="{ 'is-active': speed === 'robust' }"
              @click="speed = 'robust'"
            >
              <span class="speed-tab-label"><span class="speed-tab-label-in">Robust</span></span>
              <AppIcon name="turtle" :size="30" />
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="speed === 'fast'"
              class="speed-tab"
              :class="{ 'is-active': speed === 'fast' }"
              @click="speed = 'fast'"
            >
              <span class="speed-tab-label"><span class="speed-tab-label-in">Fast</span></span>
              <AppIcon name="rabbit" :size="30" />
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="speed === 'turbo'"
              class="speed-tab"
              :class="{ 'is-active': speed === 'turbo' }"
              @click="speed = 'turbo'"
            >
              <span class="speed-tab-label"><span class="speed-tab-label-in">Turbo</span></span>
              <AppIcon name="rocket" :size="30" />
            </button>
          </div>
        </div>
        <div class="speed-card-wrap" :style="{ '--slide': slideSign }">
          <Transition name="speed-card">
            <div :key="speed" class="speed-card" :style="{ '--speed-accent': speedInfo.accent }">
              <span class="speed-card-badge"><AppIcon :name="speedInfo.icon" :size="34" /></span>
              <div class="speed-card-body">
                <div class="speed-card-head">
                  <span class="speed-card-name">{{ speedInfo.name }}</span>
                  <span class="speed-card-tag">{{ speedInfo.tag }}</span>
                </div>
                <p class="speed-card-blurb">
                  {{ speedInfo.blurb }}
                </p>
                <div class="speed-card-meters">
                  <div class="meter">
                    <span class="meter-label">Speed</span>
                    <span class="meter-bars">
                      <span v-for="n in 3" :key="n" :class="{ on: n <= speedInfo.speed }" />
                    </span>
                  </div>
                  <div class="meter">
                    <span class="meter-label">Sturdiness</span>
                    <span class="meter-bars">
                      <span v-for="n in 3" :key="n" :class="{ on: n <= speedInfo.sturdy }" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <div class="text-sm opacity-70">
          <span v-if="hasInput">Transmission time: <span class="badge badge-accent badge-sm">{{ estimateLabel }}</span></span>
          <span v-if="hasInput && estimate > 120" class="text-warning ml-2"><AppIcon name="warning" :size="13" /> long transmission</span>
        </div>
        <button class="btn btn-primary" :disabled="!hasInput" @click="passOpen = true">
          <AppIcon name="share" /> Share
        </button>
      </div>
      <p v-if="stage === 'error'" class="alert alert-error text-sm">
        {{ errorMsg }}
      </p>
    </div>

    <!-- Working / playing -->
    <div v-else class="flex flex-col items-center gap-4 py-2 text-center">
      <TeddyBear :mood="teddyMood" :size="150" />
      <template v-if="stage === 'ready'">
        <p class="font-medium">
          Ready to send
        </p>
        <p class="max-w-xs text-sm opacity-70">
          On the other device, open <b>Receive</b> and press <b>Listen</b>. Once it's listening, press Start.
        </p>
        <button class="btn btn-primary" @click="start">
          <AppIcon name="play" /> Start
        </button>
        <button class="btn btn-ghost btn-sm" @click="stage = 'idle'">
          Back
        </button>
      </template>
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
      <template v-else-if="stage === 'encoding'">
        <p class="font-medium">
          Wrapping it up safely…
        </p>
        <span class="loading loading-dots loading-md text-primary" />
      </template>
      <template v-else-if="stage === 'playing'">
        <p class="flex items-center justify-center gap-1.5 font-medium">
          Singing your secret <AppIcon name="wave" :size="16" />
        </p>
        <progress class="progress progress-primary w-64" :value="progress" max="1" />
        <p class="text-xs opacity-60">
          Keep the other device close and listening.<span v-if="outputRate"> · {{ (outputRate / 1000).toFixed(1) }} kHz</span>
        </p>
        <button class="btn btn-ghost btn-sm" @click="stop">
          Stop
        </button>
      </template>
      <template v-else-if="stage === 'done'">
        <p class="text-success flex items-center justify-center gap-1.5 text-lg font-bold">
          Sent! <AppIcon name="sparkle" :size="18" />
        </p>
        <p class="max-w-xs text-xs opacity-60">
          Didn't arrive? Have them press Listen again, then resend the same secret.
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          <button class="btn btn-primary btn-sm" @click="start">
            <AppIcon name="repeat" /> Resend
          </button>
          <button class="btn btn-ghost btn-sm" @click="reset">
            Send another
          </button>
        </div>
      </template>
      <template v-else-if="stage === 'canceled'">
        <p class="text-lg font-bold opacity-70">
          Canceled
        </p>
        <p class="max-w-xs text-xs opacity-60">
          You stopped before it finished sending.
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          <button class="btn btn-primary btn-sm" @click="start">
            <AppIcon name="repeat" /> Resend
          </button>
          <button class="btn btn-ghost btn-sm" @click="reset">
            Send another
          </button>
        </div>
      </template>
    </div>

    <PassphraseModal :open="passOpen" title="Choose a password" confirm @submit="onKey" @close="passOpen = false" />
  </div>
</template>

<style scoped>
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 9rem;
  border: 2px dashed var(--color-base-300);
  border-radius: var(--radius-box);
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--color-base-100);
}
.dropzone:hover,
.dropzone--over {
  border-color: var(--color-primary);
  background: oklch(97% 0.04 60);
  transform: translateY(-2px);
}

.secret-box {
  position: relative;
}
/* Leave room for the reveal button so long lines don't slide under it. */
.secret-box .textarea {
  padding-right: 2.75rem;
}
/* Mask the composed secret like a password field. `-webkit-text-security`
   covers every browser this app targets (iOS Safari, Chrome/Edge, desktop
   Safari); the value still lives only in memory — this is anti-shoulder-surf. */
.textarea.masked {
  -webkit-text-security: disc;
}
.secret-toggle {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 0.55rem;
  color: var(--color-base-content);
  opacity: 0.5;
  transition:
    opacity 0.15s ease,
    background 0.15s ease;
}
.secret-toggle:hover {
  opacity: 0.9;
  background: var(--color-base-200);
}
.secret-toggle:active {
  transform: scale(0.92);
}

/* Speed tabs: a single pill slides + resizes under the active tab, whose name
   expands to the left of its icon (turtle = Robust, rabbit = Fast). */
.speed-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.3rem;
  background: var(--color-base-200);
  border-radius: var(--radius-field);
}
.speed-pill {
  position: absolute;
  top: 0.3rem;
  bottom: 0.3rem;
  left: 0;
  z-index: 0;
  border-radius: calc(var(--radius-field) - 0.3rem);
  background: var(--color-base-100);
  box-shadow: 0 2px 8px oklch(50% 0.05 60 / 0.18);
}
.speed-pill.is-ready {
  transition:
    transform 0.45s cubic-bezier(0.33, 0, 0.16, 1),
    width 0.45s cubic-bezier(0.33, 0, 0.16, 1);
}
.speed-tab {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.55rem;
  border: none;
  background: transparent;
  border-radius: calc(var(--radius-field) - 0.3rem);
  color: var(--color-base-content);
  opacity: 0.5;
  cursor: pointer;
  transition:
    color 0.3s ease,
    opacity 0.3s ease;
}
.speed-tab.is-active {
  color: var(--color-primary);
  opacity: 1;
}
.speed-tab:hover:not(.is-active) {
  opacity: 0.8;
}
/* Animate the real text width via a 0fr→1fr grid column — eases smoothly to the
   content width instead of snapping toward a fixed max-width. */
.speed-tab-label {
  display: grid;
  grid-template-columns: 0fr;
  opacity: 0;
  transition:
    grid-template-columns 0.45s cubic-bezier(0.33, 0, 0.16, 1),
    opacity 0.35s ease;
}
.speed-tab.is-active .speed-tab-label {
  grid-template-columns: 1fr;
  opacity: 1;
}
.speed-tab-label-in {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-weight: 600;
  font-size: 0.95rem;
  padding-left: 0.2rem;
  padding-right: 0.45rem;
}

/* Description card under the selector: a soft summary of the picked speed —
   mascot badge, one-word tag, blurb, and a speed/sturdiness meter. Its accent
   (--speed-accent) is the mascot's candy color, set per-mode from script. */
.speed-card-wrap {
  position: relative;
}
.speed-card {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 4.6rem;
  padding: 0.7rem 0.8rem;
  background: var(--color-base-100);
  border: 1.5px solid var(--color-base-200);
  border-radius: var(--radius-field);
}
.speed-card-badge {
  flex: none;
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: color-mix(in oklch, var(--speed-accent) 15%, var(--color-base-100));
}
.speed-card-body {
  flex: 1;
  min-width: 0;
}
.speed-card-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.2rem;
}
.speed-card-name {
  font-weight: 600;
  font-size: 0.95rem;
}
.speed-card-tag {
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  color: color-mix(in oklch, var(--speed-accent), var(--color-base-content) 45%);
  background: color-mix(in oklch, var(--speed-accent) 18%, var(--color-base-100));
}
.speed-card-blurb {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--color-base-content);
  opacity: 0.68;
}
.speed-card-meters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.1rem;
}
.speed-card-meters .meter {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.speed-card-meters .meter-label {
  font-size: 0.68rem;
  opacity: 0.55;
}
.speed-card-meters .meter-bars {
  display: inline-flex;
  gap: 3px;
}
.speed-card-meters .meter-bars span {
  width: 15px;
  height: 5px;
  border-radius: 3px;
  background: var(--color-base-300);
  transition: background 0.3s ease;
}
.speed-card-meters .meter-bars span.on {
  background: var(--speed-accent);
}

/* Soft cross-fade + slide as the card swaps between speeds. The leaving card is
   pulled out of flow so the incoming one alone defines the height. */
.speed-card-enter-active,
.speed-card-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s cubic-bezier(0.33, 0, 0.16, 1);
}
.speed-card-leave-active {
  position: absolute;
  inset: 0;
}
.speed-card-enter-from {
  opacity: 0;
  transform: translateX(calc(var(--slide, 1) * 18px));
}
.speed-card-leave-to {
  opacity: 0;
  transform: translateX(calc(var(--slide, 1) * -18px));
}

@media (prefers-reduced-motion: reduce) {
  .speed-pill,
  .speed-tab,
  .speed-tab-label,
  .speed-card-enter-active,
  .speed-card-leave-active {
    transition: none;
  }
}
</style>
