/* ═════════════════════════════════════════════════════════════════════
   [v2.27 blindResult] اختبار الاختيار الأعمى الزوجي (pn/rp) على الخادم:
     1) قيمة الاختيار لا تُبث للخصم قبل اكتمال الزوج (لا تسريب)
     2) الخصم يستقبل 'blind' بلا قيمة (يعرف أن الخصم اختار فقط)
     3) عند اكتمال الزوج يُبث 'blindResult' بـ dirs كاملة للطرفين
     4) غير المشارك في الغرفة مرفوض (403)
   تشغيل: PORT الخادم 3000 · DM_TEST_MODE=1 · node tests/_blind_pair_test.js
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

/* مستمع SSE يجمع أحداث room:move */
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
        if (ev && dt) sink.push({ event: ev[1], raw: dt[1], data: JSON.parse(dt[1]) });
      }
    }
  })().catch(() => {});
  return ctl;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const tag = Date.now() % 100000;
  const P1 = await newUser('blp1_' + tag);
  const P2 = await newUser('blp2_' + tag);
  const P3 = await newUser('blp3_' + tag);   /* دخيل للاختبار السلبي */

  /* غرفة ركلات جزاء (pn) */
  const cr = await req('POST', '/api/rooms', { game_id: 'pn', max_players: 2, bet: 10 }, P1.cookie);
  const roomId = cr.json.room.id;
  ok(!!roomId, 'غرفة pn أُنشئت');
  await req('POST', '/api/rooms/join', { code: cr.json.room.code }, P2.cookie);
  await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P1.cookie);
  await req('POST', '/api/rooms/ready', { room_id: roomId, ready: true }, P2.cookie);
  await req('POST', '/api/rooms/start', { room_id: roomId }, P1.cookie);

  /* P2 يستمع */
  const events = [];
  const ctl = sseListener(P2.cookie, events);
  await sleep(400);

  /* 1) P1 يختار — لا تسريب لقيمته */
  await req('POST', '/api/rooms/move', { room_id: roomId, action: 'blind', data: { d: 'L' } }, P1.cookie);
  await sleep(400);
  const blinds = events.filter(e => e.event === 'room:move' && e.data.action === 'blind');
  const results = events.filter(e => e.event === 'room:move' && e.data.action === 'blindResult');
  ok(blinds.length === 1, 'وصل blind واحد للخصم بعد أول اختيار');
  ok(blinds[0] && blinds[0].data.data && blinds[0].data.data.d === undefined, 'blind بلا قيمة (لا يعرف ماذا اختار الخصم)');
  ok(!blinds.some(e => e.raw.includes('"L"')), 'قيمة اختيار P1 غير مسرَّبة في البث الخام');
  ok(results.length === 0, 'لا blindResult قبل اكتمال الزوج');

  /* 4) دخيل غير مشارك مرفوض */
  const intruder = await req('POST', '/api/rooms/move', { room_id: roomId, action: 'blind', data: { d: 'C' } }, P3.cookie);
  ok(intruder.status === 403, 'غير المشارك مرفوض 403');

  /* 2+3) P2 يختار — يكتمل الزوج ⇒ blindResult بالخريطتين */
  await req('POST', '/api/rooms/move', { room_id: roomId, action: 'blind', data: { d: 'R' } }, P2.cookie);
  await sleep(400);
  const res2 = events.filter(e => e.event === 'room:move' && e.data.action === 'blindResult');
  ok(res2.length === 1, 'blindResult بُثّ عند اكتمال الزوج');
  const dirs = res2[0] && res2[0].data.data && res2[0].data.data.dirs;
  ok(!!dirs && dirs[String(P1.id)] === 'L' && dirs[String(P2.id)] === 'R',
    'dirs تحمل قيمتي الطرفين (P1=L P2=R): ' + JSON.stringify(dirs));

  /* جولة ثانية: لا اختيارات شبحية من الجولة الأولى */
  events.length = 0;
  await req('POST', '/api/rooms/move', { room_id: roomId, action: 'blind', data: { d: 'C' } }, P1.cookie);
  await sleep(350);
  const res3 = events.filter(e => e.event === 'room:move' && e.data.action === 'blindResult');
  ok(res3.length === 0, 'الجولة التالية نظيفة — لا blindResult فوري من بقايا الجولة السابقة');

  ctl.abort();
  console.log('\n═══ BLIND-PAIR: ' + pass + '/' + (pass + fail) + ' passed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
