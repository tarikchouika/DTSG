/* ═══════════════════════════════════════════════════════════════════════════
   [v2.85] حرسات كروم الأندرويد — مدخل الغرفة المحلية + ملء الشاشة 100%
   ───────────────────────────────────────────────────────────────────────────
   يثبّت عقدَي توجيه المالك 2026-10-06:
   أ) زر الواي فاي الصغير القاتم في شريط مودال الغرف أُزيل نهائياً، ومدخل
      اللعب المحلي صار محدّد نمط مقسّماً داخل نافذة إعدادات كل لعبة
      (خادمي/محلي) بحقن من local-mp.js — rooms.js لم يُمسّ (عقد قاعدة 20).
   ب) التطبيق يملأ الشاشة 100%: سير البناء (نسختاه المتطابقتان) يجعل شريطي
      النظام شفافين (edge-to-edge + shortEdges) ويحقن MainActivity جسر
      DTSGNative (getInsets بصيغة top|bottom + setBarsLight يتبع الثيم)،
      وutils.js يسحب المساحات إلى --safe-top/--safe-bottom وكل CSS
      الموحّد يستعمل المتغيرين.
   تشغيل: node tests/_v285_native_chrome_test.js   (بلا خادم — فحوص مصدر)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const results = [];
function ok(cond, label, detail) { results.push(!!cond); console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail ? ' — ' + detail : '')); }
function read(p) { return fs.readFileSync(path.join(ROOT, p)).toString('utf8'); }

/* ── 1) الوحدة: إزالة الزر القاتم + محدّد النمط ─────────────────────────── */
const lmp = read('js/core/local-mp.js');
new Function(lmp);
ok(!/lmpEntryBtn/.test(lmp) && !/function injectEntry\(/.test(lmp),
   'زر الواي فاي الصغير أُزيل نهائياً (injectEntry/lmpEntryBtn غائبان)');
ok(/function injectRoomMode\(/.test(lmp) && /rsModeBar/.test(lmp),
   'محدّد نمط الغرفة يُحقن في نافذة إعدادات كل لعبة (injectRoomMode + rsModeBar)');
ok(/LocalMP\.rsPickMode/.test(lmp) && /LocalMP\.rsStartLocal/.test(lmp),
   'واجهتا المحدّد عامتان (rsPickMode + rsStartLocal)');
ok(/hostRoom: function \(gameId, opts\)/.test(lmp) && /S\.room\.game_opts = opts/.test(lmp),
   'hostRoom يستقبل إعدادات اللعبة ويخزّنها في game_opts (تُطبّق على كل الأطراف)');
ok(/_collectGameOpts\(gid\)/.test(lmp),
   'البدء المحلي يجمع إعدادات اللعبة من نافذة الإعدادات نفسها (_collectGameOpts)');
ok(/stopImmediatePropagation/.test(lmp) && /addEventListener\('click'[\s\S]{1,400}?, true\)/.test(lmp),
   'التقاط زر الإنشاء في طور الالتقاط قبل معالج rooms.js (بلا تعديل rooms.js)');
ok(/gid === 'arb'/.test(lmp) && /roomLive/.test(lmp),
   'التحكيم وغرفة قائمة: المحدّد يختفي (خادمي حصراً — عقد مال التحكيم)');

/* ── 1-ب) الترميز المضغوط + إصلاح QR الكامن (كشفه تحقق v2.85) ───────────── */
ok(!/JSON\.stringify\(payload\)/.test(lmp) && /parts\.join\('\|'\)/.test(lmp),
   'packCode ترميز مضغوط مفصول (لا JSON — رمز جلسة ≤ سعة QRMini)');
ok(/slice\(0, 2\)/.test(lmp) && /مرشحان يكفيان/.test(lmp),
   'مرشحو LAN محدودون بمرشحين (حجم الرمز تحت 271)');
ok(/function qrBlock\(/.test(lmp) && /lmp\.tooLong/.test(lmp),
   'احتياط صريح إن تجاوز الرمز سعة QR (لا حجب صامتاً بعد اليوم)');
ok(/uiRefresh\(\);\s*\n\s*return pair;/.test(lmp),
   'رمز المضيف يُرسم فور جاهزيته (uiRefresh بعد ضبط pendingPair — خلل كامن أُصلح)');
const trAll = read('js/i18n/translations.js');
ok(/"lmp\.tooLong":/.test(trAll), 'مفتاح lmp.tooLong موجود ×4 لغات');

/* ── 2) rooms.js ما زالت نظيفة (دفاع ثانٍ مع حارس v283) ────────────────── */
const rooms = read('js/core/rooms.js');
ok(!/LocalMP|local-mp|lmp/i.test(rooms), 'rooms.js بلا أي أثر للغرفة المحلية (عقد قاعدة 20 سليم)');

/* ── 3) i18n: مفاتيح محدّد النمط ×4 لغات ────────────────────────────────── */
const tr = read('js/i18n/translations.js');
const NEW_KEYS = ['lmp.modeLabel', 'lmp.modeServer', 'lmp.modeLocal', 'lmp.openLocal',
  'lmp.joinByCode', 'lmp.localNote', 'lmp.needGame'];
const missing = NEW_KEYS.filter(k => !new RegExp('"' + k.replace('.', '\\.') + '"').test(tr));
ok(missing.length === 0, 'مفاتيح v285 السبعة موجودة', missing.join(','));
const badLang = NEW_KEYS.filter(k => {
  const m = new RegExp('"' + k.replace('.', '\\.') + '":\\s*\\[(.+?)\\]').exec(tr);
  return m ? (m[1].split('",').length < 4 ? k : null) : k;
}).filter(Boolean);
ok(badLang.length === 0, 'كل مفتاح جديد بأربع لغات (ar/fr/en/da)', badLang.join(','));

/* ── 4) CSS: محدّد النمط + إعادة تصميم اللوبي + توحيد المساحات الآمنة ──── */
const css = read('css/09-chrome.css');
ok(/\.rs-modebar/.test(css) && /\.rs-mode\.active/.test(css) && /\.rs-localnote/.test(css),
   'أنماط محدّد النمط (modebar/active/localnote) في 09-chrome.css');
ok(/\.lmp-step-n/.test(css) && /\.lmp-pill/.test(css) && /\.lmp-pl\b/.test(css),
   'إعادة تصميم اللوبي المحلي (بطاقات خطوات + شرائح حالة + رقائق لاعبين)');
ok(/#rsSave\.lmp-save/.test(css), 'زر الإنشاء في الوضع المحلي بهوية ذهبية مميزة');
/* توحيد المساحات الآمنة: لا env() مباشرة خارج احتياط المتغيرات */
const cssFiles = ['css/09-chrome.css', 'css/03-components.css', 'css/04-games.css',
  'css/14-ronda-classic.css', 'css/16-penalty.css', 'css/07-responsive.css', 'css/02-base.css'];
const bareEnv = [];
for (const f of cssFiles) {
  const t = read(f);
  const re = /env\(safe-area-inset-(top|bottom)[^)]*\)/g;
  let m;
  while ((m = re.exec(t))) {
    const line = t.slice(t.lastIndexOf('\n', m.index) + 1, t.indexOf('\n', m.index));
    if (!/var\(--safe-(top|bottom),\s*$/.test(line.replace(m[0], '')) &&
        !/var\(--safe-(top|bottom),\s*env\(safe-area-inset/.test(line)) {
      bareEnv.push(f + ': ' + line.trim().slice(0, 48));
    }
  }
}
ok(bareEnv.length === 0, 'كل مساحات top/bottom تمرّ عبر --safe-top/--safe-bottom (قابلة للتجاوز الأصلي)', bareEnv[0]);

/* ── 5) جسر utils.js ────────────────────────────────────────────────────── */
const utils = read('js/core/utils.js');
ok(/function applyNativeInsets\(\)/.test(utils) && /DTSGNative/.test(utils) && /getInsets/.test(utils),
   'utils.js: جسر السحب applyNativeInsets (DTSGNative.getInsets)');
ok(/'--safe-top'/.test(utils) && /'--safe-bottom'/.test(utils) && /split\('\|'\)/.test(utils),
   'صيغة الجسر top|bottom تُحلّ إلى المتغيرين --safe-top/--safe-bottom');
ok(/updateNativeBars\(radiant\)/.test(utils) && /setBarsLight/.test(utils),
   'updateThemeIcon يتبع الثيم لأيقونات شريطي النظام (setBarsLight)');
ok(/resize/.test(utils) && /orientationchange/.test(utils) && /visibilitychange/.test(utils),
   'إعادة السحب عند resize/orientationchange/visibilitychange');

/* ── 6) سير البناء (نسختاه): ملء الشاشة + الجسر ────────────────────────── */
const wfLive = fs.readFileSync(path.join(ROOT, '.github/workflows/build-apk.yml'));
const wfDocs = fs.readFileSync(path.join(ROOT, 'docs/workflows/build-apk.yml'));
ok(wfLive.equals(wfDocs), 'سير البناء: النسختان متطابقتان بايت-ببايت (قاعدة 18)');
const wf = wfLive.toString('utf8');
ok(/Edge-to-edge fullscreen \+ native safe-area bridge/.test(wf),
   'خطوة ملء الشاشة موجودة في السير');
ok(wf.indexOf('Edge-to-edge fullscreen') > wf.indexOf('Inject CAMERA permission') &&
   wf.indexOf('Edge-to-edge fullscreen') < wf.indexOf('Setup Java 17 (Temurin)'),
   'الخطوة بعد حقن الكاميرا وقبل Gradle (تعدّل المشروع المولَّد قبل البناء)');
ok(/android:statusBarColor">@android:color\/transparent/.test(wf) &&
   /android:navigationBarColor">@android:color\/transparent/.test(wf) &&
   /windowDrawsSystemBarBackgrounds">true/.test(wf) &&
   /windowLayoutInDisplayCutoutMode">shortEdges/.test(wf),
   'styles.xml: الشريطان شفافان + drawsSystemBarBackgrounds + shortEdges');
ok(/addJavascriptInterface\(new NativeChrome\(\), "DTSGNative"\)/.test(wf) &&
   /@android\.webkit\.JavascriptInterface/.test(wf) &&
   /getInsets\(\)/.test(wf) && /setBarsLight\(boolean light\)/.test(wf),
   'MainActivity: جسر DTSGNative (addJavascriptInterface + getInsets + setBarsLight)');
ok(/getStableInsetTop\(\)/.test(wf) && /Type\.systemBars\(\)/.test(wf),
   'المساحات من systemBars حصراً (stable قبل API 30 — بلا IME)');
ok(/evaluateJavascript\(js, null\)/.test(wf),
   'دفع المساحات للصفحة من جافا عند كل تغيّر (evaluateJavascript)');
ok(/setOnApplyWindowInsetsListener/.test(wf) && /onResume\(\)/.test(wf),
   'مستمع التغيّرات + إعادة الضبط في onResume');
/* [درس بناء #14] BridgeActivity.onResume عامة — التجاوز المحمي = صلاحية أضعف فتنهار الترجمة */
ok(/public void onResume\(\)/.test(wf) && !/protected void onResume\(\)/.test(wf),
   'تجاوز onResume عام مثل الأصل (وإلا: attempting to assign weaker access privileges)');
/* صياغة بايثون الخطوة سليمة (استخراج الهيريدوك وإزالة إزاحة YAML ثم تحليله ببايثون) */
const heredoc = wf.split("<<'PY3'\n", 2)[1];
const rawBody = heredoc ? heredoc.split('\n          PY3', 1)[0] : '';
/* الملف الخام يحمل إزاحة كتلة YAML (10 مسافات) على كل سطر — تُزال قبل التحليل */
const pyBody = rawBody.split('\n').map(l => (l.startsWith('          ') ? l.slice(10) : l)).join('\n');
let pyOk = false, pyErr = '';
try {
  const { execFileSync } = require('child_process');
  const tmp = path.join(require('os').tmpdir(), 'dtsg-edge-step-check.py');
  fs.writeFileSync(tmp, pyBody, 'utf8');
  execFileSync('python3', ['-c', 'compile(open(' + JSON.stringify(tmp) + ', encoding="utf-8").read(), "step.py", "exec")'],
    { stdio: 'pipe', timeout: 20000 });
  pyOk = pyBody.length > 500;
} catch (e) { pyErr = String(e.message || e); }
ok(pyOk, 'سكربت الحقن يُحلّ صياغياً ببايثون (هيريدوك PY3 كامل)', pyErr.slice(0, 60));
/* جافا المولَّدة: أقواس متوازنة + الصنف يمتد BridgeActivity */
const javaSrc = pyBody.split("new = '''", 2)[1] || '';
const javaTxt = javaSrc.split("'''", 1)[0];
const braces = (javaTxt.match(/\{/g) || []).length - (javaTxt.match(/\}/g) || []).length;
ok(javaTxt.includes('public class MainActivity extends BridgeActivity') && braces === 0,
   'كود MainActivity المتولَّد سليم بنيوياً (امتداد BridgeActivity + أقواس متوازنة ' + braces + ')');

/* ── 7) بصمات قاعدة 15 لهذه الجولة ─────────────────────────────────────── */
const idx = read('index.html');
const v285 = ['css/09-chrome.css', 'css/03-components.css', 'css/04-games.css',
  'css/14-ronda-classic.css', 'css/16-penalty.css', 'css/07-responsive.css',
  'js/core/utils.js', 'js/i18n/translations.js', 'js/core/local-mp.js', 'js/main.js'];
const stale = v285.filter(f => !new RegExp(f.replace('.', '\\.') + '\\?v=v285"').test(idx));
ok(stale.length === 0, 'بصمات v285 للعشرة المعدَّلة في index.html', stale.join(', '));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const main = read('js/main.js');
ok(pkg.version === '2.85.0' && lock.version === '2.85.0' && /DTSG_BUILD = 'v2\.85\.0'/.test(main),
   'بصمة الإصدار الثلاثية 2.85.0 (package · lock · DTSG_BUILD)');
ok(/rs-save-label/.test(idx), 'تسمية زر الإنشاء صنف rs-save-label (يتبدّل نصه في الوضع المحلي)');

/* ── 8) التوثيق ─────────────────────────────────────────────────────────── */
const chlog = read('CHANGELOG.md');
ok(/\[v2\.85/.test(chlog) && /ملء الشاشة 100%/.test(chlog),
   'CHANGELOG: كتلة v2.85 توثّق ملء الشاشة ومدخل الغرفة المحلية');
const agents = read('AGENTS.md');
ok(/edge-to-edge/.test(agents) && /DTSGNative/.test(agents),
   'AGENTS.md: عقد ملء الشاشة والجسر موثّق');

/* ── حارس العدّاد ───────────────────────────────────────────────────────── */
const EXPECTED = 40;
ok(results.length === EXPECTED - 1,
   'حارس العدّاد: عدد النتائج = عدد الحرسات المكتوبة (' + EXPECTED + ')');

const pass = results.filter(Boolean).length, fail = results.length - pass;
console.log('═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
process.exit(fail ? 1 : 0);
