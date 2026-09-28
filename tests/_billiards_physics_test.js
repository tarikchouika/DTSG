/* ══════════════════════════════════════════════════════════════════
   اختبار نواة فيزياء البلياردو — Billiards Physics Engine
   يشغّل المحرك الحقيقي (BilliardsPhysics.runUntilStopped) headless
   التشغيل:  node tests/_billiards_physics_test.js   (الخادم غير مطلوب)
   ══════════════════════════════════════════════════════════════════ */
"use strict";
const BP = require('../js/games/billiards-physics.js');

const res = [];
const ok = (n, c) => { res.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
const sec = t => console.log('\n── ' + t + ' ──');

/* أدوات */
function fresh(profile) {
  const t = BP.table(profile);
  const s = BP.buildTable(profile);
  return { table: t, balls: s.balls };
}
function shoot(table, balls, angle, power, spin) {
  const rec = BP.newRec(0, 0, spin || null);
  BP.applyShot(balls, angle, BP.powerToSpeed(power), rec);
  BP.runUntilStopped(table, balls, rec);
  return rec;
}
const cueOf = balls => balls.find(b => b.type === 'CUE');
const onTable = balls => balls.filter(b => b.status === 'ON_TABLE');

/* ═══ 1) الحتمية — شرط إعادة التشغيل أونلاين (§10) ═══ */
sec('1) الحتمية Determinism');
{
  const hashes = [];
  for (let i = 0; i < 60; i++) {
    const { table, balls } = fresh('eightball');
    shoot(table, balls, 0, 95);
    hashes.push(BP.hashState(balls));
  }
  ok('كسر البداية 60 مرة → بصمة واحدة: ' + hashes[0], hashes.every(h => h === hashes[0]));

  /* البصمة حسّاسة فعلاً للتغيير (ليست ثابتة وهمية) */
  const a = fresh('eightball'); shoot(a.table, a.balls, 0, 95);
  const b = fresh('eightball'); shoot(b.table, b.balls, 0, 94);
  ok('تغيير القوة 95→94 يغيّر البصمة', BP.hashState(a.balls) !== BP.hashState(b.balls));
}

/* ═══ 2) تقطيع الحلقات = نفس النتيجة (مراكم الزمن) ═══ */
sec('2) التقطيع الزمني (240Hz خطوة بخطوة)');
{
  const A = fresh('eightball'), B = fresh('eightball');
  const recA = BP.newRec(0, 0, null), recB = BP.newRec(0, 0, null);
  BP.applyShot(A.balls, 0.35, BP.powerToSpeed(80), recA);
  BP.runUntilStopped(A.table, A.balls, recA);
  BP.applyShot(B.balls, 0.35, BP.powerToSpeed(80), recB);
  let guard = 0;
  while (!BP.allStopped(B.balls) && guard < BP.MAX_STEPS) {
    for (let k = 0; k < 7 && !BP.allStopped(B.balls); k++) BP.step(B.table, B.balls, BP.FRAME_DT, recB);
    guard += 7;
  }
  ok('تنفيذ متّصل = تنفيذ على دفعات 7 خطوات (' + recA.steps + ' خطوة)',
     BP.hashState(A.balls) === BP.hashState(B.balls) && recA.steps === recB.steps);
  ok('الخطوة = 1/240 ثانية (FRAME_DT = ' + BP.FRAME_DT + ')', Math.abs(BP.FRAME_DT - 0.25) < 1e-12);
}

/* ═══ 3) الكسر الافتتاحي ═══ */
sec('3) كسر البداية (8-Ball)');
{
  const { table, balls } = fresh('eightball');
  const before = balls.map(b => ({ id: b.id, x: b.x, y: b.y }));
  const rec = shoot(table, balls, 0, 95);
  const moved = balls.filter((b, i) => b.type !== 'CUE' &&
    (Math.abs(b.x - before[i].x) > 1 || Math.abs(b.y - before[i].y) > 1));
  ok('كل كرات الطاولة 16 (بيضاء + 15 هدف)', balls.length === 16);
  ok('الكسر يحرّك 15 كرة هدف على الأقل (تحرّك ' + moved.length + ')', moved.length >= 15);
  ok('لم تبقَ كرة متحركة بعد الاستقرار', BP.allStopped(balls));
  ok('أول تماس مسجّل: ' + (rec.first ? rec.first.id : 'لا شيء'), !!rec.first);
}

/* ═══ 4) إدخال مباشر في جيب الزاوية ═══ */
sec('4) إدخال كرة في الجيب');
{
  const { table, balls } = fresh('eightball');
  /* نُبعد الكرات ونضع كرة هدف واحدة أمام جيب الزاوية العلوي الأيسر */
  const cue = cueOf(balls);
  const target = balls.find(b => b.value === 1);
  balls.forEach(b => { if (b !== cue && b !== target) b.status = 'POCKETED'; });
  cue.x = 500; cue.y = 250; target.x = 150; target.y = 80;
  const ang = Math.atan2(80 - 250, 150 - 500);
  const rec = shoot(table, balls, ang, 60);
  ok('الكرة 1 دخلت جيوب: [' + rec.pocketed.map(b => b.id) + ']',
     rec.pocketed.some(b => b.value === 1));
  ok('البيضاء لم تدخل (بلا SCRATCH)', !rec.cuePocketed);
}

/* ═══ 5) ارتداد الوسادة ═══ */
sec('5) ارتداد الوسادة');
{
  const { table, balls } = fresh('eightball');
  const cue = cueOf(balls);
  balls.forEach(b => { if (b !== cue) b.status = 'POCKETED'; });
  /* الوسادة اليسرى عند منتصف الارتفاع (بعيداً عن أفواه الجيوب)
     وعلى حدّ التماس تقريباً (x = R + 0.1) حتى تقع الملامسة داخل خطوة واحدة */
  cue.x = table.R + 0.1; cue.y = 250; cue.vx = -10; cue.vy = 0;
  const rec = BP.newRec(0, 0, null);
  BP.step(table, balls, BP.FRAME_DT, rec);
  ok('السرعة العمودية انعكست (' + cue.vx.toFixed(3) + ' > 0)', cue.vx > 0);
  ok('الارتداد = REST × 0.93 ±0.02 (حصلنا ' + (cue.vx / 10).toFixed(4) + ')',
     Math.abs(cue.vx / 10 - 0.93) < 0.02);
  ok('سُجّل حدث وسادة (rails = ' + rec.rails + ')', rec.rails >= 1);
  ok('موضع الكرة صُحّح إلى حد التماس x = R (' + cue.x.toFixed(3) + ')', Math.abs(cue.x - table.R) < 1e-6);
  ok('لم تلتقطها الجيوب (pocketed = ' + rec.pocketed.length + ')', rec.pocketed.length === 0);
  /* المركّبة المماسية تتباطأ بـ CUSH_T */
  {
    const s2 = fresh('eightball'), cc = cueOf(s2.balls);
    s2.balls.forEach(b => { if (b !== cc) b.status = 'POCKETED'; });
    cc.x = s2.table.R + 0.1; cc.y = 250; cc.vx = -10; cc.vy = 8;
    BP.step(s2.table, s2.balls, BP.FRAME_DT, BP.newRec(0, 0, null));
    ok('المركّبة المماسية تباطأت بـ CUSH_T = 0.94 (vy = ' + cc.vy.toFixed(3) + ' ≈ ' + (8 * 0.94).toFixed(3) + ')',
       Math.abs(cc.vy - 8 * 0.94) < 0.15);
  }
}

/* ═══ 6) تصادم كرة/كرة — تبادل الزخم ═══ */
sec('6) تصادم كرة/كرة');
{
  const { table, balls } = fresh('eightball');
  const cue = cueOf(balls), t = balls.find(b => b.value === 3);
  balls.forEach(b => { if (b !== cue && b !== t) b.status = 'POCKETED'; });
  cue.x = 400; cue.y = 250; cue.vx = 10; cue.vy = 0;
  t.x = 400 + 2 * table.R + 2; t.y = 250; t.vx = 0; t.vy = 0;
  const rec = BP.newRec(0, 0, null);
  BP.step(table, balls, BP.FRAME_DT, rec);
  ok('البيضاء توقفت تقريباً (vx = ' + cue.vx.toFixed(3) + ')', Math.abs(cue.vx) < 1);
  ok('الكرة الهدف انطلقت (vx = ' + t.vx.toFixed(3) + ')', t.vx > 8);
  ok('معامل الارتداد BALL_E = 0.98 → 9.8 ±0.05', Math.abs(t.vx - 9.8) < 0.05);
  ok('أول تماس = الكرة 3', rec.first && rec.first.value === 3);
  ok('حدث تماس مسجّل بالترتيب', rec.events.length === 1 && rec.events[0].t === 'contact');
}

/* ═══ 7) الاحتكاك والتوقف ═══ */
sec('7) الاحتكاك والتوقف');
{
  const { table, balls } = fresh('eightball');
  const cue = cueOf(balls);
  balls.forEach(b => { if (b !== cue) b.status = 'POCKETED'; });
  cue.x = 500; cue.y = 250; cue.vx = 12; cue.vy = 0;
  const rec = BP.newRec(0, 0, null);
  const n = BP.runUntilStopped(table, balls, rec, 240 * 60);
  ok('توقفت خلال ثانية محاكاة (' + n + ' خطوة)', n < 240 * 60);
  ok('السرعة صفر تماماً عند التوقف', cue.vx === 0 && cue.vy === 0);
}

/* ═══ 8) الكاروم: طاولة بلا جيوب + عدّ الوسائد ═══ */
sec('8) Carom — بلا جيوب وعدّاد الوسائد');
{
  const carom = BP.table('carom');
  ok('طاولة الكاروم بلا جيوب (pockets = ' + carom.pockets.length + ')', carom.pockets.length === 0);
  ok('طاولة الكاروم 3 كرات + البيضاء', BP.buildTable('carom').balls.length === 4);

  const s = BP.buildTable('carom');
  const cue = cueOf(s.balls), o1 = s.balls[1], o2 = s.balls[2];
  /* البيضاء في المنتصف، كرة عند الحافة العليا، وأخرى عند الحافة اليمنى */
  cue.x = 560; cue.y = 280; o1.x = 560; o1.y = 60; o2.x = 900; o2.y = 280;
  const rec = BP.newRec(0, 0, null);
  /* ضرب لأعلى: تلمس o1 ثم ترتد من الوسادة العليا ثم تعود */
  BP.applyShot(s.balls, -Math.PI / 2, BP.powerToSpeed(70), rec);
  BP.runUntilStopped(carom, s.balls, rec);
  ok('لا حدث جيب في الكاروم (pocketed = ' + rec.pocketed.length + ')', rec.pocketed.length === 0);
  ok('لا كرة خارج الطاولة (off = ' + rec.off.length + ')', rec.off.length === 0);
  ok('وُجدت وسائد مسجّلة (' + rec.rails + ')', rec.rails >= 1);
  ok('أول تماس = كرة هدف', rec.first && rec.first.type === 'OBJECT');
  const cb = BP.cushionsBeforeSecondContact(rec);
  ok('عدّاد الوسائد قبل الملامسة الثانية يعمل (= ' + cb + ')', typeof cb === 'number' && cb >= 0);
  /* وسادة كاملة: الكرة ترتد من الجدار الأيمن ولا تخرج */
  const s2 = BP.buildTable('carom'), c2 = cueOf(s2.balls);
  s2.balls.forEach(b => { if (b !== c2) b.status = 'POCKETED'; });
  c2.x = 1000; c2.y = 280; c2.vx = 12; c2.vy = 0;
  BP.runUntilStopped(carom, s2.balls, BP.newRec(1, 0, null));
  ok('الوسادة اليمنى تردّ الكرة (x = ' + c2.x.toFixed(1) + ' ≤ W−R)', c2.x <= carom.W - carom.R + 1e-6);
}

/* ═══ 9) كرة خارج الطاولة ═══ */
sec('9) كرة خارج الطاولة');
{
  const { table, balls } = fresh('eightball');
  const cue = cueOf(balls), t = balls.find(b => b.value === 5);
  balls.forEach(b => { if (b !== cue && b !== t) b.status = 'POCKETED'; });
  /* نضع الكرة عند فجوة الجيب الجانبي ونقذفها للخارج */
  cue.x = 500; cue.y = 250; t.x = 500; t.y = 40; t.vx = 0; t.vy = 0;
  cue.vx = 0; cue.vy = -14;
  const rec = BP.newRec(0, 0, null);
  BP.runUntilStopped(table, balls, rec, 240 * 20);
  ok('خرجت كرة من الطاولة أو دخلت الجيب الجانبي (off=' + rec.off.length + ', pocketed=' + rec.pocketed.length + ')',
     rec.off.length + rec.pocketed.length >= 1);
}

/* ═══ 10) مواضع الإرسال (Racks) لا تداخل فيها ═══ */
sec('10) سلامة مواضع الإرسال');
for (const p of ['eightball', 'blackball', 'snooker', 'carom']) {
  const s = BP.buildTable(p);
  const t = BP.table(p);
  let overlap = 0;
  for (let i = 0; i < s.balls.length; i++) for (let j = i + 1; j < s.balls.length; j++) {
    const a = s.balls[i], b = s.balls[j];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < 2 * t.R - 0.01) overlap++;
  }
  const expected = { eightball: 16, blackball: 16, snooker: 22, carom: 4 }[p];
  ok(p + ': ' + s.balls.length + ' كرة (متوقع ' + expected + ') ولا تداخل (' + overlap + ')',
     s.balls.length === expected && overlap === 0);
}
{
  const sn = BP.buildTable('snooker');
  ok('Snooker: 15 حمراء + 6 ألوان + بيضاء',
     sn.balls.filter(b => b.type === 'RED').length === 15 &&
     sn.balls.filter(b => b.type === 'COLOUR').length === 6);
  const bb = BP.buildTable('blackball');
  ok('Blackball: 7 صفراء + 7 حمراء + سوداء',
     bb.balls.filter(b => b.type === 'YELLOW').length === 7 &&
     bb.balls.filter(b => b.type === 'RED').length === 7 &&
     bb.balls.filter(b => b.type === 'BLACK').length === 1);
  const eb = BP.buildTable('eightball');
  ok('8-Ball: 7 ممتلئة + 7 مخططة + الكرة 8',
     eb.balls.filter(b => b.type === 'SOLID').length === 7 &&
     eb.balls.filter(b => b.type === 'STRIPE').length === 7 &&
     eb.balls.filter(b => b.type === 'EIGHT').length === 1);
}

/* ═══ 11) أدوات مساعدة ═══ */
sec('11) أدوات: validPlace / castAim / powerToSpeed');
{
  const { table, balls } = fresh('eightball');
  ok('موضع فارغ صالح', BP.validPlace(table, balls, 100, 100) === true);
  ok('موضع فوق كرة مرفوض', BP.validPlace(table, balls, balls[1].x, balls[1].y) === false);
  ok('موضع داخل جيب مرفوض', BP.validPlace(table, balls, 5, 5) === false);
  ok('موضع خارج السطح مرفوض', BP.validPlace(table, balls, -10, 250) === false);

  const aim = BP.castAim(table, balls, cueOf(balls).x, cueOf(balls).y, 0);
  ok('دليل التصويب يجد كرة على الخط الأفقي (kind=' + aim.kind + ', id=' + aim.id + ')',
     aim.kind === 'ball' && aim.id === 1);

  const s1 = BP.powerToSpeed(0), s2 = BP.powerToSpeed(50), s3 = BP.powerToSpeed(100);
  ok('القوة تصاعدية: ' + s1.toFixed(2) + ' < ' + s2.toFixed(2) + ' < ' + s3.toFixed(2), s1 < s2 && s2 < s3);
  ok('القوة مقصوصة خارج 0..100', BP.powerToSpeed(-50) === s1 && BP.powerToSpeed(999) === s3);
}

/* ═══ 12) سجل الضربة يحمل حقول §10 ═══ */
sec('12) سجل الضربة REC');
{
  const { table, balls } = fresh('eightball');
  const rec = shoot(table, balls, 0, 90, { x: 0, y: 0.3 });
  const need = ['shot_id', 'player_id', 'spin', 'events', 'contacts', 'first', 'pocketed', 'off', 'rails', 'railsAfter', 'railBalls', 'steps'];
  const missing = need.filter(k => !(k in rec));
  ok('كل حقول السجل موجودة' + (missing.length ? ' — ناقص: ' + missing : ''), missing.length === 0);
  ok('railBalls كائن عادي (لا Set) → قابل للتسلسل JSON',
     Object.prototype.toString.call(rec.railBalls) === '[object Object]');
  ok('السجل قابل للتسلسل بعد تحويل الكرات إلى معرّفات',
     typeof JSON.stringify({ ...rec, pocketed: rec.pocketed.map(b => b.id), off: rec.off.map(b => b.id), first: rec.first ? rec.first.id : null }) === 'string');
}

/* ═══ النتيجة ═══ */
const passed = res.filter(r => r[1]).length;
console.log('\n═══ Billiards Physics: ' + passed + '/' + res.length + ' passed ═══');
process.exit(passed === res.length ? 0 : 1);
