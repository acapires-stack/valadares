(function(root){
  'use strict';
  const rules=root.WeaponTechniquesRules;
  if (!rules) return;
  let bridge=null,current=null;
  const pending=new Map(),confirmed=new Map();
  const label=(pt,en)=>bridge?.lang()==='en'?en:pt;
  function render(){
    const panel=document.getElementById('weaponTechniquesPanel');
    const badge=document.getElementById('weaponTechniqueCharge');
    if (!panel || !badge) return;
    const state=current?.state;
    const active=current?.activeId && rules.BY_ID[current.activeId];
    badge.style.display=active?'block':'none';
    if(active) badge.textContent=`⚔ ${bridge.lang()==='en'?active.nameEn:active.name} ${current.charge||0}/3`;
    if(!state){panel.textContent=label('Aguardando estado do servidor…','Waiting for server state…');return;}
    const unavailable=!current.enabled;
    const note=unavailable?label('Técnicas temporariamente indisponíveis; compras preservadas.','Techniques temporarily unavailable; purchases preserved.'):
      current.inactiveReason==='not_legendary'?label('Equipe arma lendária ★ ou superior para ativar.','Equip a legendary ★ weapon or higher to activate.'):
      current.inactiveReason==='no_weapon'?label('Equipe uma arma lendária para ativar.','Equip a legendary weapon to activate.'):
      current.inactiveReason==='disabled'?label('A técnica desta arma está desligada.','This weapon technique is off.'):
      current.inactiveReason==='not_owned'?label('A técnica desta arma ainda não foi aprendida.','This weapon technique has not been learned yet.'):'';
    panel.innerHTML=`<div style="font-size:15px;color:#e8c77a;font-weight:700;margin:16px 0 5px">${label('Técnicas de armas','Weapon techniques')}</div>
      <div style="font-size:11px;color:#a99d81;margin-bottom:9px">${label('Compra permanente · 20.000 gold cada · efeito a cada 3 acertos básicos · armas lendárias ★ ou superiores','Permanent purchase · 20,000 gold each · effect every 3 basic hits · legendary ★ weapons or higher')}</div>
      ${note?`<div style="font-size:11px;color:#d5a461;margin-bottom:9px">${note}</div>`:''}
      <div style="font-size:11px;color:#c8b783;margin-bottom:8px">${label('Gold','Gold')}: ${Number(current.gold||0).toLocaleString(bridge.lang()==='en'?'en-US':'pt-BR')} · ${active?`${label('Carga','Charge')}: ${current.charge||0}/3`:label('Sem técnica ativa','No active technique')}</div>
      ${rules.TECHNIQUES.map(t=>{
        const owned=state.owned.includes(t.id),disabled=state.disabled.includes(t.id),isActive=current.activeId===t.id;
        const action=owned?`<button class="chest-btn" data-technique-toggle="${t.id}" ${unavailable?'disabled':''} style="padding:6px 9px;width:auto;flex:0 0 auto;min-width:125px">${disabled?label('Ligar','Enable'):label('Desligar','Disable')}</button>`:
          `<button class="chest-btn" data-technique-buy="${t.id}" ${unavailable||current.gold<rules.PRICE?'disabled':''} style="padding:6px 9px;width:auto;flex:0 0 auto;min-width:125px">${label('Comprar','Buy')} 20.000g</button>`;
        return `<div style="display:flex;gap:12px;align-items:center;border:1px solid #4b402e;padding:8px;margin:5px 0;background:${isActive?'#302b1b':'#211e1a'}"><div style="flex:1"><b style="color:#e6c77f">${bridge.lang()==='en'?t.nameEn:t.name}</b> <span style="font-size:10px;color:#9b946f">${isActive?label('ATIVA','ACTIVE'):owned?(disabled?label('DESLIGADA','OFF'):label('APRENDIDA','OWNED')):''}</span><div style="font-size:11px;color:#b8ae96">${bridge.lang()==='en'?t.descriptionEn:t.description}</div></div>${action}</div>`;
      }).join('')}`;
    panel.querySelectorAll('[data-technique-buy]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.techniqueBuy,t=rules.BY_ID[id];
      if(!t || !confirm(label(`Comprar ${t.name} por 20.000 gold? Compra permanente.`,`Buy ${t.nameEn} for 20,000 gold? Permanent purchase.`)))return;
      bridge.send({t:'techniqueBuy',id});button.disabled=true;
    }));
    panel.querySelectorAll('[data-technique-toggle]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.techniqueToggle;
      bridge.send({t:'techniqueToggle',id,enabled:state.disabled.includes(id)});button.disabled=true;
    }));
  }
  function onState(message){
    current=message;render();
    if(message.result?.error && bridge?.toast){
      const reasons={no_gold:label('Gold insuficiente.','Not enough gold.'),unavailable:label('Técnicas indisponíveis.','Techniques unavailable.'),save_failed:label('Compra não salva; tente novamente.','Purchase could not be saved; try again.'),invalid_id:label('Técnica inválida.','Invalid technique.')};
      bridge.toast(reasons[message.result.error]||label('Não foi possível alterar a técnica.','Could not change technique.'));
    }
  }
  function setGold(value){if(current && Number.isFinite(value)){current={...current,gold:value};render();}}
  function present(message){
    if(!bridge?.present || !message || (message.floor||0)!==(bridge.floor()||0))return;
    bridge.present(message);
  }
  function onProc(message){
    const id=String(message.eventId||'');
    if(!id)return;
    if(confirmed.has(id)){present(message);return;}
    pending.set(id,message);
    if(pending.size>64)pending.delete(pending.keys().next().value);
  }
  function onConfirmedImpact(id){
    id=String(id||'');if(!id)return;
    confirmed.set(id,Date.now());if(confirmed.size>128)confirmed.delete(confirmed.keys().next().value);
    const message=pending.get(id);if(message){pending.delete(id);present(message);}
  }
  function clear(){pending.clear();confirmed.clear();current=null;render();}
  root.ValadaresWeaponTechniquesUI={init(value){bridge=value;render();},render,onState,setGold,onProc,onConfirmedImpact,clear};
})(typeof globalThis!=='undefined'?globalThis:this);
