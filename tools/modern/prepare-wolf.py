"""Repackage the official self-contained Quaternius Wolf glTF as GLB without changing art."""
import base64
import hashlib
import json
from pathlib import Path
import struct
import sys

source = Path(sys.argv[1])
target = Path(__file__).resolve().parents[2] / 'modern/assets/animals'
target.mkdir(parents=True, exist_ok=True)
raw = source.read_bytes()
gltf = json.loads(raw)
assert len(gltf['buffers']) == 1
uri = gltf['buffers'][0].pop('uri')
assert uri.startswith('data:application/octet-stream;base64,')
binary = base64.b64decode(uri.split(',', 1)[1])
assert len(binary) == gltf['buffers'][0]['byteLength']
header = json.dumps(gltf, separators=(',', ':'), ensure_ascii=False).encode()
header += b' ' * (-len(header) % 4)
binary += b'\0' * (-len(binary) % 4)
glb = struct.pack('<III', 0x46546c67, 2, 28 + len(header) + len(binary))
glb += struct.pack('<II', len(header), 0x4e4f534a) + header
glb += struct.pack('<II', len(binary), 0x004e4942) + binary
(target / 'Wolf-game.glb').write_bytes(glb)
metadata = {'author': 'Quaternius', 'pack': 'Ultimate Animated Animals', 'license': 'CC0 1.0',
 'packUrl': 'https://quaternius.com/packs/ultimateanimatedanimals.html',
 'sourceUrl': 'https://drive.google.com/file/d/1lFQoQ9ln2Z2wGuFFWObj9i5jHqUl_ftG/view',
 'sourceFile': source.name, 'sourceSha256': hashlib.sha256(raw).hexdigest(),
 'outputSha256': hashlib.sha256(glb).hexdigest(), 'sourceBytes': len(raw), 'outputBytes': len(glb),
 'transformation': 'Binary container conversion only; unchanged meshes, materials, rig and all 12 animations.'}
(target / 'SOURCE-Wolf.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
print(json.dumps(metadata))
