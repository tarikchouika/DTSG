/* ═══════════════════════════════════════════════════════════════════════
   tests/_verify_live_v240.js — تحقق حي على النشرة https://dtsg.pages.dev
   يفحص: البطاقات الجديدة (ضومنة/طاولة) · رموز QR الثلاثة في صفحة الاسترداد ·
   [v2.45] إزالة Cryptomus من الواجهة الحيّة · فتح المحفظة بلا أخطاء · بصمة البناء · صور حيّة
   التشغيل: node tests/_verify_live_v240.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
const SITE = 'https://dtsg.pages.dev';
let pass = 0, fail = 0;
function ok(l, c, x) { if (c) { pass++; console.log('  ✅ ' + l + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + l + (x ? '  ' + x : '')); } }

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  console.log('\n── 1) الصفحة الرئيسية الحي ──');
  const r1 = await page.goto(SITE + '/index.html', { waitUntil: 'domcontentloaded' });
  ok('index.html تستجيب 200', r1.status() === 200, '(status=' + r1.status() + ')');
  await page.waitForTimeout(4000);
  const build = await page.evaluate(() => (window.DTSG_BUILD || '') + ' | ' + (window.AUTH ? 'AUTH✓' : 'AUTH✗'));
  ok('بصمة البناء الحيّة', /v2\.40/.test(build), '(' + build + ')');

  const cards = await page.evaluate(async () => {
    const out = {};
    for (const id of ['do', 'bg', 'dm', 'rm']) {
      const tile = Array.from(document.querySelectorAll('.tile')).find(t => (t.getAttribute('onclick') || '').indexOf("openGame('" + id + "'") !== -1);
      const img = tile ? tile.querySelector('.art img') : null;
      out[id] = img ? { src: img.getAttribute('src'), w: img.naturalWidth, h: img.naturalHeight } : null;
    }
    return out;
  });
  ok('بطاقة الضومنة تحمل الصورة الجديدة', !!(cards.do && cards.do.w === 512), JSON.stringify(cards.do));
  ok('بطاقة الطاولة تحمل الصورة الجديدة', !!(cards.bg && cards.bg.w === 512), JSON.stringify(cards.bg));
  ok('بطاقة الضامة (dm) سليمة', !!(cards.dm && cards.dm.w > 0), JSON.stringify(cards.dm));

  console.log('\n── 2) صفحة الاسترداد الحيّة ──');
  await page.goto(SITE + '/refund-policy', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const qrs = await page.evaluate(() => Array.from(document.querySelectorAll('.qr-row img')).map(i => ({ src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight })));
  ok('ثلاثة رموز QR معروضة', qrs.length === 3, '(' + qrs.length + ')');
  qrs.forEach(q => ok('الرمز محمَّل فعلاً: ' + q.src, q.w > 100 && q.h > 100, '(' + q.w + '×' + q.h + ')'));
  const cash = await page.evaluate(() => (document.body.textContent || '').includes('0766672027'));
  ok('رقم Cash Plus الحقيقي ظاهر في الصفحة', cash);
  await page.screenshot({ path: '/tmp/live_refund.png', fullPage: false });

  console.log('\n── 3) [v2.45] إزالة Cryptomus ──');
  const own = await page.evaluate(async () => {
    const r = await fetch('https://dtsg.pages.dev/cryptomus_5bf79cae.html', { redirect: 'manual' });
    const html = await (await fetch('https://dtsg.pages.dev/index.html')).text();
    return { status: r.status, metaCryptomus: /cryptomus/i.test(html) };
  });
  ok('ملف إثبات Cryptomus لم يعد يُخدَم (404/تحويل)', own.status === 404 || own.status === 301 || own.status === 308, '(status=' + own.status + ')');
  ok('index.html الحيّ بلا أي أثر لـ Cryptomus', own.metaCryptomus === false);

  console.log('\n── 4) المحفظة على الموقع الحي ──');
  await page.goto(SITE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const w = await page.evaluate(async () => {
    if (typeof openWallet !== 'function') return { error: 'openWallet مفقودة' };
    try { AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 }; } catch (e) {}
    await openWallet();
    await new Promise(r => setTimeout(r, 6000));
    const msgs = Array.from(document.querySelectorAll('#wlMethods .wl-note')).map(n => n.textContent.trim().slice(0, 60));
    return { methods: Array.from(document.querySelectorAll('.wl-method')).length, msgs: msgs };
  });
  ok('نافذة المحفظة تُفتح بلا تعطّل', !w.error, JSON.stringify(w).slice(0, 160));

  ok('صفر أخطاء JS في جولة الحي كاملة', errs.length === 0, errs.length ? JSON.stringify(errs.slice(0, 3)) : '');
  await b.close();
  console.log('\n═══ تحقق حي v2.40: ' + pass + ' نجح / ' + fail + ' فشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });
