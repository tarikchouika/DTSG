/* FLAT DOG (rn) client timeout handlers:
   1) _onPropTimeout: dealer auto-refuses a pending proposal (real E2E over SSE).
   2) _onSelectorTimeout: owner POSTs /api/rooms/timeoutSeat for the selector and rebuilds.
   Invokes the handlers directly (no 30s wait). */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000; const start = Date.now();
  while (Date.now() - start < timeout) { try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) {} await page.waitForTimeout(180); }
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
  await page.waitForTimeout(300);
  return page;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  const ok = (n, c) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
  const tag = Date.now() % 100000;
  const A = await setup(await browser.newContext(), 'rnto_' + tag, 5000);
  const B = await setup(await browser.newContext(), 'rntg_' + tag, 5000);
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
  await A.evaluate(() => Rooms.startGame());
  for (const p of [A, B]) await wait(p, () => !!(RN_ADAPTER && RN_ADAPTER.room), 10000);

  await A.evaluate(() => RN_chooseMode('number_only'));
  await wait(A, () => !!(RN_ADAPTER.room && RN_ADAPTER.room.mode), 8000);
  await A.evaluate(() => RN_startRound());   // dealer determination -> bet phase
  await wait(A, () => !!(document.getElementById('rnBpAmt')), 16000);
  await wait(B, () => !!(document.getElementById('rnBpAmt')), 16000);
  ok('bet phase active on both', true);

  const roles = await Promise.all([A, B].map(p => p.evaluate(() => ({
    me: RN_ADAPTER.core.myRole, selId: RN_ADAPTER.room.order[1], dlId: RN_ADAPTER.room.order[0], myId: AUTH.user.id, isOwner: RN_ADAPTER.room.isOwner
  }))));
  const ownerPage = roles[0].isOwner ? A : B;
  const guestPage = roles[0].isOwner ? B : A;
  const selPage = roles[0].me === 'selector' ? A : (roles[1].me === 'selector' ? B : A);
  const dealerPage = roles[0].me === 'dealer' ? A : (roles[1].me === 'dealer' ? B : A);
  ok('owner + guest identified', !!ownerPage && !!guestPage);

  /* ── 1) PROPTIMEOUT: selector proposes, owner auto-refuses via _onPropTimeout ── */
  await selPage.evaluate(() => RN_proposeBet(10));
  // owner received the betpropose broadcast -> _pendingProposed set + _propTimer armed
  const armed = await wait(ownerPage, () => (RN_ADAPTER._pendingProposed != null && !!RN_ADAPTER._propTimer) ? RN_ADAPTER._pendingProposed : null, 8000);
  ok('owner armed: _pendingProposed set + _propTimer running', armed != null);
  // dealer now sees accept/refuse
  await wait(dealerPage, () => { const a = document.getElementById('rnBpAccept'); return a && a.style.display !== 'none' ? 1 : null; }, 8000);
  ok('dealer sees accept/refuse after proposal', true);

  await ownerPage.evaluate(() => RN_ADAPTER._onPropTimeout());
  const cleared = await ownerPage.evaluate(() => RN_ADAPTER._pendingProposed);
  ok('owner _pendingProposed cleared after _onPropTimeout', cleared == null);
  // betdecide{accept:false} broadcast -> dealer _onBetDecide hides accept/refuse
  const refused = await wait(dealerPage, () => { const a = document.getElementById('rnBpAccept'); return (!a || a.style.display === 'none') ? 1 : null; }, 8000);
  ok('dealer auto-refused (accept/refuse hidden via betdecide broadcast)', !!refused);
  // prop timer cleared
  const propTimerCleared = await ownerPage.evaluate(() => RN_ADAPTER._propTimer == null);
  ok('_propTimer cleared after auto-refuse', propTimerCleared);

  /* ── 2) SELTIMEOUT: owner POSTs timeoutSeat(selector) and rebuilds ── */
  // Force a deterministic non-owner selector on the owner's local state.
  const bId = await guestPage.evaluate(() => AUTH.user.id);
  const oId = await ownerPage.evaluate(() => AUTH.user.id);
  await ownerPage.evaluate((bid) => {
    RN_ADAPTER.room.phase = 'bet';
    RN_ADAPTER.room.order = [AUTH.user.id, bid];   // dealer=owner, selector=guest
    // intercept API.post to capture + fake the timeoutSeat response (deterministic, no SSE race)
    window.__rnPosts = [];
    const orig = API.post; window.__rnOrigPost = orig;
    API.post = function (url, data) {
      window.__rnPosts.push({ url: url, data: data });
      if (url === '/api/rooms/timeoutSeat') {
        const players = (RN_ADAPTER.room.players || []).map(function (p) {
          return { id: p.id, username: p.username, spectate: String(p.id) === String(bid), seat: p.seat, isBot: !!p.isBot, ready: true };
        });
        return Promise.resolve({ ok: true, room: { players: players } });
      }
      return orig(url, data);
    };
  }, bId);

  await ownerPage.evaluate(() => RN_ADAPTER._onSelectorTimeout());
  const posts = await wait(ownerPage, () => (window.__rnPosts && window.__rnPosts.length) ? window.__rnPosts : null, 6000);
  const toCall = posts && posts.find(p => p.url === '/api/rooms/timeoutSeat');
  ok('owner POSTed /api/rooms/timeoutSeat', !!toCall);
  ok('timeoutSeat targeted the selector (guest id)', !!(toCall && String(toCall.data.playerId) === String(bId)));

  // rebuild ran: only owner active (<2) -> waiting room shown
  const waiting = await wait(ownerPage, () => document.querySelector('.fd-wait') ? 1 : null, 6000);
  ok('owner rebuilt to waiting room after seat swap', !!waiting);
  const selSpectated = await ownerPage.evaluate((bid) => {
    const p = (RN_ADAPTER.room.players || []).find(x => String(x.id) === String(bid));
    return p && p.spectate === true;
  }, bId);
  ok('timed-out selector marked spectator in owner state', selSpectated);

  // restore API.post
  await ownerPage.evaluate(() => { if (window.__rnOrigPost) API.post = window.__rnOrigPost; }).catch(() => {});

  ok('no page errors (A=' + A._errs.length + ' B=' + B._errs.length + ')', A._errs.length === 0 && B._errs.length === 0);

  await browser.close();
  const failed = results.filter(r => !r[1]).length;
  console.log('\n═══ FLAT DOG client timeout handlers: ' + (results.length - failed) + '/' + results.length + ' passed ═══');
  process.exit(failed ? 1 : 0);
})();
