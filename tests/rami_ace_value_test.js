/* ═══ [v18] اختبار قيمة الآس السياقية في الرامي ═══
   A = 10 : في المتماثلة (A-A-A) وفي نهاية المتتالية (Q-K-A / J-Q-K-A / 10-J-Q-K-A)
   A = 1  : في بداية المتتالية (A-2-3 / A-2-3-4 / A-2-3-4-5 ...)
   يشمل: cardPointsInMeld / meldPoints / validateOpening (سامبل وطلاج) /
   المجموع الحر للخبير _freeScore / تقسيم الافتتاح partitionSelectedCards */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'rami.js'), 'utf8');
const ctx = { console, Date, Math, JSON, Set, Map, Array, Object, Number, String, setTimeout: (fn) => fn(), window: {} };
vm.createContext(ctx);
vm.runInContext(code + '\n;globalThis.__X = { RamiRules, RamiCard: (typeof RamiCard!=="undefined"?RamiCard:null), RamiMeld, MELD_TYPE, RamiExpertAI, partitionSelectedCards };', ctx);
const { RamiRules, RamiCard, RamiMeld, MELD_TYPE, RamiExpertAI, partitionSelectedCards } = ctx.__X;

let pass = 0, fail = 0, id = 1000;
function ok(cond, msg) {
  if (cond) { pass++; console.log(' ✓ ' + msg); }
  else { fail++; console.log(' ✗ ' + msg); }
}
function C(rank, suit) { return new RamiCard(id++, rank, suit || 'heart'); }
function seq(cards) { return new RamiMeld(MELD_TYPE.SEQUENCE, cards); }
function set(cards) { return new RamiMeld(MELD_TYPE.SET, cards); }

const rules = new RamiRules('simple');

/* ═══ 1) قيمة الآس داخل المجموعات ═══ */
console.log('── قيمة الآس السياقية ──');
{
  // A-2-3 → الآس = 1
  const m = seq([C(1), C(2), C(3)]);
  ok(rules.cardPointsInMeld(m.cards[0], m) === 1, 'A في A-2-3 = 1');
  ok(rules.meldPoints(m) === 6, 'مجموع A-2-3 = 6 (وليس 15)');
}
{
  // A-2-3-4-5 → الآس = 1
  const m = seq([C(1), C(2), C(3), C(4), C(5)]);
  ok(rules.meldPoints(m) === 15, 'مجموع A-2-3-4-5 = 15 (وليس 24)');
}
{
  // Q-K-A → الآس = 10
  const m = seq([C(12), C(13), C(1)]);
  ok(rules.cardPointsInMeld(m.cards[2], m) === 10, 'A في Q-K-A = 10');
  ok(rules.meldPoints(m) === 30, 'مجموع Q-K-A = 30');
}
{
  // J-Q-K-A → الآس = 10
  const m = seq([C(11), C(12), C(13), C(1)]);
  ok(rules.meldPoints(m) === 40, 'مجموع J-Q-K-A = 40');
}
{
  // 10-J-Q-K-A → الآس = 10
  const m = seq([C(10), C(11), C(12), C(13), C(1)]);
  ok(rules.meldPoints(m) === 50, 'مجموع 10-J-Q-K-A = 50');
}
{
  // المتماثلة A-A-A → كل آس = 10
  const m = set([C(1, 'heart'), C(1, 'diamond'), C(1, 'sword')]);
  ok(rules.meldPoints(m) === 30, 'مجموع متماثلة A-A-A = 30');
}

/* ═══ 2) validateOpening — سامبل (عتبة 51) ═══ */
console.log('── الافتتاح في السامبل (عتبة 51) ──');
{
  /* A-2-3 قلب (6) + 10-J-Q سيف (30) = 36 < 51 → يجب الرفض
     (بالمنطق القديم الخاطئ: 15+30=45 < 51 كان يُرفض أيضاً — نجرّب حالة الانقلاب) */
  const melds = [seq([C(1), C(2), C(3)]), seq([C(10, 'sword'), C(11, 'sword'), C(12, 'sword')])];
  const r = rules.validateOpening(melds, null, null, 0, false);
  ok(!r.valid && r.freeScore === undefined || !r.valid, 'A23 + 10JQ = 36 → مرفوض (< 51)');
}
{
  /* الحالة الحرجة: A-2-3 (6) + 9-10-J-Q (38) = 44 < 51 → رفض
     بالمنطق القديم: 15 + 38 = 53 ≥ 51 → كان يقبل خطأً! */
  const melds = [seq([C(1), C(2), C(3)]), seq([C(9, 'sword'), C(10, 'sword'), C(11, 'sword'), C(12, 'sword')])];
  const r = rules.validateOpening(melds, null, null, 0, false);
  ok(!r.valid, 'الحالة المنقلبة: A23(6) + 9-10-J-Q(38) = 44 → مرفوض (القديم كان يقبل 53)');
}
{
  /* [V19] سامبل: متتاليتان بلا متماثلة حرة → مرفوض هيكلياً حتى لو المجموع ≥ 51 */
  const meldsNoSet = [seq([C(12), C(13), C(1)]), seq([C(8, 'sword'), C(9, 'sword'), C(10, 'sword')])];
  const rNoSet = rules.validateOpening(meldsNoSet, null, null, 0, false);
  ok(!rNoSet.valid, '[V19] QKA + 8-9-10 بلا متماثلة حرة → مرفوض هيكلياً');
  /* Q-K-A (30) + متماثلة 9 (27) = 57 ≥ 51 → قبول، الآس هنا 10 صحيحة */
  const melds = [seq([C(12), C(13), C(1)]), set([C(9, 'heart'), C(9, 'diamond'), C(9, 'sword')])];
  const r = rules.validateOpening(melds, null, null, 0, false);
  ok(r.valid && r.freeScore === 57, 'QKA(30) + 999(27) = 57 → مقبول');
}
{
  /* متماثلة آسات (30) + متتالية نقية A-2-3 (6) = 36 → رفض */
  const melds = [set([C(1, 'heart'), C(1, 'diamond'), C(1, 'sword')]), seq([C(1, 'grape'), C(2, 'grape'), C(3, 'grape')])];
  const r = rules.validateOpening(melds, null, null, 0, false);
  ok(!r.valid, 'AAA(30) + A23(6) = 36 → مرفوض (القديم: 45)');
}

/* ═══ 3) validateOpening — طلاج (عتبة 71) ═══ */
console.log('── الافتتاح في الطلاج (عتبة 71) ──');
const rulesT = new RamiRules('talaj');
{
  /* متماثلة K-K-K (30) + متتالية A-2-3-4 (10) = 40 < 71 → رفض
     القديم: 30 + 19 = 49 < 71 رفض أيضاً؛ حالة الانقلاب: */
  const melds = [set([C(13, 'heart'), C(13, 'diamond'), C(13, 'sword')]), seq([C(1), C(2), C(3), C(4)])];
  const r = rulesT.validateOpening(melds, null, null, 0, false);
  ok(!r.valid, 'طلاج: KKK(30) + A234(10) = 40 → مرفوض');
}
{
  /* KKK (30) + A-2-3-4-5-6-7-8 (36) = 66 < 71 → رفض. القديم: 30+45=75 كان يقبل خطأً */
  const melds = [
    set([C(13, 'heart'), C(13, 'diamond'), C(13, 'sword')]),
    seq([C(1), C(2), C(3), C(4), C(5), C(6), C(7), C(8)])
  ];
  const r = rulesT.validateOpening(melds, null, null, 0, false);
  ok(!r.valid, 'طلاج منقلبة: KKK(30) + A..8(36) = 66 → مرفوض (القديم كان يقبل 75)');
}
{
  /* KKK (30) + Q-K-A (30) + 4-5-6 (15) = 75 ≥ 71 → قبول */
  const melds = [
    set([C(13, 'heart'), C(13, 'diamond'), C(13, 'sword')]),
    seq([C(12, 'grape'), C(13, 'grape'), C(1, 'grape')]),
    seq([C(4, 'sword'), C(5, 'sword'), C(6, 'sword')])
  ];
  const r = rulesT.validateOpening(melds, null, null, 0, false);
  ok(r.valid && r.freeScore === 75, 'طلاج: KKK + QKA + 456 = 75 → مقبول');
}

/* ═══ 4) الخبير — _freeScore متطابقة مع المدقق ═══ */
console.log('── تطابق تقييم الخبير مع المدقق ──');
{
  const melds = [seq([C(1), C(2), C(3)]), seq([C(12, 'sword'), C(13, 'sword'), C(1, 'sword')])];
  const f = RamiExpertAI._freeScore(melds, rules);
  ok(f === 36, 'الخبير _freeScore: A23(6) + QKA(30) = 36 (وليس 45)');
}
{
  /* الخبير لا يفتتح أبداً بمجموع دون العتبة: أي تقسيم يقترحه يجب أن يجتاز validateOpening */
  const hand = [
    C(1, 'heart'), C(2, 'heart'), C(3, 'heart'),
    C(9, 'sword'), C(10, 'sword'), C(11, 'sword'), C(12, 'sword'),
    C(5, 'grape'), C(8, 'diamond'), C(13, 'diamond'), C(6, 'grape'), C(2, 'sword'), C(7, 'heart')
  ];
  const melds = partitionSelectedCards(hand, rules, 'opening');
  const f = RamiExpertAI._freeScore(melds, rules);
  const chk = rules.validateOpening(melds, null, null, 0, false);
  ok(f < 51 && !chk.valid, 'يد الانقلاب: التقسيم الأمثل = ' + f + ' نقطة → الخبير يمتنع عن الافتتاح');
}

/* ═══ 5) الأرقام العادية بلا تغيير ═══ */
console.log('── الأوراق غير الآس بلا تغيير ──');
{
  const m = seq([C(8, 'sword'), C(9, 'sword'), C(10, 'sword')]);
  ok(rules.meldPoints(m) === 27, '8-9-10 = 27');
  const m2 = set([C(11, 'heart'), C(11, 'diamond'), C(11, 'sword')]);
  ok(rules.meldPoints(m2) === 30, 'J-J-J = 30');
  const m3 = seq([C(11, 'grape'), C(12, 'grape'), C(13, 'grape')]);
  ok(rules.meldPoints(m3) === 30, 'J-Q-K = 30');
}

console.log('\n═══ Rami Ace Value: ' + pass + '/' + (pass + fail) + ' passed ═══');
process.exit(fail ? 1 : 0);
