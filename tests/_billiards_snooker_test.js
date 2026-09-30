/* ══════════════════════════════════════════════════════════════════
   اختبار محرك WPBSA Snooker — يشغّل BilliardsRules.snooker() الحقيقي
   مقابل نص القواعد الرسمي (Section 3): تناوب، إعادة ألوان، عقوبات، نهاية
   التشغيل: node tests/_billiards_snooker_test.js
   ══════════════════════════════════════════════════════════════════ */
"use strict";
const BR = require('../js/games/billiards-rules.js');
const BP = require('../js/games/billiards-physics.js');

const res = [];
const ok = (n, c) => { res.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
const sec = t => console.log('\n── ' + t + ' ──');

function newGame(o) { return BR.snooker(o || {}); }
function CN(b) { return b.type === 'RED' ? 'RED' : b.group; }
function col(G, nm) { return G.S.balls.find(b => CN(b) === nm); }
function reds(G) { return G.S.balls.filter(b => b.type === 'RED'); }
function put(G, idOrB, x, y) { const b = (typeof idOrB === 'object') ? idOrB : G.byId(idOrB); b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.status = 'ON_TABLE'; return b; }
function putCue(G, x, y) { const c = G.cue(); c.x = x; c.y = y; c.vx = 0; c.vy = 0; c.status = 'ON_TABLE'; G.S.phase = 'AIM'; return c; }
function clearAll(G) { G.S.balls.forEach(b => { if (b.type !== 'CUE') b.status = 'POCKETED'; }); }
function last(G) { return G.S.history[G.S.history.length - 1]; }
function rackReds(G) {
  const t = G.S.table, R = t.R;
  const ax = t.spots.pink.x + 2 * R + 0.4, cy = t.spots.pink.y;
  const dx = R * Math.sqrt(3), dy = 2 * R + 0.6;
  let n = 0; const rs = reds(G);
  for (let row = 0; row < 5; row++) for (let k2 = 0; k2 <= row; k2++) {
    const r = rs[n++]; r.x = ax + row * dx; r.y = cy + (k2 - row / 2) * dy; r.status = 'ON_TABLE';
  }
}
function manualRun(G) {
  G.S.rec = BP.newRec(G.S._shotNo || 0, G.S.active, null);
  G.S.phase = 'SHOT';
  G.S._preShot = G.S.balls.map(b => ({ id: b.id, x: b.x, y: b.y, status: b.status }));
  BP.runUntilStopped(G.S.table, G.S.balls, G.S.rec);
  return G.resolve();
}
const TL = a => -Math.PI * 0.75; /* اتجاه الجيب العلوي الأيسر على القطر */

/* ═══ 1) الرفّ والـ D ═══ */
sec('1) الرفّ والبولك D');
{
  const G = newGame();
  ok('22 كرة: 15 حمراء + 6 ألوان + بيضاء',
     G.S.balls.length === 22 && reds(G).length === 15 &&
     ['YELLOW','GREEN','BROWN','BLUE','PINK','BLACK'].every(nm => col(G, nm)));
  ok('الألوان على بقعها الرسمية', col(G,'BLACK').x === 944 && col(G,'PINK').x === 777.75 && col(G,'BLUE').x === 518.5 && col(G,'BROWN').y === 259);
  ok('الإطار يبدأ بيدٍ داخل D (phase=PLACE)', G.S.phase === 'PLACE' && G.S.placeRestriction === 'D');
  ok('موضع داخل D مقبول (270,300)', G.validPlace(180, 300));
  ok('موضع أمام خط الباولك مرفوض (400,259)', G.validPlace(400, 259) === false);
  ok('موضع خارج قوس D مرفوض (280,120)', G.validPlace(280, 120) === false);
  ok('وضع ناجح → AIM', (G.place(180, 300), G.S.phase === 'AIM'));
}

/* ═══ 2) تناوب أحمر → لون (3f/3g) ═══ */
sec('2) تناوب أحمر → لون');
{
  const G = newGame();
  clearAll(G); rackReds(G);                 /* حُمر كاملة بلا ألوان تعترض المسارات */
  const r1 = put(G, reds(G)[0], 200, 200);
  putCue(G, 400, 400);
  const ev = G.shootAndResolve(TL(), 70);
  ok('إدخال حمراء = نقطة ويستمر (3f)', ev.scored === 1 && G.S.scores[0] === 1 && G.S.active === 0);
  ok('الطور التالي COLOUR ويجب الترشيح', G.S.turnState === 'COLOUR' && G.S.nominated === null);
  ok('ضربة بلا ترشيح مرفوضة', G.shoot(TL(), 60, null) === false);

  const bk = put(G, col(G, 'BLACK'), 200, 200);   /* تُرفع للطاولة كي تُرشّح */
  ok('ترشيح السوداء مقبول', G.nominate('BLACK') === true);
  const ev2 = G.shootAndResolve(TL(), 70);
  ok('السوداء المرشّحة = 7 نقاط (مجموع 8)', ev2.scored === 7 && G.S.scores[0] === 8);
  ok('السوداء أعيدت إلى بقعتها (3g-i)', bk.status === 'ON_TABLE' && bk.x === 944 && bk.y === 259);
  ok('العودة إلى REDS', G.S.turnState === 'REDS' && G.S.active === 0);

  /* إدخال قانوني بلا نقاط = نهاية الدور (3i) */
  const r2 = put(G, reds(G)[1], 400, 200);
  const c = G.cue(); c.x = 280; c.y = 200; c.status = 'ON_TABLE';
  const ev3 = G.shootAndResolve(0, 40);
  ok('تماس بحمراء بلا إدخال → الدور للخصم بلا نقاط',
     ev3.foul === false && ev3.scored === 0 && G.S.active === 1 && G.S.scores[0] === 8);

  /* حمراوان معاً تُحتسبان (3f): البيضاء تلمس ثالثة قانوناً وحمراوان تدخلان */
  const G2 = newGame();
  clearAll(G2);
  const q = reds(G2);
  put(G2, q[0], 400, 259); put(G2, q[1], 518.5, 200); put(G2, q[2], 200, 318);
  const cQ = putCue(G2, 300, 259);
  G2.S.rec = BP.newRec(0, 0, null);
  G2.S._preShot = G2.S.balls.map(b => ({ id: b.id, x: b.x, y: b.y, status: b.status }));
  q[1].vy = -13; q[2].vx = -12; q[2].vy = 12; cQ.vx = 12;
  G2.S.phase = 'SHOT';
  BP.runUntilStopped(G2.S.table, G2.S.balls, G2.S.rec);
  const ev4 = G2.resolve();
  ok('حمراوان في ضربة واحدة = نقطتان', ev4.scored === 2 && G2.S.scores[0] === 2 && ev4.foul === false);
}

/* ═══ 3) إعادة الألوان (7d–g) ═══ */
sec('3) إعادة الألوان');
{
  /* بقعتها مشغولة → أعلى بقعة متاحة (7d): بقعة السوداء مشغولة → الوردية */
  const G = newGame();
  clearAll(G);
  const bk = col(G, 'BLACK');
  put(G, reds(G)[0], 944, 259);           /* احتلال بقعة السوداء */
  put(G, bk, 200, 200);
  putCue(G, 400, 400);
  G.shootAndResolve(TL(), 70);
  ok('7d: السوداء لبقعة الوردية عند انشغال بقعتها', bk.x === 777.75 && bk.y === 259);

  /* كل البقع مشغولة → نحو الوسادة العليا (7f) */
  const G2 = newGame();
  clearAll(G2);
  const ys = col(G2, 'YELLOW');
  const spots = G2.S.table.spots;
  const rs = reds(G2);
  let k = 0;
  Object.values(spots).forEach(sp => put(G2, rs[k++], sp.x, sp.y));
  put(G2, ys, 518.5, 100);
  putCue(G2, 518.5, 160);
  G2.shootAndResolve(-Math.PI / 2, 70);
  ok('7f: الصفراء بين بقعتها والوسادة العليا (' + ys.x.toFixed(0) + ',' + ys.y.toFixed(0) + ')',
     ys.status === 'ON_TABLE' && ys.y === 344 && ys.x > 215);

  /* الحمراء الخارجة لا تعود (3h) */
  const G3 = newGame();
  clearAll(G3);
  const r3 = reds(G3)[0];
  r3.x = G3.S.table.W + 40; r3.y = 259; r3.status = 'ON_TABLE'; r3.vx = 5;
  const c3 = putCue(G3, 280, 259);
  G3.S.rec = BP.newRec(0, 0, null); G3.S.phase = 'SHOT';
  BP.runUntilStopped(G3.S.table, G3.S.balls, G3.S.rec);
  const ev3 = G3.resolve();
  ok('3h: حمراء خارج الطاولة تبقى خارجاً', r3.status === 'OFF_TABLE');
  ok('ولون خارج الطاولة يُعاد + عقوبة', ev3.foul === true);
}

/* ═══ 4) العقوبات 4/5/6/7 (القاعدة 10) ═══ */
sec('4) العقوبات');
{
  /* لا تماس → 4 */
  const G = newGame(); G.place(180, 300);
  const ev = G.shootAndResolve(Math.PI, 10);      /* بعيداً عن كل شيء */
  ok('10(a)(vi): لا تماس → 4 نقاط للخصم (' + ev.penalty + ')',
     ev.foul && ev.penalty === 4 && G.S.scores[1] === 4);

  /* زرقاء أولاً والحُمر on → 5 */
  const G2 = newGame();
  clearAll(G2);
  put(G2, col(G2, 'BLUE'), 400, 259);
  put(G2, reds(G2)[0], 900, 100);
  putCue(G2, 280, 259);
  const ev2 = G2.shootAndResolve(0, 50);
  ok('10(b)(iv): الزرقاء أولاً → 5 (' + ev2.penalty + ')', ev2.penalty === 5);

  /* السوداء أولاً → 7 */
  const G3 = newGame();
  clearAll(G3);
  put(G3, col(G3, 'BLACK'), 400, 259);
  put(G3, reds(G3)[0], 900, 100);
  putCue(G3, 280, 259);
  const ev3 = G3.shootAndResolve(0, 50);
  ok('السوداء أولاً → 7 (' + ev3.penalty + ')', ev3.penalty === 7);

  /* إدخال الوردية خطأً بدلاً من المرشّحة → 6 */
  const G4 = newGame();
  clearAll(G4);
  put(G4, col(G4, 'PINK'), 200, 200);
  put(G4, col(G4, 'YELLOW'), 300, 363);      /* موجودة كي تُرشّح */
  putCue(G4, 400, 400);
  G4.S.turnState = 'COLOUR';
  G4.nominate('YELLOW');
  const ev4 = G4.shootAndResolve(TL(), 70);
  ok('10(b)(iii): لون غير المرشّحة يدخل → 6 (' + ev4.penalty + ')', ev4.penalty === 6);

  /* سقوط البيضاء → 4 والحُمر on */
  const G5 = newGame();
  clearAll(G5);
  const r5 = put(G5, reds(G5)[0], 60, 60);
  const c5 = putCue(G5, 81.2, 81.2);
  c5.vx = -14; c5.vy = -14; r5.vx = -14; r5.vy = -14;
  const ev5 = manualRun(G5);
  ok('10(a)(vii): سقوط البيضاء → 4 واليد من D',
     ev5.penalty === 4 && G5.S.phase === 'PLACE' && G5.S.placeRestriction === 'D');

  /* سقوطها بعد لمس السوداء أولاً → 7 (الأعلى 11g) */
  const G6 = newGame();
  clearAll(G6);
  const b6 = put(G6, col(G6, 'BLACK'), 60, 60);
  put(G6, reds(G6)[0], 900, 100);
  const c6 = putCue(G6, 81.2, 81.2);
  c6.vx = -14; c6.vy = -14; b6.vx = -14; b6.vy = -14;
  const ev6 = manualRun(G6);
  ok('الأعلى من خطأين: 7 (' + ev6.penalty + ')', ev6.penalty === 7);

  /* تماس متزامن حمراء+وردية → الأعلى (6)؛ حمراوان → قانوني (10c) */
  const G7 = newGame();
  clearAll(G7);
  const c7 = putCue(G7, 300, 259);
  put(G7, reds(G7)[0], 330, 253);
  put(G7, col(G7, 'PINK'), 330, 265);
  c7.vx = 10; c7.vy = 0;
  const ev7 = manualRun(G7);
  ok('10(c): حمراء+وردية معاً → 6 (' + ev7.penalty + ')', ev7.penalty === 6);

  const G8 = newGame();
  clearAll(G8);
  const c8 = putCue(G8, 300, 259);
  put(G8, reds(G8)[0], 330, 253);
  put(G8, reds(G8)[1], 330, 265);
  c8.vx = 10; c8.vy = 0;
  const ev8 = manualRun(G8);
  ok('10(c): حمراوان معاً قانوني', ev8.foul === false && ev8.simultaneous_contact === true);
}

/* ═══ 5) التنظيف ونهاية الإطار (3g-iii / 4) ═══ */
sec('5) التنظيف والنهائية');
{
  const G = newGame();
  clearAll(G);
  /* الصفراء والخضراء فقط */
  col(G, 'YELLOW').status = 'ON_TABLE';
  const g = col(G, 'GREEN');
  g.status = 'ON_TABLE';
  G.S.turnState = 'CLEAR'; G.S.phase = 'AIM';

  /* خطأ الترتيب: الخضراء قبل الصفراء → عقوبة 4 ولون معاد */
  put(G, g, 200, 318);
  const cG0 = G.cue(); cG0.x = 400; cG0.y = 118; cG0.status = 'ON_TABLE';
  const ev = G.shootAndResolve(Math.PI * 0.75, 70);
  ok('ترتيب خاطئ → عقوبة (4) وإعادة اللون', ev.penalty === 4 && g.status === 'ON_TABLE');

  /* تنظيف كامل بالترتيب: كل لون وحده على قطره (clearOn يختار الأدنى) */
  let seq = ['YELLOW','GREEN','BROWN','BLUE','PINK'];
  for (const nm of seq) {
    clearAll(G);
    const b = col(G, nm);
    b.status = 'ON_TABLE';
    put(G, b, 200, 318);                      /* قطر الجيب السفلي الأيسر */
    putCue(G, 400, 118);
    G.S.turnState = 'CLEAR'; G.S.active = 0; G.S.nominated = null;
    const e = G.shootAndResolve(Math.PI * 0.75, 70);
    if (e.scored !== BR.snooker().VALUES[nm]) { console.log('    ! فشل إدخال ' + nm + ' penalty=' + e.penalty + ' fouls=' + e.foul_codes); }
  }
  ok('التصاعدي حتى الوردية: 2+3+4+5+6=20', G.S.scores[0] === 20);
  ok('الألوان المُنظّفة تبقى خارجاً', col(G, 'PINK').status === 'POCKETED');

  /* السوداء الأخيرة بفارق → نهاية إطار */
  clearAll(G);
  const bk = col(G, 'BLACK');
  bk.status = 'ON_TABLE';
  put(G, bk, 200, 318);
  putCue(G, 400, 118);
  G.S.turnState = 'CLEAR'; G.S.active = 0;
  const evB = G.shootAndResolve(Math.PI * 0.75, 70);
  ok('السوداء الأخيرة تحسم الإطار (4a)', G.S.frameOver === true && G.S.winner === 0 && G.S.endReason === 'POINTS');
}

/* ═══ 6) تعادل → سوداء معادة (4b) ═══ */
sec('6) التعادل والسوداء المعادة');
{
  const G = newGame();
  clearAll(G);
  const bk = col(G, 'BLACK');
  bk.status = 'ON_TABLE';
  /* 30-26 وخطأ على السوداء (+4) → 30-30 → تُعاد السوداء (4b) */
  G.S.scores = [33, 26];
  G.S.turnState = 'CLEAR';
  put(G, bk, 200, 200);
  putCue(G, 180, 300);
  const ev = G.shootAndResolve(Math.PI, 10);         /* لا تماس → خطأ 4 */
  ok('4b: تعادل بعد العقوبة → السوداء معادة ويد من D',
     bk.status === 'ON_TABLE' && G.S.suddenDeath === true && G.S.phase === 'PLACE' && G.S.placeRestriction === 'D');
  ok('الإطار لم يُحسم بعد والنتيجة 33-33', G.S.frameOver === false && G.S.scores[0] === 33 && G.S.scores[1] === 33);
  /* الخصم يحسم */
  G.place(180, 300);
  put(G, bk, 200, 200);
  const c6b = G.cue(); c6b.x = 400; c6b.y = 400; c6b.status = 'ON_TABLE';
  const ev2 = G.shootAndResolve(Math.PI * 1.25, 70);   /* نحو الجيب العلوي الأيسر */
  ok('أول نتيجة بعد التعادل تحسم (4b-iv)', G.S.frameOver === true && G.S.winner === 1 && G.S.scores[1] === 40);
}

/* ═══ 7) الحتمية وحقول الأحداث ═══ */
sec('7) الحتمية والأحداث');
{
  function play() {
    const G = newGame();
    G.place(180, 300);
    const shots = [[0, 90], [0.6, 55], [1.4, 40], [2.2, 65], [0.9, 30]];
    shots.forEach(s2 => {
      if (G.S.frameOver) return;
      if (G.S.phase === 'PLACE') { for (let x = 220; x <= 300; x += 8) for (let y = 180; y < 340; y += 8) if (G.validPlace(x, y)) { G.place(x, y); x = 9999; break; } }
      if (G.S.phase === 'AIM') {
        if (G.S.turnState === 'COLOUR') G.nominate('YELLOW');
        G.shootAndResolve(s2[0], s2[1]);
      }
    });
    return JSON.stringify({ h: G.S.history, sc: G.S.scores });
  }
  ok('مباراتان متطابقتا المدخلات → سجل متطابق', play() === play());

  const G = newGame();
  G.place(180, 300);
  G.shootAndResolve(0, 60);
  const ev = last(G);
  const need = ['ruleset_id', 'ball_on', 'nominated', 'penalty', 'scored', 'scores_after', 'respotted', 'turn_state_after', 'simultaneous_contact', 'frame_effect'];
  const missing = need.filter(k2 => !(k2 in ev));
  ok('حقول الأحداث كاملة (§10)' + (missing.length ? ' ناقص: ' + missing : ''), missing.length === 0);
  ok('ruleset = WPBSA_SNOOKER', ev.ruleset_id === 'WPBSA_SNOOKER');
  ok('سجلّ المحركات: snooker وcarom جاهزان (المرحلتان 4-5)',
     BR.supported('snooker') === true && BR.RULESETS.carom.ready === true);
}

const passed = res.filter(r => r[1]).length;
console.log('\n═══ WPBSA Snooker Rules: ' + passed + '/' + res.length + ' passed ═══');
process.exit(passed === res.length ? 0 : 1);
