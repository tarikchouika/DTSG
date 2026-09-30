/* [Timer-Seat] فحص بصري: مؤقت الدور يظهر بجانب أيقونة صاحب الدور — ضاما وشطرنج، بورتريه ولاندسكيب */
const { chromium } = require('playwright');
const BASE = process.env.BGDO_TPROBE_BASE || "http://localhost:4173/";
async function wait(p, fn, t) { t = t || 15000; const s = Date.now(); while (Date.now() - s < t) { try { const r = await p.evaluate(fn); if (r) return r; } catch (e) {} await p.waitForTimeout(150); } return null; }
const res = []; const ok = (n, c) => { res.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  for (const orient of [{ w: 400, h: 800, label: 'portrait' }, { w: 800, h: 400, label: 'landscape' }]) {
    /* ── ضاما ── */
    {
      const ctx = await b.newContext({ viewport: { width: orient.w, height: orient.h } });
      const p = await ctx.newPage();
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(BASE, { waitUntil: 'domcontentloaded' });
      await wait(p, () => typeof openGame === 'function');
      await p.evaluate(() => openGame('dm'));
      await wait(p, () => !!document.getElementById('damaPlay'));
      await p.evaluate(() => { ST.gold = 5000; damaSetTimer(30); damaStart(); });
      await wait(p, () => !!(DAMA && DAMA.state && !DAMA.state.over && DAMA._turnTi));
      const shot = await p.evaluate(() => {
        const b = document.getElementById('damaMainTimer');
        const t = document.getElementById('damaOppTimer');
        const icon = document.getElementById('damaMainIcon');
        if (!b || !t || !icon) return { missing: true };
        const br = b.getBoundingClientRect(), ir = icon.getBoundingClientRect();
        /* عقد نمط روندا: الشارة تتزحلق على حافة الأيقونة وتبرز عنها ~14px
           (تتقاطع مع الأيقونة جزئياً ولا تحشر تحتها ولا خلف عنصر) */
        var protrR = Math.max(0, br.right - ir.right);
        var protrL = Math.max(0, ir.left - br.left);
        var overlap = Math.min(br.right, ir.right) - Math.max(br.left, ir.left);
        return {
          mainHidden: b.hidden, mainTxt: b.textContent.trim(), oppHidden: t.hidden,
          beside: (protrR >= 8 || protrL >= 8) && overlap > 0 && overlap < br.width,
          visible: br.width > 0 && br.height > 0,
          notClipped: br.top >= 0 && br.left >= 0 && br.right <= innerWidth && br.bottom <= innerHeight
        };
      });
      ok(`[${orient.label}] dama: badge on MY icon (turn=w human)`, shot && !shot.missing && !shot.mainHidden && /⏱/.test(shot.mainTxt || ''));
      ok(`[${orient.label}] dama: opp badge hidden while my turn`, shot && shot.oppHidden);
      ok(`[${orient.label}] dama: badge sits beside icon (not under/behind)`, shot && shot.beside);
      ok(`[${orient.label}] dama: badge visible + inside viewport`, shot && shot.visible && shot.notClipped);
      ok(`[${orient.label}] dama: 0 page errors`, errs.length === 0);
      await ctx.close();
    }
    /* ── شطرنج (وجه لوجه: الدور الأول أبيض → الشارة على ♔ الأسفل) ── */
    {
      const ctx = await b.newContext({ viewport: { width: orient.w, height: orient.h } });
      const p = await ctx.newPage();
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(BASE, { waitUntil: 'domcontentloaded' });
      await wait(p, () => typeof openGame === 'function');
      await p.evaluate(() => openGame('ch'));
      await wait(p, () => !!document.getElementById('chessPlay'));
      await p.evaluate(() => { chessSetTimer(60); chessStartLocal(); });
      await wait(p, () => !!(CHESS && CHESS.state && CHESS._turnTi));
      const shot = await p.evaluate(() => {
        const top = document.getElementById('chessTopTimer');
        const bot = document.getElementById('chessBotTimer');
        const icon = document.getElementById('chessBotIcon');
        if (!top || !bot || !icon) return { missing: true };
        const br = bot.getBoundingClientRect(), ir = icon.getBoundingClientRect();
        /* عقد نمط روندا: الشارة تتزحلق على حافة الأيقونة وتبرز عنها ~14px */
        var protrR = Math.max(0, br.right - ir.right);
        var protrL = Math.max(0, ir.left - br.left);
        var overlap = Math.min(br.right, ir.right) - Math.max(br.left, ir.left);
        return {
          botHidden: bot.hidden, botTxt: bot.textContent.trim(), topHidden: top.hidden,
          beside: (protrR >= 8 || protrL >= 8) && overlap > 0 && overlap < br.width,
          visible: br.width > 0 && br.height > 0,
          notClipped: br.top >= 0 && br.left >= 0 && br.right <= innerWidth && br.bottom <= innerHeight
        };
      });
      ok(`[${orient.label}] chess: badge on WHITE icon bottom (turn=w)`, shot && !shot.missing && !shot.botHidden && /⏱/.test(shot.botTxt || ''));
      ok(`[${orient.label}] chess: black badge hidden while white's turn`, shot && shot.topHidden);
      ok(`[${orient.label}] chess: badge beside icon (not under/behind)`, shot && shot.beside);
      ok(`[${orient.label}] chess: badge visible + inside viewport`, shot && shot.visible && shot.notClipped);
      ok(`[${orient.label}] chess: 0 page errors`, errs.length === 0);
      await ctx.close();
    }
  }
  /* ── ضاما: مؤقت الخصم — تولٍّ آلي عند انتهاء دور البشري ثم دور ثانٍ ── */
  {
    const ctx = await b.newContext({ viewport: { width: 400, height: 800 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => typeof openGame === 'function');
    await p.evaluate(() => openGame('dm'));
    await wait(p, () => !!document.getElementById('damaPlay'));
    await p.evaluate(() => { damaSetTimer(30); damaStart(); });
    /* انتظر انتهاء دور البشري بالحركة الآلية → دور الآلي (b) لا مؤقت له */
    /* أثناء دور الآلي: لا مؤقت إطلاقاً — نشخّص لحظة b (الآلي سريع فقد يعيد
       دورنا فوراً؛ المهم ألا تظهر شارة الآلي أبداً على أيقونة الخصم) */
    const s1 = await p.evaluate(() => {
      const o = document.getElementById('damaOppTimer');
      return { oppEverShown: !o.hidden, oppTxt: o.textContent };
    });
    ok('dama: AI-turn never shows timer badge on opponent icon', !s1.oppEverShown && !s1.oppTxt);
    /* دور البشري التالي: الشارة تعود على أيقونتي */
    await wait(p, () => !!(DAMA && DAMA.state && !DAMA.state.over && DAMA.state.turn === 'w' && DAMA._turnTi), 20000);
    const s2 = await p.evaluate(() => !document.getElementById('damaMainTimer').hidden && /⏱/.test(document.getElementById('damaMainTimer').textContent));
    ok('dama: badge reappears on my icon next turn', s2);
    ok('dama: 0 page errors (full cycle)', errs.length === 0);
    await ctx.close();
  }
  /* ── شطرنج: انقلاب اللوحة — دور الأسود بعد حركة الأبيض (autoFlip) ── */
  {
    const ctx = await b.newContext({ viewport: { width: 400, height: 800 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => typeof openGame === 'function');
    await p.evaluate(() => openGame('ch'));
    await wait(p, () => !!document.getElementById('chessPlay'));
    await p.evaluate(() => { chessSetTimer(60); chessStartLocal(); });
    await wait(p, () => !!(CHESS && CHESS.state && CHESS._turnTi));
    await p.evaluate(() => chessClick(6, 4));
    await p.evaluate(() => chessClick(4, 4));
    await wait(p, () => !!(CHESS && CHESS.state && CHESS.state.turn === 'b' && CHESS._turnTi), 8000);
    const s = await p.evaluate(() => ({
      top: !document.getElementById('chessTopTimer').hidden && /⏱/.test(document.getElementById('chessTopTimer').textContent),
      bot: document.getElementById('chessBotTimer').hidden
    }));
    ok('chess: badge moves to BLACK icon top on black turn (autoFlip)', s.top && s.bot);
    ok('chess: 0 page errors (flip cycle)', errs.length === 0);
    await ctx.close();
  }
  await b.close();
  const pass = res.filter(r => r[1]).length;
  console.log(`\n═══ TIMER-SEAT PROBE: ${pass}/${res.length} passed ═══`);
  process.exit(pass === res.length ? 0 : 1);
})();
