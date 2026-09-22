/**
 * tests/_audit_remediation_test.js
 * Comprehensive regression tests verifying remediations for DTSG Audit Findings:
 * DTSG-001, DTSG-002, DTSG-003, DTSG-005, DTSG-006, DTSG-007, DTSG-010, DTSG-014, DTSG-019
 */
const http = require('http');
const assert = require('assert');

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

async function run() {
  console.log('═══ Starting DTSG Audit Remediation Test Suite ═══\n');

  // 1. DTSG-005 & DTSG-011: CORS & Cross-Origin CSRF Protection
  console.log('── 1) Testing DTSG-005 & DTSG-011: Strict CORS & CSRF Defense ──');
  // Untrusted origin preflight
  const preflightBad = await req('/api/sync', {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://evil-attacker.com',
      'Access-Control-Request-Method': 'POST'
    }
  });
  assert.strictEqual(preflightBad.status, 403, 'Preflight from evil origin must be rejected with 403');
  console.log('  ✅ OPTIONS from evil origin -> 403 Forbidden');

  // Untrusted origin POST (Cross-site request forgery attempt)
  const postBad = await req('/api/sync', {
    method: 'POST',
    headers: {
      'Origin': 'https://evil-attacker.com',
      'Content-Type': 'application/json'
    },
    body: { gold: 999999 }
  });
  assert.strictEqual(postBad.status, 403, 'Cross-origin POST from untrusted origin must return 403');
  assert(!postBad.headers['access-control-allow-origin'], 'Must NOT reflect untrusted origin in CORS headers');
  console.log('  ✅ Cross-site POST from untrusted origin blocked with 403 forbidden_origin');

  // Trusted origin preflight
  const preflightGood = await req('/api/sync', {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://dtsg.pages.dev',
      'Access-Control-Request-Method': 'POST'
    }
  });
  assert.strictEqual(preflightGood.status, 204, 'Preflight from trusted origin must return 204');
  assert.strictEqual(preflightGood.headers['access-control-allow-origin'], 'https://dtsg.pages.dev');
  assert.strictEqual(preflightGood.headers['access-control-allow-credentials'], 'true');
  console.log('  ✅ OPTIONS from trusted origin -> 204 with credentials allowed');


  // 2. DTSG-006 & DTSG-007: Login Enumeration and Brute-Force Rate Limiting
  console.log('\n── 2) Testing DTSG-006 & DTSG-007: Login Enumeration & Rate Limiting ──');
  // Non-existent user
  const badUser = await req('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { username: 'non_existent_user_9999', password: 'wrongpassword' }
  });
  assert.strictEqual(badUser.status, 401, 'Nonexistent user must return 401 (not 404)');
  assert.strictEqual(badUser.json.message, 'بيانات الدخول غير صحيحة — اسم المستخدم أو كلمة المرور خاطئة');
  console.log('  ✅ Nonexistent user returns unified 401 message (no user enumeration)');

  // Wrong password on existing user
  const wrongPass = await req('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { username: 'admin', password: 'wrongpassword' }
  });
  assert.strictEqual(wrongPass.status, 401, 'Wrong password must return 401');
  assert.strictEqual(wrongPass.json.message, 'بيانات الدخول غير صحيحة — اسم المستخدم أو كلمة المرور خاطئة');
  console.log('  ✅ Existing user with wrong password returns identical 401 message');

  // Trigger rate limit
  let rateLimited = false;
  for (let i = 0; i < 11; i++) {
    const res = await req('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.25' },
      body: { username: 'rate_test_user', password: 'any' }
    });
    if (res.status === 429) {
      rateLimited = true;
      assert(res.json.retry_after > 0, 'Retry-after must be present');
      break;
    }
  }
  assert(rateLimited, 'After 10 failed login attempts, must return 429 Too Many Requests');
  console.log('  ✅ 10+ failed login attempts from IP triggers 429 rate limit');


  // 3. User Login & Session Setup
  console.log('\n── 3) Setting up test session for Authenticated Tests ──');
  const loginRes = await req('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { username: 'player', password: 'RoyalCoin@User1' }
  });
  assert.strictEqual(loginRes.status, 200, 'User login must succeed');
  const cookieHeader = loginRes.headers['set-cookie'];
  assert(cookieHeader, 'Session cookie must be returned');
  const sidCookie = (Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader).split(';')[0];
  const initialGold = loginRes.json.user.gold;
  console.log('  ✅ Logged in as player (gold=' + initialGold + ') with session cookie:', sidCookie);


  // 4. DTSG-001: Balance Forgery Protection in /api/sync
  console.log('\n── 4) Testing DTSG-001: Server-Authoritative Balance in /api/sync ──');
  const syncForged = await req('/api/sync', {
    method: 'POST',
    headers: {
      'Cookie': sidCookie,
      'Content-Type': 'application/json'
    },
    body: {
      gold: 9999999, // Attempted forgery
      gold_rev: 0
    }
  });
  assert.strictEqual(syncForged.status, 200);
  assert.strictEqual(syncForged.json.gold, initialGold, 'Server must ignore client-supplied gold override');
  console.log('  ✅ POST /api/sync with forged gold (9,999,999) was IGNORED; server balance remained', initialGold);

  // Unauthenticated /api/sync
  const syncUnauth = await req('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { gold: 123456 }
  });
  assert.strictEqual(syncUnauth.status, 401, 'Unauthenticated /api/sync must return 401');
  console.log('  ✅ Unauthenticated /api/sync correctly returns 401');


  // 5. DTSG-002 & DTSG-003: Withdrawal & Wallet IDOR Protection
  console.log('\n── 5) Testing DTSG-002 & DTSG-003: Withdrawal & Wallet Access Control ──');
  // Unauthenticated withdrawal request
  const wdUnauth = await req('/api/withdrawals/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { user_id: '1', amount_usd: 10, method: 'cih', details: 'CIH123456' }
  });
  assert.strictEqual(wdUnauth.status, 401, 'Unauthenticated withdrawal request must be rejected with 401');
  console.log('  ✅ Unauthenticated POST /api/withdrawals/request rejected with 401');

  // Unauthenticated wallet balance inquiry
  const balUnauth = await req('/api/wallet/balance?user_id=1', {
    method: 'GET'
  });
  assert.strictEqual(balUnauth.status, 401, 'Unauthenticated wallet balance inquiry must be rejected with 401');
  console.log('  ✅ Unauthenticated GET /api/wallet/balance rejected with 401');

  // Authenticated withdrawal request with forged user_id (IDOR attempt)
  const wdIdor = await req('/api/withdrawals/request', {
    method: 'POST',
    headers: {
      'Cookie': sidCookie,
      'Content-Type': 'application/json'
    },
    body: { user_id: '99999', amount_usd: 100000, method: 'cih', details: 'CIH123456' }
  });
  // The server-payments handler should have overridden user_id to the session user's ID
  // and processed against the session user's real balance (1000 gold / $10, not enough for $100000)
  assert(wdIdor.status === 402 || (wdIdor.json && !wdIdor.json.ok), 'IDOR attempt cannot withdraw from target account');
  console.log('  ✅ Authenticated withdrawal request with forged user_id is forced to session user ID');

  // Authenticated wallet balance inquiry
  const balAuth = await req('/api/wallet/balance?user_id=99999', {
    method: 'GET',
    headers: { 'Cookie': sidCookie }
  });
  assert.strictEqual(balAuth.status, 200);
  assert.strictEqual(balAuth.json.coins, initialGold, 'Balance query was overridden to session user coins');
  console.log('  ✅ Authenticated GET /api/wallet/balance enforces session user balance, preventing enumeration');


  // 6. Privacy: العامة أزيلت — دردشة الغرف فقط، والبوت الخاص خارج هذا المسار
  console.log('\n── 6) Testing public chat removal & privacy boundary ──');
  const chatRemoved = await req('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { message: 'This must never enter the public channel' }
  });
  assert.strictEqual(chatRemoved.status, 410, 'Public chat endpoint must remain permanently removed');
  assert(chatRemoved.json && chatRemoved.json.error === 'removed', 'Removed chat returns an explicit privacy response');
  console.log('  ✅ /api/chat returns 410 Gone; room chat and private Telegram chat are separate');


  // 7. DTSG-014: Secret Hints Leakage
  console.log('\n── 7) Testing DTSG-014: Internal Secret Hints Stripped ──');
  const probeVoucher = await req('/api/vouchers/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { amount: 50 }
  });
  assert.strictEqual(probeVoucher.status, 403);
  assert(!probeVoucher.json.hint, 'Error response must NOT contain hint about admin secrets or telegram IDs');
  console.log('  ✅ /api/vouchers/create error response contains no sensitive hint');

  const probeBinance = await req('/api/payments/binance-probe', {
    method: 'GET'
  });
  assert.strictEqual(probeBinance.status, 403);
  assert(!probeBinance.json.hint, 'Error response must NOT contain hint');
  console.log('  ✅ /api/payments/binance-probe error response contains no sensitive hint');


  // 8. DTSG-017 & DTSG-020: Security Headers
  console.log('\n── 8) Testing DTSG-017 & DTSG-020: Security Headers (HSTS Preload, CORP) ──');
  const rootRes = await req('/');
  assert.strictEqual(rootRes.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(rootRes.headers['x-frame-options'], 'DENY');
  assert.strictEqual(rootRes.headers['cross-origin-resource-policy'], 'cross-origin');
  assert(rootRes.headers['strict-transport-security'].includes('preload'), 'HSTS header must include preload');
  console.log('  ✅ HSTS preload, X-Frame-Options: DENY, CORP: cross-origin present');

  // 9. DTSG-019: Broken /api/lb
  console.log('\n── 9) Testing DTSG-019: /api/lb Leaderboard Endpoint ──');
  const lbRes = await req('/api/lb', { method: 'GET' });
  assert.strictEqual(lbRes.status, 200, '/api/lb must return 200');
  assert(Array.isArray(lbRes.json.leaderboard), 'leaderboard array must be present');
  console.log('  ✅ GET /api/lb returns 200 OK with leaderboard array (count:', lbRes.json.leaderboard.length, ')');

  console.log('\n═══ ALL 9 TEST SUITES PASSED CLEANLY (100%) ═══\n');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
