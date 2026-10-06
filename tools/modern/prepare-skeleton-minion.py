"""Prepare the same-author CC0 unarmored skeleton, preserving authored meshes and motions."""
from pathlib import Path
import json,struct,hashlib,urllib.request
root=Path(__file__).resolve().parents[2]; dest=root/'modern/assets/characters'; url='https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0/15b62b9bad122f72926c10fb14d622c73819fa54/addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Minion.glb'
b=urllib.request.urlopen(url).read(); (dest/'Skeleton_Minion.glb').write_bytes(b)
jl=struct.unpack_from('<I',b,12)[0]; d=json.loads(b[20:20+jl]); bb=b[28+jl:]; keep={'Idle','Running_A','Walking_A','Death_A','Hit_A','1H_Melee_Attack_Chop','1H_Melee_Attack_Slice_Horizontal','2H_Ranged_Shoot','Spellcast_Shoot','Unarmed_Melee_Attack_Punch_A'}; d['animations']=[a for a in d['animations'] if a['name'] in keep]
used=set()
for m in d['meshes']:
 for p in m['primitives']:
  used.update(p['attributes'].values()); used.update([p['indices']] if 'indices'in p else [])
  for t in p.get('targets',[]): used.update(t.values())
for s in d.get('skins',[]): used.update([s['inverseBindMatrices']] if 'inverseBindMatrices'in s else [])
for a in d['animations']:
 for s in a['samplers']: used.update([s['input'],s['output']])
indices={a:i for i,a in enumerate(sorted(used))}; accessors=[d['accessors'][i] for i in sorted(used)]
for m in d['meshes']:
 for p in m['primitives']:
  p['attributes']={k:indices[v] for k,v in p['attributes'].items()}
  if 'indices'in p:p['indices']=indices[p['indices']]
  for t in p.get('targets',[]):
   for k,v in t.items():t[k]=indices[v]
for s in d.get('skins',[]):
 if 'inverseBindMatrices'in s:s['inverseBindMatrices']=indices[s['inverseBindMatrices']]
for a in d['animations']:
 for s in a['samplers']:s['input']=indices[s['input']];s['output']=indices[s['output']]
views={a['bufferView'] for a in accessors}|{i['bufferView'] for i in d.get('images',[]) if 'bufferView'in i}; vi={v:i for i,v in enumerate(sorted(views))}; out=b''; newviews=[]
for i in sorted(views):
 v=dict(d['bufferViews'][i]); out+=b'\0'*(-len(out)%4); off=v.get('byteOffset',0); chunk=bb[off:off+v['byteLength']];v['byteOffset']=len(out);out+=chunk;newviews.append(v)
for a in accessors:a['bufferView']=vi[a['bufferView']]
for i in d.get('images',[]):
 if 'bufferView'in i:i['bufferView']=vi[i['bufferView']]
d['accessors']=accessors;d['bufferViews']=newviews;d['buffers'][0]['byteLength']=len(out)
j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4);out+=b'\0'*(-len(out)%4); packed=struct.pack('<4sII',b'glTF',2,28+len(j)+len(out))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(out),b'BIN\0')+out;(dest/'Skeleton_Minion-game.glb').write_bytes(packed)
(dest/'SOURCE-Minion.json').write_text(json.dumps({'author':'Kay Lousberg','license':'CC0 1.0','url':url,'sourceSha256':hashlib.sha256(b).hexdigest(),'derivedSha256':hashlib.sha256(packed).hexdigest(),'change':'Keep 10 existing animation clips; compact unused binary bufferViews. Meshes unchanged.','originalBytes':len(b),'derivedBytes':len(packed)},indent=2))
print(len(b),len(packed));print([x['name'] for x in d['nodes'] if 'mesh'in x])
