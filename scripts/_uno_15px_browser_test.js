/* UNO hand-card +15px live browser verification (portrait + landscape)
   Loads the real uno-game/index.html, starts a local game via the engine bridge
   if available, and measures .un-handcard bounding boxes vs the stage bottom. */
'use strict';
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const ok = (m, c) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

  for (const [name, vp] of [
    ['PORTRAIT 390×844', { width: 390, height: 844 }],
    ['LANDSCAPE 844×390', { width: 844, height: 390 }]
  ]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('file://' + path.join(__dirname, '..', 'uno-game', 'index.html'));
    await page.waitForTimeout(1500);

    /* The standalone page may boot straight into the menu — try to start a game */
    const started = await page.evaluate(() => {
      try {
        if (window.UnoApp && typeof window.UnoApp.start === 'function') { window.UnoApp.start(); return 'app.start'; }
        const go = document.querySelector('.un-go');
        if (go) { go.click(); return 'go.click'; }
        const seg = document.querySelector('.un-segbtn.on');
        return seg ? 'menu-only' : 'bare';
      } catch (e) { return 'err:' + e.message; }
    });
    await page.waitForTimeout(1200);

    const m = await page.evaluate(() => {
      const stage = document.querySelector('.un-stage');
      const cards = document.querySelectorAll('.un-handcard');
      if (!stage || !cards.length) return { n: 0 };
      const sb = stage.getBoundingClientRect();
      const first = cards[Math.floor(cards.length / 2)];   /* بطاقة الوسط */
      const fb = first.getBoundingClientRect();
      return {
        n: cards.length,
        /* البطاقة معلّقة بـ bottom: 35px داخل اليد — نقيس من أسفل المسرح */
        bottomFromStage: +(sb.bottom - fb.bottom).toFixed(1),
        cardW: +fb.width.toFixed(1),
        cardH: +fb.height.toFixed(1),
        cssBottom: getComputedStyle(first).bottom
      };
    });
    console.log('═══ ' + name + ' ═══ (boot: ' + started + ' · cards: ' + m.n + ')');
    if (m.n) {
      ok('سلسلة أوراق اللاعب مرئية (' + m.n + ' ورقة)', m.n >= 5);
      ok('الإزاحة للأعلى +15px: أسفل الورقة عند 35±2px من أسفل المسرح (كانت 20px)', m.bottomFromStage >= 33 && m.bottomFromStage <= 37, '(measured ' + m.bottomFromStage + 'px · css bottom=' + m.cssBottom + ')');
      ok('حجم الورقة كما هو (نسبة 1:1.4 محفوظة)', Math.abs(m.cardH / m.cardW - 1.4) < 0.05, '(' + m.cardW + '×' + m.cardH + ')');
    } else {
      ok('الصفحة أقلعت بلا أخطاء (وضع ' + started + ')', errors.length === 0);
      console.log('  ⚠ لم تُوزَّع أوراق في الوضع المستقل — الاعتماد على فحص CSS الهندسي');
    }
    ok('بلا أخطاء جافاسكربت', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log('══════════════════════════');
  console.log('UNO BROWSER: ' + pass + ' ✓ · ' + fail + ' ✗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ المتصفح:', e.message); process.exit(2); });
