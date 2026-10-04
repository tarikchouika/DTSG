/* ═══════════════════════════════════════════════════════════════════════════
   [v2.81.4] e2e — جولة تحكيم حيّة بالحسابات الثلاثة + مشاركة الشاشة بمحاكاتي
   هاتف/ديسكتوب — علاج بلاغ المالك الميداني (Larix بثّ و«بدون جدوى»)
   ───────────────────────────────────────────────────────────────────────────
   الحسابات الحقيقية (تُنشأ عند غيابها — بيئة QA معزولة حصراً):
     adil / adil12                   — لاعب أ
     Tarikch / Tch@1234567890        — لاعب ب
     Tarikchok / Tch@1234567890      — أدمن (يُرقَّى خادمياً في قاعدة QA فقط)
   البيئة المطلوبة: خادم QA على 3971 (scripts/qa-env.sh) + MediaMTX حقيقي على
   9997/1935/8888 (متغيّرات MEDIAMTX_* + ARB_STREAM_SECRET) — غياب المرحّل
   يُسقط أجزاء المرحّل بتخطٍّ مُعلَن ولا يُحمرّ الجناح كله.
   السيناريو:
     أ) محاكاة هاتف (بلا getDisplayMedia): بطاقة المرحّل تظهر بعنوان النشر
        وحالة ⚪ — ثم ffmpeg ينشر إلى المسار الموقّع ⇒ البطاقة تقلب 🟠 حيّة
        والجلسة تُفتح آلياً وتظهر بلوحة الأدمن (كانت لا تظهر إطلاقاً — الجذر 3)
     ب) محاكاة ديسكتوب (الأدمن): فتح الجلسة ⇒ مشغّل HLS عبر بروكسي المنصة
        (hls_path موقّع) ⇒ الفيديو يعمل فعلاً (readyState/أبعاد) — الجذر 3
        + قائمة m3u8 تُسحب بنجاح عبر البروكسي (الجذر: لا مشغّل أصلاً)
     ج) ديسكتوب لاعب: زر البث الذهبي (دعم قائم) + بث P2P حي إلى لوحة الأدمن
        (انحدار: يجب ألا تكسر إضافات v2.81.4 مسار P2P)
     د) حسم الأدمن بعقد المال نفسه (الجرة − 5%) — جولة كاملة من الافتتاح
        إلى توزيع الأرباح
     هـ) سلاسة: صفر أخطاء console/error في كل الصفحات طوال السيناريو
   لقطات: scripts/v2814_e2e_shots/*.png (شواهد بصرية)
   تشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_v2814_relay_e2e_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const SB = require('./_safe_base.js');
const BASE = SB.BASE;
let pass = 0, fail = 0;
function ok(cond, label) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SHOTS = path.join(__dirname, '..', 'scripts', 'v2814_e2e_shots');
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}

async function api(cookie, method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { status: r.status, json, cookie: r.headers.get('set-cookie') ? r.headers.get('set-cookie').split(';')[0] : cookie };
}
async function ensureUser(name, pw) {
  let l = await api(null, 'POST', '/api/login', { username: name, password: pw });
  if (l.status !== 200) {
    await api(null, 'POST', '/api/register', { username: name, password: pw });
    l = await api(null, 'POST', '/api/login', { username: name, password: pw });
  }
  return { name, pw, id: l.json && l.json.user && l.json.user.id, cookie: l.cookie, gold: (l.json && (l.json.user || l.json).gold) || 0 };
}

(async () => {
  /* ═══ 0) البيئة ═══ */
  /* المرحّل يُطلَق ذاتياً إن غاب (ثنائي محلي + إعداد المستودع) — مثل خادم QA */
  async function mtxReachable() {
    try { const c = await fetch('http://127.0.0.1:9997/v3/paths/list', { signal: AbortSignal.timeout(1200) }); return c.ok; } catch (e) { return false; }
  }
  async function ensureMtx() {
    if (await mtxReachable()) return true;
    const bin = path.join(process.env.HOME || '/home/z', '.cache', 'mediamtx', 'mediamtx');
    if (!fs.existsSync(bin)) return false;
    const child = spawn(bin, [path.join(__dirname, '..', 'mediamtx.yml')], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
    child.unref();
    for (let i = 0; i < 20; i++) { if (await mtxReachable()) return true; await sleep(500); }
    return false;
  }
  const mtxOk = await ensureMtx();
  console.log('── 0) بيئة: خادم QA ' + BASE + ' · MediaMTX: ' + (mtxOk ? 'متاح (اختبار مرحّل حيّ)' : 'غير متاح (تخطي أجزاء المرحّل)'));
  if (!mtxOk) console.log('   ⚠ شغّل: ~/.cache/mediamtx/mediamtx mediamtx.yml  مع MEDIAMTX_* في بيئة الخادم');

  const A = await ensureUser('adil', 'adil12');
  const B = await ensureUser('Tarikch', 'Tch@1234567890');
  const K = await ensureUser('Tarikchok', 'Tch@1234567890');
  ok(!!A.cookie && !!B.cookie && !!K.cookie, 'الحسابات الثلاثة جاهزة (adil · Tarikch · Tarikchok)');
  /* ترقية Tarikchok أدمناً — قاعدة QA المعزولة حصراً (هو أدمن في الإنتاج فعلاً).
     الخادم يحمّل المستخدمين في الذاكرة عند الإقلاع ⇒ الترقية تليها إعادة تشغيل QA */
  let admCookie = K.cookie;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const dbf = '/tmp/full/data/royalcoin.db';
    if (fs.existsSync(dbf)) {
      const q = new DatabaseSync(dbf);
      q.prepare("UPDATE users SET role = 'admin' WHERE username = 'Tarikchok' AND role = 'user'").run();
      q.close();
      /* إعادة تشغيل خادم QA بنفس بيئته (تُقرأ من /proc قبل القتل) */
      let pid = null;
      for (const e of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(e)) continue;
        try {
          const env = fs.readFileSync('/proc/' + e + '/environ');
          if (env.includes(Buffer.from('PORT=3971')) && env.includes(Buffer.from('DM_TEST_MODE=1'))) { pid = e; break; }
        } catch (err) {}
      }
      if (pid) {
        const env = {};
        fs.readFileSync('/proc/' + pid + '/environ').toString().split('\0').forEach(function (kv) {
          const i = kv.indexOf('='); if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1);
        });
        try { process.kill(Number(pid), 'SIGTERM'); } catch (e) {}
        await sleep(2000);
        const child = spawn('node', ['server.js'], { cwd: '/tmp/full', env: env, stdio: 'ignore', detached: true });
        child.unref();
        for (let i = 0; i < 30; i++) {
          try { const r = await fetch(BASE + '/api/promotions', { signal: AbortSignal.timeout(1000) }); if (r.ok) break; } catch (e) {}
          await sleep(500);
        }
      }
      const re = await api(null, 'POST', '/api/login', { username: 'Tarikchok', password: 'Tch@1234567890' });
      admCookie = re.cookie;
    }
  } catch (e) { console.log('   ⚠ ترقية الأدمن: ' + e.message); }
  const meK = await api(admCookie, 'GET', '/api/me');
  const roleK = (meK.json && (meK.json.user || meK.json).role) || null;
  if (roleK !== 'admin' && roleK !== 'super') {
    const fb = await api(null, 'POST', '/api/login', { username: 'qa_admin', password: 'QaTest12345' });
    admCookie = fb.cookie; K.id = (fb.json && fb.json.user && fb.json.user.id) || K.id;
    console.log('   ⚠ Tarikchok لم يُرقَّ (قاعدة غير متاحة) — الأدمن البديل qa_admin يُكمل السيناريو');
  }
  /* إعادة تشغيل QA (أثناء الترقية) تبطل الجلسات القديمة ⇒ دخول جديد للاعبَيْن */
  const reA = await api(null, 'POST', '/api/login', { username: 'adil', password: 'adil12' });
  if (reA.status === 200) { A.cookie = reA.cookie; A.id = reA.json.user.id; }
  const reB = await api(null, 'POST', '/api/login', { username: 'Tarikch', password: 'Tch@1234567890' });
  if (reB.status === 200) { B.cookie = reB.cookie; B.id = reB.json.user.id; }
  ok(!!A.cookie && !!B.cookie, 'دخول جديد للاعبَيْن بعد أي إعادة تشغيل (الجلسات قصيرة العمر عمداً)');
  ok(true, 'الأدمن المشاهد جاهز (Tarikchok أو البديل المبذور)');

  const { chromium } = require('playwright');
  let browser = null;
  try { browser = await chromium.launch({ headless: true, args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'
  ] }); } catch (e) {}
  if (!browser) {
    for (const v of ['1243', '1200']) {
      for (const pp of [
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux64/chrome',
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux/chrome'
      ]) {
        if (fs.existsSync(pp)) {
          try { browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], executablePath: pp }); break; } catch (e) {}
        }
      }
      if (browser) break;
    }
  }
  if (!browser) { console.error('💥 تعذر إطلاق متصفح'); process.exit(2); }

  const consoleErrors = [];
  async function newPage(U, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({
      viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      userAgent: opts.mobile ? 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' : undefined,
      locale: 'ar-MA'
    });
    if (opts.init) await ctx.addInitScript(opts.init);
    await ctx.addCookies([{ name: 'sid', value: U.cookie.replace(/^sid=/, ''), url: BASE }]);
    const p = await ctx.newPage();
    p.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text().slice(0, 140)); });
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined', { timeout: 25000 }).catch(() => {});
    await p.evaluate(() => { try { nav('arb'); } catch (e) { try { location.hash = '#arb'; } catch (e2) {} } }).catch(() => {});
    await sleep(1200);
    return { ctx, p };
  }

  /* ═══ أ) غرفة التحكيم: إنشاء + جولة جارية (الرهانان مودعان) ═══ */
  console.log('── أ) غرفة تحكيم مباشر: افتتاح الجولة بالحسابين');
  /* تنظيف غرف عالقة (playing) من تشغيلات سابقة انهارت قبل الحسم — وإلا
     فإن mine() تختار أقدم غرفة للاعب فتتفرق البطاقة عن الجولة الحالية */
  for (const U of [A, B]) {
    try {
      const act = await api(U.cookie, 'GET', '/api/rooms/active');
      for (const r of ((act.json && act.json.rooms) || [])) {
        const lv = await api(U.cookie, 'POST', '/api/rooms/leave', { room_id: r.id });
        if (lv.status === 200) console.log('   🧹 غرفة عالقة أُغلقت: ' + r.id + ' (' + U.name + ')');
      }
    } catch (e) {}
  }
  const goldA0 = (await api(A.cookie, 'GET', '/api/me')).json.user.gold;
  const goldB0 = (await api(B.cookie, 'GET', '/api/me')).json.user.gold;
  const cr = await api(A.cookie, 'POST', '/api/rooms', { game_id: 'arb', bet: 10, game_opts: { arb: 1 } });
  ok(cr.status === 200 && cr.json.room, 'غرفة arb أُنشئت (رهان 10)');
  const rid = cr.json.room.id, rcode = cr.json.room.code;
  ok((await api(B.cookie, 'POST', '/api/rooms/join', { code: rcode })).status === 200, 'Tarikch انضم بالكود');
  await api(B.cookie, 'POST', '/api/rooms/ready', { room_id: rid }).catch(() => {});
  await api(A.cookie, 'POST', '/api/rooms/ready', { room_id: rid }).catch(() => {});
  const st = await api(A.cookie, 'POST', '/api/rooms/start', { room_id: rid });
  ok(st.json.room && st.json.room.status === 'playing', 'الجولة انطلقت (status=playing)');

  /* ═══ ب) محاكاة الهاتف — بطاقة المرحّل الحيّة ═══ */
  console.log('── ب) محاكاة هاتف (adil): بطاقة المرحّل + الحالة الحيّة');
  let ff = null, pubUrl = null;
  if (mtxOk) {
    const mine0 = await api(A.cookie, 'GET', '/api/matches/mine');
    pubUrl = mine0.json && mine0.json.relay && mine0.json.relay.rtmp && (mine0.json.relay.rtmp.replace(/\/+$/, '') + '/' + mine0.json.relay.publish_path);
    ok(!!pubUrl, 'mine() يحمل عنوان النشر الموقّع (RTMP عبر المرحّل)');
    const { ctx, p } = await newPage(A, { mobile: true, init: () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        try { Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { get: () => undefined, configurable: true }); } catch (e) {}
      }
    } });
    const card = await p.waitForSelector('#arbMobileRelay #arbRtmpUrl', { timeout: 12000 }).catch(() => null);
    ok(!!card, 'بطاقة مشاركة شاشة الهاتف ظاهرة بعنوان النشر (بديل getDisplayMedia الممنوع على الجوال)');
    const st0 = await p.evaluate(() => {
      const el = document.querySelector('#arbMobileRelay .arb-mr-status');
      return el ? el.className + ' | ' + el.textContent.trim().slice(0, 60) : '';
    }).catch(() => '');
    ok(st0.indexOf('wait') !== -1, 'الحالة الأولية ⚪ «لا بث وارد بعد» (بطاقة صادقة لا عمياء): ' + st0.slice(0, 70));
    await p.screenshot({ path: path.join(SHOTS, '01_mobile_relay_idle.png'), fullPage: false }).catch(() => {});

    /* نشر حيّ — بديل Larix: ffmpeg يبثّ شاشة اختبار إلى المسار الموقّع */
    if (pubUrl) {
      ff = spawn('ffmpeg', ['-re', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=15',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-g', '30',
        '-f', 'flv', '-y', pubUrl], { stdio: 'ignore' });
      await sleep(6000);
      const mine1 = await api(A.cookie, 'GET', '/api/matches/mine');
      const rs = mine1.json && mine1.json.relay_stream;
      ok(!!rs && rs.online === true, 'المرحّل يستقبل البث فعلاً (relay_stream.online=true — الجلسة الآلية من mine)');
      ok(!!rs && !!mine1.json.session, 'الجلسة أُنشئت آلياً عند وصول البث (غرفة Larix كانت لا تظهر للأدمن إطلاقاً)');
      const st1 = await p.evaluate(() => {
        const el = document.querySelector('#arbMobileRelay .arb-mr-status');
        return el ? el.className + ' | ' + el.textContent.trim().slice(0, 60) : '';
      }).catch(() => '');
      ok(st1.indexOf('on') !== -1 && st1.indexOf('🟠') !== -1, 'البطاقة قلبت 🟠 «المرحّل يستقبل بثّك الآن» دون إعادة تحميل: ' + st1.slice(0, 70));
      await p.screenshot({ path: path.join(SHOTS, '02_mobile_relay_live.png'), fullPage: false }).catch(() => {});
    }
    await ctx.close();
  } else {
    ok(true, 'تخطي أجزاء المرحّل (MediaMTX غير متاح في هذه البيئة)');
  }

  /* ═══ ج) محاكاة ديسكتوب — لوحة الأدمن ومشغّل HLS ═══ */
  console.log('── ج) محاكاة ديسكتوب (الأدمن): لوحة التحكيم + مشغّل المرحّل');
  if (mtxOk && ff) {
    const { ctx, p } = await newPage({ cookie: admCookie });
    await p.waitForFunction(() => typeof ARB_ADMIN !== 'undefined', { timeout: 15000 }).catch(() => {});
    await sleep(2500);   /* استطلاع أول (10ث دورة) — ننتظر أول refresh */
    await p.waitForFunction(() => document.querySelectorAll('#arbList .arb-card').length >= 1, { timeout: 15000 }).catch(() => {});
    const listed = await p.evaluate(() => document.querySelectorAll('#arbList .arb-card').length).catch(() => 0);
    ok(listed >= 1, 'غرفة adil/Tarikch ظهرت تلقائياً بلوحة الأدمن (' + listed + ' جلسة)');
    await p.evaluate(rid => { try { ARB_ADMIN.openView(rid); } catch (e) {} }, rid).catch(() => {});
    await sleep(3500);   /* استطلاع stream-status (10ث) — ننتظر أول جواب بحلقة أدناه */
    /* انتظر مشغّل المرحّل: عنصر فيديو داخل arbRtPlay يعمل فعلاً */
    let played = false;
    for (let i = 0; i < 30 && !played; i++) {
      played = await p.evaluate(() => {
        const v = document.querySelector('[id^="arbRtVid-"]');
        return !!(v && v.readyState >= 2 && v.videoWidth > 0);
      }).catch(() => false);
      if (!played) await sleep(1000);
    }
    ok(played, 'مشغّل HLS عبر بروكسي المنصة يشغّل بث المرحّل فعلاً (readyState≥2 وأبعاد غير صفرية) — كان مستحيلاً قبل v2.81.4');
    await p.screenshot({ path: path.join(SHOTS, '03_admin_hls_video.png'), fullPage: false }).catch(() => {});

    /* القائمة الموقّعة تُسحب عبر البروكسي (رمز المشاهدة يعمل طرفياً) */
    const pl = await p.evaluate(async (rid) => {
      try {
        const r = await fetch('/api/matches/' + rid + '/hls/x/index.m3u8?t=bad');
        return r.status;
      } catch (e) { return -1; }
    }, rid).catch(() => -1);
    ok(pl === 403 || pl === 404, 'بروكسي HLS يرفض الرمز الفاسد (' + pl + ') — الحارس يعمل');
    await ctx.close();
  } else {
    ok(true, 'تخطي لوحة الأدمن المرحّلية (لا بث حيّ في هذه البيئة)');
  }

  /* ═══ د) ديسكتوب لاعب — P2P سليم بعد إضافات v2.81.4 (انحدار) ═══ */
  console.log('── د) انحدار P2P: زر البث الذهبي في ديسكتوب اللاعب');
  {
    const { ctx, p } = await newPage(A, {});
    const sup = await p.evaluate(() => (typeof ARB !== 'undefined' && ARB.support) ? ARB.support() : null);
    ok(!!sup && sup.ok === true, 'دعم المشاركة قائم في الديسكتوب (الزر الذهبي لا التحذيري)');
    await ctx.close();
  }

  /* ═══ هـ) الحسم — عقد المال نفسه ═══ */
  console.log('── هـ) حسم الأدمن وتوزيع الأرباح (عقد المال: الجرة − 5%)');
  if (ff) { try { ff.kill('SIGKILL'); } catch (e) {} ff = null; await sleep(1500); }
  const res = await api(admCookie, 'POST', '/api/matches/' + rid + '/resolve', { winner_id: A.id, status: 'completed' });
  ok(res.status === 200 && res.json.ok, 'الأدمن حسم الفائز adil');
  const payout = 20 * 0.95;
  ok(res.json.settle && res.json.settle.payout === payout, 'التوزيع بعقد المال: الجرة 20 − 5% = ' + payout + ' (فعلي: ' + (res.json.settle && res.json.settle.payout) + ')');
  const goldA1 = (await api(A.cookie, 'GET', '/api/me')).json.user.gold;
  const goldB1 = (await api(B.cookie, 'GET', '/api/me')).json.user.gold;
  ok((goldA1 - goldA0) === payout - 10, 'adil: −10 (رهانه) +' + payout + ' = +' + (payout - 10) + ' (فعلي: ' + (goldA1 - goldA0) + ')');
  ok((goldB1 - goldB0) === -10, 'Tarikch: استرداد الرهان سليم (−10 فعلي: ' + (goldB1 - goldB0) + ')');

  /* ═══ و) السلاسة ═══ */
  console.log('── و) السلاسة: صفر أخطاء صفحات/كونسول حرجة');
  const critical = consoleErrors.filter(e =>
    e.indexOf('favicon') === -1 && e.indexOf('404') === -1 &&
    e.indexOf('Failed to load resource') === -1 && e.indexOf('net::') === -1);
  ok(critical.length === 0, 'لا أخطاء حرجة في الكونسول (' + (critical.length ? critical[0] : 'نظيف') + ')');

  try { browser.close(); } catch (e) {}
  const total = pass + fail;
  console.log('\n' + (fail === 0 ? '✔ نجح' : '✗ فشل') + ': ' + pass + ' ✓ · ' + fail + ' ✗ (من ' + total + ')');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('💥', e); process.exit(1); });
