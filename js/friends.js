/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Friends (DM + Rooms invite)
   قائمة الأصدقاء + المحادثة الخاصة + دعوة لغرفة
   يعتمد على: GET/POST /api/friends, /api/messages, SSE 'dm' على /api/live
   ═══════════════════════════════════════════ */
(function () {
  "use strict";

  var _friends = [];   // [{ id, username, status, online }]
  var _selected = null; // { id, username }
  var _conv = [];       // [{ id, sender_id, receiver_id, text, room_code, created_at }]
  var _source = null;   // EventSource('/api/live')

  /* ── أدوات ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* مُعرّفات الرسالة: الخادم يرسل sender_id/receiver_id؛ نتحمّل الاسمين القديمين أيضاً */
  function mFromId(m) { return m.sender_id != null ? m.sender_id : m.from_id; }
  function mToId(m) { return m.receiver_id != null ? m.receiver_id : m.to_id; }

  /* ترجمة fr.* مع رجوع عربي إن غاب المفتاح */
  var AR = {
    'fr.title': 'الأصدقاء', 'fr.add': 'إضافة صديق', 'fr.addPlaceholder': 'اسم المستخدم أو المعرّف',
    'fr.pending': 'طلبات معلّقة', 'fr.accept': 'قبول', 'fr.decline': 'رفض', 'fr.noFriends': 'لا يوجد أصدقاء بعد — أضف صديقاً للبدء.',
    'fr.send': 'إرسال', 'fr.invite': 'دعوة لغرفة', 'fr.inbox': 'الوارد', 'fr.online': 'متصل',
    'fr.noConv': 'لا توجد رسائل بعد — ابدأ المحادثة.'
  };
  function t(k) {
    var v = (typeof T === 'function') ? T(k) : k;
    if (v && v !== k) return v;
    return AR[k] || k;
  }
  function me() {
    return (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
  }
  function toastW(msg, type) {
    if (typeof toast === 'function') toast(msg, type || 'info');
  }

  /* ═══════════ الواجهة العامة ═══════════ */
  function init() {
    if (typeof me() === 'undefined' || !me()) {
      /* نسمح بالتحميل حتى لو لم يُسجَّل الدخول — سيُظهر الـ API خطأ مناسباً عند الطلب */
    }
    bindStatic();
    loadFriends();
    refreshInbox();
    ensureSse();
    /* يعيد الخادم تنظيف الرسائل الأقدم من 24 ساعة؛ نعيد الجلب دورياً لعكس الحذف */
    if (!Friends._timer) {
      Friends._timer = setInterval(function () {
        refreshInbox();
        loadFriends();
        if (_selected) loadConversation(_selected.id);
      }, 60000);
    }
  }

  function bindStatic() {
    if (Friends._bound) return;
    Friends._bound = true;
    var addBtn = document.getElementById('friendAddBtn');
    var addInp = document.getElementById('friendAddInput');
    var sendBtn = document.getElementById('friendSendBtn');
    var sendInp = document.getElementById('friendMsgInput');
    var invBtn = document.getElementById('friendInviteBtn');
    var listEl = document.getElementById('friendList');
    if (addBtn) addBtn.addEventListener('click', addFriend);
    if (addInp) addInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') addFriend(); });
    if (sendInp) sendInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendMessage(); });
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (invBtn) invBtn.addEventListener('click', inviteToRoom);
    if (listEl) listEl.addEventListener('click', onListClick);
  }

  /* تحميل قائمة الأصدقاء من الخادم */
  function loadFriends() {
    API.get('/api/friends').then(function (r) {
      var list = (r.ok && r.data)
        ? (r.data.friends || (Array.isArray(r.data) ? r.data : []))
        : [];
      _friends = list;
      renderFriends();
    }).catch(function () { renderFriends(); });
  }

  function renderFriends() {
    var el = document.getElementById('friendList');
    if (!el) return;
    if (!_friends.length) {
      el.innerHTML = '<div class="note">' + esc(t('fr.noFriends')) + '</div>';
      return;
    }
    /* المقبولون أولاً، ثم الوارد/الصادر */
    var ordered = _friends.slice().sort(function (a, b) {
      var rank = function (s) { return s === 'accepted' ? 0 : (s === 'incoming' ? 1 : 2); };
      return rank(a.status) - rank(b.status);
    });
    el.innerHTML = ordered.map(function (f) {
      var active = _selected && _selected.id === f.id ? ' active' : '';
      var online = f.online ? ' <span class="fr-online">● ' + esc(t('fr.online')) + '</span>' : '';
      var actions = '';
      if (f.status === 'incoming') {
        actions =
          '<button class="btn small" data-act="accept" data-id="' + f.id + '">✅ ' + esc(t('fr.accept')) + '</button>' +
          '<button class="btn small ghost" data-act="decline" data-id="' + f.id + '">✖ ' + esc(t('fr.decline')) + '</button>';
      } else if (f.status === 'outgoing') {
        actions = '<span class="note" style="font-size:0.78rem">⏳ ' + esc(t('fr.pending')) + '</span>';
      } else {
        actions =
          '<button class="btn small" data-act="invite" data-id="' + f.id + '">🎮 ' + esc(t('fr.invite')) + '</button>' +
          '<button class="btn small ghost" data-act="remove" data-id="' + f.id + '">🗑</button>';
      }
      return '<div class="friend-row' + active + '" data-id="' + f.id + '" data-username="' + esc(f.username) + '">' +
        '<div class="fav" style="background:var(--accent)">' + esc((f.username || '؟').slice(-1)) + '</div>' +
        '<div class="fmeta"><div class="fname">' + esc(f.username) + online + '</div></div>' +
        '<div class="factions">' + actions + '</div>' +
      '</div>';
    }).join('');
  }

  /* نقر على صف صديق / أزرار الإجراءات (تفويض الحدث) */
  function onListClick(e) {
    var btn = e.target.closest('[data-act]');
    if (btn) {
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-id');
      if (act === 'accept') acceptFriend(id);
      else if (act === 'decline') declineFriend(id);
      else if (act === 'remove') removeFriend(id);
      else if (act === 'invite') { selectFriend(id, btn); inviteToRoom(); }
      e.stopPropagation();
      return;
    }
    var row = e.target.closest('.friend-row');
    if (row) selectFriend(row.getAttribute('data-id'), row);
  }

  function selectFriend(id, row) {
    var f = _friends.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!f) return;
    _selected = { id: f.id, username: f.username };
    /* تمييز الصف المختار */
    var listEl = document.getElementById('friendList');
    if (listEl) {
      Array.prototype.forEach.call(listEl.querySelectorAll('.friend-row'), function (r) {
        r.classList.toggle('active', r.getAttribute('data-id') === String(id));
      });
    }
    loadConversation(f.id);
  }

  function loadConversation(id) {
    API.get('/api/messages?with=' + encodeURIComponent(id)).then(function (r) {
      _conv = (r.ok && r.data)
        ? (r.data.messages || (Array.isArray(r.data) ? r.data : []))
        : [];
      renderConv();
      refreshInbox();
    }).catch(function () { renderConv(); });
  }

  function renderConv() {
    var el = document.getElementById('friendConv');
    if (!el) return;
    var mineId = me() ? me().id : null;
    if (!_selected) {
      el.innerHTML = '<div class="note">' + esc(t('fr.noFriends')) + '</div>';
      return;
    }
    if (!_conv.length) {
      el.innerHTML = '<div class="note">' + esc(t('fr.noConv')) + '</div>';
      return;
    }
    el.innerHTML = _conv.map(function (m) {
      var isMine = mFromId(m) === mineId;
      var who = isMine ? (t('ui.roomChatYou') || 'أنت') : esc(_selected.username);
      return '<div class="rchat-msg ' + (isMine ? 'mine' : '') + '">' +
        '<span class="rchat-name">' + who + '</span>' +
        '<span class="rchat-text">' + esc(m.text) + '</span>' +
      '</div>';
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  function appendMessage(m) {
    if (!_selected) return;
    var mineId = me() ? me().id : null;
    var involvesMe = (mToId(m) == null) || (mToId(m) === mineId) || (mFromId(m) === mineId);
    var relatesToSel = (String(mFromId(m)) === String(_selected.id)) || (String(mToId(m)) === String(_selected.id));
    if (!involvesMe || !relatesToSel) return;
    _conv.push(m);
    renderConv();
    if (mFromId(m) !== mineId) {
      toastW('💬 ' + esc(m.from_name || _selected.username) + ': ' + esc(m.text), 'ok');
      if (typeof SND !== 'undefined' && SND.notify) SND.notify();
    }
  }

  /* إضافة صديق */
  function addFriend() {
    var inp = document.getElementById('friendAddInput');
    if (!inp) return;
    var username = (inp.value || '').trim();
    if (!username) { toastW(t('fr.addPlaceholder'), 'warn'); inp.focus(); return; }
    API.post('/api/friends/add', { username: username }).then(function (r) {
      if (!r.ok) { toastW((r.data && r.data.message) || t('auth.error'), 'err'); return; }
      inp.value = '';
      toastW('✅ ' + esc(username), 'ok');
      loadFriends();
    });
  }

  function acceptFriend(id) {
    API.post('/api/friends/accept', { friendUserId: id }).then(function (r) {
      if (!r.ok) { toastW((r.data && r.data.message) || t('auth.error'), 'err'); return; }
      toastW('✅ ' + esc(t('fr.accept')), 'ok');
      loadFriends();
      if (_selected && String(_selected.id) === String(id)) loadConversation(id);
    });
  }
  function declineFriend(id) {
    API.post('/api/friends/remove', { friendUserId: id }).then(function (r) {
      if (!r.ok) { toastW((r.data && r.data.message) || t('auth.error'), 'err'); return; }
      toastW('🗑 ' + esc(t('fr.decline')), 'warn');
      if (_selected && String(_selected.id) === String(id)) { _selected = null; _conv = []; renderConv(); }
      loadFriends();
    });
  }
  function removeFriend(id) {
    API.post('/api/friends/remove', { friendUserId: id }).then(function (r) {
      if (!r.ok) { toastW((r.data && r.data.message) || t('auth.error'), 'err'); return; }
      toastW('🗑', 'warn');
      if (_selected && String(_selected.id) === String(id)) { _selected = null; _conv = []; renderConv(); }
      loadFriends();
    });
  }

  /* إرسال رسالة للصديق المختار */
  function sendMessage() {
    if (!_selected) { toastW(t('fr.pending') || 'اختر صديقاً أولاً', 'warn'); return; }
    var inp = document.getElementById('friendMsgInput');
    if (!inp) return;
    var text = (inp.value || '').trim();
    if (!text) return;
    inp.value = '';
    var to = _selected.username || _selected.id;
    API.post('/api/messages', { to: to, text: text }).then(function (r) {
      if (!r.ok) { toastW((r.data && r.data.message) || t('auth.error'), 'err'); return; }
      var msg = (r.data && r.data.message) ? r.data.message : { id: null, sender_id: me() ? me().id : null, receiver_id: _selected.id, text: text, created_at: Math.floor(Date.now() / 1000) };
      _conv.push(msg);
      renderConv();
    });
  }

  /* دعوة صديق لغرفة: ننشئ غرفة (إن لم توجد) ثم نرسل الكود */
  function inviteToRoom() {
    if (!_selected) { toastW(t('fr.pending') || 'اختر صديقاً أولاً', 'warn'); return; }
    var to = _selected.username || _selected.id;
    function sendCode(code) {
      if (!code) { toastW(t('rm.required') || 'تعذّر إنشاء الغرفة', 'err'); return; }
      API.post('/api/messages', { to: to, text: 'room_code:' + code, room_code: code }).then(function (r) {
        if (!r.ok) toastW((r.data && r.data.message) || t('auth.error'), 'err');
        else toastW('📨 ' + esc(t('fr.invite')) + ': ' + esc(code), 'ok');
      });
    }
    if (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.code) {
      sendCode(Rooms.state.code);
      return;
    }
    /* لا غرفة مفتوحة → أنشئ غرفة افتراضية (لعبة مدعومة حالياً أو روندا) */
    var gid = 'rn';
    if (typeof Rooms !== 'undefined' && typeof Rooms.isGameSupported === 'function' && window._currentGameId && Rooms.isGameSupported(window._currentGameId)) {
      gid = window._currentGameId;
    }
    Rooms.createRoom(gid, { room_type: 'hour', bet: 10 }).then(function () {
      var code = (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state.code : null;
      sendCode(code);
    });
  }

  /* ═══════════ SSE: رسائل خاصة واردة (dm) ═══════════ */
  function ensureSse() {
    if (_source || typeof EventSource === 'undefined') return;
    _source = new EventSource('/api/live');
    _source.addEventListener('dm', function (e) {
      try {
        var d = JSON.parse(e.data);
        appendMessage(d);
        refreshInbox();
      } catch (err) { console.error('[friends] dm', err); }
    });
    _source.onerror = function () { /* يعيد EventSource الاتصال تلقائياً */ };
  }

  /* عدّاد غير المقروء على #navFriends */
  function refreshInbox() {
    API.get('/api/messages/inbox').then(function (r) {
      var n = (r.ok && r.data) ? (r.data.count || r.data.unread || 0) : 0;
      setInboxBadge(n);
    }).catch(function () {});
  }
  function setInboxBadge(n) {
    var el = document.getElementById('navFriendsInbox');
    if (!el) {
      var nav = document.getElementById('navFriends');
      if (nav) el = nav.querySelector('.badge');
    }
    if (!el) return;
    if (n > 0) { el.style.display = ''; el.textContent = String(n); }
    else { el.style.display = 'none'; }
  }

  /* ═══════════ التصدير ═══════════ */
  window.Friends = {
    init: init,
    add: addFriend,
    accept: acceptFriend,
    decline: declineFriend,
    remove: removeFriend,
    send: sendMessage,
    invite: inviteToRoom,
    _bound: false
  };
  window.sendFriendMsg = sendMessage;
  window.inviteFriendToRoom = inviteToRoom;
})();
