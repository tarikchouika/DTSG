/* تحقّق مركّز من لعبة Crash (av) بعد اكتمال تحميل الوحدة (window.eCrash). */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t = 15000) {
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
    const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl'] });
    const ctx = await b.newContext({ viewport: vp, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    const u = 'crashreal' + label + Date.now().toString().slice(-4);
    await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
    const p = await ctx.newPage();
    const er = []; p.on('pageerror', e => er.push(e.message.slice(0, 70))); p._er = er;
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
    await p.evaluate(() => { if (typeof ST !== 'undefined') ST.gold = 50000; });
    // انتظر الوحدة
    await wait(p, () => typeof window.eCrash === 'function');
    await p.evaluate(() => openGame('av'));
    await wait(p, () => !!(document.getElementById('crash3d') || (document.getElementById('gamePageBody') && document.getElementById('gamePageBody').querySelector('.stage'))), 12000);
    await sleep(1200);
    const m = await p.evaluate(() => {
      const body = document.getElementById('gamePageBody');
      const stage = body && body.querySelector('.stage');
      const crash = document.getElementById('crash3d');
      const b = body.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      return {
        hasCrash3d: !!crash,
        isStage: !!stage,
        bodyW: Math.round(b.width), bodyH: Math.round(b.height),
        stageW: Math.round(s.width), stageH: Math.round(s.height),
        top: Math.round(s.top - b.top), bottom: Math.round(s.bottom - b.bottom),
        inV: s.top >= b.top - 2 && s.bottom <= b.bottom + 2,
        inH: s.left >= b.left - 2 && s.right <= b.right + 2
      };
    });
    total++;
    const ok = m.hasCrash3d && m.inV && m.inH;
    if (ok) pass++;
    console.log((ok ? '✅ ' : '❌ ') + label + '/av-real (crash3d:' + m.hasCrash3d + ' stage ' + m.stageW + 'x' + m.stageH + ' in ' + m.bodyW + 'x' + m.bodyH + ' top:' + m.top + ' bottom:' + m.bottom + ')');
    if (!ok) console.log('   detail:', JSON.stringify(m));
    if (er.length) console.log('   pageerrors:', er.slice(0, 3).join(' | '));
    await p.close();
    await b.close();
  }
  console.log('\nالنتيجة: ' + pass + '/' + total);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
