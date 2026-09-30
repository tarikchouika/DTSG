/* RD v2.5 — server-side settle check for 2v2 team rooms (split the pot)
   Creates a 4-seat rd room with 4 humans (bet 10 each → pool 40),
   starts it (bets deducted server-side), then the HOST settles the round
   with result 't0' → winning team = seats 0 & 2 (host + u3) split the pot:
   each winner receives (40 − 5% fee)/2 = 19; losers stay at −10 each.
   Verifies the split math, idempotence guard and host-only guard.
   Pure-API (no browser page needed).
   Run: node tests/_rd_v2_settle_probe.js   (server :4173 DM_TEST_MODE=1) */
'use strict';
const { request } = require('playwright');
const BASE = 'http://localhost:4173';
let pass = 0, fail = 0;
function ok(label) { pass++; console.log('  ✅ ' + label); }
function bad(label) { fail++; console.log('  ❌ ' + label); }

async function user(name) {
  const ctx = await request.newContext({ baseURL: BASE });
  await ctx.post('/api/register', { data: { username: name, password: 'pw123456' } }).catch(() => {});
  await ctx.post('/api/login', { data: { username: name, password: 'pw123456' } }).catch(() => {});
  return ctx;
}
async function me(ctx) {
  const r = await ctx.get('/api/me');
  return (r.ok) ? (await r.json()).user || (await r.json()) : null;
}

(async () => {
  const stamp = Date.now() % 1000000;
  const A = await user('rdsa_' + stamp);
  const B = await user('rdsb_' + stamp);
  const C = await user('rdsc_' + stamp);
  const D = await user('rdsd_' + stamp);

  const goldBefore = {};
  for (const [n, u] of [['A', A], ['B', B], ['C', C], ['D', D]]) {
    const m = await me(u);
    goldBefore[n] = m ? m.gold : 0;
  }
  const roomRes = await A.post('/api/rooms', { data: {
    game_id: 'rd', max_players: 4, bet: 10, room_type: 'percentage', visibility: 'public',
    game_opts: { maxp: 4, target: 51 }
  } });
  const roomBody = await roomRes.json();
  if (!roomBody.ok) { bad('room create: ' + JSON.stringify(roomBody)); process.exit(1); }
  const code = roomBody.room.code;
  ok('4-seat room created (code ' + code + ')');

  for (const u of [B, C, D]) {
    const j = await u.post('/api/rooms/join', { data: { code: code } });
    if (!(await j.json()).ok) { bad('join failed'); process.exit(1); }
  }
  /* يلزم أن يكون الجميع جاهزين (المضيف + الضيوف) */
  for (const u of [A, B, C, D]) {
    await u.post('/api/rooms/ready', { data: { room_id: roomBody.room.id, ready: true } });
  }
  const start = await A.post('/api/rooms/start', { data: { room_id: roomBody.room.id } });
  if (!(await start.json()).ok) { bad('start failed: ' + JSON.stringify(await start.json())); process.exit(1); }
  ok('match started (bets deducted from all 4 humans)');

  const afterStart = {};
  for (const [n, u] of [['A', A], ['B', B], ['C', C], ['D', D]]) {
    const m = await me(u);
    afterStart[n] = m ? m.gold : 0;
  }
  ok('each player charged exactly 10 at start', [A, B, C, D].every((_, i) => afterStart['ABCD'[i]] === goldBefore['ABCD'[i]] - 10));

  /* تسوية الفريق 0 (المقاعد 0 و2 = A و C) — المضيف فقط */
  const settle = await A.post('/api/rooms/settleTeamRound', { data: { room_id: roomBody.room.id, result: 't0' } });
  const settleBody = await settle.json();
  if (settleBody.ok && settleBody.teamSplit) ok('team settle accepted: payout=' + settleBody.payout + ', fee=' + settleBody.fee);
  else { bad('team settle failed: ' + JSON.stringify(settleBody)); process.exit(1); }

  const afterSettle = {};
  for (const [n, u] of [['A', A], ['B', B], ['C', C], ['D', D]]) {
    const m = await me(u);
    afterSettle[n] = m ? m.gold : 0;
  }
  /* الفريق الفائز (المقاعد 0 و2): كل واحد يربح share=19 (بعد رسم 5% على الـ40) */
  const wNames = settleBody.winners.map(function (w) { return w.username; });
  const winnerSet = new Set(wNames);
  const expectWin = ['rdsa_' + stamp, 'rdsc_' + stamp];
  const sameTeam = expectWin.every(function (n) { return winnerSet.has(n); });
  const onlyTwo = settleBody.winners.length === 2;
  const winShare = settleBody.winners.every(function (w) { return w.share === 19; });
  const loseB2 = afterSettle.B === afterStart.B;
  const loseD2 = afterSettle.D === afterStart.D;
  ok('winning team is host + third (seats 0&2): ' + wNames.join(', '), sameTeam && onlyTwo);
  ok('each winner credited exactly +19 (split of net 38)', winShare &&
     afterSettle.A === afterStart.A + 19 && afterSettle.C === afterStart.C + 19);
  ok('losing team (B & D) not credited (kept −10 each)', loseB2 && loseD2);

  /* منع التكرار: تسوية ثانية ترفض */
  const again = await A.post('/api/rooms/settleTeamRound', { data: { room_id: roomBody.room.id, result: 't1' } });
  const againBody = await again.json();
  ok('second settle rejected (idempotence)', !againBody.ok);
  /* غير المضيف يرفض */
  const other = await B.post('/api/rooms/settleTeamRound', { data: { room_id: roomBody.room.id, result: 't0' } });
  ok('non-host settle rejected (host-only)', !(await other.json()).ok);

  console.log('\n═══ RD v2.5 settle-team probe: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
