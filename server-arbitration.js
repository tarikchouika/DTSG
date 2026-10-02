/* ═══════════════════════════════════════════════════════════════════════════
   [v2.75] نظام البث المباشر للتحكيم البشري — Live Arbitration Stream
   ───────────────────────────────────────────────────────────────────────────
   الغرض: يسمح للأدمن بمشاهدة شاشات اللاعبين أثناء مباريات وجه لوجه (PES/
   eFootball وأمثالها) لحسم النتائج، ثم إطلاق توزيع الأرباح (الإفراج عن
   الإيداعات) من لوحة واحدة.

   المعمارية (بتوجيه المالك 2026-10-02):
     • الفيديو WebRTC نقطة-إلى-نقطة: اللاعب يبث شاشته مباشرة إلى متصفح
       الأدمن — الخادم لا يرى ولا يعيد ترميز أي إطار (حفاظ على معالج
       الهاتف وباندويث النفق).
     • الخادم «مُرشِد إشارات» حصراً (Signaling): مصافحة WebRTC (Offer/
       Answer/ICE) تُرحَّل عبر POST + ناقل SSE الحيّ القائم (/api/live)
       — بلا أي مكتبة جديدة وبلا منفذ إضافي عبر Cloudflare Tunnels:
       الإشارات JSON صغيرة (أجزاء الثانية كافية تماماً لمصافحة WebRTC).
     • «المباراة» على هذه المنصة = غرفة اللعب وجه لوجه (رهاناتها مودَعة
       في escrow بعقد المال v2.71). الحسم يعيد استخدام نواة التسوية
       المعتمدة نفسها (settleSeatCore) — لا مسار مال جديد قط: الرابح
       يستلم الجرة − 5%، والإلغاء/النزاع يسترد للجميع (صفوف refund).
     • البديل عند تعذر P2P: بث WHIP إلى MediaMTX محلي (Go خفيف) —
       الإعداد في docs/ARBITRATION_SETUP.md.

   نقاط النهاية (REST):
     POST /api/matches/:id/start-stream  — لاعب نشط: إنشاء/جلب جلسة تحكيم
                                          لغرفته + توكن البث (idempotent)
     GET  /api/matches                   — أدمن: الجلسات النشطة
     POST /api/matches/:id/resolve       — أدمن حصراً: winner_id + status
                                          (completed: إفراج عن الإيداعات
                                           disputed:  استرداد للجميع)
     POST /api/matches/:id/cancel        — أدمن حصراً: إلغاء + استرداد كامل
     POST /api/arb/signal                — ترحيل إشارة (offer/answer/ice/
                                          watch) لمشتركي الجلسة
     POST /api/arb/heartbeat             — نبض البث (متصل/منقطع) + تنبيه آلي

   الأمان: توكن عشوائي (32 hex) لكل لاعب في الجلسة يُطلب مع كل إشارة/نبض ·
   الحسم/الإلغاء لأدمن مصادق حصراً (role=admin/super) · الإشارات تُقصّ
   لحجم أقصى · لا إشارات بعد حسم الجلسة.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const crypto = require('crypto');

function createArbitration(ctx) {
  /* ctx: { users, db, roomHub, sendToUser, sseClients, pushWallet, r2, logTx, BET_FEE_RATE } */
  const { users, db, roomHub, sendToUser, sseClients, pushWallet } = ctx;

  /* ── المخطط (SQLite — في نفس قاعدة المنصة) ── */
  try {
    db.exec('CREATE TABLE IF NOT EXISTS arb_sessions (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      'room_id TEXT NOT NULL,' +
      'round_id TEXT,' +
      'status TEXT NOT NULL DEFAULT \'live\',' +   /* live|completed|disputed|cancelled */
      'winner_id INTEGER,' +
      'resolved_by INTEGER,' +
      'resolved_at INTEGER,' +
      'created_at INTEGER' +
      ');');
    db.exec('CREATE INDEX IF NOT EXISTS idx_arb_room ON arb_sessions (room_id);');
  } catch (e) { /* قائمة أصلاً */ }

  /* ── الحالة الحية (الإشارات عابرة — لا تُخزَّن؛ الجلسات فقط) ── */
  const live = new Map();   /* roomId -> session (في الذاكرة، مرآة الجدول) */

  function rowToSession(r) {
    if (!r) return null;
    return {
      id: r.id, room_id: r.room_id, round_id: r.round_id, status: r.status,
      winner_id: r.winner_id, resolved_by: r.resolved_by,
      resolved_at: r.resolved_at, created_at: r.created_at,
      players: [], streams: {}
    };
  }
  function loadFromDb(roomId) {
    try {
      const r = db.prepare("SELECT * FROM arb_sessions WHERE room_id = ? AND status = 'live' ORDER BY id DESC LIMIT 1").get(String(roomId));
      return rowToSession(r);
    } catch (e) { return null; }
  }
  function persist(s) {
    try {
      db.prepare('INSERT OR REPLACE INTO arb_sessions (id, room_id, round_id, status, winner_id, resolved_by, resolved_at, created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(s.id, s.room_id, s.round_id || null, s.status, s.winner_id || null, s.resolved_by || null, s.resolved_at || null, s.created_at || Date.now());
    } catch (e) {}
  }

  /* ── دفعة محفظة فورية لكل لاعبي الجلسة — مسارات الاسترداد (نزاع/إلغاء)
     لا تمر بـroom:settle فيبقى رصيد متصفح اللاعب قديماً حتى المزامنة
     القادمة؛ التسوية (الفائز) تمر بمسار _onSettle فتتحدث تلقائياً ── */
  function pushWallets(room) {
    try {
      if (typeof pushWallet !== 'function' || !room) return;
      room.players.forEach(function (p) {
        if (p.spectate) return;
        const u = users[p.id];
        if (u) pushWallet(Number(p.id), { via: 'arbitration' });   /* بالمعرّف — الدالة تتوقع userId */
      });
    } catch (e) {}
  }
  function broadcast(session, event, data) {
    const payload = { room_id: session.room_id, session: publicSession(session) };
    const full = Object.assign({}, data || {}, payload);
    /* اللاعبون الأعضاء عبر ناقلهم الشخصي */
    session.players.forEach(function (pl) {
      if (pl.userId != null) sendToUser(Number(pl.userId), event, full);
    });
    /* الأدمن المتصلون عبر SSE العام (نمط adminpay) */
    try {
      sseClients.forEach(function (c) {
        const cu = c.userId != null ? users[c.userId] : null;
        if (cu && (cu.role === 'admin' || cu.role === 'super')) {
          try { c.res.write('event: ' + event + '\ndata: ' + JSON.stringify(full) + '\n\n'); } catch (e) {}
        }
      });
    } catch (e) {}
  }

  /* جلسة للاستهلاك الخارجي — بلا توكنات */
  function publicSession(s) {
    if (!s) return null;
    return {
      room_id: s.room_id, round_id: s.round_id, status: s.status,
      game_id: s.game_id, bet: s.bet, code: s.code, created_at: s.created_at,
      winner_id: s.winner_id, resolved_at: s.resolved_at,
      players: (s.players || []).map(function (p) {
        return { user_id: p.userId, username: p.username, seat: p.seat, state: p.state, relay: !!p.relay, last_seen: p.lastSeen };
      })
    };
  }

  /* ── جلب/إنشاء جلسة التحكيم لغرفة ── */
  function getOrCreateSession(room) {
    let s = live.get(room.id);
    if (s && s.status === 'live') return s;
    s = loadFromDb(room.id);
    if (s && s.status === 'live') { live.set(room.id, s); return s; }
    /* جلسة جديدة: اللاعبون النشطون في الغرفة (غير المتفرجين) */
    const order = roomHub.io.serializeRoom(room).order;
    const players = [];
    order.forEach(function (pid, i) {
      const u = users[pid];
      if (!u) return;
      players.push({
        userId: u.id, username: u.username, seat: i,
        token: crypto.randomBytes(16).toString('hex'),
        state: 'idle', relay: false, lastSeen: 0
      });
    });
    s = {
      id: null, room_id: room.id, round_id: room.roundId || null, status: 'live',
      game_id: room.game_id, bet: Number(room.bet) || 0, code: room.code,
      winner_id: null, resolved_by: null, resolved_at: null, created_at: Date.now(),
      players: players, streams: {}
    };
    try {
      const info = db.prepare('INSERT INTO arb_sessions (room_id, round_id, status, created_at) VALUES (?,?,?,?)')
        .run(s.room_id, s.round_id, 'live', s.created_at);
      s.id = Number(info.lastInsertRowid);
    } catch (e) { s.id = Date.now(); }
    live.set(room.id, s);
    return s;
  }

  function adminOnly(me) {
    return !!(me && (me.role === 'admin' || me.role === 'super'));
  }

  /* ══════════ الواجهة (يستدعيها server.js) ══════════ */
  return {
    /* [v2.76·صفحة التحكيم] جلستي: غرفة المستخدم الجارية (إن كان لاعباً
       نشطاً فيها) + جلسة التحكيم المرتبطة بها إن وُجدت — لتشغيل صفحة
       التحكيم عند اللاعب بلا الاعتماد على مودال الغرفة. بلا توكنات. */
    mine: function (me) {
      if (!me) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
      const myRooms = roomHub.roomsOfUser(me.id) || [];
      const room = myRooms.find(function (r) {
        const p = r.players.find(function (x) { return String(x.id) === String(me.id); });
        return p && !p.spectate;
      }) || null;
      if (!room) {
        return { status: 200, body: { ok: true, room: null, session: null, can_broadcast: false } };
      }
      const s = live.get(room.id);
      const session = (s && s.status === 'live') ? s : null;
      return {
        status: 200,
        body: {
          ok: true,
          can_broadcast: room.status === 'playing',
          room: {
            id: room.id, code: room.code, game_id: room.game_id,
            bet: Number(room.bet) || 0, status: room.status,
            round_id: room.roundId || null,
            players: (room.players || []).filter(function (p) { return !p.spectate; })
              .map(function (p) {
                const u = users[p.id];
                return { id: p.id, username: (u && u.username) || p.username || ('#' + p.id), ready: !!p.ready, is_bot: !!p.isBot };
              })
          },
          session: session ? publicSession(session) : null
        }
      };
    },

    /* لاعب نشط في غرفة جارية: يفتح/يجلب جلسة التحكيم ويستلم توكنه */
    startStream: function (me, roomId) {
      if (!me) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
      if (me.role !== 'user') return { status: 403, body: { ok: false, message: 'التحكيم للاعبين — الأدمن يشاهد من لوحته' } };
      const room = roomHub.findById(roomId);
      if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      const member = room.players.find(function (p) { return String(p.id) === String(me.id); });
      if (!member || member.spectate) return { status: 403, body: { ok: false, message: 'للاعبين النشطين في الغرفة فقط' } };
      if (room.status !== 'playing') return { status: 400, body: { ok: false, message: 'لا جولة جارية — ابدأ المباراة أولاً' } };
      const s = getOrCreateSession(room);
      const mine = s.players.find(function (p) { return String(p.userId) === String(me.id); });
      if (!mine) return { status: 403, body: { ok: false, message: 'لست من لاعبي هذه الجولة' } };
      broadcast(s, 'arb:session', { reason: 'start' });
      return {
        status: 200,
        body: {
          ok: true, token: mine.token, room_id: s.room_id, status: s.status,
          mediamtx: process.env.MEDIAMTX_WHIP_URL || null,
          ice_servers: (process.env.ARB_STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302').split(',').filter(Boolean).map(function (u) { return { urls: u.trim() }; })
        }
      };
    },

    /* أدمن: الجلسات النشطة (مع خيار المكتملة حديثاً) */
    listSessions: function (me) {
      if (!adminOnly(me)) return { status: 403, body: { ok: false, message: 'للأدمن حصراً' } };
      const out = [];
      live.forEach(function (s) {
        if (s.status === 'live') out.push(publicSession(s));
      });
      /* استرجاع الجلسات الحية غير المحمّلة بعد إعادة تشغيل الخادم */
      try {
        const rows = db.prepare("SELECT * FROM arb_sessions WHERE status = 'live' ORDER BY id DESC LIMIT 50").all();
        rows.forEach(function (r) {
          if (!live.has(r.room_id)) {
            const room = roomHub.findById(r.room_id);
            /* [v2.76] جلسة يتيمة: غرفتها ماتت مع إعادة تشغيل الخادم — لا
               يمكن حسمها (findById فاشل) ولا تختفي من القائمة فتطارد لوحة
               الأدمن للأبد (كشفها اختبار الصفحة). تُقبر cancelled في القاعدة
               فلا تُعاد رحمتها مرة أخرى */
            if (!room) {
              try { db.prepare("UPDATE arb_sessions SET status = 'cancelled', resolved_at = ? WHERE id = ? AND status = 'live'").run(Date.now(), r.id); } catch (e) {}
              return;
            }
            const s2 = rowToSession(r);
            s2.game_id = room.game_id; s2.bet = Number(room.bet) || 0; s2.code = room.code;
            const order = roomHub.io.serializeRoom(room).order;
            s2.players = order.map(function (pid, i) {
              const u = users[pid];
              return u ? { userId: u.id, username: u.username, seat: i, state: 'idle', relay: false, lastSeen: 0 } : null;
            }).filter(Boolean);
            /* توكن جديد للاعبين الحاليين (القديم ضاع مع الذاكرة) */
            s2.players.forEach(function (p) { p.token = crypto.randomBytes(16).toString('hex'); });
            live.set(r.room_id, s2);
            if (!out.some(function (x) { return x.room_id === s2.room_id; })) out.push(publicSession(s2));
          }
        });
      } catch (e) {}
      return { status: 200, body: { ok: true, sessions: out } };
    },

    /* أدمن حصراً: حسم المباراة — إفراج عن الإيداعات عبر نواة التسوية المعتمدة */
    resolve: function (me, roomId, data) {
      if (!adminOnly(me)) return { status: 403, body: { ok: false, message: 'الحسم للأدمن المعتمد حصراً' } };
      const room = roomHub.findById(roomId);
      if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      if (room.status !== 'playing') return { status: 400, body: { ok: false, message: 'لا جولة جارية' } };
      const status = (data && (data.status === 'disputed')) ? 'disputed' : 'completed';
      const winnerId = (data && data.winner_id != null) ? Number(data.winner_id) : null;

      if (status === 'completed' && winnerId == null) {
        return { status: 400, body: { ok: false, message: 'يلزم تحديد الفائز (winner_id) أو اختيار النزاع/الإلغاء' } };
      }

      /* جولة سوّاها اللاعبون قبله (room.settled): المال تحرّك في مساره
         الصحيح — لا إعادة توزيع مهما كانت النتيجة المطلوبة (حسم توثيقي
         فقط). الفحص قبل تحقق الفائز: afterRoundEnd يعيد ترقيم المقاعد
         بعد التسوية فقد لا يُعثر على مقعده فيأتي 400 زائف. */
      let settleBody = null, settleStatus = 200;
      if (room.settled) {
        settleBody = { ok: true, already: true };
      } else if (status === 'disputed' || winnerId == null) {
        /* نزاع: استرداد كامل للجميع (لا حسم) + دفعة محفظة فورية */
        const refundRes = roomHub.exec('arbCancel', me, { room_id: room.id });
        settleStatus = refundRes.status; settleBody = refundRes.body;
        if (settleStatus === 200) pushWallets(room);
      } else {
        /* إفراج عبر نواة التسوية بالمقاعد: مقعد الفائز من ترتيب الخادم */
        const order = roomHub.io.serializeRoom(room).order;
        let wSeat = -1;
        for (let i = 0; i < order.length; i++) { if (Number(order[i]) === winnerId) { wSeat = i; break; } }
        if (wSeat < 0) return { status: 400, body: { ok: false, message: 'الفائز ليس من لاعبي هذه الغرفة' } };
        const res = roomHub.exec('arbResolve', me, { room_id: room.id, result: 'w' + wSeat });
        settleStatus = res.status; settleBody = res.body;
      }

      /* توثيق الجلسة */
      const s = getOrCreateSession(room);
      s.status = (settleStatus === 200) ? status : s.status;
      s.winner_id = (settleStatus === 200 && status === 'completed' && !settleBody.already) ? winnerId : null;
      s.resolved_by = me.id;
      s.resolved_at = Date.now();
      persist(s);
      live.delete(room.id);
      broadcast(s, 'arb:resolved', { result: s.status, winner_id: s.winner_id, settle: settleBody });

      return {
        status: settleStatus === 200 ? 200 : settleStatus,
        body: { ok: settleStatus === 200, status: s.status, winner_id: s.winner_id, settle: settleBody }
      };
    },

    /* أدمن حصراً: إلغاء + إرجاع الأموال */
    cancel: function (me, roomId) {
      if (!adminOnly(me)) return { status: 403, body: { ok: false, message: 'الإلغاء للأدمن المعتمد حصراً' } };
      const room = roomHub.findById(roomId);
      if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      const res = roomHub.exec('arbCancel', me, { room_id: room.id });
      if (res.status === 200) {
        pushWallets(room);   /* دفعة محفظة فورية للمستردّين */
        const s = getOrCreateSession(room);
        s.status = 'cancelled';
        s.resolved_by = me.id;
        s.resolved_at = Date.now();
        persist(s);
        live.delete(room.id);
        broadcast(s, 'arb:resolved', { result: 'cancelled', settle: res.body });
      }
      return res;
    },

    /* ترحيل إشارة WebRTC: offer/answer/ice/watch — للجلسة الحية حصراً */
    signal: function (me, data) {
      if (!me) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
      const roomId = data && data.room_id;
      const kind = data && data.kind;
      const payload = data && data.payload;
      const s = live.get(roomId);
      if (!s || s.status !== 'live') return { status: 404, body: { ok: false, message: 'لا جلسة تحكيم حية' } };
      const KINDS = ['offer', 'answer', 'ice', 'watch', 'rewatch', 'bye'];
      if (KINDS.indexOf(kind) === -1) return { status: 400, body: { ok: false, message: 'نوع إشارة غير معروف' } };
      try { if (JSON.stringify(payload).length > 65536) return { status: 413, body: { ok: false, message: 'إشارة كبيرة جداً' } }; } catch (e) { return { status: 400, body: { ok: false, message: 'إشارة غير صالحة' } }; }

      const isAdminSender = adminOnly(me);
      /* لاعب: توكنه إلزامي؛ أدمن: صلاحيته تكفي (لا توكن) */
      let fromPlayer = null;
      if (!isAdminSender) {
        fromPlayer = s.players.find(function (p) { return String(p.userId) === String(me.id); });
        if (!fromPlayer || fromPlayer.token !== data.token) {
          return { status: 403, body: { ok: false, message: 'توكن البث غير صالح' } };
        }
      }
      /* تحديث حالة البث من اللاعب المُرسِل */
      if (fromPlayer) {
        if (kind === 'offer' || kind === 'ice') { if (fromPlayer.state !== 'live') { fromPlayer.state = 'connecting'; broadcast(s, 'arb:session', { reason: 'state' }); } }
        if (kind === 'bye') { fromPlayer.state = 'idle'; broadcast(s, 'arb:session', { reason: 'stopped' }); }
      }
      /* الترحيل: إشارة موجّهة (to — جواب/طلب إعادة عرض) تصل هدفها وحده؛
         وإشارة بث (عرض اللاعب/مرشحاته) تصل كل أطراف الجلسة عدا المرسِل +
         كل الأدمن المتصلين (وهم وجهة البث — العرض يصل اللوحة حتى قبل فتحها).
         مشاهد واحد يحسم في آن: آخر من يطلب rewatch يأخذ الاتصال */
      const msg = { room_id: s.room_id, kind: kind, from: me.id, from_name: me.username, to: (data && data.to) || null, payload: payload };
      let relayed = 0;
      const toId = (data && data.to != null && data.to !== '') ? Number(data.to) : null;
      if (toId) {
        sendToUser(toId, 'arb:signal', msg);
        relayed = 1;
      } else {
        const targets = [];
        s.players.forEach(function (p) { if (String(p.userId) !== String(me.id)) targets.push(Number(p.userId)); });
        targets.forEach(function (uid) { sendToUser(uid, 'arb:signal', msg); });
        relayed = targets.length;
        try {
          sseClients.forEach(function (c) {
            const cu = c.userId != null ? users[c.userId] : null;
            if (cu && (cu.role === 'admin' || cu.role === 'super') && String(cu.id) !== String(me.id)) {
              try { c.res.write('event: arb:signal\ndata: ' + JSON.stringify(msg) + '\n\n'); relayed++; } catch (e) {}
            }
          });
        } catch (e) {}
      }
      return { status: 200, body: { ok: true, relayed: relayed } };
    },

    /* نبض البث: يحدّث حالة اللاعب ويحرس الانقطاع آلياً */
    heartbeat: function (me, data) {
      if (!me) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
      const s = live.get(data && data.room_id);
      if (!s || s.status !== 'live') return { status: 404, body: { ok: false, message: 'لا جلسة حية' } };
      const p = s.players.find(function (x) { return String(x.userId) === String(me.id); });
      if (!p || p.token !== data.token) return { status: 403, body: { ok: false, message: 'توكن غير صالح' } };
      const was = p.state;
      p.lastSeen = Date.now();
      const st = (data.state === 'live' || data.state === 'connecting' || data.state === 'idle' || data.state === 'failed' || data.state === 'relay') ? data.state : p.state;
      p.state = st;
      if (data.relay === true && st === 'relay') p.relay = true;
      if (st !== was) broadcast(s, 'arb:session', { reason: 'state' });
      return { status: 200, body: { ok: true, state: p.state } };
    },

    /* منظّف خفيف: انقطاع نبض > 15ث يوسم failed وينبّه الأدمن آلياً */
    sweep: function () {
      const now = Date.now();
      live.forEach(function (s) {
        if (s.status !== 'live') return;
        s.players.forEach(function (p) {
          if ((p.state === 'live' || p.state === 'connecting' || p.state === 'relay') &&
              p.lastSeen && now - p.lastSeen > 15000) {
            p.state = 'failed';
            broadcast(s, 'arb:session', { reason: 'timeout', user_id: p.userId });
          }
        });
      });
    },

    publicSession: publicSession,
    _live: live
  };
}

module.exports = { createArbitration: createArbitration };
