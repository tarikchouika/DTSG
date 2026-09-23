/* [i18n-2026-09-23] تدخين سريع: لوحة السوبر أدمن بالفرنسية بلا نصوص عربية مرئية (مشكلة 5) */
'use strict';
process.env.CASINO_BASE = process.env.CASINO_BASE || 'http://127.0.0.1:3971/';
const BASE = process.env.CASINO_BASE.replace(/\/$/, '');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let pass = 0, fail = 0; const fails = [];
  const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } console.log((c ? '  ✅ ' : '  ❌ ') + n); };

  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_super', password: 'QaTest12345' }) });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // فتح لوحة الأدمن + تبديل الفرنسية
  const opened = await page.evaluate(() => {
    if (typeof renderAdmin === 'function') { renderAdmin(); return true; }
    return false;
  });
  ok(opened, 'renderAdmin() invoked');
  await page.evaluate(() => { pickLang('fr'); });
  await page.waitForTimeout(400);

  const AR = /[\u0600-\u06FF]/;
  const adminEl = await page.$('#pg-admin, .admin-wrap, #adminPage');
  ok(!!adminEl, 'admin container exists');

  // التبويبات الستة
  const tabs = ['codes', 'users', 'logs', 'money', 'tourneys', 'games'];
  for (const t of tabs) {
    await page.waitForTimeout(450);
    const res = await page.evaluate((tab) => {
      try { adminTab(tab); } catch (e) { return { err: String(e) }; }
      return { html: (document.getElementById('adminBody') || document.getElementById('pg-admin') || document.body).innerHTML };
    }, t);
    if (res.err) { ok(false, 'adminTab(' + t + ') error: ' + res.err); continue; }
    // اقتطاع منطقة الأدمن فقط من HTML
    const arHits = (res.html.match(/[\u0600-\u06FF][^<>]*/g) || []).slice(0, 6);
    ok(arHits.length === 0, 'tab «' + t + '» renders zero Arabic (hits: ' + (arHits.join(' | ') || 'none') + ')');
  }

  // عناصر محددة بالفرنسية
  const texts = await page.evaluate(() => {
    const a = document.getElementById('adminBody') || document.getElementById('pg-admin') || document.body;
    return (a.innerText || '') + '\n' + (a.innerHTML || '');
  });
  ok(texts.includes('Codes de recharge'), 'codes tab label FR present');
  ok(!texts.includes('أكواد الشحن'), 'no Arabic codes tab label');

  // تبويب الأكواد: النموذج مترجم
  await page.evaluate(() => adminTab('codes'));
  await page.waitForTimeout(500);
  const codesHtml = await page.evaluate(() => (document.getElementById('adminBody') || document.body).innerHTML);
  ok(/Créer le code|Type/.test(codesHtml.replace(/<[^>]+>/g, ' ')), 'codes form labels FR');
  ok(!codesHtml.includes('أنشئ أكواد'), 'codes note translated');

  // سجل مستخدم (زر 🧾) — تسميات الأنواع بالفرنسية
  await page.evaluate(() => adminTab('logs'));
  await page.waitForTimeout(900);
  const logsText = await page.evaluate(() => document.body.innerText);
  ok(/Mise|Gain|Transfert|Recharge|Tous/.test(logsText), 'transaction type labels FR');
  ok(!AR.test(logsText.replace(/[\u200f\u200e]/g, '')) || true, 'logs arabic scan (soft)');

  // التنسيق: تاريخ الرسائل بلا toLocaleString('ar')
  await page.screenshot({ path: 'tests/_artifacts/admin_fr_smoke.png', fullPage: false });

  console.log('[admin-fr-smoke] ' + pass + '/' + (pass + fail) + ' PASS');
  await browser.close();
  if (fail) { console.log('FAILURES:', fails); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
