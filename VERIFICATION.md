# Extraction verification

Verified on 2026-10-26 (Asia/Shanghai).

- `pnpm install`: passes; only esbuild's build script is allowed in `pnpm-workspace.yaml`.
- `pnpm test`: 11 files, 112 tests passed, including migrated geometry, physics, percentile, viewport, replay clock, React panel, lazy loading and overlay tests, standalone tool input checks, and gesture physics tests.
- `pnpm typecheck`: passes, including tests and demo.
- `pnpm build`: passes; emits ESM/declarations to `dist` and static demo to `site-dist`. Vite reports the lazy dice desk chunk as larger than 500 kB (about 629 kB / 164 kB gzip); it remains separate from the entry chunk.
- Node.js ESM smoke: importing `dist/core.js` and executing `dice_roll({expression:'2d6+2'})` succeeds without a browser or React import.
- `git diff --cached --check`: passes. A targeted scan of source, demo, workflow and docs found no private keys or token patterns.

Real browser checks against the production build:

- Headless Microsoft Edge, 1440×900 and 390×844: the desk has eight physical pieces and no form, input or textarea. Real pointer gestures lifted and threw d6. The final face matched the reported `dice_roll` result, and the die remained at its new position. Idle, lifted and settled screenshots were visually inspected.
- Both sizes: double-clicking blank desk restored every die's previous face and position; keyboard Space threw the focused die; Z cancelled the throw and restored the full desk. No uncaught page errors.
- Mobile touch emulation, 390×844: CDP-dispatched touch start/move/end threw d6; a real double tap on empty desk restored the full previous state.
- Reduced motion: keyboard d100 immediately displayed its final result without playback.
- Physics tests explicitly check opposite gesture velocities produce different trajectories, a thrown die pushes an existing resting die, returned tool values appear on the final mesh faces, and d100 remains two separate physical dice. Existing source tests still cover the reusable panel/overlay and generic unsupported-3D fallback.

Not verified: Safari, Firefox, physical touch devices, or a real external Agent SDK calling the tool. Touch was browser emulation, not a physical phone. The demo uses the real local tool directly; no model or remote MCP service is involved.
