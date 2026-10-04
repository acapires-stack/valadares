// Armas restantes do catálogo, em pixels inteiros na mesma grade dos itens 2D.
(function () {
    'use strict';
    const art = window.ValadaresItemArt2D;
    if (!art?.register || !art.helpers) return;
    const { facet, stroke, disc } = art.helpers;

    const C = {
        ink:'#17171a', shadow:'#454850', steel:'#9298a2', light:'#d9dce0', white:'#f5f2e9',
        wood:'#82502e', bark:'#56351f', grain:'#b77c48', bone:'#d7c8a6', ivory:'#f2e7cb',
        gold:'#c08b3b', sun:'#e9bd69', bronze:'#755224', red:'#ae382f', ember:'#ed7143',
        ice:'#5eb8e6', frost:'#c1edff', blue:'#315986', violet:'#7956a6', lilac:'#c9a8ed',
        green:'#498e68', mint:'#a0e6b0', dark:'#292331'
    };

    function gem(P, x, y, color, shine, radius=3) {
        disc(P,x,y,radius+1,radius+1,C.ink);
        disc(P,x,y,radius,radius,color);
        P(x-1,y-radius,2,1,shine);
        P(x-1,y,1,2,shine);
    }
    function beam(P, x0,y0,x1,y1,outer,inner,shine) {
        stroke(P,x0,y0,x1,y1,outer,C.ink);
        stroke(P,x0,y0,x1,y1,outer-2,inner);
        if (shine) stroke(P,x0-1,y0,x1-1,y1,1,shine);
    }

    // Ícones: armas inclinadas ocupam a diagonal inteira, e a cabeça determina a família.
    function sword(P, v={}) {
        const short=!!v.short, wide=!!v.wide, curved=!!v.curved;
        const tip=short ? [22,7] : [27,2];
        const root=short ? [12,18] : [11,23];
        const color=v.color||C.steel, bright=v.bright||C.light;
        const poly=curved
            ? [[8,23],[10,19],[17,13],[22,7],[25,3],[28,3],[27,9],[22,15],[15,21],[12,25]]
            : [[root[0]-3,root[1]+1],[root[0]-1,root[1]-2],[tip[0]-3,tip[1]+2],tip,[tip[0],tip[1]+5],[root[0]+3,root[1]+2]];
        facet(P,poly,C.ink);
        if (curved) {
            facet(P,[[10,22],[11,19],[19,12],[25,5],[26,5],[23,13],[16,20],[12,24]],color);
            stroke(P,13,19,24,7,1,bright);
        } else {
            stroke(P,root[0],root[1]-1,tip[0]-2,tip[1]+3,wide?5:3,color);
            stroke(P,root[0]-1,root[1]-1,tip[0]-3,tip[1]+4,1,bright);
            P(tip[0]-1,tip[1]+1,1,2,bright);
        }
        if (v.notches) for (const [x,y] of [[17,13],[21,9],[24,6]]) P(x,y,2,2,C.ink);
        stroke(P,7,root[1]-2,root[0]+3,root[1]+3,wide?4:3,C.ink);
        stroke(P,7,root[1]-2,root[0]+3,root[1]+3,wide?2:1,v.guard||C.gold);
        beam(P,7,root[1]+1,3,28,5,C.bark,C.grain);
        gem(P,3,29,v.jewel||C.bronze,v.jewelLight||C.sun,1);
        if (v.rune) { P(17,13,2,2,v.rune); P(21,9,1,2,v.rune); }
    }
    function twinDaggers(P) {
        stroke(P,7,27,21,7,5,C.ink); stroke(P,7,27,21,7,3,C.steel);
        stroke(P,21,27,8,8,5,C.ink); stroke(P,21,27,8,8,3,C.steel);
        stroke(P,9,22,18,10,1,C.white); stroke(P,19,22,10,10,1,C.white);
        stroke(P,5,22,11,26,3,C.gold); stroke(P,18,25,24,21,3,C.gold);
        P(5,26,4,5,C.bark); P(20,26,4,5,C.bark);
        P(5,29,3,1,C.sun); P(21,29,3,1,C.sun);
    }
    function club(P, v={}) {
        beam(P,6,28,20,8,v.heavy?8:6,v.bone?C.bone:C.wood,v.bone?C.ivory:C.grain);
        const x=v.headX||21, y=v.headY||8;
        if (v.kind==='porrete') {
            beam(P,18,12,22,5,8,C.wood,C.grain);
            P(18,5,5,2,C.bark); P(18,7,1,6,C.grain);
        } else if(v.kind==='clava') {
            facet(P,[[14,10],[16,4],[22,2],[27,6],[26,13],[20,16]],C.ink);
            facet(P,[[16,10],[18,5],[22,4],[25,7],[24,12],[20,14]],C.wood);
            P(18,5,3,2,C.grain); P(22,9,2,1,C.bark);
        } else if(v.kind==='mace' || v.kind==='giant' || v.kind==='boardao') {
            const r=v.kind==='giant'?8:v.kind==='boardao'?7:5;
            disc(P,x,y,r+1,r+1,C.ink); disc(P,x,y,r,r,v.bone?C.bone:v.metal||C.steel);
            disc(P,x-2,y-2,Math.max(1,r-4),Math.max(1,r-4),v.bone?C.ivory:C.light);
            for(const [dx,dy] of [[0,-r-3],[r+1,-2],[-r-3,1],[2,r+1]]) {
                facet(P,[[x+dx-2,y+dy],[x+dx+2,y+dy],[x+dx,y+dy+(dy<0?-3:3)]],C.ink);
                P(x+dx,y+dy,1,2,v.bone?C.ivory:v.metal||C.steel);
            }
            if(v.kind==='boardao') { P(17,6,2,9,C.bark); P(23,8,2,8,C.bark); gem(P,x,y,C.red,C.ember,2); }
            else if(v.kind==='giant') { P(17,4,7,2,C.light); P(18,14,6,2,C.shadow); }
        } else if(v.kind==='hammer' || v.kind==='sledge') {
            const big=v.kind==='sledge', left=big?8:12, top=big?3:5, w=big?22:17, h=big?13:9;
            facet(P,[[left,top],[left+w-5,top],[left+w,top+3],[left+w,top+h-2],[left+w-4,top+h],[left,top+h]],C.ink);
            P(left+2,top+2,w-5,h-4,v.metal||C.steel);
            P(left+2,top+2,w-8,2,C.light); P(left+w-5,top+3,2,h-6,C.shadow);
            P(left+1,top+2,2,h-4,C.white);
            if(big) { P(left+5,top+6,10,2,C.shadow); P(left+6,top+7,8,1,C.gold); }
        }
        P(5,26,5,3,C.ink); P(6,26,3,2,v.bone?C.gold:C.bronze);
    }
    function axe(P) {
        beam(P,6,29,21,5,6,C.bark,C.grain);
        facet(P,[[16,4],[10,3],[8,7],[10,13],[16,16],[21,12],[25,8],[27,1],[22,4]],C.ink);
        facet(P,[[15,6],[11,5],[10,8],[12,12],[16,14],[21,10],[24,7],[25,3],[20,6]],C.steel);
        stroke(P,12,6,21,10,1,C.white);
        P(19,10,3,3,C.bronze); P(5,28,4,3,C.ink);
    }
    function bow(P, cross=false) {
        if(cross) {
            beam(P,8,28,20,8,6,C.bark,C.grain);
            stroke(P,5,8,17,4,4,C.ink); stroke(P,17,4,28,7,4,C.ink);
            stroke(P,5,8,17,4,2,C.wood); stroke(P,17,4,28,7,2,C.wood);
            stroke(P,5,8,18,11,1,C.ivory); stroke(P,18,11,28,7,1,C.ivory);
            stroke(P,12,20,22,4,2,C.steel); P(21,3,3,3,C.light);
            P(13,17,5,4,C.ink); P(14,18,3,2,C.gold);
            P(8,26,4,4,C.bark);
        } else {
            const pts=[[24,2],[18,4],[12,11],[8,18],[5,26],[6,29]];
            for(let i=0;i<pts.length-1;i++) beam(P,...pts[i],...pts[i+1],5,C.wood,C.grain);
            stroke(P,24,2,6,29,1,C.ivory);
            P(8,17,5,5,C.ink); P(9,18,3,3,C.bark);
            P(23,2,3,2,C.gold); P(5,28,3,2,C.gold);
        }
    }
    function spear(P, long=false) {
        beam(P,5,29,22,long?5:8,5,C.bark,C.grain);
        facet(P,[[18,long?7:10],[22,long?0:3],[27,long?4:7],[23,long?12:15]],C.ink);
        facet(P,[[20,long?7:10],[22,long?2:5],[25,long?5:8],[22,long?11:14]],long?C.light:C.steel);
        stroke(P,22,long?4:7,22,long?10:13,1,C.white);
        P(13,17,3,2,long?C.gold:C.bronze);
        if(long) P(5,29,4,2,C.gold);
    }
    function staff(P, kind) {
        const color=kind==='ice'?C.ice:kind==='lightning'?C.sun:kind==='rune'?C.violet:kind==='eternal'?C.frost:C.green;
        const shine=kind==='ice'?C.frost:kind==='lightning'?C.white:kind==='rune'?C.lilac:kind==='eternal'?C.white:C.mint;
        beam(P,5,29,19,7,6,kind==='eternal'?C.blue:C.bark,kind==='eternal'?C.ice:C.grain);
        P(7,25,4,2,C.gold); P(11,19,4,2,kind==='eternal'?C.sun:C.bronze);
        if(kind==='apprentice') {
            stroke(P,18,9,22,4,3,C.ink); stroke(P,18,9,22,4,1,C.grain);
            gem(P,22,4,color,shine,2);
        } else if(kind==='ice') {
            facet(P,[[13,7],[19,0],[25,7],[22,15],[15,14]],C.ink);
            facet(P,[[16,7],[19,2],[23,7],[21,12],[16,12]],C.ice);
            P(18,3,2,7,C.frost); P(20,9,1,3,C.white);
            for(const [x,y] of [[10,6],[26,12],[22,17]]) P(x,y,2,2,C.frost);
        } else if(kind==='lightning') {
            facet(P,[[20,0],[26,0],[21,8],[27,8],[16,21],[19,11],[14,11]],C.ink);
            facet(P,[[21,2],[24,2],[19,10],[24,10],[18,17],[21,9],[17,9]],C.sun);
            P(20,4,2,3,C.white); P(25,5,2,2,C.sun);
        } else if(kind==='rune') {
            disc(P,20,9,8,8,C.ink); disc(P,20,9,6,6,C.gold);
            disc(P,20,9,4,4,C.dark); gem(P,20,9,C.violet,C.lilac,2);
            P(15,7,2,1,C.lilac); P(23,10,2,1,C.lilac);
        } else {
            facet(P,[[17,15],[12,8],[16,2],[21,0],[28,6],[26,13],[20,17]],C.ink);
            facet(P,[[17,13],[14,8],[17,4],[21,2],[26,7],[24,12],[20,15]],C.gold);
            gem(P,20,8,C.ice,C.white,4);
            P(15,5,2,2,C.white); P(25,9,2,2,C.frost);
        }
    }

    // Ícones individuais: composição e acabamento próprios preservam a leitura a 18 px.
    const icons = {
        ADAGA:P=>sword(P,{short:true}),
        PORRETE:P=>club(P,{kind:'porrete'}),
        CLAVA:P=>club(P,{kind:'clava'}),
        MACA:P=>club(P,{kind:'mace',headY:11}),
        MACHADO:P=>axe(P),
        ESPADA_LONGA:P=>sword(P,{wide:true}),
        MARTELO:P=>club(P,{kind:'hammer'}),
        MARRETA:P=>club(P,{kind:'sledge',heavy:true}),
        MACA_GIGANTE:P=>club(P,{kind:'giant',heavy:true,headX:20,headY:15}),
        ARCO:P=>bow(P), BESTA:P=>bow(P,true),
        LANCA:P=>spear(P), LANCA_LONGA:P=>spear(P,true),
        ESPADA_OSSO:P=>sword(P,{color:C.bone,bright:C.ivory,guard:C.bark,notches:true,jewel:C.bone,jewelLight:C.ivory}),
        SABRE:P=>sword(P,{curved:true,guard:C.gold}),
        ADAGA_DUPLA:P=>twinDaggers(P),
        BORDAO:P=>club(P,{kind:'boardao',metal:C.shadow,headX:21,headY:14}),
        ESPADA_ACO:P=>sword(P,{color:C.steel,bright:C.white,guard:C.steel,jewel:C.blue,jewelLight:C.ice}),
        LAMINA_DRACO_1H:P=>sword(P,{color:C.red,bright:C.ember,guard:C.gold,rune:C.sun,jewel:C.red,jewelLight:C.ember}),
        ESPADA_GUARDIAO:P=>sword(P,{wide:true,color:C.blue,bright:C.frost,guard:C.gold,rune:C.sun,jewel:C.blue,jewelLight:C.ice}),
        ESPADA_DRACO:P=>sword(P,{wide:true,color:C.red,bright:C.ember,guard:C.gold,notches:true,rune:C.sun,jewel:C.red,jewelLight:C.ember}),
        VARINHA_APRENDIZ:P=>staff(P,'apprentice'),
        CAJADO_GELO:P=>staff(P,'ice'), CAJADO_RAIO:P=>staff(P,'lightning'),
        CAJADO_RUNICO:P=>staff(P,'rune'), CAJADO_ETERNO:P=>staff(P,'eternal')
    };

    function shaft(P, color=C.bark, trim=C.grain, width=5, top=12) {
        beam(P,2,36,2,top,width+2,color,trim);
        P(-1,32,6,2,C.ink); P(0,32,4,1,C.bronze);
        P(0,37,4,2,C.ink); P(1,37,2,1,C.gold);
    }
    function bladeWeapon(P,v={}) {
        const dagger=!!v.dagger, long=!!v.long, curved=!!v.curved;
        const top=dagger?17:long?0:6;
        const color=v.color||C.steel, bright=v.bright||C.light;
        if(curved) {
            facet(P,[[-1,30],[-3,19],[0,8],[6,1],[10,1],[8,10],[5,20],[5,29]],C.ink);
            facet(P,[[0,29],[-1,19],[2,9],[7,3],[8,3],[6,11],[3,21],[3,29]],color);
            stroke(P,1,27,2,9,1,bright);
        } else {
            const half=v.wide?5:dagger?2:3;
            facet(P,[[2-half,30],[2-half,top+8],[2,top],[2+half,top+8],[2+half,30]],C.ink);
            facet(P,[[3-half,29],[3-half,top+9],[2,top+2],[1+half,top+9],[1+half,29]],color);
            P(0,top+9,1,Math.max(2,26-top),bright);
            P(2,top+2,1,2,C.white);
        }
        if(v.notches) for (const y of [12,17,22]) P(v.wide?6:5,y,2,2,C.ink);
        if(v.rune) { P(1,16,2,2,v.rune); P(1,22,2,2,v.rune); }
        stroke(P,-6,30,10,30,v.wide?5:4,C.ink);
        stroke(P,-6,30,10,30,v.wide?3:2,v.guard||C.gold);
        P(-7,29,2,3,v.guard||C.gold); P(9,29,2,3,v.guard||C.gold);
        P(0,32,4,6,C.ink); P(1,32,2,5,C.bark);
        gem(P,2,38,v.jewel||C.bronze,v.jewelLight||C.sun,1);
    }
    function bluntWeapon(P,v={}) {
        shaft(P,v.bone?C.bone:C.bark,v.bone?C.ivory:C.grain,v.heavy?6:4,11);
        const handPixel=P;
        P=(x,y,w,h,color)=>handPixel(x,y-8,w,h,color);
        if(v.kind==='porrete') {
            P(-2,6,8,14,C.ink); P(-1,7,6,12,C.wood); P(0,7,2,10,C.grain);
            P(-1,10,6,2,C.bark); P(-1,16,6,2,C.bark);
        } else if(v.kind==='clava') {
            facet(P,[[-3,20],[-6,11],[-3,5],[3,3],[7,7],[8,15],[5,21]],C.ink);
            facet(P,[[-2,18],[-4,11],[-2,7],[3,5],[5,8],[6,15],[4,19]],C.wood);
            P(-2,8,2,8,C.grain); P(4,11,2,3,C.bark);
        } else if(v.kind==='hammer'||v.kind==='sledge') {
            const big=v.kind==='sledge';
            P(big?-9:-7,big?4:7,big?23:19,big?13:9,C.ink);
            P(big?-7:-5,big?6:9,big?19:15,big?9:5,v.metal||C.steel);
            P(big?-7:-5,big?6:9,big?15:12,2,C.light);
            P(big?10:8,big?7:10,2,big?7:4,C.shadow);
            if(big) { P(-5,11,14,2,C.shadow); P(-4,11,10,1,C.gold); }
        } else {
            const r=v.kind==='giant'?8:v.kind==='boardao'?7:6;
            disc(P,2,10,r+1,r+1,C.ink); disc(P,2,10,r,r,v.kind==='boardao'?C.shadow:v.bone?C.bone:C.steel);
            disc(P,0,8,Math.max(1,r-4),Math.max(1,r-4),v.bone?C.ivory:C.light);
            for(const [x,y,w,h] of [[0,0,4,4],[-r-1,9,3,3],[r+2,9,3,3],[0,18,4,3]]) {
                P(x,y,w,h,C.ink); P(x+1,y,w-2,h-1,v.bone?C.ivory:C.steel);
            }
            if(v.kind==='boardao') { P(-5,6,2,7,C.bark); P(7,7,2,7,C.bark); gem(P,2,10,C.red,C.ember,2); }
            if(v.kind==='giant') { P(-4,4,9,2,C.white); P(6,13,2,4,C.shadow); }
        }
    }
    function axeWeapon(P) {
        shaft(P,C.bark,C.grain,5,7);
        const handPixel=P;
        P=(x,y,w,h,color)=>handPixel(x,y-9,w,h,color);
        facet(P,[[1,8],[-7,3],[-10,5],[-10,17],[-6,20],[1,14]],C.ink);
        facet(P,[[0,9],[-7,5],[-8,6],[-8,16],[-5,18],[0,13]],C.steel);
        P(-8,7,1,8,C.white);
        facet(P,[[3,8],[10,3],[13,5],[13,17],[9,19],[3,14]],C.ink);
        facet(P,[[4,9],[10,5],[11,7],[11,16],[9,17],[4,13]],C.steel);
        P(10,8,1,7,C.white); P(0,10,4,4,C.gold);
    }
    function bowWeapon(P,cross=false) {
        if(cross) {
            shaft(P,C.bark,C.grain,4,14);
            const H=(x,y,w,h,color)=>P(x,y-8,w,h,color);
            stroke(H,-10,13,-4,9,5,C.ink); stroke(H,-4,9,2,11,5,C.ink);
            stroke(H,2,11,8,9,5,C.ink); stroke(H,8,9,13,13,5,C.ink);
            stroke(H,-10,13,-4,9,3,C.wood); stroke(H,8,9,13,13,3,C.wood);
            stroke(H,-10,13,2,17,1,C.ivory); stroke(H,2,17,13,13,1,C.ivory);
            H(-1,12,6,6,C.ink); H(0,13,4,4,C.gold);
            P(0,9,4,6,C.bark);
            stroke(P,2,25,2,5,2,C.steel); P(0,3,4,5,C.light);
        } else {
            const path=[[5,2],[-1,5],[-5,13],[-6,23],[-2,33],[4,39]];
            for(let i=0;i<path.length-1;i++) beam(P,...path[i],...path[i+1],5,C.wood,C.grain);
            stroke(P,5,2,4,38,1,C.ivory);
            P(-8,27,6,7,C.ink); P(-7,28,4,5,C.bark);
            P(-6,29,2,1,C.gold); P(4,2,3,2,C.gold); P(3,38,3,2,C.gold);
        }
    }
    function spearWeapon(P,long=false) {
        shaft(P,C.bark,C.grain,3,long?1:7);
        facet(P,[[-2,long?8:13],[2,long?-5:1],[7,long?8:13],[3,long?17:20]],C.ink);
        facet(P,[[0,long?8:13],[2,long?-3:3],[5,long?8:13],[2,long?15:18]],long?C.light:C.steel);
        P(1,long?2:8,1,11,C.white); P(-1,long?17:20,6,2,long?C.gold:C.bronze);
    }
    function staffWeapon(P,kind) {
        const dark=kind==='eternal'?C.blue:C.bark, tint=kind==='eternal'?C.ice:C.grain;
        shaft(P,dark,tint,4,9);
        P(-1,24,6,2,kind==='eternal'?C.gold:C.bronze);
        if(kind==='apprentice') {
            stroke(P,1,10,7,4,4,C.ink); stroke(P,1,10,7,4,2,C.wood);
            gem(P,7,4,C.green,C.mint,3);
        } else if(kind==='ice') {
            facet(P,[[-5,10],[-1,3],[2,-3],[6,3],[9,10],[5,17],[-2,16]],C.ink);
            facet(P,[[-3,10],[0,3],[2,-1],[5,4],[7,10],[4,14],[-1,14]],C.ice);
            P(1,2,2,10,C.frost); P(6,7,1,4,C.white);
            P(-8,13,2,2,C.frost); P(8,16,2,2,C.frost);
        } else if(kind==='lightning') {
            facet(P,[[2,-4],[8,-4],[4,4],[10,4],[-2,21],[1,9],[-4,9]],C.ink);
            facet(P,[[3,-2],[6,-2],[2,6],[7,6],[0,16],[3,7],[-1,7]],C.sun);
            P(4,0,2,3,C.white); P(9,0,2,2,C.sun);
        } else if(kind==='rune') {
            disc(P,2,7,9,9,C.ink); disc(P,2,7,7,7,C.gold);
            disc(P,2,7,5,5,C.dark); gem(P,2,7,C.violet,C.lilac,3);
            P(-4,4,2,2,C.lilac); P(7,9,2,2,C.lilac);
        } else {
            facet(P,[[-8,12],[-6,3],[-1,-3],[5,-4],[11,3],[12,11],[7,18],[-1,18]],C.ink);
            facet(P,[[-6,11],[-4,4],[0,-1],[5,-2],[9,4],[10,10],[6,15],[0,16]],C.gold);
            gem(P,2,7,C.ice,C.white,5);
            P(-5,3,2,2,C.white); P(9,11,2,2,C.frost);
        }
    }
    function twinWeapon(P) {
        bladeWeapon(P,{dagger:true});
        // Segunda lâmina curta à frente da primeira, com cabo independente.
        facet(P,[[-9,29],[-10,19],[-6,12],[-3,20],[-4,29]],C.ink);
        facet(P,[[-8,28],[-8,20],[-6,15],[-5,20],[-5,28]],C.steel);
        P(-8,18,1,7,C.white);
        P(-11,29,9,3,C.ink); P(-10,29,7,1,C.gold);
        P(-8,32,3,6,C.ink); P(-7,33,1,4,C.bark);
    }

    const weapons = {
        ADAGA:P=>bladeWeapon(P,{dagger:true}),
        PORRETE:P=>bluntWeapon(P,{kind:'porrete'}), CLAVA:P=>bluntWeapon(P,{kind:'clava'}),
        MACA:P=>bluntWeapon(P,{kind:'mace'}), MACHADO:P=>axeWeapon(P),
        ESPADA_LONGA:P=>bladeWeapon(P,{long:true,wide:true}),
        MARTELO:P=>bluntWeapon(P,{kind:'hammer'}), MARRETA:P=>bluntWeapon(P,{kind:'sledge',heavy:true}),
        MACA_GIGANTE:P=>bluntWeapon(P,{kind:'giant',heavy:true}),
        ARCO:P=>bowWeapon(P), BESTA:P=>bowWeapon(P,true),
        LANCA:P=>spearWeapon(P), LANCA_LONGA:P=>spearWeapon(P,true),
        ESPADA_OSSO:P=>bladeWeapon(P,{color:C.bone,bright:C.ivory,guard:C.bark,notches:true,jewel:C.bone,jewelLight:C.ivory}),
        SABRE:P=>bladeWeapon(P,{curved:true}), ADAGA_DUPLA:P=>twinWeapon(P),
        BORDAO:P=>bluntWeapon(P,{kind:'boardao'}),
        ESPADA_ACO:P=>bladeWeapon(P,{color:C.steel,bright:C.white,guard:C.steel,jewel:C.blue,jewelLight:C.ice}),
        LAMINA_DRACO_1H:P=>bladeWeapon(P,{color:C.red,bright:C.ember,guard:C.gold,rune:C.sun,jewel:C.red,jewelLight:C.ember}),
        ESPADA_GUARDIAO:P=>bladeWeapon(P,{wide:true,color:C.blue,bright:C.frost,guard:C.gold,rune:C.sun,jewel:C.blue,jewelLight:C.ice}),
        ESPADA_DRACO:P=>bladeWeapon(P,{long:true,wide:true,color:C.red,bright:C.ember,guard:C.gold,notches:true,rune:C.sun,jewel:C.red,jewelLight:C.ember}),
        VARINHA_APRENDIZ:P=>staffWeapon(P,'apprentice'),
        CAJADO_GELO:P=>staffWeapon(P,'ice'), CAJADO_RAIO:P=>staffWeapon(P,'lightning'),
        CAJADO_RUNICO:P=>staffWeapon(P,'rune'), CAJADO_ETERNO:P=>staffWeapon(P,'eternal')
    };

    art.register({ icons, weapons });
})();
