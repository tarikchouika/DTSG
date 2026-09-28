'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — Private Telegram Chat Bot
   ───────────────────────────────────────────────────────────────────────────
   هذا البوت ليس قناة عامة ولا دليلاً للمستخدمين. لا يقبل إلا الحسابات المرتبطة
   من داخل المنصة، ويُنشئ محادثة بين طرفين سمحت قواعد المنصة بالوصول بينهما:
     • صديقان مقبولان في جدول friends
     • المستخدم والأدمن الذي سجّله
     • المستخدم وأحد الأدمنز/السوبر أدمنز الرسميين
     • الأدمن والمستخدمون الذين يتولّاهم، والسوبر أدمن مع أي حساب

   لا نرسل أبداً معرّف تيليغرام أو اسم تيليغرام للطرف الآخر. الطرفان يرَيان
   اسم المستخدم داخل المنصة فقط. كل التوكنات والأسرار تأتي من البيئة.
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');

let CTX = null; // { db, users, sessions }
const MAX_MESSAGE = 1200;
const LINK_TTL = 15 * 60 * 1000;
const MESSAGE_WINDOW = 60 * 1000;
const MESSAGE_LIMIT = 30;

const now = () => Date.now();
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const cut = (s, n) => {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

function token() { return process.env.PRIVATE_CHAT_BOT_TOKEN || ''; }
function botUsername() { return String(process.env.PRIVATE_CHAT_BOT_USERNAME || 'dtsgchat_bot').replace(/^@/, ''); }
function publicUrl(code) { return 'https://t.me/' + botUsername() + '?start=' + encodeURIComponent(code); }
function apiBase() { return (process.env.PRIVATE_CHAT_TG_API || 'https://api.telegram.org').replace(/\/$/, ''); }

async function tg(method, body) {
  if (!token()) return null;
  try {
    const r = await fetch(apiBase() + '/bot' + token() + '/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return await r.json();
  } catch (e) {
    return null;
  }
}

async function send(chatId, text, extra) {
  if (!chatId) return null;
  return tg('sendMessage', Object.assign({
    chat_id: String(chatId),
    text: cut(text, 3900),
    parse_mode: 'HTML',
    disable_web_page_preview: true
  }, extra || {}));
}

function setCtx(db, users, sessions) { CTX = { db, users: users || {}, sessions: sessions || {} }; }

function initPrivateChat(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS private_chat_link_codes (
      code_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_private_link_codes_user
      ON private_chat_link_codes(user_id, created_at);

    CREATE TABLE IF NOT EXISTS private_chat_links (
      tg_chat TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      linked_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_private_links_user
      ON private_chat_links(user_id);

    CREATE TABLE IF NOT EXISTS private_chat_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_a INTEGER NOT NULL,
      user_b INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_a, user_b)
    );
    CREATE INDEX IF NOT EXISTS idx_private_conv_members
      ON private_chat_conversations(user_a, user_b, updated_at);

    CREATE TABLE IF NOT EXISTS private_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      delivered_at INTEGER,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_private_msg_conv
      ON private_chat_messages(conversation_id, id);
    CREATE INDEX IF NOT EXISTS idx_private_msg_receiver
      ON private_chat_messages(receiver_id, read_at, id);

    CREATE TABLE IF NOT EXISTS private_chat_state (
      tg_chat TEXT PRIMARY KEY,
      active_user_id INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS private_chat_blocks (
      blocker_id INTEGER NOT NULL,
      blocked_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(blocker_id, blocked_id)
    );
  `);
  return true;
}

function userById(id) {
  const key = String(id == null ? '' : id);
  if (!key) return null;
  let u = CTX && CTX.users ? (CTX.users[id] || CTX.users[key]) : null;
  if (u) return u;
  try {
    const r = CTX.db.prepare('SELECT id, username, role, admin_id, banned, telegram_id FROM users WHERE id = ?').get(key);
    return r || null;
  } catch (e) { return null; }
}

function userByName(value) {
  const q = String(value == null ? '' : value).trim().replace(/^@/, '');
  if (!q) return null;
  if (/^\d+$/.test(q)) return userById(q);
  const lower = q.toLowerCase();
  const inMemory = CTX && CTX.users ? Object.values(CTX.users).find(u => u && String(u.username || '').toLowerCase() === lower) : null;
  if (inMemory) return inMemory;
  try { return CTX.db.prepare('SELECT id, username, role, admin_id, banned, telegram_id FROM users WHERE lower(username) = lower(?)').get(q) || null; }
  catch (e) { return null; }
}

function linkByChat(chatId) {
  try {
    return CTX.db.prepare(`
      SELECT l.tg_chat, l.user_id, l.linked_at, u.username, u.role, u.admin_id, u.banned
      FROM private_chat_links l JOIN users u ON u.id = l.user_id
      WHERE l.tg_chat = ?
    `).get(String(chatId)) || null;
  } catch (e) { return null; }
}
function linkByUser(userId) {
  try { return CTX.db.prepare('SELECT * FROM private_chat_links WHERE user_id = ?').get(String(userId)) || null; }
  catch (e) { return null; }
}

function codeHash(code) { return crypto.createHash('sha256').update(String(code)).digest('hex'); }
function makeLinkCode(userId) {
  const raw = 'PC-' + crypto.randomBytes(18).toString('base64url');
  try {
    CTX.db.prepare('DELETE FROM private_chat_link_codes WHERE used_at IS NULL AND created_at < ?').run(now() - LINK_TTL);
    /* طلب رابط جديد يلغي الرابط السابق لنفس الحساب، فلا تبقى أسرار متعددة فعّالة. */
    CTX.db.prepare('DELETE FROM private_chat_link_codes WHERE user_id = ? AND used_at IS NULL').run(String(userId));
    CTX.db.prepare('INSERT INTO private_chat_link_codes (code_hash, user_id, created_at) VALUES (?,?,?)')
      .run(codeHash(raw), String(userId), now());
  } catch (e) {}
  return raw;
}
function consumeLinkCode(raw) {
  const hash = codeHash(String(raw || '').trim());
  try {
    /* تحديث ذري: لا يمكن لطلبَي Telegram المتزامنين استهلاك الكود نفسه مرتين. */
    const changed = CTX.db.prepare(
      'UPDATE private_chat_link_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND created_at >= ?'
    ).run(now(), hash, now() - LINK_TTL);
    if (!changed || Number(changed.changes || 0) !== 1) return null;
    return CTX.db.prepare('SELECT * FROM private_chat_link_codes WHERE code_hash = ?').get(hash) || null;
  } catch (e) { return null; }
}

function linkAccount(chatId, userId) {
  const id = String(userId);
  const existingChat = linkByUser(id);
  const existingUser = linkByChat(chatId);
  if ((existingChat && String(existingChat.tg_chat) !== String(chatId)) ||
      (existingUser && String(existingUser.user_id) !== id)) {
    return { ok: false, error: 'already-linked' };
  }
  const u = userById(id);
  if (!u || u.banned) return { ok: false, error: 'not-available' };
  /* users.telegram_id is shared with the support/finance bots. A different
     Telegram account must not silently take over a platform account, حتى لو
     كان صف private_chat_links قديماً أو حُذف أثناء ترحيل القاعدة. */
  if (u.telegram_id && String(u.telegram_id) !== String(chatId)) return { ok: false, error: 'already-linked' };
  try {
    const otherOwner = CTX.db.prepare('SELECT id FROM users WHERE telegram_id = ? AND id <> ? LIMIT 1').get(String(chatId), id);
    if (otherOwner) return { ok: false, error: 'already-linked' };
  } catch (e) {}
  try {
    CTX.db.prepare('INSERT OR REPLACE INTO private_chat_links (tg_chat, user_id, linked_at) VALUES (?,?,?)')
      .run(String(chatId), id, now());
    CTX.db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run(String(chatId), id);
    if (CTX.users && CTX.users[id]) CTX.users[id].telegram_id = String(chatId);
    return { ok: true, user: u };
  } catch (e) {
    return { ok: false, error: 'link-failed' };
  }
}

function unlinkAccount(chatId) {
  const row = linkByChat(chatId);
  if (!row) return false;
  try {
    CTX.db.prepare('DELETE FROM private_chat_links WHERE tg_chat = ?').run(String(chatId));
    CTX.db.prepare('UPDATE users SET telegram_id = NULL WHERE id = ? AND telegram_id = ?')
      .run(String(row.user_id), String(chatId));
    if (CTX.users && CTX.users[row.user_id] && String(CTX.users[row.user_id].telegram_id || '') === String(chatId)) {
      CTX.users[row.user_id].telegram_id = null;
    }
    CTX.db.prepare('DELETE FROM private_chat_state WHERE tg_chat = ?').run(String(chatId));
    return true;
  } catch (e) { return false; }
}

function acceptedFriend(a, b) {
  try {
    return !!CTX.db.prepare(`
      SELECT 1 FROM friends
      WHERE status = 'accepted'
        AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
      LIMIT 1
    `).get(String(a), String(b), String(b), String(a));
  } catch (e) { return false; }
}
function blocked(a, b) {
  try { return !!CTX.db.prepare('SELECT 1 FROM private_chat_blocks WHERE blocker_id = ? AND blocked_id = ?').get(String(a), String(b)); }
  catch (e) { return false; }
}
function canContact(from, to) {
  if (!from || !to || String(from.id) === String(to.id) || to.banned) return false;
  if (blocked(from.id, to.id) || blocked(to.id, from.id)) return false;
  if (from.role === 'super') return true;
  if (to.role === 'admin' || to.role === 'super') return true;
  if (from.role === 'admin') return to.role === 'user' && Number(to.admin_id || 0) === Number(from.id);
  return from.role === 'user' && to.role === 'user' && acceptedFriend(from.id, to.id);
}
function targetHasLink(userId) { return !!linkByUser(userId); }

function pair(a, b) {
  const aa = Number(a), bb = Number(b);
  return aa < bb ? [aa, bb] : [bb, aa];
}
function conversation(a, b, create) {
  const [x, y] = pair(a, b);
  try {
    let row = CTX.db.prepare('SELECT * FROM private_chat_conversations WHERE user_a = ? AND user_b = ?').get(x, y);
    if (!row && create) {
      const result = CTX.db.prepare('INSERT INTO private_chat_conversations (user_a,user_b,status,created_at,updated_at) VALUES (?,?,\'active\',?,?)')
        .run(x, y, now(), now());
      row = CTX.db.prepare('SELECT * FROM private_chat_conversations WHERE id = ?').get(Number(result.lastInsertRowid));
    }
    return row || null;
  } catch (e) { return null; }
}
function stateGet(chatId) {
  try { return CTX.db.prepare('SELECT * FROM private_chat_state WHERE tg_chat = ?').get(String(chatId)) || null; }
  catch (e) { return null; }
}
function stateSet(chatId, targetId) {
  try {
    CTX.db.prepare('INSERT OR REPLACE INTO private_chat_state (tg_chat, active_user_id, updated_at) VALUES (?,?,?)')
      .run(String(chatId), targetId == null ? null : String(targetId), now());
  } catch (e) {}
}
function activeTarget(chatId) {
  const s = stateGet(chatId);
  return s && s.active_user_id != null ? userById(s.active_user_id) : null;
}

function partnerName(me, partnerId) {
  const u = userById(partnerId);
  return u ? u.username : ('user' + partnerId);
}
function userChat(userId) {
  const row = linkByUser(userId);
  return row ? String(row.tg_chat) : null;
}

function unreadCount(userId) {
  try { return Number(CTX.db.prepare('SELECT COUNT(*) c FROM private_chat_messages WHERE receiver_id = ? AND read_at IS NULL').get(String(userId)).c || 0); }
  catch (e) { return 0; }
}
function privacyText() {
  return '🔒 <b>الخصوصية أولاً</b>\n' +
    'هذا بوت خاص بالمسجلين والمرتبطين بحساب DTSG فقط. لا نعرض أرقام تيليغرام ولا أسماء تيليغرام للطرف الآخر.\n\n' +
    'المستخدمون يتواصلون فقط مع أصدقائهم المقبولين أو الأدمنز الرسميين. الأدمن يرى المستخدمين المخوّلين له، والسوبر أدمن يدير الحسابات الرسمية. يمكنك إيقاف أي محادثة بـ /stop أو حظر الطرف بـ /block.';
}
function helpText() {
  return '💬 <b>شات DTSG الخاص</b>\n' +
    '/friends — أصدقاؤك المقبولون\n' +
    '/admins — الأدمنز المتاحون رسمياً\n' +
    '/chat اسم_المستخدم — بدء محادثة مصرح بها\n' +
    '/request اسم_المستخدم — إرسال طلب صداقة\n' +
    '/accept اسم_المستخدم — قبول طلب\n' +
    '/inbox — آخر المحادثات\n' +
    '/stop — إيقاف المحادثة الحالية\n' +
    '/block اسم_المستخدم — حظر الرسائل\n' +
    '/privacy — شرح الخصوصية\n' +
    'بعد اختيار محادثة، أرسل النص مباشرة. الحد الأقصى 1200 حرفاً.';
}

function listFriends(me) {
  const out = [];
  try {
    const rows = CTX.db.prepare(`
      SELECT u.id, u.username, u.role, u.admin_id
      FROM friends f JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ? AND f.status = 'accepted'
      ORDER BY lower(u.username)
    `).all(String(me.id));
    rows.forEach(r => out.push({ user: r, ready: targetHasLink(r.id), kind: 'friend' }));
  } catch (e) {}
  if (me.admin_id) {
    const admin = userById(me.admin_id);
    if (admin && !out.some(x => String(x.user.id) === String(admin.id))) out.push({ user: admin, ready: targetHasLink(admin.id), kind: 'account-admin' });
  }
  return out;
}
function listAdmins() {
  try {
    return CTX.db.prepare("SELECT id, username, role, admin_id FROM users WHERE role IN ('admin','super') AND banned = 0 ORDER BY CASE role WHEN 'super' THEN 0 ELSE 1 END, lower(username)").all();
  } catch (e) { return []; }
}
async function showContacts(chatId, me, type) {
  const rows = type === 'admins' ? listAdmins() : listFriends(me);
  if (!rows.length) {
    await send(chatId, type === 'admins'
      ? 'لا يوجد أدمن مرتبط بالبوت حالياً. اطلب من الأدمن ربط حسابه أولاً.'
      : 'لا توجد جهات اتصال جاهزة بعد. أضف صديقاً من المنصة ثم اطلب منه ربط حسابه.');
    return;
  }
  const lines = [];
  rows.forEach(item => {
    const u = item.user || item;
    const ready = item.ready !== undefined ? item.ready : targetHasLink(u.id);
    const label = u.role === 'super' ? '👑 ' : u.role === 'admin' ? '🛡️ ' : '👤 ';
    lines.push((ready ? '✅ ' : '⏳ ') + label + '<b>' + esc(u.username) + '</b>' +
      (item.kind === 'account-admin' ? ' · أدمن حسابك' : '') +
      (ready ? '\n   <code>/chat ' + esc(u.username) + '</code>' : ' · غير مرتبط بعد'));
  });
  await send(chatId, (type === 'admins' ? '🛡️ <b>الأدمنز الرسميون</b>' : '👥 <b>جهات اتصالك المسموحة</b>') + '\n\n' + lines.join('\n\n'));
}

function parseCommand(text) {
  const m = String(text || '').trim().match(/^\/(\S+)(?:@\S+)?(?:\s+([\s\S]*))?$/);
  return m ? { command: m[1].toLowerCase(), arg: String(m[2] || '').trim() } : null;
}

async function notifyLinkTarget(target, sender, body, convId) {
  const chat = userChat(target.id);
  if (!chat) return false;
  const markup = { inline_keyboard: [[
    { text: '↩️ الرد', callback_data: 'pchat:reply:' + String(sender.id) },
    { text: '⛔ إيقاف', callback_data: 'pchat:stop:' + String(sender.id) }
  ]] };
  const result = await send(chat,
    '💬 <b>رسالة خاصة جديدة</b>\nمن مستخدم DTSG: <b>' + esc(sender.username) + '</b>\n\n' + esc(body) +
    '\n\n<code>/chat ' + esc(sender.username) + '</code> للرد · /stop للإيقاف',
    { reply_markup: markup });
  if (result && result.ok) {
    try { CTX.db.prepare('UPDATE private_chat_messages SET delivered_at = ? WHERE id = (SELECT id FROM private_chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1)').run(now(), String(convId)); } catch (e) {}
  }
  return !!(result && result.ok);
}

async function sendDirect(chatId, me, target, body) {
  body = String(body || '').trim();
  if (!body) return false;
  if (body.length > MAX_MESSAGE) { await send(chatId, '⚠️ الرسالة طويلة جداً. الحد الأقصى 1200 حرفاً.'); return false; }
  if (!canContact(me, target) || !targetHasLink(target.id)) {
    await send(chatId, '⛔ هذه الجهة غير متاحة لك حالياً أو لم تربط حسابها بالبوت.');
    return false;
  }
  let count = 0;
  try { count = Number(CTX.db.prepare('SELECT COUNT(*) c FROM private_chat_messages WHERE sender_id = ? AND created_at > ?').get(String(me.id), now() - MESSAGE_WINDOW).c || 0); } catch (e) {}
  if (count >= MESSAGE_LIMIT) { await send(chatId, '⏳ رسائل كثيرة في وقت قصير — انتظر دقيقة.'); return false; }
  const conv = conversation(me.id, target.id, true);
  if (!conv) { await send(chatId, 'تعذر فتح المحادثة حالياً.'); return false; }
  try {
    const info = CTX.db.prepare('INSERT INTO private_chat_messages (conversation_id,sender_id,receiver_id,body,created_at) VALUES (?,?,?,?,?)')
      .run(conv.id, me.id, target.id, cut(body, MAX_MESSAGE), now());
    CTX.db.prepare('UPDATE private_chat_conversations SET updated_at = ? WHERE id = ?').run(now(), conv.id);
    const sent = await notifyLinkTarget(target, me, cut(body, MAX_MESSAGE), conv.id);
    if (sent) CTX.db.prepare('UPDATE private_chat_messages SET delivered_at = ? WHERE id = ?').run(now(), Number(info.lastInsertRowid));
    await send(chatId, sent ? '✅ تم إرسال رسالتك إلى <b>' + esc(target.username) + '</b>.' : '📥 حُفظت الرسالة — سيستلمها الطرف الآخر عند فتح البوت.');
    return true;
  } catch (e) {
    await send(chatId, 'تعذر حفظ الرسالة حالياً.');
    return false;
  }
}

async function inbox(chatId, me) {
  let rows = [];
  try {
    rows = CTX.db.prepare(`
      SELECT c.*, CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END partner_id,
        (SELECT body FROM private_chat_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) last_body,
        (SELECT COUNT(*) FROM private_chat_messages m WHERE m.conversation_id = c.id AND m.receiver_id = ? AND m.read_at IS NULL) unread
      FROM private_chat_conversations c
      WHERE c.user_a = ? OR c.user_b = ?
      ORDER BY c.updated_at DESC LIMIT 20
    `).all(String(me.id), String(me.id), String(me.id), String(me.id));
  } catch (e) {}
  if (!rows.length) { await send(chatId, '📭 لا توجد محادثات بعد. استخدم /friends أو /admins.'); return; }
  const out = rows.map(r => '• <b>' + esc(partnerName(me, r.partner_id)) + '</b>' +
    (Number(r.unread) ? ' · 🔔 ' + r.unread : '') + '\n  ' + esc(cut(r.last_body || '', 100)) +
    '\n  <code>/chat ' + esc(partnerName(me, r.partner_id)) + '</code>');
  try { CTX.db.prepare('UPDATE private_chat_messages SET read_at = ? WHERE receiver_id = ? AND read_at IS NULL').run(now(), String(me.id)); } catch (e) {}
  await send(chatId, '📥 <b>محادثاتك الأخيرة</b>\n\n' + out.join('\n\n'));
}

async function friendRequest(chatId, me, target) {
  if (!target || target.role !== 'user' || String(target.id) === String(me.id)) { await send(chatId, '⚠️ اسم المستخدم غير متاح لطلب صداقة.'); return; }
  try {
    const current = CTX.db.prepare('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?').get(String(me.id), String(target.id));
    if (current && current.status === 'accepted') {
      await send(chatId, '✅ أنتما صديقان بالفعل. استخدم /chat ' + esc(target.username));
      return;
    }
    const reverse = CTX.db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = \'pending\'').get(String(target.id), String(me.id));
    if (reverse) {
      CTX.db.prepare("UPDATE friends SET status='accepted' WHERE user_id = ? AND friend_id = ?").run(String(target.id), String(me.id));
      CTX.db.prepare('INSERT OR REPLACE INTO friends (user_id,friend_id,status,created_at) VALUES (?,?,\'accepted\',?)').run(String(me.id), String(target.id), now());
      await send(chatId, '✅ تم قبول الطلب وأصبحتما صديقين. استخدم /chat ' + esc(target.username));
      const targetChat = userChat(target.id);
      if (targetChat) await send(targetChat, '✅ تم قبول طلب الصداقة مع <b>' + esc(me.username) + '</b>.');
      return;
    }
    CTX.db.prepare('INSERT OR REPLACE INTO friends (user_id,friend_id,status,created_at) VALUES (?,?,\'pending\',?)').run(String(me.id), String(target.id), now());
    await send(chatId, '📨 أُرسل طلب الصداقة إلى <b>' + esc(target.username) + '</b>.');
    const targetChat = userChat(target.id);
    if (targetChat) await send(targetChat, '👋 طلب صداقة جديد من <b>' + esc(me.username) + '</b>.\nاستخدم /accept ' + esc(me.username) + ' أو /decline ' + esc(me.username) + '.');
  } catch (e) { await send(chatId, 'تعذر إرسال طلب الصداقة حالياً.'); }
}

async function acceptRequest(chatId, me, target, accept) {
  if (!target || target.role !== 'user') { await send(chatId, '⚠️ لا يوجد طلب بهذا الاسم.'); return; }
  try {
    const row = CTX.db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = \'pending\'').get(String(target.id), String(me.id));
    if (!row) { await send(chatId, 'لا يوجد طلب معلّق من هذا المستخدم.'); return; }
    if (accept) {
      CTX.db.prepare("UPDATE friends SET status='accepted' WHERE user_id = ? AND friend_id = ?").run(String(target.id), String(me.id));
      CTX.db.prepare('INSERT OR REPLACE INTO friends (user_id,friend_id,status,created_at) VALUES (?,?,\'accepted\',?)').run(String(me.id), String(target.id), now());
      await send(chatId, '✅ تم قبول طلب <b>' + esc(target.username) + '</b>.');
      const targetChat = userChat(target.id);
      if (targetChat) await send(targetChat, '✅ قبل <b>' + esc(me.username) + '</b> طلب صداقتك.');
    } else {
      CTX.db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(String(target.id), String(me.id));
      await send(chatId, 'تم رفض الطلب.');
    }
  } catch (e) { await send(chatId, 'تعذر تنفيذ الطلب حالياً.'); }
}

async function handleCallback(cq) {
  const chatId = String(cq && cq.message && cq.message.chat ? cq.message.chat.id : (cq && cq.from && cq.from.id));
  const linked = linkByChat(chatId);
  if (!linked) { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'اربط حسابك أولاً', show_alert: true }); return; }
  const me = userById(linked.user_id);
  const m = String(cq.data || '').match(/^pchat:(reply|stop):(\d+)$/);
  if (!m) { await tg('answerCallbackQuery', { callback_query_id: cq.id }); return; }
  const target = userById(m[2]);
  if (m[1] === 'reply' && target && canContact(me, target)) {
    stateSet(chatId, target.id);
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'اكتب رسالتك الآن' });
    await send(chatId, '✍️ المحادثة مع <b>' + esc(target.username) + '</b> مفعّلة الآن. /stop للإيقاف.');
  } else {
    stateSet(chatId, null);
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'تم إيقاف المحادثة' });
  }
}

async function handleUpdate(update) {
  if (update && update.callback_query) {
    await handleCallback(update.callback_query);
    return { ok: true };
  }
  const message = update && update.message;
  if (!message || !message.chat || message.chat.type !== 'private') return { ok: true };
  const chatId = String(message.chat.id);
  const text = String(message.text || '').trim();
  const command = parseCommand(text);
  const linked = linkByChat(chatId);

  if (command && command.command === 'start') {
    const code = command.arg;
    if (!code) {
      await send(chatId, linked ? '✅ حسابك مرتبط باسم <b>' + esc(linked.username) + '</b>.\n/help للمساعدة.' : '🔒 هذا البوت خاص بمستخدمي DTSG المسجلين. افتح رابط الربط من نافذة شات البوت داخل المنصة.');
      return { ok: true };
    }
    const row = consumeLinkCode(code);
    if (!row) { await send(chatId, '⚠️ رابط الربط منتهٍ أو غير صالح. اطلب رابطاً جديداً من المنصة.'); return { ok: true }; }
    const result = linkAccount(chatId, row.user_id);
    if (!result.ok) {
      await send(chatId, result.error === 'already-linked' ? '⚠️ هذا الحساب أو حساب تيليغرام مرتبط بحساب آخر. لأمانك، تواصل مع الأدمن.' : '⚠️ تعذر إتمام الربط.');
      return { ok: true };
    }
    await send(chatId, '🔗 <b>تم ربط حسابك بنجاح</b> باسم <b>' + esc(result.user.username) + '</b>.\n\n' + helpText());
    return { ok: true };
  }

  if (!linked) {
    await send(chatId, '🔒 لا يمكن استعمال هذا البوت للعموم. افتح رابطاً جديداً من داخل حسابك في منصة DTSG أولاً.');
    return { ok: true };
  }
  const me = userById(linked.user_id);
  if (!me || me.banned) { await send(chatId, '🚫 الحساب غير متاح للمراسلة.'); return { ok: true }; }

  if (command) {
    const argUser = command.arg ? userByName(command.arg.split(/\s+/)[0]) : null;
    switch (command.command) {
      case 'help': return await send(chatId, helpText()), { ok: true };
      case 'privacy': return await send(chatId, privacyText()), { ok: true };
      case 'id': return await send(chatId, '👤 حساب المنصة: <b>' + esc(me.username) + '</b>\nلا نعرض معرّف تيليغرام لأي طرف.'), { ok: true };
      case 'friends': return await showContacts(chatId, me, 'friends'), { ok: true };
      case 'admins': return await showContacts(chatId, me, 'admins'), { ok: true };
      case 'inbox': return await inbox(chatId, me), { ok: true };
      case 'stop': stateSet(chatId, null); return await send(chatId, 'تم إيقاف المحادثة الحالية.'), { ok: true };
      case 'chat': {
        const target = userByName(command.arg);
        if (!target || !canContact(me, target) || !targetHasLink(target.id)) return await send(chatId, '⛔ لا يمكن بدء هذه المحادثة. تحقق من الصداقة/الصلاحية وربط الطرف الآخر.'), { ok: true };
        stateSet(chatId, target.id);
        try { CTX.db.prepare('UPDATE private_chat_messages SET read_at = ? WHERE receiver_id = ? AND sender_id = ? AND read_at IS NULL').run(now(), String(me.id), String(target.id)); } catch (e) {}
        return await send(chatId, '✍️ <b>محادثة خاصة مع ' + esc(target.username) + '</b> مفعّلة. أرسل رسالتك الآن أو /stop.'), { ok: true };
      }
      case 'request': return await friendRequest(chatId, me, userByName(command.arg)), { ok: true };
      case 'accept': return await acceptRequest(chatId, me, argUser, true), { ok: true };
      case 'decline': return await acceptRequest(chatId, me, argUser, false), { ok: true };
      case 'block': {
        const target = userByName(command.arg);
        if (!target || !canContact(me, target)) return await send(chatId, 'لا يمكن حظر هذه الجهة.'), { ok: true };
        try { CTX.db.prepare('INSERT OR IGNORE INTO private_chat_blocks (blocker_id,blocked_id,created_at) VALUES (?,?,?)').run(String(me.id), String(target.id), now()); } catch (e) {}
        if (activeTarget(chatId) && String(activeTarget(chatId).id) === String(target.id)) stateSet(chatId, null);
        return await send(chatId, '⛔ تم حظر الرسائل من <b>' + esc(target.username) + '</b>.'), { ok: true };
      }
      case 'unblock': {
        const target = userByName(command.arg);
        if (target) { try { CTX.db.prepare('DELETE FROM private_chat_blocks WHERE blocker_id = ? AND blocked_id = ?').run(String(me.id), String(target.id)); } catch (e) {} }
        return await send(chatId, 'تم تحديث قائمة الحظر.'), { ok: true };
      }
      case 'unlink':
        unlinkAccount(chatId);
        return await send(chatId, '🔓 تم فصل الحساب. لن يستقبل هذا البوت رسائل حتى تنشئ رابطاً جديداً من المنصة.'), { ok: true };
      default: return await send(chatId, 'أمر غير معروف — /help'), { ok: true };
    }
  }

  const target = activeTarget(chatId);
  if (!target) { await send(chatId, 'اختر جهة أولاً عبر /friends أو /admins ثم /chat اسم_المستخدم.'); return { ok: true }; }
  await sendDirect(chatId, me, target, text);
  return { ok: true };
}

function sessionUser(req) {
  const h = (req && req.headers) || {};
  const cookie = String(typeof h.get === 'function' ? h.get('cookie') : h.cookie || '');
  const m = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
  if (!m || !CTX) return null;
  const id = CTX.sessions[decodeURIComponent(m[1])];
  return id != null ? userById(id) : null;
}
function json(res, obj, status) {
  res.writeHead(status || 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function isPrivatePath(pathname) {
  return ['/api/private-chat/webhook', '/api/private-chat/link', '/api/private-chat/status'].indexOf(pathname) >= 0;
}
async function handleHttp(req, res, pathname, bodyStr) {
  if (pathname === '/api/private-chat/webhook') {
    if (req.method && req.method !== 'POST') { json(res, { ok: false, error: 'method-not-allowed' }, 405); return; }
    const expected = process.env.PRIVATE_CHAT_WEBHOOK_SECRET || '';
    const headers = req.headers || {};
    const got = String(typeof headers.get === 'function'
      ? (headers.get('x-telegram-bot-api-secret-token') || '')
      : (headers['x-telegram-bot-api-secret-token'] || ''));
    if (!expected || got !== expected) { json(res, { ok: false, error: 'forbidden' }, 403); return; }
    let update = {};
    try { update = JSON.parse(bodyStr || '{}'); } catch (e) { json(res, { ok: false, error: 'bad-json' }, 400); return; }
    const result = await handleUpdate(update);
    json(res, result, 200);
    return;
  }
  const me = sessionUser(req);
  if (!me) { json(res, { ok: false, error: 'unauthorized' }, 401); return; }
  if (pathname === '/api/private-chat/link' && req.method === 'POST') {
    const code = makeLinkCode(me.id);
    json(res, { ok: true, code, url: publicUrl(code), bot: '@' + botUsername(), expires_min: 15 });
    return;
  }
  if (pathname === '/api/private-chat/status' && req.method === 'GET') {
    const row = linkByUser(me.id);
    json(res, { ok: true, linked: !!row, bot: '@' + botUsername() });
    return;
  }
  json(res, { ok: false, error: 'not-found' }, 404);
}

module.exports = {
  initPrivateChat,
  setCtx,
  handleUpdate,
  handleHttp,
  isPrivatePath,
  makeLinkCode,
  linkAccount,
  unlinkAccount,
  _internal: { userById, userByName, canContact, linkByChat, linkByUser, conversation, privacyText }
};
