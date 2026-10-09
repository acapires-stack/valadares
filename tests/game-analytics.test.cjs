const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'game-analytics.js'), 'utf8');
function setup(hostname = 'valadares.app.br', consent = 'granted') {
  const listeners = {};
  const events = [];
  const stored = new Map([['valadares_consent', consent]]);
  const session = new Map();
  const window = {
    __valadaresConsent: consent,
    gtag: (...args) => events.push(args),
    matchMedia: () => ({ matches: true }),
    addEventListener: (name, fn) => { listeners[name] = fn; }
  };
  const context = {
    window, document: { documentElement: { lang: 'pt-BR' }, referrer: '', addEventListener: () => {} },
    location: { hostname, pathname: '/', search: '?utm_source=tiktok&name=secret' },
    localStorage: { getItem: key => stored.get(key) || null },
    sessionStorage: { getItem: key => session.get(key) || null, setItem: (key, value) => session.set(key, value) },
    URLSearchParams, URL
  };
  vm.runInNewContext(source, context);
  return { events, stored, session, window, emit: detail => listeners['valadares:milestone']({ detail }) };
}

const normal = setup();
normal.emit({ event: 'sign_up', isTest: false });
normal.emit({ event: 'sign_up', isTest: false });
normal.emit({ event: 'first_combat', isTest: false });
normal.emit({ event: 'first_combat', isTest: false });
assert.deepEqual(normal.events.map(e => e[1]), ['sign_up', 'first_combat']);
assert.equal(normal.events[0][2].acquisition_source, 'tiktok');
assert.equal(normal.events[0][2].platform, 'mobile');
assert.equal(normal.events[0][2].language, 'pt');
assert(!JSON.stringify(normal.events).includes('secret'));

const denied = setup('valadares.app.br', 'denied');
denied.emit({ event: 'login', isTest: false });
assert.equal(denied.events.length, 0);
const local = setup('localhost');
local.emit({ event: 'login', isTest: false });
assert.equal(local.events.length, 0);
const test = setup();
test.emit({ event: 'login', isTest: true });
test.emit({ event: 'login', isAdmin: true, isTest: false });
test.emit({ event: 'user_name', isTest: false });
assert.equal(test.events.length, 0);
const unavailable = setup();
unavailable.window.gtag = undefined;
unavailable.emit({ event: 'sign_up', isTest: false });
assert.equal(unavailable.events.length, 0);
assert.equal(unavailable.session.size, 0);
const consentCode = fs.readFileSync(path.join(__dirname, '..', 'consent.js'), 'utf8');
function consentBoot(value) {
  const emitted = [];
  const appended = [];
  const context = {
    location: { hostname: 'valadares.app.br', pathname: '/jogar', search: '' }, navigator: { language: 'pt-BR' }, Date,
    localStorage: { getItem: key => key === 'valadares_consent' ? value : null },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    window: { dispatchEvent: event => emitted.push(event) },
    document: { readyState: 'complete', head: { appendChild: el => appended.push(el.src) }, createElement: () => ({}), getElementById: () => null }
  };
  vm.runInNewContext(consentCode, context);
  return { emitted, appended, context };
}
const refused = consentBoot('denied');
assert.equal(refused.appended.length, 0);
assert.equal(refused.emitted[0].detail.value, 'denied');
const accepted = consentBoot('granted');
assert.equal(accepted.appended.length, 1);
assert.equal(accepted.emitted[0].detail.value, 'granted');
assert.equal(typeof accepted.context.window.gtag, 'function');
console.log('game analytics: consent, deduplication, local/test/admin, unavailable tracker and privacy OK');
