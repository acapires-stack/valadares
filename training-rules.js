(function (root, factory) {
    const rules = factory();
    if (typeof module === 'object' && module.exports) module.exports = rules;
    else root.ValadaresTrainingRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function safeInteger(value, label, minimum) {
        if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(label + ' must be a safe integer >= ' + minimum);
        return value;
    }
    function validSkill(skill) {
        if (!skill || typeof skill !== 'object') throw new TypeError('skill is required');
        const val = safeInteger(skill.val, 'skill.val', 1);
        const xp = safeInteger(skill.xp, 'skill.xp', 0);
        const xpNext = safeInteger(skill.xpNext, 'skill.xpNext', 1);
        if (xp >= xpNext) throw new RangeError('skill.xp must be below skill.xpNext');
        return { val, xp, xpNext };
    }
    function cost(level) {
        safeInteger(level, 'level', 1);
        const price = Math.max(5, Math.ceil(2 * level * Math.max(1, (level / 50) ** 2)));
        if (!Number.isSafeInteger(price)) throw new RangeError('training cost is out of range');
        return price;
    }
    function sessionXp(skill, { xpBonus = 0, wisdom = false } = {}) {
        if (!skill || !Number.isSafeInteger(skill.xpNext) || skill.xpNext < 1) throw new RangeError('skill.xpNext must be a positive safe integer');
        if (!Number.isFinite(xpBonus) || xpBonus < 0 || typeof wisdom !== 'boolean') throw new RangeError('invalid XP modifiers');
        // Mesma ordem do servidor: base inteira, truncamento de amount, dois rounds independentes.
        let amount = Math.max(1, Math.floor(skill.xpNext / 60)) | 0;
        if (amount <= 0) throw new RangeError('training XP is out of range');
        if (xpBonus > 0) amount = Math.round(amount * (1 + xpBonus));
        if (wisdom) amount = Math.round(amount * 1.5);
        if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError('training XP is out of range');
        return amount;
    }
    function quote(skill, count, { gold = Infinity, xpBonus = 0, wisdom = false } = {}) {
        const state = validSkill(skill);
        if (count !== Infinity) safeInteger(count, 'count', 0);
        if (gold !== Infinity) safeInteger(gold, 'gold', 0);
        if (count === Infinity && gold === Infinity) throw new RangeError('MAX requires finite gold');
        let sessions = 0, spent = 0, steps = 0;
        while (sessions < count) {
            if (++steps > 100000) throw new RangeError('training quote exceeds simulation limit');
            const price = cost(state.val);
            const affordable = gold === Infinity ? Infinity : Math.floor((gold - spent) / price);
            if (affordable <= 0) break;
            const gain = sessionXp(state, { xpBonus, wisdom });
            const toLevel = Math.ceil((state.xpNext - state.xp) / gain);
            const batch = Math.min(count - sessions, affordable, toLevel);
            if (!Number.isSafeInteger(batch) || batch <= 0 ||
                !Number.isSafeInteger(spent + batch * price) ||
                !Number.isSafeInteger(state.xp + batch * gain)) throw new RangeError('training quote is out of range');
            sessions += batch;
            spent += batch * price;
            state.xp += batch * gain;
            while (state.xp >= state.xpNext) {
                state.xp -= state.xpNext;
                state.val += 1;
                state.xpNext = Math.floor(state.xpNext * 1.15);
                if (!Number.isSafeInteger(state.xpNext) || !Number.isSafeInteger(state.val)) throw new RangeError('skill level is out of range');
            }
        }
        return { sessions, cost:spent, skill:state };
    }
    return { cost, sessionXp, quote };
});
