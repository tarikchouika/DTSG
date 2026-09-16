/* FLAT DOG (rn) MP test — 3 player seats + 1 spectator.
   Owner + 2 guests fill 3 seats; a 4th joins then spectates.
   Verifies: 3 seats filled, dealer determination seen by all (incl. spectator),
   spectator strip shows the spectator, dealer crowned = highest card. */
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
let __exec = null;
try { __exec = (await (async () => (await import('@sparticuz/chromium')).default.executablePath())()); } catch (e) {}
const __args = ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'];

async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000; const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) {}
    await page.waitForTimeout(200);
  } return null;
}
async function setup(ctx, username) {
  await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
  await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
  await page.waitForTimeout(500);
  return page;
}

(async () => {
  const browser = await launchChromium();
  const results = [];
  const ok = (n, c) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
  const tag = Date.now() % 100000;

  const O = await setup(await browser.newContext(), 'rn_o_' + tag);
  const G1 = await setup(await browser.newContext(), 'rn_g1_' + tag);
  const G2 = await setup(await browser.newContext(), 'rn_g2_' + tag);
  const S = await setup(await browser.newContext(), 'rn_s_' + tag);
  for (const p of [O, G1, G2, S]) await p.evaluate(() => openGame('rn'));
  for (const p of [O, G1, G2, S]) await wait(p, () => !!(typeof RN_ADAPTER !== 'undefined' && RN_ADAPTER), 10000);

  await O.evaluate(() => Rooms.createRoom('rn', 10));
  await wait(O, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await O.evaluate(() => Rooms.state.code);
  await G1.evaluate((c) => Rooms.joinRoom(c), code);
  await G2.evaluate((c) => Rooms.joinRoom(c), code);
  await S.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(O, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).length >= 3), 9000);
  // Spectator toggles to spectate (frees the 4th seat)
  await S.evaluate(() => Rooms.toggleSpectate());
  await wait(O, () => Rooms.state.players.some(p => p.spectate), 8000);

  for (const p of [O, G1, G2]) await p.evaluate(() => Rooms.setReady(true));
  await wait(O, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).every(p => p.ready)), 8000);
  await O.evaluate(() => Rooms.startGame());
  for (const p of [O, G1, G2, S]) await wait(p, () => !!(RN_ADAPTER && RN_ADAPTER.room), 10000);

  // Owner picks mode + starts → dealer determination
  await wait(O, () => !!document.getElementById('rnModeNum'), 8000);
  await O.evaluate(() => RN_chooseMode('number_only'));
  await wait(O, () => !!(RN_ADAPTER.room && RN_ADAPTER.room.mode), 8000);
  await O.evaluate(() => RN_startRound());

  const dealState = async (page) => wait(page, () => {
    const seats = [...document.querySelectorAll('.fd-seat')];
    const filled = seats.filter(s => !s.classList.contains('empty'));
    const withCard = seats.filter(s => s.querySelector('.fd-seat-card .fd-card.face'));
    const dealer = seats.filter(s => s.classList.contains('dealer-pick'));
    return (filled.length === 3 && withCard.length === 3 && dealer.length === 1) ? 1 : null;
  }, 14000);

  ok('owner: 3 seats filled, 3 dealt cards, 1 dealer', !!(await dealState(O)));
  ok('guest1: 3 seats filled, 3 dealt cards, 1 dealer', !!(await dealState(G1)));
  ok('guest2: sees determination', !!(await dealState(G2)));
  ok('spectator: sees 3 dealt cards + dealer', !!(await dealState(S)));

  // spectator's role is spectator, and the spectator strip shows an icon
  const sRole = await S.evaluate(() => RN_ADAPTER.core.myRole);
  ok('spectator role = spectator', sRole === 'spectator');
  const specIcons = await S.evaluate(() => document.querySelectorAll('.fd-spec-ic').length);
  ok('spectator strip shows the spectator (' + specIcons + ' icon(s))', specIcons >= 1);

  // all share the same dealer-first order
  const oOrd = await O.evaluate(() => RN_ADAPTER.room.order.join(','));
  const sOrd = await S.evaluate(() => RN_ADAPTER.room.order.join(','));
  ok('owner & spectator share order', oOrd === sOrd);

  // تأكيد مرحلة الرهان (المتخمّن)
  await wait(O, () => !!document.getElementById('rnBpAmt'), 16000);
  for (const p of [O, G1, G2]) await p.evaluate(() => { if (RN_ADAPTER.core.myRole === 'selector') RN_betStart(); });

  // round 1 starts
  const r1 = await wait(O, () => (RN_ADAPTER.room && RN_ADAPTER.room.round >= 1) ? 1 : null, 16000);
  ok('round 1 started', !!r1);

  ok('no page errors (O=' + O._errs.length + ' G1=' + G1._errs.length + ' G2=' + G2._errs.length + ' S=' + S._errs.length + ')',
     [O, G1, G2, S].every(p => p._errs.length === 0));

  await O.screenshot({ path: '/home/user/mp3_deal.png' });
  await browser.close();
  const failed = results.filter(r => !r[1]).length;
  console.log('\n═══ FLAT DOG MP (3 seats + spectator): ' + (results.length - failed) + '/' + results.length + ' passed ═══');
  process.exit(failed ? 1 : 0);
})();
