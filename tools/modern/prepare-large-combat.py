"""Retarget selected KayKit Medium combat clips to the purchased Large rig.

Only new output is written. Large native clips remain in their original GLB.
The source and target must have identical named joint hierarchies. Each keyed
rotation is transferred relative to its bone's rest rotation; each translation
delta is scaled by that bone's rest length and added to the Large rest pose.
No character mesh, skin, proportion, material, or authored Large clip changes.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path
import struct


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "modern/assets/adventurers2"
OUTPUT = ASSETS / "animations/Rig_Large_CombatExpanded.glb"
REPORT = Path(r"C:\Users\Alcione\Documents\Codex\2026-10-06\valadare\work\harmonizacao-2026-10-07\large-animations\retarget-report.json")
SOURCES = {
    "Rig_Medium_CombatRanged.glb": (
        "Ranged_Bow_Draw", "Ranged_Bow_Release", "Ranged_2H_Shoot",
        "Ranged_Magic_Shoot",
    ),
    "Rig_Medium_CombatMelee.glb": ("Melee_2H_Attack_Stab",),
}


def read_glb(path):
    data = path.read_bytes()
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2 or struct.unpack_from("<I", data, 8)[0] != len(data):
        raise ValueError(f"bad GLB: {path}")
    size, kind = struct.unpack_from("<I4s", data, 12)
    if kind != b"JSON":
        raise ValueError(f"missing JSON chunk: {path}")
    doc = json.loads(data[20:20 + size])
    offset = 20 + size
    bin_size, bin_kind = struct.unpack_from("<I4s", data, offset)
    if bin_kind != b"BIN\0":
        raise ValueError(f"missing BIN chunk: {path}")
    blob = data[offset + 8:offset + 8 + bin_size]
    return doc, bytearray(blob)


def pack_glb(doc, blob):
    encoded = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode()
    encoded += b" " * (-len(encoded) % 4)
    blob += b"\0" * (-len(blob) % 4)
    return (struct.pack("<4sII", b"glTF", 2, 28 + len(encoded) + len(blob))
            + struct.pack("<I4s", len(encoded), b"JSON") + encoded
            + struct.pack("<I4s", len(blob), b"BIN\0") + blob)


def node_index(doc):
    names = [n.get("name") for n in doc["nodes"] if n.get("name")]
    if len(names) != len(set(names)):
        raise ValueError("duplicate node names")
    return {n.get("name"): i for i, n in enumerate(doc["nodes"]) if n.get("name")}


def joint_parent_names(doc):
    names = {i: n.get("name") for i, n in enumerate(doc["nodes"])}
    return {names[c]: names[p] for p, node in enumerate(doc["nodes"])
            for c in node.get("children", []) if names[c] and names[p]}


def values(doc, blob, index):
    accessor = doc["accessors"][index]
    if accessor["componentType"] != 5126 or accessor.get("sparse"):
        raise ValueError(f"unsupported accessor {index}")
    width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    view = doc["bufferViews"][accessor["bufferView"]]
    stride = view.get("byteStride", width * 4)
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from("<" + "f" * width, blob, base + i * stride)
            for i in range(accessor["count"])]


def append_values(doc, blob, rows, kind):
    width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[kind]
    blob += b"\0" * (-len(blob) % 4)
    offset = len(blob)
    blob.extend(struct.pack("<" + "f" * (len(rows) * width), *(v for row in rows for v in row)))
    view_index = len(doc["bufferViews"])
    doc["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(rows) * width * 4})
    accessor_index = len(doc["accessors"])
    accessor = {"bufferView": view_index, "componentType": 5126,
                "count": len(rows), "type": kind}
    if kind == "SCALAR":
        accessor["min"] = [min(row[0] for row in rows)]
        accessor["max"] = [max(row[0] for row in rows)]
    doc["accessors"].append(accessor)
    return accessor_index


def quat_mul(a, b):
    x, y, z, w = a
    X, Y, Z, W = b
    return (w*X + x*W + y*Z - z*Y,
            w*Y - x*Z + y*W + z*X,
            w*Z + x*Y - y*X + z*W,
            w*W - x*X - y*Y - z*Z)


def quat_inv(q):
    length2 = sum(v*v for v in q)
    return tuple(v / length2 for v in (-q[0], -q[1], -q[2], q[3]))


def quat_unit(q):
    length = math.sqrt(sum(v*v for v in q))
    return tuple(v / length for v in q)


def vector(node, key, default):
    return node.get(key, default)


def main():
    base_path = ASSETS / "animations/Rig_Large_CombatMelee.glb"
    model_path = ASSETS / "characters/Barbarian_Large.glb"
    base, binary = read_glb(base_path)
    model, _ = read_glb(model_path)
    target_names = node_index(base)
    model_names = node_index(model)
    large_joints = {base["nodes"][i]["name"] for i in base["skins"][0]["joints"]}
    model_joints = {model["nodes"][i]["name"] for i in model["skins"][0]["joints"]}
    if large_joints != model_joints or len(large_joints) != 23:
        raise ValueError("Large character and animation joint sets differ")
    report = {"algorithm": "local rest rotation delta; per-bone rest-length translation delta",
              "nativeLargeSource": base_path.name, "targetCharacter": model_path.name,
              "clips": {}, "sources": {}, "nativeClips": [a["name"] for a in base["animations"]]}
    for source_file, clip_names in SOURCES.items():
        source_path = ASSETS / "animations" / source_file
        source, source_binary = read_glb(source_path)
        source_names = node_index(source)
        source_joints = {source["nodes"][i]["name"] for i in source["skins"][0]["joints"]}
        if source_joints != large_joints:
            raise ValueError(f"{source_file}: joint names differ")
        source_parents = joint_parent_names(source)
        target_parents = joint_parent_names(base)
        if any(source_parents.get(n) != target_parents.get(n) for n in large_joints if n != "root"):
            raise ValueError(f"{source_file}: hierarchy differs")
        report["sources"][source_file] = hashlib.sha256(source_path.read_bytes()).hexdigest()
        available = {a["name"]: a for a in source["animations"]}
        for name in clip_names:
            if name not in available or name in report["nativeClips"]:
                raise ValueError(f"clip absent or collides: {name}")
            animation = available[name]
            target_animation = {"name": name, "channels": [], "samplers": []}
            times_cache = {}
            channels_seen = set()
            max_translation_delta = 0.0
            for channel in animation["channels"]:
                src_node = source["nodes"][channel["target"]["node"]]
                bone = src_node["name"]
                path = channel["target"]["path"]
                if bone not in model_names or bone not in target_names:
                    raise ValueError(f"{name}: missing target {bone}")
                if (bone, path) in channels_seen:
                    raise ValueError(f"{name}: duplicate channel {bone}/{path}")
                channels_seen.add((bone, path))
                src_sampler = animation["samplers"][channel["sampler"]]
                if src_sampler.get("interpolation", "LINEAR") != "LINEAR":
                    raise ValueError(f"{name}: unsupported interpolation")
                source_input = src_sampler["input"]
                if source_input not in times_cache:
                    times = values(source, source_binary, source_input)
                    times_cache[source_input] = append_values(base, binary, times, "SCALAR")
                output = values(source, source_binary, src_sampler["output"])
                if len(output) != len(values(source, source_binary, source_input)):
                    raise ValueError(f"{name}: key counts differ")
                target_node = model["nodes"][model_names[bone]]
                if path == "rotation":
                    source_rest = vector(src_node, "rotation", (0, 0, 0, 1))
                    target_rest = vector(target_node, "rotation", (0, 0, 0, 1))
                    offset = quat_mul(target_rest, quat_inv(source_rest))
                    transformed = []
                    for row in output:
                        q = quat_unit(quat_mul(offset, row))
                        if transformed and sum(a*b for a, b in zip(q, transformed[-1])) < 0:
                            q = tuple(-v for v in q)
                        transformed.append(q)
                    kind = "VEC4"
                elif path == "translation":
                    source_rest = vector(src_node, "translation", (0, 0, 0))
                    target_rest = vector(target_node, "translation", (0, 0, 0))
                    source_length = math.sqrt(sum(v*v for v in source_rest))
                    target_length = math.sqrt(sum(v*v for v in target_rest))
                    ratio = target_length / source_length if source_length > 1e-4 else 1.0
                    transformed = [tuple(target_rest[i] + (row[i] - source_rest[i]) * ratio
                                         for i in range(3)) for row in output]
                    max_translation_delta = max(max_translation_delta,
                                                *(math.dist(row, target_rest) for row in transformed))
                    kind = "VEC3"
                elif path == "scale":
                    source_rest = vector(src_node, "scale", (1, 1, 1))
                    target_rest = vector(target_node, "scale", (1, 1, 1))
                    transformed = [tuple(target_rest[i] * row[i] / source_rest[i]
                                         for i in range(3)) for row in output]
                    kind = "VEC3"
                else:
                    raise ValueError(f"{name}: unsupported path {path}")
                output_index = append_values(base, binary, transformed, kind)
                sampler_index = len(target_animation["samplers"])
                target_animation["samplers"].append({"input": times_cache[source_input],
                                                     "output": output_index,
                                                     "interpolation": "LINEAR"})
                target_animation["channels"].append({"sampler": sampler_index,
                                                     "target": {"node": target_names[bone], "path": path}})
            if not large_joints.issubset({bone for bone, _ in channels_seen}):
                raise ValueError(f"{name}: incomplete joint coverage")
            base["animations"].append(target_animation)
            report["clips"][name] = {"source": source_file,
                                     "channels": len(target_animation["channels"]),
                                     "bones": len({bone for bone, _ in channels_seen}),
                                     "durationSeconds": max(max(row[0] for row in values(source, source_binary, s["input"]))
                                                            for s in animation["samplers"]),
                                     "maxLocalTranslationDelta": round(max_translation_delta, 5)}
    base["buffers"][0]["byteLength"] = len(binary)
    data = pack_glb(base, binary)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(data)
    check, _ = read_glb(OUTPUT)
    if [a["name"] for a in check["animations"]] != report["nativeClips"] + list(report["clips"]):
        raise ValueError("output clip verification failed")
    report["output"] = {"path": str(OUTPUT), "bytes": len(data),
                        "sha256": hashlib.sha256(data).hexdigest(),
                        "clipCount": len(check["animations"])}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["output"], indent=2))


if __name__ == "__main__":
    main()
