# TRPG Dice

从 [2zH/trpg-editor](https://github.com/2zH/trpg-editor) 提取的独立 3D 骰子与 `dice_roll` 工具。无需编辑器、账号、服务器或模型 API。

**[在线演示](https://2zh.github.io/trpg-dice/)** · [源码](https://github.com/2zH/trpg-dice)

## 本地运行

需要 Node.js 22+ 和 pnpm 11.25.0。

```sh
git clone https://github.com/2zH/trpg-dice.git
cd trpg-dice
pnpm install
pnpm dev
```

Demo 有「手动掷骰」与「工具调用」两个模式。工具模式直接运行真实的本地 `dice_roll`，显示返回 JSON，并通过工具事件驱动 3D；它没有调用模型，也不是远程 MCP 服务。

```sh
pnpm test       # 掷骰、输入边界、几何、物理、组件与事件适配
pnpm typecheck
pnpm build     # dist/: ESM + 类型声明；site-dist/: Pages 静态网站
pnpm preview
```

## 调用掷骰与工具

构建后可从独立 ESM 入口导入；`dist/core.js` 不导入 React、three.js 或 cannon-es，也可在支持 Web Crypto 的 Node.js 中使用。

```js
import { rollDice, dice_roll, diceRollTool } from './dist/core.js';

const result = rollDice({ expression: '2d6+1d4+2' });
const other = dice_roll({ sides: 20, count: 2 });
const fromJson = diceRollTool.execute('{"expression":"1d100"}');
console.log(result.groups, result.total, other, fromJson);
```

`dice_roll` 会在执行前校验输入，可接受对象或 JSON 字符串。`diceRollTool` 导出原工具元数据、`inputSchema.parse`、框架无关的 JSON Schema `parameters` 和 `execute(input)`。接入 Agent SDK 时，用 SDK 的工具注册方式包装这些字段；这里的 `execute` 直接接收参数对象，而非原 Shaggai 的 `{ input, env }` 上下文。

- `expression` 与 `sides` / `count` 二选一。
- 表达式支持 `NdM` 骰与非负整数加值，用 `+` 连接，例如 `2d6+1d4+2`；不支持减号、优势/劣势或保留最高骰语法。
- 每次最多 100 颗骰，面数 2–1000；表达式最多 200 字符、100 项，每项加值最多 1,000,000。
- `count` 默认 1；结果包含逐颗点数、分组、加值、总和与展开的 `displayLabel`。
- 使用 Web Crypto 与拒绝采样生成公平点数；3D 只负责回放结果。动画 `seed` 只决定落法，不决定点数。

## 在 React 中显示 3D

可复制 `src/` 使用，或将构建后的本目录作为本地包依赖。包入口 `@2zh/trpg-dice` 是纯掷骰工具，`@2zh/trpg-dice/react` 是 React 组件。

```tsx
import { useState } from 'react';
import { rollDice } from '@2zh/trpg-dice';
import { DiceTraySlot, readDiceTrayDice, type DiceTrayRoll } from '@2zh/trpg-dice/react';
import '@2zh/trpg-dice/styles.css';

export function Example() {
  const [roll, setRoll] = useState<DiceTrayRoll | null>(null);
  return <>
    <button onClick={() => {
      const result = rollDice({ expression: '2d6' });
      const dice = readDiceTrayDice(result);
      setRoll(current => dice ? {
        id: (current?.id ?? 0) + 1,
        seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
        dice
      } : null);
    }}>掷骰</button>
    {roll && <DiceTraySlot roll={roll} />}
  </>;
}
```

也可直接使用带输入框与结果列表的 `<DicePanel />`。three.js 与 cannon-es 按需加载。样式表包含舞台定位与面板样式，宿主可覆盖 CSS 变量调整颜色。

`DiceRollOverlay` 接受 `{ subscribeToolEvents(listener) }`，事件结构见 `src/toolEvents.ts` 和 `demo/main.tsx`。同一次 `toolCallId` 必须先收到 `running`，再收到 `done`，后者的结果位于 `event.output.output`。历史完成事件不重播；失败、取消或不支持的骰面不会留下旧点数。该接口不依赖 Shaggai。

3D 支持 d4、d6、d8、d10、d12、d20 与 d100（十位和个位两颗 d10，100 显示为 00 + 0）。最多 100 颗逻辑骰，可能显示为 200 颗 d10；多骰时自动缩小。舞台铺满视口且不拦截鼠标；窄屏跟随可见视口。启用减少动态效果时直接显示落定状态。WebGL 不可用时保留文字结果。

## GitHub Pages

仓库 Settings → Pages 的 Source 使用 **GitHub Actions**。推送 `main` 后，`.github/workflows/pages.yml` 自动执行测试、类型检查和构建，再将 `site-dist/` 部署到 Pages。PR 只验证，不部署。Vite 使用相对资源路径，适配 `/trpg-dice/` 子路径。

## 来源

提取基线：`trpg-editor@e787106c8145b246d753137360ada13cc3b4b571`。保留原始物理、网格、刻字、随机数与回放实现，并迁移相关测试；移除编辑器和 Agent 框架依赖。路径映射与权利说明见 [NOTICE.md](NOTICE.md)。
