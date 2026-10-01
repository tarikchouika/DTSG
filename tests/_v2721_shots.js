/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — لقطات v2.72.1 البصرية: مقاس مجموعات أوراق الخصوم دالة في العدد
   الكلي وحده — قبل/بعد نقل الأوراق بين المجموعات (نفس T) مع خانات فارغة
   تنكمش حتى الصفر. تُحفظ PNG إلى download/v2721-shots/ للمالك.
   تشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_v2721_shots.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const OUT = '/home/z/my-project/download/v2721-shots';
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await PW.launchBrowser();

  /* ── رامي طالاج: طاولة بمتصفح هاتف ── */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => { if (typeof openGame === 'function') openGame('rm'); });
    await PW.wait(page, () => !!document.querySelector('.rami-setup-modal'), 10000);
    await page.evaluate(() => {
      window.RAMI_SETUP_MODE = 'talaj';
      document.getElementById('ramiTarget').value = 'single';
      document.getElementById('ramiPlayers').value = '3';
    });
    await page.evaluate(() => window.ramiStartGame());
    await PW.wait(page, () => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      return !!(ad && ad.game && ad.game.gamePhase === 'PLAYING');
    }, 15000);
    await sleep(1500);

    /* خصم بيد كاملة (14) + مجموعتان 6+3 — تصغير نشط */
    await page.evaluate(() => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      const bot = ad.game.players.find(p => p.id !== ad.myPlayerId);
      window.__src = bot.hand.concat([]);
      bot.melds = [
        { type: 'set', cards: window.__src.slice(0, 3).concat(window.__src.slice(5, 8)) },
        { type: 'set', cards: window.__src.slice(8, 11) }
      ];
      ad._updateUI();
    });
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, 'rami-opp-before-redistribute.png') });

    /* نفس الأوراق في مجموعة واحدة — الحجم لا يتغيّر والخانات تتقارب */
    await page.evaluate(() => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      const bot = ad.game.players.find(p => p.id !== ad.myPlayerId);
      const src = window.__src;
      bot.melds = [
        { type: 'set', cards: src.slice(0, 3).concat(src.slice(5, 8)).concat(src.slice(8, 11)) }
      ];
      ad._updateUI();
    });
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, 'rami-opp-after-redistribute.png') });

    /* نهاية جولة واقعية: يد قصيرة (3) + مجموعتان — خانات فارغة منكمشة للصفر */
    await page.evaluate(() => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      const bot = ad.game.players.find(p => p.id !== ad.myPlayerId);
      const src = window.__src;
      bot.hand = src.slice(0, 3);
      bot.melds = [
        { type: 'set', cards: src.slice(3, 6) },
        { type: 'set', cards: src.slice(6, 9) }
      ];
      ad._updateUI();
    });
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, 'rami-opp-endgame-empty-collapsed.png') });
    await ctx.close();
  }

  await browser.close();
  console.log('✔ لقطات v2.72.1 محفوظة في ' + OUT);
})().catch(e => { console.error('خطأ:', e); process.exit(1); });
