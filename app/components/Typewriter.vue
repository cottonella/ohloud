<script setup lang="ts">
// Cycles through `words`, typing each one out character by character, holding,
// then erasing it — with a blinking caret. Reserves the width of the longest word
// so the surrounding line never reflows.

const props = withDefaults(defineProps<{
  words: string[]
  typeSpeed?: number
  deleteSpeed?: number
  hold?: number
}>(), { typeSpeed: 72, deleteSpeed: 36, hold: 1500 })

const display = ref('')
let wordIdx = 0
let charIdx = 0
let deleting = false
let timer: ReturnType<typeof setTimeout> | null = null

function tick(): void {
  const word = props.words[wordIdx % props.words.length] ?? ''
  if (!deleting) {
    charIdx++
    display.value = word.slice(0, charIdx)
    if (charIdx >= word.length) {
      deleting = true
      timer = setTimeout(tick, props.hold)
    }
    else {
      timer = setTimeout(tick, props.typeSpeed)
    }
  }
  else {
    charIdx--
    display.value = word.slice(0, Math.max(0, charIdx))
    if (charIdx <= 0) {
      deleting = false
      wordIdx = (wordIdx + 1) % props.words.length
      timer = setTimeout(tick, 380)
    }
    else {
      timer = setTimeout(tick, props.deleteSpeed)
    }
  }
}

const reserveCh = computed(() => Math.max(1, ...props.words.map(w => w.length)))

onMounted(() => {
  timer = setTimeout(tick, 600)
})
onBeforeUnmount(() => {
  if (timer)
    clearTimeout(timer)
})
</script>

<template>
  <span class="tw" :style="{ minWidth: `${reserveCh}ch` }">{{ display }}<span class="tw-caret" aria-hidden="true" /></span>
</template>

<style scoped>
.tw {
  display: inline-block;
  text-align: left;
  white-space: nowrap;
}
.tw-caret {
  display: inline-block;
  width: 2px;
  height: 0.95em;
  margin-left: 2px;
  vertical-align: -0.12em;
  background: currentColor;
  border-radius: 1px;
  animation: tw-blink 1.05s step-end infinite;
}
@keyframes tw-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .tw-caret {
    animation: none;
  }
}
</style>
