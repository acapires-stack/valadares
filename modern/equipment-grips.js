// Visual hand grips for the KayKit bow and spear. Does not alter item rules.
// `bodyScale` is the character's final local scale after its width profile.
const SQRT_HALF = Math.SQRT1_2;
const LEGACY_MEDIUM = new Set([
  'Knight', 'Mage', 'Rogue_Hooded', 'Barbarian',
  'Lorekeeper', 'Cleric', 'MagicalGirl',
]);
const MODERN_MEDIUM = new Set([
  'V2_Knight', 'V2_Mage', 'V2_Rogue', 'V2_Rogue_Hooded', 'V2_Barbarian',
  'V2_Ranger', 'V2_Engineer', 'V2_Druid',
]);
const LARGE = 'V2_Barbarian_Large';
const SERIES6 = new Set(['Lorekeeper', 'Cleric', 'MagicalGirl']);

// Quaternions are [x, y, z, w] relative to the existing Z=-90 weapon holder.
// The bow's source long axis is X. These align it vertically, with the bow
// plane facing the model's +Z aim direction at the release pose.
const BOW_MODERN = Object.freeze([SQRT_HALF, 0, SQRT_HALF, 0]);
const BOW_LEGACY = Object.freeze([.5, .5, .5, -.5]);
// Spear_A's source long axis is Y. This points its tip along +Z at the stab.
const SPEAR = Object.freeze([0, 0, SQRT_HALF, SQRT_HALF]);
// Source crossbow's barrel runs along +Z. The authored ranged wrist aims its
// attachment +X forward, so rotate the barrel onto that axis after cancelling
// the shared holder's Z=-90 rotation.
const CROSSBOW = Object.freeze([-.5, .5, .5, .5]);

/**
 * Adjust an existing resolverEquipmentVisual(...).transform for a specific rig.
 * Returns an unchanged transform for other items or unmeasured body scales.
 * A caller applies rotationQuaternion with setLocalRotation(new pc.Quat(...q));
 * other transforms retain their existing Euler rotation path.
 */
export function resolverEmpunhadura(model, kind, transform, bodyScale, itemName) {
  if (!transform || !Number.isFinite(transform.scale) || transform.scale <= 0) return transform;
  const modern = MODERN_MEDIUM.has(model) || model === LARGE;
  const legacy = LEGACY_MEDIUM.has(model);
  if (!modern && !legacy) return transform;
  const sx = Array.isArray(bodyScale) ? bodyScale[0] : bodyScale?.x;
  const sy = Array.isArray(bodyScale) ? bodyScale[1] : bodyScale?.y;
  if (!(Number.isFinite(sx) && sx > 0 && Number.isFinite(sy) && sy > 0)) return transform;

  if (kind === 'bow') {
    // equipment-visuals gives 2.2 * 0.91 / sourceMajor. Correct that size for
    // the final model scale, which differs among Ranger, Druid, and Large.
    // Medium Draw lowers the hand near the ground for part of its windup.
    // A compact bow, gripped slightly below center, clears the floor there.
    const desiredWorldLength = model === LARGE ? 1.25
      : modern || SERIES6.has(model) ? itemName?.startsWith('bow_B_withString') ? .70 : .75
      : itemName?.startsWith('bow_B_withString') ? .86 : .94;
    const scale = transform.scale * desiredWorldLength / (2.2 * .91 * sy);
    return {
      ...transform,
      position: model === LARGE ? [0, 0, 0] : modern ? [0, 0, .42] : SERIES6.has(model) ? [0, 0, .30] : [0, 0, .15],
      rotationQuaternion: legacy ? BOW_LEGACY : BOW_MODERN,
      scale,
    };
  }
  if (kind === 'spear') {
    // Spear_A points along +Z after rotation, so the XZ width profile controls
    // its world length. Move the model toward its tip to grip farther back on
    // the shaft and keep the butt above the floor during the stab windup.
    const spearB = itemName?.startsWith('spear_B');
    const desiredWorldLength = model === LARGE ? 1.90 : 1.42;
    const scale = transform.scale * desiredWorldLength / (2.2 * 1.42 * sx);
    return {...transform, position: spearB && model !== LARGE ? [-.8, -.50, 0] : [-.6, 0, 0], rotationQuaternion: SPEAR, scale};
  }
  if (kind === 'crossbow') {
    return {...transform, rotationQuaternion: CROSSBOW};
  }
  return transform;
}
