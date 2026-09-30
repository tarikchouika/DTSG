/* Parchisi (pr) MP bot test — host A + AI bot seat + spectator D.
   A is the bot-driver: when the bot's turn comes, A's client rolls & moves the bot
   and BROADCASTS both (rmove) — the spectator's engine must stay in sync (hash equality),
   and the game must progress past the bot turn automatically. */
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
    const A = await setup(await browser.newContext(), 'pr_bh_' + uniq);
    const D = await setup(await browser.newContext(), 'pr_bs_' + uniq);

    await A.evaluate(() => openGame('pr'));
    await D.evaluate(() => openGame('pr'));
    for (const p of [A, D]) await wait(p, () => !!(typeof ParchisiApp !== 'undefined' && ParchisiApp), 8000);

    await A.evaluate(() => Rooms.createRoom('pr', 10));
    await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
    const code = await A.evaluate(() => Rooms.state.code);
    await A.evaluate(() => Rooms.addBot());
    await wait(A, () => !!(Rooms.state && Rooms.state.players.some(p => p.isBot)), 8000);
    ok('bot seat added', true);

    await D.evaluate((c) => Rooms.joinRoom(c), code);
    await wait(A, () => Rooms.state.players.length >= 3, 8000);
    await D.evaluate(() => Rooms.toggleSpectate());
    await wait(A, () => Rooms.state.players.some(p => p.spectate), 8000);

    await A.evaluate(() => Rooms.setReady(true));
    await wait(A, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).every(p => p.ready)), 8000);
    await A.evaluate(() => Rooms.startGame());

    ok('A engine started', !!(await wait(A, () => !!(ParchisiApp.engine && ParchisiApp.gameActive), 12000)));
    ok('D engine started', !!(await wait(D, () => !!(ParchisiApp.engine && ParchisiApp.gameActive), 12000)));

    const types = await A.evaluate(() => ParchisiApp.engine.players.map(p => p.type));
    ok('seat types [human, ai]', JSON.stringify(types) === JSON.stringify(['human', 'ai']));
    const drv = await A.evaluate(() => ParchisiApp.isBotDriver());
    ok('A is the bot driver', drv === true);

    /* A يرمي ويتحرك → دور البوت */
    await A.evaluate(() => ParchisiApp.rollDice());
    await wait(A, () => !!(ParchisiApp.engine.phase === 'MOVING' || ParchisiApp.engine.phase === 'BONUS'), 8000);
    await A.evaluate(() => ParchisiApp.autoMove());
    await wait(A, () => ParchisiApp.engine.current === 1, 10000);
    ok('turn reached bot seat', true);

    /* السائق يقود البوت تلقائياً حتى يعود الدور لصاحب الغرفة */
    const backToA = await wait(A, () => ParchisiApp.engine.current === 0, 20000);
    ok('bot turn auto-played by driver, turn back to A', !!backToA);

    /* المتفرج متطابق تماماً (حركات البوت بُثّت وطبّقت عنده) */
    const hA = await A.evaluate(HASH);
    const hD = await wait(D, `(() => { try { return (${HASH}) === ${JSON.stringify(hA)}; } catch (e) { return false; } })()`, 8000);
    ok('spectator hash identical after bot turn', !!hD);

    /* جولة ثانية كاملة للتأكد من الاستمرارية */
    await A.evaluate(() => ParchisiApp.rollDice());
    await wait(A, () => !!(ParchisiApp.engine.phase === 'MOVING' || ParchisiApp.engine.phase === 'BONUS'), 8000);
    await A.evaluate(() => ParchisiApp.autoMove());
    const secondBot = await wait(A, () => ParchisiApp.engine.current === 0, 20000);
    ok('second bot turn auto-played', !!secondBot);
    const hA2 = await A.evaluate(HASH);
    const hD2 = await wait(D, `(() => { try { return (${HASH}) === ${JSON.stringify(hA2)}; } catch (e) { return false; } })()`, 8000);
    ok('spectator still in sync', !!hD2);

    const errsA = A._errs.filter(m => !/favicon/i.test(m));
    ok('no page errors on A', errsA.length === 0);
    if (errsA.length) console.log('    A errors:', errsA.slice(0, 3));
    const errsD = D._errs.filter(m => !/favicon/i.test(m));
    ok('no page errors on D', errsD.length === 0);
    if (errsD.length) console.log('    D errors:', errsD.slice(0, 3));
  } catch (e) {
    console.error('FATAL:', e.message);
    results.push(['fatal', false]);
  }

  const pass = results.filter(r => r[1]).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
