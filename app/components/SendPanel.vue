<script setup lang="ts">
import { estimateDurationSec, playPcm } from '~/core'

type Stage = 'idle' | 'encoding' | 'playing' | 'done' | 'error'

const codec = useCodec()

const mode = ref<'text' | 'file'>('text')
const text = ref('')
const file = ref<File | null>(null)
const dragOver = ref(false)

const stage = ref<Stage>('idle')
const passOpen = ref(false)
const errorMsg = ref('')
const durationSec = ref(0)
const progress = ref(0)

let playback: { stop: () => void, finished: Promise<void> } | null = null
let timer: ReturnType<typeof setInterval> | null = null

const hasInput = computed(() => (mode.value === 'text' ? text.value.length > 0 : file.value !== null))

const estimate = computed(() => {
  if (mode.value === 'text') {
    const bytes = new TextEncoder().encode(text.value).length
    return estimateDurationSec(bytes, 17)
  }
  return file.value ? estimateDurationSec(file.value.size, file.value.name.length) : 0
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

async function onKey(passphrase: string) {
  passOpen.value = false
  stage.value = 'encoding'
  errorMsg.value = ''
  try {
    const reply = mode.value === 'text'
      ? await codec.encodeText(text.value, passphrase)
      : await codec.encodeFile(file.value!.name, new Uint8Array(await file.value!.arrayBuffer()), passphrase)

    durationSec.value = reply.durationSec
    stage.value = 'playing'
    startProgress()
    playback = await playPcm(reply.pcm, reply.sampleRate)
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
          { value: 'text', label: '📝 Text' },
          { value: 'file', label: '📎 File' },
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
        <span class="text-4xl">🧺</span>
        <span v-if="file" class="font-medium">{{ file.name }} <span class="opacity-60">({{ Math.ceil(file.size / 1024) }} KB)</span></span>
        <span v-else class="opacity-70">Drop a file here, or click to browse</span>
      </label>

      <div class="flex items-center justify-between">
        <div class="text-sm opacity-70">
          <span v-if="hasInput">Sound length: <span class="badge badge-accent badge-sm">{{ estimateLabel }}</span></span>
          <span v-if="hasInput && estimate > 120" class="text-warning ml-2">⚠ long transmission</span>
        </div>
        <button class="btn btn-primary" :disabled="!hasInput" @click="passOpen = true">
          🔊 Share
        </button>
      </div>
      <p v-if="stage === 'error'" class="alert alert-error text-sm">
        {{ errorMsg }}
      </p>
    </div>

    <!-- Working / playing -->
    <div v-else class="flex flex-col items-center gap-4 py-2 text-center">
      <TeddyBear :mood="teddyMood" :size="150" />
      <template v-if="stage === 'encoding'">
        <p class="font-medium">
          Wrapping it up safely…
        </p>
        <span class="loading loading-dots loading-md text-primary" />
      </template>
      <template v-else-if="stage === 'playing'">
        <p class="font-medium">
          Singing your secret 🎶
        </p>
        <progress class="progress progress-primary w-64" :value="progress" max="1" />
        <p class="text-xs opacity-60">
          Keep the other device close and listening.
        </p>
        <button class="btn btn-ghost btn-sm" @click="stop">
          Stop
        </button>
      </template>
      <template v-else-if="stage === 'done'">
        <p class="text-success text-lg font-bold">
          Sent! 🎉
        </p>
        <button class="btn btn-primary btn-sm" @click="reset">
          Send another
        </button>
      </template>
    </div>

    <PassphraseModal :open="passOpen" title="Choose a preshared key" confirm @submit="onKey" @close="passOpen = false" />
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
