/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Authentication & User Session
   Global functions (visible to Playwright + onclick):
   authLogin, authRegister, authLogout, authSync, authSyncNow,
   openAuthModal, closeAuthModal, authTab, renderAuthChip, authRestore
   ═══════════════════════════════════════════ */
"use strict";

/* ── حالة المصادقة ── */
const AUTH = {
  user: null,
  _lastSync: 0
};
if (typeof window !== 'undefined') window.AUTH = AUTH;   /* [PR-Sync] يقرؤه جسر WS */

/* حالة مؤقتة أثناء إتمام دخول 2FA: { userId, username } */
var _twofaPending = null;

/* ── أدوات مساعدة ── */
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function setAuthMsg(msg, msgEl, isError) {
  if (!msgEl) return;
  msgEl.textContent = msg;
  msgEl.className = 'authmsg' + (isError ? ' err' : ' ok');
}
function roleLabel(role) {
  if (role === 'super') return T('auth.roleSuper');
  if (role === 'admin') return T('auth.roleAdmin');
  return T('auth.roleUser');
}

/* ── شريحة المستخدم في التوب بار ── */
function renderAuthChip() {
  const chip = document.getElementById('authChip');
  const adminNav = document.getElementById('navAdmin');
  if (adminNav) {
    adminNav.style.display = (AUTH.user && AUTH.user.role !== 'user') ? '' : 'none';
  }
  if (!chip) return;
  if (!AUTH.user) {
    chip.innerHTML = '<button class="authbtn" id="authLoginBtn" onclick="openAuthModal()"><i class="fa-solid fa-user" aria-hidden="true"></i> ' + T('auth.login') + '</button>';
    return;
  }
  const u = AUTH.user;
  chip.innerHTML =
    '<div class="acct">' +
      '<button class="uchip" id="userChip" onclick="toggleAcctMenu()" aria-haspopup="menu" aria-expanded="false">' +
        '<span class="uavatar" aria-hidden="true"><i class="fa-solid fa-user" aria-hidden="true"></i></span>' +
      '</button>' +
      '<div class="acct-menu" id="acctMenu" role="menu">' +
        '<div class="acct-head" role="none">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;width:100%">' +
            '<span class="acct-name">' + esc(u.username) + '</span>' +
            '<span class="vip-badge ' + (typeof getVipLevel === 'function' ? getVipLevel(u.gold).badge : '') + '">' +
              (typeof getVipLevel === 'function' ? getVipLevel(u.gold).name : '') +
            '</span>' +
          '</div>' +
          '<span class="acct-balance"><i class="fa-solid fa-coins g" aria-hidden="true"></i> <span id="acctGoldD">' + fmt(u.gold || 0) + '</span></span>' +
        '</div>' +
        '<div class="acct-sep" aria-hidden="true"></div>' +
        /* [i18n] نصوص أزرار القائمة داخل span مع data-i18n — تُعاد ترجمتها عند تغيير اللغة (translateStatic) */
        '<button class="acct-item" role="menuitem" onclick="closeAcctMenu();openTrModal()"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> <span data-i18n="auth.sendBalance">' + T('auth.sendBalance') + '</span></button>' +
        '<button class="acct-item" role="menuitem" onclick="closeAcctMenu();openPwModal()"><i class="fa-solid fa-key" aria-hidden="true"></i> <span data-i18n="auth.changePassword">' + T('auth.changePassword') + '</span></button>' +
        '<button class="acct-item" role="menuitem" onclick="closeAcctMenu();openTransactionHistory()"><i class="fa-solid fa-receipt" aria-hidden="true"></i> <span data-i18n="auth.transactionHistory">' + T('auth.transactionHistory') + '</span></button>' +
        '<button class="acct-item" role="menuitem" onclick="closeAcctMenu();openAccountLog()"><i class="fa-solid fa-user" aria-hidden="true"></i> <span data-i18n="auth.accountLog">' + T('auth.accountLog') + '</span></button>' +
        '<button class="acct-item" role="menuitem" onclick="closeAcctMenu();openSecurity()"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> <span data-i18n="sec.title">' + T('sec.title') + '</span></button>' +
        '<div class="acct-sep" aria-hidden="true"></div>' +
        '<button class="acct-item danger" role="menuitem" onclick="authLogout()"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> <span data-i18n="auth.logout">' + T('auth.logout') + '</span></button>' +
      '</div>' +
    '</div>';
}

/* ── قائمة الحساب المنسدلة (خروج / تغيير كلمة المرور / إرسال) ── */
function toggleAcctMenu() {
  const menu = document.getElementById('acctMenu');
  const btn = document.getElementById('userChip');
  if (!menu) return;
  const open = menu.classList.toggle('open');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeAcctMenu() {
  const menu = document.getElementById('acctMenu');
  const btn = document.getElementById('userChip');
  if (menu) menu.classList.remove('open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/* ── تطبيق بيانات المستخدم من الخادم ── */
function applyAuthUser(user) {
  AUTH.user = user;
  /* توحيد حقل 2FA: الخادم يُرجع twofa_enabled والواجهة تستعمل twofaEnabled */
  if (AUTH.user) AUTH.user.twofaEnabled = !!(AUTH.user.twofaEnabled || AUTH.user.twofa_enabled);
  if (typeof user.gold === 'number') {
    ST.gold = user.gold;
  }
  if (user.lang && user.lang !== ST.lang) {
    ST.lang = user.lang;
    sSet('rc_lang', user.lang);
    if (typeof syncLangDrop === 'function') syncLangDrop();
    applyI18n();
    translateStatic();
    if (typeof renderAll === 'function') renderAll();
  }
  wallet();
  save();
  renderAuthChip();
  /* [2FA-Status] تحديث واجهة 2FA فور وصول حالة المستخدم (authRestore بعد إعادة
     تحميل الصفحة) — وإلا بقي زر «تفعيل 2FA» ظاهراً رغم أنها مفعلة */
  if (typeof window._refresh2faStatus === 'function') {
    try { window._refresh2faStatus(); } catch (e) { /* ignore */ }
  }
  /* تحميل الألعاب المعطلة من الخادم وإعادة رسم الشبكة */
  if (typeof loadDisabledGames === 'function') {
    loadDisabledGames().then(function () {
      if (typeof renderAll === 'function') renderAll();
    });
  }
  AUTH._lastSync = Date.now();
  if (typeof Rooms !== 'undefined' && Rooms.checkPendingRoom) {
    Rooms.checkPendingRoom();
  }
}

/* ── تسجيل الدخول / إنشاء حساب ── */
function authSubmit() {
  /* [Auth] نافذة الدخول للدخول فقط — لا إنشاء حساب (الحسابات عبر المشرفين) */
  authLogin();
}

function authLogin() {
  const uEl = document.getElementById('authUsername');
  const pEl = document.getElementById('authPassword');
  const msg = document.getElementById('authMsg');
  const username = uEl ? uEl.value.trim() : '';
  const password = pEl ? pEl.value : '';
  if (!username || !password) {
    setAuthMsg(T('auth.fill'), msg, true);
    return;
  }
  const submit = document.getElementById('authSubmit');
  if (submit) submit.disabled = true;
  API.post('/api/login', { username: username, password: password }).then(function (r) {
    if (submit) submit.disabled = false;
    if (r.ok && r.data && r.data.user) {
      applyAuthUser(r.data.user);
      closeAuthModal();
      toast(T('auth.welcome') + ' ' + username + ' 👋', 'ok');
    } else if (r.ok && r.data && r.data.twofa_required) {
      /* تسجيل الدخول يتطلب رمز 2FA لإتمامه */
      _twofaPending = { userId: r.data.userId, username: username };
      show2faLogin();
    } else {
      setAuthMsg((r.data && r.data.message) || T('auth.error'), msg, true);
    }
  }).catch(function () {
    if (submit) submit.disabled = false;
    setAuthMsg(T('auth.error'), msg, true);
  });
}

function authRegister() {
  const uEl = document.getElementById('authUsername');
  const pEl = document.getElementById('authPassword');
  const msg = document.getElementById('authMsg');
  const username = uEl ? uEl.value.trim() : '';
  const password = pEl ? pEl.value : '';
  if (!username || !password) {
    setAuthMsg(T('auth.fill'), msg, true);
    return;
  }
  const submit = document.getElementById('authSubmit');
  if (submit) submit.disabled = true;
  API.post('/api/register', { username: username, password: password }).then(function (r) {
    if (submit) submit.disabled = false;
    if (r.ok && r.data && r.data.user) {
      applyAuthUser(r.data.user);
      closeAuthModal();
      toast(T('auth.accountCreated') + ' 🎉', 'ok');
    } else {
      setAuthMsg((r.data && r.data.message) || T('auth.error'), msg, true);
    }
  }).catch(function () {
    if (submit) submit.disabled = false;
    setAuthMsg(T('auth.error'), msg, true);
  });
}

function authLogout() {
  authSyncNow();
  API.post('/api/logout').then(function () {
    AUTH.user = null;
    if (typeof DISABLED === 'object' && DISABLED) DISABLED = {};
    renderAuthChip();
    if (typeof renderAll === 'function') renderAll();
    toast(T('auth.loggedOut'), 'info');
  }).catch(function () {
    AUTH.user = null;
    if (typeof DISABLED === 'object' && DISABLED) DISABLED = {};
    renderAuthChip();
    if (typeof renderAll === 'function') renderAll();
  });
}

/* ── تغيير كلمة المرور ── */
/* [Legal-Fix 2026-09-14] الصفحات القانونية لا تحمّل main.js ولا تحوي
   مودالات الحساب (trModal/pg-account…) — البنود كانت ميتة هناك.
   المعرّفات أدناه تُقيَّم في auth.js (المحمّل في كل مكان): إن وُجدت
   التعريفات الغنية (main.js في الرئيسية) تُستعمل؛ وإلا فتوجيه للرئيسية
   بهاش الهدف حيث تُفتح الميزة فوراً عبر navFromHash. */
function authGoHome(hash) {
  var p = window.location.pathname;
  var onIndex = p === '/' || p === '' || /(^|\/)index\.html$/i.test(p);
  if (onIndex) return false;          /* في الرئيسية: دع التعريف الأصلي يعمل */
  window.location.href = 'index.html#' + hash;
  return true;
}
function openPwModal() {
  if (!AUTH.user) return;
  const m = document.getElementById('pwModal');
  if (!m) { authGoHome('account'); return; }
  setAuthMsg('', document.getElementById('pwMsg'), false);
  const oldEl = document.getElementById('pwOld');
  const newEl = document.getElementById('pwNew');
  if (oldEl) oldEl.value = '';
  if (newEl) newEl.value = '';
  m.classList.add('show');
  if (oldEl) {
    setTimeout(function () { oldEl.focus(); }, 60);
  }
}
function closePwModal() {
  const m = document.getElementById('pwModal');
  if (m) m.classList.remove('show');
}
function pwSubmit() {
  const oldEl = document.getElementById('pwOld');
  const newEl = document.getElementById('pwNew');
  const msg = document.getElementById('pwMsg');
  const oldPassword = oldEl ? oldEl.value : '';
  const newPassword = newEl ? newEl.value : '';
  if (!oldPassword || !newPassword) {
    setAuthMsg(T('auth.pwFill'), msg, true);
    return;
  }
  if (newPassword.length < 6) {
    setAuthMsg(T('auth.pwShort'), msg, true);
    return;
  }
  const submit = document.getElementById('pwSubmitBtn');
  if (submit) submit.disabled = true;
  API.post('/api/change-password', { oldPassword: oldPassword, newPassword: newPassword }).then(function (r) {
    if (submit) submit.disabled = false;
    if (r.ok && r.data && r.data.ok) {
      closePwModal();
      toast((r.data && r.data.message) || T('auth.pwChanged'), 'ok');
    } else {
      setAuthMsg((r.data && r.data.message) || T('auth.error'), msg, true);
    }
  }).catch(function () {
    if (submit) submit.disabled = false;
    setAuthMsg(T('auth.error'), msg, true);
  });
}

/* ── استعادة الجلسة عند التحميل ── */
function authRestore() {
  return API.get('/api/me').then(function (r) {
    if (r.ok && r.data && r.data.user) {
      applyAuthUser(r.data.user);
    } else {
      renderAuthChip();
    }
  }).catch(function () {
    renderAuthChip();
  });
}

/* [Legal-Fix] تعريفات ضمنية للبنود التي تملكها main.js — في الصفحات
   القانونية (بلا main.js) تعرّفها auth.js هنا وتوجّه للرئيسية بالهاش.
   في الرئيسية يُعرّفها main.js لاحقاً فيطغى التعريف الغني (المصادر
   تُحمّل قبل auth.js في index.html؟ لا — main.js يُحمّل بعدها فيطغى). */
if (typeof window.openTrModal === 'undefined') {
  window.openTrModal = function () {
    if (!AUTH.user) { if (typeof toast === 'function') toast(T('tr.needLogin'), 'warn'); return; }
    authGoHome('tr');
  };
}
if (typeof window.openTransactionHistory === 'undefined') {
  window.openTransactionHistory = function () {
    if (!AUTH.user) { if (typeof toast === 'function') toast(T('tr.needLogin'), 'warn'); return; }
    authGoHome('transactions');
  };
}
if (typeof window.openAccountLog === 'undefined') {
  window.openAccountLog = function () {
    if (!AUTH.user) { if (typeof toast === 'function') toast(T('tr.needLogin'), 'warn'); return; }
    authGoHome('account');
  };
}

/* ═══════════ المصادقة الثنائية (2FA) ═══════════ */
/* فتح صفحة الحساب + الكشف عن بطاقة الأمان وتشغيل إعداد 2FA */
function openSecurity() {
  if (!AUTH.user) { toast(T('auth.sessionExpired'), 'warn'); if (typeof openAuthModal === 'function') openAuthModal(); return; }
  /* [Legal-Fix] صفحة قانونية (لا pg-account): وجّه للرئيسية */
  if (!document.getElementById('pg-account')) { authGoHome('account'); return; }
  if (typeof nav === 'function') nav('account', null);
  setTimeout(function () {
    if (typeof init2fa === 'function') init2fa();
    var card = document.getElementById('secCard') || document.getElementById('twofaCard');
    if (card) {
      card.style.display = '';
      try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    }
    var enable = document.getElementById('btnEnable2fa');
    if (enable && typeof enable.focus === 'function') enable.focus();
  }, 160);
}
window.openSecurity = openSecurity;

/* إظهار مودال إدخال رمز 2FA أثناء الدخول — وضع «الدخول»: قفل قسم التفعيل
   وإظهار صندوق رمز الدخول (twofaLoginBox) الذي يبقى مخفياً افتراضياً
   كي لا يزدوج مع حقل رمز التفعيل عند فتح النافذة لغير الدخول */
function show2faLogin() {
  var m = document.getElementById('twofaModal');
  if (!m) { toast(T('auth.error'), 'err'); return; }
  var setup = document.getElementById('twofaSetup');
  var loginBox = document.getElementById('twofaLoginBox');
  var disBtn = document.getElementById('twofaDisable');
  if (setup) setup.style.display = 'none';
  if (loginBox) { loginBox.style.display = ''; loginBox.dataset.loginMode = '1'; }
  if (disBtn) disBtn.style.display = 'none';
  m.classList.add('show');
  var inp = document.getElementById('twofaLoginCode');
  if (inp) setTimeout(function () { inp.focus(); }, 60);
}
window.show2faLogin = show2faLogin;

/* إتمام الدخول بعد إدخال رمز 2FA */
function submit2faLogin() {
  if (!_twofaPending) return;
  var inp = document.getElementById('twofaLoginCode');
  var code = inp ? inp.value.trim() : '';
  if (!code) { toast(T('sec.code') + ' ' + T('rm.required'), 'warn'); return; }
  var pending = _twofaPending;
  API.post('/api/2fa/login', { userId: pending.userId, code: code }).then(function (r) {
    if (!r.ok) { toast((r.data && r.data.message) || T('auth.error'), 'err'); return; }
    var user = r.data && r.data.user;
    if (!user) { toast(T('auth.error'), 'err'); return; }
    /* تخزين الرمز المُعاد إن وُجد */
    if (r.data && r.data.token) {
      try { AUTH.token = r.data.token; localStorage.setItem('rc_token', r.data.token); } catch (e) {}
    }
    _twofaPending = null;
    var m = document.getElementById('twofaModal');
    if (m) m.classList.remove('show');
    if (inp) inp.value = '';
    applyAuthUser(user);
    closeAuthModal();
    toast(T('auth.welcome') + ' ' + pending.username + ' 👋', 'ok');
  });
}
window.submit2faLogin = submit2faLogin;

/* ربط عناصر واجهة 2FA (في pg-account ومودال الدخول) */
function init2fa() {
  if (window._twofaBound) return;
  window._twofaBound = true;

  var enable = document.getElementById('btnEnable2fa');
  var verify = document.getElementById('twofaVerify');
  var codeInput = document.getElementById('twofaCode');
  var status = document.getElementById('twofaStatus');
  var statusLine = document.getElementById('twofaStatusLine');
  var setup = document.getElementById('twofaSetup');
  var secretEl = document.getElementById('twofaSecret');
  var qrEl = document.getElementById('twofaQr');
  var oaEl = document.getElementById('twofaOtpauth');
  var hint = document.getElementById('twofaHint');
  var disable = document.getElementById('twofaDisable');
  var acctDisable = document.getElementById('btnDisable2fa');   /* [2FA-Off] زر التعطيل المرئي بصفحة الحساب */
  var loginVerify = document.getElementById('twofaLoginVerify');
  var loginInp = document.getElementById('twofaLoginCode');

  function refreshStatus() {
    var enabled = !!(AUTH.user && AUTH.user.twofaEnabled);
    if (statusLine) statusLine.textContent = enabled ? T('sec.enabled') : (T('sec.status') + ': —');
    if (enable) enable.style.display = enabled ? 'none' : '';
    if (disable) disable.style.display = enabled ? '' : 'none';
    /* [2FA-Off] صفحة الحساب: زر التعطيل يظهر فقط عند التفعيل — عكس زر التفعيل */
    if (acctDisable) acctDisable.style.display = enabled ? '' : 'none';
    /* [2FA-Modal] الحالة المرئية داخل النافذة: مفعّلة = زر تعطيل + شارة،
       وغير مفعّلة = نموذج التفعيل (QR/سر/رمز) — لا يظهران معاً أبداً */
    if (enabled) {
      if (qrEl) qrEl.style.display = 'none';
      if (secretEl) secretEl.style.display = 'none';
      if (codeInput) codeInput.style.display = 'none';
      if (verify) verify.style.display = 'none';
    }
    if (status) {
      status.style.display = enabled ? '' : 'none';
      status.className = 'twofa-status ok';
      status.innerHTML = '✅ ' + T('sec.enabled');
    }
    /* صندوق رمز الدخول يظهر في وضع الدخول فقط (يضبطه show2faLogin) */
    var loginBox = document.getElementById('twofaLoginBox');
    if (loginBox && loginBox.style.display !== 'none' && !loginBox.dataset.loginMode) {
      loginBox.style.display = 'none';
    }
  }
  window._refresh2faStatus = refreshStatus;

  /* تفعيل 2FA: فتح المودال + جلب السر/QR ثم إظهار قسم إدخال الرمز */
  if (enable) enable.addEventListener('click', function () {
    if (!AUTH.user) { toast(T('auth.sessionExpired'), 'warn'); if (typeof openAuthModal === 'function') openAuthModal(); return; }
    if (AUTH.user.twofaEnabled) { if (typeof openTwofaModal === 'function') openTwofaModal(); return; }
    openTwofaModal();
    /* وضع التفعيل: قسم الإعداد ظاهر وصندوق الدخول مخفي */
    var loginBox0 = document.getElementById('twofaLoginBox');
    if (loginBox0) { loginBox0.style.display = 'none'; delete loginBox0.dataset.loginMode; }
    if (setup) setup.style.display = '';
    if (status) { status.textContent = ''; status.className = 'authmsg'; status.style.display = ''; }
    API.post('/api/2fa/enable', {}).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.message) || T('auth.error'), 'err'); return; }
      var secret = (r.data && r.data.secret) || '';
      var otpauth = (r.data && r.data.otpauth) || '';
      /* [v2.45.1-FIX] رمز otpauth كان يُرسَل لـapi.qrserver.com ⇒ يُكشف سرّ 2FA لطرف ثالث.
         الآن يُولَّد محلياً كـSVG داخل data: (محمي بـCSP: img-src data:) */
      if (qrEl) {
        var qsvg = '';
        try { if (typeof QRMini !== 'undefined') qsvg = QRMini.svg(otpauth, { ecc: 'M', size: 200, margin: 2 }); } catch (e) { qsvg = ''; }
        if (qsvg) { qrEl.style.display = ''; qrEl.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qsvg); }
        else { qrEl.style.display = 'none'; }
      }
      if (secretEl) { secretEl.style.display = ''; secretEl.textContent = secret; }
      if (oaEl) oaEl.textContent = otpauth;
      if (codeInput) { codeInput.style.display = ''; codeInput.value = ''; codeInput.focus(); }
      if (verify) verify.style.display = '';
      if (hint) hint.textContent = T('sec.qrHint');
      if (setup) setup.style.display = '';
    });
  });

  /* التحقق من الرمز → تفعيل 2FA */
  if (verify) verify.addEventListener('click', function () {
    var code = codeInput ? codeInput.value.trim() : '';
    if (!code) { toast(T('sec.code') + ' ' + T('rm.required'), 'warn'); return; }
    API.post('/api/2fa/verify', { code: code }).then(function (r) {
      if (!r.ok) {
        var msg = (r.data && (r.data.message || r.data.error)) || T('auth.error');
        if (status) { status.textContent = msg; status.className = 'authmsg err'; status.style.display = ''; }
        toast(msg, 'err');
        return;
      }
      if (AUTH.user) AUTH.user.twofaEnabled = true;
      if (codeInput) codeInput.value = '';
      refreshStatus();
      toast(T('sec.enabled'), 'ok');
    });
  });

  /* تعطيل 2FA (يتطلب كلمة المرور) */
  function disable2faFlow() {
    if (!AUTH.user || !AUTH.user.twofaEnabled) return;
    var pwd = window.prompt(T('sec.disable2faPwd') || 'كلمة المرور (لتعطيل 2FA)');
    if (pwd == null) return;
    API.post('/api/2fa/disable', { password: pwd }).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.message) || T('auth.error'), 'err'); return; }
      if (AUTH.user) AUTH.user.twofaEnabled = false;
      refreshStatus();
      toast(T('sec.disable2fa') + ' ✔', 'ok');
    });
  }
  if (disable) disable.addEventListener('click', disable2faFlow);
  /* [2FA-Off] زر التعطيل المرئي بصفحة الحساب — نفس مسار زر المودال */
  if (acctDisable) acctDisable.addEventListener('click', disable2faFlow);

  if (loginVerify) loginVerify.addEventListener('click', submit2faLogin);
  if (loginInp) loginInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit2faLogin(); });

  refreshStatus();
}
window.init2fa = init2fa;

function openTwofaModal() {
  var m = document.getElementById('twofaModal');
  if (m) m.classList.add('show');
}
window.openTwofaModal = openTwofaModal;

function closeTwofaModal() {
  var m = document.getElementById('twofaModal');
  if (m) m.classList.remove('show');
  /* [2FA-Modal] إنهاء وضع الدخول: صندوق رمز الدخول يعود مخفياً كي لا يزدوج
     مع نموذج التفعيل عند فتح النافذة لاحقاً من صفحة الحساب */
  var loginBox = document.getElementById('twofaLoginBox');
  if (loginBox) { loginBox.style.display = 'none'; delete loginBox.dataset.loginMode; }
}
window.closeTwofaModal = closeTwofaModal;

/* ── معالجة انتهاء الجلسة (401) ── */
function authHandle401() {
  if (AUTH.user) {
    AUTH.user = null;
    if (typeof DISABLED === 'object' && DISABLED) DISABLED = {};
    renderAuthChip();
    if (typeof renderAll === 'function') renderAll();
    toast(T('auth.sessionExpired'), 'warn');
  }
}

/* ── مزامنة الرصيد التلقائية ── */
function authSync() {
  if (!AUTH.user) return;
  const now = Date.now();
  if (now - AUTH._lastSync < 5000) return;
  AUTH._lastSync = now;
  /* [v2.44-MONEY] نرسل الرصيد مع مرجع الخادم (gold_rev): الخادم يقبل رصيد العميل فقط
     إن لم يتغيّر مرجعه (أي لا شحن/تعديل خادمي جديد) ⇒ لا يمكن لعميل قديم أن يطمس شحناً.
     وإن ردّ الخادم رصيداً مختلفاً (شحن مُعتمد) نتبنّاه فوراً. */
  return API.post('/api/sync', { gold: ST.gold, lang: ST.lang, gold_rev: (typeof window.GOLD_REV === 'number' ? window.GOLD_REV : undefined) })
    .then(function (r) {
      if (r && r.ok && typeof r.gold === 'number') {
        if (typeof r.gold_rev === 'number') window.GOLD_REV = r.gold_rev;
        if (r.gold !== ST.gold) { ST.gold = r.gold; if (AUTH.user) AUTH.user.gold = r.gold; try { if (typeof wallet === 'function') wallet(); } catch (e) {} try { save(); } catch (e) {} }
      }
      return r;
    }).catch(function () {});
}
function authSyncNow() {
  if (!AUTH.user) return;
  AUTH._lastSync = 0;
  return authSync();
}

/* ── المودال ── */
function openAuthModal() {
  if (AUTH.user) return;
  const m = document.getElementById('authModal');
  if (!m) return;
  m.classList.add('show');
  authTab('login');
  const uEl = document.getElementById('authUsername');
  if (uEl) {
    setTimeout(function () { uEl.focus(); }, 60);
  }
}
function closeAuthModal() {
  const m = document.getElementById('authModal');
  if (m) m.classList.remove('show');
}
function authTab(tab) {
  const btns = document.querySelectorAll('#authModal .atab');
  btns.forEach(function (b) { b.classList.remove('active'); });
  const btn = document.querySelector('#authModal .atab[data-auth-tab="' + tab + '"]');
  if (btn) btn.classList.add('active');
  const title = document.getElementById('authTitle');
  const submit = document.getElementById('authSubmit');
  const msg = document.getElementById('authMsg');
  if (title) title.textContent = T(tab === 'login' ? 'auth.login' : 'auth.register');
  if (submit) submit.textContent = T(tab === 'login' ? 'auth.submitLogin' : 'auth.submitRegister');
  if (msg) msg.textContent = '';
  const form = document.getElementById('authForm');
  if (form) form.setAttribute('data-mode', tab);
}

/* ── مزامنة عند مغادرة الصفحة ── */
if (typeof document !== 'undefined') {
  /* إغلاق القوائم المنسدلة عند النقر خارجها */
  document.addEventListener('click', function (e) {
    const menu = document.getElementById('acctMenu');
    if (menu && menu.classList.contains('open')) {
      const acct = menu.closest('.acct');
      if (!acct || !acct.contains(e.target)) closeAcctMenu();
    }
    if (typeof closeLangMenu === 'function') closeLangMenu(e);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeAcctMenu();
      closePwModal();
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') authSyncNow();
  });
  window.addEventListener('beforeunload', function () {
    if (AUTH.user) {
      try {
        /* [v2.42-Bugfix] API_BASE_URL نص فقط (كان قد يكون Promise ⇒ [object Promise]/api/sync) */
        fetch(((typeof window.API_BASE_URL === 'string' && window.API_BASE_URL) ||
          (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(location.hostname) ? location.origin :
            (/(^|\.)dmgames\.pages\.dev$|(^|\.)dtsg\.pages\.dev$/.test(location.hostname) ? 'https://casino-api.dmgames-api.workers.dev' : 'https://casino-api.tarikc.workers.dev'))) + '/api/sync', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gold: ST.gold, lang: ST.lang }),
          keepalive: true
        });
      } catch (e) { /* ignore */ }
    }
  });
}

/* ربط واجهة 2FA عند جاهزية DOM (إن وُجدت عناصرها في الصفحة) */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof init2fa === 'function') init2fa();
  });
}
