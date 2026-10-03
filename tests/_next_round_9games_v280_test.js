/* ═══ [v2.80] فحص الانتقال للجولة التالية بعد التصويت — الألعاب التسع ═══
   العقد الموحّد لكل لعبة وجهاً لوجه (خادمياً عبر API حقيقي):
     بدء → اقتطاع → settleRound (فوز w0) → rematchStart → تصويت الطرفين
     → tryResolveRematch ⇒ الغرفة playing من جديد بescrow نظيف وsettled=null
     واقتطاع رهان المباراة المعادة وصف bet في السجل.
   الألعاب: bl un rm rd bg do dm ch rp (+ pn وbl8 كعينات إضافية) */
const http = require('http');
const SB = require('./_safe_base.js');
const BASE = { host: SB.host, port: SB.port };

function req(method, path, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { host: BASE.host, port: BASE.port, path, method,
      headers: { 'Content-Type': 'application/json' } };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    if (cookie) opts.headers.Cookie = cookie;
    const r = http.request(opts, (res) => {
      let buf = ''; res.on('data', d => buf += d); res.on('end', () => {
        let j; try { j = JSON.parse(buf); } catch (e) { j = buf; }
        resolve({ status: res.statusCode, json: j, cookie: (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ') });
      });
    });
    r.on('error', () => resolve({ status: 0, json: null }));
    if (data) r.write(data);
    r.end();
  });
}

async function newUser(name) {
  await req('POST', '/api/register', { username: name, password: 'pw123456' });
  const r = await req('POST', '/api/login', { username: name, password: 'pw123456' });
  return { name, cookie: r.cookie, id: r.json && r.json.user && r.json.user.id, gold: r.json.user.gold };
}
const gold = (u) => req('GET', '/api/me', null, u.cookie).then(r => r.json.user.gold);

(async () => {
  const results = [];
  const ok = (n, c, extra) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n + (extra ? ' ' + (extra || '') : '')); };
  const tag = Date.now() % 100000;
  const GAMES = ['bl', 'un', 'rm', 'rd', 'bg', 'do', 'dm', 'ch', 'rp', 'pn', 'bl8'];

  for (const g of GAMES) {
    const A = await newUser('nx' + g + 'a_' + tag);
    const B = await newUser('nx' + g + 'b_' + tag);
    const gA0 = await gold(A), gB0 = await gold(B);
    /* إنشاء غرفة برهان 10 */
    const cr = await req('POST', '/api/rooms', { game_id: g, bet: 10, max_players: 2 }, A.cookie);
    if (cr.status !== 200 || !cr.json.room) { ok(g + ': create', false, JSON.stringify(cr.json).slice(0, 80)); continue; }
    const rid = cr.json.room.id || cr.json.room.room_id;
    const jr = await req('POST', '/api/rooms/join', { room_id: rid, code: cr.json.room.code }, B.cookie);
    if (jr.status !== 200) { ok(g + ': join', false, JSON.stringify(jr.json).slice(0, 80)); continue; }
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, A.cookie);
    await req('POST', '/api/rooms/ready', { room_id: rid, ready: true }, B.cookie);
    const sr = await req('POST', '/api/rooms/start', { room_id: rid }, A.cookie);
    if (sr.status !== 200) { ok(g + ': start', false, JSON.stringify(sr.json).slice(0, 90)); continue; }
    const gA1 = await gold(A), gB1 = await gold(B);
    ok(g + ': bet deducted at start (−10 each)', Math.abs(gA1 - (gA0 - 10)) < 0.02 && Math.abs(gB1 - (gB0 - 10)) < 0.02, '(ΔA=' + (gA1 - gA0) + ')');

    /* فوز المقعد 0 (A) — التسوية الخادمية الموحّدة */
    const st = await req('POST', '/api/rooms/settleRound', { room_id: rid, result: 'w0' }, A.cookie);
    ok(g + ': settleRound w0 accepted', st.status === 200, st.status !== 200 ? ('status=' + st.status + ' ' + JSON.stringify(st.json).slice(0, 70)) : '');
    const gA2 = await gold(A), gB2 = await gold(B);
    /* الجرة 20 − 5% = 19 للفائز */
    ok(g + ': winner paid 19 (pot − 5%)', Math.abs(gA2 - (gA1 + 19)) < 0.03, '(Δ=' + (gA2 - gA1) + ')');

    /* التصويت على المباراة الجديدة: البدء ثم موافقة الطرفين */
    const rs0 = await req('POST', '/api/rooms/rematch/start', { room_id: rid }, A.cookie);
    ok(g + ': rematch opens', rs0.status === 200 && rs0.json.room && !!rs0.json.room.rematch, JSON.stringify(rs0.json && rs0.json.room && rs0.json.room.rematch).slice(0, 60));
    const vA = await req('POST', '/api/rooms/rematch/vote', { room_id: rid, vote: 'agree' }, A.cookie);
    const vB = await req('POST', '/api/rooms/rematch/vote', { room_id: rid, vote: 'agree' }, B.cookie);
    const roomAfter = (vB.json && vB.json.room) || (vA.json && vA.json.room);
    ok(g + ': both agreed ⇒ match restarts (status=playing)', roomAfter && roomAfter.status === 'playing', roomAfter ? ('status=' + roomAfter.status) : 'no room');
    ok(g + ': rematch re-deducts fresh bet', Math.abs((await gold(A)) - (gA2 - 10)) < 0.03, '');
    ok(g + ': settled reset for the new match', roomAfter && roomAfter.settled === false, '');
    ok(g + ': rematch cleared', roomAfter && !roomAfter.rematch, '');
  }

  const failed = results.filter(r => !r[1]).length;
  console.log('\n═══ الانتقال بعد التصويت للألعاب: ' + (results.length - failed) + '/' + results.length + ' ═══');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
