const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; });

  /* البارتشي: لا خانة رهان + تلميح مجاني */
  await page.evaluate(() => openGame('pr'));
  await page.waitForTimeout(900);
  console.log('parchisi bet row gone:', await page.evaluate(() => (function(){ const b=document.getElementById('parchisiBet'); const f=document.querySelector('#parchisiSetup .gset-free'); return (!b) + '/' + (!!f); })()));
  await page.screenshot({ path: '/tmp/gset_parchisi_port.png' });

  /* البلياردو: رقاقات الرهان مخفية + تلميح */
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); await page.evaluate(() => { AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; openGame('bl8'); });
  await page.waitForTimeout(900);
  console.log('billiards bet hidden + hint:', await page.evaluate(() => {
    const f = document.getElementById('blBetField'); const chip = document.getElementById('blBet');
    return f && f.hidden && chip && !!document.querySelector('#blSetup .ch-hint');
  }));
  await page.screenshot({ path: '/tmp/gset_bl_port.png' });

  /* الدومينو */
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); await page.evaluate(() => { AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; openGame('do'); });
  await page.waitForTimeout(900);
  console.log('domino bet hidden:', await page.evaluate(() => { const f = document.getElementById('dmBetField'); return f && f.hidden; }));
  await page.screenshot({ path: '/tmp/gset_dm_port.png' });

  /* الطاولة */
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); await page.evaluate(() => { AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; openGame('bg'); });
  await page.waitForTimeout(900);
  console.log('backgammon bet hidden:', await page.evaluate(() => { const f = document.getElementById('bwBetField'); return f && f.hidden; }));
  await page.screenshot({ path: '/tmp/gset_bg_port.png' });

  /* فلات دوغ: لا ×2/×3 ولا شريط رهان مفرد */
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); await page.evaluate(() => { AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; openGame('rn'); });
  await page.waitForTimeout(1200);
  console.log('fd no mult badges:', await page.evaluate(() => !document.querySelector('.fd-mode-mult')));
  console.log('fd solo free note:', await page.evaluate(() => !!document.querySelector('.fd-free-side') || !!document.querySelector('.gset-free.inline')));
  await page.screenshot({ path: '/tmp/gset_fd_port.png' });

  /* الروندا: الإدخال مخفي + تلميح */
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); await page.evaluate(() => { AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; openGame('rd'); });
  await page.waitForTimeout(1000);
  console.log('ronda bet hidden + free:', await page.evaluate(() => { const i = document.getElementById('bet-input'); return i && i.hidden && !!document.querySelector('.gset-free'); }));
  await page.screenshot({ path: '/tmp/gset_rd_port.png' });

  /* المحفظة: Binance live */
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); await page.evaluate(() => { AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; openWallet(); });
  await page.waitForTimeout(900);
  console.log('wallet methods has Binance:', await page.evaluate(() => document.body.textContent.includes('Binance')));

  /* صفحة الاسترداد: QR ظاهر */
  await page.goto('http://localhost:3000/refund-policy.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const qr = await page.evaluate(() => Array.from(document.images).filter(i => i.src.includes('qr/')).map(i => [i.src.split('/').pop(), i.complete && i.naturalWidth > 0]));
  console.log('refund QR imgs:', JSON.stringify(qr));
  await page.screenshot({ path: '/tmp/gset_refund_port.png', fullPage: false });
  console.log('page errors:', JSON.stringify(errs.slice(0, 4)));
  await b.close();
  /* لاندسكيب بمتصفح مستقل */
  const b2 = await chromium.launch();
  const lp = await (await b2.newContext({ viewport: { width: 844, height: 390 }, locale: 'ar-MA' })).newPage();
  await lp.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' });
  await lp.waitForTimeout(1500);
  await lp.evaluate(() => { AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; openGame('pr'); });
  await lp.waitForTimeout(900);
  await lp.screenshot({ path: '/tmp/gset_parchisi_land.png' });
  await b2.close();
})();
