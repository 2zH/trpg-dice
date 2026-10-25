# Source provenance

Extracted from `https://github.com/2zH/trpg-editor` at commit
`e787106c8145b246d753137360ada13cc3b4b571`, at the repository owner's request.

| Original | Standalone |
| --- | --- |
| `src/features/dice/rollDice.ts` | `src/rollDice.ts` |
| `src/features/dice/DiceTraySlot.tsx` | `src/DiceTraySlot.tsx` |
| `src/features/dice/tray/` | `src/tray/` |
| `src/features/ui/lazyModule.ts` | `src/lazyModule.ts` |
| `src/features/ui/workbenchTools/DicePanel.tsx` | `src/DicePanel.tsx` |
| `src/features/shaggai/localToolsDiceInput.ts` | `src/parseDiceRollInput.ts` |
| `parseRecord`, `readOptionalPositiveInteger` in `localToolsInputValues.ts` | `src/inputValues.ts` |
| `diceRollToolMetadata` in `toolMetadata.ts` | `src/toolMetadata.ts` |
| dice registration in `localToolsRegistry.ts` | framework-neutral `src/diceRollTool.ts` |
| `ShaggaiDiceRollOverlay.tsx` | `src/DiceRollOverlay.tsx`, structural event type in `src/toolEvents.ts` |
| dice styles in `src/styles/workbench-launcher.css` | `src/styles.css` |

Related tests were copied with import-path changes. The overlay's controller-runtime integration test was excluded because that runtime is outside the extraction; its event-source tests are retained. The two original pure rolling tests were isolated from the editor's broader local-tools test suite. Additional tests cover the standalone tool boundary.

Changes: relative ESM imports; removed editor aliases and Shaggai runtime types; added standalone exports, JSON Schema, demo, build configuration and Pages workflow. Geometry and physical simulation are unchanged. CSS variables have standalone defaults.

The source repository has no root license file at the extraction baseline. No new license grant is asserted here. Copyright remains with the original rights holders. Third-party dependencies retain their own licenses, including three.js (MIT), cannon-es (MIT), React (MIT), and React DOM (MIT).
