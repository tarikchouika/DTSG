/* ═════════════════════════════════════════════════════════
   Live WS Bridge — يحوّل EventSource('/api/live') إلى WebSocket
   عبر Durable Objects (نفس أسماء الأحداث: room:update, room:move...)
   الشبكة: wss://casino-api.../api/rooms/<roomId>/ws?uid=<uid>
   غرفة الدردشة العامة: roomId = 'global'
   [إصلاح التكرار] اتصال WS واحد مشترك لغرفة global مهما تعددت
   نداءات EventSource — كل رسالة تُوزَّع على كل مستمع مرة واحدة فقط.
   ═════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  /* [PhoneLink] نفس منطق api.js: العنوان يُقرأ من api-url2.json (ووركر الوسيط الدائم).
     الووركر الوسيط يمرر SSE لكن خادم الهاتف (server.js) لا يدعم WebSocket —
     لذا في وضع الووركر الوسيط/النفق نُبقي EventSource الأصلي ولا نستبدله. */
  var API_BASE = (typeof window !== 'undefined' && typeof window.API_BASE_URL === 'string') ? window.API_BASE_URL : null;
  var basePromise = (API_BASE !== null)
    ? Promise.resolve(API_BASE)
    : ((typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(location.hostname))
      ? Promise.resolve(location.origin)
      : fetch('/api-url2.json', { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (cfg) { return (cfg && cfg.url) || 'https://casino-api.dmgames-api.workers.dev'; })
          .catch(function () { return 'https://casino-api.dmgames-api.workers.dev'; }));
  basePromise.then(function (b) { API_BASE = b; });
  function toWs(base) {
    if (base.indexOf('http://') === 0) return 'ws' + base.slice(4);
    if (base.indexOf('https://') === 0) return 'wss' + base.slice(5);
    return base;
  }
  /* الووركر الوسيط (casino-phone) = عبور SSE إلى الهاتف — بلا Durable Objects/WS */
  /* [إصلاح 2026-09-16] الخادم المحلي (localhost/127.0.0.1/0.0.0.0) لا يدعم WebSocket —
     يُبقى على EventSource/SSE كما في وضع الووركر الوسيط، وإلا تعطلت أحداث الغرف محلياً.
     يُحسم محلياً بشكل متزامن: أول EventSource يُفتح أثناء الإقلاع قبل حسم الوعد،
     فكان يقع في مسار WS المعطوب. */
  var isSSEMode = (typeof location !== 'undefined') && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(location.hostname);
  /* [v2.42-Bugfix] قرار متزامن: نقرأ العنوان المخزّن (يضعه api.js) قبل أي اتصال،
     وإلا وقع أول EventSource في مسار WS قبل حسم الوعد ⇒ WebSocket فاشل على النفق
     (خطأ كونسول متكرر + حرمان الصفحة من أحداث الغرف). */
  try {
    var _cachedBase = localStorage.getItem('rc_api_base') || '';
    if (_cachedBase && /casino-phone\.|trycloudflare\.com$|\.lhr\.life$|\.loca\.lt$/.test(_cachedBase)) isSSEMode = true;
  } catch (e) { }
  basePromise.then(function (b) {
    if (/casino-phone\.|trycloudflare\.com$|\.lhr\.life$|\.loca\.lt$/.test(b || '')) isSSEMode = true;
  });
  function getUid() {
    /* [PR-Sync] const AUTH لا يظهر على window — يقرأ كرابطة عالمية مباشرة.
       كان uid يصل '0' فلا يتعرف الخادم على اللاعب ولا يرسل room:replay (لوحة مجمدة). */
    try {
      var a = (typeof AUTH !== 'undefined' && AUTH) || window.AUTH || null;
      var s = (typeof ST !== 'undefined' && ST) || window.ST || null;
      return String((a && a.user && a.user.id) || (window.RC_user && window.RC_user.id) || (s && s.user && s.user.id) || '0');
    }
    catch (e) { return '0'; }
  }
  function getCurrentRoomId() {
    try { if (window.Rooms && window.Rooms.state && window.Rooms.state.id) return window.Rooms.state.id; } catch (e) { }
    return window.RC_currentRoomId || 'global';
  }

  /* ── قناة مشتركة: WS واحد لكل roomId، وواجهات (facades) متعددة فوقه ── */
  function Channel(rid) {
    var self = this;
    self.rid = rid;
    self.facades = [];
    self.closed = false;
    self._connect();
  }
  Channel.prototype = {
    /* تراجع آمن: نفس أحداث /api/live عبر EventSource (بلا WS) للواجهات القائمة */
    _fallbackSSE: function () {
      var self = this;
      if (self.closed || self._es || !API_BASE) return;
      try {
        var es = new OrigES(API_BASE + '/api/live', { withCredentials: true });
        self._es = es;
        es.onopen = function () {
          for (var i = 0; i < self.facades.length; i++) {
            self.facades[i].readyState = 1;
            if (self.facades[i].onopen) try { self.facades[i].onopen(); } catch (e) { }
          }
        };
        es.onmessage = function (ev) {
          var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
          var targets = self.facades.slice();
          if (self.rid !== 'global' && globalChannel && !globalChannel.closed && globalChannel !== self) {
            for (var t = 0; t < globalChannel.facades.length; t++) {
              if (targets.indexOf(globalChannel.facades[t]) === -1) targets.push(globalChannel.facades[t]);
            }
          }
          var evObj = { data: JSON.stringify(m.data) };
          for (var i = 0; i < targets.length; i++) {
            var ls = targets[i]._listeners[m.event];
            if (!ls) continue;
            for (var j = 0; j < ls.length; j++) try { ls[j](evObj); } catch (e) { }
          }
        };
        es.onerror = function () { /* EventSource يعيد المحاولة تلقائياً */ };
      } catch (e) { }
    },
    _connect: function () {
      var self = this;
      if (self.closed) return;
      /* [v2.42-Bugfix] وضع SSE مُحسوم ⇒ لا تحاول WS أصلاً؛ اربط الواجهات على /api/live */
      if (isSSEMode) { self._fallbackSSE(); return; }
      /* [BASE-Guard 2026-09-15] API_BASE لم يُحل بعد (وعد api-url2.json قيد
         المعالجة) — أعد المحاولة عند الجاهزية بدل رمي toWs(null).
         يغطي كل مسارات الإنشاء (polyfill EventSource/watchRoom/غرفة لعب) */
      if (!API_BASE) {
        basePromise.then(function () { if (!self.closed) self._connect(); });
        return;
      }
      self._ws = new WebSocket(toWs(API_BASE) + '/api/rooms/' + encodeURIComponent(self.rid) + '/ws?uid=' + encodeURIComponent(getUid()));
      self._ws.onopen = function () {
        for (var i = 0; i < self.facades.length; i++) {
          var f = self.facades[i];
          f.readyState = 1;
          if (f.onopen) try { f.onopen(); } catch (e) { }
        }
      };
      self._ws.onclose = function () {
        if (self.closed) return;
        for (var i = 0; i < self.facades.length; i++) self.facades[i].readyState = 0;
        /* [v2.42-Bugfix] الووركر الوسيط/النفق لا يدعم WS — بعد أول فشل، أو إن
           حُسم الوضع لاحقاً، نتحول إلى EventSource بدل حلقة إعادة محاولة بلا نهاية */
        if (isSSEMode || self._failTries >= 1) { self._fallbackSSE(); return; }
        self._failTries = (self._failTries || 0) + 1;
        setTimeout(function () { self._connect(); }, 3000);
      };
      self._ws.onerror = function () { };
      self._ws.onmessage = function (ev) {
        var m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        /* [RoomFix] أحداث غرفة اللعب تصل على قناة الغرفة الخاصة، لكن مستمعي rooms.js
           مسجلون على واجهة global (EventSource '/api/live') — وزّع على الواجهتين معاً.
           هذه كانت العلة الجذرية: «جاهز/بدء» لا يصلان أحداً حتى تجديد الصفحة. */
        var targets = self.facades.slice();
        if (self.rid !== 'global' && globalChannel && !globalChannel.closed) {
          for (var t = 0; t < globalChannel.facades.length; t++) {
            if (targets.indexOf(globalChannel.facades[t]) === -1) targets.push(globalChannel.facades[t]);
          }
        }
        var msgs = [m];
        /* [RoomFix] hello من غرفة لعب يحمل آخر حالة — ترجمة إلى room:update لمزامنة فورية عند الاتصال/العودة */
        if (self.rid !== 'global' && m.event === 'hello' && m.data && m.data.room !== undefined) {
          msgs.push({ event: 'room:update', data: m.data.room });
        }
        for (var k = 0; k < msgs.length; k++) {
          var evObj = { data: JSON.stringify(msgs[k].data) };
          for (var i = 0; i < targets.length; i++) {
            var ls = targets[i]._listeners[msgs[k].event];
            if (!ls) continue;
            for (var j = 0; j < ls.length; j++) try { ls[j](evObj); } catch (e) { }
          }
        }
      };
    },
    send: function (o) { try { this._ws.send(JSON.stringify(o)); } catch (e) { } },
    close: function () { this.closed = true; try { this._ws.close(); } catch (e) { } }
  };

  var globalChannel = null;
  function getGlobalChannel() {
    if (!globalChannel || globalChannel.closed) globalChannel = new Channel('global');
    return globalChannel;
  }

  /* واجهة بمظهر EventSource فوق القناة المشتركة */
  function LiveWS(roomId) {
    var self = this;
    self._listeners = {};
    var rid = (typeof roomId === 'string' && roomId) ? roomId : getCurrentRoomId();
    if (rid === 'global') {
      self._ch = getGlobalChannel();
    } else {
      self._ch = new Channel(rid);
      self._own = true; /* قناة خاصة بغرفة لعب — تُغلق مع الواجهة */
    }
    self._ch.facades.push(self);
    self.readyState = (self._ch._ws && self._ch._ws.readyState === 1) ? 1 : 0;
    if (self.readyState === 1 && self.onopen) { setTimeout(function () { try { self.onopen(); } catch (e) { } }, 0); }
  }
  LiveWS.prototype = {
    addEventListener: function (type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    send: function (o) { this._ch.send(o); },
    close: function () {
      var idx = this._ch.facades.indexOf(this);
      if (idx !== -1) this._ch.facades.splice(idx, 1);
      /* قناة غرفة لعب خاصة: أغلق WS؛ قناة global تبقى حية للواجهات الأخرى */
      if (this._own && !this._ch.facades.length) this._ch.close();
      this.readyState = 3;
    }
  };

  /* polyfill: استبدال EventSource للـ '/api/live' فقط */
  var OrigES = window.EventSource;
  window.EventSource = function (url) {
    /* [SSE-Cookie 2026-09-15] عبر الووركر الوسيط (نطاق مغاير لصفحة dtsg) يجب
       withCredentials: true وإلا فلن يُرسل كوكي sid → getUser=null في الخادم
       → broadcastRoom يستثني هذا العميل فلا تصل room:update (جاهز/بدء/حركات). */
    if (isSSEMode) return new OrigES(API_BASE + '/api/live', { withCredentials: true });
    if (url === '/api/live' || url === (API_BASE + '/api/live')) {
      return new LiveWS('global');
    }
    return new OrigES(url);
  };
  window.EventSource.prototype = OrigES ? OrigES.prototype : {};
  window.LiveWS = LiveWS;

  /* مراقبة الغرفة الحالية: عند فتح غرفة لعب → اتصال إضافي بها */
  var gameConn = null;
  function watchRoom(force) {
    if (isSSEMode) return; /* [PhoneLink] خادم الهاتف: الغرف عبر SSE، بلا WS */
    /* [BASE-Guard 2026-09-15] API_BASE لم يُحل بعد (وعد api-url2.json) —
       toWs(null) كان يرمي "Cannot read properties of null" عند أول watchRoom قبل الجاهزية */
    if (!API_BASE) return;
    var rid = getCurrentRoomId();
    if (rid && rid !== 'global' && (force || !gameConn || gameConn._rid !== rid)) {
      if (gameConn) { try { gameConn.close(); } catch (e) { } }
      gameConn = new LiveWS(rid);
      gameConn._rid = rid;
    } else if ((!rid || rid === 'global') && gameConn) {
      try { gameConn.close(); } catch (e) { }
      gameConn = null;
    }
  }
  /* هوك على تحديث Rooms.state + إعادة الاتصال إذا تغيّر uid (دخول متأخر) */
  var lastUid = getUid();
  setInterval(function () {
    try {
      var st = window.Rooms && window.Rooms.state;
      var u = getUid();
      var uidChanged = (u !== lastUid);
      lastUid = u;
      if (st && st.id && (st.id !== window.__liveLastRoom || uidChanged)) { window.__liveLastRoom = st.id; watchRoom(true); }
      else if (!st && window.__liveLastRoom) { window.__liveLastRoom = null; watchRoom(); }
    } catch (e) { }
  }, 800);
  window.__liveWatchRoom = watchRoom;
})();
