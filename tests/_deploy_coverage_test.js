/* ═══ [v2.65.1-DEPLOY-GUARD] حارس تغطية النشر — منع تكرار حادثة أونو/البلوت ═══
   الحادثة المرجعية (2026-09-28): scripts/deploy-pages.sh كان ينسخ js/css/assets
   + ثلاثة مجلدات ألعاب مستقلة فقط، بينما أُدمجت أونو (uno-game) والبلوت
   (baloot-game) لاحقاً دون تحديث سطر النسخ ⇒ النشر على Cloudflare Pages بلا
   المجلدين ⇒ Pages تخدم index.html بدل ملفات JS (200 + text/html + etag
   المطابق لـ index.html) ⇒ اللعبتان معطلتان على dtsg.pages.dev بينما
   Vercel (نشر المستودع كاملاً) يعمل بلا مشاكل.

   ما يتحقق منه هذا الاختبار (ثابت، بلا متصفح):
     1) كل مجلد علوي يُشار إليه من صفحات HTML المنشورة يجب أن يكون في سطر
        «cp -r» في scripts/deploy-pages.sh وفي deploy-clean.sh
        وفي scripts/prepare-www.sh (بناء APK — نسيانها يُنتج APK ناقصاً بلا إنذار).
     2) لا مجلد منسوخ غير موجود أصلاً في المستودع (حماية من الأخطاء المطبعية).
     3) قواعد تقليم الملفات التطويرية (tests/README/INTEGRATION/QA index.html)
        موجودة لكل مجلد لعبة مستقلة.
     4) كل ملف JS/CSS يُشار إليه من index.html داخل مجلدات الألعاب المستقلة
        موجود فعلاً في المستودع (منع مراجع إلى ملفات غير موجودة).

   التشغيل: node tests/_deploy_coverage_test.js
   ═════════════════════════════════════════════════════════════════════ */
process.chdir(require('path').resolve(__dirname, '..'));
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

/* صفحات HTML التي ينشرها deploy-pages.sh (نفس القائمة في السكربت) */
const DEPLOYED_HTML = [
  'index.html', 'admins.html', 'about.html', 'contact.html', '2fa.html',
  'fairness.html', 'privacy.html', 'terms.html', 'refund-policy.html', 'support.html'
].filter(f => fs.existsSync(f));

/* ── 1) استخراج المجلدات العلوية المرجَعة من الصفحات المنشورة ── */
const REF_RE = /(?:src|href|poster)\s*=\s*["']([^"']+)["']/g;
const refTopFolders = new Set();
const gameFileRefs = [];
for (const page of DEPLOYED_HTML) {
  const html = fs.readFileSync(page, 'utf8');
  let m;
  while ((m = REF_RE.exec(html)) !== null) {
    const u = m[1].trim();
    if (/^(?:[a-z]+:)?\/\/|^(?:#|data:|blob:|mailto:|tel:)/i.test(u)) continue; /* خارجي/مخطط */
    const clean = u.split(/[?#]/)[0];
    if (!clean || clean === '/') continue;
    const top = clean.replace(/^\.\//, '').split('/')[0];
    if (!top || top === 'index.html' || top.includes('.')) continue; /* ملف جذر، لا مجلد */
    if (!fs.existsSync(top)) { bad(`${page} يُشير إلى مجلد غير موجود: ${top}/ (${clean})`); continue; }
    refTopFolders.add(top);
    if (/^[a-z-]+-game$/.test(top) && /\.(js|css)$/i.test(clean)) gameFileRefs.push({ page, clean });
  }
}
const refList = Array.from(refTopFolders).sort();
ok(`صفحات HTML المنشورة تشير إلى ${refList.length} مجلدات علوية: ${refList.join(', ')}`);

/* ── 2) فحص تغطية سكربتي النشر ── */
function cpFolders(scriptPath) {
  const txt = fs.readFileSync(scriptPath, 'utf8');
  const lines = txt.split('\n').map(l => l.trim());
  const cpLines = lines.filter(l => /^cp\s+-r\s+/.test(l));
  if (!cpLines.length) return null;
  const folders = new Set();
  for (const l of cpLines) {
    const parts = l.split(/\s+/).slice(2);           /* بعد cp -r */
    for (const p of parts) {
      if (p.includes('$')) continue;                        /* متغير شل (وجهة النسخ) */
      const name = p.replace(/["']/g, '').replace(/\/$/, '');
      if (!name || name.includes('/')) continue;
      folders.add(name);
    }
  }
  return folders;
}

/* [v2.81] الموقع الثالث لنسخ المجلدات: scripts/prepare-www.sh (تطبيق Capacitor).
   نسيانه يعني APK ناقص المجلد بلا أي إنذار — نفس صنف حادثة أونو/البلوت. */
for (const script of ['scripts/deploy-pages.sh', 'deploy-clean.sh', 'scripts/prepare-www.sh']) {
  const copied = cpFolders(script);
  if (!copied) { bad(`${script}: لا يوجد سطر cp -r صالح للتحليل`); continue; }
  const missing = refList.filter(f => !copied.has(f));
  const ghosts = Array.from(copied).filter(f => !fs.existsSync(f));
  if (missing.length === 0) ok(`${script}: يغطي كل المجلدات المرجَعة (${Array.from(copied).sort().join(', ')})`);
  else bad(`${script}: مجلدات مرجَعة من HTML وغير منسوخة → ${missing.join(', ')}`);
  if (ghosts.length === 0) ok(`${script}: لا مجلدات منسوخة وهمية`);
  else bad(`${script}: مجلدات في سطر النسخ غير موجودة بالمستودع → ${ghosts.join(', ')}`);
}

/* ── 3) قواعد التقليم لكل مجلد لعبة مستقلة ── */
const pagesSh = fs.readFileSync('scripts/deploy-pages.sh', 'utf8');
const GAME_DIRS = fs.readdirSync('.').filter(d => /^[a-z-]+-game$/.test(d) && fs.statSync(d).isDirectory() && fs.existsSync(path.join(d, 'tests')));
for (const gd of GAME_DIRS) {
  if (pagesSh.includes(`"$OUT"/${gd}/tests`)) ok(`تقليم tests موجود لـ ${gd}/`);
  else bad(`deploy-pages.sh: لا قاعدة تقليم لـ ${gd}/tests`);
}
if (pagesSh.includes('"$OUT"/uno-game/INTEGRATION.md') && pagesSh.includes('"$OUT"/baloot-game/INTEGRATION.md'))
  ok('تقليم وثائق الدمج (INTEGRATION.md) موجود لأونو والبلوت');
else bad('deploy-pages.sh: نقص تقليم INTEGRATION.md لأونو/البلوت');

/* ── 4) كل ملف لعبة مُشار من index.html موجود فعلاً ── */
let ghostRefs = 0;
for (const r of gameFileRefs) {
  if (!fs.existsSync(r.clean)) { ghostRefs++; bad(`${r.page} يُشير لملف غير موجود: ${r.clean}`); }
}
if (ghostRefs === 0) ok(`كل ملفات الألعاب المستقلة المُشار إليها موجودة (${gameFileRefs.length} ملفاً من index.html)`);

/* ── 5) جسور التكامل الحيوية موجودة ── */
for (const b of ['uno-game/uno-bridge.js', 'baloot-game/baloot-bridge.js',
                 'backgammon-game/backgammon-bridge.js', 'dominoes-game/dominoes-bridge.js']) {
  if (fs.existsSync(b)) ok(`جسر التكامل موجود: ${b}`);
  else bad(`جسر التكامل مفقود: ${b}`);
}

/* ── 6) [v2.68.1] فخّ "HTML بدل الملفات" مُغلق ──
   Pages يخدم index.html بـ 200 + text/html لأي مسار غير مرفوع، فيتحوّل أي ملف
   JS ناقص من سطر النسخ إلى خطأ تحليل صامت (نفس جذر حادثة أونو/البلوت).
   الإغلاق: صفحة 404.html تُنشر + قواعد 404 صريحة في _redirects لكل مجلد
   خادمي + قاعدة شاملة. */
{
  if (fs.existsSync('404.html')) ok('صفحة 404.html موجودة');
  else bad('صفحة 404.html مفقودة — قواعد 404 ستخدم ملفاً غير موجود');

  const sh = fs.readFileSync('scripts/deploy-pages.sh', 'utf8');
  if (/\b404\.html\b/.test(sh)) ok('deploy-pages.sh ينشر 404.html');
  else bad('deploy-pages.sh لا ينشر 404.html — لن تعمل قواعد 404 على Pages');

  const rd = fs.readFileSync('_redirects', 'utf8');
  const DENY_FOLDERS = ['games', 'rooms', 'cf-worker', 'scripts', 'tests', 'data',
                        'node_modules', 'backups', 'logs', 'telegram-voucher-bot', 'docs', 'download'];
  let missing = DENY_FOLDERS.filter(f => !new RegExp(`^/${f}/\\*\\s+/404\\.html\\s+404`, 'm').test(rd));
  if (missing.length === 0) ok(`قواعد 404 صريحة لكل المجلدات الخادمية (${DENY_FOLDERS.length})`);
  else bad(`قواعد 404 ناقصة في _redirects: ${missing.join(', ')}`);

  /* [v2.68.1] تغطية كاملة: كل مدخل في جذر المستودع لا يُنشر يجب أن له قاعدة 404،
     وإلا خدمه Pages بـ index.html (200 + text/html) — نفس جذر حادثة v2.65.1. */
  const shSrc = fs.readFileSync('scripts/deploy-pages.sh', 'utf8');
  const cpDir = (shSrc.match(/cp -r ([^\n"]+)/) || [, ''])[1].split(/\s+/).filter(Boolean);
  /* كل حلقات النسخ في السكربت (for f in … / for g in …) — لا الأولى فقط */
  const loopFiles = (shSrc.match(/for \w+ in [^;]+; do/g) || [])
    .flatMap(s => (s.match(/[\w.*-]+/g) || []))
    .filter(f => f && !f.endsWith('.') && f !== 'in' && f !== 'f' && f !== 'g');
  const deployed = new Set([...cpDir, ...loopFiles]);
  /* [v2.81] مخرجات بناء محلية تُنشأ بـscripts/prepare-www.sh وبناء Android
     (مستثنية من git ولا تُنشر إلى Pages) — تجاهُلها يمنع إيجابيات كاذبة. */
  const IGNORE = new Set(['.git', '.gitattributes', '.gitignore', '.dockerignore', '.env', '.env.local', '.wrangler',
                         'www', 'android', '.gradle']);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const uncovered = fs.readdirSync('.').filter(e => {
    if (IGNORE.has(e) || deployed.has(e)) return false;
    const isDir = fs.statSync(e).isDirectory();
    const re = isDir ? new RegExp(`^/${esc(e)}/\\*\\s+/404\\.html\\s+404`, 'm')
                      : new RegExp(`^/${esc(e)}\\s+/404\\.html\\s+404`, 'm');
    return !re.test(rd);
  });
  if (uncovered.length === 0) ok('كل مدخل غير منشور في جذر المستودع محجوب بقاعدة 404');
  else bad(`مداخل غير منشورة بلا قاعدة 404 (تُخدَم index.html): ${uncovered.join(', ')}`);

  /* [v2.68.1] القاعدة الشاملة /* ممنوعة: قواعد التحويل تتقدّم على الأصول في
     Pages فتكسر خدمة index.html داخل المجلدات (/uno-game/ ⇒ 404). */
  if (/^\/\*\s+\/404\.html/m.test(rd)) bad('قاعدة /* ⇒ 404 الشاملة موجودة — تكسر /uno-game/ و/baloot-game/');
  else ok('لا قاعدة شاملة /* (service index.html داخل المجلدات سليم)');
}

/* ── النتيجة ── */
console.log(`\n${fail === 0 ? '✔ نجح' : '✗ فشل'}: ${pass} ناجح · ${fail} فاشل (تغطية النشر v2.65.1)`);
process.exit(fail === 0 ? 0 : 1);
