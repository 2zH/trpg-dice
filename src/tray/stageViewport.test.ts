import { describe, expect, it } from "vitest";
import { followVisualViewport } from "./stageViewport.js";

// #329 的 Codex 意见：手机上软键盘弹出时，可见视口变矮、可能向下偏移，舞台要跟着它，骰子才不会落在键盘后面
describe("dice stage follows the visual viewport (#329)", () => {
  const fakeViewport = () => {
    const target = new EventTarget();
    return Object.assign(target, { offsetLeft: 0, offsetTop: 0, width: 390, height: 844 });
  };
  // 只够这里用的窗口：一个事件目标，加上宽高
  const fakeWindow = (innerWidth: number, innerHeight: number, visualViewport: ReturnType<typeof fakeViewport> | null) =>
    Object.assign(new EventTarget(), { innerWidth, innerHeight, visualViewport });
  const read = (element: HTMLElement) => ["left", "top", "width", "height"].map((name) => element.style.getPropertyValue(`--dice-stage-${name}`));

  it("takes the visual viewport's box, and follows it when the keyboard opens and the page is scrolled", () => {
    const element = document.createElement("div");
    const viewport = fakeViewport();
    const stop = followVisualViewport(element, fakeWindow(390, 844, viewport));
    expect(read(element)).toEqual(["0px", "0px", "390px", "844px"]);

    // 软键盘弹出：可见视口只剩上面 520px
    viewport.height = 520;
    viewport.dispatchEvent(new Event("resize"));
    expect(read(element)).toEqual(["0px", "0px", "390px", "520px"]);
    // iOS 上键盘弹出时页面可能被推上去，可见视口相对布局视口向下偏移
    viewport.offsetTop = 180;
    viewport.dispatchEvent(new Event("scroll"));
    expect(read(element)).toEqual(["0px", "180px", "390px", "520px"]);

    // 停止跟随之后不再改
    stop();
    viewport.height = 844;
    viewport.dispatchEvent(new Event("resize"));
    expect(read(element)).toEqual(["0px", "180px", "390px", "520px"]);
  });

  // Codex 在 #329 上指出：没有 visualViewport 时只在开始时读一次窗口大小，之后缩放、旋转窗口，舞台还是原来的大小
  it("uses the window when the browser has no visual viewport, and follows the window when it is resized", () => {
    const element = document.createElement("div");
    const source = fakeWindow(1280, 800, null);
    const stop = followVisualViewport(element, source);
    expect(read(element)).toEqual(["0px", "0px", "1280px", "800px"]);
    // 旋转成竖屏
    source.innerWidth = 800;
    source.innerHeight = 1280;
    source.dispatchEvent(new Event("resize"));
    expect(read(element)).toEqual(["0px", "0px", "800px", "1280px"]);
    stop();
    source.innerWidth = 1024;
    source.dispatchEvent(new Event("resize"));
    expect(read(element)).toEqual(["0px", "0px", "800px", "1280px"]);
  });
});
