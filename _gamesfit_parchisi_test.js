/* تحقّق من ملاءمة لوحة Parchisi بعد بدء اللعبة (شاشة الإعدادات → اللوحة). */
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
(async () => {
  let pass = 0, total = 0;
  for (const [label, vp] of [['mobile', { width: 390, height: 780, isMobile: true, hasTouch: true }], ['desktop', { width: 1280, height: 800 }]]) {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: vp, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    const u = 'parch' + label + Date.now().toString().slice(-4);
    await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
    await p.evaluate(() => { if (typeof ST !== 'undefined') ST.gold = 50000; });
    await p.evaluate(() => openGame('pr'));
    await wait(p, () => !!document.getElementById('parchisiSetup'));
    // ابدأ اللعبة
    await p.evaluate(() => ParchisiApp.start());
    await wait(p, () => { const g = document.getElementById('parchisiGame'); return g && g.style.display !== 'none'; });
    await sleep(600);
    const m = await p.evaluate(() => {
      const body = document.getElementById('gamePageBody');
      const pg = document.getElementById('parchisiGame');
      const cv = document.getElementById('parchisiCanvas');
      const b = body.getBoundingClientRect();
      const r = pg.getBoundingClientRect();
      const c = cv.getBoundingClientRect();
      return {
        bodyW: Math.round(b.width), bodyH: Math.round(b.height),
        gameW: Math.round(r.width), gameH: Math.round(r.height),
        cvW: Math.round(c.width), cvH: Math.round(c.height),
        top: Math.round(r.top - b.top), bottom: Math.round(r.bottom - b.bottom),
        inV: r.top >= b.top - 2 && r.bottom <= b.bottom + 2,
        inH: r.left >= b.left - 2 && r.right <= b.right + 2
      };
    });
    total++;
    const ok = m.inV && m.inH;
    if (ok) pass++;
    console.log((ok ? '✅ ' : '❌ ') + label + '/pr-board (game ' + m.gameW + 'x' + m.gameH + ' canvas ' + m.cvW + 'x' + m.cvH + ' in ' + m.bodyW + 'x' + m.bodyH + ' top:' + m.top + ' bottom:' + m.bottom + ')');
    if (!ok) console.log('   detail:', JSON.stringify(m));
    await p.close();
    await b.close();
  }
  console.log('\nالنتيجة: ' + pass + '/' + total);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
