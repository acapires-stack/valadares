(function(){
    'use strict';
    const R=ValadaresEquipment;
    I18N.pt['enchant.tab']='ENCANTAR';
    I18N.en['enchant.tab']='ENCHANT';
    let selected='',pending=null,message='',timer=null,loadedOwner='',lastRenderState='',choices={};
    function renderState(){return JSON.stringify([player.name,player.inv,player.equipped,player.gold,selected,choices,pending,message,LANG,window.equipmentServerVersion,window.enchantingEnabled,window.enchantToken]);}
    function pendingKey(){return 'valadares:enchantPending:'+String(player.name||'').toLowerCase();}
    function restorePending(){
        const owner=String(player.name||'').toLowerCase();
        if(!owner||loadedOwner===owner)return;
        loadedOwner=owner;pending=null;
        try{const saved=JSON.parse(localStorage.getItem(pendingKey()));
            if(saved&&typeof saved.opId==='string'&&R.parse(saved.itemKey).valid&&Number.isInteger(saved.slot)&&saved.slot>=0&&saved.slot<3)
                pending={...saved,waiting:false};
        }catch{}
    }
    function txt(pt,en){return LANG==='en'?en:pt;}
    function owned(){
        const keys=new Set([...Object.keys(player.inv||{}).filter(k=>player.inv[k]>0),...Object.values(player.equipped||{}).filter(Boolean)]);
        return [...keys].filter(k=>ITEMS[k]&&R.validFor(k,ITEMS[k].kind)).sort((a,b)=>itmName(a).localeCompare(itmName(b)));
    }
    function render(){
        const el=document.getElementById('enchantPanel');if(!el)return;
        restorePending();
        if(!el._enchantBound){
            el._enchantBound=true;
            el.addEventListener('click',e=>{
                const btn=e.target.closest('[data-enchant-slot]');
                if(btn&&!btn.disabled)attempt(Number(btn.dataset.enchantSlot));
                if(e.target.closest('[data-enchant-retry]')&&pending&&!pending.waiting)sendPending();
            });
            el.addEventListener('blur',e=>{
                if(e.target.id==='enchantItem')requestAnimationFrame(()=>refreshIfOpen());
            },true);
            el.addEventListener('change',e=>{
                if(e.target.matches('[data-enchant-choice]')){
                    choices[Number(e.target.dataset.enchantChoice)]=e.target.value;
                    render();
                }
            });
        }
        const scrollTop=el.scrollTop,poolOpen=el.querySelector('.ench-pool')?.open;
        const selectFocused=document.activeElement===el.querySelector('#enchantItem');
        const keys=owned();
        if(!keys.includes(selected))selected=keys.includes(player.equipped.weapon)?player.equipped.weapon:(keys[0]||'');
        lastRenderState=renderState();
        const t=R.parse(selected),essence=player.inv[R.MATERIAL]||0;
        const worn=Object.values(player.equipped||{}).includes(selected);
        document.getElementById('craftGoldLabel').textContent=player.gold+' g';
        let html='<div class="ench-intro"><span class="ench-kicker">✧ '+txt('UMA PEÇA, SUA ESCOLHA','ONE PIECE, YOUR CHOICE')+'</span><h3>'+txt('Dê uma identidade ao seu equipamento','Make your equipment your own')+'</h3><p>'+txt('Até três bônus próprios. Seu nível de forja e os outros bônus permanecem ao trocar um encantamento.','Up to three individual bonuses. Your forge level and the other bonuses remain when rerolling one enchantment.')+'</p></div>';
        html+='<div class="ench-wallet"><span>✧ '+essence+' '+txt('essências arcanas','arcane essences')+'</span><small>'+txt('Monstros podem deixar essências. Chefes sempre deixam.','Monsters may drop essences. Bosses always do.')+'</small></div>';
        if(window.equipmentServerVersion!==R.VERSION)html+='<p class="ench-notice">'+txt('Aguardando conexão com o sistema de encantamentos.','Waiting for the enchantment system connection.')+'</p>';
        else if(window.enchantingEnabled===false)html+='<p class="ench-notice">'+txt('Novos encantamentos estão em manutenção. Suas peças e seus bônus continuam funcionando.','New enchantments are under maintenance. Your pieces and bonuses still work.')+'</p>';
        if(message)html+='<p class="ench-notice" role="status">'+escapeHtml(message)+'</p>';
        if(pending)html+='<p class="ench-notice">'+txt('Aguardando confirmação da tentativa…','Waiting for confirmation…')+'</p>'+(pending.waiting?'':'<button class="ench-retry" data-enchant-retry>'+txt('Conferir tentativa pendente','Check pending attempt')+'</button>');
        if(!selected){el.innerHTML=html+'<p class="ench-empty">'+txt('Encontre uma arma, armadura, escudo, capacete, bota ou amuleto para começar.','Find a weapon, armor, shield, helmet, boots or necklace to begin.')+'</p>';el.scrollTop=scrollTop;return;}
        html+='<label class="ench-label" for="enchantItem">'+txt('Escolha a peça','Choose a piece')+'</label><select id="enchantItem" '+(pending?'disabled':'')+'>';
        for(const k of keys){
            const p=R.parse(k),n=itmName(k)+(p.enchanted?' · #'+p.id.slice(-4).toUpperCase():'');
            html+='<option value="'+escapeHtml(k)+'" '+(k===selected?'selected':'')+'>'+escapeHtml(n)+'</option>';
        }
        html+='</select><div class="ench-piece"><span class="ench-icon" style="background-image:url('+getItemIconURL(selected,40)+')"></span><div><strong>'+escapeHtml(itmName(selected))+'</strong><small>'+(worn?txt('Equipado · permanece equipado','Equipped · stays equipped'):txt('Mochila · apenas uma peça será alterada','Backpack · only one piece will change'))+'</small></div><span class="ench-plus">+'+t.plus+'</span></div>';
        const pool=Object.entries(R.AFFIXES).filter(([,d])=>d.kinds.includes(ITEMS[selected].kind));
        const active=R.bonuses(player.equipped,base=>ITEMS[base]?.kind);
        html+='<div class="ench-slots">';
        for(let slot=0;slot<3;slot++){
            const a=t.affixes[slot],c=R.cost(slot,!!a),locked=slot>t.affixes.length;
            const enough=essence>=c.essence&&player.gold>=c.gold;
            const disabled=locked||!enough||!!pending||window.equipmentServerVersion!==R.VERSION||window.enchantingEnabled===false||!window.enchantToken;
            const action=a?txt('Trocar este bônus','Replace this bonus'):txt('Adicionar bônus','Add a bonus');
            const choice=pool.some(([code])=>code===choices[slot])?choices[slot]:'';
            const shownCode=choice||(a&&a.code);
            html+='<section class="ench-slot '+(a?'filled':'')+'"><div class="ench-slot-title"><span>0'+(slot+1)+'</span><strong>'+(a?escapeHtml(R.AFFIXES[a.code][LANG==='en'?'en':'pt']):txt('Espaço livre','Open slot'))+'</strong></div>';
            html+='<p>'+(a?escapeHtml(R.describe(a,LANG)):locked?txt('Preencha o espaço anterior primeiro.','Fill the previous slot first.'):txt('Escolha o atributo; o valor será sorteado.','Choose the attribute; its value is rolled.'))+'</p>';
            html+='<label class="ench-label" for="enchantChoice'+slot+'">'+txt('Atributo deste espaço','Attribute for this slot')+'</label><select id="enchantChoice'+slot+'" data-enchant-choice="'+slot+'" '+(pending||locked?'disabled':'')+'>';
            html+='<option value="" '+(!choice?'selected':'')+'>'+txt('Sortear atributo e valor','Roll attribute and value')+'</option>';
            for(const[code,d]of pool)html+='<option value="'+code+'" '+(choice===code?'selected':'')+'>'+escapeHtml(d[LANG==='en'?'en':'pt'])+' ('+d.min+'–'+d.max+(d.unit==='%'?'%':'')+')</option>';
            html+='</select>';
            if(shownCode){
                const stat=R.AFFIXES[shownCode].stat,cap=R.CAPS[stat];
                html+='<small>'+txt('Efetivo equipado: ','Equipped effective: ')+escapeHtml(R.describe({code:shownCode,value:active[stat]||0},LANG))+' / '+cap+(R.AFFIXES[shownCode].unit==='%'?'%':'')+' '+txt('(limite)','(cap)')+'</small>';
            }
            html+='<div class="ench-slot-action"><small>✧ '+c.essence+' · '+c.gold.toLocaleString(LANG==='en'?'en-US':'pt-BR')+' g</small><button type="button" data-enchant-slot="'+slot+'" '+(disabled?'disabled':'')+'>'+action+'</button></div></section>';
        }
        html+='</div><p class="ench-foot">'+txt('Atributos podem se repetir nos três espaços. Escolher o atributo mantém o custo; o valor é sorteado e pode ser menor ao trocar um bônus. A peça não quebra.','Attributes may repeat across all three slots. Choosing one keeps the same cost; its rolled value may be lower when replacing a bonus. The piece never breaks.')+'</p>';
        html+='<details class="ench-pool"><summary>'+txt('Bônus possíveis e limites','Possible bonuses and limits')+'</summary>';
        for(const[code,d]of pool)html+='<p>'+escapeHtml(R.describe({code,value:d.min},LANG))+' — '+d.max+(d.unit==='%'?'%':'')+'</p>';
        html+='<small>'+txt('Bônus efetivos equipados / limite: ','Effective equipped bonuses / cap: ')+Object.entries(R.CAPS).map(([stat,value])=>{
            const code=Object.keys(R.AFFIXES).find(c=>R.AFFIXES[c].stat===stat);
            return escapeHtml(R.describe({code,value:active[stat]||0},LANG))+' / '+value+(R.AFFIXES[code].unit==='%'?'%':'');
        }).join(' · ')+'</small></details>';
        el.innerHTML=html;
        const poolDetails=el.querySelector('.ench-pool');if(poolDetails&&poolOpen)poolDetails.open=true;
        el.scrollTop=scrollTop;
        if(selectFocused)el.querySelector('#enchantItem').focus({preventScroll:true});
        el.querySelector('#enchantItem').addEventListener('change',e=>{selected=e.target.value;choices={};message='';render()});
    }
    function sendPending(){
        if(!pending)return;
        if(!ws||ws.readyState!==1||!_wsAuthed){message=txt('Reconecte para conferir a tentativa. Nenhuma nova tentativa foi enviada.','Reconnect to check the attempt. No new attempt was sent.');render();return;}
        pending.waiting=true;
        try{ws.send(JSON.stringify({t:'invEnchant',itemKey:pending.itemKey,slot:pending.slot,opId:pending.opId,
            ...(pending.affixCode?{affixCode:pending.affixCode}:{})}))}
        catch{pending.waiting=false;}
        clearTimeout(timer);timer=setTimeout(()=>{if(pending){pending.waiting=false;message=txt('A confirmação demorou. Confira a mesma tentativa para evitar gastar duas vezes.','Confirmation is taking longer. Check the same attempt to avoid spending twice.');render()}},8000);
        render();
    }
    function attempt(slot){
        restorePending();
        if(pending||!window.enchantToken||window.enchantingEnabled===false)return;
        if(!atCraft()){message=txt('Aproxime-se da bancada da vila.','Move close to the village workbench.');render();return;}
        const t=R.parse(selected),c=R.cost(slot,slot<t.affixes.length);
        if(!c||slot>t.affixes.length||player.gold<c.gold||(player.inv[R.MATERIAL]||0)<c.essence)return;
        pending={itemKey:selected,slot,opId:window.enchantToken,waiting:false};
        if(choices[slot])pending.affixCode=choices[slot];
        message='';
        try{localStorage.setItem(pendingKey(),JSON.stringify(pending));}
        catch{pending=null;message=txt('Não foi possível guardar a tentativa neste aparelho. Libere o armazenamento do jogo e tente novamente.','Unable to store this attempt on your device. Free game storage and try again.');render();return;}
        sendPending();
    }
    function handleResult(r){
        restorePending();
        if(pending&&r.opId&&pending.opId!==r.opId)return;
        try{localStorage.removeItem(pendingKey());}catch{}
        clearTimeout(timer);pending=null;
        if(r.ok){selected=r.newKey;message=txt('Encantamento concluído. Esta peça tem seus próprios bônus.','Enchantment complete. This piece has its own bonuses.');}
        else{
            const errors={
                no_item:txt('Esta peça não está mais com você.','You no longer own this piece.'),
                no_essence:txt('Faltam essências arcanas.','Not enough arcane essences.'),
                no_gold:txt('Falta ouro para esta tentativa.','Not enough gold for this attempt.'),
                no_resources:txt('Faltam essências arcanas ou ouro para esta tentativa.','Not enough arcane essences or gold for this attempt.'),
                inventory_full:txt('Libere um espaço na mochila antes de encantar.','Free a backpack slot before enchanting.'),
                locked_slot:txt('Preencha o espaço anterior primeiro.','Fill the previous slot first.'),
                save_failed:txt('A tentativa foi cancelada porque não foi possível salvar. Os materiais foram preservados.','The attempt was cancelled because it could not be saved. Your materials were preserved.'),
                capacity:txt('Libere um espaço na mochila antes de encantar.','Free a backpack slot before enchanting.'),
                not_at_bench:txt('Aproxime-se da bancada da vila.','Move close to the village workbench.'),
                busy:txt('Termine a troca ou o combate antes de encantar.','Finish trading or fighting before enchanting.'),
                invalid:txt('Esta tentativa não é válida.','This attempt is not valid.'),
                update_required:txt('Atualize o jogo para usar encantamentos.','Refresh the game to use enchantments.')
                ,stale_op:txt('Esta tentativa já foi encerrada. Confira sua peça e os bônus antes de fazer outra.','This attempt has already ended. Check your piece and bonuses before trying again.')
                ,disabled:txt('Novos encantamentos estão em manutenção. Seus itens foram preservados.','New enchantments are under maintenance. Your items have been preserved.')
                ,invalid_choice:txt('Este atributo não serve nesta peça. Escolha outro.','This attribute is not valid for this item. Choose another.')
                ,op_conflict:txt('Esta tentativa pendente pertence a outra escolha. Confira seus bônus antes de tentar novamente.','This pending attempt belongs to another choice. Check your bonuses before trying again.')
            };
            message=errors[r.error]||txt('Não foi possível encantar. Confira a peça, os materiais e sua posição.','Unable to enchant. Check your item, materials and position.');
        }
        refreshIfOpen(true);
    }
    function refreshIfOpen(force=false){
        const el=document.getElementById('enchantPanel');
        if(el&&el.style.display!=='none'&&document.getElementById('craftModal').style.display==='flex'
            &&(force||renderState()!==lastRenderState)
            &&(force||document.activeElement!==el.querySelector('#enchantItem')))render();
    }
    function reset(){clearTimeout(timer);pending=null;selected='';choices={};message='';loadedOwner='';lastRenderState='';}
    window.ValadaresEnchantUI={render,handleResult,refreshIfOpen,reset,attempt};
})();
