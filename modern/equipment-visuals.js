// KayKit Fantasy Weapons Bits 1.0 EXTRA plus real crossbows from Adventurers 2.0.
// Item-colored variants preserve the source geometry and its matching inventory icon.
// Model identity is independent of combat stats. Neither package has a wooden club.
const MODEL_BY_ITEM = Object.freeze({
 ADAGA:'dagger_A', ADAGA_DUPLA:'dagger_B',
 ESPADA:'sword_B', ESPADA_OSSO:'sword_B__ESPADA_OSSO', SABRE:'sword_C', ESPADA_ACO:'sword_D',
 LAMINA_DRACO_1H:'sword_F', ESPADA_GUARDIAO:'sword_E__ESPADA_GUARDIAO',
 LAMINA_ETERNA_1H:'sword_E__LAMINA_ETERNA_1H', LAMINA_CELESTIAL_1H:'sword_G',
 ESPADA_LONGA:'sword_E', ESPADA_DRACO:'sword_F', ESPADA_HL:'sword_E__ESPADA_HL',
 ESPADA_ETERNA:'sword_E__ESPADA_ETERNA', ESPADA_INFINITA:'sword_G',
 // Display names match these authored silhouettes: rustic hammer, iron mace,
 // metal-banded quarterstaff, and a single steel dagger. Combat IDs stay stable.
 PORRETE:'hammer_A', CLAVA:'hammer_B', BORDAO:'staff_A',
 MACA:'hammer_A', MARTELO:'hammer_B', MARRETA:'hammer_C', MACA_GIGANTE:'hammer_D',
 MARTELO_GOLEM:'hammer_C', MARTELO_COLOSSO:'hammer_D__MARTELO_COLOSSO',
 MARTELO_ETERNAL:'hammer_D__MARTELO_ETERNAL', MARTELO_CELESTIAL:'hammer_D__MARTELO_CELESTIAL',
 MACHADO:'axe_A', MACHADO_MINO:'axe_B', MACHADO_FORJA:'axe_C__MACHADO_FORJA',
 MACHADO_RUINAS:'axe_D__MACHADO_RUINAS', MACHADO_CATACLISMO:'axe_D__MACHADO_CATACLISMO', MACHADO_ABISMO:'axe_D__MACHADO_ABISMO',
 ARCO:'bow_A_withString', ARCO_CACA:'bow_B_withString', ARCO_DRACO:'bow_B_withString__ARCO_DRACO',
 ARCO_ECLIPSE:'bow_B_withString__ARCO_ECLIPSE', ARCO_ASTRAL:'bow_C_withString__ARCO_ASTRAL',
 BESTA:'crossbow_1handed', BESTA_GUARDIAO:'crossbow_2handed',
 LANCA:'spear_A', LANCA_LONGA:'spear_B', LANCA_DRACO:'spear_B__LANCA_DRACO',
 LANCA_GUARDIAO:'spear_A', LANCA_ETERNA:'spear_B', LANCA_CELESTIAL:'spear_A__LANCA_CELESTIAL',
 ESCUDO_MAD:'shield_C', ESCUDO_FERRO:'shield_B', ESCUDO_OSSO:'shield_A__ESCUDO_OSSO',
 ESCUDO_PEDRA:'shield_A__ESCUDO_PEDRA', ESCUDO_GUARDIAO:'shield_D__ESCUDO_GUARDIAO',
 ESCUDO_ETERNAL:'shield_D__ESCUDO_ETERNAL', ESCUDO_CELESTIAL:'shield_B__ESCUDO_CELESTIAL',
 VARINHA_APRENDIZ:'wand_A', CAJADO_FOGO:'staff_D', CAJADO_GELO:'staff_B',
 CAJADO_RAIO:'staff_C__CAJADO_RAIO', CAJADO_RUNICO:'staff_C__CAJADO_RUNICO', CAJADO_ETERNO:'staff_D',
 CAJADO_ASTRAL:'staff_B__CAJADO_ASTRAL',
});

const KINDS = Object.freeze({
 dagger:'dagger', sword:'sword', staff:'staff', hammer:'mace', axe:'axe',
 bow:'bow', spear:'spear', shield:'shield', wand:'wand',crossbow:'crossbow',
});
const TARGET_HEIGHT = Object.freeze({dagger:.58,sword:.82,staff:1.05,mace:.82,axe:.84,
 bow:.91,spear:1.42,shield:.66,wand:.58,crossbow:.85});
const TWO_HAND_HEIGHT = Object.freeze({sword:1.12,mace:1.04,axe:1.1,staff:1.05});
// Major dimension (metres) from the source glTF POSITION accessors. Bow uses X,
// crossbow uses Z, and other mapped items use Y. Deterministic before fetch.
const MODEL_MAJOR = Object.freeze({
 dagger_A:1.29,dagger_C:1.35,
 sword_A:1.78,sword_B:1.79,sword_C:2.13,sword_D:2.04,
 sword_E:3.25,sword_F:2.58,sword_G:2.29,
 staff_A:2.14,staff_B:2.31,staff_C:2.34,staff_D:2.42,
 hammer_A:1.13,hammer_B:1.51,hammer_C:1.39,hammer_D:1.86,
 axe_A:1.16,axe_B:1.66,axe_C:1.35,axe_D:1.67,
 bow_A_withString:1.96,bow_B_withString:1.92,bow_C_withString:2.74,
 spear_A:3.14,spear_B:3.10,
 shield_A:.98,shield_B:1.33,shield_C:1.33,shield_D:1.64,
 wand_A:1.15,wand_B:1.26,
 crossbow_1handed:1.221884,crossbow_2handed:1.440870,
});
let modelManifest = null;

export function setEquipmentVisualManifest(manifest){
 modelManifest = new Map((manifest?.archives||[]).flatMap(a=>a.models||[])
  .map(m=>[m.name,m]));
}

/**
 * Resolves an exact item identity. For *_PLUS_N the base model stays unchanged.
 * `transform` is relative to the hand holders in actors.js: right holder Z=-90
 * degrees; left shield holder Y=90 degrees. Adventurers 2.0 crossbows use the
 * authored right hand grip with the right holder rotation cancelled by +90 Z.
 * Dimensions are derived from glTF POSITION bounds when manifest has been loaded.
 * No combat definition is mutated and no material is tinted.
 */
export function resolverEquipmentVisual(itemId, definition, slot){
 if(typeof itemId!=='string') return null;
 const baseId=itemId.replace(/_PLUS_\d+$/,'');
 const name=MODEL_BY_ITEM[baseId];
 if(!name) return null;
 const kind=Object.entries(KINDS).find(([prefix])=>name.startsWith(prefix))?.[1];
 if(!kind || (slot==='offhand')!==(kind==='shield')) return null;
 if(definition && !['weapon','wand','offhand'].includes(definition.kind)) return null;
 const bounds=modelManifest?.get(name)?.bounds;
 const extent=bounds ? bounds.max.map((v,i)=>v-bounds.min[i]) : null;
 const twoHand=definition?.hand==='2h';
 const desired=baseId==='BORDAO'?.95:(twoHand&&TWO_HAND_HEIGHT[kind]||TARGET_HEIGHT[kind]);
 const major=extent ? (kind==='bow' ? extent[0] : kind==='crossbow' ? extent[2] : extent[1]) : MODEL_MAJOR[name.split('__')[0]];
 // The hand slot is below the scaled Knight root (~0.45 of authored size).
 // The measured local scale compensates for that inherited character scale.
 const inheritedScaleCorrection=kind==='shield'?1.75:['axe','mace'].includes(kind)?1.6:2.2;
 const scale=kind==='crossbow'?1:major && major>0 ? inheritedScaleCorrection*desired/major : null;
 // Bow source runs along X, crossbow along Z; other held items run along Y.
 const rotation=kind==='shield'?[0,0,90]:kind==='bow'?[0,0,180]:kind==='crossbow'?[0,0,90]:[0,90,180];
 const position=kind==='shield'?[0,0,0]:[0,0,0];
 return Object.freeze({itemId:baseId, name, kind,
  assetURL:new URL(`./assets/weapons-bits/${name}.glb`,import.meta.url).href,
  transform:Object.freeze({position,rotation,scale}),
  measured:!!major,
  idleValidated:['ESPADA','MACHADO','MARTELO','LANCA','ARCO','CAJADO_FOGO','ESCUDO_FERRO','BESTA'].includes(baseId),
  attackValidated:['ESPADA','MACHADO','ARCO','CAJADO_FOGO','BESTA','BESTA_GUARDIAO'].includes(baseId),
  source:kind==='crossbow'?'KayKit Adventurers 2.0 FREE':'KayKit Fantasy Weapons Bits 1.0 EXTRA',license:'CC0'});
}

export const equipmentVisualCatalog=MODEL_BY_ITEM;
export const equipmentVisualGaps=Object.freeze({});
