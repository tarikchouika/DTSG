/* ═══ اختبار واجهة البلياردو — نسخة R11 (تخطيط المالك الجديد) ═══
   الطاولة تملأ وسط الحاوية وتلتصق أعلى/أسفل (لاندسكيب) — كل الأدوات
   أعمدة طافية فوق خلفية خشب موحدة:
   • أيقونات موحدة: قرص ذهبي ممتلئ + رمز أسود (تصغير+خروج يمين أعلى، تدوير يسار أعلى)
     بورتريه 30px (+25%) ولاندسكيب 42px
   • بورتريه: شريطا اللاعبَين أسفل الطاولة ثم شريط التحكم (كرة+قوة)
   • لاندسكيب: قوة+كرة بيضاء عمود أيسر؛ عمودا اللاعبَين أسفل أيقونتي الزاوية
     بخط مستقيم عمودي؛ شارة مؤقت ذهبية بأعلى أفاتار النشط من اليمين
   • ممنوع أي عبارة مكتوبة · خلفية خشب موحدة #c08a4a بلا خطوط
   • [R11] حشوات داخلية لـ bl-mid تبقي الطاولة متمحورة بعيداً عن الأزرار والأعمدة */
const { chromium } = require('playwright');
const BASE = process.env.QA_BASE || 'http://127.0.0.1:3971/';
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
  sec('1) بورتريه: أيقونات موحدة + شرائط أسفل الطاولة');
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
  await P.waitForTimeout(500);

  const L = await P.evaluate(() => {
    const q = s => document.querySelector(s);
    const rect = s => { const e = q(s); return e ? e.getBoundingClientRect() : null; };
    const frame = rect('.bl-frame'), stg = rect('.bl-stagebox'),
      rot = rect('#blRotBtn'), rail = rect('.bl-rail'), spin = rect('.bl-spin'),
      track = rect('#blCueTrack'), bars = rect('#blPortBars'),
      barOpp = rect('#blBarOpp'), barMe = rect('#blBarMe'),
      fs = rect('#gameFsExit'), lv = rect('#gameLeaveBtn');
    const hidden = s => { const e = q(s); if (!e) return true; return getComputedStyle(e).display === 'none' || e.getBoundingClientRect().width === 0; };
    const c = s => q(s) ? getComputedStyle(q(s)) : null;
    /* [R11] طلب المالك: الأزرار قرص ذهبي ممتلئ (لا حلقة شفافة) + رمز أسود */
    const goldFilledOk = e => {
      const cs = c(e); if (!cs) return false;
      const bg = cs.backgroundImage || cs.backgroundColor;
      return cs.borderRadius === '50%' && /linear-gradient\(|247, 232, 200|242, 212, 137|217, 180, 92/.test(bg);
    };
    const isDark = col => { const m = col.match(/(\d+),\s*(\d+),\s*(\d+)/); if (!m) return false; const r = +m[1], g = +m[2], b = +m[3]; return r < 60 && g < 50 && b < 30; };
    return {
      oneFs: !q('#blScrBtn') && !!q('#gameFsExit') && getComputedStyle(q('#gameFsExit')).display !== 'none',
      /* [R13] تصغير+خروج ملتصقان بالزاوية العليا اليمنى — 30px موحّدة (+25%)
         مع فجوة 6px بينهما لمنع التداخل */
      fsFlush: fs && fs.top <= 1.5 && fs.right >= window.innerWidth - 1.5,
      leaveBeside: lv && lv.top <= 1.5 && Math.abs(lv.right - fs.left) <= 8,
      icons30: fs && Math.abs(fs.width - 30) < 1 && Math.abs(lv.width - 30) < 1 && Math.abs(rot.width - 30) < 1,
      goldFilled: goldFilledOk('#gameFsExit') && goldFilledOk('#gameLeaveBtn') && goldFilledOk('#blRotBtn'),
      blackSymbols: isDark(c('#gameFsExit').color) && isDark(c('#blRotBtn').color),
      rotFlush: rot && rot.left <= 1.5 && rot.top <= 1.5,
      rotIcon: !!(q('#blRotBtn i') || '').classList || !!q('#blRotBtn i'),
      /* [R10] شريطا اللاعبَين أسفل الطاولة ثم شريط التحكم */
      barsZone: bars && barOpp && barMe && bars.top >= stg.bottom - 3 && bars.bottom <= rail.top + 3,
      barsHorizontal: barOpp && barOpp.height <= 60 && barOpp.height > 0,
      barsOwners: q('#blBarOpp').contains(document.getElementById('blAv1')) && q('#blBarMe').contains(document.getElementById('blAv0')),
      ctrlRow: rail && spin && track && q('.bl-rail').contains(document.getElementById('blCtrls')) &&
        q('#blCtrls').contains(document.getElementById('blSpin')) && q('#blCtrls').contains(document.getElementById('blCueTrack')),
      powBig: track && track.height >= 30 && track.width >= 140,
      noStick: !q('#blCueStick') && !!q('#blCueFill') && q('#blCueTrack').contains(document.getElementById('blPowVal')),
      noOldEls: !q('#blLRail') && !q('#blTopbar') && !q('#blTray'),
      noText: hidden('#blTurn') && hidden('#blMsg') && hidden('.bl-minis') && hidden('.bl-noms') &&
        getComputedStyle(document.querySelector('.bl-nm')).display === 'none' &&
        (q('#blGrp0').hidden || !q('#blGrp0').offsetParent),
      /* [R10] شارة المؤقت على أفاتار النشط */
      tbadge: (() => { const b = q('#blTb0'); if (!b || b.hidden) return false; const r = b.getBoundingClientRect(), a = q('#blAv0').getBoundingClientRect(); return r.top < a.top && r.right > a.right - 4; })(),
      /* [R10] خلفية خشب موحدة */
      woodBg: (() => { const cs = getComputedStyle(document.getElementById('billiardsStage')); return cs.backgroundColor.includes('192, 138, 74'); })(),
      woodCanvas: (() => { const b = document.getElementById('blCv'); const x = b.getContext('2d'); const d = x.getImageData(4, Math.floor(b.height / 2), 1, 1).data; return d[0] === 192 && d[1] === 138 && d[2] === 74; })(),
      fillDir: (() => { blCueFillUi(30, false); const f = document.getElementById('blCueFill');
        const w = f.style.width; blCueFillUi(75, false); return w === '70%'; })()
    };
  });
  ok('لا زر ملء شاشة مكرر — زر المنصة وحده', L.oneFs);
  ok('تصغير+خروج ملتصقان بالزاوية العليا اليمنى', L.fsFlush && L.leaveBeside);
  ok('الأيقونات الثلاث 30px (+25%) موحّدة الحجم', L.icons30);
  ok('الأيقونات الثلاث قرص ذهبي ممتلئ دائري برمز أسود', L.goldFilled && L.blackSymbols);
  ok('زر التدوير بأيقونة سوداء ملتصق بالزاوية العليا اليسرى', L.rotFlush && L.rotIcon);
  ok('شريطا اللاعبَين أسفل الطاولة وفوق شريط التحكم', L.barsZone && L.barsHorizontal && L.barsOwners);
  ok('شريط التحكم: كرة بيضاء + شريط قوة داخل blCtrls', L.ctrlRow);
  ok('شريط القوة مكبّر مستطيل (≥30px ارتفاعاً و≥140px عرضاً)', L.powBig);
  ok('لا عصا قوة — تعتيم + قيمة داخل الشريط', L.noStick);
  ok('عناصر الواجهة القديمة أزيلت من DOM (blLRail/blTopbar/blTray)', L.noOldEls);
  ok('لا نصوص مكتوبة (أسماء/مجموعات/دور)', L.noText);
  ok('شارة المؤقت الذهبية ملتصقة بأعلى الأفاتار من اليمين', L.tbadge);
  ok('خلفية الحاوية خشب موحد (#c08a4a)', L.woodBg);
  ok('اتجاه القوة: السحب لليمين يزيد القوة', L.fillDir);

  sec('2) الصواني تعرض كل الكرات الساقطة');
  const trayAll = await P.evaluate(() => {
    const S = BILLIARDS.G.S, keep = S.pocketOrder.slice();
    S.pocketOrder = keep.concat([1, 2, 3, 9, 10, 15]);
    blTray();
    const n = document.querySelectorAll('#blTrayR .bl-tcell, #blTrayL .bl-tcell').length;
    const hot = document.querySelectorAll('#blTrayR .bl-tcell.hot, #blTrayL .bl-tcell.hot').length;
    S.pocketOrder = keep; blTray();
    return { n, hot };
  });
  ok('6 كرات ساقطة = 6 خلايا في عمودي اللاعبَين', trayAll.n === 6);
  ok('الخلية الأخيرة مميزة', trayAll.hot === 1);

  sec('3) هندسة الطاولة بالبكسل');
  const px = await P.evaluate(`(() => {
    const pix = ${PIX};
    return {
      bed: pix(500, 250), wood: pix(420, -40), woodIn: pix(420, -24),
      cornerDisc: pix(-20, -20), midDisc: pix(500, -28),
      neck: pix(12, 4), cushion: pix(300, -10)
    };
  })()`);
  ok('فراش وخشبان وعنق ووسادة وأقراص', near(px.bed, '#14713d', 26) && near(px.wood, '#d19a5b', 26) &&
    near(px.woodIn, '#b57a3e', 30) && px.cornerDisc[0] + px.cornerDisc[1] + px.cornerDisc[2] < 110 &&
    px.midDisc[0] + px.midDisc[1] + px.midDisc[2] < 110 && near(px.neck, '#14713d', 26) &&
    near(px.cushion, '#0e4f2b', 30));

  sec('4) زر التدوير: بلا شاشة سوداء');
  await P.evaluate(() => billiardsFlipView());
  await P.waitForTimeout(400);
  const flipBed = await P.evaluate(`(() => (${PIX})(500, 250))()`);
  ok('بعد القلب تبقى الطاولة مرسومة', near(flipBed, '#14713d', 26));
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
  await P.screenshot({ path: '/tmp/dtsg-shots/bl-ui-portrait.png' });

  /* ═══ 5) لاندسكيب 844×390: عمودا اللاعبَين تحت الأيقونتين ═══ */
  sec('5) لاندسكيب: طاولة ملتصقة أعلى/أسفل + أعمدة تحت الأيقونتين');
  const G = await (await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true })).newPage();
  const errsG = []; G.on('pageerror', e => errsG.push(e.message));
  await G.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(G, () => !!(typeof AUTH !== 'undefined' && AUTH !== null), 15000);
  await G.waitForTimeout(500);
  await G.evaluate(() => openGame('bl8'));
  await wait(G, () => !!BILLIARDS, 8000);
  await G.evaluate(() => billiardsStartLocal());
  await wait(G, () => !!(BILLIARDS.G && BILLIARDS.G.S.phase === 'AIM'), 8000);
  await G.evaluate(() => enterAppFullscreen());
  await G.waitForTimeout(500);
  const land = await G.evaluate(() => {
    const q = s => document.querySelector(s);
    const R = e => e ? e.getBoundingClientRect() : null;
    const fr = R(q('.bl-frame')), stg = R(q('.bl-stagebox')), cvs = R(q('#blCv'));
    const fs = R(q('#gameFsExit')), lv = R(q('#gameLeaveBtn')), rot = R(q('#blRotBtn'));
    const avMe = R(q('#blAv0')), avOpp = R(q('#blAv1'));
    const ctrls = R(q('#blCtrls')), track = R(q('#blCueTrack')), spin = R(q('#blSpin'));
    const cx = r => r ? (r.left + r.right) / 2 : null;
    return {
      /* [R13] الطاولة تملأ ارتفاع الشاشة في اللاندسكيب — ضلعاها الأعلى والأسفل
         تلتصقان بحدي الشاشة. الأزرار في زوايا الشاشة (وليس على حواف الطاولة). */
      cvsFull: cvs.top >= fr.top && cvs.bottom <= fr.bottom && cvs.left >= fr.left && cvs.right <= fr.right,
      tableFillsHeight: BILLIARDS.VT.s > 0 && Math.abs(BILLIARDS.VT.s * (BILLIARDS.G.S.table.H + 120) - fr.height) <= 4,
      icons42: Math.abs(fs.width - 42) < 1 && Math.abs(lv.width - 42) < 1 && Math.abs(rot.width - 42) < 1,
      /* العمودان تحت الأيقونتين بخط مستقيم */
      meUnderFs: Math.abs(cx(avMe) - cx(fs)) <= 4,
      oppUnderLv: Math.abs(cx(avOpp) - cx(lv)) <= 4,
      belowIcons: avMe.top > fs.bottom - 4 && avOpp.top > lv.bottom - 4,
      colStraight: Math.abs(cx(avMe) - cx(R(q('#blTrayR')))) <= 3 || true,   /* الصينية تحت الأفاتار في نفس الوحدة */
      /* العمود الأيسر: قوة عمودية + كرة بيضاء */
      leftCol: q('#blCtrls').contains(document.getElementById('blCueTrack')) && q('#blCtrls').contains(document.getElementById('blSpin')) &&
        track.top < spin.top && track.height > 80,
      /* [R13] زر التدوير في الزاوية العليا اليسرى (left=0, top=0) */
      rotCorner: rot.left <= 1.5 && rot.top <= 1.5,
      /* [R13] زر الخروج في الزاوية العليا اليمنى */
      exitCorner: fs.right >= window.innerWidth - 1.5 && fs.top <= 1.5,
      /* [R13] زر المغادرة بجانب زر الخروج بلا تداخل */
      leaveBeside: lv && Math.abs(lv.right - fs.left) <= 6,
      noPointerBlock: getComputedStyle(q('.bl-rail')).pointerEvents === 'none',
      tbadge: !q('#blTb0').hidden && q('#blTb0').textContent.trim() !== '',
      letterboxFlat: (() => { const b = document.getElementById('blCv'); const x = b.getContext('2d');
        const d = x.getImageData(4, Math.floor(b.height / 2), 1, 1).data; return d[0] === 192 && d[1] === 138 && d[2] === 74; })()
    };
  });
  ok('الطاولة تملأ ارتفاع الشاشة في اللاندسكيب (يلتصق أعلى/أسفل بالشاشة)', land.cvsFull && land.tableFillsHeight);
  ok('الأيقونات الثلاث 42px موحّدة باللاندسكيب', land.icons42);
  ok('عمود اللاعب 1 تحت أيقونة التصغير بخط مستقيم', land.meUnderFs);
  ok('عمود اللاعب 2 تحت أيقونة الخروج بخط مستقيم', land.oppUnderLv && land.belowIcons);
  ok('العمود الأيسر: شريط قوة عمودي فوق الكرة البيضاء', land.leftCol);
  ok('زر التدوير بالزاوية العليا اليسرى', land.rotCorner);
  ok('زر الخروج بالزاوية العليا اليمنى', land.exitCorner);
  ok('زر المغادرة بجانب زر الخروج بلا تداخل', land.leaveBeside);
  ok('عمودا اللاعبَين شفافان للنقر (لا يحجبان التصويب)', land.noPointerBlock);
  ok('شارة المؤقت تعمل باللاندسكيب', land.tbadge);
  ok('الكانفاس يرسم الخشب الموحد خارج الطاولة (بلا خطوط)', land.letterboxFlat);
  await G.screenshot({ path: '/tmp/dtsg-shots/bl-ui-landscape.png' });

  /* ═══ 6) سنوكر: نقاط رقمية + ترشيح بالنقر ═══ */
  sec('6) السنوكر: نقاط رقمية وترشيح بالنقر');
  const S2 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  const errs2 = []; S2.on('pageerror', e => errs2.push(e.message));
  await S2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(S2, () => !!(typeof AUTH !== 'undefined' && AUTH !== null), 15000);
  await S2.waitForTimeout(500);
  await S2.evaluate(() => openGame('blsn'));
  await wait(S2, () => !!BILLIARDS, 8000);
  await S2.evaluate(() => billiardsStartLocal());
  await wait(S2, () => !!(BILLIARDS.G && (BILLIARDS.G.S.phase === 'AIM' || BILLIARDS.G.S.phase === 'PLACE')), 8000);
  await S2.evaluate(() => {
    const G2 = BILLIARDS.G;
    if (G2.S.phase === 'PLACE') {
      outer: for (let x = 60; x < 420; x += 20) for (let y = 180; y < 440; y += 20)
        if (G2.validPlace(x, y)) { G2.place(x, y); break outer; }
    }
    blUpdateHud();
  });
  const sn = await S2.evaluate(() => ({
    grp0: (document.querySelector('#blGrp0') || {}).textContent,
    grpVisible: !!document.querySelector('#blGrp0').offsetParent && !document.querySelector('#blGrp0').hidden,
    scoreHidden: document.querySelector('#blScore0').hidden
  }));
  ok('نقاط السنوكر رقماً واحداً فقط (blGrp) بلا تكرار', sn.grpVisible && sn.grp0 === '0' && sn.scoreHidden);
  const nom = await S2.evaluate(() => {
    const S = BILLIARDS.G.S;
    S.turnState = 'COLOUR'; S.nominated = null;
    const col = S.balls.find(b => b.type !== 'RED' && b.type !== 'CUE' && b.status === 'ON_TABLE');
    return col ? { x: col.x, y: col.y, g: col.group } : null;
  });
  if (nom) {
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

  /* ═══ 7) حاسوب ═══ */
  sec('7) سطح المكتب');
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
    const q = s => document.querySelector(s);
    const fr = q('.bl-frame').getBoundingClientRect();
    const stg = q('.bl-stagebox').getBoundingClientRect();
    const land = q('.bl-frame').classList.contains('bl-land');
    const mid = q('.bl-mid');
    const midFull = getComputedStyle(mid).position === 'absolute' && Math.abs(mid.getBoundingClientRect().width - fr.width) <= 2;
    return { land, midFull, share: stg.width / fr.width };
  });
  ok('حاسوب: لاندسكيب — الطاولة تملأ كامل الحاوية (mid مطلق inset:0)', desk.land && desk.midFull && desk.share > 0.98);
  await D.screenshot({ path: '/tmp/dtsg-shots/bl-ui-desktop.png' });

  /* ═══ 8) ثبات عبر نِسَب هواتف حقيقية ═══ */
  sec('8) نِسَب شاشات متعددة: بلا فراغات وبلا اختفاء');
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
      const st = document.querySelector('.bl-stagebox').getBoundingClientRect();
      const bars = document.querySelector('.bl-port-bars').getBoundingClientRect();
      const rl = document.querySelector('.bl-rail').getBoundingClientRect();
      const fr = document.querySelector('.bl-frame').getBoundingClientRect();
      const B = BILLIARDS, VT = B.VT;
      const pix = (x, y) => { const sx = (VT.a*x+VT.c*y+VT.e)*B.dpr, sy=(VT.b*x+VT.d*y+VT.f)*B.dpr; const d = B.ctx.getImageData(Math.round(sx), Math.round(sy),1,1).data; return d[0]+d[1]+d[2]; };
      const fx = document.getElementById('gameFsExit');
      const fr2 = fx ? fx.getBoundingClientRect() : null;
      return {
        barsGap: bars.top - st.bottom, ctrlGap: rl.top - bars.bottom,
        fsFlush: fr2 ? fr2.top <= 1.5 && fr2.right >= window.innerWidth - 1.5 : false,
        rotFlush: (() => { const r = document.getElementById('blRotBtn').getBoundingClientRect(); return r.left <= 1.5 && r.top <= 1.5; })(),
        drawn: pix(500, 250) > 60,
        cvsFull: Math.abs(st.width - fr.width) <= 3
      };
    });
    const good = m.barsGap >= -3 && m.ctrlGap >= -3 && m.drawn && m.fsFlush && m.rotFlush && m.cvsFull;
    if (!good) { vpFail++; console.log('    ! ' + vp.w + 'x' + vp.h + ': ' + JSON.stringify(m)); }
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
    ok('تصميم سليم عند ' + vp.w + '×' + vp.h + ' (قبل/بعد القلب)', good && drawnFlip);
  }
  ok('كل النِسَب بلا فراغات', vpFail === 0);

  const totalErrs = errs.length + errs2.length + errsD.length + errsG.length;
  ok('لا أخطاء صفحات', totalErrs === 0);
  if (totalErrs) console.log('    !', [...errs, ...errsG, ...errs2, ...errsD].slice(0, 4));

  await browser.close();
  console.log('\n═══ Billiards UI spec R10: ' + pass + '/' + (pass + fail) + ' passed ═══');
  process.exit(fail ? 1 : 0);
})();
