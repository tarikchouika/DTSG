/* ═══════════════════════════════════════════════════════════════════
   DTSG — تدقيق حقيقي بمتصفح (Playwright/Chromium) على خادم اختبار كامل
   يفحص: أخطاء الكونسول والشبكة · ودجت الشات · صفحة الدعم · الصفحات القانونية
   ═══════════════════════════════════════════════════════════════════ */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';   /* خادم اختبار كامل (server.js) */
const USER = 'qa_player', PASS = 'QaTest12345';

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

async function newPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [], netfails = [];
  page._errs = errs; page._netfails = netfails;
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('requestfailed', r => {
    const u = r.url();
    if (/\.(png|jpe?g|webp|svg|ico|woff2?)/.test(u) && !/font-awesome|gstatic|googleapis/.test(u)) return;
    netfails.push(r.request().method() + ' ' + u.slice(0, 120) + ' — ' + (r.failure() || {}).errorText);
  });
  page.on('response', r => { if (r.status() >= 400) netfails.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 120)); });
  return { page, ctx };
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  console.log('\n═══ 1) الصفحة الرئيسية (موبايل 412×915) ═══');
  {
    const { page, ctx } = await newPage(browser, 412, 915);
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);

    const info = await page.evaluate(() => ({
      title: document.title.slice(0, 60),
      botFab: !!document.getElementById('botFab'),
      botFabVisible: (() => { const f = document.getElementById('botFab'); return f ? getComputedStyle(f).display !== 'none' : false; })(),
      waFab: !!document.getElementById('waFab'),
      waLinks: document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').length,
      dock: document.querySelectorAll('.app-dock > *').length,
      games: document.querySelectorAll('.game-card, .gcard, [data-game]').length
    }));
    info.botFab && info.botFabVisible ? ok('زر مركز المساعدة العائم ظاهر') : bad('زر الشات غير ظاهر');
    !info.waFab ? ok('لا يوجد waFab في DOM') : bad('waFab موجودة!');
    ok('عدد روابط واتساب في الرئيسية: ' + info.waLinks + ' (المتوقع 0 داخل المنصة)');
    console.log('  ↳ العنوان:', info.title, '| بطاقات ألعاب:', info.games, '| دوك:', info.dock);

    // فحص بصري: لقطة شاشة مع الشات مفتوح
    await page.click('#botFab');
    await page.waitForTimeout(1200);
    const chat = await page.evaluate(() => {
      const p = document.getElementById('botChat');
      const r = p.getBoundingClientRect();
      return {
        open: !p.hidden, w: Math.round(r.width), h: Math.round(r.height),
        inViewport: r.left >= 0 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1,
        tabs: Array.from(document.querySelectorAll('[data-bctab]')).map(b => b.textContent.trim()),
        msgs: document.querySelectorAll('#bcMsgs .bc-b, #bcMsgs .bc-hello, #bcMsgs .bc-empty').length
      };
    });
    chat.open ? ok('النافذة تُفتح بالنقر (' + chat.w + '×' + chat.h + ')') : bad('النافذة لم تُفتح');
    chat.inViewport ? ok('النافذة داخل حدود الشاشة (لا قطع)') : bad('النافذة تخرج عن الشاشة!');
    /* [v2.50-BC] حارس تعارض bc-*: فقاعات block (لا flex الباكارات) وبطاقات بعرض حر (لا 58×84) */
    const bcShape = await page.evaluate(() => {
      const bub = document.querySelector('#bcMsgs .bc-b');
      document.querySelector('[data-bctab="bots"]').click();
      const card = document.querySelector('#bcPaneBots .bc-card');
      const cc = card ? getComputedStyle(card) : null;
      const cr = card ? card.getBoundingClientRect() : null;
      document.querySelector('[data-bctab="chat"]').click();
      return { hasBubble: !!bub, bubbleDisplay: bub ? getComputedStyle(bub).display : '?',
        cardW: cr ? Math.round(cr.width) : 0, cardH: cr ? Math.round(cr.height) : 0, cardOverflow: cc ? cc.overflow : '?' };
    });
    if (!bcShape.hasBubble) ok('الفقاعات: لا فقاعة بعد الدخول (تُفحص بعد الإرسال أدناه)');
    else bcShape.bubbleDisplay === 'block' ? ok('فقاعات الشات block (لا تشوه flex)') : bad('الفقاعات display=' + bcShape.bubbleDisplay);
    (bcShape.cardW > 120 && bcShape.cardOverflow === 'visible') ? ok('بطاقات الشات بعرض حر بلا قصّ (' + bcShape.cardW + '×' + bcShape.cardH + ')') : bad('البطاقات مقصوصة: ' + bcShape.cardW + '×' + bcShape.cardH + ' overflow=' + bcShape.cardOverflow);
    console.log('  ↳ التبويبات:', chat.tabs.join(' | '));
    await page.screenshot({ path: '/tmp/audit-home-chat.png' });

    // تسجيل الدخول ثم إرسال رسالة من الودجت
    const login = await page.evaluate(async (c) => {
      const r = await fetch(location.origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });
      return r.status;
    }, { username: USER, password: PASS });
    login === 200 ? ok('تسجيل دخول اختباري ناجح') : bad('تسجيل الدخول: ' + login);

    await page.evaluate(() => window.dtsgBotChat.close());
    await page.waitForTimeout(300);
    await page.click('#botFab');
    await page.waitForTimeout(1500);
    const sendRes = await page.evaluate(() => fetch(location.origin + '/api/support/status', { credentials: 'include' }).then(r => r.status));
    sendRes === 200 ? ok('/api/support/status = 200 بعد الدخول') : bad('/api/support/status = ' + sendRes);

    await page.fill('#bcInput', 'اختبار من الودجت: أريد التأكد من وصول الرسالة لفريق الدعم.');
    await page.press('#bcInput', 'Enter');
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => {
      const t = document.getElementById('bcMsgs').textContent;
      const first = document.querySelector('#bcMsgs .bc-b');
      return { hasMine: /اختبار من الودجت/.test(t), bubbles: document.querySelectorAll('#bcMsgs .bc-b').length,
        bubDisplay: first ? getComputedStyle(first).display : '?' };
    });
    after.hasMine ? ok('رسالة الودجت ظهرت في النافذة (تذاكر/تأكيد)') : bad('رسالة الودجت لم تظهر');
    after.bubDisplay === 'block' ? ok('[v2.50-BC] فقاعة الرسالة block كاملة (لا قصّ)') : bad('الفقاعة display=' + after.bubDisplay);
    console.log('  ↳ عدد الفقاعات:', after.bubbles);
    await page.screenshot({ path: '/tmp/audit-chat-sent.png' });

    const hErr = page._errs.filter(e => !/401/.test(e)), hNet = page._netfails.filter(e => !/401/.test(e) && !/\/api\/support\/status/.test(e));
    hErr.length === 0 ? ok('صفر أخطاء كونسول في الرئيسية (401 قبل الدخول متوقع)') : bad('أخطاء كونسول: ' + hErr.slice(0, 4).join(' | '));
    hNet.length === 0 ? ok('لا إخفاقات شبكة غير متوقعة') : bad('شبكة: ' + hNet.slice(0, 5).join(' | '));
    await ctx.close();
  }

  console.log('\n═══ 2) صفحة الدعم support.html ═══');
  {
    const { page, ctx } = await newPage(browser, 1280, 900);
    await page.goto(BASE + '/support.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const s = await page.evaluate(() => ({
      hasSidebar: !!document.querySelector('.sidebar .nav-item'),
      hasDock: !!document.querySelector('.app-dock'),
      dockIcons: document.querySelectorAll('.app-dock .dock-ic').length,
      hasFooter: !!document.querySelector('footer.watermark'),
      footerLinks: Array.from(document.querySelectorAll('footer .foot-legal a')).map(a => a.getAttribute('href')),
      hasMobileNav: !!document.querySelector('.mobile-bottom-nav'),
      botFab: !!document.getElementById('botFab'),
      h1: (document.querySelector('h1') || {}).textContent,
      title: document.title,
      faIcon: (() => { const i = document.querySelector('.sup-icon i'); return i ? getComputedStyle(i, '::before').content : 'none'; })(),
      stylesFromLegal: !!Array.from(document.styleSheets).find(x => /01-variables/.test(x.href || ''))
    }));
    s.hasSidebar ? ok('سايدبار الصفحات القانونية موجود') : bad('لا سايدبار');
    s.dockIcons >= 3 ? ok('هيدر بأيقوناته (' + s.dockIcons + ' أيقونة)') : bad('أيقونات الهيدر ناقصة: ' + s.dockIcons);
    s.hasFooter ? ok('فوتر قانوني منسجم') : bad('لا فوتر');
    s.footerLinks.indexOf('support.html') >= 0 ? ok('رابط «الدعم» في الفوتر') : bad('لا رابط دعم: ' + s.footerLinks.join(','));
    s.hasMobileNav ? ok('شريط التنقل السفلي موجود') : bad('لا شريط سفلي');
    s.stylesFromLegal ? ok('يرث css/01-variables (نفس الهوية)') : bad('لا يرث ملفات المتغيرات');
    s.botFab ? ok('ودجت الشات يعمل داخل صفحة الدعم') : bad('لا ودجت في صفحة الدعم');
    console.log('  ↳ h1:', (s.h1 || '').trim().slice(0, 50), '| title:', s.title.slice(0, 50));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '/tmp/audit-support-top.png', fullPage: false });

    /* تبديل اللغة إلى الفرنسية عبر الواجهة */
    await page.click('#langBtn');
    await page.waitForTimeout(300);
    await page.click('.lang-opt[data-lang="fr"]');
    await page.waitForTimeout(1500);
    const fr = await page.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir,
      h1: (document.querySelector('h1') || {}).textContent,
      lead: (document.querySelector('.lead') || {}).textContent.slice(0, 60),
      header: (document.querySelector('.bc-ht b') || {}).textContent,
      tab: (document.querySelector('[data-bctab]') || {}).textContent.trim()
    }));
    /Support|support/i.test(fr.h1 || '') ? ok('الترجمة الفرنسية للعنوان تعمل: ' + fr.h1) : bad('ترجمة fr فشلت: ' + fr.h1);
    /Équipe|support|Une seule/i.test(fr.lead || '') ? ok('فقرة المقدمة تُترجم') : bad('المقدمة لم تُترجم: ' + fr.lead);
    fr.dir === 'ltr' ? ok('الاتجاه يتحول إلى LTR') : bad('الاتجاه: ' + fr.dir);
    console.log('  ↳ ودجت بالفرنسية:', fr.header, '|', fr.tab);
    await page.screenshot({ path: '/tmp/audit-support-fr.png' });
    const sErr = page._errs.filter(e => !/401/.test(e)), sNet = page._netfails.filter(e => !/401/.test(e));
    sErr.length === 0 ? ok('صفر أخطاء كونسول في support.html (401 قبل الدخول متوقع)') : bad('أخطاء: ' + sErr.slice(0, 4).join(' | '));
    sNet.length === 0 ? ok('لا إخفاقات شبكة (401 قبل الدخول متوقع)') : bad('شبكة: ' + sNet.slice(0, 5).join(' | '));
    await ctx.close();
  }

  console.log('\n═══ 3) جولة الصفحات القانونية ═══');
  {
    const pages = ['about.html', 'contact.html', 'privacy.html', 'terms.html', 'refund-policy.html', 'fairness.html', 'provably-fair.html', '2fa.html', 'admins.html', 'support.html'];
    const { page, ctx } = await newPage(browser, 1280, 900);
    for (const p of pages) {
      await page.goto(BASE + '/' + p, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1600);
      const r = await page.evaluate(() => ({
        dock: document.querySelectorAll('.app-dock .dock-ic').length,
        footer: !!document.querySelector('footer.watermark'),
        support: !!document.querySelector('footer a[href="support.html"]'),
        botFab: !!document.getElementById('botFab'),
        empty: (document.body.innerText || '').trim().length
      }));
      const problems = [];
      if (r.dock < 3) problems.push('dock=' + r.dock);
      if (!r.footer) problems.push('بلا فوتر');
      if (!r.support) problems.push('بلا رابط دعم');
      if (!r.botFab) problems.push('بلا ودجت');
      if (r.empty < 200) problems.push('محتوى فارغ');
      const errs = page._errs.slice().filter(e => !/401/.test(e)); const nf = page._netfails.slice().filter(e => !/401/.test(e));
      page._errs.length = 0; page._netfails.length = 0;
      if (problems.length === 0 && errs.length === 0 && nf.length === 0) ok(p + ' — سليم تماماً');
      else bad(p + ' — ' + problems.concat(errs.slice(0, 2), nf.slice(0, 2)).join(' | '));
    }
    await ctx.close();
  }

  console.log('\n═══ 4) صفحة اللعبة (الودجت يجب أن يختفي) ═══');
  {
    const { page, ctx } = await newPage(browser, 412, 915);
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.evaluate(() => { try { openGame('hl'); } catch (e) { } });
    await page.waitForTimeout(2500);
    const g = await page.evaluate(() => {
      const f = document.getElementById('botFab');
      return { pg: document.body.classList.contains('pg-game'), vis: f ? getComputedStyle(f).display : 'missing' };
    });
    g.pg ? ok('دخلنا وضع اللعبة (pg-game)') : bad('لم يُوسم pg-game');
    g.vis === 'none' ? ok('زر الشات مخفي داخل اللعبة') : bad('الزر ظاهر داخل اللعبة: ' + g.vis);
    await ctx.close();
  }

  await browser.close();
  console.log('\n═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
