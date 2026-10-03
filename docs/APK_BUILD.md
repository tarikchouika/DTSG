# بناء تطبيق الأندرويد (APK) آلياً — Automated APK Build (v2.81)

> مرجع المالك والمساعدين لسير عمل GitHub Actions الذي يبني تطبيق **Capacitor
> Android** لمنصة DTSG ويولّد **Debug APK** جاهزاً للتحميل مجاناً — بناءً على
> توجيه المالك (2026-10-03).

---

## 0. تثبيت سير العمل — ✅ مكتمل (2026-10-04)

كان الدفع إلى `.github/workflows/` محجوباً لأن توكن النشر الأول بلا صلاحية
**workflow** (رفض GitHub: «refusing to allow a Personal Access Token to
create or update workflow») — فعلق ملف السير مصدراً في
**`docs/workflows/build-apk.yml`** بانتظار تثبيت لمرة واحدة بخيارين موثقين
(واجهة GitHub، أو توكن بصلاحية workflow).

**تم التثبيت فعلاً في 2026-10-04 بالخيار 2:** وفّر المالك توكناً كلاسيكياً
بصلاحية `workflow` (تحقق قبل الاستخدام: `x-oauth-scopes` يضم `workflow`) ⇒
`mkdir -p .github/workflows && cp docs/workflows/build-apk.yml .github/workflows/`
ثم إيداع ودفع ناجح (a8a8476) — النسختان متطابقتان حرفياً (`cmp`) والمصدر
للتوثيق والمثبَّت للتنفيذ؛ أي تعديل مستقبلي يطبَّق على الاثنين معاً.

بعد التثبيت يعمل كل ما في هذا الدليل حرفياً، والتفعيل الآلي مُتحقق منه فعلاً:
دفعُ التثبيت ذاته أطلق **التشغيل #1** واكتمل **success** بخطواته التسع،
والمخرج Artifact `DSTG-Gaming-App-Debug` (24.1MB) — انظر القائمة §5.

## 1. كيف يعمل النظام؟ (نظرة سريعة)

| العنصر | الملف | الدور |
|---|---|---|
| سير العمل | المثبَّت: `.github/workflows/build-apk.yml` — والمصدر الموثق المطابق له حرفياً: `docs/workflows/build-apk.yml` (§0) | يبنى عند كل دفع إلى `main`/`master` (مع استثناء ملفات التوثيق) + زر تشغيل يدوي `workflow_dispatch` |
| تجهيز الواجهة | `scripts/prepare-www.sh` | يجمّع ملفات المنصة الثابتة في `www/` — نفس قائمة نشر Cloudflare Pages حرفياً (قاعدة 11) |
| إعداد Capacitor | يُنشأ مؤقتاً داخل CI | `capacitor.config.json` بمعرّف `com.dtsg.app` و`webDir: www` — **ليس في المستودع** |
| مشروع Android | يُولَّد في CI | `npx cap add android` يُنشئ `android/` حديثاً في كل تشغيل — **ليس في المستودع** (نظافة كاملة) |

**لماذا لا يوجد `android/` في المستودع؟** المستند يشترط «منعزِل تماماً لا يضر
بنظافة المستودع ولا يرفع ملفات البناء الثقيلة» — توليد المشروع داخل CI من
إعداد واحد ثابت يحقق ذلك: لا مجلدات `android/` (عشرات الملفات) ولا `www/` ولا
`build/` ولا `.gradle/` في المصدر، وكل ملفاتها في `.gitignore` من v2.81.

## 2. خطوات خط الإنتاج (ما يحدث في كل بناء)

1. `actions/checkout@v4` — جلب الكود.
2. `actions/setup-node@v4` — Node.js 20 + كاش `npm`.
3. `npm ci` — الاعتمادات المحددة بدقة عبر `package-lock.json`.
4. `mkdir -p www` ثم `bash scripts/prepare-www.sh www` — واجهة المنصة.
5. `npm install --no-save @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6` —
   Capacitor 6 (متوافق Java 17) **بلا تعديل** `package.json`/`package-lock.json`.
6. كتابة `capacitor.config.json` المؤقت + `npx cap add android` + `npx cap sync android`.
7. `actions/setup-java@v4` — OpenJDK 17 (Temurin) + كاش `gradle`.
8. `chmod +x android/gradlew` ثم `./gradlew assembleDebug --no-daemon`.
9. `actions/upload-artifact@v4` — الـ APK باسم **DSTG-Gaming-App-Debug**، يبقى **7 أيام**.

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

## 5. القائمة المرجعية السريعة

- [x] Triggers: push على `main`/`master` مع استثناء التوثيق + `workflow_dispatch`.
- [x] Node 20 + `cache: npm` · Java 17 Temurin + `cache: gradle` (المستند §ب).
- [x] `npm ci` · `mkdir -p www` · `npx cap sync android` · `chmod +x gradlew` ·
  `assembleDebug --no-daemon` (المستند §ب).
- [x] Artifact `DSTG-Gaming-App-Debug` من مسار `android/app/build/outputs/apk/debug/app-debug.apk`
  لمدة 7 أيام (المستند §ب-7).
- [x] نظافة المستودع: `www/ android/ .gradle/ *.apk capacitor.config.json local.properties`
  في `.gitignore` (المستند §3) — ولا يكتب الـ Workflow أي شيء للمصدر.
- [x] تعليقات توضيحية داخل الكود (المستند: «بأسلوب نظيف مع التعليقات التوضيحية»).
- [x] **التثبيت الفعلي (2026-10-04):** `.github/workflows/build-apk.yml` بتوكن المالك
  بصلاحية workflow — تطابق `cmp` كامل مع مصدر التوثيق.
- [x] **أول بناء حقيقي ناجح (تشغيل #1):** success بكل الخطوات، Artifact
  `DSTG-Gaming-App-Debug` 24.1MB — الدليل أن الخط إنتاجي لا نظري.
