/* ═══════════════════════════════════════════════════════════════════════════
   [v2.86] حرس ملء الشاشة الحقيقي — جملة التخطيط المفقودة (setDecorFitsSystemWindows)
   ───────────────────────────────────────────────────────────────────────────
   يثبّت درس بلاغ المالك 2026-10-06 («فراغ أسود أعلى وأسفل، الشكل مشوه»):
   شفافية شريطي النظام وحدها (v2.85) تركت إطار المحتوى محشوراً بينهما،
   فظهرت خلفية النافذة الفاتحة (Theme.AppCompat.DayNight بوضع النظام
   الفاتح) عبر الشريطين الشفافين — شريط أبيض أعلى (250,250,250) ورمادي
   (150,150,150 = سكرام 40% لأزرار التنقل) أسفل، والويب لا يمتد خلفهما.
   الجوهر الناقص أُضيف في خطوة 8.5 (نسختاها المتطابقتان — قاعدة 18):
     ① WindowCompat.setDecorFitsSystemWindows(w, false) — تمدّد إطار
        المحتوى (الويب) خلف الشريطين على كل الإصدارات (تُترجم تلقائياً
        إلى أعلام LAYOUT_STABLE|FULLSCREEN|HIDE_NAVIGATION قبل API 30).
     ② خلفية نافذة كحلية (ColorDrawable 0xFF0B1526) + خلفية WebView
        كحلية من backgroundColor في capacitor.config.json — لا وميض فاتح.
     ③ WindowInsetsControllerCompat.setAppearanceLight{Status,Navigation}Bars
        لأيقونات الشريطين (بديل AndroidX حديث لأعلام systemUiVisibility
        الخام التي كانت في v2.85 — 0x00002000/0x00000010 — وأُزيلت).
   والصفحة نفسها سليمة أصلاً: canvas الجسم كحلي يغطي الشاشة كاملة (تحقق
   ميداني بمحاكاة متصفح 1080×2400 مع --safe-top/--safe-bottom = 88/135px).
   تشغيل: node tests/_v286_e2e_layout_test.js   (بلا خادم — فحوص مصدر)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const results = [];
function ok(cond, label, detail) { results.push(!!cond); console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail ? ' — ' + detail : '')); }
function read(p) { return fs.readFileSync(path.join(ROOT, p)).toString('utf8'); }

/* ── 1) النسختان المتطابقتان + وجود الخطوة ─────────────────────────────── */
const wfLive = fs.readFileSync(path.join(ROOT, '.github/workflows/build-apk.yml'));
const wfDocs = fs.readFileSync(path.join(ROOT, 'docs/workflows/build-apk.yml'));
ok(wfLive.equals(wfDocs), 'سير البناء: النسختان متطابقتان بايت-ببايت (قاعدة 18)');
const wf = wfLive.toString('utf8');
ok(/Edge-to-edge fullscreen \+ native safe-area bridge/.test(wf),
   'خطوة 8.5 (ملء الشاشة + الجسر) موجودة في السير');
const cfgStep = wf.split('- name: Capacitor config + add android + sync')[1].split('- name:')[0];
ok(/backgroundColor/.test(cfgStep) && /#0b1526/.test(cfgStep),
   'capacitor.config.json يضبط backgroundColor كحلي (خلفية WebView قبل أول رسم)');

/* ── 2) جوهر v2.86: جملة التخطيط المفقودة ──────────────────────────────── */
ok(/WindowCompat\.setDecorFitsSystemWindows\(w, false\)/.test(wf),
   'MainActivity: WindowCompat.setDecorFitsSystemWindows(w, false) — إطار المحتوى خلف الشريطين (الجوهر)');
ok(/import androidx\.core\.view\.WindowCompat;/.test(wf) &&
   /import androidx\.core\.view\.WindowInsetsControllerCompat;/.test(wf) &&
   /import android\.graphics\.drawable\.ColorDrawable;/.test(wf),
   'استيرادات AndroidX (WindowCompat · WindowInsetsControllerCompat · ColorDrawable) موجودة');
ok(/w\.setBackgroundDrawable\(new ColorDrawable\(0xFF0B1526\)\)/.test(wf),
   'خلفية النافذة كحلية كهوية المنصة (#0b1526) — لا وميض فاتح خلف الشريطين');
ok(/"backgroundColor": "#0b1526"/.test(wf),
   'خلفية WebView كحلية من capacitor.config.json (Bridge يطبّقها)');

/* ── 3) أيقونات الشريطين عبر AndroidX (لا أعلام خام) ───────────────────── */
ok(/setAppearanceLightStatusBars\(barsLight\)/.test(wf) &&
   /setAppearanceLightNavigationBars\(barsLight\)/.test(wf) &&
   /WindowCompat\.getInsetsController\(w, w\.getDecorView\(\)\)/.test(wf),
   'أيقونات الشريطين عبر WindowInsetsControllerCompat (الحديث الشامل للإصدارات)');
ok(!/0x00002000/.test(wf) && !/0x00000010/.test(wf),
   'أعلام systemUiVisibility الخام (LIGHT_STATUS/NAV) أُزيلت — لا ازدواجية مع AndroidX');

/* ── 4) لا انحدار في عقد v2.85 (الشفافية + الجسر كما هما) ─────────────── */
ok(/android:statusBarColor">@android:color\/transparent/.test(wf) &&
   /android:navigationBarColor">@android:color\/transparent/.test(wf) &&
   /windowDrawsSystemBarBackgrounds">true/.test(wf) &&
   /windowLayoutInDisplayCutoutMode">shortEdges/.test(wf),
   'styles.xml: الشريطان شفافان + drawsSystemBarBackgrounds + shortEdges (عقد v2.85 محفوظ)');
ok(/addJavascriptInterface\(new NativeChrome\(\), "DTSGNative"\)/.test(wf) &&
   /getInsets\(\)/.test(wf) && /setBarsLight\(boolean light\)/.test(wf) &&
   /getStableInsetTop\(\)/.test(wf) && /Type\.systemBars\(\)/.test(wf),
   'جسر DTSGNative (getInsets systemBars حصراً + setBarsLight) كما هو');

/* ── 5) صياغة بايثون + بنية جافا المتولَّدة ─────────────────────────────── */
const heredoc = wf.split("<<'PY3'\n", 2)[1];
const rawBody = heredoc ? heredoc.split('\n          PY3', 1)[0] : '';
const pyBody = rawBody.split('\n').map(l => (l.startsWith('          ') ? l.slice(10) : l)).join('\n');
let pyOk = false, pyErr = '';
try {
  const { execFileSync } = require('child_process');
  const tmp = path.join(require('os').tmpdir(), 'dtsg-v286-step-check.py');
  fs.writeFileSync(tmp, pyBody, 'utf8');
  execFileSync('python3', ['-c', 'compile(open(' + JSON.stringify(tmp) + ', encoding="utf-8").read(), "step.py", "exec")'],
    { stdio: 'pipe', timeout: 20000 });
  pyOk = pyBody.length > 5000;
} catch (e) { pyErr = String(e.message || e); }
ok(pyOk, 'سكربت الحقن يُحلّ صياغياً ببايثون (هيريدوك PY3 كامل)', pyErr.slice(0, 60));
const javaSrc = pyBody.split("new = '''", 2)[1] || '';
const javaTxt = javaSrc.split("'''", 1)[0];
const braces = (javaTxt.match(/\{/g) || []).length - (javaTxt.match(/\}/g) || []).length;
ok(javaTxt.includes('public class MainActivity extends BridgeActivity') && braces === 0,
   'كود MainActivity المتولَّد سليم بنيوياً (امتداد BridgeActivity + أقواس متوازنة ' + braces + ')');
ok(/setDecorFitsSystemWindows/.test(javaTxt) && /0xFF0B1526/.test(javaTxt) &&
   /setAppearanceLightStatusBars/.test(javaTxt),
   'الكود المتولَّد نفسه يحمل إصلاحات v2.86 الثلاثة (تخطيط + خلفية + أيقونات)');

/* ── 6) الصفحة جاهزة أصلاً (لا تغيير ويب في هذه الجولة) ────────────────── */
const utils = read('js/core/utils.js');
ok(/function applyNativeInsets\(\)/.test(utils) && /'--safe-top'/.test(utils) && /'--safe-bottom'/.test(utils),
   'utils.js: جسر المساحات كما هو (الصفحة كانت جاهزة — العلة أصلية لا ويب)');
const cssBase = read('css/02-base.css');
ok(/min-height: 100vh/.test(cssBase) && /--bg/.test(cssBase),
   'الجسم يغطي الشاشة كاملة بخلفية الثيم (canvas كحلي/عاجي حسب الوضع)');

/* ── 7) الإصدار مشتق (قاعدة 22) ────────────────────────────────────────── */
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const main = read('js/main.js');
ok(lock.version === pkg.version &&
   new RegExp("DTSG_BUILD = 'v" + pkg.version.replace(/\./g, '\\.') + "';").test(main),
   'بصمة الإصدار الثلاثية متطابقة ومشتقّة (package · lock · DTSG_BUILD)');
const VCUR = 'v' + pkg.version.split('.').slice(0, 2).join('');
ok(new RegExp('js/main\\.js\\?v=' + VCUR + '"').test(read('index.html')),
   'بصمة main.js على الإصدار الحالي (' + VCUR + ')');

/* ── 8) التوثيق الحيّ ───────────────────────────────────────────────────── */
ok(/\[v2\.86/.test(read('CHANGELOG.md')) && /setDecorFitsSystemWindows/.test(read('CHANGELOG.md')),
   'CHANGELOG: كتلة v2.86 توثّق الجوهر (setDecorFitsSystemWindows) وسبب البلاغ');
ok(/setDecorFitsSystemWindows/.test(read('AGENTS.md')),
   'AGENTS.md: قاعدة 23 موسّعة بجملة التخطيط (عقد v2.86)');
ok(/setDecorFitsSystemWindows/.test(read('docs/APK_BUILD.md')),
   'APK_BUILD.md §2.3: درس v2.86 موثّق (شفافية بلا تخطيط لا تملأ الشاشة)');
ok(/_v286_e2e_layout_test\.js/.test(read('tests/_run_regression_rooms.sh')),
   'الجناح مسجَّل في البطارية (لا ثغرة تغطية — درس v2.81.4-audit)');

/* ── حارس العدّاد ───────────────────────────────────────────────────────── */
const EXPECTED = 23;
ok(results.length === EXPECTED - 1,
   'حارس العدّاد: عدد النتائج = عدد الحرسات المكتوبة (' + EXPECTED + ')');

const pass = results.filter(Boolean).length, fail = results.length - pass;
console.log('═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
process.exit(fail ? 1 : 0);
