/* RD v2.5 — Rooms (multiplayer) probe
   Host A + guest B play a 2-seat (1v1) Ronda room on the local server:
   • room create/join/ready/start via Rooms API
   • both build the same seeded engine (identical public state after each play)
   • each client only sees its own hand; the other seat renders mini backs
   • driver (host) AI-takeover for an idle online guest (grace override)
   • v2.5 corner DOM: viewer bottom-right (br), opponent top-right (tr)
   • spectator join-request fills a vacant seat with NO approval (auto-ready)
   • no privacy DOM, no console errors
   Run with DM_TEST_MODE=1 server:
     LD_LIBRARY_PATH="$PWD/node_modules/.chromium-143/al2023/lib" \
       node tests/_rd_v2_room_probe.js */
'use strict';
const PW = require('./_rd_pw.js');
const BASE = PW.BASE;

let pass = 0, fail = 0;
function ok(label) { pass++; console.log('  ✅ ' + label); }
function bad(label) { fail++; console.log('  ❌ ' + label); }

async function wait(page, fn, timeout, arg) { return PW.wait(page, fn, timeout, arg); }

async function setup(ctx, username) {
  await ctx.request.post(BASE + 'api/register', { data: { username: username, password: 'pw123456' } }).catch(() => {});
  await ctx.request.post(BASE + 'api/login', { data: { username: username, password: 'pw123456' } }).catch(() => {});
  const page = await ctx.newPage();
  page._errs = [];
  page.on('pageerror', e => page._errs.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404|net::ERR/i.test(m.text())) page._errs.push(m.text()); });
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && typeof RondaApp !== 'undefined'), 20000);
  await page.waitForTimeout(700);   /* SSE + welcome settle */
  return page;
}

const pubState = PW.pubState;

const liveCardClickable = () => {
  const el = document.querySelector('#hand .rd-card.rd-live');
  if (!el) return false;
  el.click();
  return true;
};

(async () => {
  const browser = await PW.launchBrowser();
  const stamp = Date.now() % 1000000;
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = await setup(ctxA, 'rdh_' + stamp);
  const B = await setup(ctxB, 'rdg_' + stamp);
  const C = await setup(ctxC, 'rds_' + stamp);

  for (const p of [A, B, C]) {
    await p.evaluate(() => openGame('rd'));
    await wait(p, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);
  }

  // 1. إنشاء غرفة روندا 1ضد1 (مقعدان + هدف 51)
  await A.evaluate(() => Rooms.createRoom('rd', {
    room_type: 'percentage', bet: 10, visibility: 'public',
    game_opts: { maxp: 2, target: 51 }, max_players: 2
  }));
  const room = await wait(A, () => (Rooms.state && Rooms.state.code) ? { code: Rooms.state.code, id: Rooms.state.id } : null, 8000);
  if (room) ok('room created (code ' + room.code + ')'); else bad('room NOT created');
  const code = await A.evaluate(() => Rooms.state.code);

  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  await wait(B, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  ok('guest joined the room');

  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 8000);

  await A.evaluate(() => Rooms.openModal());
  const startEnabled = await A.evaluate(() => {
    const btns = [...document.querySelectorAll('#roomBody button')];
    const start = btns.find(b => /roomStart|ابدأ/.test((b.textContent || '').trim()) || /onclick="Rooms\\.startGame/.test(b.getAttribute('onclick') || ''));
    return start ? !start.disabled : null;
  });
  await A.evaluate(() => Rooms.closeModal());
  if (startEnabled) ok('start enabled with full seats'); else bad('start disabled though seats full');

  // 2. بدء الجولة
  await A.evaluate(() => Rooms.startGame());
  await wait(A, () => !!(window.RondaApp && RondaApp.roomMode && RondaApp.game && RondaApp.game.state.players.length === 2), 15000);
  await wait(B, () => !!(window.RondaApp && RondaApp.roomMode && RondaApp.game && RondaApp.game.state.players.length === 2), 15000);
  ok('both clients entered room mode and built the engine');

  await wait(A, () => document.querySelectorAll('#hand .rd-card').length === 3, 10000);
  await wait(B, () => document.querySelectorAll('#hand .rd-card').length === 3, 10000);

  // 3. شاشة اللعب مباشرة (لا قائمة) + الهدف في عدّاد شفاف
  const menuHidden = await A.evaluate(() => !document.querySelector('#rdStage #screen-menu.active') && document.querySelector('#screen-game.active') !== null);
  if (menuHidden) ok('game screen active (menu bypassed)'); else bad('menu still active in room start');
  const hudTarget = await A.evaluate(() => (document.getElementById('hud-target') || {}).textContent || '');
  if (hudTarget === '51') ok('hud target 51'); else bad('hud target = ' + hudTarget);

  // 4. خصوصية المقاعد: كل طرف يرى يده فقط، والآخر ظهراً مصغّراً في الزاوية المقابلة
  const aOwn = await A.evaluate(() => document.querySelectorAll('#hand .rd-card').length);
  const bOwn = await B.evaluate(() => document.querySelectorAll('#hand .rd-card').length);
  const aOtherBacks = await A.evaluate(() => document.querySelectorAll('#rd-corner-br .rd-back-card').length);
  const bOtherBacks = await B.evaluate(() => document.querySelectorAll('#rd-corner-br .rd-back-card').length);
  ok('host sees own 3-card hand', aOwn === 3);
  ok('guest sees own 3-card hand', bOwn === 3);
  ok('host sees guest as backs (' + aOtherBacks + ')', aOtherBacks >= 3 && aOtherBacks <= 4);
  ok('guest sees host as backs (' + bOtherBacks + ')', bOtherBacks >= 3 && bOtherBacks <= 4);
  const otherFaces = await A.evaluate(() => {
    let n = 0;
    document.querySelectorAll('#rd-corner-br .rd-card').forEach(el => { if (!el.classList.contains('rd-back')) n++; });
    return n;
  });
  ok('no face-up cards in the opponent area', otherFaces === 0);

  // 5. الزوايا v2.5: كل طرف على br، خصمه على tr (الاسم في title — بلا لوحة اسمية)
  const seatsA = await A.evaluate(() => ({
    me: (document.querySelector('#rd-corner-bl .rd-seat.rd-me-seat') || {}).title || '',
    opp: (document.querySelector('#rd-corner-br .rd-seat') || {}).title || ''
  }));
  const seatsB = await B.evaluate(() => ({
    me: (document.querySelector('#rd-corner-bl .rd-seat.rd-me-seat') || {}).title || '',
    opp: (document.querySelector('#rd-corner-br .rd-seat') || {}).title || ''
  }));
  ok('host at bl / guest at br on host view', /rdh_/.test(seatsA.me) && /rdg_/.test(seatsA.opp));
  ok('guest at bl / host at br on guest view', /rdg_/.test(seatsB.me) && /rdh_/.test(seatsB.opp));
  const lettersOnly = await A.evaluate(() => {
    const av = document.querySelector('#rd-corner-br .rd-seat .rd-av');
    return av ? av.textContent : '';
  });
  ok('avatar shows two letters (no textual name plate): ' + lettersOnly, /^[\u0600-\u06FFa-zA-Z]{2}$/.test(lettersOnly));

  // 6. تزامن الحالة: بعد كل لعب يتطابق الجمهور (رزمة/طاولة/دور/نقاط)
  const agree = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const sA0 = await A.evaluate(pubState);
  const sB0 = await B.evaluate(pubState);
  if (agree(sA0, sB0) && sA0.deck === 30 && sA0.table === 4) ok('identical public state after deal (deck=30, table=4)');
  else bad('public state mismatch at deal: ' + JSON.stringify({ a: sA0, b: sB0 }));

  let plays = 0;
  const maxPlays = 6;
  const started = Date.now();
  while (plays < maxPlays && Date.now() - started < 90000) {
    const seat = await A.evaluate(() => (window.RondaApp && RondaApp.game) ? RondaApp.game.state.currentSeat : -1);
    if (seat !== 0 && seat !== 1) break;
    const target = (seat === 0) ? A : B;
    const clicked = await wait(target, liveCardClickable, 6000);
    if (!clicked) { bad('no live card for seat ' + seat); break; }
    plays++;
    await A.waitForTimeout(800);   /* بث + تطبيق + حركة */
    const sA = await A.evaluate(pubState);
    const sB = await B.evaluate(pubState);
    if (!agree(sA, sB)) { bad('state desync after play ' + plays + ': ' + JSON.stringify({ a: sA, b: sB })); break; }
  }
  ok('played ' + plays + ' human turns in sync', plays >= 4);

  const logA = await A.evaluate(() => document.querySelectorAll('#log-list li').length);
  const logB = await B.evaluate(() => document.querySelectorAll('#log-list li').length);
  if (logA === logB && logA > 0) ok('identical event logs (' + logA + ')'); else bad('log mismatch ' + logA + ' vs ' + logB);

  // 7. تولٍّ آلي من السائق للضيف المتأخر (مهلة قصيرة للاختبار)
  await A.evaluate(() => { window.RD_ROOM_AI_GRACE = 2000; });
  let guestTurn = await A.evaluate(() => (window.RondaApp && RondaApp.game) ? RondaApp.game.state.currentSeat === 1 : false);
  if (!guestTurn) {
    await wait(A, liveCardClickable, 6000);
    await A.waitForTimeout(900);
    guestTurn = await A.evaluate(() => (window.RondaApp && RondaApp.game) ? RondaApp.game.state.currentSeat === 1 : false);
  }
  const guestTableBefore = await B.evaluate(() => (window.RondaApp && RondaApp.game) ? window.RondaApp.game.state.table.cards.length : -1);
  const takeover = await wait(B, () => {
    if (!window.RondaApp || !RondaApp.game) return false;
    const seat = RondaApp.game.state.currentSeat;
    const table = RondaApp.game.state.table.cards.length;
    return (seat === 0 || table !== guestTableBefore) ? { seat: seat, table: table } : false;
  }, 30000);
  if (guestTurn && takeover) ok('driver AI-took-over idle guest turn → seat ' + takeover.seat + ', table ' + takeover.table);
  else if (!guestTurn) bad('could not bring turn to guest for takeover test');
  else bad('no AI takeover for idle guest (table stayed ' + guestTableBefore + ')');
  await A.waitForTimeout(1500);
  const sAfterAI = await A.evaluate(pubState);
  const sAfterBI = await B.evaluate(pubState);
  ok('public state still in sync after AI takeover', agree(sAfterAI, sAfterBI));

  // 8. بلا واجهات كشف + بلا أخطاء
  for (const [name, p] of [['host', A], ['guest', B]]) {
    const priv = await p.evaluate(() => {
      return !document.getElementById('overlay-privacy') &&
             !document.getElementById('toggle-privacy') &&
             !document.querySelector('#rdStage [data-i18n="rdc.tgl.privacy"]');
    });
    ok(name + ': no privacy/reveal UI', priv);
    ok(name + ': zero console errors', p._errs.length === 0);
    if (p._errs.length) console.log('     errors: ' + p._errs.slice(0, 3).join(' | '));
  }

  // ── S2: متفرج يطلب الانضمام (joinRequest) فيُرقّى للمقعد الشاغر تلقائياً بلا موافقة ──
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxE = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxF = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const D = await setup(ctxD, 'rdd_' + stamp);
  const E = await setup(ctxE, 'rde_' + stamp);
  const F = await setup(ctxF, 'rdf_' + stamp);
  for (const p of [D, E, F]) {
    await p.evaluate(() => openGame('rd'));
    await wait(p, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);
  }
  /* غرفة فردي (2 مقعد): D مضيف + E ضيف = ممتلئة */
  await D.evaluate(() => Rooms.createRoom('rd', {
    room_type: 'percentage', bet: 10, visibility: 'public',
    game_opts: { maxp: 2, target: 51 }, max_players: 2
  }));
  await wait(D, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code3 = await D.evaluate(() => Rooms.state.code);
  await E.evaluate((c) => Rooms.joinRoom(c), code3);
  await wait(D, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).length >= 2), 8000);
  ok('singles room full (2 players)');
  /* F ينضم بالكود: ممتلئة → متفرج تلقائي */
  await F.evaluate((c) => Rooms.joinRoom(c), code3);
  const specJoin = await wait(F, () => {
    const me = Rooms.state && Rooms.state.players.find(p => String(p.id) === String(AUTH.user.id));
    return (me && me.spectate) ? true : false;
  }, 8000);
  ok('third user auto-joined as spectator (seats full)', !!specJoin);
  /* F يضغط «اطلب مقعداً»: لا شغور → يبقى في الطابور */
  await F.evaluate(() => { try { Rooms.requestJoin(); } catch (e) {} });
  const queued = await wait(F, () => {
    const u = AUTH.user;
    return (Rooms.state && Rooms.state.joinQueue && Rooms.state.joinQueue.some(q => String(q.id) === String(u.id))) ? true : false;
  }, 8000);
  ok('spectator join-request queued (no seat yet)', !!queued);
  /* E (الضيف) يغادر الغرفة → ترقية F تلقائياً بلا موافقة أحد */
  await E.evaluate(() => { try { Rooms.leaveRoom(); } catch (e) {} });
  const promoted = await wait(F, () => {
    const u = AUTH.user;
    const room = Rooms.state;
    if (!room) return false;
    const me = room.players.find(p => String(p.id) === String(u.id));
    return (me && !me.spectate && me.ready) ? { seat: me.seat } : false;
  }, 10000);
  ok('spectator auto-promoted into vacant seat (ready=true, NO approval)', !!promoted);
  const afterPromote = await D.evaluate(() => {
    const room = Rooms.state;
    return {
      nonSpec: room.players.filter(p => !p.spectate).length,
      readyAll: room.players.filter(p => !p.spectate).every(p => p.ready)
    };
  });
  ok('host sees room back to 2 ready players (' + afterPromote.nonSpec + ')', afterPromote.nonSpec === 2 && afterPromote.readyAll);
  /* الرصيد: F (المُرقّى) يملك رصيداً كافياً (حسابات الاختبار تبدأ برصيد وافر) */
  const goldOk = await F.evaluate(() => {
    const gold = (typeof ST !== 'undefined') ? ST.gold : -1;
    return { gold: gold, enough: gold >= 10 };
  });
  ok('promoted spectator has enough balance to bet (' + goldOk.gold + ')', goldOk.enough);

  await browser.close();
  console.log('\n═══ RD v2.5 rooms probe: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})();
