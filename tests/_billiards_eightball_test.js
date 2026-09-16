/* ══════════════════════════════════════════════════════════════════
   اختبار محرك قواعد WPA 8-Ball
   يشغّل BilliardsRules.eightball() الحقيقي (فيزياء + قواعد)
   التشغيل:  node tests/_billiards_eightball_test.js
   ══════════════════════════════════════════════════════════════════ */
"use strict";
const BR = require('../js/games/billiards-rules.js');
const BP = require('../js/games/billiards-physics.js');

const res = [];
const ok = (n, c) => { res.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
const sec = t => console.log('\n── ' + t + ' ──');

/* ── أدوات بناء السيناريو ── */
function newGame(o) { return BR.eightball(o || {}); }
function only(G, balls) {
  /* يُبقي البيضاء + الكرات المذكورة فقط على الطاولة */
  const keep = new Set([0].concat(balls.map(b => b.id !== undefined ? b.id : b)));
  G.S.balls.forEach(b => { if (!keep.has(b.id) && b.type !== 'CUE') b.status = 'POCKETED'; });
}
function put(G, id, x, y) { const b = G.byId(id); b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.status = 'ON_TABLE'; return b; }
function putCue(G, x, y) { const c = G.cue(); c.x = x; c.y = y; c.vx = 0; c.vy = 0; c.status = 'ON_TABLE'; G.S.phase = 'AIM'; return c; }
const ids = G => G.S.balls.filter(b => b.status === 'ON_TABLE').map(b => b.id);
const last = G => G.S.history[G.S.history.length - 1];

/* ═══ 1) الكسر الافتتاحي ═══ */
sec('1) الكسر الافتتاحي (WPA)');
{
  const G = newGame();
  const ev = G.shootAndResolve(0, 95);
  ok('الكسر قانوني (بلا أخطاء): [' + ev.foul_codes + ']', ev.foul_codes.length === 0);
  ok('علم الكسر انطفأ بعد الضربة', G.S.breakShot === false);
  ok('الحدث يحمل ruleset_id = ' + ev.ruleset_id, ev.ruleset_id === 'WPA_8BALL');
  ok('الحدث يحمل physics_version = ' + ev.physics_version, ev.physics_version === BP.PHYSICS_VERSION);

  /* كسر ضعيف جداً = ILLEGAL_BREAK */
  const G2 = newGame();
  const ev2 = G2.shootAndResolve(0, 3);
  ok('كسر ضعيف → ILLEGAL_BREAK: [' + ev2.foul_codes + ']', ev2.foul_codes.indexOf('ILLEGAL_BREAK') !== -1);
  ok('ILLEGAL_BREAK → كرة بيد للخصم (phase=' + G2.S.phase + ', active=' + G2.S.active + ')',
     G2.S.phase === 'PLACE' && G2.S.active === 1);
}

/* ═══ 2) SCRATCH في الكسر → كرة بيد خلف خط الكسر ═══ */
sec('2) SCRATCH');
{
  const G = newGame();
  /* البيضاء أمام الجيب الجانبي السفلي، ونقذفها فيه عمداً بقوة تكفي لكسر قانوني */
  putCue(G, 500, 470);
  /* نقرّب الكرة الأولى من مسارها لضمان تماس */
  const ev = G.shootAndResolve(-Math.PI / 2, 100);
  if (ev.cue_pocketed) {
    ok('البيضاء سقطت → SCRATCH مسجّل', ev.foul_codes.indexOf('SCRATCH') !== -1);
    ok('SCRATCH في الكسر → دور الخصم', G.S.active === 1);
    ok('وضع الكرة مقيّد خلف خط الكسر (x ≤ ' + G.S.table.headStringX + ')',
       G.S.placeRestriction === 'HEAD');
    ok('موضع أمام خط الكسر مرفوض (x=600)', G.validPlace(600, 250) === false);
    ok('موضع خلف خط الكسر مقبول (x=100)', G.validPlace(100, 250) === true);
    ok('place() ينفّذ الوضع وينقل إلى AIM', (G.place(100, 250), G.S.phase === 'AIM'));
  } else {
    /* لم تسقط — نبني الحالة يدوياً للتحقق من المنطق */
    ok('البيضاء سقطت → SCRATCH مسجّل', false);
  }
}

/* ═══ 3) NO_CONTACT ═══ */
sec('3) عدم ملامسة أي كرة');
{
  const G = newGame();
  G.S.breakShot = false; G.S.open = false; G.S.groups = ['SOLID', 'STRIPE'];
  putCue(G, 500, 250);
  only(G, [1]);
  put(G, 1, 500, 60);            /* بعيدة عن المسار الأفقي */
  const ev = G.shootAndResolve(0, 50);   /* أفقياً — لا تلامس شيئاً */
  ok('NO_CONTACT مسجّل: [' + ev.foul_codes + ']', ev.foul_codes.indexOf('NO_CONTACT') !== -1);
  ok('first_contact = null', ev.first_contact === null);
  ok('الدور انتقل للخصم مع كرة بيد', G.S.active === 1 && G.S.phase === 'PLACE');
}

/* ═══ 4) ILLEGAL_FIRST_CONTACT ═══ */
sec('4) ملامسة كرة خاطئة أولاً');
{
  const G = newGame();
  G.S.breakShot = false; G.S.open = false; G.S.groups = ['SOLID', 'STRIPE'];
  only(G, [9, 1]);
  putCue(G, 300, 250);
  put(G, 9, 400, 250);   /* مخططة في المسار */
  put(G, 1, 700, 250);   /* ممتلئة بعدها */
  const ev = G.shootAndResolve(0, 60);
  ok('مجموعة اللاعب SOLID لكنه لمس 9 (STRIPE) أولاً → ILLEGAL_FIRST_CONTACT: [' + ev.foul_codes + ']',
     ev.foul_codes.indexOf('ILLEGAL_FIRST_CONTACT') !== -1);
  ok('first_contact = 9', ev.first_contact === 9);
}
{
  /* طاولة مفتوحة: لمس 8 أولاً خطأ */
  const G = newGame();
  G.S.breakShot = false; G.S.open = true;
  only(G, [8, 1]);
  putCue(G, 300, 250); put(G, 8, 400, 250); put(G, 1, 700, 250);
  const ev = G.shootAndResolve(0, 60);
  ok('طاولة مفتوحة + لمس 8 أولاً → ILLEGAL_FIRST_CONTACT', ev.foul_codes.indexOf('ILLEGAL_FIRST_CONTACT') !== -1);
}

/* ═══ 5) NO_RAIL ═══ */
sec('5) لا وسادة بعد التلامس');
{
  const G = newGame();
  G.S.breakShot = false; G.S.open = false; G.S.groups = ['SOLID', 'STRIPE'];
  only(G, [2]);
  putCue(G, 400, 250); put(G, 2, 430, 250);
  const c = G.cue();
  c.vx = 6; c.vy = 0;
  G.S.rec = BP.newRec(0, 0, null);
  G.S.rec.dirX = 1; G.S.rec.dirY = 0;
  G.S.phase = 'SHOT';
  BP.runUntilStopped(G.S.table, G.S.balls, G.S.rec);
  const ev = G.resolve();
  ok('NO_RAIL مسجّل: [' + ev.foul_codes + ']', ev.foul_codes.indexOf('NO_RAIL') !== -1);
  ok('لم تسقط أي كرة (pocketed=' + ev.pocketed.length + ')', ev.pocketed.length === 0);
  ok('rail_contacts بعد التلامس = 0 (المجموع ' + ev.rail_contacts + ')', ev.rail_contacts === 0);
}

/* ═══ 6) BALL_OFF_TABLE ═══ */
sec('6) كرة خارج الطاولة');
{
  const G = newGame();
  G.S.breakShot = false;
  only(G, [3]);
  const t = G.byId(3);
  t.x = G.S.table.W + 10; t.y = 250; t.vx = 5; t.vy = 0;   /* خارجة أصلاً (قفزة) */
  putCue(G, 400, 250);
  G.S.rec = BP.newRec(0, 0, null);
  G.S.phase = 'SHOT';
  BP.runUntilStopped(G.S.table, G.S.balls, G.S.rec);
  const ev = G.resolve();
  ok('BALL_OFF_TABLE مسجّل: [' + ev.foul_codes + ']', ev.foul_codes.indexOf('BALL_OFF_TABLE') !== -1);
  ok('off_table = [3]', JSON.stringify(ev.off_table) === '[3]');
  ok('أُعيدت الكرة إلى الطاولة (spot)', G.byId(3).status === 'ON_TABLE');
}

/* ═══ 7) تعيين المجموعات ═══ */
sec('7) تعيين المجموعات (طاولة مفتوحة)');
{
  const G = newGame();
  G.S.breakShot = false; G.S.open = true;
  only(G, [1, 9]);                  /* ممتلئة واحدة + مخططة واحدة للخصم */
  putCue(G, 400, 400);
  put(G, 1, 200, 200);              /* على خط الجيب العلوي الأيسر */
  put(G, 9, 900, 100);              /* مخططة الخصم بعيدة عن المسار */
  const ev = G.shootAndResolve(Math.atan2(200 - 400, 200 - 400), 70);
  ok('دخلت الكرة 1: [' + ev.pocketed + ']', ev.pocketed.indexOf(1) !== -1);
  ok('الحدث سجّل تعيين المجموعة: 0=SOLID / 1=STRIPE',
     ev.groups[0] === 'SOLID' && ev.groups[1] === 'STRIPE');
  ok('وبما أن مجموعته نُظّفت بآخر كرة → رُقّيت إلى EIGHT (حالياً ' + G.S.groups[0] + ')',
     G.S.groups[0] === 'EIGHT' && G.S.groups[1] === 'STRIPE');
  ok('الطاولة لم تعد مفتوحة', G.S.open === false);
  ok('اللاعب يستمر لدوره (active = 0)', G.S.active === 0);
  ok('صينية الكرات الساقطة محدّثة', G.S.pocketOrder.indexOf(1) !== -1);
}
{
  /* خطأ في ضربة التعيين → تبقى الطاولة مفتوحة */
  const G = newGame();
  G.S.breakShot = false; G.S.open = true;
  only(G, [1]);
  putCue(G, 500, 250); put(G, 1, 900, 250);
  G.S.groups = [null, null];
  const ev = G.shootAndResolve(0, 3);       /* ضربة ضعيفة جداً → NO_RAIL */
  if (ev.foul) {
    ok('مع وجود خطأ تبقى الطاولة مفتوحة', G.S.open === true && G.S.groups[0] === null);
  } else {
    ok('مع وجود خطأ تبقى الطاولة مفتوحة', false);
  }
}

/* ═══ 8) انتقال الدور ═══ */
sec('8) انتقال الدور عند الإخفاق');
{
  /* طاولة مفتوحة: إدخال كرة يُعيّن المجموعة، لكن لا «استمرار» إلا بعد التعيين
     → نختبر الانتقال الصريح: مجموعة مُعيَّنة، إدخال كرة الخصم بأول تماس قانوني.
     الحل: اللاعب STRIPE ويُدخل مخططة (9) لكن أول تماس كان بممتلئة → خطأ.
     لذا نبني الحالة القانونية بدقة: أول تماس = 9 (مجموعته) وتسقط 9 → استمرار.
     ولحالة «لا استمرار»: أول تماس قانوني بمجموعته دون إدخال أي كرة. */
  /* إدخال كرة من مجموعة اللاعب → يستمر في دوره (على خط الجيب العلوي الأيسر) */
  const G = newGame();
  G.S.breakShot = false; G.S.open = false; G.S.groups = ['STRIPE', 'SOLID'];
  only(G, [9]);
  putCue(G, 400, 400);
  put(G, 9, 200, 200);    /* مخططة = مجموعته، على الخط 45° نحو الجيب (0,0) */
  const ev = G.shootAndResolve(-Math.PI * 0.75, 70);
  ok('أول تماس من مجموعته (9): [' + ev.foul_codes + ']', ev.foul_codes.length === 0 && ev.first_contact === 9);
  ok('دخلت كرته 9: [' + ev.pocketed + ']', ev.pocketed.indexOf(9) !== -1);
  ok('إدخال من مجموعته → يستمر في دوره (active=' + G.S.active + ')', G.S.active === 0 && G.S.phase === 'AIM');

  /* الآن: ضربة قانونية لا تُدخل شيئاً → الدور للخصم */
  const G2 = newGame();
  G2.S.breakShot = false; G2.S.open = false; G2.S.groups = ['STRIPE', 'SOLID'];
  only(G2, [9, 10]);
  putCue(G2, 400, 250);
  put(G2, 9, 600, 250);    /* يلمسها أفقياً */
  put(G2, 10, 600, 400);   /* لا تسقط */
  const ev2 = G2.shootAndResolve(0, 40);
  ok('ضربة قانونية بلا إدخال: [' + ev2.foul_codes + ']', ev2.foul_codes.length === 0);
  ok('لا إدخال → الدور للخصم (active=' + G2.S.active + ', phase=' + G2.S.phase + ')',
     G2.S.active === 1 && G2.S.phase === 'AIM');
}

/* ═══ 9) الفوز بالكرة 8 ═══ */
sec('9) الفوز والخسارة بالكرة 8');
{
  /* فوز قانوني: المجموعة نظيفة ثم 8 */
  const G = newGame();
  G.S.breakShot = false; G.S.open = false; G.S.groups = ['SOLID', 'STRIPE'];
  only(G, [8]);
  putCue(G, 400, 400); put(G, 8, 200, 200);
  const ev = G.shootAndResolve(Math.atan2(200 - 400, 200 - 400), 70);
  ok('إدخال 8 بعد تنظيف المجموعة → فوز اللاعب 0 (reason=' + G.S.endReason + ')',
     G.S.frameOver && G.S.winner === 0 && G.S.endReason === 'EIGHT_LEGAL');
  ok('frame_effect في الحدث', ev.frame_effect && ev.frame_effect.winner === 0);
  ok('الطور = END', G.S.phase === 'END');
}
{
  /* خسارة: 8 قبل تنظيف المجموعة */
  const G = newGame();
  G.S.breakShot = false; G.S.open = false; G.S.groups = ['SOLID', 'STRIPE'];
  only(G, [8, 1]);
  putCue(G, 400, 400); put(G, 8, 200, 200); put(G, 1, 900, 100);
  const ev = G.shootAndResolve(Math.atan2(200 - 400, 200 - 400), 70);
  ok('8 مبكرة → خسارة (reason=' + G.S.endReason + ', winner=' + G.S.winner + ')',
     G.S.frameOver && G.S.winner === 1 && G.S.endReason === 'EIGHT_EARLY');
}
{
  /* خسارة: 8 مع خطأ (SCRATCH) — البيضاء تدفع 8 إلى الجيب الجانبي العلوي ثم تتبعها */
  const G = newGame();
  G.S.breakShot = false; G.S.open = false; G.S.groups = ['SOLID', 'STRIPE'];
  only(G, [8]);
  /* البيضاء خلف 8 على الخط 45° نحو الجيب العلوي الأيسر — الاثنتان تسقطان (SCRATCH) */
  put(G, 8, 60, 60);
  const c = putCue(G, 81.2, 81.2);
  c.vx = -14; c.vy = -14;
  const eight0 = G.byId(8); eight0.vx = -14; eight0.vy = -14;
  G.S.rec = BP.newRec(0, 0, null);
  G.S.rec.dirX = -Math.SQRT1_2; G.S.rec.dirY = -Math.SQRT1_2;
  G.S.phase = 'SHOT';
  BP.runUntilStopped(G.S.table, G.S.balls, G.S.rec);
  const ev = G.resolve();
  ok('السيناريو تحقق: 8 سقطت والبيضاء معها (pocketed=' + ev.pocketed + ', cue=' + ev.cue_pocketed + ')',
     ev.pocketed.indexOf(8) !== -1 && ev.cue_pocketed);
  ok('8 + SCRATCH → خسارة (reason=' + G.S.endReason + ', winner=' + G.S.winner + ')',
     G.S.frameOver && G.S.winner === 1 && G.S.endReason === 'EIGHT_ON_FOUL');
}
{
  /* 8 في الكسر → تُعاد إلى نقطة القدم والإطار يستمر */
  const G = newGame();
  putCue(G, 250, 250);
  G.S.balls.forEach(b => { if (b.type !== 'CUE' && b.id !== 8) b.status = 'POCKETED'; });
  const eight = G.byId(8);
  eight.x = 880; eight.y = 105; eight.status = 'ON_TABLE';
  /* 8 تتدحرج بنفسها نحو الجيب العلوي الأيمن (1000,0) — ضربة كسر تُسقطها */
  const a8 = Math.atan2(0 - 105, 1000 - 880);
  eight.vx = Math.cos(a8) * 20; eight.vy = Math.sin(a8) * 20;
  G.S.rec = BP.newRec(0, 0, null);
  G.S.rec.breakShot = true;
  G.S.phase = 'SHOT';
  BP.runUntilStopped(G.S.table, G.S.balls, G.S.rec);
  const entered = G.S.rec.pocketed.some(b => b.id === 8);
  const ev = G.resolve();
  ok('السيناريو: 8 دخلت أثناء الكسر', entered);
  ok('8 في الكسر → لا نهاية للإطار', G.S.frameOver === false);
  ok('8 في الكسر → ملاحظة EIGHT_RESPOTTED_ON_BREAK', ev.notes.indexOf('EIGHT_RESPOTTED_ON_BREAK') !== -1);
  ok('أُعيدت 8 إلى الطاولة', G.byId(8).status === 'ON_TABLE');
}

/* ═══ 10) سجل الأحداث (§10) ═══ */
sec('10) سجل أحداث الضربة');
{
  const G = newGame();
  G.shootAndResolve(0, 95);
  const ev = last(G);
  const need = ['ruleset_id', 'ruleset_version', 'physics_version', 'shot_id', 'player_id',
    'first_contact', 'spin', 'pocketed', 'off_table', 'cue_pocketed', 'foul_codes',
    'frame_effect', 'next_player'];
  const missing = need.filter(k => !(k in ev));
  ok('كل حقول §10 موجودة' + (missing.length ? ' — ناقص: ' + missing : ''), missing.length === 0);
  ok('الحدث مجمّد (Object.freeze)', Object.isFrozen(ev));
  ok('قابل للتسلسل JSON (للغرف)', typeof JSON.stringify(ev) === 'string');
  ok('معرف الضربة يتصاعد', G.S._shotNo === 1);
}

/* ═══ 11) الحتمية عبر مباراة كاملة ═══ */
sec('11) حتمية مباراة كاملة');
{
  function play() {
    const G = newGame();
    const shots = [[0, 95], [0.4, 60], [1.2, 45], [2.0, 70], [0.9, 30], [3.1, 80], [1.7, 55], [0.2, 65]];
    shots.forEach((s, i) => {
      if (G.S.frameOver) return;
      if (G.S.phase === 'PLACE') G.place(G.S.table.W * 0.25, G.S.table.H / 2 + i * 3);
      if (G.S.phase === 'AIM') G.shootAndResolve(s[0], s[1]);
    });
    return { h: BP.hashState(G.S.balls), n: G.S.history.length, json: JSON.stringify(G.S.history) };
  }
  const a = play(), b = play(), c = play();
  ok('3 مباريات بمدخلات متطابقة → سجل متطابق', a.json === b.json && b.json === c.json);
  ok('وبصمة حالة متطابقة (' + a.h + ')', a.h === b.h && b.h === c.h);
  ok('عدد الضربات المسجّلة = ' + a.n, a.n > 0);
}

/* ═══ 12) وكيل AI ═══ */
sec('12) وكيل AI');
{
  const G = newGame();
  const ev1 = G.aiShot();
  ok('AI يكسر البداية دون استثناء', !!ev1);
  let guard = 0;
  while (!G.S.frameOver && guard++ < 40) {
    if (G.S.phase === 'PLACE') {
      let done = false;
      for (let x = 60; x < 900 && !done; x += 25)
        for (let y = 40; y < 470 && !done; y += 25)
          if (G.validPlace(x, y)) done = G.place(x, y);
      if (!done) break;
    }
    if (G.S.phase === 'AIM') G.aiShot();
    else break;
  }
  ok('AI لعب ' + G.S.history.length + ' ضربة دون انهيار', G.S.history.length >= 2);
  ok('لا طور عالق (phase=' + G.S.phase + ')', ['AIM', 'PLACE', 'END'].indexOf(G.S.phase) !== -1);
}

/* ═══ 13) حِمول البثّ أونلاين (المرحلة 6) ═══ */
sec('13) حِمول إعادة التشغيل');
{
  const A = newGame(), B = newGame();
  const pl = A.shotPayload(0.3, 88, { x: 0, y: 0.2 });
  A.shootAndResolve(0.3, 88, { x: 0, y: 0.2 });
  B.applyPayload(pl);
  ok('إعادة التشغيل من الحِمول تعطي نفس الحالة',
     BP.hashState(A.S.balls) === BP.hashState(B.S.balls));
  ok('ونفس سجل الأخطاء',
     JSON.stringify(last(A).foul_codes) === JSON.stringify(last(B).foul_codes));
  const pl2 = A.shotPayload(0, 0, null, { x: 100, y: 250 });
  ok('حِمول الوضع يحمل t=place', pl2.t === 'place' && pl2.x === 100);
}

/* ═══ 14) سجلّ محركات القواعد ═══ */
sec('14) سجلّ RuleSets');
ok('eightball مدعوم', BR.supported('eightball') === true);
ok('blackball+snooker+carom جاهزة (المراحل 3-5)',
   BR.RULESETS.blackball.ready === true && BR.RULESETS.snooker.ready === true && BR.RULESETS.carom.ready === true);
ok('إصدار مجموعة القواعد: ' + BR.EIGHTBALL_META.ruleset_id + ' v' + BR.EIGHTBALL_META.ruleset_version,
   typeof BR.EIGHTBALL_META.ruleset_version === 'string');

/* ═══ النتيجة ═══ */
const passed = res.filter(r => r[1]).length;
console.log('\n═══ WPA 8-Ball Rules: ' + passed + '/' + res.length + ' passed ═══');
process.exit(passed === res.length ? 0 : 1);
