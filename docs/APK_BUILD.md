# بناء تطبيق الأندرويد (APK) آلياً — Automated APK Build (v2.81)

> مرجع المالك والمساعدين لسير عمل GitHub Actions الذي يبني تطبيق **Capacitor
> Android** لمنصة DTSG ويولّد **Debug APK** جاهزاً للتحميل مجاناً — بناءً على
> توجيه المالك (2026-10-03).

---

## 0. تثبيت سير العمل — ✅ مكتمل (2026-10-03)

كان الدفع إلى `.github/workflows/` محجوباً لأن توكن النشر الأول بلا صلاحية
**workflow** (رفض GitHub: «refusing to allow a Personal Access Token to
create or update workflow») — فعُلّقت مرحلة الوسم هذه، ووُضع ملف السير
مصدراً في **`docs/workflows/build-apk.yml`** ريثما يُثبَّت.

**الحالة الآن [v2.81]: الملف ليس نسخة ظلّية تنتظر التثبيت — بل مثبَّت في
المكانين معاً.** النسخة العملية هي **`.github/workflows/build-apk.yml`** (هي
التي ينفّذها GitHub)، و**`docs/workflows/build-apk.yml`** مرآةٌ موثّقة للمرجع
والرجوع إليها. النسبتان: `cmp` = 0 — **متطابقتان بايت ببايت عمداً**، وأي
تعديل مستقبلي يُطبَّق على الاثنتين معاً في المهمة نفسها.

**التثبيت تمّ في 2026-10-03 بالخيار 2:** وفّر المالك توكناً كلاسيكياً بصلاحية
`workflow` (تحقّق قبل الاستخدام: `x-oauth-scopes` يضم `workflow`) ⇒
`mkdir -p .github/workflows && cp docs/workflows/build-apk.yml .github/workflows/`
ثم إيداع ودفع ناجح (a8a8476).

بعد التثبيت يعمل كل ما في هذا الدليل حرفياً، والتفعيل الآلي مُتحقق منه فعلاً:
دفعُ التثبيت ذاته أطلق **التشغيل #1** واكتمل **success** بخطواته التسع،
والمخرج Artifact `DSTG-Gaming-App-Debug` (24.1MB) — انظر القائمة §5.

## 1. كيف يعمل النظام؟ (نظرة سريعة)

| العنصر | الملف | الدور |
|---|---|---|
| سير العمل | **المثبَّت (النسخة التي ينفّذها GitHub):** `.github/workflows/build-apk.yml` — ومرآته الموثّقة المطابقة بايت ببايت: `docs/workflows/build-apk.yml` (§0) | يبنى عند كل دفع إلى `main`/`master` (مع استثناء ملفات التوثيق — §2.1) + زر تشغيل يدوي `workflow_dispatch` |
| تجهيز الواجهة | `scripts/prepare-www.sh` | يجمّع ملفات المنصة الثابتة في `www/` — نفس قائمة نشر Cloudflare Pages حرفياً (قاعدة 11) |
| إعداد Capacitor | يُنشأ مؤقتاً داخل CI | `capacitor.config.json` بمعرّف `com.dtsg.app` و`webDir: www` — **ليس في المستودع** |
| مشروع Android | يُولَّد في CI | `npx cap add android` يُنشئ `android/` حديثاً في كل تشغيل — **ليس في المستودع** (نظافة كاملة) |

**لماذا لا يوجد `android/` في المستودع؟** المستند يشترط «منعزِل تماماً لا يضر
بنظافة المستودع ولا يرفع ملفات البناء الثقيلة» — توليد المشروع داخل CI من
إعداد واحد ثابت يحقق ذلك: لا مجلدات `android/` (عشرات الملفات) ولا `www/` ولا
`build/` ولا `.gradle/` في المصدر، وكل ملفاتها في `.gitignore` من v2.81.

## 2. خطوات خط الإنتاج (ما يحدث في كل بناء)

1. `actions/checkout@v4` — جلب الكود.
2. `actions/setup-node@v4` — **[v2.81] Node.js 22** (كان 20: و`package.json`
   يشترط `engines.node >= 22.12.0`، فكان العدّاء على إصدار أقل من المطلوب)
   + كاش `npm`.
3. `npm ci` — الاعتمادات المحددة بدقة عبر `package-lock.json`.
4. `mkdir -p www` ثم `bash scripts/prepare-www.sh www` — واجهة المنصة.
5. `npm install --no-save @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6` —
   Capacitor 6 (متوافق Java 17) **بلا تعديل** `package.json`/`package-lock.json`.
6. كتابة `capacitor.config.json` المؤقت + `npx cap add android` + `npx cap sync android`.
7. `actions/setup-java@v4` — OpenJDK 17 (Temurin) + كاش `gradle`.
8. `chmod +x android/gradlew` ثم `./gradlew assembleDebug --no-daemon`.
9. `actions/upload-artifact@v4` — الـ APK باسم **DSTG-Gaming-App-Debug**، يبقى **7 أيام**.

### 2.1 ما الذي يُشغّل البناء فعلاً — وما الذي يُفيه [v2.81]

| الخاصية | القيمة | لماذا |
|---|---|---|
| `on.push.branches` | `[main, master]` | البناء عند أي دفع إلى الفرع |
| `on.push.paths-ignore` | `'**/*.md'` + `'.gitignore'` | تغيير توثيق لا يمسّ التطبيق ⇒ لا بناء |
| `on.workflow_dispatch` | مفتاح فارغ | زر «Run workflow» اليدوي |
| `concurrency` | `group: apk-build` + `cancel-in-progress: true` | دفعات متتابعة ⇒ يُلغى القديم بدل أن تتوازى ثلاثة بناءات Gradle بلا فائدة |
| `timeout-minutes` | `45` | بناء عالق (تنزيل Gradle مثلاً) لا يحرق زمن العدّاد ست ساعات |

**[v2.81] استثناء التوثيق صار نمطاً عاماً.** كانت القائمة تذكر ثلاثة أسماء
جذرية (`CHANGELOG.md` · `worklog.md` · `AGENTS.md`) + `docs/**` فقط، فبقي
**سبعة ملفات `*.md` متتبَّعة في جذر المستودع** خارجها:
`BILLIARDS_PLAN.md` · `FINANCIALS_BOT.md` · `GOLVAZOR_SPEC.md` ·
`PHONE_SERVER_FIX.md` · `PHONE_UPDATE_v242.md` · `RESILIENCE_AUDIT.md` ·
`SUPPORT_BOT.md` — فأي تعليق على أيٍّ منها كان **يُطلق بناء Gradle كاملاً**.
النمط `**/*.md` يغطي كل مستند مهما كان موضعه، فلا يعود الفهرس يُنقّص.

**وكل ما ليس `*.md` يبقى محفّزاً صحيحاً:** `_headers` · `_redirects` ·
`index.html` · `js/` · `css/` · `assets/` وسائر الملفات — فأي تعديل في واجهة
المنصة (وهي ما يُشحن داخل التطبيق) لا يزال يُعيد البناء كما يجب. القائمة لا
تتجاوز `*.md` و`.gitignore`، فلا تسري على غيرهما، ولا حاجة إلى استثناءات
مقلوبة (`!`) أصلاً لأن الواجهة كلّها خارج `*.md` بحكم تعريفها.

### 2.2 حارس المسار في `scripts/prepare-www.sh` [v2.81]

السكربت يمرَّر مخرجه إلى `rm -rf` مباشرةً، فصار يقبل **جذر المستودع وحده**
ويرفض أي مسار خارجه (`/tmp/...` و`/etc/...` وأي مسار مطلق أو صاعد) برسالة
واضحة وخروج `1`.

**الأثر على هذا الدليل:** الصيغة الصحيحة هي `bash scripts/prepare-www.sh www`
— أي `www` نسبي داخل المستودع (وهي التي يستعملها سير العمل في الخطوة 4). أمّا
`prepare-www.sh /tmp/www` أو أي مسار خارج المستودع **لم يعد يعمل** — رفضاً
مقصوداً، فالهدف `rm -rf` لا يجوز أن يخرج عن المستودع.

**وأخرى في السكربت نفسه [v2.81]:** صار يقَلِّم
`ronda-game/README.md` تماماً كما يفعل `scripts/deploy-pages.sh` — فكان
الـAPK يشحن ملفاً لا يشحنه الموقع.

## 3. كيف أنزّل الـ APK وأثبّته؟ (طريقة التنزيل — المستند §3)

1. افتح المستودع `github.com/tarikchouika/DTSG` ⇒ تبويب **Actions**.
2. انقر أحدث تشغيل ناجح لسير العمل **«Build Android APK (Debug)»** (أو شغّله
   يدوياً: **Run workflow** ⇒ انتظر حتى الاخضرار ⇒ أعد فتح التشغيل).
3. أسفل قسم **Artifacts** انقر **DSTG-Gaming-App-Debug** — يُنزَّل ملف ZIP
   يحوي `app-debug.apk`.
4. فك الضغط وانقل `app-debug.apk` إلى هاتف أندرويد (تيليغرام لنفسك / كابل /
   Drive — أي وسيلة).
5. على الهاتف: انقر الملف ⇒ إن طُلب السماح «التثبيت من مصادر غير معروفة»
   فعّله لهذا المدير فقط ⇒ **تثبيت**.
   - تثبيت **Debug** لأغراض التشغيل والاختبار؛ نسخة المتجر (Play) تحتاج
     توقيع إصدار (Release) — يُبنى لاحقاً بالطريقة نفسها مع `assembleRelease`
     ومخزن مفاتيح خاص (لا يُرفع للمستودع أبداً).
6. بعد التثبيت: أي تعديل جديد يُدفع إلى `main` يبني APK حديثاً تلقائياً.

> الأمان: الـ Workflow بصلاحية `contents: read` فقط — لا يكتب في المستودع
> ولا يدفع أي شيء إليه؛ الـ APK يُسلَّم Artifact حصراً.

## 4. فحوص سريعة عند فشل البناء

| العَرَض | السبب الأرجح | الحل |
|---|---|---|
| `npm ci` يفشل | `package-lock.json` غير متزامن مع `package.json` | أعد توليد الـ lock محلياً وادفعه مع التغيير |
| فشل `cap sync` | مجلد `www` فارغ أو ناقص | تحقق من `scripts/prepare-www.sh` وقائمة النسخ (قاعدة 11) |
| فشل Gradle `SDK location not found` | بيئة العدّاء | نادر على `ubuntu-latest` — أعِد التشغيل (زر Run workflow) |
| `if-no-files-found: error` | مسار الـ APK تغيّر | راجع `android/app/build/outputs/apk/debug/` في سجل الخطوة 8 |
| `✖ prepare-www.sh: المسار الهدف خارج جذر المستودع — رُفض` (خروج 1) | مُمرَّر مسار مخرج خارج المستودع | مرّر `www` نسبياً كما في الخطوة 4 — الحارس يرفض `/tmp/...` عمداً (§2.2) |
| البناء أُلغي فور بدئه | `cancel-in-progress: true` — دفع لاحق ألغى تشغيلاً سابقاً | متوقّع (§2.1): افتح آخر تشغيل وأحدثه؛ البناء الملغى لا يعني فشلاً |
| `npm ci` يفشل على Node | إصدار العدّاء أقل من `engines.node` | أُصلح في v2.81 — السير يستعمل `node-version: '22'` (الخطوة 2 من §2) |

## 5. القائمة المرجعية السريعة

- [x] Triggers: push على `main`/`master` مع استثناء التوثيق (`'**/*.md'` +
  `'.gitignore'` — أي مستند مهما كان موضعه، §2.1) + `workflow_dispatch`.
- [x] **[v2.81]** `concurrency: apk-build` + `cancel-in-progress: true` ·
  `timeout-minutes: 45` — لا بناءات متوازية، ولا عدّاء محترق (§2.1).
- [x] **[v2.81] Node 22** (لا 20 — `engines.node >= 22.12.0`) + `cache: npm` ·
  Java 17 Temurin + `cache: gradle` (المستند §ب).
- [x] **[v2.81]** `scripts/prepare-www.sh` يرفض أي مخرج خارج جذر المستودع
  ⇒ الصيغة الصحيحة `prepare-www.sh www` (§2.2).
- [x] `npm ci` · `mkdir -p www` · `npx cap sync android` · `chmod +x gradlew` ·
  `assembleDebug --no-daemon` (المستند §ب).
- [x] Artifact `DSTG-Gaming-App-Debug` من مسار `android/app/build/outputs/apk/debug/app-debug.apk`
  لمدة 7 أيام (المستند §ب-7).
- [x] نظافة المستودع: `www/ android/ .gradle/ *.apk capacitor.config.json local.properties`
  في `.gitignore` (المستند §3) — ولا يكتب الـ Workflow أي شيء للمصدر.
- [x] تعليقات توضيحية داخل الكود (المستند: «بأسلوب نظيف مع التعليقات التوضيحية»).
- [x] **التثبيت الفعلي (2026-10-03):** `.github/workflows/build-apk.yml` بتوكن المالك
  بصلاحية workflow — `cmp` = 0 مع مرآة التوثيق `docs/workflows/build-apk.yml`:
  النسختان **مثبَّتتان ومتطابقتان بايت ببايت**: الأولى تُنفَّذ والثانية توثيق (§0).
- [x] **أول بناء حقيقي ناجح (تشغيل #1):** success بكل الخطوات، Artifact
  `DSTG-Gaming-App-Debug` 24.1MB — الدليل أن الخط إنتاجي لا نظري.
