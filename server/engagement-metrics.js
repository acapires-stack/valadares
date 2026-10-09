'use strict';
const daily = require('../daily-rules');
const MILESTONES = Object.freeze(['firstFightAt', 'firstQuestAt', 'rewardEquippedAt']);
const DAY_MS = 86400000;
const WINDOW_DAYS = 30;

function eligible(account, options = {}) {
    if (!account || account.engagementExcluded === true || options.isAdmin?.(account.name)) return false;
    const excluded = options.excludedNames || new Set();
    return !excluded.has(String(account.name || '').toLowerCase());
}
function validTime(value) { return Number.isSafeInteger(value) && value > 0; }
function noteLogin(account, now = Date.now()) {
    const at = Number(now), day = daily.todayKey(at);
    const current = account.engagement && typeof account.engagement === 'object' ? account.engagement : {};
    const days = Array.isArray(current.loginDays) ? current.loginDays.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
    if (!days.includes(day)) days.push(day);
    days.sort();
    const cutoff = daily.todayKey(at - (WINDOW_DAYS - 1) * DAY_MS);
    account.engagement = {
        ...current,
        firstLoginAt: validTime(current.firstLoginAt) ? current.firstLoginAt : at,
        lastLoginAt: at,
        loginDays: days.filter(d => d >= cutoff).slice(-WINDOW_DAYS),
    };
    return account.engagement;
}
function noteMilestone(account, key, now = Date.now()) {
    if (!MILESTONES.includes(key)) throw new TypeError('unknown milestone');
    const current = account?.engagement;
    if (!current || !validTime(current.firstLoginAt) || validTime(current[key])) return false;
    current[key] = Number(now);
    return true;
}
function aggregate(accounts, now = Date.now(), options = {}) {
    const today = daily.todayKey(now), cutoff = daily.todayKey(Number(now) - (WINDOW_DAYS - 1) * DAY_MS);
    const result = {
        asOfDay: today, windowDays: WINDOW_DAYS, measuredAccounts: 0,
        milestones: { firstFight: 0, firstQuest: 0, rewardEquipped: 0 },
        retention: { d1: { returned: 0, eligible: 0 }, d7: { returned: 0, eligible: 0 } },
        cohorts: [],
    };
    const cohorts = new Map();
    for (const account of accounts) {
        if (!eligible(account, options)) continue;
        const e = account.engagement;
        if (!e || !validTime(e.firstLoginAt)) continue; // saves antigos não são logins
        result.measuredAccounts++;
        for (const [field, label] of [['firstFightAt','firstFight'], ['firstQuestAt','firstQuest'], ['rewardEquippedAt','rewardEquipped']])
            if (validTime(e[field])) result.milestones[label]++;
        const first = daily.todayKey(e.firstLoginAt);
        if (first < cutoff || first > today) continue;
        let cohort = cohorts.get(first);
        if (!cohort) { cohort = { day:first, firstLogins:0, d1:{returned:0,eligible:0}, d7:{returned:0,eligible:0} }; cohorts.set(first, cohort); }
        cohort.firstLogins++;
        const days = new Set(Array.isArray(e.loginDays) ? e.loginDays : []);
        for (const [label, offset] of [['d1', 1], ['d7', 7]]) {
            const target = daily.todayKey(e.firstLoginAt + offset * DAY_MS);
            if (target > today) continue;
            cohort[label].eligible++;
            result.retention[label].eligible++;
            if (days.has(target)) { cohort[label].returned++; result.retention[label].returned++; }
        }
    }
    result.cohorts = [...cohorts.values()].sort((a,b) => a.day.localeCompare(b.day));
    return result;
}
module.exports = { eligible, noteLogin, noteMilestone, aggregate, WINDOW_DAYS };
