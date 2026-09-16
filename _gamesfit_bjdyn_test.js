/* تحقّق من إعادة الملاءمة الديناميكية: توزيع أوراق Blackjack والضغط المتكرر. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t = 12000) {
  const s = Date.now(); let e;
  while (Date.now() - s < t) {
    try { const r = await p.evaluate(fn); if (r) return r; } catch (x) { e = x; }
    await p.waitForTimeout(150);
  }
  throw new Error('timeout' + (e ? ' ' + e.message : ''));
}
async function fits(p) {
  return await p.evaluate(() => {
    const body = document.getElementById('gamePageBody');
    const stage = body && body.querySelector('.stage');
    if (!stage) return { err: 1 };
    const b = body.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return {
      sh: Math.round(s.height), bh: Math.round(b.height),
      bottom: Math.round(s.bottom - b.bottom),
      inV: s.top >= b.top - 2 && s.bottom <= b.bottom + 2,
      inH: s.left >= b.left - 2 && s.right <= b.right + 2
    };
  });
}
(async () => {
  let pass = 0, total = 0;
  for (const [label, vp] of [['mobile', { width: 390, height: 780, isMobile: true, hasTouch: true }], ['desktop', { width: 1280, height: 800 }]]) {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: vp, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    const u = 'bjdyn' + label + Date.now().toString().slice(-4);
    await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
    const p = await ctx.newPage();
    const er = []; p.on('pageerror', e => er.push(e.message.slice(0, 70)));
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
    await p.evaluate(() => { if (typeof ST !== 'undefined') ST.gold = 50000; });
    await p.evaluate(() => openGame('bj'));
    await wait(p, () => !!(document.getElementById('gamePageBody') && document.getElementById('gamePageBody').querySelector('.stage')));
    await sleep(700);
    // صفّقة ثم عدّة Hit لكسب أوراق إضافية
    const steps = [];
    await p.evaluate(() => { if (typeof dealB === 'function') dealB(); });
    await sleep(500);
    for (let i = 0; i < 4; i++) {
      await p.evaluate(() => { if (typeof hitB === 'function') hitB(); });
      await sleep(450);
      const m = await fits(p);
      steps.push(m.inV && m.inH ? 'ok' : 'CLIP(b' + m.bottom + ',sh' + m.sh + ',bh' + m.bh + ')');
    }
    total++;
    const ok = steps.every(s => s === 'ok') && !er.length;
    if (ok) pass++;
    console.log((ok ? '✅ ' : '❌ ') + label + '/bj-dynamic steps:[' + steps.join(',') + ']' + (er.length ? ' errs:' + er.length : ''));
    await p.close();
    await b.close();
  }
  console.log('\nالنتيجة: ' + pass + '/' + total);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
