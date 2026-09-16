/* ═══ [BGDO] تدقيق عميق: لعب مباريات حقيقية كاملة عبر المتصفح
   الطاولة: مباراة len=1 ضد AI من الافتتاح حتى matchEnd عبر واجهات التطبيق
   الحقيقية (rollClick/doMove/passTurn) — لا استدعاءات محرك مباشرة.
   الضومنة: جولات ضد AI حتى matchEnd — أدوار اللاعب بلا حركة يديرها التطبيق.
   التذاكر: نرقّع recordRound بعدّاد قبل المباراة (المتصفح فقط) للتحقق من
   التسجيل. الغرض: اللعبتان قابلتان للعب فعلياً لا مجرد إقلاع واجهة.
   تشغيل: node tests/_bg_do_gameplay_test.js (الخادم 4173 DM_TEST_MODE=1) ═══ */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(l, cond) { pass++; console.log((cond === undefined || cond) ? '  ✅ ' + l : '  ❌ ' + l); if (cond !== undefined && !cond) { pass--; fail++; } }
function bad(l) { fail++; console.log('  ❌ ' + l); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await PW.launchBrowser();

  /* ═══ 1) الطاولة: مباراة len=1 ضد AI حتى matchEnd ═══ */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 1280, height: 800 });
    await PW.gotoGamePage(page);
    /* عدّاد التذاكر: نلفّ recordRound العام (تعلن عنها main.js على window) */
    await page.evaluate(() => {
      window.__ticketSpy = [];
      const orig = window.recordRound;
      window.recordRound = function (won, payout, txt, bet, gid) {
        window.__ticketSpy.push({ won: !!won, payout: payout || 0, txt: String(txt || ''), bet: bet, gid: gid });
        if (orig) { try { orig.apply(this, arguments); } catch (e) {} }
      };
    });
    await page.evaluate(() => openGame('bg'));
    await PW.wait(page, () => !!document.querySelector('#bwStage #bwMenu'), 8000);

    /* كالمستخدم: زر الطول 1 + المستوى 1 (متوسط — أساس توقع المضاعف ×2) ثم ابدأ */
    await page.click('#bwLenSeg .bw-segbtn[data-len="1"]');
    await page.click('#bwLevelSeg .bw-segbtn[data-level="1"]');
    const gold0 = await page.evaluate(() => ST.gold);
    await page.click('#bwStartBtn');
    const inPlay = await PW.wait(page, () => getComputedStyle(document.getElementById('bwPlay')).display !== 'none', 8000);
    ok('bg: play screen entered', !!inPlay);
    const gold1 = await page.evaluate(() => ST.gold);
    ok('bg: bet deducted at match start (' + gold0 + ' → ' + gold1 + ')', gold1 === gold0 - (gold0 - gold1) && gold1 < gold0);

    /* لعب كامل عبر واجهات التطبيق الحقيقية حتى matchEnd */
    const done = await PW.wait(page, () => {
      const app = window.BackgammonApp;
      const s = app.game && app.game.state;
      if (!s) return false;
      if (s.phase === 'matchEnd') return true;
      if (app.busy) return false;
      if (s.phase === 'roll' && s.turn === 0 && !s.rolled) { app.rollClick(); return false; }
      if (s.phase === 'move' && s.turn === 0) {
        const legal = window.BgCore.legalMoves(s, 0);
        if (legal.length) { app.doMove(legal[0]); } else { app.passTurn(); }
      }
      return false;
    }, 90000);
    ok('bg: match reached matchEnd (full match played)', !!done);
    if (done) {
      await sleep(1500);   /* أثر طبقات النهاية (650ms) قبل القياس */
      const fin = await page.evaluate(() => {
        const s = window.BackgammonApp.game.state;
        const over = document.getElementById('bwOverLayer');
        return { phase: s.phase, winner: s.winner, score: s.matchScore.join(':'), type: s.gameType,
                 overlay: over && !over.hidden, gold: ST.gold, tickets: window.__ticketSpy.slice() };
      });
      ok('bg: matchEnd state score=' + fin.score + ' type=' + fin.type, fin.phase === 'matchEnd');
      ok('bg: game-over overlay shown', fin.overlay);
      const mult = [1.5, 2, 3][1] || 2;   /* المستوى الافتراضي 1 (متوسط) */
      const betAmt = gold0 - gold1;
      const winExp = gold1 + Math.round(betAmt * mult);
      const settledOk = fin.winner === 0 ? fin.gold === winExp : fin.gold === gold1;
      ok('bg: wallet settled correctly (' + gold0 + ' → ' + fin.gold + ', winner=' + fin.winner + (fin.winner === 0 ? ' ×' + mult : '') + ')', settledOk);
      ok('bg: ticket recorded via recordRound (' + fin.tickets.length + ')', fin.tickets.length === 1);
      if (fin.tickets.length === 1) {
        const t = fin.tickets[0];
        const ticketOk = t.gid === 'bg' && t.bet === betAmt &&
          (fin.winner === 0 ? (t.won && t.payout === Math.round(betAmt * mult)) : (!t.won && t.payout === 0));
        ok('bg: ticket fields correct (gid=' + t.gid + ' bet=' + t.bet + ' won=' + t.won + ' payout=' + t.payout + ')', ticketOk);
      }
    }
    ok('bg: zero console errors', page._errs.length === 0);
    await page.screenshot({ path: '/tmp/bgdo-bg-matchend.png' });
    await ctx.close();
  }

  /* ═══ 2) الضومنة: جولات ضد AI حتى نهاية المباراة ═══ */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 1280, height: 800 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => {
      window.__ticketSpy = [];
      const orig = window.recordRound;
      window.recordRound = function (won, payout, txt, bet, gid) {
        window.__ticketSpy.push({ won: !!won, payout: payout || 0, txt: String(txt || ''), bet: bet, gid: gid });
        if (orig) { try { orig.apply(this, arguments); } catch (e) {} }
      };
    });
    await page.evaluate(() => openGame('do'));
    await PW.wait(page, () => !!document.querySelector('#dmStage #dmMenu'), 8000);
    /* أقصر مباراة: هدف 50 — والمستوى 1 (متوسط — أساس توقع المضاعف ×2) */
    await page.click('#dmTargetSeg .dm-segbtn[data-target="50"]');
    await page.click('#dmLevelSeg .dm-segbtn[data-level="1"]');
    const gold0 = await page.evaluate(() => ST.gold);
    await page.click('#dmStartBtn');
    const inPlay = await PW.wait(page, () => getComputedStyle(document.getElementById('dmPlay')).display !== 'none', 8000);
    ok('do: play screen entered', !!inPlay);
    const gold1 = await page.evaluate(() => ST.gold);
    ok('do: bet deducted at match start (' + gold0 + ' → ' + gold1 + ')', gold1 < gold0);

    /* التطبيق يقود راحة اللاعب (سحب/تمرير/اختيار طرف) — نلعب أول قطعة صالحة
       عند كل دور لنا عبر pickHand (نفس مسار نقر المستخدم)، وكل نهاية جولة
       ننقر «الجولة التالية» (طبقة الجولة تتوقف على قرار اللاعب بالتصميم) حتى matchEnd */
    const done = await PW.wait(page, () => {
      const app = window.DominoApp;
      const s = app && app.game && app.game.state;
      if (!s) return false;
      if (s.phase === 'matchEnd') return true;
      /* طبقة نهاية الجولة أولاً — busy يبقى true بعدها بالتصميم حتى قرار اللاعب،
         وزر «الجولة التالية» لا يتحقق من busy أصلاً */
      const roundLayer = document.getElementById('dmRoundLayer');
      if (roundLayer && !roundLayer.hidden) {
        const btn = document.getElementById('dmNextRoundBtn');
        if (btn) { btn.click(); return false; }
      }
      if (app.busy) return false;
      try {
        if (s.phase === 'play' && s.turn === 0 && !s.result) {
          /* مثل المستخدم: نقر قطعة → إن تطلب طرفاً نقر الطرف (pickEnd)؛
             لا حركة والبنك غير فارغ → نقر البنك (tryDraw)؛ بنك فارغ → تمرير (tryPass) */
          if (app.selTile) {
            const ends = window.DominoCore.legalEnds(s, app.selTile);
            if (ends.length) app.pickEnd(ends[0]);
          } else {
            const moves = window.DominoCore.legalMoves(s, 0);
            if (moves.length) { app.pickHand(moves[0].tile.id); }
            else if (s.boneyard.length && s.cfg.drawUntilPlayable) { app.tryDraw(); }
            else { app.tryPass(); }
          }
        }
      } catch (e) { /* راحة (سحب إلزامي…) يقودها التطبيق */ }
      return false;
    }, 240000);   /* جولات كثيفة السحب بطيئة عبر مؤقتات الواجهة (400-620ms للحركة) */
    ok('do: match reached matchEnd', !!done);
    if (done) {
      await sleep(1200);
      const fin = await page.evaluate(() => {
        const s = window.DominoApp.game.state;
        const over = document.getElementById('dmMatchLayer');
        return { phase: s.phase, scores: s.scores.join(':'), matchWinner: s.matchWinner, overlay: over && !over.hidden,
                 gold: ST.gold, tickets: window.__ticketSpy.slice() };
      });
      ok('do: matchEnd state scores=' + fin.scores, fin.phase === 'matchEnd');
      ok('do: match-over overlay shown', fin.overlay);
      const betAmt = gold0 - gold1;
      const winner = fin.matchWinner;   /* المفصل الرسمي — قد يتجاوز الطرفان الهدف معاً */
      const mult = [1.5, 2, 3][1] || 2;
      const winExp = gold1 + Math.round(betAmt * mult);
      ok('do: wallet settled (' + gold0 + ' → ' + fin.gold + ', winner=' + winner + ')', fin.gold === (winner === 0 ? winExp : gold1));
      ok('do: ticket recorded (' + fin.tickets.length + ')', fin.tickets.length === 1);
      if (fin.tickets.length === 1) {
        const t = fin.tickets[0];
        ok('do: ticket fields (gid=' + t.gid + ' won=' + t.won + ' payout=' + t.payout + ')',
          t.gid === 'do' && ((winner === 0) === t.won));
      }
    }
    ok('do: zero console errors', page._errs.length === 0);
    await page.screenshot({ path: '/tmp/bgdo-do-matchend.png' });
    await ctx.close();
  }

  await browser.close();
  console.log('\n═══ [BGDO] gameplay deep test: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
