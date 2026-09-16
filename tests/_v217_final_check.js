/* الفحص النهائي الشامل: (1) رندا لاندسكيب 4 لاعبين — من رؤية لاعب،
   (2) القائمة القانونية في كل الصفحات الست بعد الإصلاح (بلا تكرار + الإدارة مخفية لغير الأدمن). */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(l) { pass++; console.log('  ✅ ' + l); }
function bad(l) { fail++; console.log('  ❌ ' + l); }

(async () => {
  const browser = await PW.launchBrowser();

  /* ── 1) رندا لاندسكيب 1ضد3 من منظور اللاعب ── */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 915, height: 412 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => openGame('rd'));
    await PW.wait(page, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);
    await page.click('#rdStage #mode-options .rd-mode-btn[data-shape="1v3"]');
    await page.click('#rdStage #btn-start');
    await PW.wait(page, () => document.querySelectorAll('#rdStage #hand .rd-card').length >= 3, 8000);
    await page.waitForTimeout(600);

    const geo = await page.evaluate(() => {
      const vh = window.innerHeight, vw = window.innerWidth;
      const rect = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
      const overlaps = (a, b) => !(a.bottom <= b.y || b.bottom <= a.y || a.right <= b.x || b.right <= a.x);
      const deck = rect('#rdStage .rd-deck');
      const hand = rect('#rdStage .rd-hand');
      const lh = rect('#rdStage .rd-log-handle');
      const title = rect('#rdStage .rd-bigtitle');
      const court = rect('#rdStage .rd-court');
      const bl = rect('#rdStage .rd-corner-bl');
      const stage = document.getElementById('rdStage');
      /* مواضع المقاعد الأربعة — يجب أن تكون في الزوايا الأربع */
      const corners = {};
      ['tl', 'tr', 'bl', 'br'].forEach(c => {
        const el = document.getElementById('rd-corner-' + c);
        corners[c] = el && el.children.length ? JSON.stringify((b => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }))(el.getBoundingClientRect())) : 'EMPTY';
      });
      return {
        deckBottomGap: Math.round(vh - deck.bottom),        /* أقصى أسفل: فجوة صغيرة فقط */
        deckCenter: Math.round(deck.x + deck.width / 2),    /* وسط الشاشة */
        handleAboveTitle: lh.bottom <= title.y,             /* المقبض فوق العنوان */
        courtH: Math.round(court.height),                    /* ليست منهارة */
        blInBottomLeftCorner: bl.y > vh * 0.55 && bl.x < vw * 0.3,
        deckHandOverlap: overlaps(deck, hand),
        deckHandleOverlap: overlaps(deck, lh),
        blLogOverlap: overlaps(bl, lh),
        blDeckOverlap: overlaps(bl, deck),
        corners: corners,
        rdN4: stage.classList.contains('rd-n4')
      };
    });
    console.log(JSON.stringify(geo, null, 1));
    (geo.deckBottomGap <= 10) ? ok('الرزمة بالهامش الأسفل مباشرة (فجوة ' + geo.deckBottomGap + 'px)') : bad('الرزمة ليست بالهامش الأسفل (فجوة ' + geo.deckBottomGap + 'px)');
    (Math.abs(geo.deckCenter - 915 / 2) <= 8) ? ok('الرزمة وسط الشاشة') : bad('الرزمة ليست وسطاً');
    geo.handleAboveTitle ? ok('مقبض السجل أعلى الشاشة فوق عنوان روندا') : bad('المقبض ليس فوق العنوان');
    (geo.courtH >= 60) ? ok('القاعة سليمة (' + geo.courtH + 'px)') : bad('القاعة منهارة (' + geo.courtH + 'px)');
    geo.blInBottomLeftCorner ? ok('الخصم الرابع (bl) في زاويته أسفل-يسار') : bad('bl ليس في زاويته');
    (!geo.deckHandOverlap) ? ok('لا تداخل رزمة/يد') : bad('تداخل رزمة/يد');
    (!geo.deckHandleOverlap) ? ok('لا تداخل رزمة/مقبض') : bad('تداخل رزمة/مقبض');
    (!geo.blLogOverlap && !geo.blDeckOverlap) ? ok('لا تداخل bl مع المقبض/الرزمة') : bad('bl يتداخل');
    (geo.rdN4) ? ok('وسم rd-n4 موجود (4 لاعبين)') : bad('وسم rd-n4 مفقود');
    (page._errs.length === 0) ? ok('صفر أخطاء كونسول') : bad('أخطاء: ' + page._errs.slice(0, 3).join(' | '));
    await page.screenshot({ path: '/tmp/v217-landscape-4p.png' });
    await ctx.close();
  }

  /* ── 2) القائمة القانونية في الصفحات الست ── */
  const pages = ['about', 'contact', 'privacy', 'terms', 'fairness', 'provably-fair'];
  for (const pg of pages) {
    const { page, ctx } = await PW.newPage(browser, { width: 412, height: 915 });
    await page.goto('http://localhost:4173/' + pg + '.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1100);
    const r = await page.evaluate(() => {
      const sb = document.getElementById('sidebar');
      if (!sb) return { noSidebar: true };
      const items = Array.from(sb.querySelectorAll('.nav-item')).map(a => (a.textContent || '').trim().replace(/\s+/g, ' '));
      const dup = items.filter((v, i) => items.indexOf(v) !== i);
      const nav = document.getElementById('navAdmin');
      return {
        sidebars: document.querySelectorAll('#sidebar').length,
        toolsHeaders: Array.from(sb.querySelectorAll('.side-title')).map(e => e.textContent.trim()).join(','),
        itemsCount: items.length,
        duplicates: dup,
        navAdminDefaultHidden: nav ? nav.style.display === 'none' : false,
        authJsLoaded: typeof window.renderAuthChip === 'function',
        authChipRendered: !!(document.getElementById('authChip') && document.getElementById('authChip').innerHTML.trim())
      };
    });
    if (r.noSidebar) { bad(pg + ': لا سايدبار'); await ctx.close(); continue; }
    (r.sidebars === 1) ? ok(pg + ': سايدبار واحد') : bad(pg + ': ' + r.sidebars + ' سايدبارات!');
    (r.duplicates.length === 0) ? ok(pg + ': لا بنود مكررة (' + r.itemsCount + ' بند)') : bad(pg + ': تكرار → ' + r.duplicates.join('، '));
    (r.toolsHeaders === 'الرئيسية,الأدوات') ? ok(pg + ': عنوانان فقط (الرئيسية+الأدوات)') : bad(pg + ': عناوين = ' + r.toolsHeaders);
    r.navAdminDefaultHidden ? ok(pg + ': الإدارة مخفية افتراضياً (زائر)') : bad(pg + ': الإدارة ظاهرة للزائر!');
    r.authJsLoaded ? ok(pg + ': auth.js محمّل') : bad(pg + ': auth.js غير محمّل');
    r.authChipRendered ? ok(pg + ': أيقونة المستخدم ظاهرة') : bad(pg + ': أيقونة المستخدم مفقودة!');
    await ctx.close();
  }

  await browser.close();
  console.log('\n═══ الفحص النهائي: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
