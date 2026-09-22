/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — اختبار حقيقي (متصفح) لإصلاحات v2.43:
   1) توافق بوت الشحن/الفوچر: لا bad-input مع أسماء الحقول البديلة
      (amount / phone / "Cash Plus" / username / tg_id).
   2) رفض الهوية المجهولة (يمنع «تسجيل معاملة بلا حساب ⇒ رصيد ثابت»).
   3) الكوبونات: إنشاء بصلاحية سوبر أدمن تيليغرام + استرداد بالاسم ⇒ كوينز.
   4) دفع الرصيد اللحظي (SSE wallet): الرصيد المعروض يتغيّر بلا إعادة تحميل.
   5) سجل الحساب: تاريخ الانضمام وآخر نشاط يظهران فعلاً.
   التشغيل: node tests/_pay_v243_test.js     (يحتاج خادم اختبار على 3971)
   ═══════════════════════════════════════════════════════════════════════════ */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errs = [];
  const ctxP = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar-MA' });
  const ctxA = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar-MA' });
  const P = await ctxP.newPage(), A = await ctxA.newPage();
  for (const pg of [P, A]) {
    pg.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 140)));
  }

  /* ── تسجيل الدخول (كوكي جلسة) ── */
  const login = async (pg, u) => pg.evaluate(async (user) => {
    const r = await fetch(location.origin + '/api/login', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: user, password: 'QaTest12345' })
    });
    return r.status;
  }, u);
  await P.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  const l1 = await login(P, 'qa_player');
  l1 === 200 ? ok('دخول qa_player') : bad('فشل دخول اللاعب: ' + l1);
  await A.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  const l2 = await login(A, 'qa_admin');
  l2 === 200 ? ok('دخول qa_admin') : bad('فشل دخول الأدمن: ' + l2);

  /* طلبات API بجلسة الصفحة (كوكي sid بـ Secure لا يُشارَك مع APIRequestContext) */
  const call = (pg, method, path, data, headers) => pg.evaluate(async (a) => {
    const r = await fetch(location.origin + a.path, {
      method: a.method, credentials: 'include',
      headers: Object.assign({ 'content-type': 'application/json' }, a.headers || {}),
      body: a.data === undefined ? undefined : JSON.stringify(a.data)
    });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    return { status: r.status, json: j };
  }, { method: method, path: path, data: data, headers: headers });
  const post = (pg, path, data, headers) => call(pg, 'POST', path, data, headers);
  const coinsOf = async (pg, q) => { const r = await call(pg, 'GET', '/api/wallet/balance?' + q); return r.json && r.json.coins; };

  /* ── تصفير الرصيد الأساسي للاعب (ليكون الاختبار قابلاً للتكرار) ── */
  const meP0 = await call(P, 'GET', '/api/me');
  const playerId = (meP0.json && meP0.json.user && meP0.json.user.id) || 18;
  const coins0 = await coinsOf(P, 'username=qa_player');
  (coins0 >= 500) ? ok('رصيد اللاعب الابتدائي: ' + coins0 + ' كوين (id=' + playerId + ')') : bad('رصيد اللاعب منخفض — شغّل tests/_mkusers.js أولاً: ' + coins0);

  /* ═══ 1) توافق بوت الشحن — نفس أشكال الطلبات التي ترسلها البوتات ═══ */
  console.log('\n═══ أ) توافق البوتات (بدائل الأسماء) ═══');
  const cases = [
    ['إيداع: username + amount + phone', { username: 'qa_player', method: 'binance', amount: 20, phone: '0677567089' }, 200],
    ['إيداع: tg_id مربوط + amount_usd + txid', { tg_id: '555000111', method: 'USDT (TRC20)', amount_usd: 12, txid: 'TX-BOT-2' }, 200],
    ['إيداع: method "Cash Plus" + reference', { username: 'qa_player', method: 'Cash Plus', amount_usd: 7, reference: 'CP-BOT-3' }, 200]
  ];
  for (const [label, body, want] of cases) {
    const r = await post(P, '/api/payments/p2p', body);
    const j = r.json || {};
    (r.status === want && j.ok) ? ok(label + ' → معلّق ' + j.tx) : bad(label + ' → ' + r.status + ' ' + JSON.stringify(j));
  }

  console.log('\n═══ ب) سحب ببنية البوت ═══');
  const beforeWd = await coinsOf(P, 'username=qa_player');
  const rw = await post(P, '/api/withdrawals/request', { username: 'qa_player', method: 'Cash Plus', amount: 5, phone: '0677567089' });
  const jw = rw.json || {};
  jw.ok ? ok('طلب سحب ببنية البوت مقبول: ' + jw.tx) : bad('سحب ببنية البوت: ' + rw.status + ' ' + JSON.stringify(jw));
  const afterWd = await coinsOf(P, 'username=qa_player');
  (beforeWd - afterWd === 500) ? ok('خُصم 5$ (500 كوين) فور الطلب: ' + beforeWd + ' → ' + afterWd) : bad('الخصم: ' + beforeWd + ' → ' + afterWd);
  const rw2 = await post(P, '/api/withdrawals/request', { username: 'qa_player', method: 'cash_plus', amount: 99999, details: 'x' });
  const jw2 = rw2.json || {};
  (rw2.status === 402 && /رصيد/.test(jw2.message || '')) ? ok('سحب فوق الرصيد: رسالة عربية واضحة (402)') : bad('سحب فوق الرصيد: ' + rw2.status + ' ' + JSON.stringify(jw2));

  console.log('\n═══ ج) هوية مجهولة لا تُسجَّل معاملة يتيمة ═══');
  const rBad = await post(P, '/api/payments/p2p', { tg_id: '999999999', method: 'binance', amount_usd: 30, details: 'TX-ORPHAN' });
  const jBad = rBad.json || {};
  (!jBad.ok && rBad.status >= 400) ? ok('إيداع بهوية غير مربوطة مرفوض (لا معاملة معلّقة)') : bad('قُبلت هوية مجهولة: ' + JSON.stringify(jBad));
  const pend = await call(A, 'GET', '/api/admin/payments/pending');
  const pj = pend.json || {};
  const orphans = (pj.pending || []).filter((t) => /TX-ORPHAN|999999999/.test(JSON.stringify(t)));
  orphans.length === 0 ? ok('لا وجود لمعاملة يتيمة في قائمة المعلّقات') : bad('وُجدت معاملة يتيمة: ' + JSON.stringify(orphans[0]));

  console.log('\n═══ د) الكوبونات: إنشاء بصلاحية سوبر أدمن + استرداد بالاسم ═══');
  const mk = await post(A, '/api/vouchers/create', { amount: 10, count: 2, tg_id: '999000001' });
  const mj = mk.json || {};
  (mj.ok && Array.isArray(mj.codes) && mj.codes.length === 2) ? ok('إنشاء كودين بصلاحية سوبر أدمن تيليغرام: ' + mj.codes.join(', ')) : bad('إنشاء الأكواد: ' + mk.status + ' ' + JSON.stringify(mj));
  const mkNo = await post(A, '/api/vouchers/create', { amount: 10 });
  const mnj = mkNo.json || {};
  (mkNo.status === 403 && /hint/.test(JSON.stringify(mnj))) ? ok('بلا صلاحية: 403 مع إرشاد واضح') : bad('بلا صلاحية: ' + mkNo.status + ' ' + JSON.stringify(mnj));
  if (mj.ok) {
    const before = await coinsOf(P, 'username=qa_player');
    const rd = await post(P, '/api/vouchers/redeem', { username: 'qa_player', code: mj.codes[0] });
    const rj = rd.json || {};
    rj.ok ? ok('استرداد الكود بالاسم نجح (+10$ = 1000 كوين)') : bad('استرداد الكود: ' + rd.status + ' ' + JSON.stringify(rj));
    const after = await coinsOf(P, 'username=qa_player');
    (after - before === 1000) ? ok('الرصيد الحقيقي زاد 1000 كوين: ' + before + ' → ' + after) : bad('زيادة الرصيد: ' + before + ' → ' + after);
    const again = await post(P, '/api/vouchers/redeem', { username: 'qa_player', code: mj.codes[0] });
    (again.status === 404) ? ok('إعادة استعمال الكود مرفوضة (404 already-used)') : bad('إعادة الاستعمال: ' + again.status);
  }

  /* ═══ 2) الرصيد اللحظي: اعتماد إيداع من الأدمن ⇒ رصيد اللاعب يتغيّر بلا تحميل ═══ */
  console.log('\n═══ هـ) دفع الرصيد اللحظي (SSE) عند اعتماد الأدمن ═══');
  await P.reload({ waitUntil: 'domcontentloaded' });
  await P.waitForTimeout(3000);
  await P.evaluate(() => {
    window.__walletEvents = [];
    const orig = window.RC_wallet;
    window.RC_wallet = function (d) { try { window.__walletEvents.push(d); } catch (e) {} return orig ? orig(d) : null; };
  });
  const goldBefore = await P.evaluate(() => (typeof ST !== 'undefined' ? ST.gold : null));
  const dep = await post(A, '/api/payments/p2p', { username: 'qa_player', method: 'binance', amount: 20, details: 'TX-LIVE-PUSH' });
  const dj = dep.json || {};
  dj.ok ? ok('إيداع 20$ معلّق: ' + dj.tx) : bad('فشل إنشاء الإيداع: ' + JSON.stringify(dj));
  const appr = await post(A, '/api/admin/payments/act', { tx_id: dj.tx, action: 'approve' });
  const aj = appr.json || {};
  aj.ok ? ok('اعتماد الإيداع من لوحة الأدمن') : bad('الاعتماد: ' + appr.status + ' ' + JSON.stringify(aj));
  await P.waitForTimeout(2500);
  const ev = await P.evaluate(() => window.__walletEvents || []);
  const evOk = ev.some((d) => Number(d.delta) === 2000);
  evOk ? ok('وصل حدث wallet لحظياً بزيادة 2000 كوين') : bad('لم يصل حدث الرصيد: ' + JSON.stringify(ev));
  const goldAfter = await P.evaluate(() => ST.gold);
  (goldAfter - goldBefore === 2000) ? ok('رصيد الواجهة تغيّر بلا إعادة تحميل: ' + goldBefore + ' → ' + goldAfter) : bad('رصيد الواجهة: ' + goldBefore + ' → ' + goldAfter);
  const goldShown = await P.evaluate(() => { const el = document.getElementById('goldD'); return el ? el.textContent.trim() : null; });
  (String(goldShown).replace(/[^0-9]/g, '') === String(goldAfter)) ? ok('الرقم المعروض في الهيدر محدَّث (' + goldShown + ')') : bad('الهيدر يعرض: ' + goldShown + ' والمتوقع ' + goldAfter);
  const coinsDb = await coinsOf(P, 'username=qa_player');
  (coinsDb === goldAfter) ? ok('الرصيد في قاعدة البيانات مطابق للمعروض (' + coinsDb + ')') : bad('عدم تطابق: قاعدة=' + coinsDb + ' واجهة=' + goldAfter);

  console.log('\n═══ و) سجل الحساب: تاريخ الانضمام وآخر نشاط ═══');
  const meR = await call(P, 'GET', '/api/me');
  const u = (meR.json && meR.json.user) || {};
  (u.created_at > 1600000000 && u.last_seen > 1600000000) ? ok('/api/me يرسل created_at + last_seen (' + u.created_at + ' / ' + u.last_seen + ')') : bad('/api/me: ' + JSON.stringify({ c: u.created_at, l: u.last_seen }));
  await P.evaluate(() => { try { AUTH.user = null; } catch (e) {} });
  await P.evaluate(async () => {
    const r = await fetch(location.origin + '/api/me', { credentials: 'include' });
    const j = await r.json();
    if (j && j.ok) { ST.gold = j.user.gold; AUTH.user = j.user; }
    try { openAccountLog(); } catch (e) {}
  });
  await P.waitForTimeout(1200);
  const acct = await P.evaluate(() => {
    const el = document.getElementById('accountInfo');
    return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 400) : '';
  });
  const hasDate = /\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(acct);
  hasDate ? ok('سجل الحساب يعرض تواريخ حقيقية') : bad('سجل الحساب بلا تواريخ: ' + acct.slice(0, 160));
  /غير متوفر|N\/A|—/.test(acct) && !hasDate ? bad('ما زال «غير متوفر»') : ok('لا وجود لـ«غير متوفر» في السجل');
  await P.screenshot({ path: '/tmp/v243-account.png' });

  console.log('\n═══ ز) أخطاء الكونسول ═══');
  errs.length === 0 ? ok('لا أخطاء كونسول في الجلستين') : bad('أخطاء: ' + errs.slice(0, 4).join(' | '));

  await browser.close();
  console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
