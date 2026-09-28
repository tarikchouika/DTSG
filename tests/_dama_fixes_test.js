const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
async function wait(p, fn, t){ t=t||12000; const s=Date.now(); while(Date.now()-s<t){try{const r=await p.evaluate(fn); if(r)return r;}catch(e){} await p.waitForTimeout(150);} return null; }
const res=[]; const ok=(n,c)=>{res.push([n,!!c]); console.log((c?'  ✓ ':'  ✗ ')+n);};

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  // ── ENGLISH translation + parity + timer ──
  const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error' && !/Failed to load resource|404/i.test(m.text())) errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof ST !== 'undefined' && typeof openGame === 'function' && typeof T === 'function'));
  await p.evaluate(() => { ST.lang = 'en'; if (window.save) save(); });
  await p.evaluate(() => openGame('dm'));
  await wait(p, () => !!document.getElementById('damaSetup'));

  // Issue 4: setup screen translated (EN), no raw dama.* keys visible
  const setupTxt = await p.evaluate(() => document.getElementById('damaSetup').innerText);
  ok('EN setup: "Difficulty" present', /Difficulty/i.test(setupTxt));
  ok('EN setup: "Start match" present', /Start match/i.test(setupTxt));
  ok('EN setup: no raw dama.* keys', !/dama\.[a-z]/i.test(setupTxt));

  // Issue 3: timer chips present (off + 30..300)
  const timerChips = await p.$$eval('.dama-timer-row .dama-chip', els => els.map(e => e.getAttribute('data-t')));
  ok('timer chips: 0,30,60,120,180,300', JSON.stringify(timerChips) === JSON.stringify(['0','30','60','120','180','300']));

  // select 30s + start
  await p.evaluate(() => damaSetTimer(30));
  await p.click('#damaGo');
  await wait(p, () => !document.getElementById('damaPlay').hidden);
  await wait(p, () => !!(DAMA && DAMA.state));

  // Issue 1: bottom-right dark w/ piece, bottom-left light
  const corners = await p.evaluate(() => {
    const sq = (r,c) => document.querySelector('.dm-sq[data-r="'+r+'"][data-c="'+c+'"]');
    return {
      brDark: sq(7,7) && sq(7,7).classList.contains('dark'),
      brPiece: !!(sq(7,7) && sq(7,7).querySelector('.dm-pc')),
      blLight: sq(7,0) && sq(7,0).classList.contains('light')
    };
  });
  ok('Issue1: bottom-right (7,7) is dark', corners.brDark);
  ok('Issue1: bottom-right has a piece', corners.brPiece);
  ok('Issue1: bottom-left (7,0) is light', corners.blLight);

  // Opponent seat icon (top of board) — HUD label removed per owner request
  const oppIcon = await p.evaluate(() => !!document.getElementById('damaOppIcon'));
  ok('Opponent seat icon present', oppIcon);

  // Issue 3: countdown running (⏱ ...)
  const cd = await wait(p, () => { const el = document.getElementById('damaTimer'); return (el && /⏱/.test(el.textContent)) ? el.textContent : null; }, 6000);
  ok('Issue3: turn countdown visible (' + cd + ')', !!cd);
  // accelerate: set 2s and wait for auto-move
  await p.evaluate(() => { DAMA.timeLimit = 2; damaStartTimer(); });
  const autoMoved = await wait(p, () => {
    if (!DAMA || !DAMA.state) return null;
    // auto-move ends human's turn (white) -> turn becomes black, or status shows time up
    if (DAMA.state.turn === 'b' || /Time up|Automatic/i.test(document.getElementById('damaStatus').textContent)) return 1;
    return null;
  }, 8000);
  ok('Issue3: auto-move fires on timeout (turn switched / time-up shown)', !!autoMoved);

  // Issue 2: animation scoped — after AI settles, exactly 1 piece has .just
  await wait(p, () => (DAMA && !DAMA.busy && DAMA.state.turn === 'w') ? 1 : null, 8000);
  const justCount = await p.$$eval('.dm-pc.just', els => els.length);
  ok('Issue2: only the just-moved piece animates (.just count = 1)', justCount === 1);
  const totalPc = await p.$$eval('.dm-pc', els => els.length);
  ok('Issue2: all pieces still present (' + totalPc + ')', totalPc > 0);

  ok('no page/console errors', errs.length === 0);
  await ctx.close();

  // ── FRENCH spot check ──
  const ctx2 = await b.newContext({ viewport: { width: 430, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p2, () => !!(typeof ST !== 'undefined' && typeof openGame === 'function'));
  await p2.evaluate(() => { ST.lang = 'fr'; if (window.save) save(); });
  await p2.evaluate(() => openGame('dm'));
  await wait(p2, () => !!document.getElementById('damaSetup'));
  const frTxt = await p2.evaluate(() => document.getElementById('damaSetup').innerText);
  ok('FR setup: "Difficulté" present', /Difficult/i.test(frTxt));
  ok('FR setup: no raw dama.* keys', !/dama\.[a-z]/i.test(frTxt));
  await ctx2.close();

  await b.close();
  const failed = res.filter(r => !r[1]).length;
  console.log('\n═══ DAMA fixes (parity/anim/timer/i18n): ' + (res.length - failed) + '/' + res.length + ' passed ═══');
  process.exit(failed ? 1 : 0);
})();
