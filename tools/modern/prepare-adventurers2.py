"""Prepare the purchased KayKit Adventurers 2.0 as isolated, reproducible assets.

The original character GLBs and authored texture atlases are copied unchanged.
Selected glTF accessories are wrapped into GLBs with their original buffers and
images embedded; no mesh, rig, animation, UV or material is modified.
"""

import hashlib
import json
from pathlib import Path
import struct
import zipfile


ROOT = Path(__file__).resolve().parents[2]
PURCHASES = Path(r"C:\Users\Alcione\Documents\Codex\2026-10-06\valadare\work\compras-kaykit-2026-10-07")
FREE = PURCHASES / "kaykit-adventurers-Free-2.0.zip"
EXTRA = PURCHASES / "kaykit-adventurers-Extra-2.0.zip"
ANIMATIONS = PURCHASES / "kaykit-character-animations-Free-1.1.zip"
DEST = ROOT / "modern/assets/adventurers2"
FREE_PREFIX = "KayKit_Adventurers_2.0_FREE/"
EXTRA_PREFIX = "KayKit_Adventurers_2.0_EXTRA/"
ANIMATIONS_PREFIX = "KayKit_Character_Animations_1.1/"

CHARACTERS = {
    "Knight": ("FREE", "Rig_Medium", "knight"),
    "Mage": ("FREE", "Rig_Medium", "mage"),
    "Rogue": ("FREE", "Rig_Medium", "rogue"),
    "Barbarian": ("FREE", "Rig_Medium", "barbarian"),
    "Ranger": ("FREE", "Rig_Medium", "ranger"),
    "Engineer": ("EXTRA", "Rig_Medium", "engineer"),
    "Druid": ("EXTRA", "Rig_Medium", "druid"),
    "Barbarian_Large": ("EXTRA", "Rig_Large", "barbarian"),
}
SECONDARY = {"Rogue_Hooded": ("FREE", "Rig_Medium", "rogue")}
RIGS = ("Rig_Medium_General", "Rig_Medium_MovementBasic", "Rig_Large_General", "Rig_Large_MovementBasic")
COMBAT_RIGS = ("Rig_Medium_CombatMelee", "Rig_Medium_CombatRanged", "Rig_Large_CombatMelee")
PROPS = (
    "bow_withString", "arrow_bow", "quiver", "sword_1handed", "sword_2handed",
    "axe_1handed", "staff", "druid_staff", "engineer_Wrench", "wand",
)
REQUIRED_CLIPS = {
    "Rig_Medium": {
        "Rig_Medium_General": ("Idle_A", "Hit_A", "Death_A"),
        "Rig_Medium_MovementBasic": ("Running_A",),
        "Rig_Medium_CombatMelee": ("Melee_1H_Attack_Chop", "Melee_2H_Attack_Stab"),
        "Rig_Medium_CombatRanged": ("Ranged_Bow_Draw", "Ranged_Bow_Release", "Ranged_Magic_Shoot"),
    },
    "Rig_Large": {
        "Rig_Large_General": ("Idle_A", "Hit_A", "Death_A"),
        "Rig_Large_MovementBasic": ("Running_A",),
        "Rig_Large_CombatMelee": ("Melee_1H_Slash", "Melee_2H_Attack"),
    },
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def parse_glb(data, label):
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError(f"{label}: invalid GLB header")
    _, version, length = struct.unpack_from("<4sII", data)
    if version != 2 or length != len(data):
        raise ValueError(f"{label}: invalid GLB version/length")
    json_length, chunk_type = struct.unpack_from("<I4s", data, 12)
    if chunk_type != b"JSON":
        raise ValueError(f"{label}: missing JSON chunk")
    return json.loads(data[20:20 + json_length])


def pack_glb(doc, binary):
    encoded = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    encoded += b" " * (-len(encoded) % 4)
    binary += b"\0" * (-len(binary) % 4)
    return (struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + 8 + len(binary))
            + struct.pack("<I4s", len(encoded), b"JSON") + encoded
            + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def pack_prop(archive, source):
    doc = json.loads(archive.read(source))
    base = source.rsplit("/", 1)[0] + "/"
    if len(doc.get("buffers", [])) != 1 or "uri" not in doc["buffers"][0]:
        raise ValueError(f"{source}: unsupported buffers")
    binary_path = base + doc["buffers"][0].pop("uri")
    binary = archive.read(binary_path)
    sources = [source, binary_path]
    for image in doc.get("images", []):
        if "uri" not in image:
            continue
        image_path = base + image.pop("uri")
        image_data = archive.read(image_path)
        sources.append(image_path)
        binary += b"\0" * (-len(binary) % 4)
        image["bufferView"] = len(doc.setdefault("bufferViews", []))
        image["mimeType"] = "image/png"
        doc["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(image_data)})
        binary += image_data
    doc["buffers"][0]["byteLength"] = len(binary)
    result = pack_glb(doc, binary)
    parse_glb(result, source)
    return result, sources


def write_output(name, data, sources, manifest):
    path = DEST / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    manifest["files"][name] = {
        "sources": sources,
        "bytes": len(data),
        "sha256": sha(data),
    }


def main():
    for path in (FREE, EXTRA, ANIMATIONS):
        if not path.is_file():
            raise FileNotFoundError(path)
    with zipfile.ZipFile(FREE) as free, zipfile.ZipFile(EXTRA) as extra, zipfile.ZipFile(ANIMATIONS) as motions:
        for label, archive in (("FREE", free), ("EXTRA", extra), ("ANIMATIONS_FREE", motions)):
            bad = archive.testzip()
            if bad:
                raise ValueError(f"{label} CRC failure: {bad}")
        license_free = free.read(FREE_PREFIX + "License.txt")
        license_extra = extra.read(EXTRA_PREFIX + "License.txt")
        if license_free != license_extra or b"CC0" not in license_free:
            raise ValueError("License mismatch or missing CC0")
        manifest = {
            "pack": "KayKit Adventurers 2.0",
            "author": "Kay Lousberg",
            "sourceUrl": "https://kaylousberg.itch.io/kaykit-adventurers",
            "license": "CC0 1.0",
            "archives": {
                "FREE": {"name": FREE.name, "sha256": sha(FREE.read_bytes())},
                "EXTRA": {"name": EXTRA.name, "sha256": sha(EXTRA.read_bytes())},
                "ANIMATIONS_FREE": {"name": ANIMATIONS.name, "sha256": sha(ANIMATIONS.read_bytes())},
            },
            "characters": {}, "rigs": {}, "props": {}, "compatibility": {}, "files": {},
        }
        write_output("LICENSE.txt", license_free, [{"archive": "FREE", "path": FREE_PREFIX + "License.txt", "sha256": sha(license_free)}], manifest)

        for name, (tier, rig, texture) in {**CHARACTERS, **SECONDARY}.items():
            archive, prefix = (free, FREE_PREFIX) if tier == "FREE" else (extra, EXTRA_PREFIX)
            source = prefix + f"Characters/gltf/{name}.glb"
            data = archive.read(source)
            doc = parse_glb(data, source)
            if len(doc.get("skins", [])) != 1 or not doc.get("meshes"):
                raise ValueError(f"{name}: expected complete skinned character")
            nodes = {n.get("name") for n in doc.get("nodes", [])}
            if "handslot.l" not in nodes or "handslot.r" not in nodes:
                raise ValueError(f"{name}: missing hand sockets")
            if doc.get("animations"):
                raise ValueError(f"{name}: expected external animations, inspect format update")
            # The common FREE files inside EXTRA must be byte-identical.
            if tier == "FREE" and sha(data) != sha(extra.read(EXTRA_PREFIX + f"Characters/gltf/{name}.glb")):
                raise ValueError(f"{name}: FREE differs from EXTRA")
            target = f"characters/{name}.glb"
            write_output(target, data, [{"archive": tier, "path": source, "sha256": sha(data)}], manifest)
            manifest["characters"][name] = {
                "tier": tier, "rig": rig, "asset": target,
                "textureAtlas": texture,
                "meshCount": len(doc["meshes"]),
                "handSockets": ["handslot.l", "handslot.r"],
                "embeddedAnimationNames": [],
            }

        for rig_file in RIGS:
            tier = "EXTRA" if rig_file.startswith("Rig_Large") else "FREE"
            archive, prefix = (extra, EXTRA_PREFIX) if tier == "EXTRA" else (free, FREE_PREFIX)
            rig = rig_file.rsplit("_", 1)[0]
            source = prefix + f"Animations/gltf/{rig}/{rig_file}.glb"
            data = archive.read(source)
            external = ANIMATIONS_PREFIX + f"Animations/gltf/{rig}/{rig_file}.glb"
            if sha(data) != sha(motions.read(external)):
                raise ValueError(f"{rig_file}: Adventurers 2.0 differs from Animations 1.1")
            doc = parse_glb(data, source)
            names = [a.get("name") for a in doc.get("animations", [])]
            if not names:
                raise ValueError(f"{rig_file}: no animation tracks")
            target = f"animations/{rig_file}.glb"
            write_output(target, data, [{"archive": tier, "path": source, "sha256": sha(data)}], manifest)
            manifest["rigs"][rig_file] = {"asset": target, "animationNames": names}

        for rig_file in COMBAT_RIGS:
            rig = rig_file.rsplit("_", 1)[0]
            source = ANIMATIONS_PREFIX + f"Animations/gltf/{rig}/{rig_file}.glb"
            data = motions.read(source)
            doc = parse_glb(data, source)
            names = [a.get("name") for a in doc.get("animations", [])]
            if not names:
                raise ValueError(f"{rig_file}: no combat animation tracks")
            target = f"animations/{rig_file}.glb"
            write_output(target, data, [{"archive": "ANIMATIONS_FREE", "path": source, "sha256": sha(data)}], manifest)
            manifest["rigs"][rig_file] = {"asset": target, "animationNames": names}

        for texture in sorted({t for _, _, t in CHARACTERS.values()}):
            for variant in ("original", "alt_A", "alt_B", "alt_C"):
                suffix = "" if variant == "original" else f"_{variant}"
                source = EXTRA_PREFIX + f"Textures/{texture}_texture{suffix}.png"
                data = extra.read(source)
                if data[:8] != b"\x89PNG\r\n\x1a\n":
                    raise ValueError(f"{source}: invalid PNG")
                target = f"textures/{texture}_texture{suffix}.png"
                write_output(target, data, [{"archive": "EXTRA", "path": source, "sha256": sha(data)}], manifest)
                if variant == "original":
                    free_source = FREE_PREFIX + f"Characters/gltf/{texture}_texture.png"
                    if texture in ("knight", "mage", "rogue", "barbarian", "ranger"):
                        # Texture atlases in EXTRA and FREE must match.
                        free_data = free.read(free_source)
                        if sha(data) != sha(free_data):
                            raise ValueError(f"{texture}: base texture differs FREE/EXTRA")

        for name in PROPS:
            tier = "EXTRA" if name in ("druid_staff", "engineer_Wrench") else "FREE"
            archive, prefix = (extra, EXTRA_PREFIX) if tier == "EXTRA" else (free, FREE_PREFIX)
            source = prefix + f"Assets/gltf/{name}.gltf"
            data, parts = pack_prop(archive, source)
            target = f"props/{name}.glb"
            write_output(target, data, [{"archive": tier, "path": p, "sha256": sha(archive.read(p))} for p in parts], manifest)
            manifest["props"][name] = {"tier": tier, "asset": target}

        for name, character in manifest["characters"].items():
            model = parse_glb((DEST / character["asset"]).read_bytes(), name)
            model_nodes = {node.get("name") for node in model["nodes"]}
            checks = {}
            for rig_file, clip_names in REQUIRED_CLIPS[character["rig"]].items():
                rig = parse_glb((DEST / manifest["rigs"][rig_file]["asset"]).read_bytes(), rig_file)
                available = {a.get("name"): a for a in rig["animations"]}
                for clip_name in clip_names:
                    if clip_name not in available:
                        raise ValueError(f"{name}: missing {clip_name}")
                    target_nodes = {rig["nodes"][ch["target"]["node"]].get("name") for ch in available[clip_name]["channels"]}
                    missing = target_nodes - model_nodes
                    if missing:
                        raise ValueError(f"{name}/{clip_name}: absent target bones {sorted(missing)}")
                    checks[clip_name] = len(target_nodes)
            manifest["compatibility"][name] = checks

        (DEST / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Prepared {len(CHARACTERS)} characters, {len(SECONDARY)} authored variant, {len(RIGS) + len(COMBAT_RIGS)} rig sets, {len(PROPS)} props, and 28 texture atlases in {DEST}")


if __name__ == "__main__":
    main()
