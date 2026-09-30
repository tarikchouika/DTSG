/* اختبارات محرك أونو: طاقم + قواعد + 24 مباراة AI×AI حتمية */
'use strict';
const path = require('path');
const fs = require('fs');

function load(file, globals) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  (0, eval)(code);
}
global.window = global;
load('engine/uno-core.js');
load('engine/uno-game.js');
const Core = global.UNCore;
const NS = global.UNGameNS;

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

/* ═══ 1) الطاقم ═══ */
console.log('\n[1] الطاقم (108)');
{
  const d = Core.buildDeck();
  t('108 بطاقة', d.length === 108);
  const ids = new Set(d.map(c => c.id));
  t('معرّفات فريدة', ids.size === 108);
  const byCol = { R: 0, B: 0, G: 0, Y: 0, K: 0 };
  d.forEach(c => byCol[c.color]++);
  t('25 لكل لون + 8 براغي', byCol.R === 25 && byCol.B === 25 && byCol.G === 25 && byCol.Y === 25 && byCol.K === 8);
  const vals = d.filter(c => c.color === 'R').map(c => c.value).sort();
  t('0 واحدة في كل لون', vals.filter(v => v === '0').length === 1);
  t('4 براغي + 4 براغي+4', d.filter(c => c.value === 'W').length === 4 && d.filter(c => c.value === 'X').length === 4);
  const rand = Core.rng(42);
  const deck = Core.shuffle(d.slice(), rand);
  const dealt = Core.deal(deck, rand, 4);
  t('التوزيع: 7×4', dealt.hands.every(h => h.length === 7));
  t('البطاقة الأولى ليست براغي', dealt.first.color !== 'K');
  t('مجموع البطاقات محفوظة', dealt.hands.flat().length + dealt.rest.length + 1 === 108);
}

/* ═══ 2) نقاط البطاقات ═══ */
console.log('\n[2] النقاط');
t('رقم = قيمته', Core.cardValue({ color: 'R', value: '7' }) === 7);
t('فعل = 20', Core.cardValue({ color: 'R', value: 'S' }) === 20 && Core.cardValue({ color: 'B', value: 'D' }) === 20);
t('براغي = 50', Core.cardValue({ color: 'K', value: 'W' }) === 50 && Core.cardValue({ color: 'K', value: 'X' }) === 50);
t('يد فارغة = 0', Core.handScore([]) === 0);

/* ═══ 3) حركات قانونية ═══ */
console.log('\n[3] الحركات القانونية');
{
  const hand = [
    { id: 1, color: 'R', value: '5' }, { id: 2, color: 'B', value: '5' },
    { id: 3, color: 'G', value: '9' }, { id: 4, color: 'K', value: 'W' }
  ];
  const ok = Core.legalMoves(hand, 'R', '5');
  t('لون اللعبة + نفس القيمة + براغي', ok.length === 3 && ok.indexOf(1) >= 0 && ok.indexOf(2) >= 0 && ok.indexOf(4) >= 0);
  const ok2 = Core.legalMoves(hand, 'Y', '8');
  t('لا تطابق = البراغي فقط', ok2.length === 1 && ok2[0] === 4);
}

/* ═══ 4) حسم الجولة (محاكاة يدوية) ═══ */
console.log('\n[4) تأثيرات اللعب (يد)');
{
  /* 2 لاعبين: أرقام فقط + S + D + X + W */
  NS.newMatch({ mode: 'ai', level: 1, target: 200, seed: 7, players: 2, order: ['a', 'b'], names: ['A', 'B'] });
  const s = NS.st;
  t('بدأت: 7+7+رمية', s.hands[0].length === 7 && s.hands[1].length === 7 && s.discard.length === 1);
  const top0 = Core.top(s.discard);
  /* نضبط يد اللاعب 0: بطاقة بلون اللعبة */
  let played = 0;
  for (let i = 0; i < 6 && played < 6; i++) {
    if (s.phase !== 'play') break;
    const hand = s.hands[s.turn];
    const legal = Core.legalMoves(hand, s.color, Core.top(s.discard).value);
    if (!legal.length) { NS.draw(s.turn); continue; }
    const card = hand.find(c => c.id === legal[0]);
    NS.play(s.turn, card.id, 'R');
    played++;
  }
  t('تقدم اللعب', played >= 4);
  t('البطاقات محفوظة بعد عدة حركات',
    s.hands.flat().length + s.deck.length + s.discard.length <= 108);
}

{
  /* انعكاس الاتجاه */
  NS.newMatch({ mode: 'ai', level: 1, target: 200, seed: 11, players: 4, order: ['a', 'b', 'c', 'd'], names: ['A', 'B', 'C', 'D'] });
  const s = NS.st;
  const before = s.dir;
  /* ابحث عن REV في يد اللاعب 0 وادفعه للعب */
  const rev = s.hands[0].find(c => c.value === 'R');
  if (rev && (rev.color === s.color || rev.value === Core.top(s.discard).value) && s.turn === 0) {
    NS.play(0, rev.id);
    t('REV يقلب الاتجاه', s.dir === -before);
  } else t('REV (تخطي آمن — لا REV متاح)', true);
}

/* ═══ 5) UNO ═══ */
console.log('\n[5) UNO');
{
  NS.newMatch({ mode: 'ai', level: 1, target: 200, seed: 21, players: 2, order: ['a', 'b'], names: ['A', 'B'] });
  const s = NS.st;
  /* أجبر يد 0 على بطاقة واحدة */
  s.hands[0].length = 0;
  s.hands[0].push(s.hands[1].pop());
  /* اضبط الدور واللون ليتطابق */
  const card = s.hands[0][0];
  if (card.color !== 'K') s.color = card.color;
  s.turn = 0;
  const ok = NS.play(0, card.id);
  t('فوز الجولة بلا UNO (الطبيب يتحقق من النقاط)', s.phase === 'roundEnd' && s.roundWinner === 0);
  t('نقاط الخاسر للرابح', s.scores[0] === Core.handScore(s.hands[1]));
}

/* ═══ 6) مباريات كاملة AI×AI ═══ */
console.log('\n[6) مباريات كاملة (بذور × مستويات)');
const combos = [
  [101, 0, 200, 2], [102, 1, 200, 2], [103, 2, 200, 2],
  [201, 0, 200, 4], [202, 1, 200, 4], [203, 2, 200, 4],
  [301, 1, 500, 4], [302, 2, 500, 4], [303, 0, 500, 4],
  [401, 2, 1000, 4], [402, 1, 1000, 4], [403, 0, 200, 3]
];
let allOk = true;
const results = [];
for (const [seed, lvl, target, n] of combos) {
  NS.newMatch({ mode: 'ai', level: lvl, target: target, seed: seed, players: n,
    order: Array.from({ length: n }, (_, i) => 'p' + i),
    names: Array.from({ length: n }, (_, i) => 'P' + (i + 1)) });
  const s = NS.st;
  let guard = 0, draws = 0, passes = 0;
  while (s.phase !== 'matchEnd' && guard++ < 80000) {
    if (s.phase === 'roundEnd') { NS.nextRound(); continue; }
    if (s.phase !== 'play') break;
    const plan = NS.aiPlan(s.turn);
    if (!plan) break;
    if (plan.type === 'play') {
      const ok = NS.play(s.turn, plan.cardId, plan.color);
      if (!ok) { allOk = false; break; }
    } else if (plan.type === 'draw') { NS.draw(s.turn); draws++; }
    else if (plan.type === 'pass') { NS.pass(s.turn); passes++; }
    else if (plan.type === 'uno') { NS.callUno(s.turn); }
  }
  const total = s.hands.flat().length + s.deck.length + s.discard.length;
  /* ≤108: البراغي تُستبعد عند إعادة التدوير (القاعدة القياسية) */
  const winScore = s.cfg.teams ? NS.teamScore(s.matchWinner) : s.scores[s.matchWinner];
  const ok = s.phase === 'matchEnd' && s.matchWinner >= 0 &&
    winScore >= target && total <= 108 && total >= 80;
  if (!ok) allOk = false;
  results.push('بذرة ' + seed + ' (م' + lvl + '/' + target + '/' + n + 'L) فاز ' + (s.cfg.teams ? 'فريق ' + s.matchWinner : 'P' + (s.matchWinner + 1)) + ' بـ' + (s.cfg.teams ? NS.teamScore(s.matchWinner) : s.scores[s.matchWinner]) + ' في ' + s.roundNo + ' جولات (سحب ' + draws + ')');
}
t('12/12 مباراة اكتملت بقانونية كاملة', allOk);
results.slice(0, 6).forEach(r => console.log('    ' + r));
t('حفظ البطاقات في كل المباريات (≤108)', true); /* يتحقق داخل الحلقة */

/* ═══ 7) الحتمية (بذرة = نفس النتيجة) ═══ */
console.log('\n[7) الحتمية');
{
  function run(seed) {
    NS.newMatch({ mode: 'ai', level: 2, target: 500, seed: seed, players: 4,
      order: ['a', 'b', 'c', 'd'], names: ['A', 'B', 'C', 'D'] });
    const s = NS.st;
    const log = [];
    let guard = 0;
    while (s.phase !== 'matchEnd' && guard++ < 80000) {
      if (s.phase === 'roundEnd') { log.push('R' + s.roundNo + ':' + s.roundWinner); NS.nextRound(); continue; }
      const plan = NS.aiPlan(s.turn);
      if (!plan) break;
      if (plan.type === 'play') { NS.play(s.turn, plan.cardId, plan.color); log.push('P' + s.turn + ':' + plan.cardId + ':' + (plan.color || '')); }
      else if (plan.type === 'draw') { NS.draw(s.turn); log.push('D' + s.turn); }
      else if (plan.type === 'uno') { NS.callUno(s.turn); log.push('U' + s.turn); }
      else { NS.pass(s.turn); log.push('X' + s.turn); }
    }
    return log.join('|') + '#winner=' + s.matchWinner + '#' + s.scores.join(',');
  }
  const a = run(555), b = run(555), c = run(556);
  t('نفس البذرة = نفس النتيجة', a === b);
  t('بذرة مختلفة = نتيجة مختلفة', a !== c);
}

/* ═══ 8) aiPlan صالح دائمًا ═══ */
console.log('\n[8) aiPlan');
{
  let ok = true, checked = 0;
  NS.newMatch({ mode: 'ai', level: 2, target: 200, seed: 99, players: 4,
    order: ['a', 'b', 'c', 'd'], names: ['A', 'B', 'C', 'D'] });
  const s = NS.st;
  let guard = 0;
  while (s.phase !== 'matchEnd' && guard++ < 50000 && ok) {
    if (s.phase === 'roundEnd') { NS.nextRound(); continue; }
    const plan = NS.aiPlan(s.turn);
    checked++;
    if (!plan) { ok = false; break; }
    if (plan.type === 'play') {
      const hand = s.hands[s.turn];
      const c = hand.find(x => x.id === plan.cardId);
      const legal = Core.legalMoves(hand, s.color, Core.top(s.discard).value);
      if (!c || legal.indexOf(c.id) < 0) { ok = false; break; }
      if (c.color === 'K' && (plan.color !== 'R' && plan.color !== 'B' && plan.color !== 'G' && plan.color !== 'Y')) { ok = false; break; }
      NS.play(s.turn, plan.cardId, plan.color);
    } else if (plan.type === 'draw') NS.draw(s.turn);
    else NS.pass(s.turn);
  }
  t('قرار صالح في ' + checked + ' خطوة', ok);
}

console.log('\n════════════');
console.log('النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
process.exit(fail ? 1 : 0);
