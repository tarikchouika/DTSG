/* ════════════════════════════════════════════════════════════════════
   البلوت (bl) — جسر التكامل مع المنصة — نفس عقد الطاولة/الضومنة/روندا:
     eBaloot(g)        يبني المسرح
     initBaloot()      يربط اللعبة عند فتح الصفحة + معالجات الغرفة
     cleanupBaloot()   ينظّف عند الخروج (يستدعيه closeGamePage)
   الملفات المستقلة (بلا أي معرفة بالمنصة):
     baloot-game/js/engine/baloot-core.js    (المحرك الحتمي — BALCore)
     baloot-game/js/engine/baloot-game.js    (السير + الذكاء — BLGameNS)
     baloot-game/js/ui/baloot-audio.js       (مؤثرات Web Audio — BLAudio)
     baloot-game/js/ui/baloot-i18n.js        (قاموس 4 لغات + القواعد)
     baloot-game/js/ui/baloot-renderer.js    (العرض — BLRender)
     baloot-game/js/ui/baloot-html.js        (بنية الشاشات — BLHTML)
     baloot-game/js/ui/baloot-app.js         (المتحكم — BalootApp)
   ════════════════════════════════════════════════════════════════════ */
'use strict';

/* أوراق المنصة الموحدة (نفس أصول الرامي/الهاي لو/البلاك جاك) + لوغو المنصة في منتصف الطاولة */
window.BL_ASSET_BASE = 'assets';

function eBaloot(g) {
  if (typeof window !== 'undefined' && window.BLHTML) return '<div class="stage bl-stage" id="blStage">' + window.BLHTML.stageHTML() + '</div>';
  return '<div class="stage bl-stage" id="blStage"></div>';
}

/* معرّف اللاعب الحالي (تستخدمه اللعبة لمقابلة المقاعد في الغرفة) */
function blMyUserId() {
  if (typeof AUTH !== 'undefined' && AUTH.user) return AUTH.user.id;
  return null;
}

/* ── معالجات نظام الغرف (نفس نمط روندا) ── */
function BL_roomStart(room) {
  const app = window.BalootApp;
  if (app && room) {
    try { app.enterRoom(room, { live: false }); } catch (e) { console.error('[Baloot MP] start', e); }
  }
}

function BL_roomMove(d) {
  const app = window.BalootApp;
  if (!app) return;
  try {
    if (d && d.action === 'blmove' && d.data) d = d.data;
    app.netApplyMove(d);
  } catch (e) { console.error('[Baloot MP] move', e && e.message); }
}

function BL_roomUpdate(room) {
  const app = window.BalootApp;
  if (app) { try { app.roomUpdate(room); } catch (e) {} }
}

function BL_applyReplay(d) {
  const app = window.BalootApp;
  if (!app) return;
  try {
    const rs = (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state : null;
    if (rs && rs.game_id !== 'bl') return;
    app.applyReplay((d && d.history) || [], (d && d.room_id) || null);
  } catch (e) { console.error('[Baloot MP] replay', e && e.message); }
}

function blRegisterRooms() {
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.setGameHandler !== 'function') return;
  Rooms.setGameHandler(BL_roomMove);
  Rooms.setStartHandler(BL_roomStart);
  if (typeof Rooms.setUpdateHandler === 'function') Rooms.setUpdateHandler(BL_roomUpdate);
  /* إعادة بناء معلّقة (لاعب عائد بعد انقطاع) */
  if (typeof Rooms.hasPendingReplay === 'function' && Rooms.hasPendingReplay()) {
    const rp = Rooms.consumePendingReplay();
    if (rp && rp.history && rp.history.length) { BL_applyReplay(rp); return; }
  }
  /* غرفة جارية عند فتح اللعبة: استئناف + طلب سجل الحركات */
  if (Rooms.state && Rooms.state.game_id === 'bl' && Rooms.state.status === 'playing') {
    const app = window.BalootApp;
    if (app && typeof app.enterRoom === 'function') {
      try { app.enterRoom(Rooms.state, { live: true }); } catch (e) { console.error('[Baloot MP] resume', e); }
    }
    if (typeof Rooms.requestReplay === 'function') {
      setTimeout(function () { try { Rooms.requestReplay(); } catch (e) {} }, 250);
    }
  }
}

function initBaloot() {
  if (typeof window === 'undefined') return;
  const app = window.BalootApp;
  if (!app || !window.BALCore || !window.BLGameNS) {
    console.error('البلوت: المحرك/الواجهة غير محمّلين');
    return;
  }
  window.blMyUserId = blMyUserId;
  try { app.detach(); } catch (e) { /* تجاهل */ }
  try { app.attach(); } catch (e) { console.error('البلوت init error:', e); }
  blRegisterRooms();
  setTimeout(function () {
    try { if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('resize')); } catch (e) {}
  }, 120);
}

function cleanupBaloot() {
  if (typeof window === 'undefined') return;
  if (window.BalootApp) {
    try { window.BalootApp.detach(); } catch (e) { /* تجاهل */ }
  }
}

if (typeof window !== 'undefined') {
  window.eBaloot = eBaloot;
  window.initBaloot = initBaloot;
  window.cleanupBaloot = cleanupBaloot;
  window.blMyUserId = blMyUserId;
  window.BL_roomStart = BL_roomStart;
  window.BL_roomMove = BL_roomMove;
  window.BL_roomUpdate = BL_roomUpdate;
  window.BL_applyReplay = BL_applyReplay;
  /* rooms.js يستدعي applyRoomReplay عند وصول room:replay — نسجّل نسخة متسلسلة:
     إن كانت الغرفة بلوت نعالجها، وإلا نمررها للمعالج السابق. (ولدى اللعبة
     مراقب مخصص للسجل المعلق — double safety) */
  const _prevReplay = window.applyRoomReplay;
  window.applyRoomReplay = function (d) {
    const rs = (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state : null;
    if (rs && rs.game_id === 'bl') { try { BL_applyReplay(d); } catch (e) {} return; }
    if (typeof _prevReplay === 'function') { try { _prevReplay(d); } catch (e) {} }
  };
  /* إنهاء جولة الغرفة (playing → waiting): بلوت يصفّي وضع الغرفة */
  if (!window.onRoomRoundEnded) {
    window.onRoomRoundEnded = function (room) {
      try { if (window.BalootApp) window.BalootApp.onRoomRoundEnded(room); } catch (e) {}
    };
  }
}
