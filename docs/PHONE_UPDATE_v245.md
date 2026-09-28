# 📱 تحديث خادم الهاتف — DTSG v2.45 (إزالة Cryptomus ⇒ Binance Pay)
> **الواجهة على dtsg.pages.dev** تُنشر تلقائياً من `main` — لا تفعل شيئاً لها.
> ما يلي يخص **خادم الهاتف** (المدفوعات)، لأن ملفات الخادم لا تُنشر على Pages.

---

## 0) ملخّص هذه النسخة

| البند | الحالة |
|---|---|
| وسيلة الشحن التلقائي | **Binance Pay** (Merchant API v2) بدل **Cryptomus** — أُزيلت Cryptomus كلياً |
| ملفات إثبات ملكية Cryptomus | حُذفت من الجذر (`cryptomus_*.html`) ومعها سطور `_headers`/`_redirects` |
| متغيرات البيئة | `CRYPTOMUS_*` أُلغيت ⇒ `BINANCE_PAY_MERCHANT_ID` / `BINANCE_PAY_API_KEY` / `BINANCE_PAY_SECRET_KEY` |
| قاعدة البيانات | ترحيل تلقائي عند الإقلاع: `pay_transactions.method` يقبل `binance_pay` |
| الواجهة | زر Binance Pay في المحفظة + QR + «افتح Binance Pay» + شحن تلقائي بعد التأكيد |

---

## 1) المفاتيح (لا تُكتب في أي ملف كود — بيئة فقط)

```
BINANCE_PAY_MERCHANT_ID=132972522
BINANCE_PAY_API_KEY=<API key من بوابة تجار Binance>
BINANCE_PAY_SECRET_KEY=<Secret key>
BINANCE_PAY_CURRENCY=USDT          # اختياري (افتراضي USDT)
BINANCE_PAY_CERT_SN=<Certificate SN>   # اختياري — يُستعمل في ترويسة الطلب وترويسة الإشعار
BINANCE_PAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n…"   # اختياري — للتحقق من توقيع الإشعارات (RSA)
BINANCE_PAY_API_BASE=https://bpay.binanceapi.com          # اختياري — للاختبار على بيئة تجريبية
```

> [v2.45.1] هذه المتغيّرات الأربعة تُقرأ في `cf-worker/payments-core.js`؛ كانت لا تُمرَّر في
> `server-payments.js` فتُهمَل صامتةً على مسار الهاتف. صارت الآن ضمن `buildEnv`.
> توقيع إشعارات Binance هو **RSA-SHA256** بشهادة البوابة (تُجلَب تلقائياً من
> `/binancepay/openapi/certificates`) — لا HMAC بسرّ التاجر.

> إن كانت لوحة Binance تُظهر «Certificate SN» مختلفاً عن الـ API Key فاضبط `BINANCE_PAY_CERT_SN` به.
> ملف الأسرار المحلي على الهاتف: `/root/.secrets/dtsg-payments.txt` (صلاحيات 600).

---

## 2) الخطوات على الهاتف (3 دقائق)

```bash
cd /root/dmgames-arena            # الشجرة التي يشغّلها pm2 فعلاً
git fetch origin main && git reset --hard origin/main

# 1) تصدير المفاتيح (من بيئتك أو من ملف الأسرار)
set -a; . /root/.secrets/dtsg-payments.txt; set +a

# 2) إعادة التشغيل مع تحديث البيئة (يشغّل ترحيل القاعدة تلقائياً)
pm2 restart casino-server --update-env
pm2 logs casino-server --lines 40        # يجب أن يظهر: migrated pay_transactions.method → +binance +binance_pay
```

---

## 3) التحقق بعد التحديث (4 فحوص)

```bash
# 1) الوسائل: binance_pay يجب أن تكون live (لا soon)
curl -s localhost:3000/api/payments/methods | head -c 400

# 2) لم يبقَ أي مسار Cryptomus (يجب 404/405) — وإشعار Binance يجب أن يُردّ بجسم Binance
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/webhooks/cryptomus
curl -s -X POST localhost:3000/api/webhooks/binance -H 'content-type: application/json' -d '{"bizType":"PAY","bizStatus":"PAY_SUCCESS","data":"{}"}'

# 3) ملفات إثبات Cryptomus لم تعد تُخدَم (404)
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/cryptomus_5bf79cae.html

# 4) فحص شامل
bash scripts/phone-doctor.sh
```

---

## 4) اختبار حقيقي لإنشاء طلب (بلا دفع)

من المحفظة في الواجهة: «شحن» ← **Binance Pay** ← مبلغ 1$ ← تأكيد.
- **نجاح** ⇒ يظهر QR + زر «افتح Binance Pay» ويُسجّل إيداع `binance_pay` معلّق.
- **فشل البوابة** ⇒ رسالة «تعذر إنشاء الطلب (400004 …)» وإشعار للأدمن.

### ⚠️ شرط التفعيل الحي
بوابة Binance Pay ترفض الطلب إن لم يكن مفتاح التاجر مفعّلاً لـ **Merchant API** ومسموحاً له
**عنوان IP للهاتف** (أو كان المفتاح بلا قيود IP):

```
400004 Invalid API-key, IP, or permissions for action, request ip: <IP الهاتف>
```

الحل من بوابة تجار Binance: `Developer → API Keys` ⇒ فعّل الصلاحيات/أضف IP الحالي
(عنوان الهاتف قد يتغيّر ⇒ الأنسب مفتاح بلا قيد IP مع تعطيل السحب على المفتاح).

---

## 5) كيف يعمل الشحن التلقائي (للاطمئنان)

1. المستخدم يُنشئ طلباً ⇒ الخادم يسجّل إيداعاً `pending` ويعيد `checkoutUrl`.
2. يدفع المستخدم في Binance ⇒ Binance ترسل إشعاراً إلى `POST /api/webhooks/binance`.
3. الخادم **لا يثق بالإشعار**: يتحقق من التوقيع ثم **يستعلم من Binance** بحالة الطلب (طلب موقَّع بسرّنا).
4. عند `PAID` وبمبلغ مطابق ⇒ شحن ذرّي واحد للرصيد (+بونص الشريحة) وإشعار المستخدم والأدمن.
5. مبلغ ناقص ⇒ لا شحن آلي + تنبيه للأدمن. إشعار مكرر ⇒ لا شحن مزدوج (مطالبة ذرّية).

---

## 6) عند الحاجة للرجوع
النقاط الثلاث التي قد تحتاجها: `git log --oneline -5` · `cp <backup>/server-payments.js . && pm2 restart casino-server` ·
وأي طلب فاشل يظهر في **سجل المال** بالداشبورد مع سببه.
---

## v2.45.2 (2026-09-20) — لا خطوات جديدة على خادم الهاتف

هذه النسخة **واجهة/اختبارات/توثيق فقط** (الشطرنج المجاني + إسقاط مسار ڤيرسيل + ميثاق الحرّاس):
- **لا تغيير في مخطط قاعدة البيانات** ولا في `pay_transactions` ولا في متغيّرات البيئة.
- لا حاجة لإعادة تشغيل `casino-server` من أجلها؛ إعادة التشغيل مطلوبة فقط للإصدارات التي
  عدّلت `server.js`/`server-payments.js` (v2.45/v2.45.1 كما هو موصوف أعلاه).
- المرجع المُلزِم لمنع الانحدار: `docs/FIXES_FROZEN_v2451.md`.
