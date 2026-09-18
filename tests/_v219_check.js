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

  /* ── 2) [v2.42] مركز المساعدة العائم: بديل واتساب — ظاهر بالرئيسية، مخفي في اللعبة ── */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 412, height: 915 });
    await PW.gotoGamePage(page);
    await PW.wait(page, () => !!document.getElementById('botFab'), 8000);
    const home = await page.evaluate(() => {
      const f = document.getElementById('botFab');
      return {
        exists: !!f,
        visible: f ? (getComputedStyle(f).display !== 'none' && f.getBoundingClientRect().height > 0) : false,
        wa: !!document.getElementById('waFab'),
        panelHidden: !!document.getElementById('botChat') && document.getElementById('botChat').hidden
      };
    });
    (home.exists && home.visible) ? ok('الرئيسية: زر مركز المساعدة العائم ظاهر') : bad('الرئيسية: زر الشات غير ظاهر');
    (!home.wa) ? ok('لا أثر لأيقونة واتساب العائمة (waFab محذوفة)') : bad('waFab ما زالت موجودة!');
    (home.panelHidden) ? ok('نافذة الشات مغلقة ابتداءً') : bad('نافذة الشات مفتوحة ابتداءً');

    /* فتح النافذة + تبويباها */
    await page.click('#botFab');
    await page.waitForTimeout(600);
    const opened = await page.evaluate(() => {
      const p = document.getElementById('botChat');
      return { open: p && !p.hidden, tabs: Array.from(document.querySelectorAll('[data-bctab]')).map(b => b.getAttribute('data-bctab')) };
    });
    (opened.open) ? ok('الزر يفتح نافذة مركز المساعدة') : bad('النافذة لم تُفتح');
    (opened.tabs.length === 2) ? ok('تبويبان: محادثة الدعم + الشحن والمدفوعات') : bad('تبويبات: ' + JSON.stringify(opened.tabs));

    /* تبويب المدفوعات: روابط البوتين والمحفظة */
    await page.click('[data-bctab="bots"]');
    await page.waitForTimeout(300);
    const pay = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('#bcPaneBots a')).map(a => a.getAttribute('href'));
      return { telegram: links.filter(h => /t\.me\//.test(h)), wallet: links.filter(h => /#wallet/.test(h)), chips: document.querySelectorAll('.bc-chip').length };
    });
    (pay.telegram.length >= 1) ? ok('رابط بوت خدمة العملاء (@dtsgsupports_bot) داخل النافذة') : bad('لا رابط تيليغرام');
    (pay.wallet.length >= 1) ? ok('رابط المحفظة (شحن/سحب) داخل النافذة') : bad('لا رابط محفظة');
    (pay.chips === 3) ? ok('اختصارات سريعة: شحن · حالة معاملة · ربط تيليغرام') : bad('عدد الاختصارات: ' + pay.chips);

    /* دخول لعبة → مخفي */
    await page.evaluate(() => openGame('hl'));
    await PW.wait(page, () => document.body.classList.contains('pg-game'), 8000);
    const inGame = await page.evaluate(() => {
      const f = document.getElementById('botFab');
      return f ? getComputedStyle(f).display === 'none' : true;
    });
    (inGame) ? ok('داخل اللعبة: زر الشات مخفي (pg-game)') : bad('داخل اللعبة: الزر ما زال ظاهراً!');
    await page.evaluate(() => closeGamePage());
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => {
      const f = document.getElementById('botFab');
      return f ? getComputedStyle(f).display !== 'none' : false;
    });
    (back) ? ok('بعد الخروج من اللعبة: الزر عاد') : bad('بعد الخروج: الزر مخفي!');
    (page._errs.length === 0) ? ok('صفر أخطاء كونسول (الودجت)') : bad('أخطاء: ' + page._errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  {
    const { page, ctx } = await PW.newPage(browser, { width: 412, height: 915 });
    await page.goto('http://localhost:4173/about.html', { waitUntil: 'domcontentloaded' });
    await PW.wait(page, () => !!document.getElementById('botFab'), 8000);
    const legal = await page.evaluate(() => {
      const f = document.getElementById('botFab');
      return {
        exists: !!f, visible: f ? getComputedStyle(f).display !== 'none' : false,
        wa: !!document.getElementById('waFab'),
        supportLink: !!document.querySelector('footer a[href="support.html"]'),
        headerIcons: document.querySelectorAll('.app-dock .dock-ic').length
      };
    });
    (legal.exists && legal.visible) ? ok('صفحة قانونية (about): زر الشات ظاهر') : bad('about: الزر غير ظاهر');
    (!legal.wa) ? ok('about: لا waFab') : bad('about: waFab موجودة');
    (legal.supportLink) ? ok('فوتر الصفحات القانونية فيه رابط «الدعم»') : bad('لا رابط دعم في الفوتر');
    (legal.headerIcons >= 3) ? ok('هيدر الصفحات القانونية فيه أيقوناته (' + legal.headerIcons + ')') : bad('أيقونات الهيدر: ' + legal.headerIcons);
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
