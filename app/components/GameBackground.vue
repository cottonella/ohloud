<script setup lang="ts">
// A cute side-scrolling platform-game scene pinned to the bottom of the viewport:
// hazy parallax mountains and layered leaf-grass that pan so the truck looks like it
// drives left, its wheels rolling and body bouncing on an irregular rhythm. Purely
// decorative; frozen under prefers-reduced-motion.

// Procedural, seamless grass tile: a scalloped ground mound plus many curved leaf
// blades in a few tones, and (front layer) a couple of tiny flowers.
function grassTile(ground: string, tones: string[], count: number, maxH: number, seed: number, flowers: boolean): string {
  let s = seed >>> 0
  const rnd = (): number => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    return s / 0xFFFFFFFF
  }
  const W = 200
  const H = 150
  const gy = 96
  const f = (n: number): string => n.toFixed(1)

  const groundPath = `M0 ${gy} C15 ${gy - 13} 26 ${gy - 13} 40 ${gy - 2} C55 ${gy - 14} 66 ${gy - 14} 80 ${gy - 2} C95 ${gy - 16} 106 ${gy - 16} 120 ${gy - 2} C135 ${gy - 14} 146 ${gy - 14} 160 ${gy - 2} C175 ${gy - 16} 186 ${gy - 16} 200 ${gy} L200 ${H} L0 ${H} Z`

  const blades: { h: number, path: string }[] = []
  for (let i = 0; i < count; i++) {
    const x = (i + rnd() * 0.95) * (W / count)
    const h = maxH * (0.5 + rnd() * 0.5)
    const lean = (rnd() - 0.5) * 18
    const w = 1.7 + rnd() * 1.5
    const baseY = gy - 3 + rnd() * 6
    const tone = tones[Math.floor(rnd() * tones.length)]!
    const tipX = x + lean
    const tipY = baseY - h
    const leaf = `<path d='M${f(x - w)} ${f(baseY)} Q${f(x - w * 0.5 + lean * 0.3)} ${f(baseY - h * 0.55)} ${f(tipX)} ${f(tipY)} Q${f(x + w * 0.5 + lean * 0.3)} ${f(baseY - h * 0.55)} ${f(x + w)} ${f(baseY)} Z' fill='${tone}'/>`
    const vein = `<path d='M${f(x)} ${f(baseY)} Q${f(x + lean * 0.4)} ${f(baseY - h * 0.6)} ${f(tipX)} ${f(tipY)}' stroke='${ground}' stroke-width='0.5' fill='none' opacity='0.35'/>`
    blades.push({ h, path: leaf + vein })
  }
  blades.sort((a, b) => a.h - b.h)

  let flowerSvg = ''
  if (flowers) {
    for (let k = 0; k < 2; k++) {
      const fx = 40 + k * 110 + rnd() * 30
      const fy = gy - maxH * (0.6 + rnd() * 0.25)
      const petal = ['#FFC9E0', '#FFE39A', '#CDEBFF'][Math.floor(rnd() * 3)]!
      flowerSvg += `<g><path d='M${f(fx)} ${f(fy + 6)} Q${f(fx - 2)} ${f(fy + 16)} ${f(fx)} ${f(gy - 2)}' stroke='${tones[0]}' stroke-width='1.4' fill='none'/>`
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2
        flowerSvg += `<circle cx='${f(fx + Math.cos(a) * 3.4)}' cy='${f(fy + Math.sin(a) * 3.4)}' r='2.4' fill='${petal}'/>`
      }
      flowerSvg += `<circle cx='${f(fx)}' cy='${f(fy)}' r='2' fill='#FFE39A'/></g>`
    }
  }

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><path d='${groundPath}' fill='${ground}'/>${blades.map(b => b.path).join('')}${flowerSvg}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

const grassBack = grassTile('#AFDFBE', ['#C7EDD1', '#B6E4C4'], 18, 30, 0x11, false)
const grassMid = grassTile('#87CE9E', ['#A6E2BA', '#79C692'], 24, 42, 0x53, false)
const grassFront = grassTile('#4FAE77', ['#6FC490', '#3F9A66', '#84CE9E'], 34, 56, 0x9D, true)

// Seamless hazy mountain range for the far horizon: sharp, jagged triangular peaks
// (with a little snow cap on the tallest) that meet the tile edges at the same
// height so it can pan forever without a seam.
function mountainTile(fill: string, cap: string, seed: number, peaks: number, maxH: number, W: number): string {
  let s = seed >>> 0
  const rnd = (): number => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    return s / 0xFFFFFFFF
  }
  const H = 300
  const f = (n: number): string => n.toFixed(1)
  const seg = W / peaks
  const edgeY = H - maxH * 0.34

  const ridge: { x: number, y: number, ph: number }[] = [{ x: 0, y: edgeY, ph: 0 }]
  for (let i = 0; i < peaks; i++) {
    const ph = 0.5 + rnd() * 0.5
    ridge.push({ x: i * seg + seg * (0.3 + rnd() * 0.4), y: H - maxH * ph, ph })
    const vy = i === peaks - 1 ? edgeY : H - maxH * (0.12 + rnd() * 0.2)
    ridge.push({ x: (i + 1) * seg, y: vy, ph: 0 })
  }

  const line = ridge.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ')
  const body = `<path d='${line} L${W} ${H} L0 ${H} Z' fill='${fill}'/>`

  // Snow caps that ride each tall peak's own slopes, so the cap stays as wide as the
  // mountain instead of a thin sliver. Ridge order is [edge, peak, valley, peak, …],
  // so a peak's neighbours are its left and right valleys.
  let caps = ''
  for (let j = 1; j < ridge.length; j += 2) {
    const a = ridge[j]
    if (a.ph <= 0.66)
      continue
    const lft = ridge[j - 1]!
    const rgt = ridge[j + 1]!
    const k = 0.32 // snow covers the top third of the slopes
    const blx = a.x + (lft.x - a.x) * k
    const bly = a.y + (lft.y - a.y) * k
    const brx = a.x + (rgt.x - a.x) * k
    const bry = a.y + (rgt.y - a.y) * k
    const drop = (bly + bry) / 2 - a.y
    let d = `M${f(a.x)} ${f(a.y)} L${f(blx)} ${f(bly)}`
    const steps = 4
    for (let t = 1; t < steps; t++) {
      const fr = t / steps
      const x = blx + (brx - blx) * fr
      const y = bly + (bry - bly) * fr + (t % 2 === 0 ? drop * 0.3 : -drop * 0.14)
      d += ` L${f(x)} ${f(y)}`
    }
    d += ` L${f(brx)} ${f(bry)} Z`
    caps += `<path d='${d}' fill='${cap}'/>`
  }

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>${body}${caps}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// Wide tiles with just two broad peaks, so only one or two mountains span the width.
const mtnFar = mountainTile('#CDC7E6', '#F4F1FB', 0x51, 2, 190, 1240)
const mtnNear = mountainTile('#B7B3D8', '#ECE9F6', 0x2f, 2, 135, 1000)
</script>

<template>
  <div class="game" aria-hidden="true">
    <div class="layer mtn-far" :style="{ backgroundImage: mtnFar }" />
    <div class="layer mtn-near" :style="{ backgroundImage: mtnNear }" />
    <div class="layer back" :style="{ backgroundImage: grassBack }" />
    <div class="layer mid" :style="{ backgroundImage: grassMid }" />

    <!-- Truck drives left (mirrored), so cab + headlight lead on the left. -->
    <div class="truck">
      <div class="truck-bob">
        <div class="truck-jit">
          <svg viewBox="0 0 220 150" width="188" height="128" style="transform: scaleX(-1)">
            <ellipse cx="112" cy="139" rx="96" ry="8" fill="#1f5b3a" opacity="0.14" />
            <rect x="10" y="74" width="126" height="42" rx="8" fill="#F58BAE" />
            <rect x="14" y="86" width="118" height="30" rx="6" fill="#F27AA0" />
            <rect x="16" y="54" width="112" height="30" rx="6" fill="#FBD0E2" />
            <path d="M136 116 V72 Q136 58 150 58 H176 L200 86 V116 Z" fill="#EE79A2" />
            <path d="M154 66 H176 L193 86 H157 Q154 86 154 82 Z" fill="#CDEBFF" />
            <path d="M154 66 H176 L193 86 H157 Q154 86 154 82 Z" fill="#fff" opacity="0.25" />
            <rect x="8" y="110" width="200" height="9" rx="4.5" fill="#D9648E" />
            <circle cx="201" cy="104" r="4" fill="#FFE9A3" />
            <g class="wheel" style="transform-origin: 60px 124px">
              <circle cx="60" cy="124" r="17" fill="#3f3540" />
              <circle cx="60" cy="124" r="8" fill="#e7d8df" />
              <path d="M60 111v26M47 124h26M51 115l18 18M69 115l-18 18" stroke="#c3aeb8" stroke-width="2.4" stroke-linecap="round" />
            </g>
            <g class="wheel" style="transform-origin: 164px 124px">
              <circle cx="164" cy="124" r="17" fill="#3f3540" />
              <circle cx="164" cy="124" r="8" fill="#e7d8df" />
              <path d="M164 111v26M151 124h26M155 115l18 18M173 115l-18 18" stroke="#c3aeb8" stroke-width="2.4" stroke-linecap="round" />
            </g>
          </svg>
        </div>
      </div>
    </div>

    <div class="layer front" :style="{ backgroundImage: grassFront }" />
  </div>
</template>

<style scoped>
.game {
  position: fixed;
  inset: auto 0 0 0;
  height: 670px;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.layer {
  position: absolute;
  left: 0;
  width: 100%;
  height: 150px;
  background-repeat: repeat-x;
  background-size: 200px 150px;
  /* Sway pivots at the roots, so the blade tips wave and the base stays planted. */
  transform-origin: bottom center;
  will-change: background-position, transform;
}
.back {
  bottom: 46px;
  opacity: 0.75;
  animation:
    pan 40s linear infinite,
    sway 9s ease-in-out -3s infinite;
}
.mid {
  bottom: 22px;
  opacity: 0.92;
  animation:
    pan 24s linear infinite,
    sway 7.4s ease-in-out -1s infinite;
}
.front {
  bottom: 0;
  animation:
    pan 13s linear infinite,
    sway 6.1s ease-in-out infinite;
}
/* Distant mountains: hazy, low-opacity, and panning very slowly for deep parallax. */
.mtn-far {
  bottom: 84px;
  height: 300px;
  background-size: 1240px 300px;
  opacity: 0.5;
  animation: pan-far 300s linear infinite;
}
.mtn-near {
  bottom: 66px;
  height: 300px;
  background-size: 1000px 300px;
  opacity: 0.66;
  animation: pan-near 200s linear infinite;
}

.truck {
  position: absolute;
  right: 7%;
  bottom: 60px;
}
/* Two bounces on incommensurate periods → an irregular, never-quite-repeating ride. */
.truck-bob {
  animation: bounce-a 0.83s ease-in-out infinite;
  transform-origin: bottom center;
}
.truck-jit {
  animation: bounce-b 1.27s ease-in-out infinite;
  transform-origin: bottom center;
}
.wheel {
  animation: spin 3.8s linear infinite;
}

/* Grass pans rightward → the world moves right under the truck → it drives left. */
@keyframes pan {
  to {
    background-position-x: 200px;
  }
}
@keyframes pan-far {
  to {
    background-position-x: 1240px;
  }
}
@keyframes pan-near {
  to {
    background-position-x: 1000px;
  }
}
/* A very light, flowing wind: a soft gust downwind that eases and returns. */
@keyframes sway {
  0% {
    transform: skewX(-0.5deg);
  }
  35% {
    transform: skewX(0.7deg);
  }
  62% {
    transform: skewX(0.3deg);
  }
  100% {
    transform: skewX(-0.5deg);
  }
}
@keyframes bounce-a {
  0%,
  100% {
    transform: translateY(0) rotate(-0.35deg);
  }
  50% {
    transform: translateY(-2.2px) rotate(0.35deg);
  }
}
@keyframes bounce-b {
  0%,
  100% {
    transform: translateY(0.3px) rotate(0.3deg);
  }
  50% {
    transform: translateY(-1.2px) rotate(-0.3deg);
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mtn-far,
  .mtn-near,
  .back,
  .mid,
  .front,
  .truck-bob,
  .truck-jit,
  .wheel {
    animation: none;
  }
}
</style>
