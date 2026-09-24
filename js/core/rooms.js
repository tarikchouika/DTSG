/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Rooms (multiplayer)
   فتح غرفة + دعوة صديق بكود + لعب وجهاً لوجه
   يعتمد على السيرفر: /api/rooms/* + أحداث SSE room:*
   ═══════════════════════════════════════════ */
(function () {
  "use strict";

  var _source = null;
  var _started = false;
  var _gameHandler = null;   // معالج room:move للعبة النشطة
  var _startHandler = null;  // معالج بدء اللعب (status=playing)
  var _updateHandler = null; // [Req3] معالج تحديث حالة الغرفة (لتحديث واجهة التصويت)
  var _messages = [];        // رسائل الغرفة (جماعية + فردية مستلمة)
  var _pendingReplay = null;  // [Resilience] تاريخ الحركات لإعادة بناء الحالة عند العودة
  var _recipient = null;     // { id, name } — المستلم الفردي الحالي (null = الجميع)

  /* ── أدوات ── */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function me() {
    return (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
  }

  var Rooms = {
    state: null,
    /* الألعاب المدعومة للغرف: id -> أقصى عدد لاعبين */
    roomGameIds: { rp: 2, pn: 2, pr: 4, rn: 4, rm: 4, rd: 4, bj: 4, dm: 2, ch: 2, bg: 2, do: 4, bl: 4, un: 4, bl8: 2, blbb: 2, blgv: 2, blsn: 2, blca: 2 }, /* [إصلاح] البلياردو كانت غائبة — زر «غرفة أونلاين» كان صامتاً + [BJMP] بلاك جاك جماعي 2-4 بلا بانكر + [BGDO] الطاولة 2 والضومنة 2-4 لاعبين + [UN] أونو غرف 2-4 لاعبين */

    isGameSupported: function (id) { return !!Rooms.roomGameIds[id]; },
    /* [Persist] طلب إعادة بناء الجولة: إعادة فتح قناة WS للغرفة — الخادم يعيد
       hello + room:replay فيُعاد تشغيل سجل الحركات على اللوحة الجديدة */
    requestReplay: function () {
      try { if (typeof window !== 'undefined' && typeof window.__liveWatchRoom === 'function') window.__liveWatchRoom(true); } catch (e) {}
    },
    /* [Persist] حفظ عضوية الغرفة محلياً — تنجو من تجديد الصفحة وانقطاع النت */
    _persistRoom: function (room) {
      try {
        if (room && room.id) localStorage.setItem('rc_active_room', JSON.stringify({ id: room.id, code: room.code, game_id: room.game_id, ts: Date.now() }));
        else localStorage.removeItem('rc_active_room');
      } catch (e) {}
    },
    isActive: function () { return !!(Rooms.state && Rooms.state.status === 'playing'); },
    maxFor: function (id) { return Rooms.roomGameIds[id] || 2; },
    /* إظهار/إخفاء زر «العب مع صديق» حسب اللعبة المفتوحة */
    syncBtn: function () {
      var show = Rooms.isGameSupported(window._currentGameId);
      var b = document.getElementById('roomBtn');
      if (b) b.style.display = show ? '' : 'none';
      var ab = document.getElementById('aiBtn');
      if (ab) ab.style.display = show ? '' : 'none';
    },

    /* ═══════ SSE (أحداث الغرف فقط — نفس /api/live) ═══════ */
    joinSse: function () {
      if (_started || typeof EventSource === 'undefined') return;
      _started = true;
      _source = new EventSource('/api/live');
      _source.addEventListener('room:update', function (e) {
        try { Rooms._onUpdate(JSON.parse(e.data)); } catch (err) { console.error('[rooms] update', err); }
      });
      _source.addEventListener('room:move', function (e) {
        try { Rooms._onMove(JSON.parse(e.data)); } catch (err) { console.error('[rooms] move', err); }
      });
      _source.addEventListener('room:chat', function (e) {
        try { Rooms._onChat(JSON.parse(e.data)); } catch (err) { console.error('[rooms] chat', err); }
      });
      /* [Req7] رمز تعبيري/تفاعل وارد من عضو في الغرفة */
      _source.addEventListener('room:react', function (e) {
        try { Rooms._onReact(JSON.parse(e.data)); } catch (err) { console.error('[rooms] react', err); }
      });
      /* [Req8] رسالة صوتية واردة (≤10ث) */
      _source.addEventListener('room:voice', function (e) {
        try { Rooms._onVoice(JSON.parse(e.data)); } catch (err) { console.error('[rooms] voice', err); }
      });
      /* [Resilience] إعادة بناء حالة الجولة للاعب العائد (بعد انقطاع/إغلاق) */
      _source.addEventListener('room:replay', function (e) {
        try {
          var d = JSON.parse(e.data);
          _pendingReplay = d;   /* يستهلكها محوّل اللعبة عند فتحها */
          /* [Resilience] إن كانت اللعبة مسجَّلة بالفعل، طبّق الإعادة فوراً */
          try {
            if (typeof window !== 'undefined' && typeof window.applyRoomReplay === 'function') window.applyRoomReplay(d);
            else if (typeof window !== 'undefined' && typeof window.RM_applyReplay === 'function') window.RM_applyReplay(d);
          } catch (er) {}
        } catch (err) { console.error('[rooms] replay', err); }
      });
      /* [B-settle] تسوية نهاية الجولة: فائز/خاسر/تعادل + احتساب الرسم وفق نوع الغرفة */
      _source.addEventListener('room:settle', function (e) {
        try { Rooms._onSettle(JSON.parse(e.data)); } catch (err) { console.error('[rooms] settle', err); }
      });
    },

    _onUpdate: function (room) {
      var prev = Rooms.state;
      var prevStatus = prev ? prev.status : null;
      Rooms.state = room;
      Rooms._persistRoom(room);   /* [Persist] */
      /* [B-rooms] مؤقّت واحد للعدّاد التنازلي (غرف الساعة) — يُنشأ مرة ويُزال في reset() */
      if (room && room.room_type === 'hour' && room.expires_at && !Rooms._cdTi) {
        Rooms._cdTi = setInterval(function () { Rooms._renderCountdown(); }, 1000);
      }
      /* [SYNC-FIX] انتهت الجولة (playing → waiting): تُعلَم اللعبة كي تعطّل
         محركها القديم — بدء الجولة التالية يعيد البناء نظيفاً عند كل الأطراف.
         (كانت لوحة الجولة السابقة تبقى حية عند طرف وتبدأ نظيفة عند آخر = فقدان مزامنة) */
      if (room && prevStatus === 'playing' && room.status !== 'playing') {
        try { if (typeof window !== 'undefined' && typeof window.onRoomRoundEnded === 'function') window.onRoomRoundEnded(room); } catch (e) {}
      }
      /* بدأت اللعبة للتو → إبلاغ اللعبة (تغلق المودال وتبدأ محلياً) */
      if (room && room.status === 'playing' && prevStatus !== 'playing') {
        /* [RoomGold] بدء جولة غرفة: الرهان اقتُطع خادمياً — حدّث رصيد الواجهة
           (الجميع: المالك من الاستجابة والضيوف من هذا البث) */
        Rooms._refreshGold();
        /* [RS-GameOpts] إعدادات اللعبة المخزنة في الغرفة تُطبق عند كل العملاء قبل البدء */
        if (room.game_opts) { try { Rooms._applyGameOpts(room.game_id, room.game_opts); } catch (e) {} }
        Rooms.closeModal();
        /* [إصلاح] اللاعب خارج صفحة اللعبة عند البدء (مثلاً في الرئيسية) — افتحها أولاً
           ثم أطلق المعالج بعد أن تسجّله اللعبة أثناء فتحها */
        if (typeof openGame === 'function' && window._currentGameId !== room.game_id) {
          openGame(room.game_id);
          setTimeout(function () { if (_startHandler) _startHandler(room); }, 400);
        } else if (_startHandler) {
          _startHandler(room);   /* [Req3] يُبقى المعالج لإعادة إطلاقه عند المباراة الجديدة */
        }
      }
      /* غادرت الغرفة (حُذفت أو طردت) */
      if (!room) { Rooms.reset(); Rooms.render(); return; }
      Rooms.render();
      if (_updateHandler) { try { _updateHandler(room); } catch (e) {} }   /* [Req3] تحديث واجهة التصويت */
    },
    _onMove: function (d) {
      /* [Persist] اللاعب خارج صفحة لعبة الغرفة (تصفح لعبة أخرى/الرئيسية):
         لا نمرر الحركة لواجهة غير موجودة — سجل الخادم يحفظها، وعند العودة
         يعاد بناء الجولة كاملة عبر room:replay. */
      if (Rooms.state && Rooms.state.game_id && window._currentGameId !== Rooms.state.game_id) return;
      if (_gameHandler) _gameHandler(d);
    },
    /* رسالة غرفة جديدة (جماعية أو فردية واردة) */
    _onChat: function (msg) {
      if (!msg || !msg.text) return;
      _messages.push(msg);
      if (_messages.length > 100) _messages.splice(0, _messages.length - 100);
      /* إشعار للمراسلة الفردية الواردة */
      var u = me();
      if (msg.to_id != null && msg.to_id !== (u && u.id) && msg.from_id !== (u && u.id)) return; /* ليست لي */
      Rooms.renderChat();
      if (msg.to_id != null && msg.from_id !== (u && u.id)) {
        toast('💬 ' + esc(msg.from_name) + ': ' + esc(msg.text), 'ok');
        if (typeof SND !== 'undefined' && SND.notify) SND.notify();
      } else if (msg.to_id == null && msg.from_id !== (u && u.id)) {
        /* [Req7] الرسائل الجماعية تظهر أثناء اللعب (دون فتح المودال) */
        toast('💬 ' + esc(msg.from_name) + ': ' + esc(msg.text), 'ok');
        if (typeof SND !== 'undefined' && SND.notify) SND.notify();
      }
    },
    /* [Req7] تفاعل وارد: رمز يطفو على شاشة الجميع (لاعبين + متفرجين) */
    _onReact: function (d) {
      if (!d || !d.emoji) return;
      Rooms._spawnReact(d.emoji, d.from_name || '');
      if (typeof SND !== 'undefined' && SND.notify) SND.notify();
    },
    /* رسم رمز طافٍ متحرك يختفي تلقائياً */
    _spawnReact: function (emoji, name) {
      var host = document.getElementById('roomReactStage') || Rooms._ensureReactStage();
      if (!host) return;
      var el = document.createElement('div');
      el.className = 'room-react-burst';
      var left = 18 + Math.random() * 60;
      el.style.left = left + '%';
      el.innerHTML = '<span class="rrb-emoji">' + esc(emoji) + '</span>' + (name ? '<span class="rrb-name">' + esc(name) + '</span>' : '');
      host.appendChild(el);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2600);
    },
    _ensureReactStage: function () {
      var st = document.createElement('div');
      st.id = 'roomReactStage';
      st.className = 'room-react-stage';
      document.body.appendChild(st);
      return st;
    },
    /* [Req7] إرسال رمز تفاعل للجميع */
    sendReact: function (emoji) {
      if (!Rooms.state) return;
      API.post('/api/rooms/react', { room_id: Rooms.state.id, emoji: String(emoji || '') }).catch(function () {});
      /* أظهره محلياً فوراً */
      var u = me();
      Rooms._spawnReact(emoji, u ? u.username : '');
      Rooms._toggleReactPanel(false);
    },
    /* [Req7] الرسالة السريعة داخل اللعبة (للجميع) */
    sendQuickMsg: function () {
      var inp = document.getElementById('roomReactInput');
      if (!inp || !Rooms.state) return;
      var text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      API.post('/api/rooms/chat', { room_id: Rooms.state.id, text: text, to: null }).then(function (r) {
        if (r && r.ok && r.data && r.data.msg) Rooms._onChat(r.data.msg);
      });
      Rooms._toggleReactPanel(false);
    },
    /* [Req8] تسجيل/إيقاف رسالة صوتية ≤10ث وبثّها للجميع */
    toggleVoice: function () {
      if (Rooms._mr) { Rooms.stopVoice(); return; }
      if (!Rooms.state) return;
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
        toast('🎤 المتصفح لا يدعم تسجيل الصوت', 'err'); return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        var rec;
        try { rec = new MediaRecorder(stream); } catch (e) { toast('🎤 فشل بدء التسجيل', 'err'); return; }
        Rooms._mr = { rec: rec, chunks: [], stream: stream, start: Date.now() };
        rec.ondataavailable = function (e) { if (e.data && e.data.size) Rooms._mr.chunks.push(e.data); };
        rec.onstop = function () {
          var mr = Rooms._mr; Rooms._mr = null; Rooms._renderVoiceRec(false);
          if (Rooms._voiceTi) { clearInterval(Rooms._voiceTi); Rooms._voiceTi = null; }
          try { mr.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
          var blob = new Blob(mr.chunks, { type: mr.rec.mimeType || 'audio/webm' });
          var dur = Math.max(1, Math.min(10, Math.round((Date.now() - mr.start) / 1000)));
          if (!blob.size) { toast('🎤 تسجيل فارغ', 'warn'); return; }
          var fr = new FileReader();
          fr.onload = function () {
            API.post('/api/rooms/voice', { room_id: Rooms.state.id, audio: fr.result, dur: dur }).catch(function () {});
            toast('🎤 تم إرسال الرسالة الصوتية', 'ok');
          };
          fr.readAsDataURL(blob);
        };
        rec.start();
        Rooms._renderVoiceRec(true);
        Rooms._voiceTi = setInterval(function () {
          var el = document.getElementById('roomVoiceTimer');
          var s = Math.min(10, Math.round((Date.now() - Rooms._mr.start) / 1000));
          if (el) el.textContent = String(s);
        }, 250);
        Rooms._voiceTimer = setTimeout(function () { Rooms.stopVoice(); }, 10000);
      }).catch(function (e) {
        toast('🎤 لا يمكن الوصول للميكروفون: ' + (e && e.message ? e.message : 'مرفوض'), 'err');
      });
    },
    stopVoice: function () {
      if (Rooms._voiceTimer) { clearTimeout(Rooms._voiceTimer); Rooms._voiceTimer = null; }
      if (Rooms._mr && Rooms._mr.rec && Rooms._mr.rec.state !== 'inactive') {
        try { Rooms._mr.rec.stop(); } catch (e) {}
      }
    },
    _renderVoiceRec: function (on) {
      var box = document.getElementById('roomVoiceRec');
      var mic = document.getElementById('roomMicBtn');
      if (box) box.style.display = on ? 'flex' : 'none';
      if (mic) { mic.classList.toggle('rec', !!on); mic.textContent = on ? '⏹' : '🎤'; }
    },
    /* [Req8] رسالة صوتية واردة: تشغيل تلقائي + فقاعة قابلة لإعادة التشغيل */
    _onVoice: function (d) {
      if (!d || !d.audio) return;
      Rooms._spawnVoiceBubble(d.audio, d.from_name || '', d.dur || 0);
      if (typeof SND !== 'undefined' && SND.notify) SND.notify();
    },
    _spawnVoiceBubble: function (dataUrl, name, dur) {
      var host = document.getElementById('roomReactStage') || Rooms._ensureReactStage();
      if (!host) return;
      var el = document.createElement('div');
      el.className = 'room-voice-bubble';
      el.innerHTML = '<span class="rvb-icon">🔊</span>' +
        '<span class="rvb-name">' + esc(name || '') + (dur ? (' · ' + dur + 's') : '') + '</span>';
      el.onclick = function () { try { new Audio(dataUrl).play(); } catch (e) {} };
      host.appendChild(el);
      /* تشغيل تلقائي (قد يُحجب دون تفاعل — تظل الفقاعة قابلة للنقر) */
      try { var a = new Audio(dataUrl); a.play().catch(function () {}); } catch (e) {}
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 6000);
    },
    /* [Req7] إظهار/إخفاء لوحة الرموز والرسائل */
    _toggleReactPanel: function (force) {
      var p = document.getElementById('roomReactPanel');
      if (!p) return;
      var show = (force === undefined) ? (p.style.display === 'none' || !p.style.display) : !!force;
      p.style.display = show ? 'flex' : 'none';
    },
    /* [Req7] الأيقونة الطافية + لوحة الرموز/الرسائل (تظهر داخل غرفة نشطة) */
    _REACT_SET: ['👍', '❤️', '😂', '🔥', '🎉', '😮', '👏', '🤔'],
    _syncReactWidget: function () {
      if (typeof document === 'undefined') return;
      var btn = document.getElementById('roomReactBtn');
      var active = !!(Rooms.state && (Rooms.state.status === 'playing' || Rooms.state.status === 'waiting'));
      if (!btn) {
        if (!active) return;
        btn = document.createElement('button');
        btn.id = 'roomReactBtn';
        btn.className = 'room-react-btn';
        btn.setAttribute('aria-label', 'رموز ورسائل');
        btn.title = 'رموز ورسائل';
        btn.innerHTML = '😊';
        btn.onclick = function (e) { if (e) e.stopPropagation(); Rooms._toggleReactPanel(); };
        var panel = document.createElement('div');
        panel.id = 'roomReactPanel';
        panel.className = 'room-react-panel';
        panel.style.display = 'none';
        var emojis = Rooms._REACT_SET.map(function (em) {
          return '<span class="rrp-emoji" onclick="Rooms.sendReact(\'' + em + '\')">' + em + '</span>';
        }).join('');
        panel.innerHTML =
          '<div class="rrp-head">' + (typeof T === 'function' ? T('ui.reactTitle') || 'تفاعل سريع' : 'تفاعل سريع') + '</div>' +
          '<div class="rrp-emojis">' + emojis + '</div>' +
          '<div class="rrp-msg">' +
            '<button id="roomMicBtn" class="rrp-mic" onclick="Rooms.toggleVoice()" title="' + (typeof T === 'function' ? T('ui.voiceRec') || 'رسالة صوتية ≤10ث' : 'رسالة صوتية ≤10ث') + '" aria-label="رسالة صوتية">🎤</button>' +
            '<input id="roomReactInput" type="text" maxlength="120" placeholder="' + (typeof T === 'function' ? T('ui.reactMsgPh') || 'رسالة للجميع…' : 'رسالة للجميع…') + '" onkeydown="if(event.key===\'Enter\'){Rooms.sendQuickMsg();}">' +
            '<button class="rrp-send" onclick="Rooms.sendQuickMsg()" aria-label="إرسال">➤</button>' +
          '</div>' +
          '<div id="roomVoiceRec" class="rrp-voicerec" style="display:none"><span class="rvr-dot"></span><span id="roomVoiceTimer">0</span>s · ' + (typeof T === 'function' ? T('ui.voiceRecStop') || 'انقر للإيقاف والإرسال' : 'انقر للإيقاف والإرسال') + '</div>';
        document.body.appendChild(btn);
        document.body.appendChild(panel);
        Rooms._bindReactDrag(btn);
        document.addEventListener('click', function (ev) {
          if (!btn.contains(ev.target) && !panel.contains(ev.target)) Rooms._toggleReactPanel(false);
        });
      }
      btn.style.display = active ? 'flex' : 'none';
      if (!active) Rooms._toggleReactPanel(false);
    },
    /* [B-migrate] سحب أيقونة الرموز (#roomReactBtn) يدوياً — نفس منطق السحب السابق للأيقونة العائمة.
       النقر = فتح اللوحة؛ السحب = تحريك الأيقونة ضمن الشاشة. نخزّن الموضع في localStorage. */
    _bindReactDrag: function (btn) {
      if (!btn || btn._dragBound) return;
      btn._dragBound = true;
      btn.style.touchAction = 'none';
      /* [F7] دالة clamp تعيد الزر داخل الشاشة عند أي تغيّر حجم/اتجاه */
      btn._clamp = function () {
        var w = btn.offsetWidth, h = btn.offsetHeight;
        if (!w) return;
        var maxX = window.innerWidth - w - 4, maxY = window.innerHeight - h - 4;
        var x = parseFloat(btn.style.left) || 0, y = parseFloat(btn.style.top) || 0;
        x = Math.max(4, Math.min(x, maxX)); y = Math.max(4, Math.min(y, maxY));
        btn.style.right = 'auto'; btn.style.bottom = 'auto';
        btn.style.left = x + 'px'; btn.style.top = y + 'px';
      };
      /* استعادة الموضع المحفوظ (نسبة مئوية إن وُجدت، وإلا px قديم) */
      try {
        var saved = localStorage.getItem('rc_fab_pos');
        if (saved) {
          var pos = JSON.parse(saved);
          if (pos && typeof pos.rx === 'number' && typeof pos.ry === 'number') {
            var x = Math.round(pos.rx * window.innerWidth);
            var y = Math.round(pos.ry * window.innerHeight);
            btn.style.right = 'auto'; btn.style.bottom = 'auto';
            btn.style.left = x + 'px'; btn.style.top = y + 'px';
            btn._clamp();
          } else if (pos && typeof pos.x === 'number') {
            btn.style.right = 'auto'; btn.style.bottom = 'auto';
            btn.style.left = pos.x + 'px'; btn.style.top = (pos.y || 0) + 'px';
            btn._clamp();
          }
        }
      } catch (e) {}
      var drag = null;
      btn.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        var r = btn.getBoundingClientRect();
        drag = { startX: e.clientX, startY: e.clientY, origX: r.left, origY: r.top,
          moved: false, id: e.pointerId, w: r.width, h: r.height };
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      });
      btn.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.startX;
        var dy = e.clientY - drag.startY;
        if (!drag.moved && (dx * dx + dy * dy) < 100) return; /* عتبة 10px لفصل النقرة عن السحب */
        if (!drag.moved) { drag.moved = true; btn.classList.add('dragging'); }
        var nx = drag.origX + dx;
        var ny = drag.origY + dy;
        var maxX = window.innerWidth - drag.w - 4;
        var maxY = window.innerHeight - drag.h - 4;
        nx = Math.max(4, Math.min(nx, maxX));
        ny = Math.max(4, Math.min(ny, maxY));
        btn.style.right = 'auto'; btn.style.bottom = 'auto';
        btn.style.left = nx + 'px'; btn.style.top = ny + 'px';
        if (e.cancelable) e.preventDefault();
      });
      function endDrag(e) {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        var wasDrag = drag.moved;
        var pid = drag.id;
        drag = null;
        btn.classList.remove('dragging');
        try { btn.releasePointerCapture(pid); } catch (err) {}
        if (wasDrag) {
          if (btn._clamp) btn._clamp();
          var r = btn.getBoundingClientRect();
          try {
            /* [F7] نخزّن النسبة المئوية (مركز الزر) لا px — لتتكيّف مع أي حجم شاشة */
            var rx = (r.left + r.width / 2) / window.innerWidth;
            var ry = (r.top + r.height / 2) / window.innerHeight;
            localStorage.setItem('rc_fab_pos', JSON.stringify({ rx: rx, ry: ry }));
          } catch (err) {}
          /* منع النقرة اللاحقة من فتح اللوحة بعد السحب */
          var block = function (ev) { ev.stopPropagation(); ev.preventDefault(); btn.removeEventListener('click', block, true); };
          btn.addEventListener('click', block, true);
        }
      }
      btn.addEventListener('pointerup', endDrag);
      btn.addEventListener('pointercancel', endDrag);
      /* [F7] إعادة clamp عند تغيّر الحجم/الاتجاه/ملء الشاشة (لا حسابات داخل حلقة تمرير) */
      if (!Rooms._fabListenersBound) {
        Rooms._fabListenersBound = true;
        var clampFn = function () { if (btn && btn._clamp) btn._clamp(); };
        window.addEventListener('resize', clampFn, { passive: true });
        window.addEventListener('orientationchange', clampFn, { passive: true });
        document.addEventListener('fullscreenchange', clampFn, { passive: true });
        document.addEventListener('webkitfullscreenchange', clampFn, { passive: true });
      }
    },
    /* [Rooms-unified] شارة نوع الغرفة أُزيلت — لا اختيار نوع بعد الآن (5% موحد على الجولات).
       الدالة تبقى (تستدعيها أماكن قديمة) لكنها لا تعرض شيئاً. */
    _renderBadge: function () {
      var badge = document.getElementById('roomTypeBadge');
      if (badge) { badge.textContent = ''; badge.style.display = 'none'; }
    },
    /* [B-migrate] إعدادات الغرفة (نوع + رهان) — ربط عناصر المودال التي أنشأها index.html */
    _initSettings: function () {
      if (Rooms._settingsBound) return;
      Rooms._settingsBound = true;
      /* [F4] تعبئة قائمة اللعبة بالألعاب المدعومة في الغرف (لا تفتح فارغة) */
      var sel = document.getElementById('rsGame');
      if (sel && !sel.options.length) {
        var ids = Object.keys(Rooms.roomGameIds);
        sel.innerHTML = ids.map(function (id) {
          var g = (typeof GAMES !== 'undefined') && GAMES.filter(function (x) { return x.id === id; })[0];
          var label = g ? (g.em + ' ' + (typeof gname === 'function' ? gname(g) : g.n[0])) : id;
          return '<option value="' + id + '">' + esc(label) + '</option>';
        }).join('');
      }
      var gear = document.getElementById('roomGearBtn');
      var save = document.getElementById('rsSave');
      var cancel = document.getElementById('rsCancel');
      if (gear) gear.addEventListener('click', function () { Rooms._openSettings(false); });
      if (save) save.addEventListener('click', Rooms._saveSettings);
      if (cancel) cancel.addEventListener('click', function () {
        /* إن وُجدت غرفة نغلق الإعدادات (نعود للغرفة)؛ وإلا نبقيها مفتوحة (الإلغاء معطّل) */
        if (Rooms.state) {
          var sm = document.getElementById('roomSettingsModal');
          if (sm) sm.style.display = 'none';
        }
      });
    },
    /* [RS-GameOpts] خانات إعدادات اللعبة المختارة داخل مودال إعدادات الغرفة.
       تُطبَّق على حالة المالك محلياً — هو من يبثّ التهيئة (init/cfg) للجميع عند البدء. */
    _gameOptsDefs: function (gid) {
      var sec = function (v) { return v + ' ' + (T('dama.seconds') || 'ث'); };
      var timer = { key: 'timer', label: T('dama.timer') || 'مؤقت الدور', opts: [[30, sec(30)], [60, sec(60)], [120, sec(120)], [180, sec(180)], [300, sec(300)]], def: 60 };
      var timer90 = { key: 'timer', label: T('dama.timer') || 'مؤقت الدور', opts: [[30, sec(30)], [60, sec(60)], [90, sec(90)], [120, sec(120)], [180, sec(180)], [300, sec(300)]], def: 90 };
      if (gid === 'rm') return [
        { key: 'mode', label: T('rami.roundType') || 'نوع الجولة', opts: [['talaj', T('rami.talaj') || 'طالاج'], ['simple', T('rami.simple') || 'سامبل']], def: 'talaj' },
        /* [Targets-Match 2026-09-13] أهداف مطابقة لنافذة اللعبة حرفياً (rami._targetOptions):
           لكل وضع قائمته — قائمة فارغة تُملأ ديناميكياً في _renderGameOpts
           تبعاً للوضع المختار: سامبل [201,301,401,501,701,801] وطالاج [301,401,501,701,801,901,1001] */
        { key: 'target', label: T('rami.target') || 'الهدف', opts: [], def: 'single' },
        timer90
      ];
      if (gid === 'rn') return [
        { key: 'mode', label: T('rn.mode') || 'نمط التخمين', opts: [['number_only', (T('rn.modeNum') || 'الرقم فقط') + ' ×2'], ['number_symbol', (T('rn.modeSym') || 'الرقم والرمز') + ' ×3']], def: 'number_only' }
      ];
      if (gid === 'pr') return [
        { key: 'mode', label: T('parchisi.mode') || 'نمط اللعب', opts: [['classic', T('parchisi.modeClassic') || 'كلاسيك'], ['rapido', T('parchisi.modeRapido') || 'رابيدو'], ['spanish', T('parchisi.modeSpanish') || 'إسباني']], def: 'classic' },
        timer
      ];
      if (gid === 'rd') return [
        /* عدد المقاعد يحدد نمط روندا: 2 = 1ضد1، 3 = 1ضد2 (فردي)،
           4 = إما 1ضد3 (فردي) أو 2ضد2 (فرق) — يُميّز بينهما خيار "نمط 4 لاعبين". */
        { key: 'maxp', label: T('rm.playersCount') || 'عدد اللاعبين',
          opts: [[2, '1 ضد 1 — 2'], [3, '1 ضد 2 — 3'], [4, '4 لاعبين (راجع النمط التالي)']], def: 2 },
        { key: 'mode4', label: T('rdc.mode4.label') || 'نمط 4 لاعبين',
          opts: [['ffa', '1 ضد 3 — فردي'], ['tt', '2 ضد 2 — فرق']], def: 'ffa' },
        /* [rd-v25] الهدف: «جولة» (تنتهي المباراة بنهاية توزيع الـ40 ورقة) أو 41/51/61 */
        { key: 'target', label: T('rdc.targetLabel') || 'هدف الفوز',
          opts: [['round', (T('rdc.target.round') || 'جولة') + ' (40)'], [41, '41'], [51, '51'], [61, '61']], def: 51 },
        /* [rd-v25] مؤقت الدور 30–300 ث (الافتراضي 60) — التولّي الآلي عند انتهائه */
        { key: 'timer', label: T('rdc.timer.label') || 'مؤقت الدور',
          opts: [[30, sec(30)], [60, sec(60)], [90, sec(90)], [120, sec(120)], [180, sec(180)], [300, sec(300)]], def: 60 }
      ];
      if (gid === 'rp') return [
        { key: 'rounds', label: T('rp.rounds') || 'عدد الجولات', opts: [[3, '3'], [5, '5'], [7, '7']], def: 3 }
      ];
      /* [BJMP] بلاك جاك جماعي: عدد المقاعد 2-4 (نتحكم بالخيارات بأنفسنا — لا تُضاف maxp تلقائياً) */
      if (gid === 'bj') return [
        { key: 'maxp', label: T('rm.playersCount') || 'عدد اللاعبين', opts: [[2, '2 لاعبين — 2'], [3, '3 لاعبين — 3'], [4, '4 لاعبين — 4']], def: 4 }
      ];
      if (gid === 'pn') return [
        { key: 'rounds', label: T('pn.rounds') || 'عدد الركلات', opts: [[5, '5'], [7, '7'], [9, '9']], def: 5 }
      ];
      /* [BGDO] الطاولة: طول المباراة (1/3/5 نقاط) — يعتمده السائق عند البدء */
      if (gid === 'bg') return [
        { key: 'len', label: T('bg.match') || 'طول المباراة', opts: [[1, '1'], [3, '3'], [5, '5']], def: 3 }
      ];
      /* [BGDO] الضومنة: عدد اللاعبين (2، 3، 4) + نقاط الفوز + قاعدة السحب (كلاسيكي/Block) */
      if (gid === 'do') return [
        { key: 'maxp', label: T('rm.playersCount') || 'عدد اللاعبين', opts: [[2, '2 ' + (T('rm.playersCount') || 'لاعبين')], [3, '3 ' + (T('rm.playersCount') || 'لاعبين')], [4, '4 ' + (T('rm.playersCount') || 'لاعبين')]], def: 4 },
        { key: 'target', label: T('dm.target') || 'نقاط الفوز', opts: [[50, '50'], [100, '100'], [150, '150'], [200, '200']], def: 100 },
        { key: 'draw', label: T('dm.drawRule') || 'قاعدة السحب', opts: [[1, T('dm.draw.classic') || 'كلاسيكي — اسحب حتى تلعب'], [0, T('dm.draw.block') || 'بدون بنك (Block)']], def: 1 }
      ];
      if (gid === 'bl') return [
        /* [BL] البلوت: هدف المباراة + مؤقت الدور (السائق يتولى المنقطع بعد المهلة) */
        { key: 'target', label: T('blt.target') || 'هدف الفوز', opts: [[51, '51'], [100, '100'], [150, '150'], [152, '152']], def: 51 },
        timer
      ];
      if (gid === 'un') return [
        /* [UN] أونو: هدف المباراة + مؤقت الدور (السائق يتولى المنقطع بعد المهلة) */
        { key: 'target', label: T('un.target') || 'نقاط المباراة', opts: [[200, '200'], [500, '500'], [1000, '1000']], def: 200 },
        timer
      ];
      if (gid === 'dm' || gid === 'ch') return [timer];
      if (gid === 'blca') return [
        { key: 'disc', label: T('bl.caDisc') || 'الاختصاص', opts: [['FREE', T('bl.caFree') || 'حرة'], ['ONE', T('bl.caOne') || 'وسادة'], ['THREE', T('bl.caThree') || '3 وسائد']], def: 'THREE' },
        { key: 'target', label: T('bl.caTarget') || 'هدف النقاط', opts: [[5, '5'], [10, '10'], [25, '25']], def: 10 },
        timer90
      ];
      if (gid === 'blgv') return [
        { key: 'fin', label: T('bl.gvFinish') || 'نمط الإنهاء', opts: [['DIRECT', T('bl.gvDirect') || 'ديريكت'], ['DERNIER', T('bl.gvDernier') || 'ديرنيي'], ['BOUND', T('bl.gvBound') || 'بوند'], ['ANNONCE', T('bl.gvAnnonce') || 'أنونص'], ['ANNONCE_BOUND', T('bl.gvAnnBound') || 'أنونص بوند']], def: 'DIRECT' },
        { key: 'bound', label: T('bl.gvBoundN') || 'عدد البوند', opts: [[2, '2'], [3, '3'], [4, '4'], [5, '5']], def: 2 },
        timer90
      ];
      if (/^bl/.test(gid || '')) return [timer90];
      return [];
    },
    _renderGameOpts: function (gid) {
      var box = document.getElementById('rsGameOpts');
      if (!box) return;
      var defs = Rooms._gameOptsDefs(gid).slice();
      /* [Targets-Match] رامي: أهداف القائمة تتبع الوضع المختار — نفس نافذة اللعبة
         حرفياً (rami._targetOptions). عند إعادة البناء بسبب تغيير الوضع: يُحفظ
         الهدف المختار إن ظل ضمن القائمة الجديدة وإلا يعود لافتراضي «شوط واحد». */
      if (gid === 'rm') {
        var prevMode = document.getElementById('rsOpt_mode');
        var prevTarget = document.getElementById('rsOpt_target');
        var modeV = prevMode ? ((prevMode.value === 'simple') ? 'simple' : 'talaj') : 'talaj';
        var keepTarget = prevTarget ? prevTarget.value : null;
        var tDef = null;
        for (var ti = 0; ti < defs.length; ti++) if (defs[ti].key === 'target') { tDef = defs[ti]; break; }
        if (tDef) {
          var nums = (modeV === 'simple') ? [201, 301, 401, 501, 701, 801] : [301, 401, 501, 701, 801, 901, 1001];
          tDef.opts = [['single', T('rami.singleRound') || 'رهان على شوط واحد']];
          nums.forEach(function (n) { tDef.opts.push([String(n), String(n)]); });
          if (keepTarget && tDef.opts.some(function (o) { return String(o[0]) === String(keepTarget); })) {
            tDef.def = keepTarget;
          }
        }
      }
      /* [RS-GameOpts] الألعاب الجماعية (سعة > 2): خانة تحديد عدد اللاعبين
         (تُضاف تلقائياً فقط إن لم تعرّفها اللعبة بنفسها — الروندا تفرض 2 أو 4) */
      var hasMaxp = defs.some(function (d) { return d.key === 'maxp'; });
      var cap = Rooms.maxFor(gid);
      if (cap > 2 && !hasMaxp) {
        var po = [];
        for (var n = 2; n <= cap; n++) po.push([n, String(n)]);
        defs.unshift({ key: 'maxp', label: T('rm.playersCount') || 'عدد اللاعبين', opts: po, def: cap });
      }
      if (!defs.length) { box.innerHTML = ''; return; }
      var html = '';
      for (var i = 0; i < defs.length; i++) {
        var d = defs[i];
        html += '<label class="aflabel" for="rsOpt_' + d.key + '"><i class="fa-solid fa-sliders" aria-hidden="true"></i> ' + esc(d.label) + '</label>' +
          '<select class="afinput" id="rsOpt_' + d.key + '">' +
          d.opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(d.def) ? ' selected' : '') + '>' + esc(String(o[1])) + '</option>'; }).join('') +
          '</select>';
      }
      box.innerHTML = html;
      /* [Targets-Match] رامي: تغيير الوضع يعيد بناء الأهداف بقائمة الوضع الجديد */
      if (gid === 'rm') {
        var ms = document.getElementById('rsOpt_mode');
        if (ms && !ms.dataset.targetSync) {
          ms.dataset.targetSync = '1';
          ms.addEventListener('change', function () { Rooms._renderGameOpts('rm'); });
        }
      }
    },
    _collectGameOpts: function (gid) {
      var defs = Rooms._gameOptsDefs(gid);
      var out = {};
      for (var i = 0; i < defs.length; i++) {
        var el = document.getElementById('rsOpt_' + defs[i].key);
        if (!el) continue;
        var v = el.value;
        out[defs[i].key] = (/^\d+$/.test(v)) ? parseInt(v, 10) : v;
      }
      return out;
    },
    _applyGameOpts: function (gid, o) {
      if (!o) return;
      try {
        if (gid === 'rn') { window.RN_ROOM_CFG = o; }
        else if (gid === 'pr') { window.PR_ROOM_CFG = o; }
        else if (gid === 'rp' || gid === 'pn') { window.HTH_ROUNDS = window.HTH_ROUNDS || {}; window.HTH_ROUNDS[gid] = o.rounds || 0; }
        else if (gid === 'rm') {
          window.RAMI_ROOM_CFG = o;   /* يقرؤها _netConfig عند بدء جولة الغرفة */
          if (o.mode) {
            window.RAMI_SETUP_MODE = (o.mode === 'simple') ? 'simple' : 'talaj';
            if (typeof ramiSetMode === 'function') { try { ramiSetMode(window.RAMI_SETUP_MODE); } catch (e) {} }
          }
        }
        else if (gid === 'rd') { window.RD_ROOM_CFG = o; }
        else if (gid === 'bg') {
          /* [BGDO] إعدادات غرفة الطاولة: طول المباراة (يبثّه السائق في init) */
          window.BG_ROOM_CFG = o;
          if (typeof window.BackgammonApp !== 'undefined' && window.BackgammonApp && o.len) {
            try { window.BackgammonApp.config.len = Math.max(1, Math.min(5, parseInt(o.len, 10) || 3)); } catch (e) {}
          }
        } else if (gid === 'do') {
          /* [BGDO] إعدادات غرفة الضومنة: الهدف + قاعدة السحب + عدد اللاعبين (يبثّها السائق في init) */
          window.DO_ROOM_CFG = o;
          if (typeof window.DominoApp !== 'undefined' && window.DominoApp) {
            try {
              if (o.target) window.DominoApp.config.target = Math.max(50, Math.min(200, parseInt(o.target, 10) || 100));
              if (typeof o.draw === 'number') window.DominoApp.config.drawUntilPlayable = !!o.draw;
              if (o.maxp) window.DominoApp.config.playersCount = Math.max(2, Math.min(4, parseInt(o.maxp, 10) || 4));
            } catch (e) {}
          }
        } else if (gid === 'dm') {
          window.DM_ROOM_TIMER = o.timer || 0;
          if (typeof DAMA !== 'undefined' && DAMA) DAMA.timeLimit = o.timer || 0;
        } else if (gid === 'ch') {
          window.CH_ROOM_TIMER = o.timer || 0;
          if (typeof CHESS !== 'undefined' && CHESS) CHESS.timer = o.timer || 0;
        } else if (gid === 'bl') {
          /* [BL] إعدادات غرفة البلوت: الهدف + المؤقت (يقرؤها بلوت عند بدء الجولة) */
          window.BL_ROOM_CFG = o;
          try {
            if (window.BalootApp) {
              if (o.target) window.BalootApp.config.target = Math.max(21, Math.min(400, parseInt(o.target, 10) || 51));
            }
          } catch (e) {}
        } else if (gid === 'un') {
          /* [UN] إعدادات غرفة أونو: الهدف + المؤقت (يقرؤها أونو عند بدء الجولة) */
          window.UN_ROOM_CFG = o;
          try {
            if (window.UnoApp) {
              if (o.target) window.UnoApp.config.target = Math.max(100, Math.min(2000, parseInt(o.target, 10) || 200));
            }
          } catch (e) {}
        } else if (/^bl/.test(gid || '') && typeof BILLIARDS !== 'undefined' && BILLIARDS) {
          if (o.timer) BILLIARDS.turnTimer = Math.max(30, Math.min(300, o.timer));
          if (o.disc) BILLIARDS.caromDisc = o.disc;
          if (o.target) BILLIARDS.caromTarget = o.target;
          if (o.fin) BILLIARDS.gvFinish = o.fin;
          if (o.bound) BILLIARDS.gvBound = o.bound;
        }
      } catch (e) {}
    },
    _openSettings: function (forceNoRoom) {
      var sm = document.getElementById('roomSettingsModal');
      if (!sm) return;
      var bet = document.getElementById('rsBet');
      var game = document.getElementById('rsGame');
      var vis = document.getElementById('rsVisibility');
      /* [F4] قيمة افتراضية (اللعبة الحالية أو رامي) كي لا تفتح القائمة فارغة أبداً */
      if (game) {
        /* [Policy 2026-09-16] تُعاد تعبئة القائمة عند كل فتح — الألعاب المعطلة
           من السوبر أدمن تختفي من نافذة إعداد الغرفة */
        var dis = (typeof DISABLED !== 'undefined') ? DISABLED : {};
        var ids = Object.keys(Rooms.roomGameIds).filter(function (id) { return !dis[id]; });
        game.innerHTML = ids.map(function (id) {
          var g = (typeof GAMES !== 'undefined') && GAMES.filter(function (x) { return x.id === id; })[0];
          var label = g ? (g.em + ' ' + (typeof gname === 'function' ? gname(g) : g.n[0])) : id;
          return '<option value="' + id + '">' + esc(label) + '</option>';
        }).join('');
        var def = window._currentGameId || (Rooms.state && Rooms.state.game_id) || 'rm';
        if (dis[def]) def = ids[0] || 'rm';
        game.value = def;
        /* [RS-GameOpts] خانات إعدادات اللعبة المختارة — تُحدَّث مع كل تغيير */
        Rooms._renderGameOpts(def);
        if (!game._optsBound) {
          game._optsBound = true;
          game.addEventListener('change', function () { Rooms._renderGameOpts(game.value); });
        }
      }
      if (Rooms.state) {
        if (bet && typeof Rooms.state.bet === 'number') bet.value = Rooms.state.bet;
        /* [B-rooms] خصوصية الغرفة الحالية (عامة/خاصة) */
        if (vis) vis.value = (Rooms.state.visibility === 'private') ? 'private' : 'public';
      } else if (vis) {
        vis.value = 'public';
      }
      /* [Rooms-unified] وصف ثابت: رسم 5% من رهان الرابح في كل جولة (لا اختيار نوع بعد الآن) */
      Rooms._typeDesc();
      var cancel = document.getElementById('rsCancel');
      if (cancel) {
        var lock = !!(forceNoRoom || !Rooms.state);
        cancel.disabled = lock;
        cancel.style.opacity = lock ? '0.5' : '';
        cancel.title = lock ? T('rm.required') : '';
      }
      /* [F2] نعرض المظلّة كطبقة مرنة توسّط البطاقة (لا block) */
      sm.style.display = 'flex';
      if (bet) bet.focus();
    },
    /* [Rooms-unified] وصف رسوم الغرفة الموحدة: 5% من رهان الرابح في كل جولة */
    _typeDesc: function () {
      var el = document.getElementById('rsTypeDesc');
      if (el) el.textContent = T('rm.pctDesc') || 'بلا رسم على الفتح وبلا حد زمني — رسم 5% من رهان اللاعب الفائز في كل جولة.';
    },
    _saveSettings: function () {
      var bet = document.getElementById('rsBet');
      var game = document.getElementById('rsGame');
      var vis = document.getElementById('rsVisibility');
      var gid = (game && game.value) || window._currentGameId || (Rooms.state && Rooms.state.game_id);
      var betVal = bet ? (parseInt(bet.value, 10) || 0) : 0;
      var visVal = (vis && vis.value === 'private') ? 'private' : 'public';
      if (!(betVal > 0)) {
        toast(T('rm.required'), 'err');
        if (bet) bet.classList.add('err');
        return;
      }
      if (bet) bet.classList.remove('err');
      /* [RS-GameOpts] إعدادات اللعبة تُخزَّن في الغرفة على الخادم وتُبث لكل المنضمين */
      var gOpts = Rooms._collectGameOpts(gid);
      var mEl = document.getElementById('rsOpt_maxp');
      var maxp = mEl ? (parseInt(mEl.value, 10) || 0) : 0;
      Rooms._applyGameOpts(gid, gOpts);
      /* [Rooms-unified] room_type ثابت 'percentage' — الرسم 5% على كل جولة (لا اختيار في الواجهة) */
      Rooms.createRoom(gid, { room_type: 'percentage', bet: betVal, visibility: visVal, game_opts: gOpts, max_players: maxp }).then(function () {
        var sm = document.getElementById('roomSettingsModal');
        if (sm) sm.style.display = 'none';
      });
    },
    /* [B-migrate] إغلاق مودال إعدادات الغرفة (زر الإغلاق + النقر على الخلفية) */
    closeRoomSettings: function () {
      var sm = document.getElementById('roomSettingsModal');
      if (sm) sm.style.display = 'none';
    },
    /* إرسال رسالة: جماعية (إلى الجميع) أو فردية (إلى _recipient) */
    sendChat: function () {
      var inp = document.getElementById('roomChatInput');
      if (!inp || !Rooms.state) return;
      var text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      var to = _recipient ? _recipient.id : null;
      API.post('/api/rooms/chat', { room_id: Rooms.state.id, text: text, to: to }).then(function (r) {
        if (!r.ok) {
          toast((r.data && r.data.message) || T('ui.roomError'), 'err');
          return;
        }
        if (r.data && r.data.msg) Rooms._onChat(r.data.msg);
      });
    },
    /* اختيار مستلم فردي (null = الجميع) */
    setRecipient: function (id, name) {
      _recipient = (id == null || id === 'all') ? null : { id: Number(id), name: String(name || '') };
      Rooms.renderChat();
      var inp = document.getElementById('roomChatInput');
      if (inp) inp.focus();
    },

    /* تسجيل معالجات اللعبة النشطة (تستدعيها اللعبة عند فتحها) */
    setGameHandler: function (fn) { _gameHandler = fn; },
    setStartHandler: function (fn) { _startHandler = fn; },
    setUpdateHandler: function (fn) { _updateHandler = fn; },   /* [Req3] */
    /* [Resilience] استهلاك تاريخ الحركات المعلّق لإعادة بناء الحالة */
    consumePendingReplay: function () { var h = _pendingReplay; _pendingReplay = null; return h; },
    hasPendingReplay: function () { return !!_pendingReplay; },

    /* ═══════ API ═══════ */
    /* [B10] إنشاء غرفة: opts = { room_type, bet } (أو عدد bet للتوافق القديم مع الشطرنج).
       يُرسل نوع الغرفة + الرهان إلى /api/rooms؛ الخادم يقتطع الرهان عند بدء الجولة. */
    createRoom: function (gameId, opts) {
      var u = me();
      if (!u) { toast(T('ui.roomNeedLogin'), 'warn'); if (typeof openAuthModal === 'function') openAuthModal(); return; }
      /* [Auth] المشرفون (admin/super) لا يفتحون غرفاً كلاعبين ولا يراهنون */
      if (u.role && u.role !== 'user') { toast(T('auth.adminNoPlay'), 'err'); return; }
      var max = Rooms.maxFor(gameId);
      var bet = 0;
      /* [Rooms-unified] النوع موحد دائماً: percentage (5% من رهان الرابح في كل جولة) */
      var roomType = 'percentage';
      var visibility = 'public';
      var gOpts = null;
      if (typeof opts === 'number') {
        bet = opts;
      } else if (opts && typeof opts === 'object') {
        bet = (typeof opts.bet === 'number') ? opts.bet : 0;
        if (opts.visibility === 'private') visibility = 'private';
        if (opts.game_opts) gOpts = opts.game_opts;
        /* [RS-GameOpts] عدد اللاعبين المختار (ضمن سعة اللعبة) */
        if (opts.max_players && opts.max_players >= 2 && opts.max_players <= max) max = opts.max_players;
      }
      var payload = { game_id: gameId, max_players: max, bet: bet, room_type: roomType, visibility: visibility };
      if (gOpts) payload.game_opts = gOpts;
      return API.post('/api/rooms', payload).then(function (r) {
        if (!r.ok) {
          var msg = (r.data && r.data.message) || T('ui.roomError');
          if (r.data && r.data.error === 'insufficient_funds') msg = '🚫 ' + msg;
          toast(msg, 'err');
          return;
        }
        Rooms.state = r.data.room;
        Rooms._persistRoom(r.data.room);   /* [Persist] */
        Rooms.render();
        Rooms.openModal();
      });
    },
    joinRoom: function (code) {
      var u = me();
      if (!u) { toast(T('ui.roomNeedLogin'), 'warn'); if (typeof openAuthModal === 'function') openAuthModal(); return; }
      /* [Auth] المشرفون (admin/super) لا ينضمون كلاعبين ولا يراهنون */
      if (u.role && u.role !== 'user') { toast(T('auth.adminNoPlay'), 'err'); return; }
      code = String(code || '').trim().toUpperCase();
      if (!code) return;
      return API.post('/api/rooms/join', { code: code }).then(function (r) {
        if (!r.ok) {
          toast((r.data && r.data.message) || T('ui.roomError'), 'err');
          Rooms.render();
          return;
        }
        /* [Persist] عائد/منضم لجولة جارية: لا خصم رهان مكرر عند إعادة تهيئة اللعبة */
        Rooms._rejoinLive = (r.data.room.status === 'playing');
        if (r.data.room.status === 'playing') {
          /* [RoomFlow] غرفة جارية (لاعب عائد أو متفرج جديد): مسار البدء الكامل —
             فتح اللعبة، إطلاق startHandler، وإعادة بناء الجولة من سجل الخادم (room:replay) */
          Rooms.state = null;   /* يضمن prevStatus ≠ playing داخل _onUpdate */
          Rooms._onUpdate(r.data.room);
          setTimeout(function () { Rooms.requestReplay(); }, 700);
        } else {
          Rooms.state = r.data.room;
          Rooms._persistRoom(r.data.room);   /* [Persist] */
          /* فتح اللعبة إن لم تكن مفتوحة */
          var gid = r.data.room.game_id;
          if (typeof openGame === 'function' && window._currentGameId !== gid) openGame(gid);
          Rooms.render();
          Rooms.openModal();
        }
      });
    },
    /* [Policy 2026-09-16] أُزيلت إضافة الآليين للغرف — الغرف حصرية للرهان
       واللعب وجه لوجه بين البشر؛ التدريب ضد الآلي مجاني خارج الغرف. */
    addBot: function () {
      toast(T('rm.humansOnly') || 'الغرف حصرية للاعبين البشر — التدريب ضد الآلي من شاشة اللعبة', 'warn');
    },
    removeBot: function () {},
    leaveRoom: function () {
      if (!Rooms.state) return;
      /* [RoomFlow] الخروج سلس في أي وقت — الخادم ينقل الملكية ويُبقي الغرفة حية ما بقي لاعبون */
      var id = Rooms.state.id;
      Rooms.state = null;
      return API.post('/api/rooms/leave', { room_id: id }).then(function () {
        Rooms.reset();
        Rooms.render();
        Rooms.closeModal();
        if (typeof closeGamePage === 'function' && window._currentGameId) closeGamePage();
      });
    },
    /* [Req6] إعلان انتهاء الرهان (المُنشئ فقط) → تعود الغرفة للانتظار ويُسمح بالإغلاق */
    endBet: function () {
      if (!Rooms.state) return;
      var u = me();
      if (Rooms.state.owner_id !== (u && u.id)) return;
      API.post('/api/rooms/endBet', { room_id: Rooms.state.id }).then(function (r) {
        if (r && r.ok && r.data && r.data.room) Rooms._onUpdate(r.data.room);
      });
    },
    /* [Req3] بدء تصويت المباراة الجديدة (المُنشئ، عند نهاية المباراة) */
    startRematch: function () {
      if (!Rooms.state) return;
      API.post('/api/rooms/rematch/start', { room_id: Rooms.state.id }).then(function (r) {
        if (r && r.ok && r.data && r.data.room) Rooms._onUpdate(r.data.room);
      });
    },
    /* [Req3] تصويت مشارك: agree/refuse */
    voteRematch: function (vote) {
      if (!Rooms.state) return;
      API.post('/api/rooms/rematch/vote', { room_id: Rooms.state.id, vote: vote }).then(function (r) {
        if (r && r.ok && r.data && r.data.room) Rooms._onUpdate(r.data.room);
      });
    },
    /* مغادرة صامتة عند الخروج من صفحة اللعبة */
    leaveQuiet: function () {
      if (!Rooms.state) return;
      var id = Rooms.state.id;
      Rooms.state = null;
      Rooms._persistRoom(null);   /* [Persist] */
      _gameHandler = null;
      _startHandler = null;
      API.post('/api/rooms/leave', { room_id: id }).catch(function () {});
    },
    setReady: function (ready) {
      if (!Rooms.state) return;
      API.post('/api/rooms/ready', { room_id: Rooms.state.id, ready: !!ready }).then(function (r) {
        /* [RoomFix] تحديث فوري من الاستجابة — لا انتظار للبث */
        if (r && r.ok && r.data && r.data.room) Rooms._onUpdate(r.data.room);
        else if (!r.ok) toast((r.data && r.data.message) || T('ui.roomError'), 'err');
      });
    },
    startGame: function () {
      if (!Rooms.state) return;
      API.post('/api/rooms/start', { room_id: Rooms.state.id }).then(function (r) {
        if (!r.ok) { toast((r.data && r.data.message) || T('ui.roomError'), 'err'); return; }
        /* [RoomFix] إطلاق فوري عند المالك من الاستجابة (البث يغطي الآخرين) */
        if (r.data && r.data.room) Rooms._onUpdate(r.data.room);
        /* [RoomGold] الرهان اقتُطع خادمياً عند البدء — مزامنة رصيد الواجهة
           فوراً (ST.gold محلي كان يبقى قديماً فتطمسه authSync عند الإغلاق) */
        Rooms._refreshGold();
      });
    },
    /* [RoomGold] سحب الرصيد الحقيقي من الخادم إلى الواجهة (غرف اللعب) */
    _refreshGold: function () {
      API.get('/api/me').then(function (r) {
        if (r.ok && r.data && r.data.user && typeof r.data.user.gold === 'number') {
          if (typeof AUTH !== 'undefined' && AUTH.user) AUTH.user.gold = r.data.user.gold;
          if (typeof ST !== 'undefined') { ST.gold = r.data.user.gold; if (typeof wallet === 'function') wallet(); }
        }
      }).catch(function () {});
    },
    sendMove: function (action, data, state) {
      if (!Rooms.state) return false;
      var payload = { room_id: Rooms.state.id, action: action, data: data || {} };
      if (state !== undefined && state !== null) payload.state = state;
      API.post('/api/rooms/move', payload).then(function (r) {
        if (!r.ok) {
          toast((r.data && r.data.message) || T('ui.roomError'), 'err');
          return;
        }
        /* مزامنة room_state فقط من استجابة الحركة (الحقل الذي تغيّره فعلاً)؛
           لا نطمس joinQueue/players المتغيّرة عبر بثّ SSE الحيّ بلقطة قديمة */
        if (r.data && r.data.room && Rooms.state && Rooms.state.id === r.data.room.id) {
          Rooms.state.room_state = r.data.room.room_state;
        }
      });
      return true;
    },
    /* اختيار أعمى (ألعاب زوجية): القيمة تصل للخادم فقط — لا تُبث للخصم حتى يكتمل زوج الاختيارين
       (الخادم يبث blindResult بالزوج معاً — عدالة وجهاً لوجه) */
    sendBlind: function (data) {
      if (!Rooms.state) return false;
      API.post('/api/rooms/move', { room_id: Rooms.state.id, action: 'blind', data: data || {} }).then(function (r) {
        if (!r.ok) toast((r.data && r.data.message) || T('ui.roomError'), 'err');
      });
      return true;
    },
    toggleSpectate: function () {
      if (!Rooms.state) return;
      var u = me();
      var mine = null;
      Rooms.state.players.forEach(function (p) { if (p.id === (u && u.id)) mine = p; });
      var target = !(mine && mine.spectate);
      API.post('/api/rooms/spectate', { room_id: Rooms.state.id, spectate: target }).then(function (r) {
        if (!r.ok) toast((r.data && r.data.message) || T('ui.roomError'), 'err');
        else if (r.data && r.data.room) Rooms._onUpdate(r.data.room);   /* [RoomFix] */
      });
    },
    /* [Spectator] طلب الانضمام كمشغل عند تفرّغ مقعد */
    requestJoin: function () {
      if (!Rooms.state) return;
      var u = me();
      if (!u) { if (typeof openAuthModal === 'function') openAuthModal(); return; }
      API.post('/api/rooms/joinRequest', { room_id: Rooms.state.id }).then(function (r) {
        if (!r.ok) toast((r.data && r.data.message) || T('ui.roomError'), 'err');
        else toast(T('rami.specJoinSent') || '✅ تم تسجيل طلب الانضمام — ستنضمّ عند تفرّغ مقعد', 'ok');
      });
    },
    /* هل طلبتي الحالي في طابور الانضمام؟ */
    myJoinPending: function () {
      var u = me();
      if (!Rooms.state || !Rooms.state.joinQueue || !u) return false;
      return Rooms.state.joinQueue.some(function (r) { return r.id === u.id; });
    },

    /* ═══════ مودال الغرفة ═══════ */
    /* كانت اللعبة في ملء الشاشة قبل فتح المودال؟ (لإعادتها عند الإغلاق) */
    _fsBefore: false,
    openModal: function () {
      var m = document.getElementById('roomModal');
      if (!m) return;
      /* المودال خارج #pg-game — في ملء الشاشة لا يُعرض ولا يُتفاعل معه:
         نخرج مؤقتاً من ملء الشاشة (وإعادة عند الإغلاق) */
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) {
        Rooms._fsBefore = true;
        var exit = (document.exitFullscreen && document.exitFullscreen.call(document)) ||
                   (document.webkitExitFullscreen && document.webkitExitFullscreen.call(document));
        if (exit && exit.catch) exit.catch(function () {});
      }
      m.classList.add('show');
      Rooms._initSettings();
      /* جلب سجل رسائل الغرفة (آخر 50) */
      if (Rooms.state) {
        _recipient = null;
        API.get('/api/rooms/' + Rooms.state.id + '/chat').then(function (r) {
          if (r.ok && r.data && r.data.messages) {
            _messages = r.data.messages.slice(-100);
            Rooms.renderChat();
          }
        });
      } else {
        /* لا غرفة بعد → إجبار المستخدم على اختيار النوع + الرهان قبل الإنشاء */
        Rooms._openSettings(true);
      }
      Rooms.render();
    },
    closeModal: function () {
      var m = document.getElementById('roomModal');
      if (m) m.classList.remove('show');
      /* [F1] إعادة ملء الشاشة على جذر المستند (المودال داخله فيبقى ظاهراً) */
      if (Rooms._fsBefore) {
        Rooms._fsBefore = false;
        var rootEl = document.documentElement;
        var rq = rootEl.requestFullscreen || rootEl.webkitRequestFullscreen;
        if (rq) { try { var p = rq.call(rootEl); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
      }
    },
    toggleFromGame: function () {
      if (!Rooms.state) {
        var gid = window._currentGameId;
        if (!Rooms.isGameSupported(gid)) return;
        /* [B10] لا غرفة بعد → افتح المودال (سيُظهر إعدادات النوع + الرهان إجبارياً) */
        Rooms.openModal();
        return;
      }
      Rooms.openModal();
    },
    /* [Policy 2026-09-16] لم يعد التدريب عبر غرفة بوت — التدريب ضد الآلي
       مجاني بلا رهان من شاشة إعداد كل لعبة (الغرف حصرية للبشر والرهان). */
    practiceVsAi: function (gameId) {
      toast(T('rm.humansOnly') || 'الغرف حصرية للاعبين البشر — التدريب ضد الآلي من شاشة اللعبة', 'warn');
    },

    render: function () {
      Rooms._syncReactWidget();
      Rooms._renderBadge();
      var body = document.getElementById('roomBody');
      if (!body) return;
      var st = Rooms.state;
      if (!st) {
        body.innerHTML = '<div class="ctext" style="padding:12px;text-align:center">' + T('ui.roomEmpty') + '</div>';
        return;
      }
      var u = me();
      var isOwner = st.owner_id === (u && u.id);
      /* [RDC] الروندا تشترط اكتمال المقاعد (2 في 1ضد1 أو 4 في 2ضد2) قبل البدء */
      var rdFull = !(st.game_id === 'rd') || (st.seats && st.seats.players >= st.max_players);
      /* [BL] البلوت يشترط 4 لاعبين كاملين (2 ضد 2) */
      var blFull = st.game_id !== 'bl' || st.players.filter(function (p) { return !p.spectate; }).length >= 4;
      var allReady = rdFull && blFull && st.players.length >= 2 && st.players.every(function (p) { return p.ready; });
      var link = location.origin + '/?room=' + st.code;

      var rows = st.players.map(function (p) {
        var crown = p.id === st.owner_id ? ' 👑' : '';
        var rd = p.ready ? '✅' : '⏳';
        var you = p.id === (u && u.id) ? ' (' + T('ui.roomYou') + ')' : '';
        var mode = p.spectate ? ' 👁️' : '';
        var botTag = p.isBot ? ' 🤖' : '';
        /* [MP-AI] زر حذف البوت (للمضيف فقط) */
        var rmBot = (isOwner && p.isBot && st.status === 'waiting')
          ? '<button class="rchat-pm" onclick="Rooms.removeBot(\'' + p.id + '\')" title="إزالة الآلي" aria-label="إزالة الآلي">✖</button>'
          : '';
        /* زر مراسلة فردية لكل لاعب (عدا نفسي) */
        var pm = p.id !== (u && u.id)
          ? '<button class="rchat-pm" onclick="Rooms.setRecipient(' + p.id + ',\'' + esc(p.username).replace(/'/g, "\\'") + '\')" title="مراسلة ' + esc(p.username) + '" aria-label="مراسلة فردية">💬</button>'
          : '';
        return '<div class="cmsg" style="margin-bottom:6px;align-items:flex-start">' +
          '<div class="cav" style="background:var(--accent)">' + esc(p.username.slice(-1)) + '</div>' +
          '<div style="flex:1"><div class="cname">' + esc(p.username) + crown + you + mode + botTag + '</div>' +
          '<div class="ctext2">' + rd + (p.isBot ? ' ' + T('ui.roomBot') : (p.spectate ? ' ' + T('ui.roomSpectator') : (p.ready ? ' ' + T('ui.roomReady') : ' ' + T('ui.roomNotReady')))) + '</div></div>' +
          pm + rmBot +
        '</div>';
      }).join('');

      var myReady = st.players.some(function (p) { return p.id === (u && u.id) && p.ready; });
      var mySpect = st.players.some(function (p) { return p.id === (u && u.id) && p.spectate; });
      var btns = '';
      if (st.status === 'waiting') {
        if (!mySpect) {
          btns += '<button class="btn half" onclick="Rooms.setReady(' + !myReady + ')">' +
            (myReady ? T('ui.roomNotReady') : T('ui.roomReady')) + '</button>';
        }
        /* الضيف: يلعب أو يكتفي بالفرجة (صاحب الغرفة هو الموزع دائماً) */
        if (!isOwner) {
          btns += '<button class="btn half" onclick="Rooms.toggleSpectate()">' +
            (mySpect ? '🎮 ' + T('ui.roomPlay') : '👁️ ' + T('ui.roomSpectate')) + '</button>';
        }
        if (isOwner) {
          /* [Policy 2026-09-16] بلا زر «أضف آلياً» — الغرف حصرية للاعبين البشر */
          btns += '<button class="btn half gold" onclick="Rooms.startGame()" ' +
            (allReady ? '' : 'disabled') + '>' + T('ui.roomStart') + '</button>';
          /* [RDC] تنبيه: الروندا تحتاج مقاعد كاملة للبدء */
          if (st.game_id === 'rd' && !rdFull) {
            btns += '<div class="ctext2" style="width:100%;text-align:center;color:#ffc98a;font-size:.74rem">' +
              (T('rdc.room.badSeats') || 'تحتاج الروندا مقاعد كاملة — أضف لاعبين أو آليين') + '</div>';
          }
          /* [BL] تنبيه: البلوت تحتاج 4 لاعبين كاملين */
          if (st.game_id === 'bl' && !blFull) {
            btns += '<div class="ctext2" style="width:100%;text-align:center;color:#ffc98a;font-size:.74rem">' +
              (T('blt.room.needFour') || 'تحتاج البلوت 4 لاعبين كاملين (2 ضد 2)') + '</div>';
          }
        }
      } else {
        btns += '<div class="ctext" style="padding:8px 0;text-align:center">▶ ' + T('ui.roomPlaying') + '</div>';
        /* [RoomFlow] عودة سريعة لطاولة اللعب */
        btns += '<button class="btn half gold" onclick="Rooms.closeModal(); if (typeof openGame === \'function\' && Rooms.state) openGame(Rooms.state.game_id);">🎮 ' + (T('ui.roomBackToGame') || 'العودة للعبة') + '</button>';
        /* [RoomFlow] متفرج أثناء اللعب: طلب مقعد — يُرقّى تلقائياً حين يفرغ */
        if (mySpect) {
          btns += Rooms.myJoinPending()
            ? '<div class="ctext2" style="padding:6px 0;text-align:center">⏳ ' + (T('ui.roomSeatPending') || 'في انتظار مقعد شاغر…') + '</div>'
            : '<button class="btn half" onclick="Rooms.requestJoin()">🎮 ' + (T('ui.roomRequestSeat') || 'اطلب مقعداً للعب') + '</button>';
        }
      }
      btns += '<button class="btn ghost full" onclick="Rooms.leaveRoom()">' + T('ui.roomLeave') + '</button>';

      /* الحفاظ على نص الإدخال أثناء إعادة الرسم (تحديثات room:update) */
      var prevInput = '';
      var prevInp = document.getElementById('roomChatInput');
      if (prevInp) prevInput = prevInp.value;

      body.innerHTML =
        '<div class="ctitle" style="text-align:center">🛡️ ' + T('ui.roomTitle') + '</div>' +
        '<div style="text-align:center;font-size:2.2rem;font-weight:800;letter-spacing:6px;color:var(--gold,#F5C518);padding:8px 0" dir="ltr">' + esc(st.code) + '</div>' +
        '<div style="text-align:center;margin-bottom:10px">' +
          '<button class="btn ghost small" onclick="Rooms.copyCode()" style="margin-left:6px">📋 ' + T('ui.roomCopy') + '</button>' +
          '<button class="btn ghost small" onclick="Rooms.copyLink()">🔗 ' + T('ui.roomInviteLink') + '</button>' +
        '</div>' +
        /* ── نوع الغرفة + الرهان (يُقتطع عند بدء الجولة) ── */
        '<div style="text-align:center;margin-bottom:8px">' +
          '<div class="ctext2">' + T('rm.bet') + ': ' + fmt(st.bet || 0) + '</div>' +
          /* [B-rooms] العدّاد التنازلي لغرف الساعة (يُحدَّث من Rooms._renderCountdown) */
          (st.room_type === 'hour' && st.expires_at ? '<div class="ctext2" id="roomCountdown"></div>' : '') +
          '<div class="ctext2" style="color:var(--t3);font-size:0.78rem">' + T('rm.betDeducted') + '</div>' +
        '</div>' +
        '<div class="ctext" style="padding:4px 0">' + T('ui.roomPlayers') + ' (' + st.players.length + '/' + st.max_players + ')</div>' +
        '<div style="max-height:150px;overflow-y:auto;margin-bottom:10px;padding-inline-end:8px;scroll-padding-inline-end:8px">' + rows + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' + btns + '</div>' +
        /* ── محادثة الغرفة (جماعية + فردية) ── */
        '<div class="rchat">' +
          '<div class="rchat-head">💬 ' + T('ui.roomChatTitle') + '</div>' +
          '<div class="rchat-recipient" id="roomChatRecipient"></div>' +
          '<div class="rchat-msgs" id="roomChatMsgs"></div>' +
          '<div class="rchat-send">' +
            '<input class="cin" id="roomChatInput" maxlength="300" placeholder="' + T('ui.roomChatPlaceholder') + '"' +
            ' onkeydown="if(event.key===\'Enter\') Rooms.sendChat()" aria-label="الرسالة">' +
            '<button class="btn small gold" onclick="Rooms.sendChat()" aria-label="إرسال">➤ ' + T('ui.roomChatSend') + '</button>' +
          '</div>' +
        '</div>';

      var newInp = document.getElementById('roomChatInput');
      if (newInp) newInp.value = prevInput;
      Rooms.renderChat();
      Rooms._renderCountdown();
    },

    /* [B-rooms] تحديث نص العدّاد التنازلي (#roomCountdown) — يُستدعى من render ومن المؤقّت */
    _renderCountdown: function () {
      var el = document.getElementById('roomCountdown');
      if (!el) return;
      var st = Rooms.state;
      if (!st || st.room_type !== 'hour' || !st.expires_at) { el.textContent = ''; return; }
      var left = Math.floor((Number(st.expires_at) - Date.now()) / 1000);
      if (left > 0) {
        var m = Math.floor(left / 60), s = left % 60;
        el.textContent = T('rm.endsIn') + ' ' + m + ':' + (s < 10 ? '0' : '') + s;
      } else if (st.status === 'playing') {
        el.textContent = T('rm.expiredPlaying');
      } else {
        el.textContent = T('rm.expired');
      }
    },

    /* [B-settle] تسوية نهاية الجولة: تحديث الأرصدة + إشعارات فوز/خسارة/استرجاع،
       وإن حُلّت الغرفة (انتهاء ساعة/طرد) نغلقها ونخرج من صفحة اللعبة.
       d = { winner, loser, refunds, pot, fee, dissolved } */
    _onSettle: function (d) {
      if (!d) return;
      var u = me();
      var uid = u && u.id;
      /* [RDC-team] تسوية فرق 2ضد2: winners/losers مصفوفتان — كل عضو يأخذ حصته */
      if (d.teamSplit && Array.isArray(d.winners)) {
        var myWin = null, myLose = null, totalWon = 0;
        for (var w = 0; w < d.winners.length; w++) {
          var wn = d.winners[w];
          if (!wn) continue;
          totalWon += (wn.share || 0);
          if (wn.id != null && wn.id == uid) { myWin = wn; AUTH.user.gold = wn.gold; ST.gold = wn.gold; }
        }
        for (var l = 0; l < (d.losers || []).length; l++) {
          var ls = d.losers[l];
          if (ls && ls.id != null && ls.id == uid) myLose = ls;
        }
        wallet();
        if (myWin) {
          toast(T('rm.winRound') + ' (+' + fmt(myWin.share || 0) + ' 🪙)', 'ok');
          try { if (typeof recordRound === 'function') recordRound(true, myWin.share || 0, T('rm.winRound'), d.pot || 0, Rooms.state && Rooms.state.game_id); } catch (e) {}
        } else if (myLose) {
          toast(T('rm.loseRound') + ' (-' + fmt(d.pot || 0) + ' 🪙)', 'err');
          try { if (typeof recordRound === 'function') recordRound(false, 0, T('rm.loseRound'), d.pot || 0, Rooms.state && Rooms.state.game_id); } catch (e) {}
        }
        save();
        if (d.dissolved) {
          toast(T('rm.roomEnded'), 'info');
          Rooms.reset();
          Rooms.closeModal();
          if (typeof closeGamePage === 'function' && window._currentGameId) closeGamePage();
        }
        return;
      }
      var isWinner = !!(d.winner && d.winner.id != null && d.winner.id == uid);
      var isLoser = !!(d.loser && d.loser.id != null && d.loser.id == uid);
      var isRefund = !!(d.refunds && d.refunds.some && d.refunds.some(function (r) { return r && r.id != null && r.id == uid; }));
      if (isWinner) {
        if (typeof d.winner.gold === 'number') { AUTH.user.gold = d.winner.gold; ST.gold = d.winner.gold; }
        wallet();
        toast(T('rm.winRound') + ' (+' + fmt(Math.max(0, (d.pot || 0) - (d.fee || 0))) + ' 🪙)', 'ok');
        /* [Tickets] تسجيل الجولة فوزاً في سجل رهانات الجولات */
        try { if (typeof recordRound === 'function') recordRound(true, Math.max(0, d.payout || 0), T('rm.winRound'), d.pot || 0, Rooms.state && Rooms.state.game_id); } catch (e) {}
      } else if (isLoser) {
        if (typeof d.loser.gold === 'number') { AUTH.user.gold = d.loser.gold; ST.gold = d.loser.gold; }
        wallet();
        toast(T('rm.loseRound') + ' (-' + fmt(Math.max(0, d.pot || 0)) + ' 🪙)', 'err');
        /* [Tickets] تسجيل الجولة خسارةً في سجل رهانات الجولات */
        try { if (typeof recordRound === 'function') recordRound(false, 0, T('rm.loseRound'), d.pot || 0, Rooms.state && Rooms.state.game_id); } catch (e) {}
      } else if (isRefund) {
        var mine = d.refunds.filter(function (r) { return r && r.id != null && r.id == uid; })[0];
        if (mine && typeof mine.gold === 'number') { AUTH.user.gold = mine.gold; ST.gold = mine.gold; wallet(); }
        toast(T('rm.drawRefund'), 'ok');
      }
      save();
      if (d.dissolved) {
        toast(T('rm.roomEnded'), 'info');
        Rooms.reset();
        Rooms.closeModal();
        if (typeof closeGamePage === 'function' && window._currentGameId) closeGamePage();
      }
    },

    /* [B-settle] إعلان نتيجة الجولة من اللعبة (المضيف فقط) — تُستدعى من لعبة ضاما */
    roomSettle: function (result) {
      if (!Rooms.state) return;
      var u = me();
      if (!u || Rooms.state.owner_id !== u.id) return;
      API.post('/api/rooms/settleRound', { room_id: Rooms.state.id, result: result }).then(function (r) {
        if (!r.ok) toast((r.data && r.data.message) || T('ui.roomError'), 'err');
      });
    },
    /* [RDC-team] تسوية روندا 2ضد2: تقسيم أرباح الرهان بين الفريق الفائز (خادمياً).
       result: 't0' = فاز فريق المقاعد 0,2 | 't1' = فاز فريق المقاعد 1,3 */
    settleTeam: function (result) {
      if (!Rooms.state) return;
      var u = me();
      if (!u || Rooms.state.owner_id !== u.id) return;
      API.post('/api/rooms/settleTeamRound', { room_id: Rooms.state.id, result: result }).then(function (r) {
        if (!r.ok) toast((r.data && r.data.message) || T('ui.roomError'), 'err');
      });
    },

    /* رسم منطقة المحادثة فقط (بلا إعادة بناء بقية المودال) */
    renderChat: function () {
      var box = document.getElementById('roomChatMsgs');
      var rec = document.getElementById('roomChatRecipient');
      if (!box) return;
      var u = me();
      /* شريط المستلم */
      if (rec) {
        if (_recipient) {
          rec.innerHTML = '<span>' + T('ui.roomChatTo') + ' <b>' + esc(_recipient.name) + '</b> 🔒</span>' +
            '<button class="rchat-clear" onclick="Rooms.setRecipient(null)" aria-label="إلغاء">✕</button>';
        } else {
          rec.innerHTML = '<span>👥 ' + T('ui.roomChatAll') + '</span>';
        }
      }
      /* الرسائل المرئية لي: الجماعية + الفردية التي أنا طرف فيها */
      var mineId = u ? u.id : null;
      var html = '';
      var empty = true;
      _messages.forEach(function (m) {
        var isMine = m.from_id === mineId;
        var involved = m.to_id == null || m.to_id === mineId || isMine;
        if (!involved) return;
        empty = false;
        var who = isMine ? T('ui.roomChatYou') : esc(m.from_name);
        var cls = isMine ? 'mine' : (m.to_id != null ? 'pm' : '');
        var tag = m.to_id != null
          ? '<span class="rchat-tag">🔒</span> ' + esc(m.from_name) + (isMine ? '' : ' → ' + esc(m.to_name || ''))
          : esc(m.from_name);
        html += '<div class="rchat-msg ' + cls + '">' +
          '<span class="rchat-name">' + tag + '</span>' +
          '<span class="rchat-text">' + esc(m.text) + '</span>' +
        '</div>';
      });
      box.innerHTML = empty
        ? '<div class="rchat-empty">' + T('ui.roomChatEmpty') + '</div>'
        : html;
      box.scrollTop = box.scrollHeight;
    },

    copyCode: function () {
      if (!Rooms.state) return;
      var code = Rooms.state.code;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () { toast(T('ui.roomCopied'), 'ok'); },
          function () { window.prompt(T('ui.roomCopy'), code); });
      } else {
        window.prompt(T('ui.roomCopy'), code);
      }
    },
    copyLink: function () {
      if (!Rooms.state) return;
      var link = location.origin + '/?room=' + Rooms.state.code;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () { toast(T('ui.roomCopied'), 'ok'); },
          function () { window.prompt(T('ui.roomInviteLink'), link); });
      } else {
        window.prompt(T('ui.roomInviteLink'), link);
      }
    },

    /* انضمام تلقائي من الرابط ?room=CODE (مع دعم الدخول التلقائي بعد المصادقة) */
    tryAutoJoin: function () {
      var m = /[?&]room=([A-Za-z0-9]+)/.exec(location.search);
      if (!m) return;
      var code = m[1].toUpperCase();
      if (!AUTH || !AUTH.user) {
        try { sessionStorage.setItem('rc_pending_room', code); } catch (e) {}
        toast(T('ui.chatLogin') || 'يرجى تسجيل الدخول للانضمام للغرفة', 'warn');
        if (typeof openAuthModal === 'function') openAuthModal();
        return;
      }
      Rooms.joinRoom(code);
    },
    checkPendingRoom: function () {
      try {
        var code = sessionStorage.getItem('rc_pending_room');
        if (code && AUTH && AUTH.user) {
          sessionStorage.removeItem('rc_pending_room');
          setTimeout(function () {
            Rooms.joinRoom(code);
          }, 300);
          return;
        }
        /* [Persist] استئناف غرفة جارية بعد تجديد الصفحة/انقطاع النت:
           العضوية محفوظة محلياً؛ /join يعيد اللاعب المسجل حتى أثناء اللعب،
           وDO يرسل room:replay عند اتصال WS فيُعاد بناء الجولة كما كانت. */
        if (!Rooms.state && AUTH && AUTH.user) {
          var raw = localStorage.getItem('rc_active_room');
          if (raw) {
            var ar = JSON.parse(raw);
            if (ar && ar.code && (Date.now() - (ar.ts || 0)) < 6 * 60 * 60 * 1000) {
              setTimeout(function () { Rooms.joinRoom(ar.code); }, 600);
            } else {
              localStorage.removeItem('rc_active_room');
            }
          }
        }
      } catch (e) {}
    },

    reset: function () {
      _gameHandler = null;
      _startHandler = null;
      Rooms.state = null;
      Rooms._persistRoom(null);   /* [Persist] */
      _messages = [];
      _recipient = null;
      /* [B-rooms] إزالة مؤقّت العدّاد التنازلي عند مغادرة الغرفة */
      if (Rooms._cdTi) { clearInterval(Rooms._cdTi); Rooms._cdTi = null; }
      /* [Req7] إزالة ودجت الرموز/الرسائل عند مغادرة الغرفة */
      var btn = document.getElementById('roomReactBtn');
      var panel = document.getElementById('roomReactPanel');
      if (btn) btn.parentNode && btn.parentNode.removeChild(btn);
      if (panel) panel.parentNode && panel.parentNode.removeChild(panel);
    }
  };

  window.Rooms = Rooms;
})();
