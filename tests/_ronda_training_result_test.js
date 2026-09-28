/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — اختبار حقيقي (متصفح) لبلاغ «فلات دوغ» (v2.43):
   في السولو التدريبي (بلا رهان) كان بانر الفوز/الخسارة وسجل الجولة يعرضان
   مبالغ وهمية (+30 بـ3x و−10). الاختبار يتحقق أن:
   أ) الجولة التدريبية بلا رهان (TRAINING.on) وشريط الرهان يقول «تدريب»
   ب) بانر الفوز لا يعرض أي مبلغ ويذكر التدريب المجاني
   ج) بانر الخسارة كذلك (لا −10)
   د) سجل الجولة بلا مبالغ
   هـ) الرصيد لا يتغيّر في أي من الحالتين
   التشغيل: node tests/_ronda_training_result_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };
const hasDigits = (t) => /[0-9٠-٩]/.test(String(t || ''));

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 140)));

  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const lg = await page.evaluate(async () => {
    const r = await fetch(location.origin + '/api/login', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' })
    });
    return r.status;
  });
  lg === 200 ? ok('دخول qa_player') : bad('فشل الدخول: ' + lg);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  console.log('\n═══ أ) بدء جولة فلات دوغ تدريبية (سولو) ═══');
  await page.evaluate(() => { try { openGame('rn'); } catch (e) {} });
  await page.waitForTimeout(1600);
  const gold0 = await page.evaluate(() => (typeof ST !== 'undefined' ? ST.gold : null));
  const startRound = async () => {
    await page.evaluate(() => { try { RN_chooseMode('number_only'); } catch (e) { console.error('mode', e.message); } });
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(400);
      const st = await page.evaluate(() => {
        let c = null;
        try { c = RN_ADAPTER && RN_ADAPTER.core; } catch (e) { c = null; }
        return c ? { on: !!(window.TRAINING && window.TRAINING.on), mp: !!c.multiplayer, role: c.myRole, state: c.state } : null;
      });
      if (st && st.role && st.on && !st.mp && /ROUND|PLAY|SELECT/.test(String(st.state))) return st;
    }
    return null;
  };
  const st1 = await startRound();
  st1 ? ok('جولة تدريبية جاهزة (TRAINING.on=true · الدور: ' + st1.role + ')') : bad('لم تبدأ الجولة التدريبية');
  const bar = await page.evaluate(() => {
    const el = document.getElementById('rnBetAmt');
    return el ? el.textContent.trim() : null;
  });
  (!hasDigits(bar)) ? ok('شريط الرهان لا يعرض مبلغاً في التدريب: «' + bar + '»') : bad('شريط الرهان ما زال يعرض مبلغاً: ' + bar);

  console.log('\n═══ ب) بانر الفوز التدريبي بلا مبالغ ═══');
  const winSub = await page.evaluate(() => {
    const c = RN_ADAPTER.core;
    try { c._endRound('selector'); } catch (e) { return 'ERR:' + e.message; }
    const sub = document.getElementById('rnBannerSub');
    const txt = document.getElementById('rnBannerText');
    return { sub: sub ? sub.textContent.trim() : null, txt: txt ? txt.textContent.trim() : null };
  });
  (!hasDigits(winSub.sub) && winSub.sub) ? ok('بانر الفوز بلا أي مبلغ: «' + winSub.sub + '»') : bad('بانر الفوز يعرض مبلغاً: ' + JSON.stringify(winSub));
  const gold1 = await page.evaluate(() => ST.gold);
  (gold1 === gold0) ? ok('الرصيد لم يتغيّر بعد الفوز التدريبي (' + gold1 + ')') : bad('الرصيد تغيّر: ' + gold0 + ' → ' + gold1);

  console.log('\n═══ ج) بانر الخسارة التدريبية بلا −10 ═══');
  await page.waitForTimeout(2500);
  const st2 = await startRound();
  st2 ? ok('جولة تدريبية ثانية جاهزة') : bad('لم تبدأ الجولة الثانية');
  const loseSub = await page.evaluate(() => {
    const c = RN_ADAPTER.core;
    try { c._endRound('dealer'); } catch (e) { return 'ERR:' + e.message; }
    const sub = document.getElementById('rnBannerSub');
    return sub ? sub.textContent.trim() : null;
  });
  (!hasDigits(loseSub) && loseSub) ? ok('بانر الخسارة بلا أي مبلغ: «' + loseSub + '»') : bad('بانر الخسارة يعرض مبلغاً: ' + loseSub);
  const gold2 = await page.evaluate(() => ST.gold);
  (gold2 === gold0) ? ok('الرصيد لم يتغيّر بعد الخسارة التدريبية (' + gold2 + ')') : bad('الرصيد تغيّر: ' + gold0 + ' → ' + gold2);

  console.log('\n═══ د) سجل الجولة بلا مبالغ ═══');
  const logTxt = await page.evaluate(() => {
    const log = document.getElementById('rnLog');
    return log ? log.innerText.replace(/\s+/g, ' ').slice(-400) : '';
  });
  const entries = logTxt.split('•').join('\n');
  const moneyLine = logTxt.split(/(?=[🏆💔])/).filter((x) => /[🏆💔]/.test(x) && /[+\-−]\s*[0-9٠-٩]/.test(x));
  moneyLine.length === 0 ? ok('لا سطر في السجل يعرض +مبلغ/−مبلغ') : bad('سطور بمبالغ: ' + moneyLine.join(' | '));
  /تدريب/.test(logTxt) ? ok('السجل يذكر «تدريب» بوضوح') : bad('السجل لا يذكر التدريب: ' + logTxt.slice(-160));

  console.log('\n═══ هـ) أخطاء الكونسول ═══');
  errs.length === 0 ? ok('لا أخطاء كونسول') : bad('أخطاء: ' + errs.slice(0, 3).join(' | '));

  await page.screenshot({ path: '/tmp/v243-ronda.png' });
  await browser.close();
  console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
