/* ══════════════════════════════════════════════════════════════════
   اختبار محرك EPA International Eightball (Blackball) v2d
   يشغّل BilliardsRules.blackball() الحقيقي — كل بند مقابل نص القاعدة
   التشغيل: node tests/_billiards_blackball_test.js
   ══════════════════════════════════════════════════════════════════ */
"use strict";
const BR = require('../js/games/billiards-rules.js');
const BP = require('../js/games/billiards-physics.js');

const res = [];
const ok = (n, c) => { res.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
const sec = t => console.log('\n── ' + t + ' ──');

function newGame(o) { return BR.blackball(o || {}); }
function only(G, ids) {
  const keep = new Set([0].concat(ids));
  G.S.balls.forEach(b => { if (!keep.has(b.id) && b.type !== 'CUE') b.status = 'POCKETED'; });
}
function put(G, id, x, y) { const b = (typeof id === 'object') ? id : G.byId(id); b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.status = 'ON_TABLE'; return b; }
const RD = (G, k) => G.S.balls.filter(b => b.type === 'RED')[k];
const YL = (G, k) => G.S.balls.filter(b => b.type === 'YELLOW')[k];
function putCue(G, x, y) { const c = G.cue(); c.x = x; c.y = y; c.vx = 0; c.vy = 0; c.status = 'ON_TABLE'; G.S.phase = 'AIM'; return c; }
function startBreak(G) { if (G.S.phase === 'PLACE') G.place(150, 250); }
const last = G => G.S.history[G.S.history.length - 1];
/* سرعات مصطنعة بعد تماس حقيقي أول — الفيزياء تحاكي والمسجلة تحكم */
function runUntilContact(G, max) {
  max = max || 900;
  for (let i = 0; i < max && !G.S.rec.first; i++) BP.step(G.S.table, G.S.balls, BP.FRAME_DT, G.S.rec);
  for (let i = 0; i < 60; i++) BP.step(G.S.table, G.S.balls, BP.FRAME_DT, G.S.rec); /* انفصال ما بعد التصادم */
}
function manualRun(G) {
  G.S.rec = BP.newRec(G.S._shotNo || 0, G.S.active, null);
  G.S.rec.breakShot = G.S.breakShot;
  G.S.phase = 'SHOT';
  /* لقطة ما قبل الضربة + مسح الالتصاق كما في shoot() */
  G.S._preShot = G.S.balls.map(b => ({ id: b.id, x: b.x, y: b.y, status: b.status }));
  if (typeof G.scanContacts === 'function') G.scanContacts();
  const c = G.cue();
  const sp = Math.hypot(c.vx, c.vy) || 1;
  G.S.rec.dirX = c.vx / sp; G.S.rec.dirY = c.vy / sp;
  BP.runUntilStopped(G.S.table, G.S.balls, G.S.rec);
  return G.resolve();
}

/* ═══ 1) البداية: رفّ + وضع من الباولك (4e) ═══ */
sec('1) الرفّ والبولك');
{
  const G = newGame();
  ok('16 كرة (بيضاء + 7 ح + 7 ص + سوداء)',
     G.S.balls.length === 16 &&
     G.S.balls.filter(b => b.type === 'RED').length === 7 &&
     G.S.balls.filter(b => b.type === 'YELLOW').length === 7 &&
     G.S.balls.filter(b => b.type === 'BLACK').length === 1);
  ok('الإطار يبدأ بوضع من الباولك (phase=PLACE, BAULK)',
     G.S.phase === 'PLACE' && G.S.placeRestriction === 'BAULK');
  ok('خط الباولك عند خُمس الطول (200)', G.S.table.baulkLineX === 200);
  ok('موضع خلف الخط مقبول (x=150)', G.validPlace(150, 250));
  ok('تجاوز الخط بأكثر من نصف القطر مرفوض (x=240)', G.validPlace(240, 250) === false);
  ok('within نصف القطر فوق الخط مقبول (x=212)', G.validPlace(212, 250));
  ok('وضع ناجح ينقل إلى AIM', (G.place(150, 250), G.S.phase === 'AIM'));
}

/* ═══ 2) الكسر بالنقاط (4f/4g) ═══ */
sec('2) الكسر القانوني ≥3 نقاط');
{
  /* كسر ضعيف = صفر نقاط → إعادة رفّ */
  const G = newGame();
  G.place(150, 250);
  const ev = G.shootAndResolve(0, 4);
  ok('كسر ضعيف → illegal_break (نقاط=' + ev.break_points + ')', ev.illegal_break === true && ev.break_points < 3);
  ok('الطور RERACK (4g)', G.S.phase === 'RERACK');
  ok('اختيار الخصم أخذ الكسر → الرافع يتبدل ويعاد الرف',
     (G.chooseBreak(true), G.S.breaker === 1 && G.S.active === 1 && G.S.phase === 'PLACE' &&
      G.S.balls.filter(b => b.status === 'ON_TABLE').length === 16));
  ok('وإرجاع الكسر للأصل يعيده (4g)',
     (() => { const G2 = newGame(); G2.place(150, 250); G2.shootAndResolve(0, 4); G2.chooseBreak(false); return G2.S.breaker === 0; })());

  /* كسر قانوني: كرات خلف خط الوسط تُحتسب نقطة لكل منها (4f) */
  const G3 = newGame();
  G3.place(150, 250);
  /* ثلاثة كرات موضوعَة خلف الخط الأوسط قبل الضربة */
  put(G3, RD(G3, 0), 300, 120); put(G3, RD(G3, 1), 300, 380); put(G3, RD(G3, 2), 400, 60);
  const ev3 = G3.shootAndResolve(0, 60);
  ok('3 كرات متجاوزة للخط + لا إدخال → نقاط=3 قانوني (تجاوز=' + ev3.crossed_line + ')',
     ev3.illegal_break === false && ev3.break_points >= 3 && ev3.crossed_line >= 3);
  ok('لا إدخال → خسارة دور والخصم يلعب من حيث وقف (AIM)',
     G3.S.active === 1 && G3.S.phase === 'AIM');
  ok('المجموعات لم تُعيَّن في الكسر أبداً (4h)', G3.S.open === true && G3.S.groups[0] === null);
}

/* ═══ 3) السوداء والبيضاء في الكسر (4i/4j) ═══ */
sec('3) 4i/4j في الكسر');
{
  /* السوداء تُدخل وحدها في كسر قانوني → تعاد والسيطرة للخصم */
  const G = newGame();
  G.place(150, 250);
  const black = G.S.balls.find(b => b.type === 'BLACK');
  G.S.balls.forEach(b => { if (b.type !== 'CUE' && b !== black) b.status = 'POCKETED'; });
  put(G, black.id, 880, 105);
  const a8 = Math.atan2(0 - 105, 1000 - 880);
  black.vx = Math.cos(a8) * 20; black.vy = Math.sin(a8) * 20;
  /* كرات خلف الخط ليكتمل حدّ النقاط؛ البيضاء تلمس إحداها لمساً حقيقياً */
  put(G, RD(G, 0), 250, 250); put(G, RD(G, 1), 300, 120); put(G, RD(G, 2), 300, 380);
  const cG = G.cue(); cG.vx = 8; cG.vy = 0;
  const ev = manualRun(G);
  ok('السوداء أعيدت إلى نقطة الرفّ (4i)', G.S.balls.find(b => b.type === 'BLACK').status === 'ON_TABLE');
  ok('السوداء وحدها المُدخَلة → السيطرة للخصم (active=1)', G.S.active === 1 && G.S.phase === 'AIM');
  ok('لا نهاية إطار', G.S.frameOver === false);

  /* البيضاء تسقط في كسر قانوني → خسارة دور + كرة يد من الباولك (4j1) */
  const G2 = newGame();
  G2.place(85, 85);
  const c2 = G2.cue();
  /* البيضاء تلمس الحمراء لمساً حقيقياً ثم تتبعها إلى الجيب الركني */
  put(G2, RD(G2, 0), 65, 65);
  put(G2, RD(G2, 1), 300, 120); put(G2, RD(G2, 2), 300, 380);
  c2.vx = -16; c2.vy = -16;
  const r0 = RD(G2, 0); r0.vx = -12; r0.vy = -12;
  const ev2 = manualRun(G2);
  ok('سقوط البيضاء في الكسر ليس خطأً قياسياً (4j1): [' + ev2.foul_codes + ']', ev2.foul_codes.length === 0);
  ok('الخصم يضع من الباولك (BAULK)', G2.S.phase === 'PLACE' && G2.S.placeRestriction === 'BAULK');
  ok('موضع أمام الخط مرفوض للخصم', G2.validPlace(600, 250) === false);
}

/* ═══ 4) تعيين المجموعات (6a) ═══ */
sec('4) تعيين المجموعات بعد الكسر');
{
  const G = newGame();
  G.S.breakShot = false; G.S.open = true;
  only(G, ['Y1']);
  const yel = G.S.balls.find(b => b.type === 'YELLOW');
  putCue(G, 400, 400); put(G, yel.id, 200, 200);
  const ev = G.shootAndResolve(-Math.PI * 0.75, 70);
  ok('أول إدخال قانوني يعيّن المجموعة (6a1): اللاعب=' + ev.groups[0], ev.groups[0] === 'YELLOW' && ev.groups[1] === 'RED');
  ok('يستمر في زيارته (6b)', G.S.active === 0 && G.S.phase === 'AIM');

  /* 6a4: لوناْن معاً → أول تماس يقرّر */
  const G2 = newGame();
  G2.S.breakShot = false; G2.S.open = true;
  only(G2, []);
  const c = putCue(G2, 300, 250);
  const red = G2.S.balls.find(b => b.type === 'RED');
  const yel2 = G2.S.balls.find(b => b.type === 'YELLOW');
  put(G2, red.id, 350, 250); put(G2, yel2.id, 500, 100);
  /* تماس حقيقي بالحمراء أولاً، ثم تُدفع الكرتان لجيبين */
  c.vx = 10; c.vy = 0;
  G2.S.rec = BP.newRec(0, 0, null); G2.S.rec.dirX = 1; G2.S.rec.dirY = 0;
  G2.S.phase = 'SHOT';
  G2.S._preShot = G2.S.balls.map(b => ({ id: b.id, x: b.x, y: b.y, status: b.status }));
  G2.scanContacts();
  runUntilContact(G2);
  const aR = Math.atan2(0 - red.y, 0 - red.x);
  red.vx = Math.cos(aR) * 18; red.vy = Math.sin(aR) * 18;    /* نحو الجيب العلوي الأيسر */
  yel2.vx = 0; yel2.vy = -12;                                /* نحو الجيب الجانبي العلوي */
  BP.runUntilStopped(G2.S.table, G2.S.balls, G2.S.rec);
  const ev2 = G2.resolve();
  ok('لوناْن في ضربة واحدة → مجموعة أول تماس (6a4): ' + ev2.groups[0],
     ev2.pocketed.length === 2 && ev2.groups[0] === 'RED');

  /* 6a6: خطأ → لا تعيين */
  const G3 = newGame();
  G3.S.breakShot = false; G3.S.open = true;
  only(G3, []);
  const y3 = G3.S.balls.find(b => b.type === 'YELLOW');
  putCue(G3, 400, 400); put(G3, y3.id, 200, 200);
  const c3 = G3.cue(); c3.vx = -14; c3.vy = -14;              /* تدخل هي أيضاً */
  y3.vx = -14; y3.vy = -14;
  const ev3 = manualRun(G3);
  ok('إدخال مع SCRATCH → الطاولة تبقى مفتوحة (6a6)', G3.S.open === true && G3.S.groups[0] === null);
}

/* ═══ 5) الضربة القانونية وخسارة الدور (6b/6c/6d/6p) ═══ */
sec('5) 6b/6c/6d/6p');
{
  /* 6p: تماس بلا إدخال ولا وسادة = خطأ قياسي */
  const G = newGame();
  G.S.breakShot = false; G.S.open = false; G.S.groups = ['RED', 'YELLOW'];
  only(G, []);
  const red = G.S.balls.find(b => b.type === 'RED');
  putCue(G, 400, 250); put(G, red.id, 460, 250);
  const c = G.cue(); c.vx = 6; c.vy = 0;
  const ev = manualRun(G);
  ok('6e(12)+6p: NO_LEGAL_SHOT: [' + ev.foul_codes + ']', ev.foul_codes.indexOf('NO_LEGAL_SHOT') !== -1);
  ok('خطأ → كرة يد في أي مكان (6e)', G.S.phase === 'PLACE' && G.S.placeRestriction === 'ANY');

  /* 6d: كرته أولاً وكرّة الخصم وحدها تدخل = خسارة دور بلا خطأ */
  const G2 = newGame();
  G2.S.breakShot = false; G2.S.open = false; G2.S.groups = ['RED', 'YELLOW'];
  only(G2, []);
  const r2 = G2.S.balls.find(b => b.type === 'RED');
  const y2 = G2.S.balls.find(b => b.type === 'YELLOW');
  const c2 = putCue(G2, 300, 250);
  put(G2, r2.id, 350, 250);
  put(G2, y2.id, 500, 100);
  c2.vx = 10; c2.vy = 0;
  G2.S.rec = BP.newRec(0, 0, null); G2.S.rec.dirX = 1; G2.S.rec.dirY = 0;
  G2.S.phase = 'SHOT';
  G2.S._preShot = G2.S.balls.map(b => ({ id: b.id, x: b.x, y: b.y, status: b.status }));
  G2.scanContacts();
  runUntilContact(G2);
  r2.vx = 4; r2.vy = 3;                 /* الحمراء جانباً — لا تدخل */
  y2.vx = 0; y2.vy = -12;               /* الصفراء إلى الجيب الجانبي */
  BP.runUntilStopped(G2.S.table, G2.S.balls, G2.S.rec);
  const ev2 = G2.resolve();
  ok('6d: لا خطأ (كرته أولاً): [' + ev2.foul_codes + ']', ev2.foul_codes.length === 0);
  ok('6d: loss_of_turn معلَمة والخصم يلعب من حيث وقف (AIM)',
     ev2.loss_of_turn === true && G2.S.active === 1 && G2.S.phase === 'AIM');

  /* 6c دمج: كرته + كرة الخصم = يستمر */
  const G3 = newGame();
  G3.S.breakShot = false; G3.S.open = false; G3.S.groups = ['RED', 'YELLOW'];
  only(G3, []);
  const r3 = G3.S.balls.find(b => b.type === 'RED');
  const y3 = G3.S.balls.find(b => b.type === 'YELLOW');
  const c3 = putCue(G3, 300, 250);
  put(G3, r3.id, 350, 250);
  put(G3, y3.id, 500, 100);
  c3.vx = 10; c3.vy = 0;
  G3.S.rec = BP.newRec(0, 0, null); G3.S.rec.dirX = 1; G3.S.rec.dirY = 0;
  G3.S.phase = 'SHOT';
  G3.S._preShot = G3.S.balls.map(b => ({ id: b.id, x: b.x, y: b.y, status: b.status }));
  G3.scanContacts();
  runUntilContact(G3);
  const aR3 = Math.atan2(0 - r3.y, 0 - r3.x);
  r3.vx = Math.cos(aR3) * 18; r3.vy = Math.sin(aR3) * 18;   /* الحمراء إلى الجيب العلوي الأيسر */
  y3.vx = 0; y3.vy = -12;               /* والصفراء إلى الجيب الجانبي */
  BP.runUntilStopped(G3.S.table, G3.S.balls, G3.S.rec);
  const ev3 = G3.resolve();
  ok('6c: اللوناْن معاً بلا عقوبة ويستمر (keep)', ev3.pocketed.length === 2 && G3.S.active === 0 && G3.S.phase === 'AIM' && ev3.foul_codes.length === 0);
}

/* ═══ 6) التماس المتزامن والكرات الملتصقة (6o/6q) ═══ */
sec('6) 6o/6q');
{
  /* 6q: تماس متزامن حمراء+صفراء وأنت على الحمراء = قانوني */
  const G = newGame();
  G.S.breakShot = false; G.S.open = false; G.S.groups = ['RED', 'YELLOW'];
  only(G, []);
  const r = G.S.balls.find(b => b.type === 'RED');
  const y = G.S.balls.find(b => b.type === 'YELLOW');
  const c = putCue(G, 300, 250);
  put(G, r.id, 330, 244); put(G, y.id, 330, 256);
  c.vx = 10; c.vy = 0;
  const ev = manualRun(G);
  ok('6q: simultaneous_contact معلَمة', ev.simultaneous_contact === true);
  ok('6q: التماس المتزامن مع كرة «on» قانوني: [' + ev.foul_codes + ']', ev.foul_codes.length === 0);

  /* 6o: كرة ملتصقة — لعبٌ نحوها = خطأ */
  const G2 = newGame();
  G2.S.breakShot = false; G2.S.open = false; G2.S.groups = ['RED', 'YELLOW'];
  only(G2, []);
  const r2 = G2.S.balls.find(b => b.type === 'RED');
  const c2 = putCue(G2, 300, 250);
  put(G2, r2.id, 325, 250);   /* ملتصقة (2R) */
  c2.vx = 10; c2.vy = 0;      /* نحوها = أقل من 90° */
  const ev2 = manualRun(G2);
  ok('6o: TOUCHING_PLAY_AWAY عند اللعب نحو الملتصقة: [' + ev2.foul_codes + ']',
     ev2.foul_codes.indexOf('TOUCHING_PLAY_AWAY') !== -1);
  ok('الحدث يذكر الكرات الملتصقة', ev2.touching_balls.indexOf(r2.id) !== -1);

  /* 6o4: لعب بعيداً عنها + إدخال = قانوني والتماس مُنجَز حكماً */
  const G3 = newGame();
  G3.S.breakShot = false; G3.S.open = false; G3.S.groups = ['RED', 'YELLOW'];
  only(G3, []);
  const r3 = G3.S.balls.find(b => b.type === 'RED');
  const y3b = G3.S.balls.find(b => b.type === 'YELLOW');
  const c3 = putCue(G3, 500, 250);
  put(G3, r3.id, 525, 250);        /* ملتصقة خلف البيضاء */
  put(G3, y3b.id, 100, 250);       /* وصفراء على خط الجيب الجانبي الأيسر */
  c3.vx = -20; c3.vy = 0;          /* بعيداً عن الملتصقة — تُدخل الصفراء وتتوقف */
  const ev3 = manualRun(G3);
  ok('6o4+6p: لعب بعيداً عن الملتصقة «on» + إدخال = قانوني: [' + ev3.foul_codes + ']',
     ev3.foul_codes.length === 0 && ev3.first_contact === 'TOUCHING');
}

/* ═══ 7) الكرة الملتصقة بالوسادة (6h) ═══ */
sec('7) 6h الكرات المجمّدة');
{
  /* ملتصقة بالوسادة اليسرى، ضربها أولاً بلا مخرج = خطأ */
  const G = newGame();
  G.S.breakShot = false; G.S.open = false; G.S.groups = ['RED', 'YELLOW'];
  only(G, []);
  const r = G.S.balls.find(b => b.type === 'RED');
  put(G, r.id, G.S.table.R, 250);              /* على الوسادة اليسرى */
  const c = putCue(G, 300, 250);
  c.vx = -10; c.vy = 0;               /* تصطدم بها وترتد الحمراء لنفس الوسادة */
  const ev = manualRun(G);
  ok('6h: الكرة مجمّدة مسجّلة', ev.frozen_balls.indexOf(r.id) !== -1);
  ok('6h: بلا مخرج → FROZEN_BALL: [' + ev.foul_codes + ']', ev.foul_codes.indexOf('FROZEN_BALL') !== -1);

  /* مخرج: المجمّدة إلى وسادة مختلفة = قانوني */
  const G2 = newGame();
  G2.S.breakShot = false; G2.S.open = false; G2.S.groups = ['RED', 'YELLOW'];
  only(G2, []);
  const r2 = G2.S.balls.find(b => b.type === 'RED');
  put(G2, r2.id, G2.S.table.R, 250);
  const c2 = putCue(G2, 100, 400);
  const a = Math.atan2(250 - 400, G2.S.table.R - 100);
  c2.vx = Math.cos(a) * 14; c2.vy = Math.sin(a) * 14;   /* تدفعها نحو الوسادة العليا */
  const ev2 = manualRun(G2);
  ok('6h(c): المجمّدة إلى وسادة مختلفة → قانوني: [' + ev2.foul_codes + ']',
     ev2.foul_codes.indexOf('FROZEN_BALL') === -1);
}

/* ═══ 8) خارج الطاولة + إعادة الوضع (6l/6m) ═══ */
sec('8) 6l/6m');
{
  const G = newGame();
  G.S.breakShot = false; G.S.open = false; G.S.groups = ['RED', 'YELLOW'];
  only(G, []);
  const r = G.S.balls.find(b => b.type === 'RED');
  const y = G.S.balls.find(b => b.type === 'YELLOW');
  put(G, y.id, 1040, 250);
  const c = putCue(G, 400, 250);
  put(G, r.id, 460, 250);
  c.vx = 20; c.vy = 0;                 /* تماس حقيقي بالحمراء */
  y.vx = 20; y.vy = 0;                 /* والصفراء تُقذف خارج الطاولة */
  const ev = manualRun(G);
  ok('6l: BALL_OFF_TABLE خطأ قياسي: [' + ev.foul_codes + ']', ev.foul_codes.indexOf('BALL_OFF_TABLE') !== -1);
  const spot = G.S.table.footSpot;
  ok('6m: أعيدت قرب نقطة السوداء (' + y.x.toFixed(0) + ',' + y.y.toFixed(0) + ')',
     y.status === 'ON_TABLE' && Math.hypot(y.x - spot.x, y.y - spot.y) < 60);
}

/* ═══ 9) السوداء: خسارة الإطار والفوز (6f/7) ═══ */
sec('9) السوداء');
{
  /* طاولة مفتوحة → إدخال السوداء = خسارة إطار (6f4) */
  const G = newGame();
  G.S.breakShot = false; G.S.open = true;
  only(G, []);
  const bk = G.S.balls.find(b => b.type === 'BLACK');
  putCue(G, 400, 400); put(G, bk.id, 200, 200);
  const ev = G.shootAndResolve(-Math.PI * 0.75, 70);
  ok('سوداء مبكرة → BLACK_EARLY وخسارة إطار', G.S.frameOver && G.S.winner === 1 && G.S.endReason === 'BLACK_EARLY');
  ok('loss_of_frame معلَمة', ev.loss_of_frame === true);

  /* آخر كرة مجموعة + السوداء في نفس الضربة = خسارة (6f4) */
  const G2 = newGame();
  G2.S.breakShot = false; G2.S.open = false; G2.S.groups = ['RED', 'YELLOW'];
  only(G2, []);
  const r2 = G2.S.balls.find(b => b.type === 'RED');
  const b2 = G2.S.balls.find(b => b.type === 'BLACK');
  const c2 = putCue(G2, 500, 300);
  put(G2, r2.id, 500, 80); put(G2, b2.id, 500, 40);
  c2.vx = 0; c2.vy = -16;
  const ev2 = manualRun(G2);
  ok('آخر كرة + السوداء معاً → BLACK_EARLY (6f4): ' + G2.S.endReason,
     G2.S.frameOver && G2.S.endReason === 'BLACK_EARLY');

  /* سوداء مع خطأ = خسارة (6f3) */
  const G3 = newGame();
  G3.S.breakShot = false; G3.S.open = false; G3.S.groups = ['BLACK', 'YELLOW'];
  only(G3, []);
  const b3 = G3.S.balls.find(b => b.type === 'BLACK');
  put(G3, b3.id, 60, 60);
  const c3 = putCue(G3, 81.2, 81.2);
  c3.vx = -14; c3.vy = -14; b3.vx = -14; b3.vy = -14;
  const ev3 = manualRun(G3);
  ok('سوداء + SCRATCH → BLACK_ON_FOUL (6f3)', G3.S.frameOver && G3.S.endReason === 'BLACK_ON_FOUL' && G3.S.winner === 1);

  /* سوداء قانونية = فوز (7) */
  const G4 = newGame();
  G4.S.breakShot = false; G4.S.open = false; G4.S.groups = ['BLACK', 'YELLOW'];
  only(G4, []);
  const b4 = G4.S.balls.find(b => b.type === 'BLACK');
  putCue(G4, 400, 400); put(G4, b4.id, 200, 200);
  const ev4 = G4.shootAndResolve(-Math.PI * 0.75, 55);
  ok('سوداء قانونية بعد التنظيف → فوز (BLACK_LEGAL)', G4.S.frameOver && G4.S.winner === 0 && G4.S.endReason === 'BLACK_LEGAL');
}

/* ═══ 10) الجمود والتدخل الخارجي (6g/6i) ═══ */
sec('10) 6g/6i');
{
  const G = newGame();
  G.place(150, 250);
  const before = G.S.balls.map(b => ({ id: b.id, x: b.x, y: b.y }));
  ok('6g: جمود → إعادة رفّ ويكسر من كسر أصلاً',
     (G.declareStalemate(), G.S.breaker === G.S.originalBreaker && G.S.phase === 'PLACE' && G.S.placeRestriction === 'BAULK'));

  const G2 = newGame();
  G2.place(150, 250);
  const pre = G2.S.balls.map(b => ({ id: b.id, x: b.x, y: b.y }));
  /* ضربة جارية ثم تدخل خارجي يعيد المواضع */
  G2.shoot(0, 50, null);
  for (let i = 0; i < 40; i++) G2.stepPhysics();
  const moved = G2.S.balls.some(b => {
    const q = pre.find(x => x.id === b.id);
    return q && Math.hypot(b.x - q.x, b.y - q.y) > 1;
  });
  ok('6i: الكرات تحركت أثناء الضربة', moved);
  ok('6i: إرجاع المواضع بلا عقوبة ونفس اللاعب',
     (G2.applyOutsideInterference(), G2.S.phase === 'AIM' && G2.S.active === 0 &&
      G2.S.balls.every(b => { const q = pre.find(x => x.id === b.id); return Math.hypot(b.x - q.x, b.y - q.y) < 1e-6; })));
}

/* ═══ 11) الحتمية وسجل الأحداث ═══ */
sec('11) الحتمية والأحداث');
{
  function play() {
    const G = newGame();
    G.place(150, 250);
    const shots = [[0, 95], [0.5, 60], [1.3, 45], [2.1, 70], [0.8, 30]];
    shots.forEach(s => {
      if (G.S.frameOver) return;
      if (G.S.phase === 'PLACE') {
        for (let x = 60; x < 300; x += 20) for (let y = 40; y < 470; y += 20)
          if (G.validPlace(x, y)) { G.place(x, y); x = 9999; break; }
      }
      if (G.S.phase === 'AIM') G.shootAndResolve(s[0], s[1]);
      if (G.S.phase === 'RERACK') G.chooseBreak(true);
    });
    return { json: JSON.stringify(G.S.history), h: BP.hashState(G.S.balls) };
  }
  const a = play(), b = play(), c = play();
  ok('3 مباريات متطابقة المدخلات → سجل متطابق', a.json === b.json && b.json === c.json);
  ok('وبصمة متطابقة', a.h === b.h && b.h === c.h);

  const G = newGame();
  G.place(150, 250);
  G.shootAndResolve(0, 95);
  const ev = last(G);
  const need = ['ruleset_id', 'ruleset_version', 'break_points', 'illegal_break', 'loss_of_turn',
    'loss_of_frame', 'touching_balls', 'frozen_balls', 'simultaneous_contact', 'foul_codes', 'frame_effect', 'next_player'];
  const missing = need.filter(k => !(k in ev));
  ok('حقول الأحداث كاملة (§10 + حالات v2d)' + (missing.length ? ' — ناقص: ' + missing : ''), missing.length === 0);
  ok('ruleset = EPA_INT_8BALL v' + ev.ruleset_version, ev.ruleset_id === 'EPA_INT_8BALL' && ev.ruleset_version === '2d');
  ok('سجلّ المحركات: blackball جاهز', BR.supported('blackball') === true);
}

/* ═══ النتيجة ═══ */
const passed = res.filter(r => r[1]).length;
console.log('\n═══ EPA Blackball Rules: ' + passed + '/' + res.length + ' passed ═══');
process.exit(passed === res.length ? 0 : 1);
