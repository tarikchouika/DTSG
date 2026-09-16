/* Dama Maghribia — browser integration test.
   Verifies: catalog entry, setup screen, board render, a human move + AI reply,
   mandatory-capture hint UI, and viewport fit (mobile + desktop), with 0 page errors. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t = 12000, a) { const s = Date.now(); let e; while (Date.now() - s < t) { try { const r = await p.evaluate(fn, a); if (r) return r; } catch (x) { e = x; } await p.waitForTimeout(150); } throw new Error('timeout ' + (e ? e.message : '')); }

async function setup(ctx, u) {
  await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
  const p = await ctx.newPage();
  const er = [];
  p.on('pageerror', e => er.push(String(e.message).slice(0, 120)));
  p._er = er;
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
  await p.evaluate(() => { if (typeof ST !== 'undefined') ST.gold = 50000; });
  return p;
}

async function measureFit(page) {
  return await page.evaluate(() => {
    const body = document.getElementById('gamePageBody');
    const stage = body && body.querySelector('.stage');
    if (!stage) return { err: 'no stage' };
    if (typeof fitGameStage === 'function') fitGameStage();
    const b = body.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const inV = s.top >= b.top - 2 && s.bottom <= b.bottom + 2;
    const inH = s.left >= b.left - 2 && s.right <= b.right + 2;
    return { bodyW: Math.round(b.width), bodyH: Math.round(b.height), stageW: Math.round(s.width), stageH: Math.round(s.height), top: Math.round(s.top - b.top), bottom: Math.round(s.bottom - b.bottom), inV, inH };
  });
}

(async () => {
  const results = [];
  for (const [label, vp] of [['mobile', { width: 390, height: 780, isMobile: true, hasTouch: true }], ['desktop', { width: 1280, height: 800 }]]) {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: vp, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const u = 'dm' + label + Date.now().toString().slice(-5);
    const page = await setup(ctx, u);
    try {
      /* 1. catalog entry exists */
      const inCatalog = await page.evaluate(() => Array.isArray(window.GAMES) && window.GAMES.some(g => g.id === 'dm'));
      results.push([label + ': dm in catalog', !!inCatalog]);

      /* 2. open game + setup screen */
      await page.evaluate(() => openGame('dm'));
      await wait(page, () => { const el = document.getElementById('damaSetup'); return el && !el.hidden; }, 10000);
      results.push([label + ': setup screen renders', true]);

      /* 3. start match → board renders with 24 pieces on 32 dark squares */
      await page.click('#damaGo');
      await wait(page, () => { const b = document.getElementById('damaBoard'); return b && b.children.length === 64; }, 10000);
      await sleep(350);
      const counts = await page.evaluate(() => {
        const pcs = document.querySelectorAll('#damaBoard .dm-pc');
        const sq = document.querySelectorAll('#damaBoard .dm-sq').length;
        const w = document.querySelectorAll('#damaBoard .dm-pc.w').length;
        const bl = document.querySelectorAll('#damaBoard .dm-pc.b').length;
        return { sq, w, bl, total: pcs.length };
      });
      results.push([label + ': board 64 squares + 24 pieces (' + counts.w + 'w/' + counts.bl + 'b)', counts.sq === 64 && counts.w === 12 && counts.bl === 12]);

      /* 4. tap a white piece → legal-move hints appear */
      await page.click('#damaBoard .dm-sq[data-r="5"][data-c="1"]');
      await sleep(250);
      const hints0 = await page.evaluate(() => document.querySelectorAll('#damaBoard .dm-sq.hint').length);
      results.push([label + ': tapping white piece shows legal hints (' + hints0 + ')', hints0 >= 1]);
      const canMoveTo41 = await page.evaluate(() => !!document.querySelector('#damaBoard .dm-sq.hint[data-r="4"][data-c="2"]'));
      results.push([label + ': (5,1)→(4,2) offered', canMoveTo41]);

      /* 5. make the move → AI replies, turn returns to human */
      await page.click('#damaBoard .dm-sq[data-r="4"][data-c="2"]');
      await sleep(300);
      await wait(page, () => {
        const el = document.getElementById('damaMainIcon');
        return el && el.classList.contains('turn');
      }, 8000);
      const turnTxt = await page.evaluate(() => {
        const el = document.getElementById('damaMainIcon');
        return (el && el.classList.contains('turn')) ? 'دورك' : '';
      });
      results.push([label + ': AI replied, turn back to human (gold ring on main icon)', /دورك/.test(turnTxt)]);

      /* 6. mandatory capture UI: force a capture position via engine + re-render */
      const capTest = await page.evaluate(() => {
        try {
          // place white at (5,2), black at (4,3) → mandatory capture (3,4)
          const s = DAMA.state;
          // reset grid to a custom position
          for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s.grid[r][c] = null;
          s.grid[5][2] = { owner: 'w', king: false, id: 0 };
          s.grid[4][3] = { owner: 'b', king: false, id: 1 };
          s.grid[7][1] = { owner: 'w', king: false, id: 2 }; // extra white so it's not instantly lost
          s.grid[0][0] = { owner: 'b', king: false, id: 3 };
          s.turn = 'w'; s.cont = null; s.over = false; s.outcome = null;
          DAMA.sel = null; DAMA.legal = [];
          // re-render is internal — call via selecting
          damaRender();
          // tap the white piece at (5,2)
          return 'reset';
        } catch (e) { return 'ERR ' + e.message; }
      });
      await sleep(120);
      await page.click('#damaBoard .dm-sq[data-r="5"][data-c="2"]');
      await sleep(200);
      const capHint = await page.evaluate(() => {
        const h = document.querySelector('#damaBoard .dm-sq.hint-cap[data-r="3"][data-c="4"]');
        return !!h;
      });
      results.push([label + ': mandatory capture shown as red ring at (3,4)', !!capHint]);

      /* 6b. [v2.27 Souffler] quiet piece: FREELY selectable (owner's rule: capture is
         obligatory by law, but the player may move any piece — the obliged piece that
         skips its capture gets blown). Visual obliged-glow persists as the warning. */
      await page.click('#damaBoard .dm-sq[data-r="7"][data-c="1"]');
      await sleep(200);
      const st6b = await page.evaluate(() => ({
        hints: document.querySelectorAll('#damaBoard .dm-sq.hint').length,
        quietSel: !!document.querySelector('#damaBoard .dm-sq.sel[data-r="7"][data-c="1"]'),
        obliged: document.querySelectorAll('#damaBoard .dm-pc.obliged').length
      }));
      results.push([label + ': quiet piece freely selectable (souffler rule)', st6b.quietSel]);
      results.push([label + ': selected quiet piece shows its moves (' + st6b.hints + ')', st6b.hints >= 1]);
      results.push([label + ': obliged piece glows (dm-pc.obliged) (' + st6b.obliged + ')', st6b.obliged >= 1]);

      /* 6b1. [v2.27 Souffler] play the quiet move ⇒ the obliged piece is blown + status explains */
      await page.click('#damaBoard .dm-sq[data-r="6"][data-c="0"]');
      await sleep(300);
      const sfx = await page.evaluate(() => ({
        status: (document.getElementById('damaStatus') || {}).textContent || '',
        pcAt52: !!document.querySelector('#damaBoard .dm-sq[data-r="5"][data-c="2"] .dm-pc')
      }));
      results.push([label + ': quiet move ⇒ souffle message shown (' + sfx.status.trim().slice(0, 30) + ')', /نفخ|Souffl/i.test(sfx.status)]);
      results.push([label + ': souffle ⇒ obliged piece removed from (5,2)', !sfx.pcAt52]);

      /* 6b2. [B10] bet row removed from the play window — stake chip instead */
      const betUI = await page.evaluate(() => ({
        playBets: !!document.querySelector('#damaPlay .bets'),
        setupBets: !!document.querySelector('#damaSetup .bets'),
        stake: (document.getElementById('damaStake') || {}).textContent || '',
        stakeHidden: !document.getElementById('damaStake') || document.getElementById('damaStake').hidden
      }));
      results.push([label + ': bet row GONE from play window', !betUI.playBets]);
      results.push([label + ': bet row present in setup (settings)', betUI.setupBets]);
      results.push([label + ': static stake chip during play (' + betUI.stake.trim() + ')', !betUI.stakeHidden && betUI.stake.trim().length > 2]);

      /* 6b3. [B10] flip button removed; draw-agreement button present (icon-only — label lives in title/aria) */
      const btns = await page.evaluate(() => {
        const db = document.getElementById('damaDrawBtn');
        return {
          flip: [...document.querySelectorAll('#damaPlay .dama-ctrls .dama-mini')].some(b => /تدوير|Pivoter|Flip/.test(b.textContent)),
          draw: !!db,
          drawTxt: db ? (db.title || db.getAttribute('aria-label') || db.textContent || '') : ''
        };
      });
      results.push([label + ': flip button removed', !btns.flip]);
      results.push([label + ': draw-agreement button present (' + btns.drawTxt.trim() + ')', btns.draw && /تعادل|Nul|Draw/.test(btns.drawTxt)]);

      /* 6c. [B9] dama-specific sounds registered per move type */
      const sndOK = await page.evaluate(() =>
        typeof SND !== 'undefined' && !!SND.damaMove && !!SND.damaKingMove && !!SND.damaCapture &&
        !!SND.damaChain && !!SND.damaKing && !!SND.damaPending);
      results.push([label + ': distinct dama SFX per move type', sndOK]);

      /* 6d. [B9] realistic animation layer present (fly ghosts + animator fn) */
      const animOK = await page.evaluate(() => typeof damaAnimate === 'function' && typeof damaMoveSound === 'function');
      results.push([label + ': animation layer (damaAnimate + damaMoveSound)', animOK]);

      /* 6e. [B9] king-row stop + deferred promotion — full UI flow */
      const pend = await page.evaluate(async () => {
        try {
          const s = DAMA.state;
          for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s.grid[r][c] = null;
          s.grid[2][3] = { owner: 'w', king: false, id: 0 };
          s.grid[1][4] = { owner: 'b', king: false, id: 1 };
          s.grid[1][6] = { owner: 'b', king: false, id: 2 };
          s.grid[5][0] = { owner: 'b', king: false, id: 3 };
          s.turn = 'w'; s.cont = null; s.chainNeed = null; s.over = false; s.outcome = null;
          DAMA.sel = null; DAMA.legal = []; DAMA.busy = false;
          damaRender();
          const lm = DAMA.eng.legalMoves(s, 'w');
          /* [v2.27 Souffler] both the capture and quiet moves are offered (freedom);
             the deferred-promotion capture lands on (0,5) */
          const capMv = lm.find(m => m.cap && m.to[0] === 0 && m.to[1] === 5);
          const capTo05 = !!capMv;
          const quietOffered = lm.some(m => !m.cap);
          damaHumanMove(capMv);
          await new Promise(rs => setTimeout(rs, 420));
          const pendingVis = !!document.querySelector('#damaBoard .dm-pc.pending');
          const stopped = s.turn === 'b' && s.grid[0][5].pendingKing === true && s.grid[0][5].king === false;
          await new Promise(rs => setTimeout(rs, 3600));   /* رد الذكاء التلقائي */
          const crowned = s.grid[0][5] && s.grid[0][5].king === true;
          const crownVis = !!document.querySelector('#damaBoard .dm-sq[data-r="0"][data-c="5"] .dm-pc.king');
          return { capTo05, quietOffered, pendingVis, stopped, crowned, crownVis };
        } catch (e) { return { err: e.message }; }
      });
      results.push([label + ': deferred promotion — capture to (0,5) offered', pend.capTo05 === true]);
      results.push([label + ': souffler freedom — quiet move offered alongside capture', pend.quietOffered === true]);
      results.push([label + ': deferred promotion — pending marker (⏳) shown', pend.pendingVis === true]);
      results.push([label + ': deferred promotion — piece stopped as man, turn passed', pend.stopped === true]);
      results.push([label + ': deferred promotion — crowned after opponent turn', pend.crowned === true && pend.crownVis === true]);

      /* 7. fit on this viewport */
      const m = await measureFit(page);
      const okFit = !m.err && m.inV && m.inH;
      results.push([label + ': stage fits viewport (' + (m.stageW || '?') + 'x' + (m.stageH || '?') + ' in ' + (m.bodyW || '?') + 'x' + (m.bodyH || '?') + ')', !!okFit]);
      if (!okFit) console.log('  CLIP', label, JSON.stringify(m));

      /* screenshot */
      await page.screenshot({ path: '_shot_dama_' + label + '.png' });

      results.push([label + ': 0 page errors', page._er.length === 0]);
      if (page._er.length) console.log('  ERRORS', label, JSON.stringify(page._er));
    } catch (e) {
      results.push([label + ': ran without throwing', false]);
      console.log('  FATAL', label, e.message.slice(0, 140));
    }
    await page.close();
    await b.close();
  }

  console.log('\n═══ Dama browser integration ═══');
  let pass = 0;
  for (const [m, c] of results) { console.log((c ? '✅ ' : '❌ ') + m); if (c) pass++; }
  console.log('\nالنتيجة: ' + pass + ' / ' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
