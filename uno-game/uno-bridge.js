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

/* ── معالجات نظام الغرف ── */
function UN_roomStart(room) {
  const app = window.UnoApp;
  if (!app) return;
  app.enterRoom(room, { live: false });
}
/* [v2.68·إصلاح جوهري] التوقيع كان (tag, payload) بمعاملين بينما rooms.js
   يستدعي معالج الحركة بمعامل واحد (كائن بثّ room:move الكامل) ⇒ payload
   كان undefined ⇒ return مبكر ⇒ حركات أونو الحيّة لم تصل الأطراف أبداً عبر
   هذا المسار — كانت الغرفة تعتمد كلياً على إعادة البناء عند إعادة الاتصال
   (منظّم 700ms) = تأخير المزامنة 2-6 ثوانٍ ولوحة الضيف لا تُبنى.
   netApplyMove نفسه يفكّ الغلاف (action==='unmove' && d.data) فلنمرّر
   الكائن كما هو — نفس عقد بقية الجسور (البلوت/الطاولة/الضومنة...). */
function UN_roomMove(d) {
  const app = window.UnoApp;
  if (!app || !d) return;
  try { app.netApplyMove(d); } catch (e) { if (window.console) console.error('[Uno MP] move', e && e.message); }
}
function UN_roomUpdate(room) {
  const app = window.UnoApp;
  if (!app) return;
  if (room && room.game_id === 'un') app._resumeRoom();
}

/* إعادة البناء من سجل الخادم (room:replay) — [v2.68·عزل] حراسة نظيفة:
   لا نعالج إلا إذا غرفة أونو هي الغرفة النشطة (كانت الشروط القديمة
   بأسبقية معاملات ملتبسة تخطي حراسة أحياناً) */
function UN_applyReplay(history, room_id) {
  const app = window.UnoApp;
  if (!app) return false;
  const rs = (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state : null;
  /* الغرفة النشطة ليست أونو ⇒ ليست لنا (تمرّ للسلسلة) */
  if (!rs || rs.game_id !== 'un') return false;
  if (room_id && String(rs.id) !== String(room_id)) return false;
  app.applyReplay(history);
  return true;
}

/* تسجيل معالجات الغرف — [v2.68·عزل] تسجيل صريح بمفتاح أونو: معالجاتها
   تُخزّن باسم 'un' فلا تُستبدل بمعالجات لعبة أخرى تُفتح بعدها/قبلها */
function unRegisterRooms() {
  try {
    if (typeof Rooms === 'undefined' || !Rooms) return;
    if (typeof Rooms.setGameHandler === 'function') Rooms.setGameHandler(UN_roomMove, 'un');
    if (typeof Rooms.setStartHandler === 'function') Rooms.setStartHandler(UN_roomStart, 'un');
    if (typeof Rooms.setUpdateHandler === 'function') Rooms.setUpdateHandler(UN_roomUpdate, 'un');

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
  window.applyRoomReplay = function (d, room_id) {
    const app = window.UnoApp;
    const rs = app && app._roomState ? app._roomState() : null;
    const isUn = (rs && rs.game_id === 'un') ||
      (room_id && rs && String(rs.id) === String(room_id) && rs.game_id === 'un');
    /* [v3-FixChain] يصل إما الحزمة الكاملة {history:[...]} أو المصفوفة — نوحّد الشكل */
    var hist = (d && d.history) ? d.history : d;
    if (isUn) { try { app.applyReplay(hist); return; } catch (e) {} }
    /* [v3-FixChain] نمرر الكائن الأصلي كما هو: الجسور التالية (البلوت) تقرأ d.history —
       تمرير المصفوفة كان يجعل d.history=undefined ⇒ سجل فارغ ⇒ تجاهل تام لإعادة البناء */
    if (typeof prev === 'function') return prev((d && d.history) ? d : hist, room_id);
  };

  /* onRoomRoundEnded: أونو يستدعي معالجته إن كان صاحب الغرفة */
  const prevRound = window.onRoomRoundEnded;
  window.onRoomRoundEnded = function () {
    const app = window.UnoApp;
    if (app && app.roomMode) { try { app.onRoomRoundEnded(); return; } catch (e) {} }
    if (typeof prevRound === 'function') return prevRound();
  };
})();
