/* ═══════════════════════════════════════════════════════════════════════════
   [v2.68] محور الغرف — مدير مستقل لكل لعبة + توجيه عالمي موحّد
   ═══════════════════════════════════════════════════════════════════════════

   هذا هو «نظام الغرف المخصَّص لكل لعبة»:
   • لكل لعبة من السجل (games/registry.js) مديرها الخاص (rooms/room-manager.js)
     بغرفها الخاصة — عزل كامل: عطل في لعبة لا يمس بقية الألعاب.
   • التوجيه العالمي موحّد للعميل (نفس نقاط /api/rooms/* والشكل نفسه):
     - findById: أي غرفة بأي معرف → مديرها الصحيح.
     - findByCode: رمز الانضمام فريد عالمياً — لا التصاق رمز لعبة بغرفة لعبة
       أخرى (البحث القديم كان في خريطة واحدة مختلطة بلا تمييز).
   • معرّفات الغرف رتيبة عالمياً عبر جدول meta (إنجاز v2.67 محفوظ حرفياً).

   الاستهلاك من server.js:
     const hub = require('./rooms/index.js').createRoomHub({ users, db, ... });
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const REG = require('../games/registry.js');
const { createSharedRoomIO } = require('./shared.js');
const { createRoomManager } = require('./room-manager.js');

function createRoomHub(ctx) {
  const { users, db } = ctx;

  /* ── معرّفات رتيبة عالمياً [v2.67] — عبر جدول meta (حرفياً كما كان) ── */
  let nextRoomIdN = 1;
  try {
    db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    const _nrid = db.prepare("SELECT value FROM meta WHERE key = 'next_room_id'").get();
    if (_nrid && parseInt(_nrid.value, 10) > 0) nextRoomIdN = parseInt(_nrid.value, 10);
  } catch (e) {}
  function nextRoomId() {
    const n = 'r' + (nextRoomIdN++);
    try { db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('next_room_id', ?)").run(String(nextRoomIdN)); } catch (e) {}
    return n;
  }

  /* ── فهرس عالمي: معرف → غرفة، رمز → غرفة (توجيه فوري بلا مسح) ── */
  const byId = new Map();
  const byCode = new Map();
  const managers = new Map();   /* gameId -> RoomManager */

  function removeRoom(room) {
    byId.delete(room.id);
    byCode.delete(room.code);
    const mgr = managers.get(room.game_id);
    if (mgr) mgr.remove(room);
  }

  /* ── الطبقة المشتركة فوق كائنات الغرف ── */
  const io = createSharedRoomIO(Object.assign({}, ctx, {
    isRoomLive: function (roomId) { return byId.has(roomId); },
    removeRoom: removeRoom
  }));

  /* ── سياق المديرين: توجيه الإنشاء/الرموز عبر المحور ── */
  const mgrCtx = Object.assign({}, ctx, {
    nextRoomId: nextRoomId,
    /* رمز فريد عالمياً عبر كل الألعاب — لا تصادم بين مديري ألعاب مختلة */
    allocateCode: function () {
      for (let i = 0; i < 12; i++) {
        const code = require('crypto').randomBytes(3).toString('hex').toUpperCase();
        if (!byCode.has(code)) return code;
      }
      return require('crypto').randomBytes(4).toString('hex').toUpperCase();
    },
    registerRoom: function (room) {
      byId.set(room.id, room);
      byCode.set(room.code, room);
    },
    /* [v2.69] حذف نظيف من فهرس المحور والمدير معاً — كان مدير اللعبة
       يحذف من خريطته فقط فتبقى الغرفة الميتة في فهرس المحور (byId/byCode)
       وتظهر في roomsOfUser عند عودة المستخدم كغرفة شبح */
    removeRoom: removeRoom
  });

  /* ── مدير لكل لعبة مسجّلة في السجل ── */
  REG.roomGameIds().forEach(function (gid) {
    managers.set(gid, createRoomManager(gid, io, mgrCtx));
  });

  function managerFor(gid) { return managers.get(gid) || null; }

  /* العمليات التي كانت ترد ok بصمت لغرفة غير موجودة (توافق سلوك v2.67) */
  const SILENT_OK_NULL = { ready: 1, start: 1, spectate: 1, joinRequest: 1, endBet: 1, rematchStart: 1, rematchVote: 1 };

  const hub = {
    io: io,
    managers: managers,
    managerFor: managerFor,

    /* أي غرفة بأي معرف — من أي لعبة (توجيه فوري) */
    findById: function (roomId) { return byId.get(roomId) || null; },
    findManagerOf: function (roomId) {
      const room = byId.get(roomId);
      return room ? (managers.get(room.game_id) || null) : null;
    },
    /* رمز الانضمام — فريد عالمياً فلا التباس بين الألعاب */
    findByCode: function (code) { return byCode.get(String(code || '').toUpperCase()) || null; },

    /* كل الغرف (لكل الألعاب) — لمنظّف الأشباح والقوائم */
    allRooms: function () {
      const out = [];
      byId.forEach(function (room) { out.push(room); });
      return out;
    },
    /* غرف مستخدم بعينه — لبثّ hello/replay في SSE وعلامات الانقطاع */
    roomsOfUser: function (uid) {
      const out = [];
      byId.forEach(function (room) {
        if (room.players.some(function (p) { return p.id === uid; })) out.push(room);
      });
      return out;
    },
    /* قائمة الانتظار العامة (كل الألعاب) — أو لعبة واحدة إن طُلبت */
    waitingList: function (gid) {
      if (gid) {
        const mgr = managers.get(gid);
        return mgr ? mgr.listWaiting() : [];
      }
      const out = [];
      managers.forEach(function (mgr) { out.push.apply(out, mgr.listWaiting()); });
      return out;
    },
    stats: function () {
      const per = {};
      managers.forEach(function (mgr, gid) { per[gid] = mgr.count(); });
      return { games: managers.size, rooms: byId.size, per_game: per };
    },

    /* ═══════ عمليات موحّدة عبر التوجيه (يستدعيها server.js) ═══════ */
    create: function (gid, me, data) {
      const mgr = managers.get(gid);
      if (!mgr) return { status: 400, body: { ok: false, message: 'لعبة غير مدعومة في الغرف' } };
      return mgr.create(me, data);
    },
    joinByCode: function (me, data) {
      const room = hub.findByCode(data.code);
      if (!room) return { status: 404, body: { ok: false, message: 'رمز الغرفة غير موجود' } };
      const mgr = managers.get(room.game_id);
      if (!mgr) return { status: 404, body: { ok: false, message: 'رمز الغرفة غير موجود' } };
      return mgr.join(me, data, room);
    },
    /* تنفيذ تابع مدير على غرفة بالمعرف مهما كانت لعبتها */
    exec: function (op, me, data) {
      const room = byId.get(data.room_id);
      const mgr = room ? managers.get(room.game_id) : null;
      if (!mgr) {
        if (op === 'leave' || op === 'react' || op === 'voice') return { status: 200, body: { ok: true } };
        if (SILENT_OK_NULL[op]) return { status: 200, body: { ok: true, room: null } };
        return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };
      }
      return mgr[op](me, data);
    }
  };

  return hub;
}

module.exports = { createRoomHub: createRoomHub };
