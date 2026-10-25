import { describe, expect, it } from "vitest";
import { createDeskDice, readDeskFrame, readDeskValue, simulateDeskThrow } from "./deskPhysics.js";

describe("gesture-driven dice desk",()=>{
  const bounds={halfWidth:10,halfDepth:6};
  it("uses the hand's direction and speed, and displays the tool's chosen value",()=>{
    const dice=createDeskDice(1200,800);
    const input={group:1,position:[0,1.6,0] as [number,number,number],velocity:[7,3,2] as [number,number,number],spin:[4,7,9] as [number,number,number],values:[6]};
    const result=simulateDeskThrow(dice,input,bounds);
    const first=readDeskFrame(result,0)[1]!;
    expect(first.velocity).toEqual([7,3,2]);
    const final=readDeskFrame(result,result.frameCount-1);
    expect(readDeskValue(final[1]!)).toBe(6);
    expect(final.every(d=>Math.abs(d.position[0])<10 && Math.abs(d.position[2])<6)).toBe(true);
    const reverse=simulateDeskThrow(dice,{...input,velocity:[-7,3,-2]},bounds);
    expect(readDeskFrame(reverse,30)[1]!.position[0]).not.toBeCloseTo(readDeskFrame(result,30)[1]!.position[0],1);
  });
  it("lets the thrown die collide with dice that were already at rest",()=>{
    const dice=createDeskDice(1200,800);
    dice[1]!.position=[0,0.32,0];
    // Keep the other six dice out of the path so this checks the intended collision.
    dice.forEach((die,index)=>{if(index>1) die.position=[index-4,0.5,4];});
    const result=simulateDeskThrow(dice,{group:0,position:[-1.5,1.2,0],velocity:[12,-6,0],spin:[0,0,0],values:[3]},bounds);
    const final=readDeskFrame(result,result.frameCount-1);
    expect(Math.hypot(final[1]!.position[0],final[1]!.position[2])).toBeGreaterThan(0.2);
    expect(readDeskValue(final[0]!)).toBe(3);
  });
  it("keeps percentile tens and units on two physical dice",()=>{
    const result=simulateDeskThrow(createDeskDice(390,844),{group:6,position:[0,1.6,0],velocity:[0,3,1],spin:[3,5,7],values:[10,10]},{halfWidth:3.5,halfDepth:6});
    const final=readDeskFrame(result,result.frameCount-1);
    expect(final.filter(d=>d.group===6).map(readDeskValue)).toEqual([10,10]);
  });
});
