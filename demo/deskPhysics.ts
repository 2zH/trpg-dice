import { Body, ContactMaterial, ConvexPolyhedron, Material, Plane, Vec3, World } from "cannon-es";
import { getDiceShape, multiply, relabelRotation, resultFaceIndex, type Quat, type SupportedDiceSides, type DiceLabelKind } from "../src/tray/diceShapes.js";
import { settleLeftovers } from "../src/tray/diceSimulationSettle.js";
import type { DiceTrayBounds } from "../src/tray/diceSimulationTable.js";

export const radius = 0.55;
export const unitsPerPixel = 0.021;
export const frameSeconds = 1 / 60;
export type Position = [number, number, number];
export interface DeskDie {
  sides: SupportedDiceSides;
  group: number;
  kind?: DiceLabelKind;
  position: Position;
  orientation: Quat;
  labels: Quat;
  velocity: Position;
  spin: Position;
}
export interface DeskThrow {
  group: number;
  position: Position;
  velocity: Position;
  spin: Position;
  values: readonly number[];
}
export interface DeskSimulation {
  frames: Float32Array;
  frameCount: number;
  dice: DeskDie[];
}

export function copyDice(dice: readonly DeskDie[]): DeskDie[] {
  return dice.map(die => ({ ...die, position: [...die.position], orientation: [...die.orientation], labels: [...die.labels], velocity: [...die.velocity], spin: [...die.spin] }));
}

export function createDeskDice(width: number, height: number): DeskDie[] {
  const sides: SupportedDiceSides[] = [4, 6, 8, 10, 12, 20, 10, 10];
  const columns = width < 620 ? 3 : 8;
  const spacing = Math.min(96, (width - 64) / columns) * unitsPerPixel;
  const rows = Math.ceil(sides.length / columns);
  const dice = sides.map((sides, index): DeskDie => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, 8 - row * columns);
    const shape = getDiceShape(sides);
    const x = (column - (rowCount - 1) / 2) * spacing;
    const z = (row - (rows - 1) / 2) * 2.3;
    const pose = settleLeftovers([shape], [{ position: [x, 1, z], orientation: [0, 0, 0, 1] }], { halfWidth: width * unitsPerPixel / 2, halfDepth: height * unitsPerPixel / 2 }).poses[0]!;
    return {
      sides, group: Math.min(index, 6),
      ...(index === 6 ? {kind: "tens" as const} : index === 7 ? {kind: "units" as const} : {}),
      position: pose.position, orientation: pose.orientation,
      labels: relabelRotation(shape, resultFaceIndex(shape, pose.orientation), index >= 6 ? 10 : 1),
      velocity: [0,0,0], spin: [0,0,0]
    };
  });
  return dice;
}

/** Real rigid-body simulation from the gesture and all dice already on the desk.
 * We calculate before playback so the original fair tool result can label the thrown die.
 * No canned paths, forced rotations at rest, or two-second settling deadline.
 */
export function simulateDeskThrow(current: readonly DeskDie[], input: DeskThrow, bounds: DiceTrayBounds): DeskSimulation {
  const dice = copyDice(current);
  const world = new World({ gravity: new Vec3(0,-28,0), allowSleep: true });
  const tableMaterial = new Material("desk");
  const dieMaterial = new Material("dice");
  world.addContactMaterial(new ContactMaterial(tableMaterial, dieMaterial, {friction:0.48,restitution:0.32}));
  world.addContactMaterial(new ContactMaterial(dieMaterial, dieMaterial, {friction:0.3,restitution:0.35}));
  const walls: Array<[Position, Position, number]> = [
    [[0,0,0],[1,0,0],-Math.PI/2],
    [[-bounds.halfWidth,0,0],[0,1,0],Math.PI/2],
    [[bounds.halfWidth,0,0],[0,1,0],-Math.PI/2],
    [[0,0,-bounds.halfDepth],[0,1,0],0],
    [[0,0,bounds.halfDepth],[0,1,0],Math.PI]
  ];
  for (const [position,axis,angle] of walls) {
    const wall = new Body({mass:0, material:tableMaterial, shape:new Plane()});
    wall.position.set(...position);
    wall.quaternion.setFromAxisAngle(new Vec3(...axis),angle);
    world.addBody(wall);
  }
  const selected = dice.map((die,index)=>die.group === input.group ? index : -1).filter(i=>i>=0);
  const bodies = dice.map((die,index) => {
    const shape = getDiceShape(die.sides);
    const body = new Body({
      mass: 1, material: dieMaterial,
      shape: new ConvexPolyhedron({vertices:shape.vertices.map(v=>new Vec3(v[0]*radius,v[1]*radius,v[2]*radius)),faces:shape.faces.map(f=>[...f])}),
      linearDamping:0.28, angularDamping:die.sides>=10 ? 0.5 : 0.28,
      sleepSpeedLimit:0.12, sleepTimeLimit:0.35
    });
    body.position.set(...die.position);
    body.quaternion.set(...die.orientation);
    body.velocity.set(...die.velocity);
    body.angularVelocity.set(...die.spin);
    const at = selected.indexOf(index);
    if (at >= 0) {
      body.position.set(
        Math.max(-bounds.halfWidth+1,Math.min(bounds.halfWidth-1,input.position[0]+(at-(selected.length-1)/2)*1.25)),
        Math.max(1.2,input.position[1]),
        Math.max(-bounds.halfDepth+1,Math.min(bounds.halfDepth-1,input.position[2]))
      );
      body.velocity.set(...input.velocity);
      body.angularVelocity.set(input.spin[0] + at*2,input.spin[1],input.spin[2]-at*2);
    }
    world.addBody(body);
    return body;
  });
  const frames: number[] = [];
  const record = () => {
    for (const body of bodies) frames.push(body.position.x,body.position.y,body.position.z,body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w,body.velocity.x,body.velocity.y,body.velocity.z,body.angularVelocity.x,body.angularVelocity.y,body.angularVelocity.z);
  };
  record();
  for (let frame=0; frame<480; frame++) {
    world.step(frameSeconds);
    record();
    if (frame>20 && bodies.every(body=>body.sleepState===Body.SLEEPING)) break;
  }
  for (const [at,index] of selected.entries()) {
    const body = bodies[index]!;
    const shape = getDiceShape(dice[index]!.sides);
    const orientation: Quat = [body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w];
    dice[index]!.labels = relabelRotation(shape,resultFaceIndex(shape,orientation),input.values[at]!);
  }
  return {frames:new Float32Array(frames),frameCount:frames.length/(dice.length*13),dice};
}

export function readDeskFrame(simulation: DeskSimulation, frame: number): DeskDie[] {
  return simulation.dice.map((die,index) => {
    const at = (frame*simulation.dice.length+index)*13;
    const f=simulation.frames;
    return {...die,position:[f[at]!,f[at+1]!,f[at+2]!],orientation:[f[at+3]!,f[at+4]!,f[at+5]!,f[at+6]!],velocity:[f[at+7]!,f[at+8]!,f[at+9]!],spin:[f[at+10]!,f[at+11]!,f[at+12]!]};
  });
}

export function readDeskValue(die: DeskDie): number {
  const shape=getDiceShape(die.sides);
  return shape.values[resultFaceIndex(shape,multiply(die.orientation,die.labels))]!;
}

