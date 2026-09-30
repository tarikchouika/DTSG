process.chdir(require('path').resolve(__dirname, '..'));
const { chromium } = require('playwright');
const BASE = 'http://localhost:4173/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.request.post(BASE + 'api/register', { data: { username: 'pb' + Date.now().toString().slice(-5), password: 'pw123456' } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!(typeof AUTH !== 'undefined' && AUTH.user));
  await p.evaluate(() => { ST.gold = 50000; openGame('do'); });
  await p.waitForSelector('#dmStartBtn');
  await p.click('#dmStartBtn');
  await p.waitForSelector('#dmPlay.dm-screen-active');
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const o = document.getElementById('dmOppRow');
    const cs = o ? getComputedStyle(o) : null;
    const back = o && o.querySelector('.dm-back');
    return { len: o ? o.innerHTML.length : -1, backs: o ? o.querySelectorAll('.dm-back').length : -1,
             h: o ? o.getBoundingClientRect().height : -1, disp: cs ? cs.display : '', backRect: back ? JSON.stringify(back.getBoundingClientRect()) : null };
  });
  console.log(JSON.stringify(r));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
