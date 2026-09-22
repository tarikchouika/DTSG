/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — مركز المساعدة العائم (ودجت الشات) — [v2.42]
   ───────────────────────────────────────────────────────────────────────────
   يستبدل أيقونة واتساب العائمة السابقة. وظيفته: ربط المستخدم مباشرة بـ:
     1) بوت خدمة العملاء  (تذاكر، ردود الفريق) — محادثة حقيقية من داخل المنصة
     2) بوت الشحن والمدفوعات (روابط + حالة آخر معاملة + شحن الرصيد)
   المبدأ: نفس التذاكر ونفس الحساب — ما يكتبه المستخدم هنا يصله في تيليغرام
   وما يرد به الأدمن في البوت يظهر هنا. (الخصوصية: لا يكشف الهويات.)
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
(function () {
  if (window.__dtsgBotChat) return;
  window.__dtsgBotChat = 1;

  var SUPPORT_BOT = 'https://t.me/dtsgsupports_bot';
  /* [v2.47] بوت أكواد التعبئة (@dtsgvoucher_bot) — وصول سريع من المنصة.
     الرابط يحمل معرّف المستخدم (/start plt_<id>) فيربط حسابه تلقائياً داخل البوت. */
  var VOUCHER_BOT = 'https://t.me/dtsgvoucher_bot';
  var POLL_MS = 9000;

  function myUid() {
    try { return (window.AUTH && AUTH.user && AUTH.user.id) ? String(AUTH.user.id) : ''; } catch (e) { return ''; }
  }
  function voucherUrl() {
    var u = myUid();
    return VOUCHER_BOT + (u ? ('?start=plt_' + encodeURIComponent(u)) : '');
  }

  function L(key, fallback) {
    try {
      if (typeof T === 'function' && typeof TR !== 'undefined' && TR[key]) return T(key);
    } catch (e) { }
    return fallback;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function base() {
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(location.hostname)) return Promise.resolve(location.origin);
    return fetch('/api-url2.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) { return (c && c.url) || location.origin; })
      .catch(function () { return location.origin; });
  }
  function api(path, method, body) {
    return base().then(function (b) {
      return fetch(b + path, {
        method: method || 'GET', credentials: 'include',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      }).then(function (r) {
        return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; })
          .then(function (j) { j.status = r.status; return j; });
      }).catch(function (e) { return { ok: false, error: 'network', detail: String(e) }; });
    });
  }
  function fmtTime(ts) {
    try { return new Date(ts).toISOString().slice(11, 16); } catch (e) { return ''; }
  }

  /* ── البناء ── */
  var html =
    '<button id="botFab" type="button" aria-label="' + esc(L('bc.title', 'مركز المساعدة')) + '" aria-expanded="false" aria-controls="botChat">' +
    '<i class="fa-solid fa-comment-dots" aria-hidden="true"></i>' +
    '<span class="botfab-dot" id="botFabDot" hidden></span>' +
    '</button>' +
    '<section id="botChat" class="botchat" role="dialog" aria-modal="false" aria-label="' + esc(L('bc.title', 'مركز المساعدة')) + '" hidden>' +
    '<header class="bc-head">' +
    '<img class="bc-ava" src="assets/dtsg/support-bot-avatar.jpg" alt="" onerror="this.style.display=\'none\'">' +
    '<div class="bc-ht"><b>' + esc(L('bc.title', 'مركز المساعدة DTSG')) + '</b>' +
    '<span id="bcState">' + esc(L('bc.sub', 'الدعم والمدفوعات في مكان واحد')) + '</span></div>' +
    '<a class="bc-ic" id="bcExt" href="' + SUPPORT_BOT + '" target="_blank" rel="noopener" title="' + esc(L('bc.openTg', 'فتح في تيليغرام')) + '" aria-label="' + esc(L('bc.openTg', 'فتح في تيليغرام')) + '"><i class="fa-brands fa-telegram" aria-hidden="true"></i></a>' +
    '<button class="bc-ic" id="bcClose" type="button" aria-label="' + esc(L('bc.close', 'إغلاق')) + '"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
    '</header>' +
    '<div class="bc-tabs" role="tablist">' +
    '<button class="bc-tab active" data-bctab="chat" role="tab" aria-selected="true" type="button"><i class="fa-solid fa-comments" aria-hidden="true"></i> ' + esc(L('bc.tabChat', 'محادثة الدعم')) + '</button>' +
    '<button class="bc-tab" data-bctab="bots" role="tab" aria-selected="false" type="button"><i class="fa-solid fa-wallet" aria-hidden="true"></i> ' + esc(L('bc.tabPay', 'الشحن والمدفوعات')) + '</button>' +
    '</div>' +
    '<div class="bc-body" id="bcPaneChat" role="tabpanel">' +
    '<div class="bc-msgs" id="bcMsgs" aria-live="polite"></div>' +
    '<div class="bc-quick" id="bcQuick">' +
    '<button type="button" class="bc-chip" data-q="deposit"><i class="fa-solid fa-circle-plus" aria-hidden="true"></i> ' + esc(L('bc.qDeposit', 'شحن الرصيد')) + '</button>' +
    '<button type="button" class="bc-chip" data-q="last"><i class="fa-solid fa-receipt" aria-hidden="true"></i> ' + esc(L('bc.qLast', 'حالة آخر معاملة')) + '</button>' +
    '<button type="button" class="bc-chip" data-q="private-link"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ' + esc(L('bc.qPrivateLink', 'ربط بوت الدردشة الخاص')) + '</button>' +
    '</div>' +
    '<form class="bc-in" id="bcForm" autocomplete="off">' +
    '<input id="bcInput" type="text" maxlength="1000" placeholder="' + esc(L('bc.ph', 'اكتب رسالتك لفريق الدعم…')) + '" aria-label="' + esc(L('bc.ph', 'اكتب رسالتك لفريق الدعم…')) + '">' +
    '<button type="submit" aria-label="' + esc(L('bc.send', 'إرسال')) + '"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>' +
    '</form>' +
    '</div>' +
    '<div class="bc-body bc-pane-pay" id="bcPaneBots" role="tabpanel" hidden>' +
    '<a class="bc-card" data-bcsupport="1" href="' + SUPPORT_BOT + '" target="_blank" rel="noopener">' +
    '<span class="bc-cic"><i class="fa-brands fa-telegram" aria-hidden="true"></i></span>' +
    '<span><b>' + esc(L('bc.cardSupport', 'بوت خدمة العملاء')) + '</b><small>' + esc(L('bc.cardSupportSub', 'تذاكر وردود الفريق — @dtsgsupports_bot')) + '</small></span>' +
    '<i class="fa-solid fa-chevron-left bc-go" aria-hidden="true"></i></a>' +
    /* بوت الدردشة الخاص: لا نضع معرف البوت أو كود الربط في HTML ثابت؛ ينشئ الخادم
       رابطاً أحادي الاستخدام بعد التحقق من جلسة المستخدم. */
    '<div class="bc-card lead" id="bcPrivateChatLink" data-q="private-link" role="button" tabindex="0">' +
    '<span class="bc-cic"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span>' +
    '<span><b>' + esc(L('bc.cardPrivate', 'بوت الدردشة الخاص')) + '</b><small>' + esc(L('bc.cardPrivateSub', 'اربط حسابك بأمان — محادثاتك لا تظهر للزوار')) + '</small></span>' +
    '<i class="fa-solid fa-chevron-left bc-go" aria-hidden="true"></i></div>' +
    /* [v2.47] بطاقة بوت أكواد التعبئة — دمج بوت الفوتشير في مركز المساعدة (طلب المالك):
       وصول سريع من المنصة، والرابط يربط حساب المستخدم تلقائياً (plt_<id>). */
    '<a class="bc-card" id="bcVoucher" href="' + voucherUrl() + '" target="_blank" rel="noopener" data-bcvoucher="1">' +
    '<span class="bc-cic gold"><i class="fa-solid fa-ticket" aria-hidden="true"></i></span>' +
    '<span><b>' + esc(L('bc.cardVoucher', 'بوت أكواد التعبئة')) + '</b><small>' + esc(L('bc.cardVoucherSub', 'اشترِ كود تعبئة — يصلك الكود بعد مصادقة الإدارة')) + '</small></span>' +
    '<i class="fa-solid fa-chevron-left bc-go" aria-hidden="true"></i></a>' +
    '<a class="bc-card" href="#wallet" data-bcwallet="1">' +
    '<span class="bc-cic gold"><i class="fa-solid fa-coins" aria-hidden="true"></i></span>' +
    '<span><b>' + esc(L('bc.cardWallet', 'المحفظة — شحن وسحب')) + '</b><small>' + esc(L('bc.cardWalletSub', 'Binance · CIH · Cash Plus · كوبونات')) + '</small></span>' +
    '<i class="fa-solid fa-chevron-left bc-go" aria-hidden="true"></i></a>' +
    '<div class="bc-card lead" data-q="last" role="button" tabindex="0">' +
    '<span class="bc-cic"><i class="fa-solid fa-magnifying-glass-dollar" aria-hidden="true"></i></span>' +
    '<span><b>' + esc(L('bc.cardStatus', 'تتبّع معاملة')) + '</b><small>' + esc(L('bc.cardStatusSub', 'اعرف حالة إيداعك أو سحبك فوراً')) + '</small></span>' +
    '<i class="fa-solid fa-chevron-left bc-go" aria-hidden="true"></i></div>' +
    '<p class="bc-note">' + esc(L('bc.note', 'كل رسالة هنا تُسجَّل في تذكرة واحدة يراها فريق الدعم في تيليغرام — وإن ربطت حسابك تصلك الردود على البوت أيضاً.')) + '</p>' +
    '</div>' +
    '</section>';

  function mount() {
    if (document.getElementById('botFab')) return;
    document.body.insertAdjacentHTML('beforeend', html);
    bind();
    /* [v2.42] لا طلب في الإقلاع بلا جلسة معروفة (يمنع 401 لكل زائر) */
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (knownSession()) { clearInterval(t); refresh(); }
      else if (tries >= 12) { clearInterval(t); }   /* 6 ثوانٍ */
    }, 500);
    if (sessionStorage.getItem('rc_botchat_open') === '1') open(true);
  }

  var STATE = { open: false, logged: null, tickets: [], busy: false, timer: null, seen: 0 };

  function el(id) { return document.getElementById(id); }
  /* [v2.47] رابط بوت أكواد التعبئة يُحدَّث بحسب الجلسة (قد تُعرف بعد بناء الواجهة) */
  function syncVoucher() {
    var a = el('bcVoucher');
    if (a) a.setAttribute('href', voucherUrl());
  }
  /* [v2.42] هل الجلسة معروفة محلياً؟ (يمنع طلباً بلا جلسة ⇒ خطأ 401 في الكونسول لكل زائر)
     AUTH.user يُضبط بعد authRestore في المنصة وفي الصفحات القانونية معاً. */
  function knownSession() {
    try { return !!(window.AUTH && window.AUTH.user); } catch (e) { return false; }
  }

  function open(silent) {
    STATE.open = true;
    el('botFab').setAttribute('aria-expanded', 'true');
    el('botChat').hidden = false;
    syncVoucher();                                   /* [v2.47] رابط بوت أكواد التعبئة بمعرّف المستخدم */
    try { sessionStorage.setItem('rc_botchat_open', '1'); } catch (e) { }
    if (!silent) { el('botFab').classList.remove('pulse'); }
    el('botFabDot').hidden = true;
    refresh(true);                                   /* بفعل المستخدم: اسمح بالطلب حتى لو لم تُحسم الجلسة بعد */
    refresh();                                       /* تحديث خلفي إن كانت الجلسة معروفة */
    STATE.timer = setInterval(function () { refresh(true); }, POLL_MS);
  }
  function close() {
    STATE.open = false;
    el('botFab').setAttribute('aria-expanded', 'false');
    el('botChat').hidden = true;
    try { sessionStorage.setItem('rc_botchat_open', '0'); } catch (e) { }
    if (STATE.timer) { clearInterval(STATE.timer); STATE.timer = null; }
  }
  function toggle() { STATE.open ? close() : open(); }

  function bubble(htmlStr, cls) {
    var box = el('bcMsgs');
    box.insertAdjacentHTML('beforeend', '<div class="bc-b ' + (cls || '') + '">' + htmlStr + '</div>');
    box.scrollTop = box.scrollHeight;
  }

  function renderTickets() {
    var box = el('bcMsgs');
    if (STATE.logged === false) {
      box.innerHTML = '<div class="bc-empty"><i class="fa-solid fa-lock" aria-hidden="true"></i><b>' +
        esc(L('bc.login', 'سجّل الدخول لبدء محادثة الدعم')) + '</b>' +
        '<span>' + esc(L('bc.loginSub', 'الدعم مرتبط بحسابك في المنصة — والردود تصلك هنا وفي تيليغرام.')) + '</span>' +
        '<button type="button" class="bc-btn" id="bcLogin">' + esc(L('bc.loginBtn', 'تسجيل الدخول')) + '</button></div>';
      var lg = el('bcLogin');
      if (lg) lg.onclick = function () {
        try { if (typeof openAuth === 'function') { openAuth(); return; } } catch (e) { }
        location.href = 'index.html';
      };
      return;
    }
    var tk = STATE.tickets && STATE.tickets[0];
    if (!tk) {
      box.innerHTML = '<div class="bc-hello"><b>' + esc(L('bc.hi', 'مرحباً 👋')) + '</b><span>' +
        esc(L('bc.hiSub', 'اكتب مشكلتك أو سؤالك هنا — تُفتح تذكرة ويصلك رد الفريق في هذه النافذة.')) + '</span></div>';
      return;
    }
    var head = '<div class="bc-th">' + esc(L('bc.ticket', 'تذكرة')) + ' #' + tk.id + ' · ' +
      esc(tk.status === 'open' ? L('bc.stOpen', 'مفتوحة') : tk.status === 'claimed' ? L('bc.stClaimed', 'قيد المعالجة') : L('bc.stClosed', 'مغلقة')) +
      ' <span class="bc-cat">' + esc(tk.category || '') + '</span></div>';
    var msgs = (tk.messages || []).map(function (m) {
      return '<div class="bc-b ' + (m.from === 'me' ? 'me' : 'sup') + '"><b>' +
        esc(m.from === 'me' ? L('bc.you', 'أنت') : (m.name || L('bc.support', 'فريق الدعم'))) + '</b>' +
        '<span class="t">' + fmtTime(m.ts) + '</span><br>' + esc(m.text) + '</div>';
    }).join('');
    box.innerHTML = head + msgs;
    box.scrollTop = box.scrollHeight;
  }

  function refresh(force) {
    if (!force && !knownSession()) {
      STATE.logged = false; STATE.tickets = [];
      renderTickets();
      el('bcState').textContent = L('bc.offline', 'سجّل الدخول للتواصل');
      return;
    }
    if (STATE.busy) return;
    STATE.busy = true;
    api('/api/support/status').then(function (j) {
      STATE.busy = false;
      if (j.status === 401 || j.error === 'unauthorized') { STATE.logged = false; renderTickets(); el('bcState').textContent = L('bc.offline', 'سجّل الدخول للتواصل'); return; }
      STATE.logged = true;
      STATE.tickets = j.tickets || [];
      var linked = !!j.linked;
      el('bcState').innerHTML = linked
        ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> ' + esc(L('bc.linked', 'حسابك مرتبط — الردود تصلك هنا وفي تيليغرام'))
        : '<i class="fa-solid fa-circle-info" aria-hidden="true"></i> ' + esc(L('bc.notLinked', 'الردود تظهر هنا — اربط تيليغرام لإشعارات المدفوعات'));
      var count = 0;
      (STATE.tickets || []).forEach(function (t) { count += (t.messages || []).filter(function (m) { return m.from !== 'me'; }).length; });
      if (!STATE.open && count > STATE.seen) { el('botFabDot').hidden = false; el('botFab').classList.add('pulse'); }
      if (STATE.open) { renderTickets(); STATE.seen = count; }
    }).catch(function () { STATE.busy = false; });
  }

  function switchTab(t) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-bctab]'), function (x) {
      var on = x.getAttribute('data-bctab') === t;
      x.classList.toggle('active', on);
      x.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var cp = el('bcPaneChat');
    var bp = el('bcPaneBots');
    if (cp) cp.hidden = (t !== 'chat');
    if (bp) bp.hidden = (t !== 'bots');
  }

  function openUserWallet() {
    close();
    try {
      if (typeof window.openWallet === 'function') { window.openWallet(); return; }
      if (typeof openWallet === 'function') { openWallet(); return; }
    } catch (e) { }
    try {
      var b = document.getElementById('walletBtn');
      if (b) { b.click(); return; }
    } catch (e) { }
    try { if (typeof nav === 'function') { nav('home', null); } } catch (e) { }
    location.hash = '#wallet';
  }

  function send(text) {
    text = String(text || '').trim();
    if (!text) return;
    if (STATE.logged === false) { refresh(); return; }
    var low = text.toLowerCase();
    if (low === '/account' || low === '/last' || low === '/tx' || low === '/معاملات' || low === '/رصيد' || low === '/status') {
      quick('last');
      return;
    }
    if (low === '/deposit' || low === '/شحن' || low === '/wallet' || low === '/محفظة') {
      quick('deposit');
      return;
    }
    if (low === '/link' || low === '/ربط') {
      quick('link');
      return;
    }
    bubble('<b>' + esc(L('bc.you', 'أنت')) + '</b><span class="t">' + fmtTime(Date.now()) + '</span><br>' + esc(text), 'me');
    api('/api/support/message', 'POST', { text: text }).then(function (j) {
      if (!j.ok) {
        var msg = j.error === 'too-many' ? L('bc.slow', 'رسائل كثيرة — انتظر دقيقة.')
          : j.error === 'blocked' ? L('bc.blocked', 'الحساب موقوف عن المراسلة.')
            : j.status === 401 ? L('bc.needLogin', 'سجّل الدخول أولاً.')
              : L('bc.fail', 'تعذّر الإرسال — حاول مجدداً.');
        bubble('<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ' + esc(msg), 'err');
        return;
      }
      refresh(true);
    });
  }

  function renderTx(j) {
    if (!j || !j.ok) { bubble(esc(L('bc.noTx', 'لا توجد معاملات بعد — أو سجّل الدخول.')), 'sys'); return; }
    var txs = (j.transactions || []).slice(0, 3);
    var balUsd = (j.balance_usd != null && !isNaN(j.balance_usd)) ? Number(j.balance_usd).toFixed(2) + ' $' : '';
    var balCoins = (j.coins != null && !isNaN(j.coins)) ? Number(j.coins).toLocaleString('ar-MA') + ' 🪙' : '';
    var balStr = (balCoins || balUsd) ? (balCoins + (balUsd ? ' (' + balUsd + ')' : '')) : '';

    if (!txs.length) {
      bubble('<div class="bc-tx-box">' +
        '<div class="bc-tx-head"><span class="bc-tx-title"><b>📋 ' + esc(L('bc.lastTx', 'آخر معاملاتك')) + '</b></span>' +
        (balStr ? ('<span class="bc-tx-bal">' + esc(balStr) + '</span>') : '') +
        '</div><div class="bc-note">' + esc(L('bc.noTx', 'لا توجد معاملات بعد.')) + '</div></div>', 'sys');
      return;
    }

    var methodLabels = {
      binance_readonly: '⚡ Binance Pay',
      binance_pay: '🟡 Binance Pay',
      binance: '🟡 Binance TRC20',
      cash_plus: '💵 Cash Plus',
      cih: '🏦 CIH Bank',
      orange_money: '🟠 Orange Money',
      voucher: '🎟️ كوبون'
    };

    var listHtml = txs.map(function (t) {
      var isDep = (t.type === 'deposit');
      var typeCls = isDep ? 'dep' : 'wd';
      var typeIc = isDep ? '<i class="fa-solid fa-arrow-down" aria-hidden="true"></i>' : '<i class="fa-solid fa-arrow-up" aria-hidden="true"></i>';
      var typeText = isDep ? (L('bc.dep', 'إيداع')) : (L('bc.wd', 'سحب'));
      var amtPrefix = isDep ? '+' : '-';
      var amtStr = (t.amount_usd != null && !isNaN(t.amount_usd)) ? (amtPrefix + Number(t.amount_usd).toFixed(2) + ' $') : '';

      var stKey = String(t.status || 'pending').toLowerCase();
      var stCls = (stKey === 'completed') ? 'st-completed' : (stKey === 'rejected' || stKey === 'failed') ? 'st-rejected' : 'st-pending';
      var stLabel = (stKey === 'completed') ? (L('bc.stDone', 'مكتمل') + ' ✅') :
                    (stKey === 'rejected') ? (L('bc.stRej', 'مرفوض') + ' ❌') :
                    (stKey === 'failed') ? (L('bc.stFail', 'فشل') + ' ❌') :
                    (L('bc.stPend', 'قيد المراجعة') + ' ⏳');

      var mLabel = methodLabels[t.method] || t.method || '-';
      var rawId = String(t.id || '');
      var txId = esc(rawId);

      return '<div class="bc-tx-item">' +
        '<div class="bc-tx-row1">' +
          '<span class="bc-tx-type ' + typeCls + '">' + typeIc + ' ' + esc(typeText) + '</span>' +
          (amtStr ? ('<span class="bc-tx-amount">' + esc(amtStr) + '</span>') : '') +
          '<span class="bc-tx-badge ' + stCls + '">' + esc(stLabel) + '</span>' +
        '</div>' +
        '<div class="bc-tx-row2">' +
          '<span class="bc-tx-method">' + esc(mLabel) + '</span>' +
          '<span class="bc-tx-id" title="' + txId + '">' + txId + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    var fullHtml = '<div class="bc-tx-box">' +
      '<div class="bc-tx-head">' +
        '<span class="bc-tx-title"><b>📋 ' + esc(L('bc.lastTx', 'آخر معاملاتك')) + '</b></span>' +
        (balStr ? ('<span class="bc-tx-bal">' + esc(balStr) + '</span>') : '') +
      '</div>' +
      '<div class="bc-tx-list">' + listHtml + '</div>' +
      '<div class="bc-tx-hint">' + esc(L('bc.pendingHint', '«قيد المعالجة» تعني أن الفريق يراجعها — يصلك إشعار عند التأكيد.')) + '</div>' +
    '</div>';

    bubble(fullHtml, 'sys');
  }

  function quick(q) {
    if (q === 'deposit') {
      openUserWallet();
      return;
    }
    if (q === 'last') {
      switchTab('chat');
      bubble('<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ' + esc(L('bc.loading', 'جارٍ الجلب…')), 'sys');
      /* [v2.42] نمرّر معرّف المستخدم — المسار يرفض الطلب بلا user_id (bad-input) */
      var uid = null;
      try { uid = (window.AUTH && window.AUTH.user && window.AUTH.user.id) || null; } catch (e) { }
      if (!uid && STATE.tickets && STATE.tickets[0]) uid = STATE.tickets[0].user_id || null;
      if (!uid) {
        api('/api/me').then(function (m) {
          var u2 = (m && m.ok && m.user && m.user.id) ? m.user.id : null;
          if (!u2) { bubble(esc(L('bc.noTx', 'لا توجد معاملات بعد — أو سجّل الدخول.')), 'sys'); return; }
          api('/api/wallet/balance?user_id=' + encodeURIComponent(u2)).then(renderTx);
        });
        return;
      }
      api('/api/wallet/balance' + (uid ? ('?user_id=' + encodeURIComponent(uid)) : '')).then(function (j) {
        if (!j.ok) { bubble(esc(L('bc.noTx', 'لا توجد معاملات بعد — أو سجّل الدخول.')) , 'sys'); return; }
        renderTx(j);
      });
      return;
    }
    if (q === 'private-link' || q === 'link') {
      switchTab('chat');
      bubble('<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ' + esc(L('bc.linkLoading', 'جارٍ إنشاء رابط آمن لمرة واحدة…')), 'sys');
      api('/api/private-chat/link', 'POST', {}).then(function (j) {
        if (!j.ok) {
          bubble('<i class="fa-solid fa-lock" aria-hidden="true"></i> ' + esc(j.status === 401 ? L('bc.needLogin', 'سجّل الدخول أولاً.') : L('bc.linkFail', 'تعذّر إنشاء رابط الربط — حاول مجدداً.')), 'err');
          return;
        }
        bubble('<b>' + esc(L('bc.linkTitle', 'اربط حسابك ببوت الدردشة الخاص')) + '</b><br>' +
          esc(L('bc.linkSub', 'الرابط خاص بحسابك ويُستخدم مرة واحدة خلال 15 دقيقة. لا تشاركه مع أي شخص:')) +
          '<div class="bc-cta"><a class="bc-btn" href="' + esc(j.url) + '" target="_blank" rel="noopener">' +
          '<i class="fa-brands fa-telegram" aria-hidden="true"></i> ' + esc(L('bc.openBot', 'افتح بوت الدردشة')) + '</a>' +
          '<span class="bc-safe-note"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ' + esc(j.bot || 'بوت خاص') + '</span></div>', 'sys');
      });
    }
  }

  function bind() {
    el('botFab').addEventListener('click', toggle);
    el('bcClose').addEventListener('click', close);
    el('bcForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var i = el('bcInput'); send(i.value); i.value = '';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-bctab]'), function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-bctab');
        switchTab(t);
      });
    });
    document.addEventListener('click', function (e) {
      /* [v2.55] بوت خدمة العملاء الرسمي */
      var sb = e.target.closest ? e.target.closest('[data-bcsupport]') : null;
      if (sb) {
        e.preventDefault();
        window.open(SUPPORT_BOT, '_blank', 'noopener,noreferrer');
        return;
      }
      /* [v2.47] بطاقة بوت أكواد التعبئة: نُحدّث الرابط بمعرّف المستخدم قبل الفتح */
      var v = e.target.closest ? e.target.closest('[data-bcvoucher]') : null;
      if (v) {
        e.preventDefault();
        syncVoucher();
        var url = voucherUrl();
        if (!myUid()) {
          switchTab('chat');
          bubble(esc(L('bc.cardVoucherLogin', 'سجّل الدخول أولاً ليتعرّف البوت على حسابك تلقائياً — أو اربطه بكود /start من الرسالة.')), 'sys');
        }
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      /* [v2.55] فتح المحفظة الرسمي الموثوق من الشات */
      var w = e.target.closest ? e.target.closest('[data-bcwallet]') : null;
      if (w) {
        e.preventDefault();
        openUserWallet();
        return;
      }
      /* [v2.55] روابط الأكشن السريعة */
      var q = e.target.closest ? e.target.closest('[data-q]') : null;
      if (q) {
        e.preventDefault();
        quick(q.getAttribute('data-q'));
        return;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && STATE.open) close();
      /* بطاقات البوتات لها role=button أيضاً؛ فعّلها من لوحة المفاتيح */
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.closest) {
        var action = e.target.closest('[data-q]');
        if (action) {
          e.preventDefault();
          quick(action.getAttribute('data-q'));
        }
      }
    });
  }

  /* إعادة البناء عند تغيير اللغة (النصوص تُبنى مرّة واحدة) */
  function rebuild() {
    var f = el('botFab'), c = el('botChat');
    if (f && f.parentNode) f.parentNode.removeChild(f);
    if (c && c.parentNode) c.parentNode.removeChild(c);
    if (STATE.timer) { clearInterval(STATE.timer); STATE.timer = null; }
    STATE.open = false;
    mount();
  }
  function wrapSetLang() {
    try {
      if (typeof window.setLang !== 'function' || window.setLang.__bcWrapped) return;
      var orig = window.setLang;
      var wrapped = function (l) {
        try { orig.apply(this, arguments); } catch (e) { }
        rebuild();
      };
      wrapped.__bcWrapped = 1;
      window.setLang = wrapped;
    } catch (e) { }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(); wrapSetLang(); });
  else { mount(); wrapSetLang(); }
  window.dtsgBotChat = { open: open, close: close, toggle: toggle, quick: quick, rebuild: rebuild };
})();
