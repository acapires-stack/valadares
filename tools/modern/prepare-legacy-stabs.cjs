// Restore authored spear attacks omitted by the original compact asset export.
// Geometry, materials, skeleton and every existing animation remain unchanged.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const folder=path.resolve(__dirname,'../../modern/assets/characters');
const parse=file=>{const b=fs.readFileSync(file),n=b.readUInt32LE(12);assert.equal(b.toString('ascii',0,4),'glTF');return {doc:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};};
const clips=['1H_Melee_Attack_Stab','2H_Melee_Attack_Stab'];
for(const name of ['Knight','Mage','Rogue_Hooded','Barbarian']){
 const source=parse(path.join(folder,name+'.glb')),file=path.join(folder,name+'-game.glb'),target=parse(file),d=target.doc;
 assert.deepEqual(d.nodes,source.doc.nodes,'Original skeleton must match '+name);
 let bin=target.bin;const accessors=new Map(),views=new Map();
 const cloneView=id=>{if(views.has(id))return views.get(id);const old=source.doc.bufferViews[id];assert.equal(old.buffer,0);const offset=bin.length+(-bin.length&3);bin=Buffer.concat([bin,Buffer.alloc(offset-bin.length),source.bin.subarray(old.byteOffset||0,(old.byteOffset||0)+old.byteLength)]);const n=d.bufferViews.push({...old,byteOffset:offset})-1;views.set(id,n);return n;};
 const cloneAccessor=id=>{if(accessors.has(id))return accessors.get(id);const old=source.doc.accessors[id];assert(!old.sparse,'Unexpected sparse animation accessor');const n=d.accessors.push({...old,bufferView:cloneView(old.bufferView)})-1;accessors.set(id,n);return n;};
 for(const name of clips){if(d.animations.some(a=>a.name===name))continue;const a=source.doc.animations.find(a=>a.name===name);assert(a,'Missing authored '+name);d.animations.push({...a,samplers:a.samplers.map(s=>({...s,input:cloneAccessor(s.input),output:cloneAccessor(s.output)}))});}
 d.buffers[0].byteLength=bin.length;let json=Buffer.from(JSON.stringify(d));json=Buffer.concat([json,Buffer.alloc(-json.length&3,32)]);bin=Buffer.concat([bin,Buffer.alloc(-bin.length&3)]);
 const h=Buffer.alloc(20),b=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+bin.length,8);h.writeUInt32LE(json.length,12);h.write('JSON',16);b.writeUInt32LE(bin.length);b.write('BIN\0',4);fs.writeFileSync(file,Buffer.concat([h,json,b,bin]));
 console.log(name+': authored 1H/2H stabs available');
}
