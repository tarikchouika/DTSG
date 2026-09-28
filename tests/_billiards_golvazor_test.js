/* ══════════════════════════════════════════════════════════════════
   اختبار محرك غولڤازور (GOLVAZOR) v1.0 — قواعد مغربية على طاولة البلاكبول
   المرجع: GOLVAZOR_SPEC.md
   التشغيل: node tests/_billiards_golvazor_test.js
   ══════════════════════════════════════════════════════════════════ */
"use strict";
const BR = require('../js/games/billiards-rules.js');
const BP = require('../js/games/billiards-physics.js');

const res = [];
const ok = (n, c) => { res.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
const sec = t => console.log('\n── ' + t + ' ──');

function newGame(o) { return BR.golvazor(o || {}); }
function only(G, ids) {
  const keep = new Set([0].concat(ids));
  G.S.balls.forEach(b => { if (!keep.has(b.id) && b.type !== 'CUE') b.status = 'POCKETED'; });
}
function put(G, id, x, y) { const b = (typeof id === 'object') ? id : G.byId(id); b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.status = 'ON_TABLE'; return b; }
const RD = (G, k) => G.S.balls.filter(b => b.type === 'RED')[k];
const YL = (G, k) => G.S.balls.filter(b => b.type === 'YELLOW')[k];
const BK = G => G.S.balls.filter(b => b.type === 'BLACK')[0];
function putCue(G, x, y) { const c = G.cue(); c.x = x; c.y = y; c.vx = 0; c.vy = 0; c.status = 'ON_TABLE'; G.S.phase = 'AIM'; return c; }
function startBreak(G) { if (G.S.phase === 'PLACE') G.place(150, 250); }
const last = G => G.S.history[G.S.history.length - 1];
function setup(G, opts) {
  /* تجاوز الكسر: يعين المجموعات يدوياً ويجعل الطاولة مقفلة */
  startBreak(G);
  G.S.breakShot = false;
  G.S.open = false;
  G.S.groups = (opts && opts.groups) || ['RED', 'YELLOW'];
  G.S.active = (opts && opts.active) || 0;
  G.S.phase = 'AIM';
}
function shot(G, a, p) { return G.shootAndResolve(a, p || 40, null); }
/* ضربة مباشرة نحو هدف من مسافة قريبة */
function aimAt(G, from, to, p) {
  putCue(G, from.x, from.y);
  return shot(G, Math.atan2(to.y - from.y, to.x - from.x), p || 45);
}

/* ═══ 1) البنية والبداية ═══ */
sec('1) البنية والبداية');
{
  const G = newGame();
  ok('16 كرة كالبلاكبول (7ح+7ص+سوداء+بيضاء)',
     G.S.balls.length === 16 &&
     G.S.balls.filter(b => b.type === 'RED').length === 7 &&
     G.S.balls.filter(b => b.type === 'YELLOW').length === 7 &&
     G.S.balls.filter(b => b.type === 'BLACK').length === 1);
  ok('طاولة البلاكبول نفسها (id=blackball)', G.S.table.id === 'blackball');
  ok('الإنهاء الافتراضي ديريكت', G.S.finish === 'DIRECT');
  ok('يبدأ بوضع وراء الخط الأبيض', G.S.phase === 'PLACE' && G.S.placeRestriction === 'GV_BAULK');
  const G2 = newGame({ finish: 'BOUND', bound: 3 });
  ok('خيار بوند 3 يُسجل', G2.S.finish === 'BOUND' && G2.S.boundN === 3);
  const G3 = newGame({ finish: 'XXX' });
  ok('نوع إنهاء مجهول → ديريكت', G3.S.finish === 'DIRECT');
}

/* ═══ 2) الخطأ القياسي: ضربتان والبيضاء من مكانها ═══ */
sec('2) الخطأ = ضربتان متتاليتان والبيضاء من مكانها');
{
  const G = newGame();
  setup(G);                                   /* اللاعب 0 = أحمر */
  only(G, [RD(G, 0).id, YL(G, 0).id, BK(G).id]);
  put(G, RD(G, 0), 700, 100);
  put(G, YL(G, 0), 500, 250);
  put(G, BK(G), 700, 400);
  const ev = aimAt(G, { x: 300, y: 250 }, { x: 500, y: 250 });  /* يلمس الصفراء أولاً */
  ok('لمس كرة الخصم أولاً = خطأ OPP_FIRST', ev.foul && ev.foul_codes.includes('OPP_FIRST'));
  ok('الدور ينتقل للخصم', ev.next_player === 1);
  ok('الخصم يأخذ ضربتين', G.S.extraShots[1] === 2);
  ok('حق الضربة الحرة قائم', G.S.penaltyFree[1] === true);
  ok('البيضاء تبقى من مكانها (phase=AIM لا PLACE)', ev.next_phase === 'AIM');
}

/* ═══ 3) لمس السوداء أولاً = خطأ ═══ */
sec('3) لمس السوداء أولاً');
{
  const G = newGame();
  setup(G);
  only(G, [RD(G, 0).id, BK(G).id]);
  put(G, RD(G, 0), 700, 100);
  put(G, BK(G), 500, 250);
  const ev = aimAt(G, { x: 300, y: 250 }, { x: 500, y: 250 });
  ok('لمس السوداء أولاً = BLACK_FIRST', ev.foul && ev.foul_codes.includes('BLACK_FIRST'));
  ok('ضربتان للخصم', G.S.extraShots[1] === 2);
}

/* ═══ 4) سقوط البيضاء: كرة بيد وراء الخط الأبيض + ضربتان ═══ */
sec('4) سقوط البيضاء = وراء الخط الأبيض + ضربتان');
{
  const G = newGame();
  setup(G);
  only(G, [RD(G, 0).id, YL(G, 0).id, BK(G).id]);
  put(G, RD(G, 0), 900, 250);
  put(G, YL(G, 0), 500, 100);
  put(G, BK(G), 700, 400);
  /* تسديدة نحو الجيب العلوي الأيسر مباشرة (بلا لمس) → سكراتش + لا تماس */
  putCue(G, 60, 60);
  const ev = shot(G, Math.atan2(0 - 60, 0 - 60), 80);
  ok('سكراتش مسجل', ev.foul && ev.foul_codes.includes('SCRATCH'));
  ok('كرة بيد وراء الخط الأبيض (GV_BAULK)', G.S.phase === 'PLACE' && G.S.placeRestriction === 'GV_BAULK');
  ok('ضربتان للخصم', G.S.extraShots[1] === 2);
  ok('وضع وراء الخط مقبول (x=150)', G.validPlace(150, 250));
  ok('ملامسة الخط مرفوضة (x=195 والخط 200)', G.validPlace(195, 250) === false);
  ok('تجاوز الخط مرفوض (x=500)', G.validPlace(500, 250) === false);
}

/* ═══ 5) الضربة الحرة: لمس/إسقاط كرة الخصم في أول ضربة جزاء ═══ */
sec('5) الضربة الحرة من الجزاء');
{
  const G = newGame();
  setup(G, { active: 1 });                    /* الصفراء تلعب وتخطئ */
  only(G, [RD(G, 0).id, RD(G, 1).id, YL(G, 0).id, BK(G).id]);
  put(G, RD(G, 0), 700, 100);
  put(G, RD(G, 1), 800, 350);
  put(G, YL(G, 0), 500, 400);
  put(G, BK(G), 900, 450);
  let ev = aimAt(G, { x: 300, y: 100 }, { x: 700, y: 100 });   /* صفراء تلمس حمراء أولاً = خطأ */
  ok('خطأ الصفراء: OPP_FIRST', ev.foul && ev.foul_codes.includes('OPP_FIRST'));
  ok('اللاعب 0 يأخذ ضربتين + حق حر', G.S.extraShots[0] === 2 && G.S.penaltyFree[0] === true);
  /* الآن اللاعب 0 (أحمر) يلمس صفراء الخصم في الضربة الحرة — ليس خطأ */
  ev = aimAt(G, { x: 300, y: 400 }, { x: 500, y: 400 }, 30);
  ok('لمس كرة الخصم في الضربة الحرة ليس خطأً', !ev.foul);
  ok('الحق الحر استُهلك', G.S.penaltyFree[0] === false);
}

/* ═══ 6) عدّاد الضربتين: عدم الإسقاط يستهلك، الإسقاط يحفظ ═══ */
sec('6) عدّاد الضربتين');
{
  const G = newGame();
  setup(G, { active: 1 });
  only(G, [RD(G, 0).id, YL(G, 0).id, YL(G, 1).id, BK(G).id]);
  put(G, RD(G, 0), 700, 100);
  put(G, YL(G, 0), 500, 400);
  put(G, YL(G, 1), 800, 300);
  put(G, BK(G), 900, 450);
  aimAt(G, { x: 300, y: 100 }, { x: 700, y: 100 });   /* خطأ الصفراء */
  ok('ضربتان للأحمر', G.S.extraShots[0] === 2 && G.S.active === 0);
  /* الأحمر يضرب كرته بلا إسقاط → تبقى ضربة واحدة والدور له */
  const rd = G.byId(RD(G, 0).id);
  const ev = aimAt(G, { x: rd.x - 200, y: rd.y }, { x: rd.x, y: rd.y }, 25);
  ok('عدم الإسقاط يستهلك ضربة ويبقي الدور', !ev.foul && G.S.active === 0 && G.S.extraShots[0] === 1);
  /* ضربة ثانية بلا إسقاط → انتهى الجزاء والدور ينتقل */
  const rd2 = G.byId(RD(G, 0).id);
  const ev2 = aimAt(G, { x: rd2.x - 200, y: rd2.y + 4 }, { x: rd2.x, y: rd2.y }, 25);
  ok('الضربة الثانية بلا إسقاط تنهي الجزاء وتنقل الدور',
     !ev2.foul && ev2.loss_of_turn && G.S.active === 1 && G.S.extraShots[0] === 0);
}

/* ═══ 7) الانتحار: السوداء قبل الأوان ═══ */
sec('7) الانتحار — السوداء المبكرة');
{
  const G = newGame();
  setup(G);
  only(G, [RD(G, 0).id, BK(G).id]);
  put(G, RD(G, 0), 900, 100);
  const bk = put(G, BK(G), 40, 40);            /* السوداء قرب جيب TL */
  const ev = aimAt(G, { x: 200, y: 200 }, { x: bk.x + 3, y: bk.y + 3 }, 70);
  ok('إسقاط السوداء قبل تنظيف المجموعة = انتحار',
     ev.loss_of_frame && ev.frame_effect.reason === 'GV_SUICIDE_EARLY' && ev.frame_effect.winner === 1);
}

/* ═══ 8) الفوز الديريكت + انتحار البيضاء مع السوداء ═══ */
sec('8) الفوز الديريكت وانتحار البيضاء');
{
  let G = newGame();
  setup(G, { groups: ['BLACK', 'YELLOW'] });   /* اللاعب 0 على السوداء */
  only(G, [YL(G, 0).id, BK(G).id]);
  put(G, YL(G, 0), 900, 400);
  let bk = put(G, BK(G), 40, 40);
  let ev = aimAt(G, { x: 200, y: 200 }, { x: bk.x + 3, y: bk.y + 3 }, 70);
  ok('إسقاط السوداء في ديريكت = فوز', ev.loss_of_frame && ev.frame_effect.winner === 0 && ev.frame_effect.reason === 'GV_WIN');

  G = newGame();
  setup(G, { groups: ['BLACK', 'YELLOW'] });
  only(G, [YL(G, 0).id, BK(G).id]);
  put(G, YL(G, 0), 900, 400);
  bk = put(G, BK(G), 40, 40);
  /* البيضاء خلف السوداء مباشرة بقوة عالية نحو الجيب → الاثنتان تسقطان */
  ev = aimAt(G, { x: 80, y: 80 }, { x: bk.x, y: bk.y }, 100);
  const both = ev.loss_of_frame && ev.cue_pocketed;
  ok('البيضاء والسوداء معاً = انتحار', !both || (ev.frame_effect.winner === 1 && ev.frame_effect.reason === 'GV_SUICIDE_CUEBLACK'));
}

/* ═══ 9) ديرنيي ترو: آخر حفرة لكرة اللاعب ═══ */
sec('9) ديرنيي ترو');
{
  const G = newGame({ finish: 'DERNIER' });
  setup(G);
  only(G, [RD(G, 0).id, YL(G, 0).id, BK(G).id]);
  put(G, YL(G, 0), 900, 250);
  put(G, BK(G), 500, 250);
  const rd = put(G, RD(G, 0), 40, 40);          /* قرب TL */
  let ev = aimAt(G, { x: 200, y: 200 }, { x: rd.x + 3, y: rd.y + 3 }, 70);
  ok('سقوط آخر حمراء يسجل حفرتها (TL)', G.S.lastPocket[0] === 'TL');
  ok('اللاعب 0 ترقّى إلى السوداء', G.S.groups[0] === 'BLACK');
  /* الآن إسقاط السوداء في حفرة أخرى (BR) = انتحار */
  const bk = put(G, BK(G), 960, 460);
  ev = aimAt(G, { x: 800, y: 300 }, { x: bk.x - 2, y: bk.y - 2 }, 70);
  ok('السوداء في حفرة غير الأخيرة = انتحار GV_SUICIDE_POCKET',
     ev.loss_of_frame && ev.frame_effect.reason === 'GV_SUICIDE_POCKET' && ev.frame_effect.winner === 1);
}

/* ═══ 10) أنونص: الإعلان إلزامي والحفرة الملزمة ═══ */
sec('10) أنونص');
{
  const G = newGame({ finish: 'ANNONCE' });
  setup(G, { groups: ['BLACK', 'YELLOW'] });
  only(G, [YL(G, 0).id, BK(G).id]);
  put(G, YL(G, 0), 900, 400);
  put(G, BK(G), 40, 40);
  ok('الإعلان مطلوب قبل ضرب السوداء', G.needAnnounce() === true);
  putCue(G, 200, 200);
  ok('الضربة مرفوضة قبل الإعلان', G.shoot(0, 50, null) === false);
  ok('إعلان حفرة صحيحة يُقبل', G.nominatePocket('TL') === true);
  ok('لم يعد الإعلان مطلوباً', G.needAnnounce() === false);
  const bk = G.S.balls.filter(b => b.type === 'BLACK')[0];
  const ev = aimAt(G, { x: 200, y: 200 }, { x: bk.x + 3, y: bk.y + 3 }, 70);
  ok('إسقاط مباشر في المعلنة بلا وسادة = انتحار GV_SUICIDE_NORAIL',
     ev.loss_of_frame && ev.frame_effect.reason === 'GV_SUICIDE_NORAIL' && ev.frame_effect.winner === 1);

  /* الإنهاء القانوني في الأنونص: السوداء تلمس الوسادة العلوية ثم تدخل المعلنة (TL) */
  const GA = newGame({ finish: 'ANNONCE' });
  setup(GA, { groups: ['BLACK', 'YELLOW'] });
  only(GA, [YL(GA, 0).id, BK(GA).id]);
  put(GA, YL(GA, 0), 900, 400);
  const bkA = put(GA, BK(GA), 80, 30);          /* قرب الوسادة العلوية والزاوية TL */
  GA.nominatePocket('TL');
  const evA = aimAt(GA, { x: 300, y: 120 }, { x: bkA.x, y: bkA.y }, 50);
  ok('وسادة قبل السقوط في المعلنة = فوز GV_WIN',
     evA.loss_of_frame && evA.frame_effect.winner === 0 && evA.frame_effect.reason === 'GV_WIN');

  const G2 = newGame({ finish: 'ANNONCE' });
  setup(G2, { groups: ['BLACK', 'YELLOW'] });
  only(G2, [YL(G2, 0).id, BK(G2).id]);
  put(G2, YL(G2, 0), 900, 400);
  put(G2, BK(G2), 40, 40);
  G2.S.active = 0;
  putCue(G2, 200, 200);
  G2.nominatePocket('BR');                      /* يعلن BR لكن يسقطها في TL */
  const bk2 = G2.S.balls.filter(b => b.type === 'BLACK')[0];
  const ev2 = aimAt(G2, { x: 200, y: 200 }, { x: bk2.x + 3, y: bk2.y + 3 }, 70);
  ok('السوداء في غير الحفرة المعلنة = انتحار',
     ev2.loss_of_frame && ev2.frame_effect.reason === 'GV_SUICIDE_POCKET' && ev2.frame_effect.winner === 1);
}

/* ═══ 11) بوند: عدد ملامسات الوسائد قبل السقوط ═══ */
sec('11) بوند 2');
{
  const G = newGame({ finish: 'BOUND', bound: 2 });
  setup(G, { groups: ['BLACK', 'YELLOW'] });
  only(G, [YL(G, 0).id, BK(G).id]);
  put(G, YL(G, 0), 900, 400);
  const bk = put(G, BK(G), 40, 40);
  /* إسقاط مباشر بلا ملامسة وسائد = انتحار */
  const ev = aimAt(G, { x: 200, y: 200 }, { x: bk.x + 3, y: bk.y + 3 }, 70);
  ok('سقوط السوداء قبل اكتمال البوند = انتحار GV_SUICIDE_BOUND',
     ev.loss_of_frame && ev.frame_effect.reason === 'GV_SUICIDE_BOUND' && ev.frame_effect.winner === 1);
}

/* ═══ 12) السوداء وحيدة: إلغاء الجزاءات (إلا ديريكت) ═══ */
sec('12) إلغاء الجزاء عند السوداء الوحيدة');
{
  /* غير ديريكت: الترقية للسوداء تلغي جزاء صاحبها */
  const G = newGame({ finish: 'DERNIER' });
  setup(G, { active: 1 });
  only(G, [RD(G, 0).id, YL(G, 0).id, BK(G).id]);
  put(G, RD(G, 0), 40, 40);                     /* آخر حمراء قرب TL */
  put(G, YL(G, 0), 500, 100);
  put(G, BK(G), 900, 450);
  /* الصفراء تخطئ → الأحمر يأخذ ضربتين */
  aimAt(G, { x: 300, y: 43 }, { x: 40, y: 40 });     /* تلمس الحمراء أولاً = خطأ */
  ok('جزاء للأحمر قائم', G.S.extraShots[0] === 2);
  /* الأحمر يسقط آخر حمراء → يترقى للسوداء → جزاؤه يُلغى */
  const rd = G.byId(RD(G, 0).id);
  const ev = aimAt(G, { x: 200, y: 200 }, { x: rd.x + 3, y: rd.y + 3 }, 70);
  ok('الترقية للسوداء تلغي جزاء صاحبها (غير ديريكت)',
     G.S.groups[0] === 'BLACK' && G.S.extraShots[0] === 0);

  /* ديريكت: الجزاء يبقى */
  const G2 = newGame({ finish: 'DIRECT' });
  setup(G2, { active: 1 });
  only(G2, [RD(G2, 0).id, YL(G2, 0).id, BK(G2).id]);
  put(G2, RD(G2, 0), 40, 40);
  put(G2, YL(G2, 0), 500, 100);
  put(G2, BK(G2), 900, 450);
  aimAt(G2, { x: 300, y: 43 }, { x: 40, y: 40 });
  const rd2 = G2.byId(RD(G2, 0).id);
  aimAt(G2, { x: 200, y: 200 }, { x: rd2.x + 3, y: rd2.y + 3 }, 70);
  ok('في ديريكت يبقى الجزاء بعد الترقية', G2.S.groups[0] === 'BLACK' && G2.S.extraShots[0] > 0);

  /* ديريكت والسوداء وحيدة للطرفين: عدم اللمس والسكراتش يمنحان الجزاء */
  const G3 = newGame({ finish: 'DIRECT' });
  setup(G3, { groups: ['BLACK', 'BLACK'], active: 0 });
  only(G3, [BK(G3).id]);
  put(G3, BK(G3), 900, 250);
  /* ضربة خلفية لا تلمس شيئاً = NO_CONTACT */
  putCue(G3, 100, 250);
  const ev3 = shot(G3, Math.PI, 8);
  ok('ديريكت + سوداء وحيدة: عدم اللمس = جزاء ضربتين يبقى',
     ev3.foul && ev3.foul_codes.includes('NO_CONTACT') && G3.S.extraShots[1] === 2);
}

/* ═══ 13) المزامنة والوصف (أونلاين) ═══ */
sec('13) الوصف الحتمي للأونلاين');
{
  const G = newGame({ finish: 'ANNONCE' });
  const pl = G.shotPayload(1.2, 60, null);
  ok('وصف الضربة يحمل هوية القواعد', pl.rs === 'GOLVAZOR' && pl.t === 'shot');
  const pp = G.shotPayload(0, 0, null, { x: 150, y: 250 });
  ok('وصف الوضع يحمل الإحداثيات', pp.t === 'place' && pp.x === 150);
  const r = G.applyPayload({ t: 'place', x: 150, y: 250 });
  ok('applyPayload يضع البيضاء', r && r.placed && G.S.phase === 'AIM');
  ok('applyPayload يمرر الإعلان', (G.S.groups[0] = 'BLACK', G.S.open = false, G.applyPayload({ t: 'annp', pk: 'TR' }), G.S.annPocket[0] === 'TR'));
}

/* ═══ 14) الوكيل الآلي ═══ */
sec('14) الوكيل الآلي');
{
  const G = newGame();
  startBreak(G);
  const ev = G.aiShot();
  ok('الآلي يكسر بلا انهيار', !!ev && G.S.history.length === 1);
  let guard = 0;
  while (!G.S.frameOver && guard++ < 200) {
    if (G.S.phase === 'PLACE') {
      let done = false;
      for (let x = 40; x < 330 && !done; x += 20)
        for (let y = 30; y < 480 && !done; y += 20)
          if (G.validPlace(x, y)) done = G.place(x, y);
      if (!done) break;
    }
    if (G.S.phase === 'AIM') G.aiShot();
  }
  ok('مباراة آلي كاملة تنتهي بفائز', G.S.frameOver && (G.S.winner === 0 || G.S.winner === 1));
  const meta = last(G);
  ok('كل حدث يحمل ruleset GOLVAZOR', meta.ruleset_id === 'GOLVAZOR');
}

/* ═══ 15) لا جزاء قبل تحديد المجموعات (الطاولة المفتوحة) ═══ */
sec('15) لا جزاء قبل تحديد المجموعات');
{
  const G = newGame();
  startBreak(G);
  G.S.breakShot = false;            /* بعد الكسر والطاولة ما تزال مفتوحة */
  G.S.open = true; G.S.groups = [null, null]; G.S.phase = 'AIM';
  only(G, [RD(G, 0).id, YL(G, 0).id, BK(G).id]);
  put(G, RD(G, 0), 700, 100);
  put(G, YL(G, 0), 500, 250);
  put(G, BK(G), 700, 400);
  /* لمس كرة (أي لون مسموح والطاولة مفتوحة) وعدم إسقاط → لا خطأ أصلاً */
  let ev = aimAt(G, { x: 300, y: 250 }, { x: 500, y: 250 }, 25);
  ok('لمس أي لون والطاولة مفتوحة ليس خطأ', !ev.foul && G.S.extraShots[0] === 0 && G.S.extraShots[1] === 0);
  /* سكراتش والطاولة مفتوحة → لا جزاء إطلاقاً (بدون استثناء أي حالة) */
  const G2 = newGame();
  startBreak(G2);
  G2.S.breakShot = false; G2.S.open = true; G2.S.groups = [null, null]; G2.S.phase = 'AIM';
  only(G2, [RD(G2, 0).id, YL(G2, 0).id, BK(G2).id]);
  put(G2, RD(G2, 0), 900, 250);
  put(G2, YL(G2, 0), 500, 100);
  put(G2, BK(G2), 700, 400);
  putCue(G2, 60, 60);
  const ev2 = shot(G2, Math.atan2(-60, -60), 80);
  ok('السكراتش قبل التحديد: خطأ بلا جزاء ضربتين', ev2.foul && G2.S.extraShots[1] === 0);
  ok('لا حق حر قبل تحديد الألوان', G2.S.penaltyFree[1] === false);
  ok('الكرة بيد وراء الخط تبقى سارية', G2.S.phase === 'PLACE' && G2.S.placeRestriction === 'GV_BAULK');
  ok('ملاحظة NO_PENALTY_OPEN_TABLE مسجلة', ev2.notes.includes('NO_PENALTY_OPEN_TABLE'));
  /* عدم اللمس والطاولة مفتوحة → لا جزاء أيضاً */
  const G3 = newGame();
  startBreak(G3);
  G3.S.breakShot = false; G3.S.open = true; G3.S.groups = [null, null]; G3.S.phase = 'AIM';
  only(G3, [RD(G3, 0).id, BK(G3).id]);
  put(G3, RD(G3, 0), 900, 250);
  put(G3, BK(G3), 700, 400);
  putCue(G3, 100, 250);
  const ev3 = shot(G3, Math.PI, 8);
  ok('عدم اللمس قبل التحديد: خطأ بلا جزاء ضربتين',
     ev3.foul && ev3.foul_codes.includes('NO_CONTACT') && G3.S.extraShots[1] === 0);
}

/* ═══ 16) الكسر: السوداء وحدها = فوز ساحق / مع غيرها = انتحار ═══ */
sec('16) السوداء في الكسر');
{
  /* السوداء وحدها في الكسر = فوز ساحق */
  const G = newGame();
  startBreak(G);
  only(G, [BK(G).id, RD(G, 0).id]);          /* حمراء بعيدة لضمان التماس فقط */
  put(G, RD(G, 0), 900, 460);
  const bk = put(G, BK(G), 40, 40);
  const ev = aimAt(G, { x: 200, y: 200 }, { x: bk.x + 3, y: bk.y + 3 }, 70);
  ok('السوداء وحدها في الكسر = فوز ساحق GV_WIN_BREAK',
     ev.loss_of_frame && ev.frame_effect.winner === 0 && ev.frame_effect.reason === 'GV_WIN_BREAK');

  /* السوداء + كرة ملونة في الكسر = انتحار */
  const G2 = newGame();
  startBreak(G2);
  only(G2, [BK(G2).id, RD(G2, 0).id, YL(G2, 0).id]);
  const bk2 = put(G2, BK(G2), 40, 40);
  put(G2, RD(G2, 0), 42, 90);                 /* حمراء قرب جيب TL أيضاً */
  put(G2, YL(G2, 0), 900, 460);
  const ev2 = aimAt(G2, { x: 200, y: 230 }, { x: bk2.x + 4, y: bk2.y + 12 }, 95);
  const bothFell = ev2.pocketed.length >= 2 && ev2.frame_effect;
  ok('السوداء + ملونة في الكسر = انتحار (إن سقطتا معاً)',
     !bothFell || (ev2.frame_effect.winner === 1 && ev2.frame_effect.reason === 'GV_SUICIDE_EARLY'));
}

/* ═══ 17) كسر بلونين مختلفين = حق الاختيار بالنقر ═══ */
sec('17) كسر بلونين = حق الاختيار');
{
  const G = newGame();
  startBreak(G);
  only(G, [RD(G, 0).id, RD(G, 1).id, YL(G, 0).id, YL(G, 1).id, BK(G).id]);
  put(G, RD(G, 0), 40, 40);                   /* حمراء قرب TL */
  put(G, YL(G, 0), 40, 460);                  /* صفراء قرب BL */
  put(G, RD(G, 1), 900, 100);
  put(G, YL(G, 1), 900, 400);
  put(G, BK(G), 720, 250);
  /* محاكاة يدوية: نسقط الحمراء والصفراء معاً في ضربة كسر */
  putCue(G, 150, 250);
  G.S.rec = BP.newRec(0, 0, null);
  G.S.rec.breakShot = true;
  G.S.phase = 'SHOT';
  G.S._preShot = G.S.balls.map(b => ({ id: b.id, x: b.x, y: b.y, status: b.status }));
  const c = G.cue();
  /* البيضاء تلمس الحمراء القريبة ثم نُسقط اللونين يدوياً في المحاكاة */
  c.vx = -8; c.vy = -8;
  G.S.rec.dirX = -0.707; G.S.rec.dirY = -0.707;
  BP.runUntilStopped(G.S.table, G.S.balls, G.S.rec);
  /* إن لم تسقطا طبيعياً نحقنهما في السجل */
  const rd0 = G.byId(RD(G, 0).id), yl0 = G.byId(YL(G, 0).id);
  if (rd0.status === 'ON_TABLE') { rd0.status = 'POCKETED'; rd0.pocket = 'TL'; G.S.rec.pocketed.push(rd0); }
  if (yl0.status === 'ON_TABLE') { yl0.status = 'POCKETED'; yl0.pocket = 'BL'; G.S.rec.pocketed.push(yl0); }
  if (!G.S.rec.first) G.S.rec.first = rd0;
  const ev = G.resolve();
  ok('كسر بلونين يفعّل حق الاختيار', ev.await_choice === true && G.needChoice());
  ok('اللاعب الكاسر يواصل (لا انتقال دور)', G.S.active === 0 && ev.next_phase === 'AIM');
  ok('الضربة مرفوضة قبل الاختيار', G.shoot(0, 50, null) === false);
  ok('اختيار غير صالح مرفوض', G.chooseGroup('BLACK') === false);
  ok('اختيار الأصفر يُقبل ويُقفل الطاولة',
     G.chooseGroup('YELLOW') === true && G.S.groups[0] === 'YELLOW' && G.S.groups[1] === 'RED' && !G.S.open);
  ok('لم يعد الاختيار مطلوباً والضربة مسموحة', !G.needChoice());
  ok('وصف grp يعمل للأونلاين', (function () {
    const G3 = newGame();
    startBreak(G3);
    G3.S.awaitChoice = true; G3.S.breakShot = false;
    G3.applyPayload({ t: 'grp', g: 'RED' });
    return G3.S.groups[0] === 'RED' && !G3.S.awaitChoice;
  })());
}

/* ═══ النتيجة ═══ */
const pass = res.filter(r => r[1]).length;
console.log('\n══════════ %d/%d ══════════', pass, res.length);
if (pass !== res.length) { console.log('FAILED:', res.filter(r => !r[1]).map(r => r[0])); process.exit(1); }
