/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — لقطات v2.72 البصرية: رامي (بلا فاصل خشبي + خانات موحّدة) وبلوت فردي
   يحفظ PNG إلى download/v272-shots/ للمالك.
   تشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_v272_shots.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const OUT = '/home/z/my-project/download/v272-shots';
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await PW.launchBrowser();

  /* ── رامي: الطاولة بلا خشب + الخانات ── */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => { if (typeof openGame === 'function') openGame('rm'); });
    await PW.wait(page, () => !!document.querySelector('.rami-setup-modal'), 10000);
    await page.evaluate(() => {
      window.RAMI_SETUP_MODE = 'talaj';
      document.getElementById('ramiTarget').value = 'single';
      document.getElementById('ramiPlayers').value = '2';
    });
    await page.evaluate(() => window.ramiStartGame());
    await PW.wait(page, () => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      return !!(ad && ad.game && ad.game.gamePhase === 'PLAYING');
    }, 15000);
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, 'rami-table-portrait.png') });

    /* إفراغ مجموعة لنقل أوراقها (سيناريو المالك) ثم لقطة */
    await page.evaluate(() => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      let src = -1, dest = -1;
      for (let s = 4; s >= 1; s--) { if (ad.handSlots[s].length > 0) { src = s; break; } }
      for (let s = 0; s < src; s++) { if (ad.handSlots[s].length > 0) { dest = s; break; } }
      if (src > 0 && dest >= 0) {
        ad.handSlots[dest] = ad.handSlots[dest].concat(ad.handSlots[src]);
        ad.handSlots[src] = [];
        try { ad._updateHand(); } catch (e) {}
      }
    });
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'rami-slots-after-move.png') });
    await ctx.close();
  }

  /* ── بلوت: القائمة + 1ضد1 + 1ضد3 ── */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => { if (typeof openGame === 'function') openGame('bl'); });
    await PW.wait(page, () => !!document.getElementById('blMenu'), 10000);
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, 'baloot-menu-playtype.png') });

    await page.click('#blPlaySeg .bl-segbtn[data-play="1v1"]');
    await page.click('#blStartBtn');
    await PW.wait(page, () => {
      const s = window.BLGameNS && window.BLGameNS.state;
      return !!(s && s.players === 2 && (s.phase === 'ashur' || s.phase === 'naming' || s.phase === 'play'));
    }, 10000);
    /* تسمية سريعة للدخول في طور اللعب بلوحة كاملة */
    await page.evaluate(() => {
      const NS = window.BLGameNS;
      let g = 0;
      while ((NS.state.phase === 'ashur' || NS.state.phase === 'naming') && g++ < 8) NS.aiAct(NS.state.turn);
    });
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, 'baloot-1v1-solo.png') });
    await ctx.close();
  }
  {
    const { page, ctx } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => { if (typeof openGame === 'function') openGame('bl'); });
    await PW.wait(page, () => !!document.getElementById('blMenu'), 10000);
    await page.click('#blPlaySeg .bl-segbtn[data-play="1v3"]');
    await page.click('#blStartBtn');
    await PW.wait(page, () => {
      const s = window.BLGameNS && window.BLGameNS.state;
      return !!(s && s.players === 4);
    }, 10000);
    await page.evaluate(() => {
      const NS = window.BLGameNS;
      let g = 0;
      while ((NS.state.phase === 'ashur' || NS.state.phase === 'naming') && g++ < 8) NS.aiAct(NS.state.turn);
    });
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, 'baloot-1v3-solo.png') });
    await ctx.close();
  }

  await browser.close();
  console.log('OK — لقطات v272 في ' + OUT);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
