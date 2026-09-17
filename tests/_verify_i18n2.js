const { chromium } = require('playwright');
const AR = /[\u0600-\u06FF]/;
(async () => {
  const b = await chromium.launch();
  /* EN refund */
  let ctx = await b.newContext({ locale: 'en-US' });
  let page = await ctx.newPage();
  await page.goto('http://localhost:3000/refund-policy.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('rc_lang', 'en'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const enMix = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('main [data-k]').forEach(el => {
      const t = (el.textContent || '').trim();
      if (/[\u0600-\u06FF]/.test(t)) bad.push(el.getAttribute('data-k'));
    });
    return bad;
  });
  console.log('EN refund Arabic leftovers:', JSON.stringify(enMix));
  console.log('EN H1:', (await page.textContent('h1')).trim());

  /* AR refund */
  await page.evaluate(() => localStorage.setItem('rc_lang', 'ar'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const arH1 = (await page.textContent('h1')).trim();
  const arMissing = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('main [data-k]').forEach(el => {
      const t = (el.textContent || '').trim();
      if (!/[\u0600-\u06FF]/.test(t) && t.length > 0 && !/^(CIH|Binance|RIB|IBAN|SWIFT|DTSG)/.test(t)) bad.push(el.getAttribute('data-k') + '=' + t.slice(0, 20));
    });
    return bad.slice(0, 5);
  });
  console.log('AR H1:', arH1, '| non-AR leftovers:', JSON.stringify(arMissing));

  /* EN wallet */
  ctx = await b.newContext({ locale: 'en-US' });
  page = await ctx.newPage();
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.evaluate(() => { localStorage.setItem('rc_lang', 'en'); if (typeof setLang === 'function') setLang('en'); AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; openWallet(); });
  await page.waitForTimeout(800);
  console.log('EN wallet tabs:', await page.evaluate(() => Array.from(document.querySelectorAll('.wl-tabs button')).map(x => x.textContent.trim()).join(' | ')));
  console.log('EN wallet note title:', await page.evaluate(() => { const e = document.querySelector('#wlPaneDep .wl-note b'); return e ? e.textContent.trim() : 'NONE'; }));

  /* AR wallet */
  await page.evaluate(() => { setLang('ar'); });
  await page.waitForTimeout(400);
  console.log('AR wallet tabs:', await page.evaluate(() => Array.from(document.querySelectorAll('.wl-tabs button')).map(x => x.textContent.trim()).join(' | ')));
  await b.close();
})();
