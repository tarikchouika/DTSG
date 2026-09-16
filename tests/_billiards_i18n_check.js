/* تدقيق اكتمال 4 لغات للبلياردو: TR ×4، FULL_RULES ×4، الكتالوج n[]/d[] ×4 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const TR = require('../js/i18n/translations.js');

let pass = 0, fail = 0;
const ok = (m, c) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

function loadBrowser(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf-8');
  const elStub = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} });
  const doc = {
    createElement: elStub,
    getElementById: () => null,
    querySelector: () => null,
    body: elStub(), head: elStub(), documentElement: elStub()
  };
  const sandbox = { window: {}, document: doc, navigator: { language: 'ar' } };
  sandbox.module = { exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox;
}
const W1 = loadBrowser('js/games/catalog.js');
const W2 = loadBrowser('js/rules/game-rules.js');
const GAMES = W1.window.GAMES || W1.GAMES, RULES = W1.window.RULES || W1.RULES, FULL_RULES = W2.window.FULL_RULES || W2.FULL_RULES;
const LANGS = ['ar', 'da', 'fr', 'en'];   /* ترتيب مصفوفات TR: [ع، ف، إ، د] → نفحص العناصر الأربعة */

const four = a => Array.isArray(a) && a.length === 4 && a.every(x => typeof x === 'string' && x.trim().length > 0);

console.log('── 1) الكتالوج n[]/d[] ×4 ──');
for (const id of ['bl8', 'blbb', 'blsn', 'blca']) {
  const g = GAMES.find(x => x.id === id);
  ok(id + ': موجود بأربعة أسماء وأربعة أوصاف', !!g && four(g.n) && four(g.d));
  ok(id + ': قواعد مختصرة RULES غير فارغة', !!(RULES[id] && RULES[id].length && RULES[id][0].length));
}

console.log('── 2) FULL_RULES ×4 لغات ──');
for (const id of ['bl8', 'blbb', 'blsn', 'blca']) {
  const r = FULL_RULES[id];
  if (!r) { ok(id + ': FULL_RULES موجودة', false); continue; }
  ok(id + ': name/goal ×4', four(Object.values(r.name)) && LANGS.every(l => (r.goal[l] || '').trim()));
  ok(id + ': steps ×4 غير فارغة', LANGS.every(l => Array.isArray(r.steps[l]) && r.steps[l].length && r.steps[l].every(t => t.trim())));
  ok(id + ': details ×4 (عناوين+بنود)', LANGS.every(l => Array.isArray(r.details[l]) && r.details[l].every(d2 => d2.h && d2.items && d2.items.length)));
  ok(id + ': payouts/tips ×4', LANGS.every(l => (r.payouts[l] || '').trim()) && LANGS.every(l => Array.isArray(r.tips[l]) && r.tips[l].length));
}

console.log('── 3) كل مفاتيح T("bl.*") في الواجهة ×4 ──');
const src = fs.readFileSync(path.join(__dirname, '..', 'js/games/billiards.js'), 'utf-8');
const keys = new Set();
const re = /T\('(bl\.[A-Za-z0-9]+)'\)/g;
let m;
while ((m = re.exec(src))) keys.add(m[1]);
/* مفاتيح تُبنى ديناميكياً */
['bl.cRed', 'bl.cYellow', 'bl.cGreen', 'bl.cBrown', 'bl.cBlue', 'bl.cPink', 'bl.cBlack'].forEach(k => keys.add(k));
let missing = 0;
for (const k of keys) {
  if (!four(TR[k])) { missing++; console.log('    ! ناقص/فارغ: ' + k); }
}
ok(keys.size + ' مفتاحاً واجهياً كلها ×4 غير فارغة (' + missing + ' ناقص)', missing === 0);

console.log('── 4) مفاتيح الرسائل الجديدة لكل الأصناف ──');
const must = ['bl.hintSnooker', 'bl.hintCarom', 'bl.snNominatePrompt', 'bl.msgCaromOk', 'bl.caThree',
  'bl.reasonPoints', 'bl.reasonTarget', 'bl.suddenDeathMsg', 'bl.turnPlaceD', 'bl.msgSnookerStart'];
ok('مفاتيح المراحل 4-6 موجودة ×4', must.every(k => four(TR[k])));

console.log('\n═══ Billiards i18n: ' + pass + '/' + (pass + fail) + ' passed ═══');
process.exit(fail ? 1 : 0);
