const core = require('../cf-worker/payments-core.js');
let fail = 0;
const eq = (label, got, want) => { const okv = got === want; if (!okv) fail++; console.log((okv ? '✅' : '❌') + ' ' + label + ' → ' + got + (okv ? '' : ' (المتوقع ' + want + ')')); };
/* المستخدم العادي (بدون دور) — الشرائح الجديدة */
eq('مستخدم 99$ ⇒ 0%', core.depositBonusPct(99), 0);
eq('مستخدم 100$ ⇒ 5%', core.depositBonusPct(100), 5);
eq('مستخدم 300$ ⇒ 5%', core.depositBonusPct(300), 5);
eq('مستخدم 500$ ⇒ 8%', core.depositBonusPct(500), 8);
eq('مستخدم 999$ ⇒ 8%', core.depositBonusPct(999), 8);
eq('مستخدم 1000$ ⇒ 10%', core.depositBonusPct(1000), 10);
eq('مستخدم 4999$ ⇒ 10%', core.depositBonusPct(4999), 10);
eq('مستخدم 5000$ ⇒ 15%', core.depositBonusPct(5000), 15);
eq('مستخدم 9999$ ⇒ 15%', core.depositBonusPct(9999), 15);
eq('مستخدم 10000$ ⇒ 20%', core.depositBonusPct(10000), 20);
eq('مستخدم 100000$ ⇒ 20%', core.depositBonusPct(100000), 20);
/* لم يعد خلط الأدمنز على المستخدم: */
eq('مستخدم 100$ ليس 25% (الخلل القديم)', core.depositBonusPct(100) === 25 ? 1 : 0, 0);
/* الأدمن الفعلي: */
eq('أدمن 999$ ⇒ 0%', core.depositBonusPct(999, 'admin'), 0);
eq('أدمن 1000$ ⇒ 30%', core.depositBonusPct(1000, 'admin'), 30);
eq('سوبر 10000$ ⇒ 35%', core.depositBonusPct(10000, 'super'), 35);
eq('سوبر 100000$ ⇒ 40%', core.depositBonusPct(100000, 'super'), 40);
/* الدرهم للمستخدم: */
eq('مستخدم 999 MAD ⇒ 0%', core.depositBonusPct(999, null, 'mad'), 0);
eq('مستخدم 1000 MAD ⇒ 5%', core.depositBonusPct(1000, null, 'mad'), 5);
eq('مستخدم 100000 MAD ⇒ 20%', core.depositBonusPct(100000, null, 'mad'), 20);
eq('أدمن 1000 MAD ⇒ 30%', core.depositBonusPct(1000, 'admin', 'mad'), 30);
/* أكواد الشحن المسبقة: */
eq('tierCoins admin 100$ ⇒ null (أُزيلت الشريحة)', core.tierCoins('admin', 100, 'usd'), null);
eq('tierCoins admin 1000$ coins', core.tierCoins('admin', 1000, 'usd').coins, 130000);
eq('tierCoins direct 100$ bonus', core.tierCoins('direct', 100, 'usd').bonus, 5);
/* مسار الإصدار مع دور حقيقي: */
(async () => {
  const DatabaseSync = require('node:sqlite').DatabaseSync;
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, role TEXT DEFAULT \'user\', gold INTEGER DEFAULT 0, telegram_id TEXT, email TEXT, balance_usd REAL DEFAULT 0)');
  db.exec('CREATE TABLE transactions (id TEXT PRIMARY KEY, user_id TEXT, type TEXT, amount_usd REAL, method TEXT, status TEXT, proof_details TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  db.exec('CREATE TABLE vouchers (code TEXT PRIMARY KEY, amount_usd REAL, kind TEXT DEFAULT \'std\', coins INTEGER DEFAULT 0, bonus_pct INTEGER DEFAULT 0, is_used BOOLEAN DEFAULT 0, used_by_user_id TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  db.prepare('INSERT INTO users (id, username, role, gold) VALUES (?, ?, ?, ?)').run(101, 'plain_user', 'user', 0);
  db.prepare('INSERT INTO users (id, username, role, gold) VALUES (?, ?, ?, ?)').run(102, 'boss_admin', 'super', 0);
  const shim = { prepare: (sql) => ({ bind: (...a) => ({ run: (...a2) => { const r = db.prepare(sql).run(...a, ...a2); return { meta: { changes: Number(r.changes) } }; }, all: (...a2) => ({ results: db.prepare(sql).all(...a, ...a2) }), first: (...a2) => { const rows = db.prepare(sql).all(...a, ...a2); return rows[0] || null; } }) }) };
  db.prepare("INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES ('kod-plain','101','deposit',100,'cash_plus','pending','[KOD] test')").run();
  db.prepare("INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES ('kod-admin','102','deposit',1000,'cash_plus','pending','[KOD] test')").run();
  const env = { __rate: () => 100, __settleGold: (id, c) => { db.prepare('UPDATE users SET gold = gold + ? WHERE id = ?').run(c, Number(id)); } };
  const r1 = await core.adminActOnTransaction(env, shim, 'kod-plain', 'dapp');
  eq('مستخدم عادي 100$ ⇒ كود 10500 كوين (بونص 5%)', r1.coins, 10500);
  eq('بونص الكود 5%', r1.bonus_pct, 5);
  const r2 = await core.adminActOnTransaction(env, shim, 'kod-admin', 'dapp');
  eq('سوبر أدمن 1000$ ⇒ كود 130000 كوين (بونص 30%)', r2.coins, 130000);
  eq('بونص الكود 30%', r2.bonus_pct, 30);
  console.log(fail ? ('❌ فشل ' + fail) : '✅ كل فحوص مصفوفة الشرائح نجحت');
  process.exit(fail ? 1 : 0);
})();
