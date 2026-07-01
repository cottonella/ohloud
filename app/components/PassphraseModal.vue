<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  /** Require a confirm field (sending) vs single field (receiving). */
  confirm?: boolean
}>(), {
  title: 'Password',
  confirm: false,
})

const emit = defineEmits<{ submit: [passphrase: string], close: [] }>()

const pass = ref('')
const repeat = ref('')
const show = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    pass.value = ''
    repeat.value = ''
    show.value = false
    nextTick(() => inputEl.value?.focus())
  }
})

const mismatch = computed(() => props.confirm && repeat.value.length > 0 && pass.value !== repeat.value)
const valid = computed(() => pass.value.length > 0 && (!props.confirm || pass.value === repeat.value))

// Lightweight passphrase strength estimate (length + character variety).
const strength = computed(() => {
  const pw = pass.value
  let s = 0
  if (pw.length >= 8)
    s++
  if (pw.length >= 12)
    s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw))
    s++
  if (/\d/.test(pw))
    s++
  if (/[^a-z0-9]/i.test(pw))
    s++
  if (pw.length < 8)
    s = Math.min(s, 1) // short keys can never rank above "weak"
  s = Math.min(s, 4)
  const labels = ['too short', 'weak', 'fair', 'good', 'strong']
  const colors = ['var(--color-error)', 'var(--color-error)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-success)']
  return { score: s, label: labels[s]!, color: colors[s]! }
})

function submit() {
  if (valid.value)
    emit('submit', pass.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="pp">
      <div v-if="open" class="pp-backdrop" @click.self="emit('close')">
        <div class="pp-card anim-pop">
          <div class="flex items-center gap-3">
            <TeddyBear :size="56" mood="idle" />
            <div>
              <h3 class="text-lg font-bold">
                {{ title }}
              </h3>
              <p class="text-xs opacity-60">
                Only someone with this password can open it.
              </p>
            </div>
          </div>

          <form class="mt-4 space-y-3" @submit.prevent="submit" @keydown.esc="emit('close')">
            <label class="input input-bordered flex w-full items-center gap-2">
              <span class="text-base-content/50 w-5 text-center"><AppIcon name="key" :size="17" /></span>
              <input
                ref="inputEl"
                v-model="pass"
                :type="show ? 'text' : 'password'"
                class="grow"
                placeholder="password"
                autocomplete="off"
              >
              <button type="button" class="btn btn-ghost btn-xs" :aria-label="show ? 'Hide password' : 'Show password'" @click="show = !show">
                <AppIcon :name="show ? 'eye-off' : 'eye'" :size="17" />
              </button>
            </label>

            <div v-if="confirm && pass" class="strength">
              <div class="strength-track">
                <div class="strength-fill" :style="{ width: `${(strength.score + 1) * 20}%`, background: strength.color }" />
              </div>
              <span class="text-xs font-medium" :style="{ color: strength.color }">{{ strength.label }}</span>
            </div>

            <label v-if="confirm" class="input input-bordered flex w-full items-center gap-2">
              <span class="text-base-content/50 w-5 text-center"><AppIcon name="repeat" :size="17" /></span>
              <input
                v-model="repeat"
                :type="show ? 'text' : 'password'"
                class="grow"
                placeholder="confirm password"
                autocomplete="off"
              >
            </label>
            <p v-if="mismatch" class="text-error text-xs">
              Passwords don't match.
            </p>

            <div class="flex justify-end gap-2 pt-1">
              <button type="button" class="btn btn-ghost" @click="emit('close')">
                Cancel
              </button>
              <button type="submit" class="btn btn-primary" :disabled="!valid" aria-label="Confirm">
                <AppIcon name="check" :size="20" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: oklch(40% 0.05 60 / 0.4);
  backdrop-filter: blur(3px);
}
.pp-card {
  width: 100%;
  max-width: 24rem;
  padding: 1.5rem;
  border-radius: var(--radius-box);
  background: var(--color-base-100);
  box-shadow: 0 20px 50px oklch(40% 0.06 60 / 0.3);
}
.strength {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.2rem;
}
.strength-track {
  flex: 1;
  height: 0.4rem;
  border-radius: 999px;
  background: var(--color-base-300);
  overflow: hidden;
}
.strength-fill {
  height: 100%;
  border-radius: 999px;
  transition:
    width 0.25s ease,
    background 0.25s ease;
}
.pp-enter-active,
.pp-leave-active {
  transition: opacity 0.2s ease;
}
.pp-enter-from,
.pp-leave-to {
  opacity: 0;
}
</style>
