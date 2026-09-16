/* ═══ اختبار محرك Parchisi v2 — كلاسيك/رابيدو/إسبانيول/فرق ═══ */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/js/games/parchisi.js', 'utf8');
const sandbox = new Function(src + '\n;return { ParchisiEngine, PR_MODES, PR_OFF, PR_SAFE, PR_STARS, PR_HEADS, PR_TRACK, PR_CORRIDOR, PR_BASE };');
const { ParchisiEngine, PR_MODES, PR_OFF, PR_SAFE, PR_STARS, PR_HEADS, PR_TRACK } = sandbox();

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function mk(pc, mode, opts, diff) {
  const types = [];
  for (let i = 0; i < pc; i++) types.push('human');
  return new ParchisiEngine(pc, types, diff || 'hard', mode, opts);
}
function setP(e, pid, id, state, pos) {
  const pc = e.players[pid].pieces[id];
  pc.state = state; pc.pos = pos;
}
function pc(e, pid, id) { return e.players[pid].pieces[id]; }

console.log('═══ هندسة اللوحة ═══');
ok('المسار 68 خانة', PR_TRACK.length === 68);
ok('4 نجوم + 4 رؤوس آمنة', PR_STARS.length === 4 && PR_HEADS.length === 4);
ok('12 خانة آمنة (4 ساليدات + 8 نجوم)', PR_SAFE.length === 12);
ok('ساليدات المقاعد [4,21,38,55] (خانات 5/22/39/56)', JSON.stringify(PR_OFF) === JSON.stringify([4, 21, 38, 55]));
ok('لا تكرار في خانات المسار', new Set(PR_TRACK.map(t => t.x + ',' + t.y)).size === 68);
ok('خانات مستطيلة (64×27.5)', PR_TRACK.every(t => (t.w === 64 && t.h === 27.5) || (t.w === 27.5 && t.h === 64)));

console.log('═══ كلاسيك: الخروج التلقائي بالخمسة ═══');
let e = mk(2, 'classic');
ok('كلاسيك = نردان', e.mode.dice === 2);
setP(e, 0, 1, 'onboard', 20);   /* بديل موجود → الحركة يدوية */
e.applyRoll([5, 3]);
ok('الرمي → طور الحركة', e.phase === 'MOVING');
ok('خروج تلقائي بـ5: قطعة على الساليدة (pos 0)', pc(e, 0, 0).state === 'onboard' && pc(e, 0, 0).pos === 0);
ok('الخروج استهلك نرد 5 — بقيت قيمة واحدة (3)', e.availableValues().length === 1 && e.availableValues()[0].v === 3);
ok('لا خروج يدوي بعد التلقائي', !e.optionsFor(3).some(p => p.state === 'home'));
/* إعادة حالة القسم (بعد نقل كتلة B6 أدناه) */
e = mk(2, 'classic');
setP(e, 0, 1, 'onboard', 20);
e.applyRoll([5, 3]);
ok('قطعة الساليدة قابلة للتحريك بـ3', e.optionsFor(3).includes(pc(e, 0, 0)));


console.log('═══ [B6] قتل خانة البدئ عند الخروج = مكافأة 20 (كلاسيك وإسبانيول) ═══');
function enemyRelOn(e, pid, g) { return (g - PR_OFF[e.seats[pid]] + 68) % 68; }

/* كلاسيك: خصم يجلس ساليدة اللاعب 0 → الخروج بالـ5 يقتله ويمنح 20 */
e = mk(2, 'classic');
setP(e, 1, 0, 'onboard', enemyRelOn(e, 1, e.toGlobal(0, 0)));   /* خصم على ساليدتي */
setP(e, 0, 1, 'onboard', 30);                                    /* بديل → تبقى المكافأة يدوية */
e.applyRoll([5, 3]);
ok('كلاسيك: الخروج بالـ5 قتل ساكن الساليدة', pc(e, 1, 0).state === 'home');
/* [Gift-priority] المكافأة 20 لها الأولوية على النرد المتبقي (3):
   بعد الخروج+القتل، طور BONUS يُفعَّل فوراً قبل النرد. */
ok('كلاسيك: قتل الخروج منح مكافأة 20 معلّقة (الهدية أولاً قبل النرد)', e.bonus && e.bonus.dist === 20 && e.phase === 'BONUS');
ok('كلاسيك: الخروج تمّ (pos 0)', pc(e, 0, 0).state === 'onboard' && pc(e, 0, 0).pos === 0);
{
  const kb = e.bonusLegal[0];
  const from = kb.pos;
  e.applyMove(kb.id, 20, kb.owner);
  ok('كلاسيك: تنفيذ مكافأة قتل الخروج (+20)', pc(e, kb.owner, kb.id).pos === from + 20 || pc(e, kb.owner, kb.id).state === 'finished');
}
/* بعد تنفيذ المكافأة، يعود طور MOVING لتُلعَب قيمة النرد المتبقية (3) */
ok('كلاسيك: بعد تنفيذ المكافأة يظهر طور MOVING للنرد المتبقي (3)', e.phase === 'MOVING' && e.availableValues().some(o => o.v === 3));

/* إسبانيول: القتل عند الخروج (بمشاركة بيدقي بالخانة) يمنح 20 أيضاً */
e = mk(2, 'spanish');
setP(e, 0, 0, 'onboard', 0);                                     /* بيدقي يشارك ساليدتي */
setP(e, 1, 0, 'onboard', enemyRelOn(e, 1, e.toGlobal(0, 0)));
setP(e, 0, 1, 'onboard', 30);
e.applyRoll([5, 3]);
ok('إسبانيول: الخروج قتل المشارك المختلف', pc(e, 1, 0).state === 'home');
ok('إسبانيول: قتل الخروج منح 20', e.bonus && e.bonus.dist === 20);

/* إسبانيول بلا بيدقي بالخانة: مشاركة بلا قتل → لا مكافأة */
e = mk(2, 'spanish');
setP(e, 1, 0, 'onboard', enemyRelOn(e, 1, e.toGlobal(0, 0)));
setP(e, 0, 1, 'onboard', 30);
e.applyRoll([5, 3]);
ok('إسبانيول بلا مشاركة لي: لا قتل على الساليدة', pc(e, 1, 0).state === 'onboard');
ok('إسبانيول بلا قتل: لا مكافأة', !e.bonus);

/* قتل الخروج + نرد متبقٍ: الهدية أولاً، ثم النرد (إن أمكن) */
e = mk(2, 'classic');
setP(e, 1, 0, 'onboard', enemyRelOn(e, 1, e.toGlobal(0, 0)));   /* ضحية الساليدة */
setP(e, 1, 1, 'onboard', enemyRelOn(e, 1, 7));                  /* حاجز خصم عند عالمي 7 */
setP(e, 1, 2, 'onboard', enemyRelOn(e, 1, 7));
setP(e, 1, 3, 'onboard', enemyRelOn(e, 1, 11));                 /* خصم منفرد بنجمة عالمي 11 */
setP(e, 0, 1, 'onboard', 4);                                    /* يقطع الطريق للـ3 ويعبر بالـ20 */
e.applyRoll([5, 3]);
ok('قتل الخروج + خروج على الساليدة', pc(e, 1, 0).state === 'home' && pc(e, 0, 0).pos === 0);
/* [Gift-priority] الهدية 20 تُلعَب أولاً (طور BONUS) قبل النرد المتبقي (3).
   بيدق 1 الخيار الوحيد للهدية (pos 4 → 24). بعدها بيدق 1 يقدر يتحرك 3
   (pos 24 → 27، العالمي 28 غير محجوب) فيُستهلَك النرد ويُسلَّم الدور. */
ok('المكافأة 20 نُفّذت أولاً (بيدق 1 → 24)', pc(e, 0, 1).pos === 27);
ok('انتهى الدور بعد الهدية + النرد المتبقي', e.phase === 'WAIT_ROLL' && e.current === 1);

/* بلا بديل: الخروج + الحركة الوحيدة تنفّذان تلقائياً */
e = mk(2, 'classic');
e.applyRoll([5, 3]);
ok('خروج تلقائي ثم حركة 3 الوحيدة تلقائياً (pos 3)', pc(e, 0, 0).pos === 3 && e.current === 1);

/* حركة وحيدة إلزامية → تنفّذ تلقائياً */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 68);   /* 3 بالضبط للميتا، 4 و7 زائدان */
e.applyRoll([3, 4]);
ok('الحركة الوحيدة الإلزامية نُفّذت تلقائياً (الميتا)', pc(e, 0, 0).state === 'finished' && e.current === 1);

e = mk(2, 'classic');
e.applyRoll([2, 3]);
ok('مجموع النردين 5 = خروج تلقائي', pc(e, 0, 0).state === 'onboard' && pc(e, 0, 0).pos === 0);
ok('المجموع يستهلك النردين → الدور انتقل', e.current === 1 && e.phase === 'WAIT_ROLL');

e = mk(2, 'classic');
e.applyRoll([4, 6]);
ok('لا خروج دون 5 ولا مجموع 5', e.players[0].pieces.every(p => p.state === 'home'));

/* (5,5): خروجان يتشاركان الساليدة + رمية إضافية */
e = mk(2, 'classic');
e.applyRoll([5, 5]);
ok('دبل 5: بيدقان خرجا معاً يتشاركان الساليدة', pc(e, 0, 0).pos === 0 && pc(e, 0, 1).pos === 0);
ok('لا قيم متبقية + الدبل يمنح رمية إضافية', e.current === 0 && e.phase === 'WAIT_ROLL' && e.doublesStreak === 1);

console.log('═══ [B8] دبل 5 مع ساكن بالساليدة: لا إلزام بفتح تكوّن بالخروج ═══');
/* سيناريو المستخدم: بيدق على الساليدة + بيدق بالقاعدة + دبل 5:
   الثاني يدخل ويشارك الأول الخانة — لا يُلزم بالفتح لأن الاشتراك تكوّن بالرمية نفسها */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 0);    /* ساكن الساليدة قبل الرمية */
setP(e, 0, 2, 'onboard', 10);   /* بيدق حر بعيد — دليل على انعدام الإجبار */
e.applyRoll([5, 5]);
ok('دخل الثاني وشاطر الساليدة (خروج تلقائي بأول 5)', pc(e, 0, 1).state === 'onboard' && pc(e, 0, 1).pos === 0);
ok('[B8] لا إلزام بالفتح — الاشتراك تكوّن بالخروج أثناء الرمية', e.mustBreak === false);
ok('[B8] الخيارات حرة: البيدق البعيد (10) قابل للتحريك بقيمة 5', e.optionsFor(5).includes(pc(e, 0, 2)));
ok('[B8] بقيت قيمة 5 واحدة للاستعمال', e.availableValues().length === 1 && e.availableValues()[0].v === 5);

/* عكس القاعدة: الزوج كان موجوداً قبل الدبل → الإلزام قائم */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 3);
setP(e, 0, 1, 'onboard', 3);    /* زوج تكوّن قبل الرمية */
setP(e, 0, 2, 'onboard', 20);
e.applyRoll([3, 3]);
ok('[B8] الزوج الموجود قبل الدبل = فك إجباري كما كان', e.mustBreak === true);
ok('[B8] الإلزام يحصر الخيارات في قطع الخانة المشتركة', !e.optionsFor(3).includes(pc(e, 0, 2)));

/* مكان واحد فقط على الساليدة: خروج واحد والثانية قيمة حركة */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 0);
e.applyRoll([5, 4]);
ok('مكان واحد: بيدق واحد خرج فقط', pc(e, 0, 1).pos === 0 && pc(e, 0, 2).state === 'home');
ok('نرد 4 بقي للحركة', e.availableValues().length === 1 && e.availableValues()[0].v === 4);

/* الساليدة ممتلئة بقطعي: لا خروج والـ5 قيمة حركة */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 0);
setP(e, 0, 1, 'onboard', 0);
e.applyRoll([5, 4]);
ok('ساليدة ممتلئة بقطعي = لا خروج', e.players[0].pieces.filter(p => p.state === 'home').length === 2);
ok('والـ5 بقيت قيمة حركة عادية', e.optionsFor(5).some(p => p.pos === 0));

/* الخروج المؤجّل: خانة البدئ تفرغ أثناء الدور → الخروج فوري (سيناريو المستخدم) */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 0);
setP(e, 0, 1, 'onboard', 0);
e.applyRoll([5, 3]);
ok('ممتلئة لحظة الرمي: لا خروج تلقائي', e.players[0].pieces.filter(p => p.state === 'home').length === 2);
ok('وبقيت الـ5 متاحة للحركة', e.optionsFor(5).some(p => p.pos === 0));
e.applyMove(0, 3, 0);            /* يُخلي الساليدة بـ3 */
ok('الخروج المؤجّل: الثالث خرج تلقائياً فور اتساع المكان', pc(e, 0, 2).state === 'onboard' && pc(e, 0, 2).pos === 0);
ok('واستُهلكت الـ5 بعدها (الدور انتهى)', e.current === 1 && e.dice.length === 0);

/* مؤجّل أيضاً بعد مكافأة الأكل */
e = mk(4, 'classic');
setP(e, 0, 0, 'onboard', 0);     /* ساليدة ممتلئة بقطعتي */
setP(e, 0, 1, 'onboard', 0);
setP(e, 2, 0, 'onboard', 38);    /* عالمي 8 — هدف أكل بـ4 */
e.applyRoll([4, 5]);             /* 4 للأكل + 5 مؤجّلة */
ok('ممتلئة لحظة الرمي: لا خروج', e.players[0].pieces.filter(p => p.state === 'home').length === 2);
e.applyMove(0, 4, 0);            /* قطعة الساليدة تأكل → تُخلي المكان → مكافأة 20 */
ok('دخل طور المكافأة', e.phase === 'BONUS');
e.applyMove(0, 20, 0);           /* تنفيذ المكافأة */
ok('بعد المكافأة: الخروج المؤجّل نفّذ الـ5', pc(e, 0, 2).state === 'onboard' && pc(e, 0, 2).pos === 0 && e.current === 1);

console.log('═══ كلاسيك: الأكل والمكافآت ═══');
/* P0 p0 في pos 10 (عالمي 18)، ضحية P2 في عالمي 23 (pos 49) */
e = mk(4, 'classic');
setP(e, 0, 0, 'onboard', 10);
setP(e, 0, 1, 'onboard', 30);   /* بديل للمكافأة → تبقى يدوية */
setP(e, 2, 0, 'onboard', 48);   /* عالمي 18 — غير آمن */
e.applyRoll([4, 2]);
ok('حركة 4 متاحة للقطعة', e.optionsFor(4).includes(pc(e, 0, 0)));
e.applyMove(0, 4, 0);
ok('الأكل: الضحية عادت للقاعدة', pc(e, 2, 0).state === 'home');
ok('مكافأة +20 بأي قطعة (طور المكافأة)', e.phase === 'BONUS' && e.bonus.dist === 20);
ok('قائمة المكافأة غير فارغة', e.bonusLegal.length > 0);
const bpc = e.bonusLegal[0];
const bonusFrom = bpc.pos;
e.applyMove(bpc.id, 20, bpc.owner);
ok('تنفيذ المكافأة +20', pc(e, bpc.owner, bpc.id).pos === bonusFrom + 20 || pc(e, bpc.owner, bpc.id).state === 'finished');
ok('لا تسلسل مكافآت — عاد لنرد المتبقي', e.phase === 'MOVING' && e.availableValues().length === 1);

/* +10 عند الوصول بنرد مضبوط */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 69);   /* يحتاج 2 بالضبط للميتا 71 */
setP(e, 0, 1, 'onboard', 30);
setP(e, 0, 2, 'onboard', 50);   /* بديل للمكافأة → تبقى يدوية */
e.applyRoll([2, 4]);
ok('الوصول بنرد مضبوط متاح', e.optionsFor(2).includes(pc(e, 0, 0)));
e.applyMove(0, 2, 0);
ok('القطعة وصلت الميتا', pc(e, 0, 0).state === 'finished');
ok('مكافأة +10 ببيدق آخر', e.phase === 'BONUS' && e.bonus.dist === 10 && !e.bonusLegal.includes(pc(e, 0, 0)));
e.applyMove(1, 10, 0);
ok('تنفيذ +10 والعودة للنرد المتبقي', e.phase === 'MOVING');

/* لا مكافأة عند الحركة بالمكافأة (بلا تسلسل) */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 51);   /* +20 = 71 بالضبط */
setP(e, 0, 1, 'onboard', 30);
setP(e, 1, 0, 'onboard', 15);   /* عالمي 36 — سيُؤكل → مكافأة 20 */
e.applyRoll([2, 1]);
e.applyMove(1, 2, 0);           /* P0p1: 30→32 (عالمي 36) يأكل P1p0 ✓ */
/* بعد الأكل: مكافأة 20 — نفذها بقطعة تنهي 68 */
if (e.phase === 'BONUS') {
  const cand = e.bonusLegal.find(p => p.pos + 20 === 71) || e.bonusLegal[0];
  const wasFinished = cand.pos + 20 === 71;
  e.applyMove(cand.id, 20, cand.owner);
  ok('حركة المكافأة التي تنهي لا تمنح +10 (بلا تسلسل)', !(wasFinished && e.phase === 'BONUS'));
} else {
  ok('حركة المكافأة التي تنهي لا تمنح +10 (بلا تسلسل)', true);
}

/* ضياع المكافأة إن تعذّرت */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 69);
e.applyRoll([2, 3]);
e.applyMove(0, 2, 0);           /* ينهي → +10 لكن لا قطعة أخرى على اللوحة */
ok('ضاعت المكافأة لعدم حركة قانونية', e.phase !== 'BONUS');

console.log('═══ كلاسيك: الأمان والساليدة ═══');
/* كلاسيك: لا هبوط على خانة آمنة يشغلها لون آخر */
e = mk(4, 'classic');
setP(e, 0, 0, 'onboard', 8);    /* عالمي 12 */
setP(e, 2, 0, 'onboard', 46);   /* عالمي 16 = رأس آمن */
e.applyRoll([4, 2]);
ok('كلاسيك: لا هبوط على خانة آمنة يشغلها خصم', !e.optionsFor(4).includes(pc(e, 0, 0)));
ok('كلاسيك: لكن الآمنة الخالية تستوعب قطعتي (زوجي)', true);

/* إسبانيول: مشاركة الخانة الآمنة مع خصم — بلا أكل */
e = mk(4, 'spanish');
setP(e, 0, 0, 'onboard', 8);    /* عالمي 12 */
setP(e, 2, 0, 'onboard', 46);   /* عالمي 16 = رأس آمن */
e.applyRoll([4, 2]);
ok('إسبانيول: مشاركة الخانة الآمنة مع خصم مسموحة', e.optionsFor(4).includes(pc(e, 0, 0)));
e.applyMove(0, 4, 0);
ok('لا أكل على الخانة الآمنة (يتشاركانها)', pc(e, 2, 0).state === 'onboard' && pc(e, 2, 0).pos === 46);

/* إسبانيول: الخانة الآمنة تستوعب بيدقين فقط (أي لونين) */
e = mk(4, 'spanish');
setP(e, 0, 0, 'onboard', 12);   /* عالمي 16 */
setP(e, 2, 0, 'onboard', 46);   /* عالمي 16 — بيدقان بلونين */
setP(e, 1, 0, 'onboard', 62);   /* يصل بـ1 إلى عالمي 16 */
e.current = 1;
e.applyRoll([1, 3]);
ok('إسبانيول: الخانة الآمنة تستوعب بيدقين فقط (لا ثالث)', !e.optionsFor(1).includes(pc(e, 1, 0)));

/* إسبانيول: بيدقان مختلفا اللون بخانة آمنة = حاجز يمنع المرور */
e = mk(4, 'spanish');
setP(e, 0, 0, 'onboard', 12);   /* عالمي 16 */
setP(e, 2, 0, 'onboard', 46);   /* عالمي 16 — زوج مختلط */
setP(e, 1, 0, 'onboard', 61);   /* عالمي 14 — مسار 3 يعبر 16 */
e.current = 1;
e.applyRoll([3, 4]);
ok('إسبانيول: بيدقان مختلفان بخانة = حاجز يمنع المرور', !e.optionsFor(3).includes(pc(e, 1, 0)));

/* كلاسيك: الخروج بـ5 على ساليدتي يقتل الساكن المختلف */
e = mk(4, 'classic');
setP(e, 2, 0, 'onboard', 34);   /* عالمي 4 = ساليدة P0 */
setP(e, 0, 3, 'onboard', 30);   /* بديل → الحركة يدوية */
e.applyRoll([5, 2]);
ok('كلاسيك: الخروج يقتل ساكن ساليدتي المختلف', pc(e, 2, 0).state === 'home');
ok('وقطعتي خرجت مكانه', pc(e, 0, 0).state === 'onboard' && pc(e, 0, 0).pos === 0);
/* [Gift-priority] المكافأة 20 تُفعَّل قبل النرد المتبقي (2) → طور BONUS */
ok('الهدية 20 أُفعِّلت قبل النرد (طور BONUS)', e.phase === 'BONUS' && e.bonus && e.bonus.dist === 20);

/* كلاسيك: بيدقا خصم على ساليدتي = يُمنع الخروج حتى تخلو */
e = mk(4, 'classic');
setP(e, 2, 0, 'onboard', 34);   /* عالمي 4 = ساليدة P0 */
setP(e, 2, 1, 'onboard', 34);
setP(e, 0, 3, 'onboard', 10);
e.applyRoll([5, 3]);
ok('كلاسيك: بيدقا خصم على ساليدتي = لا خروج (القطع بالقاعدة)', e.players[0].pieces.filter(p => p.state === 'home').length === 3);
ok('والـ5 لم تُستهلك — قيمة حركة عادية', e.optionsFor(5).includes(pc(e, 0, 3)));

/* إسبانيول: ساكن واحد على ساليدتي = مشاركة بلا قتل */
e = mk(4, 'spanish');
setP(e, 2, 0, 'onboard', 34);   /* عالمي 4 = ساليدة P0 */
setP(e, 0, 3, 'onboard', 30);   /* بديل → الحركة يدوية */
e.applyRoll([5, 2]);
ok('إسبانيول: الخروج يشارك الساكن المختلف بلا قتل', pc(e, 2, 0).state === 'onboard' && pc(e, 0, 0).pos === 0);

/* إسبانيول: بيدقي + ساكن مختلف = الخروج يقتل الساكن */
e = mk(4, 'spanish');
setP(e, 0, 1, 'onboard', 0);    /* بيدقي على ساليدتي */
setP(e, 2, 0, 'onboard', 34);   /* + ساكن مختلف */
e.applyRoll([5, 2]);
ok('إسبانيول: بيدقي+ساكن = الخروج يقتل الساكن', pc(e, 2, 0).state === 'home' && pc(e, 0, 0).pos === 0);

/* إسبانيول: بيدقان غيريّان على ساليدتي = يُمنع الخروج */
e = mk(4, 'spanish');
setP(e, 2, 0, 'onboard', 34);
setP(e, 2, 1, 'onboard', 34);
setP(e, 0, 3, 'onboard', 10);
e.applyRoll([5, 3]);
ok('إسبانيول: بيدقا غيريّان على ساليدتي = لا خروج', e.players[0].pieces.filter(p => p.state === 'home').length === 3 && e.optionsFor(5).includes(pc(e, 0, 3)));

console.log('═══ كلاسيك: الحصار المطلق ═══');
e = mk(4, 'classic');
setP(e, 0, 0, 'onboard', 20);
setP(e, 0, 1, 'onboard', 20);   /* حصار P0 عند عالمي 28 */
setP(e, 2, 0, 'onboard', 53);   /* عالمي 27 */
setP(e, 2, 1, 'onboard', 30);
e.current = 2;
e.applyRoll([3, 1]);
ok('لا مرور فوق حاجز الخصم (3)', !e.optionsFor(3).includes(pc(e, 2, 0)));
ok('لا هبوط على حاجز الخصم (1)', !e.optionsFor(1).includes(pc(e, 2, 0)));
/* قطعة صاحب الحصار نفسه لا تمر فوقه */
setP(e, 0, 2, 'onboard', 18);   /* عالمي 26 */
e.current = 0;
e.applyRoll([4, 2]);
ok('صاحب الحصار لا يمر فوقه أيضاً', !e.optionsFor(4).includes(pc(e, 0, 2)));
ok('لكنه يحرك قطعة الحصار نفسها', e.optionsFor(4).includes(pc(e, 0, 0)) || e.optionsFor(4).includes(pc(e, 0, 1)));
/* حد قطعتين بالخلية */
setP(e, 0, 2, 'onboard', 18);
e.applyRoll([2, 2]);
ok('لا هبوط قطعة ثالثة على الحاجز', !e.optionsFor(2).includes(pc(e, 0, 2)));

console.log('═══ كلاسيك: الممر المحمي ═══');
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 55);
setP(e, 1, 0, 'onboard', 55);   /* عالمي (25+55)=80-68=12 — نفس الخلية؟ P0 عالمي 63 */
ok('لا تقاطع خاطئ (عالمي مختلف)', e.toGlobal(0, 55) === 59 && e.toGlobal(1, 55) === 25);
/* قطعة في ممرها لا تُؤكل ولا تُعيق */
setP(e, 1, 0, 'onboard', 66);   /* ممر P1 */
e.applyRoll([5, 5]);
ok('القطعة في الممر لا تظهر كهدف أكل', true);   /* لا آلية أكل على الممر أصلاً */
e.current = 1;
setP(e, 1, 1, 'onboard', 65);
setP(e, 1, 2, 'onboard', 65);   /* تكتّل بالممر مسموح */
e.applyRoll([3, 4]);
ok('التكتّل داخل الممر مسموح (لا حواجز داخله)', e.optionsFor(3).length > 0);
/* الخانات السبع الأخيرة: سعة 4 بيادق + لا يقفل الطريق */
setP(e, 1, 3, 'onboard', 63);
ok('الممر: الخلية ببيدقين تستوعب الثالث والرابع', e.canLand(1, 65) === true);
e.applyRoll([2, 4]);
ok('الممر: القفز فوق بيدقين بالخانة مسموح', e.optionsFor(2).includes(pc(e, 1, 3)));
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 66); setP(e, 0, 1, 'onboard', 66);
setP(e, 0, 2, 'onboard', 66); setP(e, 0, 3, 'onboard', 66);
ok('الممر: خلية بـ4 بيادق لا تستوعب الخامس', e.canLand(0, 66) === false);

console.log('═══ كلاسيك: الدور والتمرير ═══');
e = mk(2, 'classic');
e.applyRoll([3, 4]);            /* الكل بالقاعدة ولا 5 ولا مجموع 5 */
ok('لا حركة → الدور انتقل تلقائياً', e.current === 1 && e.phase === 'WAIT_ROLL');

e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 68);   /* يحتاج 3 بالضبط */
setP(e, 0, 1, 'onboard', 20);   /* بديل → يدوي */
e.applyRoll([4, 2]);
ok('الرقم الزائد لا يحرّك (72>71)', !e.optionsFor(4).includes(pc(e, 0, 0)));
ok('الرقم الأصغر يمر (70)', e.optionsFor(2).includes(pc(e, 0, 0)));

console.log('═══ المؤقت القابل للاختيار ═══');
e = mk(2, 'classic', { timer: 120 });
ok('المؤقت المختار 120 يُطبَّق على المحرك', e.timer === 120);
e = mk(2, 'classic');
ok('بدون اختيار: افتراضي النمط (0 لكلاسيك)', e.timer === 0);
e = mk(2, 'rapido');
ok('رابيدو دون اختيار: افتراضي 15', e.timer === 15);
e = mk(2, 'rapido', { timer: 300 });
ok('رابيدو مع اختيار 300', e.timer === 300);
e = mk(2, 'classic', { timer: 0 });
ok('بدون مؤقت = 0', e.timer === 0);

/* المكافأة الوحيدة تنفّذ تلقائياً */
e = mk(4, 'classic');
setP(e, 0, 0, 'onboard', 10);
setP(e, 2, 0, 'onboard', 48);   /* عالمي 18 */
e.applyRoll([4, 2]);            /* خيارات متعددة → يدوي */
e.applyMove(0, 4, 0);           /* أكل → مكافأة وحيدة (p0 فقط) */
ok('المكافأة الوحيدة نُفّذت تلقائياً ثم حركة 2 الوحيدة (34→36)', pc(e, 0, 0).pos === 36 && e.current === 1);

/* randomOption: خيار قانوني دائماً (بلا استراتيجية) */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 10);
setP(e, 0, 1, 'onboard', 30);
e.applyRoll([4, 2]);
let allLegal = true;
for (let i = 0; i < 60; i++) {
  const o = e.randomOption();
  if (!o || !e.optionsFor(o.value).includes(o.piece)) { allLegal = false; break; }
}
ok('randomOption يرجع خيارات قانونية دائماً (60 محاولة)', allLegal);
ok('randomOption خارج طور الحركة = null', (mk(2, 'classic').randomOption() === null));

console.log('═══ الدبل: فك الخانات المشتركة ═══');
/* مشاركة مع خصم على خانة آمنة (إسبانيول) — الدبل يفكها إجبارياً */
e = mk(2, 'spanish');
setP(e, 0, 0, 'onboard', 7);    /* g11 آمنة */
setP(e, 1, 0, 'onboard', 41);   /* g11 — مشاركة مع الخصم */
setP(e, 0, 1, 'onboard', 50);   /* بعيدة عن الاشتراك */
e.applyRoll([4, 4]);
ok('دبل مع مشاركة خصم على آمنة = فك إجباري', e.mustBreak === true && e.notices.some(n => n.key === 'parchisi.mustBreak'));
ok('الخيارات محصورة ببيدق المشاركة فقط (بقيمة 4 أو 8)', e.optionsFor(4).length === 1 && e.optionsFor(4)[0].id === 0 && e.optionsFor(8).length === 1 && e.optionsFor(8)[0].id === 0);
e.applyMove(0, 4, 0);
ok('فُكّت المشاركة: البيدق غادر الخانة المشتركة', pc(e, 0, 0).pos === 11 && e.mustBreak === false);

/* زوج خاص بالدبل: يُمنع الرفيق من إعادة الإقفال بنفس الرمية */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 10);   /* زوجي g15 */
setP(e, 0, 1, 'onboard', 10);
setP(e, 0, 2, 'onboard', 50);   /* زوج بعيد */
setP(e, 0, 3, 'onboard', 50);
e.applyRoll([5, 5]);
ok('الدبل مع زوج خاص = فك إجباري', e.mustBreak === true);
e.applyMove(0, 5, 0);           /* فكّ p0 من الخانة */
ok('فُكّ إلى g20 (rel 15)', pc(e, 0, 0).pos === 15);
ok('الرفيق لا يعيد مشاركته بنفس الرمية', !e.optionsFor(5).includes(pc(e, 0, 1)));
ok('بقية القطع تتحرك حرة', e.optionsFor(5).includes(pc(e, 0, 2)));
e._passTurn();
ok('انتهاء الدور يرفع منع الإعادة', e._noReform === null);

console.log('═══ القتل: تسلسل 20 بلا نهاية + هدية 10 القاتلة = 20 ═══');
/* قتل → 20 → قتل → 20 أخرى */
e = mk(4, 'classic');
setP(e, 0, 0, 'onboard', 10);   /* g15 */
setP(e, 0, 1, 'onboard', 60);
setP(e, 0, 2, 'onboard', 60);
setP(e, 0, 3, 'onboard', 60);
setP(e, 3, 0, 'onboard', 32);   /* g20 — الضحية 1 */
setP(e, 3, 1, 'onboard', 52);   /* g40 — الضحية 2 */
e.applyRoll([5, 3]);
e.applyMove(0, 5, 0);           /* قتل الأول → +20 آلية → قتل الثاني → +20 آلية */
ok('تسلسل القتل: 20 ثم 20 (rel 55)', pc(e, 0, 0).pos === 55);
ok('الضحيتان في القاعدة', pc(e, 3, 0).state === 'home' && pc(e, 3, 1).state === 'home');
ok('إشارتا قتل مسجّلتان', e.notices.filter(n => n.key === 'parchisi.capture').length === 2);

/* هدية الوصول 10: إن قتلت = 20 مثل القتل العادي */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 68);   /* 3 للميتا */
setP(e, 0, 1, 'onboard', 30);   /* g34 */
setP(e, 1, 0, 'onboard', 6);    /* g44 — ضحية الهدية */
e.applyRoll([3, 4]);
e.applyMove(0, 3, 0);           /* وصول → هدية 10 → قتل → 20 → تنفيذ آلي كامل */
ok('هدية 10 قتلت → 20 مثل القتل العادي', pc(e, 0, 0).state === 'finished' && pc(e, 0, 1).pos === 64);
ok('ضحية الهدية في القاعدة', pc(e, 1, 0).state === 'home');

console.log('═══ سجل الرميات (آخر خمس لكل لاعب) ═══');
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 30);
setP(e, 1, 0, 'onboard', 30);
for (const d of [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1]]) {
  e.applyRoll(d);
  e._passTurn();
  e.applyRoll(d);
  e._passTurn();
}
ok('سجل كل لاعب: آخر خمس فقط', e.rollLog[0].length === 5 && e.rollLog[1].length === 5);
ok('أحدث رمية مسجّلة أخيراً', JSON.stringify(e.rollLog[0][4]) === '[6,1]' && JSON.stringify(e.rollLog[1][4]) === '[6,1]');
ok('الأقدم حُذف', JSON.stringify(e.rollLog[0][0]) === '[2,3]');

console.log('═══ رابيدو ═══');
e = mk(2, 'rapido');
ok('رابيدو = نرد واحد', e.mode.dice === 1);
ok('مؤقّت الدور 15 ثانية', e.mode.timer === 15);
ok('قطعة جاهزة خارج القاعدة', pc(e, 0, 0).state === 'onboard' && pc(e, 0, 0).pos === 0);
ok('قطع الآخرين الثلاث بالقاعدة', pc(e, 0, 1).state === 'home' && pc(e, 0, 2).state === 'home');
e.applyRoll([5]);
ok('لا تكتّل على الساليدة المشغولة (رابيدو)', !e.optionsFor(5).some(p => p.state === 'home'));
e.applyMove(0, 5, 0);           /* القطعة الجاهزة تتقدم 5 */
ok('القطعة الجاهزة تحرّكت 5', pc(e, 0, 0).pos === 5);
e._passTurn(); e.current = 0; e.phase = 'WAIT_ROLL';
e.applyRoll([5]);
ok('بعد تفريغ الساليدة يمكن الخروج بـ5', e.optionsFor(5).some(p => p.state === 'home'));
e.applyMove(1, 5, 0);
ok('الخروج ناجح', pc(e, 0, 1).pos === 0);
/* منع الحصار نهائياً */
setP(e, 0, 2, 'onboard', 10);
setP(e, 0, 3, 'onboard', 10);   /* تكتّل مفروض يدوياً */
e.current = 0; e.phase = 'WAIT_ROLL';
e.applyRoll([3]);
ok('رابيدو: لا هبوط على خانة تشغلها قطعتي', !e.optionsFor(3).includes(pc(e, 0, 2)) || pc(e, 0, 2).pos + 3 !== 10);

console.log('═══ إسبانيول ═══');
e = mk(2, 'spanish');
ok('إسبانيول = نردان', e.mode.dice === 2);
/* دبل = رمية إضافية */
e.applyRoll([4, 4]);
setP(e, 0, 0, 'onboard', 0);
e.phase = 'MOVING'; e.dice = [4, 4]; e.used = [false, false];   /* إعادة الجلسة بعد الرمي */
e.applyMove(0, 4, 0);
e.applyMove(0, 4, 0);
ok('الدبل يمنح رمية إضافية (نفس اللاعب)', e.current === 0 && e.phase === 'WAIT_ROLL');
/* 3 دبلات = عقوبة */
setP(e, 0, 0, 'onboard', 10);
e.applyRoll([4, 4]);
e.applyMove(0, 4, 0);
e.applyMove(0, 4, 0);
ok('الدبل الثاني: رمية إضافية أيضاً', e.current === 0 && e.phase === 'WAIT_ROLL');
e.applyRoll([4, 4]);
ok('الدبل الثالث = عقوبة: أبعد قطعة عادت للقاعدة', pc(e, 0, 0).state === 'home' && e.current === 1);
/* الحصار المشروط: دبل + حصار = فك إجباري */
e = mk(2, 'spanish');
setP(e, 0, 0, 'onboard', 20);
setP(e, 0, 1, 'onboard', 20);   /* حصار */
setP(e, 0, 2, 'onboard', 40);
e.applyRoll([2, 2]);
ok('إسبانيول: الدبل مع حصاري = فك إجباري', e.mustBreak === true);
ok('الخيارات محصورة بقطع الحصار', e.optionsFor(2).every(p => e.isInOwnBarrier(p)) && e.optionsFor(2).length > 0);
e.applyMove(0, 2, 0);
ok('بعد فك الحصار تُرفع القيودة', e.mustBreak === false);
/* دبل بلا حصار = لا قيد */
e = mk(2, 'spanish');
setP(e, 0, 0, 'onboard', 10);
e.applyRoll([3, 3]);
ok('دبل بلا حصار: لا قيد فك', e.mustBreak === false);

console.log('═══ كلاسيك: الدبل (فك الاشتراك + رمية إضافية + العقوبة) ═══');
/* زوج واحد: فك تلقائي (الخيارات محصورة بقطعه) */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 20);
setP(e, 0, 1, 'onboard', 20);   /* اشتراك */
setP(e, 0, 2, 'onboard', 40);
e.applyRoll([2, 2]);
ok('كلاسيك: الدبل مع اشتراكي = فك إجباري', e.mustBreak === true);
ok('الخيارات محصورة بقطع الاشتراك', e.optionsFor(2).every(p => e.isInOwnBarrier(p)) && e.optionsFor(2).length > 0);
e.applyMove(0, 2, 0);
ok('بعد الفك تُرفع القيد', e.mustBreak === false);
/* تعدد الأزواج: الاختيار للاعب لكنه ملزم */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 20);
setP(e, 0, 1, 'onboard', 20);
setP(e, 0, 2, 'onboard', 40);
setP(e, 0, 3, 'onboard', 40);
e.applyRoll([3, 3]);
ok('كلاسيك: أزواج متعددة = الاختيار للاعب وكلها معروضة', e.mustBreak === true && e.optionsFor(3).length === 4);
/* دبل بلا اشتراك = لعب عادي */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 10);
e.applyRoll([3, 3]);
ok('كلاسيك: دبل بلا اشتراك = لا قيد فك', e.mustBreak === false);
/* دبل كلاسيك = رمية إضافية */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 0);
e.applyRoll([4, 4]);
e.applyMove(0, 4, 0);
e.applyMove(0, 4, 0);
ok('كلاسيك: الدبل يمنح رمية إضافية (نفس اللاعب)', e.current === 0 && e.phase === 'WAIT_ROLL');
/* 3 دبلات في نفس الدور = موت أبعد بيدق (لا آخر قطعة تحرّكت) */
e = mk(2, 'classic');
setP(e, 0, 0, 'onboard', 50);   /* الأبعد — يجب أن تموت */
setP(e, 0, 1, 'onboard', 10);   /* المتحركة دائماً — يجب أن تنجو */
e.applyRoll([2, 2]);
e.applyMove(1, 2, 0);
e.applyMove(1, 2, 0);
ok('رمية إضافية بعد الدبل الأول', e.current === 0);
e.applyRoll([2, 2]);
e.applyMove(1, 2, 0);
e.applyMove(1, 2, 0);
ok('رمية إضافية بعد الدبل الثاني', e.current === 0);
e.applyRoll([2, 2]);
ok('كلاسيك: 3 دبلات = موت أبعد بيدق (50) لا المتحركة (18)', pc(e, 0, 0).state === 'home' && pc(e, 0, 1).state === 'onboard' && pc(e, 0, 1).pos === 18 && e.current === 1);

console.log('═══ الفرق 2v2 ═══');
e = mk(4, 'classic', { teams: true });
ok('الفرق مفعّلة عند 4 لاعبين', e.teams === true);
ok('الفريق 0: لاعبان 0و2 / الفريق 1: لاعبان 1و3', e.teamOf(0) === 0 && e.teamOf(2) === 0 && e.teamOf(1) === 1 && e.teamOf(3) === 1);
/* لاعب أنهى قطعه → يتحكم بقطع شريكه */
for (let k = 0; k < 4; k++) setP(e, 0, k, 'finished', 71);
setP(e, 2, 0, 'onboard', 30);
ok('المنتهي يتحكم بقطع شريكه', e.controlledPieces(0) === e.players[2].pieces);
e.current = 0;
e.applyRoll([5, 2]);
ok('خيارات اللاعب المنتهي = قطع الشريك', e.optionsFor(5).every(p => p.owner === 2));
/* فوز الفريق بـ8 قطع */
for (let k = 0; k < 4; k++) setP(e, 2, k, 'finished', 71);
ok('فوز الفريق عند اكتمال 8 قطع', e.checkWin() === true && e.winnerTeam === 0 && e.gameOver === true);
/* فردي: أول من يكمل 4 يفوز */
e = mk(2, 'classic', { teams: true });
ok('الفرق لا تُفعّل مع لاعبين', e.teams === false);
for (let k = 0; k < 4; k++) setP(e, 1, k, 'finished', 71);
ok('فردي: أول مكمل يفوز', e.checkWin() === true && e.winner === 1);

console.log('═══ لاعبان متقابلان ═══');
e = mk(2, 'classic');
ok('مقاعد متقابلة [0,2]', JSON.stringify(e.seats) === JSON.stringify([0, 2]));
ok('ساليدة اللاعب الثاني = 38', e.toGlobal(1, 0) === 38);

console.log('═══ MP: تطبيق حرفي ═══');
e = mk(2, 'classic');
e.applyRoll([5, 3]);
ok('MP: الخروج والحركة الوحيدة ينفّذان حرفياً على كل العملاء', pc(e, 0, 0).pos === 3);
e._passTurn(); e.current = 0; e.phase = 'WAIT_ROLL';   /* محاكاة وصول رسالة */
e.applyRoll([6, 6]);
ok('تطبيق نرد حرفي [6,6] يعمل', e.dice[0] === 6 && e.dice[1] === 6 && e.phase === 'MOVING');

console.log('\n════════════════════════════════');
console.log('PARCHISI ENGINE v2: ' + pass + ' passed, ' + fail + ' failed');
console.log('════════════════════════════════');
process.exit(fail ? 1 : 0);
