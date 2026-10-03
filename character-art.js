// Personagem 2D do Valadares. Arte vetorial em pixels inteiros, 48 x 48.
// O chamador mantém sombra, capa, armas, efeitos e indicadores de jogo.
(function(){
    'use strict';
    const C = {
        ink:'#17120f', edge:'#29201b', skin:'#e8b985', skinLight:'#ffd4a0',
        skinShade:'#b8754e', hair:'#51301f', hairLight:'#85502f', hairShade:'#2c1b16',
        olive:'#636b49', oliveLight:'#89906b', oliveShade:'#394431',
        leather:'#794729', leatherLight:'#a26a3c', leatherShade:'#4d2d20',
        steel:'#aeb5bd', steelLight:'#e0e5e8', steelShade:'#68747f',
        cloth:'#30343d', clothLight:'#4d505a', gold:'#d2a049', goldLight:'#f1d27d'
    };
    function shade(hex, amount){
        if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
        const n = parseInt(hex.slice(1), 16);
        const ch = s => Math.max(0, Math.min(255, s + amount));
        return '#' + [ch(n>>16), ch((n>>8)&255), ch(n&255)].map(v => v.toString(16).padStart(2,'0')).join('');
    }
    function drawBody(ctx, px, py, dir, opts){
        if (!ctx || !opts) return false;
        const x = Math.round(px), y = Math.round(py);
        const R = (a,b,w,h,color) => { ctx.fillStyle=color; ctx.fillRect(x+a,y+b,w,h); };
        const metal = opts.armor === 'ARMADURA' || opts.armor === 'ARMADURA_TRONO' || opts.armor === 'ARMADURA_ESCAMA';
        const bone = opts.armor === 'ARMADURA_OSSO';
        const leather = opts.armor === 'COURO';
        const facingBack = dir === 'up';
        const side = dir === 'left' || dir === 'right';
        const flipped = dir === 'left';
        const walk = Math.max(-1, Math.min(1, opts.walkPhase || 0));
        const step = Math.abs(walk) > .18 ? (walk > 0 ? 2 : -2) : 0;
        const attack = Math.max(0, Math.min(1, opts.attackPhase || 0));
        const armLift = Math.round(attack * 3);
        const plate = opts.armorTint || C.steel;
        const plateLight = opts.armorTint ? shade(plate, 44) : C.steelLight;
        const plateDark = opts.armorTint ? shade(plate, -46) : C.steelShade;
        const hide = opts.armorTint || C.leather;
        const hideLight = opts.armorTint ? shade(hide, 40) : C.leatherLight;
        const hideDark = opts.armorTint ? shade(hide, -38) : C.leatherShade;
        const torso = metal ? plate : leather ? hide : bone ? (opts.armorTint || '#b6a898') :
            (opts.armorTint || (opts.bodyColor && !['#3a3a3a','#1a1a1a'].includes(opts.bodyColor) ? opts.bodyColor : C.olive));
        const torsoLight = metal ? plateLight : leather ? hideLight : bone ? shade(torso, 34) : shade(torso, 32);
        const torsoDark = metal ? plateDark : leather ? hideDark : bone ? shade(torso, -38) : shade(torso, -35);
        const boots = opts.feetColor && opts.hasFeet ? opts.feetColor : C.leather;
        const bootLight = shade(boots, 34), bootDark = shade(boots, -33);
        const pants = C.cloth;

        ctx.save();
        // Laterais espelhadas apenas na pose de perfil; as coordenadas seguem 48x48.
        if (flipped){ ctx.translate(x+48, 0); ctx.scale(-1, 1); }
        const P = (a,b,w,h,color) => {
            const xx = side ? Math.round(24 + (a-24)*.78) : a;
            const ww = side ? Math.max(1,Math.round(24 + (a+w-24)*.78)-xx) : w;
            if (flipped){ ctx.fillStyle=color; ctx.fillRect(xx,y+b,ww,h); }
            else R(xx,b,ww,h,color);
        };

        // Pernas separadas e alternância curta, sem deslocar o ponto dos pés.
        const leftLeg = side ? 17 : 15;
        const rightLeg = side ? 24 : 27;
        const legA = step > 0 ? -1 : step < 0 ? 1 : 0;
        const legB = -legA;
        P(leftLeg-1,34+legA,9,11,C.ink); P(leftLeg,35+legA,7,9,pants);
        P(leftLeg+1,35+legA,2,7,C.clothLight);
        P(rightLeg-1,34+legB,9,11,C.ink); P(rightLeg,35+legB,7,9,pants);
        P(rightLeg+1,35+legB,2,7,C.clothLight);
        // Joelho, canela e bota de couro com sola escura.
        for (const [lx,dy] of [[leftLeg,legA],[rightLeg,legB]]){
            if (metal){ P(lx,36+dy,7,4,plateDark); P(lx+1,36+dy,5,2,plateLight); }
            P(lx-1,39+dy,9,7,C.ink);
            P(lx,40+dy,7,5,bootDark);
            P(lx+1,40+dy,5,2,boots);
            P(lx,44+dy,8,2,boots);
            P(lx-2,46+dy,11,2,C.ink);
            P(lx-1,45+dy,8,1,bootLight);
        }
        if (opts.feet === 'BOTAS_VENTO'){
            P(leftLeg,43+legA,7,1,'#a7e6ff'); P(rightLeg,43+legB,7,1,'#a7e6ff');
        }

        // Braços atrás do tronco: mangas, braceletes, mãos. Golpe eleva só o braço direito.
        P(9,20,8,14,C.ink); P(10,21,6,8,torsoDark); P(10,27,6,6,C.leatherShade);
        P(10,32,6,6,C.ink); P(11,32,4,5,C.skinShade); P(11,33,3,3,C.skin);
        P(31,20-armLift,8,14,C.ink); P(32,21-armLift,6,8,torsoDark);
        P(32,27-armLift,6,6,C.leatherShade);
        P(32,32-armLift,6,6,C.ink); P(33,32-armLift,4,5,C.skinShade);
        P(33,33-armLift,3,3,C.skinLight);
        if (metal){
            P(9,21,7,5,plateDark); P(10,21,5,2,plateLight);
            P(32,21-armLift,7,5,plateDark); P(33,21-armLift,5,2,plateLight);
            P(10,29,6,4,plateDark); P(11,29,4,1,plateLight);
            P(32,29-armLift,6,4,plateDark); P(33,29-armLift,4,1,plateLight);
        } else if (leather){
            P(10,21,6,4,hide); P(11,21,3,1,hideLight);
            P(32,21-armLift,6,4,hide); P(33,21-armLift,3,1,hideLight);
            P(11,29,4,1,hideLight); P(33,29-armLift,4,1,hideLight);
        } else {
            P(10,29,6,2,C.skin); P(32,29-armLift,6,2,C.skin);
        }

        // Gola, camisa/peitoral e cintura mantêm a leitura mesmo em escala 1:1.
        P(14,18,20,19,C.ink);
        P(15,20,18,15,torsoDark);
        P(16,20,16,13,torso);
        P(17,21,4,10,torsoLight);
        P(15,19,5,4,torsoDark); P(28,19,5,4,torsoDark);
        if (metal){
            // Placas arredondadas por degraus, rebite e faixa central.
            P(16,21,16,2,plateLight); P(17,23,14,8,plate);
            P(18,24,2,7,plateLight); P(29,24,2,7,plateDark);
            P(22,22,4,11,plateDark); P(23,22,2,9,plateLight);
            P(15,22,2,4,plateDark); P(31,22,2,4,plateDark);
            P(17,30,14,2,plateDark);
            P(18,21,2,2,C.gold); P(28,21,2,2,C.gold);
            if (opts.armor === 'ARMADURA_ESCAMA'){
                for (let row=0;row<3;row++) for(let col=0;col<4;col++) P(17+col*4+(row%2)*2,24+row*3,2,1,'#718f66');
            }
            if (opts.armor === 'ARMADURA_TRONO'){
                P(22,24,4,8,C.gold); P(19,27,10,3,C.goldLight);
                P(23,27,2,2,'#bd3034');
            }
        } else if (leather){
            // Painéis do gibão e costuras claras da prancha.
            P(16,21,5,12,hideDark); P(20,22,11,10,hide);
            P(21,21,2,12,hideLight); P(29,22,2,11,hideDark);
            for(let yy=24;yy<=30;yy+=3){P(17,yy,1,1,hideLight);P(30,yy,1,1,hideLight);}
            P(19,22,2,2,C.gold); P(27,29,2,2,C.gold);
        } else if (bone){
            P(17,22,14,2,'#e5dac4'); P(18,26,12,2,'#d6c9af');
            P(19,30,10,2,'#c7b89c'); P(23,23,2,7,'#985f70');
        } else {
            P(18,20,12,3,torsoLight);
            if (!facingBack){P(22,22,4,4,C.skinShade);P(23,22,2,3,C.skin);}
            P(16,28,2,5,torsoDark);
            P(31,25,1,7,torsoDark);
        }
        // Cinto com fivela e duas abas da túnica.
        P(15,32,18,4,C.ink); P(16,33,16,2,C.leatherShade);
        if (!facingBack){P(21,32,6,4,C.gold);P(22,33,4,2,C.ink);P(23,33,2,1,C.goldLight);}
        P(15,36,7,2,torsoDark); P(26,36,7,2,torsoDark);

        // Pescoço e cabeça, 16 px aproximados; cabelo em mechas pixeladas.
        P(21,17,6,5,C.ink); P(22,17,4,4,C.skinShade);
        if (side){
            P(16,4,16,15,C.ink); P(17,5,14,13,C.skinShade);
            P(19,7,13,9,C.skin); P(26,8,5,5,C.skinLight);
            P(30,11,3,3,C.skinShade); P(31,12,2,1,C.skin);
            if (!facingBack){P(27,11,2,3,C.ink); P(28,12,1,2,'#3d2920');}
            P(24,16,4,1,C.skinShade);
            P(15,3,13,5,C.ink); P(17,2,9,3,C.hairShade);
            P(18,3,12,5,C.hair); P(17,5,5,5,C.hairShade);
            P(20,3,5,2,C.hairLight); P(23,5,4,2,C.hairLight);
            P(27,6,3,4,C.hair); P(18,8,4,3,C.hair);
        } else {
            P(16,4,16,15,C.ink); P(17,5,14,13,facingBack ? C.hairShade : C.skinShade);
            if (facingBack){
                P(18,4,12,14,C.hair); P(19,5,10,6,C.hairLight);
                P(17,9,4,7,C.hairShade); P(27,9,4,7,C.hairShade);
                P(20,12,3,4,C.hairLight); P(25,11,3,5,C.hairLight);
                P(18,17,12,2,C.hairShade);
            } else {
                P(18,7,12,10,C.skin); P(19,8,4,8,C.skinLight);
                P(16,10,3,5,C.skinShade); P(29,10,3,5,C.skinShade);
                P(19,11,2,3,C.ink); P(27,11,2,3,C.ink);
                P(20,11,1,1,'#faf0df'); P(28,11,1,1,'#faf0df');
                P(22,15,4,1,C.skinShade); P(23,16,2,1,C.leatherShade);
                P(15,5,5,7,C.hairShade); P(28,5,5,7,C.hairShade);
                P(17,3,15,5,C.ink); P(18,2,12,5,C.hair);
                P(19,3,6,2,C.hairLight); P(25,4,5,2,C.hairLight);
                P(17,6,12,3,C.hair); P(19,7,5,3,C.hairShade);
                P(24,7,4,2,C.hairLight); P(29,8,3,3,C.hair);
            }
        }

        // Elmo ou coroa equipada; o visor preserva os olhos.
        if (opts.head){
            const hc = opts.headColor || C.steel;
            if (opts.head === 'COROA_VALADARES' || opts.head === 'COROA_VENDEDOR'){
                const royal = opts.head === 'COROA_VALADARES';
                P(13,4,22,4,C.ink); P(14,4,20,3,hc); P(14,4,20,1,shade(hc,40));
                const gems = royal ? ['#40b0ff','#ff4040','#80ff80','#ff4040','#40b0ff'] : ['#8030c0','#a14ac9','#ff3030','#a14ac9','#8030c0'];
                [[14,4],[18,6],[22,9],[26,6],[30,4]].forEach(([xx,hh],i)=>{
                    P(xx,4-hh,3,hh,C.ink); P(xx+1,5-hh,2,hh-1,hc);
                    P(xx+1,6-hh,1,2,gems[i]);
                });
                if (royal){P(17,5,1,1,'#ff60ff');P(23,5,2,1,'#ff60ff');P(30,5,1,1,'#ff60ff');}
                else {P(10,0,3,6,'#100c13');P(9,-2,2,4,'#100c13');P(35,0,3,6,'#100c13');P(37,-2,2,4,'#100c13');}
            } else {
                P(15,3,18,12,C.ink); P(17,4,14,8,hc);
                P(19,3,10,3,shade(hc,40)); P(17,7,2,8,shade(hc,-40));
                P(29,7,2,8,shade(hc,-40));
                P(23,3,2,8,shade(hc,-50)); P(23,4,1,6,shade(hc,55));
                if (!facingBack){
                    P(side ? 21 : 19,11,side ? 11 : 10,6,C.skin);
                    P(side ? 22 : 20,11,3,4,C.skinLight);
                    if (side) P(27,12,2,2,C.ink);
                    else {P(20,12,2,2,C.ink);P(26,12,2,2,C.ink);}
                    P(23,16,3,1,C.skinShade);
                } else {
                    P(17,10,14,7,hc);P(18,10,3,6,shade(hc,25));P(23,10,2,7,shade(hc,-35));
                }
                if (opts.head === 'ELMO_CHIFRES'){
                    P(12,0,4,5,C.ink); P(13,0,2,4,'#ddd3b7');
                    P(32,0,4,5,C.ink); P(33,0,2,4,'#ddd3b7');
                }
                if (opts.head === 'ELMO_DRACO'){
                    // Chifres longos curvados para fora, distintos do elmo comum.
                    P(10,0,6,4,C.ink);P(7,-3,5,4,C.ink);P(4,-4,4,2,C.ink);
                    P(11,1,4,2,'#bd9e77');P(8,-2,3,3,'#e0c7a1');
                    P(32,0,6,4,C.ink);P(36,-3,5,4,C.ink);P(40,-4,4,2,C.ink);
                    P(33,1,4,2,'#bd9e77');P(37,-2,3,3,'#e0c7a1');
                    if (!facingBack){
                        if (side) P(27,12,2,1,'#ed3b2d');
                        else {P(20,12,2,1,'#ed3b2d');P(26,12,2,1,'#ed3b2d');}
                    }
                }
            }
        }
        ctx.restore();
        return true;
    }
    window.ValadaresCharacterArt2D = { drawBody };
})();
