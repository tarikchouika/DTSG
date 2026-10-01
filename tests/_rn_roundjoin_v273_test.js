/* ═══════════════════════════════════════════════════════════════════════════
   tests/_rn_roundjoin_v273_test.js — [v2.73] فلات دوغ: عقد رهان الجولة بالمشاركة
   توجيه المالك (2026-10-02):
     • «مبلغ رهان الجولة المحدد للغرفة يسوّى في نهاية الجولة» — تسوية كل جولة
       على حدة (كانت الجولة الأولى تسوّي الغرفة كلها ثم تلعب البقية ودياً).
     • «ينتقل الدور للاعب المتخمّن الموالي آلياً ويعرض عليه خيارين المشاركة
       أو الانسحاب» — مرحلة المشاركة بين الجولات.
     • «لا يقتطع مبلغ الرهان إلا بعد مصادقة اللاعب بالنقر على المشاركة» — لا
       اقتطاع عند البدء؛ الاقتطاع عند roundJoin حصراً ومن المطلوبين حصراً.
     • «المقعد الشاغر للاعب المنسحب ينتقل للمتفرج الراغب في المشاركة آلياً» —
       الانسحاب يحرّر المقعد والطابور يُرقّى فوراً.
   تشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_rn_roundjoin_v273_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
/* [v2.69.1] عنوان آمن: يحترم QA_BASE ويرفض الكتابة على خادم المنصة الحيّ */
const BASE = require('./_safe_base.js').BASE;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const FEE = 0.05;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.011 : tol);
const roomOf = async (p) => {
  const r = await req('GET', '/api/rooms/active', null, p.cookie);
  return r.json && r.json.room ? r.json.room : null;
};

(async function main() {
  const tag = Date.now().toString(36);

  /* ═══ أ) لا اقتطاع عند البدء — المال لا يُلمس قبل النقر على المشاركة ═══ */
  console.log('── [أ] البدء بلا اقتطاع + فتح مرحلة المشاركة ──');
  const A = await newUser('rjA_' + tag), B = await newUser('rjB_' + tag), C = await newUser('rjC_' + tag);
  const D = await newUser('rjD_' + tag);   /* متفرج راغب (طابور) */
  const gA0 = await goldOf(A), gB0 = await goldOf(B), gC0 = await goldOf(C), gD0 = await goldOf(D);
  const cr = await req('POST', '/api/rooms', { game_id: 'rn', max_players: 3, bet: 10 }, A.cookie);
  const rid = cr.json.room.id, code = cr.json.room.code;
  await req('POST', '/api/rooms/join', { code }, B.cookie);
  await req('POST', '/api/rooms/join', { code }, C.cookie);
  await req('POST', '/api/rooms/join', { code, spectate: true }, D.cookie);
  await req('POST', '/api/rooms/joinRequest', { room_id: rid }, D.cookie);
  const st = await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
  ok(st.status === 200 && st.json.room.status === 'playing', 'البدء ينجح (غرفة فلات دوغ)');
  ok(near(await goldOf(A), gA0) && near(await goldOf(B), gB0) && near(await goldOf(C), gC0) && near(await goldOf(D), gD0),
    'لا اقتطاع من أحد عند البدء — الرهان عند النقر على المشاركة فقط');
  ok(!!(await roomOf(A)) && (await roomOf(A)).roundJoin === null, 'لا مرحلة مشاركة مفتوحة بعد البدء مباشرة');

  /* المالك (كما يفعل المحرك) يبثّ مرحلة المشاركة للمتحدين الأولين */
  const sinkB = [];
  const sseB = sseListener(B.cookie, sinkB);
  await sleep(400);
  const state1 = { order: [A.id, B.id, C.id], round: 0, mode: 'number_only', seed: null, pick: null, phase: 'join' };
  const jp = await req('POST', '/api/rooms/move', { room_id: rid, action: 'joinphase', data: { bet: 10, dealer: A.id, selector: B.id, joined: [] }, state: state1 }, A.cookie);
  ok(jp.status === 200 && jp.json.ok, 'بثّ joinphase من السائق مقبول');
  ok(Array.isArray(jp.json.room.roundJoin && jp.json.room.roundJoin.required) &&
     String(jp.json.room.roundJoin.required[0]) === String(A.id) && String(jp.json.room.roundJoin.required[1]) === String(B.id),
    'الخادم سجّل المطلوبَين (الموزّع والمتخمّن)');

  /* ═══ ب) حراسة المشاركة: للمطلوبين حصراً + رصيد كافٍ ═══ */
  console.log('── [ب) حراسة المشاركة ──');
  const rjC = await req('POST', '/api/rooms/roundJoin', { room_id: rid }, C.cookie);
  ok(rjC.status === 400, 'منتظر (ليس دوره) ⇒ 400 — الاقتطاع للمتحدين الحاليين فقط');
  const rjD = await req('POST', '/api/rooms/roundJoin', { room_id: rid }, D.cookie);
  ok(rjD.status === 400, 'متفرج ⇒ 400');
  const rjX = await req('POST', '/api/rooms/roundJoin', { room_id: rid }, null);
  ok(rjX.status === 401 || rjX.status === 403, 'غير مصادق/غير عضو ⇒ مرفوض');

  /* ═══ ج) الاقتطاع عند النقر + اكتمال المصادقتين ═══ */
  console.log('── [ج) المشاركة تقتطع رهان الجولة من المشارك نفسه ──');
  const rjB = await req('POST', '/api/rooms/roundJoin', { room_id: rid }, B.cookie);
  ok(rjB.status === 200 && rjB.json.ok, 'المتخمّن يصادق بالمشاركة');
  ok(near(await goldOf(B), gB0 - 10), 'المتخمّن اقتُطع 10 (رهان الجولة) لحظة النقر');
  ok(near(await goldOf(A), gA0) && near(await goldOf(C), gC0), 'لا أحد غيره اقتُطع');
  const rjB2 = await req('POST', '/api/rooms/roundJoin', { room_id: rid }, B.cookie);
  ok(rjB2.status === 200 && rjB2.json.already === true && near(await goldOf(B), gB0 - 10), 'تكرار النقر idempotent — لا اقتطاع مزدوج');
  const rjA = await req('POST', '/api/rooms/roundJoin', { room_id: rid }, A.cookie);
  ok(rjA.status === 200 && rjA.json.ready === true, 'الموزّع يصادق ⇒ الاثنان جاهزان (ready)');
  ok(near(await goldOf(A), gA0 - 10), 'الموزّع اقتُطع 10');
  ok(sinkB.some(e => e.event === 'room:roundjoin' && String(e.data.user_id) === String(B.id)), 'بثّ room:roundjoin وصل للطرف الآخر');
  ok(sinkB.some(e => e.event === 'room:roundready'), 'بثّ room:roundready عند اكتمال المصادقتين');

  /* ═══ د) تسليح الجولة + تسوية الجولة الأولى (رهانا المتحدين فقط) ═══ */
  console.log('── [د) تسوية الجولة الأولى: الجرة من المشاركَين فقط ──');
  const rd1 = await req('POST', '/api/rooms/move', { room_id: rid, action: 'round', data: { order: [A.id, B.id, C.id], round: 1, mode: 'number_only', seed: 12345, pick: null, phase: 'playing' }, state: { order: [A.id, B.id, C.id], round: 1, mode: 'number_only', seed: 12345, pick: null, phase: 'playing' } }, A.cookie);
  ok(rd1.status === 200, 'إطلاق الجولة (round) من السائق');
  const armed = await roomOf(A);
  ok(armed && armed.settled === false && armed.roundJoin === null, 'الجولة مسلّحة (settled=false) ومرحلة المشاركة مرفوعة');
  const s1 = await req('POST', '/api/rooms/settleRound', { room_id: rid, result: 'u' + B.id }, B.cookie);
  ok(s1.status === 200 && s1.json.ok, 'التسوية من أي لاعب نشط بالمعرّف u<id> (ترتيب الدوران لا يضرب المقاعد)');
  ok(s1.json && near(s1.json.payout, 20 - 20 * FEE), 'الرابح يأخذ الجرة (20) ناقص رسم 5% (payout=19)');
  ok(s1.json && s1.json.winner && String(s1.json.winner.id) === String(B.id), 'الرابح الصحيح بالاسم (لا انزياح مقاعد)');
  ok(near(await goldOf(B), gB0 - 10 + 19), 'صافي المتخمّن الرابح +9');
  ok(near(await goldOf(A), gA0 - 10), 'الموزّع الخاسر −10');
  ok(near(await goldOf(C), gC0), 'المنتظر لم يدفع ولم يخسر قرشاً (عدالة الجولة بالمشاركة)');
  const s1b = await req('POST', '/api/rooms/settleRound', { room_id: rid, result: 'u' + A.id }, A.cookie);
  ok(s1b.status === 400, 'إعادة تسوية نفس الجولة ⇒ 400');

  /* ═══ هـ) الجولة الثانية: تسوية جديدة (جذر الخلل القديم: جولة واحدة ثم ودي) ═══ */
  console.log('── [هـ) الجولة الثانية تُسوّى بدورها — لا «ودي» بعد أول جولة ──');
  const jp2 = await req('POST', '/api/rooms/move', { room_id: rid, action: 'joinphase', data: { bet: 10, dealer: C.id, selector: A.id, joined: [] }, state: { order: [C.id, A.id, B.id], round: 1, mode: 'number_only', seed: null, pick: null, phase: 'join' } }, A.cookie);
  ok(jp2.status === 200 && jp2.json.room.roundJoin, 'مرحلة المشاركة للجولة الثانية تُفتح');
  const rjC2 = await req('POST', '/api/rooms/roundJoin', { room_id: rid }, C.cookie);
  const rjA2 = await req('POST', '/api/rooms/roundJoin', { room_id: rid }, A.cookie);
  ok(rjC2.status === 200 && rjA2.status === 200 && rjA2.json.ready === true, 'المتحدين الجديدان يصادقان (المنتظر السابق صار موزّعاً)');
  ok(near(await goldOf(C), gC0 - 10) && near(await goldOf(A), gA0 - 20), 'الاقتطاع من المشاركين الجديدَين فقط');
  await req('POST', '/api/rooms/move', { room_id: rid, action: 'round', data: { order: [C.id, A.id, B.id], round: 2, mode: 'number_only', seed: 777, pick: null, phase: 'playing' }, state: { order: [C.id, A.id, B.id], round: 2, mode: 'number_only', seed: 777, pick: null, phase: 'playing' } }, A.cookie);
  const s2 = await req('POST', '/api/rooms/settleRound', { room_id: rid, result: 'u' + A.id }, A.cookie);
  ok(s2.status === 200 && s2.json.ok && near(s2.json.payout, 19), 'تسوية الجولة الثانية تنجح (جذر الخلل: «جولة واحدة ثم ودي»)');

  /* ═══ و) الانسحاب: استرداد + تحرير المقعد + ترقية المتفرج الراغب ═══ */
  console.log('── [و) الانسحاب يحرّر المقعد للمتفرج الراغب ──');
  const gC2 = await goldOf(C), gB2 = await goldOf(B);
  await req('POST', '/api/rooms/move', { room_id: rid, action: 'joinphase', data: { bet: 10, dealer: C.id, selector: B.id, joined: [] }, state: { order: [C.id, B.id, A.id], round: 2, mode: 'number_only', seed: null, pick: null, phase: 'join' } }, A.cookie);
  const rjB3 = await req('POST', '/api/rooms/roundJoin', { room_id: rid }, B.cookie);
  ok(rjB3.status === 200 && near(await goldOf(B), gB2 - 10), 'المنسحب-إلى-بي أدّى رهانه أولاً');
  const wd = await req('POST', '/api/rooms/roundWithdraw', { room_id: rid }, B.cookie);
  ok(wd.status === 200 && wd.json.ok, 'الانسحاب من الجولة القادمة مقبول');
  ok(near(await goldOf(B), gB2), 'المنسحب استردّ رهانه كاملاً (لم تبدأ الجولة)');
  const roomW = wd.json.room;
  const Bp = roomW && roomW.players.find(p => String(p.id) === String(B.id));
  const Dp = roomW && roomW.players.find(p => String(p.id) === String(D.id));
  ok(Bp && Bp.spectate === true, 'المنسحب صار متفرجاً — المقعد تحرّر');
  ok(Dp && Dp.spectate === false, 'المتفرج الراغب (الطابور) رُقّي إلى مقعد نشط آلياً');
  ok(roomW.roundJoin && roomW.roundJoin.required.length === 2 &&
     !roomW.roundJoin.required.some(id => String(id) === String(B.id)) &&
     roomW.roundJoin.required.every(id => roomW.room_state.order.slice(0, 2).some(o => String(o) === String(id))),
    'المطلوبان التاليان من رأس الترتيب (المنتظر التالي يقدَّم على المقعد المحرّر — عدالة الدوران)');
  ok(Array.isArray(roomW.room_state && roomW.room_state.order) && !roomW.room_state.order.some(id => String(id) === String(B.id)) &&
     roomW.room_state.order.some(id => String(id) === String(D.id)), 'ترتيب اللعبة: المنسحب خارج والمرفوع داخل');
  ok(sinkB.some(e => e.event === 'room:roundwithdraw' && String(e.data.user_id) === String(B.id)), 'بثّ room:roundwithdraw للجميع');

  /* ═══ و-ب) الثنائي (وجه لوجه): المقعد ينتقل فوراً للمتفرج الراغب ═══ */
  console.log('── [و-ب) ثنائي: مقعد المنسحب ينتقل للمتفرج فوراً ──');
  const G = await newUser('rjG_' + tag), H = await newUser('rjH_' + tag), I = await newUser('rjI_' + tag);
  const gG0 = await goldOf(G), gH0 = await goldOf(H), gI0 = await goldOf(I);
  const cr3 = await req('POST', '/api/rooms', { game_id: 'rn', max_players: 2, bet: 10 }, G.cookie);
  const rid3 = cr3.json.room.id, code3 = cr3.json.room.code;
  await req('POST', '/api/rooms/join', { code: code3 }, H.cookie);
  await req('POST', '/api/rooms/join', { code: code3, spectate: true }, I.cookie);
  await req('POST', '/api/rooms/joinRequest', { room_id: rid3 }, I.cookie);
  await req('POST', '/api/rooms/start', { room_id: rid3 }, G.cookie);
  await req('POST', '/api/rooms/move', { room_id: rid3, action: 'joinphase', data: { bet: 10, dealer: G.id, selector: H.id, joined: [] }, state: { order: [G.id, H.id], round: 0, mode: 'number_only', seed: null, pick: null, phase: 'join' } }, G.cookie);
  await req('POST', '/api/rooms/roundJoin', { room_id: rid3 }, H.cookie);
  ok(near(await goldOf(H), gH0 - 10) && near(await goldOf(G), gG0), 'المتخمّن أدّى والمالك لم يُلمس');
  const wd2 = await req('POST', '/api/rooms/roundWithdraw', { room_id: rid3 }, H.cookie);
  ok(wd2.status === 200 && near(await goldOf(H), gH0), 'المنسحب (ثنائي) استردّ رهانه');
  const roomW2b = wd2.json.room;
  const Ip = roomW2b && roomW2b.players.find(p => String(p.id) === String(I.id));
  ok(Ip && Ip.spectate === false && near(await goldOf(I), gI0), 'المتفرج الراغب رُقّي ولم يُقتطع منه شيء بعد');
  ok(roomW2b.roundJoin && roomW2b.roundJoin.required.some(id => String(id) === String(I.id)),
    'ثنائي: مقعد المنسحب انتقل للمتفرج — يُعرض عليه المشاركة فوراً (توجيه المالك الحرفي)');
  ok(roomW2b.status === 'playing', 'الغرفة الثنائية ما زالت حية تلعب (بلا إعادة إنشاء)');

  /* ═══ ز) صمت المهلة = انسحاب (لا موافقة فلا اقتطاع) ═══ */
  console.log('── [ز) مهلة المشاركة: الصمت انسحاب والدور ينتقل ──');
  const roomW2 = await roomOf(A);
  const ordNow = (roomW2.room_state && roomW2.room_state.order) || [];
  /* الصامت = المطلوب الثاني (المرفوع من الطابور — لا المالك) */
  const silent = ordNow[ordNow.length - 1];
  await req('POST', '/api/rooms/move', { room_id: rid, action: 'joinphase', data: { bet: 10, dealer: ordNow[0], selector: silent, joined: [] }, state: Object.assign({}, roomW2.room_state, { phase: 'join', seed: null, pick: null }) }, A.cookie);
  const gSilent = silent === C.id ? await goldOf(C) : silent === D.id ? await goldOf(D) : await goldOf(A);
  const to = await req('POST', '/api/rooms/timeoutSeat', { room_id: rid, playerId: silent }, A.cookie);
  ok(to.status === 200 && to.json.ok, 'timeoutSeat لمطلوب صامت أثناء المشاركة');
  const roomT = to.json.room;
  const sp = roomT && roomT.players.find(p => String(p.id) === String(silent));
  ok(sp && sp.spectate === true, 'الصامت انسحب (متفرج) — لا اقتطاع منه');
  const gSilentAfter = silent === C.id ? await goldOf(C) : silent === D.id ? await goldOf(D) : await goldOf(A);
  ok(near(gSilentAfter, gSilent), 'الصامت لم يدفع شيئاً (لا موافقة فلا اقتطاع)');
  ok(roomT.roundJoin && roomT.roundJoin.required.length === 2 &&
     !roomT.roundJoin.required.some(id => String(id) === String(silent)), 'قائمة المطلوبين أُعيدت بدون الصامت');
  /* اجعل بقية الأجنحة تبدأ من حالة نظيفة */
  sseB.abort();

  /* ═══ ح) رصيد غير كافٍ عند المشاركة + مغادرة مطلوب أثناء المرحلة ═══ */
  console.log('── [ح) الرصيد غير الكافي والمغادرة أثناء المرحلة ──');
  const E = await newUser('rjE_' + tag), F = await newUser('rjF_' + tag);
  const gE0 = await goldOf(E), gF0 = await goldOf(F);
  const cr2 = await req('POST', '/api/rooms', { game_id: 'rn', max_players: 2, bet: 10 }, F.cookie);
  const rid2 = cr2.json.room.id, code2 = cr2.json.room.code;
  await req('POST', '/api/rooms/join', { code: code2 }, E.cookie);
  await req('POST', '/api/rooms/start', { room_id: rid2 }, F.cookie);
  /* E يصفّي رصيده إلى أقل من الرهان بعد البدء (المشاركة تُفحص لحظتها) */
  await req('POST', '/api/transfer', { to: F.name, amount: Math.max(0.01, gE0 - 5) }, E.cookie);
  const gE1 = await goldOf(E);
  ok(gE1 < 10, 'اللاعب E صار رصيده أقل من رهان الجولة (' + gE1 + ')');
  await req('POST', '/api/rooms/move', { room_id: rid2, action: 'joinphase', data: { bet: 10, dealer: F.id, selector: E.id, joined: [] }, state: { order: [F.id, E.id], round: 0, mode: 'number_only', seed: null, pick: null, phase: 'join' } }, F.cookie);
  const rjE = await req('POST', '/api/rooms/roundJoin', { room_id: rid2 }, E.cookie);
  ok(rjE.status === 400 && rjE.json.error === 'insufficient_funds', 'المشاركة برصيد ناقص ⇒ 400 insufficient_funds');
  ok(near(await goldOf(E), gE1), 'لا اقتطاع من قليل الرصيد');
  /* F صادق ودفعت ثم E (المطلوب) غادر صراحةً: إيداع F يُسترد والغرفة تنتظر */
  const rjF = await req('POST', '/api/rooms/roundJoin', { room_id: rid2 }, F.cookie);
  ok(rjF.status === 200 && near(await goldOf(F), gF0 + gE0 - 5 - 10), 'الطرف الآخر صادق ودفعت');
  const lv = await req('POST', '/api/rooms/leave', { room_id: rid2 }, E.cookie);
  ok(lv.status === 200 && lv.json.ok, 'مغادرة مطلوب المشاركة صراحةً');
  ok(near(await goldOf(F), gF0 + gE0 - 5), 'إيداع الباقي استُرد بالكامل عند عودة الغرفة للانتظار (كان يضيع)');

  console.log('\n══════════════════════════════');
  console.log('النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ الاختبار:', e); process.exit(2); });
