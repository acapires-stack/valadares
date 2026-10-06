(function(root){
    'use strict';
    const R=root.AppearanceRules;
    let bridge=null, dialog=null, draft=null, pending=null, timer=null;
    const copy={
        pt:{title:'Sua aparência',intro:'Escolha um traje e uma paleta. Todas as opções são livres e não alteram atributos.',
            body:'Traje completo',palette:'Paleta',save:'Salvar aparência',close:'Fechar',saving:'Salvando…',saved:'Aparência salva na sua conta.',
            modern:'A prévia aparece no seu personagem. Suas armas continuam as mesmas.',classic:'Sua escolha fica salva para o visual 3D. O clássico mantém seus próprios sprites.',
            unavailable:'Reconecte ao jogo para salvar.',failed:'Não foi possível salvar. Sua aparência anterior foi mantida.',
            timeout:'Sem confirmação do servidor. Ao reconectar, confira a aparência salva.',too_fast:'Aguarde um instante antes de salvar novamente.'},
        en:{title:'Your appearance',intro:'Choose an outfit and a palette. All options are free and do not change stats.',
            body:'Full outfit',palette:'Palette',save:'Save appearance',close:'Close',saving:'Saving…',saved:'Appearance saved to your account.',
            modern:'Preview shown on your character. Your weapons stay the same.',classic:'Your choice is saved for 3D visuals. Classic mode keeps its own sprites.',
            unavailable:'Reconnect to the game to save.',failed:'Could not save. Your previous appearance was kept.',
            timeout:'No server confirmation. Check your saved appearance after reconnecting.',too_fast:'Wait a moment before saving again.'}
    };
    const bodyEn={knight:'Knight',mage:'Mage',rogue:'Wanderer',barbarian:'Barbarian',lorekeeper:'Lorekeeper',cleric:'Cleric',magicalgirl:'Arcane mage'};
    const paletteEn={original:'Original',ocean:'Blue',forest:'Green',wine:'Wine',sand:'Sand'};
    const lang=()=>bridge?.getLanguage?.()==='en'?'en':'pt';
    const tr=k=>copy[lang()][k];
    function status(text){dialog.querySelector('[data-status]').textContent=text||'';}
    function preview(){
        const p=bridge.getPlayer();
        p._appearancePreview=R.normalizarAppearance(draft);
        dialog.querySelectorAll('[data-body]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.body===draft.body)));
        dialog.querySelectorAll('[data-palette]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.palette===draft.palette)));
    }
    function create(){
        dialog=document.createElement('dialog');dialog.id='appearanceModal';
        dialog.setAttribute('aria-labelledby','appearanceTitle');
        dialog.innerHTML='<header><h2 id="appearanceTitle"></h2><button type="button" data-close autofocus></button></header><p data-intro></p><fieldset><legend data-body-title></legend><div class="appearance-bodies"></div></fieldset><fieldset><legend data-palette-title></legend><div class="appearance-palettes"></div></fieldset><p class="appearance-note" data-note></p><p class="appearance-status" data-status role="status" aria-live="polite"></p><footer><button type="button" data-save></button></footer>';
        document.body.appendChild(dialog);
        dialog.querySelector('[data-close]').onclick=close;
        dialog.querySelector('[data-save]').onclick=save;
        dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
        dialog.addEventListener('close',()=>{const p=bridge?.getPlayer();if(p)delete p._appearancePreview;});
        // Native modal focus/escape, with game shortcuts explicitly suppressed.
        dialog.addEventListener('keydown',e=>{if(dialog.open)e.stopPropagation();});
        for(const body of R.APPEARANCE_BODIES){
            const button=document.createElement('button');button.type='button';button.dataset.body=body.id;
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
        dialog.querySelectorAll('[data-body],[data-palette],[data-save]').forEach(b=>b.disabled=value);
        dialog.querySelector('[data-save]').textContent=tr(value?'saving':'save');
    }
    function open(){
        if(!bridge||!R)return;
        bridge.beforeOpen?.();
        if(!dialog)create();
        draft=R.normalizarAppearance(bridge.getPlayer().appearance);
        dialog.querySelector('#appearanceTitle').textContent=tr('title');
        dialog.querySelector('[data-close]').textContent=tr('close');
        dialog.querySelector('[data-intro]').textContent=tr('intro');
        dialog.querySelector('[data-body-title]').textContent=tr('body');
        dialog.querySelector('[data-palette-title]').textContent=tr('palette');
        dialog.querySelector('[data-note]').textContent=tr(bridge.isModern?.()?'modern':'classic');
        R.APPEARANCE_BODIES.forEach(b=>{dialog.querySelector(`[data-body="${b.id}"]`).textContent=lang()==='en'?(bodyEn[b.id]||b.labelEn||b.label):b.label;});
        R.APPEARANCE_PALETTES.forEach(p=>{dialog.querySelector(`[data-palette="${p.id}"]`).textContent=lang()==='en'?paletteEn[p.id]:p.label;});
        busy(!!pending);status(pending?tr('saving'):'');preview();
        if(!dialog.open)dialog.showModal();
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
        if(pending)return;
        const requestId=root.crypto?.randomUUID?.()||`appearance-${Date.now()}`;
        if(!bridge.send({t:'appearanceSet',requestId,appearance:R.normalizarAppearance(draft)})){status(tr('unavailable'));return;}
        pending=requestId;busy(true);status(tr('saving'));
        timer=setTimeout(()=>{pending=null;busy(false);status(tr('timeout'));delete bridge.getPlayer()._appearancePreview;},8000);
    }
    function onResult(message){
        if(!pending||message.requestId!==pending)return;
        clearTimeout(timer);pending=null;busy(false);
        draft=R.normalizarAppearance(message.appearance);
        if(dialog.open)preview();else delete bridge.getPlayer()._appearancePreview;
        status(tr(message.ok?'saved':message.error==='too_fast'?'too_fast':'failed'));
    }
    function reset(){close();clearTimeout(timer);pending=null;draft=null;}
    root.ValadaresAppearanceUI={configure:b=>{bridge=b;},open,close,onResult,reset,isOpen:()=>!!dialog?.open};
})(window);
