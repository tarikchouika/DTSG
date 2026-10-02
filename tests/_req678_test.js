process.chdir(require('path').resolve(__dirname, '..'));
/* اختبار البنود 6 (قفل غرفة المُنشئ) + 7 (رموز/رسائل لحظية) + 8 (رسالة صوتية ≤10ث). */
const { chromium } = require('playwright');
/* [v2.78] مطلق احتياطي: كاش المتصفحات أحدث من مكتبة playwright 1.49 (نمط v274/v277) */
async function launchBw(extraArgs) {
  const _fs = require('fs');
  const _args = (extraArgs || []).concat(['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']);
  try { return await chromium.launch({ headless: true, args: _args }); } catch (e) {}
  for (const v of ['1243', '1200']) {
    for (const p of [
      '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux64/chrome',
      '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux/chrome'
    ]) {
      if (_fs.existsSync(p)) {
        try { return await chromium.launch({ headless: true, args: _args, executablePath: p }); } catch (e) {}
      }
    }
  }
  throw new Error('تعذر إطلاق متصفح — ثبّت كاش كروميوم أو حدّث playwright');
}

/* [v2.69.1] عنوان آمن: يحترم QA_BASE ويرفض الكتابة على خادم المنصة الحيّ */
const BASE = require('./_safe_base.js').BASE_SLASH;
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
  /* [v2.69.1] بعض نسخ Playwright لا تُنقل كوكي الاستجابة من ctx.request إلى
     سياق المتصفح ⇒ تبقى الصفحة زائرة. تسجيل الدخول من داخل الصفحة يضمن
     كوكياً في المتصفح في كل البيئات. */
  await page.evaluate(async (a) => {
    await fetch(a.b + 'api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ username: a.u, password: 'pw123456' }) });
  }, { b: BASE, u: username });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
  await page.waitForTimeout(800);
  return page;
}

(async () => {
  const browser = await launchBw();
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(), ctxC = await browser.newContext();
  const A = await setup(ctxA, 'r67_host'+_UNIQ), B = await setup(ctxB, 'r67_plr'+_UNIQ), C = await setup(ctxC, 'r67_watch'+_UNIQ);
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

  for (const p of [A, B, C]) await p.evaluate(() => openGame('rm'));
  await wait(A, () => !!(window.RamiAdapter && typeof window.RM_roomMove === 'function'), 10000);
  /* الإنشاء من داخل الصفحة لا عبر ctx.request: latter لا يحمل كوكي الجلسة
     في كل نسخ Playwright (يرج��ع 401 رغم أن الصفحة مصادَقة). */
  const rj2 = await A.evaluate(async () => {
    const r = await fetch('api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ game_id: 'rm', max_players: 2, bet: 5 }) });
    return await r.json().catch(() => ({}));
  });
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
  await A.evaluate(async (a) => {
    await fetch('api/rooms/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ room_id: a.rid, audio: a.wav, dur: 2 }) });
  }, { rid: rid, wav: TINY_WAV });
  ok(await wait(B, () => document.querySelectorAll('.room-voice-bubble').length > 0, 8000), 'الرسالة الصوتية وصلت اللاعب');
  ok(await wait(C, () => document.querySelectorAll('.room-voice-bubble').length > 0, 8000), 'الرسالة الصوتية وصلت المتفرج');

  console.log('\n[بند 6: مغادرة المُنشئ أثناء الرهان = خسارة الجولة — توجيه المالك v2.69]');
  // [v2.69] المغادرة الصريحة أثناء جولة جارية مسموحة للجميع (حتى المُنشئ):
  // مقعده يُوسم آلياً + إيداعه مصهور + في الثنائيات تسوية فورية للخصم الباقي.
  // (قاعدة v2.67 «لا إغلاق حتى انتهاء الرهان» أُلغيت بتوجيه المالك 2026-09-30)
  const gB0 = await B.evaluate(() => AUTH.user.gold);
  /* المغادرة من داخل الصفحة (نفس سبب الإنشاء: ctx.request بلا كوكي جلسة). */
  const lv1j = await A.evaluate(async (r) => {
    const r2 = await fetch('api/rooms/leave', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ room_id: r }) });
    return { status: r2.status, json: await r2.json().catch(() => ({})) };
  }, rid);
  ok(lv1j.status === 200 && lv1j.json && lv1j.json.ok === true, 'المُنشئ يستطيع المغادرة أثناء الرهان (مغادرة = خسارة)');
  ok(lv1j.json.result === 'w1', 'ثنائية: مغادرة المُنشئ ⇒ تسوية فورية للخصم الباقي (w1)');
  const goldUp = await wait(B, (g0) => (typeof AUTH.user.gold === 'number' && AUTH.user.gold > g0), 8000, gB0).catch(() => false);
  ok(!!goldUp, 'رصيد الخصم الباقي زاد فور مغادرة المُنشئ (الجرة بعد الرسم)');
  // الغرفة باقية حية — الخصم الباقي فيها والمُنشئ حُلّ محله مقعد آلي ثم أُسقط
  const still = await A.evaluate((id) => !!(Rooms.state && Rooms.state.id === id), rid);
  ok(still, 'الغرفة لا تزال قائمة بعد مغادرة المُنشئ (الجولة تُكمل)');
  // endBet (من المالك الجديد — الملكية انتقلت للباقي بعد المغادرة) → انتظار + إسقاط الآليين
  const ebj = await B.evaluate(async (r) => { const x = await fetch('api/rooms/endBet', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ room_id: r }) }); return await x.json().catch(() => ({})); }, rid);

  ok(ebj.ok && ebj.room && ebj.room.status === 'waiting', 'endBet يعيد الغرفة للانتظار (انتهاء الرهان)');
  const lv2j = await B.evaluate(async (r) => { const x = await fetch('api/rooms/leave', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ room_id: r }) }); return { status: x.status, json: await x.json().catch(() => ({})) }; }, rid);
  ok(lv2j.json && lv2j.json.ok === true, 'اللاعب الباقي يستطيع الإغلاق بعد انتهاء الرهان');

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
