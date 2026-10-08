/* ═══════════════════════════════════════════════════════════════════════════
   [v2.94] حرس إيقاع بث شاشة التحكيم — حلقة المرآة المستمرة (GlMirror)
   ───────────────────────────────────────────────────────────────────────────
   بلاغ المالك 2026-10-08 (بعد build32/v2.93.0): «يوجد خلل في تطبيق الأندرويد
   في مشاركة الشاشة: البث يعمل بشكل متقطع والفريمات صغيرة متقطعة — تظهر لقطة
   ويبقى قارئ الفيديو بدون فريم لمدة أكثر من 5 ثواني ويظهر فريم جديد وصغير
   للشاشة عند الأدمن».

   الجذر (مختبر حي كامل scripts/e2e/v294-cadence.js + تشريح مصادر المرحّل
   gohlslib v2.4.5 — muxer_segmenter.go):
   ① جهاز الميدان يتجاهل KEY_REPEAT_PREVIOUS_FRAME_AFTER (أمل v2.92) فالشاشة
     الافتراضية AUTO_MIRROR (لا إطارات على محتوى ثابت) تترك المرمّز صامتاً
     ثوانٍ متواصلة.
   ② المرحّل لا يغلق EXT-X-PART إلا عند وصول عيّنة جديدة (rotateParts
     يستدعى من fmp4WriteSample حصراً) فتتجمد القائمة والمشغّل معاً، وعيّنة
     ما قبل الصمت تأخذ مدة = طول الصمت فتنفخ fmp4AdjustedPartDuration
     (سقف حلقة البحث 5ث) وتتسمم PART-TARGET/HOLD-BACK — نتيجة المختبر
     المقاسة: أجزاء كل ~2ث فقط أو ثقوب 5.2-6.7ث، وفجوات عرض عند الأدمن حتى
     أثناء حركة الشاشة («بث متقطع» حرفياً كما في البلاغ).
   العلاج: حلقة المرآة المستمرة GlMirror — الشاشة الافتراضية تصبّ في
     SurfaceTexture وخيط GL يعيد الرسم إلى سطح المرمّز بوتيرة 24fps ثابتة
     (تكرار آخر صورة عند السكون = إطارات P رخيصة) فلا يصمت المرمّز أبداً.
     نمط ما بعد الإصلاح مقاساً في المختبر نفسه: أجزاء كل ~0.2ث بلا ثقوب،
     PART-TARGET=0.209ث، HOLD-BACK=0.52ث.

   هذا الحرس:
     أ) ساكن: عقود GlMirror كلها في سير البناء (التكامل الثلاثي: التهيئة
        باحتياط · الشاشة تصبّ في المرآة · الإيقاف قبل المرمّز) + عقود النبض
        (updateTexImage/eglPresentationTimeANDROID/eglSwapBuffers + مصفوفة
        التحويل الرسمية) + مسار الاحتياط المباشر محفوظ + إصدار الجسر 5 +
        الثلاثية 2.94.0 + لا شرطة مائلة عكسية (عقد الحقن).
     ب) حيّ (يتخطى بتلطٍ معلن حيث تنقص المكونات — قيد بيئة لا انحدار):
        نموذج التطبيق (بذات بايتات جافا v2.93) ينشر نمطين إلى MediaMTX حقيقي
        بإعداد المستودع عبر بروكسي الإنتاج (hlsFetch/rewriteHlsPlaylist من
        server-mediamtx.js نفسه):
        · نمط العطل (نشاط 6ث → صمت 6ث → نشاط 12ث): يجب أن تتجمد الأجزاء
          (فجوة > 2.5ث) — إعادة إنتاج الجذر ② موثقة.
        · نمط الإصلاح (24fps متصلة — واقع GlMirror): يجب أن تتدفق الأجزاء
          بلا ثقوب (أقصى فجوة ≤ 1.2ث) وقائمة سليمة (PART-TARGET ≤ 0.5ث).
   تشغيل: node tests/_v294_arb_share_cadence_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const REPO = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, label, detail) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail !== undefined ? ' — ' + detail : '')); }
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8'); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ═══════════════ أ) العقود الساكنة ═══════════════ */
console.log('═══ v2.94 · عقود حلقة المرآة المستمرة (ساكن) ═══');
const wf = fs.readFileSync(path.join(REPO, '.github/workflows/build-apk.yml'), 'utf8');
const twin = fs.readFileSync(path.join(REPO, 'docs/workflows/build-apk.yml'), 'utf8');
ok(wf === twin, 'النسختان (github/docs) متطابقتان بايت-بايت (قاعدة 18)');

/* ① صنف GlMirror بوتيرة ثابتة */
ok(wf.indexOf('private class GlMirror') > 0, '[جذر ①] صنف GlMirror موجود (حلقة المرآة المستمرة)');
ok(wf.indexOf('static final long INTERVAL = 41666667L;') > 0, '[جذر ①] وتيرة ثابتة 24fps (41666667ns — عقد KEY_FRAME_RATE)');
ok(wf.indexOf('static final int EGL_RECORDABLE = 0x3142;') > 0, '[جذر ①] وسم EGL_RECORDABLE_ANDROID بقيمته الحرفية (ليس في فئة EGL14 — نمط Grafika)');

/* ② التكامل الثلاثي: تهيئة باحتياط → الشاشة تصبّ في المرآة → إيقاف قبل المرمّز */
const bIdx = wf.indexOf('void beginProjectionBg(');
ok(wf.indexOf('try { gl = new GlMirror(input, w, h); }', bIdx) > 0 &&
   wf.indexOf('catch (Throwable t) { gl = null; }', bIdx) > 0,
  '[تكامل] تهيئة المرآة داخل beginProjectionBg داخل try/catch');
ok(wf.indexOf('gl != null ? gl.sink : input, null, null);') > 0,
  '[تكامل] الشاشة الافتراضية تصبّ في المرآة (gl.sink) ومسار v2.93 المباشر احتياط (input)');
ok(wf.indexOf('if (gl != null) gl.start(this);') > 0 &&
   wf.indexOf('if (gl != null) gl.start(this);') > wf.indexOf('push("state", "live", null);', bIdx),
  '[تكامل] نبض المرآة يبدأ بعد live (بعد اكتمال النشر — ترتيب v2.91 محفوظ)');
const stIdx = wf.indexOf('void stop(String why)');
ok(stIdx > 0 && wf.indexOf('gl.release();', stIdx) > 0 &&
   wf.indexOf('gl.release();', stIdx) < wf.indexOf('encoder.stop(); encoder.release();', stIdx),
  '[تكامل] الإيقاف يحرر المرآة قبل المرمّز (توقف التغذية قبل تفكيك المستهلك)');
ok(wf.indexOf('void glMirrorFailed()') > 0 && wf.indexOf('push("state", "failed", "gl");', wf.indexOf('void glMirrorFailed()')) > 0,
  '[تكامل] موت خيط المرآة = حالة فشل ظاهرة gl (لا تجميد صامت — درس v2.91)');

/* ③ عقود النبض: التقاط + رسم + ساعة رتيبة + تبديل */
ok(wf.indexOf('st.updateTexImage();') > 0, '[نبض] التقاط أحدث إطار من SurfaceTexture (غيابه = تكرار الأخير)');
ok(wf.indexOf('android.opengl.EGLExt.eglPresentationTimeANDROID(dpy, sfc, outNs);') > 0,
  '[نبض] ساعة عرض رتيبة عبر eglPresentationTimeANDROID (إطار كل INTERVAL بالضبط)');
ok(wf.indexOf('if (!android.opengl.EGL14.eglSwapBuffers(dpy, sfc)) throw new Exception("gl-swap");') > 0,
  '[نبض] eglSwapBuffers يغذي سطح المرمّز كل دورة وفشله فشل ظاهر');
ok(wf.indexOf('st.getTransformMatrix(texMat);') > 0,
  '[نبض] مصفوفة تحويل SurfaceTexture الرسمية (اتجاه سليم على كل الأجهزة)');
ok(wf.indexOf('GLES11Ext.GL_TEXTURE_EXTERNAL_OES') > 0, '[نبض] نسيج خارجي OES (عقد SurfaceTexture)');

/* ④ الإصدارات + عقد الحقن */
ok(wf.indexOf('arbShareVersion() { return "5"; }') > 0, '[جسر] arbShareVersion=5 (حلقة المرآة — تغيير جسري)');
(function () {
  const lines = wf.split('\n');
  const s = lines.findIndex(l => l.includes("new = '''"));
  const e = lines.findIndex((l, i) => i > s && l.trim() === "'''");
  let bad = false;
  for (let i = s + 1; i < e; i++) if (lines[i].includes('\\')) bad = true;
  ok(!bad, 'لا شرطة مائلة عكسية في جافا سير البناء (عقد الحقن)');
})();
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const mainJs = read('js/main.js');
/* قاعدة 22: الإصدار يُشتق من package.json (المصدر الوحيد) ولا يُثبَّت حرفياً */
ok(lock.version === pkg.version && lock.packages[''].version === pkg.version,
  'الثلاثية متطابقة package/lock = ' + pkg.version);
ok(mainJs.indexOf("DTSG_BUILD = 'v" + pkg.version + "';") > 0, 'DTSG_BUILD = v' + pkg.version);
ok(read('tests/_run_regression_rooms.sh').indexOf('_v294_arb_share_cadence_test.js') !== -1,
  'الجناح مسجَّل في عدّاء البطارية (لا ثغرة تغطية — درس v2.81.4-audit)');

console.log('── ساكن: ' + pass + ' ✓ / ' + fail + ' ✗');

/* ═══════════════ ب) المختبر الحي: إيقاع الأجزاء ═══════════════ */
(async () => {
  console.log('═══ v2.94 · المختبر الحي (نمط العطل مقابل نمط الإصلاح عبر سلسلة الإنتاج) ═══');

  /* المكونات: mediamtx (عرف v2814) + ffmpeg */
  const mtxBin = path.join(process.env.HOME || '/home/z', '.cache', 'mediamtx', 'mediamtx');
  let haveMtx = fs.existsSync(mtxBin);
  if (haveMtx) { try { execFileSync(mtxBin, ['--version'], { timeout: 4000 }); } catch (e) { haveMtx = false; } }
  let haveFfmpeg = false;
  try { execFileSync('ffmpeg', ['-version'], { timeout: 4000, stdio: 'ignore' }); haveFfmpeg = true; } catch (e) {}
  if (!haveMtx || !haveFfmpeg) {
    console.log('  ⏭  المختبر الحي متخطى (قيد بيئة لا انحدار): ' +
      (!haveMtx ? 'وسيط MediaMTX غير متوفر في ~/.cache/mediamtx' : 'ffmpeg غير متوفر'));
    console.log('════════════════');
    console.log('الخلاصة: PASS=' + pass + ' FAIL=' + fail + ' LIVE=SKIPPED');
    process.exit(fail > 0 ? 1 : 0);
  }

  /* ── MediaMTX حي بإعداد المستودع ── */
  async function mtxReachable() {
    try { const c = await fetch('http://127.0.0.1:9997/v3/paths/list', { signal: AbortSignal.timeout(1200) }); return c.ok; } catch (e) { return false; }
  }
  if (!(await mtxReachable())) {
    const mtxCwd = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dtsg-mtx-'));
    const child = spawn(mtxBin, [path.join(REPO, 'mediamtx.yml')], { cwd: mtxCwd, stdio: 'ignore', detached: true });
    child.unref();
    let up = false;
    for (let i = 0; i < 30 && !up; i++) { await sleep(300); up = await mtxReachable(); }
    ok(up, 'MediaMTX اشتغل بإعداد المستودع (hlsVariant: lowLatency)');
    if (!up) throw new Error('mediamtx لم يقلع');
  } else {
    ok(true, 'MediaMTX يعمل أصلاً (إعادة استعمال)');
  }

  /* ── الجريان: 24ث · IDR كل 2ث (بحدود مضبوطة — مناظر الصمت تفصل بين مقاطع IDRs) ── */
  const es = path.join(require('os').tmpdir(), 'dtsg-v294-cadence.264');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=24',
    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p',
    '-g', '48', '-sc_threshold', '0', '-bf', '0', '-x264-params', 'aud=1:repeat-headers=1',
    '-f', 'h264', es]);
  const raw = fs.readFileSync(es);
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
  ok(!!sps && !!pps && deviceAUs.length >= 570,
    'جريان الاختبار: ' + deviceAUs.length + ' وحدة وصول (24ث · IDR عند 0/48/…/288 — منظر الصمت يفصل بين مرجعيتين)');

  /* ── نموذج RtmpLink (نقل جافا التطبيق مع حقن v2.93 — كما في حرس v293) ── */
  function makeLink(publishPath) {
    class RtmpLink {
      constructor() {
        this.outChunk = 128; this.inChunk = 128; this.msid = 1; this.publishSent = false;
        this.failed = false; this.cfgSent = false; this.cfgBody = null;
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
              this.ps('app', publishPath.substring(0, publishPath.indexOf('/')));
              this.ps('type', 'nonprivate');
              this.ps('flashVer', 'FMLE/3.0');
              this.ps('tcUrl', 'rtmp://127.0.0.1:1935/' + publishPath.substring(0, publishPath.indexOf('/')));
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
            this.as(publishPath.substring(publishPath.indexOf('/') + 1)); this.as('live');
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
        const o = [0x17, 0x00, 0, 0, 0, 0x01, sps[1], sps[2], sps[3], 0xFF, 0xE1,
          sps.length >> 8, sps.length & 255, ...sps, 0x01, pps.length >> 8, pps.length & 255, ...pps];
        this.cfgBody = Buffer.from(o); this._maybeCfg();
      }
      _maybeCfg() {
        if (this.cfgSent || this.cfgBody == null || !this.publishSent || this.failed) return;
        this.send(4, this.msid, 9, 0, this.cfgBody); this.cfgSent = true;
      }
      sendFrame(auNals, ts) {
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
      _pump() { if (this.waiting && this.rx.length >= this.waiting.n) { const w = this.waiting; this.waiting = null; const t = this.rx.subarray(0, w.n); this.rx = this.rx.subarray(w.n); w.r(t); } }
      _rd(n) { return new Promise(r => { if (this.rx.length >= n) { const t = this.rx.subarray(0, n); this.rx = this.rx.subarray(n); return r(t); } this.waiting = { n, r }; }); }
      async _rb() { const b = await this._rd(1); return b.length ? b[0] & 255 : -1; }
      async _ru24() { const b = await this._rd(3); return ((b[0] & 255) << 16) | ((b[1] & 255) << 8) | (b[2] & 255); }
      async _ru32() { const b = await this._rd(4); return b.readUInt32BE(0); }
      async _ru32le() { const b = await this._rd(4); return b.readUInt32LE(0); }
      close() { this.failed = true; try { this.sock.destroy(); } catch (e) {} }
    }
    return new RtmpLink();
  }

  /* ── بروكسي الإنتاج (hlsFetch/rewriteHlsPlaylist من server-mediamtx.js الحقيقي) ── */
  const TOK = 'v294testtoken';
  const MMX = require(path.join(REPO, 'server-mediamtx.js'));
  const prox = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const m = u.pathname.match(/^\/api\/matches\/([^\/]+)\/hls\/([^\/]+)\/([A-Za-z0-9_.\-]+)$/);
    if (!m || req.method !== 'GET') { res.writeHead(404); res.end('{}'); return; }
    if (String(u.searchParams.get('t') || '') !== TOK) { res.writeHead(403); res.end('{}'); return; }
    let up = '/dtsg/' + m[1] + '/' + m[2] + '_' + TOK + '/' + m[3];
    const q2 = [];
    ['_HLS_msn', '_HLS_part', '_HLS_skip'].forEach(k => { const v2 = u.searchParams.get(k); if (v2 != null) q2.push(k + '=' + encodeURIComponent(String(v2).slice(0, 32))); });
    if (q2.length) up += '?' + q2.join('&');
    MMX.hlsFetch(up, (hRes, hErr) => {
      if (hErr) { res.writeHead(hErr === 'timeout' ? 504 : 502); res.end('{}'); return; }
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
  await new Promise(r => prox.listen(3984, '127.0.0.1', r));

  /* مراقب إيقاع الأجزاء: متى يغلق المرحّل كل جزء فعلاً؟ */
  async function watchPartCadence(room, uid, durMs) {
    const idx = '/api/matches/' + room + '/hls/' + uid + '/index.m3u8?t=' + TOK;
    let media = null, lastBody = '';
    const seen = new Map();
    const t0 = Date.now();
    while (Date.now() - t0 < durMs) {
      try {
        if (!media) {
          const r = await fetch('http://127.0.0.1:3984' + idx);
          if (r.ok) {
            const b = await r.text();
            const mm = b.match(/^([^#\s][^\n]*\.m3u8[^\n]*)$/m);
            if (mm) media = mm[1].startsWith('/') ? mm[1] : null;
          }
        } else {
          const r = await fetch('http://127.0.0.1:3984' + media);
          if (r.ok) {
            const b = await r.text();
            lastBody = b;
            for (const pm of b.matchAll(/^#EXT-X-PART:[^\n]*?URI="([^"]+)"/gm)) {
              if (!seen.has(pm[1])) seen.set(pm[1], (Date.now() - t0) / 1000);
            }
          }
        }
      } catch (e) {}
      await sleep(200);
    }
    const stamps = [...seen.values()].sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 1; i < stamps.length; i++) maxGap = Math.max(maxGap, stamps[i] - stamps[i - 1]);
    const pt = (lastBody.match(/PART-TARGET=([\d.]+)/) || [])[1];
    const hb = (lastBody.match(/PART-HOLD-BACK=([\d.]+)/) || [])[1];
    const td = (lastBody.match(/TARGETDURATION:(\d+)/) || [])[1];
    return { parts: seen.size, maxGap: Math.round(maxGap * 10) / 10, partTarget: pt, holdBack: hb, targetDuration: td };
  }

  /* نشر مجدول: auFrame(i) يسلّمها عند t=i/24ث؛ skip(i) يعني صمتاً (الشاشة ساكنة) */
  async function publishPattern(room, uid, skipFn, totalAus) {
    const publishPath = 'dtsg/' + room + '/' + uid + '_' + TOK;
    const link = makeLink(publishPath);
    ok(await link.connect(), '[' + room + '] نموذج التطبيق: مصافحة RTMP + connect');
    for (let i = 0; i < 40 && !link.publishSent; i++) await sleep(100);
    if (!link.publishSent) { link.close(); throw new Error('publish لم يؤكد'); }
    link.sendConfig();
    if (!link.cfgSent) { link.close(); throw new Error('الترويسة لم ترسل'); }
    const fm = 1000 / 24;
    const t0 = Date.now();
    let sent = 0;
    let i = 0;
    (async () => {
      while (i < totalAus) {
        const due = t0 + i * fm;
        const now = Date.now();
        if (due > now) await sleep(due - now);
        if (!skipFn || !skipFn(i)) { link.sendFrame(deviceAUs[i], Math.round(i * fm)); sent++; }
        i++;
      }
    })();
    return { link, sentCount: () => sent };
  }

  /* ── نمط العطل (الجهاز يتجاهل REPEAT: صمت كامل على الشاشة الساكنة):
        نشاط 0-6ث → صمت 6-12ث (تسقط إطارات 144-287 كلياً) → نشاط 12-24ث ── */
  const DEFTOTAL = deviceAUs.length;
  const defPub = await publishPattern('v294defect', '4294',
    idx => idx >= 144 && idx < 288, DEFTOTAL);   /* صمت 6-12ث: [6s,12s) = AUs 144..287 */
  const defectRes = await watchPartCadence('v294defect', '4294', DEFTOTAL / 24 * 1000 + 5000);
  defPub.link.close();
  await sleep(800);

  /* ── نمط الإصلاح (واقع GlMirror: 24fps متصلة — لا صمت أبداً) ── */
  const fixPub = await publishPattern('v294fix', '4295', null, DEFTOTAL);
  const fixRes = await watchPartCadence('v294fix', '4295', DEFTOTAL / 24 * 1000 + 5000);
  fixPub.link.close();

  /* ── التحكيم ── */
  console.log('  نمط العطل :', JSON.stringify(defectRes));
  console.log('  نمط الإصلاح:', JSON.stringify(fixRes));
  ok(parseFloat(defectRes.partTarget) > 5,
    '[جذر ② مؤكد] عيّنة الصمت تسمّم PART-TARGET (' + defectRes.partTarget + 'ث > 5 — بصمة «أكثر من 5 ثواني» في البلاغ حرفياً: سقف حلقة ضبط مدة الجزء في المرحّل)');
  ok(parseFloat(defectRes.holdBack) > 5,
    '[جذر ②] HOLD-BACK مضطرب (' + defectRes.holdBack + 'ث — حافة البث الحي عند الأدمن تُدفع للوراء فجأة: «بث متقطع»)');
  ok(defectRes.maxGap >= 1.5 && defectRes.maxGap > fixRes.maxGap,
    '[جذر ②] الأجزاء متقطعة في نمط العطل (أقصى فجوة ' + defectRes.maxGap + 'ث مقابل ' + fixRes.maxGap + 'ث للإصلاح — إغلاق عند حدود المقاطع حصراً)');
  ok(defectRes.parts < fixRes.parts / 2,
    '[جذر ②] العطل يقتل إنتاجية الأجزاء (' + defectRes.parts + ' جزءاً مقابل ' + fixRes.parts + ' للإصلاح — النسبة > 2×)');
  ok(fixRes.maxGap <= 1.2,
    '[الإصلاح] التدفق المتصل يغلق الأجزاء باستمرار (أقصى فجوة ' + fixRes.maxGap + 'ث ≤ 1.2 — واقع GlMirror)');
  ok(fixRes.parts >= 60,
    '[الإصلاح] كثافة الأجزاء صحية (' + fixRes.parts + ' جزءاً في ~24ث ≈ تدفق ~0.2ث/جزء)');
  ok(fixRes.partTarget != null && parseFloat(fixRes.partTarget) <= 0.5,
    '[الإصلاح] PART-TARGET سليم (' + fixRes.partTarget + 'ث ≤ 0.5 — لا تسميم بعينات الصمت)');
  ok(fixRes.holdBack != null && parseFloat(fixRes.holdBack) <= 1.5,
    '[الإصلاح] PART-HOLD-BACK سليم (' + fixRes.holdBack + 'ث ≤ 1.5 — حافة البث الحي غير مضطربة)');

  prox.close();
  console.log('════════════════');
  console.log('الخلاصة: PASS=' + pass + ' FAIL=' + fail + ' LIVE=OK');
  process.exit(fail > 0 ? 1 : 0);
})().catch(function (e) {
  console.error('✗ خلل في المختبر الحي:', e && e.message);
  process.exit(1);
});
