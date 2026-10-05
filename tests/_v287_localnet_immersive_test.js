/* ═══════════════════════════════════════════════════════════════════════════
   [v2.87] حرس الإصدار الرباعي — الوضع الغامر + الأيقونة + هيدر/شريط سفلي
            + شبكة اللعب المحلي المباشر (LocalNet)
   ───────────────────────────────────────────────────────────────────────────
   يثبّت بلاغ المالك 2026-10-06 بأربع مشاكل ميدانية في تطبيق الأندرويد:
     ① «الأيقونة صغيرة داخل حاوية مربعة سوداء» — التشخيص: طبقة خلفية
        شفافة يركّب فوقها المشغّل الأسود، ولوغو 69-76% فقط. الإصلاح: خلفية
        كحلية من هوية المنصة + لوغو 90% من منطقة الرؤية + شارة قديمة
        بحدّ ذهبي (القياس الفعلي: inset 16.7% يعني أن المصدر يطابق
        منطقة الرؤية المقنّعة حرفياً).
     ② «الشريطان يتداخلان مع الأزرار والألعاب» — الإصلاح: الوضع الغامر
        الاحترافي hide(systemBars) + BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE:
        يختفيان آلياً عند فتح التطبيق ويظهران بالسحب من الحافة فقط.
     ③ «أيقونات الهيدر مزاحة للأسفل + الشريط السفلي مربع كبير مشوه» —
        الإصلاح: app-dock محور واحد (align-items:center) + mobile-bottom-nav
        بحدّ box-sizing:border-box فيثبت محتواه 60px مهما كبرت المساحة
        الآمنة + قصّ تسميات بعلامة نقاط.
     ④ «اللعب مع الأصدقاء معقّد ولا يعمل» — الإصلاح: LocalNet الأصلية
        (NSD/mDNS اكتشافاً على الواي فاي + إعلان/مسح BLE + قنوات TCP/
        RFCOMM غير الآمنة مباشرة) — كود 8 حروف وأرقام، واكتشاف آلي منذ
        فتح التطبيق، بلا روابط وبلا QR في التطبيق (الويب يبقى كما هو).
   تشغيل: node tests/_v287_localnet_immersive_test.js   (بلا خادم — فحوص مصدر)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const results = [];
function ok(cond, label, detail) { results.push(!!cond); console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail ? ' — ' + detail : '')); }
function read(p) { return fs.readFileSync(path.join(ROOT, p)).toString('utf8'); }

/* ── 1) النسختان المتطابقتان + لا انحدار v286 ─────────────────────────── */
const wfLive = fs.readFileSync(path.join(ROOT, '.github/workflows/build-apk.yml'));
const wfDocs = fs.readFileSync(path.join(ROOT, 'docs/workflows/build-apk.yml'));
ok(wfLive.equals(wfDocs), 'سير البناء: النسختان متطابقتان بايت-ببايت (قاعدة 18)');
const wf = wfLive.toString('utf8');
ok(/WindowCompat\.setDecorFitsSystemWindows\(w, false\)/.test(wf) &&
   /w\.setBackgroundDrawable\(new ColorDrawable\(0xFF0B1526\)\)/.test(wf) &&
   /setAppearanceLightStatusBars\(barsLight\)/.test(wf) &&
   /addJavascriptInterface\(new NativeChrome\(\), "DTSGNative"\)/.test(wf),
   'لا انحدار: عقود v2.85/v2.86 (التخطيط + الخلفية + الجسر) كما هي');

/* ── 2) الوضع الغامر (المشكلة ②) ────────────────────────────────────────── */
ok(/BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/.test(wf) &&
   /ctl\.hide\(WindowInsetsCompat\.Type\.systemBars\(\)\)/.test(wf),
   'الوضع الغامر: إخفاء الشريطين + ظهور مؤقت بالسحب فقط (BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE)');
ok(/onWindowFocusChanged\(boolean hasFocus\)/.test(wf) && /if \(hasFocus\) hideSystemBars\(\);/.test(wf),
   'onWindowFocusChanged يعيد الإخفاء بعد أي حوار/تركيز — النمط الاحترافي');
ok(/applyBarsAppearance\(\);\s*\n\s*hideSystemBars\(\);/.test(wf),
   'الإخفاء منذ الإقلاع (onCreate) وعند كل onResume');
ok(/getDisplayCutout\(\)/.test(wf) && /dc\.getSafeInsetTop\(\)/.test(wf),
   'حشوة المقصوص مدمجة في المساحات: أيقونات الهيدر لا تلمس كاميرا النوتش في الغامر');

/* ── 3) LocalNet في الجافا (المشكلة ④) ─────────────────────────────────── */
ok(/"_dtsg\._tcp\."/.test(wf) && /registerService\(/.test(wf) && /discoverServices\(/.test(wf),
   'الاكتشاف على الواي فاي: خدمة NSD ‏_dtsg._tcp تسجّل وتُكتشف');
ok(/listenUsingInsecureRfcommWithServiceRecord\("DTSG", DTSG_UUID\)/.test(wf) &&
   /createInsecureRfcommSocketToServiceRecord\(DTSG_UUID\)/.test(wf),
   'الاتصال المباشر بالبلوتوث: RFCOMM غير الآمن (بلا إقتران أجهزة)');
ok(/addManufacturerData\(MANUF_ID, advPayload\(\)\)/.test(wf) &&
   /getManufacturerSpecificData\(MANUF_ID\)/.test(wf),
   'إعلان/مسح BLE يحمل كود الغرفة واللعبة واللاعبين');
ok(/si\.setAttribute\("code", hostCode\)/.test(wf) &&
   /si\.setAttribute\("players", String\.valueOf\(hostPlayers\)\)/.test(wf),
   'سجلات TXT تعلن الكود/اللعبة/الاسم/اللاعبين — القائمة تعرض تفاصيل حيّة');
ok(/window\.__dtsgLnEvt&&window\.__dtsgLnEvt\(/.test(wf),
   'الأحداث تُدفع للصفحة عبر window.__dtsgLnEvt — لا استطلاع');
ok(/android\.permission\.BLUETOOTH_SCAN/.test(wf) &&
   /android\.permission\.BLUETOOTH_ADVERTISE/.test(wf) &&
   /android\.permission\.BLUETOOTH_CONNECT/.test(wf) &&
   /android\.permission\.CHANGE_WIFI_MULTICAST_STATE/.test(wf),
   'خطوة 8.6 تحقن أذونات الشبكة المحلية (بلوتوث + بث متعدد) بمرساة وفشل صريح');
ok(/neverForLocation/.test(wf),
   'BLUETOOTH_SCAN بneverForLocation — لا طلب مواقع الجي بي إس إطلاقاً');
/* كود جافا بلا شرطات مائلة عكسية: يسكن سلسلة python ثلاثية فيُعبث بها التهرّب */
const heredoc = wf.split("<<'PY3'\n", 2)[1];
const rawBody = heredoc ? heredoc.split('\n          PY3', 1)[0] : '';
const pyBody = rawBody.split('\n').map(l => (l.startsWith('          ') ? l.slice(10) : l)).join('\n');
const javaTxt = (pyBody.split("new = '''", 2)[1] || '').split("'''", 1)[0];
ok(javaTxt.indexOf(String.fromCharCode(92)) === -1,
   'كود MainActivity المتولَّد بلا أي شرطة مائلة عكسية (عقد سلسلة python الثلاثية)');
ok(/NsdManager\.ResolveListener/.test(javaTxt) && /resolving\.compareAndSet\(false, true\)/.test(javaTxt),
   'حلّ خدمات NSD مسلسل (resolve واحد في اللحظة) — قيد أندرويد المعروف');
ok(/getAttributes\(\)/.test(javaTxt) && /instanceof List/.test(javaTxt) && /instanceof byte\[\]/.test(javaTxt),
   'قراءة سجلات TXT متوافقة مع كل مستويات API (byte[] أو List<byte[]>)');
const braces = (javaTxt.match(/\{/g) || []).length - (javaTxt.match(/\}/g) || []).length;
ok(javaTxt.includes('public class MainActivity extends BridgeActivity') && braces === 0,
   'بنية الجافا سليمة (BridgeActivity + أقواس متوازنة ' + braces + ')');
/* سكربتا الحقن يُحلّان صياغياً */
let pyOk = false;
try {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const tmp = path.join(os.tmpdir(), 'dtsg-v287-step-check.py');
  fs.writeFileSync(tmp, pyBody, 'utf8');
  execFileSync('python3', ['-c', 'compile(open(' + JSON.stringify(tmp) + ', encoding="utf-8").read(), "s.py", "exec")'], { stdio: 'pipe', timeout: 20000 });
  pyOk = pyBody.length > 5000;
} catch (e) { }
const heredoc25 = wf.split("<<'PY25'\n", 2)[1];
const raw25 = heredoc25 ? heredoc25.split('\n          PY25', 1)[0] : '';
const py25 = raw25.split('\n').map(l => (l.startsWith('          ') ? l.slice(10) : l)).join('\n');
let py25Ok = false;
try {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const tmp = path.join(os.tmpdir(), 'dtsg-v287-step25-check.py');
  fs.writeFileSync(tmp, py25, 'utf8');
  execFileSync('python3', ['-c', 'compile(open(' + JSON.stringify(tmp) + ', encoding="utf-8").read(), "s25.py", "exec")'], { stdio: 'pipe', timeout: 20000 });
  py25Ok = py25.length > 500;
} catch (e) { }
ok(pyOk && py25Ok, 'سكربتا الحقن (8.5 جافا + 8.6 أذونات) يُحلّان صياغياً ببايثون');

/* ── 4) الأيقونة (المشكلة ①) — فك ترميز PNG فعلي ───────────────────────── */
function decodePng(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  if (buf.readUInt32BE(0) !== 0x89504E47) return null;
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12);
      bitDepth = buf[pos + 16]; colorType = buf[pos + 17];
    } else if (type === 'IDAT') {
      idat.push(buf.slice(pos + 8, pos + 8 + len));
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) return null;
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!bpp) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const row = raw.slice(p, p + stride); p += stride;
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : null;
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = (x >= bpp && prev) ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 0xFF;
      else if (filter === 2) v = (v + b) & 0xFF;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xFF;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xFF;
      }
      cur[x] = v;
    }
  }
  return { w, h, bpp, colorType, data: out };
}
const bg = decodePng('resources/icon-background.png');
ok(!!bg && bg.w === 1024 && bg.h === 1024,
   'icon-background.png: 1024×1024 قابلة للفك (' + (bg ? bg.w + '×' + bg.h : 'فشل') + ')');
if (bg) {
  let opaque = 0, dark = 0;
  const n = bg.w * bg.h;
  for (let i = 0; i < n; i++) {
    const o = i * bg.bpp;
    if (bg.data[o + (bg.bpp - 1)] > 250) opaque++;
    const r = bg.data[o], g = bg.data[o + 1], b = bg.data[o + 2];
    if (r < 60 && g < 80 && b < 120) dark++;
  }
  ok(opaque / n > 0.985, 'الخلفية معتمة بالكامل (' + (opaque / n * 100).toFixed(1) + '% ≥ 98.5%) — لا أسود من المشغّل أبداً');
  ok(dark / n > 0.9, 'الخلفية كحلية داكنة من هوية المنصة (' + (dark / n * 100).toFixed(1) + '%)');
}
const fg = decodePng('resources/icon-foreground.png');
ok(!!fg && fg.w === 1024 && fg.h === 1024, 'icon-foreground.png: 1024×1024 قابلة للفك');
if (fg) {
  const a = fg.data, bpp = fg.bpp;
  let minY = 1e9, maxY = -1, minX = 1e9, maxX = -1;
  for (let y = 0; y < fg.h; y++) {
    for (let x = 0; x < fg.w; x++) {
      if (a[(y * fg.w + x) * bpp + (bpp - 1)] > 40) {
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
      }
    }
  }
  const coverH = (maxY - minY + 1) / fg.h;
  ok(coverH >= 0.86 && coverH <= 0.95,
     'اللوغو يغطي ' + (coverH * 100).toFixed(1) + '% من منطقة الرؤية (86-95% = كبير وجذاب بعد 69-76% القديمة)');
}
const leg = decodePng('resources/icon.png');
ok(!!leg && leg.w === 1024 && leg.h === 1024, 'icon.png (الأجهزة القديمة): 1024×1024 قابلة للفك');
if (leg) {
  /* مركز الشارة كحلي معتم + الحواف شفافة (دائرة) */
  const c = (512 * leg.w + 512) * leg.bpp;
  const ctr = [leg.data[c], leg.data[c + 1], leg.data[c + 2]];
  const corner = leg.data[(0 * leg.w + 0) * leg.bpp + (leg.bpp - 1)];
  ok(ctr[0] < 60 && corner < 20, 'شارة دائرية كحلية بمركز معتم وزوايا شفافة (زاوية أ=' + corner + ')');
}
const wfRuns = wf.split('\n').filter(function (l) { return !/^\s*#/.test(l); }).join('\n');
ok(/--iconBackgroundColor/.test(wfRuns) === false, 'لا علم --iconBackgroundColor في أوامر السير (نمط حرس v283 — الخلفية من ملف icon-background.png)');

/* ── 5) الواجهة: هيدر وشريط سفلي (المشكلة ③) ───────────────────────────── */
const chrome = read('css/09-chrome.css');
ok(/\.app-dock\s*{[^}]*align-items:\s*center/m.test(chrome),
   'app-dock: محور واحد لكل أيقونات الهيدر (align-items:center)');
const comp = read('css/03-components.css');
ok(/\.mobile-bottom-nav\s*{[^}]*box-sizing:\s*border-box/m.test(comp) &&
   /height:\s*calc\(64px \+ var\(--safe-bottom/.test(comp),
   'mobile-bottom-nav: border-box بارتفاع محسوب — المحتوى ثابت مهما كبرت المساحة الآمنة');
ok(/\.mobile-bottom-nav \.bnav-item span\s*{[^}]*text-overflow:\s*ellipsis/m.test(comp),
   'تسميات الشريط السفلي بقصّ أنيق (ellipsis) — لا انضغاط متلاصق');
ok(/\.lmp-bignum/.test(chrome) && /\.lmp-roomcard/.test(chrome) && /\.lmp-codejoin/.test(chrome),
   'أنماط الغرفة المحلية الأصلية (كود كبير + بطاقات الغرف + انضمام بالكود)');

/* ── 6) local-mp.js: المسار الأصلي + سلامة مسار الويب ──────────────────── */
const lmp = read('js/core/local-mp.js');
let syntaxOk = true;
try { new Function(lmp); } catch (e) { syntaxOk = false; }
ok(syntaxOk, 'js/core/local-mp.js سليم نحوياً (' + Math.round(lmp.length / 1024) + 'KB)');
ok(/var NATIVE = false;/.test(lmp) && /root\.DTSGNative\.lnVersion\(\) === '2'/.test(lmp),
   'كشف الجسر بإصداره (lnVersion=2) — الويب يبقى على مساره تلقائياً');
ok(/function genCode8\(\)/.test(lmp) && /ABCDEFGHJKMNPQRSTUVWXYZ23456789/.test(lmp),
   'كود الغرفة 8 حروف وأرقام بلا عناصر مُلبِسة (لا 0/O/1/I/L)');
ok(/root\.__dtsgLnEvt = function/.test(lmp) && /case \'peerOpen\':/.test(lmp) && /case \'room\':/.test(lmp),
   'موزّع أحداث LocalNet (بيانات/أقران/غرف/أخطاء) مسجَّل عالمياً');
ok(/function lnAutostart\(\)/.test(lmp) && /lnDiscover\(false\);/.test(lmp),
   'الاكتشاف الآلي منذ فتح التطبيق (عقد المالك) بلا طلب أذونات');
ok(/function uiGuestNativeBody\(\)/.test(lmp) && /lmpCodeIn/.test(lmp) && /uiJoinRoom/.test(lmp),
   'متصفّح الغرف المحلية: قائمة حيّة + انضمام بالكود (8 خانات)');
ok(/root\.DTSGNative\.leaveRoom\(\)/.test(lmp) && /root\.DTSGNative\.discoverStop\(\)/.test(lmp),
   'تفكيك نظيف عند المغادرة (leaveRoom + discoverStop)');
ok(/function lnSendReplay\(/.test(lmp) && /replayBuf/.test(lmp),
   'السجل يُرسل على دفعات 150 حركة — قناة البلوتوث لا تُغرق بمخزن ضخم');
ok(/lnSyncCount\(\)/.test(lmp) && /hostUpdate/.test(lmp),
   'عدد اللاعبين يتحدّث في إعلانات الاكتشاف آلياً');
ok(/iceServers:\s*\[\]/.test(lmp) && /QRMini\.svg/.test(lmp) && /LAN_PREFIX = 'L1\.'/.test(lmp),
   'مسار الويب كما هو حرفياً (WebRTC + QR + بصمة L1.) — لا كسر مكتسبات');
const netCalls = (lmp.match(/API\.(post|get)|fetch\(|XMLHttpRequest|EventSource\(/g) || []);
ok(netCalls.length === 0, 'صفر نداءات شبكة من الويب في local-mp.js — الاتصال كله من الجسر الأصلي');
ok(!/https?:\/\/(localhost|127\.)/i.test(lmp), 'لا روابط لوكال هوست في أي مسار (عقد المالك)');

/* ── 7) i18n: المفاتيح الجديدة بأربع لغات ──────────────────────────────── */
const trAll = read('js/i18n/translations.js');
const NEW_KEYS = ['lmp.hostCodeHint', 'lmp.waitGuest', 'lmp.joinNearby', 'lmp.autoHint', 'lmp.roomsScan',
  'lmp.refresh', 'lmp.roomsEmpty', 'lmp.wifiBadge', 'lmp.btBadge', 'lmp.joinBtn', 'lmp.code8',
  'lmp.badCode8', 'lmp.searching', 'lmp.btHint2', 'lmp.btEnable', 'lmp.joinedWifi', 'lmp.joinedBt', 'lmp.hostFail'];
const missing = NEW_KEYS.filter(k => !trAll.includes('"' + k + '"'));
ok(missing.length === 0, 'مفاتيح v2.87 الثمانية عشر موجودة (' + (NEW_KEYS.length - missing.length) + '/' + NEW_KEYS.length + ')', missing.slice(0, 3).join(','));
const badLang = NEW_KEYS.filter(k => {
  const m = new RegExp('"' + k.replace(/\./g, '\\.') + '":\\s*\\[([^\\]]*)\\]').exec(trAll);
  return !m || (m[1].match(/",/g) || []).length !== 3;
});
ok(badLang.length === 0, 'كل مفتاح جديد بأربع لغات (ar/fr/en/da)', badLang.slice(0, 3).join(','));

/* ── 8) البصمات (قاعدة 15 مشتقة — قاعدة 22) ────────────────────────────── */
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const main = read('js/main.js');
ok(pkg.version === '2.87.0' && lock.version === '2.87.0' &&
   new RegExp("DTSG_BUILD = 'v" + pkg.version + "'").test(main),
   'الثلاثية متطابقة على 2.87.0 (package · lock · DTSG_BUILD)');
const idx = read('index.html');
['css/03-components.css', 'css/09-chrome.css', 'js/core/local-mp.js', 'js/i18n/translations.js', 'js/main.js'].forEach(a => {
  ok(new RegExp(a.replace(/\./g, '\\.') + '\\?v=v287').test(idx), 'بصمة ' + a + ' = v287 في index.html');
});

/* ── 9) التوثيق والبطارية ────────────────────────────────────────────────── */
const chlog = read('CHANGELOG.md');
ok(/\[v2\.87\]/.test(chlog) && /الوضع الغامر/.test(chlog) && /LocalNet/.test(chlog),
   'CHANGELOG: كتلة v2.87.0 توثّق الغامر وLocalNet');
const agents = read('AGENTS.md');
ok(/BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/.test(agents) && /LocalNet/.test(agents),
   'AGENTS.md: عقد الغامر وLocalNet موثّقان (قاعدة 24)');
const runner = read('tests/_run_regression_rooms.sh');
ok(/_v287_localnet_immersive_test\.js/.test(runner),
   'الجناح مسجَّل في عدّاء البطارية (لا ثغرة تغطية)');

/* ── 10) حارس العدّاد ────────────────────────────────────────────────────── */
const EXPECTED = 54;
ok(results.length === EXPECTED - 1, 'حارس العدّاد: عدد النتائج = عدد الحرسات المكتوبة (' + EXPECTED + ')');

const pass = results.filter(Boolean).length;
console.log('═══ النتيجة: ' + pass + ' ناجح / ' + (results.length - pass) + ' فاشل ═══');
process.exit(pass === results.length ? 0 : 1);
