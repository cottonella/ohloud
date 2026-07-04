<p align="center">
  <img src="public/pwa-192x192.png" width="96" alt="the ohloud teddy bear" />
</p>

<h1 align="center"><em>ohloud!</em></h1>

<p align="center">
  <b>Send a secret from one device to another using only sound — no server, no internet, no pairing.</b>
</p>

<p align="center">
  <a href="https://github.com/cottonella/ohloud/releases"><img alt="latest version" src="https://img.shields.io/github/v/tag/cottonella/ohloud?style=flat&label=version&color=fce6d3&labelColor=f4eee2" /></a>
  <a href="https://github.com/cottonella/ohloud/pkgs/container/ohloud"><img alt="container image on GHCR" src="https://img.shields.io/badge/ghcr.io-cottonella%2Fohloud-d5e5f8?style=flat&logo=docker&logoColor=5b8fc9&labelColor=f4eee2" /></a>
</p>

Type a message or drop a small file, choose a password, and *ohloud* sings it
out of your speaker as a little melody. The device next to it listens with its
microphone, you type the same password, and the secret appears. That's the
whole trick: the sound in the room **is** the connection — no account, no
cloud, no cables, nothing to set up.

Everything runs locally in your browser or on your desktop; nothing ever
touches a network.

## Get *ohloud*

The same cuddly app, in whichever shape suits you:

- **🌐 Online** — just visit [ohloud.com](https://ohloud.com). Nothing to
  install; it runs entirely in your browser.
- **📱 Web App** — install it from the website and it lives on your home
  screen and works offline:
  - **iPhone & iPad (Safari):** open [ohloud.com](https://ohloud.com), tap
    **Share**, then **Add to Home Screen**, then **Add**.
  - **Chrome-based browsers** (Chrome, Edge, Brave…): open
    [ohloud.com](https://ohloud.com) and click the **install icon** at the
    right end of the address bar (or browser menu → **Install app…**), then
    **Install**. On Android: menu → **Add to Home screen**.
  - The **Download** button inside the app walks you through the same steps.
- **💻 Desktop app** — an Electron build for Windows, macOS and Linux, ready
  to download from the
  [releases page](https://github.com/cottonella/ohloud/releases).
- **🏡 Self-hosted** — *ohloud* is a static site with no backend. Run the
  prebuilt container (`docker run ghcr.io/cottonella/ohloud`) or drop the
  generated folder on any static host (see [Self-host](#self-host)).

## How to use

**Send** → type text or drop a file → pick 🐢 Robust, 🐇 Fast, or 🚀 Turbo →
**Share** → choose a **password** → press **Start** once the other device is
listening.

**Receive** → press **Listen** → when the melody arrives, enter the **same
password** → the text appears (or the file downloads).

Keep the two devices close in a reasonably quiet room, speaker facing the
microphone. Missed it? No worries — press **Listen** again on the receiver and
**Resend**.

## Is it safe?

The short version: your secret is locked with your password *before* it ever
becomes sound, and it only ever exists as sound — nothing is uploaded, stored,
or sent anywhere. Someone recording the room still needs your password, and
guessing passwords is made deliberately, painfully slow.

For the technically curious, every transmission is a self-contained encrypted
container — no key exchange, no server, no accounts:

- **Password → key:** Argon2id (32 MiB, t = 3, ≈ 2 s) stretches your password, so
  even a short one is expensive to brute-force.
- **Encryption:** XChaCha20-Poly1305 (AEAD) with a random 24-byte nonce; the
  cleartext header is bound as associated data.
- **Key commitment:** a committed key tag is verified (constant-time) *before*
  decryption, so a wrong password fails cleanly instead of yielding plausible
  garbage (closes the invisible-salamander / partitioning-oracle class).
- **No metadata leaves the device**, because nothing leaves the device.

The password is the entire security boundary — **use a strong, high-entropy one.**

## How fast is it?

Sound is an inherently low-bandwidth channel, so *ohloud* is at its best with
**short secrets** — passwords, keys, notes. Sending **files** is fully
supported as well, though transfer time grows with size, making it practical
mainly for small ones. Three modes are available, and the app shows the
estimated **transmission time** before you send:

| Mode | Effective rate | Best for |
|---|---|---|
| 🐢 **Robust** (MFSK) | ~50–70 B/s | noisy rooms, cross-device, any speaker |
| 🐇 **Fast** (OFDM / QPSK) | ~0.3–0.45 KB/s | most rooms without heavy echo |
| 🚀 **Turbo** (OFDM / QPSK, wide band) | ~0.4–0.8 KB/s | quiet rooms, devices side by side |

Rough end-to-end times (chime included), measured in the acoustic loopback
bench with incompressible payloads — the worst case — and decoded through
each mode's advertised room:

| Payload | 🐢 Robust | 🐇 Fast | 🚀 Turbo |
|---|---|---|---|
| a password (~30 B) | ~7 s | ~3 s | ~3 s |
| a short message (~1 KB) | ~21 s | ~5 s | ~4 s |
| a small file (~10 KB) | ~2.5 min | ~25 s | ~14 s |

**Compression is on your side.** Before anything becomes sound, *ohloud*
compresses it — automatically, and only when it actually helps. Text, JSON,
logs, code, and other compressible content therefore often travels several
times faster than the table suggests: a 24 KB log file can shrink to a couple
of kilobytes and arrive in about five seconds. The in-app estimate assumes no
compression on purpose, so treat it as a promise — real transmissions are
often quicker, never slower.

Rates are all-inclusive — encryption, error correction, framing. Files carry
~25% **RaptorQ** repair blocks, so a lost chunk heals itself. 1 MB is
impractical over sound (tens of minutes).

## Will it work on my devices?

- **Browsers:**
  <img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/chrome/chrome_24x24.png" width="16" height="16" alt="Chrome" /> Chrome ·
  <img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/edge/edge_24x24.png" width="16" height="16" alt="Edge" /> Edge ·
  <img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/safari/safari_24x24.png" width="16" height="16" alt="Safari" /> Safari ·
  <img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/firefox/firefox_24x24.png" width="16" height="16" alt="Firefox" /> Firefox
  — the microphone needs a **secure page** (https or `localhost`).
- **Desktop:**
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/windows8/windows8-original.svg" width="15" height="15" alt="Windows" /> Windows ·
  <img src="https://upload.wikimedia.org/wikipedia/commons/1/1b/Apple_logo_grey.svg" width="13" height="15" alt="macOS" /> macOS ·
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/linux/linux-original.svg" width="16" height="16" alt="Linux" /> Linux
  — the Electron app uses the same Web Audio path; macOS asks once for
  microphone consent.
- **Mobile:**
  <img src="https://upload.wikimedia.org/wikipedia/commons/1/1b/Apple_logo_grey.svg" width="13" height="15" alt="iOS" /> iOS ·
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/android/android-original.svg" width="16" height="16" alt="Android" /> Android
  — right in the browser, or installed as the Web App.
- **Cross-device:** Robust interoperates across any sample rates; Fast is best at
  a shared 48 kHz (it resamples otherwise).

## How it works (the short tour)

Text/file → compress → **encrypt** (container) → **Reed–Solomon + RaptorQ** error
correction → modulate to **PCM tones**: a sync chirp, an RS-protected header, then
the payload as **MFSK** (Robust) or **OFDM** (Fast). The receiver reverses it —
find the chirp, read the header, demodulate, correct errors, verify a tail hash,
decrypt.

The engine (`app/core/`) is framework-agnostic TypeScript, pure-JS (no WASM), and
unit-tested; the Vue UI and Electron shell are thin layers over it.

## Develop

Run as a **website** (hot reload at <http://localhost:3000>):

```bash
npm install
npm run dev
```

Run as a **desktop app** (Nuxt dev server + Electron, live-reload including the
main process):

```bash
npm run electron:dev
```

`.vscode/launch.json` has debug configs for the main process, the renderer, and
the website (Chrome) — open Run & Debug, pick **Electron: Main + Renderer**, F5.

## Build & package

```bash
npm run generate   # static website only -> .output/public (deploy to any static host)
npm run build      # static site + electron bundle (prereq for packaging)
npm run pack       # + package into a runnable folder (dist-electron/*-unpacked/)
npm run dist       # + package a distributable .zip / AppImage (no installer)
```

Targets are `zip` (Windows/macOS) and `AppImage` (Linux) in `package.json` →
`build`; switch to `nsis`/`dmg` for an installer.

## Self-host

*ohloud* has **no backend** — it's a static bundle, so hosting it is just serving
a folder. Nothing phones home; once loaded it runs entirely on-device (and fully
offline after it's installed).

**With Docker (published image — no clone needed):**

```bash
docker run --rm -p 8080:80 ghcr.io/cottonella/ohloud
# → http://localhost:8080
```

The image is multi-arch (`amd64` + `arm64`, so it runs on a Pi) and rebuilt on
every release.

Or **build it yourself** from a clone:

```bash
docker build -t ohloud .
docker run --rm -p 8080:80 ohloud
```

**Without Docker** — put the generated files on any static host:

```bash
npm ci
npm run generate   # → .output/public
# then serve .output/public with nginx, Caddy, `npx serve`, a Pi, a USB stick…
```

> **One requirement:** the microphone needs a **secure context**, so serve it over
> **HTTPS** (or `localhost`). Plain `http://` on a LAN loads the page, but the
> Receive tab's mic won't start. Put it behind any TLS-terminating reverse proxy
> (Caddy does this automatically) and you're set.

The bundled [`docker/nginx.conf`](docker/nginx.conf) ships the SPA fallback
(client-side routes → `index.html`), long-caches the content-hashed assets, keeps
the service worker fresh, and adds a few hardening headers (`X-Frame-Options`,
`X-Content-Type-Options`).

## Test & lint

```bash
npm test           # vitest — the app/core engine + property/loopback tests
npm run typecheck  # vue-tsc type-checks the whole app
npm run bench      # pure-JS acoustic channel calibration (no hardware)
npm run lint       # eslint . (add --fix)
```

## License

*ohloud* is **dual-licensed** — pick whichever fits your use:

- **Open source: [GNU AGPL-3.0-only](LICENSE).** Free to use, study, modify, and
  self-host. The AGPL's one catch: if you distribute *ohloud* or run a modified
  version for others (including as a network service), you must release your
  **complete corresponding source** under the AGPL too.
- **Commercial license.** To use *ohloud* in a closed-source product or service —
  or otherwise without the AGPL's copyleft obligations — a separate paid license
  is available. Reach out via [github.com/cottonella](https://github.com/cottonella).

Copyright © 2026 cottonella. Contributions are accepted under the terms in
[CONTRIBUTING.md](CONTRIBUTING.md), which keep this dual license possible.

---

<p align="center">
  <img src=".github/assets/pill-made-with-love.svg" height="36" alt="Made with love" />&nbsp;
  <a href="https://ko-fi.com/cottonella"><img src=".github/assets/pill-buy-me-a-coffee.svg" height="36" alt="Buy me a coffee" /></a>
</p>
