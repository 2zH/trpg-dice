import { useEffect, useRef, useState, type PointerEvent } from "react";
import { DeskStage, type DeskView } from "./deskStage.js";
import { createDeskDice, radius, readDeskValue, unitsPerPixel, type DeskDie } from "./deskPhysics.js";
import { diceFaceLabel, getDiceShape, rotate } from "../src/tray/diceShapes.js";

/** Convex silhouette of the actual resting die, projected onto the paper-flat desk. */
function silhouette(die:DeskDie): string {
  const points=getDiceShape(die.sides).vertices.map(vertex=>{
    const p=rotate(die.orientation,vertex);
    return [p[0]*radius/unitsPerPixel,p[2]*radius/unitsPerPixel] as [number,number];
  }).sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  const cross=(a:number[],b:number[],c:number[])=>(b[0]!-a[0]!)*(c[1]!-a[1]!)-(b[1]!-a[1]!)*(c[0]!-a[0]!);
  const half=(input:typeof points)=>{
    const hull:typeof points=[];
    for(const p of input) {while(hull.length>=2 && cross(hull[hull.length-2]!,hull[hull.length-1]!,p)<=0) hull.pop();hull.push(p);}
    return hull.slice(0,-1);
  };
  return [...half(points),...half([...points].reverse())].map(p=>`${p[0]+40},${p[1]+36}`).join(" ");
}

export default function DiceDesk() {
  const host=useRef<HTMLDivElement>(null);
  const stage=useRef<DeskStage|null>(null);
  const [view,setView]=useState<DeskView>({dice:[],mode:"rest",message:"",undoCount:0});
  const [unavailable,setUnavailable]=useState(false);
  useEffect(()=>{
    if(!host.current) return;
    try {stage.current=new DeskStage(host.current,setView);}
    catch {setUnavailable(true);setView({dice:createDeskDice(innerWidth,innerHeight),mode:"rest",message:"此浏览器未启用 WebGL",undoCount:0});}
    const key=(e:KeyboardEvent)=>{
      if(e.key==="Escape") stage.current?.cancel();
      if(e.key.toLowerCase()==="z" && !e.altKey && !e.shiftKey) {e.preventDefault();stage.current?.undo();}
    };
    window.addEventListener("keydown",key);
    return ()=>{window.removeEventListener("keydown",key);stage.current?.dispose();stage.current=null;};
  },[]);
  const down=(event:PointerEvent<HTMLElement>)=>{
    if(event.button!==0) return;
    const target=(event.target as Element).closest<HTMLButtonElement>("[data-die]");
    if(!target) return;
    if(stage.current?.grab(Number(target.dataset.die),event.clientX,event.clientY,event.timeStamp)) {
      event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const release=(event:PointerEvent<HTMLElement>)=>{
    if(!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    stage.current?.release(event.clientX,event.clientY,event.timeStamp);
  };
  return <main className="desk" onPointerDown={down} onPointerMove={e=>stage.current?.move(e.clientX,e.clientY,e.timeStamp)} onPointerUp={release} onPointerCancel={()=>stage.current?.cancel()} onDoubleClick={e=>{if(!(e.target as Element).closest("button,a")) stage.current?.undo();}}>
    <div className="desk-canvas" ref={host} aria-hidden="true" />
    <header><span>dice.</span><a href="https://github.com/2zH/trpg-dice" aria-label="查看源代码">↗</a></header>
    <div className={`pieces pieces--${view.mode}`} aria-label="桌上的骰子">
      {view.dice.map((die,index)=>{
        const value=diceFaceLabel(readDeskValue(die),die.kind);
        const caption=die.kind==="tens" ? "d100 / 十" : die.kind==="units" ? "d100 / 个" : `d${die.sides}`;
        return <button type="button" data-die={index} key={index} className={`piece${view.heldGroup===die.group ? " piece--lifted" : ""}`} style={{left:`calc(50% + ${die.position[0]/unitsPerPixel}px)`,top:`calc(50% + ${die.position[2]/unitsPerPixel}px)`}} aria-label={`${caption}，当前 ${value}。拖动或按空格掷出。`} aria-disabled={view.mode==="rolling" || unavailable} onKeyDown={e=>{if(e.key===" " || e.key==="Enter") {e.preventDefault();stage.current?.keyboardThrow(index);}}} onClick={e=>{if(e.detail===0) stage.current?.keyboardThrow(index);}}>
          <svg viewBox="0 0 80 80" aria-hidden="true"><polygon points={silhouette(die)} /><text x="40" y="37">{value}</text></svg>
          <span className="piece-name">{caption}</span>
        </button>;
      })}
    </div>
    <footer><p aria-live="polite">{view.message || (view.mode==="rest" ? "拿起一颗，松手掷下。" : "")}</p><span>{view.undoCount ? "双击桌面撤回 · Z" : "拖动掷骰"}</span></footer>
  </main>;
}
