/* ═══════════════════════════════════════════════════════════════════════════
   [v2.83] LocalMP — الغرفة المحلية: اللعب مع الأصدقاء عبر شبكة الواي فاي
   أو مشاركة البلوتوث (tethering) داخل تطبيق الأندرويد والموقع — بلا إنترنت
   ───────────────────────────────────────────────────────────────────────────
   [v2.87] المساران:
   • الأندرويد (جسر DTSGNative موجود): شبكة اللعب المحلي الأصلية LocalNet —
     المضيف يفتح غرفة بكود قصير من 8 حروف وأرقام، والغرف تُكتشف آلياً
     لكل من فتح التطبيق (NSD/mDNS على الواي فاي + إعلان/مسح BLE على
     البلوتوث)، والاتصال مباشر بالراديو (TCP على الواي فاي · RFCOMM غير
     الآمن على البلوتوث) — بلا رموز QR ولا بصمات طويلة ولا أي روابط.
   • الويب (بلا جسر): مسار WebRTC DataChannel الأصلي كما هو —
     مرشحو مضيف حصراً + بصمة مضغوطة L1.* + رمز QR (QRMini/jsQR).

   المبدأ (ويب): WebRTC DataChannel قناة مباشرة جهاز-إلى-جهاز على الشبكة
   المحلية (iceServers: [] ⇒ مرشحو المضيف بعناوين LAN حصراً — لا خادم
   ولا إنترنت). «البلوتوث»: مشاركة اتصال الهاتف عبر البلوتوث (Bluetooth
   tethering) تُنشئ شبكة محلية بين الجهازين فيسري عليها نفس مسار الواي
   فاي تماماً.

   البصمة المضغوطة (ويب): بدل تبادل SDP كاملاً (~1.5KB) نستخرج الحقول
   الحاكمة فقط (ice-ufrag · ice-pwd · بصمة DTLS · setup · المرشحون
   الخاصيون) في رمز ~120-260 حرفاً يُعرض رمز QR (QRMini المُستضاف محلياً)
   أو يُنسخ نصاً. المضيف يعرض رمز الجلسة ⇐ الضيف يمسحه (كاميرا + jsQR
   المُستضاف محلياً) أو يلصقه ⇐ يُنشئ رمز الإجابة ويعرضه ⇐ المضيف
   يمسحه/يلصقه ⇐ اتصال مباشر.

   العمارة: «المضيف مرحّل» — جهاز المضيف يقوم بدور الخادم للغرفة (يبني
   كائن الغرفة بنفس شكل serializeRoom الخادمي، يبثّ room:update وroom:move
   لكل الأطراف، يجمع الجاهزية، يبدأ الجولة) — في المسارين سواء. التدخل
   في Rooms جراحي إضافي: لا سطر واحد في rooms.js يُمسّ — local-mp يغلّف
   نقاط النقل الثمانية عند التحميل ويوجّهها للطبقة المحلية حصراً حين
   الغرفة المحلية نشطة، فيعمل كل نظام الغرف القائم (اللوبي، الجاهزية،
   البدء، الحركات، السجل) كما هو.

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
    pendingPair: null,     /* {pc, chan, offerCode} زوج قيد الإنشاء (ويب) */
    peers: [],             /* المضيف: [{pc, chan, userId, name}] أو [{id, chan, userId, name}] (أصلي) */
    guestChan: null,       /* الضيف: قناة الاتصال بالمضيف */
    localIdentity: false,  /* أنشأنا هوية محلية مؤقتة؟ */
    lnRooms: {},           /* [v2.87·أصلي] الغرف المكتشفة: code → {code,game,name,max,players,ip,port,mac,transport,ts} */
    lnJoinCode: null,      /* [v2.87·أصلي] كود منتظر ظهوره في الاكتشاف للانضمام الآلي */
    lnJoined: false,       /* [v2.87·أصلي] تمّ الانضمام للمضيف؟ */
    replayBuf: null,       /* [v2.87] تجميع أجزاء السجل المرسلة على دفعات */
    destroyed: false
  };
  var LAN_PREFIX = 'L1.';

  /* [v2.87·أصلي] كشف جسر DTSGNative (تطبيق الأندرويد) — الإصدار 2 يضمّ LocalNet.
     على الويب يبقى NATIVE=false فيسري مسار WebRTC+QR الأصلي بحرفيته. */
  var NATIVE = false;
  try {
    NATIVE = !!(root.DTSGNative && typeof root.DTSGNative.hostRoom === 'function' &&
      typeof root.DTSGNative.lnVersion === 'function' && root.DTSGNative.lnVersion() === '2');
  } catch (e) { NATIVE = false; }

  /* [v2.87] كود الغرفة: 8 حروف وأرقام بلا عناصر مُلبِسة (لا 0/O ولا 1/I/L)
     — يُعرض كبيراً للمضيف ويُبحث به عند الضيف. */
  function genCode8() {
    var alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var bytes = null;
    try { var a = new Uint8Array(8); root.crypto.getRandomValues(a); bytes = a; } catch (e) {}
    var out = '';
    for (var i = 0; i < 8; i++) {
      var b = bytes ? bytes[i] : Math.floor(Math.random() * 256);
      out += alphabet.charAt(b % alphabet.length);
    }
    return out;
  }

  /* [v2.87] غلاف قناة أصلي بنفس واجهة DataChannel (send/close/readyState)
     — الكود فوقه لا يفرّق بين المسارين. الإغلاق الفعلي من جافا (leaveRoom). */
  function nativeChan(id) {
    return {
      readyState: 'open',
      send: function (s) { try { root.DTSGNative.sendMsg(id, s); } catch (e) {} },
      close: function () { /* الإغلاق من Java — لا رسالة فارغة */ }
    };
  }
  function peerById(id) {
    for (var i = 0; i < S.peers.length; i++) if (S.peers[i].id === id) return S.peers[i];
    return null;
  }
  /* [v2.87] مزامنة عدد اللاعبين في إعلانات الاكتشاف (NSD/BLE) — تُستدعى
     عند كل تغيّر في قائمة اللاعبين عند المضيف. */
  function lnSyncCount() {
    if (!NATIVE || S.mode !== 'host' || !S.room) return;
    try { root.DTSGNative.hostUpdate('{"players":' + S.room.players.length + '}'); } catch (e) {}
  }
  function gameLabel(id) {
    try {
      if (typeof GAMES !== 'undefined' && GAMES) {
        for (var i = 0; i < GAMES.length; i++) {
          if (GAMES[i] && GAMES[i].id === id) {
            return (GAMES[i].em ? GAMES[i].em + ' ' : '') +
              (typeof gname === 'function' ? gname(GAMES[i]) : (GAMES[i].n && GAMES[i].n[0]) || id);
          }
        }
      }
    } catch (e) {}
    return String(id || '');
  }

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
    if (list.length) return list.slice(0, 2);               /* ① IPv4 خاص — مرشحان يكفيان (حجم الرمز) */
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
    /* [v2.85·ترميز مضغوط] كان الحمل JSON ثم base64 فبلغ الرمز 287 حرفاً
       بمرشح واحد — يتجاوز سعة QRMini (271 حرفاً عند مستوى L) فيُحجب رمز
       QR بصمت ويعجز المضيف عن عرضه للمسح (خلل كامن كشفه تحقق v2.85 على
       متصفح حقيقي). الصيغة الجديدة حقول مفصولة (كل الحقول لا تحوي | أو ~
       أصلاً): u|p|q|ip~port~prio|…|fhex64 — وترميز base64 فوقها،
       والfoundation يُصنّع عند الفك فلا يُشحن. التوافق داخل الجلسة الواحدة
       فقط (الطرفان يريان الصيغة نفسها لحظة الاقتران — لا حالة محفوظة). */
    var parts = [fields.u || '', fields.p || '', String(fields.q || 5000)];
    var cs = (cands || []).slice(0, 2);          /* مرشحان يكفيان للاتصال المباشر */
    for (var i = 0; i < cs.length; i++) {
      parts.push(String(cs[i][2]) + '~' + String(cs[i][3]) + '~' + String(cs[i][1]));
    }
    parts.push(String(fields.f || '').toLowerCase());
    var plain = parts.join('|');
    var b64;
    try { b64 = root.btoa(plain); }
    catch (e) { b64 = root.btoa(unescape(encodeURIComponent(plain))); }
    return LAN_PREFIX + b64;
  }
  function unpackCode(code) {
    code = String(code || '').trim();
    if (code.indexOf(LAN_PREFIX) !== 0) return null;
    var plain;
    try { plain = root.atob(code.slice(LAN_PREFIX.length)); }
    catch (e) { return null; }
    var parts = plain.split('|');
    if (parts.length < 5) return null;            /* u · p · q · مرشح+ · بصمة */
    var f = parts.pop();                          /* البصمة آخر الحقول (لا تحوي |) */
    var u = parts[0], p = parts[1], q = parts[2];
    var cands = [];
    for (var i = 3; i < parts.length; i++) {
      var seg = parts[i].split('~');
      if (seg.length !== 3) continue;
      var ip = seg[0], port = seg[1], prio = seg[2];
      if (!/^[0-9a-zA-Z.\-]+$/.test(ip)) continue;          /* IPv4 أو مضيف mDNS ‎*.local */
      if (!/^\d+$/.test(port) || !/^\d+$/.test(prio)) continue;
      cands.push(['lmp' + (i - 3), parseInt(prio, 10), ip, parseInt(port, 10)]);
    }
    if (!u || !p || !/^[0-9a-f]{64}$/.test(f) || !cands.length) return null;
    return { u: u, p: p, f: f, q: parseInt(q, 10) || 5000, c: cands };
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
    var code = NATIVE ? genCode8() : ('L' + Math.random().toString(36).slice(2, 8).toUpperCase());
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
      lnSyncCount();          /* [v2.87] تحديث اللاعبين في إعلانات الاكتشاف */
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
      lnSendReplay(peer.chan);
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
  /* [v2.87] إرسال السجل على دفعات صغيرة (150 حركة) — قناة البلوتوث (RFCOMM)
     أنعم مع الرسائل القصيرة من رسالة واحدة ضخمة قد تُغرق مخزنها المؤقت. */
  function lnSendReplay(chan) {
    var hist = S.history.slice();
    if (!NATIVE || hist.length <= 150) {
      sendRaw(chan, { t: 'replay', history: hist });
      return;
    }
    var parts = Math.ceil(hist.length / 150);
    for (var i = 0; i < parts; i++) {
      sendRaw(chan, { t: 'replay', part: i + 1, parts: parts, history: hist.slice(i * 150, (i + 1) * 150) });
    }
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
      lnSyncCount();          /* [v2.87] تحديث اللاعبين في إعلانات الاكتشاف */
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
      /* [v2.87·أصلي] أول غرفة تصل للضيف = الاتصال قائم: انتقال آلي للوبي
         الحقيقي (مودال الغرف) بدل البقاء على نافذة الانضمام. */
      if (NATIVE && S.lnJoined) {
        var _ov = overlayEl();
        if (_ov && _ov.classList.contains('show')) {
          uiClose();
          try { root.Rooms.openModal(); } catch (e) {}
        }
      }
      uiRefresh();
      return;
    }
    if (m.t === 'move') { feedMove(m.d); return; }
    if (m.t === 'settle') {
      try { root.Rooms._onSettle && root.Rooms._onSettle(m.d); } catch (e) {}
      return;
    }
    if (m.t === 'replay') {
      /* [v2.87] السجل يُرسل على دفعات (replayBuf) — الرسائل القديمة أحادية
         الجزء تُقبل كما هي (توافق الويب/النسخ السابقة). */
      if (m.parts && m.parts > 1) {
        if (!S.replayBuf || S.replayBuf.parts !== m.parts) S.replayBuf = { parts: m.parts, got: 0, hist: [] };
        if (Array.isArray(m.history)) S.replayBuf.hist = S.replayBuf.hist.concat(m.history);
        S.replayBuf.got = (S.replayBuf.got || 0) + 1;
        if (S.replayBuf.got < S.replayBuf.parts) return;
        m.history = S.replayBuf.hist;
        S.replayBuf = null;
      }
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

    /* المضيف: فتح غرفة محلية على لعبة — يرجع Promise مثل Rooms.createRoom.
       [v2.85] opts = إعدادات اللعبة المختارة من نافذة الإعدادات (نفس
       game_opts الخادمية) — تُخزّن في الغرفة وتُطبّق على كل الأطراف عبر
       _onUpdate عند البدء (المسار نفسه للغرف الخادمية).
       [v2.87·أصلي] في التطبيق: يُفتح مستمع TCP+NSD+بلوتوث فوراً ويُعرض
       كود الغرفة (8 حروف) كبيراً — الضيوف يكتشفونه آلياً أو يدخلونه. */
    hostRoom: function (gameId, opts) {
      if (!ensureIdentityOrAsk()) return Promise.resolve();
      S.mode = 'host';
      S.gameId = gameId;
      S.room = makeRoom(gameId);
      if (opts && typeof opts === 'object') {
        S.room.game_opts = opts;
        try { root.Rooms._applyGameOpts && root.Rooms._applyGameOpts(gameId, opts); } catch (e) {}
      }
      S.history = [];
      S.peers = [];
      S.settleDone = false;
      feedRoom(serialize(S.room));
      uiOpen('host');
      if (NATIVE) {
        var j = { code: S.room.code, game: String(gameId || ''), name: myName(), max: S.room.max_players };
        try { root.DTSGNative.hostRoom(JSON.stringify(j)); } catch (e) { warn('hostRoom', e && e.message); }
        return Promise.resolve();
      }
      return LocalMP.newPairing().then(function () {});
    },

    /* الضيف: ينضم برمز جلسة المضيف — ويب: بصمة L1. مضغوطة (لصق/مسح) ·
       [v2.87·أصلي]: كود الغرفة من 8 حروف وأرقام — يُبحث في الغرف المكتشفة
       آلياً وإن لم يظهر بعد يبقى البحث منتظراً ظهوره ثم ينضم بنفسه. */
    joinByCode: function (hostCode, name) {
      if (!ensureIdentityOrAsk(name)) return Promise.resolve();
      if (NATIVE) {
        var code = String(hostCode || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{8}$/.test(code)) {
          uiOpen('guest');
          uiShowError(T('lmp.badCode8', 'كود الغرفة 8 حروف وأرقام'));
          return Promise.resolve();
        }
        S.mode = 'guest';
        S.lnJoinCode = code;
        S.lnJoined = false;
        uiOpen('guest');
        var r = S.lnRooms[code];
        if (r) { LocalMP.lnJoinRoom(r); }
        else {
          lnDiscover(true);
          uiShowError(T('lmp.searching', 'جارٍ البحث عن الغرفة قربك… تأكد أنك وصاحبك على نفس الواي فاي أو البلوتوث'));
        }
        return Promise.resolve();
      }
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
        /* [v2.85] الرمز يظهر فور جاهزيته: uiRender داخل onCode كان يسبق
           ضبط S.pendingPair (الوعد يُحلّ بعدها) فيبقى اللوبي بلا QR حتى
           حدث لاحق (اتصال ضيف/انتهاء مهلة) — خلل كامن كشفه تحقق v2.85. */
        uiRefresh();
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
    _refreshGold: function () { /* ودّية بلا مال — لا رصيد يُجلب */ },

    /* ═══ [v2.87·أصلي] واجهة LocalNet — الاكتشاف والانضمام بالراديو ═══ */
    lnJoinRoom: function (room) {
      if (!NATIVE || !room || S.lnJoined) return;
      var j = { code: String(room.code || '') };
      if (room.ip && room.port) { j.ip = room.ip; j.port = parseInt(room.port, 10) || 0; }
      if (room.mac) j.mac = String(room.mac);
      if (!j.ip && !j.mac) { uiShowError(T('lmp.connectFail', 'فشل الاتصال')); return; }
      try { root.DTSGNative.joinRoom(JSON.stringify(j)); } catch (e) {}
    },
    uiLnRefresh: function () {
      lnDiscover(true, true);
      uiRefresh();
    },
    uiLnBt: function () {
      if (!NATIVE) return;
      try {
        var st = root.DTSGNative.btPerms && root.DTSGNative.btPerms();
        if (st !== 'granted') { root.DTSGNative.requestBtPerms(); return; }
        if (!root.DTSGNative.btOn()) { root.DTSGNative.btEnable(); return; }
        lnDiscover(true, true);
      } catch (e) {}
      uiRefresh();
    },
    uiJoinRoom: function (code) {
      var r = S.lnRooms[String(code || '').toUpperCase()];
      if (!r) return;
      if (!ensureIdentityOrAsk()) return;
      S.lnJoinCode = r.code;
      LocalMP.lnJoinRoom(r);
      uiRefresh();
    },
    uiJoinCode: function () {
      var inp = el('lmpCodeIn');
      var v = inp ? String(inp.value || '').trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{8}$/.test(v)) { uiShowError(T('lmp.badCode8', 'كود الغرفة 8 حروف وأرقام')); return; }
      if (!ensureIdentityOrAsk()) return;
      LocalMP.joinByCode(v);
    }
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
    S.lnJoinCode = null;
    S.lnJoined = false;
    S.replayBuf = null;
    if (NATIVE) {
      try { root.DTSGNative.leaveRoom(); } catch (e) {}
      /* الاكتشاف الخلفي يستمر — الغرف تظل مرئية لكل من فتح التطبيق (عقد المالك) */
      try { root.DTSGNative.discoverStart('{"bt":false}'); } catch (e) {}
    }
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

  /* ═══════════ 5-ب) [v2.87·أصلي] شبكة اللعب المحلي — الأحداث والاكتشاف ═══════════
     Java يدفع كل شيء عبر window.__dtsgLnEvt(json): رسائل الأقران
     (data/peerOpen/peerClose) ونتائج الاكتشاف (room/roomGone) وحالات
     الاتصال (hostReady/hostErr/joined/joinErr) وأذونات البلوتوث
     (btPerms). هنا فقط تُعالَج — لا استطلاع ولا شبكة من الويب. */
  var _lnBtPoll = null;

  function lnDiscover(withBt, force) {
    if (!NATIVE) return;
    try {
      root.DTSGNative.discoverStart(JSON.stringify({ bt: !!withBt }));
    } catch (e) {}
    if (withBt && force) {
      /* بعد طلب الأذونات/تشغيل البلوتوث: النتيجة تصل حدثاً، وإن تأخرت
         الواجهة (بعض الشركات لا تمرر النتيجة) نستطلع مرة بعد قليل. */
      if (_lnBtPoll) clearTimeout(_lnBtPoll);
      _lnBtPoll = setTimeout(function () {
        _lnBtPoll = null;
        try { if (root.DTSGNative.btPerms() === 'granted' && root.DTSGNative.btOn()) lnDiscover(true, true); } catch (e) {}
      }, 2500);
    }
  }
  function lnRoomKey(code) { return String(code || '').trim().toUpperCase(); }
  function lnRoomsUpsert(r) {
    if (!r || !r.code) return;
    var k = lnRoomKey(r.code);
    if (!/^[A-Z0-9]{8}$/.test(k)) return;
    var prev = S.lnRooms[k];
    r.ts = Date.now();
    S.lnRooms[k] = r;
    /* انضمام آلي بالكود: الغرفة المنتظَرة ظهرت في الاكتشاف */
    if (S.lnJoinCode && S.mode === 'guest' && !S.lnJoined && k === S.lnJoinCode) {
      LocalMP.lnJoinRoom(r);
    }
    if (!prev || prev.players !== r.players || prev.transport !== r.transport) uiRefresh();
  }
  function lnRoomsRemove(name) {
    /* اسم الخدمة قد يلحق به لاحقة تكرار من NSD — نستخرج الكود الأخير */
    var m = /([A-Z0-9]{8})\s*(?:\(\d+\))?\s*$/i.exec(String(name || ''));
    if (!m) return;
    var k = m[1].toUpperCase();
    if (S.lnRooms[k]) { delete S.lnRooms[k]; uiRefresh(); }
  }
  function lnOnJoined(ev) {
    S.lnJoined = true;
    S.guestChan = nativeChan(0);
    sendRaw(S.guestChan, { t: 'hello', userId: myId(), name: myName() });
    /* توفير البطارية: توقف الاكتشاف بعد الاتصال — الغرفة قائمة الآن */
    try { root.DTSGNative.discoverStop(); } catch (e) {}
    uiShowError('');
    uiRefresh();
    if (typeof root.toast === 'function') {
      root.toast('📶 ' + (ev && ev.kind === 'bt' ? T('lmp.joinedBt', 'متصل عبر البلوتوث') : T('lmp.joinedWifi', 'متصل عبر الواي فاي')), 'ok');
    }
  }
  function lnOnEvent(ev) {
    if (!ev || !ev.t) return;
    switch (ev.t) {
      case 'data':
        var fake = { data: ev.s };
        if (S.mode === 'host') {
          var peer = peerById(ev.id);
          if (peer) hostOnMessage(peer, fake);
        } else if (S.mode === 'guest' && ev.id === 0) {
          guestOnMessage(fake);
        }
        return;
      case 'peerOpen':            /* المضيف: مقبس ضيف جديد — ينتظر hello */
        if (S.mode !== 'host') return;
        var p = { id: ev.id, kind: ev.kind || 'wifi', pc: null, chan: nativeChan(ev.id), userId: null, name: null };
        S.peers.push(p);
        return;
      case 'peerClose':
        if (S.mode === 'host') {
          var p2 = peerById(ev.id);
          if (p2) dropPeer(p2, T('lmp.peerFail', 'انقطع أحد اللاعبين'));
        } else if (S.mode === 'guest' && ev.id === 0) {
          if (typeof root.toast === 'function') root.toast('📶 ' + T('lmp.hostClosed', 'أغلق المضيف الغرفة'), 'warn');
          teardown();
        }
        return;
      case 'room':
        lnRoomsUpsert(ev.room);
        return;
      case 'roomGone':
        lnRoomsRemove(ev.name);
        return;
      case 'joined':
        if (S.mode === 'guest') lnOnJoined(ev);
        return;
      case 'joinErr':
        S.lnJoined = false;
        uiShowError(T('lmp.connectFail', 'فشل الاتصال — تأكدا من نفس شبكة الواي فاي أو البلوتوث'));
        uiRefresh();
        return;
      case 'hostReady':
        uiRefresh();
        return;
      case 'hostErr':
        uiShowError(T('lmp.hostFail', 'تعذر فتح الغرفة المحلية — تحقق من الشبكة'));
        teardown();
        return;
      case 'btPerms':
        if (ev.granted && S.mode === 'host') lnSyncCount();   /* يعيد إعلان BLE بعد الأذونات */
        if (ev.granted && S.mode === 'guest') lnDiscover(true, true);
        return;
    }
  }
  /* مسجَّل فور تحميل الوحدة — Java يستدعيه عند كل حدث */
  root.__dtsgLnEvt = function (ev) {
    try { lnOnEvent(ev && typeof ev === 'object' ? ev : JSON.parse(ev)); } catch (e) {}
  };

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
  /* [v2.85] رمز QR أو إعلان صريح إن تجاوز السعة — لا حجب صامتاً بعد اليوم */
  function qrBlock(code) {
    var svg = qrSvg(code, 210);
    if (svg) return '<div class="lmp-qr">' + svg + '</div>';
    return '<div class="lmp-toolong"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ' +
      esc(T('lmp.tooLong', 'الرمز أطول من سعة مسح QR — انسخه نصاً لصاحبك')) + '</div>';
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
          '<p class="lmp-sub"><i class="fa-solid fa-signal" aria-hidden="true"></i> ' + esc(T('lmp.sub', 'واي فاي أو مشاركة بلوتوث — لعب مباشر بلا إنترنت وبلا رهان')) + '</p>' +
          '<div class="lmp-err" id="lmpErr" style="display:none"></div>';
    var body = '';
    if (role === 'choose') body = uiChooseBody();
    else if (role === 'host') body = uiHostBody();
    else if (role === 'guest') body = uiGuestBody();
    m.innerHTML = head + body + '</div></div>';
    var err = m._lastErr;
    if (err) uiShowError(err);
  }
  /* [v2.85·تصميم] بطاقة خطوة مرقّمة — نفس لغة الهوية (كحلي × ذهب) */
  function stepCard(n, key, fb) {
    return '<div class="lmp-step"><span class="lmp-step-n">' + n + '</span><span>' + esc(T(key, fb)) + '</span></div>';
  }
  function playersChips() {
    if (!S.room) return '';
    return '<div class="lmp-players">' + S.room.players.map(function (p) {
      return '<span class="lmp-pl' + (p.ready ? ' on' : '') + '">' +
        '<i class="fa-solid ' + (p.ready ? 'fa-circle-check' : 'fa-circle-dot') + '" aria-hidden="true"></i>' + esc(p.username) + '</span>';
    }).join('') + '</div>';
  }
  function uiHostBody() {
    /* [v2.87·أصلي] لوبي المضيف في التطبيق: كود الغرفة كبيراً وفوقه دعوة
       واضحة — لا رمز QR ولا خطوات إقتران إطلاقاً؛ الضيوف يرون الغرفة آلياً. */
    if (NATIVE) {
      var h = '';
      if (S.room && S.room.code) {
        h += '<div class="lmp-bignum" dir="ltr">' + esc(S.room.code) + '</div>' +
          '<div class="lmp-bighint">' + esc(T('lmp.hostCodeHint', 'شارك هذا الكود مع أصحابك — أو ستجد غرفتك عندهم تلقائياً في «الغرف المحلية»')) + '</div>';
      }
      var connectedN = S.peers.length;
      var maxN = S.room ? S.room.max_players : 4;
      h += '<div class="lmp-status"><span class="lmp-pill"><i class="fa-solid fa-plug-circle-check" aria-hidden="true"></i> ' + esc(T('lmp.connected', 'متصل')) + ' <b>' + connectedN + '/' + maxN + '</b></span></div>' + playersChips();
      if (connectedN >= 1) {
        h += '<div class="lmp-row"><button class="lmp-btn lmp-go lmp-big" onclick="LocalMP.uiStart()"><i class="fa-solid fa-play" aria-hidden="true"></i> ' + esc(T('lmp.start', 'فتح اللوبي وبدء اللعب')) + '</button></div>';
      } else {
        h += '<div class="lmp-row lmp-waitrow"><span class="lmp-pill lmp-wait"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ' + esc(T('lmp.waitGuest', 'بانتظار انضمام لاعبين…')) + '</span></div>';
      }
      h += '<div class="lmp-row"><button class="lmp-btn lmp-warn" onclick="LocalMP.uiLeave()"><i class="fa-solid fa-door-open" aria-hidden="true"></i> ' + esc(T('lmp.leave', 'إغلاق الغرفة المحلية')) + '</button></div>';
      return h;
    }
    var pair = S.pendingPair;
    var connected = S.peers.length;
    var max = S.room ? S.room.max_players : 4;
    var h = '';
    if (pair && pair.offerCode) {
      h += stepCard('١', 'lmp.hostStep1', 'اعرض هذا الرمز على صاحبك ليمسحه أو ينسخه') +
        qrBlock(pair.offerCode) +
        codeBlock(pair.offerCode) +
        '<div class="lmp-row"><button class="lmp-btn" onclick="LocalMP.uiCopy(\'' + esc(pair.offerCode) + '\')"><i class="fa-regular fa-copy" aria-hidden="true"></i> ' + esc(T('lmp.copy', 'نسخ رمز الجلسة')) + '</button></div>' +
        stepCard('٢', 'lmp.hostStep2', 'امسح رمز إجابته (أو الصقها هنا)') +
        '<div class="lmp-row"><textarea id="lmpAnswerIn" rows="3" class="lmp-in" placeholder="' + esc(T('lmp.pasteAnswer', 'ألصق رمز إجابة اللاعب هنا')) + '"></textarea></div>' +
        '<div class="lmp-row"><button class="lmp-btn lmp-go" onclick="LocalMP.uiAccept()"><i class="fa-solid fa-link" aria-hidden="true"></i> ' + esc(T('lmp.accept', 'إتمام الاتصال')) + '</button>' +
        '<button class="lmp-btn lmp-scan" onclick="LocalMP.uiScan(false)"><i class="fa-solid fa-camera" aria-hidden="true"></i> ' + esc(T('lmp.scan', 'مسح')) + '</button></div>';
    }
    h += '<div class="lmp-status"><span class="lmp-pill"><i class="fa-solid fa-plug-circle-check" aria-hidden="true"></i> ' + esc(T('lmp.connected', 'متصل')) + ' <b>' + connected + '/' + max + '</b></span></div>' + playersChips();
    if (connected > 0 && connected < max) {
      h += '<div class="lmp-row"><button class="lmp-btn" onclick="LocalMP.uiAddPlayer()"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ' + esc(T('lmp.addPlayer', 'إضافة لاعب آخر')) + '</button></div>';
    }
    if (connected >= 1) {
      h += '<div class="lmp-row"><button class="lmp-btn lmp-go lmp-big" onclick="LocalMP.uiStart()"><i class="fa-solid fa-play" aria-hidden="true"></i> ' + esc(T('lmp.start', 'فتح اللوبي وبدء اللعب')) + '</button></div>';
    }
    h += '<div class="lmp-row"><button class="lmp-btn lmp-warn" onclick="LocalMP.uiLeave()"><i class="fa-solid fa-door-open" aria-hidden="true"></i> ' + esc(T('lmp.leave', 'إغلاق الغرفة المحلية')) + '</button></div>';
    return h;
  }
  function uiGuestBody() {
    /* [v2.87·أصلي] متصفّح الغرف المحلية: الغرف تظهر آلياً (واي فاي/بلوتوث)
       بلا أي إقتران — نقرة واحدة للانضمام، أو كود الغرفة للبحث المباشر. */
    if (NATIVE) return uiGuestNativeBody();
    var h = '';
    if (S.guestAnswerCode) {
      h += stepCard('٢', 'lmp.guestStep2', 'اعرض هذا الرمز على المضيف ليمسحه أو يلصقه') +
        qrBlock(S.guestAnswerCode) +
        codeBlock(S.guestAnswerCode) +
        '<div class="lmp-row"><button class="lmp-btn" onclick="LocalMP.uiCopy(\'' + esc(S.guestAnswerCode) + '\')"><i class="fa-regular fa-copy" aria-hidden="true"></i> ' + esc(T('lmp.copy', 'نسخ رمز الإجابة')) + '</button></div>' +
        '<div class="lmp-status"><span class="lmp-pill lmp-wait"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ' + esc(T('lmp.waitHost', 'بانتظار اكتمال الاتصال من المضيف…')) + '</span></div>';
    } else {
      h += stepCard('١', 'lmp.guestStep1', 'امسح رمز جلسة المضيف (أو الصقه)') +
        '<div class="lmp-row"><textarea id="lmpHostIn" rows="3" class="lmp-in" placeholder="L1.…"></textarea></div>' +
        '<div class="lmp-row"><button class="lmp-btn lmp-go" onclick="LocalMP.uiJoin()"><i class="fa-solid fa-link" aria-hidden="true"></i> ' + esc(T('lmp.join', 'انضمام')) + '</button>' +
        '<button class="lmp-btn lmp-scan" onclick="LocalMP.uiScan(true)"><i class="fa-solid fa-camera" aria-hidden="true"></i> ' + esc(T('lmp.scan', 'مسح')) + '</button></div>';
    }
    h += '<div class="lmp-row"><button class="lmp-btn lmp-warn" onclick="LocalMP.uiLeave()"><i class="fa-solid fa-door-open" aria-hidden="true"></i> ' + esc(T('lmp.leave', 'إلغاء الانضمام')) + '</button></div>';
    return h;
  }
  /* [v2.87·أصلي] بطاقة غرفة مكتشفة — تظهر آلياً لكل من فتح التطبيق */
  function lnRoomCard(r, i) {
    var isBt = r.transport === 'bt';
    var label = gameLabel(r.game);
    return '<div class="lmp-roomcard" role="button" tabindex="0" onclick="LocalMP.uiJoinRoom(\'' + esc(r.code) + '\')" onkeydown="if(event.key===\'Enter\')LocalMP.uiJoinRoom(\'' + esc(r.code) + '\')">' +
      '<div class="lmp-room-info"><span class="lmp-room-game">' + esc(label) + '</span>' +
      '<span class="lmp-room-meta">' + esc(r.name ? (r.name + ' · ') : '') + esc(lnRoomKey(r.code)) + ' · ' + Math.max(1, r.players || 1) + '/' + (r.max || 4) + '</span></div>' +
      '<span class="lmp-badge' + (isBt ? ' bt' : '') + '"><i class="fa-solid ' + (isBt ? 'fa-bluetooth-b' : 'fa-wifi') + '" aria-hidden="true"></i> ' + esc(isBt ? T('lmp.btBadge', 'بلوتوث') : T('lmp.wifiBadge', 'واي فاي')) + '</span>' +
      '<button class="lmp-btn lmp-go lmp-joinbtn"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i> ' + esc(T('lmp.joinBtn', 'انضمام')) + '</button>' +
      '</div>';
  }
  function lnBtRow() {
    var st = '', on = false;
    try { st = root.DTSGNative.btPerms(); on = !!root.DTSGNative.btOn(); } catch (e) {}
    if (st === 'granted' && on) return '';     /* البلوتوث جاهز — لا صف إضافي */
    return '<div class="lmp-row lmp-btrow">' +
      '<span class="lmp-pill lmp-wait"><i class="fa-brands fa-bluetooth-b" aria-hidden="true"></i> ' + esc(T('lmp.btHint2', 'لتظهر غرف البلوتوث:')) + '</span>' +
      '<button class="lmp-btn lmp-mini" onclick="LocalMP.uiLnBt()"><i class="fa-solid fa-power-off" aria-hidden="true"></i> ' + esc(T('lmp.btEnable', 'تشغيل البلوتوث')) + '</button>' +
      '</div>';
  }
  function uiGuestNativeBody() {
    var rooms = [];
    var k;
    for (k in S.lnRooms) if (Object.prototype.hasOwnProperty.call(S.lnRooms, k)) rooms.push(S.lnRooms[k]);
    rooms.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    var h = '';
    if (S.lnJoined) {
      h += '<div class="lmp-status"><span class="lmp-pill"><i class="fa-solid fa-plug-circle-check" aria-hidden="true"></i> ' + esc(T('lmp.waitHost', 'بانتظار اكتمال الاتصال من المضيف…')) + '</span></div>' +
        '<div class="lmp-row"><button class="lmp-btn lmp-warn" onclick="LocalMP.uiLeave()"><i class="fa-solid fa-door-open" aria-hidden="true"></i> ' + esc(T('lmp.leave', 'إلغاء الانضمام')) + '</button></div>';
      return h;
    }
    h += '<div class="lmp-rooms-head">' +
      '<span class="lmp-pill lmp-wait"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i> ' + esc(T('lmp.roomsScan', 'البحث الجاري عن الغرف القريبة…')) + '</span>' +
      '<button class="lmp-btn lmp-mini" onclick="LocalMP.uiLnRefresh()"><i class="fa-solid fa-rotate" aria-hidden="true"></i> ' + esc(T('lmp.refresh', 'تحديث')) + '</button>' +
      '</div>';
    h += lnBtRow();
    if (!rooms.length) {
      h += '<div class="lmp-empty"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i><div>' +
        esc(T('lmp.roomsEmpty', 'لا توجد غرف قريبة بعد — تأكد أنك وصاحبك على نفس الواي فاي (أو نقطة اتصاله) وأنه فتح غرفة، أو فعّل البلوتوث في الجهازين')) + '</div></div>';
    } else {
      h += '<div class="lmp-rooms">' + rooms.map(function (r) { return lnRoomCard(r); }).join('') + '</div>';
    }
    h += '<div class="lmp-codejoin"><div class="lmp-codejoin-t">' + esc(T('lmp.code8', 'أو انضم بكود الغرفة (8 حروف وأرقام)')) + '</div>' +
      '<div class="lmp-row"><input id="lmpCodeIn" class="lmp-in lmp-code" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="XXXXXXXX" dir="ltr" oninput="this.value=this.value.toUpperCase()"></div>' +
      '<div class="lmp-row"><button class="lmp-btn lmp-go" onclick="LocalMP.uiJoinCode()"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> ' + esc(T('lmp.join', 'انضمام لغرفة صديق')) + '</button></div></div>';
    h += '<div class="lmp-row"><button class="lmp-btn lmp-warn" onclick="LocalMP.uiLeave()"><i class="fa-solid fa-door-open" aria-hidden="true"></i> ' + esc(T('lmp.leave', 'إلغاء الانضمام')) + '</button></div>';
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

  /* ═══════════ 7-ب) محدّد نمط الغرفة داخل نافذة إعدادات كل لعبة ═══════════
     [v2.85·توجيه المالك 2026-10-06] زر الواي فاي الصغير القاتم الذي كان يُحقن
     في شريط مودال الغرف (بلا صنف CSS أصلاً فظهر صغيراً داكناً) أُزيل نهائياً —
     مدخل اللعب المحلي صار خياراً أول الدرجة داخل نافذة إعدادات الغرفة نفسها
     التي تُعدّ منها كل لعبة: محدّد مقسّم «🌐 عبر الخادم / 📶 محلي (واي فاي أو
     بلوتوث)» أعلى النافذة. عند اختيار «محلي»: يختفي الرهان والخصوصية (الغرف
     المحلية ودّية بلا رهان — عقد قاعدة 20) ويظهر دليل مختصر، وزر الحفظ يصير
     «فتح الغرفة المحلية» (استضافة) مع زر مرافق «انضمام برمز صديق».
     كل الحقن والتقاطعة هنا — rooms.js لم يُمسّ سطراً (عقد التغليف). */
  function rsModal() { return document.getElementById('roomSettingsModal'); }
  function rsGameSel() { return document.getElementById('rsGame'); }
  function localModeOn() {
    var bar = document.getElementById('rsModeBar');
    return !!(bar && bar.dataset.mode === 'local' && bar.style.display !== 'none');
  }
  function rsSetFields(localOn) {
    var hide = ['rsVisibility', 'rsBet'];
    for (var i = 0; i < hide.length; i++) {
      var f = document.getElementById(hide[i]);
      if (!f) continue;
      var lb = document.querySelector('#roomSettingsModal label[for="' + hide[i] + '"]');
      if (lb) lb.style.display = localOn ? 'none' : '';
      f.style.display = localOn ? 'none' : '';
    }
    var desc = document.getElementById('rsTypeDesc');
    if (desc) desc.style.display = localOn ? 'none' : '';
    var note = document.getElementById('rsLocalNote');
    if (note) note.style.display = localOn ? '' : 'none';
    var save = document.getElementById('rsSave');
    if (save) {
      var sv = save.querySelector('.rs-save-label');
      if (sv) sv.textContent = localOn ? T('lmp.openLocal', 'فتح الغرفة المحلية') : T('rs.save', 'إنشاء الغرفة');
      var si = save.querySelector('i');
      if (si) si.className = localOn ? 'fa-solid fa-wifi' : 'fa-solid fa-check';
      save.classList.toggle('lmp-save', !!localOn);
    }
    var join = document.getElementById('rsJoinLocal');
    if (join) join.style.display = localOn ? '' : 'none';
    if (localOn) {
      var bet = document.getElementById('rsBet');
      if (bet) bet.classList.remove('err');
      var msg = document.getElementById('rsMsg');
      if (msg) msg.textContent = '';
    }
  }
  function rsSyncModeVisibility() {
    /* التحكيم غرفة خادمية بعقد مال حصراً — يُخفى خيار المحلي كلياً عنده،
       وإن كان المحلي مختاراً فيُعاد للخادمي (لا غرفة تحكيم محلية أبداً). */
    var bar = document.getElementById('rsModeBar');
    var g = rsGameSel();
    var isArb = !!(g && g.value === 'arb');
    var roomLive = !!(root.Rooms && root.Rooms.state);
    if (!bar) return;
    if (isArb || roomLive) {
      /* إعدادات غرفة قائمة أو تحكيم: لا مبدّل — النمط الخادمي وحده */
      bar.style.display = 'none';
      if (bar.dataset.mode === 'local') { bar.dataset.mode = 'server'; }
      rsSetFields(false);
    } else {
      bar.style.display = '';
      rsSetFields(bar.dataset.mode === 'local');
    }
  }
  function injectRoomMode() {
    var sm = rsModal();
    if (!sm || document.getElementById('rsModeBar')) { rsSyncModeVisibility(); return; }
    var body = sm.querySelector('.mbody');
    if (!body) return;
    /* المحدّد المقسّم — أول عنصر في النافذة قبل وصف الرسوم */
    var bar = document.createElement('div');
    bar.className = 'rs-modebar';
    bar.id = 'rsModeBar';
    bar.dataset.mode = 'server';
    bar.setAttribute('role', 'radiogroup');
    bar.setAttribute('aria-label', T('lmp.modeLabel', 'نمط الغرفة'));
    bar.innerHTML =
      '<button type="button" class="rs-mode active" data-mode="server" role="radio" aria-checked="true" onclick="LocalMP.rsPickMode(\'server\')">' +
        '<i class="fa-solid fa-globe" aria-hidden="true"></i><span>' + esc(T('lmp.modeServer', 'عبر الخادم')) + '</span></button>' +
      '<button type="button" class="rs-mode" data-mode="local" role="radio" aria-checked="false" onclick="LocalMP.rsPickMode(\'local\')">' +
        '<i class="fa-solid fa-wifi" aria-hidden="true"></i><span>' + esc(T('lmp.modeLocal', 'محلي (واي فاي / بلوتوث)')) + '</span></button>';
    var desc = document.getElementById('rsTypeDesc');
    if (desc) body.insertBefore(bar, desc); else body.insertBefore(bar, body.firstChild);
    /* ملاحظة الغرفة المحلية (تظهر في الوضع المحلي وحده) */
    var note = document.createElement('div');
    note.className = 'rs-localnote';
    note.id = 'rsLocalNote';
    note.style.display = 'none';
    note.innerHTML = '<i class="fa-solid fa-circle-info" aria-hidden="true"></i><div><b>' + esc(T('lmp.title', 'الغرفة المحلية')) + '</b> — ' +
      esc(T('lmp.localNote', 'لعب مباشر مع صديق على نفس شبكة الواي فاي أو مشاركة البلوتوث بلا إنترنت — جولة ودّية بلا رهان وبلا رسوم. اختر اللعبة وإعداداتها ثم افتح الغرفة وشارك الرمز.')) + '</div>';
    var visLabel = sm.querySelector('label[for="rsVisibility"]');
    if (visLabel && visLabel.parentNode) visLabel.parentNode.insertBefore(note, visLabel);
    else body.appendChild(note);
    /* زر الانضمام المحلي — مرافق لزر الإنشاء في الوضع المحلي */
    var join = document.createElement('button');
    join.className = 'btn full ghost rs-joinlocal';
    join.id = 'rsJoinLocal';
    join.type = 'button';
    join.style.display = 'none';
    join.innerHTML = '<i class="fa-solid fa-qrcode" aria-hidden="true"></i> <span>' + esc(T('lmp.joinByCode', 'انضمام لغرفة صديق (رمز / مسح)')) + '</span>';
    join.addEventListener('click', function () {
      try { Rooms.closeRoomSettings(); } catch (e) {}
      LocalMP.joinHere();
    });
    var actions = sm.querySelector('.crow');
    if (actions) actions.insertBefore(join, actions.firstChild);
    /* التقاط زر الإنشاء في طور الالتقاط قبل معالج rooms.js: في الوضع المحلي
       لا تُنشأ غرفة خادمية — تُستضاف غرفة محلية باللعبة وإعداداتها المختارة */
    var save = document.getElementById('rsSave');
    if (save && !save._lmpWrap) {
      save._lmpWrap = true;
      save.addEventListener('click', function (e) {
        if (!localModeOn()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        LocalMP.rsStartLocal();
      }, true);
    }
    var g = rsGameSel();
    if (g && !g._lmpModeBound) {
      g._lmpModeBound = true;
      g.addEventListener('change', function () { rsSyncModeVisibility(); });
    }
    /* عند كل فتح للنافذة يعاد ضبط ظهور المحدّد (غرفة قائمة؟ تحكيم؟) */
    if (!sm._lmpOpenBound) {
      sm._lmpOpenBound = true;
      var mo = new MutationObserver(function () { rsSyncModeVisibility(); });
      mo.observe(sm, { attributes: true, attributeFilter: ['style'] });
    }
    rsSyncModeVisibility();
  }
  LocalMP.rsPickMode = function (mode) {
    var bar = document.getElementById('rsModeBar');
    if (!bar) return;
    bar.dataset.mode = (mode === 'local') ? 'local' : 'server';
    var btns = bar.querySelectorAll('.rs-mode');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-mode') === bar.dataset.mode;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
    rsSetFields(bar.dataset.mode === 'local');
  };
  LocalMP.rsStartLocal = function () {
    var g = rsGameSel();
    var gid = g ? String(g.value || '') : '';
    if (!gid || (root.Rooms && !Rooms.isGameSupported(gid)) || gid === 'arb') {
      if (typeof root.toast === 'function') root.toast(T('lmp.needGame', 'اختر لعبة أولاً'), 'warn');
      return;
    }
    if (!ensureIdentityOrAsk()) return;
    var opts = null;
    try { opts = Rooms._collectGameOpts(gid); } catch (e) { opts = null; }
    try { Rooms.closeRoomSettings(); } catch (e) {}
    LocalMP.hostRoom(gid, opts);
  };

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
    S.lnJoined = false;
    uiOpen('guest');
    /* [v2.87·أصلي] فتح المتصفّح = اكتشاف كامل (واي فاي + بلوتوث) فوراً */
    if (NATIVE) lnDiscover(true, true);
  };
  function uiChooseBody() {
    if (NATIVE) {
      /* [v2.87·أصلي] نفس الزرّين بمسار أبسط: الغرف تُكتشف آلياً */
      return '<div class="lmp-row"><button class="lmp-btn lmp-go lmp-big" onclick="LocalMP.hostHere()"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i> ' + esc(T('lmp.host', 'إنشاء غرفة (أنا المضيف)')) + '</button></div>' +
        '<div class="lmp-row"><button class="lmp-btn lmp-go lmp-big" onclick="LocalMP.joinHere()"><i class="fa-solid fa-users-viewfinder" aria-hidden="true"></i> ' + esc(T('lmp.joinNearby', 'الغرف المحلية القريبة')) + '</button></div>' +
        '<p class="lmp-hint"><i class="fa-brands fa-bluetooth-b" aria-hidden="true"></i> ' + esc(T('lmp.autoHint', 'الغرف تظهر تلقائياً لكل من فتح التطبيق على نفس الواي فاي أو البلوتوث — بلا إقتران وبلا إنترنت')) + '</p>';
    }
    return '<div class="lmp-row"><button class="lmp-btn lmp-go lmp-big" onclick="LocalMP.hostHere()"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i> ' + esc(T('lmp.host', 'إنشاء غرفة (أنا المضيف)')) + '</button></div>' +
      '<div class="lmp-row"><button class="lmp-btn lmp-go lmp-big" onclick="LocalMP.joinHere()"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i> ' + esc(T('lmp.join', 'انضمام لغرفة صديق')) + '</button></div>' +
      '<p class="lmp-hint"><i class="fa-brands fa-bluetooth-b" aria-hidden="true"></i> ' + esc(T('lmp.btHint', 'البلوتوث: فعّل «مشاركة الاتصال عبر البلوتوث» في إعدادات نقطة الاتصال بهاتف المضيف ثم انضم — نفس مسار الواي فاي تماماً')) + '</p>';
  }

  root.LocalMP = LocalMP;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { patchRooms(); injectRoomMode(); lnAutostart(); });
  } else {
    patchRooms(); injectRoomMode(); lnAutostart();
  }
  /* [v2.87·أصلي] «الغرف المحلية تظهر آلياً لكل لاعب فتح التطبيق» (عقد المالك):
     اكتشاف NSD الخلفي منذ التحميل — بلا أي طلب أذونات (البلوتوث يُطلب عند
     فتح صفحة الغرف المحلية فقط)، والنتائج تتراكم في S.lnRooms فتكون القائمة
     جاهزة فور فتح النافذة. */
  function lnAutostart() {
    if (!NATIVE) return;
    lnDiscover(false);
    /* الأجهزة التي تفصل الاكتشاف عند سكون الشبكة: تنشيط دوري خفيف كل 25ث */
    setInterval(function () {
      if (S.mode === 'guest' && S.lnJoined) return;   /* داخل غرفة — لا اكتشاف */
      try { root.DTSGNative.discoverStart('{"bt":false}'); } catch (e) {}
    }, 25000);
  }
  /* حقن متأخر: نافذة الإعدادات موجودة في index.html الثابت فتُحقن فوراً
     عادة — والمحاولتان الإضافيتان لأي تحميل بطيء (لا ضرر من التكرار) */
  setTimeout(injectRoomMode, 1200);
  setTimeout(injectRoomMode, 4000);

})(window);
