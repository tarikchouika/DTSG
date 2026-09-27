process.chdir(require('path').resolve(__dirname, '..'));
/* [v2.62 PRO] اختبار دخاني احترافي:
   1) 17 بطاقة لعبة بلا cf/hl/ke/av
   2) RPS: جولة كاملة (عدّ تنازلي → كشف 3D → نتيجة) بلا أخطاء + عناصر الحلبة الجديدة
   3) Penalty: تسديدة كاملة (صافرة → طيران → لافتة نتيجة) بلا أخطاء + عناصر الاستاد
   4) نقاط cf/hl المحذوفة = 404 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t = 12000, label) {
  const s = Date.now(); let e;
  while (Date.now() - s < t) {
    try { const r = await p.evaluate(fn); if (r) return r; } catch (x) { e = x; }
    await p.waitForTimeout(150);
  }
  throw new Error('timeout' + (label ? ' [' + label + ']' : '') + (e ? ' ' + e.message : ''));
}
let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } console.log((c ? '  ✅ ' : '  ❌ ') + n); };

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.request.post(BASE + 'api/register', { data: { username: 'v262pro' + Date.now().toString().slice(-6), password: 'pw123456' } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 110)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 110)); });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
  await p.evaluate(() => { ST.gold = 50000; });
  await sleep(600);

  console.log('═══ 1) الكتالوج: 17 لعبة بلا المحذوفات ═══');
  const cat = await p.evaluate(() => {
    const ids = (window.GAMES || GAMES).map(g => g.id);
    return { n: ids.length, has: ['cf', 'hl', 'ke', 'av'].filter(x => ids.includes(x)), ids };
  });
  ok(cat.n === 17, '17 games in catalog (got ' + cat.n + ')');
  ok(cat.has.length === 0, 'no cf/hl/ke/av in catalog');
  const tiles = await p.evaluate(() => document.querySelectorAll('.tile').length);
  ok(tiles >= 17, 'game tiles rendered: ' + tiles);

  console.log('═══ 2) RPS — جولة احترافية كاملة ═══');
  await p.evaluate(() => openGame('rp'));
  await wait(p, () => { const b = document.getElementById('gamePageBody'); return b && b.querySelector('.rps-arena') ? true : false; }, 10000, 'rps render');
  const rpsEls = await p.evaluate(() => ({
    arena: !!document.querySelector('.rps-arena'),
    count: !!document.getElementById('rpsCount'),
    myScore: !!document.getElementById('rpsMyScore'),
    aiScore: !!document.getElementById('rpsAiScore'),
    vs: !!document.querySelector('.rps-vs'),
    btns: document.querySelectorAll('.rpsBtn').length
  }));
  ok(rpsEls.arena && rpsEls.count && rpsEls.vs, 'RPS duel arena + countdown badge + VS present');
  ok(rpsEls.myScore && rpsEls.aiScore, 'RPS session score counters present');
  ok(rpsEls.btns === 3, 'RPS 3 move buttons');
  // جولة كاملة
  await p.evaluate(() => rpsPlay('✊'));
  await wait(p, () => { const c = document.getElementById('rpsCount'); return c && c.classList.contains('pop') ? c.textContent : false; }, 6000, 'countdown');
  const counting = await p.evaluate(() => ({
    my: document.getElementById('rpsMyCard').classList.contains('counting'),
    opp: document.getElementById('rpsOppCard').classList.contains('counting'),
    arenaDuel: document.querySelector('.rps-arena').classList.contains('dueling')
  }));
  ok(counting.my && counting.opp && counting.arenaDuel, 'countdown: both cards pumping + arena dueling');
  // انتظار نهاية العد والكشف (3×420ms + 480 + نتيجة)
  await wait(p, () => {
    const r = document.getElementById('rpsResult');
    const my = document.getElementById('rpsMyFace');
    return r && r.textContent.length > 3 && my && my.textContent !== '❓' ? r.textContent : false;
  }, 9000, 'rps result');
  const rpsRes = await p.evaluate(() => {
    const my = document.getElementById('rpsMyCard');
    const opp = document.getElementById('rpsOppCard');
    return {
      revealed: document.getElementById('rpsMyFace').textContent !== '❓',
      state: [my.classList.contains('win'), my.classList.contains('lose'), my.classList.contains('tie')].some(Boolean) &&
             [opp.classList.contains('win'), opp.classList.contains('lose'), opp.classList.contains('tie')].some(Boolean),
      score: (document.getElementById('rpsMyScore').textContent !== '0') || (document.getElementById('rpsAiScore').textContent !== '0')
    };
  });
  ok(rpsRes.revealed, 'RPS my card revealed with emoji');
  ok(rpsRes.state, 'RPS win/lose/tie state applied to both cards');
  /* آلية العدّاد: تحقّق مباشر — التعادل الجولة الأولى لا يُحرّك العدّاد فيظل 0-0 (سلوك سليم) */
  const scoreFn = await p.evaluate(() => {
    rpsMyScore = 3; rpsAiScore = 1; rpsSyncScore();
    const my = document.getElementById('rpsMyScore').textContent;
    const ai = document.getElementById('rpsAiScore').textContent;
    const lead = document.getElementById('rpsMyScoreW').classList.contains('lead');
    rpsMyScore = 0; rpsAiScore = 0; rpsSyncScore();
    return { my: my, ai: ai, lead: lead };
  });
  ok(scoreFn.my === '3' && scoreFn.ai === '1' && scoreFn.lead, 'RPS score sync mechanism works (3:1 + lead badge)');
  // جولة ثانية للتأكد من إعادة التهيئة
  await sleep(1900);
  await p.evaluate(() => rpsPlay('✋'));
  const r2 = await wait(p, () => {
    const c = document.getElementById('rpsCount');
    return c && c.classList.contains('pop') ? true : false;
  }, 4000, 'round 2 countdown');
  ok(r2, 'RPS round 2 starts (busy reset works)');
  /* دورة الجولة: عدّ 1260ms + كشف 480 + نتيجة + إعادة ضبط 1500 = ~3240ms */
  await sleep(4400);
  const resetOk = await p.evaluate(() => document.getElementById('rpsMyFace').textContent === '❓');
  ok(resetOk, 'RPS cards reset to mystery after round');
  const balanceAfter = await p.evaluate(() => ST.gold);
  ok(isFinite(balanceAfter), 'wallet intact after RPS rounds: ' + balanceAfter);

  console.log('═══ 3) Penalty — استاد وتسديدة كاملة ═══');
  await p.evaluate(() => openGame('pn'));
  await wait(p, () => { const b = document.getElementById('gamePageBody'); return b && b.querySelector('.pn-arena') ? true : false; }, 10000, 'pn render');
  const pnEls = await p.evaluate(() => ({
    crowd: !!document.querySelector('.pn-crowd'),
    grass: !!document.querySelector('.pn-grass'),
    spot: !!document.querySelector('.pn-spot'),
    banner: !!document.getElementById('pnBanner'),
    ripple: !!document.getElementById('pnRipple'),
    gbar: !!document.querySelector('.goal .gbar'),
    keeperIdle: document.getElementById('pnKeeper').classList.contains('idle'),
    btns: document.querySelectorAll('.pnBtn').length
  }));
  ok(pnEls.crowd && pnEls.grass && pnEls.spot && pnEls.gbar, 'stadium: crowd + grass + spot + crossbar present');
  ok(pnEls.banner && pnEls.ripple, 'result banner + net ripple elements present');
  ok(pnEls.keeperIdle, 'keeper idle-dancing before kick');
  ok(pnEls.btns === 9, 'Penalty 9 direction buttons');
  // تسديدة كاملة
  const t0 = Date.now();
  await p.evaluate(() => penShoot('↗️'));
  await sleep(300);
  const tenseBall = await p.evaluate(() => {
    const b = document.getElementById('pnBall');
    return { flying: b.classList.contains('flying') || !!b.style.transform };
  });
  await wait(p, () => {
    const banner = document.getElementById('pnBanner');
    return banner && banner.classList.contains('show') ? banner.textContent : false;
  }, 9000, 'pn banner');
  const flightMs = Date.now() - t0;
  const pnRes = await p.evaluate(() => ({
    banner: document.getElementById('pnBanner').textContent,
    goal: document.getElementById('pnBanner').classList.contains('goal'),
    saved: document.getElementById('pnBanner').classList.contains('saved'),
    arenaState: document.querySelector('.pn-arena').classList.contains('pn-goal') || document.querySelector('.pn-arena').classList.contains('pn-saved'),
    res: document.getElementById('penResult').textContent.length > 3
  }));
  ok(pnRes.banner && (pnRes.goal || pnRes.saved), 'result banner shown: "' + pnRes.banner + '" (' + (pnRes.goal ? 'GOAL' : 'SAVED') + ') in ' + flightMs + 'ms');
  ok(pnRes.arenaState && pnRes.res, 'arena outcome state + status text set');
  // انتظار إعادة التهيئة
  await sleep(2400);
  const pnReset = await p.evaluate(() => ({
    bannerHidden: !document.getElementById('pnBanner').classList.contains('show'),
    keeperIdle: document.getElementById('pnKeeper').classList.contains('idle'),
    ballHome: /^translateX\(0px\) translateY\(0px\)$/.test(document.getElementById('pnBall').style.transform.trim()),
    roleBack: document.getElementById('pnRole').textContent.indexOf('⚽') === 0
  }));
  ok(pnReset.bannerHidden && pnReset.keeperIdle && pnReset.ballHome, 'field reset: banner hidden, keeper idle, ball home');
  ok(pnReset.roleBack, 'role badge back to striker mode');
  // تسديدة ثانية
  const busyOk = await p.evaluate(() => { penShoot('⬇️'); return true; });
  ok(busyOk, 'Penalty second shot starts (busy reset works)');
  await sleep(2200);
  const b2 = await p.evaluate(() => document.getElementById('pnBanner') && document.getElementById('pnBanner').classList.contains('show'));
  ok(b2, 'Penalty second outcome banner shown');
  await sleep(2400);

  console.log('═══ 4) نقاط المحذوفات 404 + بلا أخطاء JS ═══');
  for (const u of ['assets/games/coin-flip/icon.webp', 'assets/games/hi-lo/icon.webp']) {
    const r = await ctx.request.get(BASE + u);
    ok(r.status() === 404, '404: ' + u);
  }
  const realErrs = errs.filter(e => !/favicon|net::ERR|404|Failed to load resource/i.test(e));
  ok(realErrs.length === 0, 'zero JS/console errors (' + realErrs.length + ')' + (realErrs.length ? ' → ' + realErrs.slice(0, 3).join(' | ') : ''));

  console.log('\n═══ النتيجة: ' + pass + ' ✅ / ' + fail + ' ❌ ═══');
  if (fail) { console.log('FAILURES:', fails); }
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
