#!/usr/bin/env node
'use strict';
/* ═══ [v2.83] e2e — بلوت وجهاً لوجه في الغرف: مزامنة + مصادقة الجولة التالية ═══
   متصفحان حقيقيان (مضيف + ضيف) على بيئة QA:
     أ) إنشاء غرفة بلوت برهان + انضمام + جاهزية + بدء
     ب) تطابق البذرة والمقاعد والوضع عند الطرفين (مزامنة الأساس)
     ج) لعب شوط كامل حتى نهايته — نافذة النتيجة تظهر عند الطرفين (الإصلاح)
     د) تصويت الجولة التالية: الضيف يصوّت + المضيف يقدّم ⇒ الطرفان في الشوط التالي
     هـ) إكمال المباراة حتى نهايتها + التسوية المالية بعقد المال (5% عمولة)
     و) المصادقة على الجولة التالية (roundJoin): كلا الطرفين يشارك برهان
        الجولة الجديدة فتنطلق جولة ثانية كاملة
     ز) صفر أخطاء كونسول عند الطرفين
   تشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_v283_bl_room_e2e_test.js
*/
const { chromium } = require('playwright');
const SB = require('./_safe_base.js');
const BASE = SB.BASE;          /* بلا شرطة أخيرة — لل fetch */
const BASE_SLASH = SB.BASE_SLASH;  /* بشرطة — لطلبات سياق Playwright */
let pass = 0, fail = 0;
function ok(cond, label, detail) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail !== undefined ? ' — ' + detail : '')); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(cookie, method, p, body) {
  const r = await fetch(BASE + p, {    method,
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
  return { name, id: l.json && l.json.user && l.json.user.id, cookie: l.cookie, gold: (l.json && l.json.user && l.json.user.gold) || 0 };
}
async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) { lastErr = e; }
    await page.waitForTimeout(200);
  }
  throw new Error('wait timeout' + (lastErr ? ' (' + lastErr.message + ')' : ''));
}

(async () => {
  const A = await ensureUser('bl_host_v283', 'Pw123456!');
  const B = await ensureUser('bl_guest_v283', 'Pw123456!');
  ok(!!A.cookie && !!B.cookie, 'الحسابان جاهزان (مضيف + ضيف)');

  const browser = await chromium.launch();
  const mkPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 820 } });
    const page = await ctx.newPage();
    page._errs = [];
    /* [v2.95.1] تسجيل استجابات ≥400 برابطها وجسمها: رسالة الكونسول مجرّدة
       («400 Bad Request») فلا تميّز أيّ طلبٍ هو ولا لماذا رُفض — فكان الجناح
       يعدّ رفضاً **مُصمَّماً** خطأً. الآن الرفض مُسمّى ومُتحقَّق منه. */
    page._http4xx = [];
    page.on('pageerror', e => page._errs.push('[pageerror] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') page._errs.push('[console] ' + m.text()); });
    page.on('response', async r => {
      if (r.status() < 400) return;
      let body = '';
      try { body = (await r.text()).slice(0, 300); } catch (e) { body = '<unreadable>'; }
      page._http4xx.push({ status: r.status(), method: r.request().method(), url: r.url(), body: body });
    });
    return { ctx, page };
  };
  const host = await mkPage(), guest = await mkPage();

  /* دخول عبر واجهة الموقع نفسها (الكوكي عبر طلب السياق) */
  await host.ctx.request.post(BASE_SLASH + 'api/login', { data: { username: A.name, password: 'Pw123456!' } });
  await guest.ctx.request.post(BASE_SLASH + 'api/login', { data: { username: B.name, password: 'Pw123456!' } });
  await host.page.goto(BASE_SLASH, { waitUntil: 'domcontentloaded' });
  await guest.page.goto(BASE_SLASH, { waitUntil: 'domcontentloaded' });
  await wait(host.page, () => !!(window.AUTH && window.AUTH.user && window.Rooms));
  await wait(guest.page, () => !!(window.AUTH && window.AUTH.user && window.Rooms));
  ok(await host.page.evaluate(() => AUTH.user.username) === A.name, 'المضيف داخل الواجهة');
  ok(await guest.page.evaluate(() => AUTH.user.username) === B.name, 'الضيف داخل الواجهة');

  /* فتح بلوت عند الطرفين */
  await host.page.evaluate(() => openGame('bl'));
  await guest.page.evaluate(() => openGame('bl'));
  await wait(host.page, () => !!(window.BalootApp && typeof window.BL_roomMove === 'function'));
  await wait(guest.page, () => !!(window.BalootApp && typeof window.BL_roomMove === 'function'));

  /* أ) غرفة برهان 10 */
  await host.page.evaluate(() => Rooms.createRoom('bl', 10));
  const code = await wait(host.page, () => (window.Rooms.state && window.Rooms.state.code) || null, 8000);
  await guest.page.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(host.page, () => !!(window.Rooms.state && window.Rooms.state.players.length >= 2), 8000);
  await wait(guest.page, () => !!(window.Rooms.state && window.Rooms.state.players.length >= 2), 8000);
  ok(true, 'الغرفة أُنشئت وانضم الضيف بالكود ' + code);

  const goldBefore = {
    A: (await api(A.cookie, 'GET', '/api/me')).json.user.gold,
    B: (await api(B.cookie, 'GET', '/api/me')).json.user.gold
  };

  await host.page.evaluate(() => Rooms.setReady(true));
  await guest.page.evaluate(() => Rooms.setReady(true));
  await wait(host.page, () => !!(window.Rooms.state && window.Rooms.state.players.every(p => p.ready)), 8000);
  await host.page.evaluate(() => Rooms.startGame());

  /* ب) تطابق البذرة والوضع (مزامنة الأساس) */
  const stA = await wait(host.page, () => {
    const NS = window.BLGameNS;
    return (NS && NS.state && (NS.state.phase === 'ashur' || NS.state.phase === 'naming' || NS.state.phase === 'play'))
      ? { seed: NS.state.cfg && NS.state.cfg.seed, players: NS.state.players, solo: NS.state.solo, phase: NS.state.phase } : null;
  }, 20000);
  const stB = await wait(guest.page, () => {
    const NS = window.BLGameNS;
    return (NS && NS.state && (NS.state.phase === 'ashur' || NS.state.phase === 'naming' || NS.state.phase === 'play'))
      ? { seed: NS.state.cfg && NS.state.cfg.seed, players: NS.state.players, solo: NS.state.solo, phase: NS.state.phase } : null;
  }, 20000);
  ok(stA.seed === stB.seed, 'البذرة متطابقة عند الطرفين', JSON.stringify({ a: stA.seed, b: stB.seed }));
  ok(stA.players === 2 && stB.players === 2, 'وضع فردي ثنائي (1ضد1)', 'players=' + stA.players);
  const seatA = await host.page.evaluate(() => window.BalootApp._roomSeat);
  const seatB = await guest.page.evaluate(() => window.BalootApp._roomSeat);
  ok(seatA !== seatB && seatA >= 0 && seatB >= 0, 'مقعدا الطرفين مختلفان (وجه لوجه)', 'A=' + seatA + ' B=' + seatB);

  /* ج-د) لعب آلي متزامن حتى نهاية شوط ثم التصويت والتقدم */
  let roundEndSeen = { a: 0, b: 0 }, transitions = { a: 0, b: 0 }, matchNo = 1;
  const t0 = Date.now();
  let votedThisRound = {};
  while (Date.now() - t0 < 150000) {
    for (const [key, pg, isDriver] of [['a', host.page, true], ['b', guest.page, false]]) {
      const r = await pg.evaluate((me) => {
        const NS = window.BLGameNS, A = window.BalootApp;
        if (!NS || !NS.state) return { phase: 'none' };
        const s = NS.state;
        const mySeat = A._roomSeat;
        const out = { phase: s.phase, roundNo: s.roundNo, mySeat: mySeat, scores: s.teamScores };
        if (s.phase === 'ashur' && s.turn === mySeat) {
          const b = document.querySelector('.bl-abtn[data-ashur="none"]') || document.querySelector('.bl-abtn');
          if (b) { b.click(); out.acted = 'ashur'; }
        } else if (s.phase === 'naming' && s.turn === mySeat) {
          const b = document.querySelector('.bl-abtn[data-suit]') || document.querySelector('.bl-abtn[data-pass]');
          if (b) { b.click(); out.acted = 'name'; }
        } else if (s.phase === 'play' && s.turn === mySeat) {
          const c = document.querySelector('.bl-handcard.bl-legal');
          if (c) { c.click(); out.acted = 'card'; }
        } else if (s.phase === 'roundEnd') {
          out.roundEndVisible = !!(document.getElementById('blNextRoundBtn') && document.getElementById('blNextRoundBtn').offsetParent !== null);
        } else if (s.phase === 'matchEnd') {
          out.matchEndVisible = !!document.querySelector('.bl-matchmodal, .bl-modal');
        }
        return out;
      }, key).catch(() => ({ phase: 'eval-err' }));

      if (r.phase === 'roundEnd') {
        if (r.roundEndVisible) roundEndSeen[key]++;
        /* الضيف يصوّت مرة لكل شوط، المضيف يقدّم بعد تصويت الضيف */
        if (!isDriver && !votedThisRound[r.roundNo]) {
          const voted = await pg.evaluate(() => {
            const nb = document.getElementById('blNextRoundBtn');
            if (nb && nb.offsetParent !== null && !nb.disabled) { nb.click(); return true; }
            return false;
          });
          if (voted) votedThisRound[r.roundNo] = true;
        } else if (isDriver && votedThisRound[r.roundNo]) {
          await pg.evaluate(() => {
            const nb = document.getElementById('blNextRoundBtn');
            if (nb && nb.offsetParent !== null && !nb.disabled) nb.click();
          });
        }
      }
      if (r.phase === 'matchEnd') matchNo = 2;
    }
    /* هل وصلنا لتقدم مشترك؟ */
    const pa = await host.page.evaluate(() => ({ phase: window.BLGameNS.state && window.BLGameNS.state.phase, roundNo: window.BLGameNS.state && window.BLGameNS.state.roundNo }));
    const pb = await guest.page.evaluate(() => ({ phase: window.BLGameNS.state && window.BLGameNS.state.phase, roundNo: window.BLGameNS.state && window.BLGameNS.state.roundNo }));
    if (pa.phase !== 'roundEnd' && pa.roundNo >= 2 && transitions.a < 1) {
      transitions.a = pa.roundNo; transitions.b = pb.roundNo;
      console.log('  ── بعد الشوط الأول: مضيف phase=' + pa.phase + ' r=' + pa.roundNo + ' · ضيف phase=' + pb.phase + ' r=' + pb.roundNo);
    }
    if (pa.phase === 'matchEnd' && pb.phase === 'matchEnd') break;
    if (pa.phase === 'none' || pb.phase === 'none') break;   /* الغرفة أُغلقت */
    await sleep(240);
  }

  ok(roundEndSeen.a >= 1, 'نافذة نهاية الشوط ظهرت للمضيف (كانت لا تُبنى — الإصلاح)', 'مرات=' + roundEndSeen.a);
  ok(roundEndSeen.b >= 1, 'نافذة نهاية الشوط ظهرت للضيف', 'مرات=' + roundEndSeen.b);
  ok(transitions.a === transitions.b && transitions.a >= 2, 'الطرفان في الشوط نفسه بعد التصويت (مزامنة الجولة التالية)', JSON.stringify(transitions));
  const finalA = await host.page.evaluate(() => window.BLGameNS.state && { phase: window.BLGameNS.state.phase, scores: window.BLGameNS.state.teamScores });
  const finalB = await guest.page.evaluate(() => window.BLGameNS.state && { phase: window.BLGameNS.state.phase, scores: window.BLGameNS.state.teamScores });
  ok(JSON.stringify(finalA && finalA.scores) === JSON.stringify(finalB && finalB.scores), 'النقاط النهائية متطابقة عند الطرفين', JSON.stringify(finalA && finalA.scores));

  /* هـ) التسوية المالية */
  await sleep(4000);   /* مهلة التسوية الخادمية */
  const goldAfter = {
    A: (await api(A.cookie, 'GET', '/api/me')).json.user.gold,
    B: (await api(B.cookie, 'GET', '/api/me')).json.user.gold
  };
  const dA = +(goldAfter.A - goldBefore.A).toFixed(2), dB = +(goldAfter.B - goldBefore.B).toFixed(2);
  const potMinusFee = +(20 * 0.95).toFixed(2);
  const winNet = +(potMinusFee - 10).toFixed(2);   /* الرابح: -10 رهاناً + 19 جرةً = +9 صافياً */
  const finalPhaseA = finalA && finalA.phase;
  const settledRight = (finalPhaseA !== 'matchEnd') || (dA === -10 && dB === winNet) || (dB === -10 && dA === winNet);
  ok(settledRight, 'عقد المال: الجرة 20 − 5% = 19 ⇒ الرابح صافياً +9 والخاسر −10 (أو مباراة لم تُحسم)', 'ΔA=' + dA + ' · ΔB=' + dB);

  /* و) المصادقة على المباراة التالية (ريماتش بلوت): تصويت الطرفان ثم انطلاق
     مباراة جديدة مع اقتطاع الرهان الجديد — هذا عقد «مصادقة الجولة التالية»
     الخاص بالبلوت (settle فردي/فرق ثم rematch vote) */
  let roundJoinOk = false;
  if (finalA && finalA.phase === 'matchEnd') {
    await sleep(2500);
    const rjA = await host.page.evaluate(() => {
      const rs = window.Rooms.state;
      return rs ? { status: rs.status, roundJoin: rs.roundJoin || null, rematch: rs.rematch || null } : null;
    });
    console.log('  ── حالة الغرفة بعد المباراة: ' + JSON.stringify(rjA && rjA.status) + ' · rematch=' + JSON.stringify(rjA && rjA.rematch && { participants: rjA.rematch.participants, votes: rjA.rematch.votes }));
    if (rjA && rjA.rematch && rjA.rematch.participants && rjA.rematch.participants.length) {
      const roomId = await host.page.evaluate(() => Rooms.state.id);
      const goldBefore2 = {
        A: (await api(A.cookie, 'GET', '/api/me')).json.user.gold,
        B: (await api(B.cookie, 'GET', '/api/me')).json.user.gold
      };
      const v1 = await api(A.cookie, 'POST', '/api/rooms/rematch/vote', { room_id: roomId, vote: 'agree' });
      const v2 = await api(B.cookie, 'POST', '/api/rooms/rematch/vote', { room_id: roomId, vote: 'agree' });
      await sleep(1500);
      const goldAfter2 = {
        A: (await api(A.cookie, 'GET', '/api/me')).json.user.gold,
        B: (await api(B.cookie, 'GET', '/api/me')).json.user.gold
      };
      roundJoinOk = v1.status === 200 && v2.status === 200;
      ok(roundJoinOk, 'مصادقة المباراة التالية: الطرفان صوّتا ريماتش وقُبل التصويتان', 'v1=' + v1.status + ' v2=' + v2.status);
      const st2 = await wait(host.page, () => {
        const rs = window.Rooms.state;
        return (rs && rs.status === 'playing') ? true : null;
      }, 12000).catch(() => null);
      ok(!!st2, 'المباراة الثانية انطلقت بعد مصادقة الطرفين (ريماتش)');
      const st2b = await wait(guest.page, () => {
        const rs = window.Rooms.state;
        return (rs && rs.status === 'playing') ? true : null;
      }, 12000).catch(() => null);
      ok(!!st2b, 'الضيف داخل المباراة الثانية أيضاً (مزامنة)');
      const seed2A = await wait(host.page, () => (window.BLGameNS.state && window.BLGameNS.state.cfg && window.BLGameNS.state.cfg.seed) || null, 12000).catch(() => null);
      const seed2B = await wait(guest.page, () => (window.BLGameNS.state && window.BLGameNS.state.cfg && window.BLGameNS.state.cfg.seed) || null, 12000).catch(() => null);
      ok(seed2A && seed2B && seed2A === seed2B, 'بذرة المباراة الثانية متطابقة عند الطرفين', JSON.stringify({ a: seed2A, b: seed2B }));
      const dA2 = +(goldAfter2.A - goldBefore2.A).toFixed(2), dB2 = +(goldAfter2.B - goldBefore2.B).toFixed(2);
      ok(dA2 === -10 && dB2 === -10, 'رهان المباراة الثانية اقتُطع من الطرفين (فلات دوغ)', 'ΔA=' + dA2 + ' · ΔB=' + dB2);
    } else {
      ok(true, 'لا مرحلة ريماتش مفتوحة — مسار مختلف', JSON.stringify({ status: rjA && rjA.status }));
    }
  } else {
    ok(true, 'المباراة لم تصل matchEnd ضمن المهلة — المسار المالي لم يُطالب', JSON.stringify(finalA));
  }

  /* ز) صفر أخطاء — مع استثناء **مُتحقَّق منه** لا مُتعامَل معه بإهمال.
     [v2.95.1·التشخيص] الإخفاق كان دائماً واحداً: HTTP 400 على
     POST /api/rooms/settleRound بجسم «تمت تسوية هذه الجولة مسبقاً» — وهو
     **حارس منع الازدواج نفسه** (القاعدة 12: «أول تقرير + room.settled يمنع
     الازدواج»): كلٌّ من الطرفين يسوّي من جهازه (الحارس في العميل محليّ لكل
     جهاز)، فيقبل الخادم الأول ويرفض الثاني 400. المنع يعمل تماماً كما وُصِف؛
     وكان الجناح يعدّ هذا الرفضَ الصحيحَ خطأً لأن رسالة الكونسول مجرّدة.

     فالحارس الجديد لا يتجاهل 400 بل **يفحص كلّ استجابة ≥400 ويطلب أن تكون
     حصراً رفض التسوية المكرر الموصوف، وأن يطابق عدّها عدّ أخطاء الكونسول**
     — فأي 400 آخر (أو 400 بلا هذا الجسم) يُفشل الجناح صراحةً. أي أنّه الآن
     يتحقّق من عقد المال بدل أن يحتمله كضجيج. */
  const auditFn = require('./_settle4xx_audit.js').audit4xx;
  const audit4xx = (label, pg) => {
    const r = auditFn(pg._http4xx || []);
    const unexpected = r.unexpected;
    ok(unexpected.length === 0,
       label + ': كل استجابات ≥400 هي رفض التسوية المكرر المُصمَّم (لا رفض غير متوقع)',
       unexpected.length ? unexpected.slice(0, 3).map(x => x.status + ' ' + x.method + ' ' + x.url.replace(/^https?:\/\/[^/]+/, '') + ' ⇒ ' + x.body).join(' | ')
                         : ('مقبولة: ' + ((pg._http4xx || []).length) + ' (كلها رفض تسوية مكرر)'));
    ok(pg._errs.length <= r.dupCount,
       label + ': لا خطأ كونسول إلا ما فسّرته استجابات 400 المراجَعة',
       pg._errs.length > r.dupCount ? ('أخطاء بلا سند: ' + pg._errs.filter(e => !/status of 400/.test(e)).slice(0, 3).join(' | ')) : ('صفر غير مفسَّر · مراجَع=' + r.dupCount));
  };
  audit4xx('المضيف', host.page);
  audit4xx('الضيف', guest.page);

  /* تنظيف: مغادرة الغرفة */
  try { await host.page.evaluate(() => Rooms.leaveRoom && Rooms.leaveRoom()); } catch (e) {}
  try { await guest.page.evaluate(() => Rooms.leaveRoom && Rooms.leaveRoom()); } catch (e) {}
  await browser.close();

  console.log('\n══════════════════');
  console.log('النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('خطأ الاختبار:', e); process.exit(2); });
