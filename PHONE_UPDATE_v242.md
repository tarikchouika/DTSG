# تحديث خادم الهاتف إلى v2.42.1 — خطوة بخطوة

**لماذا؟** المنصة (الصفحات) نُشرت الآن إلى `dtsg.pages.dev`، لكن **واجهة الـAPI تعمل على خادم هاتفك**
(`casino-phone.dmgames-api.workers.dev` → النفق → `server.js` + sqlite). وحتى تُحدَّث نسخة الهاتف
من `2.41.0` إلى `2.42.1`، ستظهر هذه المظاهر:
- ودجت «مركز المساعدة» يفتح ويبدو سليماً، لكن **الإرسال** يرد: «تعذّر الإرسال — حاول مجدداً» (المسار `/api/support/message` غير موجود بعد على الهاتف).
- تبويب **المالية** في لوحة الأدمن لا يعرض قائمة المعلّقات (المسار `/api/admin/payments/pending` غير موجود بعد).
- الإشعارات الجديدة لتيليغرام (بوت الدعم) **لن تصل** لأن نسخة 2.41 لا تحتوي تعديلات الإشعارات.

---

## 0) قبل البدء — تحقّق من الحالة الراهنة
على الهاتف (أو أي جهاز يستطيع تنفيذ الأوامر على نفس الخادم):
```bash
cd /root/dmgames-arena           # أو مجلد المشروع الحقيقي
bash scripts/phone-doctor.sh     # تشخيص شامل (القسم 5.b خاص ببوت الدعم)
```
المتوقع الآن: `build=2.41.0` · `/api/support/webhook` يستجيب 200 · `/api/admin/payments/pending` = 404.

## 1) الطريقة الأسهل — سكربت واحد (ينزّل الملفات من GitHub مباشرة)
```bash
cd /root/dmgames-arena
bash scripts/apply-support-now.sh
```
ماذا يفعل بالترتيب:
1. **نسخة احتياطية** كاملة إلى `/root/dtsg-v241-backup-YYYYMMDD-HHMM/` (يشمل `data/royalcoin.db`).
2. ينزّل من GitHub: `server-support.js · server.js · support.html · js/ui/bot-chat.js · js/ui/legal-ui.js · js/i18n/translations.js · js/main.js · js/core/api.js · js/core/auth.js · js/core/live-ws-bridge.js · css/09-chrome.css · index.html · package.json · CHANGELOG.md`.
3. يتأكد أن `server.js` يربط `server-support.js` (يربط تلقائياً إن لم يكن).
4. `node --check` على الملفات الحسّاسة ثم **`pm2 restart casino-server`** ثم 4 فحوص:
   `/api/support/webhook` · `/api/support/status` · `/support.html` · `/api/health`.

**خيارات مفيدة:** `SKIP_RESTART=1` (بلا إعادة تشغيل) · `DTSG_DIR=/path` (مجلد آخر) · `DTSG_PM2=اسم_التطبيق`.

### النتيجة المتوقعة
```
✓ server-support.js … ✓ server.js … ✓ js/ui/bot-chat.js …
✓ الشيفرة سليمة (node --check)
── 4) إعادة التشغيل + التحقق
   /api/support/webhook   ✓ code=200
   /api/support/status    ✓ code=401   (401 طبيعي: يحتاج جلسة)
   /support.html          ✓ code=200
   /api/health build      2.42.1
```

## 2) الطريقة البديلة — عبر git
```bash
cd /root/dmgames-arena
git remote -v                                   # إن لم يوجد origin:
git remote add origin https://github.com/tarikchouika/DTSG.git
git fetch origin main && git reset --hard origin/main
bash scripts/update-phone-server.sh             # يثبّت التبعيات ويعيد التشغيل ويجري الفحوص
```

## 3) التحقّق الخارجي (من أي جهاز، بلا دخول إلى الهاتف)
```bash
W=https://casino-phone.dmgames-api.workers.dev
curl -s $W/api/health ; echo                      # المتوقع: "build":"2.42.1"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $W/api/support/webhook \
  -H 'content-type: application/json' -H 'x-telegram-bot-api-secret-token: dtsgsup_k9Qz7mW3xR5tB1nY' -d '{"update_id":1}'
                                                  # المتوقع: 200
curl -s -o /dev/null -w '%{http_code}\n' $W/api/admin/payments/pending
                                                  # المتوقع: 401 (بدل 404) ⇒ المسار الجديد موجود
curl -s -o /dev/null -w '%{http_code}\n' -X POST $W/api/support/message -d '{}' -H 'content-type: application/json'
                                                  # المتوقع: 401 (بدل 404)
```

## 4) اختبار سريع بعد التحديث (5 دقائق)
1. **الودجت**: افتح `https://dtsg.pages.dev` → سجّل الدخول → اضغط زر الشات أسفل الشاشة →
   اكتب «اختبار» واضغط إرسال ⇒ يجب أن يظهر تأكيد «وصلت رسالتك…» في النافذة.
2. **تيليغرام**: افتح `@dtsgsupports_bot` ⇒ يجب أن تصلك رسالة «🆕 تذكرة دعم #…» (أو في شات الإدارة) مع زرّي «🎯 استلام / 🚫 إغلاق».
3. **إشعار المدفوعات**: من المحفظة أنشئ إيداعاً صغيراً (Binance/CIH/Cash Plus مع كود التحويل) ⇒ يجب أن تصلك **فوراً** رسالة «💰 معاملة مالية — 📥 إيداع جديد بانتظار الموافقة» مع زرّي **تأكيد/رفض**.
4. **اللوحة**: منتبويب «المالية» في لوحة الأدمن ⇒ ستجد جدول **طلبات الدفع المعلّقة** (وإيداعك العالق القديم سيظهر فيه) — اضغط ✅ لإضافة الرصيد أو ❌ للرفض (رفض السحب يعيد المبلغ تلقائياً).
5. **رفض/قبول من تيليغرام**: اضغط زر ✅ من رسالة تيليغرام مباشرة ⇒ يجب أن تصل رسالة تحديث وأن يتغير الرصيد.

## 5) إن ظهرت مشكلة
| العَرَض | السبب المرجّح | الحل |
|---|---|---|
| `/api/support/webhook` = 404 | الملفات لم تُحدَّث أو pm2 لم يُعد التشغيل | `pm2 restart casino-server --update-env` ثم أعد الفحص |
| الإشعارات لا تصل | `SUPPORT_BOT_TOKEN` غير مضبوط في بيئة pm2 | `SUPPORT_BOT_TOKEN=8993… pm2 restart casino-server --update-env` |
| التذكرة تصل لكن بلا أزرار | توكن بوت الدعم غائب — الإشعار خرج من قناة بوت المنصة فقط | اضبط توكن بوت الدعم كما أعلاه |
| عودة للنسخة السابقة | — | `cp /root/dtsg-v241-backup-*/server.js . && pm2 restart casino-server` |

## ملاحظة أمنية
التوكن يظهر **في الأمر فقط** ولا يُخزَّن في أي ملف (لا في `.git/config` ولا في الكوميتات). يُنصح بتدويره بعد انتهاء العمل.
