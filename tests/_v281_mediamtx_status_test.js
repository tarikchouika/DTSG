/* ═══════════════════════════════════════════════════════════════════════════
   [v2.81] اختبار مراقبة حالة بث MediaMTX + سير عمل بناء APK
   ───────────────────────────────────────────────────────────────────────────
   يغطي (بلا متصفح — خادمي وساكن):
     أ) الوحدة server-mediamtx.js بمرحّل وهمي محلي (Node http):
        1. مسار جاهز (ready:true) ⇒ online + bytes_rx + stream_duration
        2. مسار مفقود (404) ⇒ offline دون انهيار
        3. نمطا المسارين معاً: dtsg/<room>/<uid>_<token> و dtsg-<room>-<uid>_<token> (WHIP)
        4. تعطّل MediaMTX ⇒ available:false + offline بلا أي أثر خادمي
        5. مهلة المراقبة 30ث ⇒ تنبيه واحد (صف arb_stream_events + SSE للأدمن)
           والتكرار لا يُنذر ثانية (تنبيه واحد لكل نوبة)
        6. العودة بعد التنبيه ⇒ حدث recovered بصفه
        7. من لم ينشر قط لا يُنذر (انقطاع = لمن سبق له البث حصراً)
        8. الحراسة: 401 بلا جلسة · 403 للاعب · 404 غرفة مجهولة
     أ·2) تغطية [v2.81·تدقيق] — ثغرات كانت تُبقي الجناح أخضر خطأً:
        9. r3/r4/r5 حيّة في arbLive ⇒ حالة r5 لم تعد باطلة،
           وr6 (انقطاع 120ث لمن سبق له البث لكن بلا جلسة حيّة) ⇒ لا تنبيه:
           التغطية الوحيدة لنصف شرط sessionLive في evaluateWatch
       10. فرع «ناشر متصل ميت» (ready:false مع بايتات) ⇒ offline + الأرقام سليمة
       11. صيغ API الحديثة (online + inboundBytes + readyTime بلا readyDuration)
       12. حارس مال ساكن: server-mediamtx.js بلا UPDATE/INSERT/DELETE على
           users|transactions|rounds|bet_tickets|refunds إطلاقاً
       13. حارس عدّاد: عدد النتائج = عدد مواضع ok() ⇒ لا يسقط تأكيد بصمت
           والإصدار يُشتق من package.json (بلا رقم مكتوب في الجناح)
     أ·3) تغطية [v2.81.1·مصادقة النشر] — انتحال البثّ بمسار بلا رمز:
       14. شكل المسار: dtsg/<room>/<uid>_<16hex> وdtsg-<room>-<uid>_<16hex>
           والرمز واحد في الصيغتين
       15. حتمي: نفس (غرفة×لاعب) ⇒ رمز واحد · ولاعبان في غرفة ⇒ رمزان
       16. غير قابل للاستنتاج من المعرّفات، وتغيير أي معرّف وحده يغيّر الرمز
       17. pathVariants لا تُعيد إلا المسارين المُرمَّزين — لا مسار مجرّد إطلاقاً
       18. انتحال: المسار المجرّد جاهز في المرحّل ⇒ اللاعب يبقى offline
       19. نشر مُرمَّز صحيح للطرفين ⇒ online + arbitration_ready=true
       20. السرّ من ARB_STREAM_SECRET (‎>=16 خانة) وsecretConfigured ينقلب
       21. server-arbitration.js يسلّم المسارين في mine() وstartStream() معاً
       22. mediamtx.yml: كل المستمعين (api/rtmp/rtsp/hls/webrtc) على 127.0.0.1
     ب) REST على خادم QA (fallback حقيقي: لا MediaMTX على 9997):
        - stream-status لأدمن على غرفة حقيقية ⇒ 200 + offline نظيف
     ج) فحوص ساكنة: mediamtx.yml (api:yes + apiAddress) · workflow بمفاتيحه
        · .gitignore · _redirects · prepare-www.sh · server.js مركّب · الدليل
   تشغيل:  QA_BASE=http://127.0.0.1:3971/ node tests/_v281_mediamtx_status_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function ok(l, c) { if (c === undefined || c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } }
const ROOT = path.resolve(__dirname, '..');

(async () => {
  console.log('── أ) الوحدة بمرحّل وهمي محلي');

  /* ═══ مرحّل MediaMTX وهمي على Loopback (منفذ مؤقت) ═══ */
  /* [v2.81.1·مصادقة النشر] الوحدة تلتقط السرّ مرة واحدة عند الاستيراد ⇒ يُضبط
     المتغيّر البيئي قبل require، والمسارات المبذورة تُشتقّ من مُصدَّر الوحدة
     نفسها (لا إعادة تنفيذ لـHMAC هنا — الفحص يختبر المُصدَّر لا نسخة منه). */
  process.env.ARB_STREAM_SECRET = process.env.ARB_STREAM_SECRET || 'v2811-test-arb-stream-secret';
  const MMX = require('../server-mediamtx.js');
  const P = (r, u) => MMX.publishPath(r, u);
  const W = (r, u) => MMX.publishPathWhip(r, u);

  const PATHS = {
    [P('r1', 1)]: { ready: true, bytesReceived: 5242880, readyDuration: 95 },
    'dtsg/r1/2': null,                    /* المسار المجرّد: مبذور بلا نشر — [v2.81.1] الوحدة لا تسأل عنه ولا تثق به */
    [W('r1', 2)]: { ready: true, bytesReceived: 1048576, readyDuration: 61 },
    'dtsg-r1-1': null,
    [P('r2', 2)]: { ready: true, bytesReceived: 2048, readyDuration: 3 },   /* B يبث */
    'dtsg-r2/2': null, 'dtsg/r2/1': null, 'dtsg-r2-1': null, 'dtsg-r2-2': null,
    [P('r3', 1)]: { ready: true, bytesReceived: 4096, readyDuration: 30 },  /* A عاد */
    [P('r3', 2)]: { ready: true, bytesReceived: 1024, readyDuration: 12 },
    'dtsg/r5/1': null, 'dtsg-r5-1': null, 'dtsg/r5/2': null, 'dtsg-r5-2': null,
    /* [v2.81·تدقيق] ناشر متصل ميت: ready:false وبايتات واردة (يجب ألا تُمحى) */
    [P('r7', 1)]: { ready: false, bytesReceived: 999999, readyDuration: 0 },
    /* [v2.81·تدقيق] صيغ المرحّل الحديث: لا ready ولا readyDuration ولا bytesReceived */
    [P('r7', 2)]: { online: true, inboundBytes: 3145728, readyTime: new Date(Date.now() - 42000).toISOString() },
    /* [v2.81.1·مصادقة] r8 = حالة الانتحال: المساران المجرّدان جاهزان تماماً
       (بلا رمز) للطرفين، والمساران المُرمَّزان غائبان عن المرحّل. المراقب
       يطلب المُرمَّز وحده ⇒ 404 ⇒ offline؛ ولو عاد المسار المجرّد إلى قائمة
       الاستعلام لبقي هذا الجناح أخضر على ثغرة انتحال البثّ. */
    'dtsg/r8/1': { ready: true, bytesReceived: 4194304, readyDuration: 77 },
    'dtsg-r8-1': { ready: true, bytesReceived: 4194304, readyDuration: 77 },
    'dtsg/r8/2': { ready: true, bytesReceived: 4194304, readyDuration: 88 },
    'dtsg-r8-2': { ready: true, bytesReceived: 4194304, readyDuration: 88 },
    /* [v2.81.1·مصادقة] r9 = النشر الصحيح: الطرفان على المسارين المُرمَّزين
       (A بنمط RTMP وB بنمط WHIP بصيغته الحديثة) ⇒ تحكيم جاهز. */
    [P('r9', 1)]: { ready: true, bytesReceived: 7340032, readyDuration: 120 },
    [W('r9', 2)]: { online: true, inboundBytes: 2097152, readyTime: new Date(Date.now() - 30000).toISOString() }
  };
  const fake = http.createServer(function (req, res) {
    const name = decodeURIComponent(req.url.replace(/^\/v3\/paths\/get\//, ''));
    if (!(req.url || '').startsWith('/v3/paths/get/')) { res.writeHead(404); res.end('{"error":"not found"}'); return; }
    const p = Object.prototype.hasOwnProperty.call(PATHS, name) ? PATHS[name] : null;
    if (p == null) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'path not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Object.assign({ name: name }, p)));
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  const FAKE_URL = 'http://127.0.0.1:' + fake.address().port;

  /* ═══ قاعدة في الذاكرة + سياق مزيّف ═══ */
  const db = new DatabaseSync(':memory:');
  process.env.MEDIAMTX_API_URL = FAKE_URL;
  delete process.env.MEDIAMTX_WATCH_TIMEOUT_MS;
  const createMediaMtxMonitor = MMX.createMediaMtxMonitor;   /* نفس نسخة الوحدة (كاش Node) — السرّ واحد */
  const room = (id) => ({ id: id, status: 'playing', bet: 10, code: 'C' + id, players: [{ id: '1' }, { id: '2' }] });
  const roomHub = {
    findById: (id) => (['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'].indexOf(String(id)) !== -1) ? room(String(id)) : null,
    io: { serializeRoom: () => ({ order: ['1', '2'] }) }
  };
  const users = { '1': { id: 1, username: 'playerA', role: 'user' }, '2': { id: 2, username: 'playerB', role: 'user' }, '9': { id: 9, username: 'adm', role: 'super' } };
  const sse = [{ userId: 9, res: { writes: [], write(s) { this.writes.push(s); } } }];
  /* [v2.81·تدقيق] r3/r4/r5 حيّة أيضاً: وإلا كانت حالة «لم ينشر قط» باطلة
     (شرط sessionLive غير مفعّل أصلاً). r6 وr7 تُبقيان خارج الخريطة عمداً. */
  const arbLive = new Map([['r1', { status: 'live' }], ['r2', { status: 'live' }], ['r3', { status: 'live' }], ['r4', { status: 'live' }], ['r5', { status: 'live' }]]);
  const arb = { _live: arbLive, publicSession: function () { return null; } };
  const mtx = createMediaMtxMonitor({ db: db, roomHub: roomHub, users: users, sseClients: sse, arb: arb });
  const ADM = { id: 9, role: 'super', username: 'adm' };
  const sseStreamEvents = () => sse[0].res.writes.filter(w => w.startsWith('event: arb:stream'));
  const rows = (roomId) => db.prepare('SELECT * FROM arb_stream_events WHERE room_id = ? ORDER BY id').all(roomId);

  /* 1+2+3: r1 — A عبر المسار المُرمَّز بنمط RTMP وB عبر نمط WHIP [v2.81.1] */
  let r = await mtx.streamStatus(ADM, 'r1');
  ok('r1: ok + match_id', r.body.ok === true && r.body.match_id === 'r1');
  ok('r1: A متصل عبر المسار المُرمَّز (RTMP) + bytes_rx 5242880 + duration 95', r.body.player_a_status.online === true && r.body.player_a_status.bytes_rx === 5242880 && r.body.player_a_status.stream_duration === 95 && r.body.player_a_status.path === P('r1', 1));
  ok('r1: B متصل عبر المسار المُرمَّز (WHIP)', r.body.player_b_status.online === true && r.body.player_b_status.path === W('r1', 2) && r.body.player_b_status.bytes_rx === 1048576);
  ok('r1: arbitration_ready=true (الطرفان يبثّان) + session_live', r.body.arbitration_ready === true && r.body.session_live === true);
  ok('r1: available=true (المرحّل مجيب)', r.body.available === true);

  /* 5: r2 — A انقطع (من سبق له البث) فوق مهلة 30ث ⇒ تنبيه واحد */
  mtx._watch.set('r2:1', { offlineSince: Date.now() - 31000, alerted: false, wasOnline: true });
  r = await mtx.streamStatus(ADM, 'r2');
  ok('r2: A غير متصل وموسوم بالتنبيه + offline_since مثبت', r.body.player_a_status.online === false && r.body.player_a_status.alert === true && r.body.player_a_status.offline_since != null);
  ok('r2: صف offline وحيد في arb_stream_events', rows('r2').length === 1 && rows('r2')[0].kind === 'offline' && rows('r2')[0].user_id === 1);
  ok('r2: حدث SSE arb:stream واحد للأدمن (kind offline)', sseStreamEvents().length === 1 && sseStreamEvents()[0].includes('"kind":"offline"'));
  r = await mtx.streamStatus(ADM, 'r2');
  ok('r2: الاستعلام الثاني لا يكرر التنبيه (تنبيه واحد لكل نوبة)', rows('r2').length === 1 && sseStreamEvents().length === 1);
  ok('r2: arbitration_ready=false (لا تحكيم بطرف منقطع)', r.body.arbitration_ready === false);

  /* 6: r3 — عودة بعد تنبيه سابق ⇒ recovered */
  mtx._watch.set('r3:1', { offlineSince: Date.now() - 5000, alerted: true, wasOnline: true });
  r = await mtx.streamStatus(ADM, 'r3');
  ok('r3: العودة تُصفّر التنبيه وتكتب صف recovered', r.body.player_a_status.online === true && r.body.player_a_status.alert === false && rows('r3').length === 1 && rows('r3')[0].kind === 'recovered');
  ok('r3: حدث SSE recovered وصل الأدمن', sseStreamEvents().some(w => w.includes('"kind":"recovered"')));

  /* 7: r5 — لم ينشر قط: لا تنبيه ولا صفوف */
  r = await mtx.streamStatus(ADM, 'r5');
  ok('r5: من لم يبث قط لا يُنذر ولا صفوف', r.body.player_a_status.alert === false && r.body.player_a_status.offline_since === null && rows('r5').length === 0);

  /* [v2.81·تدقيق] نصف شرط sessionLive: انقطاع 120ث لمن سبق له البث لكن بلا
     جلسة حيّة ⇒ لا تنبيه إطلاقاً (حذف sessionLive من evaluateWatch كان
     سيُبقي الجناح أخضر لولا هذا) */
  mtx._watch.set('r6:1', { offlineSince: Date.now() - 120000, alerted: false, wasOnline: true });
  r = await mtx.streamStatus(ADM, 'r6');
  ok('r6: بلا جلسة حيّة ⇒ لا تنبيه رغم انقطاع 120ث لمن سبق له البث', r.body.session_live === false && r.body.player_a_status.online === false && r.body.player_a_status.alert === false);
  ok('r6: لا صف events ولا SSE (تنبيه الانقطاع للجلسة الحيّة حصراً)', rows('r6').length === 0 && !sseStreamEvents().some(w => w.includes('"room_id":"r6"')));

  /* [v2.81·تدقيق] فرع probePath «ناشر متصل ميت» + صيغ API الحديثة */
  r = await mtx.streamStatus(ADM, 'r7');
  ok('r7: ready:false ⇒ offline مع حفظ البايتات + arbitration_ready=false', r.body.player_a_status.online === false && r.body.player_a_status.ready === false && r.body.player_a_status.bytes_rx === 999999 && r.body.arbitration_ready === false);
  ok('r7: الصيغ الحديثة (online + inboundBytes + readyTime) تُقرأ بلا readyDuration', r.body.player_b_status.online === true && r.body.player_b_status.path === P('r7', 2) && r.body.player_b_status.bytes_rx === 3145728 && r.body.player_b_status.stream_duration >= 41 && r.body.player_b_status.stream_duration <= 60);

  /* 4: r4 — MediaMTX معطّل (منفذ ميت) ⇒ offline نظيف بلا انهيار */
  process.env.MEDIAMTX_API_URL = 'http://127.0.0.1:9399';
  const mtxDead = createMediaMtxMonitor({ db: db, roomHub: roomHub, users: users, sseClients: sse, arb: arb });
  r = await mtxDead.streamStatus(ADM, 'r4');
  ok('r4: تعطّل المرحّل ⇒ available=false + offline + arbitration_ready=false', r.body.available === false && r.body.player_a_status.online === false && r.body.arbitration_ready === false);
  ok('r4: بلا صفوف أحداث (لا تنبيهات على مرحّل ميت لم يبث أحد)', rows('r4').length === 0);

  /* 8: الحراسة */
  r = await mtx.streamStatus(null, 'r1');
  ok('حراسة: بلا جلسة ⇒ 401', r.status === 401);
  r = await mtx.streamStatus({ id: 1, role: 'user' }, 'r1');
  ok('حراسة: لاعب عادي ⇒ 403', r.status === 403);
  r = await mtx.streamStatus(ADM, 'nope');
  ok('حراسة: غرفة مجهولة ⇒ 404', r.status === 404);

  /* مهلة قابلة للضبط من البيئة */
  process.env.MEDIAMTX_WATCH_TIMEOUT_MS = '5000';
  const mtxFast = createMediaMtxMonitor({ db: db, roomHub: roomHub, users: users, sseClients: [], arb: arb });
  ok('المهلة من البيئة (MEDIAMTX_WATCH_TIMEOUT_MS=5000)', mtxFast._watchTimeoutMs === 5000);
  delete process.env.MEDIAMTX_WATCH_TIMEOUT_MS;

  /* ═══════════════════════════════════════════════════════════════════════
     [v2.81.1·مصادقة النشر] حارس انتحال البثّ — ثغرة v2.81 مُغلقة
     ───────────────────────────────────────────────────────────────────────
     الثغرة التي كان هذا الجناح لا يلتقطها: الوحدة تستنتج «هذا اللاعب بعينه
     يبث» من مجرّد جاهزية المسار dtsg/<roomId>/<userId>، والمعرّفان قصيران
     متسلسلان ⇒ من يصل إلى منفذ RTMP كان ينشر في مسار خصمه ويُوهم الأدمن
     بوقفة بثّ لم تحدث. المعيار الآن: لا يُستعلَم عن ولا يُصدَّق إلا مسار
     يحمل رمزاً يَشتقّه الخادم بـHMAC من (الغرفة × اللاعب) وسرّه في البيئة.
     كل ما تحت r8/r9 يبذر المسارات الحقيقية من مُصدَّر الوحدة نفسها — لا
     إعادة تنفيذ لـHMAC في الجناح (وإلا فحصنا نسخةً لا المُصدَّر).
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('── أ·3) مصادقة مسار النشر [v2.81.1]');

  const RTMP_SHAPE = /^dtsg\/[^/]+\/[^/]+_[0-9a-f]{16}$/;
  const WHIP_SHAPE = /^dtsg-[^-_]+-[^-_]+_[0-9a-f]{16}$/;
  const BARE_RTMP = /^dtsg\/[^/_]+\/[^/_]+$/;      /* بلا رمز — ممنوع في الاستعلام [v2.81.1] */
  const BARE_WHIP = /^dtsg-[^-_]+-[^-_]+$/;        /* بلا رمز — ممنوع في الاستعلام [v2.81.1] */
  const tokA = MMX.publishToken('r1', 1);

  ok('publishPath: الشكل dtsg/<room>/<uid>_<16 خانة سداسية', RTMP_SHAPE.test(P('r1', 1)));
  ok('publishPathWhip: الشكل dtsg-<room>-<uid>_<16 خانة سداسية', WHIP_SHAPE.test(W('r1', 1)));
  ok('الصيغتان تحملان الرمز نفسه (نفس السرّ ونفس الزوج غرفة×لاعب)',
    tokA === MMX.publishToken('r1', 1) && P('r1', 1).slice(-16) === tokA && W('r1', 1).slice(-16) === tokA);

  /* الحتمية: لا تخزين ولا مزامنة في المراقب — إعادة الاشتقاق تكفي بعد أي إعادة تشغيل */
  ok('حتمي: نداءان لنفس (الغرفة، اللاعب) ⇒ مسار ورمز متطابقان تماماً',
    P('r1', 1) === P('r1', 1) && W('r1', 1) === W('r1', 1) && MMX.publishToken('r1', 1) === MMX.publishToken('r1', 1));
  ok('لاعبان في غرفة واحدة ⇒ رمزان مختلفان (لا يلتقي بثّ مقعدين)',
    MMX.publishToken('r1', 1) !== MMX.publishToken('r1', 2) && P('r1', 1) !== P('r1', 2));

  /* غير قابل للاستنتاج: المعرّفان قابلان للتخمين، فالرمز لا يجوز أن يكون منهم */
  const idOnly = ['r1', '1', 'r11', '1r1'];
  const derivable = ['r1:1', 'r1-1', 'r1_1', 'r1/1', 'dtsg/r1/1', 'dtsg-r1-1', 'r1u1', 'room_r1_user_1', 'r1-1_1'];
  ok('الرمز لا يُشتقّ من المعرّفات: لا يساويهم ولا يحتويهم ولا يُشتقّ منهم (وكلّه سداسي 16)',
    /^[0-9a-f]{16}$/.test(tokA) && idOnly.indexOf(tokA) === -1
    && derivable.every(function (d) { return tokA !== d && tokA.indexOf(d) === -1 && d.indexOf(tokA) === -1; }));
  ok('تغيير الغرفة وحدها أو اللاعب وحده ⇒ رمز مختلف (الرمز مربوط بالزوج لا بمفرده)',
    MMX.publishToken('r2', 1) !== MMX.publishToken('r1', 1) && MMX.publishToken('r1', 2) !== MMX.publishToken('r1', 1));

  /* ◎ الأهم: قائمة الاستعلام نفسها لا تحوي مساراً مجرّداً — لو عاد لاختفى الحارس */
  const varsR1 = mtx._pathVariants('r1', 1);
  ok('_pathVariants: تُعيد المسارين المُرمَّزين وحدهما بالترتيب (لا ثالث بينهما)',
    Array.isArray(varsR1) && varsR1.length === 2 && varsR1[0] === P('r1', 1) && varsR1[1] === W('r1', 1));
  ok('_pathVariants: لا مسار مجرّد بلا رمز (dtsg/<r>/<u> أو dtsg-<r>-<u>) — حارس انتحال البثّ',
    varsR1.length === 2 && varsR1.every(function (v) { return v.indexOf('_') !== -1; })
    && !varsR1.some(function (v) { return BARE_RTMP.test(v) || BARE_WHIP.test(v); }));

  /* r8: انتحال — المسار المجرّد جاهز تماماً في المرحّل والمُرمَّز غائب ⇒ offline */
  r = await mtx.streamStatus(ADM, 'r8');
  ok('r8 (انتحال): المسار المجرّد dtsg/r8/<uid> جاهز ومع ذلك A يبقى offline بصفر بايتات',
    r.body.player_a_status.online === false && r.body.player_a_status.bytes_rx === 0
    && r.body.player_a_status.path === P('r8', 1) && r.body.player_a_status.ready === false);
  ok('r8 (انتحال): الخصم offline أيضاً + arbitration_ready=false (لا يُحسَم قرار مال على بثّ مزوّر)',
    r.body.player_b_status.online === false && r.body.arbitration_ready === false && r.body.available === true);

  /* r9: النشر المُرمَّز الصحيح للطرفين ⇒ online + تحكيم جاهز */
  r = await mtx.streamStatus(ADM, 'r9');
  ok('r9 (نشر مُرمَّز صحيح): الطرفان online + arbitration_ready=true',
    r.body.player_a_status.online === true && r.body.player_b_status.online === true && r.body.arbitration_ready === true);
  ok('r9: المسار المُبلَّغ للمُحقِّق هو المُرمَّز نفسه (لا مجرّد) والأرقام سليمة',
    r.body.player_a_status.path === P('r9', 1) && r.body.player_b_status.path === W('r9', 2)
    && r.body.player_b_status.bytes_rx === 2097152 && r.body.player_a_status.bytes_rx === 7340032);

  /* السرّ: من البيئة، ويُلتقط مرة واحدة عند الاستيراد ⇒ الفحص بعملية ابنة لكل حالة */
  const { execFileSync } = require('child_process');
  const srcPub = fs.readFileSync(path.join(ROOT, 'server-mediamtx.js'), 'utf8');
  ok('server-mediamtx.js: السرّ من process.env.ARB_STREAM_SECRET مع تحذير صريح عند غيابه',
    /process\.env\.ARB_STREAM_SECRET/.test(srcPub)
    && /ARB_STREAM_SECRET[\s\S]{0,200}console\.warn|console\.warn[\s\S]{0,400}ARB_STREAM_SECRET/.test(srcPub));
  ok('secretConfigured=true في هذا التشغيل (العدّاء ضبط سرّاً >=16 خانة قبل الاستيراد)', MMX.secretConfigured === true);
  const MOD_JS = JSON.stringify(path.join(ROOT, 'server-mediamtx.js'));
  const secOf = function (v) {
    const env = Object.assign({}, process.env);
    if (v === null) { delete env.ARB_STREAM_SECRET; } else { env.ARB_STREAM_SECRET = v; }
    return execFileSync(process.execPath,
      ['-e', 'process.stdout.write(String(require(' + MOD_JS + ').secretConfigured))'],
      { env: env, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  };
  ok('secretConfigured ينقلب مع السرّ: قيمة >=16 خانة ⇒ true', secOf('0123456789abcdef0123') === 'true');
  ok('secretConfigured ينقلب مع السرّ: قيمة أقصر من 16 ⇒ false (لا تُسلَّم مسارات)',
    secOf('short-secret') === 'false');
  ok('secretConfigured ينقلب مع السرّ: غياب المتغيّر ⇒ false (سرّ عابر ينتهي بإعادة التشغيل)',
    secOf(null) === 'false');

  /* ═══ ب) REST على خادم QA — fallback حقيقي (لا MediaMTX على 9997) ═══ */
  console.log('── ب) REST على خادم QA');
  const SB = require('./_safe_base.js');
  const BASE = SB.BASE;
  async function req(method, p, body, cookie) {
    const res = await fetch(BASE + p, {
      method: method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    const sc = res.headers.get('set-cookie');
    return { status: res.status, json: await res.json().catch(() => null), cookie: sc ? sc.split(';')[0] : cookie };
  }
  const ts = Date.now() % 1000000;
  /* الخادم المعزول يبذر super/QaTest12345 في الذاكرة عند الإقلاع (DM_SEED_SUPER_PW) */
  const admL = await req('POST', '/api/login', { username: 'super', password: 'QaTest12345' });
  ok('REST: دخول الأدمن التجريبي (super المبذور)', admL.status === 200 && !!admL.cookie);
  const plL = await req('POST', '/api/login', { username: 'mtxu' + ts, password: 'pw123456' }).then(async (x) => (x.status === 200) ? x : await req('POST', '/api/register', { username: 'mtxu' + ts, password: 'pw123456' }).then(() => req('POST', '/api/login', { username: 'mtxu' + ts, password: 'pw123456' })));
  ok('REST: لاعب اختبار جاهز', plL.status === 200 && !!plL.cookie);

  let rr = await req('GET', '/api/matches/999/stream-status');
  ok('REST: stream-status بلا جلسة ⇒ 401', rr.status === 401);
  rr = await req('GET', '/api/matches/999/stream-status', null, plL.cookie);
  ok('REST: stream-status بلاعب عادي ⇒ 403', rr.status === 403);
  rr = await req('GET', '/api/matches/999/stream-status', null, admL.cookie);
  ok('REST: أدمن + غرفة مجهولة ⇒ 404 (الوحدة مركّبة — 404 وليس 401 مسار)', rr.status === 404);

  const cr = await req('POST', '/api/rooms', { game_id: 'ch', max_players: 2, bet: 5 }, plL.cookie);
  ok('REST: غرفة شطرنج اختبار أُنشئت', cr.status === 200 && !!(cr.json && cr.json.room && cr.json.room.id));
  if (cr.json && cr.json.room) {
    rr = await req('GET', '/api/matches/' + cr.json.room.id + '/stream-status', null, admL.cookie);
    /* [v2.81.1] لم يعد صحيحاً تثبيت available=false هنا: المرحّل مثبَّت الآن على
       خادم الهاتف ومُدار بـpm2، فـ127.0.0.1:9997 يردّ فعلاً ⇒ available=true.
       الاختبار كان يربط نتيجةً صحيحة بغيابٍ مفترض من البيئة (وهو ما جعله
       أحمر لحظة تشغيل المرحّل). المعنى المقصود — «fallback نظيف» — هو أن
       النقطة تردّ 200 بجسم صحيح وتبقى اللاعبون offline مهما كانت حالة المرحّل. */
    ok('REST: غرفة حقيقية ⇒ 200 نظيف مع وجود players (لا اعتماد على حالة المرحّل)',
       rr.status === 200 && rr.json.ok === true && typeof rr.json.available === 'boolean' && !!rr.json.player_a_status);
    ok('REST: اللاعب A offline وB غير موجود (غرفة فرد) وarbitration_ready=false', rr.json.player_a_status.online === false && rr.json.player_b_status === null && rr.json.arbitration_ready === false);
    ok('REST: حقول المستند حاضرة (match_id + player_a_status + player_b_status)', rr.json.match_id === String(cr.json.room.id) && 'bytes_rx' in rr.json.player_a_status && 'online' in rr.json.player_a_status && (rr.json.player_b_status === null || 'online' in rr.json.player_b_status));
  }

  /* mine يحمل بيانات المرحّل لواجهة الهاتف */
  const mn = await req('GET', '/api/matches/mine', null, plL.cookie);
  ok('REST: /api/matches/mine يحمل relay {rtmp,whip} (null بلا إعداد — شكل سليم)', mn.status === 200 && !!mn.json.ok && mn.json.relay && 'rtmp' in mn.json.relay && 'whip' in mn.json.relay);

  /* ═══ ج) فحوص ساكنة ═══ */
  console.log('── ج) فحوص ساكنة');
  const yml = fs.readFileSync(path.join(ROOT, 'mediamtx.yml'), 'utf8');
  ok('mediamtx.yml: api: yes مفعّل', /^api:\s*yes/m.test(yml));
  ok('mediamtx.yml: apiAddress محشور في Loopback حصراً', /^apiAddress:\s*127\.0\.0\.1:9997/m.test(yml));
  /* [v2.81.1·مصادقة] المصادقة بالرمز لا تحلّ محلّ حصر المستمعين: من يصل إلى منفذ
     RTMP بلا رمز يستطيع نشر ما يشاء داخل /^dtsg/، فالحماية طبقتان متكاملتان:
     سرّ في المسار، وعزل المنافذ. كل سطر عنوان في mediamtx.yml يجب أن يحمل
     127.0.0.1. */
  const addrLines = yml.split('\n').filter(function (l) { return /^\s*(apiAddress|rtmpAddress|rtspAddress|hlsAddress|webrtcAddress)\s*:/.test(l); });
  ok('mediamtx.yml: كل المستمعين الخمسة (api/rtmp/rtsp/hls/webrtc) على 127.0.0.1 — لا شيء مكشوف على شبكة الهاتف',
    addrLines.length === 5 && addrLines.every(function (l) { return /:\s*127\.0\.0\.1:\d+\s*$/.test(l.trim()); }));

  /* [v2.81·تثبيت لمرة واحدة] المصدر موثّق بـdocs/workflows/ — دفع .github/workflows يتطلب صلاحية workflow لا يملكها توكن النشر */
  const wf = fs.readFileSync(path.join(ROOT, 'docs/workflows/build-apk.yml'), 'utf8');
  ok('workflow: workflow_dispatch + push main/master', /workflow_dispatch/.test(wf) && /branches:\s*\[main, master\]/.test(wf));
  ok('workflow: Node 22 + npm ci + كاش npm', /node-version:\s*'22'/.test(wf) && /npm ci/.test(wf) && /cache:\s*'npm'/.test(wf));
  ok('workflow: Java 17 temurin + كاش gradle', /java-version:\s*'17'/.test(wf) && /distribution:\s*'temurin'/.test(wf) && /cache:\s*'gradle'/.test(wf));
  ok('workflow: mkdir www + cap sync android + chmod gradlew', /mkdir -p www/.test(wf) && /npx cap sync android/.test(wf) && /chmod \+x android\/gradlew/.test(wf));
  ok('workflow: assembleDebug --no-daemon + مسار APK الرسمي', /assembleDebug --no-daemon/.test(wf) && wf.includes('android/app/build/outputs/apk/debug/app-debug.apk'));
  ok('workflow: Artifact DSTG-Gaming-App-Debug لمدة 7 أيام', /DSTG-Gaming-App-Debug/.test(wf) && /retention-days:\s*7/.test(wf));
  ok('workflow: استثناء ملفات التوثيق من المُحفّز', /paths-ignore:/.test(wf) && /'\*\*\/\*\.md'/.test(wf));
  ok('workflow: صلاحية قراءة فقط (لا كتابة في المستودع)', /permissions:\s*\n\s*contents:\s*read/.test(wf));

  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  ok('.gitignore: www/ + android/ + capacitor.config.json + *.apk', /^www\/$/m.test(gi) && /^android\/$/m.test(gi) && /capacitor\.config\.json/.test(gi) && /^\*\.apk$/m.test(gi));

  const rd = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8');
  ok('_redirects: حجب server-mediamtx.js و .github/*', /^\/server-mediamtx\.js\s+\/404\.html\s+404/m.test(rd) && /^\/\.github\/\*\s+\/404\.html\s+404/m.test(rd));

  const pw = fs.readFileSync(path.join(ROOT, 'scripts/prepare-www.sh'), 'utf8');
  ok('prepare-www.sh: نفس قائمة نشر Pages (js css assets + مجلدات الألعاب الخمسة)', /cp -r js css assets ronda-game backgammon-game dominoes-game uno-game baloot-game/.test(pw));
  ok('prepare-www.sh: تقليم الاختبارات والوثائق + حذف db', /rm -rf "\$OUT"\/ronda-game\/tests/.test(pw) && /name "\*\.db\*"/.test(pw));

  const sv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  ok('server.js: الوحدة مركّبة + المسار قبل كتلة arbMatch', /createMediaMtxMonitor/.test(sv) && /stream-status\$/.test(sv));
  ok('server-arbitration.js: startStream يعرض mediamtx_rtmp + mine يحمل relay', /MEDIAMTX_RTMP_URL/.test(fs.readFileSync(path.join(ROOT, 'server-arbitration.js'), 'utf8')));

  /* [v2.81.1·مصادقة] الخادم يسلّم المسار المُرمَّز في المخرجين معاً: مُدخل واجهة
     الهاتف (mine — للحارس حين لا جلسة تحكيم بعد) ومُدخل فتح البثّ (startStream).
     لو سقط أحدهما لبقيت واجهة الهاتف بلا مسار صالح ⇒ لا بثّ ولا تحكيم. */
  const arbSrc = fs.readFileSync(path.join(ROOT, 'server-arbitration.js'), 'utf8');
  const iMineFn = arbSrc.indexOf('mine: function');
  const iStartFn = arbSrc.indexOf('startStream: function');
  const arbMine = arbSrc.slice(iMineFn, iStartFn);
  const arbStart = arbSrc.slice(iStartFn).split('\n    },\n')[0];
  const PUBPATH = /require\('\.\/server-mediamtx\.js'\)\.publishPath\(/;
  const PUBWHIP = /require\('\.\/server-mediamtx\.js'\)\.publishPathWhip\(/;
  ok('server-arbitration.js: mine() يسلّم relay.publish_path + publish_path_whip (للاعب الجالس في غرفته)',
    iMineFn > 0 && iStartFn > iMineFn && /publish_path:/.test(arbMine) && /publish_path_whip:/.test(arbMine)
    && PUBPATH.test(arbMine) && PUBWHIP.test(arbMine));
  ok('server-arbitration.js: startStream() يسلّم mediamtx_publish_path + _whip (المشارك الجالس حصراً)',
    iStartFn > 0 && /mediamtx_publish_path:/.test(arbStart) && /mediamtx_publish_path_whip:/.test(arbStart)
    && PUBPATH.test(arbStart) && PUBWHIP.test(arbStart));

  ok('docs/APK_BUILD.md: دليل التنزيل والتثبيت موجود', fs.existsSync(path.join(ROOT, 'docs/APK_BUILD.md')));

  /* [v2.81·تدقيق] حارس المال ساكناً: الوحدة أدمن وتدقّق فقط — لا تمسّ جداول المنصة */
  const mtxSrc = fs.readFileSync(path.join(ROOT, 'server-mediamtx.js'), 'utf8');
  ok('server-mediamtx.js: صفر كتابة مال (بلا UPDATE users · INSERT INTO users|transactions|rounds|bet_tickets|refunds · DELETE FROM users|transactions|rounds)',
    !/\bUPDATE\s+users\b/i.test(mtxSrc)
    && !/\bINSERT\s+INTO\s+(users|transactions|rounds|bet_tickets|refunds)\b/i.test(mtxSrc)
    && !/\bDELETE\s+FROM\s+(users|transactions|rounds)\b/i.test(mtxSrc));

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const SELF = fs.readFileSync(__filename, 'utf8');
  const TAG = 'v' + pkg.version;   /* [v2.81·تدقيق] مشتق من package.json: لا رقم مكتوب يُحمر مع كل رفع */
  ok('الإصدار يُشتق من package.json ويوافق وسم الجناح (' + TAG + ')', (SELF.match(/\[(v[\d.]+)/) || [])[1] === TAG.replace(/\.\d+$/, ''));

  /* ═══ الخاتمة ═══ */
  fake.close();
  /* [v2.81·تدقيق] حارس العدّاد: لا يُسقط تأكيد بصمت (النتيجة = عدد المواضع).
     النمط يشترط ok في أول السطر حتى لا يحتسب ذكره في تعليق أو داخل نمط. */
  const sites = (SELF.match(/^[ \t]*ok\s*\(/gm) || []).length;
  ok('حارس العدّاد: عدد النتائج = عدد مواضع ok() في الجناح (' + sites + ')', pass + fail + 1 === sites);
  const total = pass + fail;
  console.log('\n' + (fail === 0 ? '✔ نجح' : '✗ فشل') + ': ' + pass + ' ✓ · ' + fail + ' ✗ (من ' + total + ')');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('💥', e); process.exit(1); });
