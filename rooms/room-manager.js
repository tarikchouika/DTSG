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
    const humans = order.filter(function (pid) { return users[pid]; }).map(function (pid) { return users[pid]; });
    if (!humans.length) return { status: 400, body: { ok: false, message: 'لا لاعبون بشريون — لا تسوية' } };
    const escrowOf = function (u) { return Number((room.escrow && room.escrow[u.id] != null) ? room.escrow[u.id] : pot); };

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
    const leftHumans = order.filter(function (pid) { return isLeftSeat(room, pid) && users[pid]; }).map(function (pid) { return users[pid]; });
    const forfeitTotal = r2(leftHumans.reduce(function (s, u) { return s + escrowOf(u); }, 0));
    const shape = function (u, extra) { return u ? Object.assign({ id: u.id, username: u.username, gold: u.gold }, extra || {}) : null; };

    let fee = 0, payout = 0;
    const winnerOut = null, refundsOut = [], losersOut = [];

    if (drawMode) {
      /* تعادل: كل باقٍ يسترد إيداعه + حصة متساوية من مصادرات المغادرين */
      fee = r2(forfeitTotal * ctx.BET_FEE_RATE);
      let remainderPool = r2(forfeitTotal - fee);
      const share = stayers.length ? r2(remainderPool / stayers.length) : 0;
      let extraLeft = r2(remainderPool - share * stayers.length);
      stayers.forEach(function (u) {
        const bonus = share + (extraLeft > 0 ? 1 : 0);
        if (extraLeft > 0) extraLeft = r2(extraLeft - 1);
        const back = r2(escrowOf(u) + bonus);
        if (back > 0) {
          u.gold = (u.gold || 0) + back;
          try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
          tx(u, 'refund', back, { game_id: room.game_id, note: 'تعادل جولة' + (bonus > 0 ? ' + حصة مغادر' : ''), balance_after: u.gold });
        }
        refundsOut.push(shape(u, { refunded: back }));
      });
      payout = r2(stayers.reduce(function (s, u) { return s + escrowOf(u); }, 0) + remainderPool);
    } else {
      const winner = users[order[wSeat]];
      if (!winner) return { status: 400, body: { ok: false, message: 'الرابح غير موجود — لا تسوية' } };
      const stake = r2(humans.reduce(function (s, u) { return s + escrowOf(u); }, 0));
      /* [v2.70·مال] الرسم 5% من الجرة كاملة (مجموع رهانات المراهنين كافة) —
         كان يُحسب من رهان لاعب واحد (pot = room.bet) ففي الغرف متعددة
         اللاعبين تدفع المنصة الفارق من جيبتها للرابح (توجيه المالك:
         «الكسور لا تقتطع للمراهنين و تدفع على حساب المنصة للرابح»). */
      fee = r2(stake * ctx.BET_FEE_RATE);
      payout = r2(stake - fee);
      winner.gold = (winner.gold || 0) + payout;
      try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(winner.gold, winner.id); } catch (e) {}
      tx(winner, 'win', payout, { game_id: room.game_id, note: 'فوز جولة غرفة', balance_after: winner.gold });
      /* [v2.70·سجل] لا صف bet للخاسرين هنا — صف الرهان سُجّل عند الاقتطاع
         في بدء الجولة (عقد المال §2). كان يُسجّل ثانيةً عند التسوية فيظهر
         الخاسر مقتطعاً مرتين في سجل المعاملات (خلل التكرار المُبلّغ). */
      humans.forEach(function (u) {
        if (u.id !== winner.id) {
          losersOut.push(shape(u));
        }
      });
    }

    room.escrow = {};
    room.settled = true;
    const payload = {
      ok: true, result: (drawMode ? 'draw' : 'w' + wSeat), pot: pot, fee: fee,
      winner: (!drawMode && wSeat >= 0) ? shape(users[order[wSeat]]) : null,
      loser: losersOut[0] || null, losers: losersOut,
      refunds: refundsOut, forfeited: forfeitTotal,
      dissolved: false, payout: payout
    };
    S.broadcastRoom(room, 'room:settle', payload);
    if (S.dissolveIfExpired(room)) payload.dissolved = true;
    return { status: 200, body: payload };
  }

  /* ── عون: هل هذا المستخدم مضيفاً مرجعياً (مالك أو سائق حالي)؟ ── */
  function isHost(room, uid) {
    return !!room && uid != null && (room.owner_id === uid || room.driverId === uid);
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
            visibility: r.visibility === 'private' ? 'private' : 'public'
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
          /* ثنائي: الخصم الباقي رابح فوراً (مغادرة = خسارة) — تسوية آنية */
          const orderNow = S.serializeRoom(room).order;
          if (orderNow.length === 2) {
            const otherIdx = (String(orderNow[0]) === String(uid)) ? 1 : 0;
            const otherId = orderNow[otherIdx];
            const other = room.players.find(function (x) { return String(x.id) === String(otherId); });
            if (other && !other.leftRound && users[otherId]) {
              const r = settleSeatCore(room, 'w' + otherIdx);
              if (r.status === 200) { S.updateRoom(room); return { status: 200, body: r.body }; }
            }
            /* الباقي أيضاً مغادر — استرداد الجميع وحل الغرفة */
            S.refundAllEscrow(room);
            S.broadcastRoom(room, 'room:update', null);
            if (ctx.removeRoom) ctx.removeRoom(room); else rooms.delete(room.id);
            return { status: 200, body: { ok: true } };
          }
          S.updateRoom(room);
          return { status: 200, body: { ok: true } };
        }
        /* خارج الجولة: السلوك التاريخي — إزالة عادية (بلا إيداعات أصلاً) */
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
        payers.forEach(function (p) {
          const u = users[p.id];
          u.gold = (u.gold || 0) - bet;
          try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
          /* [v2.69·مال] سجل اقتطاع الرهان لحظة البدء — كانت الغرف تقتطع بلا سجل */
          tx(u, 'bet', bet, { game_id: gameId, note: 'رهان بدء جولة غرفة', balance_after: u.gold });
        });
        room.escrow = {};
        payers.forEach(function (p) { room.escrow[p.id] = bet; });
        room.status = 'playing';
        room.settled = null;
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
        if (!room.settled && room.escrow) S.refundAllEscrow(room);
        dropBots(room);
        room.status = 'waiting';
        room.players.forEach(function (p) { if (!p.spectate) p.ready = false; });
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
        } else {
          p.spectate = true;
          p.ready = true;
        }
      }
      S.promoteQueued(room);
      S.updateRoom(room);
      return { status: 200, body: { ok: true, room: S.serializeRoom(room) } };
    },

    /* ═══════ تصويت المباراة الجديدة [v2.69: الآليون خارج التصويت نهائياً] ═══════ */
    rematchStart: function (me, data) {
      const room = rooms.get(data.room_id);
      const mePart = room && me && room.players.some(function (p) { return p.id === me.id && !p.spectate; });
      if (mePart && !room.rematch) {
        if (S.sweepExpiredRoom(room)) return { status: 200, body: { ok: true, room: null } };
        /* [v2.70·مال] جولة غير مسوّاة تُستبدل بريماش: المال لا يتبخر —
           استرداد الإيداعات قبل بدء التصويت. إن سبقته تسوية صحيحة فلا
           إيداعات أصلاً (escrow={} وsettled=true) فلا أثر لهذا الاسترداد.
           (كان الريماش يستبدل escrow بلا تسوية ولا استرداد = اختفاء المال) */
        if (room.status === 'playing' && !room.settled && room.escrow) {
          S.refundAllEscrow(room, 'استرداد قبل إعادة المباراة (جولة غير مسوّاة)');
        }
        /* الجولة انتهت — من غادر أو غاب لا يعود مقعداً: إسقاط الآليين أولاً */
        dropBots(room);
        const parts = room.players.filter(function (p) { return !p.spectate; });
        if (!parts.length) {
          S.broadcastRoom(room, 'room:update', null);
          if (ctx.removeRoom) ctx.removeRoom(room); else rooms.delete(room.id);
          return { status: 200, body: { ok: true, room: null } };
        }
        const names = {};
        parts.forEach(function (p) { names[p.id] = p.username; });
        room.rematch = { participants: parts.map(function (p) { return p.id; }), votes: {}, names: names, ts: Date.now() };
        room.status = 'waiting';
        S.updateRoom(room);
        const rid = room.id;
        setTimeout(function () {
          const r = rooms.get(rid);
          if (r && r.rematch && !r.rematch.resolved) {
            r.rematch.participants.forEach(function (id) { if (!r.rematch.votes[id]) r.rematch.votes[id] = 'refuse'; });
            if (S.tryResolveRematch(r)) S.updateRoom(r);
            if (r.rematch && r.rematch.resolved && !r.rematch.rematch) S.dissolveIfExpired(r);
          }
        }, 60000);
      }
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
      const escrowOf = function (u) { return Number((room.escrow && room.escrow[u.id] != null) ? room.escrow[u.id] : bet); };
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
        tx(u, 'win', add, { game_id: room.game_id, note: 'فوز جولة فرق (غرفة)', balance_after: u.gold });
      });
      /* [v2.70·سجل] لا صف bet للخاسرين/المغادرين هنا — سُجّل عند الاقتطاع
         في بدء الجولة (عقد المال §2). كان يُكرَّر عند التسوية فيظهر الخاسر
         مقتطعاً مرتين في سجل المعاملات (خلل التكرار المُبلّغ). */
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
      return { status: 200, body: payload };
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
      if ((loser.gold || 0) < amt) return { status: 400, body: { ok: false, message: 'رصيد الخاسر غير كافٍ' } };
      const fee = Math.round(amt * ctx.BET_FEE_RATE);
      loser.gold = (loser.gold || 0) - amt;
      winner.gold = (winner.gold || 0) + (amt - fee);
      try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(loser.gold, loser.id); } catch (e) {}
      try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(winner.gold, winner.id); } catch (e) {}
      logTx(winner, 'win', amt - fee, { game_id: room.game_id, counterparty_id: loser.id, counterparty_name: loser.username, balance_after: winner.gold });
      logTx(loser, 'bet', amt, { game_id: room.game_id, counterparty_id: winner.id, counterparty_name: winner.username, note: 'خسارة جولة', balance_after: loser.gold });
      return {
        status: 200, body: { ok: true, fee: fee, loser: { username: loser.username, gold: loser.gold }, winner: { username: winner.username, gold: winner.gold } }
      };
    }
  };

  return mgr;
}

module.exports = { createRoomManager: createRoomManager };
