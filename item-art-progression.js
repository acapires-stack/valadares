// Arte procedural das novas famílias da progressão T4–T7.
// Depende apenas do registro público de item-art.js e dos seus helpers 2D.
(function () {
    'use strict';
    const art = window.ValadaresItemArt2D;
    if (!art?.register || !art.helpers) return;
    const { facet, stroke, disc } = art.helpers;
    if (!facet || !stroke || !disc) return;

    const ink = '#17171a';
    const palettes = {
        FRAGMENTO_FORJA: {metal:'#ed9b50', shine:'#ffe0a6', core:'#a7442c', glow:'#ffae58'},
        MACHADO_FORJA: {metal:'#c96c3c', shine:'#f8bb76', core:'#d94d35', glow:'#ff9a52'},
        MACHADO_RUINAS: {metal:'#987466', shine:'#e0bea1', core:'#784f46', glow:'#c8784e'},
        MACHADO_CATACLISMO: {metal:'#d84f36', shine:'#ffb05e', core:'#6e2430', glow:'#ff663d'},
        MACHADO_ABISMO: {metal:'#8861bd', shine:'#d3b4ff', core:'#38264f', glow:'#b77cff'},
        MARTELO_COLOSSO: {metal:'#779aaf', shine:'#d2e9f2', core:'#49687b', glow:'#9bcce0'},
        MARTELO_ETERNAL: {metal:'#92b9d0', shine:'#effaff', core:'#4d829c', glow:'#b7e6fa'},
        MARTELO_CELESTIAL: {metal:'#a5daec', shine:'#ffffff', core:'#5787a2', glow:'#aeeaff'},
        ARCO_DRACO: {metal:'#a75943', shine:'#e89b72', core:'#642e28', glow:'#dc674a'},
        BESTA_GUARDIAO: {metal:'#bd9b54', shine:'#f8df9c', core:'#68502c', glow:'#e5c56f'},
        ARCO_ECLIPSE: {metal:'#735caa', shine:'#d0b9ff', core:'#30254e', glow:'#ab83e8'},
        ARCO_ASTRAL: {metal:'#97cbea', shine:'#f3fdff', core:'#426c9f', glow:'#b2e9ff'},
        LANCA_DRACO: {metal:'#bd6650', shine:'#ffbd86', core:'#63352c', glow:'#e67859'},
        LANCA_GUARDIAO: {metal:'#c5ab71', shine:'#fff0b9', core:'#675535', glow:'#ead18c'},
        LANCA_ETERNA: {metal:'#e5b96f', shine:'#fff3bd', core:'#75512e', glow:'#ffe18e'},
        LANCA_CELESTIAL: {metal:'#a9d3ed', shine:'#ffffff', core:'#527999', glow:'#bcf0ff'},
        LAMINA_ETERNA_1H: {metal:'#d5ba56', shine:'#fff1a1', core:'#775c24', glow:'#f2d66e'},
        ESCUDO_ETERNAL: {metal:'#dfc777', shine:'#fff4bd', core:'#8b6831', glow:'#ffdf83'},
        LAMINA_CELESTIAL_1H: {metal:'#b9e4ef', shine:'#ffffff', core:'#4d839c', glow:'#b8f4ff'},
        ESCUDO_CELESTIAL: {metal:'#bce5ec', shine:'#ffffff', core:'#477b91', glow:'#b3f6ff'}
    };

    function palette(key) { return palettes[key] || palettes.MACHADO_FORJA; }
    function outline(P, points, color) { facet(P, points, color || ink); }
    function gem(P, x, y, p, r=2) {
        disc(P,x,y,r+1,r+1,ink); disc(P,x,y,r,r,p.glow);
        P(x-1,y-r,2,1,p.shine); P(x-1,y,1,1,p.shine);
        if (r > 2) P(x+1,y+1,1,1,p.core);
    }
    function haft(P, x0, y0, x1, y1, p, width=4) {
        stroke(P,x0,y0,x1,y1,width+2,ink);
        stroke(P,x0,y0,x1,y1,width,p.core);
        stroke(P,x0-1,y0,x1-1,y1,1,p.metal);
    }

    function axeIcon(P, p, tier) {
        haft(P,7,28,22,7,p,4);
        outline(P,[[13,8],[12,3],[17,1],[22,4],[24,9],[21,15],[15,17],[10,14],[8,11]]);
        facet(P,[[14,8],[14,4],[18,3],[21,5],[22,9],[19,12],[15,13],[12,11]],p.metal);
        facet(P,[[15,6],[18,4],[20,5],[17,8]],p.shine);
        outline(P,[[20,7],[25,3],[29,5],[30,12],[27,17],[21,15],[19,11]]);
        facet(P,[[22,8],[26,5],[28,6],[28,12],[26,15],[22,13]],p.metal);
        P(27,7,1,5,p.shine); P(17,12,6,4,ink); P(18,13,4,2,p.core);
        gem(P,18,14,p,tier>=6?2:1);
        P(5,27,5,4,ink); P(6,27,3,2,p.core); P(6,28,2,1,p.shine);
    }

    function hammerIcon(P, p, tier) {
        haft(P,7,29,20,12,p,5);
        outline(P,[[5,5],[10,2],[23,2],[28,6],[29,14],[25,18],[9,18],[5,14]]);
        facet(P,[[8,6],[12,4],[22,4],[25,7],[25,13],[21,15],[10,14],[8,12]],p.metal);
        P(9,6,12,2,p.shine); P(24,7,2,6,p.core); P(11,11,12,2,p.core);
        if (tier>=6) { P(12,7,2,6,p.shine); P(17,6,2,8,p.shine); P(21,7,2,6,p.shine); }
        gem(P,17,10,p,tier>=7?3:2);
        P(5,27,5,4,ink); P(6,28,3,2,p.core); P(7,28,1,1,p.shine);
    }

    function bowIcon(P, p, tier, crossbow=false) {
        if (crossbow) {
            haft(P,8,28,22,8,p,4);
            stroke(P,4,7,16,4,5,ink); stroke(P,16,4,28,7,5,ink);
            stroke(P,4,7,16,4,3,p.core); stroke(P,16,4,28,7,3,p.core);
            stroke(P,4,7,16,11,1,p.shine); stroke(P,16,11,28,7,1,p.shine);
            stroke(P,8,11,24,5,2,p.metal); P(23,3,4,4,p.shine);
            P(12,18,8,5,ink); P(14,19,4,3,p.core); gem(P,16,20,p,2);
        } else {
            const pts=[[25,2],[20,4],[14,9],[10,16],[8,24],[11,30]];
            for(let i=0;i<pts.length-1;i++) {
                stroke(P,...pts[i],...pts[i+1],6,ink);
                stroke(P,...pts[i],...pts[i+1],4,p.core);
                stroke(P,pts[i][0]-1,pts[i][1],pts[i+1][0]-1,pts[i+1][1],1,p.metal);
            }
            stroke(P,25,2,11,30,1,p.shine);
            P(7,15,6,7,ink); P(8,16,4,5,p.metal); P(9,17,2,3,p.core);
            P(23,2,3,2,p.shine); P(10,29,3,2,p.shine);
            if (tier>=6) { gem(P,16,12,p,2); P(19,7,2,2,p.shine); P(12,21,2,2,p.shine); }
        }
        if (tier===7) { P(26,17,2,2,p.shine); P(5,21,2,2,p.shine); }
    }

    function spearIcon(P, p, tier) {
        haft(P,5,29,22,8,p,4);
        outline(P,[[18,10],[17,6],[22,0],[28,5],[27,11],[22,15]]);
        facet(P,[[20,9],[20,6],[23,2],[26,5],[25,9],[22,12]],p.metal);
        P(22,3,2,6,p.shine); P(19,11,4,2,p.core);
        P(9,22,4,3,ink); P(10,22,2,2,p.metal); P(6,28,4,3,ink);
        if (tier>=6) { P(13,18,2,2,p.shine); P(15,16,2,2,p.core); }
        gem(P,22,7,p,tier>=7?2:1);
    }

    function swordIcon(P, p, tier) {
        stroke(P,8,25,24,6,7,ink); stroke(P,8,25,24,6,4,p.metal);
        stroke(P,8,24,22,7,1,p.shine); P(24,4,3,3,p.shine);
        stroke(P,5,22,13,28,4,ink); stroke(P,5,22,13,28,2,p.glow);
        haft(P,7,27,4,31,p,3); gem(P,4,31,p,1);
        if (tier>=7) { P(13,18,2,2,p.shine); P(17,13,2,2,p.shine); }
    }

    function shieldIcon(P, p, tier) {
        outline(P,[[16,2],[27,6],[27,17],[23,25],[16,30],[9,25],[5,17],[5,6]]);
        facet(P,[[16,4],[25,8],[25,17],[22,23],[16,28],[10,23],[7,17],[7,8]],p.core);
        facet(P,[[16,6],[23,9],[22,16],[19,22],[16,25],[11,22],[9,16],[9,10]],p.metal);
        facet(P,[[10,10],[16,7],[16,16],[12,20],[9,16]],p.shine);
        facet(P,[[16,7],[22,10],[22,16],[19,21],[16,16]],p.core);
        stroke(P,10,13,22,18,3,ink); stroke(P,10,13,22,18,1,p.shine);
        stroke(P,22,13,10,18,3,ink); stroke(P,22,13,10,18,1,p.shine);
        gem(P,16,16,p,tier>=7?3:2);
        P(7,8,2,2,p.shine); P(23,8,2,2,p.shine);
    }

    function fragmentIcon(P, p) {
        outline(P,[[16,2],[21,9],[28,11],[23,16],[24,24],[17,21],[10,29],[11,19],[5,15],[12,12]]);
        facet(P,[[16,5],[19,10],[24,12],[20,15],[21,21],[16,19],[12,25],[13,18],[8,15],[13,13]],p.metal);
        facet(P,[[16,5],[16,18],[12,25],[13,17],[8,15],[13,13]],p.shine);
        P(17,9,2,4,'#fff0cc'); P(19,17,2,2,p.core); P(9,21,2,2,p.glow);
    }

    // World sprites use the same registration API as the established arm catalog.
    function axeWeapon(P,p,tier) {
        haft(P,2,39,2,8,p,5);
        outline(P,[[-1,10],[-9,4],[-12,8],[-11,20],[-6,24],[1,17]]);
        facet(P,[[-2,11],[-8,7],[-9,9],[-9,18],[-6,21],[0,16]],p.metal);
        P(-9,9,1,8,p.shine);
        outline(P,[[4,10],[11,4],[14,7],[13,18],[9,23],[3,17]]);
        facet(P,[[5,11],[10,7],[11,9],[11,17],[8,20],[4,16]],p.metal);
        P(10,9,1,8,p.shine); P(0,13,4,5,p.core); gem(P,2,15,p,tier>=7?2:1);
        P(0,37,4,3,ink); P(1,37,2,1,p.shine);
    }
    function hammerWeapon(P,p,tier) {
        haft(P,2,39,2,14,p,6);
        P(-10,3,24,13,ink); P(-8,5,20,9,p.metal); P(-8,5,15,2,p.shine);
        P(9,6,2,7,p.core); P(-5,10,12,2,p.core);
        P(-2,7,4,5,ink); P(-1,8,2,3,p.glow); gem(P,0,10,p,tier>=7?2:1);
        P(-1,37,6,3,ink); P(0,37,4,1,p.shine);
    }
    function bowWeapon(P,p,tier,crossbow=false) {
        haft(P,2,37,2,5,p,4);
        if (crossbow) {
            stroke(P,-12,13,1,8,5,ink); stroke(P,1,8,14,13,5,ink);
            stroke(P,-12,13,1,8,3,p.core); stroke(P,1,8,14,13,3,p.core);
            stroke(P,-12,13,2,18,1,p.shine); stroke(P,2,18,14,13,1,p.shine);
            P(-3,14,9,6,ink); P(-1,15,5,4,p.metal); gem(P,2,17,p,2);
            stroke(P,1,27,2,6,2,p.shine); P(0,4,4,4,p.metal);
        } else {
            const pts=[[5,1],[-2,6],[-6,16],[-6,27],[-1,38],[5,42]];
            for(let i=0;i<pts.length-1;i++) {
                stroke(P,...pts[i],...pts[i+1],5,ink);
                stroke(P,...pts[i],...pts[i+1],3,p.core);
                stroke(P,pts[i][0]-1,pts[i][1],pts[i+1][0]-1,pts[i+1][1],1,p.metal);
            }
            stroke(P,5,1,5,42,1,p.shine);
            P(-8,19,5,7,ink); P(-7,20,3,5,p.metal); gem(P,-6,22,p,tier>=6?2:1);
        }
        if(tier>=7) { P(-4,9,2,2,p.shine); P(8,31,2,2,p.shine); }
    }
    function spearWeapon(P,p,tier) {
        haft(P,2,41,2,7,p,4);
        outline(P,[[-3,9],[2,0],[7,9],[3,14],[-2,13]]);
        facet(P,[[-1,9],[2,3],[5,9],[2,12]],p.metal); P(1,3,2,6,p.shine);
        P(-3,13,10,2,p.core); P(-2,28,4,3,p.metal);
        if(tier>=6) gem(P,2,17,p,1);
        P(0,40,5,3,ink); P(1,40,3,1,p.shine);
    }
    function swordWeapon(P,p,tier) {
        outline(P,[[-2,29],[-1,22],[2,13],[5,4],[8,0],[9,10],[6,21],[3,30]]);
        facet(P,[[0,27],[1,22],[5,8],[7,4],[7,11],[4,22],[2,28]],p.metal);
        stroke(P,1,24,6,7,1,p.shine); P(7,2,2,3,p.shine);
        P(-5,27,14,4,ink); P(-3,28,10,2,p.glow); gem(P,2,29,p,1);
        P(1,31,5,8,ink); P(2,32,3,6,p.core); P(2,34,1,2,p.metal);
        P(1,38,5,3,ink); P(2,38,3,1,p.shine);
        if(tier>=7) { P(2,15,2,2,p.shine); P(4,10,2,2,p.glow); }
    }
    function shieldWorld(P,p,tier) {
        outline(P,[[-1,0],[8,1],[13,5],[12,13],[8,19],[4,22],[0,19],[-4,13],[-5,5]]);
        facet(P,[[0,2],[7,3],[10,6],[10,13],[7,17],[4,20],[1,17],[-2,13],[-2,6]],p.core);
        facet(P,[[0,4],[7,5],[8,7],[8,13],[5,17],[4,18],[1,16],[-1,13],[-1,7]],p.metal);
        facet(P,[[-1,6],[1,5],[1,14],[-1,12]],p.shine);
        stroke(P,-1,7,7,11,3,ink); stroke(P,-1,7,7,11,1,p.shine);
        stroke(P,7,7,-1,11,3,ink); stroke(P,7,7,-1,11,1,p.shine);
        gem(P,3,10,p,tier>=7?2:1);
    }

    const icons = {}, weapons = {}, shields = {};
    for (const [key, p] of Object.entries(palettes)) {
        const tier = ({FRAGMENTO_FORJA:4})[key] ||
            (/CATACLISMO|ETERNAL|ECLIPSE|ETERNA/.test(key) ? 6 :
                /ABISMO|CELESTIAL|ASTRAL/.test(key) ? 7 :
                    /RUINAS|COLOSSO|GUARDIAO/.test(key) ? 5 : 4);
        if (key === 'FRAGMENTO_FORJA') {
            icons[key] = P => fragmentIcon(P,p);
            continue;
        }
        let drawIcon;
        if (key.startsWith('MACHADO_')) drawIcon = P => axeIcon(P,p,tier);
        else if (key.startsWith('MARTELO_')) drawIcon = P => hammerIcon(P,p,tier);
        else if (key.startsWith('ARCO_')) drawIcon = P => bowIcon(P,p,tier,false);
        else if (key.startsWith('BESTA_')) drawIcon = P => bowIcon(P,p,tier,true);
        else if (key.startsWith('LANCA_')) drawIcon = P => spearIcon(P,p,tier);
        else if (key.startsWith('LAMINA_')) drawIcon = P => swordIcon(P,p,tier);
        else if (key.startsWith('ESCUDO_')) drawIcon = P => shieldIcon(P,p,tier);
        if (drawIcon) icons[key] = drawIcon;

        if (key.startsWith('MACHADO_')) weapons[key] = P => axeWeapon(P,p,tier);
        else if (key.startsWith('MARTELO_')) weapons[key] = P => hammerWeapon(P,p,tier);
        else if (key.startsWith('ARCO_')) weapons[key] = P => bowWeapon(P,p,tier,false);
        else if (key.startsWith('BESTA_')) weapons[key] = P => bowWeapon(P,p,tier,true);
        else if (key.startsWith('LANCA_')) weapons[key] = P => spearWeapon(P,p,tier);
        else if (key.startsWith('LAMINA_')) weapons[key] = P => swordWeapon(P,p,tier);
        else if (key.startsWith('ESCUDO_')) shields[key] = P => shieldWorld(P,p,tier);
    }
    art.register({ icons, weapons, shields });
}());
