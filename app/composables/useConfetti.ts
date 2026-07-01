// Two-sided confetti cannon for happy moments. Lazy-loads canvas-confetti so it
// only ships when first celebrated.

export function useConfetti() {
  async function celebrate() {
    // Respect reduced-motion — skip the animation entirely.
    if (import.meta.client && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      return
    const confetti = (await import('canvas-confetti')).default
    const base = {
      spread: 78,
      startVelocity: 55,
      particleCount: 90,
      ticks: 220,
      gravity: 0.9,
      scalar: 1.05,
      colors: ['#f7b267', '#f4a6c0', '#9fc8f0', '#bfe3a0', '#fff3d6'],
    }
    // Fire from both bottom corners, shooting inward and up.
    confetti({ ...base, angle: 60, origin: { x: 0, y: 0.7 } })
    confetti({ ...base, angle: 120, origin: { x: 1, y: 0.7 } })
  }

  return { celebrate }
}
