/* ═══════════════════════════════════════════════════════════════════════════
   [v2.81] اختبار مراقبة حالة بث MediaMTX + سير عمل بناء APK
   ───────────────────────────────────────────────────────────────────────────
   يغطي (بلا متصفح — خادمي وساكن):
     أ) الوحدة server-mediamtx.js بمرحّل وهمي محلي (Node http):
        1. مسار جاهز (ready:true) ⇒ online + bytes_rx + stream_duration
        2. مسار مفقود (404) ⇒ offline دون انهيار
        3. نمطا المسارين معاً: dtsg/<room>/<uid> و dtsg-<room>-<uid> (WHIP)
        4. تعطّل MediaMTX ⇒ available:false + offline بلا أي أثر خادمي
        5. مهلة المراقبة 30ث ⇒ تنبيه واحد (صف arb_stream_events + SSE للأدمن)
           والتكرار لا يُنذر ثانية (تنبيه واحد لكل نوبة)
        6. العودة بعد التنبيه ⇒ حدث recovered بصفه
        7. من لم ينشر قط لا يُنذر (انقطاع = لمن سبق له البث حصراً)
        8. الحراسة: 401 بلا جلسة · 403 للاعب · 404 غرفة مجهولة
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
  const PATHS = {
    'dtsg/r1/1': { ready: true, bytesReceived: 5242880, readyDuration: 95 },
    'dtsg/r1/2': null,                    /* نمط yml مفقود للاعب B */
    'dtsg-r1-2': { ready: true, bytesReceived: 1048576, readyDuration: 61 },
    'dtsg-r1-1': null,
    'dtsg/r2/2': { ready: true, bytesReceived: 2048, readyDuration: 3 },   /* B يبث */
    'dtsg-r2/2': null, 'dtsg/r2/1': null, 'dtsg-r2-1': null, 'dtsg-r2-2': null,
    'dtsg/r3/1': { ready: true, bytesReceived: 4096, readyDuration: 30 },  /* A عاد */
    'dtsg/r3/2': { ready: true, bytesReceived: 1024, readyDuration: 12 },
    'dtsg/r5/1': null, 'dtsg-r5-1': null, 'dtsg/r5/2': null, 'dtsg-r5-2': null
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
  const { createMediaMtxMonitor } = require('../server-mediamtx.js');
  const room = (id) => ({ id: id, status: 'playing', bet: 10, code: 'C' + id, players: [{ id: '1' }, { id: '2' }] });
  const roomHub = {
    findById: (id) => (['r1', 'r2', 'r3', 'r4', 'r5'].indexOf(String(id)) !== -1) ? room(String(id)) : null,
    io: { serializeRoom: () => ({ order: ['1', '2'] }) }
  };
  const users = { '1': { id: 1, username: 'playerA', role: 'user' }, '2': { id: 2, username: 'playerB', role: 'user' }, '9': { id: 9, username: 'adm', role: 'super' } };
  const sse = [{ userId: 9, res: { writes: [], write(s) { this.writes.push(s); } } }];
  const arbLive = new Map([['r1', { status: 'live' }], ['r2', { status: 'live' }]]);
  const arb = { _live: arbLive, publicSession: function () { return null; } };
  const mtx = createMediaMtxMonitor({ db: db, roomHub: roomHub, users: users, sseClients: sse, arb: arb });
  const ADM = { id: 9, role: 'super', username: 'adm' };
  const sseStreamEvents = () => sse[0].res.writes.filter(w => w.startsWith('event: arb:stream'));
  const rows = (roomId) => db.prepare('SELECT * FROM arb_stream_events WHERE room_id = ? ORDER BY id').all(roomId);

  /* 1+2+3: r1 — A عبر نمط yml (dtsg/r1/1) وB عبر نمط WHIP (dtsg-r1-2) */
  let r = await mtx.streamStatus(ADM, 'r1');
  ok('r1: ok + match_id', r.body.ok === true && r.body.match_id === 'r1');
  ok('r1: A متصل عبر نمط yml + bytes_rx 5242880 + duration 95', r.body.player_a_status.online === true && r.body.player_a_status.bytes_rx === 5242880 && r.body.player_a_status.stream_duration === 95 && r.body.player_a_status.path === 'dtsg/r1/1');
  ok('r1: B متصل عبر نمط WHIP (dtsg-r1-2)', r.body.player_b_status.online === true && r.body.player_b_status.path === 'dtsg-r1-2' && r.body.player_b_status.bytes_rx === 1048576);
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
    ok('REST: غرفة حقيقية بلا مرحّل ⇒ 200 + available=false (fallback نظيف)', rr.status === 200 && rr.json.ok === true && rr.json.available === false);
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

  /* [v2.81·تثبيت لمرة واحدة] المصدر موثّق بـdocs/workflows/ — دفع .github/workflows يتطلب صلاحية workflow لا يملكها توكن النشر */
  const wf = fs.readFileSync(path.join(ROOT, 'docs/workflows/build-apk.yml'), 'utf8');
  ok('workflow: workflow_dispatch + push main/master', /workflow_dispatch/.test(wf) && /branches:\s*\[main, master\]/.test(wf));
  ok('workflow: Node 20 + npm ci + كاش npm', /node-version:\s*'20'/.test(wf) && /npm ci/.test(wf) && /cache:\s*'npm'/.test(wf));
  ok('workflow: Java 17 temurin + كاش gradle', /java-version:\s*'17'/.test(wf) && /distribution:\s*'temurin'/.test(wf) && /cache:\s*'gradle'/.test(wf));
  ok('workflow: mkdir www + cap sync android + chmod gradlew', /mkdir -p www/.test(wf) && /npx cap sync android/.test(wf) && /chmod \+x android\/gradlew/.test(wf));
  ok('workflow: assembleDebug --no-daemon + مسار APK الرسمي', /assembleDebug --no-daemon/.test(wf) && wf.includes('android/app/build/outputs/apk/debug/app-debug.apk'));
  ok('workflow: Artifact DSTG-Gaming-App-Debug لمدة 7 أيام', /DSTG-Gaming-App-Debug/.test(wf) && /retention-days:\s*7/.test(wf));
  ok('workflow: استثناء ملفات التوثيق من المُحفّز', /paths-ignore:/.test(wf) && /'README\.md'/.test(wf));
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

  ok('docs/APK_BUILD.md: دليل التنزيل والتثبيت موجود', fs.existsSync(path.join(ROOT, 'docs/APK_BUILD.md')));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok('الإصدار 2.81.0', pkg.version === '2.81.0');

  /* ═══ الخاتمة ═══ */
  fake.close();
  const total = pass + fail;
  console.log('\n' + (fail === 0 ? '✔ نجح' : '✗ فشل') + ': ' + pass + ' ✓ · ' + fail + ' ✗ (من ' + total + ')');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('💥', e); process.exit(1); });
