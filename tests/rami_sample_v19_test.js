/* ═══ اختبار قوانين رامي سامبل v19 ═══
   - اللاعب التالي للموزع يبدأ
   - الفوجوك: قلب أول ورقة، سحب في الدورة الأولى فقط، خلط عند نفاد التوزيع
   - المرموق: سحب حر بلا جزاء، غير حر في نفس الدور، حر في الأدوار الموالية
   - الافتتاح: متتالية حرة + متماثلة حرة + مجموع حر ≥ 51
   - الإنهاء: متتالية حرة + متماثلة حرة + 13 ورقة بمجموعات + ورقة إنهاء 14
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'rami.js'), 'utf8');
const ctx = {
  console, Date, Math, JSON, Set, Map, Array, Object, Number, String,
  setTimeout: (fn) => fn(), window: {},
  _ramiToast: () => {}, SND: {}
};
vm.createContext(ctx);
vm.runInContext(code + '\n;globalThis.__X = { RamiGame, RamiRules, RamiCard: (typeof RamiCard!=="undefined"?RamiCard:null), MELD_TYPE, verifyRamiDeckIntegrity, ramiDeckAccounting, RamiExpertAI, RamiMeld, cardFitsMeld: (typeof cardFitsMeld!=="undefined"?cardFitsMeld:null) };', ctx);
const { RamiGame, RamiRules, MELD_TYPE, verifyRamiDeckIntegrity, ramiDeckAccounting, RamiExpertAI, RamiMeld, cardFitsMeld } = ctx.__X;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name); }
}

/* ── مساعد: ورقة اصطناعية ── */
let _cid = 9000;
function C(rank, suit) {
  suit = suit || 'heart';
  const baseValue = rank === 1 ? 10 : (rank > 10 ? 10 : rank);
  return { id: 'T' + (_cid++), rank, suit, baseValue, isJoker: false,
    displayName: rank + suit };
}

console.log('── 1) البادئ والبنية الأساسية ──');
{
  const g = new RamiGame('simple', 3, 2, 42, 90);
  g.startMatch(3, 2);
  const rm = g.roundManager;
  ok(rm.currentPlayerIndex === (rm.dealerIndex + 1) % 3, 'اللاعب التالي للموزع صاحب أول دور');
  ok(g.players.every(p => p.hand.length === 13), 'كل لاعب 13 ورقة (الموزع أيضاً)');
  ok(!!rm.jokerIndicator, 'الفوجوك مقلوبة بعد التوزيع');
  ok(rm.discardPile.length === 0, 'لا ورقة مرموق أولى في السامبل — المرموق يبدأ فارغاً');
  ok(g.rules.jokerIndicator && g.rules.jokerIndicator.rank === rm.jokerIndicator.rank, 'تعريف الجوكر (رتبة/لون معاكس) محفوظ مستقلاً');
}

console.log('── 2) الفوجوك: الدور الأول فقط ثم الخلط ──');
{
  const g = new RamiGame('simple', 2, 1, 7, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  const p1 = rm.getCurrentPlayer();
  const moves1 = g.getLegalMoves(p1.id).map(m => m.type);
  ok(moves1.indexOf('draw_fojok') !== -1, 'سحب الفوجوك متاح في الدور الأول');
  /* اللاعب الأول يسحب من المجرف ويرمي — الفوجوك تبقى */
  g.executeMove({ type: 'draw_deck', playerId: p1.id });
  g.executeMove({ type: 'discard', playerId: p1.id, cardId: p1.hand[0].id });
  const p2 = rm.getCurrentPlayer();
  const r2 = g.executeMove({ type: 'draw_fojok', playerId: p2.id });
  ok(r2.success && rm.jokerIndicator === null, 'اللاعب الثاني سحب الفوجوك في دوره الأول');
  ok(p2.hand.some(c => c.id === r2.card.id), 'الفوجوك في يد الساحب');
  ok(g.rules.jokerIndicator !== null, 'تعريف الجوكر باقٍ بعد سحب الفوجوك');
  const rDup = g.executeMove({ type: 'draw_fojok', playerId: p2.id });
  ok(!rDup.success, 'لا سحب فوجوك ثانٍ');
}
{
  /* عدم السحب في الدورة الأولى → يحرم الجميع + تُخلط عند نفاد التوزيع */
  const g = new RamiGame('simple', 2, 1, 11, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  const fojokId = rm.jokerIndicator.id;
  /* دورة كاملة بلا سحب الفوجوك */
  for (let t = 0; t < 2; t++) {
    const p = rm.getCurrentPlayer();
    g.executeMove({ type: 'draw_deck', playerId: p.id });
    g.executeMove({ type: 'discard', playerId: p.id, cardId: p.hand[0].id });
  }
  ok(!rm.isFirstTourCycle, 'انتهت الدورة الأولى');
  const p = rm.getCurrentPlayer();
  const rLate = g.executeMove({ type: 'draw_fojok', playerId: p.id });
  ok(!rLate.success, 'سحب الفوجوك بعد الدورة الأولى مرفوض');
  ok(g.getLegalMoves(p.id).every(m => m.type !== 'draw_fojok'), 'draw_fojok ليست ضمن الحركات القانونية بعد الدورة الأولى');
  /* نفاد ورق التوزيع → الفوجوك تُخلط مع المرموق */
  rm.drawPile = [];
  const rDraw = g.executeMove({ type: 'draw_deck', playerId: p.id });
  const fojokBack = rm.drawPile.some(c => c.id === fojokId) || p.hand.some(c => c.id === fojokId);
  ok(rDraw.success && fojokBack && rm.jokerIndicator === null, 'الفوجوك خُلطت مع المرموق عند نفاد ورق التوزيع');
  ok(g.rules.jokerIndicator !== null, 'تعريف الجوكر باقٍ بعد الخلط');
  ok(verifyRamiDeckIntegrity(g).ok, 'سلامة الرزمة بعد الخلط');
}

console.log('── 3) المرموق: سحب حر بلا جزاء + «ورقة أخرى» ──');
{
  const g = new RamiGame('simple', 2, 1, 21, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  const p1 = rm.getCurrentPlayer();
  g.executeMove({ type: 'draw_deck', playerId: p1.id });
  g.executeMove({ type: 'discard', playerId: p1.id, cardId: p1.hand[0].id });
  const p2 = rm.getCurrentPlayer();
  const moves = g.getLegalMoves(p2.id).map(m => m.type);
  ok(moves.indexOf('draw_discard') !== -1, 'سحب المرموق متاح بلا شروط');
  const rr = g.executeMove({ type: 'draw_discard', playerId: p2.id });
  ok(rr.success, 'سحب المرموق نجح');
  const marmId = rr.card.id;
  /* [V19.2] إرجاع نفس ورقة المرموق فوراً: مسموح لكن بجزاء +51 */
  const other = p2.hand.find(c => c.id !== marmId);
  const rOther = g.executeMove({ type: 'discard', playerId: p2.id, cardId: other.id });
  ok(rOther.success && !rOther.penaltyApplied && (p2.penaltyScore || 0) === 0, 'الاحتفاظ بالمرموق بلا افتتاح/إنهاء = بلا جزاء');
  const kept = p2.hand.find(c => c.id === marmId);
  ok(kept && !kept.fromDiscard && !kept.fromLaTour, 'المرموق يصبح حراً بعد نهاية الدور');
}

console.log('── 4) الافتتاح: متتالية حرة + متماثلة حرة + ≥51 ──');
{
  const rules = new RamiRules('simple', 90);
  const seq = (cards) => ({ type: MELD_TYPE.SEQUENCE, cards });
  const set = (cards) => ({ type: MELD_TYPE.SET, cards });
  /* متتالية فقط ≥51 → مرفوض */
  let r = rules.validateOpening([seq([C(10,'sword'), C(11,'sword'), C(12,'sword')]), seq([C(10,'heart'), C(11,'heart'), C(12,'heart')])], null, null, 0, false);
  ok(!r.valid, 'متتاليتان بلا متماثلة حرة → مرفوض');
  /* متتالية + متماثلة = 57 ≥ 51 → مقبول */
  r = rules.validateOpening([seq([C(10,'sword'), C(11,'sword'), C(12,'sword')]), set([C(9,'heart'), C(9,'diamond'), C(9,'sword')])], null, null, 0, false);
  ok(r.valid && r.freeScore === 57, 'متتالية(30) + متماثلة(27) = 57 → مقبول');
  /* أقل من 51 → مرفوض */
  r = rules.validateOpening([seq([C(2,'sword'), C(3,'sword'), C(4,'sword')]), set([C(5,'heart'), C(5,'diamond'), C(5,'sword')])], null, null, 0, false);
  ok(!r.valid, 'مجموع حر 24 < 51 → مرفوض');
  /* [v19.3] السامبل: مجموعة تحوي ورقة المرموق المسحوبة (غير جوكر) تدخل العتبة قانونياً */
  const marm = C(10, 'grape');
  r = rules.validateOpening([seq([C(10,'sword'), C(11,'sword'), C(12,'sword')]), set([C(9,'heart'), C(9,'diamond'), C(9,'sword')]), set([marm, C(10,'heart'), C(10,'diamond')])], marm, null, 0, false);
  ok(r.valid && r.freeScore === 87 && r.score === 87, 'سامبل: مجموعة مرموق الدور تدخل العتبة (87)');
  /* المتماثلة الوحيدة تحوي المرموق المسحوب → غير حرة → مرفوض */
  const marm2 = C(9, 'heart');
  r = rules.validateOpening([seq([C(10,'sword'), C(11,'sword'), C(12,'sword')]), set([marm2, C(9,'diamond'), C(9,'sword')])], marm2, null, 0, false);
  ok(!r.valid, 'المتماثلة الوحيدة بورقة المرموق (غير حرة هذا الدور) → مرفوض');
}

console.log('── 5) الإنهاء: 13 بمجموعات + ورقة الإنهاء الـ14 ──');
{
  const g = new RamiGame('simple', 2, 1, 33, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  /* تحييد الجوكر كي لا يتداخل مع اليد الاصطناعية */
  rm.jokerIndicator = null;
  g.rules.jokerIndicator = null;
  const p = rm.getCurrentPlayer();
  /* يد اصطناعية: 13 ورقة = 4 مجموعات (3+3+3+4) + سحب ورقة 14 للرمي */
  p.hand = [
    C(3,'sword'), C(4,'sword'), C(5,'sword'),            /* متتالية حرة */
    C(9,'heart'), C(9,'diamond'), C(9,'sword'),           /* متماثلة حرة */
    C(10,'heart'), C(11,'heart'), C(12,'heart'),          /* متتالية */
    C(2,'grape'), C(2,'heart'), C(2,'diamond'), C(2,'sword') /* متماثلة رباعية */
  ];
  p.displayCards = p.hand.slice();
  /* سحب من المجرف = الورقة الـ14 */
  const rd = g.executeMove({ type: 'draw_deck', playerId: p.id });
  ok(rd.success && p.hand.length === 14, 'سحب ورقة الإنهاء الـ14');
  ok(g.canFinish(p), 'canFinish: 13 بمجموعات صالحة + ورقة معزولة');
  const moves = g.getLegalMoves(p.id).map(m => m.type);
  ok(moves.indexOf('finish') !== -1, 'finish ضمن الحركات القانونية من اليد الكاملة (سامبل)');
  const rf = g.executeMove({ type: 'finish', playerId: p.id });
  ok(rf.success && rf.finished, 'الإنهاء نجح');
  ok(g.gamePhase === 'ROUND_END' || g.gamePhase === 'MATCH_END', 'الشوط انتهى');
}
{
  /* بلا متماثلة حرة → لا إنهاء */
  const g = new RamiGame('simple', 2, 1, 34, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  rm.jokerIndicator = null;
  g.rules.jokerIndicator = null;
  const p = rm.getCurrentPlayer();
  p.hand = [
    C(3,'sword'), C(4,'sword'), C(5,'sword'),
    C(6,'heart'), C(7,'heart'), C(8,'heart'),
    C(10,'heart'), C(11,'heart'), C(12,'heart'),
    C(2,'grape'), C(3,'grape'), C(4,'grape'), C(5,'grape')
  ];
  p.displayCards = p.hand.slice();
  g.executeMove({ type: 'draw_deck', playerId: p.id });
  ok(!g.canFinish(p), 'بلا متماثلة حرة → canFinish=false');
}

console.log('── 8) [v19.2] الحرة تبقى حرة في دور الافتتاح فقط ──');
{
  /* افتتاح بمجموعتي جوكر بلا متتالية حرة (سيناريو السكرين شوت) يجب رفضه */
  const rules = new RamiRules('simple', 90);
  rules.jokerIndicator = { id: 'IND', rank: 6, suit: 'sword', isJoker: false }; /* المؤشر 6 أسود → الجوكر 6 أحمر */
  ok(rules.isWildCard(C(6, 'heart')), 'الـ 6 الأحمر ورقة برية (جوكر الجولة)');
  const m1 = { type: MELD_TYPE.SEQUENCE, cards: [C(6, 'heart'), C(7, 'heart'), C(8, 'heart'), C(9, 'heart')] };
  const m2 = { type: MELD_TYPE.SEQUENCE, cards: [C(6, 'diamond'), C(7, 'grape'), C(8, 'grape')] };
  const m3 = { type: MELD_TYPE.SET, cards: [C(12, 'diamond'), C(12, 'grape'), C(12, 'sword')] };
  const r = rules.validateOpening([m1, m2, m3], null, null, 0, false);
  ok(!r.valid, 'افتتاح بمتتاليتين بجوكر + متماثلة حرة فقط → مرفوض (لا متتالية حرة)');
}
{
  /* الإدراج [v19.2 + SAMPEL-WILD 2026-09-12 — التوجيه النهائي للمالك]:
     «البرية ممنوعة في المتتالية الحرة فقط»: حين تُدرج البرية في متتالية فهي
     تعمل جوكراً ولو في محل رقمها — فتصبح المتتالية غير حرة (وليست ممنوعة).
     متتالية ببرية مسموحة عند الإدراج في جميع الأدوار (افتتاح/بعده/إنهاء)
     بشرط: جوكر واحد على الأكثر بأي نوع — فبريتان معاً أو برية+مطبوع مرفوض
     (جذر حالة المستخدم J♣-Q♣-Q♣). حماية الحرة الزمنية (v19.2) تبقى:
     الجوكر/البرية وورقة المرموق المسحوبة لا تُدرجان في مجموعة حرة أُنزلت
     هذا الدور فقط — وفي الأدوار الموالية يجوز إدراج الجوكر فيها. */
  const g = new RamiGame('simple', 2, 1, 77, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  rm.jokerIndicator = { id: 'IND2', rank: 6, suit: 'sword', isJoker: false };
  g.rules.jokerIndicator = rm.jokerIndicator;
  const joker = C(6, 'heart');            /* برية: 6 أحمر عند مؤشر 6 أسود */
  const freeMeld = { type: MELD_TYPE.SEQUENCE, cards: [C(9, 'sword'), C(10, 'sword'), C(11, 'sword')], _justOpened: true };
  const wildMeld = { type: MELD_TYPE.SEQUENCE, cards: [C(9, 'grape'), C(10, 'grape'), C(6, 'heart')], _justOpened: true }; /* فيها برية تسد 11 */
  rm.tableMelds = [freeMeld];
  ok(!RamiExpertAI.canLayOff(g.rules, freeMeld, joker), 'canLayOff: جوكر في متتالية حرة أُنزلت هذا الدور → مرفوض');
  ok(cardFitsMeld ? !cardFitsMeld(joker, freeMeld, g.rules) : true, 'cardFitsMeld: جوكر في متتالية حرة أُنزلت هذا الدور → مرفوض');
  ok(!g.doesCardFitAnyTableMeld(joker), 'doesCardFitAnyTableMeld: حرة نفس الدور → false للجوكر');
  /* ورقة المرموق المسحوبة نفس الدور محظورة كذلك في الحرة نفس الدور */
  const drawn = C(12, 'sword'); drawn.fromDiscard = true;
  ok(!RamiExpertAI.canLayOff(g.rules, freeMeld, drawn, drawn), 'canLayOff: مرموق نفس الدور في حرة نفس الدور → مرفوض');
  rm.tableMelds = [freeMeld, wildMeld];
  /* ورقة عادية تكمّل فجوة متتالية ببرية (تسد 8) — مسموحة */
  ok(RamiExpertAI.canLayOff(g.rules, wildMeld, C(8, 'grape')), 'canLayOff: ورقة عادية في متتالية ببرية → مقبول');
  ok(RamiExpertAI.canLayOff(g.rules, freeMeld, C(12, 'sword')), 'canLayOff: ورقة عادية في متتالية حرة → مقبول');
  /* بانتهاء الدور تسقط الحماية الزمنية: nextPlayer يمسح _justOpened
     ويصبح الجوكر مقبولاً في الحرة (تصير غير حرة — وهذا جائز) */
  rm.nextPlayer();
  ok(!freeMeld._justOpened, 'nextPlayer يمسح وسم _justOpened');
  ok(RamiExpertAI.canLayOff(g.rules, freeMeld, joker), 'canLayOff: جوكر في متتالية حرة في دور موالٍ → مقبول');
  ok(g.doesCardFitAnyTableMeld(joker), 'doesCardFitAnyTableMeld: دور موالٍ → true للجوكر');
  ok(cardFitsMeld ? cardFitsMeld(joker, freeMeld, g.rules) : true, 'cardFitsMeld: جوكر في حرة دور موالٍ → مقبول');
}

console.log('── 8ح) [SAMPEL-WILD] البرية داخل المتتالية جوكرٌ فقط — التوجيه النهائي ──');
{
  /* [SAMPEL-WILD 2026-09-12] القاعدة الحاكمة بعد توضيح المالك:
     البرية المدرجة في متتالية تعمل جوكراً ولو في محل رقمها → المتتالية
     غير حرة لكنها ليست ممنوعة. الممنوع: بريتان معاً، أو برية+جوكر مطبوع
     (جوكر واحد بأي نوع)، أو ورقة تعمل برقمها وجوكراً معاً (J♣-Q♣-Q♣). */
  const rules = new RamiRules('simple', 90);
  rules.jokerIndicator = { id: 'INDW', rank: 12, suit: 'heart', isJoker: false }; /* المؤشر Q♥ → البريتان Q♣ وQ♠ */

  /* (أ) حالة المستخدم الأصلية: J♣-Q♣(برية)-Q♣(برية) — بريتان في متتالية = رفض */
  const jC = C(11, 'club'), qC1 = C(12, 'club'), qC2 = C(12, 'club');
  ok(!rules.isValidSequence([jC, qC1, qC2], true), 'J♣-Q♣-Q♣ (بريتان) → مرفوض (جوكران في متتالية)');
  ok(!rules.isValidMeld([jC, qC1, qC2], true), 'J♣-Q♣-Q♣ كمجموعة عامة → مرفوض');

  /* (ب) برية واحدة في محل رقمها: J♣-Q♣(برية)-K♣ → جوكر يسد Q — مسموحة وغير حرة */
  const kC = C(13, 'club');
  ok(rules.isValidSequence([jC, qC1, kC], true), 'J♣-Q♣(برية)-K♣ → مقبولة (برية واحدة = جوكر واحد)');
  ok(!rules.isValidSequence([jC, qC1, kC], false), 'نفسها مع jokerAllowed=false → مرفوضة');

  /* (ج) البرية كسد فجوة بعيد عن رقمها: 9♦-Q♦(برية عند مؤشر Q)-K♦؟ الفجوة 2 → جوكر واحد لا يسعها */
  const n9 = C(9, 'diamond'), qD = C(12, 'diamond'), kD = C(13, 'diamond');
  ok(!rules.isValidSequence([n9, qD, kD], true), '9♦-Q♦(برية)-K♦ فجوة 10-J من رقمين → مرفوض (فجوة واحدة فقط لجوكر واحد)');

  /* (د) برية + جوكر مطبوع معاً في متتالية (فرضي السامبل) → رفض */
  const printed = C(0, 'joker'); printed.isJoker = true;
  ok(!rules.isValidSequence([jC, qC1, kC, printed], true), 'J♣-Q♣(برية)-K♣+جوكر مطبوع → مرفوض (جوكران بأي نوع)');

  /* (هـ) المتتالية بالبرية غير حرة للافتتاح: validateOpening يتطلب متتالية نقية —
     جماعات بمتتالية-برية + متماثلة نقية فقط → رفض؛ وبمتتالية نقية إضافية بمجموع حر كافٍ → قبول */
  const wildSeq = { type: MELD_TYPE.SEQUENCE, cards: [jC, qC1, kC] };        /* J-Q-K ببرية (30 extra) */
  const pureSet3 = { type: MELD_TYPE.SET, cards: [C(10, 'heart'), C(10, 'diamond'), C(10, 'sword')] }; /* 30 حرة — رتبة بعيدة عن المؤشر Q */
  let r = rules.validateOpening([wildSeq, pureSet3], null, null, 0, false);
  ok(!r.valid, 'افتتاح بمتتالية-برية + متماثلة نقية فقط → مرفوض (لا متتالية حرة)');
  const pureSeq = { type: MELD_TYPE.SEQUENCE, cards: [C(2, 'sword'), C(3, 'sword'), C(4, 'sword'), C(5, 'sword'), C(6, 'sword'), C(7, 'sword')] }; /* 27 حرة → المجموع 57 ≥ 51 */
  r = rules.validateOpening([wildSeq, pureSet3, pureSeq], null, null, 0, false);
  ok(r.valid, 'نفس الافتتاح + متتالية نقية إضافية (30+27=57 حر) → مقبول والبرية مجموعة إضافية');

  /* (و) الإنهاء كذلك: بنية إنهاء بمتتالية-برية بلا متتالية نقية → مرفوض */
  let fin = rules.validateFinishStructure([wildSeq, pureSet3], null);
  ok(!fin.valid, 'إنهاء بمتتالية-برية بلا نقية → مرفوض');
  fin = rules.validateFinishStructure([wildSeq, pureSet3, pureSeq], null);
  ok(fin.valid, 'إنهاء مع متتالية نقية + متماثلة نقية → مقبول');
  /* (ز) الاستبدال: متتالية 9♦-10♦-برية(تسد J♦) — ورقة J♦ حقيقية تحل محل
     البرية وتعود البرية لليد (في السامبل كل Q♣ برية حسب المؤشر، لذا
     سيناريو الاستبدال يستعمل برية تسد فجوة وورقة حقيقية تسد مكانها) */
  const s9 = C(9, 'diamond'), s10 = C(10, 'diamond'), jD = C(11, 'diamond');
  const wildAsJack = C(12, 'club');   /* برية (معكوسة Q) تسد J♦ */
  const meld = new RamiMeld(MELD_TYPE.SEQUENCE, [s9, s10, wildAsJack]);
  ok(rules.isValidSequence(meld.cards, true), 'التجهيز: 9♦-10♦-برية(تسد J) متتالية صحيحة');
  ok(meld.findJokerSwapIndex(jD, rules) === 2, 'J♦ الحقيقية تحل محل البرية → موضع 2 يُستبدل وتعود البرية لليد');
  ok(meld.findJokerSwapIndex(C(13, 'diamond'), rules) === -1, 'K♦ لا تصلح للاستبدال (تفسد المتتالية) → -1');

  /* (ح) الطالاج لم يتغير: الجوكر المطبوع يسد الفجوات كالمعتاد */
  const tRules = new RamiRules('talaj', 90);
  const tj = C(0, 'joker'); tj.isJoker = true;
  ok(tRules.isValidSequence([C(10, 'heart'), tj, C(12, 'heart')], true), 'طالاج: 10♥-جوكر مطبوع-Q♥ → مقبولة');
  ok(!tRules.isValidSequence([C(10, 'heart'), tj, C(12, 'heart')], false), 'طالاج: نفسها بلا سماح جوكر → مرفوضة');
  const tj2 = C(0, 'joker'); tj2.isJoker = true;
  ok(!tRules.isValidSequence([C(10, 'heart'), tj, tj2, C(13, 'heart')], true), 'طالاج: جوكران مطبوعان → مرفوضة');

  /* (ط) [SAMPEL-WILD] المتماثلة بنفس المنطق حرفياً (توجيه المالك: نفس الشروط
     والمنطق ينطبق على المتماثلة): البرية فيها جوكرٌ فقط — ولو في محل رقمها
     (1)؛ برية تسد أي متماثلة (2)؛ بريتان (3) أو برية+مطبوع (4) مرفوضان —
     جوكر واحد على الأكثر بأي نوع؛ ولا جوكر مع متماثلة كاملة (6). */
  const sRules = new RamiRules('simple', 90);
  sRules.jokerIndicator = { id: 'INDS', rank: 7, suit: 'heart', isJoker: false }; /* 7 أحمر مؤشر → 7♣/7♠ بريتان */
  const w7c = C(7, 'club'), w7s = C(7, 'spade');
  ok(sRules.isValidSet([w7c, C(7, 'heart'), C(7, 'diamond')], true), 'متماثلة: برية واحدة في محل رقمها → مقبولة (تعمل جوكراً)');
  ok(sRules.isValidSet([C(5, 'spade'), C(5, 'heart'), w7c], true), 'متماثلة: برية تسد متماثلة 5ات → مقبولة');
  ok(!sRules.isValidSet([w7c, w7s, C(5, 'heart')], true), 'متماثلة: بريتان معاً → مرفوضة (جوكران)');
  const sPrinted = C(0, 'joker'); sPrinted.isJoker = true;
  ok(!sRules.isValidSet([w7c, sPrinted, C(5, 'heart')], true), 'متماثلة: برية + جوكر مطبوع → مرفوضة (جوكران بأي نوع)');
  ok(!sRules.isValidSet([w7c, w7s, C(7, 'heart'), C(7, 'diamond')], true), 'متماثلة: بريتان + 7♥ + 7♦ (4 أوراق) → مرفوضة');
  ok(!sRules.isValidSet([C(5, 'spade'), C(5, 'heart'), C(5, 'diamond'), C(5, 'club'), w7c], true), 'متماثلة: كاملة 4 أوراق + برية → مرفوضة');
  /* والمتماثلة التي تحوي برية غير حرة للافتتاح/الإنهاء (كالمتتالية) —
     validateOpening يتطلب متماثلة نقية (اختبار (هـ) أعلاه غطاها بالمتماثلة النقية) */
}

console.log('── 8ب) [v19.3] مرموق الدور في مجموعة إضافية يُحتسب ضمن عتبة الـ51 ──');
{
  const rules = new RamiRules('simple', 90);
  rules.jokerIndicator = null;
  const seq = (cards) => ({ type: MELD_TYPE.SEQUENCE, cards });
  const set = (cards) => ({ type: MELD_TYPE.SET, cards });
  /* حرة: متتالية 2-3-4 (9) + متماثلة 5-5-5 (15) = 24 < 51؛
     مجموعة المرموق 10-J-Q (30) ترفعها إلى 54 → قانوني في السامبل */
  const drawn = C(10, 'heart');
  const m1 = seq([C(2, 'sword'), C(3, 'sword'), C(4, 'sword')]);
  const m2 = set([C(5, 'heart'), C(5, 'diamond'), C(5, 'sword')]);
  const m3 = seq([drawn, C(11, 'heart'), C(12, 'heart')]);
  const r = rules.validateOpening([m1, m2, m3], drawn, null, 0, false);
  ok(r.valid && r.freeScore === 54, 'مجموعة مرموق الدور تدخل عتبة الـ51 في السامبل (54)');
  /* لكن المرموق ممنوع في المتتالية/المتماثلة الأساسيتين */
  const r2 = rules.validateOpening([m3, m2], drawn, null, 0, false);
  ok(!r2.valid, 'المرموق في المتتالية الحرة الأساسية الوحيدة → مرفوض');
  /* والجوكر المسحوب من المرموق لا يستفيد من القاعدة */
  rules.jokerIndicator = { id: 'IND9', rank: 10, suit: 'sword', isJoker: false }; /* 10 أحمر جوكر */
  const drawnJok = C(10, 'diamond'); /* برية */
  const m5 = seq([C(2, 'grape'), C(3, 'grape'), C(4, 'grape')]);
  const m6 = set([C(13, 'heart'), C(13, 'diamond'), C(13, 'sword')]); /* 30 */
  const m7 = seq([drawnJok, C(11, 'diamond'), C(12, 'diamond')]);
  const r3 = rules.validateOpening([m5, m6, m7], drawnJok, rules.jokerIndicator, 0, false);
  ok(!r3.valid || r3.freeScore === 39, 'المسحوبة الجوكر لا تدخل مجموعتها في العتبة');
  /* الطالاج: مجموعة المرموق تدخل العتبة بشرطيها (لا في الحرة الأساسية، بلا جوكر)
     حرة: متتالية 4-5-6 (15) + متماثلة KKK (30) = 45 < 71؛ مجموعة المرموق
     10-J-Q (30) ترفعها إلى 75 → قانوني في الطالاج بقانون المرموق */
  const rulesT = new RamiRules('talaj', 90);
  rulesT.jokerIndicator = null;
  const tDrawn = C(10, 'heart');
  const t1 = seq([C(4, 'sword'), C(5, 'sword'), C(6, 'sword')]);         /* 15 */
  const t2 = set([C(13, 'heart'), C(13, 'diamond'), C(13, 'sword')]);    /* KKK 30 */
  const t3 = seq([tDrawn, C(11, 'heart'), C(12, 'heart')]);              /* 10-J-Q 30 */
  const rT = rulesT.validateOpening([t1, t2, t3], tDrawn, null, 0, false);
  ok(rT.valid && rT.freeScore === 75, 'الطالاج: مجموعة مرموق الدور تدخل عتبة الـ71 (75 حرة)');
  /* الشرط الأول: المرموق داخل إحدى الحرتين الأساسيتين → مرفوض هيكلياً
     (لا تصلح إلا متتالية واحدة وكلتاهما تعتمدان على المسحوب) */
  const rT2 = rulesT.validateOpening([t3, t2], tDrawn, null, 0, false);
  ok(!rT2.valid, 'الطالاج: المرموق في المتتالية الحرة الأساسية الوحيدة → مرفوض');
  /* بلا قاعدة المرموق (المسحوب خارج الحساب): 45 حرة فقط < 71 → مرفوض */
  const rT5 = rulesT.validateOpening([t1, t2], tDrawn, null, 0, false);
  ok(!rT5.valid, 'الطالاج: الحرتان فقط 45 < 71 دون مجموعة المرموق → مرفوض');
}

console.log('── 9) [v19.2] رمي المرموق/الفوجوك المسحوبة نفس الدور = جزاء 51 ──');
{
  /* رمي المرموق المسحوبة نفس الدور: مسموح + جزاء 51 */
  const g = new RamiGame('simple', 2, 1, 88, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  rm.jokerIndicator = null; g.rules.jokerIndicator = null;
  const p = rm.getCurrentPlayer();
  const marm = C(9, 'diamond');
  rm.discardPile.push(marm);
  const rd = g.executeMove({ type: 'draw_discard', playerId: p.id });
  ok(rd.success, 'سحب المرموق نجح');
  const before = p.penaltyScore || 0;
  const rdisc = g.executeMove({ type: 'discard', playerId: p.id, cardId: marm.id });
  ok(rdisc.success, 'رمي نفس ورقة المرموق في نفس الدور مسموح (ليس مرفوضاً)');
  ok((p.penaltyScore || 0) === before + 51, 'جزاء +51 قُيّد على الرامي (' + (p.penaltyScore || 0) + ')');
  ok(rm.discardPile[rm.discardPile.length - 1].id === marm.id, 'الورقة عادت لكومة المرموق');
}
{
  /* رمي الفوجوك المسحوبة نفس الدور: جزاء 51 + تتحول مرموقاً عادياً (لا فوجوك بعدها) */
  const g = new RamiGame('simple', 2, 1, 99, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  const p = rm.getCurrentPlayer();
  ok(!!rm.jokerIndicator, 'الفوجوك مقلوبة في بداية الشوط');
  const fojokId = rm.jokerIndicator.id;
  const rf = g.executeMove({ type: 'draw_fojok', playerId: p.id });
  ok(rf.success && rf.isFojok, 'سحب الفوجوك في الدور الأول نجح');
  ok(p.drawnFojokCard && p.drawnFojokCard.id === fojokId, 'drawnFojokCard مسجلة');
  const before = p.penaltyScore || 0;
  const rdisc = g.executeMove({ type: 'discard', playerId: p.id, cardId: fojokId });
  ok(rdisc.success, 'رمي الفوجوك في نفس الدور مسموح');
  ok((p.penaltyScore || 0) === before + 51, 'جزاء +51 على رامي الفوجوك');
  ok(rm.jokerIndicator === null, 'الفوجوك لم تعد معروضة كفوجوك (صارت مرموقاً عادياً)');
  ok(rm.discardPile[rm.discardPile.length - 1].id === fojokId, 'الفوجوك المرمية فوق كومة المرموق — لصاحب الدور التالي كمرموق عادي');
  /* اللاعب التالي يأخذها كمرموق عادي بلا جزاء */
  const p2 = rm.getCurrentPlayer();
  ok(p2.id !== p.id, 'الدور انتقل للاعب التالي');
  const rd2 = g.executeMove({ type: 'draw_discard', playerId: p2.id });
  ok(rd2.success && rd2.card.id === fojokId, 'اللاعب التالي سحبها كمرموق عادي');
  ok(!(rd2.isFojok), 'السحب ليس سحب فوجوك');
}
{
  /* الخبير لا يرمي المسحوبة نفس الدور أبداً */
  const g = new RamiGame('simple', 2, 1, 111, 90);
  g.startMatch(2, 1);
  const rm = g.roundManager;
  rm.jokerIndicator = null; g.rules.jokerIndicator = null;
  const p = rm.getCurrentPlayer();
  const marm = C(13, 'sword');
  rm.discardPile.push(marm);
  g.executeMove({ type: 'draw_discard', playerId: p.id });
  const did = RamiExpertAI.chooseDiscard(g, p);
  ok(did !== marm.id, 'الخبير لا يختار رمي المرموق المسحوبة نفس الدور');
}

console.log('── 8) [V19.3] تجاوز أعلى افتتاح سابق (طالاج + سامبل) ──');
for (const mode of ['simple', 'talaj']) {
  const g = new RamiGame(mode, 3, 0, 42, 90);
  g.startMatch(3, 0);
  const rm = g.roundManager;
  rm.jokerIndicator = null; g.rules.jokerIndicator = null;
  rm.dealerFirstCycle = false;
  const p0 = g.players[0], p1 = g.players[1], p2 = g.players[2];
  /* p0: متتالية 8-9-10♦ (27) + متماثلة 10×3 (30) + متتالية 6-7-8♥ (21) = 78 */
  p0.hand = [C(8, 'diamond'), C(9, 'diamond'), C(10, 'diamond'), C(10, 'spade'), C(10, 'heart'), C(10, 'club'), C(6, 'heart'), C(7, 'heart'), C(8, 'heart'), C(2, 'heart'), C(4, 'spade'), C(9, 'spade'), C(13, 'diamond'), C(5, 'club')];
  /* p1: نفس المجموع 78 تماماً */
  p1.hand = [C(8, 'club'), C(9, 'club'), C(10, 'club'), C(11, 'heart'), C(11, 'spade'), C(11, 'club'), C(6, 'spade'), C(7, 'spade'), C(8, 'spade'), C(3, 'heart'), C(4, 'diamond'), C(9, 'heart'), C(13, 'spade'), C(5, 'diamond')];
  /* p2: متتالية Q-K-A♣ (30) + متماثلة K×3 (30) + متماثلة 9×3 (27) = 87 > 78 */
  p2.hand = [C(12, 'club'), C(13, 'club'), C(1, 'club'), C(13, 'heart'), C(13, 'spade'), C(13, 'diamond'), C(9, 'club'), C(9, 'diamond'), C(9, 'heart'), C(2, 'spade'), C(3, 'diamond'), C(4, 'heart'), C(5, 'spade'), C(6, 'diamond')];
  [p0, p1, p2].forEach(p => { p.hasOpened = false; p.drawnDiscardCard = null; });
  rm.highestOpeningScore = 0;
  rm.currentPlayerIndex = 0; rm.turnPhase = 'WAITING_DISCARD';
  const r0 = g.executeMove({ type: 'open', playerId: p0.id, cardIds: p0.hand.slice(0, 9).map(c => c.id) });
  ok(r0.success && rm.highestOpeningScore === 78, mode + ': المفتتح الأول (78) قُبل وسُجل أعلى افتتاح');
  rm.currentPlayerIndex = 1; rm.turnPhase = 'WAITING_DISCARD';
  ok(!g.getLegalMoves(p1.id).some(m => m.type === 'open'), mode + ': مجموع مساوٍ (78=78) لا يُعرض كافتتاح قانوني');
  const r1 = g.executeMove({ type: 'open', playerId: p1.id, cardIds: p1.hand.slice(0, 9).map(c => c.id) });
  ok(!r1.success && !p1.hasOpened, mode + ': افتتاح مساوٍ (78=78) مرفوض — يجب التجاوز الصارم');
  rm.currentPlayerIndex = 2; rm.turnPhase = 'WAITING_DISCARD';
  const r2 = g.executeMove({ type: 'open', playerId: p2.id, cardIds: p2.hand.slice(0, 9).map(c => c.id) });
  ok(r2.success && p2.hasOpened && rm.highestOpeningScore === 87, mode + ': افتتاح أكبر (87>78) قُبل ورفع أعلى افتتاح');
}

console.log('── 9) [V19.5] إدراج المسحوبة في مجموعة أُنزلت نفس الدور (سيناريو السكرين شوت) ──');
{
  /* لاعب مفتوح من دور سابق سحب 9♦ من المرموق، أنزل 10-J-Q♦ الآن،
     ثم أدرج 9♦ فيها — يجب أن يُقبل (9-10-J-Q متتالية صالحة) */
  const g = new RamiGame('simple', 2, 0, 42, 90);
  g.startMatch(2, 0);
  const rm = g.roundManager;
  rm.jokerIndicator = null; g.rules.jokerIndicator = null;
  const p = g.players[0];
  p.hasOpened = true;
  const nine = C(9, 'diamond');
  p.hand = [C(10, 'diamond'), C(11, 'diamond'), C(12, 'diamond'), nine, C(2, 'club'), C(5, 'heart')];
  p.drawnDiscardCard = nine;
  rm.currentPlayerIndex = 0; rm.turnPhase = 'WAITING_DISCARD';
  const r = g.executeMove({ type: 'open', playerId: p.id, cardIds: [p.hand[0].id, p.hand[1].id, p.hand[2].id] });
  ok(r.success, 'الإنزال الموالي 10-J-Q♦ قُبل');
  ok(!p.melds[0]._justOpened, 'الإنزال الموالي (مفتوح أصلاً) لا يحمل وسم _justOpened');
  ok(cardFitsMeld(nine, p.melds[0], g.rules, p.drawnDiscardCard, p.melds), 'إدراج 9♦ المسحوبة في المتتالية المنزلة نفس الدور → مقبول');
}
{
  /* حماية دور الافتتاح باقية: المسحوبة لا تدخل مجموعة أساسية إلا ببقاء حرتين غيرها */
  const rules = new RamiRules('simple', 90); rules.jokerIndicator = null;
  const seq = { type: MELD_TYPE.SEQUENCE, cards: [C(10, 'heart'), C(11, 'heart'), C(12, 'heart')], _justOpened: true };
  const set = { type: MELD_TYPE.SET, cards: [C(7, 'club'), C(7, 'heart'), C(7, 'diamond')], _justOpened: true };
  const drawn = C(9, 'heart');
  ok(!cardFitsMeld(drawn, seq, rules, drawn, [seq, set]), 'المسحوبة في الأساسية (حرتان فقط) → مرفوض');
  const seq2 = { type: MELD_TYPE.SEQUENCE, cards: [C(2, 'spade'), C(3, 'spade'), C(4, 'spade')], _justOpened: true };
  ok(cardFitsMeld(drawn, seq, rules, drawn, [seq, set, seq2]), 'المسحوبة مع بقاء الحرتين الأساسيتين غيرها → مقبول');
  const rules2 = new RamiRules('simple', 90); rules2.jokerIndicator = C(9, 'spade');
  ok(!cardFitsMeld(C(9, 'diamond'), seq, rules2, null, [seq, set, seq2]), 'الجوكر في حرة نفس الدور يبقى مرفوضاً');
}

console.log('\n═══ Rami Sample v19: ' + pass + '/' + (pass + fail) + ' passed ═══');
process.exit(fail ? 1 : 0);
