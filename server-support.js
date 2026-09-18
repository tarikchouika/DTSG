'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — بوت دعم العملاء (Support Bot Engine)  v2.41.0
   @dtsgsupports_bot  ⟷  بوت المنصة المالي  ⟷  المنصة (dtsg.pages.dev)

   المبدأ: قناة واحدة نظيفة بين المستخدم والفريق — بلا كشف هويات:
     • المستخدم لا يرى معرف تيليغرام لأي أدمن (كل الردود تمر عبر البوت).
     • الأدمن لا يرى هاتف/معرّف المستخدم — يرى رقم التذكرة + اسم المستخدم في المنصة.
     • السوبر أدمن وحده: إدارة الأدمنز، البث الجماعي، بيانات الحسابات، السجل، الإعدادات.

   الجداول: sup_tickets · sup_messages · sup_link_codes · sup_admins · sup_audit
            sup_settings · sup_state (الحالة اللحظية لكل أدمن) · sup_users (ربط المستخدمين)

   الأسرار من البيئة:
     SUPPORT_BOT_TOKEN · SUPPORT_WEBHOOK_SECRET · SUPPORT_SUPER_TG (افتراضي: TELEGRAM_ADMIN_CHAT_ID)
     TELEGRAM_ADMIN_CHAT_ID (شات الإدارة المشترك بين البوتين) · TELEGRAM_BOT_TOKEN (بوت المنصة)
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');

let CTX = null;   /* { db, users, sessions } — من server.js */

/* ── ثوابت ── */
const TICKET_OPEN = 'open', TICKET_CLAIMED = 'claimed', TICKET_CLOSED = 'closed';
const ROLE_ADMIN = 'admin', ROLE_SUPER = 'super';
const MAXLEN = 3500;                              /* حدّ تيليغرام الفعلي 4096 */
const GUEST_TICKETS_PER_DAY = 2;                  /* تذاكر الزوّار (غير المرتبطين) */
const MSG_PER_MIN = 20;                           /* حدّ الإغراق */

/* ── أدوات عامة ── */
const now = () => Date.now();
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function cut(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function apiBase() { return (process.env.SUPPORT_TG_API || 'https://api.telegram.org').replace(/\/$/, ''); }
function token() { return process.env.SUPPORT_BOT_TOKEN || ''; }
function superTg() { return String(process.env.SUPPORT_SUPER_TG || process.env.TELEGRAM_ADMIN_CHAT_ID || ''); }
function adminChat() { return String(process.env.TELEGRAM_ADMIN_CHAT_ID || ''); }
function publicBotLink(code) { return 'https://t.me/' + (process.env.SUPPORT_BOT_USERNAME || 'dtsgsupports_bot') + (code ? '?start=' + code : ''); }

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

/* ── قاعدة البيانات ── */
function initSupport(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sup_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT, username TEXT, tg_chat TEXT, guest INTEGER DEFAULT 0,
      subject TEXT, category TEXT DEFAULT 'عام', status TEXT DEFAULT 'open',
      assignee_tg TEXT, created_at INTEGER, updated_at INTEGER, closed_at INTEGER,
      last_user_at INTEGER, unread_admin INTEGER DEFAULT 0, unread_user INTEGER DEFAULT 0,
      rating INTEGER, close_reason TEXT
    );
    CREATE TABLE IF NOT EXISTS sup_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER, sender TEXT, tg_chat TEXT, admin_name TEXT,
      text TEXT, created_at INTEGER, seen_by_user INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS sup_link_codes (
      code TEXT PRIMARY KEY, user_id TEXT, created_at INTEGER, used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS sup_admins (
      tg_id TEXT PRIMARY KEY, name TEXT, role TEXT DEFAULT 'admin',
      added_by TEXT, added_at INTEGER, active INTEGER DEFAULT 1, notify INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS sup_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, actor_tg TEXT, actor_name TEXT,
      action TEXT, detail TEXT
    );
    CREATE TABLE IF NOT EXISTS sup_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS sup_state (tg_id TEXT PRIMARY KEY, active_ticket INTEGER, last_msg_at INTEGER);
    CREATE TABLE IF NOT EXISTS sup_users (
      tg_chat TEXT PRIMARY KEY, user_id TEXT, username TEXT, linked_at INTEGER,
      lang TEXT DEFAULT 'ar', blocked INTEGER DEFAULT 0, muted_until INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sup_tickets_status ON sup_tickets(status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_sup_tickets_user ON sup_tickets(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_sup_msgs_ticket ON sup_messages(ticket_id, id);
  `);
  /* السوبر أدمن المالك يُزرع دائماً */
  const owner = superTg();
  if (owner) {
    try {
      db.prepare('INSERT OR IGNORE INTO sup_admins (tg_id, name, role, added_by, added_at, active, notify) VALUES (?,?,?,?,?,1,1)')
        .run(owner, 'المالك', ROLE_SUPER, 'seed', now());
      db.prepare("UPDATE sup_admins SET role = 'super', active = 1 WHERE tg_id = ?").run(owner);
    } catch (e) {}
  }
  /* إعدادات افتراضية */
  const defs = { support_open: '1', welcome: '', admins_view_balance: '0', show_admin_names: '0', auto_close_hours: '0' };
  for (const k of Object.keys(defs)) {
    try { db.prepare('INSERT OR IGNORE INTO sup_settings (key, value) VALUES (?, ?)').run(k, defs[k]); } catch (e) {}
  }
  return true;
}
function setCtx(db, users, sessions, hooks) { CTX = { db: db, users: users || {}, sessions: sessions || {}, hooks: hooks || {} }; }
function setting(k, def) {
  try { const r = CTX.db.prepare('SELECT value FROM sup_settings WHERE key = ?').get(k); return r ? r.value : def; } catch (e) { return def; }
}
function setSetting(k, v) { try { CTX.db.prepare('INSERT OR REPLACE INTO sup_settings (key, value) VALUES (?, ?)').run(k, String(v)); } catch (e) {} }
function audit(actorTg, actorName, action, detail) {
  try { CTX.db.prepare('INSERT INTO sup_audit (ts, actor_tg, actor_name, action, detail) VALUES (?,?,?,?,?)')
    .run(now(), String(actorTg || ''), String(actorName || ''), String(action || ''), cut(String(detail || ''), 500)); } catch (e) {}
}

/* ── هوية الأدمن ── */
function adminRow(tgId) {
  try { return CTX.db.prepare('SELECT * FROM sup_admins WHERE tg_id = ? AND active = 1').get(String(tgId)) || null; } catch (e) { return null; }
}
function isSuperTg(tgId) { const a = adminRow(tgId); return !!(a && a.role === ROLE_SUPER); }
function isAdminTg(tgId) { return !!adminRow(tgId); }
function adminName(a) { return (a && a.name) || 'الأدمن'; }

/* ── ربط المستخدمين ── */
function supUser(tgChat) {
  try { return CTX.db.prepare('SELECT * FROM sup_users WHERE tg_chat = ?').get(String(tgChat)) || null; } catch (e) { return null; }
}
function platformUser(userId) {
  if (!userId) return null;
  const u = CTX.users[userId] || Object.values(CTX.users).find(x => String(x.id) === String(userId));
  return u || null;
}
function linkUser(tgChat, userId, username) {
  try {
    CTX.db.prepare('INSERT OR REPLACE INTO sup_users (tg_chat, user_id, username, linked_at, blocked, muted_until) VALUES (?,?,?,?,COALESCE((SELECT blocked FROM sup_users WHERE tg_chat = ?),0),COALESCE((SELECT muted_until FROM sup_users WHERE tg_chat = ?),0))')
      .run(String(tgChat), String(userId), String(username || ''), now(), String(tgChat), String(tgChat));
  } catch (e) {}
  /* المشاركة مع بوت المنصة: نفس العمود users.telegram_id ⇒ الربط يسري على البوتين */
  const u = platformUser(userId);
  if (u) {
    u.telegram_id = String(tgChat);
    try { CTX.db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run(String(tgChat), u.id); } catch (e) {}
  }
}
function unlinkUser(tgChat) {
  const su = supUser(tgChat);
  if (su && su.user_id) {
    const u = platformUser(su.user_id);
    if (u) { u.telegram_id = null; try { CTX.db.prepare('UPDATE users SET telegram_id = NULL WHERE id = ?').run(u.id); } catch (e) {} }
  }
  try { CTX.db.prepare('DELETE FROM sup_users WHERE tg_chat = ?').run(String(tgChat)); } catch (e) {}
}
/* كود ربط جديد (تنتهي صلاحيته بعد 30 دقيقة) */
function makeLinkCode(userId) {
  const code = 'SUP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  try {
    CTX.db.prepare('DELETE FROM sup_link_codes WHERE used_at IS NULL AND created_at < ?').run(now() - 30 * 60000);
    CTX.db.prepare('INSERT INTO sup_link_codes (code, user_id, created_at) VALUES (?,?,?)').run(code, String(userId), now());
  } catch (e) {}
  return code;
}
function consumeLinkCode(code) {
  try {
    const r = CTX.db.prepare('SELECT * FROM sup_link_codes WHERE code = ?').get(String(code).toUpperCase());
    if (!r || r.used_at || (now() - r.created_at) > 30 * 60000) return null;
    CTX.db.prepare('UPDATE sup_link_codes SET used_at = ? WHERE code = ?').run(now(), String(code).toUpperCase());
    return r;
  } catch (e) { return null; }
}
/* إشعار مستخدم (يُستدعى أيضاً من بوت المنصة عبر الخطاف __notifyUser) */
async function notifyUser(userId, text, extra) {
  let chat = null;
  const u = platformUser(userId);
  if (u && u.telegram_id) chat = u.telegram_id;
  if (!chat) { try { const r = CTX.db.prepare('SELECT tg_chat FROM sup_users WHERE user_id = ? AND blocked = 0').get(String(userId)); chat = r ? r.tg_chat : null; } catch (e) {} }
  if (!chat) return false;
  /* لا نزعج من حظرناهم */
  const row = supUser(chat);
  if (row && row.blocked) return false;
  const res = await send(chat, text, extra);
  return !!(res && res.ok);
}

/* ── [v2.41.1] إشعار الأدمنز بمعاملة مالية معلّقة (إيداع/سحب) عبر بوت الدعم ──
   يستدعيه payments-core عبر الخطاف __notifyAdminsPayment — يضمن وصول الإشعار حتى
   لو كان توكن بوت المنصة غير مضبوط على الخادم. */
async function notifyAdminsPayment(text, buttons) {
  const rows = activeAdminRows();
  const markup = buttons && buttons.length ? { reply_markup: kb(buttons.map(b => [{ text: b[0], callback_data: b[1] }])) } : {};
  const seen = {};
  let n = 0;
  const head = '💰 <i>معاملة مالية</i>\n';
  for (const a of rows) {
    if (seen[a.tg_id] || String(a.notify) === '0') continue;
    seen[a.tg_id] = 1;
    const r = await send(a.tg_id, head + text, markup); if (r && r.ok) n++;
  }
  const chat = adminChat();
  if (chat && !seen[chat]) { const r = await send(chat, head + text, markup); if (r && r.ok) n++; }
  return n;
}
function adminCanAct(tgId) { return isAdminTg(tgId); }

/* ── التذاكر ── */
function openTicketOf(tgChat) {
  try { return CTX.db.prepare("SELECT * FROM sup_tickets WHERE tg_chat = ? AND status IN ('open','claimed') ORDER BY id DESC LIMIT 1").get(String(tgChat)) || null; } catch (e) { return null; }
}
function ticketById(id) { try { return CTX.db.prepare('SELECT * FROM sup_tickets WHERE id = ?').get(Number(id)) || null; } catch (e) { return null; } }
function addMessage(ticketId, sender, tgChat, adminName, text) {
  try { CTX.db.prepare('INSERT INTO sup_messages (ticket_id, sender, tg_chat, admin_name, text, created_at) VALUES (?,?,?,?,?,?)')
    .run(Number(ticketId), sender, String(tgChat || ''), adminName || null, cut(String(text), MAXLEN), now()); } catch (e) {}
}
function ticketMessages(ticketId, limit) {
  try { return CTX.db.prepare('SELECT * FROM sup_messages WHERE ticket_id = ? ORDER BY id ASC LIMIT ?').all(Number(ticketId), Number(limit || 30)); } catch (e) { return []; }
}
function threadText(tk, msgs, forAdmin) {
  const lines = msgs.map(m => {
    const who = m.sender === 'user' ? ('👤 ' + (forAdmin ? esc(tk.username || 'زائر') : 'أنت'))
      : m.sender === 'note' ? '📝 ملاحظة داخلية'
        : (setting('show_admin_names', '0') === '1' ? ('🛟 ' + esc(m.admin_name || 'الدعم')) : '🛟 فريق الدعم');
    const t = new Date(m.created_at).toISOString().slice(11, 16);
    return who + ' [' + t + ']\n' + esc(m.text);
  });
  return lines.join('\n\n');
}
function ticketHeader(tk, forAdmin) {
  const age = Math.max(0, Math.round((now() - tk.created_at) / 60000));
  if (forAdmin) {
    return '🎫 <b>تذكرة #' + tk.id + '</b>\n' +
      'المستخدم: <b>' + esc(tk.guest ? 'زائر (غير مرتبط)' : (tk.username || tk.user_id)) + '</b>' + (tk.guest ? ' · 🔒 للسوبر أدمن فقط' : '') + '\n' +
      'التصنيف: ' + esc(tk.category) + ' · الحالة: ' + statusAr(tk.status) + (tk.assignee_tg ? ' · المسؤول: ' + esc(adminName(adminRow(tk.assignee_tg))) : '') + '\n' +
      'منذ: ' + age + ' دقيقة';
  }
  return '🎫 <b>تذكرة #' + tk.id + '</b> · ' + statusAr(tk.status) + '\nالتصنيف: ' + esc(tk.category);
}
const statusAr = (s) => s === TICKET_OPEN ? '🟡 مفتوحة' : s === TICKET_CLAIMED ? '🟢 قيد المعالجة' : s === TICKET_CLOSED ? '⚪ مغلقة' : String(s);

/* إشعار الأدمنز بتذكرة جديدة (خصوصية: مقتطف قصير فقط، والتفاصيل بعد الاستلام) */
async function notifyAdminsNewTicket(tk, preview) {
  const rows = guestsOnly(tk) ? superAdminRows() : activeAdminRows();
  const text = '🆕 <b>تذكرة دعم #' + tk.id + '</b>\n' +
    'المستخدم: <b>' + esc(tk.guest ? 'زائر' : (tk.username || tk.user_id)) + '</b>\n' +
    'التصنيف: ' + esc(tk.category) + ' · منذ قليل\n' +
    'مقتطف: ' + esc(cut(preview, 90)) + '\n\n' +
    (guestsOnly(tk) ? '🔒 تذكرة زائر — لا يراها إلا السوبر أدمن.' : 'اضغط «استلام» لعرض المحادثة كاملة.');
  const buttons = kb([[{ text: '🎯 استلام', callback_data: 'supc_' + tk.id }, { text: '🚫 إغلاق', callback_data: 'supx_' + tk.id }]]);
  const seen = {};
  for (const a of rows) {
    if (seen[a.tg_id] || String(a.notify) === '0') continue;
    seen[a.tg_id] = 1;
    await send(a.tg_id, text, { reply_markup: buttons });
  }
  /* الإدارة المشتركة: نفس شات إدارة بوت المنصة (الربط بين البوتين) */
  const chat = adminChat();
  if (chat && !seen[chat]) await send(chat, '🛟 <i>من بوت الدعم</i>\n' + text, { reply_markup: buttons });
}
const guestsOnly = (tk) => String(tk.guest) === '1' || tk.guest === true;
function activeAdminRows() {
  try { return CTX.db.prepare('SELECT * FROM sup_admins WHERE active = 1 ORDER BY role DESC, added_at ASC').all(); } catch (e) { return []; }
}
function superAdminRows() { return activeAdminRows().filter(a => a.role === ROLE_SUPER); }

/* ── معالجة رسائل المستخدم ── */
async function userSay(chat, text, msg) {
  const su = supUser(chat);
  if (su && su.blocked) return;                                   /* محظور: صمت */
  if (su && Number(su.muted_until) > now()) { await send(chat, '⏳ أنت موقوف عن المراسلة مؤقتاً حتى ' + new Date(Number(su.muted_until)).toISOString().slice(11, 16) + ' UTC.'); return; }
  /* حدّ الإغراق */
  const st = stateGet(chat);
  if (st && st.last_msg_at && (now() - st.last_msg_at) < 1000 * 2) { /* 2 ثانية بين الرسائل */ }
  let recent = 0;
  try { recent = CTX.db.prepare('SELECT COUNT(*) c FROM sup_messages WHERE tg_chat = ? AND sender = ? AND created_at > ?').get(String(chat), 'user', now() - 60000).c; } catch (e) {}
  if (recent >= MSG_PER_MIN) { await send(chat, '⏳ رسائل كثيرة في وقت قصير — انتظر دقيقة ثم أعد المحاولة.'); return; }
  stateSet(chat, st ? st.active_ticket : null, now());

  let tk = openTicketOf(chat);
  const isNew = !tk;
  if (isNew) {
    if (!su) {
      let today = 0;
      try { today = CTX.db.prepare('SELECT COUNT(*) c FROM sup_tickets WHERE tg_chat = ? AND created_at > ?').get(String(chat), now() - 86400000).c; } catch (e) {}
      if (today >= GUEST_TICKETS_PER_DAY) { await send(chat, '🔒 لتذكرة جديدة، اربط حسابك في المنصة أولاً:\n' + publicBotLink() + '\nأو من صفحة الدعم: https://dtsg.pages.dev/support.html'); return; }
    }
    const subject = cut(text, 70);
    const res = CTX.db.prepare('INSERT INTO sup_tickets (user_id, username, tg_chat, guest, subject, category, status, created_at, updated_at, last_user_at, unread_admin) VALUES (?,?,?,?,?,?,?,?,?,?,1)')
      .run(su ? su.user_id : null, su ? su.username : null, String(chat), su ? 0 : 1, subject, guessCategory(text), TICKET_OPEN, now(), now(), now());
    tk = ticketById(res.lastInsertRowid);
    addMessage(tk.id, 'user', chat, null, text);
    await send(chat, '✅ استلمنا رسالتك (تذكرة <b>#' + tk.id + '</b>).\nسيتواصل معك فريق الدعم هنا في أقرب وقت.\n\nاكتب ما تريد إضافته في أي وقت، أو /close لإغلاق التذكرة.');
    await notifyAdminsNewTicket(tk, text);
  } else {
    addMessage(tk.id, 'user', chat, null, text);
    try { CTX.db.prepare('UPDATE sup_tickets SET updated_at = ?, last_user_at = ?, unread_admin = unread_admin + 1 WHERE id = ?').run(now(), now(), tk.id); } catch (e) {}
    if (tk.assignee_tg) await send(tk.assignee_tg, '💬 <b>رد جديد</b> على تذكرة #' + tk.id + ' من ' + esc(tk.username || 'زائر') + ':\n\n' + esc(cut(text, 400)) + '\n\nاكتب /r <نص> للرد.');
    else await notifyAdminsNewTicket(tk, text);
    /* طمأنة: إن لم يرد الفريق بعد على هذه التذكرة، أكّد للمستخدم أن رسالته وصلت */
    let anyAdminMsg = 0;
    try { anyAdminMsg = CTX.db.prepare("SELECT COUNT(*) c FROM sup_messages WHERE ticket_id = ? AND sender = 'admin'").get(tk.id).c; } catch (e) {}
    if (!anyAdminMsg) await send(chat, '📨 وصلت رسالتك الإضافية إلى <b>تذكرة #' + tk.id + '</b> — سيرد الفريق هنا.');
    else await tg('sendChatAction', { chat_id: String(chat), action: 'typing' });
  }
}
function guessCategory(text) {
  const t = String(text).toLowerCase();
  if (/إيداع|ايداع|deposit|دفع|تحويل|كاش|بنك|بنانس|binance|crypto|كريبتو/.test(t)) return '💳 المدفوعات';
  if (/سحب|withdraw|سحبت/.test(t)) return '💸 السحب';
  if (/كود|كوبون|voucher|تعبئة/.test(t)) return '🎟️ الأكواد';
  if (/لعبة|غرفة|خصم|رصيد|نقاط|لعبت/.test(t)) return '🎮 اللعب والرصيد';
  if (/حساب|دخول|كلمة|سجّل|تسجيل|2fa|تحقق/.test(t)) return '🔐 الحساب';
  return 'عام';
}

/* ── حالة الأدمن ── */
function stateGet(tg) { try { return CTX.db.prepare('SELECT * FROM sup_state WHERE tg_id = ?').get(String(tg)) || null; } catch (e) { return null; } }
function stateSet(tg, activeTicket, lastMsg) {
  try {
    const cur = stateGet(tg);
    CTX.db.prepare('INSERT OR REPLACE INTO sup_state (tg_id, active_ticket, last_msg_at) VALUES (?,?,?)')
      .run(String(tg), activeTicket == null ? (cur ? cur.active_ticket : null) : activeTicket, lastMsg == null ? (cur ? cur.last_msg_at : null) : lastMsg);
  } catch (e) {}
}

/* ── معالجة أوامر الأدمن ── */
async function adminCommand(chat, text, a) {
  const isSup = a.role === ROLE_SUPER;
  const st = stateGet(chat);
  const t = text.trim();

  /* /reply أو /r — الرد على التذكرة النشطة أو المحددة */
  let m = t.match(/^\/(?:reply|r)\s+(\d+)\s+([\s\S]+)$/) || t.match(/^\/(?:reply|r)\s+([\s\S]+)$/);
  if (m) {
    let tkId, body;
    if (m[2] !== undefined) { tkId = Number(m[1]); body = m[2]; } else { tkId = st && st.active_ticket; body = m[1]; }
    if (!tkId) { await send(chat, '⚠️ حدّد التذكرة: <code>/reply &lt;رقم&gt; &lt;نص&gt;</code> أو استلم تذكرة أولاً.'); return; }
    const tk = ticketById(tkId);
    if (!tk) { await send(chat, '⚠️ لا توجد تذكرة بالرقم ' + tkId); return; }
    if (!canAccessTicket(a, tk)) { await send(chat, '⛔ هذه التذكرة ليست في نطاقك (استلمها أولاً أو هي مخصّصة لأدمن آخر).'); return; }
    if (tk.status === TICKET_CLOSED) { await send(chat, '⚠️ التذكرة #' + tk.id + ' مغلقة — أعد فتحها بـ /reopen ' + tk.id); return; }
    addMessage(tk.id, 'admin', chat, a.name, body);
    try { CTX.db.prepare('UPDATE sup_tickets SET status = ?, assignee_tg = COALESCE(assignee_tg, ?), updated_at = ?, unread_user = unread_user + 1 WHERE id = ?')
      .run(tk.status === TICKET_OPEN ? TICKET_CLAIMED : tk.status, String(chat), now(), tk.id); } catch (e) {}
    await send(tk.tg_chat, '🛟 <b>رد فريق الدعم</b> (تذكرة #' + tk.id + '):\n\n' + esc(body) + '\n\n✍️ اكتب ردك هنا مباشرة.');
    await send(chat, '✅ أُرسل الرد إلى ' + esc(tk.username || 'الزائر') + ' (تذكرة #' + tk.id + ').');
    return;
  }

  switch ((t.split(/\s+/)[0] || '').toLowerCase().split('@')[0]) {
    case '/auth': {                                     /* توثيق السوبر أدمن (متوافق مع بوت المنصة) */
      const pin = (t.split(/\s+/)[1] || '');
      const okPin = process.env.TELEGRAM_ADMIN_PIN && pin === process.env.TELEGRAM_ADMIN_PIN;
      const okId = superTg() && String(chat) === superTg();
      if (okPin || (!process.env.TELEGRAM_ADMIN_PIN && okId)) { await send(chat, '✅ تم توثيقك كسوبر أدمن. /help لعرض كل الأوامر.'); audit(chat, a.name, 'auth', 'نجاح'); }
      else { await send(chat, '❌ رمز غير صحيح.'); audit(chat, a.name, 'auth', 'فشل'); }
      return;
    }
    case '/whoami':
      await send(chat, '🆔 معرّفك: <code>' + chat + '</code>\nالدور: <b>' + (isSup ? 'سوبر أدمن' : 'أدمن دعم') + '</b>\nالاسم: ' + esc(a.name || '-'));
      return;
    case '/queue': case '/tickets': {
      const scope = (t.split(/\s+/)[1] || '').toLowerCase();
      let rows;
      if (scope === 'all' || scope === 'closed') {
        if (!isSup) { await send(chat, '⛔ العرض الكامل (<code>all</code>/<code>closed</code>) للسوبر أدمن فقط.'); return; }
        rows = CTX.db.prepare("SELECT * FROM sup_tickets WHERE status = ? ORDER BY updated_at DESC LIMIT 20").all(scope === 'closed' ? TICKET_CLOSED : TICKET_OPEN).concat([]);
        if (scope === 'all') rows = CTX.db.prepare("SELECT * FROM sup_tickets ORDER BY updated_at DESC LIMIT 20").all();
      } else if (scope === 'mine') {
        rows = CTX.db.prepare("SELECT * FROM sup_tickets WHERE assignee_tg = ? AND status != ? ORDER BY updated_at DESC LIMIT 20").all(String(chat), TICKET_CLOSED);
      } else {
        rows = CTX.db.prepare("SELECT * FROM sup_tickets WHERE status = ? ORDER BY updated_at DESC LIMIT 20").all(TICKET_OPEN);
        if (isSup) rows = rows.concat(CTX.db.prepare("SELECT * FROM sup_tickets WHERE status = ? AND assignee_tg = ? ORDER BY updated_at DESC LIMIT 20").all(TICKET_CLAIMED, String(chat)));
      }
      if (!rows.length) { await send(chat, '📭 لا تذاكر في هذا العرض.'); return; }
      const lines = rows.map(tk => {
        const age = Math.max(0, Math.round((now() - tk.updated_at) / 60000));
        return '#' + tk.id + ' · ' + esc(tk.guest ? 'زائر' : (tk.username || tk.user_id)) + ' · ' + esc(tk.category) + ' · ' + statusAr(tk.status) +
          (tk.assignee_tg ? ' (' + esc(adminName(adminRow(tk.assignee_tg))) + ')' : '') + ' · منذ ' + age + 'د' +
          (tk.unread_admin ? ' · 🔴' + tk.unread_admin : '');
      });
      await send(chat, '📋 <b>التذاكر</b> (' + rows.length + ')\n\n' + lines.join('\n') + '\n\n/open &lt;رقم&gt; لعرض المحادثة واستلامها.');
      return;
    }
    case '/open': case '/claim': {
      const id = Number((t.split(/\s+/)[1] || '').replace('#', ''));
      const tk = ticketById(id);
      if (!tk) { await send(chat, '⚠️ لا توجد تذكرة بهذا الرقم.'); return; }
      if (!canAccessTicket(a, tk)) { await send(chat, '⛔ تذكرة الزوّار مقصورة على السوبر أدمن.'); return; }
      if (tk.assignee_tg && String(tk.assignee_tg) !== String(chat) && !isSup) {
        await send(chat, '⛔ التذكرة #' + tk.id + ' يستلمها ' + esc(adminName(adminRow(tk.assignee_tg))) + '. (السوبر أدمن وحده يمكنه سحبها منه)');
        return;
      }
      try { CTX.db.prepare('UPDATE sup_tickets SET status = ?, assignee_tg = ?, unread_admin = 0, updated_at = ? WHERE id = ?').run(TICKET_CLAIMED, String(chat), now(), tk.id); } catch (e) {}
      stateSet(chat, tk.id, null);
      const msgs = ticketMessages(tk.id, 30);
      await send(chat, ticketHeader(ticketById(tk.id), true) + '\n\n' + threadText(tk, msgs, true) +
        '\n\n— اكتب <code>/r النص</code> للرد · <code>/note النص</code> ملاحظة داخلية · <code>/close ' + tk.id + '</code> لإغلاقها.');
      audit(chat, a.name, 'claim', 'تذكرة #' + tk.id);
      return;
    }
    case '/note': {
      const mm = t.match(/^\/note\s+([\s\S]+)$/);
      let tkId = st && st.active_ticket, body = mm ? mm[1] : '';
      const withId = body.match(/^(\d+)\s+([\s\S]+)$/);
      if (withId) { tkId = Number(withId[1]); body = withId[2]; }
      if (!tkId || !body) { await send(chat, 'الاستعمال: <code>/note [رقم] النص</code>'); return; }
      const tk = ticketById(tkId);
      if (!tk || !canAccessTicket(a, tk)) { await send(chat, '⛔ غير متاح.'); return; }
      addMessage(tk.id, 'note', chat, a.name, body);
      await send(chat, '📝 حُفظت الملاحظة الداخلية على تذكرة #' + tk.id + ' (لا يراها المستخدم).');
      return;
    }
    case '/close': {
      const id = Number((t.split(/\s+/)[1] || '').replace('#', '')) || (st && st.active_ticket);
      const tk = ticketById(id);
      if (!tk) { await send(chat, '⚠️ لا توجد تذكرة بهذا الرقم.'); return; }
      if (!canAccessTicket(a, tk) && !isSup) { await send(chat, '⛔ ليست في نطاقك.'); return; }
      const reason = t.split(/\s+/).slice(2).join(' ').slice(0, 200);
      closeTicket(tk.id, chat, reason);
      await send(chat, '✅ أُغلقت التذكرة #' + tk.id + '.');
      await send(tk.tg_chat, '✅ أُغلقت تذكرة الدعم #' + tk.id + '.' + (reason ? '\nالسبب: ' + esc(reason) : '') + '\nيمكنك تقييم الخدمة أو فتح تذكرة جديدة بكتابة رسالة.');
      stateSet(chat, null, null);
      audit(chat, a.name, 'close', 'تذكرة #' + tk.id + ' ' + reason);
      return;
    }
    case '/reopen': {
      const tk = ticketById(Number((t.split(/\s+/)[1] || '').replace('#', '')));
      if (!tk) { await send(chat, '⚠️ لا توجد تذكرة بهذا الرقم.'); return; }
      if (!canAccessTicket(a, tk) && !isSup) { await send(chat, '⛔ ليست في نطاقك.'); return; }
      try { CTX.db.prepare('UPDATE sup_tickets SET status = ?, closed_at = NULL, updated_at = ? WHERE id = ?').run(tk.assignee_tg ? TICKET_CLAIMED : TICKET_OPEN, now(), tk.id); } catch (e) {}
      await send(chat, '🔄 أُعيد فتح التذكرة #' + tk.id + '.');
      await send(tk.tg_chat, '🔄 أُعيد فتح تذكرتك #' + tk.id + ' — تابع حديثك من هنا.');
      return;
    }
    case '/finance': {                                   /* ربط البوتين: سياق مالي داخل التذكرة (سوبر فقط) */
      if (!isSup) { await send(chat, '⛔ السياق المالي للسوبر أدمن فقط (خصوصية البيانات).'); return; }
      const tk = ticketById(Number((t.split(/\s+/)[1] || '').replace('#', '')) || (st && st.active_ticket));
      if (!tk || !tk.user_id) { await send(chat, '⚠️ تذكرة غير مرتبطة بحساب — لا سياق مالي.'); return; }
      const rows = walletContext(tk.user_id);
      await send(chat, '💳 <b>سياق مالي — تذكرة #' + tk.id + '</b>\n' + rows);
      return;
    }
    case '/stats': {
      if (!isSup) { await send(chat, '⛔ الإحصاءات للسوبر أدمن فقط.'); return; }
      const c = (q, ...a2) => { try { return CTX.db.prepare(q).get(...a2).c; } catch (e) { return -1; } };
      const avg = (() => { try { const r = CTX.db.prepare('SELECT AVG(closed_at - created_at) m FROM sup_tickets WHERE closed_at IS NOT NULL').get(); return r && r.m ? Math.round(r.m / 60000) + ' دقيقة' : '—'; } catch (e) { return '—'; } })();
      await send(chat, '📊 <b>إحصاءات الدعم</b>\n' +
        'مفتوحة: ' + c("SELECT COUNT(*) c FROM sup_tickets WHERE status='open'") + '\n' +
        'قيد المعالجة: ' + c("SELECT COUNT(*) c FROM sup_tickets WHERE status='claimed'") + '\n' +
        'مغلقة: ' + c("SELECT COUNT(*) c FROM sup_tickets WHERE status='closed'") + '\n' +
        'رسائل المستخدمين: ' + c("SELECT COUNT(*) c FROM sup_messages WHERE sender='user'") + '\n' +
        'مستخدمون مرتبطون: ' + c('SELECT COUNT(*) c FROM sup_users') + '\n' +
        'أدمنز نشطون: ' + c('SELECT COUNT(*) c FROM sup_admins WHERE active=1') + '\n' +
        'متوسط زمن الإغلاق: ' + avg);
      return;
    }
    case '/admins': {
      if (!isSup) { await send(chat, '⛔ إدارة الأدمنز للسوبر أدمن فقط.'); return; }
      const rows = activeAdminRows();
      await send(chat, '👥 <b>أدمنز الدعم</b> (' + rows.length + ')\n\n' + rows.map(x =>
        (x.role === ROLE_SUPER ? '👑 سوبر أدمن — ' : '🛟 أدمن دعم — ') + esc(x.name || x.tg_id) + ' · <code>' + esc(x.tg_id) + '</code>' + (String(x.notify) === '0' ? ' (بلا إشعارات)' : '')).join('\n') +
        '\n\nإضافة: <code>/addadmin &lt;id&gt; الاسم</code>\nإزالة: <code>/deladmin &lt;id&gt;</code>');
      return;
    }
    case '/addadmin': {
      if (!isSup) { await send(chat, '⛔ إضافة أدمنز للسوبر أدمن فقط.'); return; }
      const mm = t.match(/^\/addadmin\s+(\d+)\s*([\s\S]*)$/);
      if (!mm) { await send(chat, 'الاستعمال: <code>/addadmin &lt;معرّف تيليغرام&gt; [الاسم]</code>\n(يرسل لك الأدمن المرشح <code>/whoami</code> ليعطيك معرّفه)'); return; }
      const id = mm[1], nm = (mm[2] || '').trim() || ('أدمن-' + id.slice(-4));
      try { CTX.db.prepare('INSERT OR REPLACE INTO sup_admins (tg_id, name, role, added_by, added_at, active, notify) VALUES (?,?,?,?,?,1,1)').run(id, nm, ROLE_ADMIN, String(chat), now()); } catch (e) {}
      await send(chat, '✅ أُضيف <b>' + esc(nm) + '</b> (<code>' + id + '</code>) كأدمن دعم.');
      await syncAdminCommands(id);
      await send(id, '🛟 مرحباً! أضافك السوبر أدمن كـ<b>أدمن دعم</b> في DTSG.\nستصلك التذاكر هنا — /queue لعرضها، /open &lt;رقم&gt; لاستلامها، /r النص للرد.\nالقواعد: لا تشارك بيانات المستخدمين، وكل رد يمر عبر البوت (هويتك محفوظة).');
      audit(chat, a.name, 'addadmin', nm + ' ' + id);
      return;
    }
    case '/deladmin': {
      if (!isSup) { await send(chat, '⛔ للسوبر أدمن فقط.'); return; }
      const id = (t.split(/\s+/)[1] || '').trim();
      if (!id || id === superTg()) { await send(chat, '⚠️ لا يمكن إزالة المالك.'); return; }
      const row = adminRow(id);
      if (!row) { await send(chat, '⚠️ غير موجود.'); return; }
      try { CTX.db.prepare('UPDATE sup_admins SET active = 0 WHERE tg_id = ?').run(id); } catch (e) {}
      await send(chat, '✅ أُزيل ' + esc(row.name || id) + '.');
      await send(id, 'ℹ️ أُنهيت صلاحيتك كأدمن دعم.');
      audit(chat, a.name, 'deladmin', (row.name || '') + ' ' + id);
      return;
    }
    case '/notify': {                                     /* تشغيل/إيقاف إشعارات أدمن (لكل أدمن نفسه) */
      const v = (t.split(/\s+/)[1] || '').toLowerCase();
      if (v !== 'on' && v !== 'off') { await send(chat, 'الاستعمال: /notify on|off'); return; }
      try { CTX.db.prepare('UPDATE sup_admins SET notify = ? WHERE tg_id = ?').run(v === 'on' ? 1 : 0, String(chat)); } catch (e) {}
      await send(chat, v === 'on' ? '🔔 الإشعارات مفعّلة.' : '🔕 الإشعارات موقوفة (تبقى التذاكر في /queue).');
      return;
    }
    case '/ban': case '/unban': {
      if (!isSup) { await send(chat, '⛔ الحظر للسوبر أدمن فقط.'); return; }
      const id = (t.split(/\s+/)[1] || '').trim();
      if (!id) { await send(chat, 'الاستعمال: /ban &lt;معرّف المستخدم في المنصة أو معرّف تيليغرام&gt; [السبب]'); return; }
      const reason = t.split(/\s+/).slice(2).join(' ').slice(0, 120);
      const tgId = String(id);
      const byUser = CTX.db.prepare('SELECT tg_chat FROM sup_users WHERE user_id = ?').get(tgId);
      const target = byUser ? byUser.tg_chat : tgId;
      const banned = t.split(/\s+/)[0].toLowerCase() === '/ban' ? 1 : 0;
      try { CTX.db.prepare('INSERT OR IGNORE INTO sup_users (tg_chat, linked_at) VALUES (?, ?)').run(String(target), now()); } catch (e) {}
      try { CTX.db.prepare('UPDATE sup_users SET blocked = ? WHERE tg_chat = ?').run(banned, String(target)); } catch (e) {}
      await send(chat, banned ? ('🚫 حُظر <code>' + esc(target) + '</code>' + (reason ? ' — ' + esc(reason) : '')) : ('✅ رُفع الحظر عن <code>' + esc(target) + '</code>'));
      if (banned) await send(target, '🚫 أُوقف وصولك إلى الدعم. للاعتراض تواصل عبر البريد الرسمي.');
      audit(chat, a.name, banned ? 'ban' : 'unban', target + ' ' + reason);
      return;
    }
    case '/broadcast': {                                  /* بثّ للمستخدمين المرتبطين (سوبر فقط) */
      if (!isSup) { await send(chat, '⛔ البثّ للسوبر أدمن فقط.'); return; }
      const mm = t.match(/^\/broadcast\s+([\s\S]+)$/);
      if (!mm) { await send(chat, 'الاستعمال: <code>/broadcast النص</code> — يُرسل لكل المستخدمين المرتبطين.'); return; }
      const users = CTX.db.prepare('SELECT tg_chat FROM sup_users WHERE blocked = 0').all();
      let sent = 0;
      for (const u of users) { const r = await send(u.tg_chat, '📢 <b>إعلان المنصة</b>\n\n' + esc(mm[1])); if (r && r.ok) sent++; }
      await send(chat, '📢 أُرسل الإعلان إلى ' + sent + ' / ' + users.length + ' مستخدم.');
      audit(chat, a.name, 'broadcast', String(sent) + ' مستخدم');
      return;
    }
    case '/user': {                                       /* بيانات حساب (سوبر فقط — خصوصية) */
      if (!isSup) { await send(chat, '⛔ بيانات الحسابات للسوبر أدمن فقط.'); return; }
      const q = (t.split(/\s+/)[1] || '').trim();
      if (!q) { await send(chat, 'الاستعمال: /user &lt;المعرّف أو اسم المستخدم&gt;'); return; }
      const u = platformUser(q) || Object.values(CTX.users).find(x => x.username && x.username.toLowerCase() === q.toLowerCase());
      if (!u) { await send(chat, '⚠️ لا يوجد مستخدم بهذا المعرّف.'); return; }
      const link = CTX.db.prepare('SELECT * FROM sup_users WHERE user_id = ?').get(String(u.id));
      const tk = CTX.db.prepare('SELECT COUNT(*) c FROM sup_tickets WHERE user_id = ?').get(String(u.id));
      await send(chat, '👤 <b>' + esc(u.username) + '</b> (<code>' + u.id + '</code>)\n' +
        'الدور: ' + esc(u.role) + ' · الكوينز: ' + Number(u.gold || 0).toLocaleString('ar-MA') + '\n' +
        'مرتبط بتيليغرام: ' + (link ? 'نعم ✅' : 'لا') + (link && link.blocked ? ' · 🚫 محظور' : '') + '\n' +
        'تذاكر: ' + tk.c + '\n\n' + walletContext(u.id));
      return;
    }
    case '/audit': {
      if (!isSup) { await send(chat, '⛔ السجل للسوبر أدمن فقط.'); return; }
      const n = Math.min(30, Math.max(1, Number(t.split(/\s+/)[1] || 10)));
      const rows = CTX.db.prepare('SELECT * FROM sup_audit ORDER BY id DESC LIMIT ?').all(n);
      await send(chat, '🗂️ <b>آخر ' + rows.length + ' إجراء</b>\n\n' + (rows.map(r =>
        new Date(r.ts).toISOString().slice(5, 16).replace('T', ' ') + ' · ' + esc(r.actor_name || r.actor_tg) + ' → <b>' + esc(r.action) + '</b> ' + esc(cut(r.detail || '', 80))).join('\n') || '—'));
      return;
    }
    case '/setting': {
      if (!isSup) { await send(chat, '⛔ الإعدادات للسوبر أدمن فقط.'); return; }
      const mm = t.match(/^\/setting\s+(\w+)\s*([\s\S]*)$/);
      if (!mm) { await send(chat, 'الإعدادات: ' + ['support_open', 'admins_view_balance', 'show_admin_names', 'auto_close_hours'].map(k => '<code>' + k + '=' + esc(setting(k, '')) + '</code>').join(' · ')); return; }
      setSetting(mm[1], mm[2].trim()); await send(chat, '✅ <code>' + esc(mm[1]) + '</code> = ' + esc(mm[2].trim())); audit(chat, a.name, 'setting', mm[1] + '=' + mm[2]);
      return;
    }
    case '/export': {
      if (!isSup && !a.role) { await send(chat, '⛔'); return; }
      const tk = ticketById(Number((t.split(/\s+/)[1] || '').replace('#', '')));
      if (!tk) { await send(chat, '⚠️ لا توجد تذكرة بهذا الرقم.'); return; }
      if (!canAccessTicket(a, tk)) { await send(chat, '⛔ ليست في نطاقك.'); return; }
      await send(chat, '🧾 <b>محضر تذكرة #' + tk.id + '</b>\n' + ticketHeader(tk, true) + '\n\n' + threadText(tk, ticketMessages(tk.id, 200), true));
      return;
    }
    case '/help': await send(chat, adminHelp(isSup)); return;
    case '/start':
      await send(chat, '🛟 <b>بوت دعم DTSG — وضع الأدمن</b>\nأنت مسجَّل كـ' + (isSup ? '👑 سوبر أدمن' : '🛟 أدمن دعم') + '.\n\n' + adminHelp(isSup));
      return;
  }
  /* أمر غير معروف للأدمن */
  await send(chat, '🤔 أمر غير معروف. /help للأوامر المتاحة.');
}
function closeTicket(id, byTg, reason) {
  try { CTX.db.prepare("UPDATE sup_tickets SET status = 'closed', closed_at = ?, updated_at = ?, close_reason = ? WHERE id = ?").run(now(), now(), String(reason || ''), Number(id)); } catch (e) {}
}
/* صلاحية الوصول للتذكرة: السوبر يرى الكل · الأدمن يرى غير المستلمة أو المستلمة من قبله */
function canAccessTicket(a, tk) {
  if (!tk) return false;
  if (a.role === ROLE_SUPER) return true;
  if (guestsOnly(tk)) return false;                       /* تذاكر الزوّار: سوبر فقط */
  if (!tk.assignee_tg) return true;
  return String(tk.assignee_tg) === String(a.tg_id);
}
function walletContext(userId) {
  const out = [];
  try {
    const bal = (() => { try { return CTX.db.prepare('SELECT SUM(amount_usd) s FROM pay_transactions WHERE user_id = ? AND type = ? AND status = ?').get(String(userId), 'withdrawal', 'completed').s || 0; } catch (e) { return 0; } })();
    const txs = CTX.db.prepare('SELECT id, type, amount_usd, method, status, created_at FROM pay_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 5').all(String(userId));
    out.push('آخر المعاملات:\n' + (txs.length ? txs.map(t => '· ' + esc(t.type) + ' ' + t.amount_usd + ' USD · ' + esc(t.method || '-') + ' · ' + esc(t.status)).join('\n') : '—'));
    if (bal) out.push('سحوبات مكتملة: ' + bal + ' USD');
  } catch (e) { out.push('(لا سجل معاملات)'); }
  return out.join('\n');
}
function adminHelp(isSup) {
  return '📋 <b>أوامر أدمن الدعم</b>\n' +
    '/queue — التذاكر المفتوحة · /queue mine — تذاكري · /open &lt;رقم&gt; استلام\n' +
    '/r النص — رد على التذكرة النشطة · /reply &lt;رقم&gt; النص\n' +
    '/note النص — ملاحظة داخلية · /close [رقم] · /reopen &lt;رقم&gt;\n' +
    '/notify on|off — إشعاراتي · /export &lt;رقم&gt; محضر · /whoami\n' +
    (isSup ? '\n👑 <b>سوبر أدمن</b>\n/admins · /addadmin &lt;id&gt; الاسم · /deladmin &lt;id&gt; · /broadcast النص\n/user &lt;معرّف&gt; · /finance [رقم] · /stats · /audit [عدد] · /setting · /ban · /unban' : '');
}
async function syncAdminCommands(tgId) {
  try {
    await tg('setMyCommands', {
      scope: { type: 'chat', chat_id: Number(tgId) },
      commands: [
        { command: 'queue', description: 'التذاكر المفتوحة' }, { command: 'open', description: 'استلام/عرض تذكرة' },
        { command: 'r', description: 'رد على التذكرة النشطة' }, { command: 'note', description: 'ملاحظة داخلية' },
        { command: 'close', description: 'إغلاق تذكرة' }, { command: 'notify', description: 'إشعارات on/off' },
        { command: 'whoami', description: 'معرّفي ودوري' }, { command: 'help', description: 'الأوامر' }
      ]
    });
  } catch (e) {}
}

/* ── أوامر المستخدم ── */
async function userCommand(chat, text) {
  const su = supUser(chat);
  const cmd = (text.split(/\s+/)[0] || '').toLowerCase().split('@')[0];
  if (su && su.blocked) { await send(chat, '🚫 وصولك للدعم موقوف.'); return; }

  if (cmd === '/id' || cmd === '/whoami') { await send(chat, '🆔 معرّفك في تيليغرام: <code>' + chat + '</code>' + (su ? '\nحسابك في المنصة: <b>' + esc(su.username || su.user_id) + '</b>' : '')); return; }

  if (cmd === '/start') {
    const code = (text.split(/\s+/)[1] || '').trim();
    if (code) {
      const r = consumeLinkCode(code);
      if (!r) { await send(chat, '⚠️ كود الربط غير صالح أو منتهٍ. اطلب كوداً جديداً من صفحة الدعم في المنصة.'); return; }
      const u = platformUser(r.user_id);
      linkUser(chat, r.user_id, u ? u.username : '');
      audit(chat, 'مستخدم', 'link', 'user ' + r.user_id);
      await send(chat, '🔗 <b>تم ربط حسابك</b>' + (u ? ' (' + esc(u.username) + ')' : '') + ' ببوت الدعم.\n\n' +
        'أرسل رسالتك في أي وقت ليصل فريق الدعم، ويمكنك:\n/status — متابعة تذاكرك · /account — حسابك · /close — إغلاق التذكرة · /unlink — فصل الحساب');
      return;
    }
    await send(chat, '🛟 <b>مرحباً بك في دعم DTSG</b>\n' +
      (su ? 'حسابك مرتبط: <b>' + esc(su.username || su.user_id) + '</b>' : '⚠️ حسابك غير مرتبط بالمنصة بعد — اربطه من صفحة الدعم: https://dtsg.pages.dev/support.html') +
      '\n\nاكتب مشكلتك هنا وسيصلك رد فريق الدعم في هذه المحادثة نفسها.\n\n/status · /account · /close · /help');
    return;
  }
  if (cmd === '/help') {
    await send(chat, '🛟 <b>مساعدة</b>\n' +
      'اكتب رسالتك → تُفتح تذكرة ويجيبك الفريق هنا.\n' +
      '/status — تذاكرك وردودها\n/account — رصيدك وآخر معاملاتك\n/close — إغلاق تذكرتك\n' +
      (su ? '/unlink — فصل حسابك عن البوت\n' : '🔗 الربط: https://dtsg.pages.dev/support.html\n') +
      'الخصوصية: فريق الدعم يرى اسمك في المنصة فقط، ولا تُكشف أرقام أو هويات.');
    return;
  }
  if (cmd === '/status') {
    let rows = [];
    try { rows = CTX.db.prepare('SELECT * FROM sup_tickets WHERE tg_chat = ? ORDER BY id DESC LIMIT 5').all(String(chat)); } catch (e) {}
    if (!rows.length) { await send(chat, '📭 لا تذاكر بعد — اكتب مشكلتك الآن وسنستقبلها.'); return; }
    const out = rows.map(tk => {
      const last = ticketMessages(tk.id, 1);
      const lastAdmin = (() => { try { return CTX.db.prepare("SELECT * FROM sup_messages WHERE ticket_id = ? AND sender = 'admin' ORDER BY id DESC LIMIT 1").get(tk.id) || null; } catch (e) { return null; } })();
      return '#' + tk.id + ' · ' + statusAr(tk.status) + ' · ' + esc(tk.category) + '\n' +
        (lastAdmin ? '🛟 ' + esc(cut(lastAdmin.text, 120)) : '⏳ بانتظار رد الفريق');
    });
    await send(chat, '📋 <b>تذاكرك</b>\n\n' + out.join('\n\n'));
    return;
  }
  if (cmd === '/account') {
    if (!su) { await send(chat, '🔗 اربط حسابك أولاً من https://dtsg.pages.dev/support.html'); return; }
    const u = platformUser(su.user_id);
    await send(chat, '👤 <b>' + esc(su.username || su.user_id) + '</b>\n💰 الكوينز: ' + (u ? Number(u.gold || 0).toLocaleString('ar-MA') : '—') + '\n\n' + walletContext(su.user_id));
    return;
  }
  if (cmd === '/close') {
    const tk = openTicketOf(chat);
    if (!tk) { await send(chat, 'لا تذكرة مفتوحة.'); return; }
    closeTicket(tk.id, chat, 'أغلقها المستخدم');
    await send(chat, '✅ أُغلقت تذكرتك #' + tk.id + '. شكراً لتواصلك — يمكنك فتح تذكرة جديدة بأي رسالة.');
    if (tk.assignee_tg) await send(tk.assignee_tg, 'ℹ️ أغلق المستخدم تذكرة #' + tk.id + '.');
    return;
  }
  if (cmd === '/unlink') {
    unlinkUser(chat);
    await send(chat, '🔓 فُصل حسابك عن البوت. أعد الربط من https://dtsg.pages.dev/support.html في أي وقت.');
    return;
  }
  if (cmd === '/privacy') {
    await send(chat, '🔒 <b>الخصوصية</b>\n· فريق الدعم يرى اسم مستخدمك في المنصة ورقم التذكرة فقط.\n· لا يرى أحد رقم هاتفك أو بريدك أو معرّفك في تيليغرام.\n· ملاحظات الفريق الداخلية لا تُرسل إليك، ومحادثاتك لا تُشارَك مع أدمنز آخرين إلا بموافقة السوبر أدمن.\n· يمكنك /unlink في أي وقت لحذف الربط.');
    return;
  }
  await send(chat, '🤔 أمر غير معروف — اكتب مشكلتك مباشرة أو /help');
}

/* ── نقطة الدخول: تحديث واحد من تيليغرام ── */
async function handleUpdate(up) {
  try {
    if (!CTX) return { ok: false, error: 'no-ctx' };

    if (up.callback_query) { await handleCallback(up.callback_query); return { ok: true }; }
    const msg = up.message || up.edited_message;
    if (!msg || !msg.chat) return { ok: true };
    const chat = String((msg.chat && msg.chat.id) != null ? msg.chat.id : '');
    const text = String(msg.text || msg.caption || '').trim();
    if (!text) { await send(chat, '📎 استلمنا المرفق. اكتب وصفاً نصياً للمشكلة (الصور تُرفع من المنصة).'); return { ok: true }; }

    /* الأدمنز يعملون دائماً — حتى لو أُوقف استقبال رسائل المستخدمين (وإلا تعذّر إعادة التشغيل) */
    const a = adminRow(chat);
    if (a) { await adminCommand(chat, text, { tg_id: chat, name: a.name, role: a.role }); return { ok: true }; }

    if (setting('support_open', '1') !== '1') {
      await send(chat, '⏳ الدعم متوقف مؤقتاً للصيانة. يمكنك مراسلتنا لاحقاً — أو استعمل المنصة مباشرة: https://dtsg.pages.dev/support.html');
      return { ok: true, skipped: 'closed' };
    }
    if (text.startsWith('/')) { await userCommand(chat, text); return { ok: true }; }
    await userSay(chat, text, msg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/* أزرار الإشعارات (تعمل من بوت الدعم ومن بوت المنصة معاً) */
async function handleCallback(cq) {
  const chat = String(cq.from.id);
  const data = String(cq.data || '');
  const a = adminRow(chat);
  /* [v2.41.1] أزرار الموافقة المالية (dapp/drej/wapp/wrej) تصل عبر بوت الدعم أيضاً */
  const pay = data.match(/^(dapp|drej|wapp|wrej)_(.+)$/);
  if (pay) {
    if (!a) { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'غير مصرّح' }); await send(chat, '⛔ أزرار الموافقة المالية لأدمنز الدعم فقط.'); return { ok: false }; }
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: '⏳ جارٍ التنفيذ…' });
    const fn = CTX && CTX.hooks && CTX.hooks.payAction;
    if (!fn) { await send(chat, '⚠️ وحدة المدفوعات غير مربوطة بعد — نفّذ تحديث الخادم.'); return { ok: false }; }
    const r = await fn(pay[1], pay[2], { tg_id: chat, name: a.name });
    await send(chat, (r && r.ok) ? ('✅ ' + ({ dapp: 'تم تأكيد الإيداع وشحن الرصيد.', drej: 'تم رفض الإيداع.', wapp: 'تم تأكيد السحب.', wrej: 'تم رفض السحب وإعادة الرصيد.' }[pay[1]] || 'تم.') + '\nالمرجع: <code>' + esc(pay[2]) + '</code>')
      : ('⚠️ تعذّر التنفيذ: ' + esc((r && r.error) || 'خطأ') + (r && r.error === 'already-completed' ? ' (المعاملة مُعالجة سلفاً)' : '')));
    audit(chat, a.name, 'pay-' + pay[1], String(pay[2]));
    return { ok: true };
  }
  await tg('answerCallbackQuery', { callback_query_id: cq.id, text: a ? '' : 'غير مصرّح' });
  const m = data.match(/^(supc|supx|supr)_(\d+)$/);
  if (!m) return { ok: false };
  if (!a) { await send(chat, '⛔ هذا الزر لأدمنز الدعم فقط.'); return { ok: false }; }
  const tk = ticketById(Number(m[2]));
  if (!tk) { await send(chat, '⚠️ التذكرة غير موجودة.'); return { ok: false }; }
  if (!canAccessTicket(a, tk)) { await send(chat, '⛔ تذكرة زائر/مخصّصة — السوبر أدمن فقط.'); return { ok: false }; }
  if (m[1] === 'supc') {
    if (tk.assignee_tg && String(tk.assignee_tg) !== chat && a.role !== ROLE_SUPER) {
      await send(chat, '⛔ يستلمها ' + esc(adminName(adminRow(tk.assignee_tg))) + ' حالياً.'); return { ok: true };
    }
    try { CTX.db.prepare('UPDATE sup_tickets SET status = ?, assignee_tg = ?, unread_admin = 0, updated_at = ? WHERE id = ?').run(TICKET_CLAIMED, chat, now(), tk.id); } catch (e) {}
    stateSet(chat, tk.id, null);
    await send(chat, ticketHeader(ticketById(tk.id), true) + '\n\n' + threadText(tk, ticketMessages(tk.id, 30), true) + '\n\nاكتب <code>/r النص</code> للرد.');
    await send(tk.tg_chat, '🛟 استلم فريق الدعم تذكرتك #' + tk.id + ' — سيصلك الرد هنا.');
    audit(chat, a.name, 'claim', 'تذكرة #' + tk.id);
  } else if (m[1] === 'supr') {
    stateSet(chat, tk.id, null);
    await send(chat, '✍️ اكتب الآن <code>/r النص</code> للرد على تذكرة #' + tk.id + '.');
  } else if (m[1] === 'supx') {
    closeTicket(tk.id, chat, 'إغلاق من الإشعار');
    await send(chat, '✅ أُغلقت التذكرة #' + tk.id + '.');
    await send(tk.tg_chat, '✅ أُغلقت تذكرة الدعم #' + tk.id + '.');
    audit(chat, a.name, 'close', 'تذكرة #' + tk.id);
  }
  return { ok: true };
}

/* ── واجهة REST للمنصة (صفحة الدعم) ── */
function userFromSession(req) {
  const h = (req && req.headers) || {};
  const c = String((typeof h.get === 'function' ? h.get('cookie') : h.cookie) || '');
  const m = c.match(/(?:^|;\s*)sid=([^;]+)/);
  if (!m) return null;
  const uid = CTX.sessions[decodeURIComponent(m[1])];
  return uid != null ? (CTX.users[uid] || null) : null;
}
function myTickets(userId) {
  let rows = [];
  try { rows = CTX.db.prepare('SELECT id, subject, category, status, created_at, updated_at, close_reason FROM sup_tickets WHERE user_id = ? ORDER BY id DESC LIMIT 10').all(String(userId)); } catch (e) {}
  return rows.map(tk => {
    let msgs = [];
    try { msgs = CTX.db.prepare("SELECT sender, admin_name, text, created_at FROM sup_messages WHERE ticket_id = ? AND sender != 'note' ORDER BY id ASC LIMIT 50").all(tk.id); } catch (e) {}
    return Object.assign({}, tk, { messages: msgs.map(m => ({ from: m.sender === 'user' ? 'me' : 'support', name: setting('show_admin_names', '0') === '1' ? (m.admin_name || 'الدعم') : 'فريق الدعم', text: m.text, ts: m.created_at })) });
  });
}
function queueFor(role, tgId) {
  try {
    if (role === ROLE_SUPER) return CTX.db.prepare('SELECT id, user_id, username, guest, subject, category, status, assignee_tg, created_at, updated_at, unread_admin FROM sup_tickets WHERE status != ? ORDER BY updated_at DESC LIMIT 50').all(TICKET_CLOSED);
    return CTX.db.prepare('SELECT id, user_id, username, guest, subject, category, status, assignee_tg, created_at, updated_at, unread_admin FROM sup_tickets WHERE status != ? AND guest = 0 AND (assignee_tg IS NULL OR assignee_tg = ?) ORDER BY updated_at DESC LIMIT 50').all(TICKET_CLOSED, String(tgId || ''));
  } catch (e) { return []; }
}
async function platformReply(user, tkId, text) {
  const tk = ticketById(tkId);
  if (!tk) return { ok: false, error: 'not-found' };
  const a = adminRow(user.telegram_id);
  const isSup = user.role === 'super';
  if (!isSup && (!a || a.role !== ROLE_ADMIN)) return { ok: false, error: 'forbidden' };
  if (guestsOnly(tk) && !isSup) return { ok: false, error: 'forbidden' };
  if (!isSup && tk.assignee_tg && String(tk.assignee_tg) !== String(user.telegram_id)) return { ok: false, error: 'claimed-by-other' };
  if (tk.status === TICKET_CLOSED) return { ok: false, error: 'closed' };
  addMessage(tk.id, 'admin', user.telegram_id || ('web:' + user.id), user.username, text);
  try { CTX.db.prepare('UPDATE sup_tickets SET status = ?, assignee_tg = COALESCE(assignee_tg, ?), updated_at = ?, unread_user = unread_user + 1 WHERE id = ?')
    .run(tk.status === TICKET_OPEN ? TICKET_CLAIMED : tk.status, user.telegram_id || null, now(), tk.id); } catch (e) {}
  await send(tk.tg_chat, '🛟 <b>رد فريق الدعم</b> (تذكرة #' + tk.id + '):\n\n' + esc(text) + '\n\n✍️ اكتب ردك هنا مباشرة.');
  audit(user.telegram_id || user.id, user.username, 'reply-web', 'تذكرة #' + tk.id);
  return { ok: true };
}
async function platformClose(user, tkId, reason) {
  const tk = ticketById(tkId);
  if (!tk) return { ok: false, error: 'not-found' };
  if (user.role !== 'super' && guestsOnly(tk)) return { ok: false, error: 'forbidden' };
  closeTicket(tk.id, user.telegram_id || user.id, reason);
  await send(tk.tg_chat, '✅ أُغلقت تذكرة الدعم #' + tk.id + '.' + (reason ? '\nالسبب: ' + esc(reason) : ''));
  audit(user.telegram_id || user.id, user.username, 'close-web', 'تذكرة #' + tk.id);
  return { ok: true };
}
async function platformClaim(user, tkId) {
  const tk = ticketById(tkId);
  if (!tk) return { ok: false, error: 'not-found' };
  if (user.role !== 'super' && guestsOnly(tk)) return { ok: false, error: 'forbidden' };
  try { CTX.db.prepare('UPDATE sup_tickets SET status = ?, assignee_tg = ?, updated_at = ? WHERE id = ?').run(TICKET_CLAIMED, String(user.telegram_id || ('web:' + user.id)), now(), tk.id); } catch (e) {}
  return { ok: true };
}

/* ── [v2.41.1] رسائل المستخدم من ودجت المنصة (المنصة ↔ بوت الدعم) ──
   الرسالة تُسجَّل في نفس التذكرة والمسار الذي يستعمله البوت، فيرى المستخدم
   رد الأدمن في المنصة وفي تيليغرام، ويرى الأدمن رسالة المنصة في تيليغرام. */
function supUserLinked(userId) {
  try { return CTX.db.prepare('SELECT * FROM sup_users WHERE user_id = ? ORDER BY linked_at DESC LIMIT 1').get(String(userId)) || null; } catch (e) { return null; }
}
function openTicketOfUser(userId) {
  try { return CTX.db.prepare("SELECT * FROM sup_tickets WHERE user_id = ? AND status IN ('open','claimed') ORDER BY id DESC LIMIT 1").get(String(userId)) || null; } catch (e) { return null; }
}
async function platformSay(user, text) {
  if (!user) return { ok: false, error: 'unauthorized' };
  text = cut(String(text == null ? '' : text).trim(), 1500);
  if (!text) return { ok: false, error: 'empty' };
  const su = supUserLinked(user.id);
  if (su && su.blocked) return { ok: false, error: 'blocked' };
  const chat = su ? String(su.tg_chat) : ('web:' + user.id);
  let recent = 0;
  try { recent = CTX.db.prepare('SELECT COUNT(*) c FROM sup_messages WHERE tg_chat = ? AND sender = ? AND created_at > ?').get(String(chat), 'user', now() - 60000).c; } catch (e) {}
  if (recent >= MSG_PER_MIN) return { ok: false, error: 'too-many' };
  let tk = openTicketOfUser(user.id);
  if (!tk) {
    const res = CTX.db.prepare('INSERT INTO sup_tickets (user_id, username, tg_chat, guest, subject, category, status, created_at, updated_at, last_user_at, unread_admin) VALUES (?,?,?,0,?,?,?,?,?,?,1)')
      .run(String(user.id), user.username || null, chat, cut(text, 70), guessCategory(text), TICKET_OPEN, now(), now(), now());
    tk = ticketById(res.lastInsertRowid);
    addMessage(tk.id, 'user', chat, null, text);
    if (su) await send(chat, '✅ استلمنا رسالتك من المنصة (تذكرة <b>#' + tk.id + '</b>).\nسيرد فريق الدعم هنا وفي المنصة معاً.');
    await notifyAdminsNewTicket(tk, '[من المنصة] ' + text);
    return { ok: true, ticket: tk.id, created: true };
  }
  addMessage(tk.id, 'user', chat, null, text);
  try { CTX.db.prepare('UPDATE sup_tickets SET updated_at = ?, last_user_at = ?, unread_admin = unread_admin + 1 WHERE id = ?').run(now(), now(), tk.id); } catch (e) {}
  if (tk.assignee_tg) {
    await send(tk.assignee_tg, '💬 <b>رسالة من المنصة</b> على تذكرة #' + tk.id + ' من ' + esc(tk.username || user.username || 'مستخدم') + ':\n\n' + esc(cut(text, 400)) + '\n\nاكتب /r <نص> للرد.');
  } else {
    await notifyAdminsNewTicket(tk, '[من المنصة] ' + text);
  }
  return { ok: true, ticket: tk.id, created: false };
}

/* ── توجيه HTTP (يُستدعى من server.js) ── */
const SUP_PATHS = ['/api/support/webhook', '/api/support/message', '/api/support/link-code', '/api/support/my-tickets', '/api/support/unlink', '/api/support/status', '/api/support/admin/queue', '/api/support/admin/reply', '/api/support/admin/close', '/api/support/admin/claim'];
function isSupportPath(p) { return SUP_PATHS.indexOf(p) >= 0; }

function json(res, obj, code) { res.writeHead(code || 200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }

async function handleHttp(req, res, pathname, bodyStr, query) {
  /* ويب هوك تيليغرام (سرّي) */
  if (pathname === '/api/support/webhook') {
    const secret = process.env.SUPPORT_WEBHOOK_SECRET || '';
    const got = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    if (secret && got !== secret) { json(res, { ok: false, error: 'forbidden' }, 403); return; }
    let up = {};
    try { up = JSON.parse(bodyStr || '{}'); } catch (e) { json(res, { ok: false, error: 'bad-json' }, 400); return; }
    const r = await handleUpdate(up);
    json(res, r, r.ok ? 200 : 500);
    return;
  }
  const me = userFromSession(req);
  if (!me) { json(res, { ok: false, error: 'unauthorized' }, 401); return; }

  if (pathname === '/api/support/link-code' && req.method === 'POST') {
    const su = supUser(me.telegram_id || '__none__');
    const code = makeLinkCode(me.id);
    json(res, { ok: true, code: code, url: publicBotLink(code), bot: process.env.SUPPORT_BOT_USERNAME || 'dtsgsupports_bot', linked: !!(me.telegram_id || (su && su.user_id)), expires_min: 30 });
    return;
  }
  if (pathname === '/api/support/status') {
    const su = CTX.db.prepare('SELECT tg_chat, linked_at FROM sup_users WHERE user_id = ?').get(String(me.id));
    json(res, { ok: true, linked: !!su, tickets: myTickets(me.id), is_admin: (me.role === 'admin' || me.role === 'super'), role: me.role, bot_url: publicBotLink() });
    return;
  }
  if (pathname === '/api/support/my-tickets') { json(res, { ok: true, tickets: myTickets(me.id) }); return; }
  if (pathname === '/api/support/message' && req.method === 'POST') {
    let b = {}; try { b = JSON.parse(bodyStr || '{}'); } catch (e) {}
    const r = await platformSay(me, b.text);
    json(res, r, r.ok ? 200 : (r.error === 'unauthorized' ? 401 : 400));
    return;
  }
  if (pathname === '/api/support/unlink' && req.method === 'POST') {
    unlinkUser(me.telegram_id || '__none__');
    CTX.db.prepare('DELETE FROM sup_users WHERE user_id = ?').run(String(me.id));
    json(res, { ok: true });
    return;
  }
  if (pathname.startsWith('/api/support/admin/')) {
    if (me.role !== 'admin' && me.role !== 'super') { json(res, { ok: false, error: 'forbidden' }, 403); return; }
    let b = {}; try { b = JSON.parse(bodyStr || '{}'); } catch (e) {}
    if (pathname.endsWith('/queue')) { json(res, { ok: true, tickets: queueFor(me.role, me.telegram_id) }); return; }
    if (pathname.endsWith('/reply')) {
      const r = await platformReply(me, Number(b.ticket_id), String(b.text || '').slice(0, 2000));
      json(res, r, r.ok ? 200 : (r.error === 'forbidden' ? 403 : 400));
      return;
    }
    if (pathname.endsWith('/close')) { const r = await platformClose(me, Number(b.ticket_id), String(b.reason || '').slice(0, 200)); json(res, r, r.ok ? 200 : 400); return; }
    if (pathname.endsWith('/claim')) { const r = await platformClaim(me, Number(b.ticket_id)); json(res, r, r.ok ? 200 : 400); return; }
  }
  json(res, { ok: false, error: 'not_found' }, 404);
}

/* ── إحصاء بسيط للوحة (يستعمله /api/admin/stats إن أردت) ── */
function stats() {
  try {
    const g = (q) => CTX.db.prepare(q).get().c;
    return {
      open: g("SELECT COUNT(*) c FROM sup_tickets WHERE status='open'"),
      claimed: g("SELECT COUNT(*) c FROM sup_tickets WHERE status='claimed'"),
      closed: g("SELECT COUNT(*) c FROM sup_tickets WHERE status='closed'"),
      linked_users: g('SELECT COUNT(*) c FROM sup_users'),
      admins: g('SELECT COUNT(*) c FROM sup_admins WHERE active=1')
    };
  } catch (e) { return null; }
}

module.exports = {
  initSupport, setCtx, handleUpdate, handleHttp, isSupportPath, SUP_PATHS,
  notifyAdminsPayment, adminCanAct,
  notifyUser, makeLinkCode, myTickets, queueFor, platformReply, platformClose, platformClaim,
  handleCallback, stats, adminRow, setting, setSetting, audit, publicBotLink,
  _internal: { userSay, userCommand, adminCommand, ticketById, ticketMessages, closeTicket, supUser, linkUser, guessCategory }
};
