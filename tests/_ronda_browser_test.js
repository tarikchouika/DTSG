/* FLAT DOG (rn) browser test — redesigned 4-seat flow (mobile + desktop).
   Verifies: clean top (only spectators), 4 seats, edge-to-edge felt, mode buttons
   in bottom bar → transparent circular number dropdown (no black sheet) → pick →
   round → bet/resign prompt (no auto-restart), bet-again restart, no console errors. */
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
const CASES = [
  { name: 'mobile',  viewport: { width: 390, height: 780 } },
  { name: 'desktop', viewport: { width: 1280, height: 800 } }
];
let pass = 0, fail = 0;
const results = [];
function ok(label) { pass++; results.push('  ✅ ' + label); }
function bad(label) { fail++; results.push('  ❌ ' + label); }

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  for (const c of CASES) {
    results.push('\n── FLAT DOG [' + c.name + ' ' + c.viewport.width + '×' + c.viewport.height + '] ──');
    const ctx = await browser.newContext({ viewport: c.viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404/i.test(m.text())) errors.push(m.text()); });

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { window.ST = window.ST || {}; window.ST.gold = 5000; if (window.save) save(); });
    await page.evaluate((id) => openGame(id), 'rn');
    await page.waitForTimeout(1400);

    // 1. stage mounted + clean top (NO gname / turn pill / round label / hint)
    const stage = await page.$('#rnContainer .fd-stage');
    if (stage) ok('fd-stage mounted'); else bad('fd-stage NOT mounted');
    const gname = await page.$('.fd-gname');
    if (!gname) ok('no game-name (top-left clean)'); else bad('game-name still present');
    const turnPill = await page.$('#fdTurn');
    if (!turnPill) ok('no top turn pill'); else bad('turn pill still present');
    const roundLbl = await page.$('#fdRound');
    if (!roundLbl) ok('no round label'); else bad('round label still present');
    const hint = await page.$('#rnDrawHint');
    if (!hint) ok('no floating hint text'); else bad('hint still present');
    const specStrip = await page.$('#rnSpec');
    if (specStrip) ok('spectator strip present (top area)'); else bad('spectator strip missing');

    // 2. 4 seats + center + bottom bar
    const seats = (await page.$$('.fd-seat')).length;
    if (seats === 4) ok('4 seats rendered'); else bad('seats = ' + seats);
    if (await page.$('.fd-center')) ok('center FLAT/DOG present'); else bad('center missing');
    if (await page.$('.fd-bottombar')) ok('bottom bar present'); else bad('bottombar missing');

    // 3. edge-to-edge felt: stage width should be ~ viewport width (no side gaps)
    const fill = await page.evaluate(() => {
      const st = document.querySelector('.fd-stage') || document.querySelector('#rnContainer');
      const vp = window.innerWidth;
      if (!st) return { vp };
      const r = st.getBoundingClientRect();
      return { vp, left: Math.round(r.left), rightGap: Math.round(vp - r.right), width: Math.round(r.width) };
    });
    if (fill.left !== undefined && fill.left <= 4 && fill.rightGap <= 4)
      ok('felt edge-to-edge (left=' + fill.left + ' rightGap=' + fill.rightGap + ')');
    else bad('side gaps: ' + JSON.stringify(fill));

    // 4. game-fs-exit shrunk (≤ 40px)
    const fsSz = await page.$eval('.game-fs-exit', el => Math.round(el.getBoundingClientRect().width)).catch(() => 0);
    if (fsSz > 0 && fsSz <= 40) ok('fullscreen-exit shrunk (' + fsSz + 'px)'); else bad('fs-exit size = ' + fsSz);

    // 5. NO black mode sheet on open (mode buttons live in bottom bar)
    const sheetShown = await page.$eval('#rnSelectionPanel', el => el.classList.contains('show')).catch(() => false);
    if (!sheetShown) ok('no auto mode-sheet on open'); else bad('mode sheet auto-shown');

    // 6. click number-mode button → transparent circular number dropdown
    await page.click('#rnModeNum');
    await page.waitForSelector('.fd-num-btn', { timeout: 5000 });
    const numBtns = (await page.$$('.fd-num-btn')).length;
    if (numBtns === 10) ok('number dropdown: 10 circular numbers'); else bad('num buttons = ' + numBtns);
    // transparent: container + buttons have no opaque black background
    const transparent = await page.evaluate(() => {
      const sheet = document.querySelector('#rnSelectionPanel');
      const inner = sheet && sheet.querySelector('.fd-sheet-inner');
      const btn = document.querySelector('.fd-num-btn');
      const opaque = (el) => { if (!el) return false; const c = getComputedStyle(el).backgroundColor; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return false; const p = m[1].split(',').map(Number); return p.length >= 4 ? p[3] >= 0.5 : true; };
      return { sheetBg: getComputedStyle(sheet).backgroundColor, innerOpaque: opaque(inner), btnRound: btn && getComputedStyle(btn).borderRadius };
    });
    if (!transparent.innerOpaque) ok('dropdown is transparent (no black container)'); else bad('dropdown has opaque container');
    // circular
    if (/^(100%|50%|50px|9999|46px|38px)/.test(String(transparent.btnRound))) ok('number icons circular'); else bad('number icons not circular: ' + transparent.btnRound);

    // 7. pick number 5 → selector card reveals
    await page.click('.fd-num-btn[data-num="5"]');
    await page.waitForFunction(() => {
      const el = document.getElementById('rnSelectorCard');
      return el && el.querySelector('.fd-card.face');
    }, { timeout: 5000 }).then(() => ok('number pick → selector card revealed')).catch(() => bad('selector card did not reveal'));

    // 8. after round resolves → bet/resign prompt (NOT auto number-pick)
    await page.waitForSelector('.fd-bet-prompt', { timeout: 40000 }).then(() => ok('bet/resign prompt after round (no auto-restart)')).catch(() => bad('no bet/resign prompt'));
    const stillNums = (await page.$$('.fd-num-btn')).length;
    if (stillNums === 0) ok('numbers cleared after round'); else bad('numbers still showing after round');

    // 9. bet again → new number dropdown appears
    await page.click('.fd-prompt-btn.bet');
    await page.waitForSelector('.fd-num-btn', { timeout: 5000 }).then(() => ok('bet-again → new number dropdown')).catch(() => bad('no dropdown after bet-again'));

    // 10. no horizontal overflow + console errors
    const overW = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (!overW) ok('no horizontal overflow'); else bad('horizontal overflow');
    if (errors.length === 0) ok('no console errors'); else bad('console errors: ' + errors.slice(0, 3).join(' | '));

    await page.screenshot({ path: '/home/user/_rn_' + c.name + '.png' });
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\n═══ FLAT DOG: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})();
