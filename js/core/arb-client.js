/* ═══════════════════════════════════════════════════════════════════════════
   [v2.75] عميل التحكيم — بث شاشة اللاعب إلى لوحة الأدمن (WebRTC P2P)
   ───────────────────────────────────────────────────────────────────────────
   زر «بث الشاشة للتحكيم» داخل مودال الغرفة أثناء جولة جارية:
     1. POST /api/matches/:roomId/start-stream ⇒ توكن البث + خوادم ICE
     2. navigator.mediaDevices.getDisplayMedia() — شاشة اللاعب حصراً
     3. RTCPeerConnection (P2P نحو متصفح الأدمن) + مصافحة offer/answer/ICE
        عبر POST /api/arb/signal (الترحيل عبر ناقل SSE الحي)
     4. مؤشر حالة (يتم الاتصال/مباشر/منقطع) + نبض كل 5ث (heartbeat)
     5. احتياطي: عند فشل P2P وتهيئة MediaMTX ⇒ نشر WHIP محلي
        (docs/ARBITRATION_SETUP.md) ووسم الجلسة relay
        [v2.81.1] مسار النشر (WHIP) يُسلَّم من الخادم جاهزاً ومُرمَّزاً —
                    لا يُبنى هنا من roomId/userId (قابل للانتحال)
   الأدمن هو الطرف الآخر الوحيد: الفيديو لا يمر بالخادم أبداً.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var st = {
    token: null, roomId: null, pc: null, stream: null,
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    mediamtx: null, mediamtxWhipPath: null, hb: null, state: 'idle', startedAt: 0, retries: 0
  };
  /* [v2.76·صفحة التحكيم] مشتركو تغيّر الحالة (صفحة التحكيم تعرض شريحة
     حالة البث خارج مودال الغرفة) — إلغاء الاشتراك بإرجاع دالة */
  var stateSubs = [];
  function onState(fn) {
    if (typeof fn !== 'function' || stateSubs.indexOf(fn) !== -1) return function () {};
    stateSubs.push(fn);
    return function () {
      var i = stateSubs.indexOf(fn);
      if (i >= 0) stateSubs.splice(i, 1);
    };
  }

  /* [مهم] API وAUTH معرّفان بـconst/var في نطاق السكربت العام (روابط
     معجمية) فلا يظهران على window — الوصول بالمسمّى المجرّد حصراً */
  function api() { return (typeof API !== 'undefined' && API && typeof API.post === 'function') ? API : null; }
  function me() {
    try {
      if (typeof AUTH !== 'undefined' && AUTH && AUTH.user) return AUTH.user;
      if (typeof ST !== 'undefined' && ST && ST.user) return ST.user;
    } catch (e) {}
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── مؤشر الحالة داخل مودال الغرفة ── */
  var STATE_LBL = {
    idle: '⬜ لم يبدأ', connecting: '🟡 يتم الاتصال…', live: '🟢 مباشر — الأدمن يشاهد',
    relay: '🟠 مباشر عبر المرحّل', failed: '🔴 منقطع — أعد المحاولة'
  };
  function renderChip() {
    var el = document.getElementById('arbStreamChip');
    if (!el) return;
    el.innerHTML = '<span class="arb-chip arb-' + st.state + '">' + (STATE_LBL[st.state] || st.state) + '</span>';
  }
  function setState(s) {
    st.state = s;
    renderChip();
    stateSubs.forEach(function (fn) { try { fn(s); } catch (e) {} });
    if (st.token) heartbeat();
  }

  /* ── النبض ── */
  function heartbeat() {
    var a = api();
    if (!a || !st.token || !st.roomId) return;
    a.post('/api/arb/heartbeat', { room_id: st.roomId, token: st.token, state: st.state }).catch(function () {});
  }
  function startHeartbeat() {
    stopHeartbeat();
    st.hb = setInterval(heartbeat, 5000);
  }
  function stopHeartbeat() {
    if (st.hb) { clearInterval(st.hb); st.hb = null; }
  }

  /* ── إرسال إشارة ── */
  function sendSignal(kind, payload, to) {
    var a = api();
    if (!a || !st.roomId) return Promise.resolve(null);
    return a.post('/api/arb/signal', {
      room_id: st.roomId, token: st.token, kind: kind, payload: payload || {}, to: to || null
    }).catch(function () { return null; });
  }

  /* ── تشخيص دقيق لدعم مشاركة الشاشة [v2.78] ──
     الجذر الموثق لبلاغ «المتصفح كروم ويدعمها»: رسالة «متصفحك لا يدعم»
     كانت تطلق لكل سبب بلا تمييز، وأشهرها:
       1. سياق غير آمن (HTTP بلا تشفير): كروم يحجب mediaDevices كلياً —
          الحل فتح المنصة عبر HTTPS الرسمي.
       2. متصفح هاتف (كروم أندرويد/WebView/متصفحات التطبيقات): واجهة
          getDisplayMedia غير متوفرة على الجوال إطلاقاً — قيد منصّي لا
          عطب في المتصفح — والحل البث من حاسوب.
       3. متصفح مكتبي قديم (<72).
     كل سبب له رسالته الصحيحة فلا تضليل بعد الآن. */
  function nativeSupport() {
    try {
      return !!(root.DTSGNative && typeof root.DTSGNative.arbShareStart === 'function' &&
        typeof root.DTSGNative.arbShareVersion === 'function');
    } catch (e) { return false; }
  }
  function support() {
    /* [v2.88·تطبيق الأندرويد] الجسر الأصلي arbShareStart يسبق كل الفحوص:
       في التطبيق صارت مشاركة الشاشة متاحة أصلاً (MediaProjection + ناشر
       RTMP داخل MainActivity — بلاغ المالك 2026-10-06: «التطبيق لا يسمح
       بمشاركة الشاشة في غرف التحكيم») فغياب getDisplayMedia في WebView لم
       يعد حاجباً بعد اليوم. */
    if (nativeSupport()) return { ok: true, native: true };
    if (!root.navigator || !root.navigator.mediaDevices) {
      /* سياق غير آمن؟ (كروم يحجب كامل mediaDevices على http:// غير المحلي) */
      var insecure = false;
      try {
        insecure = (root.isSecureContext === false) ||
          (root.location && root.location.protocol === 'http:' &&
           !/^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(root.location.host));
      } catch (e) { insecure = (root.location && String(root.location.protocol || '') === 'http:'); }
      return { ok: false, reason: insecure ? 'insecure' : 'old' };
    }
    if (!root.navigator.mediaDevices.getDisplayMedia) {
      /* mediaDevices موجودة (سياق آمن) والواجهة غائبة ⇒ متصفح هاتف/WebView */
      return { ok: false, reason: 'mobile' };
    }
    return { ok: true };
  }
  function supportToast() {
    var s = support();
    if (s.ok) return null;
    if (s.reason === 'insecure') return T('arb.shareInsecure') || 'مشاركة الشاشة تتطلب اتصالاً مشفرًا HTTPS — افتح المنصة عبر رابطها الرسمي الآمن ثم أعد المحاولة';
    if (s.reason === 'mobile') return T('arb.shareMobile') || 'متصفح الهاتف لا يدعم مشاركة الشاشة — افتح المنصة من حاسوب بكروم أو إيدج أو فايرفوكس';
    return T('arb.shareOld') || 'هذا المتصفح قديم ولا يوفر واجهة البث — حدّثه إلى أحدث إصدار ثم أعد المحاولة';
  }

  /* ── بدء البث (زر المستخدم) ──
     [v2.88·الأندرويد] التطبيق أولاً: الجسر الأصلي يستقطب الشاشة بنفسه
     (إذن النظام MediaProjection) ويرمّزها H.264 وينشرها RTMP إلى المرحّل
     بالمسار الموقّع من الخادم — فيظهر البث للأدمن بلا أي تغيير خادمي. */
  var nativeActive = false;
  async function nativeStart() {
    var u = me();
    if (!u) { if (root.toast) root.toast(T('ui.roomNeedLogin') || 'يلزم تسجيل الدخول', 'warn'); return; }
    var room = (root.Rooms && root.Rooms.state) || null;
    if (!room || room.status !== 'playing') {
      if (root.toast) root.toast('البث متاح أثناء جولة جارية فقط', 'warn');
      return;
    }
    if (nativeActive) { if (root.toast) root.toast('البث جارٍ أصلاً', 'warn'); return; }
    setState('connecting');
    /* عنوان النشر الموقّع من الخادم (نفس مسار Larix) — لا يُركّب محلياً
       إطلاقاً (عقد v2.81.1: الرمز هو ما يمنع انتحال البث) */
    var a = api();
    if (!a) { setState('failed'); return; }
    var r = await a.get('/api/matches/mine').catch(function () { return null; });
    var relay = (r && r.ok && r.data && r.data.relay) || null;
    var base = relay && relay.rtmp, path = relay && relay.publish_path;
    if (!base || !path) {
      setState('idle');
      if (root.toast) root.toast(T('arb.noRelay') || 'تعذر الحصول على عنوان البث من الخادم — تأكد أن خادم المنصة والمرحّل يعملان ثم أعد المحاولة', 'err');
      return;
    }
    nativeActive = true;
    try {
      root.DTSGNative.arbShareStart(JSON.stringify({ url: String(base), path: String(path) }));
    } catch (e) {
      nativeActive = false;
      setState('failed');
      if (root.toast) root.toast(T('arb.nativeFail') || 'تعذر بدء بث الشاشة من التطبيق', 'err');
    }
  }
  /* أحداث الجسر الأصلي (window.__dtsgArbEvt من جافا): حالة البث الحيّة */
  if (nativeSupport()) {
    root.__dtsgArbEvt = function (ev) {
      try {
        if (!ev || !ev.t) return;
        if (ev.t === 'state') {
          var s = String(ev.state || '');
          if (s === 'live') { setState('relay'); }
          else if (s === 'connecting') { setState('connecting'); }
          else if (s === 'failed') {
            nativeActive = false;
            setState('failed');
            if (root.toast) root.toast(T('arb.nativeFail') || 'تعذر بث الشاشة — أعد المحاولة', 'err');
          } else if (s === 'stopped') {
            nativeActive = false;
            setState('idle');
          }
        }
      } catch (e) { }
    };
  }
  async function startShare() {
    if (nativeSupport()) { nativeStart(); return; }
    var sup = support();
    if (!sup.ok) {
      if (root.toast) root.toast(supportToast(), 'err');
      return;
    }
    if (st.pc) { if (root.toast) root.toast('البث جارٍ أصلاً', 'warn'); return; }
    var u = me();
    if (!u) { if (root.toast) root.toast(T('ui.roomNeedLogin') || 'يلزم تسجيل الدخول', 'warn'); return; }
    var room = (root.Rooms && root.Rooms.state) || null;
    if (!room || room.status !== 'playing') {
      if (root.toast) root.toast('البث متاح أثناء جولة جارية فقط', 'warn');
      return;
    }
    try {
      /* 1) جلسة التحكيم + التوكن */
      setState('connecting');
      var r = await api().post('/api/matches/' + encodeURIComponent(room.id) + '/start-stream', {});
      if (!r || !r.ok || !r.data || !r.data.token) {
        setState('failed');
        if (root.toast) root.toast((r && r.data && r.data.message) || 'تعذر فتح جلسة التحكيم', 'err');
        return;
      }
      st.token = r.data.token;
      st.roomId = room.id;
      if (r.data.ice_servers && r.data.ice_servers.length) st.iceServers = r.data.ice_servers;
      st.mediamtx = r.data.mediamtx || null;
      /* [v2.81.1] مسار النشر المُرمَّز (dtsg-<room>-<user>_<token>) يعطيه
         الخادم للاعب الجالس وحده — لا يُركَّب هنا إطلاقاً: معرّفا الغرفة
         واللاعب عدادان صغيران فأي مسار مبنيّ محلياً قابل للانتحال، والمراقب
         ما عاد يسلّم إلا المسار الموقّع فيقرّر به الأدمن وجود بثّ الخصم */
      st.mediamtxWhipPath = r.data.mediamtx_publish_path_whip || null;

      /* 2) التقاط الشاشة — [v2.78] إعادة محاولة بقيود مجردة إن رفضتها
         المنصة (بعض محركات العرض لا تقبل قيود الدقة/الإطارات) */
      try {
        st.stream = await root.navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 24 }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (eC) {
        if (eC && (eC.name === 'OverconstrainedError' || eC.name === 'ConstraintError')) {
          st.stream = await root.navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        } else {
          throw eC;
        }
      }
      st.stream.getVideoTracks().forEach(function (t) {
        t.addEventListener('ended', function () { stopShare('ended'); });
      });

      /* 3) اتصال P2P نحو الأدمن + بثّ العرض */
      await buildPc();
      startHeartbeat();
      setState('connecting');
      if (root.toast) root.toast('🟡 يتم الاتصال بلوحة التحكيم…', 'ok');
    } catch (e) {
      /* [v2.78] تصنيف دقيق لأخطاء الالتقاط — لكل عطل رسالته الصحيحة:
         NotAllowedError: رفض المستخدم الإذن · NotReadableError/AbortError:
         الشاشة مشغولة ببرنامج التقاط آخر · غير ذلك: فشل عام */
      var msg;
      if (e && e.name === 'NotAllowedError') msg = T('arb.errDenied') || 'تم رفض الإذن — اسمح بمشاركة الشاشة من شريط المتصفح ثم أعد المحاولة';
      else if (e && (e.name === 'NotReadableError' || e.name === 'AbortError')) msg = T('arb.errBusy') || 'تعذر التقاط الشاشة (النظام مشغول) — أغلق برامج التسجيل الأخرى ثم أعد المحاولة';
      else msg = 'تعذر بدء البث' + ((e && e.message) ? ' — ' + e.message : '');
      setState('failed');
      if (root.toast) root.toast(msg, 'err');
    }
  }

  /* بناء RTCPeerConnection وإطلاق العرض نحو الأدمن المشاهد */
  async function buildPc() {
    var pc = new root.RTCPeerConnection({ iceServers: st.iceServers });
    st.pc = pc;
    st.stream.getTracks().forEach(function (t) { pc.addTrack(t, st.stream); });
    pc.addEventListener('icecandidate', function (ev) {
      if (ev.candidate) sendSignal('ice', { candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate });
    });
    pc.addEventListener('connectionstatechange', function () {
      var cs = pc.connectionState;
      if (cs === 'connected') { st.retries = 0; setState('live'); }
      else if (cs === 'failed') {
        if (st.retries < 2 && st.stream && st.stream.active) { st.retries++; rebuildPc(); }
        else fallbackRelay();
      } else if (cs === 'disconnected') setState('failed');
    });
    var offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    /* [مهم] نرسل نص الـSDP (.sdp) لا كائن RTCSessionDescription —
       JSON للكائن يعمل نظرياً لكن الطرف المستقبل يبني {type, sdp} من
       msg.payload.sdp: إن كان كائناً أصبح "[object Object]" ففشل التحليل */
    sendSignal('offer', { sdp: pc.localDescription.sdp });
  }

  /* إعادة محاولة P2P (تدمير + بناء + عرض جديد) */
  async function rebuildPc() {
    destroyPc();
    if (!st.stream || !st.stream.active) { setState('failed'); return; }
    setState('connecting');
    try { await buildPc(); } catch (e) { fallbackRelay(); }
  }

  /* الاحتياطي: نشر WHIP إلى MediaMTX المحلي عند تعذر P2P */
  async function fallbackRelay() {
    if (!st.mediamtx || !st.stream || !st.stream.active) { setState('failed'); return; }
    destroyPc();
    try {
      /* [v2.81.1] بلا مسار مُرمَّز من الخادم = لا نشر: ينقطع البث صراحةً
         (catch أدناه: state=failed + تنبيه) بدل النشر على مسار انتحالي */
      if (!st.mediamtxWhipPath) throw new Error('no publish path');
      var pc = new root.RTCPeerConnection({ iceServers: st.iceServers });
      st.pc = pc;
      st.stream.getTracks().forEach(function (t) { pc.addTrack(t, st.stream); });
      pc.addEventListener('connectionstatechange', function () {
        if (pc.connectionState === 'connected') setState('relay');
        else if (pc.connectionState === 'failed') setState('failed');
      });
      var offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      var base = st.mediamtx.replace(/\/+$/, '');
      var resp = await fetch(base + '/whip/' + st.mediamtxWhipPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp
      });
      if (!resp.ok) throw new Error('whip ' + resp.status);
      var answerSdp = await resp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (e) {
      setState('failed');
      if (root.toast) root.toast('تعذر البث المباشر والمرحّل — أعد المحاولة', 'err');
    }
  }

  function destroyPc() {
    if (st.pc) { try { st.pc.close(); } catch (e) {} st.pc = null; }
  }

  /* إيقاف البث (زر/انتهاء المشاركة من المتصفح) */
  function stopShare(reason) {
    if (nativeActive) {
      try { root.DTSGNative.arbShareStop(); } catch (e) { }
      nativeActive = false;
      setState('idle');
      return;
    }
    sendSignal('bye', { reason: reason || 'manual' });
    destroyPc();
    if (st.stream) { try { st.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} st.stream = null; }
    stopHeartbeat();
    st.token = null; st.roomId = null; st.state = 'idle';
    renderChip();
  }

  /* ── استقبال أحداث التحكيم (من live.js SSE) ──
     اللاعب يستقبل: answer من الأدمن + مرشحات ICE + طلب مشاهدة جديد */
  async function onSignal(msg) {
    if (!msg || msg.room_id !== st.roomId || !st.pc) return;
    try {
      if (msg.kind === 'answer' && st.pc.signalingState !== 'stable') {
        await st.pc.setRemoteDescription({ type: 'answer', sdp: msg.payload.sdp });
      } else if (msg.kind === 'ice' && msg.payload && msg.payload.candidate) {
        await st.pc.addIceCandidate(msg.payload.candidate);
      } else if (msg.kind === 'rewatch' && st.stream && st.stream.active) {
        /* أدمن فتح اللوحة بعد عرضنا: أعد العرض نحوه */
        await rebuildPc();
      }
    } catch (e) { /* إشارة متقادمة — تجاهل */ }
  }
  function onEvent(name, data) {
    if (name === 'arb:signal') onSignal(data);
    else if (name === 'arb:resolved' && data && data.room_id === st.roomId) {
      /* حسم الأدم المباراة: أنهِ البث بلطف */
      if (st.pc || st.stream || nativeActive) stopShare('resolved');
    }
  }

  /* ── زر التحكيم داخل مودال الغرفة (يستدعيه render في rooms.js) ── */
  function modalHtml() {
    var room = (root.Rooms && root.Rooms.state) || null;
    if (!room || room.status !== 'playing') return '';
    var u = me();
    if (!u) return '';
    var member = (room.players || []).some(function (p) { return String(p.id) === String(u.id) && !p.spectate; });
    if (!member) return '';
    var sharing = !!(st.pc || st.stream || nativeActive);
    /* [v2.78] بث غير مدعوم في هذا السياق: زر تحذيري يشرح السبب عند النقر
       (أفضل من إخفائه — اللاعب يعرف لماذا وكيف يبث من جهاز آخر) */
    var sup = support();
    var startBtn;
    if (!sup.ok) {
      startBtn = '<button type="button" class="btn half" title="' + esc(supportToast() || '') + '" onclick="ARB.startShare()">⚠️ ' +
        (T('arb.shareBlocked') || 'مشاركة الشاشة غير متاحة هنا') + '</button>';
    } else {
      startBtn = '<button type="button" class="btn half gold" onclick="ARB.startShare()">' + (T('arb.start') || '📺 مشاركة الشاشة / بدء البث') + '</button>';
    }
    return '<div class="arb-box" id="arbBox">' +
      '<div class="arb-title">📺 ' + (T('arb.playerTitle') || 'بث التحكيم المباشر') + '</div>' +
      '<div class="arb-sub">' + esc(T('arb.playerSub') || 'شارك شاشتك ليحسم الأدمن النتيجة ويُطلق الأرباح فوراً — الفيديو يذهب للوحة التحكيم مباشرة فقط') + '</div>' +
      '<div class="arb-row">' +
        (sharing
          ? '<button type="button" class="btn half" onclick="ARB.stopShare()">' + (T('arb.stop') || '⏹ إيقاف البث') + '</button>'
          : startBtn) +
        '<span id="arbStreamChip"></span>' +
      '</div>' +
      (!sup.ok ? '<div class="note" style="font-size:.72rem;text-align:start">ℹ️ ' + esc(supportToast() || '') + '</div>' : '') +
      (!sup.ok && sup.reason === 'mobile' ? '<div class="note" style="font-size:.72rem;text-align:start">' + (T('arb.mrHint') || '📱 البديل على الهاتف: بث RTMP عبر تطبيق خارجي — افتح صفحة <b>التحكيم المباشر</b> لنسخ عنوان بثّك الخاص') + '</div>' : '') +
    '</div>';
  }
  function mountChip() { renderChip(); }

  /* تنظيف عند مغادرة الغرفة/الجلسة */
  function reset() {
    if (nativeActive) {
      try { root.DTSGNative.arbShareStop(); } catch (e) { }
      nativeActive = false;
    }
    if (st.pc || st.stream) stopShare('leave');
  }

  root.ARB = {
    startShare: startShare,
    stopShare: stopShare,
    onEvent: onEvent,
    modalHtml: modalHtml,
    mountChip: mountChip,
    reset: reset,
    onState: onState,
    support: support,
    state: function () { return st.state; }
  };
})(typeof window !== 'undefined' ? window : this);
