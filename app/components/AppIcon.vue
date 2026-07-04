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
  'download': '<path d="M12 4.5v10"/><path d="M8 10.5l4 4 4-4"/><path d="M5 19.5h14"/>',
  'upload': '<path d="M4 14v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><path d="M12 16V5"/><path d="M8 9l4-4 4 4"/>',
  'desktop': '<rect x="3" y="4.5" width="18" height="12" rx="1.6"/><path d="M12 16.5v3.5"/><path d="M8.5 20h7"/>',
  'phone': '<rect x="7" y="3" width="10" height="18" rx="2.4"/><path d="M10.5 18h3"/>',
  'check': '<path d="M5 12.5l4.5 4.5L19 6.5"/>',
  'copy': '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>',
  'play': '<path d="M8 5.5 19 12 8 18.5Z"/>',
  'repeat': '<path d="M17.5 8A6 6 0 0 0 7 9.2"/><path d="M6.5 4.5V9h4.5"/><path d="M6.5 16A6 6 0 0 0 17 14.8"/><path d="M17.5 19.5V15H13"/>',

  // ── content ──
  'text': '<path d="M4 4.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"/><path d="M7 8.5h10"/><path d="M7 11.5h6"/>',
  'file': '<path d="M13 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V10Z"/><path d="M13 3.5V10h6.5"/>',

  // ── speed mascots ──
  // Colored: detailed, emoji-style candy mascots.
  'turtle': '<ellipse cx="17.5" cy="18.7" rx="2.1" ry="1.6" fill="#7FD4A8" stroke="#2E9E6E" stroke-width="1.2"/><ellipse cx="9" cy="18.9" rx="2.1" ry="1.6" fill="#7FD4A8" stroke="#2E9E6E" stroke-width="1.2"/><path d="M21 15.6c1.5-.2 2.4.3 2.7.3-.4.8-1 1.4-2.2 1.5Z" fill="#7FD4A8" stroke="#2E9E6E" stroke-width="1.1"/><path d="M7.2 16.3c0-5 3.4-8.7 7.5-8.7s7.5 3.7 7.5 8.7c0 1.05-.6 1.6-1.7 1.6H8.9c-1.1 0-1.7-.55-1.7-1.6Z" fill="#6FCB9C" stroke="#2E9E6E" stroke-width="1.5"/><path d="M8 16.4h13.4" stroke="#2E9E6E" stroke-width="1.1" opacity="0.45"/><path d="M14.7 9.9 17 11.4 16.4 14 13.4 14.4 11.9 12.3 12.9 10.4Z" fill="#8FE0B8" stroke="#2E9E6E" stroke-width="1.05"/><path d="M14.7 9.9 14.5 7.7M17 11.4 20 11M16.4 14 18.3 16.2M13.4 14.4 13 16.7M11.9 12.3 9.2 13M12.9 10.4 10.8 9" stroke="#2E9E6E" stroke-width="0.95" opacity="0.55"/><circle cx="5.6" cy="14.6" r="3.3" fill="#7FD4A8" stroke="#2E9E6E" stroke-width="1.3"/><circle cx="4.6" cy="14" r="0.92" fill="#1F5E43" stroke="none"/><circle cx="7" cy="14.1" r="0.92" fill="#1F5E43" stroke="none"/><circle cx="4.9" cy="13.7" r="0.3" fill="#fff" stroke="none"/><circle cx="7.3" cy="13.8" r="0.3" fill="#fff" stroke="none"/><path d="M4.5 15.9c.7.6 1.7.6 2.4 0" stroke="#1F5E43" stroke-width="0.95" fill="none" stroke-linecap="round"/><circle cx="3.5" cy="15.4" r="0.75" fill="#F49BC0" opacity="0.55" stroke="none"/>',
  'rabbit': '<path d="M10.2 11C8.1 8.3 6.9 4.7 7.7 2.8 8.1 1.85 9.2 2.05 9.9 3.4 10.7 5.1 11 8.3 10.7 10.9Z" fill="#FCEAF3" stroke="#DB5E97" stroke-width="1.05"/><path d="M13.6 11C12.9 8.5 12.8 5.8 13.7 4 14.5 2.6 16.2 2.6 17.1 3.7 18.1 4.9 17.9 6.8 16.6 7.7 15.8 8.3 14.8 8.2 14.2 7.4 14.6 9 14.5 10.2 14.4 11Z" fill="#FCEAF3" stroke="#DB5E97" stroke-width="1.05"/><path d="M10.1 10C8.6 8 7.9 5.2 8.4 3.9 8.7 3.2 9.3 3.6 9.7 4.7 10.2 6.3 10.3 8.4 10.2 9.9Z" fill="#F7A9CC" stroke="none"/><path d="M13.8 9.9C13.25 7.9 13.3 5.9 14.1 4.7 14.45 4.05 14.8 4.5 14.8 5.7 14.8 7.1 14.55 8.5 14.35 9.9Z" fill="#F7A9CC" stroke="none"/><path d="M12 10C15 10 16.7 11.3 17.4 13.2 18 14.9 19.4 15.4 19.4 16.9 19.4 18.7 17.3 20.2 14.4 20.9 13.6 21.1 12.8 21.2 12 21.2 11.2 21.2 10.4 21.1 9.6 20.9 6.7 20.2 4.6 18.7 4.6 16.9 4.6 15.4 6 14.9 6.6 13.2 7.3 11.3 9 10 12 10Z" fill="#FCEAF3" stroke="#DB5E97" stroke-width="1.05"/><ellipse cx="7.5" cy="17" rx="1.2" ry="0.9" fill="#F7A9CC" opacity="0.55" stroke="none"/><ellipse cx="16.5" cy="17" rx="1.2" ry="0.9" fill="#F7A9CC" opacity="0.55" stroke="none"/><circle cx="9.5" cy="14.4" r="1.35" fill="#4A2C3A" stroke="none"/><circle cx="14.5" cy="14.4" r="1.35" fill="#4A2C3A" stroke="none"/><circle cx="10.02" cy="13.9" r="0.44" fill="#fff" stroke="none"/><circle cx="15.02" cy="13.9" r="0.44" fill="#fff" stroke="none"/><path d="M11.1 15.9H12.9L12 16.9Z" fill="#EE6FA3" stroke="none"/><path d="M12 16.9V17.55M12 17.55C11.45 18.2 10.7 18.1 10.4 17.65M12 17.55C12.55 18.2 13.3 18.1 13.6 17.65" stroke="#C46188" stroke-width="0.85" fill="none" stroke-linecap="round"/>',
  // Beaming, sparkle-flanked rocket (Turbo). Fill-only shapes set stroke="none"
  // so the shared 1.8 currentColor wrapper stroke doesn't outline the sparkles.
  'rocket': '<path d="M4.5 3.8 4.98 5.02 6.2 5.5 4.98 5.98 4.5 7.2 4.02 5.98 2.8 5.5 4.02 5.02Z" fill="#FCD97A" stroke="none"/><path d="M19 5.4 19.45 6.55 20.6 7 19.45 7.45 19 8.6 18.55 7.45 17.4 7 18.55 6.55Z" fill="#FCD97A" stroke="none"/><path d="M16.7 3 16.98 3.72 17.7 4 16.98 4.28 16.7 5 16.42 4.28 15.7 4 16.42 3.72Z" fill="#FCD97A" stroke="none"/><path d="M8.3 12.6C6.6 13.4 5.6 15 5.3 17.3 6.4 17 7.4 16.8 8.3 16.7Z" fill="#FFB3A0" stroke="#E8734F" stroke-width="1.1"/><path d="M15.7 12.6C17.4 13.4 18.4 15 18.7 17.3 17.6 17 16.6 16.8 15.7 16.7Z" fill="#FFB3A0" stroke="#E8734F" stroke-width="1.1"/><path d="M12 2.2C9.5 4.1 8.3 6.9 8.3 10.2V15.6C8.3 16.5 8.9 17.1 9.8 17.1H14.2C15.1 17.1 15.7 16.5 15.7 15.6V10.2C15.7 6.9 14.5 4.1 12 2.2Z" fill="#EAF2FE" stroke="#5B8FC9" stroke-width="1.2"/><path d="M12 2.2C10.6 3.3 9.7 4.7 9.1 6.4H14.9C14.3 4.7 13.4 3.3 12 2.2Z" fill="#FFB3A0" stroke="#E8734F" stroke-width="1.05"/><path d="M10.3 17.5C10.2 19.3 10.8 20.7 12 21.9 13.2 20.7 13.8 19.3 13.7 17.5Z" fill="#FCD97A" stroke="#F2A23B" stroke-width="1.05"/><path d="M9.4 10.3c.5-.7 1.4-.7 1.9 0" stroke="#2C4A6E" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M12.7 10.3c.5-.7 1.4-.7 1.9 0" stroke="#2C4A6E" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M10.2 12c0 1.4.8 2.4 1.8 2.4s1.8-1 1.8-2.4Z" fill="#E8734F" stroke="#2C4A6E" stroke-width="0.95"/><circle cx="8.9" cy="12" r="0.8" fill="#F7A9CC" stroke="none"/><circle cx="15.1" cy="12" r="0.8" fill="#F7A9CC" stroke="none"/>',

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
  'heart': '<path d="M12 19.2c-4.8-3.1-7-6-7-9A3.5 3.5 0 0 1 12 7.2a3.5 3.5 0 0 1 7 2.9c0 3-2.2 5.9-7 9Z" fill="#FFB3C8" stroke="#FF7A9C"/>',
  'note': '<ellipse cx="7.5" cy="17.3" rx="3" ry="2.2" fill="#C4A7F5" stroke="#9B6FE8"/><path d="M10.5 17V6l6.5 1.8v3.2" stroke="#9B6FE8"/>',

  // ── brand ──
  // The GitHub mark is a solid silhouette, so it fills with currentColor.
  'github': '<path fill="currentColor" stroke="none" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>',
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
