'use strict';
/* ════════════════════════════════════════════════════════════════
   اختبارات ووركر المدفوعات — تُنفَّذ محلياً على Node عبر محاكي D1
   (node:sqlite) ومحاكي fetch لتيليغرام/Cryptomus/المنصة.
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
const captured = { tg: [], platform: [], cryptomus: [] };
function mockFetch(env) {
  return async function (url, opts) {
    opts = opts || {};
    if (String(url).includes('api.telegram.org')) {
      const body = JSON.parse(opts.body || '{}');
      captured.tg.push({ method: String(url).split('/botx/')[1], body: body });
      return { json: async () => ({ ok: true, result: true }) };
    }
    if (String(url).includes('api.cryptomus.com')) {
      const body = JSON.parse(opts.body || '{}');
      captured.cryptomus.push({ headers: opts.headers, body: body });
      return { json: async () => ({ result: 'true', order_id: body.order_id, uuid: 'cu-1', address: 'TTESTADDR', currency: 'USDT', amount: body.amount, url: 'https://pay.cryptomus.example/x' }) };
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
    CRYPTOMUS_PAYMENT_KEY: 'testkey',
    CRYPTOMUS_MERCHANT_ID: 'merchant1',
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

  /* 1) MD5 قياسي (لازم لتوقيع Cryptomus) */
  ok('md5("abc") قياسي', core.md5('abc') === '900150983cd24fb0d6963f7d28e17f72');

  /* 2) health + methods */
  let r = await H('GET', 'https://w/api/health');
  ok('health', (await r.json()).ok === true);
  r = await H('GET', 'https://w/api/payments/methods');
  let mj = await r.json();
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

  /* 4) Cryptomus: فاتورة + webhook موقّع + رفض توقيع سيئ */
  r = await H('POST', 'https://w/api/payments/crypto', { user_id: '42', amount_usd: 10 });
  let cj = await r.json();
  ok('فاتورة كريبتو منشأة', cj.ok && cj.address === 'TTESTADDR');
  ok('توقيع Cryptomus md5(base64+key)', captured.cryptomus[0].headers.sign === core.cryptomusSign(captured.cryptomus[0].body, 'testkey'));
  const payload = { order_id: cj.order_id, status: 'paid', amount: '10' };
  const raw = JSON.stringify(payload);
  const signGood = core.md5(btoa(raw) + 'testkey');
  r = await core.handleFetch(new Request('https://w/api/webhooks/cryptomus', { method: 'POST', headers: { sign: signGood }, body: raw }), env);
  ok('webhook كريبتو موقّع → شحن', (await r.json()).applied === true);
  r = await H('GET', 'https://w/api/wallet/balance?user_id=42');
  ok('الرصيد 35 بعد الشحن', (await r.json()).balance_usd === 35);
  const pc = captured.platform[captured.platform.length - 1];
  ok('platform credit استُدعي بالسر المشترك', !!pc && pc.headers['x-pay-secret'] === 'shsec' && pc.body.usd === 10);
  const raw2 = JSON.stringify({ order_id: cj.order_id, status: 'paid', amount: '10' });
  r = await core.handleFetch(new Request('https://w/api/webhooks/cryptomus', { method: 'POST', headers: { sign: 'bad' }, body: raw2 }), env);
  ok('توقيع كريبتو سيئ = 401', r.status === 401);
  /* idempotency: إعادة webhook بنفس order_id لا تشحن مرتين */
  r = await core.handleFetch(new Request('https://w/api/webhooks/cryptomus', { method: 'POST', headers: { sign: signGood }, body: raw }), env);
  ok('إعادة webhook لا تشحن مرتين', (await r.json()).applied === false);
  r = await H('GET', 'https://w/api/wallet/balance?user_id=42');
  ok('الرصيد ما زال 35', (await r.json()).balance_usd === 35);

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
  ok('tierCoins أدمنز 100 usd = 12500', core.tierCoins('admin', 100, 'usd').coins === 12500);
  ok('tierCoins أدمنز 1000 mad = 13000', core.tierCoins('admin', 1000, 'mad').coins === 13000);
  ok('tierCoins مباشر 10 usd = 1000', core.tierCoins('direct', 10, 'usd').coins === 1000);
  ok('tierCoins مباشر 10000 usd = 1150000', core.tierCoins('direct', 10000, 'usd').coins === 1150000);
  let goldBefore = 0; env.__creditGold = function (u, c) { goldBefore += c; };
  r = await H('POST', 'https://w/api/vouchers/create', { kind: 'admin', tier: 100, currency: 'usd' }, { 'x-admin-secret': 'admsec' });
  let tj = await r.json();
  ok('كود أدمنز 100$ (+25%) منشأ', tj.ok && tj.coins === 12500);
  r = await H('POST', 'https://w/api/vouchers/redeem', { user_id: '42', code: tj.codes[0] });
  let rj2 = await r.json();
  ok('كود الأدمنز يشحن 12500 كوين', rj2.ok && rj2.coins === 12500 && goldBefore === 12500);
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

  console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
