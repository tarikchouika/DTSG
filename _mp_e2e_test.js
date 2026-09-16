/* اختبار شامل: رامي جماعي لحظي بين متصفحين حقيقيين عبر الخادم.
   المضيف يفتح غرفة + الضيف ينضم بالكود + بدء + تحركات متبادلة + مطابقة الحالة. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';

/* استطلاع موثوق عبر evaluate (waitForFunction يتعثّر في هذه البيئة) */
async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) { lastErr = e; }
    await page.waitForTimeout(200);
  }
  throw new Error('wait timeout' + (lastErr ? ' (' + lastErr.message + ')' : ''));
}

function snapFn() {
  return () => {
    const ad = window.RamiAdapter;
    if (!ad || !ad.game) return null;
    const g = ad.game, rm = g.roundManager;
    return JSON.stringify({
      cur: rm.currentPlayerIndex,
      phase: rm.turnPhase,
      drawLen: rm.drawPile.length,
      discardLen: rm.discardPile.length,
      discardTop: rm.discardPile.length ? rm.discardPile[rm.discardPile.length - 1].id : null,
      hands: g.players.map(p => p.hand.length),
      tableMelds: rm.tableMelds.length,
      seed: g.seed
    });
  };
}

async function setup(ctx, username) {
  const rr = await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } });
  const rj = (await rr.json().catch(() => ({}))) || {};
  if (!rj.ok) {
    await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } });
  }
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && Rooms.joinSse), 15000);
  await page.waitForTimeout(800); // السماح لـ SSE بالاتصال
  return page;
}

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();

  const A = await setup(ctxA, 'rami_host');
  const B = await setup(ctxB, 'rami_guest');
  console.log('users:', await A.evaluate(() => AUTH.user.username + '/' + AUTH.user.id), '|', await B.evaluate(() => AUTH.user.username + '/' + AUTH.user.id));

  await A.evaluate(() => openGame('rm'));
  await B.evaluate(() => openGame('rm'));
  await wait(A, () => !!(window.RamiAdapter && typeof window.RM_roomMove === 'function'), 10000);
  await wait(B, () => !!(window.RamiAdapter && typeof window.RM_roomMove === 'function'), 10000);

  // المضيف يفتح غرفة رامي
  await A.evaluate(() => Rooms.createRoom('rm', 10));
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code);
  console.log('room code:', code, '| game:', await A.evaluate(() => Rooms.state.game_id));

  // الضيف ينضم بالكود
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  await wait(B, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  console.log('players:', await A.evaluate(() => Rooms.state.players.map(p => p.username + (p.spectate ? '(spec)' : '') + (p.ready ? '✓' : '⏳')).join(', ')));

  // كلاهما جاهز
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 8000);

  // المضيف يبدأ اللعبة
  await A.evaluate(() => Rooms.startGame());

  // كلاهما يدخل الغرفة ويبني الجولة بنفس البذرة
  await wait(A, () => !!(RamiAdapter.multiplayer && RamiAdapter.game && RamiAdapter.game.gamePhase === 'PLAYING'), 20000);
  await wait(B, () => !!(RamiAdapter.multiplayer && RamiAdapter.game && RamiAdapter.game.gamePhase === 'PLAYING'), 20000);

  const seedA = await A.evaluate(() => RamiAdapter.game.seed);
  const seedB = await B.evaluate(() => RamiAdapter.game.seed);
  const myIdA = await A.evaluate(() => RamiAdapter.myPlayerId);
  const myIdB = await B.evaluate(() => RamiAdapter.myPlayerId);
  console.log('seeds A/B:', seedA, seedB, '| seats A/B:', myIdA, myIdB);

  const results = [];
  results.push(['seeds equal', seedA === seedB]);
  results.push(['host seat=0', myIdA === 0]);
  results.push(['guest seat=1', myIdB === 1]);

  // --- تحريكة 1: المضيف (مقعد 0، طالاج، 15 ورقة في مرحلة الرمي) يرمي ورقة ---
  const cardId = await A.evaluate(() => {
    const g = RamiAdapter.game; g.normalizeTurnPhase();
    const p = g.roundManager.getCurrentPlayer();
    const m = g.getLegalMoves(p.id).filter(x => x.type === 'discard');
    return m.length ? m[0].cardId : null;
  });
  console.log('host discards card:', cardId);
  await A.evaluate((c) => ramiAction('discard', c), cardId);

  // الضيف يستقبل: مقعد الدور=1 وأعلى المرموق=cardId
  await wait(B, (c) => {
    const ad = RamiAdapter; if (!ad || !ad.game) return false;
    const rm = ad.game.roundManager;
    const top = rm.discardPile.length ? rm.discardPile[rm.discardPile.length - 1].id : null;
    return rm.currentPlayerIndex === 1 && top === c;
  }, 10000, cardId);

  let sA = await A.evaluate(snapFn());
  let sB = await B.evaluate(snapFn());
  console.log('after host discard — A:', sA);
  console.log('after host discard — B:', sB);
  results.push(['sync after host discard', sA === sB]);

  // --- تحريكة 2: الضيف (مقعد 1، دوره، مرحلة السحب) يسحب ---
  await B.evaluate(() => ramiAction('draw_deck'));
  await wait(A, () => {
    const ad = RamiAdapter; if (!ad || !ad.game) return false;
    const rm = ad.game.roundManager;
    return rm.currentPlayerIndex === 1 && rm.turnPhase === 'WAITING_DISCARD' && ad.game.players[1].hand.length === 15;
  }, 10000);
  sA = await A.evaluate(snapFn()); sB = await B.evaluate(snapFn());
  console.log('after guest draw — A:', sA);
  console.log('after guest draw — B:', sB);
  results.push(['sync after guest draw', sA === sB]);

  // --- تحريكة 3: الضيف يرمي ليمرّر الدور للمضيف ---
  const cardId2 = await B.evaluate(() => {
    const g = RamiAdapter.game; g.normalizeTurnPhase();
    const p = g.roundManager.getCurrentPlayer();
    const m = g.getLegalMoves(p.id).filter(x => x.type === 'discard');
    return m.length ? m[0].cardId : null;
  });
  await B.evaluate((c) => ramiAction('discard', c), cardId2);
  await wait(A, () => !!(RamiAdapter.game && RamiAdapter.game.roundManager.currentPlayerIndex === 0), 10000);
  sA = await A.evaluate(snapFn()); sB = await B.evaluate(snapFn());
  console.log('after guest discard — A:', sA);
  console.log('after guest discard — B:', sB);
  results.push(['sync after guest discard', sA === sB]);
  results.push(['turn back to host', sA.indexOf('"cur":0') !== -1]);

  const errsA = A._errs.filter(e => !/favicon|net::ERR|404|resource/i.test(e));
  const errsB = B._errs.filter(e => !/favicon|net::ERR|404|resource/i.test(e));
  results.push(['no JS errors A', errsA.length === 0]);
  results.push(['no JS errors B', errsB.length === 0]);
  if (errsA.length) console.log('A errors:', errsA);
  if (errsB.length) console.log('B errors:', errsB);

  await browser.close();

  console.log('\n═══ النتائج ═══');
  let pass = true;
  results.forEach(([name, ok]) => { console.log((ok ? '✅' : '❌') + ' ' + name); if (!ok) pass = false; });
  console.log(pass ? '\n✅✅✅ نجاح: مزامنة الرامي الجماعي لحظياً بين متصفحين مؤكدة' : '\n❌ فشل في بعض الفحوص');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
