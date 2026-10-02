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
    mediamtx: null
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
        if (st.viewing === rid) { st.viewing = null; closePcs(rid); }
      }
    });
    render();
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
        if (root.toast) root.toast('⚠️ انقطع بث ' + ((p && p.username) || 'لاعب') + ' — تابع الجلسة', 'err');
      }
      render();
    } else if (name === 'arb:signal') {
      onSignal(d);
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
      if (root.toast) root.toast((r && r.data && r.data.message) || 'تعذر الحسم', 'err');
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
        if (root.toast) root.toast((r && r.data && r.data.message) || 'تعذر الإلغاء', 'err');
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
    var el = document.getElementById('adminContent');
    if (!el) return;
    var list = Object.keys(st.sessions);
    var html = '';

    if (!list.length) {
      html = '<div class="note">📺 ' + (T('arb.none') || 'لا جلسات تحكيم نشطة — حين يشارك لاعب شاشته أثناء جولة ستظهر جلسته هنا فوراً') + '</div>';
    } else {
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
    }

    /* تفصيل الجلسة المعروضة: بث مزدوج + أزرار الحسم */
    if (st.viewing && st.sessions[st.viewing]) {
      var v = st.sessions[st.viewing];
      var vids = (v.players || []).map(function (p, i) {
        return '<div class="arb-vbox">' +
          '<div class="arb-vname">' + (i === 0 ? '🅰️' : '🅱️') + ' ' + esc(p.username) +
            ' <span id="arbstate-' + esc(String(p.user_id)) + '">' + (STATE_LBL[p.state] || esc(p.state)) + '</span></div>' +
          '<video id="arbvid-' + esc(String(p.user_id)) + '" autoplay playsinline muted></video>' +
        '</div>';
      }).join('');
      html += '<div class="arb-view">' +
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

    el.innerHTML = html;
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

  function gameName(gid) {
    try {
      if (root.GAMES) {
        for (var i = 0; i < root.GAMES.length; i++) if (root.GAMES[i].id === gid) return root.gname ? gname(root.GAMES[i]) : (root.GAMES[i].n && root.GAMES[i].n[0]) || gid;
      }
    } catch (e) {}
    return gid || '—';
  }

  /* تركيب التبويب (تناديه adminLoadArb من main.js) */
  function mount() {
    if (!iAmAdmin()) return;   /* حارس مضاعف: التبويب أدمن حصراً أصل */
    startPolling();
    render();
  }
  function unmount() {
    stopPolling();
    Object.keys(st.pcs).forEach(closePcs);
    st.viewing = null;
  }

  root.ARB_ADMIN = {
    onEvent: onEvent,
    openView: openView,
    resolve: resolve,
    cancelMatch: cancelMatch,
    mount: mount,
    unmount: unmount
  };
})(typeof window !== 'undefined' ? window : this);
