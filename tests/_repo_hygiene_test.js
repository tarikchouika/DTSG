/* ═══ [v2.44-SECURITY] حارس نظافة المستودع: لا أسرار ولا مفاتيح في الملفات المتتبَّعة ═══
   المستودع **عام** ⇒ أي مفتاح يُكتب فيه يُعدّ مكشوفاً ويجب تدويره.
   يفحص كل ملف متتبَّع (بلا node_modules/أصول ثنائية) ويُفشل الاختبار عند أي تطابق حقيقي.
   العناصر النائبة مسموحة: cfat_... · ghp_... · <TOKEN> · XXXXX · example · placeholder
   التشغيل: node tests/_repo_hygiene_test.js
   ═════════════════════════════════════════════════════════════════════ */
process.chdir(require('path').resolve(__dirname, '..'));
const { execSync } = require('child_process');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

/* أنماط الأسرار الحقيقية */
const PATTERNS = [
  { name: 'توكن بوت تلغرام', re: /\b\d{8,12}:[A-Za-z0-9_-]{33,}\b/g },
  { name: 'سرّ ويبهوك دعم', re: /\bdtsgsup_[A-Za-z0-9]{8,}\b/g },
  { name: 'توكن GitHub', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g },
  { name: 'توكن Cloudflare', re: /\bcfat_[A-Za-z0-9_-]{35,}\b/g },
  { name: 'مفتاح Google', re: /\bAIza[0-9A-Za-z_-]{33,}\b/g },
  { name: 'مفتاح AWS', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'مفتاح Slack', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
  { name: 'مفتاح Stripe', re: /\b[sr]k_(?:live|test)_[0-9A-Za-z]{20,}\b/g },
  { name: 'مفتاح OpenAI', re: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { name: 'مفتاح خاص PEM', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'سرّ إدارة مكشوف', re: /ADMIN_API_SECRET\s*=\s*["'][A-Za-z0-9_-]{12,}["']/g }
];
/* عناصر نائبة مقبولة (تُستبدل قبل الفحص) */
const PLACEHOLDER = /(cfat_\.\.\.|ghp_\.\.\.|AAEUX…|<[A-Z_]+>|\bexample\b|placeholder|XXXX+|YOUR_|_HERE\b|\$\{)/g;

const files = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n');
const SKIP_EXT = /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|mp3|ogg|wav|mp4|webm|pdf|zip|xz|db|sqlite3?|map)$/i;
let scanned = 0;
const hits = [];
for (const f of files) {
  if (SKIP_EXT.test(f)) continue;
  let txt;
  try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  if (txt.indexOf('\u0000') >= 0) continue;                      /* ثنائي */
  if (txt.length > 3 * 1024 * 1024) continue;
  scanned++;
  const lines = txt.split('\n');
  for (const p of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const cleaned = raw.replace(PLACEHOLDER, ' ');
      const m = cleaned.match(p.re);
      if (m && m.length) hits.push({ file: f, line: i + 1, kind: p.name, sample: raw.trim().slice(0, 90) });
    }
  }
}
console.log('\n═══ 1) فحص ' + scanned + ' ملفاً متتبَّعاً (' + files.length + ' إجمالاً) ═══');
hits.length === 0
  ? ok('لا أسرار ولا مفاتيح في أي ملف متتبَّع')
  : bad('وُجدت ' + hits.length + ' حالة — ' + hits.slice(0, 6).map(h => h.kind + ' @ ' + h.file + ':' + h.line).join(' · '));

console.log('\n═══ 2) الملفات الحسّاسة غير متتبَّعة ═══');
const CHECKS = [
  { re: /^\.env/, why: 'ملف .env' },
  { re: /(^|\/)data\//, why: 'مجلد data (قاعدة/حالة البوت)' },
  { re: /\.(db|sqlite3?)(-wal|-shm)?$/, why: 'قاعدة بيانات' }
];
const leaks = files.filter(f => CHECKS.some(c => c.re.test(f)));
leaks.length === 0 ? ok('لا ملفات بيئة/قواعد بيانات متتبَّعة') : bad('متتبَّع: ' + leaks.slice(0, 5).join(' · '));

console.log('\n═══ 3) ghignore يغطّي الحسّاس ═══');
const gi = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : '';
['*.db', 'data/', '.env'].every(p => gi.indexOf(p.replace('.env', '.dev.vars')) >= 0 || gi.indexOf(p) >= 0)
  ? ok('.gitignore يغطّي قواعد البيانات و data/ وملفات البيئة')
  : bad('.gitignore ناقص: ' + ['*.db', 'data/', '.env'].filter(p => gi.indexOf(p) < 0 && gi.indexOf('.dev.vars') < 0).join(' · '));

console.log('\n═══ 4) السكربتات تقرأ الأسرار من البيئة (لا تكتبها) ═══');
const scripts = ['scripts/setup-telegram-bots.sh', 'scripts/update-phone-server.sh', 'scripts/deploy-pages.sh', 'scripts/qa-env.sh'];
const literal = scripts.filter(f => {
  if (!fs.existsSync(f)) return false;
  const t = fs.readFileSync(f, 'utf8');
  return /\b\d{8,12}:[A-Za-z0-9_-]{33,}\b/.test(t.replace(PLACEHOLDER, ' ')) || /cfat_[A-Za-z0-9_-]{35,}/.test(t);
});
literal.length === 0 ? ok('كل السكربتات تأخذ المفاتيح من متغيّرات البيئة') : bad('مفاتيح مكتوبة في: ' + literal.join(' · '));

console.log('\n═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
process.exit(fail ? 1 : 0);
