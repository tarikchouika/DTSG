/* ═══════════════════════════════════════════════════════════════════════
   الضومنة (do) — التكامل المنصّي مع مشروع dominoes-game المستقل
   ───────────────────────────────────────────────────────────────────────
   المشروع المستقل (بلا أي معرفة بالمنصة):
     • dominoes-game/js/engine/domino-core.js    (المحرك الحتمي — DominoCore)
     • dominoes-game/js/engine/domino-game.js    (السير + الذكاء — DominoGameNS)
     • dominoes-game/js/ui/domino-audio.js       (مؤثرات Web Audio — DominoAudio)
     • dominoes-game/js/ui/domino-i18n.js        (قاموس 4 لغات + وثيقة القواعد)
     • dominoes-game/js/ui/domino-html.js        (بنية الشاشات — DMN_HTML)
     • dominoes-game/js/ui/domino-renderer.js    (العرض — DominoRenderer)
     • dominoes-game/js/ui/domino-app.js         (المتحكم — DominoApp)
     • dominoes-game/js/ui/domino-room.js        (وضع الغرفة — DOMINO_ROOM)
   عقد الدمج نفسه الذي تعرفه المنصة من روندا:
     eDominoes(g) يبني المسرح · initDominoes() يربط اللعبة ·
     cleanupDominoes() ينظّف عند الخروج (يستدعيه closeGamePage).
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

function eDominoes(g) {
  if (typeof window !== 'undefined' && window.DMN_HTML) return window.DMN_HTML;
  return '<div class="stage dm-stage" id="dmStage"></div>';
}

function initDominoes() {
  if (typeof window === 'undefined') return;
  const app = window.DominoApp;
  if (!app || !window.DominoCore || !window.DominoGameNS) {
    console.error('الضومنة: المحرك/الواجهة غير محمّلين');
    return;
  }
  try { app.detach(); } catch (e) { /* تجاهل */ }
  try { app.attach(); } catch (e) { console.error('الضومنة init error:', e); }
  setTimeout(function () {
    try { if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('resize')); } catch (e) {}
  }, 120);
}

function cleanupDominoes() {
  if (typeof window === 'undefined') return;
  if (window.DominoApp) {
    try { window.DominoApp.detach(); } catch (e) { /* تجاهل */ }
  }
}

if (typeof window !== 'undefined') {
  window.eDominoes = eDominoes;
  window.initDominoes = initDominoes;
  window.cleanupDominoes = cleanupDominoes;
}
