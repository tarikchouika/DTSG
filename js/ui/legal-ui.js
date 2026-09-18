/* ═══════════════════════════════════════════
DTSG — Digital Traditional Skills Games — Legal Pages UI
Same structure as index.html
═══════════════════════════════════════════ */
"use strict";

(function () {
var PAGE_TITLES = {
about: 'ui.about',
contact: 'ui.contact',
privacy: 'ui.privacy',
terms: 'ui.terms',
admins: 'ui.admins',
security: 'ui.security',
pf: 'ui.pf',
fairness: 'ui.fairness',
'2fa': 'ui.security',
transactions: 'ui.transactions',
refund: 'refund.title',
support: 'bc.title'
};

function buildSidebar() {
/* [Unify] عناصر القائمة روابط هاش نحو الصفحة الرئيسية (index.html#قسم)
   عوضاً من nav(...) التي لا تعمل على الصفحات القانونية (لا توجد صفحات pg-*) */
return '<aside class="sidebar" id="sidebar" role="navigation" aria-label="القائمة الرئيسية">' +
'<div class="brand">' +
'<div class="brand-logo" aria-hidden="true">' +
'<img src="assets/dtsg/dtsg-logo-main.webp" alt="ألعاب الدكاء التقليدية الرقمية">' +
'</div>' +
'<div class="brand-name">' +
'<b>DTSG</b> ألعاب الدكاء التقليدية الرقمية' +
'<small><i class="fa-solid fa-location-dot" aria-hidden="true"></i> <span data-i18n="ui.brandSub">المغرب</span></small>' +
'</div>' +
'</div>' +
'<div class="side-title" id="sideTitleMain" data-i18n="ui.home">الرئيسية</div>' +
'<a class="nav-item active" data-nav="home" href="index.html#home" aria-current="page">' +
'<span class="ic" aria-hidden="true"><i class="fa-solid fa-house"></i></span>' +
'<span data-i18n="ui.home">الرئيسية</span>' +
'</a>' +
'<a class="nav-item" data-nav="games" href="index.html#games">' +
'<span class="ic" aria-hidden="true"><i class="fa-solid fa-gamepad"></i></span>' +
'<span data-i18n="ui.games">الألعاب</span>' +
'</a>' +
'<a class="nav-item" data-nav="lb" href="index.html#lb">' +
'<span class="ic" aria-hidden="true"><i class="fa-solid fa-ranking-star"></i></span>' +
'<span data-i18n="ui.lb">المتصدرون</span>' +
'</a>' +
'<a class="nav-item" data-nav="chat" href="index.html#chat">' +
'<span class="ic" aria-hidden="true"><i class="fa-solid fa-comments"></i></span>' +
'<span data-i18n="ui.chat">الدردشة</span>' +
'</a>' +
'<a class="nav-item" data-nav="tourney" href="index.html#tourney">' +
'<span class="ic" aria-hidden="true"><i class="fa-solid fa-award"></i></span>' +
'<span data-i18n="ui.tourney">البطولات</span>' +
'</a>' +
'<a class="nav-item" data-nav="rooms" href="index.html#rooms">' +
'<span class="ic" aria-hidden="true"><i class="fa-solid fa-users"></i></span>' +
'<span data-i18n="ui.rooms">غرف اللعب</span>' +
'</a>' +
'<div class="side-title" data-i18n="ui.tools">الأدوات</div>' +
'<a class="nav-item" data-nav="fair" href="index.html#fair" onclick="nav(\'fair\', this); return false;">' +
'<span class="ic" aria-hidden="true"><i class="fa-solid fa-shield-halved"></i></span>' +
'<span data-i18n="ui.fair">Provably Fair</span>' +
'</a>' +
'<a class="nav-item" data-nav="admin" id="navAdmin" href="index.html#admin" style="display:none">' +
'<span class="ic" aria-hidden="true"><i class="fa-solid fa-user-shield"></i></span>' +
'<span data-i18n="ui.admin">الإدارة</span>' +
'</a>' +
'<div class="side-foot">' +
'<div class="sf-icons">' +
'<a class="sf-icon" href="2fa.html" data-i18n-title="ui.fb2fa" title="2FA محمي"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></a>' +
'<a class="sf-icon" href="provably-fair.html" data-i18n-title="ui.fbFair" title="Provably Fair"><i class="fa-solid fa-dice" aria-hidden="true"></i></a>' +
'<a class="sf-icon" href="fairness.html" data-i18n-title="ui.fbSecure" title="العدالة والشفافية"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i></a>' +
'</div>' +
'</div>' +
'</aside>';
}

function buildTopbar() {
/* [Unify] نفس شريط الأيقونات العائمة (.app-dock) الموجود في index.html
   عوضاً عن الـ.topbar الصلب — ليطابق الهيدر الرئيسي تماماً */
return '<div class="app-dock" id="appDock">' +
'<div class="dock-left">' +
'<div id="authChip" class="authchip"></div>' +
'<div class="lang-drop">' +
'<button class="lang-btn dock-ic" id="langBtn" onclick="toggleLangMenu()" aria-haspopup="menu" aria-expanded="false" aria-label="اختيار اللغة">' +
'<span class="lang-abbr" id="langAbbr">ع</span>' +
'<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>' +
'</button>' +
'<div class="lang-menu" id="langMenu" role="menu" aria-label="اللغة">' +
'<button class="lang-opt" role="menuitem" data-lang="ar" onclick="pickLang(\'ar\')">العربية</button>' +
'<button class="lang-opt" role="menuitem" data-lang="da" onclick="pickLang(\'da\')">🇲🇦 الدارجة المغربية</button>' +
'<button class="lang-opt" role="menuitem" data-lang="fr" onclick="pickLang(\'fr\')">Français</button>' +
'<button class="lang-opt" role="menuitem" data-lang="en" onclick="pickLang(\'en\')">English</button>' +
'</div>' +
'</div>' +
'<button class="dock-ic" id="themeBtn" onclick="window.themeToggle()" aria-label="تبديل الوضع المشع/القاتم" aria-pressed="false" title="تبديل الوضع"><i class="fa-regular fa-lightbulb" id="themeIco" aria-hidden="true"></i></button>' +
'</div>' +
'<div class="dock-right">' +
'<button class="dock-ic dock-menu" onclick="openSide()" aria-label="فتح القائمة" aria-expanded="false"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>' +
'</div>' +
'</div>';
}

function buildTicker() {
return '<div class="ticker" role="marquee" aria-label="آخر الفائزين">' +
'<div class="ticker-track" id="ticker"></div>' +
'</div>';
}

function buildFooter() {
/* [Unify] شريط التنقل السفلي (.mobile-bottom-nav) قبل الفوتر — يطابق الصفحة الرئيسية */
var bnav =
'<nav class="mobile-bottom-nav" id="mobileBottomNav" aria-label="التنقل السفلي">' +
'<a class="bnav-item" href="index.html#home"><i class="fa-solid fa-house" aria-hidden="true"></i><span data-i18n="ui.home">الرئيسية</span></a>' +
'<a class="bnav-item" href="index.html#games"><i class="fa-solid fa-gamepad" aria-hidden="true"></i><span data-i18n="ui.games">الألعاب</span></a>' +
'<a class="bnav-item" href="index.html#rooms"><i class="fa-solid fa-users" aria-hidden="true"></i><span data-i18n="ui.rooms">الغرف</span></a>' +
'<a class="bnav-item" href="index.html#tourney"><i class="fa-solid fa-award" aria-hidden="true"></i><span data-i18n="ui.tourney">البطولات</span></a>' +
'<a class="bnav-item" href="index.html#account"><i class="fa-solid fa-user" aria-hidden="true"></i><span data-i18n="ui.account">الحساب</span></a>' +
'</nav>';
return bnav +
'<footer role="contentinfo" class="watermark">' +
'<div class="foot-inner">' +
'<div class="foot-brand">' +
'<span class="foot-name"><b>DTSG</b></span>' +
'<span class="foot-copy">© 2026 — <span data-i18n="ui.footer">جميع الحقوق محفوظة</span></span>' +
'</div>' +
'<div class="foot-legal" role="navigation" aria-label="روابط قانونية">' +
'<a href="about.html" data-i18n="ui.about">من نحن</a>' +
'<a href="contact.html" data-i18n="ui.contact">تواصل معنا</a>' +
'<a href="privacy.html" lang="ar" data-i18n="ui.privacy">الخصوصية</a>' +
'<a href="terms.html" lang="ar" data-i18n="ui.terms">الشروط</a>' +
'<a href="refund-policy.html" lang="ar" data-i18n="ui.refund">الاسترداد</a>' +
'<a href="support.html" data-i18n="ui.support">الدعم</a>' +
'</div>' +
'</div>' +
'</footer>';
}

function injectLegalUI(pageKey) {
var contentEl = document.querySelector('.legal-content, .legal-wrap');

var app = document.createElement('div');
app.className = 'app';

var sidebar = document.createElement('aside');
sidebar.innerHTML = buildSidebar();
app.appendChild(sidebar.childNodes[0]);

var backdrop = document.createElement('div');
backdrop.id = 'backdrop';
backdrop.setAttribute('onclick', 'closeSide()');
backdrop.setAttribute('aria-hidden', 'true');
app.appendChild(backdrop);

var main = document.createElement('div');
main.className = 'main';

var topbarWrap = document.createElement('div');
topbarWrap.innerHTML = buildTopbar();
main.appendChild(topbarWrap.childNodes[0]);

var tickerWrap = document.createElement('div');
tickerWrap.innerHTML = buildTicker();
main.appendChild(tickerWrap.childNodes[0]);
/* الصفحات القانونية بلا تغذية فائزين — أخفِ الشريط إن كان فارغاً */
var tickerTrack = document.getElementById('ticker');
if (tickerTrack && !tickerTrack.children.length) {
var _tEl = tickerTrack.closest('.ticker');
if (_tEl) _tEl.style.display = 'none';
}

var content = document.createElement('main');
content.className = 'content';
content.setAttribute('role', 'main');
if (contentEl) { content.appendChild(contentEl); }
main.appendChild(content);

var footerWrap = document.createElement('div');
footerWrap.innerHTML = buildFooter();
/* buildFooter قد يُرجع أكثر من عقدة جذرية (شريط تنقل سفلي + فوتر) — نُلحق الكل */
while (footerWrap.firstChild) { main.appendChild(footerWrap.firstChild); }

app.appendChild(main);

document.body.insertAdjacentHTML('afterbegin',
'<canvas id="fxCanvas" aria-hidden="true"></canvas><div id="flash" aria-hidden="true"></div>');
document.body.appendChild(app);

if (!document.getElementById('toasts')) {
document.body.insertAdjacentHTML('beforeend',
'<div id="toasts" role="alert" aria-live="assertive"></div>');
}

/* [v2.42] مركز المساعدة العائم بدل أيقونة واتساب — نفس الودجت المستعمل في المنصة
   (شات مع بوت خدمة العملاء + روابط الشحن والمدفوعات) */
if (!document.getElementById('botFab') && !window.__dtsgBotChat) {
var _bc = document.createElement('script');
_bc.src = 'js/ui/bot-chat.js?v=dtsg9'; _bc.defer = true;
document.head.appendChild(_bc);
}

var titleKey = PAGE_TITLES[pageKey] || PAGE_TITLES.about;
var pageTitle = typeof T === 'function' ? T(titleKey) : '';
document.title = 'ألعاب الدكاء التقليدية الرقمية | ' + pageTitle;

var descKey = 'legal.' + pageKey + 'Desc';
var desc = (typeof T === 'function' && typeof TR !== 'undefined' && TR[descKey]) ? T(descKey) : '';
if (desc) {
var metaDesc = document.querySelector('meta[name="description"]');
if (metaDesc) metaDesc.setAttribute('content', desc);
}

if (typeof updateThemeIcon === 'function') updateThemeIcon();
if (typeof initState === 'function') initState();
if (typeof syncLangDrop === 'function') syncLangDrop();
if (typeof translateStatic === 'function') translateStatic();
if (typeof updateCopyright === 'function') updateCopyright();
if (typeof renderAuthChip === 'function') renderAuthChip();

if (typeof authRestore === 'function') {
authRestore().catch(function () { /* no session */ });
}

window.injectLegalUI = injectLegalUI;
window.LEGAL_PAGE_KEY = pageKey;
}

/* اجعل الدالة متاحة عالمياً لتستدعيها الصفحات القانونية المنفردة (injectLegalUI('about') ...) */
window.injectLegalUI = injectLegalUI;

})();
