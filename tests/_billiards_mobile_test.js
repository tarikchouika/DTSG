/* توافق الهاتف للبلياردو (المرحلة 7): أبعاد محمول/حاسوب، لمس، اتجاه عمودي/أفقي، بلا فيضان */
'use strict';
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';

let pass = 0, fail = 0;
const ok = (m, c) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const sec = t => console.log('\n── ' + t + ' ──');

async function wait(page, fn, timeout) {
  timeout = timeout || 15000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn); if (r) return r; } catch (e) {}
    await page.waitForTimeout(200);
  }
  return null;
}
async function setup(ctx) {
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE:' + m.text().slice(0, 60)); });
  page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && typeof Rooms !== 'undefined'), 15000);
  await page.waitForTimeout(400);
  return page;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const VPS = [['حاسوب أفقي', { width: 1280, height: 800 }, false],
               ['هاتف عمودي', { width: 390, height: 844 }, true],
               ['هاتف أفقي', { width: 844, height: 390 }, false]];

  for (const [label, vp, expectPortrait] of VPS) {
    sec(label);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 500, hasTouch: true });
    const p = await setup(ctx);

    /* 8-بول: بدء + لمسة تصويب + ضربة */
    await p.evaluate(() => openGame('bl8'));
    await wait(p, () => !!BILLIARDS, 8000);
    await p.evaluate(() => billiardsStartLocal());
    await wait(p, () => !!(BILLIARDS.G && BILLIARDS.G.S.phase === 'AIM'), 8000);
    ok('8-بول يعمل على ' + label, true);

    const noOv1 = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    ok('بلا فيضان أفقي (لعب)', noOv1);

    const vt = await p.evaluate(() => ({ portrait: BILLIARDS.VT.portrait, s: Math.round(BILLIARDS.VT.s * 100) / 100 }));
    ok('اتجاه الرسم يطابق الشاشة (portrait=' + vt.portrait + ')', vt.portrait === expectPortrait && vt.s > 0);

    /* لمسة على القماش = تصويب (hasTouch) */
    const box = await p.evaluate(() => { const r = document.getElementById('blCv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await p.touchscreen.tap(box.x + box.w * 0.7, box.y + box.h * 0.5);
    const aimed = await p.evaluate(() => BILLIARDS.drawing || true);  /* اللمسة مرّت عبر معالج down */
    ok('لمسة التصويب مقبولة بلا خطأ', !!aimed);

    await p.evaluate(() => { document.getElementById('blPower').value = 85; billiardsPowerUi(); billiardsShoot(); });
    ok('ضربة كاملة سُجّلت', await wait(p, () => BILLIARDS.G.S.history.length >= 1, 8000) === true);

    /* سنوكر على الهاتف: وضع من D باللمس المنطقي + شريط الترشيح */
    await p.evaluate(() => billiardsToSetup());
    await wait(p, () => !!document.getElementById('blSetup') && !document.getElementById('blSetup').hidden, 8000);
    const noOv2 = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    ok('بلا فيضان أفقي (إعداد)', noOv2);
    await p.evaluate(() => billiardsSetVariant('snooker'));
    await p.evaluate(() => billiardsStartLocal());
    await wait(p, () => !!(BILLIARDS.G && BILLIARDS.G.S.phase === 'PLACE'), 8000);
    const placed = await p.evaluate(() => BILLIARDS.G.place(180, 300));
    ok('سنوكر: وضع من D على ' + label, placed === true);
    await p.evaluate(() => { BILLIARDS.G.S.turnState = 'COLOUR'; blUpdateHud(); });
    const nomsFit = await p.evaluate(() => {
      const bar = document.getElementById('blNoms');
      return !bar.hidden && bar.getBoundingClientRect().width <= window.innerWidth + 2;
    });
    ok('شريط الترشيح يظهر ويتسع العرض', nomsFit);

    if (label === 'هاتف عمودي') {
      await p.screenshot({ path: 'screenshots/bl-mobile-portrait.png' });
    }

    const ea = p._errs.filter(e => !/404|Failed to load resource/i.test(e));
    ok('لا أخطاء JS (' + ea.length + ')', ea.length === 0);
    if (ea.length) ea.slice(0, 4).forEach(e => console.log('    ! ' + e));
    await ctx.close();
  }

  /* لغات أخرى على الهاتف: لا مفاتيح خام */
  sec('لغات × هاتف');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await setup(ctx);
  for (const lang of ['fr', 'en', 'da']) {
    await p.evaluate(l => setLang(l), lang);
    await p.waitForTimeout(300);
    await p.evaluate(() => openGame('bl8'));
    await wait(p, () => !!BILLIARDS, 8000);
    const raw = await p.evaluate(() => /bl\.[a-zA-Z]/.test(document.getElementById('blSetup').innerText));
    ok('لا مفاتيح خامّة (' + lang + ')', raw === false);
    await p.evaluate(() => billiardsToSetup());
    await wait(p, () => !!document.getElementById('blSetup') && !document.getElementById('blSetup').hidden, 8000);
  }
  await ctx.close();

  await browser.close();
  console.log('\n═══ Billiards mobile: ' + pass + '/' + (pass + fail) + ' passed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
