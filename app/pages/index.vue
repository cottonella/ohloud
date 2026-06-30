<script setup lang="ts">
import trpc from '~/utils/trpc'

// `window.electron` is exposed by electron/preload only inside Electron.
const isElectron = ref(false)
const date = ref('')
const product = ref<number | null>(null)
const error = ref('')

onMounted(() => {
  isElectron.value = Boolean((window as any).electron?.isElectron)
})

async function callTrpc() {
  error.value = ''
  try {
    const res = await trpc.getDate.query()
    date.value = res.date
    product.value = await trpc.multiply.query({ a: 6, b: 7 })
  }
  catch (e: any) {
    error.value = e?.message ?? String(e)
  }
}
</script>

<template>
  <main class="min-h-screen bg-base-200 flex items-center justify-center p-6">
    <div class="card w-full max-w-md bg-base-100 shadow-md">
      <div class="card-body">
        <h1 class="card-title">
          ohloud
        </h1>
        <p class="text-sm opacity-70">
          Nuxt 4 + Electron, fully local. Running in
          <span class="badge" :class="isElectron ? 'badge-success' : 'badge-ghost'">
            {{ isElectron ? 'Electron' : 'Browser' }}
          </span>
        </p>

        <button class="btn btn-primary mt-2" :disabled="!isElectron" @click="callTrpc">
          Call tRPC
        </button>
        <p v-if="!isElectron" class="text-xs opacity-60">
          tRPC runs over Electron IPC — available in the desktop app.
        </p>

        <div v-if="date" class="mt-2 text-sm">
          <div>Server date: <strong>{{ date }}</strong></div>
          <div>6 × 7 = <strong>{{ product }}</strong></div>
        </div>
        <div v-if="error" class="alert alert-error mt-2 text-sm">
          {{ error }}
        </div>
      </div>
    </div>
  </main>
</template>
