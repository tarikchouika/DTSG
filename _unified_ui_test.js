/* ═══ اختبار موحّد: ملء الشاشة (app-fs) + الاتجاهان + قصّ المحتوى + الهوية ═══
   يغطّي: ظهور زر البدء وأزرار التحكم وصف الرهان (لا قصّ)، ضاما وبارشيسي،
   بورتريه ولاندسكيب، والهوية البنية/الذهبية للمسرح وسجل الجولات. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t = 12000) {
  const s = Date.now(); let e;
  while (Date.now() - s < t) {
    try { const r = await p.evaluate(fn); if (r) return r; } catch (x) { e = x; }
    await p.waitForTimeout(150);
  }
  throw new Error('timeout' + (e ? ' ' + e.message : ''));
}
(async () => {
  let pass = 0, total = 0;
  const ok = (label, cond) => { total++; if (cond) { pass++; console.log('  ✓ ' + label); } else { console.log('  ✗ ' + label); } };

  async function mkPage(ctx, name) {
    await ctx.request.post(BASE + 'api/register', { data: { username: name + Date.now().toString().slice(-5), password: 'pw123456' } });
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
    await p.evaluate(() => { if (typeof ST !== 'undefined') ST.gold = 50000; });
    return p;
  }

  /* ═══ أ) ضاما بورتريه عادي: كل العناصر ظاهرة بلا قصّ ═══ */
  {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 780, isMobile: true, hasTouch: true }, isMobile: true, hasTouch: true });
    const p = await mkPage(ctx, 'unA');
    await p.evaluate(() => openGame('dm'));
    await wait(p, () => !!document.getElementById('damaSetup') && !document.getElementById('damaSetup').hidden);
    const m1 = await p.evaluate(() => {
      const go = document.getElementById('damaGo');
      const r = go.getBoundingClientRect();
      return { vis: r.bottom <= innerHeight && r.top >= 0, bottom: Math.round(r.bottom), ih: innerHeight };
    });
    ok('ضاما/بورتريه: زر «ابدأ المباراة» ظاهر كاملاً', m1.vis);
    await p.evaluate(() => damaStart());
    await wait(p, () => { const b = document.getElementById('damaBoard'); return b && b.children.length === 64; });
    await sleep(400);
    const m2 = await p.evaluate(() => {
      const body = document.getElementById('gamePageBody');
      const bt = body.getBoundingClientRect();
      const vis = id => { const el = document.getElementById(id); if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= bt.top - 2 && r.bottom <= bt.bottom + 2 && r.height > 0; };
      const board = document.getElementById('damaBoard').getBoundingClientRect();
      const ctrls = document.querySelector('.dama-ctrls').getBoundingClientRect();
      const bet = document.getElementById('GBd');
      const betR = bet ? bet.getBoundingClientRect() : null;
      return {
        boardIn: board.top >= bt.top - 2 && board.bottom <= bt.bottom + 2,
        ctrlsIn: ctrls.top >= bt.top - 2 && ctrls.bottom <= bt.bottom + 2,
        betVis: !!betR && betR.bottom <= bt.bottom + 2,
        square: Math.abs(board.width - board.height) <= 2
      };
    });
    ok('ضاما/بورتريه: اللوحة كاملة داخل الشاشة ومربعة', m2.boardIn && m2.square);
    ok('ضاما/بورتريه: أزرار التحكم (قلب/استسلام/جديدة) ظاهرة', m2.ctrlsIn);
    ok('ضاما/بورتريه: صف الرهان ظاهر — يمكن دخول جولة', m2.betVis);
    await b.close();
  }

  /* ═══ ب) ضاما وبارشيسي في وضع الشاشة الممتلئة (app-fs) ═══ */
  {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 780, isMobile: true, hasTouch: true }, isMobile: true, hasTouch: true });
    const p = await mkPage(ctx, 'unB');
    await p.evaluate(() => openGame('dm'));
    await wait(p, () => !!document.getElementById('damaSetup') && !document.getElementById('damaSetup').hidden);
    await sleep(450);   /* الفتح يدخل وضع الملء تلقائياً */
    const fs1 = await p.evaluate(() => {
      const pg = document.getElementById('pg-game');
      const stage = document.getElementById('damaStage');
      const r = stage.getBoundingClientRect();
      const go = document.getElementById('damaGo').getBoundingClientRect();
      return { fs: pg.classList.contains('app-fs'), fill: Math.abs(r.bottom - innerHeight) <= 3 && Math.abs(r.top) <= 3, goVis: go.bottom <= innerHeight };
    });
    ok('ضاما/ملء الشاشة: المسرح يملأ الشاشة تماماً', fs1.fs && fs1.fill);
    ok('ضاما/ملء الشاشة: زر البدء ظاهر', fs1.goVis);
    await p.evaluate(() => damaStart());
    await wait(p, () => { const b = document.getElementById('damaBoard'); return b && b.children.length === 64; });
    await sleep(400);
    const fs2 = await p.evaluate(() => {
      const board = document.getElementById('damaBoard').getBoundingClientRect();
      const ctrls = document.querySelector('.dama-ctrls').getBoundingClientRect();
      const bet = document.getElementById('GBd');
      const betR = bet ? bet.getBoundingClientRect() : null;
      return { boardIn: board.bottom <= innerHeight + 2, ctrlsIn: ctrls.bottom <= innerHeight + 2, betVis: !!betR && betR.bottom <= innerHeight + 2 };
    });
    ok('ضاما/ملء الشاشة: اللوحة وأزرار التحكم وصف الرهان ظاهرة', fs2.boardIn && fs2.ctrlsIn && fs2.betVis);
    /* إعادة الدخول بعد الخروج: لا إزاحة تقصّ الأسفل */
    await p.evaluate(() => toggleGameFullscreen());   /* خروج */
    await sleep(350);
    const ex = await p.evaluate(() => {
      const pg = document.getElementById('pg-game');
      const stage = document.getElementById('damaStage');
      const r = stage.getBoundingClientRect();
      const body = document.getElementById('gamePageBody').getBoundingClientRect();
      const head = document.querySelector('#pg-game .gp-head');
      return { out: !pg.classList.contains('app-fs'), headVis: !!head && head.offsetHeight > 0, inBody: Math.abs(r.bottom - body.bottom) <= 3, inVp: Math.abs(body.bottom - innerHeight) <= 3 };
    });
    ok('ضاما/الخروج من الملء: المسرح يملأ جسم الصفحة حتى أسفل الشاشة', ex.out && ex.headVis && ex.inBody && ex.inVp);
    await p.evaluate(() => toggleGameFullscreen());   /* إعادة دخول */
    await sleep(400);
    const re = await p.evaluate(() => {
      const stage = document.getElementById('damaStage');
      const r = stage.getBoundingClientRect();
      const bet = document.getElementById('GBd');
      const betR = bet ? bet.getBoundingClientRect() : null;
      return { fill: Math.abs(r.top) <= 3 && Math.abs(r.bottom - innerHeight) <= 3, betVis: !!betR && betR.bottom <= innerHeight + 2 };
    });
    ok('ضاما/إعادة الدخول: يملأ الشاشة من الحافة للحافة وصف الرهان ظاهر', re.fill && re.betVis);
    await b.close();
  }

  /* ═══ ج) بارشيسي ملء الشاشة + الخروج ═══ */
  {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 780, isMobile: true, hasTouch: true }, isMobile: true, hasTouch: true });
    const p = await mkPage(ctx, 'unC');
    await p.evaluate(() => openGame('pr'));
    await wait(p, () => !!document.getElementById('parchisiSetup'));
    await sleep(450);   /* الفتح يدخل وضع الملء تلقائياً */
    const m = await p.evaluate(() => {
      const g = document.getElementById('parchisiSetup');
      const r = g.getBoundingClientRect();
      const start = g.querySelector('.big');
      const sr = start ? start.getBoundingClientRect() : null;
      return { fill: Math.abs(r.bottom - innerHeight) <= 3 && Math.abs(r.top) <= 3, startVis: !!sr && sr.bottom <= innerHeight };
    });
    ok('بارشيسي/ملء الشاشة: الحاوية تملأ الشاشة وزر البدء ظاهر', m.fill && m.startVis);
    await p.evaluate(() => ParchisiApp.start());
    await wait(p, () => { const g = document.getElementById('parchisiGame'); return g && g.style.display !== 'none'; });
    await sleep(700);
    const m2 = await p.evaluate(() => {
      const cv = document.getElementById('parchisiCanvas').getBoundingClientRect();
      const dice = document.getElementById('parchisiDiceRow');
      const dr = dice ? dice.getBoundingClientRect() : null;
      /* [B5] شريط الرسائل وكلمة الدور والمؤقت وزر التلقائي أُزيلوا عمداً */
      const clean = !document.getElementById('parchisiMessage') && !document.getElementById('parchisiTurnLabel') && !document.getElementById('parchisiTimer') && !document.getElementById('parchisiAutoBtn');
      return { boardIn: cv.bottom <= innerHeight + 2 && cv.top >= -2, diceIn: !dr || dr.bottom <= innerHeight + 2, clean, square: Math.abs(cv.width - cv.height) <= 2 };
    });
    ok('بارشيسي/ملء الشاشة: اللوحة مربعة وكاملة + النرد ظاهر والشريط نظيف', m2.boardIn && m2.diceIn && m2.clean && m2.square);
    await b.close();
  }

  /* ═══ د) لاندسكيب: كل شيء يتأقلم ═══ */
  {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 780, height: 390 }, isMobile: true, hasTouch: true });
    const p = await mkPage(ctx, 'unD');
    await p.evaluate(() => openGame('dm'));
    await wait(p, () => !!document.getElementById('damaSetup') && !document.getElementById('damaSetup').hidden);
    await p.evaluate(() => damaStart());
    await wait(p, () => { const b = document.getElementById('damaBoard'); return b && b.children.length === 64; });
    await sleep(450);
    const m = await p.evaluate(() => {
      const board = document.getElementById('damaBoard').getBoundingClientRect();
      const ctrls = document.querySelector('.dama-ctrls').getBoundingClientRect();
      const bet = document.getElementById('GBd');
      const betR = bet ? bet.getBoundingClientRect() : null;
      const go = document.getElementById('damaStatus').getBoundingClientRect();
      return { boardIn: board.bottom <= innerHeight + 2 && board.width > 80, ctrlsIn: ctrls.bottom <= innerHeight + 2, betVis: !!betR && betR.bottom <= innerHeight + 2, stIn: go.bottom <= innerHeight + 2 };
    });
    ok('ضاما/لاندسكيب: اللوحة والأزرار وصف الرهان ظاهرة', m.boardIn && m.ctrlsIn && m.betVis && m.stIn);
    await p.evaluate(() => openGame('pr'));
    await wait(p, () => !!document.getElementById('parchisiSetup'));
    await p.evaluate(() => ParchisiApp.start());
    await wait(p, () => { const g = document.getElementById('parchisiGame'); return g && g.style.display !== 'none'; });
    await sleep(700);
    const m2 = await p.evaluate(() => {
      const cv = document.getElementById('parchisiCanvas').getBoundingClientRect();
      /* [B5] شريط الرسائل أُزيل عمداً — نقيس صف النرد وزر الرمي */
      const dr = document.getElementById('parchisiDiceRow').getBoundingClientRect();
      return { boardIn: cv.bottom <= innerHeight + 2 && cv.width > 80, diceIn: dr.bottom <= innerHeight + 2, square: Math.abs(cv.width - cv.height) <= 2 };
    });
    ok('بارشيسي/لاندسكيب: اللوحة مربعة وصف النرد ظاهر', m2.boardIn && m2.diceIn && m2.square);
    await b.close();
  }

  /* ═══ هـ) الهوية الموحدة: مسرح لعبة أخرى + سجل الجولات ═══ */
  {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 780, isMobile: true, hasTouch: true }, isMobile: true, hasTouch: true });
    const p = await mkPage(ctx, 'unE');
    await p.evaluate(() => openGame('bj'));
    await wait(p, () => { const b = document.getElementById('gamePageBody'); return b && b.querySelector('.stage'); });
    await sleep(500);
    const th = await p.evaluate(() => {
      const stage = document.querySelector('#gamePageBody .stage');
      const cs = getComputedStyle(stage);
      const ghist = document.querySelector('#pg-game.active .ghist');
      const gs = ghist ? getComputedStyle(ghist) : null;
      const goldish = c => { const m = c.match(/\d+/g); if (!m) return false; const [r, g, bl] = m.map(Number); return r > 140 && r > bl + 30; };
      const brownBg = c => { const m = c.match(/\d+/g); if (!m) return false; const [r, g, bl] = m.map(Number); return r > 25 && r < 100 && r > bl + 8; };
      return {
        goldBorder: goldish(cs.borderTopColor),
        brownBg: brownBg(cs.backgroundColor) || cs.backgroundImage.includes('63, 40, 20') || cs.backgroundImage.includes('#3f2814'),
        radius0: parseFloat(cs.borderTopLeftRadius) === 0,
        ghistGold: !!gs && goldish(gs.borderTopColor)
      };
    });
    ok('هوية/بلاكجاك: المسرح بإطار ذهبي وزوايا قائمة', th.goldBorder && th.radius0);
    ok('هوية/بلاكجاك: خلفية المسرح خشبية', th.brownBg);
    ok('هوية/سجل الجولات: حاوية بحدود ذهبية', th.ghistGold);
    await b.close();
  }

  console.log('\\nالنتيجة: ' + pass + '/' + total);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
