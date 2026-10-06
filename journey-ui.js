/* Jornada: lê o estado confirmado do jogo; ações enviam intenção ao servidor. */
(() => {
    'use strict';
    const host = document.getElementById('journeySidebar');
    if (!host) return;
    const section = document.createElement('section');
    section.id = 'journeyCard';
    section.className = 's-section';
    section.hidden = true;
    section.innerHTML = '<div class="journey-heading"><span id="journeyEyebrow"></span><button id="journeyToggle" type="button" aria-expanded="true"></button></div>' +
        '<div id="journeyContent"><strong id="journeyTitle"></strong><p id="journeyText"></p><div id="journeyProgress"></div>' +
        '<div id="journeyReward"></div><div class="journey-actions"><button id="journeyAction" type="button"></button>' +
        '<button id="journeyRoutes" type="button"></button><button id="journeyExpedition" type="button"></button></div>' +
        '<div id="journeyMore" hidden></div></div>';
    host.appendChild(section);
    const $ = id => section.querySelector('#' + id);
    const mobile = document.createElement('button');
    mobile.id = 'journeyMobile';
    mobile.type = 'button';
    mobile.hidden = true;
    mobile.setAttribute('aria-controls', 'journeyCard');
    document.body.appendChild(mobile);
    const progression = window.ValadaresProgression || {items:{}, recipes:{}, families:[], expedition:null};
    let currentName = '', open = true, extra = '', family = 'machado', lastExp = null;
    let pendingAction = '', pendingAt = 0, lastSignature = '', progressionToken = null, pendingOpId = '', pendingCraftKey = '';
    const english = () => typeof LANG !== 'undefined' && LANG === 'en';
    const say = (pt, en) => english() ? en : pt;
    const online = () => typeof _wsAuthed !== 'undefined' && _wsAuthed && typeof ws !== 'undefined' && ws?.readyState === 1;
    const gameReady = () => document.body.classList.contains('game-active') && typeof player !== 'undefined' && !!player.name;
    const key = () => 'valadares:journey:' + encodeURIComponent(currentName);
    const near = (x,y) => (player.floor || 0) === 0 && Number.isFinite(player.x) && Number.isFinite(player.y)
        && Math.max(Math.abs(player.x-x),Math.abs(player.y-y)) <= 1;
    const loc = (x,y) => `(${x}, ${y})`;
    const direction = (x,y) => {
        if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) return '';
        const d = [];
        if (Math.abs(player.x-x)>1) d.push(player.x>x ? say('oeste ←','west ←') : say('leste →','east →'));
        if (Math.abs(player.y-y)>1) d.push(player.y>y ? say('norte ↑','north ↑') : say('sul ↓','south ↓'));
        return d.join(' · ');
    };
    const itemName = k => typeof itmName === 'function' ? itmName(k) : k;
    const isEquip = k => !!ITEMS[k] && ['weapon','wand','armor','head','feet','offhand','neck'].includes(ITEMS[k].kind);
    const weaponInBag = () => Object.keys(player.inv || {}).find(k => player.inv[k] > 0 && ['weapon','wand'].includes(ITEMS[k]?.kind));
    function send(t, rest={}) {
        if (!online()) return false;
        try { ws.send(JSON.stringify({t,...rest})); return true; } catch { return false; }
    }
    function rewardText(q) {
        const r = q?.reward || {};
        const parts = [];
        if (r.gold) parts.push(r.gold + 'g');
        for (const [skill, amount] of Object.entries(r.xp || {})) parts.push(`${amount} XP ${typeof skillDisp === 'function' ? skillDisp(skill) : skill}`);
        for (const [k, amount] of Object.entries(r.item || r.items || {})) parts.push(`${amount}× ${itemName(k)}`);
        return parts.length ? say('Ao entregar: ','On turn-in: ') + parts.join(' · ') : '';
    }
    function nextQuest() {
        const list = typeof QUESTS !== 'undefined' ? QUESTS : [];
        const active = player.quests?.active || {};
        const q = list.find(item => Object.prototype.hasOwnProperty.call(active,item.id));
        return q || list.find(item => !(player.quests?.completed || []).includes(item.id)) || null;
    }
    function objective() {
        const expedition = progression.expedition;
        if (pendingOpId) return {title:say('Fabricação em confirmação','Craft awaiting confirmation'),
            text:say('Aguarde a resposta antes de criar outra peça. Se demorar, consulte o resultado.','Wait for the result before crafting another piece. If it takes too long, check it.'),
            progress:pendingCraftKey ? itemName(pendingCraftKey) : '',reward:'',label:say('Consultar resultado','Check result'),action:'craftStatus'};
        if (lastExp?.pending) return {title:say('Recompensa aguardando','Reward awaiting pickup'),text:say('Seu prêmio está guardado. Abra espaço na mochila e resgate.','Your reward is safe. Make room in your bag and claim it.'),
            reward:Object.entries(lastExp.pending.reward || {}).map(([k,n])=>`${n}× ${itemName(k)}`).join(' · '), label:say('Resgatar','Claim'),action:'claim'};
        if (player._expedition === expedition?.id || lastExp?.stage === 'active') {
            const goals = expedition.objectives || {};
            return {title:say(expedition.name,expedition.nameEn), text:say('Conclua os guardas, os golems e o chefe. A saída fica na escada da entrada.','Defeat the guards, golems and boss. Exit at the entrance stairs.'),
                progress:`${say('Guardas','Guards')} ${lastExp?.guards||0}/${goals.guards||4} · ${say('Golems','Golems')} ${lastExp?.golems||0}/${goals.golems||3} · ${say('Chefe','Boss')} ${lastExp?.boss||0}/${goals.boss||1}`,
                reward:say('Ao concluir: ','On clear: ') + itemName(expedition.rewardKey) + (lastExp?.clears ? '' : ' + ' + itemName(expedition.firstClearKey)),
                label:say('Sair da expedição','Leave expedition'), action:'expeditionExit'};
        }
        const weapon = weaponInBag();
        if (weapon && !player.equipped?.weapon && (player.quests?.completed || []).includes('q_ratos')) return {
            title:say('Equipe sua primeira arma','Equip your first weapon'), text:say('Sua arma está no inventário. Equipe para aumentar seu ataque.','Your weapon is in your bag. Equip it to increase your attack.'),
            progress:itemName(weapon),reward:'',label:say('Equipar agora','Equip now'),action:'equip',item:weapon};
        const q = nextQuest();
        if (q) {
            const active = !!player.quests?.active?.[q.id];
            const count = q.goal?.count || 1;
            const n = active && typeof questProgress === 'function' ? questProgress(q.id) : 0;
            const ready = active && n >= count;
            const npc = near(47,53);
            const goalName = q.goal?.kind === 'item' ? itemName(q.goal.type) : (typeof mobName === 'function' ? mobName(q.goal?.type) : q.goal?.type);
            const goal = (q.goal?.kind === 'item' ? say('Colete','Collect') : say('Derrote','Defeat')) + ` ${count}× ${goalName}`;
            return {title:typeof qName === 'function' ? qName(q) : q.name,
                text:ready ? say('Objetivo cumprido. Entregue à Atendente.','Objective complete. Turn it in to the Attendant.')
                    : active ? goal : say('Fale com a Atendente para iniciar esta missão.','Talk to the Attendant to start this quest.'),
                progress:active ? `${n}/${count}` + (ready ? ' · ' + (npc ? say('Pode entregar agora','Ready to turn in') : direction(47,53)) : '') : loc(47,53) + ' · ' + direction(47,53),
                reward:rewardText(q), label:ready && npc ? say('Entregar missão','Turn in quest') : !active && npc && q.id !== 'q_ratos' ? say('Aceitar missão','Accept quest') : say('Ver missões','View quests'),
                action:ready && npc ? 'turnin' : !active && npc && q.id !== 'q_ratos' ? 'accept' : 'quests', quest:q};
        }
        return {title:say('Escolha uma nova rota','Choose a new path'),text:say('Veja missões, receitas ou uma expedição solo.','Explore quests, recipes or a solo expedition.'),reward:'',label:say('Ver missões','View quests'),action:'quests'};
    }
    function routeData() {
        const f = progression.families.find(row => row.id === family) || progression.families[0];
        if (!f) return {title:'',rows:[]};
        const rows = Object.entries(progression.items).filter(([k,v]) => v.family === f.id && v.kind !== 'mat')
            .sort((a,b) => (a[1].tier||0) - (b[1].tier||0));
        return {title:english()?f.nameEn:f.name,rows};
    }
    function renderMore() {
        const box = $('journeyMore');
        box.replaceChildren();
        box.hidden = !extra;
        if (!extra) return;
        if (extra === 'expedition') {
            const e = progression.expedition;
            if (!e) return;
            const title = document.createElement('strong'); title.textContent = english()?e.nameEn:e.name; box.appendChild(title);
            const p = document.createElement('p'); p.textContent = say(`Entrada com o Velho Ferreiro ${loc(e.npc.x,e.npc.y)}. Rota solo: ${e.objectives.guards} guardas, ${e.objectives.golems} golems e o chefe. Faixa sugerida: ${e.recommendedLevel}.`,`Enter near the Old Blacksmith ${loc(e.npc.x,e.npc.y)}. Solo route: ${e.objectives.guards} guards, ${e.objectives.golems} golems and the boss. Suggested level: ${e.recommendedLevel}.`); box.appendChild(p);
            const reward = document.createElement('p'); reward.textContent = say('Primeira conclusão: ','First clear: ') + itemName(e.firstClearKey) + ` + 3× ${itemName(e.rewardKey)}. ` + say('Repetições: ','Repeat clears: ') + `3× ${itemName(e.rewardKey)}.`; box.appendChild(reward);
            const b = document.createElement('button'); b.type='button'; b.textContent = near(e.npc.x,e.npc.y) ? say('Entrar na expedição','Enter expedition') : say('Rota até o Ferreiro','Route to Blacksmith') + ' · ' + direction(e.npc.x,e.npc.y);
            b.disabled = !near(e.npc.x,e.npc.y) || !online(); b.addEventListener('click',()=> { if(send('expeditionEnter')) { pendingAction='enter'; pendingAt=Date.now(); render(); } }); box.appendChild(b);
            return;
        }
        const select = document.createElement('select'); select.setAttribute('aria-label',say('Família de arma','Weapon family'));
        for (const f of progression.families) { const o=document.createElement('option'); o.value=f.id; o.textContent=english()?f.nameEn:f.name; select.appendChild(o); }
        select.value=family; select.addEventListener('change',()=> {family=select.value;renderMore();}); box.appendChild(select);
        const info = document.createElement('p'); info.textContent = say('Rotas garantidas mostram materiais e ouro. Peças ascendentes vêm da mesa de transmutação.','Guaranteed paths show materials and gold. Ascendant pieces come from the transmutation table.'); box.appendChild(info);
        for (const [k,v] of routeData().rows) {
            const row = document.createElement('div'); row.className='journey-route';
            const name = document.createElement('strong'); name.textContent = itemName(k) + ` · T${v.tier}`; row.appendChild(name);
            const recipe = progression.recipes[k];
            if (recipe) {
                const p = document.createElement('span'); p.textContent = Object.entries(recipe.in).map(([key,n])=>`${Math.min(player.inv?.[key]||0,n)}/${n} ${itemName(key)}`).join(' · ') + ` · ${Math.min(player.gold||0,recipe.gold)}/${recipe.gold}g`; row.appendChild(p);
                const btn=document.createElement('button'); btn.type='button'; btn.textContent=say('Criar na bancada','Craft at workbench');
                btn.disabled=!near(51,52)||!online()||!progressionToken||!!pendingOpId||player.gold<recipe.gold||Object.entries(recipe.in).some(([key,n])=>(player.inv?.[key]||0)<n);
                btn.addEventListener('click',()=>{
                    if (!progressionToken || pendingOpId) return;
                    const opId=progressionToken;
                    // O recibo nasce antes do despacho. Falha de storage impede envio.
                    try{localStorage.setItem(key()+':craftOp',JSON.stringify({opId,key:k}));}
                    catch{ return; }
                    pendingOpId=opId;pendingCraftKey=k;progressionToken=null;pendingAction='craft';pendingAt=Date.now();
                    send('progressionCraft',{key:k,opId});
                    lastSignature='';render();
                }); row.appendChild(btn);
            } else { const p=document.createElement('span'); p.textContent=say('Ascendente · Mesa de Transmutação','Ascendant · Transmutation Table'); row.appendChild(p); }
            if (v.family === 'lanca' && v.meleeRange === 3) {
                const reach=document.createElement('span');
                reach.textContent=say('Combate a 3 passos; não é consumida ao atacar.','Fight from 3 steps away; this spear is not consumed when attacking.');
                row.appendChild(reach);
            }
            box.appendChild(row);
        }
    }
    function render() {
        const compact = document.body.classList.contains('touch') || document.body.classList.contains('layout-focus') || window.innerWidth < 1200;
        const floating = compact && document.body.classList.contains('journey-mobile-open');
        if (floating && section.parentNode!==document.body) document.body.appendChild(section);
        if (!floating && section.parentNode!==host) host.appendChild(section);
        host.hidden = !gameReady() || compact;
        if (!gameReady()) { section.hidden=true;mobile.hidden=true;return; }
        if (currentName!==player.name) { currentName=player.name;lastExp=null;extra='';pendingAction='';progressionToken=null;
            try{
                open=localStorage.getItem(key())!=='closed';
                const saved=JSON.parse(localStorage.getItem(key()+':craftOp')||'null');
                pendingOpId=typeof saved?.opId==='string'?saved.opId:'';
                pendingCraftKey=typeof saved?.key==='string'?saved.key:'';
            }catch{open=true;pendingOpId='';pendingCraftKey='';}
            if(online()){send('expeditionStatus');if(pendingOpId)send('progressionCraftStatus',{opId:pendingOpId});}
        }
        section.hidden=false; mobile.hidden=!compact;
        // O guia da primeira caçada é opcional. Quando aberto, a Jornada mostra
        // apenas a navegação para que os dois painéis não repitam o objetivo.
        const guideVisible=!document.getElementById('adventureGuidePanel')?.hidden || !document.getElementById('agMoment')?.hidden;
        const activeProgress=pendingOpId || lastExp?.pending || player._expedition===progression.expedition?.id || lastExp?.stage==='active';
        const navigationOnly=guideVisible && !(player.quests?.completed || []).includes('q_ratos') && !activeProgress;
        const o=navigationOnly ? {title:say('Explore no seu ritmo','Explore at your pace'),
            text:say('Escolha uma rota de armas ou conheça a expedição solo.','Choose a weapon path or explore the solo expedition.'),
            progress:'',reward:'',label:'',action:''} : objective();
        const signature=JSON.stringify([player.name,english(),open,extra,family,o,navigationOnly,lastExp,player.inv,player.gold,player.x,player.y,online(),pendingAction,progressionToken,pendingOpId,pendingCraftKey]);
        if (signature===lastSignature) return;
        lastSignature=signature;
        $('journeyEyebrow').textContent=say('SUGESTÃO DE AVENTURA','ADVENTURE SUGGESTION');
        $('journeyToggle').textContent=open?'−':'+';
        $('journeyToggle').setAttribute('aria-label',open?say('Recolher objetivo','Collapse objective'):say('Abrir objetivo','Expand objective'));
        $('journeyToggle').setAttribute('aria-expanded',String(open));
        $('journeyContent').hidden=!open;
        $('journeyTitle').textContent=o.title;
        $('journeyText').textContent=o.text;
        $('journeyProgress').textContent=o.progress||'';
        $('journeyReward').textContent=o.reward||'';
        $('journeyReward').hidden=!o.reward;
        const action=$('journeyAction');action.textContent=o.label;action.dataset.mode=o.action;action.hidden=navigationOnly;
        const exitTile=player._expeditionExit;
        const exitTooFar=o.action==='expeditionExit'&&lastExp?.stage!=='cleared'
            && !(exitTile && Math.max(Math.abs(player.x-exitTile.x),Math.abs(player.y-exitTile.y))<=1);
        action.disabled=!!pendingAction||exitTooFar||(!online()&&o.action!=='quests');
        $('journeyRoutes').textContent=say('Rotas de armas','Weapon paths');
        $('journeyExpedition').textContent=say('Expedição solo','Solo expedition');
        mobile.textContent=say('Jornada: ','Journey: ')+o.title;
        mobile.setAttribute('aria-expanded',String(document.body.classList.contains('journey-mobile-open')));
        renderMore();
    }
    $('journeyToggle').addEventListener('click',()=>{open=!open;try{localStorage.setItem(key(),open?'open':'closed');}catch{} lastSignature='';render();});
    $('journeyAction').addEventListener('click',()=>{
        const o=objective();
        if(o.action==='quests') { if(typeof openQuests==='function')openQuests(); return; }
        if(o.action==='equip') { if(typeof equip==='function'&&online())equip(o.item); return; }
        if(o.action==='turnin') { if(typeof turnInQuest==='function'&&online()&&turnInQuest(o.quest.id)){pendingAction='turnin';pendingAt=Date.now();} }
        if(o.action==='accept') { if(typeof acceptQuest==='function'&&near(47,53)&&acceptQuest(o.quest.id)){if(typeof saveState==='function')saveState(); if(typeof renderQuests==='function')renderQuests();} }
        if(o.action==='claim'&&send('progressionClaim')) {pendingAction='claim';pendingAt=Date.now();}
        if(o.action==='craftStatus'&&pendingOpId&&send('progressionCraftStatus',{opId:pendingOpId})) {pendingAction='status';pendingAt=Date.now();}
        if(o.action==='expeditionExit'&&send('expeditionExit')) {pendingAction='exit';pendingAt=Date.now();}
        lastSignature='';render();
    });
    $('journeyRoutes').addEventListener('click',()=>{extra=extra==='routes'?'':'routes';lastSignature='';render();});
    $('journeyExpedition').addEventListener('click',()=>{extra=extra==='expedition'?'':'expedition';lastSignature='';render();});
    mobile.addEventListener('click',()=>{document.body.classList.toggle('journey-mobile-open');open=true;lastSignature='';render();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('journey-mobile-open')){document.body.classList.remove('journey-mobile-open');lastSignature='';render();}});
    function result(msg){ if(!msg)return; lastExp={...(lastExp||{}),...msg};pendingAction='';lastSignature='';render(); }
    function onServerState(msg){
        if(typeof msg?.progressionToken==='string'&&msg.progressionToken) progressionToken=msg.progressionToken;
        if ('expeditionPending' in (msg||{})) lastExp={...(lastExp||{}),pending:msg.expeditionPending||null};
        lastSignature=''; render();
    }
    function onCraftResult(msg){
        if (!pendingOpId || msg?.opId!==pendingOpId) return false;
        pendingAction=''; pendingOpId=''; pendingCraftKey='';
        try{localStorage.removeItem(key()+':craftOp');}catch{}
        lastSignature='';render();return true;
    }
    function onQuestResult(){
        if(pendingAction==='turnin'){pendingAction='';lastSignature='';render();}
    }
    function onDungeonEnter(msg){ if(msg?.expedition){player._expedition=msg.expedition;lastExp={...(lastExp||{}),stage:'active'};extra='';} else player._expedition=null;pendingAction='';lastSignature='';render(); }
    function onDungeonExit(){player._expedition=null; if(lastExp?.stage==='active')lastExp.stage='ready';pendingAction='';lastSignature='';render();}
    function onLogout(){currentName='';lastExp=null;pendingAction='';progressionToken=null;pendingOpId='';pendingCraftKey='';lastSignature='';document.body.classList.remove('journey-mobile-open');render();}
    function errorText(code){
        const messages={
            bad_op_id:['Identidade de fabricação inválida.','Invalid craft ID.'],op_conflict:['Esta operação já foi usada em outra receita.','This operation was used for another recipe.'],
            stale_op:['Receita desatualizada. Consulte os materiais e tente novamente.','Recipe expired. Check materials and try again.'],disabled:['Este recurso está indisponível.','This feature is unavailable.'],
            bad_recipe:['Receita desconhecida.','Unknown recipe.'],not_at_bench:['Aproxime-se da bancada em (51, 52).','Move next to the workbench at (51, 52).'],
            no_materials:['Faltam materiais.','Missing materials.'],no_gold:['Falta ouro.','Not enough gold.'],inventory_full:['Mochila cheia. Libere espaço.','Bag full. Make room.'],
            save_failed:['Não foi possível salvar. Tente mais tarde.','Could not save. Try later.'],not_found:['O servidor não encontrou esta operação. Você pode tentar de novo.','The server did not find this operation. You may try again.'],
            unavailable:['Expedição indisponível neste momento.','Expedition unavailable right now.'],not_at_blacksmith:['Aproxime-se do Velho Ferreiro em (78, 22).','Move next to the Old Blacksmith at (78, 22).'],
            claim_pending:['Resgate primeiro o prêmio anterior.','Claim your previous reward first.'],instance_full:['Instâncias ocupadas. Tente mais tarde.','Instances are full. Try later.'],
            spawn_failed:['Não foi possível abrir a expedição.','Could not open the expedition.'],not_in_expedition:['Você não está na expedição.','You are not in the expedition.'],
            not_at_exit:['Volte à escada de entrada para sair.','Return to the entrance stairs to leave.'],no_pending:['Não há prêmio aguardando resgate.','No reward is awaiting pickup.']
        };
        const row=messages[code];return row ? row[english()?1:0] : say('Operação não concluída.','Operation not completed.');
    }
    window.ValadaresJourneyUI={refresh:()=>{lastSignature='';render();},result,onServerState,onCraftResult,onQuestResult,onDungeonEnter,onDungeonExit,onLogout,errorText};
    window.addEventListener('resize',render);
    setInterval(()=>{
        if(pendingAction&&Date.now()-pendingAt>6000){
            if((pendingAction==='craft'||pendingAction==='status')&&pendingOpId)send('progressionCraftStatus',{opId:pendingOpId});
            pendingAction='';lastSignature='';
        }
        render();
    },700);
    render();
})();
