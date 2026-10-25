import { describe, expect, it } from "vitest";
import { axisAngle, diceOverlapDepth, getDiceShape, resultFaceAlignment, resultFaceIndex, rotate, type Quat, type SupportedDiceSides } from "./diceShapes.js";
import { diceMaxFrames, diceRadius, diceRestHeight, diceTableAreaPerDie, fitDiceTable, readOrientation, readPosition, settleLeftovers, simulateDice, simulateDiceInSlices, simulationSteps } from "./diceSimulation.js";

const flatEnough = Math.cos((14 * Math.PI) / 180);
// 接触时物理允许的一点穿透（世界单位，骰子直径 1.1）：实测 20 颗混合与 200 颗 d10 至多约 0.006
const contactSlop = 0.01;
const identity: Quat = [0, 0, 0, 1];
// 舞台铺满视口（#322）：桌面按 0.02 世界单位/像素换算
const viewport = (width: number, height: number) => ({ halfWidth: Math.max(2.6, (width * 0.02) / 2), halfDepth: Math.max(2.4, (height * 0.02) / 2) });

// #315、#322：落桌在后台模拟完、录下每一帧；给定种子可以复现，2 秒内停住、放平、平放在桌面上、不出墙、不互相穿插
describe("dice simulation (#315)", () => {
  it("replays the same throw for the same seed, and a different one for another seed", () => {
    const bounds = viewport(1440, 900);
    const first = simulateDice([6, 6, 20], 4242, bounds);
    const again = simulateDice([6, 6, 20], 4242, bounds);
    expect(again.seed).toBe(first.seed);
    expect(Array.from(again.frames)).toEqual(Array.from(first.frames));
    const other = simulateDice([6, 6, 20], 9001, bounds);
    expect(Array.from(other.frames)).not.toEqual(Array.from(first.frames));
  });

  const mixed: SupportedDiceSides[] = [4, 6, 8, 10, 12, 20, 4, 6, 8, 10, 12, 20, 4, 6, 8, 10, 12, 20, 6, 20];
  const sets: Array<{ name: string; sides: SupportedDiceSides[]; throws: number }> = [
    { name: "1d4", sides: [4], throws: 20 },
    { name: "1d4+3d4", sides: [4, 4, 4, 4], throws: 20 },
    { name: "2d6+1d20", sides: [6, 6, 20], throws: 20 },
    { name: "8d6", sides: Array<SupportedDiceSides>(8).fill(6), throws: 20 },
    // d100 是两颗 d10
    { name: "1d100+2d6", sides: [10, 10, 6, 6], throws: 20 },
    { name: "20d6", sides: Array<SupportedDiceSides>(20).fill(6), throws: 20 },
    { name: "20 mixed dice", sides: mixed, throws: 20 },
    // 颗数不设上限：表达式至多 100 颗，100d100 是 200 颗 d10
    { name: "100d20", sides: Array<SupportedDiceSides>(100).fill(20), throws: 2 },
    { name: "100d100", sides: Array<SupportedDiceSides>(200).fill(10), throws: 2 }
  ];
  const screens = [
    { name: "1440×900 desktop", ...viewport(1440, 900) },
    { name: "390×844 phone", ...viewport(390, 844) }
  ];

  for (const screen of screens) {
    for (const set of sets) {
      it(`settles ${set.name} flat on the table of a ${screen.name}, apart from each other within 2 seconds, over ${set.throws} throws`, () => {
        const table = fitDiceTable(screen, set.sides.length);
        const shapes = set.sides.map((sides) => getDiceShape(sides));
        for (let throwIndex = 0; throwIndex < set.throws; throwIndex += 1) {
          const simulation = simulateDice(set.sides, 1_000 * (throwIndex + 1), table);
          const last = simulation.frameCount - 1;
          const label = `${set.name} seed ${simulation.seed}`;
          expect(simulation.frameCount, label).toBeLessThanOrEqual(diceMaxFrames);
          expect(simulation.settledFrame, label).toBe(last);
          const positions = set.sides.map((_, index) => readPosition(simulation, last, index));
          // 最后一帧就停住：没有补间的骰子在最后一帧只动一点点（物理到了上限才停的也一样），停下时看不出顿挫
          if (last > 0) {
            set.sides.forEach((_, index) => {
              if (simulation.tipped.includes(index)) return;
              const [px, py, pz] = readPosition(simulation, last - 1, index);
              const [x, y, z] = positions[index]!;
              expect(Math.hypot(x - px, y - py, z - pz), label).toBeLessThan(0.01);
              const [ax, ay, az, aw] = readOrientation(simulation, last - 1, index);
              const [bx, by, bz, bw] = readOrientation(simulation, last, index);
              expect(2 * Math.acos(Math.min(1, Math.abs(ax * bx + ay * by + az * bz + aw * bw))), label).toBeLessThan((1 * Math.PI) / 180);
            });
          }
          shapes.forEach((shape, index) => {
            const orientation = readOrientation(simulation, last, index);
            expect(resultFaceAlignment(shape, orientation), label).toBeGreaterThanOrEqual(flatEnough);
            expect(simulation.topFaces[index], label).toBe(resultFaceIndex(shape, orientation));
            const [x, y, z] = positions[index]!;
            expect(Math.abs(x), label).toBeLessThan(table.halfWidth);
            expect(Math.abs(z), label).toBeLessThan(table.halfDepth);
            // 平放在桌面上：中心的高度就是平放时的高度，不是垫在别的骰子上
            expect(y, label).toBeLessThan(diceRestHeight(shape) + 0.05);
          });
          // 不互相穿插：按两颗多面体本身判断（分离轴定理），只允许接触时的一点穿透（Codex 在 #329 上指出只比内切球不够）
          const placed = shapes.map((shape, index) => ({ shape, radius: diceRadius, position: positions[index]!, orientation: readOrientation(simulation, last, index) }));
          for (let a = 0; a < placed.length; a += 1) {
            for (let b = a + 1; b < placed.length; b += 1) {
              expect(diceOverlapDepth(placed[a]!, placed[b]!), `${label} dice ${a} and ${b}`).toBeLessThanOrEqual(contactSlop);
            }
          }
        }
      });
    }
  }

  // Codex 在 #329 上指出：200 颗骰子一口气模拟会长时间占着主线程。分段模拟的结果与一口气算的相同，段与段之间让出主线程
  it("simulates in short slices that let other tasks run in between, with the same result as all at once (#329)", async () => {
    const sides = Array<SupportedDiceSides>(100).fill(20);
    const table = fitDiceTable(viewport(390, 844), sides.length);
    // 另一串任务：每次跑完再排下一次，数一数模拟期间它跑了几次
    const ticker = () => {
      const channel = new MessageChannel();
      const state = { ticks: 0, running: true };
      channel.port1.onmessage = () => {
        state.ticks += 1;
        if (state.running) channel.port2.postMessage(null);
        else channel.port1.close();
      };
      channel.port2.postMessage(null);
      return state;
    };
    const during = ticker();
    const sliced = await simulateDiceInSlices(sides, 7, table, { sliceMs: 2 });
    during.running = false;
    expect(sliced).not.toBeNull();
    expect(Array.from(sliced!.frames)).toEqual(Array.from(simulateDice(sides, 7, table).frames));
    expect(during.ticks).toBeGreaterThan(5);
    // 对照：一口气算的那次期间别的任务一次也排不上
    const blocked = ticker();
    simulateDice(sides, 7, table);
    const ticksWhileBlocked = blocked.ticks;
    blocked.running = false;
    expect(ticksWhileBlocked).toBe(0);
  });

  // Codex 在 #329 上第二次指出：建 200 个刚体、找落点、最后的补间挪动若各自一口气做完，也会是几十毫秒的长任务。
  // 每颗骰子的落点与刚体各是一步：200 颗时步数多于 400（只按物理帧切时至多约 110 + 挪动的颗数）
  it("splits setting up the throw into one step per die, not only one step per physics frame (#329)", () => {
    const sides = Array<SupportedDiceSides>(200).fill(6);
    const steps = simulationSteps(sides, 5, fitDiceTable(viewport(1440, 900), sides.length));
    let count = 0;
    let next = steps.next();
    while (!next.done) {
      count += 1;
      next = steps.next();
    }
    expect(next.value.frameCount).toBeLessThanOrEqual(diceMaxFrames);
    expect(count).toBeGreaterThan(2 * sides.length);
  });

  it("stops a sliced simulation when it is cancelled, for example by the next roll (#329)", async () => {
    let checks = 0;
    const result = await simulateDiceInSlices(Array<SupportedDiceSides>(100).fill(6), 3, fitDiceTable(viewport(1440, 900), 100), {
      sliceMs: 1,
      isCancelled: () => (checks += 1) > 2
    });
    expect(result).toBeNull();
    expect(checks).toBe(3);
  });

  it("keeps the viewport's table when it has room, and enlarges it in the same proportions when it does not (#322)", () => {
    const desktop = viewport(1440, 900);
    expect(fitDiceTable(desktop, 20)).toBe(desktop);
    const phone = viewport(390, 844);
    const crowded = fitDiceTable(phone, 20);
    expect(crowded.halfWidth).toBeGreaterThan(phone.halfWidth);
    expect(crowded.halfWidth / crowded.halfDepth).toBeCloseTo(phone.halfWidth / phone.halfDepth, 9);
    // 放大到刚好放得下：墙边各留 1.5 个外接半径后，每颗分到 diceTableAreaPerDie
    const usable = 4 * (crowded.halfWidth - 0.825) * (crowded.halfDepth - 0.825);
    expect(usable).toBeCloseTo(20 * diceTableAreaPerDie, 6);
    expect(4 * (phone.halfWidth - 0.825) * (phone.halfDepth - 0.825)).toBeLessThan(20 * diceTableAreaPerDie);
  });

  it("tips a leaning die flat onto the table and moves it clear of its neighbour, and leaves resting dice alone (#322)", () => {
    const d6 = getDiceShape(6);
    const rest = diceRestHeight(d6);
    const bounds = viewport(1440, 900);
    // 第 0 颗平放在原点；第 1 颗斜靠在它身上（绕 x 转 35°、中心抬高）；第 2 颗叠在第 0 颗正上方
    const leaning: Quat = axisAngle([1, 0, 0], (35 * Math.PI) / 180);
    const stopped = [
      { position: [0, rest, 0] as [number, number, number], orientation: identity },
      { position: [0.5, rest + 0.2, 0] as [number, number, number], orientation: leaning },
      { position: [0, rest * 3, 0] as [number, number, number], orientation: identity }
    ];
    const { poses, tipped } = settleLeftovers([d6, d6, d6], stopped, bounds);
    expect(tipped).toEqual([1, 2]);
    expect(poses[0]).toEqual(stopped[0]);
    for (const index of tipped) {
      const pose = poses[index]!;
      expect(resultFaceAlignment(d6, pose.orientation)).toBeCloseTo(1, 9);
      expect(pose.position[1]).toBeCloseTo(rest, 9);
      // 与别的骰子按水平投影的外接圆分开：正方体平放时外接圆半径是半对角线
      for (let other = 0; other < poses.length; other += 1) {
        if (other === index) continue;
        const distance = Math.hypot(pose.position[0] - poses[other]!.position[0], pose.position[2] - poses[other]!.position[2]);
        expect(distance).toBeGreaterThanOrEqual(footprint(d6, pose.orientation) + footprint(d6, poses[other]!.orientation) - 1e-9);
      }
    }
    // 只是倒平、挪开，不会挪很远
    expect(Math.hypot(poses[1]!.position[0] - 0.5, poses[1]!.position[2])).toBeLessThan(1);
  });

  it("keeps a moved die inside the walls (#322)", () => {
    const d6 = getDiceShape(6);
    const rest = diceRestHeight(d6);
    const bounds = { halfWidth: 2.6, halfDepth: 2.4 };
    const stopped = [
      { position: [2.6 - 0.45, rest, 0] as [number, number, number], orientation: identity },
      { position: [2.6 - 0.45, rest * 3, 0] as [number, number, number], orientation: identity }
    ];
    const { poses } = settleLeftovers([d6, d6], stopped, bounds);
    expect(Math.abs(poses[1]!.position[0])).toBeLessThanOrEqual(bounds.halfWidth - footprint(d6, poses[1]!.orientation) + 1e-9);
    expect(Math.hypot(poses[1]!.position[0] - poses[0]!.position[0], poses[1]!.position[2] - poses[0]!.position[2])).toBeGreaterThanOrEqual(2 * footprint(d6, identity) - 1e-9);
  });
});

function footprint(shape: ReturnType<typeof getDiceShape>, orientation: Quat): number {
  return Math.max(...shape.vertices.map((vertex) => {
    const [x, , z] = rotate(orientation, vertex);
    return Math.hypot(x, z) * 0.55;
  }));
}
