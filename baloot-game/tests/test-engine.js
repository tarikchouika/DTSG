/* ════════════════════════════════════════════════════════════════════
   اختبارات محرك البلوت — شغّل: node tests/test-engine.js
   تحققات: الأوراق، النقاط، الحركات القانونية، الأشور، حساب الدور،
   كابوت، بلوت، إعادة التوزيع، ومباريات كاملة AI ضد AI (6 بذور × مستويات)
   ════════════════════════════════════════════════════════════════════ */
'use strict';
const Core = require('../js/engine/baloot-core.js');
const NS = require('../js/engine/baloot-game.js');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
const rnd = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

console.log('\n[1] الحزمة والنقاط');
const deck = Core.makeDeck();
t('32 ورقة فريدة', deck.length === 32 && new Set(deck.map((c) => c.id)).size === 32);
const totalSun = deck.reduce((s, c) => s + Core.pointsOf(c, null), 0);
const totalHokm = deck.reduce((s, c) => s + Core.pointsOf(c, 'S'), 0);
t('مجموع صن = 120', totalSun === 120);
t('مجموع هوكم = 152', totalHokm === 152);
t('جوجر هوكم = 20', Core.pointsOf({ suit: 'S', rank: 11 }, 'S') === 20);
t('تسعة هوكم = 14', Core.pointsOf({ suit: 'S', rank: 9 }, 'S') === 14);
t('آس صن = 11', Core.pointsOf({ suit: 'H', rank: 14 }, null) === 11);
t('ترتيب صن: A>10>K>Q>J', Core.power({ suit: 'H', rank: 14 }, null) > Core.power({ suit: 'H', rank: 10 }, null) &&
  Core.power({ suit: 'H', rank: 10 }, null) > Core.power({ suit: 'H', rank: 13 }, null) &&
  Core.power({ suit: 'H', rank: 13 }, null) > Core.power({ suit: 'H', rank: 12 }, null) &&
  Core.power({ suit: 'H', rank: 12 }, null) > Core.power({ suit: 'H', rank: 11 }, null));
t('ترتيب هوكم: J>9>A>10>K', Core.power({ suit: 'S', rank: 11 }, 'S') > Core.power({ suit: 'S', rank: 9 }, 'S') &&
  Core.power({ suit: 'S', rank: 9 }, 'S') > Core.power({ suit: 'S', rank: 14 }, 'S') &&
  Core.power({ suit: 'S', rank: 14 }, 'S') > Core.power({ suit: 'S', rank: 10 }, 'S') &&
  Core.power({ suit: 'S', rank: 10 }, 'S') > Core.power({ suit: 'S', rank: 13 }, 'S'));
t('هوكم يتفوق على أي صن', Core.power({ suit: 'S', rank: 7 }, 'S') > Core.power({ suit: 'H', rank: 14 }, 'S'));

console.log('\n[2] الحركات القانونية');
const H = (suit, rank) => ({ id: suit + rank, suit, rank });
const trick1 = [{ seat: 0, card: H('H', 7) }];
let legal = Core.legalMoves([H('H', 8), H('S', 7), H('D', 14)], trick1, 'S');
t('إلزام الزم اللون', legal.length === 1 && legal[0].id === 'H8');
legal = Core.legalMoves([H('S', 9), H('D', 14)], trick1, 'S');
t('إلزام الضرب هوكم عند عدم توفر اللون', legal.length === 1 && legal[0].id === 'S9');
legal = Core.legalMoves([H('D', 7), H('C', 14)], trick1, 'S');
t('حرية عند غياب اللون والهوكم', legal.length === 2);
legal = Core.legalMoves([H('S', 7), H('S', 11)], [], 'S');
t('الطرح حر في أول ورقة', legal.length === 2);
let trickT = [{ seat: 0, card: H('S', 9) }];
/* في ترتيب هوكم: J > 9 > A → الآس لا يغطي التسعة، والجاكر وحده يغطي */
legal = Core.legalMoves([H('S', 14), H('S', 11)], trickT, 'S', true);
t('التغطية الإلزامية: جاكر هوكم وحده يغطي 9هوكم', legal.length === 1 && legal[0].id === 'S11');
legal = Core.legalMoves([H('S', 7)], trickT, 'S', true);
t('التغطية غير ممكنة → أي هوكم', legal.length === 1 && legal[0].id === 'S7');
const w = Core.trickWinnerIdx([{ seat: 0, card: H('H', 14) }, { seat: 1, card: H('S', 7) }], 'S');
t('هوكم الصغير يفوز على آس صن', w === 1);

console.log('\n[3] الأشور');
const hand1 = [H('S', 7), H('S', 8), H('S', 9), H('S', 14), H('H', 14), H('D', 14), H('C', 14), H('D', 8)];
let ash = Core.detectAshur(hand1);
t('سرا 3 = 20', ash.some((a) => a.type === 'serial' && a.value === 20));
t('رباعية آس = 100 (موجودة)', ash.some((a) => a.type === 'quad' && a.rank === 14 && a.value === 100));
const hand2 = [H('S', 7), H('S', 8), H('S', 9), H('S', 10), H('H', 7), H('D', 7), H('C', 7), H('H', 8)];
ash = Core.detectAshur(hand2);
t('خمسين 4 = 50', ash[0] && ash[0].type === 'serial' && ash[0].value === 50);
const hand3 = [H('S', 9), H('H', 9), H('D', 9), H('C', 9), H('S', 7), H('H', 7), H('D', 7), H('C', 7)];
ash = Core.detectAshur(hand3);
t('رباعية 9 = 150', ash.some((a) => a.type === 'quad' && a.rank === 9 && a.value === 150));
t('رباعية 7/8 = 0', Core.detectAshur([H('S', 8), H('H', 8), H('D', 8), H('C', 8), H('S', 7), H('H', 7), H('D', 7), H('C', 7)]).some((a) => a.type === 'quad' && a.value === 0));
const hand4 = [H('S', 10), H('S', 11), H('S', 12), H('S', 13), H('S', 14), H('H', 7), H('D', 7), H('C', 7)];
ash = Core.detectAshur(hand4);
t('مية 5+ = 100', ash[0] && ash[0].type === 'serial' && ash[0].value === 100 && ash[0].len === 5);
t('بلوت: K+Q هوكم', Core.hasBaloot([H('S', 13), H('S', 12), H('H', 7)], 'S') === true && Core.hasBaloot([H('S', 13), H('H', 12), H('H', 7)], 'S') === false);

console.log('\n[4] حساب الدور');
let r = Core.scoreRound([80, 72], [5, 3], 0, [{ value: 50, seat: 0 }, { value: 20, seat: 1 }], [false, false], -1, 0);
t('الأشور: 50 يقطع 20', r.ashur[0] === 50 && r.ashur[1] === 0 && r.ashur.cut[1] === true);
t('اليد +10 للفريق 0', r.total[0] === 80 + 10 + 50 && r.total[1] === 72);
r = Core.scoreRound([70, 82], [4, 4], 1, [{ value: 50, seat: 0 }, { value: 100, seat: 1 }], [false, false], -1, 0);
t('الأشور الأعلى للفريق 1', r.ashur[1] === 100 && r.ashur[0] === 0 && r.ashur.cut[0] === true);
r = Core.scoreRound([50, 102], [4, 4], 0, [{ value: 20, seat: 0 }, { value: 20, seat: 1 }], [false, false], -1, 0);
t('تعادل الأشور → إلغاء الجميع', r.ashur[0] === 0 && r.ashur[1] === 0);
r = Core.scoreRound([152, 0], [8, 0], 0, [{ value: 50, seat: 1 }, null], [false, true], 0, 30);
t('كابوت: الكل + بونص + أشور الخصم + بلوت', r.total[0] === 152 + 10 + 50 + 20 + 30 && r.total[1] === 0);
r = Core.scoreRound([60, 92], [4, 4], 1, [null, { value: 200, seat: 1 }], [false, false], -1, 0);
t('رباعية جوجر 200 تُحتسب', r.total[1] === 92 + 10 + 200);

console.log('\n[5] إعادة التوزيع (الكل بَس)');
{
  const oldRand = Math.random;
  Math.random = rnd(7);
  NS.newMatch({ mode: 'ai', level: 0, target: 100, firstLead: 'left', mustBeat: false, kabotBonus: 30 });
  const before = NS.state.dealer;
  for (let i = 0; i < 4; i++) NS.declareAshur(NS.state.turn, null);
  for (let i = 0; i < 4; i++) NS.chooseNaming(NS.state.turn, null);
  t('كلهم بس → إعادة توزيع', NS.state.phase === 'ashur' && NS.state.roundNo === 2);
  t('الموزع انتقل يميناً', NS.state.dealer === (before + 1) % 4);
  Math.random = oldRand;
}

console.log('\n[6] بلوت يُعلن لحظة اللعب');
{
  const oldRand = Math.random;
  Math.random = rnd(11);
  NS.newMatch({ mode: 'ai', level: 0, target: 51, firstLead: 'left', mustBeat: false, kabotBonus: 0 });
  const s = NS.state;
  /* هندسة: أعطِ اللاعب 0 جوجر+ملك+بنت من هوكم بستوني */
  const H = (suit, rank) => ({ id: suit + rank, suit, rank });
  s.hands[0] = [H('S', 11), H('S', 13), H('S', 12), H('S', 9), H('H', 7), H('D', 7), H('C', 7), H('H', 8)];
  s.hands[1] = [H('H', 8), H('H', 9), H('H', 10), H('H', 11), H('D', 8), H('D', 9), H('C', 8), H('C', 9)];
  s.hands[2] = [H('D', 10), H('D', 11), H('D', 12), H('D', 13), H('C', 10), H('C', 11), H('H', 12), H('H', 13)];
  s.hands[3] = [H('C', 12), H('C', 13), H('C', 14), H('S', 7), H('S', 8), H('H', 14), H('D', 14), H('S', 14)];
  s.trick = []; s.cardPts = [0, 0]; s.tricksWon = [0, 0]; s.phase = 'play'; s.trump = 'S'; s.namedBy = 0; s.namedKind = 'suit';
  s.turn = 0; s.dealer = 3;
  /* اللاعب 0 يلعب ملك بستوني → بلوت +20 */
  NS.play(0, H('S', 13));
  t('بلوت أُعلن تلقائياً', s.baloot[0] === true);
  Math.random = oldRand;
}

console.log('\n[7] مباريات كاملة AI ضد AI (بذور × مستويات × صن/هوكم)');
function simMatch(seed, level, target) {
  const oldRand = Math.random;
  Math.random = rnd(seed * 7919 + level * 131 + 5);
  NS.newMatch({ mode: 'ai', level, target, firstLead: 'left', mustBeat: false, kabotBonus: 30 });
  const s = NS.state;
  let steps = 0;
  let allLegal = true;
  const seen = new Set();
  while (s.phase !== 'matchEnd' && steps < 8000) {
    steps++;
    if (s.phase === 'ashur' || s.phase === 'naming') {
      const seat = s.turn;
      NS.aiAct(seat);
    } else if (s.phase === 'play') {
      const seat = s.turn;
      const legal = Core.legalMoves(s.hands[seat], s.trick, s.trump, s.cfg.mustBeat);
      const pick = legal[Math.floor(Math.random() * legal.length)];
      if (!pick) { allLegal = false; break; }
      if (!Core.isLegal(s.hands[seat], s.trick, s.trump, pick, s.cfg.mustBeat)) { allLegal = false; break; }
      /* تتبع عدم تكرار الأوراق داخل الأكلة */
      const key = pick.id;
      if (seen.has(key)) { allLegal = false; break; }
      seen.add(key);
      NS.play(seat, pick);
    } else if (s.phase === 'trickEnd') {
      if (s.trick.length === 4) {
        const cardAll = s.trick.reduce((sum, p) => sum + Core.pointsOf(p.card, s.trump), 0);
        const totalAll = Core.roundCardTotal(s.trump);
        if (s.roundOver) {
          const got = s.cardPts[0] + s.cardPts[1];
          if (got !== totalAll) { allLegal = false; console.log('    ! مجموع نقاط الدور خاطئ: ' + got + ' !== ' + totalAll); break; }
        }
      }
      if (s.trick.length === 4) { /* تمّ التحقق من حصرية الأوراق في بداية الدورة التالية */ seen.clear(); }
      NS.nextTrickOrRoundEnd();
    } else if (s.phase === 'roundEnd') {
      NS.nextRound();
    } else break;
  }
  Math.random = oldRand;
  const ok = s.phase === 'matchEnd' && allLegal && s.matchWinner >= 0 &&
    s.teamScores[s.matchWinner] >= s.cfg.target;
  const cardsLeft = s.hands[0].length + s.hands[1].length + s.hands[2].length + s.hands[3].length;
  return { ok: ok && cardsLeft === 0, steps: steps, winner: s.matchWinner, score: s.teamScores.slice(), redeals: s.redeals, cardsLeft };
}
for (const level of [0, 1, 2]) {
  for (let seed = 1; seed <= 6; seed++) {
    const m = simMatch(seed, level, 51);
    t(`المباراة ${seed} (مستوى ${level}) انتهت ${m.winner === 0 ? '0' : '1'} [${m.score}] — ${m.steps} خطوة${m.redeals ? ' + ' + m.redeals + ' إعادة' : ''}`, m.ok);
  }
}
/* صن فقط (مستوى 2) عبر تقييد التسمية */
{
  const oldRand = Math.random;
  Math.random = rnd(4242);
  NS.newMatch({ mode: 'ai', level: 2, target: 51, firstLead: 'namer', mustBeat: true, kabotBonus: 50 });
  const orig = NS.aiNaming;
  let suns = 0, suits = 0;
  NS.aiNaming = function (seat) {
    if (suits >= 1) { this.chooseNaming(seat, { kind: 'sun' }); return; }
    orig.call(this, seat);
    const st = NS.state;
    if (st.phase === 'play' && st.namedBy === seat) {
      if (st.namedKind === 'sun') suns++; else suits++;
    }
  };
  let steps = 0;
  while (NS.state.phase !== 'matchEnd' && steps < 8000) {
    steps++;
    const s = NS.state;
    if (s.phase === 'ashur' || s.phase === 'naming') NS.aiAct(s.turn);
    else if (s.phase === 'play') {
      const legal = Core.legalMoves(s.hands[s.turn], s.trick, s.trump, true);
      NS.play(s.turn, legal[Math.floor(Math.random() * legal.length)]);
    } else if (s.phase === 'trickEnd') NS.nextTrickOrRoundEnd();
    else if (s.phase === 'roundEnd') NS.nextRound();
    else break;
  }
  NS.aiNaming = orig;
  Math.random = oldRand;
  let sunRounds = 0;
  {
    /* عدّ أدوار صن عبر محاكاة جديدة قصيرة مع إحصاء: نكتفي بالتحقق من اكتمال المباراة */
  }
  t('مباراة (firstLead=namer, mustBeat=true) اكتملت' + (suns ? ' — صن: ' + suns + ' مرة' : ''), NS.state.phase === 'matchEnd' && NS.state.matchWinner >= 0);
}

/* ════ البذرة الحتمية (غرف الأونلاين) ════ */
{
  const run = (seed) => {
    NS.newMatch({ mode: 'ai', level: 2, target: 51, firstLead: 'left', mustBeat: false, kabotBonus: 30, seed: seed });
    const hands = JSON.stringify(NS.state.hands);
    const trumps = [];
    let steps = 0;
    while (NS.state.phase !== 'matchEnd' && steps < 8000) {
      steps++;
      const s = NS.state;
      if (s.phase === 'ashur') NS.declareAshur(s.turn, null);
      else if (s.phase === 'naming') NS.chooseNaming(s.turn, { kind: 'suit', suit: Core.strongestSuit(s.hands[s.turn]) });
      else if (s.phase === 'play') { const L = Core.legalMoves(s.hands[s.turn], s.trick, s.trump, false); NS.play(s.turn, L[0]); }
      else if (s.phase === 'trickEnd') NS.nextTrickOrRoundEnd();
      else if (s.phase === 'roundEnd') NS.nextRound();
      else break;
    }
    trumps.push(hands, NS.state.teamScores.join(','));
    return trumps.join('|');
  };
  const A = run(12345), B = run(12345), C = run(99999);
  t('بذرة 12345: نفس التوزيع والنتيجة عند الطرفين', A === B);
  t('بذرة مختلفة → توزيع مختلف', A !== C);
  t('aiPlan يعيد قرار لعب صالحاً', (() => {
    NS.newMatch({ mode: 'ai', level: 2, target: 51, firstLead: 'left', mustBeat: false, kabotBonus: 30, seed: 777 });
    while (NS.state.phase === 'ashur') NS.declareAshur(NS.state.turn, null);
    NS.chooseNaming(NS.state.turn, { kind: 'suit', suit: Core.strongestSuit(NS.state.hands[NS.state.turn]) });
    const plan = NS.aiPlan(NS.state.turn);
    return !!(plan && plan.type === 'play' && plan.card && plan.card.id);
  })());
}

console.log('\n════════════');
console.log('النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
process.exit(fail ? 1 : 0);
