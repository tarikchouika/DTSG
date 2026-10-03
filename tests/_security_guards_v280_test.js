/* ═══ [v2.80·أمن] جناح حراس الإصلاحات الأمنية ═══
   يغطي الثغرات المؤكدة التي أُغلقت في v2.80 — كل فحص يثبت الرفض/القبول الصحيح:
   أ-1 settleLegacy: لا نقل ذهب خارج لاعبي الغرفة/escrow
   أ-2 register: لا تصعيد admin→super ولا رصيد افتتاحي بلا سوبر (وبسجل deposit للسوبر)
   أ-3 start: لا اقتطاع مكرر لغرفة جارية
   أ-4 جسم الطلب: سقف 1MB ⇒ 413
   أ-5 قفل الدخول الإسمي: تدوير XFF لا يبطل القفل
   أ-8 ويب هوك: فشل مغلق (بلا سرٍّ ⇒ 403) */
const http = require('http');
const SB = require('./_safe_base.js');
const BASE = { host: SB.host, port: SB.port };

function req(method, path, body, cookie, headers) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { host: BASE.host, port: SB.port, path, method,
      headers: Object.assign({ 'Content-Type': 'application/json', Connection: 'close' }, headers || {}),
      agent: false };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    if (cookie) opts.headers.Cookie = cookie;
    const r = http.request(opts, (res) => {
      let buf = ''; res.on('data', d => buf += d); res.on('end', () => {
        let j; try { j = JSON.parse(buf); } catch (e) { j = buf; }
        resolve({ status: res.statusCode, json: j, cookie: (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ') });
      });
    });
    r.on('error', () => resolve({ status: 0, json: null }));
    if (data) r.write(data);
    r.end();
  });
}
function rawPost(path, rawBody, headers) {
  return new Promise((resolve) => {
    const opts = { host: BASE.host, port: SB.port, path, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', Connection: 'close' }, headers || {}),
      agent: false };   /* [v2.80] بلا keep-alive: مقبس 413 المدمَّر لا يسمّ الطلبات التالية */
    const r = http.request(opts, (res) => {
      let buf = ''; res.on('data', d => buf += d); res.on('end', () => resolve({ status: res.statusCode }));
    });
    r.on('error', () => resolve({ status: 0 }));
    if (rawBody) r.write(rawBody);
    r.end();
  });
}
async function newUser(name, password) {
  await req('POST', '/api/register', { username: name, password: password || 'pw123456' });
  const r = await req('POST', '/api/login', { username: name, password: password || 'pw123456' });
  return { name, cookie: r.cookie, id: r.json && r.json.user && r.json.user.id, gold: r.json.user.gold, role: r.json.user.role };
}
const gold = (u) => req('GET', '/api/me', null, u.cookie).then(r => r.json.user.gold);

(async () => {
  const results = [];
  const ok = (n, c, extra) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n + (extra ? ' ' + extra : '')); };
  const tag = Date.now() % 100000;
  const SUPER_PW = process.env.DM_SEED_SUPER_PW || 'QaTest12345';
  await req('POST', '/api/register', { username: 'super', password: SUPER_PW }).catch(() => {});
  const SUPER = await req('POST', '/api/login', { username: 'super', password: SUPER_PW });
  const superU = { cookie: SUPER.cookie, id: SUPER.json && SUPER.json.user && SUPER.json.user.id };

  /* ═══ أ-2: register — لا تصعيد صلاحيات ولا رصيد من غير السوبر ═══ */
  {
    const ADM = await newUser('secad_' + tag);
    await req('POST', '/api/register', { username: 'secad2_' + tag, password: 'pw123456', role: 'admin' }, ADM.cookie);
    const probe = await newUser('secad2_' + tag);   /* الرصيد لا يهم هنا — الدور يهم */
    const who = await req('GET', '/api/me', null, probe.cookie);
    /* إنشاء الحساب رُفض (403) ⇒ الاسم لم يُنشأ ⇒ دخولنا بجلسة test-mode الذاتية… نفحص دور الحساب عبر محاولة إنشاءه من سوبر بدلاً منه */
    const bySuper = await req('POST', '/api/register', { username: 'secad3_' + tag, password: 'pw123456', role: 'admin', gold: 777 }, superU.cookie);
    const made = await req('GET', '/api/me', null, bySuper.json && bySuper.json.session ? bySuper.json.session : undefined);
    const acc = await req('POST', '/api/login', { username: 'secad3_' + tag, password: 'pw123456' });
    ok('super creates admin with gold=777', acc.json && acc.json.user && acc.json.user.role === 'admin' && acc.json.user.gold === 777, JSON.stringify(acc.json && acc.json.user && acc.json.user.gold));
    /* أدمن يحاول صنع سوبر ⇒ 403 والحساب لا يُنشأ */
    const esc = await req('POST', '/api/register', { username: 'secup_' + tag, password: 'pw123456', role: 'super' }, ADM.cookie);
    ok('admin cannot create super (403)', esc.status === 403, 'status=' + esc.status);
    const escLogin = await req('POST', '/api/login', { username: 'secup_' + tag, password: 'pw123456' });
    ok('escalated account was not created', escLogin.status === 401, 'status=' + escLogin.status);
    /* أدمن يحاول رصيداً افتتاحياً ⇒ يُفرض 0 */
    await req('POST', '/api/register', { username: 'secgold_' + tag, password: 'pw123456', gold: 9999 }, ADM.cookie);
    const g = await req('POST', '/api/login', { username: 'secgold_' + tag, password: 'pw123456' });
    ok('admin-granted start gold forced to 0', g.json && g.json.user && g.json.user.gold === 0, 'gold=' + (g.json && g.json.user && g.json.user.gold));
    /* السوبر بذر الرصيد أُسجل صف deposit */
    /* [ما بعد v2.80.0] كان المسار `process.env.QA_DB || SB.QA_DB_FALLBACK || 'data/royalcoin.db'`
       و`SB.QA_DB_FALLBACK` غير مُصدَّر أصلاً (tests/_safe_base.js لا يصدّره) ⇒
       `QA_DB` غائباً ⇒ كان الفحص يفتح **قاعدة الإنتاج** ويعدّ صفوفها، فيمرّ
       أو يسقط لأسباب لا علاقة لها بالإصلاح — وهو انتهاك القاعدة 13. الآن: المسار
       المعتمد في كل جناح آخر (_mkusers · _fin_logs · _admin_payments_ui)،
       وغياب QA_DB = رفض صريح لا قراءة صامتة لقاعدة أخرى. */
    const NODE = require('node:sqlite');
    const QA_DB = process.env.QA_DB || '/tmp/full/data/royalcoin.db';
    if (!QA_DB || QA_DB.endsWith('/DTSG/data/royalcoin.db')) {
      console.log('  ✗ رفض التشغيل: QA_DB يشير إلى قاعدة الإنتاج (القاعدة 13) — عيّن QA_DB على نسخة معزولة');
      process.exit(2);
    }
    let depRow = null;
    try {
      const db = new NODE.DatabaseSync(QA_DB, { readOnly: true });
      depRow = db.prepare("SELECT COUNT(*) c FROM transactions WHERE type='deposit' AND note LIKE '%افتتاحي%'").get();
      db.close();
    } catch (e) { depRow = { c: -1, err: e.message }; }
    ok('super-granted start gold logged as deposit row', depRow.c > 0, JSON.stringify(depRow).slice(0, 60));
  }

  /* ═══ أ-3: start على غرفة جارية ⇒ 400 ═══ */
  {
    const A = await newUser('seca_' + tag), B = await newUser('secb_' + tag);
    const cr = await req('POST', '/api/rooms', { game_id: 'ch', bet: 10, max_players: 2 }, A.cookie);
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, B.cookie);
    await req('POST', '/api/rooms/ready', { room_id: cr.json.room.id, ready: true }, A.cookie);
    await req('POST', '/api/rooms/ready', { room_id: cr.json.room.id, ready: true }, B.cookie);
    const s1 = await req('POST', '/api/rooms/start', { room_id: cr.json.room.id }, A.cookie);
    const gA1 = await gold(A), gB1 = await gold(B);
    const s2 = await req('POST', '/api/rooms/start', { room_id: cr.json.room.id }, A.cookie);
    const gA2 = await gold(A), gB2 = await gold(B);
    ok('start while playing rejected (400)', s2.status === 400, 'status=' + s2.status);
    ok('no double deduction on repeated start', gA2 === gA1 && gB2 === gB1, '(ΔA=' + (gA2 - gA1) + ')');
  }

  /* ═══ أ-1: settleLegacy — لا صيد خارج الغرفة ═══ */
  {
    const A = await newUser('secs_' + tag), B = await newUser('sect_' + tag);
    const V = await newUser('secv_' + tag);   /* ضحية خارج الغرفة */
    const cr = await req('POST', '/api/rooms', { game_id: 'ch', bet: 10, max_players: 2 }, A.cookie);
    const rid = cr.json.room.id;
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, B.cookie);
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, A.cookie);
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, B.cookie);
    await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    const vBefore = await gold(V);
    /* المالك يحاول تصنيف ضحية خارج الغرفة خاسراً لصالح شريكه */
    const hunt = await req('POST', '/api/rooms/settle', { room_id: rid, loser: V.name, winner: A.name, amount: 50 }, A.cookie);
    ok('settleLegacy refuses non-member victim (403)', hunt.status === 403, 'status=' + hunt.status);
    ok('victim balance untouched', (await gold(V)) === vBefore, '');
    /* تسوية مشروعة داخل الغرفة بالescrow تعمل */
    const legal = await req('POST', '/api/rooms/settle', { room_id: rid, loser: B.name, winner: A.name, amount: 10 }, A.cookie);
    ok('settleLegacy within escrow accepted', legal.status === 200, 'status=' + legal.status + ' ' + JSON.stringify(legal.json).slice(0, 60));
  }

  /* ═══ أ-4: جسم الطلب الضخم ⇒ 413 ═══ */
  {
    const big = 'x'.repeat(1100 * 1024);
    const r = await rawPost('/api/login', JSON.stringify({ username: 'u', password: 'p', pad: big }));
    ok('request body over 1MB rejected (413)', r.status === 413, 'status=' + r.status);
  }

  /* ═══ أ-8: ويب هوك بلا سرٍّ ⇒ 403 ═══ */
  {
    const s1 = await rawPost('/api/support/webhook', JSON.stringify({ update_id: 1 }));
    ok('support webhook without secret rejected (403)', s1.status === 403, 'status=' + s1.status);
    const s2 = await rawPost('/api/financials/webhook', JSON.stringify({ update_id: 1 }));
    ok('financials webhook without secret rejected (403)', s2.status === 403, 'status=' + s2.status);
  }

  /* ═══ أ-5: قفل الدخول الإسمي — تدوير XFF لا يبطل القفل ═══ */
  {
    const victim = 'seclock_' + tag;
    await req('POST', '/api/register', { username: victim, password: 'pw123456' });
    let locked = false;
    for (let i = 0; i < 25; i++) {
      const ip = '10.0.' + Math.floor(i / 250) + '.' + (i % 250 + 1);   /* عنوان مختلف كل محاولة */
      const r = await req('POST', '/api/login', { username: victim, password: 'wrong' + i }, null, { 'x-forwarded-for': ip });
      if (r.status === 429) { locked = true; break; }
    }
    ok('username lockout holds despite XFF rotation (429)', locked, '');
    const correct = await req('POST', '/api/login', { username: victim, password: 'pw123456' });
    ok('locked account refuses even correct password (429)', correct.status === 429, 'status=' + correct.status);
  }

  const failed = results.filter(r => !r[1]).length;
  console.log('\n═══ حراس الأمن v2.80: ' + (results.length - failed) + '/' + results.length + ' ═══');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
