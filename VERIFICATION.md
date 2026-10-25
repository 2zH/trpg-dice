# Extraction verification

Verified on 2026-10-26 (Asia/Shanghai).

- `pnpm install`: passes; only esbuild's build script is allowed in `pnpm-workspace.yaml`.
- `pnpm test`: 10 files, 109 tests passed, including migrated geometry, physics, percentile, viewport, replay clock, React panel, lazy loading and overlay tests, plus standalone tool input checks.
- `pnpm typecheck`: passes, including tests and demo.
- `pnpm build`: passes; emits ESM/declarations to `dist` and static demo to `site-dist`. Vite reports the existing lazy 3D chunk as larger than 500 kB (about 622 kB / 161 kB gzip); it remains separate from the entry chunk.
- Node.js ESM smoke: importing `dist/core.js` and executing `dice_roll({expression:'2d6+2'})` succeeds without a browser or React import.
- `git diff --cached --check`: passes. A targeted scan of source, demo, workflow and docs found no private keys or token patterns.

Real browser checks against the production build:

- Aside browser: manually submitted all seven supported die types, checked mesh-derived labels against the recorded results, then executed the JSON tool demo. A failed `{"sides":1}` tool call displayed its validation error and removed the previous stage.
- Headless Microsoft Edge, 1440×900 and 390×844: submitted `1d4+1d6+1d8+1d10+1d12+1d20+1d100`; waited for `data-dice-state=settled`; asserted mesh labels equal the result values, including d100 tens/units; all dice remained in view. Screenshots were visually inspected, with no horizontal page overflow.
- Both sizes: `1d3` retained its text result and displayed the unsupported-3D hint; JSON tool execution produced matching 3D labels; an invalid tool call cleared the stage; no uncaught page errors.
- Reduced motion: d100 settled with `data-dice-animated=false`.

Not verified: Safari, Firefox, physical touch devices, or a real external Agent SDK calling the tool. The demo uses the real local tool directly; no model or remote MCP service is involved.
