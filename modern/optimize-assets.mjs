import fs from 'node:fs/promises';
import path from 'node:path';
// Lossless compaction of glTF buffers after removing animations not used by this client.
const keep=new Set(['Idle','Walking_A','Running_A','1H_Melee_Attack_Chop','1H_Melee_Attack_Slice_Horizontal','2H_Melee_Attack_Chop','2H_Ranged_Shoot','Spellcast_Shoot','Unarmed_Melee_Attack_Punch_A','Death_A','Hit_A','Interact','Use_Item']);
const folder=path.join(import.meta.dirname,'assets','characters');
for(const name of ['Knight','Mage','Rogue_Hooded','Barbarian','Skeleton_Warrior']){
 const source=await fs.readFile(path.join(folder,name+'.glb'));
 const jl=source.readUInt32LE(12),doc=JSON.parse(source.subarray(20,20+jl));
 const bin=source.subarray(28+jl); doc.animations=doc.animations.filter(a=>keep.has(a.name));
 const used=new Set();
 for(const mesh of doc.meshes||[])for(const p of mesh.primitives){Object.values(p.attributes).forEach(i=>used.add(i));if(p.indices!==undefined)used.add(p.indices);for(const t of p.targets||[])Object.values(t).forEach(i=>used.add(i));}
 for(const s of doc.skins||[])if(s.inverseBindMatrices!==undefined)used.add(s.inverseBindMatrices);
 for(const a of doc.animations)for(const s of a.samplers){used.add(s.input);used.add(s.output);}
 const accessors=[...used].sort((a,b)=>a-b), amap=new Map(accessors.map((v,i)=>[v,i]));
 for(const mesh of doc.meshes||[])for(const p of mesh.primitives){for(const k of Object.keys(p.attributes))p.attributes[k]=amap.get(p.attributes[k]);if(p.indices!==undefined)p.indices=amap.get(p.indices);for(const t of p.targets||[])for(const k of Object.keys(t))t[k]=amap.get(t[k]);}
 for(const s of doc.skins||[])if(s.inverseBindMatrices!==undefined)s.inverseBindMatrices=amap.get(s.inverseBindMatrices);
 for(const a of doc.animations)for(const s of a.samplers){s.input=amap.get(s.input);s.output=amap.get(s.output);}
 doc.accessors=accessors.map(i=>doc.accessors[i]);const views=new Set();
 for(const a of doc.accessors){if(a.bufferView!==undefined)views.add(a.bufferView);if(a.sparse){views.add(a.sparse.indices.bufferView);views.add(a.sparse.values.bufferView);}}
 for(const i of doc.images||[])if(i.bufferView!==undefined)views.add(i.bufferView);
 const vlist=[...views].sort((a,b)=>a-b), vmap=new Map(vlist.map((v,i)=>[v,i]));let offset=0;const chunks=[];
 doc.bufferViews=vlist.map(i=>{const old=doc.bufferViews[i],bytes=bin.subarray(old.byteOffset||0,(old.byteOffset||0)+old.byteLength);const pad=Buffer.alloc((4-bytes.length%4)%4);chunks.push(bytes,pad);const result={...old,buffer:0,byteOffset:offset};offset+=bytes.length+pad.length;return result;});
 for(const a of doc.accessors){if(a.bufferView!==undefined)a.bufferView=vmap.get(a.bufferView);if(a.sparse){a.sparse.indices.bufferView=vmap.get(a.sparse.indices.bufferView);a.sparse.values.bufferView=vmap.get(a.sparse.values.bufferView);}}
 for(const i of doc.images||[])if(i.bufferView!==undefined)i.bufferView=vmap.get(i.bufferView);
 doc.buffers=[{byteLength:offset}];const j=Buffer.from(JSON.stringify(doc));const jp=Buffer.alloc((4-j.length%4)%4,32);const jb=Buffer.concat([j,jp]);const bb=Buffer.concat(chunks);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jb.length+bb.length,8);header.writeUInt32LE(jb.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bb.length);bh.writeUInt32LE(0x004e4942,4);
 const result=Buffer.concat([header,jb,bh,bb]);await fs.writeFile(path.join(folder,name+'-game.glb'),result);console.log(name,source.length,'=>',result.length,doc.animations.length+' animations');
}
