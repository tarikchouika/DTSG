/* ═══════════════════════════════════════════════════════════════════════
   روندا الكلاسيكية (rd) — التكامل المنصّي مع المحرك الأصلي المستورد
   ───────────────────────────────────────────────────────────────────────
   المصدر المعتمد: مجلد Ronda-Game (المطابق لملف المستخدم الأصلي) داخل
   ronda-game/ — مُستورد حرفياً بلا تعديل:
     • ronda-game/js/engine/ronda-core.js  (المحرك الحتمي — RondaCore)
     • ronda-game/js/engine/ronda-game.js  (سير المباراة + الذكاء RondaAI)
     • ronda-game/js/ui/audio.js           (مؤثرات Web Audio بلا ملفات)
   طبقة الواجهة المنصّية (نسخ مقتبسة مكيّفة للهوية والترجمة 4 لغات):
     • js/ronda/rd-i18n.js      قاموس rdc.* + وثيقة القواعد
     • js/ronda/rd-html.js      بنية شاشات اللعبة (قائمة/لعب/طبقات)
     • js/ronda/rd-renderer.js  العرض (أصناف معزولة rd-)
     • js/ronda/rd-app.js       المتحكم وخط الأحداث
   عقد الدمج يبقى نفسه الذي تعرفه المنصة: eRondaCard(g) يبني المسرح،
   initRondaCard() يربط اللعبة، cleanupRondaCard() ينظّف عند الخروج.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

/* ── بناء مسرح اللعبة (يُحقن في #gamePageBody) ── */
function eRondaCard(g) {
  if (typeof window !== 'undefined' && window.RD_HTML) return window.RD_HTML;
  return '<div class="stage" id="rdStage"></div>';
}

/* ── ربط اللعبة بعد حقن البنية ── */
function initRondaCard() {
  if (typeof window === 'undefined') return;
  const app = window.RondaApp;
  if (!app || !window.RondaCore || !window.RondaCore.RondaGame) {
    console.error('روندا: المحرك/الواجهة غير محمّلين');
    return;
  }
  try { app.detach(); } catch (e) { /* تجاهل */ }
  try { app.attach(); } catch (e) { console.error('روندا init error:', e); }
  /* ربط معالجات الغرف للمزامنة الجماعية (نفس نمط رامي/بارتشي) */
  try { if (typeof window.rdRegisterRooms === 'function') window.rdRegisterRooms(); } catch (e) { console.error('روندا rooms init error:', e); }
  /* مسرح يملأ الحاوية — إعادة ملاءمة بعد الرسم */
  setTimeout(function () {
    try { if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('resize')); } catch (e) {}
  }, 120);
}

/* ── تنظيف عند الخروج من اللعبة (يستدعيه closeGamePage في main.js) ── */
function cleanupRondaCard() {
  if (typeof window === 'undefined') return;
  if (window.RondaApp) {
    try { window.RondaApp.detach(); } catch (e) { /* تجاهل */ }
  }
  /* تنظيف أي أوراق طائرة عالقة في body */
  try {
    document.querySelectorAll('body > .rd-fly-card').forEach(function (n) { n.remove(); });
  } catch (e) { /* تجاهل */ }
}

if (typeof window !== 'undefined') {
  window.eRondaCard = eRondaCard;
  window.initRondaCard = initRondaCard;
  window.cleanupRondaCard = cleanupRondaCard;
}
