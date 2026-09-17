const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ locale: 'ar-MA' });
  const page = await ctx.newPage();
  /* 1) صفحة الاسترداد: لا مفاتيح خام */
  await page.goto('http://localhost:3000/refund-policy.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const raw = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('[data-k],[data-i18n]').forEach(el => {
      const t = el.textContent || '';
      if (/^(refund|wl|ui|legal)\.[a-zA-Z]+$/.test(t.trim())) bad.push(t.trim());
    });
    return bad;
  });
  console.log('RAW-KEYS refund page:', JSON.stringify(raw));
  console.log('H1:', (await page.textContent('h1')).trim().slice(0, 40));
  console.log('FOOTER refund link:', (await page.evaluate(() => { const a = document.querySelector('a[href*="refund-policy"]'); return a ? a.textContent.trim() : 'NOT-FOUND'; })));
  /* 2) المودال: المحفظة */
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; window.openWallet(); });
  await page.waitForTimeout(1200);
  const wlTitle = await page.evaluate(() => { const h = document.querySelector('.wl-head h3'); return h ? h.textContent.trim() : 'NO-EL'; });
  console.log('WALLET TITLE:', wlTitle);
  await b.close();
})();
