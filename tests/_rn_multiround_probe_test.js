/* ═══ تشخيص فلات دوغ (rn): جولات متعددة — تسوية كل جولة + الانتقال الآلي ═══
   يختبر ما لا يغطيه _rn_bet_test.js (يتوقف بعد الجولة 1):
   - الجولة 2 و3 و4: هل تُسوّى تلقائياً؟ هل تظهر مرحلة المشاركة؟
   - هل الانتقال للجولة التالية آلي بعد مصادقة الطرفين؟ */
const { chromium } = require('playwright');
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
  /* مراقبة نداءات التسوية والمشاركة بتوقيتها */
  page._net = [];
  page.on('request', req => {
    const u = req.url();
    if (/settleRound|roundJoin|roundWithdraw|rooms\/move|timeoutSeat/.test(u)) {
      page._net.push({ t: Date.now(), m: req.method(), u: u.replace(/^https?:\/\/[^/]+/, ''), post: (req.postData() || '').slice(0, 150) });
    }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
  /* التقاط مصدر نداء التسوية: من يستدعي roomSettle ومتى وبأي علم settled */
  await page.evaluate(() => {
    window.__settleLog = [];
    window.__chainLog = [];
    const orig = Rooms.roomSettle.bind(Rooms);
    Rooms.roomSettle = function (result) {
      window.__settleLog.push({
        at: Date.now(), result: result,
        settled: Rooms.state ? Rooms.state.settled : 'nostate',
        status: Rooms.state ? Rooms.state.status : 'nostate',
        stack: (new Error().stack || '').split('\n').slice(2, 6).join(' | ')
      });
      return orig(result);
    };
    /* تتبع سلسلة الانتقال: تركيب الأحداث بعد تهيئة المحوّل */
    const arm = () => {
      const ad = (typeof RN_ADAPTER !== 'undefined') ? RN_ADAPTER : null;
      if (!ad || ad.__chained) return setTimeout(arm, 300);
      ad.__chained = true;
      const log = (m, extra) => window.__chainLog.push(Object.assign({ at: Date.now(), m: m }, extra || {}));
      const core0 = ad.core;
      const origEmit = core0.emit.bind(core0);
      core0.emit = function (ev, d) {
        if (ev === 'ROUND_RESULT' || ev === 'ROUND_ENDED') log('emit:' + ev, { winner: d && d.winner });
        return origEmit(ev, d);
      };
      const origNext = ad.ownerNextRound.bind(ad);
      ad.ownerNextRound = function () {
        const bet = (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.bet) || this.room.bet;
        const duo = this.room ? [this.room.order[0], this.room.order[1]] : [];
        const duoHuman = duo.map(id => {
          if (id == null) return 'null';
          if (String(id).indexOf('bot:') === 0) return 'bot';
          const p = (this.room.players || []).find(x => x && String(x.id) === String(id));
          return p ? (p.spectate ? 'spec' : (p.isBot ? 'isBot' : 'human')) : 'missing';
        });
        log('ownerNextRound', { isOwner: this.room && this.room.isOwner, mode: this.room && this.room.mode, bet: bet, duo: duo, duoHuman: duoHuman });
        return origNext();
      };
      const origJoin = ad.ownerStartJoinPhase.bind(ad);
      ad.ownerStartJoinPhase = function () { log('ownerStartJoinPhase'); return origJoin(); };
      const origStart = ad.ownerStartRound.bind(ad);
      ad.ownerStartRound = function () { log('ownerStartRound'); return origStart(); };
    };
    setInterval(arm, 300);
  });
  await page.evaluate((g) => { window.ST = window.ST || {}; window.ST.gold = g; if (window.save) save(); }, gold || 5000);
  await page.waitForTimeout(400);
  return page;
}
async function wait2Sel(A, B) {
  /* ينتظر حتى يبلغ أحد المتصفحين حالة SELECTION_REQUIRED ويعيد صفحة المتخمّن */
  for (let i = 0; i < 80; i++) {
    const st = await Promise.all([A, B].map(p => p.evaluate(() => (RN_ADAPTER && RN_ADAPTER.core) ? RN_ADAPTER.core.state : '').catch(() => '')));
    if (st[0] === 'SELECTING' && await A.evaluate(() => RN_ADAPTER.core.myRole === 'selector')) return A;
    if (st[1] === 'SELECTING' && await B.evaluate(() => RN_ADAPTER.core.myRole === 'selector')) return B;
    await A.waitForTimeout(250);
  }
  return null;
}
async function serverGold(page) {
  return page.evaluate(async () => {
    const r = await fetch('/api/me', { credentials: 'include' }).then(x => x.json()).catch(() => null);
    return r && r.user ? r.user.gold : null;
  });
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
  const results = [];
  const ok = (n, c, extra) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n + (extra ? ' ' + extra : '')); };
  const tag = Date.now() % 100000;
  const browser2 = await launchBl();
  const A = await setup(await browser.newContext(), 'rnA_' + tag, 5000);
  const B = await setup(await browser2.newContext(), 'rnB_' + tag, 5000);
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
  await A.evaluate(() => RN_startRound());

  const g0A = await serverGold(A), g0B = await serverGold(B);
  const N_ROUNDS = 4;
  for (let rd = 1; rd <= N_ROUNDS; rd++) {
    /* مرحلة المشاركة عند الطرفين */
    const jA = await wait(A, () => !!document.getElementById('rnJoinPhase') ? 1 : null, 16000);
    const jB = await wait(B, () => !!document.getElementById('rnJoinPhase') ? 1 : null, 16000);
    ok('round ' + rd + ': join phase visible on A+B', jA && jB);
    if (!jA || !jB) { console.log('   (فشل ظهور مرحلة المشاركة — توقف التشخيص)'); break; }

    /* علم settled كما يراه العميل قبل المشاركة */
    const settledBefore = await A.evaluate(() => (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state.settled : 'nostate');
    console.log('   [تشخيص] Rooms.state.settled قبل المشاركة في الجولة ' + rd + ' = ' + JSON.stringify(settledBefore));

    /* [v2.80] من المتخمّن؟ يصادق أولاً ثم الموزّع — الأدوار تُقرأ حيّةً
       (core.myRole) فلا خداع بأدوار الجولة السابقة إن تبادلت بالدوران */
    const roles = await Promise.all([A, B].map(p => p.evaluate(() => ({ me: (RN_ADAPTER.core ? RN_ADAPTER.core.myRole : ''), myId: AUTH.user.id }))));
    const selPage = roles[0].me === 'selector' ? A : (roles[1].me === 'selector' ? B : A);
    const dlPage = selPage === A ? B : A;
    const gSelBefore = await serverGold(selPage), gDlBefore = await serverGold(dlPage);
    await selPage.evaluate(() => RN_joinRound());
    await selPage.waitForTimeout(600);
    const gSelAfterJoin = await serverGold(selPage);
    ok('round ' + rd + ': selector deducted on participate', Math.abs(gSelAfterJoin - (gSelBefore - 10)) < 0.02, '(Δ=' + (gSelAfterJoin - gSelBefore) + ')');
    await dlPage.evaluate(() => RN_joinRound());

    /* الجولة تنطلق آلياً بعد مصادقة الطرفين */
    const started = await wait(A, (rd2) => (RN_ADAPTER.room && RN_ADAPTER.room.round >= rd2 && RN_ADAPTER.room.phase === 'playing') ? 1 : null, 12000, rd);
    if (!started) {
      /* تشخيص عميق: ماذا يحدث عند الطرفين والخادم؟ */
      const diag = await Promise.all([A, B].map(async p => p.evaluate(async () => {
        const r = await fetch('/api/rooms/active', { credentials: 'include' }).then(x => x.json()).catch(() => null);
        return {
          round: RN_ADAPTER.room ? RN_ADAPTER.room.round : null,
          phase: RN_ADAPTER.room ? RN_ADAPTER.room.phase : null,
          coreState: RN_ADAPTER.core ? RN_ADAPTER.core.state : null,
          isOwner: RN_ADAPTER.room ? RN_ADAPTER.room.isOwner : null,
          srv: r && r.room ? { status: r.room.status, settled: r.room.settled, roundJoin: r.room.roundJoin, round: r.room.room_state && r.room.room_state.round } : r
        };
      })));
      console.log('   [تشخيص فشل الإطلاق] A:', JSON.stringify(diag[0]));
      console.log('   [تشخيص فشل الإطلاق] B:', JSON.stringify(diag[1]));
    }
    ok('round ' + rd + ': auto-start after both confirmed', !!started);
    if (!started) { console.log('   (فشل الإطلاق الآلي — توقف التشخيص)'); break; }

    /* الانتظار حتى نهاية الجولة: مرحلة المشاركة التالية أو انقضاء الجولات */
    /* المتخمّن يختار ويؤكد — يُحدَّد بعد انطلاق الجولة (الأدوار الجديدة) */
    const selPage2 = await wait2Sel(A, B);
    const sp = selPage2 || selPage;
    await wait(sp, () => !!(RN_ADAPTER.core && RN_ADAPTER.core.state === 'SELECTING'), 15000);
    await sp.evaluate(() => RN_selectNum(7));
    await sp.evaluate(() => RN_confirm());

    /* [v2.80] انتظار هبوط التسوية فعلاً: سلسلة السحب المتحركة تستغرق حتى
       ~20ث — الانتظار حتى ظهور مرحلة المشاركة التالية (دليل اكتمال الدورة)
       بحدّ 40ث بدل مهلة ثابتة قصيرة تقيس قبل نهاية الجولة أصلاً */
    const nextJoin = await wait(A, () => (RN_ADAPTER.room && RN_ADAPTER.room.phase === 'join') ? 1 : null, 90000);
    console.log('   [دورة ' + rd + '] مرحلة المشاركة التالية: ' + (nextJoin ? 'ظهرت' : 'لم تظهر (مهلة 90ث)'));
    await A.waitForTimeout(1200);
    const gA = await serverGold(A), gB = await serverGold(B);
    const dA = Math.round((gA - g0A) * 100) / 100, dB = Math.round((gB - g0B) * 100) / 100;
    const pair = [dA, dB].sort((x, y) => y - x);
    /* [v2.80] محاسبة الجملة المزدوجة: مجموع زوج الأرصدة = −20×(جولات مشارك بها)
       + 19×(جولات مسوّاة) — لا يفترض فائزاً واحداً (كان يفشل مع توزّع الفوز) */
    const pairSum = Math.round((dA + dB) * 100) / 100;
    const settledRounds = Math.round((pairSum + 20 * rd) / 19);
    const expectSum = Math.round((-20 * rd + 19 * settledRounds) * 100) / 100;
    ok('round ' + rd + ': cumulative settlement consistent (' + settledRounds + '/' + rd + ' rounds settled)',
       Math.abs(pairSum - expectSum) < 0.02 && settledRounds === rd,
       '(ΔA=' + dA + ' ΔB=' + dB + ' pairSum=' + pairSum + ')');
    if (settledRounds < rd) {
      console.log('   ⚠ الجولة ' + rd + ' لم تُسوَّ! المتراكم المسوّى = ' + settledRounds + ' من ' + rd);
      const escrowProbe = await A.evaluate(async () => {
        const r = await fetch('/api/rooms/active', { credentials: 'include' }).then(x => x.json()).catch(() => null);
        return r && r.room ? { settled: r.room.settled, status: r.room.status } : r;
      });
      console.log('   [تشخيص] حالة الخادم:', JSON.stringify(escrowProbe));
    }
    /* تتبع نداءات التسوية (آخر 8 نداءات) */
    const t0 = await A.evaluate(() => window.__probeT0 || (window.__probeT0 = Date.now()));
    const netA = A._net.filter(n => /settleRound/.test(n.u)).slice(-4);
    const netB = B._net.filter(n => /settleRound/.test(n.u)).slice(-4);
    console.log('   [شبكة A] settleRound:', JSON.stringify(netA.map(n => ({ at: n.t - t0, post: n.post }))));
    console.log('   [شبكة B] settleRound:', JSON.stringify(netB.map(n => ({ at: n.t - t0, post: n.post }))));
    const slA = await A.evaluate(() => window.__settleLog || []);
    const slB = await B.evaluate(() => window.__settleLog || []);
    console.log('   [settleLog A]:', JSON.stringify(slA.map(s => ({ at: s.at - t0, result: s.result, settled: s.settled, status: s.status }))));
    if (slA.length) console.log('   [settleLog A stack]:', slA[slA.length - 1].stack);
    console.log('   [settleLog B]:', JSON.stringify(slB.map(s => ({ at: s.at - t0, result: s.result, settled: s.settled, status: s.status }))));
    /* سلسلة الانتقال للجولة التالية: هل اشتغلت الحلقات كلها؟ */
    const chainA = await A.evaluate(() => window.__chainLog || []);
    console.log('   [سلسلة A]:', JSON.stringify(chainA));
    const chainB = await B.evaluate(() => window.__chainLog || []);
    console.log('   [سلسلة B]:', JSON.stringify(chainB));
  }
  ok('no page errors (A=' + A._errs.length + ' B=' + B._errs.length + ')', A._errs.length === 0 && B._errs.length === 0);
  await browser.close(); await browser2.close();
  const failed = results.filter(r => !r[1]).length;
  console.log('\n═══ تشخيص فلات دوغ متعدد الجولات: ' + (results.length - failed) + '/' + results.length + ' ═══');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
