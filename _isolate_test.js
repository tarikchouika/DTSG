/* اختبار خانة العزل (Requirement A):
   يدٌ يمكن للمحرك أن يدمجها كاملة في مجموعات (leftover=0) ⇒ رفض طبيعي.
   مع عزل ورقة واحدة ⇒ الإنهاء الصحيح (14 في مجموعات + ورقة معزولة مقلوبة). */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/js/games/rami.js', 'utf8');
const engine = src.split('class RamiUIAdapter')[0];

const fn = new Function('window', 'document', 'console', engine +
  '\n;return {RamiGame, RamiRules, RamiCard, MELD_TYPE, partitionSelectedCards};');
const E = fn(undefined, undefined, console);
const { RamiGame, RamiCard } = E;

/* بناء لعبة طالاج وحقن يد 7 أوراق:
   متتالية A♠2♠3♠4♠ (يمكن دمجها 4 أو 3+1) + متماثلة 5♥5♦5♣ .
   - دمج كامل ⇒ 7 أوراق في مجموعات (leftover=0) ⇒ يُرفض الإنهاء (لا توجد ورقة معزولة).
   - عزل 4♠ ⇒ A♠2♠3♠ + 5♥5♦5♣ = 6 في مجموعات + 4♠ معزولة ⇒ إنهاء صحيح. */
function buildGame() {
  const game = new RamiGame('talaj', 2, 1, 12345, 90);
  game.startMatch(701);
  const p0 = game.players[0];
  p0.hand = [
    new RamiCard(9001, 1, 'sword'),
    new RamiCard(9002, 2, 'sword'),
    new RamiCard(9003, 3, 'sword'),
    new RamiCard(9004, 4, 'sword'),
    new RamiCard(9005, 5, 'heart'),
    new RamiCard(9006, 5, 'diamond'),
    new RamiCard(9007, 5, 'grape'),
  ];
  p0.hasOpened = true;
  p0.drawnDiscardCard = null;
  p0.drawnLaTourCard = null;
  p0.tookLaTour = false;
  game.roundManager.tableMelds = [];
  game.roundManager.turnPhase = 'WAITING_DISCARD';
  game.roundManager.currentPlayerIndex = 0;
  game.gamePhase = 'PLAYING';
  return game;
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name); }
}

/* اختبار 1: بدون عزل ⇒ يُرفض (leftover=0، يجب عزل الورقة الـ15) */
(function testNoIsolate() {
  const g = buildGame();
  const p0 = g.players[0];
  const res = g._doFinish(p0); /* move غير ممرّر ⇒ effectiveIso=null */
  check('1) بدون عزل: يُرفض الإنهاء (leftover=0)', res.success === false);
  /* اليد لم تُمَس (الرفض المبكر) */
  check('1) اليد سليمة بعد الرفض', p0.hand.length === 7);
})();

/* اختبار 2: مع عزل 4♠ ⇒ إنهاء صحيح */
(function testWithIsolate() {
  const g = buildGame();
  const p0 = g.players[0];
  const res = g._doFinish(p0, { type: 'finish', playerId: p0.id, isolateCardId: 9004 });
  check('2) مع عزل 4♠: إنهاء ناجح', res.success === true && res.finished === true);
  /* الورقة المعزولة 4♠ صارت المرموق الأخير */
  const top = g.roundManager.discardPile[g.roundManager.discardPile.length - 1];
  check('2) الورقة المعزولة 4♠ هي آخر المرموق', top && top.id === 9004);
  /* يد الفائز فارغة بعد الإنهاء */
  check('2) يد الفائز فارغة', p0.hand.length === 0);
  /* المجموعات الـ6 في الطاولة (3 متتالية + 3 متماثلة) */
  check('2) مجموعات منزلة = 6 أوراق', p0.melds.reduce((s,m)=>s+m.cards.length,0) === 6);
  /* الجولة انتهت */
  check('2) الجولة انتهت (ROUND_END/MATCH_END)', g.gamePhase === 'ROUND_END' || g.gamePhase === 'MATCH_END');
})();

/* اختبار 3: عزل ورقة تُكسر المجموعة (id غير موجود كامل) ⇒ لا يزال يعمل إن بقي 6 كاملاً
   هنا نعزل 5♥ (يكسر المتماثلة) ⇒ المتبقي A♠2♠3♠4♠ + 5♦5♣ = متتالية4 + بقايا2 ⇒ leftover=2 ⇒ رفض */
(function testIsolateBreaksMeld() {
  const g = buildGame();
  const p0 = g.players[0];
  const res = g._doFinish(p0, { type: 'finish', playerId: p0.id, isolateCardId: 9005 });
  check('3) عزل ورقة تُكسر مجموعة ⇒ يُرفض (leftover=2)', res.success === false);
})();

console.log('\n' + (fail === 0 ? '✅✅✅ جميع اختبارات خانة العزل نجحت' : ('⚠️ فشل ' + fail + ' اختبار')));
process.exit(fail === 0 ? 0 : 1);
