<script setup lang="ts">
// ohloud icon set — flat, minimal single-weight line icons with soft rounded caps
// and a cuddly, happy character (see ICON-THEME.md for how to draw more). Every
// icon lives on a 24×24 grid, is stroked in `currentColor`, and inherits its size
// from the surrounding font unless `size` is given.

const props = withDefaults(defineProps<{
  name: string
  /** px number or any CSS length; defaults to 1em so it tracks the text. */
  size?: number | string
}>(), { size: '1em' })

// Each entry is the inner SVG markup for a 24×24 viewBox. Strokes use currentColor;
// tiny filled dots (eyes/noses) set their own fill.
const ICONS: Record<string, string> = {
  // ── core actions ──
  'send': '<path d="M20.5 3.5 3.5 10.2l6.7 2.6 2.6 6.7 7.7-16Z"/><path d="M10.2 12.8 20.5 3.5"/>',
  'receive': '<path d="M4 14v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><path d="M12 3.5v10.5"/><path d="M8 10l4 4 4-4"/>',
  'share': '<path d="M4 9.5v5h3.5l5 4v-13l-5 4H4Z"/><path d="M16 9.5a3 3 0 0 1 0 5"/><path d="M18.7 7a6 6 0 0 1 0 10"/>',
  'listen': '<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v3"/><path d="M9 20.5h6"/>',
  'download': '<path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M5 19h14"/>',
  'upload': '<path d="M4 14v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><path d="M12 16V5"/><path d="M8 9l4-4 4 4"/>',
  'check': '<path d="M5 12.5l4.5 4.5L19 6.5"/>',
  'repeat': '<path d="M17.5 8A6 6 0 0 0 7 9.2"/><path d="M6.5 4.5V9h4.5"/><path d="M6.5 16A6 6 0 0 0 17 14.8"/><path d="M17.5 19.5V15H13"/>',

  // ── content ──
  'text': '<path d="M4 4.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"/><path d="M7 8.5h10"/><path d="M7 11.5h6"/>',
  'file': '<path d="M13 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V10Z"/><path d="M13 3.5V10h6.5"/>',

  // ── speed mascots ──
  // Colored: detailed, emoji-style candy mascots.
  'turtle': '<ellipse cx="6.8" cy="17.3" rx="1.9" ry="1.35" fill="#8FDCB4" stroke="#2FA870" stroke-width="1.3"/><ellipse cx="14.9" cy="17.3" rx="1.9" ry="1.35" fill="#8FDCB4" stroke="#2FA870" stroke-width="1.3"/><path d="M4.3 13.9c-1.5 0-2.4.6-2.7 1.6l2.6.5Z" fill="#8FDCB4" stroke="#2FA870" stroke-width="1.3"/><path d="M17.4 12.6c1.9-.5 3.5.6 3.6 2.2.1 1.4-1.1 2.4-2.6 2.4-1.4 0-2.3-.9-2.3-2" fill="#8FDCB4" stroke="#2FA870" stroke-width="1.4"/><circle cx="19.3" cy="14.4" r="0.72" fill="#215F44" stroke="none"/><path d="M18.1 15.9c.55.45 1.2.45 1.75.02" fill="none" stroke="#215F44" stroke-width="1"/><path d="M4 15.5c0-4.2 3.5-7.1 7.6-7.1s7.6 2.9 7.6 7.1c0 .85-.45 1.3-1.3 1.3H5.3c-.85 0-1.3-.45-1.3-1.3Z" fill="#6FCB9C" stroke="#2FA870" stroke-width="1.5"/><path d="M11.6 9.7 8.7 12l1.05 3.7h3.7L14.5 12Z" fill="#C0F0D8" stroke="#2FA870" stroke-width="1.3"/><path d="M8.7 12 6 12.9m8.5-.9 2.7.9M9.75 15.7 7.7 16.6m5.9-.9 2 .9" stroke="#2FA870" stroke-width="1.2" opacity="0.55"/>',
  'rabbit': '<path d="M8.9 11.7C7.2 7.9 7.5 3.5 9.7 3.5c2.1 0 2.2 4.4 1.15 8Z" fill="#FCE7F0" stroke="#E877AA" stroke-width="1.5"/><path d="M15.1 11.7C16.8 7.9 16.5 3.5 14.3 3.5c-2.1 0-2.2 4.4-1.15 8Z" fill="#FCE7F0" stroke="#E877AA" stroke-width="1.5"/><path d="M9.55 9.9C8.75 7.4 8.85 5.1 9.7 5.1s.95 2.6.42 4.8Z" fill="#F6A6CB" stroke="none"/><path d="M14.45 9.9C15.25 7.4 15.15 5.1 14.3 5.1s-.95 2.6-.42 4.8Z" fill="#F6A6CB" stroke="none"/><circle cx="12" cy="15.3" r="4.5" fill="#FCE7F0" stroke="#E877AA" stroke-width="1.5"/><circle cx="8.6" cy="16.5" r="1.2" fill="#F6A6CB" stroke="none"/><circle cx="15.4" cy="16.5" r="1.2" fill="#F6A6CB" stroke="none"/><circle cx="10.4" cy="14.7" r="0.95" fill="#5B3247" stroke="none"/><circle cx="13.6" cy="14.7" r="0.95" fill="#5B3247" stroke="none"/><circle cx="10.72" cy="14.38" r="0.32" fill="#fff" stroke="none"/><circle cx="13.92" cy="14.38" r="0.32" fill="#fff" stroke="none"/><path d="M11.2 16.35h1.6l-0.8 0.95Z" fill="#E877AA" stroke="none"/><path d="M12 17.35c-.55.55-1.2.5-1.6.05M12 17.35c.55.55 1.2.5 1.6.05" fill="none" stroke="#E877AA" stroke-width="1"/><path d="M8.3 15.5 5.9 15.1m2.4 1.6-2.2 1m9.6-2.6 2.4-.4m-2.4 1.6 2.2 1" stroke="#E877AA" stroke-width="0.9" opacity="0.5"/>',

  // ── security / status ──
  'key': '<circle cx="7.2" cy="12" r="3.4"/><path d="M10.6 12H20"/><path d="M16.5 12v3"/><path d="M19.5 12v3.6"/>',
  'eye': '<path d="M2.5 12S6 6.2 12 6.2 21.5 12 21.5 12 18 17.8 12 17.8 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.4"/>',
  'eye-off': '<path d="M3.5 12.5c3 3.8 14 3.8 17 0"/><path d="M5 14.2l-1.2 1.6"/><path d="M12 15.4v1.8"/><path d="M19 14.2l1.2 1.6"/><path d="M8.3 15.1 7.4 17"/><path d="M15.7 15.1l.9 1.9"/>',
  'lock': '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14v2.5"/>',
  'warning': '<path d="M12 4 3 19.5h18L12 4Z"/><path d="M12 10v4"/><circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none"/>',

  // ── delight ──
  // Colored: candy delight glyphs.
  'wave': '<path d="M5 10.5v3" stroke="#E877AA"/><path d="M9 7v10" stroke="#F7975F"/><path d="M13 8.5v7" stroke="#F2B33B"/><path d="M17 5.5v13" stroke="#37B27C"/><path d="M21 10.5v3" stroke="#5AA9F0"/>',
  'sparkle': '<path d="M12 3.5l1.7 4.7 4.7 1.7-4.7 1.7L12 16.3l-1.7-4.7-4.7-1.7 4.7-1.7L12 3.5Z" fill="#FCD97A" stroke="#F2B33B"/><path d="M18.6 15.2l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8Z" fill="#FCD97A" stroke="#F2B33B"/>',
  'heart': '<path d="M12 20.2c-4.8-3.1-7-6-7-9A3.5 3.5 0 0 1 12 8.2a3.5 3.5 0 0 1 7 2.9c0 3-2.2 5.9-7 9Z" fill="#FFB3C8" stroke="#FF7A9C"/>',
  'note': '<ellipse cx="7.5" cy="17.3" rx="3" ry="2.2" fill="#C4A7F5" stroke="#9B6FE8"/><path d="M10.5 17V6l6.5 1.8v3.2" stroke="#9B6FE8"/>',
}

const inner = computed(() => ICONS[props.name] ?? '')
const dim = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))
</script>

<template>
  <svg
    :width="dim"
    :height="dim"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="app-icon inline-block shrink-0 align-[-0.15em]"
    aria-hidden="true"
    v-html="inner"
  />
</template>
