/* ═══ [v2.48.2-GUARD] حارس أصل المستودع: يمنع عودة اللبس مع المستودع القديم ═══
   خلفية (2026-09-21): ظهر فرع `arena/01a0bd39-dtsg` في DTSG فظُنّ أنه من المستودع
   القديم `digital-moroccan-casino`. التحقيق أثبت أنه فرع جلسة داخل DTSG (صفر محتوى
   فريد) — لكن السبب الجذري للبس حقيقي: مجلد worktree قديم على الهاتف + مصدر فرع
   قديم افتراضي في سكربت النشر. هذا الحارس يمنع رجوع ذلك.
   المراجع: docs/ASSISTANT_GUARDRAILS.md · AGENTS.md
   التشغيل: node tests/_repo_origin_test.js
   ═════════════════════════════════════════════════════════════════════ */
process.chdir(require('path').resolve(__dirname, '..'));
const fs = require('fs');
const { execSync } = require('child_process');

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

const OLD_REPO = /digital-moroccan-casino/;
const OLD_BRANCH = /arena\/01a0(a670|81af)/;   /* فروع المستودع القديم */
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const shFiles = (() => { try { return execSync('ls scripts/*.sh', { encoding: 'utf8' }).trim().split('\n'); } catch (e) { return []; } })();
/* الحارس نفسه (preflight) وهذا الاختبار يحملان أنماط القديم كنصوص بحث ⇒ يُستثنيان
   من فحص «الاستعمال الفعلي»؛ سلوك preflight يُتحقق منه بتشغيله لا بمسح نصه. */
const SELF = new Set(['scripts/preflight-repo.sh', 'tests/_repo_origin_test.js']);

/* ── 1) لا استعمال فعلي للقديم كمصدر git في السكربتات ── */
console.log('\n═══ 1) سكربتات لا تعمل على المستودع القديم ═══');
const activeUse = [];
for (const f of shFiles) {
  if (SELF.has(f)) continue;
  const txt = read(f); if (!txt) continue;
  txt.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith('#')) return;                       /* تعليقات تاريخية مسموحة */
    if (/^(FORBIDDEN|EXPECTED|OLD_)/.test(line)) return;     /* تعريفات الحرّاس */
    if (/(BRANCH_SOURCE|FEED_BRANCH|SOURCE_BRANCH)\s*=\s*[^#]*?(digital-moroccan-casino|arena\/01a0)/.test(line) ||
        /git\s+(fetch|clone|pull|push|checkout|switch|reset|remote\s+add)[^\n]*(digital-moroccan-casino|arena\/01a0)/.test(line)) {
      activeUse.push(f + ':' + (i + 1) + ' → ' + line.slice(0, 90));
    }
  });
}
activeUse.length === 0 ? ok('لا استعمال فعلي لمستودع/فروع القديم في أي سكربت')
  : bad('استعمال فعلي خطِر:\n       ' + activeUse.join('\n       '));

/* ── 2) مصدر فرع النشر = main ── */
console.log('\n═══ 2) مصدر النشر ═══');
const dep = read('scripts/deploy-pages.sh') || '';
/BRANCH_SOURCE="\$\{DMG_SOURCE_BRANCH:-origin\/main\}"/.test(dep)
  ? ok('deploy-pages.sh: BRANCH_SOURCE الافتراضي = origin/main')
  : bad('deploy-pages.sh: مصدر الفرع الافتراضي ليس origin/main');
/رفض|exit 1/.test(dep) && /digital-moroccan-casino/.test(dep)
  ? ok('deploy-pages.sh يحوي حارساً يرفض المستودع القديم')
  : bad('deploy-pages.sh بلا حارس يرفض المستودع القديم');
!/^[^#]*BRANCH_SOURCE=.*arena\/01a0/m.test(dep)
  ? ok('BRANCH_SOURCE لا يستعمل فروع المستودع القديم')
  : bad('BRANCH_SOURCE يستعمل فرعاً من المستودع القديم');

/* ── 3) حرّاس موجودون وقابلون للتنفيذ ── */
console.log('\n═══ 3) الحرّاس والوثائق ═══');
for (const [f, why] of [['scripts/preflight-repo.sh', 'فحص ما قبل العمل'], ['docs/ASSISTANT_GUARDRAILS.md', 'الملف التحذيري'], ['AGENTS.md', 'تعليمات الوكلاء']]) {
  fs.existsSync(f) ? ok(`${f} موجود (${why})`) : bad(`${f} مفقود (${why})`);
}
try {
  execSync('bash -n scripts/preflight-repo.sh', { stdio: 'pipe' });
  execSync('bash -n scripts/deploy-pages.sh', { stdio: 'pipe' });
  ok('بناء الجملة سليم للسكربتين');
} catch (e) { bad('خطأ بناء جملة: ' + String(e.stderr || e).slice(0, 120)); }

const agents = read('AGENTS.md') || '';
(/main/.test(agents) && /فرع واحد|فرعاً واحداً|one branch/i.test(agents))
  ? ok('AGENTS.md يفرض سياسة الفرع الواحد')
  : bad('AGENTS.md لا يذكر سياسة الفرع الواحد');
(/dmgames-arena|digital-moroccan-casino/.test(agents) && /لا تعمل من مجلد قديم|مجلد قديم/.test(agents))
  ? ok('AGENTS.md يحذّر من مجلد العمل القديم')
  : bad('AGENTS.md بلا تحذير من المجلد القديم');
const guard = read('docs/ASSISTANT_GUARDRAILS.md') || '';
(/behind_by|0 محتوى فريد|صفر محتوى فريد/.test(guard) && /--all|--mirror/.test(guard) && /worktree/.test(guard))
  ? ok('الملف التحذيري يشرح الحادثة والقواعد الحرجة')
  : bad('الملف التحذيري ناقص (الحادثة/القواعد)');

/* ── 4) لا صيغ دفع خطِرة ── */
console.log('\n═══ 4) صيغ دفع خطِرة في السكربتات والأجنحة ═══');
let risky = [];
for (const f of shFiles.concat((() => { try { return execSync('ls tests/*.js', { encoding: 'utf8' }).trim().split('\n'); } catch (e) { return []; } })())) {
  if (SELF.has(f)) continue;                                 /* لا يفحص نمطه هو */
  const txt = read(f); if (!txt) continue;
  txt.split('\n').forEach((raw, i) => {
    if (/git\s+push[^\n]*--(all|mirror)/.test(raw)) risky.push(f + ':' + (i + 1));
  });
}
risky.length === 0 ? ok('لا `git push --all` ولا `--mirror` في أي سكربت أو اختبار')
  : bad('صيغة خطِرة: ' + risky.join(' · '));

/* ── 5) هوية الريموت (إن توفّر git) ── */
console.log('\n═══ 5) هوية الريموت الحالي ═══');
let remoteUrl = '';
try { remoteUrl = execSync('git remote get-url origin 2>/dev/null', { encoding: 'utf8' }).trim(); } catch (e) { remoteUrl = ''; }
if (!remoteUrl) ok('لا ريموت origin (نسخة بلا git — مقبول)');
else if (OLD_REPO.test(remoteUrl)) bad('origin يشير إلى المستودع القديم: ' + remoteUrl);
else if (/tarikchouika\/DTSG/.test(remoteUrl)) ok('origin = tarikchouika/DTSG');
else ok('origin غير قياسي لكنه ليس القديم: ' + remoteUrl.slice(0, 60));

console.log('\n═══ النتيجة [v2.48.2-GUARD]: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
process.exit(fail ? 1 : 0);
