/* FLAT DOG (rn) settle/timeout integration: fee math, owner-only auth,
   insufficient balance, seat-swap + queue promotion. Hits the live server on :3000. */
const http = require('http');
const BASE = { host: 'localhost', port: 3000 };

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
  return { name, cookie: r.cookie, id: r.json && r.json.user && r.json.user.id, gold: r.json && r.json.user && r.json.user.gold };
}

(async () => {
  const results = [];
  const ok = (n, c) => { results.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
  const tag = Date.now() % 100000;
  const OWNER = await newUser('rnso_' + tag);
  const P2 = await newUser('rnst_' + tag);
  const P3 = await newUser('rnsw_' + tag);
  const P4 = await newUser('rnsq_' + tag);   /* will spectate + queue */

  /* create room rn, max 3 (so owner+p2+p3 fills it; p4 spectates) */
  /* [v2.27] الرهان إلزامي منذ 08-31 — بدونه يرفض الخادم (bet_required) */
  const cr = await req('POST', '/api/rooms', { game_id: 'rn', max_players: 3, bet: 10 }, OWNER.cookie);
  const code = cr.json.room.code;
  const roomId = cr.json.room.id;
  ok('room created (rn, max3)', !!roomId);

  await req('POST', '/api/rooms/join', { code }, P2.cookie);
  await req('POST', '/api/rooms/join', { code }, P3.cookie);
  /* p4 joins as spectator then requests a seat (queued, room full) */
  await req('POST', '/api/rooms/join', { code, spectate: true }, P4.cookie);
  const jq = await req('POST', '/api/rooms/joinRequest', { room_id: roomId }, P4.cookie);
  const inQueue = (jq.json.room.joinQueue || []).some(q => q.id === P4.id);
  ok('p4 in join queue (spectator)', inQueue);

  /* ── settle: owner-only auth ── */
  const settleNoAuth = await req('POST', '/api/rooms/settle', { room_id: roomId, loser: P2.name, winner: P3.name, amount: 100 });
  ok('settle rejects non-owner (403)', settleNoAuth.status === 403);
  const settleByP2 = await req('POST', '/api/rooms/settle', { room_id: roomId, loser: P2.name, winner: P3.name, amount: 100 }, P2.cookie);
  ok('settle rejects non-owner player (403)', settleByP2.status === 403);

  /* ── settle: fee math ── */
  const s = await req('POST', '/api/rooms/settle', { room_id: roomId, loser: P2.name, winner: P3.name, amount: 100 }, OWNER.cookie);
  ok('settle ok', !!(s.json && s.json.ok));
  const fee = Math.round(100 * 0.05);
  ok('fee = round(amt*0.05) = 5', s.json && s.json.fee === fee && fee === 5);
  const p2GoldBefore = P2.gold, p3GoldBefore = P3.gold;
  ok('loser gold = start - 100', s.json && s.json.loser && s.json.loser.gold === p2GoldBefore - 100);
  ok('winner gold = start + (100 - fee)', s.json && s.json.winner && s.json.winner.gold === p3GoldBefore + (100 - fee));

  /* confirm via /api/me on each account */
  const meP2 = await req('GET', '/api/me', null, P2.cookie);
  const meP3 = await req('GET', '/api/me', null, P3.cookie);
  ok('/api/me loser gold persisted', meP2.json && meP2.json.user && meP2.json.user.gold === p2GoldBefore - 100);
  ok('/api/me winner gold persisted', meP3.json && meP3.json.user && meP3.json.user.gold === p3GoldBefore + (100 - fee));

  /* ── settle: insufficient balance (loser now has little; amount huge) ── */
  const sIns = await req('POST', '/api/rooms/settle', { room_id: roomId, loser: P2.name, winner: P3.name, amount: 999999 }, OWNER.cookie);
  ok('settle rejects insufficient loser balance (400)', sIns.status === 400);

  /* ── timeoutSeat: owner-only + seat-swap + promotion ── */
  const toNoAuth = await req('POST', '/api/rooms/timeoutSeat', { room_id: roomId, playerId: P3.id });
  ok('timeoutSeat rejects non-owner (403)', toNoAuth.status === 403);
  const to = await req('POST', '/api/rooms/timeoutSeat', { room_id: roomId, playerId: P3.id }, OWNER.cookie);
  ok('timeoutSeat ok', !!(to.json && to.json.ok));
  const players = (to.json.room && to.json.room.players) || [];
  const p3now = players.find(p => p.id === P3.id);
  ok('timed-out player now spectator', p3now && p3now.spectate === true);
  const order = (to.json.room && to.json.room.order) || [];
  ok('timed-out player removed from active order', !order.some(id => id === P3.id));
  ok('queued spectator promoted to active seat', order.some(id => id === P4.id));
  ok('queue emptied after promotion', (to.json.room.joinQueue || []).length === 0);

  /* settle records a transfer entry — [v2.27] /api/transfers يعيد معاملات صاحب الجلسة فقط؛
     التسوية تُسجَّل في سجل كل طرف: الفائز (P3) يرى win من الخاسر (P2) */
  const tl = await req('GET', '/api/transfers', null, P3.cookie);
  const recorded = (tl.json && tl.json.transfers || []).some(t => t.type === 'win' && t.from_name === P2.name && t.to_name === P3.name);
  ok('settlement recorded in transfers', recorded);

  const passed = results.filter(r => r[1]).length;
  console.log('\n═══ FLAT DOG settle/timeout integration: ' + passed + '/' + results.length + ' passed ═══');
  process.exit(passed === results.length ? 0 : 1);
})();
