/* غرفة شطرنج ضد بوت تدريبي: ممارسة عبر practiceVsAi — بوت يرد، تعادل، استسلام */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
async function wait(page, fn, t) { t = t || 15000; const s = Date.now(); while (Date.now() - s < t) { try { const r = await page.evaluate(fn); if (r) return r; } catch (e) {} await page.waitForTimeout(180); } return null; }
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext();
  await ctx.request.post(BASE + 'api/register', { data: { username: 'chbot' + Date.now().toString().slice(-5), password: 'pw123456' } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'));
  await p.waitForTimeout(500);
  await p.evaluate(() => { ST.gold = 50000; });
  await p.evaluate(() => openGame('ch'));
  await wait(p, () => !!(CHESS && typeof window.chessRoomMove === 'function'));
  const started = await p.evaluate(() => Rooms.practiceVsAi('ch'));
  const ok1 = await wait(p, () => CHESS && CHESS.mode === 'room' && CHESS.oppBot === true && CHESS.state && !document.getElementById('chessPlay').hidden, 15000);
  const results = [];
  const ok = (n, c) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
  ok('practiceVsAi(ch): room vs bot started', !!ok1 && started !== false);
  ok('human = white', await p.evaluate(() => CHESS.myColor === 'w'));
  /* حركة اللاعب → رد البوت */
  await p.evaluate(() => chessClick(6, 4));   /* e2 */
  await p.evaluate(() => chessClick(4, 4));   /* e4 */
  const botReplied = await wait(p, () => CHESS.state && CHESS.state.log.length >= 2 && CHESS.state.turn === 'w', 10000);
  ok('bot replies to e4 (log: ' + await p.evaluate(() => CHESS.state.log.join(' ')) + ')', !!botReplied);
  /* جولتان إضافيتان للبوت */
  await p.evaluate(() => chessClick(7, 6)); await p.evaluate(() => chessClick(5, 5));   /* Nf3 */
  const r2 = await wait(p, () => CHESS.state.log.length >= 4, 10000);
  ok('bot second reply', !!r2);
  /* استسلام ضد البوت → خسارة (بلا رهن) */
  await p.evaluate(() => { window.confirm = () => true; chessResign(); });
  const resigned = await wait(p, () => CHESS.state.over === true && CHESS.state.outcome === 'b' && CHESS.state.endReason === 'resign', 8000);
  ok('resign vs bot → black wins', !!resigned);
  /* مباراة جديدة → بوت يرد مجدداً */
  await p.evaluate(() => chessNewMatch());
  await wait(p, () => CHESS.state && !CHESS.state.over && CHESS.state.log.length === 0, 8000);
  await p.evaluate(() => chessClick(6, 4)); await p.evaluate(() => chessClick(4, 4));
  const r3 = await wait(p, () => CHESS.state.log.length >= 2, 10000);
  ok('new match vs bot works', !!r3);
  /* تعادل ضد البوت: موازن → يقبل فوراً */
  const gold0 = await p.evaluate(() => ST.gold);
  await p.evaluate(() => { CHESS.state.full = 10; chessDrawOffer(); });
  const drew = await wait(p, () => CHESS.state.over === true && CHESS.state.outcome === 'draw', 8000);
  ok('draw vs bot accepted (balanced)', !!drew);
  ok('bot room is free (no bet)', gold0 === 50000 && await p.evaluate(() => ST.gold) === 50000);
  ok('0 page errors', errs.length === 0);
  if (errs.length) console.log('   errs:', errs.slice(0, 3));
  const pass = results.filter(r => r[1]).length;
  console.log('\nCHESS BOT ROOM: ' + pass + ' passed, ' + (results.length - pass) + ' failed');
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
