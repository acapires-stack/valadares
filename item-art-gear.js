// Equipamentos e material raro em pixel art. Cada ícone usa grade lógica de 32 px.
(function () {
    'use strict';
    const art = window.ValadaresItemArt2D;
    if (!art?.register || !art.helpers) return;
    const { facet, stroke, disc } = art.helpers;
    if (!facet || !stroke || !disc) return;

    const C = {
        ink: '#17171a', brownDark: '#4d2d20', brown: '#794729', brownLight: '#aa7143',
        leather: '#875329', leatherLight: '#bc834c', ivoryDark: '#9b8d75',
        ivory: '#d8c9aa', ivoryLight: '#f5e8cb', steelDark: '#51545c',
        steel: '#9298a2', steelLight: '#d6d9df', white: '#f4f2ed',
        goldDark: '#735121', gold: '#bd8738', goldLight: '#f1d27d',
        rubyDark: '#671c29', ruby: '#b62e36', rubyLight: '#f07669',
        stoneDark: '#424953', stone: '#75808c', stoneLight: '#afb9c3',
        greenDark: '#264c36', green: '#4d925b', greenLight: '#a4d69c'
    };

    function tunic(P, color, shade, light) {
        facet(P, [[7, 4], [12, 2], [20, 2], [25, 4], [30, 10], [27, 16],
            [24, 16], [24, 27], [21, 30], [11, 30], [8, 27], [8, 16],
            [5, 16], [2, 10]], C.ink);
        facet(P, [[7, 6], [12, 4], [20, 4], [25, 6], [28, 10], [26, 14],
            [23, 13], [22, 27], [20, 28], [12, 28], [10, 27], [9, 13],
            [6, 14], [4, 10]], shade);
        facet(P, [[12, 5], [20, 5], [23, 9], [21, 26], [19, 28],
            [12, 28], [10, 25], [10, 9]], color);
        P(12, 5, 2, 21, light);
        P(20, 6, 2, 18, shade);
        P(11, 3, 10, 6, C.ink);
        P(13, 4, 6, 3, shade);
    }

    function leatherArmor(P) {
        tunic(P, C.leather, C.brownDark, C.leatherLight);
        P(4, 9, 5, 3, C.brown); P(23, 8, 5, 3, C.brown);
        P(7, 8, 2, 5, C.brownLight); P(24, 7, 2, 5, C.brownLight);
        P(15, 8, 2, 18, C.brownDark);
        P(16, 9, 1, 15, C.brownLight);
        P(10, 25, 13, 3, C.brownDark);
        P(11, 25, 11, 1, C.brownLight);
        P(14, 25, 4, 4, C.ink); P(15, 26, 2, 2, C.gold);
        for (const y of [10, 14, 18, 22]) {
            P(11, y, 1, 1, C.ivoryLight); P(20, y, 1, 1, C.ivoryLight);
        }
        P(19, 12, 2, 1, C.gold); P(19, 18, 2, 1, C.gold);
    }

    function plateArmor(P) {
        tunic(P, C.steel, C.steelDark, C.steelLight);
        facet(P, [[2, 9], [7, 4], [11, 5], [12, 11], [7, 15], [2, 14]], C.ink);
        facet(P, [[3, 9], [7, 6], [10, 7], [10, 11], [6, 13], [3, 12]], C.steel);
        P(4, 8, 4, 1, C.white);
        facet(P, [[21, 5], [25, 4], [30, 9], [30, 14], [25, 15], [20, 11]], C.ink);
        facet(P, [[22, 7], [25, 6], [29, 9], [28, 12], [25, 13], [22, 11]], C.steel);
        P(23, 7, 4, 1, C.white);
        facet(P, [[12, 8], [20, 8], [22, 12], [21, 22], [16, 26], [11, 22], [10, 12]], C.steelLight);
        facet(P, [[16, 9], [20, 9], [21, 13], [20, 22], [16, 25]], C.steel);
        P(15, 9, 2, 15, C.white); P(11, 21, 10, 2, C.steelDark);
        P(12, 23, 8, 1, C.white);
        P(10, 26, 13, 3, C.steelDark);
        P(11, 26, 11, 1, C.steelLight);
        P(14, 25, 4, 4, C.ink); P(15, 26, 2, 2, C.gold);
    }

    function throneArmor(P) {
        tunic(P, C.gold, C.goldDark, C.goldLight);
        facet(P, [[2, 10], [7, 3], [11, 5], [11, 12], [5, 17], [2, 14]], C.ink);
        facet(P, [[3, 10], [7, 5], [10, 6], [10, 11], [5, 14]], C.gold);
        facet(P, [[21, 5], [25, 3], [30, 10], [30, 14], [27, 17], [21, 12]], C.ink);
        facet(P, [[22, 6], [25, 5], [29, 10], [27, 14], [22, 11]], C.gold);
        P(5, 8, 3, 1, C.goldLight); P(24, 7, 3, 1, C.goldLight);
        facet(P, [[11, 9], [16, 7], [21, 9], [22, 22], [16, 27], [10, 22]], C.goldDark);
        facet(P, [[12, 10], [16, 8], [20, 10], [21, 21], [16, 25], [11, 21]], C.gold);
        P(14, 9, 4, 14, C.goldLight);
        P(10, 15, 12, 3, C.goldLight);
        facet(P, [[16, 12], [19, 15], [18, 19], [16, 21], [14, 19], [13, 15]], C.ink);
        facet(P, [[16, 13], [18, 16], [16, 20], [14, 16]], C.ruby);
        P(15, 15, 1, 2, C.rubyLight);
        P(9, 25, 14, 3, C.goldDark);
        P(10, 25, 12, 1, C.goldLight);
        P(14, 25, 4, 4, C.ink); P(15, 26, 2, 2, C.ruby);
    }

    function helmetShell(P) {
        facet(P, [[6, 11], [9, 5], [14, 3], [19, 3], [24, 6], [27, 12],
            [26, 22], [21, 27], [11, 27], [6, 21]], C.ink);
        facet(P, [[8, 11], [10, 7], [14, 5], [19, 5], [23, 8], [25, 13],
            [24, 21], [20, 25], [12, 25], [8, 20]], C.steelDark);
        facet(P, [[9, 11], [13, 6], [17, 5], [21, 7], [24, 12],
            [23, 16], [10, 16]], C.steel);
        P(13, 7, 6, 2, C.steelLight);
        P(15, 5, 2, 11, C.white);
        P(7, 16, 18, 4, C.ink);
        P(9, 17, 14, 2, C.steelDark);
        P(7, 19, 4, 6, C.steel); P(21, 19, 4, 6, C.steel);
        P(8, 20, 1, 3, C.white); P(23, 20, 1, 3, C.white);
        P(12, 20, 8, 3, C.ink); P(13, 20, 2, 1, C.steelLight);
        P(17, 20, 2, 1, C.steelLight);
    }

    function hornedHelmet(P) {
        // Os chifres em marfim saem lateralmente do casco de aço.
        facet(P, [[7, 13], [3, 9], [2, 3], [5, 7], [11, 9]], C.ink);
        facet(P, [[7, 12], [4, 8], [3, 4], [6, 8], [9, 9]], C.ivory);
        P(3, 5, 1, 2, C.ivoryLight);
        facet(P, [[25, 13], [29, 9], [30, 3], [27, 7], [21, 9]], C.ink);
        facet(P, [[25, 12], [28, 8], [29, 4], [26, 8], [23, 9]], C.ivory);
        P(28, 5, 1, 2, C.ivoryLight);
        helmetShell(P);
        P(9, 9, 3, 3, C.ivoryDark); P(20, 9, 3, 3, C.ivoryDark);
        P(10, 9, 2, 1, C.ivoryLight); P(20, 9, 2, 1, C.ivoryLight);
    }

    function sellerCrown(P) {
        // Cinco pontas longas, gemas violetas e espinhos negros laterais.
        facet(P, [[2, 5], [7, 11], [7, 23], [25, 23], [25, 11], [30, 5],
            [27, 19], [30, 23], [28, 28], [4, 28], [2, 23], [5, 19]], C.ink);
        facet(P, [[4, 10], [9, 14], [9, 22], [23, 22], [23, 14], [28, 10],
            [26, 21], [28, 25], [26, 27], [6, 27], [4, 25], [6, 21]], C.goldDark);
        facet(P, [[6, 10], [9, 13], [12, 7], [14, 15], [16, 2], [18, 15],
            [20, 7], [23, 13], [26, 10], [24, 23], [8, 23]], C.ink);
        facet(P, [[8, 12], [10, 14], [12, 9], [15, 17], [16, 4], [17, 17],
            [20, 9], [22, 14], [24, 12], [23, 22], [9, 22]], C.gold);
        P(15, 5, 1, 13, C.goldLight);
        P(8, 21, 16, 5, C.gold);
        P(8, 21, 16, 1, C.goldLight);
        P(10, 24, 12, 1, C.goldLight);
        P(15, 17, 3, 5, C.ink); P(16, 18, 1, 3, C.rubyLight);
        for (const x of [10, 21]) {
            P(x, 19, 2, 3, C.ink); P(x, 19, 1, 2, '#9c59c6');
        }
        P(5, 25, 2, 2, C.ink); P(25, 25, 2, 2, C.ink);
    }

    function boots(P, style) {
        const tall = style === 'leather';
        const swift = style === 'swift';
        const dark = swift ? C.greenDark : tall ? '#3f281c' : C.brownDark;
        const mid = swift ? C.green : tall ? '#634027' : C.brown;
        const light = swift ? C.greenLight : tall ? C.leatherLight : C.brownLight;
        const top = tall ? 3 : swift ? 12 : 10;
        for (const x of [3, 17]) {
            facet(P, [[x + 2, top], [x + 10, top], [x + 10, 22],
                [x + 12, 23], [x + 12, 28], [x, 28], [x, 24], [x + 2, 21]], C.ink);
            P(x + 3, top + 2, 6, 20 - top, mid);
            P(x + 4, top + 2, 2, 18 - top, light);
            P(x + 8, top + 2, 1, 19 - top, dark);
            P(x + 1, 23, 10, 3, mid);
            P(x + 1, 26, 11, 2, dark);
            P(x + 2, 25, 8, 1, light);
        }
        if (tall) {
            for (const x of [3, 17]) {
                P(x + 1, 4, 10, 4, C.ink);
                P(x + 2, 5, 8, 2, C.leatherLight);
                P(x + 4, 10, 1, 11, C.brownDark);
                for (const y of [11, 15, 19]) P(x + 4, y, 2, 1, C.ivory);
                P(x + 3, 21, 7, 2, C.brownDark);
            }
        } else if (swift) {
            for (const x of [3, 17]) {
                P(x + 2, 13, 8, 2, C.greenLight);
                P(x + 3, 18, 5, 1, C.ivoryLight);
                P(x + 11, 16, 2, 2, C.ink);
                P(x + 11, 16, 1, 1, C.greenLight);
                P(x + 1, 27, 11, 1, C.ink);
            }
        } else {
            for (const x of [3, 17]) {
                P(x + 2, 11, 8, 2, C.brownLight);
                P(x + 6, 16, 2, 5, C.brownDark);
                P(x + 6, 19, 2, 1, C.gold);
            }
        }
    }

    function boneShield(P) {
        facet(P, [[16, 1], [28, 5], [28, 17], [24, 25], [16, 31],
            [8, 25], [4, 17], [4, 5]], C.ink);
        facet(P, [[16, 3], [26, 6], [26, 17], [22, 24], [16, 29],
            [10, 24], [6, 17], [6, 6]], C.ivoryDark);
        facet(P, [[16, 5], [24, 8], [24, 17], [20, 23], [16, 27],
            [12, 23], [8, 17], [8, 8]], C.brownDark);
        facet(P, [[16, 6], [22, 9], [22, 16], [19, 22], [16, 25],
            [13, 22], [10, 16], [10, 9]], '#68442f');
        P(14, 5, 4, 19, C.ivory); P(15, 5, 2, 18, C.ivoryLight);
        stroke(P, 9, 12, 23, 18, 5, C.ink);
        stroke(P, 9, 12, 23, 18, 3, C.ivory);
        stroke(P, 23, 12, 9, 18, 5, C.ink);
        stroke(P, 23, 12, 9, 18, 3, C.ivoryLight);
        disc(P, 16, 15, 3, 3, C.ink);
        disc(P, 16, 15, 2, 2, C.ivoryLight);
        P(15, 14, 1, 1, C.white);
        P(7, 8, 2, 5, C.ivoryLight); P(23, 8, 2, 4, C.ivoryLight);
    }

    function stoneShield(P) {
        facet(P, [[16, 1], [28, 5], [29, 18], [24, 26], [16, 31],
            [8, 26], [3, 18], [4, 5]], C.ink);
        facet(P, [[16, 3], [26, 7], [27, 18], [22, 25], [16, 29],
            [10, 25], [5, 18], [6, 7]], C.stoneDark);
        facet(P, [[16, 5], [25, 8], [24, 17], [20, 24], [16, 26],
            [10, 23], [7, 16], [8, 8]], C.stone);
        facet(P, [[8, 8], [16, 5], [16, 15], [11, 18], [7, 16]], C.stoneLight);
        facet(P, [[16, 5], [25, 8], [24, 17], [18, 14]], '#56616d');
        facet(P, [[11, 18], [16, 15], [18, 14], [23, 18], [20, 24], [16, 26]], '#89929d');
        stroke(P, 16, 5, 16, 14, 1, C.white);
        stroke(P, 16, 15, 11, 18, 1, C.stoneDark);
        stroke(P, 17, 15, 23, 18, 1, C.stoneLight);
        P(8, 9, 2, 5, C.white);
        P(11, 24, 2, 1, C.stoneLight);
        P(21, 19, 1, 4, C.stoneDark);
    }

    function heart(P) {
        // Corrente ouro ao redor de um rubi lapidado em forma de coração.
        stroke(P, 7, 7, 11, 3, 2, C.goldDark);
        stroke(P, 11, 3, 21, 3, 2, C.gold);
        stroke(P, 21, 3, 25, 7, 2, C.goldDark);
        for (const x of [7, 12, 18, 23]) P(x, x === 7 || x === 23 ? 6 : 2, 2, 1, C.goldLight);
        facet(P, [[16, 11], [12, 7], [7, 8], [4, 13], [5, 19],
            [16, 30], [27, 19], [28, 13], [25, 8], [20, 7]], C.ink);
        facet(P, [[16, 13], [12, 9], [8, 10], [6, 13], [7, 18],
            [16, 28], [25, 18], [26, 13], [24, 10], [20, 9]], C.rubyDark);
        facet(P, [[8, 11], [12, 9], [16, 14], [19, 9], [24, 11],
            [25, 16], [16, 27], [7, 16]], C.ruby);
        facet(P, [[8, 11], [12, 9], [15, 13], [14, 20], [7, 16]], C.rubyLight);
        facet(P, [[19, 10], [24, 11], [25, 16], [16, 27], [18, 18]], '#8a1e31');
        P(9, 11, 3, 2, '#ffb092'); P(10, 14, 1, 2, C.rubyLight);
        P(16, 26, 2, 1, C.rubyLight);
        P(14, 7, 4, 2, C.goldDark); P(15, 7, 2, 1, C.goldLight);
    }

    function equippedBone(P) {
        facet(P, [[7, 0], [14, 3], [14, 12], [11, 17], [7, 20],
            [3, 17], [0, 12], [0, 3]], C.ink);
        facet(P, [[7, 2], [12, 4], [12, 12], [10, 16], [7, 18],
            [4, 16], [2, 12], [2, 4]], C.ivory);
        facet(P, [[7, 4], [10, 5], [10, 13], [7, 16], [4, 13], [4, 5]], C.brownDark);
        P(6, 3, 2, 13, C.ivoryLight);
        P(3, 9, 8, 2, C.ivory);
        P(4, 7, 1, 1, C.ivoryLight); P(10, 12, 1, 1, C.ivoryLight);
        P(6, 8, 3, 4, C.ink); P(7, 9, 2, 2, C.ivoryLight);
    }

    function equippedStone(P) {
        facet(P, [[7, 0], [14, 3], [15, 12], [11, 18], [7, 20],
            [3, 18], [0, 12], [1, 3]], C.ink);
        facet(P, [[7, 2], [12, 4], [13, 12], [10, 17], [7, 18],
            [4, 17], [2, 12], [3, 4]], C.stoneDark);
        facet(P, [[7, 3], [11, 5], [11, 13], [7, 17], [4, 13], [4, 5]], C.stone);
        facet(P, [[4, 5], [7, 3], [7, 10], [4, 13]], C.stoneLight);
        facet(P, [[7, 10], [11, 7], [11, 13], [7, 17], [4, 13]], '#596571');
        P(6, 3, 1, 6, C.white); P(10, 14, 1, 2, C.stoneLight);
    }

    art.register({
        icons: {
            COURO: leatherArmor,
            ARMADURA: plateArmor,
            ARMADURA_TRONO: throneArmor,
            ELMO: helmetShell,
            ELMO_CHIFRES: hornedHelmet,
            COROA_VENDEDOR: sellerCrown,
            BOTAS: P => boots(P, 'basic'),
            BOTAS_COURO: P => boots(P, 'leather'),
            BOTAS_RAPIDA: P => boots(P, 'swift'),
            ESCUDO_OSSO: boneShield,
            ESCUDO_PEDRA: stoneShield,
            CORACAO_HL: heart
        },
        shields: {
            ESCUDO_OSSO: equippedBone,
            ESCUDO_PEDRA: equippedStone
        }
    });
}());
