'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — بوت المالية للسوپر أدمن (Financials Bot Engine)  v2.66.0
   @dtsgfinancials_bot  ⟷  نفس قاعدة SQLite (royalcoin.db) التي يقرأها داشبورد
                            السوپر أدمين في المنصة — حرفياً نفس خصائصه:

   لوحة السوپر أدمين (js/main.js)          ←  ما يقابله في البوت
   ─────────────────────────────────────────────────────────────────────────
   تبويب «المالية» (stats + pending)        ←  /stats · /pending (+ أزرار ✅/❌)
   سجل الشحن/السحب (pay_transactions)      ←  /deposits · /withdrawals
   تبويب «المستخدمون» (سجلات المستخدمين)   ←  /users · /user · /search
   تبويب «السجلات» (السجل المدمج 3 مصادر)  ←  /log [نوع] [صفحة]
   تبويب «سجل المال» (money_log + مجاميع)  ←  /money
   إحصاءات الألعاب المالية                 ←  /games
   شحن/خصم/ضبط الرصيد (users tab)          ←  /charge · /deduct · /setbalance

   الصلاحية: السوپر أدمن **حصراً** (FINANCIALS_SUPER_TG أو TELEGRAM_ADMIN_CHAT_ID).
   أي محادثة أخرى ⇒ رفض قاطع + قيد تدقيق — لا يُكشف أي رقم أو سجل.
   كل الأفعال المالية تُنفَّذ بنفس دوال الداشبورد (pay.adminApprove / pay.adminReject
   + نفس منطق charge/deduct/set_balance في server.js عبر خطاف logTx نفسه).

   الجداول: fin_audit (قيد تدقيق البوت — يُنشأ تلقائياً)

   الأسرار من البيئة:
     FINANCIALS_BOT_TOKEN · FINANCIALS_WEBHOOK_SECRET
     FINANCIALS_SUPER_TG (افتراضي: TELEGRAM_ADMIN_CHAT_ID)
     FINANCIALS_BOT_USERNAME (افتراضي: dtsgfinancials_bot)
     FINANCIALS_TG_API (اختباري — افتراضي https://api.telegram.org)
   ═══════════════════════════════════════════════════════════════════════════ */

const MAXLEN = 3900;                             /* حدّ تيليغرام الفعلي 4096 */
const PAGE = 8;                                  /* صفوف سجل في الرسالة */
const USERS_PAGE = 10;                           /* مستخدمين في الرسالة */
const MONEY_LIMIT = 200;                         /* نفس حدّ داشبورد سجل المال */

let CTX = null;   /* { db, users, sessions, hooks: { pay, logTx, notifyUser } } */

/* ── أدوات عامة ── */
const now = () => Date.now();
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function cut(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function fmt(n) { return Number(n || 0).toLocaleString('ar-MA'); }
function usd(n) { return Number(n || 0).toFixed(2) + ' $'; }
function apiBase() { return (process.env.FINANCIALS_TG_API || 'https://api.telegram.org').replace(/\/$/, ''); }
function token() { return process.env.FINANCIALS_BOT_TOKEN || ''; }
function botUsername() { return process.env.FINANCIALS_BOT_USERNAME || 'dtsgfinancials_bot'; }
function superTg() { return String(process.env.FINANCIALS_SUPER_TG || process.env.TELEGRAM_ADMIN_CHAT_ID || ''); }

/* تحويل طوابع الزمن المخزنة (مللي/ثوانٍ/نص 'YYYY-MM-DD HH:MM:SS') إلى ثوانٍ عددية */
function toSeconds(v) {
  if (typeof v === 'number' && isFinite(v)) return v >= 1e12 ? Math.floor(v / 1000) : v;
  if (typeof v === 'string') {
    if (/^\d+$/.test(v)) { const n = Number(v); return n >= 1e12 ? Math.floor(n / 1000) : n; }
    const p = Date.parse(String(v).replace(' ', 'T') + 'Z');
    return isFinite(p) ? Math.floor(p / 1000) : 0;
  }
  return 0;
}
/* تحويل طوابع الزمن المخزنة (مللي/ثوانٍ/نص 'YYYY-MM-DD HH:MM:SS') إلى نص عربي قصير */
function ts(v) {
  let t = 0;
  if (typeof v === 'number' && isFinite(v)) t = v;
  else if (typeof v === 'string') {
    if (/^\d+$/.test(v)) t = Number(v);
    else { const p = Date.parse(String(v).replace(' ', 'T') + 'Z'); t = isFinite(p) ? p : 0; }
  }
  if (!t) return '—';
  if (t < 1e12) t = t * 1000;                    /* ثوانٍ → مللي */
  try { return new Date(t).toLocaleString('ar-MA', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return '—'; }
}
function ago(v) {
  const t = toSeconds(v) * 1000;
  if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return 'منذ ' + m + ' د';
  if (m < 1440) return 'منذ ' + Math.round(m / 60) + ' س';
  return 'منذ ' + Math.round(m / 1440) + ' ي';
}

/* ── عميل تيليغرام ── */
async function tg(method, body) {
  if (!token()) return null;
  try {
    const r = await fetch(apiBase() + '/bot' + token() + '/' + method, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {})
    });
    return await r.json();
  } catch (e) { return null; }
}
async function send(chat, text, extra) {
  if (!chat) return null;
  const body = Object.assign({ chat_id: String(chat), text: cut(text, MAXLEN), parse_mode: 'HTML', disable_web_page_preview: true }, extra || {});
  return tg('sendMessage', body);
}
function kb(rows) { return { inline_keyboard: rows }; }

/* ── لوحة الأزرار الثابتة (نفس أقسام داشبورد السوپر أدمين) ── */
const MENU = {
  keyboard: [
    [{ text: '📊 الإحصاءات' }, { text: '⏳ الطلبات المعلقة' }],
    [{ text: '📥 سجل الشحن' }, { text: '💸 سجل السحب' }],
    [{ text: '👥 سجلات المستخدمين' }, { text: '📜 جميع السجلات' }],
    [{ text: '💰 سجل المال' }, { text: '🎮 إحصاءات الألعاب' }]
  ],
  resize_keyboard: true
};

/* ── قاعدة البيانات: قيد التدقيق ── */
function initFinancials(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER, actor_tg TEXT, action TEXT, detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_fin_audit_ts ON fin_audit(ts);
    /* [v2.73] الشريط الإشهاري: رسالة المنصة الحالية (meta.platform_news)
       — ينشئ الجدول إن غاب (المنصة تنشئه في محور الغرف على أي حال) */
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  return true;
}

/* ═══ [v2.73] الشريط الإشهاري — رسالة إخبارية/إشهارية للمنصة ═══
   يكتبها السوبر أدمن من هنا (/news) فتظهر في الشريط الإشهاري للمنصة عبر
   /api/promotions (مصدر العروض والشريط الموحّد) — تُقرأ كل 5 دقائق أو عند
   التحميل، بلا بيانات مستخدم إطلاقاً (نص عام قابل للعرض للجميع). */
const NEWS_KEY = 'platform_news';
const NEWS_MAX = 200;
function newsGet() {
  try {
    const row = CTX.db.prepare('SELECT value FROM meta WHERE key = ?').get(NEWS_KEY);
    if (!row || !row.value) return null;
    const j = JSON.parse(row.value);
    if (!j || !j.text || !String(j.text).trim()) return null;
    return { text: String(j.text).trim().slice(0, NEWS_MAX), at: Number(j.at) || 0, by: j.by || null };
  } catch (e) { return null; }
}
function newsSet(text, by) {
  const clean = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, NEWS_MAX);
  if (!clean) return false;
  CTX.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(NEWS_KEY,
    JSON.stringify({ text: clean, at: now(), by: by || null }));
  return true;
}
function newsClear() {
  try { CTX.db.prepare('DELETE FROM meta WHERE key = ?').run(NEWS_KEY); } catch (e) {}
  return true;
}
function setCtx(db, users, sessions, hooks) {
  CTX = { db: db, users: users || {}, sessions: sessions || {}, hooks: hooks || {} };
}
function audit(actorTg, action, detail) {
  try { CTX.db.prepare('INSERT INTO fin_audit (ts, actor_tg, action, detail) VALUES (?,?,?,?)')
    .run(now(), String(actorTg || ''), String(action || ''), cut(String(detail || ''), 500)); } catch (e) {}
}

/* ── [سجل مالي محلي] نفس INSERT الداشبورد (server.js logTx) — احتياط إن غاب الخطاف ── */
function logTxLocal(user, type, amount, extra) {
  try {
    const ex = extra || {};
    CTX.db.prepare(
      'INSERT INTO transactions (user_id, type, amount, balance_after, counterparty_id, counterparty_name, actor_id, actor_name, game_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(
      user.id, String(type || ''), Math.round(Number(amount || 0) * 100) / 100,
      (ex.balance_after != null) ? (Math.round(Number(ex.balance_after) * 100) / 100) : null,
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
function logTx(user, type, amount, extra) {
  if (CTX && CTX.hooks && typeof CTX.hooks.logTx === 'function') {
    try { CTX.hooks.logTx(user, type, amount, extra); return; } catch (e) {}
  }
  logTxLocal(user, type, amount, extra);
}
async function notifyUser(userId, text) {
  if (CTX && CTX.hooks && typeof CTX.hooks.notifyUser === 'function') {
    try { return await CTX.hooks.notifyUser(userId, text); } catch (e) { return false; }
  }
  return false;
}

/* ═══════════ قرائن البيانات — نفس استعلامات داشبورد السوپر أدمين حرفياً ═══════════ */

/* [fin tab] بطاقات /api/admin/stats — المستخدمون/النشط/الذهب */
function statsData() {
  const all = Object.values(CTX.users || {});
  return {
    users_total: all.length,
    active_today: all.filter(function (u) { return u.last_seen && (Date.now() / 1000 - u.last_seen) < 86400; }).length,
    gold_total: all.reduce(function (s, u) { return s + (u.gold || 0); }, 0),
    banned: all.filter(function (u) { return u.banned; }).length
  };
}

/* [fin tab] /api/admin/stats/games — من رهانات الجولات الجماعية (نفس SQL) */
function gamesStats() {
  let rows = [];
  try {
    rows = CTX.db.prepare('SELECT r.game_id AS game_id, COUNT(b.id) AS plays, SUM(CASE WHEN b.won = 1 THEN 1 ELSE 0 END) AS wins, COALESCE(SUM(CASE WHEN b.won = 1 THEN b.payout ELSE 0 END),0) AS coins_won FROM group_bets b JOIN group_rounds r ON r.id = b.round_id GROUP BY r.game_id').all();
  } catch (e) {}
  return (rows || []).map(function (g) { return { game_id: g.game_id, plays: g.plays || 0, wins: g.wins || 0, coins_won: g.coins_won || 0 }; });
}

/* [fin tab] الطلبات المعلّقة — pay.listPending نفسه */
function pendingData() {
  if (CTX.hooks && CTX.hooks.pay && typeof CTX.hooks.pay.listPending === 'function') {
    try { return CTX.hooks.pay.listPending(60) || []; } catch (e) { return []; }
  }
  try { return CTX.db.prepare("SELECT id, user_id, type, amount_usd, method, status, proof_details, created_at FROM pay_transactions WHERE status = 'pending' ORDER BY id DESC LIMIT 60").all(); }
  catch (e) { return []; }
}
function userNameOf(uid) {
  const u = CTX.users[Number(uid)] || Object.values(CTX.users).find(function (x) { return String(x.id) === String(uid); });
  return u ? (u.username || ('#' + uid)) : ('#' + uid);
}

/* [سجل الشحن/السحب] pay_transactions حسب النوع — صفحة + مجموع الصفحة المقطوعة
   [DB-Audit 2026-09-28] SELECT * بدل ذكر reviewed_by صراحةً: العمود مُضاف بـ ALTER
   (v2.41.1) فقد يغيب في قاعدة قديمة — SELECT * لا يفشل والعرض يتجنبه إن غاب. */
function payList(type, page) {
  let total = 0;
  try { const r = CTX.db.prepare("SELECT COUNT(*) c FROM pay_transactions WHERE type = ?").get(type); total = r ? Number(r.c || 0) : 0; } catch (e) {}
  let rows = [];
  try {
    rows = CTX.db.prepare(
      "SELECT * FROM pay_transactions WHERE type = ? ORDER BY id DESC LIMIT ? OFFSET ?"
    ).all(type, PAGE, (page - 1) * PAGE);
  } catch (e) {}
  return { rows: rows || [], total: total };
}
function payTotals() {
  const t = { dep_usd: 0, wd_usd: 0, dep_n: 0, wd_n: 0, pend_n: 0 };
  try {
    const d = CTX.db.prepare("SELECT COUNT(*) c, COALESCE(SUM(amount_usd),0) s FROM pay_transactions WHERE type = 'deposit' AND status = 'completed'").get();
    t.dep_n = Number(d.c || 0); t.dep_usd = Number(d.s || 0);
    const w = CTX.db.prepare("SELECT COUNT(*) c, COALESCE(SUM(amount_usd),0) s FROM pay_transactions WHERE type = 'withdrawal' AND status = 'completed'").get();
    t.wd_n = Number(w.c || 0); t.wd_usd = Number(w.s || 0);
    const p = CTX.db.prepare("SELECT COUNT(*) c FROM pay_transactions WHERE status = 'pending'").get();
    t.pend_n = Number(p.c || 0);
  } catch (e) {}
  return t;
}

/* [users tab] سجلات المستخدمين — نفس حقول /api/admin/users (سوپر: الجميع) */
function usersList(q, page) {
  let all = Object.values(CTX.users);
  if (q) {
    const ql = String(q).toLowerCase();
    all = all.filter(function (u) {
      return (u.username || '').toLowerCase().indexOf(ql) >= 0 || String(u.id) === String(q);
    });
  }
  all.sort(function (a, b) { return b.gold - a.gold; });
  const total = all.length;
  const rows = all.slice((page - 1) * USERS_PAGE, (page - 1) * USERS_PAGE + USERS_PAGE);
  return { rows: rows, total: total };
}
function findUser(q) {
  const id = Number(q);
  if (id && CTX.users[id]) return CTX.users[id];
  const ql = String(q).toLowerCase().replace(/^@/, '');
  return Object.values(CTX.users).find(function (u) { return (u.username || '').toLowerCase() === ql; }) || null;
}

/* [logs tab] السجل المدمج — نفس دمج /api/admin/transactions الثلاثي المصادر:
   transactions + bet_tickets (رهان/فوز) + pay_transactions (شحن/سحب بالدولار) */
function mergedLog(type, page, uid) {
  const out = [];
  /* أ) معاملات الرصيد الكلاسيكية */
  if (type !== 'deposit' && type !== 'withdrawal') {
    const where = []; const params = [];
    if (uid) { where.push('t.user_id = ?'); params.push(uid); }
    if (type) { where.push('t.type = ?'); params.push(type); }
    const whereSql = where.length ? (' WHERE ' + where.join(' AND ')) : '';
    try {
      const rowsTx = CTX.db.prepare(
        'SELECT t.id, t.user_id, u.username AS username, t.type, t.amount, t.balance_after, t.counterparty_name, t.actor_name, t.game_id, t.note, t.created_at ' +
        'FROM transactions t LEFT JOIN users u ON u.id = t.user_id' + whereSql +
        ' ORDER BY t.id DESC LIMIT 1000'
      ).all(...params);
      for (const r of rowsTx) out.push(r);
    } catch (e) {}
  }
  /* ب) تذاكر الرهان (bet_tickets): رهان + فوز */
  if (type === '' || type === 'bet' || type === 'win') {
    const where = []; const params = [];
    if (uid) { where.push('tk.user_id = ?'); params.push(uid); }
    const whereSql = where.length ? (' WHERE ' + where.join(' AND ')) : '';
    try {
      const rowsTk = CTX.db.prepare(
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
    const where = ["p.type IN ('deposit','withdrawal')"]; const params = [];
    if (uid) { where.push('p.user_id = ?'); params.push(String(uid)); }
    if (type) { where.push('p.type = ?'); params.push(type); }
    try {
      const rowsPay = CTX.db.prepare(
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
          /* [DB-Audit 2026-09-28] pay.created_at قد يكون نص 'YYYY-MM-DD HH:MM:SS' —
             نحلّه إلى ثوانٍ (الداشبورد يتركه 0 فيرتّب أسفل السجل — هنا نصلح الترتيب) */
          created_at: toSeconds(p.created_at), src: 'pay'
        });
      }
    } catch (e) {}
  }
  out.sort(function (a, b) { return ((Number(b.created_at) || 0) - (Number(a.created_at) || 0)) || String(a.id).localeCompare(String(b.id)); });
  const total = out.length;
  return { rows: out.slice((page - 1) * PAGE, (page - 1) * PAGE + PAGE), total: total };
}

/* [money tab] سجل المال — money_log + المجاميع (نفس حسابات الداشبورد) */
function moneyLogData(page) {
  let rows = [];
  try { rows = CTX.db.prepare('SELECT m.*, u.username FROM money_log m LEFT JOIN users u ON u.id = CAST(m.user_id AS INTEGER) ORDER BY m.id DESC LIMIT ?').all(MONEY_LIMIT); } catch (e) {}
  rows = rows || [];
  const totals = rows.reduce(function (a, t) {
    const c = Number(t.coins || 0);
    if (t.kind === 'deposit' && t.status === 'completed') a.dep += Number(t.usd || t.amount_usd || 0);
    if (t.kind === 'withdrawal' && t.status === 'completed') a.wd += Number(t.usd || t.amount_usd || 0);
    if (c > 0) a.in += c; if (c < 0) a.out += c;
    return a;
  }, { dep: 0, wd: 0, in: 0, out: 0 });
  const pageRows = rows.slice((page - 1) * PAGE, (page - 1) * PAGE + PAGE);
  return { rows: pageRows, total: rows.length, totals: totals };
}

/* تسميات الأنواع — نفس خريطة الداشبورد txTypeLabel */
function txTypeLabel(ty) {
  const map = {
    deposit: '📥 شحن', withdrawal: '💸 سحب', bet: '🎯 رهان', win: '🏆 فوز',
    transfer_out: '📤 تحويل صادر', transfer_in: '📥 تحويل وارد', charge: '⚡ شحن يدوي',
    deduct: '⚙️ خصم', set_balance: '🛠 ضبط رصيد', referral_bonus: '🎁 مكافأة إحالة',
    claim: '🪙 مطالبة'
  };
  return map[ty] || String(ty || '—');
}
function txAmountSign(ty, amount) {
  const pos = { win: 1, transfer_in: 1, charge: 1, referral_bonus: 1, claim: 1 };
  const neg = { bet: 1, transfer_out: 1, deduct: 1 };
  if (pos[ty]) return '+ 🪙 ' + fmt(amount);
  if (neg[ty]) return '− 🪙 ' + fmt(amount);
  if (ty === 'set_balance') return '= 🪙 ' + fmt(amount);
  return '🪙 ' + fmt(amount);
}
const LOG_TYPES = ['', 'deposit', 'withdrawal', 'bet', 'win', 'transfer_out', 'transfer_in', 'charge', 'deduct', 'set_balance', 'referral_bonus', 'claim'];
const statusLbl = { completed: '✅', pending: '⏳', rejected: '❌', approved: '✅', issued: '🎟️', note: 'ℹ️' };
const methodLbl = {
  sellix: 'Sellix', cryptomus: 'Cryptomus', binance_pay: 'Binance Pay', binance: 'Binance (TRC20)',
  binance_readonly: 'Binance Pay (تحقّق تلقائي)', cih: 'CIH Bank', orange_money: 'Orange Money',
  cash_plus: 'Cash Plus', voucher: 'كود تعبئة'
};

/* ═══════════ الأوامر ═══════════ */

const HELP =
  '🏦 <b>بوت المالية — DTSG</b> (سوپر أدمن حصراً)\n' +
  'نفس خصائص لوحة السوپر أدمين المالية في المنصة:\n\n' +
  '📊 <code>/stats</code> — إحصاءات المنصة (مستخدمون · ذهب · نشاط)\n' +
  '⏳ <code>/pending</code> — طلبات الشحن/السحب المعلّقة + موافقة/رفض\n' +
  '📥 <code>/deposits</code> · 💸 <code>/withdrawals</code> — سجل الشحن/السحب\n' +
  '👥 <code>/users</code> — سجلات المستخدمين · <code>/user &lt;معرّف|اسم&gt;</code> — ملف مستخدم\n' +
  '🔎 <code>/search &lt;اسم&gt;</code> — بحث في المستخدمين\n' +
  '📜 <code>/log [نوع] [صفحة]</code> — جميع السجلات (رهان/فوز/تحويل/شحن/خصم…)\n' +
  '💰 <code>/money</code> — سجل المال + مجاميع الشحن/السحب\n' +
  '🎮 <code>/games</code> — إحصاءات مالية لكل لعبة\n' +
  '🔎 <code>/tx &lt;مرجع&gt;</code> — تفاصيل معاملة\n' +
  '⚡ <code>/charge &lt;مستخدم&gt; &lt;مبلغ&gt;</code> — شحن كوينز\n' +
  '⚙️ <code>/deduct &lt;مستخدم&gt; &lt;مبلغ&gt;</code> — خصم كوينز\n' +
  '🛠 <code>/setbalance &lt;مستخدم&gt; &lt;رصيد&gt;</code> — ضبط الرصيد\n' +
  '📢 <code>/news &lt;رسالة&gt;</code> — رسالة إخبارية/إشهارية في شريط المنصة (<code>/news clear</code> للإزالة)\n' +
  '🧾 <code>/audit [عدد]</code> — آخر أفعال هذا البوت\n\n' +
  'أنواع /log: ' + LOG_TYPES.filter(Boolean).join(' · ');

/* أزرار التنقل بين الصفحات: fnv:<نطاق>:<وسيط>:<صفحة> */
function pager(scope, arg, page, totalPages) {
  if (totalPages <= 1) return null;
  const row = [];
  if (page > 1) row.push({ text: '◀️ السابق', callback_data: 'fnv:' + scope + ':' + (arg || '') + ':' + (page - 1) });
  row.push({ text: page + ' / ' + totalPages, callback_data: 'noop' });
  if (page < totalPages) row.push({ text: 'التالي ▶️', callback_data: 'fnv:' + scope + ':' + (arg || '') + ':' + (page + 1) });
  return [row];
}
const totalPagesOf = (total, per) => Math.max(1, Math.ceil(total / per));

/* [fin tab] الإحصاءات + إحصاءات الألعاب */
async function cmdStats(chat) {
  const s = statsData();
  const t = payTotals();
  let text =
    '📊 <b>إحصاءات المنصة</b>\n' +
    '👥 المستخدمون: <b>' + fmt(s.users_total) + '</b>' + (s.banned ? ' (محظورون: ' + fmt(s.banned) + ')' : '') + '\n' +
    '🟢 نشط آخر 24 ساعة: <b>' + fmt(s.active_today) + '</b>\n' +
    '🪙 مجموع الذهب: <b>' + fmt(s.gold_total) + '</b>\n\n' +
    '💵 <b>المحفظة (USD)</b>\n' +
    '📥 شحن منجز: <b>' + usd(t.dep_usd) + '</b> (' + fmt(t.dep_n) + ' عملية)\n' +
    '💸 سحب منجز: <b>' + usd(t.wd_usd) + '</b> (' + fmt(t.wd_n) + ' عملية)\n' +
    '⏳ معلّقة: <b>' + fmt(t.pend_n) + '</b>';
  await send(chat, text, { reply_markup: MENU });
}

/* [fin tab] الطلبات المعلّقة + أزرار الموافقة/الرفض — نفس جدول الداشبورد */
async function cmdPending(chat) {
  const list = pendingData();
  if (!list.length) { await send(chat, '✅ لا توجد طلبات معلّقة — كل الشحن والسحب مُعالَج.', { reply_markup: MENU }); return; }
  let text = '⏳ <b>الطلبات المالية المعلّقة</b> (' + list.length + ')\n\n';
  for (const t of list.slice(0, 6)) {
    const dir = t.type === 'withdrawal' ? '💸 سحب' : '📥 شحن';
    text += '🔖 <code>' + esc(t.id) + '</code> · ' + dir + ' · <b>' + usd(t.amount_usd) + '</b>\n' +
      '👤 ' + esc(userNameOf(t.user_id)) + ' (#' + esc(t.user_id) + ') · ' + (methodLbl[t.method] || esc(t.method || '—')) + '\n' +
      (t.proof_details ? '🧾 ' + esc(cut(t.proof_details, 90)) + '\n' : '') +
      '🕰 ' + ts(t.created_at) + (ago(t.created_at) ? ' (' + ago(t.created_at) + ')' : '') + '\n\n';
  }
  if (list.length > 6) text += '… و' + (list.length - 6) + ' أخرى — عالجها من ' + (list.length > 6 ? 'لوحة المنصة أو بالمرجع /tx' : '') + '\n';
  const rows = list.slice(0, 6).map(function (t) {
    return [{ text: '✅ ' + (t.type === 'withdrawal' ? 'تنفيذ السحب' : 'تأكيد الشحن') + ' · ' + usd(t.amount_usd), callback_data: 'fapp:' + t.id },
            { text: '❌ رفض', callback_data: 'frej:' + t.id }];
  });
  await send(chat, text, { reply_markup: kb(rows) });
}

/* [سجل الشحن/السحب] */
async function cmdPay(chat, type, page) {
  const r = payList(type, page);
  const label = type === 'deposit' ? '📥 سجل الشحن (إيداعات)' : '💸 سجل السحب';
  if (!r.rows.length) { await send(chat, label + '\n\n📭 لا سجلات.', { reply_markup: MENU }); return; }
  const t = payTotals();
  let text = label + ' — صفحة ' + page + ' من ' + totalPagesOf(r.total, PAGE) + ' (الإجمالي ' + fmt(r.total) + ')\n\n';
  for (const p of r.rows) {
    text += (statusLbl[p.status] || 'ℹ️') + ' <b>' + usd(p.amount_usd) + '</b> · ' + (methodLbl[p.method] || esc(p.method || '—')) + '\n' +
      '👤 ' + esc(userNameOf(p.user_id)) + ' (#' + esc(p.user_id) + ')' + (p.reviewed_by ? ' · مراجِع: ' + esc(p.reviewed_by) : '') + '\n' +
      '🕰 ' + ts(p.created_at) + ' · 🔖 <code>' + esc(p.id) + '</code>\n\n';
  }
  text += (type === 'deposit'
    ? '📥 شحن منجز إجمالاً: ' + usd(t.dep_usd) + ' · '
    : '💸 سحب منجز إجمالاً: ' + usd(t.wd_usd) + ' · ') + '⏳ معلّقة الآن: ' + fmt(t.pend_n);
  const nav = pager(type === 'deposit' ? 'dep' : 'wd', '', page, totalPagesOf(r.total, PAGE));
  await send(chat, text, nav ? { reply_markup: kb([nav]) } : { reply_markup: MENU });
}

/* [users tab] سجلات المستخدمين */
async function cmdUsers(chat, page, q) {
  const r = usersList(q, page);
  if (!r.rows.length) { await send(chat, '👥 المستخدمون\n\n📭 لا نتائج' + (q ? ' لـ «' + esc(q) + '»' : '') + '.', { reply_markup: MENU }); return; }
  let text = '👥 <b>سجلات المستخدمين</b>' + (q ? ' — بحث: ' + esc(q) : '') + ' — صفحة ' + page + ' من ' + totalPagesOf(r.total, USERS_PAGE) + ' (الإجمالي ' + fmt(r.total) + ')\n\n';
  for (const u of r.rows) {
    const role = u.role === 'super' ? '👑 سوپر' : (u.role === 'admin' ? '🛡 أدمن' : '👤 لاعب');
    text += role + ' <b>' + esc(u.username) + '</b> (#' + u.id + ')\n' +
      '🪙 ' + fmt(u.gold) + ' · ' + (u.banned ? '⛔ محظور' : '✅ نشط') +
      (u.last_seen ? ' · ' + ago(u.last_seen) : '') + '\n' +
      '🔎 <code>/user ' + u.id + '</code>\n\n';
  }
  const nav = pager('users', q || '', page, totalPagesOf(r.total, USERS_PAGE));
  await send(chat, text, nav ? { reply_markup: kb([nav]) } : { reply_markup: MENU });
}

/* [users tab] ملف مستخدم كامل + آخر معاملاته */
async function cmdUser(chat, q) {
  const u = findUser(q);
  if (!u) { await send(chat, '❌ لا مستخدم بـ «' + esc(q) + '» — جرّب /search &lt;اسم&gt;.'); return; }
  const role = u.role === 'super' ? '👑 سوپر أدمن' : (u.role === 'admin' ? '🛡 أدمن' : '👤 لاعب');
  let text =
    '👤 <b>' + esc(u.username) + '</b> (#' + u.id + ') — ' + role + '\n' +
    '🪙 الرصيد: <b>' + fmt(u.gold) + '</b> كوينز\n' +
    '📅 الانضمام: ' + ts((u.created_at || 0) * 1000) + '\n' +
    '🕰 آخر نشاط: ' + (u.last_seen ? (ts(u.last_seen * 1000) + ' (' + ago(u.last_seen * 1000 || u.last_seen) + ')') : '—') + '\n' +
    '📊 الحالة: ' + (u.banned ? '⛔ محظور' : '✅ نشط') +
    (u.muted_until && u.muted_until > Date.now() ? ' · 🔇 مُسكَت حتى ' + ts(u.muted_until) : '') + '\n' +
    (u.ref_code ? '🎁 رمز الإحالة: <code>' + esc(u.ref_code) + '</code>' + (u.referred_by ? ' · مُحال من #' + u.referred_by : '') + '\n' : '') +
    (u.telegram_id ? '🔗 مرتبط بتيليغرام' : '🔀 غير مرتبط بتيليغرام') + '\n';
  /* آخر معاملاته (سجل مدمج مُصفّى عليه) */
  const r = mergedLog('', 1, u.id);
  if (r.rows.length) {
    text += '\n📜 <b>آخر معاملاته</b> (من ' + fmt(r.total) + '):\n';
    for (const t of r.rows.slice(0, 5)) {
      text += '· ' + txTypeLabel(t.type) + ' ' + (t.amount_usd != null ? usd(t.amount_usd) : txAmountSign(t.type, t.amount)) +
        (statusLbl[t.status] ? ' ' + statusLbl[t.status] : '') + ' · ' + ts(t.created_at) + '\n';
    }
  }
  text += '\n⚡ <code>/charge ' + u.id + ' [مبلغ]</code> · ⚙️ <code>/deduct ' + u.id + ' [مبلغ]</code> · 🛠 <code>/setbalance ' + u.id + ' [رصيد]</code>';
  await send(chat, text);
}

/* [logs tab] جميع السجلات — السجل المدمج */
async function cmdLog(chat, type, page) {
  if (type && LOG_TYPES.indexOf(type) === -1) {
    await send(chat, '❌ نوع غير معروف: <code>' + esc(type) + '</code>\nالمتاح: ' + LOG_TYPES.filter(Boolean).join(' · '));
    return;
  }
  const r = mergedLog(type, page, null);
  if (!r.rows.length) { await send(chat, '📜 جميع السجلات\n\n📭 لا سجلات' + (type ? ' من نوع «' + esc(type) + '»' : '') + '.', { reply_markup: MENU }); return; }
  let text = '📜 <b>جميع السجلات</b>' + (type ? ' — ' + txTypeLabel(type) : '') + ' — صفحة ' + page + ' من ' + totalPagesOf(r.total, PAGE) + ' (الإجمالي ' + fmt(r.total) + ')\n\n';
  for (const t of r.rows) {
    const amt = t.amount_usd != null
      ? ((t.type === 'withdrawal' ? '💸 − ' : '📥 + ') + usd(t.amount_usd))
      : txAmountSign(t.type, t.amount);
    text += txTypeLabel(t.type) + ' <b>' + amt + '</b>' + (statusLbl[t.status] ? ' ' + statusLbl[t.status] : '') + '\n' +
      '👤 ' + esc(t.username || ('#' + t.user_id)) +
      (t.balance_after != null ? ' · بعدها 🪙 ' + fmt(t.balance_after) : '') + '\n' +
      (t.counterparty_name ? '↔️ ' + esc(t.counterparty_name) + ' ' : '') +
      (t.actor_name ? '· بواسطة ' + esc(t.actor_name) + ' ' : '') +
      (t.game_id ? '· 🎮 ' + esc(t.game_id) + ' ' : '') +
      '· ' + ts(t.created_at) + '\n' +
      (t.note ? '📝 ' + esc(cut(t.note, 60)) + '\n' : '') + '\n';
  }
  const nav = pager('log', type || '', page, totalPagesOf(r.total, PAGE));
  const quick = [[
    { text: '📥 شحن', callback_data: 'fnv:log:deposit:1' },
    { text: '💸 سحب', callback_data: 'fnv:log:withdrawal:1' },
    { text: '🎯 رهان', callback_data: 'fnv:log:bet:1' },
    { text: '🏆 فوز', callback_data: 'fnv:log:win:1' }
  ], [
    { text: '⚡ شحن يدوي', callback_data: 'fnv:log:charge:1' },
    { text: '⚙️ خصم', callback_data: 'fnv:log:deduct:1' },
    { text: '🔄 تحويلات', callback_data: 'fnv:log:transfer_out:1' },
    { text: '📜 الكل', callback_data: 'fnv:log::1' }
  ]];
  await send(chat, text, { reply_markup: kb(nav ? quick.concat([nav]) : quick) });
}

/* [money tab] سجل المال + المجاميع */
async function cmdMoney(chat, page) {
  const r = moneyLogData(page);
  if (!r.rows.length) { await send(chat, '💰 سجل المال\n\n📭 لا حركات مالية بعد.', { reply_markup: MENU }); return; }
  const t = r.totals;
  let text =
    '💰 <b>سجل المال</b> — صفحة ' + page + ' من ' + totalPagesOf(r.total, PAGE) + '\n\n' +
    '📥 شحن منجز: <b>' + usd(t.dep) + '</b>\n' +
    '💸 سحب منجز: <b>' + usd(t.wd) + '</b>\n' +
    '🪙 داخل / خارج: <b>' + fmt(t.in) + ' / ' + fmt(Math.abs(t.out)) + '</b>\n\n';
  const kindLbl = { deposit: '📥 شحن', withdrawal: '💸 سحب', voucher: '🎟️ كود', voucher_issued: '🎟️ إصدار كود', adjust: '⚙️ تسوية', note: '📝 ملاحظة', game: '🎮 لعبة' };
  for (const m of r.rows) {
    const usdv = Number(m.usd || m.amount_usd || 0), coins = Number(m.coins || 0);
    text += (kindLbl[m.kind] || esc(m.kind || '—')) + ' ' +
      (usdv ? ('<b>' + usd(usdv) + '</b>') : '') + (coins ? ((usdv ? ' · ' : '') + (coins > 0 ? '+' : '') + fmt(coins) + ' 🪙') : '') +
      (m.status ? ' ' + (statusLbl[m.status] || esc(m.status)) : '') + '\n' +
      '👤 ' + esc(m.username || ('#' + m.user_id)) + (m.ref || m.note ? ' · ' + esc(cut(m.ref || m.note, 40)) : '') + '\n' +
      '🕰 ' + ts(Number(m.created_at) / 1000) + '\n\n';
  }
  text += 'آخر ' + fmt(r.total) + ' حركة (نفس حدّ الداشبورد).';
  const nav = pager('money', '', page, totalPagesOf(r.total, PAGE));
  await send(chat, text, nav ? { reply_markup: kb([nav]) } : { reply_markup: MENU });
}

/* [fin tab] إحصاءات الألعاب */
async function cmdGames(chat) {
  const gs = gamesStats();
  if (!gs.length) { await send(chat, '🎮 لا إحصاءات ألعاب بعد (لا رهانات جماعية مسجّلة).', { reply_markup: MENU }); return; }
  let text = '🎮 <b>إحصاءات مالية لكل لعبة</b>\n\n🎯 لعبة · 🔁 لعبات · 🏆 فوز · 🪙 كوينز مدفوعة\n\n';
  for (const g of gs) {
    text += '🎯 <b>' + esc(g.game_id) + '</b>\n🔁 ' + fmt(g.plays) + ' · 🏆 ' + fmt(g.wins) + ' · 🪙 ' + fmt(g.coins_won) + '\n\n';
  }
  await send(chat, text, { reply_markup: MENU });
}

/* [تفاصيل معاملة] */
async function cmdTx(chat, ref) {
  let row = null;
  try { row = CTX.db.prepare('SELECT * FROM pay_transactions WHERE id = ?').get(String(ref)); } catch (e) {}
  if (!row) {
    const m = String(ref).match(/^pay(.+)$/);
    if (m) { try { row = CTX.db.prepare('SELECT * FROM pay_transactions WHERE id = ?').get(String(m[1])); } catch (e) {} }
  }
  if (row) {
    const dir = row.type === 'withdrawal' ? '💸 سحب' : '📥 شحن';
    await send(chat, dir + ' · <b>' + usd(row.amount_usd) + '</b> · 🔖 <code>' + esc(row.id) + '</code>\n' +
      '👤 ' + esc(userNameOf(row.user_id)) + ' (#' + esc(row.user_id) + ')\n' +
      '💳 ' + (methodLbl[row.method] || esc(row.method || '—')) + '\n' +
      '📊 ' + (statusLbl[row.status] || esc(row.status || '—')) + (row.reviewed_by ? ' · مراجِع: ' + esc(row.reviewed_by) : '') + '\n' +
      '🧾 ' + esc(cut(row.proof_details || '—', 200)) + '\n' +
      '🕰 ' + ts(row.created_at) + (ago(row.created_at) ? ' (' + ago(row.created_at) + ')' : '') + '\n' +
      (row.status === 'pending' ? '\n⚡ عالجها الآن: /pending' : ''), { reply_markup: MENU });
    return;
  }
  let t = null;
  try { t = CTX.db.prepare('SELECT t.*, u.username FROM transactions t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?').get(Number(ref)); } catch (e) {}
  if (t) {
    await send(chat, txTypeLabel(t.type) + ' · ' + txAmountSign(t.type, t.amount) + ' · 🔖 <code>tx' + esc(t.id) + '</code>\n' +
      '👤 ' + esc(t.username || ('#' + t.user_id)) + (t.balance_after != null ? ' · بعدها 🪙 ' + fmt(t.balance_after) : '') + '\n' +
      (t.counterparty_name ? '↔️ ' + esc(t.counterparty_name) + '\n' : '') +
      (t.actor_name ? '✍️ ' + esc(t.actor_name) + '\n' : '') +
      (t.game_id ? '🎮 ' + esc(t.game_id) + '\n' : '') +
      (t.note ? '📝 ' + esc(cut(t.note, 200)) + '\n' : '') +
      '🕰 ' + ts((t.created_at || 0) * 1000));
    return;
  }
  await send(chat, '❌ لا معاملة بمرجع «' + esc(ref) + '».');
}

/* ═══ الأفعال المالية — نفس منطق الداشبورد حرفياً (server.js /api/admin/user/:id/balance) ═══ */
function r2(v) { if (typeof v !== 'number' || !isFinite(v)) return 0; return Math.round(v * 100) / 100; }

async function cmdCharge(chat, q, amount) {
  const target = findUser(q);
  if (!target) { await send(chat, '❌ لا مستخدم بـ «' + esc(q) + '».'); return; }
  const amt = r2(Number(amount));
  if (isNaN(amt) || amt < 0.01) { await send(chat, '❌ مبلغ غير صالح — مثال: <code>/charge ' + target.id + ' 500</code>'); return; }
  const before = target.gold || 0;
  target.gold = (target.gold || 0) + amt;
  /* هدية الإحالة: 10% من أول عملية شحن لصاحب رمز الإحالة — نفس الداشبورد */
  let refBonus = 0;
  if (!target.first_topup_done && target.referred_by && CTX.users[target.referred_by]) {
    refBonus = Math.floor(amt * 0.10);
    if (refBonus > 0) CTX.users[target.referred_by].gold = (CTX.users[target.referred_by].gold || 0) + refBonus;
  }
  target.first_topup_done = true;
  try {
    CTX.db.prepare('UPDATE users SET gold = ?, first_topup_done = 1 WHERE id = ?').run(target.gold, target.id);
    if (refBonus > 0 && CTX.users[target.referred_by]) CTX.db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(CTX.users[target.referred_by].gold, target.referred_by);
  } catch (e) {}
  logTx(target, 'charge', amt, { balance_after: target.gold });
  if (refBonus > 0 && CTX.users[target.referred_by]) {
    logTx(CTX.users[target.referred_by], 'referral_bonus', refBonus, { counterparty_id: target.id, counterparty_name: target.username, balance_after: CTX.users[target.referred_by].gold });
  }
  audit(chat, 'charge', 'مستخدم #' + target.id + ' (' + target.username + ') · ' + amt + ' 🪙 · من ' + before + ' إلى ' + target.gold);
  await send(chat, '⚡ تم شحن <b>' + fmt(amt) + '</b> 🪙 إلى <b>' + esc(target.username) + '</b> (#' + target.id + ')\n' +
    'الرصيد: ' + fmt(before) + ' ← <b>' + fmt(target.gold) + '</b>' +
    (refBonus > 0 ? '\n🎁 مكافأة إحالة ' + fmt(refBonus) + ' 🪙 لـ ' + esc(CTX.users[target.referred_by].username) : ''));
  await notifyUser(target.id, '⚡ شحن رصيد: +' + fmt(amt) + ' 🪙\nرصيدك الآن: ' + fmt(target.gold) + ' 🪙\nبواسطة: الإدارة');
}

async function cmdDeduct(chat, q, amount) {
  const target = findUser(q);
  if (!target) { await send(chat, '❌ لا مستخدم بـ «' + esc(q) + '».'); return; }
  const amt = r2(Number(amount));
  if (isNaN(amt) || amt < 0.01) { await send(chat, '❌ مبلغ غير صالح — مثال: <code>/deduct ' + target.id + ' 500</code>'); return; }
  if ((target.gold || 0) < amt) { await send(chat, '❌ رصيد العميل غير كافٍ — رصيده: ' + fmt(target.gold) + ' 🪙'); return; }
  const before = target.gold || 0;
  target.gold -= amt;
  try { CTX.db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(target.gold, target.id); } catch (e) {}
  logTx(target, 'deduct', amt, { balance_after: target.gold });
  audit(chat, 'deduct', 'مستخدم #' + target.id + ' (' + target.username + ') · ' + amt + ' 🪙 · من ' + before + ' إلى ' + target.gold);
  await send(chat, '⚙️ تم خصم <b>' + fmt(amt) + '</b> 🪙 من <b>' + esc(target.username) + '</b> (#' + target.id + ')\n' +
    'الرصيد: ' + fmt(before) + ' ← <b>' + fmt(target.gold) + '</b>');
  await notifyUser(target.id, '⚙️ خصم من الرصيد: −' + fmt(amt) + ' 🪙\nرصيدك الآن: ' + fmt(target.gold) + ' 🪙');
}

async function cmdSetBalance(chat, q, goldV) {
  const target = findUser(q);
  if (!target) { await send(chat, '❌ لا مستخدم بـ «' + esc(q) + '».'); return; }
  const g = Math.max(0, r2(Number(goldV)) || 0);
  const before = target.gold || 0;
  target.gold = g;
  try { CTX.db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(target.gold, target.id); } catch (e) {}
  logTx(target, 'set_balance', target.gold, { note: 'من ' + before + ' إلى ' + target.gold, balance_after: target.gold });
  audit(chat, 'set_balance', 'مستخدم #' + target.id + ' (' + target.username + ') · من ' + before + ' إلى ' + g);
  await send(chat, '🛠 ضبط رصيد <b>' + esc(target.username) + '</b> (#' + target.id + ')\n' +
    fmt(before) + ' ← <b>' + fmt(target.gold) + '</b> 🪙');
}

/* [audit] آخر أفعال البوت */
async function cmdAudit(chat, n) {
  let rows = [];
  try { rows = CTX.db.prepare('SELECT * FROM fin_audit ORDER BY id DESC LIMIT ?').all(Math.min(50, Math.max(1, n || 10))); } catch (e) {}
  if (!rows.length) { await send(chat, '🧾 لا قيود تدقيق بعد.'); return; }
  let text = '🧾 <b>آخر أفعال بوت المالية</b>\n\n';
  for (const a of rows) {
    text += '· ' + esc(a.action) + ' — ' + esc(cut(a.detail, 80)) + '\n  🕰 ' + ts(a.ts) + ' · 👤 ' + esc(a.actor_tg) + '\n';
  }
  await send(chat, text);
}

/* [v2.73] رسالة الشريط الإشهاري — تُكتب من هنا وتظهر في شريط المنصة */
async function cmdNews(chat, rest) {
  const arg = String(rest || '').trim();
  if (!arg) {
    const cur = newsGet();
    let text = '📢 <b>رسالة الشريط الإشهاري</b>\n\n';
    if (cur) {
      text += 'الرسالة الحالية:\n<blockquote>' + esc(cur.text) + '</blockquote>\n🕰 ' + ts(cur.at) + (ago(cur.at) ? ' (' + ago(cur.at) + ')' : '') + '\n';
    } else {
      text += 'لا رسالة معروضة حالياً.\n';
    }
    text += '\nالكتابة: <code>/news النص هنا</code> (حتى ' + NEWS_MAX + ' حرفاً)\n' +
      'الإزالة: <code>/news clear</code>\n' +
      'تظهر في الشريط الإشهاري بالصفحة الرئيسية خلال ٥ دقائق (أو عند التحديث).';
    await send(chat, text, { reply_markup: MENU });
    return;
  }
  if (/^(clear|حذف|مسح|off|none)$/i.test(arg)) {
    newsClear();
    audit(chat, 'news', 'إزالة رسالة الشريط الإشهاري');
    await send(chat, '🗑 أُزيلت رسالة الشريط الإشهاري — سيتفرّغ الشريط خلال ٥ دقائق.', { reply_markup: MENU });
    return;
  }
  if (!newsSet(arg, chat)) {
    await send(chat, '❌ نص غير صالح — اكتب رسالة غير فارغة (حتى ' + NEWS_MAX + ' حرفاً).');
    return;
  }
  audit(chat, 'news', 'رسالة شريط: ' + cut(arg, 80));
  await send(chat, '📢 <b>نُشرت رسالة الشريط الإشهاري</b>\n\n<blockquote>' + esc(cut(arg, NEWS_MAX)) + '</blockquote>\n' +
    'تظهر في شريط المنصة خلال ٥ دقائق — <code>/news</code> لعرضها و<code>/news clear</code> لإزالتها.', { reply_markup: MENU });
}

/* ── موافقة/رفض الطلبات (أزرار) — نفس دوال الداشبورد pay.adminApprove/adminReject ── */
async function payAct(chat, act, txId) {
  const payMod = CTX.hooks && CTX.hooks.pay;
  if (!payMod) { await send(chat, '⚠️ وحدة المدفوعات غير مربوطة.'); return; }
  const row = (function () { try { return CTX.db.prepare('SELECT * FROM pay_transactions WHERE id = ?').get(String(txId)); } catch (e) { return null; } })();
  const r = await payMod.adminActOnPlatformTx(String(txId), act === 'fapp' ? 'approve' : 'reject', 'financials-bot');
  const okRes = !!(r && r.ok);
  const label = act === 'fapp'
    ? (row && row.type === 'withdrawal' ? 'تم تنفيذ السحب' : 'تم تأكيد الشحن وشحن الرصيد')
    : (row && row.type === 'withdrawal' ? 'تم رفض السحب وإعادة الرصيد' : 'تم رفض الإيداع');
  await send(chat, (okRes ? '✅ ' + label : '⚠️ تعذّر التنفيذ: ' + esc((r && r.error) || 'خطأ') +
    (r && r.error === 'already-completed' ? ' (المعاملة مُعالجة سلفاً)' : '')) +
    '\n🔖 المرجع: <code>' + esc(txId) + '</code>' +
    (row ? '\n👤 ' + esc(userNameOf(row.user_id)) + ' · ' + usd(row.amount_usd) : ''));
  audit(chat, 'pay:' + act, 'مرجع ' + txId + (row ? ' · ' + row.type + ' ' + row.amount_usd + '$ · مستخدم #' + row.user_id : ''));
  /* إشعار المستخدم — نفس سلوك الداشبورد عند /api/admin/payments/act */
  if (row && okRes) {
    await notifyUser(row.user_id, act === 'fapp'
      ? ('✅ تم تنفيذ طلبك: ' + row.amount_usd + ' USD')
      : ('❌ رُفض طلبك (' + row.amount_usd + ' USD). للاستفسار راسل الدعم.'));
  }
}

/* ═══════════ توجيه التحديثات ═══════════ */
async function handleUpdate(up) {
  try {
    if (!CTX) return { ok: false, error: 'no-ctx' };
    if (up.callback_query) { await onCallback(up.callback_query); return { ok: true }; }
    const msg = up.message || up.edited_message;
    if (!msg || !msg.chat) return { ok: true };
    await onMessage(msg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function onMessage(msg) {
  const chat = String(msg.chat.id);
  const from = String((msg.from && msg.from.id) || chat);
  const text = String(msg.text || msg.caption || '').trim();
  /* البوابة: السوپر أدمن حصراً — أي محادثة أخرى تُرفض ويُقيَّد المحاولة */
  if (!superTg() || (chat !== superTg() && from !== superTg())) {
    audit(chat, 'denied', 'محاولة وصول من محادثة غير السوپر أدمن');
    await send(chat, '⛔ <b>هذا البوت خاص بالسوپر أدمن فقط</b> ولا يستجيب لأي حساب آخر.\n' +
      '🛟 للدعم: @dtsgsupports_bot · 🎟️ لأكواد التعبئة: بوت أكواد المنصة.');
    return;
  }
  if (!text) { await send(chat, '🏦 اكتب أمراً — /help للقائمة الكاملة.', { reply_markup: MENU }); return; }
  audit(chat, 'cmd', cut(text, 80));

  /* أزرار القائمة الثابتة → أوامر */
  const menuMap = {
    '📊 الإحصاءات': '/stats', '⏳ الطلبات المعلقة': '/pending',
    '📥 سجل الشحن': '/deposits', '💸 سجل السحب': '/withdrawals',
    '👥 سجلات المستخدمين': '/users', '📜 جميع السجلات': '/log',
    '💰 سجل المال': '/money', '🎮 إحصاءات الألعاب': '/games'
  };
  const line = menuMap[text] ? menuMap[text] : text;
  const parts = line.split(/\s+/);
  const cmd = (parts[0] || '').replace(/@.*$/, '').toLowerCase();

  if (cmd === '/start' || cmd === 'بدء') {
    await send(chat,
      '🏦 <b>بوت المالية — DTSG</b>\n' +
      'خاص بالسوپر أدمين 👑 حصراً — يعرض سجلات المنصة المالية كاملة (الشحن · السحب · المستخدمون · جميع السجلات) بنفس خصائص لوحة السوپر أدمين في المنصة.\n\n' +
      '👇 اختر من اللوحة أو اكتب /help للأوامر الكاملة.', { reply_markup: MENU });
    return;
  }
  if (cmd === '/help' || cmd === '/cmds' || cmd === 'مساعدة') { await send(chat, HELP, { reply_markup: MENU }); return; }
  if (cmd === '/stats') return cmdStats(chat);
  if (cmd === '/pending' || cmd === '⏳') return cmdPending(chat);
  if (cmd === '/deposits' || cmd === '/dep') return cmdPay(chat, 'deposit', Math.max(1, parseInt(parts[1], 10) || 1));
  if (cmd === '/withdrawals' || cmd === '/wd') return cmdPay(chat, 'withdrawal', Math.max(1, parseInt(parts[1], 10) || 1));
  if (cmd === '/users') {
    const pageArg = (parts[1] && /^\d+$/.test(parts[1])) ? parseInt(parts[1], 10) : 1;
    const qArg = (parts[1] && !/^\d+$/.test(parts[1])) ? parts[1] : (parts[2] || null);
    return cmdUsers(chat, Math.max(1, pageArg), qArg);
  }
  if (cmd === '/user') {
    if (!parts[1]) { await send(chat, '👤 <code>/user &lt;معرّف|اسم المستخدم&gt;</code> — مثال: <code>/user 2</code> أو <code>/user player1</code>'); return; }
    return cmdUser(chat, parts[1]);
  }
  if (cmd === '/search') {
    if (!parts[1]) { await send(chat, '🔎 <code>/search &lt;جزء من الاسم&gt;</code>'); return; }
    return cmdUsers(chat, 1, parts[1]);
  }
  if (cmd === '/log' || cmd === '/logs') {
    const a = (parts[1] && LOG_TYPES.indexOf(parts[1].toLowerCase()) >= 0) ? parts[1].toLowerCase() : '';
    const page = Math.max(1, parseInt(a ? parts[2] : parts[1], 10) || 1);
    return cmdLog(chat, a, page);
  }
  if (cmd === '/money') return cmdMoney(chat, Math.max(1, parseInt(parts[1], 10) || 1));
  if (cmd === '/games') return cmdGames(chat);
  if (cmd === '/tx') {
    if (!parts[1]) { await send(chat, '🔎 <code>/tx &lt;مرجع المعاملة&gt;</code> — تجده في السجلات أو /pending'); return; }
    return cmdTx(chat, parts[1]);
  }
  if (cmd === '/charge' || cmd === '/deduct' || cmd === '/setbalance') {
    if (!parts[1] || !parts[2]) {
      await send(chat, '⚠️ الصيغة: <code>' + cmd + ' &lt;معرّف|اسم&gt; &lt;مبلغ&gt;</code> — مثال: <code>' + cmd + ' 2 500</code>');
      return;
    }
    if (cmd === '/charge') return cmdCharge(chat, parts[1], parts[2]);
    if (cmd === '/deduct') return cmdDeduct(chat, parts[1], parts[2]);
    return cmdSetBalance(chat, parts[1], parts[2]);
  }
  if (cmd === '/audit') return cmdAudit(chat, parseInt(parts[1], 10) || 10);
  if (cmd === '/news' || cmd === '/ad' || cmd === '/advertise') {
    return cmdNews(chat, line.replace(/^\S+\s*/, ''));
  }
  await send(chat, '🤔 أمر غير معروف — /help للقائمة الكاملة.', { reply_markup: MENU });
}

async function onCallback(cq) {
  const chat = String((cq.from && cq.from.id) || '');
  const data = String(cq.data || '');
  /* البوابة نفسها للأزرار */
  if (!superTg() || chat !== superTg()) {
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: '⛔ السوپر أدمن فقط', show_alert: true });
    audit(chat, 'denied-cb', cut(data, 60));
    return { ok: false };
  }
  if (data === 'noop') { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: '' }); return { ok: true }; }
  const pay = data.match(/^(fapp|frej):(.+)$/);
  if (pay) {
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: '⏳ جارٍ التنفيذ…' });
    return payAct(chat, pay[1], pay[2]);
  }
  const m = data.match(/^fnv:([a-z]+):([^:]*):(\d+)$/);
  if (!m) { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'زر غير معروف' }); return { ok: false }; }
  await tg('answerCallbackQuery', { callback_query_id: cq.id, text: '⏳' });
  const scope = m[1], arg = m[2], page = Math.max(1, parseInt(m[3], 10) || 1);
  if (scope === 'dep') return cmdPay(chat, 'deposit', page);
  if (scope === 'wd') return cmdPay(chat, 'withdrawal', page);
  if (scope === 'users') return cmdUsers(chat, page, arg || null);
  if (scope === 'log') return cmdLog(chat, (arg && LOG_TYPES.indexOf(arg) >= 0) ? arg : '', page);
  if (scope === 'money') return cmdMoney(chat, page);
  return { ok: true };
}

/* ═══════════ توجيه HTTP (يُستدعى من server.js) ═══════════ */
const FIN_PATHS = ['/api/financials/webhook', '/api/financials/status'];
function isFinancialsPath(p) { return FIN_PATHS.indexOf(p) >= 0; }

function json(res, obj, code) { res.writeHead(code || 200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }

async function handleHttp(req, res, pathname, bodyStr, query) {
  if (pathname === '/api/financials/status') {
    json(res, { ok: true, service: 'dtsg-financials-bot', bot: botUsername(), super_configured: !!superTg() });
    return;
  }
  if (pathname === '/api/financials/webhook') {
    /* سرّ الويب هوك — نفس نمط بوت الدعم (قاعدة 10 في AGENTS.md) */
    const secret = process.env.FINANCIALS_WEBHOOK_SECRET || '';
    const got = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    /* [v2.80·أمن] فشل مغلق: نفس إصلاح بوت الدعم — لا تحديث بلا سرٍّ صحيح */
    if (!secret || got !== secret) { json(res, { ok: false, error: 'forbidden' }, 403); return; }
    let up = {};
    try { up = JSON.parse(bodyStr || '{}'); } catch (e) { json(res, { ok: false, error: 'bad-json' }, 400); return; }
    const r = await handleUpdate(up);
    json(res, r, r.ok ? 200 : 500);
    return;
  }
  json(res, { ok: false, error: 'not_found' }, 404);
}

module.exports = {
  initFinancials, setCtx, handleUpdate, handleHttp, isFinancialsPath, FIN_PATHS,
  statsData, pendingData, payTotals, gamesStats, mergedLog, moneyLogData, usersList, findUser,
  newsGet, newsSet, newsClear,
  _internals: { cmdStats, cmdPending, cmdPay, cmdUsers, cmdUser, cmdLog, cmdMoney, cmdGames, cmdTx, cmdCharge, cmdDeduct, cmdSetBalance, cmdAudit, cmdNews, payAct, superTg }
};
