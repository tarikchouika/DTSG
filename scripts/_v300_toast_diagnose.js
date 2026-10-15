/* تشخيص [بلاغ المالك 2026-10-15 الثالث] — عبارة «أونو!» (إشعار un-toast)
   عند الضغط على زر أونو (ورقتان بيد اللاعب) محشورة فوق أيقونة اللاعب الجالس
   في الأعلى في البورتريه.
   قياس هندسي حي (قاعدة 33): يقلع بالصفحة الحقيقية، يبدأ مباراة 1v1 عبر المحرك،
   يضبط الحالة على «ورقتان بيد اللاعب ودوره»، ثم يضغط زر أونو الحقيقي #unUnoBtn
   (المسار نفسه الذي سلكه المالك: _doUno → _toast(un.unoCalled, gold))
   ويقيم تداخل فقاعة الإشعار مع: لوحة المقعد العلوي (.un-av الدائرية + العدّاد)
   وسلسلة أوراق الخصم (.un-stack) وHUD الوسط.
   التشخيص فقط — لا يعدّل شيئا. يعمل من داخل DTSG (يحتاج playwright). */
'use strict';
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const [name, vp] of [
    ['PORTRAIT 360×800 (جهاز المالك: 1080×2400 على DPR3)', { width: 360, height: 800 }],
    ['PORTRAIT 390×844', { width: 390, height: 844 }],
    ['PORTRAIT 320×568 (أضيق هاتف شائع)', { width: 320, height: 568 }],
    ['PORTRAIT 360×640 (قصير)', { width: 360, height: 640 }],
    ['PORTRAIT 768×1024 (لوح)', { width: 768, height: 1024 }],
    ['LANDSCAPE 800×390', { width: 800, height: 390 }]
  ]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('file://' + path.join(__dirname, '..', 'uno-game', 'index.html'));
    await page.waitForTimeout(1200);

    /* إقلاع: القائمة ثم بدء مباراة 1v1 حقيقية عبر تطبيق أونو */
    const boot = await page.evaluate(() => {
      try {
        const app = window.UnoApp;
        if (!app) return 'no-app';
        app.config = app.config || {};
        app.config.mode = '1v1';
        app.config.level = 1;
        app.config.target = 500;
        app.startMatch();
        return app.config.mode;
      } catch (e) { return 'err:' + e.message; }
    });
    await page.waitForTimeout(900);

    /* ضبط الحالة على سيناريو المالك بالضبط: ورقتان بيد اللاعب (المقعد 0)،
       دوره، لم يعلن أونو بعد — عبر المحرك الحي ثم إشعار التطبيق بالتغيير */
    const armed = await page.evaluate(() => {
      const NS = window.UNGameNS, app = window.UnoApp;
      const s = NS.st;
      if (!s) return 'no-state';
      while (s.hands[0].length > 2) s.hands[0].pop();          /* ورقتان فقط */
      s.turn = 0; s.phase = 'play'; s.drawn = null;
      s.unoCalled[0] = false; s.unoNeeded[0] = false;
      /* إسقاط أوراق كافية من يد الخصم ليبقى المشهد هادئا كما في لقطة المالك */
      while (s.hands.length > 1 && s.hands[1] && s.hands[1].length > 6) s.hands[1].pop();
      app.tick && app.tick();                                   /* إعادة رسم */
      const btn = document.getElementById('unUnoBtn');
      return btn && !btn.hidden ? 'armed' : 'btn-hidden';
    });

    /* الضغط على زر أونو الحقيقي — مسار المالك نفسه */
    let clickPath = 'not-clicked';
    if (armed === 'armed') {
      await page.click('#unUnoBtn');
      await page.waitForTimeout(350);
      clickPath = 'clicked';
    }

    /* القياس الهندسي: الفقاعة مقابل عناصر المقعد العلوي والوسط */
    const m = await page.evaluate(() => {
      const g = (id) => { const el = document.getElementById(id); return el ? el.getBoundingClientRect() : null; };
      const toast = document.getElementById('unToast');
      const plate = g('unPlate2'), av = g('unName2'), count = g('unCount2');
      const seatTop = document.querySelector('.un-seat-top');
      const stack = seatTop ? seatTop.querySelector('.un-stack') : null;
      const hud = document.querySelector('.un-hud');
      if (!toast || !plate || !av) return { have: false };
      const tb = toast.getBoundingClientRect();
      const r = (b) => ({ top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), left: +b.left.toFixed(1), right: +b.right.toFixed(1), h: +b.height.toFixed(1) });
      const overlap = (a, b) => !(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left);
      const ov = (a, b) => {
        if (!overlap(a, b)) return null;
        const t = Math.max(a.top, b.top), bo = Math.min(a.bottom, b.bottom);
        return { top: +t.toFixed(1), bottom: +bo.toFixed(1), depth: +(bo - t).toFixed(1) };
      };
      const cs = getComputedStyle(toast);
      return {
        have: true, toastText: toast.textContent, toastClass: toast.className,
        cssTop: cs.top, z: cs.zIndex,
        toast: r(tb),
        plate: r(plate.getBoundingClientRect ? plate : plate), av: r(av), count: r(count),
        stack: stack ? r(stack.getBoundingClientRect()) : null,
        hud: hud ? r(hud.getBoundingClientRect()) : null,
        overlapAv: ov(tb, av), overlapCount: ov(tb, count.getBoundingClientRect ? count : count),
        overlapPlate: ov(tb, plate),
        overlapHud: hud ? ov(tb, hud.getBoundingClientRect()) : null,
        gapBelowPlate: +(tb.top - plate.bottom).toFixed(1),
        gapAboveHud: hud ? +(hud.getBoundingClientRect().top - tb.bottom).toFixed(1) : null,
        gapAboveAv: +(tb.bottom <= av.top ? (av.top - tb.bottom) : -(tb.top - av.bottom)).toFixed(1),
        visible: !toast.hidden && tb.height > 0
      };
    });

    results.push({ name, vp, boot, armed, clickPath, m, errors });
    await ctx.close();
  }
  await browser.close();

  for (const r of results) {
    console.log('════════════════════════════════════════════');
    console.log('▣ ' + r.name + '  (boot=' + r.boot + ' · armed=' + r.armed + ' · ' + r.clickPath + ')');
    if (!r.m || !r.m.have) { console.log('  ⚠ لم يكتمل القياس: ' + JSON.stringify(r.m)); continue; }
    const m = r.m;
    console.log('  الفقاعة un-toast: نص="' + m.toastText + '" · class="' + m.toastClass + '" · css top=' + m.cssTop + ' · z=' + m.z);
    console.log('    صندوقها: ' + JSON.stringify(m.toast));
    console.log('  المقعد العلوي: stack=' + (m.stack ? JSON.stringify(m.stack) : '—') + ' · plate=' + JSON.stringify(m.plate));
    console.log('    أيقونة .un-av: ' + JSON.stringify(m.av) + ' · العدّاد: ' + JSON.stringify(m.count));
    console.log('  HUD الوسط: ' + (m.hud ? JSON.stringify(m.hud) : '—'));
    console.log('  التداخل مع الأيقونة .un-av: ' + (m.overlapAv ? '❌ عمقه ' + m.overlapAv.depth + 'px (' + m.overlapAv.top + '..' + m.overlapAv.bottom + ')' : '✅ لا تداخل'));
    console.log('  التداخل مع العدّاد الذهبي: ' + (m.overlapCount ? '❌ عمقه ' + m.overlapAv.depth + 'px' : '✅ لا تداخل'));
    console.log('  التداخل مع اللوحة كاملة: ' + (m.overlapPlate ? '❌ ' + JSON.stringify(m.overlapPlate) : '✅ لا تداخل'));
    console.log('  التداخل مع HUD الوسط: ' + (m.overlapHud ? '❌ ' + JSON.stringify(m.overlapHud) : '✅ لا تداخل'));
    console.log('  الفجوات: تحت اللوحة ' + m.gapBelowPlate + 'px · فوق HUD ' + (m.gapAboveHud === null ? '—' : m.gapAboveHud + 'px') + ' (سلبية = تداخل)');
    console.log('  أخطاء الصفحة: ' + (r.errors.length ? r.errors.join(' | ') : 'بلا'));
  }
  console.log('════════════════════════════════════════════');
  console.log('JSON=' + JSON.stringify(results, null, 1));
})();
