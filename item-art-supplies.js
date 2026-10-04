// Suprimentos, materiais e cosméticos em pixel art. Coordenadas: grade de 32 px.
(function () {
    'use strict';
    const art = window.ValadaresItemArt2D;
    if (!art?.register || !art.helpers) return;
    const { facet, stroke, disc } = art.helpers;
    const C = {
        ink:'#17171a', shadow:'#303039', white:'#fff9e5', bone:'#d8d6bd',
        gold:'#e5ac3e', goldHi:'#ffe384', goldD:'#80501e',
        red:'#bf4936', redHi:'#ef8060', redD:'#772a29',
        orange:'#f77d27', yellow:'#ffcf55',
        blue:'#398dc4', ice:'#82d9f6', iceHi:'#d4f8ff', iceD:'#285a83',
        violet:'#74399d', violetHi:'#bb80d8', violetD:'#40254e',
        green:'#729842', greenHi:'#acd368', greenD:'#3f5c34',
        steel:'#8899a6', steelHi:'#d8e0e7', steelD:'#526070',
        wood:'#8a5734', woodHi:'#bd8950', woodD:'#563620'
    };
    const poly = (P, pts, c) => facet(P, pts, c);
    const line = (P, a, b, c, d, width, color) => stroke(P, a, b, c, d, width, color);
    function glint(P, x, y, color=C.white) {
        P(x+1,y,1,5,color); P(x,y+1,3,1,color);
    }
    function smallHero(P, body=C.shadow) {
        disc(P,16,11,3,3,C.ink); disc(P,16,11,2,2,C.bone);
        poly(P,[[12,15],[20,15],[22,25],[10,25]],C.ink);
        poly(P,[[13,16],[19,16],[20,23],[12,23]],body);
        P(13,25,2,3,C.ink); P(18,25,2,3,C.ink);
    }
    function flame(P,x,y,s=1) {
        poly(P,[[x,y+12*s],[x-3*s,y+9*s],[x-2*s,y+4*s],[x+1*s,y+7*s],
            [x+2*s,y],[x+5*s,y+5*s],[x+7*s,y+3*s],[x+8*s,y+9*s],[x+5*s,y+13*s]],C.ink);
        poly(P,[[x,y+11*s],[x-1*s,y+7*s],[x+2*s,y+8*s],[x+3*s,y+3*s],
            [x+5*s,y+8*s],[x+6*s,y+6*s],[x+6*s,y+10*s],[x+4*s,y+12*s]],C.red);
        poly(P,[[x+1*s,y+11*s],[x+3*s,y+7*s],[x+5*s,y+9*s],[x+4*s,y+12*s]],C.yellow);
    }
    function snow(P,x,y,scale=1) {
        const arm=Math.round(5*scale), diag=Math.round(4*scale);
        line(P,x,y-arm,x,y+arm,2,C.iceHi);
        line(P,x-arm,y,x+arm,y,2,C.iceHi);
        line(P,x-diag,y-diag,x+diag,y+diag,1,C.ice);
        line(P,x+diag,y-diag,x-diag,y+diag,1,C.ice);
        P(x-1,y-1,3,3,C.blue);
    }
    function cape(P, cloth, light, trim, variant) {
        poly(P,[[11,5],[21,5],[25,9],[26,28],[22,29],[19,26],[16,30],
            [13,26],[9,29],[6,28],[7,9]],C.ink);
        poly(P,[[11,7],[21,7],[23,10],[24,26],[21,27],[18,23],[16,28],
            [13,23],[10,27],[8,26],[9,10]],cloth);
        poly(P,[[11,8],[15,9],[14,23],[11,26],[9,25],[10,10]],light);
        line(P,10,7,16,10,2,trim); line(P,22,7,16,10,2,trim);
        P(14,8,4,3,C.ink); P(15,8,2,2,trim);
        if(variant==='royal') {
            P(7,25,3,3,C.goldHi); P(22,25,3,3,C.goldHi);
            poly(P,[[16,15],[18,19],[22,19],[19,21],[20,24],[16,22],[12,24],[13,21],[10,19],[14,19]],C.goldHi);
        } else if(variant==='shadow') {
            poly(P,[[15,11],[18,15],[16,17],[20,17],[16,23],[12,17],[15,17],[13,15]],C.violetHi);
            P(8,24,2,2,C.violet); P(22,22,2,2,C.violet);
        } else if(variant==='skeptic') {
            poly(P,[[13,15],[19,15],[19,17],[17,17],[17,23],[15,23],[15,17],[13,17]],C.steelD);
            glint(P,24,5,C.iceHi);
        } else {
            line(P,11,24,16,28,2,C.goldHi); line(P,16,28,21,24,2,C.goldHi);
            glint(P,16,15,C.goldHi);
        }
    }
    function crown(P, dark=false) {
        const gold=dark?C.violet:C.gold, hi=dark?C.violetHi:C.goldHi;
        poly(P,[[3,9],[9,15],[13,5],[17,14],[23,5],[27,14],[30,9],
            [27,24],[5,24]],C.ink);
        poly(P,[[5,12],[10,18],[13,8],[17,17],[23,8],[27,17],[28,12],
            [26,22],[6,22]],gold);
        line(P,7,13,10,18,2,hi); line(P,13,9,16,16,2,hi);
        P(6,23,21,5,C.ink); P(7,24,19,3,gold); P(8,24,17,1,hi);
        P(10,19,3,3,C.ink); P(11,19,1,2,dark?C.redHi:C.blue);
        P(16,19,3,3,C.ink); P(17,19,1,2,dark?C.violetHi:C.redHi);
        P(22,19,3,3,C.ink); P(23,19,1,2,dark?C.redHi:C.blue);
        P(12,6,3,3,hi); P(22,6,3,3,hi);
    }
    function arrow(P, piercing) {
        line(P,5,27,23,9,5,C.ink); line(P,5,27,23,9,3,piercing?C.steel:C.wood);
        line(P,8,24,21,11,1,piercing?C.steelHi:C.woodHi);
        poly(P,piercing?[[18,8],[28,2],[30,4],[26,14],[21,12]]:
            [[21,7],[29,2],[27,11],[23,13]],C.ink);
        poly(P,piercing?[[20,8],[28,3],[27,7],[24,12]]:
            [[22,8],[27,4],[26,9],[23,11]],piercing?C.steelHi:C.bone);
        if(piercing){line(P,24,5,25,10,1,C.iceHi); P(28,2,2,2,C.white);}
        poly(P,[[3,24],[8,25],[9,29],[4,28]],C.ink);
        poly(P,[[5,24],[9,25],[8,27],[5,27]],piercing?C.ice:C.bone);
        poly(P,[[3,20],[8,22],[10,26],[5,24]],C.ink);
        poly(P,[[4,21],[8,23],[8,25],[5,23]],piercing?C.iceHi:C.bone);
    }
    function foodCheese(P) {
        poly(P,[[3,14],[21,6],[29,11],[29,23],[3,23]],C.ink);
        poly(P,[[5,15],[21,8],[27,12],[27,20],[5,21]],'#e5b632');
        poly(P,[[5,15],[21,8],[27,12],[11,17]],'#ffe072');
        P(5,20,22,2,C.goldD);
        disc(P,13,18,2,2,C.goldD); disc(P,22,16,2,1,C.goldD);
        P(22,10,2,1,C.white);
    }
    function foodEgg(P) {
        poly(P,[[15,3],[21,5],[25,12],[26,20],[23,27],[17,30],[10,28],[6,22],[7,13],[11,6]],C.ink);
        poly(P,[[15,5],[20,7],[23,13],[24,20],[21,26],[17,28],[11,26],[8,21],[9,13],[12,7]],'#e8ddb7');
        poly(P,[[12,8],[16,6],[19,8],[13,16],[9,18],[10,13]],C.white);
        poly(P,[[13,14],[17,11],[19,13],[16,18]],C.greenD);
        P(20,20,2,2,C.greenD); P(11,22,2,1,C.green);
    }
    function foodSteak(P) {
        poly(P,[[6,11],[13,5],[23,6],[29,12],[27,22],[19,28],[9,27],[3,20]],C.ink);
        poly(P,[[7,12],[14,7],[22,8],[27,13],[25,21],[19,26],[10,25],[5,19]],C.redD);
        poly(P,[[9,12],[15,8],[22,10],[25,14],[23,20],[17,23],[10,21],[7,17]],C.red);
        poly(P,[[11,14],[16,11],[22,12],[22,17],[17,20],[11,19]],C.redHi);
        poly(P,[[17,12],[21,13],[23,16],[21,19],[17,20],[14,17]],'#edb6a0');
        P(17,14,3,3,C.red);
    }
    function foodHam(P) {
        line(P,18,18,25,25,7,C.ink); line(P,18,18,25,25,4,C.bone);
        disc(P,26,26,3,3,C.ink); disc(P,26,26,2,2,C.white);
        poly(P,[[6,8],[13,4],[21,6],[25,12],[23,19],[18,24],[9,22],[4,17]],C.ink);
        poly(P,[[7,9],[13,6],[20,8],[23,13],[21,18],[17,22],[10,20],[6,16]],'#9a442d');
        poly(P,[[9,9],[14,7],[19,9],[21,13],[18,17],[10,16]],'#d8794e');
        line(P,9,13,13,9,2,'#f7b778'); P(18,19,3,2,C.redD);
    }
    function foodLizard(P) {
        poly(P,[[4,17],[9,10],[18,6],[26,9],[29,16],[25,25],[15,28],[7,24]],C.ink);
        poly(P,[[6,17],[10,12],[18,8],[24,10],[27,16],[23,23],[15,26],[9,22]],C.greenD);
        poly(P,[[8,17],[13,11],[21,10],[25,15],[20,22],[14,23],[9,21]],C.green);
        poly(P,[[11,16],[17,11],[21,13],[17,19],[11,20]],C.greenHi);
        P(18,24,4,2,C.redHi); P(9,19,3,2,'#c5a778');
        line(P,19,9,25,14,1,C.greenHi);
    }
    function phoenix(P, timed) {
        // Pena flamejante: raque clara, aletas quentes e olho de brasa.
        poly(P,[[7,27],[12,18],[9,13],[14,10],[14,5],[20,8],[24,3],[25,12],
            [28,17],[22,24],[14,27]],C.ink);
        poly(P,[[10,25],[14,17],[11,14],[16,12],[16,7],[20,11],[23,6],[23,15],
            [26,17],[21,22],[15,25]],timed?C.red:C.orange);
        poly(P,[[15,23],[17,15],[18,9],[22,12],[21,18],[17,23]],C.yellow);
        line(P,8,29,21,12,2,C.white); P(19,10,2,2,C.white);
        if(timed) {
            disc(P,7,7,5,5,C.ink); disc(P,7,7,4,4,C.goldHi);
            P(7,4,1,4,C.ink); P(7,7,3,1,C.ink);
        } else {glint(P,5,8,C.goldHi);}
    }
    function aura(P,type) {
        const main=type==='fire'?C.orange:type==='ice'?C.ice:C.iceHi;
        disc(P,16,16,15,14,C.ink); disc(P,16,16,13,12,main);
        disc(P,16,16,10,9,C.ink); smallHero(P,type==='seer'?C.violetD:C.shadow);
        if(type==='fire') {
            flame(P,2,9,.7); flame(P,21,5,.65);
            P(2,22,3,3,C.yellow); P(26,23,3,3,C.redHi);
        } else if(type==='ice') {
            snow(P,5,7,.55); snow(P,26,23,.55);
            P(2,18,3,3,C.iceHi); P(27,8,3,3,C.iceHi);
        } else {
            glint(P,5,6,C.iceHi); glint(P,25,5,C.iceHi);
            poly(P,[[16,17],[21,20],[16,23],[11,20]],C.iceHi);
            P(15,19,3,2,C.violetD);
        }
    }
    function nameGold(P) {
        poly(P,[[3,10],[7,6],[25,6],[29,10],[29,22],[25,26],[7,26],[3,22]],C.ink);
        poly(P,[[5,11],[8,8],[24,8],[27,11],[27,21],[24,24],[8,24],[5,21]],C.goldD);
        P(8,12,16,3,C.goldHi); P(8,17,13,3,C.goldHi);
        P(8,12,2,8,C.white); P(13,12,2,8,C.white);
        glint(P,25,3,C.goldHi);
    }
    function trail(P,ice) {
        const light=ice?C.iceHi:C.goldHi, base=ice?C.blue:C.gold;
        // Pegada repetida em diagonal: o espaço entre marcas indica movimento.
        for(const [x,y,s] of [[3,22,1],[12,14,1],[22,5,1]]) {
            poly(P,[[x,y+3],[x+2,y],[x+5,y+1],[x+6,y+5],[x+4,y+7],[x+1,y+6]],C.ink);
            P(x+2,y+2,3,3,base); P(x+2,y+1,2,1,light);
            P(x+6,y,2,2,light);
        }
        if(ice){snow(P,6,8,.45); P(27,23,2,2,C.iceHi);}
        else {glint(P,7,5,C.goldHi); P(27,23,2,2,C.yellow);}
    }
    function fireParts(P) {
        line(P,5,27,22,10,4,C.ink); line(P,5,27,22,10,2,C.steelHi);
        P(3,27,5,3,C.woodD); P(19,9,6,2,C.steelHi);
        flame(P,18,13,.7); flame(P,4,4,.5);
        P(27,6,2,2,C.yellow); P(27,21,2,2,C.redHi);
    }
    function thunderParts(P) {
        line(P,5,27,22,10,4,C.ink); line(P,5,27,22,10,2,C.steelHi);
        P(3,27,5,3,C.woodD); P(19,9,6,2,C.steelHi);
        poly(P,[[19,3],[13,15],[19,15],[15,27],[28,11],[21,11],[26,3]],C.ink);
        poly(P,[[20,5],[16,13],[21,13],[18,22],[26,12],[20,12],[24,5]],C.iceHi);
        P(8,5,2,2,C.ice); P(27,25,2,2,C.ice);
    }
    function gold(P) {
        disc(P,17,21,10,7,C.ink); disc(P,17,20,9,6,C.goldD);
        disc(P,17,18,9,6,C.ink); disc(P,17,17,8,5,C.gold);
        disc(P,17,17,6,4,C.goldHi); P(13,15,7,1,C.white);
        P(15,15,2,5,C.goldD); P(18,16,2,3,C.goldD);
        disc(P,10,24,6,4,C.ink); disc(P,10,23,5,3,C.gold);
        P(8,21,4,1,C.goldHi); glint(P,24,5,C.goldHi);
    }
    function silk(P) {
        // Novelo enrolado e fio solto ligado ao casulo de aranha.
        disc(P,15,17,11,10,C.ink); disc(P,15,16,10,9,'#b8b8cc');
        disc(P,14,15,8,7,'#dedee8');
        line(P,8,16,21,10,2,C.steelD); line(P,7,21,21,15,2,C.steelD);
        line(P,11,25,21,18,2,C.steelD);
        line(P,20,22,27,27,2,C.ink); line(P,20,22,27,27,1,C.white);
        P(9,9,6,2,C.white); P(26,26,3,2,C.white);
    }
    function batWing(P) {
        // O bordo inferior recortado preserva a silhueta de asa mesmo pequena.
        poly(P,[[3,7],[9,10],[14,5],[18,11],[28,4],[27,23],[22,19],
            [18,25],[13,20],[7,25]],C.ink);
        poly(P,[[5,9],[10,13],[14,8],[18,14],[26,7],[25,20],[21,17],
            [18,22],[13,18],[8,22]],'#3a2a44');
        line(P,16,14,26,8,2,C.violet); line(P,16,14,24,19,2,C.violet);
        line(P,16,14,18,22,2,C.violet); line(P,16,14,9,21,2,C.violet);
        P(14,11,4,5,C.violetD); P(15,12,2,2,C.violetHi);
    }
    function bone(P) {
        line(P,8,24,24,8,9,C.ink); line(P,8,24,24,8,6,C.bone);
        line(P,8,22,22,8,2,C.white);
        for(const [x,y] of [[5,24],[8,27],[22,5],[25,8]]) {
            disc(P,x,y,3,3,C.ink); disc(P,x,y,2,2,C.bone);
            P(x-1,y-1,2,1,C.white);
        }
    }
    function horn(P) {
        poly(P,[[4,27],[3,20],[7,15],[14,13],[22,8],[26,2],[29,2],
            [28,11],[23,19],[15,25],[9,29]],C.ink);
        poly(P,[[5,25],[5,20],[9,17],[15,15],[23,10],[27,4],[26,10],
            [21,18],[14,23],[9,27]],'#b9a778');
        poly(P,[[7,20],[11,17],[16,16],[23,11],[25,8],[20,16],[12,23],[8,25]],'#e0d2a4');
        line(P,7,20,12,23,2,C.woodD); line(P,11,16,17,19,2,C.woodD);
        P(25,5,2,2,C.white);
    }
    function scale(P) {
        poly(P,[[16,2],[27,9],[29,17],[23,26],[16,30],[8,26],[3,17],[6,9]],C.ink);
        poly(P,[[16,4],[25,10],[27,17],[22,24],[16,28],[9,24],[5,17],[8,10]],C.redD);
        poly(P,[[16,5],[23,11],[24,18],[18,25],[11,22],[7,16],[9,10]],C.red);
        poly(P,[[16,5],[16,24],[10,21],[8,15],[10,10]],C.redHi);
        line(P,16,6,16,26,2,C.ink); line(P,8,15,15,19,1,C.redHi);
        line(P,18,20,24,15,1,C.redHi);
    }
    function claw(P) {
        poly(P,[[4,22],[7,16],[13,13],[22,6],[28,3],[27,11],[22,17],
            [18,24],[11,28],[5,27]],C.ink);
        poly(P,[[6,22],[9,17],[14,15],[23,8],[26,5],[25,10],[20,16],
            [17,22],[11,26],[6,25]],C.greenD);
        poly(P,[[8,20],[13,16],[22,10],[24,8],[21,16],[15,22],[10,24]],C.green);
        line(P,10,23,22,12,2,C.greenHi);
        poly(P,[[22,8],[28,2],[27,10],[23,13]],C.bone);
        P(25,4,2,2,C.white);
    }
    function golemStone(P) {
        poly(P,[[4,10],[10,4],[21,3],[28,9],[30,21],[24,28],[10,29],[3,23]],C.ink);
        poly(P,[[6,11],[11,6],[20,5],[26,10],[28,20],[23,26],[11,27],[5,22]],C.steelD);
        poly(P,[[6,11],[11,6],[20,5],[17,13],[10,16]],C.steel);
        poly(P,[[17,13],[26,10],[28,20],[23,26],[17,22]],'#677d91');
        poly(P,[[10,17],[17,13],[17,22],[11,26],[5,21]],'#82929a');
        line(P,17,13,19,21,2,C.ink); line(P,19,21,24,23,2,C.ink);
        P(10,9,5,2,C.steelHi); P(8,20,2,2,C.ice);
    }
    function essence(P) {
        // Frasco claro com núcleo de estrela, diferente das pedras de material.
        P(12,2,8,3,C.ink); P(13,3,6,2,C.goldHi);
        poly(P,[[10,6],[22,6],[26,13],[25,25],[21,29],[11,29],[7,25],[6,13]],C.ink);
        poly(P,[[11,8],[21,8],[24,14],[23,24],[20,27],[12,27],[9,24],[8,14]],C.steelHi);
        poly(P,[[10,17],[13,11],[16,17],[20,10],[22,18],[19,25],[12,25]],C.goldHi);
        poly(P,[[16,9],[18,16],[23,18],[18,20],[16,26],[14,20],[10,18],[14,16]],C.white);
        P(15,17,3,3,C.yellow); P(9,10,2,5,C.white); glint(P,25,5,C.goldHi);
    }
    function darkCrown(P) {
        crown(P,true);
        poly(P,[[12,11],[17,5],[21,11],[19,15],[14,15]],C.violetD);
        P(16,8,2,4,C.violetHi);
        P(4,28,4,2,C.violet); P(24,28,4,2,C.violet);
    }
    art.register({ icons: {
        CHEESE: foodCheese, EGG: foodEgg, MEAT: foodSteak, HAM: foodHam,
        CARNE_LAGARTO: foodLizard,
        BENCAO_FENIX: P=>phoenix(P,false), BENCAO_FENIX_TEMP: P=>phoenix(P,true),
        COROA_TEMPORADA: P=>crown(P,false),
        CAPA_REAL: P=>cape(P,C.gold,C.goldHi,C.redHi,'royal'),
        CAPA_SOMBRA: P=>cape(P,'#252630','#515166',C.violet,'shadow'),
        AURA_FOGO: P=>aura(P,'fire'), AURA_GELO: P=>aura(P,'ice'),
        NOME_DOURADO: nameGold,
        TRAIL_OURO: P=>trail(P,false), TRAIL_GELO: P=>trail(P,true),
        PART_FOGO: fireParts, PART_TROVAO: thunderParts,
        AURA_VIDENTE: P=>aura(P,'seer'),
        CAPA_CETICO: P=>cape(P,'#e8e8c0',C.white,C.steelD,'skeptic'),
        COROA_SOMBRIA: darkCrown,
        MANTO_JUSTO: P=>cape(P,'#e0e0a0',C.white,C.goldHi,'just'),
        GOLD: gold, SILK: silk, ASA_MORCEGO: batWing, OSSO: bone,
        CHIFRE: horn, ESCAMA: scale, GARRA: claw, PEDRA_GOLEM: golemStone,
        ESSENCIA: essence, FLECHA: P=>arrow(P,false), FLECHA_PERF: P=>arrow(P,true)
    }});
})();
