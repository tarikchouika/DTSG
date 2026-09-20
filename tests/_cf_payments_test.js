'use strict';
/* ════════════════════════════════════════════════════════════════
   اختبارات ووركر المدفوعات — تُنفَّذ محلياً على Node عبر محاكي D1
   (node:sqlite) ومحاكي fetch لتيليغرام/Binance Pay/المنصة.
   تُشغَّل مسارات الكود الحقيقية في cf-worker/payments-core.js.
   تشغيل: node --experimental-sqlite tests/_cf_payments_test.js
   ════════════════════════════════════════════════════════════════ */
process.chdir(require('path').resolve(__dirname, '..'));
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const core = require('../cf-worker/payments-core.js');

let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond === undefined) cond = true;
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label); }
}

/* ── محاكي D1 فوق node:sqlite ── */
function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(require('path').join(__dirname, '..', 'cf-worker', 'schema.sql'), 'utf8'));
  function stmt(sql, args) {
    return {
      run: (...a2) => { const r = db.prepare(sql).run(...(args || []).concat(a2)); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, results: [] }; },
      all: (...a2) => ({ results: db.prepare(sql).all(...(args || []).concat(a2)) }),
      first: (...a2) => { const rows = db.prepare(sql).all(...(args || []).concat(a2)); return rows.length ? rows[0] : null; }
    };
  }
  return { prepare: (sql) => ({ bind: (...args) => stmt(sql, args) }) };
}

/* ── محاكي fetch ── */
const captured = { tg: [], platform: [], binance: [] };
/* حالة بوابة Binance Pay في المحاكي — تُعدَّل داخل الاختبارات */
const binanceState = { createFail: null, query: null, paid: '10' };
function mockFetch(env) {
  return async function (url, opts) {
    opts = opts || {};
    if (String(url).includes('api.telegram.org')) {
      const body = JSON.parse(opts.body || '{}');
      captured.tg.push({ method: String(url).split('/botx/')[1], body: body });
      return { json: async () => ({ ok: true, result: true }) };
    }
    if (String(url).includes('bpay.binanceapi.com')) {
      const body = JSON.parse(opts.body || '{}');
      const bpath = String(url).replace('https://bpay.binanceapi.com', '');
      captured.binance.push({ path: bpath, url: String(url), headers: opts.headers || {}, body: body, raw: String(opts.body || '') });
      if (bpath.includes('/order/query')) {
        return { json: async () => (binanceState.query || { status: 'SUCCESS', code: '000000', data: {
          merchantTradeNo: body.merchantTradeNo, prepayId: body.prepayId, orderStatus: 'PAID', totalFee: binanceState.paid, currency: 'USDT', transactionId: 'BTX-1' } }) };
      }
      if (binanceState.createFail && bpath.indexOf('/v2/') < 0) return { json: async () => binanceState.createFail };  /* الفشل على v3 فقط — v2 ينجح */
      return { json: async () => ({ status: 'SUCCESS', code: '000000', data: {
        prepayId: 'PREPAY-1', terminalType: 'WEB', checkoutUrl: 'https://pay.binance.example/x',
        universalUrl: 'https://app.binance.com/uni/x', deeplink: 'https://app.binance.com/dp/x',
        qrcodeLink: 'https://qr.binance.example/x', qrContent: 'https://app.binance.com/uni/x' } }) };
    }
    if (env.PLATFORM_URL && String(url).indexOf(env.PLATFORM_URL) === 0) {
      captured.platform.push({ url: url, headers: opts.headers, body: JSON.parse(opts.body || '{}') });
      return { json: async () => ({ ok: true, gold_added: 1000 }) };
    }
    return { json: async () => ({ ok: false }) };
  };
}

function req(method, url, body, headers) {
  const h = Object.assign({}, headers || {});
  if (body !== undefined) h['content-type'] = 'application/json';
  return new Request(url, {
    method: method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

(async () => {
  const D1 = makeD1();
  const env = {
    DATABASE_BINDING: D1,
    BINANCE_PAY_MERCHANT_ID: '132972522',
    BINANCE_PAY_API_KEY: 'test-api-key',
    BINANCE_PAY_SECRET_KEY: 'testsecret',
    SELLIX_WEBHOOK_SECRET: 'sellixsec',
    TELEGRAM_BOT_TOKEN: 'x',
    TELEGRAM_ADMIN_CHAT_ID: '777',
    TELEGRAM_ADMIN_PIN: 'pin123',
    ADMIN_API_SECRET: 'admsec',
    PAYMENTS_SHARED_SECRET: 'shsec',
    PLATFORM_URL: 'https://platform.example',
    WORKER_PUBLIC_URL: 'https://dstg.pages.dev',
    CASH_PLUS_NAME: 'Tarik chouika',
    CASH_PLUS_ACCOUNT: '835780030016238841734545',
    CRYPTO_USDT_TRC20: 'TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ',
    CIH_NAME: 'MONSIEUR TARIK CHOUIKA',
    CIH_ACCOUNT: '6904085211014200',
    CIH_RIB: '230 815 6904085211014200 24',
    CIH_IBAN: 'MA64 2308 1569 0408 5211 0142 0024',
    CIH_SWIFT: 'CIHMMAMC'
  };
  env.__fetch = mockFetch(env);
  const H = (m, u, b, h) => core.handleFetch(req(m, u, b, h), env);

  console.log('\n═══ DTSG Payments Worker ═══');

  /* 1) توقيع Binance Pay: HMAC-SHA512(ts \n nonce \n body \n) بست عشرية كبيرة */
  const sigPayload = '{"a":1}';
  const sigGot = await core.binancePaySign('1700000000000', 'abcnonce', sigPayload, 'testsecret');
  const sigWant = require('node:crypto').createHmac('sha512', 'testsecret')
    .update('1700000000000\nabcnonce\n' + sigPayload + '\n').digest('hex').toUpperCase();
  ok('توقيع Binance Pay مطابق للنمط الرسمي', sigGot === sigWant && /^[0-9A-F]{128}$/.test(sigGot), sigGot.slice(0, 12) + '…');

  /* 2) health + methods */
  let r = await H('GET', 'https://w/api/health');
  ok('health', (await r.json()).ok === true);
  r = await H('GET', 'https://w/api/payments/methods');
  let mj = await r.json();
  ok('methods: binance_pay live عند ضبط المفاتيح', mj.methods.find(m => m.id === 'binance_pay') && mj.methods.find(m => m.id === 'binance_pay').status === 'live');
  ok('methods: cash_plus live', mj.methods.find(m => m.id === 'cash_plus').status === 'live');
  ok('methods: cih live بحساب كامل', mj.methods.find(m => m.id === 'cih').status === 'live' && /MA64/.test(mj.methods.find(m => m.id === 'cih').account.iban));
  ok('methods: حساب Cash Plus ظاهر', mj.methods.find(m => m.id === 'cash_plus').account.number === env.CASH_PLUS_ACCOUNT);

  /* 3) كوبونات: إنشاء أدمن + استبدال ذري + منع إعادة الاستعمال */
  r = await H('POST', 'https://w/api/vouchers/create', { amount_usd: 25, count: 2 }, { 'x-admin-secret': 'admsec' });
  let vj = await r.json();
  ok('vouchers create (أدمن)', vj.ok && vj.codes.length === 2);
  r = await H('POST', 'https://w/api/vouchers/create', { amount_usd: 25, count: 1 });
  ok('vouchers create بدون سر = 403', r.status === 403);
  r = await H('POST', 'https://w/api/vouchers/redeem', { user_id: '42', code: vj.codes[0] });
  let rj = await r.json();
  ok('redeem كوبون +25', rj.ok && rj.amount_usd === 25);
  r = await H('POST', 'https://w/api/vouchers/redeem', { user_id: '43', code: vj.codes[0] });
  ok('إعادة استعمال كوبون مرفوضة', (await r.json()).error === 'already-used');
  r = await H('POST', 'https://w/api/vouchers/redeem', { user_id: '42', code: 'DTSG-NOPE-NOPE' });
  ok('كوبون غير صالح', (await r.json()).error === 'invalid-code');
  r = await H('GET', 'https://w/api/wallet/balance?user_id=42');
  ok('رصيد المستخدم 42 = 25', (await r.json()).balance_usd === 25);

  /* 4) Binance Pay: إنشاء طلب موقَّع + webhook + تأكيد الاستعلام + منع الشحن المزدوج */
  binanceState.paid = '10';
  r = await H('POST', 'https://w/api/payments/crypto', { user_id: '42', amount_usd: 10 });
  let cj = await r.json();
  ok('طلب Binance Pay منشأ (checkoutUrl + prepayId)', cj.ok && cj.gateway === 'binance_pay' && !!cj.checkoutUrl && cj.prepayId === 'PREPAY-1', JSON.stringify({ e: cj.error, d: cj.detail }));
  const call1 = captured.binance[0];
  ok('Certificate-SN = API Key (لا Merchant ID)', call1.headers['BinancePay-Certificate-SN'] === 'test-api-key');
  ok('توقيع الطلب = HMAC-SHA512 المعياري', call1.headers['BinancePay-Signature'] ===
    (await core.binancePaySign(call1.headers['BinancePay-Timestamp'], call1.headers['BinancePay-Nonce'], call1.raw, 'testsecret')));
  ok('المبلغ بالوحدة الصحيحة (10 لا 1000)', call1.body.orderAmount === 10 && call1.body.currency === 'USDT', JSON.stringify(call1.body).slice(0, 120));
  const call1IsV3 = call1.path === '/binancepay/openapi/order';
  ok('الطلب على المسار الشخصي v3 أولاً', call1IsV3, call1.path);
  ok('v3 نجح ⇒ لا نداء زائد على v2 (اختصار)', !captured.binance.some(c => c.path === '/binancepay/openapi/v2/order'));
  const prow = D1.prepare('SELECT method, status FROM transactions WHERE id=?1').bind(cj.order_id).first();
  ok('سُجّل إيداع binance_pay معلّق', prow && prow.method === 'binance_pay' && prow.status === 'pending');
  /* [v2.46] حساب تاجر: v3 يرفض (INVALID_MERCHANT) ⇒ v2 ينجح */
  binanceState.createFail = { status: 'FAIL', code: '40300', errorMessage: 'INVALID_MERCHANT' };
  r = await H('POST', 'https://w/api/payments/crypto', { user_id: '42', amount_usd: 5 });
  let cj2 = await r.json();
  ok('حساب تاجر: v3 يفشل ⇒ v2 ينشئ الطلب', cj2.ok && cj2.prepayId === 'PREPAY-1', JSON.stringify({ e: cj2.error, d: cj2.detail }).slice(0, 120));
  ok('تم استدعاء v2 بم merchantTradeNo', !!captured.binance.find(c => c.path === '/binancepay/openapi/v2/order' && c.body.merchantTradeNo && c.body.orderAmount === 5));
  binanceState.createFail = { status: 'FAIL', code: '400004', errorMessage: 'Invalid API-key, IP, or permissions' };
  r = await H('POST', 'https://w/api/payments/crypto', { user_id: '42', amount_usd: 3 });
  let cj3 = await r.json();
  ok('400004 (مفتاح/IP) ⇒ فشل سريع بلا محاولات زائدة', cj3 && !cj3.ok && cj3.error === 'order-failed', JSON.stringify(cj3 && cj3.detail));
  delete binanceState.createFail;

  /* webhook موقَّع + استعلام PAID ⇒ شحن تلقائي */
  const wdata = JSON.stringify({ merchantTradeNo: cj.order_id, totalFee: '10', currency: 'USDT', transactionId: 'BTX-1' });
  const wraw = JSON.stringify({ bizType: 'PAY', bizStatus: 'PAY_SUCCESS', bizId: '1', data: wdata });
  const wts = String(Date.now()), wnonce = 'wnonce1';
  const wsig = await core.binancePaySign(wts, wnonce, wraw, 'testsecret');
  const wh = { 'Binancepay-Timestamp': wts, 'Binancepay-Nonce': wnonce, 'Binancepay-Signature': wsig };
  r = await core.handleFetch(new Request('https://w/api/webhooks/binance', { method: 'POST', headers: wh, body: wraw }), env);
  ok('webhook موقَّع + PAID من الاستعلام → شحن', (await r.json()).returnCode === 'SUCCESS' && captured.binance.some(c => c.url.includes('/order/query')));
  r = await H('GET', 'https://w/api/wallet/balance?user_id=42');
  ok('الرصيد 35 بعد شحن Binance Pay', (await r.json()).balance_usd === 35);
  const pc = captured.platform[captured.platform.length - 1];
  ok('platform credit استُدعي بالسر المشترك', !!pc && pc.headers['x-pay-secret'] === 'shsec' && pc.body.usd === 10);
  /* idempotency: إعادة نفس الإشعار لا تشحن مرتين */
  r = await core.handleFetch(new Request('https://w/api/webhooks/binance', { method: 'POST', headers: wh, body: wraw }), env);
  r = await H('GET', 'https://w/api/wallet/balance?user_id=42');
  ok('إعادة webhook لا تشحن مرتين', (await r.json()).balance_usd === 35);
  /* استعلام غير مؤكد (PENDING) ⇒ لا شحن */
  r = await H('POST', 'https://w/api/payments/crypto', { user_id: '43', amount_usd: 20 });
  let m2 = await r.json();
  const w2data = JSON.stringify({ merchantTradeNo: m2.order_id, totalFee: '20', currency: 'USDT' });
  const w2raw = JSON.stringify({ bizType: 'PAY', bizStatus: 'PAY_SUCCESS', data: w2data });
  binanceState.query = { status: 'SUCCESS', code: '000000', data: { merchantTradeNo: m2.order_id, orderStatus: 'PENDING', totalFee: '20', currency: 'USDT' } };
  r = await core.handleFetch(new Request('https://w/api/webhooks/binance', { method: 'POST', headers: wh, body: w2raw }), env);
  ok('استعلام غير مؤكد ⇒ FAIL (بلا شحن)', (await r.json()).returnCode === 'FAIL');
  r = await H('GET', 'https://w/api/wallet/balance?user_id=43');
  ok('لم يُشحن (الرصيد 0)', (await r.json()).balance_usd === 0);
  /* مبلغ ناقص ⇒ لا شحن آلي + تنبيه أدمن */
  const before43 = captured.tg.length;
  binanceState.query = null; binanceState.paid = '5';
  r = await core.handleFetch(new Request('https://w/api/webhooks/binance', { method: 'POST', headers: wh, body: w2raw }), env);
  r = await H('GET', 'https://w/api/wallet/balance?user_id=43');
  ok('مبلغ ناقص ⇒ لا شحن آلي + تنبيه أدمن', (await r.json()).balance_usd === 0 && captured.tg.slice(before43).some(t => /مبلغ ناقص/.test(t.body.text || '')));
  /* طلب لا يخصّنا ⇒ SUCCESS بلا شحن */
  binanceState.paid = '20';
  const fraw = JSON.stringify({ bizType: 'PAY', bizStatus: 'PAY_SUCCESS', data: JSON.stringify({ merchantTradeNo: 'dtsg-unknown', totalFee: '20' }) });
  r = await core.handleFetch(new Request('https://w/api/webhooks/binance', { method: 'POST', headers: wh, body: fraw }), env);
  ok('طلب مجهول ⇒ SUCCESS بلا شحن', (await r.json()).returnCode === 'SUCCESS');
  /* فشل البوابة ⇒ 502 مع سبب مختصر (بلا أسرار) */
  binanceState.createFail = { status: 'FAIL', code: '400004', errorMessage: 'Invalid API-key, IP, or permissions for action' };
  r = await H('POST', 'https://w/api/payments/crypto', { user_id: '42', amount_usd: 10 });
  const fj = await r.json();
  ok('فشل البوابة ⇒ 502 + السبب', r.status === 502 && fj.error === 'order-failed' && /400004/.test(fj.detail || ''));
  binanceState.createFail = null;

  /* 5) Sellix webhook HMAC */
  const sraw = JSON.stringify({ data: { status: 'COMPLETED', order: { uniqid: 'sx-1', amount: 5, custom: '42' } } });
  const ssig = require('node:crypto').createHmac('sha256', 'sellixsec').update(sraw).digest('hex');
  /* نحتاج مستخدماً 42 ومعامل sellix معلق؟ completeDeposit يتطلب tx موجوداً — أنشئ عبر p2p أولاً؟ الأبسط: أنشئ tx sellix يدوياً */
  D1.prepare("INSERT INTO transactions (id, user_id, type, amount_usd, method, status) VALUES ('sx-1','42','deposit',5,'sellix','pending')").bind().run();
  r = await core.handleFetch(new Request('https://w/api/webhooks/sellix', { method: 'POST', headers: { 'sellix-signature': ssig }, body: sraw }), env);
  ok('webhook sellix موقّع → شحن +5', (await r.json()).applied === true);
  r = await core.handleFetch(new Request('https://w/api/webhooks/sellix', { method: 'POST', headers: { 'sellix-signature': 'nope' }, body: sraw }), env);
  ok('توقيع sellix سيئ = 401', r.status === 401);

  /* 6) P2P: إيداع معلق + موافقة أدمن من تيليغرام + إشعار منصة */
  r = await H('POST', 'https://w/api/payments/p2p', { user_id: '43', username: 'tarik', method: 'cash_plus', amount_usd: 20, proof_details: 'CP-REF-999' });
  let pj = await r.json();
  ok('إيداع P2P معلق', pj.ok && pj.status === 'pending');
  const admNotif = captured.tg.filter(t => t.method === 'sendMessage' && t.body.chat_id === '777').pop();
  ok('إشعار أدمن بزرّي تأكيد/رفض', admNotif && /CP-REF-999/.test(admNotif.body.text) && admNotif.body.reply_markup.inline_keyboard.length === 2);
  const dBtn = admNotif.body.reply_markup.inline_keyboard[0][0].callback_data;
  r = await H('POST', 'https://w/api/telegram/webhook', { callback_query: { id: 'q1', from: { id: 777 }, data: dBtn } });
  ok('موافقة الأدمن على الإيداع', (await r.json()).ok === true);
  r = await H('GET', 'https://w/api/wallet/balance?user_id=43');
  ok('رصيد 43 = 20 بعد التأكيد', (await r.json()).balance_usd === 20);

  /* 7) سحب: خصم فوري + رفض يعيد الرصيد */
  r = await H('POST', 'https://w/api/withdrawals/request', { user_id: '43', method: 'cash_plus', amount_usd: 8, details: '0661234567' });
  let wj = await r.json();
  ok('طلب سحب مقبول', wj.ok === true);
  r = await H('GET', 'https://w/api/wallet/balance?user_id=43');
  ok('الخصم الفوري 20-8=12', (await r.json()).balance_usd === 12);
  r = await H('POST', 'https://w/api/withdrawals/request', { user_id: '43', method: 'cash_plus', amount_usd: 999, details: 'x' });
  ok('سحب فوق الرصيد مرفوض 402', r.status === 402);
  const wBtns = captured.tg.filter(t => t.method === 'sendMessage' && t.body.chat_id === '777').pop().body.reply_markup.inline_keyboard;
  r = await H('POST', 'https://w/api/telegram/webhook', { callback_query: { id: 'q2', from: { id: 777 }, data: wBtns[1][0].callback_data } });
  ok('رفض السحب يعيد الرصيد', (await r.json()).ok === true);
  r = await H('GET', 'https://w/api/wallet/balance?user_id=43');
  ok('الرصيد عاد 20', (await r.json()).balance_usd === 20);
  /* زر غير أدمن مرفوض */
  r = await H('POST', 'https://w/api/telegram/webhook', { callback_query: { id: 'q3', from: { id: 999 }, data: wBtns[0][0].callback_data } });
  ok('زر أدمن من غير الأدمن = 403', r.status === 403);

  /* 8) بوت العميل: ربط + رصيد + إيداع بوصل صورة */
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 555 }, from: { first_name: 'T' }, text: '/start plt_43' } });
  ok('ربط تيليغرام بالمستخدم', (await r.json()).ok === true);
  const linked = D1.prepare('SELECT telegram_id FROM users WHERE id=?1').bind('43').first();
  ok('telegram_id محفوظ', linked && String(linked.telegram_id) === '555');
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 555 }, text: '/deposit 15' } });
  ok('أمر /deposit ينشئ معاملة معلقة ويعرض حساب Cash Plus', (await r.json()).ok === true && captured.tg.some(t => t.body.chat_id === '555' && /Tarik chouika/.test(t.body.text)));
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 555 }, photo: [{ file_id: 'f1' }, { file_id: 'fBIG' }] } });
  ok('صورة الوصل تحدّث المعاملة وتُخطر الأدمن', (await r.json()).ok === true);
  const proofed = D1.prepare("SELECT proof_details, status FROM transactions WHERE user_id='43' AND method='cash_plus' ORDER BY rowid DESC LIMIT 1").bind().first();
  ok('الوصل محفوظ photo:fBIG وحالة pending', proofed && proofed.proof_details === 'photo:fBIG' && proofed.status === 'pending');

  /* 9) أتمتة الكوبونات عبر تيليغرام بمصادقة السوبر أدمن */
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 555 }, text: '/voucher 10 2' } });
  ok('voucher قبل التوثيق مرفوض', captured.tg.some(t => t.body.chat_id === '555' && /مقصور على السوبر أدمن/.test(t.body.text)));
  /* شات السوبر أدمن (TELEGRAM_ADMIN_CHAT_ID) موثَّق دائماً — /auth اختياري له */
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 777 }, text: '/voucher 10 1' } });
  ok('شات السوبر أدمن ينشئ كوبوناً بلا /auth', (await r.json()).ok === true && captured.tg.some(t => t.body.chat_id === '777' && /DTSG-/.test(t.body.text || '')));
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 777 }, text: '/auth wrong' } });
  ok('PIN خاطئ مرفوض', captured.tg.some(t => t.body.chat_id === '777' && /غير صحيح/.test(t.body.text)));
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 777 }, text: '/auth pin123' } });
  ok('توثيق السوبر أدمن', captured.tg.some(t => t.body.chat_id === '777' && /تم توثيقك/.test(t.body.text)));
  const before = captured.tg.length;
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 777 }, text: '/voucher 10 2' } });
  const codesMsg = captured.tg.slice(before).find(t => /DTSG-/.test(t.body.text || ''));
  const tCodes = (codesMsg ? codesMsg.body.text.match(/DTSG-[A-Z0-9]{4}-[A-Z0-9]{4}/g) : []) || [];
  ok('إنشاء كوبونين عبر تيليغرام', tCodes.length === 2);
  if (tCodes.length === 2) {
    r = await H('POST', 'https://w/api/vouchers/redeem', { user_id: '42', code: tCodes[0] });
    ok('كوبون تيليغرام يُستبدل', (await r.json()).ok === true);
  } else { ok('كوبون تيليغرام يُستبدل', false); }
  /* 10) /payinfo خلف مصادقة السوبر أدمن */
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 999 }, text: '/payinfo' } });
  ok('payinfo لغير الموثق مرفوض', captured.tg.some(t => t.body.chat_id === '999' && /مقصورة على السوبر أدمن/.test(t.body.text)));
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 777 }, text: '/payinfo' } });
  const pi = captured.tg.filter(t => t.body.chat_id === '777' && /BINANCE/.test(t.body.text)).pop();
  ok('payinfo يعرض بايننس TRC20', !!pi && /TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ/.test(pi.body.text));
  ok('payinfo يعرض CIH كاملاً', !!pi && /MA64 2308 1569 0408 5211 0142 0024/.test(pi.body.text) && /CIHMMAMC/.test(pi.body.text));
  ok('payinfo يعرض Cash Plus', !!pi && /835780030016238841734545/.test(pi.body.text));

  /* غير الأدمن حتى برقم آخر لا ينشئ */
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 999 }, text: '/voucher 10 1' } });
  ok('غير الموثق لا ينشئ كوبونات', captured.tg.some(t => t.body.chat_id === '999' && /مقصور على السوبر أدمن/.test(t.body.text)));

  /* 11) أكواد الشحن بالشرائح (أدمنز/مباشر) */
  ok('tierCoins أدمنز 1000 usd = 130000 (30%)', core.tierCoins('admin', 1000, 'usd').coins === 130000);
  ok('tierCoins أدمنز 1000 mad = 13000', core.tierCoins('admin', 1000, 'mad').coins === 13000);
  ok('tierCoins مباشر 10 usd = 1000', core.tierCoins('direct', 10, 'usd').coins === 1000);
  ok('tierCoins مباشر 10000 usd = 1150000', core.tierCoins('direct', 10000, 'usd').coins === 1150000);
  let goldBefore = 0; env.__creditGold = function (u, c) { goldBefore += c; };
  r = await H('POST', 'https://w/api/vouchers/create', { kind: 'admin', tier: 1000, currency: 'usd' }, { 'x-admin-secret': 'admsec' });
  let tj = await r.json();
  ok('كود أدمنز 1000$ (+30%) منشأ', tj.ok && tj.coins === 130000);
  r = await H('POST', 'https://w/api/vouchers/redeem', { user_id: '42', code: tj.codes[0] });
  let rj2 = await r.json();
  ok('كود الأدمنز يشحن 130000 كوين', rj2.ok && rj2.coins === 130000 && goldBefore === 130000);
  /* عبر بوت تيليغرام: مباشر 100 mad */
  const t0 = captured.tg.length;
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 777 }, text: '/code direct 100 mad' } });
  const cmMsg = captured.tg.slice(t0).find(t => /DTSG-/.test(t.body.text || ''));
  const dCode = cmMsg && (cmMsg.body.text.match(/DTSG-[A-Z0-9]{4}-[A-Z0-9]{4}/) || [])[0];
  ok('بوت: كود مباشر 100 mad (+5%) = 1050 كوين', !!cmMsg && /1050/.test(cmMsg.body.text));
  if (dCode) {
    goldBefore = 0;
    r = await H('POST', 'https://w/api/vouchers/redeem', { user_id: '43', code: dCode });
    ok('كود البوت يُستبدل بـ1050 كوين', (await r.json()).coins === 1050 && goldBefore === 1050);
  } else ok('كود البوت يُستبدل بـ1050 كوين', false);
  /* شريحة غير صالحة مرفوضة */
  r = await H('POST', 'https://w/api/vouchers/create', { kind: 'admin', tier: 77, currency: 'usd' }, { 'x-admin-secret': 'admsec' });
  ok('شريحة غير صالحة 400', r.status === 400);
  /* غير السوبر ممنوع */
  r = await H('POST', 'https://w/api/vouchers/create', { kind: 'admin', tier: 100, currency: 'usd' });
  ok('بدون سر/جلسة = 403', r.status === 403);

  /* 12) مسار مخطط المنصة (gold عبر الهوكس) — ربط تيليغرام وشحن */
  const plat = { 42: { id: 42, gold: 5000 } };
  env.__setTelegram = (id, chat) => { if (plat[id]) plat[id].tg = String(chat); };
  env.__getTelegram = (id) => (plat[id] && plat[id].tg) || null;
  env.__findByTelegram = (chat) => { for (const k in plat) if (plat[k].tg === String(chat)) return { id: k, usd: plat[k].gold / 100, coins: plat[k].gold }; return null; };
  env.__balance = (id) => plat[id] ? { usd: plat[id].gold / 100, coins: plat[id].gold } : null;
  env.__creditUsd = (id, usd) => { plat[id].gold += Math.round(Number(usd) * 100); };
  env.__debitUsd = (id, usd) => { const c = Math.round(Number(usd) * 100); if (!plat[id] || plat[id].gold < c) return false; plat[id].gold -= c; return true; };
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 888 }, text: '/start plt_42' } });
  ok('ربط /start plt_42 يثبت telegram_id', plat[42].tg === '888' && (await r.json()).ok === true);
  const t1 = captured.tg.length;
  r = await H('POST', 'https://w/api/telegram/webhook', { message: { chat: { id: 888 }, text: '/balance' } });
  ok('/balance للمربوط يعرض الكوينز', captured.tg.slice(t1).some(t => t.body.chat_id === '888' && /كوين/.test(t.body.text) && /50 USD/.test(t.body.text)));
  await D1.prepare("INSERT INTO transactions (id, user_id, type, amount_usd, method, status) VALUES ('tx-bridge','42','deposit',5,'sellix','pending')").bind().run();
  await core.completeDeposit(env, D1, 'tx-bridge', 7);
  ok('completeDeposit يشحن gold عبر __creditUsd', plat[42].gold === 5700);

  console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
