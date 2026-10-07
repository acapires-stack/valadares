(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AppearanceRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Complete authored bodies/outfits, not interchangeable face/hair/body parts.
  const APPEARANCE_BODIES = Object.freeze([
    Object.freeze({ id: 'knight', label: 'Cavaleiro', model: 'Knight' }),
    Object.freeze({ id: 'mage', label: 'Mago', model: 'Mage' }),
    Object.freeze({ id: 'rogue', label: 'Andarilho', model: 'Rogue_Hooded' }),
    Object.freeze({ id: 'barbarian', label: 'Bárbaro', model: 'Barbarian' }),
    Object.freeze({ id: 'lorekeeper', label: 'Sábio', model: 'Lorekeeper' }),
    Object.freeze({ id: 'cleric', label: 'Clérigo', model: 'Cleric' }),
    Object.freeze({ id: 'magicalgirl', label: 'Maga arcana', model: 'MagicalGirl' }),
    Object.freeze({ id: 'knight_v2', label: 'Cavaleiro da guilda', labelEn:'Guild knight', model: 'V2_Knight', priceGold:0 }),
    Object.freeze({ id: 'mage_v2', label: 'Mago viajante', labelEn:'Wandering mage', model: 'V2_Mage', priceGold:0 }),
    Object.freeze({ id: 'rogue_v2', label: 'Aventureiro', labelEn:'Adventurer', model: 'V2_Rogue', priceGold:0 }),
    Object.freeze({ id: 'barbarian_v2', label: 'Bárbaro nórdico', labelEn:'Northern barbarian', model: 'V2_Barbarian', priceGold:0 }),
    Object.freeze({ id: 'ranger', label: 'Arqueiro', labelEn:'Ranger', model: 'V2_Ranger', priceGold:0 }),
    Object.freeze({ id: 'engineer', label: 'Engenheiro', labelEn:'Engineer', model: 'V2_Engineer', priceGold:5000 }),
    Object.freeze({ id: 'druid', label: 'Druida', labelEn:'Druid', model: 'V2_Druid', priceGold:5000 }),
    Object.freeze({ id: 'barbarian_large', label: 'Bárbaro colosso', labelEn:'Colossus barbarian', model: 'V2_Barbarian_Large', priceGold:5000 })
  ]);
  const APPEARANCE_PALETTES = Object.freeze([
    Object.freeze({ id: 'original', label: 'Original', color: null }),
    Object.freeze({ id: 'ocean', label: 'Azul', color: '#477fae' }),
    Object.freeze({ id: 'forest', label: 'Verde', color: '#528467' }),
    Object.freeze({ id: 'wine', label: 'Vinho', color: '#a64969' }),
    Object.freeze({ id: 'sand', label: 'Areia', color: '#b08c55' }),
    Object.freeze({ id: 'alt_A', label: 'Estilo I', labelEn:'Style I', textureVariant:'alt_A', color:null }),
    Object.freeze({ id: 'alt_B', label: 'Estilo II', labelEn:'Style II', textureVariant:'alt_B', color:null }),
    Object.freeze({ id: 'alt_C', label: 'Estilo III', labelEn:'Style III', textureVariant:'alt_C', color:null })
  ]);
  const isValidAppearance = value => !!value && !Array.isArray(value) && typeof value === 'object'
    && value.v === 1 && APPEARANCE_BODIES.some(x => x.id === value.body)
    && APPEARANCE_PALETTES.some(x => x.id === value.palette && (!x.textureVariant || APPEARANCE_BODIES.find(b=>b.id===value.body)?.model.startsWith('V2_')));
  function normalizarAppearance(value) {
    return isValidAppearance(value)
      ? { v: 1, body: value.body, palette: value.palette }
      : { v: 1, body: 'knight', palette: 'original' };
  }
  return Object.freeze({ APPEARANCE_BODIES, APPEARANCE_PALETTES, isValidAppearance, normalizarAppearance });
});
