<script setup lang="ts">
type Mood = 'idle' | 'sending' | 'listening' | 'happy' | 'sad'

const props = withDefaults(defineProps<{ mood?: Mood, size?: number }>(), {
  mood: 'idle',
  size: 160,
})

const animClass = computed(() => ({
  idle: 'anim-float',
  sending: 'anim-wiggle',
  listening: 'anim-bob',
  happy: 'anim-bob',
  sad: '',
}[props.mood]))

const happy = computed(() => props.mood === 'happy')
const sad = computed(() => props.mood === 'sad')
</script>

<template>
  <div class="teddy-wrap" :style="{ width: `${size}px`, height: `${size}px` }">
    <template v-if="mood === 'listening'">
      <span v-for="i in 3" :key="i" class="ring" :style="{ animationDelay: `${(i - 1) * 0.5}s` }" />
    </template>
    <template v-if="mood === 'sending'">
      <span
        v-for="i in 4"
        :key="i"
        class="note"
        :style="{ 'left': `${48 + i * 7}%`, 'animationDelay': `${i * 0.32}s`, '--dx': `${(i % 2 ? 1 : -1) * 16}px` }"
      ><AppIcon name="note" :size="20" /></span>
    </template>

    <div class="teddy" :class="animClass">
      <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true">
        <!-- ears -->
        <circle cx="56" cy="58" r="26" fill="var(--color-primary)" />
        <circle cx="144" cy="58" r="26" fill="var(--color-primary)" />
        <circle cx="56" cy="58" r="13" fill="var(--color-secondary)" />
        <circle cx="144" cy="58" r="13" fill="var(--color-secondary)" />
        <!-- head -->
        <circle cx="100" cy="112" r="70" fill="var(--color-primary)" />
        <!-- cheeks -->
        <ellipse cx="62" cy="126" rx="10" ry="6.5" fill="var(--color-secondary)" opacity="0.65" />
        <ellipse cx="138" cy="126" rx="10" ry="6.5" fill="var(--color-secondary)" opacity="0.65" />
        <!-- snout -->
        <ellipse cx="100" cy="132" rx="36" ry="28" fill="var(--color-base-100)" />

        <!-- eyes -->
        <template v-if="happy">
          <path d="M70 102 q9 -12 18 0" fill="none" stroke="var(--color-base-content)" stroke-width="5" stroke-linecap="round" />
          <path d="M112 102 q9 -12 18 0" fill="none" stroke="var(--color-base-content)" stroke-width="5" stroke-linecap="round" />
        </template>
        <template v-else>
          <circle cx="79" cy="104" r="7.5" fill="var(--color-base-content)" />
          <circle cx="121" cy="104" r="7.5" fill="var(--color-base-content)" />
          <circle cx="81.5" cy="101.5" r="2.4" fill="white" />
          <circle cx="123.5" cy="101.5" r="2.4" fill="white" />
          <path v-if="sad" d="M70 92 q9 -5 18 -1" fill="none" stroke="var(--color-base-content)" stroke-width="3" stroke-linecap="round" />
          <path v-if="sad" d="M112 91 q9 -4 18 1" fill="none" stroke="var(--color-base-content)" stroke-width="3" stroke-linecap="round" />
        </template>

        <!-- nose + mouth -->
        <ellipse cx="100" cy="120" rx="10" ry="7" fill="var(--color-base-content)" />
        <path d="M100 127 v6" stroke="var(--color-base-content)" stroke-width="3" stroke-linecap="round" />
        <path
          v-if="sad"
          d="M86 144 q14 -11 28 0"
          fill="none"
          stroke="var(--color-base-content)"
          stroke-width="3.5"
          stroke-linecap="round"
        />
        <path
          v-else
          d="M86 134 q14 13 28 0"
          fill="none"
          stroke="var(--color-base-content)"
          stroke-width="3.5"
          stroke-linecap="round"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.teddy-wrap {
  position: relative;
  display: grid;
  place-items: center;
}
.teddy {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 8px 14px oklch(60% 0.08 60 / 0.25));
}
.ring {
  position: absolute;
  width: 72%;
  height: 72%;
  border: 3px solid var(--color-accent);
  border-radius: 999px;
  animation: ring 1.5s ease-out infinite;
}
.note {
  position: absolute;
  top: 28%;
  font-size: 1.5rem;
  color: var(--color-secondary);
  animation: note-rise 1.5s ease-out infinite;
}
</style>
