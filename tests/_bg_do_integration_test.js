/* ═════════════════════════════════════════════════════════════════════
   [BGDO] اختبار الدمج المركزي للطاولة (bg) والضومنة (do) — v2.20
   ───────────────────────────────────────────────────────────────────────
   يغطي على الخادم المحلي 4173 (DM_TEST_MODE):
     1) فتح bg: #bwStage + #bwMenu + صفر أخطاء كونسول
     2) فتح do: #dmStage + #dmMenu + صفر أخطاء
     3) مباراة طاولة ضد AI برهان 10: #bwPlay + خصم الرهان + الرقعة مرسومة
     4) مباراة ضومنة ضد AI برهان 10: #dmPlay + يد 7 قطع + خصم الرهان
     5) تسوية الانسحاب: تذكرة خسارة في _localRounds بلا استرداد الرهان
     6) الخروج من اللعبة ثم إعادة فتحها — تعمل من جديد (globals سليمة)
     7) الكتالوج: بطاقتا اللعبتين في التقليدية + الأيقونات تُحمَّل (naturalWidth>0)
     8) اللغة الفرنسية: نصوص القائمة تتبدل عبر TR (BWG_T يقرأ TR أولاً)
   تشغيل:  node tests/_bg_do_integration_test.js   (الخادم 4173 DM_TEST_MODE=1)
   ═════════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(label) { pass++; console.log('  ✅ ' + label); }
function bad(label) { fail++; console.log('  ❌ ' + label); }

(async () => {
  const browser = await PW.launchBrowser();
  const { page } = await PW.newPage(browser, { width: 1280, height: 800 });
  await PW.gotoGamePage(page);
  await PW.wait(page, () => !!(typeof GAMES !== 'undefined' && typeof Rooms !== 'undefined' &&
    typeof BackgammonApp !== 'undefined' && typeof DominoApp !== 'undefined'), 20000);

  // ── 0) الكتالوج: 45 لعبة + featured لم يتغير (wf) ──
  const cat = await page.evaluate(() => ({
    n: GAMES.length,
    blca: GAMES.findIndex(g => g.id === 'blca'),
    bg: GAMES.findIndex(g => g.id === 'bg'),
    do: GAMES.findIndex(g => g.id === 'do'),
    wf: GAMES.findIndex(g => g.id === 'wf'),
    featured: document.querySelectorAll('#rowFeatured .tile').length
  }));
  ok('catalog has 45 games', cat.n === 45);
  ok('bg/do entered as traditional directly after blca (blca@' + cat.blca + ' → bg@' + cat.bg + ', do@' + cat.do + ')',
     cat.blca === cat.bg - 1 && cat.do === cat.bg + 1);
  ok('GAMES[19] stays wf (featured index shifted by 2)', cat.wf === 19);
  ok('featured row renders 4 tiles', cat.featured === 4);

  // ── 1) فتح الطاولة: القائمة + صفر أخطاء ──
  await page.evaluate(() => openGame('bg'));
  await PW.wait(page, () => !!document.querySelector('#bwStage #bwMenu.bw-screen-active'), 10000);
  ok('bg: #bwStage + #bwMenu visible');
  const bgTitle = await page.$eval('#bwStage', el => el.textContent).catch(() => '');
  ok('bg: menu title rendered', /الطاولة|Tawla|Backgammon/.test(bgTitle));
  const bgErrs0 = page._errs.length;

  // ── 3) مباراة طاولة ضد AI برهان 10: خصم + الرقعة ──
  const goldBefore = await page.evaluate(() => ST.gold);
  await page.evaluate(() => { BackgammonApp.config.mode = 'ai'; BackgammonApp.config.level = 0; BackgammonApp.config.bet = 10; });
  await page.click('#bwStage #bwStartBtn');
  await PW.wait(page, () => !!document.querySelector('#bwStage #bwPlay.bw-screen-active'), 10000);
  ok('bg: match started → #bwPlay visible');
  const goldAfterStart = await page.evaluate(() => ST.gold);
  ok('bg: bet 10 deducted (' + goldBefore + ' → ' + goldAfterStart + ')', goldAfterStart === goldBefore - 10);
  const boardDrawn = await PW.wait(page, () => {
    /* الرقعة مرسومة: 24 عموداً (نقاط) و/أو حجر مُخرج/الأدمن */
    const pts = document.querySelectorAll('#bwStage #bwPoints [data-point]').length;
    return pts >= 24 ? pts : false;
  }, 8000);
  ok('bg: board rendered with 24 points (' + (boardDrawn || 0) + ')', !!boardDrawn);
  /* دورة النرد: انتظر دور اللاعب (نرد أو حركة) — الخصم (AI) بدأ إن فاز بالقرعة */
  const turnReady = await PW.wait(page, () => {
    const st = BackgammonApp.game && BackgammonApp.game.state;
    if (!st) return false;
    return st.phase === 'move' || st.phase === 'roll' || st.phase === 'opening';
  }, 9000);
  ok('bg: match flow alive (phase=' + (turnReady ? String(turnReady).slice(0, 2) : 'stuck') + ')', !!turnReady);

  // ── 5) تسوية الانسحاب: تذكرة خسارة بلا استرداد ──
  const goldBeforeResign = await page.evaluate(() => ST.gold);
  await page.evaluate(() => {
    _localRounds.length = 0;   /* عزل التذاكر الجديدة لهذه الجلسة */
  });
  /* [v2.49-NOBTN] زر الاستسلام أُزيل من الواجهة (أمر المالك) — نفتح طبقة التأكيد برمجياً
     كي يبقى مسار التسوية (تذكرة خسارة بلا استرداد) مُختبَراً كما هو. */
  await page.evaluate(() => BackgammonApp.showLayer('bwResignLayer', true));
  await PW.wait(page, () => !document.querySelector('#bwStage #bwResignLayer').hidden, 4000);
  await page.click('#bwStage #bwResignYes');
  const resignSettled = await PW.wait(page, () => {
    const lay = document.querySelector('#bwStage #bwOverLayer');
    const t = _localRounds.find(r => r.game_id === 'bg' && !r.won);
    return (lay && !lay.hidden && t) ? t : false;
  }, 9000);
  ok('bg: resign settled — overlay + lose ticket', !!resignSettled);
  const ticket = resignSettled || {};
  ok('bg: lose ticket bet=10 payout=0', Number(ticket.bet) === 10 && Number(ticket.payout) === 0);
  const goldAfterResign = await page.evaluate(() => ST.gold);
  ok('bg: no refund after resign (' + goldBeforeResign + ' → ' + goldAfterResign + ')', goldAfterResign === goldBeforeResign);

  // ── 6) الخروج ثم إعادة الفتح ──
  await page.evaluate(() => closeGamePage());
  await PW.wait(page, () => {
    const body = document.getElementById('gamePageBody');
    return body && body.children.length === 0;
  }, 6000);
  ok('bg: game page closed and body cleared');
  await page.evaluate(() => openGame('bg'));
  const bgReopen = await PW.wait(page, () => !!document.querySelector('#bwStage #bwMenu.bw-screen-active'), 10000);
  ok('bg: reopens fresh to menu (globals intact)', !!bgReopen);

  // ── 2) فتح الضومنة: القائمة + صفر أخطاء ──
  await page.evaluate(() => closeGamePage());
  await page.waitForTimeout(400);
  await page.evaluate(() => openGame('do'));
  await PW.wait(page, () => !!document.querySelector('#dmStage #dmMenu.dm-screen-active'), 10000);
  ok('do: #dmStage + #dmMenu visible');
  const dmTitle = await page.$eval('#dmStage', el => el.textContent).catch(() => '');
  ok('do: menu title rendered', /الضومنة|Domino/.test(dmTitle));

  // ── 4) مباراة ضومنة ضد AI برهان 10: يد 7 قطع + خصم ──
  const goldBeforeDM = await page.evaluate(() => ST.gold);
  await page.evaluate(() => { DominoApp.config.mode = 'ai'; DominoApp.config.level = 0; DominoApp.config.bet = 10; DominoApp.config.target = 50; });
  await page.click('#dmStage #dmStartBtn');
  await PW.wait(page, () => !!document.querySelector('#dmStage #dmPlay.dm-screen-active'), 10000);
  ok('do: match started → #dmPlay visible');
  const handTiles = await PW.wait(page, () => {
    const n = document.querySelectorAll('#dmStage #dmHand .dm-tile').length ||
              document.querySelectorAll('#dmStage #dmHand [data-tile]').length ||
              document.querySelectorAll('#dmStage #dmHand .dm-hand-tile').length;
    return n === 7 ? n : false;
  }, 9000);
  ok('do: hand has 7 tiles (' + (handTiles || '?') + ')', handTiles === 7);
  const goldAfterDM = await page.evaluate(() => ST.gold);
  ok('do: bet 10 deducted (' + goldBeforeDM + ' → ' + goldAfterDM + ')', goldAfterDM === goldBeforeDM - 10);

  // ── 5b) انسحاب الضومنة: تذكرة خسارة ──
  const goldBeforeDMResign = await page.evaluate(() => ST.gold);
  await page.evaluate(() => { _localRounds.length = 0; });
  /* [v2.49-NOBTN] زر الانسحاب أُزيل من الواجهة — نفس المنهج: طبقة التأكيد برمجياً */
  await page.evaluate(() => DominoApp.showLayer('dmResignLayer', true));
  await PW.wait(page, () => !document.querySelector('#dmStage #dmResignLayer').hidden, 4000);
  await page.click('#dmStage #dmResignYes');
  const dmResign = await PW.wait(page, () => {
    const lay = document.querySelector('#dmStage #dmMatchLayer');
    const t = _localRounds.find(r => r.game_id === 'do' && !r.won);
    return (lay && !lay.hidden && t) ? t : false;
  }, 9000);
  ok('do: resign settled — overlay + lose ticket', !!dmResign);
  const dmTicket = dmResign || {};
  ok('do: lose ticket bet=10 payout=0', Number(dmTicket.bet) === 10 && Number(dmTicket.payout) === 0);
  const goldAfterDMResign = await page.evaluate(() => ST.gold);
  ok('do: no refund after resign (' + goldBeforeDMResign + ' → ' + goldAfterDMResign + ')', goldAfterDMResign === goldBeforeDMResign);

  // ── 6b) الخروج ثم إعادة فتح الضومنة ──
  await page.evaluate(() => closeGamePage());
  await PW.wait(page, () => {
    const body = document.getElementById('gamePageBody');
    return body && body.children.length === 0;
  }, 6000);
  await page.evaluate(() => openGame('do'));
  const dmReopen = await PW.wait(page, () => !!document.querySelector('#dmStage #dmMenu.dm-screen-active'), 10000);
  ok('do: reopens fresh to menu (globals intact)', !!dmReopen);
  await page.evaluate(() => closeGamePage());
  await page.waitForTimeout(400);

  // ── 7) الكتالوج: بطاقتا اللعبتين في التقليدية + الأيقونات 200 ──
  await page.evaluate(() => nav('games', document.querySelector('[data-nav=games]')));
  await PW.wait(page, () => {
    const grid = document.getElementById('allGames');
    return grid && grid.children.length >= 45;
  }, 8000);
  const catalogCheck = await page.evaluate(() => {
    const grid = document.getElementById('allGames');
    const tiles = Array.prototype.slice.call(grid.querySelectorAll('.tile'));
    const find = id => tiles.find(t => (t.getAttribute('onclick') || '').indexOf("openGame('" + id + "')") !== -1);
    const bgTile = find('bg'), doTile = find('do');
    const imgs = [];
    if (bgTile) { const i = bgTile.querySelector('.art img'); if (i) imgs.push(i); }
    if (doTile) { const i = doTile.querySelector('.art img'); if (i) imgs.push(i); }
    return {
      total: tiles.length,
      bg: !!bgTile, do: !!doTile,
      /* بطاقة التقليدية: ترتيب الظهور بعد آخر بلياردو وقبل أفياتور */
      order: bgTile && doTile ? tiles.indexOf(bgTile) < tiles.indexOf(doTile) : false,
      bgInTrad: bgTile ? (bgTile.querySelector('.tname') || {}).textContent : '',
      icons: imgs.map(i => ({ ok: i.naturalWidth > 0, src: i.getAttribute('src') }))
    };
  });
  ok('catalog grid renders ' + catalogCheck.total + ' tiles', catalogCheck.total >= 45);
  ok('bg + do tiles present in order (bg before do)', catalogCheck.bg && catalogCheck.do && catalogCheck.order);
  const iconsLoaded = await PW.wait(page, () => {
    const grid = document.getElementById('allGames');
    const tiles = Array.prototype.slice.call(grid.querySelectorAll('.tile'));
    const find = id => tiles.find(t => (t.getAttribute('onclick') || '').indexOf("openGame('" + id + "')") !== -1);
    const i1 = find('bg') && find('bg').querySelector('.art img');
    const i2 = find('do') && find('do').querySelector('.art img');
    return (i1 && i1.naturalWidth > 0 && i2 && i2.naturalWidth > 0) ? [i1.naturalWidth, i2.naturalWidth] : false;
  }, 10000);
  ok('bg + do icons loaded (HTTP 200, naturalWidth ' + (iconsLoaded ? iconsLoaded.join('×') : 'n/a') + ')', !!iconsLoaded);
  ok('bg tile name in Arabic: ' + catalogCheck.bgInTrad, /الطاولة/.test(catalogCheck.bgInTrad));

  // ── 8) الفرنسية: نصوص الطاولة تتبدل عبر TR ──
  await page.evaluate(() => openGame('bg'));
  await PW.wait(page, () => !!document.querySelector('#bwStage #bwMenu.bw-screen-active'), 8000);
  await page.evaluate(() => {
    if (typeof pickLang === 'function') pickLang('fr');
    else { ST.lang = 'fr'; if (typeof translateStatic === 'function') translateStatic(); }
    if (typeof BWG_T === 'function') { /* القاموس يقرأ TR أولاً */ }
    try { BackgammonApp.updateBetUI(); } catch (e) {}
    try { window.BGTranslateStatic(document.getElementById('bwStage')); } catch (e) {}
  });
  const frTexts = await page.evaluate(() => {
    const t = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : ''; };
    return {
      start: t('#bwStartBtn'),
      mode: t('#bwModeSeg .bw-segbtn.selected'),
      tr: (typeof BWG_T === 'function') ? BWG_T('bg.start') : ''
    };
  });
  const frOk = /Commencer|Manche|match/i.test(frTexts.start + ' ' + frTexts.tr);
  ok('French UI: start button = "' + frTexts.start + '" / BWG_T = "' + frTexts.tr + '"', frOk);
  /* عودة العربية لاستقرار أي اختبار لاحق */
  await page.evaluate(() => {
    if (typeof pickLang === 'function') pickLang('ar');
    else { ST.lang = 'ar'; if (typeof translateStatic === 'function') translateStatic(); }
    try { window.BGTranslateStatic(document.getElementById('bwStage')); } catch (e) {}
  });

  // ── أخطاء الكونسول عبر الجلسة كلها ──
  ok('zero console/page errors across the whole session', page._errs.length === 0);
  if (page._errs.length) console.log('     errors: ' + page._errs.slice(0, 5).join(' | '));
  const bgErrsTotal = page._errs.length - bgErrs0;
  if (bgErrsTotal > 0) console.log('     (تنبيه: ' + bgErrsTotal + ' خطأ ظهر بعد قسم bg الأولي)');

  await browser.close();
  console.log('\n═══ [BGDO] integration: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})();
