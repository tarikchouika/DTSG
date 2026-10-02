/* ═══════════════════════════════════════════════════════════════════════════
   [v2.77] جناح محرك الرامي — ورقة المرموق مع عتبة المجموع الحر (71):
   قانون الطالاج (توجيه المالك): مجموعة تحوي المرموق المسحوب ليست «حرة»
   (لا تصلح متتالية/متماثلة الافتتاح) لكن نقاطها تُحتسب مع المجموع الحر.
   الخلل المُبلَّغ: الافتتاح بمجموعة المرموق كان يُحتسب «خطأ إظهار» يُؤكَّد
   جزاء +71 عند الرمي — جذراه: (1) التحديد الجزئي يحتكر الافتتاح الأول
   فترفض الخانات الأخرى (2) المحرك لا يجرّب تقسيم كامل اليد قبل رفضه.
   تشغيل:  node tests/_v277_rami_marmouq_test.js   (محرك خالص — بلا خادم)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('/home/z/my-project/dtsg/js/games/rami.js', 'utf8');
const ctx = {
  console, Date, Math, JSON, Set, Map, Array, Object, Number, String,
  setTimeout: (fn) => fn(), window: {},
  _ramiToast: () => {}, SND: {}
};
vm.createContext(ctx);
vm.runInContext(code + '\n;globalThis.__X = { RamiGame, RamiRules, MELD_TYPE, RamiMeld };', ctx);
const { RamiGame, RamiRules, MELD_TYPE, RamiMeld } = ctx.__X;

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

/* ═══ 1) validateOpening مباشرة ═══ */
console.log('── 1) validateOpening: مجموعة تحوي المرموق (بلا جوكر) ──');
{
  const rules = new RamiRules('talaj', 90);
  rules.jokerIndicator = C(4, 'spade');

  const seq = new RamiMeld(MELD_TYPE.SEQUENCE, [C(10, 'heart'), C(11, 'heart'), C(12, 'heart')]);
  const set = new RamiMeld(MELD_TYPE.SET, [C(13, 'spade'), C(13, 'heart'), C(13, 'diamond')]);
  const drawn = C(5, 'heart');
  const grp3 = new RamiMeld(MELD_TYPE.SET, [C(5, 'club'), C(5, 'diamond'), drawn]);

  const r = rules.validateOpening([seq, set, grp3], drawn, rules.jokerIndicator, 0, false);
  console.log('   النتيجة:', JSON.stringify({ valid: r.valid, score: r.score, freeScore: r.freeScore, error: r.error || null }));
  ok(r.valid === true, 'الافتتاح يُقبل: مجموعة المرموق تحتسب مع المجموع الحر (75 ≥ 71)');
  ok(r.freeScore === 75, 'freeScore = 75 (تشمل نقاط مجموعة المرموق)');

  const r2 = rules.validateOpening([seq, set], null, rules.jokerIndicator, 0, false);
  ok(r2.valid === false, 'بدونها 60 < 71 ⇒ رفض (سلوك متوقع)');
}

/* ═══ 2) المسار الكامل _doOpen ═══ */
console.log('── 2) المسار الكامل: draw_discard ثم open بمجموعة تحويها ──');
{
  const g = new RamiGame('talaj', 2, 1, 42, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;

  const p = g.players[rm.dealerIndex];            /* الموزع */
  const p2 = g.players.find(x => x.id !== p.id);  /* الخصم = فاتحنا (بلا قيود الموزع) */

  /* يد الخصم: 9 أوراق افتتاح (تنقصها 5♥ المرموق) + ورقة رمي + حشو حتى 14 */
  const plan2 = [
    C(10, 'heart'), C(11, 'heart'), C(12, 'heart'),   /* متتالية حرة 30 */
    C(13, 'spade'), C(13, 'heart'), C(13, 'diamond'), /* متماثلة حرة 30 */
    C(5, 'club'), C(5, 'diamond'),                    /* +المرموق 5♥ = 15 */
    C(2, 'spade'),                                    /* ورقة الرمي */
    C(9, 'club'), C(9, 'diamond'), C(8, 'club'), C(8, 'diamond') /* حشو */
  ];
  const marmouq = C(5, 'heart');
  p2.hand = plan2.slice();
  p2.displayCards = plan2.slice();

  /* 1) الموزع (15 ورقة) يرمي أي ورقة */
  const dis1 = g.executeMove({ type: 'discard', playerId: p.id, cardId: p.hand[p.hand.length - 1].id });
  ok(dis1.success === true, 'الموزع يرمي ورقة التخلص ' + (dis1.error || ''));

  /* 2) الخصم يسحب مجرفاً ويرمي ورقة حشو */
  const d2 = g.executeMove({ type: 'draw_deck', playerId: p2.id });
  ok(d2.success === true, 'الخصم يسحب من المجرف ' + (d2.error || ''));
  const dis2 = g.executeMove({ type: 'discard', playerId: p2.id, cardId: p2.hand.find(c => c.rank === 8).id });
  ok(dis2.success === true, 'الخصم يرمي ورقة حشو ' + (dis2.error || ''));

  /* 3) الموزع يسحب مجرفاً (يُسقط قيد دوره الأول) ويرمي 5♥ المرموق */
  const d1 = g.executeMove({ type: 'draw_deck', playerId: p.id });
  ok(d1.success === true, 'الموزع يسحب من المجرف ' + (d1.error || ''));
  p.hand[p.hand.length - 1] = marmouq;   /* آخر ما سحبه = المرموق ليرميها */
  const dis3 = g.executeMove({ type: 'discard', playerId: p.id, cardId: marmouq.id });
  ok(dis3.success === true, 'الموزع يرمي 5♥ (ستصبح المرموق) ' + (dis3.error || ''));

  /* 4) دور الخصم: سحب المرموق ثم الافتتاح بها */
  const dr = g.executeMove({ type: 'draw_discard', playerId: p2.id });
  console.log('   سحب المرموق:', dr.success, dr.error || '');
  ok(dr.success === true, 'سحب المرموق نجح');
  ok(p2.drawnDiscardCard && p2.drawnDiscardCard.id === marmouq.id, 'drawnDiscardCard موسومة');

  const openCards = p2.hand.filter(c =>
    (c.rank >= 10 && c.rank <= 12 && c.suit === 'heart') ||
    c.rank === 13 || c.rank === 5);
  console.log('   أوراق الافتتاح:', openCards.length, '(المتوقع 9)');
  const res = g.executeMove({ type: 'open', playerId: p2.id, cardIds: openCards.map(c => c.id) });
  console.log('   نتيجة الافتتاح:', JSON.stringify({ success: res.success, deferred: res.deferred, error: res.error || null }));
  if (!res.success) console.log('   الخطأ الكامل:', res.error);
  ok(res.success === true, '_doOpen يقبل الافتتاح ومجموعة المرموق مع المجموع الحر');
  ok(p2.hasOpened === true, 'اللاعب صار مفتوحاً');
}

console.log('\n════════ المرحلة 1-2: ' + pass + ' ✓ / ' + fail + ' ✗ ════════');

/* ═══ 3) سيناريو التحديد الجزئي: المستخدم حدد مجموعة المرموق فقط ثم نقر الافتتاح ═══ */
console.log('── 3) التحديد الجزئي (selectedCards = مجموعة المرموق وحدها) ──');
{
  const g = new RamiGame('talaj', 2, 1, 42, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  const p = g.players[rm.dealerIndex];
  const p2 = g.players.find(x => x.id !== p.id);

  const plan2 = [
    C(10, 'heart'), C(11, 'heart'), C(12, 'heart'),
    C(13, 'spade'), C(13, 'heart'), C(13, 'diamond'),
    C(5, 'club'), C(5, 'diamond'),
    C(2, 'spade'),
    C(9, 'club'), C(9, 'diamond'), C(8, 'club'), C(8, 'diamond')
  ];
  const marmouq = C(5, 'heart');
  p2.hand = plan2.slice();
  p2.displayCards = plan2.slice();

  g.executeMove({ type: 'discard', playerId: p.id, cardId: p.hand[p.hand.length - 1].id });
  g.executeMove({ type: 'draw_deck', playerId: p2.id });
  g.executeMove({ type: 'discard', playerId: p2.id, cardId: p2.hand.find(c => c.rank === 8).id });
  g.executeMove({ type: 'draw_deck', playerId: p.id });
  p.hand[p.hand.length - 1] = marmouq;
  g.executeMove({ type: 'discard', playerId: p.id, cardId: marmouq.id });
  g.executeMove({ type: 'draw_discard', playerId: p2.id });

  /* المستخدم حدد أوراق المجموعة الثالثة فقط (5♣ 5♦ 5♥) — راميOpenMelds:
     selectedCards.size >= 3 ⇒ cardIds = الثلاثة فقط! */
  const partial = p2.hand.filter(c => c.rank === 5).map(c => c.id);
  console.log('   أوراق محددة:', partial.length);
  /* [v2.77·الإصلاح] التحديد الجزئي لم يعد يحتكر الافتتاح الأول: المحرك
     يجرب تقسيم كامل اليد (بما فيه مجموعة المرموق) فينجح الافتتاح —
     لا «خطأ إظهار» ولا جزاء +71 ظلم */
  const res = g.executeMove({ type: 'open', playerId: p2.id, cardIds: partial });
  console.log('   نتيجة الافتتاح الجزئي (بعد الإصلاح):', JSON.stringify({ success: res.success, deferred: res.deferred, error: (res.error || '').slice(0, 80) }));
  ok(res.success === true, 'الافتتاح بمجموعة المرموق (تحديد جزئي) ينجح عبر احتياط تقسيم اليد');
  ok(p2.hasOpened === true, 'اللاعب صار مفتوحاً — مجموعة المرموق احتُسبت مع المجموع الحر (75 ≥ 71)');
  if (res.success) {
    /* رمي ورقة التخلولط بلا أي جزاء */
    const dis = g.executeMove({ type: 'discard', playerId: p2.id, cardId: p2.hand[0].id });
    console.log('   نتيجة الرمي:', JSON.stringify({ success: dis.success, penaltyApplied: dis.penaltyApplied || false }));
    ok(dis.success === true && !dis.penaltyApplied, 'رمي ورقة التخلص يمر بلا جزاء (كان +71 ظلماً)');
  }
}
console.log('\n════════ الإجمالي: ' + pass + ' ✓ / ' + fail + ' ✗ ════════'); process.exit(fail ? 1 : 0);
