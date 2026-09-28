/* [v2.64 Solo] منطق المباراة الفردية الكاملة: تبادل مسدد/متصدي + 3-9 تسديدات
   لكل لاعب + موت فجائي عند التعادل + إعادة اللعب — تشغيل: node tests/_pn_solo_v264_test.js */
'use strict';
process.chdir(require('path').resolve(__dirname, '..'));
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.env.PNPORT || '3117') + '/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t, label) {
  const s = Date.now();
  while (Date.now() - s < t) {
    try { const r = await p.evaluate(fn); if (r) return r; } catch (x) {}
    await p.waitForTimeout(150);
  }
  throw new Error('timeout [' + label + ']');
}
let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } console.log((c ? '  ✅ ' : '  ❌ ') + n); };

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 780, isMobile: true, hasTouch: true }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => typeof openGame === 'function', 8000, 'app');
  await p.evaluate(() => openGame('pn'));
  await wait(p, () => !!document.querySelector('.pn-fs'), 8000, 'pn render');
  await sleep(600);

  console.log('═══ 1) البنية: لا عبارات أعلى + حلقات الأحرف الأولى ═══');
  const els = await p.evaluate(() => ({
    turn: !!document.getElementById('pnTurn'),
    ini0: (document.getElementById('pnIni0') || {}).textContent,
    ini1: (document.getElementById('pnIni1') || {}).textContent,
    topText: (document.getElementById('pnSpecs') || {}).textContent,
    betText: (document.getElementById('pnBet') || {}).textContent,
    zones: document.querySelectorAll('.pnz').length,
    ring: !!document.querySelector('.pn-ring'),
    role0: (document.getElementById('pnRole0') || {}).textContent,
    role1: (document.getElementById('pnRole1') || {}).textContent,
    fsClass: (document.getElementById('pnFs') || {}).className
  }));
  ok(!els.turn, 'لا يوجد شريط نص الدور (pnTurn محذوف)');
  ok(els.topText === '' && els.betText === '', 'الشريط العلوي فارغ تماماً في الفردي (بلا عبارات)');
  ok(els.zones === 9, 'تسع مناطق لمس');
  ok(els.ring, 'حلقات الأيقونات موجودة');
  ok(els.role0 === '⚽' && els.role1 === '🧤', 'الدور الأول: أنا مسدد ⚽ والحاسوب متصدي 🧤');

  console.log('═══ 2) تسديدة واحدة: السينما + الدقة + الشريط ═══');
  await p.evaluate(() => penShoot('🎯'));
  await wait(p, () => {
    const b = document.getElementById('pnBall');
    if (!b) return false;
    const r = b.getBoundingClientRect();
    const z = document.querySelector('.pnz[data-d="🎯"]');
    if (!z) return false;
    const zr = z.getBoundingClientRect();
    return Math.abs(r.left + r.width / 2 - (zr.left + zr.width / 2)) < 70 && Math.abs(r.top + r.height / 2 - (zr.top + zr.height / 2)) < 70;
  }, 6000, 'ball flying to zone');
  await wait(p, () => (document.getElementById('pnSeq0') || { textContent: '' }).textContent.includes('✔') || (document.getElementById('pnSeq0') || { textContent: '' }).textContent.includes('✕'), 9000, 'token appears');
  await sleep(300);
  const after1 = await p.evaluate(() => ({
    sc0: document.getElementById('pnSc0').textContent,
    seq0: document.getElementById('pnSeq0').textContent,
    goalRect: document.getElementById('pnGoal').getBoundingClientRect().toJSON(),
    fsH: document.getElementById('pnFs').getBoundingClientRect().height,
    role0: document.getElementById('pnRole0').textContent,
    role1: document.getElementById('pnRole1').textContent,
    ballCls: document.getElementById('pnBall').className
  }));
  ok(after1.seq0.includes('✔') || after1.seq0.includes('✕'), 'علامة النتيجة ظهرت في الشريط (✔/✕)');
  ok(Math.round(after1.fsH) === 780, 'طبقة ملء الشاشة لم تنهار بعد الهدف (780px)');
  ok(after1.goalRect.top > 150 && after1.goalRect.top < 400, 'المرمى بقي في مكانه المركزي');
  ok(after1.role0 === '🧤' && after1.role1 === '⚽', 'الدور تبادل: الحاسوب مسدد الآن ⚽ وأنا متصدي 🧤');
  ok(after1.ballCls === 'pn-ball', 'الكرة عادت لموضعها');

  console.log('═══ 3) مباراة كاملة: 5 لكل لاعب ثم موت فجائي حتى الفوز ═══');
  /* لعب آلي: دوري = اختر منطقة؛ دور الحاسوب = اختر (تصدي) */
  let shots = 1;
  for (;;) {
    const st = await p.evaluate(() => pnSolo && { shot: pnSolo.shot, over: pnSolo.over, g: pnSolo.seatGoals, n: [pnSolo.seatShots[0].length, pnSolo.seatShots[1].length] });
    if (!st || st.over) break;
    if (shots > 60) { ok(false, 'حلقة لا نهائية — المباراة لا تنتهي'); break; }
    await p.evaluate(() => penShoot('🎯'));
    shots++;
    await wait(p, () => { const b = document.getElementById('pnBall'); return (window.pnSolo && window.pnSolo.over) || (b && b.className === 'pn-ball' && !window.pnBusy); }, 15000, 'shot reset ' + shots);
    await sleep(150);
  }
  const fin = await p.evaluate(() => pnSolo && { shot: pnSolo.shot, over: pnSolo.over, g: pnSolo.seatGoals, n: [pnSolo.seatShots[0].length, pnSolo.seatShots[1].length] });
  ok(fin && fin.over, 'المباراة انتهت بفائز (لا تعادل)');
  ok(fin.g[0] !== fin.g[1], 'النتيجة حاسمة: ' + fin.g[0] + '-' + fin.g[1]);
  const per = 5;
  ok(fin.n[0] >= per && fin.n[1] >= per, 'كل لاعب سدد ' + per + ' على الأقل (' + fin.n[0] + '/' + fin.n[1] + ')');
  ok(fin.shot % 2 === 1, 'انتهت بعد زوج مكتمل (تسديدات فردية: ' + (fin.shot - 1) + ')');
  const replay = await p.evaluate(() => { const r = document.getElementById('pnReplay'); return r ? !r.hidden : false; });
  ok(replay, 'زر إعادة اللعب 🔄 ظهر');

  console.log('═══ 4) إعادة اللعب ═══');
  await p.evaluate(() => { const r = document.getElementById('pnReplay'); if (r) r.click(); });
  await sleep(300);
  const re = await p.evaluate(() => pnSolo && { shot: pnSolo.shot, g: pnSolo.seatGoals, n: [pnSolo.seatShots[0].length, pnSolo.seatShots[1].length] });
  ok(re && re.shot === 1 && re.g[0] === 0 && re.g[1] === 0 && re.n[0] === 0, 'مباراة جديدة نظيفة بعد 🔄');

  console.log('═══ 5) دقة الحركة: الكرة تصل مركز المنطقة المحددة ═══');
  await p.evaluate(() => pnSoloRestart());
  await sleep(200);
  const precise = await p.evaluate(async () => {
    /* مباراة نظيفة: التسديدة الأولى هجومية — الكرة تتجه لمنطقة ↗️ التي اخترتها */
    return new Promise(res => {
      const ball = document.getElementById('pnBall');
      const z = document.querySelector('.pnz[data-d="↗️"]');
      let sawFlying = false;
      penShoot('↗️');
      const iv = setInterval(() => {
        const flying = ball.className.includes('flying');
        if (flying) sawFlying = true;
        if (sawFlying && !flying) {
          clearInterval(iv);
          const br = ball.getBoundingClientRect();
          const zr = z.getBoundingClientRect();
          res({ bx: br.left + br.width / 2, by: br.top + br.height / 2, zx: zr.left + zr.width / 2, zy: zr.top + zr.height / 2 });
        }
      }, 60);
      setTimeout(() => { clearInterval(iv); res(null); }, 8000);
    });
  });
  if (precise) {
    const dx = Math.abs(precise.bx - precise.zx), dy = Math.abs(precise.by - precise.zy);
    ok(dx <= 12 && dy <= 12, `الكرة وصلت مركز ↗️ بدقة (Δx=${dx.toFixed(1)} Δy=${dy.toFixed(1)})`);
  } else ok(false, 'تعذر قياس دقة الوصول');

  await wait(p, () => !window.pnBusy, 15000, 'final reset');
  ok(errs.length === 0, 'صفر أخطاء JS' + (errs.length ? ' — ' + errs[0] : ''));
  await b.close();
  console.log('\n[pn solo v2.64] ' + pass + '/' + (pass + fail) + (fail ? ' FAIL: ' + JSON.stringify(fails) : ' PASS'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
