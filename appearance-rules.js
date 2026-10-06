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
    Object.freeze({ id: 'magicalgirl', label: 'Maga arcana', model: 'MagicalGirl' })
  ]);
  const APPEARANCE_PALETTES = Object.freeze([
    Object.freeze({ id: 'original', label: 'Original', color: null }),
    Object.freeze({ id: 'ocean', label: 'Azul', color: '#477fae' }),
    Object.freeze({ id: 'forest', label: 'Verde', color: '#528467' }),
    Object.freeze({ id: 'wine', label: 'Vinho', color: '#a64969' }),
    Object.freeze({ id: 'sand', label: 'Areia', color: '#b08c55' })
  ]);
  const isValidAppearance = value => !!value && !Array.isArray(value) && typeof value === 'object'
    && value.v === 1 && APPEARANCE_BODIES.some(x => x.id === value.body)
    && APPEARANCE_PALETTES.some(x => x.id === value.palette);
  function normalizarAppearance(value) {
    return isValidAppearance(value)
      ? { v: 1, body: value.body, palette: value.palette }
      : { v: 1, body: 'knight', palette: 'original' };
  }
  return Object.freeze({ APPEARANCE_BODIES, APPEARANCE_PALETTES, isValidAppearance, normalizarAppearance });
});
