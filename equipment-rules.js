/* Shared item rules: plain JSON-compatible keys, legacy items stay unchanged. */
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports) module.exports=api;
    else root.ValadaresEquipment=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const VERSION=2, MAX_KEY_LENGTH=128, MATERIAL='ESSENCIA_ARCANA';
    const KINDS=['weapon','wand','offhand','armor','head','feet','neck'];
    const AFFIXES={
        h:{stat:'hp',min:15,max:45,pt:'Vitalidade',en:'Vitality',unit:'HP',kinds:KINDS},
        m:{stat:'mp',min:10,max:30,pt:'Concentração',en:'Focus',unit:'mana',kinds:KINDS},
        d:{stat:'def',min:1,max:3,pt:'Proteção',en:'Protection',unit:'def',kinds:KINDS},
        c:{stat:'critDamage',min:4,max:10,pt:'Ferocidade',en:'Ferocity',unit:'%',kinds:['weapon','wand','offhand','head','neck']},
        s:{stat:'attackSpeed',min:2,max:5,pt:'Agilidade',en:'Haste',unit:'%',kinds:['weapon','wand','feet','neck']},
        b:{stat:'bossDamage',min:3,max:7,pt:'Caça aos chefes',en:'Boss hunter',unit:'%',kinds:['weapon','wand']},
        p:{stat:'precision',min:2,max:5,pt:'Precisão',en:'Precision',unit:'%',kinds:['weapon','wand','offhand','head','neck']},
        k:{stat:'manaOnKill',min:1,max:3,pt:'Sifão de mana',en:'Mana siphon',unit:'mana',kinds:['weapon','wand','neck']},
        v:{stat:'vampirism',min:1,max:3,pt:'Vampirismo',en:'Vampirism',unit:'%',kinds:['weapon','wand']},
        g:{stat:'manaOnHit',min:1,max:3,pt:'Mana por golpe',en:'Mana per hit',unit:'mana',kinds:['weapon','wand']},
    };
    const CAPS={hp:270,mp:180,def:15,critDamage:40,attackSpeed:20,bossDamage:21,precision:25,manaOnKill:6,vampirism:9,manaOnHit:9};
    function parse(key){
        const invalid={valid:false,base:null,plus:0,stem:null,id:null,affixes:[],enchanted:false};
        if(typeof key!=='string'||key.length>MAX_KEY_LENGTH)return invalid;
        const pieces=key.split('~');
        if(pieces.length!==1&&pieces.length!==3)return invalid;
        const stem=pieces[0];
        if(!/^[A-Z][A-Z0-9_]*$/.test(stem))return invalid;
        const match=stem.match(/^(.+)_PLUS_(\d+)$/);
        const base=match?match[1]:stem,plus=match?Number(match[2]):0;
        if(plus<0||plus>5||!Number.isInteger(plus)||(match&&String(plus)!==match[2]))return invalid;
        const id=pieces[1]||null,affixes=[];
        if(pieces.length===3){
            if(!/^[a-f0-9]{12}$/.test(id))return invalid;
            const codes=pieces[2].split('.');
            if(!codes.length||codes.length>3)return invalid;
            for(const code of codes){
                const m=code.match(/^([a-z])([1-9]\d*)$/),def=m&&AFFIXES[m[1]],value=m?Number(m[2]):0;
                if(!def||value<def.min||value>def.max)return invalid;
                affixes.push({code:m[1],value});
            }
        }
        return {valid:true,base,plus,stem,id,affixes,enchanted:!!id};
    }
    function validFor(key,kind){const t=parse(key);return t.valid&&KINDS.includes(kind)&&t.affixes.every(a=>AFFIXES[a.code].kinds.includes(kind));}
    function make(base,plus,id,affixes){
        const stem=plus>0?base+'_PLUS_'+plus:base;
        const key=id?stem+'~'+id+'~'+affixes.map(a=>a.code+a.value).join('.'):stem;
        if(!parse(key).valid)throw new Error('Invalid equipment key');
        return key;
    }
    function upgrade(key,plus){const t=parse(key);if(!t.valid)throw new Error('Invalid equipment key');return make(t.base,plus,t.id,t.affixes);}
    function roll(kind,existing,slot,rng,choice){
        rng=rng||Math.random;
        if(!KINDS.includes(kind)||!Array.isArray(existing)||!Number.isInteger(slot)||slot<0||slot>2||slot>existing.length)throw new Error('Invalid enchantment slot');
        if(choice!==undefined && (typeof choice!=='string'||!Object.hasOwn(AFFIXES,choice)||!AFFIXES[choice].kinds.includes(kind)))
            throw new Error('Invalid enchantment choice');
        const pool=Object.keys(AFFIXES).filter(code=>AFFIXES[code].kinds.includes(kind));
        const code=choice===undefined?pool[Math.min(pool.length-1,Math.floor(rng()*pool.length))]:choice,def=AFFIXES[code];
        const affixes=existing.map(a=>({...a}));
        affixes[slot]={code,value:def.min+Math.min(def.max-def.min,Math.floor(rng()*(def.max-def.min+1)))};
        return affixes;
    }
    function cost(slot,reroll){
        if(!Number.isInteger(slot)||slot<0||slot>2)return null;
        return {essence:(reroll?[3,6,12]:[6,12,24])[slot],gold:(reroll?[250,750,2000]:[500,1500,4000])[slot]};
    }
    function bonuses(equipped,kindOf){
        const out=Object.fromEntries(Object.keys(CAPS).map(k=>[k,0]));
        for(const slot of ['weapon','offhand','armor','head','feet','neck']){
            const key=equipped&&equipped[slot],t=parse(key);
            if(!t.valid||!t.enchanted||(kindOf&&!validFor(key,kindOf(t.base))))continue;
            for(const a of t.affixes)out[AFFIXES[a.code].stat]+=a.value;
        }
        for(const k of Object.keys(out))out[k]=Math.min(out[k],CAPS[k]);
        return out;
    }
    function describe(a,lang){
        const en=lang==='en',d=AFFIXES[a.code];if(!d)return '';
        const labels={h:en?'maximum HP':'vida máxima',m:en?'maximum mana':'mana máxima',d:en?'defense':'defesa',c:en?'critical damage':'dano crítico',s:en?'attack speed':'velocidade de ataque',b:en?'damage against bosses':'dano contra chefes',p:en?'precision (less enemy dodge)':'precisão (reduz esquiva inimiga)',k:en?'mana per kill':'mana por abate',v:en?'vampirism (basic hits)':'vampirismo (golpes básicos)',g:en?'mana per basic hit':'mana por golpe básico'};
        return '+'+a.value+(d.unit==='%'?'%':'')+' '+labels[a.code];
    }
    return Object.freeze({VERSION,MAX_KEY_LENGTH,MATERIAL,KINDS,AFFIXES,CAPS,parse,validFor,make,upgrade,roll,cost,bonuses,describe});
});
