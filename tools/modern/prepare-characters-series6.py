"""Extract only the Series 6 characters and shared rigs used by the game."""
import hashlib
import json
from pathlib import Path
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[2]
ZIP = Path(r"C:\Users\Alcione\Downloads\KayKit_Mystery_Monthly_Series_6_(1.1).zip")
DEST = ROOT / "modern/assets/characters-series6"
NAMES = ("Farmer_A", "Farmer_B", "Lorekeeper", "Cleric", "OrcBrute", "Monstrosity")
RIGS = ("Rig_Medium_General", "Rig_Medium_MovementBasic", "Rig_Large_General", "Rig_Large_MovementBasic")


def parse_glb(data):
    if data[:4] != b"glTF":
        raise ValueError("Invalid GLB header")
    _, _, total = struct.unpack_from("<4sII", data)
    if total != len(data):
        raise ValueError("Invalid GLB length")
    json_len, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise ValueError("Missing GLB JSON chunk")
    doc = json.loads(data[20:20 + json_len])
    offset = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<I4s", data, offset)
    if bin_type != b"BIN\0":
        raise ValueError("Missing GLB binary chunk")
    return doc, data[offset + 8:offset + 8 + bin_len]


def pack_glb(doc, binary):
    encoded = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    encoded += b" " * (-len(encoded) % 4)
    binary += b"\0" * (-len(binary) % 4)
    return struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + 8 + len(binary)) + struct.pack("<I4s", len(encoded), b"JSON") + encoded + struct.pack("<I4s", len(binary), b"BIN\0") + binary


def add_attack(data, source):
    """Retarget the existing CC0 Barbarian chop rotations to matching Series 6 bones."""
    doc, binary = parse_glb(data)
    old, old_binary = parse_glb(source)
    attack = next(a for a in old["animations"] if a["name"] == "1H_Melee_Attack_Chop")
    targets = {node.get("name"): i for i, node in enumerate(doc["nodes"])}
    accessors = {}
    samplers = {}
    new_samplers = []
    channels = []
    offset = len(binary)
    for channel in attack["channels"]:
        node_name = old["nodes"][channel["target"]["node"]].get("name")
        if channel["target"]["path"] != "rotation" or node_name not in targets:
            continue
        old_sampler_index = channel["sampler"]
        if old_sampler_index not in samplers:
            old_sampler = attack["samplers"][old_sampler_index]
            new_sampler = {"interpolation": old_sampler.get("interpolation", "LINEAR")}
            for key in ("input", "output"):
                index = old_sampler[key]
                if index not in accessors:
                    accessor = dict(old["accessors"][index])
                    view = dict(old["bufferViews"][accessor["bufferView"]])
                    view["byteOffset"] = view.get("byteOffset", 0) + offset
                    view["buffer"] = 0
                    accessor["bufferView"] = len(doc["bufferViews"])
                    doc["bufferViews"].append(view)
                    accessors[index] = len(doc["accessors"])
                    doc["accessors"].append(accessor)
                new_sampler[key] = accessors[index]
            samplers[old_sampler_index] = len(samplers)
            new_samplers.append(new_sampler)
        channels.append({"sampler": samplers[old_sampler_index], "target": {"node": targets[node_name], "path": "rotation"}})
    if len(channels) < 15:
        raise ValueError("Too few matching attack bones")
    doc.setdefault("animations", []).append({"name": "1H_Melee_Attack_Chop", "channels": channels, "samplers": new_samplers})
    doc["buffers"][0]["byteLength"] = len(binary) + len(old_binary)
    return pack_glb(doc, binary + old_binary)

with zipfile.ZipFile(ZIP) as archive:
    if archive.testzip() is not None:
        raise ValueError("Series 6 ZIP failed CRC validation")
    files = {}
    old_attack_source = (ROOT / "modern/assets/characters/Barbarian-game.glb").read_bytes()
    for name in (*NAMES, *RIGS):
        matches = [p for p in archive.namelist() if p.endswith("/" + name + ".glb")]
        if len(matches) != 1:
            raise ValueError(f"Expected one {name}.glb, found {len(matches)}")
        data = archive.read(matches[0])
        parse_glb(data)
        source_sha = hashlib.sha256(data).hexdigest()
        if name in ("OrcBrute", "Monstrosity"):
            data = add_attack(data, old_attack_source)
        DEST.mkdir(parents=True, exist_ok=True)
        (DEST / (name + ".glb")).write_bytes(data)
        files[name + ".glb"] = {"source": matches[0], "sourceSha256": source_sha, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    license_path = next(p for p in archive.namelist() if p.endswith("/License.txt"))
    license_bytes = archive.read(license_path)
    (DEST / "LICENSE.txt").write_bytes(license_bytes)
    files["LICENSE.txt"] = {"source": license_path, "bytes": len(license_bytes), "sha256": hashlib.sha256(license_bytes).hexdigest()}
    manifest = {"pack": "KayKit Monthly Mystery Characters Series 6 (1.1)", "author": "Kay Lousberg", "license": "CC0 1.0", "archive": ZIP.name, "derivedAttack": "CC0 Barbarian-game.glb 1H_Melee_Attack_Chop rotations retargeted by bone name to OrcBrute and Monstrosity", "derivedAttackSourceSha256": hashlib.sha256(old_attack_source).hexdigest(), "files": files}
    (DEST / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Prepared {len(NAMES)} characters and {len(RIGS)} animation packs in {DEST}")
