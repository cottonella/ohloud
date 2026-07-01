<script setup lang="ts">
import type { AudioOutput } from '~/core'
import { estimateDurationSec, openAudioOutput } from '~/core'

type Stage = 'idle' | 'ready' | 'encoding' | 'playing' | 'done' | 'error'

const codec = useCodec()

const mode = ref<'text' | 'file'>('text')
const speed = ref<'robust' | 'fast'>('robust')
const text = ref('')
const file = ref<File | null>(null)
const dragOver = ref(false)

const stage = ref<Stage>('idle')
const passOpen = ref(false)
const errorMsg = ref('')
const durationSec = ref(0)
const outputRate = ref(0)
const progress = ref(0)
const pendingPass = ref('')

let playback: { stop: () => void, finished: Promise<void> } | null = null
let timer: ReturnType<typeof setInterval> | null = null

const hasInput = computed(() => (mode.value === 'text' ? text.value.length > 0 : file.value !== null))

const estimate = computed(() => {
  if (mode.value === 'text') {
    const bytes = new TextEncoder().encode(text.value).length
    return estimateDurationSec(bytes, 17, 48000, speed.value, 0.25)
  }
  return file.value ? estimateDurationSec(file.value.size, file.value.name.length, 48000, speed.value, 0.25) : 0
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
  if (stage.value === 'error')
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
  stage.value = 'encoding'
  errorMsg.value = ''
  let output: AudioOutput | null = null
  try {
    // Open the speaker first and encode at its REAL rate — iOS often isn't 48 kHz,
    // and matching it avoids a lossy browser resample that would corrupt Fast/OFDM.
    output = await openAudioOutput()
    outputRate.value = output.sampleRate
    const reply = mode.value === 'text'
      ? await codec.encodeText(text.value, pendingPass.value, output.sampleRate, speed.value)
      : await codec.encodeFile(file.value!.name, new Uint8Array(await file.value!.arrayBuffer()), pendingPass.value, output.sampleRate, speed.value)

    durationSec.value = reply.durationSec
    stage.value = 'playing'
    startProgress()
    playback = output.play(reply.pcm)
    await playback.finished
    progress.value = 1
    stage.value = 'done'
  }
  catch (e) {
    errorMsg.value = (e as Error).message
    stage.value = 'error'
  }
  finally {
    clearTimer()
    output?.close()
    playback = null
  }
}

function stop() {
  playback?.stop()
  clearTimer()
  stage.value = 'idle'
}

function reset() {
  stage.value = 'idle'
  progress.value = 0
  pendingPass.value = ''
}

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

      <textarea
        v-if="mode === 'text'"
        v-model="text"
        class="textarea textarea-bordered h-36 w-full text-base"
        placeholder="Type a secret message, a password, anything…"
      />

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
          <PillTabs
            v-model="speed"
            :icon-size="30"
            :options="[
              { value: 'robust', label: 'Robust', icon: 'turtle' },
              { value: 'fast', label: 'Fast', icon: 'rabbit' },
            ]"
          />
        </div>
        <p v-if="speed === 'fast'" class="text-xs opacity-60">
          <AppIcon name="rabbit" :size="13" /> Much faster — likes a quiet room with the devices close. <AppIcon name="turtle" :size="13" /> Robust is the sturdiest in noise.
        </p>
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
</style>
