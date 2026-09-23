/**
 * tests/_audit_remediation_test.js — بطارية تدقيق DTSG (28 فحصاً)
 * ═════════════════════════════════════════════════════════════════════════
 * ثغرات التدقيق الأصلية: DTSG-001/002/003/005/006/007/010/014/019
 * + إصلاحات v2.58: CORS لكل الطرق · ثغرة 2FA · أنواع الرهانات الخام ·
 *   المتصدرون بلا أرصدة · binance-verify بجلسة · قسaims ≤10/د.
 *
 * التشغيل (الخادم يعمل على 127.0.0.1:3000 — مثلاً: bash scripts/qa-env.sh ثم
 * ضبط QA_PORT، أو أي خادم QA على المنفذ 3000):
 *   node tests/_audit_remediation_test.js
 */
const http = require('http');
const assert = require('assert');
const crypto = require('crypto');

const BASE = 'http://127.0.0.1:3000';

function req(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opt = {
      method: options.method || 'GET',
      headers: options.headers || {},
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search
    };
    const r = http.request(opt, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, raw: data, json });
      });
    });
    r.on('error', reject);
    if (options.body) {
      r.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    r.end();
  });
}
function cookieOf(res) {
  const c = res.headers['set-cookie'];
  if (!c) return null;
  return (Array.isArray(c) ? c[0] : c).split(';')[0];
}

/* ── TOTP (مطابق totpAt في server.js — SHA1/30s/6) ── */
function b32decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = String(s).toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0; const out = [];
  for (const c of s) {
    const idx = A.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >>> bits) & 0xff); }
  }
  return Buffer.from(out);
}
function totpAt(secret, timeMs) {
  const key = b32decode(secret);
  if (!key.length) return '';
  const counter = Math.floor(timeMs / 30000);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, '0');
}
function wrongCode(secret) {
  const now = Date.now();
  const valid = new Set([totpAt(secret, now - 30000), totpAt(secret, now), totpAt(secret, now + 30000)]);
  for (const c of ['654321', '000000', '111222', '333444']) if (!valid.has(c)) return c;
  let c = '555666';
  while (valid.has(c)) c = String((parseInt(c, 10) + 13) % 1000000).padStart(6, '0');
  return c;
}

let N = 0;
function ok(id, msg) { N++; console.log('  ✅ ' + N + ') ' + msg); }

async function run() {
  console.log('═══ DTSG Security Audit Battery (28 checks) ═══\n');

  // 1) OPTIONS من أصل شرير
  const preflightBad = await req('/api/sync', {
    method: 'OPTIONS',
    headers: { 'Origin': 'https://evil-attacker.com', 'Access-Control-Request-Method': 'POST' }
  });
  assert.strictEqual(preflightBad.status, 403, 'Preflight from evil origin must be 403');
  ok('1', 'OPTIONS من أصل شرير ⇒ 403 (DTSG-005/011)');

  // 2) POST من أصل شرير + بلا ACAO
  const postBad = await req('/api/sync', {
    method: 'POST',
    headers: { 'Origin': 'https://evil-attacker.com', 'Content-Type': 'application/json' },
    body: { gold: 999999 }
  });
  assert.strictEqual(postBad.status, 403, 'Cross-origin POST must be 403');
  assert(!postBad.headers['access-control-allow-origin'], 'No ACAO for untrusted origin');
  ok('2', 'POST من أصل شرير ⇒ 403 بلا ACAO (حماية CSRF)');

  // 3) GET من أصل شرير (الثغرة: القراءات كانت تتسرّب)
  const getBad = await req('/api/lb', { headers: { 'Origin': 'https://evil-attacker.com' } });
  assert.strictEqual(getBad.status, 403, 'Cross-origin GET must be 403 (v2.58)');
  ok('3', 'GET من أصل شرير ⇒ 403 (القراءات لم تعد تتسرّب — v2.58)');

  // 4) GET من *.pages.dev غير موثوق (النقطة العمياء القديمة)
  const getPages = await req('/api/wallet/balance?user_id=1', { headers: { 'Origin': 'https://attacker-x.pages.dev' } });
  assert.strictEqual(getPages.status, 403, 'Any *.pages.dev is NOT trusted (v2.58)');
  ok('4', 'أصل *.pages.dev غريب ⇒ 403 (قائمة صارمة — لا wildcard)');

  // 5) الأصل الموثوق يعمل
  const preflightGood = await req('/api/sync', {
    method: 'OPTIONS',
    headers: { 'Origin': 'https://dtsg.pages.dev', 'Access-Control-Request-Method': 'POST' }
  });
  assert.strictEqual(preflightGood.status, 204, 'Trusted preflight 204');
  assert.strictEqual(preflightGood.headers['access-control-allow-origin'], 'https://dtsg.pages.dev');
  assert.strictEqual(preflightGood.headers['access-control-allow-credentials'], 'true');
  ok('5', 'الأصل الموثوق dtsg.pages.dev ⇒ 204 + ACAO + credentials');

  // 6) 401 موحّد (لا حصاد أسماء)
  const badUser = await req('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: { username: 'non_existent_user_9999', password: 'wrongpassword' }
  });
  assert.strictEqual(badUser.status, 401);
  assert.strictEqual(badUser.json.message, 'بيانات الدخول غير صحيحة — اسم المستخدم أو كلمة المرور خاطئة');
  ok('6', 'مستخدم غير موجود ⇒ 401 موحّد (DTSG-007)');

  // 7) كلمة مرور خاطئة ⇒ نفس الرسالة
  const wrongPass = await req('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: { username: 'admin', password: 'wrongpassword' }
  });
  assert.strictEqual(wrongPass.status, 401);
  assert.strictEqual(wrongPass.json.message, 'بيانات الدخول غير صحيحة — اسم المستخدم أو كلمة المرور خاطئة');
  ok('7', 'كلمة مرور خاطئة ⇒ 401 بنفس الرسالة حرفياً');

  // 8) حد المعدل: 5 إخفاقات ⇒ قفل (429 خلال 11 محاولة)
  let rateLimited = false;
  for (let i = 0; i < 11; i++) {
    const res = await req('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.25' },
      body: { username: 'rate_test_user', password: 'any' }
    });
    if (res.status === 429) { rateLimited = true; assert(res.json.retry_after > 0); break; }
  }
  assert(rateLimited, '429 after repeated failures');
  ok('8', 'تراجع أُسّي: 5 إخفاقات ⇒ قفل + 429 (DTSG-006 v2.58)');

  // 9) دخول اللاعب + كوكي
  const loginRes = await req('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: { username: 'player', password: 'RoyalCoin@User1' }
  });
  assert.strictEqual(loginRes.status, 200);
  const sidCookie = cookieOf(loginRes);
  assert(sidCookie, 'Session cookie present');
  const initialGold = loginRes.json.user.gold;
  ok('9', 'دخول اللاعب + كوكي جلسة (gold=' + initialGold + ')');

  // 10) تزوير الرصيد في /api/sync مرفوض
  const syncForged = await req('/api/sync', {
    method: 'POST', headers: { 'Cookie': sidCookie, 'Content-Type': 'application/json' },
    body: { gold: 9999999, gold_rev: 0 }
  });
  assert.strictEqual(syncForged.status, 200);
  assert.strictEqual(syncForged.json.gold, initialGold, 'Server ignores client gold');
  ok('10', 'تزوير gold في /api/sync ⇒ تجاهل (DTSG-001)');

  // 11) /api/sync بلا جلسة
  const syncUnauth = await req('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { gold: 123456 } });
  assert.strictEqual(syncUnauth.status, 401);
  ok('11', '/api/sync بلا جلسة ⇒ 401');

  // 12) طلب سحب بلا جلسة
  const wdUnauth = await req('/api/withdrawals/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: { user_id: '1', amount_usd: 10, method: 'cih', details: 'CIH123456' }
  });
  assert.strictEqual(wdUnauth.status, 401);
  ok('12', 'سحب بلا جلسة ⇒ 401 (DTSG-002)');

  // 13) استعلام رصيد بلا جلسة
  const balUnauth = await req('/api/wallet/balance?user_id=1');
  assert.strictEqual(balUnauth.status, 401);
  ok('13', 'رصيد بلا جلسة ⇒ 401 (DTSG-003)');

  // 14) IDOR: user_id مزوّر يُثبَّت على الجلسة
  const wdIdor = await req('/api/withdrawals/request', {
    method: 'POST',
    headers: { 'Cookie': sidCookie, 'Content-Type': 'application/json' },
    body: { user_id: '99999', amount_usd: 100000, method: 'cih', details: 'CIH123456' }
  });
  assert(wdIdor.status === 402 || (wdIdor.json && !wdIdor.json.ok), 'IDOR cannot withdraw from target');
  ok('14', 'IDOR سحب ⇒ تثبيت user_id على الجلسة (لا رصيد الغير)');

  // 15) رصيد الجلسة يُثبَّت على هويتها
  const balAuth = await req('/api/wallet/balance?user_id=99999', { headers: { 'Cookie': sidCookie } });
  assert.strictEqual(balAuth.status, 200);
  assert.strictEqual(balAuth.json.coins, initialGold, 'Balance pinned to session user');
  ok('15', 'استعلام رصيد باسم مستخدم آخر ⇒ رصيد الجلسة فقط (لا حصاد)');

  // 16) ثغرة 2FA: جلسة لأي userId بلا رمز/كلمة مرور
  const superLogin = await req('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: { username: 'super', password: 'QaTest12345' }
  });
  const superCookie = cookieOf(superLogin);
  const superId = superLogin.json.user.id;
  const bypass = await req('/api/2fa/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: { userId: superId }
  });
  assert.strictEqual(bypass.status, 401, '2FA bypass must be 401');
  assert(!bypass.headers['set-cookie'], 'No session cookie on bypass attempt');
  ok('16', 'POST /api/2fa/login {userId:سوبر} بلا رمز ⇒ 401 بلا كوكي (الثغرة مغلقة — v2.58)');

  // 17-18) دورة 2FA كاملة بـTOTP حقيقي
  const stamp = Date.now().toString(36);
  const u2 = 'aud2fa_' + stamp;
  const reg2 = await req('/api/admin/register', {
    method: 'POST', headers: { 'Cookie': superCookie, 'Content-Type': 'application/json' },
    body: { username: u2, password: 'Aud2faPass1' }
  });
  assert.strictEqual(reg2.status, 200, 'admin register');
  const id2 = reg2.json.user.id;
  const lg2 = await req('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { username: u2, password: 'Aud2faPass1' } });
  const ck2 = cookieOf(lg2);
  const en2 = await req('/api/2fa/enable', { method: 'POST', headers: { 'Cookie': ck2, 'Content-Type': 'application/json' }, body: {} });
  const sec2 = en2.json.secret;
  const vf2 = await req('/api/2fa/verify', { method: 'POST', headers: { 'Cookie': ck2, 'Content-Type': 'application/json' }, body: { code: totpAt(sec2, Date.now()) } });
  assert.strictEqual(vf2.status, 200, '2FA enable');
  const lg2b = await req('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { username: u2, password: 'Aud2faPass1' } });
  assert(lg2b.json && lg2b.json.twofa_required === true && lg2b.json.two_fa_token, 'twofa_required + token');
  const badTotp = await req('/api/2fa/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: { userId: id2, two_fa_token: lg2b.json.two_fa_token, code: wrongCode(sec2) }
  });
  assert.strictEqual(badTotp.status, 401, 'wrong TOTP 401');
  ok('17', 'دخول بحساب 2FA ⇒ twofa_required + رمز إكمال؛ رمز خاطئ ⇒ 401');
  const lg2c = await req('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { username: u2, password: 'Aud2faPass1' } });
  const goodTotp = await req('/api/2fa/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: { userId: id2, two_fa_token: lg2c.json.two_fa_token, code: totpAt(sec2, Date.now()) }
  });
  assert.strictEqual(goodTotp.status, 200, 'correct TOTP 200');
  assert(cookieOf(goodTotp), 'session issued after correct TOTP');
  ok('18', 'رمز TOTP صحيح ⇒ جلسة كاملة (200 + كوكي)');

  // 19) قفل 2FA بعد 5 محاولات
  const u3 = 'aud2falock_' + stamp;
  const reg3 = await req('/api/admin/register', {
    method: 'POST', headers: { 'Cookie': superCookie, 'Content-Type': 'application/json' },
    body: { username: u3, password: 'Aud2faPass1' }
  });
  const id3 = reg3.json.user.id;
  const lg3 = await req('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { username: u3, password: 'Aud2faPass1' } });
  const ck3 = cookieOf(lg3);
  const en3 = await req('/api/2fa/enable', { method: 'POST', headers: { 'Cookie': ck3, 'Content-Type': 'application/json' }, body: {} });
  const sec3 = en3.json.secret;
  await req('/api/2fa/verify', { method: 'POST', headers: { 'Cookie': ck3, 'Content-Type': 'application/json' }, body: { code: totpAt(sec3, Date.now()) } });
  let lockHit = false;
  for (let i = 0; i < 5; i++) {
    const lgi = await req('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { username: u3, password: 'Aud2faPass1' } });
    const ri = await req('/api/2fa/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: { userId: id3, two_fa_token: (lgi.json || {}).two_fa_token, code: wrongCode(sec3) }
    });
    if (i === 4 && ri.status === 429) lockHit = true;
  }
  assert(lockHit, '2FA lockout after 5 wrong codes');
  ok('19', 'قفل 2FA: 5 رموز خاطئة ⇒ 429 + قفل 15 دقيقة (v2.58)');

  // 20-22) أنواع رهانات خام (كينو — نافذة خلال ~95ث؛ [ثبات] كل استدعاء يتحقق من النافذة
  //      والرفض يتأكد سببه: رسالة المبلغ لا «انتهى الوقت»)
  const AMT_ERR = 'مبلغ غير صالح — عدد صحيح 1 على الأقل';
  let inWindow = false;
  for (let i = 0; i < 100; i++) {
    const r = await req('/api/games/ke/round', { headers: { 'Cookie': sidCookie } });
    if (r.json && r.json.round && r.json.round.status === 'betting') { inWindow = true; break; }
    await new Promise((r2) => setTimeout(r2, 1000));
  }
  assert(inWindow, 'keno betting window');
  const b05 = await req('/api/games/ke/bet', { method: 'POST', headers: { 'Cookie': sidCookie, 'Content-Type': 'application/json' }, body: { amount: 0.5, picks: [3] } });
  assert.strictEqual(b05.status, 400, '0.5 rejected');
  assert.strictEqual(b05.json.message, AMT_ERR, '0.5 rejected for amount reason');
  ok('20', 'رهان 0.5 (كسر) ⇒ 400 (NEW-2: لا ذهب كسري)');
  const bStr = await req('/api/games/ke/bet', { method: 'POST', headers: { 'Cookie': sidCookie, 'Content-Type': 'application/json' }, body: { amount: '10', picks: [3] } });
  assert.strictEqual(bStr.status, 400, 'string rejected');
  assert.strictEqual(bStr.json.message, AMT_ERR, 'string rejected for amount reason');
  ok('21', 'رهان "10" (نص) ⇒ 400 (التحقق على النوع الخام)');
  const b105 = await req('/api/games/ke/bet', { method: 'POST', headers: { 'Cookie': sidCookie, 'Content-Type': 'application/json' }, body: { amount: 10.5, picks: [3] } });
  assert.strictEqual(b105.status, 400, '10.5 rejected');
  assert.strictEqual(b105.json.message, AMT_ERR, '10.5 rejected for amount reason');
  /* [ثبات] كل محاولة برقم مختلف (رقم مرهون مرة واحدة للجولة) — أرقام مخصصة
     لبطارية sec-audit (4/13/15/17) لا تتقاطع مع حارس cat (5/7/9/11). */
  let bOk = null;
  for (const pick of [4, 13, 15, 17]) {
    for (let i = 0; i < 100; i++) {
      const r = await req('/api/games/ke/round', { headers: { 'Cookie': sidCookie } });
      if (r.json && r.json.round && r.json.round.status === 'betting') break;
      await new Promise((r2) => setTimeout(r2, 1000));
    }
    bOk = await req('/api/games/ke/bet', { method: 'POST', headers: { 'Cookie': sidCookie, 'Content-Type': 'application/json' }, body: { amount: 1, picks: [pick] } });
    if (bOk.status === 200) break;
    if (bOk.status === 400 && /انتهى وقت الرهان/.test(bOk.json && bOk.json.message || '')) continue;
  }
  assert(b105.status === 400 && bOk && bOk.status === 200, '10.5 rejected / 1 accepted');
  ok('22', 'رهان 10.5 ⇒ 400 · رهان 1 (عدد صحيح) ⇒ 200');

  // 23) المتصدرون: بلا أرصدة
  const lb = await req('/api/lb');
  assert.strictEqual(lb.status, 200);
  const entries = lb.json.leaderboard || [];
  assert(entries.length > 0, 'leaderboard non-empty');
  assert(entries.every(e => !('gold' in e) && !('usd' in e)), 'no balances');
  assert(entries.every(e => e.rank && e.username), 'rank+username shape');
  ok('23', 'المتصدرون {rank, username} بلا أرصدة (NEW-4)');

  // 24) binance-verify بلا جلسة
  const bvNo = await req('/api/payments/binance-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: { user_id: '1', amount_usd: 10 }
  });
  assert.strictEqual(bvNo.status, 401, 'binance-verify requires session');
  ok('24', 'binance-verify بلا جلسة ⇒ 401 (NEW-1: جلسة إلزامية)');

  // 25) قسائم ≤10/د
  const spam = [];
  for (let i = 0; i < 11; i++) {
    spam.push(await req('/api/vouchers/redeem', {
      method: 'POST', headers: { 'Cookie': sidCookie, 'Content-Type': 'application/json' },
      body: { code: 'AUD-NOT-EXIST-' + i, user_id: id2 }
    }));
  }
  assert.strictEqual(spam[10].status, 429, '11th voucher redeem 429');
  ok('25', 'القسائم: 11 محاولة في الدقيقة ⇒ 429 (NEW-3: ≤10/د)');

  // 26) دردشة العامة مزالة
  const chatRemoved = await req('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { message: 'x' } });
  assert.strictEqual(chatRemoved.status, 410);
  assert(chatRemoved.json && chatRemoved.json.error === 'removed');
  ok('26', '/api/chat ⇒ 410 Gone (الخصوصية)');

  // 27) بلا تلميحات حساسة في أخطاء الدفع
  const probeVoucher = await req('/api/vouchers/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { amount: 50 } });
  assert.strictEqual(probeVoucher.status, 403);
  assert(!probeVoucher.json.hint, 'no hint leak');
  const probeBinance = await req('/api/payments/binance-probe');
  assert.strictEqual(probeBinance.status, 403);
  assert(!probeBinance.json.hint, 'no hint leak');
  ok('27', 'أخطاء الدفع (403) بلا تلميحات أسرار (DTSG-014/NEW-6)');

  // 28) رؤوس أمان
  const rootRes = await req('/');
  assert.strictEqual(rootRes.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(rootRes.headers['x-frame-options'], 'DENY');
  assert.strictEqual(rootRes.headers['cross-origin-resource-policy'], 'cross-origin');
  assert(rootRes.headers['strict-transport-security'].includes('preload'));
  ok('28', 'HSTS preload + XFO DENY + CORP + nosniff (DTSG-017/020)');

  console.log('\n═══ sec-audit 28/28 خضر ═══\n');
}

run().catch(err => { console.error('❌ Test failed:', err); process.exit(1); });
