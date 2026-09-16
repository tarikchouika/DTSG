/* scratch debug of round cycle (not part of suite) */
const PW = require('./_rd_pw.js');
(async () => {
  const browser = await PW.launchBrowser();
  const { page } = await PW.newPage(browser, { width: 1280, height: 800 });
  await PW.gotoGamePage(page);
  await page.evaluate(() => openGame('rd'));
  await PW.wait(page, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);
  await page.evaluate(() => { RondaApp.config.target = 51; RondaApp.config.bet = 0; RondaApp.syncMenuUI(); });
  await page.click('#rdStage #btn-start');
  await PW.wait(page, () => document.querySelectorAll('#hand .rd-card').length === 3, 15000);
  await page.evaluate(() => { RondaApp.speed = 4; });
  let last = '';
  for (let i = 0; i < 150; i++) {
    const info = await page.evaluate(() => {
      const st = RondaApp.game ? RondaApp.game.state : null;
      const rnd = document.getElementById('overlay-round');
      const mch = document.getElementById('overlay-match');
      return {
        phase: st ? st.phase : '-', deck: st ? st.deck.length : -1, deal: st ? st.dealNumber : -1,
        cur: st ? st.currentSeat : -1, live: !!document.querySelector('#hand .rd-card.rd-live'),
        rnd: rnd ? !rnd.classList.contains('rd-hidden') : null,
        mch: mch ? !mch.classList.contains('rd-hidden') : null,
        matchOver: RondaApp._matchOver, busy: RondaApp.busy, paused: (RondaApp._pipeSeq || 0)
      };
    });
    const s = JSON.stringify(info);
    if (s !== last) { last = s; console.log(new Date().toISOString().slice(14, 19), info.phase, 'deck', info.deck, 'deal', info.deal, 'cur', info.cur, 'live', info.live, 'rndOv', info.rnd, 'mchOv', info.mch, 'over', info.matchOver, 'busy', info.busy); }
    const live = await page.$('#hand .rd-card.rd-live').catch(() => null);
    if (live) { await live.click(); await page.waitForTimeout(120); }
    else await page.waitForTimeout(200);
    if (info.rnd || info.mch) break;
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
