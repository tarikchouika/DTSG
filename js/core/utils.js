/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Utility Functions
   ═══════════════════════════════════════════ */
"use strict";
/* ── فهرس اللغة الحالي ── */
function langIndex() {
  if (typeof ST !== 'undefined' && ST.lang === 'fr') return 1;
  if (typeof ST !== 'undefined' && ST.lang === 'en') return 2;
  if (typeof ST !== 'undefined' && ST.lang === 'da') return 3;
  return 0;
}
/* ── الترجمة ── */
function T(key) {
  if (typeof TR === 'undefined') return key;
  const entry = TR[key];
  if (entry) {
    return entry[langIndex()] || entry[0] || key;
  }
  return key;
}
/* ── تنسيق الأرقام حسب اللغة ── */
function fmt(n) {
  try {
    const lang = typeof ST !== 'undefined' ? ST.lang : 'ar';
    const locale = (lang === 'ar' || lang === 'da') ? 'ar-MA' :
                   lang === 'fr' ? 'fr-FR' : 'en-US';
    /* [Decimal] أرقام عشرية بدقة منزلتين (0.00) — بلا أصفار زائدة للأعداد الصحيحة */
    const v = (typeof n === 'number' && isFinite(n)) ? Math.round(n * 100) / 100 : n;
    const opts = (Number.isFinite(v) && Math.abs(v % 1) > 0.001)
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { maximumFractionDigits: 2 };
    return v.toLocaleString(locale, opts);
  } catch (e) {
    return String(n);
  }
}
/* ── ربط الدوال بالنطاق العام window ── */
if (typeof window !== 'undefined') {
  window.langIndex = langIndex;
  window.T = T;
  window.fmt = fmt;
}
/* ── Toast Notifications ── */
function toast(message, type) {
  type = type || 'info';
  const icons = {
    Ok: '✅',
    ok: '✅',
    Err: '❌',
    err: '❌',
    Warn: '⚠️',
    warn: '⚠️',
    Info: 'ℹ️',
    info: 'ℹ️'
  };
  if (typeof document === 'undefined') return;
  const container = document.getElementById('toasts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', 'alert');
  el.innerHTML =
    '<span class="toast-ico">' + (icons[type] || 'ℹ️') + '</span>' +
    '<span class="toast-msg">' + message + '</span>' +
    '<button class="toast-close" type="button" aria-label="' + (T('ui.close') || 'إغلاق') + '">×</button>';
  container.appendChild(el);
  let timer = null;
  function dismiss() {
    if (timer) { clearTimeout(timer); timer = null; }
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(function () { if (el.parentNode) el.remove(); }, 300);
  }
  const closeBtn = el.querySelector('.toast-close');
  if (closeBtn) closeBtn.onclick = dismiss;
  /* داخل اللعبة: تظهر الرسالة 10 ثوانٍ (مع زر إغلاق يدوي)؛ خارجها: 3.5 ثوانٍ */
  var inGame = document.body && document.body.classList.contains('pg-game');
  timer = setTimeout(dismiss, inGame ? 10000 : 3500);
}
if (typeof window !== 'undefined') {
  window.toast = toast;
}
/* ── التنقل بين الصفحات ── */
function nav(id, el) {
  /* التوافق مع روابط قديمة فقط: لا توجد صفحة دردشة عامة بعد الآن. */
  if (id === 'chat') { id = 'home'; el = document.querySelector('[data-nav="home"]'); }
  /* إخفاء كل الصفحات */
  const pages = document.querySelectorAll('.page');
  for (let i = 0; i < pages.length; i++) {
    pages[i].classList.remove('active');
  }
  /* تتبّع الصفحة الحالية على <body> للتحكم بإظهار الدوك/الهيدر */
  const body = document.body;
  body.className = body.className.replace(/\bpg-[a-z0-9-]+\b/g, '').trim();
  body.classList.add('pg-' + id);
  /* الخروج من وضع الشاشة الممتلئة عند مغادرة صفحة اللعبة */
  if (id !== 'game' && body.classList.contains('app-fs-on') && typeof exitAppFullscreen === 'function') {
    exitAppFullscreen();
  }
  /* إظهار الصفحة المطلوبة */
  const target = document.getElementById('pg-' + id);
  if (target) {
    target.classList.add('active');
  }
  /* تحديث القائمة الجانبية وشريط التنقل السفلي */
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(function (n) {
    const isAct = n.getAttribute('data-nav') === id;
    n.classList.toggle('active', isAct);
    if (isAct) n.setAttribute('aria-current', 'page');
    else n.removeAttribute('aria-current');
  });
  const bnavItems = document.querySelectorAll('.bnav-item');
  bnavItems.forEach(function (b) {
    const isAct = b.getAttribute('data-bnav') === id;
    b.classList.toggle('active', isAct);
    if (isAct) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  /* إعادة رسم صفحة الإدارة والبطولات عند فتحها (تحديث حي من الـ API) */
  if (id === 'admin' && typeof renderAdmin === 'function') renderAdmin();
  if (id === 'tourney' && typeof renderTourney === 'function') renderTourney();
  if (id === 'rooms' && typeof renderRooms === 'function') renderRooms();
  if (id === 'transactions' && typeof renderTransactions === 'function') renderTransactions();
  if (id === 'account' && typeof renderAccountLog === 'function') renderAccountLog();
  if (id === 'fair' && typeof renderFair === 'function') renderFair();
  /* صفحة الأصدقاء: إظهارها وتهيئتها (إن وُجدت) */
  if (id === 'friends' && typeof Friends !== 'undefined' && Friends.init) Friends.init();
  closeSide();
  SND.click();
  /* ── Hash routing: update URL hash without triggering hashchange loop ── */
  _syncHash(id);
}
/* ── Hash routing (hash ↔ section) ── */
var _hashUpdating = false;
function _syncHash(id) {
  if (_hashUpdating) return;
  var hash = window.location.hash.replace('#', '');
  if (hash !== id) {
    _hashUpdating = true;
    window.history.replaceState(null, '', id === 'home' ? '' : '#' + id);
    _hashUpdating = false;
  }
}
function navFromHash() {
  var hash = window.location.hash.replace('#', '') || 'home';
  /* أزيلت القناة العامة: الرابط القديم #chat لا يترك صفحة فارغة ولا يعيد إنشاءها. */
  if (hash === 'chat') {
    hash = 'home';
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
  }
  /* الصفحات القانونية صارت ملفات html مستقلة — الروابط القديمة #about وأخواتها تُحوَّل إليها */
  var LEGAL_PAGES = { about: 1, terms: 1, privacy: 1, fairness: 1, 'provably-fair': 1, '2fa': 1, contact: 1, admins: 1 };
  if (LEGAL_PAGES[hash]) { window.location.href = hash + '.html'; return; }
  var el = document.querySelector('[data-nav="' + hash + '"]');
  if (typeof nav === 'function') nav(hash, el);
}
window.addEventListener('hashchange', function () {
  if (_hashUpdating) return;
  navFromHash();
});
/* ── القائمة الجانبية للموبايل ── */
function openSide() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('backdrop');
  if (sidebar) sidebar.classList.add('open');
  if (backdrop) backdrop.classList.add('show');
  const menu = document.querySelector('.dock-menu, .burger');
  if (menu) menu.setAttribute('aria-expanded', 'true');
}
function closeSide() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('backdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');
  const menu = document.querySelector('.dock-menu, .burger');
  if (menu) menu.setAttribute('aria-expanded', 'false');
}
/* ── تغيير اللغة ── */
function setLang(lang) {
  ST.lang = lang;
  sSet('rc_lang', lang);
  applyI18n();
  translateStatic();
  /* [i18n] إعادة بناء قائمة المستخدم المنسدلة باللغة الجديدة (نصوصها كانت تُبنى بـ T() وقت الإنشاء) */
  if (typeof renderAuthChip === 'function') renderAuthChip();
  syncLangDrop();
  if (typeof renderAll === 'function') renderAll();
  updateCopyright();
}
/* ── قائمة اللغة المنسدلة (ع / FR / EN) ── */
const LANG_MENU_LABEL = { ar: 'ع', da: '🇲🇦', fr: 'FR', en: 'EN' };
function syncLangDrop() {
  const abbr = document.getElementById('langAbbr');
  if (abbr) abbr.textContent = LANG_MENU_LABEL[ST.lang] || 'ع';
  const btn = document.getElementById('langBtn');
  if (btn) btn.setAttribute('aria-label', T('ui.lang'));
  const menu = document.getElementById('langMenu');
  if (menu) {
    const opts = menu.querySelectorAll('.lang-opt');
    opts.forEach(function (o) {
      o.classList.toggle('active', o.getAttribute('data-lang') === ST.lang);
    });
  }
}
function toggleLangMenu() {
  const menu = document.getElementById('langMenu');
  const btn = document.getElementById('langBtn');
  if (!menu) return;
  const open = menu.classList.toggle('open');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function pickLang(lang) {
  closeLangMenu();
  if (ST.lang !== lang) setLang(lang);
}
function closeLangMenu(evt) {
  const menu = document.getElementById('langMenu');
  const btn = document.getElementById('langBtn');
  if (!menu) return;
  if (evt && btn && menu.classList.contains('open') && (evt.target === btn || btn.contains(evt.target))) {
    return;
  }
  if (menu.classList.contains('open')) {
    menu.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}
/* ── ترجمة العناصر الثابتة (data-i18n / data-i18n-html) ── */
function translateStatic() {
  /* [i18n-fix 2026-09-17] لا تستبدل النص البديل بالمفتاح الخام عند غيابه من القاموس */
  const has = k => (typeof TR !== 'undefined') && TR[k];
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    const k = el.getAttribute('data-i18n');
    if (has(k)) el.textContent = T(k);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
    const k = el.getAttribute('data-i18n-placeholder');
    if (has(k)) el.setAttribute('placeholder', T(k));
  });
  document.querySelectorAll('[data-k]').forEach(function (el) {
    const k = el.getAttribute('data-k');
    if (has(k)) el.innerHTML = T(k);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
    const v = T(el.getAttribute('data-i18n-html'));
    if (v) el.innerHTML = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
    const v = T(el.getAttribute('data-i18n-placeholder'));
    if (v) el.setAttribute('placeholder', v);
  });
  /* ترجمة الـ title (للأزرار والأيقونات بدون نص) */
  document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
    const v = T(el.getAttribute('data-i18n-title'));
    if (v) el.setAttribute('title', v);
  });
  /* زر ملء الشاشة في صفحة اللعبة — نصه يُدار ديناميكياً حسب الوضع */
  if (typeof syncGameFsBtn === 'function') syncGameFsBtn();
}
/* ── تحديث سنة حقوق النشر بناءً على التوقيت المحلي ── */
function updateCopyright() {
  var year = new Date().getFullYear();
  document.querySelectorAll('[data-i18n-year]').forEach(function (el) {
    el.textContent = year;
  });
}
/* ── تطبيق اتجاه الصفحة ──
   الدارجة المغربية عربية وتُكتب من اليمين إلى اليسار مثل الفصحى */
function applyI18n() {
  const dir = (ST.lang === 'ar' || ST.lang === 'da') ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', ST.lang === 'da' ? 'ar-MA' : ST.lang);
}
/* ── أدوات الورق ── */
const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_SUITS = ['♠', '♥', '♦', '♣'];
function randomRank() {
  return CARD_RANKS[Math.floor(Math.random() * CARD_RANKS.length)];
}
function randomSuit() {
  return CARD_SUITS[Math.floor(Math.random() * CARD_SUITS.length)];
}
/* ── توافق مع محركات ألعاب الورق (أسماء rr/rs2/hVal) ── */
function rr() {
  return randomRank();
}
function rs2() {
  return randomSuit();
}
function hVal(rank) {
  return CARD_RANKS.indexOf(rank);
}
function cardValue(rank) {
  return CARD_RANKS.indexOf(rank);
}
function cardDisplayValue(card) {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}
function handValue(hand) {
  let value = 0;
  let aces = 0;
  for (let i = 0; i < hand.length; i++) {
    value += cardDisplayValue(hand[i]);
    if (hand[i].rank === 'A') aces++;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}
/* ── مسار صورة ورقة من الأصول الموحدة (assets/cards) ── */
const SUIT_FILE = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
function suitKey(s) {
  return SUIT_FILE[s] || 'spades';
}
function cardSrc(card) {
  const rank = card.rank || card.r || 'A';
  const suit = card.suit || card.s || '♠';
  return 'assets/cards/' + rank + '-' + suitKey(suit) + '.webp';
}
/* ── توليد HTML لبطاقة ورق (صور موحدة + شعار) ── */
function cardHTML(card, isBack, isHold) {
  if (isBack) {
    return '<div class="bjc back" aria-hidden="true"><img src="assets/cards/back.webp" alt="" draggable="false"></div>';
  }
  const rank = card.rank || card.r;
  const suit = card.suit || card.s;
  const isRed = suit === '♥' || suit === '♦';
  const colorClass = isRed ? ' red' : '';
  const holdBadge = isHold ? '<span class="hold">HOLD</span>' : '';
  return '<div class="bjc' + colorClass + '" aria-label="' + rank + ' ' + suit + '">' +
    holdBadge +
    '<img src="' + cardSrc(card) + '" alt="' + rank + ' ' + suit + '" draggable="false">' +
    '</div>';
}
/* ── إنشاء مجموعة ورق مخلوطة ── */
function createDeck() {
  const deck = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 0; r < 13; r++) {
      deck.push({ suit: CARD_SUITS[s], rank: CARD_RANKS[r] });
    }
  }
  /* Fisher-Yates shuffle */
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = deck[i];
    deck[i] = deck[j];
    deck[j] = temp;
  }
  return deck;
}
/* ── تأثير الفوز ── */
function winFX(winAmount, bigThreshold) {
  if (winAmount > 0) {
    const big = winAmount >= (bigThreshold || GB * 5);
    celebrate(big);
    if (big && typeof coinRain === 'function') coinRain(16);
  } else {
    SND.lose();
  }
}
/* ── Hash بسيط لـ Provably Fair ── */
function simpleHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  let output = '';
  for (let j = 0; j < 64; j++) {
    output += ((hash + str.charCodeAt(j % str.length) * 31 + j * 17) & 15).toString(16);
    hash = (hash * 31 + j) | 0;
  }
  return output;
}

/* ── تبديل الوضع المشع / القاتم ── */
function themeToggle() {
  const html = document.documentElement;
  const radiant = html.getAttribute('data-theme') === 'radiant';
  if (radiant) {
    html.removeAttribute('data-theme');
    sSet('rc_theme', 'dark');
  } else {
    html.setAttribute('data-theme', 'radiant');
    sSet('rc_theme', 'radiant');
  }
  updateThemeIcon();
  if (typeof SND !== 'undefined' && SND.click) SND.click();
}
function updateThemeIcon() {
  const b = document.getElementById('themeBtn');
  if (!b) return;
  const radiant = document.documentElement.getAttribute('data-theme') === 'radiant';
  const ico = document.getElementById('themeIco');
  if (ico) ico.className = radiant ? 'fa-solid fa-lightbulb' : 'fa-regular fa-lightbulb';
  b.setAttribute('aria-pressed', radiant ? 'true' : 'false');
}
if (typeof window !== 'undefined') {
  window.themeToggle = themeToggle;
  window.updateThemeIcon = updateThemeIcon;
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateThemeIcon);
  } else {
    updateThemeIcon();
  }
}

/* ── فتح الحساب أو مودال الدخول للزائر ── */
function openAccountOrAuth(el) {
  if (typeof AUTH !== 'undefined' && AUTH.user) {
    nav('account', el);
  } else {
    if (typeof openAuthModal === 'function') openAuthModal();
  }
}
window.openAccountOrAuth = openAccountOrAuth;

/* ═══════════ VIP Level System ═══════════ */
function getVipLevel(gold) {
  const g = parseInt(gold, 10) || 0;
  if (g >= 500000) return { id: 'royal', name: T('vip.royal') || '👑 VIP ملكي', badge: 'vip-royal', icon: 'fa-crown', color: '#F5C518' };
  if (g >= 100000) return { id: 'plat', name: T('vip.plat') || '💎 بلاتيني', badge: 'vip-plat', icon: 'fa-gem', color: '#38BDF8' };
  if (g >= 25000) return { id: 'gold', name: T('vip.gold') || '🥇 ذهبي', badge: 'vip-gold', icon: 'fa-medal', color: '#F59E0B' };
  if (g >= 5000) return { id: 'silver', name: T('vip.silver') || '🥈 فضي', badge: 'vip-silver', icon: 'fa-shield', color: '#94A3B8' };
  return { id: 'bronze', name: T('vip.bronze') || '🥉 برونزي', badge: 'vip-bronze', icon: 'fa-certificate', color: '#CD7F32' };
}
function sanitizeAmount(val) {
  const num = parseInt(val, 10);
  return isNaN(num) || num <= 0 ? 0 : Math.min(num, 1000000000);
}
window.getVipLevel = getVipLevel;
window.sanitizeAmount = sanitizeAmount;

