/* اختبار محرك اللحاق ClockCatchup — node خالص */
'use strict';
const fs = require('fs'), vm = require('vm');
const ctx = { console, Date, Math, JSON, Set, Map, Array, Object, Number, String, setTimeout: (fn) => fn(), window: {}, _ramiToast: () => {}, SND: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/games/rami.js', 'utf8'), ctx);

let pass = 0, fail = 0;
const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? ' ✓ ' : ' ✗ ') + l); };

const run = (code) => vm.runInContext(code, ctx);

/* 1) غياب 15 دوراً على جولة 3 لاعبين (بوتان) */
run(`
var g = new RamiGame('simple', 3, 2, 777, 90);
g.startMatch(101);
__t = { beforeHands: g.players.map(p => p.hand.length),
  integrity1: g.roundManager.drawPile.length + g.roundManager.discardPile.length + g.players.reduce((a,p)=>a+p.hand.length,0) + g.roundManager.tableMelds.reduce((a,m)=>a+m.cards.length,0) };
__t.caught = ramiCatchupOnResume(g, Date.now() - 15 * 90 * 1000);
__t.afterHands = g.players.map(p => p.hand.length);
__t.integrity2 = g.roundManager.drawPile.length + g.roundManager.discardPile.length + g.players.reduce((a,p)=>a+p.hand.length,0) + g.roundManager.tableMelds.reduce((a,m)=>a+m.cards.length,0);
__t.phase = g.gamePhase;
`);
const t1 = run('__t');
console.log('لحق:', t1.caught, '| أيد:', t1.beforeHands.join(','), '→', t1.afterHands.join(','), '| أوراق:', t1.integrity1, '→', t1.integrity2, '| phase:', t1.phase);
ok(['PLAYING', 'ROUND_END', 'MATCH_END'].includes(t1.phase), 'طور صالح بعد اللحاق');
ok(t1.integrity1 === t1.integrity2 || t1.integrity2 < t1.integrity1, 'سلامة الأوراق (لا اختلاق)');
ok(t1.afterHands.every(h => h >= 0 && h <= 15), 'كل الأيدي سليمة');
ok(t1.caught >= 12 && t1.caught <= 17, 'لحق ≈15 دوراً: ' + t1.caught);

/* 2) غياب هائل 500 دور — سقف الأمان */
run(`
var g2 = new RamiGame('simple', 2, 1, 888, 90);
g2.startMatch(101);
__t2 = { caught: ramiCatchupOnResume(g2, Date.now() - 500 * 90 * 1000), phase: g2.gamePhase };
`);
const t2 = run('__t2');
ok(t2.caught >= 0 && t2.caught <= 400 && t2.phase !== 'LOBBY', 'سقف 400 دور يعمل (لحق ' + t2.caught + '، phase=' + t2.phase + ')');

/* 3) غياب قصير (30 ث) — لا لحق، فقط قصّ المؤقت */
run(`
var g3 = new RamiGame('simple', 2, 1, 999, 90);
g3.startMatch(101);
__b3 = g3.roundManager.turnSecondsRemaining;
__t3 = { caught: ramiCatchupOnResume(g3, Date.now() - 30 * 1000), remaining: g3.roundManager.turnSecondsRemaining };
`);
const t3 = run('__t3');
ok(t3.caught === 0 && t3.remaining < 90, 'غياب قصير: لا لحق، مؤقت مقصوص (' + t3.remaining + 'ث)');

/* 4) غياب صفر (استئناف فوري) */
run(`
var g4 = new RamiGame('talaj', 2, 1, 111, 90);
g4.startMatch(501);
__t4 = { caught: ramiCatchupOnResume(g4, Date.now()), phase: g4.gamePhase, remaining: g4.roundManager.turnSecondsRemaining };
`);
const t4 = run('__t4');
ok(t4.caught === 0 && t4.phase === 'PLAYING', 'استئناف فوري: صفر لحق، اللعب حي');

console.log('═══ محرك اللحاق: ' + pass + ' ✓ / ' + fail + ' ✗');
process.exit(fail ? 1 : 0);
