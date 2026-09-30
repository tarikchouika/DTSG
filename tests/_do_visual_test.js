process.chdir(require('path').resolve(__dirname, '..'));
/* Dominoes visual/freeze probe — screenshots portrait+landscape + auto-play fuzz. */
const { chromium } = require('playwright');
const BASE = process.env.QA_BASE || 'http://localhost:4173/';   /* [v2.49-QABASE] */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t = 12000) { const s = Date.now(); let e; while (Date.now() - s < t) { try { const r = await p.evaluate(fn); if (r) return r; } catch (x) { e = x; } await p.waitForTimeout(150); } throw new Error('timeout ' + (e ? e.message : '')); }

async function setup(ctx, u) {
  await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
  const p = await ctx.newPage();
  const er = [];
  p.on('pageerror', e => er.push(String(e.message).slice(0, 160)));
  p._er = er;
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
  await p.evaluate(() => { ST.gold = 50000; });
  return p;
}

async function playActions(p, n) {
  let acted = 0, stalled = 0;
  for (let i = 0; i < n * 6 && acted < n; i++) {
    const st = await p.evaluate(() => {
      const app = window.DominoApp;
      const g = app && app.game ? app.game.state : null;
      return {
        phase: g ? g.phase : null, turn: g ? g.turn : null, busy: app ? app.busy : null,
        can: !!document.querySelector('.dm-hand .dm-htile.can'),
        hint: !(document.getElementById('dmHintL') || {}).hidden || !(document.getElementById('dmHintR') || {}).hidden,
        pulse: !!(document.querySelector('.dm-boneyard.pulse')),
        pass: !(document.getElementById('dmPassBtn') || {}).hidden,
        layer: !!document.querySelector('.dm-layer:not([hidden])')
      };
    });
    if (st.phase === 'matchEnd' || st.layer) break;
    if (st.phase !== 'play' || st.turn !== 0 || st.busy) { await sleep(300); continue; }
    if (st.hint) { await p.evaluate(() => { const l = document.getElementById('dmHintL'), r = document.getElementById('dmHintR'); if (l && !l.hidden) l.click(); else if (r && !r.hidden) r.click(); }); acted++; await sleep(250); continue; }
    if (st.can) {
      await p.evaluate(() => { const b = document.querySelector('.dm-hand .dm-htile.can'); if (b) b.click(); });
      acted++; await sleep(250); continue;
    }
    if (st.pulse) { await p.evaluate(() => document.getElementById('dmBoneyard').click()); acted++; await sleep(250); continue; }
    if (st.pass) { await p.evaluate(() => document.getElementById('dmPassBtn').click()); acted++; await sleep(250); continue; }
    stalled++;
    if (stalled > 30) { console.log('STALL at', JSON.stringify(st)); break; }
    await sleep(300);
  }
  return acted;
}

(async () => {
  const results = [];
  const b = await chromium.launch();
  /* portrait */
  let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let p = await setup(ctx, 'dov' + Date.now().toString().slice(-5));
  console.log('step: openGame'); await p.evaluate(() => openGame('do'));
  await wait(p, () => !!document.getElementById('dmStartBtn')); console.log('step: menu ready');
  await p.evaluate(() => { const inp = document.getElementById('dmBetInput'); if (inp) inp.value = 25; });
  await p.click('#dmStartBtn'); console.log('step: start clicked');
  await wait(p, () => document.getElementById('dmPlay').classList.contains('dm-screen-active')); console.log('step: play active');
  await sleep(900);
  await p.screenshot({ path: '/tmp/dtsg-shots/do-portrait-menu-done.png' });
  console.log('step: portrait playing'); const actedP = await playActions(p, 12); console.log('step: portrait done', actedP);
  await sleep(400);
  await p.screenshot({ path: '/tmp/dtsg-shots/do-portrait.png' });
  results.push(['portrait actions', actedP, 'errors', p._er.slice(0, 3)]);
  await ctx.close();

  /* landscape */
  ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  p = await setup(ctx, 'dol' + Date.now().toString().slice(-5));
  console.log('step: openGame'); await p.evaluate(() => openGame('do'));
  await wait(p, () => !!document.getElementById('dmStartBtn')); console.log('step: menu ready');
  await p.click('#dmStartBtn'); console.log('step: start clicked');
  await wait(p, () => document.getElementById('dmPlay').classList.contains('dm-screen-active')); console.log('step: play active');
  await sleep(900);
  console.log('step: landscape playing'); const actedL = await playActions(p, 12); console.log('step: landscape done', actedL);
  await sleep(400);
  await p.screenshot({ path: 'shot_do_land.png' });
  results.push(['landscape actions', actedL, 'errors', p._er.slice(0, 3)]);

  /* fit check */
  const fit = await p.evaluate(() => {
    const body = document.getElementById('gamePageBody');
    const stage = body && body.querySelector('.dm-stage');
    if (!stage) return { err: 'no stage' };
    const b = body.getBoundingClientRect(), s = stage.getBoundingClientRect();
    const hand = document.getElementById('dmHand').getBoundingClientRect();
    const tile = document.querySelector('.dm-hand .dm-htile');
    const t = tile ? tile.getBoundingClientRect() : null;
    return { bodyH: Math.round(b.height), stageH: Math.round(s.height), top: Math.round(s.top - b.top), bottom: Math.round(s.bottom - b.bottom), handW: Math.round(hand.width), tileW: t ? Math.round(t.width) : 0, tileH: t ? Math.round(t.height) : 0 };
  });
  results.push(['fit', fit]);
  console.log(JSON.stringify(results, null, 1));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
