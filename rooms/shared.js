/* ═══════════════════════════════════════════════════════════════════════════
   [v2.68] طبقة الغرف المشتركة — توابع نقية فوق كائن الغرفة
   ═══════════════════════════════════════════════════════════════════════════

   هذه التوابع كانت مكتوبة داخل server.js (v2.67) وتعمل على الخريطة العالمية
   `rooms` المشتركة بين كل الألعاب. الآن صارت طبقة مشتركة صريحة: تعمل على
   «كائن غرفة» يملكه مدير لعبة محدّد (rooms/room-manager.js)، والحذف/التعداد
   يمرّ عبر ردود نداء يسجّلها المحور (rooms/index.js) — فلا تعرف هذه الطبقة
   شيئاً عن الخرائط ولا عن الألعاب.

   كل إصلاحات v2.67 محفوظة هنا حرفياً: rev للمصالحة، استرداد الإيداعات،
   غرف الساعة، تصويت المباراة الجديدة، ترقية الطابور، السائق/الأشباح.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

/* ينشئ الطبقة المشتركة فوق سياق الخادم (users/db/sseClients/...) */
function createSharedRoomIO(ctx) {
  const { users, db, sseClients } = ctx;

  function sendSSE(res, event, data) {
    try { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch (e) {}
  }

  /* بثّ لكل أعضاء الغرفة (لاعبين + متفرجين) عبر قنوات SSE الحية */
  function broadcastRoom(room, event, payload) {
    const memberIds = new Set(room.players.map(function (p) { return p.id; }));
    sseClients.forEach(function (c) {
      if (c.userId != null && memberIds.has(c.userId)) sendSSE(c.res, event, payload);
    });
  }

  /* [v2.67·H3] كل تعديل حالة يرفع ترقيم النسخة rev للمصالحة */
  function updateRoom(room) {
    room.rev = (room.rev || 0) + 1;
    broadcastRoom(room, 'room:update', serializeRoom(room));
  }

  /* ═══════ تسلسل الغرفة للعميل (الشكل العام الموحّد لكل الألعاب) ═══════ */
  function serializeRoom(room) {
    const nonspec = room.players.filter(function (p) { return !p.spectate; }).sort(function (a, b) { return a.seat - b.seat; });
    return {
      id: room.id,
      code: room.code,
      game_id: room.game_id,
      owner_id: room.owner_id,
      owner_name: room.owner_name,
      max_players: room.max_players,
      status: room.status,
      bet: room.bet || 0,
      room_type: room.room_type || null,
      expires_at: room.expires_at != null ? Number(room.expires_at) : null,
      visibility: room.visibility === 'private' ? 'private' : 'public',
      settled: !!room.settled,
      rev: room.rev || 0,
      expired: !!room.expired,
      players: room.players.map(function (p) {
        return { id: p.id, username: p.username, ready: !!p.ready, spectate: !!p.spectate, seat: p.seat, isBot: !!p.isBot };
      }),
      order: nonspec.map(function (p) { return p.id; }),
      room_state: room.room_state || {},
      game_opts: room.game_opts || null,
      seats: { players: nonspec.length, max: room.max_players, free: Math.max(0, room.max_players - nonspec.length) },
      joinQueue: (room.joinQueue || []).map(function (r) { return { id: r.id, username: r.username, ts: r.ts }; }),
      driverId: room.driverId != null ? room.driverId : room.owner_id,
      hasHistory: !!(room.moveHistory && room.moveHistory.length),
      online: Object.keys(room.online || {}),
      rematch: room.rematch ? {
        participants: room.rematch.participants || [],
        votes: room.rematch.votes || {},
        resolved: !!room.rematch.resolved,
        rematch: !!room.rematch.rematch,
        agreed: room.rematch.agreed || [],
        names: room.rematch.names || {},
        ts: room.rematch.ts || 0
      } : null
    };
  }

  /* ═══════ [B-rooms] غرف الساعة ═══════ */
  function roomTimeUp(room) { return !!(room && room.room_type === 'hour' && room.expires_at != null && Date.now() > room.expires_at); }

  /* حُلّ الغرفة: بثّ room:update بقيمة null ثم حذفها عبر المحور */
  function dissolveRoom(room) {
    if (!room || !ctx.isRoomLive(room.id)) return;
    if (room.status === 'playing' && !room.settled) refundAllEscrow(room);
    broadcastRoom(room, 'room:update', null);
    ctx.removeRoom(room);
  }

  /* [v2.67·مال] استرداد إيداع رهان لاعب — استرجاع صامت للرصيد */
  function refundEscrow(room, uid) {
    try {
      if (!room || !room.escrow || uid == null) return 0;
      const amt = Number(room.escrow[uid] || 0);
      if (!(amt > 0)) return 0;
      room.escrow[uid] = 0;
      const u = users[uid];
      if (u) {
        u.gold = (u.gold || 0) + amt;
        try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
      }
      return amt;
    } catch (e) { return 0; }
  }
  function refundAllEscrow(room) {
    if (!room || !room.escrow) return;
    Object.keys(room.escrow).forEach(function (uid) { refundEscrow(room, Number(uid)); });
    room.escrow = {};
  }

  function sweepExpiredRoom(room) {
    if (!roomTimeUp(room)) return false;
    if (room.status === 'playing') {
      if (!room.expired) room.expired = true;
      return false;
    }
    dissolveRoom(room);
    return true;
  }
  function dissolveIfExpired(room) {
    if (!room || room.room_type !== 'hour') return false;
    if (!room.expired && !roomTimeUp(room)) return false;
    dissolveRoom(room);
    return true;
  }

  /* ═══════ [Req3] حلّ تصويت المباراة الجديدة ═══════ */
  function tryResolveRematch(room) {
    if (!room || !room.rematch || room.rematch.resolved) return false;
    var rm = room.rematch;
    var inRoom = function (id) { return room.players.some(function (p) { return p.id === id; }); };
    var allDecided = rm.participants.every(function (id) { return rm.votes[id] || !inRoom(id); });
    if (!allDecided) return false;
    var agreed = rm.participants.filter(function (id) { return rm.votes[id] === 'agree' && inRoom(id); });
    rm.resolved = true;
    var ownerPresent = inRoom(room.owner_id);
    if (agreed.length >= 2 && (!ownerPresent || agreed.indexOf(room.owner_id) !== -1)) {
      room.players.forEach(function (p) {
        if (agreed.indexOf(p.id) !== -1) { p.spectate = false; p.ready = true; }
        else { p.spectate = true; p.ready = true; }
      });
      const bet = Number(room.bet) || 0;
      room.players.filter(function (p) { return !p.spectate; }).forEach(function (p) {
        const u = users[p.id];
        if (u && (u.gold || 0) >= bet) {
          if (bet > 0) {
            u.gold = (u.gold || 0) - bet;
            try { db.prepare('UPDATE users SET gold = ? WHERE id = ?').run(u.gold, u.id); } catch (e) {}
          }
        } else {
          p.spectate = true; p.ready = true;
        }
      });
      room.escrow = {};
      room.players.filter(function (p) { return !p.spectate; }).forEach(function (p) {
        if (users[p.id]) room.escrow[p.id] = bet;
      });
      var seat = 0;
      room.players.filter(function (p) { return !p.spectate; }).forEach(function (p) { p.seat = seat++; });
      room.status = 'playing';
      room.rematch = null;
      room.moveHistory = [];
      room.dedupSeen = {};
      room.settled = null;
    } else {
      rm.rematch = false; rm.agreed = agreed;
    }
    return true;
  }

  /* ═══════ [Spectator] ترقية طابور الانضمام ═══════ */
  function promoteQueued(room) {
    if (!room || !room.joinQueue || !room.joinQueue.length) return;
    for (;;) {
      const nonSpec = room.players.filter(function (p) { return !p.spectate; }).length;
      if (nonSpec >= room.max_players) break;
      const req = room.joinQueue.shift();
      if (!req) break;
      const p = room.players.find(function (x) { return x.id === req.id; });
      if (p) {
        p.spectate = false;
        p.ready = true;
        p.seat = nonSpec;
      } else {
        room.players.push({ id: req.id, username: req.username, ready: true, spectate: false, seat: nonSpec });
      }
    }
    if (!room.joinQueue.length) room.joinQueue = [];
  }

  /* ═══════ [Resilience] السائق والاتصال ═══════ */
  function isOnline(room, uid) { return !!(room && room.online && room.online[uid] > 0); }
  function markOnline(room, uid) {
    if (!room) return;
    if (!room.online) room.online = {};
    if (!room.lastActivity) room.lastActivity = {};
    room.lastActivity[uid] = Date.now();
    room.online[uid] = (room.online[uid] || 0) + 1;
    if (room.driverId != null && !isOnline(room, room.driverId)) {
      var me = room.players.find(function (p) { return p.id === uid && !p.spectate; });
      if (me) { var before = room.driverId; room.driverId = uid; if (before !== uid) updateRoom(room); }
    }
  }
  function markOffline(room, uid) {
    if (!room || !room.online) return;
    room.online[uid] = (room.online[uid] || 1) - 1;
    if (room.online[uid] <= 0) { delete room.online[uid]; }
    if (room.driverId === uid) reassignDriver(room);
  }
  function reassignDriver(room) {
    if (!room) return;
    const nonspec = room.players.filter(function (p) { return !p.spectate; }).sort(function (a, b) { return a.seat - b.seat; });
    const next = nonspec.find(function (p) { return isOnline(room, p.id) && !p.isBot; });
    const before = room.driverId;
    const humanFallback = nonspec.find(function (p) { return !p.isBot; });
    room.driverId = next ? next.id : (humanFallback ? humanFallback.id : (nonspec.length ? nonspec[0].id : room.owner_id));
    if (before !== room.driverId) { updateRoom(room); }
  }

  return {
    sendSSE: sendSSE,
    broadcastRoom: broadcastRoom,
    updateRoom: updateRoom,
    serializeRoom: serializeRoom,
    roomTimeUp: roomTimeUp,
    dissolveRoom: dissolveRoom,
    refundEscrow: refundEscrow,
    refundAllEscrow: refundAllEscrow,
    sweepExpiredRoom: sweepExpiredRoom,
    dissolveIfExpired: dissolveIfExpired,
    tryResolveRematch: tryResolveRematch,
    promoteQueued: promoteQueued,
    isOnline: isOnline,
    markOnline: markOnline,
    markOffline: markOffline,
    reassignDriver: reassignDriver
  };
}

module.exports = { createSharedRoomIO: createSharedRoomIO };
