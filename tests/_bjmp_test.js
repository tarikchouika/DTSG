/* [BJMP] اختبار وحدوي لمحرك بلاك جاك الجماعي — دوال نقية بلا DOM
   يحمل blackjack.js ببيئة node مبسطة (global.window stub) ثم يختبر:
   newRound لثلاثة لاعبين، applyAct hit حتى bust، stand، settle (فائز/رسم 5%/تعادل).
   Run: node tests/_bjmp_test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ── بيئة مُبسّطة: BJMP معرّفة فوق كل الكود المعتمد على DOM ── */
const sandbox = {
  console: console, Math: Math, JSON: JSON, Date: Date,
  setTimeout: function (fn) { /* تنفيذ فوري للاختبار */ },
  clearTimeout: function () {},
  parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN,
  String: String, Number: Number, Array: Array, Object: Object,
  /* stubs للكائنات العامة التي يلمسها الملف عند التحميل/الاستدعاء */
  T: function (k) { return k; },
  fmt: function (n) { return String(n); },
  Rooms: { state: null },
  SND: {}, ST: { gold: 1000 },
  API: { post: function () { return Promise.resolve({ ok: true }); } },
  AUTH: { user: null },
  GAMES: [],
  document: {
    getElementById: function () { return null; },
    querySelectorAll: function () { return []; }
  },
  toast: function () {},
  localStorage: { getItem: function () { return null; }, setItem: function () {} }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'blackjack.js'), 'utf8'),
  sandbox
);
const BJMP = sandbox.window.BJMP;
if (!BJMP) { console.error('✗ BJMP غير معرّف على window'); process.exit(1); }

const results = [];
function ok(name, cond) {
  results.push(!!cond);
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
}

/* ── 1) newRound: ثلاثة لاعبين — ورقتان لكل، مجموع صحيح، turnIdx أول غير منتهٍ ── */
const P = [
  { id: 1, name: 'أمين' },
  { id: 2, name: 'سارة' },
  { id: 3, name: 'يوسف' }
];
const BET = 100;
let snap = BJMP.newRound(P, 42, BET);
ok('newRound: 3 players', snap.players.length === 3);
ok('newRound: two cards each', snap.players.every(p => p.cards.length === 2));
ok('newRound: totals computed', snap.players.every(p => p.total >= 2 && p.total <= 21));
ok('newRound: bet stored', snap.bet === BET);
ok('newRound: deck = 52 - 6 = 46', snap.deck.length === 46);
ok('newRound: phase play', snap.phase === 'play');
ok('newRound: seq starts 1', snap.seq === 1);
/* المجموع الفعلي من الأوراق يطابق total (بآسات مرنة) */
ok('newRound: hand total matches cards', snap.players.every(p => {
  let v = 0, a = 0;
  p.cards.forEach(c => { v += (c.r === 'A' ? 11 : (['J','Q','K'].indexOf(c.r) >= 0 ? 10 : parseInt(c.r, 10))); if (c.r === 'A') a++; });
  while (v > 21 && a > 0) { v -= 10; a--; }
  return v === p.total;
}));

/* ── 2) applyAct: فعل غير صاحب الدور مرفوض؛ snapshot الأصل لا يُعدَّل ── */
const wrongPid = snap.players[snap.turnIdx].id === 1 ? 2 : 1;
const snapBefore = JSON.stringify(snap);
const rejected = BJMP.applyAct(snap, wrongPid, 'hit');
ok('applyAct: rejects non-turn player', JSON.stringify(rejected) === snapBefore);
ok('applyAct: original snapshot untouched', JSON.stringify(snap) === snapBefore);

/* ── 3) hit حتى bust: نضبط يد أول لاعب لـ 20 ثم نسحب حتى الفوز/الاحتراق ── */
/* نعيد البناء يدوياً لسيناريو محكوم: يد 20 → hit غالباً bust */
let s2 = BJMP.newRound([{ id: 10, name: 'A' }, { id: 20, name: 'B' }], 1, BET);
s2.players[0].cards = [{ s: '♠', r: '10' }, { s: '♥', r: '10' }];
s2.players[0].total = 20;
s2.players[0].done = false;
s2.players[0].stood = false;
s2.turnIdx = 0;
/* ندفع ورقة Q لأعلى المجموعة (pop) */
s2.deck.push('Q♠');
let ns = BJMP.applyAct(s2, 10, 'hit');
ok('hit: bust over 21 (20+10=30)', ns.players[0].busted === true && ns.players[0].done === true && ns.players[0].total === 30);
ok('hit: seq increments', ns.seq === s2.seq + 1);
ok('hit: snapshot is new (pure)', JSON.stringify(s2.players[0]) !== JSON.stringify(ns.players[0]));

/* ── 4) stand: وقوف اللاعب الثاني ثم double ── */
s2 = BJMP.newRound([{ id: 10, name: 'A' }, { id: 20, name: 'B' }], 1, BET);
s2.players[0].cards = [{ s: '♠', r: '5' }, { s: '♥', r: '5' }];
s2.players[0].total = 10;
s2.players[0].done = false; s2.players[0].stood = false;
s2.turnIdx = 0;
ns = BJMP.applyAct(s2, 10, 'stand');
ok('stand: stood + done', ns.players[0].stood === true && ns.players[0].done === true);
ok('stand: turn moves to next', ns.turnIdx === 1);

/* double: ورقتان فقط — سحب واحدة ثم done */
let s3 = BJMP.newRound([{ id: 30, name: 'X' }, { id: 40, name: 'Y' }], 1, BET);
s3.players[0].cards = [{ s: '♠', r: '6' }, { s: '♥', r: '5' }];
s3.players[0].total = 11;
s3.players[0].done = false; s3.players[0].stood = false;
s3.turnIdx = 0;
s3.deck.push('9♦');
ns = BJMP.applyAct(s3, 30, 'double');
ok('double: one card drawn (3 cards)', ns.players[0].cards.length === 3);
ok('double: doubled + stood + done', ns.players[0].doubled === true && ns.players[0].stood === true && ns.players[0].done === true);
ok('double: total updated (11+9=20)', ns.players[0].total === 20);

/* double مرفوض بعد 3 أوراق (ليست الورقتين الأولى) */
let s4 = BJMP.newRound([{ id: 50, name: 'M' }, { id: 60, name: 'N' }], 1, BET);
s4.players[0].cards = [{ s: '♠', r: '2' }, { s: '♥', r: '3' }, { s: '♦', r: '4' }];
s4.players[0].total = 9;
s4.players[0].done = false;
s4.turnIdx = 0;
const before4 = JSON.stringify(s4);
ok('double: rejected with 3+ cards', JSON.stringify(BJMP.applyAct(s4, 50, 'double')) === before4);

/* ── 5) settle: فائز واحد — الأعلى دون 21 — القدح = 3×bet، الفائز يستلم round(bet*3*0.95) ── */
let s5 = BJMP.newRound(P, 7, BET);
/* نضبط الأيدي صراحة: لاعب1=20 (فائز)، لاعب2=17، لاعب3=احترق */
s5.players[0].cards = [{ s: '♠', r: '10' }, { s: '♥', r: 'K' }];
s5.players[0].total = 20; s5.players[0].done = true; s5.players[0].stood = true; s5.players[0].busted = false;
s5.players[1].cards = [{ s: '♦', r: '10' }, { s: '♣', r: '7' }];
s5.players[1].total = 17; s5.players[1].done = true; s5.players[1].stood = true; s5.players[1].busted = false;
s5.players[2].cards = [{ s: '♠', r: '10' }, { s: '♥', r: '10' }, { s: '♦', r: '5' }];
s5.players[2].total = 25; s5.players[2].done = true; s5.players[2].busted = true; s5.players[2].stood = false;
s5.phase = 'play';
s5.turnIdx = -1;
const out5 = BJMP.settle(s5);
ok('settle: returns {snap, results}', !!(out5 && out5.snap && Array.isArray(out5.results)));
ok('settle: single winner is highest ≤21', out5.results.filter(r => r.won).length === 1 && out5.results[0].id === 1);
/* القدح = مجموع رهانات الجميع = 3×100 = 300 — الفائز: round(300×0.95) = 285 */
const expected5 = Math.round(BET * 3 * 0.95);
ok('settle: pot = 3×bet, winner takes round(3×bet×0.95) = ' + expected5, out5.results[0].share === expected5);
ok('settle: phase settled', out5.snap.phase === 'settled');
ok('settle: losers get 0', out5.results[1].share === 0 && out5.results[2].share === 0);

/* settle قبل اكتمال done → null */
let s6 = BJMP.newRound(P, 8, BET);
s6.players[1].done = false;
s6.turnIdx = 1;
ok('settle: null before all done', BJMP.settle(s6) === null);

/* ── 6) settle: تعادل اثنين — يتقاسمان round(pot×0.95) بالتساوي ── */
let s7 = BJMP.newRound([{ id: 71, name: 'T1' }, { id: 72, name: 'T2' }], 9, BET);
s7.players[0].cards = [{ s: '♠', r: '10' }, { s: '♥', r: '9' }];
s7.players[0].total = 19; s7.players[0].done = true; s7.players[0].stood = true;
s7.players[1].cards = [{ s: '♦', r: '10' }, { s: '♣', r: '9' }];
s7.players[1].total = 19; s7.players[1].done = true; s7.players[1].stood = true;
s7.phase = 'play';
s7.turnIdx = -1;
const out7 = BJMP.settle(s7);
ok('tie: two winners', out7.results.filter(r => r.won).length === 2);
/* القدح = 2×100 = 200 → صافي 190 → لكل 95 */
const net7 = Math.round(BET * 2 * 0.95);
ok('tie: each share = floor(' + net7 + '/2) = 95', out7.results.every(r => r.share === 95));
ok('tie: sum = net pot', out7.results.reduce((a, r) => a + r.share, 0) === net7);

/* ── 7) جولة كاملة ثلاثة لاعبين عبر التدفق الفعلي: hit/stand حتى done ثم settle ── */
let s8 = BJMP.newRound(P, 11, BET);
let guard = 0;
while (s8.phase === 'play' && guard++ < 60) {
  const cur = s8.players[s8.turnIdx];
  if (!cur || s8.turnIdx < 0) break;
  const act = (cur.total <= 11 || (cur.cards.length === 2 && cur.total >= 9 && cur.total <= 11)) ? 'hit' : 'stand';
  const nsx = BJMP.applyAct(s8, cur.id, act);
  if (nsx === s8) { /* حركة غير نافذة (فعل آخر مثلاً) */ break; }
  s8 = nsx;
}
ok('flow: all done after play', s8.players.every(p => p.done));
const out8 = BJMP.settle(s8);
ok('flow: settle completes real round', !!out8 && out8.snap.phase === 'settled');
/* القدح الصحيح: الفائز الواحد (أو المتعادلون) يتقاسمون net — لا تجاوز */
if (out8) {
  const winners8 = out8.results.filter(r => r.won);
  const live8 = s8.players.filter(p => !p.busted);
  ok('flow: winner count = live top-tie count', winners8.length === (live8.length ? live8.filter(p => p.total === Math.max.apply(null, live8.map(q => q.total))).length : 0));
  const net8 = Math.round(BET * 3 * 0.95);
  ok('flow: total payout = round(3×bet×0.95)', out8.results.reduce((a, r) => a + r.share, 0) === (live8.length ? net8 : 0));
}

/* ── 8) حالة الكل محترق: لا فائز — الأسهم 0 ── */
let s9 = BJMP.newRound([{ id: 91, name: 'B1' }, { id: 92, name: 'B2' }], 12, BET);
s9.players[0].busted = true; s9.players[0].done = true; s9.players[0].total = 22;
s9.players[1].busted = true; s9.players[1].done = true; s9.players[1].total = 25;
s9.phase = 'play';
s9.turnIdx = -1;
const out9 = BJMP.settle(s9);
ok('all-bust: no winners', out9.results.every(r => !r.won && r.share === 0));

const passed = results.filter(Boolean).length;
console.log('\n═══ BJMP unit test: ' + passed + '/' + results.length + ' passed ═══');
process.exit(passed === results.length ? 0 : 1);
