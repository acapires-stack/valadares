(function(){
    'use strict';
    I18N.pt['transmute.tab']='TRANSMUTAR';
    I18N.en['transmute.tab']='TRANSMUTE';
    const RULES=window.ValadaresTransmutation;
    const MATERIAL='ESSENCIA_ARCANA';
    let owner='',storageKey='',selected=['','',''],armed='',pending=null,result=null;
    let version=0,token='',timer=null,checkedSocket=null,checkBusy=false,lastRenderState='';
    const panel=()=>document.getElementById('transmutationPanel');
    const banner=()=>document.getElementById('transmutationStatus');
    const txt=(pt,en)=>LANG==='en'?en:pt;
    const safe=value=>escapeHtml(String(value==null?'':value));
    const name=key=>key?itmName(key):'';
    const online=()=>!!(ws&&ws.readyState===1&&_wsAuthed);
    const available=()=>online()&&version===RULES.VERSION&&!!token&&atCraft();
    const ownCount=key=>Number(player.inv?.[key])||0;
    function keyFor(account){
        let endpoint='';try{endpoint=resolveWsUrl()}catch{}
        return 'valadares:transmutation:v1:'+encodeURIComponent(endpoint)+':'+encodeURIComponent(account.toLowerCase());
    }
    function savePending(){
        try{if(pending)localStorage.setItem(storageKey,JSON.stringify({opId:pending.opId,keys:pending.keys}));else localStorage.removeItem(storageKey);return true}catch{return false}
    }
    function clearTimer(){if(timer)clearTimeout(timer);timer=null}
    function startTimeout(){
        clearTimer();timer=setTimeout(()=>{
            if(!pending)return;
            checkBusy=false;pending.waiting=false;
            result={kind:'warn',message:()=>txt('A resposta está demorando. Confira a mesma operação; nenhuma nova tentativa será enviada.','The response is delayed. Check the same operation; no new attempt will be sent.')};
            renderStatus();render();
        },8000);
    }
    function setAccount(account){
        const next=String(account||'').toLowerCase();if(next===owner)return;
        clearTimer();owner=next;storageKey=next?keyFor(next):'';
        selected=['','',''];armed='';pending=null;result=null;version=0;token='';checkedSocket=null;checkBusy=false;
        if(!storageKey)return;
        try{const saved=JSON.parse(localStorage.getItem(storageKey));
            if(saved&&typeof saved.opId==='string'&&Array.isArray(saved.keys)&&saved.keys.length===3&&saved.keys.every(k=>typeof k==='string'&&RULES.tierOf(k)>0)&&RULES.quote(saved.keys).valid){
                pending={opId:saved.opId,keys:saved.keys,waiting:false};
                result={kind:'warn',message:()=>txt('Há uma operação anterior sem confirmação. Confira seu estado antes de começar outra.','A previous operation has no confirmation. Check its status before starting another.')};
            }
        }catch{}
        renderStatus();
    }
    function onLogout(){setAccount('')}
    function onClose(){armed='';renderStatus()}
    function onTabChange(which){if(which!=='transmute')armed='';renderStatus()}
    function onAuth(msg){if(!owner)setAccount(player.name);onServerState(msg)}
    function onServerState(msg){
        if(Object.prototype.hasOwnProperty.call(msg,'transmutationVersion'))version=Number(msg.transmutationVersion)||0;
        if(Object.prototype.hasOwnProperty.call(msg,'transmutationToken'))token=typeof msg.transmutationToken==='string'?msg.transmutationToken:'';
        if(pending&&online()&&version===RULES.VERSION&&ws!==checkedSocket){
            checkedSocket=ws;queryStatus(true);
        }
        refreshIfOpen();
    }
    function eligible(){
        const worn=new Set(Object.values(player.equipped||{}).filter(Boolean).map(k=>window.ValadaresEquipment?.parse(k).base||k));
        return Object.keys(player.inv||{}).filter(k=>ownCount(k)>0&&RULES.tierOf(k)>0&&!worn.has(k)).sort((a,b)=>name(a).localeCompare(name(b),LANG==='en'?'en':'pt'));
    }
    function validSelection(keys,choices){return keys.length===3&&new Set(keys).size===3&&keys.every(k=>choices.includes(k)&&ownCount(k)>0)}
    function currentQuote(choices){return validSelection(selected,choices)?RULES.quote(selected):null}
    function selectedFingerprint(q){return q&&q.valid?JSON.stringify([selected,q.tier,q.cost,q.essenceQty,q.chances,q.pool]):''}
    function reason(q){
        if(!online())return txt('Conecte-se ao jogo para continuar.','Connect to the game to continue.');
        if(version!==RULES.VERSION||!token)return txt('Aguardando autorização da bancada.','Waiting for workbench authorization.');
        if(!atCraft())return txt('Aproxime-se da bancada da vila.','Move close to the village workbench.');
        if(!q||!q.valid)return txt('Escolha três peças diferentes da mochila.','Choose three different backpack pieces.');
        if(player.gold<q.cost)return txt('Falta ouro.','Not enough gold.');
        const remaining=Object.keys(player.inv||{}).filter(k=>ownCount(k)-(selected.includes(k)?1:0)>0).length;
        if(remaining>=250)return txt('Libere um espaço na mochila para qualquer resultado possível.','Free a backpack slot for any possible result.');
        return '';
    }
    function renderStatus(){
        const el=banner();if(!el)return;
        const show=!!(pending||result)&&document.getElementById('craftModal')?.classList.contains('transmute-active');el.hidden=!show;
        if(!show){el.innerHTML='';return}
        let message=typeof result?.message==='function'?result.message():(result?.message||'');
        if(pending&&pending.waiting)message=txt('Aguardando confirmação do servidor para esta operação…','Waiting for server confirmation of this operation…');
        else if(pending&&!message)message=txt('Operação pendente. Confira o estado antes de continuar.','Operation pending. Check its status before continuing.');
        el.dataset.kind=result?.kind||'pending';
        let html='<p>'+safe(message)+'</p>';
        if(pending&&!pending.waiting){
            html+='<div class="tm-actions"><button type="button" data-tm-action="check">'+txt('Conferir operação','Check operation')+'</button>';
            if(pending.notFound)html+='<button type="button" data-tm-action="resend">'+txt('Reenviar esta mesma operação','Resend this same operation')+'</button>';
            html+='</div>';
        }
        el.innerHTML=html;
    }
    function render(){
        const el=panel();if(!el||!RULES)return;
        if(!owner&&player.name)setAccount(player.name);
        const scroll=el.scrollTop,open=el.querySelector('details')?.open;
        const choices=eligible();let changed=false;
        selected=selected.map(k=>{if(k&&!choices.includes(k)){changed=true;return ''}return k});
        if(changed)armed='';
        const q=currentQuote(choices),fingerprint=selectedFingerprint(q);
        if(armed&&armed!==fingerprint)armed='';
        const block=!!pending,why=reason(q);
        document.getElementById('craftGoldLabel').textContent=player.gold+' g';
        let html='<h3>✦ '+txt('Mesa de Transmutação','Transmutation Table')+'</h3>';
        html+='<p>'+txt('Troque três equipamentos por um resultado surpresa. Cada combinação consome uma unidade das peças escolhidas e o ouro indicado.','Trade three equipment pieces for a surprise result. Each combination consumes one of each selected piece and the displayed gold.')+'</p>';
        html+='<p class="tm-note">'+txt('Peças equipadas, melhoradas, encantadas e especiais ficam protegidas. O resultado não é necessariamente mais forte.','Equipped, upgraded, enchanted and special pieces are protected. The result is not necessarily stronger.')+'</p>';
        html+='<p class="tm-note">✧ '+ownCount(MATERIAL)+' '+txt('essências arcanas na mochila','arcane essences in backpack')+'</p>';
        html+='<div class="tm-grid">';
        for(let i=0;i<3;i++){
            html+='<label>'+txt('Peça ','Piece ')+(i+1)+'<select data-tm-slot="'+i+'" '+(block?'disabled':'')+'><option value="">'+txt('Selecione','Select')+'</option>';
            for(const k of choices)if(!selected.includes(k)||selected[i]===k)html+='<option value="'+safe(k)+'" '+(selected[i]===k?'selected':'')+'>'+safe(name(k))+' ('+ownCount(k)+'×)</option>';
            html+='</select></label>';
        }
        html+='</div>';
        if(!choices.length)html+='<p>'+txt('Nenhuma peça comum elegível na mochila. Peças equipadas, melhoradas, encantadas e especiais não entram.','No eligible plain piece in your backpack. Equipped, upgraded, enchanted and special pieces are excluded.')+'</p>';
        if(q&&q.valid){
            html+='<div class="tm-card"><strong>'+txt('Prévia da tentativa','Attempt preview')+'</strong>';
            html+='<p>'+txt('Faixa da peça mais fraca: ','Tier of the weakest piece: ')+q.tier+' · <span class="tm-cost">'+txt('Custo: ','Cost: ')+q.cost+' g</span></p>';
            html+='<p>'+txt('Serão consumidas: ','To be consumed: ')+selected.map(k=>'1× '+safe(name(k))).join(' · ')+'</p>';
            html+='<div class="tm-chances"><span>'+q.chances.material+'% '+q.essenceQty+'× '+txt('essência arcana','arcane essence')+'</span><span>'+q.chances.plain+'% '+txt('equipamento comum','plain equipment')+'</span><span>'+q.chances.enchanted+'% '+txt('equipamento com 1 bônus','equipment with 1 bonus')+'</span></div>';
            html+='<p>'+txt('Essências são um possível prêmio, não um custo. Cada equipamento tem a mesma chance dentro da sua categoria.','Essences are a possible reward, not a cost. Each equipment item has the same chance within its category.')+'</p>';
            html+='<p>'+txt('Todos os equipamentos possíveis nos dois últimos resultados:','Every possible equipment item in the latter two outcomes:')+'</p><ul class="tm-pool">'+q.pool.map(k=>'<li>'+safe(name(k))+'</li>').join('')+'</ul>';
            html+='</div>';
            const aff=Object.entries(ValadaresEquipment.AFFIXES).filter(([,d])=>q.pool.some(k=>d.kinds.includes(ITEMS[k]?.kind)));
            html+='<details><summary>'+txt('Bônus compatíveis e limites','Compatible bonuses and caps')+'</summary><p>'+txt('O resultado encantado recebe exatamente um bônus aleatório compatível com a peça sorteada. O valor e o bônus não são escolhidos nesta mesa.','An enchanted result gets exactly one random bonus compatible with the rolled item. This table does not let you choose its bonus or value.')+'</p>';
            html+='<ul>'+aff.map(([code,d])=>'<li>'+safe(ValadaresEquipment.describe({code,value:d.min},LANG))+' – '+d.max+(d.unit==='%'?'%':'')+'</li>').join('')+'</ul>';
            html+='<p>'+txt('Limites totais do conjunto equipado: ','Total equipped set caps: ')+Object.entries(ValadaresEquipment.CAPS).map(([stat,value])=>{const code=Object.keys(ValadaresEquipment.AFFIXES).find(c=>ValadaresEquipment.AFFIXES[c].stat===stat);return code?safe(ValadaresEquipment.describe({code,value},LANG)):''}).filter(Boolean).join(' · ')+'</p></details>';
        }
        if(armed&&q?.valid){
            html+='<div class="tm-card"><strong>'+txt('Confirme esta tentativa','Confirm this attempt')+'</strong><p>'+selected.map(k=>'1× '+safe(name(k))).join(' · ')+' · '+q.cost+' g</p><p>'+txt('Esses itens e o ouro serão consumidos. O resultado é aleatório.','These items and gold will be consumed. The outcome is random.')+'</p><div class="tm-actions"><button type="button" data-tm-action="confirm" '+(block||why?'disabled':'')+'>'+txt('Confirmar e transmutar','Confirm and transmute')+'</button><button type="button" data-tm-action="cancel">'+txt('Cancelar','Cancel')+'</button></div></div>';
        }else html+='<div class="tm-actions"><button type="button" data-tm-action="review" '+(block||why?'disabled':'')+'>'+txt('Revisar tentativa','Review attempt')+'</button></div>';
        if(why&&!block)html+='<p>'+safe(why)+'</p>';
        if(block)html+='<p>'+txt('Há uma operação pendente; a nova tentativa fica bloqueada até a confirmação.','A pending operation blocks new attempts until it is resolved.')+'</p>';
        el.innerHTML=html;const details=el.querySelector('details');if(details&&open)details.open=true;el.scrollTop=scroll;
        renderStatus();
        lastRenderState=renderState();
    }
    function renderState(){return JSON.stringify([owner,LANG,online(),atCraft(),version,token,player.inv,player.equipped,player.gold,selected,armed,pending,typeof result?.message==='function'?result.message():result?.message])}
    function refreshIfOpen(){const modal=document.getElementById('craftModal');if(modal?.style.display==='flex'&&modal.classList.contains('transmute-active')&&lastRenderState!==renderState())render();else renderStatus()}
    function queryStatus(auto){
        if(!pending||!online()||version!==RULES.VERSION||checkBusy)return;
        checkBusy=true;pending.waiting=true;result=null;renderStatus();
        try{ws.send(JSON.stringify({t:'transmuteStatus',opId:pending.opId}));startTimeout()}
        catch{checkBusy=false;pending.waiting=false;result={kind:'warn',message:()=>txt('Não foi possível consultar agora. Tente após reconectar.','Could not check now. Try after reconnecting.')};renderStatus()}
    }
    function resendSame(){
        if(!pending||!pending.notFound||!available()||pending.waiting)return;
        pending.notFound=false;pending.waiting=true;result=null;renderStatus();
        try{ws.send(JSON.stringify({t:'invTransmute',version:RULES.VERSION,opId:pending.opId,keys:pending.keys}));startTimeout()}
        catch{pending.waiting=false;result={kind:'warn',message:()=>txt('Envio incerto. Confira a operação antes de tentar novamente.','Send state unknown. Check the operation before trying again.')};renderStatus()}
    }
    function attempt(){
        const choices=eligible(),q=currentQuote(choices);
        if(pending||!q?.valid||reason(q)||armed!==selectedFingerprint(q))return;
        pending={opId:token,keys:[...selected],waiting:false};
        checkedSocket=ws;
        if(!savePending()){pending=null;result={kind:'error',message:()=>txt('Não foi possível guardar a operação neste aparelho. Libere espaço e tente novamente.','Could not save this operation on this device. Free storage and try again.')};renderStatus();return}
        armed='';pending.waiting=true;result=null;render();
        try{ws.send(JSON.stringify({t:'invTransmute',version:RULES.VERSION,opId:pending.opId,keys:pending.keys}));startTimeout()}
        catch{pending.waiting=false;result={kind:'warn',message:()=>txt('Envio incerto. Confira esta operação antes de continuar.','Send state unknown. Check this operation before continuing.')};renderStatus();render()}
    }
    function handleResult(r){
        if(!pending||!r||r.opId!==pending.opId)return;
        clearTimer();checkBusy=false;
        if(r.error==='not_found'){
            pending.waiting=false;pending.notFound=true;
            result={kind:'warn',message:()=>txt('Esta operação ainda não consta no servidor. Você pode reenviar exatamente a mesma tentativa.','This operation was not found on the server. You may manually resend the exact same attempt.')};
        }else{
            pending=null;savePending();armed='';selected=['','',''];
            if(r.ok){
                result={kind:'ok',message:()=>{
                    const received=String(r.qty||1)+'× '+name(r.newKey||MATERIAL);
                    const bonuses=ValadaresEquipment.parse(r.newKey).affixes.map(a=>ValadaresEquipment.describe(a,LANG)).join(' · ');
                    return txt('Transmutação concluída: ','Transmutation complete: ')+received+(bonuses?' — '+bonuses:'')+'. '+txt('Custo: ','Cost: ')+r.cost+' g.';
                }};
                if(typeof playGameSound==='function')playGameSound(r.category==='enchanted'?'rareLoot':'pickup');
            }else{
                result={kind:'error',message:()=>{
                    const errors={no_items:txt('As peças não estão mais disponíveis.','The pieces are no longer available.'),no_gold:txt('Ouro insuficiente.','Not enough gold.'),no_essence:txt('Essências insuficientes.','Not enough essences.'),not_at_bench:txt('Aproxime-se da bancada.','Move close to the workbench.'),inventory_full:txt('Mochila cheia.','Backpack full.')};
                    errors.save_failed=txt('Não foi possível salvar. As peças e o ouro foram preservados.','Could not save. Your pieces and gold were preserved.');
                    errors.equipped_input=txt('Uma das peças está equipada. Ela foi preservada.','One of the pieces is equipped. It was preserved.');
                    errors.update_required=txt('Atualize o jogo para usar esta mesa.','Refresh the game to use this table.');
                    errors.stale_op=txt('Essa tentativa já foi encerrada. Confira a mochila antes de começar outra.','That attempt has already ended. Check your backpack before starting another.');
                    return errors[r.error]||txt('Operação recusada pelo servidor. Nenhum novo envio foi feito.','The server rejected the operation. No new request was sent.');
                }};
            }
        }
        renderStatus();refreshIfOpen();
    }
    document.addEventListener('change',e=>{
        const slot=e.target.closest('#transmutationPanel [data-tm-slot]');if(!slot)return;
        selected[Number(slot.dataset.tmSlot)]=slot.value;armed='';render();
    });
    document.addEventListener('click',e=>{
        const btn=e.target.closest('[data-tm-action]');if(!btn||btn.disabled)return;
        const action=btn.dataset.tmAction;
        if(action==='cancel'){armed='';render()}
        else if(action==='review'){const q=currentQuote(eligible());if(!pending&&q?.valid&&!reason(q)){armed=selectedFingerprint(q);render()}}
        else if(action==='confirm')attempt();
        else if(action==='check')queryStatus(false);
        else if(action==='resend')resendSame();
    });
    window.ValadaresTransmutationUI={setAccount,onLogout,onClose,onTabChange,onAuth,onServerState,render,refreshIfOpen,handleResult};
})();
