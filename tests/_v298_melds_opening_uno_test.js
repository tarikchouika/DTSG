/* ═══════════════════════════════════════════════════════════════════════════
   [v2.98] حرس عرض المجموعات المنزلة في خانتها + تقييم الجوكر في مجموع
   الافتتاح المسجَّل + إزاحة عبارة أونو 35px بورتريه
   بلاغ المالك 2026-10-15 — ثلاثة أعطال ميدانية:
   ① رامي: «عندما يضيف أحد الخصوم ورقة أو أكثر للأوراق المنزلة الظاهرة الخاصة
      باللاعب الرئيسي لا توضع في مكانها وسط المجموعة المعنية بل في إحدى
      المناطق الخمسة بشكل عشوائي — يجب أن توضع في موضعها الصحيح داخل
      المجموعة (متماثلة/متتالية)».
      الجذر: _updateHand (الفرع الحي) كان يدفع أوراق المجموعات غير
      الموضوعة إلى «أول خانة فارغة/الأقل ازدحاماً» — والعلاج: تطبيع كل
      مجموعة منزلة داخل خانتها التي تعرض أكثر أوراقها فعلاً، كاملةً
      مرتبةً (المتتالية تصاعدياً بترتيب ramiOrderSequenceCards).
   ② رامي سامبل: «افتتحت بمجموع 84 وافتتح الخصم الآلي بمجموع 83 — مخالف
      للقانون (يجب تجاوز أعلى افتتاح سابق، التساوي مرفوض)».
      الجذر: validateOpening كانت تحسب الجوكر 0 في المجموع الإجمالي
      (totalScore) الذي يُسجَّل في highestOpeningScore ويُقارن به — فيُسجَّل
      «أعلى افتتاح» أدنى مما يعده صاحبه بعينه فيفتتح الآلي تحته.
      العلاج الأول (v2.98): قيمة وجهية 10 — ثم نقّحه المالك (بلاغ
      2026-10-15 الثاني): الجوكر يُحسب بنقاط الورقة التي يعوّضها في
      مجموعته المعنية (متتالية: الرقم الناقص في فجوته / متماثلة: رتبة
      المجموعة نفسها) — لا 10 دائماً — بينما تبقى العتبة (freeScore)
      بلا جوكر كما تقضي القاعدة (حرس v2.99 يغطي التفصيل).
   ③ أونو بورتريه: «إسم اللعبة (عبارة أونو) محشورة فوق أيقونة اللاعب الجالس
      في الأعلى — يجب إزاحتها 35 بكسل لأسفل».
      العلاج: قاعدة بورتريه فقط على رأس القائمة (عبارة اسم اللعبة الوحيدة
      في تجربة اللعبة) padding-top: 35px — اللاندسكيب وسائر التخطيط كما هي.
   تشغيل:  node tests/_v298_melds_opening_uno_test.js  (ساكن + محرك خالص)
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

console.log('── 1) رامي: عقد عرض المجموعات المنزلة في خانتها (المصدر) ──');
{
  const src = read('js/games/rami.js');
  ok(src.indexOf('[v2.98·خلل الخصوم]') !== -1, 'كتلة [v2.98·خلل الخصوم] موجودة في _updateHand');
  ok(src.indexOf('let homeSlot = -1, bestCnt = 0;') !== -1, 'اختيار خانة المجموعة بأكثر أوراقها (homeSlot)');
  ok(src.indexOf('const orderedFull = (m.type === MELD_TYPE.SEQUENCE)') !== -1, 'المجموعة كاملة مرتبة (orderedFull) تبني الخانة');
  ok(src.indexOf('this.handSlots[homeSlot] = before.concat(orderedFull, after);') !== -1, 'إعادة بناء الخانة: قبلها + المجموعة + بعدها');
  ok(src.indexOf('this.handSlots[s] = this.handSlots[s].filter(c => !meldIdSet.has(c.id));') !== -1, 'إزالة الأوراق المشتّتة لنفس المجموعة من الخانات الأخرى');
  /* النمط القديم المعطوب زال حرفياً */
  ok(src.indexOf('unplaced') === -1, 'نمط «الأوراق غير الموضوعة → خانة عشوائية» زال تماماً');
  ok(src.indexOf('this.handSlots[emptySlot].push(...ord);') === -1, 'الدفع القديم إلى emptySlot/الأقل ازدحاماً زال');
}

console.log('── 2) رامي: عقد تقييم الجوكر في مجموع الافتتاح (المصدر) ──');
{
  const src = read('js/games/rami.js');
  ok(src.indexOf('[v2.98·خلل الافتتاح 83 بعد 84]') !== -1, 'كتلة [v2.98·خلل الافتتاح 83 بعد 84] موجودة في validateOpening');
  ok(src.indexOf('[v2.99·بلاغ المالك 2026-10-15] التصحيح الثاني') !== -1, 'كتلة [v2.99·بلاغ المالك] التصحيح الثاني موجودة');
  ok(src.indexOf('if (hasWild) extraScore += this.wildCardValueInMeld(card, meld);') !== -1, 'الجوكر يُحسب بنقاط الورقة المعوَّضة (wildCardValueInMeld) في المجموع الإجمالي');
  ok(src.indexOf('if (this.isWildCard(card)) continue;') === -1, 'الإسقاط القديم (الجوكر 0) زال');
  ok(src.indexOf('if (hasWild) extraScore += (card.baseValue != null ? card.baseValue : 10);') === -1, 'القيمة الوجهية الثابتة (10) المنقّحة بتوجيه المالك زالت');
  const rules = read('js/rules/game-rules.js');
  ok(rules.indexOf('والجوكر يُحسب بنقاط الورقة التي يعوّضها في مجموعته') !== -1, 'نص القواعد (ع): تقييم الجوكر المعوَّض موثّق');
  ok(rules.indexOf('a Joker counts the points of the card it substitutes in its own meld') !== -1, 'نص القواعد (en): تقييم الجوكر المعوَّض موثّق');
  ok(rules.indexOf("compte les points de la carte qu") !== -1, 'نص القواعد (fr): تقييم الجوكر المعوَّض موثّق');
}

console.log('── 3) أونو: عقد إزاحة العبارة 35px بورتريه (المصدر) ──');
{
  const css = read('uno-game/css/uno.css');
  ok(css.indexOf('[v2.98·بلاغ المالك]') !== -1, 'تعليق [v2.98·بلاغ المالك] موجود');
  ok(/@media \(orientation: portrait\) \{\s*\.un-stage \.un-menuhead \{ padding-top: 35px; \}/.test(css), 'قاعدة بورتريه: رأس القائمة +35px');
  ok(/justify-content: center;[\s\S]{0,600}justify-content: safe center;/.test(css), 'safe center فوق center: لا قصّ لرأس القائمة عند فيضان اللاندسكيب (قياس حي: من top=-118 إلى 21)');
  ok(/\.un-stage \.un-seat-top \{ top: -15px !important; \}/.test(css), 'عقد R13 (أوراق العلوي تلامس الحد الأعلى) محفوظ بتمامه');
}

/* ═════ جزء المحرك: سيناريوهات الافتتاح (نفس عقد بلاغ المالك) ═════ */
const ctx = {
  console, Date, Math, JSON, Set, Map, Array, Object, Number, String,
  setTimeout: (fn) => fn(), window: {},
  _ramiToast: () => {}, SND: {}
};
vm.createContext(ctx);
vm.runInContext(read('js/games/rami.js') + '\n;globalThis.__X = { RamiGame, RamiRules, MELD_TYPE, RamiMeld, RamiExpertAI };', ctx);
const { RamiGame, RamiRules, MELD_TYPE, RamiMeld, RamiExpertAI } = ctx.__X;

let _cid = 9000;
function C(rank, suit) {
  suit = suit || 'heart';
  const baseValue = rank === 1 ? 10 : (rank > 10 ? 10 : rank);
  return { id: 'T' + (_cid++), rank, suit, baseValue, isJoker: false, displayName: rank + suit };
}
function setHand(g, p, cards) {
  p.hand = cards.slice();
  p.drawnDiscardCard = null;
  p.drawnLaTourCard = null;
  p.tookLaTour = false;
  p.hasOpened = false;
  p._openPlanMove = null;
  p._drawPlanIds = null;
}
function filler(n) {
  const out = [];
  const ranks = [2, 3, 4, 5, 6, 7];
  const suits = ['club', 'diamond', 'sword', 'heart'];
  for (let i = 0; i < n; i++) out.push(C(ranks[i % ranks.length], suits[i % suits.length]));
  return out;
}

console.log('── 4) المحرك: بلاغ المالك بالضبط — 84 بشرية ثم 83 آلية ──');
{
  const g = new RamiGame('simple', 2, 1, 42, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  rm.jokerIndicator = null;
  if (g.rules) g.rules.jokerIndicator = null;
  const human = g.players.find(p => !p.isBot);
  const bot = g.players.find(p => p.isBot);
  const hSeq = [C(10, 'heart'), C(11, 'heart'), C(12, 'heart')];
  const hSet1 = [C(13, 'heart'), C(13, 'sword'), C(13, 'diamond')];
  const hSet2 = [C(8, 'heart'), C(8, 'sword'), C(8, 'diamond')];
  setHand(g, human, hSeq.concat(hSet1, hSet2, filler(4)));
  const bSeq = [C(9, 'heart'), C(10, 'heart'), C(11, 'heart')];
  const bSet1 = [C(13, 'club'), C(13, 'heart'), C(13, 'diamond')];
  const bSet2 = [C(8, 'club'), C(8, 'heart'), C(8, 'diamond')];
  setHand(g, bot, bSeq.concat(bSet1, bSet2, filler(4)));
  rm.currentPlayerIndex = g.players.indexOf(human);
  rm.turnPhase = 'WAITING_DISCARD';
  rm.dealerFirstCycle = false;
  const rOpen = g.executeMove({ type: 'open', playerId: human.id, cardIds: hSeq.concat(hSet1, hSet2).map(c => c.id) });
  ok(rOpen.success === true && rm.highestOpeningScore === 84, 'افتتاح البشري 84 نجح وسُجّل 84');
  rm.currentPlayerIndex = g.players.indexOf(bot);
  rm.turnPhase = 'WAITING_DISCARD';
  const plan = RamiExpertAI.expertOpening(g, bot);
  ok(plan === null, 'الخبير لا يفتتح بـ83 بعد 84');
  const rBot = g.executeMove({ type: 'open', playerId: bot.id, cardIds: bSeq.concat(bSet1, bSet2).map(c => c.id) });
  ok(rBot.success !== true && bot.hasOpened === false, 'executeMove يرفض افتتاح الآلي 83 (الرد: ' + String(rBot.error || '').slice(0, 40) + '…)');
  ok(g.getLegalMoves(bot.id).every(m => m.type !== 'open'), 'getLegalMoves لا تعرض افتتاحاً بـ83');
}

console.log('── 5) المحرك: جوكر الافتتاح بنقاط الورقة المعوَّضة — التسجيل بمجموع الإدراك ──');
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
  setHand(g, human, hSeq.concat(hSet1, hJok, filler(4)));
  const bSeq = [C(12, 'club'), C(13, 'club'), C(1, 'club')];
  const bSet1 = [C(13, 'sword'), C(13, 'diamond'), C(13, 'heart')];
  const bSet2 = [C(8, 'sword'), C(8, 'diamond'), C(8, 'heart')];
  setHand(g, bot, bSeq.concat(bSet1, bSet2, filler(4)));
  rm.currentPlayerIndex = g.players.indexOf(human);
  rm.turnPhase = 'WAITING_DISCARD';
  rm.dealerFirstCycle = false;
  const rOpen = g.executeMove({ type: 'open', playerId: human.id, cardIds: hSeq.concat(hSet1, hJok).map(c => c.id) });
  ok(rOpen.success === true && rm.highestOpeningScore === 84, 'افتتاح بجوكر (8-🃏(9)-10): سُجّل 84 (الجوكر معوَّض 9 لا 10) — فعلي: ' + rm.highestOpeningScore);
  const chk = g.rules.validateOpening(
    [new RamiMeld(MELD_TYPE.SEQUENCE, hSeq.slice()),
     new RamiMeld(MELD_TYPE.SET, hSet1.slice()),
     new RamiMeld(MELD_TYPE.SEQUENCE, hJok.slice())], null, rm.jokerIndicator, 0, false);
  ok(chk.valid === true && chk.freeScore === 57 && chk.score === 84, 'العتبة الحرة لا تتأثر بالجوكر: freeScore=57 والمجموع الإجمالي=84 (الجوكر 9) — فعلي: ' + JSON.stringify({ freeScore: chk.freeScore, score: chk.score }));
  rm.currentPlayerIndex = g.players.indexOf(bot);
  rm.turnPhase = 'WAITING_DISCARD';
  const plan = RamiExpertAI.expertOpening(g, bot);
  ok(plan === null, 'الآلي 84 (كان يُقبل تحت التسجيل القديم 75) يُرفض الآن');
  const rBot = g.executeMove({ type: 'open', playerId: bot.id, cardIds: bSeq.concat(bSet1, bSet2).map(c => c.id) });
  ok(rBot.success !== true && bot.hasOpened === false, 'executeMove يرفض افتتاح الآلي 84 بعد 84 (تساوٍ مرفوض)');
}

console.log('── 6) المحرك: التساوي المرفوض 84=84 ──');
{
  const g = new RamiGame('simple', 2, 1, 42, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  rm.jokerIndicator = null;
  if (g.rules) g.rules.jokerIndicator = null;
  const human = g.players.find(p => !p.isBot);
  const bot = g.players.find(p => p.isBot);
  const hSeq = [C(10, 'heart'), C(11, 'heart'), C(12, 'heart')];
  const hSet1 = [C(13, 'heart'), C(13, 'sword'), C(13, 'diamond')];
  const hSet2 = [C(8, 'heart'), C(8, 'sword'), C(8, 'diamond')];
  setHand(g, human, hSeq.concat(hSet1, hSet2, filler(4)));
  const bSeq = [C(10, 'club'), C(11, 'club'), C(12, 'club')];
  const bSet1 = [C(13, 'club'), C(13, 'heart'), C(13, 'diamond')];
  const bSet2 = [C(8, 'club'), C(8, 'heart'), C(8, 'diamond')];
  setHand(g, bot, bSeq.concat(bSet1, bSet2, filler(4)));
  rm.currentPlayerIndex = g.players.indexOf(human);
  rm.turnPhase = 'WAITING_DISCARD';
  rm.dealerFirstCycle = false;
  g.executeMove({ type: 'open', playerId: human.id, cardIds: hSeq.concat(hSet1, hSet2).map(c => c.id) });
  rm.currentPlayerIndex = g.players.indexOf(bot);
  rm.turnPhase = 'WAITING_DISCARD';
  const rBot = g.executeMove({ type: 'open', playerId: bot.id, cardIds: bSeq.concat(bSet1, bSet2).map(c => c.id) });
  ok(rBot.success !== true && bot.hasOpened === false, 'التساوي 84=84 مرفوض (التساوي مرفوض بنص القانون)');
}

/* ═══════════ جزء البصمات والتغطية (اشتقاق قاعدة 22) ═══════════ */
console.log('── 7) البصمات والتغطية ──');
{
  const pkgV = JSON.parse(read('package.json')).version;
  const stamp = 'v' + pkgV.split('.').slice(0, 2).join('');
  const idx = read('index.html');
  ok(idx.indexOf('js/games/rami.js?v=' + stamp) !== -1, 'بصمة rami.js = ' + stamp);
  ok(/js\/rules\/game-rules\.js\?v=dtsg[1-9][0-9]*/.test(idx), 'بصمة game-rules.js مرفوعة (dtsg)');
  ok(/uno-game\/css\/uno\.css\?v=un[1-9][0-9]*/.test(idx), 'بصمة uno.css مرفوعة (un)');
  ok(read('js/main.js').indexOf("window.DTSG_BUILD = 'v" + pkgV + "';") !== -1, 'DTSG_BUILD = v' + pkgV);
  const lock = read('package-lock.json');
  ok(lock.indexOf('"version": "' + pkgV + '",') !== -1, 'package-lock يوافق package.json (' + pkgV + ')');
  const runner = read('tests/_run_regression_rooms.sh');
  ok(runner.indexOf('_v298_melds_opening_uno_test.js') !== -1, 'الحرس مُدرج في عدّاء البطارية');
  ok(read('CHANGELOG.md').indexOf('## v2.98.0') !== -1, 'CHANGELOG: كتلة v2.98.0 موجودة');
  ok(read('AGENTS.md').indexOf('[v2.98]') !== -1, 'AGENTS.md: قاعدة v2.98 موثّقة');
}

console.log('\nالنتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل');
process.exit(fail ? 1 : 0);
