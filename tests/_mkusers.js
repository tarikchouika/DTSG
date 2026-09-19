/* إنشاء/تحديث مستخدمي QA في قاعدة خادم الاختبار */
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const DB = process.env.QA_DB || '/tmp/full/data/royalcoin.db';
const db = new DatabaseSync(DB);
function mk(pw) { const salt = crypto.randomBytes(16); const h = crypto.scryptSync(pw, salt, 64); return { salt: salt.toString('hex'), hash: h.toString('hex') }; }
/* [v2.44] معرّفات ثابتة: بقية الاختبارات (admin-payments-ui وغيرها) تفترض qa_player=18
   وqa_admin=19 وqa_super=20 ⇒ نزرعها صراحةً في القاعدة كي لا يعتمد الاختبار على ترتيب الإدراج. */
const users = [
  { id: 18, username: 'qa_player', role: 'user', gold: 1000, tg: '555000111' },
  { id: 19, username: 'qa_admin', role: 'admin', gold: 5000, tg: null },
  { id: 20, username: 'qa_super', role: 'super', gold: 5000, tg: '5700612979' }
];
for (const u of users) {
  const p = mk('QaTest12345');
  const ex = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
  if (ex) {
    db.prepare('UPDATE users SET pass_hash=?, pass_salt=?, role=?, gold=? WHERE id=?').run(p.hash, p.salt, u.role, u.gold, ex.id);
    if (u.tg) { try { db.prepare('UPDATE users SET telegram_id=? WHERE id=?').run(u.tg, ex.id); } catch (e) {} }
    console.log('محدَّث:', u.username, 'id=' + ex.id);
  } else {
    /* إن كان المعرّف المطلوب محجوزاً لمستخدم آخر نُنشئ بدونه (لن تفشل العملية) */
    const taken = db.prepare('SELECT username FROM users WHERE id = ?').get(u.id);
    const r = db.prepare('INSERT INTO users (id, username, pass_hash, pass_salt, role, gold, lang, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(taken ? null : u.id, u.username, p.hash, p.salt, u.role, u.gold, 'ar', Math.floor(Date.now() / 1000) - 86400 * 30, Math.floor(Date.now() / 1000));
    const id = taken ? Number(r.lastInsertRowid) : u.id;
    if (u.tg) { try { db.prepare('UPDATE users SET telegram_id=? WHERE id=?').run(u.tg, id); } catch (e) {} }
    console.log('أُنشئ:', u.username, 'id=' + id);
  }
}
console.log(db.prepare("SELECT id,username,role,gold,telegram_id FROM users WHERE username LIKE 'qa%'").all());
