'use strict';
/* ════════════════════════════════════════════════════════════════
   DTSG Payments — موحّد داخل منصة node فوق قاعدة SQLite المحلية.
   [تصحيح 2026-09-16] لا Cloudflare D1: المنصة تعتمد SQLite محلية،
   لذلك يُركَّب payments-core.js هنا مباشرة ويشارك نفس اتصال db.
   المنطق المالي المُختبَر (36/36) يعيش في cf-worker/payments-core.js.
   الأسرار من process.env:
BINANCE_PAY_MERCHANT_ID, BINANCE_PAY_API_KEY, BINANCE_PAY_SECRET_KEY, SELLIX_WEBHOOK_SECRET,
     TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, ADMIN_API_SECRET,
     USD_GOLD_RATE, CASH_PLUS_NAME, CASH_PLUS_ACCOUNT, PLATFORM_PUBLIC_URL
   ════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const core = require('./cf-worker/payments-core.js');

/* ═══ [v2.59 BOT-GATE] (جولة-4: R3-001/R3-002) بوابة البوت تتطلب سراً مشتركاً ═══
   البوت الشرعي (scripts/voucher-bot.js) يرسل ترويسة x-bot-secret (من BOT_API_SECRET
   أو ADMIN_API_SECRET). الخادم لم يكن يميّز البوت عن أي عميل إنترنت: أي غريب كان
   يستطيع سحب رصيد أي ضحية (خصم فوري) أو ربط أي تيليغرام بأي حساب — بلا جلسة.
   القاعدة: مقارنة بثابت الزمن (timing-safe) + حدّ معدل لكل IP (30/دقيقة). */
const _botBuckets = new Map();
function _botSecretOk(given, secret) {
  if (!given || !secret) return false;
  try {
    const a = Buffer.from(String(given)), c = Buffer.from(String(secret));
    return a.length === c.length && crypto.timingSafeEqual(a, c);
  } catch (e) { return false; }
}
function _botRateHit(limit, ip) {
  if (!ip) return false;
  const now = Date.now();
  let b = _botBuckets.get(ip);
  if (!b || now - b.start > 60000) { b = { start: now, n: 0 }; _botBuckets.set(ip, b); }
  b.n += 1;
  if (_botBuckets.size > 2000) { for (const [k, v] of _botBuckets) if (now - v.start > 60000) _botBuckets.delete(k); }
  return b.n > limit;
}
function _botIp(req) {
  /* لا نثق بأي ترويسة محوّلة (x-real-ip…): من يديرها يستطيع تدوير «الـIP»
     والتهام حدّ المعدل. المعيار الوحيد: عنوان الجوار الفعلي. */
  return req.socket ? (req.socket.remoteAddress || '') : '';
}

/* ── المخطط: توسيع users + جدولا transactions/vouchers (إن لم توجد) ── */
function initPaymentsTables(db) {
  /* SQLite لا يسمح بعمود UNIQUE عبر ALTER TABLE — أعمدة عادية + فهارس وحيدة جزئية */
  const alters = [
    'ALTER TABLE users ADD COLUMN telegram_id TEXT',
    'ALTER TABLE users ADD COLUMN email TEXT',
    'ALTER TABLE users ADD COLUMN balance_usd REAL DEFAULT 0'
  ];
  for (const a of alters) { try { db.exec(a); } catch (e) { /* العمود موجود */ } }
  /* [v2.41.1] أثر المراجعة: من وافق/رفض ومتى (كان UPDATE يفشل فيرفض الرفض نفسه!) */
  for (const a of ['ALTER TABLE pay_transactions ADD COLUMN reviewed_by TEXT',
                   'ALTER TABLE pay_transactions ADD COLUMN reviewed_at INTEGER']) {
    try { db.exec(a); } catch (e) {}
  }
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
      /* [v2.45] cryptomus قيمة تاريخية للصفوف القديمة فقط — لا مسار جديد ينشئها
         (البوابة التلقائية الآن binance_pay) */
      method TEXT CHECK(method IN ('sellix', 'cryptomus', 'binance_pay', 'cih', 'orange_money', 'cash_plus', 'binance', 'binance_readonly', 'voucher')),
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

  /* [v2.40→v2.45] ترحيل: عمود method في pay_transactions كان يرفض 'binance'
     (منذ v2.38) ثم 'binance_pay' (بوابة الشحن التلقائي بعد إزالة Cryptomus في v2.45)
     — SQLite لا يعدّل CHECK على جدول قائم، فنعيد بناء الجدول مع نقل كل الصفوف كما هي. */
  try {
    const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pay_transactions'").get();
    if (ddl && ddl.sql && ddl.sql.indexOf('binance_readonly') === -1) {
      const cols = db.prepare('PRAGMA table_info(pay_transactions)').all().map(function (c) { return c.name; }).join(', ');
      /* [v2.45.1-FIX] إعادة بناء الجدول مع foreign_keys=ON تفشل كلها إذا وُجد صفّ واحد
         يشير إلى مستخدم محذوف (DELETE FROM users في لوحة السوبر) ⇒ يرجع كل شيء للخلف بصمت
         ويبقى CHECK القديم ⇒ كل INSERT بـ binance_pay يفشل. نُطفئ الجبر حول الترحيل ثم نُعيده. */
      let fkWas = 0;
      try { const r = db.prepare('PRAGMA foreign_keys').get(); fkWas = r ? Number(r.foreign_keys || 0) : 0; } catch (e) { fkWas = 0; }
      let orphans = 0;
      try { const o = db.prepare('SELECT COUNT(*) AS c FROM pay_transactions t LEFT JOIN users u ON u.id = t.user_id WHERE u.id IS NULL').get(); orphans = o ? Number(o.c || 0) : 0; } catch (e) { orphans = 0; }
      try { db.exec('PRAGMA foreign_keys=OFF'); } catch (e) {}
      db.exec('BEGIN');
      db.exec(`
        CREATE TABLE pay_transactions__mig (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT CHECK(type IN ('deposit', 'withdrawal')),
          amount_usd REAL NOT NULL,
          method TEXT CHECK(method IN ('sellix', 'cryptomus', 'binance_pay', 'cih', 'orange_money', 'cash_plus', 'binance', 'binance_readonly', 'voucher')),
          status TEXT CHECK(status IN ('pending', 'completed', 'rejected')) DEFAULT 'pending',
          proof_details TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          /* [v2.45-FIX] عمودا المراجعة أُضيفا بـ ALTER بعد إنشاء الجدول —
             وبدونهما كان الترحيل يفشل بصمت: no column named reviewed_by */
          reviewed_by TEXT,
          reviewed_at INTEGER,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );
        INSERT INTO pay_transactions__mig (${cols}) SELECT ${cols} FROM pay_transactions;
        DROP TABLE pay_transactions;
        ALTER TABLE pay_transactions__mig RENAME TO pay_transactions;
        CREATE INDEX IF NOT EXISTS idx_pay_tx_user   ON pay_transactions(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pay_tx_status ON pay_transactions(status);
      `);
      db.exec('COMMIT');
      try { if (fkWas) db.exec('PRAGMA foreign_keys=ON'); } catch (e) {}
      console.log('[payments] migrated pay_transactions.method → +binance +binance_pay +binance_readonly' + (orphans ? (' (صفوف بلا حساب: ' + orphans + ')') : ''));
    }
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (e2) {}
    try { db.exec('PRAGMA foreign_keys=ON'); } catch (e2) {}
    /* خطأ صريح (لا «skipped» صامت): بقاء المخطط القديم يُعطّل كل إيداع binance_pay */
    console.error('[payments] MIGRATION FAILED pay_transactions.method ⇒ إيداع binance_pay سيفشل بـ CHECK constraint:', e.message);
  }

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
    /* [v2.58-FIX] أماكن الربط ?1..?N (صياغة D1) غير مدعومة في node:sqlite
       (كانت تسقط بحالة «column index out of range» ⇒ /api/wallet/balance بـ500).
       نُعيد ترقيمها إلى ? متسلسل مع توسيع الفهارس المتكررة (مثل balance >= ?2). */
    const map = {};
    let nParams = 0;
    sql = sql.replace(/\?(\d+)/g, (m, n) => { const k = Number(n); if (!(k in map)) map[k] = ++nParams; return '?'; });
    function remap(a2) {
      const all = (args || []).concat(a2 || []);
      if (!nParams) return all;
      const out = new Array(nParams);
      for (const k of Object.keys(map)) out[map[k] - 1] = all[Number(k) - 1];
      return out;
    }
    return {
      run: (...a2) => { const r = db.prepare(sql).run(...remap(a2)); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, results: [] }; },
      all: (...a2) => ({ results: db.prepare(sql).all(...remap(a2)) }),
      first: (...a2) => { const rows = db.prepare(sql).all(...remap(a2)); return rows.length ? rows[0] : null; }
    };
  }
  return { prepare: (sql) => ({ bind: (...args) => stmt(sql, args) }) };
}

let CTX = null; /* { db, users, sessions, shim } */
function setContext(db, users, sessions) {
  CTX = { db: db, users: users, sessions: sessions || {}, shim: d1shim(db) };
}
function pushWalletLocal(u, extra) {
  /* [v2.43] إعلام المستخدم لحظياً (SSE) كي يرى الرصيد الجديد بلا إعادة تحميل */
  try {
    if (u && typeof global.__DTSG_PUSH_WALLET === 'function') global.__DTSG_PUSH_WALLET(u.id, extra || null);
  } catch (e) {}
}
function creditGoldLocal(userId, coins) {
  const u = CTX.users[userId] || Object.values(CTX.users).find(x => String(x.id) === String(userId));
  if (!u || !(coins > 0)) return;
  u.gold = (u.gold || 0) + Math.round(coins);
  try { CTX.db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (err) {}
  pushWalletLocal(u, { delta: Math.round(coins) });
}
/* [v2.44-MONEY] تسوية ذرية واحدة لكل عملية مالية على الكوينز (إيداع/سحب/كوبون):
   - كتابة واحدة للتخزين (لا نكتب مرتين فيَختلف العرض عن القاعدة)
   - تحديث الذاكرة + مرجع الرصيد + بثّ لحظي لصاحب الحساب
   - تُرجع الرصيد الناتج أو null عند الفشل */
function settleGoldLocal(userId, deltaCoins, opts) {
  const o = opts || {};
  const u = CTX.users[userId] || Object.values(CTX.users).find(x => String(x.id) === String(userId));
  const delta = Math.round(Number(deltaCoins) || 0);
  if (!u || !delta) return null;
  if (delta < 0 && (u.gold || 0) + delta < 0) return null;      /* لا رصيد سالب */
  u.gold = (u.gold || 0) + delta;
  if (typeof global.__DTSG_MONEY_NOTE === 'function') { try { global.__DTSG_MONEY_NOTE(u.id, o.note || ''); } catch (e) {} }
  try { CTX.db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (err) {}
  pushWalletLocal(u, { delta: delta, note: o.note || '', coins: u.gold });
  return u.gold;
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

/* [v2.47-WD-OWNER] أدمن حساب المستخدم (users.admin_id) + معرّف تيليغرامه */
function userAdminOfLocal(uid) {
  try {
    const row = CTX.db.prepare('SELECT admin_id FROM users WHERE id = ?').get(Number(uid)) || null;
    let aid = row && row.admin_id ? row.admin_id : null;
    if (!aid) {
      const u = CTX.users[Number(uid)] || Object.values(CTX.users).find(x => String(x.id) === String(uid));
      if (u && u.admin_id) aid = u.admin_id;
    }
    if (!aid) return null;
    const a = CTX.db.prepare('SELECT telegram_id, username FROM users WHERE id = ?').get(Number(aid)) || null;
    return { id: String(aid), tg: (a && a.telegram_id) ? String(a.telegram_id) : null, username: (a && a.username) || null };
  } catch (e) { return null; }
}

function buildEnv(req) {
  const e = process.env;
  return {
    DATABASE_BINDING: CTX.shim,
    BINANCE_PAY_MERCHANT_ID: e.BINANCE_PAY_MERCHANT_ID || '',
    BINANCE_PAY_API_KEY: e.BINANCE_PAY_API_KEY || '',
    BINANCE_PAY_SECRET_KEY: e.BINANCE_PAY_SECRET_KEY || '',
    /* [v2.45.1-FIX] كانت تُقرأ في payments-core لكن لا تُمرَّر هنا ⇒ تُهمَل صامتة على مسار الهاتف/Node
       (العملة · رقم الشهادة · مفتاح الإشعارات العام · مضيف API للاختبار) */
    BINANCE_PAY_CURRENCY: e.BINANCE_PAY_CURRENCY || '',
    BINANCE_PAY_CERT_SN: e.BINANCE_PAY_CERT_SN || '',
    BINANCE_PAY_PUBLIC_KEY: e.BINANCE_PAY_PUBLIC_KEY || '',
    BINANCE_PAY_API_BASE: e.BINANCE_PAY_API_BASE || '',
    SELLIX_WEBHOOK_SECRET: e.SELLIX_WEBHOOK_SECRET || '',
    TELEGRAM_BOT_TOKEN: e.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_ADMIN_CHAT_ID: e.TELEGRAM_ADMIN_CHAT_ID || '',
    TELEGRAM_ADMIN_PIN: e.TELEGRAM_ADMIN_PIN || '',
    ADMIN_API_SECRET: e.ADMIN_API_SECRET || '',
    PLATFORM_URL: '', /* الشحن داخلي الآن — لا نداء HTTP */
    WORKER_PUBLIC_URL: e.PLATFORM_PUBLIC_URL || ('http://' + (req.headers.host || 'localhost')),
    CASH_PLUS_NAME: e.CASH_PLUS_NAME || 'Tarik chouika',
    /* [2026-09-22] القيمة الافتراضية صُحّحت لتطابق رمز QR الرسمي في assets/qr/cashplus.png
       (cpmapp://VirementInternScreen?numero=0766672027) — كانت رقماً تجريبياً غير قابل للتحويل. */
    CASH_PLUS_ACCOUNT: e.CASH_PLUS_ACCOUNT || '0766672027',
    /* [PayInfo] وجهات الدفع الرسمية (تُعدل من env فقط) */
    CRYPTO_USDT_TRC20: e.CRYPTO_USDT_TRC20 || 'TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ',
    CIH_NAME: e.CIH_NAME || 'MONSIEUR TARIK CHOUIKA',
    CIH_ACCOUNT: e.CIH_ACCOUNT || '6904085211014200',
    CIH_RIB: e.CIH_RIB || '230 815 6904085211014200 24',
    CIH_IBAN: e.CIH_IBAN || 'MA64 2308 1569 0408 5211 0142 0024',
    BINANCE_TRC20: e.BINANCE_TRC20 || 'TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ',
    CIH_SWIFT: e.CIH_SWIFT || 'CIHMMAMC',
    /* [Schema-bridge] خطافات مخطط المنصة (users: gold بلا balance_usd) */
    /* [v2.41.1] إشعار الأدمنز بالمعاملات المالية عبر بوت الدعم + صلاحية تنفيذها */
    __notifyAdminsPayment: function (text, buttons) {
      try { return require('./server-support.js').notifyAdminsPayment(text, buttons); } catch (e) { return 0; }
    },
    __adminCanAct: function (tgId) {
      try { return require('./server-support.js').adminCanAct(String(tgId)); } catch (e) { return false; }
    },
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
    /* [v2.43] حلّ هوية المستخدم القادمة من بوتات الطرف الثالث:
       user_id | username | tg_id/telegram_id  ⇒ معرّف المنصة الحقيقي.
       (بدون هذا كانت البوتات ترسل الاسم أو معرّف تيليغرام فتُسجَّل معاملة
        بلا حساب مطابق ⇒ «تُسجَّل العملية ولا يتغيّر الرصيد»). */
    __resolveUid: function (q) {
      try {
        q = q || {};
        const id = q.id ? String(q.id) : '';
        const un = q.username ? String(q.username).toLowerCase() : '';
        const tg = q.tg ? String(q.tg) : '';
        const all = Object.values(CTX.users);
        if (id) { const hit = all.find(x => String(x.id) === id); if (hit) return String(hit.id); }
        if (un) { const hit = all.find(x => String(x.username || '').toLowerCase() === un); if (hit) return String(hit.id); }
        if (tg) { const hit = all.find(x => String(x.telegram_id || '') === tg); if (hit) return String(hit.id); }
        try {
          if (un) { const r = CTX.db.prepare('SELECT id FROM users WHERE lower(username) = ?').get(un); if (r) return String(r.id); }
          if (tg) { const r = CTX.db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(tg); if (r) return String(r.id); }
          if (id) { const r = CTX.db.prepare('SELECT id FROM users WHERE id = ?').get(Number(id)); if (r) return String(r.id); }
        } catch (e) {}
        return '';
      } catch (e) { return ''; }
    },
    /* هل الحساب موجود فعلاً؟ (يُستعمل لمنع تسجيل معاملات بلا حساب ⇒ رصيد ثابت) */
    __userExists: function (id) {
      try {
        if (Object.values(CTX.users).some(x => String(x.id) === String(id))) return true;
        const r = CTX.db.prepare('SELECT id FROM users WHERE id = ?').get(Number(id));
        return !!r;
      } catch (e) { return false; }
    },
    __findUserRow: function (id) {
      try { return CTX.db.prepare('SELECT id, username, gold, telegram_id FROM users WHERE id = ?').get(Number(id)) || null; } catch (e) { return null; }
    },
    /* ═══ [v2.47-WD-OWNER] أدمن حساب المستخدم (users.admin_id) لمسار السحب ═══
       السحب يُوجَّه لأدمن التسجيل، والمصادقة عليه حكرٌ له أو للسوبر أدمن. */
    __userAdminOf: function (uid) { return userAdminOfLocal(uid); },
    __isUserAdminOf: function (tgId, uid) {
      /* الصلاحية العامة (سوبر/أدمن دعم مسجَّل) تُفحص في النواة؛ هنا أدمن التسجيل فقط */
      try {
        const own = userAdminOfLocal(uid);
        return !!(own && own.tg && String(own.tg) === String(tgId));
      } catch (e) { return false; }
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
      const rate = Number(process.env.USD_GOLD_RATE || 100);
      let u = CTX.users[Number(id)] || Object.values(CTX.users).find(x => String(x.id) === String(id));
      if (!u) {
        /* [v2.44-MONEY] احتياط: اقرأ من القاعدة وربط الذاكرة (كان null ⇒ الواجهة تعرض 0) */
        try {
          const row = CTX.db.prepare('SELECT id, username, role, gold, lang FROM users WHERE id = ?').get(Number(id));
          if (row) { u = { id: row.id, username: row.username, role: row.role, gold: row.gold, lang: row.lang }; CTX.users[row.id] = u; }
        } catch (e) {}
      }
      if (!u) return null;
      const gold = u.gold || 0;
      return { usd: Math.round((gold / rate) * 100) / 100, coins: gold, gold_rev: (typeof global.__DTSG_GOLD_REV === 'function' ? global.__DTSG_GOLD_REV(u.id) : undefined) };
    },
    __creditUsd: function (id, usd) {
      const rate = Number(process.env.USD_GOLD_RATE || 100);
      return settleGoldLocal(id, Math.round(Number(usd) * rate), { note: 'credit-usd' });
    },
    __debitUsd: function (id, usd) {
      const rate = Number(process.env.USD_GOLD_RATE || 100);
      const coins = Math.round(Number(usd) * rate);
      const u = CTX.users[Number(id)] || Object.values(CTX.users).find(x => String(x.id) === String(id));
      if (!u || (u.gold || 0) < coins) return false;
      return settleGoldLocal(id, -coins, { note: 'debit-usd' }) !== null;
    },
    /* [v2.44-MONEY] تسوية كوينز مباشرة (أكواد التعبئة بالبونص/التسويات اليدوية) */
    __settleGold: function (id, coins, note) { return settleGoldLocal(id, coins, { note: note || 'settle' }); },
    /* [v2.44] سجل المال (يظهر للمستخدم والسوبر أدمن في الداشبورد) */
    __moneyLog: function (userId, kind, usd, coins, status, ref) {
      try { if (typeof global.__DTSG_MONEY_LOG === 'function') global.__DTSG_MONEY_LOG(userId, kind, usd, coins, status, ref, '', 'payments'); } catch (e) {}
    },
    /* [Codes] شحن كوينز مباشر (أكواد التعبئة بالبونص) */
    __creditGold: function (userId, coins) { return settleGoldLocal(userId, coins, { note: 'credit-gold' }); },
    __authRole: function (req) { return roleOfRequest(req); },
    /* شحن الذهب مباشرة في نفس القاعدة عند اكتمال إيداع */
    __platformCredit: function (userId, usd) {
      const rate = Number(e.USD_GOLD_RATE || 100);
      const u = CTX.users[userId] || Object.values(CTX.users).find(x => String(x.id) === String(userId));
      if (!u || !(usd > 0)) return;
      const gold = Math.round(usd * rate);
      settleGoldLocal(u.id, gold, { note: 'platform-credit' });
    },
  };
}

const PAY_PATHS = [
  '/api/payments/methods', '/api/payments/crypto', '/api/payments/p2p',
  /* [v2.47-BNB-RO] التحقق من التحويل بوضع القراءة فقط + فحص المفتاح حيّاً */
  '/api/payments/binance-verify', '/api/payments/binance-probe',
  '/api/webhooks/binance', '/api/webhooks/sellix',
  '/api/vouchers/redeem', '/api/vouchers/create',
  '/api/withdrawals/request', '/api/wallet/balance', '/api/telegram/webhook',
  /* [v2.44] بوابة بوت الشحن/الفوتشير (بلا جلسة) + ربط تيليغرام */
  '/api/bot/request', '/api/bot/link',
  /* [v2.44] مصادقة الطلبات من بوت السوبر أدمن (بلا جلسة) */
  '/api/bot/admin-act'
];
function isPaymentsPath(p) { return PAY_PATHS.indexOf(p) >= 0; }

/* [CORS DTSG-005 v2.58] نفس القائمة الصارمة في server.js — النسخة القديمة قبلت أي
   *.pages.dev / *.workers.dev (أصل شرير مجاني = موثوق). */
/* [v2.59.1 OPS] نفس قائمة server.js — مع مضيف Pages الثانٍ dtsg-3e0.pages.dev
   (مشروع «dtsg» في حساب Cloudflare الآخر) لمنع 403 على من يزوره. مطابقة تامة. */
const ALLOWED_ORIGIN_HOSTS = [
  'dtsg.pages.dev', 'dtsg-3e0.pages.dev', 'dmgames.pages.dev', 'dmcasino.pages.dev', 'casino-9xj.pages.dev',
  'casino-api.tarikc.workers.dev', 'casino-api.dmgames-api.workers.dev', 'casino-phone.dmgames-api.workers.dev'
];
function isOriginAllowed(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    /* [v2.59 R4-001] لاحقات الساندبوكس العامة (.e2b.app / .arena.ai) لم تعد موثوقة
       افتراضياً — طرف ثالث يستطيع إنشاء دومين هناك ويحصل على CORS موثوق.
       تُسمح الآن فقط في DM_TEST_MODE أو عبر قائمة صريحة DM_DEV_ORIGINS (مفصولة بفواصل). */
    if (host.endsWith('.e2b.app') || host.endsWith('.arena.ai')) {
      return process.env.DM_TEST_MODE === '1';
    }
    const devOrigins = (process.env.DM_DEV_ORIGINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    for (const d of devOrigins) if (host === d || host.endsWith('.' + d)) return true;
    for (const h of ALLOWED_ORIGIN_HOSTS) {
      if (host === h || host.endsWith('.' + h)) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/* يُستدعى من داخل فرع /api/ بعد جمع body — يكتب الاستجابة وينتهي */
async function handlePayments(req, res, bodyStr, me) {
  try {
    const parsed = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    const pathname = parsed.pathname;
    const reqOrigin = req.headers.origin;

    /* [DTSG-005 v2.58] CORS: يُرفض كل الطرق (بما فيها GET/HEAD) من أصل غير موثوق —
       النسخة السابقة كانت تضبط الترويسة فقط وتُمرّر GET (قراءات الأرصدة/المعاملات). */
    if (reqOrigin && reqOrigin !== 'null' && !isOriginAllowed(reqOrigin)) {
      res.writeHead(403, { 'content-type': 'application/json', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify({ ok: false, error: 'forbidden_origin', message: 'Cross-origin request blocked' }));
      return;
    }

    /* [v2.59 BOT-GATE] (R3-001/R3-002): /api/bot/request و /api/bot/link بلا جلسة —
       يُطلب سراً مشتركاً في الترويسة (x-bot-secret / x-admin-secret) بمقارنة ثابتة
       الزمن، وحدّ 30/دقيقة لكل IP. admin-act يحتفظ بمصادقته داخل المعالج
       (سرّ الجسم/جلسة السوبر/تيليغرام الأدمن) مع حدّ معدل إضافي 20/دقيقة. */
    if (pathname === '/api/bot/request' || pathname === '/api/bot/link' || pathname === '/api/bot/admin-act') {
      /* 1) السِرّ أولاً: الطلبات بلا سِرّ (أو بسِرّ خاطئ) تُرفض فوراً وبأرخص كلفة —
         لا تستهلك حدّ المعدل إطلاقاً. */
      if (pathname !== '/api/bot/admin-act') {
        const secret = process.env.BOT_API_SECRET || process.env.ADMIN_API_SECRET || '';
        const given = req.headers['x-bot-secret'] || req.headers['x-admin-secret'] || '';
        if (!_botSecretOk(given, secret)) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'unauthorized', message: 'x-bot-secret مطلوبة' }));
          return;
        }
      }
      /* 2) حدّ المعدل للطلب الموثّق (30/د للبوت، 20/د لـadmin-act) لكل IP جاور فعلي. */
      if (_botRateHit(pathname === '/api/bot/admin-act' ? 20 : 30, _botIp(req))) {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60' });
        res.end(JSON.stringify({ ok: false, error: 'rate_limited' }));
        return;
      }
    }

    const out = {};
    if (isOriginAllowed(reqOrigin)) {
      out['access-control-allow-origin'] = reqOrigin;
      out['access-control-allow-credentials'] = 'true';
      out['vary'] = 'Origin';
    }

    const hasAdminSecret = () => {
      const h = req.headers['x-admin-secret'] || req.headers['x-pay-secret'];
      const q = parsed.searchParams.get('admin_secret');
      const sec = process.env.ADMIN_API_SECRET || '';
      /* [SEC v2.58] qa-admin-secret مفعّل فقط في بيئة الاختبار المحلية (DM_TEST_MODE=1).
         النسخة السابقة كانت باباً خلفياً ثابتاً يعمل في الإنتاج على كل مسارات الدفع! */
      const qaOk = process.env.DM_TEST_MODE === '1' && !!h && h === 'qa-admin-secret';
      return !!(sec && (h === sec || q === sec)) || qaOk;
    };

    /* [DTSG-002 SEC] السحب يتطلب جلسة موثقة حصراً — تثبيت user_id على هوية الجلسة لمنع سرقة أرصدة الغير */
    if (pathname === '/api/withdrawals/request' && req.method === 'POST') {
      if (!me && !hasAdminSecret()) {
        out['content-type'] = 'application/json; charset=utf-8';
        res.writeHead(401, out);
        res.end(JSON.stringify({ ok: false, error: 'unauthorized', message: 'سجّل الدخول أولاً لطلب السحب' }));
        return;
      }
      if (me && me.role !== 'admin' && me.role !== 'super') {
        let b = {}; try { b = JSON.parse(bodyStr || '{}'); } catch (e) {}
        b.user_id = String(me.id);
        b.username = me.username;
        bodyStr = JSON.stringify(b);
      }
    }

    /* [DTSG-016 SEC] تأمين إيداعات P2P: تثبيت user_id و username على هوية الجلسة عند الطلب من مستخدم مسجل */
    if (pathname === '/api/payments/p2p' && req.method === 'POST') {
      if (me && me.role !== 'admin' && me.role !== 'super') {
        let b = {}; try { b = JSON.parse(bodyStr || '{}'); } catch (e) {}
        b.user_id = String(me.id);
        b.username = me.username;
        bodyStr = JSON.stringify(b);
      }
    }

    /* [DTSG-003 SEC] استعلام الرصيد وسجل المعاملات يتطلب جلسة ولا يكشف بيانات الغير */
    if (pathname === '/api/wallet/balance' && req.method === 'GET') {
      if (!me && !hasAdminSecret()) {
        out['content-type'] = 'application/json; charset=utf-8';
        res.writeHead(401, out);
        res.end(JSON.stringify({ ok: false, error: 'unauthorized', message: 'سجّل الدخول أولاً لعرض الرصيد' }));
        return;
      }
      if (me && me.role !== 'admin' && me.role !== 'super') {
        parsed.searchParams.set('user_id', String(me.id));
        parsed.searchParams.delete('username');
        parsed.searchParams.delete('tg_id');
      }
    }

    const url = parsed.toString();
    const headers = {};
    for (const k of Object.keys(req.headers)) headers[k] = req.headers[k];
    const hasBody = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH';
    if (hasBody && bodyStr) headers['content-type'] = headers['content-type'] || 'application/json';
    const request = new Request(url, { method: req.method, headers: headers, body: hasBody ? (bodyStr || '') : undefined });
    const env = buildEnv(req);
    if (me) env.SESSION_USER = me;
    const resp = await core.handleFetch(request, env);
    const text = await resp.text();
    const ct = resp.headers.get('content-type'); if (ct) out['content-type'] = ct;
    res.writeHead(resp.status, out);
    res.end(text);
  } catch (e) {
    /* [NEW-6 v2.58] خطأ عام موحّد — بلا كشف تفاصيل داخلية (كان يفضح e.message للعميل) */
    try {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json', 'x-content-type-options': 'nosniff' });
        res.end(JSON.stringify({ ok: false, error: 'payments-internal' }));
      } else { res.end(); }
    } catch (_) { try { res.destroy(); } catch (_2) {} }
    console.error('[payments-error]', req.url, e && e.stack ? e.stack : e);
  }
}

/* ── [v2.41.1] المعاملات المالية المعلّقة + تنفيذ الموافقة/الرفض من لوحة المنصة ── */
function listPending(limit) {
  try {
    return CTX.db.prepare("SELECT id, user_id, type, amount_usd, method, status, proof_details, created_at FROM pay_transactions WHERE status = 'pending' ORDER BY id DESC LIMIT ?").all(Number(limit || 50));
  } catch (e) { return []; }
}
function txById(txId) {
  try { return CTX.db.prepare('SELECT * FROM pay_transactions WHERE id = ?').get(String(txId)) || null; } catch (e) { return null; }
}
async function adminApprove(txId, actorName) {
  const tx = txById(txId);
  if (!tx) return { ok: false, error: 'not-found' };
  if (tx.status !== 'pending') return { ok: false, error: 'already-' + tx.status };
  const need = tx.type === 'deposit' ? 'dapp' : 'wapp';
  const r = await core.adminActOnTransaction(buildEnv({ headers: { host: 'localhost' } }), CTX.shim, String(txId), need);
  if (r && r.ok) { try { CTX.db.prepare('UPDATE pay_transactions SET reviewed_by = ?, reviewed_at = ? WHERE id = ?').run(String(actorName || 'dashboard'), Date.now(), String(txId)); } catch (e) {} }
  return r;
}
function adminReject(txId, reason, actorName) {
  const tx = txById(txId);
  if (!tx) return { ok: false, error: 'not-found' };
  if (tx.status !== 'pending') return { ok: false, error: 'already-' + tx.status };
  /* رفض: للإيداع لا يخصم شيء (لم يُشحن) · للسحب يُعاد الرصيد */
  try { CTX.db.prepare("UPDATE pay_transactions SET status = 'rejected', reviewed_by = ?, reviewed_at = ? WHERE id = ?").run(String(actorName || 'dashboard'), Date.now(), String(txId)); } catch (e) { return { ok: false, error: 'db' }; }
  if (tx.type === 'withdrawal') {
    try {
      const u = CTX.users[String(tx.user_id)] || Object.values(CTX.users).find(x => String(x.id) === String(tx.user_id));
      const rate = Number(process.env.USD_GOLD_RATE || 100);
      const coins = Math.round(Number(tx.amount_usd) * rate);
      if (u) { u.gold = (u.gold || 0) + coins; try { CTX.db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {} }
    } catch (e) {}
  }
  return { ok: true, done: tx.type === 'withdrawal' ? 'withdrawal-rejected-refunded' : 'deposit-rejected', reason: String(reason || '') };
}
async function adminActOnPlatformTx(txId, act, actorName) {
  if (act === 'approve') return await adminApprove(txId, actorName);
  if (act === 'reject') return adminReject(txId, '', actorName);
  return { ok: false, error: 'bad-act' };
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

module.exports = { initPaymentsTables: initPaymentsTables, setContext: setContext, isPaymentsPath: isPaymentsPath, handlePayments: handlePayments, PAY_PATHS: PAY_PATHS, serveManifest: serveManifest, listPending: listPending, adminApprove: adminApprove, adminReject: adminReject, adminActOnPlatformTx: adminActOnPlatformTx };
