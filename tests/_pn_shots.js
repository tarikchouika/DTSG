/* [v2.64] لقطات بصرية نهائية: بورتريه (بداية + منتصف مباراة بنتائج) +
   لاندسكيب + لوحة تصويت الغرفة — تُقيَّم بـ VLM */
'use strict';
process.chdir(require('path').resolve(__dirname, '..'));
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.env.PNPORT || '3000') + '/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = require('path').join(__dirname, '_artifacts', 'pn64');
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const tag = Date.now().toString().slice(-6);

  /* بورتريه: بداية ثم منتصف مباراة بعلامات ✔/✕ */
  const ctx = await b.newContext({ viewport: { width: 390, height: 780, isMobile: true, hasTouch: true }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => openGame('pn'));
  await sleep(900);
  await p.screenshot({ path: OUT + '/portrait_start.png' });
  for (let i = 0; i < 4; i++) {
    await p.evaluate(() => penShoot('🎯'));
    await p.waitForFunction(() => window.pnSolo && (pnSolo.over || !window.pnBusy), null, { timeout: 20000 });
    await sleep(200);
  }
  await sleep(400);
  await p.screenshot({ path: OUT + '/portrait_mid.png' });
  await ctx.close();

  /* لاندسكيب: بداية ثم منتصف مباراة */
  const ctxL = await b.newContext({ viewport: { width: 780, height: 390, isMobile: true, hasTouch: true }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' });
  const pl = await ctxL.newPage();
  await pl.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pl.waitForTimeout(1200);
  await pl.evaluate(() => openGame('pn'));
  await sleep(900);
  await pl.screenshot({ path: OUT + '/landscape_start.png' });
  for (let i = 0; i < 4; i++) {
    await pl.evaluate(() => penShoot('🎯'));
    await pl.waitForFunction(() => window.pnSolo && (pnSolo.over || !window.pnBusy), null, { timeout: 20000 });
    await sleep(200);
  }
  await pl.screenshot({ path: OUT + '/landscape_mid.png' });
  await ctxL.close();

  /* غرفة: مباراة قصيرة (rounds=3) ثم لوحة التصويت */
  async function mk(name, vp) {
    const c = await b.newContext({ viewport: vp });
    await c.request.post(BASE + 'api/register', { data: { username: name + tag, password: 'pw123456' } });
    const pg = await c.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1200);
    return pg;
  }
  const A = await mk('vsa', { width: 390, height: 780, isMobile: true, hasTouch: true });
  const B = await mk('vsb', { width: 390, height: 780, isMobile: true, hasTouch: true });
  const C = await mk('vsc', { width: 390, height: 780, isMobile: true, hasTouch: true });
  await A.evaluate(() => openGame('pn'));
  await B.evaluate(() => openGame('pn'));
  await C.evaluate(() => openGame('pn'));
  await sleep(700);
  await A.evaluate(() => Rooms.createRoom('pn', { bet: 100, game_opts: { rounds: 3 } }));
  await sleep(600);
  const code = await A.evaluate(() => Rooms.state.code);
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await C.evaluate((c) => Rooms.joinRoom(c), code);
  await sleep(900);
  await A.evaluate(() => Rooms.startGame());
  await sleep(1500);
  for (let i = 0; i < 6; i++) {
    await Promise.all([A, B].map(x => x.waitForFunction(() => window.pnRoom && !pnRoom.waiting && !window.pnBusy && !pnRoom.over, null, { timeout: 20000 })));
    const bDir = await B.evaluate(() => (pnRoom.shot % 2 === 1) ? '🎯' : '⬆️');
    await Promise.all([A.evaluate(() => penShoot('🎯')), B.evaluate((d) => penShoot(d), bDir)]);
    await Promise.all([A, B].map(x => x.waitForFunction(() => { const ball = document.getElementById('pnBall'); return (window.pnRoom && pnRoom.over) || (ball && ball.className === 'pn-ball' && !window.pnBusy); }, null, { timeout: 25000 })));
    await sleep(150);
  }
  await sleep(2000);
  await A.screenshot({ path: OUT + '/room_rematch_vote.png' });
  console.log('screenshots saved to tests/_artifacts/pn64/');
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
