/* تحقق شامل لجولة 2FA/واتساب/النصائح — متصفح حقيقي */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(l) { pass++; console.log('  ✅ ' + l); }
function bad(l) { fail++; console.log('  ❌ ' + l); }

(async () => {
  const browser = await PW.launchBrowser();

  /* ── 1) الرئيسية: QR يُحمَّل (CSP يسمح) + صندوق الدخول مخفي افتراضياً + الحالة تتحدث ── */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 412, height: 915 });
    await PW.gotoGamePage(page);
    /* دخول بحساب ثم تفعيل 2FA فعلياً عبر الواجهة */
    /* [Sec v2.27] كلمة بذر player من البيئة — تُقرأ في Node وتُمرر وسيطاً (لا process في المتصفح) */
    const SEED_PW = process.env.DM_SEED_USER_PW || 'RoyalCoin@User1';
    const lg = await page.evaluate(async (pw) => {
      const r = await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'player', password: pw }) });
      const j = await r.json().catch(() => null);
      return !!(j && j.user);
    }, SEED_PW);
    if (!lg) { bad('دخول player فشل — تحقق من الخادم التجريبي'); } else ok('دخول player');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await PW.wait(page, () => !!(window.AUTH && window.AUTH.user), 8000);

    /* الحالة بعد authRestore: زر التفعيل يعكس حالة 2FA الفعلية */
    await page.waitForTimeout(600);
    const st1 = await page.evaluate(() => ({
      twofaEnabled: !!(window.AUTH.user && window.AUTH.user.twofaEnabled),
      enableBtnVisible: (() => { const b = document.getElementById('btnEnable2fa'); return b ? getComputedStyle(b).display !== 'none' : false; })(),
      loginBoxDisplay: (() => { const b = document.getElementById('twofaLoginBox'); return b ? b.style.display : 'missing'; })()
    }));
    console.log('  [حالة 2FA للمستخدم]', JSON.stringify(st1));
    (st1.loginBoxDisplay === 'none') ? ok('صندوق رمز الدخول مخفي افتراضياً (لا ازدواجية)') : bad('صندوق الدخول ظاهر افتراضياً!');

    /* فتح نافذة التفعيل والتحقق من تحميل QR فعلياً (naturalWidth > 0) */
    await page.evaluate(() => { if (typeof nav === 'function') nav('account', null); });
    await page.waitForTimeout(300);
    const enabledAlready = st1.twofaEnabled;
    if (!enabledAlready) {
      await page.click('#btnEnable2fa');
      await PW.wait(page, () => {
        const q = document.getElementById('twofaQr');
        return q && q.src && q.src.indexOf('qrserver') !== -1;
      }, 8000);
      await PW.wait(page, () => { const q = document.getElementById('twofaQr'); return q && q.complete && q.naturalWidth > 0; }, 10000);
      const qr = await page.evaluate(() => {
        const q = document.getElementById('twofaQr');
        return { loaded: q.complete && q.naturalWidth > 0, w: q.naturalWidth };
      });
      (qr.loaded) ? ok('QR محمّل فعلياً (' + qr.w + 'px) — CSP يسمح به') : bad('QR لم يُحمّل');
      /* خانة واحدة للرمز داخل النافذة (بلا صندوق الدخول) */
      const cnt = await page.evaluate(() => {
        const vis = (id) => { const el = document.getElementById(id); return el && el.offsetParent !== null && getComputedStyle(el).display !== 'none'; };
        return { code: vis('twofaCode'), loginCode: vis('twofaLoginCode'), loginBox: vis('twofaLoginBox') };
      });
      (cnt.code && !cnt.loginCode && !cnt.loginBox) ? ok('نافذة التفعيل: خانة رمز واحدة فقط') : bad('ازدواجية: ' + JSON.stringify(cnt));
      await page.screenshot({ path: '/tmp/2fa-enable-modal.png' });
      /* إغلاق النافذة بلا تفعيل (نبقي الحالة كما هي للاختبار) */
      await page.evaluate(() => closeTwofaModal());
    } else {
      /* مفعلة أصلاً: الزر يجب أن يكون مخفياً والحالة ظاهرة */
      (!st1.enableBtnVisible) ? ok('مفعلة: زر التفعيل مخفي بعد authRestore') : bad('مفعلة لكن زر التفعيل ما زال ظاهراً!');
      const lb = await page.evaluate(() => { const b = document.getElementById('twofaLoginBox'); return b ? getComputedStyle(b).display : 'missing'; });
      (lb === 'none') ? ok('مفعلة: لا صندوق دخول ظاهر') : bad('مفعلة: صندوق دخول ظاهر! display=' + lb);
    }
    (page._errs.length === 0) ? ok('صفر أخطاء كونسول') : bad('أخطاء: ' + page._errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  /* ── 2) واتساب العائم: الرئيسية ظاهر، داخل لعبة مخفي، القانونية ظاهر ── */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 412, height: 915 });
    await PW.gotoGamePage(page);
    await page.waitForTimeout(500);
    const home = await page.evaluate(() => {
      const f = document.getElementById('waFab');
      return { exists: !!f, visible: f ? (getComputedStyle(f).display !== 'none' && f.getBoundingClientRect().height > 0) : false };
    });
    (home.exists && home.visible) ? ok('الرئيسية: أيقونة واتساب عائمة ظاهرة') : bad('الرئيسية: الأيقونة غير ظاهرة');
    const href = await page.evaluate(() => { const f = document.getElementById('waFab'); return f ? f.href : ''; });
    (/212706865019/.test(href)) ? ok('رابط واتساب الرسمي الصحيح') : bad('رابط خاطئ: ' + href);

    /* دخول لعبة → مخفية */
    await page.evaluate(() => openGame('hl'));
    await PW.wait(page, () => document.body.classList.contains('pg-game'), 8000);
    const inGame = await page.evaluate(() => {
      const f = document.getElementById('waFab');
      return f ? getComputedStyle(f).display === 'none' : true;
    });
    (inGame) ? ok('داخل اللعبة: الأيقونة مخفية (pg-game)') : bad('داخل اللعبة: الأيقونة ما زالت ظاهرة!');
    await page.evaluate(() => closeGamePage());
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => {
      const f = document.getElementById('waFab');
      return f ? getComputedStyle(f).display !== 'none' : false;
    });
    (back) ? ok('بعد الخروج من اللعبة: الأيقونة عادت') : bad('بعد الخروج: الأيقونة مخفية!');
    await ctx.close();
  }
  {
    const { page, ctx } = await PW.newPage(browser, { width: 412, height: 915 });
    await page.goto('http://localhost:4173/about.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const legal = await page.evaluate(() => {
      const f = document.getElementById('waFab');
      return { exists: !!f, visible: f ? getComputedStyle(f).display !== 'none' : false };
    });
    (legal.exists && legal.visible) ? ok('صفحة قانونية (about): الأيقونة ظاهرة') : bad('about: الأيقونة غير ظاهرة');
    await ctx.close();
  }

  /* ── 3) contact: زر واتساب واحد رسمي ── */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 412, height: 915 });
    await page.goto('http://localhost:4173/contact.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const wa = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.whatsapp-btns a'));
      return btns.map(a => ({ href: a.href, text: a.textContent.trim().replace(/\s+/g, ' ') }));
    });
    (wa.length === 1) ? ok('contact: زر واتساب واحد فقط') : bad('contact: ' + wa.length + ' أزرار!');
    (wa.length === 1 && /212706865019/.test(wa[0].href)) ? ok('contact: الرابط الرسمي') : bad('رابط: ' + JSON.stringify(wa));
    console.log('  [أزرار واتساب]', JSON.stringify(wa));
    await ctx.close();
  }

  /* ── 4) قواعد لعبة بلا نصائح (رامي — كانت فيها 4 نصائح) ── */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 412, height: 915 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => { window._currentGameId = 'rm'; Tutorial.showFullRules('rm'); });
    await PW.wait(page, () => { const m = document.getElementById('rulesModal'); return m && m.classList.contains('show'); }, 8000);
    const rules = await page.evaluate(() => {
      const b = document.getElementById('rulesBody');
      const html = b ? b.innerHTML : '';
      return { hasTipsSection: html.includes('rules-tips') || /نصائح|💡/.test(html), hasPayouts: html.includes('atable'), len: html.length };
    });
    (!rules.hasTipsSection) ? ok('قواعد الرامي: لا قسم نصائح') : bad('قواعد الرامي: النصائح ما زالت!');
    (rules.hasPayouts) ? ok('قواعد الرامي: جدول الأرباح باقٍ (' + rules.len + ' حرف)') : bad('جدول الأرباح اختفى!');
    await page.screenshot({ path: '/tmp/rules-rm-no-tips.png' });
    (page._errs.length === 0) ? ok('صفر أخطاء كونسول') : bad('أخطاء: ' + page._errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log('\n═══ تحقق الجولة: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
