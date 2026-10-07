// Isolated KayKit Adventurers 2.0 catalog. Importing it does not change the
// active appearance choices, account data, weapons, or character renderer.
const base = './assets/adventurers2/';
const medium = Object.freeze({
  rig: 'Rig_Medium',
  animations: Object.freeze([
    `${base}animations/Rig_Medium_General.glb`,
    `${base}animations/Rig_Medium_MovementBasic.glb`,
    `${base}animations/Rig_Medium_CombatMelee.glb`,
    `${base}animations/Rig_Medium_CombatRanged.glb`,
  ]),
});
const large = Object.freeze({
  rig: 'Rig_Large',
  animations: Object.freeze([
    `${base}animations/Rig_Large_General.glb`,
    `${base}animations/Rig_Large_MovementBasic.glb`,
    `${base}animations/Rig_Large_CombatExpanded.glb`,
  ]),
});

function adventurer(id, name, model, atlas, tier, rig = medium, otherModels = []) {
  const texture = `${base}textures/${atlas}_texture`;
  return Object.freeze({
    id,
    name,
    sourceModel: model,
    asset: `${base}characters/${model}.glb`,
    tier,
    priceGold: tier === 'FREE' ? 0 : 5000, // Suggested in-game price; not an active purchase rule.
    rig: rig.rig,
    animationAssets: rig.animations,
    textureVariants: Object.freeze({
      original: `${texture}.png`,
      alt_A: `${texture}_alt_A.png`,
      alt_B: `${texture}_alt_B.png`,
      alt_C: `${texture}_alt_C.png`,
    }),
    textureVariantPriceGold: Object.freeze({original: 0, alt_A: 0, alt_B: 0, alt_C: 0}),
    authoredModelVariants: Object.freeze(otherModels.map(x => `${base}characters/${x}.glb`)),
  });
}

export const ADVENTURERS2 = Object.freeze([
  adventurer('knight_v2', 'Cavaleiro 2.0', 'Knight', 'knight', 'FREE'),
  adventurer('mage_v2', 'Mago 2.0', 'Mage', 'mage', 'FREE'),
  adventurer('rogue_v2', 'Andarilho 2.0', 'Rogue', 'rogue', 'FREE', medium, ['Rogue_Hooded']),
  adventurer('barbarian_v2', 'Bárbaro 2.0', 'Barbarian', 'barbarian', 'FREE'),
  adventurer('ranger', 'Arqueiro', 'Ranger', 'ranger', 'FREE'),
  adventurer('engineer', 'Engenheiro', 'Engineer', 'engineer', 'EXTRA'),
  adventurer('druid', 'Druida', 'Druid', 'druid', 'EXTRA'),
  adventurer('barbarian_large', 'Bárbaro robusto', 'Barbarian_Large', 'barbarian', 'EXTRA', large),
]);

export const ADVENTURERS2_BY_ID = Object.freeze(Object.fromEntries(ADVENTURERS2.map(x => [x.id, x])));
export const ADVENTURERS2_PROPS = Object.freeze({
  bow: `${base}props/bow_withString.glb`,
  arrow: `${base}props/arrow_bow.glb`,
  quiver: `${base}props/quiver.glb`,
  sword: `${base}props/sword_1handed.glb`,
  swordTwoHanded: `${base}props/sword_2handed.glb`,
  axe: `${base}props/axe_1handed.glb`,
  staff: `${base}props/staff.glb`,
  druidStaff: `${base}props/druid_staff.glb`,
  engineerWrench: `${base}props/engineer_Wrench.glb`,
  wand: `${base}props/wand.glb`,
  // Already imported from KayKit Series 6; Adventurers 2.0 has no spear prop.
  spear: './assets/characters-series6/PlantWarrior_Spear.glb',
});
