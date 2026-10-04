/* ═══════════════════════════════════════════════════════════════════════════
   [v2.75] لوحة التحكيم للأدمن — مشاهدة مزدوجة + حسم النتيجة + إرجاع المال
   ───────────────────────────────────────────────────────────────────────────
   تبويب «التحكيم» في لوحة الأدمن:
     • قائمة الجلسات النشطة (تُحدَّث لحظياً عبر SSE: arb:session/arb:resolved)
     • مشغّلان WebRTC جنباً إلى جنب: شاشة اللاعب الأول والثاني في آن
       (اتصال P2P مستقل لكل لاعب — الأدمن يجيب عروض البث)
     • أزرار الحسم: تأكيد فوز A · تأكيد فوز B · إلغاء وإرجاع الأموال
       (POST /api/matches/:id/resolve — أدمن حصراً؛ الإفراج عن الإيداعات
       يتم خادمياً عبر نواة التسوية المعتمدة نفسها)
     • تنبيه آلي عند انقطاع بث أي لاعب (نبض 5ث + منظّف 15ث خادمياً)
     • بديل المرحّل: وسم relay ⇒ مشغّل WHEP من MediaMTX إن هُيّئ
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var st = {
    sessions: {},          /* roomId -> session (من الخادم) */
    viewing: null,         /* roomId المعروض تفاصيله */
    pcs: {},               /* roomId -> { userId: RTCPeerConnection } */
    pollTi: null,
    mediamtx: null,
    /* [v2.81·mediamtx] حالة بث المرحّل للجلسة المعروضة (استطلاع خفيف 10ث
       — الاستعلام على الطلب حصراً: بلا لوحة مفتوحة لا استعلام إطلاقاً) */
    rt: {},                /* roomId -> { available, players: { uid: {...} } } */
    rtBusy: false,
    /* [v2.81.4·بروكسي HLS] مشغّلات بث المرحّل لكل لاعب (uid -> Hls|{native})
       — تُنشأ عند وصول البث وتُدمّر عند انقطاعه أو تفكيك اللوحة؛ عناصر
       الفيديو P2P الحيّة لا تُمسّ إطلاقاً (قاعدة 17) */
    rtHls: {},
    /* [v2.76·صفحة التحكيم] حاوية الرسم قابلة للتبديل: التبويب الأصلي في
       لوحة الأدمن (adminContent) أو مركز التحكيم بالصفحة المخصّصة
       (arbConsole) — اتصالات WebRTC تعاد إرفاقها بالفيديوهات الجديدة
       من خلال pc._stream بلا عروض جديدة عند اللاعب */
    container: 'adminContent',
    /* [v2.77·إصلاح الوميض] توقيعات الرسم — القائمة تُعاد فقط عند تغيّر
       توقيعها، وعناصر الفيديو الحية لا تُهدم أبداً إلا بتغيّر الجلسة
       المعروضة أو طاقم لاعبيها (كان كل تحديث يهدمها فتسودّ الشاشتان
       وتومضان دورياً أمام الأدمن كل بضع ثوانٍ). */
    listSig: '',
    viewSig: ''
  };

  /* [مهم] API معرّف بـconst في نطاق السكربت العام (رابط معجمي) فلا يظهر
     على window — الوصول بالمسمّى المجرّد حصراً */
  function api() { return (typeof API !== 'undefined' && API && typeof API.get === 'function') ? API : null; }
  function post() { return (typeof API !== 'undefined' && API && typeof API.post === 'function') ? API : null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var STATE_LBL = {
    idle: '⬜ بانتظار البث', connecting: '🟡 يتصل…', live: '🟢 مباشر',
    relay: '🟠 عبر المرحّل', failed: '🔴 منقطع'
  };

  /* ── جلب الجلسات (استطلاع خفيف كل 10ث + تحديث لحظي من SSE) ── */
  async function refresh() {
    var a = api();
    if (!a) return;
    var r = await a.get('/api/matches').catch(function () { return null; });
    if (!r || !r.ok || !r.data) return;
    (r.data.sessions || []).forEach(function (s) { st.sessions[s.room_id] = s; });
    /* أزل الجلسات التي لم تعد حية */
    var live = {};
    (r.data.sessions || []).forEach(function (s) { live[s.room_id] = 1; });
    Object.keys(st.sessions).forEach(function (rid) {
      if (!live[rid]) {
        delete st.sessions[rid];
        delete st.rt[rid];
        if (st.viewing === rid) { st.viewing = null; closePcs(rid); }
      }
    });
    render();
    refreshRt();   /* [v2.81] حالة المرحّل للجلسة المعروضة (استعلام خفيف عند الطلب) */
  }

  /* ── [v2.81·mediamtx] حالة بث المرحّل (المستند §ب) — استطلاع فقط أثناء
     عرض جلسة: يُستعلم MediaMTX محلياً خادمياً عند الطلب حصراً ── */
  function refreshRt() {
    var a = api();
    if (!a || !st.viewing || !st.sessions[st.viewing] || st.rtBusy) return;
    st.rtBusy = true;
    var roomId = st.viewing;
    a.get('/api/matches/' + encodeURIComponent(roomId) + '/stream-status').then(function (r) {
      st.rtBusy = false;
      if (!r || !r.ok || !r.data || r.data.ok !== true) return;
      st.rt[roomId] = { available: r.data.available !== false, players: {} };
      ['player_a_status', 'player_b_status'].forEach(function (k) {
        var p = r.data[k];
        if (p && p.user_id != null) st.rt[roomId].players[String(p.user_id)] = p;
      });
      renderRt(roomId);
    }).catch(function () { st.rtBusy = false; });
  }
  function rtHtml(p) {
    if (!p) return '';
    var mb = (p.bytes_rx || 0) / 1048576;
    var dur = p.stream_duration || 0;
    var mm = Math.floor(dur / 60), ss = Math.floor(dur % 60);
    var clock = (mm > 0 || ss > 0) ? ' · ' + mm + ':' + (ss < 10 ? '0' : '') + ss : '';
    if (p.online) {
      return '<span class="arb-chip arb-live">🟠 المرحّل مباشر' + esc((mb >= 0.01 ? ' · ' + (mb >= 1 ? mb.toFixed(1) + 'MB' : Math.round(mb * 1024) + 'KB') : '') + clock) + '</span>';
    }
    if (p.offline_since != null) {
      var offSec = Math.max(0, Math.round((Date.now() - p.offline_since) / 1000));
      return '<span class="arb-chip arb-failed">' + (p.alert ? '🚨' : '🔴') + ' انقطع عبر المرحّل (' + (offSec >= 60 ? Math.floor(offSec / 60) + 'د' : offSec + 'ث') + ')</span>';
    }
    return '';
  }
  function renderRt(roomId) {
    /* تحديث في المكان (بوابة توقّع لكل عنصر) — لا مسّ للفيديوهات ولا للهيكل */
    var rt = st.rt[roomId];
    if (!rt) return;
    var s = st.sessions[roomId];
    if (!s) return;
    (s.players || []).forEach(function (p) {
      var el = document.getElementById('arbRt-' + p.user_id);
      if (!el) return;
      /* [v2.81·relay] المرحّل لا يرد أصلاً (available=false): سطر الحالة
         كان يبقى فارغاً فيبدو كأن لا أحد يبث — وسم صريح يفرّق بين
         «المرحّل مطفي» و«سكت اللاعب»، ويعود تلقائياً حين يستجيب الاستطلاع */
      var html = rt.available === false
        ? '<span class="arb-chip arb-failed">⚫ ' + (T('arb.relayDown') || 'المرحّل لا يرد') + '</span>'
        : rtHtml(rt.players[String(p.user_id)]);
      if (el.dataset.sig !== html) { el.dataset.sig = html; el.innerHTML = html; }
      /* [v2.81.4·بروكسي HLS] مشغّل مشاهدة بث المرحّل — يظهر عند اتصال البث
         (online + hls_path) ويُزال عند انقطاعه؛ بلا مسّ لأي عنصر آخر */
      renderRtPlay(roomId, p, rt);
    });
  }
  /* ── [v2.81.4] مشغّل بث المرحّل (HLS عبر بروكسي المنصة) ──
     الرمز الموقّع يأتي من stream-status (hls_path) — لا يُبنى هنا إطلاقاً */
  function relayBaseUrl() {
    return (typeof root.API_BASE_URL === 'string' && root.API_BASE_URL) ? root.API_BASE_URL : '';
  }
  function stopRelayPlayer(uid) {
    var inst = st.rtHls[uid];
    if (inst) {
      try { if (inst.destroy) inst.destroy(); } catch (e) {}
      try { if (inst.video) inst.video.removeAttribute('src'); inst.video.load(); } catch (e) {}
    }
    delete st.rtHls[uid];
    var box = document.getElementById('arbRtPlay-' + uid);
    if (box) { box.dataset.on = ''; box.dataset.src = ''; box.innerHTML = ''; }
  }
  function startRelayPlayer(uid, hlsPath) {
    var box = document.getElementById('arbRtPlay-' + uid);
    if (!box || box.dataset.on === '1') return;
    box.dataset.on = '1';
    var url = relayBaseUrl() + hlsPath;
    box.innerHTML = '<div class="arb-rtp-hd"><span>' + (T('arb.rtRelayView') || '🟠 مشاهدة عبر المرحّل') + '</span>' +
      '<span class="arb-rtp-note">' + esc(T('arb.rtRelayHlsNote') || 'HLS — تأخير ثوانٍ قليلة') + '</span></div>' +
      '<video id="arbRtVid-' + esc(String(uid)) + '" autoplay playsinline muted></video>';
    var vid = document.getElementById('arbRtVid-' + uid);
    try {
      if (root.Hls && root.Hls.isSupported && root.Hls.isSupported()) {
        var hls = new root.Hls({ lowLatencyMode: true, backBufferLength: 30, maxBufferLength: 10, liveSyncDurationCount: 3 });
        hls.loadSource(url);
        hls.attachMedia(vid);
        st.rtHls[uid] = hls;
        hls.on(root.Hls.Events.ERROR, function (ev, data) {
          if (data && data.fatal) {
            stopRelayPlayer(uid);
            if (box) box.innerHTML = '<div style="padding:0 0 8px"><span class="arb-chip arb-failed">🔴 ' +
              esc(T('arb.rtRelayFail') || 'تعذر عرض بث المرحّل') + '</span></div>';
          }
        });
      } else if (vid && vid.canPlayType && vid.canPlayType('application/vnd.apple.mpegurl')) {
        vid.src = url;                 /* Safari: HLS أصلي */
        st.rtHls[uid] = { native: true, video: vid };
      } else {
        box.innerHTML = '<div style="padding:0 0 8px"><span class="arb-chip arb-failed">🔴 ' +
          esc(T('arb.rtRelayNoSupport') || 'المتصفح لا يدعم عرض HLS') + '</span></div>';
      }
    } catch (e) { stopRelayPlayer(uid); }
  }
  function renderRtPlay(roomId, p, rt) {
    var uid = String(p.user_id);
    var box = document.getElementById('arbRtPlay-' + uid);
    if (!box) return;
    var rp = rt.players[uid];
    var want = (rt.available !== false && rp && rp.online && rp.hls_path) ? rp.hls_path : '';
    if (want) {
      if (box.dataset.on !== '1' || box.dataset.src !== want) {
        stopRelayPlayer(uid);
        box.dataset.src = want;
        startRelayPlayer(uid, want);
      }
    } else if (box.dataset.on === '1' || box.innerHTML) {
      stopRelayPlayer(uid);
    }
  }
  function startPolling() {
    stopPolling();
    st.pollTi = setInterval(refresh, 10000);
    refresh();
  }
  function stopPolling() {
    if (st.pollTi) { clearInterval(st.pollTi); st.pollTi = null; }
  }

  /* هل المستخدم الحالي أدمن/سوبر؟ — الوحدة لا تعمل إلا عندهم: هي محمّلة
     في index.html للجميع، وبلا هذا الحارس كانت صفحات اللاعبين تجيب عروض
     البث كلوحات تحكيم متطفلة فتفسد اتصال الأدمن الحقيقي (جوابان لعرض
     واحد = Called in wrong state عند اللاعب) */
  function iAmAdmin() {
    try {
      const u = (typeof AUTH !== 'undefined' && AUTH && AUTH.user) || (typeof ST !== 'undefined' && ST && ST.user) || null;
      return !!(u && u.role && u.role !== 'user');
    } catch (e) { return false; }
  }

  /* ── أحداث SSE (من live.js) ── */
  function onEvent(name, d) {
    if (!d || !iAmAdmin()) return;
    if (name === 'arb:session' && d.session) {
      st.sessions[d.room_id] = d.session;
      if (d.reason === 'timeout' && d.user_id != null) {
        var s = st.sessions[d.room_id];
        var p = s && (s.players || []).filter(function (x) { return x.user_id === d.user_id; })[0];
        /* [v2.81·أمن] اسم اللاعب يمرّ بـesc: التنبيه يُكتب بـinnerHTML في
           toast()، وصف قديم فيه «<» (loadUsersFromDB ينسخه حرفياً) كان
           سينفّذ HTML في جلسة السوبر-أدمن — وحسمه يُفرج عن الإيداعات */
        if (root.toast) root.toast('⚠️ انقطع بث ' + esc((p && p.username) || 'لاعب') + ' — تابع الجلسة', 'err');
      }
      render();
    } else if (name === 'arb:signal') {
      onSignal(d);
    } else if (name === 'arb:stream') {
      /* [v2.81·mediamtx] تنبيه انقطاع/عودة بث المرحّل (خادمياً عند تجاوز مهلة
         المراقبة 30ث — القرار للأدمن، لا حركة مال آلية) */
      var rtR = st.rt[d.room_id];
      if (rtR && d.user_id != null && rtR.players[String(d.user_id)]) {
        rtR.players[String(d.user_id)].online = !!d.online;
        rtR.players[String(d.user_id)].alert = !d.online && d.kind === 'offline';
        rtR.players[String(d.user_id)].offline_since = d.online ? null : (d.at || Date.now());
        renderRt(d.room_id);
      }
      if (d.kind === 'offline') {
        /* [v2.81·أمن] نفس القاعدة: أسماء اللاعبين من الخادم تُهرَّب قبل
           innerHTML (التنبيه) — النص العربي الثابت يُترك كما هو */
        if (root.toast) root.toast('🚨 انقطع بث المرحّل للـ ' + esc(d.username || 'لاعب') + ' — راجع الجلسة', 'err');
      } else if (d.kind === 'recovered') {
        if (root.toast) root.toast('🟠 عاد بث ' + esc(d.username || 'لاعب') + ' عبر المرحّل', 'ok');
      }
    } else if (name === 'arb:resolved') {
      delete st.sessions[d.room_id];
      if (st.viewing === d.room_id) { st.viewing = null; closePcs(d.room_id); }
      if (root.toast) root.toast('✅ حُسمت جلسة التحكيم — وُزّعت الأرباح', 'ok');
      render();
    }
  }

  /* ── استقبال عروض البث: جواب WebRTC لكل لاعب يعرض شاشته ── */
  async function onSignal(msg) {
    if (!msg || !msg.room_id) return;
    var roomId = msg.room_id;
    /* نتجاهل إشارات الجلسات غير المعروضة إلا العرض: نفتح العرض تلقائياً
       إذا كان تبويب التحكيم هو النشط (تجربة الأدمن: أول بث يصل يُعرض) */
    if (msg.kind === 'offer') {
      if (st.viewing !== roomId) openView(roomId);
    }
    var pcs = st.pcs[roomId];
    if (!pcs) return;
    var fromId = String(msg.from);
    try {
      if (msg.kind === 'offer') {
        /* اتصال استقبالي جديد لهذا اللاعب */
        closePc(roomId, fromId);
        var pc = new root.RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pcs[fromId] = pc;
        pc.addEventListener('track', function (ev) {
          /* نحفظ المجرى على الاتصال — قد يصل قبل رسم عناصر الفيديو (لوحة
             مغلقة): render() يعيد الإرفاق عند الفتح (بلا عرض جديد ثقيل) */
          if (ev.streams && ev.streams[0]) pc._stream = ev.streams[0];
          var vid = document.getElementById('arbvid-' + fromId);
          if (vid && ev.streams && ev.streams[0]) {
            vid.srcObject = ev.streams[0];
            vid.play().catch(function () {});
            markPlayerLive(roomId, fromId);
          }
        });
        pc.addEventListener('icecandidate', function (ev) {
          if (ev.candidate) sendSignal(roomId, 'ice', { candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate }, fromId);
        });
        pc.addEventListener('connectionstatechange', function () {
          if (pc.connectionState === 'failed') {
            var vid = document.getElementById('arbvid-' + fromId);
            if (vid) vid.removeAttribute('srcobject');
            markPlayerState(roomId, fromId, 'failed');
          }
        });
        await pc.setRemoteDescription({ type: 'offer', sdp: msg.payload.sdp });
        var answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        /* [مهم] نص الـSDP حصراً (.sdp) — الكائن يصبح [object Object] عند
           إعادة البناء بـ{type, sdp} عند اللاعب (نفس جذر عرض اللاعب) */
        await sendSignal(roomId, 'answer', { sdp: pc.localDescription.sdp }, fromId);
      } else if (msg.kind === 'ice') {
        var pc2 = pcs[fromId];
        if (pc2 && msg.payload && msg.payload.candidate) {
          try { await pc2.addIceCandidate(msg.payload.candidate); } catch (e) {}
        }
      } else if (msg.kind === 'bye') {
        closePc(roomId, fromId);
        var vid2 = document.getElementById('arbvid-' + fromId);
        if (vid2) { try { vid2.srcObject = null; } catch (e) {} }
        markPlayerState(roomId, fromId, 'idle');
      }
    } catch (e) {
      if (root.console) console.error('[arb-admin] signal', e);
    }
  }

  function sendSignal(roomId, kind, payload, to) {
    var a = post();
    if (!a) return Promise.resolve(null);
    return a.post('/api/arb/signal', { room_id: roomId, kind: kind, payload: payload || {}, to: to || null }).catch(function () { return null; });
  }
  function closePc(roomId, userId) {
    var pcs = st.pcs[roomId];
    if (pcs && pcs[String(userId)]) {
      try { pcs[String(userId)].close(); } catch (e) {}
      delete pcs[String(userId)];
    }
  }
  function closePcs(roomId) {
    var pcs = st.pcs[roomId];
    if (pcs) Object.keys(pcs).forEach(function (uid) { try { pcs[uid].close(); } catch (e) {} });
    delete st.pcs[roomId];
  }
  function markPlayerLive(roomId, userId) { markPlayerState(roomId, userId, 'live'); }
  function markPlayerState(roomId, userId, state) {
    var el = document.getElementById('arbstate-' + userId);
    if (el) el.textContent = STATE_LBL[state] || state;
  }

  /* ── فتح عرض جلسة ── */
  function openView(roomId) {
    st.viewing = roomId;
    if (!st.pcs[roomId]) st.pcs[roomId] = {};
    render();
    /* إعادة عرض فقط لمن اتصاله قائم فعلاً (live — عرضه السابق اقترن
       بمشاهد سابق/ميت): حالة connecting تعني عرضاً في الطريق سيُجاب
       مباشرة — إرسال rewatch لها كان يعيد اللاعب بناء اتصاله وهو ينتظر
       جواب عرضه الأصلي فتتنافس الأجوبة (حلقة سباق تمنع اكتمال الاتصال) */
    var s = st.sessions[roomId];
    if (s) (s.players || []).forEach(function (p) {
      if (p.state === 'live') sendSignal(roomId, 'rewatch', {}, p.user_id);
    });
  }

  /* ── الحسم (أزرار الأدمن) ── */
  async function resolve(roomId, winnerId, status) {
    var a = post();
    if (!a) return null;
    var body = { status: status || 'completed' };
    if (winnerId != null) body.winner_id = winnerId;
    var r = await a.post('/api/matches/' + encodeURIComponent(roomId) + '/resolve', body).catch(function () { return null; });
    if (!r || !r.ok) {
      if (root.toast) root.toast(esc((r && r.data && r.data.message) || 'تعذر الحسم'), 'err');
      return r;
    }
    closePcs(roomId);
    delete st.sessions[roomId];
    if (st.viewing === roomId) st.viewing = null;
    render();
    return r;
  }
  async function cancelMatch(roomId) {
    var a = post();
    if (!a) return;
    if (!root.confirm || root.confirm('إلغاء المباراة وإرجاع رهانات اللاعبين؟')) {
      var r = await a.post('/api/matches/' + encodeURIComponent(roomId) + '/cancel', {}).catch(function () { return null; });
      if (!r || !r.ok) {
        if (root.toast) root.toast(esc((r && r.data && r.data.message) || 'تعذر الإلغاء'), 'err');
        return;
      }
      closePcs(roomId);
      delete st.sessions[roomId];
      if (st.viewing === roomId) st.viewing = null;
      render();
    }
  }

  /* ── الرسم ── */
  function render() {
    /* [v2.77] الحاوية الهدف (التبويب أو صفحة التحكيم) — إن اختفت من
       الشجرة (مثلاً فُكّت) نتوقف بهدوء دون كسر الاستطلاع */
    var el = document.getElementById(st.container);
    if (!el) return;

    /* القسم 1: قائمة الجلسات — ببوابة توقّع (لا تُعاد إلا عند تغيّر
       المحتوى الفعلي: جلسات/حالات/معروض) */
    var listHtml = listHtmlOf();
    if (st.listSig !== listHtml) {
      st.listSig = listHtml;
      var listBox = document.getElementById('arbList');
      if (listBox) listBox.innerHTML = listHtml;
    }

    /* القسم 2: تفصيل الجلسة المعروضة (بث مزدوج + أزرار الحسم) — لا يُهدم
       إلا بتغيّر الجلسة أو طاقم لاعبيها؛ تحديثات الحالة تمسّ التسميات
       في مكانها عبر markPlayerState فلا تسودّ الفيديوهات أبداً */
    var viewBox = document.getElementById('arbView');
    var viewHtml = viewHtmlOf();
    var viewSig = st.viewing + '|' + (st.sessions[st.viewing]
      ? (st.sessions[st.viewing].players || []).map(function (p) { return p.user_id; }).join(',')
      : '');
    if (st.viewSig !== viewSig) {
      st.viewSig = viewSig;
      if (viewBox) viewBox.innerHTML = viewHtml;
    }

    /* [v2.75·تحكيم] إعادة إرفاق مجارٍ وصلت قبل الرسم (لوحة فتحت متأخرة):
       المسار محفوظ على الاتصال — لا حاجة لعرض WebRTC جديد عند اللاعب */
    try {
      var pcs2 = st.pcs[st.viewing];
      if (pcs2) Object.keys(pcs2).forEach(function (uid) {
        var pc3 = pcs2[uid];
        if (pc3 && pc3._stream) {
          var vid3 = document.getElementById('arbvid-' + uid);
          if (vid3 && !vid3.srcObject) { vid3.srcObject = pc3._stream; vid3.play().catch(function () {}); }
        }
      });
    } catch (e) {}
  }

  /* توقيع القائمة + بناؤها */
  function listHtmlOf() {
    var list = Object.keys(st.sessions);
    if (!list.length) {
      return '<div class="note">📺 ' + (T('arb.none') || 'لا جلسات تحكيم نشطة — حين يشارك لاعب شاشته أثناء جولة ستظهر جلسته هنا فوراً') + '</div>';
    }
    var html = '';
    list.forEach(function (roomId) {
      var s = st.sessions[roomId];
      var states = (s.players || []).map(function (p) {
        return '<span class="arb-chip arb-' + esc(p.state) + '">' + (STATE_LBL[p.state] || esc(p.state)) + '</span>';
      }).join(' ');
      html += '<div class="arb-card' + (st.viewing === roomId ? ' open' : '') + '" onclick="ARB_ADMIN.openView(\'' + esc(roomId) + '\')">' +
        '<div class="arb-card-head">' +
          '<span class="arb-room">🎮 ' + esc(s.code || roomId) + ' · ' + esc(gameName(s.game_id)) + '</span>' +
          '<span class="arb-bet">🪙 ' + (s.bet || 0) + '</span>' +
        '</div>' +
        '<div class="arb-players">' + (s.players || []).map(function (p) {
          return '<span>' + esc(p.username) + ' ' + (p.state === 'live' ? '🟢' : p.state === 'failed' ? '🔴' : '⬜') + '</span>';
        }).join(' · ') + '</div>' +
        '<div class="arb-states">' + states + '</div>' +
      '</div>';
    });
    return html;
  }

  /* توقيع العرض + بناؤه — يتضمن طاقم اللاعبين (معرّفاتهم) لا حالاتهم:
     تغيّر الحالة وحده لا يهدم الفيديو (تُحدَّث التسمية في مكانها) */
  function viewHtmlOf() {
    if (!st.viewing || !st.sessions[st.viewing]) return '';
    var v = st.sessions[st.viewing];
    var vids = (v.players || []).map(function (p, i) {
      /* [v2.81·mediamtx] سطر حالة المرحّل (arbRt-*) يُحدَّث في مكانه من
         استطلاع stream-status (10ث) وحدث arb:stream — بلا مسّ للفيديو */
      return '<div class="arb-vbox">' +
        '<div class="arb-vname">' + (i === 0 ? '🅰️' : '🅱️') + ' ' + esc(p.username) +
          ' <span id="arbstate-' + esc(String(p.user_id)) + '">' + (STATE_LBL[p.state] || esc(p.state)) + '</span></div>' +
        '<video id="arbvid-' + esc(String(p.user_id)) + '" autoplay playsinline muted></video>' +
        '<div class="arb-rt" id="arbRt-' + esc(String(p.user_id)) + '"></div>' +
        '<div class="arb-rtplay" id="arbRtPlay-' + esc(String(p.user_id)) + '"></div>' +
      '</div>';
    }).join('');
    return '<div class="arb-view">' +
      '<div class="arb-view-title">👁️ ' + (T('arb.liveView') || 'المشاهدة المباشرة') + ' — ' + esc(v.code || v.room_id) + '</div>' +
      '<div class="arb-vgrid">' + vids + '</div>' +
      '<div class="arb-actions">' +
        (v.players && v.players[0] ? '<button type="button" class="btn half gold" onclick="ARB_ADMIN.resolve(\'' + esc(v.room_id) + '\',' + Number(v.players[0].user_id) + ')">✅ ' + (T('arb.winA') || 'تأكيد فوز اللاعب الأول') + '</button>' : '') +
        (v.players && v.players[1] ? '<button type="button" class="btn half gold" onclick="ARB_ADMIN.resolve(\'' + esc(v.room_id) + '\',' + Number(v.players[1].user_id) + ')">✅ ' + (T('arb.winB') || 'تأكيد فوز اللاعب الثاني') + '</button>' : '') +
        '<button type="button" class="btn half" onclick="ARB_ADMIN.resolve(\'' + esc(v.room_id) + '\',null,\'disputed\')">⚖️ ' + (T('arb.disputed') || 'نزاع — إرجاع للجميع') + '</button>' +
        '<button type="button" class="btn half danger" onclick="ARB_ADMIN.cancelMatch(\'' + esc(v.room_id) + '\')">❌ ' + (T('arb.cancel') || 'إلغاء المباراة / إرجاع الأموال') + '</button>' +
      '</div>' +
    '</div>';
  }

  function gameName(gid) {
    /* [v2.78·تحكيم] غرف المعرّف arb (تبويب القائمة) — تسمية التحكيم الموحدة */
    if (gid === 'arb') return (typeof T === 'function' && T('rs.arbRoomName')) || 'غرفة تحكيم مباشر';
    try {
      if (root.GAMES) {
        for (var i = 0; i < root.GAMES.length; i++) if (root.GAMES[i].id === gid) return root.gname ? gname(root.GAMES[i]) : (root.GAMES[i].n && root.GAMES[i].n[0]) || gid;
      }
    } catch (e) {}
    return gid || '—';
  }

  /* تركيب اللوحة (تناديه adminLoadArb من main.js أو صفحة التحكيم v2.76)
     [v2.76] الحاوية معامل اختياري: بلا معامل = تبويب لوحة الأدمن
     [v2.77] الهيكل ثابت (قائمة + عرض منفصلان) — إعادة الرسم مساحتان
     مستقلتان فلا تُمسّ عناصر الفيديو عند تحديث القائمة والعكس */
  function mount(containerId) {
    if (!iAmAdmin()) return;   /* حارس مضاعف: أدمن/سوبر حصراً أصل */
    st.container = containerId || 'adminContent';
    var el = document.getElementById(st.container);
    if (el) {
      el.innerHTML = '<div id="arbList"></div><div id="arbView"></div>';
    }
    st.listSig = '';
    st.viewSig = '';
    startPolling();
    render();
  }
  function unmount() {
    stopPolling();
    Object.keys(st.pcs).forEach(closePcs);
    /* [v2.81.4] تفكيك مشغّلات بث المرحّل (مصادر HLS نشطة) */
    Object.keys(st.rtHls).forEach(stopRelayPlayer);
    st.rtHls = {};
    st.viewing = null;
    st.listSig = '';
    st.viewSig = '';
  }

  /* [v2.76·صفحة التحكيم] ملخّص إحصائي لرأس الصفحة (بلا استعلام إضافي —
     من نفس حالة اللوحة) */
  function summary() {
    var total = Object.keys(st.sessions).length;
    var streaming = 0;
    Object.keys(st.sessions).forEach(function (rid) {
      (st.sessions[rid].players || []).forEach(function (p) {
        if (p.state === 'live' || p.state === 'relay' || p.state === 'connecting') streaming++;
      });
    });
    return { total: total, streaming: streaming };
  }

  root.ARB_ADMIN = {
    onEvent: onEvent,
    openView: openView,
    resolve: resolve,
    cancelMatch: cancelMatch,
    mount: mount,
    unmount: unmount,
    summary: summary
  };
})(typeof window !== 'undefined' ? window : this);
