/* Valadares village props: transparent, 48 px native Canvas sprites. */
(function () {
    'use strict';

    const SIZE = 48;
    const sprites = new Map();
    const chestStyles = [
        { id: 'b1', lock: '#cc4040', gem: '#db3b35', light: '#ffad86', dark: '#831c23', numeral: 1 },
        { id: 'b2', lock: '#4080cc', gem: '#317de6', light: '#b6e9ff', dark: '#173b9c', numeral: 2 },
        { id: 'b3', lock: '#40cc40', gem: '#34c95c', light: '#b7ffab', dark: '#126c38', numeral: 3 },
        { id: 'b4', lock: '#ffcc40', gem: '#ffc83c', light: '#fff2ad', dark: '#a45e10', numeral: 4 }
    ];

    function box(c, x, y, w, h, color) {
        c.fillStyle = color;
        c.fillRect(x, y, w, h);
    }
    function polygon(c, points, color) {
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
        c.closePath();
        c.fill();
    }
    function line(c, x1, y1, x2, y2, color, width) {
        c.strokeStyle = color;
        c.lineWidth = width || 1;
        c.lineCap = 'square';
        c.beginPath();
        c.moveTo(x1 + 0.5, y1 + 0.5);
        c.lineTo(x2 + 0.5, y2 + 0.5);
        c.stroke();
    }
    function bolt(c, x, y) {
        box(c, x, y, 2, 2, '#101a26');
        box(c, x, y, 1, 1, '#d6d8d0');
    }
    function ironBand(c, x, y, h) {
        box(c, x, y, 5, h, '#121c29');
        box(c, x + 1, y, 2, h, '#75869b');
        box(c, x + 1, y + 1, 1, h - 2, '#b4c1c8');
        box(c, x + 4, y + 1, 1, h - 2, '#354b62');
        bolt(c, x + 2, y + 4);
        bolt(c, x + 2, y + h - 6);
    }
    function roman(c, n) {
        const bars = n === 3 ? [20, 23, 26] : n === 2 ? [22, 25] : [23];
        if (n === 4) {
            box(c, 20, 33, 1, 5, '#2b190b');
            box(c, 19, 33, 3, 1, '#2b190b');
            box(c, 19, 37, 3, 1, '#2b190b');
            box(c, 23, 33, 1, 2, '#2b190b');
            box(c, 27, 33, 1, 2, '#2b190b');
            box(c, 24, 35, 1, 2, '#2b190b');
            box(c, 26, 35, 1, 2, '#2b190b');
            box(c, 25, 37, 1, 1, '#2b190b');
        } else for (const x of bars) box(c, x, 33, 1, 5, '#2b190b');
        if (n !== 4) {
            box(c, bars[0] - 1, 33, bars[bars.length - 1] - bars[0] + 3, 1, '#2b190b');
            box(c, bars[0] - 1, 37, bars[bars.length - 1] - bars[0] + 3, 1, '#2b190b');
        }
    }
    function paintChest(c, style) {
        // Dark silhouette and stepped oak lid.
        box(c, 8, 18, 32, 22, '#20180f');
        box(c, 9, 19, 30, 20, '#713918');
        box(c, 11, 14, 26, 11, '#21180f');
        box(c, 9, 17, 30, 8, '#21180f');
        box(c, 12, 13, 24, 11, '#a76025');
        box(c, 10, 16, 28, 9, '#b66b29');
        box(c, 9, 20, 30, 5, '#c88232');
        box(c, 10, 17, 2, 6, '#e7a74f');
        box(c, 12, 14, 23, 2, '#e7a451');
        box(c, 13, 17, 21, 1, '#f1b75f');
        box(c, 11, 21, 26, 1, '#e9a248');
        // Oak planks and alternating light make the volume readable at game size.
        for (const y of [27, 32, 37]) {
            box(c, 10, y, 28, 1, '#412516');
            box(c, 11, y + 1, 26, 1, '#a85b25');
        }
        for (const y of [18, 22, 28, 34]) {
            box(c, 18, y, 10, 1, '#8b471d');
            box(c, 25, y + 1, 8, 1, '#de9139');
        }
        box(c, 9, 38, 30, 2, '#302015');
        box(c, 10, 38, 28, 1, '#98501f');
        // Steel hoops and clasp.
        ironBand(c, 12, 13, 27);
        ironBand(c, 32, 13, 27);
        box(c, 8, 24, 32, 5, '#101c2b');
        box(c, 9, 25, 30, 2, '#8092a0');
        box(c, 9, 27, 30, 1, '#354b61');
        bolt(c, 10, 25); bolt(c, 37, 25);
        box(c, 19, 22, 10, 11, '#101923');
        box(c, 20, 23, 8, 9, '#7e91a1');
        box(c, 21, 24, 6, 7, '#182536');
        polygon(c, [[24, 24], [27, 27], [26, 30], [23, 31], [21, 28], [22, 26]], style.dark);
        polygon(c, [[24, 25], [26, 27], [25, 29], [23, 29], [22, 27]], style.gem);
        polygon(c, [[23, 25], [24, 25], [25, 27], [23, 28], [22, 27]], style.light);
        box(c, 24, 29, 1, 1, '#f5f6e7');
        // Brass number plate sits below the lock.
        box(c, 18, 32, 12, 8, '#25190e');
        box(c, 19, 33, 10, 6, '#bf8741');
        box(c, 20, 33, 8, 1, '#f1c37a');
        bolt(c, 18, 35); bolt(c, 28, 35);
        roman(c, style.numeral);
    }

    function paintDummy(c, shake) {
        // Fixed post and crossed foot; the body above it responds to training.
        box(c, 22, 27, 4, 16, '#4d2c17');
        box(c, 23, 27, 1, 16, '#a36834');
        polygon(c, [[8, 42], [12, 40], [24, 43], [36, 40], [40, 43], [26, 46], [22, 46]], '#2c2119');
        polygon(c, [[9, 42], [13, 40], [25, 43], [35, 40], [39, 42], [25, 45], [23, 45]], '#8c552b');
        box(c, 10, 42, 5, 1, '#d5954b');
        box(c, 34, 41, 4, 1, '#d5954b');
        box(c, 22, 41, 4, 4, '#4e311c');
        box(c, 23, 42, 2, 2, '#e8c178');
        c.save();
        c.translate(shake, 0);
        // Crossbeam and rope joins.
        box(c, 7, 18, 34, 5, '#392215');
        box(c, 8, 18, 32, 3, '#8b552b');
        box(c, 8, 18, 31, 1, '#c28c47');
        for (const x of [11, 14, 35, 38]) {
            box(c, x, 17, 2, 7, '#5b391c');
            box(c, x, 18, 1, 5, '#d2a456');
        }
        polygon(c, [[16, 15], [32, 15], [34, 19], [32, 32], [28, 35], [20, 35], [15, 31], [14, 20]], '#4f341e');
        polygon(c, [[17, 16], [31, 16], [33, 21], [31, 31], [28, 33], [20, 33], [16, 30]], '#c9a56a');
        polygon(c, [[18, 16], [23, 17], [20, 32], [17, 29]], '#e2c089');
        polygon(c, [[29, 17], [32, 20], [30, 31], [27, 33]], '#997549');
        for (const x of [18, 22, 27, 30]) line(c, x, 33, x - 1, 36, '#d6b376');
        box(c, 16, 30, 17, 2, '#6d3e20');
        box(c, 18, 31, 13, 1, '#e0af65');
        // Target on the stuffed torso.
        c.strokeStyle = '#9e352b'; c.lineWidth = 2;
        c.beginPath(); c.arc(24, 25, 6, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = '#ca5140'; c.lineWidth = 2;
        c.beginPath(); c.arc(24, 25, 3, 0, Math.PI * 2); c.stroke();
        box(c, 23, 24, 2, 2, '#8b281f');
        // Round linen head, with stitch marks and straw tips.
        polygon(c, [[20, 2], [27, 2], [31, 5], [33, 9], [31, 14], [27, 17], [20, 17], [16, 14], [15, 9], [17, 5]], '#4b311d');
        polygon(c, [[20, 3], [27, 3], [31, 6], [32, 10], [30, 14], [27, 16], [20, 16], [17, 13], [16, 9], [18, 5]], '#c9a16a');
        polygon(c, [[20, 4], [27, 4], [30, 6], [24, 7], [18, 7]], '#e1bf82');
        box(c, 16, 8, 2, 3, '#9b784b');
        box(c, 29, 8, 2, 3, '#a37b4c');
        for (const [x, y] of [[20, 1], [23, 1], [27, 1], [32, 7], [17, 4]]) box(c, x, y, 1, 2, '#d9b16a');
        line(c, 21, 8, 26, 13, '#56351f', 2);
        line(c, 26, 8, 21, 13, '#56351f', 2);
        // Small wooden shield bound with iron, hanging from the right arm.
        polygon(c, [[30, 20], [39, 19], [41, 21], [40, 31], [36, 35], [31, 32]], '#18212a');
        polygon(c, [[31, 21], [38, 20], [40, 22], [39, 30], [36, 33], [32, 31]], '#85502b');
        box(c, 33, 22, 2, 9, '#b37a3a');
        box(c, 37, 22, 1, 9, '#422616');
        line(c, 30, 21, 30, 31, '#8a9ca6', 2);
        line(c, 39, 21, 39, 29, '#8a9ca6', 2);
        box(c, 34, 26, 4, 4, '#1e2732');
        box(c, 35, 26, 2, 2, '#b4bbc0');
        c.restore();
    }

    function paintAltar(c) {
        // Stepped violet stone plinth with gold edges.
        box(c, 8, 39, 32, 5, '#171421');
        box(c, 9, 40, 30, 3, '#4b3e61');
        box(c, 11, 38, 26, 4, '#75618f');
        box(c, 12, 38, 24, 1, '#b09bc7');
        box(c, 13, 35, 22, 4, '#2d2347');
        box(c, 11, 31, 26, 5, '#171322');
        box(c, 12, 32, 24, 3, '#5b4778');
        box(c, 14, 31, 20, 1, '#b091d5');
        box(c, 17, 22, 14, 11, '#1b1830');
        box(c, 18, 23, 12, 9, '#44315f');
        box(c, 18, 23, 2, 9, '#b58142');
        box(c, 28, 23, 2, 9, '#b58142');
        box(c, 20, 30, 8, 2, '#725a94');
        // Circular sigil on the pillar.
        c.strokeStyle = '#c18ded'; c.lineWidth = 1;
        c.beginPath(); c.arc(24, 27, 3, 0, Math.PI * 2); c.stroke();
        box(c, 23, 24, 2, 5, '#d5a6ff');
        box(c, 21, 26, 6, 1, '#d5a6ff');
        box(c, 14, 33, 2, 2, '#ba91e4');
        box(c, 32, 33, 2, 2, '#ba91e4');
        // Four prongs around a faceted crystal; its centre is exactly (24,18).
        polygon(c, [[16, 10], [18, 9], [18, 22], [21, 25], [20, 27], [16, 24]], '#271b31');
        polygon(c, [[17, 11], [18, 10], [18, 22], [21, 25], [20, 26], [17, 23]], '#c99753');
        polygon(c, [[32, 10], [30, 9], [30, 22], [27, 25], [28, 27], [32, 24]], '#271b31');
        polygon(c, [[31, 11], [30, 10], [30, 22], [27, 25], [28, 26], [31, 23]], '#d5a865');
        polygon(c, [[24, 4], [29, 13], [28, 21], [24, 27], [20, 21], [19, 13]], '#291455');
        polygon(c, [[24, 5], [28, 14], [27, 20], [24, 25], [20, 20], [20, 14]], '#883ceb');
        polygon(c, [[24, 6], [24, 25], [20, 19], [21, 14]], '#bc80ff');
        polygon(c, [[24, 6], [27, 14], [24, 16], [21, 14]], '#edd5ff');
        polygon(c, [[24, 16], [27, 14], [27, 20], [24, 25]], '#6c20d7');
        box(c, 23, 17, 2, 2, '#fff4ff');
        box(c, 33, 8, 1, 3, '#b76aff');
        box(c, 32, 9, 3, 1, '#b76aff');
    }

    function paintCraft(c) {
        // Oak workbench and undershelf, staying inside x4..44/y8..46.
        box(c, 8, 31, 4, 15, '#26190f');
        box(c, 9, 32, 2, 12, '#8b5128');
        box(c, 36, 31, 4, 15, '#26190f');
        box(c, 37, 32, 2, 12, '#8b5128');
        box(c, 10, 37, 28, 4, '#321e13');
        box(c, 11, 38, 26, 2, '#86502a');
        box(c, 14, 34, 20, 4, '#603819');
        box(c, 5, 22, 38, 12, '#21170f');
        box(c, 6, 23, 36, 9, '#985629');
        box(c, 5, 22, 38, 3, '#c3823c');
        box(c, 6, 23, 36, 1, '#edac55');
        box(c, 7, 28, 34, 1, '#623515');
        box(c, 8, 31, 32, 1, '#d18a3a');
        for (const [x, y] of [[8, 26], [39, 26], [10, 30], [37, 30]]) bolt(c, x, y);
        // Small anvil on the left.
        box(c, 9, 19, 13, 4, '#263345');
        polygon(c, [[8, 11], [16, 11], [20, 14], [23, 14], [22, 17], [18, 19], [11, 18]], '#192634');
        polygon(c, [[9, 12], [16, 12], [19, 14], [22, 14], [20, 16], [12, 17]], '#869bb0');
        box(c, 10, 12, 8, 1, '#dce6e9');
        box(c, 12, 18, 7, 3, '#4a5a70');
        // Hammer, diagonal handle and metal head.
        line(c, 18, 26, 29, 15, '#3d2415', 3);
        line(c, 18, 25, 28, 15, '#ba7540', 2);
        polygon(c, [[26, 12], [32, 13], [33, 16], [30, 19], [25, 16]], '#263443');
        polygon(c, [[26, 13], [31, 14], [31, 16], [28, 17], [25, 15]], '#9babb9');
        box(c, 26, 13, 4, 1, '#e4e4db');
        // Tool rack with three steel handles.
        box(c, 32, 9, 9, 13, '#482b1b');
        box(c, 33, 10, 7, 1, '#ad6b36');
        for (const x of [34, 37, 40]) {
            box(c, x, 11, 1, 8, '#aebbc1');
            box(c, x, 18, 2, 3, '#8b552b');
        }
        // A folded parchment plan remains visible on the front edge.
        polygon(c, [[25, 24], [33, 23], [34, 30], [26, 30]], '#6c4829');
        polygon(c, [[26, 24], [33, 24], [33, 29], [26, 29]], '#ead2a0');
        box(c, 28, 25, 3, 1, '#8f6844');
        box(c, 27, 27, 5, 1, '#a47d53');
        box(c, 30, 26, 1, 2, '#735536');
    }

    function getSprite(key, painter) {
        let sprite = sprites.get(key);
        if (sprite) return sprite;
        // DOM canvas is supported in both the game and its browser-based preview.
        sprite = document.createElement('canvas');
        sprite.width = sprite.height = SIZE;
        const c = sprite.getContext('2d');
        if (!c) return null;
        c.imageSmoothingEnabled = false;
        painter(c);
        sprites.set(key, sprite);
        return sprite;
    }
    function draw(ctx, sprite, x, y) {
        if (!ctx || !sprite) return false;
        ctx.save();
        try {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sprite, x, y);
        } finally {
            ctx.restore();
        }
        return true;
    }
    window.ValadaresVillageArt2D = Object.freeze({
        drawChest(ctx, chest, x, y) {
            const style = chestStyles.find(s => chest && chest.id === s.id && chest.lock === s.lock);
            if (!style) return false;
            return draw(ctx, getSprite(style.id, c => paintChest(c, style)), x, y);
        },
        drawDummy(ctx, x, y, shake) {
            const n = Math.max(-2, Math.min(2, Math.round(Number(shake) || 0)));
            return draw(ctx, getSprite('dummy' + n, c => paintDummy(c, n)), x, y);
        },
        drawAltar(ctx, x, y) {
            return draw(ctx, getSprite('altar', paintAltar), x, y);
        },
        drawCraft(ctx, x, y) {
            return draw(ctx, getSprite('craft', paintCraft), x, y);
        },
        get stats() { return Object.freeze({ cacheSize: sprites.size, maxCacheSize: 11 }); }
    });
}());
