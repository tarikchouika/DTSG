/* ═══ اختبار تخطيط البلياردو R10 — الأعمدة الطافية ═══
   لاندسكيب: الطاولة تملأ الحاوية (mid مطلق inset:0) والتدوير بالزاوية
   والقوة+الكرة البيضاء عمود أيسر وعمودا اللاعبَين تحت أيقونتي الزاوية.
   بورتريه: شبكة 3 صفوف (طاولة/شريطا لاعبين/تحكم) مع نقل العناصر. */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const browser = await PW.launchBrowser();

  /* ── لاندسكيب ── */
  console.log('── لاندسكيب 844×390 ──');
  {
    const { page } = await PW.newPage(browser, { width: 844, height: 390 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => openGame('bl8'));
    await PW.wait(page, () => !!window.BILLIARDS, 8000);
    await page.evaluate(() => billiardsStartLocal());
    await PW.wait(page, () => !!(BILLIARDS.G && BILLIARDS.G.S.phase === 'AIM'), 8000);
    await page.waitForTimeout(500);
    const d = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      const R = e => e ? e.getBoundingClientRect() : null;
      const frame = q('#blFrame');
      return {
        land: frame.classList.contains('bl-land'),
        midAbsolute: getComputedStyle(q('#blMid')).position === 'absolute',
        midFull: Math.abs(R(q('#blMid')).width - R(frame).width) <= 2 && Math.abs(R(q('#blMid')).height - R(frame).height) <= 2,
        rotInFrame: frame.contains(q('#blRotBtn')) && q('#blRotBtn').parentElement === frame,
        ctrlsInFrame: q('#blCtrls').parentElement === frame,
        trackInCtrls: q('#blCtrls').contains(q('#blCueTrack')),
        spinInCtrls: q('#blCtrls').contains(q('#blSpin')),
        uMeInRail: q('#blRail').contains(q('#blUnitMe')),
        uOppInRail: q('#blRail').contains(q('#blUnitOpp')),
        uMeAbs: getComputedStyle(q('#blUnitMe')).position === 'absolute',
        barsHidden: getComputedStyle(q('#blPortBars')).display === 'none',
        gridInline: !frame.style.gridTemplateColumns
      };
    });
    ok('bl-land على الحاوية', d.land);
    ok('bl-mid مطلق inset:0 يملأ الحاوية كاملة', d.midAbsolute && d.midFull);
    ok('زر التدوير ابن مباشر للحاوية (زاوية 0,0)', d.rotInFrame);
    ok('عمود التحكم (قوة+كرة) ابن الحاوية ويحوي الشريطين', d.ctrlsInFrame && d.trackInCtrls && d.spinInCtrls);
    ok('وحدتا اللاعبَين داخل الحاوية اليمنى وبهما تموضع مطلق', d.uMeInRail && d.uOppInRail && d.uMeAbs);
    ok('شريطا البورتريه مخفيان باللاندسكيب', d.barsHidden);
    ok('لا قوالب شبكة مضمّنة من JS (التخطيط كله CSS)', d.gridInline);
    await page.close();
  }

  /* ── بورتريه ── */
  console.log('── بورتريه 390×844 ──');
  {
    const { page } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => openGame('bl8'));
    await PW.wait(page, () => !!window.BILLIARDS, 8000);
    await page.evaluate(() => billiardsStartLocal());
    await PW.wait(page, () => !!(BILLIARDS.G && BILLIARDS.G.S.phase === 'AIM'), 8000);
    await page.waitForTimeout(500);
    const d = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      const frame = q('#blFrame');
      const R = e => e ? e.getBoundingClientRect() : null;
      const stg = R(q('#blStageBox')), bars = R(q('#blPortBars')), rail = R(q('#blRail'));
      return {
        port: frame.classList.contains('bl-port'),
        gridRows: getComputedStyle(frame).gridTemplateRows.split(' ').length >= 3,
        uOppInBar: q('#blBarOpp').contains(q('#blUnitOpp')),
        uMeInBar: q('#blBarMe').contains(q('#blUnitMe')),
        ctrlsInRail: q('#blRail').contains(q('#blCtrls')),
        order: bars.top < rail.top && stg.bottom <= bars.top + 3,
        barsFlex: getComputedStyle(q('#blPortBars')).display === 'flex'
      };
    });
    ok('bl-port على الحاوية + شبكة 3 صفوف', d.port && d.gridRows);
    ok('الخصم في الشريط الأعلى وأنا في الأسفل', d.uOppInBar && d.uMeInBar);
    ok('التحكم (كرة+قوة) داخل الشريط الأسفل', d.ctrlsInRail);
    ok('الترتيب: طاولة ثم شريطا اللاعبين ثم التحكم', d.order && d.barsFlex);
    await page.close();
  }

  /* ── التبديل حياً: بورتريه → لاندسكيب ── */
  console.log('── تبديل الاتجاه حياً ──');
  {
    const { page } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => openGame('bl8'));
    await PW.wait(page, () => !!window.BILLIARDS, 8000);
    await page.evaluate(() => billiardsStartLocal());
    await PW.wait(page, () => !!(BILLIARDS.G && BILLIARDS.G.S.phase === 'AIM'), 8000);
    await page.waitForTimeout(400);
    let cdp = null;
    try { await page.setViewportSize({ width: 844, height: 390 }); }
    catch (e) { cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
      await page.waitForTimeout(250);
      await page.evaluate(() => { dispatchEvent(new Event('resize')); blFitCanvas(); }); }
    await PW.wait(page, () => document.getElementById('blFrame').classList.contains('bl-land'), 5000);
    await page.waitForTimeout(400);
    const d1 = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      const frame = q('#blFrame');
      const R = e => e ? e.getBoundingClientRect() : null;
      return {
        land: frame.classList.contains('bl-land'),
        uMeBack: q('#blRail').contains(q('#blUnitMe')),
        ctrlsBack: q('#blCtrls').parentElement === frame,
        midFull: Math.abs(R(q('#blMid')).width - R(frame).width) <= 2,
        power: BILLIARDS.power, fillW: document.getElementById('blCueFill').style.width || 'x', fillH: document.getElementById('blCueFill').style.height
      };
    });
    ok('بعد التدوير للاندسكيب: الأعمدة عادت لوضعها الطافي', d1.land && d1.uMeBack && d1.ctrlsBack && d1.midFull);
    ok('تعتيم القوة انعكس اتجاهه (ارتفاع بدل عرض)', d1.fillH !== '' || d1.fillW === 'x');
    if (cdp) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
      await page.waitForTimeout(250);
      await page.evaluate(() => { dispatchEvent(new Event('resize')); blFitCanvas(); });
    } else { await page.setViewportSize({ width: 390, height: 844 }); }
    await PW.wait(page, () => document.getElementById('blFrame').classList.contains('bl-port'), 5000);
    await page.waitForTimeout(400);
    const d2 = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      return {
        port: q('#blFrame').classList.contains('bl-port'),
        uMeInBar: q('#blBarMe').contains(q('#blUnitMe')),
        ctrlsInRail: q('#blRail').contains(q('#blCtrls')),
        fillW: document.getElementById('blCueFill').style.width
      };
    });
    ok('بعد العودة للبورتريه: الشرائط والتحكم عادت', d2.port && d2.uMeInBar && d2.ctrlsInRail && d2.fillW !== ''); if (!(d2.port && d2.uMeInBar && d2.ctrlsInRail && d2.fillW !== '')) console.log('    ! d2 =', JSON.stringify(d2));
    await page.close();
  }

  await browser.close();
  console.log('\n═══ تخطيط R10: ' + pass + '/' + (pass + fail) + ' ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
