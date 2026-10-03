/* ═══════════════════════════════════════════════════════════════════════════
   [v2.81] مراقبة حالة بث MediaMTX — MediaMTX Status Monitoring
   ───────────────────────────────────────────────────────────────────────────
   الغرض (توجيه المالك 2026-10-03 — مستند «ربط MediaMTX API بالباكأند»):
   يعرف الباكأند لحظة استعلامه هل اللاعب يبث فعلاً عبر المرحّل أم انقطع
   بثّه — لحسم التحكيم على أساس حقيقي لا افتراضات.

   القيود الثلاثة الصارمة من المستند (مُنفَّذة حرفياً):
     1. صفر باندويث عبر النفق: الاستعلام عبر الشبكة المحلية (Loopback)
        حصراً — ‎MEDIAMTX_API_URL افتراضه http://127.0.0.1:9997 ولا يمرّ
        بأي نفق خارجي أبداً. (حارس لطيف: تحذير تمريري إن ضُبط عنوان غير محلي).
     2. استعلام عند الطلب حصراً: لا حلقات تكرار ولا مؤقّتات خلفية إطلاقاً —
        يُستعلم MediaMTX فقط عند نداء نقطة النهاية (أدمن فتح لوحة المباراة)
        مع كاش ثانوي قصير (1.5ث) يمتصّ تكرار الاستطلاع من عدة لوحات.
     3. عزل تام وتراجع آمن: توقف MediaMTX ⇒ حالة stream_offline فورية
        بلا أي أثر على الخادم أو قاعدة البيانات + تحذير مقتضب مُهدَّد
        (مرة كل دقيقة كحد أقصى — لا إغراق للسجل).

   نقاط النهاية:
     GET /api/matches/:roomId/stream-status — أدمن/سوبر حصراً (يُركَّب في
     server.js): يفحص بثّي اللاعبين محلياً ويعيد JSON خفيفاً بالشكل الذي
     طلبه المستند (player_a_status / player_b_status / arbitration_ready).

   منطق المسارات: المحطة توثق نمطين (كلاهما يُفحص):
     • dtsg/<roomId>/<userId>   — التسمية المعتمدة في mediamtx.yml
     • dtsg-<roomId>-<userId>   — مسار WHIP الفعلي الصادر من arb-client.js
     أول مسار جاهز (ready:true) هو الحكم على حالة اللاعب.

   تنبيه الانقطاع (>30ث — المستند §ج): يُتتبَّع بالذاكرة لكل (غرفة×لاعب):
     • بثّ حي ⇒ تُصفَّر حالة المراقبة (وإذا سبق تنبيه ⇒ حدث «recovered»).
     • انقطاع لمن سبق له البث ⇒ يُثبَّت offlineSince؛ تجاوز مهلة المراقبة
       (MEDIAMTX_WATCH_TIMEOUT_MS، افتراضه 30ث) ⇒ تنبيه واحد لكل نوبة:
       صف في SQLite (arb_stream_events) + حدث SSE «arb:stream» للأدمن.
     • لا يُمسّ أي رصيد مهما حصل — القرار النهائي للأدمن حصراً (المستند:
       «دون تعديل الرصيد تلقائياً لحين اتخاذ الأدمن للقرار النهائي»).
     • الاستعلام على الطلب يعني أن العدّاد يتقدم مع كل استعلام لوحة —
       لوحة مفتوحة (استطلاع 10ث) تكشف الانقطاع فور تجاوز المهلة، ولوحة
       مغلقة لا تستهلك شيئاً إطلاقاً.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');

function createMediaMtxMonitor(ctx) {
  /* ctx: { db, roomHub, users, sseClients, arb } */
  const { db, roomHub, users, sseClients, arb } = ctx;

  /* ── الإعداد (بيئة الخادم — .env.local) ── */
  const API_URL = String(process.env.MEDIAMTX_API_URL || 'http://127.0.0.1:9997').replace(/\/+$/, '');
  const TIMEOUT_MS = Number(process.env.MEDIAMTX_PROBE_TIMEOUT_MS || 700);
  const CACHE_TTL_MS = 1500;                      /* كاش ثانوي يمتص تكرار اللوحات */
  const WATCH_TIMEOUT_MS = Number(process.env.MEDIAMTX_WATCH_TIMEOUT_MS || 30000);
  const LOG_THROTTLE_MS = 60000;                  /* تحذير السجل مهدَّد */

  try {
    const u = new URL(API_URL);
    /* القيد 1 من المستند: المحلية حصراً — عنوان خارجي = انحراف عن العقد.
       تحذير لا منع: الوحدة تعمل بأي حال (عزل تام) لكن المالك يعرف. */
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && u.hostname !== '[::1]' && u.hostname !== '::1') {
      console.warn('[mediamtx] ⚠ MEDIAMTX_API_URL ليس عنواناً محلياً (' + API_URL + ') — عقد المستند يوجّه الاستعلام عبر Loopback حصراً حفاظاً على باندويث النفق');
    }
  } catch (e) {
    console.warn('[mediamtx] ⚠ MEDIAMTX_API_URL غير صالح (' + API_URL + ') — ستُعاد حالة offline حتى يُصحَّح');
  }

  /* ── المخطط (SQLite — نفس قاعدة المنصة، بلا هجرة يدوية) ──
     أحداث الانقطاع/العودة للتدقيق فقط — لا مال ولا قرار آلي هنا. */
  try {
    db.exec('CREATE TABLE IF NOT EXISTS arb_stream_events (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      'room_id TEXT NOT NULL,' +
      'user_id INTEGER,' +
      'username TEXT,' +
      'kind TEXT NOT NULL,' +            /* offline | recovered */
      'bytes_rx INTEGER DEFAULT 0,' +
      'created_at INTEGER' +
      ');');
    db.exec('CREATE INDEX IF NOT EXISTS idx_arb_stream_room ON arb_stream_events (room_id);');
  } catch (e) { /* قائمة أصلاً */ }

  /* ── الحالة الحية (كلها في الذاكرة — لا مؤقّتات خلفية) ── */
  const cache = new Map();   /* path -> { at, val }  كاش الاستعلام الثانوي */
  const watch = new Map();   /* "<room>:<uid>" -> { offlineSince, alerted, wasOnline } */
  let lastWarnAt = 0;
  let lastReachable = null;  /* آخر معرفة: هل MediaMTX API مجيب أصلاً؟ */

  /* ── العميل: HTTP محلي خفيف (keep-alive، بلا مكتبات جديدة) ── */
  const agent = new http.Agent({ keepAlive: true, maxSockets: 4, keepAliveMsecs: 15000 });

  function fetchPath(name, cb) {
    try {
      const req = http.get(API_URL + '/v3/paths/get/' + encodeURIComponent(name),
        { agent: agent, timeout: TIMEOUT_MS }, function (res) {
          let chunks = '', overflow = false;
          res.on('data', function (c) { if (chunks.length < 262144) chunks += c; else overflow = true; });
          res.on('end', function () {
            if (overflow) return cb(null, res.statusCode, null);
            let body = null;
            try { body = chunks ? JSON.parse(chunks) : null; } catch (e) { body = null; }
            cb(null, res.statusCode, body);
          });
        });
      req.on('timeout', function () { try { req.destroy(new Error('timeout')); } catch (e) {} });
      req.on('error', function (e) { cb(e); });
    } catch (e) { cb(e); }
  }

  /* ── استعلام مسار واحد (مع الكاش الثانوي) ──
     النتيجة: { online, ready, bytes_rx, duration, path, reachable } */
  function probePath(name, cb) {
    const hit = cache.get(name);
    const now = Date.now();
    if (hit && (now - hit.at) < CACHE_TTL_MS) { cb(null, hit.val); return; }
    fetchPath(name, function (err, status, body) {
      let val;
      if (err) {
        /* القيد 3: MediaMTX غير مجيب ⇒ offline فوري + تحذير مهدَّد */
        if (now - lastWarnAt > LOG_THROTTLE_MS) {
          lastWarnAt = now;
          console.warn('[mediamtx] تعذر الوصول إلى API المرحّل (' + API_URL + '): ' + (err && err.message ? err.message : err));
        }
        val = { online: false, ready: false, bytes_rx: 0, duration: 0, path: name, reachable: false, reason: 'unreachable' };
      } else if (status === 200 && body) {
        const ready = body.ready === true;
        val = {
          online: ready,
          ready: ready,
          bytes_rx: Math.max(0, Number(body.bytesReceived) || 0),
          duration: Math.max(0, Number(body.readyDuration) || 0),
          path: name,
          reachable: true
        };
      } else {
        /* 404 (المسار غير منشور بعد) أو أي جواب آخر: API حيّ لكن لا بثّ */
        val = { online: false, ready: false, bytes_rx: 0, duration: 0, path: name, reachable: true, reason: status === 404 ? 'missing' : 'http_' + status };
      }
      lastReachable = val.reachable;
      cache.set(name, { at: now, val: val });
      cb(null, val);
    });
  }

  /* ── مسارات اللاعب (النمطان الموثّقان) ── */
  function pathVariants(roomId, userId) {
    return ['dtsg/' + roomId + '/' + userId, 'dtsg-' + roomId + '-' + userId];
  }

  /* حالة لاعب واحد: أول مسار جاهز هو الحكم */
  function playerStatus(roomId, userId, cb) {
    const variants = pathVariants(roomId, userId);
    let i = 0;
    let first = null;
    (function next() {
      if (i >= variants.length) { cb(null, first || { online: false, ready: false, bytes_rx: 0, duration: 0, path: variants[0], reachable: lastReachable !== false, reason: 'missing' }); return; }
      const name = variants[i++];
      probePath(name, function (e, val) {
        if (val && val.online) { cb(null, val); return; }
        if (!first || (!first.reachable && val.reachable)) first = val;
        next();
      });
    })();
  }

  /* ── منطق المراقبة (المستند §ج): تنبيه واحد لكل نوبة انقطاع ── */
  function logEvent(roomId, p, kind, bytesRx) {
    try {
      db.prepare('INSERT INTO arb_stream_events (room_id, user_id, username, kind, bytes_rx, created_at) VALUES (?,?,?,?,?,?)')
        .run(String(roomId), p.userId == null ? null : Number(p.userId), p.username || null, kind, Math.max(0, Number(bytesRx) || 0), Date.now());
    } catch (e) {}
  }
  function alertAdmins(roomId, p, kind, bytesRx) {
    try {
      const payload = { room_id: String(roomId), user_id: p.userId == null ? null : Number(p.userId), username: p.username || null, kind: kind, bytes_rx: Math.max(0, Number(bytesRx) || 0), online: kind === 'recovered', at: Date.now() };
      (sseClients || []).forEach(function (c) {
        try {
          const cu = c.userId != null ? users[c.userId] : null;
          if (cu && (cu.role === 'admin' || cu.role === 'super')) {
            c.res.write('event: arb:stream\ndata: ' + JSON.stringify(payload) + '\n\n');
          }
        } catch (e) {}
      });
    } catch (e) {}
  }
  function evaluateWatch(roomId, p, st, sessionLive) {
    const key = roomId + ':' + p.userId;
    const w = watch.get(key) || { offlineSince: null, alerted: false, wasOnline: false };
    if (st.online) {
      if (w.alerted) { logEvent(roomId, p, 'recovered', st.bytes_rx); alertAdmins(roomId, p, 'recovered', st.bytes_rx); }
      watch.set(key, { offlineSince: null, alerted: false, wasOnline: true });
      st.alert = false;
      return st;
    }
    /* غير متصل: عدّاد الانقطاع يبدأ فقط لمن سبق له البث أثناء جلسة حية
       (انقطاع فعلي لا «لم يبدأ بعد») */
    if (w.wasOnline && sessionLive) {
      if (w.offlineSince == null) { w.offlineSince = Date.now(); watch.set(key, w); }
      const offFor = Date.now() - w.offlineSince;
      if (offFor >= WATCH_TIMEOUT_MS && !w.alerted) {
        w.alerted = true;
        watch.set(key, w);
        logEvent(roomId, p, 'offline', 0);
        alertAdmins(roomId, p, 'offline', 0);
      }
    }
    st.offline_since = (w.wasOnline && w.offlineSince != null) ? w.offlineSince : null;
    st.alert = w.alerted;
    return st;
  }

  /* ── الشكل العام للاعب كما طلبه المستند (حقول خفيفة حصراً) ── */
  function publicPlayer(p, st) {
    return {
      user_id: p.userId,
      username: p.username,
      online: !!st.online,
      ready: !!st.ready,
      bytes_rx: st.bytes_rx || 0,
      stream_duration: st.duration || 0,
      path: st.path || null,
      offline_since: st.offline_since || null,
      alert: !!st.alert
    };
  }

  /* ══════════ الواجهة (يستدعيها server.js) ══════════ */

  /* GET /api/matches/:roomId/stream-status — أدمن/سوبر حصراً (المستند §ب) */
  function streamStatus(me, roomId) {
    if (!me) return { status: 401, body: { ok: false, message: 'يلزم تسجيل الدخول' } };
    if (!(me.role === 'admin' || me.role === 'super')) return { status: 403, body: { ok: false, message: 'مراقبة البث للأدمن حصراً' } };
    const room = roomHub.findById(String(roomId));
    if (!room) return { status: 404, body: { ok: false, message: 'الغرفة غير موجودة' } };

    const order = roomHub.io.serializeRoom(room).order || [];
    const players = order.map(function (pid) {
      const u = users[pid];
      return u ? { userId: u.id, username: u.username } : null;
    }).filter(Boolean);

    const sessionLive = !!(arb && arb._live && arb._live.get(String(room.id)) && arb._live.get(String(room.id)).status === 'live');

    return new Promise(function (resolve) {
      /* «اللاعب A» و«اللاعب B» من ترتيب مقاعد الخادم (أول مقعدين) */
      const A = players[0] || null, B = players[1] || null;
      let done = 0;
      const stA = A ? { online: false, ready: false, bytes_rx: 0, duration: 0 } : null;
      const stB = B ? { online: false, ready: false, bytes_rx: 0, duration: 0 } : null;
      function finish() {
        if (done < 2) return;
        const pA = A ? publicPlayer(A, evaluateWatch(room.id, A, stA, sessionLive)) : null;
        const pB = B ? publicPlayer(B, evaluateWatch(room.id, B, stB, sessionLive)) : null;
        resolve({
          status: 200,
          body: {
            ok: true,
            match_id: String(room.id),
            available: lastReachable !== false,
            watch_timeout_ms: WATCH_TIMEOUT_MS,
            session_live: sessionLive,
            player_a_status: pA,
            player_b_status: pB,
            /* جاهزية التحكيم: الطرفان يبثّان معاً (دلالة المستند: false عندما يغيب أحد الطرفين) */
            arbitration_ready: !!(pA && pB && pA.online && pB.online)
          }
        });
      }
      if (A) playerStatus(room.id, A.userId, function (e, st) { if (st) Object.assign(stA, st); done++; finish(); });
      else done++;
      if (B) playerStatus(room.id, B.userId, function (e, st) { if (st) Object.assign(stB, st); done++; finish(); });
      else done++;
      finish();
    });
  }

  /* ═══ فحوص داخلية للاختبارات (لا يستهلكها الإنتاج) ═══ */
  return {
    streamStatus: streamStatus,
    _probePath: probePath,
    _pathVariants: pathVariants,
    _watch: watch,
    _setNow: null,
    _apiUrl: API_URL,
    _watchTimeoutMs: WATCH_TIMEOUT_MS
  };
}

module.exports = { createMediaMtxMonitor: createMediaMtxMonitor };
