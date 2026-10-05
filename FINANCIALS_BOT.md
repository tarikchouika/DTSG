# 🏦 بوت المالية — DTSG Financials Bot (v2.66.0)

**البوت:** [@dtsgfinancials_bot](https://t.me/dtsgfinancials_bot) · **خاص بالسوپر أدمن حصراً 👑**
**المحرّك:** `server-financials.js` (داخل `server.js` — نفس قاعدة `royalcoin.db` نفسها) ·
**الاختبارات:** `tests/_financial_bot_test.js` (56/56 ✓) · `tests/_financial_bot_db_test.js` (91/91 ✓)

---

## 1) الفكرة في سطرين

بوت تيليغرام واحد يضع لوحة السوپر أدمن المالية **في جيب المالك**: كل ما يعرضه
الداشبورد داخل المنصة (الشحن · السحب · سجلات المستخدمين · جميع السجلات) يظهر هنا
من **نفس القاعدة ونفس الاستعلامات ونفس دوال الموافقة/الرفض** — ولا يراه ولا يلمسه
أي حساب آخر غير السوپر أدمن.

```
السوپر أدمن (تيليغرام فقط)
        ⇅
@dtsgfinancials_bot  ←  POST /api/financials/webhook (سِرّ: FINANCIALS_WEBHOOK_SECRET)
        ⇅
server-financials.js  ←  نفس SQLite (royalcoin.db) ونفس دوال الداشبورد:
                          pay.adminApprove / pay.adminReject / logTx / listPending
```

---

## 2) التكافؤ مع داشبورد السوپر أدمين (حرفياً)

| تبويب الداشبورد (js/main.js) | نقطة النهاية في المنصة | ما يقابله في البوت | المصدر (نفس الاستعلام) |
|---|---|---|---|
| المالية — البطاقات العلوية | `/api/admin/stats` | `/stats` | `users` (الذاكرة) + `pay_transactions` |
| المالية — طلبات معلّقة ✅/❌ | `/api/admin/payments/pending` + `/act` | `/pending` + أزرار `fapp:`/`frej:` | `pay.listPending` + `pay.adminActOnPlatformTx` |
| المالية — إحصاءات الألعاب | `/api/admin/stats/games` | `/games` | `group_bets` ⋈ `group_rounds` (نفس SQL) |
| سجل الشحن | (جزء من السجلات) | `/deposits [صفحة]` | `pay_transactions WHERE type='deposit'` |
| سجل السحب | (جزء من السجلات) | `/withdrawals [صفحة]` | `pay_transactions WHERE type='withdrawal'` |
| المستخدمون | `/api/admin/users` | `/users [صفحة] [بحث]` · `/user <معرّف|اسم>` · `/search <اسم>` | `users` (نفس الحقول) |
| السجلات (السجل المدمج) | `/api/admin/transactions` | `/log [نوع] [صفحة]` | الدمج الثلاثي نفسه: `transactions` + `bet_tickets` + `pay_transactions` |
| سجل المال + المجاميع | `/api/money/log?scope=all` | `/money [صفحة]` | `money_log` (نفس الحسابات) |
| المستخدمون — شحن/خصم/ضبط | `/api/admin/user/:id/balance` | `/charge` · `/deduct` · `/setbalance` | نفس المنطق حرفياً + `logTx` نفسه (مع مكافأة الإحالة 10%) |
| (جديد v2.84) إنشاء حساب | `/api/register` (مسار المشرفين) | `/register <اسم> <كلمة مرور>` | نفس القواعد: 3-20 حروف/أرقام/_ · 6+ · scrypt بنفس المخطط · دور user حصراً · رصيد 0 · رمز إحالة GV |
| (جديد) تدقيق البوت | — | `/audit [عدد]` | `fin_audit` |

> ‏`/tx <مرجع>` تفاصيل معاملة واحدة، و`/log` يقبل أنواع: deposit · withdrawal ·
> bet · win · transfer_out · transfer_in · charge · deduct · set_balance ·
> referral_bonus · claim.

---

## 3) الأوامر (سوپر أدمن فقط)

| الأمر | الوظيفة |
|---|---|
| `/start` | لوحة الترحيب + أزرار الأقسام التسعة (منها تسجيل مستخدم جديد) |
| `/stats` | مستخدمون · نشط 24س · مجموع الذهب · مجاميع الشحن/السحب USD · المعلّقة |
| `/pending` | الطلبات المعلّقة مع أزرار «✅ تأكيد/تنفيذ» و«❌ رفض» لكل طلب |
| `/deposits` · `/withdrawals` | سجل الشحن/السحب مع الترقيم والمراجِع والطريقة |
| `/users` · `/user` · `/search` | سجلات المستخدمين + ملف كامل (رصيد/انضمام/نشاط/إحالة/آخر معاملاته) |
| `/log` | **جميع السجلات** — السجل المدمج الثلاثي المصادر بتصفية سريعة بأزرار |
| `/money` | سجل المال + مجاميع (شحن منجز · سحب منجز · كوينز داخل/خارج) |
| `/games` | إحصاءات مالية لكل لعبة (لعبات · فوز · كوينز مدفوعة) |
| `/tx <مرجع>` | تفاصيل معاملة (مبلغ · مستخدم · طريقة · حالة · دليل · مراجِع) |
| `/charge <مستخدم> <مبلغ>` | شحن كوينز (نفس منطق الداشبورد + مكافأة الإحالة) |
| `/deduct <مستخدم> <مبلغ>` | خصم كوينز (يتحقق من كفاية الرصيد) |
| `/setbalance <مستخدم> <رصيد>` | ضبط الرصيد المطلق |
| `/register <اسم> <كلمة مرور>` | **[v2.84] تسجيل مستخدم جديد** — لاعب برصيد 0 ورمز إحالة (اشحنه بـ`/charge`) · الزر بلا وسيطات يعرض الدليل · بديل قصير `/adduser` |
| `/news <رسالة>` | [v2.73] رسالة إخبارية/إشهارية تظهر في **الشريط الإشهاري للمنصة** (≤200 حرفاً · `/news` عرض · `/news clear` إزالة · تصل خلال 5 دقائق عبر `/api/promotions`) |
| `/audit [عدد]` | آخر أفعال البوت (كل أمر/موافقة/رفض/شحن/محاولة دخول) |
| `/help` | القائمة الكاملة |

المستخدم يُحدد بمعرّفه (`/user 2`) أو باسمه (`/user player1`).

---

## 4) الأمان والخصوصية

| المبدأ | التنفيذ |
|---|---|
| سوپر أدمن حصراً | البوابة تقارن `chat`/`from` مع `FINANCIALS_SUPER_TG` (أو `TELEGRAM_ADMIN_CHAT_ID`) — أي محادثة أخرى تُرفض برسالة قاطعة **بلا كشف أي رقم** |
| قيد المحاولات | كل محاولة رفض (رسالة أو زر) تُقيَّد في `fin_audit` بـ `denied` |
| سرّ الويب هوك | ترويسة `x-telegram-bot-api-secret-token` = `FINANCIALS_WEBHOOK_SECRET` — سرّ خاطئ ⇒ 403 (قاعدة 10 في AGENTS.md) |
| تدقيق كامل | كل أمر وكل فعل مالي (موافقة/رفض/شحن/خصم/ضبط) في جدول `fin_audit` |
| نفس أموال الداشبورد | لا مسار مالي جديد: الموافقة/الرفض عبر `pay.adminActOnPlatformTx` نفسها، والشحن/الخصم عبر نفس منطق `server.js` مع `logTx` نفسه — سجل `transactions` واحد للمنصة والبوت |
| إشعار المستخدم | عند تنفيذ/رفض طلب أو شحن رصيد يُشعَر المستخدم عبر بوت الدعم (نفس سلوك الداشبورد) |
| لا أسرار في المستودع | التوكنات من البيئة فقط (`.env.local` على الهاتف) |

---

## 5) التركيب التقني

| الطبقة | الملف | ملاحظات |
|---|---|---|
| المحرّك | `server-financials.js` | ويب هوك تيليغرام + قرائن بيانات + أوامر — بلا أي تبعية خارجية |
| التركيب | `server.js` | `fin.initFinancials(db)` + `fin.setCtx(db, users, sessions, { pay, logTx, notifyUser })` ثم التوجيه قبل مسارات الدعم |
| الجداول | `fin_audit` (جديد فقط) | يُنشأ تلقائياً عند الإقلاع (idempotent) — لا يلمس أي جدول قائم |
| النقاط | `POST /api/financials/webhook` (سرّي) · `GET /api/financials/status` | الحالة تعرض `ok` واسم البوت فقط — بلا أسرار |
| الأزرار | `fapp:<tx>` / `frej:<tx>` (موافقة/رفض) · `fnv:<نطاق>:<وسيط>:<صفحة>` (تنقل) | بادئات خاصة بالبوت — لا تتعارض مع `dapp_/drej_/wapp_/wrej_` لبوتي الدعم والمنصة |

**متغيرات البيئة على خادم الهاتف (`.env.local`):**
```
FINANCIALS_BOT_TOKEN=<TOKEN_FROM_BOTFATHER>       # توكن @dtsgfinancials_bot
FINANCIALS_WEBHOOK_SECRET=dtsgfin_…                # يجب أن يطابق ما ضُبط في setWebhook
FINANCIALS_SUPER_TG=<ADMIN_CHAT_ID>                # اختياري — يأخذ TELEGRAM_ADMIN_CHAT_ID
FINANCIALS_BOT_USERNAME=dtsgfinancials_bot         # اختياري
```

---

## 6) النشر والتشغيل

### الخطوات (مرة واحدة)
1. **BotFather:** أنشئ البوت `@dtsgfinancials_bot` وانسخ التوكن.
2. **على الهاتف** أضف في `/root/DTSG/.env.local` المتغيرات الأربعة أعلاه.
3. حدّث الشجرة وأعد التشغيل بالبيئة الكاملة:
   ```bash
   cd /root/DTSG && git fetch origin && git reset --hard origin/main
   bash scripts/phone-env-restart.sh
   ```
   (يتحقق الآن من `FINANCIALS_BOT_TOKEN` و`FINANCIALS_WEBHOOK_SECRET` و`FINANCIALS_SUPER_TG` قبل إعادة التشغيل)
4. **من جهة فيها توكن البوت** (جهازك):
   ```bash
   export FINANCIALS_BOT_TOKEN='<TOKEN>'
   export FINANCIALS_SUPER_TG='<ADMIN_CHAT_ID>'
   bash scripts/setup-telegram-bots.sh
   # يضبط: setWebhook + السرّ + الأوامر + الوصف + الاسم «مالية DTSG | Financials»
   # ثم يفحص وصول الويب هوك فعلاً (200/403/404 بدلالة واضحة) ويطبع getWebhookInfo
   ```
5. تحقّق أخير: `curl https://api.telegram.org/bot$FINANCIALS_BOT_TOKEN/getWebhookInfo` ⇒ بلا `last_error`.

### أول تشغيل (تجربة المالك)
افتح https://t.me/dtsgfinancials_bot ← `/start` ← `/stats` ← `/pending` ←
`/log` ← `/user player1`. من أي حساب آخر: رسالة «⛔ هذا البوت خاص بالسوپر أدمن فقط».

---

## 7) استكشاف الأعطال

| العَرَض | السبب المرجَّح | الحل |
|---|---|---|
| البوت صامت | الويب هوك يشير لمسار ميت أو النفق مقطوع | `getWebhookInfo` → `last_error_message` · تأكد `…/api/health` = 200 ثم أعد `setup-telegram-bots.sh` |
| ميزة تُضغط ولا يأتي ردّ | كان sendMessage يُرفض من تيليغرام (400 can’t parse entities) ويُبتَلع الخطأ بصمت | **[v2.84] مُصلَح من الجذر**: اقتطاع آمن للوسوم (`cutHtml`) + إعادة إرسال نص خام + قيد `send-retry-plain` في `/audit` — إن تكرر يظهر سببه الحرفي هناك |
| زر يردّ «أمر غير معروف» | شيارات خفية (ZWSP/RLM) في نص الزر أسقطت المطابقة الحرفية | **[v2.84] مُصلَح**: المطابقة تُطهّر الشيارات وتضغط الفراغات — جرّب الزر بعد إعادة تشغيل خادم الهاتف |
| يردّ 403 لكل تحديث | `FINANCIALS_WEBHOOK_SECRET` على الخادم ≠ السرّ في setWebhook | وحّد القيمة في `.env.local` وأعد `phone-env-restart.sh` ثم أعد setWebhook |
| «خاص بالسوپر أدمن فقط» رغم أنك المالك | `FINANCIALS_SUPER_TG` (أو `TELEGRAM_ADMIN_CHAT_ID`) لا يطابق معرّف محادثتك | خذ معرّفك من @userinfobot واضبط `FINANCIALS_SUPER_TG` |
| `/pending` لا يعرض شيئاً | لا طلبات معلّقة فعلاً (السلوك الصحيح: «✅ لا توجد طلبات معلّقة») | أنشئ طلب شحن من المحفظة ثم أعد المحاولة |
| أزرار الموافقة تقول «مُعالجة سلفاً» | المعاملة حُسمت من الداشبورد أو بوت آخر | مسار idempotent مقصود — لا إزدواج مالي |

---

## 8) الفحوص الآلية

```bash
node tests/_financial_bot_test.js      # 56: بوابة السوپر · تكافؤ الداشبورد · أفعال مالية · ويب هوك
node tests/_financial_bot_db_test.js   # 91: قاعدة قديمة/حديثة · طوابع زمن · idempotency · مقاومة الأعمدة المهاجرة
node tests/_v284_fin_hardening_test.js # 32: أزرار السجلات الثلاثة + المطابقة المطهّرة + cutHtml + إعادة الإرسال + /register
```

### ما يتحقق منه كل اختبار
| السكربت | يتحقّق في |
|---|---|
| `_financial_bot_test.js` | رفض الغريب بلا تسريب · fin_audit للمحاولات · كل أوامر العرض · موافقة/رفض بنفس دوال الداشبورد · شحن/خصم/ضبط + مكافأة إحالة 10% · إشعار المستخدم · الترقيم fnv · سرّ الويب هوك (403) · تركيب server.js |
| `_financial_bot_db_test.js` | قاعدة legacy بلا `reviewed_by/reviewed_at` (SELECT * يتحمّل) · طوابع money_log المللي / transactions الثواني / pay TEXT · initFinancials idempotent · كل الفلاتر والأنواع · UPDATE المستخدمين |
| `_v284_fin_hardening_test.js` | الأزرار الثلاث المُبلَّغ عنها (📜/📥/💰) تستجيب · مطابقة مطهّرة (ZWSP/RLM/فراغات) · cutHtml (لا وسم مقطوع + إغلاق) · رفض 400 ⇒ إعادة إرسال خام + قيد تدقيق · 403 ⇒ قيد send-fail · /register: الدليل/الرفض/الإنشاء بنفس scrypt المنصة/رمز إحالة/مرآة الذاكرة/التدقيق |

> **[DB-Audit 2026-09-28]** أُصلح استعلامان بعد التدقيق: (1) `payList` صار
> `SELECT *` فلا يفشل على قاعدة قديمة بلا عمودَي المراجعة، (2) تواريخ
> `pay_transactions` النصية تُحلّ الآن إلى ثوانٍ حقيقية في السجل المدمج
> (كانت تظهر 0 — نفس الخصلة موروثة من الداشبورد نفسه وتظل هناك كما هي).
