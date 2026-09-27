process.chdir(require('path').resolve(__dirname, '..'));
/* لقطات بصرية للعبة بينالتي الجديدة: سطح المكتب + موبايل بورتريه + موبايل لاندسكيب */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const shots = [
    { name: 'pn_desktop', vp: { width: 1280, height: 800 }, mobile: false },
    { name: 'pn_portrait', vp: { width: 390, height: 780 }, mobile: true },
    { name: 'pn_landscape', vp: { width: 780, height: 390 }, mobile: true }
  ];
  for (const s of shots) {
    const b = await chromium.launch({ args: ['--no-sandbox'] });
    const ctx = await b.newContext({ viewport: s.vp, isMobile: s.mobile, hasTouch: s.mobile });
    const u = s.name + Date.now().toString().slice(-5);
    await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1800);
    await p.evaluate(() => openGame('pn'));
    await p.waitForTimeout(1500);
    await p.screenshot({ path: '/home/z/my-project/tests/_artifacts/' + s.name + '_idle.png' });
    /* تسديدة ثم لقطة أثناء الطيران والنتيجة */
    await p.evaluate(() => penShoot('↗️'));
    await p.waitForTimeout(900);
    await p.screenshot({ path: '/home/z/my-project/tests/_artifacts/' + s.name + '_flight.png' });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: '/home/z/my-project/tests/_artifacts/' + s.name + '_result.png' });
    await b.close();
    console.log('captured: ' + s.name);
  }
  console.log('ALL SHOTS DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
