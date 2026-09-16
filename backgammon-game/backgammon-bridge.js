/* ═══════════════════════════════════════════════════════════════════════
   الطاولة (bg) — التكامل المنصّي مع مشروع backgammon-game المستقل
   ───────────────────────────────────────────────────────────────────────
   المشروع المستقل (بلا أي معرفة بالمنصة):
     • backgammon-game/js/engine/bg-core.js     (المحرك الحتمي — BgCore)
     • backgammon-game/js/engine/bg-game.js     (السير + الذكاء — BgGameNS)
     • backgammon-game/js/ui/bg-audio.js        (مؤثرات Web Audio — BgAudio)
     • backgammon-game/js/ui/bg-i18n.js         (قاموس 4 لغات + وثيقة القواعد)
     • backgammon-game/js/ui/bg-html.js         (بنية الشاشات — BWG_HTML)
     • backgammon-game/js/ui/bg-renderer.js     (العرض — BgRenderer)
     • backgammon-game/js/ui/bg-app.js          (المتحكم — BackgammonApp)
     • backgammon-game/js/ui/bg-room.js         (وضع الغرفة — BG_ROOM)
   عقد الدمج: eBackgammon(g) · initBackgammon() · cleanupBackgammon()
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

function eBackgammon(g) {
  if (typeof window !== 'undefined' && window.BWG_HTML) return window.BWG_HTML;
  return '<div class="stage bw-stage" id="bwStage"></div>';
}

function initBackgammon() {
  if (typeof window === 'undefined') return;
  const app = window.BackgammonApp;
  if (!app || !window.BgCore || !window.BgGameNS) {
    console.error('الطاولة: المحرك/الواجهة غير محمّلين');
    return;
  }
  try { app.detach(); } catch (e) { /* تجاهل */ }
  try { app.attach(); } catch (e) { console.error('الطاولة init error:', e); }
  /* [BG-Room] تسجيل معالجات الغرفة بعد الربط (attach يستدعي BG_ROOM.register) */
  setTimeout(function () {
    try { if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('resize')); } catch (e) {}
  }, 120);
}

function cleanupBackgammon() {
  if (typeof window === 'undefined') return;
  if (window.BackgammonApp) {
    try { window.BackgammonApp.detach(); } catch (e) { /* تجاهل */ }
  }
}

if (typeof window !== 'undefined') {
  window.eBackgammon = eBackgammon;
  window.initBackgammon = initBackgammon;
  window.cleanupBackgammon = cleanupBackgammon;
}
