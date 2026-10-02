process.chdir(require('path').resolve(__dirname, '..'));
/* [v2.62 PRO] اختبار دخاني احترافي:
   1) 17 بطاقة لعبة بلا cf/hl/ke/av
   2) RPS: جولة كاملة (عدّ تنازلي → كشف 3D → نتيجة) بلا أخطاء + عناصر الحلبة الجديدة
   3) Penalty: تسديدة كاملة (صافرة → طيران → لافتة نتيجة) بلا أخطاء + عناصر الاستاد
   4) نقاط cf/hl المحذوفة = 404 */
const { chromium } = require('playwright');
/* [v2.78] مطلق احتياطي: كاش المتصفحات أحدث من مكتبة playwright 1.49 (نمط v274/v277) */
async function launchBw(extraArgs) {
  const _fs = require('fs');
  const _args = (extraArgs || []).concat(['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']);
  try { return await chromium.launch({ headless: true, args: _args }); } catch (e) {}
  for (const v of ['1243', '1200']) {
    for (const p of [
      '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux64/chrome',
      '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux/chrome'
    ]) {
      if (_fs.existsSync(p)) {
        try { return await chromium.launch({ headless: true, args: _args, executablePath: p }); } catch (e) {}
      }
    }
  }
  throw new Error('تعذر إطلاق متصفح — ثبّت كاش كروميوم أو حدّث playwright');
}

/* [v2.69.1] عنوان آمن: يحترم QA_BASE ويرفض الكتابة على خادم المنصة الحيّ */
const BASE = require('./_safe_base.js').BASE_SLASH;
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
  const b = await launchBw();
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
  /* [v2.63] بلا خانة رهان في واجهة RPS — اللعب ضد الحاسوب مجاني تعليمي */
  const rpsNoBet = await p.evaluate(() => !document.querySelector('#gamePageBody .bets, #gamePageBody .bet-input, #gamePageBody #GBd'));
  ok(rpsNoBet, 'RPS: NO bet amount field (free educational vs AI)');
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

  console.log('═══ 3) Penalty — v2.64: 9 مناطق + شريطا نتائج + تسديدة دقيقة ═══');
  await p.evaluate(() => openGame('pn'));
  await wait(p, () => { const b = document.getElementById('gamePageBody'); return b && b.querySelector('.pn-fs') ? true : false; }, 10000, 'pn render');
  const pnEls = await p.evaluate(() => ({
    fs: !!document.querySelector('.pn-fs'),
    zones: document.querySelectorAll('.pnz').length,
    gk: !!document.querySelector('.pn-gk'),
    gkParts: document.querySelectorAll('.pn-gk-head,.pn-gk-body,.pn-gk-arm,.pn-gk-leg').length,
    banner: !!document.getElementById('pnBanner'),
    bet: !!document.getElementById('pnBet'),
    specs: !!document.getElementById('pnSpecs'),
    side0: !!document.getElementById('pnSide0'),
    side1: !!document.getElementById('pnSide1'),
    turn: !!document.getElementById('pnTurn'),
    rings: document.querySelectorAll('.pn-ring').length,
    rematch: !!document.getElementById('pnRematch'),
    ball: !!document.getElementById('pnBall'),
    crossbar: !!document.querySelector('.pn-cross'),
    posts: document.querySelectorAll('.pn-post').length
  }));
  ok(pnEls.fs && pnEls.ball, 'fullscreen pitch layer + ball present');
  ok(!pnEls.turn, 'NO turn/status text chip (no phrases at top)');
  ok(pnEls.zones === 9, 'goal divided into 9 touch zones');
  ok(pnEls.posts === 2 && pnEls.crossbar, 'metallic posts + crossbar frame');
  ok(pnEls.gk && pnEls.gkParts >= 6, 'CSS keeper figure (head+body+arms+legs)');
  ok(pnEls.banner, 'result banner element present');
  ok(pnEls.bet && pnEls.specs, 'top bar containers present (rings + bet chip, icons only)');
  ok(pnEls.side0 && pnEls.side1 && pnEls.rings >= 2, 'two result sides with ring avatars (initials)');
  ok(pnEls.rematch, 'rematch voting panel container present (billiards system)');
  // ملء الشاشة 100% + المرمى بعرض الشاشة تقريبا
  const fill = await p.evaluate(() => {
    const fs = document.querySelector('.pn-fs');
    const goal = document.querySelector('.pn-goal');
    if (!fs || !goal) return { err: 1 };
    const f = fs.getBoundingClientRect();
    const g = goal.getBoundingClientRect();
    return {
      fw: Math.round(f.width), fh: Math.round(f.height),
      iw: window.innerWidth, ih: window.innerHeight,
      gw: Math.round(g.width), gx: Math.round(g.left), gxr: Math.round(g.right)
    };
  });
  ok(fill.fw >= fill.iw - 2 && fill.fh >= fill.ih - 2, 'grass fills 100% of screen (' + fill.fw + 'x' + fill.fh + ' in ' + fill.iw + 'x' + fill.ih + ')');
  ok(fill.gw >= 580 && fill.gx >= -2 && fill.gxr <= fill.iw + 2, 'goal centered with comfortable size on desktop (' + fill.gw + 'px of ' + fill.iw + ')');
  /* موبايل بورتريه: المرمى يملأ من الحد الأيمن للأيسر (مواصفة المستخدم) — سياق منفصل */
  {
    const bm = await launchBw();
    const ctxm = await bm.newContext({ viewport: { width: 390, height: 780, isMobile: true, hasTouch: true }, isMobile: true, hasTouch: true });
    await ctxm.request.post(BASE + 'api/register', { data: { username: 'v263m' + Date.now().toString().slice(-6), password: 'pw123456' } });
    const pm = await ctxm.newPage();
    await pm.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(pm, () => !!(typeof AUTH !== 'undefined' && AUTH.user));
    await pm.evaluate(() => openGame('pn'));
    await wait(pm, () => !!(document.getElementById('gamePageBody') && document.querySelector('.pn-fs')), 10000, 'pn mobile render');
    await sleep(700);
    const fillM = await pm.evaluate(() => {
      const fs = document.querySelector('.pn-fs');
      const goal = document.querySelector('.pn-goal');
      if (!fs || !goal) return { err: 1 };
      const f = fs.getBoundingClientRect();
      const g = goal.getBoundingClientRect();
      return { fw: Math.round(f.width), fh: Math.round(f.height), gw: Math.round(g.width), gx: Math.round(g.left), gxr: Math.round(g.right) };
    });
    ok(fillM.fw >= 388 && fillM.fh >= 778, 'portrait: grass fills 100% of mobile screen (' + fillM.fw + 'x' + fillM.fh + ')');
    ok(fillM.gw >= 390 * 0.86 && fillM.gx >= -2 && fillM.gxr <= 392, 'portrait: goal spans edge-to-edge comfortably (' + fillM.gw + 'px of 390)');
    /* لمس منطقة فعلية (pointerdown/up) للتسديد باللمس */
    const tapShot = await pm.evaluate(() => {
      const z = document.querySelector('.pnz[data-d="🎯"]');
      if (!z) return false;
      const r = z.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, pointerId: 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      z.dispatchEvent(new PointerEvent('pointerdown', opts));
      z.dispatchEvent(new PointerEvent('pointerup', opts));
      return true;
    });
    ok(tapShot, 'touch-zone tap dispatches aim events');
    await bm.close();
  }
  const freeChip = await p.evaluate(() => {
    const b = document.getElementById('pnBet');
    const s = document.getElementById('pnSpecs');
    return (b && b.textContent.trim() === '' && s && s.textContent.trim() === '') ? 'empty-top' : false;
  });
  ok(freeChip !== false, 'solo top bar completely empty (free mode: no phrases, no chips)');
  const noBet = await p.evaluate(() => !!document.querySelector('#gamePageBody .bets, #gamePageBody .bet-input, #gamePageBody #GBd'));
  ok(!noBet, 'NO bet amount field in penalty UI');
  // تسديدة كاملة — الركلة تبدأ بعد شحن 460ms
  const t0 = Date.now();
  await p.evaluate(() => penShoot('↗️'));
  const flyBall = await wait(p, () => {
    const b = document.getElementById('pnBall');
    return b && (b.classList.contains('flying') || b.style.transform) ? true : false;
  }, 3000, 'ball flight');
  ok(flyBall, 'ball flight animation started (arc + spin)');
  await wait(p, () => {
    const banner = document.getElementById('pnBanner');
    return banner && banner.classList.contains('show') ? banner.textContent : false;
  }, 9000, 'pn banner');
  const flightMs = Date.now() - t0;
  const pnRes = await p.evaluate(() => ({
    banner: document.getElementById('pnBanner').textContent,
    goal: document.getElementById('pnBanner').classList.contains('goal'),
    saved: document.getElementById('pnBanner').classList.contains('saved'),
    tok: document.querySelectorAll('#pnSeq0 .pn-tok:not(.empty)').length,
    sc: document.getElementById('pnSc0').textContent,
    scOpp: document.getElementById('pnSc1').textContent,
    role0: document.getElementById('pnRole0').textContent,
    role1: document.getElementById('pnRole1').textContent,
    ripple: !!document.getElementById('pnRipple')
  }));
  ok(pnRes.banner && (pnRes.goal || pnRes.saved), 'result banner: "' + pnRes.banner + '" (' + (pnRes.goal ? 'GOAL' : 'SAVED') + ') in ' + flightMs + 'ms');
  ok(pnRes.tok >= 1, 'result token appears in player bar (✔/✕)');
  ok(pnRes.role0 && pnRes.role1, 'role badges ⚽/🧤 on both sides (turn indicated by icons, not text)');
  ok((pnRes.goal && Number(pnRes.sc) >= 1) || (pnRes.saved && Number(pnRes.sc) === 0), 'bar score reflects outcome (me ' + pnRes.sc + ' : opp ' + pnRes.scOpp + ')');
  // انتظار إعادة التهيئة
  await sleep(2400);
  const pnReset = await p.evaluate(() => ({
    bannerHidden: !document.getElementById('pnBanner').classList.contains('show'),
    gkIdle: document.getElementById('pnKeeper').classList.contains('idle'),
    ballHome: document.getElementById('pnBall').style.transform === '',
    tokens: document.querySelectorAll('#pnSeq0 .pn-tok:not(.empty)').length
  }));
  ok(pnReset.bannerHidden && pnReset.gkIdle && pnReset.ballHome, 'field reset: banner hidden, keeper idle, ball home');
  ok(pnReset.tokens >= 1, 'shot history persists in result bar after reset');
  /* تسديدة ثانية: دور التصديّ (تبادل مسدد/متصدي — v2.64) */
  await p.evaluate(() => penShoot('⬇️'));
  await sleep(1500);
  const b2 = await p.evaluate(() => document.getElementById('pnBanner') && document.getElementById('pnBanner').classList.contains('show'));
  ok(b2, 'Penalty second outcome banner shown (busy reset works)');
  await sleep(2500);
  const toks2 = await p.evaluate(() => document.querySelectorAll('#pnSeq0 .pn-tok:not(.empty)').length + document.querySelectorAll('#pnSeq1 .pn-tok:not(.empty)').length);
  ok(toks2 >= 2, 'second result token appended across bars (' + toks2 + ' tokens)');
  const roles2 = await p.evaluate(() => document.getElementById('pnRole0').textContent + '/' + document.getElementById('pnRole1').textContent);
  ok(roles2 === '🧤/⚽' || roles2 === '⚽/🧤', 'roles alternate after shot 2 (' + roles2 + ')');
  const pnBal = await p.evaluate(() => ST.gold);
  ok(isFinite(pnBal), 'wallet intact after penalty shots (free mode): ' + pnBal);

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
