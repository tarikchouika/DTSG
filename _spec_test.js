/* اختبار نظام المتفرج (بنود 4+5): مضيف + لاعب + متفرج.
   - المتفرج يُكتشف ويدخل وضع المراقبة (isSpectator).
   - يرى الطاولة + شارات عدد الأوراق لكل لاعب (دون كشف الوجوه).
   - لا يستطيع اللعب (لا أزرار فعل).
   - تزامن أفعال اللاعبين تصل للمتفرج.
   - طلب الانضمام يُسجَّل، وعند مغادرة لاعب يُرقّى المتفرج. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const _UNIQ = Date.now().toString().slice(-5);

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

async function setup(ctx, username) {
  const rr = await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } });
  const rj = (await rr.json().catch(() => ({}))) || {};
  if (!rj.ok) await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && Rooms.joinSse), 15000);
  await page.waitForTimeout(800);
  return page;
}

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(), ctxC = await browser.newContext();
  const A = await setup(ctxA, 'spec_host'+_UNIQ);
  const B = await setup(ctxB, 'spec_plr'+_UNIQ);
  const C = await setup(ctxC, 'spec_watch'+_UNIQ);

  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

  for (const p of [A, B, C]) await p.evaluate(() => openGame('rm'));
  await wait(A, () => !!(window.RamiAdapter && typeof window.RM_roomMove === 'function'), 10000);
  await wait(C, () => !!(window.RamiAdapter && typeof window.RM_roomMove === 'function'), 10000);

  // المضيف يفتح غرفة (مقعدين فقط = ممتلئة بلاعبَين، والمتفرج يُضاف تلقائياً)
  const rres = await ctxA.request.post(BASE + 'api/rooms', { data: { game_id: 'rm', max_players: 2 } });
  const rj2 = (await rres.json().catch(() => ({}))) || {};
  await A.evaluate((r) => { Rooms.state = r; Rooms.render(); Rooms.openModal(); }, rj2.room);
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code);
  console.log('room:', code, 'max:', await A.evaluate(() => Rooms.state.max_players));

  // اللاعب ينضم (يصبح 2/2 ممتلئة)
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  // المتفرج ينضم → يُضاف تلقائياً كمشاهد (الغرفة ممتلئة)
  await C.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.some(p => p.spectate)), 8000);
  console.log('players:', await A.evaluate(() => Rooms.state.players.map(p => p.username + (p.spectate ? '(spec)' : '')).join(', ')));

  // الجاهزية + البدء
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).every(p => p.ready)), 8000);
  await A.evaluate(() => Rooms.startGame());

  // المضيف واللاعب يلعبان؛ المتفرج يدخل وضع المراقبة
  await wait(A, () => !!(RamiAdapter.multiplayer && RamiAdapter.game && RamiAdapter.game.gamePhase === 'PLAYING'), 20000);
  await wait(C, () => !!(RamiAdapter.game && RamiAdapter.isSpectator === true && RamiAdapter.game.gamePhase === 'PLAYING'), 20000);
  console.log('C isSpectator:', await C.evaluate(() => RamiAdapter.isSpectator), '| C seat:', await C.evaluate(() => RamiAdapter.myPlayerId));

  ok(await C.evaluate(() => RamiAdapter.isSpectator === true), 'المتفرج مُكتشف (isSpectator=true)');
  ok(await C.evaluate(() => RamiAdapter.myPlayerId === -1), 'المتفرج ليس له مقعد (myPlayerId=-1)');

  // الطاولة ظاهرة + شارات العدد موجودة (دون كشف الوجوه)
  ok(await C.evaluate(() => !!(document.getElementById('ramiTableCenter') && document.getElementById('ramiTableCenter').children.length)), 'المتفرج يرى مركز الطاولة (المجرف/المرموق)');
  const seatInfo = await C.evaluate(() => {
    const counts = document.querySelectorAll('.rami-spec-count').length;
    /* لا يوجد وجه ورقة مكشوف في يد لاعب (لا mini-back ضمن خانات الخصوم؟ بل mini-back هو الظهر — المتفرج لا يجب أن يُظهر الأيدي أصلاً) */
    const backs = document.querySelectorAll('.rami-seat-node .mini-back').length;
    return { counts, backs };
  });
  console.log('C seat info:', JSON.stringify(seatInfo));
  ok(seatInfo.counts >= 2, 'شارات عدد الأوراق ظاهرة لكل لاعب (' + seatInfo.counts + ')');
  ok(seatInfo.backs === 0, 'لا ظهور لوجوه/ظهور الأوراق المخفية للمتفرج (mini-back=' + seatInfo.backs + ')');

  // لا أزرار فعل (شريط المتفرج بدل أزرار اللعب)
  ok(await C.evaluate(() => {
    const dock = document.getElementById('ramiActionDock');
    return !!(dock && dock.querySelector('.rami-spectator-bar') && !dock.querySelector('.rbtn-finish'));
  }), 'شريط المتفرج بدل أزرار اللعب (لا زر إنهاء)');

  // المضيف يرمي ورقة → المتفرج يستقبل نموّ المرموق
  const beforeDiscard = await C.evaluate(() => RamiAdapter.game.roundManager.discardPile.length);
  const cardId = await A.evaluate(() => {
    const g = RamiAdapter.game; g.normalizeTurnPhase();
    const p = g.roundManager.getCurrentPlayer();
    const m = g.getLegalMoves(p.id).filter(x => x.type === 'discard');
    return m.length ? m[0].cardId : null;
  });
  await A.evaluate((c) => ramiAction('discard', c), cardId);
  await wait(C, (b) => RamiAdapter.game.roundManager.discardPile.length > b, 10000, beforeDiscard);
  ok(true, 'أفعال اللاعبين تصل للمتفرج لحظياً (نموّ المرموق)');

  // المتفرج يطلب الانضمام (الغرفة ممتلئة → يدخل الطابور)
  ok(await C.evaluate(() => typeof Rooms.requestJoin === 'function'), 'Rooms.requestJoin متاحة');
  await C.evaluate(() => Rooms.requestJoin());
  await wait(A, () => !!(Rooms.state && Rooms.state.joinQueue && Rooms.state.joinQueue.length), 8000);
  ok(await A.evaluate((u) => Rooms.state.joinQueue.some(r => r.username === u), 'spec_watch'+_UNIQ), 'طلب الانضمام مُسجَّل في الطابور (الغرفة ممتلئة)');

  // اللاعب يغادر → يتفرّغ مقعد → المتفرج يُرقّى (spectate=false)
  await B.evaluate(() => Rooms.leaveRoom());
  await wait(C, () => {
    const me = AUTH.user.id;
    const p = Rooms.state && Rooms.state.players.find(x => x.id === me);
    return !!(p && !p.spectate);
  }, 10000);
  ok(await C.evaluate(() => {
    const me = AUTH.user.id;
    const p = Rooms.state.players.find(x => x.id === me);
    return !!(p && !p.spectate);
  }), 'المتفرج رُقّي إلى لاعب عند تفرّغ مقعد (بند 4)');

  const errsA = A._errs, errsC = C._errs;
  ok(errsA.length === 0, 'لا أخطاء JS عند المضيف (' + errsA.length + ')');
  ok(errsC.length === 0, 'لا أخطاء JS عند المتفرج (' + errsC.length + ')');

  console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
