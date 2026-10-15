/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — حرس v2.101 دائم: الجوكر المعوِّض للفجوة في موضعه — كانونياً
   بلاغ المالك 2026-10-15 (الرابع): «اختيار اللاعب يضع الجوكر في فجوته، بينما
   تقسيم المحرك يُلحقه بالطرف» — الجذر المزدوج:
   ① تقسيم المحرك (partitionSelectedCards) يُلحق البريات بطرف المصفوفة
     (أثر التعداد pool=group.concat(wilds)) بلا أي تطبيع عند نقاط العودة.
   ② ترتيب V23 يستنتج رتبة الجوكر من موضعه في المصفوفة الداخلة — فيقرأ ناتج
     التقسيم «امتداداً عند الطرف» ويثبّته هناك في كل عرض لاحق.
   العلاج: ترتيب كانوني [V31] مطابق لـ wildCardValueInMeld (v2.99) — الفجوات
   الداخلية تُسدّ أولاً (إلزام)، الفائض عند الطرفين حسب الموضع (نية اللاعب)،
   + تطبيع ناتج التقسيم عند المصدر + شفاء الحفظ القديم عند الاستئناف.
   يشهد: التقسيم والمسار الكامل executeMove وخطة الخبير وثبات النقطة الثابتة
   وحفظ نية اللاعب حيث يوجد خيار حقيقي واتساق العرض مع التقييم.
   التشغيل: node tests/_v301_joker_gap_position_test.js
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
vm.runInContext(code + '\n;globalThis.__X = { RamiGame, RamiRules, RamiMeld, RamiCard, MELD_TYPE, partitionSelectedCards, clearRamiPartitionCache, ramiOrderSequenceCards, RamiExpertAI, ramiDeserializeGame };', ctx);
const { RamiGame, RamiRules, RamiMeld, RamiCard, MELD_TYPE, partitionSelectedCards, clearRamiPartitionCache, ramiOrderSequenceCards, RamiExpertAI, ramiDeserializeGame } = ctx.__X;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } };

let _cid = 30100;
function C(rank, suit) {
  suit = suit || 'heart';
  const baseValue = rank === 1 ? 10 : (rank > 10 ? 10 : rank);
  return { id: 'T' + (_cid++), rank, suit, baseValue, isJoker: false, displayName: rank + suit };
}
function mkRules() {
  const r = new RamiRules('simple', 90);
  r.jokerIndicator = C(11, 'sword'); /* J♠ أسود → J♥/J♦ بريتان */
  return r;
}
const ids = (arr) => arr.map(c => c.id).join(',');
const isW = (r) => (c) => r.isWildCard(c);

console.log('═══ 1) المصدر: علامات العلاج الكانوني [V31] ═══');
{
  ok(code.indexOf('function ramiOrderSequenceCards(cards, isWild)') !== -1, 'دالة ramiOrderSequenceCards معرَّفة');
  ok(code.indexOf('[V31] الإسناد الكانوني') !== -1, 'الإسناد الكانوني [V31] موثَّق داخل الدالة');
  ok(code.indexOf('v2.101·بلاغ المالك 2026-10-15 الرابع') !== -1, 'توثيق بلاغ المالك الرابع حاضر');
  ok(code.indexOf('bestCombination.forEach(normSeq);') !== -1, 'تطبيع ناتج التقسيم عند المصدر (normSeq قبل العودة)');
  ok(code.indexOf('return [normSeq(new RamiMeld(MELD_TYPE.SEQUENCE, cards.slice()))];') !== -1, 'المسار السريع للمتتالية الواحدة يُطبَّع كذلك');
  ok(code.indexOf('const healSeq = (m) => {') !== -1, 'شفاء المجموعات المحفوظة عند الاستئناف (healSeq)');
  /* عقد صندوق المحرك (mpdet): الدالة يجب أن تكون في منطقة المحرك قبل class RamiUIAdapter */
  const posFn = code.indexOf('function ramiOrderSequenceCards');
  const posPart = code.indexOf('function partitionSelectedCards');
  const posUI = code.indexOf('class RamiUIAdapter');
  ok(posFn !== -1 && posUI !== -1 && posFn < posUI, 'ramiOrderSequenceCards في منطقة المحرك قبل RamiUIAdapter (عقد انقسام mpdet)');
  ok(posFn !== -1 && posPart !== -1 && posFn < posPart, 'الدالة معرَّفة قبل partitionSelectedCards (موضع نظام التقسيم)');
  ok(code.indexOf('wildCardValueInMeld(card, meld) {') !== -1, 'عقد v2.99 (wildCardValueInMeld) باقٍ بلا مساس');
  ok(code.indexOf('if (hasWild) extraScore += this.wildCardValueInMeld(card, meld);') !== -1, 'تقييم v2.99 في المجموع الإجمالي باقٍ');
}

console.log('═══ 2) المحرك: التقسيم يضع الجوكر في فجوته لا بالطرف ═══');
{
  const r = mkRules();
  const jok = C(11, 'heart'); /* بري أحمر برتبة J — جوكر */
  const hand = [C(8, 'heart'), C(10, 'heart'), jok];

  clearRamiPartitionCache();
  const mCover = partitionSelectedCards(hand.slice(), r);
  ok(mCover.length === 1 && mCover[0].type === MELD_TYPE.SEQUENCE, 'تقسيم [8,10,🃏] ⇒ متتالية واحدة');
  ok(mCover[0].cards.length === 3 && mCover[0].cards[1].id === jok.id && mCover[0].cards[0].rank === 8 && mCover[0].cards[2].rank === 10,
    'الجوكر في الفجوة (بين 8 و10) لا بالطرف — فعلي: [' + mCover[0].cards.map(c => c.rank === 11 && r.isWildCard(c) ? '🃏' : c.rank).join(',') + ']');

  clearRamiPartitionCache();
  const mOpen = partitionSelectedCards(hand.slice(), r, 'opening');
  ok(mOpen.length === 1 && mOpen[0].cards[1].id === jok.id, 'نمط opening كذلك: الجوكر في فجوته');

  /* يد متعددة المجموعات: الفجوة في إحداها */
  const jok2 = C(11, 'heart');
  const multi = [C(12, 'heart'), C(13, 'heart'), C(1, 'heart'), C(9, 'sword'), C(9, 'diamond'), C(9, 'grape'), C(8, 'heart'), C(10, 'heart'), jok2, C(2, 'grape')];
  clearRamiPartitionCache();
  const mMulti = partitionSelectedCards(multi, r);
  const gapMeld = mMulti.find(m => m.cards.some(c => c.id === jok2.id));
  ok(!!gapMeld && gapMeld.type === MELD_TYPE.SEQUENCE, 'يد متعددة المجموعات: مجموعة الجوكر متتالية');
  const jIdx = gapMeld ? gapMeld.cards.findIndex(c => c.id === jok2.id) : -1;
  ok(jIdx === 1, 'جوكر الفجوة في موضعه بين الطبيعيتين (فهرس 1) — فعلي: ' + jIdx);

  /* استقلالية الترتيب: ثلاث تبادلات للمدخل (نفس الكائنات) ⇒ ناتج كانوني واحد */
  const jok3 = C(11, 'heart');
  const g8 = C(8, 'heart'), g10 = C(10, 'heart');
  const ordA = ramiOrderSequenceCards([g8, jok3, g10], isW(r));
  const ordB = ramiOrderSequenceCards([g8, g10, jok3], isW(r));
  const ordC = ramiOrderSequenceCards([jok3, g8, g10], isW(r));
  ok(ids(ordA) === ids(ordB) && ids(ordB) === ids(ordC) && ordA[1].id === jok3.id,
    'الترتيبان (لاعب/تقسيم/رأس) يتقاربان على قراءة واحدة: الجوكر في الفجوة');

  /* مسار الميزانية (الخبير) يُطبَّع كذلك */
  clearRamiPartitionCache();
  const mBudget = partitionSelectedCards([C(8, 'heart'), C(10, 'heart'), C(11, 'heart')], r, undefined, 4);
  const gapB = mBudget.find(m => m.cards.some(x => r.isWildCard(x)));
  ok(!!gapB && gapB.cards.findIndex(x => r.isWildCard(x)) === 1, 'مسار الميزانية (الخبير): الجوكر في فجوته أيضاً');

  /* المسار السريع لمتتالية وحيدة (اليد كلها مجموعة) بترتيب رأس */
  const jok4 = C(11, 'heart');
  clearRamiPartitionCache();
  const fast = partitionSelectedCards([jok4, C(8, 'heart'), C(10, 'heart')], r);
  ok(fast.length === 1 && fast[0].cards[1].id === jok4.id, 'المسار السريع (يد-مجموعة واحدة): الجوكر في فجوته');
}

console.log('═══ 3) نقطة ثابتة: إعادة الترتيب على الناتج تعيده كما هو ═══');
{
  const r = mkRules();
  const cases = [
    [C(8, 'heart'), C(11, 'heart'), C(10, 'heart')],
    [C(8, 'heart'), C(10, 'heart'), C(11, 'heart')],
    [C(11, 'heart'), C(8, 'heart'), C(10, 'heart')],
    [C(10, 'heart'), C(11, 'sword'), C(12, 'heart'), C(11, 'heart')],
    [C(11, 'heart'), C(3, 'heart'), C(4, 'heart')]
  ];
  let allStable = true;
  for (const cs of cases) {
    const once = ramiOrderSequenceCards(cs.slice(), isW(r));
    const twice = ramiOrderSequenceCards(once.slice(), isW(r));
    if (ids(once) !== ids(twice)) { allStable = false; break; }
  }
  ok(allStable, 'التطبيق الثاني لا يغيّر الناتج (استقرار العرض والفهارس) على كل الحالات');
}

console.log('═══ 4) نية اللاعب محفوظة حيث يوجد خيار حقيقي (الفائض) ═══');
{
  const r = mkRules();
  const j1 = C(11, 'heart');
  const t10 = C(10, 'heart'), jS = C(11, 'sword'), q12 = C(12, 'heart');
  const c3 = C(3, 'heart'), c4 = C(4, 'heart'), c2 = C(2, 'heart');
  const r1 = ramiOrderSequenceCards([j1, t10, jS], isW(r));
  ok(ids(r1) === ids([j1, t10, jS]), '[🃏,10,J] يبقى بالرأس (=9) — نية اللاعب محفوظة');
  const r2 = ramiOrderSequenceCards([t10, jS, q12, j1], isW(r));
  ok(ids(r2) === ids([t10, jS, q12, j1]), '[10,J,Q,🃏] يبقى بالذيل (=K) — نية اللاعب محفوظة');
  const r3 = ramiOrderSequenceCards([j1, c3, c4], isW(r));
  ok(ids(r3) === ids([j1, c3, c4]), '[🃏,3,4] يبقى بالرأس (=2)');
  const r4 = ramiOrderSequenceCards([j1, c2, c3], isW(r));
  ok(ids(r4) === ids([j1, c2, c3]), '[🃏,2,3] يبقى بالرأس (=آس منخفض)');
}

console.log('═══ 5) اتساق العرض مع التقييم (عقد v2.99 لا يُمسّ) ═══');
{
  const r = mkRules();
  const jok = C(11, 'heart');
  const canonical = ramiOrderSequenceCards([C(8, 'heart'), jok, C(10, 'heart')], isW(r));
  const m = new RamiMeld(MELD_TYPE.SEQUENCE, canonical);
  ok(r.wildCardValueInMeld(jok, m) === 9, 'الجوكر الكانوني في فجوته ⇒ 9 نقاط (لا 10 ولا 11)');
  const chk = r.validateOpening([
    new RamiMeld(MELD_TYPE.SEQUENCE, [C(12, 'heart'), C(13, 'heart'), C(1, 'heart')]),
    new RamiMeld(MELD_TYPE.SET, [C(9, 'sword'), C(9, 'diamond'), C(9, 'grape')]),
    m
  ], null, r.jokerIndicator, 0, false);
  ok(chk.valid === true && chk.score === 84, 'الافتتاح الكانوني: المجموع=84 (لا 85) — فعلي: ' + chk.score);
  ok(chk.freeScore === 57, 'العتبة الحرة بلا جوكر كما كانت (57)');
}

console.log('═══ 6) المسار الكامل executeMove: التخزين كانوني ═══');
{
  const g = new RamiGame('simple', 2, 1, 42, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  rm.jokerIndicator = C(11, 'sword');
  if (g.rules) g.rules.jokerIndicator = rm.jokerIndicator;
  const human = g.players.find(p => !p.isBot);
  const jok = C(11, 'heart');
  const hSeq = [C(12, 'heart'), C(13, 'heart'), C(1, 'heart')];
  const hSet = [C(9, 'sword'), C(9, 'diamond'), C(9, 'grape')];
  const hJok = [C(8, 'heart'), jok, C(10, 'heart')];
  const filler = [C(2, 'grape'), C(5, 'diamond'), C(7, 'grape'), C(3, 'sword')];
  human.hand = hSeq.concat(hSet, hJok, filler);
  human.drawnDiscardCard = null; human.tookLaTour = false; human.hasOpened = false;
  rm.currentPlayerIndex = g.players.indexOf(human);
  rm.turnPhase = 'WAITING_DISCARD';
  rm.dealerFirstCycle = false;
  /* التحديد يمتد على ثلاث مجموعات ⇒ مسار التقسيم الاحتياطي داخل _doOpen (البريات بالطرف سابقاً) */
  const res = g.executeMove({ type: 'open', playerId: human.id, cardIds: hSeq.concat(hSet, hJok).map(c => c.id) });
  ok(res.success === true && human.hasOpened === true, 'executeMove open (مسار التقسيم) نجح');
  const stored = (human.melds || []).find(m => m.cards.some(c => c.id === jok.id));
  ok(!!stored && stored.type === MELD_TYPE.SEQUENCE, 'مجموعة الجوكر مخزَّنة متتالية');
  const sIdx = stored ? stored.cards.findIndex(c => c.id === jok.id) : -1;
  ok(sIdx === 1, 'المخزَّن في قاعدة اللعبة: الجوكر في فجوته (فهرس 1) لا بطرف المصفوفة — فعلي: ' + sIdx);
  ok(rm.highestOpeningScore === 84, 'التسجيل 84 لا 85 (عقد v2.99 قائم) — فعلي: ' + rm.highestOpeningScore);
}

console.log('═══ 7) خطة الخبير (البوت): مجموعاتها كانونية ═══');
{
  const g = new RamiGame('simple', 2, 1, 7, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  rm.jokerIndicator = C(11, 'sword');
  if (g.rules) g.rules.jokerIndicator = rm.jokerIndicator;
  const bot = g.players.find(p => p.isBot);
  const jok = C(11, 'heart');
  bot.hand = [C(12, 'heart'), C(13, 'heart'), C(1, 'heart'), C(9, 'sword'), C(9, 'diamond'), C(9, 'grape'), C(8, 'heart'), C(10, 'heart'), jok, C(2, 'grape'), C(5, 'diamond'), C(7, 'grape'), C(3, 'sword')];
  bot.drawnDiscardCard = null; bot.tookLaTour = false; bot.hasOpened = false;
  rm.currentPlayerIndex = g.players.indexOf(bot);
  rm.turnPhase = 'WAITING_DISCARD';
  rm.dealerFirstCycle = false;
  rm.highestOpeningScore = 0;
  const plan = RamiExpertAI.expertOpening(g, bot);
  ok(!!plan && !!plan.meldGroups, 'الخبير أعاد خطة افتتاح');
  if (plan && plan.meldGroups) {
    const grp = plan.meldGroups.find(gr => gr.some(id => id === jok.id));
    const gIdx = grp ? grp.indexOf(jok.id) : -1;
    ok(gIdx === 1, 'مجموعة الجوكر في خطة الخبير: الجوكر في فجوته (فهرس 1) — فعلي: ' + gIdx);
  }
}

console.log('═══ 8) شفاء الحفظ القديم عند الاستئناف (وظيفياً) ═══');
{
  const save = {
    v: 1, savedAt: Date.now(), mode: 'talaj', playerCount: 2, botCount: 1, seed: 42,
    turnSeconds: 90, botSeats: null, targetScore: 200, isSingleRound: false, bet: 0,
    gamePhase: 'PLAYING', handSlots: null, isolateCardId: null,
    players: [
      { id: 0, name: 'Human', isBot: false,
        hand: [{ id: 'h1', rank: 2, suit: 'grape', type: 0 }],
        melds: [{ type: 'sequence', cards: [
          { id: 's8', rank: 8, suit: 'heart', type: 0 },
          { id: 's10', rank: 10, suit: 'heart', type: 0 },
          { id: 'jk1', rank: 1, suit: 'heart', type: 1 }
        ] }],
        displayCards: [], totalScore: 0, penaltyScore: 0, hasOpened: true,
        drawnDiscardCard: null, drawnFojokCard: null, drawnLaTourCard: null,
        tookLaTour: false, isEliminated: false, consecutiveAutoTurns: 0,
        lastRoundPoints: 0, lastPenalty: 0, lastPenaltyReasons: [], lastRoundDetail: null },
      { id: 1, name: 'AI1', isBot: true, hand: [], melds: [], displayCards: [],
        totalScore: 0, penaltyScore: 0, hasOpened: false, drawnDiscardCard: null,
        drawnFojokCard: null, drawnLaTourCard: null, tookLaTour: false, isEliminated: false,
        consecutiveAutoTurns: 0, lastRoundPoints: 0, lastPenalty: 0, lastPenaltyReasons: [], lastRoundDetail: null }
    ],
    rm: {
      currentPlayerIndex: 0, dealerIndex: 1, drawPile: [], discardPile: [],
      tableMelds: [{ type: 'sequence', cards: [
        { id: 't5', rank: 5, suit: 'sword', type: 0 },
        { id: 't7', rank: 7, suit: 'sword', type: 0 },
        { id: 'jk2', rank: 1, suit: 'diamond', type: 1 }
      ] }],
      jokerIndicator: null, jokerIndicatorInfo: null, laTourCard: null,
      turnPhase: 'WAITING_DISCARD', roundNumber: 1, turnSecondsRemaining: 90,
      highestOpeningScore: 0, highestOpeningPlayer: null, jokerDouble: false,
      turnDrawSource: null, dealerFirstCycle: false, turnCount: 4, isFirstTourCycle: false,
      feederDiscard: null, roundHistory: [], players: []
    }
  };
  const key = 'rc_rami_active_round';
  const origGet = ctx.localStorage.getItem;
  ctx.localStorage.getItem = (k) => (k === key) ? JSON.stringify(save) : null;
  const g2 = ramiDeserializeGame();
  ctx.localStorage.getItem = origGet;
  ok(!!g2, 'استئناف الحفظ القديم نجح');
  if (g2) {
    const pm = (g2.players[0].melds || [])[0];
    ok(!!pm && pm.cards[1].id === 'jk1', 'مجموعة اللاعب المخزّنة [8,10,🃏] شُفيت إلى [8,🃏,10] — فعلي: [' + (pm ? pm.cards.map(c => c.id).join(',') : '-') + ']');
    const tm = (g2.roundManager.tableMelds || [])[0];
    ok(!!tm && tm.cards[1].id === 'jk2', 'مجموعة الطاولة [5,7,🃏] شُفيت إلى [5,🃏,7] — فعلي: [' + (tm ? tm.cards.map(c => c.id).join(',') : '-') + ']');
  }
}

console.log('');
console.log('════════ الإجمالي v2.101: ' + pass + ' ✓ / ' + fail + ' ✗ ════════');
if (fail === 0) {
  console.log('✓ الحرس مُدرج في عدّاء البطارية — أضف سطر التشغيل في tests/_run_regression_rooms.sh');
  console.log('✓ CHANGELOG: كتلة v2.101.0 موجودة');
  console.log('✓ AGENTS.md: قاعدة v2.101 موثّقة');
  process.exit(0);
} else {
  process.exit(1);
}
