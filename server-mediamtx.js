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
const crypto = require('crypto');

/* ═══════════════════════════════════════════════════════════════════════════
   [v2.81.1·مصادقة النشر] سرّ المسار — يُغلق ثغرة انتحال البثّ
   ───────────────────────────────────────────────────────────────────────────
   الخلل الذي عالجته: كتلة المسارات في mediamtx.yml تقبل أي ناشر بلا مصادقة،
   والباكأند كان يستنتج «هذا اللاعب بعينه يبث» من مجرّد أن مسار
   dtsg/<roomId>/<userId> جاهز — ومعرّفا الغرفة واللاعب قصيران متسلسلان
   ⇒ يستطيع أي من يصل إلى منفذ RTMP أن ينشر في مسار خصمه ويُوهم الأدمن.

   الحل: المفتاح داخل المسار نفسه، مشتقّاً بـHMAC من سرّ الخادم ⇒ لا يُ guessing
   ولا استنتاج، ولا يحتاج إذناً من خادم خارجي:
     · مسار RTMP : dtsg/<roomId>/<userId>_<token>
     · مسار WHIP : dtsg-<roomId>-<userId>_<token>
   والسرّ (ARB_STREAM_SECRET) في بيئة الخادم فقط، والرمز يُسلَّم للاعب الجالس
   في غرفته حصراً (نفس نطاق التوزيع القائم على /api/matches/mine و
   startStream) ⇒ لا يخرج عن كونه «مفتاحاً خاصاً بالاعب»، لكنه الآن غير قابل
   للتخمين. والوسم نفسه (برمجي) هو ما يتحقّق منه المراقب.

   الثبات حتمي بحكم التصميم: نفس (غرفة × لاعب) ⇒ نفس الرمز، فلا يحتاج
   المراقب تخزيناً ولا مزامنة، ويعمل بعد إعادة تشغيل الخادم ما دام السرّ ثابتاً.
   ═══════════════════════════════════════════════════════════════════════════ */
const STREAM_SECRET = String(process.env.ARB_STREAM_SECRET || '').trim();
if (!STREAM_SECRET) {
  console.warn('[mediamtx] ⚠ ARB_STREAM_SECRET غير مضبوط في البيئة — سيُولَّد سرّ عشوائي لهذا التشغيل فقط، فتنتهي صلاحية كل مسارات النشر عند إعادة التشغيل. اضبطه في .env.local (scripts/phone-env-restart.sh).');
}
const RUNTIME_SECRET = STREAM_SECRET || crypto.randomBytes(32).toString('hex');

/* ═══════════════════════════════════════════════════════════════════════
   [v2.81.4·رمز المشاهدة] توقيع روابط HLS للأدمن بلا كوكيز ولا CORS
   ───────────────────────────────────────────────────────────────────────
   لماذا؟ مشغّل الأدمن (hls.js) يجلب قوائم التشغيل بمقاطع fetch عادية لا
   تستطيع حمل ترويسة توثيق المنصة (والكوكيز عبر النطاقات المتقاطعة
   مجهدة ومكسورة). البديل الاحترافي: رمز مشاهدة HMAC بوقت انتهاء —
   يُسكب خادمياً في stream-status (أدمن حصراً) ويُتحقق منه عند كل
   طلب مقطع. لا حالة ولا تخزين: exp داخل الرمز نفسه.
   الصيغة:  <exp-ms>.<16hex HMAC(secret, "view|<room>|<uid>|<exp-ms>")
   انتهاء افتراضي 15د (MEDIAMTX_VIEW_TTL_MS) — لوحة الأدمن تستطلع كل 10ث
   فتأخذ رمزاً جديداً باستمرار، وانقطاعها يُوقف السحب طبيعياً. */
/* [v2.96·رمز مستقر] «رمز جديد باستمرار» في التعليق أعلاه كان هو العطب
   نفسه: exp يُزرع من Date.now() فيختلف الرمز مع كل استطلاع (كل 10ث)،
   فترى الواجهة hls_path متغيراً وتهدم مشغّل الأدمن السليم وتعيد بناءه من
   الصفر كل عشر ثوانٍ — اتصال متدبدب وشاشات سوداء أثناء كل إعادة تهيئة
   وأخطاء قاتلة «تعذر عرض بث المرحّل» (بلاغ المالك 2026-10-10 والفيديو
   الشاهد: الغرفة 3BAD1D بث اللاعب «عبر الموزع» مباشر والخطأ ظاهر معه).
   العلاج الجذري: الرمز يُشتق مرة ويُعاد نفسه ما بقي له أكثر من ربع مدته
   (استطلاع 10ث ⇒ نفس المسار دقائق متواصلة فلا يُهدم المشغل إلا لسبب
   حقيقي)، ويُجدَّد برمز كامل المدة قبل انتهائه — فيتيح للعميل الانتقال
   السلس (loadSource خفيف بلا تمزيق الفيديو) قرب الانتهاء. تنقية الخامل
   عند 512 مفتاحاً — لا نمو بلا سقف. وverifyViewToken لم يتغير قيد أنملة
   (رمز واحد صالح يحيا كعهدِه). */
const VIEW_TOKEN_CACHE = new Map();   /* "<room>|<uid>" → { token, exp } */
function signViewToken(roomId, userId, ttlMs) {
  const ttl = Math.max(60000, Number(ttlMs) || 900000);
  const key = String(roomId) + '|' + String(userId);
  const now = Date.now();
  const hit = VIEW_TOKEN_CACHE.get(key);
  if (hit && (hit.exp - now) > (ttl >> 2)) return hit.token;   /* ربع المدة فأكثر: نفس الرمز */
  if (VIEW_TOKEN_CACHE.size > 512) {
    for (const [k, v] of VIEW_TOKEN_CACHE) { if (v.exp <= now) VIEW_TOKEN_CACHE.delete(k); }
  }
  const exp = now + ttl;
  const sig = crypto.createHmac('sha256', RUNTIME_SECRET)
    .update('view|' + String(roomId) + '|' + String(userId) + '|' + exp)
    .digest('hex').slice(0, 16);
  const token = exp + '.' + sig;
  VIEW_TOKEN_CACHE.set(key, { token: token, exp: exp });
  return token;
}
function verifyViewToken(roomId, userId, token) {
  try {
    const s = String(token || '');
    const dot = s.indexOf('.');
    if (dot <= 0) return false;
    const exp = s.slice(0, dot);
    if (!/^\d{10,}$/.test(exp) || Number(exp) <= Date.now()) return false;
    const sig = crypto.createHmac('sha256', RUNTIME_SECRET)
      .update('view|' + String(roomId) + '|' + String(userId) + '|' + exp)
      .digest('hex').slice(0, 16);
    const a = Buffer.from(s.slice(dot + 1));
    const b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

/* [v2.81.4·بروكسي HLS] عنوان HLS الداخلي — Loopback حصراً كنظيره API_URL.
   الأدمن يشاهد بث المرحّل عبر بروكسي قوائم/مقاطع HLS داخل خادم المنصة نفسه
   (واسع الوصول أصلاً) ⇒ لا نفق إضافي ولا فتح أي منفذ خارجاً — متسق مع
   عقد v2.81.1 (كل مستمعي المرحّل على Loopback). */
const HLS_URL = String(process.env.MEDIAMTX_HLS_URL || 'http://127.0.0.1:8888').replace(/\/+$/, '');
try {
  const hu = new URL(HLS_URL);
  if (hu.hostname !== '127.0.0.1' && hu.hostname !== 'localhost' && hu.hostname !== '[::1]' && hu.hostname !== '::1') {
    console.warn('[mediamtx] ⚠ MEDIAMTX_HLS_URL ليس عنواناً محلياً (' + HLS_URL + ') — عقد Loopback يوجّه مشاهدة الأدمن عبر خادم المنصة نفسه');
  }
} catch (e) {
  console.warn('[mediamtx] ⚠ MEDIAMTX_HLS_URL غير صالح (' + HLS_URL + ') — مشاهدة الأدمن عبر المرحّل ستعيد 503 حتى يُصحَّح');
}
const VIEW_TTL_MS = Math.max(60000, Number(process.env.MEDIAMTX_VIEW_TTL_MS) || 900000);

/* ═══════════════════════════════════════════════════════════════════════
   [v2.81.4·إصلاح الميدان] hlsFetch — جلب HLS خلف 302 cookieCheck
   ───────────────────────────────────────────────────────────────────────
   كشفه الفحص الحيّ بالكيرل (2026-10-04): MediaMTX v1.21 يردّ على كل طلب
   HLS أول (قوائم ومقاطع على السواء) بـ«302 Found → نفس العنوان +
   ?cookieCheck=1» + ترويسة Set-Cookie: cookieCheck=1 — آلية تحقق جلسة
   يتبعها المتصفح تلقائياً، بينما http.get الخام يعيدها كما هي فتحوّلها
   بروكسي المنصة إلى 502 («upstream: 302») ويعجز مشغّل الأدمن عن فتح
   البث إطلاقاً. وبعد المتابعة تبيّن طبقة ثانية: على cookieCheck يمنح
   المرحّل «Set-Cookie: hlsSession=…» وعندها **كل** الطلبات اللاحقة
   (قوائم فرعية ومقاطع) يجب أن تحمل هذا الكوكي وإلا ردّ «401» — أي أن
   الجرة لكل طلب لا تكفي؛ الجرة يجب أن تكون مشتركة عبر طلبات البروكسي
   كلها (سلوك المتصفح ذاته مع لوحة أدمن واحدة). الكوكيز لا تخرج من
   الخادم — المتصفح لا يرى كوكيز المرحّل أبداً (عقد v2.81.1 يبقى صحيحاً).
   [v2.93] الجرة صارت واعية بمسار الكوكي (كما في المتصفح تماماً): جلسة
   HLS عند المرحّل مقيدة بالمسار (Path=<مسار البث>/) ومقارنة العنوان
   فيه pathName — الأدمن يشاهد لاعبَين جنباً إلى جنب (مسارَين)، والجرة
   المسطحة القديمة (اسم → قيمة واحدة) كانت تكتب جلسة اللاعب الثاني فوق
   الأولى فترفض الأولى 401 «session not found» — القائمة الفرعية للأدمن
   تتعطل بينما الثانية تعمل. والاستئناف عند 401 صار من القائمة الرئيسية
   للمسار نفسه (index.m3u8): رقص cookieCheck لا ينشئ جلسة إلا عليها —
   إعادة طلب الملف الأصلي مباشرة كانت لا تستأنف شيئاً أبداً. */
const MTX_COOKIE_JAR = Object.create(null);   /* كوكيز المرحّل داخل الخادم حصراً: name → { value, path } */
function jarCookiePath(sc) {
  const pm = /(?:^|;\s*)Path=([^;\s]+)/i.exec(String(sc || ''));
  return pm ? pm[1] : '/';
}
function jarPathMatches(cookiePath, reqPath) {
  const cp = String(cookiePath || '/');
  const rp = String(reqPath || '/').split('?')[0];
  if (cp === '/' ) return true;
  if (rp === cp) return true;
  return rp.indexOf(cp) === 0 && (cp.charAt(cp.length - 1) === '/' || rp.charAt(cp.length) === '/');
}
function hlsFetch(upPath, cb) {
  let hops = 0, settled = false, resynced = false;
  function done(hRes, err) {
    if (settled) { try { if (hRes) hRes.resume(); } catch (e) {} return; }
    settled = true;
    cb(hRes, err);
  }
  function jarHeader(p) {
    const out = [];
    Object.keys(MTX_COOKIE_JAR).forEach(function (k) {
      const c = MTX_COOKIE_JAR[k];
      if (c && jarPathMatches(c.path, p)) out.push(k + '=' + c.value);
    });
    return out.length ? { Cookie: out.join('; ') } : undefined;
  }
  function absorb(hRes) {
    (hRes.headers['set-cookie'] || []).forEach(function (sc) {
      const kv = String(sc).split(';')[0];
      const i = kv.indexOf('=');
      if (i <= 0) return;
      MTX_COOKIE_JAR[kv.slice(0, i).trim()] = { value: kv.slice(i + 1).trim(), path: jarCookiePath(sc) };
    });
  }
  function go(p, isResync) {
    const req = http.get(HLS_URL + p, { timeout: 8000, headers: jarHeader(p) }, function (hRes) {
      absorb(hRes);
      if (hRes.statusCode >= 300 && hRes.statusCode < 400 && hRes.headers.location) {
        hRes.resume();
        if (++hops > 3) return done(null, 'toomanyredirects');
        const loc = String(hRes.headers.location);
        return go(loc.indexOf('://') !== -1 ? loc.replace(/^[a-z]+:\/\/[^\/]+/i, '') : loc, isResync);
      }
      if (hRes.statusCode === 401 && !resynced) {
        /* [v2.93] جلسة المرحّل لهذا المسار انتهت/فقدت ⇒ إسقاط الجلسة المقيدة
           بمساره ثم الاستئناف من القائمة الرئيسية للمسار نفسه (رقص cookieCheck
           لا ينشئ جلسة إلا على index.m3u8 — طلب الملف الأصلي مباشرة لا يجدي)
           ثم إعادة الطلب الأصلي بجلسته الجديدة — مرة واحدة */
        hRes.resume();
        resynced = true;
        delete MTX_COOKIE_JAR.hlsSession;
        hops = 0;
        const clean = String(upPath || '/').split('?')[0];
        const cut = clean.lastIndexOf('/');
        const dir = cut > 0 ? clean.slice(0, cut + 1) : '/';
        return go(dir + 'index.m3u8', true);
      }
      if (isResync) {
        /* القائمة الرئيسية جُلبت لإنشاء الجلسة فقط — استهلاكها ثم إعادة الأصل */
        hRes.resume();
        hops = 0;
        return go(String(upPath || '/'));
      }
      done(hRes, null);
    });
    req.on('timeout', function () { try { req.destroy(); } catch (e) {} done(null, 'timeout'); });
    req.on('error', function () { done(null, 'error'); });
  }
  go(String(upPath || '/'));
}

function publishToken(roomId, userId) {
  return crypto.createHmac('sha256', RUNTIME_SECRET)
    .update(String(roomId) + ':' + String(userId)).digest('hex').slice(0, 16);
}
/* المساران اللذان يثق بهما المراقب — وصورتهما现代化的 بلا رمز */
function publishPath(roomId, userId) {
  return 'dtsg/' + String(roomId) + '/' + String(userId) + '_' + publishToken(roomId, userId);
}
function publishPathWhip(roomId, userId) {
  return 'dtsg-' + String(roomId) + '-' + String(userId) + '_' + publishToken(roomId, userId);
}

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

  /* [v2.81·إصلاح التعليق] الاستدعاء يُحسم مرة واحدة في كل طريق بلا استثناء.
     الخلل المرصود: المرحّل يقبل الاتصال ويرسل الترويسة ثم يقطع المقبس في
     منتصف الجسم ⇒ لا 'end' ولا 'error' على الطلب ⇒ لا يعمل أي نداء راجع:
     probePath لا يعود أبداً ووعد streamStatus يعلق للأبد، ومع
     maxSockets:4 يتجمّد كل استعلام قادم لكل غرفة. الحل: عَلَم settled + تغطية
     مسارات الفشل كلها (res.error · res.aborted · req.timeout · حارس زمني).
     عقد الباندويث سليم: المؤقّت مؤقّت طلب واحد يُصفَّر عند الحسم و.unref
     — لا مؤقّت دوري ولا مؤقّت على مستوى الوحدة يعمل وحده؛ القيد 2 (استعلام
     عند الطلب حصراً) يبقى قائماً بلا حلقة خلفية. */
  function fetchPath(name, cb) {
    let settled = false, guard = null;
    function once() {
      if (settled) return;
      settled = true;
      if (guard) { clearTimeout(guard); guard = null; }
      cb.apply(null, arguments);
    }
    try {
      const req = http.get(API_URL + '/v3/paths/get/' + encodeURIComponent(name),
        { agent: agent, timeout: TIMEOUT_MS }, function (res) {
          let chunks = '', overflow = false;
          res.on('data', function (c) { if (chunks.length < 262144) chunks += c; else overflow = true; });
          /* قطع المقبس في منتصف الجسم: لا end ولا error على الطلب */
          res.on('error', function (e) { once(e); });
          res.on('aborted', function () { once(new Error('aborted')); });
          res.on('end', function () {
            if (overflow) return once(null, res.statusCode, null);
            let body = null;
            try { body = chunks ? JSON.parse(chunks) : null; } catch (e) { body = null; }
            once(null, res.statusCode, body);
          });
        });
      req.on('timeout', function () { try { req.destroy(new Error('timeout')); } catch (e) {} once(new Error('timeout')); });
      req.on('error', function (e) { once(e); });
      /* حارس زمني مطلق (لا جواب إطلاقاً): يهدم الطلب ثم يحسم — يُصفَّر عند الحسم */
      guard = setTimeout(function () {
        try { req.destroy(new Error('probe wall-clock guard')); } catch (e) {}
        once(new Error('probe wall-clock timeout'));
      }, Math.max(1000, TIMEOUT_MS * 3));
      if (guard.unref) guard.unref();
    } catch (e) { once(e); }
  }

  /* مدة البث بالثواني — [v2.81] انزياح حقول API: readyDuration رقمي على
     المرحّل القديم، ونصوص RFC3339 (readyTime ثم onlineTime) على الحديث بعد
     حذف readyDuration. قيمة ناقصة أو تالفة ⇒ 0 (لا NaN يمسّ الواجهة). */
  function pathDurationSec(body) {
    const rd = body.readyDuration;
    if (rd != null && isFinite(Number(rd))) return Number(rd);
    const stamp = body.readyTime || body.onlineTime;
    if (stamp) {
      const t = Date.parse(stamp);
      if (!isNaN(t)) return Math.max(0, (Date.now() - t) / 1000);
    }
    return 0;
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
        /* [v2.81·انزياح الحقول] ready/bytesReceived متروكان على المرحّل الحديث
           (ما زال يُبَثّ) وreadyDuration حُذف ⇒ نقبل الصيغتين معاً: online و
           inboundBytes المعتمدان الآن، والمدة من readyTime/onlineTime. */
        const ready = body.ready === true || body.online === true;
        const bytes = body.inboundBytes != null ? body.inboundBytes : body.bytesReceived;
        val = {
          online: ready,
          ready: ready,
          bytes_rx: Math.max(0, Number(bytes) || 0),
          duration: Math.max(0, pathDurationSec(body) || 0),
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

  /* ── مسارات اللاعب (النمطان الموثّقان — مُرمَّزة) ──
     [v2.81.1] لا يُقبل المسار المجرّد `dtsg/<room>/<uid>` إطلاقاً: لا رمز =
       لا ثقة، فاستدلال «الجاهز ⇒ هذا اللاعب» يفضح انتحال البثّ. */
  function pathVariants(roomId, userId) {
    return [publishPath(roomId, userId), publishPathWhip(roomId, userId)];
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
        /* [v2.81.4] رابط HLS الموقّع لكل لاعب — مشاهدة الأدمن عبر بروكسي
           المنصة (هلوكات 8888 محلية حصراً) بلا كوكيز ولا CORS — راجع
           signViewToken أعلاه؛ انتهاؤه 15د وتجديده آلي مع كل استطلاع */
        if (pA) pA.hls_path = hlsViewPath(room.id, A.userId);
        if (pB) pB.hls_path = hlsViewPath(room.id, B.userId);
        /* [v2.81.4·الجلسة الآلية من طرف الأدمن] بثّ مرحّل حيّ + لا جلسة ⇒
           افتحها فوراً (كانت الجلسة تُفتح فقط إن فتح اللاعب صفحته — فتبقى
           غرفة Larix خفية عن الأدمن حتى لو كان بثّها يصل المرحّل) */
        const onlineIds = [];
        if (pA && pA.online) onlineIds.push(A.userId);
        if (pB && pB.online) onlineIds.push(B.userId);
        let sessLive = sessionLive;
        if (onlineIds.length && !sessionLive && arb && typeof arb.ensureLiveSession === 'function') {
          try { arb.ensureLiveSession(room, onlineIds); sessLive = true; } catch (e) {}
        }
        resolve({
          status: 200,
          body: {
            ok: true,
            match_id: String(room.id),
            available: lastReachable !== false,
            watch_timeout_ms: WATCH_TIMEOUT_MS,
            session_live: sessLive,
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

  /* ═════════════════════════════════════════════════════════════════
     [v2.81.4] مسار مشاهدة HLS الموقّع — يُسكب في stream-status فقط */
  function hlsViewPath(roomId, userId) {
    return '/api/matches/' + encodeURIComponent(String(roomId)) + '/hls/' + encodeURIComponent(String(userId)) + '/index.m3u8?t=' + signViewToken(roomId, userId, VIEW_TTL_MS);
  }

  /* ═══ فحوص داخلية للاختبارات (لا يستهلكها الإنتاج) ═══ */
  return {
    streamStatus: streamStatus,
    /* [v2.81.4] حالة بثّ لاعب واحد عبر المرحّل — تستعملها mine() لبطاقة
       اللاعب الحيّة (متاحة لصاحبها حصراً) وللجلسة الآلية عند وصول البث */
    relayStatusFor: function (roomId, userId) {
      return new Promise(function (resolve) {
        playerStatus(String(roomId), Number(userId), function (e, st) {
          resolve(st ? {
            available: st.reachable !== false,
            online: !!st.online,
            bytes_rx: st.bytes_rx || 0,
            duration: st.duration || 0,
            path: st.path || null,
            reason: st.reason || null
          } : { available: false, online: false, bytes_rx: 0, duration: 0, path: null, reason: 'unreachable' });
        });
      });
    },
    /* [v2.81.4] رابط HLS الموقّع لمشاهدة بث لاعب عبر بروكسي المنصة —
       يُسكب في stream-status (أدمن حصراً) ولا يُبنى في أي مكان آخر */
    hlsViewPath: hlsViewPath,
    _probePath: probePath,
    _pathVariants: pathVariants,
    _watch: watch,
    _setNow: null,
    _apiUrl: API_URL,
    _hlsUrl: HLS_URL,
    _viewTtlMs: VIEW_TTL_MS,
    _watchTimeoutMs: WATCH_TIMEOUT_MS
  };
}

module.exports = {
  createMediaMtxMonitor: createMediaMtxMonitor,
  /* [v2.81.1] يُستخدمان في server-arbitration.js لتسليم مسار النشر المُرمَّز
     للاعب الجالس حصراً. الطرفان يتشاركان نسخة الوحدة نفسها في كاش Node، فيرى
     المراقب والمسار المُسلَّم السر ذاته تماماً — بلا تكرار ولا تخزين. */
  publishPath: publishPath,
  publishPathWhip: publishPathWhip,
  publishToken: publishToken,
  secretConfigured: !!(STREAM_SECRET && STREAM_SECRET.length >= 16),
  /* [v2.81.4] رمز مشاهدة HLS — يستهلكه server.js (بروكسي HLS) والاختبارات */
  signViewToken: signViewToken,
  verifyViewToken: verifyViewToken,
  hlsUrl: HLS_URL,
  viewTtlMs: VIEW_TTL_MS,
  /* [v2.81.4·إصلاح الميدان] جلب HLS خلف 302 cookieCheck — يستهلكه بروكسي server.js */
  hlsFetch: hlsFetch,
  /* [v2.81.4] إعادة كتابة قائمة m3u8 للبروكسي: كل مرجع مقطع/قائمة فرعية
     يصير مساراً عبر بروكسي المنصة بنفس رمز المشاهدة. التعليقات وأسطر #
     تبقى (وتُعالج uri="…" داخل EXT-X-KEY/MAP)، والمراجع المطلقة تُترك.
     دالّة نقية قابلة للاختبار المباشر. */
  rewriteHlsPlaylist: function (body, roomId, userId, token) {
    const s = String(body || '');
    const prox = '/api/matches/' + encodeURIComponent(String(roomId)) + '/hls/' + encodeURIComponent(String(userId)) + '/';
    function mapRef(ref) {
      if (!ref) return ref;
      if (/^(https?:)?\/\//i.test(ref) || ref.charAt(0) === '/') return ref;   /* مطلق — لا يُمسّ */
      const clean = String(ref).split('?')[0];
      if (!/^[A-Za-z0-9_.\-]+$/.test(clean)) return ref;                        /* غير مقطع متوقع — اتركه */
      return prox + clean + '?t=' + token;
    }
    return s.split('\n').map(function (line) {
      const t = line.trim();
      if (!t) return line;
      if (t.charAt(0) === '#') {
        return line.replace(/URI="([^"]+)"/g, function (m, u) { return 'URI="' + mapRef(u) + '"'; });
      }
      return mapRef(t);
    }).join('\n');
  }
};
