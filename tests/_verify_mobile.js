const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; window.openWallet(); });
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const x = document.querySelector('.wl-x');
    if (!x) return { found: false };
    const b = x.getBoundingClientRect();
    const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return { found: true, rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }, topIsSelfOrChild: el === x || x.contains(el), topTag: el ? (el.className || el.tagName) : null };
  });
  console.log('CLOSE BTN:', JSON.stringify(r));
  /* جرّب النقر فعلاً */
  await page.click('.wl-x');
  await page.waitForTimeout(400);
  console.log('overlay hidden after click:', await page.evaluate(() => { const o = document.querySelector('.wl-overlay'); return !o || o.hidden; }));
  await b.close();
})();
