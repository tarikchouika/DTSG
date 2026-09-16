/* تحقّق من ملاءمة الألعاب غير المغطّاة بعد (ronda/crash/parchisi + ألعاب إضافية). */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t = 12000, a) {
  const s = Date.now(); let e;
  while (Date.now() - s < t) {
    try { const r = await p.evaluate(fn, a); if (r) return r; } catch (x) { e = x; }
    await p.waitForTimeout(150);
  }
  throw new Error('timeout' + (e ? ' ' + e.message : ''));
}
async function setup(ctx, u) {
  await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
  const p = await ctx.newPage();
  const er = []; p.on('pageerror', e => er.push(e.message.slice(0, 90))); p._er = er;
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
  await p.evaluate(() => { if (typeof ST !== 'undefined') ST.gold = 50000; });
  return p;
}
// العنصر الأساسي للعبة (مرحلة/حاوية) — يغطّي .stage و crash و parchisi و ronda
async function measure(page) {
  return await page.evaluate(() => {
    const body = document.getElementById('gamePageBody');
    if (!body) return { err: 'no body' };
    let el = body.querySelector('.stage');
    if (el && el.querySelector('#ramiContainer')) el = null;
    if (!el) el = body.querySelector('.crash-3d-container');
    if (!el) el = body.querySelector('.setup-screen') || document.getElementById('parchisiCanvas');
    if (!el) el = body.firstElementChild;
    if (!el) return { err: 'no container' };
    const b = body.getBoundingClientRect();
    const s = el.getBoundingClientRect();
    const inV = s.top >= b.top - 2 && s.bottom <= b.bottom + 2;
    const inH = s.left >= b.left - 2 && s.right <= b.right + 2;
    return {
      tag: el.className || el.id || el.tagName,
      bodyW: Math.round(b.width), bodyH: Math.round(b.height),
      elW: Math.round(s.width), elH: Math.round(s.height),
      top: Math.round(s.top - b.top), bottom: Math.round(s.bottom - b.bottom),
      inV, inH
    };
  });
}
const GAMES = ['rn', 'av', 'pr', 'sc', 'wg', 'bc', 'vp', 'sl', 'ab', 'crabbin', 'l7', 'fishing', 'dt', 'pn', 'rp'];
(async () => {
  const results = [];
  for (const [label, vp] of [['mobile', { width: 390, height: 780, isMobile: true, hasTouch: true }], ['desktop', { width: 1280, height: 800 }]]) {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: vp, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    for (const gid of GAMES) {
      const u = 'fit2' + label + gid + Date.now().toString().slice(-4);
      const page = await setup(ctx, u);
      try {
        if (gid === 'av') await wait(page, () => typeof window.eCrash === 'function', 12000); // وحدة Crash تُحمّل متأخراً
        await page.evaluate(id => openGame(id), gid);
        await wait(page, () => { const body = document.getElementById('gamePageBody'); return body && body.children.length > 0; }, 10000);
        await sleep(900);
        const m = await measure(page);
        const okFit = !m.err && m.inV && m.inH;
        results.push([label + '/' + gid + ' (' + (m.tag || '?') + ' ' + (m.elW || '?') + 'x' + (m.elH || '?') + ' in ' + (m.bodyW || '?') + 'x' + (m.bodyH || '?') + ')', !!okFit]);
        if (!okFit) console.log('  CLIP', label, gid, JSON.stringify(m));
      } catch (e) {
        results.push([label + '/' + gid + ': ERR ' + e.message.slice(0, 50), false]);
        console.log('  ERR', label, gid, e.message.slice(0, 70));
      }
      await page.close();
    }
    await b.close();
  }
  console.log('\n═══ ملاءمة الألعاب الإضافية ═══');
  let pass = 0;
  for (const [m, c] of results) { console.log((c ? '✅ ' : '❌ ') + m); if (c) pass++; }
  console.log('\nالنتيجة: ' + pass + ' نجح / ' + (results.length - pass) + ' فشل');
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
