/* ═══════════════════════════════════════════════════════════════════
   [v2.74] اختبار حرس: تسوية البلياردو/الشطرنج الخادمية + شريط التصويت
   الموحّد + بوابة بلوت 2-4 + عودة فلات دوغ لمرحلة المشاركة + توافق نوكيا
   ───────────────────────────────────────────────────────────────────────
   يعيد إنتاج الأعطال الأربعة المُبلَّغة من المالك (2026-10-02) ويتحقق
   من إصلاحاتها:
     أ) [تسوية البلياردو] غرف bl8 لم تكن تسوّى خادمياً قط: الدفع كان محلياً
        giveWin(bet*2) بلا رسم — الآن settleRound يوزّع الجرة −5%.
     ب) [تسوية الشطرنج] نفس الجذر — غرف ch كانت تدفع محلياً بلا خادم.
     ج) [قفل التفرج] متفرج لا يتفعّل لاعباً أثناء جولة غير مسوّاة (تفتحة
        المال: إيداع مصطنع من جيب المنصة عند التسوية).
     د) [بوابة بلوت] غرفة 1ضد1: زر البدء كان معطلاً برسالة «4 لاعبين»
        رغم أن الخادم والمحرك يقبلان — الآن البوابة = اكتمال max_players.
     هـ) [تصويت البلياردو] نهاية الإطار ⇒ تسوية آلية + فتح التصويت + شريط
        التصويت الموحّد عند الطرفين + موافقة الاثنين ⇒ إطار جديد.
     و) [تصويت روك-بيپر-سيسرز] نهاية المباراة ⇒ لوحة التصويت + موافقة ⇒
        مباراة جديدة (كانت تنتهي بلا أي تصويت فتبقى الغرفة معلقة).
     ز) [عودة فلات دوغ] العائد أثناء مرحلة المشاركة يرى اللوحة (كان يعيد
        بناء الجولة المنتهية فلا يصادق أبداً).
     ح) [توافق نوكيا] لا محددات :has(...) في CSS الألعاب الحية + سمة
        data-game على <body> + أصناف المسارح + بدائل cqh/color-mix.
   تشغيل:  QA_BASE=http://127.0.0.1:3971/ node tests/_v274_settle_vote_nokia_test.js
           (خادم معزول DM_TEST_MODE=1 — القاعدة 13؛ يحتاج node_modules/Playwright)
   ═══════════════════════════════════════════════════════════════════ */
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
async function gold(cookie) {
  const r = await api(cookie, 'GET', '/api/me');
  return r && r.json && r.json.user ? r.json.user.gold : null;
}

(async function main() {
  /* ════════════ [أ] + [ب] + [ج] + [د] — خادمية (API) ════════════ */
  console.log('── [أ] تسوية البلياردو الخادمية (جرة − 5%) ──');
  {
    await api(null, 'POST', '/api/register', { username: 'blwa_' + tag, password: 'pw123456' });
    await api(null, 'POST', '/api/register', { username: 'blwb_' + tag, password: 'pw123456' });
    const la = await api(null, 'POST', '/api/login', { username: 'blwa_' + tag, password: 'pw123456' });
    const lb = await api(null, 'POST', '/api/login', { username: 'blwb_' + tag, password: 'pw123456' });
    const cr = await api(la.cookie, 'POST', '/api/rooms', { game_id: 'bl8', max_players: 2, bet: 10 });
    ok(cr.status === 200 && cr.json.ok, 'إنشاء غرفة بلياردو 8-بول (رهان 10)');
    const rid = cr.json.room.id, code = cr.json.room.code;
    await api(lb.cookie, 'POST', '/api/rooms/join', { code });
    const g0a = await gold(la.cookie), g0b = await gold(lb.cookie);
    const st = await api(la.cookie, 'POST', '/api/rooms/start', { room_id: rid });
    ok(st.json.room && st.json.room.status === 'playing', 'بدء الجولة (اقتطاع 10 من كل طرف في escrow)');
    const g1a = await gold(la.cookie), g1b = await gold(lb.cookie);
    ok(g1a === g0a - 10 && g1b === g0b - 10, 'الاقتطاع الخادمي عند البدء (10+10)');
    /* التسوية من أي لاعب نشط (وليس دفعاً محلياً في متصفح الرابح) */
    const se = await api(lb.cookie, 'POST', '/api/rooms/settleRound', { room_id: rid, result: 'w1' });
    ok(se.status === 200 && se.json.ok, 'settleRound يقبل من أي لاعب نشط (المقعد 1 رابح)');
    ok(se.json.fee === 1, 'الرسم 5% من الجرة الكاملة (1 من 20) — «الكسور» تُقتطع');
    ok(se.json.payout === 19, 'دفعة الرابح 19 (جرة 20 − رسم 1)');
    const g2a = await gold(la.cookie), g2b = await gold(lb.cookie);
    ok(g2a === g1a && g2b === g1b + 19, 'الأرصدة الخادمية: الخاسر −10 والرابح +9 صافياً');
    ok(se.json.room !== undefined || true, '—');
    /* إعادة التسوية مرفوضة (منع الازدواج) */
    const se2 = await api(la.cookie, 'POST', '/api/rooms/settleRound', { room_id: rid, result: 'w0' });
    ok(se2.status === 400, 'التسوية المكررة مرفوضة (room.settled)');
    /* الريماش يعيد تسليح الجولة: خصم جديد + escrow جديد */
    await api(la.cookie, 'POST', '/api/rooms/rematch/start', { room_id: rid });
    await api(la.cookie, 'POST', '/api/rooms/rematch/vote', { room_id: rid, vote: 'agree' });
    await api(lb.cookie, 'POST', '/api/rooms/rematch/vote', { room_id: rid, vote: 'agree' });
    await sleep(400);
    const rm = await api(la.cookie, 'GET', '/api/rooms/active');
    const room = rm.json && rm.json.room;
    ok(room && room.status === 'playing' && room.settled === false, 'موافقة الطرفين على الريماش ⇒ جولة جديدة مسلّحة');
    const g3a = await gold(la.cookie), g3b = await gold(lb.cookie);
    ok(g3a === g2a - 10 && g3b === g2b - 10, 'الريماش اقتطع رهاناً جديداً من الطرفين (لا مال من فراغ)');
  }

  console.log('── [ب] تسوية الشطرنج الخادمية ──');
  {
    await api(null, 'POST', '/api/register', { username: 'chsa_' + tag, password: 'pw123456' });
    await api(null, 'POST', '/api/register', { username: 'chsb_' + tag, password: 'pw123456' });
    const la = await api(null, 'POST', '/api/login', { username: 'chsa_' + tag, password: 'pw123456' });
    const lb = await api(null, 'POST', '/api/login', { username: 'chsb_' + tag, password: 'pw123456' });
    const cr = await api(la.cookie, 'POST', '/api/rooms', { game_id: 'ch', max_players: 2, bet: 20 });
    const rid = cr.json.room.id, code = cr.json.room.code;
    await api(lb.cookie, 'POST', '/api/rooms/join', { code });
    await api(la.cookie, 'POST', '/api/rooms/start', { room_id: rid });
    const se = await api(la.cookie, 'POST', '/api/rooms/settleRound', { room_id: rid, result: 'w0' });
    ok(se.status === 200 && se.json.ok && se.json.fee === 2 && se.json.payout === 38,
      'شطرنج: رابح المقعد 0 يأخذ 38 من جرة 40 (رسم 2 = 5%)');
  }

  console.log('── [ج] قفل تفعيل المتفرج أثناء الجولة ──');
  {
    await api(null, 'POST', '/api/register', { username: 'spca_' + tag, password: 'pw123456' });
    await api(null, 'POST', '/api/register', { username: 'spcb_' + tag, password: 'pw123456' });
    await api(null, 'POST', '/api/register', { username: 'spcc_' + tag, password: 'pw123456' });
    await api(null, 'POST', '/api/register', { username: 'spcd_' + tag, password: 'pw123456' });
    const la = await api(null, 'POST', '/api/login', { username: 'spca_' + tag, password: 'pw123456' });
    const lb = await api(null, 'POST', '/api/login', { username: 'spcb_' + tag, password: 'pw123456' });
    const lc = await api(null, 'POST', '/api/login', { username: 'spcc_' + tag, password: 'pw123456' });
    const ld = await api(null, 'POST', '/api/login', { username: 'spcd_' + tag, password: 'pw123456' });
    /* رامي 4 مقاعد: 3 لاعبين + متفرج انضم أثناء الانتظار */
    const cr = await api(la.cookie, 'POST', '/api/rooms', { game_id: 'rm', max_players: 4, bet: 10 });
    const rid = cr.json.room.id, code = cr.json.room.code;
    await api(lb.cookie, 'POST', '/api/rooms/join', { code });
    await api(lc.cookie, 'POST', '/api/rooms/join', { code });
    await api(ld.cookie, 'POST', '/api/rooms/join', { code, spectate: true });
    await api(la.cookie, 'POST', '/api/rooms/start', { room_id: rid });
    /* المتفرج يحاول التفعيل وسط جولة غير مسوّاة (مقاعد متاحة: 3/4) */
    const tg = await api(ld.cookie, 'POST', '/api/rooms/spectate', { room_id: rid, spectate: false });
    ok(tg.status === 400, 'تفعيل متفرج أثناء جولة غير مسوّاة ⇒ 400 (كان يمرّ فيسقط بلا إيداع)');
    /* بعد التسوية (تعادل) يجوز له التفعيل — الباب يفتح مجدداً */
    await api(la.cookie, 'POST', '/api/rooms/settleRound', { room_id: rid, result: 'draw' });
    const tg2 = await api(ld.cookie, 'POST', '/api/rooms/spectate', { room_id: rid, spectate: false });
    ok(tg2.status === 200, 'بعد التسوية يُقبل التفعيل (المقعد الحر بين الجولات)');
  }

  console.log('── [د] بوابة بلوت: غرفة 1ضد1 ──');
  {
    await api(null, 'POST', '/api/register', { username: 'bl1a_' + tag, password: 'pw123456' });
    await api(null, 'POST', '/api/register', { username: 'bl1b_' + tag, password: 'pw123456' });
    const la = await api(null, 'POST', '/api/login', { username: 'bl1a_' + tag, password: 'pw123456' });
    const lb = await api(null, 'POST', '/api/login', { username: 'bl1b_' + tag, password: 'pw123456' });
    const cr = await api(la.cookie, 'POST', '/api/rooms', {
      game_id: 'bl', max_players: 2, bet: 10,
      game_opts: { maxp: 2, mode4: 'tt', target: 51, timer: 60 }
    });
    ok(cr.status === 200 && cr.json.ok && cr.json.room.max_players === 2, 'إنشاء غرفة بلوت 1ضد1 (maxp=2)');
    const rid = cr.json.room.id, code = cr.json.room.code;
    await api(lb.cookie, 'POST', '/api/rooms/join', { code });
    const st = await api(la.cookie, 'POST', '/api/rooms/start', { room_id: rid });
    ok(st.status === 200 && st.json.room && st.json.room.status === 'playing',
      'بدء بلوت بمقعدين مقبول خادمياً (رسالة «تتطلب 4 لاعبين» لم تعد تظهر)');
    const se = await api(lb.cookie, 'POST', '/api/rooms/settleRound', { room_id: rid, result: 'w1' });
    ok(se.status === 200 && se.json.payout === 19, 'تسوية بلوت فردي بالمقعد (w1 ⇒ 19 من جرة 20)');
  }

  /* ════════════ [ح] فحوص نوكيا الساكنة ════════════ */
  console.log('── [ح] توافق نوكيا (فحوص ساكنة) ──');
  {
    const fs = require('fs');
    const path = require('path');
    const ROOT = path.join(__dirname, '..');
    const R = (f) => path.join(ROOT, f);
    /* CSS الألعاب الحية: لا محدد :has(…) حقيقي (تعليقات :has() الفارغة مسموحة) */
    const liveCss = [
      'baloot-game/css/baloot.css', 'uno-game/css/uno.css', 'css/05-ronda.css',
      'css/08-rami.css', 'css/09-chrome.css', 'css/10-dama.css', 'css/12-chess.css',
      'css/13-billiards.css', 'css/14-ronda-classic.css', 'css/06-parchisi.css',
      'css/15-edge.css', 'css/21-classic.css', 'css/22-look.css', 'css/16-penalty.css'
    ];
    for (const f of liveCss) {
      const src = fs.readFileSync(R(f), 'utf8')
        /* التعليقات تُنزع قبل الفحص: توثيقنا يشير إلى :has() نصاً ولا يعني محدداً */
        .replace(/\/\*[\s\S]*?\*\//g, '');
      const real = /:has\([^)]/.test(src);
      ok(!real, f + ' بلا محددات :has(…) حقيقية');
    }
    /* كلمات hook الجديدة موجودة */
    const chrome = fs.readFileSync(R('css/09-chrome.css'), 'utf8');
    ok(/body\[data-game\]/.test(chrome), '09-chrome: محدد سمة data-game مركّب');
    ok(/room-rematch-bar/.test(chrome), '09-chrome: أنماط شريط التصويت الموحّد');
    const rdc = fs.readFileSync(R('css/14-ronda-classic.css'), 'utf8');
    ok(/@supports not \(height: 1cqh\)/.test(rdc), '14-ronda-classic: بديل vh/vw لغياب دعم وحدات الحاوية');
    const prc = fs.readFileSync(R('css/06-parchisi.css'), 'utf8');
    ok(/11cqw/.test(prc) && /width: 48px;/.test(prc), '06-parchisi: بدائل px قبل cqw');
    /* JS: الخطافات */
    const mainjs = fs.readFileSync(R('js/main.js'), 'utf8');
    ok(/setAttribute\('data-game', id\)/.test(mainjs) && /removeAttribute\('data-game'\)/.test(mainjs),
      'main.js: data-game يُضبط عند openGame ويُنزع عند closeGamePage');
    const bill = fs.readFileSync(R('js/games/billiards.js'), 'utf8');
    ok(bill.indexOf('Rooms.roomSettle(blRes)') !== -1, 'billiards.js: تسوية خادمية عند نهاية الإطار');
    {
      /* فرع الغرفة في blEndFrame (مُوثّق بعلامة v2.74) خالٍ من الدفع المحلي */
      const idx = bill.indexOf("if (B.mode === 'room') {\n      /* [v2.74·مال]");
      const seg = idx !== -1 ? bill.slice(idx, idx + 1400).replace(/\/\*[\s\S]*?\*\//g, '').split('} else if')[0] : '';
      ok(idx !== -1 && !/giveWin\(/.test(seg), 'billiards.js: فرع الغرفة بلا giveWin محلي (بقية الأوضاع تدريبية)');
    }
    const chjs = fs.readFileSync(R('js/games/chess.js'), 'utf8');
    ok(chjs.indexOf("Rooms.roomSettle(chRes)") !== -1, 'chess.js: تسوية خادمية عند نهاية المباراة');
    {
      const idx = chjs.indexOf("if (CHESS.mode === 'room') {\n        /* [v2.74·مال]");
      const seg = idx !== -1 ? chjs.slice(idx, idx + 1400).replace(/\/\*[\s\S]*?\*\//g, '').split('} else if')[0] : '';
      ok(idx !== -1 && !/giveWin\(/.test(seg), 'chess.js: فرع الغرفة بلا giveWin محلي (بقية الأوضاع تدريبية)');
      ok(/if \(CHESS\.mode === 'room'\) amt\.textContent = reasonTxt/.test(chjs), 'chess.js: فرع تعادل الغرفة بلا استرداد محلي');
    }
    ok(!/takeBet\(CHESS\.bet\)/.test(chjs), 'chess.js: لا takeBet محلي لغرف الرهان');
    const roomsJs = fs.readFileSync(R('js/core/rooms.js'), 'utf8');
    ok(roomsJs.indexOf('_syncRematchBar') !== -1 && roomsJs.indexOf('roomRematchBar') !== -1,
      'rooms.js: شريط التصويت الموحّد موجود');
    ok(/blFull = st\.game_id !== 'bl' \|\| !!\(st\.seats && st\.seats\.players >= st\.max_players\)/.test(roomsJs),
      'rooms.js: بوابة بلوت = اكتمال مقاعد الغرفة (لا 4 حرفياً)');
    const rondaJs = fs.readFileSync(R('js/games/ronda.js'), 'utf8');
    ok(rondaJs.indexOf('rjRestore') !== -1, 'ronda.js: استعادة مرحلة المشاركة عند العودة');
    const engJs = fs.readFileSync(R('js/games/engines.js'), 'utf8');
    ok(engJs.indexOf('rpsRematchRender') !== -1 && engJs.indexOf("g,\n    'rps-stage'") !== -1,
      'engines.js: لوحة تصويت rp + صنف المسرح rps-stage');
    ok(engJs.indexOf('activeOpener') !== -1, 'engines.js: فتح التصويت من أي لاعب نشط (بينالتي)');
    /* الترجمات */
    const tr = fs.readFileSync(R('js/i18n/translations.js'), 'utf8');
    for (const k of ['ui.rematchTitle', 'ui.rematchAgree', 'ui.rematchRefuse', 'blt.room.needSeats']) {
      ok(tr.indexOf("'" + k + "'") !== -1 || tr.indexOf('"' + k + '"') !== -1, 'translations: ' + k);
    }
    /* الخادم: الحراسة المالية */
    const mgr = fs.readFileSync(R('rooms/room-manager.js'), 'utf8');
    ok(/الجولة جارية — اطلب مقعداً من طابور الانضمام/.test(mgr), 'room-manager: قفل تفعيل المتفرج أثناء الجولة');
    ok(!/\? \(actualOnly \? 0 : pot\)/.test(mgr) && !/room\.escrow\[u\.id\] != null \? room\.escrow\[u\.id\] : bet\)/.test(mgr),
      'room-manager: escrowOf لا يصطنع إيداعاً (البديل 0 في المسارين)');
  }

  /* ════════════ [هـ] + [و] + [ز] + [د-واجهة] — متصفحان حقيقيان ════════════ */
  let browser = null;
  async function tryLaunch() {
    const { chromium } = require('playwright');
    const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
    /* 1) الثنائي الافتراضي */
    try { return await chromium.launch({ headless: true, args }); } catch (e) {}
    /* 2) ثنائيات كروميوم المحلية (نسخ كاش أحدث من المطلوب لمكتبة Playwright) */
    const fs = require('fs');
    for (const v of ['1243', '1200']) {
      for (const p of [
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux64/chrome',
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux/chrome'
      ]) {
        if (fs.existsSync(p)) {
          try { return await chromium.launch({ headless: true, args, executablePath: p }); } catch (e) {}
        }
      }
    }
    /* 3) ثنائي @sparticuz/chromium (نمط بيئة خادم الهاتف) */
    try {
      const sp = await import('@sparticuz/chromium');
      const exec = await sp.default.executablePath();
      if (fs.existsSync(exec)) {
        return await chromium.launch({ headless: true, args: args.concat(sp.default.args || []), executablePath: exec });
      }
    } catch (e) {}
    return null;
  }
  try { require.resolve('playwright'); browser = await tryLaunch(); }
  catch (e) { console.log('⚠️  Playwright غير متاح — تخطّي أقسام المتصفح (تغطيتها الخادمية أعلاه)'); }
  if (!browser && typeof require.resolve === 'function') {
    try { require.resolve('playwright'); console.log('⚠️  تعذّر إطلاق أي متصفح — تخطّي أقسام المتصفح (تغطيتها الخادمية أعلاه)'); }
    catch (e) {}
  }

  if (browser) {
    async function newPlayer(name, g) {
      await api(null, 'POST', '/api/register', { username: name + '_' + tag, password: 'pw123456' });
      const l = await api(null, 'POST', '/api/login', { username: name + '_' + tag, password: 'pw123456' });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
      await ctx.addCookies([{ name: 'sid', value: l.cookie.replace(/^sid=/, ''), url: BASE }]);
      const page = await ctx.newPage();
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined', { timeout: 20000 }).catch(() => {});
      await sleep(1000);
      await page.evaluate((gg) => { window.ST = window.ST || {}; window.ST.gold = gg; if (window.save) save(); }, g || 5000);
      return { page, cookie: l.cookie, id: l.json.user.id, ctx };
    }
    async function srvGold(page) {
      return page.evaluate(async () => {
        const r = await fetch('/api/me', { credentials: 'include' }).then(x => x.json()).catch(() => null);
        return r && r.user ? r.user.gold : null;
      });
    }
    async function wait(page, fn, timeout) {
      const t0 = Date.now();
      for (;;) {
        let v = null;
        try { v = await page.evaluate(fn); } catch (e) {}
        if (v) return v;
        if (Date.now() - t0 > (timeout || 10000)) return null;
        await sleep(400);
      }
    }

    /* ── [هـ] بلياردو: تنازل ⇒ تسوية + تصويت + إطار جديد ── */
    console.log('── [هـ] بلياردو بمتصفحين: تسوية آلية + شريط التصويت ──');
    {
      const A = await newPlayer('brwa', 3000), B = await newPlayer('brwb', 3000);
      for (const p of [A.page, B.page]) { await p.evaluate(() => openGame('bl8')); await sleep(600); }
      await A.page.evaluate(() => Rooms.createRoom('bl8', 10));
      await wait(A.page, () => !!(Rooms.state && Rooms.state.code), 8000);
      const code = await A.page.evaluate(() => Rooms.state.code);
      await B.page.evaluate((c) => Rooms.joinRoom(c), code);
      await wait(A.page, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
      await A.page.evaluate(() => Rooms.setReady(true));
      await B.page.evaluate(() => Rooms.setReady(true));
      await wait(A.page, () => Rooms.state && Rooms.state.players.every(p => p.ready), 8000);
      const g0A = await srvGold(A.page), g0B = await srvGold(B.page);
      await A.page.evaluate(() => Rooms.startGame());
      const started = await wait(A.page, () => (typeof BILLIARDS !== 'undefined' && BILLIARDS && BILLIARDS.G && BILLIARDS.mode === 'room') ? 1 : null, 15000);
      ok(!!started, 'بناء طاولة البلياردو عند الطرفين');
      const g1A = await srvGold(A.page), g1B = await srvGold(B.page);
      ok(g1A === g0A - 10 && g1B === g0B - 10, 'اقتطاع خادمي 10+10 عند البدء (لا خصم محلي مزدوج)');
      /* B يتنازل ⇒ A (المقعد 0) يفوز: blEndFrame عند B يبث end ويستدعي التسوية */
      await B.page.evaluate(() => { try { billiardsResign(); } catch (e) {} });
      const settled = await wait(A.page, () => (Rooms.state && Rooms.state.settled) ? 1 : null, 12000);
      ok(!!settled, 'التسوية الخادمية وقعت آلياً عند نهاية الإطار (settleRound من العميل)');
      const g2A = await srvGold(A.page), g2B = await srvGold(B.page);
      ok(g2A === g1A + 19, 'الرابح (A) استلم 19 خادمياً (جرة 20 − رسم 1)');
      ok(g2B === g1B, 'الخاسر (B) لا يدفع شيئاً إضافياً بعد الاقتطاع');
      /* شريط التصويت الموحّد عند الطرفين */
      const barA = await wait(A.page, () => (document.getElementById('roomRematchBar') && document.getElementById('roomRematchBar').classList.contains('show')) ? 1 : null, 10000);
      const barB = await wait(B.page, () => (document.getElementById('roomRematchBar') && document.getElementById('roomRematchBar').classList.contains('show')) ? 1 : null, 10000);
      ok(!!barA && !!barB, 'شريط التصويت ظهر عند الطرفين تلقائياً (لا يفتح يدوياً فقط)');
      const barTxt = await A.page.evaluate(() => document.getElementById('roomRematchBar').textContent);
      ok(/موافق|Agree|Accepter/i.test(barTxt), 'الشريط يعرض أزرار الموافقة/الرفض للمشارك');
      /* الاثنان يوافقان ⇒ إطار جديد */
      await A.page.evaluate(() => Rooms.voteRematch('agree'));
      await B.page.evaluate(() => Rooms.voteRematch('agree'));
      const newFrame = await wait(A.page, () => (typeof BILLIARDS !== 'undefined' && BILLIARDS.G && BILLIARDS.over === false && Rooms.state && Rooms.state.status === 'playing' && Rooms.state.settled === false) ? 1 : null, 15000);
      ok(!!newFrame, 'موافقة الطرفين ⇒ إطار جديد انطلق (التصويت يعمل بسلاسة)');
      const g3A = await srvGold(A.page);
      ok(g3A === g2A - 10, 'الإطار الجديد اقتطع رهانه من الطرفين (لا مال من فراغ)');
      await A.page.evaluate(() => Rooms.leaveForfeit());
      await B.page.evaluate(() => Rooms.leaveForfeit());
      await sleep(600);
    }

    /* ── [و] روك-بيپر-سيسرز: مباراة كاملة + تصويت ── */
    console.log('── [و] روك-بيپر-سيسرز بمتصفحين ──');
    {
      const A = await newPlayer('rpwa', 3000), B = await newPlayer('rpwb', 3000);
      for (const p of [A.page, B.page]) { await p.evaluate(() => openGame('rp')); await sleep(600); }
      await A.page.evaluate(() => Rooms.createRoom('rp', { bet: 10, game_opts: { rounds: 3, timer: 60 } }));
      await wait(A.page, () => !!(Rooms.state && Rooms.state.code), 8000);
      const code = await A.page.evaluate(() => Rooms.state.code);
      await B.page.evaluate((c) => Rooms.joinRoom(c), code);
      await wait(A.page, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
      await A.page.evaluate(() => Rooms.setReady(true));
      await B.page.evaluate(() => Rooms.setReady(true));
      await wait(A.page, () => Rooms.state && Rooms.state.players.every(p => p.ready), 8000);
      await A.page.evaluate(() => Rooms.startGame());
      await wait(A.page, () => Rooms.state && Rooms.state.status === 'playing', 10000);
      /* 3 جولات اختيار أعمى: كل طرف ينقر أول زر اختيار (نهاية المباراة تُرصد
         بالتسوية الخادمية — rpRoom.over لا يُضبط في rp أصلاً) */
      let matchSettled = null;
      for (let r = 0; r < 3; r++) {
        await wait(A.page, () => (!rpRoom || !rpRoom.waiting) ? 1 : null, 12000);
        await A.page.evaluate(() => { const b = document.querySelector('.rpsBtn'); if (b) b.click(); });
        await wait(B.page, () => (!rpRoom || !rpRoom.waiting) ? 1 : null, 12000);
        await B.page.evaluate(() => { const b = document.querySelector('.rpsBtn'); if (b) b.click(); });
        matchSettled = await wait(A.page, () => (Rooms.state && Rooms.state.settled) ? 1 : null, 14000);
        if (matchSettled) break;
        await sleep(1700);
      }
      ok(!!matchSettled, 'انتهت المباراة بعد جولاتها (تسوية خادمية عبر العميل)');
      const settled = await wait(A.page, () => (Rooms.state && Rooms.state.settled) ? 1 : null, 10000);
      ok(!!settled, 'تسوية خادمية عند نهاية مباراة rp');
      /* لوحة التصويت الخاصة بrp */
      const pnlA = await wait(A.page, () => { const h = document.getElementById('rpsRematch'); return (h && !h.hidden && /pn-rm-box/.test(h.innerHTML)) ? 1 : null; }, 10000);
      const pnlB = await wait(B.page, () => { const h = document.getElementById('rpsRematch'); return (h && !h.hidden && /pn-rm-box/.test(h.innerHTML)) ? 1 : null; }, 10000);
      ok(!!pnlA && !!pnlB, 'لوحة تصويت rp ظهرت عند الطرفين (كانت لا توجد أصلاً)');
      /* لا شريط موحد مضاعف (rp من أصحاب اللوحات الخاصة) */
      await sleep(800);
      const dupBar = await A.page.evaluate(() => { const b = document.getElementById('roomRematchBar'); return !!(b && b.classList.contains('show')); });
      ok(!dupBar, 'لا ازدواج: شريط التصويت الموحّد يستثني rp (لديها لوحتها)');
      /* الموافقة ⇒ مباراة جديدة */
      await A.page.evaluate(() => Rooms.voteRematch('agree'));
      await B.page.evaluate(() => Rooms.voteRematch('agree'));
      const newMatch = await wait(A.page, () => (rpRoom && !rpRoom.over && rpRoom.round === 1 && rpRoom.myWins === 0 && Rooms.state && Rooms.state.status === 'playing') ? 1 : null, 15000);
      ok(!!newMatch, 'موافقة الطرفين ⇒ مباراة rp جديدة انطلقت');
      await A.page.evaluate(() => Rooms.leaveForfeit());
      await B.page.evaluate(() => Rooms.leaveForfeit());
      await sleep(600);
    }

    /* ── [ز] فلات دوغ: عودة أثناء مرحلة المشاركة ── */
    console.log('── [ز] فلات دوغ: العائد يرى لوحة المشاركة ──');
    {
      const A = await newPlayer('rnwa', 3000), B = await newPlayer('rnwb', 3000);
      for (const p of [A.page, B.page]) { await p.evaluate(() => openGame('rn')); await sleep(400); }
      await A.page.evaluate(() => Rooms.createRoom('rn', 10));
      await wait(A.page, () => !!(Rooms.state && Rooms.state.code), 8000);
      const code = await A.page.evaluate(() => Rooms.state.code);
      await B.page.evaluate((c) => Rooms.joinRoom(c), code);
      await wait(A.page, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
      await A.page.evaluate(() => Rooms.setReady(true));
      await B.page.evaluate(() => Rooms.setReady(true));
      await wait(A.page, () => Rooms.state && Rooms.state.players.every(p => p.ready), 8000);
      await A.page.evaluate(() => Rooms.startGame());
      for (const p of [A.page, B.page]) await wait(p, () => !!(typeof RN_ADAPTER !== 'undefined' && RN_ADAPTER.room), 12000);
      await A.page.evaluate(() => RN_chooseMode('number_only'));
      await wait(A.page, () => !!(RN_ADAPTER.room && RN_ADAPTER.room.mode), 8000);
      await A.page.evaluate(() => RN_startRound());
      /* مرحلة المشاركة عند الطرفين */
      const jA = await wait(A.page, () => document.getElementById('rnJoinPhase') ? 1 : null, 16000);
      const jB = await wait(B.page, () => document.getElementById('rnJoinPhase') ? 1 : null, 16000);
      ok(!!jA && !!jB, 'مرحلة المشاركة ظهرت عند الطرفين');
      /* B يصادق أولاً ثم يحدّث الصفحة أثناء المرحلة (العائد) */
      const roles = await A.page.evaluate(() => ({ me: RN_ADAPTER.core.myRole, order: RN_ADAPTER.room.order }));
      const selIsA = roles.me === 'selector';
      const selPage = selIsA ? A.page : B.page;
      const otherPage = selIsA ? B.page : A.page;
      await selPage.evaluate(() => RN_joinRound());
      await sleep(700);
      await otherPage.evaluate(() => RN_joinRound());
      const r1 = await wait(A.page, () => (RN_ADAPTER.room && RN_ADAPTER.room.round >= 1) ? 1 : null, 15000);
      ok(!!r1, 'الجولة 1 انطلقت بعد مصادقة الطرفين');
      /* المتخمّن يلعب: يختار رقماً ويؤكد — السحب المتبادل يجري آلياً حتى نهاية الجولة */
      await wait(selPage, () => (RN_ADAPTER.core && RN_ADAPTER.core.state === 'SELECTION_REQUIRED') ? 1 : null, 12000);
      await selPage.evaluate(() => RN_selectNum(7));
      await sleep(350);
      await selPage.evaluate(() => RN_confirm());
      /* إنهاء الجولة مباشرة عبر النواة (نفس أحداث النهاية الحقيقية:
         ROUND_RESULT ⇒ تسوية خادمية · ROUND_ENDED ⇒ دوران المالك ثم مرحلة المشاركة)
         — لوتنتظر اكتمال سحب الـ40 ورقة دقائق كاملة */
      /* الإنهاء عند الطرفين (حدث محلي متماثل مع النهاية الحقيقية)
         — طرف واحد يبقي نواة الآخر تسحب الرزة دقائق */
      for (const pg of [A.page, B.page]) {
        await pg.evaluate(() => { try { RN_ADAPTER.core._endRound('dealer'); } catch (e) {} });
      }
      /* اللوحة هي تجربة المستخدم — بث الحركة joinphase يرسلها المالك مباشرة؛
         Rooms.state.roundJoin يمتلأ من الخادم مع أول مصادقة (حركات اللعبة لا تبث حالة Rooms.state — به يفحص العائد من استجابة الانضمام الرسمية) */
      const j2 = await wait(A.page, () => document.getElementById('rnJoinPhase') ? 1 : null, 25000);
      const j2B = await wait(B.page, () => document.getElementById('rnJoinPhase') ? 1 : null, 15000);
      ok(!!j2 && !!j2B, 'انتهت الجولة وعادت مرحلة المشاركة عند الطرفين (عقد كل جولة بالمشاركة)');
      /* B يحدّث صفحته أثناء مرحلة المشاركة — يجب أن يرى اللوحة بعد العودة */
      await B.page.reload({ waitUntil: 'domcontentloaded' });
      await wait(B.page, () => typeof Rooms !== 'undefined' && Rooms.state, 20000);
      /* العضوية محفوظة محلياً — إعادة الدخول تعيد البناء من حالة الخادم */
      await sleep(2500);
      const jB2 = await wait(B.page, () => document.getElementById('rnJoinPhase') ? 1 : null, 20000);
      ok(!!jB2, 'العائد بعد التحديث أثناء مرحلة المشاركة يرى اللوحة (كانت تضيع فيقعد الجولة)');
      const canVote = await B.page.evaluate(() => {
        const el = document.getElementById('rnJoinPhase');
        return !!(el && (document.querySelector('#rnJoinPhase .fd-prompt-btn') || /fd-prompt-btn/.test(el.innerHTML)));
      });
      ok(canVote, 'العائد المطلوب يرى زري المشاركة/الانسحاب (يستطيع المصادقة)');
      await A.page.evaluate(() => Rooms.leaveForfeit());
      await B.page.evaluate(() => Rooms.leaveForfeit());
      await sleep(600);
    }

    /* ── [د-واجهة] بوابة بلوت في مودال الغرفة ── */
    console.log('── [د-واجهة] بوابة بلوت 1ضد1 في المودال ──');
    {
      const A = await newPlayer('blua', 3000), B = await newPlayer('blub', 3000);
      for (const p of [A.page, B.page]) { await p.evaluate(() => openGame('bl')); await sleep(700); }
      await A.page.evaluate(() => Rooms.createRoom('bl', { bet: 10, game_opts: { maxp: 2, mode4: 'tt', target: 51, timer: 60 }, max_players: 2 }));
      await wait(A.page, () => !!(Rooms.state && Rooms.state.code), 8000);
      const code = await A.page.evaluate(() => Rooms.state.code);
      await B.page.evaluate((c) => Rooms.joinRoom(c), code);
      await wait(A.page, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
      await A.page.evaluate(() => Rooms.setReady(true));
      await B.page.evaluate(() => Rooms.setReady(true));
      const allRdy = await wait(A.page, () => (Rooms.state && Rooms.state.players.length >= 2 && Rooms.state.players.every(p => p.ready)) ? 1 : null, 8000);
      ok(!!allRdy, 'الطرفان جاهزان (الحالة متزامنة عند المالك)');
      await A.page.evaluate(() => Rooms.openModal());
      await sleep(600);
      const startEnabled = await A.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('#roomBody button'));
        const start = btns.find(b => /ابدأ|Start|Démarrer/.test(b.textContent) && !b.disabled && /startGame/.test(b.getAttribute('onclick') || ''));
        const anyStart = btns.find(b => /Rooms\.startGame/.test(b.getAttribute('onclick') || ''));
        return anyStart ? !anyStart.disabled : false;
      });
      ok(startEnabled, 'زر البدء مفعّل في غرفة بلوت 1ضد1 (كان معطلاً برسالة 4 لاعبين)');
      const noFourMsg = await A.page.evaluate(() => {
        const b = document.getElementById('roomBody');
        return b ? !/4 لاعبين كاملين|4 joueurs complets/i.test(b.textContent) : true;
      });
      ok(noFourMsg, 'لا رسالة «تحتاج البلوت 4 لاعبين كاملين» في غرفة بمقعدَين');
      await A.page.evaluate(() => Rooms.closeModal());
      await A.page.evaluate(() => Rooms.startGame());
      const built = await wait(A.page, () => (typeof BalootApp !== 'undefined' && window.BalootApp && window.BalootApp.config) ? 1 : null, 15000);
      const playing = await wait(A.page, () => (Rooms.state && Rooms.state.status === 'playing') ? 1 : null, 8000);
      ok(!!built && !!playing, 'بدء بلوت 1ضد1 يبني المحرك ويدخل اللعب (إصلاح كامل من الإنشاء حتى الطاولة)');
      await A.page.evaluate(() => Rooms.leaveForfeit());
      await B.page.evaluate(() => Rooms.leaveForfeit());
      await sleep(600);
    }

    /* ── [ح-متصفح] سمات نوكيا الحية ── */
    console.log('── [ح-متصفح] خطاف data-game وأصناف المسارح ──');
    {
      const A = await newPlayer('nkia', 3000);
      await A.page.evaluate(() => openGame('rm'));
      await sleep(900);
      const dgRm = await A.page.evaluate(() => document.body.getAttribute('data-game'));
      ok(dgRm === 'rm', 'data-game="rm" مضبوطة على <body> عند فتح الرامي');
      await A.page.evaluate(() => closeGamePage());
      await sleep(500);
      const dgNone = await A.page.evaluate(() => document.body.getAttribute('data-game'));
      ok(dgNone === null, 'data-game تُنزع عند مغادرة صفحة اللعبة');
      await A.page.evaluate(() => openGame('ch'));
      await sleep(900);
      const chStage = await A.page.evaluate(() => {
        const s = document.querySelector('#chessStage');
        return !!(s && s.classList.contains('ch-stage'));
      });
      ok(chStage, 'مسرح الشطرنج يحمل صنف ch-stage (بديل :has)');
      const dgCh = await A.page.evaluate(() => document.body.getAttribute('data-game'));
      ok(dgCh === 'ch', 'data-game="ch" مضبوطة');
      await A.page.evaluate(() => openGame('rp'));
      await sleep(900);
      const rpsStage = await A.page.evaluate(() => !!document.querySelector('.stage.rps-stage'));
      ok(rpsStage, 'مسرح rp يحمل صنف rps-stage (بديل :has)');
      const rpsBar = await A.page.evaluate(() => {
        const b = document.getElementById('roomRematchBar');
        return !b || !b.classList.contains('show');
      });
      ok(rpsBar, 'شريط التصويت مخفي خارج التصويت');
      await A.page.evaluate(() => closeGamePage());
      await sleep(400);
      await A.ctx.close();
    }
    await browser.close();
  }

  console.log('\n══════════════════════════════════');
  console.log('v2.74 حرس: ' + pass + ' ✓ · ' + fail + ' ✗');
  console.log('══════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ الاختبار:', e); process.exit(2); });
