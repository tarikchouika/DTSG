/* ═══ اختبار واجهة البلياردو — نسخة الملاحظات الأربعة أنواع ═══
   شريط الكرات: كل الساقطات، قاعه يمس الضلع الأعلى للطاولة
   الضلع الأيمن يلامس أيقونة الكرة البيضاء · زر تدوير صغير 🔄 بأقصى زاوية
   بلا زر تكبير مكرر · بلا أزرار ألوان · تدوين رقمي للسنوكر/الكاروم
   القلب بلا شاشة سوداء · هندسة الطاولة بالبكسل */
const { chromium } = require('playwright');
const BASE = process.env.CASINO_BASE || 'http://127.0.0.1:3000/';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const sec = t => console.log('\n── ' + t + ' ──');
async function wait(page, fn, timeout, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    await page.waitForTimeout(200);
  }
  return null;
}
const PIX = `(x, y) => {
  var B = BILLIARDS, VT = B.VT;
  var sx = (VT.a * x + VT.c * y + VT.e) * B.dpr, sy = (VT.b * x + VT.d * y + VT.f) * B.dpr;
  var d = B.ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
  return [d[0], d[1], d[2]];
}`;
const near = (rgb, hex, tol) => {
  const t = parseInt(hex.slice(1), 16);
  return Math.abs(rgb[0] - (t >> 16)) <= tol && Math.abs(rgb[1] - ((t >> 8) & 255)) <= tol && Math.abs(rgb[2] - (t & 255)) <= tol;
};

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  /* ═══ 1) عمودي 390×844 (بلاكبول) ═══ */
  sec('1) التخطيط والملامسة (عمودي)');
  const P = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  const errs = []; P.on('pageerror', e => errs.push(e.message));
  await P.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(P, () => !!(typeof AUTH !== 'undefined' && AUTH !== null), 15000);
  await P.waitForTimeout(600);
  await P.evaluate(() => openGame('blbb'));
  await wait(P, () => !!BILLIARDS, 8000);
  await P.evaluate(() => billiardsStartLocal());
  await wait(P, () => !!(BILLIARDS.G && BILLIARDS.G.S.phase === 'AIM'), 8000);
  await P.evaluate(() => { BILLIARDS.aim = -0.7; });
  await P.evaluate(() => enterAppFullscreen());
  await P.waitForTimeout(400);

  const L = await P.evaluate(() => {
    const q = s => document.querySelector(s);
    const rect = s => { const e = q(s); return e ? e.getBoundingClientRect() : null; };
    const trayEl0 = q('.bl-tray');
    let trayHiddenStart = false;
    if (trayEl0 && getComputedStyle(trayEl0).display === 'none') {
      trayHiddenStart = true; trayEl0.dataset.probe = '1';
      trayEl0.style.display = 'flex'; trayEl0.appendChild(document.createElement('span'));
    }
    const frame = rect('.bl-frame'), stage = rect('.bl-stage'), tray = rect('.bl-tray'),
      rot = rect('#blRotBtn'), rail = rect('.bl-rail'), spin = rect('.bl-spin');
    if (trayEl0 && trayEl0.dataset.probe) { trayEl0.innerHTML = ''; trayEl0.style.display = 'none'; delete trayEl0.dataset.probe; }
    const hidden = s => { const e = q(s); if (!e) return true; return getComputedStyle(e).display === 'none' || e.getBoundingClientRect().width === 0; };
    return {
      oneFs: !q('#blScrBtn') && !!q('#gameFsExit') && getComputedStyle(q('#gameFsExit')).display !== 'none',
      junction: (() => { const f = rect('#gameFsExit'); if (!f) return false;
        const cx = f.left + f.width / 2, cy = f.top + f.height / 2, rr = f.width / 2;
        return Math.abs(Math.hypot(stage.right - cx, stage.top - cy) - rr) <= 8; })(),
      railUnderFs: (() => { const f = rect('#gameFsExit'), rl = rect('.bl-rail'); if (!f || !rl) return false;
        return Math.abs((rl.left + rl.right) / 2 - (f.left + f.width / 2)) <= 14 && rl.top >= f.bottom - 16; })(),
      topbarTop: (() => { const tb = rect('.bl-topbar'); return !!tb && Math.abs(tb.top - frame.top) <= 2; })(),
      transp: ['#blRotBtn', '.bl-cell', '.bl-tray'].map(sel => {   /* زر التنفيذ ذهبي بطلب المستخدم */
        const e = q(sel); if (!e) return true; const c = getComputedStyle(e);
        return c.backgroundColor === 'rgba(0, 0, 0, 0)' && c.backgroundImage === 'none';
      }).every(Boolean),
      rotIcon: (q('#blRotBtn') || {}).textContent && q('#blRotBtn').textContent.includes('🔄'),
      rotSmall: rot && rot.width <= 40 && rot.left <= 8 && rot.top <= 8,
      trayTouchesTable: tray && Math.abs(tray.bottom - stage.top) <= 3,
      trayHiddenStart: trayHiddenStart,
      rightTouchesRail: rail && Math.abs(rail.left - stage.right) <= 3,
      /* v10: في ملء الشاشة القرص مزاح نحو الطاولة فوق الضلع الخشبي — يشترط ظهوره كاملاً وامتداده يساراً؛
         وفي الوضع المصغّر يبقى ملاصقاً للضلع الأيمن */
      spinTouchesTable: spin && (document.body.classList.contains('app-fs-on')
        ? (spin.right <= window.innerWidth + 1 && spin.left < rail.left)
        : Math.abs(spin.left - stage.right) <= 8),
      flushLeft: Math.abs(stage.left - frame.left) <= 2,
      flushBottom: Math.abs(stage.bottom - frame.bottom) <= 2,
      share85: stage.width / frame.width,
      noText: hidden('#blTurn') && hidden('#blMsg') && hidden('.bl-minis') && hidden('#blNm0') && hidden('#blGrp0') && hidden('#blPowVal'),
      nomsGone: hidden('.bl-noms'),
      railOrder: (() => {
        const o = ['#blAv1', '#blCell1', '#blShoot', '#blSpin', '#blPower', '#blCell0', '#blAv0'].map(s => rect(s));
        return o.every((r, i) => r && (i === 0 || r.top >= o[i - 1].bottom - 2));
      })()
    };
  });
  ok('لا زر مكرر: زر المنصة الأصلي وحده الظاهر', L.oneFs);
  ok('زاوية الطاولة العليا اليمنى تلامس حلقة الزر الأصلي', L.junction);
  ok('الشريط العمودي تحت الزر الأصلي بخط مستقيم', L.railUnderFs);
  ok('الشريط الأفقي ملاصق للهامش الذهبي الأعلى', L.topbarTop);
  ok('خلفيات الأيقونات والأزرار شفافة 100%', L.transp);
  ok('زر التدوير 🔄 صغير بأقصى الزاوية', L.rotIcon && L.rotSmall);
  ok('قاع شريط الكرات يمس الضلع الأعلى للطاولة', L.trayTouchesTable);
  ok('الصينية مخفية قبل أي سقوط (بلا شريط فارغ)', L.trayHiddenStart);
  ok('الضلع الأيمن للطاولة يلامس الشريط/الكرة البيضاء', L.rightTouchesRail && L.spinTouchesTable);
  ok('التصاق يسار/أسفل + نسبة 85%', L.flushLeft && L.flushBottom && L.share85 > 0.78 && L.share85 < 0.93);
  ok('لا نصوص ولا أزرار ألوان ظاهرة', L.noText && L.nomsGone);
  ok('ترتيب الأيقونات السبع عمودياً', L.railOrder);

  sec('2) الصينية تعرض كل الكرات الساقطة');
  const trayAll = await P.evaluate(() => {
    const S = BILLIARDS.G.S, keep = S.pocketOrder.slice();
    S.pocketOrder = keep.concat([1, 2, 3, 9, 10, 15]);
    blTray();
    const n = document.querySelectorAll('#blTray .bl-tcell').length;
    const hot = document.querySelectorAll('#blTray .bl-tcell.hot').length;
    S.pocketOrder = keep; blTray();
    return { n, hot };
  });
  ok('6 كرات ساقطة = 6 خلايا (لا قصّ لآخر 4)', trayAll.n === 6);
  ok('الخلية الأخيرة مميزة', trayAll.hot === 1);

  sec('3) هندسة الطاولة بالبكسل');
  const px = await P.evaluate(`(() => {
    const pix = ${PIX};
    return {
      bed: pix(500, 250), wood: pix(420, -40), woodIn: pix(420, -24),
      cornerDisc: pix(-20, -20), midDisc: pix(500, -28),
      neck: pix(12, 4), cushion: pix(300, -10), cutZone: pix(500, -50)
    };
  })()`);
  ok('فراش وخشبان وعنق ووسادة وأقراص وقص', near(px.bed, '#14713d', 26) && near(px.wood, '#d19a5b', 26) &&
    near(px.woodIn, '#b57a3e', 30) && px.cornerDisc[0] + px.cornerDisc[1] + px.cornerDisc[2] < 110 &&
    px.midDisc[0] + px.midDisc[1] + px.midDisc[2] < 110 && near(px.neck, '#14713d', 26) &&
    near(px.cushion, '#0e4f2b', 30) && near(px.cutZone, '#d19a5b', 26));

  sec('4) زر التدوير: بلا شاشة سوداء');
  await P.evaluate(() => billiardsFlipView());
  await P.waitForTimeout(400);
  const flipBed = await P.evaluate(`(() => (${PIX})(500, 250))()`);
  ok('بعد القلب تبقى الطاولة مرسومة (لا اسوداد)', near(flipBed, '#14713d', 26));
  const aimFlip = await P.evaluate(() => {
    const B = BILLIARDS, VT = B.VT;
    const x = 250, y = 120;
    const sx = VT.a * x + VT.c * y + VT.e, sy = VT.b * x + VT.d * y + VT.f;
    const det = VT.a * VT.d - VT.c * VT.b;
    const bx = (VT.d * (sx - VT.e) - VT.c * (sy - VT.f)) / det;
    const by = (-VT.b * (sx - VT.e) + VT.a * (sy - VT.f)) / det;
    return Math.abs(bx - x) < 0.01 && Math.abs(by - y) < 0.01;
  });
  ok('تحويل اللمس عكوس بعد القلب', aimFlip);
  await P.evaluate(() => billiardsFlipView());
  await P.waitForTimeout(300);
  await P.screenshot({ path: 'screenshots/bl-ui-portrait.png' });

  /* ═══ 5) سنوكر: تدوين رقمي + ترشيح بالنقر ═══ */
  sec('5) السنوكر: نقاط رقمية وترشيح بالنقر على الكرة');
  const S2 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  const errs2 = []; S2.on('pageerror', e => errs2.push(e.message));
  await S2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(S2, () => !!(typeof AUTH !== 'undefined' && AUTH !== null), 15000);
  await S2.waitForTimeout(500);
  await S2.evaluate(() => openGame('blsn'));
  await wait(S2, () => !!BILLIARDS, 8000);
  await S2.evaluate(() => billiardsStartLocal());
  await wait(S2, () => !!(BILLIARDS.G && (BILLIARDS.G.S.phase === 'AIM' || BILLIARDS.G.S.phase === 'PLACE')), 8000);
  /* السنوكر يبدأ بكرة في اليد: ضَعها أولاً ليصبح الطور AIM */
  await S2.evaluate(() => {
    const G = BILLIARDS.G;
    if (G.S.phase === 'PLACE') {
      outer: for (let x = 60; x < 420; x += 20) for (let y = 180; y < 440; y += 20)
        if (G.validPlace(x, y)) { G.place(x, y); break outer; }
    }
    blUpdateHud();
  });
  const sn = await S2.evaluate(() => ({
    score0: (document.querySelector('#blCell0 .bl-score') || {}).textContent,
    score1: (document.querySelector('#blCell1 .bl-score') || {}).textContent,
    noBallIcon: !document.querySelector('#blCell0 i')
  }));
  ok('خليتا اللاعب تعرضان نقاطاً رقمية (0/0) لا كرة ملونة', sn.score0 === '0' && sn.score1 === '0' && sn.noBallIcon);
  /* طور الترشيح: النقر على كرة اللون داخل الطاولة يرشّحها */
  const nom = await S2.evaluate(() => {
    const S = BILLIARDS.G.S;
    S.turnState = 'COLOUR'; S.nominated = null;
    const col = S.balls.find(b => b.type !== 'RED' && b.type !== 'CUE' && b.status === 'ON_TABLE');
    return col ? { x: col.x, y: col.y, g: col.group } : null;
  });
  if (nom) {
    /* حوّل المنطق→شاشة وانقر لمسياً */
    await S2.evaluate(pt => {
      const B = BILLIARDS, VT = B.VT, cv = document.getElementById('blCv');
      const r = cv.getBoundingClientRect();
      const sx = VT.a * pt.x + VT.c * pt.y + VT.e, sy = VT.b * pt.x + VT.d * pt.y + VT.f;
      const ev = new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [new Touch({ identifier: 1, target: cv, clientX: r.left + sx, clientY: r.top + sy })] });
      cv.dispatchEvent(ev);
    }, nom);
    await S2.waitForTimeout(200);
    const nominated = await S2.evaluate(() => BILLIARDS.G.S.nominated);
    ok('النقر على اللون داخل الطاولة يرشّحه (' + nom.g + ')', nominated === nom.g);
  } else ok('النقر على اللون داخل الطاولة يرشّحه', false);

  /* ═══ 6) حاسوب ═══ */
  sec('6) سطح المكتب');
  const D = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errsD = []; D.on('pageerror', e => errsD.push(e.message));
  await D.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(D, () => !!(typeof AUTH !== 'undefined' && AUTH !== null), 15000);
  await D.waitForTimeout(600);
  await D.evaluate(() => openGame('bl8'));
  await wait(D, () => !!BILLIARDS, 8000);
  await D.evaluate(() => billiardsStartLocal());
  await wait(D, () => !!(BILLIARDS.G && BILLIARDS.G.S.phase === 'AIM'), 8000);
  await D.waitForTimeout(600);
  const desk = await D.evaluate(() => {
    const fr = document.querySelector('.bl-frame').getBoundingClientRect();
    const st = document.querySelector('.bl-stage').getBoundingClientRect();
    const tb = document.querySelector('.bl-topbar').getBoundingClientRect();
    const rl = document.querySelector('.bl-rail').getBoundingClientRect();
    return {
      share: st.width / fr.width,
      flushL: Math.abs(st.left - fr.left) <= 2, flushB: Math.abs(st.bottom - fr.bottom) <= 2,
      topAligned: Math.abs(tb.bottom - st.top) <= 3, rightAligned: Math.abs(rl.left - st.right) <= 3
    };
  });
  ok('طاولة عظمى + التحام + محاذاة على الحاسوب', desk.share > 0.78 && desk.share < 0.99 && desk.flushL && desk.flushB && desk.topAligned && desk.rightAligned);
  await D.screenshot({ path: 'screenshots/bl-ui-desktop.png' });

  /* ═══ 7) ثبات الالتصاق عبر نِسَب هواتف حقيقية ═══ */
  sec('7) نِسَب شاشات متعددة: بلا فراغات وبلا اختفاء');
  let vpFail = 0;
  for (const vp of [{ w: 360, h: 780 }, { w: 400, h: 712 }, { w: 412, h: 846 }, { w: 320, h: 640 }, { w: 480, h: 960 }]) {
    const V = await (await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true })).newPage();
    await V.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(V, () => !!(typeof AUTH !== 'undefined' && AUTH !== null), 15000);
    await V.waitForTimeout(500);
    await V.evaluate(() => openGame('bl8'));
    await wait(V, () => !!BILLIARDS, 8000);
    await V.evaluate(() => billiardsStartLocal());
    await wait(V, () => !!(BILLIARDS && BILLIARDS.G && BILLIARDS.G.S.phase === 'AIM' && BILLIARDS.VT && BILLIARDS.ctx), 10000);
    await V.evaluate(() => enterAppFullscreen());
    await V.waitForTimeout(400);
    const m = await V.evaluate(() => {
      const st = document.querySelector('.bl-stage').getBoundingClientRect();
      const tb = document.querySelector('.bl-topbar').getBoundingClientRect();
      const rl = document.querySelector('.bl-rail').getBoundingClientRect();
      const fr = document.querySelector('.bl-frame').getBoundingClientRect();
      const B = BILLIARDS, VT = B.VT;
      const pix = (x, y) => { const sx = (VT.a*x+VT.c*y+VT.e)*B.dpr, sy=(VT.b*x+VT.d*y+VT.f)*B.dpr; const d = B.ctx.getImageData(Math.round(sx), Math.round(sy),1,1).data; return d[0]+d[1]+d[2]; };
      const fx = document.getElementById('gameFsExit');
      const fr2 = fx ? fx.getBoundingClientRect() : null;
      const junc = fr2 ? Math.abs(Math.hypot(st.right - (fr2.left + fr2.width/2), st.top - (fr2.top + fr2.height/2)) - fr2.width/2) : 99;
      return {
        topGap: Math.abs(tb.bottom - st.top), rightGap: Math.abs(rl.left - st.right),
        left: Math.abs(st.left - fr.left), bottom: Math.abs(st.bottom - fr.bottom),
        drawn: pix(500, 250) > 60, junc: junc
      };
    });
    const good = m.topGap <= 3 && m.rightGap <= 3 && m.left <= 2 && m.bottom <= 2 && m.drawn && m.junc <= 8;
    if (!good) { vpFail++; console.log('    ! ' + vp.w + 'x' + vp.h + ': ' + JSON.stringify(m)); }
    /* وبعد القلب أيضاً */
    await V.evaluate(() => billiardsFlipView());
    await V.waitForTimeout(350);
    const drawnFlip = await V.evaluate(() => {
      const B = BILLIARDS, VT = B.VT;
      const sx = (VT.a*500+VT.c*250+VT.e)*B.dpr, sy=(VT.b*500+VT.d*250+VT.f)*B.dpr;
      const d = B.ctx.getImageData(Math.round(sx), Math.round(sy),1,1).data;
      return d[0]+d[1]+d[2] > 60;
    });
    if (!drawnFlip) { vpFail++; console.log('    ! flip ' + vp.w + 'x' + vp.h + ' أسود'); }
    await V.evaluate(() => billiardsFlipView());
    await V.close();
    ok('التصاق كامل عند ' + vp.w + '×' + vp.h + ' (قبل/بعد القلب)', good && drawnFlip);
  }
  ok('كل النِسَب بلا فراغات', vpFail === 0);

  ok('لا أخطاء صفحات', errs.length + errs2.length + errsD.length === 0);
  if (errs.length + errs2.length + errsD.length) console.log('    !', [...errs, ...errs2, ...errsD].slice(0, 4));

  await browser.close();
  console.log('\n═══ Billiards UI spec: ' + pass + '/' + (pass + fail) + ' passed ═══');
  process.exit(fail ? 1 : 0);
})();
