-- ════════════════════════════════════════════════════════════════
-- DTSG Payments — مخطط قاعدة البيانات (Cloudflare D1 / SQLite)
-- يُطبق مرة واحدة:  wrangler d1 execute dstg-payments --file=schema.sql
-- الجداول الثلاثة كما حددها المالك + فهارس أداء.
-- ════════════════════════════════════════════════════════════════

-- جدول المستخدمين والأرصدة
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    telegram_id TEXT UNIQUE,
    email TEXT UNIQUE,
    balance_usd REAL DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- جدول المعاملات (الدفع والسحب)
-- [v2.41.1] transactions (D1) — أعمدة المراجعة تُضاف عبر الترحيل في server-payments.js
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT CHECK(type IN ('deposit', 'withdrawal')),
    amount_usd REAL NOT NULL,
    method TEXT CHECK(method IN ('sellix', 'cryptomus', 'binance_pay', 'cih', 'orange_money', 'cash_plus', 'binance', 'voucher')),
    status TEXT CHECK(status IN ('pending', 'completed', 'rejected')) DEFAULT 'pending',
    proof_details TEXT, -- رابط الوصل أو كود التحويل
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- جدول أكواد الشحن والتعبئة (Vouchers / Gift Cards)
CREATE TABLE IF NOT EXISTS vouchers (
    code TEXT PRIMARY KEY,
    amount_usd REAL NOT NULL,
    kind TEXT DEFAULT 'std',           -- std | admin | direct
    coins INTEGER DEFAULT 0,           -- رصيد الكوينز الجاهز إن وُجد
    bonus_pct INTEGER DEFAULT 0,       -- نسبة البونص المطبقة
    is_used BOOLEAN DEFAULT FALSE,
    used_by_user_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(used_by_user_id) REFERENCES users(id)
);

-- جلسات توثيق السوبر أدمن لبوت التلغرام (أتمتة الكوبونات)
CREATE TABLE IF NOT EXISTS tg_admin_sessions (
    chat_id TEXT PRIMARY KEY,
    since TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tx_user   ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_users_tg  ON users(telegram_id);
