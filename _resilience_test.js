/* اختبار المرونة: خروج/انقطاع/إغلاق لاعب لا يُجمّد الجولة، ويمكن العودة في أي وقت.
   (أ) إعادة الاتصال تعيد بناء الحالة الجارية كاملةً من سجل الحركات.
   (ب) دور اللاعب المنقطع يتقدّم (السائق يلعب آلياً عنه بعد المهلة).
   (ج) انقطاع المالك/السائق → إعادة تعيين السائق للاعب المتبقي. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';

async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now(); let lastErr = null;
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) { lastErr = e; }
    await page.waitForTimeout(200);
  }
  throw new Error('wait timeout' + (lastErr ? ' (' + lastErr.message + ')' : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function snapFn() {
  return () => {
    const ad = window.RamiAdapter;
    if (!ad || !ad.game) return null;
    const g = ad.game, rm = g.roundManager;
    return JSON.stringify({
      cur: rm.currentPlayerIndex, phase: rm.turnPhase,
      drawLen: rm.drawPile.length, discardLen: rm.discardPile.length,
      discardTop: rm.discardPile.length ? rm.discardPile[rm.discardPile.length - 1].id : null,
      hands: g.players.map(p => p.hand.length), tableMelds: rm.tableMelds.length, seed: g.seed
    });
  };
}

async function setup(ctx, username) {
  const rr = await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } });
  const rj = (await rr.json().catch(() => ({}))) || {};
  if (!rj.ok) await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && Rooms.joinSse), 15000);
  await page.waitForTimeout(700);
  return page;
}

/* تنفيذ دور كامل للاعب الحالي على الصفحة (سحب إن لزم + رمي) */
async function takeTurn(page) {
  const phase = await page.evaluate(() => RamiAdapter && RamiAdapter.game ? RamiAdapter.game.roundManager.turnPhase : null);
  if (phase === 'WAITING_DRAW') { await page.evaluate(() => ramiAction('draw_deck')); await sleep(450); }
  const cardId = await page.evaluate(() => {
    const g = RamiAdapter.game; g.normalizeTurnPhase();
    const p = g.roundManager.getCurrentPlayer();
    const m = g.getLegalMoves(p.id).filter(x => x.type === 'discard');
    return m.length ? m[0].cardId : null;
  });
  if (cardId != null) await page.evaluate(c => ramiAction('discard', c), cardId);
  await sleep(500);
}

/* إنشاء غرفة + انضمام + جاهزية + بدء حتى يصبح كلاهما في PLAYING */
async function startRoom(A, B, ctxA) {
  await A.evaluate(() => openGame('rm'));
  await B.evaluate(() => openGame('rm'));
  await wait(A, () => !!(window.RamiAdapter && typeof window.RM_roomMove === 'function'), 10000);
  await wait(B, () => !!(window.RamiAdapter && typeof window.RM_roomMove === 'function'), 10000);
  await A.evaluate(() => Rooms.createRoom('rm', 10));
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code);
  await B.evaluate(c => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  await wait(B, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 8000);
  await A.evaluate(() => Rooms.startGame());
  await wait(A, () => !!(RamiAdapter.multiplayer && RamiAdapter.game && RamiAdapter.game.gamePhase === 'PLAYING'), 20000);
  await wait(B, () => !!(RamiAdapter.multiplayer && RamiAdapter.game && RamiAdapter.game.gamePhase === 'PLAYING'), 20000);
  return code;
}

const ok = (c, m) => console.log((c ? '  ✓ ' : '  ✗ ') + m);

(async () => {
  const results = [];
  const U = Date.now().toString().slice(-5);

  /* ═══ (أ) إعادة الاتصال تعيد بناء الحالة كاملةً ═══ */
  console.log('\n[Res-A] إعادة الاتصال بعد الإغلاق تعيد بناء الجولة الجارية');
  {
    const b1 = await chromium.launch();
    const ctxA = b1.newContext(), ctxB = b1.newContext();
    const A = await setup(await ctxA, 'ra' + U + 'a'), B = await setup(await ctxB, 'rb' + U + 'a');
    await startRoom(A, B, ctxA);
    const seed = await A.evaluate(() => RamiAdapter.game.seed);
    const code = await A.evaluate(() => Rooms.state.code);

    /* عدة تحركات لبناء حالة غنية */
    await takeTurn(A);                     // المضيف يرمي
    await wait(B, () => RamiAdapter.game.roundManager.currentPlayerIndex === 1, 8000);
    await takeTurn(B);                     // الضيف يسحب ويرمي
    await wait(A, () => RamiAdapter.game.roundManager.currentPlayerIndex === 0, 8000);
    await takeTurn(A);                     // المضيف يسحب ويرمي
    await wait(B, () => RamiAdapter.game.roundManager.currentPlayerIndex === 1, 8000);

    const snapA = await A.evaluate(snapFn());
    const snapB = await B.evaluate(snapFn());
    console.log('  قبل القطع — A:', snapA);
    console.log('  قبل القطع — B:', snapB);
    ok(snapA === snapB, 'الحالة متطابقة قبل القطع');

    /* القطع: نغلق صفحة الضيف بالكامل ثم نعيد فتحها بنفس الجلسة (الكوكي) */
    await B.close();
    await sleep(1500);                     // السيرفر يكتشف انقطاع SSE
    const B2 = await (await ctxB).newPage();
    await B2.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(B2, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
    await B2.evaluate(() => openGame('rm'));

    /* إعادة البناء من السجل عبر room:replay → RamiAdapter.game مبني */
    const rebuilt = await wait(B2, () => {
      const ad = window.RamiAdapter;
      return (ad && ad.game && ad.game.gamePhase === 'PLAYING') ? 'ok' : null;
    }, 15000);
    ok(!!rebuilt, 'الجولة أُعيد بناؤها بعد العودة (game=PLAYING)');

    const snapB2 = await B2.evaluate(snapFn());
    const seedB2 = await B2.evaluate(() => RamiAdapter.game.seed);
    console.log('  بعد العودة  — B2:', snapB2);
    ok(seedB2 === seed, 'البذرة محفوظة بعد العودة');
    ok(snapB2 === snapA, 'الحالة بعد العودة = حالة المضيف (استعادة كاملة)');

    /* صفحة جديدة بالكامل (إغلاق التبويب وفتح آخر) تعيد البناء عبر SSE room:replay */
    await B2.close();
    await sleep(1200);
    const B3 = await (await ctxB).newPage();
    await B3.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(B3, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
    await B3.evaluate(() => openGame('rm'));
    const rebuilt2 = await wait(B3, () => {
      const ad = window.RamiAdapter;
      return (ad && ad.game && ad.game.gamePhase === 'PLAYING') ? 'ok' : null;
    }, 15000);
    const snapB3 = await B3.evaluate(snapFn());
    ok(!!rebuilt2 && snapB3 === snapA, 'تبويب جديد يُعيد بناء نفس الحالة عبر السجل');

    results.push(['A: state identical before disconnect', snapA === snapB]);
    results.push(['A: game rebuilt after reconnect', !!rebuilt]);
    results.push(['A: seed preserved', seedB2 === seed]);
    results.push(['A: full state restored == host', snapB2 === snapA]);
    results.push(['A: fresh tab restores via replay', !!rebuilt2 && snapB3 === snapA]);
    await b1.close();
  }

  /* ═══ (ب) دور اللاعب المنقطع يتقدّم (السائق يلعب آلياً) ═══ */
  console.log('\n[Res-B] دور اللاعب المنقطع لا يتجمّد — السائق يلعب عنه');
  {
    const b2 = await chromium.launch();
    const ctxA = b2.newContext(), ctxB = b2.newContext();
    const A = await setup(await ctxA, 'ta' + U + 'b'), B = await setup(await ctxB, 'tb' + U + 'b');
    await startRoom(A, B, ctxA);

    /* تقصير المؤقّت + مهلة السائق لتسريع الاختبار على كلا الطرفين */
    for (const p of [A, B]) {
      await p.evaluate(() => {
        if (RamiAdapter && RamiAdapter.game) { RamiAdapter.game.rules.turnSeconds = 3; RamiAdapter.game.roundManager.turnSecondsRemaining = 3; }
        if (RamiAdapter) RamiAdapter._driverGraceMs = 2000;
      });
    }

    /* اجعل الدور للضيف (B) ثم اقطعه */
    await takeTurn(A);                     // المضيف → الدور للضيف
    const onGuest = await wait(B, () => RamiAdapter.game.roundManager.currentPlayerIndex === 1 ? 1 : null, 8000);
    ok(!!onGuest, 'الدور صار للضيف قبل القطع');

    const handsBefore = await A.evaluate(() => RamiAdapter.game.players.map(p => p.hand.length));
    const discardBefore = await A.evaluate(() => RamiAdapter.game.roundManager.discardPile.length);
    const B_id = await B.evaluate(() => AUTH.user.id);
    await B.close();                       // الضيف ينقطع أثناء دوره
    await sleep(1200);                     // السيرفر يكتشف الانقطاع

    /* انتظر حتى يلعب السائق (المضيف) آلياً عن الضيف: المرموق ينمو رغم انقطاعه */
    const advanced = await wait(A, (d) => {
      const ad = RamiAdapter; if (!ad || !ad.game) return null;
      const rm = ad.game.roundManager;
      if (rm.discardPile.length > d) return 'ok';
      return null;
    }, 16000, discardBefore);
    ok(!!advanced, 'السائق لعب آلياً عن اللاعب المنقطع (المرموق نما) — لا تجمّد');

    /* والشوط التالي للمنقطع يُدار أيضاً: الدور يستمر في التقدّم */
    const keptMoving = await wait(A, (d) => {
      const ad = RamiAdapter; if (!ad || !ad.game) return null;
      return ad.game.roundManager.discardPile.length >= d ? 'ok' : null;
    }, 12000, discardBefore + 2);
    ok(!!keptMoving, 'الجولة تواصل التقدّم عبر أدوار متعددة رغم الانقطاع');

    const stalled = await A.evaluate(() => RamiAdapter.game.gamePhase === 'PLAYING' ? 'live' : 'stalled');
    ok(stalled === 'live', 'الجولة ما زالت حيّة بعد معالجة الانقطاع');

    results.push(['B: driver auto-played disconnected turn', !!advanced]);
    results.push(['B: round keeps advancing', !!keptMoving]);
    results.push(['B: round still live', stalled === 'live']);
    await b2.close();
  }

  /* ═══ (ج) انقطاع المالك/السائق → إعادة تعيين السائق ═══ */
  console.log('\n[Res-C] انقطاع المالك → إعادة تعيين السائق للاعب المتبقي');
  {
    const b3 = await chromium.launch();
    const ctxA = b3.newContext(), ctxB = b3.newContext();
    const A = await setup(await ctxA, 'oa' + U + 'c'), B = await setup(await ctxB, 'ob' + U + 'c');
    await startRoom(A, B, ctxA);

    const ownerBefore = await A.evaluate(() => Rooms.state.driverId != null ? Rooms.state.driverId : Rooms.state.owner_id);
    const guestId = await B.evaluate(() => AUTH.user.id);
    ok(String(ownerBefore) === String(await A.evaluate(() => AUTH.user.id)), 'السائق = المالك قبل القطع');

    await A.close();                       // المالك/السائق ينقطع
    await sleep(1500);                     // السيرفر يكتشف ويعيد التعيين
    const newDriver = await wait(B, (g) => {
      const r = Rooms.state; if (!r) return null;
      return String(r.driverId) === String(g) ? 'me' : r.driverId;
    }, 10000, guestId);
    ok(newDriver === 'me', 'السائق أُعيد تعيينه للضيف المتبقي بعد انقطاع المالك');
    const isDrv = await B.evaluate(() => { try { return RamiAdapter._isDriver(); } catch (e) { return null; } });
    ok(isDrv === true, 'الضيف صار السائق (_isDriver=true)');

    results.push(['C: driver reassigned to survivor', newDriver === 'me']);
    results.push(['C: survivor isDriver', isDrv === true]);
    await b3.close();
  }

  /* ═══ الخلاصة ═══ */
  console.log('\n═══ النتائج ═══');
  let pass = 0;
  for (const [m, c] of results) { console.log((c ? '✅ ' : '❌ ') + m); if (c) pass++; }
  console.log('\nالنتيجة: ' + pass + ' نجح / ' + (results.length - pass) + ' فشل');
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
