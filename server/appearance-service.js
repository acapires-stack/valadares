'use strict';

const MAX_RECEIPTS=32;
const validRequestId=id=>typeof id==='string' && id.length>=8 && id.length<=64 && /^[A-Za-z0-9_-]+$/.test(id);
const same=(a,b)=>a.body===b.body && a.palette===b.palette;

function normalizeReceipts(value,rules){
    if(!Array.isArray(value))return [];
    const seen=new Set(),out=[];
    for(const receipt of value.slice(-MAX_RECEIPTS)){
        if(!validRequestId(receipt?.requestId) || seen.has(receipt.requestId) ||
            !rules.isValidAppearance(receipt.appearance) ||
            !Number.isInteger(receipt.costGold) || receipt.costGold<0 ||
            !Number.isFinite(receipt.goldAfter) || receipt.goldAfter<0)continue;
        seen.add(receipt.requestId);
        out.push({requestId:receipt.requestId,
            appearance:rules.normalizarAppearance(receipt.appearance),
            costGold:receipt.costGold,goldAfter:receipt.goldAfter});
    }
    return out;
}
function priceFor(body,rules){
    const row=rules.APPEARANCE_BODIES.find(item=>item.id===body);
    if(!row)return null;
    if(row.priceGold===undefined)return 0;
    return Number.isSafeInteger(row.priceGold) && row.priceGold>=0 ? row.priceGold : null;
}

// The account-level list is authoritative. An old client could have put an
// arbitrary appearanceOwned field inside saveUpload before this feature existed,
// so save.appearanceOwned is deliberately never used as ownership evidence.
function ownedForAccount(account,rules){
    const owned=new Set(rules.normalizarAppearanceOwned(account?.appearanceOwned));
    const save=account?.save;
    const current=save?.appearance;
    if(rules.isValidAppearance(current) && priceFor(current.body,rules)>0)owned.add(current.body);
    for(const receipt of normalizeReceipts(save?.appearanceOps,rules)){
        if(receipt.costGold>0 && priceFor(receipt.appearance.body,rules)>0)
            owned.add(receipt.appearance.body);
    }
    return rules.normalizarAppearanceOwned([...owned]);
}

// A resposta sempre reflete o estado atual. No replay, receipt descreve a
// execução original; costGold=0 informa que esta chamada não debitou gold.
function applyAppearanceChange({player,account,appearance,requestId,rules,flush,now=Date.now()}){
    const current=rules.normalizarAppearance(player.appearance);
    const result=(ok,error,extra={})=>({ok,error,requestId:typeof requestId==='string'?requestId.slice(0,64):null,
        appearance:rules.normalizarAppearance(player.appearance),
        appearanceOwned:rules.normalizarAppearanceOwned(player.appearanceOwned),
        gold:Number(player.gold)||0,costGold:0,...extra});
    if(!rules.isValidAppearance(appearance))return {result:result(false,'invalid_appearance'),changed:false};
    if(requestId!=null&&!validRequestId(requestId))return {result:result(false,'bad_request_id'),changed:false};
    const next=rules.normalizarAppearance(appearance);
    const receipts=normalizeReceipts(player.appearanceOps,rules);
    if(requestId){
        const prior=receipts.find(item=>item.requestId===requestId);
        if(prior){
            if(!same(prior.appearance,next))return {result:result(false,'op_conflict'),changed:false};
            return {result:result(true,null,{replayed:true,receipt:prior}),changed:false};
        }
    }
    const changed=!same(current,next);
    const owned=ownedForAccount(account,rules);
    const basePrice=priceFor(next.body,rules);
    const costGold=changed && !owned.includes(next.body) ? basePrice : 0;
    if(costGold===null)return {result:result(false,'invalid_price'),changed:false};
    if(costGold>0&&!requestId)return {result:result(false,'bad_request_id'),changed:false};
    if(costGold>0&&(!Number.isFinite(player.gold)||player.gold<costGold))
        return {result:result(false,'no_gold'),changed:false};
    if(changed&&player._appearanceAt&&now-player._appearanceAt<500)
        return {result:result(false,'too_fast'),changed:false};
    if(!changed&&!requestId)return {result:result(true,null),changed:false};
    if(!account?.save)return {result:result(false,'session_not_ready'),changed:false};

    const before={appearance:player.appearance,gold:player.gold,
        appearanceOwned:player.appearanceOwned,accountOwned:account.appearanceOwned,
        appearanceOps:player.appearanceOps,save:account.save,savedAt:account.savedAt};
    const goldAfter=(Number(player.gold)||0)-costGold;
    const receipt=requestId?{requestId,appearance:next,costGold,goldAfter}:null;
    const nextOwned=costGold>0?rules.normalizarAppearanceOwned([...owned,next.body]):owned;
    player.appearance=next;
    player.gold=goldAfter;
    player.appearanceOwned=nextOwned;
    player.appearanceOps=receipt?[...receipts,receipt].slice(-MAX_RECEIPTS):receipts;
    account.appearanceOwned=nextOwned;
    account.save={...account.save,appearance:next,gold:goldAfter,
        appearanceOwned:nextOwned,appearanceOps:player.appearanceOps};
    account.savedAt=now;
    let saved=false;
    try{saved=!!flush();}catch{saved=false;}
    if(!saved){
        player.appearance=before.appearance;player.gold=before.gold;
        player.appearanceOwned=before.appearanceOwned;
        player.appearanceOps=before.appearanceOps;
        account.appearanceOwned=before.accountOwned;
        account.save=before.save;account.savedAt=before.savedAt;
        return {result:result(false,'save_failed'),changed:false};
    }
    if(changed)player._appearanceAt=now;
    return {result:result(true,null,{costGold,receipt,replayed:false}),changed};
}

module.exports={applyAppearanceChange,normalizeReceipts,ownedForAccount,priceFor,validRequestId,MAX_RECEIPTS};
