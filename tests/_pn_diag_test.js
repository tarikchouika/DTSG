/* تشخيص بصري حي للعبة بينالتي: لقطات قبل/بعد التسديد في الوضعين */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3117';
const OUT = path.join(__dirname, '_artifacts', 'pndiag');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 780, isMobile: true, hasTouch: true }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => { try { localStorage.setItem('dtsg_lang', 'ar'); } catch (e) {} });
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => openGame('pn'));
  await p.waitForTimeout(900);

  /* ── 1) بورتريه قبل التسديد ── */
  await p.screenshot({ path: path.join(OUT, 'p_before.png') });

  /* قياس هندسي: موضع المرمى مقابل مركز الشاشة */
  const geo = await p.evaluate(() => {
    const r = (id) => { const el = document.getElementById(id); return el ? el.getBoundingClientRect() : null; };
    const goal = r('pnGoal'), pitch = r('pnPitch'), fs = r('pnFs'), ball = r('pnBall'), gk = r('pnKeeper'), z = document.querySelector('.pnz[data-d="🎯"]');
    return { goal, pitch, fs, ball, gk, zone: z ? z.getBoundingClientRect() : null, scr: { w: innerWidth, h: innerHeight } };
  });
  console.log('PORTRAIT GEO:', JSON.stringify(geo, null, 1));

  /* ── 2) تسديدة نحو 🎯 (الوسط) ── */
  await p.evaluate(() => penShoot('🎯'));
  await p.waitForTimeout(1400);
  await p.screenshot({ path: path.join(OUT, 'p_after.png') });

  /* قياس ما بعد الهدف: هل انهار التخطيط؟ */
  const after = await p.evaluate(() => {
    const r = (id) => { const el = document.getElementById(id); return el ? el.getBoundingClientRect() : null; };
    return { goal: r('pnGoal'), pitch: r('pnPitch'), fs: r('pnFs'), ball: r('pnBall'), banner: r('pnBanner'), scr: { w: innerWidth, h: innerHeight } };
  });
  console.log('PORTRAIT AFTER GOAL:', JSON.stringify(after, null, 1));

  await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(OUT, 'p_reset.png') });

  /* ── 3) لاندسكيب ── */
  await ctx.close();
  const ctx2 = await b.newContext({ viewport: { width: 780, height: 390, isMobile: true, hasTouch: true }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errs.push(String(e)));
  await p2.goto(BASE, { waitUntil: 'networkidle' });
  await p2.evaluate(() => openGame('pn'));
  await p2.waitForTimeout(900);
  await p2.screenshot({ path: path.join(OUT, 'l_before.png') });
  const lgeo = await p2.evaluate(() => {
    const r = (id) => { const el = document.getElementById(id); return el ? el.getBoundingClientRect() : null; };
    const wrap = document.querySelector('.pn-wrap');
    return { goal: r('pnGoal'), fs: r('pnFs'), wrap: wrap ? wrap.getBoundingClientRect() : null, wrapStyle: wrap ? wrap.getAttribute('style') : null, scr: { w: innerWidth, h: innerHeight } };
  });
  console.log('LANDSCAPE GEO:', JSON.stringify(lgeo, null, 1));

  await b.close();
  console.log('JS ERRORS:', errs.length ? errs.slice(0, 8) : 'none');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
