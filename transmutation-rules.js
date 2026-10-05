(function (root, factory) {
    const rules = factory();
    if (typeof module === 'object' && module.exports) module.exports = rules;
    else root.ValadaresTransmutation = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const VERSION = 1;
    // Somente equipamentos-base comuns. Esta lista é o contrato compartilhado
    // entre a prévia no cliente e a validação autoritativa do servidor.
    const tiers = [null,
        { cost:120, essenceQty:1, chances:{material:70,plain:25,enchanted:5},
            pool:['ADAGA','PORRETE','CLAVA','ESPADA','LANCA','ARCO','ESCUDO_MAD','BOTAS','ELMO','COURO'] },
        { cost:450, essenceQty:2, chances:{material:65,plain:28,enchanted:7},
            pool:['MACA','ESPADA_LONGA','MACHADO','MARTELO','MARRETA','MACA_GIGANTE','ARMADURA','ESCUDO_FERRO','ARCO_CACA','BESTA','LANCA_LONGA','BOTAS_RAPIDA'] },
        { cost:1000, essenceQty:3, chances:{material:60,plain:30,enchanted:10},
            pool:['ESPADA_OSSO','ESCUDO_OSSO','ARMADURA_OSSO','MACHADO_MINO','ELMO_CHIFRES','BOTAS_COURO'] },
    ];
    const tierByKey = new Map();
    for (let tier=1;tier<=3;tier++) for (const key of tiers[tier].pool) tierByKey.set(key,tier);
    function tierOf(key) {
        return typeof key === 'string' ? (tierByKey.get(key) || 0) : 0;
    }
    function invalid(error) {
        return {valid:false,error,tier:0,cost:0,essenceQty:0,
            chances:{material:0,plain:0,enchanted:0},pool:[]};
    }
    function quote(keys) {
        if (!Array.isArray(keys) || keys.length !== 3 || keys.some(k => typeof k !== 'string')) return invalid('bad_keys');
        if (new Set(keys).size !== 3) return invalid('duplicate_keys');
        const ranks=keys.map(tierOf);
        if (ranks.some(t => t === 0)) return invalid('ineligible_item');
        const tier=Math.min(...ranks);
        const def=tiers[tier];
        const pool=def.pool.filter(key => !keys.includes(key));
        if (!pool.length) return invalid('empty_pool');
        return {valid:true,error:null,tier,cost:def.cost,essenceQty:def.essenceQty,
            chances:{...def.chances},pool};
    }
    return Object.freeze({VERSION,tierOf,quote});
});
