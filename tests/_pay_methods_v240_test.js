/* ═══════════════════════════════════════════════════════════════════════
   tests/_pay_methods_v240_test.js — مسارات الدفع اليدوية (v2.40)
   يتحقق من العلّتين المُصلَحتين هذه الجولة:
     1) طلب سحب بـ Binance كان يفشل: CHECK constraint على method في pay_transactions
     2) إيداع Binance اليدوي (TXID) كان مرفوضاً في /api/payments/p2p
   يشغّل المسارات الحقيقية في cf-worker/payments-core.js فوق محاكي D1 (node:sqlite)
   التشغيل: node tests/_pay_methods_v240_test.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
process.chdir(require('path').resolve(__dirname, '..'));
const { DatabaseSync } = require('node:sqlite');
const core = require('../cf-worker/payments-core.js');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(l, c, x) { if (c) { pass++; console.log('  ✅ ' + l + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + l + (x ? '  ' + x : '')); } }

/* محاكي D1 (كما في _cf_payments_test) مع دعم ?1/?2 */
function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'cf-worker', 'schema.sql'), 'utf8'));
  function stmt(sql, args) {
    return {
      run: (...a2) => { const r = db.prepare(sql).run(...(args || []).concat(a2)); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, results: [] }; },
      all: (...a2) => ({ results: db.prepare(sql).all(...(args || []).concat(a2)) }),
      first: (...a2) => { const rows = db.prepare(sql).all(...(args || []).concat(a2)); return rows.length ? rows[0] : null; }
    };
  }
  return { prepare: (sql) => ({ bind: (...args) => stmt(sql, args) }), _raw: db };
}

function mkEnv(db, over) {
  return Object.assign({
    DATABASE_BINDING: db, BINANCE_PAY_MERCHANT_ID: '132972522', BINANCE_PAY_API_KEY: 'k', BINANCE_PAY_SECRET_KEY: 's',
    TELEGRAM_BOT_TOKEN: '', TELEGRAM_ADMIN_CHAT_ID: '', ADMIN_API_SECRET: 'secret',
    CASH_PLUS_NAME: 'TARIK CHOUIKA', CASH_PLUS_ACCOUNT: '0766672027',
    CIH_NAME: 'MONSIEUR TARIK CHOUIKA', CIH_ACCOUNT: '6904085211014200',
    CIH_RIB: '230 815 6904085211014200 24', CIH_IBAN: 'MA64 2308 1569 0408 5211 0142 0024',
    CIH_SWIFT: 'CIHMMAMC', BINANCE_TRC20: 'TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ',
    CRYPTO_USDT_TRC20: 'TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ', USD_GOLD_RATE: '100',
    /* جسر المخطط: مستخدم المنصة (gold) بدل balance_usd */
    __rate: () => 100,
    __findUserRow: (id) => null,
    __balance: () => ({ usd: 100, coins: 10000 }),
    __creditUsd: () => true,
    __debitUsd: () => true
  }, over || {});
}
function req(method, url, body) {
  const opts = { method: method, headers: {} };
  if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  return new Request('https://pay.test' + url, opts);
}

(async () => {
  const db = makeD1();
  const env = mkEnv(db);
  /* مستخدمو المنصة موجودون سلفاً (مسار الجسر) — ولهذا نُدرج صفاً في users
     لأن المخطط يفرض مفتاحاً أجنبياً على transactions.user_id */
  ['1', '7', '8'].forEach(id => db._raw.prepare("INSERT OR IGNORE INTO users (id, balance_usd) VALUES (?, 1000)").run(id));
  const globalFetch = global.fetch;
  global.fetch = async () => ({ json: async () => ({ ok: true, result: true }) });  /* تيليغرام/Binance Pay */

  console.log('\n── 1) المخطط: method يقبل binance ──');
  const schemaOk = await (async () => {
    const tryInsert = (m) => {
      try {
        db._raw.prepare("INSERT INTO transactions (id,user_id,type,amount_usd,method,status) VALUES (?,?,?,?,?,?)")
          .run('t-' + m, '1', 'withdrawal', 5, m, 'pending');
        return true;
      } catch (e) { return String(e.message); }
    };
    const r = { binance: tryInsert('binance'), cih: tryInsert('cih'), cash_plus: tryInsert('cash_plus') };
    return r;
  })();
  ['binance', 'cih', 'cash_plus'].forEach(m => ok('method="' + m + '" مقبول في المخطط', schemaOk[m] === true, schemaOk[m] === true ? '' : '(' + schemaOk[m] + ')'));

  console.log('\n── 2) إيداع يدوي: Binance (TXID) عبر /api/payments/p2p ──');
  let r = await core.handleFetch(req('POST', '/api/payments/p2p', { user_id: 7, username: 'u7', method: 'binance', amount_usd: 25, proof_details: 'TXID-0xabc' }), env);
  let j = await r.json();
  ok('إيداع Binance يدوي = مقبول ويُنشئ معاملة معلقة', j.ok === true && j.status === 'pending', JSON.stringify(j));
  r = await core.handleFetch(req('POST', '/api/payments/p2p', { user_id: 7, username: 'u7', method: 'cash_plus', amount_usd: 10, proof_details: 'CP-1' }), env);
  j = await r.json();
  ok('إيداع Cash Plus ما زال يعمل', j.ok === true, JSON.stringify(j));
  r = await core.handleFetch(req('POST', '/api/payments/p2p', { user_id: 7, username: 'u7', method: 'nonsense', amount_usd: 10, proof_details: 'x' }), env);
  ok('وسيلة مجهولة تُرفض (bad-input)', (await r.json()).error === 'bad-input');
  r = await core.handleFetch(req('POST', '/api/payments/p2p', { user_id: 7, username: 'u7', method: 'binance', amount_usd: 25 }), env);
  ok('Binance بلا TXID/وصل يُرفض', (await r.json()).error === 'bad-input');

  console.log('\n── 3) طلب سحب: Binance (العلّة الأصلية) ──');
  r = await core.handleFetch(req('POST', '/api/withdrawals/request', { user_id: 7, username: 'u7', method: 'binance', amount_usd: 5, details: 'TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ' }), env);
  j = await r.json();
  ok('سحب Binance يُقبل الآن (كان CHECK constraint failed)', j.ok === true && /^wd-/.test(j.tx || ''), JSON.stringify(j));
  r = await core.handleFetch(req('POST', '/api/withdrawals/request', { user_id: 7, username: 'u7', method: 'cih', amount_usd: 3, details: 'MA64...' }), env);
  ok('سحب CIH يعمل', (await r.json()).ok === true);
  const rows = db._raw.prepare("SELECT method, type, status FROM transactions WHERE type='withdrawal' AND id LIKE 'wd-%' ORDER BY rowid").all();
  ok('سطرا السحب مسجلان بالوسيلتين الصحيحتين', rows.length === 2 && rows[0].method === 'binance' && rows[1].method === 'cih', JSON.stringify(rows));

  console.log('\n── 4) حماية الرصيد (لا سحب بلا رصيد) ──');
  const envPoor = mkEnv(makeD1(), { __debitUsd: () => false });
  r = await core.handleFetch(req('POST', '/api/withdrawals/request', { user_id: 8, username: 'u8', method: 'binance', amount_usd: 5, details: 'x' }), envPoor);
  ok('رصيد غير كافٍ ⇒ 402 insufficient-balance', r.status === 402 && (await r.json()).error === 'insufficient-balance');

  global.fetch = globalFetch;
  console.log('\n═══ مسارات الدفع v2.40: ' + pass + ' نجح / ' + fail + ' فشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });
