'use strict';
/* ════════════════════════════════════════════════════════════════
   DTSG Payments — موحّد داخل منصة node فوق قاعدة SQLite المحلية.
   [تصحيح 2026-09-16] لا Cloudflare D1: المنصة تعتمد SQLite محلية،
   لذلك يُركَّب payments-core.js هنا مباشرة ويشارك نفس اتصال db.
   المنطق المالي المُختبَر (36/36) يعيش في cf-worker/payments-core.js.
   الأسرار من process.env:
     CRYPTOMUS_PAYMENT_KEY, CRYPTOMUS_MERCHANT_ID, SELLIX_WEBHOOK_SECRET,
     TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, ADMIN_API_SECRET,
     USD_GOLD_RATE, CASH_PLUS_NAME, CASH_PLUS_ACCOUNT, PLATFORM_PUBLIC_URL
   ════════════════════════════════════════════════════════════════ */
const core = require('./cf-worker/payments-core.js');

/* ── المخطط: توسيع users + جدولا transactions/vouchers (إن لم توجد) ── */
function initPaymentsTables(db) {
  /* SQLite لا يسمح بعمود UNIQUE عبر ALTER TABLE — أعمدة عادية + فهارس وحيدة جزئية */
  const alters = [
    'ALTER TABLE users ADD COLUMN telegram_id TEXT',
    'ALTER TABLE users ADD COLUMN email TEXT',
    'ALTER TABLE users ADD COLUMN balance_usd REAL DEFAULT 0'
  ];
  for (const a of alters) { try { db.exec(a); } catch (e) { /* العمود موجود */ } }
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_telegram ON users(telegram_id) WHERE telegram_id IS NOT NULL'); } catch (e) {}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email) WHERE email IS NOT NULL'); } catch (e) {}
  /* أسماء مميزة: جدول transactions الموجود هو سجل ذهب المنصة (server-tx) —
     لا نلمسه؛ جداول المحفظة USD مستقلة باسم pay_* */
  db.exec(`
    CREATE TABLE IF NOT EXISTS pay_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT CHECK(type IN ('deposit', 'withdrawal')),
      amount_usd REAL NOT NULL,
      method TEXT CHECK(method IN ('sellix', 'cryptomus', 'cih', 'orange_money', 'cash_plus', 'binance', 'voucher')),
      status TEXT CHECK(status IN ('pending', 'completed', 'rejected')) DEFAULT 'pending',
      proof_details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS pay_vouchers (
      code TEXT PRIMARY KEY,
      amount_usd REAL NOT NULL,
      is_used BOOLEAN DEFAULT FALSE,
      used_by_user_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(used_by_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_pay_tx_user   ON pay_transactions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pay_tx_status ON pay_transactions(status);
    CREATE TABLE IF NOT EXISTS tg_admin_sessions (
      chat_id TEXT PRIMARY KEY,
      since TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try { db.exec('ALTER TABLE users ADD COLUMN telegram_id TEXT'); } catch (e) { /* موجود */ }

  /* [v2.40] ترحيل: عمود method في pay_transactions كان يرفض 'binance'
     (المحفظة تعرض Binance كوسيلة سحب/إيداع حيّة منذ v2.38) — SQLite لا يعدّل
     CHECK على جدول قائم، فنعيد بناء الجدول مع نقل كل الصفوف كما هي. */
  try {
    const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pay_transactions'").get();
    if (ddl && ddl.sql && ddl.sql.indexOf('binance') === -1) {
      const cols = db.prepare('PRAGMA table_info(pay_transactions)').all().map(function (c) { return c.name; }).join(', ');
      db.exec('BEGIN');
      db.exec(`
        CREATE TABLE pay_transactions__mig (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT CHECK(type IN ('deposit', 'withdrawal')),
          amount_usd REAL NOT NULL,
          method TEXT CHECK(method IN ('sellix', 'cryptomus', 'cih', 'orange_money', 'cash_plus', 'binance', 'voucher')),
          status TEXT CHECK(status IN ('pending', 'completed', 'rejected')) DEFAULT 'pending',
          proof_details TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );
        INSERT INTO pay_transactions__mig (${cols}) SELECT ${cols} FROM pay_transactions;
        DROP TABLE pay_transactions;
        ALTER TABLE pay_transactions__mig RENAME TO pay_transactions;
        CREATE INDEX IF NOT EXISTS idx_pay_tx_user   ON pay_transactions(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pay_tx_status ON pay_transactions(status);
      `);
      db.exec('COMMIT');
      console.log('[payments] migrated pay_transactions.method → +binance');
    }
  } catch (e) { try { db.exec('ROLLBACK'); } catch (e2) {} console.log('[payments] migration skipped:', e.message); }

  const vAlters = [
    "ALTER TABLE pay_vouchers ADD COLUMN kind TEXT DEFAULT 'std'",
    'ALTER TABLE pay_vouchers ADD COLUMN coins INTEGER DEFAULT 0',
    'ALTER TABLE pay_vouchers ADD COLUMN bonus_pct INTEGER DEFAULT 0'
  ];
  for (const a of vAlters) { try { db.exec(a); } catch (e) { /* العمود موجود */ } }
}

/* ── محاكي واجهة D1 فوق node:sqlite (نفس شكل الاختبارات) ── */
function rewrite(sql) {
  return sql.replace(/\btransactions\b/g, 'pay_transactions').replace(/\bvouchers\b/g, 'pay_vouchers');
}
function d1shim(db) {
  function stmt(sql, args) {
    sql = rewrite(sql);
    return {
      run: (...a2) => { const r = db.prepare(sql).run(...(args || []).concat(a2)); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, results: [] }; },
      all: (...a2) => ({ results: db.prepare(sql).all(...(args || []).concat(a2)) }),
      first: (...a2) => { const rows = db.prepare(sql).all(...(args || []).concat(a2)); return rows.length ? rows[0] : null; }
    };
  }
  return { prepare: (sql) => ({ bind: (...args) => stmt(sql, args) }) };
}

let CTX = null; /* { db, users, sessions, shim } */
function setContext(db, users, sessions) {
  CTX = { db: db, users: users, sessions: sessions || {}, shim: d1shim(db) };
}
function creditGoldLocal(userId, coins) {
  const u = CTX.users[userId] || Object.values(CTX.users).find(x => String(x.id) === String(userId));
  if (!u || !(coins > 0)) return;
  u.gold = (u.gold || 0) + Math.round(coins);
  try { CTX.db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (err) {}
}
/* دور الجلسة الحالية (لكوبونات لوحة السوبر أدمن) */
function roleOfRequest(req) {
  if (!CTX) return null;
  /* Request.headers = Headers (يقرأ بـ get) أو كائن عادي — ندعم الاثنين */
  const h = (req && req.headers) || {};
  const c = String((typeof h.get === 'function' ? h.get('cookie') : h.cookie) || '');
  const m = c.match(/(?:^|;\s*)sid=([^;]+)/);
  if (!m) return null;
  const uid = CTX.sessions[decodeURIComponent(m[1])];
  const u = uid != null ? CTX.users[uid] : null;
  return u ? u.role : null;
}

function buildEnv(req) {
  const e = process.env;
  return {
    DATABASE_BINDING: CTX.shim,
    CRYPTOMUS_PAYMENT_KEY: e.CRYPTOMUS_PAYMENT_KEY || '',
    CRYPTOMUS_MERCHANT_ID: e.CRYPTOMUS_MERCHANT_ID || '',
    SELLIX_WEBHOOK_SECRET: e.SELLIX_WEBHOOK_SECRET || '',
    TELEGRAM_BOT_TOKEN: e.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_ADMIN_CHAT_ID: e.TELEGRAM_ADMIN_CHAT_ID || '',
    TELEGRAM_ADMIN_PIN: e.TELEGRAM_ADMIN_PIN || '',
    ADMIN_API_SECRET: e.ADMIN_API_SECRET || '',
    PLATFORM_URL: '', /* الشحن داخلي الآن — لا نداء HTTP */
    WORKER_PUBLIC_URL: e.PLATFORM_PUBLIC_URL || ('http://' + (req.headers.host || 'localhost')),
    CASH_PLUS_NAME: e.CASH_PLUS_NAME || 'Tarik chouika',
    CASH_PLUS_ACCOUNT: e.CASH_PLUS_ACCOUNT || '835780030016238841734545',
    /* [PayInfo] وجهات الدفع الرسمية (تُعدل من env فقط) */
    CRYPTO_USDT_TRC20: e.CRYPTO_USDT_TRC20 || 'TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ',
    CIH_NAME: e.CIH_NAME || 'MONSIEUR TARIK CHOUIKA',
    CIH_ACCOUNT: e.CIH_ACCOUNT || '6904085211014200',
    CIH_RIB: e.CIH_RIB || '230 815 6904085211014200 24',
    CIH_IBAN: e.CIH_IBAN || 'MA64 2308 1569 0408 5211 0142 0024',
    BINANCE_TRC20: e.BINANCE_TRC20 || 'TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ',
    CIH_SWIFT: e.CIH_SWIFT || 'CIHMMAMC',
    /* [Schema-bridge] خطافات مخطط المنصة (users: gold بلا balance_usd) */
    /* [Support 2026-09-18] ربط البوتين: إشعار المستخدم عبر بوت الدعم + أزرار تذاكر الدعم */
    __notifyUser: function (uid, text) {
      try { return require('./server-support.js').notifyUser(uid, text); } catch (e) { return false; }
    },
    __supportAction: function (act, id, cq) {
      try {
        return require('./server-support.js').handleCallback({ id: cq && cq.id, from: (cq && cq.from) || {}, data: act + '_' + id });
      } catch (e) { return false; }
    },
    __rate: function () { return Number(process.env.USD_GOLD_RATE || 100); },
    __findUserRow: function (id) {
      try { return CTX.db.prepare('SELECT id, username, gold, telegram_id FROM users WHERE id = ?').get(Number(id)) || null; } catch (e) { return null; }
    },
    __setTelegram: function (id, chat) {
      try { CTX.db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run(String(chat), Number(id)); } catch (e) {}
      const u = CTX.users[Number(id)]; if (u) u.telegram_id = String(chat);
    },
    __getTelegram: function (id) {
      const u = CTX.users[Number(id)];
      if (u && u.telegram_id) return u.telegram_id;
      try { const row = CTX.db.prepare('SELECT telegram_id FROM users WHERE id = ?').get(Number(id)); return row ? row.telegram_id : null; } catch (e) { return null; }
    },
    __findByTelegram: function (chat) {
      try {
        const row = CTX.db.prepare('SELECT id, username, gold FROM users WHERE telegram_id = ?').get(String(chat));
        if (!row) return null;
        const rate = Number(process.env.USD_GOLD_RATE || 100);
        return { id: String(row.id), usd: Math.round((row.gold / rate) * 100) / 100, coins: row.gold };
      } catch (e) { return null; }
    },
    __balance: function (id) {
      const u = CTX.users[Number(id)];
      const gold = u ? (u.gold || 0) : 0;
      if (!u) return null;
      const rate = Number(process.env.USD_GOLD_RATE || 100);
      return { usd: Math.round((gold / rate) * 100) / 100, coins: gold };
    },
    __creditUsd: function (id, usd) {
      const rate = Number(process.env.USD_GOLD_RATE || 100);
      creditGoldLocal(id, Math.round(Number(usd) * rate));
    },
    __debitUsd: function (id, usd) {
      const rate = Number(process.env.USD_GOLD_RATE || 100);
      const coins = Math.round(Number(usd) * rate);
      const u = CTX.users[Number(id)];
      if (!u || (u.gold || 0) < coins) return false;
      u.gold -= coins;
      try { CTX.db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
      return true;
    },
    /* [Codes] شحن كوينز مباشر (أكواد التعبئة بالبونص) */
    __creditGold: function (userId, coins) { creditGoldLocal(userId, coins); },
    __authRole: function (req) { return roleOfRequest(req); },
    /* شحن الذهب مباشرة في نفس القاعدة عند اكتمال إيداع */
    __platformCredit: function (userId, usd) {
      const rate = Number(e.USD_GOLD_RATE || 100);
      const u = CTX.users[userId] || Object.values(CTX.users).find(x => String(x.id) === String(userId));
      if (!u || !(usd > 0)) return;
      const gold = Math.round(usd * rate);
      u.gold = (u.gold || 0) + gold;
      try { CTX.db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (err) {}
    }
  };
}

const PAY_PATHS = [
  '/api/payments/methods', '/api/payments/crypto', '/api/payments/p2p',
  '/api/webhooks/cryptomus', '/api/webhooks/sellix',
  '/api/vouchers/redeem', '/api/vouchers/create',
  '/api/withdrawals/request', '/api/wallet/balance', '/api/telegram/webhook'
];
function isPaymentsPath(p) { return PAY_PATHS.indexOf(p) >= 0; }

/* يُستدعى من داخل فرع /api/ بعد جمع body — يكتب الاستجابة وينتهي */
async function handlePayments(req, res, bodyStr) {
  try {
    const url = 'http://' + (req.headers.host || 'localhost') + req.url;
    const headers = {};
    for (const k of Object.keys(req.headers)) headers[k] = req.headers[k];
    const hasBody = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH';
    if (hasBody && bodyStr) headers['content-type'] = headers['content-type'] || 'application/json';
    const request = new Request(url, { method: req.method, headers: headers, body: hasBody ? (bodyStr || '') : undefined });
    const resp = await core.handleFetch(request, buildEnv(req));
    const text = await resp.text();
    const out = { 'access-control-allow-origin': '*' };
    const ct = resp.headers.get('content-type'); if (ct) out['content-type'] = ct;
    res.writeHead(resp.status, out);
    res.end(text);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'payments-internal', detail: String(e && e.message || e) }));
  }
}

/* ════════════════════════════════════════════════════════════════
   [Deploy 2026-09-17] manifest مُجزأ لصفحة الرفع داخل المعاينة (deploy.html)
   يُفعَّل بـ DEPLOY_MANIFEST=1 فقط — التوكن يبقى في متصفح المالك وحده.
   ════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const pathMod = require('path');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', '.arena', '.wrangler']);
const SKIP_FILES = new Set(['.dev.vars', 'server.log', 'royalcoin.db']);
function walkRepo(root, out, rel) {
  const dir = rel ? pathMod.join(root, rel) : root;
  for (const name of fs.readdirSync(dir)) {
    const full = pathMod.join(dir, name);
    const relP = rel ? rel + '/' + name : name;
    let st; try { st = fs.statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walkRepo(root, out, relP); continue; }
    if (SKIP_FILES.has(name) || /\.db(-wal|-shm)?$/.test(name)) continue;
    out.push(relP);
  }
}
function serveManifest(req, res, parsedUrl) {
  if (process.env.DEPLOY_MANIFEST !== '1') {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'manifest-disabled' }));
    return;
  }
  const q = parsedUrl.query || {};
  const offset = Math.max(0, parseInt(q.offset, 10) || 0);
  const limit = Math.min(60, Math.max(1, parseInt(q.limit, 10) || 25));
  const files = [];
  walkRepo(pathMod.join(__dirname), files, '');
  files.sort();
  const slice = files.slice(offset, offset + limit).map(function (p) {
    const buf = fs.readFileSync(pathMod.join(__dirname, p));
    return { p: p, bytes: buf.length, b64: buf.toString('base64') };
  });
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ ok: true, total: files.length, offset: offset, files: slice }));
}

module.exports = { initPaymentsTables: initPaymentsTables, setContext: setContext, isPaymentsPath: isPaymentsPath, handlePayments: handlePayments, PAY_PATHS: PAY_PATHS, serveManifest: serveManifest };
