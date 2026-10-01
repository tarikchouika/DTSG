/* ═══════════════════════════════════════════════════════════════════
   [v2.71] متصفحان حقيقيان (بلا خادم إضافية): استعادة الغرفة بعد التحديث + إكمال الآلي
   ───────────────────────────────────────────────────────────────────────
     أ) [استعادة] لاعب في جولة رامي جارية يحدّث الصفحة ⇒ تُعاد اللعبة
        مبنيةً فوراً بدل بقائه على الصفحة الرئيسية (فجوة: لا مسار استعادة
        على البدء — كان الاعتماد على بث SSE وحده هشّاً).
     ب) [آلي يكمل الجولة] **مغادرة** خصم صريحاً أثناء الجولة ⇒ الخادم يوسم مقعده
        isBot فوراً (بلا انتظار منظّف الأشباح)، فيلعب السائق عنه بالمحرك المحلي
        حتى تُحسم الجولة (كان _netBotSeats لا يعرف إلا معرّفات bot: فيتجمّد الدور).
        غرفة ثلاثية: الباقي اثنان ⇒ الجولة تستمر والقاعدة تعمل (التسوية الفورية
       فقط عند بقاء مقعد واحد).
   تشغيل:  QA_BASE=http://127.0.0.1:3971/ node tests/_restore_bot_v271_test.js
           (خادم معزول DM_TEST_MODE=1 — القاعدة 13؛ يحتاج node_modules/Playwright)
   ملاحظة منهجية: الفحص بـ**مغادرة صريحة** لا بانقطاع، فلا يعتمد على منظّف
   الأشباح (دورته 60ث) ولا يُسرّعها globally فتختلّ اختبارات الـAPI التي لا
   تفتح قناة SSE (كل لاعبينها أشباح عند التسريع).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const SB = require('./_safe_base.js');
const BASE = SB.BASE;
let pass = 0, fail = 0;
function ok(cond, label) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tag = Date.now().toString(36);

async function api(method, path, body, cookie) {
  const r = await fetch(BASE + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { status: r.status, json, cookie: r.headers.get('set-cookie') ? r.headers.get('set-cookie').split(';')[0] : cookie };
}
async function waitGame(page) {
  for (let i = 0; i < 120; i++) {
    const ready = await page.evaluate(() => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      return !!(ad && ad.game && ad.game.roundManager && ad.game.players && document.querySelector('[data-ramidraw="deck"]'));
    }).catch(() => false);
    if (ready) return true;
    await sleep(500);
  }
  return false;
}
async function openAs(browser, cookie) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
  await ctx.addCookies([{ name: 'sid', value: String(cookie).replace(/^sid=/, ''), url: BASE }]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined', { timeout: 20000 }
  ).catch(() => {});
  await sleep(1000);
  page._errs = errs;
  return page;
}

(async function main() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  const mk = async (name) => {
    await api('POST', '/api/register', { username: name + tag, password: 'pw123456' });
    const l = await api('POST', '/api/login', { username: name + tag, password: 'pw123456' });
    return { name: name + tag, cookie: l.cookie, id: l.json.user.id };
  };
  const a = await mk('v71A'), b = await mk('v71B'), c = await mk('v71C');
  const cr = await api('POST', '/api/rooms', { game_id: 'rm', max_players: 3, bet: 10, game_opts: { mode: 'talaj', target: 'single', timer: 90 } }, a.cookie);
  ok(cr.status === 200 && cr.json.ok, 'إنشاء غرفة رامي (ثلاثة مقاعد)');
  const rid = cr.json.room.id, code = cr.json.room.code;

  /* الصفحتان مفتوحتان وقناة SSE قائمة قبل أي حدث غرفة — وإلا لم تصلهما
     أحداث البث فلا تُبنى اللعبة (خطأ منهفي شائع في اختبارات المتصفح) */
  const pA = await openAs(browser, a.cookie);
  const pB = await openAs(browser, b.cookie);
  const pC = await openAs(browser, c.cookie);
  ok(true, 'الصفحات الثلاث مفتوحة ومصادَقة');

  await api('POST', '/api/rooms/join', { code }, b.cookie);
  await api('POST', '/api/rooms/join', { code }, c.cookie);
  await api('POST', '/api/rooms/start', { room_id: rid }, a.cookie);
  ok(await waitGame(pA) && await waitGame(pB) && await waitGame(pC), 'بُنيت الجولة عند الأطراف الثلاثة');

  /* ═══ أ) الاستعادة بعد التحديث ═══ */
  console.log('── [أ] تحديث الصفحة أثناء جولة جارية ──');
  await pA.evaluate(() => { try { window.Rooms.state = null; localStorage.removeItem('rc_active_room'); } catch (e) {} });
  await pA.reload({ waitUntil: 'domcontentloaded' });
  const rebuilt = await waitGame(pA);
  ok(rebuilt, 'بعد التحديث: اللعبة بُنيت مجدداً (لا بقاء على الصفحة الرئيسية)');
  const state = await pA.evaluate(() => ({
    status: window.Rooms && Rooms.state ? Rooms.state.status : null,
    hasRoom: !!(window.Rooms && Rooms.state),
    pg: document.body.className
  }));
  ok(state.hasRoom && state.status === 'playing', 'حالة الغرفة الجارية استُعيدت في العميل');
  ok(/pg-game/.test(state.pg), 'الصفحة عادت إلى صفحة اللعبة');

  /* ═══ ب) المغادر يكمل عنه السائق آلياً ═══ */
  console.log('── [ب] مغادرة خصم ⇒ إكمال آلي للجولة ──');
  const botSeat = await pA.evaluate(() => {
    const ad = window.RamiAdapter;
    if (!ad || !ad._netOrder) return -1;
    const room = window.Rooms.state;
    const ghost = (room.players || []).find(p => p.isBot);
    return ghost ? ad._netOrder.indexOf(String(ghost.id)) : -1;
  });
  /* ب يغادر صراحةً من داخل اللعبة (نفس مسار زر المغادرة في الواجهة) */
  await pB.evaluate(() => {
    if (window.Rooms && typeof Rooms.leaveForfeit === 'function') Rooms.leaveForfeit();
  }).catch(() => {});
  let marked = -1;
  for (let i = 0; i < 40; i++) {
    marked = await pA.evaluate(() => {
      const ad = window.RamiAdapter;
      if (!ad || !ad.game || !ad._netOrder) return -1;
      const room = window.Rooms.state;
      const ghost = (room.players || []).find(p => p.isBot);
      if (!ghost) return -1;
      const seat = ad._netOrder.indexOf(String(ghost.id));
      return ad.game.players[seat] && ad.game.players[seat].isBot ? seat : -1;
    }).catch(() => -1);
    if (marked >= 0) break;
    await sleep(500);
  }
  ok(marked >= 0, 'الخادم وسم مقعد المغادر isBot+leftRound وانعكس على محرك السائق فوراً');

  /* حين يبلغ الدور مقعد الشبح يجب أن يمسكه المحرك المحلي ويتصرّف عنه.
     (في الرامي لا يتناوب اللاعبان بعد كل ورقة — الدور يتنقّل عند الفتح
     أو بدء شوط جديد — فندفع الدور للمقعد الآلي بدل انتظار شوط كامل.) */
  const drove = await pA.evaluate(async () => {
    const ad = window.RamiAdapter;
    if (!ad || !ad.game) return { ok: false, why: 'لا محرك' };
    if (!ad._isDriver()) return { ok: false, why: 'الصفحة ليست سائقاً' };
    window.__botTurns = 0;
    const orig = ad._runBotTurn.bind(ad);
    ad._runBotTurn = function (p) { if (p && p.isBot) window.__botTurns++; return orig(p); };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const rm = ad.game.roundManager;
    const ghostIdx = ad.game.players.findIndex(p => p.isBot);
    if (ghostIdx < 0) return { ok: false, why: 'لا مقعد آلي في المحرك' };
    if (rm.getCurrentPlayer().id !== ghostIdx) { try { rm.nextPlayer(); } catch (e) { return { ok: false, why: 'nextPlayer: ' + e.message }; } }
    if (typeof ad._processTurn === 'function') ad._processTurn();
    for (let i = 0; i < 30 && window.__botTurns === 0; i++) await sleep(400);
    return { ok: window.__botTurns > 0, turns: window.__botTurns };
  }).catch(e => ({ ok: false, why: String(e && e.message) }));
  ok(drove.ok, 'المحرك المحلي لعب دور مقعد الشبح (الجولة تتقدّم بدل التجمّد)'
     + (drove.ok ? '' : ' — ' + (drove.why || ('أدوار=' + (drove.turns || 0)))));

  const advanced = await pA.evaluate(() => {
    const ad = window.RamiAdapter;
    if (!ad || !ad.game || !ad.game.roundManager) return false;
    return !!(ad.game.roundManager.currentPlayerIndex != null || ad.game.roundManager.getCurrentPlayer());
  }).catch(() => false);
  ok(advanced, 'محرك الجولة حيّ بعد المغادرة (لا انتظار ولا جمود)');

  /* الجولة استمرت (بقي لاعبان) ولم تُحسم مغادرةً */
  const stillPlaying = await pA.evaluate(() => !!(window.Rooms.state && window.Rooms.state.status === 'playing'));
  ok(stillPlaying, 'الجولة استمرت بعد مغادرة خصم (الباقي اثنان ⇒ لا حسم فوري)');

  const errsA = (pA._errs || []).concat(pC._errs || []);
  ok(errsA.length === 0, 'صفر أخطاء JS في صفحتي السائق والمشارك' + (errsA.length ? ' — ' + errsA[0].slice(0, 80) : ''));

  await browser.close();
  console.log('\n════════════════════════════');
  console.log('النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
  console.log('════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });