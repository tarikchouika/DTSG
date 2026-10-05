/* ═══════════════════════════════════════════════════════════════════════════
   [v2.83] e2e — الغرفة المحلية (LocalMP): لعب وجهاً لوجه عبر WebRTC على LAN
   ───────────────────────────────────────────────────────────────────────────
   متصفحان حقيقيان على خادم QA، اتصال RTCPeerConnection فعلي بينهما (مرشحو
   المضيف على 127.0.0.1 — نفس آلية LAN الحقيقية)، مسح الرموز يُحاكى بمسار
   النسخ/اللصق (نفس البصمة المضغوطة):
     أ) المضيف يفتح غرفة بلوت محلية → رمز جلسة (بصمة مضغوطة ≤ QR)
     ب) الضيف ينضم بالرمز → رمز إجابة → المضيف يتمّ الاقتران ⇒ DataChannel مفتوح
     ج) اللوبي القياسي: جاهزية الطرفين عبر واجهة Rooms نفسها (بلا تعديل rooms.js)
     د) بدء اللعب ⇒ نفس البذرة عند الطرفين (init عبر الترحيل) ⇒ لعب شوط كامل
     هـ) نهاية الشوط: نافذة النتيجة عند الطرفين + تصويت/تقدم متزامن للشوط التالي
     و) هوية محلية بلا تسجيل دخول (وضع بلا إنترنت) تعمل
     ز) صفر أخطاء كونسول عند الطرفين
   تشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_v283_localmp_e2e_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
const SB = require('./_safe_base.js');
const BASE = SB.BASE, BASE_SLASH = SB.BASE_SLASH;
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
async function wait(page, fn, timeout) {
  timeout = timeout || 15000;
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn); if (r) return r; } catch (e) { lastErr = e; }
    await page.waitForTimeout(200);
  }
  throw new Error('wait timeout' + (lastErr ? ' (' + lastErr.message + ')' : ''));
}

(async () => {
  const A = await ensureUser('lmp_host_v283', 'Pw123456!');
  const B = await ensureUser('lmp_guest_v283', 'Pw123456!');
  ok(!!A.cookie && !!B.cookie, 'الحسابان جاهزان');

  /* [v2.83] تعطيل حجب عناوين LAN بأسماء mDNS في كروم الاختبار — كي نختبر
     مسار IPv4 الصريح نفسه الذي يعمل في WebView للأندرويد (الشبكات الحقيقية
     تقبل مساري IPv4 وmDNS معاً — انظر lanCandidates) */
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const mkPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 820 } });
    const page = await ctx.newPage();
    page._errs = [];
    page.on('pageerror', e => page._errs.push('[pageerror] ' + e.message));
    page.on('console', m => {
      /* ضجيج الشبكة (فشل موارد خادم 401/شبكة) ليس خطأ JS — يُرشَّح حصراً هنا */
      if (m.type() === 'error' && !/^Failed to load resource/i.test(m.text())) page._errs.push('[console] ' + m.text());
    });
    return { ctx, page };
  };
  const host = await mkPage();
  const guest = await mkPage();

  await host.ctx.request.post(BASE_SLASH + 'api/login', { data: { username: A.name, password: 'Pw123456!' } });
  await host.page.goto(BASE_SLASH, { waitUntil: 'domcontentloaded' });
  await wait(host.page, () => !!(window.AUTH && window.AUTH.user && window.Rooms && window.LocalMP));

  /* الضيف: بلا تسجيل دخول إطلاقاً — وضع بلا إنترنت بهوية محلية (برومبت مُحاكى) */
  guest.page.on('dialog', d => d.accept('GuestPhone'));
  await guest.page.goto(BASE_SLASH, { waitUntil: 'domcontentloaded' });
  await wait(guest.page, () => !!(window.Rooms && window.LocalMP));
  ok(await guest.page.evaluate(() => !AUTH.user), 'الضيف بلا جلسة خادم (وضع بلا إنترنت)');

  /* أ-ب) الاقتران: المضيف يفتح، الضيف ينضم، المضيف يتمّ */
  await host.page.evaluate(() => LocalMP.hostRoom('bl'));
  const offerCode = await wait(host.page, () => {
    var L = window.LocalMP, s = L.state();
    return (s && s.pendingPair && s.pendingPair.offerCode) || null;
  }, 12000);
  ok(offerCode && offerCode.indexOf('L1.') === 0, 'رمز جلسة المضيف مضغوط (L1.*)', 'len=' + (offerCode || '').length);
  ok((offerCode || '').length <= 420, 'البصمة بحجم QR (≤420 حرفاً — QRMini v10-L يسع 271 بايت)', 'len=' + (offerCode || '').length);

  const guestJoin = await guest.page.evaluate((code) => LocalMP.joinByCode(code), offerCode);
  const answerCode = await wait(guest.page, () => {
    var L = window.LocalMP, s = L.state();
    return (s && s.guestAnswerCode) || null;
  }, 12000);
  ok(!!answerCode, 'رمز إجابة الضيف صدر', 'len=' + (answerCode || '').length);

  await host.page.evaluate((code) => LocalMP.acceptGuest(code), answerCode);
  const hostPeers = await wait(host.page, () => {
    var s = window.LocalMP.state();
    return s.peers.length >= 1 ? s.peers.length : null;
  }, 15000);
  ok(hostPeers === 1, 'المضيف رأى اتصال الضيف (DataChannel مفتوح)', 'peers=' + hostPeers);

  /* الضيف عيّن اسمه عبر الهوية المحلية (برومبت GuestPhone) */
  const guestName = await guest.page.evaluate(() => AUTH.user && AUTH.user.username);
  ok(guestName === 'GuestPhone', 'هوية محلية للضيف بلا إنترنت (GuestPhone)', 'name=' + guestName);
  ok(await guest.page.evaluate(() => AUTH.user.id < 0), 'معرّف الهوية المحلية سالب (لا تصادم مع الخادم)');

  /* الغرفة عند الطرفين */
  await sleep(1200);
  const roomA = await host.page.evaluate(() => Rooms.state && { id: Rooms.state.id, players: Rooms.state.players.length, gid: Rooms.state.game_id });
  const roomB = await guest.page.evaluate(() => Rooms.state && { id: Rooms.state.id, players: Rooms.state.players.length, gid: Rooms.state.game_id });
  ok(roomA && roomB && roomA.id === roomB.id, 'الغرفة نفسها عند الطرفين (id محلي)', JSON.stringify({ a: roomA && roomA.id, b: roomB && roomB.id }));
  ok(roomA && roomA.players === 2 && roomB.players === 2, 'اللاعبان في اللوبي القياسي (لا بنية جديدة!)', 'players=' + (roomA && roomA.players));
  ok(roomA && roomA.gid === 'bl' && roomB.gid === 'bl', 'لعبة الغرفة بلوت عند الطرفين');

  /* ج) الجاهزية عبر Rooms.setReady نفسها — المسار المُغلَّف */
  await host.page.evaluate(() => Rooms.setReady(true));
  await guest.page.evaluate(() => Rooms.setReady(true));
  const bothReady = await wait(host.page, () => {
    var st = window.Rooms.state;
    return (st && st.players.length === 2 && st.players.every(function (p) { return p.ready; })) ? true : null;
  }, 8000);
  ok(!!bothReady, 'جاهزية الطرفين عبر Rooms.setReady (التغليف يعمل)');
  const readyAtGuest = await wait(guest.page, () => {
    var st = window.Rooms.state;
    return (st && st.players.every(function (p) { return p.ready; })) ? true : null;
  }, 8000);
  ok(!!readyAtGuest, 'الضيف رأى جاهزية المضيف (بثّ الغرفة المرحّل)');

  /* د) البدء: نفس البذرة عند الطرفين */
  await host.page.evaluate(() => LocalMP.startGame());
  const stA = await wait(host.page, () => {
    const NS = window.BLGameNS;
    return (NS && NS.state && ['ashur', 'naming', 'play'].includes(NS.state.phase))
      ? { seed: NS.state.cfg && NS.state.cfg.seed, phase: NS.state.phase, players: NS.state.players } : null;
  }, 20000);
  const stB = await wait(guest.page, () => {
    const NS = window.BLGameNS;
    return (NS && NS.state && ['ashur', 'naming', 'play'].includes(NS.state.phase))
      ? { seed: NS.state.cfg && NS.state.cfg.seed, phase: NS.state.phase, players: NS.state.players } : null;
  }, 20000);
  ok(stA && stB && stA.seed === stB.seed, 'نفس البذرة عند الطرفين (توزيع متطابق)', JSON.stringify({ a: stA && stA.seed, b: stB && stB.seed }));
  const seatA = await host.page.evaluate(() => window.BalootApp._roomSeat);
  const seatB = await guest.page.evaluate(() => window.BalootApp._roomSeat);
  ok(seatA !== seatB && seatA >= 0 && seatB >= 0, 'مقاعد مختلفة وجهًا لوجه', 'A=' + seatA + ' B=' + seatB);

  /* هـ) لعب شوط كامل + تصويت متزامن للشوط التالي */
  let roundEnds = { a: 0, b: 0 }, transitions = { a: 0, b: 0 };
  let voted = {};
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    for (const [key, pg] of [['a', host.page], ['b', guest.page]]) {
      const r = await pg.evaluate(() => {
        const NS = window.BLGameNS, A = window.BalootApp;
        if (!NS || !NS.state) return { phase: 'none' };
        const s = NS.state;
        const my = A._roomSeat;
        const out = { phase: s.phase, roundNo: s.roundNo };
        if (s.phase === 'ashur' && s.turn === my) {
          const b = document.querySelector('.bl-abtn[data-ashur="none"]') || document.querySelector('.bl-abtn');
          if (b) b.click();
        } else if (s.phase === 'naming' && s.turn === my) {
          const b = document.querySelector('.bl-abtn[data-suit]') || document.querySelector('.bl-abtn[data-pass]');
          if (b) b.click();
        } else if (s.phase === 'play' && s.turn === my) {
          const c = document.querySelector('.bl-handcard.bl-legal');
          if (c) c.click();
        } else if (s.phase === 'roundEnd') {
          out.roundEndVisible = !!(document.getElementById('blNextRoundBtn') && document.getElementById('blNextRoundBtn').offsetParent !== null);
        }
        return out;
      }).catch(() => ({ phase: 'eval-err' }));
      if (r.phase === 'roundEnd') {
        if (r.roundEndVisible) roundEnds[key]++;
        if (key === 'b' && !voted[r.roundNo]) {
          const v = await pg.evaluate(() => {
            const nb = document.getElementById('blNextRoundBtn');
            if (nb && nb.offsetParent !== null && !nb.disabled) { nb.click(); return true; }
            return false;
          });
          if (v) voted[r.roundNo] = true;
        } else if (key === 'a' && voted[r.roundNo]) {
          await pg.evaluate(() => {
            const nb = document.getElementById('blNextRoundBtn');
            if (nb && nb.offsetParent !== null && !nb.disabled) nb.click();
          });
        }
      }
    }
    const pa = await host.page.evaluate(() => window.BLGameNS.state && ({ phase: window.BLGameNS.state.phase, r: window.BLGameNS.state.roundNo }));
    const pb = await guest.page.evaluate(() => window.BLGameNS.state && ({ phase: window.BLGameNS.state.phase, r: window.BLGameNS.state.roundNo }));
    if (pa.phase !== 'roundEnd' && pa.r >= 2 && !transitions.a) {
      transitions.a = pa.r; transitions.b = pb.r;
      console.log('  ── بعد الشوط الأول (محلي): مضيف ' + JSON.stringify(pa) + ' · ضيف ' + JSON.stringify(pb));
    }
    if (pa.phase === 'matchEnd' && pb.phase === 'matchEnd') break;
    if (pa.phase === 'none' && pb.phase === 'none') break;
    await sleep(240);
  }
  ok(roundEnds.a >= 1 && roundEnds.b >= 1, 'نافذة نهاية الشوط عند الطرفين عبر الترحيل المحلي', JSON.stringify(roundEnds));
  ok(transitions.a === transitions.b && transitions.a >= 2, 'انتقال متزامن للشوط التالي عبر P2P', JSON.stringify(transitions));
  const finA = await host.page.evaluate(() => window.BLGameNS.state && { phase: window.BLGameNS.state.phase, scores: window.BLGameNS.state.teamScores });
  const finB = await guest.page.evaluate(() => window.BLGameNS.state && { phase: window.BLGameNS.state.phase, scores: window.BLGameNS.state.teamScores });
  ok(JSON.stringify(finA && finA.scores) === JSON.stringify(finB && finB.scores), 'النقاط متطابقة عند الطرفين', JSON.stringify(finA && finA.scores));

  /* و) الأدوار حية: المضيف مضيف والضيف ليس */
  const roles = {
    host: await host.page.evaluate(() => LocalMP.isHost()),
    guest: await guest.page.evaluate(() => LocalMP.isHost())
  };
  ok(roles.host === true && roles.guest === false, 'الأدوار صحيحة (مضيف/ضيف)');

  /* ز) صفر أخطاء + التفكيك النظيف */
  ok(host.page._errs.length === 0, 'صفر أخطاء كونسول عند المضيف', host.page._errs.slice(0, 4).join(' | '));
  ok(guest.page._errs.length === 0, 'صفر أخطاء كونسول عند الضيف', guest.page._errs.slice(0, 4).join(' | '));

  await host.page.evaluate(() => LocalMP.leaveRoom());
  await sleep(800);
  const guestRoomGone = await guest.page.evaluate(() => !Rooms.state || !Rooms.state.id);
  const hostRoomGone = await host.page.evaluate(() => !Rooms.state || !Rooms.state.id);
  ok(hostRoomGone && guestRoomGone, 'المغادرة تبثّ bye وتفكّ الغرفة عند الطرفين');
  const persisted = await host.page.evaluate(() => { try { return localStorage.getItem('rc_active_room'); } catch (e) { return null; } });
  ok(!persisted, 'لا غرفة محلية متبقية في التخزين بعد التفكيك');

  await browser.close();
  console.log('\n══════════════════');
  console.log('النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('خطأ الاختبار:', e); process.exit(2); });
