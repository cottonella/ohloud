<script setup lang="ts">
interface TabOption { value: string, label: string, icon?: string }

const props = withDefaults(defineProps<{
  modelValue: string
  options: TabOption[]
  /** Stretch to fill the container (vs. shrink to content). */
  block?: boolean
  /** Icon size in px (default 18). */
  iconSize?: number
}>(), { block: false, iconSize: 18 })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const activeIndex = computed(() =>
  Math.max(0, props.options.findIndex(o => o.value === props.modelValue)),
)
</script>

<template>
  <div
    class="pill-tabs"
    :class="{ 'is-block': block }"
    role="tablist"
    :style="{ '--count': options.length, '--active': activeIndex }"
  >
    <span class="pill" aria-hidden="true" />
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="tab"
      :aria-selected="o.value === modelValue"
      class="pill-tab"
      :class="{ 'is-active': o.value === modelValue }"
      @click="emit('update:modelValue', o.value)"
    >
      <AppIcon v-if="o.icon" :name="o.icon" :size="iconSize" />
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.pill-tabs {
  position: relative;
  display: inline-grid;
  grid-template-columns: repeat(var(--count), 1fr);
  padding: 0.3rem;
  background: var(--color-base-200);
  border-radius: var(--radius-field);
}
.pill-tabs.is-block {
  display: grid;
  width: 100%;
}
.pill {
  position: absolute;
  top: 0.3rem;
  bottom: 0.3rem;
  left: 0.3rem;
  width: calc((100% - 0.6rem) / var(--count));
  transform: translateX(calc(var(--active) * 100%));
  background: var(--color-base-100);
  border-radius: calc(var(--radius-field) - 0.3rem);
  box-shadow: 0 2px 8px oklch(50% 0.05 60 / 0.18);
  transition: transform 0.32s cubic-bezier(0.34, 1.45, 0.5, 1);
}
.pill-tab {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.55rem 1rem;
  border: none;
  background: transparent;
  border-radius: calc(var(--radius-field) - 0.3rem);
  font-weight: 600;
  color: var(--color-base-content);
  opacity: 0.55;
  cursor: pointer;
  white-space: nowrap;
  transition:
    opacity 0.2s ease,
    color 0.2s ease;
}
.pill-tab.is-active {
  opacity: 1;
  color: var(--color-primary);
}
.pill-tab:hover:not(.is-active) {
  opacity: 0.85;
}
@media (prefers-reduced-motion: reduce) {
  .pill {
    transition: none;
  }
}
</style>
