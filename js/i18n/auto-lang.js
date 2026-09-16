/* DTSG — Digital Traditional Skills Games — auto language bootstrap
 * Provides window._origSetLang so the shared legal-page logic can chain the
 * platform-wide setLang() (defined later in js/core/utils.js). It is wrapped
 * lazily so it works regardless of script load order (this file loads before
 * utils.js in the legal pages' <head>).
 */
(function () {
  'use strict';

  window._origSetLang = function (l) {
    try {
      if (typeof window.setLang === 'function') window.setLang(l);
    } catch (e) { /* ignore chain errors on legal pages */ }
  };

  // Auto-detect an explicit ?lang= override from the URL on load.
  document.addEventListener('DOMContentLoaded', function () {
    try {
      var p = new URLSearchParams(location.search).get('lang');
      if (p === 'ar' || p === 'fr' || p === 'en' || p === 'da') {
        if (typeof window.setLang === 'function') window.setLang(p);
      }
    } catch (e) { /* ignore */ }
  });

  /* [i18n] الصفحات القانونية تستدعي applyLang المحلية (لا setLang) —
     نراقب جلوس authRestore: عند اكتمالها (renderAuthChip دالة + AUTH.user موجود)
     نعيد بناء القائمة مرة أخيرة باللغة الحالية ثم نوقف المراقبة. */
  document.addEventListener('DOMContentLoaded', function () {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (typeof window.renderAuthChip === 'function' && window.AUTH && window.AUTH.user) {
        try { window.renderAuthChip(); } catch (e) { /* ignore */ }
        clearInterval(timer);
        return;
      }
      if (tries >= 20) clearInterval(timer);   /* 10 ثوانٍ (20 × 500ms) ثم التوقف */
    }, 500);
  });
})();

/* [i18n-auto 2026-09-12] كشف لغة الزائر الجديد (متصفح/جغرافيا) — تفضيل المستخدم
   المحفوظ (rc_lang) يغلب دائماً. تستهلكه الصفحات القانونية و state.js. */
window.detectInitialLang = function () {
  try {
    var saved = localStorage.getItem('rc_lang');
    if (saved === 'ar' || saved === 'fr' || saved === 'en' || saved === 'da') return saved;
  } catch (e) { /* ignore */ }
  try {
    var p = new URLSearchParams(location.search).get('lang');
    if (p === 'ar' || p === 'fr' || p === 'en' || p === 'da') return p;
  } catch (e) { /* ignore */ }
  try {
    var langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'ar'];
    for (var i = 0; i < langs.length; i++) {
      var l = String(langs[i] || '').toLowerCase().slice(0, 2);
      if (l === 'ar') return 'ar';
      if (l === 'fr') return 'fr';
      if (l === 'en') return 'en';
    }
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e2) { tz = ''; }
    if (/Africa\/Casablanca|Africa\/El_Aaiun/i.test(tz)) {
      for (var j = 0; j < langs.length; j++) {
        var lj = String(langs[j] || '').toLowerCase();
        if (lj.indexOf('fr') === 0) return 'fr';
      }
      return 'ar';
    }
  } catch (e) { /* ignore */ }
  return 'ar';
};
/* الصفحات القانونية: ثبّت اللغة المكتشفة أول مرة (المستخدم يظل حراً في تغييرها) */
try {
  if (!localStorage.getItem('rc_lang') && window.detectInitialLang) {
    localStorage.setItem('rc_lang', window.detectInitialLang());
  }
} catch (e) { /* ignore */ }
