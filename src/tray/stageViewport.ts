// 3D 骰子的舞台（#322）跟着可见视口：手机上软键盘弹出、双指缩放时，可见视口（visualViewport）比布局视口小、还可能有偏移，
// 只按 position: fixed; inset: 0 铺满布局视口，骰子会落在键盘后面（Codex 在 #329 上指出）。这里把可见视口的位置与大小写进
// 舞台的 --dice-stage-* 变量，样式表再减去刘海等安全区；不依赖 three.js，单测可以直接测。

type ViewportSource = Pick<Window, "innerWidth" | "innerHeight" | "addEventListener" | "removeEventListener"> & {
  visualViewport?: Pick<VisualViewport, "offsetLeft" | "offsetTop" | "width" | "height" | "addEventListener" | "removeEventListener"> | null;
};

/** 让 element 跟着可见视口；返回停止跟随的函数。没有 visualViewport 的浏览器用整个窗口，窗口缩放、旋转时也跟着变。 */
export function followVisualViewport(element: HTMLElement, source: ViewportSource = window): () => void {
  const viewport = source.visualViewport ?? null;
  const update = () => {
    element.style.setProperty("--dice-stage-left", `${viewport?.offsetLeft ?? 0}px`);
    element.style.setProperty("--dice-stage-top", `${viewport?.offsetTop ?? 0}px`);
    element.style.setProperty("--dice-stage-width", `${viewport?.width ?? source.innerWidth}px`);
    element.style.setProperty("--dice-stage-height", `${viewport?.height ?? source.innerHeight}px`);
  };
  update();
  // 窗口的 resize 两种情形都听：没有 visualViewport 时只有它；有的时候它与 visualViewport 的 resize 重复也无妨（Codex 在 #329 上指出）
  source.addEventListener("resize", update);
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  return () => {
    source.removeEventListener("resize", update);
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
  };
}
