/* ═══════════════════════════════════════════════════════════════════════
   [v2.75] اختبار نظام البث المباشر للتحكيم (Live Arbitration)
   ───────────────────────────────────────────────────────────────────────
   يغطي (خادمياً + متصفحان حقيقيان):
     A) REST: start-stream (توكن + idempotent + حراسة الأدوار والحالات)
        · قائمة الجلسات (أدمن حصراً) · نبض القلب وتنبيه الانقطاع
     B) الإشارات: ترحيل offer/answer/ice عبر SSE لطرفي الجلسة والأدمن
        + رفض الإشارات بلا توكن/بعد الحسم + سقف الحجم
     C) الحسم: أدمن يفوز لاعباً ⇒ إفراج خادمي عن الإيداعات (نواة التسوية
        نفسها: الرابح +الجرة−5% والخاسر لا شيء) · نزاع/إلغاء ⇒ استرداد
        كامل · لاعب عادي ممنوع من الحسم (403)
     D) واجهة: زر البث في مودال الغرفة أثناء الجولة حصراً · تبويب التحكيم
        عند الأدمن يعرض الجلسة · بث شاشة حقيقي (getDisplayMedia مع إذن
        مزيف) يصل لفيديو الأدمن عبر P2P فعلياً
   تشغيل:  QA_BASE=http://127.0.0.1:3971/ node tests/_v275_arbitration_test.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(l, c) { if (c === undefined || c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } }

(async () => {
  const browser = await PW.launchBrowser();
  const ts = Date.now() % 100000;

  async function setup(ctx, username) {
    await ctx.request.post(PW.BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
    await ctx.request.post(PW.BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERR: ' + String(e.message).slice(0, 110)));
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|404|net::ERR|favicon/i.test(t)) errs.push(t.slice(0, 110)); });
    page._errs = errs;
    await page.goto(PW.BASE, { waitUntil: 'domcontentloaded' });
    await PW.wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 20000);
    await page.waitForTimeout(800);
    return page;
  }
  /* تسجيل دخول أدمن قائم (qa_admin/password من _mkusers) */
  async function setupAdmin(ctx) {
    await ctx.request.post(PW.BASE + 'api/login', { data: { username: 'qa_admin', password: 'QaTest12345' } }).catch(() => {});
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERR: ' + String(e.message).slice(0, 110)));
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|404|net::ERR|favicon/i.test(t)) errs.push(t.slice(0, 110)); });
    page._errs = errs;
    await page.goto(PW.BASE, { waitUntil: 'domcontentloaded' });
    await PW.wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.role !== 'user'), 20000);
    await page.waitForTimeout(800);
    return page;
  }

  /* دالة قراءة الذهب من الخادم (المصدر الوحيد للحقيقة — الرصيد المحلي
     للمتصفح قد يتقادم لحظياً في مسارات الاسترداد) */
  function serverGold(page) {
    return page.evaluate(() => API.post('/api/sync', {}).then(r => (r.ok && r.data) ? r.data.gold : null));
  }

  /* ═══ إنشاء مباراة وجه لوجه (غرفة شطرنج — تسوية خادمية مضمونة) ═══ */
  const ctxA = await browser.newContext({ locale: 'ar-MA' });
  const ctxB = await browser.newContext({ locale: 'ar-MA' });
  const ctxAdm = await browser.newContext({ locale: 'ar-MA' });
  const A = await setup(ctxA, 'arbp1_' + ts);
  const B = await setup(ctxB, 'arbp2_' + ts);
  const ADM = await setupAdmin(ctxAdm);

  await A.evaluate(() => openGame('ch'));
  await A.evaluate(() => Rooms.createRoom('ch', { bet: 40, max_players: 2, game_opts: { timer: 90 } }));
  const code = await PW.wait(A, () => (Rooms.state && Rooms.state.code) ? Rooms.state.code : null, 9000);
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 9000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 9000);
  await A.evaluate(() => Rooms.startGame());
  await A.waitForTimeout(1800);
  const roomId = await A.evaluate(() => Rooms.state.id);
  const goldA0 = await A.evaluate(() => AUTH.user.gold);
  const goldB0 = await B.evaluate(() => AUTH.user.gold);
  console.log('── A) REST: start-stream والحراسة');
  ok('A1: الغرفة جارية (id=' + roomId + ')', !!(await A.evaluate(() => Rooms.state.status)) === true);

  /* start-stream: لاعب ⇒ توكن · idempotent · متفرج/أدمن مرفوضان */
  const s1 = await A.evaluate((rid) => API.post('/api/matches/' + rid + '/start-stream', {}).then(r => r.data || { nok: !r.ok }), roomId);
  const s2 = await A.evaluate((rid) => API.post('/api/matches/' + rid + '/start-stream', {}).then(r => r.data || { nok: !r.ok }), roomId);
  ok('A2: توكن بث صادر للاعب (ice_servers=' + ((s1.ice_servers || []).length) + ')', !!(s1 && s1.token && s1.token.length >= 16 && Array.isArray(s1.ice_servers) && s1.ice_servers.length));
  ok('A3: idempotent — التوكن نفسه عند الطلب مجدداً', !!(s2 && s2.token && s2.token === s1.token));
  const admStream = await ADM.evaluate((rid) => API.post('/api/matches/' + rid + '/start-stream', {}).then(r => ({ ok: r.ok, status: r.status, d: r.data })), roomId);
  ok('A4: الأدمن لا يفتح جلسة بث كلاعب (403)', admStream.ok === false && (admStream.status === 403 || (admStream.d && admStream.d.ok === false)));
  const badRoom = await A.evaluate(() => API.post('/api/matches/r999999/start-stream', {}).then(r => ({ ok: r.ok, status: r.status })));
  ok('A5: غرفة غير موجودة ⇒ 404', badRoom.ok === false && badRoom.status === 404);

  /* قائمة الجلسات: أدمن يراها · لاعب لا */
  const listAdm = await ADM.evaluate(() => API.get('/api/matches').then(r => ({ ok: r.ok, d: r.data })));
  const listPlayer = await B.evaluate(() => API.get('/api/matches').then(r => ({ ok: r.ok, status: r.status })));
  ok('A6: الأدمن يرى الجلسة النشطة (لاعباها=' + ((listAdm.d && listAdm.d.sessions && listAdm.d.sessions[0] && listAdm.d.sessions[0].players || []).length) + ')',
    !!(listAdm.ok && listAdm.d && listAdm.d.sessions && listAdm.d.sessions.some(s => s.room_id === roomId && s.players.length === 2)));
  ok('A7: اللاعب العادي لا يرى قائمة التحكيم (403)', listPlayer.ok === false && listPlayer.status === 403);

  /* نبض + انقطاع — كلا اللاعبين بتوكنه الخاص (start-stream خاصّ بكل لاعب) */
  const sB = await B.evaluate((rid) => API.post('/api/matches/' + rid + '/start-stream', {}).then(r => r.data || {}), roomId);
  ok('A8a: توكن مستقل لللاعب B', !!(sB && sB.token && sB.token !== s1.token));
  const hb = await B.evaluate((x) => API.post('/api/arb/heartbeat', { room_id: x.rid, token: x.tok, state: 'live' }).then(r => ({ ok: r.ok, d: r.data })), { rid: roomId, tok: sB.token });
  ok('A8: نبض اللاعب B مقبول (state=live)', !!(hb.ok && hb.d && hb.d.ok));
  const hbBad = await B.evaluate((x) => API.post('/api/arb/heartbeat', { room_id: x.rid, token: 'deadbeef', state: 'live' }).then(r => ({ ok: r.ok, status: r.status })), { rid: roomId });
  ok('A9: نبض بتوكن مزيف ⇒ 403', hbBad.ok === false && hbBad.status === 403);

  console.log('── B) الإشارات (ترحيل SSE)');
  /* ترحيل إشارة من اللاعب A تصل للأدمن عبر SSE — نرصد دون تمريرها
     للمعالج الحقيقي (الـSDP الاصطناعي يفشل setRemoteDescription فيلوث
     سجل الأخطاء — محاكاة استقبال فقط) */
  const admGot = { sig: null, sess: null };
  await ADM.evaluate(() => {
    window.__arbSeen = [];
    ARB_ADMIN.onEvent = function (n, d) { window.__arbSeen.push([n, d]); };
  });
  const sig = await A.evaluate((x) => API.post('/api/arb/signal', { room_id: x.rid, token: x.tok, kind: 'offer', payload: { sdp: 'v=0 fake-offer-sdp' } }).then(r => ({ ok: r.ok, d: r.data })), { rid: roomId, tok: s1.token });
  ok('B1: إرسال offer من اللاعب مقبول (relayed=' + ((sig.d && sig.d.relayed) || 0) + ')', !!(sig.ok && sig.d && sig.d.ok));
  await ADM.waitForTimeout(900);
  const seen = await ADM.evaluate(() => window.__arbSeen || []);
  const offerSeen = seen.filter(x => x[0] === 'arb:signal' && x[1] && x[1].kind === 'offer')[0];
  ok('B2: وصل العرض للأدمن عبر SSE (from=' + (offerSeen && offerSeen[1].from_name) + ')', !!(offerSeen && offerSeen[1].payload && offerSeen[1].payload.sdp === 'v=0 fake-offer-sdp'));
  /* إشارة بلا توكن ⇒ 403 */
  const sigBad = await A.evaluate((rid) => API.post('/api/arb/signal', { room_id: rid, kind: 'offer', payload: {} }).then(r => ({ ok: r.ok, status: r.status })), roomId);
  ok('B3: إشارة بلا توكن ⇒ 403', sigBad.ok === false && sigBad.status === 403);
  /* نوع مجهول ⇒ 400 */
  const sigKind = await A.evaluate((x) => API.post('/api/arb/signal', { room_id: x.rid, token: x.tok, kind: 'zzz', payload: {} }).then(r => ({ ok: r.ok, status: r.status })), { rid: roomId, tok: s1.token });
  ok('B4: نوع إشارة مجهول ⇒ 400', sigKind.ok === false && sigKind.status === 400);

  console.log('── C) الحسم (أدمن حصراً + إفراج الإيداعات)');
  /* لاعب يحاول الحسم ⇒ 403 */
  const resPlayer = await B.evaluate((x) => API.post('/api/matches/' + x + '/resolve', { status: 'completed', winner_id: 999 }).then(r => ({ ok: r.ok, status: r.status })), roomId);
  ok('C1: لاعب عادي لا يحسم (403)', resPlayer.ok === false && resPlayer.status === 403);
  /* أدمن يحسم بفائز غير موجود في الغرفة ⇒ 400 */
  const resBad = await ADM.evaluate((x) => API.post('/api/matches/' + x + '/resolve', { status: 'completed', winner_id: 999999 }).then(r => ({ ok: r.ok, status: r.status })), roomId);
  ok('C2: فائز خارج الغرفة ⇒ 400', resBad.ok === false && resBad.status === 400);

  /* أدمن يحسم للاعب A (صاحب order[0]) ⇒ جرة 80 − 5% (4) ⇒ 76 — القراءة
     الخادمية (المصدر الوحيد) */
  const uidA = await A.evaluate(() => AUTH.user.id);
  const uidB = await B.evaluate(() => AUTH.user.id);
  const resAdm = await ADM.evaluate((x) => API.post('/api/matches/' + x.rid + '/resolve', { status: 'completed', winner_id: x.winner }).then(r => ({ ok: r.ok, d: r.data })), { rid: roomId, winner: uidA });
  ok('C3: حسم الأدمن ناجح (status=completed)', !!(resAdm.ok && resAdm.d && resAdm.d.ok && resAdm.d.status === 'completed'));
  await A.waitForTimeout(1200);
  const goldA1 = await serverGold(A);
  const goldB1 = await serverGold(B);
  /* رهان 40 لكل طرف اقتطع عند البدء قبل اللقطات ⇒ الرابح +76 (جرة 80 − رسم 4) والخاسر بلا تغيير */
  ok('C4: الرابح استلم الجرة − 5% (' + goldA0 + ' → ' + goldA1 + ')', goldA1 != null && Math.abs(goldA1 - (goldA0 + 76)) < 0.001);
  ok('C5: الخاسر لا يستلم شيئاً (' + goldB0 + ' → ' + goldB1 + ')', goldB1 != null && goldB1 === goldB0);
  /* حسم ثانٍ ⇒ لا ازدواج مال: إما رفض (الغرفة عادت انتظاراً بالتصويت)
     أو already — والثابت الذهبي: رصيد الرابح لم يزد ثانية */
  const goldA1b = await serverGold(A);
  const resAgain = await ADM.evaluate((x) => API.post('/api/matches/' + x + '/resolve', { status: 'completed', winner_id: x }).then(r => r.data), uidB);
  await A.waitForTimeout(1000);
  const goldA1c = await serverGold(A);
  const noDouble = (goldA1c === goldA1b);
  const rejected = !!(resAgain && resAgain.ok === false) || !!(resAgain && resAgain.settle && resAgain.settle.already);
  ok('C6: حسم ثانٍ لا يكرر المال (' + (rejected ? 'مرفوض/already' : 'مقبول!') + ' — ' + goldA1b + ' → ' + goldA1c + ')', noDouble && rejected);

  console.log('── D) الإلغاء/النزاع + الواجهة');
  /* غرفة ثانية: نزاع ⇒ استرداد كامل */
  await A.evaluate(() => { Rooms.leaveRoom(); });
  await B.evaluate(() => { Rooms.leaveRoom(); });
  await A.waitForTimeout(600);
  await A.evaluate(() => { closeGamePage(); });
  await B.evaluate(() => { closeGamePage(); });
  await A.waitForTimeout(400);
  await A.evaluate(() => openGame('ch'));
  await A.evaluate(() => Rooms.createRoom('ch', { bet: 30, max_players: 2, game_opts: { timer: 90 } }));
  const code2 = await PW.wait(A, () => (Rooms.state && Rooms.state.code) ? Rooms.state.code : null, 9000);
  await B.evaluate((c) => Rooms.joinRoom(c), code2);
  await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 9000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 9000);
  await A.evaluate(() => Rooms.startGame());
  await A.waitForTimeout(1600);
  const roomId2 = await A.evaluate(() => Rooms.state.id);
  const g2A = await A.evaluate(() => AUTH.user.gold);
  const g2B = await B.evaluate(() => AUTH.user.gold);
  /* زر البث ظاهر في المودال أثناء الجولة */
  await A.evaluate(() => Rooms.openModal());
  await A.waitForTimeout(400);
  const arbBtn = await A.evaluate(() => !!document.getElementById('arbBox'));
  ok('D1: صندوق بث التحكيم ظاهر في مودال الغرفة أثناء الجولة', arbBtn === true);
  /* نزاع: أدمن ⇒ استرداد للجميع — قراءة خادمية */
  const resDis = await ADM.evaluate((x) => API.post('/api/matches/' + x + '/resolve', { status: 'disputed' }).then(r => r.data), roomId2);
  await A.waitForTimeout(1400);
  const g2A2 = await serverGold(A);
  const g2B2 = await serverGold(B);
  ok('D2: النزاع ⇒ استرداد كامل للطرفين (A: ' + g2A + '→' + g2A2 + ' · B: ' + g2B + '→' + g2B2 + ')',
    g2A2 != null && g2B2 != null && Math.abs(g2A2 - (g2A + 30)) < 0.001 && Math.abs(g2B2 - (g2B + 30)) < 0.001);
  /* D2b: دفعة المحفظة الفورية حدّثت رصيد المتصفح أيضاً (لا انتظار مزامنة) */
  await A.waitForTimeout(600);
  const g2AUi = await A.evaluate(() => AUTH.user.gold);
  ok('D2b: رصيد متصفح اللاعب تحدّث فورياً بعد الاسترداد (' + g2AUi + ')', g2AUi === g2A2);

  /* D3: بث شاشة حقيقي P2P — getDisplayMedia بإذن مزيف يصل لفيديو الأدمن */
  console.log('── E) بث شاشة كامل (P2P حقيقي → فيديو الأدمن)');
  {
    /* ملاحظة بيئة: getDisplayMedia في كروميوم بلا واجهة يفشل
       (NotReadableError — لا شاشة حقيقية) ⇒ نستبدل مصدر الالتقاط بمجرى
       تركيبي من Canvas (مسار WebRTC كله حقيقي: عرض/جواب/ICE/مسار/فيديو) —
       على الأجهزة الحقيقية يستعمل اللاعب زر المشاركة وشاشته الفعلية */
    await A.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d');
      let frame = 0;
      const draw = () => {
        frame++;
        ctx.fillStyle = '#0b1526'; ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = '#F5C518'; ctx.font = 'bold 44px sans-serif';
        ctx.fillText('ARBITRATION LIVE', 130, 170);
        ctx.fillStyle = '#fff'; ctx.font = '30px sans-serif';
        ctx.fillText('frame ' + frame, 250, 230);
      };
      draw();
      setInterval(draw, 250);
      const fake = canvas.captureStream(10);
      navigator.mediaDevices.getDisplayMedia = () => Promise.resolve(fake);
    });
    /* غرفة ثالثة */
    await A.evaluate(() => { Rooms.leaveRoom(); });
    await B.evaluate(() => { Rooms.leaveRoom(); });
    await A.waitForTimeout(500);
    await A.evaluate(() => openGame('ch'));
    await A.evaluate(() => Rooms.createRoom('ch', { bet: 20, max_players: 2, game_opts: { timer: 90 } }));
    const code3 = await PW.wait(A, () => (Rooms.state && Rooms.state.code) ? Rooms.state.code : null, 9000);
    await B.evaluate((c) => Rooms.joinRoom(c), code3);
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 9000);
    await A.evaluate(() => Rooms.setReady(true));
    await B.evaluate(() => Rooms.setReady(true));
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 9000);
    await A.evaluate(() => Rooms.startGame());
    await A.waitForTimeout(1500);

    /* تبويب التحكيم عند الأدمن — واسترجاع المعالج الحقيقي (B2 عطّله للرصد) */
    await ADM.evaluate(() => { delete ARB_ADMIN.onEvent; });
    await ADM.reload({ waitUntil: 'domcontentloaded' });
    await PW.wait(ADM, () => !!(typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.role !== 'user' && typeof Rooms !== 'undefined'), 20000);
    await ADM.waitForTimeout(900);
    await ADM.evaluate(() => { adminTab('arb'); });
    await ADM.waitForTimeout(700);
    const tabOk = await ADM.evaluate(() => !!document.querySelector('#adminContent'));
    ok('E1: تبويب التحكيم يفتح عند الأدمن', tabOk === true);

    /* اللاعب A يبدأ بث شاشته (chromium: إذن مزيف + اختيار تلقائي للشاشة) */
    const streamRes = await A.evaluate(async () => {
      try {
        await ARB.startShare();
        return { started: true, state: ARB.state() };
      } catch (e) { return { started: false, err: String(e) }; }
    }).catch(e => ({ started: false, err: String(e) }));
    ok('E2: ARB.startShare انطلق (state=' + (streamRes.state || streamRes.err) + ')', streamRes.started === true);

    /* انتظر وصول الفيديو عند الأدمن (عرض P2P + مسار فيديو حي) */
    const vidLive = await PW.wait(ADM, () => {
      const vids = Array.from(document.querySelectorAll('.arb-vbox video'));
      const withStream = vids.filter(v => v.srcObject && v.videoTracks > 0);
      for (const v of vids) {
        if (v.srcObject) {
          const tracks = v.srcObject.getVideoTracks();
          if (tracks.length && tracks[0].readyState === 'live') return 'live';
        }
      }
      return null;
    }, 15000);
    ok('E3: بث الشاشة وصل لفيديو الأدمن عبر WebRTC P2P', vidLive === 'live');

    /* حالة اللاعب صارت live (مؤشر الاتصال) */
    await A.waitForTimeout(600);
    const pState = await A.evaluate(() => ARB.state());
    ok('E4: مؤشر حالة اللاعب: مباشر (' + pState + ')', pState === 'live');

    /* إيقاف البث ⇒ bye يصل والأدمن يفقد المسار */
    await A.evaluate(() => ARB.stopShare());
    const gone = await PW.wait(ADM, () => {
      const vids = Array.from(document.querySelectorAll('.arb-vbox video'));
      const live = vids.filter(v => v.srcObject && v.srcObject.getVideoTracks().some(t => t.readyState === 'live'));
      return live.length === 0 ? 'stopped' : null;
    }, 8000);
    ok('E5: إيقاف البث قطع الفيديو عند الأدمن (bye)', gone === 'stopped');

    /* E6: زر الحسم في الواجهة — أدمن يحسم من اللوحة (قراءة خادمية) */
    const roomId3 = await A.evaluate(() => Rooms.state ? Rooms.state.id : null);
    const winnerId = await B.evaluate(() => AUTH.user.id);
    const g3B = await serverGold(B);
    const uiRes = await ADM.evaluate((x) => ARB_ADMIN.resolve(x.rid, x.w).then((r) => JSON.stringify(r)).catch((e) => 'fail:' + String(e).slice(0, 80)), { rid: roomId3, w: winnerId });
    await B.waitForTimeout(1400);
    const g3B2 = await serverGold(B);
    const room3state = await A.evaluate(() => Rooms.state ? { s: Rooms.state.status, settled: Rooms.state.settled } : null);
    ok('E6: زر «تأكيد الفوز» من لوحة الأدمن يوزع الأرباح (' + g3B + ' → ' + g3B2 + ' · رد: ' + String(uiRes).slice(0, 90) + ' · غرفة: ' + JSON.stringify(room3state) + ')', g3B2 != null && Math.abs(g3B2 - (g3B + 38)) < 0.001);
  }

  ok('F1: صفر أخطاء متصفح (اللاعبان)', A._errs.length === 0 && B._errs.length === 0);
  if (A._errs.length || B._errs.length) console.log('   A:', A._errs.slice(0, 4), ' B:', B._errs.slice(0, 4));

  await ctxA.close(); await ctxB.close(); await ctxAdm.close();
  await browser.close();
  console.log('\n═══ [v2.75 تحكيم] ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
