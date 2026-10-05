/* Valadares audio: one shared Web Audio context, no external files or playback state. */
((root, factory) => {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ValadaresAudio = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
    'use strict';

    const BIOMES = {
        pz:     { freq: 620, q: 0.36, level: 0.017, detail: 'bird' },
        grass:  { freq: 840, q: 0.42, level: 0.025, detail: 'bird' },
        snow:   { freq: 420, q: 0.50, level: 0.025, detail: 'wind' },
        desert: { freq: 360, q: 0.48, level: 0.027, detail: 'wind' },
        cave:   { freq: 280, q: 0.72, level: 0.023, detail: 'drop' },
        water:  { freq: 660, q: 0.38, level: 0.034, detail: 'water' }
    };
    const SCORES = {
        pz: { roots: [60, 57, 53, 55], melody: [72, 76, 79, 76, 72, 69, 67, null], beat: 0.70 },
        field: { roots: [57, 53, 60, 55], melody: [69, 72, 76, 72, 69, null, 67, 64], beat: 0.65 },
        dungeon: { roots: [50, 46, 48, 45], melody: [62, null, 65, 63, 62, null, 58, 60], beat: 0.75 }
    };
    const COOLDOWN = { melee: 75, ranged: 95, wand: 110, damage: 130, kill: 110,
        spell: 140, pickup: 120, critical: 160, rareLoot: 600, bossReward: 800,
        forgeSuccess: 600, forgeFailure: 600, forgeCancelled: 400,
        trainingDone: 800, levelup: 800, death: 800 };
    const PRIORITY_SFX = new Set(['rareLoot', 'bossReward', 'forgeSuccess', 'forgeFailure',
        'forgeCancelled', 'trainingDone', 'levelup', 'death']);

    function create(ctx){
        if (!ctx || typeof ctx.createGain !== 'function' || !ctx.destination)
            throw new TypeError('AudioContext required');
        let disposed = false;
        const volumes = { master: 60, effects: 65, ambient: 40, music: 35 };
        const scene = { biome: 'pz', combat: false, active: false };
        const voices = new Set();
        const lastPlay = new Map();
        let burstStart = 0, burstNormal = 0, burstPriority = 0;
        let timer = null, noiseBuffer = null, impulse = null, bed = null;
        let scoreName = 'pz', scoreStep = 0, nextBeat = 0, nextDetail = 0;

        const masterGain = ctx.createGain();
        const effectsGain = ctx.createGain();
        const ambientGain = ctx.createGain();
        const musicGain = ctx.createGain();
        const reverbInput = ctx.createGain();
        const convolver = ctx.createConvolver();
        const reverbWet = ctx.createGain();
        masterGain.gain.value = 0;
        effectsGain.gain.value = volumes.effects / 100;
        ambientGain.gain.value = volumes.ambient / 100;
        musicGain.gain.value = volumes.music / 100;
        reverbInput.gain.value = 1;
        reverbWet.gain.value = 0.13;
        effectsGain.connect(masterGain);
        ambientGain.connect(masterGain);
        musicGain.connect(masterGain);
        reverbInput.connect(convolver).connect(reverbWet).connect(effectsGain);
        masterGain.connect(ctx.destination);

        function usable(){
            return !disposed && scene.active && !(typeof document !== 'undefined' && document.hidden);
        }
        function target(param, value, seconds = 0.04){
            const t = ctx.currentTime;
            param.cancelScheduledValues(t);
            if (value === 0) param.setValueAtTime(0, t);
            else param.setTargetAtTime(value, t, seconds);
        }
        function syncGains(){
            target(masterGain.gain, usable() ? volumes.master / 100 : 0, 0.025);
            target(effectsGain.gain, volumes.effects / 100);
            target(ambientGain.gain, volumes.ambient / 100);
            target(musicGain.gain, volumes.music / 100 * (scene.combat ? 0.68 : 1), 0.35);
        }
        function makeNoise(){
            if (noiseBuffer) return noiseBuffer;
            const n = Math.max(2048, Math.floor(ctx.sampleRate * 3));
            noiseBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            let low = 0;
            for (let i = 0; i < n; i++){
                low = 0.89 * low + 0.11 * (Math.random() * 2 - 1);
                data[i] = low;
            }
            // Join the loop's endpoints so the soft ambient bed does not click.
            const edge = Math.min(2048, n >> 3);
            for (let i = 0; i < edge; i++){
                const w = i / edge;
                data[n - edge + i] = data[n - edge + i] * (1 - w) + data[i] * w;
            }
            return noiseBuffer;
        }
        function makeImpulse(){
            if (impulse) return impulse;
            const n = Math.floor(ctx.sampleRate * 1.1);
            impulse = ctx.createBuffer(2, n, ctx.sampleRate);
            for (let ch = 0; ch < 2; ch++){
                const data = impulse.getChannelData(ch);
                for (let i = 0; i < n; i++){
                    const fade = Math.pow(1 - i / n, 2.6);
                    data[i] = (Math.random() * 2 - 1) * fade * 0.34;
                }
            }
            return impulse;
        }
        convolver.buffer = makeImpulse();

        function newVoice(bus, when, amp, cap = 26){
            if (voices.size >= cap) return null;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(Math.max(0.0001, amp), when);
            gain.connect(bus);
            const voice = { gain, sources: [], pending: 0, ended: false };
            voices.add(voice);
            return voice;
        }
        function sourceIn(voice, source, start, stop, attachments = []){
            voice.pending++;
            voice.sources.push(source);
            source.onended = () => {
                voice.pending--;
                try { source.disconnect(); } catch {}
                for (const node of attachments){ try { node.disconnect(); } catch {} }
                if (voice.pending <= 0){
                    voice.ended = true;
                    voices.delete(voice);
                    try { voice.gain.disconnect(); } catch {}
                }
            };
            source.start(start);
            source.stop(stop);
        }
        function tone(voice, hz, at, duration, level, shape = 'sine', bend = 1, wet = 0){
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = shape;
            osc.frequency.setValueAtTime(Math.max(35, hz), at);
            if (bend !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(35, hz * bend), at + duration);
            env.gain.setValueAtTime(0.0001, at);
            env.gain.linearRampToValueAtTime(level, at + Math.min(0.022, duration * 0.15));
            env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
            osc.connect(env).connect(voice.gain);
            const attachments = [env];
            if (wet){
                const send = ctx.createGain();
                send.gain.value = wet;
                env.connect(send).connect(reverbInput);
                attachments.push(send);
            }
            sourceIn(voice, osc, at, at + duration + 0.01, attachments);
        }
        function noise(voice, at, duration, level, cutoff = 1300, highpass = false){
            const src = ctx.createBufferSource();
            const filter = ctx.createBiquadFilter();
            const env = ctx.createGain();
            src.buffer = makeNoise();
            filter.type = highpass ? 'highpass' : 'lowpass';
            filter.frequency.value = cutoff;
            env.gain.setValueAtTime(0.0001, at);
            env.gain.linearRampToValueAtTime(level, at + Math.min(0.012, duration * 0.15));
            env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
            src.connect(filter).connect(env).connect(voice.gain);
            sourceIn(voice, src, at, at + duration + 0.01, [filter, env]);
        }
        function midi(note){ return 440 * Math.pow(2, (note - 69) / 12); }
        function refreshBurst(nowMs){
            if (nowMs - burstStart >= 1000){
                burstStart = nowMs;
                burstNormal = 0;
                burstPriority = 0;
            }
        }

        function play(kind, details = {}){
            if (!usable() || volumes.master === 0 || volumes.effects === 0 || typeof kind !== 'string') return false;
            const nowMs = Date.now();
            refreshBurst(nowMs);
            const priority = PRIORITY_SFX.has(kind);
            if (priority ? burstPriority >= 3 : burstNormal >= 13) return false;
            if (nowMs - (lastPlay.get(kind) || 0) < (COOLDOWN[kind] || 60)) return false;
            const at = ctx.currentTime;
            const v = newVoice(effectsGain, at, 0.75);
            if (!v) return false;
            const variant = (nowMs % 7) / 150;
            switch (kind){
                case 'melee':
                    noise(v, at, 0.115, 0.17, 2100, true);
                    tone(v, 190 + variant * 300, at, 0.12, 0.095, 'triangle', 0.48); break;
                case 'ranged':
                    noise(v, at, 0.09, 0.10, 2900, true);
                    tone(v, 580, at, 0.13, 0.07, 'triangle', 0.55); break;
                case 'wand':
                    tone(v, 460, at, 0.19, 0.085, 'sine', 1.75, 0.18);
                    tone(v, 920, at + 0.035, 0.15, 0.034, 'sine', 1.25); break;
                case 'damage':
                    noise(v, at, 0.11, 0.14, 1100);
                    tone(v, 155, at, 0.13, 0.10, 'triangle', 0.6); break;
                case 'kill':
                    tone(v, 330, at, 0.13, 0.08, 'triangle', 0.70);
                    tone(v, 247, at + 0.065, 0.16, 0.07, 'sine', 0.82); break;
                case 'spell': {
                    const spell = String(details && details.spell || '').toLowerCase();
                    const dark = /dark|shadow|poison|curse|sombr|veneno/.test(spell);
                    const fire = /fire|flame|fogo|meteor/.test(spell);
                    const base = dark ? 210 : fire ? 310 : 420;
                    tone(v, base, at, 0.32, 0.105, dark ? 'triangle' : 'sine', dark ? 0.75 : 1.6, 0.24);
                    tone(v, base * 1.5, at + 0.06, 0.22, 0.045, 'sine', 1.25);
                    if (fire) noise(v, at + 0.04, 0.18, 0.06, 1700);
                    break;
                }
                case 'pickup':
                    tone(v, 740, at, 0.15, 0.075, 'sine', 1.28); break;
                case 'levelup':
                    [523, 659, 784, 1047].forEach((hz, i) => tone(v, hz, at + i * 0.095, 0.32, 0.095, 'sine', 1, 0.22)); break;
                case 'death':
                    noise(v, at, 0.32, 0.09, 560);
                    tone(v, 196, at, 0.54, 0.11, 'triangle', 0.43, 0.15); break;
                case 'critical':
                    noise(v, at, 0.09, 0.16, 3500, true);
                    tone(v, 870, at, 0.21, 0.11, 'triangle', 1.3); break;
                case 'forgeSuccess':
                    noise(v, at, 0.08, 0.105, 2900, true);
                    [392, 494, 587, 784].forEach((hz, i) => tone(v, hz, at + i * 0.11, 0.38, 0.08, 'sine', 1, 0.20)); break;
                case 'forgeFailure':
                    noise(v, at, 0.10, 0.08, 780);
                    tone(v, 294, at, 0.26, 0.085, 'triangle', 0.72);
                    tone(v, 220, at + 0.13, 0.27, 0.06, 'sine', 0.85); break;
                case 'forgeCancelled':
                    tone(v, 410, at, 0.16, 0.045, 'sine', 0.9); break;
                case 'rareLoot':
                    [660, 880, 1320].forEach((hz, i) => tone(v, hz, at + i * 0.11, 0.42, 0.075, 'sine', 1.03, 0.25)); break;
                case 'bossReward':
                    [392, 523, 659, 784, 1047].forEach((hz, i) => tone(v, hz, at + i * 0.12, 0.46, 0.075, 'sine', 1, 0.25)); break;
                case 'trainingDone':
                    [440, 554, 659].forEach((hz, i) => tone(v, hz, at + i * 0.115, 0.24, 0.065, 'sine', 1, 0.12)); break;
                default:
                    voices.delete(v);
                    v.gain.disconnect();
                    return false;
            }
            lastPlay.set(kind, nowMs);
            if (priority) burstPriority++;
            else burstNormal++;
            return true;
        }

        // Existing pickup feedback passes a builder with this four-argument ABI.
        function playSfx(builder){
            if (!usable() || volumes.master === 0 || volumes.effects === 0 || typeof builder !== 'function') return false;
            const nowMs = Date.now();
            refreshBurst(nowMs);
            if (burstNormal >= 13) return false;
            try { builder(ctx, effectsGain, reverbInput, ctx.currentTime); }
            catch { return false; }
            burstNormal++;
            return true;
        }

        function startBed(){
            if (bed || !usable()) return;
            const src = ctx.createBufferSource();
            const filter = ctx.createBiquadFilter();
            const level = ctx.createGain();
            const p = BIOMES[scene.biome];
            src.buffer = makeNoise();
            src.loop = true;
            filter.type = 'bandpass';
            filter.frequency.value = p.freq;
            filter.Q.value = p.q;
            level.gain.value = 0;
            src.connect(filter).connect(level).connect(ambientGain);
            src.start();
            target(level.gain, p.level, 0.28);
            bed = { src, filter, level };
        }
        function stopBed(){
            if (!bed) return;
            const old = bed;
            bed = null;
            target(old.level.gain, 0, 0.04);
            try { old.src.stop(ctx.currentTime + 0.22); } catch {}
            old.src.onended = () => {
                old.src.disconnect(); old.filter.disconnect(); old.level.disconnect();
            };
        }
        function detail(at){
            if (voices.size >= 24) return;
            const p = BIOMES[scene.biome];
            const v = newVoice(ambientGain, at, 0.65, 24);
            if (!v) return;
            if (p.detail === 'bird'){
                tone(v, 1450, at, 0.09, 0.030, 'sine', 1.15);
                tone(v, 1670, at + 0.14, 0.08, 0.022, 'sine', 0.9);
            } else if (p.detail === 'drop'){
                tone(v, 720, at, 0.16, 0.043, 'sine', 0.58);
            } else if (p.detail === 'water'){
                noise(v, at, 0.52, 0.035, 950);
            } else {
                noise(v, at, 0.68, 0.022, p.detail === 'wind' ? 440 : 850);
            }
        }
        function note(at){
            if (volumes.music === 0) return;
            const score = SCORES[scoreName];
            const i = scoreStep++;
            const root = score.roots[Math.floor(i / 8) % score.roots.length];
            const melody = score.melody[i % score.melody.length];
            const v = newVoice(musicGain, at, 0.7, 24);
            if (!v) return;
            // Sparse harp/bell phrase over a soft sustained root. No sampled assets.
            if (i % 2 === 0){
                tone(v, midi(root), at, score.beat * 2.4, 0.043, 'triangle', 1);
                tone(v, midi(root + 7), at + 0.03, score.beat * 1.4, 0.020, 'sine', 1);
            }
            if (melody !== null){
                tone(v, midi(melody), at + 0.025, score.beat * 0.95, 0.047, 'sine', 1, 0);
                tone(v, midi(melody + 12), at + 0.03, score.beat * 0.48, 0.010, 'sine');
            }
            if (v.pending === 0){ voices.delete(v); v.gain.disconnect(); }
        }
        function chooseScore(){
            return scene.biome === 'pz' ? 'pz' : scene.biome === 'cave' ? 'dungeon' : 'field';
        }
        function tick(){
            if (!usable()) return;
            const horizon = ctx.currentTime + 0.30;
            let guard = 0;
            while (nextBeat < horizon && guard++ < 2){
                note(Math.max(ctx.currentTime + 0.012, nextBeat));
                nextBeat += SCORES[scoreName].beat;
            }
            if (nextDetail < horizon){
                if (volumes.ambient > 0) detail(Math.max(ctx.currentTime + 0.012, nextDetail));
                nextDetail = ctx.currentTime + 3.5 + Math.random() * 4.5;
            }
        }
        function stopVoices(){
            for (const v of [...voices]){
                target(v.gain.gain, 0, 0.008);
                for (const source of v.sources){
                    try { source.stop(ctx.currentTime + 0.08); } catch {}
                }
            }
        }
        function syncActivity(){
            syncGains();
            if (usable()){
                startBed();
                if (!timer){
                    nextBeat = ctx.currentTime + 0.06;
                    nextDetail = ctx.currentTime + 2.2;
                    timer = setInterval(tick, 100);
                    tick();
                }
            } else {
                if (timer){ clearInterval(timer); timer = null; }
                stopBed();
                stopVoices();
            }
        }
        function setVolumes(next){
            if (disposed || !next || typeof next !== 'object') return;
            for (const key of Object.keys(volumes)){
                if (Number.isFinite(next[key])) volumes[key] = Math.max(0, Math.min(100, next[key]));
            }
            syncGains();
        }
        function setScene(next){
            if (disposed || !next || typeof next !== 'object') return;
            const previousBiome = scene.biome;
            if (typeof next.biome === 'string' && BIOMES[next.biome]) scene.biome = next.biome;
            if (typeof next.combat === 'boolean') scene.combat = next.combat;
            if (typeof next.active === 'boolean') scene.active = next.active;
            const chosen = chooseScore();
            if (chosen !== scoreName){
                scoreName = chosen;
                scoreStep = 0;
                nextBeat = ctx.currentTime + 0.18;
            }
            if (scene.biome !== previousBiome && bed){
                const p = BIOMES[scene.biome];
                target(bed.filter.frequency, p.freq, 0.55);
                target(bed.filter.Q, p.q, 0.55);
                target(bed.level.gain, p.level, 0.55);
            }
            syncActivity();
        }
        function visibility(){ syncActivity(); }
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
        function dispose(){
            if (disposed) return;
            disposed = true;
            if (timer){ clearInterval(timer); timer = null; }
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility);
            stopBed();
            stopVoices();
            masterGain.gain.setValueAtTime(0, ctx.currentTime);
            // Keep the injected AudioContext under the caller's ownership.
            for (const node of [masterGain, effectsGain, ambientGain, musicGain, reverbInput, convolver, reverbWet]){
                try { node.disconnect(); } catch {}
            }
            noiseBuffer = null;
            impulse = null;
        }
        return { masterGain, effectsGain, reverbInput, setVolumes, setScene, play, playSfx, dispose };
    }
    return { create };
});
