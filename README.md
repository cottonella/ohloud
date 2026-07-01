# ohloud

**Send a secret from one device to another using only sound — no server, no
internet, no pairing.** Type a message or drop a file, choose a password, and
ohloud sings it as audible tones out your speaker. The other device listens with
its microphone and, with the same password, decrypts it back. Everything runs
locally in a browser or a desktop app; nothing ever touches a network.

The same code runs as a **static website** and as an **Electron desktop app**.

## How to use

**Send** → type text or drop a file → pick 🐢 Robust or 🐇 Fast → **Share** →
choose a **password** → press **Start** once the other device is listening.

**Receive** → press **Listen** → when the sound arrives, enter the **same
password** → the text appears (or the file downloads).

Keep the two devices close in a reasonably quiet room, speaker facing the
microphone. Missed it? Press **Listen** again on the receiver and **Resend**.

## Security model

Every transmission is a self-contained encrypted container — no key exchange, no
server, no accounts:

- **Password → key:** Argon2id (32 MiB, t = 3, ≈ 2 s) stretches your password, so
  even a short one is expensive to brute-force.
- **Encryption:** XChaCha20-Poly1305 (AEAD) with a random 24-byte nonce; the
  cleartext header is bound as associated data.
- **Key commitment:** a committed key tag is verified (constant-time) *before*
  decryption, so a wrong password fails cleanly instead of yielding plausible
  garbage (closes the invisible-salamander / partitioning-oracle class).
- **No metadata leaves the device**, because nothing leaves the device.

The password is the entire security boundary — **use a strong, high-entropy one.**
Full threat model and residual risks (replay, jamming, passphrase entropy) are in
[SECURITY.md](SECURITY.md); the exact wire format is in [FORMAT.md](FORMAT.md).

## Speed & size

Sound is a slow channel, so ohloud is for **secrets, not file transfers**. Two
tiers; the app shows the estimated **transmission time** before you send:

| Mode | Rate | Best for |
|---|---|---|
| 🐢 **Robust** (MFSK) | ~42 B/s | noisy rooms, cross-device, any speaker |
| 🐇 **Fast** (OFDM / QPSK) | ~0.7–1 KB/s | a quiet room with the devices close |

Rough Robust transmission times:

| Payload | ≈ time |
|---|---|
| a password (~30 B) | a few seconds |
| a short message (~1 KB) | ~30 s |
| a small file (~10 KB) | ~4 min |

Files carry ~25% **RaptorQ** repair blocks, so a lost chunk heals. 1 MB is
impractical over sound (tens of minutes).

## Supported browsers / OS

- **Browsers:** any with Web Audio + `getUserMedia` — Chrome / Edge, Safari,
  Firefox. The microphone needs a **secure context** (https or `localhost`).
- **Desktop:** the Electron app (Windows / macOS / Linux) uses the same Web Audio
  path; macOS prompts once for microphone consent.
- **Cross-device:** Robust interoperates across any sample rates; Fast is best at
  a shared 48 kHz (it resamples otherwise).

## How it works (short version)

Text/file → compress → **encrypt** (container) → **Reed–Solomon + RaptorQ** error
correction → modulate to **PCM tones**: a sync chirp, an RS-protected header, then
the payload as **MFSK** (Robust) or **OFDM** (Fast). The receiver reverses it —
find the chirp, read the header, demodulate, correct errors, verify a tail hash,
decrypt. Protocol details in [FORMAT.md](FORMAT.md); design rationale in
[RESEARCH.md](RESEARCH.md).

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

## Test & lint

```bash
npm test           # vitest — the app/core engine + property/loopback tests
npm run bench      # pure-JS acoustic channel calibration (no hardware)
npm run lint       # eslint . (add --fix)
```

## Project structure

```
app/
  core/         # the engine: crypto · container · fec · dsp · protocol · audio
  components/   # Vue UI — teddy mascot, send/receive panels, icons, modal
  pages/        # single-screen app
electron/       # desktop shell (app:// protocol, mic permission)
bench/          # pure-JS acoustic channel model + calibration bench
FORMAT.md · RESEARCH.md · SECURITY.md · ICON-THEME.md · TASKS.md
```

## License

ohloud is **dual-licensed** — pick whichever fits your use:

- **Open source: [GNU AGPL-3.0-only](LICENSE).** Free to use, study, modify, and
  self-host. The AGPL's one catch: if you distribute ohloud or run a modified
  version for others (including as a network service), you must release your
  **complete corresponding source** under the AGPL too.
- **Commercial license.** To use ohloud in a closed-source product or service — or
  otherwise without the AGPL's copyleft obligations — a separate paid license is
  available. Reach out via [github.com/cottonella](https://github.com/cottonella).

Copyright © 2026 cottonella. Contributions are accepted under the terms in
[CONTRIBUTING.md](CONTRIBUTING.md), which keep this dual license possible.
