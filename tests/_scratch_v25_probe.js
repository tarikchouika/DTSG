/* scratch: v2.5 quick DOM inspection (not part of suite) */
const { chromium } = require('playwright');
const BASE = 'http://localhost:4173/';
(async () => {
  const execPath = await (await import('@sparticuz/chromium')).default.executablePath();
  const browser = await chromium.launch({ executablePath: execPath, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404|net::ERR/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 60; i++) { if (await page.evaluate(() => typeof RondaApp !== 'undefined')) break; await page.waitForTimeout(200); }
  await page.waitForTimeout(500);
  await page.evaluate(() => openGame('rd'));
  await page.waitForSelector('#rdStage #screen-menu.active', { timeout: 8000 });
  console.log('— menu ids —');
  console.log(await page.evaluate(() =>
    ['#btn-rules', '#btn-start', '#bet-input', '#mode-options', '#target-options', '#overlay-rules']
      .map(s => s + ' : ' + (!!document.querySelector('#rdStage ' + s))).join('\n')));
  console.log('bet value:', await page.$eval('#rdStage #bet-input', el => el.value).catch(e => 'ERR ' + e.message));
  // start AI match
  await page.evaluate(() => { try { RondaApp.config.bet = 10; RondaApp.syncMenuUI && RondaApp.syncMenuUI(); } catch (e) { console.log('cfg err', e.message); } });
  await page.click('#rdStage #btn-start');
  await page.waitForSelector('#rdStage #screen-game.active', { timeout: 8000 });
  await page.waitForFunction(() => document.querySelectorAll('#rdStage #hand .rd-card').length === 3, null, { timeout: 15000 });
  console.log('— game dom —');
  console.log(await page.evaluate(() => {
    const out = {};
    out.corners = ['tl','tr','br','bl'].map(c => {
      const el = document.getElementById('rd-corner-' + c);
      return c + ':' + (el ? el.querySelectorAll('.rd-seat').length : 'MISSING');
    }).join(' ');
    out.hand = document.querySelectorAll('#hand .rd-card').length;
    out.table = document.querySelectorAll('#table-cards .rd-card').length;
    out.deckCount = (document.querySelector('#deck-count') || {}).textContent;
    out.deckW = (() => { const r = (document.querySelector('#rd-deck') || {}).getBoundingClientRect; return r ? r.call(document.querySelector('#rd-deck')).width : 0; })();
    out.courtW = (() => { const r = (document.querySelector('#rd-court') || {}).getBoundingClientRect; return r ? r.call(document.querySelector('#rd-court')).width : 0; })();
    out.hud = ['#hud-round','#hud-deal','#hud-target','#btn-info-rules'].map(s => s + ':' + (!!document.querySelector(s))).join(' ');
    out.bar = ['#btn-home','#btn-sound','.rd-gbar'].map(s => s + ':' + (!!document.querySelector(s))).join(' ');
    out.timer = document.querySelectorAll('.rd-turn-timer').length;
    out.avatars = [...document.querySelectorAll('.rd-av')].map(a => a.textContent.trim()).join(',');
    out.seatStats = [...document.querySelectorAll('.rd-seat-stats')].map(a => a.textContent.trim().replace(/\s+/g, ' ')).join(' | ');
    out.hint = (document.querySelector('#turn-hint') || {}).textContent;
    const bg = getComputedStyle(document.querySelector('#hand .rd-card')).backgroundImage || '';
    out.faceArt = bg;
    out.watermark = (document.querySelector('.rd-court-mark') || {}).textContent;
    return out;
  }));
  await page.screenshot({ path: '_shots/_scratch_v25_game.png' });
  console.log('— console/page errors —');
  console.log(errors.slice(0, 10).join('\n') || '(none)');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
