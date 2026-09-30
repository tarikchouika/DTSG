var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/room-do.js
var HOUR_ROOM_MS = 60 * 60 * 1e3;
/* ═══ [SEC] أدوات أمان: تعقيم HTML + حد معدل بسيط في الذاكرة (best-effort لكل نسخة) ═══ */
function sanitizeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
__name(sanitizeHtml, "sanitizeHtml");
var __rlMap = new Map();
function rateLimited(key, max, winMs) {
  const now = Date.now();
  let e = __rlMap.get(key);
  if (!e || now - e.t0 > winMs) { e = { t0: now, n: 0 }; __rlMap.set(key, e); }
  e.n++;
  if (__rlMap.size > 5000) __rlMap.clear();
  return e.n > max;
}
__name(rateLimited, "rateLimited");
function serializeRoom(room) {
  const nonspec = room.players.filter((p) => !p.spectate).sort((a, b) => a.seat - b.seat);
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
    visibility: room.visibility === "private" ? "private" : "public",
    expires_at: room.expires_at != null ? Number(room.expires_at) : null,
    players: room.players.map((p) => ({
      id: p.id,
      username: p.username,
      ready: !!p.ready,
      spectate: !!p.spectate,
      seat: p.seat,
      isBot: !!p.isBot,
      online: !!(room.online && room.online[p.id])
    })),
    joinQueue: (room.joinQueue || []).map((r) => ({ id: r.id, username: r.username, ts: r.ts })),
    order: nonspec.map((p) => p.id),
    driver_id: room.driverId || room.owner_id,
    rematch: room.rematch || null,
    game_opts: room.game_opts || {}
  };
}
__name(serializeRoom, "serializeRoom");
/* [Spectator] ترقية المتفرجين في الطابور إلى مقاعد شاغرة — نقل حرفي من server.js */
function promoteQueued(room) {
  if (!room || !room.joinQueue || !room.joinQueue.length) return;
  for (;;) {
    const nonSpec = room.players.filter((p) => !p.spectate).length;
    if (nonSpec >= room.max_players) break;
    const req = room.joinQueue.shift();
    if (!req) break;
    const p = room.players.find((x) => x.id === req.id);
    if (p) {
      p.spectate = false;
      p.ready = true;
      p.seat = nonSpec;
    } else {
      room.players.push({ id: req.id, username: req.username, ready: true, spectate: false, seat: nonSpec });
    }
  }
}
__name(promoteQueued, "promoteQueued");
var RoomDO = class {
  static {
    __name(this, "RoomDO");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.room = null;
    this.roomId = null;
  }
  async ensureRoom() {
    if (this.room) return this.room;
    const stored = await this.state.storage.get("room");
    if (stored) {
      this.room = stored;
      this.roomId = this.roomId || stored.id;
      return this.room;
    }
    return null;
  }
  async save() {
    if (this.room) { this.room.lastTouch = Date.now(); await this.state.storage.put("room", this.room); }
  }
  /* ─── بث عام لكل المتصلين ─── */
  broadcast(event, payload) {
    const msg = JSON.stringify({ event, data: payload === void 0 ? null : payload });
    let n = 0;
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(msg);
        n++;
      } catch (e) {
      }
    }
    return n;
  }
  /* ─── بث للاعبي الغرفة فقط (بحسب tags) ─── */
  broadcastRoom(event, payload) {
    const msg = JSON.stringify({ event, data: payload === void 0 ? null : payload });
    let n = 0;
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(msg);
        n++;
      } catch (e) {
      }
    }
    return n;
  }
  updateRoom() {
    if (!this.room) return;
    this.broadcastRoom("room:update", serializeRoom(this.room));
  }
  /* ─── انتهاء صلاحية غرف الساعة ─── */
  sweepExpired() {
    const r = this.room;
    if (!r || !r.expires_at) return false;
    if (r.room_type === "hour" && Date.now() > r.expires_at) {
      if (r.status === "waiting") {
        this.broadcastRoom("room:update", null);
        this.room = null;
        this.state.storage.delete("room");
        return true;
      }
      r.status = "expiring";
    }
    return false;
  }
  /* [Group-Removal 2026-09-27] أزيل محرك الجولات الجماعية (كينو/كراش) من المنتج. */
  /* ═════════════ WebSocket الدخول ═════════════ */
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (!this.roomId) {
      const ridParam = url.searchParams.get("rid");
      if (ridParam) this.roomId = ridParam;
      else {
        const stored = await this.state.storage.get("roomId");
        if (stored) this.roomId = stored;
      }
    }
    if (url.pathname === "/ws" || req.headers.get("Upgrade") === "websocket") {
      const userId = url.searchParams.get("uid") || "0";
      const pair = new WebSocketPair();
      const client = pair[0], server = pair[1];
      this.state.acceptWebSocket(server, [String(userId)]);
      if (this.roomId === "global") {
        const online = this.state.getWebSockets().length;
        /* لا تُرسل أي سجل دردشة عامة — القناة العامة أزيلت من المنتج. */
        server.send(JSON.stringify({
          event: "hello",
          data: { online: 42 + online, winners: [] }
        }));
        return new Response(null, { status: 101, webSocket: client });
      }
      await this.ensureRoom();
      server.send(JSON.stringify({ event: "hello", data: { room: this.room ? serializeRoom(this.room) : null } }));
      if (this.room) {
        const u = this.room.players.find((x) => x.id === Number(userId));
        if (u) {
          this.room.online = this.room.online || {};
          this.room.online[u.id] = Date.now();
          this.save();
          this.updateRoom();
          if (this.room.status === "playing" && this.room.moveHistory && this.room.moveHistory.length) {
            server.send(JSON.stringify({ event: "room:replay", data: { room_id: this.room.id, history: this.room.moveHistory } }));
          }
        }
      }
      return new Response(null, { status: 101, webSocket: client });
    }
    const data = await req.json().catch(() => ({}));
    if (p === "/broadcast-chat") {
      return Response.json({ ok: false, error: "removed" }, { status: 410 });
    }
    if (p === "/create") {
      this.roomId = data.id;
      await this.state.storage.put("roomId", data.id);
      this.room = {
        id: data.id,
        code: data.code,
        game_id: data.game_id,
        owner_id: data.owner_id,
        owner_name: data.owner_name,
        max_players: data.max_players,
        status: "waiting",
        bet: data.bet,
        room_type: data.room_type,
        visibility: data.visibility || "public",
        expires_at: data.room_type === "hour" ? Date.now() + HOUR_ROOM_MS : null,
        players: [{ id: data.owner_id, username: data.owner_name, ready: false, spectate: false, seat: 0 }],
        moveHistory: [],
        dedupSeen: {},
        driverId: data.owner_id,
        online: {},
        room_state: {},
        chat: [],
        joinQueue: [],
        rematch: null,
        game_opts: (data.game_opts && typeof data.game_opts === "object") ? data.game_opts : {}
      };
      await this.save();
      return Response.json({ ok: true, room: serializeRoom(this.room) });
    }
    const room = await this.ensureRoom();
    if (!room) return Response.json({ ok: false, message: "\u0627\u0644\u063A\u0631\u0641\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" }, 404);
    if (p === "/join") {
      if (this.sweepExpired()) return Response.json({ ok: false, message: "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u063A\u0631\u0641\u0629" }, 410);
      let pl = room.players.find((x) => x.id === data.user_id);
      if (!pl) {
        const nonSpec = room.players.filter((x) => !x.spectate).length;
        if (room.status === "playing" || nonSpec >= room.max_players || data.spectate) {
          /* [RoomFlow] غرفة جارية/ممتلئة أو طلب فرجة صريح → متفرج (يطلب مقعداً لاحقاً) */
          pl = { id: data.user_id, username: data.username, ready: true, spectate: true, seat: room.players.length };
        } else {
          pl = { id: data.user_id, username: data.username, ready: false, spectate: false, seat: nonSpec };
        }
        room.players.push(pl);
      }
      await this.save();
      this.updateRoom();
      return Response.json({ ok: true, room: serializeRoom(room) });
    }
    if (p === "/leave") {
      this.sweepExpired();
      if (!this.room) return Response.json({ ok: true });
      /* [RoomFlow] خروج سلس في أي وقت: الغرفة تستمر ما بقي بشر؛
         مغادرة المالك تنقل الملكية لأقدم لاعب؛ الحل فقط عند خلوها من البشر */
      room.players = room.players.filter((x) => x.id !== data.user_id);
      if (room.joinQueue) room.joinQueue = room.joinQueue.filter((r) => r.id !== data.user_id);
      const humans = room.players.filter((x) => typeof x.id === "number" && !x.isBot);
      if (humans.length === 0) {
        this.broadcastRoom("room:update", null);
        this.room = null;
        this.state.storage.delete("room");
        return Response.json({ ok: true, dissolved: true });
      }
      if (room.owner_id === data.user_id) {
        const next = humans.find((x) => !x.spectate) || humans[0];
        room.owner_id = next.id;
        room.owner_name = next.username;
        if (room.driverId === data.user_id) room.driverId = next.id;
      }
      if (room.status !== "playing") promoteQueued(room);
      await this.save();
      this.updateRoom();
      return Response.json({ ok: true, owner_id: room.owner_id });
    }
    if (p === "/ready") {
      if (this.sweepExpired()) return Response.json({ ok: false, message: "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u063A\u0631\u0641\u0629" }, 410);
      const pl = room.players.find((x) => x.id === data.user_id);
      if (pl) pl.ready = !!data.ready;
      await this.save();
      this.updateRoom();
      return Response.json({ ok: true, room: serializeRoom(room) });
    }
    if (p === "/start") {
      if (this.sweepExpired()) return Response.json({ ok: false, message: "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u063A\u0631\u0641\u0629" }, 410);
      /* [Rotation] المالك أو صاحب المقعد 0 (رابح الجولة السابقة — صاحب حق الكسر) */
      const seat0 = room.players.filter((x) => !x.spectate).sort((a, b) => a.seat - b.seat)[0];
      if (room.owner_id !== data.user_id && !(seat0 && seat0.id === data.user_id)) return Response.json({ ok: false, message: "\u0627\u0644\u0645\u0627\u0644\u0643 \u0623\u0648 \u0631\u0627\u0628\u062D \u0627\u0644\u062C\u0648\u0644\u0629 \u0627\u0644\u0633\u0627\u0628\u0642\u0629 \u0641\u0642\u0637" }, 403);
      /* [RondaBet] روندا: الرهان غير متماثل (الموزع ×2/×3) ويُسوّى جولةً بجولة عبر /settle —
         لا خصم موحد عند البدء؛ يُتحقق فقط من كفاية رصيد كل لاعب لرهان الجولة */
      const payers = room.players.filter((x) => !x.spectate && x.id > 0);
      if (room.game_id === "rn") {
        for (const pl of payers) {
          const u = await this.env.royalcoin.prepare("SELECT id, gold FROM users WHERE id = ?").bind(pl.id).first();
          if (u && (u.gold || 0) < room.bet) return Response.json({ ok: false, error: "insufficient_funds", user: pl.username }, 400);
        }
      } else {
      const golds = [];
      for (const pl of payers) {
        const u = await this.env.royalcoin.prepare("SELECT id, gold FROM users WHERE id = ?").bind(pl.id).first();
        if (!u) continue;
        if ((u.gold || 0) < room.bet) {
          return Response.json({ ok: false, error: "insufficient_funds", user: pl.username }, 400);
        }
        golds.push(pl.id);
      }
      for (const id of golds) {
        await this.env.royalcoin.prepare("UPDATE users SET gold = gold - ? WHERE id = ?").bind(room.bet, id).run();
      }
      }
      room.status = "playing";
      room.settled = null;
      /* [SYNC-FIX] جولة جديدة تبدأ بسجل نظيف: التراكم عبر الجولات كان يجعل
         room:replay يعيد تشغيل جولات منتهية (كرات تعود، بيادق ترجع للوراء) */
      room.moveHistory = [];
      room.dedupSeen = {};
      await this.save();
      this.updateRoom();
      return Response.json({ ok: true, room: serializeRoom(room) });
    }
    if (p === "/move") {
      if (data.state !== void 0 && data.state !== null) room.room_state = data.state;
      const payload = data.data || {};
      if (data.action === "rmove" && payload && payload.action) {
        const dedupKey = payload.dedup;
        if (dedupKey) {
          room.dedupSeen = room.dedupSeen || {};
          if (room.dedupSeen[dedupKey]) return Response.json({ ok: true, room: serializeRoom(room) });
          room.dedupSeen[dedupKey] = 1;
        }
        room.moveHistory = room.moveHistory || [];
        room.moveHistory.push(payload);
        if (room.moveHistory.length > 2e3) room.moveHistory.shift();
      }
      await this.save();
      this.broadcastRoom("room:move", { room_id: room.id, action: data.action, data: payload, from_id: data.user_id || null });
      return Response.json({ ok: true, room: serializeRoom(room) });
    }
    if (p === "/chat") {
      if (data.muted_until && data.muted_until > Date.now()) {
        return Response.json({ ok: false, message: "\u0645\u0648\u0642\u0648\u0641 \u0639\u0646 \u0627\u0644\u0645\u0631\u0627\u0633\u0644\u0629", muted_until: data.muted_until }, 403);
      }
      const msg = {
        room_id: room.id,
        text: (data.text || "").slice(0, 500),
        from_id: data.user_id || null,
        from_name: data.username || "\u0632\u0627\u0626\u0631",
        to_id: data.to != null ? Number(data.to) : null,
        to_name: "",
        created_at: Date.now()
      };
      if (data.to != null) {
        const to = room.players.find((x) => x.id === Number(data.to));
        if (to) msg.to_name = to.username;
      }
      room.chat = room.chat || [];
      room.chat.push(msg);
      if (room.chat.length > 200) room.chat.shift();
      await this.save();
      this.broadcastRoom("room:chat", msg);
      return Response.json({ ok: true, msg });
    }
    if (p === "/chat-history") {
      return Response.json({ ok: true, messages: (room.chat || []).slice(-100) });
    }
    if (p === "/spectate") {
      if (this.sweepExpired()) return Response.json({ ok: false, message: "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u063A\u0631\u0641\u0629" }, 410);
      let pl = room.players.find((x) => x.id === data.user_id);
      if (!pl) { pl = { id: data.user_id, username: data.username, ready: true, spectate: false, seat: room.players.length }; room.players.push(pl); }
      /* [B10] لا ترقّي من مشاهد إلى لاعب والمقاعد ممتلئة */
      if (!data.spectate && pl.spectate) {
        const nonSpec = room.players.filter((x) => !x.spectate && x.id !== data.user_id).length;
        if (nonSpec >= room.max_players) return Response.json({ ok: false, message: "\u0627\u0644\u0645\u0642\u0627\u0639\u062F \u0645\u0645\u062A\u0644\u0626\u0629 \u2014 \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629 \u0641\u0642\u0637" }, 400);
      }
      pl.spectate = !!data.spectate;
      if (data.spectate) pl.ready = true;
      await this.save();
      this.updateRoom();
      return Response.json({ ok: true, room: serializeRoom(room) });
    }
    if (p === "/joinRequest") {
      /* [Spectator] متفرج يطلب مقعداً: طابور + ترقية فورية إن وُجد شاغر */
      if (this.sweepExpired()) return Response.json({ ok: false, message: "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u063A\u0631\u0641\u0629" }, 410);
      let pl = room.players.find((x) => x.id === data.user_id);
      if (!pl) { pl = { id: data.user_id, username: data.username, ready: true, spectate: true, seat: room.players.length }; room.players.push(pl); }
      if (pl.spectate) {
        if (!room.joinQueue) room.joinQueue = [];
        if (!room.joinQueue.some((r) => r.id === data.user_id)) room.joinQueue.push({ id: data.user_id, username: data.username, ts: Date.now() });
        if (room.status !== "playing") promoteQueued(room);
      }
      await this.save();
      this.updateRoom();
      return Response.json({ ok: true, room: serializeRoom(room) });
    }
    if (p === "/endBet") {
      if (room.owner_id === data.user_id && room.status === "playing") {
        room.status = "waiting";
        room.players.forEach((pl) => { if (!pl.spectate) pl.ready = false; });
        promoteQueued(room);
        await this.save();
        this.updateRoom();
      }
      return Response.json({ ok: true, room: serializeRoom(room) });
    }
    if (p === "/addBot") {
      if (room.owner_id === data.user_id && room.status === "waiting") {
        const nonspec = room.players.filter((pl) => !pl.spectate);
        if (nonspec.length < room.max_players) {
          const botNum = nonspec.filter((pl) => pl.isBot).length + 1;
          const botId = "bot:" + room.id + ":" + botNum;
          if (!room.players.some((pl) => pl.id === botId)) {
            room.players.push({ id: botId, username: "AI " + botNum, ready: true, spectate: false, seat: nonspec.length, isBot: true });
            await this.save();
            this.updateRoom();
          }
        }
      }
      return Response.json({ ok: true, room: serializeRoom(room) });
    }
    if (p === "/removeBot") {
      if (room.owner_id === data.user_id && room.status === "waiting" && data.botId) {
        room.players = room.players.filter((pl) => pl.id !== data.botId);
        let seat = 0;
        room.players.filter((pl) => !pl.spectate).sort((a, b) => a.seat - b.seat).forEach((pl) => { pl.seat = seat++; });
        await this.save();
        this.updateRoom();
      }
      return Response.json({ ok: true, room: serializeRoom(room) });
    }
    if (p === "/react") {
      this.broadcastRoom("room:react", { room_id: room.id, emoji: String(data.emoji || "").slice(0, 16), from_id: data.user_id, from_name: data.username, ts: Date.now() });
      return Response.json({ ok: true });
    }
    if (p === "/voice") {
      if (data.muted_until && data.muted_until > Date.now()) return Response.json({ ok: false, message: "\u0623\u0646\u062A \u0645\u0648\u0642\u0648\u0641 \u0639\u0646 \u0627\u0644\u062A\u0639\u0644\u064A\u0642" }, 403);
      const audio = String(data.audio || "");
      if (!audio.startsWith("data:audio") || audio.length > 400000) return Response.json({ ok: false, message: "\u0645\u0642\u0637\u0639 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, 400);
      this.broadcastRoom("room:voice", { room_id: room.id, from_id: data.user_id, from_name: data.username, audio, dur: Math.min(10, Number(data.dur) || 0), ts: Date.now() });
      return Response.json({ ok: true });
    }
    if (p === "/rematch-start") {
      const mePart = room.players.some((pl) => pl.id === data.user_id && !pl.spectate);
      if (mePart && !room.rematch) {
        if (this.sweepExpired()) { await this.save(); return Response.json({ ok: true, room: null }); }
        const parts = room.players.filter((pl) => !pl.spectate);
        const names = {};
        parts.forEach((pl) => { names[pl.id] = pl.username; });
        room.rematch = { participants: parts.map((pl) => pl.id), votes: {}, names, ts: Date.now() };
        room.status = "waiting";
        await this.save();
        this.updateRoom();
      }
      return Response.json({ ok: true, room: serializeRoom(room) });
    }
    if (p === "/settleRound") {
      /* [Settle] تسوية جولة رهان بنتيجة حتمية w0/w1/draw — نقل حرفي من server.js + دوران البلياردو */
      if (room.owner_id !== data.user_id) return Response.json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u0651\u062D \u2014 \u0644\u0644\u0645\u0636\u064A\u0641 \u0641\u0642\u0637" }, 403);
      if (room.status !== "playing") return Response.json({ ok: false, message: "\u0644\u0627 \u062C\u0648\u0644\u0629 \u062C\u0627\u0631\u064A\u0629 \u0644\u0644\u062A\u0633\u0648\u064A\u0629" }, 400);
      if (room.settled) return Response.json({ ok: false, message: "\u062A\u0645\u062A \u062A\u0633\u0648\u064A\u0629 \u0647\u0630\u0647 \u0627\u0644\u062C\u0648\u0644\u0629 \u0645\u0633\u0628\u0642\u0627\u064B" }, 400);
      const result = data.result;
      if (result !== "w0" && result !== "w1" && result !== "draw") return Response.json({ ok: false, message: "\u0646\u062A\u064A\u062C\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629" }, 400);
      const orderArr = serializeRoom(room).order;
      const pot = Number(room.bet) || 0;
      /* البشر الحقيقيون فقط (البوتات بلا رصيد) */
      const humanRows = [];
      for (const pid of orderArr) {
        if (typeof pid !== "number") continue;
        const u = await this.env.royalcoin.prepare("SELECT id, username, gold FROM users WHERE id = ?").bind(pid).first();
        if (u) humanRows.push(u);
      }
      let fee = 0;
      const shape = (u) => u ? { id: u.id, username: u.username, gold: u.gold } : null;
      let winnerOut = null, loserOut = null, refunds = [];
      if (result === "draw") {
        for (const u of humanRows) {
          await this.env.royalcoin.prepare("UPDATE users SET gold = gold + ? WHERE id = ?").bind(pot, u.id).run();
          u.gold = (u.gold || 0) + pot;
        }
        refunds = humanRows.map(shape);
      } else {
        const wIdx = result === "w0" ? 0 : 1;
        const winId = orderArr[wIdx], loseId = orderArr[1 - wIdx];
        const winner = typeof winId === "number" ? humanRows.find((u) => u.id === winId) : null;
        if (!winner) return Response.json({ ok: false, message: "\u0627\u0644\u0631\u0627\u0628\u062D \u0644\u0627\u0639\u0628 \u0622\u0644\u064A \u0623\u0648 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u2014 \u0644\u0627 \u062A\u0633\u0648\u064A\u0629" }, 400);
        const stake = humanRows.length * pot;
        fee = room.room_type === "percentage" ? Math.round(stake * 0.05) : 0;
        await this.env.royalcoin.prepare("UPDATE users SET gold = gold + ? WHERE id = ?").bind(stake - fee, winner.id).run();
        winner.gold = (winner.gold || 0) + (stake - fee);
        winnerOut = shape(winner);
        loserOut = typeof loseId === "number" ? shape(humanRows.find((u) => u.id === loseId)) : null;
        /* [Rotation] الرابح يحتفظ بمقعد 0 (حق الكسر)؛ الخاسر يعطي مكانه لصاحب الدور إن وُجد منتظر */
        const winPl = room.players.find((x) => x.id === winId);
        const losePl = room.players.find((x) => x.id === loseId);
        if (winPl) winPl.seat = 0;
        if (losePl) losePl.seat = 1;
        if (room.joinQueue && room.joinQueue.length && losePl) {
          losePl.spectate = true;
          losePl.ready = true;
          if (!room.joinQueue.some((r) => r.id === losePl.id)) room.joinQueue.push({ id: losePl.id, username: losePl.username, ts: Date.now() });
          promoteQueued(room);
          const promoted = room.players.filter((x) => !x.spectate && x.id !== winId);
          let s = 1;
          promoted.forEach((x) => { x.seat = s++; });
        }
      }
      room.settled = true;
      room.status = "waiting";
      room.players.forEach((pl) => { if (!pl.spectate) pl.ready = false; });
      const payout = result === "draw" ? pot : humanRows.length * pot - fee;
      const payload = { ok: true, result, pot, fee, winner: winnerOut, loser: loserOut, refunds, dissolved: false, payout };
      this.broadcastRoom("room:settle", payload);
      /* غرفة ساعة منتهية → تُحل بعد التسوية */
      if (room.room_type === "hour" && room.expires_at && Date.now() > room.expires_at) {
        payload.dissolved = true;
        this.broadcastRoom("room:update", null);
        this.room = null;
        await this.state.storage.delete("room");
        return Response.json(payload);
      }
      room.settled = null;
      await this.save();
      this.updateRoom();
      return Response.json(payload);
    }
    if (p === "/settle") {
      /* [RondaBet] تسوية جولة روندا: المتخمن يدفع الرهان، الموزع يدفع ×2 (رقم) أو ×3 (رقم+رمز)،
         الرابح يقبض الوعاء كاملاً، وتُقتطع رسوم المنصة 5% من الرابح في غرف النسبة. */
      if (data.mode === "ronda") {
        if (room.owner_id !== data.user_id) return Response.json({ ok: false, message: "\u0644\u0644\u0645\u0636\u064A\u0641 \u0641\u0642\u0637" }, 403);
        const rid = String(data.round_id || "");
        room.settleSeen = room.settleSeen || {};
        if (rid && room.settleSeen[rid]) return Response.json({ ok: true, already: true });
        if (rid) room.settleSeen[rid] = 1;
        const wid = Number(data.winner_id), lid = Number(data.loser_id);
        if (!isFinite(wid) || !isFinite(lid) || wid === lid) return Response.json({ ok: false, message: "bad ids" }, 400);
        const inRoom = (id) => room.players.some((x) => x.id === id);
        if (!inRoom(wid) || !inRoom(lid)) return Response.json({ ok: false, message: "not in room" }, 400);
        const w = await this.env.royalcoin.prepare("SELECT id, username, gold FROM users WHERE id = ?").bind(wid).first();
        const l = await this.env.royalcoin.prepare("SELECT id, username, gold FROM users WHERE id = ?").bind(lid).first();
        if (!w || !l) return Response.json({ ok: false, message: "no user" }, 404);
        let wStake = Math.max(0, Math.floor(Number(data.winner_stake) || 0));
        let lStake = Math.max(0, Math.floor(Number(data.loser_stake) || 0));
        lStake = Math.min(lStake, l.gold || 0);   /* لا دين: الخاسر يدفع ما بحوزته كحد أقصى */
        wStake = Math.min(wStake, w.gold || 0);
        const pot = wStake + lStake;
        const fee = room.room_type === "percentage" ? Math.round(pot * 0.05) : 0;
        /* الرابح: يدفع رهانه ويقبض الوعاء−الرسوم ⇒ صافي التغير = رهان الخاسر − الرسوم */
        await this.env.royalcoin.prepare("UPDATE users SET gold = gold + ? WHERE id = ?").bind(lStake - fee, wid).run();
        await this.env.royalcoin.prepare("UPDATE users SET gold = gold - ? WHERE id = ?").bind(lStake, lid).run();
        w.gold = (w.gold || 0) + lStake - fee;
        l.gold = (l.gold || 0) - lStake;
        const shape = (u) => ({ id: u.id, username: u.username, gold: u.gold });
        const payload = { ok: true, result: "rn", pot: lStake, fee, winner: shape(w), loser: shape(l), refunds: [], dissolved: false, payout: pot - fee };
        await this.save();
        this.broadcastRoom("room:settle", payload);
        return Response.json(payload);
      }
      if (room.settled) return Response.json({ ok: true, already: true });
      const payouts = data.payouts || [];
      for (const po of payouts) {
        await this.env.royalcoin.prepare("UPDATE users SET gold = gold + ? WHERE id = ?").bind(Math.max(0, Number(po.amount) || 0), po.id).run();
      }
      room.settled = { at: Date.now(), payouts };
      room.status = data.next_status || "waiting";
      room.players.forEach((pl) => {
        pl.ready = false;
      });
      if (room.status !== "playing") promoteQueued(room);   /* [RoomFlow] مقعد فرغ → متفرج الطابور يلعب */
      await this.save();
      this.updateRoom();
      return Response.json({ ok: true });
    }
    if (p === "/rematch-vote") {
      /* تصويت المباراة الجديدة — منطق tryResolveRematch من server.js */
      if (!room.rematch || room.rematch.resolved || (room.rematch.participants || []).indexOf(data.user_id) === -1) {
        return Response.json({ ok: true, room: serializeRoom(room) });
      }
      const rm = room.rematch;
      rm.votes[data.user_id] = data.vote === "agree" ? "agree" : "refuse";
      const inRoom = (id) => room.players.some((pl) => pl.id === id);
      const allDecided = rm.participants.every((id) => rm.votes[id] || !inRoom(id));
      if (allDecided) {
        const agreed = rm.participants.filter((id) => rm.votes[id] === "agree" && inRoom(id));
        rm.resolved = true;
        const ownerPresent = inRoom(room.owner_id);
        if (agreed.length >= 2 && (!ownerPresent || agreed.indexOf(room.owner_id) !== -1)) {
          room.players.forEach((pl) => {
            if (agreed.indexOf(pl.id) !== -1) { pl.spectate = false; pl.ready = true; }
            else if (rm.participants.indexOf(pl.id) !== -1) { pl.spectate = true; pl.ready = true; }
          });
          let seat = 0;
          /* [Rotation] الرابح (مقعد 0) يحتفظ بحق الكسر — الترتيب بالمقعد الحالي */
          room.players.filter((pl) => !pl.spectate).sort((a, b) => (a.seat || 0) - (b.seat || 0)).forEach((pl) => { pl.seat = seat++; });
          room.status = "playing";
          room.rematch = null;
          room.moveHistory = [];
          room.dedupSeen = {};
          room.settled = null;
        } else {
          rm.rematch = false;
          rm.agreed = agreed;
        }
      }
      await this.save();
      this.updateRoom();
      return Response.json({ ok: true, room: serializeRoom(room) });
    }
    if (p === "/state") {
      return Response.json({ ok: true, room: this.room ? serializeRoom(this.room) : null, conns: this.state.getWebSockets().length, lastTouch: this.room ? this.room.lastTouch || 0 : 0 });
    }
    if (p === "/dissolve") {
      /* [RoomFlow] حل غرفة شبح (بلا متصلين ولا نشاط) من منظف القائمة */
      this.broadcastRoom("room:update", null);
      this.room = null;
      await this.state.storage.delete("room");
      return Response.json({ ok: true, dissolved: true });
    }
    return Response.json({ ok: false, message: "unknown" }, 404);
  }
  /* ─── Hibernation: رسالة واردة من عميل WS ─── */
  async webSocketMessage(ws, message) {
    try {
      const m = JSON.parse(message);
      if (m.event === "ping") {
        ws.send(JSON.stringify({ event: "pong", data: { t: Date.now() } }));
        return;
      }
      if (this.roomId === "global") {
        /* عدّاد الاتصالات فقط؛ لا توجد رسائل عامة في هذا المسار. */
        if (m.event === "count") {
          this.broadcast("online", { online: 42 + this.state.getWebSockets().length });
        }
        return;
      }
      if (m.event === "move") {
        const room = await this.ensureRoom();
        if (!room) return;
        const payload = m.data || {};
        if (payload.action === "rmove" && payload.data && payload.data.action) {
          const p2 = payload.data;
          const dk = p2.dedup;
          room.dedupSeen = room.dedupSeen || {};
          if (dk && room.dedupSeen[dk]) return;
          if (dk) room.dedupSeen[dk] = 1;
          room.moveHistory = room.moveHistory || [];
          room.moveHistory.push(p2);
          if (room.moveHistory.length > 2e3) room.moveHistory.shift();
          await this.save();
        }
        this.broadcastRoom("room:move", { room_id: room.id, action: payload.action, data: payload.data, from_id: m.uid || null });
      }
      if (m.event === "chat") {
        const room = await this.ensureRoom();
        if (!room) return;
        const msg = { room_id: room.id, text: String(m.data && m.data.text || "").slice(0, 500), from_id: m.uid || null, from_name: m.data && m.data.username || "\u0632\u0627\u0626\u0631", to_id: null, to_name: "", created_at: Date.now() };
        room.chat = room.chat || [];
        room.chat.push(msg);
        if (room.chat.length > 200) room.chat.shift();
        await this.save();
        this.broadcastRoom("room:chat", msg);
      }
    } catch (e) {
    }
  }
  /* ─── Hibernation: قطع اتصال ─── */
  async webSocketClose(ws, code, reason, wasClean) {
    const tags = ws.deserializerTags || [];
    if (this.room) {
      let changed = false;
      for (const ws2 of this.state.getWebSockets()) {
      }
      this.updateRoom();
    }
  }
  async webSocketError(ws, error) {
  }
};

// src/worker.js
var PBKDF2_ITER = 6e4;
async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, key, 256);
  return { salt: bytesToHex(salt), hash: bytesToHex(new Uint8Array(bits)) };
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, saltHex, expectedHash) {
  const { hash } = await hashPassword(password, saltHex);
  if (hash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}
__name(verifyPassword, "verifyPassword");
function hexToBytes(hex) {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16);
  return a;
}
__name(hexToBytes, "hexToBytes");
function bytesToHex(b) {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex, "bytesToHex");
function newSid() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(18)));
}
__name(newSid, "newSid");
function parseCookies(req) {
  const out = {};
  const hdr = req.headers.get("Cookie") || "";
  hdr.split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
__name(parseCookies, "parseCookies");
function dbReady(env) { return !!(env && env.royalcoin && typeof env.royalcoin.prepare === 'function'); }
__name(dbReady, "dbReady");
async function dbOne(env, sql, params = []) {
  if (!dbReady(env)) throw new Error("d1-unavailable");
  const stmt = env.royalcoin.prepare(sql);
  const r = params.length ? await stmt.bind(...params).first() : await stmt.first();
  return r || null;
}
__name(dbOne, "dbOne");
async function dbRun(env, sql, params = []) {
  if (!dbReady(env)) throw new Error("d1-unavailable");
  const stmt = env.royalcoin.prepare(sql);
  return params.length ? await stmt.bind(...params).run() : await stmt.run();
}
__name(dbRun, "dbRun");
async function dbAll(env, sql, params = []) {
  if (!dbReady(env)) throw new Error("d1-unavailable");
  const stmt = env.royalcoin.prepare(sql);
  const r = params.length ? await stmt.bind(...params).all() : await stmt.all();
  return r.results || [];
}
__name(dbAll, "dbAll");
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    gold: u.gold,
    lang: u.lang,
    twofa_enabled: !!u.twofa_enabled,
    ref_code: u.ref_code || null,
    admin_id: u.admin_id || null,
    referred_by: u.referred_by || null,
    muted_until: u.muted_until && u.muted_until > Date.now() ? u.muted_until : null
  };
}
__name(publicUser, "publicUser");
var __corsOrigin = "";
function json(data, status = 200, extraHeaders = {}) {
  const h = { "Content-Type": "application/json", ...extraHeaders };
  /* [v2.43.1] CORS موحّد لكل ردود JSON: بعض المسارات كانت تستدعي json() مباشرة
     بلا رؤوس CORS ⇒ المتصفح يحجبها على dtsg.pages.dev (خطأ CORS في الكونسول). */
  if (__corsOrigin && !h["Access-Control-Allow-Origin"]) {
    h["Access-Control-Allow-Origin"] = __corsOrigin;
    h["Access-Control-Allow-Credentials"] = "true";
    h["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers: h });
}
__name(json, "json");
function corsHeaders(req) {
  /* [Sec] قائمة أصول مسموحة فقط — لا نعكس أي Origin مع السماح بالكوكيز */
  const origin = req.headers.get("Origin") || "";
  let allowed = "";
  try {
    const o = new URL(origin);
    const h = o.hostname;
    /* [v2.59.2 R6] + dtsg.vercel.app (نشر Vercel للمالك) + dtsg-3e0.pages.dev (المضيف الثانوي) */
    if (o.protocol === "https:" && (h === "casino-9xj.pages.dev" || h.endsWith(".casino-9xj.pages.dev") || h === "dmcasino.pages.dev" || h.endsWith(".dmcasino.pages.dev") || h === "dmgames.pages.dev" || h.endsWith(".dmgames.pages.dev") || h === "dtsg.pages.dev" || h.endsWith(".dtsg.pages.dev") || h === "dtsg-3e0.pages.dev" || h === "dtsg.vercel.app" || h === "casino-api.tarikc.workers.dev" || h === "casino-api.dmgames-api.workers.dev")) allowed = origin;
  } catch (e) {}
  const base = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin"
  };
  if (allowed) { base["Access-Control-Allow-Origin"] = allowed; base["Access-Control-Allow-Credentials"] = "true"; }
  return base;
}
__name(corsHeaders, "corsHeaders");

/* [Sec] مقيد معدل بسيط في الذاكرة: نوافذ منزلقة لكل IP/سلة.
   يصد دفقات البوتات؛ يُعاد ضبطه مع إعادة تدوير الـisolate (كافٍ كخط دفاع أول). */
var __rl = new Map();
function rateLimit(ip, bucket, max, windowMs) {
  const now = Date.now();
  const key = ip + "|" + bucket;
  let e = __rl.get(key);
  if (!e || now - e.t0 > windowMs) { e = { t0: now, n: 0 }; __rl.set(key, e); }
  e.n++;
  if (__rl.size > 5000) { for (const [k, v] of __rl) { if (now - v.t0 > 120000) __rl.delete(k); } }
  return e.n <= max;
}
__name(rateLimit, "rateLimit");
var C = {
  async fetch(req, env, ctx) {
    const CORS = corsHeaders(req);
    __corsOrigin = CORS["Access-Control-Allow-Origin"] || "";
    const _json = /* @__PURE__ */ __name((data, status = 200, extra = {}) => withCors(json(data, status, extra), CORS), "_json");
    const _raw = /* @__PURE__ */ __name((body, init) => withCors(new Response(body, init), CORS), "_raw");
    const url = new URL(req.url);
    const p = url.pathname;
    const method = req.method;
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    /* [v2.43.1] هذا الووركر السحابي احتياطي: قاعدة D1 الخاصة به محذوفة من الحساب
       (0 قواعد) — نرد JSON واضحاً مع CORS بدل خطأ 1101/HTML، ونترك مسارات
       الغرف (Durable Objects) والثوابت تعمل كالمعتاد. الباك الحقيقي = خادم المنصة. */
    if (p.startsWith("/api/") && !dbReady(env) && !/^\/api\/(health|tournaments|rooms|live|promotions|chat)$/.test(p)) {
      return _json({ ok: false, error: "no-db", message: "\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u062D\u0627\u0628\u064A\u0629 \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631\u0629 \u2014 \u064A\u064F\u0633\u062A\u062E\u062F\u0645 \u062E\u0627\u062F\u0645 \u0627\u0644\u0645\u0646\u0635\u0629" }, 503);
    }
    /* [Sec] تقييد المعدل حسب حساسية المسار */
    const clientIp = req.headers.get("CF-Connecting-IP") || "0";
    if (p === "/api/login" || p === "/api/login/2fa" || p === "/api/admin/register") {
      if (!rateLimit(clientIp, "auth", 10, 60000)) return _json({ ok: false, message: "\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0643\u062B\u064A\u0631\u0629 \u2014 \u0627\u0646\u062A\u0638\u0631 \u062F\u0642\u064A\u0642\u0629" }, 429);
    } else if (p.endsWith("/bet") || p.endsWith("/cashout") || p === "/api/transfer" || p === "/api/claim") {
      if (!rateLimit(clientIp, "money", 40, 10000)) return _json({ ok: false, message: "\u0623\u0628\u0637\u0626 \u0642\u0644\u064A\u0644\u0627\u064B" }, 429);
    } else if (p.startsWith("/api/")) {
      if (!rateLimit(clientIp, "gen", 400, 60000)) return _json({ ok: false, message: "\u0637\u0644\u0628\u0627\u062A \u0643\u062B\u064A\u0631\u0629" }, 429);
    }
    if (p === "/api/health") return json({ ok: true, ts: Date.now() });
    if (p === "/api/login" && method === "POST") {
      const data = await req.json();
      const username = String(data.username || "").trim();
      const password = String(data.password || "");
      const u = await dbOne(env, "SELECT * FROM users WHERE username = ?", [username]);
      if (!u || u.banned) return _json({ ok: false, message: u && u.banned ? "\u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0648\u0642\u0648\u0641" : "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" }, 401);
      /* [Sec] قفل مؤقت: 8 محاولات فاشلة → 15 دقيقة */
      const lockRow = await dbOne(env, "SELECT fails, locked_until FROM login_locks WHERE username = ?", [username]).catch(() => null);
      if (lockRow && lockRow.locked_until > Date.now()) return _json({ ok: false, message: "\u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0642\u0641\u0644 \u0645\u0624\u0642\u062A\u0627\u064B \u2014 \u062D\u0627\u0648\u0644 \u0628\u0639\u062F \u0642\u0644\u064A\u0644" }, 429);
      const ok = await verifyPassword(password, u.pass_salt, u.pass_hash);
      if (!ok) {
        const nf = (lockRow ? lockRow.fails : 0) + 1;
        const until = nf >= 8 ? Date.now() + 9e5 : 0;
        await dbRun(env, "INSERT INTO login_locks (username, fails, locked_until) VALUES (?,?,?) ON CONFLICT(username) DO UPDATE SET fails = ?, locked_until = ?", [username, nf, until, nf, until]).catch(() => {});
        return _json({ ok: false, message: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" }, 401);
      }
      await dbRun(env, "DELETE FROM login_locks WHERE username = ?", [username]).catch(() => {});
      if (u.twofa_enabled) return _json({ ok: true, twofa_required: true });
      const sid2 = newSid();
      await dbRun(env, "INSERT INTO sessions (sid, user_id, created_at) VALUES (?,?,?)", [sid2, u.id, Date.now()]);
      const pu = publicUser(u);
      const h = { "Set-Cookie": "sid=" + sid2 + "; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000" };
      return _raw(JSON.stringify({ ok: true, user: pu }), { headers: { "Content-Type": "application/json", ...h } });
    }
    if (p === "/api/logout") {
      const sid2 = parseCookies(req).sid;
      if (sid2) await dbRun(env, "DELETE FROM sessions WHERE sid = ?", [sid2]);
      return json({ ok: true });
    }
    let me = null;
    const sid = parseCookies(req).sid;
    if (sid) {
      const s = await dbOne(env, "SELECT user_id FROM sessions WHERE sid = ?", [sid]);
      if (s) me = await dbOne(env, "SELECT * FROM users WHERE id = ?", [s.user_id]);
    }
    if (p === "/api/me" || p === "/api/sync") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      await dbRun(env, "UPDATE users SET last_seen = ? WHERE id = ?", [Date.now(), me.id]);
      return _json({ ok: true, user: publicUser(me) });
    }
    if (p === "/api/claim") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      const now = Date.now();
      if (now - (me.last_claim || 0) < 864e5) return _json({ ok: false, message: "\u062A\u0645 \u0627\u0644\u0627\u0633\u062A\u0644\u0627\u0645 \u0628\u0627\u0644\u0641\u0639\u0644 \u0627\u0644\u064A\u0648\u0645" });
      const newGold = (me.gold || 0) + 100;
      await dbRun(env, "UPDATE users SET gold = ?, last_claim = ? WHERE id = ?", [newGold, now, me.id]);
      return _json({ ok: true, amount: 100, gold: newGold });
    }
    if (p === "/api/friends" && method === "GET") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      /* [Friends] عقد العميل: قائمة واحدة بحالات accepted/incoming/outgoing */
      const acc = await dbAll(env, "SELECT u.id, u.username FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'accepted'", [me.id]);
      const inc = await dbAll(env, "SELECT u.id, u.username FROM friends f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ? AND f.status = 'pending'", [me.id]);
      const out = await dbAll(env, "SELECT u.id, u.username FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'pending'", [me.id]);
      const now5 = Date.now() - 3e5;
      const list = [];
      for (const r of acc) list.push({ id: r.id, username: r.username, status: "accepted" });
      for (const r of inc) list.push({ id: r.id, username: r.username, status: "incoming" });
      for (const r of out) list.push({ id: r.id, username: r.username, status: "outgoing" });
      for (const f of list) {
        const ls = await dbOne(env, "SELECT last_seen FROM users WHERE id = ?", [f.id]);
        f.online = !!(ls && ls.last_seen && ls.last_seen > now5);
      }
      return _json({ ok: true, friends: list });
    }
    if (p === "/api/friends/add" && method === "POST") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      const data = await req.json();
      const uname = String(data.username || "").trim();
      if (!uname || uname.length > 30) return _json({ ok: false, message: "\u0627\u0633\u0645 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, 400);
      const target = await dbOne(env, "SELECT id FROM users WHERE username = ?", [uname]);
      if (!target) return _json({ ok: false, message: "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" }, 404);
      if (target.id === me.id) return _json({ ok: false, message: "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0625\u0636\u0627\u0641\u0629 \u0646\u0641\u0633\u0643" }, 400);
      /* علاقة قائمة (بأي اتجاه)؟ لا تكرار */
      const exist = await dbOne(env, "SELECT id, status FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", [me.id, target.id, target.id, me.id]);
      if (exist && exist.status === "accepted") return _json({ ok: false, message: "\u0623\u0646\u062A\u0645\u0627 \u0623\u0635\u062F\u0642\u0627\u0621 \u0628\u0627\u0644\u0641\u0639\u0644" }, 400);
      if (exist) return _json({ ok: true });
      await dbRun(env, "INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (?,?,'pending',?)", [me.id, target.id, Date.now()]);
      return _json({ ok: true });
    }
    if (p === "/api/friends/accept" && method === "POST") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      const data = await req.json();
      const fid = Number(data.friendUserId !== undefined ? data.friendUserId : data.id);
      if (!Number.isInteger(fid) || fid <= 0) return _json({ ok: false, message: "\u0645\u0639\u0631\u0651\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, 400);
      /* الطلب الوارد مخزن بالاتجاه (هو ← أنا) */
      await dbRun(env, "UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ? AND status = 'pending'", [fid, me.id]);
      const back = await dbOne(env, "SELECT id FROM friends WHERE user_id = ? AND friend_id = ?", [me.id, fid]);
      if (back) await dbRun(env, "UPDATE friends SET status = 'accepted' WHERE id = ?", [back.id]);
      else await dbRun(env, "INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (?,?,'accepted',?)", [me.id, fid, Date.now()]);
      return _json({ ok: true });
    }
    if (p === "/api/friends/remove" && method === "POST") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      const data = await req.json();
      const fid = Number(data.friendUserId !== undefined ? data.friendUserId : data.id);
      if (!Number.isInteger(fid) || fid <= 0) return _json({ ok: false, message: "\u0645\u0639\u0631\u0651\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, 400);
      await dbRun(env, "DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", [me.id, fid, fid, me.id]);
      return _json({ ok: true });
    }
    if (p === "/api/messages/inbox" && method === "GET") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      const c = await dbOne(env, "SELECT COUNT(*) n FROM messages WHERE receiver_id = ? AND created_at > ?", [me.id, Date.now() - 864e5]);
      return _json({ ok: true, count: c ? c.n : 0 });
    }
    if (p === "/api/messages" && method === "GET") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      /* [DM] محادثة ثنائية بعقد العميل: sender_id/receiver_id/text */
      const other = Number(url.searchParams.get("with"));
      if (!Number.isInteger(other) || other <= 0) return _json({ ok: false, message: "\u0645\u0637\u0644\u0648\u0628 \u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645" }, 400);
      const since = Date.now() - 864e5;
      const rows = await dbAll(env, "SELECT id, sender_id, receiver_id, text, room_code, created_at FROM messages WHERE created_at >= ? AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) ORDER BY created_at ASC LIMIT 200", [since, me.id, other, other, me.id]);
      const msgs = rows.map((m) => ({ id: m.id, sender_id: m.sender_id, receiver_id: m.receiver_id, text: m.text, room_code: m.room_code || null, created_at: m.created_at }));
      return _json({ ok: true, messages: msgs });
    }
    if (p === "/api/messages" && method === "POST") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      if (me.muted_until && me.muted_until > Date.now()) return _json({ ok: false, message: "\u0623\u0646\u062A \u0645\u0643\u062A\u0648\u0645" }, 403);
      const data = await req.json();
      /* to: اسم مستخدم أو معرّف رقمي */
      let target = null;
      const toRaw = String(data.to || "").trim();
      if (/^\d+$/.test(toRaw)) target = await dbOne(env, "SELECT id FROM users WHERE id = ?", [Number(toRaw)]);
      if (!target) target = await dbOne(env, "SELECT id FROM users WHERE username = ?", [toRaw]);
      if (!target) return _json({ ok: false, message: "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" }, 404);
      const text = String(data.text !== undefined ? data.text : data.content || "").slice(0, 2000);
      if (!text) return _json({ ok: false, message: "\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0641\u0627\u0631\u063A\u0629" }, 400);
      const now = Date.now();
      const ins = await dbRun(env, "INSERT INTO messages (sender_id, receiver_id, text, room_code, created_at) VALUES (?,?,?,?,?)", [me.id, target.id, text, data.room_code ? String(data.room_code).slice(0, 20) : null, now]);
      const msg = { id: ins.meta ? ins.meta.last_row_id : null, sender_id: me.id, receiver_id: target.id, text, room_code: data.room_code || null, created_at: now };
      return _json({ ok: true, message: msg });
    }
    /* [Group-Removal 2026-09-27] أزيلت نقاط نهاية الجولات الجماعية (كينو/كراش) من المنتج. */
    if (p === "/api/tournaments") {
      return _json({ ok: true, tournaments: [] });
    }
    /* [Promotions 2026-09-22] نفس عقد العروض في الخادم المحلي والووركر */
    if (p === "/api/promotions" && method === "GET") {
      return _json({
        ok: true,
        updated_at: new Date().toISOString().slice(0, 10),
        /* المبالغ الأساسية بالدولار؛ التحويل ثابت: 1 USD = 10 MAD = 100 COIN. */
        currency: "USD",
        rates: { usd_to_mad: 10, usd_to_coins: 100 },
        direct: [{ amount: 10, bonus_pct: 0 }, { amount: 100, bonus_pct: 5 }, { amount: 1000, bonus_pct: 10 }, { amount: 10000, bonus_pct: 15 }],
        admin: [{ amount: 1000, bonus_pct: 30 }, { amount: 10000, bonus_pct: 35 }, { amount: 100000, bonus_pct: 40 }],
        referral_pct: 10
      });
    }
    if (p === "/api/games" || p === "/api/games/") {
      /* [Flags] خريطة أعلام الألعاب من D1 — نفس عقد server.js: {game_id: enabled} */
      const flags = {};
      try {
        const rows = await dbAll(env, "SELECT game_id, enabled FROM game_flags");
        for (const r of rows) flags[r.game_id] = !!r.enabled;
      } catch (e) {}
      return _json({ ok: true, games: flags });
    }
    if (p === "/api/admin/users") {
      if (!me || me.role !== "admin" && me.role !== "super") return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" }, 403);
      /* السوبر يرى الجميع؛ الأدمن يرى لاعبيه (من سجلهم) فقط — عقد server.js حرفياً */
      const rows = me.role === "super"
        ? await dbAll(env, "SELECT * FROM users ORDER BY id")
        : await dbAll(env, "SELECT * FROM users WHERE admin_id = ? AND role = 'user' ORDER BY id", [me.id]);
      const now = Date.now();
      const list = rows.map((u) => ({
        id: u.id, username: u.username, gold: u.gold, role: u.role,
        ref_code: u.ref_code || null, referred_by: u.referred_by || null,
        admin_id: u.admin_id || null, banned: !!u.banned,
        muted_until: u.muted_until && u.muted_until > now ? u.muted_until : null,
        last_seen: u.last_seen || null, first_topup_done: !!u.first_topup_done
      }));
      return _json({ ok: true, users: list, my_gold: me.gold });
    }
    /* ═══ [Admin] عمليات على مستخدم: شحن/خصم/ضبط، كلمة سر، حظر، دور، مسح، إسكات — نقل حرفي من server.js ═══ */
    let adm;
    if ((adm = /^\/api\/admin\/user\/(\d+)\/(balance|password|ban|role|delete|mute)$/.exec(p)) && method === "POST") {
      if (!me || me.role !== "admin" && me.role !== "super") return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" }, 403);
      const isSuper = me.role === "super";
      const data = await req.json().catch(() => ({}));
      const target = await dbOne(env, "SELECT * FROM users WHERE id = ?", [parseInt(adm[1], 10)]);
      if (!target) return _json({ ok: false, message: "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" }, 404);
      const op = adm[2];
      if (op === "balance") {
        /* ضبط مباشر للرصيد: سوبر أدمن فقط */
        if (data.gold !== undefined) {
          if (!isSuper) return _json({ ok: false, message: "\u0633\u0648\u0628\u0631 \u0623\u062F\u0645\u0646 \u0641\u0642\u0637" }, 403);
          const g = Math.max(0, parseInt(data.gold, 10) || 0);
          await dbRun(env, "UPDATE users SET gold = ? WHERE id = ?", [g, target.id]);
          return _json({ ok: true, gold: g });
        }
        const amt = parseInt(data.amount, 10);
        if (isNaN(amt) || amt <= 0) return _json({ ok: false, message: "\u0627\u0644\u0645\u0628\u0644\u063A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, 400);
        if (data.action === "charge") {
          /* الأدمن يشحن العملاء فقط وبرصيد كافٍ عنده؛ السوبر بلا قيد */
          if (!isSuper) {
            if (target.role !== "user") return _json({ ok: false, message: "\u064A\u0634\u062D\u0646 \u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0641\u0642\u0637" }, 403);
            const dec = await dbRun(env, "UPDATE users SET gold = gold - ? WHERE id = ? AND gold >= ?", [amt, me.id, amt]);
            if (!dec.meta || !dec.meta.changes) return _json({ ok: false, message: "\u0631\u0635\u064A\u062F \u0627\u0644\u0623\u062F\u0645\u0646 \u063A\u064A\u0631 \u0643\u0627\u0641\u064D" }, 400);
          }
          /* هدية الإحالة: 10% من أول شحنة لصاحب رمز الإحالة */
          let refBonus = 0;
          if (!target.first_topup_done && target.referred_by) {
            refBonus = Math.floor(amt * 0.1);
            if (refBonus > 0) await dbRun(env, "UPDATE users SET gold = gold + ? WHERE id = ?", [refBonus, target.referred_by]);
          }
          await dbRun(env, "UPDATE users SET gold = gold + ?, first_topup_done = 1 WHERE id = ?", [amt, target.id]);
          const tg = await dbOne(env, "SELECT gold FROM users WHERE id = ?", [target.id]);
          const mg = await dbOne(env, "SELECT gold FROM users WHERE id = ?", [me.id]);
          return _json({ ok: true, gold: tg.gold, admin_gold: mg.gold, referral_bonus: refBonus });
        }
        if (data.action === "deduct") {
          /* السحب المباشر: سوبر أدمن فقط */
          if (!isSuper) return _json({ ok: false, message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0644\u0644\u0623\u062F\u0645\u0646 \u0627\u0644\u0633\u062D\u0628 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u2014 \u0627\u0633\u062A\u0639\u0645\u0644 \u0627\u0633\u062A\u0642\u0628\u0627\u0644 \u062A\u062D\u0648\u064A\u0644 \u0645\u0646 \u0627\u0644\u0639\u0645\u064A\u0644" }, 403);
          const dec = await dbRun(env, "UPDATE users SET gold = gold - ? WHERE id = ? AND gold >= ?", [amt, target.id, amt]);
          if (!dec.meta || !dec.meta.changes) return _json({ ok: false, message: "\u0631\u0635\u064A\u062F \u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0643\u0627\u0641\u064D" }, 400);
          const tg = await dbOne(env, "SELECT gold FROM users WHERE id = ?", [target.id]);
          return _json({ ok: true, gold: tg.gold });
        }
        return _json({ ok: false, message: "\u0639\u0645\u0644\u064A\u0629 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629" }, 400);
      }
      if (op === "password") {
        /* السوبر لأي حساب؛ الأدمن للاعبيه فقط */
        if (!isSuper && !(target.role === "user" && target.admin_id === me.id)) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" }, 403);
        if (String(data.password || "").length < 6) return _json({ ok: false, message: "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0642\u0635\u064A\u0631\u0629" }, 400);
        const ph = await hashPassword(String(data.password), null);
        await dbRun(env, "UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?", [ph.hash, ph.salt, target.id]);
        return _json({ ok: true });
      }
      if (op === "ban") {
        if (!isSuper) return _json({ ok: false, message: "\u0633\u0648\u0628\u0631 \u0623\u062F\u0645\u0646 \u0641\u0642\u0637" }, 403);
        await dbRun(env, "UPDATE users SET banned = ? WHERE id = ?", [data.banned ? 1 : 0, target.id]);
        if (data.banned) await dbRun(env, "DELETE FROM sessions WHERE user_id = ?", [target.id]);
        return _json({ ok: true, banned: !!data.banned });
      }
      if (op === "role") {
        if (!isSuper) return _json({ ok: false, message: "\u0633\u0648\u0628\u0631 \u0623\u062F\u0645\u0646 \u0641\u0642\u0637" }, 403);
        if (target.id === me.id) return _json({ ok: false, message: "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u062A\u063A\u064A\u064A\u0631 \u062F\u0648\u0631\u0643" }, 400);
        if (["user", "admin", "super"].indexOf(data.role) === -1) return _json({ ok: false, message: "\u062F\u0648\u0631 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, 400);
        await dbRun(env, "UPDATE users SET role = ? WHERE id = ?", [data.role, target.id]);
        return _json({ ok: true, role: data.role });
      }
      if (op === "delete") {
        if (!isSuper) return _json({ ok: false, message: "\u0633\u0648\u0628\u0631 \u0623\u062F\u0645\u0646 \u0641\u0642\u0637" }, 403);
        if (target.id === me.id) return _json({ ok: false, message: "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0645\u0633\u062D \u062D\u0633\u0627\u0628\u0643" }, 400);
        await dbRun(env, "DELETE FROM sessions WHERE user_id = ?", [target.id]);
        await dbRun(env, "DELETE FROM users WHERE id = ?", [target.id]);
        return _json({ ok: true });
      }
      if (op === "mute") {
        if (data.unmute) {
          if (!isSuper) return _json({ ok: false, message: "\u0631\u0641\u0639 \u0627\u0644\u0625\u0633\u0643\u0627\u062A: \u0633\u0648\u0628\u0631 \u0623\u062F\u0645\u0646 \u0641\u0642\u0637" }, 403);
          await dbRun(env, "UPDATE users SET muted_until = 0 WHERE id = ?", [target.id]);
          return _json({ ok: true, muted_until: null });
        }
        const hours = Math.max(24, parseInt(data.hours, 10) || 24);
        const until = Date.now() + hours * 3600 * 1e3;
        await dbRun(env, "UPDATE users SET muted_until = ? WHERE id = ?", [until, target.id]);
        return _json({ ok: true, muted_until: until, hours });
      }
    }
    /* ═══ [Admin] تشغيل/توقيف الألعاب: سوبر أدمن فقط — بثبات في game_flags ═══ */
    if ((adm = /^\/api\/admin\/games\/([\w-]+)\/toggle$/.exec(p)) && method === "POST") {
      if (!me || me.role !== "super") return _json({ ok: false, message: "\u0633\u0648\u0628\u0631 \u0623\u062F\u0645\u0646 \u0641\u0642\u0637" }, 403);
      const data = await req.json().catch(() => ({}));
      await dbRun(env, "INSERT INTO game_flags (game_id, enabled) VALUES (?,?) ON CONFLICT(game_id) DO UPDATE SET enabled = excluded.enabled", [adm[1], data.enabled ? 1 : 0]);
      return _json({ ok: true, enabled: !!data.enabled });
    }
    /* ═══ [Admin] إعدادات المكافأة اليومية ═══ */
    if (p === "/api/admin/rewards" && method === "GET") {
      if (!me || me.role !== "admin" && me.role !== "super") return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" }, 403);
      let cfg = { amount: 100, interval_hours: 24 };
      try {
        const row = await dbOne(env, "SELECT value FROM settings WHERE key = 'rewards'");
        if (row) cfg = { ...cfg, ...JSON.parse(row.value) };
      } catch (e) {}
      return _json({ ok: true, amount: cfg.amount, interval_hours: cfg.interval_hours });
    }
    if (p === "/api/admin/rewards" && method === "POST") {
      if (!me || me.role !== "super") return _json({ ok: false, message: "\u0633\u0648\u0628\u0631 \u0623\u062F\u0645\u0646 \u0641\u0642\u0637" }, 403);
      const data = await req.json().catch(() => ({}));
      const amount = Math.max(0, parseInt(data.amount, 10) || 100);
      const interval_hours = Math.min(720, Math.max(1, parseInt(data.interval_hours, 10) || 24));
      await dbRun(env, "INSERT INTO settings (key, value) VALUES ('rewards', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify({ amount, interval_hours })]);
      return _json({ ok: true, amount, interval_hours });
    }
    /* ═══ [Admin] إحصاءات مالية لكل لعبة (من رهانات الجولات الجماعية) ═══ */
    if (p === "/api/admin/stats/games") {
      if (!me || me.role !== "admin" && me.role !== "super") return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" }, 403);
      let rows = [];
      try {
        rows = await dbAll(env, "SELECT r.game_id AS game_id, COUNT(b.id) AS plays, SUM(CASE WHEN b.won = 1 THEN 1 ELSE 0 END) AS wins, COALESCE(SUM(CASE WHEN b.won = 1 THEN b.payout ELSE 0 END),0) AS coins_won FROM group_bets b JOIN group_rounds r ON r.id = b.round_id GROUP BY r.game_id");
      } catch (e) {}
      return _json({ ok: true, games: rows.map((g) => ({ game_id: g.game_id, plays: g.plays || 0, wins: g.wins || 0, coins_won: g.coins_won || 0 })) });
    }
    if (p === "/api/admin/stats") {
      if (!me || me.role !== "admin" && me.role !== "super") return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" }, 403);
      const total = await dbOne(env, "SELECT COUNT(*) AS c FROM users");
      const active = await dbOne(env, "SELECT COUNT(*) AS c FROM users WHERE last_seen > ?", [Date.now() - 864e5]);
      let plays = { c: 0 }, won = { s: 0 };
      try {
        plays = await dbOne(env, "SELECT COUNT(*) AS c FROM group_bets");
        won = await dbOne(env, "SELECT COALESCE(SUM(payout),0) AS s FROM group_bets WHERE won = 1");
      } catch (e) {}
      const goldT = me.role === "super" ? await dbOne(env, "SELECT COALESCE(SUM(gold),0) AS s FROM users") : { s: 0 };
      return _json({ ok: true, users_total: total.c, active_today: active.c, plays_total: plays.c, gold_total: goldT.s, coins_won_total: won.s });
    }
    if (p === "/api/admin/register" && method === "POST") {
      if (!me || me.role !== "admin" && me.role !== "super") return _json({ ok: false, message: "\u0635\u0644\u0627\u062D\u064A\u0629 \u063A\u064A\u0631 \u0643\u0627\u0641\u064A\u0629" }, 403);
      const data = await req.json();
      const username = String(data.username || "").trim();
      const password = String(data.password || "");
      /* [Auth] تسجيل المشرف ينشئ عميلاً (user) مربوطاً به — عقد server.js */
      const role = me.role === "super" && ["admin", "super", "user"].includes(data.role) ? data.role : "user";
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return _json({ ok: false, message: "\u0627\u0633\u0645 \u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, 400);
      if (password.length < 6) return _json({ ok: false, message: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 6 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644" }, 400);
      const exists = await dbOne(env, "SELECT id FROM users WHERE username = ?", [username]);
      if (exists) return _json({ ok: false, message: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u062D\u062C\u0648\u0632" }, 400);
      /* رمز إحالة المحيل (اختياري) — يُتحقق منه قبل الإنشاء */
      let referredBy = null;
      if (data.referral_code) {
        const rc = String(data.referral_code).trim().toUpperCase();
        const ref = await dbOne(env, "SELECT id FROM users WHERE ref_code = ?", [rc]);
        if (!ref) return _json({ ok: false, message: "\u0631\u0645\u0632 \u0627\u0644\u0625\u062D\u0627\u0644\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, 400);
        referredBy = ref.id;
      }
      const { salt, hash } = await hashPassword(password, null);
      const info = await dbRun(
        env,
        "INSERT INTO users (username, pass_hash, pass_salt, role, gold, lang, banned, created_at, last_seen, admin_id, referred_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [username, hash, salt, role, Number(data.gold || 0), "ar", 0, Date.now(), 0, me.id, referredBy]
      );
      const newId = info.meta ? info.meta.last_row_id : null;
      let refCode = null;
      if (newId) {
        if (referredBy === newId) await dbRun(env, "UPDATE users SET referred_by = NULL WHERE id = ?", [newId]);
        refCode = "GV" + newId.toString(36).toUpperCase() + "-" + bytesToHex(crypto.getRandomValues(new Uint8Array(3))).toUpperCase();
        await dbRun(env, "UPDATE users SET ref_code = ? WHERE id = ?", [refCode, newId]);
      }
      const u = await dbOne(env, "SELECT * FROM users WHERE id = ?", [newId]);
      return _json({ ok: true, user: publicUser(u) });
    }
    const ROOMS = env.ROOMS;
    const wsMatch = p.match(/^\/api\/rooms\/([\w-]+)\/ws$/);
    if (wsMatch) {
      let uid = url.searchParams.get("uid") || "0";
      const rid = wsMatch[1];
      /* [SEC-020] هوية WS من الجلسة الموثوقة لا من معامل URL القابل للانتحال:
         غرف اللعب تتطلب جلسة صحيحة؛ قناة global للقراءة العامة (دردشة/جولات) تبقى مفتوحة */
      if (rid !== "global") {
        if (!me) return _json({ ok: false, message: "auth required" }, 401);
        uid = String(me.id);
      } else {
        uid = me ? String(me.id) : "0";
      }
      const doId = ROOMS.idFromName(rid);
      const stub = ROOMS.get(doId);
      const doUrl = "https://do/ws?uid=" + encodeURIComponent(uid) + "&rid=" + encodeURIComponent(rid);
      return stub.fetch(doUrl, req);
    }
    if (p === "/api/rooms" && method === "GET") {
      const idx = await dbAll(env, "SELECT room_id, code, game_id, owner_name, max_players, bet, room_type, visibility, expires_at, created_at FROM room_index", []);
      const now = Date.now();
      const alive = [];
      for (const r of idx) {
        if (r.room_type === "hour" && r.expires_at && now > Number(r.expires_at)) continue;
        const doId = ROOMS.idFromName(r.room_id);
        const st = await ROOMS.get(doId).fetch("https://do/state").then((x) => x.json()).catch(() => null);
        /* [RoomFlow] غرفة محلولة → إزالة صفها من المؤشر كي لا تظهر شبحاً */
        if (st && !st.room) { try { await dbRun(env, "DELETE FROM room_index WHERE room_id = ?", [r.room_id]); } catch (e) {} continue; }
        /* [RoomFlow] غرفة مهجورة (صفر متصلين + بلا نشاط ≥ 30 دقيقة) → حل وتنظيف */
        if (st && st.room && !st.conns && now - (st.lastTouch || Number(r.created_at) || 0) > 18e5) {
          try { await ROOMS.get(doId).fetch("https://do/dissolve", { method: "POST", body: "{}" }); } catch (e) {}
          try { await dbRun(env, "DELETE FROM room_index WHERE room_id = ?", [r.room_id]); } catch (e) {}
          continue;
        }
        if (st && st.room && st.room.visibility !== "private") {
          alive.push({
            id: st.room.id,
            code: st.room.code,
            game_id: st.room.game_id,
            owner_name: st.room.owner_name,
            max_players: st.room.max_players,
            players_count: st.room.players.length,
            status: st.room.status,
            bet: st.room.bet || 0,
            room_type: st.room.room_type || null,
            expires_at: st.room.expires_at,
            visibility: st.room.visibility
          });
        }
      }
      return _json({ ok: true, rooms: alive });
    }
    if (p === "/api/rooms" && method === "POST") {
      if (!me) return _json({ ok: false, message: "\u064A\u0644\u0632\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" }, 401);
      if (me.role !== "user") return _json({ ok: false, message: "\u0627\u0644\u0645\u0634\u0631\u0641\u0648\u0646 \u0644\u0627 \u064A\u0645\u0643\u0646\u0647\u0645 \u0627\u0644\u062F\u062E\u0648\u0644 \u0643\u0644\u0627\u0639\u0628\u064A\u0646 \u0623\u0648 \u0627\u0644\u0645\u0631\u0627\u0647\u0646\u0629" }, 403);
      const data = await req.json();
      const room_type = data.room_type;
      if (room_type !== "hour" && room_type !== "percentage") return _json({ ok: false, error: "room_type_required" }, 400);
      const bet = Number(data.bet);
      if (isNaN(bet) || bet <= 0) return _json({ ok: false, error: "bet_required" }, 400);
      const visibility = data.visibility === "private" ? "private" : "public";
      const HOUR_ROOM_FEE = 10;
      if (room_type === "hour") {
        if ((me.gold || 0) < HOUR_ROOM_FEE) return _json({ ok: false, error: "insufficient_funds", message: "\u0631\u0635\u064A\u062F \u063A\u064A\u0631 \u0643\u0627\u0641\u064D \u0644\u0631\u0633\u0648\u0645 \u0627\u0644\u063A\u0631\u0641\u0629 (" + HOUR_ROOM_FEE + ")" }, 400);
        await dbRun(env, "UPDATE users SET gold = gold - ? WHERE id = ?", [HOUR_ROOM_FEE, me.id]);
      }
      const gid = data.game_id || "rm";
      const maxp = Math.max(2, Math.min(8, parseInt(data.max_players, 10) || 4));
      const rid = "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const code = bytesToHex(crypto.getRandomValues(new Uint8Array(3))).toUpperCase();
      const doId = ROOMS.idFromName(rid);
      const resp = await ROOMS.get(doId).fetch("https://do/create", {
        method: "POST",
        body: JSON.stringify({
          id: rid,
          code,
          game_id: gid,
          owner_id: me.id,
          owner_name: me.username,
          max_players: maxp,
          bet,
          room_type,
          visibility,
          game_opts: (data.game_opts && typeof data.game_opts === "object") ? data.game_opts : {}
        })
      });
      const created = await resp.json();
      if (!created.ok) return _json(created, 500);
      await dbRun(
        env,
        "INSERT INTO room_index (room_id, code, game_id, owner_name, max_players, bet, room_type, visibility, status, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [
          rid,
          code,
          gid,
          me.username,
          maxp,
          bet,
          room_type,
          visibility,
          "waiting",
          room_type === "hour" ? Date.now() + 36e5 : null,
          Date.now()
        ]
      );
      return _json({ ok: true, room: created.room });
    }
    if (p.startsWith("/api/rooms/") || p.match(/^\/api\/rooms\/[^/]+\/chat$/)) {
      if (!me) return _json({ ok: false, message: "\u064A\u0644\u0632\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" }, 401);
      const data = await req.json().catch(() => ({}));
      let rid = data.room_id;
      let roomRow = rid ? await dbOne(env, "SELECT room_id FROM room_index WHERE room_id = ?", [rid]) : null;
      if (!roomRow && data.code) {
        roomRow = await dbOne(env, "SELECT room_id FROM room_index WHERE code = ?", [String(data.code).toUpperCase()]);
      }
      if (!roomRow) return _json({ ok: false, message: "\u0627\u0644\u063A\u0631\u0641\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" }, 404);
      const doId = ROOMS.idFromName(roomRow.room_id);
      const doObj = ROOMS.get(doId);
      const action = p.replace("/api/rooms/", "");
      const map = {
        "join": "/join",
        "leave": "/leave",
        "ready": "/ready",
        "start": "/start",
        "move": "/move",
        "chat": "/chat",
        "settle": "/settle",
        "settleRound": "/settleRound",
        "spectate": "/spectate",
        "joinRequest": "/joinRequest",
        "endBet": "/endBet",
        "addBot": "/addBot",
        "removeBot": "/removeBot",
        "react": "/react",
        "voice": "/voice",
        "rematch/start": "/rematch-start",
        "rematch/vote": "/rematch-vote",
        "rematch-vote": "/rematch-vote"
      };
      if (action === `${roomRow.room_id}/chat`) {
        const r22 = await doObj.fetch("https://do/chat-history");
        return _json(await r22.json());
      }
      const doPath = map[action];
      if (!doPath) return _json({ ok: false, message: "\u0645\u0633\u0627\u0631 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641" }, 404);
      const body = { ...data, user_id: me.id, username: me.username, muted_until: me.muted_until };
      const r2 = await doObj.fetch("https://do" + doPath, { method: "POST", body: JSON.stringify(body) });
      const out = await r2.json();
      if (out.dissolved) await dbRun(env, "DELETE FROM room_index WHERE room_id = ?", [roomRow.room_id]);
      return _json(out, r2.status);
    }
    /* ═══ [TicketFix] سجل جولات الرهان الدائم — كان stub يعيد {tournaments:[]} فقط:
       التذاكر كانت محلية بالذاكرة وتختفي عند تجديد الصفحة ولا تصل سجل المعاملات ═══ */
    if (p === "/api/rounds" && method === "POST") {
      if (!me) return _json({ ok: false, message: "\u064A\u0644\u0632\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" }, 401);
      if (rateLimited("rounds:" + me.id, 30, 60000)) return _json({ ok: false, message: "too many" }, 429);
      const data = await req.json().catch(() => ({}));
      const gid = String(data.game_id || "").slice(0, 16);
      if (!gid) return _json({ ok: false, message: "game_id required" }, 400);
      const bet = Math.max(0, Math.min(1e9, parseInt(data.bet, 10) || 0));
      const won = data.won ? 1 : 0;
      const payout = Math.max(0, Math.min(1e9, parseInt(data.payout, 10) || 0));
      await dbRun(env, "INSERT INTO rounds (user_id, username, game_id, bet, won, payout, created_at) VALUES (?,?,?,?,?,?,?)",
        [me.id, me.username, gid, bet, won, payout, Math.floor(Date.now() / 1000)]);
      /* تشذيب: أحدث 200 تذكرة لكل مستخدم */
      await dbRun(env, "DELETE FROM rounds WHERE user_id = ? AND id NOT IN (SELECT id FROM rounds WHERE user_id = ? ORDER BY id DESC LIMIT 200)", [me.id, me.id]).catch(() => {});
      return _json({ ok: true });
    }
    if (p === "/api/rounds" && method === "GET") {
      if (!me) return _json({ ok: true, rounds: [] });
      const rows = await dbAll(env, "SELECT game_id, bet, won, payout, created_at FROM rounds WHERE user_id = ? ORDER BY id DESC LIMIT 50", [me.id]);
      return _json({ ok: true, rounds: rows });
    }
    /* [TicketFix] سجل جولات لعبة بعينها (تيكيتس داخل صفحة اللعبة) — خاص بالمستخدم */
    {
      const ghMatch = p.match(/^\/api\/games\/([\w-]+)\/history$/);
      if (ghMatch && method === "GET") {
        if (!me) return _json({ ok: true, rounds: [] });
        const rows = await dbAll(env, "SELECT username, game_id, bet, won, payout, created_at FROM rounds WHERE user_id = ? AND game_id = ? ORDER BY id DESC LIMIT 25", [me.id, ghMatch[1]]);
        return _json({ ok: true, rounds: rows });
      }
    }
    if (p === "/api/tournaments") {
      return _json({ ok: true, tournaments: [] });
    }
    if (p === "/api/admin/games" && method === "GET") {
      if (!me || me.role !== "admin" && me.role !== "super") return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" }, 403);
      const flags = {};
      try {
        const rows = await dbAll(env, "SELECT game_id, enabled FROM game_flags");
        for (const r of rows) flags[r.game_id] = !!r.enabled;
      } catch (e) {}
      return _json({ ok: true, games: flags });
    }
    if (p === "/api/transfer" && method === "POST") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      const data = await req.json();
      const amt = parseInt(data.amount, 10);
      if (!data.to || isNaN(amt) || amt <= 0) return _json({ ok: false, message: "\u0627\u0644\u0645\u0628\u0644\u063A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" }, 400);
      if ((me.gold || 0) < amt) return _json({ ok: false, message: "\u0631\u0635\u064A\u062F\u0643 \u063A\u064A\u0631 \u0643\u0627\u0641\u064D" }, 400);
      const target = await dbOne(env, "SELECT id, gold FROM users WHERE username = ?", [String(data.to).trim()]);
      if (!target) return _json({ ok: false, message: "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" }, 404);
      if (target.id === me.id) return _json({ ok: false, message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u062D\u0648\u064A\u0644 \u0644\u0646\u0641\u0633\u0643" }, 400);
      const myGold = me.gold - amt;
      const tGold = (target.gold || 0) + amt;
      await dbRun(env, "UPDATE users SET gold = ? WHERE id = ?", [myGold, me.id]);
      await dbRun(env, "UPDATE users SET gold = ? WHERE id = ?", [tGold, target.id]);
      await dbRun(
        env,
        "INSERT INTO transfers (from_id, from_name, to_id, to_name, amount, created_at) VALUES (?,?,?,?,?,?)",
        [me.id, me.username, target.id, String(data.to).trim(), amt, Math.floor(Date.now() / 1e3)]
      );
      return _json({ ok: true, amount: amt, to: data.to, gold: myGold });
    }
    if (p === "/api/transfers") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      const rows = await dbAll(env, "SELECT id, from_id, from_name, to_id, to_name, amount, created_at FROM transfers WHERE from_id = ? OR to_id = ? ORDER BY id DESC LIMIT 50", [me.id, me.id]);
      return _json({ ok: true, transfers: rows });
    }
    /* [Privacy 2026-09-22] أزيلت الدردشة العامة من المنصة نهائياً.
       تبقى دردشة غرف اللعب تحت /api/rooms/* فقط. */
    if (p === "/api/chat") {
      return _json({ ok: false, error: "removed", message: "الدردشة العامة أُزيلت — استخدم بوت DTSG الخاص." }, 410);
    }
    if (p === "/api/change-password" && method === "POST") {
      if (!me) return _json({ ok: false, message: "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644" }, 401);
      const data = await req.json();
      const ok = await verifyPassword(data.oldPassword || "", me.pass_salt, me.pass_hash);
      if (!ok) return _json({ ok: false, message: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0642\u062F\u064A\u0645\u0629 \u062E\u0627\u0637\u0626\u0629" }, 400);
      if (!data.newPassword || String(data.newPassword).length < 6) return _json({ ok: false, message: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 6 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644" }, 400);
      const { salt, hash } = await hashPassword(data.newPassword, null);
      await dbRun(env, "UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?", [hash, salt, me.id]);
      return _json({ ok: true, message: "\u062A\u0645 \u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631" });
    }
    if (p === "/api/admin/messages" && method === "GET") {
      if (!me || me.role !== "admin" && me.role !== "super") return _json({ ok: false, message: "\u0635\u0644\u0627\u062D\u064A\u0629 \u063A\u064A\u0631 \u0643\u0627\u0641\u064A\u0629" }, 403);
      const rows = await dbAll(env, "SELECT * FROM admin_messages ORDER BY id DESC LIMIT 100");
      return _json({ ok: true, messages: rows });
    }
    if (p === "/api/admin/messages" && method === "POST") {
      if (!me || me.role !== "admin" && me.role !== "super") return _json({ ok: false, message: "\u0635\u0644\u0627\u062D\u064A\u0629 \u063A\u064A\u0631 \u0643\u0627\u0641\u064A\u0629" }, 403);
      const data = await req.json();
      await dbRun(
        env,
        "INSERT INTO admin_messages (from_id, from_name, to_id, to_name, content, created_at) VALUES (?,?,?,?,?,?)",
        [me.id, me.username, data.to_id || null, data.to_name || "", String(data.content || "").slice(0, 1e3), Date.now()]
      );
      return _json({ ok: true });
    }
    return _json({ ok: false, message: "not found" }, 404);
  }
};
function withCors(res, cors) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  /* [SEC-016 & DTSG-017 & DTSG-020] رؤوس أمان إلزامية على كل استجابات API */
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Cross-Origin-Resource-Policy", "cross-origin");
  if (!h.has("Cache-Control")) h.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, headers: h });
}
__name(withCors, "withCors");
var worker_default = C;
export {
  RoomDO,
  worker_default as default
};
//# sourceMappingURL=worker.js.map

