(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WeaponTechniquesRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PRICE = 20000;
  const TECHNIQUES = Object.freeze([
    {id:'sword', name:'Corte transversal', nameEn:'Cross cut', primary:20, secondary:[40,40], description:'Alvo +20%; até 2 inimigos na linha transversal frontal +40%.', descriptionEn:'Target +20%; up to 2 enemies across the front line +40%.'},
    {id:'axe', name:'Giro do machado', nameEn:'Axe sweep', primary:20, secondary:[30,30,30], description:'Alvo +20%; até 3 inimigos adjacentes +30%.', descriptionEn:'Target +20%; up to 3 adjacent enemies +30%.'},
    {id:'club', name:'Impacto pesado', nameEn:'Heavy impact', primary:60, secondary:[], description:'Alvo +60% de dano, sem atordoamento.', descriptionEn:'Target +60% damage, without stun.'},
    {id:'ranged', name:'Tiro perfurante', nameEn:'Piercing shot', primary:20, secondary:[40,20], description:'Alvo +20%; até 2 inimigos atrás dele +40% e +20%.', descriptionEn:'Target +20%; up to 2 enemies behind it +40% and +20%.'},
    {id:'spear', name:'Estocada', nameEn:'Thrust', primary:30, secondary:[40], description:'Alvo +30%; até 1 inimigo na linha, dentro de 3 casas +40%.', descriptionEn:'Target +30%; up to 1 enemy in line within 3 tiles +40%.'},
    {id:'staff', name:'Pulso arcano', nameEn:'Arcane pulse', primary:20, secondary:[35,35], description:'Alvo +20%; até 2 inimigos vizinhos do alvo +35%.', descriptionEn:'Target +20%; up to 2 enemies near the target +35%.'}
  ].map(Object.freeze));
  const BY_ID = Object.freeze(Object.assign(Object.create(null),Object.fromEntries(TECHNIQUES.map(t=>[t.id,t]))));
  const SWORDS = new Set(['ADAGA','ADAGA_DUPLA','ESPADA','ESPADA_DRACO','ESPADA_ETERNA','ESPADA_INFINITA','ESPADA_HL','ESPADA_LONGA','ESPADA_OSSO','SABRE','ESPADA_ACO','LAMINA_DRACO_1H','ESPADA_GUARDIAO']);
  const AXES = new Set(['MACHADO','MACHADO_MINO','MACHADO_FORJA','MACHADO_RUINAS','MACHADO_CATACLISMO','MACHADO_ABISMO']);
  const CLUBS = new Set(['BORDAO','CLAVA','MACA','MACA_GIGANTE','MARRETA','MARTELO','MARTELO_GOLEM','PORRETE','MARTELO_COLOSSO','MARTELO_ETERNAL','MARTELO_CELESTIAL']);
  const RANGED = new Set(['ARCO','ARCO_CACA','BESTA','ARCO_DRACO','BESTA_GUARDIAO','ARCO_ECLIPSE','ARCO_ASTRAL']);
  const SPEARS = new Set(['LANCA','LANCA_LONGA','LANCA_DRACO','LANCA_GUARDIAO','LANCA_ETERNA','LANCA_CELESTIAL']);
  const STAFFS = new Set(['VARINHA_APRENDIZ','CAJADO_FOGO','CAJADO_GELO','CAJADO_RAIO','CAJADO_RUNICO','CAJADO_ETERNO','CAJADO_ASTRAL']);
  const LEGENDARY_LEGACY = new Set(['ESPADA_GUARDIAO','ESPADA_HL','ESPADA_ETERNA','ESPADA_INFINITA','CAJADO_RUNICO','CAJADO_ETERNO','CAJADO_ASTRAL']);
  function techniqueForBase(base) {
    if (!base) return null;
    if (SWORDS.has(base)) return 'sword';
    if (AXES.has(base)) return 'axe';
    if (CLUBS.has(base)) return 'club';
    if (RANGED.has(base)) return 'ranged';
    if (SPEARS.has(base)) return 'spear';
    if (STAFFS.has(base)) return 'staff';
    if (base==='LAMINA_ETERNA_1H' || base==='LAMINA_CELESTIAL_1H') return 'sword';
    return null;
  }
  function eligible(base,meta) {
    return !!techniqueForBase(base) && (LEGENDARY_LEGACY.has(base) ||
      (Number.isInteger(meta?.tier) && meta.tier>=5));
  }
  function normalize(value) {
    const owned = [...new Set(Array.isArray(value?.owned) ? value.owned.filter(x=>typeof x==='string' && BY_ID[x]) : [])];
    const disabled = [...new Set(Array.isArray(value?.disabled) ? value.disabled.filter(x=>owned.includes(x)) : [])];
    return {v:1,owned,disabled};
  }
  function bonus(base, percent) { return Math.max(0,Math.floor(Math.max(0,base)*percent/100)); }
  function lineStep(from, to) {
    const dx=to.x-from.x,dy=to.y-from.y;
    const n=Math.max(Math.abs(dx),Math.abs(dy));
    if (!n) return {x:0,y:0};
    return {x:Math.sign(dx),y:Math.sign(dy)};
  }
  function cells(id, origin, target, range) {
    const dx=target.x-origin.x,dy=target.y-origin.y;
    const distance=Math.max(Math.abs(dx),Math.abs(dy));
    const out=[];
    if (id==='sword') {
      const side=Math.abs(dx)>=Math.abs(dy)?{x:0,y:1}:{x:1,y:0};
      return [{x:target.x+side.x,y:target.y+side.y},{x:target.x-side.x,y:target.y-side.y}];
    }
    if (id==='ranged' || id==='spear') {
      const max=id==='ranged'?Math.max(0,range):3;
      for(let i=1;i<=2 && distance;i++) {
        const x=Math.round(origin.x+dx*(distance+i)/distance);
        const y=Math.round(origin.y+dy*(distance+i)/distance);
        if (Math.max(Math.abs(x-origin.x),Math.abs(y-origin.y))<=max) out.push({x,y});
      }
      return out;
    }
    if (id==='axe' || id==='staff') {
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        if (!dx && !dy) continue;
        const center=id==='axe'?origin:target;
        out.push({x:center.x+dx,y:center.y+dy});
      }
      return out;
    }
    return out;
  }
  return Object.freeze({PRICE,TECHNIQUES,BY_ID,techniqueForBase,eligible,normalize,bonus,cells});
});
