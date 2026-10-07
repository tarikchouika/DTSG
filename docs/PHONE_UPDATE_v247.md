# تحديث الهاتف — v2.47 (بوت أكواد التعبئة · بايننس قراءة-فقط · سحب لأدمن الحساب)

> ⛔ [تدقيق 2026-10-07] **وثيقة من عصر v2.4x — ليست إجراءً حالياً ولا تُنفَّذ حرفياً.** المسار القديم `/root/dmgames-arena` (و`/root/digital-moroccan-casino`) **حُذف نهائياً في 2026-09-22** ⇒ ممنوع (القاعدة 2)، وكذلك `pm2 restart … --update-env` ممنوع (القاعدة 9 — حادثة 2026-09-22).
> **المسار المعتمد اليوم من `/root/DTSG`:** `bash scripts/update-phone-server.sh` (تحديث كامل) أو `bash scripts/phone-env-restart.sh` (إعادة تشغيل `casino-server` و`dtsg-voucher-bot` معاً بالبيئة الكاملة من `.env.local` ثم `pm2 save`) — والأسرار من `.env.local` وحده. المرجع الإلزامي: [`AGENTS.md`](../AGENTS.md).
> ما تحت هذا الشريط **محفوظ كسجلّ تاريخي** للاستئناس فقط — لا تنقل أوامره إلى الطرفالة.

## ١) اسحب الكود وشغّل
```bash
cd /root/DTSG
bash scripts/update-phone-server.sh    # ⛔ محلّه: git pull من شجرة قديمة + pm2 … --update-env (القاعدتان 2 و9)
```

## ٢) متغيّرات البيئة المطلوبة على الخادم (casino-server)
| المتغيّر | القيمة | لماذا |
|---|---|---|
| `BINANCE_PAY_API_KEY` | مفتاح Binance | للتحقق بوضع القراءة فقط |
| `BINANCE_PAY_SECRET_KEY` | سرّ المفتاح | توقيع الاستعلام HMAC-SHA256 |
| `BINANCE_PAY_ID` | `132972522` | معرّف Pay الذي يستقبلك المستخدمون |
| `BINANCE_PAY_CURRENCY` | `USDT` | عملة المطابقة |

```bash
# ⛔ ما كان يُنفَّذ (ممنوع بالقاعدة 9 — صدفة ناقصة مسحت كل المتغيّرات في 2026-09-22):
# export BINANCE_PAY_API_KEY=... BINANCE_PAY_SECRET_KEY=... BINANCE_PAY_ID=132972522 BINANCE_PAY_CURRENCY=USDT
# pm2 restart casino-server dtsg-voucher-bot --update-env && pm2 save
# ⛔ الصحيح اليوم: القيم في /root/DTSG/.env.local وحده، ثم:
bash scripts/phone-env-restart.sh    # يقرأ .env.local ⇒ يعيد تشغيل العمليتين ويتحقق من بيئتهما الحيّة ثم pm2 save
```

## ٣) ⚠️ مهم: `NODE_EXTRA_CA_CERTS` يعطّل كل نداءات HTTPS
إن كان في بيئة الخدمة متغيّر `NODE_EXTRA_CA_CERTS` يشير إلى ملف CA غريب (من أداة CLI مثلاً)
فسيسقط **كل** نداء Node للتلغرام (`fetch failed` / ETIMEDOUT) ⇒ بوت الفوتشير لا يستقبل تحديثات
وإشعارات الدفع لا تخرج. تحقّق وأصلح:
```bash
pm2 jlist | grep -o '"NODE_EXTRA_CA_CERTS":"[^"]*"'          # إن ظهر مسار ملف ⇒ أزِله من .env.local ثم
bash scripts/phone-env-restart.sh                           # ⛔ محلّه: NODE_EXTRA_CA_CERTS= pm2 restart … --update-env && pm2 save (القاعدة 9)
tail -f /root/.pm2/logs/dtsg-voucher-bot-error.log           # يجب أن يتوقف نمو الأخطاء
```

## ٤) ما يجب ضبطه في حساب Binance (مرة واحدة)
- API Key: **Enable Reading = ✅** · **Enable Withdrawals = ❌** (نحن لا نسحب عبر الـAPI أبداً).
- قيود IP: **Unrestricted** (بلا قيد) — لأن IP الخادم متغيّر (رُصد `41.140.47.188`).
- إن بقي الرفض فسيظهر في الفحص: `-2015 Invalid API-key, IP, or permissions`.

## ٥) التحقق الحيّ (بعد الإقلاع)
```bash
# ١) الوسائل: يجب أن يظهر binance_readonly=live و binance_pay_id
curl -s http://127.0.0.1:3000/api/payments/methods | grep -o '"binance_readonly":"[^"]*"'

# ٢) فحص المفتاح (أدمن): ok=true ⇒ جاهز للتحقق التلقائي
curl -s "http://127.0.0.1:3000/api/payments/binance-probe?tg_id=${TELEGRAM_ADMIN_CHAT_ID}" | python3 -m json.tool

# ٣) التحقق من تحويل فعلي: حوّل مبلغاً لمعرّف Binance ثم
curl -s -X POST http://127.0.0.1:3000/api/payments/binance-verify \
  -H 'content-type: application/json' \
  -d '{"user_id":"<معرّف المستخدم>","amount_usd":10}' | python3 -m json.tool
# credited/verified=true ⇒ شُحن الرصيد · not-found-yet ⇒ لم يصل بعد · readonly-unavailable ⇒ اضبط المفتاح
```

## ٦) سلوك البوت الجديد (@dtsgvoucher_bot)
- ⛔ لا سحب، لا رصيد، لا دعم — أي طلب آخر يُوجَّه للمحفظة/بوت الدعم.
- ✅ ربط الحساب ← وسيلة الدفع ← المبلغ ← المرجع ← الدليل ← مصادقة الإدارة ← **الكود يصلك في البوت**.
- الوصول السريع للمستخدمين من المنصة: **مركز المساعدة ← بوت أكواد التعبئة** (أو المحفظة ← زر البوت)،
  والرابط يربط حسابهم تلقائياً (`?start=plt_<id>`).

## ٧) سلوك السحب الجديد
طلب السحب من المحفظة يذهب إلى **تيليغرام أدمن الحساب الذي سجّل المستخدم** (`users.admin_id`) مع
أزرار ✅/❌، ونسخة رقابية للسوبر أدمن. المصادقة مقصورة على أدمن الحساب أو السوبر أدمن (في البوت
واللوحة معاً). الأدمن الذي لا يملك معرّف تيليغرام مسجَّلاً ⇒ السوبر أدمن هو من يصادق.
