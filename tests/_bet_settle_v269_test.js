/* ═════════════════════════════════════════════════════════════════════
   [v2.69] اختبارات تسوية الرهان والمغادرة واللاعب الآلي — بتوجيه المالك
     أ) [اقتطاع] البدء يقتطع من كل لاعب + يسجّل معاملة bet في transactions
     ب) [ثنائي·مغادرة=خسارة] مغادرة الضيف منتصف الجولة ⇒ تسوية فورية
        للمالك (الجرة كاملة بعد الرسم) + لا استرداد للمغادر + بث room:leave
     ج) [ثبات المقاعد] المغادرة لا تغيّر order (جذر انزياح w0/w3 القديم)
     د) [تسوية آلية] الضيف (غير المالك) يسوّي ⇒ مقبول؛ التكرار ⇒ 400؛
        المتفرج ⇒ 403
     هـ) [متعدد·مغادرة] أونو 3: المغادر يُوسم isBot+leftRound ويبقى في
        order وإيداعه مصهور في الجرة — والسائق يشغّل مقعده آلياً
     و) [فاز مقعد المغادر] الباقون يستردون + يقتسمون مصادرته؛ المغادر لا
        يستلم قرشاً حتى لو «فاز» مقعده الآلي
     ز) [فرق] مغادر في الفريق الفائز ⇒ زميله البشري يأخذ الصافي كله
        وفريق فائز كله مغادر ⇒ الفريق البشري الآخر يفوز
     ح) [تعادل مع مغادر] الباقون يستردون + يقتسمون مصادرة المغادر
     ط) [أشباح] المنظّف يوسم isBot بلا حذف/استرداد + العودة تستعيد المقعد
     ي) [ريماش] الآليون يُسقطون من التصويت
   تشغيل: PORT=3000 · DM_TEST_MODE=1 · DTSG_GHOST_GRACE_MS=1
          node tests/_bet_settle_v269_test.js
   ═════════════════════════════════════════════════════════════════════ */
'use strict';
/* [v2.69.1] عنوان آمن: يحترم QA_BASE ويرفض الكتابة على خادم المنصة الحيّ */
const BASE = require('./_safe_base.js').BASE;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const FEE = 0.05;

async function req(method, path, body, cookie) {
  const r = await fetch(BASE + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const setCookie = r.headers.get('set-cookie');
  return { status: r.status, json: await r.json().catch(() => null), cookie: setCookie ? setCookie.split(';')[0] : cookie };
}
const newUser = async (u) => {
  const r = await req('POST', '/api/register', { username: u, password: 'pw123456' });
  return { name: u, cookie: r.cookie, id: r.json && r.json.user && r.json.user.id };
};
async function goldOf(p) {
  const r = await req('GET', '/api/me', null, p.cookie);
  return r.json && r.json.user ? r.json.user.gold : null;
}
function sseListener(cookie, sink) {
  const ctl = new AbortController();
  (async () => {
    const r = await fetch(BASE + '/api/live', { headers: { Cookie: cookie }, signal: ctl.signal });
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const ev = /^event: (.+)$/m.exec(chunk), dt = /^data: (.+)$/m.exec(chunk);
        if (ev && dt) { try { sink.push({ event: ev[1], data: JSON.parse(dt[1]) }); } catch (e) {} }
      }
    }
  })().catch(() => {});
  return ctl;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.011 : tol);

(async function main() {
  const tag = Date.now().toString(36);

  /* ═══ أ) الاقتطاع عند البدء + سجل المعاملات ═══ */
  console.log('── [أ] الاقتطاع عند البدء يُسجَّل ولا يضيع ──');
  {
    const A = await newUser('m69a_' + tag), B = await newUser('m69b_' + tag);
    const gA0 = await goldOf(A), gB0 = await goldOf(B);
    const cr = await req('POST', '/api/rooms', { game_id: 'ch', max_players: 2, bet: 10 }, A.cookie);
    const rid = cr.json.room.id;
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, B.cookie);
    const st = await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    ok(st.status === 200 && st.json.room.status === 'playing', 'البدء ينجح ويحوّل الغرفة إلى playing');
    const gA1 = await goldOf(A), gB1 = await goldOf(B);
    ok(near(gA0 - gA1, 10) && near(gB0 - gB1, 10), 'الرهان اقتُطع من الطرفين عند البدء (10+10)');
    const txA = await req('GET', '/api/transfers', null, A.cookie);
    const betRow = txA.json && txA.json.transfers && txA.json.transfers.some(t => t.type === 'bet' && near(t.amount, 10));
    ok(!!betRow, 'معاملة bet مسجَّلة في سجل معاملات المستخدم (كانت الغرف بلا سجل مالي)');
    /* تنظيف: إنهاء الجولة واسترداد الكل — لا أثر على الأقسام التالية */
    await req('POST', '/api/rooms/endBet', { room_id: rid }, A.cookie);
  }

  /* ═══ ب) ثنائي: مغادرة = خسارة فورية للخصم الباقي ═══ */
  console.log('── [ب] ثنائي: مغادرة صريحة منتصف الجولة = تسوية فورية للباقي ──');
  {
    const A = await newUser('m69c_' + tag), B = await newUser('m69d_' + tag);
    const gA0 = await goldOf(A), gB0 = await goldOf(B);
    const cr = await req('POST', '/api/rooms', { game_id: 'dm', max_players: 2, bet: 10 }, A.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, B.cookie);
    await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    const sinkA = [];
    const sseA = sseListener(A.cookie, sinkA);
    await sleep(400);
    const lv = await req('POST', '/api/rooms/leave', { room_id: rid }, B.cookie);
    await sleep(400);
    /* جسم ردّ المغادرة يحمل تسوية الجولة الثنائية كاملة */
    ok(lv.status === 200 && lv.json && lv.json.ok === true && lv.json.result === 'w0', 'مغادرة الضيف ⇒ تسوية فورية w0 (المالك الباقي رابح)');
    ok(lv.json && near(lv.json.payout, 20 - 10 * FEE), 'الرابح يتسلم الجرة كاملة بعد الرسم (payout=19.5)');
    ok(lv.json && near(lv.json.forfeited, 10), 'إيداع المغادر مصهور في الجرة (forfeited=10)');
    const gA1 = await goldOf(A), gB1 = await goldOf(B);
    ok(near(gA1 - gA0, 20 - 10 * FEE - 10), 'صافي رصيد المالك +9.5 (دفع 10 · استلم 19.5)');
    ok(near(gB0 - gB1, 10), 'المغادر خسر رهانه كاملاً (10) — لا استرداد');
    ok(sinkA.some(e => e.event === 'room:leave' && e.data && e.data.lost === true), 'بث room:leave للباقين (علامة الخسارة)');
    ok(sinkA.some(e => e.event === 'room:settle' && e.data && e.data.result === 'w0'), 'بث room:settle للباقين');
    const txB = await req('GET', '/api/transfers', null, B.cookie);
    const lossRow = txB.json && txB.json.transfers && txB.json.transfers.some(t => t.type === 'bet' && near(t.amount, 10) && /مغادرة/.test(t.note || ''));
    ok(!!lossRow, 'خسارة المغادر مسجَّلة (bet · «خسارة بمغادرة الجولة»)');
    sseA.abort();
  }

  /* ═══ ج) ثبات المقاعد: المغادرة لا تغيّر order ═══ */
  console.log('── [ج] ثبات order أثناء الجولة (جذر انزياح المقاعد) ──');
  {
    const A = await newUser('m69e_' + tag), B = await newUser('m69f_' + tag), C = await newUser('m69g_' + tag);
    const cr = await req('POST', '/api/rooms', { game_id: 'un', max_players: 3, bet: 10 }, A.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, B.cookie);
    await req('POST', '/api/rooms/join', { code }, C.cookie);
    const st = await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    const orderBefore = st.json.room.order.slice();
    ok(orderBefore.length === 3, 'order ثلاثي عند البدء');
    const rm = await req('POST', '/api/rooms/leave', { room_id: rid }, B.cookie);
    ok(rm.status === 200 && rm.json && rm.json.ok === true && !rm.json.result, 'مغادرة الوسط من ثلاثية: لا تسوية فورية (الآلي يكمل)');
    /* الغرفة حية: ready يعيد الغرفة كاملة — وorder كما كان بلا انزياح */
    const rd = await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, A.cookie);
    ok(rd.status === 200 && rd.json && rd.json.room && rd.json.room.id === rid, 'الغرفة حية بعد مغادرة واحد من ثلاثة');
    const orderAfter = rd.json.room ? rd.json.room.order : [];
    ok(orderAfter.length === 3 && String(orderAfter[0]) === String(orderBefore[0]) &&
       String(orderAfter[1]) === String(orderBefore[1]) && String(orderAfter[2]) === String(orderBefore[2]),
       'order ثابت حرفياً بعد المغادرة (المغادر في مقعده) — لا انزياح w0-w3');
    const bEntry = rd.json.room.players.find(p => String(p.id) === String(B.id));
    ok(!!(bEntry && bEntry.isBot === true && bEntry.leftRound === true), 'المغادر موسوم isBot+leftRound (بديل آلي)');
  }

  /* ═══ د) التسوية من غير المالك + منع التكرار ═══ */
  console.log('── [د] التسوية آلية: أي لاعب نشط + منع التكرار ──');
  {
    const A = await newUser('m69h_' + tag), B = await newUser('m69i_' + tag);
    const gA0 = await goldOf(A), gB0 = await goldOf(B);
    const cr = await req('POST', '/api/rooms', { game_id: 'bg', max_players: 2, bet: 10 }, A.cookie);
    const rid = cr.json.room.id;
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, B.cookie);
    await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    /* الضيف (غير المالك) يعلن فوز نفسه — كانت تُرفض 403 */
    const s1 = await req('POST', '/api/rooms/settleRound', { room_id: rid, result: 'w1' }, B.cookie);
    ok(s1.status === 200 && s1.json.ok === true && s1.json.result === 'w1', 'الضيف يسوّي الجولة بنفسه (كان حكراً على المالك)');
    const gA1 = await goldOf(A), gB1 = await goldOf(B);
    ok(near(gB1 - gB0, 20 - 10 * FEE - 10) && near(gA0 - gA1, 10), 'التوزيع صحيح من تسوية الضيف (رابح +9.5 / خاسر -10)');
    const s2 = await req('POST', '/api/rooms/settleRound', { room_id: rid, result: 'w0' }, A.cookie);
    ok(s2.status === 400, 'التسوية الثانية مرفوضة (room.settled يمنع الازدواج)');
    /* متفرج لا يسوّي */
    const Z = await newUser('m69z_' + tag);
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, Z.cookie);
    const s3 = await req('POST', '/api/rooms/settleRound', { room_id: rid, result: 'w0' }, Z.cookie);
    ok(s3.status === 403, 'متفرج/خارج العضوية ⇒ 403 (بوابة التسوية محكمة)');
  }

  /* ═══ هـ) متعدد: المغادر آلياً + «فوز» مقعد المغادر ═══ */
  console.log('── [هـ] متعدد (أونو 3): مغادر بمقعد آلي ثم «فوز» مقعده ──');
  {
    const A = await newUser('m69j_' + tag), B = await newUser('m69k_' + tag), C = await newUser('m69l_' + tag);
    const gA0 = await goldOf(A), gB0 = await goldOf(B), gC0 = await goldOf(C);
    const cr = await req('POST', '/api/rooms', { game_id: 'un', max_players: 3, bet: 10 }, A.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, B.cookie);
    await req('POST', '/api/rooms/join', { code }, C.cookie);
    await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    const sinkA = [];
    const sseA = sseListener(A.cookie, sinkA);
    await sleep(300);
    const rm = await req('POST', '/api/rooms/leave', { room_id: rid }, B.cookie);
    await sleep(300);
    ok(rm.status === 200 && rm.json && rm.json.ok === true && !rm.json.result, 'مغادرة في جولة ثلاثية: لا تسوية فورية (الجولة تُكمل بالآلي)');
    const upd = sinkA.filter(e => e.event === 'room:update').pop();
    const bEntry = upd && upd.data && upd.data.players && upd.data.players.find(p => String(p.id) === String(B.id));
    ok(!!(bEntry && bEntry.isBot === true && bEntry.leftRound === true), 'المغادر موسوم isBot+leftRound في بث الحالة');
    ok(!!(upd && upd.data && upd.data.order && upd.data.order.length === 3 && String(upd.data.order[1]) === String(B.id)), 'المغادر باقٍ في مقعده بorder — لا انزياح');
    ok(sinkA.some(e => e.event === 'room:leave' && e.data && e.data.ai === true), 'بث room:leave بعلامة البديل الآلي');
    /* المحرك «فاز» بمقعد المغادر (w1) — الباقان يستردان + نصف المصادرة */
    const sv = await req('POST', '/api/rooms/settleRound', { room_id: rid, result: 'w1' }, C.cookie);
    ok(sv.status === 200 && sv.json.ok === true, 'تسوية بمقعد المغادر مقبولة');
    const gA1 = await goldOf(A), gB1 = await goldOf(B), gC1 = await goldOf(C);
    /* تعادل مالي للباقين: استرداد 10 لكل + نصف المصادرة (10-0.5)/2 = 4.75 */
    ok(near(gA1 - gA0, 4.75) && near(gC1 - gC0, 4.75), 'الباقان صافيهما +4.75 (استرداد 10 + حصة مصادرة 4.75 بعد دفع 10)');
    ok(near(gB0 - gB1, 10), 'المغادر خسر رهانه كاملاً رغم «فوز» مقعده الآلي');
    sseA.abort();
  }

  /* ═══ و) فرق (بلوت 4): مغادر في الفريق الفائز ═══ */
  console.log('── [و] فرق (بلوت 4): مغادر ضمن الفريق الفائز ⇒ زميله يأخذ الصافي ──');
  {
    const A = await newUser('m69m_' + tag), B = await newUser('m69n_' + tag);
    const C = await newUser('m69o_' + tag), D = await newUser('m69p_' + tag);
    const gA0 = await goldOf(A), gB0 = await goldOf(B), gC0 = await goldOf(C), gD0 = await goldOf(D);
    const cr = await req('POST', '/api/rooms', { game_id: 'bl', max_players: 4, bet: 10 }, A.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, B.cookie);
    await req('POST', '/api/rooms/join', { code }, C.cookie);
    await req('POST', '/api/rooms/join', { code }, D.cookie);
    await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    /* الفريق الفائز t0 = مقعدا 0,2 = A وC. يغادر A ⇒ زميله C يأخذ الصافي كله */
    await req('POST', '/api/rooms/leave', { room_id: rid }, A.cookie);
    const sv = await req('POST', '/api/rooms/settleTeamRound', { room_id: rid, result: 't0' }, C.cookie);
    ok(sv.status === 200 && sv.json.ok === true, 'تسوية الفرق من الضيف النشط مقبولة');
    const gA1 = await goldOf(A), gB1 = await goldOf(B), gC1 = await goldOf(C), gD1 = await goldOf(D);
    /* الرسم = bet*FEE*winners(1) = 0.5 · الصافي = 40-0.5 = 39.5 كاملة لـC */
    ok(near(gC1 - gC0, 40 - 0.5 - 10), 'الزميل البشري الباقي +29.5 (دفع 10 · استلم 39.5) — نصيب المغادر يعود إليه');
    ok(near(gA0 - gA1, 10), 'المغادر خسر رهانه (لا مكسب له من فريق رابح)');
    ok(near(gB0 - gB1, 10) && near(gD0 - gD1, 10), 'الفريق الخاسر خسر رهانه كاملاً');
  }

  /* ═══ ز) فريق فائز كله مغادر ⇒ الفريق البشري الآخر يفوز ═══ */
  console.log('── [ز] فرق: فريق فائز كله مغادر ⇒ الفريق الآخر البشري يفوز ──');
  {
    const A = await newUser('m69q_' + tag), B = await newUser('m69r_' + tag);
    const C = await newUser('m69s_' + tag), D = await newUser('m69t_' + tag);
    const gA0 = await goldOf(A), gB0 = await goldOf(B), gC0 = await goldOf(C), gD0 = await goldOf(D);
    const cr = await req('POST', '/api/rooms', { game_id: 'bl', max_players: 4, bet: 10 }, A.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, B.cookie);
    await req('POST', '/api/rooms/join', { code }, C.cookie);
    await req('POST', '/api/rooms/join', { code }, D.cookie);
    await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    /* الفريق الفائز المزعوم t0 = A,C يغادرانه كلاهما ⇒ t1 (B,D) تفوز */
    await req('POST', '/api/rooms/leave', { room_id: rid }, A.cookie);
    await req('POST', '/api/rooms/leave', { room_id: rid }, C.cookie);
    const sv = await req('POST', '/api/rooms/settleTeamRound', { room_id: rid, result: 't0' }, B.cookie);
    ok(sv.status === 200 && sv.json.ok === true && sv.json.result === 't1', 'فريق فائز كله مغادر ⇒ النتيجة تنقلب للفريق البشري الآخر (t1)');
    const gB1 = await goldOf(B), gD1 = await goldOf(D);
    ok(near(gB1 - gB0, (40 - 1) / 2 - 10) && near(gD1 - gD0, (40 - 1) / 2 - 10), 'الفريق البشري الآخر +9.5 لكل (دفع 10 · استلم 19.5)');
  }

  /* ═══ ح) تعادل مع مغادر ═══ */
  console.log('── [ح] تعادل مع مغادر: الباقي يسترد + حصة المغادر ──');
  {
    const X = await newUser('m69w_' + tag), Y = await newUser('m69x_' + tag), Z = await newUser('m69y_' + tag);
    const gX0 = await goldOf(X), gY0 = await goldOf(Y), gZ0 = await goldOf(Z);
    const cr = await req('POST', '/api/rooms', { game_id: 'un', max_players: 3, bet: 10 }, X.cookie);
    const rid = cr.json.room.id;
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, Y.cookie);
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, Z.cookie);
    await req('POST', '/api/rooms/start', { room_id: rid }, X.cookie);
    await req('POST', '/api/rooms/leave', { room_id: rid }, Z.cookie);
    const sv = await req('POST', '/api/rooms/settleRound', { room_id: rid, result: 'draw' }, Y.cookie);
    ok(sv.status === 200 && sv.json.ok === true, 'تعادل ثلاثية مع مغادر مقبول');
    const gX1 = await goldOf(X), gY1 = await goldOf(Y), gZ1 = await goldOf(Z);
    ok(near(gX1 - gX0, 4.75) && near(gY1 - gY0, 4.75), 'الباقيان صافيهما +4.75 (استرداد 10 + نصف مصادرة 4.75 بعد دفع 10)');
    ok(near(gZ0 - gZ1, 10), 'المغادر لا يسترد في التعادل (مغادرة = خسارة)');
  }

  /* ═══ ط) الأشباح: وسم بلا حذف + العودة تستعيد المقعد ═══ */
  console.log('── [ط] الأشباح: وسم isBot (لا حذف) + العودة تستعيد المقعد ──');
  {
    const A = await newUser('m69aa_' + tag), B = await newUser('m69ab_' + tag);
    const gA0 = await goldOf(A), gB0 = await goldOf(B);
    const cr = await req('POST', '/api/rooms', { game_id: 'dm', max_players: 2, bet: 10 }, A.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, B.cookie);
    await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    /* A حي باتصال SSE — B بلا قناة وبلا نشاط ⇒ شبح بعد مهلة 1ms */
    const sinkA = [];
    const sseA = sseListener(A.cookie, sinkA);
    await sleep(600);
    const sw = await req('POST', '/api/__test/ghost-sweep', { grace_ms: 1 }, A.cookie);
    await sleep(300);
    ok(sw.status === 200 && sw.json.ok === true, 'دورة المنظّف تنفَّذ (DM_TEST_MODE)');
    const gA1 = await goldOf(A), gB1 = await goldOf(B);
    ok(near(gA0 - gA1, 10) && near(gB0 - gB1, 10), 'المنظّف لا يسترد إيداعاً ولا يحرق شيئاً (الانقطاع ≠ مغادرة)');
    const upd = sinkA.filter(e => e.event === 'room:update').pop();
    const bGhost = upd && upd.data && upd.data.players && upd.data.players.find(p => String(p.id) === String(B.id));
    ok(!!(bGhost && bGhost.isBot === true && !bGhost.leftRound), 'الغائب موسوم isBot بلا leftRound (انقطاع مؤقت — لا حذف)');
    /* عودة B: SSE hello يستعيد مقعده */
    const sinkB = [];
    const sseB = sseListener(B.cookie, sinkB);
    await sleep(500);
    const hello = sinkB.filter(e => e.event === 'room:update').map(e => e.data).filter(d => d && d.id === rid).pop();
    const bBack = hello && hello.players && hello.players.find(p => String(p.id) === String(B.id));
    ok(!!(bBack && bBack.isBot === false && !bBack.spectate), 'الغائب عاد ⇒ وسم isBot رُفع ومقعده مستعاد');
    ok(!!(hello && hello.order && hello.order.length === 2), 'الغرفة الثنائية كاملة العضوية بعد العودة');
    /* B يغادر فعلياً الآن ⇒ تسوية فورية للمالك */
    const lv = await req('POST', '/api/rooms/leave', { room_id: rid }, B.cookie);
    ok(lv.status === 200 && lv.json && lv.json.result === 'w0', 'مغادرة صريحة بعد العودة ⇒ خسارة فورية (w0)');
    const gA2 = await goldOf(A);
    ok(near(gA2 - gA0, 20 - 10 * FEE - 10), 'المالك صافيه +9.5 (دفع 10 · استلم الجرة 19.5)');
    sseA.abort(); sseB.abort();
  }

  /* ═══ ي) الريماش يُسقط الآليين ═══ */
  console.log('── [ي] الريماش: الآليون خارج التصويت نهائياً ──');
  {
    const A = await newUser('m69ac_' + tag), B = await newUser('m69ad_' + tag), C = await newUser('m69ae_' + tag);
    const cr = await req('POST', '/api/rooms', { game_id: 'un', max_players: 3, bet: 10 }, A.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, B.cookie);
    await req('POST', '/api/rooms/join', { code }, C.cookie);
    await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    await req('POST', '/api/rooms/leave', { room_id: rid }, B.cookie);
    /* تسوية الجولة ثم ريماش */
    await req('POST', '/api/rooms/settleRound', { room_id: rid, result: 'w0' }, A.cookie);
    const rms = await req('POST', '/api/rooms/rematch/start', { room_id: rid }, A.cookie);
    ok(rms.status === 200, 'بدء الريماش بعد مغادرة واحد مقبول');
    const rem = rms.json && rms.json.room && rms.json.room.rematch;
    ok(!!(rem && rem.participants && rem.participants.length === 2), 'الآلي (المغادر) مُسقط — المشاركون بشريان فقط');
  }

  console.log('\n═══ النتيجة: ' + pass + ' نجح / ' + fail + ' فشل ═══');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
