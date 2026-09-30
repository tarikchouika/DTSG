/* ═════════════════════════════════════════════════════════════════════
   [v2.68] اختبارات عزل الألعاب ونظام الغرف لكل لعبة
     1) [مقاعد] التصحيح وفق حاجة اللعبة: بلوت 4 بالضبط، أونو ≤4، شطرنج 2
     2) [بدء] لا بدء دون العدد المشترط (بلوت بثلاثة ⇒ 400)
     3) [عزل حركات] حركة لعبة أخرى في غرفة اللعبة ⇒ 400 (كانت تُمرَّر عمياء)
     4) [عزل حالة] blob تشخيصي يُقبل من الجميع؛ الحالة الحقيقية للسائق فقط
        + base_rev: الكتابة المتقادمة تُرفض (نهاية «آخر كاتب يفوز»)
     5) [توجيه الرموز] رمز كل غرفة يصل للعبة صاحبته (لا خلط بين الألعاب)
     6) [تسوية الفرق] مقاعد زوجية (2 أو 4): مقعد%2 — أونو الثنائية تسوّى الآن
     7) [سجل الحركات] unmove/blmove تُسجَّل وتُعاد للعائد عبر room:replay
   تشغيل: PORT=3000 · DM_TEST_MODE=1
          node tests/_rooms_isolation_v268_test.js
   ═════════════════════════════════════════════════════════════════════ */
'use strict';
const BASE = "http://127.0.0.1:3000";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

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

function sseListener(cookie, sink, extraQuery) {
  const ctl = new AbortController();
  (async () => {
    const r = await fetch(BASE + '/api/live' + (extraQuery || ''), { headers: { Cookie: cookie }, signal: ctl.signal });
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

(async function main() {
  const tag = Date.now().toString(36);
  console.log('── [مقاعد] التصحيح وفق حاجة كل لعبة ──');
  {
    const H = await newUser('seat_' + tag);
    const bl = await req('POST', '/api/rooms', { game_id: 'bl', max_players: 2, bet: 5 }, H.cookie);
    ok(bl.status === 200 && bl.json.room.max_players === 4, 'بلوت بطلب 2 مقاعد ⇒ تُنشأ 4 بالضبط (المحرك يشترطها)');
    await req('POST', '/api/rooms/leave', { room_id: bl.json.room.id }, H.cookie);
    const un = await req('POST', '/api/rooms', { game_id: 'un', max_players: 8, bet: 5 }, H.cookie);
    ok(un.status === 200 && un.json.room.max_players === 4, 'أونو بطلب 8 ⇒ تُقصّ 4');
    await req('POST', '/api/rooms/leave', { room_id: un.json.room.id }, H.cookie);
    const ch = await req('POST', '/api/rooms', { game_id: 'ch', max_players: 4, bet: 5 }, H.cookie);
    ok(ch.status === 200 && ch.json.room.max_players === 2, 'شطرنج بطلب 4 ⇒ تُقصّ 2');
    await req('POST', '/api/rooms/leave', { room_id: ch.json.room.id }, H.cookie);
    const rn = await req('POST', '/api/rooms', { game_id: 'rn', max_players: 9, bet: 5 }, H.cookie);
    ok(rn.status === 200 && rn.json.room.max_players === 4, 'روندا بطلب 9 ⇒ تُقصّ 4');
    await req('POST', '/api/rooms/leave', { room_id: rn.json.room.id }, H.cookie);
    const zz = await req('POST', '/api/rooms', { game_id: 'xx', max_players: 2, bet: 5 }, H.cookie);
    ok(zz.status === 400, 'لعبة غير مسجلة ⇒ 400');
  }

  console.log('── [بدء] العدد المشترط وفق اللعبة ──');
  {
    const A = await newUser('st1_' + tag), B = await newUser('st2_' + tag), C = await newUser('st3_' + tag), D = await newUser('st4_' + tag);
    const cr = await req('POST', '/api/rooms', { game_id: 'bl', max_players: 4, bet: 10 }, A.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, B.cookie);
    await req('POST', '/api/rooms/join', { code }, C.cookie);
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, A.cookie);
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, B.cookie);
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, C.cookie);
    const st3 = await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    ok(st3.status === 400 && st3.json.error === 'not_enough_players' && st3.json.need === 4, 'بلوت بثلاثة ⇒ 400 «هذه اللعبة تتطلب 4 لاعبين» (كان يبدأ ثم يعلق المحرك)');
    await req('POST', '/api/rooms/join', { code }, D.cookie);
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, D.cookie);
    const st4 = await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    ok(st4.status === 200 && st4.json.room.status === 'playing', 'بلوت بأربعة ⇒ يبدأ (المحرك يبني)')
    /* تسوية الفرق 4 مقاعد */
    const g0 = await Promise.all([goldOf(A), goldOf(B), goldOf(C), goldOf(D)]);
    const st = await req('POST', '/api/rooms/settleTeamRound', { room_id: rid, result: 't0' }, A.cookie);
    ok(st.status === 200 && st.json.teamSplit === true, 'تسوية الفرق (بلوت 4): t0 تقسم بين المقاعدين 0 و2');
    const g1 = await Promise.all([goldOf(A), goldOf(B), goldOf(C), goldOf(D)]);
    ok(g1[0] > g0[0] && g1[2] > g0[2] && g1[1] === g0[1] && g1[3] === g0[3], 'الفريق الفائز (0,2) تقاضى والخاسر (1,3) لم يتغير');
    await req('POST', '/api/rooms/leave', { room_id: rid }, A.cookie);
    await req('POST', '/api/rooms/leave', { room_id: rid }, B.cookie);
    await req('POST', '/api/rooms/leave', { room_id: rid }, C.cookie);
    await req('POST', '/api/rooms/leave', { room_id: rid }, D.cookie);
  }

  console.log('── [عزل الحركات] حركة لعبة في غرفة لعبة أخرى ⇒ 400 ──');
  {
    const P1 = await newUser('mv1_' + tag), P2 = await newUser('mv2_' + tag);
    const cr = await req('POST', '/api/rooms', { game_id: 'rm', max_players: 2, bet: 5 }, P1.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, P2.cookie);
    const inj1 = await req('POST', '/api/rooms/move', { room_id: rid, action: 'unmove', data: {} }, P1.cookie);
    ok(inj1.status === 400, 'حقن unmove (أونو) في غرفة رامي ⇒ 400');
    const inj2 = await req('POST', '/api/rooms/move', { room_id: rid, action: 'blmove', data: {} }, P1.cookie);
    ok(inj2.status === 400, 'حقن blmove (بلوت) في غرفة رامي ⇒ 400');
    const good = await req('POST', '/api/rooms/move', { room_id: rid, action: 'rmove', data: { action: 'init', data: {}, by: P1.id, seq: 1 } }, P1.cookie);
    ok(good.status === 200 && good.json.ok, 'rmove الصحيحة في غرفة رامي ⇒ 200');
    const blind = await req('POST', '/api/rooms/move', { room_id: rid, action: 'blind', data: { d: 'r' } }, P1.cookie);
    ok(blind.status === 200, 'blind متاحة للجميع (اختيار أعمى زوجي) ⇒ 200');
    await req('POST', '/api/rooms/leave', { room_id: rid }, P1.cookie);
    await req('POST', '/api/rooms/leave', { room_id: rid }, P2.cookie);
  }

  console.log('── [عزل الحالة] ملكية + طزاجة base_rev ──');
  {
    const H = await newUser('hs_' + tag), G = await newUser('hg_' + tag);
    const cr = await req('POST', '/api/rooms', { game_id: 'rn', max_players: 2, bet: 5 }, H.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, G.cookie);
    const rev0 = cr.json.room.rev;
    /* blob تشخيصي من الضيف ⇒ مقبول بلا رفض (لا معلومات لعبة فيه) */
    const triv = await req('POST', '/api/rooms/move', { room_id: rid, action: 'pick', data: {}, state: { game_id: 'rn', status: 'playing' } }, G.cookie);
    ok(triv.status === 200 && !triv.json.state_rejected, 'blob تشخيصي {game_id,status} من الضيف ⇒ مقبول بصمت');
    /* حالة حقيقية من الضيف (غير السائق) ⇒ مرفوضة */
    const guest = await req('POST', '/api/rooms/move', { room_id: rid, action: 'pick', data: {}, state: { order: [1, 2], round: 5, mode: 'x', seed: 1, pick: null, phase: 'playing' }, base_rev: 99 }, G.cookie);
    ok(guest.status === 200 && guest.json.state_rejected === true, 'حالة حقيقية من غير السائق ⇒ مرفوضة state_rejected (كان آخر كاتب يفوز)');
    /* حالة حقيقية من المضيف بطزاجة ⇒ مقبولة */
    const host = await req('POST', '/api/rooms/move', { room_id: rid, action: 'pick', data: {}, state: { order: [H.id, G.id], round: 1, mode: 'm', seed: 42, pick: null, phase: 'playing' }, base_rev: guest.json.room.rev }, H.cookie);
    ok(host.status === 200 && !host.json.state_rejected, 'حالة حقيقية من المضيف بbase_rev طازج ⇒ مقبولة');
    ok(host.json.room.room_state && host.json.room.room_state.round === 1 && host.json.room.room_state.order[0] === H.id, 'room_state حُفظت بمفاتيح الروندا بعد القصّ');
    /* كتابة متقادمة: base_rev أقدم ⇒ مرفوضة */
    const stale = await req('POST', '/api/rooms/move', { room_id: rid, action: 'pick', data: {}, state: { order: [G.id, H.id], round: 99, mode: 'evil', seed: 1, pick: null, phase: 'playing' }, base_rev: 0 }, H.cookie);
    ok(stale.status === 200 && stale.json.state_rejected === true, 'كتابة بbase_rev متقادم ⇒ مرفوضة (لا حرق للحالة المرجعية)');
    ok(stale.json.room.room_state.round === 1, 'room_state لم تُمس بالكتابة المتقادمة (ما زالت round=1)');
    /* مفاتيح غريبة تُقصّ */
    const weird = await req('POST', '/api/rooms/move', { room_id: rid, action: 'pick', data: {}, state: { round: 2, evil: 'hack' }, base_rev: stale.json.room.rev }, H.cookie);
    ok(weird.status === 200 && weird.json.room.room_state.round === 2 && !('evil' in weird.json.room.room_state), 'المفاتيح الغريبة تُقصّ من الحالة (مخطط اللعبة)');
    await req('POST', '/api/rooms/leave', { room_id: rid }, H.cookie);
    await req('POST', '/api/rooms/leave', { room_id: rid }, G.cookie);
  }

  console.log('── [توجيه الرموز] رمز الغرفة يصل للعبة صاحبته ──');
  {
    const H = await newUser('rt_' + tag);
    const crUn = await req('POST', '/api/rooms', { game_id: 'un', max_players: 2, bet: 5 }, H.cookie);
    const crBl = await req('POST', '/api/rooms', { game_id: 'bl', max_players: 4, bet: 5 }, H.cookie);
    ok(crUn.json.room.code !== crBl.json.room.code, 'رمزا الغرفتان مختلفان (توليد عالمياً فريد)');
    const j1 = await req('POST', '/api/rooms/join', { code: crUn.json.room.code }, H.cookie);
    ok(j1.status === 200 && j1.json.room.game_id === 'un', 'الرمز الأول يوصل لغرفة أونو (لعبتها الصحيحة)');
    const j2 = await req('POST', '/api/rooms/join', { code: crBl.json.room.code }, H.cookie);
    ok(j2.status === 200 && j2.json.room.game_id === 'bl', 'الرمز الثاني يوصل لغرفة بلوت (لعبتها الصحيحة)');
    await req('POST', '/api/rooms/leave', { room_id: crUn.json.room.id }, H.cookie);
    await req('POST', '/api/rooms/leave', { room_id: crBl.json.room.id }, H.cookie);
  }

  console.log('── [تسوية الفرق] مقاعد زوجية — أونو الثنائية تسوّى الآن ──');
  {
    const A = await newUser('ts1_' + tag), B = await newUser('ts2_' + tag);
    const g0 = await Promise.all([goldOf(A), goldOf(B)]);
    const cr = await req('POST', '/api/rooms', { game_id: 'un', max_players: 2, bet: 10 }, A.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, B.cookie);
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, A.cookie);
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, B.cookie);
    await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    /* أونو ترسل t0/t1 دائماً من واجهتها — الخادم الآن يقبل مقعدين */
    const st = await req('POST', '/api/rooms/settleTeamRound', { room_id: rid, result: 't1' }, A.cookie);
    ok(st.status === 200 && st.json.teamSplit === true, 'تسوية t1 في غرفة ثنائية ⇒ 200 (كانت 400 «لـ4 مقاعد فقط» فتعلق إيداعات أونو)');
    const g1 = await Promise.all([goldOf(A), goldOf(B)]);
    ok(g1[1] === g0[1] + 9.5 && g1[0] === g0[0] - 10, 'المقعد 1 (t1): دفع 10 واستلم 19.5 (صافي +9.5 بعد رسم 0.5)؛ المقعد 0 خسر رهانه');
    await req('POST', '/api/rooms/leave', { room_id: rid }, A.cookie);
    await req('POST', '/api/rooms/leave', { room_id: rid }, B.cookie);
  }

  console.log('── [سجل الحركات] unmove تُسجَّل وتُعاد للعائد ──');
  {
    const H = await newUser('rp1_' + tag), G = await newUser('rp2_' + tag);
    const sink = [];
    const ctl = sseListener(G.cookie, sink);
    const cr = await req('POST', '/api/rooms', { game_id: 'un', max_players: 2, bet: 5 }, H.cookie);
    const rid = cr.json.room.id, code = cr.json.room.code;
    await req('POST', '/api/rooms/join', { code }, G.cookie);
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, H.cookie);
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, G.cookie);
    await req('POST', '/api/rooms/start', { room_id: rid }, H.cookie);
    await sleep(300);
    /* المضيف يبث init عبر unmove — يجب أن تصل الضيف عبر SSE */
    const mv = await req('POST', '/api/rooms/move', { room_id: rid, action: 'unmove', data: { action: 'init', data: { seed: 77, order: [H.id, G.id], names: ['h', 'g'], target: 500, teams: false }, by: H.id, seq: 1 } }, H.cookie);
    ok(mv.status === 200, 'unmove من المضيف ⇒ 200');
    await sleep(400);
    const gotMove = sink.some(e => e.event === 'room:move' && e.data.action === 'unmove' && e.data.data && e.data.data.action === 'init');
    ok(gotMove, 'الضيف استقبل unmove/init عبر SSE (بث الحركات المسمّاة يعمل)');
    /* إعادة اتصال مع since متقادم ⇒ room:replay يحوي الحركة */
    const sink2 = [];
    const ctl2 = sseListener(G.cookie, sink2, '?since=0');
    await sleep(500);
    const gotReplay = sink2.some(e => e.event === 'room:replay' && Array.isArray(e.data.history) && e.data.history.some(h => h.action === 'unmove' && h.data && h.data.action === 'init'));
    ok(gotReplay, 'room:replay للعائد يحوي unmove/init (كانت الحركات المسمّاة لا تُسجَّل — اللاعب الثاني لا يبني لوحته)');
    try { ctl.abort(); ctl2.abort(); } catch (e) {}
    await req('POST', '/api/rooms/leave', { room_id: rid }, H.cookie);
    await req('POST', '/api/rooms/leave', { room_id: rid }, G.cookie);
  }

  console.log('\n════════════════════════════');
  console.log('النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
