# 📱 تحديث خادم الهاتف — DTSG v2.44
> **الواجهة على dtsg.pages.dev محدَّثة تلقائياً** (منشورة الآن) — لا تفعل شيئاً لها.
> ما يلي يخص **خادم الهاتف** (المدفوعات + بوت الشحن) لأن ملفات الخادم لا تُنشر على Pages.

---

## 0) ملخّص ما تغيّر في هذه النسخة

| العطل المُبلَّغ عنه | الإصلاح (منشور في الواجهة · يحتاج تحديث الخادم) |
|---|---|
| الرصيد يرجع لقيمته القديمة بعد التحديث | `/api/sync` لم يعد يقبل رصيد العميل إلا بمرجع مطابق (`gold_rev`) — **يحتاج `server.js` الجديد** |
| الكوينز لا تتحرك ويظهر «ما يعادل USD» غريباً | تسوية ذرية واحدة: التسوية = الكوينز، والـUSD **مشتق** من الكوينز (100 كوين/$) — `server-payments.js` |
| لا سجل شحن/سحب في داشبورد السوبر أدمن | جدول `money_log` + تبويب **«سجل المال»** + بثّ لحظي (`adminpay`) — `server.js` + الواجهة (منشورة) |
| بوت الفوتشير لا يعمل (bad-input) | **بوت جديد**: `scripts/voucher-bot.js` + `POST /api/bot/request` و `/api/bot/admin-act` |
| بارتشي: خانات مشوّهة/محشورة | هندسة v2.42 المسترجَعة (64×27.5 بلا تداخل) — واجهة فقط ✅ |
| شطرنج: قطع شفافة/غريبة | تدرّجات SVG تُحلّ الآن + بيدق كلاسيكي — واجهة فقط ✅ |
| ضاما: AI غبي/النفخ تضرر | `cloneState` + ذاكرة الواجب + إصلاح النفخ — واجهة فقط ✅ |

---

## 1) تحديث ملفات الخادم على الهاتف (5 دقائق)

على Termux (أو جهاز الخادم) داخل مجلد المشروع:

```bash
cd ~/DTSG                # أو مسار المشروع على هاتفك
git fetch origin main
git reset --hard origin/main      # يجلب v2.44 (a6a3f13)
# تأكد أن الملفات الثلاثة الجديدة وصلت:
grep -c "money_log" server.js && grep -c "settleGoldLocal" server-payments.js && grep -c "bot/admin-act" cf-worker/payments-core.js
```

ثم **أعِد تشغيل الخادم** (نفس متغيرات البيئة القديمة، أضف الجديدة إن أردت البوت):

```bash
export TELEGRAM_BOT_TOKEN="<توكن بوت المنصة>"      # كما كان
export ADMIN_API_SECRET="<سرّ الإدارة>"
export USD_GOLD_RATE=100
export TELEGRAM_ADMIN_CHAT_ID=5700612979
export SUPPORT_BOT_TOKEN="<توكن بوت الدعم>"        # كما كان
node --experimental-sqlite server.js
```

**تحقق سريع بعد التشغيل:**

```bash
curl -s localhost:PORT/api/health | head -c 200                       # يجب build محدّث
curl -s -X POST localhost:PORT/api/bot/request \
  -H 'content-type: application/json' \
  -d '{"tg_id":"5700612979","kind":"topup","amount_usd":100,"method":"cash_plus","details":"TEST"}'
# المتوقع: {"ok":true,...,"bonus_pct":25,"coins_on_approve":12500}
# إن ظهر bad-input مع missing ⇒ الخادم قديم (لم يُحدَّث).
```

---

## 2) تشغيل بوت الفوتشير (الشحن السريع)

### أ) أنشئ توكن البوت (مرة واحدة)
1. افتح **@BotFather** ← `/newbot` ← خُذ التوكن.
2. **مهم:** لا تضعه على نفس بوت المنصة إن كان يعمل بـ webhook — التشغيل بـ long-polling مع webhook مفعّل يعطي خطأ `409 Conflict`. استعمل توكن البوت الجديد `VOUCHER_BOT_TOKEN`.

### ب) شغّله
```bash
cd ~/DTSG
export VOUCHER_BOT_TOKEN="<توكن بوت الفوتشير>"
export API_BASE="http://127.0.0.1:PORT"        # نفس منفذ خادم المنصة على الهاتف
export SUPER_TG=5700612979                     # شات السوبر أدمن
export ADMIN_API_SECRET="<سرّ الإدارة>"        # لتمرير المصادقة من البوت
export CASH_PLUS_NAME="Tarik chouika"
nohup node scripts/voucher-bot.js > data/voucher-bot.log 2>&1 &
```
لإيقافه لاحقاً: `pkill -f voucher-bot.js` · لمراقبته: `tail -f data/voucher-bot.log`

### ج) كيف يستعمله المستخدم (رسالة تقوله إن سألك)
1. `/start` ← **🔗 ربط حسابي** ← يكتب اسم المستخدم في المنصة (مرة واحدة).
2. **🎟️ شحن سريع (كود تعبئة)** ← يختار الوسيلة (Cash Plus / Binance / Cryptomus / بنكي).
3. يكتب المبلغ بالدولار ← يرسل **دليل الدفع** (رقم العملية أو صورة الإشعار).
4. يصله: «📨 وصل طلبك إلى السوبر أدمن» مع المرجع والمبلغ وبونص الشريحة.

### د) دورك كسوبر أدمن
- تصلك رسالة بالطلب مع زرين: **✅ تأكيد وإصدار الكود** / **❌ رفض**.
- عند ✅: يصلك الكود `DTSG-XXXX-XXXX` ويُرسل **للمستخدم تلقائياً** في نفس المحادثة.
- المستخدم يفعّله من: **المنصة ← المحفظة ← تفعيل كود** ⇒ يُشحن رصيده فوراً:
  **الكوينز = المبلغ × 100 × (1 + بونص الشريحة)** (مثال: 100$ = 12,500 🪙 ببونص 25%).
- الكود يعمل **مرة واحدة** ولا يُشحن الرصيد مرتين (لا عند المصادقة ولا عند الإعادة).

> ملاحظة: طلبات الإيداع المباشر (من صفحة المنصة) تُشحن لحظة المصادقة؛ أما طلبات **كود التعبئة** فيُنشأ لها كود ويتحقق الشحن عند تفعيله — كما طلبتَ.

---

## 3) اختبار شخصي سريع (دقيقتان)

```bash
# 1) أنشئ طلباً لي (سوبر أدمن) عبر البوت أو curl أعلاه ⇒ يصلك إشعار في تيليغرام
# 2) اضغط ✅ في الإشعار ⇒ يصلك الكود في نفس الرسالة
# 3) فعّل الكود من المنصة بحسابك ⇒ تأكد أن الكوينز زادت والمبلغ USD اشتُق منها
# 4) أعد تفعيل نفس الكود ⇒ يجب أن يُرفض (already-used)
```

---

## 4) استكشاف الأخطاء

| الأعراض | السبب/الحل |
|---|---|
| البوت لا يرد | `tail -f data/voucher-bot.log` · توكن خاطئ · أو webhook مفعّل على نفس التوكن (409) ⇒ `/deleteWebhook` أو توكن جديد |
| الطلب يرد `bad-input` | خادم الهاتف لم يُحدَّث (شغّل `git reset --hard origin/main` وأعد التشغيل) |
| `user-not-found` | الحساب غير مربوط: المستخدم يكتب اسم المستخدم كما في المنصة (زر 🔗 ربط حسابي) |
| الكود لا يُصدر | `/api/bot/admin-act` يرفض غير السوبر أدمن (403) — تأكد من `SUPER_TG` و`ADMIN_API_SECRET` |
| الرصيد لا يزيد عند التفعيل | يجب أن يكون `server-payments.js` الجديد فعّالاً (settleGoldLocal) — تحقق من `grep -c settleGoldLocal server-payments.js` |

---

## 5) التحقق من الواجهة (منشورة فعلاً ✅)

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://dtsg.pages.dev/js/games/parchisi.js?v=dtsg11"
curl -s "https://dtsg.pages.dev/js/games/dama.js?v=dtsg12" | grep -c obligationInfo      # 2
curl -s "https://dtsg.pages.dev/js/games/chess.js?v=dtsg7" | grep -c chDefsHost          # 1
```
