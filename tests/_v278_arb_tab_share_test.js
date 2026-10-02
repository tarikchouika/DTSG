/* ═══════════════════════════════════════════════════════════════════════════
   [v2.78] جناح تبويب التحكيم وتشخيص مشاركة الشاشة — متصفح حقيقي + خادم QA:
     أ) «غرفة تحكيم مباشر» تبويب خاص أول قائمة الألعاب في إعدادات الغرفة:
        اختياره يخفي مفتاح الخانة القديم ويعرض بطاقة الشرح، والحفظ ينشئ
        غرفة بمعرّف arb ومقعدين اثنين (وجهًا لوجه).
     ب) المسار الكامل لغرفة التحكيم (game_id=arb): انضمام وبدء بلا صفحة
        لعبة + صندوق البث في المودال + حسم أدمن بعقد المال نفسه (الجرة − 5%).
     ج) مشاركة الشاشة — تشخيص دقيق بدل رسالة «متصفحك لا يدعم» المضللة:
        محاكاة الهاتف (بلا getDisplayMedia) ومحاكاة السياق غير الآمن، مع
        الزر التحذيري في الواجهة ورسالة السبب الصحيحة عند النقر.
   تشغيل:  QA_BASE=http://127.0.0.1:3971/ node tests/_v278_arb_tab_share_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const SB = require('./_safe_base.js');
const BASE = SB.BASE;
let pass = 0, fail = 0;
function ok(cond, label) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tag = Date.now().toString(36);

async function api(cookie, method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { status: r.status, json, cookie: r.headers.get('set-cookie') ? r.headers.get('set-cookie').split(';')[0] : cookie };
}
async function newUser(name) {
  await api(null, 'POST', '/api/register', { username: name, password: 'pw123456' });
  const l = await api(null, 'POST', '/api/login', { username: name, password: 'pw123456' });
  return { id: l.json.user.id, cookie: l.cookie, user: l.json.user };
}

async function launchBrowser(requireObj) {
  const { chromium } = require('playwright');
  const fs = require('fs');
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
  let browser = null;
  try { browser = await chromium.launch({ headless: true, args }); } catch (e) {}
  if (!browser) {
    for (const v of ['1243', '1200']) {
      for (const p of [
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux64/chrome',
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux/chrome'
      ]) {
        if (fs.existsSync(p)) {
          try { browser = await chromium.launch({ headless: true, args, executablePath: p }); } catch (e) {}
        }
      }
    }
  }
  if (!browser) { console.error('تعذر إطلاق متصفح'); process.exit(2); }
  return browser;
}

(async function main() {
  const browser = await launchBrowser();
  async function newLoggedPage(U, initScript) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
    if (initScript) await ctx.addInitScript(initScript);
    await ctx.addCookies([{ name: 'sid', value: U.cookie.replace(/^sid=/, ''), url: BASE }]);
    const p = await ctx.newPage();
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined', { timeout: 20000 }).catch(() => {});
    await sleep(1000);
    return { ctx, p };
  }

  /* ═══════════ الجزء أ: التبويب الخاص في قائمة الألعاب ═══════════ */
  console.log('═══ [أ] تبويب «غرفة تحكيم مباشر» في قائمة الألعاب ═══');
  const A = await newUser('abA_' + tag);
  {
    const { ctx, p } = await newLoggedPage(A);
    await p.evaluate(() => { try { Rooms._openSettings(false); } catch (e) {} });
    const sel = await p.waitForSelector('#rsGame', { timeout: 8000 }).catch(() => null);
    ok(!!sel, 'مودال إعدادات الغرفة يفتح وقائمة الألعاب ظاهرة');
    if (sel) {
      const opts = await p.evaluate(() => Array.from(document.querySelectorAll('#rsGame option')).map(o => o.value));
      ok(opts.indexOf('arb') !== -1, 'تبويب «غرفة تحكيم مباشر» (arb) في قائمة الألعاب');
      ok(opts[0] === 'arb', 'التبويب أول القائمة (مدخل سلس) — الأول الآن: ' + opts[0]);
      const label = await p.evaluate(() => {
        const o = document.querySelector('#rsGame option[value="arb"]');
        return o ? o.textContent : '';
      });
      ok(label.indexOf('تحكيم') !== -1 && label.indexOf('مباراة خارجية') !== -1, 'تسمية التبويب: «' + label.trim() + '»');

      /* اختيار التبويب: لا خانة قديمة إطلاقاً (أزيلت v2.79) + بطاقة الشرح */
      await p.selectOption('#rsGame', 'arb');
      await sleep(400);
      const ui = await p.evaluate(() => ({
        /* [v2.79·توجيه المالك] الخانة القديمة أُزيلت نهائياً — التبويب هو المدخل
           الوحيد (كان ازدواجاً: تبويب + خانة تُعلَّم أسفل الحاوية) */
        arbRowGone: !document.getElementById('rsArbRow') && !document.getElementById('rsArb'),
        note: !!(document.querySelector('#rsGameOpts .arb-room-note')),
        noteText: (document.querySelector('#rsGameOpts .arb-room-note') || {}).textContent || '',
        noOpts: !document.querySelector('#rsOpt_mode, #rsOpt_target, #rsOpt_timer')
      }));
      ok(ui.arbRowGone, 'خانة rsArb القديمة غير موجودة في الحاوية نهائياً (التبويب المدخل الوحيد)');
      ok(ui.note && ui.noteText.indexOf('PES') !== -1, 'بطاقة شرح المباراة الخارجية ظاهرة');
      ok(ui.noOpts, 'لا خانات إعدادات لعبة داخل تبويب التحكيم');

      /* لعبة عادية: الخانة القديمة لا تعود (أُزيلت لا تُخفى) */
      await p.selectOption('#rsGame', 'pn');
      await sleep(300);
      const back = await p.evaluate(() => !document.getElementById('rsArbRow') && !document.getElementById('rsArb'));
      ok(back, 'اختيار لعبة عادية لا يعيد خانة rsArb (الإزالة نهائية — لا ازدواج)');

      /* الحفظ من التبويب: غرفة بمعرّف arb ومقعدان */
      await p.selectOption('#rsGame', 'arb');
      await sleep(300);
      await p.evaluate(() => {
        const bet = document.getElementById('rsBet');
        if (bet) bet.value = '25';
        try { Rooms._saveSettings(); } catch (e) {}
      });
      let arbRoom = null;
      for (let i = 0; i < 20; i++) {
        const r = await api(A.cookie, 'GET', '/api/rooms/active');
        if (r.json && r.json.room) { arbRoom = r.json.room; break; }
        await sleep(500);
      }
      ok(!!arbRoom && arbRoom.game_id === 'arb', 'الحفظ أنشأ غرفة بمعرّف arb (game_id=' + (arbRoom && arbRoom.game_id) + ')');
      ok(!!arbRoom && arbRoom.max_players === 2, 'الغرفة ثنائية المقاعد وجهًا لوجه (max=' + (arbRoom && arbRoom.max_players) + ')');
      ok(!!arbRoom && arbRoom.game_opts && arbRoom.game_opts.arb === 1, 'علم game_opts.arb مثبت (توافق كل الفحوص)');
      if (arbRoom) globalThis.__arbRoom = arbRoom;
    }
    await ctx.close();
  }

  /* ═══════════ الجزء ب: المسار الكامل لغرفة arb + عقد المال ═══════════ */
  console.log('═══ [ب] غرفة التحكيم (arb): بدء بلا لعبة + حسم أدمن بالجرة − 5% ═══');
  const arbRoom = globalThis.__arbRoom;
  {
    const B = await newUser('abB_' + tag);
    if (!arbRoom) {
      ok(false, 'غرفة arb غير منشأة — قسم ب يعتمد على قسم أ');
    } else {
      /* رصيد قبل الحسم */
      const before = { a: await api(A.cookie, 'GET', '/api/me'), b: await api(B.cookie, 'GET', '/api/me') };
      const goldA0 = (before.a.json && (before.a.json.user || before.a.json).gold) || null;
      /* انضمام + جاهزية — القائمة العامة تعرض الغرفة وهي بانتظار البدء */
      await api(B.cookie, 'POST', '/api/rooms/join', { code: arbRoom.code });
      await api(B.cookie, 'POST', '/api/rooms/ready', { room_id: arbRoom.id }).catch(() => {});
      await api(A.cookie, 'POST', '/api/rooms/ready', { room_id: arbRoom.id }).catch(() => {});
      const roomsList = await api(null, 'GET', '/api/rooms');
      const mine = roomsList.json && roomsList.json.rooms && roomsList.json.rooms.find(r => r.code === arbRoom.code);
      ok(!!mine && mine.arb === true, 'القائمة العامة تعلم غرفة arb بشارة التحكيم (وهي بانتظار البدء)');
      const st = await api(A.cookie, 'POST', '/api/rooms/start', { room_id: arbRoom.id });
      ok(st.json.room && st.json.room.status === 'playing', 'بدء جولة التحكيم (arb) — الرهانان مودعان');
      ok(st.json.room.max_players === 2 && st.json.room.players.length === 2, 'مقعدان نشطان فقط');

      /* المالك في المتصفح: المودال مركز التشغيل ولا صفحة لعبة */
      const { ctx, p } = await newLoggedPage(A);
      await sleep(2000);
      await p.evaluate(() => { try { Rooms.openModal(); } catch (e) {} });
      await sleep(600);
      const state = await p.evaluate(() => ({
        game: window._currentGameId || null,
        arbBox: !!document.querySelector('#arbBox')
      })).catch(() => null);
      ok(state && state.game === null, 'لا صفحة لعبة تُفتح لغرفة arb (المباراة خارجية)');
      ok(state && state.arbBox, 'صندوق «بث التحكيم المباشر» ظاهر داخل المودال');
      const badge = await p.evaluate(() => document.body.innerText.indexOf('غرفة تحكيم مباشر') !== -1).catch(() => false);
      ok(badge, 'شارة التحكيم ظاهرة في واجهة الغرفة');

      /* أدمن يحسم الفائز (المالك) — عقد المال: الجرة (50) − 5% */
      const adm = await api(null, 'POST', '/api/login', { username: 'qa_admin', password: 'QaTest12345' });
      const res = await api(adm.cookie, 'POST', '/api/matches/' + arbRoom.id + '/resolve', { winner_id: A.id, status: 'completed' });
      ok(res.status === 200 && res.json.ok, 'حسم الأدمن نجح لغرفة arb');
      const payout = 50 * 0.95;   /* عقد المال: الجرة × 0.95 بلا تقريب */
      ok(res.json.settle && res.json.settle.payout === payout, 'التوزيع بعقد المال نفسه: الجرة 50 − 5% = ' + payout + ' (فعلي: ' + (res.json.settle && res.json.settle.payout) + ')');
      const after = await api(A.cookie, 'GET', '/api/me');
      const goldA1 = (after.json && (after.json.user || after.json).gold) || null;
      ok(goldA0 !== null && goldA1 !== null && (goldA1 - goldA0) === payout - 25,
        'رصيد المالك: −25 (رهانه) +' + payout + ' (الفوز) = +' + (payout - 25) + ' (فعلي: ' + (goldA1 - goldA0) + ')');
      await ctx.close();
    }
  }

  /* ═══════════ الجزء ج: تشخيص مشاركة الشاشة ═══════════ */
  console.log('═══ [ج] مشاركة الشاشة: تشخيص دقيق بدل «متصفحك لا يدعم» ═══');
  {
    /* 1) السياق السليم (localhost آمن): الدعم قائم */
    {
      const { ctx, p } = await newLoggedPage(A);
      const sup = await p.evaluate(() => (typeof ARB !== 'undefined' && ARB.support) ? ARB.support() : null);
      ok(!!sup && sup.ok === true, 'ARB.support() في سياق سليم: ok=true (' + JSON.stringify(sup) + ')');
      await ctx.close();
    }

    /* 2) محاكاة الهاتف: mediaDevices بلا getDisplayMedia ⇒ reason=mobile */
    {
      const { ctx, p } = await newLoggedPage(A, () => {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          try { delete navigator.mediaDevices.getDisplayMedia; } catch (e) {}
          try { Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { get: () => undefined, configurable: true }); } catch (e) {}
        }
      });
      const sup = await p.evaluate(() => (typeof ARB !== 'undefined' && ARB.support) ? ARB.support() : null);
      ok(!!sup && sup.ok === false && sup.reason === 'mobile', 'محاكاة الهاتف: reason=mobile (كانت رسالة «لا يدعم» المضللة)');
      const toastMsg = await p.evaluate(() => {
        window.__v278toast = '';
        try { window.toast = function (m) { window.__v278toast = String(m); }; } catch (e) {}
        try { ARB.startShare(); } catch (e) {}
        return window.__v278toast;
      });
      ok(toastMsg.indexOf('الهاتف') !== -1 || toastMsg.indexOf('حاسوب') !== -1, 'النقر يعرض رسالة الهاتف الصحيحة: ' + toastMsg.slice(0, 60) + '…');
      await ctx.close();
    }

    /* 3) محاكاة السياق غير الآمن: mediaDevices محجوبة وisSecureContext=false ⇒ reason=insecure */
    {
      const { ctx, p } = await newLoggedPage(A, () => {
        try { Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }); } catch (e) {}
        try { Object.defineProperty(navigator, 'mediaDevices', { get: () => undefined, configurable: true }); } catch (e) {}
      });
      const sup = await p.evaluate(() => (typeof ARB !== 'undefined' && ARB.support) ? ARB.support() : null);
      ok(!!sup && sup.ok === false && sup.reason === 'insecure', 'محاكاة HTTP غير المشفر: reason=insecure');
      const toastMsg = await p.evaluate(() => {
        window.__v278toast = '';
        try { window.toast = function (m) { window.__v278toast = String(m); }; } catch (e) {}
        try { ARB.startShare(); } catch (e) {}
        return window.__v278toast;
      });
      ok(toastMsg.indexOf('HTTPS') !== -1, 'رسالة HTTPS الصحيحة تظهر: ' + toastMsg.slice(0, 60) + '…');
      await ctx.close();
    }

    /* 4) الزر التحذيري داخل مودال الغرفة أثناء جولة تحكيم حية بمحاكاة الهاتف */
    {
      const B2 = await newUser('acB_' + tag);
      const cr = await api(A.cookie, 'POST', '/api/rooms', { game_id: 'arb', bet: 10, game_opts: { arb: 1 } });
      const rid = cr.json.room.id, code = cr.json.room.code;
      await api(B2.cookie, 'POST', '/api/rooms/join', { code });
      await api(B2.cookie, 'POST', '/api/rooms/ready', { room_id: rid }).catch(() => {});
      await api(A.cookie, 'POST', '/api/rooms/ready', { room_id: rid }).catch(() => {});
      await api(A.cookie, 'POST', '/api/rooms/start', { room_id: rid });
      const { ctx, p } = await newLoggedPage(A, () => {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          try { Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { get: () => undefined, configurable: true }); } catch (e) {}
        }
      });
      await sleep(2500);
      const btnState = await p.evaluate(() => {
        const box = document.querySelector('#arbBox');
        if (!box) return { box: false };
        const btn = box.querySelector('button');
        return { box: true, warn: !!(btn && btn.textContent.indexOf('⚠') !== -1), gold: !!(btn && btn.classList.contains('gold')), note: box.textContent.indexOf('حاسوب') !== -1 || box.textContent.indexOf('الهاتف') !== -1 };
      }).catch(() => null);
      ok(btnState && btnState.box, 'صندوق البث ظاهر في غرفة arb الحية');
      ok(btnState && btnState.warn && !btnState.gold, 'الزر تحذيري (⚠️ غير متاحة هنا) بدل الذهبي المضلل');
      ok(btnState && btnState.note, 'سبب التعطل مشروح داخل الصندوق (رسالة الهاتف/الحاسوب)');
      /* تنظيف: أدمن يلغي الغرفة */
      const adm = await api(null, 'POST', '/api/login', { username: 'qa_admin', password: 'QaTest12345' });
      await api(adm.cookie, 'POST', '/api/matches/' + rid + '/cancel', {});
      await ctx.close();
    }
  }

  await browser.close();
  console.log('\n════════ النتيجة: ' + pass + ' ✓ / ' + fail + ' ✗ ════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ الاختبار:', e); process.exit(2); });
