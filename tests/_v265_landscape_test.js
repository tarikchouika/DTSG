/* [v2.65] اختبار إصلاحَي اللاندسكيب:
   1) بينالتي: قصّ 35% من أسفل المرمى (منطقة تسديد) + عرض ×3 + خط عند 65% — بورتريه لا يتغيّر
   2) RPS: أزرار الاختيار والحالة مرئية بالكامل في اللاندسكيب القصير (كانت مقصوصة)
   تشغيل: node tests/_v265_landscape_test.js  (يتطلب خادماً محلياً على 3000) */
'use strict';
process.chdir(require('path').resolve(__dirname, '..'));
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t, label) {
  const s = Date.now();
  while (Date.now() - s < t) {
    try { const r = await p.evaluate(fn); if (r) return r; } catch (x) {}
    await p.waitForTimeout(150);
  }
  throw new Error('timeout [' + label + ']');
}
let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } console.log((c ? '  ✅ ' : '  ❌ ') + n); };

(async () => {
  /* ═══ أ) امتثال CSS ثابت ═══ */
  console.log('═══ 1) بينالتي لاندسكيب — CSS v2.65 ═══');
  const pnCss = fs.readFileSync('css/16-penalty.css', 'utf8');
  const gamesCss = fs.readFileSync('css/04-games.css', 'utf8');
  const land = pnCss.slice(pnCss.indexOf('(orientation: landscape)'));
  ok(/height:\s*65%/.test(land), 'goal height = 65% (35% cut from bottom → shooting zone)');
  ok(/width:\s*min\(94%,\s*calc\(clamp\(180px,\s*50vmin,\s*340px\)\s*\*\s*3\)\)/.test(land), 'goal width = 3× previous, capped 94%');
  ok(/\.pn-goalwrap\s*\{[^}]*align-items:\s*flex-start/.test(land), 'goal top-anchored (crossbar at top edge)');
  ok(/\.pn-pitch::before/.test(land) && /calc\(65%\s*-\s*1\.5px\)/.test(land), 'white shooting/ball line at 65% boundary');
  ok(/\.pn-gk\s*\{[^}]*bottom:\s*1\.5%/.test(land), 'keeper stands on the shooting line');
  ok(!/height:\s*100%;\s*aspect-ratio:\s*auto/.test(land.slice(0, 400)), 'old full-height goal geometry removed');

  console.log('═══ 2) RPS لاندسكيب — CSS v2.65 ═══');
  const rpsBlk = gamesCss.slice(gamesCss.indexOf('[v2.65] RPS'));
  ok(rpsBlk.length > 500, 'v2.65 RPS landscape block present in 04-games.css');
  ok(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*clamp\(150px,\s*24vw,\s*260px\)/.test(rpsBlk), 'two-column grid: arena + side info');
  ok(/grid-column:\s*1\s*\/\s*-1/.test(rpsBlk) && /\.rps-picks/.test(rpsBlk), 'picks row spans full width at bottom');
  ok(/@media \(orientation: landscape\) and \(max-height: 520px\)/.test(gamesCss), 'scoped to short landscape only (portrait untouched)');

  /* ═══ ب) متصفح حي ═══ */
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const errs = [];
  const mk = async (w, h) => {
    const ctx = await b.newContext({
      viewport: { width: w, height: h }, hasTouch: true, isMobile: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message.slice(0, 100)));
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => typeof openGame === 'function', 10000, 'app');
    return { ctx, p };
  };
  const rect = (p, sel) => p.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { t: +r.top.toFixed(1), b: +r.bottom.toFixed(1), l: +r.left.toFixed(1), r: +r.right.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  }, sel);

  console.log('═══ 3) بينالتي لاندسكيب 740×360 — هندسة مقاسة ═══');
  {
    const { ctx, p } = await mk(740, 360);
    await p.evaluate(() => openGame('pn'));
    await wait(p, () => !!document.querySelector('.pn-fs'), 10000, 'pn render');
    await sleep(700);
    const pitch = await rect(p, '#pnPitch');
    const gz = await rect(p, '.pn-gz');
    const ball = await rect(p, '#pnBall');
    const gk = await rect(p, '#pnKeeper');
    const line = await p.evaluate(() => {
      const st = getComputedStyle(document.getElementById('pnPitch'), '::before');
      return st.content !== 'none' ? { h: st.height, top: st.top } : null;
    });
    ok(gz && pitch && Math.abs(gz.h / pitch.h - 0.65) < 0.02, 'goal height ≈ 65% of pitch (got ' + (gz && (gz.h / pitch.h).toFixed(3)) + ')');
    ok(gz.w / pitch.w > 0.85, 'goal width ≥ 85% of pitch ≈ 3× previous 31% (got ' + (gz.w / pitch.w).toFixed(3) + ')');
    ok(Math.abs(gz.t - pitch.t) < 2, 'goal anchored at pitch top (crossbar at top edge)');
    ok(!!line, 'shooting line rendered (::before at 65%)');
    ok(gz.b < ball.t, 'ball below goal bottom — inside the shooting zone');
    ok(ball.b < pitch.b && ball.t > gz.b, 'ball fully inside shooting zone (between line and screen bottom)');
    ok(gk.b <= gz.b + 8, 'keeper feet on the shooting line (goal bottom)');
    /* دقة تسديدة في الهندسة الجديدة */
    const acc = await p.evaluate(async () => {
      const z = document.querySelector('.pnz[data-d="⬆️"]').getBoundingClientRect();
      const zc = { x: z.left + z.width / 2, y: z.top + z.height / 2 };
      penFire('⬆️');
      await new Promise(r => setTimeout(r, 900));
      const br = document.getElementById('pnBall').getBoundingClientRect();
      return { dx: Math.abs(br.left + br.width / 2 - zc.x), dy: Math.abs(br.top + br.height / 2 - zc.y) };
    });
    ok(acc.dx <= 12 && acc.dy <= 12, 'ball reaches ⬆️ zone center (Δ=' + acc.dx.toFixed(1) + ',' + acc.dy.toFixed(1) + ')');
    await p.screenshot({ path: '/home/z/my-project/download/v265_test_pn_land.png' });
    await ctx.close();
  }

  console.log('═══ 4) بينالتي بورتريه 390×780 — بلا تغيير ═══');
  {
    const { ctx, p } = await mk(390, 780);
    await p.evaluate(() => openGame('pn'));
    await wait(p, () => !!document.querySelector('.pn-fs'), 10000, 'pn2');
    await sleep(600);
    const pitch = await rect(p, '#pnPitch');
    const gz = await rect(p, '.pn-gz');
    const line = await p.evaluate(() => getComputedStyle(document.getElementById('pnPitch'), '::before').content);
    ok(Math.abs((gz.l + gz.r) / 2 - (pitch.l + pitch.r) / 2) < 2, 'portrait: goal still centered');
    ok(Math.abs(gz.h / pitch.h - 0.42) < 0.12 || gz.h > 150, 'portrait: goal keeps its portrait proportions (h=' + gz.h + ')');
    ok(line === 'none', 'portrait: NO shooting line (portrait untouched)');
    await ctx.close();
  }

  console.log('═══ 5) RPS لاندسكيب 740×360 — قابلية اللعب ═══');
  {
    const { ctx, p } = await mk(740, 360);
    await p.evaluate(() => openGame('rp'));
    await wait(p, () => !!document.querySelector('.rps-arena'), 10000, 'rp render');
    await sleep(800);
    const picks = await rect(p, '.rps-picks');
    const status = await rect(p, '#rpsResult');
    const arena = await rect(p, '.rps-arena');
    const hint = await rect(p, '.rps-hint');
    ok(picks && picks.b <= 360 && picks.t >= 0, 'picks row FULLY visible (t=' + picks.t + ' b=' + picks.b + ')');
    ok(status && status.b <= 360, 'status fully visible (b=' + status.b + ')');
    ok(arena && arena.b <= 360 && arena.t >= 0, 'arena fully visible');
    ok(hint && hint.b <= 360, 'hint visible');
    ok(arena.l < (picks ? picks.l : 9999) || Math.abs(arena.t - hint.t) < 200, 'two-column layout active (arena beside info column)');
    /* جولة فعلية: أزرار قابلة للنقر وتُنتج نتيجة */
    const played = await p.evaluate(async () => {
      document.querySelector('.rpsBtn[data-m="✊"]').click();
      await new Promise(r => setTimeout(r, 2600));
      const s = document.getElementById('rpsResult');
      const r = s.getBoundingClientRect();
      return { txt: !!(s && s.textContent), vis: r.top < window.innerHeight && r.bottom > 0 };
    });
    ok(played.txt && played.vis, 'full round playable in landscape (result text visible)');
    await p.screenshot({ path: '/home/z/my-project/download/v265_test_rp_land.png' });
    await ctx.close();
  }

  console.log('═══ 6) RPS بورتريه 390×780 — بلا تغيير ═══');
  {
    const { ctx, p } = await mk(390, 780);
    await p.evaluate(() => openGame('rp'));
    await wait(p, () => !!document.querySelector('.rps-arena'), 10000, 'rp2');
    await sleep(700);
    const disp = await p.evaluate(() => getComputedStyle(document.querySelector('.stage')).display);
    const picks = await rect(p, '.rps-picks');
    ok(disp !== 'grid', 'portrait: stage NOT grid (layout untouched)');
    ok(picks && picks.b <= 780, 'portrait: picks visible');
    await ctx.close();
  }

  ok(errs.length === 0, 'صفر أخطاء JS' + (errs.length ? ' — ' + errs[0] : ''));
  await b.close();
  console.log('\n[v2.65 landscape] ' + pass + '/' + (pass + fail) + (fail ? ' FAIL: ' + JSON.stringify(fails) : ' PASS'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
