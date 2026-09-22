# 🛟 بوت خدمة العملاء — DTSG Support Bot (v2.41.0)

**البوت:** [@dtsgsupports_bot](https://t.me/dtsgsupports_bot) · **الصفحة:** https://dtsg.pages.dev/support.html
**السوبر أدمن:** `<TELEGRAM_ADMIN_CHAT_ID من البيئة>` · **المحرّك:** `server-support.js` · **الاختبار:** `tests/_support_bot_test.js` (72/72 ✓)

---

## 1) الفكرة في سطرين

قناة واحدة نظيفة بين المستخدم والفريق: المستخدم يكتب رسالته فيتلقّاها **فريق الدعم** عبر البوت،
والرد يصل **في نفس المحادثة** — بلا كشف هويات، وبلا حاجة لمراسلة أدمن بعينه.

```
المستخدم  ⇄  @dtsgsupports_bot  ⇄  [ تذكرة #12 ]  ⇄  أدمن دعم / سوبر أدمن
                    ⇅
        بوت المنصة المالي (المدفوعات)  ⇄  شات الإدارة المشترك (TELEGRAM_ADMIN_CHAT_ID)
                    ⇅
              dtsg.pages.dev/support.html   (ربط + متابعة التذاكر من المنصة)
```

---

## 2) الخصوصية (مصمَّمة لا مضافة)

| المبدأ | التنفيذ |
|---|---|
| المستخدم لا يرى هوية الأدمن | كل الردود تخرج من البوت باسم «🛟 فريق الدعم» — لا تُمرَّر معرّفات تيليغرام أبداً |
| الأدمن لا يرى هوية المستخدم | يرى **اسم المستخدم في المنصة** + رقم التذكرة فقط — لا هاتف/بريد/معرّف تيليغرام |
| تذاكر الزوّار (غير المرتبطين) | 🔒 لا يراها إلا **السوبر أدمن** — ولا تُعرض في طابور الأدمن العاديين |
| تذاكر الأدمنز | تذكرة يستلمها أدمن لا يراها غيره (إلا السوبر أدمن) |
| الملاحظات الداخلية | `/note` تُخزَّن بوسم `note` و**لا تُرسل** للمستخدم أبداً |
| بيانات الحساب والرصيد | `/user` و `/finance` للسوبر أدمن فقط |
| منع الإزعاج | حظر `/ban` يُوقف كل الإشعارات (حتى إشعارات المدفوعات) + حدّ إغراق 20 رسالة/دقيقة |
| الشفافية | `/privacy` للمستخدم · `/audit` للسوبر أدمن: كل إجراء إداري مسجَّل (من فعل ماذا ومتى) |

---

## 3) الأوامر

### المستخدم (في محادثة @dtsgsupports_bot)
| الأمر | الوظيفة |
|---|---|
| `/start` | ترحيب + حالة الربط |
| `/start SUP-XXXX` | **ربط الحساب** بكود من صفحة الدعم |
| أي رسالة نصية | فتح تذكرة (أو إضافة على تذكرته المفتوحة) |
| `/status` | تذاكري وآخر رد على كل واحدة |
| `/account` | اسمي ورصيدي وآخر معاملاتي |
| `/close` | إغلاق تذكرتي |
| `/unlink` | فصل الحساب عن البوت |
| `/privacy` · `/help` | الخصوصية · المساعدة |

### أدمن دعم (يُضيفه السوبر أدمن فقط)
`/queue` · `/queue mine` · `/open <رقم>` (استلام) · `/r النص` (رد على التذكرة النشطة) · `/reply <رقم> النص` ·
`/note النص` (داخلي) · `/close [رقم]` · `/reopen <رقم>` · `/notify on|off` · `/export <رقم>` · `/whoami` · `/help`

### سوبر أدمن (كل الصلاحيات)
`/admins` · `/addadmin <tg_id> الاسم` · `/deladmin <tg_id>` · `/broadcast النص` (لكل المرتبطين) ·
`/user <معرّف>` (بيانات الحساب) · `/finance [رقم]` (السياق المالي داخل التذكرة) · `/stats` ·
`/audit [عدد]` · `/setting <مفتاح> <قيمة>` · `/ban` · `/unban` · `/auth <PIN>`

> إعدادات متاحة: `support_open` (0/1 مفتاح إيقاف مؤقت — لا يعطّل الأدمنز) · `show_admin_names` (0=إخفاء الهوية) ·
> `admins_view_balance` · `auto_close_hours`.

---

## 4) الربط بين البوتين والمنصة (النسيج الكامل)

1. **نفس الهوية:** الربط يُكتب في عمود `users.telegram_id` في SQLite — فأي ربط من بوت الدعم يعمل فوراً في
   بوت المنصة (‏`/balance` · `/deposit`) والعكس (من ربط نفسه بـ `/start plt_<id>` في بوت المنصة، يصله دعم فوري).
2. **شات إدارة مشترك:** التذاكر الجديدة تُنشر في شات `TELEGRAM_ADMIN_CHAT_ID` نفسه الذي يستقبله بوت المنصة،
   مع أزرار «🎯 استلام» و«🚫 إغلاق» — تعمل من أي من البوتين (`supc_`/`supx_`/`supr_`).
3. **إشعارات المدفوعات عبر بوت الدعم:** عند تأكيد/رفض إيداع أو سحب، يرسل الخادم إشعاراً للمستخدم عبر بوت الدعم
   (خطاف `env.__notifyUser`) — فيصبح بوت الدعم مركز كل ما يخصّ المستخدم، وبوت المنصة مركز المالية والإدارة.
4. **السياق المالي داخل التذكرة:** `/finance <رقم>` (سوبر أدمن) يعرض آخر معاملات صاحب التذكرة داخل المحادثة —
   ينهي الحاجة للسؤال «ما رقم عمليتك؟».
5. **المنصة:** صفحة `support.html` تُنشئ كود الربط (30 دقيقة) وتتابع التذاكر، وفيها **لوحة أدمن** (طابور + رد +
   استلام + إغلاق) تعمل بنفس الصلاحيات والقيود.

---

## 5) التركيب التقني

| الطبقة | الملف | ملاحظات |
|---|---|---|
| المحرّك | `server-support.js` | تذاكر · رسائل · أزرار · صلاحيات · سجل · بلا أي تبعية خارجية |
| الجداول | `sup_tickets` · `sup_messages` · `sup_link_codes` · `sup_admins` · `sup_audit` · `sup_settings` · `sup_state` · `sup_users` | تُنشأ تلقائياً عند الإقلاع (نفس `royalcoin.db`) |
| النقاط | `POST /api/support/webhook` (سرّي) · `GET /api/support/status` · `POST /api/support/link-code` · `POST /api/support/unlink` · `GET/POST /api/support/admin/{queue,reply,close,claim}` | الجلسة عبر كوكي `sid` نفسه |
| الأمان | ترويسة `x-telegram-bot-api-secret-token` = `SUPPORT_WEBHOOK_SECRET` | تُرفض أي تحديثات بسرّ خاطئ (403) |

**متغيرات البيئة على خادم الهاتف:**
```
SUPPORT_BOT_TOKEN=<TOKEN_FROM_BOTFATHER>   # توكن @dtsgsupports_bot (من BotFather، لا يُكتب في المستودع)
SUPPORT_WEBHOOK_SECRET=dtsgsup_k9Qz…     # يجب أن يطابق ما ضُبط في setWebhook
SUPPORT_BOT_USERNAME=dtsgsupports_bot
SUPPORT_SUPER_TG="${TELEGRAM_ADMIN_CHAT_ID}"  # من البيئة فقط — سوبر أدمن الدعم
TELEGRAM_ADMIN_CHAT_ID=<ADMIN_CHAT_ID_FROM_DEPLOYMENT_ENV>  # قيمة تُحقن وقت التشغيل فقط
TELEGRAM_BOT_TOKEN=…                     # بوت المنصة (لديكم على الهاتف)
```

---

## 6) النشر والتشغيل

### ✅ تم بالفعل (على جهة الخادم السحابي)
- `bash scripts/setup-telegram-bots.sh` نُفِّذ: **setWebhook** + الأوامر + الوصف + **اسم البوت**
  «دعم DTSG | Support» + **صورة تعريفية** (`assets/dtsg/support-bot-avatar.jpg`).
- الصفحة `support.html` منشورة على https://dtsg.pages.dev/support.html
- الشجرة في GitHub على **v2.41.0** (`c8e3c93`).

### ⏳ الخطوة الوحيدة المتبقية: على الهاتف (أمر واحد)
الحالة الآن: الخادم الحيّ على **v2.40.5** ⇒ `/api/support/webhook` يردّ **404**.

```bash
# الطريق الأول (المعتاد)
cd /root/dmgames-arena && git fetch origin && git reset --hard origin/main
bash scripts/update-phone-server.sh

# الطريق الثاني (لو تعذّر git fetch لاختلافات/شبكة) — ينزّل الملفات من GitHub مباشرة
bash scripts/apply-support-now.sh
# → نسخة احتياطية + تنزيل server-support.js/server.js/support.html + ربط تلقائي + فحص نهائي

# تشخيص فقط في أي وقت
bash scripts/phone-doctor.sh        # يعرض قسم «5.b) بوت خدمة العملاء»

# 3) تأكيد خارجي من أي جهاز
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://casino-phone.dmgames-api.workers.dev/api/support/webhook \
  -H 'x-telegram-bot-api-secret-token: <SUPPORT_WEBHOOK_SECRET>' -H 'content-type: application/json' -d '{"update_id":9}'
#    المتوقع: 200
curl -s "https://api.telegram.org/bot<SUPPORT_BOT_TOKEN>/getWebhookInfo"
#    last_error_message يجب أن يكون فارغاً
```

**أول تشغيل (تجربة المالك):** افتح https://t.me/dtsgsupports_bot → `/whoami` (يجب أن يظهر «👑 سوبر أدمن»)
← `/start` ← أرسل أي رسالة (تُفتح تذكرة) ← `/queue` ← `/open 1` ← `/r تجربة` ← `/close 1`.

---

## 7) استكشاف الأعطال

| العَرَض | السبب المرجَّح | الحل |
|---|---|---|
| البوت صامت تماماً | الخادم لا يستجيب (نفق الهاتف مقطوع) أو الويب هوك يشير لعنوان ميت | `getWebhookInfo` → `last_error_message` · تأكد أن `…/api/health` = 200 ثم أعد `bash scripts/setup-telegram-bots.sh` |
| البوت يردّ 403 لكل تحديث | `SUPPORT_WEBHOOK_SECRET` على الخادم ≠ السرّ في `setWebhook` | اضبط نفس القيمة على الهاتف في `update-phone-server.sh` وأعد التشغيل، أو أعد setWebhook بالسرّ الجديد |
| «لا تصلني التذاكر» | الأدمن غير مسجَّل | `/whoami` ← إن لم يظهر «أدمن دعم» فأرسل معرّفك للسوبر أدمن ليضيفك `/addadmin` |
| مستخدم لا تصله الردود | حساب المستخدم محظور (`/ban`) أو أنه `blocked` البوت | `/unban <المعرّف>` |
| الدعم متوقف مؤقتاً | `support_open = 0` | `/setting support_open 1` (يعمل حتى وهو مغلق) |

---

## 8) الفحوص الآلية

```bash
node tests/_support_bot_test.js     # 72 فحصاً: ربط · تذاكر · أزرار · خصوصية · صلاحيات · حدود · ويب هوك · منصة
node tests/_security_static_test.js # 37: أمن الملفات والمدفوعات
```

### ما يتحقق منه كل سكربت

| السكربت | يحقّق في |
|---|---|
| `setup-telegram-bots.sh` | getMe للبوتين · setWebhook + السرّ · الأوامر/الوصف/الاسم/الصورة · وصول ويب هوك فعلي (200/403/404 بدلالة واضحة) |
| `update-phone-server.sh` | 4 فحوص دعم محلية + الفحص الخارجي عبر الووركر + إغلاق التسريبات + مطابقة `build` |
| `apply-support-now.sh` | نسخة احتياطية · تنزيل الملفات من GitHub · ربط تلقائي في `server.js` · إعادة تشغيل · فحص 4 نقاط |
| `phone-doctor.sh` | قسم مخصّص لبوت الدعم (webhook/status/support.html/server-support.js) + حكم نهائي يوجّهك للسكربت المناسب |
