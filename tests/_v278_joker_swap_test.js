/* ═══════════════════════════════════════════════════════════════════════════
   [v2.78] جناح قانون استبدال الجوكر — توضيح المالك للقانون المفعّل ناقصاً:
     1) جوكر ثالث مجموعة ثلاثية (متماثلة) غير محدد ⇒ لا يُستبدل قطعاً.
     2) جوكر رابع مجموعة رباعية محدد بالورقة الناقصة ⇒ يُستبدل بها حصراً.
     3) جوكر متتالية (أي عدد) محدد بموضعه ⇒ يُستبدل بالورقة المعنية دائماً.
     4) إلزام نفس الدور: المستبدِل يضع الجوكر قبل الرمي (مجموعة قائمة أو
        افتتاح مجموعة به) — لا احتفاظ به لدور آخر.
   تشغيل:  node tests/_v278_joker_swap_test.js   (محرك خالص — بلا خادم)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync(__dirname + '/../js/games/rami.js', 'utf8');
const ctx = {
  console, Date, Math, JSON, Set, Map, Array, Object, Number, String,
  setTimeout: (fn) => fn(), window: {}, document: undefined,
  _ramiToast: () => {}, SND: {}
};
vm.createContext(ctx);
vm.runInContext(code + '\n;globalThis.__X = { RamiGame, RamiRules, MELD_TYPE, RamiMeld, _ramiNetApplyAddToMeld, ramiJokerHasHomeThisTurn, ramiAutoPlaceObligedJoker };', ctx);
const { RamiGame, RamiRules, MELD_TYPE, RamiMeld, _ramiNetApplyAddToMeld, ramiJokerHasHomeThisTurn } = ctx.__X;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name); }
}

let _cid = 9000;
function C(rank, suit) {
  suit = suit || 'heart';
  const baseValue = rank === 1 ? 10 : (rank > 10 ? 10 : rank);
  return { id: 'T' + (_cid++), rank, suit, baseValue, isJoker: false, displayName: rank + suit };
}
function J() {
  return { id: 'JK' + (_cid++), rank: 0, suit: 'joker', baseValue: 10, isJoker: true, displayName: 'جوكر' };
}

/* ═══ 1) قانون التحديد في findJokerSwapIndex ═══ */
console.log('── 1) findJokerSwapIndex: الثلاثية ممنوعة · الرباعية والمتتالية جائزة ──');
{
  const rules = new RamiRules('talaj', 90);

  /* متماثلة ثلاثية: 7♠ 7♥ + جوكر — الجوكر غير محدد (7♦ أو 7♣) */
  const set3 = new RamiMeld(MELD_TYPE.SET, [C(7, 'spade'), C(7, 'heart'), J()]);
  ok(set3.findJokerSwapIndex(C(7, 'diamond'), rules) === -1, 'ثلاثية: استبدال 7♦ مرفوض (الجوكر غير محدد)');
  ok(set3.findJokerSwapIndex(C(7, 'club'), rules) === -1, 'ثلاثية: استبدال 7♣ مرفوض كذلك');

  /* متماثلة رباعية: 7♠ 7♥ 7♦ + جوكر — الجوكر محدد = 7♣ حصراً */
  const set4 = new RamiMeld(MELD_TYPE.SET, [C(7, 'spade'), C(7, 'heart'), C(7, 'diamond'), J()]);
  ok(set4.findJokerSwapIndex(C(7, 'club'), rules) === 3, 'رباعية: استبدال 7♣ (الناقصة الوحيدة) جائز — موضع الجوكر');
  ok(set4.findJokerSwapIndex(C(7, 'spade'), rules) === -1, 'رباعية: ورقة مكررة مرفوضة');
  ok(set4.findJokerSwapIndex(C(8, 'club'), rules) === -1, 'رباعية: ورقة غير معنية مرفوضة');

  /* متتالية ثلاثية: 5♠ 6♠ + جوكر — الجوكر محدد بموضعه (7♠ أو امتداد) */
  const seq3 = new RamiMeld(MELD_TYPE.SEQUENCE, [C(5, 'spade'), C(6, 'spade'), J()]);
  ok(seq3.findJokerSwapIndex(C(7, 'spade'), rules) === 2, 'متتالية: استبدال 7♠ جائز (الجوكر محدد بموضعه)');
  ok(seq3.findJokerSwapIndex(C(4, 'spade'), rules) === 2, 'متتالية: استبدال 4♠ جائز (الامتداد الأسفل محدد كذلك)');

  /* متتالية بجوكر وسطي: 5♠ جوكر 7♠ — محدد حصراً بـ6♠ */
  const seqMid = new RamiMeld(MELD_TYPE.SEQUENCE, [C(5, 'spade'), J(), C(7, 'spade')]);
  ok(seqMid.findJokerSwapIndex(C(6, 'spade'), rules) === 1, 'متتالية وسطية: الاستبدال بـ6♠ حصراً');
  ok(seqMid.findJokerSwapIndex(C(9, 'spade'), rules) === -1, 'متتالية وسطية: ورقة غير معنية مرفوضة');

  /* متتالية رباعية: 10♥ جوكر 12♥ 13♥ — محدد بـ11♥ */
  const seq4 = new RamiMeld(MELD_TYPE.SEQUENCE, [C(10, 'heart'), J(), C(12, 'heart'), C(13, 'heart')]);
  ok(seq4.findJokerSwapIndex(C(11, 'heart'), rules) === 1, 'متتالية رباعية: الاستبدال بـJ♥ (11) جائز');
}

/* ═══ 2) الإلزام — المسار الشبكي الحتمي + الوضع التلقائي ═══ */
console.log('── 2) الإلزام: رميٌ والجوكر باليد ⇒ وضعه التلقائي الحتمي أول مجموعة تقبله ──');
{
  const g = new RamiGame('talaj', 2, 0, 42, 90);
  g.startMatch(2, 0);
  const rm = g.roundManager;
  const pA = g.players[0], pB = g.players[1];

  /* المسرح: pB فاتح، له متماثلة رباعية بجوكر (مصدر الاستبدال)، وللخصم
     متماثلة ثلاثية نقية تقبل الجوكر رابعاً (الموضع الحتمي) */
  const joker = J();
  const set4 = new RamiMeld(MELD_TYPE.SET, [C(9, 'spade'), C(9, 'heart'), C(9, 'diamond'), joker]);
  const sevenClubs = C(7, 'club');   /* ورقة الاستبدال المعنية (9♣) نستعمل 7 متميزة */
  const nineClubs = C(9, 'club');
  const fillers = [C(2, 'diamond'), C(3, 'spade'), C(4, 'heart')];
  pB.melds = [set4];
  pB.hasOpened = true;
  const set3opp = new RamiMeld(MELD_TYPE.SET, [C(4, 'spade'), C(4, 'heart'), C(4, 'diamond')]);
  pA.melds = [set3opp];
  pA.hasOpened = true;
  rm.tableMelds = [set4, set3opp];
  pB.hand = [nineClubs].concat(fillers);
  rm.turnPhase = 'WAITING_DISCARD';
  rm.currentPlayerIndex = 1;

  /* الاستبدال عبر المسار الشبكي الحتمي */
  _ramiNetApplyAddToMeld(g, { playerId: pB.id, targetPlayerId: pB.id, meldIndex: 0, cardIdx: 3, cardId: nineClubs.id });
  ok(set4.cards.length === 4 && set4.cards[3] === nineClubs && !set4.cards.some(c => c.isJoker), 'الاستبدال: 9♣ حلت محل الجوكر في الرباعية');
  ok(pB.hand.some(c => c.id === joker.id), 'الجوكر عاد ليد المستبدِل');
  ok(pB.jokerMustPlaceId === joker.id, 'وسم الإلزام قائم على اللاعب (نفس الدور)');

  /* رمي والجوكر باليد: المحرك يضعه حتمياً في متماثلة الخصم ثم يُجيز الرمي */
  const dis = g.executeMove({ type: 'discard', playerId: pB.id, cardId: fillers[0].id });
  ok(dis.success === true, 'الرمي نجح: الجوكر وُضع حتمياً في موضعه القانوني قبل الرمي');
  ok(!pB.hand.some(c => c.id === joker.id), 'الجوكر لم يعد في اليد');
  ok(set3opp.cards.some(c => c.id === joker.id) && set3opp.cards.length === 4, 'الجوكر رابع متماثلة الخصم (الوضع الحتمي)');
  ok(pB.jokerMustPlaceId === null, 'الإلزام سقط بعد الوفاء به');
}

/* ═══ 3) الإلزام — لا موضع قط: الرمي يُرفض حتى يضعه اللاعب بنفسه ═══ */
console.log('── 3) لا موضع للجوكر: رفض الرمي حتى افتتاح مجموعة به ──');
{
  const g = new RamiGame('talaj', 2, 0, 43, 90);
  g.startMatch(2, 0);
  const rm = g.roundManager;
  const pA = g.players[0], pB = g.players[1];

  const joker = J();
  const set4 = new RamiMeld(MELD_TYPE.SET, [C(9, 'spade'), C(9, 'heart'), C(9, 'diamond'), joker]);
  const nineClubs = C(9, 'club');
  /* خصمهما: متتالية بجوكر — لا تقبل جوكراً ثانياً، فلا موضع قائم للجوكر */
  const seqOpp = new RamiMeld(MELD_TYPE.SEQUENCE, [C(5, 'club'), J(), C(7, 'club')]);
  pB.melds = [set4];
  pB.hasOpened = true;
  pA.melds = [seqOpp];
  pA.hasOpened = true;
  rm.tableMelds = [set4, seqOpp];
  /* يد تكفي لافتتاح متماثلة بالجوكر (K♦ K♣) + ورقتا رمي */
  const kd = C(13, 'diamond'), kc = C(13, 'club');
  const f1 = C(2, 'spade'), f2 = C(3, 'heart');
  pB.hand = [nineClubs, kd, kc, f1, f2];
  rm.turnPhase = 'WAITING_DISCARD';
  rm.currentPlayerIndex = 1;

  ok(ramiJokerHasHomeThisTurn(g, pB, nineClubs, set4, 3, joker) === true, 'الفحص المسبق: افتتاح K♦ K♣ بالجوكر موضع قانوني ⇒ الاستبدال جائز');

  _ramiNetApplyAddToMeld(g, { playerId: pB.id, targetPlayerId: pB.id, meldIndex: 0, cardIdx: 3, cardId: nineClubs.id });
  ok(pB.jokerMustPlaceId === joker.id, 'الإلزام قائم بعد الاستبدال');

  /* رمي قبل وضع الجوكر وبلا موضع حتمي ⇒ رفض قاطع */
  const blocked = g.executeMove({ type: 'discard', playerId: pB.id, cardId: f1.id });
  ok(blocked.success === false && /إلزامي/.test(blocked.error || ''), 'الرمي مرفوض ما دام الجوكر باليد بلا موضع');

  /* الوفاء بافتتاح متماثلة تضم الجوكر (إظهار مجموعة جديدة) */
  const openRes = g.executeMove({ type: 'open', playerId: pB.id, cardIds: [joker.id, kd.id, kc.id] });
  ok(openRes.success === true, 'افتتاح متماثلة (جوكر K♦ K♣) نجح');
  ok(!pB.hand.some(c => c.id === joker.id), 'الجوكر نُزل مع المجموعة الجديدة');
  ok(pB.jokerMustPlaceId === null, 'الإلزام سقط بالافتتاح');

  const dis = g.executeMove({ type: 'discard', playerId: pB.id, cardId: f1.id });
  ok(dis.success === true, 'الرمي يمر بعد الوفاء بالإلزام');
}

/* ═══ 4) الفحص المسبق يمنع استبدالاً بلا مخرج (منع تعليق الدور) ═══ */
console.log('── 4) الفحص المسبق: لا استبدال بلا موضع قانوني في الدور نفسه ──');
{
  const g = new RamiGame('talaj', 2, 0, 44, 90);
  g.startMatch(2, 0);
  const rm = g.roundManager;
  const pA = g.players[0], pB = g.players[1];

  const joker = J();
  const set4 = new RamiMeld(MELD_TYPE.SET, [C(9, 'spade'), C(9, 'heart'), C(9, 'diamond'), joker]);
  const nineClubs = C(9, 'club');
  const seqOpp = new RamiMeld(MELD_TYPE.SEQUENCE, [C(5, 'club'), J(), C(7, 'club')]);
  pB.melds = [set4];
  pB.hasOpened = true;
  pA.melds = [seqOpp];
  pA.hasOpened = true;
  rm.tableMelds = [set4, seqOpp];
  /* يد لا تستطيع تأليف أي مجموعة مع الجوكر (أرقاق متنافرة) */
  pB.hand = [nineClubs, C(2, 'diamond'), C(8, 'spade'), C(11, 'heart'), C(6, 'club')];
  rm.turnPhase = 'WAITING_DISCARD';
  rm.currentPlayerIndex = 1;

  ok(ramiJokerHasHomeThisTurn(g, pB, nineClubs, set4, 3, joker) === false, 'لا مجموعة قائمة ولا افتتاح ممكن ⇒ الفحص المسبق يرفض الاستبدال');
}

/* ═══ 5) حماية الإنهاء: لا عزل بالجوكر المستبدَل ═══ */
console.log('── 5) الإنهاء: ورقة العزل لا تكون الجوكر المستبدَل ──');
{
  const g = new RamiGame('talaj', 2, 0, 45, 90);
  g.startMatch(2, 0);
  const rm = g.roundManager;
  const pB = g.players[1];
  const joker = J();

  /* الحالة 1: يد فيها الجوكر وحده */
  pB.hand = [joker];
  pB.jokerMustPlaceId = joker.id;
  pB.hasOpened = true;
  rm.turnPhase = 'WAITING_DISCARD';
  rm.currentPlayerIndex = 1;
  const fin1 = g.executeMove({ type: 'finish', playerId: pB.id, isolateCardId: joker.id });
  ok(fin1.success === false && /الجوكر/.test(fin1.error || ''), 'إنهاء بعزل الجوكر الملزَم مرفوض');
  pB.jokerMustPlaceId = null; /* تنظيف للفقرة التالية */
}

/* ═══ 6) شفاء ذاتي: الإلزام يسقط ببدء الدور التالي لصاحبه ═══ */
console.log('── 6) الشفاء الذاتي: nextPlayer يسقط الوسم المتقادم ──');
{
  const g = new RamiGame('talaj', 2, 0, 46, 90);
  g.startMatch(2, 0);
  const rm = g.roundManager;
  const pA = g.players[0], pB = g.players[1];
  const joker = J();
  pB.jokerMustPlaceId = joker.id;   /* وسم متقادم (افتراضي) */
  rm.turnPhase = 'WAITING_DISCARD';
  rm.currentPlayerIndex = 1;
  rm.nextPlayer();   /* ← pA */
  ok(pA.jokerMustPlaceId === null, 'لا وسم على القادم الأول');
  rm.nextPlayer();   /* ← pB ثانيةً */
  ok(pB.jokerMustPlaceId === null, 'الوسم المتقادم سقط ببدء دور صاحبه من جديد');
}

console.log('\n════════ الإجمالي: ' + pass + ' ✓ / ' + fail + ' ✗ ════════');
process.exit(fail ? 1 : 0);
