const test = require('node:test');
const assert = require('node:assert/strict');
const metrics = require('../engagement-metrics');
const DAY = 86400000;
const first = Date.parse('2026-10-01T20:00:00Z');

test('logins and milestones are unique, durable on the account, and do not rewrite a save', () => {
    const oldSave = { gold: 77, quests: { completed: ['q_ratos'] } };
    const account = { name:'Real', save:oldSave, createdAt:first - DAY };
    assert.equal(metrics.noteMilestone(account, 'firstFightAt', first), false);
    metrics.noteLogin(account, first);
    metrics.noteLogin(account, first + 1000);
    assert.deepEqual(account.engagement.loginDays, ['2026-10-01']);
    assert.equal(account.engagement.firstLoginAt, first);
    assert.equal(metrics.noteMilestone(account, 'firstFightAt', first + 2000), true);
    assert.equal(metrics.noteMilestone(account, 'firstFightAt', first + 3000), false);
    assert.equal(account.engagement.firstFightAt, first + 2000);
    assert.strictEqual(account.save, oldSave);
    assert.deepEqual(account.save, oldSave);
    const reloaded = JSON.parse(JSON.stringify(account));
    metrics.noteLogin(reloaded, first + DAY);
    assert.equal(reloaded.engagement.firstLoginAt, first);
    assert.equal(reloaded.engagement.firstFightAt, first + 2000);
});

test('D1/D7 count eligible cohorts with denominators; admin and explicit QA flags are excluded', () => {
    const returning = { name:'Pessoa', save:{}, createdAt:first - 100 * DAY };
    metrics.noteLogin(returning, first);
    metrics.noteLogin(returning, first + DAY);
    metrics.noteLogin(returning, first + 7 * DAY);
    metrics.noteMilestone(returning, 'firstQuestAt', first + DAY);
    const absent = { name:'Ausente' };
    metrics.noteLogin(absent, first);
    const admin = { name:'alcione' };
    metrics.noteLogin(admin, first);
    const qa = { name:'qa', engagementExcluded:true };
    metrics.noteLogin(qa, first);
    const local = { name:'localtest' };
    metrics.noteLogin(local, first);
    const oldSaveOnly = { name:'Legado', save:{ stats:{ mobKills:{ RAT:20 } } }, createdAt:first - 30 * DAY };
    const result = metrics.aggregate([returning,absent,admin,qa,local,oldSaveOnly], first + 8 * DAY, {
        isAdmin:name => name === 'alcione', excludedNames:new Set(['localtest']),
    });
    assert.equal(result.measuredAccounts, 2);
    assert.deepEqual(result.retention.d1, { returned:1, eligible:2 });
    assert.deepEqual(result.retention.d7, { returned:1, eligible:2 });
    assert.equal(result.milestones.firstQuest, 1);
    assert.equal(result.cohorts.length, 1);
    assert.equal(result.cohorts[0].firstLogins, 2);
    assert.ok(!JSON.stringify(result).includes('Pessoa'));
});

test('same-day return is not D1 and immature cohorts stay out of denominator', () => {
    const account = {name:'Novo'};
    metrics.noteLogin(account, first);
    metrics.noteLogin(account, first + 3600000);
    const result = metrics.aggregate([account], first + 2 * 3600000);
    assert.deepEqual(result.retention.d1, { returned:0, eligible:0 });
    assert.deepEqual(result.retention.d7, { returned:0, eligible:0 });
});
