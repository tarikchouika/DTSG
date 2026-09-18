/* إنشاء/تحديث مستخدمي QA في قاعدة خادم الاختبار */
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const DB = process.env.QA_DB || '/tmp/full/data/royalcoin.db';
const db = new DatabaseSync(DB);
function mk(pw) { const salt = crypto.randomBytes(16); const h = crypto.scryptSync(pw, salt, 64); return { salt: salt.toString('hex'), hash: h.toString('hex') }; }
const users = [
  { username: 'qa_player', role: 'user', gold: 1000, tg: '555000111' },
  { username: 'qa_admin', role: 'admin', gold: 5000, tg: null },
  { username: 'qa_super', role: 'super', gold: 5000, tg: '5700612979' }
];
for (const u of users) {
  const p = mk('QaTest12345');
  const ex = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
  if (ex) {
    db.prepare('UPDATE users SET pass_hash=?, pass_salt=?, role=?, gold=? WHERE id=?').run(p.hash, p.salt, u.role, u.gold, ex.id);
    if (u.tg) { try { db.prepare('UPDATE users SET telegram_id=? WHERE id=?').run(u.tg, ex.id); } catch (e) {} }
    console.log('محدَّث:', u.username, 'id=' + ex.id);
  } else {
    const r = db.prepare('INSERT INTO users (username, pass_hash, pass_salt, role, gold, lang, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?)')
      .run(u.username, p.hash, p.salt, u.role, u.gold, 'ar', Math.floor(Date.now() / 1000) - 86400 * 30, Math.floor(Date.now() / 1000));
    const id = Number(r.lastInsertRowid);
    if (u.tg) { try { db.prepare('UPDATE users SET telegram_id=? WHERE id=?').run(u.tg, id); } catch (e) {} }
    console.log('أُنشئ:', u.username, 'id=' + id);
  }
}
console.log(db.prepare("SELECT id,username,role,gold,telegram_id FROM users WHERE username LIKE 'qa%'").all());
