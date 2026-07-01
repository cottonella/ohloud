<script setup lang="ts">
const tab = ref<'send' | 'receive'>('send')
const TAGLINES = ['end-to-end encrypted', 'just sound', 'no server', 'no internet', 'no account', 'no pairing', 'no setup', 'works offline', 'no cloud', 'no trace', 'no hassle', 'no download']
</script>

<template>
  <main class="relative z-10 flex min-h-screen flex-col items-center px-4 py-8">
    <header class="mb-6 flex items-center gap-3">
      <TeddyBear :size="64" mood="idle" />
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight">
          ohloud
        </h1>
        <p class="text-sm opacity-60">
          send secrets by sound — <Typewriter :words="TAGLINES" />
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
            { value: 'send', label: 'Send', icon: 'send' },
            { value: 'receive', label: 'Receive', icon: 'receive' },
          ]"
        />

        <Transition name="swap" mode="out-in">
          <SendPanel v-if="tab === 'send'" key="send" />
          <ReceivePanel v-else key="receive" />
        </Transition>
      </div>
    </div>

    <!-- Kept on an opaque card so the text stays readable over the animated scene. -->
    <div class="bg-base-100/90 mt-5 w-full max-w-lg rounded-3xl p-4 shadow-lg backdrop-blur-md">
      <details class="help text-sm">
        <summary class="help-summary cursor-pointer text-center font-medium opacity-70 transition hover:opacity-100">
          How it works
        </summary>
        <div class="mt-3 text-left opacity-80">
          <p>ohloud turns your secret into sound and plays it speaker-to-microphone — no internet, no server, no pairing.</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            <li>Keep both devices close, the speaker facing the microphone.</li>
            <li>A quiet room helps — Fast needs it, Robust is forgiving.</li>
            <li>Both sides use the <b>same password</b>.</li>
            <li>Missed it? Press Listen again on the receiver, then Resend.</li>
          </ul>
        </div>
      </details>

      <footer class="border-base-300/50 mt-3 border-t pt-3 text-center text-xs opacity-60">
        <AppIcon name="lock" :size="13" /> encrypted with a password · <AppIcon name="heart" :size="13" /> made with care
      </footer>
    </div>
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
.help-summary {
  list-style: none;
}
.help-summary::-webkit-details-marker {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  .swap-enter-active,
  .swap-leave-active {
    transition: none;
  }
  .swap-enter-from,
  .swap-leave-to {
    transform: none;
  }
}
</style>
