<script setup lang="ts">
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const RELEASES_URL = 'https://github.com/cottonella/ohloud/releases'
const { canPrompt, isStandalone, isIOS, install } = usePwaInstall()

const showTip = ref(false)
const busy = ref(false)

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    showTip.value = false
    busy.value = false
  }
})

const installSub = computed(() =>
  canPrompt.value
    ? 'Add ohloud to this device'
    : isIOS.value
      ? 'Add it to your Home Screen'
      : 'Add it to this device',
)

async function onInstall() {
  if (canPrompt.value) {
    busy.value = true
    await install()
    busy.value = false
  }
  else {
    // iOS / browsers without a programmatic prompt → show manual steps.
    showTip.value = true
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="inst">
      <div v-if="open" class="inst-backdrop" @click.self="emit('close')">
        <div class="inst-card anim-pop" role="dialog" aria-modal="true" @keydown.esc="emit('close')">
          <div class="flex items-center gap-3">
            <TeddyBear :size="52" mood="idle" />
            <div>
              <h3 class="text-lg font-bold">
                Get ohloud
              </h3>
              <p class="text-xs opacity-60">
                Install it right here, or grab the desktop app.
              </p>
            </div>
          </div>

          <div class="mt-4 grid gap-2.5">
            <button
              v-if="!isStandalone"
              type="button"
              class="get-pill get-pill-primary"
              :disabled="busy"
              @click="onInstall"
            >
              <AppIcon name="phone" :size="22" />
              <span class="get-text">
                <b>{{ busy ? 'Installing…' : 'Install app' }}</b>
                <small>{{ installSub }}</small>
              </span>
            </button>
            <div v-else class="get-pill get-pill-done">
              <AppIcon name="check" :size="20" /> <span>Installed on this device</span>
            </div>

            <a :href="RELEASES_URL" target="_blank" rel="noopener noreferrer" class="get-pill get-pill-ghost">
              <AppIcon name="desktop" :size="22" />
              <span class="get-text">
                <b>Desktop app</b>
                <small>Windows · macOS · Linux</small>
              </span>
            </a>
          </div>

          <Transition name="tip">
            <p v-if="showTip" class="get-tip">
              <template v-if="isIOS">
                In <b>Safari</b>, tap the <b>Share</b> button, then <b>“Add to Home Screen”</b>.
              </template>
              <template v-else>
                Open your browser menu and choose <b>“Install app”</b> (or “Add to Home screen”).
              </template>
            </p>
          </Transition>

          <div class="mt-4 flex justify-end">
            <button type="button" class="btn btn-ghost btn-sm" @click="emit('close')">
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.inst-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: oklch(40% 0.05 60 / 0.4);
  backdrop-filter: blur(3px);
}
.inst-card {
  width: 100%;
  max-width: 22rem;
  padding: 1.5rem;
  border-radius: var(--radius-box);
  background: var(--color-base-100);
  box-shadow: 0 20px 50px oklch(40% 0.06 60 / 0.3);
}
.get-pill {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.7rem 0.9rem;
  border-radius: 1rem;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    background 0.12s ease;
}
.get-pill:disabled {
  cursor: default;
}
.get-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.get-text b {
  font-weight: 600;
  font-size: 0.95rem;
}
.get-text small {
  font-size: 0.72rem;
  opacity: 0.7;
}
.get-pill-primary {
  background: #fce6d3;
  color: #a75f22;
  box-shadow: 0 2px 8px rgb(212 150 90 / 0.28);
}
.get-pill-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgb(212 150 90 / 0.38);
}
.get-pill-ghost {
  background: var(--color-base-200);
  color: var(--color-base-content);
}
.get-pill-ghost:hover {
  transform: translateY(-1px);
  background: var(--color-base-300);
}
.get-pill-done {
  justify-content: center;
  gap: 0.4rem;
  font-weight: 600;
  color: var(--color-success);
  background: color-mix(in oklch, var(--color-success) 14%, var(--color-base-100));
  cursor: default;
}
.get-tip {
  margin-top: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.8rem;
  font-size: 0.8rem;
  line-height: 1.45;
  background: var(--color-base-200);
}
.inst-enter-active,
.inst-leave-active {
  transition: opacity 0.2s ease;
}
.inst-enter-from,
.inst-leave-to {
  opacity: 0;
}
.tip-enter-active,
.tip-leave-active {
  transition: opacity 0.2s ease;
}
.tip-enter-from,
.tip-leave-to {
  opacity: 0;
}
</style>
