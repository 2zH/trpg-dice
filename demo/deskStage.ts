import { BufferGeometry, CanvasTexture, DirectionalLight, EdgesGeometry, Float32BufferAttribute, HemisphereLight, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, OrthographicCamera, PCFSoftShadowMap, PlaneGeometry, Scene, ShadowMaterial, SRGBColorSpace, WebGLRenderer } from "three";
import { buildDiceMeshData } from "../src/tray/diceMesh.js";
import { getDiceShape, multiply, axisAngle, type Quat } from "../src/tray/diceShapes.js";
import { paintDiceAtlas } from "../src/tray/diceTexture.js";
import { createReplayClock } from "../src/tray/replayClock.js";
import { dice_roll } from "../src/diceRollTool.js";
import { copyDice, createDeskDice, frameSeconds, readDeskFrame, readDeskValue, simulateDeskThrow, unitsPerPixel, type DeskDie, type Position } from "./deskPhysics.js";

export type DeskMode = "rest" | "held" | "rolling";
export interface DeskView { dice: DeskDie[]; mode: DeskMode; message: string; undoCount: number; heldGroup?: number }
interface Hold { group: number; before: DeskDie[]; start: [number,number]; recent: Array<[number,number,number]> }
const random = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000;
const clamp = (value:number,min:number,max:number) => Math.max(min,Math.min(max,value));

export class DeskStage {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1,1,1,-1,0.1,100);
  private meshes: Mesh[] = [];
  private geometries = new Map<number,BufferGeometry>();
  private materials: MeshStandardMaterial[] = [];
  private edges: EdgesGeometry[] = [];
  private edgeMaterial = new LineBasicMaterial({color:0x948a76,transparent:true,opacity:0.36});
  private ground: Mesh<PlaneGeometry,ShadowMaterial>;
  private light: DirectionalLight;
  private observer: ResizeObserver;
  private dice: DeskDie[] = [];
  private history: DeskDie[][] = [];
  private hold: Hold | null = null;
  private request = 0;
  private finishRoll: (()=>void) | null = null;
  private width = 0;
  private height = 0;
  private mode: DeskMode = "rest";
  private message = "";
  private bounds = {halfWidth:8,halfDepth:5};

  constructor(private host: HTMLDivElement, private publish: (view:DeskView)=>void) {
    this.renderer = new WebGLRenderer({alpha:true,antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(0,0);
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0,30,0);
    this.camera.up.set(0,0,-1);
    this.camera.lookAt(0,0,0);
    this.scene.add(new HemisphereLight(0xfffaf0,0xc6c2b8,2));
    this.light = new DirectionalLight(0xfff4df,2.2);
    this.light.position.set(-5,18,-7);
    this.light.castShadow=true;
    this.light.shadow.mapSize.set(2048,2048);
    this.light.shadow.bias=-0.0005;
    this.scene.add(this.light);
    this.ground=new Mesh(new PlaneGeometry(100,100),new ShadowMaterial({opacity:0.15}));
    this.ground.rotation.x=-Math.PI/2;
    this.ground.receiveShadow=true;
    this.scene.add(this.ground);
    this.observer = new ResizeObserver(()=>this.resize());
    this.observer.observe(host);
    this.resize();
  }

  private resize() {
    const width=this.host.clientWidth, height=this.host.clientHeight;
    if (!width || !height || (width===this.width && height===this.height)) return;
    cancelAnimationFrame(this.request);
    this.finishRoll?.();
    if(this.hold) this.cancel();
    this.width=width; this.height=height;
    this.bounds={halfWidth:Math.max(2.5,(width/2-28)*unitsPerPixel),halfDepth:Math.max(2.7,(height/2-96)*unitsPerPixel)};
    this.camera.left=-width*unitsPerPixel/2;
    this.camera.right=width*unitsPerPixel/2;
    this.camera.top=height*unitsPerPixel/2;
    this.camera.bottom=-height*unitsPerPixel/2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width,height);
    const shadow=this.light.shadow.camera;
    const extent=Math.max(this.bounds.halfWidth,this.bounds.halfDepth)+3;
    shadow.left=-extent; shadow.right=extent; shadow.top=extent; shadow.bottom=-extent; shadow.far=60; shadow.updateProjectionMatrix();
    if (!this.dice.length) {
      this.dice=createDeskDice(width,height);
      this.createMeshes();
    } else {
      // A viewport resize keeps the results, bringing only out-of-bounds positions back onto the desk.
      for (const die of [this.dice,...this.history].flat()) {
        die.position[0]=clamp(die.position[0],-this.bounds.halfWidth+0.6,this.bounds.halfWidth-0.6);
        die.position[2]=clamp(die.position[2],-this.bounds.halfDepth+0.6,this.bounds.halfDepth-0.6);
        die.velocity=[0,0,0]; die.spin=[0,0,0];
      }
    }
    this.mode="rest"; this.hold=null;
    this.draw();
  }

  private createMeshes() {
    for (const die of this.dice) {
      let geometry=this.geometries.get(die.sides);
      if (!geometry) {
        const data=buildDiceMeshData(getDiceShape(die.sides),0.55);
        geometry=new BufferGeometry();
        geometry.setAttribute("position",new Float32BufferAttribute(data.positions,3));
        geometry.setAttribute("normal",new Float32BufferAttribute(data.normals,3));
        geometry.setAttribute("uv",new Float32BufferAttribute(data.uvs,2));
        this.geometries.set(die.sides,geometry);
      }
      const texture=new CanvasTexture(paintDiceAtlas(getDiceShape(die.sides),buildDiceMeshData(getDiceShape(die.sides),1).atlas,die.kind));
      texture.colorSpace=SRGBColorSpace;
      const material=new MeshStandardMaterial({map:texture,roughness:0.95,flatShading:true});
      this.materials.push(material);
      const mesh=new Mesh(geometry,material);
      mesh.castShadow=true; mesh.receiveShadow=true;
      const edge=new EdgesGeometry(geometry);
      this.edges.push(edge); mesh.add(new LineSegments(edge,this.edgeMaterial));
      this.meshes.push(mesh); this.scene.add(mesh);
    }
  }

  private point(x:number,y:number): Position {
    const rect=this.host.getBoundingClientRect();
    return [(x-rect.left-this.width/2)*unitsPerPixel,1.6,(y-rect.top-this.height/2)*unitsPerPixel];
  }

  grab(index:number,x:number,y:number,time:number): boolean {
    if (this.mode!=="rest") return false;
    const die=this.dice[index];
    if (!die) return false;
    this.hold={group:die.group,before:copyDice(this.dice),start:[x,y],recent:[[x,y,time]]};
    this.mode="held";
    this.move(x,y,time);
    return true;
  }

  move(x:number,y:number,time:number) {
    const hold=this.hold;
    if (!hold) return;
    hold.recent.push([x,y,time]);
    hold.recent=hold.recent.filter(p=>time-p[2]<100);
    const p=this.point(x,y);
    const selected=this.dice.filter(d=>d.group===hold.group);
    selected.forEach((die,at)=>{
      die.position=[clamp(p[0]+(at-(selected.length-1)/2)*1.25,-this.bounds.halfWidth+0.7,this.bounds.halfWidth-0.7),1.6,clamp(p[2],-this.bounds.halfDepth+0.7,this.bounds.halfDepth-0.7)];
      const before=hold.before.find(d=>d.group===hold.group)!;
      const tilt=axisAngle([1,0,0],clamp((y-hold.start[1])*0.006,-0.7,0.7));
      const yaw=axisAngle([0,1,0],(x-hold.start[0])*0.008);
      die.orientation=multiply(yaw,multiply(tilt,before.orientation));
    });
    this.draw();
  }

  release(x:number,y:number,time:number) {
    const hold=this.hold;
    if (!hold) return;
    const first=hold.recent[0]!;
    const elapsed=Math.max(16,time-first[2])/1000;
    const vx=clamp((x-first[0])*unitsPerPixel/elapsed,-16,16);
    const vz=clamp((y-first[1])*unitsPerPixel/elapsed,-16,16);
    const sides=hold.group===6 ? 100 : this.dice.find(d=>d.group===hold.group)!.sides;
    const result=dice_roll({sides});
    const value=result.rolls[0]!;
    const values=sides===100 ? [Math.floor(value%100/10)||10,value%10||10] : [value];
    const position=this.point(x,y);
    this.history.push(hold.before);
    if (this.history.length>30) this.history.shift();
    this.hold=null;
    const simulation=simulateDeskThrow(this.dice,{
      group:hold.group,position,
      velocity:[vx,2+Math.min(4,Math.hypot(vx,vz)*0.15),vz],
      spin:[vz*0.7+(random()-0.5)*15,(random()-0.5)*18,-vx*0.7+(random()-0.5)*15],values
    },this.bounds);
    this.mode="rolling";
    this.message="";
    const finish=()=>{
      this.finishRoll=null;
      this.dice=readDeskFrame(simulation,simulation.frameCount-1);
      for (const die of this.dice) {die.velocity=[0,0,0];die.spin=[0,0,0];}
      this.mode="rest";
      this.message=`d${sides} · ${value}`;
      this.draw();
    };
    this.finishRoll=finish;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {finish();return;}
    const clock=createReplayClock();
    const frame=(now:number)=>{
      const at=Math.min(simulation.frameCount-1,Math.floor(clock(now)/(frameSeconds*1000)));
      if (at===simulation.frameCount-1) {finish();return;}
      this.dice=readDeskFrame(simulation,at);
      this.draw();
      this.request=requestAnimationFrame(frame);
    };
    this.request=requestAnimationFrame(frame);
  }

  keyboardThrow(index:number) {
    const die=this.dice[index];
    if (!die || this.mode!=="rest") return;
    const rect=this.host.getBoundingClientRect();
    const x=rect.left+this.width/2+die.position[0]/unitsPerPixel;
    const y=rect.top+this.height/2+die.position[2]/unitsPerPixel;
    if (this.grab(index,x,y,performance.now())) this.release(x,y,performance.now()+16);
  }

  cancel() {
    if (!this.hold) return;
    this.dice=this.hold.before; this.hold=null; this.mode="rest";
    this.draw();
  }

  undo() {
    if (this.hold) {this.cancel();return;}
    const before=this.history.pop();
    if (!before) return;
    cancelAnimationFrame(this.request);
    this.finishRoll=null;
    this.dice=before; this.mode="rest"; this.message="已放回上一掷";
    this.draw();
  }

  private draw() {
    this.meshes.forEach((mesh,index)=>{
      const die=this.dice[index]!;
      mesh.visible=this.mode==="rolling" || (this.mode==="held" && die.group===this.hold?.group);
      mesh.position.set(...die.position);
      mesh.quaternion.set(...multiply(die.orientation,die.labels));
    });
    this.renderer.render(this.scene,this.camera);
    this.host.dataset.state=this.mode;
    this.host.dataset.values=this.dice.map(readDeskValue).join(",");
    this.publish({dice:this.dice,mode:this.mode,message:this.message,undoCount:this.history.length,heldGroup:this.hold?.group});
  }

  dispose() {
    cancelAnimationFrame(this.request);
    this.observer.disconnect();
    for(const g of this.geometries.values()) g.dispose();
    for(const e of this.edges) e.dispose();
    for(const m of this.materials) {m.map?.dispose();m.dispose();}
    this.edgeMaterial.dispose();this.ground.geometry.dispose();this.ground.material.dispose();
    this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
  }
}
