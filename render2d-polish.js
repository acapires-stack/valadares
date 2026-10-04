// Original 48 px canvas art for the classic 2D renderer. No game state is changed.
// Loaded as a classic script before play.html's game script; callers pass the live ctx.
(function (root) {
    'use strict';
    const SIZE = 48;
    const TYPES = { GRASS: 0, DIRT: 1, TREE: 2, WATER: 3, STONE: 4 };
    const cache = new Map();
    const plazaCache = new Map();
    function hash(x, y, salt) {
        let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ (salt | 0);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return (h ^ (h >>> 16)) >>> 0;
    }
    function canvas() {
        const c = document.createElement('canvas');
        c.width = c.height = SIZE;
        return c;
    }
    function rect(c, col, x, y, w, h) {
        c.fillStyle = col;
        c.fillRect(x, y, w, h);
    }
    function grass(c, variant) {
        rect(c, '#60774e', 0, 0, SIZE, SIZE);
        // Broad tones and sparse clumps; avoid a repeated field of tiny dots.
        const patches = variant & 1 ? [[3,11,17,12],[27,29,16,11]] : [[8,25,19,12],[29,5,14,14]];
        for (const [x,y,w,h] of patches) rect(c, '#637750', x,y,w,h);
        for (let i = 0; i < 3; i++) {
            const x = 5 + hash(variant, i, 130) % 36;
            const y = 5 + hash(i, variant, 240) % 35;
            rect(c, '#718958', x, y, 2, 5);
            rect(c, '#526c46', x+3, y+2, 2, 3);
        }
        if (variant === 2 || variant === 6) {
            rect(c, '#aaae77', 35, 17, 2, 2);
            rect(c, '#8d9862', 33, 18, 2, 2);
        }
        if (variant === 1 || variant === 5) {
            rect(c, '#788d5b', 10, 30, 6, 2);
            rect(c, '#4f7049', 15, 33, 4, 2);
        }
    }
    function dirt(c, variant) {
        rect(c, '#a1835e', 0, 0, SIZE, SIZE);
        rect(c, variant & 1 ? '#a88964' : '#9a7d5a', 4, 5, 23, 12);
        rect(c, variant & 2 ? '#987b58' : '#ac8b64', 22, 27, 22, 13);
        rect(c, '#b19770', 6, 8, 14, 2);
        rect(c, '#ad9069', 26, 30, 13, 2);
        const pebbles = [[8,24],[34,9],[15,40],[39,35],[27,20]];
        for (let i = 0; i < pebbles.length; i++) {
            const [x, y] = pebbles[i];
            rect(c, i % 2 ? '#c1a67e' : '#806b52', x + (variant + i) % 4, y, 3, 2);
        }
        if (variant & 1) {
            rect(c, '#6c7950', 13, 29, 2, 3);
            rect(c, '#718556', 15, 30, 3, 2);
        }
    }
    function tree(c, variant) {
        grass(c, variant);
        rect(c, 'rgba(35,49,30,0.30)', 3, 36, 42, 8);
        rect(c, '#493927', 19, 28, 11, 17);
        rect(c, '#76553a', 20, 29, 3, 15);
        rect(c, '#302e26', 27, 31, 3, 13);
        // Stepped, irregular crown. The lit northwest lobe is broad enough to read at 1x.
        rect(c, '#293f32', 13, 2, 22, 36);
        rect(c, '#293f32', 6, 7, 36, 28);
        rect(c, '#293f32', 2, 15, 44, 16);
        rect(c, '#344e39', 12, 3, 23, 32);
        rect(c, '#344e39', 5, 9, 37, 23);
        rect(c, '#344e39', 3, 17, 42, 12);
        rect(c, '#456445', 7, 8, 34, 19);
        rect(c, '#456445', 4, 17, 39, 9);
        rect(c, '#57754e', 10, 5, 26, 17);
        rect(c, '#6d8959', 13, 6, 19, 8);
        rect(c, '#769460', 7, 17, 14, 6);
        rect(c, '#456445', 5, 25, 12, 6);
        rect(c, '#304a35', 29, 23, 14, 10);
        rect(c, '#213d31', 16, 31, 18, 6);
        rect(c, '#354f37', 6, 30, 10, 3);
        rect(c, '#42613f', 34, 12, 8, 10);
        if (variant & 1) {
            rect(c, '#829c66', 16, 9, 8, 3);
            rect(c, '#718f5b', 10, 20, 6, 3);
        } else {
            rect(c, '#829c66', 11, 12, 8, 3);
            rect(c, '#718f5b', 23, 8, 6, 3);
        }
        rect(c, '#324b35', 24, 26, 10, 5);
        // A few broad canopy shifts keep a grove organic without noisy leaves.
        if (variant % 3 === 0) {
            rect(c, '#6d8959', 6, 15, 11, 5);
            rect(c, '#2c4734', 31, 27, 11, 5);
        } else if (variant % 3 === 1) {
            rect(c, '#71905d', 25, 11, 11, 5);
            rect(c, '#3b5940', 5, 27, 13, 4);
        } else {
            rect(c, '#73905d', 11, 21, 10, 4);
            rect(c, '#314b36', 32, 18, 9, 8);
        }
    }
    function stone(c, variant) {
        rect(c, '#787b70', 0, 0, SIZE, SIZE);
        const blocks = [
            [1,1,28,21],[31,1,16,21],
            [1,24,17,23],[20,24,27,23]
        ];
        const colors = ['#909185','#7c8277','#929387','#85897e'];
        for (let i = 0; i < blocks.length; i++) {
            const [x,y,w,h] = blocks[i];
            rect(c, colors[(i + (variant & 1)) & 3], x,y,w,h);
            rect(c, 'rgba(223,218,190,0.20)', x,y,w-2,2);
            rect(c, 'rgba(45,52,45,0.16)', x+w-2,y+2,2,h-2);
        }
        if (variant & 2) rect(c, '#6f806e', 9,37,6,2);
    }
    function water(c, variant, shoreMask) {
        rect(c, '#315d68', 0, 0, SIZE, SIZE);
        rect(c, variant & 1 ? '#376975' : '#356671', 5, 8, 28, 13);
        rect(c, '#2b5663', 17, 29, 30, 11);
        rect(c, 'rgba(151,190,176,0.34)', 8 + variant % 5, 12, 15, 2);
        rect(c, 'rgba(151,190,176,0.24)', 28, 35 - variant % 4, 12, 2);
        if (variant & 2) rect(c, 'rgba(176,204,181,0.24)', 5, 39, 8, 1);
        // The bank belongs to the water tile; the land stays intact and collision is unchanged.
        const bank = '#8a896b', wet = '#55786c';
        for (let side = 0; side < 4; side++) {
            if (!(shoreMask & (1 << side))) continue;
            for (let a = 0; a < SIZE; a += 8) {
                const depth = 3 + hash(variant, a + side * 53, 612) % 3;
                if (side === 0) { rect(c, bank, a, 0, 8, depth); rect(c, wet, a, depth, 8, 1); }
                if (side === 1) { rect(c, bank, a, SIZE-depth, 8, depth); rect(c, wet, a, SIZE-depth-1, 8, 1); }
                if (side === 2) { rect(c, bank, 0, a, depth, 8); rect(c, wet, depth, a, 1, 8); }
                if (side === 3) { rect(c, bank, SIZE-depth, a, depth, 8); rect(c, wet, SIZE-depth-1, a, 1, 8); }
            }
        }
    }
    function neighbor(map, x, y) {
        return map && map[y] ? map[y][x] : undefined;
    }
    function edgeMask(type, tx, ty, map) {
        if (!map || (type !== TYPES.WATER && type !== TYPES.DIRT)) return 0;
        const target = type === TYPES.DIRT ? TYPES.GRASS : TYPES.WATER;
        let mask = 0;
        const directions = [[0,-1],[0,1],[-1,0],[1,0]];
        for (let side = 0; side < 4; side++) {
            const [dx,dy] = directions[side];
            const other = neighbor(map, tx+dx, ty+dy);
            if (other !== undefined && (type === TYPES.DIRT ? other === target : other !== target))
                mask |= 1 << side;
        }
        return mask;
    }
    function dirtGrassEdge(c, variant, mask) {
        for (let side = 0; side < 4; side++) {
            if (!(mask & (1 << side))) continue;
            for (let a = 0; a < SIZE; a += 8) {
                const deep = 2 + hash(variant, a + side * 41, 67) % 4;
                if (side === 0) rect(c, '#62774f', a, 0, 8, deep);
                if (side === 1) rect(c, '#62774f', a, SIZE-deep, 8, deep);
                if (side === 2) rect(c, '#62774f', 0, a, deep, 8);
                if (side === 3) rect(c, '#62774f', SIZE-deep, a, deep, 8);
            }
        }
    }
    function tileImage(type, tx, ty, map) {
        const variant = hash(tx, ty, 51) & 7;
        const mask = edgeMask(type, tx, ty, map);
        const key = type + ':' + variant + ':' + mask;
        let img = cache.get(key);
        if (!img) {
            img = canvas();
            const c = img.getContext('2d');
            if (type === TYPES.GRASS) grass(c, variant);
            else if (type === TYPES.DIRT) { dirt(c, variant); dirtGrassEdge(c, variant, mask); }
            else if (type === TYPES.TREE) tree(c, variant);
            else if (type === TYPES.WATER) water(c, variant, mask);
            else stone(c, variant);
            cache.set(key, img);
        }
        return img;
    }
    function drawTile(c, type, px, py, tx, ty, opts) {
        if (type !== TYPES.GRASS && type !== TYPES.DIRT &&
            type !== TYPES.TREE && type !== TYPES.WATER && type !== TYPES.STONE) return false;
        c.drawImage(tileImage(type, tx, ty, opts && opts.map), px, py);
        return true;
    }
    function plazaImage(tx, ty) {
        // Eight tiles repeat only after the 32x12 world-space stone bond aligns.
        tx = ((tx % 8) + 8) % 8;
        ty = ((ty % 8) + 8) % 8;
        const key = tx + ',' + ty;
        let img = plazaCache.get(key);
        if (img) return img;
        img = canvas();
        const c = img.getContext('2d');
        rect(c, '#807e70', 0, 0, SIZE, SIZE);
        const wx = tx * SIZE, wy = ty * SIZE;
        for (let row = Math.floor(wy / 12); row <= Math.floor((wy + SIZE - 1) / 12); row++) {
            const top = row * 12 - wy;
            const shift = row & 1 ? 14 : 0;
            for (let col = Math.floor((wx - shift) / 32) - 1;
                 col <= Math.floor((wx + SIZE - shift) / 32) + 1; col++) {
                const left = col * 32 + shift - wx;
                const h = hash(col, row, 207);
                const palette = ['#918e80','#9b9688','#898a7d','#9e9887','#888a7d'];
                const shade = palette[h % palette.length];
                rect(c, shade, left+1, top+1, 30, 10);
                rect(c, 'rgba(228,223,194,0.17)', left+2, top+1, 27, 1);
                rect(c, 'rgba(47,52,48,0.16)', left+1, top+10, 29, 1);
                if ((h & 7) === 0) rect(c, '#748070', left+22, top+8, 5, 2);
            }
        }
        // Physical tile edges intentionally receive no outline.
        plazaCache.set(key, img);
        return img;
    }
    function drawPlazaTile(c, px, py, tx, ty, opts) {
        c.drawImage(plazaImage(tx, ty), px, py);
        const mask = opts && opts.edgeMask || 0; // N=1, S=2, W=4, E=8
        if (mask) {
            c.save();
            const band = '#b0a68b', light = '#cbc0a0', inside = '#6f756e';
            if (mask & 1) { rect(c, band, px, py, SIZE, 5); rect(c, light, px, py, SIZE, 2); rect(c, inside, px, py+5, SIZE, 1); }
            if (mask & 2) { rect(c, band, px, py+SIZE-5, SIZE, 5); rect(c, light, px, py+SIZE-5, SIZE, 2); rect(c, inside, px, py+SIZE-6, SIZE, 1); }
            if (mask & 4) { rect(c, band, px, py, 5, SIZE); rect(c, light, px, py, 2, SIZE); rect(c, inside, px+5, py, 1, SIZE); }
            if (mask & 8) { rect(c, band, px+SIZE-5, py, 5, SIZE); rect(c, light, px+SIZE-5, py, 2, SIZE); rect(c, inside, px+SIZE-6, py, 1, SIZE); }
            c.restore();
        }
        return true;
    }
    const JOBS = {
        mercador: { robe:'#496982', trim:'#c6a45f', hair:'#654432', kind:'merchant' },
        leiloeiro: { robe:'#415064', trim:'#b7a479', hair:'#3e3530', kind:'auction' },
        crupie: { robe:'#4c3d58', trim:'#c47873', hair:'#25232a', kind:'casino' },
        banqueiro: { robe:'#72603d', trim:'#dbbd6d', hair:'#594b32', kind:'banker' },
        atendente: { robe:'#6c5777', trim:'#c1a48d', hair:'#6b4637', kind:'clerk' },
        tintureira: { robe:'#794e6e', trim:'#d987a8', hair:'#342634', kind:'dyer' },
        domador: { robe:'#516d51', trim:'#c7a36e', hair:'#694c32', kind:'tamer' },
        arena: { robe:'#71434a', trim:'#d5aa76', hair:'#4b342e', kind:'arena' },
        eremita: { robe:'#66665a', trim:'#a8987b', hair:'#aaa798', kind:'hermit' },
        ferreiro: { robe:'#77543d', trim:'#b0aaa0', hair:'#514033', kind:'smith' },
        cacadora: { robe:'#536e51', trim:'#bea77a', hair:'#594638', kind:'hunter' },
        mineiro: { robe:'#786147', trim:'#b1a17d', hair:'#624b39', kind:'miner' },
        crepusculo: { robe:'#634e72', trim:'#c69ec3', hair:'#292636', kind:'seer' },
        vohrim: { robe:'#4d4961', trim:'#c2a168', hair:'#4a3940', kind:'envoy' },
        vendedor: { robe:'#39393f', trim:'#b0554f', hair:'#27252a', kind:'soul' }
    };
    function drawNpcBody(c, npc, px, py) {
        if (!npc || !JOBS[npc.id]) return false;
        const job = JOBS[npc.id];
        const r = (col,x,y,w,h) => rect(c,col,px+x,py+y,w,h);
        // All pixels stay inside the original 48 x 48 footprint.
        r('#3b342f',15,42,7,4); r('#3b342f',27,42,7,4);
        r('#4a3a32',15,22,19,20);
        r(job.robe,13,22,22,18); r(job.robe,11,30,26,12);
        r('#334034',10,25,4,11); r('#334034',34,25,4,11);
        r(job.trim,13,29,22,3);
        r('#423528',21,29,6,3);
        r('#d5ad83',16,11,16,14);
        r('#e6bf94',16,12,13,7);
        r(job.hair,15,7,18,7); r(job.hair,14,12,3,7);
        r('#362c2c',19,17,2,2); r('#362c2c',27,17,2,2);
        r('#ad806a',22,21,5,1);
        switch (job.kind) {
            case 'merchant':
                r('#b69b62',12,6,24,5); r('#7f5b3d',18,3,12,5);
                r('#aa8b55',31,25,9,13); r('#d1b875',33,29,5,3); break;
            case 'auction':
                r('#586879',14,4,20,6); r('#a5b3ba',12,9,24,2);
                r('#baa37b',33,23,3,15); r('#baa37b',29,23,10,4); r('#66533d',30,36,9,3); break;
            case 'casino':
                r('#5e4255',14,4,20,6); r('#bd6a73',11,9,26,3);
                r('#e1d2aa',28,29,11,8); r('#a5474b',31,31,3,3); r('#40363d',35,32,3,3); break;
            case 'banker':
                r('#8d7545',15,6,18,5); r('#d3b65d',19,6,10,2);
                r('#aa8040',29,28,11,11); r('#e0bb54',31,30,7,5); break;
            case 'clerk':
                r('#d5c49e',31,26,9,11); r('#8e7961',32,28,6,1); break;
            case 'dyer':
                r('#a26493',16,5,16,5); r('#513b54',13,10,6,6);
                r('#ad6982',8,28,11,13); r('#d89cab',10,31,6,4); break;
            case 'tamer':
                r('#59704d',14,4,20,8); r('#a69b6c',12,10,24,3);
                r('#594330',37,14,3,30); r('#9b7b50',33,14,9,5); break;
            case 'arena':
                r('#9d8060',13,4,22,7); r('#c1ab82',16,3,16,3);
                r('#9d8060',9,22,7,18); r('#c1ab82',11,24,8,5); break;
            case 'hermit':
                r('#867c68',21,24,7,8); r('#c0b09a',23,25,3,6); break;
            case 'smith':
                r('#4c3e36',15,29,18,14); r('#a9a6a0',33,29,7,3); r('#716861',35,31,3,7); break;
            case 'hunter':
                r('#8c6d45',34,19,2,24); r('#a28659',32,19,6,3); break;
            case 'miner':
                r('#a19370',13,8,22,5); r('#b5ab87',17,5,14,5); r('#dbc27e',23,7,3,3); break;
            case 'seer':
                r('#a281af',13,7,22,7); r('#83668e',18,4,12,5); break;
            case 'envoy':
                r('#bea369',18,29,12,4); r('#c7b485',22,30,4,5); break;
            case 'soul':
                r('#7a3434',13,7,22,4); r('#a6433e',18,3,12,6); break;
        }
        return true;
    }
    function cacheStats() {
        return { tiles: cache.size, plaza: plazaCache.size, maxTiles: 280, maxPlaza: 64 };
    }
    root.ValadaresArt2D = Object.freeze({ drawTile, drawPlazaTile, drawNpcBody, cacheStats });
})(window);
