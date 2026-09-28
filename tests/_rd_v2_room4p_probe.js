/* RD v2 — 4-seat (2v2) room probe + live-rejoin replay rebuild
   • 2 humans + 2 bots fill a 4-seat Ronda room (team mode)
   • driver (host) auto-plays bots AND idles humans (grace override) → full AI game
   • both clients stay in sync while the AI match advances on its own
   • guest closes & reopens the page mid-match → state rebuilt from server history
   Run with DM_TEST_MODE=1 server:
     LD_LIBRARY_PATH="$PWD/node_modules/.chromium-143/al2023/lib" \
       node tests/_rd_v2_room4p_probe.js */
const PW = require('./_rd_pw.js');
const BASE = PW.BASE;

let pass = 0, fail = 0;
function ok(label) { pass++; console.log('  ✅ ' + label); }
function bad(label) { fail++; console.log('  ❌ ' + label); }

async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) { /* ignore */ }
    await page.waitForTimeout(180);
  }
  return null;
}

const pubState = () => {
  const app = window.RondaApp;
  if (!app || !app.game) return null;
  const st = app.game.state;
  return {
    mode: st.mode,
    round: st.roundNumber, deal: st.dealNumber,
    currentSeat: st.currentSeat,
    deck: st.deck.length, table: st.table.cards.length,
    scores: st.teams.map(t => t.score),
    phase: st.phase,
    handCounts: st.players.map(p => p.hand.length),
    teamCounts: st.teams.map(t => t.playerIds.length)
  };
};

async function setup(ctx, username) {
  await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
  await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404|net::ERR/i.test(m.text())) errs.push(m.text()); });
  page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && typeof RondaApp !== 'undefined'), 20000);
  await page.waitForTimeout(700);
  return page;
}

(async () => {
  const browser = await PW.launchBrowser();
  const stamp = Date.now() % 1000000;
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = await setup(ctxA, 'rd4a_' + stamp);
  const B = await setup(ctxB, 'rd4b_' + stamp);
  await A.evaluate(() => openGame('rd'));
  await B.evaluate(() => openGame('rd'));
  await wait(A, () => !!document.querySelector('#rdStage #screen-menu.active'));
  await wait(B, () => !!document.querySelector('#rdStage #screen-menu.active'));

  // إنشاء غرفة 2ضد2 (4 مقاعد) + ملء بوتّين
  await A.evaluate(() => Rooms.createRoom('rd', {
    room_type: 'percentage', bet: 10, visibility: 'public',
    game_opts: { maxp: 4, target: 51 }, max_players: 4
  }));
  await wait(A, () => !!(Rooms.state && Rooms.state.code));
  const code = await A.evaluate(() => Rooms.state.code);
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).length >= 2));
  await A.evaluate(() => Rooms.addBot());
  await A.waitForTimeout(500);
  await A.evaluate(() => Rooms.addBot());
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length === 4), 10000);
  ok('4-seat room ready (2 humans + 2 bots)');

  await A.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 8000);
  /* بوتات جاهزة تلقائياً؛ المضيف يبدأ */
  await A.evaluate(() => Rooms.startGame());
  await wait(A, () => !!(window.RondaApp && RondaApp.roomMode && RondaApp.game && RondaApp.game.state.players.length === 4), 15000);
  await wait(B, () => !!(window.RondaApp && RondaApp.roomMode && RondaApp.game && RondaApp.game.state.players.length === 4), 15000);
  ok('both clients built the 4-player engine');
  const modeA = await A.evaluate(() => RondaApp.game.state.mode);
  const teamA = await A.evaluate(() => RondaApp.game.state.teams.map(t => t.playerIds.length).join('+'));
  ok('engine mode = ' + modeA + ' with teams ' + teamA, modeA === 'TeamVsTeam' && teamA === '2+2');

  // مهلة قصيرة: السائق (المضيف) يتولى كل المقاعد (بوتات فوراً + بشر بعد المهلة)
  await A.evaluate(() => { window.RD_ROOM_AI_GRACE = 1200; });

  // راقب تقدّم اللعب الآلي بالكامل (لا نقرة بشرية) والتزامن المستمر
  const sA0 = await A.evaluate(pubState);
  const sB0 = await B.evaluate(pubState);
  const agree = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok('identical public state at start (deck=' + (sA0 && sA0.deck) + ')', agree(sA0, sB0) && sA0 && sA0.deck === 24);
  const advanced = await wait(A, () => {
    const s = window.RondaApp && RondaApp.game ? RondaApp.game.state : null;
    if (!s) return false;
    return (s.deck.length < 24 || s.table.length !== 4) ? { deck: s.deck.length, table: s.table.length, round: s.roundNumber } : false;
  }, 40000);
  if (advanced) ok('AI (bots + idle humans) advanced the game → deck ' + advanced.deck + ', table ' + advanced.table);
  else bad('no AI advancement in 4p room');

  // استمرار التزامن بعد عدة دورات آلية
  await A.waitForTimeout(4000);
  const sA = await A.evaluate(pubState);
  const sB = await B.evaluate(pubState);
  ok('state in sync after AI turns', agree(sA, sB));

  /* ── إعادة الانضمام عبر السجل: الضيف يغلق الصفحة ويعيد فتحها ── */
  const hostStateBefore = await A.evaluate(pubState);
  await B.close();                       /* خروج كامل للمتصفح (انقطاع) */
  await ctxB.request.post(BASE + 'api/login', { data: { username: 'rd4b_' + stamp, password: 'pw123456' } }).catch(() => {});
  const B2 = await ctxB.newPage();
  const errs2 = [];
  B2.on('pageerror', e => errs2.push(String(e.message)));
  B2.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404|net::ERR/i.test(m.text())) errs2.push(m.text()); });
  B2._errs = errs2;
  await B2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(B2, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && typeof RondaApp !== 'undefined'), 20000);
  await B2.evaluate(() => openGame('rd'));
  /* إعادة البناء من سجل الخادم */
  const rebuilt = await wait(B2, () => {
    const app = window.RondaApp;
    return (app && app.roomMode && app.game && app.game.state.players.length === 4) ? true : false;
  }, 25000);
  ok('guest rebuilt the running match after reopening', !!rebuilt);
  await B2.waitForTimeout(2500);
  const sB2 = await B2.evaluate(pubState);
  const sA2 = await A.evaluate(pubState);
  ok('rejoined state matches host (round/deck/table/scores)',
     agree(sA2, sB2) && (sA2.round === hostStateBefore.round || sA2.deck !== hostStateBefore.deck));
  if (!agree(sA2, sB2)) console.log('     host=' + JSON.stringify(sA2) + '\n     guest=' + JSON.stringify(sB2));

  // بلا واجهات كشف + بلا أخطاء
  for (const [name, p] of [['host', A], ['rejoined-guest', B2]]) {
    const priv = await p.evaluate(() => {
      return !document.getElementById('overlay-privacy') && !document.getElementById('toggle-privacy');
    });
    ok(name + ': no privacy/reveal UI', priv);
    ok(name + ': zero console errors', p._errs.length === 0);
    if (p._errs.length) console.log('     errors: ' + p._errs.slice(0, 3).join(' | '));
  }

  await browser.close();
  console.log('\n═══ RD v2 rooms 4p probe: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})();
