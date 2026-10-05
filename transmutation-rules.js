(function (root, factory) {
    const rules = factory();
    if (typeof module === 'object' && module.exports) module.exports = rules;
    else root.ValadaresTransmutation = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const VERSION = 3;
    // As faixas 1 a 6 são entradas permitidas; a faixa 7 é somente saída.
    const tiers = [null,
        { cost:120, essenceQty:1, chances:{material:60,plain:25,enchanted:5,superior:10},
            pool:['ADAGA','PORRETE','CLAVA','ESPADA','LANCA','ARCO','ESCUDO_MAD','BOTAS','ELMO','COURO','VARINHA_APRENDIZ'] },
        { cost:450, essenceQty:2, chances:{material:55,plain:25,enchanted:10,superior:10},
            pool:['MACA','ESPADA_OSSO','SABRE','ADAGA_DUPLA','BORDAO','LANCA_LONGA','ARCO_CACA','ESCUDO_OSSO','ESCUDO_FERRO','ARMADURA','BOTAS_COURO','ELMO_CHIFRES','MACHADO','ESPADA_LONGA','MARTELO'] },
        { cost:1500, essenceQty:4, chances:{material:50,plain:25,enchanted:15,superior:10},
            pool:['ESPADA_ACO','BESTA','MARRETA','MACA_GIGANTE','MACHADO_MINO','ARMADURA_OSSO','ESCUDO_PEDRA','BOTAS_RAPIDA'] },
        { cost:4500, essenceQty:6, chances:{material:45,plain:25,enchanted:20,superior:10},
            pool:['LAMINA_DRACO_1H','ESPADA_DRACO','MARTELO_GOLEM','ARMADURA_ESCAMA','ELMO_DRACO','BOTAS_VENTO','CAJADO_FOGO','CAJADO_GELO','CAJADO_RAIO'] },
        { cost:12000, essenceQty:10, chances:{material:40,plain:25,enchanted:30,superior:5},
            pool:['ESPADA_GUARDIAO','ESCUDO_GUARDIAO','ESPADA_HL','ARMADURA_TRONO','COROA_VENDEDOR','CAJADO_RUNICO'] },
        { cost:30000, essenceQty:15, chances:{material:35,plain:25,enchanted:38,superior:2},
            pool:['ESPADA_ETERNA','COROA_VALADARES','CAJADO_ETERNO'] },
    ];
    const transcendentPool=['ESPADA_INFINITA','COROA_CELESTIAL','CAJADO_ASTRAL'];
    const tierByKey = new Map();
    for (let tier=1;tier<=6;tier++) for (const key of tiers[tier].pool) tierByKey.set(key,tier);
    function tierOf(key) {
        return typeof key === 'string' ? (tierByKey.get(key) || 0) : 0;
    }
    function invalid(error) {
        return {valid:false,error,tier:0,resultTier:0,sameTier:false,cost:0,essenceQty:0,
            chances:{material:0,plain:0,enchanted:0,superior:0},pool:[],superiorPool:[]};
    }
    function quote(keys) {
        if (!Array.isArray(keys) || keys.length !== 3 || keys.some(k => typeof k !== 'string')) return invalid('bad_keys');
        if (new Set(keys).size !== 3) return invalid('duplicate_keys');
        const ranks=keys.map(tierOf);
        if (ranks.some(t => t === 0)) return invalid('ineligible_item');
        const tier=Math.min(...ranks), sameTier=ranks.every(t=>t===tier), def=tiers[tier];
        // Na faixa 6 há exatamente três míticos. Consomem-se os três e volta
        // somente UM prêmio normal; excluir ingredientes tornaria o pool vazio.
        const pool=tier===6 ? [...def.pool] : def.pool.filter(key => !keys.includes(key));
        if (!pool.length) return invalid('empty_pool');
        const chances={...def.chances};
        if (!sameTier){chances.material+=chances.superior;chances.superior=0;}
        return {valid:true,error:null,tier,resultTier:tier+1,sameTier,cost:def.cost,
            essenceQty:def.essenceQty,chances,pool,
            superiorPool:sameTier ? [...(tiers[tier+1]?.pool || transcendentPool)] : []};
    }
    return Object.freeze({VERSION,tierOf,quote});
});
