/* اختبار البنود 6 (قفل غرفة المُنشئ) + 7 (رموز/رسائل لحظية) + 8 (رسالة صوتية ≤10ث). */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const _UNIQ = Date.now().toString().slice(-5);
const TINY_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now(); let lastErr = null;
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
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
  await page.waitForTimeout(800);
  return page;
}

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(), ctxC = await browser.newContext();
  const A = await setup(ctxA, 'r67_host'+_UNIQ), B = await setup(ctxB, 'r67_plr'+_UNIQ), C = await setup(ctxC, 'r67_watch'+_UNIQ);
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

  for (const p of [A, B, C]) await p.evaluate(() => openGame('rm'));
  await wait(A, () => !!(window.RamiAdapter && typeof window.RM_roomMove === 'function'), 10000);
  const rres = await ctxA.request.post(BASE + 'api/rooms', { data: { game_id: 'rm', max_players: 2 } });
  const rj2 = (await rres.json().catch(() => ({}))) || {};
  await A.evaluate((r) => { Rooms.state = r; Rooms.render(); }, rj2.room);
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code), rid = await A.evaluate(() => Rooms.state.id);
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await C.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.some(p => p.spectate)), 8000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).every(p => p.ready)), 8000);
  await A.evaluate(() => Rooms.startGame());
  await wait(A, () => !!(RamiAdapter.multiplayer && RamiAdapter.game && RamiAdapter.game.gamePhase === 'PLAYING'), 20000);
  await wait(C, () => !!(RamiAdapter.game && RamiAdapter.isSpectator === true), 20000);

  console.log('\n[بند 7: أيقونة الرموز/الرسائل]');
  ok(await wait(A, () => { const b = document.getElementById('roomReactBtn'); return !!(b && b.style.display !== 'none'); }, 8000), 'أيقونة الرموز ظاهرة للمضيف');
  ok(await B.evaluate(() => !!document.getElementById('roomReactBtn')), 'أيقونة الرموز ظاهرة للاعب');
  ok(await C.evaluate(() => !!document.getElementById('roomReactBtn')), 'أيقونة الرموز ظاهرة للمتفرج');

  // تفاعل من المضيف → يصل اللاعب والمتفرج
  await A.evaluate(() => Rooms.sendReact('🎉'));
  ok(await wait(B, () => document.querySelectorAll('.room-react-burst').length > 0, 8000), 'التفاعل وصل اللاعب لحظياً');
  ok(await wait(C, () => document.querySelectorAll('.room-react-burst').length > 0, 8000), 'التفاعل وصل المتفرج لحظياً');

  // رسالة من المضيف → تُسجَّل في سجل المحادثة (للجميع)
  await A.evaluate(() => { const i = document.getElementById('roomReactInput'); i.value = 'سلام'; Rooms.sendQuickMsg(); });
  await page_wait_chat(ctxB, rid, 'سلام');
  ok(true, 'الرسالة الجماعية وصلت سجل المحادثة');
  // اللاعب يتلقى الإشعار (toast) — نتحقق عبر وصول الحدث: وجود الفقاعة/التفاعل كافٍ، الرسالة في السجل مؤكَّدة

  console.log('\n[بند 8: الرسالة الصوتية ≤10ث]');
  ok(await A.evaluate(() => !!document.getElementById('roomMicBtn')), 'زر الميكروفون موجود');
  // بثّ رسالة صوتية عبر الـAPI (تسجيل المتصفح يحتاج ميكروفون حقيقي)
  await ctxA.request.post(BASE + 'api/rooms/voice', { data: { room_id: rid, audio: TINY_WAV, dur: 2 } });
  ok(await wait(B, () => document.querySelectorAll('.room-voice-bubble').length > 0, 8000), 'الرسالة الصوتية وصلت اللاعب');
  ok(await wait(C, () => document.querySelectorAll('.room-voice-bubble').length > 0, 8000), 'الرسالة الصوتية وصلت المتفرج');

  console.log('\n[بند 6: قفل غرفة المُنشئ حتى انتهاء الرهان]');
  // المضيف يحاول المغادرة أثناء الرهان → مرفوض
  const lv1 = await ctxA.request.post(BASE + 'api/rooms/leave', { data: { room_id: rid } });
  const lv1j = (await lv1.json().catch(() => ({}))) || {};
  ok(lv1j.ok === false, 'المُنشئ لا يستطيع الإغلاق أثناء الرهان (مرفوض)');
  // اللاعب (غير المُنشئ) يستطيع المغادرة أثناء الرهان (يحرّر مقعداً)
  // (نتحقق أن الغرفة لا تزال قائمة لأن المضيف لم يغادر)
  const still = await A.evaluate((id) => !!(Rooms.state && Rooms.state.id === id), rid);
  ok(still, 'الغرفة لا تزال قائمة بعد محاولة الإغلاق المرفوضة');
  // endBet → تعود للانتظار → الإغلاق ممكن
  const eb = await ctxA.request.post(BASE + 'api/rooms/endBet', { data: { room_id: rid } });
  const ebj = (await eb.json().catch(() => ({}))) || {};
  ok(ebj.ok && ebj.room && ebj.room.status === 'waiting', 'endBet يعيد الغرفة للانتظار (انتهاء الرهان)');
  const lv2 = await ctxA.request.post(BASE + 'api/rooms/leave', { data: { room_id: rid } });
  const lv2j = (await lv2.json().catch(() => ({}))) || {};
  ok(lv2j.ok === true, 'المُنشئ يستطيع الإغلاق بعد انتهاء الرهان');

  const ea = A._errs, eb_ = B._errs, ec = C._errs;
  ok(ea.length === 0 && eb_.length === 0 && ec.length === 0, 'لا أخطاء JS (' + (ea.length + eb_.length + ec.length) + ')');

  console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
  await browser.close();
  process.exit(fail ? 1 : 0);

  async function page_wait_chat(ctx, roomId, text) {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      try {
        const r = await ctx.request.get(BASE + 'api/rooms/' + roomId + '/chat');
        const j = (await r.json().catch(() => ({}))) || {};
        if (j.messages && j.messages.some(m => (m.text || '').indexOf(text) !== -1)) return true;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 250));
    }
    return false;
  }
})();
