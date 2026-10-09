(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ValadaresDailyRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function millis(now) {
        const value = now instanceof Date ? now.getTime() : Number(now === undefined ? Date.now() : now);
        if (!Number.isFinite(value)) throw new TypeError('invalid date');
        return value;
    }
    function todayKey(now) { return new Date(millis(now)).toISOString().slice(0, 10); }
    function nextResetAt(now) {
        const date = new Date(millis(now));
        return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
    }
    return Object.freeze({ todayKey, nextResetAt });
});
