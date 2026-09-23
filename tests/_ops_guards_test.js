#!/usr/bin/env node
/**
 * tests/_ops_guards_test.js — حارس «cat» الميكانيكي (v2.58)
 * ═════════════════════════════════════════════════════════════════════════
 * يمنع ميكانيكياً تكرار الأخطاء الموثّقة (CHANGELOG v2.48.1 «cat» + حادثة 2026-09-22):
 *   1) `cd /root/dmgames-arena && git checkout main && git pull` ⇒ يطمس الشجرة الحيّة
 *      (شجرة مستودع آخر!) — أي cd نحو المستودع القديم + أي checkout+pull يُرفض.
 *   2) `pm2 restart --update-env` من صدفة ناقصة ⇒ يمسح كل متغيرات الدفع والبوتات —
 *      مسموح حصراً داخل scripts/phone-env-restart.sh (المسار المعتمد الوحيد).
 *   3) فحص حالة بـ `curl` بلا `-L` ⇒ نتيجة «0» زائفة (redirect فارغ) — كل فحص حالة
 *      على عنوان https حرفي يلزمه -L.
 * إضافةً يثبّت (ثابتاً + حياً) أن ثغرات v2.58 مغلقة في الشيفرة المشغَّلة فعلً:
 *   CORS صارم لكل الطرق · ثغرة 2FA · باب qa-admin-secret · أنواع رهانات خام ·
 *   قسaims ≤10/د · المتصدرون بلا أرصدة · binance-verify بجلسة · أخطاء JSON (بلا 502).
 *
 * التشغيل (بنفس الـnode الذي يخدم المنصة — يلزم node:sqlite ⇒ Node ≥22):
 *   node tests/_ops_guards_test.js
 * إن لم يوجد خادم على 127.0.0.1:3000 ينشئ نسخة QA مؤقتة من المستودع ويشغّلها،
 * ثم يوقفها عند الانتهاء. فحص البواب الخلفي (L23) يشغّل نسخة ثانية بلا DM_TEST_MODE.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const QA_PORT = Number(process.env.OPS_QA_PORT || 3000);
const NOMODE_PORT = Number(process.env.OPS_NOMODE_PORT || 3973);
const BASE = 'http://127.0.0.1:' + QA_PORT;

let passed = 0, failed = 0;
const failures = [];
function check(id, ok, detail) {
  if (ok) { passed++; console.log('  ✅ [' + id + '] ' + detail); }
  else { failed++; failures.push(id + ': ' + detail); console.log('  ❌ [' + id + '] ' + detail); }
}

/* ─────────────────────────── أدوات HTTP ─────────────────────────── */
function req(port, pathname, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const r = http.request({
      host: '127.0.0.1', port: port, path: pathname,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: 8000
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let j = null; try { j = JSON.parse(d); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, raw: d, json: j });
      });
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(new Error('timeout')); });
    if (opts.body) r.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    r.end();
  });
}
async function post(port, p, body, headers) {
  return req(port, p, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || {}), body: body || {} });
}
function cookieOf(res) {
  const c = res.headers['set-cookie'];
  if (!c) return null;
  return (Array.isArray(c) ? c[0] : c).split(';')[0];
}

/* ─────────────────── TOTP (مطابق totpAt في server.js) ─────────────────── */
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
  for (const c of ['123456', '000000', '999999', '246810', '135791']) if (!valid.has(c)) return c;
  let c = '111111';
  while (valid.has(c)) c = String((parseInt(c, 10) + 7) % 1000000).padStart(6, '0');
  return c;
}

/* ─────────────────── إنشاء نسخة QA مؤقتة + تشغيل خادم ─────────────────── */
function copyRepo(dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  require('child_process').execSync(
    `tar -C ${JSON.stringify(REPO)} --exclude=.git --exclude=node_modules --exclude=data --exclude=uploads -cf - . | tar -xf - -C ${JSON.stringify(dst)}`,
    { stdio: ['ignore', 'pipe', 'inherit'] }
  );
}
function startServer(dir, port, extraEnv) {
  const env = Object.assign({
    PORT: String(port),
    ADMIN_API_SECRET: 'qa-admin-secret',
    PAYMENTS_SHARED_SECRET: 'qa-shared-secret',
    USD_GOLD_RATE: '100',
    DM_TEST_MODE: '1',
    TELEGRAM_ADMIN_CHAT_ID: '999000001',
    SUPPORT_SUPER_TG: '999000001',
    DM_SEED_SUPER_PW: 'QaTest12345'
  }, extraEnv || {});
  const log = fs.openSync(path.join(dir, 'ops-guard-boot.log'), 'a');
  const p = spawn(process.execPath, ['--experimental-sqlite', 'server.js'], {
    cwd: dir, env: Object.assign({}, process.env, env),
    stdio: ['ignore', log, log]
  });
  p.unref();
  return p;
}
async function waitHealth(port, tries) {
  for (let i = 0; i < (tries || 40); i++) {
    try {
      const r = await req(port, '/api/health');
      if (r.status === 200 && r.json && r.json.ok) return true;
    } catch (e) { /* بعد قليل */ }
    await new Promise((r2) => setTimeout(r2, 500));
  }
  return false;
}

/* ─────────────────────────── الفحص الثابت ─────────────────────────── */
function shFiles() {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === 'data' || e.name === 'uploads') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.sh')) out.push(full);
    }
  })(REPO);
  return out;
}
function logicalLines(text) {
  /* يجمع سطور الاستمرار (\\) في سطر منطقي واحد، ويعيد [ {no, text, code} ] */
  const raw = text.split('\n');
  const out = [];
  let i = 0;
  while (i < raw.length) {
    let line = raw[i];
    let startNo = i + 1;
    while (/\\$/.test(line.trim()) && i + 1 < raw.length) { i++; line = line.replace(/\\$/, '') + ' ' + raw[i]; }
    const code = line.trim() !== '' && !line.trim().startsWith('#');
    out.push({ no: startNo, text: line, code });
    i++;
  }
  return out;
}
function runStatic() {
  console.log('\n═══ الفحص الثابت (شجرة المستودع) ═══');
  const files = shFiles();
  const linesByFile = new Map(files.map((f) => [f, logicalLines(fs.readFileSync(f, 'utf8'))]));

  /* S1: لا cd نحو مستودع/شجرة قديمة (dmgames-arena / digital-moroccan-casino) — نمط طمس الشجرة الحيّة */
  let bad = [];
  for (const f of files) {
    for (const L of linesByFile.get(f)) {
      if (!L.code) continue;
      if (/\b(cd|pushd)\b[^\n|;&]*(dmgames-arena|digital-moroccan-casino)/.test(L.text)) bad.push(path.relative(REPO, f) + ':' + L.no);
    }
  }
  check('S1', bad.length === 0, 'لا cd نحو المستودع القديم (نمط cat: يطمس الشجرة الحيّة)' + (bad.length ? ' ← ' + bad.join(', ') : ''));

  /* S2: لا تسلسل git checkout main + git pull (الحادثة الموثقة v2.48.1) */
  bad = [];
  for (const f of files) {
    const ls = linesByFile.get(f);
    for (let k = 0; k < ls.length; k++) {
      const L = ls[k];
      if (!L.code) continue;
      if (/git\s+checkout\s+(main|origin\/main)/.test(L.text)) {
        const win = ls.slice(k, k + 4).map((x) => x.text).join(' ');
        if (/git\s+pull/.test(win)) bad.push(path.relative(REPO, f) + ':' + L.no);
      }
    }
  }
  check('S2', bad.length === 0, 'لا تسلسل «git checkout main + git pull» في أي سكربت' + (bad.length ? ' ← ' + bad.join(', ') : ''));

  /* S3: pm2 restart --update-env مسموح حصراً في scripts/phone-env-restart.sh */
  bad = [];
  for (const f of files) {
    if (path.basename(f) === 'phone-env-restart.sh') continue;
    for (const L of linesByFile.get(f)) {
      if (!L.code) continue;
      if (/pm2\s+restart/.test(L.text) && L.text.includes('--update-env')) bad.push(path.relative(REPO, f) + ':' + L.no);
    }
  }
  check('S3', bad.length === 0, 'لا pm2 restart --update-env خارج phone-env-restart.sh (المسار المعتمد الوحيد)' + (bad.length ? ' ← ' + bad.join(', ') : ''));

  /* S4: فحص حالة (http_code) على عنوان https حرفي ⇒ يلزمه -L/--location (إلا نتيجة 0 زائفة) */
  bad = [];
  for (const f of files) {
    for (const L of linesByFile.get(f)) {
      if (!L.code) continue;
      if (!/curl\b/.test(L.text)) continue;
      if (!/%\{http_code\}/.test(L.text)) continue;
      const m = L.text.match(/https:\/\/[^\s'"]+/);
      if (!m) continue; /* عناوين عبر متغيرات: لا فحص (حُرّاس أخرى تغطيها) */
      const hasL = /\s-L\b/.test(L.text) || /--location/.test(L.text) || /-sL\b/.test(L.text) || /-Ls\b/.test(L.text) || /-ls\b/.test(L.text);
      if (!hasL) bad.push(path.relative(REPO, f) + ':' + L.no);
    }
  }
  check('S4', bad.length === 0, 'كل curl فحص-حالة على https حرفي يحمل -L (لا «0» زائفة)' + (bad.length ? ' ← ' + bad.join(', ') : ''));

  /* S5: qa-admin-secret في server-payments.js محجوب خلف DM_TEST_MODE حصراً */
  const sp = fs.readFileSync(path.join(REPO, 'server-payments.js'), 'utf8').split('\n');
  bad = [];
  for (let i = 0; i < sp.length; i++) {
    if (!sp[i].includes('qa-admin-secret')) continue;
    const win = sp.slice(Math.max(0, i - 6), i + 6).join('\n');
    if (!/DM_TEST_MODE/.test(win)) bad.push('line ' + (i + 1));
  }
  check('S5', bad.length === 0, 'qa-admin-secret محجوب خلف DM_TEST_MODE (لا باب خلفي ثابت في الإنتاج)' + (bad.length ? ' ← ' + bad.join(', ') : ''));

  /* S6: لا CORS wildcard عريض (أي *.pages.dev / *.workers.dev) في أي خادم */
  bad = [];
  for (const rel of ['server.js', 'server-payments.js', 'cf-worker/worker.js', 'cf-worker/payments-core.js']) {
    const t = fs.readFileSync(path.join(REPO, rel), 'utf8');
    if (/endsWith\(\s*['"]\.pages\.dev['"]\s*\)/.test(t)) bad.push(rel);
    if (/endsWith\(\s*['"]\.workers\.dev['"]\s*\)/.test(t)) bad.push(rel);
  }
  check('S6', bad.length === 0, 'لا wildcard CORS عريضة (قبلت القائمة القديمة أي pages.dev/workers.dev)' + (bad.length ? ' ← ' + bad.join(', ') : ''));

  /* S7: ترويسة x-backend-addr محذوفة من الشيفرة (DTSG-008) */
  let found = '';
  (function scan(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'data', 'uploads'].includes(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { scan(full); continue; }
      if (!/\.(js|sh|json)$/.test(e.name)) continue;
      if (path.relative(REPO, full) === 'tests/_ops_guards_test.js') continue; /* الحارس نفسه يذكر الاسم */
      try {
        if (fs.readFileSync(full, 'utf8').includes('x-backend-addr')) found += (found ? ', ' : '') + path.relative(REPO, full);
      } catch (err) {}
    }
  })(REPO);
  check('S7', found === '', 'لا x-backend-addr في أي ملف (ترويسة التسريب محذوفة — DTSG-008)' + (found ? ' ← ' + found : ''));

  /* S8: حارس phone-env-restart.sh سليم (يرفض المستودع القديم + يتحقق من المفاتيح الحرجة) */
  const penv = fs.readFileSync(path.join(REPO, 'scripts', 'phone-env-restart.sh'), 'utf8');
  check('S8',
    penv.includes('dmgames-arena') && /NEEDED=/.test(penv) && penv.includes('pm2 jlist'),
    'phone-env-restart.sh يحرس: رفض الشجرة القديمة + تحقق حيّ من متغيرات العملية (pm2 jlist)');
}

/* ─────────────────────────── الفحص الحيّ ─────────────────────────── */
async function runLive() {
  console.log('\n═══ الفحص الحيّ (الخادم على 127.0.0.1:' + QA_PORT + ') ═══');
  let server = null;
  let copyDir = null;
  try {
    const up = await waitHealth(QA_PORT, 3);
    if (!up) {
      copyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtsg-ops-qa-'));
      console.log('  … لا خادم على ' + QA_PORT + ' — إنشاء نسخة QA مؤقتة وتشغيلها');
      copyRepo(copyDir);
      server = startServer(copyDir, QA_PORT);
      const ok = await waitHealth(QA_PORT, 60);
      if (!ok) throw new Error('تعذر إقلاع خادم الاختبار — راجع ' + path.join(copyDir, 'ops-guard-boot.log'));
      console.log('  … الخادم أُقلم (نسخة ' + path.basename(copyDir) + ')');
    }
  } catch (e) {
    check('L0', false, 'إقلاع خادم الاختبار: ' + e.message);
    return;
  }
  check('L1', true, 'الخادم حي على ' + QA_PORT + ' (/api/health 200)');

  /* L2-L6: CORS صارم لكل الطرق */
  const evil = await req(QA_PORT, '/api/lb', { headers: { origin: 'https://evil-attacker.com' } });
  check('L2', evil.status === 403, 'GET من أصل شرير ⇒ 403 (القراءات لم تعد تتسرّب)');
  check('L3', !evil.headers['access-control-allow-origin'], 'لا ACAO معكوس على الأصل الشرير');
  const evilPages = await req(QA_PORT, '/api/wallet/balance?user_id=1', { headers: { origin: 'https://sneaky-x.pages.dev' } });
  check('L4', evilPages.status === 403, 'GET من *.pages.dev غير الموثوق ⇒ 403 (النقطة العمياء القديمة)');
  const evilOpt = await req(QA_PORT, '/api/sync', { method: 'OPTIONS', headers: { origin: 'https://evil-attacker.com', 'access-control-request-method': 'POST' } });
  check('L5', evilOpt.status === 403, 'OPTIONS من أصل شرير ⇒ 403');
  const goodOpt = await req(QA_PORT, '/api/sync', { method: 'OPTIONS', headers: { origin: 'https://dtsg.pages.dev', 'access-control-request-method': 'POST' } });
  check('L6', goodOpt.status === 204 && goodOpt.headers['access-control-allow-origin'] === 'https://dtsg.pages.dev', 'الأصل الموثوق يعمل (204 + ACAO)');

  /* L7-L9: ثغرة 2FA (جلسة لأي userId بلا كلمة مرور) */
  const superLogin = await post(QA_PORT, '/api/login', { username: 'super', password: 'QaTest12345' });
  const superCookie = cookieOf(superLogin);
  check('L7', superLogin.status === 200 && !!superCookie, 'دخول السوبر أدمن (QA)');
  const superId = superLogin.json && superLogin.json.user ? superLogin.json.user.id : null;
  const bypass = await post(QA_PORT, '/api/2fa/login', { userId: superId });
  check('L8', bypass.status === 401, 'POST /api/2fa/login {userId:سوبر} بلا رمز ⇒ 401 (الثغرة مغلقة)');
  check('L9', !bypass.headers['set-cookie'], 'لا جلسة تُصدر عند محاولة التجاوز (بلا كوكي)');
  const bypassFake = await post(QA_PORT, '/api/2fa/login', { userId: superId, two_fa_token: 'fake-token-123', code: '123456' });
  check('L10', bypassFake.status === 401, 'رمز إكمال مزوّر ⇒ 401');

  /* L11-L16: دورة 2FA كاملة (TOTP حقيقي) + قفل 5 محاولات */
  const stamp = Date.now().toString(36);
  const uA = 'ops2fa_a_' + stamp, uB = 'ops2fa_b_' + stamp;
  const regA = await post(QA_PORT, '/api/admin/register', { username: uA, password: 'Ops2faPass1' }, { cookie: superCookie });
  const regB = await post(QA_PORT, '/api/admin/register', { username: uB, password: 'Ops2faPass1' }, { cookie: superCookie });
  check('L11', regA.status === 200 && regB.status === 200, 'إنشاء مستخدمَي اختبار (عبر جلسة الأدمن)');
  const idA = regA.json && regA.json.user ? regA.json.user.id : null;
  const idB = regB.json && regB.json.user ? regB.json.user.id : null;

  async function enable2fa(user, pass) {
    const lg = await post(QA_PORT, '/api/login', { username: user, password: pass });
    const ck = cookieOf(lg);
    const en = await post(QA_PORT, '/api/2fa/enable', {}, { cookie: ck });
    const secret = en.json && en.json.secret;
    const code = totpAt(secret, Date.now());
    const vf = await post(QA_PORT, '/api/2fa/verify', { code }, { cookie: ck });
    return { cookie: ck, secret, verified: vf.status === 200 };
  }
  const a = await enable2fa(uA, 'Ops2faPass1');
  check('L12', a.verified, 'تفعيل 2FA (TOTP) للمستخدم A');
  const loginA1 = await post(QA_PORT, '/api/login', { username: uA, password: 'Ops2faPass1' });
  check('L13', loginA1.json && loginA1.json.twofa_required === true && !!loginA1.json.two_fa_token,
    'الدخول بحساب 2FA ⇒ twofa_required + رمز إكمال مقيد بالهوية');
  const wrongA = wrongCode(a.secret);
  const badCode = await post(QA_PORT, '/api/2fa/login', { userId: idA, two_fa_token: loginA1.json.two_fa_token, code: wrongA });
  check('L14', badCode.status === 401, 'رمز TOTP خاطئ ⇒ 401');
  const loginA2 = await post(QA_PORT, '/api/login', { username: uA, password: 'Ops2faPass1' });
  const goodCode = totpAt(a.secret, Date.now());
  const okCode = await post(QA_PORT, '/api/2fa/login', { userId: idA, two_fa_token: loginA2.json.two_fa_token, code: goodCode });
  check('L15', okCode.status === 200 && !!cookieOf(okCode), 'رمز TOTP صحيح ⇒ جلسة كاملة (200 + كوكي)');
  const b = await enable2fa(uB, 'Ops2faPass1');
  let lockedSeen = false;
  for (let i = 0; i < 5; i++) {
    const lg = await post(QA_PORT, '/api/login', { username: uB, password: 'Ops2faPass1' });
    const r = await post(QA_PORT, '/api/2fa/login', { userId: idB, two_fa_token: (lg.json || {}).two_fa_token, code: wrongCode(b.secret) });
    if (i === 4 && r.status === 429) lockedSeen = true;
  }
  const lgLock = await post(QA_PORT, '/api/login', { username: uB, password: 'Ops2faPass1' });
  const locked = await post(QA_PORT, '/api/2fa/login', { userId: idB, two_fa_token: (lgLock.json || {}).two_fa_token, code: wrongCode(b.secret) });
  check('L16', lockedSeen && locked.status === 429, 'قفل 2FA: 5 رموز خاطئة ⇒ 429 + قفل 15 دقيقة');

  /* L17-L22: أنواع رهانات خام — على كينو (دورة حتمية: رهان 90ث + سحب 5ث)
     [ثبات] كل استدعاء رهان يتحقق من فتح النافذة أولاً، والرفض يتأكد سببه
     (رسالة المبلغ لا رسالة «انتهى الوقت») حتى لا يظلم اختبارُ النافذة قاعدةَ المبلغ. */
  const pl = await post(QA_PORT, '/api/login', { username: 'player', password: 'RoyalCoin@User1' });
  const plCookie = cookieOf(pl);
  check('L17', pl.status === 200 && !!plCookie, 'دخول اللاعب (نافذة الرهان)');
  async function kenoWindowOpen() {
    for (let i = 0; i < 100; i++) {
      const r = await req(QA_PORT, '/api/games/ke/round', { headers: { cookie: plCookie } });
      if (r.json && r.json.round && r.json.round.status === 'betting') return true;
      await new Promise((r2) => setTimeout(r2, 1000));
    }
    return false;
  }
  const AMT_ERR = 'مبلغ غير صالح — عدد صحيح 1 على الأقل';
  check('L18', await kenoWindowOpen(), 'نافذة رهان كينو مفتوحة');
  const r05 = await post(QA_PORT, '/api/games/ke/bet', { amount: 0.5, picks: [5] }, { cookie: plCookie });
  check('L19', r05.status === 400 && r05.json && r05.json.message === AMT_ERR, 'رهان 0.5 (كسر) ⇒ 400 مرفوض (سبب المبلغ)');
  const rStr = await post(QA_PORT, '/api/games/ke/bet', { amount: '10', picks: [5] }, { cookie: plCookie });
  check('L20', rStr.status === 400 && rStr.json && rStr.json.message === AMT_ERR, 'رهان "10" (نص) ⇒ 400 مرفوض (التحقق على النوع الخام)');
  const r105 = await post(QA_PORT, '/api/games/ke/bet', { amount: 10.5, picks: [5] }, { cookie: plCookie });
  check('L21', r105.status === 400 && r105.json && r105.json.message === AMT_ERR, 'رهان 10.5 (كسر) ⇒ 400 مرفوض (سبب المبلغ)');
  /* [ثبات] كل محاولة برقم مختلف (الحارس: رقم مرهون مرة واحدة للجولة) — أرقام مخصصة
     لهذا الحارس (5/7/9/11) لا تتقاطع مع بطارية sec-audit (4/13/15/17). */
  let rOk = null;
  for (const pick of [5, 7, 9, 11]) {
    if (!(await kenoWindowOpen())) break;
    rOk = await post(QA_PORT, '/api/games/ke/bet', { amount: 1, picks: [pick] }, { cookie: plCookie });
    if (rOk.status === 200) break;
    if (rOk.status === 400 && rOk.json && /انتهى وقت الرهان/.test(rOk.json.message || '')) continue; /* الحد — نافذة تالية */
  }
  check('L22', !!(rOk && rOk.status === 200 && rOk.json && rOk.json.ok === true), 'رهان 1 (عدد صحيح) ⇒ 200 مقبول');

  /* L23-L24: binance-verify بجلسة + أخطاء JSON (بلا 502) */
  const bvNo = await post(QA_PORT, '/api/payments/binance-verify', { amount_usd: 10 });
  check('L23', bvNo.status === 401, 'binance-verify بلا جلسة ⇒ 401 (لم يعد متاحاً للغرباء)');
  const bvYes = await post(QA_PORT, '/api/payments/binance-verify', { user_id: pl.json.user.id, amount_usd: 10 }, { cookie: plCookie });
  check('L24', bvYes.status !== 502 && bvYes.json && bvYes.json.ok === false,
    'binance-verify بجلسة ⇒ JSON صريح (status=' + bvYes.status + ' error=' + (bvYes.json && bvYes.json.error) + ') — لا 502');

  /* L25: قسائم ≤10/د */
  const voucherSpam = [];
  for (let i = 0; i < 11; i++) {
    voucherSpam.push(await post(QA_PORT, '/api/vouchers/redeem', { code: 'OPS-NOT-EXIST-' + i, user_id: idA }, { cookie: cookieOf(okCode) }));
  }
  check('L25', voucherSpam[10].status === 429, 'القسائم: المحاولة 11 في الدقيقة ⇒ 429 (≤10/د)');

  /* L26-L27: المتصدرون بلا أرصدة */
  const lb = await req(QA_PORT, '/api/lb');
  const entries = (lb.json && lb.json.leaderboard) || [];
  const noGold = entries.every((e) => !('gold' in e) && !('usd' in e) && !('balance' in e));
  check('L26', lb.status === 200 && entries.length > 0 && noGold, 'المتصدرون بلا أرصدة (خصوصية الأرصدة)');
  check('L27', entries.every((e) => e.rank && e.username), 'شكل المتصدرين: {rank, username}');

  /* L28: الخادم لا ينهار بعد العاصفة */
  const alive = await req(QA_PORT, '/api/health');
  check('L28', alive.status === 200, 'الخادم حي بعد عاصفة الاختراقات التجريبية');

  /* L29-L30: البواب الخلفي qa-admin-secret — نسخة بلا DM_TEST_MODE */
  console.log('  … نسخة ثانية بلا DM_TEST_MODE (منع البواب الخلفي)');
  let noMode = null, noModeDir = null;
  try {
    noModeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtsg-ops-nomode-'));
    copyRepo(noModeDir);
    noMode = startServer(noModeDir, NOMODE_PORT, { DM_TEST_MODE: '0', ADMIN_API_SECRET: 'guard-real-secret-xyz' });
    const okNm = await waitHealth(NOMODE_PORT, 60);
    if (!okNm) throw new Error('تعذر إقلاع النسخة الثانية');
    const backdoor = await req(NOMODE_PORT, '/api/wallet/balance?user_id=1', { headers: { 'x-admin-secret': 'qa-admin-secret' } });
    check('L29', backdoor.status === 401, 'qa-admin-secret بلا DM_TEST_MODE ⇒ 401 (البواب مغلقة في الإنتاج)');
    const ctrl = await req(NOMODE_PORT, '/api/wallet/balance?user_id=1', { headers: { 'x-admin-secret': 'guard-real-secret-xyz' } });
    check('L30', ctrl.status === 200, 'السر الحقيقي من env يعمل (التحكم الصحي)');
  } catch (e) {
    check('L29', false, 'نسخة بلا DM_TEST_MODE: ' + e.message);
    check('L30', false, 'نسخة بلا DM_TEST_MODE: ' + e.message);
  } finally {
    if (noMode) { try { noMode.kill('SIGKILL'); } catch (e) {} }
    if (noModeDir) { try { fs.rmSync(noModeDir, { recursive: true, force: true }); } catch (e) {} }
  }
}

async function main() {
  console.log('═══ حارس «cat» الميكانيكي — v2.58 ═══');
  runStatic();
  await runLive();
  console.log('\n═══ النتيجة: ' + passed + '/' + (passed + failed) + ' ═══');
  if (failed) {
    console.log('فشل:');
    failures.forEach((f) => console.log('  ✗ ' + f));
    process.exitCode = 1;
  } else {
    console.log('الكل خضر — أي تكرار لخطأ cat/الثغرات سيُسقط هذا الحارس فوراً.');
  }
}

main().catch((e) => { console.error('❌ خطأ غير متوقع:', e); process.exit(1); });
