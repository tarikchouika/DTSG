/* ═══════════════════════════════════════════════════════════════════════════
   [v2.68] مدير غرف مستقل لكل لعبة — RoomManager
   ═══════════════════════════════════════════════════════════════════════════

   قبل v2.68: خريطة `rooms` واحدة في server.js تختلط فيها غرف كل الألعاب
   الـ17، وحدّ المقاعد عالمي (2-8) لا يعرف حاجة أي لعبة، والحركات تُمرَّر
   عمياء بلا أي تحقق من مطابقتها للعبة الغرفة، والحالة تُكتب بلا ملكية.

   الآن: كل لعبة من سجل الألعاب (games/registry.js) تملك مديرها الخاص —
   غرفها تعيش في خريطتها الخاصة، ولا يمكن لغرفة لعبة X أن تستقبل حركة أو
   حالة أو تسوية لا تنتمي إليها. دورة الحياة العامة (انضمام/مغادرة/بدء/
   تسوية/دردشة/إعادة مباراة) مشتركة عبر هذه الفئة وتُضبط سلوكياتها بتعريف
   اللعبة — فصل كامل مع صفر تكرار.

   كل إصلاحات v2.67 محفوظة حرفياً: الإيداعات، rev، C1، الأشباح، الطابور.
   الجديد في v2.68 (معلَّم بوسم [عزل]):
     • إنشاء: المقاعد تُحلّ وفق تعريف اللعبة (البلوت 4 بالضبط).
     • الحركة: قائمة بيضاء لأسماء الأكشنات لكل لعبة — حقن حركة لعبة أخرى
       في غرفة هذه اللعبة ⇒ 400.
     • الحالة: تُقصّ وفق مخطط اللعبة، ولا يكتبها إلا السائق/المالك، ولا
       تُقبل كتابة بـbase_rev متقادم (آخر كاتب يفوز ⇒ انحراف دائم، انتهى).
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const REG = require('../games/registry.js');

function createRoomManager(gameId, io, ctx) {
  /* تعريف اللعبة من السجل — المدير لا يعمل إلا للعبة معرّفة */
  const def = REG.getGame(gameId);
  if (!def) throw new Error('RoomManager: لعبة غير مسجلة "' + gameId + '"');

  const rooms = new Map();          /* roomId -> room (غرف هذه اللعبة حصراً) */
  const { users, db, r2, logTx } = ctx;
  const S = io;                     /* الطبقة المشتركة (rooms/shared.js) */

  /* ═══════ [v2.69·مال] تسجيل معاملة — لا تُفشل التسوية أبداً ═══════ */
  function tx(u, type, amount, extra) {
    try { if (u && logTx) logTx(u, type, amount, extra || {}); } catch (e) {}
  }

  /* ═══════ [v2.71·سجل] مفتاح الجولة — يربط صف transactions بتذكرة bet_tickets
     لنفس الجولة حتى لا تظهر الجولة مرتين في السجل المدمج للأدمن (التكرار
     المُبلّغ)، ومع ذلك تُكتب التذكرة في كل لعبة كما يطلب المالك. */
  function roundKey(room) {
    if (!room.roundId) {
      room.roundSeq = (room.roundSeq || 0) + 1;
      room.roundId = room.id + '-' + room.roundSeq;
    }
    return room.roundId;
  }
  /* تذكرة رهان الجولة للاعب واحد: الرهان المصروف + الفوز (0 للخاسر/المستردّ) */
  function ticket(room, u, bet, won, payout, txt) {
    try { if (u && ctx.logTicket) ctx.logTicket(u.id, room.game_id, bet, won, payout, txt, room.roundId); } catch (e) {}
  }

  /* ═══════ [v2.69·نواة] هل مقعد هذا اللاعب مغادر صراحةً (خسر الجولة)؟ ═══════ */
  function isLeftSeat(room, pid) {
    const q = room.players.find(function (x) { return String(x.id) === String(pid); });
    return !!(q && q.leftRound && !q.spectate);
  }

  /* ═══════ [v2.69·نواة] إسقاط اللاعبين الآليين (مغادرين/أشباح) — عند نهاية
     الجولة فقط: الريماش/إنهاء الرهان لا يعيد آلياً إلى مقعد بشري ═══════ */
  function dropBots(room) {
    const before = room.players.length;
    room.players = room.players.filter(function (p) { return !p.isBot; });
    return before - room.players.length;
  }

  /* ═══════ [v2.69·نواة] نواة التسوية بالمقاعد — مسار API ومسار المغادرة الفورية ═══════
     العقد المالي (توجيه المالك 2026-09-30):
     • الاقتطاع وقع عند البدء (escrow) — هنا التوزيع عند نهاية الجولة فقط.
     • المغادر صراحةً (leftRound) لا يستلم قرشاً أبداً — مغادرة = خسارة الجولة:
       - ثنائي وبقي واحد: الرابح الباقي يأخذ الجرة كاملة (بعد الرسم).
       - متعدد و«فاز» مقعد المغادر: الباقون يستردون إيداعاتهم + يتقاسمون مصادراته.
     • كل شيء يُسجّل في transactions (win لكل رابح · refund للاستردادات) —
       كانت الغرف لا تكتب سجلاً مالياً قط عدا مسار روندا القديم. */
  function settleSeatCore(room, result) {
    const order = S.serializeRoom(room).order;
    const seatMatch = /^w([0-3])$/.exec(result);
    if (!seatMatch && result !== 'draw') return { status: 400, body: { ok: false, message: 'نتيجة غير صالحة' } };
    if (seatMatch && Number(seatMatch[1]) >= order.length) return { status: 400, body: { ok: false, message: 'مقعد غير موجود' } };
    const pot = Number(room.bet) || 0;
    /* [v2.73·فلات دوغ] actualOnly: الجرة = الإيداعات الفعلية وحدها (المتحدين
       الاثنين) — لا قيمة افتراضية لمن لم يشارك: فلا تدفع المنصة فارقاً ولا
       يخسر متفرج لم يراهن قرشاً (غرف rn بعقد المشاركة لكل جولة).
       [v2.74·مال] الغير rn كذلك: البديل 0 لا pot — عضو بلا إيداع فعلي لا
       يُصطنع له رهان عند التسوية فيدفع الرابح فارقاً من جيب المنصة (خلل
       «الكسور لا تقتطع للمراهنين وتدفع على حساب المنصة»). كل دافع حقيقي
       له إدخال escrow من start/الريماش/المشاركة — لا مسار آخر للمال. */
    const actualOnly = (room.game_id === 'rn');
    const humans = order.filter(function (pid) { return users[pid]; }).map(function (pid) { return users[pid]; });
    if (!humans.length) return { status: 400, body: { ok: false, message: 'لا لاعبون بشريون — لا تسوية' } };
    const escrowOf = function (u) { return Number((room.escrow && room.escrow[u.id] != null) ? room.escrow[u.id] : 0); };

    let wSeat = seatMatch ? Number(seatMatch[1]) : -1;
    let drawMode = (result === 'draw');
    /* [v2.69] المقعد الفائز مغادر ⇒ لا يربح: الباقي الوحيد يرث الجرة، وإلا
       فتعادل مالي بين الباقين مع تقاسم مصادرات المغادرين */
    if (wSeat >= 0 && isLeftSeat(room, order[wSeat])) {
      const staySeats = order.map(function (pid, i) { return i; }).filter(function (i) { return !isLeftSeat(room, order[i]); });
      if (staySeats.length === 1) wSeat = staySeats[0];
      else { wSeat = -1; drawMode = true; }
    }

    const stayers = order.filter(function (pid) { return !isLeftSeat(room, pid) && users[pid]; }).map(function (pid) { return users[pid]; });
    /* [v2.73·rn] التعادل يخصّ الدافعين فعلاً — المتفرج بلا إيداع لا يقتسم */
    const drawStayers = actualOnly ? stayers.filter(function (u) { return escrowOf(u) > 0; }) : stayers;
    const leftHumans = order.filter(function (pid) { return isLeftSeat(room, pid) && users[pid]; }).map(function (pid) { return users[pid]; });
    const forfeitTotal = r2(leftHumans.reduce(function (s, u) { return s + escrowOf(u); }, 0));
    const shape = function (u, extra) { return u ? Object.assign({ id: u.id, username: u.username, gold: u.gold }, extra || {}) : null; };

    let fee = 0, payout = 0;
    const winnerOut = null, refundsOut = [], losersOut = [];

    if (drawMode) {
      /* تعادل: كل باقٍ يسترد إيداعه + حصة متساوية من مصادرات المغادرين */
      fee = r2(forfeitTotal * ctx.BET_FEE_RATE);
      let remainderPool = r2(forfeitTotal - fee);
      const share = drawStayers.length ? r2(remainderPool / drawStayers.length) : 0;
      let extraLeft = r2(remainderPool - share * drawStayers.length);
      drawStayers.forEach(function (u) {
        const bonus = share + (extraLeft > 0 ? 1 : 0);
        if (extraLeft > 0) extraLeft = r2(extraLeft - 1);
        const back = r2(escrowOf(u) + bonus);
        if (back > 0) {
          u.gold = (u.gold || 0) + back;
          try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
          tx(u, 'refund', back, { game_id: room.game_id, note: 'تعادل جولة' + (bonus > 0 ? ' + حصة مغادر' : ''), balance_after: u.gold, round_id: room.roundId });
          ticket(room, u, escrowOf(u), false, 0, 'تعادل');
        }
        refundsOut.push(shape(u, { refunded: back }));
      });
      payout = r2(drawStayers.reduce(function (s, u) { return s + escrowOf(u); }, 0) + remainderPool);
    } else {
      const winner = users[order[wSeat]];
      if (!winner) return { status: 400, body: { ok: false, message: 'الرابح غير موجود — لا تسوية' } };
      const stake = r2(humans.reduce(function (s, u) { return s + escrowOf(u); }, 0));
      /* [v2.73·rn] جولة بلا إيداعات مجمّعة (مجانية/بلا مشاركات): إقفال نظيف
         بلا حركة مال — كان يوزّع جرة وهمية بقيمة room.bet لكل مقعد */
      if (actualOnly && !(stake > 0)) {
        room.escrow = {};
        room.settled = true;
        room.roundId = null;
        const noop = { ok: true, result: 'draw', pot: 0, fee: 0, payout: 0, winner: null, loser: null,
          losers: [], refunds: [], forfeited: 0, dissolved: false };
        S.broadcastRoom(room, 'room:settle', noop);
        if (S.dissolveIfExpired(room)) noop.dissolved = true;
        if (rooms.has(room.id)) { S.afterRoundEnd(room); S.updateRoom(room); }
        return { status: 200, body: noop };
      }
      /* [v2.70·مال] الرسم 5% من الجرة كاملة (مجموع رهانات المراهنين كافة) —
         كان يُحسب من رهان لاعب واحد (pot = room.bet) ففي الغرف متعددة
         اللاعبين تدفع المنصة الفارق من جيبتها للرابح (توجيه المالك:
         «الكسور لا تقتطع للمراهنين و تدفع على حساب المنصة للرابح»). */
      fee = r2(stake * ctx.BET_FEE_RATE);
      payout = r2(stake - fee);
      winner.gold = (winner.gold || 0) + payout;
      try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(winner.gold, winner.id); } catch (e) {}
      tx(winner, 'win', payout, { game_id: room.game_id, note: 'فوز جولة غرفة', balance_after: winner.gold, round_id: room.roundId });
      /* [v2.71·تذاكر] تذكرة لكل لاعب: الرابح برهان الجرة ورسب المصروف،
         والخاسر تذكرة برهانه بلا فوز. السجل المدموج سيعرض الجولة مرة واحدة. */
      humans.forEach(function (u) {
        const myStake = escrowOf(u);
        /* [v2.73·rn] بلا تذاكر لمن لم يدفع — المتفرج لم يراهن */
        if (actualOnly && !(myStake > 0)) return;
        if (u.id === winner.id) ticket(room, u, myStake, true, payout, 'فوز جولة غرفة');
        else ticket(room, u, myStake, false, 0, 'خسارة جولة غرفة');
      });
      /* [v2.70·سجل] لا صف bet للخاسرين هنا — صف الرهان سُجّل عند الاقتطاع
         في بدء الجولة (عقد المال §2). كان يُسجّل ثانيةً عند التسوية فيظهر
         الخاسر مقتطعاً مرتين في سجل المعاملات (خلل التكرار المُبلّغ). */
      humans.forEach(function (u) {
        if (u.id !== winner.id) {
          /* [v2.73·rn] قائمة الخاسرين للدافعين فعلاً */
          if (actualOnly && !(escrowOf(u) > 0)) return;
          losersOut.push(shape(u));
        }
      });
    }

    room.escrow = {};
    room.settled = true;
    /* [v2.73·rn] الجولة القادمة مفتاح جديد: الرهان يُسجّل عند أول مشاركة فيها */
    if (room.game_id === 'rn') room.roundId = null;
    const payload = {
      ok: true, result: (drawMode ? 'draw' : 'w' + wSeat), pot: pot, fee: fee,
      winner: (!drawMode && wSeat >= 0) ? shape(users[order[wSeat]]) : null,
      loser: losersOut[0] || null, losers: losersOut,
      refunds: refundsOut, forfeited: forfeitTotal,
      dissolved: false, payout: payout
    };
    S.broadcastRoom(room, 'room:settle', payload);
    if (S.dissolveIfExpired(room)) payload.dissolved = true;
    /* [v2.71] ختام الجولة: المقعد الشاغر يصير حراً ويُملأ من الطابور فوراً */
    if (rooms.has(room.id)) { S.afterRoundEnd(room); S.updateRoom(room); }
    return { status: 200, body: payload };
  }

  /* ── عون: هل هذا المستخدم مضيفاً مرجعياً (مالك أو سائق حالي)؟ ── */
  function isHost(room, uid) {
    return !!room && uid != null && (room.owner_id === uid || room.driverId === uid);
  }

  /* ═══════ [v2.73·فلات دوغ] نواة الانسحاب من جولة قادمة ═══════
     المنسحب (صريحاً أو بصمت المهلة) يستردّ ما دفعه إن كان قد صادق ودفعت،
     ويصير متفرجاً فيتحرّر مقعده — والمتفرج الراغب في المشاركة (طابور
     الانضمام) يُرفع فوراً في مكانه بسلاسة (توجيه المالك 2026-10-02).
     ترتيب اللعبة يُعاد بناؤه: المنسحب يخرج، والمرفوع يُلحق بالنهاية،
     والمطلوبان الجديدان = أول ترتيبَين (الموزّع والمتخمّن الموالي). */
  function withdrawRoundCore(room, uid, note) {
    const p = room.players.find(function (x) { return String(x.id) === String(uid); });
    if (!p) return { status: 400, body: { ok: false, message: 'المقعد غير موجود' } };
    /* استرداد ما دفعه في مرحلة المشاركة (الجولة لم تبدأ) */
    S.refundEscrow(room, uid, note || 'انسحاب قبل بدء الجولة');
    p.spectate = true;
    p.ready = true;
    p.isBot = false;
    p.leftRound = false;
    const rj = room.roundJoin;
    if (rj) {
      if (rj.required) rj.required = rj.required.filter(function (id) { return String(id) !== String(uid); });
      if (rj.joined) delete rj.joined[uid];
    }
    /* إعادة بناء ترتيب اللعبة: المنسحب خارج، والمرفوع من الطابور مُلحقٌ بالنهاية.
       [v2.73] ترقيم المقاعد بلا تصادم قبل/بعد الترقية (نمط afterRoundEnd) */
    let order = (room.room_state && Array.isArray(room.room_state.order)) ? room.room_state.order.slice() : S.serializeRoom(room).order;
    order = order.filter(function (id) { return String(id) !== String(uid); });
    let sn = 0;
    room.players.filter(function (x) { return !x.spectate; }).forEach(function (x) { x.seat = sn++; });
    S.promoteQueued(room);
    const actives = room.players.filter(function (x) { return !x.spectate; });
    sn = 0;
    room.players.filter(function (x) { return !x.spectate; }).forEach(function (x) { x.seat = sn++; });
    room.players.filter(function (x) { return x.spectate; }).forEach(function (x) { x.seat = sn++; });
    actives.sort(function (a, b) { return a.seat - b.seat; });
    actives.forEach(function (x) { if (!order.some(function (id) { return String(id) === String(x.id); })) order.push(x.id); });
    if (!room.room_state) room.room_state = {};
    room.room_state.order = order;

    if (actives.length < 2) {
      /* لم يبقَ متحدّان: استرداد كل إيداعات المرحلة والعودة لانتظار لاعبين
         (دورة جديدة كاملة عند اكتمالهم) — كان الإيداع المتبقي يضيع */
      if (S.escrowHasFunds(room)) S.refundAllEscrow(room, 'الغرفة بلا متحدّين — استرداد إيداعات مرحلة المشاركة');
      const keptMode = (room.room_state && room.room_state.mode) || null;
      room.roundJoin = null;
      room.status = 'waiting';
      room.roundId = null;
      room.room_state = { mode: keptMode, order: order, round: 0, seed: null, pick: null, phase: 'mode' };
      room.players.forEach(function (x) { if (!x.spectate) x.ready = false; });
      S.broadcastRoom(room, 'room:roundwithdraw', { room_id: room.id, user_id: uid, username: p.username, reason: 'need_players' });
      if (S.dissolveIfExpired(room)) return { status: 200, body: { ok: true, room: null } };
      S.updateRoom(room);
      return { status: 200, body: { ok: true, reason: 'need_players', room: S.serializeRoom(room) } };
    }

    if (room.roundJoin) {
      room.roundJoin.required = [order[0], order[1]].filter(function (id, i, a) { return id != null && a.indexOf(id) === i; });
    }
    S.broadcastRoom(room, 'room:roundwithdraw', {
      room_id: room.id, user_id: uid, username: p.username,
      required: room.roundJoin ? room.roundJoin.required.slice() : [],
      room: S.serializeRoom(room)
    });
    S.updateRoom(room);
    return { status: 200, body: { ok: true, room: S.serializeRoom(room) } };
  }

  /* [v2.71] بدء التصويت على المباراة الجديدة — واحد للجميع: من يطلبه من
     الواجهة (rematchStart) أو الخادم بعد تسوية فورية بسبب المغادرة. */
  function beginRematch(room) {
    if (!room || room.rematch) return false;
    if (S.sweepExpiredRoom(room)) return false;
    if (room.status === 'playing' && !room.settled && room.escrow) {
      S.refundAllEscrow(room, 'استرداد قبل إعادة المباراة (جولة غير مسوّاة)');
    }
    /* الجولة انتهت — من غادر أو غاب لا يعود مقعداً: إسقاط الآليين أولاً */
    dropBots(room);
    const parts = room.players.filter(function (p) { return !p.spectate; });
    if (!parts.length) {
      S.broadcastRoom(room, 'room:update', null);
      if (ctx.removeRoom) ctx.removeRoom(room); else rooms.delete(room.id);
      return false;
    }
    const names = {};
    parts.forEach(function (p) { names[p.id] = p.username; });
    room.rematch = { participants: parts.map(function (p) { return p.id; }), votes: {}, names: names, ts: Date.now() };
    room.status = 'waiting';
    const rid = room.id;
    setTimeout(function () {
      const r = rooms.get(rid);
      if (r && r.rematch && !r.rematch.resolved) {
        r.rematch.participants.forEach(function (id) { if (!r.rematch.votes[id]) r.rematch.votes[id] = 'refuse'; });
        if (S.tryResolveRematch(r)) S.updateRoom(r);
        if (r.rematch && r.rematch.resolved && !r.rematch.rematch) S.dissolveIfExpired(r);
      }
    }, 60000);
    return true;
  }

  const mgr = {
    gameId: gameId,
    def: def,
    rooms: rooms,

    /* ═══════ عمليات البحث ═══════ */
    get: function (roomId) { return rooms.get(roomId) || null; },
    count: function () { return rooms.size; },
    remove: function (room) { rooms.delete(room.id); },
    listWaiting: function () {
      const out = [];
      rooms.forEach(function (r) {
        if (r.status === 'waiting' && r.visibility !== 'private') {
          out.push({
            id: r.id, code: r.code, game_id: r.game_id, owner_name: r.owner_name,
            max_players: r.max_players, players_count: r.players.length, status: r.status,
            bet: r.bet || 0, room_type: r.room_type || null,
            expires_at: r.expires_at != null ? Number(r.expires_at) : null,
            visibility: r.visibility === 'private' ? 'private' : 'public',
            /* [v2.77·تحكيم] شارة غرف التحكيم في القائمة العامة
               [v2.78] يغطي معرّف arb الجديد (تبويب القائمة) كما العلم القائم */
            arb: !!(r.game_opts && r.game_opts.arb) || r.game_id === 'arb'
          });
        }
      });
      return out;
    },

    /* ═══════ إنشاء غرفة [عزل: المقاعد وفق تعريف اللعبة] ═══════ */
    create: function (me, data) {
      if (!me) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
      if (me.role !== 'user') return { status: 403, body: { ok: false, message: 'المشرفون لا يمكنهم الدخول كلاعبين أو المراهنة' } };
      const room_type = 'percentage';   /* [Rooms-unified] نظام موحد */
      const bet = Number(data.bet);
      if (isNaN(bet) || bet <= 0) return { status: 400, body: { ok: false, error: 'bet_required' } };
      const visibility = (data.visibility === 'private') ? 'private' : 'public';
      /* [عزل v2.68] المقاعد وفق حاجة اللعبة — كان حدّاً عالمياً 2-8:
         غرفة بلوت بمقعدين كانت تُنشأ ثم يتعذر بناء المحرك (يشترط 4) */
      const seats = REG.resolveSeats(gameId, data.max_players);
      if (!seats.ok) return { status: 400, body: { ok: false, message: seats.message } };
      const maxp = seats.max_players;
      const rid = ctx.nextRoomId();
      const code = ctx.allocateCode();   /* رمز فريد عالمياً عبر المحور — لا تصادم بين الألعاب */
      const room = {
        id: rid, code: code, game_id: gameId,
        owner_id: me.id, owner_name: me.username,
        max_players: maxp, status: 'waiting', bet: bet, room_type: room_type,
        visibility: visibility,
        expires_at: null,
        players: [{ id: me.id, username: me.username, ready: false, spectate: false, seat: 0 }],
        moveHistory: [], dedupSeen: {}, driverId: me.id, online: {},
        room_state: {}, chat: [],
        rev: 0, escrow: null, lastActivity: {},
        game_opts: (data.game_opts && typeof data.game_opts === 'object') ? data.game_opts : null
      };
      rooms.set(rid, room);
      if (ctx.registerRoom) ctx.registerRoom(room);   /* فهرسة المحور: معرف/رمز → غرفة */
      S.markOnline(room, me.id);
      return { status: 200, body: { ok: true, room: S.serializeRoom(room) } };
    },

    /* ═══════ الانضمام (يكتبه المحور بعد توجيه الرمز للمدير الصحيح) ═══════ */
    join: function (me, data, room) {
      if (!me) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
      if (me.role !== 'user') return { status: 403, body: { ok: false, message: 'المشرفون لا يمكنهم الدخول كلاعبين أو المراهنة' } };
      if (!room || !rooms.has(room.id)) return { status: 404, body: { ok: false, message: 'رمز الغرفة غير موجود' } };
      if (S.sweepExpiredRoom(room)) return { status: 410, body: { ok: false, message: 'انتهت صلاحية الغرفة' } };
      if (room.status === 'playing' && !room.players.some(function (p) { return p.id === me.id; })) {
        return { status: 400, body: { ok: false, message: 'اللعبة بدأت بالفعل' } };
      }
      let p = room.players.find(function (x) { return x.id === me.id; });
      if (!p) {
        const nonSpec = room.players.filter(function (x) { return !x.spectate; }).length;
        if (nonSpec >= room.max_players) {
          p = { id: me.id, username: me.username, ready: true, spectate: true, seat: room.players.length };
        } else {
          p = { id: me.id, username: me.username, ready: false, spectate: !!data.spectate, seat: nonSpec };
        }
        room.players.push(p);
      }
      S.markOnline(room, me.id);
      S.updateRoom(room);
      return { status: 200, body: { ok: true, room: S.serializeRoom(room) } };
    },

    /* ═══════ المغادرة [v2.69: مغادرة = خسارة الجولة + لاعب آلي بديل] ═══════
       توجيه المالك: النقر على زر المغادرة + تأكيد = خسارة الجولة. إقفال المتصفح
       أو انقطاع الأنترنت أو تحديث الصفحة ليست مغادرة (المنظّف يوسم isBot
       مؤقتاً ويعيده المقعد عند عودته — shared.resumeIfGhost).
       أثناء الجولة الجارية: لا حذف ولا استرداد — المقعد يوسم leftRound ويبقى
       في order بثباته (كان حذفه ينزح مقاعد التسوية كلها = جذر ضياع الرهان)،
       إيداعه مصادر في الجرة، ويكمل عنه السائق آلياً (roomDriverTick).
       ثنائي حصراً: تسوية فورية للرابح الباقي — الجولة تُحسم بالمغادرة عينها. */
    leave: function (me, data) {
      const room = rooms.get(data.room_id);
      if (room) S.sweepExpiredRoom(room);
      if (room && rooms.has(data.room_id)) {
        const uid = (me && me.id);
        const p = room.players.find(function (x) { return x.id === uid; });
        const midRound = !!(p && !p.spectate && room.status === 'playing' && !room.settled);
        if (midRound) {
          p.isBot = true;
          p.leftRound = true;
          p.ready = true;
          const forfeited = Number((room.escrow && room.escrow[uid]) || 0);
          /* المالك غادر منتصف الجولة: الغرفة تبقى والملكية تنتقل لأول باقٍ */
          if (room.owner_id === uid) {
            const heir = room.players.find(function (x) { return x.id !== uid && !x.spectate && !x.leftRound; });
            if (heir) room.owner_id = heir.id;
          }
          if (room.driverId === uid) S.reassignDriver(room);
          S.broadcastRoom(room, 'room:leave', {
            room_id: room.id, user_id: uid, username: p.username,
            forfeited: forfeited, ai: true, lost: true
          });
          /* [v2.71] غادر الخصوم جميعاً ⇒ الجولة تُحسم الآن لا انتظاراً:
             المقاعد الباقية (لم تغادر صراحةً) — إن كان واحداً فهو الرابح
             مباشرة، ثم يبدأ التصويت على جولة جديدة. وإن لم يبقَ أحد: استرداد
             الكل وحلّ الغرفة آلياً. كان خاصاً بالثنائيات فقط: في الغرف 3-4
             كانت الجولة معلّقة على مقعدٍ غادر أو على لعبةٍ لم تُحسم. */
          const orderNow = S.serializeRoom(room).order;
          const alive = [];
          orderNow.forEach(function (pid, i) { if (!isLeftSeat(room, pid)) alive.push(i); });
          if (alive.length <= 1) {
            if (alive.length === 1) {
              const r = settleSeatCore(room, 'w' + alive[0]);
              if (r.status === 200) {
                if (rooms.has(room.id)) { beginRematch(room); S.updateRoom(room); }
                return { status: 200, body: r.body };
              }
            }
            /* لا أحد باقٍ: استرداد الجميع وحلّ الغرفة */
            S.refundAllEscrow(room);
            S.broadcastRoom(room, 'room:update', null);
            if (ctx.removeRoom) ctx.removeRoom(room); else rooms.delete(room.id);
            return { status: 200, body: { ok: true } };
          }
          S.updateRoom(room);
          return { status: 200, body: { ok: true } };
        }
        /* خارج الجولة: السلوك التاريخي — إزالة عادية (بلا إيداعات أصلاً) */
        /* [v2.73·فلات دوغ] مغادرة مطلوب للمشاركة أثناء المرحلة = انسحاب من
           الجولة: مسار الانسحاب أولاً (استرداده + تحرير مقعده + ترقية الطابور
           أو العودة للانتظار باسترداد الجميع) ثم الإزالة النهائية */
        if (room.roundJoin && room.roundJoin.required &&
            room.roundJoin.required.some(function (id) { return String(id) === String(uid); })) {
          withdrawRoundCore(room, uid, 'مغادرة أثناء مرحلة المشاركة');
        }
        room.players = room.players.filter(function (x) { return x.id !== uid; });
        delete room.blindPicks;
        if (room.joinQueue) room.joinQueue = room.joinQueue.filter(function (r) { return r.id !== uid; });
        if (room.players.length === 0) {
          S.broadcastRoom(room, 'room:update', null);
          if (ctx.removeRoom) ctx.removeRoom(room); else rooms.delete(room.id);
        } else if (room.owner_id === uid) {
          /* [v2.69] المالك يغادر غرفة انتظار بها آخرون: انتقال الملكية لا حذف —
             توثيق الواجهة («الخادم ينقل الملكية ويُبقي الغرفة حية») كان يناقض الفعل */
          const heir = room.players.find(function (x) { return !x.spectate; }) || room.players[0];
          if (heir) {
            room.owner_id = heir.id;
            if (room.driverId === uid) room.driverId = heir.id;
            S.promoteQueued(room);
            S.tryResolveRematch(room);
            S.updateRoom(room);
          } else {
            S.broadcastRoom(room, 'room:update', null);
            if (ctx.removeRoom) ctx.removeRoom(room); else rooms.delete(room.id);
          }
        } else {
          S.promoteQueued(room);
          S.tryResolveRematch(room);
          S.updateRoom(room);
        }
      }
      return { status: 200, body: { ok: true } };
    },

    /* ═══════ الجاهزية ═══════ */
    ready: function (me, data) {
      const room = rooms.get(data.room_id);
      if (room && me) {
        if (S.sweepExpiredRoom(room)) return { status: 410, body: { ok: false, message: 'انتهت صلاحية الغرفة' } };
        const p = room.players.find(function (x) { return x.id === me.id; });
        if (p) p.ready = !!data.ready;
        S.updateRoom(room);
      }
      return { status: 200, body: { ok: true, room: room ? S.serializeRoom(room) : null } };
    },

    /* ═══════ بدء الجولة [عزل: العدد الكافي وفق تعريف اللعبة] ═══════ */
    start: function (me, data) {
      if (me && me.role !== 'user') return { status: 403, body: { ok: false, message: 'المشرفون لا يمكنهم الدخول كلاعبين أو المراهنة' } };
      const room = rooms.get(data.room_id);
      if (room && me && room.owner_id === me.id) {
        if (S.sweepExpiredRoom(room)) return { status: 410, body: { ok: false, message: 'انتهت صلاحية الغرفة' } };
        const bet = Number(room.bet) || 0;
        const payers = room.players.filter(function (p) { return !p.spectate && users[p.id]; });
        /* [عزل v2.68] لا بدء دون العدد الذي تشترطه اللعبة (البلوت 4) —
           كان البدء بثلاثة يمر ثم يبقى المحرك في انتظار اللاعب الرابع أبداً */
        const nonSpec = payers.length;
        if (!REG.enoughToStart(gameId, nonSpec)) {
          const need = def.exactSeats != null ? def.exactSeats : def.seats.min;
          return { status: 400, body: { ok: false, error: 'not_enough_players', need: need, message: 'هذه اللعبة تتطلب ' + need + ' لاعبين للبدء' } };
        }
        let insufficient = null;
        for (const p of payers) {
          if ((users[p.id].gold || 0) < bet) { insufficient = users[p.id].username; break; }
        }
        if (insufficient) return { status: 400, body: { ok: false, error: 'insufficient_funds', user: insufficient } };
        /* [v2.73·فلات دوغ] rn: لا اقتطاع عند البدء إطلاقاً — الرهان يُقتطع عند
           مصادقة كل لاعب بالنقر على «المشاركة» (توجيه المالك 2026-10-02).
           settled=true: لا جولة مسلّحة بعد — تُسلّح عند إطلاق حركة round بعد
           اكتمال مشاركات المتحدين، فتُصبح التسوية ممكنة والمغادرة=خسارة. */
        if (gameId === 'rn') {
          room.roundId = null;
          room.roundJoin = null;
          room.escrow = {};
          room.settled = true;
        } else {
          /* [v2.71] مفتاح الجولة قبل الاقتطاع: صف bet يحمل round_id فيُربط
             بتذكرة الجولة فلا تظهر الجولة مرتين في السجل المدمج */
          roundKey(room);
          payers.forEach(function (p) {
            const u = users[p.id];
            u.gold = (u.gold || 0) - bet;
            try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
            /* [v2.69·مال] سجل اقتطاع الرهان لحظة البدء — كانت الغرف تقتطع بلا سجل */
            tx(u, 'bet', bet, { game_id: gameId, note: 'رهان بدء جولة غرفة', balance_after: u.gold, round_id: room.roundId });
          });
          room.escrow = {};
          payers.forEach(function (p) { room.escrow[p.id] = bet; });
          room.settled = null;
        }
        room.status = 'playing';
        /* [v2.69] جولة جديدة نظيفة: لا وسوم مغادرة ولا آليين — كان وسماً قديماً يبقى */
        room.players.forEach(function (p) { p.isBot = false; p.leftRound = false; });
        S.updateRoom(room);
      }
      return { status: 200, body: { ok: true, room: room ? S.serializeRoom(room) : null } };
    },

    /* ═══════ التفرج/طابور الانضمام ═══════ */
    spectate: function (me, data) {
      const room = rooms.get(data.room_id);
      if (room && me) {
        if (S.sweepExpiredRoom(room)) return { status: 410, body: { ok: false, message: 'انتهت صلاحية الغرفة' } };
        let p = room.players.find(function (x) { return x.id === me.id; });
        if (!p) { p = { id: me.id, username: me.username, ready: true, spectate: false, seat: room.players.length }; room.players.push(p); }
        if (!data.spectate && p.spectate) {
          const nonSpec = room.players.filter(function (x) { return !x.spectate && x.id !== me.id; }).length;
          if (nonSpec >= room.max_players) {
            return { status: 400, body: { ok: false, message: 'المقاعد ممتلئة — يمكنك المشاهدة فقط' } };
          }
          /* [v2.74·مال] لا تفعيل متفرج أثناء جولة غير مسوّاة: الداخل الجديد لم
             يودع رهاناً (الاقتطاع وقع عند البدء) فكان يسقط في order بلا إيداع
             ثم تحسب له جرة التسوية قيمةً لم تُحصّل قط — تفتحة مال حقيقية تمرّ
             عبرها المنصة على الرابح. نفس حظر الطابور (promoteQueued) أثناء
             الجولة — المسار الموحّد للانضمام وسط اللعب هو طابور الانضمام. */
          if (room.status === 'playing' && !room.settled) {
            return { status: 400, body: { ok: false, message: 'الجولة جارية — اطلب مقعداً من طابور الانضمام وسيُرقّى بعد الجولة' } };
          }
        }
        p.spectate = !!data.spectate;
        if (data.spectate) p.ready = true;
        S.updateRoom(room);
      }
      return { status: 200, body: { ok: true, room: room ? S.serializeRoom(room) : null } };
    },
    joinRequest: function (me, data) {
      const room = rooms.get(data.room_id);
      if (room && me) {
        if (S.sweepExpiredRoom(room)) return { status: 410, body: { ok: false, message: 'انتهت صلاحية الغرفة' } };
        let p = room.players.find(function (x) { return x.id === me.id; });
        if (!p) { p = { id: me.id, username: me.username, ready: true, spectate: true, seat: room.players.length }; room.players.push(p); }
        if (p.spectate) {
          if (!room.joinQueue) room.joinQueue = [];
          if (!room.joinQueue.some(function (r) { return r.id === me.id; })) {
            room.joinQueue.push({ id: me.id, username: me.username, ts: Date.now() });
          }
          S.promoteQueued(room);
          S.updateRoom(room);
        }
      }
      return { status: 200, body: { ok: true, room: room ? S.serializeRoom(room) : null } };
    },

    /* ═══════ إنهاء الرهان ═══════
       [v2.69] إسقاط الآليين (مغادرون/أشباح) — الجولة انتهت ولا مقعد لمن لا يجيب */
    endBet: function (me, data) {
      const room = rooms.get(data.room_id);
      if (room && me && room.owner_id === me.id && room.status === 'playing') {
        /* [v2.73] الاسترداد عند أي إيداع فعلي — لا يقتصر على !settled: مرحلة
           المشاركة (rn) تجمع إيداعاً جزئياً وهي settled=true، وإلا ضاع مال
           من صادق ودفعت عند إلغاء الرهان */
        if (S.escrowHasFunds(room)) S.refundAllEscrow(room, 'إنهاء الرهان — استرداد إيداع مرحلة المشاركة');
        room.status = 'waiting';
        room.roundJoin = null;
        room.players.forEach(function (p) { if (!p.spectate) p.ready = false; });
        S.afterRoundEnd(room);   /* [v2.71] الطابور يملأ ما شاغر */
        if (S.dissolveIfExpired(room)) return { status: 200, body: { ok: true, room: null } };
        S.updateRoom(room);
      }
      return { status: 200, body: { ok: true, room: room ? S.serializeRoom(room) : null } };
    },

    /* ═══════ انتهاء مهلة مقعد [v2.69: وسم آلي بدل التفرج — ثبات order] ═══════ */
    timeoutSeat: function (me, data) {
      const room = rooms.get(data.room_id);
      const isHost = room && me && room.owner_id === me.id;
      if (!isHost || data.playerId == null) return { status: 403, body: { ok: false, message: 'غير مصرّح' } };
      const p = room.players.find(function (x) { return String(x.id) === String(data.playerId) && !x.spectate; });
      if (p) {
        if (room.status === 'playing' && !room.settled) {
          /* أثناء الجولة: المقعد يبقى (ثبات مقاعد التسوية) ويكمل عنه السائق آلياً */
          p.isBot = true;
          p.ready = true;
        } else if (room.roundJoin && room.roundJoin.required &&
                   room.roundJoin.required.some(function (id) { return String(id) === String(data.playerId); })) {
          /* [v2.73·فلات دوغ] صمت في مرحلة المشاركة = انسحاب (لم يصادق فلم
             يُقتطع منه شيء): المقعد يتحرر فوراً ويُرفع راغب المشاركة من
             الطابور — نفس مسار الانسحاب الصريح تماماً */
          return withdrawRoundCore(room, Number(data.playerId), 'انتهاء مهلة المشاركة — انسحاب تلقائي');
        } else {
          p.spectate = true;
          p.ready = true;
        }
      }
      S.promoteQueued(room);
      S.updateRoom(room);
      return { status: 200, body: { ok: true, room: S.serializeRoom(room) } };
    },

    /* ═══════ [v2.73·فلات دوغ] المشاركة في الجولة القادمة — الاقتطاع هنا فقط ═══════
       توجيه المالك: «لا يقتطع مبلغ الرهان إلا بعد مصادقة اللاعب بالنقر على
       المشاركة». كل جولة تجمع رهانها من المتحدين الاثنين (الموزّع والمتخمّن
       الموالي) لحظة مصادقة كل منهما — لا من بقي متفرجاً/منتظراً. */
    roundJoin: function (me, data) {
      const room = rooms.get(data.room_id);
      if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      if (!me) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
      const p = room.players.find(function (x) { return String(x.id) === String(me.id); });
      if (!p) return { status: 403, body: { ok: false, message: 'لست عضواً في هذه الغرفة' } };
      if (p.spectate) return { status: 400, body: { ok: false, message: 'أنت متفرج — اطلب مقعداً من طابور الانضمام' } };
      if (room.status !== 'playing') return { status: 400, body: { ok: false, message: 'لا جولة قيد التحضير' } };
      const rj = room.roundJoin;
      if (!rj || !rj.required || !rj.required.length) return { status: 400, body: { ok: false, message: 'لا مرحلة مشاركة مفتوحة' } };
      const isReq = rj.required.some(function (id) { return String(id) === String(me.id); });
      if (!isReq) return { status: 400, body: { ok: false, message: 'دورك لم يأتِ بعد — المشاركة للمتحدين الحاليين' } };
      if (rj.joined && rj.joined[me.id]) return { status: 200, body: { ok: true, already: true, room: S.serializeRoom(room) } };
      const u = users[me.id];
      if (!u) return { status: 400, body: { ok: false, message: 'المقعد آلي — لا مصادقة' } };
      const bet = Number(room.bet) || 0;
      if (Number((room.escrow || {})[me.id]) > 0) return { status: 200, body: { ok: true, already: true, room: S.serializeRoom(room) } };
      if (bet > 0 && (u.gold || 0) < bet) {
        return { status: 400, body: { ok: false, error: 'insufficient_funds', message: 'رصيدك لا يكفي رهان الجولة (' + bet + ')' } };
      }
      if (bet > 0) {
        u.gold = (u.gold || 0) - bet;
        try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
        if (!room.escrow) room.escrow = {};
        room.escrow[me.id] = bet;
        roundKey(room);   /* مفتاح الجولة الجديد عند أول اقتطاع فيها */
        tx(u, 'bet', bet, { game_id: gameId, note: 'رهان جولة بالمشاركة (فلات دوغ)', balance_after: u.gold, round_id: room.roundId });
      }
      if (!rj.joined) rj.joined = {};
      rj.joined[me.id] = true;
      const joinedIds = rj.required.filter(function (id) { return rj.joined[id] || Number((room.escrow || {})[id]) > 0; });
      S.broadcastRoom(room, 'room:roundjoin', {
        room_id: room.id, user_id: me.id, username: me.username,
        required: rj.required.slice(), joined: joinedIds, bet: bet
      });
      const ready = rj.required.length > 0 && rj.required.every(function (id) { return rj.joined[id] || Number((room.escrow || {})[id]) > 0; });
      if (ready) {
        const potNow = r2(Object.keys(room.escrow || {}).reduce(function (s, k) { return s + Number(room.escrow[k] || 0); }, 0));
        S.broadcastRoom(room, 'room:roundready', { room_id: room.id, required: rj.required.slice(), pot: potNow });
      }
      S.updateRoom(room);
      return { status: 200, body: { ok: true, joined: joinedIds, required: rj.required.slice(), ready: !!ready, room: S.serializeRoom(room), balance_after: (bet > 0 ? u.gold : null) } };
    },

    /* ═══════ [v2.73·فلات دوغ] الانسحاب من الجولة القادمة ═══════ */
    roundWithdraw: function (me, data) {
      const room = rooms.get(data.room_id);
      if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      if (!me) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
      const rj = room.roundJoin;
      const isReq = !!(rj && rj.required && rj.required.some(function (id) { return String(id) === String(me.id); }));
      if (!isReq) return { status: 400, body: { ok: false, message: 'أنت لست من المطلوبين للمشاركة' } };
      return withdrawRoundCore(room, me.id, 'انسحاب اللاعب من الجولة القادمة');
    },

    /* ═══════ تصويت المباراة الجديدة [v2.69: الآليون خارج التصويت نهائياً] ═══════ */
    rematchStart: function (me, data) {
      const room = rooms.get(data.room_id);
      const mePart = room && me && room.players.some(function (p) { return p.id === me.id && !p.spectate; });
      if (mePart && !room.rematch) { beginRematch(room); S.updateRoom(room); }
      return { status: 200, body: { ok: true, room: room ? S.serializeRoom(room) : null } };
    },
    rematchVote: function (me, data) {
      const room = rooms.get(data.room_id);
      if (room && me && room.rematch && !room.rematch.resolved && room.rematch.participants.indexOf(me.id) !== -1) {
        room.rematch.votes[me.id] = (data.vote === 'agree') ? 'agree' : 'refuse';
        S.tryResolveRematch(room);
        S.updateRoom(room);
        if (room.rematch && room.rematch.resolved && !room.rematch.rematch && rooms.has(room.id)) {
          if (S.dissolveIfExpired(room)) return { status: 200, body: { ok: true, room: null } };
        }
      }
      return { status: 200, body: { ok: true, room: room ? S.serializeRoom(room) : null } };
    },

    /* ═══════ التفاعل والصوت ═══════ */
    react: function (me, data) {
      const room = rooms.get(data.room_id);
      if (room && me) {
        const emoji = String(data.emoji || '').slice(0, 16);
        S.broadcastRoom(room, 'room:react', { room_id: room.id, emoji: emoji, from_id: me.id, from_name: me.username, ts: Date.now() });
      }
      return { status: 200, body: { ok: true } };
    },
    voice: function (me, data) {
      if (ctx.isMuted(me)) return { status: 403, body: { ok: false, message: 'موقوف عن التعليق الصوتي', muted_until: me.muted_until } };
      const room = rooms.get(data.room_id);
      if (room && me) {
        let audio = String(data.audio || '');
        if (audio.length > 980000) audio = '';
        const dur = Math.max(0, Math.min(10, parseInt(data.dur, 10) || 0));
        if (audio) S.broadcastRoom(room, 'room:voice', { room_id: room.id, audio: audio, dur: dur, from_id: me.id, from_name: me.username, ts: Date.now() });
      }
      return { status: 200, body: { ok: true } };
    },

    /* ═══════ الدردشة [C1 محفوظة] ═══════ */
    getChat: function (me, data) {
      const room = rooms.get(data && data.room_id);
      if (!me || !room) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
      if (!room.players.some(function (p) { return p.id === me.id; })) return { status: 403, body: { ok: false, message: 'لست عضواً في هذه الغرفة' } };
      return { status: 200, body: { ok: true, messages: room.chat.slice(-100) } };
    },
    chat: function (me, data) {
      if (!me) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
      if (ctx.isMuted(me)) return { status: 403, body: { ok: false, message: 'موقوف عن المراسلة', muted_until: me.muted_until } };
      const room = rooms.get(data.room_id);
      if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      if (!room.players.some(function (p) { return p.id === me.id; })) return { status: 403, body: { ok: false, message: 'لست عضواً في هذه الغرفة' } };
      if (room.lastActivity) room.lastActivity[me.id] = Date.now();
      const msg = {
        room_id: data.room_id, text: data.text || '',
        from_id: me.id, from_name: me.username,
        to_id: data.to != null ? Number(data.to) : null,
        to_name: '', created_at: Date.now()
      };
      if (data.to != null) {
        const to = room.players.find(function (x) { return x.id === Number(data.to); });
        if (to) msg.to_name = to.username;
      }
      room.chat.push(msg);
      if (room.chat.length > 200) room.chat.shift();
      S.broadcastRoom(room, 'room:chat', msg);
      return { status: 200, body: { ok: true, msg: msg } };
    },

    /* ═════════════════════════════════════════════════════════════════
       الحركة — قلب العزل [v2.68]
       ═════════════════════════════════════════════════════════════════ */
    move: function (me, data) {
      const room = rooms.get(data.room_id);
      /* [v2.67·C1] الحركة تتطلب دخولاً وعضوية */
      if (!me) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
      if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      if (!room.players.some(function (p) { return p.id === me.id; })) return { status: 403, body: { ok: false, message: 'لست عضواً في هذه الغرفة' } };

      /* [عزل v2.68] الحركة يجب أن تكون من قائمة هذه اللعبة — كانت أي حركة
         تُمرَّر عمياء: حركة أونو (unmove) تُحقن في غرفة بلوت فتفسد الحالة */
      if (data.action !== 'blind' && !REG.actionAllowed(gameId, data.action)) {
        return { status: 400, body: { ok: false, message: 'حركة غير معتمدة لهذه اللعبة', game_id: gameId, action: String(data.action || '') } };
      }

      if (room.lastActivity) room.lastActivity[me.id] = Date.now();

      /* [v2.27 blindResult] الاختيار الأعمى الزوجي (rp/pn) — حرفياً كما كان */
      if (data.action === 'blind') {
        const inRoom = room.players.some(function (p) { return p.id === me.id && !p.spectate; });
        if (!inRoom) return { status: 403, body: { ok: false, message: 'لست لاعباً نشطاً في هذه الغرفة' } };
        room.rev = (room.rev || 0) + 1;
        if (!room.blindPicks) room.blindPicks = {};
        const pv = (data.data && data.data.d !== undefined) ? data.data.d : (data.data || {});
        room.blindPicks[me.id] = pv;
        S.broadcastRoom(room, 'room:move', { room_id: room.id, action: 'blind', data: {}, from_id: me.id, rev: room.rev });
        const active = room.players.filter(function (p) { return !p.spectate; });
        if (active.length >= 2 && active.every(function (p) { return room.blindPicks[p.id] !== undefined; })) {
          const dirs = {};
          active.forEach(function (p) { dirs[p.id] = room.blindPicks[p.id]; });
          delete room.blindPicks;
          S.broadcastRoom(room, 'room:move', { room_id: room.id, action: 'blindResult', data: { dirs: dirs }, from_id: null, rev: room.rev });
        }
        return { status: 200, body: { ok: true, room: S.serializeRoom(room) } };
      }

      /* [عزل v2.68] كتابة الحالة: نوعان —
         أ) blob تشخيصي ({game_id,status} حصراً — ترسله الجسور مع كل حركة):
            يُقبل من أي عضو (لا يحمل معلومات لعبة فلا خطر عليه).
         ب) حالة حقيقية (مفاتيح لعبة: ترتيب/جولة/خريطة مقاعد...): تُقبل فقط إذا
            - الملكية: السائق/المالك (المرجع الحتمي للعبة).
            - الطزاجة: base_rev المُرسل ≥ rev الحالي — كتابة بُنيت على حالة
              فاتتها حركات ⇒ تُرفض ويُعلم العميل ليصالح (يطلب room:replay).
            (كانت أي كتابة تُقبل: آخر كاتب يفوز ⇒ الانحراف الدائم)
         رفض الحالة لا يمنع تمرير الحركة نفسها — الحركة إجراء، الحالة لقطة. */
      let stateRejected = false;
      if (data.state !== undefined && data.state !== null) {
        const clean = REG.sanitizeState(gameId, data.state);
        if (clean === null) {
          /* لا مفاتيح معروفة أصلاً — تجاهُل صامت */
        } else {
          const trivial = Object.keys(clean).every(function (k) { return k === 'game_id' || k === 'status'; });
          if (trivial) {
            room.room_state = clean;
          } else {
            const player = room.players.find(function (x) { return x.id === me.id; });
            const isActive = !!(player && !player.spectate);
            const host = isHost(room, me.id);
            const baseRev = parseInt(data.base_rev, 10);
            const stale = !isNaN(baseRev) && baseRev < (room.rev || 0);
            if (stale || !REG.canWriteState(gameId, host, isActive)) {
              stateRejected = true;
            } else {
              room.room_state = clean;
            }
          }
        }
      }

      room.rev = (room.rev || 0) + 1;   /* [v2.67·H3] ترقيم النسخة مع كل حركة */
      const payload = data.data || {};

      /* [v2.73·فلات دوغ] مرحلة المشاركة: الخادم يسجّل المطلوبَين (للتحقق عند
         roundJoin — فلا يدفع من ليس دوره) مع الحفاظ على مصادقات من دفع
         فعلاً (إعادة بث joinphase بعد انسحاب لا تمحو دفعةً سابقة). */
      if (gameId === 'rn' && data.action === 'joinphase' && payload && typeof payload === 'object') {
        const actives = room.players.filter(function (p) { return !p.spectate; });
        const req = [payload.dealer, payload.selector].filter(function (id, i, a) {
          return id != null && a.indexOf(id) === i &&
                 actives.some(function (p) { return String(p.id) === String(id); });
        });
        const prevJoined = (room.roundJoin && room.roundJoin.joined) || {};
        const joined = {};
        Object.keys(prevJoined).forEach(function (k) {
          if (req.some(function (id) { return String(id) === String(k); }) &&
              Number((room.escrow || {})[k]) > 0) joined[k] = true;
        });
        room.roundJoin = { required: req, joined: joined };
      }
      /* [v2.73·فلات دوغ] تسليح الجولة: إطلاق round من السائق يفتح التسوية
         (settled=null) ويرفع مرحلة المشاركة — قبلها أي تسوية/مغادرة=خسارة
         مرفوضة لأن لا جولة مسلّحة أصلاً */
      if (gameId === 'rn' && data.action === 'round' && isHost(room, me.id)) {
        delete room.roundJoin;
        room.settled = null;
      }

      /* [Resilience] تسجيل تاريخ الحركات + منع التكرار (حرفياً كما كان) */
      if (data.action === 'rmove' && payload && payload.action) {
        const dedupKey = payload.dedup;
        if (dedupKey) {
          if (!room.dedupSeen) room.dedupSeen = {};
          if (room.dedupSeen[dedupKey]) return { status: 200, body: { ok: true, room: S.serializeRoom(room) } };
          room.dedupSeen[dedupKey] = 1;
        }
        if (!room.moveHistory) room.moveHistory = [];
        room.moveHistory.push(payload);
        if (room.moveHistory.length > 2000) room.moveHistory.shift();
      }
      /* [عزل v2.68] سجل الحركات للحركات المسمّاة أيضاً (unmove/blmove/أكشنات
         الروندا) — كانت تُبث ولا تُسجَّل، فلا يُعاد بناؤها للعائد عبر room:replay
         إلا لمن يملك جسر rmove — أحد أسباب «اللاعب الثاني لا يفتح اللعبة» */
      if (data.action !== 'rmove' && payload && typeof payload === 'object') {
        const entry = { action: data.action, data: payload, by: payload.by != null ? payload.by : me.id, ts: Date.now() };
        if (!room.moveHistory) room.moveHistory = [];
        room.moveHistory.push(entry);
        if (room.moveHistory.length > 2000) room.moveHistory.shift();
      }

      S.broadcastRoom(room, 'room:move', { room_id: room.id, action: data.action, data: payload, from_id: me.id, rev: room.rev });
      const body = { ok: true, room: S.serializeRoom(room) };
      if (stateRejected) { body.state_rejected = true; body.rev = room.rev; }
      return { status: 200, body: body };
    },

    /* ═══════ تسوية بالمقاعد (w0-w3 / draw) [v2.69: آلية + مغادرة = خسارة] ═══════ */
    settleRound: function (me, data) {
      const room = rooms.get(data.room_id);
      if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      /* [v2.69·آلي] التسوية لم تعد رهينة جهاز المالك: المالك أو السائق أو أي
         لاعب نشط — أول تقرير صحيح يسوّي (room.settled يمنع التكرار)؛ كانت
         تُعلّق إلى الأبد إن غاب جهاز المالك لحظة النهاية = جذر «لا يُضاف للرابح» */
      const member = room.players.find(function (x) { return String(x.id) === String(me && me.id); });
      const authorized = !!(me && (room.owner_id === me.id || room.driverId === me.id ||
                         (member && !member.spectate && !member.isBot)));
      if (!authorized) return { status: 403, body: { ok: false, message: 'غير مصرّح — للاعبين النشطين فقط' } };
      if (room.status !== 'playing') return { status: 400, body: { ok: false, message: 'لا جولة جارية للتسوية' } };
      if (room.settled) return { status: 400, body: { ok: false, message: 'تمت تسوية هذه الجولة مسبقاً' } };
      /* [v2.73·فلات دوغ] نتيجة بالمعرّف u<userId>: ترتيب اللعبة (الدوران)
      غير ترتيب المقاعد، ففهرسة w0/w1 من العميل قد تصيب لاعباً خاطئاً بعد
      أول دوران — المرجع هنا ترتيب الخادم نفسه (المقاعد). */
      if (/^u\d+$/.test(String(data.result || ''))) {
        const wid = Number(String(data.result).slice(1));
        const sorder = S.serializeRoom(room).order;
        let widx = -1;
        for (let i = 0; i < sorder.length; i++) { if (Number(sorder[i]) === wid) { widx = i; break; } }
        if (widx < 0 || widx > 3) return { status: 400, body: { ok: false, message: 'الرابح ليس في مقاعد الغرفة' } };
        data.result = 'w' + widx;
      }
      return settleSeatCore(room, data.result);
    },

    /* ═══════ تسوية الفرق (t0/t1) — بلوت/روندا 2ضد2 [v2.69: آلية + مغادرة = خسارة] ═══════ */
    settleTeamRound: function (me, data) {
      const room = rooms.get(data.room_id);
      if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      const member = room.players.find(function (x) { return String(x.id) === String(me && me.id); });
      const authorized = !!(me && (room.owner_id === me.id || room.driverId === me.id ||
                         (member && !member.spectate && !member.isBot)));
      if (!authorized) return { status: 403, body: { ok: false, message: 'غير مصرّح — للاعبين النشطين فقط' } };
      if (room.status !== 'playing') return { status: 400, body: { ok: false, message: 'لا جولة جارية للتسوية' } };
      if (room.settled) return { status: 400, body: { ok: false, message: 'تمت تسوية هذه الجولة مسبقاً' } };
      const result = data.result;
      if (result !== 't0' && result !== 't1') return { status: 400, body: { ok: false, message: 'نتيجة غير صالحة' } };
      const order = S.serializeRoom(room).order;
      /* [v2.68] مقاعد زوجية (2 أو 4) — الفريق = مقعد % 2 */
      if (order.length !== 2 && order.length !== 4) return { status: 400, body: { ok: false, message: 'تسوية الفرق لمقاعد زوجية (2 أو 4) فقط' } };
      const bet = Number(room.bet) || 0;
      /* [v2.74·مال] البديل 0 لا bet — تسوية الفرق كذلك لا تُصطنع رهاناً لعضو
         بلا إيداع (نفس جذر settleSeatCore في v2.74) */
      const escrowOf = function (u) { return Number((room.escrow && room.escrow[u.id] != null) ? room.escrow[u.id] : 0); };
      let teamId = (result === 't0') ? 0 : 1;
      const seatWin = function (i) { return i % 2 === teamId; };
      const humansAll = order.map(function (pid, i) { return { pid: pid, i: i }; }).filter(function (x) { return users[x.pid]; });

      /* [v2.69] المقاعد المغادرة لا تأخذ مالاً — إن خلا الفريق «الفائز» من البشر
         يفوز الفريق الآخر (مغادرة = خسارة دائماً، حتى لو ربح الآلي عن المغادر) */
      let winHumans = humansAll.filter(function (x) { return seatWin(x.i) && !isLeftSeat(room, x.pid); }).map(function (x) { return users[x.pid]; });
      if (!winHumans.length) {
        teamId = 1 - teamId;
        winHumans = humansAll.filter(function (x) { return seatWin(x.i) && !isLeftSeat(room, x.pid); }).map(function (x) { return users[x.pid]; });
        if (!winHumans.length) return { status: 400, body: { ok: false, message: 'لا فائزون بشريون — لا تسوية' } };
      }
      const loseHumans = humansAll.filter(function (x) { return !seatWin(x.i) && !isLeftSeat(room, x.pid); }).map(function (x) { return users[x.pid]; });
      const leftHumans = humansAll.filter(function (x) { return isLeftSeat(room, x.pid); }).map(function (x) { return users[x.pid]; });

      const stake = r2(humansAll.reduce(function (s, x) { return s + escrowOf(users[x.pid]); }, 0));
      /* [v2.70·مال] الرسم 5% من الجرة كاملة (مجموع رهانات المقاعد كافة) —
         كان رهاناً واحداً × عدد الرابحين فتتقلّص حصة المنصة كلما زاد اللاعبون */
      const fee = r2(stake * ctx.BET_FEE_RATE);
      const net = r2(stake - fee);
      const share = r2(net / winHumans.length);
      let remainder = net - share * winHumans.length;
      winHumans.forEach(function (u) {
        const add = share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        u.gold = (u.gold || 0) + add;
        try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
        u._rdShare = add;
        tx(u, 'win', add, { game_id: room.game_id, note: 'فوز جولة فرق (غرفة)', balance_after: u.gold, round_id: room.roundId });
        ticket(room, u, escrowOf(u), true, add, 'فوز جولة فرق');
      });
      /* [v2.70·سجل] لا صف bet للخاسرين/المغادرين هنا — سُجّل عند الاقتطاع
         في بدء الجولة (عقد المال §2). كان يُكرَّر عند التسوية فيظهر الخاسر
         مقتطعاً مرتين في سجل المعاملات (خلل التكرار المُبلّغ). */
      /* [v2.71·تذاكر] الخاسرون والمغادرون لهم تذاكر بلا فوز (رهانهم المصروف) */
      loseHumans.concat(leftHumans).forEach(function (u) {
        ticket(room, u, escrowOf(u), false, 0, 'خسارة جولة فرق');
      });
      room.escrow = {};
      room.settled = true;
      const shape = function (u) {
        return u ? { id: u.id, username: u.username, gold: u.gold, share: u._rdShare || 0 } : null;
      };
      const payload = {
        ok: true, result: (teamId === 0 ? 't0' : 't1'), pot: bet, fee: fee, payout: net, teamSplit: true,
        winners: winHumans.map(shape), losers: loseHumans.concat(leftHumans).map(shape), refunds: [],
        forfeited: r2(leftHumans.reduce(function (s, u) { return s + escrowOf(u); }, 0)),
        dissolved: false
      };
      S.broadcastRoom(room, 'room:settle', payload);
      if (S.dissolveIfExpired(room)) payload.dissolved = true;
      if (rooms.has(room.id)) { S.afterRoundEnd(room); S.updateRoom(room); }
      return { status: 200, body: payload };
    },

    /* ═══════ [v2.75·تحكيم] حسم أدمن — نواة التسوية نفسها بتفويض الأدمن ═══════
       نظام البث المباشر للتحكيم (server-arbitration.js): الأدمن يشاهد شاشات
       اللاعبين ويحسم الفائز من لوحته. المال لا يسلك مساراً جديداً — نفس
       settleSeatCore المعتمدة (الرابح يأخذ الجرة − 5%، مع سجل المعاملات
       وتذاكر الجولة كاملة). الفارق الوحيد: مصدر التفويض صلاحية الأدمن
       (role) بدل عضوية الغرفة — اللاعبون لا يملكون هذا المفتاح. */
    arbResolve: function (me, data) {
      const room = rooms.get(data.room_id);
      if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      if (!me || me.role === 'user') return { status: 403, body: { ok: false, message: 'الحسم للأدمن المعتمد حصراً' } };
      if (room.status !== 'playing') return { status: 400, body: { ok: false, message: 'لا جولة جارية' } };
      /* جولة سوّتها اللاعبون قبله: لا ازدواج مال — الحسم التوثيقي يكفي */
      if (room.settled) return { status: 200, body: { ok: true, already: true } };
      const result = data.result;
      if (!/^w([0-3])$/.test(String(result || '')) && result !== 'draw') {
        return { status: 400, body: { ok: false, message: 'نتيجة غير صالحة' } };
      }
      return settleSeatCore(room, result);
    },

    /* ═══════ [v2.75·تحكيم] إلغاء أدمن — استرداد كامل (نمط endBet بتفويض أدمن) ═══════ */
    arbCancel: function (me, data) {
      const room = rooms.get(data.room_id);
      if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      if (!me || me.role === 'user') return { status: 403, body: { ok: false, message: 'الإلغاء للأدمن المعتمد حصراً' } };
      if (room.status !== 'playing') return { status: 200, body: { ok: true, room: null } };
      /* [v2.73] استرداد عند أي إيداع فعلي (حتى جولة سوّيت وثبت رصيد مرحلة) */
      if (S.escrowHasFunds(room)) S.refundAllEscrow(room, 'إلغاء تحكيم أدمن — استرداد إيداعات الجولة');
      room.status = 'waiting';
      room.roundJoin = null;
      room.players.forEach(function (p) { if (!p.spectate) p.ready = false; });
      S.afterRoundEnd(room);
      if (S.dissolveIfExpired(room)) return { status: 200, body: { ok: true, room: null } };
      S.updateRoom(room);
      return { status: 200, body: { ok: true, room: S.serializeRoom(room) } };
    },

    /* ═══════ التسوية القديمة بالأسماء (روندا الكلاسيكية) ═══════ */
    settleLegacy: function (me, data) {
      const room = rooms.get(data.room_id);
      const isHost = room && me && room.owner_id === me.id;
      if (!isHost || !data.loser || !data.winner) return { status: 403, body: { ok: false, message: 'غير مصرّح' } };
      const amt = parseInt(data.amount, 10);
      if (isNaN(amt) || amt <= 0) return { status: 400, body: { ok: false, message: 'مبلغ غير صالح' } };
      const loser = Object.values(users).find(function (u) { return u.username === data.loser; });
      const winner = Object.values(users).find(function (u) { return u.username === data.winner; });
      if (!loser || !winner) return { status: 400, body: { ok: false, message: 'لاعب غير موجود' } };
      if (String(loser.id) === String(winner.id)) return { status: 400, body: { ok: false, message: 'لا يمكن أن يخسر اللاعب نفسه' } };
      /* [v2.71·بلا تكرار] رهان الجولة مقتطع مسبقاً عند البدء (escrow) — كان
         هذا المسار يخصم المبلغ من الرصيد مرةً ثانية: الخاسر مقتطع مرتين في
         السجل المالي. الآن: إن كان إيداع الخاسر مصروفاً فيستهلك منه، وإلا
         يخصم من رصيده (مباراة فردية بلا جولة غرفة). */
      const escrowed = Number((room.escrow && room.escrow[loser.id]) || 0);
      const charge = (room.status === 'playing' && escrowed > 0) ? Math.min(amt, escrowed) : 0;
      if (!charge && (loser.gold || 0) < amt) return { status: 400, body: { ok: false, message: 'رصيد الخاسر غير كافٍ' } };
      const stake = charge || amt;
      const fee = Math.round(stake * ctx.BET_FEE_RATE);
      if (charge) { room.escrow[loser.id] = 0; }
      else { loser.gold = (loser.gold || 0) - amt; }
      winner.gold = (winner.gold || 0) + (stake - fee);
      try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(loser.gold, loser.id); } catch (e) {}
      try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(winner.gold, winner.id); } catch (e) {}
      roundKey(room);
      logTx(winner, 'win', stake - fee, { game_id: room.game_id, counterparty_id: loser.id, counterparty_name: loser.username, balance_after: winner.gold, round_id: room.roundId });
      /* الخاسر بلا صف bet ثانٍ: الرهان قُطع عند البدء (أو من الرصيد هنا) */
      if (!charge) logTx(loser, 'bet', amt, { game_id: room.game_id, counterparty_id: winner.id, counterparty_name: winner.username, note: 'خسارة جولة', balance_after: loser.gold });
      ticket(room, winner, stake, true, stake - fee, 'فوز جولة');
      ticket(room, loser, stake, false, 0, 'خسارة جولة');
      room.settled = true;
      if (rooms.has(room.id)) { S.afterRoundEnd(room); S.updateRoom(room); }
      return {
        status: 200, body: { ok: true, fee: fee, loser: { username: loser.username, gold: loser.gold }, winner: { username: winner.username, gold: winner.gold } }
      };
    }
  };

  return mgr;
}

module.exports = { createRoomManager: createRoomManager };
