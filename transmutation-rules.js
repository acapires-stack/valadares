(function (root, factory) {
    const rules = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = rules;
    else root.ValadaresTransmutation = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const VERSION = 5;
    const progression = typeof module === 'object' && module.exports
        ? require('./progression-content') : (root.ValadaresProgression || {families:[],ascendantPools:{}});
    // As faixas 1 a 6 são entradas permitidas; a faixa 7 é somente saída.
    const tiers = [null,
        { cost:120, essenceQty:1, chances:{material:60,plain:25,enchanted:5,superior:10},
            pool:['ADAGA','PORRETE','CLAVA','ESPADA','LANCA','ARCO','ESCUDO_MAD','BOTAS','ELMO','COURO','VARINHA_APRENDIZ'] },
        { cost:450, essenceQty:2, chances:{material:55,plain:25,enchanted:10,superior:10},
            pool:['MACA','ESPADA_OSSO','SABRE','ADAGA_DUPLA','BORDAO','LANCA_LONGA','ARCO_CACA','ESCUDO_OSSO','ESCUDO_FERRO','ARMADURA','BOTAS_COURO','ELMO_CHIFRES','MACHADO','ESPADA_LONGA','MARTELO'] },
        { cost:1500, essenceQty:4, chances:{material:50,plain:25,enchanted:15,superior:10},
            pool:['ESPADA_ACO','BESTA','MARRETA','MACA_GIGANTE','MACHADO_MINO','ARMADURA_OSSO','ESCUDO_PEDRA','BOTAS_RAPIDA'] },
        { cost:4500, essenceQty:6, chances:{material:45,plain:25,enchanted:20,superior:10},
            pool:['LAMINA_DRACO_1H','ESPADA_DRACO','MARTELO_GOLEM','ARMADURA_ESCAMA','ELMO_DRACO','BOTAS_VENTO','CAJADO_FOGO','CAJADO_GELO','CAJADO_RAIO','MACHADO_FORJA','ARCO_DRACO','LANCA_DRACO'] },
        { cost:12000, essenceQty:10, chances:{material:40,plain:25,enchanted:30,superior:5},
            pool:['ESPADA_GUARDIAO','ESCUDO_GUARDIAO','ESPADA_HL','ARMADURA_TRONO','COROA_VENDEDOR','CAJADO_RUNICO','MACHADO_RUINAS','MARTELO_COLOSSO','BESTA_GUARDIAO','LANCA_GUARDIAO'] },
        { cost:30000, essenceQty:15, chances:{material:32,plain:25,enchanted:38,superior:5},
            pool:['ESPADA_ETERNA','COROA_VALADARES','CAJADO_ETERNO','MACHADO_CATACLISMO','MARTELO_ETERNAL','ARCO_ECLIPSE','LANCA_ETERNA','LAMINA_ETERNA_1H','ESCUDO_ETERNAL'] },
    ];
    const transcendentPool=['ESPADA_INFINITA','COROA_CELESTIAL','CAJADO_ASTRAL'];
    const tierByKey = new Map();
    for (let tier=1;tier<=6;tier++) for (const key of tiers[tier].pool) tierByKey.set(key,tier);
    function tierOf(key) {
        return typeof key === 'string' ? (tierByKey.get(key) || 0) : 0;
    }
    function pityInfo(failures) {
        const n=Number(failures);
        const safe=Number.isFinite(n) ? Math.max(0,Math.min(19,Math.trunc(n))) : 0;
        return {failures:safe,chance:5+5*safe,remaining:20-safe};
    }
    function invalid(error) {
        return {valid:false,error,tier:0,resultTier:0,sameTier:false,cost:0,essenceQty:0,
            chances:{material:0,plain:0,enchanted:0,superior:0},pool:[],superiorPool:[],pity:null};
    }
    function quote(keys, failures=0, family='') {
        if (typeof family !== 'string' || (family && !Object.hasOwn(progression.ascendantPools,family)))
            return invalid('invalid_family');
        if (!Array.isArray(keys) || keys.length !== 3 || keys.some(k => typeof k !== 'string')) return invalid('bad_keys');
        if (new Set(keys).size !== 3) return invalid('duplicate_keys');
        const ranks=keys.map(tierOf);
        if (ranks.some(t => t === 0)) return invalid('ineligible_item');
        const tier=Math.min(...ranks), sameTier=ranks.every(t=>t===tier), def=tiers[tier];
        if (family && (tier !== 6 || !sameTier)) return invalid('family_unavailable');
        // Na faixa 6 há exatamente três míticos. Consomem-se os três e volta
        // somente UM prêmio normal; excluir ingredientes tornaria o pool vazio.
        const pool=tier===6 ? [...def.pool] : def.pool.filter(key => !keys.includes(key));
        if (!pool.length) return invalid('empty_pool');
        const chances={...def.chances};
        const pity=tier===6 && sameTier ? pityInfo(failures) : null;
        if (pity){
            let transfer=pity.chance-chances.superior;
            for(const category of ['material','plain','enchanted']){
                const amount=Math.min(chances[category],transfer);
                chances[category]-=amount;
                transfer-=amount;
            }
            chances.superior=pity.chance;
        }
        if (!sameTier){chances.material+=chances.superior;chances.superior=0;}
        const nextPool = tiers[tier+1]?.pool || transcendentPool;
        const selectedPool = family && sameTier ? progression.ascendantPools[family] : nextPool;
        if (family && sameTier && !selectedPool.length) return invalid('family_unavailable');
        return {valid:true,error:null,tier,resultTier:tier+1,sameTier,cost:def.cost,
            essenceQty:def.essenceQty,chances,pool,pity,
            superiorPool:sameTier ? [...selectedPool] : [],family};
    }
    return Object.freeze({VERSION,tierOf,pityInfo,quote,families:progression.families});
});
