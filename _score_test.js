/* اختبار إصلاح احتساب نقاط الشوط:
   - نقاط الأوراق (lastRoundPoints) منفصلة عن الجزاءات (lastPenalty).
   - سجل الشوط يسجّل pts = نقاط الأوراق فقط (وليس المجموع المختلط).
   - حراسة عدم احتساب الشوط مرتين.
   - تضاعف الشوط يضاعف نقاط الأوراق فقط لا الجزاءات. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/js/games/rami.js', 'utf8');
const engine = src.split('class RamiUIAdapter')[0];

const fn = new Function('window', 'document', 'console', engine +
  '\n;return {RamiGame, RamiRules, RamiCard};');
const { RamiGame, RamiCard } = fn(undefined, undefined, console);

function buildGame() {
  const game = new RamiGame('talaj', 2, 1, 12345, 90);
  game.startMatch(701);
  const p0 = game.players[0];
  const p1 = game.players[1];
  /* الفائز فتح ولم يتبقَّ له أوراق */
  p0.hasOpened = true;
  p0.hand = [];
  /* الخاسر لم يفتتح إطلاقاً (يد كاملة) */
  p1.hasOpened = false;
  p1.hand = [
    new RamiCard(9001, 1, 'sword'),
    new RamiCard(9002, 2, 'sword'),
    new RamiCard(9003, 3, 'sword'),
  ];
  /* جزاءات مسجّلة خلال الشوط على الفائز فقط */
  p0.penaltyScore = 30;
  p0.penaltyReasons = [{ label: 'تأخّر' }];
  p1.penaltyScore = 0;
  game.gamePhase = 'PLAYING';
  game.roundManager.turnPhase = 'WAITING_DISCARD';
  return game;
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

console.log('\n[1] احتساب عادي: فائز 0 أوراق + جزاء 30 ، خاسر غير مفتوح');
{
  const g = buildGame();
  const p0 = g.players[0], p1 = g.players[1];
  g._endRound(p0);
  ok(g.roundManager.roundHistory.length === 1, 'سُجِّل شوط واحد فقط');
  ok(p0.lastRoundPoints === 0, 'الفائز نقاط الأوراق = 0');
  ok(p0.lastPenalty === 30, 'الفائز الجزاءات = 30 (منفصلة)');
  ok(p0.lastRoundTotal === 30, 'الفائز مجموع الشوط = 0+30 = 30');
  ok(p1.lastRoundPoints === g.rules.fullHandPenalty, 'الخاسر غير المفتوح = عقوبة اليد الكاملة (' + g.rules.fullHandPenalty + ')');
  ok(p1.lastPenalty === 0, 'الخاسر بلا جزاء');
  ok(p1.lastRoundTotal === g.rules.fullHandPenalty, 'الخاسر المجموع = عقوبة اليد فقط');

  /* السجل: pts = نقاط الأوراق فقط (ليس المجموع المختلط) */
  const rec = g.roundManager.roundHistory[0];
  const s0 = rec.playerScores.find(s => s.name === p0.name);
  const s1 = rec.playerScores.find(s => s.name === p1.name);
  ok(s0.pts === 0 && s0.pen === 30, 'سجل الفائز: pts=0 (أوراق) ، pen=30 (منفصل) — لا تضاعف/خلط');
  ok(s1.pts === g.rules.fullHandPenalty && s1.pen === 0, 'سجل الخاسر: pts=' + g.rules.fullHandPenalty + ' (أوراق) ، pen=0');

  /* حراسة الاستدعاء المزدوج */
  const before = g.roundManager.roundHistory.length;
  g._endRound(p0);
  ok(g.roundManager.roundHistory.length === before, 'حراسة: الاستدعاء الثاني لا يضيف سجلاً');
}

console.log('\n[2] تضاعف الشوط: يضاعف نقاط الأوراق فقط لا الجزاءات');
{
  const g = buildGame();
  const p0 = g.players[0], p1 = g.players[1];
  p0.penaltyScore = 40;
  g.roundManager.jokerDouble = true;
  g._endRound(p0);
  ok(p0.lastRoundPoints === 0, 'الفائز لا يتأثر بالتضاعف = 0');
  ok(p0.lastPenalty === 40, 'جزاء الفائز لا يُضاعَف = 40');
  ok(p0.lastRoundTotal === 40, 'الفائز المجموع = 0+40 = 40');
  ok(p1.lastRoundPoints === g.rules.fullHandPenalty * 2, 'الخاسر تُضاعَف عقوبة اليد = ' + (g.rules.fullHandPenalty * 2));
  ok(p1.lastPenalty === 0, 'الخاسر بلا جزاء أصلاً');
  ok(p1.lastRoundTotal === g.rules.fullHandPenalty * 2, 'الخاسر المجموع = العقوبة المضاعفة فقط');

  const s1 = g.roundManager.roundHistory[0].playerScores.find(s => s.name === p1.name);
  ok(s1.pts === g.rules.fullHandPenalty * 2 && s1.pen === 0, 'سجل الخاسر المضاعف: pts=' + (g.rules.fullHandPenalty * 2) + ' ، pen=0');
}

console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
process.exit(fail ? 1 : 0);
