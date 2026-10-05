/* ═══════════════════════════════════════════════════════════════════════════
   [v2.83] LocalMP — الغرفة المحلية: اللعب مع الأصدقاء عبر شبكة الواي فاي
   أو مشاركة البلوتوث (tethering) داخل تطبيق الأندرويد والموقع — بلا إنترنت
   ───────────────────────────────────────────────────────────────────────────
   المبدأ: WebRTC DataChannel قناة مباشرة جهاز-إلى-جهاز على الشبكة المحلية
   (iceServers: [] ⇒ مرشحو المضيف بعناوين LAN حصراً — لا خادم ولا إنترنت).
   «البلوتوث»: مشاركة اتصال الهاتف عبر البلوتوث (Bluetooth tethering) تُنشئ
   شبكة محلية بين الجهازين فيسري عليها نفس مسار الواي فاي تماماً.

   البصمة المضغوطة: بدل تبادل SDP كاملاً (~1.5KB) نستخرج الحقول الحاكمة فقط
   (ice-ufrag · ice-pwd · بصمة DTLS · setup · المرشحون الخاصيون) في رمز
   ~120-260 حرفاً يُعرض رمز QR (QRMini المُستضاف محلياً) أو يُنسخ نصاً.
   المضيف يعرض رمز الجلسة ⇐ الضيف يمسحه (كاميرا + jsQR المُستضاف محلياً)
   أو يلصقه ⇐ يُنشئ رمز الإجابة ويعرضه ⇐ المضيف يمسحه/يلصقه ⇐ اتصال مباشر.

   العمارة: «المضيف مرحّل» — جهاز المضيف يقوم بدور الخادم للغرفة (يبني
   كائن الغرفة بنفس شكل serializeRoom الخادمي، يبثّ room:update وroom:move
   لكل الأطراف، يجمع الجاهزية، يبدأ الجولة). التدخل في Rooms جراحي إضافي:
   لا سطر واحد في rooms.js يُمسّ — local-mp يغلّف نقاط النقل الثمانية عند
   التحميل ويوجّهها للطبقة المحلية حصراً حين الغرفة المحلية نشطة، فيعمل
   كل نظام الغرف القائم (اللوبي، الجاهزية، البدء، الحركات، السجل) كما هو.

   المال: الغرف المحلية ودّية بلا رهان (bet=0) — عقد المال من الخادم وحده.
   الهوية: إن لم يكن المستخدم مسجلاً (بلا إنترنت) تُنشأ هوية محلية مؤقتة
   (معرّف سالب كي لا تتصادم مع معرّفات الخادم) تُصفَّر عند الخروج.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var APIV = 'v283';

  /* ── الحالة ── */
  var S = {
    mode: null,            /* 'host' | 'guest' */
    gameId: null,          /* لعبة الغرفة */
    room: null,            /* كائن الغرفة (المرجع عند المضيف، نسخة عند الضيف) */
    history: [],           /* سجل الحركات (لإعادة البناء — المضيف حصراً) */
    votes: {},             /* تصويت الريماتش */
    settleDone: false,
    pendingPair: null,     /* {pc, chan, offerCode} زوج قيد الإنشاء */
    peers: [],             /* المضيف: [{pc, chan, userId, name}] */
    guestChan: null,       /* الضيف: قناة الاتصال بالمضيف */
    localIdentity: false,  /* أنشأنا هوية محلية مؤقتة؟ */
    destroyed: false
  };
  var LAN_PREFIX = 'L1.';

  function log() { try { if (root.console && root.console.log) root.console.log.apply(console, ['[local-mp]'].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { if (root.console && root.console.warn) root.console.warn.apply(console, ['[local-mp]'].concat([].slice.call(arguments))); } catch (e) {} }
  function T(k, fb) {
    try { var t = root.T; if (t) { var v = t(k); if (v && v !== k) return v; } } catch (e) {}
    return fb || k;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function myId() { return (root.AUTH && root.AUTH.user) ? root.AUTH.user.id : null; }
  function myName() { return (root.AUTH && root.AUTH.user) ? String(root.AUTH.user.username || 'Player') : 'Player'; }

  /* ═══════════ 1) الهوية المحلية (بلا إنترنت) ═══════════ */
  function ensureLocalIdentity(name) {
    if (root.AUTH && root.AUTH.user) return true;
    var nm = String(name || '').trim().slice(0, 14);
    if (!nm) return false;
    root.AUTH = root.AUTH || {};
    root.AUTH.user = {
      id: -(Date.now() % 100000 + 1000),   /* سالب = محلي، لا تصادم مع الخادم */
      username: nm,
      gold: 0,
      role: 'user',
      lang: (typeof ST !== 'undefined' && ST.lang) || 'ar',
      local: true
    };
    S.localIdentity = true;
    try { if (typeof renderAuthChip === 'function') renderAuthChip(); } catch (e) {}
    return true;
  }
  function dropLocalIdentity() {
    if (!S.localIdentity) return;
    if (root.AUTH) root.AUTH.user = null;
    S.localIdentity = false;
    try { if (typeof renderAuthChip === 'function') renderAuthChip(); } catch (e) {}
  }

  /* ═══════════ 2) الإشارة المضغوطة (WebRTC بلا خادم إشارة) ═══════════ */
  var SDP_RE = {
    ufrag: /a=ice-ufrag:(\S+)/,
    pwd: /a=ice-pwd:(\S+)/,
    fp: /a=fingerprint:sha-256\s+([0-9A-Fa-f:]+)/,
    setup: /a=setup:(\S+)/,
    sctp: /a=sctp-port:(\d+)/
  };
  function sdpFields(sdp) {
    var m;
    var out = {};
    if ((m = SDP_RE.ufrag.exec(sdp))) out.u = m[1];
    if ((m = SDP_RE.pwd.exec(sdp))) out.p = m[1];
    if ((m = SDP_RE.fp.exec(sdp))) out.f = m[1].replace(/:/g, '').toLowerCase();
    if ((m = SDP_RE.setup.exec(sdp))) out.s = m[1];
    if ((m = SDP_RE.sctp.exec(sdp))) out.q = m[1];
    return out;
  }
  /* المرشحون الخاصيون بعناوين LAN (خاصية IPv4) — أساس الاتصال المباشر.
     [v2.83·تصحيحان] ① مرشحو ICE يصلون عبر حدث onicecandidate ولا يُكتبون في
     localDescription.sdp (trickle) — نجمعهما من الحدث أساساً ومن SDP احتياطاً.
     ② متصفح كروم يحجب عناوين LAN خلف أسماء mDNS (‎*.local تُحل عبر البثّ
     المتعدد على الشبكة نفسها فيعمل بين جهازين حقيقيين على LAN) — نقبلها كخيار
     احتياطي بعد عناوين IPv4 الصريحة (WebView يخرج العناوين الحقيقية مباشرة). */
  function lanCandidates(pc, sdp) {
    var seen = {}, list = [], mdns = [], others = [];
    var push = function (cStr) {
      if (!cStr) return;
      if (!/ typ host/.test(cStr)) return;
      var m = /candidate:(\S+)\s+1\s+udp\s+(\d+)\s+(\S+)\s+(\d+)\s+typ host/.exec(cStr);
      if (!m) return;
      var ip = m[3];
      var priv = /^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
      var key = ip + ':' + m[4];
      if (seen[key]) return;
      if (priv) { seen[key] = 1; list.push([m[1], m[2], ip, m[4]]); }
      else if (/\.local$/i.test(ip)) { seen[key] = 1; mdns.push([m[1], m[2], ip, m[4]]); }
      else { seen[key] = 1; others.push([m[1], m[2], ip, m[4]]); }
    };
    (Array.isArray(pc) ? pc : []).forEach(push);            /* نصوص المرشحين من الحدث */
    (sdp || '').split('\n').forEach(function (l) { if (/^a=candidate:/.test(l.trim())) push(l.trim().slice(2)); });
    if (list.length) return list.slice(0, 3);               /* ① IPv4 خاص */
    if (mdns.length) return mdns.slice(0, 2);               /* ② mDNS (كروم على LAN حقيقية) */
    return others.slice(0, 2);                              /* ③ أي مرشح مضيف (شبكات ببطاقة عامة) */
  }
  /* جمع مرشحي الحدث حتى اكتمال التجميع */
  function collectCandidates(pc) {
    pc._cands = pc._cands || [];
    pc.addEventListener('icecandidate', function (ev) {
      if (ev.candidate && ev.candidate.candidate) pc._cands.push(ev.candidate.candidate);
    });
    return pc;
  }
  function buildSdp(f, cands, isAnswer) {
    var candLines = (cands || []).map(function (c) {
      return 'a=candidate:' + c[0] + ' 1 udp ' + c[1] + ' ' + c[2] + ' ' + c[3] + ' typ host';
    }).join('\r\n') + '\r\n';
    return 'v=0\r\n' +
      'o=- 0 0 IN IP4 127.0.0.1\r\n' +
      's=-\r\n' +
      't=0 0\r\n' +
      'a=group:BUNDLE 0\r\n' +
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' +
      'c=IN IP4 0.0.0.0\r\n' +
      'a=ice-ufrag:' + f.u + '\r\n' +
      'a=ice-pwd:' + f.p + '\r\n' +
      'a=ice-options:trickle\r\n' +
      'a=fingerprint:sha-256 ' + (f.f || '').replace(/(..)(?=.)/g, '$1:').toUpperCase() + '\r\n' +
      'a=setup:' + (isAnswer ? 'active' : 'actpass') + '\r\n' +
      'a=mid:0\r\n' +
      'a=sctp-port:' + (f.q || 5000) + '\r\n' +
      'a=max-message-size:262144\r\n' +
      candLines;
  }
  function packCode(fields, cands) {
    var payload = { u: fields.u, p: fields.p, f: fields.f, q: fields.q, c: cands };
    var json = JSON.stringify(payload);
    var b64;
    try { b64 = root.btoa(unescape(encodeURIComponent(json))); }
    catch (e) { b64 = root.btoa(json); }
    return LAN_PREFIX + b64;
  }
  function unpackCode(code) {
    code = String(code || '').trim();
    if (code.indexOf(LAN_PREFIX) !== 0) return null;
    try {
      var json = decodeURIComponent(escape(root.atob(code.slice(LAN_PREFIX.length))));
      var o = JSON.parse(json);
      if (!o || !o.u || !o.p || !o.f) return null;
      if (!o.c || !o.c.length) return null;
      return o;
    } catch (e) { return null; }
  }
  function newPC() {
    return new root.RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 0 });
  }
  function gatherComplete(pc, timeoutMs) {
    /* LAN: المرشحون المحليون سريعون عادة — ننتظر اكتمال الجمع أو مهلة قصيرة.
       [v2.84·Android] على WebView بالهاتف قد يتأخر عدّ واجهات الشبكة
       (واي فاي + بلوتوث tethering) عن 1.6ث فتُرفض الغرفة بـ«no-lan» خطأً
       (بلاغ المالك: خلل فتح الغرفة المحلية عبر التطبيق). الآن: ننتظر
       الاكتمال أو أول مرشح + مهلة سماح 900ms أو سقفاً صلباً 4ث —
       من يحرّك الشبكة أبطأ يظل قابلاً للاستقبال. */
    timeoutMs = timeoutMs || 4000;
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === 'complete') return resolve(true);
      var done = false;
      var fin = function () { if (!done) { done = true; clearInterval(iv); clearTimeout(hard); resolve(true); } };
      var iv = setInterval(function () { if (pc.iceGatheringState === 'complete') fin(); }, 120);
      pc.addEventListener('icegatheringstatechange', function () { if (pc.iceGatheringState === 'complete') fin(); });
      /* أول مرشح ثم سماح 900ms — يكفي لمرشح LAN واحد ليبني الرمز */
      var graceTmr = null;
      var cand = function () {
        if (done || graceTmr) return;
        if ((pc._cands || []).length > 0) graceTmr = setTimeout(fin, 900);
      };
      pc.addEventListener('icecandidate', function (ev) { if (ev.candidate) cand(); });
      cand();
      var hard = setTimeout(fin, timeoutMs);
    });
  }

  /* المضيف: يُنشئ عرضاً مضغوطاً (رمز QR للضيف) */
  function hostMakeOffer(onCode) {
    return new Promise(function (resolve, reject) {
      var pc;
      try { pc = collectCandidates(newPC()); } catch (e) { return reject(new Error('webrtc-unsupported')); }
      var chan = pc.createDataChannel('dtsg', { ordered: true });
      var created = false;
      pc.createOffer().then(function (offer) {
        return pc.setLocalDescription(offer);
      }).then(function () {
        return gatherComplete(pc, 4000);
      }).then(function () {
        var f = sdpFields(pc.localDescription.sdp || '');
        var c = lanCandidates(pc._cands, pc.localDescription.sdp || '');
        /* لا مرشحو LAN (شبكة غير خاصة؟) — نرفض بوضوح بدل اتصال مستحيل */
        if (!c.length) { try { pc.close(); } catch (e) {} return reject(new Error('no-lan')); }
        var code = packCode(f, c);
        if (!created) { created = true; onCode && onCode(code); }
        resolve({ pc: pc, chan: chan, offerCode: code });
      }).catch(function (e) { try { pc.close(); } catch (x) {} reject(e); });
      /* شبكة أمان: مرشحو الحدث وصلوا مبكراً — نصدر الرمز فور توفر الحقول */
      setTimeout(function () {
        if (created || !pc.localDescription) return;
        var f = sdpFields(pc.localDescription.sdp || '');
        var c = lanCandidates(pc._cands, pc.localDescription.sdp || '');
        if (f.u && c.length && !created) {
          created = true;
          var code = packCode(f, c);
          onCode && onCode(code);
          resolve({ pc: pc, chan: chan, offerCode: code });
        }
      }, 2400);
    });
  }

  /* الضيف: يستقبل رمز المضيف ويردّ برمز إجابة */
  function guestAnswer(hostCode) {
    var o = unpackCode(hostCode);
    if (!o) return Promise.reject(new Error('bad-code'));
    return new Promise(function (resolve, reject) {
      var pc;
      try { pc = collectCandidates(newPC()); } catch (e) { return reject(new Error('webrtc-unsupported')); }
      pc.setRemoteDescription({ type: 'offer', sdp: buildSdp(o, o.c, false) }).then(function () {
        return pc.createAnswer();
      }).then(function (ans) {
        return pc.setLocalDescription(ans);
      }).then(function () {
        return gatherComplete(pc, 4000);
      }).then(function () {
        var f = sdpFields(pc.localDescription.sdp || '');
        var c = lanCandidates(pc._cands, pc.localDescription.sdp || '');
        if (!f.u || !c.length) { try { pc.close(); } catch (e) {} return reject(new Error('no-lan')); }
        var answerCode = packCode(f, c);
        pc.addEventListener('datachannel', function (ev) { resolve({ pc: pc, chan: ev.channel, answerCode: answerCode }); });
        /* المضيف سيكمل الوصف البعيد خلال ثوانٍ — إن فشل نطلق المهلة */
        setTimeout(function () { resolve({ pc: pc, chan: null, answerCode: answerCode }); }, 8000);
      }).catch(function (e) { try { pc.close(); } catch (x) {} reject(e); });
    });
  }

  /* المضيف: يستقبل رمز إجابة الضيف فيتمّ الاتصال */
  function hostAcceptAnswer(pair, answerCode) {
    var o = unpackCode(answerCode);
    if (!o) return Promise.reject(new Error('bad-code'));
    return pair.pc.setRemoteDescription({ type: 'answer', sdp: buildSdp(o, o.c, true) });
  }

  /* ═══════════ 3) بروتوكول الرسائل (JSON عبر DataChannel) ═══════════
     hello {userId, name}              ضيف→مضيف عند فتح القناة
     welcome {room}                     مضيف→ضيف (الحالة الرسمية)
     room {room}                        مضيف→الكل عند أي تغيير
     move {d}                           ثنائي الاتجاه — المضيف يرحّل للجميع
     settle {result}                    مضيف→الكل (نهاية جولة ودّية)
     replay {history}                   مضيف→ضيف طلبها
     bye {userId}                       مغادرة */
  function sendRaw(chan, obj) {
    try { if (chan && chan.readyState === 'open') chan.send(JSON.stringify(obj)); } catch (e) { warn('send', e && e.message); }
  }
  function broadcast(obj, exceptChan) {
    S.peers.forEach(function (p) {
      if (p.chan !== exceptChan) sendRaw(p.chan, obj);
    });
  }
  function feedMove(d) {
    /* نفس دلالة بثّ الخادم: يمرّ عبر معالج الغرف القائم (مع تصفية صدى الذات) */
    try { root.Rooms._onMove(d); } catch (e) { warn('feedMove', e && e.message); }
  }
  function feedRoom(room) {
    try { root.Rooms._onUpdate(room); } catch (e) { warn('feedRoom', e && e.message); }
  }
  function makeRoom(gameId) {
    var u = root.AUTH.user;
    var code = 'L' + Math.random().toString(36).slice(2, 8).toUpperCase();
    return {
      id: 'local-' + code,
      code: code,
      game_id: gameId,
      owner_id: u.id,
      owner_name: u.username,
      max_players: Math.max(2, Math.min(4, (root.Rooms && root.Rooms.maxFor && root.Rooms.maxFor(gameId)) || 4)),
      status: 'waiting',
      bet: 0,                                   /* ودّية بلا رهان — المال من الخادم وحده */
      room_type: 'percentage',
      expires_at: null,
      visibility: 'private',
      settled: false,
      rev: 1,
      expired: false,
      players: [{ id: u.id, username: u.username, ready: false, spectate: false, seat: 0, isBot: false, leftRound: false }],
      room_state: {},
      game_opts: null,
      roundJoin: null,
      seats: { players: 1, max: 0, free: 0 },
      joinQueue: [],
      driverId: u.id,
      hasHistory: false,
      online: {},
      rematch: null
    };
  }
  function refreshDerived(room) {
    var nonspec = room.players.filter(function (p) { return !p.spectate; }).sort(function (a, b) { return (a.seat || 0) - (b.seat || 0); });
    room.order = nonspec.map(function (p) { return p.id; });
    room.seats = { players: nonspec.length, max: room.max_players, free: Math.max(0, room.max_players - nonspec.length) };
    room.hasHistory = !!(S.history && S.history.length);
    room.rev = (room.rev || 0) + 1;
    return room;
  }

  /* ── المضيف: استقبال رسائل الضيوف ── */
  function hostOnMessage(peer, ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || !m.t) return;
    if (m.t === 'hello') {
      peer.userId = m.userId;
      peer.name = m.name;
      var u = root.AUTH.user;
      var seat = roomNextSeat(S.room);
      if (seat < 0) { sendRaw(peer.chan, { t: 'err', code: 'full' }); return; }
      S.room.players.push({ id: m.userId, username: String(m.name || 'P').slice(0, 14), ready: false, spectate: false, seat: seat, isBot: false, leftRound: false });
      sendRaw(peer.chan, { t: 'welcome', room: refreshDerived(S.room) });
      broadcast({ t: 'room', room: serialize(S.room) });
      feedRoom(serialize(S.room));
      uiRefresh();
      return;
    }
    if (m.t === 'move') {
      var d = m.d || {};
      d.room_id = S.room.id;
      d.from_id = peer.userId;
      d.rev = (S.room.rev || 0) + 1;
      if (d.action && d.data && typeof d.data === 'object') {
        S.history.push({ action: d.action, data: d.data, by: peer.userId, ts: Date.now() });
        if (S.history.length > 2000) S.history.shift();
      }
      S.room.rev = d.rev;
      broadcast({ t: 'move', d: d });
      feedMove(d);
      return;
    }
    if (m.t === 'settle') {
      hostSettle(peer.userId, m.result);
      return;
    }
    if (m.t === 'rematchVote') {
      hostRematchVote(peer.userId, m.vote);
      return;
    }
    if (m.t === 'replayReq') {
      sendRaw(peer.chan, { t: 'replay', history: S.history.slice() });
      return;
    }
    if (m.t === 'bye') {
      dropPeer(peer, 'غادر اللاعب ' + (peer.name || ''));
    }
  }
  function roomNextSeat(room) {
    var used = {};
    room.players.forEach(function (p) { used[p.seat] = 1; });
    for (var s = 0; s < room.max_players; s++) if (!used[s]) return room.players.length >= room.max_players ? -1 : s;
    return -1;
  }
  function serialize(room) {
    /* نسخة نظيفة قابلة للإرسال — نفس شكل serializeRoom الخادمي */
    var r = JSON.parse(JSON.stringify(room));
    r.online = {};
    room.players.forEach(function (p) {
      var peer = S.peers.filter(function (x) { return String(x.userId) === String(p.id); })[0];
      if (peer) r.online[p.id] = 1;
    });
    r.online[room.owner_id] = 1;
    r.rematch = room.rematch ? {
      participants: (S.room.rematch.participants || []).slice(),
      votes: JSON.parse(JSON.stringify(S.room.rematch.votes || {})),
      resolved: !!S.room.rematch.resolved,
      rematch: !!S.room.rematch.rematch,
      agreed: (S.room.rematch.agreed || []).slice(),
      names: JSON.parse(JSON.stringify(S.room.rematch.names || {})),
      ts: S.room.rematch.ts || 0
    } : null;
    return r;
  }
  function dropPeer(peer, reason) {
    var i = S.peers.indexOf(peer);
    if (i !== -1) S.peers.splice(i, 1);
    try { if (peer.chan) peer.chan.close(); if (peer.pc) peer.pc.close(); } catch (e) {}
    if (S.room) {
      var pi = -1;
      S.room.players.forEach(function (p, idx) { if (String(p.id) === String(peer.userId)) pi = idx; });
      if (pi >= 0) {
        if (S.room.status === 'playing') { S.room.players[pi].leftRound = true; }
        else S.room.players.splice(pi, 1);
      }
      broadcast({ t: 'room', room: serialize(S.room) });
      feedRoom(serialize(S.room));
    }
    if (reason && typeof root.toast === 'function') root.toast('📶 ' + reason, 'info');
    uiRefresh();
  }

  /* ── التسوية الودّية (نهاية جولة) — بلا مال، تحديث الحالة فقط ── */
  function hostSettle(fromId, result) {
    if (!S.room || S.room.status !== 'playing') return;
    if (S.settleDone) return;
    S.settleDone = true;
    S.room.settled = true;
    S.room.rematch = {
      participants: S.room.players.filter(function (p) { return !p.spectate && !p.leftRound; }).map(function (p) { return p.id; }),
      votes: {}, resolved: false, rematch: false, agreed: [],
      names: (function () { var n = {}; S.room.players.forEach(function (p) { n[p.id] = p.username; }); return n; })(),
      ts: Date.now()
    };
    S.room.status = 'waiting';
    var payload = { room_id: S.room.id, result: String(result || 'draw'), pot: 0, fee: 0 };
    broadcast({ t: 'settle', d: payload });
    broadcast({ t: 'room', room: serialize(S.room) });
    feedRoom(serialize(S.room));
    try { root.Rooms._onSettle && root.Rooms._onSettle(payload); } catch (e) {}
    uiRefresh();
  }
  function hostRematchVote(fromId, vote) {
    if (!S.room || !S.room.rematch || S.room.rematch.resolved) return;
    S.room.rematch.votes[fromId] = (vote === 'agree') ? 'agree' : 'refuse';
    var parts = S.room.rematch.participants;
    var all = parts.every(function (id) { return S.room.rematch.votes[id]; });
    if (!all) { broadcast({ t: 'room', room: serialize(S.room) }); feedRoom(serialize(S.room)); return; }
    var agreed = parts.filter(function (id) { return S.room.rematch.votes[id] === 'agree'; });
    S.room.rematch.resolved = true;
    if (agreed.length >= 2 && agreed.indexOf(S.room.owner_id) !== -1) {
      S.room.rematch.rematch = true;
      S.room.rematch.agreed = agreed;
      S.room.status = 'playing';
      S.room.settled = false;
      S.settleDone = false;
      S.history = [];
      S.votes = {};
      S.room.players.forEach(function (p) { p.ready = true; });
    } else {
      S.room.status = 'waiting';
      S.room.rematch = null;
      S.room.players.forEach(function (p) { p.ready = false; });
    }
    broadcast({ t: 'room', room: serialize(S.room) });
    feedRoom(serialize(S.room));
    uiRefresh();
  }

  /* ── الضيف: استقبال رسائل المضيف ── */
  function guestOnMessage(ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || !m.t) return;
    if (m.t === 'welcome' || m.t === 'room') {
      /* [v2.83·تصحيح] مرآة الغرفة عند الضيف: بضبط S.room يصبح LocalMP.active()
         صحيحاً عنده فتمرّ نقاط النقل (setReady/sendMove/…) عبر الطبقة المحلية —
         كان يظل null فتذهب النداءات للخادم الحقيقي وتضيع. */
      if (m.room && m.room.id) S.room = m.room;
      feedRoom(m.room);
      uiRefresh();
      return;
    }
    if (m.t === 'move') { feedMove(m.d); return; }
    if (m.t === 'settle') {
      try { root.Rooms._onSettle && root.Rooms._onSettle(m.d); } catch (e) {}
      return;
    }
    if (m.t === 'replay') {
      try {
        var Rooms = root.Rooms;
        var d = { room_id: Rooms.state && Rooms.state.id, history: m.history || [] };
        Rooms._dispatchReplay(d);
      } catch (e) {}
      return;
    }
    if (m.t === 'err' && m.code === 'full') {
      uiShowError(T('lmp.full', 'الغرفة مكتملة'));
      teardown();
      return;
    }
    if (m.t === 'bye') {
      if (typeof root.toast === 'function') root.toast('📶 ' + T('lmp.hostClosed', 'أغلق المضيف الغرفة'), 'warn');
      teardown();
    }
  }


  /* ═══════════ 4) الواجهة العامة (تحل محل نقاط النقل في Rooms) ═══════════ */
  var LocalMP = {
    version: APIV,
    active: function () { return !!(S.mode && S.room); },
    isHost: function () { return S.mode === 'host'; },
    room: function () { return S.room; },
    state: function () { return S; },

    /* المضيف: فتح غرفة محلية على لعبة — يرجع Promise مثل Rooms.createRoom */
    hostRoom: function (gameId) {
      if (!ensureIdentityOrAsk()) return Promise.resolve();
      S.mode = 'host';
      S.gameId = gameId;
      S.room = makeRoom(gameId);
      S.history = [];
      S.peers = [];
      S.settleDone = false;
      feedRoom(serialize(S.room));
      uiOpen('host');
      return LocalMP.newPairing().then(function () {});
    },

    /* الضيف: ينضم برمز جلسة المضيف (لصق نصي — أو من الماسح) */
    joinByCode: function (hostCode, name) {
      if (!ensureIdentityOrAsk(name)) return Promise.resolve();
      S.mode = 'guest';
      uiOpen('guest');
      return guestAnswer(hostCode).then(function (r) {
        S.guestChan = r.chan;
        S.guestPc = r.pc;
        if (r.chan && r.chan.readyState === 'open') {
          r.chan.addEventListener('message', guestOnMessage);
          sendRaw(r.chan, { t: 'hello', userId: myId(), name: myName() });
        } else {
          r.pc.addEventListener('datachannel', function (ev) {
            S.guestChan = ev.channel;
            ev.channel.addEventListener('message', guestOnMessage);
            sendRaw(ev.channel, { t: 'hello', userId: myId(), name: myName() });
          });
        }
        uiShowAnswer(r.answerCode);
        r.pc.addEventListener('connectionstatechange', function () {
          if (r.pc.connectionState === 'failed') { uiShowError(T('lmp.connectFail', 'فشل الاتصال — تأكدا من نفس شبكة الواي فاي أو مشاركة البلوتوث')); }
        });
        return r;
      }).catch(function (e) {
        uiShowError(e && e.message === 'bad-code' ? T('lmp.badCode', 'رمز جلسة غير صالح') : T('lmp.connectFail', 'فشل إنشاء الاتصال'));
        teardown();
      });
    },

    /* المضيف: يقبل إجابة ضيف (بعد مسح/لصق رمزه) */
    acceptGuest: function (answerCode) {
      if (S.mode !== 'host' || !S.pendingPair) return Promise.reject(new Error('not-hosting'));
      var pair = S.pendingPair;
      return hostAcceptAnswer(pair, answerCode).then(function () {
        pair.pc.addEventListener('connectionstatechange', function () {
          if (pair.pc.connectionState === 'failed') dropPeer(pair, T('lmp.peerFail', 'انقطع أحد اللاعبين'));
        });
        var peer = { pc: pair.pc, chan: pair.chan, userId: null, name: null };
        pair.chan.addEventListener('message', function (ev) { hostOnMessage(peer, ev); });
        pair.chan.addEventListener('open', function () {
          sendRaw(pair.chan, { t: 'welcome', room: refreshDerived(S.room) });
        });
        pair.chan.addEventListener('close', function () { dropPeer(peer, ''); });
        S.peers.push(peer);
        S.pendingPair = null;
        if (pair._expire) clearTimeout(pair._expire);
        if (pair.chan.readyState === 'open') sendRaw(pair.chan, { t: 'welcome', room: refreshDerived(S.room) });
        uiPairingDone();
        return peer;
      });
    },

    /* المضيف: يبدأ جولة اقتران لاعب إضافي */
    newPairing: function () {
      if (S.mode !== 'host') return Promise.reject(new Error('not-hosting'));
      if (S.pendingPair) { try { S.pendingPair.pc.close(); } catch (e) {} }
      S.pendingPair = null;
      return hostMakeOffer(function (code) { uiShowHostCode(code); }).then(function (pair) {
        S.pendingPair = pair;
        pair._expire = setTimeout(function () {
          if (S.pendingPair === pair) {
            try { pair.pc.close(); } catch (e) {}
            S.pendingPair = null;
            uiRefresh();
          }
        }, 90000);
        return pair;
      }).catch(function (e) {
        uiShowError(e && e.message === 'no-lan'
          ? T('lmp.noLan', 'لم يُعثر على عنوان شبكة محلية — تحقق من اتصال الواي فاي')
          : T('lmp.webrtcFail', 'متصفحك لا يدعم الاتصال المباشر'));
        return null;
      });
    },

    /* ── بديلات Rooms — تُستدعى من الأغلفة عند نشاط الغرفة المحلية ── */
    setReady: function (ready) {
      if (S.mode === 'host') {
        S.room.players.forEach(function (p) { if (String(p.id) === String(myId())) p.ready = !!ready; });
        broadcast({ t: 'room', room: serialize(S.room) });
        feedRoom(serialize(S.room));
      } else {
        sendRaw(S.guestChan, { t: 'ready', userId: myId(), ready: !!ready });
      }
      return Promise.resolve({ ok: true, data: { room: serialize(S.room) } });
    },
    startGame: function () {
      if (S.mode !== 'host') return Promise.resolve();
      var nonspec = S.room.players.filter(function (p) { return !p.spectate && !p.leftRound; });
      if (nonspec.length < 2) {
        if (typeof root.toast === 'function') root.toast(T('lmp.needTwo', 'يلزم لاعبان متصلان على الأقل'), 'warn');
        return Promise.resolve();
      }
      S.room.status = 'playing';
      S.room.settled = false;
      S.settleDone = false;
      refreshDerived(S.room);
      broadcast({ t: 'room', room: serialize(S.room) });
      feedRoom(serialize(S.room));
      return Promise.resolve({ ok: true, data: { room: serialize(S.room) } });
    },
    sendMove: function (action, data, state) {
      if (S.mode === 'host') {
        var d = { room_id: S.room.id, action: action, data: data || {}, from_id: myId(), rev: (S.room.rev || 0) + 1 };
        if (data && typeof data === 'object') {
          S.history.push({ action: action, data: data, by: myId(), ts: Date.now() });
          if (S.history.length > 2000) S.history.shift();
        }
        S.room.rev = d.rev;
        broadcast({ t: 'move', d: d });
        feedMove(d);     /* صدى الذات — نفس دلالة الخادم (اللعبة ترشّح by) */
      } else {
        sendRaw(S.guestChan, { t: 'move', d: { action: action, data: data || {} } });
      }
      return Promise.resolve({ ok: true, data: { room: serialize(S.room) } });
    },
    sendBlind: function (data) {
      if (S.mode === 'guest') sendRaw(S.guestChan, { t: 'move', d: { action: 'blind', data: data || {} } });
      else LocalMP.sendMove('blind', data || {});
      return true;
    },
    roomSettle: function (result) {
      if (S.mode === 'host') hostSettle(myId(), result);
      else sendRaw(S.guestChan, { t: 'settle', result: result });
      return Promise.resolve({ ok: true });
    },
    settleTeam: function (t) { return LocalMP.roomSettle(String(t || 'draw')); },
    startRematch: function () {
      if (S.mode === 'host') {
        if (!S.room.rematch) {
          S.room.rematch = {
            participants: S.room.players.filter(function (p) { return !p.spectate && !p.leftRound; }).map(function (p) { return p.id; }),
            votes: {}, resolved: false, rematch: false, agreed: [],
            names: (function () { var n = {}; S.room.players.forEach(function (p) { n[p.id] = p.username; }); return n; })(),
            ts: Date.now()
          };
          broadcast({ t: 'room', room: serialize(S.room) });
          feedRoom(serialize(S.room));
        }
      }
      return Promise.resolve({ ok: true });
    },
    voteRematch: function (vote) {
      if (S.mode === 'host') hostRematchVote(myId(), vote);
      else sendRaw(S.guestChan, { t: 'rematchVote', vote: vote });
      return Promise.resolve({ ok: true });
    },
    requestReplay: function () {
      if (S.mode === 'host') {
        try { root.Rooms._dispatchReplay({ room_id: S.room.id, history: S.history.slice() }); } catch (e) {}
      } else sendRaw(S.guestChan, { t: 'replayReq' });
      return true;
    },
    leaveRoom: function () { teardown(true); return Promise.resolve({ ok: true }); },
    leaveQuiet: function () { teardown(true); },
    _refreshGold: function () { /* ودّية بلا مال — لا رصيد يُجلب */ }
  };

  /* جاهزية الضيف تصل برسالة ready مستقلة — تُعالج قبل بقية الرسائل */
  var origHostOnMessage = hostOnMessage;
  hostOnMessage = function (peer, ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return origHostOnMessage(peer, ev); }
    if (m && m.t === 'ready' && S.mode === 'host' && S.room) {
      S.room.players.forEach(function (p) { if (String(p.id) === String(m.userId)) p.ready = !!m.ready; });
      broadcast({ t: 'room', room: serialize(S.room) });
      feedRoom(serialize(S.room));
      return;
    }
    if (m && m.t === 'settle' && S.mode === 'host') { hostSettle(peer.userId, m.result); return; }
    if (m && m.t === 'rematchVote' && S.mode === 'host') { hostRematchVote(peer.userId, m.vote); return; }
    origHostOnMessage(peer, ev);
  };

  function ensureIdentityOrAsk(name) {
    if (root.AUTH && root.AUTH.user) return true;
    var nm = uiAskName(name);
    if (!nm) return false;
    return ensureLocalIdentity(nm);
  }

  /* ═══════════ 5) التفكيك ═══════════ */
  function teardown(notifyPeers) {
    if (notifyPeers && S.mode === 'host') broadcast({ t: 'bye' });
    if (notifyPeers && S.mode === 'guest') sendRaw(S.guestChan, { t: 'bye' });
    S.peers.forEach(function (p) { try { if (p.chan) p.chan.close(); if (p.pc) p.pc.close(); } catch (e) {} });
    if (S.pendingPair) { try { S.pendingPair.pc.close(); } catch (e) {} }
    if (S.guestPc) { try { S.guestPc.close(); } catch (e) {} }
    S.peers = [];
    S.pendingPair = null;
    S.guestChan = null;
    S.guestPc = null;
    S.room = null;
    S.mode = null;
    S.history = [];
    S.settleDone = false;
    dropLocalIdentity();
    try { if (root.Rooms && root.Rooms._persistRoom) root.Rooms._persistRoom(null); } catch (e) {}
    /* الغرفة المحلية في Rooms.state تُصفَّر أيضاً — وإلا بقي اللوبي شبحاً بعد المغادرة */
    try {
      if (root.Rooms && root.Rooms.state && String(root.Rooms.state.id).indexOf('local-') === 0) {
        root.Rooms.state = null;
        if (typeof root.Rooms.render === 'function') root.Rooms.render();
      }
    } catch (e) {}
    uiClose();
  }

  /* ═══════════ 6) الواجهة — تراكب مستقل بلا أي تعديل في rooms.js ═══════════ */
  function el(id) { return document.getElementById(id); }
  function overlayEl() { return el('localMpOverlay'); }

  function uiOpen(role) {
    var m = overlayEl();
    if (!m) {
      m = document.createElement('div');
      m.className = 'mwrap';
      m.id = 'localMpOverlay';
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      m.setAttribute('aria-labelledby', 'lmpTitle');
      m.addEventListener('click', function (e) { if (e.target === m) uiAskClose(); });
      document.body.appendChild(m);
    }
    m.dataset.role = role;
    m.classList.add('show');
    uiRender();
  }
  function uiClose() {
    try { LocalMP.uiScanClose(); } catch (e) {}
    var m = overlayEl();
    if (m) { m.classList.remove('show'); m.innerHTML = ''; }
  }
  function uiAskClose() {
    /* إغلاق التراكب لا يفكّ الغرفة — زر الخروج من الغرفة هو الذي يفكّها */
    uiClose();
    if (root.Rooms && root.Rooms.state && root.Rooms.state.id && String(root.Rooms.state.id).indexOf('local-') === 0) {
      try { root.Rooms.openModal(); } catch (e) {}
    }
  }
  function uiShowError(msg) {
    var box = el('lmpErr');
    if (box) { box.textContent = msg || ''; box.style.display = msg ? '' : 'none'; }
    else if (msg && typeof root.toast === 'function') root.toast(msg, 'err');
  }
  function uiAskName(prefill) {
    var v = (prefill || '').trim();
    for (var i = 0; i < 3 && !v; i++) {
      v = window.prompt(T('lmp.yourName', 'اكتب اسمك ليظهر للاعبين (بلا إنترنت)'), '');
      if (v == null) return '';
      v = String(v).trim().slice(0, 14);
    }
    return v;
  }
  function qrSvg(text, size) {
    try {
      if (root.QRMini && root.QRMini.svg) return root.QRMini.svg(text, { ecc: 'L', size: size || 210, margin: 2 });
    } catch (e) {}
    return '';
  }
  function codeBlock(code) {
    if (!code) return '';
    return '<div class="lmp-code" title="' + esc(code) + '">' + esc(code.length > 72 ? code.slice(0, 72) + '…' : code) + '</div>';
  }

  function uiRender() {
    var m = overlayEl();
    if (!m || !m.classList.contains('show')) return;
    var role = m.dataset.role;
    var head =
      '<div class="modal modal-sm modal-lmp">' +
        '<div class="mhead"><h3 id="lmpTitle"><i class="fa-solid fa-wifi" aria-hidden="true"></i> <span data-i18n="lmp.title">' + esc(T('lmp.title', 'الغرفة المحلية')) + '</span></h3>' +
        '<button class="mclose" onclick="LocalMP.uiClose()" aria-label="' + esc(T('ui.close', 'إغلاق')) + '">✕</button></div>' +
        '<div class="mbody" id="lmpBody">' +
          '<p class="lmp-sub">' + esc(T('lmp.sub', 'واي فاي أو مشاركة بلوتوث — لعب مباشر بلا إنترنت وبلا رهان')) + '</p>' +
          '<div class="lmp-err" id="lmpErr" style="display:none"></div>';
    var body = '';
    if (role === 'choose') body = uiChooseBody();
    else if (role === 'host') body = uiHostBody();
    else if (role === 'guest') body = uiGuestBody();
    m.innerHTML = head + body + '</div></div>';
    var err = m._lastErr;
    if (err) uiShowError(err);
  }
  function uiHostBody() {
    var pair = S.pendingPair;
    var connected = S.peers.length;
    var max = S.room ? S.room.max_players : 4;
    var h = '';
    if (pair && pair.offerCode) {
      h += '<div class="lmp-step">' + esc(T('lmp.hostStep1', '١) اعرض هذا الرمز على صاحبك ليمسحه أو ينسخه')) + '</div>' +
        '<div class="lmp-qr">' + qrSvg(pair.offerCode, 210) + '</div>' +
        codeBlock(pair.offerCode) +
        '<div class="lmp-row"><button class="lmp-btn" onclick="LocalMP.uiCopy(\'' + esc(pair.offerCode) + '\')">📋 ' + esc(T('lmp.copy', 'نسخ رمز الجلسة')) + '</button></div>' +
        '<div class="lmp-step">' + esc(T('lmp.hostStep2', '٢) امسح رمز إجابته (أو الصقها هنا)')) + '</div>' +
        '<div class="lmp-row"><textarea id="lmpAnswerIn" rows="3" class="lmp-in" placeholder="' + esc(T('lmp.pasteAnswer', 'ألصق رمز إجابة اللاعب هنا')) + '"></textarea></div>' +
        '<div class="lmp-row"><button class="lmp-btn lmp-go" onclick="LocalMP.uiAccept()">✅ ' + esc(T('lmp.accept', 'إتمام الاتصال')) + '</button>' +
        '<button class="lmp-btn lmp-scan" onclick="LocalMP.uiScan(false)">📷 ' + esc(T('lmp.scan', 'مسح')) + '</button></div>';
    }
    h += '<div class="lmp-status">' + esc(T('lmp.connected', 'متصل')) + ': <b>' + connected + '/' + max + '</b>' +
      (S.room ? ' · ' + S.room.players.map(function (p) { return esc(p.username) + (p.ready ? ' ✅' : ''); }).join(' · ') : '') + '</div>';
    if (connected > 0 && connected < max) {
      h += '<div class="lmp-row"><button class="lmp-btn" onclick="LocalMP.uiAddPlayer()">➕ ' + esc(T('lmp.addPlayer', 'إضافة لاعب آخر')) + '</button></div>';
    }
    if (connected >= 1) {
      h += '<div class="lmp-row"><button class="lmp-btn lmp-go" onclick="LocalMP.uiStart()">▶ ' + esc(T('lmp.start', 'فتح اللوبي وبدء اللعب')) + '</button></div>';
    }
    h += '<div class="lmp-row"><button class="lmp-btn lmp-warn" onclick="LocalMP.uiLeave()">🚪 ' + esc(T('lmp.leave', 'إغلاق الغرفة المحلية')) + '</button></div>';
    return h;
  }
  function uiGuestBody() {
    var h = '';
    if (S.guestAnswerCode) {
      h += '<div class="lmp-step">' + esc(T('lmp.guestStep2', 'اعرض هذا الرمز على المضيف ليمسحه أو يلصقه')) + '</div>' +
        '<div class="lmp-qr">' + qrSvg(S.guestAnswerCode, 210) + '</div>' +
        codeBlock(S.guestAnswerCode) +
        '<div class="lmp-row"><button class="lmp-btn" onclick="LocalMP.uiCopy(\'' + esc(S.guestAnswerCode) + '\')">📋 ' + esc(T('lmp.copy', 'نسخ رمز الإجابة')) + '</button></div>' +
        '<div class="lmp-status">' + esc(T('lmp.waitHost', 'بانتظار اكتمال الاتصال من المضيف…')) + '</div>';
    } else {
      h += '<div class="lmp-step">' + esc(T('lmp.guestStep1', 'امسح رمز جلسة المضيف (أو الصقه)')) + '</div>' +
        '<div class="lmp-row"><textarea id="lmpHostIn" rows="3" class="lmp-in" placeholder="L1.…"></textarea></div>' +
        '<div class="lmp-row"><button class="lmp-btn lmp-go" onclick="LocalMP.uiJoin()">✅ ' + esc(T('lmp.join', 'انضمام')) + '</button>' +
        '<button class="lmp-btn lmp-scan" onclick="LocalMP.uiScan(true)">📷 ' + esc(T('lmp.scan', 'مسح')) + '</button></div>';
    }
    h += '<div class="lmp-row"><button class="lmp-btn lmp-warn" onclick="LocalMP.uiLeave()">🚪 ' + esc(T('lmp.leave', 'إلغاء الانضمام')) + '</button></div>';
    return h;
  }
  function uiShowHostCode(code) { uiRender(); }
  function uiShowAnswer(code) { S.guestAnswerCode = code; uiRender(); }
  function uiPairingDone() { uiRender(); }
  function uiRefresh() { uiRender(); }

  LocalMP.uiClose = uiClose;
  LocalMP.uiCopy = function (code) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code);
      else {
        var ta = document.createElement('textarea');
        ta.value = code; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      if (typeof root.toast === 'function') root.toast(T('lmp.copied', 'نُسخ الرمز — شاركه مع صاحبك'), 'ok');
    } catch (e) {}
  };
  LocalMP.uiAccept = function () {
    var ta = el('lmpAnswerIn');
    if (!ta || !ta.value.trim()) { uiShowError(T('lmp.pasteFirst', 'ألصق رمز الإجابة أولاً')); return; }
    LocalMP.acceptGuest(ta.value.trim()).catch(function (e) {
      uiShowError(e && e.message === 'bad-code' ? T('lmp.badCode', 'رمز غير صالح') : T('lmp.connectFail', 'فشل إتمام الاتصال'));
    });
  };
  LocalMP.uiJoin = function () {
    var ta = el('lmpHostIn');
    if (!ta || !ta.value.trim()) { uiShowError(T('lmp.pasteFirst', 'ألصق رمز الجلسة أولاً')); return; }
    LocalMP.joinByCode(ta.value.trim());
  };
  LocalMP.uiAddPlayer = function () { LocalMP.newPairing(); };
  LocalMP.uiStart = function () {
    LocalMP.startGame().then(function () {
      uiClose();
      try { root.Rooms.openModal(); } catch (e) {}
    });
  };
  LocalMP.uiLeave = function () { LocalMP.leaveRoom(); };

  /* ── الماسح: كاميرا + jsQR محلي (يُحمَّل عند الطلب حصراً) ── */
  LocalMP.uiScan = function (isGuest) {
    if (!root.MediaStream || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      uiShowError(T('lmp.noCam', 'لا تتوفر كاميرا هنا — استعمل النسخ واللصق'));
      return;
    }
    /* [v2.84·Android] حارس تعليق الكاميرا: WebView قد يترك getUserMedia معلّقاً
       بلا نجاح ولا رفض (إذن لم يُمنح أو نافذة الحوار لم تظهر) — كان زر المسح
       يبدو ميتاً. بعد 8ث نعرض دليل النسخ/اللصق بدل الصمت الأبدي. */
    var settled = false;
    var hangTmr = setTimeout(function () {
      if (!settled) uiShowError(T('lmp.camSlow', 'الكاميرا لا تستجيب — استعمل النسخ واللصق'));
    }, 8000);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
      settled = true; clearTimeout(hangTmr);
      loadJsQR().then(function (jsQR) {
        if (!jsQR) { uiShowError(T('lmp.noDecoder', 'تعذر تحميل قارئ الرموز')); stopStream(stream); return; }
        var m = overlayEl();
        if (!m) return stopStream(stream);
        var v = document.createElement('video');
        v.className = 'lmp-scanvid';
        v.autoplay = true; v.playsInline = true; v.muted = true;
        v.srcObject = stream;
        m.querySelector('.modal') .appendChild(v);
        var stop = false;
        var onFound = function (code) {
          stop = true;
          stopStream(stream);
          LocalMP.uiScanClose();
          if (isGuest) {
            var ta = el('lmpHostIn');
            if (ta) { ta.value = code; LocalMP.uiJoin(); }
          } else {
            var ta2 = el('lmpAnswerIn');
            if (ta2) { ta2.value = code; LocalMP.uiAccept(); }
          }
        };
        v.addEventListener('play', function () {
          var loop = function () {
            if (stop) return;
            try {
              if (v.videoWidth) {
                var c = document.createElement('canvas');
                var w = Math.min(480, v.videoWidth), h = Math.round(v.videoHeight * (w / v.videoWidth));
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(v, 0, 0, w, h);
                var d = c.getContext('2d').getImageData(0, 0, w, h);
                var r = jsQR(d.data, w, h, { inversionAttempts: 'dontInvert' });
                if (r && r.data && String(r.data).indexOf(LAN_PREFIX) === 0) return onFound(r.data);
              }
            } catch (e) {}
            requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        });
        var btn = document.createElement('button');
        btn.className = 'lmp-btn lmp-warn lmp-scanstop';
        btn.textContent = '✕ ' + T('lmp.scanStop', 'إيقاف المسح');
        btn.onclick = LocalMP.uiScanClose;
        m.querySelector('.modal').appendChild(btn);
        LocalMP._scanStream = stream;
      }).catch(function () { stopStream(stream); });
    }).catch(function () {
      settled = true; clearTimeout(hangTmr);
      uiShowError(T('lmp.camDenied', 'رفض إذن الكاميرا — استعمل النسخ واللصق'));
    });
  };
  function stopStream(stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
  LocalMP.uiScanClose = function () {
    if (LocalMP._scanStream) { stopStream(LocalMP._scanStream); LocalMP._scanStream = null; }
    var m = overlayEl();
    if (m) {
      var v = m.querySelector('video.lmp-scanvid');
      if (v) v.remove();
      var stops = m.querySelectorAll('.modal > button.lmp-scanstop');
      for (var i = 0; i < stops.length; i++) stops[i].remove();
    }
  };
  var _jsqrLoaded = null;
  function loadJsQR() {
    if (root.jsQR) return Promise.resolve(root.jsQR);
    if (_jsqrLoaded) return _jsqrLoaded;
    _jsqrLoaded = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'js/vendor/jsQR.js';
      s.onload = function () { resolve(root.jsQR || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return _jsqrLoaded;
  }

  /* ═══════════ 7) تغليف نقاط النقل في Rooms (جراحي — بلا تعديل rooms.js) ═══════════ */
  function patchRooms() {
    var Rooms = root.Rooms;
    if (!Rooms || Rooms._lmpPatched) return;
    var wrap = function (name, impl, keepThis) {
      var orig = Rooms[name];
      if (typeof orig !== 'function') return;
      Rooms[name] = function () {
        var args = [].slice.call(arguments);
        if (LocalMP.active()) return impl.apply(keepThis ? Rooms : LocalMP, args);
        return orig.apply(Rooms, args);
      };
    };
    wrap('setReady', LocalMP.setReady);
    wrap('startGame', LocalMP.startGame);
    wrap('sendMove', LocalMP.sendMove);
    wrap('sendBlind', LocalMP.sendBlind);
    wrap('leaveRoom', LocalMP.leaveRoom);
    wrap('leaveQuiet', LocalMP.leaveQuiet);
    wrap('roomSettle', LocalMP.roomSettle);
    wrap('settleTeam', LocalMP.settleTeam);
    wrap('startRematch', LocalMP.startRematch);
    wrap('voteRematch', LocalMP.voteRematch);
    wrap('requestReplay', function () { LocalMP.requestReplay(); return true; });
    /* [v2.83] لا جلب رصيد من الخادم داخل غرفة ودّية بلا مال (ولضيف بلا جلسة: يمنع ضجيج 401) */
    if (typeof Rooms._refreshGold === 'function') {
      var origGold = Rooms._refreshGold;
      Rooms._refreshGold = function () {
        if (LocalMP.active()) return;
        return origGold.apply(Rooms, arguments);
      };
    }
    /* SSE لا يُوصل في وضع الغرفة المحلية (لا خادم) — يظل معطلاً ما دامت نشطة */
    var origJoinSse = Rooms.joinSse;
    if (typeof origJoinSse === 'function') {
      Rooms.joinSse = function () {
        if (LocalMP.active()) return;
        return origJoinSse.apply(Rooms, arguments);
      };
    }
    Rooms._lmpPatched = true;
  }

  /* زر الدخول داخل مودال الغرف (يُحقن — لا تعديل في index.html للبنية) */
  function injectEntry() {
    var bar = document.querySelector('#roomModal .room-topbar-actions');
    if (!bar || document.getElementById('lmpEntryBtn')) return;
    var b = document.createElement('button');
    b.className = 'mgear';
    b.id = 'lmpEntryBtn';
    b.setAttribute('aria-label', T('lmp.title', 'الغرفة المحلية'));
    b.title = T('lmp.title', 'الغرفة المحلية') + ' — ' + T('lmp.sub', 'واي فاي أو مشاركة بلوتوث بلا إنترنت');
    b.innerHTML = '<i class="fa-solid fa-wifi" aria-hidden="true"></i>';
    b.addEventListener('click', function () { LocalMP.open(); });
    bar.insertBefore(b, bar.firstChild);
  }

  /* ═══════════ 8) نقطة الدخول العامة ═══════════ */
  LocalMP.open = function () {
    if (LocalMP.active()) { uiOpen(S.mode); return; }
    uiOpen('choose');
  };
  LocalMP.hostHere = function () {
    /* اختيار اللعبة: اللعبة المفتوحة حالياً إن كانت مدعومة، وإلا روندا */
    var gid = 'rn';
    if (root.Rooms && typeof Rooms.isGameSupported === 'function' && window._currentGameId && Rooms.isGameSupported(window._currentGameId)) {
      gid = window._currentGameId;
    }
    if (!ensureIdentityOrAsk()) return;
    LocalMP.hostRoom(gid);
  };
  LocalMP.joinHere = function () {
    S.mode = 'guest';
    uiOpen('guest');
  };
  function uiChooseBody() {
    return '<div class="lmp-row"><button class="lmp-btn lmp-go" onclick="LocalMP.hostHere()">📡 ' + esc(T('lmp.host', 'إنشاء غرفة (أنا المضيف)')) + '</button></div>' +
      '<div class="lmp-row"><button class="lmp-btn lmp-go" onclick="LocalMP.joinHere()">➡️ ' + esc(T('lmp.join', 'انضمام لغرفة صديق')) + '</button></div>' +
      '<p class="lmp-hint">' + esc(T('lmp.btHint', 'البلوتوث: فعّل «مشاركة الاتصال عبر البلوتوث» في إعدادات نقطة الاتصال بهاتف المضيف ثم انضم — نفس مسار الواي فاي تماماً')) + '</p>';
  }

  root.LocalMP = LocalMP;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { patchRooms(); injectEntry(); });
  } else {
    patchRooms(); injectEntry();
  }
  /* حقن المتأخر (مودال الغرف يُبنى في index.html الثابت فالزر يُحقن فوراً عادة) */
  setTimeout(injectEntry, 1200);
  setTimeout(injectEntry, 4000);

})(window);
