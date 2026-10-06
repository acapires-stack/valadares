"""Build the small in-game audio selection from Alcione's purchased ZIP.

Requires a local ffmpeg. The source archive is read in place; only chosen MP3s
are written to modern/assets/audio. Run with --check to verify an existing set.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "modern" / "assets" / "audio"
DEFAULT_ZIP = Path.home() / "Downloads" / "Gamemaster_Audio_Pro_Sound_Collection_v1.3_16bit_44.1k.zip"
FILES = {
    "melee-1": "Whooshes/whoosh_weapon_knife_swing_01.wav",
    "melee-2": "Whooshes/whoosh_weapon_knife_swing_02.wav",
    "ranged-1": "Guns_Weapons/Bow_Arrow/bow_crossbow_arrow_shoot_type1_01.wav",
    "ranged-2": "Guns_Weapons/Bow_Arrow/bow_crossbow_arrow_shoot_type1_02.wav",
    "wand": "Magic_Spells/spell_harness_magic_01.wav",
    "damage": "Punches/punch_general_body_impact_01.wav",
    "kill": "Punches/punch_low_deep_impact_01.wav",
    "spell-generic": "Magic_Spells/whoosh_magic_spell_01.wav",
    "spell-fire": "Magic_Spells/fireball_blast_projectile_spell_01.wav",
    "spell-ice": "Magic_Spells/ice_spell_freeze_small_01.wav",
    "spell-dark": "Magic_Spells/twinkle_glitter_dark_spell_01.wav",
    "pickup": "Collectibles_Items_Powerup/collect_item_01.wav",
    "critical": "Guns_Weapons/Knife_Sword_Pick/sword_hit_impact_heavy_01.wav",
    "rare-loot": "Magic_Spells/special_item_popup_01.wav",
    "boss-reward": "Collectibles_Items_Powerup/collectable_item_bonus_01.wav",
    "forge-success": "Collectibles_Items_Powerup/jingle_chime_01_positive.wav",
    "forge-failure": "Collectibles_Items_Powerup/jingle_chime_16_negative.wav",
    "forge-cancelled": "Collectibles_Items_Powerup/collect_item_jingle_fail_02.wav",
    "training-done": "Collectibles_Items_Powerup/chime_bell_positive_ring_01.wav",
    "levelup": "Collectibles_Items_Powerup/jingle_chime_03_positive.wav",
    "death": "Collectibles_Items_Powerup/game_over_dark_bell_chime_01.wav",
    "foot-grass-1": "Footsteps/footstep_grass_walk_01.wav",
    "foot-grass-2": "Footsteps/footstep_grass_walk_02.wav",
    "foot-dirt-1": "Footsteps/footstep_dirt_walk_run_01.wav",
    "foot-dirt-2": "Footsteps/footstep_dirt_walk_run_02.wav",
    "foot-stone-1": "Footsteps/footstep_concrete_walk_01.wav",
    "foot-stone-2": "Footsteps/footstep_concrete_walk_02.wav",
    "foot-wood-1": "Footsteps/footstep_wood_walk_01.wav",
    "foot-wood-2": "Footsteps/footstep_wood_walk_02.wav",
    "ambient-pz": "Backgrounds/background_quiet_urban_park_loop_01.wav",
    "ambient-forest": "Animals_Nature_Ambiences/fantasy_jungle_forrest_loop_01.wav",
    "ambient-cave": "Animals_Nature_Ambiences/cave_ambience_loop_01.wav",
    "ambient-interior": "Backgrounds/background_room_tone_loop_01.wav",
}
# A launch is air/string/magic movement; contact is a separate confirmed event.
# Four recorded variations use a shuffle bag in game-audio.js, independent of cadence.
for i in range(1, 5):
    FILES[f"melee-{i}"] = f"Whooshes/whoosh_weapon_knife_swing_{i:02}.wav"
    FILES[f"ranged-{i}"] = f"Guns_Weapons/Bow_Arrow/bow_crossbow_arrow_shoot_type1_{i:02}.wav"
    FILES[f"impact-melee-{i}"] = f"Guns_Weapons/Knife_Sword_Pick/sword_hit_impact_{i:02}.wav"
    FILES[f"impact-ranged-{i}"] = f"Punches/punch_general_body_impact_{i:02}.wav"
    for surface, recording in {"grass": "grass_walk", "dirt": "dirt_walk_run",
                               "stone": "concrete_walk", "wood": "wood_walk"}.items():
        FILES[f"foot-{surface}-{i}"] = f"Footsteps/footstep_{recording}_{i:02}.wav"
for i in range(1, 3):
    FILES[f"impact-magic-{i}"] = f"Magic_Spells/magic_deflect_spell_impact{i}.wav"
MUSIC = {
    "music-pz-tree": "zz_Bonus_Music_zz/music_calm_tree_of_life.wav",
    "music-pz-lake": "zz_Bonus_Music_zz/music_calm_green_lake_serenade.wav",
    "music-field": "zz_Bonus_Music_zz/music_misty_woods_calling.wav",
    "music-cave": "zz_Bonus_Music_zz/music_epic_orchestral_bg_underscore.wav",
}
TRIM_SECONDS = {"wand": 1.0, "spell-dark": 1.25, "spell-fire": 1.2,
                "spell-generic": 0.85, "pickup": 0.7, "critical": 0.35,
                "impact-magic-1": 0.65, "impact-magic-2": 0.65}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, default=DEFAULT_ZIP)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if not args.check and not ffmpeg:
        parser.error("ffmpeg local não encontrado")
    manifest_path = DEST / "manifest.json"
    if args.check:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for item in manifest["files"]:
            path = DEST / item["name"]
            assert path.is_file() and path.stat().st_size == item["bytes"] and digest(path) == item["sha256"], path
        assert {item["name"] for item in manifest["files"]} == {f"{key}.mp3" for key in FILES | MUSIC}
        print(f"OK: {len(manifest['files'])} arquivos, {sum(i['bytes'] for i in manifest['files'])} bytes")
        return

    with zipfile.ZipFile(args.zip) as archive:
        names = archive.namelist()
        members = {}
        for key, suffix in (FILES | MUSIC).items():
            found = [name for name in names if name.endswith("/" + suffix)]
            if len(found) != 1:
                raise ValueError(f"Fonte ausente/ambígua: {suffix}")
            members[key] = found[0]
        DEST.mkdir(parents=True, exist_ok=True)
        items = []
        with tempfile.TemporaryDirectory(prefix="valadares-audio-") as temp:
            source = Path(temp) / "source.wav"
            for key, member in members.items():
                info = archive.getinfo(member)
                # zipfile validates each selected member's CRC while reading it.
                source.write_bytes(archive.read(info))
                target = DEST / f"{key}.mp3"
                bitrate = "96k" if key in MUSIC else "48k" if key.startswith("ambient-") else "64k"
                command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source)]
                if key in TRIM_SECONDS:
                    end = TRIM_SECONDS[key]
                    command += ["-af", f"atrim=end={end},afade=t=out:st={end - 0.2}:d=0.2"]
                command += ["-ac", "2" if key in MUSIC else "1",
                            "-ar", "44100" if key in MUSIC else "22050", "-codec:a", "libmp3lame",
                            "-b:a", bitrate, str(target)]
                proc = subprocess.run(command,
                                      capture_output=True, text=True)
                if proc.returncode:
                    raise RuntimeError(f"ffmpeg {member}: {proc.stderr}")
                items.append({"name": target.name, "source": "/".join(member.split("/")[2:]),
                              "bytes": target.stat().st_size, "sha256": digest(target)})
    manifest_path.write_text(json.dumps({"source": args.zip.name, "files": items}, indent=2) + "\n", encoding="utf-8")
    total = sum(item["bytes"] for item in items)
    print(f"Criados {len(items)} arquivos, {total} bytes")
    if total > 8_000_000:
        raise ValueError("Seleção acima do alvo de 8 MB")


if __name__ == "__main__":
    main()
