/* ═══════════════════════════════════════════════════════════════════════════
   tests/_v284_ui_browser_test.js — تحقق بمتصفح حقيقي لإصلاحات v2.84 البصرية
   1) مودال تسجيل الدخول: كل عناصره تُترجم عند تغيير اللغة (العنوان/التبويب/
      التسميتان/العنصران النائبان/الزر) + الأيقونات لا تُمحى + النص العربي
      النائب خالٍ من انعكاس bidi («20-3»).
   2) صفحة الترتيب: رقائق الألعاب تحمل أيقونات (img.lb-ico) بلا اسم نصي،
      ولا تنكمش (flex-shrink:0) — والرقاقة العامة تاج + «الكل».
   التشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_v284_ui_browser_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.QA_BASE || 'http://127.0.0.1:3971/';
let pass = 0, fail = 0;
const ok = (l, c, x) => { c ? (pass++, console.log('  ✅ ' + l + (x ? '  ' + x : ''))) : (fail++, console.log('  ❌ ' + l + (x ? '  ' + x : ''))); };

(async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const A = await browser.newPage({ viewport: { width: 390, height: 844 } });   /* جوال */
  const errors = [];
  A.on('pageerror', e => errors.push(String(e.message)));

  console.log('═══ 1) مودال الدخول — الترجمة والأيقونات ═══');
  await A.goto(BASE, { waitUntil: 'domcontentloaded' });
  await A.waitForTimeout(800);
  /* اضبط العربية صراحة أولاً (اللغة قد تكون محفوظة EN من جلسة سابقة) */
  await A.evaluate(() => {
    try { localStorage.setItem('rc_lang', 'ar'); } catch (e) {}
    try { if (typeof window.setLang === 'function') window.setLang('ar'); } catch (e) {}
  });
  await A.waitForTimeout(600);
  await A.evaluate(() => { try { window.openAuthModal(); } catch (e) {} });
  await A.waitForTimeout(300);

  const ar = await A.evaluate(() => ({
    title: (document.getElementById('authTitle') || {}).textContent || '',
    titleIcon: !!(document.querySelector('#authTitle i.fa-key')),
    tab: (document.querySelector('#authModal .atab') || {}).textContent || '',
    tabIcon: !!(document.querySelector('#authModal .atab i.fa-key')),
    userLabel: (document.querySelector('label[for="authUsername"]') || {}).textContent || '',
    userPh: (document.getElementById('authUsername') || {}).placeholder || '',
    pwLabel: (document.querySelector('label[for="authPassword"]') || {}).textContent || '',
    pwPh: (document.getElementById('authPassword') || {}).placeholder || '',
    submit: (document.getElementById('authSubmit') || {}).textContent || ''
  }));
  ok('العنوان العربي + أيقونة المفتاح محفوظة', ar.title.indexOf('دخول') >= 0 && ar.titleIcon, '(' + ar.title.trim() + ')');
  ok('تبويب الدخول + أيقونته', ar.tab.indexOf('دخول') >= 0 && ar.tabIcon);
  ok('تسمية اسم المستخدم مترجمة', ar.userLabel.indexOf('اسم المستخدم') >= 0);
  ok('النائب العربي نظيف من انعكاس bidi', ar.userPh.indexOf('من 3 إلى 20') >= 0 && ar.userPh.indexOf('20-3') < 0, '(' + ar.userPh + ')');
  ok('تسمية كلمة المرور مترجمة', ar.pwLabel.indexOf('كلمة المرور') >= 0);
  ok('نائب كلمة المرور', ar.pwPh.indexOf('6') >= 0 && ar.pwPh.indexOf('أحرف على الأقل') >= 0);

  /* بدّل اللغة إلى EN وأعد الفتح — كل العناصر يجب أن تتبع */
  await A.evaluate(() => { try { window.setLang('en'); } catch (e) { try { localStorage.setItem('rc_lang', 'en'); } catch (e2) {} } });
  await A.waitForTimeout(400);
  await A.evaluate(() => { try { window.closeAuthModal(); window.openAuthModal(); } catch (e) {} });
  await A.waitForTimeout(300);
  const en = await A.evaluate(() => ({
    title: (document.getElementById('authTitle') || {}).textContent || '',
    titleIcon: !!(document.querySelector('#authTitle i.fa-key')),
    tab: (document.querySelector('#authModal .atab') || {}).textContent || '',
    userLabel: (document.querySelector('label[for="authUsername"]') || {}).textContent || '',
    userPh: (document.getElementById('authUsername') || {}).placeholder || '',
    pwLabel: (document.querySelector('label[for="authPassword"]') || {}).textContent || '',
    pwPh: (document.getElementById('authPassword') || {}).placeholder || '',
    submit: (document.getElementById('authSubmit') || {}).textContent || ''
  }));
  ok('EN: العنوان Login + الأيقونة ما زالت', /login/i.test(en.title) && en.titleIcon, '(' + en.title.trim() + ')');
  ok('EN: التبويب Log In', /log in/i.test(en.tab));
  ok('EN: تسمية Username', /username/i.test(en.userLabel));
  ok('EN: نائب اسم المستخدم إنجليزي', en.userPh.indexOf('3-20 chars') >= 0, '(' + en.userPh + ')');
  ok('EN: تسمية Password', /password/i.test(en.pwLabel));
  ok('EN: نائب كلمة المرور إنجليزي', /at least 6/i.test(en.pwPh), '(' + en.pwPh + ')');
  ok('EN: زر الإرسال Log In', /log in/i.test(en.submit));
  /* عد إلى العربية لبقية الفحوص */
  await A.evaluate(() => { try { window.setLang('ar'); } catch (e) {} });
  await A.waitForTimeout(300);

  console.log('═══ 2) صفحة الترتيب — أيقونات بلا أسماء ═══');
  /* أدخل كحساب حقيقي حتى يُبنى الترتيب (قاعدة QA) */
  await A.evaluate(() => { try { window.closeAuthModal(); } catch (e) {} });
  await A.evaluate(() => {
    const u = document.getElementById('authUsername');
    const p = document.getElementById('authPassword');
    if (u && p) { u.value = 'qa_v284'; p.value = 'qa_v284_pass'; }
  });
  await A.evaluate(() => { try { window.authSubmit && window.authSubmit(); } catch (e) {} });
  await A.waitForTimeout(1500);
  const lb = await A.evaluate(() => {
    const nav = document.querySelector('[data-nav="lb"]') || Array.from(document.querySelectorAll('.navbtn, nav button, [role="tab"]')).find(b => (b.textContent || '').indexOf('المتصدرون') >= 0);
    if (nav) nav.click();
    return !!nav;
  });
  await A.waitForTimeout(1500);
  await A.evaluate(() => { try { window.renderLB && window.renderLB(); } catch (e) {} });
  await A.waitForTimeout(1500);
  const chips = await A.evaluate(() => {
    const bar = document.getElementById('lbFilters');
    if (!bar) return null;
    const cs = Array.from(bar.querySelectorAll('.fchip'));
    return cs.map(c => ({
      html: c.innerHTML,
      hasIcon: !!c.querySelector('img.lb-ico'),
      iconLoaded: (function () { const i = c.querySelector('img.lb-ico'); return !!(i && i.complete && i.naturalWidth > 0); })(),
      text: (c.textContent || '').trim(),
      shrink: getComputedStyle(c).flexShrink,
      title: c.getAttribute('title') || '',
      onclick: c.getAttribute('onclick') || ''
    }));
  });
  ok('شريط رقائق الترتيب موجود', !!chips);
  if (chips) {
    ok('الرقاقة العامة: تاج + «الكل» (كلمة واحدة لا تُبتور)', chips.length > 0 && chips[0].text.indexOf('الكل') >= 0 && chips[0].html.indexOf('fa-crown') >= 0, '(' + chips[0].text + ')');
    const gameChips = chips.slice(1);
    ok('رقائق الألعاب: أيقونات موجودة (' + gameChips.filter(c => c.hasIcon).length + '/' + gameChips.length + ')', gameChips.length > 0 && gameChips.every(c => c.hasIcon));
    ok('أيقونات الألعاب محمَّلة فعلاً (naturalWidth>0)', gameChips.every(c => c.iconLoaded));
    ok('لا اسم لعبة نصياً في الرقائق (أيقونة + عدّاد فقط)', gameChips.every(c => c.text.replace(/[\d\s\u200f\u200e]/g, '') === ''));
    ok('كل رقاقة تحمل title باسم اللعبة (وصولية)', gameChips.every(c => c.title.length > 1));
    ok('الرقائق لا تنكمش (flex-shrink: 0)', chips.every(c => c.shrink === '0'));
  }

  ok('صفر أخطاء JS في الصفحة', errors.length === 0, errors.length ? errors[0] : '');

  console.log('════════════════════════════════════════');
  console.log('النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
