(function(root){
    'use strict';
    const R=root.AppearanceRules;
    let bridge=null, dialog=null, draft=null, pending=null, timer=null, retry=false;
    const copy={
        pt:{title:'Sua aparência',intro:'Experimente um traje. Os básicos são gratuitos. Compre uma skin extra uma vez e troque para ela quando quiser, sem pagar novamente. Sua aparência não altera atributos nem limita suas armas.',
            body:'Traje completo',palette:'Paleta',save:'Salvar aparência',close:'Fechar',saving:'Salvando…',saved:'Aparência salva na sua conta.',
            modern:'A prévia aparece no seu personagem. Suas armas continuam as mesmas.',classic:'Sua escolha fica salva para o visual 3D. O clássico mantém seus próprios sprites.',
            unavailable:'Reconecte ao jogo para salvar.',failed:'Não foi possível salvar. Sua aparência anterior foi mantida.',
            timeout:'A confirmação ainda não chegou. Verifique a mesma troca antes de escolher outra.',too_fast:'Aguarde um instante antes de salvar novamente.',
            free:'Grátis',current:'Em uso',owned:'Desbloqueada',paid:'gold · compra única',retry:'Verificar troca',no_gold:'Gold insuficiente. Nenhum gold foi descontado; sua escolha continua na prévia.',not_at_npc:'Reconecte ao jogo para atualizar a loja. Nenhum gold foi descontado.',change:'Comprar e usar por',balance:'Seu gold',cost:'Custo agora',charged:'gold descontados. Skin desbloqueada; próximas trocas são grátis.'},
        en:{title:'Your appearance',intro:'Try an outfit. Basic outfits are free. Buy an extra skin once and switch to it whenever you like at no further cost. Appearance does not change stats or restrict weapons.',
            body:'Full outfit',palette:'Palette',save:'Save appearance',close:'Close',saving:'Saving…',saved:'Appearance saved to your account.',
            modern:'Preview shown on your character. Your weapons stay the same.',classic:'Your choice is saved for 3D visuals. Classic mode keeps its own sprites.',
            unavailable:'Reconnect to the game to save.',failed:'Could not save. Your previous appearance was kept.',
            timeout:'Confirmation has not arrived. Check the same change before choosing another.',too_fast:'Wait a moment before saving again.',
            free:'Free',current:'Equipped',owned:'Unlocked',paid:'gold · buy once',retry:'Check change',no_gold:'Not enough gold. No gold was spent; your choice remains in the preview.',not_at_npc:'Reconnect to update the shop. No gold was spent.',change:'Buy and equip for',balance:'Your gold',cost:'Cost now',charged:'gold spent. Skin unlocked; future changes are free.'}
    };
    const bodyEn={knight:'Knight',mage:'Mage',rogue:'Wanderer',barbarian:'Barbarian',lorekeeper:'Lorekeeper',cleric:'Cleric',magicalgirl:'Arcane mage'};
    const paletteEn={original:'Original',ocean:'Blue',forest:'Green',wine:'Wine',sand:'Sand'};
    const lang=()=>bridge?.getLanguage?.()==='en'?'en':'pt';
    const tr=k=>copy[lang()][k];
    const number=value=>Number(value||0).toLocaleString(lang()==='en'?'en-US':'pt-BR');
    function cost(){
        const current=R.normalizarAppearance(bridge.getPlayer().appearance);
        const body=R.APPEARANCE_BODIES.find(b=>b.id===draft?.body);
        return draft?.body!==current.body && !bridge.getPlayer().appearanceOwned?.includes(draft?.body) && Number.isSafeInteger(body?.priceGold)?body.priceGold:0;
    }
    function prices(){
        const current=R.normalizarAppearance(bridge.getPlayer().appearance);
        R.APPEARANCE_BODIES.forEach(b=>{
            const button=dialog.querySelector(`[data-body="${b.id}"]`);
            button.querySelector('span').textContent=lang()==='en'?(b.labelEn||bodyEn[b.id]||b.label):b.label;
            button.querySelector('small').textContent=current.body===b.id?tr('current'):bridge.getPlayer().appearanceOwned?.includes(b.id)?tr('owned'):b.priceGold?`${number(b.priceGold)} ${tr('paid')}`:tr('free');
        });
        dialog.querySelector('[data-cost]').textContent=`${tr('cost')}: ${cost()?number(cost())+' gold':tr('free')} · ${tr('balance')}: ${number(bridge.getPlayer().gold)}`;
        dialog.querySelector('[data-save]').textContent=pending&&!retry?tr('saving'):retry?tr('retry'):cost()?`${tr('change')} ${number(cost())} gold`:tr('save');
    }
    function status(text){dialog.querySelector('[data-status]').textContent=text||'';}
    function preview(){
        const p=bridge.getPlayer();
        if(!R.isValidAppearance(draft))draft.palette='original';
        p._appearancePreview=R.normalizarAppearance(draft);
        dialog.querySelectorAll('[data-body]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.body===draft.body)));
        dialog.querySelectorAll('[data-palette]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.palette===draft.palette));b.hidden=!R.isValidAppearance({...draft,palette:b.dataset.palette});});
        prices();
    }
    function create(){
        dialog=document.createElement('dialog');dialog.id='appearanceModal';
        dialog.setAttribute('aria-labelledby','appearanceTitle');
        dialog.innerHTML='<header><h2 id="appearanceTitle"></h2><button type="button" data-close autofocus></button></header><p data-intro></p><fieldset><legend data-body-title></legend><div class="appearance-bodies"></div></fieldset><fieldset><legend data-palette-title></legend><div class="appearance-palettes"></div></fieldset><p class="appearance-note" data-note></p><p class="appearance-cost" data-cost></p><p class="appearance-status" data-status role="status" aria-live="polite"></p><footer><button type="button" data-save></button></footer>';
        document.body.appendChild(dialog);
        dialog.querySelector('[data-close]').onclick=close;
        dialog.querySelector('[data-save]').onclick=save;
        dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
        dialog.addEventListener('close',()=>{const p=bridge?.getPlayer();if(p)delete p._appearancePreview;});
        // Native modal focus/escape, with game shortcuts explicitly suppressed.
        dialog.addEventListener('keydown',e=>{if(dialog.open)e.stopPropagation();});
        for(const body of R.APPEARANCE_BODIES){
            const button=document.createElement('button');button.type='button';button.dataset.body=body.id;
            button.append(document.createElement('span'),document.createElement('small'));
            button.onclick=()=>{if(pending)return;draft.body=body.id;preview();status('');};
            dialog.querySelector('.appearance-bodies').appendChild(button);
        }
        for(const palette of R.APPEARANCE_PALETTES){
            const button=document.createElement('button');button.type='button';button.dataset.palette=palette.id;
            button.style.setProperty('--appearance-swatch',palette.color||'#bd9660');
            button.onclick=()=>{if(pending)return;draft.palette=palette.id;preview();status('');};
            dialog.querySelector('.appearance-palettes').appendChild(button);
        }
    }
    function busy(value){
        dialog.querySelectorAll('[data-body],[data-palette]').forEach(b=>b.disabled=value||!!pending);
        dialog.querySelector('[data-save]').disabled=value;
        prices();
    }
    function revealSelectedBody(){
        const list=dialog.querySelector('.appearance-bodies');
        const selected=list.querySelector('[data-body][aria-pressed="true"]');
        if(!selected)return;
        const listBox=list.getBoundingClientRect(),selectedBox=selected.getBoundingClientRect();
        list.scrollTop+=selectedBox.top-listBox.top-(listBox.height-selectedBox.height)/2;
    }
    function open(){
        if(!bridge||!R)return;
        bridge.beforeOpen?.();
        if(!dialog)create();
        draft=R.normalizarAppearance(pending?.appearance||bridge.getPlayer().appearance);
        dialog.querySelector('#appearanceTitle').textContent=tr('title');
        dialog.querySelector('[data-close]').textContent=tr('close');
        dialog.querySelector('[data-intro]').textContent=tr('intro');
        dialog.querySelector('[data-body-title]').textContent=tr('body');
        dialog.querySelector('[data-palette-title]').textContent=tr('palette');
        dialog.querySelector('[data-note]').textContent=tr(bridge.isModern?.()?'modern':'classic');
        R.APPEARANCE_PALETTES.forEach(p=>{dialog.querySelector(`[data-palette="${p.id}"]`).textContent=lang()==='en'?(p.labelEn||paletteEn[p.id]||p.label):p.label;});
        busy(!!pending&&!retry);status(retry?tr('timeout'):pending?tr('saving'):'');preview();
        if(!dialog.open)dialog.showModal();
        revealSelectedBody();
    }
    function close(){
        if(dialog?.open)dialog.close();
        const p=bridge?.getPlayer();if(p)delete p._appearancePreview;
        // The character drawer may have closed while interacting with the dialog.
        // Do not leave keyboard focus inside a hidden dialog after native close.
        if(dialog?.contains(document.activeElement)){
            const trigger=document.getElementById('appearanceOpen');
            const fallback=document.getElementById('modernCharacter');
            if(trigger?.getClientRects().length)trigger.focus();
            else if(fallback?.getClientRects().length)fallback.focus();
            else document.activeElement.blur();
        }
    }
    function save(){
        if(pending&&!retry)return;
        if(!pending&&cost()>(bridge.getPlayer().gold||0)){status(tr('no_gold'));return;}
        const request=pending||{requestId:root.crypto?.randomUUID?.()||`appearance-${Date.now()}`,appearance:R.normalizarAppearance(draft)};
        if(!bridge.send({t:'appearanceSet',...request})){status(tr('unavailable'));return;}
        pending=request;retry=false;busy(true);status(tr('saving'));
        clearTimeout(timer);
        timer=setTimeout(()=>{retry=true;busy(false);status(tr('timeout'));},8000);
    }
    function onResult(message){
        if(!pending||message.requestId!==pending.requestId)return;
        const attempted=pending.appearance;
        clearTimeout(timer);pending=null;retry=false;
        if(Number.isFinite(message.gold))bridge.getPlayer().gold=message.gold;
        if(Array.isArray(message.appearanceOwned))bridge.getPlayer().appearanceOwned=R.normalizarAppearanceOwned(message.appearanceOwned);
        draft=R.normalizarAppearance(message.ok?message.appearance:attempted);
        busy(false);
        if(dialog.open)preview();else delete bridge.getPlayer()._appearancePreview;
        status(message.ok?(message.costGold?`${number(message.costGold)} ${tr('charged')}`:tr('saved')):tr(['too_fast','no_gold','not_at_npc'].includes(message.error)?message.error:'failed'));
    }
    function reset(){close();clearTimeout(timer);pending=null;draft=null;retry=false;}
    root.ValadaresAppearanceUI={configure:b=>{bridge=b;},open,close,onResult,reset,isOpen:()=>!!dialog?.open};
})(window);
