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
        '<div id="journeyReward"></div><div id="journeyGrowth"></div><div class="journey-actions"><button id="journeyAction" type="button"></button>' +
        '<button id="journeyRoutes" type="button"></button><button id="journeyExpedition" type="button"></button></div>' +
        '<details id="journeyPath"><summary></summary><div id="journeyPathSteps"></div></details><div id="journeyMore" hidden></div></div>';
    host.appendChild(section);
    const $ = id => section.querySelector('#' + id);
    const mobile = document.createElement('button');
    mobile.id = 'journeyMobile';
    mobile.type = 'button';
    mobile.hidden = true;
    mobile.setAttribute('aria-controls', 'journeyCard');
    document.body.appendChild(mobile);
    const progression = window.ValadaresProgression || {items:{}, recipes:{}, families:[], expedition:null};
    let currentName = '', open = true, extra = '', family = 'machado', familyChosen = false, lastExp = null;
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
        if (q?.id === 'q_cobras') {
            const skill = ITEMS[player.equipped?.weapon]?.skill || 'Punho';
            parts.push(`100 XP ${typeof skillDisp === 'function' ? skillDisp(skill) : skill}`);
        }
        for (const [k, amount] of Object.entries(r.item || r.items || {})) parts.push(`${amount}× ${itemName(k)}`);
        return parts.length ? say('Ao entregar: ','On turn-in: ') + parts.join(' · ') : '';
    }
    function nextQuest() {
        const list = typeof QUESTS !== 'undefined' ? QUESTS : [];
        const active = player.quests?.active || {};
        const q = list.find(item => Object.prototype.hasOwnProperty.call(active,item.id));
        return q || list.find(item => !(player.quests?.completed || []).includes(item.id)) || null;
    }
    function protectionGoal() {
        if (!(player.quests?.completed || []).includes('q_cobras')) return null;
        if(!player.equipped?.offhand && ITEMS[player.equipped?.weapon]?.hand!=='2h' && player.inv?.ESCUDO_MAD>0)return {item:'ESCUDO_MAD',action:'equip'};
        if(player.equipped?.armor)return null;
        const armor=Object.keys(player.inv || {}).find(k=>player.inv[k]>0 && ITEMS[k]?.kind==='armor');
        if(armor)return {item:armor,action:'equip'};
        const offer=typeof SHOP_BUY!=='undefined' && SHOP_BUY.find(o=>o.item==='COURO');
        return offer && player.gold>=offer.price ? {item:offer.item,price:offer.price,action:'shop'} : null;
    }
    function growthText() {
        const skill=ITEMS[player.equipped?.weapon]?.skill, state=player.skills?.[skill];
        if(!state)return '';
        return `${typeof skillDisp==='function'?skillDisp(skill):skill} ${state.val} · ${state.xp}/${state.xpNext} XP · `
            +say('sobe ao usar esta arma','improves as you use this weapon');
    }
    function renderPath() {
        const path=$('journeyPath');
        path.hidden=!(player.quests?.completed || []).includes('q_ratos');
        if(path.hidden)return;
        path.querySelector('summary').textContent=say('Próximas conquistas','Next achievements');
        const box=$('journeyPathSteps');box.replaceChildren();
        const add=(title,detail,complete=false)=>{const row=document.createElement('p');
            const name=document.createElement('strong');name.textContent=(complete?'✓ ':'')+title;row.appendChild(name);
            const text=document.createElement('span');text.textContent=detail;row.appendChild(text);box.appendChild(row);};
        const completed=player.quests?.completed || [];
        for(const id of ['q_cobras','q_seda','q_orcs','q_lider']){
            const q=typeof questById==='function'&&questById(id);if(!q)continue;
            const active=!!player.quests?.active?.[id];
            add(typeof qName==='function'?qName(q):q.name,completed.includes(id)?say('Concluída','Completed')
                :(active?`${questProgress(id)}/${q.goal.count} · `:'')+rewardText(q),completed.includes(id));
            if(id==='q_cobras'){
                const offer=typeof SHOP_BUY!=='undefined'&&SHOP_BUY.find(o=>o.item==='COURO');
                if(offer)add(say('Sua primeira proteção','Your first armor'),player.equipped?.armor?itemName(player.equipped.armor)
                    :`${itemName('COURO')} · ${offer.price}g · `+say('Mercador. A missão das sedas rende 200g.','Merchant. The silk quest pays 200g.'),!!player.equipped?.armor);
            }
        }
        const e=progression.expedition;
        if(e){const level=Math.max(0,...Object.values(player.skills||{}).map(s=>s.val||0));
            add(say('Depois: sua primeira expedição solo','Later: your first solo expedition'),
                `${say(e.name,e.nameEn)} · `+say(`perícia de combate recomendada ${e.recommendedLevel} (sua maior: ${level}), arma, proteção e suprimentos.`,`recommended combat skill ${e.recommendedLevel} (your highest: ${level}), weapon, armor and supplies.`));
            add(say('Uma conquista para buscar','An achievement to pursue'),say('Primeira vitória: ','First clear: ')+itemName(e.firstClearKey)+` + 3× ${itemName(e.rewardKey)}. `+say('Nas próximas: mais fragmentos para fabricar equipamentos.','Further clears award more fragments for crafting.'));
        }
        const note=document.createElement('p');note.className='journey-resume';note.textContent=say('Pode continuar em outra sessão: missões entregues, caçadas e equipamentos ficam salvos.','Continue another session: completed quests, hunts and equipment are saved.');box.appendChild(note);
    }
    function huntRoute(target,allowed) {
        if(typeof map==='undefined'||typeof walkable!=='function')return [];
        const threats=monsters.filter(m=>m.hp>0&&!allowed.includes(m.type));
        const blocked=new Set();
        for(const m of monsters)if(m.hp>0)blocked.add(m.x+','+m.y);
        const start={x:player.x,y:player.y,path:[]},queue=[start],seen=new Set([start.x+','+start.y]);
        for(let i=0;i<queue.length&&i<1800;i++){
            const p=queue[i];if(Math.max(Math.abs(p.x-target.x),Math.abs(p.y-target.y))<=1)return p.path;
            for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
                const x=p.x+dx,y=p.y+dy,key=x+','+y;
                if(seen.has(key)||Math.max(Math.abs(x-player.x),Math.abs(y-player.y))>26||!map[y]||map[y][x]===undefined||!walkable(map[y][x])||blocked.has(key))continue;
                if(typeof npcOnTile==='function'&&npcOnTile(x,y))continue;
                if(threats.some(m=>Math.max(Math.abs(m.x-x),Math.abs(m.y-y))<=6))continue;
                seen.add(key);queue.push({x,y,path:[...p.path,{x,y}]});
            }
        }
        return null;
    }
    let targetHint=null,targetHintAt=0,targetHintQuest='',targetHintPosition='';
    function huntTarget(q) {
        const type=q?.goal?.kind==='mob'?q.goal.type:q?.id==='q_seda'?'SPIDER':null;
        if(!type||typeof monsters==='undefined'||!Array.isArray(monsters))return null;
        const position=player.x+','+player.y;
        if(targetHintQuest===q.id&&targetHintPosition===position&&Date.now()-targetHintAt<1000)return targetHint;
        targetHintAt=Date.now();targetHintQuest=q.id;targetHintPosition=position;
        const allowed=q.id==='q_cobras'?['RAT','SNAKE']:q.id==='q_seda'?['RAT','SNAKE','SPIDER']:null;
        // Keep a living target stable as patrols move; a missing safe route becomes
        // a caution marker, never a sudden instruction to cross to the other side.
        const locked=monsters.find(m=>m.id===targetHint?.id&&m.type===type&&m.hp>0
            &&Math.max(Math.abs(m.x-player.x),Math.abs(m.y-player.y))<=22);
        if(locked){const trail=allowed?huntRoute(locked,allowed):[];
            targetHint={...locked,trail:trail||[],caution:trail===null};return targetHint;}
        const candidates=monsters.filter(m=>m.type===type&&m.hp>0&&Number.isFinite(m.x)&&Number.isFinite(m.y)
            &&Math.max(Math.abs(m.x-player.x),Math.abs(m.y-player.y))<=22
            &&(q.id!=='q_cobras'||Math.max(Math.abs(m.x-50),Math.abs(m.y-50))<=16)
            &&(!allowed||!monsters.some(other=>other.hp>0&&!allowed.includes(other.type)&&Math.max(Math.abs(other.x-m.x),Math.abs(other.y-m.y))<=5)));
        candidates.sort((a,b)=>Math.max(Math.abs(a.x-player.x),Math.abs(a.y-player.y))-Math.max(Math.abs(b.x-player.x),Math.abs(b.y-player.y)));
        const previous=candidates.findIndex(m=>m.id===targetHint?.id);if(previous>0)candidates.unshift(candidates.splice(previous,1)[0]);
        targetHint=null;
        for(const target of candidates.slice(0,6)){
            const trail=allowed?huntRoute(target,allowed):[];
            if(trail!==null){targetHint={...target,trail};break;}
        }
        return targetHint;
    }
    function getObjective() {
        if(!gameReady()||!online()||(player.floor||0)!==0||!(player.quests?.completed||[]).includes('q_ratos'))return null;
        if(player.hp/player.maxHp<.4 && typeof playerInSafeZone==='function'&&!playerInSafeZone())return{x:50,y:50,kind:'safe',label:say('Recupere-se na vila','Recover in the village')};
        const o=objective();
        if(o.action==='shop')return{x:47,y:47,kind:'npc',label:say('Mercador · sua proteção','Merchant · your armor')};
        const q=o.quest;if(!q)return null;
        if(!player.quests?.active?.[q.id]||questProgress(q.id)>=q.goal.count)return{x:47,y:53,kind:'npc',label:say('Atendente · próxima missão','Attendant · next quest')};
        const target=huntTarget(q);return target?{x:target.x,y:target.y,id:target.id,trail:target.trail,caution:target.caution,kind:'monster',label:(typeof mobName==='function'?mobName(target.type):target.type)+(target.caution?say(' · cuidado',' · caution'):'')}:null;
    }
    function objective() {
        if(player._automaton)return {title:say('Complexo dos Autômatos','Automaton Complex'),
            text:say('Explore os andares. Patrulhas são repostas; há um Guardião a cada cinco andares. Use as escadas para subir ou descer.','Explore the floors. Patrols replenish; a Warden awaits every five floors. Use the stairs to ascend or descend.'),
            progress:say('Andar ','Floor ')+(player._dungeonDepth||1),reward:'',label:say('Ver masmorras','View dungeons'),action:'dungeons'};
        const expedition = (lastExp?.expedition || player._expedition) === progression.robotExpedition?.id
            ? progression.robotExpedition : progression.expedition;
        if (pendingOpId) return {title:say('Fabricação em confirmação','Craft awaiting confirmation'),
            text:say('Aguarde a resposta antes de criar outra peça. Se demorar, consulte o resultado.','Wait for the result before crafting another piece. If it takes too long, check it.'),
            progress:pendingCraftKey ? itemName(pendingCraftKey) : '',reward:'',label:say('Consultar resultado','Check result'),action:'craftStatus'};
        if (lastExp?.pending) return {title:say('Recompensa aguardando','Reward awaiting pickup'),text:say('Seu prêmio está guardado. Abra espaço na mochila e resgate.','Your reward is safe. Make room in your bag and claim it.'),
            reward:Object.entries(lastExp.pending.reward || {}).map(([k,n])=>`${n}× ${itemName(k)}`).join(' · '), label:say('Resgatar','Claim'),action:'claim'};
        if (player._expedition === expedition?.id || lastExp?.stage === 'active') {
            const goals = expedition.objectives || {};
            const robots=expedition.id===progression.robotExpedition?.id;
            return {title:say(expedition.name,expedition.nameEn), text:robots
                ? say('Desative as sentinelas e os construtos, depois derrote o Guardião da Forja. A saída fica na escada da entrada.','Disable the sentries and constructs, then defeat the Forge Warden. Exit at the entrance stairs.')
                : say('Conclua os guardas, os demônios e o chefe. A saída fica na escada da entrada.','Defeat the guards, demons and boss. Exit at the entrance stairs.'),
                progress:`${say(robots?'Sentinelas':'Guardas',robots?'Sentries':'Guards')} ${lastExp?.guards||0}/${goals.guards||4} · ${say(robots?'Construtos':'Demônios',robots?'Constructs':'Demons')} ${lastExp?.golems||0}/${goals.golems||3} · ${say(robots?'Guardião':'Chefe',robots?'Warden':'Boss')} ${lastExp?.boss||0}/${goals.boss||1}`,
                reward:say('Ao concluir: ','On clear: ') + itemName(expedition.rewardKey) + (lastExp?.clears ? '' : ' + ' + itemName(expedition.firstClearKey)),
                label:say('Sair da expedição','Leave expedition'), action:'expeditionExit'};
        }
        const weapon = weaponInBag();
        if (weapon && !player.equipped?.weapon && (player.quests?.completed || []).includes('q_ratos')) return {
            title:say('Equipe sua primeira arma','Equip your first weapon'), text:say('Sua arma está no inventário. Equipe para aumentar seu ataque.','Your weapon is in your bag. Equip it to increase your attack.'),
            progress:itemName(weapon),reward:'',label:say('Equipar agora','Equip now'),action:'equip',item:weapon};
        const q = nextQuest();
        const readyQuest=q&&player.quests?.active?.[q.id]&&questProgress(q.id)>=q.goal.count;
        const protection=!readyQuest&&protectionGoal();
        if(protection)return {title:say('Prepare sua proteção','Prepare your armor'),item:protection.item,action:protection.action,
            text:protection.action==='equip'?say('Você já tem uma proteção na mochila. Equipe antes da próxima caçada.','You already have armor in your bag. Equip it before the next hunt.')
                :say('O Mercador vende uma túnica que reduz o dano recebido. Siga a marca dourada e escolha a compra na loja.','The Merchant sells a tunic that reduces incoming damage. Follow the golden marker and choose the purchase in the shop.'),
            progress:itemName(protection.item)+(protection.price?` · ${protection.price}g · ${direction(47,47)}`:''),reward:'',
            label:protection.action==='equip'?say('Equipar proteção','Equip armor'):say('Abrir loja do Mercador','Open Merchant shop')};
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
                    : active ? goal+'. '+(q.id==='q_cobras'?say('Procure cobras nos arredores da vila; enfrente uma de cada vez.','Look for snakes around the village; fight one at a time.')
                        :q.id==='q_seda'?say('Aranhas podem deixar seda; nem toda vitória dá material. Recupere-se na vila quando precisar.','Spiders can drop silk; not every kill gives material. Recover in the village when needed.')
                        :say('Use a marca dourada para localizar um alvo próximo.','Use the golden marker to locate a nearby target.'))
                    : goal+'. '+say('Aceite com a Atendente seguindo a marca dourada.','Accept at the Attendant by following the golden marker.'),
                progress:active ? `${n}/${count}` + (ready ? ' · ' + (npc ? say('Pode entregar agora','Ready to turn in') : direction(47,53)) : '') : loc(47,53) + ' · ' + direction(47,53),
                reward:rewardText(q), label:ready && npc ? say('Entregar missão','Turn in quest') : !active && npc && q.id !== 'q_ratos' ? say('Aceitar missão','Accept quest') : say('Ver missões','View quests'),
                action:ready && npc ? 'turnin' : !active && npc && q.id !== 'q_ratos' ? 'accept' : 'quests', quest:q};
        }
        const e=progression.expedition;
        return {title:say('Prepare sua expedição solo','Prepare your solo expedition'),
            text:say(`Sua próxima conquista pode ser ${e.name}. A recomendação é perícia de combate ${e.recommendedLevel}, arma, proteção e suprimentos. A entrada é livre.`,`Your next achievement can be ${e.nameEn}. Recommended: combat skill ${e.recommendedLevel}, weapon, armor and supplies. Entry is open.`),
            progress:growthText(),reward:say('Na primeira vitória: ','On first clear: ')+itemName(e.firstClearKey)+` + 3× ${itemName(e.rewardKey)}`,
            label:say('Ver preparação e entrada','View preparation and entrance'),action:'dungeons'};
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
            for (const e of [progression.expedition,progression.robotExpedition].filter(Boolean)) {
                const robots=e.id===progression.robotExpedition?.id;
                const title = document.createElement('strong'); title.textContent = english()?e.nameEn:e.name; box.appendChild(title);
                const p = document.createElement('p'); p.textContent = robots
                    ? say(`Entrada própria no Portal da Forja ${loc(e.npc.x,e.npc.y)}. Aproxime-se do arco de metal e escolha Entrar · Forja Esquecida. Na oficina abandonada: ${e.objectives.guards} sentinelas, ${e.objectives.golems} construtos e o Guardião da Forja. Prepare uma perícia de combate por volta de ${e.recommendedLevel}, arma e proteção adequadas, comida ou poções. Entrada livre.`,`Separate entrance at the Forge Portal ${loc(e.npc.x,e.npc.y)}. Approach the metal arch and choose Enter · Forgotten Forge. In the abandoned workshop: ${e.objectives.guards} sentries, ${e.objectives.golems} constructs and the Forge Warden. Prepare a combat skill around ${e.recommendedLevel}, suitable weapon and armor, food or potions. Entry is open.`)
                    : say(`Entrada com o Velho Ferreiro ${loc(e.npc.x,e.npc.y)}. Rota solo: ${e.objectives.guards} guardas, ${e.objectives.golems} demônios e o chefe. Prepare uma perícia de combate por volta de ${e.recommendedLevel}, arma e proteção adequadas, comida ou poções. Entrada livre.`,`Enter near the Old Blacksmith ${loc(e.npc.x,e.npc.y)}. Solo route: ${e.objectives.guards} guards, ${e.objectives.golems} demons and the boss. Prepare a combat skill around ${e.recommendedLevel}, suitable weapon and armor, food or potions. Entry is open.`); box.appendChild(p);
                const b = document.createElement('button'); b.type='button'; b.textContent = near(e.npc.x,e.npc.y) ? say('Entrar em ','Enter ') + (english()?e.nameEn:e.name) : (robots ? say('Rota até o Portal da Forja','Route to Forge Portal') : say('Rota até o Ferreiro','Route to Blacksmith')) + ' · ' + direction(e.npc.x,e.npc.y);
                b.disabled = !near(e.npc.x,e.npc.y) || !online(); b.addEventListener('click',()=> { if(send('expeditionEnter',{expedition:e.id})) { pendingAction='enter'; pendingAt=Date.now(); render(); } }); box.appendChild(b);
            }
            const e=progression.expedition;
            const reward = document.createElement('p'); reward.textContent = say('Prêmio compartilhado entre as duas rotas. Primeira conclusão: ','Shared reward across both routes. First clear: ') + itemName(e.firstClearKey) + ` + 3× ${itemName(e.rewardKey)}. ` + say('Repetições: ','Repeat clears: ') + `3× ${itemName(e.rewardKey)}.`; box.appendChild(reward);
            const dungeon=progression.automatonDungeon;
            if(dungeon){
                const title=document.createElement('strong');title.textContent=english()?dungeon.nameEn:dungeon.name;box.appendChild(title);
                const p=document.createElement('p');p.textContent=say(`Outra masmorra em ${loc(dungeon.npc.x,dungeon.npc.y)}: andares compartilhados, patrulhas com reposição e dificuldade crescente. Guardião a cada cinco andares. Entrada livre pelo portal e tecla G.`,`Another dungeon at ${loc(dungeon.npc.x,dungeon.npc.y)}: shared floors, replenishing patrols and increasing difficulty. Warden every five floors. Enter freely through the portal with G.`);box.appendChild(p);
                const button=document.createElement('button');button.type='button';button.textContent=near(dungeon.npc.x,dungeon.npc.y)?say('Entrar no Complexo','Enter the Complex'):say('Rota até o Complexo','Route to the Complex')+' · '+direction(dungeon.npc.x,dungeon.npc.y);
                button.disabled=!near(dungeon.npc.x,dungeon.npc.y)||!online();button.addEventListener('click',()=>send('automatonEnter'));box.appendChild(button);
            }
            return;
        }
        const select = document.createElement('select'); select.setAttribute('aria-label',say('Família de arma','Weapon family'));
        for (const f of progression.families) { const o=document.createElement('option'); o.value=f.id; o.textContent=english()?f.nameEn:f.name; select.appendChild(o); }
        select.value=family; select.addEventListener('change',()=> {family=select.value;familyChosen=true;renderMore();}); box.appendChild(select);
        const info = document.createElement('p'); info.textContent = say('Rotas garantidas mostram materiais e ouro. Peças ascendentes vêm da mesa de transmutação.','Guaranteed paths show materials and gold. Ascendant pieces come from the transmutation table.'); box.appendChild(info);
        if(family==='clava'){
            const early=document.createElement('p');early.textContent=say('Antes dos martelos avançados: lobos podem deixar Maça de Ferro ou Maça; orcs podem deixar Martelo 2H. São drops possíveis, não garantidos. Leve proteção e suprimentos.','Before advanced hammers: wolves can drop Iron Mace or Mace; orcs can drop Hammer 2H. These drops are possible, not guaranteed. Bring armor and supplies.');box.appendChild(early);
        }
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
        if (currentName!==player.name) { currentName=player.name;lastExp=null;extra='';pendingAction='';progressionToken=null;targetHint=null;targetHintAt=0;familyChosen=false;
            try{
                open=localStorage.getItem(key())!=='closed';
                const saved=JSON.parse(localStorage.getItem(key()+':craftOp')||'null');
                pendingOpId=typeof saved?.opId==='string'?saved.opId:'';
                pendingCraftKey=typeof saved?.key==='string'?saved.key:'';
            }catch{open=true;pendingOpId='';pendingCraftKey='';}
            if(online()){send('expeditionStatus');if(pendingOpId)send('progressionCraftStatus',{opId:pendingOpId});}
        }
        section.hidden=false; mobile.hidden=!compact;
        if(!familyChosen){const skill=ITEMS[player.equipped?.weapon]?.skill;
            family=skill==='Clava'?'clava':skill==='Espada'?'espada_escudo':skill==='Distância'?'distancia':'machado';}
        // O guia da primeira caçada é opcional. Quando aberto, a Jornada mostra
        // apenas a navegação para que os dois painéis não repitam o objetivo.
        const guideVisible=!document.getElementById('adventureGuidePanel')?.hidden || !document.getElementById('agMoment')?.hidden;
        const activeProgress=pendingOpId || lastExp?.pending || !!player._expedition || !!player._automaton || lastExp?.stage==='active';
        const navigationOnly=guideVisible && !(player.quests?.completed || []).includes('q_ratos') && !activeProgress;
        const o=navigationOnly ? {title:say('Explore no seu ritmo','Explore at your pace'),
            text:say('Escolha uma rota de armas ou conheça a expedição solo.','Choose a weapon path or explore the solo expedition.'),
            progress:'',reward:'',label:'',action:''} : objective();
        const signature=JSON.stringify([player.name,english(),open,extra,family,o,navigationOnly,lastExp,player.inv,player.gold,player.skills,player.equipped,player.quests?.completed,player.x,player.y,online(),pendingAction,progressionToken,pendingOpId,pendingCraftKey]);
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
        $('journeyGrowth').textContent=growthText();
        $('journeyGrowth').hidden=navigationOnly||!growthText();
        renderPath();
        const action=$('journeyAction');action.textContent=o.label;action.dataset.mode=o.action;action.hidden=navigationOnly;
        const exitTile=player._expeditionExit;
        const exitTooFar=o.action==='expeditionExit'&&lastExp?.stage!=='cleared'
            && !(exitTile && Math.max(Math.abs(player.x-exitTile.x),Math.abs(player.y-exitTile.y))<=1);
        action.disabled=!!pendingAction||exitTooFar||(o.action==='shop'&&!near(47,47))||(!online()&&o.action!=='quests');
        $('journeyRoutes').textContent=say('Rotas de armas','Weapon paths');
        $('journeyExpedition').textContent=say('Masmorras e expedições','Dungeons and expeditions');
        mobile.textContent=say('Jornada: ','Journey: ')+o.title;
        mobile.setAttribute('aria-expanded',String(document.body.classList.contains('journey-mobile-open')));
        renderMore();
    }
    $('journeyToggle').addEventListener('click',()=>{open=!open;try{localStorage.setItem(key(),open?'open':'closed');}catch{} lastSignature='';render();});
    $('journeyAction').addEventListener('click',()=>{
        const o=objective();
        if(o.action==='dungeons'){extra='expedition';lastSignature='';render();return;}
        if(o.action==='quests') { if(typeof openQuests==='function')openQuests(); return; }
        if(o.action==='equip') { if(typeof equip==='function'&&online())equip(o.item); return; }
        if(o.action==='shop') { if(typeof openShop==='function'&&near(47,47))openShop(); return; }
        if(o.action==='turnin') { if(typeof turnInQuest==='function'&&online()&&turnInQuest(o.quest.id)){pendingAction='turnin';pendingAt=Date.now();} }
        if(o.action==='accept') { if(typeof acceptQuest==='function'&&near(47,53)&&acceptQuest(o.quest.id)){if(typeof renderQuests==='function')renderQuests();} }
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
    function onDungeonEnter(msg){ if(msg?.expedition){player._expedition=msg.expedition;lastExp={...(lastExp||{}),stage:'active',expedition:msg.expedition};extra='';} else player._expedition=null;pendingAction='';lastSignature='';render(); }
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
            bad_expedition:['Rota de expedição desconhecida.','Unknown expedition route.'],
            claim_pending:['Resgate primeiro o prêmio anterior.','Claim your previous reward first.'],instance_full:['Instâncias ocupadas. Tente mais tarde.','Instances are full. Try later.'],
            spawn_failed:['Não foi possível abrir a expedição.','Could not open the expedition.'],not_in_expedition:['Você não está na expedição.','You are not in the expedition.'],
            not_at_exit:['Volte à escada de entrada para sair.','Return to the entrance stairs to leave.'],no_pending:['Não há prêmio aguardando resgate.','No reward is awaiting pickup.']
        };
        const row=messages[code];return row ? row[english()?1:0] : say('Operação não concluída.','Operation not completed.');
    }
    window.ValadaresJourneyUI={refresh:()=>{lastSignature='';render();},getObjective,result,onServerState,onCraftResult,onQuestResult,onDungeonEnter,onDungeonExit,onLogout,errorText};
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
