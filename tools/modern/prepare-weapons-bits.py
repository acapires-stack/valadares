"""Pack original KayKit Fantasy Weapons Bits glTF assets as self-contained GLBs.

No vertex, UV, texture, material, node, or animation is modified. The EXTRA
archive contains all FREE models; FREE is recorded for provenance comparison.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = Path(r'C:\Users\Alcione\Documents\Codex\2026-10-06\valadare\work\compras-kaykit-2026-10-07')


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pad(data: bytes, byte: bytes) -> bytes:
    return data + byte * (-len(data) % 4)


def one_archive(path: Path, output: Path, write_models: bool, only: set[str] | None = None) -> dict:
    raw = path.read_bytes()
    archive = zipfile.ZipFile(path)
    prefix = next(n.split('Assets/gltf/')[0] + 'Assets/gltf/' for n in archive.namelist() if '/Assets/gltf/' in n)
    names = sorted(n[len(prefix):-5] for n in archive.namelist() if n.startswith(prefix) and n.endswith('.gltf')
                   and (only is None or n[len(prefix):-5] in only))
    if only is not None and set(names) != only:
        raise ValueError(f'{path}: expected {only}, got {set(names)}')
    license_name = next(n for n in archive.namelist() if n.endswith('/License.txt'))
    license_bytes = archive.read(license_name)
    models = []
    for name in names:
        source = archive.read(prefix + name + '.gltf')
        doc = json.loads(source)
        binary = archive.read(prefix + name + '.bin')
        assert len(doc['buffers']) == 1 and len(binary) == doc['buffers'][0]['byteLength']
        doc['buffers'][0].pop('uri', None)
        chunks = [binary]
        for image in doc.get('images', []):
            uri = image.pop('uri')
            payload = archive.read(prefix + uri)
            offset = sum(len(part) for part in chunks)
            doc.setdefault('bufferViews', []).append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(payload)})
            image['bufferView'] = len(doc['bufferViews']) - 1
            chunks.append(pad(payload, b'\x00'))
        body = b''.join(chunks)
        doc['buffers'][0]['byteLength'] = len(body)
        json_bytes = pad(json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode(), b' ')
        glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(json_bytes) + 8 + len(body))
        glb += struct.pack('<I4s', len(json_bytes), b'JSON') + json_bytes
        glb += struct.pack('<I4s', len(body), b'BIN\0') + body
        bounds = []
        for mesh in doc.get('meshes', []):
            for primitive in mesh['primitives']:
                bounds.append(doc['accessors'][primitive['attributes']['POSITION']])
        low = [min(a['min'][i] for a in bounds) for i in range(3)]
        high = [max(a['max'][i] for a in bounds) for i in range(3)]
        if write_models:
            (output / (name + '.glb')).write_bytes(glb)
        models.append({'name': name, 'sourceSha256': digest(source), 'glbSha256': digest(glb),
                       'bytes': len(glb), 'bounds': {'min': low, 'max': high}})
    return {'archive': path.name, 'sha256': digest(raw), 'licenseSha256': digest(license_bytes),
            'models': models, 'license': license_bytes.decode(errors='replace')}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    out = ROOT / 'modern/assets/weapons-bits'
    out.mkdir(parents=True, exist_ok=True)
    free = one_archive(args.source / 'fantasy-weapons-bits-Free.zip', out, False)
    extra = one_archive(args.source / 'fantasy-weapons-bits-Extra.zip', out, True)
    assert {m['name'] for m in free['models']} <= {m['name'] for m in extra['models']}
    (out / 'LICENSE-KayKit-FantasyWeaponsBits.txt').write_text(extra.pop('license'), encoding='utf-8')
    free.pop('license')
    crossbows = {'crossbow_1handed', 'crossbow_2handed'}
    adventurers_free = one_archive(args.source / 'kaykit-adventurers-Free-2.0.zip', out, True, crossbows)
    adventurers_extra = one_archive(args.source / 'kaykit-adventurers-Extra-2.0.zip', out, False, crossbows)
    assert {m['name']: m['glbSha256'] for m in adventurers_free['models']} == {
        m['name']: m['glbSha256'] for m in adventurers_extra['models']}
    assert adventurers_free['licenseSha256'] == adventurers_extra['licenseSha256']
    (out / 'LICENSE-KayKit-Adventurers2.txt').write_text(adventurers_free.pop('license'), encoding='utf-8')
    adventurers_extra.pop('license')
    (out / 'manifest.json').write_text(json.dumps({'source': 'KayKit Fantasy Weapons Bits 1.0',
        'creator': 'Kay Lousberg', 'license': 'CC0',
        'archives': [free, extra, adventurers_free, adventurers_extra]}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(extra["models"])} Weapons Bits GLBs and {len(adventurers_free["models"])} Adventurers 2.0 crossbows')


if __name__ == '__main__':
    main()
