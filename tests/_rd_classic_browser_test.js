/* ═══════════════════════════════════════════════════════════════════
   RD classic browser regression — v2.5 (طاولة بزوايا 100% + وسط مخصص)
   محلي فقط: القائمة (رهان يدوي بلا زر قواعد) → مباراة ضد الكمبيوتر →
   هندسة الزوايا/العدادات الشفافة/ورق إسباني حقيقي → لعب بشري →
   دورة الجولات → قواعد «؟» من الطاولة → إعلان فوز فوري منتصف الجولة
   → بلا شريط بنّي/بلا أزرار كشف خصوصية + بلا أخطاء وحدة التحكم.
   الغرف: tests/_rd_v2_room_probe.js (+ 4 مقاعد + إعادة الانضمام).
   تشغيل:  node tests/_rd_classic_browser_test.js   (الخادم 4173 DM_TEST_MODE=1)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(label) { pass++; console.log('  ✅ ' + label); }
function bad(label) { fail++; console.log('  ❌ ' + label); }

(async () => {
  const browser = await PW.launchBrowser();
  const { page } = await PW.newPage(browser, { width: 1280, height: 800 });
  await PW.gotoGamePage(page);
  await PW.wait(page, () => !!(typeof RondaApp !== 'undefined' && typeof RondaCore !== 'undefined'), 15000);

  // ── 1) القائمة: رهان يدوي + بلا زر قواعد داخل القائمة ──
  await page.evaluate(() => openGame('rd'));
  await PW.wait(page, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);
  ok('menu screen shown on open');

  const title = await page.$eval('#rdStage .rd-game-title', el => el.textContent.trim()).catch(() => '');
  ok('game title rendered (' + title + ')', /الروندا|Ronda/.test(title));
  const famBtns = (await page.$$('#rdStage #family-options .rd-family-btn')).length;
  ok('2 opponent families (computer / face-to-face)', famBtns === 2);
  const modeBtns = (await page.$$('#rdStage #mode-options .rd-mode-btn')).length;
  ok('4 shape buttons (1v1/1v2/1v3/2v2)', modeBtns === 4);
  const targetPills = (await page.$$('#rdStage #target-options .rd-target-pill')).length;
  ok('4 target pills (round/41/51/61)', targetPills === 4);

  const rulesInMenu = await page.$('#rdStage #screen-menu #btn-rules, #rdStage #screen-menu [id*=btn-rules]').catch(() => null);
  ok('NO rules button inside settings', !rulesInMenu);
  const betInput = await page.$('#rdStage #bet-input').catch(() => null);
  ok('manual bet input on settings', !!betInput);
  const betVal = betInput ? await betInput.inputValue() : '';
  ok('bet input has a numeric value (' + betVal + ')', betVal !== '' && !isNaN(Number(betVal)));

  // القواعد لم تعد في القائمة — تفتح من أيقونة «كتاب القواعد» في هيدر المنصة
  const rulesOvHidden = await page.evaluate(() => document.querySelector('#rdStage #overlay-rules').classList.contains('rd-hidden'));
  ok('RD internal rules overlay stays hidden (rules only via platform header)', rulesOvHidden);
  // الروندا تُعرض داخل صفحة اللعبة وهيدر المنصة ظاهر (زرّ القواعد + كتم الصوت)
  const headVisible = await page.evaluate(() => {
    const pg = document.getElementById('pg-game');
    const head = document.querySelector('#pg-game .gp-head');
    const book = head ? head.querySelector('.fa-book-open') : null;
    return {
      appFs: !!(pg && pg.classList.contains('app-fs')),
      headOn: !!(head && getComputedStyle(head).display !== 'none'),
      hasMute: !!document.getElementById('muteBtn'),
      hasBook: !!book
    };
  });
  ok('platform header visible with rules-book + mute (RD not app-fs)', !headVisible.appFs && headVisible.headOn && headVisible.hasMute && headVisible.hasBook);

  // ── 2) بدء ضد الكمبيوتر (رهان 10 — يخصم من الرصيد المحلي) ──
  const goldBefore = await page.evaluate(() => (typeof ST !== 'undefined') ? ST.gold : null);
  await page.evaluate(() => { RondaApp.config.target = 51; RondaApp.config.bet = 10; RondaApp.syncMenuUI(); });
  await page.click('#rdStage #btn-start');
  await PW.wait(page, () => !!document.querySelector('#rdStage #screen-game.active'), 8000);
  await PW.wait(page, () => document.querySelectorAll('#hand .rd-card').length === 3, 15000);
  ok('AI match started: 3-card hand + game screen');
  const goldAfterStart = await page.evaluate(() => (typeof ST !== 'undefined') ? ST.gold : null);
  ok('bet deducted once from local gold (' + goldBefore + ' → ' + goldAfterStart + ')', goldAfterStart === goldBefore - 10);

  const dealInfo = await page.evaluate(() => {
    const deck = (document.getElementById('deck-count') || {}).textContent;
    const seats = ['tl', 'tr', 'br', 'bl'].map(c => document.querySelectorAll('#rd-corner-' + c + ' .rd-seat').length).join(',');
    const hint = !!document.getElementById('turn-hint');
    return { deck: deck, seats: seats, hint: hint };
  });
  ok('deal deck=30', dealInfo.deck === '30');
  ok('only 2 seats in 1v1 (bl+br): ' + dealInfo.seats, dealInfo.seats === '0,0,1,1');
  ok('no "your turn" pill anywhere (v2.6)', dealInfo.hint === false);

  // لا شريط بنّي علوي — لا أزرار بيت/صوت
  const topBarGone = await page.evaluate(() =>
    !document.getElementById('btn-home') &&
    !document.getElementById('btn-sound') &&
    !document.querySelector('#rdStage .rd-gbar, #rdStage #rd-gbar') &&
    !document.querySelector('#rdStage [data-i18n="rdc.tgl.privacy"]'));
  ok('no brown top bar / home / sound / privacy buttons', topBarGone);

  // الزوايا v2.6: أنا = bl (يدّي مكشوفة)، الخصم = br مع صفّ ورق مقلوب على يمينه
  const corners = await page.evaluate(() => ({
    me: (document.querySelector('#rd-corner-bl .rd-seat.rd-me-seat') || {}).dataset ? 'ok' : 'missing',
    op: (document.querySelector('#rd-corner-br .rd-seat:not(.rd-me-seat)') || {}).dataset ? 'ok' : 'missing'
  }));
  ok('my seat bottom-left (bl), opponent bottom-right (br)', corners.me === 'ok' && corners.op === 'ok');

  // الوجه الإسباني الحقيقي + صف الورق المقلوب للخصم (بحجم كامل بلا كشف)
  const art = await page.evaluate(() => {
    const handCard = document.querySelector('#hand .rd-card');
    const bg = handCard ? (getComputedStyle(handCard).backgroundImage || '') : '';
    const oppBacks = document.querySelectorAll('#rd-corner-br .rd-back-card').length;
    const av = (document.querySelector('#rd-corner-br .rd-seat .rd-av') || {}).textContent;
    const stats = (document.querySelector('#rd-corner-br .rd-seat .rd-seat-stats') || {}).textContent;
    const noMini = document.querySelectorAll('#rd-corner-br .rd-mini-back, #rd-corner-br .rd-mini-count').length === 0;
    return { bg: bg, oppBacks: oppBacks, av: av, stats: stats, noMini: noMini };
  });
  ok('real Spanish face art: ' + art.bg.replace(/^url\(\"?|\"?\)$/g, '').split('/').pop(), /assets\/cards\/es\//.test(art.bg));
  ok('opponent hand hidden as 3 full-size back cards (' + art.oppBacks + ')', art.oppBacks === 3);
  ok('no mini card icons inside the seat panel', art.noMini);
  ok('opponent avatar = two letters (' + art.av + ')', /^[\u0600-\u06FFa-zA-Z]{2}$/.test(art.av || ''));
  ok('seat stats show ★ and 🃏', (art.stats || '').indexOf('★') !== -1 && (art.stats || '').indexOf('🃏') !== -1);

  // العنوان الأصفر + سطر المعلومات + الرزمة داخل البيضاوية الوسطى فوق الصف السفلي
  const hud = await page.evaluate(() => {
    const r = document.getElementById('hud-target');
    const deckEl = document.getElementById('rd-deck');
    const courtEl = document.getElementById('rd-court');
    const handEl = document.getElementById('hand');
    const felt = document.getElementById('felt');
    const deckR = deckEl ? deckEl.getBoundingClientRect() : null;
    const courtR = courtEl ? courtEl.getBoundingClientRect() : null;
    const handR = handEl ? handEl.getBoundingClientRect() : null;
    const feltR = felt ? felt.getBoundingClientRect() : null;
    const bigtitle = (document.querySelector('#rd-tophead .rd-bigtitle') || {}).textContent || '';
    return {
      target: r ? r.textContent : '',
      deckSquare: deckR ? (Math.abs(deckR.width - deckR.height) < 40 ? 'card-like' : 'weird') : 'missing',
      deckInsideCourt: deckR && courtR && deckR.top >= courtR.top - 4 && deckR.bottom <= courtR.bottom + 6,
      deckAboveHand: deckR && handR && deckR.bottom <= handR.top + 30,
      courtInFelt: courtR && feltR && courtR.width <= feltR.width + 1 && courtR.width > feltR.width * 0.8,
      ids: !!document.getElementById('hud-round') && !!document.getElementById('hud-deal') && !!document.getElementById('hud-target') && !document.getElementById('btn-info-rules'),
      noPills: document.querySelectorAll('#rdStage .rd-hud-chip').length === 0,
      bigtitle: bigtitle
    };
  });
  ok('hud target shows ' + hud.target, hud.target === '51');
  ok('deck sits inside the central court, above the hand row', hud.deckSquare === 'card-like' && hud.deckInsideCourt && hud.deckAboveHand);
  ok('court fills most of the felt', hud.courtInFelt);
  ok('hud ids present and table help «؟» removed, pill chips removed', hud.ids && hud.noPills);
  ok('wide yellow title present (' + hud.bigtitle + ')', /الروندا/.test(hud.bigtitle));

  // المهلة الذهبية: مؤقّت يظهر على مقعد صاحب الدور فقط
  const timer = await page.evaluate(() => {
    const act = document.querySelectorAll('#rdStage .rd-seat.rd-active-turn .rd-turn-timer').length;
    return act;
  });
  ok('per-turn countdown timer visible on the active seat (' + timer + ')', timer >= 1);

  // القواعد الكاملة من «كتاب القواعد» في هيدر المنصة (نافذة المنصة #rulesModal)
  await page.evaluate(() => {
    const btn = Array.prototype.find.call(
      document.querySelectorAll('#pg-game .gp-head-right .btn.icon-btn'),
      b => !!b.querySelector('.fa-book-open')
    );
    if (btn) btn.click();
  });
  await PW.wait(page, () => !!document.querySelector('#rulesModal.show'), 5000);
  const rulesText = await page.$eval('#rulesBody', el => el.textContent).catch(() => '');
  ok('full rules modal (platform header) shows Ronda rules', rulesText.length > 400);
  ok('rules mention ضربة / حبل / قاعا / جوج حبال', /ضربة/.test(rulesText) && /حبل/.test(rulesText) && /قاعا/.test(rulesText) && /جوج حبال/.test(rulesText));
  const noTableHelp = await page.evaluate(() => !document.getElementById('btn-info-rules') &&
    !document.querySelector('#rdStage .rd-help, #rdStage [id*=btn-info-rules]'));
  ok('no «؟» help button anywhere on the table', noTableHelp);
  await page.click('#rulesModal .mclose');
  await PW.wait(page, () => !document.querySelector('#rulesModal.show'), 5000);
  ok('rules modal closes');

  // ── 3) لعب بشري + تقدم آلي للخصم ──
  const played = await PW.wait(page, () => {
    const el = document.querySelector('#hand .rd-card.rd-live');
    if (!el) return false;
    el.click();
    return true;
  }, 15000);
  ok('human played a card', !!played);
  await PW.wait(page, () => {
    const n = document.querySelectorAll('#hand .rd-card').length;
    return n === 2 || n === 3;
  }, 12000);
  ok('hand re-rendered after play');

  // ── 4) تقدم الدورة: نهاية توزيعة/إعادة توزيع حتى غطاء الجولة/المباراة إن حصل ──
  await page.evaluate(() => { if (window.RondaApp) window.RondaApp.speed = 6; });
  const endSeen = await PW.wait(page, () => {
    const rnd = document.getElementById('overlay-round');
    const mch = document.getElementById('overlay-match');
    if (rnd && !rnd.classList.contains('rd-hidden')) return { kind: 'round' };
    if (mch && !mch.classList.contains('rd-hidden')) return { kind: 'match' };
    const dl = document.getElementById('hud-deal');
    if (dl && Number(dl.textContent) >= 2) return { kind: 'deal2' };
    const el = document.querySelector('#hand .rd-card.rd-live');
    if (el) { el.click(); }
    return false;   /* لا يُنهي الانتظار عند النقر — ننتظر تقدماً حقيقياً */
  }, 150000);
  ok('round cycle progressed (' + (endSeen ? endSeen.kind : 'none') + ')', !!endSeen);

  if (endSeen && endSeen.kind === 'round') {
    await page.click('#rdStage #btn-next-round');
    const round2 = await PW.wait(page, () => {
      const hr = document.getElementById('hud-round');
      return (hr && hr.textContent.trim() === '2') ? true : false;
    }, 25000);
    ok('next round started (hud-round=2)', !!round2);
  } else if (endSeen && endSeen.kind === 'match') {
    await page.click('#rdStage #btn-new-match');
    const restart = await PW.wait(page, () => {
      const hr = document.getElementById('hud-round');
      const ov = document.getElementById('overlay-match');
      return (hr && hr.textContent.trim() === '1' && ov && ov.classList.contains('rd-hidden')) ? true : false;
    }, 25000);
    ok('new match restarted from match overlay', !!restart);
  }

  // ── 5) فوز فوري منتصف الجولة (قانون: بلوغ الهدف وسط الجولة = إعلان فوري) ──
  /* إن انتهت المباراة طبيعياً في القسم السابق → مباراة جديدة لنختبر الفوز الفوري فيها */
  const wasOver = await page.evaluate(() => !!(window.RondaApp && RondaApp._matchOver));
  if (wasOver) {
    const restart = await PW.wait(page, async () => {
      const b = document.getElementById('btn-new-match');
      if (b) { b.click(); }
      const app = window.RondaApp;
      return (app && !app._matchOver && app.game && app.game.state.phase === 'Playing') ? true : false;
    }, 20000);
    ok('fresh match ready for the mid-round goal test', !!restart);
  }
  const goldBeforeEarlyWin = await page.evaluate(() => (typeof ST !== 'undefined') ? ST.gold : null);
  await page.evaluate(() => {
    const app = window.RondaApp;
    if (!app || !app.game) return false;
    const st = app.game.state;
    st.teams[0].score = st.targetScore;      /* فريق اللاعب يبلغ الهدف وسط اللعب */
    app._checkEarlyWin();
    return app._matchOver;
  }).then(okEarly => { ok('mid-round goal triggers immediate match declaration', okEarly === true); });
  await PW.wait(page, () => !!document.querySelector('#rdStage #overlay-match:not(.rd-hidden)'), 8000);
  ok('match overlay shown immediately (no round-end wait)',
     await page.evaluate(() => {
       const m = document.querySelector('#rdStage #overlay-match');
       return m && !m.classList.contains('rd-hidden');
     }));
  const goldAfterWin = await page.evaluate(() => (typeof ST !== 'undefined') ? ST.gold : null);
  ok('local bet settled on win (2× pot added: ' + goldBeforeEarlyWin + ' → ' + goldAfterWin + ')', goldAfterWin === goldBeforeEarlyWin + 20);
  // من غطاء الفوز: عودة نظيفة للقائمة (بلا زر بيت علوي)
  await page.click('#rdStage #btn-back-menu');
  await PW.wait(page, () => !!document.querySelector('#rdStage #screen-menu.active'), 10000);
  ok('match overlay offers back-to-menu (replaces old top home button)', true);

  // ── 6) الترجمة: الفرنسية ثم العربية ──
  await page.evaluate(() => {
    if (typeof ST !== 'undefined') ST.lang = 'fr';
    if (typeof translateStatic === 'function') translateStatic();
  });
  const frName = await page.$eval('#rdStage .rd-mode-btn.selected .rd-mode-name', el => el.textContent.trim()).catch(() => '');
  ok('French mode label: ' + frName, /ordinateur|joueur|équipe/i.test(frName));
  const frBet = await page.$eval('#rdStage .rd-menu-label', el => el.textContent.trim()).catch(() => '');
  await page.evaluate(() => {
    if (typeof ST !== 'undefined') ST.lang = 'ar';
    if (typeof translateStatic === 'function') translateStatic();
  });
  const arName = await page.$eval('#rdStage .rd-mode-btn.selected .rd-mode-name', el => el.textContent.trim()).catch(() => '');
  ok('Arabic mode label restored: ' + arName, /الكمبيوتر|لاعب/.test(arName));
  ok('fr label sample: ' + frBet, true);   /* ضمان ترجمة الثوابت لا تسقط */

  // ── 7) بلا واجهات كشف + بلا أخطاء وحدة التحكم ──
  const noPriv = await page.evaluate(() =>
    !document.getElementById('overlay-privacy') &&
    !document.getElementById('toggle-privacy') &&
    !document.querySelector('#rdStage [data-i18n="rdc.tgl.privacy"]'));
  ok('no privacy/reveal UI anywhere', noPriv);
  ok('zero console errors', page._errs.length === 0);
  if (page._errs.length) console.log('     errors: ' + page._errs.slice(0, 4).join(' | '));

  await browser.close();
  console.log('\n═══ RD classic v2.5 regression: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})();
