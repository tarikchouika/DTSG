/* اختبارات الكاروم UMB (المرحلة 5) — عدّادات الوسائد 0/1/3 وصحة الكاروم */
'use strict';
const BR = require('../js/games/billiards-rules.js');

let pass = 0, fail = 0;
const ok = (m, c) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const sec = t => console.log('\n── ' + t + ' ──');

function G3(disc, target) { return BR.carom({ discipline: disc, target: target || 99 }); }
function put(G, id, x, y) { const b = G.byId(id); b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.status = 'ON_TABLE'; return b; }

sec('1) الطاولة والاختصاص الصريح (§4)');
{
  const G = G3();
  ok('الافتراضي ثلاث وسائد (need=3)', G.S.discipline === 'THREE' && G.S.need === 3);
  ok('ONE need=1 وFREE need=0', BR.carom({ discipline: 'ONE' }).S.need === 1 && BR.carom({ discipline: 'FREE' }).S.need === 0);
  ok('3 كرات فقط: بيضاء/صفراء/حمراء', G.S.balls.length === 3 &&
    !!G.byId(0) && !!G.byId('P') && !!G.byId('R'));
  ok('طاولة بلا جيوب', G.S.table.pockets.length === 0);
  ok('البيضاء للاعب 0 هي CUE', G.cue().id === 0 && G.cue().type === 'CUE');
  ok('meta = UMB_CAROM', G.meta.ruleset_id === 'UMB_CAROM' && G.meta.source_authority === 'UMB');
}

sec('2) الحرة (Libre): كاروم مباشر = نقطة واستمرار');
{
  /* قطع مباشر: بيضاء ← حمراء ← صفراء */
  const cut = G => {
    put(G, 0, 300, 280); put(G, 'R', 520, 270); put(G, 'P', 760, 310);
    return G.shootAndResolve(0.02 * Math.PI, 95);
  };
  const G = G3('FREE');
  const ev = cut(G);
  ok('كاروم حر صحيح (cush=0)', ev.carom_valid === true && ev.cushions_before_second === 0);
  ok('نقطة واستمرار الدور', ev.scored === 1 && G.S.scores[0] === 1 && G.S.active === 0);

  const G2 = G3('FREE');
  put(G2, 0, 300, 280); put(G2, 'R', 520, 270); put(G2, 'P', 760, 310);
  const ev2 = G2.shootAndResolve(-0.188 * Math.PI, 100);
  ok('كرة واحدة فقط = إخفاق ونقل الدور', ev2.carom_valid === false && ev2.second_contact === null && G2.S.active === 1);
}

sec('3) وسادة واحدة (One-Cushion)');
{
  /* وسادة واحدة قبل الثانية: صالح لـ ONE وخطأ في THREE */
  const G = G3('ONE');
  put(G, 0, 200, 280);
  const ev = G.shootAndResolve(-0.084 * Math.PI, 100);
  ok('وسادة 1 قبل الثانية = كاروم ONE (' + ev.cushions_before_second + ')', ev.carom_valid === true && ev.cushions_before_second === 1);

  const G2 = G3('ONE');
  put(G2, 0, 300, 280); put(G2, 'R', 520, 270); put(G2, 'P', 760, 310);
  const ev2 = G2.shootAndResolve(0.02 * Math.PI, 95);
  ok('كاروم مباشر بلا وسادة = إخفاق في ONE (وسائد ' + ev2.cushions_before_second + ')', ev2.carom_valid === false && ev2.second_contact === 'P' && ev2.cushions_before_second === 0);
}

sec('4) ثلاث وسائد (Three-Cushion): 0/1/2/3');
{
  const s = (ang, pow) => { const G = G3('THREE'); put(G, 0, 200, 280); return [G, G.shootAndResolve(ang, pow)]; };

  let [G, ev] = s(-0.142 * Math.PI, 74);
  ok('3 وسائد قبل الثانية = نقطة (' + ev.cushions_before_second + ')', ev.carom_valid === true && ev.cushions_before_second === 3 && G.S.scores[0] === 1);

  [G, ev] = s(-0.084 * Math.PI, 100);
  ok('وسادة واحدة لا تكفي في THREE', ev.carom_valid === false && ev.cushions_before_second === 1 && ev.second_contact === 'R');

  [G, ev] = s(-0.136 * Math.PI, 100);
  ok('وسادتان لا تكفيان في THREE (' + ev.cushions_before_second + ')', ev.carom_valid === false && ev.cushions_before_second === 2);

  [G, ev] = s(-0.068 * Math.PI, 95);
  ok('مسار طويل 5 وسائد صالح أيضاً (' + ev.cushions_before_second + ')', ev.carom_valid === true && ev.cushions_before_second >= 3);

  [G, ev] = s(Math.PI, 5);
  ok('بلا أي تماس = إخفاق (ليس خطأً)', ev.carom_valid === false && ev.first_contact === null && ev.foul === false);
}

sec('5) تبديل الكرة الخاصة وإعادة الوسم');
{
  const G = G3('THREE');
  put(G, 0, 200, 280);
  G.shootAndResolve(Math.PI, 5);           /* إخفاق */
  ok('بعد الإخفاق الدور للاعب 1', G.S.active === 1);
  ok('صفراء اللاعب 1 أصبحت CUE', G.byId('P').type === 'CUE' && G.byId(0).type === 'OBJECT');
  ok('cue() ترجع الصفراء', G.cue().id === 'P');
}

sec('6) الهدف ونهاية المباراة');
{
  const G = BR.carom({ discipline: 'ONE', target: 1 });
  put(G, 0, 200, 280);
  const ev = G.shootAndResolve(-0.084 * Math.PI, 100);
  ok('بلوغ الهدف = نهاية وفوز (' + G.S.scores + ')', ev.carom_valid && G.S.frameOver === true && G.S.winner === 0 && G.S.endReason === 'TARGET');
}

sec('7) الحتمية وحقول الأحداث (§10) والسجل');
{
  const run = () => {
    const G = G3('THREE');
    put(G, 0, 200, 280);
    G.shootAndResolve(-0.142 * Math.PI, 74);
    put(G, 0, 200, 280);
    G.shootAndResolve(Math.PI, 5);
    return JSON.stringify({ h: G.S.history, sc: G.S.scores, act: G.S.active });
  };
  ok('مدخلات متطابقة → نتائج متطابقة', run() === run());
  const G = G3('THREE'); put(G, 0, 200, 280);
  const ev = G.shootAndResolve(-0.142 * Math.PI, 74);
  const need = ['ruleset_id', 'shot_id', 'player_id', 'pocketed', 'off', 'foul', 'foul_codes',
    'scored', 'scores_after', 'discipline', 'cushions_before_second', 'cushions_needed',
    'first_contact', 'second_contact', 'carom_valid', 'frame_effect'];
  ok('حقول الحدث كاملة (§10 + كاروم)', need.every(k => k in ev));
  ok('ruleset = UMB_CAROM', ev.ruleset_id === 'UMB_CAROM');
  ok('السجل: carom وsnooker جاهزان', BR.supported('carom') === true && BR.supported('snooker') === true);
}

console.log('\n═══ UMB Carom Rules: ' + pass + '/' + (pass + fail) + ' passed ═══');
process.exit(fail ? 1 : 0);
