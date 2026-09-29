/* ═════════════════════════════════════════════════════════════════════
   [v2.67] اختبارات الغرف: المزامنة والمحاسبة والأمان
     1) [H2] أونو (un) والبلوت (bl) في القائمة البيضاء — كانتا 400
     2) [H2] كل معرفات الألعاب الـ17 مقبولة
     3) [H3] ترقيم rev: يبدأ 0 ويرتفع مع كل حدث ويصل في room:move
     4) [H3] المصالحة: ‎?since=rev يبث room:replay للمتخلف فقط
     5) [مال] الإيداع عند البدء + الاسترداد عند المغادرة (كان يُحرق)
     6) [مال] إنهاء الجولة بلا تسوية يسترد الكل (كان يحرق الكل)
     7) [مال] التسوية توزّع مجموع الإيداعات الفعلي فقط (لا ضخ من فراغ)
     8) [مال] إعادة المباراة تقتطع رهاناً جديداً (كانت تطبع أرباحاً بلا اقتطاع)
     9) [معرّفات] معرّفات الغرف رتيبة عبر إعادة التشغيل (جدول meta)
    10) [C1] دردشة الغرفة وحركاتها لأعضائها المصادقين فقط
    11) [أشباح] المنظّف يغادر المنقطع مع استرداد إيداعه
   تشغيل: PORT الخادم 3000 · DM_TEST_MODE=1 · DTSG_GHOST_GRACE_MS=1
          node tests/_rooms_v267_test.js
   ═════════════════════════════════════════════════════════════════════ */
'use strict';
const BASE = 'http://localhost:3000';
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

/* مستمع SSE يجمع الأحداث */
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
const gold = async (p) => await goldOf(p);

(async () => {
  const tag = Date.now() % 100000;
  console.log('── [H2] أونو والبلوت في القائمة البيضاء ──');
  const H = await newUser('h267_' + tag);
  {
    const un = await req('POST', '/api/rooms', { game_id: 'un', max_players: 4, bet: 5 }, H.cookie);
    ok(un.status === 200 && un.json.ok && un.json.room.game_id === 'un', 'غرفة أونو (un) تُنشأ — كانت تُرفض 400 «لعبة غير مدعومة»');
    const bl = await req('POST', '/api/rooms', { game_id: 'bl', max_players: 4, bet: 5 }, H.cookie);
    ok(bl.status === 200 && bl.json.ok && bl.json.room.game_id === 'bl', 'غرفة بلوت (bl) تُنشأ — كانت تُرفض 400 «لعبة غير مدعومة»');
    const bad = await req('POST', '/api/rooms', { game_id: 'zz', max_players: 2, bet: 5 }, H.cookie);
    ok(bad.status === 400, 'معرف لعبة غير معروف يظل مرفوضاً 400 (حراسة القائمة)');
  }
  {
    console.log('── [H2] مصفوفة الألعاب الـ17 ──');
    const ids = ['rp', 'pn', 'pr', 'rn', 'rm', 'rd', 'dm', 'ch', 'bg', 'do', 'bl8', 'blbb', 'blgv', 'blsn', 'blca', 'un', 'bl'];
    let allOk = true;
    for (const g of ids) {
      const r = await req('POST', '/api/rooms', { game_id: g, max_players: 2, bet: 1 }, H.cookie);
      if (!(r.status === 200 && r.json.ok)) { allOk = false; console.log('    ✗ فشل: ' + g); }
    }
    ok(allOk, '17/17 معرف لعبة مقبول في إنشاء الغرف');
  }

  console.log('── [H3] ترقيم rev والمصالحة ──');
  const A = await newUser('a267_' + tag), B = await newUser('b267_' + tag);
  {
    const sink = [];
    const ctl = sseListener(A.cookie, sink);
    await sleep(300);
    const cr = await req('POST', '/api/rooms', { game_id: 'rm', max_players: 2, bet: 10 }, A.cookie);
    const roomId = cr.json.room.id;
    ok(cr.json.room.rev === 0, 'الغرفة تولد بترقيم rev=0');
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, B.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, B.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, A.cookie);
    await req('POST', '/api/rooms/start', { room_id: roomId }, A.cookie);
    await sleep(300);
    await req('POST', '/api/rooms/move', { room_id: roomId, action: 'rmove', data: { action: 'm1', dedup: 'd1' }, state: {} }, A.cookie);
    await sleep(300);
    const updates = sink.filter(e => e.event === 'room:update' && e.data && e.data.id === roomId);
    const moves = sink.filter(e => e.event === 'room:move' && e.data && e.data.room_id === roomId);
    const lastRev = updates.length ? updates[updates.length - 1].data.rev : -1;
    ok(lastRev >= 3, 'rev يرتفع مع الأحداث (join/ready/start/move) — آخر قيمة ' + lastRev);
    ok(moves.length > 0 && moves[moves.length - 1].data.rev != null, 'حمولة room:move تحمل rev');
    ctl.abort();

    /* المصالحة: since متقادم ← replay، منذ محدث ← لا replay */
    const sink2 = [];
    const ctl2 = sseListener(B.cookie, sink2, '?since=0');
    await sleep(400);
    const replays2 = sink2.filter(e => e.event === 'room:replay' && e.data.room_id === roomId);
    ok(replays2.length === 1 && Array.isArray(replays2[0].data.history) && replays2[0].data.history.length >= 1,
      '‎?since=0 (متقادم) ← بثّ room:replay بسجل الحركات');
    ctl2.abort();
    const sink3 = [];
    const ctl3 = sseListener(B.cookie, sink3, '?since=999999');
    await sleep(400);
    const replays3 = sink3.filter(e => e.event === 'room:replay');
    ok(replays3.length === 0, '‎?since=حدَث (مواكب) ← لا room:replay (لا إعادة بناء بلا داعٍ)');
    ctl3.abort();
    await req('POST', '/api/rooms/leave', { room_id: roomId }, B.cookie);
    await req('POST', '/api/rooms/leave', { room_id: roomId }, A.cookie);
  }

  console.log('── [مال] الإيداع والاسترداد عند المغادرة ──');
  {
    const P1 = await newUser('m1_' + tag), P2 = await newUser('m2_' + tag);
    const g1a = await gold(P1), g2a = await gold(P2);
    const cr = await req('POST', '/api/rooms', { game_id: 'ch', max_players: 2, bet: 25 }, P1.cookie);
    const roomId = cr.json.room.id;
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, P2.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P2.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P1.cookie);
    await req('POST', '/api/rooms/start', { room_id: roomId }, P1.cookie);
    const g1b = await gold(P1), g2b = await gold(P2);
    ok(g1b === g1a - 25 && g2b === g2a - 25, 'البدء اقتطع الرهان من اللاعبَين (إيداع)');
    /* مغادرة الضيف أثناء الجولة → استرداده */
    await req('POST', '/api/rooms/leave', { room_id: roomId }, P2.cookie);
    const g2c = await gold(P2);
    ok(g2c === g2a, 'مغادرة الضيف أثناء جولة غير مسوّاة استردت رهانه كاملاً (كان يُحرق)');
    /* المضيف ينهي بلا تسوية → استرداده */
    const end = await req('POST', '/api/rooms/endBet', { room_id: roomId }, P1.cookie);
    const g1c = await gold(P1);
    ok(g1c === g1a, 'إنهاء الجولة بلا تسوية استرد إيداع المضيف (كان يُحرق)');
    await req('POST', '/api/rooms/leave', { room_id: roomId }, P1.cookie);
  }

  console.log('── [مال] التسوية توزّع الإيداعات الفعلية فقط ──');
  {
    const P1 = await newUser('s1_' + tag), P2 = await newUser('s2_' + tag);
    const g1a = await gold(P1), g2a = await gold(P2);
    const cr = await req('POST', '/api/rooms', { game_id: 'ch', max_players: 2, bet: 20 }, P1.cookie);
    const roomId = cr.json.room.id;
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, P2.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P2.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P1.cookie);
    await req('POST', '/api/rooms/start', { room_id: roomId }, P1.cookie);
    const st = await req('POST', '/api/rooms/settleRound', { room_id: roomId, result: 'w0' }, P1.cookie);
    const g1b = await gold(P1), g2b = await gold(P2);
    /* الفائز: إيداعاه (40) ناقص رسم 5% من رهانه (1) = 39 ربحاً صافياً؛ صافيه 1000-20+39 */
    ok(st.status === 200 && st.json.ok && st.json.payout === 39, 'التسوية وضعت payout = مجموع الإيداعات - الرسم (39)');
    ok(g1b === g1a - 20 + 39, 'رصيد الفائز: -20 إيداع +39 توزيع = ' + (g1b - g1a) + ' (دقيق)');
    ok(g2b === g2a - 20, 'رصيد الخاسر: خصم إيداعه فقط');
    /* التسوية المزدوجة مرفوضة */
    const dup = await req('POST', '/api/rooms/settleRound', { room_id: roomId, result: 'w0' }, P1.cookie);
    ok(dup.status === 400, 'تسوية الجولة نفسها مرتين مرفوضة (بقايا المكتسبات)');
    const g1c = await gold(P1);
    await req('POST', '/api/rooms/leave', { room_id: roomId }, P2.cookie);
    await req('POST', '/api/rooms/leave', { room_id: roomId }, P1.cookie);
    ok(g1c === g1b, 'لا تغيير بعد التسوية المزدوجة المرفوضة');
  }

  console.log('── [مال] التعادل يسترد الإيداعات ──');
  {
    const P1 = await newUser('d1_' + tag), P2 = await newUser('d2_' + tag);
    const g1a = await gold(P1), g2a = await gold(P2);
    const cr = await req('POST', '/api/rooms', { game_id: 'ch', max_players: 2, bet: 15 }, P1.cookie);
    const roomId = cr.json.room.id;
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, P2.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P2.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P1.cookie);
    await req('POST', '/api/rooms/start', { room_id: roomId }, P1.cookie);
    const st = await req('POST', '/api/rooms/settleRound', { room_id: roomId, result: 'draw' }, P1.cookie);
    const g1b = await gold(P1), g2b = await gold(P2);
    ok(st.status === 200 && g1b === g1a && g2b === g2a, 'التعادل: كل لاعب استرد إيداعه كاملاً');
    await req('POST', '/api/rooms/leave', { room_id: roomId }, P2.cookie);
    await req('POST', '/api/rooms/leave', { room_id: roomId }, P1.cookie);
  }

  console.log('── [مال] إعادة المباراة تقتطع رهاناً جديداً (لا ضخ نقود) ──');
  {
    const P1 = await newUser('r1_' + tag), P2 = await newUser('r2_' + tag);
    const g1a = await gold(P1), g2a = await gold(P2);
    const cr = await req('POST', '/api/rooms', { game_id: 'ch', max_players: 2, bet: 10 }, P1.cookie);
    const roomId = cr.json.room.id;
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, P2.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P2.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P1.cookie);
    await req('POST', '/api/rooms/start', { room_id: roomId }, P1.cookie);
    /* الجولة 1: يفوز المضيف */
    await req('POST', '/api/rooms/settleRound', { room_id: roomId, result: 'w0' }, P1.cookie);
    const g1b = await gold(P1), g2b = await gold(P2);
    /* تصويت إعادة المباراة */
    await req('POST', '/api/rooms/rematch/start', { room_id: roomId }, P1.cookie);
    await req('POST', '/api/rooms/rematch/vote', { room_id: roomId, vote: 'agree' }, P1.cookie);
    await req('POST', '/api/rooms/rematch/vote', { room_id: roomId, vote: 'agree' }, P2.cookie);
    const g1c = await gold(P1), g2c = await gold(P2);
    ok(g1c === g1b - 10 && g2c === g2b - 10, 'إعادة المباراة اقتطعت رهاناً جديداً من الطرفين (كانت بلا اقتطاع)');
    /* الجولة 2: تعادل → الاسترداد */
    await req('POST', '/api/rooms/settleRound', { room_id: roomId, result: 'draw' }, P1.cookie);
    const g1d = await gold(P1), g2d = await gold(P2);
    ok(g1d === g1c + 10 && g2d === g2c + 10, 'جولة إعادة المباراة تسوّى بالإيداعات الجديدة');
    /* المحصلة بعد جولتين: الفائز ربح إيداع الخصم (10) ناقص رسم 0.5 = +9.5؛ الخاسر خسر رهانه */
    ok(g1d === g1a + 9.5 && g2d === g2a - 10, 'المحصلة المالية بعد جولتين دقيقة 100% (فائز +9.5 بعد رسم، خاسر -10)');
    await req('POST', '/api/rooms/leave', { room_id: roomId }, P2.cookie);
    await req('POST', '/api/rooms/leave', { room_id: roomId }, P1.cookie);
  }

  console.log('── [C1] الدردشة والحركة لأعضاء مصادقين فقط ──');
  {
    const P1 = await newUser('c1_' + tag), P2 = await newUser('c2_' + tag), OUT = await newUser('c3_' + tag);
    const cr = await req('POST', '/api/rooms', { game_id: 'rm', max_players: 2, bet: 5 }, P1.cookie);
    const roomId = cr.json.room.id;
    /* قراءة السجل بلا مصادقة */
    const anon = await req('GET', '/api/rooms/' + roomId + '/chat');
    ok(anon.status === 401, 'قراءة دردشة الغرفة بلا جلسة ← 401 (كانت 200 مكشوفة)');
    /* قراءة من غير عضو */
    const outsider = await req('GET', '/api/rooms/' + roomId + '/chat', null, OUT.cookie);
    ok(outsider.status === 403, 'قراءة الدردشة من غير عضو ← 403');
    /* إرسال مجهول */
    const anonPost = await req('POST', '/api/rooms/chat', { room_id: roomId, text: 'تطفل' });
    ok(anonPost.status === 401, 'إرسال دردشة مجهولاً ← 401 (كان يُقبل باسم «زائر»)');
    /* عضو يقرأ ويرسل */
    const memberGet = await req('GET', '/api/rooms/' + roomId + '/chat', null, P1.cookie);
    ok(memberGet.status === 200 && memberGet.json.ok, 'العضو المصادق يقرأ الدردشة');
    const memberPost = await req('POST', '/api/rooms/chat', { room_id: roomId, text: 'سلام' }, P1.cookie);
    ok(memberPost.status === 200 && memberPost.json.ok && memberPost.json.msg.from_name === P1.name, 'العضو يرسل رسالة باسمه');
    /* حركة من غير عضو/مجهول */
    const mvAnon = await req('POST', '/api/rooms/move', { room_id: roomId, action: 'x', data: {} });
    ok(mvAnon.status === 401, 'حركة بلا جلسة ← 401 (كانت تُقبل وتُبث!)');
    const mvOut = await req('POST', '/api/rooms/move', { room_id: roomId, action: 'x', data: {} }, OUT.cookie);
    ok(mvOut.status === 403, 'حركة من غير عضو ← 403 (حقن الحركات مقفول)');
    const mvP2 = await req('POST', '/api/rooms/move', { room_id: roomId, action: 'x', data: {} }, P2.cookie);
    ok(mvP2.status === 403, 'حركة من لاعب خارج الغرفة (لم ينضم) ← 403');
    /* [v2.68·عزل] حركة العضو بأكشن معتمد لهذه اللعبة ← 200 (غرفة rm ⇒ rmove) */
    const mvP1 = await req('POST', '/api/rooms/move', { room_id: roomId, action: 'rmove', data: { action: 'init', data: {}, by: 1, seq: 1 } }, P1.cookie);
    ok(mvP1.status === 200 && mvP1.json.ok, 'حركة العضو المصادق بأكشن معتمد ← 200');
    /* [v2.68·عزل] حقن حركة لعبة أخرى (unmove) في غرفة رامي ← 400 (كانت تُمرَّر عمياء) */
    const mvInject = await req('POST', '/api/rooms/move', { room_id: roomId, action: 'unmove', data: {} }, P1.cookie);
    ok(mvInject.status === 400, 'حركة أونو في غرفة رامي ← 400 مرفوضة (عزل الألعاب)');
    await req('POST', '/api/rooms/leave', { room_id: roomId }, P1.cookie);
  }

  console.log('── [أشباح] المنظّف يغادر المنقطع مع استرداده ──');
  {
    const P1 = await newUser('gh1_' + tag), P2 = await newUser('gh2_' + tag);
    const g1a = await gold(P1), g2a = await gold(P2);
    const cr = await req('POST', '/api/rooms', { game_id: 'ch', max_players: 2, bet: 10 }, P1.cookie);
    const roomId = cr.json.room.id;
    await req('POST', '/api/rooms/join', { code: cr.json.room.code }, P2.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P2.cookie);
    await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P1.cookie);
    await req('POST', '/api/rooms/start', { room_id: roomId }, P1.cookie);
    /* لا اتصال SSE لأي طرف + مهلة سماح 1ms عبر مقبض الاختبار ← دورة التنظيف */
    await sleep(80);
    const swept = await req('POST', '/api/__test/ghost-sweep', { grace_ms: 1 });
    ok(swept.status === 200 && swept.json && swept.json.ok, 'مقبض دورة التنظيف يعمل (باب اختبار DM_TEST_MODE)');
    const g1b = await gold(P1), g2b = await gold(P2);
    ok(g1b === g1a && g2b === g2a, 'المنقطعون بلا حضور استُردت إيداعاتهم وغادروا (المنظّف)');
    /* الغرفة حُلّت: مسار ready يعيد room=null للغرفة المحذوفة */
    const rd = await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P1.cookie);
    ok(rd.json && rd.json.room == null, 'الغرفة الفارغة أُغلقت تلقائياً بعد رحيل الأشباح (حُلّت فعلاً — لا مجرد اختفاء من القائمة العامة)');
  }

  console.log('── [معرّفات] رتابة معرّفات الغرف عبر إعادة التشغيل ──');
  {
    /* أنشئ غرفة ثم افتح الخادم مرة ثانية على منفذ آخر بنفس القاعدة:
       عدّاد meta يمنع إعادة استخدام المعرفات بعد إعادة التشغيل */
    const { DatabaseSync } = require('node:sqlite');
    let metaNext = 0;
    try {
      const db2 = new DatabaseSync(require('path').join(__dirname, '..', 'data', 'royalcoin.db'), { readOnly: true });
      const row = db2.prepare("SELECT value FROM meta WHERE key = 'next_room_id'").get();
      metaNext = row ? parseInt(row.value, 10) : 0;
      db2.close();
    } catch (e) {}
    const cr = await req('POST', '/api/rooms', { game_id: 'rm', max_players: 2, bet: 3 }, (await newUser('id_' + tag)).cookie);
    const newId = parseInt((cr.json.room.id || 'r0').slice(1), 10);
    ok(newId >= metaNext && metaNext > 0, 'معرّف الغرفة الجديدة ≥ آخر عدّاد محفوظ في meta (' + newId + ' ≥ ' + metaNext + ') — لا وراثة معرفات');
    await req('POST', '/api/rooms/leave', { room_id: cr.json.room.id }, null);
  }

  console.log('\n════════════════════════════');
  console.log('النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
