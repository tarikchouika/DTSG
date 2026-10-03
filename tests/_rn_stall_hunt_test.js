/* ═══ صياد عطل تعليق/تخطي مرحلة المشاركة في فلات دوغ ═══
   يلتقط: تقدم _settle عبر حراسه · مصدر ownerStartRound (stack) ·
   تحديثات roundJoin الواصلة (room:update) · تسلسل الأحداث */
const { chromium } = require('playwright');
const BASE = require('./_safe_base.js').BASE_SLASH;

async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000; const start = Date.now();
  while (Date.now() - start < timeout) { try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) {} await page.waitForTimeout(150); }
  return null;
}
async function setup(ctx, username) {
  await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
  await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
  await page.evaluate(() => {
    window.ST = window.ST || {}; window.ST.gold = 5000; if (window.save) save();
    window.__log = [];
    const L = (m, x) => window.__log.push({ t: Date.now(), m: m, x: x || null });
    window.__L = L;
    /* اعتراض _settle بعد تهيئة المحوّل */
    const arm = () => {
      const ad = (typeof RN_ADAPTER !== 'undefined') ? RN_ADAPTER : null;
      if (!ad || ad.__armed) return;
      ad.__armed = true;
      const origSettle = ad._settle.bind(ad);
      ad._settle = function (d) {
        const st = (typeof Rooms !== 'undefined' && Rooms.state) || {};
        const order = this.room && this.room.order;
        const dl = order ? order[0] : null, sl = order ? order[1] : null;
        const pl = (this.room && this.room.players) || [];
        const find = id => pl.find(p => p && String(p.id) === String(id));
        const bet = Number((st.bet != null ? st.bet : this.room.bet)) || 0;
        L('settle:enter', { winner: d && d.winner, mp: this.core.multiplayer, order: order, bet: bet,
           stStatus: st.status, settled: st.settled,
           dlBot: dl ? String(dl).indexOf('bot:') === 0 : null,
           slBot: sl ? String(sl).indexOf('bot:') === 0 : null,
           dlIsBot: !!(find(dl) || {}).isBot, slIsBot: !!(find(sl) || {}).isBot,
           winnerId: (d && d.winner === 'selector') ? sl : dl });
        const r = origSettle(d);
        L('settle:exit');
        return r;
      };
      const origStart = ad.ownerStartRound.bind(ad);
      ad.ownerStartRound = function () {
        L('ownerStartRound:CALLED', { stack: (new Error().stack || '').split('\n').slice(2, 5).join(' | ').slice(0, 400) });
        return origStart();
      };
      const origJoin = ad.ownerStartJoinPhase.bind(ad);
      ad.ownerStartJoinPhase = function () { L('ownerStartJoinPhase'); return origJoin(); };
      const origNext = ad.ownerNextRound.bind(ad);
      ad.ownerNextRound = function () { L('ownerNextRound'); return origNext(); };
      const origApply = ad.applyRound.bind(ad);
      ad.applyRound = function (d) { L('applyRound', { round: d && d.round }); return origApply(d); };
      /* رصد roundJoin في تحديثات الغرفة */
      const origUpd = Rooms._onUpdate.bind(Rooms);
      Rooms._onUpdate = function (room) {
        if (room && room.roundJoin) L('roomUpdate:roundJoin', { required: room.roundJoin.required, joined: room.roundJoin.joined, settled: room.settled });
        else if (room) L('roomUpdate', { settled: room.settled, status: room.status, hasRJ: !!room.roundJoin });
        return origUpd(room);
      };
    };
    setInterval(arm, 250);
  });
  return page;
}

(async () => {
  const fsMod = require('fs');
  const blArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  const launchBl = async () => {
    try { return await chromium.launch({ args: blArgs }); } catch (e) {}
    for (const v of ['1243', '1200']) {
      for (const p of ['/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux64/chrome',
                       '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux/chrome']) {
        if (fsMod.existsSync(p)) { try { return await chromium.launch({ args: blArgs, executablePath: p }); } catch (e) {} }
      }
    }
    throw new Error('تعذر إطلاق متصفح');
  };
  const browser = await launchBl();
  const tag = Date.now() % 100000;
  const browser2 = await launchBl();
  const A = await setup(await browser.newContext(), 'rnHA_' + tag);
  const B = await setup(await browser2.newContext(), 'rnHB_' + tag);
  const t0 = Date.now();
  const dump = async (lbl) => {
    const la = await A.evaluate((base) => window.__log.map(e => ({ at: e.t - base, m: e.m, x: e.x })), t0);
    console.log('=== ' + lbl + ' A ===');
    la.forEach(e => console.log('  +' + e.at + 'ms', e.m, e.x ? JSON.stringify(e.x).slice(0, 220) : ''));
  };
  for (const p of [A, B]) await p.evaluate(() => openGame('rn'));
  for (const p of [A, B]) await wait(p, () => !!(typeof RN_ADAPTER !== 'undefined' && RN_ADAPTER), 10000);
  await A.evaluate(() => Rooms.createRoom('rn', 10));
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code);
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await A.evaluate(() => Rooms.startGame());
  for (const p of [A, B]) await wait(p, () => !!(RN_ADAPTER && RN_ADAPTER.room), 10000);
  await A.evaluate(() => RN_chooseMode('number_only'));
  await A.evaluate(() => RN_startRound());

  const wait2Sel = async () => {
    for (let i = 0; i < 100; i++) {
      const st = await Promise.all([A, B].map(p => p.evaluate(() => (RN_ADAPTER && RN_ADAPTER.core) ? RN_ADAPTER.core.state : '').catch(() => '')));
      if (st[0] === 'SELECTING' && await A.evaluate(() => RN_ADAPTER.core.myRole === 'selector')) return A;
      if (st[1] === 'SELECTING' && await B.evaluate(() => RN_ADAPTER.core.myRole === 'selector')) return B;
      await A.waitForTimeout(250);
    }
    return null;
  };
  const waitJoin = async () => {
    for (let i = 0; i < 400; i++) {
      const okA = await A.evaluate(() => !!document.getElementById('rnJoinPhase')).catch(() => false);
      const okB = await B.evaluate(() => !!document.getElementById('rnJoinPhase')).catch(() => false);
      if (okA && okB) return true;
      await A.waitForTimeout(300);
    }
    return false;
  };
  for (let rd = 1; rd <= 3; rd++) {
    const j = await waitJoin();
    console.log('R' + rd + ' join phase on both: ' + j);
    if (!j) { await dump('تعليق في جولة ' + rd); break; }
    const roles = await Promise.all([A, B].map(p => p.evaluate(() => (RN_ADAPTER.core ? RN_ADAPTER.core.myRole : ''))));
    const selJ = roles[0] === 'selector' ? A : B;
    const dlJ = selJ === A ? B : A;
    await selJ.evaluate(() => RN_joinRound());
    await selJ.waitForTimeout(450);
    await dlJ.evaluate(() => RN_joinRound());
    const st1 = await wait(A, (r) => (RN_ADAPTER.room && RN_ADAPTER.room.round >= r) ? 1 : null, 15000, rd);
    console.log('R' + rd + ' started:', !!st1);
    const sel2 = await wait2Sel();
    console.log('R' + rd + ' selector page found: ' + (!!sel2) + ' roles=' + JSON.stringify(roles));
    if (!sel2) { await dump('لا SELECTION_REQUIRED في جولة ' + rd); break; }
    await sel2.evaluate(() => RN_selectNum(7));
    await sel2.evaluate(() => RN_confirm());
    /* مراقبة حالة المحرك حتى ROUND_ENDED (حد 120ث) */
    let ended = false;
    for (let i = 0; i < 60; i++) {
      await A.waitForTimeout(2000);
      const st = await A.evaluate(() => ({ core: RN_ADAPTER.core.state, phase: RN_ADAPTER.room.phase, round: RN_ADAPTER.room.round })).catch(() => null);
      if (st && (st.core === 'ROUND_ENDED' || st.phase === 'join')) { ended = true; break; }
    }
    console.log('R' + rd + ' ended+transitioned: ' + ended);
    if (!ended) { await dump('تعليق بعد تأكيد جولة ' + rd); break; }
  }
  await dump('النهاية');
  const errsA = A._errs, errsB = B._errs;
  console.log('errors A:', JSON.stringify(errsA), 'B:', JSON.stringify(errsB));
  await browser.close(); await browser2.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
