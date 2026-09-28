/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — حارس [FREEZE-CORE]: تقسيم الأوراق (partitionSelectedCards)
   1) مطابقة حرفية: نتائج المحرك الجديد = نتائج DFS القديم (المرجع المضمّن هنا)
      على مئات الأيدي: توزيعات حقيقية + أيدي وحشية (تكرارات + جوكرات) + مصنوعة.
   2) أداء: اليد الوحشية (كانت 2.4 ثانية حجب) تكتمل < 600ms — لا تجمد.
   3) مسار الخبير (بميزانية) لا يعلق ويعيد مجموعات صالحة.
   4) محاكاة مسار دور البوت بعد السحب (getLegalMoves + canFinish) بلا حجب.
   التشغيل: node tests/_rami_partition_exact_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '../js/games/rami.js'), 'utf8');
const makeElem = () => ({ style: { setProperty: () => {} }, setAttribute: () => {}, appendChild: () => {}, remove: () => {}, querySelector: () => ({ textContent: '' }), querySelectorAll: () => [], classList: { add: () => {}, remove: () => {} }, clientHeight: 100, innerHTML: '' });
const fakeDoc = { getElementById: () => makeElem(), querySelector: () => makeElem(), querySelectorAll: () => [], createElement: () => makeElem(), body: makeElem(), addEventListener: () => {} };
const ctx = {
  console, Date, Math, JSON, Set, Map, Array, Object, Number, String,
  setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
  window: {}, document: fakeDoc,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
};
ctx.window.document = fakeDoc;
vm.createContext(ctx);
vm.runInContext(code + '\n;globalThis.__X = { partitionSelectedCards, RamiRules, RamiCard, RamiGame, RamiMeld, MELD_TYPE, clearRamiPartitionCache, RamiExpertAI };', ctx);
const { partitionSelectedCards, RamiRules, RamiCard, RamiGame, RamiMeld, MELD_TYPE, clearRamiPartitionCache, RamiExpertAI } = ctx.__X;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };

/* ═══ المرجع: نسخة DFS القديمة حرفياً (السلوك المجمّد قبل FREEZE-CORE) ═══ */
function partitionReference(cards, rules, mode) {
  if (!cards || cards.length < 3) return [];
  const validator = rules.validator;
  const openingMode = (mode === 'opening');
  if (validator.isValidSet(cards, true)) return [new RamiMeld(MELD_TYPE.SET, cards.slice())];
  if (validator.isValidSequence(cards, true)) return [new RamiMeld(MELD_TYPE.SEQUENCE, cards.slice())];
  const validSubsets = [];
  const seenSubset = new Set();
  function pushIfValid(type, combo) {
    const key = combo.map(c => c.id).sort().join(',');
    if (seenSubset.has(key)) return;
    const okv = (type === MELD_TYPE.SET) ? validator.isValidSet(combo, true) : validator.isValidSequence(combo, true);
    if (okv) { seenSubset.add(key); validSubsets.push({ type, cards: combo.slice() }); }
  }
  function getCombos(arr, k) {
    const res = [];
    function bt(start, cur) {
      if (cur.length === k) { res.push(cur.slice()); return; }
      for (let i = start; i < arr.length; i++) { cur.push(arr[i]); bt(i + 1, cur); cur.pop(); }
    }
    bt(0, []);
    return res;
  }
  const wilds = cards.filter(c => rules.isWildCard(c));
  const suitGroups = new Map();
  const rankGroups = new Map();
  for (const c of cards) {
    if (rules.isWildCard(c)) continue;
    if (!suitGroups.has(c.suit)) suitGroups.set(c.suit, []);
    suitGroups.get(c.suit).push(c);
    if (!rankGroups.has(c.rank)) rankGroups.set(c.rank, []);
    rankGroups.get(c.rank).push(c);
  }
  for (const group of suitGroups.values()) {
    const pool = group.concat(wilds);
    for (let sz = 3; sz <= Math.min(pool.length, 7); sz++) {
      for (const combo of getCombos(pool, sz)) pushIfValid(MELD_TYPE.SEQUENCE, combo);
    }
  }
  for (const group of rankGroups.values()) {
    const pool = group.concat(wilds);
    for (let sz = 3; sz <= Math.min(pool.length, 4); sz++) {
      for (const combo of getCombos(pool, sz)) pushIfValid(MELD_TYPE.SET, combo);
    }
  }
  if (validSubsets.length === 0) return [];
  let bestCombination = [];
  let maxCoveredCards = 0;
  let bestFreeScore = -1;
  const meldFreeScore = (m) => {
    if (m.cards.some(c => rules.isWildCard(c))) return 0;
    return rules.meldPoints(m);
  };
  function search(idx, currentUsed, currentMelds) {
    const curFree = currentMelds.reduce((sm, m) => sm + meldFreeScore(m), 0);
    if (openingMode) {
      if (curFree > bestFreeScore || (curFree === bestFreeScore && currentUsed.size > maxCoveredCards)) {
        bestFreeScore = curFree;
        maxCoveredCards = currentUsed.size;
        bestCombination = currentMelds.slice();
      }
    } else if (currentUsed.size > maxCoveredCards) {
      maxCoveredCards = currentUsed.size;
      bestCombination = currentMelds.slice();
    }
    for (let i = idx; i < validSubsets.length; i++) {
      const sub = validSubsets[i];
      const hasOverlap = sub.cards.some(c => currentUsed.has(c.id));
      if (!hasOverlap) {
        const nextUsed = new Set(currentUsed);
        sub.cards.forEach(c => nextUsed.add(c.id));
        search(i + 1, nextUsed, [...currentMelds, new RamiMeld(sub.type, sub.cards.slice())]);
      }
    }
  }
  search(0, new Set(), []);
  return bestCombination;
}

const ser = (melds) => (melds || []).map(m => m.type + ':' + m.cards.map(c => c.id).join(',')).join('|');

/* ═══ 1) مطابقة حرفية على بطارية أيدي ═══ */
console.log('═══ 1) مطابقة المحرك الجديد مع DFS المرجعي ═══');
let checked = 0, mismatch = 0;
function compareOne(cards, rules, mode, label) {
  clearRamiPartitionCache();
  let ref, neu;
  try { ref = ser(partitionReference(cards, rules, mode)); } catch (e) { ref = 'ERR:' + e.message; }
  try { neu = ser(partitionSelectedCards(cards, rules, mode)); } catch (e) { neu = 'ERR:' + e.message; }
  checked++;
  if (ref !== neu) {
    mismatch++;
    console.log('    ❌ ' + label + ' [' + (mode || 'cover') + ']\n       ref=' + ref + '\n       new=' + neu);
  }
}

/* ب) أيدي من توزيعات حقيقية (بذور متعددة × النمطان) */
for (let s = 0; s < 200; s++) {
  const modeName = (s % 2) ? 'simple' : 'talaj';
  const g = new RamiGame(modeName, 4, 3, 1000 + s * 7, 90);
  g.startMatch();
  for (const p of g.players) {
    const hand = p.hand.concat(g.roundManager.drawPile.slice(-2));
    const r2 = new RamiRules(modeName, 90);
    r2.jokerIndicator = g.rules.jokerIndicator;
    compareOne(hand, r2, undefined, 'real#' + s + '/p' + p.id);
    if (s % 4 === 0) compareOne(hand, r2, 'opening', 'realO#' + s + '/p' + p.id);
  }
}
(checked && mismatch === 0) ? ok('أيدي التوزيعات الحقيقية مطابقة (' + checked + ' مقارنة)') : bad('أيدي حقيقية: ' + mismatch + ' اختلاف من ' + checked);

/* ج) أيدي وحشية مصنوعة (تكرارات طاولتين + جوكرات) */
const N = (id, rank, suit) => new RamiCard(id, rank, suit, 0);
const J = (id) => new RamiCard(id, 1, 'heart', 1);
const monsters = [
  [N('a1', 5, 'sword'), N('a2', 5, 'sword'), N('a3', 6, 'sword'), N('a4', 6, 'sword'),
   N('a5', 7, 'sword'), N('a6', 7, 'sword'), N('a7', 8, 'sword'), N('a8', 8, 'sword'),
   N('a9', 9, 'sword'), N('a10', 4, 'sword'), J('j1'), J('j2'), J('j3'), N('a11', 12, 'heart'), N('a12', 12, 'heart')],
  [N('b1', 1, 'sword'), N('b2', 2, 'sword'), N('b3', 3, 'sword'), N('b4', 4, 'sword'),
   N('b5', 5, 'sword'), N('b6', 6, 'sword'), N('b7', 7, 'sword'), N('b8', 8, 'sword'),
   N('b9', 9, 'sword'), N('b10', 10, 'sword'), J('j4'), J('j5'), J('j6'), N('b11', 12, 'heart'), N('b12', 12, 'diamond')],
  [N('c1', 1, 'grape'), N('c2', 3, 'grape'), N('c3', 5, 'grape'), N('c4', 7, 'grape'),
   N('c5', 9, 'grape'), N('c6', 11, 'grape'), N('c7', 13, 'grape'), N('c8', 2, 'heart'),
   N('c9', 4, 'heart'), N('c10', 6, 'heart'), J('j7'), J('j8'), J('j9'), J('j10')],
  [N('d1', 2, 'heart'), N('d2', 2, 'heart'), N('d3', 2, 'diamond'), N('d4', 2, 'diamond'),
   N('d5', 2, 'grape'), N('d6', 2, 'sword'), N('d7', 3, 'heart'), N('d8', 3, 'heart'),
   N('d9', 4, 'heart'), N('d10', 5, 'heart'), N('d11', 6, 'heart'), N('d12', 7, 'heart'), J('j11'), J('j12')]
];
{
  const before = mismatch;
  for (let mi = 0; mi < monsters.length; mi++) {
    const rM = new RamiRules('talaj', 90);
    compareOne(monsters[mi], rM, 'opening', 'monster' + mi);
    compareOne(monsters[mi], rM, undefined, 'monster' + mi);
  }
  mismatch === before ? ok('الأيدي الوحشية مطابقة (8 مقارنة)') : bad('أيدي وحشية: اختلافات!');
}

/* د) أيدي عشوائية مصنوعة (رموز متقاربة + مكررات + جوكرات) */
{
  let seed = 424242;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const before = mismatch;
  let synthChecked = 0;
  for (let s = 0; s < 150; s++) {
    const n = 12 + Math.floor(rnd() * 4);
    const cards = [];
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.18) { cards.push(J('mj' + s + '_' + i)); continue; }
      const rank = 1 + Math.floor(rnd() * 9);
      const suit = ['sword', 'heart', 'grape', 'diamond'][Math.floor(rnd() * 3)];
      cards.push(N('mc' + s + '_' + i, rank, suit));
    }
    const rR = new RamiRules('talaj', 90);
    compareOne(cards, rR, undefined, 'synth#' + s);
    if (s % 3 === 0) compareOne(cards, rR, 'opening', 'synthO#' + s);
    synthChecked += (s % 3 === 0) ? 2 : 1;
  }
  mismatch === before ? ok('الأيدي المصنوعة مطابقة (' + synthChecked + ' مقارنة)') : bad('أيدي مصنوعة: اختلافات!');
}
console.log('   الإجمالي: ' + checked + ' مقارنة · ' + mismatch + ' اختلاف');
mismatch === 0 ? ok('المطابقة الحرفية 100% (النتائج وكسور التعادل)') : bad('مطابقة فاشلة');

/* ═══ 2) الأداء: لا تجمد ═══ */
console.log('═══ 2) حدود الأداء (كانت اليد الوحشية 2400ms) ═══');
{
  const rM = new RamiRules('talaj', 90);
  clearRamiPartitionCache();
  const t0 = Date.now();
  partitionSelectedCards(monsters[0], rM, 'opening');
  const dt = Date.now() - t0;
  dt < 600 ? ok('اليد الوحشية [opening]: ' + dt + 'ms < 600ms') : bad('بطء: ' + dt + 'ms');
  clearRamiPartitionCache();
  const t1 = Date.now();
  partitionSelectedCards(monsters[0], rM, undefined);
  const dt2 = Date.now() - t1;
  dt2 < 600 ? ok('اليد الوحشية [cover]: ' + dt2 + 'ms < 600ms') : bad('بطء: ' + dt2 + 'ms');
  /* الكاش: استدعاء ثانٍ فوري */
  const t2 = Date.now();
  partitionSelectedCards(monsters[0], rM, undefined);
  const dt3 = Date.now() - t2;
  dt3 < 20 ? ok('الذاكرة المؤقتة تسترجع فوراً: ' + dt3 + 'ms') : bad('الكاش بطيء: ' + dt3 + 'ms');
}

/* ═══ 3) مسار دور البوت بعد السحب (نفس استدعاءات _runBotTurn) ═══ */
console.log('═══ 3) محاكاة خطوة البوت بعد السحب (getLegalMoves + canFinish) ═══');
{
  const g = new RamiGame('talaj', 4, 3, 5150, 90);
  g.startMatch();
  const p0 = g.players[0];
  p0.hand = monsters[0].slice();
  g.roundManager.turnPhase = 'WAITING_DISCARD';
  g.roundManager.currentPlayerIndex = 0;
  clearRamiPartitionCache();
  const t0 = Date.now();
  const moves = g.getLegalMoves(0);
  const canF = g.canFinish(p0);
  const t1 = Date.now();
  const dt = t1 - t0;
  Array.isArray(moves) ? ok('getLegalMoves+canFinish على يد وحشية: ' + dt + 'ms (canFinish=' + canF + ')') : bad('getLegalMoves فشل');
  dt < 1500 ? ok('لا حجب للخيط: ' + dt + 'ms < 1500ms') : bad('حجب طويل: ' + dt + 'ms');
  /* الاستدعاء الثاني (كما في نهاية الدور — فلترة الرمي) عبر الكاش */
  const t2 = Date.now();
  g.getLegalMoves(0);
  const dt2 = Date.now() - t2;
  dt2 < 300 ? ok('الاستدعاء المكرر عبر الكاش: ' + dt2 + 'ms') : bad('بطء الاستدعاء المكرر: ' + dt2 + 'ms');
}

/* ═══ 4) مسار الخبير (بميزانية) سليم ولا يعلق ═══ */
console.log('═══ 4) مسار الخبير الميزاني سليم ═══');
{
  const rules = new RamiRules('talaj', 90);
  clearRamiPartitionCache();
  /* ملاحظة: نصف ثانية نصف ميزانية قد يعيد null/[] عند انتهاء الميزانية (سلوك قديم محفوظ)،
     لكن أي مجموعات تُعاد يجب أن تكون قانونية — والزمن مقيّد دائماً */
  let budgetAllValid = true;
  for (const b of [1, 2, 4]) {
    const tb = Date.now();
    const outB = partitionSelectedCards(monsters[0], rules, 'opening', b);
    const dtb = Date.now() - tb;
    if (dtb > 150) budgetAllValid = false;
    for (const m of (outB || [])) {
      if (!(m.cards.length >= 3 && (rules.isValidSet(m.cards, true) || rules.isValidSequence(m.cards, true)))) budgetAllValid = false;
    }
  }
  budgetAllValid ? ok('لا حجب والنتيجة قانونية (3 ميزانيات على اليد الوحشية)') : bad('مشكلة في المسار الميزاني');
  const t0 = Date.now();
  const out = partitionSelectedCards(monsters[0], rules, 'opening', 4);
  const dt = Date.now() - t0;
  dt < 150 ? ok('ضمن الميزانية: ' + dt + 'ms') : bad('تجاوز الميزانية: ' + dt + 'ms');
  const valid = (out || []).every(m => m.cards.length >= 3 && (rules.isValidSet(m.cards, true) || rules.isValidSequence(m.cards, true)));
  valid ? ok('كل المجموعات المعادة قانونية') : bad('مجموعة غير قانونية!');
}

/* ═══ 5) مباراة كاملة ضد البوتات بلا تجمد (بما فيه استدعاءات التقسيم) ═══ */
console.log('═══ 5) شوط كامل بخط الخبير الإنتاجي (decideMove) بلا حجب ═══');
function playFullRound(game, maxMoves) {
  const rm = game.roundManager;
  let moves = 0;
  while (game.gamePhase === 'PLAYING' && moves < maxMoves) {
    const cur = rm.getCurrentPlayer();
    if (!cur) break;
    const d = RamiExpertAI.decideMove(game, cur, true);
    if (!d || !d.move) { rm.nextPlayer(); moves++; continue; }
    if (d.move.type === 'layoff') {
      /* layoff يُطبَّق يدوياً كما في _runBotTurn (executeMove لا يتولاه) */
      const card = cur.hand.find(c => c.id === d.move.cardId);
      if (card && d.move.meld) {
        cur.removeCard(card.id);
        d.move.meld.cards.push(card);
        if (cur.drawnDiscardCard && cur.drawnDiscardCard.id === card.id) cur.drawnDiscardCard = null;
        if (cur.drawnLaTourCard && cur.drawnLaTourCard.id === card.id) cur.drawnLaTourCard = null;
      } else { rm.nextPlayer(); }
    } else {
      const r = game.executeMove(d.move);
      if (!r || !(r.success || r.penaltyApplied)) rm.nextPlayer();
    }
    moves++;
  }
  return moves;
}
for (const modeName of ['simple', 'talaj']) {
  for (const seed of [24601, 42, 999]) {
    const g = new RamiGame(modeName, 4, 3, seed, 90);
    g.startMatch();
    const t0 = Date.now();
    const moves = playFullRound(g, 5000);
    const dt = Date.now() - t0;
    (g.gamePhase === 'ROUND_END' && moves > 15)
      ? ok('شوط ' + modeName + '/بذرة ' + seed + ': ' + moves + ' نقلة · ' + dt + 'ms')
      : bad('شوط ' + modeName + '/بذرة ' + seed + ' لم يكتمل (' + moves + ' نقلة، phase=' + g.gamePhase + ')');
    dt < 6000 ? ok('  زمن الشوط: ' + dt + 'ms < 6s') : bad('الشوط بطيء جداً: ' + dt + 'ms');
  }
}

console.log('\n═══ النتيجة: ' + pass + ' نجح / ' + fail + ' فشل ═══');
process.exit(fail === 0 ? 0 : 1);
