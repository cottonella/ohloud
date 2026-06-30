<script setup lang="ts">
const tab = ref<'send' | 'receive'>('send')
</script>

<template>
  <main class="flex min-h-screen flex-col items-center px-4 py-8">
    <header class="mb-6 flex items-center gap-3">
      <TeddyBear :size="64" mood="idle" />
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight">
          ohloud
        </h1>
        <p class="text-sm opacity-60">
          send secrets by sound — no server, no setup
        </p>
      </div>
    </header>

    <div class="card w-full max-w-lg bg-base-100 shadow-xl">
      <div class="card-body">
        <PillTabs
          v-model="tab"
          block
          class="mb-2"
          :options="[
            { value: 'send', label: '📤 Send' },
            { value: 'receive', label: '📥 Receive' },
          ]"
        />

        <Transition name="swap" mode="out-in">
          <SendPanel v-if="tab === 'send'" key="send" />
          <ReceivePanel v-else key="receive" />
        </Transition>
      </div>
    </div>

    <footer class="mt-6 text-center text-xs opacity-50">
      🔒 encrypted with a preshared key · 🧸 made with care
    </footer>
  </main>
</template>

<style scoped>
.swap-enter-active,
.swap-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.swap-enter-from {
  opacity: 0;
  transform: translateX(12px);
}
.swap-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
</style>
