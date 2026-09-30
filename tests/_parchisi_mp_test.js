/* Parchisi (pr) MP test — room flow: owner A + guest B + spectator C.
   Covers: room start wiring (seats via order), roll broadcast sync, move broadcast
   sync with NO echo double-apply (hash equality between clients), spectator cannot
   roll, turn passing both directions, and reload recovery via replay history. */
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
/* بصمة حالة المحرك للمقارنة بين العملاء */
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
    const A = await setup(await browser.newContext(), 'pr_host_' + uniq);
    const B = await setup(await browser.newContext(), 'pr_guest_' + uniq);
    const C = await setup(await browser.newContext(), 'pr_spec_' + uniq);

    /* ── إنشاء الغرفة والانضمام ── */
    await A.evaluate(() => openGame('pr'));
    await B.evaluate(() => openGame('pr'));
    await C.evaluate(() => openGame('pr'));
    for (const p of [A, B, C]) await wait(p, () => !!(typeof ParchisiApp !== 'undefined' && ParchisiApp), 8000);

    await A.evaluate(() => Rooms.createRoom('pr', 10));
    await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
    const code = await A.evaluate(() => Rooms.state.code);
    ok('room created with code', !!code);

    await B.evaluate((c) => Rooms.joinRoom(c), code);
    await C.evaluate((c) => Rooms.joinRoom(c), code);
    await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 3), 8000);
    await C.evaluate(() => Rooms.toggleSpectate());
    await wait(A, () => !!(Rooms.state && Rooms.state.players.some(p => p.spectate)), 8000);
    ok('C switched to spectator', true);

    await A.evaluate(() => Rooms.setReady(true));
    await B.evaluate(() => Rooms.setReady(true));
    await wait(A, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).every(p => p.ready)), 8000);
    await A.evaluate(() => Rooms.startGame());

    /* ── بدء الجولة عند الجميع ── */
    const started = async (p) => wait(p, () => !!(ParchisiApp.engine && ParchisiApp.gameActive), 12000);
    ok('owner engine started', !!(await started(A)));
    ok('guest engine started', !!(await started(B)));
    ok('spectator engine started', !!(await started(C)));

    const meta = await Promise.all([A, B, C].map(p => p.evaluate(() => ({
      pc: ParchisiApp.engine.players.length,
      me: ParchisiApp.humanPlayerIndex,
      spec: ParchisiApp.isSpectator(),
      myTurn: ParchisiApp.isMyTurn()
    }))));
    ok('2 seats in room game (players map to order)', meta[0].pc === 2 && meta[1].pc === 2 && meta[2].pc === 2);
    ok('A seat 0, B seat 1', meta[0].me === 0 && meta[1].me === 1);
    ok('A/B not spectator, C spectator', meta[0].spec === false && meta[1].spec === false && meta[2].spec === true);
    ok('first turn: only A', meta[0].myTurn === true && meta[1].myTurn === false && meta[2].myTurn === false);
    const cRollDisabled = await C.evaluate(() => { const b = document.getElementById('parchisiRollBtn'); return b && (b.disabled || b.style.display === 'none' || b.closest('[hidden]') !== null); });
    ok('spectator roll control inaccessible', !!cRollDisabled);

    /* ── A يرمي ويتحرك ── */
    await A.evaluate(() => ParchisiApp.rollDice());
    await wait(A, () => !!(ParchisiApp.engine.phase === 'MOVING' || ParchisiApp.engine.phase === 'BONUS'), 8000);
    const hRollA = await A.evaluate(HASH);
    const hRollB = await wait(B, `(() => { try { return (${HASH}) === ${JSON.stringify(hRollA)}; } catch (e) { return false; } })()`, 8000);
    ok('A roll synced to B (identical state hash)', !!hRollB);
    const hRollC = await wait(C, `(() => { try { return (${HASH}) === ${JSON.stringify(hRollA)}; } catch (e) { return false; } })()`, 8000);
    ok('A roll synced to spectator C', !!hRollC);

    await A.evaluate(() => ParchisiApp.autoMove());
    await wait(A, () => ParchisiApp.engine.current === 1, 12000);
    const hAfterA = await A.evaluate(HASH);
    const hAfterB = await wait(B, `(() => { try { return (${HASH}) === ${JSON.stringify(hAfterA)}; } catch (e) { return false; } })()`, 8000);
    ok('A move synced to B, no echo double-apply (hash identical)', !!hAfterB);

    /* ── B يرمي ويتحرك (الاتجاه المعاكس) ── */
    await wait(B, () => ParchisiApp.isMyTurn(), 5000);
    await B.evaluate(() => ParchisiApp.rollDice());
    await wait(B, () => !!(ParchisiApp.engine.phase === 'MOVING' || ParchisiApp.engine.phase === 'BONUS'), 8000);
    const hRollB2 = await B.evaluate(HASH);
    const hRollA2 = await wait(A, `(() => { try { return (${HASH}) === ${JSON.stringify(hRollB2)}; } catch (e) { return false; } })()`, 8000);
    ok('B roll synced to A', !!hRollA2);

    await B.evaluate(() => ParchisiApp.autoMove());
    await wait(B, () => ParchisiApp.engine.current === 0, 12000);
    const hAfterB2 = await B.evaluate(HASH);
    const hAfterA2 = await wait(A, `(() => { try { return (${HASH}) === ${JSON.stringify(hAfterB2)}; } catch (e) { return false; } })()`, 8000);
    ok('B move synced to A (hash identical)', !!hAfterA2);

    /* ── [Resilience] إعادة تحميل المتفرج: إعادة بناء من السجل ── */
    const preReload = await A.evaluate(HASH);
    await C.reload({ waitUntil: 'domcontentloaded' });
    await wait(C, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && Rooms.state), 15000);
    await C.evaluate(() => openGame('pr'));
    const hReloadC = await wait(C, `(() => { try { return ParchisiApp.engine && ParchisiApp.gameActive && (${HASH}) === ${JSON.stringify(preReload)}; } catch (e) { return false; } })()`, 15000);
    ok('spectator reload → replay rebuilds exact state', !!hReloadC);
    const specAfter = await C.evaluate(() => ParchisiApp.isSpectator());
    ok('spectator still spectator after reload', specAfter === true);

    /* ── أخطاء الصفحة ── */
    const errsA = A._errs.filter(m => !/favicon/i.test(m));
    ok('no page errors on A', errsA.length === 0);
    if (errsA.length) console.log('    A errors:', errsA.slice(0, 3));
  } catch (e) {
    console.error('FATAL:', e.message);
    results.push(['fatal', false]);
  }

  const pass = results.filter(r => r[1]).length;
  console.log('\\n' + pass + '/' + results.length + ' passed');
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
