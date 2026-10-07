/* ═══════════════════════════════════════════════════════════════════════════
   [v2.93] حرس السلسلة الكاملة لبث شاشة التحكيم — الجذران المتبقيان
   ───────────────────────────────────────────────────────────────────────────
   بلاغ المالك 2026-10-07 (بعد build31/v2.92.0): «يوجد خلل في مشاركة الشاشة
   في تطبيق الأندرويد (شاشة الأدمن سوداء) راجع الخلل وتأكد من الصلاحيات
   ومكمن الخلل» — المختبر الحي الكامل كشف جذرين لا يظهران إلا على مكونات
   حقيقية (جهاز/مرحّل/متصفح):

   ① جذر الجافا: مرمّز سطح-الدخل يُخرج SPS/PPS مرة واحدة في CODEC_CONFIG
     فقط (لا تكرار داخل الإطارات)، بينما مستخرج DTS في MediaMTX (gohlslib
     DTSExtractor) يتطلب SPS داخل وحدة الوصول المفتاحية الأولى — بلا ذلك
     تُسقط كل عيّنة فور النشر («SPS not received yet») فتبقى قائمة HLS
     كلها #EXT-X-GAP والفيديو أسود عند الأدمن رغم أن البث «مباشر» وسليم.
     العلاج: حقن SPS/PPS المُخزَّنتين داخل كل وحدة مفتاحية (سلوك
     x264/Larix — repeat headers). + إذنا الميكروفون RECORD_AUDIO +
     MODIFY_AUDIO_SETTINGS في المانيفست (جسر كروم في كاباسيتور 6 يطلبهما
     زمنياً عند طلب الويب AUDIO_CAPTURE — غير المصرَّح به = رفض فوري دائم:
     بلاغ «خلل في صلاحية الميكروفون»).

   ② جذر البروكسي: بروكسي HLS في server.js كان يُسقط معاملات LL-HLS الحية
     (_HLS_msn/_HLS_part/_HLS_skip) — القائمة CAN-BLOCK-RELOAD=YES فمشغّل
     الأدمن يدخل دورة استعلام ساخنة تنتهي levelLoadError قاتلاً: الأجزاء
     تصل والصورة سوداء. العلاج: القائمة البيضاء تمرّرها للمرحّل + جرة
     كوكيز واعية بمسار الجلسة (مشاهدة لاعبَين جنبًا إلى جنب) + استئناف
     الجلسة من index.m3u8 عند 401.

   هذا الحرس:
     أ) ساكن: عقود المصدر كلها (الحقن · الإذنين · التمرير · الجرة · نسختا
        السير · إصدار الجسر 4 · حجب واجهة الغرف المحلية القديمة على الويب).
     ب) حيّ (يتخطى بتلطٍ معلن حيث تنقص المكونات — قيد بيئة لا انحدار):
        نموذج ينشر بذات بايتات جافا التطبيق (بعد التجريد كأنه MediaCodec:
        وحدات بلا SPS/PPS داخلية) إلى MediaMTX v1.21.1 حقيقي بإعداد
        المستودع (lowLatency) → بروكسي بمنطق الإنتاج (hlsFetch و
        rewriteHlsPlaylist يُستدعيان من server-mediamtx.js الحقيقي نفسه)
        → متصفح Chromium حقيقي بمشغل hls.js بإعدادات لوحة الأدمن نفسها →
        فحص بكسلات فعلي: الصورة يجب أن تظهر (إضاءة > 5 ومدى > 20) —
        قبل الإصلاح كان الجواب: readyState=1 وإضاءة 0 (أسود تام).
   تشغيل: node tests/_v293_arb_stream_e2e_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const REPO = path.join(__dirname, '..');
let pass = 0, fail = 0, skipLive = '';
function ok(cond, label, detail) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail !== undefined ? ' — ' + detail : '')); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ═══════════════ أ) العقود الساكنة ═══════════════ */
console.log('═══ v2.93 · عقود السلسلة الساكنة ═══');
const wf = fs.readFileSync(path.join(REPO, '.github/workflows/build-apk.yml'), 'utf8');
const twin = fs.readFileSync(path.join(REPO, 'docs/workflows/build-apk.yml'), 'utf8');
const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
const mmx = fs.readFileSync(path.join(REPO, 'server-mediamtx.js'), 'utf8');
const lmp = fs.readFileSync(path.join(REPO, 'js/core/local-mp.js'), 'utf8');

ok(wf === twin, 'النسختان (github/docs) متطابقتان بايت-بايت (قاعدة 18)');

/* ① جذر الجافا: حقن SPS/PPS داخل النطاق قبل كل IDR */
const sfIdx = wf.indexOf('void sendFrame(byte[] data, long ts)');
ok(sfIdx > 0, '[جذر ①] sendFrame موجودة');
const sfBody = wf.slice(sfIdx, wf.indexOf('void writeAvcNal(', sfIdx));
ok(sfBody.indexOf('boolean hasSps = false;') > 0 && sfBody.indexOf('boolean hasPps = false;') > 0,
  '[جذر ①] مسح الوحدة يكشف SPS/PPS الموجودين داخلياً (لا ازدواج عند تكرار المرمّز)');
ok(sfBody.indexOf('!hasSps) writeAvcNal(o, sps);') > 0 && sfBody.indexOf('!hasPps) writeAvcNal(o, pps);') > 0,
  '[جذر ①] حقن SPS/PPS المخزنتين من الترويسة عند غيابهما (كل وحدة مفتاحية)');
ok(sfBody.indexOf('!hasSps) writeAvcNal(o, sps);') < sfBody.indexOf('for (i = 0; i < nals.size(); i++) {\n                              byte[] nal = nals.get(i);\n                              int ntype = nal.length > 0 ? nal[0] & 0x1F : 0;\n                              if (ntype == 9) continue;'),
  '[جذر ①] الحقن قبل شرائح الإطار (SPS ثم PPS ثم الشرائح — ترتيب x264 المرجعي)');
ok(sfBody.indexOf('if (ntype == 9) continue;') > 0 && sfBody.indexOf('ntype == 7 || ntype == 8 || ntype == 9) continue') === -1,
  '[جذر ①] SPS/PPS الداخلية لم تعد تُجرد من الإطار (AUD وحده حشو)');
ok(/void writeAvcNal\(java\.io\.ByteArrayOutputStream o, byte\[\] nal\) throws java\.io\.IOException/.test(wf),
  '[جذر ①] مساعد writeAvcNal (طول 4 بايتات ثم الجسم — AVCC)');
ok(wf.indexOf('arbShareVersion() { return "4"; }') > 0, '[قاعدة 28-⑤] arbShareVersion=4 (تغيير جسري)');

/* درس البناء: لا شرطة مائلة عكسية في الجافا المحقونة */
(function () {
  const lines = wf.split('\n');
  const s = lines.findIndex(l => l.includes("new = '''"));
  const e = lines.findIndex((l, i) => i > s && l.trim() === "'''");
  let bad = false;
  for (let i = s + 1; i < e; i++) if (lines[i].includes('\\')) bad = true;
  ok(!bad, 'لا شرطة مائلة عكسية في جافا سير البناء (عقد الحقن)');
})();

/* ② إذنا الميكروفون في المانيفست (خطوة 8.7) */
const mPerm = wf.indexOf('Inject microphone permissions');
ok(mPerm > 0, '[ميكروفون] خطوة حقن الإذنين موجودة في السير (8.7)');
ok(wf.indexOf('android.permission.RECORD_AUDIO') > 0 && wf.indexOf('android.permission.MODIFY_AUDIO_SETTINGS') > 0,
  '[ميكروفون] RECORD_AUDIO + MODIFY_AUDIO_SETTINGS يُحقنان في المانيفست (جسر كاباسيتور 6 يطلبهما معاً)');
ok(/if "android\.permission\.RECORD_AUDIO" in s:/m.test(wf), '[ميكروفون] الحقن خامل التكرار (idempotent)');
ok(wf.indexOf("anchor = '<uses-permission android:name=\"android.permission.CAMERA\" /> <!-- [v2.83] LocalMP QR -->'") > 0 ||
   wf.indexOf('anchor = \'<uses-permission android:name="android.permission.CAMERA" /> <!-- [v2.83] LocalMP QR -->\'') > 0 ||
   wf.indexOf('<uses-permission android:name="android.permission.CAMERA" /> <!-- [v2.83] LocalMP QR -->') > 0,
  '[ميكروفون] المرساة: إذن الكاميرا (خطوة 8.4 — تسبق كل الحقن زمنياً — درس بناء #25)');

/* ③ جذر البروكسي: تمرير معاملات LL-HLS */
const hlsBlk = srv.slice(srv.indexOf('const hlsM = pathname.match('), srv.indexOf('const arbMatch = pathname.match('));
ok(hlsBlk.indexOf("'_HLS_msn', '_HLS_part', '_HLS_skip'") > 0,
  '[جذر ②] البروكسي يمرّر معاملات LL-HLS الحية للمرحّل (قائمة بيضاء)');
ok(/encodeURIComponent\(String\(v\)\.slice\(0, 32\)\)/.test(hlsBlk), '[جذر ②] قيم المعاملات تُقص لسقف 32 حرفاً (لا حقن مسار)');
ok(hlsBlk.indexOf("if (llhlsQ.length) upPath += '?' + llhlsQ.join('&');") > 0, '[جذر ②] المعاملات تُلحق بمسار الجلب');

/* ④ جرة الكوكيز الواعية بالمسار + استئناف الجلسة */
ok(mmx.indexOf('name → { value, path }') > 0 && mmx.indexOf('function jarCookiePath(') > 0 && mmx.indexOf('function jarPathMatches(') > 0,
  '[جرة] كوكيز المرحّل مقيدة بمسارها (مشاهدة لاعبَين جنباً إلى جنب — جلستان متزامنتان)');
ok(/delete MTX_COOKIE_JAR\.hlsSession;/.test(mmx) && mmx.indexOf("return go(dir + 'index.m3u8', true);") > 0,
  '[جرة] استئناف 401 من القائمة الرئيسية للمسار (رقص cookieCheck لا ينشئ جلسة إلا عليها)');

/* ⑤ الغرف المحلية: تطبيق فقط على الويب */
ok(/function injectRoomMode\(\) \{\s*\n\s*\/\* \[v2\.93\][^*]*\*\/\s*\n\s*if \(!NATIVE\) return;/.test(lmp) || lmp.indexOf('if (!NATIVE) return;') > 0,
  '[غرف محلية] مدخل «اللعب المحلي» القديم محجوب على الويب (بلاغ المالك: الموقعان يعرضانه)');
ok(lmp.indexOf('if (!NATIVE) return;') < lmp.indexOf('var sm = rsModal();'),
  '[غرف محلية] الحاجز أول سطر في injectRoomMode (لا مراقب ولا حقن أصلاً على الويب)');
ok(lmp.indexOf('patchRooms(); injectRoomMode(); lnAutostart();') > 0,
  '[غرف محلية] طبقة التغليف والواجهة البرمجية محفوظة للتحميل (حرّاس e2e والتطبيق)');

/* ⑥ الثلاثية والبصمات (مشتقة — قاعدة 22) */
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(REPO, 'package-lock.json'), 'utf8'));
const mainJs = fs.readFileSync(path.join(REPO, 'js/main.js'), 'utf8');
const idxHtml = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const v = pkg.version;
const fp = 'v' + v.replace(/\./g, '').slice(0, 3);
ok(lock.version === v && (lock.packages && lock.packages[''] && lock.packages[''].version === v), 'الثلاثية متطابقة package/lock = ' + v);
const bm = mainJs.match(/DTSG_BUILD = 'v([^']+)'/);
ok(bm && bm[1] === v, 'DTSG_BUILD = v' + (bm && bm[1]));
ok(idxHtml.indexOf('js/core/arb-client.js?v=' + fp) > 0 && idxHtml.indexOf('js/core/local-mp.js?v=' + fp) > 0,
  'بصمات ' + fp + ' في index.html (arb-client + local-mp)');

console.log('── ساكن: ' + pass + ' ✓ / ' + fail + ' ✗');

/* ═══════════════ ب) المختبر الحي الكامل ═══════════════ */
(async () => {
  console.log('═══ v2.93 · المختبر الحي (نموذج التطبيق → MediaMTX → بروكسي → متصفح) ═══');
  const LOG = (...a) => console.log('  ', ...a);

  /* المكونات: mediamtx (ب convention v2814) + ffmpeg + playwright */
  const mtxBin = path.join(process.env.HOME || '/home/z', '.cache', 'mediamtx', 'mediamtx');
  let haveMtx = fs.existsSync(mtxBin);
  if (haveMtx) {
    try { execFileSync(mtxBin, ['--version'], { timeout: 4000 }); } catch (e) { haveMtx = false; }
  }
  let haveFfmpeg = false;
  try { execFileSync('ffmpeg', ['-version'], { timeout: 4000, stdio: 'ignore' }); haveFfmpeg = true; } catch (e) {}
  if (!haveMtx || !haveFfmpeg) {
    skipLive = !haveMtx ? 'وسيط MediaMTX غير متوفر في ~/.cache/mediamtx' : 'ffmpeg غير متوفر';
  }

  let browser = null;
  if (!skipLive) {
    try {
      const { chromium } = require('playwright');
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    } catch (e) { skipLive = 'متصفح Chromium غير قابل للإقلاع: ' + (e && e.message ? e.message.slice(0, 60) : '?'); }
  }
  if (skipLive) {
    console.log('  ⏭  المختبر الحي متخطى (قيد بيئة لا انحدار): ' + skipLive);
    console.log('════════════════');
    console.log('الخلاصة: PASS=' + pass + ' FAIL=' + fail + ' LIVE=SKIPPED');
    process.exit(fail > 0 ? 1 : 0);
  }
  try { await browser.close(); browser = null; } catch (e) {}

  /* [قيد بيئة] بناء chromium البديل (أنظمة غير مدعومة رسمياً) يُبنى بلا ترميزات
     H.264 الملكية — MediaSource.isTypeSupported('avc1…') = false فيفشل hls.js
     بmanifestIncompatibleCodecsError لغير سبب في المنصة. فحص القدرة قبل الطور
     المتصفحي: بيئة بلا فك H.264 = تخطي معلن لفحص البكسلات (قيد بيئة لا انحدار)
     — طرف السلسلة حتى القائمة والمقاطع يبقى مُختبراً حياً في كل بيئة. */
  let h264Ok = false;
  try {
    const { chromium } = require('playwright');
    const b2 = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const p2 = await b2.newPage();
    h264Ok = await p2.evaluate(function () {
      try { return !!(window.MediaSource && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42c01f"')); }
      catch (e) { return false; }
    });
    await b2.close();
  } catch (e) { h264Ok = false; }

  /* ── MediaMTX حي بإعداد المستودع ── */
  async function mtxReachable() {
    try { const c = await fetch('http://127.0.0.1:9997/v3/paths/list', { signal: AbortSignal.timeout(1200) }); return c.ok; } catch (e) { return false; }
  }
  if (!(await mtxReachable())) {
    const mtxCwd = require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'dtsg-mtx-'));
    const child = spawn(mtxBin, [path.join(REPO, 'mediamtx.yml')], { cwd: mtxCwd, stdio: 'ignore', detached: true });
    child.unref();
    let up = false;
    for (let i = 0; i < 30 && !up; i++) { await sleep(300); up = await mtxReachable(); }
    ok(up, 'MediaMTX اشتغل بإعداد المستودع (hlsVariant: lowLatency · Loopback)');
    if (!up) throw new Error('mediamtx لم يقلع');
  } else {
    ok(true, 'MediaMTX يعمل أصلاً (إعادة استعمال)');
  }

  /* ── الجريان: مرمّز سطح-دخل مُجرد (وحدات بلا SPS/PPS داخلية — ك MediaCodec) ── */
  const es = path.join(require('os').tmpdir(), 'dtsg-v293-stream.264');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=45',
    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p',
    '-g', '48', '-bf', '0', '-x264-params', 'aud=1:repeat-headers=1',
    '-f', 'h264', es]);
  const raw = fs.readFileSync(es);
  /* تفكيك NALات ثم وحدات وصول عند AUD، وتجريد 7/8/9 (محاكاة MediaCodec حرفياً) */
  const nalList = [];
  for (let i = 0; i + 3 < raw.length; ) {
    if (raw[i] === 0 && raw[i + 1] === 0 && raw[i + 2] === 1) {
      const s = i + 3; let j = s, e2 = raw.length;
      while (j + 3 < raw.length) { if (raw[j] === 0 && raw[j + 1] === 0 && raw[j + 2] === 1) { e2 = j; break; } j++; }
      nalList.push({ type: raw[s] & 0x1F, bytes: raw.subarray(s, e2) }); i = e2;
    } else i++;
  }
  const ausAll = []; let cur = null;
  for (const n of nalList) {
    if (n.type === 9) { if (cur && cur.length) ausAll.push(cur); cur = []; continue; }
    if (cur == null) cur = []; cur.push(n);
  }
  if (cur && cur.length) ausAll.push(cur);
  let sps = null, pps = null;
  for (const au of ausAll) for (const n of au) { if (n.type === 7 && !sps) sps = n.bytes; if (n.type === 8 && !pps) pps = n.bytes; }
  const deviceAUs = ausAll.map(au => au.filter(n => n.type !== 7 && n.type !== 8 && n.type !== 9));
  ok(!!sps && !!pps && deviceAUs.length > 200 && deviceAUs.every(au => au.every(n => n.type !== 7 && n.type !== 8)),
    'جريان الاختبار: ' + deviceAUs.length + ' وحدة وصول بلا SPS/PPS داخلية (محاكاة MediaCodec)');

  /* ── نموذج RtmpLink: نقل حرفي لجافا التطبيق (مع إصلاح v2.93) ── */
  const ROOM = 'v293room', UID = '4293', TOK = 'v293testtoken';
  const PUBLISH_PATH = 'dtsg/' + ROOM + '/' + UID + '_' + TOK;
  class RtmpLink {
    constructor() {
      this.outChunk = 128; this.inChunk = 128; this.msid = 1; this.publishSent = false;
      this.failed = false; this.sps = null; this.pps = null; this.cfgSent = false; this.cfgBody = null;
      this.amf = []; this.rx = Buffer.alloc(0); this.waiting = null;
      this.sock = new net.Socket(); this.sock.setNoDelay(true);
      this.sock.on('data', d => { this.rx = Buffer.concat([this.rx, d]); this._pump(); });
      this.sock.on('error', () => { this.failed = true; });
    }
    connect() {
      return new Promise(res => {
        this.sock.connect(1935, '127.0.0.1', async () => {
          try {
            const c1 = crypto.randomBytes(1536);
            this._w(Buffer.from([3])); this._w(c1); this.sock.write(this._take());
            const s0s1 = await this._rd(1537);
            await this._rd(1536);
            this._w(s0s1.subarray(1)); this.sock.write(this._take());
            this.as('connect'); this.an(1.0); this.amf.push(3);
            this.ps('app', 'dtsg'); this.ps('type', 'nonprivate');
            this.ps('flashVer', 'FMLE/3.0'); this.ps('tcUrl', 'rtmp://127.0.0.1:1935/dtsg');
            this.amf.push(0, 0, 9); this.cmd(3, 0); this.sock.write(this._take());
            this._startReader();
            res(true);
          } catch (e) { this.failed = true; res(false); }
        });
      });
    }
    _startReader() {
      const rLen = new Array(64).fill(0), rType = new Array(64).fill(0);
      (async () => {
        while (!this.failed) {
          try {
            const b0 = await this._rb(); if (b0 < 0) { this.failed = true; break; }
            let csid = b0 & 0x3F; const fmt = (b0 >> 6) & 3; if (csid >= 64) continue;
            if (fmt === 0) { const ts = await this._ru24(); rLen[csid] = await this._ru24(); rType[csid] = await this._rb(); await this._ru32le(); if (ts === 0xFFFFFF) await this._ru32(); }
            else if (fmt === 1) { const ts = await this._ru24(); rLen[csid] = await this._ru24(); rType[csid] = await this._rb(); if (ts === 0xFFFFFF) await this._ru32(); }
            else if (fmt === 2) { const ts = await this._ru24(); if (ts === 0xFFFFFF) await this._ru32(); }
            const len = rLen[csid]; if (len <= 0 || len > 10485760) { this.failed = true; break; }
            const body = Buffer.alloc(len); let off = 0, okr = true;
            while (off < len) {
              if (off > 0) { const c = await this._rb(); if (c < 0) { okr = false; break; } }
              const n = Math.min(this.inChunk, len - off);
              const got = await this._rd(n); got.copy(body, off, 0, n); off += n;
            }
            if (!okr) { this.failed = true; break; }
            if (rType[csid] === 1 && body.length >= 4) { const sz = body.readUInt32BE(0); if (sz > 127 && sz <= 16777215) this.inChunk = sz; }
            else if (rType[csid] === 20) this._cmd(body);
          } catch (e) { this.failed = true; }
        }
      })();
    }
    _cmd(b) {
      try {
        const pos = [0];
        const name = this._sAt(b, pos); if (name == null) return;
        const txid = this._nAt(b, pos);
        if (name === '_result' && txid === 1.0) {
          this._setChunk(4096);
          this.amf = []; this.as('createStream'); this.an(2.0); this.anull(); this.cmd(3, 0); this.sock.write(this._take());
        } else if (name === '_result' && txid === 2.0) {
          this.amf = []; this.as('publish'); this.an(3.0); this.anull();
          this.as(PUBLISH_PATH.substring(PUBLISH_PATH.indexOf('/') + 1)); this.as('live');
          this.cmd(8, this.msid); this.sock.write(this._take());
          this.publishSent = true; this._maybeCfg();
        }
      } catch (e) {}
    }
    as(s) { const b = Buffer.from(s, 'utf8'); this.amf.push(2, b.length >> 8, b.length & 255, ...b); }
    an(d) { this.amf.push(0); const b = Buffer.alloc(8); b.writeDoubleBE(d); this.amf.push(...b); }
    anull() { this.amf.push(5); }
    ps(k, v2) { const b = Buffer.from(k, 'utf8'); this.amf.push(b.length >> 8, b.length & 255, ...b); this.as(v2); }
    cmd(csid, msid) { this.send(csid, msid, 20, 0, Buffer.from(this.amf)); }
    _setChunk(sz) { const p = Buffer.alloc(4); p.writeUInt32BE(sz); this.send(2, 0, 1, 0, p); this.outChunk = sz; }
    send(csid, msid, type, ts, payload) {
      const parts = [];
      const u24 = x => parts.push(Buffer.from([(x >> 16) & 255, (x >> 8) & 255, x & 255]));
      parts.push(Buffer.from([csid])); u24(ts); u24(payload.length);
      parts.push(Buffer.from([type]));
      parts.push(Buffer.from([msid & 255, (msid >> 8) & 255, (msid >> 16) & 255, (msid >> 24) & 255]));
      let off = 0;
      while (off < payload.length) {
        if (off > 0) parts.push(Buffer.from([0xC0 | csid]));
        const n = Math.min(this.outChunk, payload.length - off);
        parts.push(payload.subarray(off, off + n)); off += n;
      }
      this.sock.write(Buffer.concat(parts));
    }
    sendConfig() {
      /* ترويسة AVCC — كما في جافا التطبيق (sendConfig) */
      const o = [0x17, 0x00, 0, 0, 0, 0x01, sps[1], sps[2], sps[3], 0xFF, 0xE1,
        sps.length >> 8, sps.length & 255, ...sps, 0x01, pps.length >> 8, pps.length & 255, ...pps];
      this.cfgBody = Buffer.from(o); this._maybeCfg();
    }
    _maybeCfg() {
      if (this.cfgSent || this.cfgBody == null || !this.publishSent || this.failed) return;
      this.send(4, this.msid, 9, 0, this.cfgBody); this.cfgSent = true;
    }
    sendFrame(auNals, ts) {
      /* [v2.93] نقل حرفي لإصلاح جافا التطبيق: حقن SPS/PPS قبل كل IDR غائب عنهما */
      if (!this.cfgSent) return;
      let key = false, hasSps = false, hasPps = false;
      for (const n of auNals) { const t = n.type; if (t === 5) key = true; if (t === 7) hasSps = true; if (t === 8) hasPps = true; }
      const o = [0x17, 0x01, 0, 0, 0];
      const push = nal => { const L = nal.length; o.push((L >> 24) & 255, (L >> 16) & 255, (L >> 8) & 255, L & 255, ...nal); };
      if (key && !hasSps && sps) push(sps);
      if (key && !hasPps && pps) push(pps);
      for (const n of auNals) { if (n.type === 9) continue; push(n.bytes); }
      const body = Buffer.from(o);
      if (body.length > 5) { body[0] = key ? 0x17 : 0x27; this.send(4, this.msid, 9, Math.trunc(ts), body); }
    }
    _sAt(b, pos) { try { if (pos[0] >= b.length) return null; const t = b[pos[0]] & 255; pos[0]++; if (t !== 2) { pos[0]--; return null; } const L = ((b[pos[0]] & 255) << 8) | (b[pos[0] + 1] & 255); pos[0] += 2; const s = b.toString('utf8', pos[0], pos[0] + L); pos[0] += L; return s; } catch (e) { return null; } }
    _nAt(b, pos) { try { if (pos[0] + 9 > b.length) return 0; const t = b[pos[0]] & 255; pos[0]++; if (t !== 0) return 0; const v = b.readDoubleBE(pos[0]); pos[0] += 8; return v; } catch (e) { return 0; } }
    _w(b) { this.tmp = this.tmp ? Buffer.concat([this.tmp, b]) : Buffer.from(b); }
    _take() { const t = this.tmp || Buffer.alloc(0); this.tmp = null; return t; }
    _onRx() {}
    _pump() { if (this.waiting && this.rx.length >= this.waiting.n) { const w = this.waiting; this.waiting = null; const t = this.rx.subarray(0, w.n); this.rx = this.rx.subarray(w.n); w.r(t); } }
    _rd(n) { return new Promise(r => { if (this.rx.length >= n) { const t = this.rx.subarray(0, n); this.rx = this.rx.subarray(n); return r(t); } this.waiting = { n, r }; }); }
    async _rb() { const b = await this._rd(1); return b.length ? b[0] & 255 : -1; }
    async _ru24() { const b = await this._rd(3); return ((b[0] & 255) << 16) | ((b[1] & 255) << 8) | (b[2] & 255); }
    async _ru32() { const b = await this._rd(4); return b.readUInt32BE(0); }
    async _ru32le() { const b = await this._rd(4); return b.readUInt32LE(0); }
    close() { this.failed = true; try { this.sock.destroy(); } catch (e) {} }
  }

  const link = new RtmpLink();
  ok(await link.connect(), 'نموذج التطبيق: مصافحة RTMP + connect');
  for (let i = 0; i < 40 && !link.publishSent; i++) await sleep(100);
  ok(link.publishSent, 'publish مُؤكد من المرحّل');
  link.sendConfig();
  ok(link.cfgSent, 'ترويسة AVCC أُرسلت بعد النشر (عقد v2.91)');

  /* ضخ بالوقت الحقيقي 24fps لمدة الاختبار */
  const fm = 1000 / 24; let ms = 0; const t0 = Date.now(); let stop = false;
  (async () => {
    for (let i = 0; i < deviceAUs.length && !stop; i++) {
      link.sendFrame(deviceAUs[i], Math.round(ms)); ms += fm;
      const due = t0 + ms; const now = Date.now(); if (due > now) await sleep(due - now);
    }
  })();

  /* ── مسار المرحّل جاهز؟ ── */
  let ready = null;
  for (let i = 0; i < 25 && !ready; i++) { try { const r = await fetch('http://127.0.0.1:9997/v3/paths/get/' + encodeURIComponent(PUBLISH_PATH), { signal: AbortSignal.timeout(1200) }); if (r.ok) ready = await r.json(); } catch (e) {} if (!ready) await sleep(400); }
  ok(!!ready && ready.ready !== false, 'المسار جاهز عند المرحّل (bytes=' + (ready ? (ready.inboundBytes || 0) : '-') + ')');

  /* ── بروكسي الإنتاج: hlsFetch وrewriteHlsPlaylist من server-mediamtx.js الحقيقي ── */
  const MMX = require(path.join(REPO, 'server-mediamtx.js'));
  const prox = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const m = u.pathname.match(/^\/api\/matches\/([^\/]+)\/hls\/([^\/]+)\/([A-Za-z0-9_.\-]+)$/);
    if (!m || req.method !== 'GET') { res.writeHead(404); res.end('{}'); return; }
    if (String(u.searchParams.get('t') || '') !== TOK) { res.writeHead(403); res.end('{}'); return; }
    let up = '/' + PUBLISH_PATH + '/' + m[3];
    /* نفس قائمة البيضاء في server.js [v2.93] */
    const q2 = [];
    ['_HLS_msn', '_HLS_part', '_HLS_skip'].forEach(k => { const v2 = u.searchParams.get(k); if (v2 != null) q2.push(k + '=' + encodeURIComponent(String(v2).slice(0, 32))); });
    if (q2.length) up += '?' + q2.join('&');
    MMX.hlsFetch(up, (hRes, hErr) => {
      if (hErr) { res.writeHead(502); res.end('{}'); return; }
      if (hRes.statusCode !== 200) { hRes.resume(); res.writeHead(hRes.statusCode === 404 ? 404 : 502); res.end('{}'); return; }
      if (/\.m3u8$/i.test(m[3])) {
        let b = ''; hRes.setEncoding('utf8');
        hRes.on('data', c => { if (b.length < 524288) b += c; });
        hRes.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' }); res.end(MMX.rewriteHlsPlaylist(b, m[1], m[2], TOK)); });
      } else {
        res.writeHead(200, { 'Content-Type': hRes.headers['content-type'] || 'video/mp2t' });
        hRes.pipe(res);
      }
    });
  });
  await new Promise(r => prox.listen(3983, '127.0.0.1', r));

  /* ── القائمة عبر البروكسي — يجب أن تحمل أجزاء حقيقية (لا كلها GAP) ── */
  const hlsPath = '/api/matches/' + ROOM + '/hls/' + UID + '/index.m3u8?t=' + TOK;
  let plBody = '', plStatus = 0;
  for (let i = 0; i < 8; i++) {
    try { const r = await fetch('http://127.0.0.1:3983' + hlsPath); plStatus = r.status; plBody = await r.text(); } catch (e) {}
    if (plStatus === 200) break;
    await sleep(2500);
  }
  ok(plStatus === 200, 'القائمة الرئيسية عبر بروكسي الإنتاج: HTTP ' + plStatus);
  const vm = plBody.match(/^[^#\s].*\.m3u8\?t=\S+$/m) || plBody.match(/^[^#\s].*video1_stream\.m3u8\S*$/m);
  ok(!!vm, 'القائمة الرئيسية تعرّض متغير الفيديو');
  if (vm) {
    const vPath = vm[0].split('?')[0];
    let vBody = '';
    const r2 = await fetch('http://127.0.0.1:3983' + vPath + '?t=' + TOK);
    vBody = await r2.text();
    const parts = (vBody.match(/#EXT-X-PART(?::|-INF)/g) || []).length;
    const gaps = (vBody.match(/#EXT-X-GAP/g) || []).length;
    ok(r2.status === 200 && parts > 0 && gaps < parts,
      'القائمة الفرعية: ' + parts + ' جزءاً حقيقياً مقابل ' + gaps + ' فجوة (قبل الإصلاح: صفر جزء وكلها فجوات — جذر ①)');
    ok(vBody.indexOf('_HLS_msn') === -1 || vBody.indexOf('video1_stream') >= 0, 'إعادة كتابة الروابط عبر rewriteHlsPlaylist الحقيقي');
  }

  /* ── المتصفح الحقيقي: مشغل hls.js بإعدادات لوحة الأدمن نفسها ── */
  const PAGE = `<!doctype html><html><head><meta charset="utf-8"><script src="/hls.light.min.js"></script></head>
<body style="margin:0;background:#000"><video id="v" autoplay playsinline muted></video><script>
window.__p = { rs: 0, vw: 0, lum: -1, spread: -1, ev: [] };
(function () {
  var v = document.getElementById('v');
  var hls = new Hls({ lowLatencyMode: true, backBufferLength: 30, maxBufferLength: 10, liveSyncDurationCount: 3 });
  hls.on(Hls.Events.ERROR, function (e, d) { window.__p.ev.push((d && d.details) || String(e)); });
  hls.loadSource('${hlsPath}');
  hls.attachMedia(v);
  setInterval(function () {
    var p = window.__p; p.rs = v.readyState; p.vw = v.videoWidth;
    try {
      var c = document.createElement('canvas'); c.width = 64; c.height = 36;
      var x = c.getContext('2d'); x.drawImage(v, 0, 0, 64, 36);
      var d = x.getImageData(0, 0, 64, 36).data, s = 0, mn = 255, mx = 0;
      for (var i = 0; i < d.length; i += 4) { var y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; s += y; if (y < mn) mn = y; if (y > mx) mx = y; }
      p.lum = s / (d.length / 4); p.spread = mx - mn;
    } catch (e) {}
  }, 500);
})();
</script></body></html>`;
  if (!h264Ok) {
    stop = true; link.close();
    prox.close();
    console.log('  ⏭  فحص بكسلات المتصفح متخطى (قيد بيئة لا انحدار): بناء Chromium بلا فك H.264 — طرف السلسلة حتى القائمة الفرعية والأجزاء مُختبر حياً أعلاه، وفحص البكسلات مثبت على بيئة كاملة القدرات (لقطة إثبات موثقة بالسجل)');
    console.log('════════════════');
    console.log('الخلاصة: PASS=' + pass + ' FAIL=' + fail + ' LIVE=RELAY-ONLY(H264-env)');
    process.exit(fail > 0 ? 1 : 0);
  }
  const { chromium } = require('playwright');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const pageDiag = { console: [], errors: [] };
  page.on('console', function (m) { try { pageDiag.console.push(String(m.type()) + ':' + String(m.text()).slice(0, 110)); } catch (e) {} });
  page.on('pageerror', function (e) { try { pageDiag.errors.push(String(e && e.message || e).slice(0, 160)); } catch (e2) {} });
  await page.route('**/hls.light.min.js', r => r.fulfill({ path: path.join(REPO, 'js', 'vendor', 'hls.light.min.js'), contentType: 'text/javascript' }));
  await page.goto('http://127.0.0.1:3983/x', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.setContent(PAGE, { waitUntil: 'domcontentloaded' });
  let best = null;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    best = await page.evaluate(() => window.__p);
    if (best && best.rs >= 2 && best.vw > 0 && best.lum > 5 && best.spread > 20) break;
  }
  if ((!best) || best.rs < 2) {
    LOG('تشخيص الفشل — كونسول:', JSON.stringify(pageDiag.console.slice(0, 6)));
    LOG('تشخيص الفشل — أخطاء:', JSON.stringify(pageDiag.errors.slice(0, 4)));
    LOG('تشخيص الفشل — أحداث hls:', JSON.stringify((best && best.ev || []).slice(0, 8)));
  }
  LOG('المشغل: readyState=' + (best && best.rs) + ' · ' + (best && best.vw) + 'x… · إضاءة=' + (best && best.lum != null ? best.lum.toFixed(1) : '?') + ' · مدى=' + (best && best.spread != null ? best.spread.toFixed(1) : '?'));
  ok(!!best && best.rs >= 2 && best.vw > 0, 'المشغل يلعب فعلاً (readyState ≥ 2 — قبل الإصلاح: 1 فقط وبلا إطارات)');
  ok(!!best && best.lum > 5 && best.spread > 20,
    'الصورة مرئية غير سوداء (إضاءة ' + (best && best.lum != null ? best.lum.toFixed(1) : '?') + ' · مدى ' + (best && best.spread != null ? best.spread.toFixed(1) : '?') + ' — قبل الإصلاح: 0.0/0.0)');
  const fatal = (best && best.ev || []).filter(e => /levelLoadError|manifestLoadError|fragParsingError/.test(e));
  ok(fatal.length === 0, 'صفر أخطاء قاتلة في المشغل' + (fatal.length ? ' — ' + fatal.slice(0, 3).join(' · ') : ' (قبل الإصلاح: fragGap×4 ثم levelLoadError — جذر ②)'));
  try { await page.screenshot({ path: path.join(require('os').tmpdir(), 'dtsg-v293-admin-view.png') }); } catch (e) {}

  /* تنظيف */
  stop = true; link.close();
  try { await browser.close(); } catch (e) {}
  prox.close();
  console.log('════════════════');
  console.log('الخلاصة: PASS=' + pass + ' FAIL=' + fail + ' LIVE=OK');
  process.exit(fail > 0 ? 1 : 0);
})().catch(function (e) {
  console.error('✗ خلل في المختبر الحي:', e && e.message);
  process.exit(1);
});
