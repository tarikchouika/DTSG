/* متفرج على غرفة شطرنج: يرى الحركات حية ولا يستطيع اللعب ولا يُخصم منه */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
async function wait(page, fn, t) { t = t || 15000; const s = Date.now(); while (Date.now() - s < t) { try { const r = await page.evaluate(fn); if (r) return r; } catch (e) {} await page.waitForTimeout(180); } return null; }
async function mk(ctx, name) {
  await ctx.request.post(BASE + 'api/register', { data: { username: name + Date.now().toString().slice(-5), password: 'pw123456' } });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'));
  await p.waitForTimeout(500);
  await p.evaluate(() => { ST.gold = 50000; });
  await p.evaluate(() => openGame('ch'));
  await wait(p, () => !!(CHESS && typeof window.chessRoomMove === 'function'));
  return p;
}
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const A = await mk(await b.newContext(), 'chspA');
  const B = await mk(await b.newContext(), 'chspB');
  const C = await mk(await b.newContext(), 'chspC');   /* متفرج */
  const results = []; const ok = (n, c) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
  await A.evaluate(() => Rooms.createRoom('ch', 10));
  await wait(A, () => !!(Rooms.state && Rooms.state.code));
  const code = await A.evaluate(() => Rooms.state.code);
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await C.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 3));
  /* C دخل والغرفة ممتلئة → مشاهد تلقائياً (max_players=2 للشطرنج) */
  await wait(C, () => !!(Rooms.state && Rooms.state.players.some(p => p.spectate)), 8000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).every(p => p.ready)));
  await A.evaluate(() => Rooms.startGame());
  await wait(A, () => !!(CHESS && CHESS.mode === 'room' && CHESS.state), 15000);
  await wait(B, () => !!(CHESS && CHESS.mode === 'room' && CHESS.state), 15000);
  await wait(C, () => !!(CHESS && CHESS.mode === 'room' && CHESS.state && !document.getElementById('chessPlay').hidden), 15000);
  ok('spectator entered with board', await C.evaluate(() => CHESS.isSpectator === true && !document.getElementById('chessPlay').hidden));
  ok('spectator not charged', await C.evaluate(() => ST.gold === 50000));
  /* A يلعب e4 → المتفرج يراها */
  await A.evaluate(() => chessClick(6, 4));
  await A.evaluate(() => chessClick(4, 4));
  const seen = await wait(C, () => CHESS.state && CHESS.state.log.length === 1, 10000);
  ok('spectator sees live move (' + await C.evaluate(() => CHESS.state.log.join(' ')) + ')', !!seen);
  /* المتفرج لا يستطيع اللعب */
  await C.evaluate(() => chessClick(1, 4));
  ok('spectator cannot move', await C.evaluate(() => CHESS.state.log.length === 1 && CHESS.sel === null));
  /* B يرد */
  await B.evaluate(() => chessClick(1, 4));
  await B.evaluate(() => chessClick(3, 4));
  const seen2 = await wait(C, () => CHESS.state.log.length === 2, 10000);
  ok('spectator sees reply', !!seen2);
  const pass = results.filter(r => r[1]).length;
  console.log('\nCHESS SPECTATOR: ' + pass + ' passed, ' + (results.length - pass) + ' failed');
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
