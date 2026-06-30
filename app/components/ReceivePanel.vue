<script setup lang="ts">
import { startListening } from '~/core'

type Stage = 'idle' | 'listening' | 'receiving' | 'captured' | 'decoding' | 'done' | 'error'

const codec = useCodec()
const { celebrate } = useConfetti()

const stage = ref<Stage>('idle')
const micLevel = ref(0)
const recvProgress = ref(0)
const passOpen = ref(false)
const errorMsg = ref('')
const result = ref<{ filename: string, isText: boolean, text?: string, content: Uint8Array } | null>(null)

let listener: { stop: () => void } | null = null
let captured: { pcm: Float32Array, sampleRate: number } | null = null

const insecure = computed(() => import.meta.client && !window.isSecureContext)

const teddyMood = computed(() => {
  if (stage.value === 'listening' || stage.value === 'receiving')
    return 'listening'
  if (stage.value === 'done')
    return 'happy'
  if (stage.value === 'error')
    return 'sad'
  return 'idle'
})

const levelPct = computed(() => Math.min(100, Math.round(micLevel.value * 320)))

async function listen() {
  errorMsg.value = ''
  result.value = null
  recvProgress.value = 0
  try {
    listener = await startListening({
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
    stage.value = 'listening'
  }
  catch (e) {
    errorMsg.value = (e as Error).name === 'NotAllowedError'
      ? 'Microphone permission was denied.'
      : (e as Error).message
    stage.value = 'error'
  }
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
  }
  catch (e) {
    const code = (e as Error & { code?: string }).code
    errorMsg.value = code === 'wrong-passphrase'
      ? 'That key didn\'t fit. Want to try again?'
      : 'The transmission came through incomplete or corrupted.'
    stage.value = 'error'
  }
}

function retryKey() {
  if (captured)
    passOpen.value = true
}

function downloadFile() {
  if (!result.value || result.value.isText)
    return
  const url = URL.createObjectURL(new Blob([result.value.content]))
  const a = document.createElement('a')
  a.href = url
  a.download = result.value.filename
  a.click()
  URL.revokeObjectURL(url)
}

function reset() {
  stage.value = 'idle'
  result.value = null
  captured = null
}

onBeforeUnmount(() => listener?.stop())
</script>

<template>
  <div class="flex flex-col items-center gap-4 py-2 text-center">
    <div v-if="insecure" class="alert alert-warning text-sm">
      🔒 The microphone needs a secure page (https or localhost).
    </div>

    <TeddyBear :mood="teddyMood" :size="150" />

    <!-- idle -->
    <template v-if="stage === 'idle'">
      <p class="opacity-70">
        Press listen, then play the sound on the other device.
      </p>
      <button class="btn btn-primary btn-lg" :disabled="insecure" @click="listen">
        🎤 Listen
      </button>
    </template>

    <!-- listening / receiving -->
    <template v-else-if="stage === 'listening' || stage === 'receiving'">
      <p class="font-medium">
        {{ stage === 'receiving' ? 'Receiving… hold still 🎶' : 'Listening for a sound…' }}
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
      <p class="text-success text-lg font-bold">
        Delivered! 🎉
      </p>
      <div v-if="result.isText" class="result-text">
        {{ result.text }}
      </div>
      <div v-else class="space-y-2">
        <p>📄 <span class="font-medium">{{ result.filename }}</span> <span class="opacity-60">({{ Math.ceil(result.content.length / 1024) }} KB)</span></p>
        <button class="btn btn-primary btn-sm" @click="downloadFile">
          ⬇ Save file
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
          Try key again
        </button>
        <button class="btn btn-ghost btn-sm" @click="reset">
          Start over
        </button>
      </div>
    </template>

    <PassphraseModal :open="passOpen" title="Enter the preshared key" @submit="onKey" @close="passOpen = false" />
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
.result-text {
  max-width: 28rem;
  padding: 1rem;
  border-radius: var(--radius-box);
  background: var(--color-base-200);
  white-space: pre-wrap;
  word-break: break-word;
  text-align: left;
}
</style>
