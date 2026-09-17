const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ locale: 'ar-MA' })).newPage();
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const login = await page.evaluate(async () => {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'super', password: 'RoyalCoin@Super1' }) });
    const j = await r.json();
    if (j.ok) { AUTH.user = j.user; renderAdmin(); }
    return j.ok;
  });
  console.log('login:', login);
  await page.waitForTimeout(400);
  console.log('codes tab exists:', await page.evaluate(() => !!Array.from(document.querySelectorAll('.atab')).find(t => /أكواد الشحن/.test(t.textContent))));
  await page.evaluate(() => adminTab('codes'));
  await page.waitForTimeout(300);
  console.log('tier options:', await page.evaluate(() => Array.from(document.querySelectorAll('#codeTier option')).map(o => o.textContent.trim()).join(' | ')));
  await page.evaluate(() => { document.getElementById('codeKind').value = 'admin'; document.getElementById('codeTier').value = '100'; document.getElementById('codeCur').value = 'usd'; adminMakeCode(); });
  await page.waitForTimeout(800);
  console.log('OUT:', (await page.textContent('#codeOut')).trim());
  await b.close();
})();
