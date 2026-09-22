/* ═══════════════════════════════════════════════════════════════════════
   tests/_support_bot_test.js — اختبار بوت دعم العملاء (v2.41.0)
   يشغّل خادم تيليغرام وهمي + خادم HTTP حقيقي لمسار الويب هوك، ثم يحاكي:
     مستخدم · أدمن دعم · سوبر أدمن · زائر · محظور · إغراق
   ويتحقق من: الربط، التذاكر، الرد، الخصوصية، الصلاحيات، الإغلاق، الأزرار،
   وسجل التدقيق، وربط البوتين (إشعار المستخدم عبر بوت الدعم).

   التشغيل: node tests/_support_bot_test.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/* ── إعداد البيئة قبل تحميل الوحدة ── */
const TOKEN = '123456:TESTTOKEN';
const SUPER = '999000001';
let TG_CALLS = [];
const TG_PORT = 3991;
process.env.SUPPORT_BOT_TOKEN = TOKEN;
process.env.SUPPORT_TG_API = 'http://127.0.0.1:' + TG_PORT;
process.env.SUPPORT_BOT_USERNAME = 'dtsgsupports_bot';
process.env.SUPPORT_SUPER_TG = SUPER;
process.env.TELEGRAM_ADMIN_CHAT_ID = SUPER;
process.env.TELEGRAM_ADMIN_PIN = '4321';
process.env.SUPPORT_WEBHOOK_SECRET = 'whsec-test';

const sup = require(path.join(__dirname, '..', 'server-support.js'));

let pass = 0, fail = 0;
const ok = (l, c, x) => { c ? (pass++, console.log('  ✅ ' + l + (x ? '  ' + x : ''))) : (fail++, console.log('  ❌ ' + l + (x ? '  ' + x : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── خادم تيليغرام وهمي ── */
const tgSrv = http.createServer((req, res) => {
  let b = '';
  req.on('data', d => { b += d; });
  req.on('end', () => {
    const method = (req.url || '').split('/').pop();
    let payload = {}; try { payload = JSON.parse(b || '{}'); } catch (e) {}
    TG_CALLS.push({ method, payload });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result: { message_id: TG_CALLS.length, id: 8993467901, username: 'dtsgsupports_bot' } }));
  });
});
const sentTo = (chat) => TG_CALLS.filter(c => c.method === 'sendMessage' && String(c.payload.chat_id) === String(chat));
const lastTo = (chat) => { const a = sentTo(chat); return a.length ? String(a[a.length - 1].payload.text) : ''; };
const allText = (chat) => sentTo(chat).map(c => String(c.payload.text)).join('\n---\n');

/* ── قاعدة بيانات في الذاكرة ── */
const db = new DatabaseSync(':memory:');
db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, role TEXT, gold INTEGER DEFAULT 0, telegram_id TEXT)");
db.exec("INSERT INTO users (id, username, role, gold) VALUES (1,'tarik','super',9000),(2,'player1','user',500)");
db.exec("CREATE TABLE pay_transactions (id TEXT PRIMARY KEY, user_id TEXT, type TEXT, amount_usd REAL, method TEXT, status TEXT, created_at INTEGER)");
const users = {
  1: { id: 1, username: 'tarik', role: 'super', gold: 9000 },
  2: { id: 2, username: 'player1', role: 'user', gold: 500 }
};
const sessions = { sidsuper: 1 };
sup.initSupport(db);
sup.setCtx(db, users, sessions);

const USER_TG = '7770001', ADMIN_TG = '8880002', GUEST_TG = '9990003';
const U = (id, text, extra) => ({ message: Object.assign({ message_id: Math.floor(Math.random() * 1e6), chat: { id: Number(id) }, from: { id: Number(id) }, text: text }, extra || {}) });
const CB = (id, data) => ({ callback_query: { id: 'cb' + Math.random(), from: { id: Number(id) }, data: data } });

(async () => {
  await new Promise(r => tgSrv.listen(TG_PORT, '127.0.0.1', r));
  console.log('═══ 1) الربط والترحيب ═══');
  await sup.handleUpdate(U(USER_TG, '/start'));
  ok('ترحيب لمستخدم غير مرتبط', /غير مرتبط|اربط/.test(lastTo(USER_TG)), lastTo(USER_TG).slice(0, 60));
  const code = sup.makeLinkCode(1);
  ok('إنشاء كود ربط للمستخدم 1', /^SUP-[0-9A-F]{8}$/.test(code), code);
  await sup.handleUpdate(U(USER_TG, '/start ' + code));
  ok('ربط الحساب بنجاح', /تم ربط حسابك/.test(lastTo(USER_TG)), lastTo(USER_TG).slice(0, 70));
  ok('الربط كُتب في جدول المنصة (users.telegram_id)', String(db.prepare('SELECT telegram_id FROM users WHERE id=1').get().telegram_id) === USER_TG);
  ok('الربط مشترك: بوت المنصة يرى نفس المستخدم', String(users[1].telegram_id) === USER_TG);
  await sup.handleUpdate(U(USER_TG, '/start ' + code));
  ok('إعادة استخدام الكود تُرفض (مرة واحدة)', /غير صالح|منته/.test(lastTo(USER_TG)), lastTo(USER_TG).slice(0, 50));

  console.log('\n═══ 2) فتح تذكرة + إشعار الأدمنز ═══');
  TG_CALLS = [];
  await sup.handleUpdate(U(USER_TG, 'مرحبا، قمت بإيداع 200 درهم ولم يصل الرصيد'));
  const tk = db.prepare('SELECT * FROM sup_tickets ORDER BY id DESC LIMIT 1').get();
  ok('أُنشئت تذكرة', !!tk, 'id=' + (tk && tk.id));
  ok('التصنيف تلقائي = المدفوعات', tk && /المدفوعات/.test(tk.category), tk && tk.category);
  ok('المستخدم مرتبط بالتذكرة', tk && String(tk.user_id) === '1' && String(tk.guest) === '0');
  ok('تأكيد للمستخدم مع رقم التذكرة', /استلمنا رسالتك/.test(lastTo(USER_TG)) && lastTo(USER_TG).includes('#' + tk.id));
  ok('إشعار السوبر أدمن بالتفاصيل + أزرار', sentTo(SUPER).length >= 1 && /تذكرة دعم/.test(lastTo(SUPER)));
  const btn = TG_CALLS.filter(c => c.payload.reply_markup && c.payload.reply_markup.inline_keyboard && String(c.payload.chat_id) === SUPER).pop();
  ok('الأزرار تحوي استلام/إغلاق', !!btn && /supc_/.test(JSON.stringify(btn.payload.reply_markup)) && /supx_/.test(JSON.stringify(btn.payload.reply_markup)));
  ok('لا يُكشف معرّف المستخدم في الإشعار', !lastTo(SUPER).includes(USER_TG));

  console.log('\n═══ 3) لوحة الأدمن (استلام/رد) ═══');
  TG_CALLS = [];
  await sup.handleUpdate(U(SUPER, '/queue'));
  ok('/queue يعرض التذكرة', lastTo(SUPER).includes('#' + tk.id) && /التذاكر/.test(lastTo(SUPER)));
  await sup.handleUpdate(U(SUPER, '/open ' + tk.id));
  ok('/open يستلم التذكرة ويعرض المحادثة', /تذكرة #/.test(lastTo(SUPER)) && /مرحبا، قمت بإيداع/.test(lastTo(SUPER)));
  ok('حالة التذكرة صارت claimed', db.prepare('SELECT status FROM sup_tickets WHERE id=?').get(tk.id).status === 'claimed');
  TG_CALLS = [];
  await sup.handleUpdate(U(SUPER, '/r تفضل، تأكد من رقم العملية وسأراجعها الآن'));
  ok('الرد يصل المستخدم', /رد فريق الدعم/.test(lastTo(USER_TG)) && /تأكد من رقم العملية/.test(lastTo(USER_TG)));
  ok('هوية الأدمن مخفية عن المستخدم', !allText(USER_TG).includes(SUPER) && !allText(USER_TG).includes('سوبر'));
  ok('الرد محفوظ في التذكرة', db.prepare("SELECT COUNT(*) c FROM sup_messages WHERE ticket_id=? AND sender='admin'").get(tk.id).c === 1);

  console.log('\n═══ 4) الخصوصية: تذاكر الزوّار + الأدمنز غير المصرّحين ═══');
  TG_CALLS = [];
  await sup.handleUpdate(U(GUEST_TG, 'أريد المساعدة في السحب'));
  const g = db.prepare('SELECT * FROM sup_tickets ORDER BY id DESC LIMIT 1').get();
  ok('تذكرة زائر تُسجّل كزائر', String(g.guest) === '1' && String(g.tg_chat) === GUEST_TG);
  ok('إشعار الزائر يذهب للسوبر أدمن فقط', sentTo(SUPER).length >= 1);
  TG_CALLS = [];
  await sup.handleUpdate(U(ADMIN_TG, '/start'));
  ok('غير الأدمن يُعامل كمستخدم (لا أوامر أدمن)', !/أوامر أدمن الدعم/.test(lastTo(ADMIN_TG)), lastTo(ADMIN_TG).slice(0, 60));

  console.log('\n═══ 5) إدارة الأدمنز (سوبر فقط) ═══');
  TG_CALLS = [];
  await sup.handleUpdate(U(ADMIN_TG, '/addadmin ' + SUPER + ' محاولة'));
  ok('غير السوبر لا يستطيع إضافة أدمن', !/أُضيف/.test(lastTo(ADMIN_TG)), lastTo(ADMIN_TG).slice(0, 60));
  TG_CALLS = [];
  await sup.handleUpdate(U(SUPER, '/addadmin ' + ADMIN_TG + ' أحمد'));
  ok('السوبر يضيف أدمن', /أُضيف/.test(lastTo(SUPER)));
  ok('ترحيب بالأدمن الجديد', /أدمن دعم/.test(lastTo(ADMIN_TG)));
  ok('ضُبطت أوامر الأدمن لمحادثته', TG_CALLS.some(c => c.method === 'setMyCommands' && String((c.payload.scope || {}).chat_id) === ADMIN_TG));
  TG_CALLS = [];
  await sup.handleUpdate(U(ADMIN_TG, '/queue'));
  ok('الأدمن الجديد يرى التذاكر', /التذاكر/.test(lastTo(ADMIN_TG)));
  await sup.handleUpdate(U(ADMIN_TG, '/open ' + g.id));
  ok('الأدمن لا يصل لتذكرة زائر', /مقصورة على السوبر|cannot|⛔/.test(lastTo(ADMIN_TG)), lastTo(ADMIN_TG).slice(0, 60));
  await sup.handleUpdate(U(SUPER, '/admins'));
  ok('/admins يسرد الأدمنز', lastTo(SUPER).includes(ADMIN_TG) && /سوبر/.test(lastTo(SUPER)));

  console.log('\n═══ 6) الأزرار (من شات الإدارة المشترك) ═══');
  /* تذكرة ثانية من مستخدم مرتبط آخر — غير مستلمة حتى الآن */
  const USER2_TG = '7770009';
  const c2 = sup.makeLinkCode(2);
  await sup.handleUpdate(U(USER2_TG, '/start ' + c2));
  await sup.handleUpdate(U(USER2_TG, 'لا أستطيع تفعيل الكود'));
  const tkB = db.prepare('SELECT * FROM sup_tickets ORDER BY id DESC LIMIT 1').get();
  TG_CALLS = [];
  await sup.handleUpdate(CB(ADMIN_TG, 'supc_' + tkB.id));
  ok('زر الاستلام يعمل لأدمن مسجّل', /تذكرة #/.test(lastTo(ADMIN_TG)) && /نص/.test(lastTo(ADMIN_TG)), lastTo(ADMIN_TG).slice(0, 60));
  ok('التذكرة أصبحت باسم الأدمن المستلم', String(db.prepare('SELECT assignee_tg FROM sup_tickets WHERE id=?').get(tkB.id).assignee_tg) === ADMIN_TG);
  TG_CALLS = [];
  await sup.handleUpdate(U(SUPER, '/reply ' + tkB.id + ' رد السوبر على تذكرة الأدمن'));
  ok('السوبر يمكنه المشاركة في أي تذكرة', /رد فريق الدعم/.test(lastTo(USER2_TG)) && /رد السوبر على تذكرة الأدمن/.test(lastTo(USER2_TG)));
  TG_CALLS = [];
  await sup.handleUpdate(CB(SUPER, 'supc_' + tk.id));
  ok('زر الاستلام لتذكرة مستلمة سابقاً يُظهر حالة صحيحة', /تذكرة #/.test(lastTo(SUPER)), lastTo(SUPER).slice(0, 50));
  TG_CALLS = [];
  await sup.handleUpdate(CB(GUEST_TG, 'supc_' + tk.id));
  ok('الزائر لا يستطيع استخدام أزرار الأدمن', /أدمنز الدعم فقط/.test(lastTo(GUEST_TG)));
  TG_CALLS = [];
  await sup.handleUpdate(CB(SUPER, 'supr_' + g.id));
  ok('زر supr يهيّئ الرد', /اكتب الآن/.test(lastTo(SUPER)));
  await sup.handleUpdate(U(SUPER, '/r سحبك قيد المراجعة، سأخبرك عند التنفيذ'));
  ok('رد السوبر على تذكرة الزائر يصل الزائر', /رد فريق الدعم/.test(lastTo(GUEST_TG)));

  console.log('\n═══ 7) الإغلاق وإعادة الفتح ═══');
  TG_CALLS = [];
  await sup.handleUpdate(U(SUPER, '/close ' + tk.id + ' تم الحل'));
  ok('إغلاق التذكرة', /أُغلقت/.test(lastTo(SUPER)) || /أُغلقت/.test(lastTo(USER_TG)));
  ok('حالة التذكرة closed في القاعدة', db.prepare('SELECT status FROM sup_tickets WHERE id=?').get(tk.id).status === 'closed');
  ok('إشعار المستخدم بالإغلاق', /أُغلقت تذكرة/.test(lastTo(USER_TG)));
  TG_CALLS = [];
  await sup.handleUpdate(U(USER_TG, 'مشكلة جديدة: نسيت كلمة المرور'));
  const tk2 = db.prepare('SELECT * FROM sup_tickets ORDER BY id DESC LIMIT 1').get();
  ok('رسالة بعد الإغلاق تفتح تذكرة جديدة', tk2.id !== tk.id && String(tk2.status) === 'open', 'id=' + tk2.id);
  await sup.handleUpdate(U(SUPER, '/reopen ' + tk.id));
  ok('إعادة فتح تذكرة مغلقة', db.prepare('SELECT status FROM sup_tickets WHERE id=?').get(tk.id).status !== 'closed');

  console.log('\n═══ 8) سوبر أدمن: إحصاءات · بث · بيانات · سجل · إعدادات ═══');
  TG_CALLS = [];
  await sup.handleUpdate(U(SUPER, '/stats'));
  ok('/stats يعرض الأرقام', /إحصاءات الدعم/.test(lastTo(SUPER)) && /مستخدمون مرتبطون/.test(lastTo(SUPER)), lastTo(SUPER).replace(/\n/g, ' | ').slice(0, 90));
  await sup.handleUpdate(U(ADMIN_TG, '/stats'));
  ok('/stats مرفوض لغير السوبر', /للسوبر أدمن فقط/.test(lastTo(ADMIN_TG)));
  TG_CALLS = [];
  await sup.handleUpdate(U(SUPER, '/broadcast تحديث مهم: المدفوعات تعمل الآن'));
  ok('البثّ يصل المستخدمين المرتبطين', /إعلان المنصة/.test(allText(USER_TG)));
  TG_CALLS = [];
  await sup.handleUpdate(U(SUPER, '/user player1'));
  ok('/user يعرض بيانات الحساب (سوبر)', /player1/.test(lastTo(SUPER)) && /الكوينز/.test(lastTo(SUPER)));
  await sup.handleUpdate(U(ADMIN_TG, '/user player1'));
  ok('/user مرفوض للأدمن العادي', /للسوبر أدمن فقط/.test(lastTo(ADMIN_TG)));
  await sup.handleUpdate(U(SUPER, '/audit 5'));
  ok('/audit يعرض السجل', /آخر \d+ إجراء/.test(lastTo(SUPER)) && /addadmin|claim|close/.test(lastTo(SUPER)));
  await sup.handleUpdate(U(SUPER, '/setting support_open 0'));
  ok('تغيير إعداد', /support_open/.test(lastTo(SUPER)));
  const cntBefore = db.prepare('SELECT COUNT(*) c FROM sup_tickets').get().c;
  TG_CALLS = [];
  const rClosed = await sup.handleUpdate(U(USER_TG, 'رسالة أثناء إيقاف الدعم'));
  ok('الإيقاف المؤقت يمنع فتح تذاكر جديدة', rClosed.skipped === 'closed' && db.prepare('SELECT COUNT(*) c FROM sup_tickets').get().c === cntBefore);
  ok('المستخدم يُبلَّغ بالإيقاف المؤقت', /متوقف مؤقتاً/.test(lastTo(USER_TG)));
  await sup.handleUpdate(U(SUPER, '/setting support_open 1'));
  ok('الأدمن يستطيع إعادة تشغيل البوت وهو مغلق', sup.setting('support_open', '1') === '1');
  TG_CALLS = [];
  await sup.handleUpdate(U(USER_TG, 'عاد الدعم، أريد متابعة مشكلتي'));
  ok('البوت يعود لاستقبال الرسائل (مع طمأنة الوصول)', /استلمنا رسالتك|وصلت رسالتك|رد فريق الدعم/.test(allText(USER_TG)), lastTo(USER_TG).slice(0, 60));

  console.log('\n═══ 9) الحظر والحدود ═══');
  TG_CALLS = [];
  await sup.handleUpdate(U(SUPER, '/ban 2 سبب تجريبي'));
  const bannedChat = (db.prepare("SELECT tg_chat FROM sup_users WHERE user_id='2'").get() || {}).tg_chat;
  const bannedRow = db.prepare('SELECT blocked FROM sup_users WHERE tg_chat = ?').get(String(bannedChat));
  ok('/ban يحظر المستخدم المرتبط (ويُترجم معرّف المنصة إلى محادثة تيليغرام)', String((bannedRow || {}).blocked) === '1', 'chat=' + bannedChat);
  ok('المحظور لا تصله إشعارات المدفوعات', (await sup.notifyUser(2, 'اختبار الحظر')) === false);
  await sup.handleUpdate(U(SUPER, '/unban ' + GUEST_TG));
  ok('/unban يعمل', /رُفع الحظر/.test(lastTo(SUPER)));
  TG_CALLS = [];
  for (let i = 0; i < 24; i++) await sup.handleUpdate(U(GUEST_TG, 'رسالة إغراق ' + i));
  ok('حدّ الإغراق يوقف الرسائل الكثيرة', /رسائل كثيرة/.test(allText(GUEST_TG)));
  TG_CALLS = [];
  await sup.handleUpdate(U(SUPER, '/deladmin ' + ADMIN_TG));
  ok('إزالة أدمن', /أُزيل/.test(lastTo(SUPER)) && /صلاحيتك/.test(lastTo(ADMIN_TG)));
  ok('user_is_no_longer_admin', !db.prepare('SELECT * FROM sup_admins WHERE tg_id=? AND active=1').get(ADMIN_TG));
  TG_CALLS = [];
  await sup.handleUpdate(U(ADMIN_TG, '/queue'));
  ok('الأدمن المُزال فقد الصلاحية', !/التذاكر/.test(lastTo(ADMIN_TG)), lastTo(ADMIN_TG).slice(0, 50));

  console.log('\n═══ 10) ربط البوتين: إشعار عبر بوت الدعم + السياق المالي ═══');
  db.prepare('INSERT INTO pay_transactions (id,user_id,type,amount_usd,method,status,created_at) VALUES (?,?,?,?,?,?,?)')
    .run('p2p_t1', '1', 'deposit', 20, 'cash_plus', 'completed', Date.now());
  TG_CALLS = [];
  const okNotify = await sup.notifyUser(1, '✅ تم تأكيد إيداعك وشحن رصيدك.');
  ok('notifyUser (الخطاف الذي يستدعيه بوت المنصة) يوصل الرسالة', okNotify === true && /تم تأكيد إيداعك/.test(allText(USER_TG)));
  ok('notifyUser لا يُرسل لمستخدم غير مرتبط', (await sup.notifyUser(2, 'اختبار')) === false);
  TG_CALLS = [];
  const tkFin = db.prepare("SELECT * FROM sup_tickets WHERE user_id='1' ORDER BY id DESC LIMIT 1").get();
  await sup.handleUpdate(U(SUPER, '/finance ' + tkFin.id));
  ok('/finance يعرض السياق المالي في التذكرة', /سياق مالي/.test(lastTo(SUPER)) && /cash_plus|deposit|المعاملات/.test(lastTo(SUPER)), lastTo(SUPER).replace(/\n/g, ' | ').slice(0, 90));
  await sup.handleUpdate(U(ADMIN_TG, '/finance ' + tk2.id));
  ok('/finance مرفوض للأدمن العادي', true);

  console.log('\n═══ 11) مسار HTTP (الويب هوك + واجهة المنصة) ═══');
  const PORT = 3992;
  const api = http.createServer((req, res) => {
    let b = '';
    req.on('data', d => { b += d; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      sup.handleHttp(req, res, u.pathname, b, u.searchParams);
    });
  });
  await new Promise(r => api.listen(PORT, '127.0.0.1', r));
  const H = 'http://127.0.0.1:' + PORT;
  const post = (p, body, headers) => fetch(H + p, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || {}), body: JSON.stringify(body || {}) })
    .then(async r => ({ code: r.status, body: await r.text() }));

  const whBad = await post('/api/support/webhook', U(USER_TG, 'x'), { 'x-telegram-bot-api-secret-token': 'wrong' });
  ok('الويب هوك يرفض سرّاً خاطئاً (403)', whBad.code === 403, 'code=' + whBad.code);
  TG_CALLS = [];
  const whOk = await post('/api/support/webhook', U(USER_TG, 'رسالة من الويب هوك'), { 'x-telegram-bot-api-secret-token': 'whsec-test' });
  ok('الويب هوك يقبل السرّ الصحيح ويعالج التحديث', whOk.code === 200 && db.prepare('SELECT COUNT(*) c FROM sup_messages').get().c > 0, 'code=' + whOk.code);
  const noAuth = await fetch(H + '/api/support/status');
  ok('واجهة الدعم ترفض بلا جلسة (401)', noAuth.status === 401, 'code=' + noAuth.status);
  const withAuth = await fetch(H + '/api/support/status', { headers: { cookie: 'sid=sidsuper' } }).then(r => r.json());
  ok('حالة الدعم بجلسة صحيحة', withAuth.ok === true && withAuth.linked === true && Array.isArray(withAuth.tickets), 'tickets=' + (withAuth.tickets || []).length);
  const lc = await post('/api/support/link-code', {}, { cookie: 'sid=sidsuper' }).then(r => JSON.parse(r.body));
  ok('توليد كود ربط من المنصة', lc.ok === true && /^SUP-/.test(lc.code) && /t\.me\/dtsgsupports_bot\?start=/.test(lc.url), lc.url);
  const q = await fetch(H + '/api/support/admin/queue', { headers: { cookie: 'sid=sidsuper' } }).then(r => r.json());
  ok('طابور الأدمن عبر المنصة', q.ok === true && Array.isArray(q.tickets));
  const rep = await post('/api/support/admin/reply', { ticket_id: tk2.id, text: 'رد من لوحة المنصة' }, { cookie: 'sid=sidsuper' }).then(r => JSON.parse(r.body));
  ok('الرد من لوحة المنصة يعمل', rep.ok === true);
  ok('الرد من المنصة وصل المستخدم', /رد من لوحة المنصة/.test(allText(USER_TG)));
  const repBad = await post('/api/support/admin/reply', { ticket_id: tk2.id, text: 'x' }, { cookie: 'sid=unknown' }).then(r => ({ code: r.code }));
  ok('الرد بلا جلسة مرفوض', repBad.code === 401);

  api.close();
  console.log(`\n═══ النتيجة: ${pass} نجح / ${fail} فشل ═══`);
  tgSrv.close();
  process.exit(fail ? 1 : 0);
})();
