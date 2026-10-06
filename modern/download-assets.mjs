import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.join(import.meta.dirname,'assets','characters');
await fs.mkdir(root,{recursive:true});
const packs=[
 {pack:'KayKit Adventurers',repo:'KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0',commit:'672074b73ba276876a19e8816ecdc5241817ab47',dir:'addons/kaykit_character_pack_adventures/Characters/gltf/',files:['Knight.glb','Mage.glb','Rogue_Hooded.glb','Barbarian.glb','knight_texture.png','mage_texture.png','rogue_texture.png','barbarian_texture.png'],licenseFile:'LICENSE.txt'},
 {pack:'KayKit Skeletons',repo:'KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0',commit:'15b62b9bad122f72926c10fb14d622c73819fa54',dir:'addons/kaykit_character_pack_skeletons/Characters/gltf/',files:['Skeleton_Warrior.glb','skeleton_texture.png'],licenseFile:'LICENSE-Skeletons.txt'}
];
const sources=[];
for(const pack of packs){
 const base=`https://raw.githubusercontent.com/${pack.repo}/${pack.commit}/`;
 const records=await Promise.all(pack.files.map(async name=>{
  const url=base+pack.dir+name,r=await fetch(url);if(!r.ok)throw new Error(`Asset ${name} ${r.status}`);
  const bytes=Buffer.from(await r.arrayBuffer());await fs.writeFile(path.join(root,name),bytes);
  return {name,url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 }));
 const response=await fetch(base+'LICENSE.txt');if(!response.ok)throw new Error(`License ${pack.pack} ${response.status}`);
 await fs.writeFile(path.join(root,pack.licenseFile),await response.text());
 sources.push({author:'Kay Lousberg',pack:pack.pack,license:'CC0 1.0',repository:`https://github.com/${pack.repo}`,commit:pack.commit,licenseFile:pack.licenseFile,files:records});
}
await fs.writeFile(path.join(root,'SOURCE.json'),JSON.stringify({downloaded:'2026-10-06',sources},null,2));
console.log(JSON.stringify(sources.map(s=>({pack:s.pack,commit:s.commit,downloaded:s.files.map(x=>({name:x.name,bytes:x.bytes}))}))));
