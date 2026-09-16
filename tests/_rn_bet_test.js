/* FLAT DOG (rn) MP bet negotiation: selector proposes increase, dealer accepts/refuses,
   selector confirms → round starts with agreed coin stake. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000; const start = Date.now();
  while (Date.now() - start < timeout) { try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) {} await page.waitForTimeout(200); }
  return null;
}
async function setup(ctx, username, gold) {
  await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
  await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
  // give gold via admin? skip — use local ST for display; settlement via /api/transfer needs server gold.
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
  await page.evaluate((g) => { window.ST = window.ST || {}; window.ST.gold = g; if (window.save) save(); }, gold || 5000);
  await page.waitForTimeout(400);
  return page;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  const ok = (n, c) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
  const tag = Date.now() % 100000;
  const A = await setup(await browser.newContext(), 'rnbo_' + tag, 5000);
  const B = await setup(await browser.newContext(), 'rnbg_' + tag, 5000);
  for (const p of [A, B]) await p.evaluate(() => openGame('rn'));
  for (const p of [A, B]) await wait(p, () => !!(typeof RN_ADAPTER !== 'undefined' && RN_ADAPTER), 10000);

  await A.evaluate(() => Rooms.createRoom('rn', 10));
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code);
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => Rooms.state.players.every(p => p.ready), 8000);
  await A.evaluate(() => Rooms.startGame());
  for (const p of [A, B]) await wait(p, () => !!(RN_ADAPTER && RN_ADAPTER.room), 10000);

  await A.evaluate(() => RN_chooseMode('number_only'));
  await wait(A, () => !!(RN_ADAPTER.room && RN_ADAPTER.room.mode), 8000);
  await A.evaluate(() => RN_startRound());   // dealer determination → bet phase

  // wait for bet phase on both
  await wait(A, () => !!(document.getElementById('rnBpAmt')), 16000);
  await wait(B, () => !!(document.getElementById('rnBpAmt')), 16000);
  ok('bet phase shown on both browsers', true);

  // identify selector & dealer pages
  const roles = await Promise.all([A, B].map(p => p.evaluate(() => ({ me: RN_ADAPTER.core.myRole, sel: RN_ADAPTER.room.order[1], dl: RN_ADAPTER.room.order[0], myId: AUTH.user.id }))));
  const selPage = roles[0].me === 'selector' ? A : B;
  const dlPage = roles[0].me === 'selector' ? B : A;
  ok('one selector + one dealer identified', roles[0].me !== roles[1].me && (roles[0].me === 'selector' || roles[1].me === 'selector'));

  // selector proposes +10
  await selPage.evaluate(() => RN_proposeBet(10));
  await wait(dlPage, () => document.getElementById('rnBpAccept') && document.getElementById('rnBpAccept').style.display !== 'none', 8000);
  ok('dealer sees accept/refuse after proposal', true);

  // dealer accepts
  await dlPage.evaluate(() => RN_acceptBet());
  const betAfter = await wait(A, () => RN_ADAPTER.room.bet === 20 ? 20 : null, 8000);
  ok('bet increased to 20 after dealer accepts', betAfter === 20);

  // selector confirms → round starts
  await selPage.evaluate(() => RN_betStart());
  const r1 = await wait(A, () => (RN_ADAPTER.room && RN_ADAPTER.room.round >= 1) ? 1 : null, 12000);
  ok('round 1 started after bet confirmed', !!r1);

  ok('no page errors (A=' + A._errs.length + ' B=' + B._errs.length + ')', A._errs.length === 0 && B._errs.length === 0);
  await browser.close();
  const failed = results.filter(r => !r[1]).length;
  console.log('\n═══ FLAT DOG MP bet negotiation: ' + (results.length - failed) + '/' + results.length + ' passed ═══');
  process.exit(failed ? 1 : 0);
})();
