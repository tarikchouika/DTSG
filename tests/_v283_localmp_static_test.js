/* ═══════════════════════════════════════════════════════════════════════════
   [v2.83] حارس الغرفة المحلية (LocalMP) — عقد الميزة ساكناً
   ───────────────────────────────────────────────────────────────────────────
   يثبت: وجود الوحدة وتحميلها بعد rooms.js، صفر جراحة في rooms.js (التغليف
   لا التعديل)، حرس الهوية المحلية في auth.js (لا يمحوها 401 ولا مزامنة)،
   مفاتيح i18n ×4، الأنماط، إذن الكاميرا في سير البناء بنسختيه المتطابقتين،
   سياسة camera=(self)، لا نداءات شبكة داخل الوحدة (بلا إنترنت فعلاً)،
   وبصمات الإصدار للأصول المعدَّلة (قاعدة 15).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const results = [];
function ok(cond, label, detail) { results.push(!!cond); console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail ? ' — ' + detail : '')); }
function read(p) { return fs.readFileSync(path.join(ROOT, p)).toString('utf8'); }
const LB = '\u200e', RB = '\u200e';

/* ── 1) الوحدة والتحميل ── */
const lmp = read('js/core/local-mp.js');
ok(lmp.length > 8000, 'js/core/local-mp.js موجود ومكتمل (' + Math.round(lmp.length / 1024) + 'KB)');
new Function(lmp);  /* تحليل صياغي */
ok(true, 'الصياغة سليمة (Function parse)');
ok(/iceServers:\s*\[\]/.test(lmp), 'WebRTC بلا خادم ICE (iceServers فارغة — LAN/بلوتوث مباشر)');
ok(/LAN_PREFIX = 'L1\.'/.test(lmp), 'بادئة البصمة المضغوطة L1. (حجم QR)');
ok(/QRMini\.svg/.test(lmp), 'عرض الرمز عبر QRMini المحلي');
ok(/jsQR\.js/.test(lmp), 'فك الرمز عبر jsQR المحلي (تحميل عند الطلب)');

/* ── 2) صفر جراحة في rooms.js — عقد التغليف ── */
const rooms = read('js/core/rooms.js');
ok(!/LocalMP|local-mp|lmp/i.test(rooms), 'rooms.js بلا أي أثر للغرفة المحلية (تغليف خارجي — لا تعديل)');
const idx = read('index.html');
/* [v2.85] البصمة مشتقة من الإصدار لا مثبّتة على v283 — القاعدة 15 تفرض
   رفعها مع كل تعديل فتثبيتها كان يفشل مع كل إصدار جديد (موروث من v2.84). */
const PKG_V = JSON.parse(read('package.json')).version;
const CUR_V = 'v' + PKG_V.split('.').slice(0, 2).join('');
const vNum = (m) => parseInt((m && m[1] || '0').replace(/^v/, ''), 10) || 0;
const lmpM = /js\/core\/local-mp\.js\?v=(v\d+)/.exec(idx);
const roomsM = /js\/core\/rooms\.js\?v=(v\d+|\w+)/.exec(idx);
ok(!!lmpM && vNum(lmpM) >= 283 &&
   idx.indexOf('local-mp.js') > idx.indexOf('rooms.js'),
   'index.html يحمّل local-mp.js?v=' + (lmpM ? lmpM[1] : '—') + ' بعد rooms.js (بصمة ≥ v283 — قاعدة 15)');

/* ── 3) حرس الهوية المحلية في auth.js ── */
const auth = read('js/core/auth.js');
ok(/if \(AUTH\.user && !AUTH\.user\.local\)/.test(auth), 'authHandle401 لا يمحو الهوية المحلية (وإلا انهارت الغرفة عند أول 401)');
ok(/if \(AUTH\.user\.local\) return;/.test(auth), 'authSync يتخطى الهوية المحلية (لا مزامنة خادم بلا جلسة)');

/* ── 4) i18n ×4 لغات ── */
const tr = read('js/i18n/translations.js');
const lmpKeys = (tr.match(/"lmp\.[a-zA-Z0-9]+"/g) || []);
ok(lmpKeys.length >= 32, 'مفاتيح lmp.* في الترجمات (' + lmpKeys.length + ' مفتاحاً ≥ 32)');
const badLang = lmpKeys.map(k => {
  const m = new RegExp(k.replace('.', '\\.') + ':\\s*\\[(.+?)\\]').exec(tr);
  return m ? (m[1].split('",').length < 4 ? k : null) : k;
}).filter(Boolean);
ok(badLang.length === 0, 'كل مفتاح lmp بأربع لغات (ar/fr/en/da)', badLang.slice(0, 3).join(','));

/* ── 5) الأنماط ── */
const css = read('css/09-chrome.css');
ok(/\.modal-lmp/.test(css) && /\.lmp-qr/.test(css) && /video\.lmp-scanvid/.test(css), 'أنماط الغرفة المحلية في 09-chrome.css (لوبي/رمز/ماسح)');

/* ── 6) سير البناء: إذن الكاميرا + النسختان ── */
const wfLive = fs.readFileSync(path.join(ROOT, '.github/workflows/build-apk.yml'));
const wfDocs = fs.readFileSync(path.join(ROOT, 'docs/workflows/build-apk.yml'));
ok(wfLive.equals(wfDocs), 'سير البناء: النسختان متطابقتان بايت-ببايت');
const wf = wfLive.toString('utf8');
ok(/Inject CAMERA permission for local-room QR scanning/.test(wf) &&
   wf.indexOf('Inject CAMERA permission') < wf.indexOf('Setup Java 17'),
   'خطوة حقن إذن الكاميرا قبل Gradle (ماسح QR داخل التطبيق)');
ok(/android\.permission\.CAMERA/.test(wf), 'الحقن يضيف CAMERA بمرساة INTERNET وفشل صريح');
/* عقد بلا حاوية: العلم ممنوع في أوامر التشغيل (التعليقات التوثيقية تذكره تاريخياً — يجوز) */
const wfRuns = wf.split('\n').filter(function (l) { return !/^\s*#/.test(l); }).join('\n');
ok(!wfRuns.includes('--iconBackgroundColor'), 'لا لون خلفية للأيقونة في أوامر السير (عقد v2.83 بلا حاوية)');

/* ── 7) سياسة الكاميرا على الموقع ── */
ok(/camera=\(self\)/.test(read('_headers')), '_headers: camera=(self) — مسح QR من نفس الأصل حصراً');
ok(/camera=\(self\)/.test(read('vercel.json')), 'vercel.json: camera=(self)');

/* ── 8) لا شبكة داخل الوحدة — بلا إنترنت فعلاً ── */
const netCalls = (lmp.match(/API\.(post|get)|fetch\(|XMLHttpRequest|EventSource\(/g) || []);
ok(netCalls.length === 0, 'صفر نداءات شبكة في local-mp.js (لعب محلي فعلي بلا خادم)', netCalls.slice(0, 3).join(','));

/* ── 9) jsQR محلي بلا CDN ── */
ok(fs.existsSync(path.join(ROOT, 'js/vendor/jsQR.js')), 'jsQR مُستضاف محلياً (لا CDN — قاعدة CSP)');
ok(!/https?:\/\/[^"']*(jsqr|jsQR)/i.test(lmp), 'لا مرجع خارجي لمكتبة فك الرموز');

/* ── 10) بصمات الأصول المعدَّلة (قاعدة 15) ── */
const assetV = (f) => vNum(new RegExp(f.replace('.', '\\.') + '\\?v=(v\\d+)').exec(idx));
ok(assetV('baloot-game/js/ui/baloot-app.js') >= 283 && assetV('js/core/auth.js') >= 283 &&
   assetV('css/09-chrome.css') >= 283 && assetV('js/i18n/translations.js') >= 283,
   'بصمات الأصول الأربعة ≥ v283 (baloot-app ' + assetV('baloot-game/js/ui/baloot-app.js') +
   ' · auth ' + assetV('js/core/auth.js') + ' · chrome ' + assetV('css/09-chrome.css') +
   ' · translations ' + assetV('js/i18n/translations.js') + ')');

/* ── 11) البصمة الكاملة للإصدار (القاعدة 15: الثلاثة معاً — مشتقة لا مثبّتة) ── */
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const main = read('js/main.js');
ok(pkg.version === lock.version && new RegExp("DTSG_BUILD = 'v" + pkg.version + "'").test(main),
   'بصمة الإصدار الثلاثية ' + pkg.version + ' (package · lock · DTSG_BUILD)');

/* ── 12) عقد الدلالة: الطبقات الثلاث للمرشحين والمرآة ── */
ok(/① IPv4 خاص/.test(lmp) && /② mDNS/.test(lmp) && /③ أي مرشح مضيف/.test(lmp), 'مرشحو الاتصال بثلاث طبقات (خاص → mDNS → أي مضيف)');
ok(/مرآة الغرفة عند الضيف/.test(lmp), 'مرآة الغرفة عند الضيف (S.room) — وإلا مرّت النداءات للخادم');
ok(/_netEmit\('next', \{ round: doneRound \}\)/.test(read('baloot-game/js/ui/baloot-app.js')), 'إصلاح مزامنة الجولة التالية حاضر (بثّ next عند اكتمال التصويت)');

/* ── حارس العدّاد ── */
const EXPECTED = 28;
ok(results.length === EXPECTED - 1, 'حارس العدّاد: عدد النتائج = عدد الحرسات المكتوبة (' + EXPECTED + ')');

const pass = results.filter(Boolean).length, fail = results.length - pass;
console.log('═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
process.exit(fail ? 1 : 0);
