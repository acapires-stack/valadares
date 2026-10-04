// Ícones e equipamento 2D em pixel art, desenhados diretamente no Canvas.
// A grade lógica de 24 px acompanha a prancha de personagem e itens.
(function () {
    'use strict';

    const OUT = '#17171a';
    const STEEL_DARK = '#51545c';
    const STEEL = '#9298a2';
    const STEEL_LIGHT = '#d6d9df';
    const STEEL_WHITE = '#f4f2ed';
    const WOOD_DARK = '#56341f';
    const WOOD = '#86532e';
    const WOOD_LIGHT = '#b27a48';
    const GOLD_DARK = '#735121';
    const GOLD = '#bd8738';
    const GOLD_LIGHT = '#e1b76b';

    function baseKey(key) {
        const base = typeof key === 'string' ? key.split('~')[0].replace(/_PLUS_\d+$/, '') : '';
        return base === 'ESSENCIA_ARCANA' ? 'ESSENCIA' : base;
    }

    function pixel(ctx, x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    }

    // Coordenadas inteiras ficam nítidas mesmo em ícones de 20 px no chão.
    function iconPixel(ctx, size, grid = 24) {
        return function (x, y, w, h, color) {
            const x0 = Math.round(x * size / grid);
            const y0 = Math.round(y * size / grid);
            const x1 = Math.round((x + w) * size / grid);
            const y1 = Math.round((y + h) * size / grid);
            if (x1 > x0 && y1 > y0) pixel(ctx, x0, y0, x1 - x0, y1 - y0, color);
        };
    }

    function disc(P, cx, cy, rx, ry, color) {
        for (let y = -ry; y <= ry; y++) {
            const span = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.35)) ** 2)));
            P(cx - span, cy + y, span * 2 + 1, 1, color);
        }
    }

    function swordIcon(P) {
        // Lâmina diagonal prateada com ponta facetada e fio claro.
        for (let i = 0; i < 13; i++) {
            const x = 7 + i, y = 16 - i;
            P(x - 1, y - 1, 5, 4, OUT);
        }
        // Todos os contornos vêm primeiro, para o segmento seguinte não apagar o fio.
        for (let i = 0; i < 13; i++) {
            const x = 7 + i, y = 16 - i;
            P(x, y, 3, 2, STEEL_DARK);
            P(x, y, 2, 1, STEEL_LIGHT);
            P(x + 1, y + 1, 1, 1, STEEL);
        }
        P(19, 2, 3, 2, OUT);
        P(19, 3, 2, 1, STEEL_WHITE);
        P(18, 4, 1, 1, STEEL_WHITE);
        // Guarda cruza a lâmina; cabo escuro e pomo dourado.
        P(4, 14, 2, 2, OUT); P(5, 15, 2, 2, GOLD);
        P(6, 16, 2, 2, GOLD_LIGHT); P(7, 17, 2, 2, GOLD);
        P(8, 18, 2, 2, GOLD_DARK);
        P(3, 18, 5, 5, OUT);
        P(4, 18, 3, 3, WOOD_DARK);
        P(4, 19, 1, 1, WOOD_LIGHT);
        P(3, 21, 3, 2, GOLD_DARK);
        P(3, 21, 2, 1, GOLD_LIGHT);
    }

    function shieldIcon(P, iron) {
        disc(P, 12, 12, 10, 10, OUT);
        disc(P, 12, 12, 9, 9, STEEL_DARK);
        disc(P, 12, 12, 8, 8, STEEL_LIGHT);
        disc(P, 12, 12, 7, 7, iron ? '#68717d' : WOOD_DARK);
        if (iron) {
            disc(P, 11, 11, 5, 5, '#87929e');
            P(11, 6, 2, 12, STEEL_LIGHT);
            P(6, 11, 12, 2, STEEL_LIGHT);
            P(12, 7, 1, 10, STEEL_WHITE);
            P(7, 12, 10, 1, STEEL_WHITE);
            P(16, 9, 1, 6, STEEL_DARK);
        } else {
            P(8, 6, 2, 12, WOOD);
            P(10, 5, 3, 14, WOOD_LIGHT);
            P(13, 5, 3, 14, WOOD);
            P(16, 7, 1, 10, WOOD_LIGHT);
            P(9, 7, 1, 10, WOOD_DARK);
            P(13, 6, 1, 12, WOOD_DARK);
            P(7, 10, 11, 1, '#9a6336');
            P(8, 15, 9, 1, WOOD_DARK);
        }
        // Aro com pontos de luz, rebites e botão central convexo.
        P(6, 5, 3, 1, STEEL_WHITE);
        P(14, 3, 3, 1, STEEL_WHITE);
        P(3, 10, 1, 4, STEEL_LIGHT);
        P(17, 16, 2, 1, STEEL_DARK);
        P(11, 3, 2, 1, STEEL_DARK);
        P(4, 12, 1, 1, STEEL_WHITE);
        P(19, 12, 1, 1, STEEL_WHITE);
        disc(P, 12, 12, 3, 3, OUT);
        disc(P, 12, 12, 2, 2, STEEL);
        P(11, 10, 2, 1, STEEL_WHITE);
        P(14, 13, 1, 2, STEEL_DARK);
    }

    function potionIcon(P, mana) {
        const dark = mana ? '#174080' : '#761820';
        const liquid = mana ? '#2373d5' : '#c9182a';
        const light = mana ? '#54a7f5' : '#f4424c';
        // Garrafa arredondada, vidro cinza e rolha de cortiça.
        P(9, 2, 6, 3, OUT);
        P(10, 2, 4, 2, WOOD_DARK);
        P(10, 2, 3, 1, WOOD_LIGHT);
        P(8, 5, 8, 3, OUT);
        P(9, 5, 6, 2, STEEL_LIGHT);
        P(7, 7, 10, 2, OUT);
        P(8, 7, 8, 1, STEEL);
        const shell = [
            [7, 17], [6, 18], [5, 19], [4, 20], [4, 20],
            [4, 20], [4, 20], [5, 19], [5, 19], [6, 18], [7, 17]
        ];
        shell.forEach(([a, b], i) => {
            const y = i + 9;
            P(a, y, b - a + 1, 1, OUT);
            P(a + 1, y, b - a - 1, 1, STEEL);
            if (y >= 11 && y <= 18) {
                P(a + 2, y, b - a - 3, 1, liquid);
                P(b - 3, y, 2, 1, dark);
            }
        });
        P(8, 10, 8, 1, light);
        P(7, 12, 2, 4, light);
        P(8, 11, 1, 2, STEEL_WHITE);
        P(9, 10, 1, 1, STEEL_WHITE);
        P(14, 18, 2, 1, dark);
        P(8, 20, 8, 1, STEEL_DARK);
    }

    // Primitivas em grade 32: polígonos e linhas deixam facetas nítidas em 20/24 px.
    function facet(P, points, color) {
        const ys = points.map(p => p[1]);
        for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
            const hits = [];
            for (let i = 0; i < points.length; i++) {
                const a = points[i], b = points[(i + 1) % points.length];
                if ((a[1] <= y + .5 && b[1] > y + .5) || (b[1] <= y + .5 && a[1] > y + .5))
                    hits.push(a[0] + (y + .5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
            }
            hits.sort((a, b) => a - b);
            for (let i = 0; i + 1 < hits.length; i += 2) {
                const left = Math.ceil(hits[i]), right = Math.ceil(hits[i + 1]);
                if (right > left) P(left, y, right - left, 1, color);
            }
        }
    }

    function stroke(P, x0, y0, x1, y1, width, color) {
        let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        while (true) {
            P(x0 - Math.floor(width / 2), y0 - Math.floor(width / 2), width, width, color);
            if (x0 === x1 && y0 === y1) break;
            const e = 2 * err;
            if (e > -dy) { err -= dy; x0 += sx; }
            if (e < dx) { err += dx; y0 += sy; }
        }
    }

    const BONE = '#d8c9aa', BONE_LIGHT = '#f5e8cb';
    const RED_DARK = '#672625', RED = '#b83c32', RED_LIGHT = '#e46b4a';
    const BLUE_DARK = '#243b59', BLUE = '#355d87', BLUE_LIGHT = '#82c5e5';

    function bowIcon(P) {
        const knots = [[26, 2], [21, 5], [12, 9], [9, 13], [8, 17], [6, 22], [4, 29], [7, 29]];
        for (let i = 0; i + 1 < knots.length; i++) {
            stroke(P, ...knots[i], ...knots[i + 1], 5, OUT);
            stroke(P, ...knots[i], ...knots[i + 1], 3, WOOD);
        }
        stroke(P, 24, 3, 11, 24, 2, BONE_LIGHT);
        stroke(P, 11, 24, 5, 29, 2, BONE_LIGHT);
        stroke(P, 20, 6, 12, 10, 1, WOOD_LIGHT);
        stroke(P, 7, 22, 5, 27, 1, WOOD_LIGHT);
        P(7, 15, 5, 5, OUT); P(8, 15, 3, 5, WOOD_DARK);
        P(9, 16, 2, 1, GOLD_LIGHT); P(7, 19, 3, 1, GOLD);
        P(24, 2, 3, 2, GOLD_DARK); P(4, 28, 3, 2, GOLD_DARK);
    }

    function axeIcon(P) {
        stroke(P, 6, 27, 21, 9, 7, OUT);
        stroke(P, 6, 27, 21, 9, 5, WOOD_DARK);
        stroke(P, 7, 25, 19, 11, 2, WOOD_LIGHT);
        facet(P, [[13, 5], [19, 2], [24, 5], [22, 13], [15, 15], [8, 18], [9, 10]], OUT);
        facet(P, [[14, 5], [19, 3], [23, 6], [21, 12], [14, 13], [10, 16], [11, 10]], STEEL);
        facet(P, [[13, 6], [18, 4], [20, 5], [15, 9], [10, 14]], STEEL_LIGHT);
        facet(P, [[20, 12], [25, 9], [30, 10], [30, 19], [26, 22], [19, 18]], OUT);
        facet(P, [[21, 13], [26, 11], [29, 11], [28, 18], [26, 20], [20, 17]], STEEL);
        facet(P, [[27, 11], [29, 11], [29, 18], [27, 19]], STEEL_LIGHT);
        P(16, 13, 7, 7, OUT); P(17, 14, 5, 5, GOLD_DARK);
        P(18, 15, 3, 3, GOLD); P(19, 15, 1, 1, GOLD_LIGHT);
        stroke(P, 8, 23, 11, 20, 2, GOLD_LIGHT);
        P(3, 27, 6, 3, OUT); P(4, 27, 4, 2, GOLD);
    }

    function hammerIcon(P) {
        stroke(P, 6, 28, 18, 12, 7, OUT);
        stroke(P, 6, 28, 18, 12, 5, WOOD_DARK);
        stroke(P, 7, 26, 17, 13, 2, WOOD_LIGHT);
        facet(P, [[7, 5], [17, 2], [24, 6], [29, 14], [25, 21], [16, 21], [8, 16], [4, 11]], OUT);
        facet(P, [[8, 6], [16, 4], [22, 7], [25, 12], [20, 16], [12, 13], [6, 10]], STEEL_DARK);
        facet(P, [[22, 8], [28, 14], [25, 20], [17, 19], [17, 14]], '#777986');
        facet(P, [[9, 6], [15, 5], [19, 7], [13, 9], [7, 9]], STEEL);
        stroke(P, 14, 6, 10, 11, 1, STEEL_LIGHT);
        stroke(P, 21, 10, 25, 15, 1, STEEL_LIGHT);
        P(15, 17, 4, 4, OUT); P(16, 17, 2, 3, GOLD_DARK);
        P(5, 25, 4, 3, GOLD_DARK); P(4, 27, 5, 3, OUT); P(5, 27, 3, 2, GOLD);
    }

    function staffIcon(P) {
        stroke(P, 5, 29, 17, 11, 5, OUT);
        stroke(P, 5, 29, 17, 11, 3, WOOD_DARK);
        stroke(P, 5, 27, 15, 13, 1, WOOD_LIGHT);
        // Aro aberto de ouro em volta da chama.
        stroke(P, 15, 13, 17, 7, 4, OUT); stroke(P, 15, 13, 17, 7, 2, GOLD);
        stroke(P, 17, 7, 23, 5, 4, OUT); stroke(P, 17, 7, 23, 5, 2, GOLD_LIGHT);
        stroke(P, 23, 5, 27, 11, 4, OUT); stroke(P, 23, 5, 27, 11, 2, GOLD);
        stroke(P, 27, 11, 23, 17, 4, OUT); stroke(P, 27, 11, 23, 17, 2, GOLD);
        facet(P, [[21, 16], [17, 13], [18, 8], [21, 5], [21, 1], [26, 6], [28, 3], [29, 11], [26, 17]], '#9a291b');
        facet(P, [[21, 15], [19, 12], [21, 8], [22, 5], [25, 10], [27, 7], [27, 13], [24, 16]], '#f36b24');
        facet(P, [[22, 14], [21, 11], [23, 8], [25, 11], [25, 14]], '#ffd36a');
        P(13, 18, 5, 3, OUT); P(14, 18, 3, 2, GOLD); P(6, 24, 4, 2, GOLD_DARK);
    }

    function boneArmorIcon(P) {
        facet(P, [[7, 4], [13, 2], [19, 2], [25, 4], [29, 11], [25, 16], [25, 25], [20, 30], [11, 30], [6, 25], [6, 16], [3, 12]], OUT);
        facet(P, [[7, 6], [13, 4], [19, 4], [25, 6], [27, 12], [23, 16], [23, 25], [19, 28], [12, 28], [8, 25], [8, 16], [5, 12]], WOOD_DARK);
        facet(P, [[3, 10], [6, 5], [10, 5], [12, 11], [9, 17], [3, 16]], BONE);
        facet(P, [[22, 5], [26, 5], [29, 10], [29, 16], [23, 17], [20, 11]], BONE);
        P(4, 9, 4, 2, BONE_LIGHT); P(24, 7, 3, 2, BONE_LIGHT);
        facet(P, [[12, 5], [20, 5], [23, 13], [21, 23], [17, 26], [11, 23], [9, 13]], BONE);
        P(15, 5, 2, 19, OUT); P(15, 6, 1, 16, BONE_LIGHT);
        for (const y of [10, 14, 18, 22]) {
            stroke(P, 10, y, 14, y + 2, 2, WOOD_DARK);
            stroke(P, 18, y + 2, 22, y, 2, WOOD_DARK);
            P(10, y - 1, 3, 1, BONE_LIGHT); P(20, y - 1, 3, 1, BONE_LIGHT);
        }
        P(8, 24, 16, 4, OUT); P(9, 25, 14, 2, WOOD);
        P(14, 24, 5, 5, OUT); P(15, 25, 3, 3, GOLD); P(16, 25, 1, 1, GOLD_LIGHT);
    }

    function scaleArmorIcon(P) {
        facet(P, [[7, 3], [13, 2], [19, 2], [25, 4], [29, 10], [27, 16], [24, 18], [25, 27], [19, 30], [12, 30], [7, 27], [8, 18], [4, 16], [3, 10]], OUT);
        facet(P, [[8, 5], [13, 4], [20, 4], [24, 6], [27, 11], [24, 17], [23, 27], [19, 28], [12, 28], [9, 26], [8, 17], [5, 11]], WOOD_DARK);
        P(11, 3, 11, 6, WOOD_DARK); P(13, 4, 7, 3, OUT);
        for (let row = 0; row < 4; row++) {
            const y = 8 + row * 4, shift = row % 2 ? 2 : 0;
            for (let col = 0; col < 3; col++) {
                const x = 7 + col * 6 + shift;
                facet(P, [[x, y], [x + 4, y], [x + 5, y + 2], [x + 2, y + 5], [x - 1, y + 2]], RED_DARK);
                P(x, y, 4, 2, RED); P(x + 1, y, 2, 1, RED_LIGHT);
            }
        }
        facet(P, [[3, 9], [7, 6], [10, 8], [8, 14], [4, 15]], RED);
        facet(P, [[22, 8], [25, 6], [29, 10], [28, 15], [24, 14]], RED);
        P(8, 24, 16, 4, OUT); P(9, 25, 14, 2, WOOD);
        P(14, 24, 5, 5, OUT); P(15, 25, 3, 3, GOLD); P(16, 25, 1, 1, GOLD_LIGHT);
    }

    function dracoHelmIcon(P) {
        facet(P, [[9, 7], [7, 3], [3, 2], [3, 8], [6, 13], [10, 12]], OUT);
        facet(P, [[10, 8], [8, 4], [5, 3], [5, 8], [7, 11]], STEEL_DARK);
        facet(P, [[22, 7], [24, 3], [29, 2], [29, 8], [26, 13], [22, 12]], OUT);
        facet(P, [[22, 8], [25, 4], [27, 3], [27, 8], [25, 11]], STEEL_DARK);
        facet(P, [[8, 10], [13, 5], [19, 5], [24, 10], [27, 22], [23, 29], [19, 30], [17, 24], [15, 24], [13, 30], [9, 29], [5, 22]], OUT);
        facet(P, [[9, 11], [13, 7], [19, 7], [23, 11], [25, 22], [22, 27], [19, 27], [17, 22], [15, 22], [13, 27], [10, 27], [7, 22]], RED_DARK);
        facet(P, [[13, 8], [19, 8], [21, 17], [16, 22], [11, 17]], RED);
        P(15, 7, 2, 14, RED_LIGHT); P(8, 16, 4, 6, RED); P(21, 16, 4, 6, RED);
        facet(P, [[8, 17], [15, 19], [15, 22], [12, 22], [8, 20]], GOLD);
        facet(P, [[24, 17], [17, 19], [17, 22], [20, 22], [24, 20]], GOLD);
        P(10, 21, 5, 5, OUT); P(17, 21, 5, 5, OUT);
        P(9, 22, 2, 5, GOLD_DARK); P(21, 22, 2, 5, GOLD_DARK);
    }

    function windBootsIcon(P) {
        for (const x of [2, 17]) {
            facet(P, [[x + 5, 4], [x + 13, 4], [x + 12, 20], [x + 14, 25], [x + 13, 29], [x, 29], [x, 25], [x + 5, 22]], OUT);
            facet(P, [[x + 6, 7], [x + 11, 7], [x + 10, 22], [x + 12, 26], [x + 11, 27], [x + 2, 27], [x + 2, 25], [x + 6, 22]], WOOD);
            P(x + 4, 4, 10, 4, BLUE_DARK); P(x + 5, 4, 8, 2, BLUE_LIGHT);
            P(x + 2, 25, 10, 3, WOOD_DARK); P(x + 5, 22, 3, 2, GOLD);
            P(x + 1, 29, 14, 2, OUT);
            facet(P, [[x + 11, 10], [x + 14, 10], [x + 14, 14], [x + 12, 16], [x + 15, 16], [x + 13, 20], [x + 10, 18]], BLUE_LIGHT);
            P(x + 11, 11, 2, 3, STEEL_WHITE);
        }
    }

    function namedSwordIcon(P, eternal) {
        // Cabo, guarda e lâmina em diagonal; pedras distinguem as duas raridades.
        stroke(P, 4, 28, 12, 20, 6, OUT);
        stroke(P, 4, 28, 12, 20, 4, WOOD_DARK);
        stroke(P, 5, 27, 10, 22, 1, WOOD_LIGHT);
        facet(P, eternal ? [[12, 20], [25, 3], [30, 1], [28, 7], [16, 22]] : [[11, 20], [23, 4], [30, 1], [29, 7], [16, 23]], OUT);
        facet(P, eternal ? [[14, 20], [25, 5], [28, 3], [27, 7], [16, 21]] : [[13, 20], [24, 5], [28, 3], [27, 7], [16, 21]], eternal ? BLUE : STEEL);
        facet(P, [[14, 19], [24, 5], [28, 3], [27, 5], [16, 20]], STEEL_LIGHT);
        stroke(P, 16, 18, 27, 5, 1, STEEL_WHITE);
        if (eternal) stroke(P, 17, 18, 25, 8, 1, GOLD_LIGHT);
        stroke(P, 7, 18, 14, 25, 5, OUT);
        stroke(P, 7, 18, 14, 25, 3, GOLD);
        P(5, 17, 3, 3, GOLD_LIGHT); P(13, 24, 3, 3, GOLD_LIGHT);
        if (eternal) {
            // Guarda alada: a mítica mantém uma silhueta própria, além da gema azul.
            stroke(P, 5, 18, 5, 14, 3, OUT); stroke(P, 5, 18, 5, 14, 1, GOLD_LIGHT);
            stroke(P, 15, 25, 19, 25, 3, OUT); stroke(P, 15, 25, 19, 25, 1, GOLD_LIGHT);
        }
        P(10, 20, 5, 5, OUT); P(11, 21, 3, 3, eternal ? '#1782ba' : '#a72127');
        P(11, 21, 1, 1, eternal ? BLUE_LIGHT : '#ff8070');
        P(1, 27, 6, 4, OUT); P(2, 28, 4, 2, GOLD);
    }

    function guardianShieldIcon(P) {
        facet(P, [[16, 2], [29, 6], [29, 19], [24, 27], [16, 31], [8, 27], [3, 19], [3, 6]], OUT);
        facet(P, [[16, 4], [27, 7], [27, 18], [23, 25], [16, 29], [9, 25], [5, 18], [5, 7]], GOLD_DARK);
        facet(P, [[16, 6], [25, 9], [25, 18], [21, 24], [16, 27], [11, 24], [7, 18], [7, 9]], GOLD_LIGHT);
        facet(P, [[16, 8], [23, 10], [23, 18], [20, 23], [16, 25], [12, 23], [9, 18], [9, 10]], BLUE_DARK);
        P(15, 9, 2, 14, GOLD); P(10, 15, 12, 2, GOLD);
        stroke(P, 16, 10, 16, 22, 1, GOLD_LIGHT);
        stroke(P, 11, 16, 21, 16, 1, GOLD_LIGHT);
        stroke(P, 12, 12, 20, 20, 1, GOLD);
        stroke(P, 20, 12, 12, 20, 1, GOLD);
        disc(P, 16, 16, 4, 4, OUT); disc(P, 16, 16, 3, 3, GOLD);
        P(15, 13, 2, 1, GOLD_LIGHT); P(6, 8, 2, 2, GOLD_LIGHT);
        P(24, 8, 2, 2, GOLD_LIGHT); P(15, 27, 2, 2, GOLD_LIGHT);
    }

    function crownIcon(P) {
        facet(P, [[2, 12], [7, 18], [9, 6], [14, 17], [16, 2], [19, 17], [24, 6], [26, 18], [30, 12], [29, 27], [3, 27]], OUT);
        facet(P, [[4, 14], [8, 20], [10, 10], [14, 20], [16, 5], [19, 20], [23, 10], [25, 20], [28, 14], [27, 25], [5, 25]], GOLD_DARK);
        facet(P, [[6, 16], [9, 21], [11, 14], [15, 21], [16, 7], [18, 21], [22, 14], [24, 21], [26, 16], [26, 23], [6, 23]], GOLD);
        P(5, 22, 22, 2, GOLD_LIGHT); P(4, 25, 24, 3, OUT);
        P(5, 25, 22, 1, GOLD_LIGHT); P(6, 26, 20, 1, GOLD);
        P(13, 17, 7, 7, OUT); P(14, 18, 5, 5, '#a91d32');
        P(15, 18, 2, 2, '#fa6671');
        for (const x of [6, 24]) { P(x, 20, 3, 4, OUT); P(x, 20, 2, 3, '#287eb5'); P(x, 20, 1, 1, BLUE_LIGHT); }
        P(15, 3, 2, 3, GOLD_LIGHT); P(8, 7, 2, 3, GOLD_LIGHT);
        P(23, 7, 2, 3, GOLD_LIGHT);
    }

    const NEW_ICONS = Object.freeze({
        ARCO_CACA: bowIcon, MACHADO_MINO: axeIcon, MARTELO_GOLEM: hammerIcon,
        CAJADO_FOGO: staffIcon, ARMADURA_OSSO: boneArmorIcon,
        ARMADURA_ESCAMA: scaleArmorIcon, ELMO_DRACO: dracoHelmIcon,
        BOTAS_VENTO: windBootsIcon, ESPADA_HL: P => namedSwordIcon(P, false),
        ESPADA_ETERNA: P => namedSwordIcon(P, true),
        ESCUDO_GUARDIAO: guardianShieldIcon, COROA_VALADARES: crownIcon
    });

    const supportedIcons = Object.freeze([
        'ESPADA', 'ESCUDO_MAD', 'ESCUDO_FERRO', 'POTION', 'POTION_MP',
        ...Object.keys(NEW_ICONS)
    ]);
    const extraIcons = new Map(), extraWeapons = new Map(), extraShields = new Map();

    // Extensões acrescentam o catálogo restante sem substituir a arte já aprovada.
    function register(groups = {}) {
        for (const [name, target, protectedKeys] of [
            ['icons', extraIcons, supportedIcons],
            ['weapons', extraWeapons, ['ESPADA', ...NEW_WEAPONS]],
            ['shields', extraShields, ['ESCUDO_MAD', 'ESCUDO_FERRO', 'ESCUDO_GUARDIAO']]
        ]) {
            for (const [key, painter] of Object.entries(groups[name] || {})) {
                if (/^[A-Z][A-Z0-9_]*$/.test(key) && typeof painter === 'function' &&
                    !protectedKeys.includes(key) && !target.has(key)) target.set(key, painter);
            }
        }
    }

    function drawIcon(ctx, def, key, S) {
        const base = baseKey(key);
        if (!ctx || !Number.isFinite(S) || S <= 0 ||
            (!supportedIcons.includes(base) && !extraIcons.has(base))) return false;
        ctx.save();
        try {
            ctx.imageSmoothingEnabled = false;
            const P = iconPixel(ctx, S, NEW_ICONS[base] || extraIcons.has(base) ? 32 : 24);
            if (base === 'ESPADA') swordIcon(P);
            else if (base === 'ESCUDO_MAD' || base === 'ESCUDO_FERRO') shieldIcon(P, base === 'ESCUDO_FERRO');
            else if (base === 'POTION' || base === 'POTION_MP') potionIcon(P, base === 'POTION_MP');
            else if (NEW_ICONS[base]) NEW_ICONS[base](P);
            else extraIcons.get(base)(P, def);
        } finally { ctx.restore(); }
        return true;
    }

    function motion(opts) {
        if (!opts || typeof opts !== 'object') return { bob: 0, thrust: 0, side: 1 };
        const walk = Number.isFinite(opts.walkPhase) ? opts.walkPhase : 0;
        const attack = Number.isFinite(opts.attackPhase) ? Math.max(0, Math.min(1, opts.attackPhase)) : 0;
        const side = opts.dir === 'left' || opts.dir === 'west' || opts.dir === -1 ? -1 : 1;
        return { bob: Math.round(Math.sin(walk) * 1.5), thrust: Math.round(Math.sin(attack * Math.PI) * 3), side };
    }

    const NEW_WEAPONS = Object.freeze([
        'ARCO_CACA', 'MACHADO_MINO', 'MARTELO_GOLEM',
        'CAJADO_FOGO', 'ESPADA_HL', 'ESPADA_ETERNA'
    ]);

    function newWeapon(P, base) {
        if (base === 'ARCO_CACA') {
            // Extremidades curvas; a corda cruza perto da mão em y=33.
            const path = [[3, 8], [0, 11], [-3, 20], [-3, 29], [0, 37], [3, 39]];
            for (let i = 0; i + 1 < path.length; i++) {
                stroke(P, ...path[i], ...path[i + 1], 5, OUT);
                stroke(P, ...path[i], ...path[i + 1], 3, WOOD);
            }
            stroke(P, 3, 9, 4, 38, 2, BONE_LIGHT);
            stroke(P, -1, 13, -2, 21, 1, WOOD_LIGHT);
            stroke(P, -2, 28, 0, 35, 1, WOOD_LIGHT);
            P(-4, 29, 5, 7, OUT); P(-3, 30, 3, 5, WOOD_DARK);
            P(-2, 32, 2, 1, GOLD_LIGHT);
            P(2, 8, 3, 2, GOLD); P(2, 38, 3, 2, GOLD);
        } else if (base === 'MACHADO_MINO') {
            stroke(P, 2, 35, 2, 9, 7, OUT);
            stroke(P, 2, 35, 2, 9, 5, WOOD_DARK);
            stroke(P, 1, 13, 1, 30, 1, WOOD_LIGHT);
            // Cabeça acima dos olhos; a haste continua presa à mão.
            const H = (a,b,w,h,c) => P(a,b-7,w,h,c);
            facet(H, [[1, 11], [-8, 5], [-10, 6], [-10, 17], [-6, 17], [1, 14]], OUT);
            facet(H, [[0, 11], [-8, 7], [-9, 8], [-9, 15], [-5, 15], [0, 13]], STEEL);
            H(-9, 8, 1, 7, STEEL_LIGHT);
            facet(H, [[3, 11], [12, 5], [14, 6], [14, 17], [10, 17], [3, 14]], OUT);
            facet(H, [[4, 11], [12, 7], [13, 8], [13, 15], [9, 15], [4, 13]], STEEL);
            H(12, 8, 1, 7, STEEL_LIGHT);
            H(-1, 10, 6, 5, OUT); H(0, 11, 4, 3, GOLD_DARK);
            H(1, 11, 2, 2, GOLD_LIGHT); P(-1, 31, 6, 2, GOLD);
            P(0, 7, 4, 5, WOOD_DARK);
            P(-1, 37, 6, 2, OUT); P(0, 37, 4, 1, GOLD);
        } else if (base === 'MARTELO_GOLEM') {
            stroke(P, 2, 36, 2, 11, 7, OUT);
            stroke(P, 2, 36, 2, 11, 5, WOOD_DARK);
            stroke(P, 1, 14, 1, 30, 1, WOOD_LIGHT);
            const H = (a,b,w,h,c) => P(a,b-10,w,h,c);
            facet(H, [[-9, 5], [7, 5], [13, 9], [13, 18], [7, 21], [-8, 21], [-11, 17], [-11, 9]], OUT);
            facet(H, [[-8, 7], [6, 7], [11, 10], [11, 17], [6, 19], [-7, 19], [-9, 16], [-9, 10]], STEEL_DARK);
            facet(H, [[-7, 7], [4, 7], [6, 10], [1, 13], [-8, 12]], STEEL);
            facet(H, [[3, 13], [11, 10], [11, 17], [6, 19], [0, 19]], '#777986');
            stroke(H, -5, 8, -8, 14, 1, STEEL_LIGHT);
            stroke(H, 6, 10, 9, 14, 1, STEEL_LIGHT);
            P(0, 9, 4, 4, WOOD_DARK);
            P(-1, 31, 6, 2, GOLD_DARK); P(-1, 37, 6, 2, OUT);
            P(0, 37, 4, 1, GOLD);
        } else if (base === 'CAJADO_FOGO') {
            stroke(P, 2, 37, 2, 10, 6, OUT);
            stroke(P, 2, 37, 2, 10, 4, WOOD_DARK);
            P(1, 17, 1, 17, WOOD_LIGHT);
            stroke(P, -3, 13, -3, 8, 3, GOLD_DARK);
            stroke(P, -3, 8, 1, 6, 3, GOLD);
            stroke(P, 1, 6, 7, 8, 3, GOLD_LIGHT);
            stroke(P, 7, 8, 7, 13, 3, GOLD);
            stroke(P, 7, 13, 3, 15, 3, GOLD_DARK);
            facet(P, [[1, 12], [-1, 9], [0, 5], [3, 1], [4, 5], [7, 2], [8, 9], [5, 13]], '#a32b1e');
            facet(P, [[2, 11], [1, 8], [3, 5], [4, 8], [6, 5], [6, 10], [4, 12]], '#fa7329');
            P(3, 9, 2, 3, '#ffd66a'); P(-1, 31, 6, 3, GOLD_DARK);
        } else {
            const eternal = base === 'ESPADA_ETERNA';
            // Ambas apontam para cima; guarda transversal e pomo ficam junto da mão.
            facet(P, [[-2, 30], [-4, 12], [2, 3], [8, 12], [6, 30]], OUT);
            facet(P, [[-1, 29], [-2, 12], [2, 5], [6, 12], [5, 29]], eternal ? BLUE : STEEL);
            facet(P, [[0, 27], [-1, 12], [2, 5], [3, 25]], STEEL_LIGHT);
            P(1, 7, 1, 18, STEEL_WHITE);
            if (eternal) P(4, 12, 1, 14, GOLD_LIGHT);
            stroke(P, -7, 30, 10, 30, 5, OUT);
            stroke(P, -7, 30, 10, 30, 3, GOLD);
            P(-8, 28, 3, 3, GOLD_LIGHT); P(8, 28, 3, 3, GOLD_LIGHT);
            if (eternal) {
                P(-8, 25, 3, 5, OUT); P(-7, 25, 1, 5, GOLD_LIGHT);
                P(9, 25, 3, 5, OUT); P(10, 25, 1, 5, GOLD_LIGHT);
            }
            P(-1, 29, 6, 5, OUT); P(0, 30, 4, 3, eternal ? '#168aca' : '#a82130');
            P(0, 30, 1, 1, eternal ? BLUE_LIGHT : '#fc8176');
            P(0, 34, 4, 5, OUT); P(1, 34, 2, 4, WOOD_DARK);
            P(-1, 38, 6, 2, GOLD_DARK); P(0, 38, 4, 1, GOLD_LIGHT);
        }
    }

    function drawWeapon(ctx, px, py, key, opts) {
        const base = baseKey(key);
        if (!ctx || (base !== 'ESPADA' && !NEW_WEAPONS.includes(base) && !extraWeapons.has(base)) ||
            !Number.isFinite(px) || !Number.isFinite(py)) return false;
        const m = motion(opts);
        if (base !== 'ESPADA') {
            const x = Math.round(px + 38 + m.side * m.thrust);
            const y = Math.round(py + m.bob - m.thrust);
            ctx.save();
            try {
                ctx.imageSmoothingEnabled = false;
                const P = (a, b, w, h, c) => pixel(ctx, x + (m.side < 0 ? -a - w : a), y + b, w, h, c);
                if (extraWeapons.has(base)) extraWeapons.get(base)(P, opts || {});
                else newWeapon(P, base);
            } finally { ctx.restore(); }
            return true;
        }
        const x = Math.round(px + 38 + (m.side < 0 ? -1 : 0) + m.thrust);
        const y = Math.round(py + m.bob - m.thrust);
        ctx.save();
        try {
            ctx.imageSmoothingEnabled = false;
            const P = (a, b, w, h, c) => pixel(ctx, x + a, y + b, w, h, c);
            // A espada ocupa a faixa da mão (x+38) e aponta acima dela.
            P(0, 9, 5, 21, OUT);
            P(1, 7, 3, 24, STEEL_DARK);
            P(1, 9, 2, 19, STEEL_LIGHT);
            P(1, 8, 1, 18, STEEL_WHITE);
            P(2, 6, 1, 3, STEEL_WHITE);
            P(0, 29, 5, 2, STEEL_DARK);
            P(-3, 29, 11, 3, OUT);
            P(-2, 29, 9, 2, GOLD);
            P(-2, 29, 4, 1, GOLD_LIGHT);
            P(1, 31, 3, 7, OUT);
            P(2, 31, 2, 6, WOOD_DARK);
            P(2, 33, 1, 1, WOOD_LIGHT);
            P(0, 37, 5, 2, GOLD_DARK);
            P(1, 37, 3, 1, GOLD_LIGHT);
        } finally { ctx.restore(); }
        return true;
    }

    function drawShield(ctx, px, py, key, opts) {
        const base = baseKey(key);
        if (!ctx || (base !== 'ESCUDO_MAD' && base !== 'ESCUDO_FERRO' && base !== 'ESCUDO_GUARDIAO' && !extraShields.has(base)) ||
            !Number.isFinite(px) || !Number.isFinite(py)) return false;
        const m = motion(opts);
        if (base === 'ESCUDO_GUARDIAO' || extraShields.has(base)) {
            const x = Math.round(px + 4 - (m.side < 0 ? 1 : 0));
            const y = Math.round(py + 16 + m.bob);
            ctx.save();
            try {
                ctx.imageSmoothingEnabled = false;
                const P = (a, b, w, h, c) => pixel(ctx, x + a, y + b, w, h, c);
                if (extraShields.has(base)) {
                    extraShields.get(base)(P, opts || {});
                    return true;
                }
                facet(P, [[7, 0], [14, 2], [14, 11], [11, 16], [7, 19], [3, 16], [0, 11], [0, 2]], OUT);
                facet(P, [[7, 2], [12, 3], [12, 11], [10, 15], [7, 17], [4, 15], [2, 11], [2, 3]], GOLD);
                facet(P, [[7, 4], [11, 5], [11, 11], [9, 14], [7, 15], [5, 14], [3, 11], [3, 5]], BLUE_DARK);
                P(6, 4, 2, 10, GOLD_LIGHT); P(3, 8, 8, 2, GOLD_LIGHT);
                disc(P, 7, 9, 2, 2, GOLD_DARK); P(6, 8, 2, 2, GOLD_LIGHT);
                P(2, 3, 2, 1, STEEL_WHITE); P(10, 13, 1, 1, GOLD_DARK);
            } finally { ctx.restore(); }
            return true;
        }
        const x = Math.round(px + 4 - (m.side < 0 ? 1 : 0));
        const y = Math.round(py + 16 + m.bob);
        const iron = base === 'ESCUDO_FERRO';
        ctx.save();
        try {
            ctx.imageSmoothingEnabled = false;
            const P = (a, b, w, h, c) => pixel(ctx, x + a, y + b, w, h, c);
            // Disco estreito de frente para manter braço e rosto visíveis.
            const widths = [4, 8, 10, 12, 12, 14, 14, 14, 14, 14, 14, 12, 12, 10, 8, 4];
            widths.forEach((w, row) => P(7 - w / 2, row, w, 1, OUT));
            widths.slice(1, -1).forEach((w, row) => P(7 - (w - 2) / 2, row + 1, w - 2, 1, STEEL));
            widths.slice(2, -2).forEach((w, row) => P(7 - (w - 4) / 2, row + 2, w - 4, 1, iron ? '#727e8a' : WOOD));
            if (iron) {
                P(6, 3, 2, 10, STEEL_LIGHT);
                P(3, 7, 8, 2, STEEL_LIGHT);
                P(6, 4, 1, 8, STEEL_WHITE);
            } else {
                P(5, 3, 1, 10, WOOD_DARK);
                P(8, 3, 1, 10, WOOD_DARK);
                P(6, 3, 1, 9, WOOD_LIGHT);
                P(3, 7, 8, 1, '#9b6638');
            }
            P(5, 6, 4, 4, OUT);
            P(6, 6, 3, 3, STEEL_LIGHT);
            P(6, 6, 1, 1, STEEL_WHITE);
            P(3, 2, 2, 1, STEEL_WHITE);
            P(10, 12, 1, 1, STEEL_DARK);
        } finally { ctx.restore(); }
        return true;
    }

    window.ValadaresItemArt2D = Object.freeze({
        drawIcon, drawWeapon, drawShield, register,
        helpers: Object.freeze({ facet, stroke, disc }),
        get supportedIcons() { return Object.freeze([...supportedIcons, ...extraIcons.keys()]); },
        get supportedWeapons() { return Object.freeze(['ESPADA', ...NEW_WEAPONS, ...extraWeapons.keys()]); },
        get supportedShields() { return Object.freeze(['ESCUDO_MAD', 'ESCUDO_FERRO', 'ESCUDO_GUARDIAO', ...extraShields.keys()]); }
    });
}());
