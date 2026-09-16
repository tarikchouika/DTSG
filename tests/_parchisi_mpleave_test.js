/* Parchisi (pr) leave-tolerance test — A + B playing; host times out B's seat.
   B's seat converts to AI (syncRoomSeats via room:update), the driver (A) plays it,
   broadcasts reach B (now spectator) — game continues without stalling. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';

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
  await page.waitForTimeout(500);
  return page;
}
const HASH = `(() => {
  const e = ParchisiApp.engine; if (!e) return null;
  return JSON.stringify({
    cur: e.current, ph: e.phase, dice: e.dice, used: e.used,
    pieces: e.players.map(p => p.pieces.map(pc => pc.state + pc.pos)),
    types: e.players.map(p => p.type)
  });
})()`;

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  const ok = (n, c) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
  const uniq = Date.now() % 10000;

  try {
    const A = await setup(await browser.newContext(), 'pr_lh_' + uniq);
    const B = await setup(await browser.newContext(), 'pr_lg_' + uniq);

    await A.evaluate(() => openGame('pr'));
    await B.evaluate(() => openGame('pr'));
    for (const p of [A, B]) await wait(p, () => !!(typeof ParchisiApp !== 'undefined' && ParchisiApp), 8000);

    await A.evaluate(() => Rooms.createRoom('pr', 10));
    await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
    const code = await A.evaluate(() => Rooms.state.code);
    const aId = await A.evaluate(() => AUTH.user.id);
    await B.evaluate((c) => Rooms.joinRoom(c), code);
    await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
    await A.evaluate(() => Rooms.setReady(true));
    await B.evaluate(() => Rooms.setReady(true));
    await wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 8000);
    await A.evaluate(() => Rooms.startGame());
    ok('both engines started', !!(await wait(A, () => !!(ParchisiApp.engine && ParchisiApp.gameActive), 12000))
      && !!(await wait(B, () => !!(ParchisiApp.engine && ParchisiApp.gameActive), 12000)));

    /* A يرمي ويتحرك → دور B */
    await A.evaluate(() => ParchisiApp.rollDice());
    await wait(A, () => !!(ParchisiApp.engine.phase === 'MOVING' || ParchisiApp.engine.phase === 'BONUS'), 8000);
    await A.evaluate(() => ParchisiApp.autoMove());
    await wait(A, () => ParchisiApp.engine.current === 1, 10000);
    ok('turn is at B (seat 1)', true);

    /* المضيف يعلن انتهاء مهلة B → يصبح متفرجاً ومقعده آلي */
    const bId = await B.evaluate(() => AUTH.user.id);
    await A.evaluate((pid) => API.post('/api/rooms/timeoutSeat', { room_id: Rooms.state.id, playerId: pid }), bId);
    const conv = await wait(A, () => ParchisiApp.engine.players[1].type === 'ai', 10000);
    ok('B seat converted to AI on A (syncRoomSeats)', !!conv);
    const convB = await wait(B, () => ParchisiApp.engine.players[1].type === 'ai', 10000);
    ok('B seat converted to AI on B too', !!convB);
    const bSpec = await wait(B, () => ParchisiApp.isSpectator() === true, 10000);
    ok('B is now spectator', !!bSpec);

    /* السائق (A) يقود مقعد B الآلي → يعود الدور لـ A */
    const back = await wait(A, () => ParchisiApp.engine.current === 0, 20000);
    ok('timed-out seat auto-played, turn back to A', !!back);

    /* B (متفرج الآن) متطابق */
    const hA = await A.evaluate(HASH);
    const hB = await wait(B, `(() => { try { return (${HASH}) === ${JSON.stringify(hA)}; } catch (e) { return false; } })()`, 8000);
    ok('B (spectator) hash identical', !!hB);

    const errsA = A._errs.filter(m => !/favicon/i.test(m));
    ok('no page errors on A', errsA.length === 0);
    if (errsA.length) console.log('    A errors:', errsA.slice(0, 3));
  } catch (e) {
    console.error('FATAL:', e.message);
    results.push(['fatal', false]);
  }

  const pass = results.filter(r => r[1]).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
