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
   الأدمن هو الطرف الآخر الوحيد: الفيديو لا يمر بالخادم أبداً.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var st = {
    token: null, roomId: null, pc: null, stream: null,
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    mediamtx: null, hb: null, state: 'idle', startedAt: 0, retries: 0
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
  function support() {
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

  /* ── بدء البث (زر المستخدم) ── */
  async function startShare() {
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
    var u = me();
    var streamKey = st.roomId + '-' + ((u && u.id) || 'p');
    try {
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
      var resp = await fetch(base + '/whip/dtsg-' + streamKey, {
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
      if (st.pc || st.stream) stopShare('resolved');
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
    var sharing = !!(st.pc || st.stream);
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
