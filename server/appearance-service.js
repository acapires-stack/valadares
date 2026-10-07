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

// A resposta sempre reflete o estado atual. No replay, receipt descreve a
// execução original; costGold=0 informa que esta chamada não debitou gold.
function applyAppearanceChange({player,account,appearance,requestId,rules,nearPaid,flush,now=Date.now()}){
    const current=rules.normalizarAppearance(player.appearance);
    const result=(ok,error,extra={})=>({ok,error,requestId:typeof requestId==='string'?requestId.slice(0,64):null,
        appearance:rules.normalizarAppearance(player.appearance),
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
    const costGold=changed && current.body!==next.body ? priceFor(next.body,rules) : 0;
    if(costGold===null)return {result:result(false,'invalid_price'),changed:false};
    if(costGold>0&&!requestId)return {result:result(false,'bad_request_id'),changed:false};
    if(costGold>0&&!nearPaid)return {result:result(false,'not_at_npc'),changed:false};
    if(costGold>0&&(!Number.isFinite(player.gold)||player.gold<costGold))
        return {result:result(false,'no_gold'),changed:false};
    if(changed&&player._appearanceAt&&now-player._appearanceAt<500)
        return {result:result(false,'too_fast'),changed:false};
    if(!changed&&!requestId)return {result:result(true,null),changed:false};
    if(!account?.save)return {result:result(false,'session_not_ready'),changed:false};

    const before={appearance:player.appearance,gold:player.gold,
        appearanceOps:player.appearanceOps,save:account.save,savedAt:account.savedAt};
    const goldAfter=(Number(player.gold)||0)-costGold;
    const receipt=requestId?{requestId,appearance:next,costGold,goldAfter}:null;
    player.appearance=next;
    player.gold=goldAfter;
    player.appearanceOps=receipt?[...receipts,receipt].slice(-MAX_RECEIPTS):receipts;
    account.save={...account.save,appearance:next,gold:goldAfter,
        appearanceOps:player.appearanceOps};
    account.savedAt=now;
    let saved=false;
    try{saved=!!flush();}catch{saved=false;}
    if(!saved){
        player.appearance=before.appearance;player.gold=before.gold;
        player.appearanceOps=before.appearanceOps;
        account.save=before.save;account.savedAt=before.savedAt;
        return {result:result(false,'save_failed'),changed:false};
    }
    if(changed)player._appearanceAt=now;
    return {result:result(true,null,{costGold,receipt,replayed:false}),changed};
}

module.exports={applyAppearanceChange,normalizeReceipts,priceFor,validRequestId,MAX_RECEIPTS};
