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
  /^\/?(server[^\/]*\.js|package(-lock)?\.json|tunnel-live\.json|\.env[^\/]*)/i,
  /^\/?(data|cf-worker|scripts|tests|node_modules|logs|backup|backups|tmp)(\/|$)/i,
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

/* [Group] جداول الجولات الجماعية (كينو/كراش — السيرفر يحكم الجولة، Provably Fair) */
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
const rooms = {};               // roomId -> room object
let nextRoomId = 1;
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
    db.prepare(
      'INSERT INTO transactions (user_id, type, amount, balance_after, counterparty_id, counterparty_name, actor_id, actor_name, game_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(
      user.id, String(type || ''), r2(amount || 0),
      (ex.balance_after != null) ? r2(ex.balance_after) : null,
      ex.counterparty_id != null ? ex.counterparty_id : null,
      ex.counterparty_name != null ? String(ex.counterparty_name) : null,
      ex.actor_id != null ? ex.actor_id : null,
      ex.actor_name != null ? String(ex.actor_name) : null,
      ex.game_id != null ? String(ex.game_id) : null,
      ex.note != null ? String(ex.note) : null,
      Math.floor(Date.now() / 1000)
    );
  } catch (e) {}
}
/* [server-tx] تسجيل تذكرة رهان في جدول bet_tickets (لا تُفشل اللعبة أبداً) */
function logTicket(userId, gameId, bet, won, payout, resultTxt) {
  try {
    db.prepare(
      'INSERT INTO bet_tickets (user_id, game_id, bet, won, payout, result_txt, created_at) VALUES (?,?,?,?,?,?,?)'
    ).run(userId, String(gameId || ''), bet || 0, won ? 1 : 0, payout || 0,
      (resultTxt != null) ? String(resultTxt).slice(0, 90) : null, Math.floor(Date.now() / 1000));
  } catch (e) {}
}

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

/* [B-rooms] sweeper غرف الساعة كل 60ث: المنتهية في الانتظار تُحلّ، والجاري جولتها تُعلَّم فقط */
setInterval(() => {
  Object.values(rooms).forEach(function (room) {
    try { sweepExpiredRoom(room); } catch (e) {}
  });
}, 60 * 1000);

/* ═══════ [Group] الجولات الجماعية: كينو (ke) وكراش (av) — خادمية بالكامل ═══════
   السيرفر يولّد النتائج (Provably Fair) ويحكم الأرصدة في الذاكرة + DB.
   العميل يرى نفس الجولة/النتيجة ويضبط رصيده من ردود السيرفر فقط. */
const GROUP_KE = 'ke', GROUP_AV = 'av';
const GROUP_ROUND_CFG = {
  ke: { bet_ms: 90000, draw_ms: 5000 },
  av: { bet_ms: 90000 }
};
/* نسخة خادمية من جدول مضاعفات كينو — تطابق js/games/engines.js KENO_PAYS حرفياً */
const KENO_PAYS = [
  null,
  [0, 3.8],
  [0, 1, 10],
  [0, 0, 3, 38],
  [0, 0, 1, 9, 100],
  [0, 0, 0, 4, 26, 448],
  [0, 0, 0, 2, 9, 85, 1324],
  [0, 0, 0, 0, 6, 39, 270, 4199],
  [0, 0, 0, 0, 3, 18, 98, 684, 8924],
  [0, 0, 0, 0, 0, 10, 63, 313, 2170, 28930],
  [0, 0, 0, 0, 0, 5, 28, 154, 794, 4205, 56061]
];
const groupRounds = {}; /* gameId -> {round} الحالة الحية في الذاكرة */

function sha256Hex(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}
/* نتيجة حتمية من البذرة — نفس التوليد يُعاد على العميل في fair.js للتحقق */
function groupOutcome(seed, gameId) {
  const h = (i) => parseInt(sha256Hex(seed + ':' + i).slice(0, 8), 16);
  if (gameId === GROUP_KE) {
    const pool = [];
    for (let n = 1; n <= 80; n++) pool.push(n);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = h(i) % (i + 1);
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return { numbers: pool.slice(0, 20) };
  }
  if (gameId === GROUP_AV) {
    const u = Math.min(h(1) / 0xFFFFFFFF, 0.999999999);
    return { crash_at: Math.max(1.02, 0.97 / (1 - u)) };
  }
  return null;
}
function kenoPayout(k, hits) {
  const row = KENO_PAYS[k];
  return (row && row[hits]) || 0;
}

/* بثّ عام لكل متصلّي SSE (لا يتطلب غرفة) */
function broadcastAll(event, data) {
  sseClients.forEach(function (c) { sendSSE(c.res, event, data); });
}

/* بدء جولة جديدة للعبة (نافذة رهان ثم سحب/طيران) */
function groupStartNext(gameId) {
  const prev = groupRounds[gameId];
  const base = prev
    ? prev.round_no
    : db.prepare('SELECT COALESCE(MAX(round_no),0) m FROM group_rounds WHERE game_id = ?').get(gameId).m;
  const roundNo = base + 1;
  const seed = crypto.randomBytes(16).toString('hex');
  const seedHash = sha256Hex(seed);
  const outcome = groupOutcome(seed, gameId);
  const cfg = GROUP_ROUND_CFG[gameId];
  const now = Date.now();
  const info = db.prepare(
    'INSERT INTO group_rounds (game_id, round_no, status, seed, seed_hash, outcome, started_at, bet_ends_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(gameId, roundNo, 'betting', seed, seedHash, JSON.stringify(outcome), now, now + cfg.bet_ms, Math.floor(now / 1000));
  const round = {
    id: Number(info.lastInsertRowid),
    game_id: gameId,
    round_no: roundNo,
    status: 'betting',
    seed, seed_hash: seedHash, outcome,
    started_at: now,
    bet_ends_at: now + cfg.bet_ms,
    draw_ends_at: 0,
    crashed_at: 0,
    timer: null
  };
  groupRounds[gameId] = round;
  broadcastAll('gr:' + gameId, {
    type: 'new',
    round_no: roundNo,
    bet_ends_at: round.bet_ends_at,
    phase_ends_at: round.bet_ends_at,
    seed_hash: seedHash
  });
  round.timer = setTimeout(() => {
    if (gameId === GROUP_KE) groupKeDraw(round);
    else groupAvFly(round);
  }, cfg.bet_ms);
  return round;
}

/* كينو: نهاية الرهان → كشف الأرقام (5 ثوانٍ) → تسوية */
function groupKeDraw(round) {
  round.status = 'drawing';   /* الإقفال قبل أي بثّ: لا رهان يُقبل بعد هذه اللحظة */
  round.draw_ends_at = Date.now() + GROUP_ROUND_CFG.ke.draw_ms;
  db.prepare("UPDATE group_rounds SET status = 'drawing' WHERE id = ?").run(round.id);
  broadcastAll('gr:ke', { type: 'draw', round_no: round.round_no, numbers: round.outcome.numbers, phase_ends_at: round.draw_ends_at });
  round.timer = setTimeout(() => { groupKeResolve(round); }, GROUP_ROUND_CFG.ke.draw_ms);
}
function groupKeResolve(round) {
  const numbers = round.outcome.numbers;
  const bets = db.prepare('SELECT * FROM group_bets WHERE round_id = ?').all(round.id);
  const updBet = db.prepare('UPDATE group_bets SET won = ?, payout = ? WHERE id = ?');
  let totalPaid = 0;
  const winners = [];
  for (const b of bets) {
    let payout = 0;
    try {
      const picks = JSON.parse(b.picks || '[]');
      const hits = picks.filter((n) => numbers.indexOf(n) !== -1).length;
      payout = r2(b.bet * kenoPayout(picks.length, hits));
    } catch (e) { payout = 0; }
    updBet.run(payout > 0 ? 1 : 0, payout, b.id);
    if (payout > 0) {
      /* [Group] الأرصدة في الذاكرة + DB معاً (نمط المشاريع هذا) */
      const u = users[b.user_id];
      if (u) {
        u.gold = (u.gold || 0) + payout;
        try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
      } else {
        try { db.prepare('UPDATE users SET gold = gold + ? WHERE id = ?').run(payout, b.user_id); } catch (e) {}
      }
      totalPaid += payout;
      winners.push({ username: b.username, payout: payout });
    }
  }
  round.status = 'finished';
  db.prepare("UPDATE group_rounds SET status = 'finished' WHERE id = ?").run(round.id);
  broadcastAll('gr:ke', { type: 'resolve', round_no: round.round_no, result: { winners: winners.length, winners_list: winners, total_paid: totalPaid } });
  groupStartNext(GROUP_KE);
}

/* كراش: نهاية الرهان → طيران (مدة = ln(crash_at)/0.00006 ms) → انفجار → تسوية */
function groupAvFly(round) {
  round.status = 'flying';   /* الإقفال قبل أي بثّ: لا رهان يُقبل بعد هذه اللحظة */
  round.started_at = Date.now();
  db.prepare("UPDATE group_rounds SET status = 'flying', started_at = ? WHERE id = ?").run(round.started_at, round.id);
  broadcastAll('gr:av', { type: 'fly', round_no: round.round_no, started_at: round.started_at });
  const crashAt = round.outcome.crash_at;
  const flightMs = Math.log(crashAt) / 0.00006;
  round.timer = setTimeout(() => { groupAvResolve(round, crashAt); }, flightMs);
}
function groupAvResolve(round, crashAt) {
  const bets = db.prepare('SELECT * FROM group_bets WHERE round_id = ?').all(round.id);
  let totalPaid = 0;
  const winners = [];
  for (const b of bets) {
    if (b.won) {
      totalPaid += b.payout;
      winners.push({ username: b.username, mult: b.cashout_mult, payout: b.payout });
    }
  }
  round.status = 'finished';
  round.crashed_at = Date.now();
  db.prepare("UPDATE group_rounds SET status = 'finished', crashed_at = ? WHERE id = ?").run(round.crashed_at, round.id);
  broadcastAll('gr:av', { type: 'crash', round_no: round.round_no, crash_at: crashAt, result: { winners: winners.length, winners_list: winners, total_paid: totalPaid } });
  groupStartNext(GROUP_AV);
}

/* عند إقلاع السيرفر: استرداد رهانات أي جولة معلقة (لا تعلق أبداً) ثم تشغيل الحلقات */
function groupSettleLeftover() {
  const rows = db.prepare("SELECT id FROM group_rounds WHERE status IN ('betting','drawing','flying')").all();
  const updBet = db.prepare('UPDATE group_bets SET won = 1, payout = bet WHERE round_id = ? AND won = 0');
  for (const r of rows) {
    const bets = db.prepare('SELECT * FROM group_bets WHERE round_id = ? AND won = 0').all(r.id);
    for (const b of bets) {
      /* [Group] استرداد في الذاكرة + DB معاً */
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
    groupStartNext(GROUP_KE);
    groupStartNext(GROUP_AV);
    console.log('[group] rounds started: ke + av');
  } catch (e) {
    console.error('[group] start failed', e);
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
  { username: 'mehdi_rabat', game_id: 'Crash 🚀', payout: 1250 },
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

/* ═══════ الغرف: تسلسل + بثّ ═══════ */
function serializeRoom(room) {
  const nonspec = room.players.filter(function (p) { return !p.spectate; }).sort(function (a, b) { return a.seat - b.seat; });
  return {
    id: room.id,
    code: room.code,
    game_id: room.game_id,
    owner_id: room.owner_id,
    owner_name: room.owner_name,
    max_players: room.max_players,
    status: room.status,
    bet: room.bet || 0,   /* [B10] رهان الغرفة */
    room_type: room.room_type || null,   /* [B10] نوع الرهان: 'hour' | 'percentage' */
    expires_at: room.expires_at != null ? Number(room.expires_at) : null,   /* [B-rooms] نهاية صلاحية غرف الساعة */
    visibility: room.visibility === 'private' ? 'private' : 'public',       /* [B-rooms] عامة/خاصة */
    settled: !!room.settled,   /* [B-settle] هل حُلّت الجولة الجارية */
    expired: !!room.expired,   /* [B-rooms] انتهت مدة الساعة والجولة الجارية آخر جولة */
    players: room.players.map(function (p) {
      return { id: p.id, username: p.username, ready: !!p.ready, spectate: !!p.spectate, seat: p.seat, isBot: !!p.isBot };
    }),
    order: nonspec.map(function (p) { return p.id; }),
    room_state: room.room_state || {},
    game_opts: room.game_opts || null,   /* [RS-GameOpts] إعدادات اللعبة للجميع */
    /* [Spectator] ملخّص المقاعد وطابور طلبات الانضمام */
    seats: { players: nonspec.length, max: room.max_players, free: Math.max(0, room.max_players - nonspec.length) },
    joinQueue: (room.joinQueue || []).map(function (r) { return { id: r.id, username: r.username, ts: r.ts }; }),
    /* [Req3] حالة تصويت المباراة الجديدة */
    driverId: room.driverId != null ? room.driverId : room.owner_id,   /* [Resilience] السائق الحالي */
    hasHistory: !!(room.moveHistory && room.moveHistory.length),   /* [Resilience] هل بدأت الجولة؟ يمنع إعادة استضافة المالك عند العودة */
    online: Object.keys(room.online || {}),   /* [Resilience] اللاعبون المتصلون */
    rematch: room.rematch ? {
      participants: room.rematch.participants || [],
      votes: room.rematch.votes || {},
      resolved: !!room.rematch.resolved,
      rematch: !!room.rematch.rematch,
      agreed: room.rematch.agreed || [],
      names: room.rematch.names || {},
      ts: room.rematch.ts || 0
    } : null
  };
}
function sendSSE(res, event, data) {
  try { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch (e) {}
}
function broadcastRoom(room, event, payload) {
  const memberIds = new Set(room.players.map(function (p) { return p.id; }));
  sseClients.forEach(function (c) {
    if (c.userId != null && memberIds.has(c.userId)) sendSSE(c.res, event, payload);
  });
}
function updateRoom(room) { broadcastRoom(room, 'room:update', serializeRoom(room)); }

/* ═══════ [B-rooms] غرف الساعة: انتهاء المدة والحلّ بعد الجولة الجارية ═══════ */
/* هل انتهت صلاحية غرفة الساعة؟ (الغرف النسبية بلا حدّ زمني) */
function roomTimeUp(room) { return !!(room && room.room_type === 'hour' && room.expires_at != null && Date.now() > room.expires_at); }
/* حُلّ الغرفة: بثّ room:update بقيمة null ثم حذفها (يغلقها عند الجميع) */
function dissolveRoom(room) {
  if (!room || !rooms[room.id]) return;
  broadcastRoom(room, 'room:update', null);
  delete rooms[room.id];
}
/* انتهاء الصلاحية عند أي حدث غرفة: إن كانت الغرفة في الانتظار تُحلّ فوراً؛
   وإن كانت جولة جارية تُعلَّم فقط expired=true وتُحلّ عند أول نهاية جولة (endBet/settle/rematch/vote) */
function sweepExpiredRoom(room) {
  if (!roomTimeUp(room)) return false;
  if (room.status === 'playing') {
    if (!room.expired) room.expired = true;   /* لا تُقفل حتى تنتهي الجولة الجارية */
    return false;
  }
  dissolveRoom(room);
  return true;
}
/* ما بعد الجولة: إن كانت غرفة ساعة منتهية/معلَّمة → حُلّها (يعيد true إن حُلّت) */
function dissolveIfExpired(room) {
  if (!room || room.room_type !== 'hour') return false;
  if (!room.expired && !roomTimeUp(room)) return false;
  dissolveRoom(room);
  return true;
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


/* [Req3] حلّ تصويت المباراة الجديدة: حين يقرّر كل المشاركين (تصويت أو مغادرة=رفض)
   الموافقون المتبقّون (≥2 ويحويهم المُنشئ) يبدؤون مباراة جديدة؛ وإلا فلا مباراة جديدة */
function tryResolveRematch(room) {
  if (!room || !room.rematch || room.rematch.resolved) return false;
  var rm = room.rematch;
  var inRoom = function (id) { return room.players.some(function (p) { return p.id === id; }); };
  var allDecided = rm.participants.every(function (id) { return rm.votes[id] || !inRoom(id); });
  if (!allDecided) return false;
  var agreed = rm.participants.filter(function (id) { return rm.votes[id] === 'agree' && inRoom(id); });
  rm.resolved = true;
  var ownerPresent = inRoom(room.owner_id);
  if (agreed.length >= 2 && (!ownerPresent || agreed.indexOf(room.owner_id) !== -1)) {
    /* مباراة جديدة: الموافقون لاعبون، البقية متفرجون */
    room.players.forEach(function (p) {
      if (agreed.indexOf(p.id) !== -1) { p.spectate = false; p.ready = true; }
      else { p.spectate = true; p.ready = true; }
    });
    var seat = 0;
    room.players.filter(function (p) { return !p.spectate; }).forEach(function (p) { p.seat = seat++; });
    room.status = 'playing';          /* انتظار→لعب يُطلق إعادة التهيئة عند الجميع */
    room.rematch = null;
    room.moveHistory = [];           /* [Resilience] مباراة جديدة = سجل جديد (يسمح للمالك بالاستضافة) */
    room.dedupSeen = {};
    room.settled = null;             /* [B-settle] جولة جديدة قابلة للتسوية */
  } else {
    rm.rematch = false; rm.agreed = agreed; /* لا موافقة كافية */
  }
  return true;
}

/* [Spectator] ترقية المتفرجين في الطابور إلى مقاعد شاغرة (بقدر المتاح) */
function promoteQueued(room) {
  if (!room || !room.joinQueue || !room.joinQueue.length) return;
  for (;;) {
    const nonSpec = room.players.filter(function (p) { return !p.spectate; }).length;
    if (nonSpec >= room.max_players) break;
    const req = room.joinQueue.shift();
    if (!req) break;
    const p = room.players.find(function (x) { return x.id === req.id; });
    if (p) {
      p.spectate = false;
      p.ready = true;
      p.seat = nonSpec;
    } else {
      /* لم يعد في الغرفة — أعدّه لاعباً مباشرةً */
      room.players.push({ id: req.id, username: req.username, ready: true, spectate: false, seat: nonSpec });
    }
  }
  if (!room.joinQueue.length) room.joinQueue = [];
}

/* [Resilience] تتبّع المتصلين وإعادة تعيين السائق عند انقطاعه */
function markOnline(room, uid) {
  if (!room) return;
  if (!room.online) room.online = {};
  room.online[uid] = (room.online[uid] || 0) + 1;
  /* [Resilience] إن كان السائق الحالي غير متصل (انقطع الجميع ثم عاد أحدهم) → نوّط له */
  if (room.driverId != null && !isOnline(room, room.driverId)) {
    var me = room.players.find(function (p) { return p.id === uid && !p.spectate; });
    if (me) { var before = room.driverId; room.driverId = uid; if (before !== uid) updateRoom(room); }
  }
}
function markOffline(room, uid) {
  if (!room || !room.online) return;
  room.online[uid] = (room.online[uid] || 1) - 1;
  if (room.online[uid] <= 0) { delete room.online[uid]; }
  /* إن كان السائق قد انقطع → نوّط الساقة لأقرب لاعب متصل */
  if (room.driverId === uid) reassignDriver(room);
}
function isOnline(room, uid) { return !!(room && room.online && room.online[uid] > 0); }
function reassignDriver(room) {
  if (!room) return;
  const nonspec = room.players.filter(function (p) { return !p.spectate; }).sort(function (a, b) { return a.seat - b.seat; });
  const next = nonspec.find(function (p) { return isOnline(room, p.id) && !p.isBot; });
  const before = room.driverId;
  /* لا يُعطى السائق لبوت (لا عميل له): يُفضَّل أول إنسان متصل، ثم أول إنسان، ثم المالك */
  const humanFallback = nonspec.find(function (p) { return !p.isBot; });
  room.driverId = next ? next.id : (humanFallback ? humanFallback.id : (nonspec.length ? nonspec[0].id : room.owner_id));
  if (before !== room.driverId) { updateRoom(room); }
}

/* [CORS DTSG-005] قائمة صريحة للأصول الموثوقة — منع عكس أي نطاق خارجي عشوائي */
function isOriginAllowed(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === 'dtsg.pages.dev' || host.endsWith('.dtsg.pages.dev') || host.endsWith('.pages.dev')) return true;
    if (host.endsWith('.workers.dev')) return true;
    if (host.endsWith('.e2b.app') || host.endsWith('.arena.ai')) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    return false;
  } catch (e) {
    return false;
  }
}

/* [DTSG-006] مقيد معدل محاولات تسجيل الدخول في الذاكرة */
const loginAttempts = new Map();
function checkLoginRateLimit(ip, username) {
  const now = Date.now();
  const key = String(ip || '0') + '|' + String(username || '').toLowerCase();
  const rec = loginAttempts.get(key);
  if (rec && rec.lockedUntil && now < rec.lockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}
function recordFailedLogin(ip, username) {
  const now = Date.now();
  const key = String(ip || '0') + '|' + String(username || '').toLowerCase();
  let rec = loginAttempts.get(key);
  if (!rec || now - rec.firstAt > 60000) {
    rec = { count: 1, firstAt: now, lockedUntil: 0 };
  } else {
    rec.count++;
  }
  if (rec.count >= 10) {
    rec.lockedUntil = now + 60000;
  }
  loginAttempts.set(key, rec);
}
function clearFailedLogin(ip, username) {
  const key = String(ip || '0') + '|' + String(username || '').toLowerCase();
  loginAttempts.delete(key);
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  /* [CORS & CSRF DTSG-005 / DTSG-011] قائمة صريحة للأصول الموثوقة — منع عكس أي نطاق خارجي وحجب طلبات CSRF */
  const reqOrigin = req.headers.origin;
  if (reqOrigin && reqOrigin !== 'null') {
    if (isOriginAllowed(reqOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    } else {
      if (req.method === 'OPTIONS') {
        res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('CORS forbidden'); return;
      }
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE' || req.method === 'PATCH') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'forbidden_origin', message: 'Cross-origin request blocked' }));
        return;
      }
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
    const helloData = {
      online: 42 + sseClients.length,
      /* الدردشة العامة أزيلت؛ لا نرسل سجل رسائل في SSE. */
      winners: winners
    };
    res.write('event: hello\ndata: ' + JSON.stringify(helloData) + '\n\n');
    sseClients.push({ res: res, userId: me ? me.id : null });

    /* بثّ حالة الغرفة الحالية للمنضمّ المتأخر */
    if (me) {
      for (const rid in rooms) {
        const r = rooms[rid];
        if (r.players.some(function (p) { return p.id === me.id; })) {
          markOnline(r, me.id);
          sendSSE(res, 'room:update', serializeRoom(r));
          /* [Resilience] أعد بناء حالة الجولة الجارية للاعب العائد */
          if (r.status === 'playing' && r.moveHistory && r.moveHistory.length) {
            sendSSE(res, 'room:replay', { room_id: r.id, history: r.moveHistory });
          }
        }
      }
    }

    req.on('close', () => {
      const idx = sseClients.findIndex(function (c) { return c.res === res; });
      if (idx !== -1) sseClients.splice(idx, 1);
      /* [Resilience] انقطاع لاعب → تحديث الاتصال وإعادة تعيين السائق */
      if (me) {
        for (const rid in rooms) {
          const r = rooms[rid];
          if (r.players.some(function (p) { return p.id === me.id; })) markOffline(r, me.id);
        }
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
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let data = {};
      try { data = body ? JSON.parse(body) : {}; } catch (e) {}
      const me = getUser(req);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      function json(obj, status) { res.writeHead(status || 200); res.end(JSON.stringify(obj)); }

      /* ── [Support 2026-09-18] بوت الدعم + واجهة صفحة الدعم (ربط/تذاكر/أدمنز) ── */
      if (sup.isSupportPath(pathname)) { sup.handleHttp(req, res, pathname, body, parsedUrl); return; }

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
        /* [DTSG-007 SEC] رسالة خطأ موحدة 401 تمنع تخمين وحصاد أسماء المستخدمين */
        if (!existing || (existing.passHash && !verifyPassword(password, existing.passSalt, existing.passHash))) {
          recordFailedLogin(clientIp, username);
          json({ ok: false, message: 'بيانات الدخول غير صحيحة — اسم المستخدم أو كلمة المرور خاطئة' }, 401);
          return;
        }
        if (existing.banned) { json({ ok: false, message: 'تم حظر هذا الحساب' }, 403); return; }

        /* [2FA] إذا كانت المصادقة الثنائية مفعّلة يلزم رمز TOTP صالح قبل إصدار الجلسة */
        if (existing.twofaEnabled) {
          if (!data.totp || !totpVerify(existing.totpSecret, data.totp)) {
            json({ twofa_required: true, userId: existing.id });
            return;
          }
        }
        clearFailedLogin(clientIp, username);
        try { db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), existing.id); } catch (e) {}
        existing.last_seen = Math.floor(Date.now() / 1000);
        startSession(res, existing);
        json({ ok: true, user: publicUser(existing) });
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
        const role = (data.role === 'admin' || data.role === 'super' || data.role === 'user') ? data.role : 'user';
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
        const startGold = REGISTER_TEST_MODE && data.gold == null ? 100000 : (data.gold != null ? Number(data.gold) : 0);
        const u = { username: username, passHash: hash, passSalt: salt, role: role, gold: startGold, lang: 'ar', banned: false };
        persistUser(u);
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
      /* ── [2FA] المصادقة الثنائية ── */
      if (pathname === '/api/2fa/login') {
        /* إكمال الدخول بعد إدخال رمز TOTP (userId + code) */
        const user = (data.userId != null) ? users[data.userId] : null;
        if (!user) { json({ ok: false, message: 'المستخدم غير موجود' }, 401); return; }
        if (user.twofaEnabled && !totpVerify(user.totpSecret, data.code)) { json({ ok: false, message: 'رمز التحقق غير صحيح' }, 401); return; }
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
        /* [server-tx] سجل معاملات المستخدم الحالي من جدول transactions */
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const rows = db.prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100").all(me.id);
        const TX_TYPES = ['transfer_out', 'transfer_in', 'charge', 'deduct', 'set_balance', 'referral_bonus', 'claim', 'win', 'bet'];
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
         لا يحتوي أي بيانات مستخدم، ويمكن تغييره لاحقاً من إعدادات المنصة. */
      if (pathname === '/api/promotions' && req.method === 'GET') {
        json({
          ok: true,
          updated_at: new Date().toISOString().slice(0, 10),
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
      /* [DTSG-019] نقطة قائمة المتصدرين */
      if (pathname === '/api/lb' || pathname === '/api/leaderboard') {
        const top = Object.values(users)
          .filter(u => u && u.role !== 'admin' && u.role !== 'super' && !u.banned)
          .sort((a, b) => (b.gold || 0) - (a.gold || 0))
          .slice(0, 20)
          .map(u => ({ username: u.username, gold: u.gold || 0 }));
        json({ ok: true, leaderboard: top });
        return;
      }
      if (pathname === '/api/tournaments') {
        json({ ok: true, tournaments: [] });
        return;
      }
      if (pathname === '/api/games' || (pathname === '/api/admin/games' && req.method === 'GET')) { json({ ok: true, games: gameFlags }); return; }
      if (pathname === '/api/rounds' && req.method === 'POST') {
        /* [server-tx] تسجيل تذكرة رهان — للضيف قبول صامت بلا تسجيل */
        if (me) {
          const gid = String(data.game_id || '').slice(0, 64);
          const bet = Math.max(0, r2(Number(data.bet)) || 0);
          const won = !!data.won;
          const payout = Math.max(0, r2(Number(data.payout)) || 0);
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

      /* ── [Group] الجولات الجماعية: كينو (ke) وكراش (av) — الجولة والرصيد من السيرفر حصراً ── */
      /* نتيجة جولة منتهية (فائزو السحب فقط) */
      function grpRoundResult(gameId, round) {
        const bets = db.prepare('SELECT * FROM group_bets WHERE round_id = ?').all(round.id);
        let totalPaid = 0;
        const winners = [];
        for (const b of bets) {
          if (!b.won) continue;
          totalPaid += b.payout;
          winners.push({ username: b.username, mult: b.cashout_mult, payout: b.payout });
        }
        return { winners, total_paid: totalPaid };
      }

      if (pathname === '/api/games/ke/round' && req.method === 'GET') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const r = groupRounds.ke;
        if (!r) { json({ ok: false, message: 'لا جولة نشطة حالياً' }, 404); return; }
        const pub = {
          game_id: 'ke', round_no: r.round_no, status: r.status,
          bet_ends_at: r.bet_ends_at,
          phase_ends_at: r.status === 'betting' ? r.bet_ends_at : r.draw_ends_at,
          seed_hash: r.seed_hash
        };
        if (r.status === 'drawing' || r.status === 'finished') pub.numbers = r.outcome.numbers;
        if (r.status === 'finished') pub.result = grpRoundResult('ke', r);
        const myBets = db.prepare('SELECT bet, picks, won, payout FROM group_bets WHERE round_id = ? AND user_id = ?').all(r.id, me.id);
        const live = db.prepare('SELECT username, bet, picks, created_at FROM group_bets WHERE round_id = ? ORDER BY id DESC LIMIT 20').all(r.id);
        json({ ok: true, round: pub, my_bets: myBets, live: live, gold: me.gold });
        return;
      }

      if (pathname === '/api/games/ke/bet' && req.method === 'POST') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const r = groupRounds.ke;
        if (!r) { json({ ok: false, message: 'لا جولة نشطة حالياً' }, 404); return; }
        if (r.status !== 'betting' || Date.now() >= r.bet_ends_at) {
          json({ ok: false, message: 'انتهى وقت الرهان — انتظر الجولة التالية' }, 400); return;
        }
        const picksRaw = data.picks;
        if (!Array.isArray(picksRaw) || picksRaw.length < 1 || picksRaw.length > 10) {
          json({ ok: false, message: 'اختر من 1 إلى 10 أرقام' }, 400); return;
        }
        const picks = [];
        for (const v of picksRaw) {
          const n = parseInt(v, 10);
          if (!Number.isInteger(n) || n < 1 || n > 80 || picks.indexOf(n) !== -1) {
            json({ ok: false, message: 'أرقام غير صالحة (1-80، بدون تكرار)' }, 400); return;
          }
          picks.push(n);
        }
        const amount = r2(Number(data.amount));
        if (isNaN(amount) || amount < 0.01 || amount > 100000000) {
          json({ ok: false, message: 'مبلغ غير صالح' }, 400); return;
        }
        if ((me.gold || 0) < amount) { json({ ok: false, message: 'رصيد غير كافٍ' }, 400); return; }
        /* [MultiBet] رهانات متعددة في نفس الجولة مسموحة — لكن بأرقام مختلفة:
           أي رقم سبق للمستخدم الرهان عليه في هذه الجولة يُرفض */
        {
          const prevBets = db.prepare('SELECT picks FROM group_bets WHERE round_id = ? AND user_id = ?').all(r.id, me.id);
          const used = {};
          for (const pb of prevBets) {
            try { JSON.parse(pb.picks || '[]').forEach(function (n) { used[n] = 1; }); } catch (e) {}
          }
          for (const n of picks) {
            if (used[n]) { json({ ok: false, message: 'رقم ' + n + ' مرهون عليه في هذه الجولة — اختر أرقاماً مختلفة' }, 400); return; }
          }
        }
        /* [Group] الخصم من الذاكرة + DB معاً (نمط هذا المشروع) */
        me.gold = me.gold - amount;
        try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(me.gold, me.id); } catch (e) {}
        db.prepare('INSERT INTO group_bets (round_id, user_id, username, bet, picks, created_at) VALUES (?,?,?,?,?,?)')
          .run(r.id, me.id, me.username, amount, JSON.stringify(picks), Math.floor(Date.now() / 1000));
        broadcastAll('gr:ke', { type: 'bet', round_no: r.round_no, username: me.username, amount: amount, picks: picks });
        json({ ok: true, gold: me.gold, round_no: r.round_no, amount: amount });
        return;
      }

      if (pathname === '/api/games/av/round' && req.method === 'GET') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const r = groupRounds.av;
        if (!r) { json({ ok: false, message: 'لا جولة نشطة حالياً' }, 404); return; }
        const pub = {
          game_id: 'av', round_no: r.round_no, status: r.status,
          bet_ends_at: r.bet_ends_at,
          phase_ends_at: r.status === 'betting' ? r.bet_ends_at : null,
          started_at: r.status === 'flying' ? r.started_at : null,
          seed_hash: r.seed_hash
        };
        if (r.status === 'finished') {
          pub.crash_at = r.outcome.crash_at;
          pub.result = grpRoundResult('av', r);
        }
        const myBets = db.prepare('SELECT bet, cashout_mult, won, payout FROM group_bets WHERE round_id = ? AND user_id = ?').all(r.id, me.id);
        const live = db.prepare('SELECT username, bet, created_at FROM group_bets WHERE round_id = ? ORDER BY id DESC LIMIT 20').all(r.id);
        json({ ok: true, round: pub, my_bets: myBets, live: live, gold: me.gold });
        return;
      }

      if (pathname === '/api/games/av/bet' && req.method === 'POST') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const r = groupRounds.av;
        if (!r) { json({ ok: false, message: 'لا جولة نشطة حالياً' }, 404); return; }
        if (r.status !== 'betting' || Date.now() >= r.bet_ends_at) {
          json({ ok: false, message: 'انتهى وقت الرهان — انتظر الجولة التالية' }, 400); return;
        }
        const amount = r2(Number(data.amount));
        if (isNaN(amount) || amount < 0.01 || amount > 100000000) {
          json({ ok: false, message: 'مبلغ غير صالح' }, 400); return;
        }
        if ((me.gold || 0) < amount) { json({ ok: false, message: 'رصيد غير كافٍ' }, 400); return; }
        /* [Group] الخصم من الذاكرة + DB معاً (نمط هذا المشروع) */
        me.gold = me.gold - amount;
        try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(me.gold, me.id); } catch (e) {}
        db.prepare('INSERT INTO group_bets (round_id, user_id, username, bet, created_at) VALUES (?,?,?,?,?)')
          .run(r.id, me.id, me.username, amount, Math.floor(Date.now() / 1000));
        broadcastAll('gr:av', { type: 'bet', round_no: r.round_no, username: me.username, amount: amount });
        json({ ok: true, gold: me.gold, round_no: r.round_no, amount: amount });
        return;
      }

      if (pathname === '/api/games/av/cashout' && req.method === 'POST') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        const r = groupRounds.av;
        if (!r) { json({ ok: false, message: 'لا جولة نشطة حالياً' }, 404); return; }
        if (r.status !== 'flying') { json({ ok: false, message: 'الجولة ليست في مرحلة الطيران الآن' }, 400); return; }
        const bet = db.prepare('SELECT * FROM group_bets WHERE round_id = ? AND user_id = ? AND cashout_mult IS NULL').get(r.id, me.id);
        if (!bet) { json({ ok: false, message: 'لا يوجد رهان نشط للسحب' }, 400); return; }
        const crashAt = r.outcome && r.outcome.crash_at ? r.outcome.crash_at : Infinity;
        const mult = Math.exp(0.00006 * (Date.now() - r.started_at));
        /* لا يُسمح بالسحب بعد نقطة الانفجار الخادمية أبداً — المعامل لا يتجاوز crashAt */
        if (!isFinite(mult) || mult < 1 || (crashAt !== Infinity && mult >= crashAt)) {
          json({ ok: false, message: 'انفجرت الطائرة قبل السحب — حظاً أوفر' }, 400); return;
        }
        const payout = r2(bet.bet * mult);
        /* [Group] الإضافة في الذاكرة + DB معاً */
        me.gold = (me.gold || 0) + payout;
        try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(me.gold, me.id); } catch (e) {}
        db.prepare('UPDATE group_bets SET cashout_mult = ?, won = 1, payout = ? WHERE id = ?').run(mult, payout, bet.id);
        broadcastAll('gr:av', { type: 'cashout', round_no: r.round_no, username: me.username, mult: mult, payout: payout });
        json({ ok: true, gold: me.gold, payout: payout, mult: mult, amount: bet.bet });
        return;
      }

      /* [Group] سجل الجولات الجماعية المنتهية (ببذرة مكشوفة للتحقق Provably Fair) */
      let gmh;
      if ((gmh = /^\/api\/games\/([\w-]+)\/group-history$/.exec(pathname)) && req.method === 'GET') {
        const gameId = gmh[1];
        if (gameId !== GROUP_KE && gameId !== GROUP_AV) { json({ ok: false, message: 'غير موجود' }, 404); return; }
        const rows = db.prepare("SELECT * FROM group_rounds WHERE game_id = ? AND status = 'finished' ORDER BY id DESC LIMIT 10").all(gameId);
        const out = rows.map(function (r) {
          let outcome = null;
          try { outcome = JSON.parse(r.outcome); } catch (e) { /* ignore */ }
          const agg = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(payout),0) p FROM group_bets WHERE round_id = ? AND won = 1').get(r.id);
          return {
            round_no: r.round_no, seed: r.seed, seed_hash: r.seed_hash,
            outcome: outcome, winners_count: agg.c, total_paid: agg.p, created_at: r.created_at
          };
        });
        json({ ok: true, rounds: out });
        return;
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
        const where = [];
        const params = [];
        if (parsedUrl.query.user_id != null && parsedUrl.query.user_id !== '') {
          const uid = parseInt(parsedUrl.query.user_id, 10);
          if (!isNaN(uid)) { where.push('t.user_id = ?'); params.push(uid); }
        }
        if (parsedUrl.query.type) {
          where.push('t.type = ?'); params.push(String(parsedUrl.query.type));
        }
        const whereSql = where.length ? (' WHERE ' + where.join(' AND ')) : '';
        let total = 0;
        let rows = [];
        try {
          total = db.prepare('SELECT COUNT(*) AS c FROM transactions t' + whereSql).get(...params).c;
          const limit = Math.min(1000, Math.max(1, parseInt(parsedUrl.query.limit, 10) || 200));
          const offset = Math.max(0, parseInt(parsedUrl.query.offset, 10) || 0);
          rows = db.prepare(
            'SELECT t.id, t.user_id, u.username AS username, t.type, t.amount, t.balance_after, t.counterparty_name, t.actor_name, t.game_id, t.note, t.created_at ' +
            'FROM transactions t LEFT JOIN users u ON u.id = t.user_id' + whereSql +
            ' ORDER BY t.id DESC LIMIT ? OFFSET ?'
          ).all(...params, limit, offset);
        } catch (e) {}
        json({ ok: true, total: total, transactions: rows });
        return;
      }

      /* ── الغرف ── */
      if (pathname === '/api/rooms' && req.method === 'GET') {
        const list = Object.values(rooms).filter(function (r) { return r.status === 'waiting' && r.visibility !== 'private'; }).map(function (r) {
          return { id: r.id, code: r.code, game_id: r.game_id, owner_name: r.owner_name, max_players: r.max_players, players_count: r.players.length, status: r.status, bet: r.bet || 0, room_type: r.room_type || null, expires_at: r.expires_at != null ? Number(r.expires_at) : null, visibility: r.visibility === 'private' ? 'private' : 'public' };
        });
        json({ ok: true, rooms: list });
        return;
      }
      if (pathname === '/api/rooms' && req.method === 'POST') {
        /* إنشاء غرفة — الرهان مدفوع إلزامياً (لا غرف مجانية) */
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        /* [Auth] المشرفون (admin/super) لا يفتحون غرفاً كلاعبين ولا يراهنون */
        if (me.role !== 'user') { json({ ok: false, message: 'المشرفون لا يمكنهم الدخول كلاعبين أو المراهنة' }, 403); return; }
        /* [Rooms-unified] نوع واحد فقط: percentage — رسم 5% من رهان الرابح في كل جولة.
           غرف الساعة أُلغيت بطلب المستخدم (2026-09-11). يُقبل الحقل للتوافق مع العملاء القدامى. */
        const room_type = 'percentage';
        const bet = Number(data.bet);
        if (isNaN(bet) || bet <= 0) { json({ ok: false, error: 'bet_required' }, 400); return; }
        const visibility = (data.visibility === 'private') ? 'private' : 'public';   /* [B-rooms] عامة/خاصة */
        /* [BJMP] قائمة الألعاب المسموح بها في الغرف (مطابقة لـ Rooms.roomGameIds في الواجهة) */
        const ROOM_GAMES_ALLOWED = { rp: 1, pn: 1, pr: 1, rn: 1, rm: 1, rd: 1, bj: 1, dm: 1, ch: 1, bg: 1, do: 1, bl8: 1, blbb: 1, blgv: 1, blsn: 1, blca: 1 };   /* [BGDO] الطاولة bg + الضومنة do غرفتان ثنائيتان */
        const gid = data.game_id || 'rm';
        if (!ROOM_GAMES_ALLOWED[gid]) { json({ ok: false, message: 'لعبة غير مدعومة في الغرف' }, 400); return; }
        const maxp = Math.max(2, Math.min(8, parseInt(data.max_players, 10) || 4));
        const rid = 'r' + (nextRoomId++);
        const code = crypto.randomBytes(3).toString('hex').toUpperCase();
        const room = {
          id: rid, code: code, game_id: gid,
          owner_id: me.id, owner_name: me.username,
          max_players: maxp, status: 'waiting', bet: bet, room_type: room_type,
          visibility: visibility,
          expires_at: null,   /* [Rooms-unified] لا حد زمني — الرسم 5% على كل جولة */
          players: [{ id: me.id, username: me.username, ready: false, spectate: false, seat: 0 }],
          moveHistory: [], dedupSeen: {}, driverId: me.id, online: {},
          room_state: {}, chat: [],
          /* [RS-GameOpts] إعدادات اللعبة (نمط 4 لاعبين، هدف، مؤقت...) تُبث للجميع
             وتبقى عبر الانقطاع/الاستئناف */
          game_opts: (data.game_opts && typeof data.game_opts === 'object') ? data.game_opts : null
        };
        rooms[rid] = room;
        markOnline(room, me.id);   /* [Resilience] المنشئ متصل */
        json({ ok: true, room: serializeRoom(room) });
        return;
      }
      if (pathname === '/api/rooms/join') {
        if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
        /* [Auth] المشرفون (admin/super) لا ينضمون كلاعبين ولا يراهنون */
        if (me.role !== 'user') { json({ ok: false, message: 'المشرفون لا يمكنهم الدخول كلاعبين أو المراهنة' }, 403); return; }
        const code = String(data.code || '').toUpperCase();
        const room = Object.values(rooms).find(function (r) { return r.code === code; });
        if (!room) { json({ ok: false, message: 'رمز الغرفة غير موجود' }, 404); return; }
        /* [B-rooms] غرفة ساعة منتهية في الانتظار → لا انضمام جديد (تُحلّ) */
        if (sweepExpiredRoom(room)) { json({ ok: false, message: 'انتهت صلاحية الغرفة' }, 410); return; }
        if (room.status === 'playing' && !room.players.some(function (p) { return p.id === me.id; })) {
          json({ ok: false, message: 'اللعبة بدأت بالفعل' }, 400); return;
        }
        let p = room.players.find(function (x) { return x.id === me.id; });
        if (!p) {
          const nonSpec = room.players.filter(function (x) { return !x.spectate; }).length;
          if (nonSpec >= room.max_players) {
            /* أضف كمشاهد إن امتلأت */
            p = { id: me.id, username: me.username, ready: true, spectate: true, seat: room.players.length };
          } else {
            p = { id: me.id, username: me.username, ready: false, spectate: !!data.spectate, seat: nonSpec };
          }
          room.players.push(p);
        }
        markOnline(room, me.id);   /* [Resilience] اللاعب متصل (SSE فعّال) */
        updateRoom(room);
        json({ ok: true, room: serializeRoom(room) });
        return;
      }
      if (pathname === '/api/rooms/leave') {
        const room = rooms[data.room_id];
        if (room) {
          /* [B-rooms] انتهاء صلاحية غرفة الساعة عند المغادرة: قيد اللعب تُعلَّم فقط */
          sweepExpiredRoom(room);
        }
        if (room && rooms[data.room_id]) {
          /* [Req6] المُنشئ لا يغلق الغرفة حتى ينتهي الرهان الجاري */
          if (room.status === 'playing' && room.owner_id === (me && me.id)) {
            json({ ok: false, message: 'لا يمكن إغلاق الغرفة حتى انتهاء الرهان الجاري — انتظر نهاية المباراة' }, 400);
            return;
          }
          room.players = room.players.filter(function (p) { return p.id !== (me && me.id); });
          delete room.blindPicks;   /* [v2.27] مغادرة أثناء زوج أعمى ⇒ تُبطل الاختيارات المعلقة كلها */
          /* إزالة أي طلب انضمام خاص بالمغادر */
          if (room.joinQueue) room.joinQueue = room.joinQueue.filter(function (r) { return r.id !== (me && me.id); });
          if (room.players.length === 0 || room.owner_id === (me && me.id)) {
            /* خروج المالك يحلّ الغرفة */
            broadcastRoom(room, 'room:update', null);
            delete rooms[room.id];
          } else {
            promoteQueued(room); /* [Spectator] املأ المقعد الشاغر من الطابور */
            tryResolveRematch(room); /* [Req3] مغادرة مشارك = رفض → قد يحلّ التصويت */
            updateRoom(room);
          }
        }
        json({ ok: true });
        return;
      }
      if (pathname === '/api/rooms/ready') {
        const room = rooms[data.room_id];
        if (room && me) {
          /* [B-rooms] فحص انتهاء صلاحية غرفة الساعة عند أي حدث غرفة (جولة منتهية → حُلّت فوراً) */
          if (sweepExpiredRoom(room)) { json({ ok: false, message: 'انتهت صلاحية الغرفة' }, 410); return; }
          const p = room.players.find(function (x) { return x.id === me.id; });
          if (p) p.ready = !!data.ready;
          updateRoom(room);
        }
        json({ ok: true, room: room ? serializeRoom(room) : null });
        return;
      }
      if (pathname === '/api/rooms/start') {
        /* [Auth] المشرفون (admin/super) لا يبدؤون جولات كلاعبين ولا يراهنون */
        if (me && me.role !== 'user') { json({ ok: false, message: 'المشرفون لا يمكنهم الدخول كلاعبين أو المراهنة' }, 403); return; }
        const room = rooms[data.room_id];
        if (room && me && room.owner_id === me.id) {
          /* [B-rooms] لا بدء جولة جديدة في غرفة ساعة منتهية الصلاحية */
          if (sweepExpiredRoom(room)) { json({ ok: false, message: 'انتهت صلاحية الغرفة' }, 410); return; }
          const bet = Number(room.bet) || 0;
          /* [B10] اقتطاع الرهان من كل لاعب غير متفرّج (وليس بوتّاً) عند بدء المباراة */
          const payers = room.players.filter(function (p) { return !p.spectate && users[p.id]; });
          let insufficient = null;
          for (const p of payers) {
            if ((users[p.id].gold || 0) < bet) { insufficient = users[p.id].username; break; }
          }
          if (insufficient) { json({ ok: false, error: 'insufficient_funds', user: insufficient }, 400); return; }
          payers.forEach(function (p) {
            const u = users[p.id];
            u.gold = (u.gold || 0) - bet;
            try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
          });
          room.status = 'playing';
          room.settled = null;   /* [B-settle] جولة جديدة قابلة للتسوية (مسار endBet→start) */
          updateRoom(room);
        }
        json({ ok: true, room: room ? serializeRoom(room) : null });
        return;
      }
      if (pathname === '/api/rooms/spectate') {
        const room = rooms[data.room_id];
        if (room && me) {
          /* [B-rooms] فحص انتهاء صلاحية غرفة الساعة عند أي حدث غرفة */
          if (sweepExpiredRoom(room)) { json({ ok: false, message: 'انتهت صلاحية الغرفة' }, 410); return; }
          let p = room.players.find(function (x) { return x.id === me.id; });
          if (!p) { p = { id: me.id, username: me.username, ready: true, spectate: false, seat: room.players.length }; room.players.push(p); }
          /* [B10] لا يجوز الترقّي من مشاهد إلى لاعب والمقاعد ممتلئة */
          if (!data.spectate && p.spectate) {
            const nonSpec = room.players.filter(function (x) { return !x.spectate && x.id !== me.id; }).length;
            if (nonSpec >= room.max_players) {
              json({ ok: false, message: 'المقاعد ممتلئة — يمكنك المشاهدة فقط' }, 400);
              return;
            }
          }
          p.spectate = !!data.spectate;
          if (data.spectate) p.ready = true;
          updateRoom(room);
        }
        json({ ok: true, room: room ? serializeRoom(room) : null });
        return;
      }
      /* [Spectator] طلب انضمام متفرج: يُضاف للطابور ويُرقّى فوراً إن وُجد مقعد شاغر */
      if (pathname === '/api/rooms/joinRequest') {
        const room = rooms[data.room_id];
        if (room && me) {
          /* [B-rooms] فحص انتهاء الصلاحية عند أي حدث غرفة */
          if (sweepExpiredRoom(room)) { json({ ok: false, message: 'انتهت صلاحية الغرفة' }, 410); return; }
          let p = room.players.find(function (x) { return x.id === me.id; });
          if (!p) { p = { id: me.id, username: me.username, ready: true, spectate: true, seat: room.players.length }; room.players.push(p); }
          if (p.spectate) {
            if (!room.joinQueue) room.joinQueue = [];
            if (!room.joinQueue.some(function (r) { return r.id === me.id; })) {
              room.joinQueue.push({ id: me.id, username: me.username, ts: Date.now() });
            }
            promoteQueued(room);
            updateRoom(room);
          }
        }
        json({ ok: true, room: room ? serializeRoom(room) : null });
        return;
      }
      /* [Req6] انتهاء الرهان: المُنشئ يُعلن نهاية المباراة فتعود الغرفة للانتظار ويصبح الإغلاق ممكناً */
      if (pathname === '/api/rooms/endBet') {
        const room = rooms[data.room_id];
        if (room && me && room.owner_id === me.id && room.status === 'playing') {
          room.status = 'waiting';
          room.players.forEach(function (p) { if (!p.spectate) p.ready = false; });
          /* [B-rooms] انتهت الساعة → حُلّ الغرفة بعد انتهاء الجولة الجارية */
          if (dissolveIfExpired(room)) { json({ ok: true, room: null }); return; }
          updateRoom(room);
        }
        json({ ok: true, room: room ? serializeRoom(room) : null });
        return;
      }

      /* [Req3] بدء تصويت المباراة الجديدة عند نهاية المباراة (المُنشئ) */
      /* [MP-AI] المضيف يضيف لاعباً آلياً لملء مقعد (لاعب آلي يلعب وفق القواعد) */
      /* [Settle] تسوية رهان فلات دوچ بين لاعبَين: يُقتطع من الخاسر ويُضاف للرابح
         بعد اقتطاع رسم الرهان (BET_FEE_RATE). للمالك فقط (نتيجة حتمية). */
      /* [B-settle] تسوية رهان المباريات الحتمية (ضاما/شطرنج — العميل يعرف الفائز): للمضيف فقط.
         result: 'w0'..'w3' فاز صاحب order[seat] (وسّعناها من w0/w1 — كانت ترفض مقاعد
         2-3 فتكسر تسوية الروندا FFA بثلاثة لاعبين) | 'draw' تعادل.
         الرهانات اقتُطعت عند /api/rooms/start — هنا تُوزَّع فقط:
         draw → استرجاع كامل بلا رسوم؛ wN → الرابح يأخذ pot كاملاً بعد رسم 5% (غرف percentage فقط) */
      if (pathname === '/api/rooms/settleRound') {
        const room = rooms[data.room_id];
        if (process.env.DM_TEST_MODE === '1') console.log('[settleRound]', JSON.stringify({ room: data.room_id, result: data.result, owner: me && me.id, game: room && room.game_id }));
        if (!room) { json({ ok: false, message: 'الغرفة غير موجودة' }, 404); return; }
        if (!me || room.owner_id !== me.id) { json({ ok: false, message: 'غير مصرّح — للمضيف فقط' }, 403); return; }
        if (room.status !== 'playing') { json({ ok: false, message: 'لا جولة جارية للتسوية' }, 400); return; }
        if (room.settled) { if (process.env.DM_TEST_MODE === '1') console.log('[settleRound] dup-rejected', data.room_id); json({ ok: false, message: 'تمت تسوية هذه الجولة مسبقاً' }, 400); return; }
        const result = data.result;
        /* [BJMP] w0-w3: مقاعد 0-3 (غرف 2-4 لاعبين) + draw */
        const seatMatch = /^w([0-3])$/.exec(result);
        if (!seatMatch && result !== 'draw') { json({ ok: false, message: 'نتيجة غير صالحة' }, 400); return; }
        const order = serializeRoom(room).order;   /* غير المتفرجين حسب المقعد (بشر + بوتّات) */
        if (seatMatch && Number(seatMatch[1]) >= order.length) { json({ ok: false, message: 'مقعد غير موجود' }, 400); return; }
        if (process.env.DM_TEST_MODE === '1') console.log('[settleRound] proceeding', data.room_id, 'result', result, 'order', JSON.stringify(order));
        const pot = Number(room.bet) || 0;   /* رهان كل لاعب — اقتُطع عند البدء */
        /* اللاعبون البشريون الحقيقيون (البوتّات بلا رصيد تُتجاهل في الحساب) */
        const humans = order.filter(function (pid) { return users[pid]; })
          .map(function (pid) { return users[pid]; });
        let fee = 0;
        if (result === 'draw') {
          /* استرجاع كامل لكل لاعب بشري بلا رسوم */
          if (process.env.DM_TEST_MODE === '1') console.log('[settleRound] DRAW refund', data.room_id, JSON.stringify(humans.map(function (u) { return u.username; })));
          humans.forEach(function (u) {
            u.gold = (u.gold || 0) + pot;
            try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
          });
        } else {
          const wIdx = Number(seatMatch[1]);
          const winner = order[wIdx] != null ? users[order[wIdx]] : null;
          if (!winner) { if (process.env.DM_TEST_MODE === '1') console.log('[settleRound] bot-winner rejected', data.room_id); json({ ok: false, message: 'الرابح لاعب آلي أو غير موجود — لا تسوية' }, 400); return; }
          /* المال الفعلي على الطاولة: رهانات البشريين فقط (رهان الخصم البوتّي لا يُخلق من فراغ) */
          const stake = humans.length * pot;
          /* الرسم: 5% من رهان الرابح في كل الجولات (نظام موحد — لا غرف ساعة بعد الآن) */
          fee = r2(pot * BET_FEE_RATE);   /* [Decimal] تقريب منزلتين (نظام سام v2.21) */
          if (process.env.DM_TEST_MODE === '1') console.log('[settleRound] WIN payout', data.room_id, winner.username, 'stake', stake, 'fee', fee);
          winner.gold = (winner.gold || 0) + (stake - fee);
          try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(winner.gold, winner.id); } catch (e) {}
        }
        room.settled = true;   /* منع تكرار التسوية للجولة نفسها */
        const shape = function (u) { return u ? { id: u.id, username: u.username, gold: u.gold } : null; };
        const wSeat = seatMatch ? Number(seatMatch[1]) : -1;
        const winnerOut = (wSeat >= 0) ? shape(users[order[wSeat]]) : null;
        const loserOut = (wSeat === 0) ? shape(users[order[1]]) : (wSeat === 1 ? shape(users[order[0]]) : null);   /* بلا خاسر محدد في FFA متعدد المقاعد */
        const refunds = (result === 'draw') ? humans.map(function (u) { return shape(u); }) : [];
        const payout = (result === 'draw') ? pot : r2((humans.length * pot) - fee);
        const payload = {
          ok: true, result: result, pot: pot, fee: fee,
          winner: winnerOut, loser: loserOut, refunds: refunds,
          dissolved: false, payout: payout
        };
        /* بثّ التسوية لكل أعضاء الغرفة (لاعبين + متفرجين) — العميل يزامن الأرصدة ويغلق عند dissolved */
        broadcastRoom(room, 'room:settle', payload);
        /* غرفة الساعة منتهية الصلاحية → تُحلّ بعد التسوية مباشرة */
        if (dissolveIfExpired(room)) payload.dissolved = true;
        json(payload);
        return;
      }
      /* [RDC-team] تسوية رهان روندا 2ضد2 (فرق): تُقسَّم أرباح الرهان بين
         أعضاء الفريق الفائز (لكل فائز حصته بالتساوي من رهانات البشر).
         result: 't0' فاز فريق المقاعد 0 و2 | 't1' فريق المقاعد 1 و3.
         البوتّات بلا رصيد تُتجاهل في الحساب؛ الرسم 5% لغرف percentage فقط. */
      if (pathname === '/api/rooms/settleTeamRound') {
        const room = rooms[data.room_id];
        if (!room) { json({ ok: false, message: 'الغرفة غير موجودة' }, 404); return; }
        if (!me || room.owner_id !== me.id) { json({ ok: false, message: 'غير مصرّح — للمضيف فقط' }, 403); return; }
        if (room.status !== 'playing') { json({ ok: false, message: 'لا جولة جارية للتسوية' }, 400); return; }
        if (room.settled) { json({ ok: false, message: 'تمت تسوية هذه الجولة مسبقاً' }, 400); return; }
        const result = data.result;
        if (result !== 't0' && result !== 't1') { json({ ok: false, message: 'نتيجة غير صالحة' }, 400); return; }
        const order = serializeRoom(room).order;   /* ترتيب مقاعد محرك الروندا */
        if (order.length !== 4) { json({ ok: false, message: 'تسوية الفرق لـ 4 مقاعد فقط' }, 400); return; }
        const bet = Number(room.bet) || 0;
        const winSeats = (result === 't0') ? [0, 2] : [1, 3];   /* teamId = مقعد % 2 */
        const loseSeats = (result === 't0') ? [1, 3] : [0, 2];
        const humanOf = function (pid) { return (pid != null && users[pid]) ? users[pid] : null; };
        const winners = winSeats.map(function (i) { return humanOf(order[i]); }).filter(Boolean);
        const losers = loseSeats.map(function (i) { return humanOf(order[i]); }).filter(Boolean);
        if (!winners.length) { json({ ok: false, message: 'الفريق الفائز آلي بالكامل — لا تسوية' }, 400); return; }
        const humansAll = order.map(function (pid) { return humanOf(pid); }).filter(Boolean);
        /* المال الفعلي على الطاولة = رهانات البشريين فقط */
        const stake = humansAll.length * bet;
        /* الرسم: 5% من رهان كل رابح (نظام موحد) */
        const fee = r2(bet * BET_FEE_RATE * winners.length);
        const net = r2(stake - fee);
        const share = r2(net / winners.length);
        let remainder = net - share * winners.length;
        winners.forEach(function (u) {
          const add = share + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder--;
          u.gold = (u.gold || 0) + add;
          try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
          u._rdShare = add;
        });
        room.settled = true;
        const shape = function (u) {
          return u ? { id: u.id, username: u.username, gold: u.gold, share: u._rdShare || 0 } : null;
        };
        const payload = {
          ok: true, result: result, pot: bet, fee: fee, payout: net, teamSplit: true,
          winners: winners.map(shape), losers: losers.map(shape), refunds: [],
          dissolved: false
        };
        broadcastRoom(room, 'room:settle', payload);
        if (dissolveIfExpired(room)) payload.dissolved = true;
        json(payload);
        return;
      }
      if (pathname === '/api/rooms/settle') {
        const room = rooms[data.room_id];
        const isHost = room && me && room.owner_id === me.id;
        if (!isHost || !data.loser || !data.winner) { json({ ok: false, message: 'غير مصرّح' }, 403); return; }
        const amt = parseInt(data.amount, 10);
        if (isNaN(amt) || amt <= 0) { json({ ok: false, message: 'مبلغ غير صالح' }, 400); return; }
        const loser = Object.values(users).find(function (u) { return u.username === data.loser; });
        const winner = Object.values(users).find(function (u) { return u.username === data.winner; });
        if (!loser || !winner) { json({ ok: false, message: 'لاعب غير موجود' }, 400); return; }
        if ((loser.gold || 0) < amt) { json({ ok: false, message: 'رصيد الخاسر غير كافٍ' }, 400); return; }
        /* الرسم الموحد: 5% من المبلغ المحوّل */
        const fee = Math.round(amt * BET_FEE_RATE);
        loser.gold = (loser.gold || 0) - amt;
        winner.gold = (winner.gold || 0) + (amt - fee);
        /* [server-tx] تسوية الغرفة في سجل المعاملات DB (win للفائز / bet للخاسر) */
        try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(loser.gold, loser.id); } catch (e) {}
        try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(winner.gold, winner.id); } catch (e) {}
        logTx(winner, 'win', amt - fee, { game_id: room.game_id, counterparty_id: loser.id, counterparty_name: loser.username, balance_after: winner.gold });
        logTx(loser, 'bet', amt, { game_id: room.game_id, counterparty_id: winner.id, counterparty_name: winner.username, note: 'خسارة جولة', balance_after: loser.gold });
        json({ ok: true, fee: fee, loser: { username: loser.username, gold: loser.gold }, winner: { username: winner.username, gold: winner.gold } });
        return;
      }
      /* [Timeout] انتهاء مهلة المتخمّن: يُصبح متفرجاً ويُرقّى متفرج من الطابور لمقعده */
      if (pathname === '/api/rooms/timeoutSeat') {
        const room = rooms[data.room_id];
        const isHost = room && me && room.owner_id === me.id;
        if (!isHost || data.playerId == null) { json({ ok: false, message: 'غير مصرّح' }, 403); return; }
        const p = room.players.find(function (x) { return String(x.id) === String(data.playerId) && !x.spectate; });
        if (p) { p.spectate = true; p.ready = true; }
        promoteQueued(room);
        updateRoom(room);
        json({ ok: true, room: room ? serializeRoom(room) : null });
        return;
      }
      /* [Policy 2026-09-16] أُزيل الآليون من الغرف: الغرف حصرية للرهان واللعب
         وجه لوجه بين البشر؛ التدريب ضد الآلي مجاني خارج الغرف وبلا تسجيل. */
      if (pathname === '/api/rooms/addBot' || pathname === '/api/rooms/removeBot') {
        json({ ok: false, message: 'الغرف حصرية للاعبين البشر — التدريب ضد الآلي من شاشة اللعبة' }, 403);
        return;
      }
      if (pathname === '/api/rooms/rematch/start') {
        const room = rooms[data.room_id];
        const mePart = room && me && room.players.some(function (p) { return p.id === me.id && !p.spectate; });
        if (mePart && !room.rematch) {
          /* [B-rooms] انتهت الساعة: في الانتظار تُحلّ فوراً؛ والجاري جولته تُعلَّم فقط وتُحلّ عند حلّ التصويت */
          if (sweepExpiredRoom(room)) { json({ ok: true, room: null }); return; }
          const parts = room.players.filter(function (p) { return !p.spectate; });
          const names = {};
          parts.forEach(function (p) { names[p.id] = p.username; });
          room.rematch = { participants: parts.map(function (p) { return p.id; }), votes: {}, names: names, ts: Date.now() };
          room.status = 'waiting';           /* انتهى الرهان → يُسمح بالإغلاق (بند 6) */
          updateRoom(room);
          /* مهلة أمان 60ث: من لم يقرّر يُعدّ رافضاً ثم الحلّ */
          const rid = room.id;
          setTimeout(function () {
            const r = rooms[rid];
            if (r && r.rematch && !r.rematch.resolved) {
              r.rematch.participants.forEach(function (id) { if (!r.rematch.votes[id]) r.rematch.votes[id] = 'refuse'; });
              if (tryResolveRematch(r)) updateRoom(r);
              /* [B-rooms] صلاحية منتهية بعد رفض المباراة الجديدة → حُلّ الغرفة */
              if (r.rematch && r.rematch.resolved && !r.rematch.rematch) dissolveIfExpired(r);
            }
          }, 60000);
        }
        json({ ok: true, room: room ? serializeRoom(room) : null });
        return;
      }
      /* [Req3] تصويت مشارك: موافقة/رفض المباراة الجديدة */
      if (pathname === '/api/rooms/rematch/vote') {
        const room = rooms[data.room_id];
        if (room && me && room.rematch && !room.rematch.resolved && room.rematch.participants.indexOf(me.id) !== -1) {
          room.rematch.votes[me.id] = (data.vote === 'agree') ? 'agree' : 'refuse';
          if (tryResolveRematch(room)) updateRoom(room); else updateRoom(room);
          /* [B-rooms] انتهت الساعة مع رفض المباراة الجديدة (لا جولة جارية) → حُلّ الغرفة */
          if (room.rematch && room.rematch.resolved && !room.rematch.rematch && rooms[room.id]) {
            if (dissolveIfExpired(room)) { json({ ok: true, room: null }); return; }
          }
        }
        json({ ok: true, room: room ? serializeRoom(room) : null });
        return;
      }

      /* [Req7] بثّ رمز تعبيري/تفاعل لكل أعضاء الغرفة (لاعبين + متفرجين) */
      if (pathname === '/api/rooms/react') {
        const room = rooms[data.room_id];
        if (room && me) {
          const emoji = String(data.emoji || '').slice(0, 16);
          broadcastRoom(room, 'room:react', { room_id: room.id, emoji: emoji, from_id: me.id, from_name: me.username, ts: Date.now() });
        }
        json({ ok: true });
        return;
      }

      /* [Req8] بثّ رسالة صوتية (≤10ث) لكل أعضاء الغرفة */
      if (pathname === '/api/rooms/voice') {
        if (isMuted(me)) { json({ ok: false, message: 'موقوف عن التعليق الصوتي', muted_until: me.muted_until }, 403); return; }
        const room = rooms[data.room_id];
        if (room && me) {
          let audio = String(data.audio || '');
          /* حدّ أمان: لا تقبل رسائل صوتية أكبر من ~700KB */
          if (audio.length > 980000) audio = '';
          const dur = Math.max(0, Math.min(10, parseInt(data.dur, 10) || 0));
          if (audio) broadcastRoom(room, 'room:voice', { room_id: room.id, audio: audio, dur: dur, from_id: me.id, from_name: me.username, ts: Date.now() });
        }
        json({ ok: true });
        return;
      }

      if (pathname === '/api/rooms/move') {
        const room = rooms[data.room_id];
        if (room) {
          /* [v2.27 blindResult] اختيار أعمى زوجي (pn/rp): القيمة لا تُبث أبداً.
             كل مختار يستقبل 'blind' بلا قيمة (الخصم اختار)، وعند اكتمال زوج
             اللاعبين النشطين يُبث 'blindResult' بخريطة dirs معاً — عدالة وجهاً لوجه.
             (كانت القيمة تُبث فوراً فيقرأها الخصم قبل اختياره — الفجوة الموثقة في GITHUB_SYNC) */
          if (data.action === 'blind') {
            if (!me) { json({ ok: false, message: 'يلزم تسجيل الدخول' }, 401); return; }
            const inRoom = room.players.some(function (p) { return p.id === me.id && !p.spectate; });
            if (!inRoom) { json({ ok: false, message: 'لست لاعباً نشطاً في الغرفة' }, 403); return; }
            if (!room.blindPicks) room.blindPicks = {};
            const pv = (data.data && data.data.d !== undefined) ? data.data.d : (data.data || {});
            room.blindPicks[me.id] = pv;
            broadcastRoom(room, 'room:move', { room_id: room.id, action: 'blind', data: {}, from_id: me.id });
            const active = room.players.filter(function (p) { return !p.spectate; });
            if (active.length >= 2 && active.every(function (p) { return room.blindPicks[p.id] !== undefined; })) {
              const dirs = {};
              active.forEach(function (p) { dirs[p.id] = room.blindPicks[p.id]; });
              delete room.blindPicks;   /* الجولة التالية تبدأ نظيفة */
              broadcastRoom(room, 'room:move', { room_id: room.id, action: 'blindResult', data: { dirs: dirs }, from_id: null });
            }
            json({ ok: true, room: serializeRoom(room) });
            return;
          }
          if (data.state !== undefined && data.state !== null) room.room_state = data.state;
          const payload = data.data || {};
          /* [Resilience] تسجيل تاريخ الحركات لإعادة بناء حالة العائد */
          if (data.action === 'rmove' && payload && payload.action) {
            const dedupKey = payload.dedup;
            if (dedupKey) {
              if (!room.dedupSeen) room.dedupSeen = {};
              if (room.dedupSeen[dedupKey]) { json({ ok: true, room: serializeRoom(room) }); return; }  /* مكرَّر — تجاهله */
              room.dedupSeen[dedupKey] = 1;
            }
            if (!room.moveHistory) room.moveHistory = [];
            room.moveHistory.push(payload);
            if (room.moveHistory.length > 2000) room.moveHistory.shift();
          }
          broadcastRoom(room, 'room:move', { room_id: room.id, action: data.action, data: payload, from_id: me ? me.id : null });
          json({ ok: true, room: serializeRoom(room) });
        } else {
          json({ ok: false, message: 'الغرفة غير موجودة' }, 404);
        }
        return;
      }
      const chatMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/chat$/);
      if (chatMatch && req.method === 'GET') {
        const room = rooms[chatMatch[1]];
        const msgs = room ? room.chat.slice(-100) : [];
        json({ ok: true, messages: msgs });
        return;
      }
      if (pathname === '/api/rooms/chat') {
        if (isMuted(me)) { json({ ok: false, message: 'موقوف عن المراسلة', muted_until: me.muted_until }, 403); return; }
        const room = rooms[data.room_id];
        if (room) {
          const msg = {
            room_id: data.room_id, text: data.text || '',
            from_id: me ? me.id : null, from_name: me ? me.username : 'زائر',
            to_id: data.to != null ? Number(data.to) : null,
            to_name: '', created_at: Date.now()
          };
          if (data.to != null) {
            const to = room.players.find(function (x) { return x.id === Number(data.to); });
            if (to) msg.to_name = to.username;
          }
          room.chat.push(msg);
          if (room.chat.length > 200) room.chat.shift();
          broadcastRoom(room, 'room:chat', msg);
          json({ ok: true, msg: msg });
        } else {
          json({ ok: false, message: 'الغرفة غير موجودة' }, 404);
        }
        return;
      }

      // Default API fallback
      json({ ok: false, error: 'not_found', path: pathname }, 404);
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

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + pathname);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

/* ── [Group] تشغيل حلقتي جولات كينو وكراش الجماعية ── */
groupStartAll();

server.listen(PORT, '0.0.0.0', () => {
  console.log('DTSG (Digital Traditional Skills Games) Live Server running at http://0.0.0.0:' + PORT);
});
