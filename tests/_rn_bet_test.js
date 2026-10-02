/* FLAT DOG (rn) [v2.73] round-join flow: after dealer determination both duelists
   are asked to Participate or Withdraw — the room-specified round bet is deducted
   ONLY on the Participate click; when both confirm, the round starts automatically.
   At round end the bet settles (winner takes pot − 5%) and the NEXT round asks for
   fresh confirmation (no more automatic friendly rounds). */
const { chromium } = require('playwright');
/* [v2.69.1] عنوان آمن: يحترم QA_BASE ويرفض الكتابة على خادم المنصة الحيّ */
const BASE = require('./_safe_base.js').BASE_SLASH;
async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000; const start = Date.now();
  while (Date.now() - start < timeout) { try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) {} await page.waitForTimeout(200); }
  return null;
}
async function setup(ctx, username, gold) {
  await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
  await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
  await page.evaluate((g) => { window.ST = window.ST || {}; window.ST.gold = g; if (window.save) save(); }, gold || 5000);
  await page.waitForTimeout(400);
  return page;
}
async function serverGold(page) {
  return page.evaluate(async () => {
    const r = await fetch('/api/me', { credentials: 'include' }).then(x => x.json()).catch(() => null);
    return r && r.user ? r.user.gold : null;
  });
}

(async () => {
  /* [v2.77] مطلقِق احتياطي (نمط v274): كاش المتصفحات أحدث من مكتبة Playwright */
  const fsMod = require('fs');
  const blArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  const launchBl = async () => {
    try { return await chromium.launch({ args: blArgs }); } catch (e) {}
    for (const v of ['1243', '1200']) {
      for (const p of [
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux64/chrome',
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux/chrome'
      ]) {
        if (fsMod.existsSync(p)) {
          try { return await chromium.launch({ args: blArgs, executablePath: p }); } catch (e) {}
        }
      }
    }
    throw new Error('تعذر إطلاق متصفح');
  };
  const browser = await launchBl();
  const results = [];
  const ok = (n, c) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
  const tag = Date.now() % 100000;
  /* [إصلاح 2026-09-16] single-process يتشارك الكوكيز بين السياقات — متصفح مستقل لكل لاعب */
  const browser2 = await launchBl();
  const A = await setup(await browser.newContext(), 'rnbo_' + tag, 5000);
  const B = await setup(await browser2.newContext(), 'rnbg_' + tag, 5000);
  for (const p of [A, B]) await p.evaluate(() => openGame('rn'));
  for (const p of [A, B]) await wait(p, () => !!(typeof RN_ADAPTER !== 'undefined' && RN_ADAPTER), 10000);

  await A.evaluate(() => Rooms.createRoom('rn', 10));
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code);
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => Rooms.state.players.every(p => p.ready), 8000);
  const gA0 = await serverGold(A), gB0 = await serverGold(B);
  await A.evaluate(() => Rooms.startGame());
  for (const p of [A, B]) await wait(p, () => !!(RN_ADAPTER && RN_ADAPTER.room), 10000);

  /* [v2.73] البدء لا يقتطع — الرهان عند النقر على المشاركة فقط */
  await wait(A, () => Rooms.state && Rooms.state.status === 'playing', 8000);
  const gA1 = await serverGold(A), gB1 = await serverGold(B);
  ok('no deduction at room start (join-phase contract)', Math.abs(gA1 - gA0) < 0.01 && Math.abs(gB1 - gB0) < 0.01);

  await A.evaluate(() => RN_chooseMode('number_only'));
  await wait(A, () => !!(RN_ADAPTER.room && RN_ADAPTER.room.mode), 8000);
  await A.evaluate(() => RN_startRound());   /* dealer determination → join phase */

  /* مرحلة المشاركة تظهر عند الطرفين بعد تحديد الموزّع */
  await wait(A, () => !!(document.getElementById('rnJoinPhase')), 16000);
  await wait(B, () => !!(document.getElementById('rnJoinPhase')), 16000);
  ok('join phase (Participate/Withdraw) shown on both browsers', true);

  const betShown = await A.evaluate(() => {
    const el = document.getElementById('rnJoinPhase');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  ok('room-specified round bet (10) displayed — not the old 10-default negotiation', betShown.indexOf('10') >= 0);

  /* تحديد صفحتي الموزّع والمتخمّن */
  const roles = await Promise.all([A, B].map(p => p.evaluate(() => ({ me: RN_ADAPTER.core.myRole, sel: RN_ADAPTER.room.order[1], dl: RN_ADAPTER.room.order[0], myId: AUTH.user.id }))));
  const selPage = roles[0].me === 'selector' ? A : B;
  const dlPage = roles[0].me === 'selector' ? B : A;
  ok('one selector + one dealer identified', roles[0].me !== roles[1].me && (roles[0].me === 'selector' || roles[1].me === 'selector'));

  /* المتخمّن يصادق بالمشاركة ⇒ الاقتطاع منه فقط */
  const selIsA = roles[0].me === 'selector';
  const gSel0 = selIsA ? gA1 : gB1;
  const gDl0 = selIsA ? gB1 : gA1;
  await selPage.evaluate(() => RN_joinRound());
  await selPage.waitForTimeout(700);
  const gSel1 = await serverGold(selPage);
  ok('selector deducted ONLY on Participate click (10)', Math.abs(gSel1 - (gSel0 - 10)) < 0.02, '(Δ=' + (gSel1 - gSel0) + ')');
  const gDlMid = await serverGold(dlPage);
  ok('dealer not deducted before his own click', Math.abs(gDlMid - gDl0) < 0.02);

  /* الموزّع يصادق ⇒ الجولة تنطلق آلياً */
  await dlPage.evaluate(() => RN_joinRound());
  const r1 = await wait(A, () => (RN_ADAPTER.room && RN_ADAPTER.room.round >= 1) ? 1 : null, 12000);
  ok('round 1 started automatically after both confirmed', !!r1);

  /* المتخمّن يلعب الجولة: يختار رقماً ويؤكد */
  await wait(selPage, () => !!(RN_ADAPTER.core && RN_ADAPTER.core.state === 'SELECTION_REQUIRED'), 10000);
  await selPage.evaluate(() => RN_selectNum(7));
  await selPage.evaluate(() => RN_confirm());
  /* نهاية الجولة: تسوية ثم مرحلة مشاركة جديدة (لا جولة آلية ودية) */
  const join2 = await wait(A, () => (RN_ADAPTER.room && RN_ADAPTER.room.phase === 'join') ? 1 : null, 16000);
  ok('round settled then NEXT round asks for fresh confirmation (no auto friendly round)', !!join2);
  const join2B = await wait(B, () => (RN_ADAPTER.room && RN_ADAPTER.room.phase === 'join') ? 1 : null, 16000);
  ok('next join phase reached the second player too', !!join2B);

  /* التسوية المالية: أحدهما +9 والآخر −10 (جرة 20 − رسم 5%) */
  const gA2 = await serverGold(A), gB2 = await serverGold(B);
  const dA = Math.round((gA2 - gA0) * 100) / 100, dB = Math.round((gB2 - gB0) * 100) / 100;
  const pair = [dA, dB].sort((x, y) => y - x);
  ok('settlement math: winner +9 · loser −10 (pot 20 − 5% fee)', Math.abs(pair[0] - 9) < 0.02 && Math.abs(pair[1] + 10) < 0.02, '(ΔA=' + dA + ' ΔB=' + dB + ')');

  ok('no page errors (A=' + A._errs.length + ' B=' + B._errs.length + ')', A._errs.length === 0 && B._errs.length === 0);
  await browser.close(); await browser2.close();
  const failed = results.filter(r => !r[1]).length;
  console.log('\n═══ FLAT DOG round-join flow: ' + (results.length - failed) + '/' + results.length + ' passed ═══');
  process.exit(failed ? 1 : 0);
})();
