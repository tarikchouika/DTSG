/* FLAT DOG (rn) MP test — dealer determination by highest card + 4-seat wiring.
   A (owner) + B (guest). Owner picks mode → start → dealer determined (each seat
   shows a card, highest crowned dealer) on BOTH browsers → round 1 begins. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:4173/';

/* Chromium helper (al2023 runtime if available) — mirrors _rd_pw.js */
async function launchChromium() {
  let execPath = null;
  try { execPath = await (await import('@sparticuz/chromium')).default.executablePath(); } catch (e) {}
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
  if (execPath) return chromium.launch({ executablePath: execPath, args: args });
  return chromium.launch({ args: args });
}
async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) {}
    await page.waitForTimeout(200);
  }
  return null;
}
async function setup(ctx, username) {
  await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
  await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
  await page.waitForTimeout(600);
  return page;
}

(async () => {
  const browser = await launchChromium();
  const results = [];
  const ok = (n, c) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };

  const A = await setup(await browser.newContext(), 'rn_host_' + Date.now() % 10000);
  const B = await setup(await browser.newContext(), 'rn_guest_' + Date.now() % 10000);
  for (const p of [A, B]) await p.evaluate(() => openGame('rn'));
  await wait(A, () => !!(typeof RN_ADAPTER !== 'undefined' && RN_ADAPTER), 10000);
  await wait(B, () => !!(typeof RN_ADAPTER !== 'undefined' && RN_ADAPTER), 10000);

  await A.evaluate(() => Rooms.createRoom('rn', 10));
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code);
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 8000);
  await A.evaluate(() => Rooms.startGame());
  await wait(A, () => !!(RN_ADAPTER && RN_ADAPTER.room), 10000);
  await wait(B, () => !!(RN_ADAPTER && RN_ADAPTER.room), 10000);

  // Owner picks number_only via bottom bar
  await wait(A, () => !!document.getElementById('rnModeNum'), 8000);
  await A.evaluate(() => RN_chooseMode('number_only'));
  await wait(A, () => !!(RN_ADAPTER.room && RN_ADAPTER.room.mode), 8000);

  // Owner starts → dealer determination
  await A.evaluate(() => RN_startRound());

  // Both should show the dealer-determination: seats with face cards + a dealer-pick seat
  const dealState = async (page) => wait(page, () => {
    const seats = [...document.querySelectorAll('.fd-seat')];
    const withCard = seats.filter(s => s.querySelector('.fd-seat-card .fd-card.face')).length;
    const dealer = seats.filter(s => s.classList.contains('dealer-pick')).length;
    return (withCard >= 2 && dealer === 1) ? { withCard, dealer } : null;
  }, 12000);
  const sa = await dealState(A);
  const sb = await dealState(B);
  ok('owner sees 2 dealt cards + 1 dealer', !!(sa && sa.withCard >= 2 && sa.dealer === 1));
  ok('guest sees 2 dealt cards + 1 dealer', !!(sb && sb.withCard >= 2 && sb.dealer === 1));

  // Both must agree on who the dealer is (same order after determination)
  const orderA = await A.evaluate(() => RN_ADAPTER.room.order.join(','));
  const orderB = await B.evaluate(() => RN_ADAPTER.room.order.join(','));
  ok('both browsers share the same (dealer-first) order', orderA === orderB);

  // Dealer = the seat whose card rank is highest (verify on owner)
  // [v26] البطاقات أصبحت صور أوراق إسبانية (background-image: N-suit.webp) —
  //       نقرأ القيمة والبذلة من اسم الملف بدل عناصر النص القديمة.
  const verify = await A.evaluate(() => {
    const seats = [...document.querySelectorAll('.fd-seat')];
    const ranks = { '1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'10':8,'11':9,'12':10 };
    const suit = { 'oros':0,'copas':1,'espadas':2,'bastos':3 };
    const info = seats.map(s => {
      const f = s.querySelector('.fd-seat-card .fd-card.face');
      let n = 0, sm = '', rank = 0;
      if (f) {
        const style = f.getAttribute('style') || '';
        const m = style.match(/url\(['"]?([^'")]+)['"]?\)/);
        const file = m ? String(m[1]).split('/').pop() : '';
        const pm = file.match(/^(\d+)-([a-z]+)\.webp$/);
        if (pm) { n = parseInt(pm[1],10); sm = pm[2]; }
        rank = (ranks[n]||0)*4 + (suit[sm]||0);
      }
      return { dealer: s.classList.contains('dealer-pick'), n, sm, rank };
    }).filter(x => x.n);
    const max = Math.max(...info.map(x => x.rank));
    const dealerInfo = info.find(x => x.dealer);
    return { agreed: dealerInfo && dealerInfo.rank === max, info };
  });
  ok('crowned dealer actually holds the highest card', !!(verify && verify.agreed));

  // تأكيد مرحلة الرهان (المتخمّن) لبدء الجولة الأولى
  await wait(A, () => !!document.getElementById('rnBpAmt'), 16000);
  await A.evaluate(() => { if (RN_ADAPTER.core.myRole === 'selector') RN_betStart(); });
  await B.evaluate(() => { if (RN_ADAPTER.core.myRole === 'selector') RN_betStart(); });

  // Round 1 must start after the determination (number dropdown for selector, or wait for dealer)
  const roundStarted = await wait(A, () => {
    if (!RN_ADAPTER || !RN_ADAPTER.room) return null;
    return RN_ADAPTER.room.round >= 1 ? true : null;
  }, 15000);
  ok('round 1 started after dealer determination', !!roundStarted);

  ok('no page errors (A=' + A._errs.length + ' B=' + B._errs.length + ')', A._errs.length === 0 && B._errs.length === 0);

  await A.screenshot({ path: '/home/user/mp_deal_A.png' });
  await browser.close();
  const failed = results.filter(r => !r[1]).length;
  console.log('\n═══ FLAT DOG MP dealer-determination: ' + (results.length - failed) + '/' + results.length + ' passed ═══');
  process.exit(failed ? 1 : 0);
})();
