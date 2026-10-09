const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../../daily-rules');

test('UTC daily boundary is 21h in Brasilia in October', () => {
    const before = Date.parse('2026-10-09T20:59:59-03:00');
    const after = before + 1000;
    assert.equal(rules.todayKey(before), '2026-10-09');
    assert.equal(rules.nextResetAt(before), after);
    assert.equal(rules.todayKey(after), '2026-10-10');
    assert.equal(rules.nextResetAt(after), Date.parse('2026-10-11T00:00:00Z'));
});

test('same contract is exposed to browser without CommonJS', () => {
    const context = vm.createContext({ Date, globalThis: {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../daily-rules.js'), 'utf8'), context);
    assert.equal(context.globalThis.ValadaresDailyRules.todayKey(Date.parse('2026-10-10T00:00:00Z')), '2026-10-10');
});
