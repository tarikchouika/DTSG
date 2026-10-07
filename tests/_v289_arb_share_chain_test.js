/* ═══════════════════════════════════════════════════════════════════════════
   [v2.89] اختبار حي — سلسلة مشاركة الشاشة من التطبيق في غرفة تحكيم خادمية
   ───────────────────────────────────────────────────────────────────────────
   بلاغ المالك 2026-10-06: «يوجد خلل في مشاركة الشاشة عبر التطبيق — سبق لنا
   معالجة هذا الخلل ولا يزال قائماً».

   الجذر المكتشف: ArbShare (v2.88) يستدعي createVirtualDisplay دون تسجيل
   MediaProjection.Callback — وهو إلزام لتطبيقات targetSdk 34+ على أندرويد 14
   (الوثيقة الرسمية: "If your app doesn't register the callback, any call to
   createVirtualDisplay() throws IllegalStateException") — Capacitor 6 يستهدف
   API 34 افتراضياً فالإسقاط يسقط عند أول شاشة افتراضية على هواتف أندرويد 14+.

   هذا الاختبار يثبّت السلسلة القابلة للاختبار آلياً (بلا هاتف):
     1) عقد المصدر: registerCallback موجود قبل createVirtualDisplay في السيرين
        المتطابقين + onStop يوقف نظيفاً (النسختان متطابقتان بايت-بايت).
     2) السلسلة الحية في المتصفح عبر جسر مزيف: لاعب في غرفة تحكيم خادمية
        (status playing) يضغط زر البث → nativeSupport يمر → GET /api/matches/mine
        يعيد relay.rtmp/publish_path → arbShareStart يُستدفع بعنوان النشر
        الموقّع نفسه → أحداث __dtsgArbEvt (connecting ثم live) تحدّث الحالة
        إلى relay عند اللاعب.
   تشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_v289_arb_share_chain_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const SB = require('./_safe_base.js');
const BASE = SB.BASE, BASE_SLASH = SB.BASE_SLASH;
const REPO = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, label, detail) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail !== undefined ? ' — ' + detail : '')); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
  return { name, id: l.json && l.json.user && l.json.user.id, cookie: l.cookie };
}
async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) { lastErr = e; }
    await page.waitForTimeout(150);
  }
  throw new Error('wait timeout: ' + (lastErr ? lastErr.message : ''));
}

(async () => {
  /* ═══ 1) عقد المصدر — الجسر الأصلي ArbShare ═══ */
  console.log('═══ v2.89 · مشاركة الشاشة — عقد المصدر (Android 14) ═══');
  const wf = fs.readFileSync(path.join(REPO, '.github/workflows/build-apk.yml'), 'utf8');
  const twin = fs.readFileSync(path.join(REPO, 'docs/workflows/build-apk.yml'), 'utf8');
  ok(wf === twin, 'النسختان متطابقتان بايت-بايت (قاعدة 18)');

  const beginIdx = wf.indexOf('void beginProjection(int resultCode, android.content.Intent data)');
  ok(beginIdx > 0, 'beginProjection موجود في ArbShare');
  const beginBody = wf.slice(beginIdx, wf.indexOf('void pump()', beginIdx));
  const cbIdx = beginBody.indexOf('projection.registerCallback(new android.media.projection.MediaProjection.Callback()');
  const vdIdx = beginBody.indexOf('display = projection.createVirtualDisplay(');
  ok(cbIdx > 0, 'registerCallback(MediaProjection.Callback) مسجَّل في beginProjection');
  ok(vdIdx > 0, 'createVirtualDisplay موجود في beginProjection');
  ok(cbIdx > 0 && vdIdx > 0 && cbIdx < vdIdx,
    'الترتيب الصحيح: Callback قبل createVirtualDisplay (إلزام Android 14)',
    'cb@' + cbIdx + ' vd@' + vdIdx);
  ok(beginBody.indexOf('public void onStop()') > 0, 'onStop يوقف الإسقاط نظيفاً عند إنهاء المستخدم');
  ok(/registerCallback[\s\S]{0,400}stop\("projection-stopped"\)/.test(beginBody), 'onStop يستدعي stop("projection-stopped")');

  /* ═══ [v2.90] الجذر الحقيقي الثاني: لا شبكة على الخيط الرئيسي ═══
     بلاغ المالك بعد build28 (v2.89): «مشاركة الشاشة عولجت مرتين ولا تزال فاشلة».
     الجذر المكتشف: الخدمة تستدعي beginProjection من onStartCommand (الخيط
     الرئيسي) و RtmpLink.connect() يفتح Socket ويصافح RTMP — أندرويد يرمي
     NetworkOnMainThreadException حتماً فيموت البث بعد منح الإذن مباشرة كل مرة
     (لم يكشفه مختبر v2.88 JVM ولا سلسلة v2.89 — جسر مزيف بلا جافا).
     العلاج: السلسلة كلها (إسقاط/ترميز/RTMP) على خيط خلفي arb-begin. */
  const bgIdx = wf.indexOf('void beginProjectionBg(int resultCode, android.content.Intent data, String url, String path, int w, int h, int dpi)');
  ok(bgIdx > 0, '[v2.90] beginProjectionBg موجود (جسم السلسلة على خيط خلفي — [v2.92] والتوقيع يستقبل الأبعاد جاهزة من خيط الواجهة)');
  const bgBody = bgIdx > 0 ? wf.slice(bgIdx, wf.indexOf('void pump()', bgIdx)) : '';
  const thIdx = beginBody.indexOf('new Thread(new Runnable()');
  ok(thIdx > 0 && beginBody.indexOf('"arb-begin"') > 0, '[v2.90] beginProjection يطلق خيط arb-begin خلفياً');
  ok(thIdx > 0 && /run\(\)[\s\S]{0,120}beginProjectionBg\(resultCode, data, url, path, w, h, dpi\)/.test(beginBody),
    '[v2.90] الخيط الخلفي يستدعي beginProjectionBg بكامل الوسائط');
  /* الشبكة (link.connect) لا تحدث إلا في جسم الخيط الخلفي — وأي وجود لها في
     مسار الخيط الرئيسي (بين beginProjection وbeginProjectionBg) هو الانحدار */
  const mainPath = wf.slice(beginIdx, bgIdx > 0 ? bgIdx : beginIdx + 4000);
  ok(bgBody.indexOf('link.connect()') > 0, '[v2.90] link.connect() (Socket/RTMP) داخل beginProjectionBg حصراً');
  ok(mainPath.indexOf('link.connect()') === -1,
    '[v2.90] لا شبكة على الخيط الرئيسي — link.connect غائب عن مسار beginProjection (درس NetworkOnMainThreadException)');
  ok(bgBody.indexOf('"init:" +') > 0 || bgBody.indexOf('"init:"+') > 0,
    '[v2.90] فشل التهيئة يصل باسم الاستثناء (init:<Class> — تشخيص ميداني)');

  /* ═══ 2) السلسلة الحية — غرفة تحكيم خادمية عبر جسر مزيف ═══ */
  console.log('═══ v2.89 · سلسلة JS الحية عبر جسر DTSGNative مزيف ═══');
  const A = await ensureUser('v289_arb_p1', 'Pw123456!');
  const B = await ensureUser('v289_arb_p2', 'Pw123456!');

  /* غرفة تحكيم خادمية جارية (لا رهان — الجرّ حر) — نمط _v2814 */
  const cr = await api(A.cookie, 'POST', '/api/rooms', { game_id: 'arb', bet: 10, game_opts: { arb: 1 } });
  ok(cr.status === 200 && cr.json && cr.json.room, 'غرفة تحكيم أُنشئت', JSON.stringify(cr.json && cr.json.room && cr.json.room.id));
  const roomId = cr.json && cr.json.room && cr.json.room.id;
  const roomCode = cr.json && cr.json.room && cr.json.room.code;
  await api(B.cookie, 'POST', '/api/rooms/join', { code: roomCode });
  await api(B.cookie, 'POST', '/api/rooms/ready', { room_id: roomId }).catch(() => {});
  await api(A.cookie, 'POST', '/api/rooms/ready', { room_id: roomId }).catch(() => {});
  const st = await api(A.cookie, 'POST', '/api/rooms/start', { room_id: roomId });
  ok(st.status === 200, 'جولة التحكيم انطلقت (status playing)', JSON.stringify(st.json && st.json.room && st.json.room.status));

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 820 } });
  await ctx.addInitScript(() => {
    window.__arbStarts = [];
    window.DTSGNative = {
      lnVersion: function () { return '2'; },
      arbShareVersion: function () { return '1'; },
      arbShareStart: function (json) {
        window.__arbStarts.push(String(json || ''));
        /* محاكاة جافا: إذن النظام أُعطي → connecting → live */
        setTimeout(function () {
          try { window.__dtsgArbEvt({ t: 'state', state: 'connecting' }); } catch (e) {}
          setTimeout(function () { try { window.__dtsgArbEvt({ t: 'state', state: 'live' }); } catch (e) {} }, 250);
        }, 60);
      },
      arbShareStop: function () { try { window.__dtsgArbEvt({ t: 'state', state: 'stopped' }); } catch (e) {} },
      getInsets: function () { return '0|0'; },
      setBarsLight: function () {},
      hostRoom: function () {}, joinRoom: function () {}, sendMsg: function () {},
      leaveRoom: function () {}, discoverStart: function () {}, discoverStop: function () {},
      hostUpdate: function () {}, btPerms: function () { return 'granted'; }, btOn: function () { return true; }
    };
  });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept(''));
  await ctx.request.post(BASE_SLASH + 'api/login', { data: { username: A.name, password: 'Pw123456!' } });
  await page.goto(BASE_SLASH, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(window.Rooms && window.ARB && window.DTSGNative && DTSGNative.arbShareStart));
  ok(await page.evaluate(() => ARB.support().ok === true && ARB.support().native === true),
    'ARB.support: الجسر الأصلي يُفضَّل على getDisplayMedia (native=true)');

  /* دخول الغرفة عند اللاعب بالكود (نفس مسار الواجهة) ثم انتظار البث الحي */
  await page.evaluate((code) => { try { Rooms.joinRoom(code); } catch (e) {} }, roomCode);
  await wait(page, (rid) => (window.Rooms.state && window.Rooms.state.id == rid && window.Rooms.state.status === 'playing') ? 1 : null, 10000, roomId);
  ok(true, 'الغرفة جارية عند اللاعب في الواجهة');

  /* الزر الذهبي داخل مودال الغرفة */
  const html = await page.evaluate(() => (typeof ARB !== 'undefined' && ARB.modalHtml && ARB.modalHtml()) || '');
  ok(html.indexOf('مشاركة الشاشة') !== -1 && html.indexOf('⚠️') === -1,
    'زر مشاركة الشاشة الذهبي ظاهر (غير محجوب) في مودال الغرفة');

  /* ابدأ البث — يجب أن يستدعي arbShareStart بعنوان النشر الموقّع */
  await page.evaluate(() => ARB.startShare());
  const startJson = await wait(page, () => (window.__arbStarts && window.__arbStarts.length) ? window.__arbStarts[0] : null, 8000).catch(() => null);
  ok(!!startJson, 'arbShareStart استُدعي من nativeStart');
  if (startJson) {
    let j = null; try { j = JSON.parse(startJson); } catch (e) {}
    ok(!!(j && typeof j.url === 'string' && j.url.indexOf('rtmp://') === 0), 'عنوان RTMP الموقّع مرَّر للجسر', j && j.url);
    ok(!!(j && typeof j.path === 'string' && j.path.length > 3), 'مسار النشر الموقّع مرَّر للجسر', j && j.path);
    /* المسار الموقّع من الخادم نفسه (publishPath) — لا يُركّب محلياً */
    const mine = await page.evaluate(async () => {
      const r = await fetch('/api/matches/mine', { credentials: 'include' }).then(x => x.json()).catch(() => null);
      return (r && r.relay) || null;
    });
    ok(!!(mine && mine.publish_path && j.path === mine.publish_path),
      'المسار هو نفسه الموقّع من mine().relay (لا انتحال)', j.path + ' vs ' + (mine && mine.publish_path));
  }

  /* الأحداث تحدّث الحالة: connecting → relay (live) */
  const stRelay = await wait(page, () => (ARB.state() === 'relay') ? 1 : null, 8000).catch(() => null);
  ok(!!stRelay, 'أحداث __dtsgArbEvt حدّثت الحالة إلى relay (live)', await page.evaluate(() => ARB.state()));

  /* الإيقاف النظيف */
  await page.evaluate(() => ARB.stopShare());
  const stIdle = await wait(page, () => (ARB.state() === 'idle') ? 1 : null, 5000).catch(() => null);
  ok(!!stIdle, 'arbShareStop أعاد الحالة إلى idle');

  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.waitForTimeout(400);
  ok(errs.length === 0, 'صفر أخطاء صفحة خلال السلسلة', errs.slice(0, 2).join(' | '));

  /* تنظيف: حلّ الغرفة */
  await api(A.cookie, 'POST', '/api/rooms/leave', { room_id: roomId }).catch(() => {});
  await api(B.cookie, 'POST', '/api/rooms/leave', { room_id: roomId }).catch(() => {});

  await browser.close();
  console.log('\n═══ الخلاصة ═══');
  console.log('PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
