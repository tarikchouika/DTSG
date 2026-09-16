/* RD v2.5 probe — geometry, real Spanish cards, three viewports, screenshots
   (visual manual acceptance; not part of CI suite)
   Run (server :4173, DM_TEST_MODE=1):
     LD_LIBRARY_PATH="$PWD/node_modules/.chromium-143/al2023/lib" \
       node tests/_rd_v2_probe.js */
'use strict';
const { BASE } = require('./_rd_pw.js');
const PW = require('./_rd_pw.js');
const SHOT = '/home/user/digital-moroccan-casino/_shots/';
let pass = 0, fail = 0;
const results = [];
function ok(l) { pass++; results.push('  ✅ ' + l); }
function bad(l) { fail++; results.push('  ❌ ' + l); }

(async () => {
  const browser = await PW.launchBrowser();
  for (const c of [
    { name: 'desktop', viewport: { width: 1280, height: 800 } },
    { name: 'mobile', viewport: { width: 390, height: 780 } },
    { name: 'landscape', viewport: { width: 740, height: 360 } }
  ]) {
    results.push('\n── RD v2.5 [' + c.name + ' ' + c.viewport.width + 'x' + c.viewport.height + '] ──');
    const { page, ctx } = await PW.newPage(browser, c.viewport);
    await PW.gotoGamePage(page);
    await page.evaluate(() => openGame('rd'));
    await PW.wait(page, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);

    const hasBet = !!(await page.$('#rdStage #bet-input'));
    const noMenuRules = !(await page.$('#rdStage #screen-menu [id*=btn-rules]'));
    if (hasBet) ok('settings has manual bet input'); else bad('no bet input');
    if (noMenuRules) ok('settings has NO rules button'); else bad('rules button still in settings');

    await page.evaluate(() => { if (window.RondaApp) window.RondaApp.speed = 1; RondaApp.config.bet = 0; RondaApp.syncMenuUI(); });
    await page.click('#rdStage #btn-start');
    await PW.wait(page, () => !!document.querySelector('#rdStage #screen-game.active'), 8000);
    const dealt = await PW.wait(page, () => {
      const h = document.querySelectorAll('#hand .rd-card').length;
      const t = document.querySelectorAll('#table-cards .rd-card').length;
      const s = document.querySelectorAll('#rd-corner-bl .rd-seat').length + document.querySelectorAll('#rd-corner-br .rd-seat').length;
      return h === 3 && t >= 3 && s === 2;
    }, 20000);
    if (dealt) ok('deal rendered: 3 hand + table + 2 corner seats'); else bad('deal not rendered');

    const faceBg = await page.$eval('#hand .rd-card', el => getComputedStyle(el).backgroundImage || '').catch(() => '');
    if (/assets\/cards\/es\//.test(faceBg)) ok('real Spanish face art: ' + faceBg.replace(/^url\("?|\"?\)$/g, '').split('/').pop());
    else bad('face bg = ' + faceBg);

    const noBar = await page.evaluate(() =>
      !document.getElementById('btn-home') && !document.getElementById('btn-sound') &&
      !document.querySelector('#rdStage .rd-gbar'));
    if (noBar) ok('no top brown bar'); else bad('top bar still present');

    const seatInfo = await page.evaluate(() => {
      const seat = document.querySelector('#rd-corner-br .rd-seat');
      const row = document.querySelector('#rd-corner-br .rd-backrow');
      if (!seat) return null;
      return {
        backs: row ? row.querySelectorAll('.rd-back-card').length : 0,
        av: (seat.querySelector('.rd-av') || {}).textContent || '',
        stats: (seat.querySelector('.rd-seat-stats') || {}).textContent || ''
      };
    });
    if (seatInfo && seatInfo.backs >= 2 && seatInfo.backs <= 3) ok('opponent hidden as full-size backs (' + seatInfo.backs + ')');
    else bad('opp backs missing');
    if (seatInfo && /^[\u0600-\u06FFa-zA-Z]{2}$/.test(seatInfo.av)) ok('two-letter avatar (' + seatInfo.av + ')');
    else bad('avatar = ' + (seatInfo && seatInfo.av));
    if (seatInfo && seatInfo.stats.indexOf('★') !== -1 && seatInfo.stats.indexOf('🃏') !== -1)
      ok('seat stats ★/🃏 present'); else bad('seat stats = ' + (seatInfo && seatInfo.stats));
    const deckCount = await page.$eval('#deck-count', el => el.textContent.trim()).catch(() => '');
    if (Number(deckCount) >= 20) ok('deck count = ' + deckCount); else bad('deck count = ' + deckCount);
    const hasHint = await page.evaluate(() => !!document.getElementById('turn-hint'));
    if (!hasHint) ok('no "your turn" pill (v2.6)'); else bad('turn-hint pill still present');

    // هندسة: الطاولة 100%، لا فيضان، عدادات وسط لا تتداخل مع أوراق/زوايا
    const geo = await page.evaluate(() => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
      const box = (sel) => { const el = document.querySelector(sel); return el ? rect(el) : null; };
      /* الروندا تُفتح داخل صفحة اللعبة وهيدر المنصة ظاهر — المعيار هو حاوية اللعبة */
      const host = box('#gamePageBody') || { l: 0, r: vw, t: 0, b: vh, w: vw, h: vh };
      const stage = box('#rdStage'), felt = box('#felt'), hand = box('#hand'), court = box('#rd-court');
      const deck = box('#rd-deck'), table = box('#table-cards');
      const chips = Array.from(document.querySelectorAll('#rdStage .rd-inf-seg, #rdStage .rd-help')).map(rect).filter(Boolean);
      const seats = Array.from(document.querySelectorAll('#rdStage .rd-seat .rd-av, #rdStage .rd-seat .rd-seat-stats')).map(rect).filter(Boolean);
      const inside = (b) => b && b.l >= host.l - 1 && b.r <= host.r + 1 && b.t >= host.t - 1 && b.b <= host.b + 1;
      const ovl = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
      const pairOverlapMax = (list) => {
        let mx = 0;
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const o = ovl(list[i], list[j]);
          const minArea = Math.max(1, Math.min(list[i].w * list[i].h, list[j].w * list[j].h));
          mx = Math.max(mx, o / minArea);
        }
        return mx;
      };
      const chipOverlap = pairOverlapMax(chips);
      const seatChipOverlap = (() => {
        let mx = 0;
        for (const s of seats) for (const cc of chips) {
          const o = ovl(s, cc);
          mx = Math.max(mx, o / Math.max(1, Math.min(s.w * s.h, cc.w * cc.h)));
        }
        return mx;
      })();
      const centerOverlap = ovl(table, deck) / Math.max(1, Math.min(table.w * table.h, deck.w * deck.h));
      return {
        stageIn: inside(stage), feltIn: inside(felt), handIn: inside(hand),
        feltPctW: Math.round((felt ? felt.w : 0) / host.w * 100),
        feltPctH: Math.round((felt ? felt.h : 0) / host.h * 100),
        courtH: court ? Math.round(court.h) : 0,
        deckSide: deck ? Math.round(deck.w) : 0,
        tableAreaRatio: table && court ? Math.round(table.w * table.h / (court.w * court.h) * 100) : 0,
        chipOverlap: Math.round(chipOverlap * 100),
        seatChipOverlap: Math.round(seatChipOverlap * 100),
        centerOverlap: Math.round(centerOverlap * 100)
      };
    });
    if (geo.stageIn && geo.feltIn) ok('stage & felt fully inside viewport'); else bad('overflow: ' + JSON.stringify(geo));
    ok('felt covers ' + geo.feltPctW + '%w × ' + geo.feltPctH + '%h of the game area (goal ≈100%)', geo.feltPctW >= 96 && geo.feltPctH >= 96);
    if (geo.handIn) ok('hand inside viewport'); else bad('hand overflow');
    if (geo.courtH >= 60) ok('court height = ' + geo.courtH + 'px'); else bad('court too short');
    ok('deck square side = ' + geo.deckSide + 'px', geo.deckSide >= 40);
    ok('table-cards area = ' + geo.tableAreaRatio + '% of court', geo.tableAreaRatio > 15 && geo.tableAreaRatio < 90);
    if (geo.chipOverlap <= 5) ok('hud chips do not overlap each other'); else bad('chip overlap ' + geo.chipOverlap + '%');
    if (geo.seatChipOverlap <= 8) ok('seats do not overlap centre chips'); else bad('seat/chip overlap ' + geo.seatChipOverlap + '%');
    if (geo.centerOverlap <= 5) ok('deck does not overlap the played-cards zone'); else bad('deck/table overlap ' + geo.centerOverlap + '%');

    // لعب حركة واحدة + سجل
    const played = await page.evaluate(async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 25000) {
        const el = document.querySelector('#hand .rd-card.rd-live');
        if (el) { el.click(); return true; }
        await new Promise(r => setTimeout(r, 180));
      }
      return false;
    });
    if (played) ok('played a card'); else bad('no live card');
    await page.waitForTimeout(1600);
    const logs = await page.$eval('#log-list', el => el.children.length).catch(() => 0);
    if (logs > 0) ok('log entries ' + logs); else bad('log empty');

    await page.screenshot({ path: SHOT + '_shot_rd_v2_5_' + c.name + '.png', fullPage: false });
    results.push('  📸 ' + SHOT + '_shot_rd_v2_5_' + c.name + '.png');
    if (page._errs.length === 0) ok('no console errors');
    else bad('errors: ' + page._errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  /* لقطة متقدمة (desktop) بعد عدة حركات — للتسليم المرئي */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 1280, height: 800 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => openGame('rd'));
    await PW.wait(page, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);
    await page.evaluate(() => { if (window.RondaApp) window.RondaApp.speed = 1.6; RondaApp.config.bet = 0; RondaApp.syncMenuUI(); });
    await page.click('#rdStage #btn-start');
    await PW.wait(page, () => document.querySelectorAll('#hand .rd-card').length === 3, 20000);
    for (let i = 0; i < 7; i++) {
      await page.evaluate(async () => {
        const t0 = Date.now();
        while (Date.now() - t0 < 15000) {
          const el = document.querySelector('#hand .rd-card.rd-live');
          if (el) { el.click(); return; }
          await new Promise(r => setTimeout(r, 180));
        }
      });
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: SHOT + '_shot_rd_v2_5_play_desktop.png' });
    results.push('\n  📸 ' + SHOT + '_shot_rd_v2_5_play_desktop.png');
    if (page._errs.length === 0) ok('no console errors (advanced play)');
    else bad('errors: ' + page._errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\n═══ RD v2.5 probe: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})();
