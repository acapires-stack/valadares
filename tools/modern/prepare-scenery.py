"""Build the small runtime scenery set from Alcione's original KayKit archives.

The ZIPs stay in Downloads. Only selected glTF meshes and their dependencies are
read; the browser receives compact, self-contained GLB files.
"""

from __future__ import annotations

import hashlib
import json
import struct
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DOWNLOADS = Path.home() / "Downloads"
OUTPUT = ROOT / "modern" / "assets" / "scenery"
PACKS = {
    "forest": ("KayKit_Forest_Nature_Pack_1.0_EXTRA.zip", "KayKit_Forest_Nature_Pack_1.0_EXTRA/Assets/gltf/"),
    "dungeon": ("KayKit_Dungeon_Pack_1.1_EXTRA.zip", "KayKit_Dungeon_Pack_1.1_EXTRA/Assets/gltf/"),
}
SELECTED = {
    "forest": [
        "Color1/Tree_1_A_Color1", "Color1/Tree_2_A_Color1", "Color1/Tree_3_A_Color1",
        "Color1/Tree_4_A_Color1", "Color1/Tree_5_A_Color1", "Color1/Tree_6_A_Color1",
        "Color1/Tree_7_A_Color1", "Color1/Tree_Bare_1_A_Color1",
        "Color2/Tree_5_B_Color2", "Color2/Tree_6_B_Color2",
        "Color1/Rock_1_A_Color1", "Color1/Rock_2_A_Color1",
        "Color1/Rock_3_A_Color1", "Color1/Rock_5_A_Color1", "Color1/Rock_6_A_Color1",
        "Color1/Bush_1_A_Color1", "Color1/Bush_2_A_Color1",
        "Color1/Bush_3_A_Color1", "Color1/Bush_4_A_Color1",
    ],
    "dungeon": [
        "barrel_large", "barrel_small_stack", "crates_stacked", "chest",
        "banner_green", "torch_mounted", "wall_broken", "rubble_half",
        "table_medium", "chair", "bar_straight_A", "bartop_A_medium",
        "bed_A_single", "bookcase_double_decoratedA", "bookcase_single_decoratedB",
        "shelf_small_books", "candle_lit", "table_round_small", "table_long",
        "bottle_A_green", "plate_food_A", "bucket_pickaxes", "pickaxe",
        "scaffold_frame_small", "rocks_gold", "pillar_decorated",
        "torch_lit", "sword_shield", "wall_cracked", "wall_inset_candles",
        "banner_blue", "stool_round", "shelves_decorated",
    ],
}


def pad(data: bytes, fill: bytes = b"\0") -> bytes:
    return data + fill * ((-len(data)) % 4)


def glb(source: zipfile.ZipFile, prefix: str, name: str) -> bytes:
    folder = prefix + name.rsplit("/", 1)[0] + "/" if "/" in name else prefix
    original = json.loads(source.read(prefix + name + ".gltf"))
    if len(original["buffers"]) != 1:
        raise ValueError(f"Unexpected buffer layout: {name}")
    binary = bytearray(pad(source.read(folder + original["buffers"][0]["uri"])))
    for image in original.get("images", []):
        uri = image.pop("uri")
        if "/" in uri or "\\" in uri or uri.startswith("."):
            raise ValueError(f"Unexpected image path: {uri}")
        raw = source.read(folder + uri)
        image["bufferView"] = len(original["bufferViews"])
        image["mimeType"] = "image/png"
        original["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(raw)})
        binary.extend(pad(raw))
    original["buffers"] = [{"byteLength": len(binary)}]
    descriptor = pad(json.dumps(original, separators=(",", ":")).encode(), b" ")
    total = 12 + 8 + len(descriptor) + 8 + len(binary)
    return (struct.pack("<4sII", b"glTF", 2, total)
            + struct.pack("<I4s", len(descriptor), b"JSON") + descriptor
            + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = []
    previous = OUTPUT / "manifest.json"
    checked = json.loads(previous.read_text(encoding="utf-8")).get("archives_crc_checked", []) if previous.exists() else []

    for pack, (filename, prefix) in PACKS.items():
        with zipfile.ZipFile(DOWNLOADS / filename) as archive:
            license_name = filename.removesuffix(".zip") + "/License.txt"
            (OUTPUT / f"LICENSE-{pack}.txt").write_bytes(archive.read(license_name))
            for name in SELECTED[pack]:
                data = glb(archive, prefix, name)
                target = OUTPUT / pack / f"{name.rsplit('/', 1)[-1]}.glb"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                records.append({"pack": pack, "archive": filename,
                                "source": prefix + name + ".gltf",
                                "runtime": str(target.relative_to(OUTPUT)).replace("\\", "/"),
                                "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    manifest = {"creator": "Kay Lousberg", "license": "CC0 1.0",
                "archives_crc_checked": checked, "assets": records,
                "archive_validation_note": "CRC integral herdado do manifesto anterior; esta seleção leu apenas as entradas utilizadas",
                "runtime_bytes": sum(item["bytes"] for item in records)}
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Selected entries read: {len(records)} GLB; {manifest['runtime_bytes']:,} runtime bytes; prior CRC record: {len(checked)} archives")


if __name__ == "__main__":
    main()
