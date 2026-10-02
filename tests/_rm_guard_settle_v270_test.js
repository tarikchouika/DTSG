/* ═══════════════════════════════════════════════════════════════════
   [v2.70] اختبار متصفح حقيقي: حرس الدور والتسوية الخادمية وإعدادات الغرف
   ───────────────────────────────────────────────────────────────────────
   يعيد إنتاج الأعطال الخمسة المُبلَّغة من المالك ويتحقق من إصلاحاتها:
     أ) [حرس الدور] في دور الخصم: نقر المجرف من الصفحة الأخرى لا يضيف ورقة
        لأحد (كانت تُضاف ليد صاحب الدور) — ramiAssertMyTurn.
     ب) [حرس المرسل] حركة تنسب إلى مقعد الخصم لكن مرسِلها غيره تُرفض عند التطبيق
        (_netMoveAuthentic). الحالة المقابلة (المقعد من مرسله نفسه) ليست
        محكوماً: تمرير حسب isSpectator فلا تعني الحارس.
     ج) [التسوية الخادمية] نهاية مباراة رامي في الغرفة ⇒ settleRound فعلاً:
        room.settled + الأرصدة (رابح +19 من جرة 20) + سجل نظيف
        (خاسر صف bet واحد · رابح bet+win).
     د) [إعدادات رامي] اختيار «سامبل» يبقى محفوظاً بعد إعادة بناء الخيارات.
     هـ) [إعدادات بلوت] [v2.72] قائمة 2/3/4 صادقة + نمط 4 لاعبين (فردي/فرق).
   تشغيل:  QA_BASE=http://127.0.0.1:3971/ node tests/_rm_guard_settle_v270_test.js
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
async function hands(page) {
  return await page.evaluate(() => {
    const ad = window.RamiAdapter || window.RAMI_ADAPTER;
    return ad && ad.game ? ad.game.players.map(p => p.hand.length) : null;
  }).catch(() => null);
}

(async function main() {
  const { chromium } = require('playwright');
  /* [v2.77] مطلقِق احتياطي — كاش المتصفحات أحدث من مكتبة Playwright المحلية
     (نفس نمط v274): نجرّب الثنائي الافتراضي ثم ثنائيات كروميوم المحلية */
  let browser = null;
  const blArgs = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
  try { browser = await chromium.launch({ headless: true, args: blArgs }); } catch (e) {}
  if (!browser) {
    const fs = require('fs');
    for (const v of ['1243', '1200']) {
      for (const p of [
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux64/chrome',
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux/chrome'
      ]) {
        if (fs.existsSync(p)) {
          try { browser = await chromium.launch({ headless: true, args: blArgs, executablePath: p }); } catch (e) {}
        }
      }
    }
  }
  if (!browser) { console.error('تعذر إطلاق متصفح'); process.exit(2); }

  /* ── حسابان وغرفة رامي ── */
  await api(null, 'POST', '/api/register', { username: 'g7a_' + tag, password: 'pw123456' });
  await api(null, 'POST', '/api/register', { username: 'g7b_' + tag, password: 'pw123456' });
  const la = await api(null, 'POST', '/api/login', { username: 'g7a_' + tag, password: 'pw123456' });
  const lb = await api(null, 'POST', '/api/login', { username: 'g7b_' + tag, password: 'pw123456' });
  const gold0 = { a: la.json.user.gold, b: lb.json.user.gold };

  /* [v2.70.1·تصحيح] الصفحتان تفتحان قبل بدء الجولة لا بعده: الواجهة لا تفتح غرفة
     جارية تلقائياً عند التحميل (لا مسار استعادة على البدء — اللاعب يدخلها من قائمة
     الغرف) ⇒ بناء اللعبة بعد `start` في صفحة لم تفتح قناة SSE لا يحدث أبداً،
     وينهار الاختبار عند «بنيت اللعبة» قبل أي فحص. */
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
  await ctxA.addCookies([{ name: 'sid', value: la.cookie.replace(/^sid=/, ''), url: BASE }]);
  await ctxB.addCookies([{ name: 'sid', value: lb.cookie.replace(/^sid=/, ''), url: BASE }]);
  const pA = await ctxA.newPage(), pB = await ctxB.newPage();
  const errs = { a: [], b: [] };
  pA.on('pageerror', e => errs.a.push(String(e.message)));
  pB.on('pageerror', e => errs.b.push(String(e.message)));
  await Promise.all([pA.goto(BASE + '/', { waitUntil: 'domcontentloaded' }), pB.goto(BASE + '/', { waitUntil: 'domcontentloaded' })]);
  await Promise.all([pA, pB].map(p => p.waitForFunction(
    () => typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined', { timeout: 20000 }
  ).catch(() => {})));
  await sleep(1200);   /* قناة SSE قبل أي حدث غرفة */

  const cr = await api(la.cookie, 'POST', '/api/rooms', { game_id: 'rm', max_players: 2, bet: 10, game_opts: { mode: 'talaj', target: 'single', timer: 90 } });
  ok(cr.status === 200 && cr.json.ok, 'إنشاء غرفة رامي');
  const rid = cr.json.room.id, code = cr.json.room.code;
  await api(lb.cookie, 'POST', '/api/rooms/join', { code });
  const st = await api(la.cookie, 'POST', '/api/rooms/start', { room_id: rid });
  ok(st.json.room.status === 'playing', 'بدء الجولة (اقتطاع 10 من كل طرف)');
  ok(await waitGame(pA) && await waitGame(pB), 'بنيت اللعبة عند الطرفين');

  const uidA = la.json.user.id, uidB = lb.json.user.id;
  /* انتظار وصول init (يحمل _netOrder) على الصفحتين */
  let who = null;
  for (let i = 0; i < 40; i++) {
    who = await pA.evaluate(() => {
      const ad = window.RamiAdapter;
      return { my: ad ? ad.myPlayerId : null, order: (ad && ad._netOrder) ? ad._netOrder.slice() : [] };
    }).catch(() => null);
    if (who && who.order && who.order.length === 2) break;
    await sleep(500);
  }
  /* مقعد A دائماً 0 (المالك) ومقعد B = 1 */
  ok(who && who.order.length === 2 && String(who.order[0]) === String(uidA), 'ترتيب المقاعد معروف للمصادقة (A=0)');

  /* ═══ [أ] حرس الدور: B ينقر المجرف في دور A ═══ */
  console.log('── [أ] حرس الدور ──');
  {
    /* اجعل الدور لمقعد A (الغالب: البادئ) — إن كان الدور لB عكس الأدوار */
    let cur = await pA.evaluate(() => window.RamiAdapter.game.roundManager.getCurrentPlayer().id);
    const hacker = cur === 0 ? pB : pA;
    const victim = cur;
    const before = await hands(pA);
    /* [v2.71] نقرتان سريعتان لا نقرتان متباعدتان: الرامي يشترط النقرتين
       في أقل من 420ms، فالنقرتان المتباعدتان لا تسحبان أصلاً وكان الفحص
       يمرّ بلا معنى (حارس الدور لم يُختبر حقاً). */
    const deck = hacker.locator('[data-ramidraw="deck"]');
    await deck.dblclick({ timeout: 5000 });
    await sleep(800);
    const after = await hands(pA);
    ok(JSON.stringify(before) === JSON.stringify(after),
      'نقر الخصم على المجرف في دور الغير لا يغيّر يداً (' + JSON.stringify(before) + ')');
  }

  /* ═══ [ب] حرس المرسل: حركة مفبركة ═══ */
  console.log('── [ب] حرس المرسل (مكافحة التزييف) ──');
  {
    let cur = await pA.evaluate(() => window.RamiAdapter.game.roundManager.getCurrentPlayer().id);
    const before = await hands(pA);
    /* على صفحة B: حركة سحب بمقعد A (صاحب الدور) لكن بمرسل B ⇒ مرفوضة */
    await pB.evaluate((args) => {
      const ad = window.RamiAdapter;
      ad._netApplyMove({ action: 'draw', by: String(args.byId), data: { drawType: 'draw_deck', playerId: args.seat } });
    }, { seat: cur, byId: uidB });
    await sleep(400);
    let after = await hands(pA);
    ok(JSON.stringify(before) === JSON.stringify(after), 'حركة مفبركة باسم مقعد الخصم (by=مستخدم آخر) ⇒ مرفوضة');
    /* حركة بمقعدcur من مرسلcur نفسه — تُقبل (تمرير حسب isSpectator لا يعنينا) */
  }

  /* ═══ [ج] التسوية الخادمية عند نهاية المباراة ═══ */
  console.log('── [ج] التسوية الخادمية من اللعبة ──');
  {
    /* ننهي المباراة قسراً على صفحة A: الفائز مقعد 0 */
    await pA.evaluate(() => {
      const ad = window.RamiAdapter;
      ad.game.gamePhase = 'MATCH_END';
      ad.game.getMatchResult = function () { return { winners: [this.players[0]] }; };
      ad._endRoundUIShow();
    });
    let settled = false;
    for (let i = 0; i < 30 && !settled; i++) {
      await sleep(400);
      const me = await api(la.cookie, 'GET', '/api/me', undefined);
      settled = Math.abs((me.json.user.gold) - (gold0.a - 10 + 19)) < 0.011;
    }
    ok(settled, 'رامي سلّمت النتيجة للخادم: رابح المقعد 0 استلم 19 (جرة 20 − رسم 1)');
    const meB = await api(lb.cookie, 'GET', '/api/me', undefined);
    ok(Math.abs(meB.json.user.gold - (gold0.b - 10)) < 0.011, 'الخاسر خسر رهانه فقط (10)');
    /* السجل: خاسر صف bet واحد، رابح bet+win */
    const txA = await api(la.cookie, 'GET', '/api/transfers?types=all', undefined);
    const txB = await api(lb.cookie, 'GET', '/api/transfers?types=all', undefined);
    const betsA = (txA.json.transfers || []).filter(t => t.type === 'bet');
    const winsA = (txA.json.transfers || []).filter(t => t.type === 'win');
    const betsB = (txB.json.transfers || []).filter(t => t.type === 'bet');
    ok(betsA.length === 1 && betsB.length === 1, 'كل طرف صف bet واحد فقط (لا تكرار)');
    ok(winsA.length === 1 && Math.abs(winsA[0].amount - 19) < 0.011, 'صف win واحد للرابح بمبلغ الجرة بعد الرسم');
    const tksB = await api(lb.cookie, 'GET', '/api/rounds', undefined);
    const rmTk = (tksB.json.rounds || []).filter(r => r.game_id === 'rm');
    /* [v2.71] تغيّر العقد بتوجيه المالك: التذاكر تُسجَّل في كل لعبة —
       الخاسر له تذكرة رهان بلا فوز، والرابح تذكرة برهان وفوزه 19. */
    ok(rmTk.length === 1 && rmTk[0].won === 0 && Math.abs(rmTk[0].bet - 10) < 0.011,
      'تذكرة الخاسر: رهان 10 بلا فوز (بلا تكرار — صف bet واحد في السجل المالي)');
    const tkA = await api(la.cookie, 'GET', '/api/rounds', undefined);
    const rmTkA = (tkA.json.rounds || []).filter(r => r.game_id === 'rm');
    ok(rmTkA.length === 1 && rmTkA[0].won === 1 && Math.abs(rmTkA[0].payout - 19) < 0.011,
      'تذكرة الرابح: رهان 10 · فوز 19 (الجرة بعد الرسم)');
    /* الغرفة انتظرت التصويت بعد التسوية (ترتيب v2.70) */
    let rematchSeen = false;
    for (let i = 0; i < 20 && !rematchSeen; i++) {
      await sleep(300);
      rematchSeen = await pA.evaluate(() => !!(window.Rooms && Rooms.state && Rooms.state.rematch));
    }
    ok(rematchSeen, 'تصويت المباراة الجديدة بدأ بعد هبوط التسوية (لا سباق)');
  }

  /* ═══ [د] إعدادات رامي: سامبل يبقى محفوظاً ═══ */
  console.log('── [د] إعدادات رامي ──');
  {
    await pA.evaluate(() => { if (window.Rooms && typeof Rooms._openSettings === 'function') Rooms._openSettings(); });
    await sleep(300);
    await pA.evaluate(() => {
      const g = document.getElementById('rsGame');
      if (g) g.value = 'rm';
      if (window.Rooms) Rooms._renderGameOpts('rm');
    });
    await sleep(200);
    let modeVal = await pA.evaluate(() => {
      const ms = document.getElementById('rsOpt_mode');
      if (!ms) return null;
      ms.value = 'simple';
      ms.dispatchEvent(new Event('change'));
      return ms.value;
    });
    await sleep(300);
    const kept = await pA.evaluate(() => {
      const ms = document.getElementById('rsOpt_mode');
      return ms ? ms.value : null;
    });
    ok(kept === 'simple', 'اختيار «سامبل» يبقى محفوظاً بعد إعادة بناء الخيارات (كان يرتد إلى طالاج)');
    const targets = await pA.evaluate(() => {
      const t = document.getElementById('rsOpt_target');
      return t ? Array.from(t.options).map(o => String(o.value)) : [];
    });
    ok(targets.indexOf('201') !== -1, 'قائمة أهداف سامبل صحيحة (تبدأ 201)');
  }

  /* ═══ [هـ] إعدادات بلوت: [v2.72] قائمة 2-3-4 صادقة + نمط 4 لاعبين ═══ */
  console.log('── [هـ] إعدادات بلوت ──');
  {
    await pA.evaluate(() => {
      const g = document.getElementById('rsGame');
      if (g) g.value = 'bl';
      if (window.Rooms) Rooms._renderGameOpts('bl');
    });
    await sleep(300);
    const seatOpts = await pA.evaluate(() => {
      const m = document.getElementById('rsOpt_maxp');
      return m ? Array.from(m.options).map(o => String(o.value)) : null;
    });
    ok(Array.isArray(seatOpts) && seatOpts.join(',') === '2,3,4',
      '[v2.72] قائمة اللاعبين في بلوت 2/3/4 صادقة (المحرك يقبلها فعلاً — توجيه المالك «1ضد1 و1ضد2 و1ضد3 فردي»)');
    const modeOpts = await pA.evaluate(() => {
      const m = document.getElementById('rsOpt_mode4');
      return m ? Array.from(m.options).map(o => String(o.value)) : null;
    });
    ok(Array.isArray(modeOpts) && modeOpts.join(',') === 'ffa,tt',
      '[v2.72] خيار نمط 4 لاعبين (فردي/فرق) موجود في بلوت — مثل روندا/أونو');
  }

  ok(errs.a.length === 0 && errs.b.length === 0, 'صفر أخطاء JS عند الطرفين' + (errs.a.length + errs.b.length ? ' — ' + (errs.a.concat(errs.b))[0].slice(0, 80) : ''));

  await browser.close();
  console.log('\n════════════════════════════');
  console.log('النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
  console.log('════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
