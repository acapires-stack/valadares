(function () {
  'use strict';
  const actors=new Map(); let receivedAt=0,selected=null,dialog=null,status=null,details=null,roster=null,saveWarning=null,hasSaveError=false;
  const english=()=>window.ValadaresModernBridge?.getLanguage?.()==='en';
  const words=(pt,en)=>english()?en:pt;
  function receive(message) {
    if(message.t==='companionAttackResult') {
      window.ValadaresModernBridge?.onCompanionAttackResult?.(message);
      return;
    }
    if(message.t==='companionResult') {
      if(status)status.textContent=message.ok?words('Combinado. Pode seguir seu caminho!','All set. Lead the way!'):words('Aproxime-se de um companheiro disponível para pedir ajuda.','Move closer to an available companion to ask for help.');
      return;
    }
    if(message.t!=='companions'||!Array.isArray(message.list))return;
    hasSaveError=message.persistence?.hasSaveError===true;
    const time=performance.now(),keep=new Set();
    for(const row of message.list.slice(0,10)) {
      if(row.automatic!==true||!/^companion-\d+$/.test(row.id)||!Number.isFinite(row.x)||!Number.isFinite(row.y))continue;
      const prev=actors.get(row.id),current=prev?interpolate(prev,time):row;
      actors.set(row.id,{...row,fromX:current.renderX??current.x,fromY:current.renderY??current.y,at:time,artAttackAt:row.attackSeq||0});keep.add(row.id);
    }
    for(const id of actors.keys())if(!keep.has(id))actors.delete(id);
    receivedAt=time;
    refreshDialog();
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
  const number=value=>Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
  const stateLabel=row=>({travel:words('Explorando e procurando uma caçada','Exploring and looking for a hunt'),combat:words('Em combate','In combat'),defend:words('Defendendo-se de um ataque','Defending against an attack'),rest:words('Descansando','Resting'),recover:words('Recuperando-se de uma derrota','Recovering from a defeat'),following:words('Acompanhando um aventureiro','Following an adventurer'),assist:words('Ajudando em combate','Helping in combat'),patrol:words('Explorando','Exploring')})[row.state]||words('Preparando a próxima aventura','Preparing the next adventure');
  function ensureDialog() {
    if(!dialog) {
      const style=document.createElement('link');style.rel='stylesheet';style.href='/companions.css?v=20261013-pvp';document.head.append(style);
      dialog=document.createElement('dialog');dialog.className='companion-dialog';dialog.setAttribute('aria-labelledby','companionTitle');document.body.append(dialog);
      dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
      dialog.addEventListener('keydown',e=>e.stopPropagation());
    }
    dialog.replaceChildren();details=null;roster=null;status=null;
    saveWarning=element('p','', 'companion-note');saveWarning.setAttribute('role','status');saveWarning.hidden=true;dialog.append(saveWarning);
  }
  function element(tag,text,className){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;}
  function action(parent,label,callback){const button=element('button',label);button.type='button';button.addEventListener('click',callback);parent.append(button);return button;}
  function refreshDialog(){
    if(!dialog?.open)return;
    if(saveWarning){saveWarning.hidden=!hasSaveError;saveWarning.textContent=hasSaveError?words('Não foi possível salvar a evolução agora. O progresso desta sessão pode não ser recuperado após um reinício.','Progress could not be saved right now. This session’s progress may not be recovered after a restart.'):'';}
    if(roster){
      for(const [id,card] of roster){const row=actors.get(id);card.disabled=!row;card.textContent=row?`${row.name} · ${words('Nível','Level')} ${number(row.level)||1}\n${stateLabel(row)}\n${number(row.kills)} ${words('criaturas derrotadas','creatures defeated')} · ${number(row.tasksCompleted)} ${words('tarefas concluídas','tasks completed')}`:words('Aventureiro indisponível','Adventurer unavailable');}
    }
    const row=actors.get(selected);if(!row||!details)return;
    details.level.textContent=`${words('Nível','Level')} ${number(row.level)||1}`;
    details.activity.textContent=stateLabel(row);
    details.health.textContent=`${words('Vida','Health')}: ${number(row.hp)} / ${number(row.maxHp)}`;
    details.xp.textContent=`${words('Experiência','Experience')}: ${number(row.xp)} / ${number(row.xpToNext)} XP`;
    details.history.textContent=`${number(row.kills)} ${words('criaturas derrotadas','creatures defeated')} · ${number(row.tasksCompleted)} ${words('tarefas concluídas','tasks completed')} · ${number(row.deaths)} ${words('derrotas','defeats')}`;
    details.task.textContent=row.task?`${(!english()&&row.task.label)||words('Caçada atual','Current hunt')}: ${number(row.task.progress)} / ${number(row.task.goal)}`:words('Escolhendo a próxima caçada.','Choosing the next hunt.');
    const weapon=row.equipped?.weapon;
    const item=window.ValadaresModernBridge?.getItems?.()[weapon];
    details.weapon.textContent=words('Arma: ','Weapon: ')+(item?.name||weapon||'—');
    const player=window.ValadaresModernBridge?.getPlayer?.();
    const near=player&&Math.max(Math.abs(player.x-row.x),Math.abs(player.y-row.y))<=5;
    details.follow.disabled=!!row.busy||!near||row.state==='recover'||row.state==='defend';
    details.dismiss.disabled=!row.followingYou;
    details.attack.disabled=row.canAttack!==true;
    details.attack.textContent=row.hostileToYou?words('Continuar combate','Continue fighting'):words('Atacar (PvP)','Attack (PvP)');
    details.where.textContent=row.followingYou?words('Acompanhando você.','Following you.'):row.busy?words('Acompanhando outro aventureiro.','Following another adventurer.'):near?words('Você pode pedir companhia por um tempo.','You can ask to join for a while.'):words('Encontre este aventureiro no mundo para pedir companhia.','Meet this adventurer in the world to ask to join.');
  }
  function openRoster(){
    if(!window.ValadaresModernBridge?.getStarted?.())return;
    selected=null;ensureDialog();
    dialog.append(element('p',words('VIDA NO MUNDO','LIFE IN THE WORLD'),'companion-eyebrow'));
    const title=element('h2',words('Aventureiros','Adventurers'));title.id='companionTitle';dialog.append(title);
    dialog.append(element('p',words('Eles escolhem suas caçadas e evoluem mesmo quando você está fora. O progresso fica salvo.','They choose their hunts and progress even while you are away. Their progress is saved.')));
    dialog.append(element('p',words('Personagens automáticos do jogo.','Game-controlled adventurers.'),'companion-note'));
    const list=element('div',null,'companion-roster');dialog.append(list);roster=new Map();
    for(const row of actors.values()){const button=action(list,row.name,()=>open(row.id));roster.set(row.id,button);}
    if(!actors.size)list.append(element('p',words('Volte à superfície e aguarde a atualização dos aventureiros.','Return to the surface and wait for the adventurer update.')));
    const actions=element('div',null,'companion-actions');dialog.append(actions);action(actions,words('Fechar','Close'),()=>dialog.close());
    if(!dialog.open)dialog.showModal();refreshDialog();
  }
  function open(id) {
    const row=actors.get(id);if(!row||!getAll().length)return;
    selected=id;ensureDialog();
    const eyebrow=document.createElement('p');eyebrow.className='companion-eyebrow';eyebrow.textContent=words('AVENTUREIRO AUTOMÁTICO','AUTOMATIC ADVENTURER');dialog.append(eyebrow);
    const title=document.createElement('h2');title.id='companionTitle';title.textContent=row.name;dialog.append(title);
    details={};
    for(const key of ['level','activity','health','xp','weapon','task','history','where']){details[key]=element('p','',key==='level'?'companion-level':key==='where'?'companion-note':'');dialog.append(details[key]);}
    const note=document.createElement('p');note.className='companion-note';note.textContent=words('Eu caço, evoluo e continuo a aventura quando você sai. Se me atacar fora da zona segura, vou me defender.','I hunt, progress and keep adventuring when you leave. If you attack me outside a safe zone, I will defend myself.');dialog.append(note);
    status=document.createElement('p');status.setAttribute('role','status');dialog.append(status);
    const actions=document.createElement('div');actions.className='companion-actions';dialog.append(actions);
    const follow=document.createElement('button');follow.type='button';follow.textContent=words('Pedir companhia','Ask to join');follow.addEventListener('click',()=>send('follow'));actions.append(follow);details.follow=follow;
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent=words('Retomar suas caçadas','Resume your hunts');dismiss.addEventListener('click',()=>send('dismiss'));actions.append(dismiss);details.dismiss=dismiss;
    details.attack=action(actions,words('Atacar (PvP)','Attack (PvP)'),()=>{
      if(window.ValadaresModernBridge?.attackCompanion?.(row.id)===true)dialog.close();
      else status.textContent=words('Aproxime-se fora da zona segura e confira os requisitos de PvP no chat.','Move closer outside the safe zone and check the PvP requirements in chat.');
    });
    details.attack.className='companion-attack';
    action(actions,words('Ver todos','View all'),openRoster);
    const close=document.createElement('button');close.type='button';close.textContent=words('Fechar','Close');close.addEventListener('click',()=>dialog.close());actions.append(close);
    if(!dialog.open)dialog.showModal();refreshDialog();
  }
  function reset(){actors.clear();receivedAt=0;selected=null;hasSaveError=false;if(dialog?.open)dialog.close();}
  window.ValadaresCompanions=Object.freeze({receive,getAll,open,openRoster,reset});
})();
