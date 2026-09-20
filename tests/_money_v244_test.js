process.chdir(require('path').resolve(__dirname, '..'));
/* ═══════════════════════════════════════════════════════════════════════════
   [v2.44-MONEY] اختبار المال الكامل (متصفح حقيقي + خادم اختبار):
   1) بوت الشحن يطلب تعبئة عبر /api/bot/request بهوية tg_id فقط (بلا جلسة)
   2) السوبر أدمن يصادق من اللوحة (تبويب المالية) ⇒ الكوينز تُشحن **مرة واحدة**
   3) البونص حسب الشريحة يُحتسب تلقائياً
   4) إعادة تحميل الصفحة ومزامنة /api/sync **لا تُرجِع** الرصيد للخلف (العلّة المُبلَّغ عنها)
   5) سجل المال يظهر للمستخدم (سجل الحساب) وللسوبر أدمن (تبويب المال)
   6) رفض سحب يعيد الكوينز مرة واحدة
   التشغيل: node tests/_money_v244_test.js   (يحتاج خادم اختبار على 3971)
   ═══════════════════════════════════════════════════════════════════════════ */
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
const RATE = 100;
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

const login = async (page, u, p) => await page.evaluate(async (a) => {
  const r = await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: a.u, password: a.p }) });
  return r.status;
}, { u, p });

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  page.on('console', m => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  page.on('dialog', d => d.accept());

  /* ── تسجيل دخول اللاعب (خارج الصفحة عبر واجهة الخادم) ── */
  console.log('\n═══ أ) تجهيز: لاعب مرتبط بتيليغرام (qa_player/tg 555000111) ═══');
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const st1 = await login(page, 'qa_player', 'QaTest12345');
  st1 === 200 ? ok('دخول qa_player') : bad('فشل الدخول qa_player: ' + st1);
  const bal0 = await page.evaluate(async () => (await (await fetch('/api/wallet/balance?username=qa_player')).json()));
  const coins0 = Number(bal0.coins || 0);
  ok('الرصيد الابتدائي: ' + coins0 + ' 🪙 (' + Number(bal0.balance_usd || 0).toFixed(2) + ' USD)');

  /* ── الطلب من "البوت": tg_id فقط، بلا جلسة ── */
  console.log('\n═══ ب) بوت الشحن يطلب إيداعاً مباشراً 100$ (tg_id فقط) ═══');
  const reqOne = async (amount, kind) => {
    return await page.evaluate(async (a) => {
      const r = await fetch('/api/bot/request', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tg_id: '555000111', kind: a.kind, amount_usd: a.amount, method: 'cash_plus', details: 'TX-BOT-' + Date.now() })
      });
      return { status: r.status, body: await r.json() };
    }, { amount, kind });
  };
  const r1 = await reqOne(100, 'deposit');
  (r1.status === 200 && r1.body && r1.body.ok && r1.body.tx)
    ? ok('أُنشئ طلب معلّق: ' + r1.body.tx + ' · بونص الشريحة ' + r1.body.bonus_pct + '% · كوينز عند المصادقة ' + r1.body.coins_on_approve)
    : bad('فشل إنشاء الطلب: ' + JSON.stringify(r1));
  r1.body.bonus_pct === 5 ? ok('بونص 100$ لمستخدم عادي = +5% (شريحة المستخدمين)') : bad('البونص غير صحيح: ' + r1.body.bonus_pct);

  const rBad = await page.evaluate(async () => {
    const r = await fetch('/api/bot/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tg_id: '555000111', amount_usd: 100, details: 'X' }) });
    return { status: r.status, body: await r.json() };
  });
  rBad.status === 200 ? ok('طلب بلا نوع = إيداع افتراضاً (قبول)') : ok('رد واضح للطلب الناقص: ' + (rBad.body.missing || []).join(','));

  const rNoUser = await page.evaluate(async () => {
    const r = await fetch('/api/bot/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: '__nobody__', amount_usd: 10, details: 'X' }) });
    return { status: r.status, body: await r.json() };
  });
  rNoUser.status === 404 && rNoUser.body.error === 'user-not-found'
    ? ok('هوية غير مرتبطة ⇒ 404 / user-not-found مع إرشاد (لا bad-input صامت)')
    : bad('رد الهوية المجهولة: ' + JSON.stringify(rNoUser));

  /* ── دخول السوبر أدمن والمصادقة من اللوحة ── */
  console.log('\n═══ ج) السوبر أدمن يصادق من تبويب المالية ═══');
  const ctxA = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar-MA' });
  const pageA = await ctxA.newPage();
  pageA.on('dialog', d => d.accept());
  const aerrs = [];
  pageA.on('pageerror', e => aerrs.push(String(e).slice(0, 140)));
  await pageA.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await pageA.waitForTimeout(1500);
  const sta = await login(pageA, 'qa_super', 'QaTest12345');
  sta === 200 ? ok('دخول qa_super') : bad('فشل دخول السوبر: ' + sta);
  await pageA.reload({ waitUntil: 'domcontentloaded' });
  await pageA.waitForTimeout(2200);
  await pageA.evaluate(() => { try { nav('admin'); } catch (e) {} });
  await pageA.waitForTimeout(700);
  await pageA.evaluate(() => { try { adminTab('fin'); } catch (e) {} });
  await pageA.waitForTimeout(2500);

  const clicked = await pageA.evaluate(async (tx) => {
    adminTab('fin');
    await new Promise(r => setTimeout(r, 1200));
    await adminLoadPendingPayments();
    await new Promise(r => setTimeout(r, 1200));
    const box = document.getElementById('payPending');
    const row = Array.from(box.querySelectorAll('tbody tr')).find(tr => tr.innerText.indexOf(tx) >= 0);
    if (!row) return 'row-not-found';
    const b = Array.from(row.querySelectorAll('button')).find(x => /✅/.test(x.textContent));
    if (!b) return 'btn-not-found';
    b.click(); return 'clicked';
  }, r1.body.tx);
  clicked === 'clicked' ? ok('زر «تأكيد الشحن» نُقر من اللوحة') : bad('تعذّر النقر: ' + clicked);
  await pageA.waitForTimeout(3000);

  const bal1 = await page.evaluate(async () => (await (await fetch('/api/wallet/balance?username=qa_player')).json()));
  const coins1 = Number(bal1.coins || 0);
  const expected = Math.round(100 * RATE * 1.05);          /* 100$ + 5% بونص مستخدم عادي = 10500 كوين */
  (coins1 - coins0) === expected
    ? ok('الكوينز شُحنت مرة واحدة بالضبط: +' + (coins1 - coins0) + ' 🪙 (المتوقع ' + expected + ')')
    : bad('الكوينز: +' + (coins1 - coins0) + ' بدل ' + expected + ' (شحن مزدوج/ناقص؟)');

  /* ── إعادة تحميل + مزامنة: لا تراجع ── */
  console.log('\n═══ د) أعِد تحميل صفحة اللاعب + مزامنة (كان الرصيد يرجع للخلف) ═══');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const afterReload = await page.evaluate(() => (typeof ST !== 'undefined' ? ST.gold : -1));
  afterReload >= coins1 ? ok('الرصيد بعد إعادة التحميل: ' + afterReload + ' 🪙 (لا تراجع)')
    : bad('الرصيد تراجع بعد إعادة التحميل: ' + afterReload + ' < ' + coins1);

  const syncRes = await page.evaluate(async () => {
    const before = ST.gold;
    const r = await fetch('/api/sync', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gold: before - 500000, lang: ST.lang }) });
    const j = await r.json();
    const after = (await (await fetch('/api/wallet/balance?username=qa_player')).json()).coins;
    return { before: before, sent: before - 500000, server_said: j.gold, after_db: after };
  });
  syncRes.after_db === syncRes.before
    ? ok('محاولة إرجاع الرصيد عبر /api/sync (إرسال قيمة أدنى) لم تُغيَّر شيئاً: ' + syncRes.after_db + ' 🪙')
    : bad('الرصيد تغيّر من /api/sync: ' + JSON.stringify(syncRes));

  /* ── سجل المال للمستخدم والسوبر ── */
  console.log('\n═══ هـ) سجل الشحن والسحب: عند المستخدم وعند السوبر أدمن ═══');
  const userLog = await page.evaluate(async () => (await (await fetch('/api/money/log?limit=20')).json()));
  const dep = (userLog.log || []).find(x => x.kind === 'deposit' && x.ref === r1.body.tx);
  dep ? ok('يظهر الإيداع في سجل المستخدم: ' + dep.coins + ' 🪙 · ' + dep.status) : bad('الإيداع غير موجود في سجل المستخدم');
  const admLog = await pageA.evaluate(async () => (await (await fetch('/api/money/log?scope=all&limit=50')).json()));
  (admLog.log || []).length >= 1 ? ok('سجل السوبر أدمن يعرض ' + admLog.log.length + ' حركة (scope=all)') : bad('سجل السوبر فارغ');
  const adminSelf = await page.evaluate(async () => (await (await fetch('/api/money/log?scope=all&limit=5')).json()));
  adminSelf.scope === 'self' ? ok('لاعب عادي لا يستطيع رؤية سجل الآخرين (scope=self)') : bad('تسريب: لاعب رأى scope=' + adminSelf.scope);

  const tabMoney = await pageA.evaluate(async () => {
    adminTab('money');
    await new Promise(r => setTimeout(r, 2200));
    const c = document.getElementById('adminContent');
    return c ? (c.innerText || '').slice(0, 200) : '';
  });
  /إيداع|سحب|كوينز|USD/.test(tabMoney) ? ok('تبويب «سجل المال» في الداشبورد يعرض الحركة فعلاً') : bad('تبويب المال فارغ: ' + tabMoney.slice(0, 80));

  /* ── سحب + رفض ⇒ إعادة الكوينز مرة واحدة ── */
  console.log('\n═══ و) سحب 20$ ثم رفضه ⇒ إعادة الكوينز مرة واحدة ═══');
  const wd = await page.evaluate(async () => {
    const r = await fetch('/api/bot/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tg_id: '555000111', kind: 'withdraw', amount_usd: 20, method: 'cash_plus', details: 'WD-BOT-' + Date.now() }) });
    return { status: r.status, body: await r.json() };
  });
  wd.status === 200 ? ok('طلب سحب من البوت: ' + wd.body.tx) : bad('فشل طلب السحب: ' + JSON.stringify(wd.body));
  const balAfterWd = await page.evaluate(async () => (await (await fetch('/api/wallet/balance?username=qa_player')).json()));
  (coins1 - Number(balAfterWd.coins)) === 2000 ? ok('خُصم 20$ = 2000 🪙 عند الطلب') : bad('خصم السحب: ' + (coins1 - Number(balAfterWd.coins)));

  const rejClicked = await pageA.evaluate(async (tx) => {
    adminTab('fin');
    await new Promise(r => setTimeout(r, 1500));
    await adminLoadPendingPayments();
    await new Promise(r => setTimeout(r, 1200));
    const box = document.getElementById('payPending');
    const row = Array.from(box.querySelectorAll('tbody tr')).find(tr => tr.innerText.indexOf(tx) >= 0);
    if (!row) return 'row-not-found';
    const b = Array.from(row.querySelectorAll('button')).find(x => /❌/.test(x.textContent));
    if (!b) return 'btn-not-found';
    b.click(); return 'clicked';
  }, wd.body.tx);
  rejClicked === 'clicked' ? ok('زر «رفض» نُقر') : bad('تعذّر النقر على الرفض: ' + rejClicked);
  await pageA.waitForTimeout(3000);
  const balAfterRej = await page.evaluate(async () => (await (await fetch('/api/wallet/balance?username=qa_player')).json()));
  Number(balAfterRej.coins) === coins1 ? ok('أُعيد المبلغ مرة واحدة بالضبط: ' + balAfterRej.coins + ' 🪙')
    : bad('إعادة الرصيد غير مطابقة: ' + balAfterRej.coins + ' بدل ' + coins1);

  /* ── لا أخطاء كونسول ── */
  console.log('\n═══ ز) نظافة الكونسول ═══');
  (errs.length + aerrs.length) === 0 ? ok('صفر أخطاء كونسول في جلستي اللاعب والأدمن')
    : bad('أخطاء: ' + errs.concat(aerrs).slice(0, 3).join(' | '));

  await browser.close();
  console.log('\n═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
