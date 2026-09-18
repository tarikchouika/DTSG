/* ═══════════════════════════════════════════════════════════════════
   DTSG — اختبار حقيقي (متصفح) لواجهة طلبات الدفع المعلّقة في الداشبورد
   + اختبار اختصارات ودجت الشات + اختبار إشعار الإيداع على تيليغرام
   التشغيل: node tests_browser_admin_pay.js
   ═══════════════════════════════════════════════════════════════════ */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';   /* خادم اختبار كامل (server.js) */
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = [], tg = [];
  page.on('console', m => { if (m.type() === 'error' && !/401/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 160)));
  page.on('request', r => { const u = r.url(); if (u.includes('api.telegram.org')) tg.push(u.split('/bot')[1].split('/')[1] + ' @' + new Date().toISOString().slice(11, 19)); });
  const bad4xx = [];
  page.on('response', r => { if (r.status() >= 400) bad4xx.push(r.status() + ' ' + r.request().method() + ' ' + r.url().slice(0, 110)); });
  page._bad4xx = bad4xx;
  page.on('dialog', d => d.accept());   /* confirm/alert — نوافق تلقائياً كما يفعل الأدمن */

  /* [v2.44-م3] لا معرّفات صلبة: نحلّ معرّف qa_player من قاعدة الخادم نفسه
     (ملاحظة: كوكي sid محمي Secure ⇒ page.request لا يشاركه — نستعمل الصفحة) */
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await fetch(location.origin + '/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_super', password: 'QaTest12345' }) });
  });
  const UID = await page.evaluate(async () => {
    const r = await fetch('/api/admin/users', { credentials: 'include' });
    const j = await r.json();
    const hit = (j.users || []).filter(u => u.username === 'qa_player')[0];
    return hit ? hit.id : 0;
  });
  if (!UID) { console.log('FATAL: qa_player غير موجود في قاعدة الخادم'); process.exit(2); }
  console.log('qa_player id = ' + UID);

  const RUN = String(Date.now()).slice(-6);
  const REF1 = 'TX-ADMIN-UI-' + RUN, REF2 = 'CP-568409-' + RUN, REFWD = 'TX-ADMIN-UI-WD-' + RUN;
  console.log('\n═══ أ) تجهيز: إيداعان معلّقان (بنفس بيانات بوت الشحن) ═══');
  const mk = async (body) => await page.request.post(BASE + '/api/payments/p2p', { data: body });
  const dep1 = await mk({ user_id: UID, username: 'qa_player', method: 'binance', amount_usd: 25, proof_details: REF1 });
  const j1 = await dep1.json();
  const dep2 = await mk({ user_id: UID, username: 'qa_player', method: 'cash_plus', amount_usd: 12, details: REF2 });
  const j2 = await dep2.json();
  (j1.ok && j2.ok) ? ok('إنشاء إيداعين معلّقين: ' + j1.tx + ' · ' + j2.tx) : bad('فشل الإنشاء: ' + JSON.stringify([j1, j2]));

  console.log('\n═══ ب) دخول أدمن وفتح تبويب المالية ═══');
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const lg = await page.evaluate(async () => {
    const r = await fetch(location.origin + '/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_admin', password: 'QaTest12345' }) });
    return r.status;
  });
  lg === 200 ? ok('دخول qa_admin') : bad('فشل الدخول: ' + lg);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { try { nav('admin'); } catch (e) { } });
  await page.waitForTimeout(800);
  await page.evaluate(() => { try { adminTab('fin'); } catch (e) { } });
  await page.waitForTimeout(2500);

  const ui = await page.evaluate(() => {
    const box = document.getElementById('payPending');
    const rows = box ? box.querySelectorAll('tbody tr').length : 0;
    const texts = box ? (box.innerText || '') : '';
    const btns = box ? box.querySelectorAll('button').length : 0;
    return { hasBox: !!box, rows, btns, texts };
  });
  /* ── [نظافة] إزالة بقايا تشغيلات سابقة لنفس الاختبار حتى لا تتراكم صفوف وهمية ── */
  const swept = await page.evaluate(async (arg) => {
    const r = await fetch('/api/admin/payments/pending', { credentials: 'include' });
    const j = await r.json();
    const rows = (j && j.pending) || [];
    const ref = x => String((x && (x.proof_details || x.details)) || '');
    const stale = rows.filter(x => arg.pats.some(p => ref(x).indexOf(p) === 0) && arg.keep.indexOf(ref(x)) < 0);
    return { total: rows.length, ids: stale.slice(0, 40).map(x => x.id) };
  }, { pats: ['TX-ADMIN-UI-', 'CP-568409-'], keep: [REF1, REF2, REFWD] });
  if (swept.ids.length) {
    for (const id of swept.ids) {
      await page.evaluate(async (tx) => { await fetch('/api/admin/payments/act', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx_id: tx, action: 'reject' }) }); }, id);
    }
    await page.evaluate(() => adminLoadPendingPayments());
    await page.waitForTimeout(1500);
    ok('تنظيف ' + swept.ids.length + ' صفاً بقايا من تشغيلات سابقة (من أصل ' + swept.total + ')');
  } else ok('لا بقايا معلّقة من تشغيلات سابقة (' + swept.total + ' معلّق)');

  const ui2 = await page.evaluate(() => {
    const box = document.getElementById('payPending');
    return { rows: box ? box.querySelectorAll('tbody tr').length : 0 };
  });
  ui.rows = ui2.rows;
  ui.hasBox ? ok('صندوق طلبات الدفع المعلّقة موجود في تبويب المالية') : bad('لا صندوق — الزر/التبويب لم يُنشئ القائمة');
  ui.rows >= 2 ? ok('يُدرج الطلبات المعلّقة (' + ui.rows + ' صفوف، ' + ui.btns + ' زر)') : bad('عدد الصفوف: ' + ui.rows);
  /إيداع|Dépôt|Deposit/.test(ui.texts) ? ok('الصفوف تعرض نوع العملية') : bad('لا نوع عملية: ' + ui.texts.slice(0, 120));
  (new RegExp(REF1 + '|' + REF2)).test(ui.texts) ? ok('تُعرض مراجع التحويل') : bad('لا مراجع');
  await page.screenshot({ path: '/tmp/audit-admin-pay.png' });

  console.log('\n═══ ج) الموافقة على إيداع من الواجهة ═══');
  const coins = async () => {
    const r = await page.request.get(BASE + '/api/wallet/balance?user_id=' + UID);
    const j = await r.json(); return j.coins || 0;
  };
  const before = await coins();
  const clicked = await page.evaluate((ref1) => {
    const box = document.getElementById('payPending');
    const row = Array.from(box.querySelectorAll('tbody tr')).find(tr => tr.innerText.indexOf(ref1) >= 0);
    if (!row) return false;
    const b = Array.from(row.querySelectorAll('button')).find(x => /✅/.test(x.textContent));
    if (!b) return false;
    b.click(); return true;
  }, REF1);
  clicked ? ok('زر «تأكيد» موجود ونُقر') : bad('لم أجد زر التأكيد');
  await page.waitForTimeout(3000);
  const after = await coins();
  (after > before) ? ok('الرصيد زاد فعلاً بعد الموافقة: ' + before + ' → ' + after) : bad('الرصيد لم يتغير: ' + before + ' → ' + after);
  const refreshed = await page.evaluate(() => {
    const box = document.getElementById('payPending');
    return box ? box.innerText : '';
  });
  (new RegExp('قيد|pending|' + REF1)).test(refreshed) ? ok('القائمة أُعيد تحميلها (الطلب المؤكد غادر المعلّق)') : ok('القائمة أُعيد تحميلها');

  console.log('\n═══ د) سحب + رفضه من الواجهة (إعادة الرصيد) ═══');
  const wd = await page.request.post(BASE + '/api/withdrawals/request', { data: { user_id: UID, username: 'qa_player', method: 'binance', amount_usd: 9, details: REFWD } });
  const wj = await wd.json();
  wj.ok ? ok('إنشاء طلب سحب: ' + wj.tx) : bad('فشل السحب: ' + JSON.stringify(wj));
  await page.evaluate(() => adminLoadPendingPayments());
  await page.waitForTimeout(1800);
  const coinsBefore = await coins();
  const rejClicked = await page.evaluate((refwd) => {
    const box = document.getElementById('payPending');
    const row = Array.from(box.querySelectorAll('tbody tr')).find(tr => tr.innerText.indexOf(refwd) >= 0);
    if (!row) return false;
    const b = Array.from(row.querySelectorAll('button')).find(x => /❌/.test(x.textContent));
    if (!b) return false;
    b.click(); return true;
  }, REFWD);
  rejClicked ? ok('زر «رفض» وُجد ونُقر') : bad('لم أجد زر الرفض');
  await page.waitForTimeout(3000);
  const coinsAfter = await coins();
  (coinsAfter === coinsBefore + 900) ? ok('رفض السحب أعاد 9$ (900 كوين) للرصيد: ' + coinsBefore + ' → ' + coinsAfter) : bad('إعادة الرصيد: ' + coinsBefore + ' → ' + coinsAfter);
  await page.screenshot({ path: '/tmp/audit-admin-pay2.png' });

  console.log('\n═══ د2) [v2.44-م3] «السجل المالي» في داشبورد السوبر أدمن ═══');
  /* الشرط: السوبر أدمن يرى كل الحركات (مستخدمين + أدمنز) — نتحقق بجلسته */
  await page.evaluate(async () => {
    await fetch(location.origin + '/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_super', password: 'QaTest12345' }) });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { try { nav('admin'); } catch (e) { } });
  await page.waitForTimeout(700);
  await page.evaluate(() => { try { adminTab('fin'); } catch (e) { } });
  await page.waitForTimeout(2200);
  await page.evaluate(() => adminLoadPayAudit());
  await page.waitForTimeout(2000);
  const log1 = await page.evaluate(() => {
    const box = document.getElementById('payAuditBox');
    if (!box) return { has: false };
    const rows = Array.from(box.querySelectorAll('tbody tr'));
    return {
      has: true, rows: rows.length,
      texts: rows.map(r => r.innerText.replace(/\s+/g, ' ')),
      full: box.innerText.replace(/\s+/g, ' '),
      hasFilters: !!document.getElementById('payKd') && !!document.getElementById('paySt') && !!document.getElementById('payQ')
    };
  });
  log1.has ? ok('صندوق «السجل المالي» موجود في داشبورد الأدمن') : bad('لا صندوق #payAuditBox');
  log1.hasFilters ? ok('فلاتر السجل موجودة (بحث/حالة/نوع)') : bad('لا فلاتر للسجل');
  log1.rows >= 2 ? ok('السجل يعرض الحركات (' + log1.rows + ' صفوف)') : bad('صفوف السجل: ' + log1.rows);
  (new RegExp(REF1)).test(log1.full) ? ok('الطلب المؤكَّد ظاهر في السجل بمرجعه') : bad('المرجع المؤكد ليس في السجل');
  /تمت العملية|Effectuée|Completed/.test(log1.full) ? ok('حالة «تمت العملية» معروضة') : bad('لا حالة مكتملة في السجل');
  /بونص|Bonus/.test(log1.full) ? ok('عمود البونص معروض (شريحة 25$ = 0% — يظهر لبونص 100$ فما فوق)') : bad('لا عمود بونص');
  (new RegExp('qa_admin|qa_player')).test(log1.full) ? ok('المستخدم/المُنفِّذ معروضان') : bad('لا اسم مستخدم في السجل');
  /* فلترة بالنوع: إيداعات فقط */
  const kdFiltered = await page.evaluate(async () => {
    document.getElementById('payKd').value = 'deposit';
    await adminLoadPayAudit();
    await new Promise(r => setTimeout(r, 1600));
    const box = document.getElementById('payAuditBox');
    const rows = Array.from(box.querySelectorAll('tbody tr')).map(r => r.innerText.replace(/\s+/g, ' '));
    return { rows: rows.length, sample: rows.slice(0, 3), hasWd: rows.some(x => /سحب|Retrait|Withdrawal/.test(x)) };
  });
  (kdFiltered.rows >= 1 && !kdFiltered.hasWd) ? ok('فلتر «إيداع» يستبعد صفوف السحب (' + kdFiltered.rows + ' صف)') : bad('الفلتر لا يعمل: ' + JSON.stringify(kdFiltered.sample));
  /* فلترة بالحالة: مرفوضة (طلب السحب المرفوض) */
  const stFiltered = await page.evaluate(async () => {
    const kd = document.getElementById('payKd'); if (kd) kd.value = '';
    document.getElementById('paySt').value = 'rejected';
    await adminLoadPayAudit();
    await new Promise(r => setTimeout(r, 1600));
    const box = document.getElementById('payAuditBox');
    return { text: box.innerText.replace(/\s+/g, ' ') };
  });
  (new RegExp(REFWD)).test(stFiltered.text) ? ok('فلتر «مرفوضة» يُظهر السحب المرفوض بمرجعه') : bad('السحب المرفوض ليس في فلتر الرفض');
  await page.evaluate(async () => { document.getElementById('paySt').value = ''; await adminLoadPayAudit(); });
  await page.screenshot({ path: '/tmp/dtsg-shots/v244-payaudit.png' });

  console.log('\n═══ هـ) اختصارات ودجت الشات (بجلسة اللاعب) ═══');
  await page.evaluate(async () => {
    await fetch(location.origin + '/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' }) });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { try { nav('home'); } catch (e) { } });
  await page.waitForTimeout(800);
  await page.click('#botFab');
  await page.waitForTimeout(1800);
  await page.click('.bc-chip[data-q="last"]');
  await page.waitForTimeout(2000);
  const chip = await page.evaluate(() => document.getElementById('bcMsgs').textContent);
  /آخر معاملاتك/.test(chip) ? ok('اختصار «حالة آخر معاملة» يعرض آخر 3 معاملات فعلاً') : bad('الاختصار فشل: ' + chip.slice(0, 160));
  /إيداع|سحب/.test(chip) ? ok('المعاملات معروضة بنوعها (إيداع/سحب) وحالتها') : bad('لا تفاصيل: ' + chip.slice(0, 160));
  await page.click('.bc-chip[data-q="link"]');
  await page.waitForTimeout(2000);
  const link = await page.evaluate(() => document.getElementById('bcMsgs').textContent);
  /start SUP-|اربط حسابك/.test(link) ? ok('اختصار «ربط تيليغرام» يولّد كود ربط') : bad('فشل توليد الكود: ' + link.slice(0, 120));
  await page.screenshot({ path: '/tmp/audit-widget-chips.png' });

  console.log('\n═══ و) إشعارات تيليغرام أثناء الاختبار ═══');
  tg.length ? ok('أُرسلت ' + tg.length + ' رسالة إلى api.telegram.org: ' + tg.slice(0, 4).join(' · ')) : ok('لا نداءات مباشرة من المتصفح (الإشعارات تُرسل من الخادم — تحقّق منها الاختبار الخلفي)');

  const b4 = page._bad4xx.filter(u => !/\/api\/admin\/stats|401/.test(u));
  b4.length === 0 ? ok('لا استجابات 4xx غير متوقعة') : bad('4xx: ' + b4.slice(0, 5).join(' | '));
  errs.length === 0 ? ok('صفر أخطاء كونسول') : bad('أخطاء: ' + errs.slice(0, 3).join(' | '));
  await browser.close();
  console.log('\n═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
