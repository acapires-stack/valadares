"""Prepare the authored Plant Warrior with a compact same-rig spear stab.

Reads only KayKit Series 6 and the local KayKit Knight original. Does not touch
other Series 6 assets or the game renderer.
"""
import copy
import hashlib
import json
from pathlib import Path
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[2]
ZIP = Path(r"C:\Users\Alcione\Downloads\KayKit_Mystery_Monthly_Series_6_(1.1).zip")
DEST = ROOT / "modern/assets/characters-series6"
KNIGHT = ROOT / "modern/assets/characters/Knight.glb"
ATTACK = "1H_Melee_Attack_Stab"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def parse_glb(data):
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 8)[0] != len(data):
        raise ValueError("Invalid GLB")
    json_len, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise ValueError("Missing JSON chunk")
    doc = json.loads(data[20:20 + json_len])
    binary_offset = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<I4s", data, binary_offset)
    if bin_type != b"BIN\0":
        raise ValueError("Missing BIN chunk")
    return doc, data[binary_offset + 8:binary_offset + 8 + bin_len]


def pack_glb(doc, binary):
    payload = json.dumps(doc, separators=(",", ":")).encode("utf8")
    payload += b" " * (-len(payload) % 4)
    binary += b"\0" * (-len(binary) % 4)
    return (struct.pack("<4sII", b"glTF", 2, 28 + len(payload) + len(binary))
            + struct.pack("<I4s", len(payload), b"JSON") + payload
            + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def one(names, suffix):
    matches = [n for n in names if n.endswith(suffix)]
    if len(matches) != 1:
        raise ValueError(f"Expected one {suffix}, found {len(matches)}")
    return matches[0]


def embed_prop(archive, source):
    doc = json.loads(archive.read(source))
    folder = source.rsplit("/", 1)[0] + "/"
    if len(doc["buffers"]) != 1:
        raise ValueError("Expected a single prop buffer")
    binary_path = folder + doc["buffers"][0].pop("uri")
    binary = archive.read(binary_path)
    sources = [source, binary_path]
    for image in doc.get("images", []):
        image_path = folder + image.pop("uri")
        binary += b"\0" * (-len(binary) % 4)
        image_bytes = archive.read(image_path)
        image["bufferView"] = len(doc["bufferViews"])
        doc["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(image_bytes)})
        binary += image_bytes
        sources.append(image_path)
    doc["buffers"][0]["byteLength"] = len(binary)
    return pack_glb(doc, binary), sources


def same_rest(a, b):
    defaults = {"translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1]}
    for key in defaults:
        x = a.get(key, defaults[key]); y = b.get(key, defaults[key])
        if key == "rotation":
            if min(max(abs(u-v) for u,v in zip(x,y)),max(abs(u+v) for u,v in zip(x,y))) > 1e-5:
                return False
        elif max(abs(u-v) for u,v in zip(x,y)) > 1e-5:
            return False
    return True


def add_stab(plant_bytes, knight_bytes):
    doc, binary = parse_glb(plant_bytes)
    knight, knight_binary = parse_glb(knight_bytes)
    attack = next(a for a in knight["animations"] if a["name"] == ATTACK)
    targets = {n.get("name"): i for i, n in enumerate(doc["nodes"])}
    source_nodes = {n.get("name"): n for n in knight["nodes"]}
    if len(doc.get("animations", [])) != 0:
        raise ValueError("Original PlantWarrior unexpectedly has animations")
    bones = {doc["nodes"][i].get("name") for s in doc["skins"] for i in s["joints"]}
    if len(bones) != 23 or not all(name in source_nodes and same_rest(doc["nodes"][targets[name]], source_nodes[name]) for name in bones):
        raise ValueError("PlantWarrior and Knight no longer have the same 23-bone rest skeleton")
    if "Rig_Medium" not in targets or "Rig" not in source_nodes:
        raise ValueError("Unexpected rig roots")

    retained_channels = []
    retained_samplers = []
    dropped = []
    view_map = {}
    accessor_map = {}
    sampler_map = {}
    blob = bytearray(binary)

    def copy_accessor(index):
        if index in accessor_map:
            return accessor_map[index]
        accessor = copy.deepcopy(knight["accessors"][index])
        if "sparse" in accessor or "bufferView" not in accessor:
            raise ValueError("Unsupported sparse/implicit animation accessor")
        old_view = accessor["bufferView"]
        if old_view not in view_map:
            source_view = knight["bufferViews"][old_view]
            if source_view.get("buffer", 0) != 0:
                raise ValueError("Unexpected buffer index")
            offset = source_view.get("byteOffset", 0)
            length = source_view["byteLength"]
            blob.extend(b"\0" * (-len(blob) % 4))
            view = copy.deepcopy(source_view)
            view["buffer"] = 0
            view["byteOffset"] = len(blob)
            blob.extend(knight_binary[offset:offset + length])
            view_map[old_view] = len(doc["bufferViews"])
            doc["bufferViews"].append(view)
        accessor["bufferView"] = view_map[old_view]
        accessor_map[index] = len(doc["accessors"])
        doc["accessors"].append(accessor)
        return accessor_map[index]

    for channel in attack["channels"]:
        name = knight["nodes"][channel["target"]["node"]].get("name")
        if name not in targets:
            dropped.append(name)
            continue
        old_index = channel["sampler"]
        if old_index not in sampler_map:
            sampler = copy.deepcopy(attack["samplers"][old_index])
            sampler["input"] = copy_accessor(sampler["input"])
            sampler["output"] = copy_accessor(sampler["output"])
            sampler_map[old_index] = len(retained_samplers)
            retained_samplers.append(sampler)
        retained_channels.append({"sampler": sampler_map[old_index], "target": {"node": targets[name], "path": channel["target"]["path"]}})
    if len(retained_channels) != 69 or {c["target"]["path"] for c in retained_channels} != {"translation", "rotation", "scale"}:
        raise ValueError("Expected all TRS channels for 23 deforming/hand-slot bones")
    doc["animations"] = [{"name": ATTACK, "channels": retained_channels, "samplers": retained_samplers}]
    doc["buffers"][0]["byteLength"] = len(blob)
    return pack_glb(doc, bytes(blob)), {"attack": ATTACK, "sourceChannels": len(attack["channels"]), "retainedChannels": len(retained_channels), "retainedBones": len(bones), "droppedControlBones": sorted(set(dropped)), "appendedBytes": len(blob) - len(binary)}


with zipfile.ZipFile(ZIP) as archive:
    names = archive.namelist()
    plant_source = one(names, "/characters/PlantWarrior.glb")
    shield_source = one(names, "/assets/gltf/PlantWarrior_Shield.gltf")
    license_source = one(names, "/License.txt")
    plant_original = archive.read(plant_source)
    knight_original = KNIGHT.read_bytes()
    plant_derived, attack_meta = add_stab(plant_original, knight_original)
    shield_derived, shield_sources = embed_prop(archive, shield_source)
    license_data = archive.read(license_source)
    if b"CC0" not in license_data or b"Kay Lousberg" not in license_data:
        raise ValueError("Unexpected source license")
    spear_existing = DEST / "PlantWarrior_Spear.glb"
    if not spear_existing.is_file():
        raise ValueError("Existing original PlantWarrior spear is missing")
    provenance = {
        "package": ZIP.name,
        "author": "Kay Lousberg",
        "license": "CC0 1.0",
        "licenseSource": license_source,
        "licenseSha256": sha(license_data),
        "character": {"source": plant_source, "sourceSha256": sha(plant_original), "derivedSha256": sha(plant_derived), "bytes": len(plant_derived), **attack_meta},
        "stabSource": {"file": str(KNIGHT), "sha256": sha(knight_original), "license": "KayKit character pack, see modern/assets/characters/LICENSE.txt", "animation": ATTACK},
        "shield": {"sources": {p: sha(archive.read(p)) for p in shield_sources}, "derivedSha256": sha(shield_derived), "bytes": len(shield_derived)},
        "spearExisting": {"file": str(spear_existing.relative_to(ROOT)), "sha256": sha(spear_existing.read_bytes())},
        "reproduce": "python tools/modern/prepare-guardian.py",
    }
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "PlantWarrior.glb").write_bytes(plant_derived)
    (DEST / "PlantWarrior_Shield.glb").write_bytes(shield_derived)
    (DEST / "SOURCE-Guardian.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
print(json.dumps({"ok": True, "plantBytes": len(plant_derived), "shieldBytes": len(shield_derived), **attack_meta}, ensure_ascii=False))
