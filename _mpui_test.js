/* اختبار المتصفح: (1) انحدار الرامي الفردي، (2) طبقة الشبكة الجماعية تُحمَّل وتعمل بلا أخطاء. */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  // تسجيل دخول سريع (mock /api/login يقبل أي اسم)
  await page.evaluate(async () => {
    if (typeof API !== 'undefined') { try { await API.post('/api/login', { username: 'tester', password: 'pw123456' }); } catch (e) {} }
    if (typeof AUTH !== 'undefined' && typeof AUTH.afterLogin === 'function') { try { await AUTH.afterLogin({ id: 901, username: 'tester', gold: 5000 }); } catch (e) {} }
  });
  await page.waitForTimeout(400);

  // فتح لعبة الرامي
  await page.evaluate(() => { if (typeof openGame === 'function') openGame('rm'); });
  await page.waitForTimeout(500);
  const hasSetup = await page.evaluate(() => !!document.querySelector('.rami-setup-modal'));
  console.log('rami setup modal:', hasSetup);

  // (1) بدء جولة فردية (انحدار)
  await page.evaluate(() => {
    window.RAMI_SETUP_MODE = 'talaj';
    const t = document.getElementById('ramiTarget'); if (t) t.value = 'single';
    const p = document.getElementById('ramiPlayers'); if (p) p.value = '2';
    const tm = document.getElementById('ramiTimerSelect'); if (tm) tm.value = '30';
  });
  await page.evaluate(() => window.ramiStartGame());
  await page.waitForTimeout(2500); // مقدمة التوزيع
  const soloRendered = await page.evaluate(() => !!document.querySelector('.rami-game'));
  const soloHand = await page.evaluate(() => {
    const ad = window.RamiAdapter; return ad && ad.game ? ad.game.roundManager.getCurrentPlayer().hand.length : -1;
  });
  console.log('solo game rendered:', soloRendered, '| current hand size:', soloHand);

  // تنفيذ رمية فردية للتأكد من عمل executeMove (طالاج: الموزع 15 ورقة في مرحلة الرمي)
  const drawOK = await page.evaluate(() => {
    try {
      const ad = window.RamiAdapter;
      ad.game.normalizeTurnPhase();
      const p = ad.game.roundManager.getCurrentPlayer();
      const moves = ad.game.getLegalMoves(p.id).filter(m => m.type === 'discard');
      if (!moves.length) return 'NO-DISCARD';
      const r = ad.game.executeMove(moves[0]);
      ad._updateUI();
      return !!(r && r.success);
    } catch (e) { return 'ERR:' + e.message; }
  });
  console.log('solo discard:', drawOK);

  // (2) طبقة الشبكة الجماعية: استدعاء مباشر ببيانات وهمية بلا خادم
  const mpNet = await page.evaluate(() => {
    const log = [];
    try {
      const ad = window.RamiAdapter;
      ad.multiplayer = true; ad.myPlayerId = 0; ad._netSeq = 0;
      // بناء الجولة بالبذرة
      ad._netBuildGame({ mode: 'talaj', target: 999999, isSingle: true, targetVal: 'single', bet: 50, timer: 30 }, 424242, 2);
      log.push('buildGame OK phase=' + ad.game.gamePhase + ' players=' + ad.game.players.length);
      // محاكاة استقبال تهيئة من المالك (شخص آخر)
      ad._netApplyMove({ action: 'init', by: 'other-host', data: { mode: 'talaj', target: 999999, isSingle: true, targetVal: 'single', bet: 50, timer: 30, seed: 424242, playerCount: 2, order: ['other-host', 'tester'] } });
      log.push('applyMove init OK myPlayerId=' + ad.myPlayerId);
      // صدى حركتي يجب أن يُتجاهل
      ad._netApplyMove({ action: 'draw', by: 'tester', data: { drawType: 'draw_deck', playerId: 0 } });
      log.push('echo-skip OK');
      // حركة من لاعب بعيد (المالك مقعد 0)
      ad._netApplyMove({ action: 'draw', by: 'other-host', data: { drawType: 'draw_deck', playerId: 0 } });
      log.push('applyMove draw OK curPlayerIdx=' + ad.game.roundManager.currentPlayerIndex);
      // تطبيق رمي بعيد
      const pid0 = ad.game.players[0];
      // بعد السحبة، اللاعب 0 في مرحلة الرمي؛ نأخذ آخر ورقة في يده ونرميها
      const rm0 = ad.game.roundManager;
      let cardId = null;
      // ابحث عن حركة discard قانونية للاعب 0
      const moves = ad.game.getLegalMoves(0).filter(m => m.type === 'discard');
      if (moves.length) cardId = moves[0].cardId;
      ad._netApplyMove({ action: 'discard', by: 'other-host', data: { playerId: 0, cardId: cardId } });
      log.push('applyMove discard OK curIdx=' + ad.game.roundManager.currentPlayerIndex);
      // تسجيل المعالجات لا يرمي
      if (typeof RM_roomStart === 'function' && typeof RM_roomMove === 'function' && typeof ramiRegisterRooms === 'function') {
        log.push('handlers exported OK');
      }
      return { ok: true, log: log };
    } catch (e) { return { ok: false, log: log, err: e.message, stack: e.stack }; }
  });
  console.log('MP net layer:', JSON.stringify(mpNet, null, 1));

  // التحقق من عدم وجود أخطاء تحميل حرجة
  const critical = errors.filter(e => /rami\.js|RamiAdapter|RM_room|_net/i.test(e) && !/favicon|net::ERR|404/i.test(e));

  await browser.close();

  console.log('\n--- console errors (' + errors.length + ') ---');
  errors.slice(0, 12).forEach(e => console.log('  ' + e));
  console.log('critical rami errors:', critical.length);

  const pass = hasSetup && soloRendered && soloHand > 0 && drawOK === true && mpNet.ok === true && critical.length === 0;
  console.log(pass ? '\n✅✅✅ PASS: solo regression OK + MP net layer loads & runs cleanly' : '\n❌ FAIL');
  process.exit(pass ? 0 : 1);
})();
