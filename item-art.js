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
        return typeof key === 'string' ? key.replace(/_PLUS_\d+$/, '') : '';
    }

    function pixel(ctx, x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    }

    // Coordenadas inteiras ficam nítidas mesmo em ícones de 20 px no chão.
    function iconPixel(ctx, size) {
        return function (x, y, w, h, color) {
            const x0 = Math.round(x * size / 24);
            const y0 = Math.round(y * size / 24);
            const x1 = Math.round((x + w) * size / 24);
            const y1 = Math.round((y + h) * size / 24);
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

    function drawIcon(ctx, def, key, S) {
        const base = baseKey(key);
        if (!ctx || !Number.isFinite(S) || S <= 0 ||
            !['ESPADA', 'ESCUDO_MAD', 'ESCUDO_FERRO', 'POTION', 'POTION_MP'].includes(base)) return false;
        ctx.save();
        try {
            ctx.imageSmoothingEnabled = false;
            const P = iconPixel(ctx, S);
            if (base === 'ESPADA') swordIcon(P);
            else if (base === 'ESCUDO_MAD' || base === 'ESCUDO_FERRO') shieldIcon(P, base === 'ESCUDO_FERRO');
            else potionIcon(P, base === 'POTION_MP');
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

    function drawWeapon(ctx, px, py, key, opts) {
        if (!ctx || baseKey(key) !== 'ESPADA' || !Number.isFinite(px) || !Number.isFinite(py)) return false;
        const m = motion(opts);
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
        if (!ctx || (base !== 'ESCUDO_MAD' && base !== 'ESCUDO_FERRO') ||
            !Number.isFinite(px) || !Number.isFinite(py)) return false;
        const m = motion(opts);
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

    window.ValadaresItemArt2D = Object.freeze({ drawIcon, drawWeapon, drawShield });
}());
