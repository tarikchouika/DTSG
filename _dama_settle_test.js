/* Dama — wager settlement + flying-king UI test.
   Verifies: bet taken at start, win/loss/draw credit the right amounts,
   result overlay shows correct text, and a Flying King offers multi-square slides. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t = 12000, a) { const s = Date.now(); let e; while (Date.now() - s < t) { try { const r = await p.evaluate(fn, a); if (r) return r; } catch (x) { e = x; } await p.waitForTimeout(150); } throw new Error('timeout ' + (e ? e.message : '')); }

async function setup(ctx, u) {
  await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
  const p = await ctx.newPage();
  const er = []; p.on('pageerror', e => er.push(String(e.message).slice(0, 120))); p._er = er;
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined' && typeof GB !== 'undefined'));
  await p.evaluate(() => { ST.gold = 50000; GB = 100; });
  return p;
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const page = await setup(ctx, 'dmst' + Date.now().toString().slice(-5));
  const R = [];
  try {
    await page.evaluate(() => openGame('dm'));
    await wait(page, () => { const el = document.getElementById('damaSetup'); return el && !el.hidden; });
    /* default difficulty = Medium (mult 2.0), human = White. Start. */
    await page.click('#damaGo');
    await wait(page, () => { const bd = document.getElementById('damaBoard'); return bd && bd.children.length === 64; });
    await sleep(200);

    const before = await page.evaluate(() => ST.gold);   /* 50000 - 100 = 49900 */
    R.push(['bet taken at start (49900)', before === 49900]);

    /* ── WIN path: human=white, mult 2.0 → payout 200, gold → 49900+200=50100 ── */
    await page.evaluate(() => damaSettle(true));
    await sleep(150);
    const winState = await page.evaluate(() => ({
      gold: ST.gold,
      overHidden: document.getElementById('damaOver').hidden,
      em: document.getElementById('damaOverEm').textContent,
      tx: document.getElementById('damaOverTx').textContent,
      amt: document.getElementById('damaOverAmt').textContent
    }));
    R.push(['win credits +200 → 50100', winState.gold === 50100]);
    R.push(['win overlay shown', winState.overHidden === false]);
    R.push(['win overlay text "فزت"', /فزت/.test(winState.tx)]);

    /* new match resets bet taken again (50100 - 100 = 50000) */
    await page.evaluate(() => damaNewMatch());
    await sleep(150);
    const afterNew = await page.evaluate(() => ST.gold);
    R.push(['new match re-takes bet (50000)', afterNew === 50000]);

    /* ── LOSS path: resign → no credit, overlay loss ── */
    await page.evaluate(() => damaResign());
    await sleep(150);
    const loseState = await page.evaluate(() => ({
      gold: ST.gold,
      em: document.getElementById('damaOverEm').textContent,
      tx: document.getElementById('damaOverTx').textContent
    }));
    R.push(['loss keeps gold at 50000', loseState.gold === 50000]);
    R.push(['loss overlay text "خسرت"', /خسرت/.test(loseState.tx)]);

    /* ── DRAW path: refund ── */
    await page.evaluate(() => damaNewMatch());
    await sleep(150);
    const g0 = await page.evaluate(() => ST.gold);   /* 50000-100=49900 */
    await page.evaluate(() => damaFinalize('draw'));
    await sleep(150);
    const drawState = await page.evaluate(() => ({ gold: ST.gold, tx: document.getElementById('damaOverTx').textContent }));
    R.push(['draw refunds bet (49900→50000)', drawState.gold === 50000]);
    R.push(['draw overlay text "تعادل"', /تعادل/.test(drawState.tx)]);

    /* ── Flying King UI: place a white king, tap → many slide hints ── */
    await page.evaluate(() => {
      document.getElementById('damaOver').hidden = true;   /* dismiss any result overlay first */
      const s = DAMA.state;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s.grid[r][c] = null;
      s.grid[7][0] = { owner: 'w', king: true, id: 0 };   // flying king
      s.grid[0][2] = { owner: 'b', king: false, id: 1 };  // a black far away (keeps game alive)
      s.turn = 'w'; s.cont = null; s.over = false; s.outcome = null;
      DAMA.sel = null; DAMA.legal = [];
      damaRender();
    });
    await sleep(120);
    await page.click('#damaBoard .dm-sq[data-r="7"][data-c="0"]');
    await sleep(220);
    const kingHints = await page.evaluate(() => document.querySelectorAll('#damaBoard .dm-sq.hint').length);
    R.push(['flying king offers multi-square slides (' + kingHints + ' hints)', kingHints >= 5]);
    /* the king can reach the long diagonal up-right squares */
    const reach07 = await page.evaluate(() => !!document.querySelector('#damaBoard .dm-sq.hint[data-r="0"][data-c="7"]'));
    R.push(['flying king reaches (0,7)', reach07]);

    R.push(['0 page errors', page._er.length === 0]);
    if (page._er.length) console.log('  ERRORS', JSON.stringify(page._er));
  } catch (e) {
    R.push(['ran without throwing', false]);
    console.log('  FATAL', e.message.slice(0, 160));
  }
  await page.close(); await b.close();

  console.log('\n═══ Dama settlement + flying-king ═══');
  let pass = 0; for (const [m, c] of R) { console.log((c ? '✅ ' : '❌ ') + m); if (c) pass++; }
  console.log('\nالنتيجة: ' + pass + ' / ' + R.length);
  process.exit(pass === R.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
