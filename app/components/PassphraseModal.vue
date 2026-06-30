<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  /** Require a confirm field (sending) vs single field (receiving). */
  confirm?: boolean
}>(), {
  title: 'Preshared key',
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

function submit() {
  if (valid.value)
    emit('submit', pass.value)
}
</script>

<template>
  <Transition name="modal">
    <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
      <div class="modal-card anim-pop">
        <div class="flex items-center gap-3">
          <TeddyBear :size="56" mood="idle" />
          <div>
            <h3 class="text-lg font-bold">
              {{ title }}
            </h3>
            <p class="text-xs opacity-60">
              Only someone with this key can open it.
            </p>
          </div>
        </div>

        <form class="mt-4 space-y-3" @submit.prevent="submit">
          <label class="input input-bordered flex items-center gap-2">
            <span class="text-base">🔑</span>
            <input
              ref="inputEl"
              v-model="pass"
              :type="show ? 'text' : 'password'"
              class="grow"
              placeholder="preshared key"
              autocomplete="off"
            >
            <button type="button" class="btn btn-ghost btn-xs" @click="show = !show">
              {{ show ? '🙈' : '👁️' }}
            </button>
          </label>

          <input
            v-if="confirm"
            v-model="repeat"
            :type="show ? 'text' : 'password'"
            class="input input-bordered w-full"
            placeholder="confirm key"
            autocomplete="off"
          >
          <p v-if="mismatch" class="text-error text-xs">
            Keys don't match.
          </p>

          <div class="flex justify-end gap-2 pt-1">
            <button type="button" class="btn btn-ghost" @click="emit('close')">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!valid">
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: oklch(40% 0.05 60 / 0.4);
  backdrop-filter: blur(3px);
}
.modal-card {
  width: 100%;
  max-width: 24rem;
  padding: 1.5rem;
  border-radius: var(--radius-box);
  background: var(--color-base-100);
  box-shadow: 0 20px 50px oklch(40% 0.06 60 / 0.3);
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
