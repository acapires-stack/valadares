// Synthetic review accounts only. Run while preview 3338/8098 is stopped.
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '.local-premium', 'accounts.json');
const document = JSON.parse(fs.readFileSync(file, 'utf8'));
const base = document.accounts.find(account => account.name === 'TesteVal18');
if (!base) throw new Error('Missing synthetic preview fixture');
const names = ['RevisaoRoot', 'RevisaoAudio', 'RevisaoAtores', 'AmbienteUX', 'RevisaoRuntime'];
const added = [];
for (const name of names) {
  if (document.accounts.some(account => account.name.toLowerCase() === name.toLowerCase())) continue;
  const account = structuredClone(base);
  account.name = name;
  account.createdAt = account.savedAt = Date.now();
  account.email = null;
  account.emailVerified = false;
  account.resetToken = null;
  account.save.x = 50; account.save.y = 50; account.save.floor = 0;
  delete account.save._interior;
  account.save.gold = 12000;
  account.save.inv = {...account.save.inv, ESPADA_ACO: 1, ARCO: 1, CAJADO_FOGO: 1,
    MACHADO_MINO: 1, PORRETE: 1, LANCA: 3, POTION: 60, POTION_MP: 60,
    OSSO: 30, ASA_MORCEGO: 30, SILK: 30};
  account.save.equipped.weapon = 'ESPADA_ACO';
  account.save.pvp = false;
  account.save.savedAt = Date.now();
  document.accounts.push(account); added.push(name);
}
if (added.length) {
  const backup = path.join(path.dirname(file), 'accounts-before-professional-review.json');
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  document.savedAt = Date.now();
  fs.writeFileSync(file, JSON.stringify(document));
}
console.log(JSON.stringify({syntheticOnly: true, added, accounts: document.accounts.length}));
