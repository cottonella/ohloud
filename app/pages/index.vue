<script setup lang="ts">
const tab = ref<'send' | 'receive'>('send')
const TAGLINES = ['end-to-end encrypted', 'just sound', 'no server', 'no internet', 'no account', 'no pairing', 'no setup', 'works offline', 'no cloud', 'no trace', 'no hassle', 'no download']
const showTech = ref(false)
const showInstall = ref(false)
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
          How it works?
        </summary>
        <div class="mt-3 text-left opacity-80">
          <p>ohloud turns your secret into sound and plays it speaker-to-microphone — no internet, no server, no pairing.</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            <li>Keep both devices close, the speaker facing the microphone.</li>
            <li>A quiet room helps — Fast needs it, Robust is forgiving.</li>
            <li>Both sides use the <b>same password</b>.</li>
            <li>Missed it? Press Listen again on the receiver, then Resend.</li>
          </ul>

          <hr class="border-base-300/60 my-3">
          <button type="button" class="more-info" :aria-expanded="showTech" @click="showTech = !showTech">
            <AppIcon :name="showTech ? 'eye-off' : 'eye'" :size="13" /> {{ showTech ? 'Hide the nerdy bits' : 'More info — for the curious' }}
          </button>
          <Transition name="tech">
            <p v-if="showTech" class="tech-note mt-2">
              Under the hood, ohloud squashes your secret and seals it with <b>XChaCha20-Poly1305</b>, using a key that <b>Argon2id</b> slowly stretches from your password so guessing it is deliberately, painfully expensive. The sealed bytes become audible tones — a sturdy <b>MFSK</b> melody in Robust mode, or a wide <b>OFDM</b> chord in Fast — wrapped in <b>Reed–Solomon</b> and a <b>RaptorQ</b> fountain code, so the listener can rebuild the whole message even when a cough, a click, or a bit of echo swallows a chunk mid-flight. All of it runs on-device in your browser: nothing is uploaded, nothing is stored, and there's nothing to intercept but the sound in the room. 🐻
            </p>
          </Transition>
        </div>
      </details>

      <footer class="border-base-300/50 mt-3 flex flex-wrap items-center justify-center gap-2 border-t pt-3">
        <span class="pill pill-soft">Made with <AppIcon name="heart" :size="14" /></span>
        <a href="https://github.com/cottonella/ohloud" target="_blank" rel="noopener noreferrer" class="pill pill-ghost" aria-label="ohloud on GitHub">
          <AppIcon name="github" :size="15" /> GitHub
        </a>
        <button type="button" class="pill pill-download" @click="showInstall = true">
          <AppIcon name="download" :size="15" /> Download
        </button>
        <a href="https://ko-fi.com/cottonella" target="_blank" rel="noopener noreferrer" class="pill pill-kofi">
          <svg class="kofi-cup" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.4 6.7h11.2V14a4 4 0 0 1-4 4h-3.2a4 4 0 0 1-4-4Z" fill="#fff" /><path d="M15.6 8.9a2.8 2.8 0 0 1 0 5.4" fill="none" /><path d="M10 15.05c-1.75-1.18-2.68-2.05-2.68-3.12 0-.82.62-1.4 1.35-1.4.62 0 1.05.33 1.33.77.28-.44.71-.77 1.33-.77.73 0 1.35.58 1.35 1.4 0 1.07-.93 1.94-2.68 3.12Z" fill="#e8324a" stroke="#1a1a1a" stroke-width="1" /></svg>Buy me a coffee
        </a>
      </footer>
    </div>
  </main>

  <InstallModal :open="showInstall" @close="showInstall = false" />
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
.more-info {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 500;
  color: var(--color-primary);
  opacity: 0.85;
  transition: opacity 0.15s ease;
}
.more-info:hover {
  opacity: 1;
}
.tech-note {
  font-size: 0.82rem;
  line-height: 1.55;
  opacity: 0.9;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.32rem 0.8rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
}
.pill-soft {
  background: var(--color-base-200);
  color: var(--color-base-content);
  opacity: 0.7;
}
/* GitHub — quiet: low-key until hovered. */
.pill-ghost {
  background: var(--color-base-200);
  color: var(--color-base-content);
  opacity: 0.55;
  transition: opacity 0.15s ease;
}
.pill-ghost:hover {
  opacity: 0.9;
}
/* Download — prominent, echoing the app's peachy primary (à la the coffee pill). */
.pill-download {
  background: #fce6d3;
  color: #a75f22;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgb(212 150 90 / 0.28);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}
.pill-download:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgb(212 150 90 / 0.38);
}
.pill-kofi {
  background: #fcdfeb;
  color: #b1436a;
  font-weight: 600;
  box-shadow: 0 2px 8px rgb(214 122 154 / 0.25);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}
.pill-kofi:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgb(214 122 154 / 0.35);
}
.kofi-cup {
  width: 1.45em;
  height: 1.45em;
  /* The cup is top-heavy (wide rim high in its box), so it reads high — nudge down. */
  transform: translateY(1px);
}
.tech-enter-active,
.tech-leave-active {
  transition: opacity 0.25s ease;
}
.tech-enter-from,
.tech-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .swap-enter-active,
  .swap-leave-active,
  .tech-enter-active,
  .tech-leave-active {
    transition: none;
  }
  .swap-enter-from,
  .swap-leave-to {
    transform: none;
  }
}
</style>
