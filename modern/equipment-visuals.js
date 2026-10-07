// KayKit Fantasy Weapons Bits 1.0 EXTRA plus real crossbows from Adventurers 2.0.
// Model identity is independent of combat stats. Neither package has a wooden club.
const MODEL_BY_ITEM = Object.freeze({
 ADAGA:'dagger_A', ADAGA_DUPLA:'dagger_C',
 ESPADA:'sword_B', ESPADA_OSSO:'sword_A', SABRE:'sword_C', ESPADA_ACO:'sword_D',
 LAMINA_DRACO_1H:'sword_F', ESPADA_GUARDIAO:'sword_E',
 LAMINA_ETERNA_1H:'sword_E', LAMINA_CELESTIAL_1H:'sword_G',
 ESPADA_LONGA:'sword_E', ESPADA_DRACO:'sword_F', ESPADA_HL:'sword_E',
 ESPADA_ETERNA:'sword_E', ESPADA_INFINITA:'sword_G',
 // The wooden staff is an honest visual approximation for the missing club geometry.
 PORRETE:'staff_A', CLAVA:'staff_A', BORDAO:'staff_B',
 MACA:'hammer_A', MARTELO:'hammer_B', MARRETA:'hammer_C', MACA_GIGANTE:'hammer_D',
 MARTELO_GOLEM:'hammer_C', MARTELO_COLOSSO:'hammer_D',
 MARTELO_ETERNAL:'hammer_D', MARTELO_CELESTIAL:'hammer_D',
 MACHADO:'axe_A', MACHADO_MINO:'axe_B', MACHADO_FORJA:'axe_C',
 MACHADO_RUINAS:'axe_D', MACHADO_CATACLISMO:'axe_D', MACHADO_ABISMO:'axe_D',
 ARCO:'bow_A_withString', ARCO_CACA:'bow_B_withString', ARCO_DRACO:'bow_C_withString',
 ARCO_ECLIPSE:'bow_B_withString', ARCO_ASTRAL:'bow_C_withString',
 BESTA:'crossbow_1handed', BESTA_GUARDIAO:'crossbow_2handed',
 LANCA:'spear_A', LANCA_LONGA:'spear_B', LANCA_DRACO:'spear_B',
 LANCA_GUARDIAO:'spear_A', LANCA_ETERNA:'spear_B', LANCA_CELESTIAL:'spear_A',
 ESCUDO_MAD:'shield_A', ESCUDO_FERRO:'shield_B', ESCUDO_OSSO:'shield_C',
 ESCUDO_PEDRA:'shield_C', ESCUDO_GUARDIAO:'shield_D',
 ESCUDO_ETERNAL:'shield_D', ESCUDO_CELESTIAL:'shield_B',
 VARINHA_APRENDIZ:'wand_A', CAJADO_FOGO:'staff_D', CAJADO_GELO:'staff_B',
 CAJADO_RAIO:'staff_C', CAJADO_RUNICO:'staff_C', CAJADO_ETERNO:'staff_D',
 CAJADO_ASTRAL:'staff_B',
});

const KINDS = Object.freeze({
 dagger:'dagger', sword:'sword', staff:'staff', hammer:'mace', axe:'axe',
 bow:'bow', spear:'spear', shield:'shield', wand:'wand',crossbow:'crossbow',
});
const ITEM_KIND = Object.freeze({PORRETE:'club',CLAVA:'club',BORDAO:'club'});
const TARGET_HEIGHT = Object.freeze({dagger:.58,sword:.82,staff:1.05,mace:.82,axe:.84,
 bow:.91,spear:1.42,shield:.66,wand:.58,club:.66,crossbow:.85});
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
 const kind=ITEM_KIND[baseId]||Object.entries(KINDS).find(([prefix])=>name.startsWith(prefix))?.[1];
 if(!kind || (slot==='offhand')!==(kind==='shield')) return null;
 if(definition && !['weapon','wand','offhand'].includes(definition.kind)) return null;
 const bounds=modelManifest?.get(name)?.bounds;
 const extent=bounds ? bounds.max.map((v,i)=>v-bounds.min[i]) : null;
 const twoHand=definition?.hand==='2h';
 const desired=twoHand&&TWO_HAND_HEIGHT[kind]||TARGET_HEIGHT[kind];
 const major=extent ? (kind==='bow' ? extent[0] : kind==='crossbow' ? extent[2] : extent[1]) : MODEL_MAJOR[name];
 // The hand slot is below the scaled Knight root (~0.45 of authored size).
 // The measured local scale compensates for that inherited character scale.
 const inheritedScaleCorrection=kind==='shield'?1.75:['axe','mace','club'].includes(kind)?1.6:2.2;
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
