/* [v2.64 Room E2E] غرفة بينالتي بنظام البلياردو: 3 تسديدات لكل لاعب تُحدد قبل
   الجولة + اختيار أعمى متزامن + تسوية القدح + تصويت «مباراة جديدة» مع
   انتقال الأدوار (لاعب↔متفرج) — بنفس مسار البلياردو
   (rematch/start + vote + tryResolveRematch).
   استراتيجية حتمية: A (المقعد 0) يختار 🎯 دائماً؛ B (المقعد 1) يختار 🎯
   في التسديدات الفردية (يسدد عليها A فتُصدّ) و⬆️ في الزوجية (يسجل لأن A
   يحرس 🎯) → النتيجة الحتمية 0-3 لصالح B بعد 6 تسديدات بالضبط.
   تشغيل: DM_TEST_MODE=1 · node tests/_pn_room_v264_test.js */
'use strict';
process.chdir(require('path').resolve(__dirname, '..'));
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.env.PNPORT || '3117') + '/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t, label) {
  const s = Date.now(); let e;
  while (Date.now() - s < t) {
    try { const r = await p.evaluate(fn); if (r) return r; } catch (x) { e = x; }
    await p.waitForTimeout(200);
  }
  throw new Error('timeout [' + label + '] ' + (e ? e.message : ''));
}
let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } console.log((c ? '  ✅ ' : '  ❌ ') + n); };

(async () => {
  const tag = Date.now().toString().slice(-6);
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  async function mkPlayer(name, vp) {
    const ctx = await b.newContext({ viewport: vp });
    await ctx.request.post(BASE + 'api/register', { data: { username: name + tag, password: 'pw123456' } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message.slice(0, 90)));
    p._er = errs;
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user), 10000, name + ' auth');
    return p;
  }

  console.log('═══ 1) الغرفة: إعداد 3 تسديدات لكل لاعب قبل بدء الجولة ═══');
  const A = await mkPlayer('pna', { width: 390, height: 780, isMobile: true, hasTouch: true });
  const B = await mkPlayer('pnb', { width: 390, height: 780, isMobile: true, hasTouch: true });
  await A.evaluate(() => openGame('pn'));
  await wait(A, () => !!document.querySelector('.pn-fs'), 8000, 'A pn');
  await A.evaluate(() => Rooms.createRoom('pn', { bet: 100, visibility: 'public', game_opts: { rounds: 3 } }));
  await sleep(700);
  const code = await A.evaluate(() => (Rooms.state && Rooms.state.code) || null);
  ok(!!code, 'غرفة pn برهان 100 + rounds=3 (تُحدد قبل الجولة)');
  await B.evaluate(() => openGame('pn'));
  await wait(B, () => !!document.querySelector('.pn-fs'), 8000, 'B pn');
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await sleep(900);

  /* متفرج ثالث */
  const C = await mkPlayer('pnc', { width: 390, height: 780, isMobile: true, hasTouch: true });
  await C.evaluate(() => openGame('pn'));
  await wait(C, () => !!document.querySelector('.pn-fs'), 8000, 'C pn');
  await C.evaluate((c) => Rooms.joinRoom(c), code);
  await sleep(900);

  console.log('═══ 2) الشريط العلوي: حلقات المتفرجين + رقاقة القدح (بلا عبارات) ═══');
  const topA = await A.evaluate(() => {
    return {
      specs: document.getElementById('pnSpecs').textContent.trim(),
      specRings: document.querySelectorAll('#pnSpecs .pn-ring').length,
      bet: document.getElementById('pnBet').textContent.trim(),
      turn: !!document.getElementById('pnTurn')
    };
  });
  ok(topA.specRings >= 1 && !/متفرج|Spectat/i.test(topA.specs), 'متفرج واحد = حلقة أحرف أولى بلا أي عبارة (حلقات=' + topA.specRings + ')');
  ok(topA.bet === '200', 'رقاقة القدح رقم فقط: «' + topA.bet + '» (بلا عبارة)');
  ok(!topA.turn, 'لا شريط نص دور إطلاقاً');

  console.log('═══ 3) حلقات الأحرف الأولى للمقاعد ═══');
  const rings = await A.evaluate(() => ({
    i0: document.getElementById('pnIni0').textContent,
    i1: document.getElementById('pnIni1').textContent
  }));
  ok(rings.i0.length === 2 && rings.i1.length === 2, 'حلقتا المقعدَين بأول حرفين (' + rings.i0 + '/' + rings.i1 + ')');

  console.log('═══ 4) المباراة الحتمية 0-3: تبادل مسدد/متصدي + كشف أعمى ═══');
  const goldBefore = await Promise.all([A, B].map(p => p.evaluate(() => AUTH.user.gold)));
  await A.evaluate(() => Rooms.startGame());
  await wait(A, () => window.pnRoom && Rooms.state.status === 'playing' && !window.pnBusy, 8000, 'A playing');
  await wait(B, () => window.pnRoom && Rooms.state.status === 'playing' && !window.pnBusy, 8000, 'B playing');
  ok(true, 'الجولة بدأت (خصم الرهان خادمياً 100+100)');

  let shot = 0;
  for (;;) {
    const st = await A.evaluate(() => window.pnRoom && { over: pnRoom.over, s: pnRoom.shot, g: pnRoom.seatGoals.join('-') });
    if (!st || st.over) break;
    if (shot > 20) { ok(false, 'المباراة لا تنتهي'); break; }
    /* كلا الطرفين جاهز قبل الاختيار (لا اختيار أثناء السينما) */
    await Promise.all([A, B].map(p => wait(p, () => window.pnRoom && !window.pnRoom.waiting && !window.pnBusy && !pnRoom.over, 20000, 'ready ' + st.s)));
    const bDir = await B.evaluate(() => (pnRoom.shot % 2 === 1) ? '🎯' : '⬆️');
    await Promise.all([
      A.evaluate(() => penShoot('🎯')),
      B.evaluate((d) => penShoot(d), bDir)
    ]);
    shot++;
    await Promise.all([A, B].map(p => wait(p, () => { const ball = document.getElementById('pnBall'); return (window.pnRoom && pnRoom.over) || (ball && ball.className === 'pn-ball' && !window.pnBusy); }, 25000, 'shot ' + shot + ' reset')));
    await sleep(200);
  }
  const finA = await A.evaluate(() => window.pnRoom && { over: pnRoom.over, s: pnRoom.shot, g: pnRoom.seatGoals.join('-'), n: [pnRoom.seatShots[0].length, pnRoom.seatShots[1].length] });
  ok(finA.over, 'المباراة انتهت (تسديدات: ' + (finA.s - 1) + ')');
  ok(finA.g === '0-3', 'النتيجة الحتمية 0-3 لصالح المقعد 1 (فعلية: ' + finA.g + ')');
  ok(finA.n[0] === 3 && finA.n[1] === 3, 'كل لاعب سدد 3 بالضبط — بلا موت فجائي (' + finA.n[0] + '/' + finA.n[1] + ')');
  ok((finA.s - 1) === 6, 'انتهت بعد 6 تسديدات (زوجان مكتملان × 3)');

  console.log('═══ 5) لوحة التصويت (نظام البلياردو) بعد نهاية المباراة ═══');
  await sleep(1500);
  const rmA = await A.evaluate(() => {
    const host = document.getElementById('pnRematch');
    return { hidden: host.hidden, hasTitle: host.innerHTML.includes('pn-rm-title'), rows: host.querySelectorAll('.pn-rm-row').length, state: (Rooms.state.rematch ? 'active' : 'none') };
  });
  ok(!rmA.hidden && rmA.hasTitle, 'لوحة تصويت «مباراة جديدة؟» ظهرت تلقائياً عند النهاية');
  ok(rmA.rows === 2, 'صفّا اللاعبَين (حلقة + علامة صوت)');
  ok(rmA.state === 'active', 'التصويت نشط خادمياً (rematch/start من المضيف)');
  const rmB = await B.evaluate(() => {
    const host = document.getElementById('pnRematch');
    return { btns: host.querySelectorAll('.pn-rm-btn').length, rows: host.querySelectorAll('.pn-rm-row').length };
  });
  ok(rmB.btns === 2 && rmB.rows === 2, 'الخصم يرى صفّيه وزرّي موافقة/رفض');
  const rmC = await C.evaluate(() => {
    const host = document.getElementById('pnRematch');
    return { btns: host.querySelectorAll('.pn-rm-btn').length, hasNote: !!host.querySelector('.pn-rm-note') };
  });
  ok(rmC.btns === 0 && rmC.hasNote, 'المتفرج بلا أزرار — بانتظار تصويت اللاعبين (دوره: متفرج)');

  console.log('═══ 6) التسوية: الفائز (المقعد 1 = B) يأخذ 195 ═══');
  await sleep(700);
  const goldAfter = await Promise.all([A, B].map(p => p.evaluate(() => AUTH.user.gold)));
  ok(goldAfter[0] === goldBefore[0] - 100, 'الخاسر A خسر رهانه (Δ=' + (goldAfter[0] - goldBefore[0]) + ')');
  ok(goldAfter[1] === goldBefore[1] + 95, 'الفائز B ربح 95 صافياً (200-5% ثم -100: Δ=' + (goldAfter[1] - goldBefore[1]) + ')');

  console.log('═══ 7) التصويت: موافقة الاثنين → مباراة جديدة نظيفة ═══');
  await B.evaluate(() => Rooms.voteRematch('agree'));
  await sleep(600);
  const midA = await A.evaluate(() => Array.from(document.querySelectorAll('#pnRematch .pn-rm-mark')).map(e => e.textContent).join('|'));
  ok(midA.includes('✅') && midA.includes('⏳'), 'صوت B ظهر (✅) وA بانتظار (⏳): ' + midA);
  await A.evaluate(() => Rooms.voteRematch('agree'));
  await Promise.all([A, B].map(p => wait(p, () => window.pnRoom && Rooms.state.status === 'playing' && pnRoom.shot === 1 && document.getElementById('pnRematch').hidden, 10000, 'new match')));
  ok(true, 'اتفاق الطرفين → مباراة جديدة انطلقت فوراً (الموافقان لاعبان — انتقال الأدوار)');
  const fresh = await A.evaluate(() => ({ g: window.pnRoom.seatGoals.join('-'), sc: document.getElementById('pnSc0').textContent, seq: document.getElementById('pnSeq0').textContent }));
  ok(fresh.g === '0-0' && fresh.sc === '0' && !fresh.seq.includes('✔') && !fresh.seq.includes('✕'), 'مباراة نظيفة: نتيجة 0-0 وشرائط فارغة');
  ok((A._er || []).length === 0 && (B._er || []).length === 0 && (C._er || []).length === 0, 'صفر أخطاء JS عند الطرفين الثلاثة');

  await b.close();
  console.log('\n[pn room v2.64] ' + pass + '/' + (pass + fail) + (fail ? ' FAIL: ' + JSON.stringify(fails) : ' PASS'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
