/* ═══════════════════════════════════════════════════════════════════════════
   [v2.76] اختبار صفحة التحكيم المخصّصة + الترتيب الحقيقي للمتصدرون
   ───────────────────────────────────────────────────────────────────────────
   يغطي (خادمياً + متصفحين حقيقيين + ساكن):
     A) الترتيب الحقيقي (/api/lb): زرع تذاكر رهان معروفة ⇒ ترتيب عام بمجموع
        الأرباح + ترتيب لكل لعبة (?game=) + حقل me برتبة الطالب + استبعاد
        الأدمن + قائمة الألعاب ذات الجولات
     B) /api/matches/mine: بلا غرفة ⇒ null · بغرفة جارية ⇒ الغرفة + الجلسة
        بعد start-stream · حراسة الدخول (401)
     C) واجهة الترتيب: صفوف حقيقية بأرباح ملونة + رقائق تصفية (عام + لكل
        لعبة) + بطاقة «ترتيبك» + تمييز «أنت» لصف المستخدم
     D) واجهة صفحة التحكيم للاعب: بطاقة «جلستي الحالية» بلاعبي الغرفة وحالات
        بثهم + زر المشاركة من الصفحة + بطاقة الإرشاد لمن ليست له غرفة
     E) واجهة صفحة التحكيم للأدمن: المركز كاملاً داخل الصفحة (إحصاءات +
        جلسات + مشاهد مزدوج) وبث شاشة حقيقي عبر P2P يصل لفيديو داخل الصفحة
        + الحسم من أزرار الصفحة يوزع الأرباح
     F) ساكن: عنصر التنقل + القسم + السكربت + الترجمات ×4 + DTSG_BUILD
        + أنماط CSS الجديدة بلا ميزات كاسرة لمتصفح نوكيا
   تشغيل:  QA_BASE=http://127.0.0.1:3971/ node tests/_v276_lb_arbpage_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(l, c) { if (c === undefined || c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } }

(async () => {
  const browser = await PW.launchBrowser();
  const ts = Date.now() % 100000;

  async function setup(ctx, username) {
    await ctx.request.post(PW.BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
    await ctx.request.post(PW.BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERR: ' + String(e.message).slice(0, 110)));
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|404|net::ERR|favicon/i.test(t)) errs.push(t.slice(0, 110)); });
    page._errs = errs;
    await page.goto(PW.BASE, { waitUntil: 'domcontentloaded' });
    await PW.wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 20000);
    await page.waitForTimeout(800);
    return page;
  }
  async function setupAdmin(ctx) {
    await ctx.request.post(PW.BASE + 'api/login', { data: { username: 'qa_admin', password: 'QaTest12345' } }).catch(() => {});
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERR: ' + String(e.message).slice(0, 110)));
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|404|net::ERR|favicon/i.test(t)) errs.push(t.slice(0, 110)); });
    page._errs = errs;
    await page.goto(PW.BASE, { waitUntil: 'domcontentloaded' });
    await PW.wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.role !== 'user'), 20000);
    await page.waitForTimeout(800);
    return page;
  }
  function serverGold(page) {
    return page.evaluate(() => API.post('/api/sync', {}).then(r => (r.ok && r.data) ? r.data.gold : null));
  }

  const ctxA = await browser.newContext({ locale: 'ar-MA' });
  const ctxB = await browser.newContext({ locale: 'ar-MA' });
  const ctxC = await browser.newContext({ locale: 'ar-MA' });
  const ctxAdm = await browser.newContext({ locale: 'ar-MA' });
  const A = await setup(ctxA, 'lbp1_' + ts);   /* لاعب 1: غرفة + بث */
  const B = await setup(ctxB, 'lbp2_' + ts);   /* لاعب 2: خصم الغرفة */
  const C = await setup(ctxC, 'lbp3_' + ts);   /* لاعب 3: بلا غرفة */
  const ADM = await setupAdmin(ctxAdm);

  /* ═══ A) الترتيب الحقيقي — زرع تذاكر معروفة ثم القراءة ═══ */
  console.log('── A) /api/lb: ترتيب عام بمجموع الأرباح + لكل لعبة');
  /* [حتمية] قاعدة QA تضم 168+ مستخدماً بتذاكر تاريخية (أرباح ≤ 270) والقائمة
     تُقتطع عند 50 عاماً / 20 للعبة — فتُزرع أرباح مميزة تضمن الصدارة، وتُستعمل
     لعبة نقية بلا تذاكر تاريخية (do) للفحص السالب الحتمي، ويُتحقق من المجموع
     السالب عبر حقل me (يُحسب من المصفوفة الكاملة بلا اقتطاع) */
  /* u1(lbp1): rn +450 · do +360 · ch −50 ⇒ مجموع +760 */
  await A.evaluate(() => API.post('/api/rounds', { game_id: 'rn', bet: 500, won: true, payout: 950 }));
  await A.evaluate(() => API.post('/api/rounds', { game_id: 'do', bet: 400, won: true, payout: 760 }));
  await A.evaluate(() => API.post('/api/rounds', { game_id: 'ch', bet: 50, won: false, payout: 0 }));
  /* u2(lbp2): rn +900 · bl8 +270 ⇒ مجموع +1170 */
  await B.evaluate(() => API.post('/api/rounds', { game_id: 'rn', bet: 1000, won: true, payout: 1900 }));
  await B.evaluate(() => API.post('/api/rounds', { game_id: 'bl8', bet: 300, won: true, payout: 570 }));
  /* u3(lbp3): rn −100 · do −10 ⇒ مجموع −110 (تحت الاقتطاع — يُتحقق منه عبر me) */
  await C.evaluate(() => API.post('/api/rounds', { game_id: 'rn', bet: 100, won: false, payout: 0 }));
  await C.evaluate(() => API.post('/api/rounds', { game_id: 'do', bet: 10, won: false, payout: 0 }));
  /* الأدمن يزرع ربحاً ضخماً — يجب ألا يظهر قط (سياسة الاستبعاد) */
  await ADM.evaluate(() => API.post('/api/rounds', { game_id: 'rn', bet: 500, won: true, payout: 950 }));

  const lbAll = await A.evaluate(() => API.get('/api/lb?fresh=1').then(r => r.data || {}));
  const rowsAll = lbAll.leaderboard || [];
  const namesAll = rowsAll.map(r => r.username);
  const iA = namesAll.indexOf('lbp1_' + ts), iB = namesAll.indexOf('lbp2_' + ts);
  ok('A1: الترتيب العام من مجموع الأرباح (lbp2 أولاً +1170 ثم lbp1 +760)',
    iB >= 0 && iA >= 0 && iB < iA && rowsAll[iB].profit === 1170 && rowsAll[iA].profit === 760);
  /* u3 سالب ومحتمل أن يقع تحت اقتطاع الـ50 — حقل me يُحسب من المصفوفة الكاملة */
  const lbMeC = await C.evaluate(() => API.get('/api/lb?fresh=1').then(r => (r.data && r.data.me) || null));
  ok('A2: مجموع lbp3 السالب كامل عبر حقل me (−110 · جولتان · بلا فوز)',
    !!(lbMeC && lbMeC.username === 'lbp3_' + ts && lbMeC.profit === -110 && lbMeC.rounds === 2 && lbMeC.wins === 0));
  ok('A3: الأدمن مستبعد من لوحة الشرف', namesAll.indexOf('qa_admin') === -1);
  ok('A4: قائمة الألعاب ذات الجولات تشمل rn وch وbl8 وdo', (() => {
    const g = (lbAll.games || []).map(x => x.game_id);
    return g.indexOf('rn') !== -1 && g.indexOf('ch') !== -1 && g.indexOf('bl8') !== -1 && g.indexOf('do') !== -1;
  })());
  ok('A5: حقل me برتبة الطالب نفسه (lbp1 رتبته ' + (lbAll.me && lbAll.me.rank) + ' ربح ' + (lbAll.me && lbAll.me.profit) + ')',
    !!(lbAll.me && lbAll.me.username === 'lbp1_' + ts && lbAll.me.rank === iA + 1 && lbAll.me.profit === 760 && lbAll.me.rounds === 3 && lbAll.me.wins === 2));
  const lbRn = await A.evaluate(() => API.get('/api/lb?fresh=1&game=rn').then(r => r.data || {}));
  const rowsRn = lbRn.leaderboard || [];
  const namesRn = rowsRn.map(r => r.username);
  const iARn = namesRn.indexOf('lbp1_' + ts), iBRn = namesRn.indexOf('lbp2_' + ts);
  ok('A6: ترتيب لعبة rn على حدة (scope=' + lbRn.scope + ' · lbp2 ثم lbp1)',
    lbRn.scope === 'rn' && iBRn >= 0 && iARn >= 0 && iBRn < iARn);
  ok('A7: أرباح rn الصافية (lbp2=+900 · lbp1=+450)',
    rowsRn[iBRn].profit === 900 && rowsRn[iARn].profit === 450);
  const lbBl8 = await A.evaluate(() => API.get('/api/leaderboard?fresh=1&game=bl8').then(r => r.data || {}));
  const rowBl8 = (lbBl8.leaderboard || []).find(r => r.username === 'lbp2_' + ts);
  ok('A8: الاسم القديم /api/leaderboard يعمل (bl8 · lbp2=+270)', lbBl8.scope === 'bl8' && !!rowBl8 && rowBl8.profit === 270);
  const lbDo = await A.evaluate(() => API.get('/api/lb?fresh=1&game=do').then(r => r.data || {}));
  const rowDoA = (lbDo.leaderboard || []).find(r => r.username === 'lbp1_' + ts);
  const rowDoC = (lbDo.leaderboard || []).find(r => r.username === 'lbp3_' + ts);
  ok('A9: لعبة نقية (do): موجب وسالب معاً في القائمة (lbp1=+360 · lbp3=−10)',
    !!rowDoA && rowDoA.profit === 360 && !!rowDoC && rowDoC.profit === -10);
  const lbEmpty = await A.evaluate(() => API.get('/api/lb?fresh=1&game=zz9').then(r => r.data || {}));
  ok('A10: لعبة بلا بيانات ⇒ قائمة فارغة (لا خطأ)', lbEmpty.scope === 'zz9' && (lbEmpty.leaderboard || []).length === 0);

  /* ═══ B) /api/matches/mine ═══ */
  console.log('── B) /api/matches/mine: جلستي الحالية');
  const mine0 = await C.evaluate(() => API.get('/api/matches/mine').then(r => r.data || {}));
  ok('B1: بلا غرفة ⇒ room=null وcan_broadcast=false', mine0.ok === true && mine0.room === null && mine0.can_broadcast === false);
  const mineAdm = await ADM.evaluate(() => API.get('/api/matches/mine').then(r => r.data || {}));
  ok('B2: الأدمن (ليس لاعباً) ⇒ room=null', mineAdm.ok === true && mineAdm.room === null);

  /* غرفة شطرنج جارية (نمط v275 — تسوية خادمية مضمونة) */
  await A.evaluate(() => openGame('ch'));
  await A.evaluate(() => Rooms.createRoom('ch', { bet: 40, max_players: 2, game_opts: { timer: 90 } }));
  const code = await PW.wait(A, () => (Rooms.state && Rooms.state.code) ? Rooms.state.code : null, 9000);
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 9000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 9000);
  await A.evaluate(() => Rooms.startGame());
  await A.waitForTimeout(1800);
  const roomId = await A.evaluate(() => Rooms.state.id);

  const mine1 = await A.evaluate(() => API.get('/api/matches/mine').then(r => r.data || {}));
  ok('B3: بغرفة جارية ⇒ الغرفة كاملة (can_broadcast=true · لاعبان)',
    !!(mine1.room && mine1.room.id === roomId && mine1.room.status === 'playing' && mine1.can_broadcast === true && (mine1.room.players || []).length === 2));
  ok('B4: بلا جلسة تحكيم بعد ⇒ session=null', mine1.session === null || mine1.session === undefined);
  const ss = await A.evaluate((rid) => API.post('/api/matches/' + rid + '/start-stream', {}).then(r => r.data || {}), roomId);
  const mine2 = await A.evaluate(() => API.get('/api/matches/mine').then(r => r.data || {}));
  ok('B5: بعد start-stream ⇒ جلسة التحكيم تُرى من جلستي (لاعبان بحالة idle)',
    !!(ss.token && mine2.session && mine2.session.room_id === roomId && (mine2.session.players || []).length === 2 &&
      mine2.session.players.every(p => p.state === 'idle')));

  /* ═══ C) واجهة صفحة الترتيب ═══ */
  console.log('── C) واجهة المتصدرين (ترتيب حقيقي)');
  /* تدفئة الكاش بالبيانات المزروعة ثم فتح الصفحة */
  await A.evaluate(() => API.get('/api/lb?fresh=1'));
  await A.evaluate(() => nav('lb'));
  const lbUi = await PW.wait(A, () => {
    const rows = document.querySelectorAll('#lbList .lrow');
    const profits = document.querySelectorAll('#lbList .lprofit');
    const chips = document.querySelectorAll('#lbFilters .fchip');
    const you = document.querySelectorAll('#lbList .lb-you');
    const meCard = document.getElementById('lbMeCard');
    return (rows.length >= 3 && profits.length >= 3 && chips.length >= 3 && you.length === 1 && meCard && meCard.innerHTML.trim() !== '') ? { rows: rows.length, chips: chips.length } : null;
  }, 10000);
  ok('C1: صفوف حقيقية بأرباح + رقائق تصفية + تمييز «أنت» + بطاقة «ترتيبك» (صفوف=' + (lbUi && lbUi.rows) + ' رقائق=' + (lbUi && lbUi.chips) + ')', !!lbUi);
  const posNeg = await A.evaluate(() => ({
    pos: document.querySelectorAll('#lbList .lprofit.pos').length,
    overallActive: !!document.querySelector('#lbFilters .fchip.active')
  }));
  /* [حتمية] قمة الـ50 العامة قد تكون كلها موجبة (المستخدمون التاريخيون تحت
     الاقتطاع) — السالب يُفحص حتمياً في نطاق لعبة نقية (C3/do) */
  ok('C2: أرباح موجبة خضراء في الترتيب العام (pos=' + posNeg.pos + ')', posNeg.pos >= 2 && posNeg.overallActive === true);
  /* رقاقة لعبة نقية (do): ترتيب اللعبة وحدها — موجب وسالب حتميان معاً */
  const doClicked = await A.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('#lbFilters .fchip'));
    const do1 = chips.find(c => (c.getAttribute('onclick') || '').indexOf("'do'") !== -1);
    if (!do1) return null;
    do1.click();
    return 'clicked';
  });
  const doUi = await PW.wait(A, () => {
    const t = document.getElementById('lbList').textContent || '';
    const pos = document.querySelectorAll('#lbList .lprofit.pos').length;
    const neg = document.querySelectorAll('#lbList .lprofit.neg').length;
    return (t.indexOf('lbp1_') !== -1 && t.indexOf('lbp3_') !== -1 && pos >= 1 && neg >= 1) ? 'do-scope' : null;
  }, 10000);
  ok('C3: رقاقة الضومنة ترتب تلك اللعبة وحدها (lbp1 موجب + lbp3 سالب معاً)', doClicked === 'clicked' && doUi === 'do-scope');
  /* رقاقة rn: أول صف هو lbp2 (ربحها +900 الأعلى حتمياً في تلك اللعبة) */
  const rnClicked = await A.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('#lbFilters .fchip'));
    const rn = chips.find(c => (c.getAttribute('onclick') || '').indexOf("'rn'") !== -1);
    if (!rn) return null;
    rn.click();
    return 'clicked';
  });
  const rnUi = await PW.wait(A, () => {
    const first = document.querySelector('#lbList .lrow .lpl b');
    return (first && first.textContent.indexOf('lbp2_') !== -1) ? 'rn-top' : null;
  }, 10000);
  ok('C4: رقاقة فلات دوغ: صدارة القائمة لصاحب أعلى ربح في اللعبة', rnClicked === 'clicked' && rnUi === 'rn-top');

  /* ═══ D) واجهة صفحة التحكيم — اللاعب ═══ */
  console.log('── D) صفحة التحكيم للاعب');
  await C.evaluate(() => nav('arb'));
  const guideUi = await PW.wait(C, () => {
    const g = document.querySelector('#pg-arb .arb-guide');
    return g ? 'guide' : null;
  }, 9000);
  ok('D1: بطاقة الإرشاد لمن ليست له غرفة (زر الذهاب للغرف)', guideUi === 'guide' && !!(await C.evaluate(() => document.querySelector('#pg-arb .arb-guide .btn'))));
  const stepsUi = await C.evaluate(() => ({
    steps: document.querySelectorAll('#pg-arb .arb-step').length,
    rules: document.querySelectorAll('#pg-arb .arb-rules-list li').length
  }));
  ok('D2: شرح الخطوات الثلاث + قواعد التحكيم (خطوات=' + stepsUi.steps + ' قواعد=' + stepsUi.rules + ')', stepsUi.steps === 3 && stepsUi.rules === 3);

  await A.evaluate(() => nav('arb'));
  const mineUi = await PW.wait(A, () => {
    const card = document.querySelector('#pg-arb .arb-mine');
    const btn = document.getElementById('arbShareBtn');
    const players = document.querySelectorAll('#pg-arb .arb-pl-item');
    const chip = document.getElementById('arbPageChip');
    return (card && btn && players.length === 2 && chip) ? 'ready' : null;
  }, 9000);
  ok('D3: بطاقة «جلستي الحالية»: الغرفة + لاعباها + زر البث + شريحة الحالة', mineUi === 'ready');
  const mineNames = await A.evaluate(() => Array.from(document.querySelectorAll('#pg-arb .arb-pl-item b')).map(b => b.textContent));
  ok('D4: لاعبا الغرفة معروضان بحالتي بثهما', mineNames.length === 2 && mineNames.some(n => n.indexOf('lbp1_') !== -1) && mineNames.some(n => n.indexOf('lbp2_') !== -1));

  /* ═══ E) صفحة التحكيم للأدمن + بث P2P عبر الصفحة + الحسم منها ═══ */
  console.log('── E) مركز التحكيم بالصفحة عند الأدمن (بث حقيقي + حسم)');
  await ADM.evaluate(() => nav('arb'));
  const admUi = await PW.wait(ADM, () => {
    const consoleEl = document.getElementById('arbConsole');
    const stats = document.getElementById('arbStatsRow');
    const cards = document.querySelectorAll('#arbConsole .arb-card');
    return (consoleEl && stats && cards.length >= 1) ? { cards: cards.length } : null;
  }, 12000);
  ok('E1: المركز يعمل داخل الصفحة (إحصاءات + بطاقات جلسات=' + (admUi && admUi.cards) + ')', !!admUi);

  /* اللاعب يبث من زر الصفحة — وصول الفيديو لفيديو داخل الصفحة عند الأدمن
     [مجرى تركيبي] getDisplayMedia يستحيل في متصفح بلا واجهة (نمط v275):
     نستبدلها بـcanvas.captureStream — مسار WebRTC كله حقيقي بعدها */
  await A.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    const draw = () => {
      frame++;
      ctx.fillStyle = '#0b1526'; ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = '#F5C518'; ctx.font = 'bold 40px sans-serif';
      ctx.fillText('ARB PAGE LIVE', 150, 170);
      ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif';
      ctx.fillText('frame ' + frame, 250, 230);
    };
    draw();
    setInterval(draw, 250);
    const fake = canvas.captureStream(10);
    navigator.mediaDevices.getDisplayMedia = () => Promise.resolve(fake);
  });
  const shareRes = await A.evaluate(async () => {
    try { await ARB_PAGE.share(); return { ok: true, state: ARB.state() }; }
    catch (e) { return { ok: false, err: String(e).slice(0, 90) }; }
  });
  ok('E2: زر المشاركة من الصفحة انطلق (state=' + (shareRes.state || shareRes.err) + ')', shareRes.ok === true);
  const vidInPage = await PW.wait(ADM, () => {
    const vids = Array.from(document.querySelectorAll('#pg-arb .arb-vbox video'));
    for (const v of vids) {
      if (v.srcObject) {
        const tracks = v.srcObject.getVideoTracks();
        if (tracks.length && tracks[0].readyState === 'live') return 'live-in-page';
      }
    }
    return null;
  }, 15000);
  ok('E3: بث الشاشة وصل لفيديو داخل صفحة التحكيم عبر WebRTC P2P', vidInPage === 'live-in-page');
  const myChipLive = await PW.wait(A, () => {
    const chip = document.getElementById('arbPageChip');
    return (chip && chip.textContent.indexOf('مباشر') !== -1) ? 'live' : null;
  }, 8000);
  ok('E4: شريحة «بثّي» في الصفحة تعرض مباشر', myChipLive === 'live');

  /* الحسم من أزرار الصفحة (داخل #arbConsole) — الرابح A: جرة 80 − 5% = +76 */
  const gA0 = await serverGold(A);
  const uidA = await A.evaluate(() => AUTH.user.id);
  const resolveFromPage = await ADM.evaluate((x) => {
    const btn = document.querySelector('#arbConsole .arb-actions .btn.gold');
    if (!btn) return 'no-btn';
    /* أول زر ذهبي = تأكيد فوز اللاعب الأول (A صاحب order[0]) */
    btn.click();
    return 'clicked';
  }, { uid: uidA });
  await A.waitForTimeout(1600);
  const gA1 = await serverGold(A);
  ok('E5: زر «تأكيد الفوز» من صفحة التحكيم يوزع الأرباح (' + gA0 + ' → ' + gA1 + ' · زر=' + resolveFromPage + ')',
    resolveFromPage === 'clicked' && gA1 != null && Math.abs(gA1 - (gA0 + 76)) < 0.001);
  const sessionGone = await PW.wait(ADM, () => (!document.querySelector('#arbConsole .arb-card') && !document.querySelector('#pg-arb .arb-vbox')) ? 'gone' : null, 8000);
  ok('E6: الجلسة انتهت والبث فُكّ نظيفاً بعد الحسم', sessionGone === 'gone');

  /* مغادرة الصفحة تفك اللوحة بهدوء (بلا أخطاء) */
  await ADM.evaluate(() => nav('home'));
  await ADM.waitForTimeout(800);
  ok('E7: مغادرة صفحة التحكيم نظيفة (بلا أخطاء متصفح)', ADM._errs.length === 0);

  /* ═══ F) فحوص ساكنة ═══ */
  console.log('── F) فحوص ساكنة');
  const REPO = path.join(__dirname, '..');
  const idx = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  /* [v2.77] الفحص كان يثبّت قيمة ?v= حرفياً (v276) ⇒ أي رفع شرعي للإصدار
     بعد 2.76 يجعل الحارس يفشل بلا سبب. المقصود المُغطّى هو «الملف مُحمَّل
     مع كاش-بيرست غير فارغ» — نتحقق من ذلك بدل رقم الإصدار. */
  const busted = (f) => new RegExp('src="' + f.replace(/[/.]/g, '\\$&') + '\\?v=[^"]+"').test(idx);
  const linked = (f) => new RegExp('href="' + f.replace(/[/.]/g, '\\$&') + '\\?v=[^"]+"').test(idx);
  ok('F1: عنصر التنقل + القسم + السكربت في index.html',
    idx.indexOf('data-nav="arb"') !== -1 && idx.indexOf('id="pg-arb"') !== -1 &&
    busted('js/core/arb-page.js') && idx.indexOf('id="lbFilters"') !== -1 && idx.indexOf('id="lbMeCard"') !== -1);
  ok('F2: إصدارات الكاش مرفوعة (main/live/arb ×3/translations/chrome css)',
    busted('js/main.js') && busted('js/core/live.js') && busted('js/core/arb-client.js') &&
    busted('js/core/arb-admin.js') && busted('js/i18n/translations.js') && linked('css/09-chrome.css'));
  const tr = fs.readFileSync(path.join(REPO, 'js/i18n/translations.js'), 'utf8');
  const trKeys = ['ui.arbNav', 'arb.pageTitle', 'arb.mineTitle', 'arb.step1', 'arb.rulesTitle', 'lb.sub', 'lb.overall', 'lb.profit', 'lb.meRank', 'lb.noData'];
  const trOk = trKeys.every(k => tr.indexOf("'" + k + "'") !== -1);
  ok('F3: مفاتيح الترجمة الجديدة موجودة (' + trKeys.length + ' مفتاحاً)', trOk);
  /* كل مفتاح جديد مصفوفة من 4 لغات */
  const tr4 = trKeys.every(k => {
    const m = tr.match(new RegExp("'" + k.replace('.', '\\.') + "': \\[([^\\]]+)\\]"));
    if (!m) return false;
    return (m[1].match(/'/g) || []).length >= 8;   /* 4 لغات × زوجا اقتباس على الأقل */
  });
  ok('F4: كل مفتاح مترجم بـ4 لغات', tr4);
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const mainJs = fs.readFileSync(path.join(REPO, 'js/main.js'), 'utf8');
  const mBuild = mainJs.match(/DTSG_BUILD = '([^']+)'/);
  ok('F5: بصمة البناء = إصدار الحزمة (' + (mBuild && mBuild[1]) + ')', !!mBuild && mBuild[1] === 'v' + pkg.version);
  const chromeCss = fs.readFileSync(path.join(REPO, 'css/09-chrome.css'), 'utf8');
  ok('F6: أنماط CSS الجديدة موجودة (arb-mine/lbme/lprofit/lb-you)',
    chromeCss.indexOf('.arb-mine') !== -1 && chromeCss.indexOf('.lbme') !== -1 &&
    chromeCss.indexOf('.lprofit') !== -1 && chromeCss.indexOf('.lb-you') !== -1);
  const v276Css = chromeCss.slice(chromeCss.indexOf('v2.76·صفحة التحكيم'));
  ok('F7: الإضافات الجديدة بلا ميزات كاسرة لمتصفح نوكيا (:has/color-mix/cqh)',
    v276Css.indexOf(':has(') === -1 && v276Css.indexOf('color-mix(') === -1 && v276Css.indexOf('cqh') === -1 && v276Css.indexOf('cqw') === -1);
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok('F8: الخادم: مسار mine + حساب lbCompute + تجاوز الكاش في وضع الاختبار فقط',
    srv.indexOf("'/api/matches/mine'") !== -1 && srv.indexOf('function lbCompute(') !== -1 &&
    srv.indexOf("process.env.DM_TEST_MODE === '1') && parsedUrl.query && String(parsedUrl.query.fresh || '') === '1'") !== -1);

  ok('G1: صفر أخطاء متصفح (اللاعبون والأدمن)', A._errs.length === 0 && B._errs.length === 0 && C._errs.length === 0 && ADM._errs.length === 0);
  if (A._errs.length || B._errs.length || C._errs.length || ADM._errs.length) {
    console.log('   A:', A._errs.slice(0, 4), '\n   B:', B._errs.slice(0, 4), '\n   C:', C._errs.slice(0, 4), '\n   ADM:', ADM._errs.slice(0, 4));
  }

  await ctxA.close(); await ctxB.close(); await ctxC.close(); await ctxAdm.close();
  await browser.close();
  console.log('\n═══ [v2.76 صفحة تحكيم + ترتيب حقيقي] ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
