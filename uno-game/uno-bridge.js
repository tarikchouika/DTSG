/* ════════════════════════════════════════════════════════════════════
   أونو (un) — جسر التكامل مع المنصة — نفس عقد الطاولة/البلوت:
     eUno(g)        يبني المسرح
     initUno()      يربط اللعبة عند فتح الصفحة + معالجات الغرفة
     cleanupUno()   ينظّف عند الخروج (يستدعيه closeGamePage)
   ════════════════════════════════════════════════════════════════════ */
'use strict';

/* شعار المنصة في منتصف الطاولة (نفس نمط البلوت) */
window.UN_ASSET_BASE = 'assets';

function eUno(g) {
  if (typeof window !== 'undefined' && window.UNHTML) return '<div class="stage un-stage" id="unStage">' + window.UNHTML.stageHTML() + '</div>';
  return '<div class="stage un-stage" id="unStage"></div>';
}

/* معرّف اللاعب الحالي (تستخدمه اللعبة لمقابلة المقاعد في الغرفة) */
function unMyUserId() {
  if (typeof AUTH !== 'undefined' && AUTH.user) return AUTH.user.id;
  return null;
}

/* ── معالجات نظام الغرف (نفس نمط البلوت) ── */
function UN_roomStart(room) {
  const app = window.UnoApp;
  if (!app) return;
  app.enterRoom(room, { live: false });
}
function UN_roomMove(tag, payload) {
  const app = window.UnoApp;
  if (!app || !payload) return;
  if (tag === 'unmove') app.netApplyMove(payload);
  else app.netApplyMove(payload);
}
function UN_roomUpdate(room) {
  const app = window.UnoApp;
  if (!app) return;
  if (room && room.game_id === 'un') app._resumeRoom();
}

/* إعادة البناء من سجل الخادم (room:replay) — متسلسل مع بقية الألعاب */
function UN_applyReplay(history, room_id) {
  const app = window.UnoApp;
  const rs = app._roomState ? app._roomState() : null;
  if (room_id && rs && String(rs.id) !== String(room_id)) return false;
  if (!app || app.config && app.config.mode === 'room' && rs && rs.game_id !== 'un') return false;
  if (rs && rs.game_id !== 'un' && !(app.roomMode)) return false;
  app.applyReplay(history);
  return true;
}

/* تسجيل معالجات الغرف */
function unRegisterRooms() {
  try {
    if (typeof Rooms === 'undefined' || !Rooms) return;
    if (typeof Rooms.setGameHandler === 'function') Rooms.setGameHandler(UN_roomMove);
    if (typeof Rooms.setStartHandler === 'function') Rooms.setStartHandler(UN_roomStart);
    if (typeof Rooms.setUpdateHandler === 'function') Rooms.setUpdateHandler(UN_roomUpdate);

    /* استهلاك سجل معلق (رجوع من صفحة أخرى) */
    try {
      if (typeof Rooms.hasPendingReplay === 'function' && Rooms.hasPendingReplay()) {
        const rp = Rooms.consumePendingReplay();
        const app = window.UnoApp;
        const rs = app && app._roomState ? app._roomState() : null;
        if (rp && rp.history && rs && rs.game_id === 'un') app.applyReplay(rp.history);
      }
    } catch (e) {}

    /* استئناف غرفة بلوت/أونو جارية */
    const rs = Rooms.state;
    if (rs && rs.game_id === 'un') {
      const app = window.UnoApp;
      app.enterRoom(rs, { live: true });
      try { if (typeof Rooms.requestReplay === 'function') setTimeout(function () { try { Rooms.requestReplay(); } catch (e) {} }, 250); } catch (e) {}
    }
  } catch (e) {}
}

function initUno() {
  const app = window.UnoApp;
  if (!app) return;
  app.attach();
  unRegisterRooms();
  /* ضبط حجم المسرح بعد اكتمال التخطيط */
  try { if (typeof fitGameStage === 'function') setTimeout(fitGameStage, 120); } catch (e) {}
}

function cleanupUno() {
  const app = window.UnoApp;
  if (app && app.detach) app.detach();
}

/* ── سلاسل المنصة المشتركة ── */
(function () {
  /* applyRoomReplay: أونو يتعامل مع un وينادي المعالج السابق لبقية الألعاب */
  const prev = window.applyRoomReplay;
  window.applyRoomReplay = function (history, room_id) {
    const app = window.UnoApp;
    const rs = app && app._roomState ? app._roomState() : null;
    const isUn = (rs && rs.game_id === 'un') ||
      (room_id && rs && String(rs.id) === String(room_id) && rs.game_id === 'un');
    if (isUn) { try { app.applyReplay(history); return; } catch (e) {} }
    if (typeof prev === 'function') return prev(history, room_id);
  };

  /* onRoomRoundEnded: أونو يستدعي معالجته إن كان صاحب الغرفة */
  const prevRound = window.onRoomRoundEnded;
  window.onRoomRoundEnded = function () {
    const app = window.UnoApp;
    if (app && app.roomMode) { try { app.onRoomRoundEnded(); return; } catch (e) {} }
    if (typeof prevRound === 'function') return prevRound();
  };
})();
