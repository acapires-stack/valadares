(function(){
    'use strict';
    I18N.pt['transmute.tab']='TRANSMUTAR';
    I18N.en['transmute.tab']='TRANSMUTE';
    const RULES=window.ValadaresTransmutation;
    const MATERIAL='ESSENCIA_ARCANA';
    let owner='',storageKey='',selected=['','',''],family='',armed='',pending=null,result=null;
    let version=0,token='',pity=null,pitySocket=null,timer=null,checkedSocket=null,checkBusy=false,lastRenderState='';
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
        try{if(pending)localStorage.setItem(storageKey,JSON.stringify({opId:pending.opId,keys:pending.keys,family:pending.family||'',version:pending.version,pityAtSend:pending.pityAtSend}));else localStorage.removeItem(storageKey);return true}catch{return false}
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
        selected=['','',''];family='';armed='';pending=null;result=null;version=0;token='';pity=null;pitySocket=null;checkedSocket=null;checkBusy=false;
        if(!storageKey)return;
        try{const saved=JSON.parse(localStorage.getItem(storageKey));
            // A consulta de recibo antigo não depende das regras de preço/eligibilidade atuais.
            if(saved&&typeof saved.opId==='string'&&Array.isArray(saved.keys)&&saved.keys.length===3&&new Set(saved.keys).size===3&&saved.keys.every(k=>typeof k==='string'&&k.length>0)){
                pending={opId:saved.opId,keys:saved.keys,family:typeof saved.family==='string'?saved.family:'',version:Number.isInteger(saved.version)?saved.version:1,pityAtSend:Number.isInteger(saved.pityAtSend)?saved.pityAtSend:null,waiting:false};
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
        if(ws!==pitySocket){pity=null;pitySocket=ws;armed=''}
        if(Object.prototype.hasOwnProperty.call(msg,'transmutationVersion'))version=Number(msg.transmutationVersion)||0;
        if(Object.prototype.hasOwnProperty.call(msg,'transmutationToken'))token=typeof msg.transmutationToken==='string'?msg.transmutationToken:'';
        if(Object.prototype.hasOwnProperty.call(msg,'transmutationPity')){
            const next=msg.transmutationPity;
            const validated=Number.isInteger(next)&&next>=0&&next<=19?next:null;
            if(pity!==validated)armed='';
            pity=validated;
        }
        if(pending&&online()&&version===RULES.VERSION&&ws!==checkedSocket){
            checkedSocket=ws;queryStatus(true);
        }
        refreshIfOpen();
    }
    function eligible(){
        // Equipped copies are stored outside player.inv. Only backpack units
        // can be consumed; wearing the same base must not hide spare copies.
        return Object.keys(player.inv||{}).filter(k=>ownCount(k)>0&&RULES.tierOf(k)>0).sort((a,b)=>RULES.tierOf(a)-RULES.tierOf(b)||name(a).localeCompare(name(b),LANG==='en'?'en':'pt'));
    }
    function validSelection(keys,choices){return keys.length===3&&new Set(keys).size===3&&keys.every(k=>choices.includes(k)&&ownCount(k)>0)}
    function targetFamily(keys){return keys.length===3&&keys.every(k=>RULES.tierOf(k)===6)?family:''}
    function currentQuote(choices){return validSelection(selected,choices)?RULES.quote(selected,pity===null?0:pity,targetFamily(selected)):null}
    function selectedFingerprint(q){return q&&q.valid?JSON.stringify([selected,targetFamily(selected),q.tier,q.resultTier,q.sameTier,q.cost,q.essenceQty,q.chances,q.pool,q.superiorPool,pity]):''}
    function reason(q){
        if(!online())return txt('Conecte-se ao jogo para continuar.','Connect to the game to continue.');
        if(version!==RULES.VERSION||!token)return txt('Aguardando autorização da bancada.','Waiting for workbench authorization.');
        if(!atCraft())return txt('Aproxime-se da bancada da vila.','Move close to the village workbench.');
        if(!q||!q.valid)return txt('Escolha três peças diferentes da mochila.','Choose three different backpack pieces.');
        if(q.tier===6&&q.sameTier&&pity===null)return txt('Aguardando o contador de proteção contra azar do servidor.','Waiting for the server luck-protection counter.');
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
        if(result?.receipt&&!pending){
            const r=result.receipt,superior=r.category==='superior',ascendant=superior&&r.resultTier===7;
            const title=ascendant?txt('✦ ASCENSÃO! ★★★','✦ ASCENSION! ★★★'):superior?txt('✦ SUBIU DE FAIXA!','✦ HIGHER TIER!'):r.category==='enchanted'?txt('✧ EQUIPAMENTO COM BÔNUS','✧ BONUS EQUIPMENT'):txt('RESULTADO RECEBIDO','RESULT RECEIVED');
            const icon=typeof getItemIconURL==='function'?getItemIconURL(r.newKey,48):'';
            html='<div class="tm-result"><img class="tm-result-icon" src="'+safe(icon)+'" alt=""><div><strong class="tm-result-title">'+title+'</strong><p>'+safe(message)+'</p><small>'+safe((superior?txt('Faixa ','Tier ')+r.tier+' → '+r.resultTier+' · ':'')+txt('Consumidos: ','Consumed: ')+(r.keys||[]).map(k=>'1× '+name(k)).join(' · '))+'</small></div></div>';
            if(r.tier===6&&Number.isInteger(r.pityBefore)&&Number.isInteger(r.pityAfter)&&Number.isFinite(r.chance)&&typeof RULES.pityInfo==='function'){
                const next=RULES.pityInfo(r.pityAfter);
                const line=ascendant
                    ?txt('Proteção reiniciada. Próxima chance: ','Luck protection reset. Next chance: ')+next.chance+'%. '+txt('Garantia em até ','Guaranteed within ')+next.remaining+' '+txt('combinações de míticos.','mythic combinations.')
                    :txt('Chance desta tentativa: ','Chance on this attempt: ')+r.chance+'%. '+txt('Próxima chance: ','Next chance: ')+next.chance+'%. '+txt('Garantia em até ','Guaranteed within ')+next.remaining+' '+txt('combinações de míticos.','mythic combinations.');
                html+='<small class="tm-pity-receipt">'+safe(line)+'</small>';
            }
        }
        if(pending&&!pending.waiting){
            html+='<div class="tm-actions"><button type="button" data-tm-action="check">'+txt('Conferir operação','Check operation')+'</button>';
            if(pending.notFound)html+='<button type="button" data-tm-action="resend" '+(RULES.quote(pending.keys).tier===6&&pity===null?'disabled':'')+'>'+txt('Reenviar esta mesma operação','Resend this same operation')+'</button>';
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
        if(pity!==null&&(!q||q.tier!==6)){
            const progress=RULES.pityInfo(pity);
            html+='<p class="tm-pity"><strong>'+txt('Sua próxima chance de Ascensão: ','Your next Ascension chance: ')+progress.chance+'%</strong><br>'+progress.failures+' '+txt('tentativas sem Ascendente · garantido em até ','attempts without an Ascendant · guaranteed within ')+progress.remaining+' '+txt('combinações de míticos.','mythic combinations.')+'<br>'+txt('O progresso fica salvo mesmo sem as três peças na mochila.','Progress stays saved even without all three backpack pieces.')+'</p>';
        }
        html+='<p>'+txt('Troque três equipamentos por um resultado surpresa. Cada combinação consome uma unidade das peças escolhidas e o ouro indicado.','Trade three equipment pieces for a surprise result. Each combination consumes one of each selected piece and the displayed gold.')+'</p>';
        html+='<p class="tm-note">'+txt('Três peças diferentes da mesma faixa liberam a chance de subir uma faixa. Míticas ★★ são aceitas; Ascendentes ★★★ são somente resultado. Usa somente cópias da mochila, sem melhoria ou encantamento. O equipamento que você está vestindo fica protegido.','Three different pieces of the same tier unlock a chance to move up one tier. Mythic ★★ pieces are accepted; Ascendant ★★★ pieces are output only. Uses only unupgraded, unenchanted backpack copies. The equipment you are wearing stays protected.')+'</p>';
        html+='<p class="tm-note">✧ '+ownCount(MATERIAL)+' '+txt('essências arcanas na mochila','arcane essences in backpack')+'</p>';
        html+='<div class="tm-grid">';
        for(let i=0;i<3;i++){
            html+='<label>'+txt('Peça ','Piece ')+(i+1)+'<select data-tm-slot="'+i+'" '+(block?'disabled':'')+'><option value="">'+txt('Selecione','Select')+'</option>';
            for(const k of choices)if(!selected.includes(k)||selected[i]===k)html+='<option value="'+safe(k)+'" '+(selected[i]===k?'selected':'')+'>'+txt('Faixa ','Tier ')+RULES.tierOf(k)+' · '+safe(name(k))+' ('+ownCount(k)+'×)</option>';
            html+='</select></label>';
        }
        html+='</div>';
        if(q?.valid&&q.tier===6&&q.sameTier){
            html+='<label class="tm-family">'+txt('Alvo da ascensão','Ascension target')+'<select data-tm-family '+(block?'disabled':'')+'><option value="" '+(!family?'selected':'')+'>'+txt('Clássicos: Espada do Infinito, Coroa Celestial ou Cajado Astral','Classics: Sword of Infinity, Celestial Crown or Astral Staff')+'</option>';
            for(const f of RULES.families||[])html+='<option value="'+safe(f.id)+'" '+(family===f.id?'selected':'')+'>'+safe(LANG==='en'?f.nameEn:f.name)+'</option>';
            html+='</select></label><p class="tm-note">'+txt('Escolher uma família direciona apenas o prêmio Ascendente. A chance de ascensão, o custo e sua proteção acumulada continuam iguais. Confira abaixo quais peças podem sair.','Choosing a family only targets the Ascendant prize. Ascension chance, cost and your accumulated protection stay the same. Review the possible items below.')+'</p>';
        }
        if(!choices.length)html+='<p>'+txt('Nenhuma peça elegível na mochila. São aceitas peças sem melhoria ou encantamento até a faixa mítica ★★.','No eligible piece in your backpack. Unupgraded, unenchanted pieces up to mythic ★★ tier are accepted.')+'</p>';
        if(q&&q.valid){
            const pityUnknown=q.tier===6&&pity===null;
            const protection=q.tier===6&&!pityUnknown?(q.pity||RULES.pityInfo?.(pity)):null;
            html+='<div class="tm-card"><strong>'+txt('Prévia da tentativa','Attempt preview')+'</strong>';
            html+='<p>'+txt('Faixa da peça mais fraca: ','Tier of the weakest piece: ')+q.tier+' · <span class="tm-cost">'+txt('Custo: ','Cost: ')+q.cost+' g</span></p>';
            html+='<p>'+txt('Serão consumidas: ','To be consumed: ')+selected.map(k=>'1× '+safe(name(k))).join(' · ')+'</p>';
            if(q.tier===6)html+='<p class="tm-mythic-warning">'+txt('A tentativa consome as três peças míticas escolhidas e '+q.cost+' g. Sem ascensão, pode devolver apenas UMA peça de um dos mesmos tipos, com ou sem um bônus aleatório, ou essências arcanas. Não há garantia de ganho.','This attempt consumes all three selected mythic pieces and '+q.cost+' g. Without ascension, it may return only ONE piece of one of the same types, with or without one random bonus, or arcane essences. A gain is not guaranteed.')+'</p>';
            if(pityUnknown)html+='<p class="tm-pity">'+txt('Chance de Ascensão aguardando o contador do servidor. A confirmação fica bloqueada até a sincronização.','Ascension chance is waiting for the server counter. Confirmation is blocked until synchronization.')+'</p>';
            else{
                if(protection)html+='<p class="tm-pity"><strong>'+txt('Proteção contra azar: ','Luck protection: ')+protection.failures+'/19 '+txt('tentativas sem Ascendente','attempts without an Ascendant')+'</strong><br>'+txt('Chance atual: ','Current chance: ')+protection.chance+'% = 5% '+txt('base + ','base + ')+(5*protection.failures)+' '+txt('pontos percentuais. ','percentage points. ')+txt('Ascendente garantido em até ','Ascendant guaranteed within ')+protection.remaining+' '+txt('combinações de míticos.','mythic combinations.')+'<br>'+txt('Tentativas de outras faixas não contam; só um Ascendente reinicia a proteção.','Other tiers do not count; only an Ascendant resets the protection.')+'</p>';
                html+='<div class="tm-chances"><span>'+q.chances.material+'% '+q.essenceQty+'× '+txt('essência arcana','arcane essence')+'</span><span>'+q.chances.plain+'% '+txt('equipamento da mesma faixa','same-tier equipment')+'</span><span>'+q.chances.enchanted+'% '+txt('mesma faixa com 1 bônus','same tier with 1 bonus')+'</span><span class="tm-superior-chance">'+q.chances.superior+'% '+txt('SUBIR DE FAIXA','HIGHER TIER')+'</span></div>';
            }
            html+='<p>'+txt('Essências são um possível prêmio, não um custo. Cada equipamento tem a mesma chance dentro da sua categoria.','Essences are a possible reward, not a cost. Each equipment item has the same chance within its category.')+'</p>';
            html+='<p>'+txt('Equipamentos possíveis na faixa atual, com ou sem bônus:','Possible current-tier equipment, with or without a bonus:')+'</p><ul class="tm-pool">'+q.pool.map(k=>'<li>'+safe(name(k))+'</li>').join('')+'</ul>';
            if(q.chances.superior>0){
                const each=new Intl.NumberFormat(LANG==='en'?'en-US':'pt-BR',{maximumFractionDigits:2}).format(q.chances.superior/Math.max(1,q.superiorPool.length));
                html+='<div class="tm-superior-preview '+(q.resultTier===7?'tm-ascension-preview':'')+'"><strong>✦ '+(q.resultTier===7?txt('ASCENSÃO','ASCENSION')+' · ':'')+(pityUnknown?txt('chance aguardando servidor','chance pending server'):q.chances.superior+'%')+' · '+txt('Faixa ','Tier ')+q.tier+' → '+q.resultTier+'</strong><p>'+txt('Possíveis resultados superiores:','Possible higher-tier results:')+'</p><ul class="tm-pool tm-superior-pool">'+q.superiorPool.map(k=>'<li>'+safe(name(k))+'</li>').join('')+'</ul>'+(pityUnknown?'':'<small>'+txt('Chance total: ','Total chance: ')+q.chances.superior+'% · '+txt('aproximadamente ','approximately ')+each+'% '+txt('para cada peça acima.','for each item above.')+'</small>')+'<small>'+txt('Recebe uma peça sem melhoria de forja ou encantamento. Uma faixa superior não garante mais força para a sua build.','Receives one piece without forge upgrades or enchantments. A higher tier does not guarantee more power for your build.')+'</small></div>';
            }else html+='<p class="tm-mixed">'+txt('Faixas misturadas: chance de subir desativada. Todas as peças serão consumidas usando a faixa mais baixa. Escolha três da mesma faixa para liberar a evolução.','Mixed tiers: higher-tier chance disabled. All pieces will be consumed using the lowest tier. Choose three of the same tier to unlock promotion.')+'</p>';
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
    function renderState(){return JSON.stringify([owner,LANG,online(),atCraft(),version,token,pity,player.inv,player.equipped,player.gold,selected,family,armed,pending,typeof result?.message==='function'?result.message():result?.message])}
    function refreshIfOpen(){const modal=document.getElementById('craftModal');if(modal?.style.display==='flex'&&modal.classList.contains('transmute-active')&&lastRenderState!==renderState())render();else renderStatus()}
    function queryStatus(auto){
        if(!pending||!online()||version!==RULES.VERSION||checkBusy)return;
        checkBusy=true;pending.waiting=true;result=null;renderStatus();
        try{ws.send(JSON.stringify({t:'transmuteStatus',opId:pending.opId}));startTimeout()}
        catch{checkBusy=false;pending.waiting=false;result={kind:'warn',message:()=>txt('Não foi possível consultar agora. Tente após reconectar.','Could not check now. Try after reconnecting.')};renderStatus()}
    }
    function resendSame(){
        if(!pending||pending.version!==RULES.VERSION||!pending.notFound||!available()||pending.waiting||
            (RULES.quote(pending.keys).tier===6&&pity===null))return;
        pending.notFound=false;pending.waiting=true;result=null;renderStatus();
        try{ws.send(JSON.stringify({t:'invTransmute',version:pending.version,opId:pending.opId,keys:pending.keys,family:pending.family||''}));startTimeout()}
        catch{pending.waiting=false;result={kind:'warn',message:()=>txt('Envio incerto. Confira a operação antes de tentar novamente.','Send state unknown. Check the operation before trying again.')};renderStatus()}
    }
    function attempt(){
        const choices=eligible(),q=currentQuote(choices);
        if(pending||!q?.valid||reason(q)||armed!==selectedFingerprint(q))return;
        pending={opId:token,keys:[...selected],family:targetFamily(selected),version:RULES.VERSION,pityAtSend:q.tier===6?pity:null,waiting:false};
        checkedSocket=ws;
        if(!savePending()){pending=null;result={kind:'error',message:()=>txt('Não foi possível guardar a operação neste aparelho. Libere espaço e tente novamente.','Could not save this operation on this device. Free storage and try again.')};renderStatus();return}
        armed='';pending.waiting=true;result=null;render();
        try{ws.send(JSON.stringify({t:'invTransmute',version:RULES.VERSION,opId:pending.opId,keys:pending.keys,family:pending.family||''}));startTimeout()}
        catch{pending.waiting=false;result={kind:'warn',message:()=>txt('Envio incerto. Confira esta operação antes de continuar.','Send state unknown. Check this operation before continuing.')};renderStatus();render()}
    }
    function handleResult(r){
        if(!pending||!r||r.opId!==pending.opId)return;
        clearTimer();checkBusy=false;
        if(r.error==='not_found'){
            const legacy=pending.version!==RULES.VERSION,quote=RULES.quote(pending.keys);
            const changedChance=!legacy&&quote.tier===6&&(!Number.isInteger(pending.pityAtSend)||pity!==pending.pityAtSend);
            if(legacy||token!==pending.opId||changedChance){
                pending=null;savePending();armed='';selected=['','',''];
                result={kind:'warn',message:()=>legacy
                    ?txt('A tentativa antiga não foi executada. As regras mudaram: confira uma nova prévia antes de confirmar.','The old attempt was not executed. Rules have changed: review a new preview before confirming.')
                    :changedChance
                        ?txt('A tentativa não foi executada e a chance mudou. Confira uma nova prévia antes de confirmar.','The attempt was not executed and the chance changed. Review a new preview before confirming.')
                        :txt('A tentativa não foi executada e a autorização mudou. Confira uma nova prévia antes de confirmar.','The attempt was not executed and authorization changed. Review a new preview before confirming.')};
            }else{
                pending.waiting=false;pending.notFound=true;
                result={kind:'warn',message:()=>txt('Esta operação ainda não consta no servidor. Você pode reenviar exatamente a mesma tentativa.','This operation was not found on the server. You may manually resend the exact same attempt.')};
            }
        }else{
            pending=null;savePending();armed='';selected=['','',''];
            if(r.ok){
                result={kind:r.category==='superior'?(r.resultTier===7?'ascendant':'superior'):'ok',receipt:r,message:()=>{
                    const received=String(r.qty||1)+'× '+name(r.newKey||MATERIAL);
                    const bonuses=ValadaresEquipment.parse(r.newKey).affixes.map(a=>ValadaresEquipment.describe(a,LANG)).join(' · ');
                    return txt('Transmutação concluída: ','Transmutation complete: ')+received+(bonuses?' — '+bonuses:'')+'. '+txt('Custo: ','Cost: ')+r.cost+' g.';
                }};
                if(typeof playGameSound==='function')playGameSound(r.category==='superior'?'forgeSuccess':r.category==='enchanted'?'rareLoot':'pickup');
                const tableOpen=document.getElementById('craftModal')?.style.display==='flex'&&document.getElementById('craftModal')?.classList.contains('transmute-active');
                if(!tableOpen&&typeof showServerToast==='function')showServerToast('event',(r.category==='superior'?(r.resultTier===7?txt('✦ ASCENSÃO! ★★★ ','✦ ASCENSION! ★★★ '):txt('✦ Subiu de faixa! ','✦ Higher tier! ')):'')+result.message(),null,6500);
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
        const target=e.target.closest('#transmutationPanel [data-tm-family]');
        if(target){if(pending)return;family=(RULES.families||[]).some(f=>f.id===target.value)?target.value:'';armed='';render();return}
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
