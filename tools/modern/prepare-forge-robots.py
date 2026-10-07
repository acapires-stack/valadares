"""Prepare the licensed Series 6 forge robots without changing their geometry.

The Series 6 large rig has no attack clip. The separate KayKit Character
Animations 1.1 FREE pack does: its Large melee slash is packed into both bodies,
with the one differing head-rest offset corrected. Meshes/materials stay exact.
"""
import copy
import hashlib
import json
import math
from pathlib import Path
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = Path(r"C:\Users\Alcione\Downloads\KayKit_Mystery_Monthly_Series_6_(1.1).zip")
ANIMATION_ARCHIVE = Path(r"C:\Users\Alcione\Documents\Codex\2026-10-06\valadare\work\compras-kaykit-2026-10-07\kaykit-character-animations-Free-1.1.zip")
ACERVO = Path(r"C:\Users\Alcione\Documents\Codex\2026-10-06\valadare\work\harmonizacao-2026-10-07\acervo")
DEST = ROOT / "modern/assets/characters-series6"
ATTACK = "Melee_1H_Slash"
CHARACTERS = ("4GTN", "4GTN_Forgotten")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def parse_glb(data):
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 8)[0] != len(data):
        raise ValueError("invalid GLB")
    length, kind = struct.unpack_from("<I4s", data, 12)
    if kind != b"JSON":
        raise ValueError("missing JSON chunk")
    doc = json.loads(data[20:20 + length])
    offset = 20 + length
    size, kind = struct.unpack_from("<I4s", data, offset)
    if kind != b"BIN\0":
        raise ValueError("missing BIN chunk")
    return doc, data[offset + 8:offset + 8 + size]


def pack_glb(doc, binary):
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary += b"\0" * (-len(binary) % 4)
    return (struct.pack("<4sII", b"glTF", 2, 28 + len(encoded) + len(binary))
            + struct.pack("<I4s", len(encoded), b"JSON") + encoded
            + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def unique(names, suffix):
    found = [n for n in names if n.endswith(suffix)]
    if len(found) != 1:
        raise ValueError(f"expected exactly one {suffix}, found {len(found)}")
    return found[0]


def joint_map(doc, exact=True):
    joints = doc["skins"][0]["joints"]
    result = {doc["nodes"][i].get("name"): i for i in joints}
    if (exact and len(joints) != 23) or len(result) != len(joints) or "handslot.r" not in result:
        raise ValueError("unexpected deforming rig")
    return result


def parents(doc):
    result = {}
    for i, node in enumerate(doc["nodes"]):
        for child in node.get("children", []):
            result[child] = i
    return result


def quat_multiply(a, b):
    x, y, z, w = a
    X, Y, Z, W = b
    return (w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X,
            w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z)


def quat_unit(q):
    size = math.sqrt(sum(v*v for v in q))
    return tuple(v/size for v in q)


def quat_inverse(q):
    x, y, z, w = quat_unit(q)
    return (-x, -y, -z, w)


def values(doc, binary, accessor_id):
    accessor = doc["accessors"][accessor_id]
    view = doc["bufferViews"][accessor["bufferView"]]
    if accessor.get("componentType") != 5126 or accessor.get("sparse") or view.get("buffer", 0) != 0:
        raise ValueError("animation accessor must be dense float32")
    components = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    stride = view.get("byteStride", components * 4)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from("<" + "f"*components, binary, start+i*stride)
            for i in range(accessor["count"])]


def add_attack(original, combat_bytes):
    doc, body = parse_glb(original)
    combat, combat_body = parse_glb(combat_bytes)
    target, source = joint_map(doc), joint_map(combat)
    if set(target) != set(source) or len(doc.get("animations", [])):
        raise ValueError("character has unexpected joints or native clips")
    tp, sp = parents(doc), parents(combat)
    rest_differences = {}
    for name in target:
        target_parent = doc["nodes"][tp[target[name]]].get("name") if target[name] in tp else None
        source_parent = combat["nodes"][sp[source[name]]].get("name") if source[name] in sp else None
        if target_parent != source_parent:
            raise ValueError(f"skeleton hierarchy differs at {name}")
        a, b = doc["nodes"][target[name]], combat["nodes"][source[name]]
        delta = [x-y for x,y in zip(a.get("translation",[0,0,0]),b.get("translation",[0,0,0]))]
        aq, bq = a.get("rotation",[0,0,0,1]), b.get("rotation",[0,0,0,1])
        rotation_delta = min(max(abs(x-y) for x,y in zip(aq,bq)),
                             max(abs(x+y) for x,y in zip(aq,bq)))
        scale_delta = max(abs(x-y) for x,y in zip(a.get("scale",[1,1,1]),b.get("scale",[1,1,1])))
        if rotation_delta > 1e-5 or scale_delta > 1e-5:
            raise ValueError(f"Large rest-pose rotation/scale differs at {name}")
        if max(abs(v) for v in delta) > 1e-5:
            rest_differences[name] = {"translationDelta":delta}
    if set(rest_differences) != {"head"} or abs(rest_differences["head"]["translationDelta"][1]-0.115)>1e-4:
        raise ValueError(f"unexpected Large rest-pose difference: {rest_differences}")
    attack = next(a for a in combat["animations"] if a["name"] == ATTACK)
    channels_original = [c for c in attack["channels"] if combat["nodes"][c["target"]["node"]].get("name") in target]
    if len(channels_original) != 69 or {c["target"]["path"] for c in channels_original} != {"translation","rotation","scale"}:
        raise ValueError(f"expected 69 native Large TRS channels, got {len(channels_original)}")
    blob = bytearray(body)
    samplers, channels = [], []
    duration = 0
    for channel in channels_original:
        name = combat["nodes"][channel["target"]["node"]]["name"]
        path = channel["target"]["path"]
        source_sampler = attack["samplers"][channel["sampler"]]
        if source_sampler.get("interpolation", "LINEAR") != "LINEAR":
            raise ValueError("unsupported attack interpolation")
        ticks = [row[0] for row in values(combat, combat_body, source_sampler["input"])]
        poses = values(combat, combat_body, source_sampler["output"])
        if len(ticks) != len(poses) or not ticks or any(b <= a for a,b in zip(ticks,ticks[1:])):
            raise ValueError("invalid attack keyframes")
        duration = max(duration, ticks[-1])
        adapted = []
        if path == "rotation":
            source_rest = combat["nodes"][source[name]].get("rotation", [0,0,0,1])
            target_rest = doc["nodes"][target[name]].get("rotation", [0,0,0,1])
            correction = quat_multiply(target_rest, quat_inverse(source_rest))
            for pose in poses:
                q = quat_unit(quat_multiply(correction, pose))
                if adapted and sum(a*b for a,b in zip(adapted[-1],q)) < 0:
                    q = tuple(-v for v in q)
                adapted.append(q)
        elif path == "translation":
            delta = [x-y for x,y in zip(doc["nodes"][target[name]].get("translation",[0,0,0]),
                                      combat["nodes"][source[name]].get("translation",[0,0,0]))]
            adapted = [tuple(v+d for v,d in zip(pose,delta)) for pose in poses]
        else:
            source_scale = combat["nodes"][source[name]].get("scale",[1,1,1])
            target_scale = doc["nodes"][target[name]].get("scale",[1,1,1])
            ratio = [x/y for x,y in zip(target_scale,source_scale)]
            adapted = [tuple(v*r for v,r in zip(pose,ratio)) for pose in poses]
        indices = []
        output_kind = "VEC4" if path == "rotation" else "VEC3"
        for kind, rows in (("SCALAR", [(t,) for t in ticks]), (output_kind, adapted)):
            blob.extend(b"\0" * (-len(blob) % 4))
            start = len(blob)
            blob.extend(b"".join(struct.pack("<"+"f"*len(row), *row) for row in rows))
            view_id = len(doc["bufferViews"])
            doc["bufferViews"].append({"buffer":0,"byteOffset":start,"byteLength":len(blob)-start})
            accessor_id = len(doc["accessors"])
            accessor = {"bufferView":view_id,"componentType":5126,
                        "count":len(rows),"type":kind}
            if kind == "SCALAR":
                accessor["min"] = [ticks[0]]
                accessor["max"] = [ticks[-1]]
            doc["accessors"].append(accessor)
            indices.append(accessor_id)
        samplers.append({"input":indices[0],"output":indices[1],"interpolation":"LINEAR"})
        channels.append({"sampler":len(samplers)-1,"target":{"node":target[name],"path":path}})
    doc["animations"] = [{"name":ATTACK,"samplers":samplers,"channels":channels}]
    doc["buffers"][0]["byteLength"] = len(blob)
    return pack_glb(doc, bytes(blob)), {"attack":ATTACK,"attackDurationSeconds":round(duration,4),
                                         "nativeLargeChannels":len(channels),"restDifferences":rest_differences,
                                         "unchangedOriginalBinaryPrefixBytes":len(body),
                                         "addedAnimationBytes":len(blob)-len(body)}


def verify_katana(data):
    doc, binary = parse_glb(data)
    if not doc.get("meshes") or not doc.get("materials") or not doc.get("images"):
        raise ValueError("katana mesh/material/texture missing")
    if any("uri" in b for b in doc.get("buffers", [])) or any("uri" in i for i in doc["images"]):
        raise ValueError("katana has external dependencies")
    if len(binary) < doc["buffers"][0]["byteLength"]:
        raise ValueError("katana binary is incomplete")
    return {"meshCount":len(doc["meshes"]),"materialCount":len(doc["materials"]),
            "embeddedImages":len(doc["images"])}


def main():
    with zipfile.ZipFile(ANIMATION_ARCHIVE) as animations_archive:
        animation_names = animations_archive.namelist()
        attack_path = unique(animation_names, "/gltf/Rig_Large/Rig_Large_CombatMelee.glb")
        attack_bytes = animations_archive.read(attack_path)
        attack_license_path = unique(animation_names, "/License.txt")
        attack_license = animations_archive.read(attack_license_path)
        if b"CC0" not in attack_license or b"Kay Lousberg" not in attack_license:
            raise ValueError("unexpected Large animation license")
    license_bytes = None
    with zipfile.ZipFile(ARCHIVE) as archive:
        names = archive.namelist()
        license_source = unique(names, "/License.txt")
        license_bytes = archive.read(license_source)
        if b"CC0" not in license_bytes or b"Kay Lousberg" not in license_bytes:
            raise ValueError("unexpected license")
        source_rig_paths = [unique(names, f"/Rig_Large_{part}.glb") for part in ("General","MovementBasic")]
        rig_clips = {}
        for path in source_rig_paths:
            rig, _ = parse_glb(archive.read(path))
            rig_clips[path.split("/")[-1]] = [a["name"] for a in rig["animations"]]
        if any("Attack" in clip for clips in rig_clips.values() for clip in clips):
            raise ValueError("Series 6 gained a native large-rig attack; reconsider retarget")
        files = {}
        outputs = {}
        for name in CHARACTERS:
            path = unique(names, f"/characters/{name}.glb")
            original = archive.read(path)
            if sha(original) != sha((ACERVO / f"{name}.glb").read_bytes()):
                raise ValueError(f"acervo and ZIP differ for {name}")
            derived, info = add_attack(original, attack_bytes)
            outputs[f"{name}.glb"] = derived
            files[f"{name}.glb"] = {"zipMember":path,"sourceSha256":sha(original),
                                     "outputSha256":sha(derived),"outputBytes":len(derived),**info}
        katana = (ACERVO / "4GTN_Katana.glb").read_bytes()
        katana_info = verify_katana(katana)
        prop_source = unique(names, "/assets/gltf/4GTN_Katana.gltf")
        prop_dir = prop_source.rsplit("/", 1)[0] + "/"
        prop_doc = json.loads(archive.read(prop_source))
        source_bin = prop_dir + prop_doc["buffers"][0]["uri"]
        source_image = prop_dir + prop_doc["images"][0]["uri"]
        packaged, packaged_binary = parse_glb(katana)
        image_view = packaged["bufferViews"][packaged["images"][0]["bufferView"]]
        image_start = image_view.get("byteOffset", 0)
        if (packaged_binary[:len(archive.read(source_bin))] != archive.read(source_bin)
                or packaged_binary[image_start:image_start+image_view["byteLength"]] != archive.read(source_image)):
            raise ValueError("katana differs from original geometry or texture")
        outputs["4GTN_Katana.glb"] = katana
        files["4GTN_Katana.glb"] = {"source":"acervo/4GTN_Katana.glb",
                                      "zipSources":{n:sha(archive.read(n)) for n in (prop_source, source_bin, source_image)},
                                      "sourceSha256":sha(katana),"outputSha256":sha(katana),
                                      "outputBytes":len(katana),**katana_info}
        manifest = {"package":ARCHIVE.name,"author":"Kay Lousberg","license":"CC0 1.0",
                    "licenseSource":license_source,"licenseSha256":sha(license_bytes),
                    "largeRigNativeClips":rig_clips,
                    "attackSource":{"archive":ANIMATION_ARCHIVE.name,"member":attack_path,
                                    "sha256":sha(attack_bytes),"license":"KayKit Character Animations 1.1 FREE CC0",
                                    "licenseSource":attack_license_path,
                                    "licenseSha256":sha(attack_license),
                                    "clip":ATTACK,"method":"69 native Large TRS channels on identical 23-joint hierarchy; corrected only head-rest translation (+0.115 m)"},
                    "files":files,"reproduce":"python tools/modern/prepare-forge-robots.py"}
    DEST.mkdir(parents=True, exist_ok=True)
    for filename, data in outputs.items():
        (DEST / filename).write_bytes(data)
    (DEST / "SOURCE-Robots.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n",encoding="utf8")
    print(json.dumps({"ok":True,"files":{n:len(d) for n,d in outputs.items()},
                      "nativeLargeAttack":True,"attack":ATTACK},ensure_ascii=False))


if __name__ == "__main__":
    main()
