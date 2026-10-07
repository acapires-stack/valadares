(function (root, factory) {
    const content = factory();
    if (typeof module === 'object' && module.exports) module.exports = content;
    else root.ValadaresProgression = content;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const families = [
        {id:'machado',name:'Machado',nameEn:'Axe'},
        {id:'clava',name:'Clava e martelo',nameEn:'Club and hammer'},
        {id:'distancia',name:'Arco e besta',nameEn:'Bow and crossbow'},
        {id:'lanca',name:'Lança e escudo',nameEn:'Spear and shield'},
        {id:'espada_escudo',name:'Espada e escudo',nameEn:'Sword and shield'},
    ];
    const items = {
        FRAGMENTO_FORJA:{name:'Fragmento da Forja',nameEn:'Forge Fragment',kind:'mat',tier:4,family:'machado',color:'#ed9b50'},
        MACHADO_FORJA:{name:'Machado da Forja',nameEn:'Forge Axe',kind:'weapon',hand:'2h',base:15,def:4,skill:'Machado',tier:4,family:'machado',color:'#e38b4b'},
        MACHADO_RUINAS:{name:'Machado das Ruínas',nameEn:'Ruins Axe',kind:'weapon',hand:'2h',base:22,def:6,skill:'Machado',tier:5,family:'machado',color:'#c5784e'},
        MACHADO_CATACLISMO:{name:'Machado do Cataclismo',nameEn:'Cataclysm Axe',kind:'weapon',hand:'2h',base:33,def:9,skill:'Machado',tier:6,family:'machado',color:'#db583a'},
        MACHADO_ABISMO:{name:'Machado do Abismo',nameEn:'Abyss Axe',kind:'weapon',hand:'2h',base:39,def:11,skill:'Machado',tier:7,family:'machado',color:'#a873ec'},
        MARTELO_COLOSSO:{name:'Martelo do Colosso',nameEn:'Colossus Hammer',kind:'weapon',hand:'2h',base:19,def:10,skill:'Clava',tier:5,family:'clava',color:'#779aaf'},
        MARTELO_ETERNAL:{name:'Martelo Eterno',nameEn:'Eternal Hammer',kind:'weapon',hand:'2h',base:28,def:14,skill:'Clava',tier:6,family:'clava',color:'#92b9d0'},
        MARTELO_CELESTIAL:{name:'Martelo Celestial',nameEn:'Celestial Hammer',kind:'weapon',hand:'2h',base:34,def:17,skill:'Clava',tier:7,family:'clava',color:'#a5daec'},
        ARCO_DRACO:{name:'Arco Dracônico',nameEn:'Draconic Bow',kind:'weapon',hand:'2h',base:13,def:2,ranged:8,skill:'Distância',tier:4,family:'distancia',color:'#a75943'},
        BESTA_GUARDIAO:{name:'Besta do Guardião',nameEn:'Guardian Crossbow',kind:'weapon',hand:'2h',base:18,def:3,ranged:8,skill:'Distância',tier:5,family:'distancia',color:'#bd9b54'},
        ARCO_ECLIPSE:{name:'Arco do Eclipse',nameEn:'Eclipse Bow',kind:'weapon',hand:'2h',base:27,def:4,ranged:8,skill:'Distância',tier:6,family:'distancia',color:'#735caa'},
        ARCO_ASTRAL:{name:'Arco Astral',nameEn:'Astral Bow',kind:'weapon',hand:'2h',base:33,def:5,ranged:8,skill:'Distância',tier:7,family:'distancia',color:'#97cbea'},
        LANCA_DRACO:{name:'Lança Dracônica',nameEn:'Draconic Spear',kind:'weapon',hand:'1h',base:9,def:3,meleeRange:3,skill:'Distância',tier:4,family:'lanca',color:'#bd6650'},
        LANCA_GUARDIAO:{name:'Lança do Guardião',nameEn:'Guardian Spear',kind:'weapon',hand:'1h',base:14,def:4,meleeRange:3,skill:'Distância',tier:5,family:'lanca',color:'#c5ab71'},
        LANCA_ETERNA:{name:'Lança Eterna',nameEn:'Eternal Spear',kind:'weapon',hand:'1h',base:21,def:6,meleeRange:3,skill:'Distância',tier:6,family:'lanca',color:'#e5b96f'},
        LANCA_CELESTIAL:{name:'Lança Celestial',nameEn:'Celestial Spear',kind:'weapon',hand:'1h',base:26,def:8,meleeRange:3,skill:'Distância',tier:7,family:'lanca',color:'#a9d3ed'},
        LAMINA_ETERNA_1H:{name:'Lâmina Eterna',nameEn:'Eternal Blade',kind:'weapon',hand:'1h',base:23,def:8,skill:'Espada',tier:6,family:'espada_escudo',color:'#e4d16a'},
        ESCUDO_ETERNAL:{name:'Escudo Eterno',nameEn:'Eternal Shield',kind:'offhand',def:16,tier:6,family:'espada_escudo',color:'#dfc777'},
        LAMINA_CELESTIAL_1H:{name:'Lâmina Celestial',nameEn:'Celestial Blade',kind:'weapon',hand:'1h',base:28,def:10,skill:'Espada',tier:7,family:'espada_escudo',color:'#c3e5ef'},
        ESCUDO_CELESTIAL:{name:'Escudo Celestial',nameEn:'Celestial Shield',kind:'offhand',def:19,tier:7,family:'espada_escudo',color:'#bce5ec'},
    };
    for (const item of Object.values(items)){
        item.stars=Math.max(0,Math.min(3,(item.tier||0)-4));
        if (item.stars){ const suffix=' '+'★'.repeat(item.stars); item.name+=suffix; item.nameEn+=suffix; }
    }
    // Deterministic paths preserve a clear target even when rare rolls are unlucky.
    const recipes = {
        MACHADO_FORJA:{in:{MACHADO_MINO:1,FRAGMENTO_FORJA:3,PEDRA_GOLEM:4},gold:4500},
        MACHADO_RUINAS:{in:{MACHADO_FORJA:1,FRAGMENTO_FORJA:6,CORACAO_HL:2},gold:12000},
        MACHADO_CATACLISMO:{in:{MACHADO_RUINAS:1,FRAGMENTO_FORJA:12,ESSENCIA:10},gold:30000},
        MARTELO_COLOSSO:{in:{MARTELO_GOLEM:1,PEDRA_GOLEM:8,CORACAO_HL:2},gold:12000},
        MARTELO_ETERNAL:{in:{MARTELO_COLOSSO:1,ESSENCIA:10,FRAGMENTO_FORJA:8},gold:30000},
        ARCO_DRACO:{in:{BESTA:1,ESCAMA:6,CORACAO_HL:1},gold:4500},
        BESTA_GUARDIAO:{in:{ARCO_DRACO:1,ESCAMA:10,FRAGMENTO_FORJA:4},gold:12000},
        ARCO_ECLIPSE:{in:{BESTA_GUARDIAO:1,ESSENCIA:10,FRAGMENTO_FORJA:8},gold:30000},
        LANCA_DRACO:{in:{LANCA_LONGA:1,ESCAMA:5,CORACAO_HL:1},gold:4500},
        LANCA_GUARDIAO:{in:{LANCA_DRACO:1,ESCAMA:10,FRAGMENTO_FORJA:4},gold:12000},
        LANCA_ETERNA:{in:{LANCA_GUARDIAO:1,ESSENCIA:10,FRAGMENTO_FORJA:8},gold:30000},
        LAMINA_ETERNA_1H:{in:{ESPADA_GUARDIAO:1,ESSENCIA:10,FRAGMENTO_FORJA:8},gold:30000},
        ESCUDO_ETERNAL:{in:{ESCUDO_GUARDIAO:1,ESSENCIA:10,FRAGMENTO_FORJA:8},gold:30000},
    };
    const ascendantPools = {
        machado:['MACHADO_ABISMO'], clava:['MARTELO_CELESTIAL'],
        distancia:['ARCO_ASTRAL'], lanca:['LANCA_CELESTIAL'],
        espada_escudo:['LAMINA_CELESTIAL_1H','ESCUDO_CELESTIAL'],
    };
    const expedition = {
        id:'ruinas_forja',name:'Ruínas da Forja',nameEn:'Ruins of the Forge',
        npc:{x:78,y:22},recommendedLevel:18,rewardKey:'FRAGMENTO_FORJA',
        firstClearKey:'MACHADO_FORJA', enemies:['ORC','GOLEM'],boss:'GOLEM_REI',
        objectives:{guards:4,golems:3,boss:1},
    };
    const robotExpedition = {
        ...expedition,id:'forja_esquecida',name:'Forja Esquecida',nameEn:'Forgotten Forge',
        enemies:['FORGE_SENTRY','FORGE_CONSTRUCT'],boss:'FORGE_WARDEN',
    };
    return Object.freeze({items,recipes,families,ascendantPools,expedition,robotExpedition});
});
