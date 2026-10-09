(function () {
  'use strict';
  const actors=new Map(); let receivedAt=0,selected=null,dialog=null,status=null;
  const english=()=>window.ValadaresModernBridge?.getLanguage?.()==='en';
  const words=(pt,en)=>english()?en:pt;
  function receive(message) {
    if(message.t==='companionResult') {
      if(status)status.textContent=message.ok?words('Combinado. Pode seguir seu caminho!','All set. Lead the way!'):words('Aproxime-se de um companheiro disponível para pedir ajuda.','Move closer to an available companion to ask for help.');
      return;
    }
    if(message.t!=='companions'||!Array.isArray(message.list))return;
    const time=performance.now(),keep=new Set();
    for(const row of message.list.slice(0,10)) {
      if(row.automatic!==true||!/^companion-\d+$/.test(row.id)||!Number.isFinite(row.x)||!Number.isFinite(row.y))continue;
      const prev=actors.get(row.id),current=prev?interpolate(prev,time):row;
      actors.set(row.id,{...row,fromX:current.renderX??current.x,fromY:current.renderY??current.y,at:time,artAttackAt:row.attackSeq||0});keep.add(row.id);
    }
    for(const id of actors.keys())if(!keep.has(id))actors.delete(id);
    receivedAt=time;
  }
  function interpolate(row,time){const t=Math.min(1,Math.max(0,(time-row.at)/650));return {...row,renderX:row.fromX+(row.x-row.fromX)*t,renderY:row.fromY+(row.y-row.fromY)*t};}
  function getAll() {
    const bridge=window.ValadaresModernBridge,time=performance.now();
    if(!bridge?.getStarted?.()||!bridge?.getStatus?.().connected||(bridge?.getFloor?.()||0)!==0||time-receivedAt>4000)return [];
    return Array.from(actors.values(),row=>interpolate(row,time));
  }
  function send(action) {
    const row=actors.get(selected); if(!row)return;
    if(window.ValadaresModernBridge?.sendCompanionAction?.(row.id,action)!==true&&status)status.textContent=words('Reconecte ao mundo para continuar.','Reconnect to the world to continue.');
  }
  function open(id) {
    const row=actors.get(id);if(!row||!getAll().length)return;
    selected=id;
    if(!dialog) {
      const style=document.createElement('link');style.rel='stylesheet';style.href='/companions.css?v=20261009';document.head.append(style);
      dialog=document.createElement('dialog');dialog.className='companion-dialog';dialog.setAttribute('aria-labelledby','companionTitle');document.body.append(dialog);
      dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
      dialog.addEventListener('keydown',e=>e.stopPropagation());
    }
    dialog.replaceChildren();
    const eyebrow=document.createElement('p');eyebrow.className='companion-eyebrow';eyebrow.textContent=words('COMPANHEIRO AUTOMÁTICO','AUTOMATIC COMPANION');dialog.append(eyebrow);
    const title=document.createElement('h2');title.id='companionTitle';title.textContent=row.name;dialog.append(title);
    const text=document.createElement('p');text.textContent=words('Eu patrulho a vila e posso acompanhar você pelos arredores. Ajudo em lutas que você começou, deixando os golpes finais e as recompensas para você.','I patrol the village and can join you around the outskirts. I help with fights you started, leaving the final blows and rewards to you.');dialog.append(text);
    const note=document.createElement('p');note.className='companion-note';note.textContent=words('Sou um personagem controlado pelo jogo. Não entro em masmorras, trocas, PvP ou ranking.','I am a game-controlled character. I do not enter dungeons, trades, PvP or rankings.');dialog.append(note);
    status=document.createElement('p');status.setAttribute('role','status');status.textContent=row.followingYou?words('Estou acompanhando você.','I am following you.'):row.busy?words('Estou acompanhando outro aventureiro.','I am following another adventurer.'):words('Para começar, fale com a Atendente perto da praça.','To get started, speak to the Attendant near the square.');dialog.append(status);
    const actions=document.createElement('div');actions.className='companion-actions';dialog.append(actions);
    const follow=document.createElement('button');follow.type='button';follow.textContent=words('Pedir companhia','Ask to join');follow.disabled=!!row.busy;follow.addEventListener('click',()=>send('follow'));actions.append(follow);
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent=words('Seguir sozinho','Continue alone');dismiss.addEventListener('click',()=>send('dismiss'));actions.append(dismiss);
    const close=document.createElement('button');close.type='button';close.textContent=words('Fechar','Close');close.addEventListener('click',()=>dialog.close());actions.append(close);
    if(!dialog.open)dialog.showModal();
  }
  function reset(){actors.clear();receivedAt=0;selected=null;if(dialog?.open)dialog.close();}
  window.ValadaresCompanions=Object.freeze({receive,getAll,open,reset});
})();
