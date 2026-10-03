const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 3000;   /* [Render] المنفذ من البيئة */

/* [v2.40.4] بصمة الإصدار — تظهر في /api/health للتحقق عن بُعد من الشجرة المشغَّلة فعلاً */
const BUILD_VERSION = (function () {
  try { return String(require('./package.json').version || 'unknown'); } catch (e) { return 'unknown'; }
})();
/* [v2.40.4 · أمن] ملفات لا يجوز خدمتها عبر الويب إطلاقاً:
   كان data/royalcoin.db (قاعدة المستخدمين) و server.js و package.json متاحة للتنزيل
   من الإنترنت عبر النفق/الووركر. تُعاد لها 404 كأنها غير موجودة. */
const STATIC_DENY = [
  /* [v2.68·عزل] games/ وrooms/ وحدات خادم (سجل الألعاب ومديري الغرف) —
     لا تُقدَّم للويب مثل server.js نفسه (كشف كود بلا داعٍ).
     [v2.75·تحكيم] mediamtx.yml إعداد خادم الوسائط كذلك */
  /^\/?(server[^\/]*\.js|package(-lock)?\.json|tunnel-live\.json|mediamtx\.yml|\.env[^\/]*)/i,
  /^\/?(data|cf-worker|scripts|tests|node_modules|logs|backup|backups|tmp|games|rooms)(\/|$)/i,
  /(^|\/)\.(env|git|gitignore|htaccess|npmrc)/i,
  /(\.db|\.db-wal|\.db-shm|\.sqlite3?|\/dump\.sql)(\?|$)/i
];
function isDeniedStatic(pathname) {
  var p = String(pathname || '');
  try { p = decodeURIComponent(p); } catch (e) {}
  return STATIC_DENY.some(function (re) { return re.test(p); });
}
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

/* ═══════ [v2.67·H1+] ذاكرة الملفات الساكنة الساخنة + ترويسات تخزين مؤقت ═══════
   عواصف الدخول (scrypt غير المحجِب) تعمل على طاقم خيوط libuv نفسه الذي عليه
   fs.stat/createReadStream للملفات الساكنة — عند 40 دخولاً متزامناً تشبعت
   الخيوط الأربعة فتأخر طلب «/» خلفها 765ms (قياس حي). الحل:
   1) الملفات الصغيرة الساخنة تُقدَّم من الذاكرة بلا لمس طاقم الخيوط إطلاقاً،
      مع إعادة تحقق من القرص مرة واحدة كل 5 ثوانٍ لكل ملف (amortized).
   2) ETag + Cache-Control: أصول index.html المرقّمة ‎?v=‎ تُخزَّن يوماً كاملاً
      عند العميل (المرقّم لا يتغير محتواه دون تغيير الرقم) والبقية ساعة،
      و304 للنسخة غير المبدّلة — فتنخفض ضغطات الخادم أصلاً عند العائدين.
   الحد: ملف ≤ 256KB ومجموع ≤ 48MB (هاتف) — الأكبر يُبَث كما كان دائماً. */
const STATIC_MEM = new Map();               /* filePath -> {mtimeMs, size, buf, at} */
const STATIC_MEM_FILE_MAX = 256 * 1024;
const STATIC_MEM_TOTAL_MAX = 48 * 1024 * 1024;
const STATIC_REVALIDATE_MS = 5000;
let __staticMemBytes = 0;
function staticMemPut(filePath, stats, buf) {
  try {
    const old = STATIC_MEM.get(filePath);
    if (old) __staticMemBytes -= old.buf.length;
    STATIC_MEM.set(filePath, { mtimeMs: Math.floor(stats.mtimeMs), size: stats.size, buf: buf, at: Date.now() });
    __staticMemBytes += buf.length;
    while (__staticMemBytes > STATIC_MEM_TOTAL_MAX && STATIC_MEM.size > 1) {
      const k = STATIC_MEM.keys().next().value;   /* الأقدم إدراجاً يُطرح أولاً */
      __staticMemBytes -= STATIC_MEM.get(k).buf.length;
      STATIC_MEM.delete(k);
    }
  } catch (e) {}
}
function staticHeadersFor(filePath, etag, versioned) {
  return {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': versioned ? 'public, max-age=86400' : 'public, max-age=3600',
    'ETag': etag,
    'X-Content-Type-Options': 'nosniff'
  };
}
function serveStaticFile(filePath, req, res, pathname) {
  const versioned = /[?&]v=/.test(String(req.url || ''));
  /* 1) ذاكرة حديثة → تقديم فوري بلا طاقم خيوط إطلاقاً (هذا جوهر الإصلاح) */
  const mem = STATIC_MEM.get(filePath);
  if (mem && (Date.now() - mem.at) < STATIC_REVALIDATE_MS) {
    const etag = 'W/"' + mem.size + '-' + mem.mtimeMs + '"';
    const hdrs = staticHeadersFor(filePath, etag, versioned);
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, hdrs); res.end(); return; }
    res.writeHead(200, Object.assign({ 'Content-Length': mem.buf.length }, hdrs));
    res.end(req.method === 'HEAD' ? undefined : mem.buf);
    return;
  }
  /* 2) ذاكرة متقادمة أو غائبة → تحقق واحد من القرص ثم حدِّث وقدِّم */
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + pathname);
      return;
    }
    const etag = 'W/"' + stats.size + '-' + Math.floor(stats.mtimeMs) + '"';
    const hdrs = staticHeadersFor(filePath, etag, versioned);
    if (req.headers['if-none-match'] === etag) {
      if (mem) { mem.at = Date.now(); mem.mtimeMs = Math.floor(stats.mtimeMs); mem.size = stats.size; }
      res.writeHead(304, hdrs); res.end(); return;
    }
    if (stats.size <= STATIC_MEM_FILE_MAX) {
      fs.readFile(filePath, function (e2, buf) {
        if (e2 || !buf) {   /* فشل قراءة → بث من القرص احتياطاً */
          res.writeHead(200, hdrs);
          fs.createReadStream(filePath).pipe(res);
          return;
        }
        staticMemPut(filePath, stats, buf);
        res.writeHead(200, Object.assign({ 'Content-Length': buf.length }, hdrs));
        res.end(req.method === 'HEAD' ? undefined : buf);
      });
      return;
    }
    /* 3) ملف كبير → بث من القرص كما كان دائماً */
    res.writeHead(200, Object.assign({ 'Content-Length': stats.size }, hdrs));
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ═══════ تخزين الحسابات: SQLite (نفس باك-أند المنصة القديم royalcoin.db) ═══════ */
const { DatabaseSync } = require('node:sqlite');
const DB_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DB_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DB_DIR, 'royalcoin.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','super')),
  gold INTEGER NOT NULL DEFAULT 1000,
  lang TEXT NOT NULL DEFAULT 'ar',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL DEFAULT 0,
  totp_secret TEXT,
  twofa_enabled INTEGER NOT NULL DEFAULT 0
);
`);
/* [2FA] ترحيل آمن: إضافة أعمدة المصادقة الثنائية لقواعد البيانات القديمة (royalcoin.db) */
try { db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN twofa_enabled INTEGER NOT NULL DEFAULT 0'); } catch (e) {}
/* [Referral/Admins] أعمدة نظام الإحالة والأدمنز */
try { db.exec('ALTER TABLE users ADD COLUMN ref_code TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN admin_id INTEGER'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN referred_by INTEGER'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN muted_until INTEGER NOT NULL DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN first_topup_done INTEGER NOT NULL DEFAULT 0'); } catch (e) {}

/* [Friends] جداول الأصدقاء والرسائل الخاصة */
db.exec(`
CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_friends ON friends(user_id, friend_id);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  room_code TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_created ON messages(created_at);
CREATE TABLE IF NOT EXISTS admin_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_msg_created ON admin_messages(created_at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

/* [server-tx] سجل المعاملات المالية (transactions) + تذاكر الرهانات (bet_tickets) */
db.exec(`
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER,
  counterparty_id INTEGER,
  counterparty_name TEXT,
  actor_id INTEGER,
  actor_name TEXT,
  game_id TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user_time ON transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
CREATE TABLE IF NOT EXISTS bet_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  bet INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  payout INTEGER NOT NULL DEFAULT 0,
  result_txt TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tk_user_time ON bet_tickets(user_id, created_at);
`);

/* [v2.71·سجل] مفتاح الجولة: يربط صف transactions بتذكرة bet_tickets لنفس الجولة
   حتى تظهر الجولة مرة واحدة في السجل المدمج للأدمن (تذاكر + معاملات)،
   ومع ذلك تُكتب التذكرة في كل لعبة — متطلبات المالك: «التذاكر تُسجَّل في كل
   لعبة ومبلغ الرهان يُسوى في السجل بدقة وبدون تكرار». NULL = خارج الغرف
   (ألعاب فردية) فيُعرض صفها من التذكرة وحدها كسابق. */
try { db.exec("ALTER TABLE transactions ADD COLUMN round_id TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE bet_tickets ADD COLUMN round_id TEXT"); } catch (e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_tx_round ON transactions(round_id)"); } catch (e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_tk_round ON bet_tickets(round_id)"); } catch (e) {}

/* [Group-Legacy] جداول بيانات قديمة من نظام الجولات الجماعية المُزال —
   تُبقى للتوافق مع قواعد بيانات قائمة (تسوية الرهانات المعلقة عند الإقلاع) */
db.exec(`
CREATE TABLE IF NOT EXISTS group_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'betting' CHECK (status IN ('betting','drawing','flying','finished')),
  seed TEXT,
  seed_hash TEXT,
  outcome TEXT,
  started_at INTEGER,
  bet_ends_at INTEGER,
  crashed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  bet INTEGER NOT NULL,
  picks TEXT,
  cashout_mult REAL,
  won INTEGER NOT NULL DEFAULT 0,
  payout INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_group_bets_round ON group_bets(round_id);
CREATE INDEX IF NOT EXISTS idx_group_rounds_game ON group_rounds(game_id, id DESC);
`);

/* مخطط تشفير كلمات المرور مطابق للباك-أند القديم (scrypt) */
function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}
function verifyPassword(password, saltHex, expectedHash) {
  const { hash } = hashPassword(password, saltHex);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/* [v2.67·H1] فحص كلمة المرور غير المحجِب: scrypt في طاقم libuv بدل scryptSync الذي
   كان يجمّد حلقة الأحداث ~300ms لكل محاولة (قياس خط الأساس: تسجيل الدخول 32rps
   وحده — جوهر «المعالجة التسلسلية» التي خنقت المنصة تحت الحمل). الناتج مطابق
   حرفياً لنفس المخطط (N=16384,r=8,p=1) فلا تغيير في الهاشات المخزّنة. */
const DUMMY_SCRYPT_SALT = '00000000000000000000000000000000';
function verifyPasswordAsync(password, saltHex, expectedHash) {
  return new Promise(function (resolve) {
    try {
      const salt = Buffer.from(saltHex || DUMMY_SCRYPT_SALT, 'hex');
      crypto.scrypt(password, salt, 64, function (err, hash) {
        if (err || !hash) { resolve(false); return; }
        try {
          const a = Buffer.from(hash.toString('hex'), 'hex');
          const b = Buffer.from(String(expectedHash || ''), 'hex');
          resolve(a.length === b.length && crypto.timingSafeEqual(a, b));
        } catch (e) { resolve(false); }
      });
    } catch (e) { resolve(false); }
  });
}

/* ═══════ [2FA] TOTP (RFC 6238) — node:crypto فقط (HMAC-SHA1, 30s, 6 أرقام, base32) ═══════ */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const lookup = {};
  for (let i = 0; i < BASE32_ALPHABET.length; i++) lookup[BASE32_ALPHABET[i]] = i;
  str = String(str || '').toUpperCase().replace(/=+$/, '');
  let bits = 0, value = 0;
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const c = lookup[str[i]];
    if (c === undefined) continue;
    value = (value << 5) | c;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}
/* سر TOTP عشوائي (20 بايت → base32) */
function totpSecret() { return base32Encode(crypto.randomBytes(20)); }
/* رمز TOTP عند لحظة زمنية معيّنة (ميلي ثانية) */
function totpAt(secret, time) {
  const key = base32Decode(secret);
  if (!key.length) return '';
  const counter = Math.floor(time / 30000);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, '0');
}
/* التحقق من رمز TOTP مع نافذة ±1 خطوة زمنية */
function totpVerify(secret, code) {
  if (!secret || code == null) return false;
  code = String(code).trim();
  if (!/^\d{6}$/.test(code)) return false;
  const now = Date.now();
  for (let w = -1; w <= 1; w++) {
    if (totpAt(secret, now + w * 30000) === code) return true;
  }
  return false;
}

let nextUserId = 100;
const users = {};               // userId -> {id, username, passHash, passSalt, role, gold, lang, banned}
const sessions = {};            // sid -> userId
/* [v2.68·عزل] نظام الغرف أصبح لكل لعبة مديره المستقل: games/registry.js
   (تعريف كل لعبة: مقاعدها/حركاتها/مخطط حالتها) + rooms/room-manager.js
   (دورة حياة مخصصة لكل لعبة) + rooms/index.js (المحور: توجيه معرف/رمز عالمي).
   الخريطة العالمية `rooms` المشتركة أزيلت — غرف كل لعبة معزولة عن الأخريات،
   فلا عطل في لعبة يمس بقية الألعاب. إنجاز v2.67 (رتابة المعرفات عبر جدول
   meta) محفوظ حرفياً داخل المحور. الإنشاء أدناه بعد اكتمال السياق (users/db/sse). */
/* [Payments 2026-09-16] المحفظة/الدفع/السحب فوق SQLite المحلية — بلا D1 (تصحيح المالك) */
const pay = require('./server-payments.js');
pay.initPaymentsTables(db);
pay.setContext(db, users, sessions);
/* [Support 2026-09-18] بوت دعم العملاء @dtsgsupports_bot — نفس القاعدة والجلسات */
const sup = require('./server-support.js');
sup.initSupport(db);
sup.setCtx(db, users, sessions, {
  /* أزرار الموافقة المالية (dapp/drej/wapp/wrej) تعمل من بوت الدعم كأنها من بوت المنصة */
  payAction: async function (act, txId, actor) {
    const map = { dapp: 'approve', drej: 'reject', wapp: 'approve', wrej: 'reject' };
    const r = await pay.adminActOnPlatformTx(txId, map[act] || '', (actor && actor.name) || 'telegram');
    return r;
  }
});
/* [Private Chat 2026-09-22] بوت المحادثات الخاصة للمستخدمين المرتبطين فقط.
   يستعمل نفس SQLite والجلسات، لكنه يحتفظ بمحادثاته وجداول صلاحياته منفصلة عن الدعم. */
const privateChat = require('./server-private-chat.js');
privateChat.initPrivateChat(db);
privateChat.setCtx(db, users, sessions);
/* رسم الرهان على المنصة: نسبة تُقتطع من الرهان عند تسوية الجولة بين لاعبَين */
const BET_FEE_RATE = 0.05;      /* 5% رسوم المنصة على الرهان */
/* [B-rooms] غرف الساعة: رسم افتتاح ثابت يُقتطع من المضيف + مدة صلاحية الغرفة */
const HOUR_ROOM_FEE = 100;      /* 🪙 رسم إنشاء غرفة الساعة */
const HOUR_ROOM_MS = 3600000;   /* ساعة واحدة */

/* تحميل المستخدمين من قاعدة البيانات إلى الذاكرة */
function loadUsersFromDB() {
  const rows = db.prepare('SELECT id, username, pass_hash, pass_salt, role, gold, lang, banned, totp_secret, twofa_enabled, telegram_id, ref_code, admin_id, referred_by, muted_until, first_topup_done, created_at, last_seen FROM users').all();
  rows.forEach(function (r) {
    users[r.id] = {
      id: r.id, username: r.username,
      passHash: r.pass_hash, passSalt: r.pass_salt,
      role: r.role, gold: r.gold, lang: r.lang, banned: !!r.banned,
      totpSecret: r.totp_secret || null, twofaEnabled: !!r.twofa_enabled,
      telegram_id: r.telegram_id || null,
      ref_code: r.ref_code || null, admin_id: r.admin_id || null,
      referred_by: r.referred_by || null,
      /* [v2.43] يلزمهما سجل الحساب (انضممت/آخر نشاط) — كانا لا يُحمَّلان أصلاً */
      created_at: (r.created_at != null) ? Number(r.created_at) : null,
      last_seen: (r.last_seen != null) ? Number(r.last_seen) : null,
      muted_until: r.muted_until || 0, first_topup_done: !!r.first_topup_done,
    };
    if (r.id >= nextUserId) nextUserId = r.id + 1;
  });
}
/* حفظ مستخدم جديد في قاعدة البيانات وربطه بالذاكرة */
function persistUser(u) {
  const t = Math.floor(Date.now() / 1000);
  const info = db.prepare('INSERT INTO users (username, pass_hash, pass_salt, role, gold, lang, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?)').run(
    u.username, u.passHash, u.passSalt, u.role || 'user', u.gold || 0, u.lang || 'ar', t, t
  );
  u.id = Number(info.lastInsertRowid);
  if (u.id >= nextUserId) nextUserId = u.id + 1;
  users[u.id] = u;
}
/* [Decimal 2026-09-13] تقريب مالي موحد لمنزلتين عشريتين — الرصيد والأرباح
   يقبلان القيم العشرية (0.00) لدقة توزيع الأرباح والخسائر (طلب المالك).
   SQLite يخزن REAL داخل أعمدة INTEGER بلا تقريب (أنواع ديناميكية) — r2
   يمنع فوضى الفاصلة العائمة (0.1+0.2) ولا يفرض أعداداً صحيحة. */
function r2(v) {
  if (typeof v !== 'number' || !isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/* [server-tx] تسجيل معاملة مالية في جدول transactions (لا تُفشل العملية الأصل أبداً) */
function logTx(user, type, amount, extra) {
  try {
    const ex = extra || {};
    const base = [
      user.id, String(type || ''), r2(amount || 0),
      (ex.balance_after != null) ? r2(ex.balance_after) : null,
      ex.counterparty_id != null ? ex.counterparty_id : null,
      ex.counterparty_name != null ? String(ex.counterparty_name) : null,
      ex.actor_id != null ? ex.actor_id : null,
      ex.actor_name != null ? String(ex.actor_name) : null,
      ex.game_id != null ? String(ex.game_id) : null,
      ex.note != null ? String(ex.note) : null
    ];
    const tail = Math.floor(Date.now() / 1000);
    /* [v2.71] شبكة أمان: إن غاب عمود round_id (قاعدة لم تُرقَّ) نكتب بالشكل
       القديم بلا رابط — صفٌّ بلا رابط خيرٌ من ضياع السجل المالي كله. */
    try {
      db.prepare(
        'INSERT INTO transactions (user_id, type, amount, balance_after, counterparty_id, counterparty_name, actor_id, actor_name, game_id, note, round_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(...base, ex.round_id != null ? String(ex.round_id) : null, tail);
    } catch (e) {
      db.prepare(
        'INSERT INTO transactions (user_id, type, amount, balance_after, counterparty_id, counterparty_name, actor_id, actor_name, game_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
      ).run(...base, tail);
    }
  } catch (e) {}
}
/* [server-tx] تسجيل تذكرة رهان في جدول bet_tickets (لا تُفشل اللعبة أبداً) */
function logTicket(userId, gameId, bet, won, payout, resultTxt, roundId) {
  try {
    /* نفس شبكة الأمان: تذكرة بلا رابط خيرٌ من ضياع السجل كله */
    let ins;
    try {
      ins = db.prepare(
        'INSERT INTO bet_tickets (user_id, game_id, bet, won, payout, result_txt, round_id, created_at) VALUES (?,?,?,?,?,?,?,?)'
      );
    } catch (e) {
      ins = db.prepare(
        'INSERT INTO bet_tickets (user_id, game_id, bet, won, payout, result_txt, created_at) VALUES (?,?,?,?,?,?,?)'
      );
      roundId = null;
    }
    ins.run(userId, String(gameId || ''), bet || 0, won ? 1 : 0, payout || 0,
      (resultTxt != null) ? String(resultTxt).slice(0, 90) : null,
      (roundId != null) ? String(roundId) : null, Math.floor(Date.now() / 1000));
  } catch (e) {}
}

/* ═══ [v2.76·ترتيب حقيقي] المتصدرون من بيانات الرهان الفعلية (bet_tickets) ═══
   توجيه المالك (2026-10-02): «إثراء صفحة الترتيب بمعلومات الترتيب الحقيقية
   الخاصة بكل لعبة على حدة + ترتيب عام حسب مجموع الأرباح».
   • الترتيب العام = مجموع أرباح المستخدم عبر كل الألعاب (Σ payout − Σ bet)،
     وترتيب مستقل لكل لعبة على حدة (?game=<id>).
   • المعروض حصرياً صافي أرباح اللعب (جولات/فوز/ربح) — الأرصدة الجارية
     تبقى خصوصية كما قررنا في [DTSG-019] (لا تُكشف للعموم).
   • الأدمن والسوبر والمحظورون مستبعدون من لوحة الشرف (نفس سياسة /api/lb).
   • كاش ذاكرة 60ث للمجموع الكامل: استعلام تجميعي واحد لكل دقيقة حماية
     لمعالج هاتف الخادم — الترتيب لا يتغير إلا بجولات جديدة أصلاً. */
const LB_CACHE = { at: 0, data: null };
function lbCompute(force) {
  const now = Date.now();
  if (!force && LB_CACHE.data && now - LB_CACHE.at < 60000) return LB_CACHE.data;
  const ex = new Set();
  Object.values(users).forEach(function (u) {
    if (!u || u.role === 'admin' || u.role === 'super' || u.banned) ex.add(u.id);
  });
  const rows = [];
  const gamesCount = {};
  try {
    const g = db.prepare('SELECT game_id AS gid, user_id AS uid, SUM(payout - bet) AS profit, COUNT(*) AS rounds, SUM(won) AS wins FROM bet_tickets GROUP BY game_id, user_id').all();
    g.forEach(function (r) {
      const uid = Number(r.uid);
      if (ex.has(uid)) return;
      const u = users[uid];
      if (!u) return;
      gamesCount[r.gid] = (gamesCount[r.gid] || 0) + 1;
      rows.push({ uid: uid, username: u.username, gid: r.gid, profit: r2(r.profit), rounds: Number(r.rounds) || 0, wins: Number(r.wins) || 0 });
    });
  } catch (e) {}
  const sortRows = function (a) {
    return a.sort(function (x, y) { return (y.profit - x.profit) || (y.wins - x.wins) || (x.rounds - y.rounds); });
  };
  /* الطي للمجموع العام (نفس المستخدم عبر كل الألعاب) */
  const overallMap = {};
  rows.forEach(function (r) {
    if (!overallMap[r.uid]) overallMap[r.uid] = { uid: r.uid, username: r.username, profit: 0, rounds: 0, wins: 0 };
    overallMap[r.uid].profit = r2(overallMap[r.uid].profit + r.profit);
    overallMap[r.uid].rounds += r.rounds;
    overallMap[r.uid].wins += r.wins;
  });
  const perGame = {};
  rows.forEach(function (r) {
    if (!perGame[r.gid]) perGame[r.gid] = [];
    perGame[r.gid].push(r);
  });
  Object.keys(perGame).forEach(function (gid) { perGame[gid] = sortRows(perGame[gid]); });
  const data = {
    at: now,
    overall: sortRows(Object.values(overallMap)),
    perGame: perGame,
    games: Object.keys(gamesCount).map(function (gid) { return { game_id: gid, players: gamesCount[gid] }; })
      .sort(function (a, b) { return b.players - a.players; })
  };
  LB_CACHE.at = now;
  LB_CACHE.data = data;
  return data;
}

/* [Financials 2026-09-28] بوت المالية للسوپر أدمن @dtsgfinancials_bot — نفس القاعدة
   والصلاحيات وجداول الداشبورد: يعرض الشحن/السحب/سجلات المستخدمين/جميع السجلات،
   وينفّذ الموافقة/الرفض بنفس دوال الداشبورد (pay.adminActOnPlatformTx) والشحن/
   الخصم/الضبط بنفس منطق /api/admin/user/:id/balance (logTx نفسه). سوپر أدمن حصراً. */
const fin = require('./server-financials.js');
fin.initFinancials(db);
fin.setCtx(db, users, sessions, {
  pay: pay,
  logTx: logTx,
  notifyUser: async function (userId, text) {
    try { return await sup.notifyUser(userId, text); } catch (e) { return false; }
  }
});

/* إنشاء الحسابات الافتراضية فقط إن كانت القاعدة فارغة (نفس حسابات الباك-أند القديم) */
(function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;
  const t = Math.floor(Date.now() / 1000);
  /* [Sec v2.27] كلمات البذر من البيئة في الإنتاج — القيم الافتراضية للتطوير فقط.
     المستودع عام: على النشر القائم تدوير كلمات super/admin/player القائمة فوراً
     (البذر يجري مرة واحدة عند قاعدة فارغة ولا يغيّر كلمات حسابات موجودة). */
  const seeds = [
    ['super', process.env.DM_SEED_SUPER_PW || 'RoyalCoin@Super1', 'super'],
    ['admin', process.env.DM_SEED_ADMIN_PW || 'RoyalCoin@Admin1', 'admin'],
    ['player', process.env.DM_SEED_USER_PW || 'RoyalCoin@User1', 'user']
  ];
  const ins = db.prepare('INSERT INTO users (username, pass_hash, pass_salt, role, gold, created_at, last_seen) VALUES (?,?,?,?,?,?,?)');
  for (const [name, pass, role] of seeds) {
    const { salt, hash } = hashPassword(pass, null);
    ins.run(name, hash, salt, role, 1000, t, t);
  }
  console.log('[seed] created default accounts: super, admin, player');
})();
loadUsersFromDB();

/* [Friends] مؤقّت تنظيف الرسائل الأقدم من 24 ساعة */
setInterval(() => {
  try { db.prepare('DELETE FROM messages WHERE created_at < ?').run(Date.now() - 24 * 3600 * 1000); } catch (e) {}
}, 5 * 60 * 1000);

/* [B-rooms] sweeper غرف الساعة كل 60ث + [v2.69] رعاية الغائبين أثناء الجولة:
   من انقطع بلا حضور SSE ولا نشاط 3 دقائق أثناء جولة جارية يُوسم مقعده isBot
   (بلا leftRound — انقطاع/إغلاق/تحديث الصفحة ليست مغادرة بتوجيه المالك)
   فيكمل عنه السائق آلياً، ويستعيد مقعده لحظة عودته (shared.resumeIfGhost).
   كان يُحذف من الغرفة ويُسترد إيداعه منتصف الجولة ⇒ انزياح مقاعد التسوية
   (w0-w3 تشير إلى لاعبين خاطئين) = جذر «الرهان لا يُسوّى للرابح».
   إن صار كل اللاعبين النشطين آليين (لا أحد حي): استرداد الجميع وحلّ الغرفة.
   مدة السماح قابلة للضبط لل اختبار (DTSG_GHOST_GRACE_MS). */
const GHOST_GRACE_MS = (parseInt(process.env.DTSG_GHOST_GRACE_MS, 10) > 0) ? parseInt(process.env.DTSG_GHOST_GRACE_MS, 10) : (3 * 60 * 1000);
function ghostSweepPass(forceGraceMs) {
  const grace = (Number(forceGraceMs) > 0) ? Number(forceGraceMs) : GHOST_GRACE_MS;
  roomHub.allRooms().forEach(function (room) {   /* [v2.68·عزل] كل غرف كل الألعاب عبر المحور */
    try {
      roomHub.io.sweepExpiredRoom(room);
      if (room.status === 'playing' && !room.settled) {
        const cutoff = Date.now() - grace;
        let changed = false;
        room.players.filter(function (p) { return !p.spectate && users[p.id]; }).forEach(function (p) {
          if (p.isBot) return;   /* موسوم سلفاً — مغادر أو غائب سابق */
          const lastSeen = Math.max((room.lastActivity && room.lastActivity[p.id]) || 0, 0);
          if (!hasLiveSse(p.id) && lastSeen < cutoff) {
            /* [v2.69] وسم آلي بلا حذف وبلا استرداد — الإيداع يبقى في الجرة
               والعودة تستعيد المقعد (الانقطاع ليس مغادرة) */
            p.isBot = true;
            p.ready = true;
            changed = true;
          }
        });
        if (changed) {
          const actives = room.players.filter(function (x) { return !x.spectate; });
          const anyHumanAlive = actives.some(function (x) { return !x.isBot; });
          if (actives.length && !anyHumanAlive) {
            /* لا أحد حي لتكمل الجولة — dissolveRoom يسترد إيداعات الجوة غير
               المسوّاة ويبث room:update=null ويحذف من فهرس المحور والمدير */
            roomHub.io.dissolveRoom(room);
          } else {
            roomHub.io.updateRoom(room);
          }
        }
      }
    } catch (e) {}
  });
}
global.__DTSG_GHOST_SWEEP = ghostSweepPass;   /* مقبض اختبار: دورة تنظيف واحدة عند الطلب */
/* [v2.71] الفترة قابلة للضبط للاختبارات (DTSG_GHOST_SWEEP_MS) — الافتراضي
   كما كان: كل 60 ثانية. */
const GHOST_SWEEP_MS = (parseInt(process.env.DTSG_GHOST_SWEEP_MS, 10) > 0) ? parseInt(process.env.DTSG_GHOST_SWEEP_MS, 10) : (60 * 1000);
setInterval(ghostSweepPass, GHOST_SWEEP_MS);
/* [v2.67] حضور حقيقي = اتصال SSE مفتوح فعلاً للهوية — خريطة room.online تُملأ
   أيضاً عند الإنشاء/الانضمام (بلا قناة) فلا تصلح وحدها لكشف الأشباح */
function hasLiveSse(uid) {
  return sseClients.some(function (c) { return c.userId != null && c.userId === uid; });
}

/* ═══════ [Group-Removal] أزيلت الجولات الجماعية (كينو/كراش) من المنتج — 2026-09-27.
   هذه التسوية تُبقى فقط لاسترداد أي رهانات معلقة من جولات قديمة قائمة في القاعدة
   عند إقلاع السيرفر (حماية أموال اللاعبين)، ثم لا تُنشأ جولات جديدة. */
function groupSettleLeftover() {
  const rows = db.prepare("SELECT id FROM group_rounds WHERE status IN ('betting','drawing','flying')").all();
  const updBet = db.prepare('UPDATE group_bets SET won = 1, payout = bet WHERE round_id = ? AND won = 0');
  for (const r of rows) {
    const bets = db.prepare('SELECT * FROM group_bets WHERE round_id = ? AND won = 0').all(r.id);
    for (const b of bets) {
      const u = users[b.user_id];
      if (u) {
        u.gold = (u.gold || 0) + b.bet;
        try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
      } else {
        try { db.prepare('UPDATE users SET gold = gold + ? WHERE id = ?').run(b.bet, b.user_id); } catch (e) {}
      }
    }
    updBet.run(r.id);
    db.prepare("UPDATE group_rounds SET status = 'finished' WHERE id = ?").run(r.id);
  }
  if (rows.length) console.log('[group] refunded ' + rows.length + ' leftover round(s)');
}
function groupStartAll() {
  try {
    groupSettleLeftover();
    console.log('[group] group rounds removed — leftover bets refunded');
  } catch (e) {
    console.error('[group] settle failed', e);
  }
}

/* ═══════ [Referral] رمز الإحالة المميز: لكل مسجّل في المنصة ═══════
   يسلمه المحال الجديد للأدمن الذي يسجله، فيستفيد صاحب الإحالة
   من هدية الإحالة (10% من أول عملية شحن) حسب قواعد المنصة */
function genRefCode(id) {
  for (let guard = 0; guard < 50; guard++) {
    const code = 'GV' + id.toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    if (!Object.values(users).some(function (u) { return u.ref_code === code; })) return code;
  }
  return 'GV' + id + '-' + Date.now().toString(36).toUpperCase();
}
/* توليد رمز إحالة لأي حساب قديم بلا رمز — ويُحفظ في قاعدة البيانات */
Object.values(users).forEach(function (u) {
  if (!u.ref_code) {
    u.ref_code = genRefCode(u.id);
    try { db.prepare('UPDATE users SET ref_code = ? WHERE id = ?').run(u.ref_code, u.id); } catch (e) {}
  }
});

/* ═══════ صلاحيات الأدوار ═══════ */
function isAdmin(u) { return !!u && (u.role === 'admin' || u.role === 'super'); }
function isSuper(u) { return !!u && u.role === 'super'; }
/* الألعاب المعطّلة (سوبر أدمن فقط): id → enabled — [إصلاح] تُحفظ في القاعدة، كانت بالذاكرة فقط فتضيع مع كل إعادة تشغيل */
db.exec("CREATE TABLE IF NOT EXISTS game_flags (game_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1)");
const gameFlags = {};
try {
  db.prepare('SELECT game_id, enabled FROM game_flags').all().forEach(function (r) { gameFlags[r.game_id] = !!r.enabled; });
} catch (e) {}

const sseClients = [];          // [{res, userId}]
const winners = [
  { username: 'tarik', game_id: 'Moroccan Ronda', payout: 350 },
  { username: 'mehdi_rabat', game_id: 'Billiards 🎱', payout: 1250 },
  { username: 'ilyas', game_id: 'Parchisi 🎲', payout: 400 }
];

/* ═══════ أدوات الجلسة ═══════ */
function parseCookies(req) {
  const out = {};
  const hdr = req.headers.cookie || '';
  hdr.split(';').forEach(function (p) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function startSession(res, user) {
  const sid = crypto.randomBytes(18).toString('hex');
  sessions[sid] = user.id;
  /* SameSite=None مطلوب لكوكي الجلسة عبر النطاقات (pages.dev → workers.dev → النفق) */
  res.setHeader('Set-Cookie', 'sid=' + sid + '; Path=/; HttpOnly; SameSite=None; Secure');
}
function getUser(req) {
  const sid = parseCookies(req).sid;
  const uid = sid ? sessions[sid] : null;
  return (uid != null && users[uid]) ? users[uid] : null;
}
/* [v2.44-MONEY] مرجع الرصيد: يزداد مع كل تعديل خادمي على ذهب الحساب.
   العميل يرسله مع /api/sync؛ يُقبل رصيده فقط إن لم يتغيّر المرجع (بلا تعديل خادمي)،
   وإلا فرصيد الخادم هو المصدر الوحيد للحقيقة (كان العميل القديم يطمس الشحن). */
const goldRev = new Map();
function bumpGoldRev(u) {
  try { if (u) goldRev.set(String(u.id), (goldRev.get(String(u.id)) || 0) + 1); } catch (e) {}
}
function getGoldRev(u) { return u ? (goldRev.get(String(u.id)) || 0) : 0; }
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, role: u.role, gold: u.gold, lang: u.lang,
    gold_rev: getGoldRev(u),
    twofa_enabled: !!u.twofaEnabled,
    /* [v2.43] تاريخ الانضمام وآخر نشاط (بالثواني — العميل يضرب ×1000)
       كانا مفقودين فظهر «غير متوفر» دائماً في سجل الحساب */
    created_at: (typeof u.created_at === 'number') ? u.created_at : (u.created_at ? Math.floor(new Date(u.created_at).getTime() / 1000) || null : null),
    last_seen: (typeof u.last_seen === 'number') ? u.last_seen : (u.last_seen ? Math.floor(new Date(u.last_seen).getTime() / 1000) || null : null),
    ref_code: u.ref_code || null, admin_id: u.admin_id || null,
    referred_by: u.referred_by || null,
    muted_until: (u.muted_until && u.muted_until > Date.now()) ? u.muted_until : null
  };
}
/* هل اللاعب موقوف عن التعليق الصوتي والمراسلة؟ */
function isMuted(u) { return !!(u && u.muted_until && u.muted_until > Date.now()); }

/* ═══════ [v2.68·عزل] الغرف: مدير لكل لعبة عبر المحور ═══════
   كل توابع الغرف القديمة (serializeRoom/broadcastRoom/updateRoom/غرف الساعة/
   الإيداعات/التصويت/الطابور/السائق) انتقلت حرفياً إلى rooms/shared.js وتُدار
   لكل لعبة عبر rooms/room-manager.js. server.js يستهلك المحور فقط. */
const roomHub = require('./rooms/index.js').createRoomHub({
  users: users, db: db, sseClients: sseClients,
  BET_FEE_RATE: BET_FEE_RATE, r2: r2, logTx: logTx, logTicket: logTicket, isMuted: isMuted
});
/* ═══════ [v2.75·تحكيم] نظام البث المباشر للتحكيم البشري ═══════
   اللاعبون يبثون شاشاتهم WebRTC P2P إلى لوحة الأدمن لحسم مباريات وجه
   لوجه؛ هذا الخادم مُرشِد إشارات فقط (Offer/Answer/ICE تُرحّل عبر
   ناقل SSE الحي القائم — لا مكتبات جديدة ولا منفذ إضافي عبر النفق).
   الحسم/الإلغاء يعيدان استخدام نواة التسوية المعتمدة (arbResolve/
   arbCancel في مدير الغرف) — لا مسار مال جديد. التفصيل: docs/ARBITRATION_SETUP.md */
const arb = require('./server-arbitration.js').createArbitration({
  users: users, db: db, roomHub: roomHub,
  sendToUser: sendToUser, sseClients: sseClients, pushWallet: pushWallet,
  r2: r2, logTx: logTx, BET_FEE_RATE: BET_FEE_RATE
});
/* [v2.75·تحكيم] منظّف النبض كل 5ث: انقطاع بث > 15ث يوسم failed وينبّه
   لوحة الأدمن آلياً (مؤقت واحد خفيف — بلا مراقبة لكل جلسة على حدة) */
setInterval(function () { try { arb.sweep(); } catch (e) {} }, 5000);
/* ═══════ [v2.81·mediamtx] مراقبة حالة بث المرحّل ═══════
   ربط الباكأند بـ MediaMTX API لمعرفة حالة البث الحية (هل اللاعب يبث فعلاً
   أم انقطع؟) — الاستعلام عبر Loopback المحلي حصراً (صفر باندويث عبر النفق)
   وعند الطلب حصراً (لا حلقات خلفية إطلاقاً) وتعطّل المرحّل يعيد offline
   بلا أي أثر على الخادم أو قاعدة البيانات. التفصيل: docs/ARBITRATION_SETUP.md §8 */
const mtx = require('./server-mediamtx.js').createMediaMtxMonitor({
  db: db, roomHub: roomHub, users: users, sseClients: sseClients, arb: arb
});
function sendSSE(res, event, data) {
  try { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch (e) {}
}
/* [v2.43] دفع الرصيد لحظياً لصاحب الحساب بعد أي تغيير مالي يحدث خارج جلسته
   (اعتماد إيداع/كوبون/إنشاء طلب سحب) — بدونه يبقى الرصيد المعروض قديماً حتى إعادة التحميل. */
function pushWallet(userId, extra) {
  try {
    const key = String(userId);
    const u = users[key] || Object.values(users).find(function (x) { return String(x.id) === key; });
    if (!u) return false;
    const rate = Number(process.env.USD_GOLD_RATE || 100);
    const payload = Object.assign({
      user_id: String(u.id),
      coins: u.gold || 0,
      usd: Math.round(((u.gold || 0) / rate) * 100) / 100
    }, extra || {});
    bumpGoldRev(u);
    payload.gold_rev = getGoldRev(u);
    sendToUser(Number(u.id), 'wallet', payload);
    /* [v2.44] إشعار فوري لكل الأدمنز/السوبر (حدث adminpay) ليتابعوا الحركة في الداشبورد */
    try {
      const ev = Object.assign({}, payload, extra || {});
      sseClients.forEach(function (c) {
        const cu = c.userId != null ? users[c.userId] : null;
        if (cu && (cu.role === 'admin' || cu.role === 'super')) sendSSE(c.res, 'adminpay', ev);
      });
    } catch (e) {}
    return true;
  } catch (e) { return false; }
}
global.__DTSG_PUSH_WALLET = pushWallet;
/* ═══ [v2.44-MONEY] سجل المال العام: كل حركة رصيد (إيداع/سحب/كوبون/بونص/لعبة) تُسجَّل هنا
   ويُبثّ حدث adminpay لكل الأدمنز ⇒ داشبورد السوبر أدمن يعرض السجل لحظياً. */
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS money_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT, kind TEXT, amount_usd REAL, coins INTEGER,
    status TEXT, ref TEXT, note TEXT, actor TEXT, created_at INTEGER)`).run();
} catch (e) {}
function moneyLog(userId, kind, amountUsd, coins, status, ref, note, actor) {
  /* لا تسجّل ضجيجاً: تسوية بلا مبلغ ولا كوينز ولا ملاحظة = لا شيء يستحق العرض */
  if ((!kind || kind === 'adjust') && !Number(coins || 0) && !String(note || '').trim()) return;
  try {
    db.prepare('INSERT INTO money_log (user_id, kind, amount_usd, coins, status, ref, note, actor, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(String(userId), String(kind || ''), Number(amountUsd || 0), Math.round(Number(coins || 0)),
           String(status || ''), String(ref || ''), String(note || ''), String(actor || 'system'), Date.now());
  } catch (e) {}
  try {
    const u = users[Number(userId)] || Object.values(users).find(function (x) { return String(x.id) === String(userId); });
    const ev = { user_id: String(userId), username: u ? u.username : '', kind: kind, usd: Number(amountUsd || 0),
      coins: Math.round(Number(coins || 0)), status: status, ref: ref || '', note: note || '', ts: Date.now() };
    sseClients.forEach(function (c) {
      const cu = c.userId != null ? users[c.userId] : null;
      if (cu && (cu.role === 'admin' || cu.role === 'super')) sendSSE(c.res, 'adminpay', ev);
    });
  } catch (e) {}
}
global.__DTSG_MONEY_LOG = moneyLog;
global.__DTSG_MONEY_NOTE = function (id, note) { if (note) moneyLog(id, 'adjust', 0, 0, 'note', '', note, 'hook'); };
global.__DTSG_GOLD_REV = function (id) { return goldRev.get(String(id)) || 0; };
global.__DTSG_MONEYHOOK_READY = true;

/* [Friends] إرسال حدث SSE لمستخدم محدّد (يطابق بنية sseClients الموجودة) */
function sendToUser(userId, event, data) {
  sseClients.forEach(function (c) {
    if (c.userId != null && c.userId === userId) sendSSE(c.res, event, data);
  });
}


/* [v2.68·عزل] tryResolveRematch/promoteQueued/markOnline/markOffline/
   isOnline/reassignDriver انتقلت حرفياً إلى rooms/shared.js — تُدار عبر المحور. */

/* [CORS DTSG-005 v2.58] قائمة صريحة للأصول الموثوقة — منع عكس أي نطاق خارجي عشوائي.
   [SEC 2026-09-23] القائمة القديمة كانت تقبل أي *.pages.dev وأي *.workers.dev
   (حساب Cloudflare مجاني = أصل «موثوق» بالكامل!) ⇒ قراءات المحفظة كانت تتسرّب
   لأي صفحة شريرة على هذين النطاقين. الآن: نطاقات المنصة حصراً + محلي للتطوير. */
/* [v2.59.1 OPS] مضيف ثانٍ حقيقي لمشروع Pages «dtsg» (حساب Cloudflare الآخر،
   ID 03efbdbe…) — نطاقه dtsg-3e0.pages.dev وكان يخدم المنصة فعلاً قبل v2.59.
   بالقائمة الصارمة وحدها كان سيُرفض بـ403 فينكسر الدخول لمن يزور ذلك المضيف.
   مطابقة تامة (لا wildcard) — إن حُذف المشروع فاحذف السطر.
   [v2.59.2 R6] dtsg.vercel.app: نشر Vercel حقيقي للمالك — بدونه كل نداءات
   API من ذلك المضيف تُرد 403 (فشل دخول صامت + تعطّل المحفظة والألعاب). */
const ALLOWED_ORIGIN_HOSTS = [
  'dtsg.pages.dev', 'dtsg-3e0.pages.dev', 'dtsg.vercel.app', 'dmgames.pages.dev', 'dmcasino.pages.dev', 'casino-9xj.pages.dev',
  'casino-api.tarikc.workers.dev', 'casino-api.dmgames-api.workers.dev', 'casino-phone.dmgames-api.workers.dev'
];
function isOriginAllowed(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    /* [v2.59 R4-001] لاحقات الساندبوكس العامة (.e2b.app / .arena.ai) لم تعد موثوقة
       افتراضياً — أي طرف ثالث يستطيع إنشاء دومين هناك. تُسمح فقط في DM_TEST_MODE
       أو عبر قائمة صريحة DM_DEV_ORIGINS (مفصولة بفواصل). */
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

/* [DTSG-006 v2.58] مقيد معدل محاولات تسجيل الدخول في الذاكرة — تراجع أُسّي:
   5 إخفاقات خلال نافذة ⇒ قفل، وعند كل تكرار يزداد مدة القفل 1→2→4→8→15 دقيقة (قفل IP + اسم).
   النسخة السابقة كانت 10 محاولات/دقيقة ثم قفل 60ث فقط (leaky bucket ⇒ التخمين مستدام). */
const LOGIN_LADDER_MS = [60000, 120000, 240000, 480000, 900000];
const loginAttempts = new Map();
/* [v2.80·أمن] قفل ثانٍ على مستوى اسم المستخدم (مستقل عن IP): مفتاح IP القديم
   كان يدور بحرية بتزييف ترويسة x-forwarded-for (القيمة الأولى يرسلها العميل
   نفسه)، فتستمر هجمات التخمين على حسابٍ واحد بلا قفل إطلاقاً. القفل
   الإسمي يعقّد الحساب المستهدف مهما دوّر المهاجم عنوانه (20 محاولة/15د)،
   ويعمل جنباً إلى جنب مع قفل IP+اسم القائم — لا يحلّ مكانه. */
const USER_LOGIN_LOCK_MS = 900000;
const USER_LOGIN_LOCK_TRIES = 20;
const userLoginFails = new Map();
function checkUserLock(username) {
  const now = Date.now();
  const rec = userLoginFails.get(String(username || '').toLowerCase());
  if (rec && rec.count >= USER_LOGIN_LOCK_TRIES && now < rec.lockedUntil) {
    return { locked: true, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  return { locked: false };
}
function recordFailedUserLogin(username) {
  const now = Date.now();
  const key = String(username || '').toLowerCase();
  const rec = userLoginFails.get(key);
  if (!rec || now - rec.firstAt > 900000) { userLoginFails.set(key, { count: 1, firstAt: now, lockedUntil: 0 }); }
  else { rec.count++; if (rec.count >= USER_LOGIN_LOCK_TRIES) rec.lockedUntil = now + USER_LOGIN_LOCK_MS; }
}
function clearUserLoginFails(username) { userLoginFails.delete(String(username || '').toLowerCase()); }

function checkLoginRateLimit(ip, username) {
  const now = Date.now();
  const ul = checkUserLock(username);
  if (ul.locked) return { allowed: false, retryAfter: ul.retryAfter };
  const key = String(ip || '0') + '|' + String(username || '').toLowerCase();
  const rec = loginAttempts.get(key);
  if (rec && rec.lockedUntil && now < rec.lockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}
function recordFailedLogin(ip, username) {
  const now = Date.now();
  recordFailedUserLogin(username);
  const key = String(ip || '0') + '|' + String(username || '').toLowerCase();
  let rec = loginAttempts.get(key);
  if (!rec || now - rec.firstAt > 60000) {
    /* نافذة جديدة: إذا قُفل هذا المفتاح ضمن آخر ساعة ⇒ نواصل التصعيد (لا صفر جديد) */
    rec = { count: 1, firstAt: now, lockedUntil: 0, stage: (rec && rec.stage || 0), lastLockAt: (rec && rec.lastLockAt) || 0 };
    if (rec.stage > 0 && now - rec.lastLockAt > 3600000) rec.stage = 0;
  } else {
    rec.count++;
  }
  if (rec.count >= 5) {
    const dur = LOGIN_LADDER_MS[Math.min(rec.stage, LOGIN_LADDER_MS.length - 1)];
    rec.lockedUntil = now + dur;
    rec.lastLockAt = now;
    rec.stage = Math.min(rec.stage + 1, LOGIN_LADDER_MS.length);
  }
  loginAttempts.set(key, rec);
}
/* [2FA v2.58] رمز مؤقت يُصدَر حصراً بعد فحص كلمة مرور ناجح — ما يغلق ثغرة
   «جلسة لأي userId بكلمة مرور صفرية» عبر /api/2fa/login (كان بلا أي إثبات). */
const pending2fa = new Map(); /* token -> { uid, ip, createdAt, expiresAt } */
function issuePending2fa(userId, ip) {
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  pending2fa.set(token, { uid: String(userId), ip: String(ip || ''), createdAt: now, expiresAt: now + 300000 });
  return token;
}
function consumePending2fa(token, userId) {
  if (!token || typeof token !== 'string') return null;
  const rec = pending2fa.get(token);
  if (!rec || rec.expiresAt < Date.now()) { pending2fa.delete(token); return null; }
  if (rec.uid !== String(userId)) return null;
  pending2fa.delete(token); /* استخدام واحد */
  return rec;
}
/* [2FA v2.58] قفل رموز TOTP: 5 أخطاء خلال 10 دقائق ⇒ قفل 15 دقيقة (IP + مستخدم) */
const twofaAttempts = new Map();
function twofaLocked(ip, uid) {
  const now = Date.now();
  const key = String(ip || '0') + '|' + String(uid);
  const rec = twofaAttempts.get(key);
  return !!(rec && rec.lockedUntil > now);
}
function twofaFail(ip, uid) {
  const now = Date.now();
  const key = String(ip || '0') + '|' + String(uid);
  let rec = twofaAttempts.get(key);
  if (!rec || now - rec.firstAt > 600000) rec = { count: 0, firstAt: now, lockedUntil: 0 };
  rec.count++;
  let locked = false;
  if (rec.count >= 5) { locked = true; rec.lockedUntil = now + 900000; rec.count = 0; rec.firstAt = now; }
  twofaAttempts.set(key, rec);
  return locked;
}
function clearFailedLogin(ip, username) {
  const key = String(ip || '0') + '|' + String(username || '').toLowerCase();
  loginAttempts.delete(key);
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  /* [CORS & CSRF DTSG-005 / DTSG-011 v2.58] قائمة صريحة للأصول الموثوقة — منع عكس أي نطاق خارجي وحجب طلبات CSRF.
     [SEC 2026-005] يُرفض الآن كل الطرق (GET/HEAD/POST/OPTIONS…) من أصل غير موثوق:
     النسخة السابقة مرّرت GET/HEAD فتسرّبت قراءات (محافظ/تذاكر) لأي صفحة شريرة. */
  const reqOrigin = req.headers.origin;
  if (reqOrigin && reqOrigin !== 'null') {
    if (isOriginAllowed(reqOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    } else {
      res.writeHead(403, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify({ ok: false, error: 'forbidden_origin', message: 'Cross-origin request blocked' }));
      return;
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  /* ═══════ SSE الحيّ ═══════ */
  if (pathname === '/api/live' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });
    const me = getUser(req);
    /* [v2.67·H3] ‎?since=rev — العميل يرسل آخر ترقيم لديه؛ إن كان أقدم من حالة
       الغرفة فنبثّ التحديث + سجل الحركات كاملاً (room:replay) لإعادة البناء */
    const sinceRev = parseInt(parsedUrl.query && parsedUrl.query.since, 10);
    const helloData = {
      online: 42 + sseClients.length,
      /* الدردشة العامة أزيلت؛ لا نرسل سجل رسائل في SSE. */
      winners: winners
    };
    res.write('event: hello\ndata: ' + JSON.stringify(helloData) + '\n\n');
    sseClients.push({ res: res, userId: me ? me.id : null });

    /* بثّ حالة الغرفة الحالية للمنضمّ المتأخر */
    if (me) {
      roomHub.roomsOfUser(me.id).forEach(function (r) {
        roomHub.io.markOnline(r, me.id);
        sendSSE(res, 'room:update', roomHub.io.serializeRoom(r));
          /* [Resilience + v2.67·H3] أعد بناء حالة الجولة للعائد — سجل الحركات
             يُبثّ كلما وُجد (لا حصرها على playing) وإن كان ترقيم العميل متقادماً */
          if (r.moveHistory && r.moveHistory.length && (isNaN(sinceRev) || sinceRev < (r.rev || 0))) {
            sendSSE(res, 'room:replay', { room_id: r.id, history: r.moveHistory });
          }
      });
    }

    req.on('close', () => {
      const idx = sseClients.findIndex(function (c) { return c.res === res; });
      if (idx !== -1) sseClients.splice(idx, 1);
      /* [Resilience] انقطاع لاعب → تحديث الاتصال وإعادة تعيين السائق */
      if (me) {
        roomHub.roomsOfUser(me.id).forEach(function (r) { roomHub.io.markOffline(r, me.id); });
      }
    });
    return;
  }

  /* ═══════ نقاط API ═══════ */
  if (pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    /* [v2.40.4] build + payments: للتحقق عن بُعد أن الشجرة المشغَّلة هي v2.40+ فعلاً */
    res.end(JSON.stringify({ ok: true, service: 'dmgames-arena', build: BUILD_VERSION, payments: true, ts: Date.now() }));
    return;
  }
  if (pathname.startsWith('/api/')) {
    /* [v2.80·أمن] سقف حجم جسم الطلب (1MB): كان التراكم بلا حدّ — طلب بمقاييس
       غيغابايتية يراكم في الذاكرة (DoS). تجاوز السقف ⇒ قطع فوري بـ413. */
    const BODY_LIMIT = 1024 * 1024;
    let body = '';
    let bodyTooLarge = false;
    req.on('data', chunk => {
      if (bodyTooLarge) return;
      body += chunk;
      if (body.length > BODY_LIMIT) {
        bodyTooLarge = true;
        body = '';
        try { res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' }); } catch (e) {}
        try { res.end(JSON.stringify({ ok: false, message: 'حجم الطلب كبير جداً' })); } catch (e) {}
        try { req.destroy(); } catch (e) {}
      }
    });
    req.on('end', () => {
      if (bodyTooLarge) return;   /* [v2.80·أمن] الطلب المرفوض لا يُعالَج */
      /* [NEW-6 v2.58] حارس عام: أي استثناء غير متوقع ⇒ 500 JSON موحّد
         (بدل انهيار العملية كاملة) وبلا كشف تفاصيل داخلية للعميل. */
      try {
      let data = {};
      try { data = body ? JSON.parse(body) : {}; } catch (e) {}
      const me = getUser(req);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      function json(obj, status) { res.writeHead(status || 200); res.end(JSON.stringify(obj)); }

      /* ── [Support 2026-09-18] بوت الدعم + واجهة صفحة الدعم (ربط/تذاكر/أدمنز) ── */
      if (sup.isSupportPath(pathname)) { sup.handleHttp(req, res, pathname, body, parsedUrl); return; }

      /* ── [Financials 2026-09-28] ويب هوك بوت المالية (سوپر أدمن حصراً) — سرّه: FINANCIALS_WEBHOOK_SECRET ── */
      if (fin.isFinancialsPath(pathname)) { fin.handleHttp(req, res, pathname, body, parsedUrl); return; }

      /* ── [Private Chat 2026-09-22] بوت المحادثة الخاصة + رابط الربط القصير ── */
      if (privateChat.isPrivatePath(pathname)) { privateChat.handleHttp(req, res, pathname, body, parsedUrl); return; }

      /* ── [Payments] مسارات المحفظة تُدار بمنطق payments-core فوق القاعدة المحلية ── */
      if (pay.isPaymentsPath(pathname)) { pay.handlePayments(req, res, body, me); return; }

      /* ── [v2.40.5] نموذج «اتصل بنا» — كان يرسل إلى مسار غير موجود (405 من Pages)
         فيبقى الزر بلا نتيجة. يُخزَّن في contact_messages + إشعار تيليغرام إن توفّر. ── */
      if (pathname === '/api/contact' && req.method === 'POST') {
        try { db.exec("CREATE TABLE IF NOT EXISTS contact_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, name TEXT, email TEXT, subject TEXT, message TEXT, ip TEXT)"); } catch (e) {}
        const name = String(data.name || '').trim().slice(0, 60);
        const email = String(data.email || '').trim().slice(0, 120);
        const subject = String(data.subject || '').trim().slice(0, 120);
        const message = String(data.message || '').trim().slice(0, 4000);
        if (name.length < 2 || message.length < 5) { json({ ok: false, message: 'يرجى إكمال الاسم والنص' }, 400); return; }
        /* تحديد بسيط ضد الإغراق: 5 رسائل لكل IP في الساعة */
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
        let recent = 0;
        try { recent = db.prepare('SELECT COUNT(*) c FROM contact_messages WHERE ip = ? AND ts > ?').get(ip, Date.now() - 3600000).c; } catch (e) {}
        if (recent >= 5) { json({ ok: false, message: 'محاولات كثيرة — أعد المحاولة بعد قليل' }, 429); return; }
        try { db.prepare('INSERT INTO contact_messages (ts,name,email,subject,message,ip) VALUES (?,?,?,?,?,?)').run(Date.now(), name, email, subject, message, ip); } catch (e) {}
        const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_ADMIN_CHAT_ID;
        if (tok && chat) {
          fetch('https://api.telegram.org/bot' + tok + '/sendMessage', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: chat, text: '📩 رسالة من نموذج الاتصال\nالاسم: ' + name + '\nالبريد: ' + email + '\nالموضوع: ' + subject + '\n\n' + message.slice(0, 1500) })
          }).catch(function () {});
        }
        json({ ok: true });
        return;
      }

      /* ── [v2.40.5] استعراض رسائل الاتصال (أدمن) ── */
      if (pathname === '/api/admin/contact-messages') {
        if (!isAdmin(getUser(req))) { json({ ok: false, message: 'غير مصرح' }, 403); return; }
        let rows = [];
        try { rows = db.prepare('SELECT id, ts, name, email, subject, message FROM contact_messages ORDER BY id DESC LIMIT 200').all(); } catch (e) {}
        json({ ok: true, messages: rows });
        return;
      }

      /* ── [Deploy] manifest مُجزأ لصفحة الرفع — DEPLOY_MANIFEST=1 ── */
      if (pathname === '/api/deploy/manifest') { pay.serveManifest(req, res, parsedUrl); return; }

      /* ── [Payments 2026-09-16] شحن ذهب داخلي يستدعيه ووركر المدفوعات (dstg.pages.dev)
         عند اكتمال إيداع — محمي بسر مشترك من env فقط، لا جلسة ولا كوكيز. ── */
      if (pathname === '/api/internal/wallet-credit') {
        const sec = process.env.PAYMENTS_SHARED_SECRET;
        if (!sec || req.headers['x-pay-secret'] !== sec) { json({ ok: false, error: 'forbidden' }, 403); return; }
        const uidv = String(data.user_id || '');
        const usd = Number(data.usd);
        const rate = Number(process.env.USD_GOLD_RATE || 100);
        const u = users[uidv] || Object.values(users).find(function (x) { return String(x.id) === uidv; });
        if (!u || !(usd > 0)) { json({ ok: false, error: 'bad-input' }, 400); return; }
        const gold = Math.round(usd * rate);
        u.gold = (u.gold || 0) + gold;
        try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
        /* [v2.43] إعلام المستخدم فوراً بالرصيد الجديد */
        pushWallet(u.id, { delta: gold, message: '✅ تم شحن رصيدك: +' + gold + ' 🪙' });
        json({ ok: true, gold_added: gold, new_gold: u.gold });
        return;
      }

      /* ── المصادقة ── */
      if (pathname === '/api/me') {
        /* [أزيلت نهائياً] لا حقول مكافأة بعد الآن — عجلة الحظ محذوفة من المنصة */
        json({ ok: true, user: publicUser(me) });
        return;
      }
      if (pathname === '/api/login') {
        const username = String((data && data.username) || '').trim();
        const password = String((data && data.password) || '');
        const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

        /* [DTSG-006] فحص معدل المحاولات ضد هجمات التخمين */
        const rl = checkLoginRateLimit(clientIp, username);
        if (!rl.allowed) {
          json({ ok: false, message: 'محاولات دخول كثيرة خاطئة — يرجى الانتظار دقيقة قبل المحاولة مجدداً', retry_after: rl.retryAfter }, 429);
          return;
        }

        const existing = Object.values(users).find(function (u) { return u.username.toLowerCase() === username.toLowerCase(); });
        /* [v2.67·H1 + DTSG-007] التحقق غير المحجِب لحدثة الأحداث + زمن موحّد لوجود
           الاسم وغيابه (scrypt وهمي بنفس الكلفة عند الاسم غير الموجود) — رسالة 401
           الموحّدة نفسها. الهجوم بالتخمين لم يعد يوقف بقية المنصة. */
        const saltFor = existing ? existing.passSalt : DUMMY_SCRYPT_SALT;
        const hashFor = existing ? existing.passHash : '00'.repeat(64);
        verifyPasswordAsync(password, saltFor, hashFor).then(function (okPass) {
          if (!existing || (existing.passHash && !okPass)) {
            recordFailedLogin(clientIp, username);
            json({ ok: false, message: 'بيانات الدخول غير صحيحة — اسم المستخدم أو كلمة المرور خاطئة' }, 401);
            return;
          }
          if (existing.banned) { json({ ok: false, message: 'تم حظر هذا الحساب' }, 403); return; }

          /* [2FA v2.58] إذا كانت المصادقة الثنائية مفعّلة يلزم رمز TOTP صالح قبل إصدار الجلسة.
             يُصدَر رمز مؤقت (two_fa_token) مقيد بالهوية — يثبّت أن كلمة المرور فُحصت هنا الآن. */
          if (existing.twofaEnabled) {
            if (!data.totp || !totpVerify(existing.totpSecret, data.totp)) {
              const tk = issuePending2fa(existing.id, clientIp);
              json({ twofa_required: true, userId: existing.id, two_fa_token: tk });
              return;
            }
          }
          clearFailedLogin(clientIp, username);
          clearUserLoginFails(username);   /* [v2.80·أمن] نجاح الدخول يصفّي القفل الإسمي أيضاً */
          try { db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), existing.id); } catch (e) {}
          existing.last_seen = Math.floor(Date.now() / 1000);
          startSession(res, existing);
          json({ ok: true, user: publicUser(existing) });
        });
        return;
      }
      if (pathname === '/api/admin/register') {
        /* [Auth] إنشاء حساب لاعب من طرف المشرف (super/admin) — يبدأ بدون جلسة */
        if (!me || (me.role !== 'admin' && me.role !== 'super')) {
          json({ ok: false, message: 'صلاحية غير كافية: إنشاء الحسابات متاح للمشرفين فقط' }, 403); return;
        }
        const username = (data.username || '').toString().trim();
        const password = (data.password || '').toString();
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
          json({ ok: false, message: 'اسم المستخدم غير صالح (3-20 حرفاً: حروف/أرقام/_)' }, 400); return;
        }
        if (password.length < 6) { json({ ok: false, message: 'كلمة المرور 6 أحرف على الأقل' }, 400); return; }
        if (Object.values(users).some(function (x) { return x.username === username; })) {
          json({ ok: false, message: 'اسم المستخدم محجوز' }, 400); return;
        }
        const { salt, hash } = hashPassword(password, null);
        const u = { username: username, passHash: hash, passSalt: salt, role: 'user', gold: 0, lang: 'ar', banned: false, admin_id: me.id };
        persistUser(u);
        /* [Referral] رمز إحالة مميز للمسجّل الجديد + ربط اختياري برمز المحيل
           (الأدمن يسأل العميل الجديد عن رمز الإحالة ويدخله ليستفيد صاحبه من هديته) */
        u.ref_code = genRefCode(u.id);
        if (data.referral_code) {
          const rc = String(data.referral_code).trim().toUpperCase();
          const ref = Object.values(users).find(function (x) { return x.ref_code === rc; });
          if (!ref) { json({ ok: false, message: 'رمز الإحالة غير صالح' }, 400); return; }
          if (ref.id !== u.id) u.referred_by = ref.id;
        }
        try { db.prepare('UPDATE users SET ref_code = ?, referred_by = ?, admin_id = ? WHERE id = ?').run(u.ref_code, u.referred_by || null, me.id, u.id); } catch (e) {}
        json({ ok: true, user: publicUser(u) });
        return;
      }
      if (pathname === '/api/register') {
        /* [Auth] إنشاء الحسابات مخصّص للمشرفين فقط (super/admin) — لا تسجيل ذاتي من نافذة الدخول.
           استثناء واحد مقصود: عند تشغيل الخادم محلياً بإشارة DM_TEST_MODE=1 (بيئة الاختبارات E2E
           فقط، لا تُفعَّل أبداً في الإنتاج) يُسمح بالتسجيل الذاتي لأن اختبارات المتصفح (34 ملفاً)
           تُنشئ مستخدمين مؤقتين عبر /api/register. الإنتاج يبقى مقفلاً كما هو. */
        const REGISTER_TEST_MODE = process.env.DM_TEST_MODE === '1';
        if (!REGISTER_TEST_MODE && (!me || (me.role !== 'admin' && me.role !== 'super'))) {
          json({ ok: false, message: 'صلاحية غير كافية: إنشاء الحسابات متاح للمشرفين فقط' }, 403); return;
        }
        const username = (data.username || '').toString().trim();
        const password = (data.password || '').toString();
        /* [v2.80·أمن — إغلاق تصعيد الصلاحيات] كانت data.role تُقبل من أي أدمن:
           admin يصنع حساب super (تصعيد كامل) — وdata.gold كانت تُصنع أرصدة
           بلا سقف وبلا سجل معاملات (منشأ مال من الفراغ خارج مسار الشحن).
           الآن: إدارة الأدوار المرتفعة والرصيد الابتدائي حكر على super حصراً،
           وأي نداء آخر يُفرض فيه role='user' وgold=0. وإن مُنح رصيد من سوبر
           فإنه يُسجّل صف deposit مدقق (لا مال بلا أثر في السجل). */
        const isSuperCaller = !!(me && me.role === 'super');
        const role = (isSuperCaller && (data.role === 'admin' || data.role === 'super' || data.role === 'user')) ? data.role : 'user';
        if (!isSuperCaller && data.role && data.role !== 'user') {
          json({ ok: false, message: 'إنشاء حسابات مشرفة متاح للسوبر أدمن حصراً' }, 403); return;
        }
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
          json({ ok: false, message: 'اسم المستخدم غير صالح (3-20 حرفاً: حروف/أرقام/_)' }, 400); return;
        }
        if (password.length < 6) { json({ ok: false, message: 'كلمة المرور 6 أحرف على الأقل' }, 400); return; }
        if (Object.values(users).some(function (x) { return x.username === username; })) {
          json({ ok: false, message: 'اسم المستخدم محجوز' }, 400); return;
        }
        const { salt, hash } = hashPassword(password, null);
        /* [DM_TEST_MODE] بيئة الاختبار المحلية: المستخدم الجديد يبدأ برصيد وافر (100k)
           لأن إنشاء الغرف يتطلب رهاناً إلزامياً + رسم افتتاح (100)، والاختبارات تنشئ غرفاً
           بمستخدمين جدد رصيدهم 0. الإنتاج: الرصيد الافتراضي كما يحدده المسؤول (غالباً 0). */
        /* [v2.80·أمن] والرصيد الافتتاحي الصريح (data.gold) سوبر حصراً — في الإنتاج
           وفي الاختبار على السواء (البذر الذاتي للاختبار لا يمر من هنا: data.gold==null) */
        let startGold = 0;
        if (REGISTER_TEST_MODE && data.gold == null) startGold = 100000;
        else if (isSuperCaller && data.gold != null) {
          startGold = Math.floor(Number(data.gold));
          if (!Number.isFinite(startGold) || startGold < 0) startGold = 0;
        }
        const u = { username: username, passHash: hash, passSalt: salt, role: role, gold: startGold, lang: 'ar', banned: false };
        persistUser(u);
        if (startGold > 0) {
          /* [v2.80·أمن] لا مال من الفراغ: الرصيد الابتدائي الممنوح من سوبر يُسجّل
           صف deposit في السجل المالي الموحّد (نفس مسار شحن الداشبورد) */
          try { logTx(u, 'deposit', startGold, { game_id: 'admin', note: 'رصيد افتتاحي عند إنشاء الحساب (سوبر أدمن)', balance_after: u.gold }); } catch (e) {}
        }
        /* [DM_TEST_MODE] في بيئة الاختبار المحلية فقط: التسجيل المفتوح يفتح جلسة تلقائياً
           (محاكاة سلوك بيئة التطوير القديمة الذي تفترضه اختبارات E2E الـ34 — «سجّل = ادخل»).
           الإنتاج: لا يفتح التسجيل جلسة أبداً (يبقى إنشاء المشرف فقط). */
        if (REGISTER_TEST_MODE) startSession(res, u);
        /* [Referral] رمز إحالة مميز لكل مسجّل + ربط اختياري برمز محيل */
        u.ref_code = genRefCode(u.id);
        if (data.referral_code) {
          const rc = String(data.referral_code).trim().toUpperCase();
          const ref = Object.values(users).find(function (x) { return x.ref_code === rc; });
          if (ref && ref.id !== u.id) u.referred_by = ref.id;
        }
        try { db.prepare('UPDATE users SET ref_code = ?, referred_by = ? WHERE id = ?').run(u.ref_code, u.referred_by || null, u.id); } catch (e) {}
        json({ ok: true, user: publicUser(u) });
        return;
      }
      if (pathname === '/api/logout') {
        const sid = parseCookies(req).sid;
        if (sid) delete sessions[sid];
        res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0; SameSite=None; Secure');
        json({ ok: true });
        return;
      }
      if (pathname === '/api/sync') {
        if (!me) { json({ ok: false, message: 'غير مسجّل' }, 401); return; }
        /* [DTSG-001 SEC] الخادم هو السلطة الوحيدة للرصيد — لا قبول لأي رصيد يرسله العميل */
        if (data.lang && typeof data.lang === 'string') {
          me.lang = data.lang.slice(0, 10);
          try { db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(me.lang, me.id); } catch (e) {}
        }
        json({ ok: true, gold: me.gold, gold_rev: getGoldRev(me), server_side: true });
        return;
      }
      if (pathname === '/api/change-password') {
        if (!me) { json({ ok: false, message: 'غير مسجّل' }, 401); return; }
        if (me.passHash && !verifyPassword(data.oldPassword || '', me.passSalt, me.passHash)) { json({ ok: false, message: 'كلمة المرور القديمة خاطئة' }, 400); return; }
        const { salt, hash } = hashPassword(data.newPassword || '', null);
        me.passHash = hash; me.passSalt = salt;
        try { db.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').run(hash, salt, me.id); } catch (e) {}
        json({ ok: true, message: 'تم تغيير كلمة المرور' });
        return;
      }
      /* ── [2FA v2.58] المصادقة الثنائية ── */
      if (pathname === '/api/2fa/login') {
        /* إكمال الدخول بعد إدخال رمز TOTP (two_fa_token + userId + code)
           [SEC 2026-09-23] الرمز المؤقت يُصدَر فقط بعد فحص كلمة مرور ناجح ⇒
           إغلاق الثغرة: النسخة السابقة كانت تُصدر جلسة كاملة (حتى للسوبر أدمن)
           لأي userId بلا كلمة مرور ولا رمز عندما تكون 2FA معطّلة. */
        const ip2fa = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
        if (data.userId != null && twofaLocked(ip2fa, data.userId)) {
          json({ ok: false, message: 'محاولات رمز كثيرة — انتظر قبل المحاولة مجدداً' }, 429);
          return;
        }
        const user = (data.userId != null) ? users[data.userId] : null;
        if (!user) { json({ ok: false, message: 'المستخدم غير موجود' }, 401); return; }
        const pending = consumePending2fa(data.two_fa_token, user.id);
        if (!pending) { json({ ok: false, message: 'رمز الإكمال غير صالح أو منتهٍ — سجّل الدخول من جديد' }, 401); return; }
        if (user.twofaEnabled) {
          if (!totpVerify(user.totpSecret, data.code)) {
            const locked = twofaFail(ip2fa, user.id);
            json({ ok: false, message: locked ? 'خمسة أخطاء — قُفل الإدخال لمدة 15 دقيقة' : 'رمز التحقق غير صحيح' }, locked ? 429 : 401);
            return;
          }
        }
        try { db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), user.id); } catch (e) {}
        user.last_seen = Math.floor(Date.now() / 1000);
        startSession(res, user);
        json({ ok: true, user: publicUser(user) });
        return;
      }
      if (pathname === '/api/2fa/enable') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const secret = totpSecret();
        me.totpSecret = secret;
        try { db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, me.id); } catch (e) {}
        const otpauth = 'otpauth://totp/DTSG:' + me.username + '?secret=' + secret + '&issuer=DTSG&algorithm=SHA1&digits=6&period=30';
        json({ ok: true, secret: secret, otpauth: otpauth });
        return;
      }
      if (pathname === '/api/2fa/verify') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        if (!totpVerify(me.totpSecret, data.code)) { json({ ok: false, error: 'رمز التحقق غير صحيح' }, 400); return; }
        me.twofaEnabled = 1;
        try { db.prepare('UPDATE users SET totp_secret = ?, twofa_enabled = ? WHERE id = ?').run(me.totpSecret, 1, me.id); } catch (e) {}
        json({ ok: true });
        return;
      }
      if (pathname === '/api/2fa/disable') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        if (me.passHash && !verifyPassword(data.password || '', me.passSalt, me.passHash)) { json({ ok: false, message: 'كلمة المرور غير صحيحة' }, 401); return; }
        me.twofaEnabled = 0; me.totpSecret = null;
        try { db.prepare('UPDATE users SET totp_secret = ?, twofa_enabled = ? WHERE id = ?').run(null, 0, me.id); } catch (e) {}
        json({ ok: true });
        return;
      }
      if (pathname === '/api/transfer') {
        const amt = r2(Number(data.amount));
        if (!me || !data.to || isNaN(amt) || amt < 0.01) { json({ ok: false, message: 'المبلغ غير صالح' }, 400); return; }
        /* [server-tx] المستلم مستخدم حقيقي بالاسم — لا تحويل لأسماء وهمية */
        const toName = String(data.to).trim();
        const toUser = Object.values(users).find(function (u) { return u.username === toName; });
        if (!toUser) { json({ ok: false, message: 'المستخدم غير موجود' }, 404); return; }
        if (toUser.id === me.id) { json({ ok: false, message: 'لا يمكنك التحويل لنفسك' }, 400); return; }
        if ((me.gold || 0) < amt) { json({ ok: false, message: 'رصيدك غير كافٍ' }, 400); return; }
        me.gold = me.gold - amt;
        toUser.gold = (toUser.gold || 0) + amt;
        try {
          db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(me.gold, me.id);
          db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(toUser.gold, toUser.id);
        } catch (e) {}
        logTx(me, 'transfer_out', amt, { counterparty_id: toUser.id, counterparty_name: toUser.username, balance_after: me.gold });
        logTx(toUser, 'transfer_in', amt, { counterparty_id: me.id, counterparty_name: me.username, balance_after: toUser.gold });
        json({ ok: true, amount: amt, to: toName, gold: me.gold });
        return;
      }
      if (pathname === '/api/transfers') {
        /* [server-tx] سجل معاملات المستخدم الحالي من جدول transactions
           [v2.79·خلل المالك «مبلغ الرهان يسجَّل خطأً في سجل إرسال الكوين الوارد»]
           الافتراضي حصراً حركات الكوين الفعلية بين الحسابات (تحويلات + شحن/سحب
           أدمن + مكافآت) — أما صفوف لعبة الغرف (bet اقتطاع البدء · win التسوية ·
           refund الاسترداد) فموضعها سجل المراهنات (bet_tickets عبر /api/rounds)
           الذي يسجّلها صحيحاً، وكانت تُدرَج هنا فيظهر مبلغ الرهان لكل جولة رابحة
           أو خاسرة كإرسالٍ وارد مخادع (الواجهة تصنّف bet صادراً لكنها كانت تصنّفه
           وارداً لعدم معرفته). ?types=all يعيد كل الأنواع لفحوص عقد المال
           (تظل تقرأ الجدول نفسه فلا يضعف التحقق). */
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const rows = db.prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100").all(me.id);
        const TX_USER = ['transfer_out', 'transfer_in', 'charge', 'deduct', 'set_balance', 'referral_bonus', 'claim'];
        const TX_GAME = ['bet', 'win', 'refund'];
        const allTypes = String((req.url && (url.parse(req.url, true).query || {}).types) || '') === 'all';
        const TX_TYPES = allTypes ? TX_USER.concat(TX_GAME) : TX_USER;
        json({
          ok: true,
          transfers: rows.filter(function (t) { return TX_TYPES.indexOf(t.type) !== -1; }).map(function (t) {
            let from_id = null, from_name = null, to_name = null;
            if (t.type === 'transfer_out') {
              from_id = me.id; from_name = me.username; to_name = t.counterparty_name;
            } else if (t.type === 'transfer_in') {
              from_id = t.counterparty_id; from_name = t.counterparty_name; to_name = me.username;
            } else if (t.type === 'charge') {
              from_name = t.actor_name; to_name = me.username;
            } else if (t.type === 'deduct') {
              from_name = me.username; to_name = t.actor_name;
            } else if (t.type === 'set_balance') {
              from_name = t.actor_name; to_name = me.username;
            } else if (t.type === 'referral_bonus') {
              from_name = t.counterparty_name; to_name = me.username;
            } else if (t.type === 'claim') {
              from_name = 'العجلة'; to_name = me.username;
            } else if (t.type === 'win') {
              from_id = t.counterparty_id; from_name = t.counterparty_name || 'المنصة'; to_name = me.username;
            } else if (t.type === 'bet') {
              from_id = me.id; from_name = me.username; to_name = t.counterparty_name || 'المنصة';
            } else if (t.type === 'refund') {
              from_name = (t.game_id ? ('غرفة ' + t.game_id) : '') || t.note || 'المنصة'; to_name = me.username;
            }
            return {
              id: t.id, type: t.type,
              from_id: from_id, from_name: from_name, to_name: to_name,
              amount: t.amount, balance_after: t.balance_after,
              note: t.note, created_at: t.created_at
            };
          })
        });
        return;
      }

      /* ── [Friends] الأصدقاء والرسائل الخاصة ── */
      if (pathname === '/api/friends/add' && req.method === 'POST') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const uname0 = String(data.username || '').trim();
        const target = Object.values(users).find(function (u) { return u.username === uname0 || String(u.id) === uname0; });
        if (!target) { json({ ok: false, message: 'المستخدم غير موجود' }, 404); return; }
        if (target.id === me.id) { json({ ok: false, message: 'لا يمكنك إضافة نفسك' }, 400); return; }
        try {
          /* [إصلاح 2026-09-16] إن كان الطرف الآخر طلبني مسبقاً (pending عكسي) → قبول متبادل فوري */
          const reverse = db.prepare('SELECT user_id FROM friends WHERE user_id = ? AND friend_id = ? AND status = ?').get(target.id, me.id, 'pending');
          if (reverse) {
            db.prepare("UPDATE friends SET status='accepted' WHERE user_id = ? AND friend_id = ?").run(target.id, me.id);
            db.prepare('INSERT OR REPLACE INTO friends (user_id, friend_id, status, created_at) VALUES (?,?,?,?)').run(me.id, target.id, 'accepted', Date.now());
          } else {
            db.prepare('INSERT OR REPLACE INTO friends (user_id, friend_id, status, created_at) VALUES (?,?,?,?)').run(me.id, target.id, 'pending', Date.now());
          }
        } catch (e) {}
        json({ ok: true });
        return;
      }
      if (pathname === '/api/friends/accept' && req.method === 'POST') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const fid = Number(data.friendUserId);
        if (isNaN(fid)) { json({ ok: false, message: 'معرّف غير صالح' }, 400); return; }
        try {
          /* [إصلاح 2026-09-16] صف الطلب يوجد باتجاه واحد (المرسل→المستقبل)؛
             القبول يحدّثه ويُنشئ الصف العكسي accepted ليظهر الصديق لدى الطرفين */
          db.prepare("UPDATE friends SET status='accepted' WHERE user_id = ? AND friend_id = ?").run(fid, me.id);
          db.prepare("UPDATE friends SET status='accepted' WHERE user_id = ? AND friend_id = ?").run(me.id, fid);
          db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?,?,?,?)').run(me.id, fid, 'accepted', Date.now());
        } catch (e) {}
        json({ ok: true });
        return;
      }
      if (pathname === '/api/friends/remove' && req.method === 'POST') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const fid = Number(data.friendUserId);
        if (isNaN(fid)) { json({ ok: false, message: 'معرّف غير صالح' }, 400); return; }
        try {
          db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(me.id, fid);
          db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(fid, me.id);
        } catch (e) {}
        json({ ok: true });
        return;
      }
      if (pathname === '/api/friends' && req.method === 'GET') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const uname = function (id) { const u = users[id]; return u ? u.username : ('user' + id); };
        const accepted = db.prepare('SELECT friend_id FROM friends WHERE user_id = ? AND status = ?').all(me.id, 'accepted');
        const incoming = db.prepare('SELECT user_id FROM friends WHERE friend_id = ? AND status = ?').all(me.id, 'pending');
        const outgoing = db.prepare('SELECT friend_id FROM friends WHERE user_id = ? AND status = ?').all(me.id, 'pending');
        json({
          ok: true,
          friends: accepted.map(function (r) { return { id: r.friend_id, username: uname(r.friend_id), status: 'accepted' }; }),
          incoming: incoming.map(function (r) { return { id: r.user_id, username: uname(r.user_id) }; }),
          outgoing: outgoing.map(function (r) { return { id: r.friend_id, username: uname(r.friend_id) }; })
        });
        return;
      }
      if (pathname === '/api/messages' && req.method === 'POST') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        let receiverId;
        const to = data.to;
        if (to != null && /^\d+$/.test(String(to))) {
          receiverId = Number(to);
          if (!users[receiverId]) { json({ ok: false, message: 'المستخدم غير موجود' }, 404); return; }
        } else {
          const target = Object.values(users).find(function (u) { return u.username === String(to || ''); });
          if (!target) { json({ ok: false, message: 'المستخدم غير موجود' }, 404); return; }
          receiverId = target.id;
        }
        const text = String(data.text || '').slice(0, 4000);
        if (!text) { json({ ok: false, message: 'الرسالة فارغة' }, 400); return; }
        const now = Date.now();
        const roomCode = data.room_code || null;
        let msg;
        try {
          const info = db.prepare('INSERT INTO messages (sender_id, receiver_id, text, room_code, created_at) VALUES (?,?,?,?,?)').run(me.id, receiverId, text, roomCode, now);
          msg = { id: Number(info.lastInsertRowid), sender_id: me.id, receiver_id: receiverId, text: text, room_code: roomCode, created_at: now };
        } catch (e) { json({ ok: false, message: 'تعذّر إرسال الرسالة' }, 500); return; }
        sendToUser(me.id, 'dm', msg);
        sendToUser(receiverId, 'dm', msg);
        json({ ok: true, message: msg });
        return;
      }
      if (pathname === '/api/messages' && req.method === 'GET') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const otherId = Number(parsedUrl.query.with);
        if (isNaN(otherId)) { json({ ok: false, message: 'مطلوب معرّف المستخدم' }, 400); return; }
        const since = Date.now() - 24 * 3600 * 1000;
        const msgs = db.prepare('SELECT id, sender_id, receiver_id, text, room_code, created_at FROM messages WHERE created_at >= ? AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) ORDER BY created_at ASC')
          .all(since, me.id, otherId, otherId, me.id);
        json({ ok: true, messages: msgs });
        return;
      }
      if (pathname === '/api/messages/inbox' && req.method === 'GET') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const since = Date.now() - 24 * 3600 * 1000;
        const rows = db.prepare('SELECT id, sender_id, receiver_id, text, created_at FROM messages WHERE created_at >= ? AND (sender_id = ? OR receiver_id = ?) ORDER BY created_at ASC').all(since, me.id, me.id);
        const map = {};
        let totalUnread = 0;
        rows.forEach(function (m) {
          const other = (m.sender_id === me.id) ? m.receiver_id : m.sender_id;
          if (!map[other]) map[other] = { lastText: m.text, at: m.created_at, unread: 0 };
          else { map[other].lastText = m.text; map[other].at = m.created_at; }
          if (m.receiver_id === me.id) { map[other].unread += 1; totalUnread += 1; }
        });
        const conversations = Object.keys(map).map(function (k) {
          const o = map[k];
          const u = users[k];
          return { with: Number(k), username: u ? u.username : ('user' + k), lastText: o.lastText, unread: o.unread, at: o.at };
        });
        json({ ok: true, conversations: conversations, unread: totalUnread });
        return;
      }
      /* ── مراسلة المشرفين (admin ⇄ super) ── */
      if (pathname === '/api/admin/messages' && req.method === 'GET') {
        /* للأدمن والسوبر فقط — قناة تنسيق مخصّصة */
        if (!me || (me.role !== 'admin' && me.role !== 'super')) { json({ ok: false, message: 'غير مصرّح' }, 403); return; }
        const since = Date.now() - 7 * 24 * 3600 * 1000;
        const msgs = db.prepare('SELECT id, sender_id, text, created_at FROM admin_messages WHERE created_at >= ? ORDER BY created_at ASC').all(since);
        json({ ok: true, messages: msgs.map(function (m) { const u = users[m.sender_id]; return { id: m.id, sender_id: m.sender_id, sender_name: u ? u.username : ('user' + m.sender_id), text: m.text, created_at: m.created_at }; }) });
        return;
      }
      if (pathname === '/api/admin/messages' && req.method === 'POST') {
        if (!me || (me.role !== 'admin' && me.role !== 'super')) { json({ ok: false, message: 'غير مصرّح' }, 403); return; }
        const text = String(data.text || '').slice(0, 4000);
        if (!text) { json({ ok: false, message: 'الرسالة فارغة' }, 400); return; }
        const now = Date.now();
        let msg;
        try {
          const info = db.prepare('INSERT INTO admin_messages (sender_id, text, created_at) VALUES (?,?,?)').run(me.id, text, now);
          msg = { id: Number(info.lastInsertRowid), sender_id: me.id, sender_name: me.username, text: text, created_at: now };
        } catch (e) { json({ ok: false, message: 'تعذّر إرسال الرسالة' }, 500); return; }
        /* بثّ لكل المشرفين المتصلين */
        Object.keys(users).forEach(function (uid) {
          const u = users[uid];
          if (u && (u.role === 'admin' || u.role === 'super')) sendToUser(Number(uid), 'admin_msg', msg);
        });
        json({ ok: true, message: msg });
        return;
      }
      if (pathname === '/api/claim') {
        /* [أزيلت نهائياً] عجلة الحظ اليومية وال مكافأة المجانية — بقرار المستخدم.
           المسار يرد 410 Gone حتى لا تظهر رسالة خطأ مبهمة لأي عميل قديم. */
        json({ ok: false, error: 'removed', message: 'المكافأة اليومية أُزيلت نهائياً' }, 410);
        return;
      }
      /* [Promotions 2026-09-22] مصدر واحد لبطاقات العروض والشريط الإشهاري.
         لا يحتوي أي بيانات مستخدم، ويمكن تغييره لاحقاً من إعدادات المنصة.
         [v2.73·مال] news: رسالة إخبارية/إشهارية يكتبها السوبر أدمن من بوت
         المالية (/news) — تُخزَّن في meta (platform_news) وتظهر في الشريط. */
      if (pathname === '/api/promotions' && req.method === 'GET') {
        let news = null;
        try {
          const row = db.prepare("SELECT value FROM meta WHERE key = 'platform_news'").get();
          if (row && row.value) {
            const nj = JSON.parse(row.value);
            if (nj && nj.text && String(nj.text).trim()) {
              news = { text: String(nj.text).trim().slice(0, 200), at: Number(nj.at) || null };
            }
          }
        } catch (e) {}
        json({
          ok: true,
          updated_at: new Date().toISOString().slice(0, 10),
          news: news,
          /* المبالغ الأساسية بالدولار؛ التحويل ثابت: 1 USD = 10 MAD = 100 COIN. */
          currency: 'USD',
          rates: { usd_to_mad: 10, usd_to_coins: 100 },
          direct: [{ amount: 10, bonus_pct: 0 }, { amount: 100, bonus_pct: 5 }, { amount: 1000, bonus_pct: 10 }, { amount: 10000, bonus_pct: 15 }],
          admin: [{ amount: 1000, bonus_pct: 30 }, { amount: 10000, bonus_pct: 35 }, { amount: 100000, bonus_pct: 40 }],
          referral_pct: 10
        });
        return;
      }
      /* [Privacy 2026-09-22] أُزيلت القناة العامة. المحادثات الخاصة تمر عبر
         بوت تيليغرام المرتبط بالحساب أو عبر غرف اللعب فقط. */
      if (pathname === '/api/chat') {
        json({ ok: false, error: 'removed', message: 'الدردشة العامة أُزيلت — استعمل بوت DTSG الخاص.' }, 410);
        return;
      }
      /* [DTSG-019 / NEW-4 v2.58 ← v2.76·ترتيب حقيقي] المتصدرون من بيانات
         الرهان الفعلية: ترتيب لكل لعبة (?game=<id>) + ترتيب عام بمجموع
         الأرباح. الأرصدة الجارية خصوصية ولا تُكشف للعموم — المعروض
         حصرياً صافي أرباح اللعب (توجيه المالك 2026-10-02). */
      if (pathname === '/api/lb' || pathname === '/api/leaderboard') {
        const game = String((parsedUrl.query && parsedUrl.query.game) || '').slice(0, 16);
        /* تجاوز الكاش حصراً في بيئة الاختبارات (DM_TEST_MODE — نمط
           REGISTER_TEST_MODE نفسه): الأجنحة تزرع تذاكر ثم تقرأ فوراً؛
           في الإنتاج لا مسار تجاوز إطلاقاً فالكاش يحمي معالج الهاتف */
        const wantFresh = (process.env.DM_TEST_MODE === '1') && parsedUrl.query && String(parsedUrl.query.fresh || '') === '1';
        const data = lbCompute(!!wantFresh);
        const all = game ? (data.perGame[game] || []) : data.overall;
        const limit = game ? 20 : 50;
        const top = all.slice(0, limit).map(function (r, i) {
          return { rank: i + 1, username: r.username, profit: r.profit, rounds: r.rounds, wins: r.wins };
        });
        /* رتبة الطالب نفسه (إن سجل الدخول وله جولات مسجَّلة) */
        let meRow = null;
        if (me) {
          const idx = all.findIndex(function (r) { return r.uid === me.id; });
          if (idx >= 0) {
            const r = all[idx];
            meRow = { rank: idx + 1, username: r.username, profit: r.profit, rounds: r.rounds, wins: r.wins };
          }
        }
        json({ ok: true, scope: game || 'overall', leaderboard: top, games: data.games, me: meRow });
        return;
      }
      if (pathname === '/api/tournaments') {
        json({ ok: true, tournaments: [] });
        return;
      }
      if (pathname === '/api/games' || (pathname === '/api/admin/games' && req.method === 'GET')) { json({ ok: true, games: gameFlags }); return; }
      if (pathname === '/api/rounds' && req.method === 'POST') {
        /* [server-tx] تسجيل تذكرة رهان — للضيف قبول صامت بلا تسجيل
           [NEW-2 v2.58] القيم تُقبل أرقاماً خاماً صحيحة فقط (لا نصوص ولا كسور) */
        if (me) {
          const gid = String(data.game_id || '').slice(0, 64);
          const bet = validBetAmount(data.bet) ? data.bet : 0;
          const won = !!data.won;
          const payout = (typeof data.payout === 'number' && Number.isFinite(data.payout) && Number.isInteger(data.payout) && data.payout >= 0 && data.payout <= 100000000) ? data.payout : 0;
          logTicket(me.id, gid, bet, won, payout, data.result_txt);
        }
        json({ ok: true });
        return;
      }
      if (pathname === '/api/rounds' && req.method === 'GET') {
        /* [server-tx] آخر 100 تذكرة للمستخدم من كل الألعاب */
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const rows = db.prepare('SELECT game_id, bet, won, payout, result_txt, created_at FROM bet_tickets WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(me.id);
        json({ ok: true, rounds: rows });
        return;
      }

      /* [NEW-2 v2.58] مبلغ الرهان: رقم خام (typeof number) + عدد صحيح (الذهب بلا كسور)
         + حد أدنى 1. النسخة السابقة كانت تقبل النصوص ("10") والكسور (0.5/10.5)
         ⇒ ذهب كسري يتسرّب في رصيد المستخدم ويضطرب مع التسويات (Math.round). */
      function validBetAmount(v) {
        return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 1 && v <= 100000000;
      }
      /* [server-tx] سجل تذاكر المستخدم لهذه اللعبة تحديداً (لوحة التيكيتس داخل اللعبة) */
      let ghh;
      if ((ghh = /^\/api\/games\/([\w-]+)\/history$/.exec(pathname)) && req.method === 'GET') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const rows = db.prepare('SELECT game_id, bet, won, payout, result_txt, created_at FROM bet_tickets WHERE user_id = ? AND game_id = ? ORDER BY id DESC LIMIT 25').all(me.id, ghh[1]);
        const out = rows.map(function (r) {
          return { username: me.username, game_id: r.game_id, bet: r.bet, won: r.won, payout: r.payout, result_txt: r.result_txt, created_at: r.created_at };
        });
        json({ ok: true, rounds: out });
        return;
      }

      /* ═══════ API الإدارة — الأدوار والصلاحيات ═══════
         سوبر أدمن: كل الصلاحيات (تسجيل، مسح حساب، شحن/سحب مباشر،
                    الاطلاع على الأرصدة، تغيير كلمات المرور والبيانات،
                    تشغيل/توقيف الألعاب، الأدوار، الحظر، الإسكات).
         أدمن: صلاحيات محدودة —
           • تسجيل عميل جديد (مع رمز إحالة اختياري يقدمه العميل)
           • شحن حساب أي عميل مسجل بالمنصة (يتطلب رصيداً كافياً عند الأدمن)
           • استبدال كوينز العميل بمال حقيقي: لا سحب مباشر من حساب العميل —
             العميل يرسل الكوينز للأدمن عبر «إرسال الكوينز» بنفسه
           • إسكات لاعب عن التعليق الصوتي والمراسلة 24 ساعة أو أكثر */

      /* ── [v2.41.1] المعاملات المالية المعلّقة (واجهة المحفظة) + الموافقة/الرفض من اللوحة ── */
      /* [v2.44-MONEY] سجل المال: المستخدم يرى حركاته · الأدمن/السوبر يرى الكل */
      if (pathname === '/api/money/log' && req.method === 'GET') {
        if (!me) { json({ ok: false, message: 'غير مسجّل' }, 401); return; }
        const isAdm = (me.role === 'admin' || me.role === 'super');
        const wantAll = (me.role === 'super') && ((parsedUrl.query && parsedUrl.query.scope) === 'all');
        const limit = Math.min(300, Math.max(1, Number((parsedUrl.query && parsedUrl.query.limit) || 60)));
        let rows = [];
        try {
          rows = wantAll
            ? db.prepare('SELECT m.*, u.username FROM money_log m LEFT JOIN users u ON u.id = CAST(m.user_id AS INTEGER) ORDER BY m.id DESC LIMIT ?').all(limit)
            : db.prepare('SELECT * FROM money_log WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(String(me.id), limit);
        } catch (e) { rows = []; }
        json({ ok: true, scope: wantAll ? 'all' : 'self', is_admin: isAdm, log: rows.map(function (r) {
          return { id: r.id, user_id: r.user_id, username: r.username || null, kind: r.kind, usd: r.amount_usd,
            coins: r.coins, status: r.status, ref: r.ref, note: r.note, actor: r.actor,
            at: Math.floor((r.created_at || 0) / 1000) };
        }) });
        return;
      }
      if (pathname === '/api/admin/payments/pending') {
        if (!isAdmin(me)) { json({ ok: false, message: 'غير مصرح' }, 403); return; }
        json({ ok: true, pending: pay.listPending(60) });
        return;
      }
      if (pathname === '/api/admin/payments/act' && req.method === 'POST') {
        if (!isAdmin(me)) { json({ ok: false, message: 'غير مصرح' }, 403); return; }
        const txId = String((data && data.tx_id) || '');
        const action = String((data && data.action) || '');
        const pendingRow = pay.listPending(60).filter(function (x) { return String(x.id) === txId; })[0] || null;
        /* [v2.47-WD-OWNER] طلب السحب: المصادقة/التنفيذ لأدمن حساب المستخدم (users.admin_id)
           أو السوبر أدمن — تنفيذاً لطلب المالك: «يرسل الطلب للأدمن الذي سجّل حساب المستخدم». */
        if (pendingRow && String(pendingRow.type) === 'withdrawal' && !isSuper(me)) {
          const target = users[Number(pendingRow.user_id)] ||
            Object.values(users).find(function (u) { return String(u.id) === String(pendingRow.user_id); });
          if (!target || Number(target.admin_id || 0) !== Number(me.id)) {
            json({ ok: false, error: 'not-owner-admin', message: 'مصادقة السحب حكرٌ على أدمن حساب المستخدم أو السوبر أدمن' }, 403);
            return;
          }
        }
        pay.adminActOnPlatformTx(txId, action, me.username).then(function (r) {
          json(r && r.ok ? { ok: true, result: r } : { ok: false, error: (r && r.error) || 'failed' }, r && r.ok ? 200 : 400);
          if (pendingRow && r && r.ok) {
            try {
              sup.notifyUser(pendingRow.user_id, action === 'approve'
                ? ('✅ تم تنفيذ طلبك: ' + pendingRow.amount_usd + ' USD')
                : ('❌ رُفض طلبك (' + pendingRow.amount_usd + ' USD). للاستفسار أرسل رسالة هنا.'));
            } catch (e) {}
          }
        }).catch(function (e) { json({ ok: false, error: String(e && e.message || e) }, 500); });
        return;
      }

      if (pathname === '/api/admin/stats') {
        if (!isAdmin(me)) { json({ ok: false, message: 'غير مصرح' }, 403); return; }
        var supStats = null; try { supStats = sup.stats(); } catch (e) {}
        const all = Object.values(users);
        json({
          ok: true,
          users_total: all.length,
          active_today: all.filter(function (u) { return u.last_seen && (Date.now() / 1000 - u.last_seen) < 86400; }).length,
          plays_total: 0,
          gold_total: isSuper(me) ? all.reduce(function (s, u) { return s + (u.gold || 0); }, 0) : 0,
          coins_won_total: 0,
          support: supStats
        });
        return;
      }

      if (pathname === '/api/admin/users') {
        if (!isAdmin(me)) { json({ ok: false, message: 'غير مصرح' }, 403); return; }
        /* السوبر يرى الجميع؛ الأدمن يرى لاعبيه (من سجلهم) فقط */
        const list = Object.values(users)
          .filter(function (u) { return isSuper(me) ? true : (u.admin_id === me.id && u.role === 'user'); })
          .map(function (u) {
            return {
              id: u.id, username: u.username, gold: u.gold, role: u.role,
              ref_code: u.ref_code || null, referred_by: u.referred_by || null,
              admin_id: u.admin_id || null, banned: !!u.banned,
              muted_until: (u.muted_until && u.muted_until > Date.now()) ? u.muted_until : null,
              last_seen: u.last_seen || null, first_topup_done: !!u.first_topup_done
            };
          });
        json({ ok: true, users: list, my_gold: me.gold });
        return;
      }


      /* شحن/خصم/ضبط رصيد: /api/admin/user/:id/balance */
      let mm = pathname.match(/^\/api\/admin\/user\/(\d+)\/(balance|password|ban|role|delete|mute)$/);
      if (mm) {
        if (!isAdmin(me)) { json({ ok: false, message: 'غير مصرح' }, 403); return; }
        const target = users[parseInt(mm[1], 10)];
        if (!target) { json({ ok: false, message: 'المستخدم غير موجود' }, 404); return; }
        const op = mm[2];

        if (op === 'balance') {
          /* ضبط مباشر للرصيد: سوبر أدمن فقط */
          if (data.gold !== undefined) {
            if (!isSuper(me)) { json({ ok: false, message: 'سوبر أدمن فقط' }, 403); return; }
            const before = target.gold || 0;
            target.gold = Math.max(0, r2(Number(data.gold)) || 0);
            try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(target.gold, target.id); } catch (e) {}
            logTx(target, 'set_balance', target.gold, {
              actor_id: me.id, actor_name: me.username,
              counterparty_id: me.id, counterparty_name: me.username,
              note: 'من ' + before + ' إلى ' + target.gold,
              balance_after: target.gold
            });
            json({ ok: true, gold: target.gold });
            return;
          }
          const amt = r2(Number(data.amount));
          if (isNaN(amt) || amt < 0.01) { json({ ok: false, message: 'المبلغ غير صالح' }, 400); return; }
          if (data.action === 'charge') {
            /* الأدمن يشحن أي عميل مسجل بالمنصة (من طرفه أو من طرف أدمن آخر)
               بشرط رصيد كافٍ عنده؛ السوبر يشحن بلا قيد */
            if (!isSuper(me)) {
              if (target.role !== 'user') { json({ ok: false, message: 'يشحن حسابات العملاء فقط' }, 403); return; }
              if ((me.gold || 0) < amt) { json({ ok: false, message: 'رصيد الأدمن غير كافٍ' }, 400); return; }
              me.gold -= amt;
            }
            target.gold = (target.gold || 0) + amt;
            /* هدية الإحالة: 10% من أول عملية شحن تُمنح لصاحب رمز الإحالة */
            let refBonus = 0;
            if (!target.first_topup_done && target.referred_by && users[target.referred_by]) {
              refBonus = Math.floor(amt * 0.10);
              if (refBonus > 0) users[target.referred_by].gold = (users[target.referred_by].gold || 0) + refBonus;
            }
            target.first_topup_done = true;
            try {
              db.prepare('UPDATE users SET gold = ?, first_topup_done = 1 WHERE id = ?').run(target.gold, target.id);
              if (!isSuper(me)) db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(me.gold, me.id);
              if (refBonus > 0 && users[target.referred_by]) db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(users[target.referred_by].gold, target.referred_by);
            } catch (e) {}
            logTx(target, 'charge', amt, {
              actor_id: me.id, actor_name: me.username,
              counterparty_id: me.id, counterparty_name: me.username,
              balance_after: target.gold
            });
            if (refBonus > 0 && users[target.referred_by]) {
              logTx(users[target.referred_by], 'referral_bonus', refBonus, {
                counterparty_id: target.id, counterparty_name: target.username,
                balance_after: users[target.referred_by].gold
              });
            }
            json({ ok: true, gold: target.gold, admin_gold: me.gold, referral_bonus: refBonus });
            return;
          }
          if (data.action === 'deduct') {
            /* السحب المباشر من حساب العميل: سوبر أدمن فقط —
               الأدمن لا يسحب مباشرة؛ العميل يرسل له الكوينز عبر «إرسال الكوينز»
               لاستبدالها بمال حقيقي (والأدمن ملزم بالاحتفاظ بوصل الإرسال) */
            if (!isSuper(me)) { json({ ok: false, message: 'لا يمكن للأدمن السحب المباشر — استعمل استقبال تحويل من العميل' }, 403); return; }
            if ((target.gold || 0) < amt) { json({ ok: false, message: 'رصيد العميل غير كافٍ' }, 400); return; }
            target.gold -= amt;
            try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(target.gold, target.id); } catch (e) {}
            logTx(target, 'deduct', amt, {
              actor_id: me.id, actor_name: me.username,
              counterparty_id: me.id, counterparty_name: me.username,
              balance_after: target.gold
            });
            json({ ok: true, gold: target.gold });
            return;
          }
          json({ ok: false, message: 'عملية غير معروفة' }, 400);
          return;
        }

        if (op === 'password') {
          /* تغيير كلمة مرور العملاء: السوبر لأي حساب؛ الأدمن للاعبيه فقط */
          if (!isSuper(me) && !(target.role === 'user' && target.admin_id === me.id)) { json({ ok: false, message: 'غير مصرح' }, 403); return; }
          if (String(data.password || '').length < 6) { json({ ok: false, message: 'كلمة مرور قصيرة' }, 400); return; }
          const ph = hashPassword(String(data.password), null);
          target.passHash = ph.hash; target.passSalt = ph.salt;
          try { db.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').run(ph.hash, ph.salt, target.id); } catch (e) {}
          json({ ok: true });
          return;
        }

        if (op === 'ban') {
          if (!isSuper(me)) { json({ ok: false, message: 'سوبر أدمن فقط' }, 403); return; }
          target.banned = !!data.banned;
          try { db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(target.banned ? 1 : 0, target.id); } catch (e) {}
          json({ ok: true, banned: target.banned });
          return;
        }

        if (op === 'role') {
          if (!isSuper(me)) { json({ ok: false, message: 'سوبر أدمن فقط' }, 403); return; }
          if (target.id === me.id) { json({ ok: false, message: 'لا يمكنك تغيير دورك' }, 400); return; }
          if (['user', 'admin', 'super'].indexOf(data.role) === -1) { json({ ok: false, message: 'دور غير صالح' }, 400); return; }
          target.role = data.role;
          try { db.prepare('UPDATE users SET role = ? WHERE id = ?').run(target.role, target.id); } catch (e) {}
          json({ ok: true, role: target.role });
          return;
        }

        if (op === 'delete') {
          /* مسح حساب: سوبر أدمن فقط */
          if (!isSuper(me)) { json({ ok: false, message: 'سوبر أدمن فقط' }, 403); return; }
          if (target.id === me.id) { json({ ok: false, message: 'لا يمكنك مسح حسابك' }, 400); return; }
          /* [v2.45.1-FIX] كان الخطأ يُبتلع: مع foreign_keys=ON يفشل DELETE لوجود صفوف مالية مرتبطة،
             فيُعاد {ok:true} والحساب باقٍ في القاعدة (يعود بعد إعادة التشغيل). نُبلّغ الحقيقة،
             ونسمح بالمسح الصريح عبر force (يحذف معاملات المستخدم المالية أولاً داخل معاملة واحدة). */
          try {
            if (data.force) {
              db.exec('BEGIN');
              try {
                /* user_id في جداول المحفظة نصّي (TEXT) — الربط برقم لا يطابق شيئاً */
                db.prepare('DELETE FROM pay_transactions WHERE user_id = ?').run(String(target.id));
                db.prepare('DELETE FROM pay_vouchers WHERE used_by_user_id = ?').run(String(target.id));
              } catch (e2) { /* جدول غير موجود في نسخة قديمة */ }
              db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
              db.exec('COMMIT');
            } else {
              db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
            }
          } catch (e) {
            try { db.exec('ROLLBACK'); } catch (e2) {}
            json({ ok: false, message: 'تعذّر مسح الحساب: توجد سجلات مالية/كوبونات مرتبطة به. أعد المحاولة بـ force لحذف سجلاته المالية معه.', error: String((e && e.message) || '') }, 409);
            return;
          }
          delete users[target.id];
          Object.keys(sessions).forEach(function (sid) { if (sessions[sid] === target.id) delete sessions[sid]; });
          json({ ok: true });
          return;
        }

        if (op === 'mute') {
          /* توقيف عن التعليق الصوتي والمراسلة 24 ساعة أو أكثر (الأدمن والسوبر) */
          if (data.unmute) {
            if (!isSuper(me)) { json({ ok: false, message: 'رفع الإسكات: سوبر أدمن فقط' }, 403); return; }
            target.muted_until = 0;
            try { db.prepare('UPDATE users SET muted_until = 0 WHERE id = ?').run(target.id); } catch (e) {}
            json({ ok: true, muted_until: null });
            return;
          }
          const hours = Math.max(24, parseInt(data.hours, 10) || 24);   /* الحد الأدنى 24 ساعة حسب قواعد المنصة */
          target.muted_until = Date.now() + hours * 3600 * 1000;
          try { db.prepare('UPDATE users SET muted_until = ? WHERE id = ?').run(target.muted_until, target.id); } catch (e) {}
          json({ ok: true, muted_until: target.muted_until, hours: hours });
          return;
        }
      }

      /* تشغيل/توقيف الألعاب: سوبر أدمن فقط */
      mm = pathname.match(/^\/api\/admin\/games\/([\w-]+)\/toggle$/);
      if (mm) {
        if (!isSuper(me)) { json({ ok: false, message: 'سوبر أدمن فقط' }, 403); return; }
        gameFlags[mm[1]] = !!data.enabled;
        try { db.prepare('INSERT INTO game_flags (game_id, enabled) VALUES (?,?) ON CONFLICT(game_id) DO UPDATE SET enabled = excluded.enabled').run(mm[1], data.enabled ? 1 : 0); } catch (e) {}
        json({ ok: true, enabled: gameFlags[mm[1]] });
        return;
      }

      /* إعدادات المكافأة اليومية (تبويب المكافآت) — تحفظ في settings وتقرأ من هناك */
      if (pathname === '/api/admin/rewards' && req.method === 'GET') {
        if (!isAdmin(me)) { json({ ok: false, message: 'غير مصرح' }, 403); return; }
        let cfg = { amount: 100, interval_hours: 24 };
        try {
          const row = db.prepare("SELECT value FROM settings WHERE key = 'rewards'").get();
          if (row) cfg = Object.assign({}, cfg, JSON.parse(row.value));
        } catch (e) {}
        json({ ok: true, amount: cfg.amount, interval_hours: cfg.interval_hours });
        return;
      }
      if (pathname === '/api/admin/rewards' && req.method === 'POST') {
        if (!isSuper(me)) { json({ ok: false, message: 'سوبر أدمن فقط' }, 403); return; }
        const amount = Math.max(0, r2(Number(data.amount)));
        const interval_hours = Math.min(720, Math.max(1, parseInt(data.interval_hours, 10) || 24));
        if (isNaN(amount)) { json({ ok: false, message: 'قيمة غير صالحة' }, 400); return; }
        try {
          db.prepare("INSERT INTO settings (key, value) VALUES ('rewards', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .run(JSON.stringify({ amount: amount, interval_hours: interval_hours }));
        } catch (e) {}
        json({ ok: true, amount: amount, interval_hours: interval_hours });
        return;
      }

      /* إحصاءات مالية لكل لعبة (تبويب المالية) — من رهانات الجولات الجماعية */
      if (pathname === '/api/admin/stats/games') {
        if (!isAdmin(me)) { json({ ok: false, message: 'غير مصرح' }, 403); return; }
        let rows = [];
        try {
          rows = db.prepare('SELECT r.game_id AS game_id, COUNT(b.id) AS plays, SUM(CASE WHEN b.won = 1 THEN 1 ELSE 0 END) AS wins, COALESCE(SUM(CASE WHEN b.won = 1 THEN b.payout ELSE 0 END),0) AS coins_won FROM group_bets b JOIN group_rounds r ON r.id = b.round_id GROUP BY r.game_id').all();
        } catch (e) {}
        json({ ok: true, games: rows.map(function (g) { return { game_id: g.game_id, plays: g.plays || 0, wins: g.wins || 0, coins_won: g.coins_won || 0 }; }) });
        return;
      }

      /* [server-tx] سجل كل المعاملات المالية — سوبر أدمن فقط (مع فلترة اختيارية وترقيم) */
      if (pathname === '/api/admin/transactions' && req.method === 'GET') {
        if (!isSuper(me)) { json({ ok: false, message: 'سوبر أدمن فقط' }, 403); return; }
        /* [FIN-LOGS 2026-09-23] إصلاح «ثلاث خصائص لا تستجيب» (سجل الرهان/الفوز/السحب):
           الاستعلام كان يقرأ جدول transactions وحده، بينما رهانات وفوز الألعاب تعيش في
           bet_tickets (POST /api/rounds ← logTicket) وطلبات الشحن/السحب الحقيقية في
           pay_transactions (pay_*). الدمج الآن مصادر ثلاثة مرتّبة زمنياً تنازلياً:
           transactions (تحويل/شحن يدوي/خصم/ضبط/مكافآت + رهان وفوز جولات غرف الأونلاين)
           + bet_tickets (كل تذكرة = رهان، والرابحة تضيف فوزاً بقيمة payout)
           + pay_transactions (شحن/سحب بالدولار مع الحالة والطريقة). */
        const uidRaw = parsedUrl.query.user_id;
        const uid = (uidRaw != null && uidRaw !== '') ? parseInt(uidRaw, 10) : null;
        const type = parsedUrl.query.type ? String(parsedUrl.query.type) : '';
        const limit = Math.min(1000, Math.max(1, parseInt(parsedUrl.query.limit, 10) || 200));
        const offset = Math.max(0, parseInt(parsedUrl.query.offset, 10) || 0);
        const out = [];
        /* أ) معاملات الرصيد الكلاسيكية */
        if (type !== 'deposit' && type !== 'withdrawal') {
          const where = [];
          const params = [];
          if (uid) { where.push('t.user_id = ?'); params.push(uid); }
          if (type) { where.push('t.type = ?'); params.push(type); }
          /* [v2.71·بلا تكرار] صفا bet/win لجولة لها تذكرة لا يُعرضان: التذكرة
             تعرضهما سويّة (رهان الرابح وفوزه). كانا يظهران مرتين — خل reporting
             مُبلَّغ. الاستردادات (refund) لا تملكها التذكرة فتُعرض دائماً. */
          where.push("(t.type NOT IN ('bet','win') OR t.round_id IS NULL OR t.round_id NOT IN (SELECT round_id FROM bet_tickets WHERE round_id IS NOT NULL))");
          const whereSql = where.length ? (' WHERE ' + where.join(' AND ')) : '';
          try {
            const rowsTx = db.prepare(
              'SELECT t.id, t.user_id, u.username AS username, t.type, t.amount, t.balance_after, t.counterparty_name, t.actor_name, t.game_id, t.note, t.created_at ' +
              'FROM transactions t LEFT JOIN users u ON u.id = t.user_id' + whereSql +
              ' ORDER BY t.id DESC LIMIT 1000'
            ).all(...params);
            for (const r of rowsTx) out.push(r);
          } catch (e) {}
        }
        /* ب) تذاكر الرهان (bet_tickets): رهان + فوز */
        if (type === '' || type === 'bet' || type === 'win') {
          const where = [];
          const params = [];
          if (uid) { where.push('tk.user_id = ?'); params.push(uid); }
          const whereSql = where.length ? (' WHERE ' + where.join(' AND ')) : '';
          try {
            const rowsTk = db.prepare(
              'SELECT tk.id, tk.user_id, u.username AS username, tk.game_id, tk.bet, tk.won, tk.payout, tk.result_txt, tk.created_at ' +
              'FROM bet_tickets tk LEFT JOIN users u ON u.id = tk.user_id' + whereSql +
              ' ORDER BY tk.id DESC LIMIT 1000'
            ).all(...params);
            for (const tk of rowsTk) {
              const base = { user_id: tk.user_id, username: tk.username || null, balance_after: null, counterparty_name: null, actor_name: null, game_id: tk.game_id || null, created_at: tk.created_at, src: 'ticket' };
              if (type !== 'win') out.push(Object.assign({}, base, { id: 'tk' + tk.id, type: 'bet', amount: tk.bet, note: tk.result_txt || null }));
              if (tk.won && type !== 'bet') out.push(Object.assign({}, base, { id: 'tkw' + tk.id, type: 'win', amount: tk.payout, note: tk.result_txt || null }));
            }
          } catch (e) {}
        }
        /* ج) شحن/سحب حقيقي من المحفظة (pay_transactions) — بالدولار */
        if (type === '' || type === 'deposit' || type === 'withdrawal') {
          const where = ["p.type IN ('deposit','withdrawal')"];
          const params = [];
          if (uid) { where.push('p.user_id = ?'); params.push(String(uid)); }
          if (type) { where.push('p.type = ?'); params.push(type); }
          try {
            const rowsPay = db.prepare(
              'SELECT p.id, p.user_id, u.username AS username, p.type, p.amount_usd, p.method, p.status, p.proof_details, p.created_at ' +
              'FROM pay_transactions p LEFT JOIN users u ON u.id = CAST(p.user_id AS INTEGER) WHERE ' + where.join(' AND ') +
              ' ORDER BY p.id DESC LIMIT 1000'
            ).all(...params);
            for (const p of rowsPay) {
              out.push({
                id: 'pay' + p.id, user_id: p.user_id, username: p.username || null,
                type: (p.type === 'withdrawal') ? 'withdrawal' : 'deposit',
                amount: null, amount_usd: Number(p.amount_usd || 0), balance_after: null,
                counterparty_name: null, actor_name: null, game_id: null,
                status: p.status || null, method: p.method || null,
                note: ((p.method || '') + (p.proof_details ? ' — ' + String(p.proof_details).slice(0, 40) : '')) || null,
                created_at: Math.floor((Number(p.created_at) || 0) / 1000), src: 'pay'
              });
            }
          } catch (e) {}
        }
        /* ترتيب زمني تنازلي ثم تقليم (كل created_at بالثواني) */
        out.sort(function (a, b) { return ((Number(b.created_at) || 0) - (Number(a.created_at) || 0)) || String(a.id).localeCompare(String(b.id)); });
        const total = out.length;
        json({ ok: true, total: total, transactions: out.slice(offset, offset + limit) });
        return;
      }

      /* ── الغرف [v2.68·عزل] ──
         كل عملية تُوجَّه عبر المحور (rooms/index.js) إلى مدير لعبة الغرفة:
         إنشاء/انضمام/حركات/تسويات/دردشة — كل لعبة بمعزل عن الأخريات، والتحقق
         (مقاعد/حركات/حالة) وفق تعريف اللعبة من games/registry.js.
         عقود الاستجابات مطابقة حرفياً لما كانت عليه (توافق كامل للعملاء). */
      /* ═══════ [v2.75·تحكيم] البث المباشر للتحكيم البشري ═══════
         «المباراة» على المنصة = غرفة اللعب وجه لوجه (رهاناتها في escrow).
         المسارات كما طلبها المالك: /api/matches/:id/start-stream و resolve.
         الحسم أدمن حصراً ويسلك نواة التسوية المعتمدة (arbResolve/arbCancel). */
      /* [v2.76·صفحة التحكيم] جلستي: غرفة المستخدم الجارية + جلسة التحكيم
         المرتبطة بها — قبل كتلة المسارات كي لا يلتقطها regex المطابقة */
      if (pathname === '/api/matches/mine' && req.method === 'GET') {
        const rMn = arb.mine(me);
        json(rMn.body, rMn.status);
        return;
      }
      /* [v2.81·mediamtx] حالة بث اللاعبين عبر المرحّل — استعلام Loopback محلي
         عند الطلب حصراً (عند فتح لوحة المباراة) — أدمن/سوبر حصراً. قبل كتلة
         arbMatch كي لا يبتلعها regex المسارات العام */
      {
        const mtxMatch = pathname.match(/^\/api\/matches\/([^\/]+)\/stream-status$/);
        if (mtxMatch && req.method === 'GET') {
          Promise.resolve(mtx.streamStatus(me, decodeURIComponent(mtxMatch[1] || ''))).then(function (rMx) {
            json(rMx.body, rMx.status);
          }).catch(function () { json({ ok: false, message: 'تعذر فحص حالة البث' }, 500); });
          return;
        }
      }
      {
        const arbMatch = pathname.match(/^\/api\/matches(?:\/([^\/]+)\/(start-stream|resolve|cancel))?$/);
        if (arbMatch && req.method === 'POST' && arbMatch[2] === 'start-stream') {
          const rSs = arb.startStream(me, decodeURIComponent(arbMatch[1] || ''));
          json(rSs.body, rSs.status);
          return;
        }
        if (arbMatch && !arbMatch[2] && pathname === '/api/matches' && req.method === 'GET') {
          const rLs = arb.listSessions(me);
          json(rLs.body, rLs.status);
          return;
        }
        if (arbMatch && req.method === 'POST' && arbMatch[2] === 'resolve') {
          const rRv = arb.resolve(me, decodeURIComponent(arbMatch[1] || ''), data);
          json(rRv.body, rRv.status);
          return;
        }
        if (arbMatch && req.method === 'POST' && arbMatch[2] === 'cancel') {
          const rCx = arb.cancel(me, decodeURIComponent(arbMatch[1] || ''));
          json(rCx.body, rCx.status);
          return;
        }
      }
      if (pathname === '/api/arb/signal' && req.method === 'POST') {
        const rSg = arb.signal(me, data);
        json(rSg.body, rSg.status);
        return;
      }
      if (pathname === '/api/arb/heartbeat' && req.method === 'POST') {
        const rHb = arb.heartbeat(me, data);
        json(rHb.body, rHb.status);
        return;
      }
      /* [v2.71·استعادة] غرف المستخدم الحالية — يناديها العميل عند الإقلاع
         فيعيد فتح اللعبة الجارية بدل أن يبقى على الصفحة الرئيسية. */
      if (pathname === '/api/rooms/active' && req.method === 'GET') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const mine = roomHub.roomsOfUser(me.id);
        mine.sort(function (a, b) {
          const pa = (a.status === 'playing' ? 1 : 0), pb = (b.status === 'playing' ? 1 : 0);
          if (pa !== pb) return pb - pa;
          return (b.rev || 0) - (a.rev || 0);
        });
        json({
          ok: true,
          room: mine.length ? roomHub.io.serializeRoom(mine[0]) : null,
          rooms: mine.map(function (r) { return roomHub.io.serializeRoom(r); })
        });
        return;
      }
      if (pathname === '/api/rooms' && req.method === 'GET') {
        json({ ok: true, rooms: roomHub.waitingList() });
        return;
      }
      if (pathname === '/api/rooms' && req.method === 'POST') {
        /* إنشاء غرفة — الرهان مدفوع إلزامياً (لا غرف مجانية) */
        const rCreate = roomHub.create(data.game_id || 'rm', me, data);
        json(rCreate.body, rCreate.status);
        return;
      }
      if (pathname === '/api/rooms/join') {
        const rJoin = roomHub.joinByCode(me, data);
        json(rJoin.body, rJoin.status);
        return;
      }
      if (pathname === '/api/rooms/leave') {
        const rLeave = roomHub.exec('leave', me, data);
        json(rLeave.body, rLeave.status);
        return;
      }
      if (pathname === '/api/rooms/ready') {
        const rReady = roomHub.exec('ready', me, data);
        json(rReady.body, rReady.status);
        return;
      }
      if (pathname === '/api/rooms/start') {
        const rStart = roomHub.exec('start', me, data);
        json(rStart.body, rStart.status);
        return;
      }
      if (pathname === '/api/rooms/spectate') {
        const rSpec = roomHub.exec('spectate', me, data);
        json(rSpec.body, rSpec.status);
        return;
      }
      if (pathname === '/api/rooms/joinRequest') {
        const rJr = roomHub.exec('joinRequest', me, data);
        json(rJr.body, rJr.status);
        return;
      }
      if (pathname === '/api/rooms/endBet') {
        const rEnd = roomHub.exec('endBet', me, data);
        json(rEnd.body, rEnd.status);
        return;
      }
      /* [B-settle] تسوية رهان المباريات الحتمية (المقاعد w0-w3 / draw) — للمضيف */
      if (pathname === '/api/rooms/settleRound') {
        const rSettle = roomHub.exec('settleRound', me, data);
        json(rSettle.body, rSettle.status);
        return;
      }
      /* [RDC-team + v2.68] تسوية الفرق (t0/t1) — مقاعد زوجية (2 أو 4): الفريق = مقعد % 2 */
      if (pathname === '/api/rooms/settleTeamRound') {
        const rTeam = roomHub.exec('settleTeamRound', me, data);
        json(rTeam.body, rTeam.status);
        return;
      }
      /* [Settle-legacy] التسوية القديمة بالأسماء (روندا الكلاسيكية) — للمضيف */
      if (pathname === '/api/rooms/settle') {
        const rLegacy = roomHub.exec('settleLegacy', me, data);
        json(rLegacy.body, rLegacy.status);
        return;
      }
      /* [Timeout] انتهاء مهلة المتخمّن: يُصبح متفرجاً ويُرقّى متفرج من الطابور */
      if (pathname === '/api/rooms/timeoutSeat') {
        const rTs = roomHub.exec('timeoutSeat', me, data);
        json(rTs.body, rTs.status);
        return;
      }
      /* [v2.73·فلات دوغ] مصادقة المشاركة في الجولة القادمة — الاقتطاع هنا فقط
         (توجيه المالك: لا يُقتطع مبلغ الرهان إلا بعد نقر اللاعب على المشاركة) */
      if (pathname === '/api/rooms/roundJoin') {
        const rJ = roomHub.exec('roundJoin', me, data);
        json(rJ.body, rJ.status);
        return;
      }
      /* [v2.73·فلات دوغ] الانسحاب من الجولة القادمة — استرداد ما دفعه + تحرير
         المقعد للمتفرج الراغب في المشاركة (ترقية الطابور) */
      if (pathname === '/api/rooms/roundWithdraw') {
        const rW = roomHub.exec('roundWithdraw', me, data);
        json(rW.body, rW.status);
        return;
      }
      /* [Policy 2026-09-16] أُزيل الآليون من الغرف: حصرية للاعبين البشر */
      if (pathname === '/api/rooms/addBot' || pathname === '/api/rooms/removeBot') {
        json({ ok: false, message: 'الغرف حصرية للاعبين البشر — التدريب ضد الآلي من شاشة اللعبة' }, 403);
        return;
      }
      /* [Req3] بدء تصويت المباراة الجديدة + التصويت */
      if (pathname === '/api/rooms/rematch/start') {
        const rRms = roomHub.exec('rematchStart', me, data);
        json(rRms.body, rRms.status);
        return;
      }
      if (pathname === '/api/rooms/rematch/vote') {
        const rRmv = roomHub.exec('rematchVote', me, data);
        json(rRmv.body, rRmv.status);
        return;
      }
      /* [Req7/Req8] التفاعل والرسائل الصوتية */
      if (pathname === '/api/rooms/react') {
        const rReact = roomHub.exec('react', me, data);
        json(rReact.body, rReact.status);
        return;
      }
      if (pathname === '/api/rooms/voice') {
        const rVoice = roomHub.exec('voice', me, data);
        json(rVoice.body, rVoice.status);
        return;
      }

      /* [v2.67·اختبار] مقبض دورة منظّف الأشباح — باب اختبار حصراً في DM_TEST_MODE=1 */
      if (pathname === '/api/__test/ghost-sweep' && req.method === 'POST') {
        if (process.env.DM_TEST_MODE !== '1') { json({ ok: false, error: 'forbidden' }, 403); return; }
        try {
          const graceMs = parseInt(data && data.grace_ms, 10) || GHOST_GRACE_MS;
          global.__DTSG_GHOST_SWEEP(graceMs);
          json({ ok: true });
        } catch (e) { json({ ok: false }, 500); }
        return;
      }

      /* [v2.68·عزل] الحركة: توجيه لمدير لعبة الغرفة — قائمة بيضاء للأكشنات
         + ملكية الحالة (السائق) + base_rev ضد الكتابة المتقادمة.
         العقد القديم محفوظ: {ok, room} وroom:move يبث للجميع مع rev */
      if (pathname === '/api/rooms/move') {
        const rMove = roomHub.exec('move', me, data);
        json(rMove.body, rMove.status);
        return;
      }
      const chatMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/chat$/);
      if (chatMatch && req.method === 'GET') {
        /* [v2.67·C1] سجل دردشة الغرفة لأعضائها المصادقين فقط */
        const rChatGet = roomHub.exec('getChat', me, { room_id: chatMatch[1] });
        json(rChatGet.body, rChatGet.status);
        return;
      }
      if (pathname === '/api/rooms/chat') {
        /* [v2.67·C1] إرسال الدردشة يتطلب دخولاً وعضوية */
        const rChat = roomHub.exec('chat', me, data);
        json(rChat.body, rChat.status);
        return;
      }

      // Default API fallback
      json({ ok: false, error: 'not_found', path: pathname }, 404);
      } catch (e) {
        /* [NEW-6 v2.58] خطأ عام موحّد — لا تفاصيل داخلية (مصدر/مكدس/حسابات) في الاستجابة */
        try {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
            res.end(JSON.stringify({ ok: false, error: 'internal' }));
          } else { res.end(); }
        } catch (_) { try { res.destroy(); } catch (_2) {} }
        console.error('[api-error]', pathname, req.method, e && e.stack ? e.stack : e);
      }
    });
    return;
  }

  /* ═══════ الملفات الثابتة ═══════ */
  /* [v2.40.4 · أمن] منع خدمة ملفات الخادم/البيانات/الأسرار عبر الويب العمومي */
  if (isDeniedStatic(pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + pathname);
    return;
  }
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath.replace(/^\//, ''));
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }

  /* [v2.67·H1+] التقديم عبر الذاكرة الساخنة + ETag/304 + ترويسات التخزين
     (التفصيل في تعريف serveStaticFile أعلى الملف) */
  serveStaticFile(filePath, req, res, pathname);
});

/* ── [Group] تشغيل حلقتي جولات كينو وكراش الجماعية ── */
groupStartAll();

/* [v2.59 R4-003] حارس الإقلاع: DM_TEST_MODE يجمع ثلاثة سلوكيات خطرة معاً
   (باب qa-admin-secret + تسجيل مفتوح بشحن 100,000 كوينز + CORS من localhost).
   إن وُجدت مع علامات إنتاج (أسرار تيليغرام/بينانس الحقيقية) فاحتمال الخطأ
   التشغيلي عالٍ — نطلق تحذيراً صاخباً دائماً بدل الصمت. */
if (process.env.DM_TEST_MODE === '1') {
  const prodMarkers = ['TELEGRAM_BOT_TOKEN', 'BINANCE_PAY_API_KEY', 'BINANCE_PAY_SECRET_KEY',
    'SUPPORT_BOT_TOKEN', 'SUPPORT_WEBHOOK_SECRET'].filter(k => process.env[k]);
  if (prodMarkers.length >= 2) {
    console.warn('═══════════════════════════════════════════════════════════════════════');
    console.warn('⚠️️  DM_TEST_MODE=1 مفعّل مع علامات إنتاج (' + prodMarkers.join(', ') + ') ⚠️️');
    console.warn('   => تسجيل مفتوح بشحن 100,000 كوينز + باب qa-admin-secret + CORS موسّع');
    console.warn('   إن لم يكن هذا بيئة اختبار مقصودة: أطفئ DM_TEST_MODE وأعد الإقلاع!');
    console.warn('═══════════════════════════════════════════════════════════════════════');
  }
}

/* [v2.67·H1] مواءمة keep-alive مع نفق Cloudflare (60s): عمر اتصال أطول من
   الطرف البعيد يمنع عواصف إعادة الاتصال التي كانت تضاعف زمن كل طلب */
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('DTSG (Digital Traditional Skills Games) Live Server running at http://0.0.0.0:' + PORT);
});
