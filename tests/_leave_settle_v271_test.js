/* ═══════════════════════════════════════════════════════════════════
   [v2.71] حرس المغادرة الفورية والتذاكر — خادمي بلا متصفح
   ───────────────────────────────────────────────────────────────────────
   يغطي توجيه المالك (2026-10-01):
     أ) الجولة تنتهي **مباشرة** عندما يغادر الخصوم (كلهم) — والباقي يفوز
        مباشرةً، ثم ينتقل التصويت على جولة جديدة فوراً.
     ب) المقعد الشاغر يملؤه الطابور آلياً **بعد** الجولة (لا أثناءها).
     ج) خروج الجميع من غرفة جارية ⇒ حلّ الغرفة آلياً (لا غرفة معلّقة).
     د) /api/rooms/active ترجع الغرفة الجارية لصاحبها (أساس استعادة الصفحة).
     هـ) التذاكر تُسجَّل في **كل** لعبة ومبلغ الرهان يُسوّى في السجل
        بدقة وبلا تكرار: الجولة تظهر **مرة واحدة** في السجل المدمج.
   تشغيل:  QA_BASE=http://127.0.0.1:3971/ node tests/_leave_settle_v271_test.js
           (خادم معزول — القاعدة 13 في AGENTS.md)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const SB = require('./_safe_base.js');
const BASE = SB.BASE;
let pass = 0, fail = 0;
function ok(cond, label) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tag = Date.now().toString(36);

async function api(method, path, body, cookie) {
  const r = await fetch(BASE + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { status: r.status, json, cookie: r.headers.get('set-cookie') ? r.headers.get('set-cookie').split(';')[0] : cookie };
}
async function mkUser(prefix) {
  const name = prefix + tag;
  await api('POST', '/api/register', { username: name, password: 'pw123456' });
  const l = await api('POST', '/api/login', { username: name, password: 'pw123456' });
  return { name, cookie: l.cookie, id: l.json.user.id, gold: l.json.user.gold };
}
const RAMI_OPTS = { mode: 'talaj', target: 'single', timer: 90 };
async function newRoom(owner, seats) {
  const cr = await api('POST', '/api/rooms', { game_id: 'rm', max_players: seats, bet: 10, game_opts: RAMI_OPTS }, owner.cookie);
  return { id: cr.json.room.id, code: cr.json.room.code };
}

(async function main() {
  /* ═══ أ) استعادة الغرفة الجارية ═══ */
  console.log('── [أ] استعادة الغرفة الجارية (/api/rooms/active) ──');
  {
    const a = await mkUser('v71a'), b = await mkUser('v71b');
    const r = await newRoom(a, 2);
    await api('POST', '/api/rooms/join', { code: r.code }, b.cookie);
    await api('POST', '/api/rooms/start', { room_id: r.id }, a.cookie);

    const forA = await api('GET', '/api/rooms/active', undefined, a.cookie);
    ok(forA.status === 200 && forA.json.ok && forA.json.room && forA.json.room.id === r.id,
      'ترجع الغرفة الجارية لصاحبها');
    const forB = await api('GET', '/api/rooms/active', undefined, b.cookie);
    ok(forB.json.room && forB.json.room.id === r.id, 'ترجع للطرف الثاني أيضاً');
    const stranger = await mkUser('v71x');
    const forX = await api('GET', '/api/rooms/active', undefined, stranger.cookie);
    ok(forX.json.room === null, 'لاعب بلا غرفة ⇒ null (لا غرفته)');
    const me = await api('GET', '/api/me', undefined, a.cookie);
    ok(me.json.user.gold === a.gold - 10, 'الرهان اقتُطع مرة واحدة عند البدء (لا تكرار)');
  }

  /* ═══ ب) مغادرة الخصوم ⇒ حسم فوري + تصويت جديد ═══ */
  console.log('── [ب] مغادرة كل الخصوم ⇒ الجولة تنتهي مباشرة ──');
  {
    const a = await mkUser('v71c'), b = await mkUser('v71d'), c = await mkUser('v71e'), d = await mkUser('v71f');
    const r = await newRoom(a, 4);
    for (const p of [b, c, d]) await api('POST', '/api/rooms/join', { code: r.code }, p.cookie);
    const st = await api('POST', '/api/rooms/start', { room_id: r.id }, a.cookie);
    ok(st.json.room.status === 'playing', 'رباعية: الجولة بدأت والرهان مقتطع');

    await api('POST', '/api/rooms/leave', { room_id: r.id }, d.cookie);
    await api('POST', '/api/rooms/leave', { room_id: r.id }, b.cookie);
    const mid = await api('GET', '/api/me', undefined, c.cookie);
    ok(mid.json.user.gold === c.gold - 10, 'رحيل خصم واحد والبقاء اثنان ⇒ الجولة لم تُحسم بعد');
    const liveRoom = await api('GET', '/api/rooms/active', undefined, a.cookie);
    ok(liveRoom.json.room.status === 'playing', 'الغرفة ما زالت جارية (البوت يكمل عن المغادر)');

    await api('POST', '/api/rooms/leave', { room_id: r.id }, c.cookie);
    await sleep(400);
    const w = await api('GET', '/api/me', undefined, a.cookie);
    ok(w.json.user.gold === a.gold - 10 + 38, 'الباقي وحده ربح الجرة كاملة بعد الرسم (38 من جرة 40)');

    const after = await api('GET', '/api/rooms/active', undefined, a.cookie);
    ok(after.json.room && after.json.room.rematch && !after.json.room.rematch.resolved,
      'انتقال مباشر للتصويت على جولة جديدة');
    ok(after.json.room.status === 'waiting', 'الغرفة تنتظر الجولة الجديدة (ليست playing بلا تسوية)');

    const tx = await api('GET', '/api/transfers', undefined, a.cookie);
    const bets = (tx.json.transfers || []).filter(t => t.type === 'bet');
    const wins = (tx.json.transfers || []).filter(t => t.type === 'win');
    ok(bets.length === 1, 'صف bet واحد للرابح (لا تكرار في المعاملات)');
    ok(wins.length === 1 && Math.abs(wins[0].amount - 38) < 0.01, 'صف win واحد بمبلغ الجرة بعد الرسم');

    const tk = await api('GET', '/api/rounds', undefined, a.cookie);
    const mine = (tk.json.rounds || []).filter(x => x.game_id === 'rm');
    ok(mine.length === 1 && mine[0].won === 1 && Math.abs(mine[0].payout - 38) < 0.01,
      'تذكرة الجولة للرابح: رهان 10 · فوز 38');
    const tkL = await api('GET', '/api/rounds', undefined, d.cookie);
    ok((tkL.json.rounds || []).filter(x => x.game_id === 'rm').length === 1,
      'تذكرة للمغادر أيضاً (رهان بلا فوز) — التذاكر في كل الجولات');
  }

  /* ═══ ج) خروج الجميع ⇒ حلّ الغرفة ═══ */
  console.log('── [ج] خروج الجميع ⇒ الغرفة تُحلّ آلياً ──');
  {
    const a = await mkUser('v71g'), b = await mkUser('v71h');
    const r = await newRoom(a, 2);
    await api('POST', '/api/rooms/join', { code: r.code }, b.cookie);
    await api('POST', '/api/rooms/start', { room_id: r.id }, a.cookie);
    await api('POST', '/api/rooms/leave', { room_id: r.id }, a.cookie);
    await api('POST', '/api/rooms/leave', { room_id: r.id }, b.cookie);
    await sleep(300);
    const gone = await api('GET', '/api/rooms/active', undefined, a.cookie);
    ok(gone.json.room === null, 'ثنائية: خروج الجميع يحلّ الغرفة');

    const c = await mkUser('v71i'), d = await mkUser('v71j'), e = await mkUser('v71k'), f = await mkUser('v71l');
    const r2 = await newRoom(c, 4);
    for (const p of [d, e, f]) await api('POST', '/api/rooms/join', { code: r2.code }, p.cookie);
    await api('POST', '/api/rooms/start', { room_id: r2.id }, c.cookie);
    for (const p of [c, d, e, f]) await api('POST', '/api/rooms/leave', { room_id: r2.id }, p.cookie);
    await sleep(300);
    const gone2 = await api('GET', '/api/rooms/active', undefined, c.cookie);
    ok(gone2.json.room === null, 'رباعية: خروج الجميع يحلّ الغرفة (لا غرفة معلّقة)');
  }

  /* ═══ د) الطابور يملأ المقعد الشاغر بعد الجولة ═══ */
  console.log('── [د] المقعد الشاغر يملؤه الطابور بعد الجولة ──');
  {
    const a = await mkUser('v71m'), b = await mkUser('v71n'), c = await mkUser('v71o');
    const r = await newRoom(a, 2);
    await api('POST', '/api/rooms/join', { code: r.code }, b.cookie);
    await api('POST', '/api/rooms/start', { room_id: r.id }, a.cookie);
    await api('POST', '/api/rooms/join', { code: r.code }, c.cookie);            /* بدأت ⇒ متفرج */
    await api('POST', '/api/rooms/joinRequest', { room_id: r.id }, c.cookie);

    let st = await api('GET', '/api/rooms/active', undefined, a.cookie);
    ok(st.json.room.joinQueue.length === 1, 'الطابور سجّل رغبة اللاعب الثالث');
    ok(st.json.room.order.length === 2, 'الترتيب لم يتغيّر أثناء الجولة (ثبات order)');

    await api('POST', '/api/rooms/leave', { room_id: r.id }, b.cookie);
    await sleep(400);
    st = await api('GET', '/api/rooms/active', undefined, a.cookie);
    ok(st.json.room && st.json.room.order.length === 2 && String(st.json.room.order[1]) === String(c.id),
      'المقعد الشاغر ملاه الراغب من الطابور بعد الجولة');
    ok(st.json.room.players.filter(p => p.isBot).length === 0, 'المقعد الآلي سقط من الغرفة');
    const stc = await api('GET', '/api/rooms/active', undefined, c.cookie);
    ok(stc.json.room && stc.json.room.rematch && stc.json.room.rematch.participants.length === 2,
      'التصويت الجديد ضمّ اللاعب الجديد (لاعبان)');
  }

  /* ═══ هـ) السجل المدمج: الجولة مرة واحدة ═══ */
  console.log('── [هـ] السجل المدمج: الجولة تظهر مرة واحدة ──');
  {
    const su = await api('POST', '/api/login', { username: 'super', password: 'QaTest12345' });
    if (!su.cookie) {
      console.log('  ⚠ لا دخول للسوبر (skipped) — يحتاج DM_SEED_SUPER_PW');
    } else {
      const a = await mkUser('v71p'), b = await mkUser('v71q');
      const r = await newRoom(a, 2);
      await api('POST', '/api/rooms/join', { code: r.code }, b.cookie);
      await api('POST', '/api/rooms/start', { room_id: r.id }, a.cookie);
      await api('POST', '/api/rooms/settleRound', { room_id: r.id, result: 'w0' }, a.cookie);
      await sleep(400);
      const tx = await api('GET', '/api/admin/transactions?limit=200', undefined, su.cookie);
      const list = (tx.json && tx.json.transactions) || [];
      const ofA = list.filter(t => t.username === a.name);
      const ofB = list.filter(t => t.username === b.name);
      ok(ofA.filter(t => t.type === 'bet').length === 1 && ofA.filter(t => t.type === 'win').length === 1,
        'الفائز: صف رهان واحد + صف فوز واحد (لا تكرار في السجل المدمج)');
      const w = ofA.find(t => t.type === 'win');
      const bt = ofA.find(t => t.type === 'bet');
      ok(!!w && Math.abs(w.amount - 19) < 0.01, 'مبلغ الفوز في السجل = الجرة بعد الرسم (19)');
      ok(!!bt && Math.abs(bt.amount - 10) < 0.01, 'مبلغ الرهان في السجل = الرهان المصروف (10)');
      ok(ofB.filter(t => t.type === 'bet').length === 1 && ofB.filter(t => t.type === 'win').length === 0,
        'الخاسر: صف رهان واحد بلا صف فوز');
    }
  }

  console.log('\n════════════════════════════');
  console.log('النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
  console.log('════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });