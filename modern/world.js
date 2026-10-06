// Presentation of the authoritative tile map. Passability and interaction
// remain entirely with play.html and the server.
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
 ember:['#f0a34c','#f8c065'], window:['#d8bc7d'], mortar:['#9e9683'],
 clay:['#b46b4c','#bd7654','#ad6246'], dark:['#302f35','#47444a'], roof:['#a65d40','#b46a49']
};
const hash=(x,z,s=0)=>{let n=Math.imul(x+1013,374761393)+Math.imul(z+37,668265263)+Math.imul(s+7,1274126177);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
const hexColor=(pc,hex)=>new pc.Color().fromString(hex);

// One geometry buffer per material and chunk. The largest nearby scene stays
// under a few hundred draw calls rather than one render component per tile.
class Geometry {
 constructor(){this.p=[];this.n=[];this.uv=[];this.i=[];}
  quad(a,b,c,d,uv=1){const base=this.p.length/3;const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];let nx=u[1]*v[2]-u[2]*v[1],ny=u[2]*v[0]-u[0]*v[2],nz=u[0]*v[1]-u[1]*v[0],l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;for(const p of [a,b,c,d]){this.p.push(...p);this.n.push(nx,ny,nz);}this.uv.push(...(Array.isArray(uv)?uv:[0,0,uv,0,uv,uv,0,uv]));this.i.push(base,base+1,base+2,base,base+2,base+3);}
 box(x,y,z,w,h,d,rotation=0){const c=Math.cos(rotation),s=Math.sin(rotation),corner=(a,b,Y)=>[x+a*c-b*s,Y,z+a*s+b*c],X=w/2,Z=d/2;
  const a=corner(-X,-Z,y),b=corner(X,-Z,y),c0=corner(X,Z,y),d0=corner(-X,Z,y),A=corner(-X,-Z,y+h),B=corner(X,-Z,y+h),C=corner(X,Z,y+h),D=corner(-X,Z,y+h);
  this.quad(A,D,C,B);this.quad(d0,a,b,c0);this.quad(a,A,B,b);this.quad(b,B,C,c0);this.quad(c0,C,D,d0);this.quad(d0,D,A,a);
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
 const houses=bridge.getBuildings?.()||[];
 const materials=new Map(),textures=[],chunks=new Map();let mapRef=null,floor=-1,propSignature='',created=0,waterClock=0;
 function mat(name,variant=0){const key=name+':'+variant;if(materials.has(key))return materials.get(key);const colors=PAL[name]||PAL.stone,hex=colors[variant%colors.length],m=new pc.StandardMaterial(),textured=['grass','dirt','stone','cave','snow','sand','cliff','roof','water'].includes(name);m.diffuse=textured?new pc.Color(1,1,1):hexColor(pc,hex);m.ambient=textured?new pc.Color(1,1,1):hexColor(pc,hex);m.gloss=(name==='water'||name==='jade')?.45:.1;m.useMetalness=true;m.metalness=name==='copper'?.55:0;
  if(textured){const tex=noiseTexture(pc,app.graphicsDevice,hex,name);textures.push(tex);m.diffuseMap=tex;}
   if(name==='ember'||name==='jade'||name==='window'){m.emissive=hexColor(pc,hex);m.emissiveIntensity=name==='ember'?1.6:name==='window'?.32:.45;}
  m.update();materials.set(key,m);return m;}
 const kind={0:'grass',1:'dirt',2:'grass',3:'water',4:'stone',5:'cave',6:'cave',7:'snow',8:'sand'};
 const get=(map,x,z)=>x<0||z<0||x>=bridge.M_W||z>=bridge.M_H?6:(map[z]?.[x]??6);
 function drawTile(groups,map,x,z,isDungeon,house){
  const t=get(map,x,z),v=Math.floor(hash(x,z,1)*3),name=kind[t]||'grass',g=(k,variant=0)=>{const key=k+':'+variant;let p=groups.get(key);if(!p){p=new Geometry();groups.set(key,p);}return p;};
  const cx=x+.5,cz=z+.5,edge=.501;
  // World-space UVs keep the same broad, soft texture across tile boundaries.
  const ground=g(name,0),surface=t===3?.004:-.035,u=x/10,q=z/10;
  ground.quad([cx-edge,surface,cz-edge],[cx-edge,surface,cz+edge],[cx+edge,surface,cz+edge],[cx+edge,surface,cz-edge],[u,q,u,q+.1,u+.1,q+.1,u+.1,q]);
  // The paving is drawn by one world-aligned irregular stone texture; raised
  // squares at every tile made the plaza read as a repeated board.
  if(t===0){const nearRoad=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>[1,4].includes(get(map,x+dx,z+dz))),roll=hash(x,z,9);
   if(roll>(nearRoad?.69:.91)){const px=x+.22+hash(x,z,10)*.55,pz=z+.22+hash(x,z,11)*.55,leaf=g('leaf',1);for(let i=0;i<3;i++){const a=i*TAU/3+hash(x,z,12);leaf.cone(px+Math.cos(a)*.07,-.018,pz+Math.sin(a)*.07,.115,.16,5,a);}if(hash(x,z,13)>.54){const bloom=g('ivory',0),heart=g('copper',0);for(let i=0;i<4;i++){const a=i*TAU/4;bloom.cone(px+Math.cos(a)*.036,.12,pz+Math.sin(a)*.036,.032,.052,5);}heart.cone(px,.13,pz,.018,.045,5);}}
   else if(hash(x,z,14)>.68){const turf=g('leaf',0),px=x+.18+hash(x,z,15)*.64,pz=z+.18+hash(x,z,16)*.64;turf.cone(px,-.012,pz,.055,.08,5);}
  }
  if((t===7||t===8)&&hash(x,z,9)>.77){const p=g(t===7?'snow':'sand',0),px=x+.2+hash(x,z,10)*.6,pz=z+.2+hash(x,z,13)*.6;p.cone(px,-.012,pz,.11,.035,5,hash(x,z,14)*TAU);}
  if(t===1&&hash(x,z,7)>.88){g('stone',0).rock(x+.25+hash(x,z,1)*.5,0,z+.25+hash(x,z,3)*.5,.05,.02,x+z);}
  if(t===2&&!house){const trunk=g('bark',0),leaves=g(z<33?'pine':'leaf',v),tilt=(hash(x,z,2)-.5)*.14;trunk.box(cx+tilt,0,cz,.2,1.45,.19,tilt);
   if(z<33){for(let i=0;i<3;i++)leaves.cone(cx+tilt,1.05+i*.39,cz,.69-i*.13,.76,8,hash(x,z,i+6));}
   else{leaves.crown(cx+tilt,1.12,cz,.72,1.26,x*101+z);if(hash(x,z,8)>.35){leaves.crown(cx+tilt-.42,1.35,cz+.22,.44,.83,z*41+x);leaves.crown(cx+tilt+.4,1.42,cz-.14,.42,.79,x*17+z);}}
  }
  if(t===3&&hash(x,z,7)>.78){const line=g('foam',0),zz=z+.24+hash(x,z,2)*.5,xx=x+.12+hash(x,z,3)*.44;line.box(xx,.008,zz,.18,.003,.012,(hash(x,z,5)-.5)*.38);}
  if(t===5&&hash(x,z,7)>.35){const r=g('cliff',v);r.rock(cx+(hash(x,z,8)-.5)*.5,-.02,cz+(hash(x,z,9)-.5)*.5,.08,.035,x+z);}
  if(t===6){const stone=g('cliff',v),accent=g('dark',v%2);stone.rock(cx,-.025,cz,.48,1.05+hash(x,z,5)*.45,x*97+z);accent.rock(cx+.13,.53,cz-.09,.19,.55,z*53+x);if(hash(x,z,11)>.87){const moss=g('leaf',v);moss.cone(cx,.96,cz,.16,.14,5);}}
  if(t===7&&hash(x,z,12)>.77){const rock=g('cliff',v);rock.rock(cx,-.02,cz,.14,.12,x+z);}
  if(t===8&&hash(x,z,12)>.85){const scrub=g('leaf',v);scrub.cone(cx,-.01,cz,.09,.19,5);}
  if(isDungeon&&t===5){if((x===42||x===50||x===58)&&(z===42||z===50||z===58)&&!(x===50&&z===50)){const base=g('dark',0),fire=g('ember',0);base.box(cx,.005,cz,.19,.42,.19);fire.cone(cx,.43,cz,.11,.27,6);}}
 }
 function seam(groups,map,x,z,axis){const tx=x+(axis==='x'),tz=z+(axis==='z');if(tx>=bridge.M_W||tz>=bridge.M_H)return;const a=get(map,x,z),b=get(map,tx,tz),ka=kind[a],kb=kind[b];if(ka===kb)return;
  const water=a===3||b===3,land=a===3?kb:ka,material=water?(land==='grass'||land==='dirt'?'sand':land==='cave'?'cliff':land):ka,key=material+':0';let geo=groups.get(key);if(!geo){geo=new Geometry();groups.set(key,geo);}const y=water?.013:-.014;
  // A four-step, varying shoreline covers the square categorical map edge.
  for(let i=0;i<4;i++){const t0=i/4,t1=(i+1)/4,w0=.07+hash(axis==='x'?x+1:(x+t0)*4,axis==='x'?(z+t0)*4:z+1,39)*.14,w1=.07+hash(axis==='x'?x+1:(x+t1)*4,axis==='x'?(z+t1)*4:z+1,39)*.14;
   if(axis==='x'){const edge=x+1,z0=z+t0,z1=z+t1;if(a===3){const near=edge+.075;geo.quad([edge-w0,y,z0],[edge-w1,y,z1],[near,y,z1],[near,y,z0]);}else{const near=edge-.075;geo.quad([near,y,z0],[near,y,z1],[edge+w1,y,z1],[edge+w0,y,z0]);}}
   else{const edge=z+1,x0=x+t0,x1=x+t1;if(a===3){const near=edge+.075;geo.quad([x0,y,edge-w0],[x0,y,near],[x1,y,near],[x1,y,edge-w1]);}else{const near=edge-.075;geo.quad([x0,y,near],[x0,y,edge+w0],[x1,y,edge+w1],[x1,y,near]);}}
  }
 }
 function prop(groups,p){const x=Number(p.x),z=Number(p.y);if(!Number.isFinite(x)||!Number.isFinite(z))return;const cx=x+.5,cz=z+.5,g=(k,v=0)=>{const key=k+':'+v;let b=groups.get(key);if(!b){b=new Geometry();groups.set(key,b);}return b;};
  if(p.kind==='chest'){g('wood',0).box(cx,.025,cz,.48,.31,.37);g('roof',0).box(cx,.34,cz,.52,.13,.4);const trim=g('copper',0);trim.box(cx-.17,.09,cz,.04,.48,.4);trim.box(cx+.17,.09,cz,.04,.48,.4);trim.box(cx,.24,cz+.205,.12,.09,.025);g('jade',0).box(cx,.26,cz+.226,.045,.045,.025);}
  if(p.kind==='altar'){const stone=g('ivory',0),jade=g('jade',0),gold=g('copper',0);stone.box(cx,.02,cz,.62,.18,.61);stone.box(cx,.22,cz,.43,.52,.43);jade.box(cx,.745,cz,.32,.035,.32);for(const a of [0,Math.PI/2,Math.PI,3*Math.PI/2]){const px=cx+Math.cos(a)*.27,pz=cz+Math.sin(a)*.27;gold.cone(px,.75,pz,.05,.16,5);}}
  if(p.kind==='craft'){const wood=g('wood',0),iron=g('dark',0),fire=g('ember',0);for(const dx of [-.23,.23])for(const dz of [-.17,.17])wood.box(cx+dx,.01,cz+dz,.07,.4,.07);wood.box(cx,.39,cz,.61,.09,.44);iron.box(cx+.12,.49,cz,.3,.07,.23);fire.cone(cx-.18,.48,cz,.09,.22,6);}
  if(p.kind==='dummy'){const wood=g('wood',0),cloth=g('roof',0),iron=g('copper',0);wood.box(cx,.01,cz,.08,1.04,.08);cloth.box(cx,.46,cz,.35,.42,.19);wood.box(cx,.79,cz,.62,.07,.09);iron.box(cx,.41,cz+.107,.09,.09,.015);}
 }
 function house(groups,h){const g=(k,v=0)=>{const key=k+':'+v;let b=groups.get(key);if(!b){b=new Geometry();groups.set(key,b);}return b;};
  const x=h.x+h.w/2,z=h.y+h.h/2,w=h.w-.22,d=h.h-.22,front=z+d/2,wall=g('ivory',0),stone=g('stone',0),timber=g('wood',0),dark=g('dark',0),roof=g('roof',h.id==='oficina'?1:0),copper=g('copper',0),warm=g('ember',0),glass=g('window',0);
  stone.box(x,.005,z,w+.08,.33,d+.08);wall.box(x,.33,z,w,1.44,d);
  const mortar=g('mortar',0);
  for(const yy of [.12,.225,.325]){mortar.box(x,yy,front+.042,w+.08,.012,.012);for(const side of [-1,1])mortar.box(x+side*(w/2+.042),yy,z,.012,.012,d+.08);}
  for(let row=0;row<2;row++){const count=Math.floor(w/.31),step=w/count;for(let col=1;col<count;col++){const px=x-w/2+col*step+(row?.08:0);if(px<x+w/2-.08)mortar.box(px,.045+row*.11,front+.049,.012,.092,.012);}}
  // Timber frame, courses of pale stone, and a continuous high copper roof.
  for(const sx of [-1,1])for(const sz of [-1,1])timber.box(x+sx*(w/2-.07),.34,z+sz*(d/2-.07),.095,1.43,.095);
  for(const y of [.67,1.22,1.69]){timber.box(x,y,front+.012,w,.045,.045);timber.box(x,y,z-d/2-.012,w,.045,.045);}
  const half=w/2+.16,depth=d/2+.2,eave=1.77,ridge=2.58;
  roof.quad([x-half,eave,z-depth],[x-half,eave,z+depth],[x,ridge,z+depth],[x,ridge,z-depth]);
  roof.quad([x,ridge,z-depth],[x,ridge,z+depth],[x+half,eave,z+depth],[x+half,eave,z-depth]);
  const rows=9,columns=Math.ceil(depth*2/.28),tileDepth=depth*2/columns;
  for(const side of [-1,1])for(let row=0;row<rows;row++)for(let col=-1;col<=columns;col++){
   const za=Math.max(z-depth+.018,z-depth+col*tileDepth+(row%2)*tileDepth/2+.011),zb=Math.min(z+depth-.018,z-depth+(col+1)*tileDepth+(row%2)*tileDepth/2-.015);if(zb<=za)continue;
   const t0=(row+.065)/rows,t1=(row+.92)/rows,rise=t=>ridge-(ridge-eave)*t+.02,p=(t,zz)=>[x+side*half*t,rise(t),zz],shade=Math.floor(hash(col+20,row+20,h.x+h.y)*3),tile=g('clay',shade);
   if(side<0)tile.quad(p(t1,za),p(t1,zb),p(t0,zb),p(t0,za));else tile.quad(p(t0,za),p(t0,zb),p(t1,zb),p(t1,za));
  }
  wall.quad([x-w/2,eave,front],[x+w/2,eave,front],[x,ridge-.05,front],[x,ridge-.05,front]);
  wall.quad([x+w/2,eave,z-d/2],[x-w/2,eave,z-d/2],[x,ridge-.05,z-d/2],[x,ridge-.05,z-d/2]);
  copper.box(x,ridge-.012,z,.09,.06,d+.43);
  const face=front+.04,door=g('wood',1);dark.box(x,.25,face,.7,1.12,.065);door.box(x,.25,face+.039,.57,1.1,.046);copper.box(x+.19,.73,face+.069,.04,.05,.026);
  for(const dx of [-.18,0,.18])timber.box(x+dx,.26,face+.067,.015,1.07,.015);
  for(const yy of [.48,1.16])copper.box(x,yy,face+.073,.58,.025,.017);
  const archY=1.34,inner=.32,outer=.425,archFace=face+.09;
  for(let i=0;i<9;i++){const a=i*Math.PI/9,b=(i+1)*Math.PI/9,innerA=[x+Math.cos(a)*inner,archY+Math.sin(a)*inner,archFace],innerB=[x+Math.cos(b)*inner,archY+Math.sin(b)*inner,archFace],outerA=[x+Math.cos(a)*outer,archY+Math.sin(a)*outer,archFace],outerB=[x+Math.cos(b)*outer,archY+Math.sin(b)*outer,archFace];dark.quad([x,archY,archFace-.005],innerA,innerB,innerB);stone.quad(innerA,outerA,outerB,innerB);}
  for(const dx of [-.38,.38])stone.box(x+dx,.27,archFace,.1,1.09,.08);
  stone.box(x,.02,front+.005,.88,.12,.31);
  for(const dx of [-w*.32,w*.32]){dark.box(x+dx,.91,face,.49,.54,.07);glass.box(x+dx,.97,face+.041,.31,.34,.021);timber.box(x+dx,.95,face+.066,.032,.41,.026);timber.box(x+dx,.97,face+.068,.38,.027,.026);for(const side of [-1,1])timber.box(x+dx+side*.275,.9,face+.064,.1,.48,.045);stone.box(x+dx,1.44,face+.075,.56,.065,.09);}
  for(const side of [-1,1]){const px=x+side*(w/2+.013),pz=z-.28;dark.box(px,.95,pz,.06,.48,.48);glass.box(px+side*.037,1.01,pz,.022,.33,.3);}
  // Forge-like lanterns and jade hanging cloth mark the usable entrance.
  for(const side of [-1,1]){const lx=x+side*.49;timber.box(lx,1.38,face+.08,.04,.29,.05);copper.box(lx,1.34,face+.115,.16,.14,.14);warm.box(lx,1.365,face+.202,.085,.09,.02);}
  const jade=g('jade',0);jade.box(x-w*.34,1.13,face+.085,.22,.5,.026);copper.box(x-w*.34,1.63,face+.1,.28,.045,.06);
  const chimneyX=x-w*.27,chimneyZ=z-d*.21;stone.box(chimneyX,1.42,chimneyZ,.4,1.42,.39);copper.box(chimneyX,2.82,chimneyZ,.51,.11,.5);
 }
 function build(cx,cz,map){const groups=new Map(),node=new pc.Entity(`Setor ${cx},${cz}`),props=floor===0?(bridge.getProps?.()||[]):[];node._worldMeshes=[];
  const valid=floor===0?houses.filter(h=>{for(let z=h.y;z<h.y+h.h;z++)for(let x=h.x;x<h.x+h.w;x++)if(get(map,x,z)!==2)return false;return true;}):[];
  for(let z=cz*CHUNK;z<(cz+1)*CHUNK;z++)for(let x=cx*CHUNK;x<(cx+1)*CHUNK;x++){if(x<0||z<0||x>=bridge.M_W||z>=bridge.M_H)continue;const underHouse=valid.some(h=>x>=h.x&&x<h.x+h.w&&z>=h.y&&z<h.y+h.h);drawTile(groups,map,x,z,floor>0,underHouse);seam(groups,map,x,z,'x');seam(groups,map,x,z,'z');}
  for(const h of valid)if(Math.floor((h.x+h.w/2)/CHUNK)===cx&&Math.floor((h.y+h.h/2)/CHUNK)===cz)house(groups,h);
  for(const p of props)if(Math.floor(p.x/CHUNK)===cx&&Math.floor(p.y/CHUNK)===cz)prop(groups,p);
  for(const [key,geo]of groups){const mesh=geo.finish(pc,app.graphicsDevice);if(!mesh)continue;node._worldMeshes.push(mesh);const e=new pc.Entity(key);e.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,mat(...key.split(':').map((v,i)=>i?Number(v):v)))],castShadows:true,receiveShadows:true});node.addChild(e);}
  root.addChild(node);chunks.set(`${cx}:${cz}`,node);created++;
 }
 function drop(e){e.destroy();for(const mesh of e._worldMeshes||[])mesh.destroy();}
 function update(dt){waterClock+=dt;const water=materials.get('water:0');if(water&&waterClock>=.08){water.diffuseMapOffset.x=(water.diffuseMapOffset.x+waterClock*.007)%1;water.diffuseMapOffset.y=(water.diffuseMapOffset.y+waterClock*.003)%1;water.update();waterClock=0;}const map=bridge.getMap?.(),p=bridge.getPlayer?.();if(!map||!p)return;const nextFloor=bridge.getFloor?.()??p.floor??0,props=nextFloor===0?(bridge.getProps?.()||[]):[],sig=props.map(p=>`${p.key||p.kind}:${p.x}:${p.y}`).join('|');
  if(map!==mapRef||nextFloor!==floor||sig!==propSignature){for(const e of chunks.values())drop(e);chunks.clear();mapRef=map;floor=nextFloor;propSignature=sig;}
  const cam=bridge.getCamera?.(),px=cam?cam.x+(bridge.VP_W||14)/2:p.x,pz=cam?cam.y+(bridge.VP_H||10)/2:p.y,bounds=bridge.getViewBounds?.()||{minX:px-REACH,maxX:px+REACH,minY:pz-REACH,maxY:pz+REACH};
  const fromX=Math.max(0,Math.floor(bounds.minX/CHUNK)),toX=Math.min(Math.ceil(bridge.M_W/CHUNK)-1,Math.floor(bounds.maxX/CHUNK)),fromZ=Math.max(0,Math.floor(bounds.minY/CHUNK)),toZ=Math.min(Math.ceil(bridge.M_H/CHUNK)-1,Math.floor(bounds.maxY/CHUNK));
  const wanted=new Set();for(let z=fromZ;z<=toZ;z++)for(let x=fromX;x<=toX;x++){const key=`${x}:${z}`;wanted.add(key);if(!chunks.has(key))build(x,z,map);}for(const [key,node]of chunks)if(!wanted.has(key)){drop(node);chunks.delete(key);}
 }
 function destroy(){for(const e of chunks.values())drop(e);chunks.clear();root.destroy();for(const m of materials.values())m.destroy();for(const t of textures)t.destroy();materials.clear();textures.length=0;}
 return {update,destroy,diagnostics:()=>({floor,chunks:chunks.size,chunkSize:CHUNK,materials:materials.size,generated:created,mapReady:!!mapRef})};
}
