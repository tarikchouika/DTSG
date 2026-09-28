/* ═══════════════════════════════════════════════════════════════════
   RD v2.6 — محلي: إعدادات جديدة (عائلة/شكل/جولة/مؤقت) + FFA + جولة واحدة
   يفحص:
   1) القائمة: عائلتان، 4 أشكال، 4 أهداف (جولة/41/51/61)، مؤقت 30–300 ث
      (افتراضي 60) مع أزرار ± والحواف، وصف كل شكل حسب العائلة.
   2) ساخن وجهًا لوجه 1v2 (3 مقاعد كلٌّ لنفسه): بدء + تبديل عارض + لعب.
   3) آلة 1v3 (4 مقاعد FFA): بدء + تقدم الآلة تلقائيًا بلا أخطاء.
   4) «الرهان على جولة» ساخن 1v1: تنتهي المباراة بعد جولة الـ40 ورقة
      كاملة فورًا (لا نافذة نتائج) وهدف الشاشة «جولة».
   التشغيل:  node tests/_rd_v26_local_probe.js   (الخادم 4173 DM_TEST_MODE=1)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + '  ← CONDITION FAILED'); }
}
function bad(label) { fail++; console.log('  ❌ ' + label); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* لقطة تشخيص عند تعذّر لعب الدور (لماذا لا توجد بطاقة حيّة؟) */
const diag = () => {
  const app = window.RondaApp;
  if (!app || !app.game) return 'no game';
  const st = app.game.state;
  return {
    phase: st.phase, busy: app.busy, viewer: app.currentViewerId,
    seat: st.currentSeat, players: st.players.length,
    hands: st.players.map(p => p.hand.length),
    matchOver: app._matchOver, paused: !!(window.Pipeline && Pipeline.paused)
  };
};

(async () => {
  const browser = await PW.launchBrowser();
  const { page } = await PW.newPage(browser, { width: 1280, height: 800 });
  await PW.gotoGamePage(page);
  await page.evaluate(() => openGame('rd'));
  await PW.wait(page, () => !!document.querySelector('#rdStage #screen-menu.active'), 12000);
  ok('menu shown', true);

  // ── 1) بنية الإعدادات الجديدة ──
  const fams = (await page.$$('#rdStage #family-options .rd-family-btn')).length;
  ok('2 opponent families (computer / same-phone)', fams === 2);
  const shapes = (await page.$$('#rdStage #mode-options .rd-mode-btn')).length;
  ok('4 shape buttons', shapes === 4);
  const targets = (await page.$$('#rdStage #target-options .rd-target-pill')).length;
  ok('4 target pills', targets === 4);
  const defTarget = await page.evaluate(() => {
    const s = document.querySelector('#rdStage #target-options .rd-target-pill.selected');
    return s ? s.getAttribute('data-target') : null;
  });
  ok('default target = 51', defTarget === '51');
  const timerVal = await page.$eval('#rdStage #timer-val', el => el.textContent.trim());
  ok('timer default 60 s', timerVal === '60');

  // أزرار المؤقت ± والحواف 30/300
  await page.click('#rdStage #timer-inc');
  const t1 = await page.$eval('#rdStage #timer-val', el => el.textContent.trim());
  ok('timer +10 → 70', t1 === '70');
  await page.evaluate(() => { window.RondaApp.config.timer = 300; window.RondaApp.syncMenuUI(); });
  await page.click('#rdStage #timer-inc');
  const tMax = await page.$eval('#rdStage #timer-val', el => el.textContent.trim());
  ok('timer clamps at 300', tMax === '300');
  await page.evaluate(() => { window.RondaApp.config.timer = 30; window.RondaApp.syncMenuUI(); });
  await page.click('#rdStage #timer-dec');
  const tMin = await page.$eval('#rdStage #timer-val', el => el.textContent.trim());
  ok('timer clamps at 30', tMin === '30');
  await page.evaluate(() => { window.RondaApp.config.timer = 60; window.RondaApp.syncMenuUI(); });

  // وصف الأشكال يتغير حسب العائلة ولا يظهر مفاتيح خام
  const raw = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('#rdStage #mode-options .rd-mode-desc').forEach(el => {
      const t = el.textContent.trim();
      if (!t || t.indexOf('rdc.shape') === 0) bad.push(t);
    });
    return bad;
  });
  ok('AI shape descriptions populated (no raw keys)', raw.length === 0);
  const descAI_1v2 = await page.evaluate(() =>
    document.querySelector('#rdStage #mode-options [data-shape="1v2"] .rd-mode-desc').textContent.trim());
  await page.click('#rdStage #fam-pvp');
  const descPVP_1v2 = await page.evaluate(() =>
    document.querySelector('#rdStage #mode-options [data-shape="1v2"] .rd-mode-desc').textContent.trim());
  ok('shape description switches with family (ai=' + descAI_1v2 + ' → pvp=' + descPVP_1v2 + ')', descAI_1v2 !== descPVP_1v2);
  await page.click('#rdStage #fam-ai');

  // ── 2) ساخن وجهًا لوجه 1v2 → 3 مقاعد FFA ──
  await page.evaluate(() => {
    const App = window.RondaApp;
    App.config.family = 'pvp'; App.config.shape = '1v2';
    App.config.target = 51; App.config.bet = 0; App.config.timer = 60;
    App.syncMenuUI();
    document.getElementById('bet-input').value = 0;
  });
  await page.click('#rdStage #btn-start');
  await PW.wait(page, () => !!document.querySelector('#rdStage #screen-game.active'), 8000);
  await PW.wait(page, () => document.querySelectorAll('#hand .rd-card').length === 3, 15000);
  const hotSeat = await page.evaluate(() => {
    const st = window.RondaApp.game.state;
    return { mode: st.mode, players: st.players.length, deck: st.deck.length };
  });
  ok('hot-seat 1v2 = FFA 3 players (deck 27): ' + JSON.stringify(hotSeat),
     hotSeat.mode === 'FreeForAll' && hotSeat.players === 3 && hotSeat.deck === 27);
  const corners3 = await page.evaluate(() => {
    let n = 0, meBl = false;
    ['br', 'tr', 'tl', 'bl'].forEach(function (c) {
      const seats = document.querySelectorAll('#rd-corner-' + c + ' .rd-seat');
      n += seats.length;
      if (c === 'bl' && document.querySelector('#rd-corner-bl .rd-seat.rd-me-seat')) meBl = true;
    });
    return { seats: n, meBl: meBl };
  });
  ok('3 seat icons rendered, viewer bottom-left: ' + JSON.stringify(corners3), corners3.seats === 3 && corners3.meBl);

  // لعب 4 أدوار ساخنة: العارض ينتقل بين المقاعد البشرية
  const viewersSeen = new Set();
  let playsOk = 0;
  for (let i = 0; i < 4; i++) {
    const clicked = await PW.wait(page, () => {
      const el = document.querySelector('#hand .rd-card.rd-live');
      if (!el) return false;
      el.click();
      return true;
    }, 12000);
    if (!clicked) {
      const d = await page.evaluate(diag);
      bad('hot-seat play #' + (i + 1) + ' not possible — diag: ' + JSON.stringify(d));
      break;
    }
    const vid = await page.evaluate(() => window.RondaApp.currentViewerId);
    viewersSeen.add(vid);
    playsOk++;
    await sleep(700);
  }
  ok('played ' + playsOk + ' hot-seat turns', playsOk >= 3);
  ok('viewer moved between human seats (' + [...viewersSeen].join(',') + ')', viewersSeen.size >= 2);
  const hotProg = await page.evaluate(() => {
    const st = window.RondaApp.game.state;
    return st.playedCardsInCurrentDeal;
  });
  ok('deal progressed (' + hotProg + ' cards played)', hotProg >= 4);

  // ── 3) آلة 1v3 → 4 مقاعد FFA ──
  await page.evaluate(() => window.RondaApp.backToMenu());
  await PW.wait(page, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);
  await page.evaluate(() => {
    const App = window.RondaApp;
    App.config.family = 'ai'; App.config.shape = '1v3';
    App.config.target = 51; App.config.bet = 0; App.config.timer = 60;
    App.syncMenuUI();
  });
  await page.click('#rdStage #btn-start');
  await PW.wait(page, () => !!document.querySelector('#rdStage #screen-game.active'), 8000);
  await PW.wait(page, () => document.querySelectorAll('#hand .rd-card').length === 3, 15000);
  const aiFFA = await page.evaluate(() => {
    const app = window.RondaApp;
    const st = app.game.state;
    return { mode: st.mode, players: st.players.length, deck: st.deck.length, ai: app.aiPlayers.length };
  });
  ok('AI 1v3 = FFA 4 players, 3 AI seats: ' + JSON.stringify(aiFFA),
     aiFFA.mode === 'FreeForAll' && aiFFA.players === 4 && aiFFA.deck === 24 && aiFFA.ai === 3);
  // نلعب دورنا (المقعد 0) ونراقب تقدم الآلات من تلقاء نفسها
  const clicked0 = await PW.wait(page, () => {
    const el = document.querySelector('#hand .rd-card.rd-live');
    if (!el) return false;
    el.click();
    return true;
  }, 12000);
  ok('my seat played in 4-seat FFA', !!clicked0);
  const aiAdvanced = await PW.wait(page, () => {
    const app = window.RondaApp;
    if (!app || !app.game) return false;
    const st = app.game.state;
    const ourHand = st.players[0].hand.length;
    const aiHands = st.players.slice(1).map(p => p.hand.length);
    return (ourHand + aiHands.reduce((a, b) => a + b, 0) < 12) || st.playedCardsInCurrentDeal >= 3;
  }, 20000);
  ok('AI opponents played on their own (FFA)', !!aiAdvanced);
  const errsLocal = await page.evaluate(() => {
    const app = window.RondaApp;
    return { over: !!(app && app._matchOver) };
  });
  ok('FFA AI running without crash (match not over yet)', errsLocal.over === false);

  // ── 4) «الرهان على جولة» ساخن 1v1: مباراة من توزيعة واحدة كاملة (كل الـ40) ──
  await page.evaluate(() => window.RondaApp.backToMenu());
  await PW.wait(page, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);
  await page.evaluate(() => {
    const App = window.RondaApp;
    App.config.family = 'pvp'; App.config.shape = '1v1';
    App.config.target = 'round'; App.config.bet = 0; App.config.timer = 60;
    App.syncMenuUI();
  });
  const lbl = await page.evaluate(() => (window.RD_T ? RD_T.msg('rdc.target.round') : 'جولة'));
  await page.click('#rdStage #btn-start');
  await PW.wait(page, () => !!document.querySelector('#rdStage #screen-game.active'), 8000);
  await PW.wait(page, () => document.querySelectorAll('#hand .rd-card').length === 3, 15000);
  const hudT = await page.$eval('#rdStage #hud-target', el => el.textContent.trim());
  ok('HUD target shows «' + hudT + '» for one-round match', hudT === lbl);
  const oneRoundDone = await PW.wait(page, () => {
    const el = document.querySelector('#hand .rd-card.rd-live');
    if (el) el.click();
    const ovR = document.getElementById('overlay-round');
    const over = document.getElementById('overlay-match');
    if (over && !over.classList.contains('rd-hidden')) return { kind: 'match' };
    if (ovR && !ovR.classList.contains('rd-hidden')) return { kind: 'round-stuck' };
    return false;
  }, 150000);
  if (!oneRoundDone) {
    const d = await page.evaluate(diag);
    bad('one-round match did not finish — diag: ' + JSON.stringify(d));
  }
  ok('one-round match finished after the single deal (' + (oneRoundDone ? oneRoundDone.kind : 'none') + ')',
     oneRoundDone && oneRoundDone.kind === 'match');
  const oneRoundState = await page.evaluate(() => {
    const app = window.RondaApp;
    const st = app.game.state;
    return {
      roundShown: !document.getElementById('overlay-round').classList.contains('rd-hidden'),
      matchShown: !document.getElementById('overlay-match').classList.contains('rd-hidden'),
      round: st.roundNumber, over: app._matchOver,
      logTarget: (document.getElementById('hud-target') || {}).textContent || ''
    };
  });
  ok('winner modal shown (round-results skipped): ' + JSON.stringify(oneRoundState),
     oneRoundState.matchShown && !oneRoundState.roundShown && oneRoundState.over);

  // ── 5) لا أخطاء وحدة تحكم طوال المحلي ──
  ok('zero console errors', page._errs.length === 0);
  if (page._errs.length) console.log('     errors: ' + page._errs.slice(0, 4).join(' | '));

  await browser.close();
  console.log('\n═══ RD v2.6 local probe: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('PROBE CRASH:', e); process.exit(2); });
