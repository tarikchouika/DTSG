/* تحقّق من دورة التبديل (انغماسي ↔ مفتوح) + لقطة شاشة للتخطيط المفتوح المُصلَح. */
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
async function state(p) {
  return await p.evaluate(() => {
    const pg = document.getElementById('pg-game');
    const body = document.getElementById('gamePageBody');
    const stage = body && body.querySelector('.stage');
    const head = document.querySelector('#pg-game .gp-head');
    const gh = document.querySelector('#pg-game .ghist');
    const bb = body.getBoundingClientRect();
    const sb = stage.getBoundingClientRect();
    return {
      appFs: pg.classList.contains('app-fs'),
      headVisible: head && getComputedStyle(head).display !== 'none',
      ghVisible: gh && getComputedStyle(gh).display !== 'none',
      stageFits: sb.top >= bb.top - 2 && sb.bottom <= bb.bottom + 2,
      bodyH: Math.round(bb.height)
    };
  });
}
(async () => {
  const results = [];
  for (const [label, vp] of [['mobile', { width: 390, height: 780, isMobile: true, hasTouch: true }], ['desktop', { width: 1280, height: 800 }]]) {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: vp, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    const u = 'tog' + label + Date.now().toString().slice(-4);
    await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
    const p = await ctx.newPage();
    const er = []; p.on('pageerror', e => er.push(e.message.slice(0, 60)));
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
    await p.evaluate(() => { if (typeof ST !== 'undefined') ST.gold = 50000; });
    await p.evaluate(() => openGame('pl'));
    await wait(p, () => !!(document.getElementById('gamePageBody') && document.getElementById('gamePageBody').querySelector('.stage')));
    await sleep(700);
    const sImm = await state(p);                       // افتراضي: انغماسي
    await p.evaluate(() => toggleGameFullscreen());    // → مفتوح
    await sleep(600);
    const sOpen = await state(p);
    // ملء السجل بالتذاكر
    for (let i = 0; i < 8; i++) await p.evaluate((idx) => recordRound(idx % 2 === 0, idx % 2 === 0 ? 200 : 0, 'x'), i);
    await sleep(300);
    const sOpenFull = await state(p);
    await p.evaluate(() => toggleGameFullscreen());    // → انغماسي مجدداً
    await sleep(600);
    const sImm2 = await state(p);

    const ok =
      sImm.appFs && !sImm.headVisible && !sImm.ghVisible && sImm.stageFits &&   // انغماسي يخفي الهيدر/السجل
      !sOpen.appFs && sOpen.headVisible && sOpen.ghVisible && sOpen.stageFits && // مفتوح يُظهرهما
      sOpenFull.bodyH === sOpen.bodyH &&                                          // الحاوية ثابتة رغم السجل
      sImm2.appFs && !sImm2.headVisible && sImm2.ghVisible === false && sImm2.stageFits && // عودة للانغماسي
      !er.length;
    results.push([label, ok]);
    console.log((ok ? '✅ ' : '❌ ') + label + '/toggle-cycle');
    console.log('   immersive:', JSON.stringify(sImm));
    console.log('   open     :', JSON.stringify(sOpen));
    console.log('   open+log :', JSON.stringify(sOpenFull));
    console.log('   immersive2:', JSON.stringify(sImm2));
    if (er.length) console.log('   errs:', er.length);

    // لقطة شاشة للتخطيط المفتوح بعد التبديل له مجدداً
    await p.evaluate(() => toggleGameFullscreen()); // → مفتوح
    await sleep(500);
    for (let i = 0; i < 6; i++) await p.evaluate((idx) => recordRound(idx % 2 === 0, idx % 2 === 0 ? 150 : 0, 'x'), i);
    await sleep(300);
    await p.screenshot({ path: '/home/user/casino/_shot_open_' + label + '.png', fullPage: true });
    await p.close();
    await b.close();
  }
  const pass = results.filter(r => r[1]).length;
  console.log('\nالنتيجة: ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
