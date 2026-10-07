// Presentation of the authoritative tile map. Passability and interaction
// remain entirely with play.html and the server.
import {createScenery} from './scenery.js';
const CHUNK = 12;
const REACH = 12;
const TAU = Math.PI * 2;
const PAL = {
 grass:['#59734f','#607852','#536f4c'], dirt:['#9a805f','#a18765','#947b5b'],
 stone:['#c0b59b','#c8bea7','#b8ae98'], cave:['#515955','#59605b','#4b5351'],
 snow:['#d9dfd8','#dce2dc','#d4dbd8'], sand:['#cbb481','#cfb989','#c6ae7c'],
 water:['#29828b','#31858d','#287e87'], foam:['#80b6ae'], bark:['#493a2d','#594331'],
 leaf:['#315743','#40724c','#66835a'], pine:['#315753','#42665e'],
 cliff:['#64706b','#808b7f','#4e615e'], copper:['#a5603b','#bb7950'],
 ivory:['#dfd1ad','#f0dcaf'], wood:['#76533b','#60402f'], jade:['#5ba99a','#80c9b0'],
 linen:['#d8c6a0','#eadbb9'], straw:['#cfac69','#e0c483'], teal:['#286e76','#358b91'], blue:['#294f70','#396788'],
 ember:['#f0a34c','#f8c065'], window:['#d8bc7d'], mortar:['#9e9683'],
 clay:['#b46b4c','#bd7654','#ad6246'], dark:['#302f35','#47444a'], roof:['#a65d40','#b46a49'],
 forgeFloor:['#434a47','#4a514c','#3b4341'], forgeWall:['#59615a','#4d5651'],
 forgeSteel:['#646d68','#77827a'], forgeGlow:['#ef8c42','#f6ae54']
};
const hash=(x,z,s=0)=>{let n=Math.imul(x+1013,374761393)+Math.imul(z+37,668265263)+Math.imul(s+7,1274126177);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
const hexColor=(pc,hex)=>new pc.Color().fromString(hex);

// One geometry buffer per material and chunk. The largest nearby scene stays
// under a few hundred draw calls rather than one render component per tile.
class Geometry {
 constructor(){this.p=[];this.n=[];this.uv=[];this.i=[];}
  quad(a,b,c,d,uv=1){const base=this.p.length/3;const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];let nx=u[1]*v[2]-u[2]*v[1],ny=u[2]*v[0]-u[0]*v[2],nz=u[0]*v[1]-u[1]*v[0],l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;for(const p of [a,b,c,d]){this.p.push(...p);this.n.push(nx,ny,nz);}this.uv.push(...(Array.isArray(uv)?uv:[0,0,uv,0,uv,uv,0,uv]));this.i.push(base,base+1,base+2,base,base+2,base+3);}
 box(x,y,z,w,h,d,rotation=0,worldUv=false){const c=Math.cos(rotation),s=Math.sin(rotation),corner=(a,b,Y)=>[x+a*c-b*s,Y,z+a*s+b*c],X=w/2,Z=d/2;
  const a=corner(-X,-Z,y),b=corner(X,-Z,y),c0=corner(X,Z,y),d0=corner(-X,Z,y),A=corner(-X,-Z,y+h),B=corner(X,-Z,y+h),C=corner(X,Z,y+h),D=corner(-X,Z,y+h);
  const uv=(u,v)=>worldUv?[0,0,u,0,u,v,0,v]:1;
  this.quad(A,D,C,B,uv(d,w));this.quad(d0,a,b,c0,uv(d,w));this.quad(a,A,B,b,uv(h,w));this.quad(b,B,C,c0,uv(h,d));this.quad(c0,C,D,d0,uv(h,w));this.quad(d0,D,A,a,uv(h,d));
 }
 cone(x,y,z,r,h,sides=6,offset=0){const top=[x,y+h,z],center=[x,y,z];for(let i=0;i<sides;i++){const t=offset+i*TAU/sides,t2=offset+(i+1)*TAU/sides,p=[x+Math.cos(t)*r,y,z+Math.sin(t)*r],q=[x+Math.cos(t2)*r,y,z+Math.sin(t2)*r];this.quad(p,top,q,q);this.quad(center,q,p,p);}}
  crown(x,y,z,r,h,seed=0){const n=7,rings=[];for(let row=0;row<4;row++){const yy=y+h*[0,.28,.73,1][row],rr=r*[.58,1,.85,.28][row],ring=[];for(let i=0;i<n;i++){const a=i*TAU/n,wiggle=.86+hash(seed+i,row,17)*.22;ring.push([x+Math.cos(a)*rr*wiggle,yy+(hash(seed,i,row)-.5)*.1,z+Math.sin(a)*rr*wiggle]);}rings.push(ring);}for(let row=0;row<3;row++)for(let i=0;i<n;i++){const j=(i+1)%n;this.quad(rings[row][i],rings[row+1][i],rings[row+1][j],rings[row][j]);}const top=[x,y+h+.05,z];for(let i=0;i<n;i++)this.quad(rings[3][i],top,rings[3][(i+1)%n],rings[3][(i+1)%n]);}
 rock(x,y,z,r,h,seed=0){const top=[x+(.5-hash(seed,3))*.12,y+h,z+(.5-hash(seed,4))*.12],N=7,low=[],high=[];for(let i=0;i<N;i++){const a=i*TAU/N,rr=r*(.72+hash(seed,i)*.45);low.push([x+Math.cos(a)*rr,y,z+Math.sin(a)*rr]);high.push([x+Math.cos(a)*rr*.63,y+h*(.62+hash(seed,i+11)*.28),z+Math.sin(a)*rr*.63]);}for(let i=0;i<N;i++){const j=(i+1)%N;this.quad(low[i],high[i],high[j],low[j]);this.quad(high[i],top,high[j],high[j]);}}
 finish(pc,device){if(!this.i.length)return null;const mesh=new pc.Mesh(device);mesh.setPositions(this.p);mesh.setNormals(this.n);mesh.setUvs(0,this.uv);mesh.setIndices(this.i);mesh.update();return mesh;}
}

function noiseTexture(pc,device,base,kind){
 const size=128,canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),img=ctx.createImageData(size,size),rgb=[1,3,5].map(i=>parseInt(base.slice(i,i+2),16));
 const noise=(x,y,cells,salt)=>{const xx=x*cells/size,yy=y*cells/size,ix=Math.floor(xx),iy=Math.floor(yy),fx=xx-ix,fy=yy-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),v=(a,b)=>hash((ix+a)%cells,(iy+b)%cells,salt),a=v(0,0)*(1-sx)+v(1,0)*sx,b=v(0,1)*(1-sx)+v(1,1)*sx;return a*(1-sy)+b*sy;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const n=(noise(x,y,4,kind.length)-.5)*18+(noise(x,y,13,kind.length+2)-.5)*10+(hash(x,y,kind.length+4)-.5)*5;const i=(y*size+x)*4;for(let k=0;k<3;k++)img.data[i+k]=Math.max(0,Math.min(255,rgb[k]+n));img.data[i+3]=255;}
 ctx.putImageData(img,0,0);
 if(kind==='stone'){
  const cols=23,step=size/cols;ctx.lineWidth=.8;
  for(let row=-1;row<=cols;row++)for(let col=-1;col<=cols;col++){const x=(col+(row%2)*.48)*step,y=row*step,j=hash(col,row,91);ctx.fillStyle=j>.5?'rgba(255,246,223,.065)':'rgba(68,65,54,.035)';ctx.strokeStyle='rgba(91,86,72,.17)';ctx.beginPath();ctx.moveTo(x+.6,y+.7);ctx.lineTo(x+step-.8,y+.3+hash(col,row,92)*.7);ctx.lineTo(x+step-.4,y+step-.8);ctx.lineTo(x+.3,y+step-.5);ctx.closePath();ctx.fill();ctx.stroke();}
 }
 if(kind==='roof'){
  // Baked clay imbrices: staggered rows, warm crowns and dark curved joints.
  for(let row=-1;row<13;row++)for(let col=-1;col<13;col++){const w=size/12,h=size/12,x=(col+(row%2)*.5)*w,y=row*h,v=hash(col,row,72);ctx.fillStyle=`rgba(255,211,153,${.025+v*.06})`;ctx.fillRect(x+1,y+1,w-2,h-2);ctx.strokeStyle='rgba(78,39,28,.2)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x+.7,y+.6);ctx.lineTo(x+.7,y+h*.7);ctx.quadraticCurveTo(x+w/2,y+h+1,x+w-.7,y+h*.7);ctx.lineTo(x+w-.7,y+.6);ctx.stroke();}
 }
 if(kind==='cave'){ctx.strokeStyle='rgba(50,46,39,.1)';ctx.lineWidth=1;for(let i=0;i<32;i++){const x=hash(i,3)*size,y=hash(i,4)*size;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+hash(i,5)*18-9,y+hash(i,6)*16-8);ctx.stroke();}}
 const tex=new pc.Texture(device,{width:size,height:size,mipmaps:true,minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_REPEAT,addressV:pc.ADDRESS_REPEAT});tex.setSource(canvas);return tex;
}

export function createWorld(pc,app,bridge){
 const root=new pc.Entity('Terreno de Valadares');app.root.addChild(root);
 const scenery=createScenery(pc,app);
 const houses=bridge.getBuildings?.()||[];
 const materials=new Map(),textures=[],chunks=new Map();let mapRef=null,floor=-1,propSignature='',expeditionTheme=null,created=0,waterClock=0,sceneryVersion=-1;
 function mat(name,variant=0){const key=name+':'+variant;if(materials.has(key))return materials.get(key);const colors=PAL[name]||PAL.stone,hex=colors[variant%colors.length],m=new pc.StandardMaterial(),textured=['grass','dirt','stone','cave','snow','sand','cliff','roof','water','forgeFloor'].includes(name);m.diffuse=textured?new pc.Color(1,1,1):hexColor(pc,hex);m.ambient=textured?new pc.Color(1,1,1):hexColor(pc,hex);m.gloss=(name==='water'||name==='jade')?.45:.1;m.useMetalness=true;m.metalness=name==='copper'?.55:name==='forgeSteel'?.35:0;
  if(textured){const tex=noiseTexture(pc,app.graphicsDevice,hex,name);textures.push(tex);m.diffuseMap=tex;}
   if(name==='ember'||name==='jade'||name==='window'||name==='forgeGlow'){m.emissive=hexColor(pc,hex);m.emissiveIntensity=name==='ember'?1.6:name==='forgeGlow'?1.15:name==='window'?.32:.45;}
  m.update();materials.set(key,m);return m;}
 const kind={0:'grass',1:'dirt',2:'grass',3:'water',4:'stone',5:'cave',6:'cave',7:'snow',8:'sand'};
 const get=(map,x,z)=>x<0||z<0||x>=bridge.M_W||z>=bridge.M_H?6:(map[z]?.[x]??6);
 const forgotten=()=>floor>=8000&&floor<9000&&expeditionTheme==='forja_esquecida';
 function forgottenTile(groups,map,x,z,node){
  const t=get(map,x,z),cx=x+.5,cz=z+.5,g=(k,v=0)=>{const key=k+':'+v;let geo=groups.get(key);if(!geo){geo=new Geometry();groups.set(key,geo);}return geo;};
  if(t===5){
   // Plates, rivets and warm seams are visual only; every server walkable tile stays open.
   const plate=g('forgeSteel',Math.floor(hash(x,z,44)*2));plate.box(cx,-.027,cz,.88,.009,.88);
   if((x+z)%2===0){const seam=g('copper',0);seam.box(cx,-.016,z+.09,.82,.004,.015);seam.box(x+.09,-.016,cz,.015,.004,.82);}
   if(z>=49&&z<=51&&((x>=48&&x<=53)||(x>=64&&x<=67))){
    const lane=g('forgeFloor',1);lane.box(cx,-.013,cz,.72,.004,.72);
    if(z===49||z===51)g('copper',1).box(cx,-.007,z+(z===49?.12:.88),.88,.004,.024);
   }
   if((x===44&&z===50)||(x===58&&z===50)||(x===70&&z===50)){
    // Flush room marks aid wayfinding without lifting the player or covering mobs.
    const ring=g('copper',0);for(const sx of [-1,1])ring.box(cx+sx*.27,-.008,cz,.025,.004,.55);
    for(const sz of [-1,1])ring.box(cx,-.008,cz+sz*.27,.55,.004,.025);
   }
   return;
  }
  if(t!==6)return;
  const north=get(map,x,z+1)===5,south=get(map,x,z-1)===5,
    east=get(map,x+1,z)===5,west=get(map,x-1,z)===5;
  if(!north&&!south&&!east&&!west)return;
  // Low southern parapets preserve the isometric line of sight into each room.
  const height=south ? .27 : north ? .78 : .52;
  g('forgeWall',Math.floor(hash(x,z,50)*2)).box(cx,-.035,cz,.96,height,.96);
  g('forgeSteel',0).box(cx,height-.03,cz,.98,.065,.98);
  if(north&&((x===44&&z===44)||(x===59&&z===43)||(x===70&&z===45))){
   g('forgeGlow',0).box(cx,height+.039,cz,.24,.045,.24);
   scenery.place('litTorch',node,cx,height+.08,cz,.31,0,false);
  }
  if(south&&((x===45&&z===56)||(x===61&&z===57)||(x===71&&z===55)))
   scenery.place('rubble',node,cx,height+.03,cz,.29,hash(x,z,51)*360,false);
 }
 function drawTile(groups,map,x,z,isDungeon,house,node){
  const t=get(map,x,z),v=Math.floor(hash(x,z,1)*3),name=forgotten()?(t===5?'forgeFloor':'forgeWall'):(kind[t]||'grass'),g=(k,variant=0)=>{const key=k+':'+variant;let p=groups.get(key);if(!p){p=new Geometry();groups.set(key,p);}return p;};
  const cx=x+.5,cz=z+.5,edge=.501;
  // World-space UVs keep the same broad, soft texture across tile boundaries.
  const ground=g(name,0),surface=t===3?.004:-.035,u=x/10,q=z/10;
  ground.quad([cx-edge,surface,cz-edge],[cx-edge,surface,cz+edge],[cx+edge,surface,cz+edge],[cx+edge,surface,cz-edge],[u,q,u,q+.1,u+.1,q+.1,u+.1,q]);
  if(forgotten()){forgottenTile(groups,map,x,z,node);return;}
  // The paving is drawn by one world-aligned irregular stone texture; raised
  // squares at every tile made the plaza read as a repeated board.
  if(t===0){const nearRoad=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>[1,4].includes(get(map,x+dx,z+dz))),roll=hash(x,z,9);
   if(!isDungeon&&roll>.978)scenery.place(['bush','bushAlt','bushSmall','bushWide'][Math.floor(hash(x,z,2)*4)],node,cx,-.015,cz,1.4,hash(x,z,3)*360,false);
   if(roll>(nearRoad?.69:.91)){const px=x+.22+hash(x,z,10)*.55,pz=z+.22+hash(x,z,11)*.55,leaf=g('leaf',1);for(let i=0;i<3;i++){const a=i*TAU/3+hash(x,z,12);leaf.cone(px+Math.cos(a)*.07,-.018,pz+Math.sin(a)*.07,.115,.16,5,a);}if(hash(x,z,13)>.54){const bloom=g('ivory',0),heart=g('copper',0);for(let i=0;i<4;i++){const a=i*TAU/4;bloom.cone(px+Math.cos(a)*.036,.12,pz+Math.sin(a)*.036,.032,.052,5);}heart.cone(px,.13,pz,.018,.045,5);}}
   else if(hash(x,z,14)>.68){const turf=g('leaf',0),px=x+.18+hash(x,z,15)*.64,pz=z+.18+hash(x,z,16)*.64;turf.cone(px,-.012,pz,.055,.08,5);}
  }
  if((t===7||t===8)&&hash(x,z,9)>.77){const p=g(t===7?'snow':'sand',0),px=x+.2+hash(x,z,10)*.6,pz=z+.2+hash(x,z,13)*.6;p.cone(px,-.012,pz,.11,.035,5,hash(x,z,14)*TAU);}
  if(t===1&&hash(x,z,7)>.88){g('stone',0).rock(x+.25+hash(x,z,1)*.5,0,z+.25+hash(x,z,3)*.5,.05,.02,x+z);}
  if(t===2&&!house){const tree=z<33?['treePine','treePineAlt','treePineDense','treePineBlue','treePineBlueAlt'][Math.floor(hash(x,z,3)*5)]:['treeOak','treeTall','treeRound','treeBroad','treeBare'][Math.floor(hash(x,z,3)*5)];
   const placed=!isDungeon&&scenery.place(tree,node,cx,-.005,cz,.49+(hash(x,z,5)-.5)*.07,hash(x,z,6)*360,hash(x,z,18)>.65);
   if(!placed){const trunk=g('bark',0),leaves=g(z<33?'pine':'leaf',v),tilt=(hash(x,z,2)-.5)*.14;trunk.box(cx+tilt,0,cz,.2,1.45,.19,tilt);
   if(z<33){for(let i=0;i<3;i++)leaves.cone(cx+tilt,1.05+i*.39,cz,.69-i*.13,.76,8,hash(x,z,i+6));}
   else{leaves.crown(cx+tilt,1.12,cz,.72,1.26,x*101+z);if(hash(x,z,8)>.35){leaves.crown(cx+tilt-.42,1.35,cz+.22,.44,.83,z*41+x);leaves.crown(cx+tilt+.4,1.42,cz-.14,.42,.79,x*17+z);}}}
  }
  if(t===3&&hash(x,z,7)>.78){const line=g('foam',0),zz=z+.24+hash(x,z,2)*.5,xx=x+.12+hash(x,z,3)*.44;line.box(xx,.008,zz,.18,.003,.012,(hash(x,z,5)-.5)*.38);}
  if(t===5&&hash(x,z,7)>.35&&!scenery.place(['rockAlt','rockRuin','rockCave'][Math.floor(hash(x,z,8)*3)],node,cx+(hash(x,z,8)-.5)*.5,-.01,cz+(hash(x,z,9)-.5)*.5,.17,hash(x,z,10)*360)){const r=g('cliff',v);r.rock(cx+(hash(x,z,8)-.5)*.5,-.02,cz+(hash(x,z,9)-.5)*.5,.08,.035,x+z);}
  if(t===6){const cliffStyle=['rock','rockAlt','rockLarge','rockRuin','rockCave'][Math.floor(hash(x,z,7)*5)],placed=scenery.place(cliffStyle,node,cx,-.025,cz,2.15+(hash(x,z,5)-.5)*.35,hash(x,z,6)*360);
   if(!placed){const stone=g('cliff',v),accent=g('dark',v%2);stone.rock(cx,-.025,cz,.48,1.05+hash(x,z,5)*.45,x*97+z);accent.rock(cx+.13,.53,cz-.09,.19,.55,z*53+x);if(hash(x,z,11)>.87){const moss=g('leaf',v);moss.cone(cx,.96,cz,.16,.14,5);}}
   if(!isDungeon&&hash(x,z,22)>.994)scenery.place('ruinedWall',node,cx,0,cz,.32,hash(x,z,23)*360);
   if(isDungeon&&hash(x,z,24)>.968)scenery.place(['pillar','scaffold','rubble'][Math.floor(hash(x,z,25)*3)],node,cx,0,cz,.22,hash(x,z,26)*360);
   if(isDungeon&&hash(x,z,27)>.82){const edge=[[0,1,0],[1,0,90],[0,-1,180],[-1,0,270]].find(([dx,dz])=>get(map,x+dx,z+dz)===5);if(edge)scenery.place(hash(x,z,28)>.5?'crackedWall':'candleWall',node,cx,0,cz,.27,edge[2]);}
   if(isDungeon&&hash(x,z,29)>.981)scenery.place('ore',node,cx+.12,0,cz-.12,.17,hash(x,z,30)*360);
  }
  if(t===7&&hash(x,z,12)>.77&&!scenery.place('rock',node,cx,-.02,cz,.35,hash(x,z,13)*360)){const rock=g('cliff',v);rock.rock(cx,-.02,cz,.14,.12,x+z);}
  if(t===8&&hash(x,z,12)>.85){const scrub=g('leaf',v);scrub.cone(cx,-.01,cz,.09,.19,5);}
  if(isDungeon&&t===5){if((x===42||x===50||x===58)&&(z===42||z===50||z===58)&&!(x===50&&z===50)){if(!scenery.place('litTorch',node,cx,.01,cz,.27,0)){const base=g('dark',0),fire=g('ember',0);base.box(cx,.005,cz,.19,.42,.19);fire.cone(cx,.43,cz,.11,.27,6);}}}
 }
 function seam(groups,map,x,z,axis){const tx=x+(axis==='x'),tz=z+(axis==='z');if(tx>=bridge.M_W||tz>=bridge.M_H)return;const a=get(map,x,z),b=get(map,tx,tz),ka=kind[a],kb=kind[b];if(ka===kb)return;
  const water=a===3||b===3,land=a===3?kb:ka,material=water?(land==='grass'||land==='dirt'?'sand':land==='cave'?'cliff':land):ka,key=material+':0';let geo=groups.get(key);if(!geo){geo=new Geometry();groups.set(key,geo);}const y=water?.013:-.014;
  // A four-step, varying shoreline covers the square categorical map edge.
  for(let i=0;i<4;i++){const t0=i/4,t1=(i+1)/4,w0=.07+hash(axis==='x'?x+1:(x+t0)*4,axis==='x'?(z+t0)*4:z+1,39)*.14,w1=.07+hash(axis==='x'?x+1:(x+t1)*4,axis==='x'?(z+t1)*4:z+1,39)*.14;
   if(axis==='x'){const edge=x+1,z0=z+t0,z1=z+t1;if(a===3){const near=edge+.075;geo.quad([edge-w0,y,z0],[edge-w1,y,z1],[near,y,z1],[near,y,z0]);}else{const near=edge-.075;geo.quad([near,y,z0],[near,y,z1],[edge+w1,y,z1],[edge+w0,y,z0]);}}
   else{const edge=z+1,x0=x+t0,x1=x+t1;if(a===3){const near=edge+.075;geo.quad([x0,y,edge-w0],[x0,y,near],[x1,y,near],[x1,y,edge-w1]);}else{const near=edge-.075;geo.quad([x0,y,near],[x0,y,edge+w0],[x1,y,edge+w1],[x1,y,near]);}}
  }
 }
 function prop(groups,p,node){const x=Number(p.x),z=Number(p.y);if(!Number.isFinite(x)||!Number.isFinite(z))return;const cx=x+.5,cz=z+.5,g=(k,v=0)=>{const key=k+':'+v;let b=groups.get(key);if(!b){b=new Geometry();groups.set(key,b);}return b;};
  if(p.kind==='chest'&&scenery.place('chest',node,cx,.02,cz,.32))return;
  if(p.kind==='chest'){g('wood',0).box(cx,.025,cz,.48,.31,.37);g('roof',0).box(cx,.34,cz,.52,.13,.4);const trim=g('copper',0);trim.box(cx-.17,.09,cz,.04,.48,.4);trim.box(cx+.17,.09,cz,.04,.48,.4);trim.box(cx,.24,cz+.205,.12,.09,.025);g('jade',0).box(cx,.26,cz+.226,.045,.045,.025);}
  if(p.kind==='altar'){const stone=g('ivory',0),jade=g('jade',0),gold=g('copper',0);stone.box(cx,.02,cz,.62,.18,.61);stone.box(cx,.22,cz,.43,.52,.43);jade.box(cx,.745,cz,.32,.035,.32);for(const a of [0,Math.PI/2,Math.PI,3*Math.PI/2]){const px=cx+Math.cos(a)*.27,pz=cz+Math.sin(a)*.27;gold.cone(px,.75,pz,.05,.16,5);}for(const dx of [-.36,.36])scenery.place('candle',node,cx+dx,.66,cz-.12,.15,0,false);}
  if(p.kind==='craft'){const wood=g('wood',0),iron=g('dark',0),fire=g('ember',0);if(!scenery.place('table',node,cx,.01,cz,.47)){for(const dx of [-.23,.23])for(const dz of [-.17,.17])wood.box(cx+dx,.01,cz+dz,.07,.4,.07);wood.box(cx,.39,cz,.61,.09,.44);}iron.box(cx+.12,.49,cz,.3,.07,.23);fire.cone(cx-.18,.48,cz,.09,.22,6);scenery.place('pickaxe',node,cx-.25,.47,cz-.13,.18,65,false);}
  if(p.kind==='dummy'){
   if(scenery.place('trainingDummy',node,cx,.01,cz,.58))return;
   const timber=g('wood',0),linen=g('linen',0),seam=g('linen',1),straw=g('straw',0),strawLight=g('straw',1),belt=g('dark',0),teal=g('teal',0),ivory=g('ivory',1);
   // The post and foot stay inside the original service tile; padding gives it a human silhouette.
   timber.box(cx,.01,cz,.51,.08,.28);timber.box(cx,.06,cz,.09,1.28,.09);
   timber.box(cx,.62,cz,.67,.07,.08);timber.box(cx,.1,cz,.08,.74,.08);
   for(const side of [-1,1]){
    const ax=cx+side*.4;straw.box(ax,.34,cz,.11,.12,.11);
    linen.box(ax,.64,cz,.15,.43,.2,side*.18);seam.box(ax,.99,cz,.18,.065,.22,side*.18);
    timber.box(cx+side*.18,.08,cz,.075,.28,.08);
   }
   linen.box(cx,.48,cz,.46,.54,.27);seam.box(cx,.99,cz,.43,.08,.27);
   belt.box(cx,.53,cz+.143,.47,.075,.025);ivory.box(cx,.555,cz+.165,.075,.08,.018);
   straw.box(cx,1.09,cz,.27,.26,.25);strawLight.cone(cx,1.34,cz,.155,.11,8);
   teal.box(cx,1.19,cz+.132,.23,.055,.018);
   // Concentric stitched rings face the approach from the room and the plaza.
   for(const face of [-1,1]){
    const front=cz+face*.148,cy=.79;
    for(const [outer,inner,material] of [[.18,.135,teal],[.135,.082,ivory],[.082,.035,teal]])for(let i=0;i<16;i++){
     const a=i*TAU/16,b=(i+1)*TAU/16,point=(r,t)=>[cx+Math.cos(t)*r,cy+Math.sin(t)*r,front];
     material.quad(point(outer,a),point(outer,b),point(inner,b),point(inner,a));
    }
    strawLight.box(cx,cy-.024,front+face*.004,.055,.055,.012);
   }
  }
 }
 function house(groups,h,node){const g=(k,v=0)=>{const key=k+':'+v;let b=groups.get(key);if(!b){b=new Geometry();groups.set(key,b);}return b;};
  const x=h.x+h.w/2,z=h.y+h.h/2,w=h.w-.22,d=h.h-.22,front=z+d/2,wall=g('ivory',0),stone=g('stone',0),timber=g('wood',0),dark=g('dark',0),roof=g('roof',h.id==='oficina'?1:0),copper=g('copper',0),warm=g('ember',0),glass=g('window',0);
  // The enlarged portal fits the existing gable. Raising the eaves hid actors
  // behind the rear corners, so preserve the original roof and footprint.
  const eave=1.77,ridge=2.58,room=(bridge.getInteriors?.()||[]).find(r=>r.id===h.id),doorX=room?room.door.x+.5:x;
  stone.box(x,.005,z,w+.08,.33,d+.08,0,true);wall.box(x,.33,z,w,eave-.33,d,0,true);
  const mortar=g('mortar',0);
  for(const yy of [.12,.225,.325]){mortar.box(x,yy,front+.042,w+.08,.012,.012);for(const side of [-1,1])mortar.box(x+side*(w/2+.042),yy,z,.012,.012,d+.08);}
  for(let row=0;row<2;row++){const count=Math.floor(w/.31),step=w/count;for(let col=1;col<count;col++){const px=x-w/2+col*step+(row?.08:0);if(px<x+w/2-.08)mortar.box(px,.045+row*.11,front+.049,.012,.092,.012);}}
  // Front rails stop before the stone portal; none crosses its arch or leaf.
  for(const sx of [-1,1])for(const sz of [-1,1])timber.box(x+sx*(w/2-.07),.34,z+sz*(d/2-.07),.095,eave-.34,.095);
  for(const y of [.67,1.30,eave-.08]){
   const left=x-w/2,right=x+w/2,stopLeft=doorX-.68,stopRight=doorX+.68;
   if(stopLeft>left)timber.box((left+stopLeft)/2,y,front+.012,stopLeft-left,.045,.045);
   if(right>stopRight)timber.box((right+stopRight)/2,y,front+.012,right-stopRight,.045,.045);
   timber.box(x,y,z-d/2-.012,w,.045,.045);
  }
  const half=w/2+.16,depth=d/2+.2;
  roof.quad([x-half,eave,z-depth],[x-half,eave,z+depth],[x,ridge,z+depth],[x,ridge,z-depth]);
  roof.quad([x,ridge,z-depth],[x,ridge,z+depth],[x+half,eave,z+depth],[x+half,eave,z-depth]);
  const rows=Math.ceil(Math.hypot(half,ridge-eave)/.2),columns=Math.ceil(depth*2/.28),tileDepth=depth*2/columns;
  for(const side of [-1,1])for(let row=0;row<rows;row++)for(let col=-1;col<=columns;col++){
   const za=Math.max(z-depth+.018,z-depth+col*tileDepth+(row%2)*tileDepth/2+.011),zb=Math.min(z+depth-.018,z-depth+(col+1)*tileDepth+(row%2)*tileDepth/2-.015);if(zb<=za)continue;
   const t0=(row+.065)/rows,t1=(row+.92)/rows,rise=t=>ridge-(ridge-eave)*t+.02,p=(t,zz)=>[x+side*half*t,rise(t),zz],shade=Math.floor(hash(col+20,row+20,h.x+h.y)*3),tile=g('clay',shade);
   if(side<0)tile.quad(p(t1,za),p(t1,zb),p(t0,zb),p(t0,za));else tile.quad(p(t0,za),p(t0,zb),p(t1,zb),p(t1,za));
  }
  wall.quad([x-w/2,eave,front],[x+w/2,eave,front],[x,ridge-.05,front],[x,ridge-.05,front]);
  wall.quad([x+w/2,eave,z-d/2],[x-w/2,eave,z-d/2],[x,ridge-.05,z-d/2],[x,ridge-.05,z-d/2]);
  copper.box(x,ridge-.012,z,.09,.06,d+.43);
  const face=front+.04,door=g('wood',1),bottom=.14,archY=1.40,inner=.55,outer=.65,leaf=.525,archFace=face+.095;
  dark.box(doorX,bottom,face,inner*2,archY-bottom,.065);
  door.box(doorX,bottom+.005,face+.067,leaf*2,archY-bottom,.046,0,true);
  for(let i=0;i<12;i++){
   const a=i*Math.PI/12,b=(i+1)*Math.PI/12,point=(r,t,depth=archFace)=>[doorX+Math.cos(t)*r,archY+Math.sin(t)*r,depth];
   dark.quad([doorX,archY,archFace-.012],point(inner,a,archFace-.012),point(inner,b,archFace-.012),point(inner,b,archFace-.012));
   door.quad([doorX,archY,archFace-.005],point(leaf,a,archFace-.005),point(leaf,b,archFace-.005),point(leaf,b,archFace-.005));
   stone.quad(point(inner,a),point(outer,a),point(outer,b),point(inner,b));
  }
  for(const dx of [-.35,-.175,0,.175,.35])timber.box(doorX+dx,bottom+.01,face+.102,.012,archY+Math.sqrt(leaf*leaf-dx*dx)-bottom-.035,.009);
  for(const yy of [.49,1.19])copper.box(doorX,yy,face+.11,1.03,.025,.017);
  copper.box(doorX+.34,.91,face+.125,.045,.06,.035);
  for(const dx of [-.60,.60])stone.box(doorX+dx,bottom,archFace,.10,archY-bottom,.08);
  stone.box(doorX,.02,front+.005,1.33,.12,.31);
  // Windows fit the actual remaining bays, including the offset forge door.
  for(const [a,b]of [[x-w/2+.14,doorX-.68],[doorX+.68,x+w/2-.14]]){
   const wx=(a+b)/2,ww=Math.min(.54,b-a-.12);if(ww<.25)continue;
   dark.box(wx,.96,face,ww,.64,.07);glass.box(wx,1.01,face+.041,ww-.10,.52,.021);
   timber.box(wx,.98,face+.066,.025,.60,.026);timber.box(wx,1.26,face+.068,ww,.025,.026);
   for(const side of [-1,1])timber.box(wx+side*(ww/2+.025),.96,face+.064,.045,.64,.045);
   stone.box(wx,1.61,face+.075,ww+.10,.065,.09);
  }
  for(const side of [-1,1]){const px=x+side*(w/2+.013),pz=z-.28;dark.box(px,1.1,pz,.06,.56,.48);glass.box(px+side*.037,1.16,pz,.022,.42,.3);}
  for(const side of [-1,1]){const lx=doorX+side*.77;timber.box(lx,1.79,face+.08,.04,.28,.05);copper.box(lx,1.76,face+.115,.16,.16,.14);warm.box(lx,1.79,face+.202,.085,.10,.02);}
  const chimneyX=x-w*.27,chimneyZ=z-d*.21;stone.box(chimneyX,1.42,chimneyZ,.4,1.42,.39);copper.box(chimneyX,2.82,chimneyZ,.51,.11,.5);
  scenery.place('banner',node,x,2.025,front+.11,.12,0);
  // Ground props here were miniature; enlarging them would occupy walkable
  // approach tiles without server collision. Keep the frontage clear instead.
 }
 function interiorTile(groups,x,z){
  if(x<46||x>54||z<46||z>52)return;
  const g=(k,v=0)=>{const key=k+':'+v;let b=groups.get(key);if(!b){b=new Geometry();groups.set(key,b);}return b;};
  const tavern=floor===1000,temple=floor===1002,training=floor===1003,cx=x+.5,cz=z+.5;
  const plank=tavern?g('wood',0):training?g('stone',1):temple?g('ivory',0):g('stone',0);
  plank.quad([x,-.035,z],[x,-.035,z+1],[x+1,-.035,z+1],[x+1,-.035,z]);
  if(tavern){for(let i=0;i<3;i++)g('mortar',0).box(cx,-.026,z+(i+1)/3,.98,.003,.009);}
  else if(training){
   const grout=g('mortar',0),wood=g('wood',0);
   grout.box(cx,-.028,cz,.94,.003,.012);grout.box(cx,-.028,cz,.012,.003,.94);
   if(x===47||x===53){wood.box(cx,-.026,cz,.79,.006,.94);for(const zz of [z+.27,z+.72])grout.box(cx,-.022,zz,.77,.003,.012);}
  }
  else if((x+z)%2===0)g('mortar',0).box(cx,-.027,cz,.68,.003,.68);
  if(temple&&x>46&&x<54&&z>46&&z<52&&((x===48||x===52)||(z===48&&x!==50))){g('jade',0).box(cx,-.022,cz,.13,.004,.13);}
  const wall=tavern||temple||training?g('ivory',0):g('cliff',0),beam=g('wood',0),base=g(temple?'jade':'stone',0);
  if(z===46){const recess=x===50&&floor!==1000,back=recess?z+.09:cz,depth=recess?.18:.86;wall.box(cx,0,back,.99,1.75,depth);base.box(cx,0,back,.99,.27,depth+.04);beam.box(cx,1.62,back,.99,.12,depth+.08);}
  if(z===52&&x!==50){wall.box(cx,0,cz,.99,.43,.82);base.box(cx,0,cz,.99,.15,.84);}
  if((x===46||x===54)&&z>46&&z<52){wall.box(cx,0,cz,.86,.85,.99);base.box(cx,0,cz,.88,.2,.99);}
  if(x===50&&z===52){g('copper',0).box(cx,-.022,z+.14,.78,.014,.24);}
  if((x===46||x===54)&&z%2===0)beam.box(cx,.18,cz,.06,.98,.09);
 }
 function interiorFurnishings(groups,node,room){
  const tavern=floor===1000,g=(k,v=0)=>{const key=k+':'+v;let b=groups.get(key);if(!b){b=new Geometry();groups.set(key,b);}return b;};
  if(tavern){
   // Tables occupy only the west alcove; the middle passage to the door is open.
   scenery.place('table',node,48.25,0,48.4,.60,0);
   scenery.place('chair',node,47.25,0,48.4,.55,90);
   scenery.place('chair',node,49.1,0,48.4,.55,270);
   scenery.place('counter',node,53.5,0,48.5,.55,90);
   scenery.place('barrelStack',node,53.35,0,50.4,.32,0);
   scenery.place('torch',node,47.05,1.08,47.55,.28,90);
   scenery.place('bed',node,47.75,0,50.5,.50,90);
   scenery.place('bed',node,48.25,0,51.5,.50,90);
   scenery.place('roundTable',node,52.77,0,50.45,.52,0);
   scenery.place('roundStool',node,52.24,0,50.74,.60,0);
   scenery.place('food',node,48.25,.61,48.4,.15,0,false);
   scenery.place('bottle',node,53.5,.56,48.3,.2,0,false);
   scenery.place('candle',node,53.5,.56,48.7,.18,0,false);
   g('ember',0).box(53.26,.68,47.23,.11,.28,.08);
  }else if(floor===1001){
   // Furnace glow and anvil silhouette are composed from the existing materials.
   const stone=g('stone',0),iron=g('dark',0),fire=g('ember',0),copper=g('copper',0);
   stone.box(53.5,0,47.55,.85,1.02,.8);
   iron.box(53.5,.29,48.01,.59,.48,.08);
   fire.box(53.5,.34,48.067,.43,.32,.028);
   copper.box(53.5,1.03,47.55,.19,.68,.19);
   iron.box(48.5,.18,48.5,.55,.28,.27);
   iron.box(48.5,.43,48.5,.85,.12,.37);
   scenery.place('barrel',node,47.5,0,50.5,.4,0);
   scenery.place('crates',node,53.4,0,50.4,.28,0);
   scenery.place('torch',node,47.06,1.08,47.56,.28,90);
   scenery.place('pickaxeBucket',node,47.6,0,49.4,.3,20);
   scenery.place('ore',node,53.45,0,49.4,.22,0);
   scenery.place('scaffold',node,47.5,0,48.5,.25,90);
   scenery.place('decoratedShelves',node,53.4,0,51.3,.28,270);
  }else if(floor===1002){
   // The active altar is placed below from room.services, on the north wall.
   const jade=g('jade',0),ivory=g('ivory',0),copper=g('copper',0);
   for(const x of [47.45,53.55]){ivory.box(x,.02,47.52,.24,.91,.24);copper.box(x,.94,47.52,.33,.1,.33);jade.box(x,1.04,47.52,.17,.16,.17);}
   for(const x of [48.2,52.8])scenery.place('banner',node,x,1.23,46.95,.17,0);
   for(const x of [48.5,52.5])scenery.place('bookcase',node,x,0,47.5,.35,0);
   for(const x of [48.5,52.5])scenery.place('bookcaseSmall',node,x,0,50.6,.30,0);
   scenery.place('roundTable',node,48.5,0,49.5,.50,0);
   scenery.place('roundTable',node,52.5,0,49.5,.50,0);
   scenery.place('bookShelf',node,48.0,.85,46.95,.22,0);
   scenery.place('blueBanner',node,52.4,1.25,46.95,.17,0);
   scenery.place('candle',node,48.5,.51,49.5,.13,0,false);
   scenery.place('candle',node,52.5,.51,49.5,.13,0,false);
   jade.box(50.5,-.018,48.9,.1,.006,1.7);
   jade.box(50.5,-.018,50.55,.1,.006,.67);
  }else if(floor===1003){
   const wood=g('wood',0),iron=g('dark',0),copper=g('copper',0),blue=g('blue',0),teal=g('teal',1),ivory=g('ivory',1);
   // A training rack and heraldry frame the target without occupying the lane.
   for(const x of [47.7,53.3]){wood.box(x,.02,47.55,.08,1.35,.08);copper.box(x,1.36,47.55,.21,.08,.16);}
   wood.box(48.25,.78,46.99,1.16,.08,.08);
   for(const x of [47.97,48.5]){iron.box(x,.45,47.04,.035,.82,.045);copper.box(x,.91,47.07,.19,.055,.07);}
   for(const x of [48.65,52.35]){
    wood.box(x,1.56,46.965,.72,.055,.09);
    blue.box(x,.83,47.015,.58,.71,.025);
    teal.box(x,1.52,47.032,.58,.075,.029);
    ivory.box(x,1.12,47.036,.075,.35,.012);
    ivory.box(x,1.26,47.036,.31,.065,.012);
    copper.box(x,.77,47.037,.18,.06,.024);
   }
   scenery.place('barrel',node,53.28,0,49.6,.3,0);
   scenery.place('swordShield',node,47.05,1.0,49.15,.23,90,false);
   scenery.place('longTable',node,52.8,0,50.5,.50,90);
   scenery.place('pillar',node,47.45,0,50.7,.18,0);
  }
  for(const service of room?.services||[])if(['craft','altar','dummy'].includes(service.kind))prop(groups,service,node);
 }
 function interiorRoom(level=floor){
  const current=bridge.getInterior?.();
  if(current&&typeof current==='object'&&current.floor===level)return current;
  const rooms=bridge.getInteriors?.()||globalThis.ValadaresWorld?.interiors||[];
  return Array.isArray(rooms)?rooms.find(r=>r.floor===level)||null:null;
 }
 function forgottenFeatures(groups,node,cx,cz){
  const g=(k,v=0)=>{const key=k+':'+v;let geo=groups.get(key);if(!geo){geo=new Geometry();groups.set(key,geo);}return geo;};
  const light=(name,x,z,color,intensity,range)=>{const e=new pc.Entity(name);e.addComponent('light',{type:'omni',color:hexColor(pc,color),intensity,range,castShadows:false});e.setPosition(x,1.85,z);node.addChild(e);};
  if(cx===3&&cz===4){
   // Arrival room: broken masonry at the outside edge, never on the entrance or patrol tiles.
   scenery.place('ruinedWall',node,41.55,.44,47.55,.38,90,false);
   scenery.place('barrel',node,41.55,.44,53.45,.30,0,false);
   scenery.place('ore',node,46.50,.31,56.50,.19,30,false);
   light('Brasa da entrada',44.5,48.3,'#efad73',.46,6.2);
  }
  if(cx===4&&cz===4){
   // Furnace stays on the western wall, visible from the workshop without occupying its floor.
   const x=53.5,z=47.5,wall=g('forgeWall',1),steel=g('forgeSteel',0),fire=g('forgeGlow',0),dark=g('dark',0);
   wall.box(x,.73,z,.88,.98,.81);steel.box(x,1.68,z,.98,.12,.92);
   dark.box(x,1.06,z+.422,.68,.55,.045);fire.box(x,1.13,z+.45,.49,.36,.025);
   steel.box(x-.30,1.68,z,.12,.54,.12);steel.box(x+.30,1.68,z,.12,.54,.12);
   for(const dx of [-.21,0,.21])fire.box(x+dx,1.57,z+.47,.11,.07,.02);
   scenery.place('scaffold',node,53.5,.46,45.5,.32,90,false);
   scenery.place('pickaxeBucket',node,62.5,.31,57.5,.32,25,false);
   scenery.place('crates',node,55.5,.31,57.5,.28,0,false);
   scenery.place('ore',node,62.5,.31,43.5,.20,0,false);
   light('Fornalha esquecida',55.5,48.3,'#ff9a54',.88,7.4);
  }
  if(cx===5&&cz===4){
   // The boss at (70,50) retains the whole floor around it.
   scenery.place('pillar',node,68.5,.79,45.5,.32,0,false);
   scenery.place('pillar',node,72.5,.79,45.5,.32,0,false);
   scenery.place('rubble',node,73.5,.47,48.5,.28,30,false);
   const steel=g('forgeSteel',1),glow=g('forgeGlow',1);
   steel.box(70.5,.75,45.5,1.10,.13,.49);
   glow.box(70.5,.89,45.68,.83,.055,.055);
   light('Nucleo do guardiao',70.5,48.5,'#eab67d',.54,6.4);
  }
 }
 function build(cx,cz,map){const groups=new Map(),node=new pc.Entity(`Setor ${cx},${cz}`),props=floor===0?(bridge.getProps?.()||[]):[];node._worldMeshes=[];
  const valid=floor===0?houses.filter(h=>{for(let z=h.y;z<h.y+h.h;z++)for(let x=h.x;x<h.x+h.w;x++)if(get(map,x,z)!==2)return false;return true;}):[];
  for(let z=cz*CHUNK;z<(cz+1)*CHUNK;z++)for(let x=cx*CHUNK;x<(cx+1)*CHUNK;x++){if(x<0||z<0||x>=bridge.M_W||z>=bridge.M_H)continue;
   if(floor>=1000&&floor<=1003){interiorTile(groups,x,z);continue;}
   const underHouse=valid.some(h=>x>=h.x&&x<h.x+h.w&&z>=h.y&&z<h.y+h.h);drawTile(groups,map,x,z,floor>0,underHouse,node);seam(groups,map,x,z,'x');seam(groups,map,x,z,'z');}
  if(floor>=1000&&floor<=1003&&cx===4&&cz===4)interiorFurnishings(groups,node,interiorRoom());
  if(forgotten())forgottenFeatures(groups,node,cx,cz);
  for(const h of valid)if(Math.floor((h.x+h.w/2)/CHUNK)===cx&&Math.floor((h.y+h.h/2)/CHUNK)===cz)house(groups,h,node);
  for(const p of props)if(Math.floor(p.x/CHUNK)===cx&&Math.floor(p.y/CHUNK)===cz)prop(groups,p,node);
  for(const [key,geo]of groups){const mesh=geo.finish(pc,app.graphicsDevice);if(!mesh)continue;node._worldMeshes.push(mesh);const e=new pc.Entity(key);e.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,mat(...key.split(':').map((v,i)=>i?Number(v):v)))],castShadows:true,receiveShadows:true});node.addChild(e);}
  root.addChild(node);chunks.set(`${cx}:${cz}`,node);created++;
 }
 function drop(e){e.destroy();for(const mesh of e._worldMeshes||[])mesh.destroy();}
 function update(dt){waterClock+=dt;const water=materials.get('water:0');if(water&&waterClock>=.08){water.diffuseMapOffset.x=(water.diffuseMapOffset.x+waterClock*.007)%1;water.diffuseMapOffset.y=(water.diffuseMapOffset.y+waterClock*.003)%1;water.update();waterClock=0;}const map=bridge.getMap?.(),p=bridge.getPlayer?.();if(!map||!p)return;const nextFloor=bridge.getFloor?.()??p.floor??0,nextExpedition=bridge.getExpedition?.()||null,props=nextFloor===0?(bridge.getProps?.()||[]):[],services=nextFloor>=1000&&nextFloor<=1003?(interiorRoom(nextFloor)?.services||[]):[],sig=[...props,...services].map(p=>`${p.key||p.kind}:${p.x}:${p.y}`).join('|');
  if(map!==mapRef||nextFloor!==floor||nextExpedition!==expeditionTheme||sig!==propSignature||scenery.version!==sceneryVersion){for(const e of chunks.values())drop(e);chunks.clear();mapRef=map;floor=nextFloor;expeditionTheme=nextExpedition;propSignature=sig;sceneryVersion=scenery.version;}
  const cam=bridge.getCamera?.(),px=cam?cam.x+(bridge.VP_W||14)/2:p.x,pz=cam?cam.y+(bridge.VP_H||10)/2:p.y,bounds=bridge.getViewBounds?.()||{minX:px-REACH,maxX:px+REACH,minY:pz-REACH,maxY:pz+REACH};
  const fromX=Math.max(0,Math.floor(bounds.minX/CHUNK)),toX=Math.min(Math.ceil(bridge.M_W/CHUNK)-1,Math.floor(bounds.maxX/CHUNK)),fromZ=Math.max(0,Math.floor(bounds.minY/CHUNK)),toZ=Math.min(Math.ceil(bridge.M_H/CHUNK)-1,Math.floor(bounds.maxY/CHUNK));
  const wanted=new Set();for(let z=fromZ;z<=toZ;z++)for(let x=fromX;x<=toX;x++){const key=`${x}:${z}`;wanted.add(key);if(!chunks.has(key))build(x,z,map);}for(const [key,node]of chunks)if(!wanted.has(key)){drop(node);chunks.delete(key);}
 }
 function destroy(){for(const e of chunks.values())drop(e);chunks.clear();root.destroy();scenery.destroy();for(const m of materials.values())m.destroy();for(const t of textures)t.destroy();materials.clear();textures.length=0;}
 return {update,destroy,diagnostics:()=>({floor,chunks:chunks.size,chunkSize:CHUNK,materials:materials.size,generated:created,mapReady:!!mapRef,scenery:scenery.diagnostics()})};
}
