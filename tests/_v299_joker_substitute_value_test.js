/* ═══════════════════════════════════════════════════════════════════════════
   [v2.99] حرس تقييم الجوكر بنقاط الورقة المعوَّضة في مجموعته
   بلاغ المالك 2026-10-15 (التصحيح الثاني لخلل الافتتاح):
   «يوجد خلل في لعبة الرامي نوع سامپل: الجوكر يجب أن يُحسب بنقاط رقم
    الورقة اللتي يعوضها في المجموعة المعنية (متتالية / متماثلة) ولا يحسب
    دائماً بـ10 نقاط في المجموع الإجمالي للمقارنة (لا في عتبة الـ51)».
   الجذر: علاج v2.98 الأول حسب الجوكر/البرية قيمةً وجهية ثابتة (10) في
   المجموع الإجمالي (extraScore) الذي يُسجَّل في highestOpeningScore ويُقارن
   به — فجوكر فجوة 9-في-المتتالية (8-🃏-10) سُجِّل 10 لا 9، وجوكر متماثلة
   الخمسات سُجِّل 10 لا 5 — خلاف ما يعده صاحبه بعينه حين يقرأ مجموعته.
   والعلاج الجذري [v2.99]: نقاط الورقة البرية = نقاط الورقة التي يعوّضها في
   مجموعتها المعنية بعينها —
     - متتالية: جوكرات المجموعة يسدّون فجوات الرتب الناقصة أولاً (تصاعداً)
       ثم يمتد الفائض عند الطرفين حسب موضعه، مستقلاً عن ترتيب المصفوفة
       الذي يختلف بين مسارات البناء (تحديد اللاعب يضع الجوكر في فجوته،
       وتقسيم المحرك يلحق البريات بالطرف) — فكلا المسارين يسدّ الفجوة نفسها.
     - متماثلة: الجوكر يعوّض ورقة برتبة المجموعة نفسها.
     - الآس سياقي: المعوَّض في Q-K-A = 10، والمعوَّض في A-2-3 = 1.
   والعتبة (freeScore) تبقى بلا جوكر تماماً كما تقضي «دون جوكر في الحساب» —
   والجوكر المسحوب من المرموق لا تدخل مجموعته العتبة (قاعدة v19.3 محفوظة).
   تشغيل:  node tests/_v299_joker_substitute_value_test.js  (ساكن + محرك خالص)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name); }
}

console.log('── 1) رامي: عقد تقييم الجوكر المعوَّض (المصدر) ──');
{
  const src = read('js/games/rami.js');
  ok(src.indexOf('wildCardValueInMeld(card, meld) {') !== -1, 'دالة wildCardValueInMeld معرَّفة في RamiRules');
  ok(src.indexOf('if (hasWild) extraScore += this.wildCardValueInMeld(card, meld);') !== -1, 'validateOpening تحسب الجوكر بنقاط الورقة المعوَّضة');
  ok(src.indexOf('if (this.isWildCard(card)) continue;') === -1, 'الإسقاط القديم (الجوكر 0) زال');
  ok(src.indexOf('if (hasWild) extraScore += (card.baseValue != null ? card.baseValue : 10);') === -1, 'القيمة الوجهية الثابتة (10) زالت');
  ok(src.indexOf('مستقلاً عن ترتيب') !== -1, 'عقد استقلال القيمة عن ترتيب المصفوفة موثّق في المصدر');
  const rules = read('js/rules/game-rules.js');
  ok(rules.indexOf('والجوكر يُحسب بنقاط الورقة التي يعوّضها في مجموعته (متتالية: الرقم الناقص في فجوته / متماثلة: رتبة المجموعة نفسها) في المجموع الإجمالي للمقارنة (لا في عتبة الـ51)') !== -1, 'نص القواعد (ع/سامبل) محدَّث');
  ok(rules.indexOf('a Joker counts the points of the card it substitutes in its own meld (Sequence: the missing rank in its gap / Set: the group') !== -1, 'نص القواعد (en/سامبل) محدَّث');
  ok(rules.indexOf('compte les points de la carte qu') !== -1, 'نص القواعد (fr) محدَّث');
  ok(rules.indexOf('والجوكر يُحسب 10 نقاط في المجموع الإجمالي للمقارنة') === -1, 'النص القديم (10 ثابتة/سامبل ع) زال');
  ok(rules.indexOf('Jokers count 10 points') === -1, 'النص القديم (10 ثابتة/طلاج en) زال');
  ok(rules.indexOf('un joker compte 10 points') === -1 && rules.indexOf('le joker compte 10 points') === -1, 'النص القديم (10 ثابتة/فر) زال');
}

/* ═════ جزء المحرك: سيناريوهات القيمة المعوَّضة ═════ */
const ctx = {
  console, Date, Math, JSON, Set, Map, Array, Object, Number, String,
  setTimeout: (fn) => fn(), window: {}, _ramiToast: () => {}, SND: {}
};
vm.createContext(ctx);
vm.runInContext(read('js/games/rami.js') + '\n;globalThis.__X = { RamiGame, RamiRules, MELD_TYPE, RamiMeld, RamiExpertAI };', ctx);
const { RamiGame, RamiRules, MELD_TYPE, RamiMeld, RamiExpertAI } = ctx.__X;

let _cid = 9500;
function C(rank, suit) {
  suit = suit || 'heart';
  const baseValue = rank === 1 ? 10 : (rank > 10 ? 10 : rank);
  return { id: 'T' + (_cid++), rank, suit, baseValue, isJoker: false, displayName: rank + suit };
}
function mkRules() {
  const r = new RamiRules('simple', 90);
  r.jokerIndicator = C(11, 'sword'); /* J♠ أسود → J♥/J♦ بريتان (وجههما 10) */
  return r;
}
function wildVal(rules, cards, type, which) {
  const m = new RamiMeld(type || MELD_TYPE.SEQUENCE, cards);
  const w = cards.filter(c => rules.isWildCard(c))[which || 0];
  return rules.wildCardValueInMeld(w, m);
}
function jokerOpening(rules, melds, drawn, prev) {
  return rules.validateOpening(melds, drawn || null, rules.jokerIndicator, prev || 0, false);
}
const SEQ = (cards) => new RamiMeld(MELD_TYPE.SEQUENCE, cards);
const SET = (cards) => new RamiMeld(MELD_TYPE.SET, cards);

console.log('── 2) المحرك: جوكر وسط الفجوة = 9 لا 10 — مستقلاً عن ترتيب المصفوفة ──');
{
  const r = mkRules();
  /* الترتيب كما يضعه اللاعب (الجوكر في فجوته) */
  ok(wildVal(r, [C(8, 'heart'), C(11, 'heart'), C(10, 'heart')]) === 9, '[8,🃏,10] (وضع اللاعب) ⇒ 9');
  /* ترتيب التقسيم (البريات ملحقة بالطرف) */
  ok(wildVal(r, [C(8, 'heart'), C(10, 'heart'), C(11, 'heart')]) === 9, '[8,10,🃏] (ترتيب التقسيم) ⇒ 9');
  ok(wildVal(r, [C(11, 'heart'), C(8, 'heart'), C(10, 'heart')]) === 9, '[🃏,8,10] (جوكر في الرأس) ⇒ 9');
  /* بلاغ المالك الحرفي بالمسار الكامل: freeScore=57 بلا جوكر والمجموع=84 لا 85 */
  const chk = jokerOpening(r, [
    SEQ([C(12, 'heart'), C(13, 'heart'), C(1, 'heart')]),
    SET([C(9, 'sword'), C(9, 'diamond'), C(9, 'grape')]),
    SEQ([C(8, 'heart'), C(11, 'heart'), C(10, 'heart')])
  ]);
  ok(chk.valid === true && chk.freeScore === 57 && chk.score === 84,
    'الافتتاح: freeScore=57 (بلا جوكر) والمجموع الإجمالي=84 (الجوكر 9) — فعلي: ' + JSON.stringify({ freeScore: chk.freeScore, score: chk.score }));
  ok(chk.score === 84 && chk.score !== 85, 'لا يعود 85 (قيمة v2.98 المنقّحة) أبداً');
}

console.log('── 3) المحرك: جوكر المتماثلة = رتبة المجموعة ──');
{
  const r = mkRules();
  ok(wildVal(r, [C(5, 'sword'), C(5, 'grape'), C(11, 'heart')], MELD_TYPE.SET) === 5, 'متماثلة 5ات+🃏 ⇒ 5');
  ok(wildVal(r, [C(13, 'sword'), C(13, 'grape'), C(11, 'heart')], MELD_TYPE.SET) === 10, 'متماثلة Kات+🃏 ⇒ 10');
  ok(wildVal(r, [C(1, 'sword'), C(1, 'grape'), C(11, 'heart')], MELD_TYPE.SET) === 10, 'متماثلة آسات+🃏 ⇒ 10');
  ok(wildVal(r, [C(7, 'sword'), C(7, 'grape'), C(11, 'heart')], MELD_TYPE.SET) === 7, 'متماثلة 7ات+🃏 ⇒ 7');
  const chk = jokerOpening(r, [
    SEQ([C(12, 'heart'), C(13, 'heart'), C(1, 'heart')]),
    SET([C(9, 'sword'), C(9, 'diamond'), C(9, 'grape')]),
    SET([C(5, 'sword'), C(5, 'grape'), C(11, 'heart')])
  ]);
  ok(chk.valid === true && chk.freeScore === 57 && chk.score === 72,
    'افتتاح بمتماثلة-جوكر: المجموع=72 (5+5+5) لا 77 — فعلي: ' + JSON.stringify({ freeScore: chk.freeScore, score: chk.score }));
}

console.log('── 4) المحرك: الطرفان والآس السياقي ──');
{
  const r = mkRules();
  ok(wildVal(r, [C(10, 'heart'), C(11, 'sword'), C(12, 'heart'), C(11, 'heart')]) === 10, 'طرف أكبر [10,J,Q,🃏] ⇒ K=10');
  ok(wildVal(r, [C(12, 'heart'), C(13, 'heart'), C(11, 'heart')]) === 10, 'طرف أكبر [Q,K,🃏] ⇒ آس عالٍ=10');
  ok(wildVal(r, [C(11, 'heart'), C(3, 'heart'), C(4, 'heart')]) === 2, 'طرف أصغر [🃏,3,4] ⇒ 2');
  ok(wildVal(r, [C(11, 'heart'), C(2, 'heart'), C(3, 'heart')]) === 1, 'طرف أصغر [🃏,2,3] ⇒ آس منخفض=1');
}

console.log('── 5) المحرك: جوكران في فجوة/فجوتين — بالترتيبين ──');
{
  const r = mkRules();
  const w1 = C(11, 'heart'), w2 = C(11, 'diamond');
  const a1 = wildVal(r, [C(8, 'heart'), w1, w2, C(11, 'sword')], MELD_TYPE.SEQUENCE, 0);
  const b1 = wildVal(r, [C(8, 'heart'), w1, w2, C(11, 'sword')], MELD_TYPE.SEQUENCE, 1);
  ok(a1 === 9 && b1 === 10, '[8,🃏1,🃏2,J] بوضع اللاعب ⇒ 9 ثم 10 — فعلي: ' + [a1, b1]);
  const v1 = C(11, 'heart'), v2 = C(11, 'diamond');
  const a2 = wildVal(r, [C(8, 'heart'), C(10, 'heart'), v1, v2], MELD_TYPE.SEQUENCE, 0);
  const b2 = wildVal(r, [C(8, 'heart'), C(10, 'heart'), v1, v2], MELD_TYPE.SEQUENCE, 1);
  ok(a2 === 9 && b2 === 10, '[8,10,🃏1,🃏2] بترتيب التقسيم ⇒ 9 (يسدّ الفجوة) ثم 10 (J) — فعلي: ' + [a2, b2]);
  /* رأس بجوكرين: [🃏,🃏,3,4] ⇒ A(1) ثم 2 */
  const h1 = C(11, 'heart'), h2 = C(11, 'diamond');
  const a3 = wildVal(r, [h1, h2, C(3, 'heart'), C(4, 'heart')], MELD_TYPE.SEQUENCE, 0);
  const b3 = wildVal(r, [h1, h2, C(3, 'heart'), C(4, 'heart')], MELD_TYPE.SEQUENCE, 1);
  ok(a3 === 1 && b3 === 2, '[🃏,🃏,3,4] ⇒ آس منخفض=1 ثم 2 — فعلي: ' + [a3, b3]);
  /* طرفان بجوكرين: [🃏,10,J,🃏] ⇒ 9 ثم Q */
  const e1 = C(11, 'heart'), e2 = C(11, 'diamond');
  const a4 = wildVal(r, [e1, C(10, 'heart'), C(11, 'sword'), e2], MELD_TYPE.SEQUENCE, 0);
  const b4 = wildVal(r, [e1, C(10, 'heart'), C(11, 'sword'), e2], MELD_TYPE.SEQUENCE, 1);
  ok(a4 === 9 && b4 === 10, '[🃏,10,J,🃏] ⇒ 9 ثم Q=10 — فعلي: ' + [a4, b4]);
}

console.log('── 6) المحرك: طلاج — الجوكر المطبوع بالمنطق نفسه ──');
{
  const r = new RamiRules('talaj', 90);
  r.jokerIndicator = null;
  const pj = C(0, 'joker'); pj.isJoker = true;
  ok(wildVal(r, [C(8, 'heart'), pj, C(10, 'heart')]) === 9, 'طلاج [8,جوكر مطبوع,10] ⇒ 9');
  const chk = r.validateOpening([
    SEQ([C(12, 'heart'), C(13, 'heart'), C(1, 'heart')]),
    SET([C(13, 'sword'), C(13, 'diamond'), C(13, 'grape')]),
    SET([C(4, 'sword'), C(4, 'diamond'), C(4, 'grape')]),
    SEQ([C(8, 'heart'), C(0, 'joker2'), C(10, 'heart')])
  ], null, null, 0, false);
  /* الجوكر المطبوع الثاني يُنشأ فعلياً: نعيد الاختبار بجوكر صحيح */
  const pj2 = C(0, 'joker'); pj2.isJoker = true;
  const chk2 = r.validateOpening([
    SEQ([C(12, 'heart'), C(13, 'heart'), C(1, 'heart')]),
    SET([C(13, 'sword'), C(13, 'diamond'), C(13, 'grape')]),
    SET([C(4, 'sword'), C(4, 'diamond'), C(4, 'grape')]),
    SEQ([C(8, 'heart'), pj2, C(10, 'heart')])
  ], null, null, 0, false);
  ok(chk2.valid === true && chk2.freeScore === 72 && chk2.score === 99,
    'طلاج: freeScore=72 ≥ 71 والمجموع=99 (الجوكر 9) لا 100 — فعلي: ' + JSON.stringify({ freeScore: chk2.freeScore, score: chk2.score }));
}

console.log('── 7) المحرك: المسار الكامل — التسجيل والرفض بمجموع الإدراك ──');
{
  const g = new RamiGame('simple', 2, 1, 42, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  rm.jokerIndicator = C(11, 'sword');
  if (g.rules) g.rules.jokerIndicator = rm.jokerIndicator;
  const human = g.players.find(p => !p.isBot);
  const bot = g.players.find(p => p.isBot);
  const joker = C(11, 'heart');
  const hSeq = [C(12, 'heart'), C(13, 'heart'), C(1, 'heart')];
  const hSet1 = [C(9, 'sword'), C(9, 'diamond'), C(9, 'club')];
  const hJok = [C(8, 'heart'), joker, C(10, 'heart')];
  /* حشوات لا تُكوّن مجموعة إضافية (رموز مختلفة) — كي لا يجد التقسيم/الخبير افتتاحاً أعلى */
  const filler = [C(2, 'grape'), C(5, 'diamond'), C(7, 'grape'), C(3, 'sword')];
  human.hand = hSeq.concat(hSet1, hJok, filler);
  human.drawnDiscardCard = null; human.tookLaTour = false; human.hasOpened = false;
  const bSeq = [C(12, 'club'), C(13, 'club'), C(1, 'club')];
  const bSet1 = [C(13, 'sword'), C(13, 'diamond'), C(13, 'heart')];
  const bSet2 = [C(8, 'sword'), C(8, 'diamond'), C(8, 'heart')];
  /* حشوات لا تُكوّن مجموعة إضافية (رموز مختلفة) — كي يبقى أفضل افتتاح للآلي 84 بالضبط */
  const bFiller = [C(2, 'grape'), C(5, 'diamond'), C(7, 'grape'), C(3, 'sword')];
  bot.hand = bSeq.concat(bSet1, bSet2, bFiller);
  bot.drawnDiscardCard = null; bot.tookLaTour = false; bot.hasOpened = false;
  rm.currentPlayerIndex = g.players.indexOf(human);
  rm.turnPhase = 'WAITING_DISCARD';
  rm.dealerFirstCycle = false;
  /* executeMove يمر عبر التقسيم (البريات ملحقة بالطرف) — يجب أن يسجّل 84 */
  const rOpen = g.executeMove({ type: 'open', playerId: human.id, cardIds: hSeq.concat(hSet1, hJok).map(c => c.id) });
  ok(rOpen.success === true && rm.highestOpeningScore === 84,
    'executeMove (مسار التقسيم): افتتاح بجوكر الفجوة سُجّل 84 لا 85 — فعلي: ' + rm.highestOpeningScore);
  rm.currentPlayerIndex = g.players.indexOf(bot);
  rm.turnPhase = 'WAITING_DISCARD';
  const plan = RamiExpertAI.expertOpening(g, bot);
  ok(plan === null, 'الخبير لا يفتتح بـ84 بعد 84 (تساوٍ مرفوض)');
  const rBot = g.executeMove({ type: 'open', playerId: bot.id, cardIds: bSeq.concat(bSet1, bSet2).map(c => c.id) });
  ok(rBot.success !== true && bot.hasOpened === false, 'executeMove يرفض افتتاح الآلي 84 بعد 84');
  ok(g.getLegalMoves(bot.id).every(m => m.type !== 'open'), 'getLegalMoves لا تعرض افتتاحاً بـ84');
}

console.log('── 8) المحرك: العتبة بلا جوكر محفوظة (قاعدة v19.3 لا تُمسّ) ──');
{
  const r = mkRules();
  /* مجموعة جوكر وحدها لا تبلغ العتبة ولو كانت قيمتها كبيرة */
  const lowFree = jokerOpening(r, [
    SEQ([C(2, 'sword'), C(3, 'sword'), C(4, 'sword')]),
    SET([C(5, 'heart'), C(5, 'diamond'), C(5, 'sword')]),
    SET([C(13, 'heart'), C(13, 'diamond'), C(11, 'heart')])
  ]);
  ok(lowFree.valid === false && lowFree.freeScore === 24,
    'حر 24 < 51 مرفوض — مجموعة الجوكر (K,K,🃏=30) لا تدخل العتبة ولو كانت قيمتها المعوَّضة 30 — فعلي: ' + JSON.stringify({ valid: lowFree.valid, freeScore: lowFree.freeScore }));
  /* والمسحوبة الجوكر من المرموق لا تدخل مجموعته العتبة (v19.3) */
  const drawnJok = C(11, 'heart'); /* برية */
  const r3 = jokerOpening(r, [
    SEQ([C(2, 'grape'), C(3, 'grape'), C(4, 'grape')]),
    SET([C(13, 'heart'), C(13, 'diamond'), C(13, 'sword')]),
    SEQ([drawnJok, C(11, 'diamond'), C(12, 'diamond')])
  ], drawnJok);
  ok(!r3.valid || r3.freeScore === 39, 'المسحوبة الجوكر لا تدخل مجموعتها العتبة (freeScore=39)');
}

/* ═══════════ جزء البصمات والتغطية (اشتقاق قاعدة 22) ═══════════ */
console.log('── 9) البصمات والتغطية ──');
{
  const pkgV = JSON.parse(read('package.json')).version;
  const stamp = 'v' + pkgV.split('.').slice(0, 2).join('');
  const idx = read('index.html');
  ok(idx.indexOf('js/games/rami.js?v=' + stamp) !== -1, 'بصمة rami.js = ' + stamp);
  ok(idx.indexOf('js/rules/game-rules.js?v=dtsg11') !== -1, 'بصمة game-rules.js = dtsg11 (محتواها تغيّر)');
  ok(idx.indexOf('uno-game/css/uno.css?v=un6') !== -1, 'بصمة uno.css بقيت un6 (محتواها لم يتغيّر في v2.99)');
  ok(read('js/main.js').indexOf("window.DTSG_BUILD = 'v" + pkgV + "';") !== -1, 'DTSG_BUILD = v' + pkgV);
  const lock = read('package-lock.json');
  ok(lock.indexOf('"version": "' + pkgV + '",') !== -1, 'package-lock يوافق package.json (' + pkgV + ')');
  const runner = read('tests/_run_regression_rooms.sh');
  ok(runner.indexOf('_v299_joker_substitute_value_test.js') !== -1, 'الحرس مُدرج في عدّاء البطارية');
  ok(read('CHANGELOG.md').indexOf('## v2.99.0') !== -1, 'CHANGELOG: كتلة v2.99.0 موجودة');
  ok(read('AGENTS.md').indexOf('[v2.99]') !== -1, 'AGENTS.md: قاعدة v2.99 موثّقة');
}

console.log('\nالنتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل');
process.exit(fail ? 1 : 0);
