import * as pc from './vendor/playcanvas.mjs';
import {createWorld} from './world.js';
import {createActors} from './actors.js';

export async function createRenderer(bridge){
 const host=bridge.getCanvas(),parent=host.parentElement;
 const canvas=document.createElement('canvas');canvas.id='modernCanvas';canvas.setAttribute('aria-label','Mundo de Valadares');canvas.tabIndex=-1;
 const overlay=document.createElement('canvas');overlay.id='modernLabels';overlay.setAttribute('aria-hidden','true');
 for(const c of [canvas,overlay]){c.style.cssText='position:absolute;left:0;top:0;z-index:5;display:none;width:100%;height:100%;';parent.append(c);}overlay.style.zIndex='6';overlay.style.pointerEvents='none';canvas.style.touchAction='none';
 const app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:false,antialias:true,powerPreference:'high-performance',deviceTypes:['webgl2']}});
 app.graphicsDevice.maxPixelRatio=Math.min(window.devicePixelRatio||1,1.5);
 app.setCanvasFillMode(pc.FILLMODE_NONE);app.setCanvasResolution(pc.RESOLUTION_AUTO);
 app.scene.ambientLight=new pc.Color(.43,.48,.47);app.scene.toneMapping=pc.TONEMAP_ACES;app.scene.exposure=1.1;
 const camera=new pc.Entity('Camera');camera.addComponent('camera',{projection:pc.PROJECTION_ORTHOGRAPHIC,orthoHeight:5.5,nearClip:.1,farClip:95,clearColor:new pc.Color(.13,.18,.17)});app.root.addChild(camera);
 const sun=new pc.Entity('Sol');sun.addComponent('light',{type:'directional',color:new pc.Color(1,.91,.74),intensity:1.4,castShadows:true,shadowResolution:2048,shadowDistance:45,shadowBias:.15,normalOffsetBias:.04,shadowType:pc.SHADOW_PCF3_32F});sun.setEulerAngles(52,-35,0);app.root.addChild(sun);
 const fill=new pc.Entity('Ceu');fill.addComponent('light',{type:'directional',color:new pc.Color(.5,.7,.88),intensity:.45,castShadows:false});fill.setEulerAngles(55,145,0);app.root.addChild(fill);
 const lamp=new pc.Entity('Luz do aventureiro');lamp.addComponent('light',{type:'omni',color:new pc.Color(1,.67,.32),intensity:.9,range:5,castShadows:false});app.root.addChild(lamp);
 let width=720,height=528,ready=false,failed=false,elapsed=0,frames=0,fps=0,lastError=null;
 const itemIcons=new Map();
 const ctx=overlay.getContext('2d');
 function resize(){const rect=host.getBoundingClientRect(),pr=parent.getBoundingClientRect();if(rect.width<2||rect.height<2)return;width=rect.width;height=rect.height;
  for(const c of [canvas,overlay]){c.style.setProperty('--modern-width',width+'px');c.style.setProperty('--modern-height',height+'px');c.style.setProperty('left',(rect.left-pr.left-parent.clientLeft+parent.scrollLeft)+'px','important');c.style.setProperty('top',(rect.top-pr.top-parent.clientTop+parent.scrollTop)+'px','important');c.style.setProperty('width',width+'px','important');c.style.setProperty('height',height+'px','important');c.style.setProperty('max-height','none','important');c.style.setProperty('aspect-ratio','auto','important');}
  app.resizeCanvas(width,height);const ratio=Math.min(window.devicePixelRatio||1,2);overlay.width=Math.round(width*ratio);overlay.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);camera.camera.orthoHeight=5.7;
 }
 const observer=new ResizeObserver(resize);observer.observe(host);window.addEventListener('resize',resize);resize();
 let viewBounds=null;
 const presentation=Object.create(bridge);presentation.getViewBounds=()=>viewBounds;
 const world=createWorld(pc,app,presentation);let actors;
 try{actors=await createActors(pc,app,presentation);}catch(error){observer.disconnect();window.removeEventListener('resize',resize);world.destroy();app.destroy();canvas.remove();overlay.remove();throw error;}
 const project=(x,y,z)=>{const v=camera.camera.worldToScreen(new pc.Vec3(x,y,z));return{x:v.x,y:v.y,z:v.z};};
 const text=(label,x,y,color='#f3ebcf',size=12)=>{ctx.font=`600 ${size}px system-ui, sans-serif`;ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='rgba(10,18,19,.82)';ctx.strokeText(label,x,y);ctx.fillStyle=color;ctx.fillText(label,x,y);};
 function labels(){ctx.clearRect(0,0,width,height);const player=bridge.getPlayer(),target=bridge.getTarget?.()||{id:player.target,type:player.targetType};
  for(const [id,r]of actors.entries){const e=r.data;const x=(e.renderX??e.x)+.5,z=(e.renderY??e.y)+.5;const isTarget=id===`${target.type==='player'?'remote':'mob'}:${target.id}`;
   if(isTarget){const pos=project(x,.035,z);ctx.strokeStyle='#f3c76b';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(pos.x,pos.y,18*width/720,9*height/528,0,0,Math.PI*2);ctx.stroke();}
   const y=r.kind==='mob'?Math.max(.7,(bridge.getMonsterTypes?.()[e.type]?.size||1)*1.35):1.6;const pos=project(x,y,z);if(pos.x<0||pos.x>width||pos.y<0||pos.y>height)continue;
   if(r.kind==='npc'){const distance=Math.hypot(e.x-player.x,e.y-player.y);if(distance<4)text(bridge.npcName?.(e)||e.name,pos.x,pos.y,'#e7c787',11);}
   else if(r.kind==='remote'||r.kind==='player'){
    const cosmetic=bridge.getItems?.()[e.equipped?.cosmetic||e.cosmetic]||{};
    text((e.ghost?'◌ ':e.pvp?'⚔ ':'')+(r.kind==='player'?player.name:e.name),pos.x,pos.y,cosmetic.nameColor||(r.kind==='player'?'#ece3c6':'#9accc5'),11);
    const en=bridge.getLanguage?.()==='en';
    const status=[e.poison?(en?'POISON':'VENENO'):'',e.stun?(en?'STUNNED':'ATORDOADO'):'',e.bleed?(en?'BLEEDING':'SANGRANDO'):'',e.buff?'✦':''].filter(Boolean).join(' · ');
    if(status)text(status,pos.x,pos.y-14,e.stun?'#ffbf67':'#a6d78b',9);
    if(cosmetic.aura){const base=project(x,.04,z);ctx.globalAlpha=.45+Math.sin(performance.now()/350)*.18;ctx.strokeStyle=cosmetic.aura;ctx.lineWidth=3;ctx.shadowColor=cosmetic.aura;ctx.shadowBlur=12;ctx.beginPath();ctx.ellipse(base.x,base.y,23*width/720,11*height/528,0,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=1;}
   }
   if(r.kind==='mob'&&(isTarget||e.hp<e.maxHp)){const pct=Math.max(0,Math.min(1,e.hp/(e.maxHp||e.hp))),w=36;ctx.fillStyle='rgba(11,18,17,.85)';ctx.fillRect(pos.x-w/2-1,pos.y+4,w+2,5);ctx.fillStyle=isTarget?'#c57152':'#89ac80';ctx.fillRect(pos.x-w/2,pos.y+5,w*pct,3);if(isTarget)text(e.name||bridge.getMonsterTypes?.()[e.type]?.name||e.type,pos.x,pos.y,'#f1d4aa',11);}
  }
  for(const f of bridge.getFloats?.()||[]){const x=f.entity?.renderX??f.x,y=f.entity?.renderY??f.y;if(!Number.isFinite(x)||!Number.isFinite(y))continue;const p=project(x+.5,1.6+(900-f.life)/1000,y+.5);ctx.globalAlpha=Math.min(1,f.life/300);text(String(f.text),p.x,p.y,f.color||'#f4deac',Math.min(18,f.size||13));ctx.globalAlpha=1;}
  for(const e of bridge.getGround?.()||[]){
   const x=e.x??e.tx,y=e.y??e.ty;if(!Number.isFinite(x)||!Number.isFinite(y))continue;
   const pos=project(x+.5,.16,y+.5);if(pos.x<0||pos.x>width||pos.y<0||pos.y>height)continue;
   const locked=bridge.lootLockedToOther?.(e),def=bridge.getItems?.()[e.type]||{},color=locked?'#8a9690':def.color||'#e7bd68';
   ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=locked?0:12;ctx.globalAlpha=.7;ctx.beginPath();ctx.ellipse(pos.x,pos.y+4,11,5,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=locked?.45:1;
   let icon=itemIcons.get(e.type);if(!icon&&bridge.getItemIcon){icon=new Image();icon.src=bridge.getItemIcon(e.type,32);itemIcons.set(e.type,icon);}
   if(icon?.complete&&icon.naturalWidth)ctx.drawImage(icon,pos.x-14,pos.y-20,28,28);
   ctx.globalAlpha=1;if(e.qty>1)text(String(e.qty),pos.x+12,pos.y+12,'#ede3c9',10);
   if(locked)text('🔒',pos.x,pos.y-22,'#becbc7',10);else if(Math.hypot(x-player.x,y-player.y)<3)text(def.name||e.type,pos.x,pos.y-23,color,10);
  }
  for(const p of bridge.getProjectiles?.()||[]){if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;const pos=project(p.x+.5,.6,p.y+.5);ctx.fillStyle=p.color||'#f5ca6b';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=14;ctx.beginPath();ctx.arc(pos.x,pos.y,4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  for(const p of bridge.getParticles?.()||[]){const pos=project(p.x+.5,.65,p.y+.5);ctx.globalAlpha=Math.max(0,p.life/(p.maxLife||500));ctx.fillStyle=p.color||'#e7bd68';ctx.beginPath();ctx.arc(pos.x,pos.y,2.2,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  for(const a of bridge.getAuras?.()||[]){const e=a.entity||player,pos=project((e.renderX??e.x)+.5,.07,(e.renderY??e.y)+.5);ctx.globalAlpha=Math.min(.65,a.life/(a.duration||700));ctx.strokeStyle=a.color||'#79d0c1';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(pos.x,pos.y,28,14,0,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;
  for(const [kind,s]of Object.entries(bridge.getStairs?.()||{})){if(!s)continue;const pos=project(s.x+.5,.04,s.y+.5);if(pos.x<0||pos.x>width||pos.y<0||pos.y>height)continue;const near=Math.hypot(s.x-player.x,s.y-player.y)<4;ctx.strokeStyle=kind==='town'?'#95dbc9':'#e5c78c';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(pos.x,pos.y,17,8,0,0,Math.PI*2);ctx.stroke();if(near){const en=bridge.getLanguage?.()==='en';text(bridge.getInterior?.()?(en?'Exit':'Saída'):kind==='town'?(en?'Village':'Vila'):kind==='up'?(en?'Up':'Subir'):(en?'Down':'Descer'),pos.x,pos.y-14,'#e8d9b6',11);}}
  if(!(player.floor||0))for(const room of bridge.getInteriors?.()||[]){const distance=Math.hypot(room.door.x-player.x,room.door.y-player.y);if(distance>7)continue;const pos=project(room.door.x+.5,.25,room.door.y+.5),en=bridge.getLanguage?.()==='en';text(en?({pousada:'Tavern',oficina:'Forge',biblioteca:'Temple',mercado:'Training hall'})[room.id]:room.label,pos.x,pos.y-18,'#efcb86',12);}
  for(const p of bridge.getProps?.()||[]){if(Math.hypot(p.x-player.x,p.y-player.y)>2.4)continue;const pos=project(p.x+.5,1.15,p.y+.5),en=bridge.getLanguage?.()==='en';text((en?{chest:'Chest',altar:'Altar',craft:'Workbench',dummy:'Training'}:{chest:'Baú',altar:'Altar',craft:'Bancada',dummy:'Treino'})[p.kind]||'',pos.x,pos.y,'#d8c08c',11);}
  for(const p of bridge.getTrails?.()||[]){const pos=project(p.x+.5,.02,p.y+.5);ctx.globalAlpha=Math.max(0,Math.min(.35,p.life/(p.maxLife||500)));ctx.fillStyle=p.color||'#85c2b6';ctx.beginPath();ctx.ellipse(pos.x,pos.y,6,3,0,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
 }
 function input(event){if(!bridge.getStarted?.())return;event.preventDefault();const rect=canvas.getBoundingClientRect(),sx=event.clientX-rect.left,sy=event.clientY-rect.top;const cam=bridge.getCamera();let tile=null,best=Infinity;
  for(const r of actors.entries.values()){if(event.type==='contextmenu'&&r.kind!=='remote')continue;if(event.type==='click'&&!['mob','remote'].includes(r.kind))continue;const e=r.data;const q=project((e.renderX??e.x)+.5,.6,(e.renderY??e.y)+.5);const distance=Math.hypot(q.x-sx,q.y-sy);if(distance<32*width/720&&distance<best){best=distance;tile={x:Math.round(e.renderX??e.x),y:Math.round(e.renderY??e.y)};}}
  if(!tile){const near=camera.camera.screenToWorld(sx,sy,.1),far=camera.camera.screenToWorld(sx,sy,80);const t=-near.y/(far.y-near.y);tile={x:Math.floor(near.x+(far.x-near.x)*t),y:Math.floor(near.z+(far.z-near.z)*t)};}
  const hr=host.getBoundingClientRect();host.dispatchEvent(new MouseEvent(event.type,{bubbles:true,cancelable:true,button:event.button,buttons:event.buttons,clientX:hr.left+(tile.x+.5-cam.x)/bridge.VP_W*hr.width,clientY:hr.top+(tile.y+.5-cam.y)/bridge.VP_H*hr.height}));
  if(event.type==='contextmenu'){const menu=document.getElementById('playerCtxMenu');if(menu){menu.style.left=Math.min(event.clientX,window.innerWidth-menu.offsetWidth-8)+'px';menu.style.top=Math.min(event.clientY,window.innerHeight-menu.offsetHeight-8)+'px';}}
 }
 canvas.addEventListener('click',input);canvas.addEventListener('contextmenu',input);
 function recover(error){
  if(failed)return;
  failed=true;ready=false;lastError=String(error);canvas.style.display='none';overlay.style.display='none';app.autoRender=false;app.renderNextFrame=false;
  document.body.classList.remove('modern-renderer-ready');console.error('[Valadares moderno]',error);
  document.dispatchEvent(new CustomEvent('valadares:modern-error',{detail:{message:lastError}}));
 }
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();recover(new Error('Contexto gráfico interrompido'));});
 app.on('update',dt=>{
  if(failed)return;
  const started=bridge.getStarted?.();canvas.style.display=started?'block':'none';overlay.style.display=started?'block':'none';if(!started)return;
  try{
   const p=bridge.getPlayer(),cam=bridge.getCamera(),cx=cam.x+bridge.VP_W/2,cz=cam.y+bridge.VP_H/2;
   const halfX=camera.camera.orthoHeight*width/height,halfZ=camera.camera.orthoHeight*Math.hypot(16,10)/16;
   viewBounds={minX:cx-halfX-2,maxX:cx+halfX+2,minY:cz-halfZ-4,maxY:cz+halfZ+2};
   camera.setPosition(cx,16,cz+10);camera.lookAt(cx,0,cz);lamp.setPosition((p.renderX??p.x)+.5,2.7,(p.renderY??p.y)+.5);
   const underground=(p.floor||0)>0||bridge.inCave?.(p.x,p.y),dark=Math.max(0,Math.min(1,bridge.getDayPhase?.().darkness||0));
   const interior=!!bridge.getInterior?.();
   sun.light.intensity=interior?.95:underground?.46:1.4-dark*.95;fill.light.intensity=interior?.38:underground?.23:.45-dark*.1;lamp.light.intensity=interior?1.15:underground?2.1:.3+dark*.8;
   world.update(dt);actors.update(dt);labels();frames++;elapsed+=dt;if(elapsed>=1){fps=frames/elapsed;frames=0;elapsed=0;}
  }catch(error){recover(error);}
 });
 function captureStream(rate=30){const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;const capture=output.getContext('2d'),stream=output.captureStream(rate);const paint=()=>{capture.drawImage(canvas,0,0,output.width,output.height);capture.drawImage(overlay,0,0,output.width,output.height);};app.on('postrender',paint);const timer=setInterval(()=>{if(stream.getVideoTracks().every(t=>t.readyState==='ended')){clearInterval(timer);app.off('postrender',paint);}},500);return stream;}
 app.start();ready=true;document.body.classList.add('modern-renderer-ready');
 return {app,world,actors,camera,canvas,bridge,project,captureStream,diagnostics:()=>({ready,fps:Math.round(fps),error:lastError,actors:actors.diagnostics(),world:world.diagnostics(),width,height,drawCalls:app.stats.drawCalls.total}),destroy(){observer.disconnect();window.removeEventListener('resize',resize);actors.destroy();world.destroy();app.destroy();canvas.remove();overlay.remove();}};
}
