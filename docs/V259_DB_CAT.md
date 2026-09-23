# v2.59 — دليل مساعد قاعدة البيانات (cat) — الإصدار الجاهز للإطلاق 📱🗄️

**التاريخ**: 2026-09-23
**النسخة على الهاتف بعد هذه الجولة**: `main` (تقرير الجولة-4: CONDITIONAL → كل ما تبقّى هو تنفيذك لهذه الخطوات)
**ملف القاعدة**: `data/royalcoin.db` (SQLite — وضع WAL) — **نفس الملف الوحيد**: فيه `users` و`transactions` و`money_log` و`pay_transactions` و`sup_tickets` (الدعم) وغيرها.

---

## 0) خلاصة موجزة (اقرأ هذا أولاً)

1. **لا هجرة، لا عمود جديد، لا تغيير مخطط** في v2.59 — كل التعديلات منطقية (بوابة البوت + CORS + حارس الإقلاع). لا تشغّل أي `ALTER TABLE` أو `MIGRATION`.
2. **3 أعمال تنظيف** متبقية قبل الإطلاق (آثار الفحص من الجولات السابقة) — الأوامر الحرفية في §3.
3. **ممنوع منعاً باتاً**: تعديل `users.gold` أو `pay_transactions` أو `money_log` يدوياً خارج مسارات موثقة في هذا الدليل · حذف أي صف · لمس حساب المالك `Tarikch` (id **252**) إلا بالبنود الحرفية أعلاه.
4. **النسخ الاحتياطي إلزامي** قبل أي أمر SQL (§4) — ثم نفّذ → تحقق (§5).
5. **إعادة التشغيل حصراً** عبر `scripts/phone-env-restart.sh` — ومعها **متغير جديد إلزامي: `BOT_API_SECRET`** (§6).

---

## 1) ما الذي تغيّر في v2.59 (خلفية لقراراتك)

| بند | ما حدث | أثره على القاعدة |
|---|---|---|
| R3-001 (حرجة) | `/api/bot/request` كان **بلا أي مصادقة**: أي غريب من الإنترنت كان ينشئ سحباً باسم أي ضحية و**يُخصم الرصيد فوراً** (تقرير الجولة-4: ضحية 998→498 كوينز) | أُنشئت صفّات `pay_transactions` زائدة (سحوبات شبحية) في **البيئة المعزولة فقط** هذه الجولة — لا جديد في الإنتاج، لكن الجولات 1-3 أوجدت آثاراً في الإنتاج (§3) |
| R3-002 (عالية) | `/api/bot/link` بلا مصادقة: ربط أي تيليغرام بأي حساب | ربط زائف `telegram_id` محتمل — تم التحقق: `999888777` مربوط بحساب 252 من جولة-3 (§3) |
| R4-001 (متوسطة) | CORS كان يثق بأي `*.e2b.app`/`*.arena.ai` | لا أثر على القاعدة |
| R4-003 | حارس إقلاع صاخب إن وُجد `DM_TEST_MODE=1` مع أسرار إنتاج حقيقية | لا أثر على القاعدة |

**بوابة البوت الجديدة (لمعرفتك)**: كل استدعاء `/api/bot/request` أو `/api/bot/link` يجب أن يحمل ترويسة
`x-bot-secret: $BOT_API_SECRET` (أو `x-admin-secret` بنفس قيمة `ADMIN_API_SECRET`) — وإلا `401`.
وحدّ معدل 30/دقيقة لكل IP على المسارات. **إن لم تعمل البوتات بعد النشر ⇒ السبب الأول دائماً: `BOT_API_SECRET` غير مضبوط في البيئتين** (§6).

---

## 2) حدود صلاحيتك (إلى cat حصراً)

### ✅ مسموح
- النسخ الاحتياطي للقاعدة وفق §4 (قبل أي عمل).
- أعمال التنظيف الثلاثة في §3 **كلمحرفها** (لا تعديل في الأرقام أو الشروط).
- فحوص الصحة والصلاحية في §5 (قراءات `SELECT` و`PRAGMA integrity_check` فقط).
- إغلاق التذاكر الداعمة (`sup_tickets.status`) **بعد** إبلاغ المالك.
- إعادة تشغيل الخدمات عبر `scripts/phone-env-restart.sh` حصراً.

### 🚫 ممنوع (مطلقاً)
- أي `UPDATE users SET gold=...` / تعديل رصيد / تعديل `pass_hash` / `role` — أبداً.
- أي `DELETE` من `users` أو `pay_transactions` أو `money_log` أو `transactions` — أبداً (النظافة = تغيير `status` فقط).
- `VACUUM` على قاعدة حية مزدحمة دون إذن صريح من المالك (يقفل الجداول).
- نسخ `royalcoin.db` إلى المستودع أو رفعه إلى GitHub بأي شكل (ملف خاص).
- تشغيل أي سكربت يبدأ بـ`cd` نحو شجرة قديمة أو `git checkout main && git pull` (نمط الحادثة القديمة — الحارس الميكانيكي `tests/_ops_guards_test.js` يُسقط هذا فوراً).
- تعديل متغيرات العمليات يدوياً بـ`pm2 restart --update-env` الحر (حادثة 2026-09-22).
- تشغيل الخادم بإنتاج مع `DM_TEST_MODE=1` (الآن حارس الإقلاع سيصرخ في اللوج — إن رأيته ⇒ أطفئ العَلَم فوراً وأخبر المالك).

---

## 3) أعمال التنظيف قبل الإطلاق (من تقرير الجولة-4 §8 + جولة-3)

> **القاعدة الذهبية**: الرفض/الإغلاق عبر **واجهة الأدمن أولاً** (الاسترداد التلقائي + إشعار المستخدم + تدقيق).
> أمر SQL البديل موجود **فقط** لو تعذّر الوصول للوحة — وكل أمر SQL يسبقه نسخ احتياطي (§4) ويليه تحقق (§5).

### 3.1) سحب معلّق من آثار الفحص — رفضه (يُسترد المبلغ تلقائياً)

سحبون معلّقان في `pay_transactions` (status=`pending`) من جولات الفحص السابقة:

| المعرّف | المصدر | المبلغ |
|---|---|---|
| `wd-mudoc0qe11yh64` | PoC جولة-3 | 1 USD |
| `wd-mudeheka5h75oc` | PoC جولة-2/3 | 1 USD |

**المسار الموثوق (الواجهة):**
```bash
# قائمة المعلق حالياً (يجب أن يظهر فيها السحبان أعلاه إن لم يُنفذا بعد):
curl -s -L "https://casino-phone.dmgames-api.workers.dev/api/admin/payments/pending" -H "x-admin-secret: $ADMIN_API_SECRET"

# رفض كل واحد (الاسترداد تلقائي لحساب المالك + إشعار):
curl -s -L -X POST "https://casino-phone.dmgames-api.workers.dev/api/admin/payments/act" \
  -H 'content-type: application/json' -H "x-admin-secret: $ADMIN_API_SECRET" \
  -d '{"tx_id":"wd-mudoc0qe11yh64","action":"reject"}'

curl -s -L -X POST "https://casino-phone.dmgames-api.workers.dev/api/admin/payments/act" \
  -H 'content-type: application/json' -H "x-admin-secret: $ADMIN_API_SECRET" \
  -d '{"tx_id":"wd-mudeheka5h75oc","action":"reject"}'
```
النتيجة المتوقعة: `{"ok":true,"result":{"ok":true,"done":"withdrawal-rejected-refunded",...}}`

**بديل SQL (فقط لو عطلت الواجهة) — على الهاتف، بعد نسخ احتياطي:**
```bash
sqlite3 data/royalcoin.db <<'SQL'
BEGIN IMMEDIATE;
-- 1) وسم الرفض ذرّياً (الفائز الأول فقط — لا استرداد مزدوج):
UPDATE pay_transactions SET status='rejected', reviewed_by='cat-db-cleanup', reviewed_at=strftime('%s','now')*1000
 WHERE id IN ('wd-mudoc0qe11yh64','wd-mudeheka5h75oc') AND status='pending' AND type='withdrawal';
-- 2) استرداد المبالغ لصاحبها (نسبة الإنتاج: 100 كوينز لكل 1 USD — تأكد من USD_GOLD_RATE في بيئة الهاتف قبل التنفيذ):
UPDATE users SET gold = gold + (
   (SELECT COUNT(*) FROM pay_transactions p WHERE p.user_id = users.id
     AND p.id IN ('wd-mudoc0qe11yh64','wd-mudeheka5h75oc') AND p.status='rejected' AND p.reviewed_by='cat-db-cleanup') * 100)
 WHERE id IN (SELECT user_id FROM pay_transactions WHERE id IN ('wd-mudoc0qe11yh64','wd-mudeheka5h75oc'));
-- 3) سطر التدقيق في سجل المال (حتى يظهر السجل متطابقاً):
INSERT INTO money_log (user_id, kind, amount_usd, coins, status, ref, note, actor, created_at)
 SELECT user_id, 'withdrawal', amount_usd, CAST(amount_usd*100 AS INTEGER), 'rejected', id, 'refund-via-sql-cleanup', 'cat-db-cleanup', strftime('%s','now')*1000
 FROM pay_transactions WHERE id IN ('wd-mudoc0qe11yh64','wd-mudeheka5h75oc') AND reviewed_by='cat-db-cleanup';
COMMIT;
SQL
```
⚠️ **قبل تنفيذ البديل**: تحقق أن السحبين ما زالا `pending` (لا تسترد مرتين):
```bash
sqlite3 data/royalcoin.db "SELECT id, user_id, amount_usd, status FROM pay_transactions WHERE id IN ('wd-mudoc0qe11yh64','wd-mudeheka5h75oc');"
```
وإذا كانت `status` ليست `pending` ⇒ **توقف** وأبلغ المالك (ربما نُفذ/رُفض سابقاً).

### 3.2) فك ربط تيليغرام زائف عن حساب المالك

ربط `999888777` (هوية PoC) بحساب المالك (id 252) من جولة-3:
```bash
# تحقق أولاً (يجب أن يظهر سطر واحد):
sqlite3 data/royalcoin.db "SELECT id, username, telegram_id FROM users WHERE telegram_id = '999888777' OR id = 252;"

# فك الربط:
sqlite3 data/royalcoin.db "UPDATE users SET telegram_id = NULL WHERE telegram_id = '999888777';"

# تحقق بعد:
sqlite3 data/royalcoin.db "SELECT COUNT(*) FROM users WHERE telegram_id IS NULL OR id = 252;"
```
🚫 **لا تفك أي `telegram_id` آخر** — ربطات اللاعبين حقيقية ومطلوبة للبوتات.

### 3.3) إغلاق تذكرة الدعم #3 (رسالة XSS من جولة-1)

**المسار الموثوق**: لوحة الدعم ⇒ التذكرة #3 ⇒ إغلاق (أو أمر البوت الداعم).
**بديل SQL (بعد إبلاغ المالك):**
```bash
sqlite3 data/royalcoin.db "UPDATE sup_tickets SET status='closed', closed_at=strftime('%s','now')*1000, close_reason='poC-test-message-round1' WHERE id = 3 AND status != 'closed';"
sqlite3 data/royalcoin.db "SELECT id, status, close_reason FROM sup_tickets WHERE id = 3;"
```

---

## 4) النسخ الاحتياطي (إلزامي قبل أي SQL)

```bash
cd ~/DTSG
TS=$(date +%Y%m%d-%H%M%S)
# 1) تحقّق WAL حتى يكون الملف صورة متسقة:
sqlite3 data/royalcoin.db "PRAGMA wal_checkpoint(TRUNCATE);"
# 2) نسخة ساخنة آمنة (أفضل من cp لأن SQLite يكتبها بسلامة):
sqlite3 data/royalcoin.db ".backup 'backups/royalcoin-pre-v259-cleanup-$TS.db'"
# 3) تحقق من سلامة النسخة:
sqlite3 "backups/royalcoin-pre-v259-cleanup-$TS.db" "PRAGMA integrity_check; SELECT COUNT(*) FROM users;"
```
- مخرج المتوقعة: `ok` + عدد المستخدمين (حالياً ≈ 40).
- النسخ في `backups/` **خارج** git (في `.gitignore` أو خارج الشجرة) — لا تُرفع أبداً.
- احتفظ بالنسخة 30 يوماً ثم احذفها (تحوي بيانات شخصية).

---

## 5) فحوص ما بعد التنظيف (§5 = توقيع الإنجاز)

نفّذها كلها وأرسل المالك المخرجات:
```bash
# أ) لا سحوبات معلقة من آثار الفحص:
sqlite3 data/royalcoin.db "SELECT id, user_id, amount_usd, status FROM pay_transactions WHERE status='pending';"
#   المتوقعة: لا صفوف (أو صفوف حقيقية للمستخدمين فقط — إن وُجدت، لا تلمسها وأبلغ المالك)

# ب) لا ربط زائف:
sqlite3 data/royalcoin.db "SELECT COUNT(*) FROM users WHERE telegram_id = '999888777';"
#   المتوقعة: 0

# ج) التذكرة 3 مغلقة:
sqlite3 data/royalcoin.db "SELECT id, status FROM sup_tickets WHERE id = 3;"
#   المتوقعة: 3 | closed

# د) تطابق سجل المال مع السحوبات المرفوضة (سطر استرداد لكل سحب مرفوض بمعرّف cat):
sqlite3 data/royalcoin.db "SELECT kind, status, ref, actor FROM money_log WHERE actor='cat-db-cleanup';"

# هـ) سلامة عامة:
sqlite3 data/royalcoin.db "PRAGMA integrity_check;"
#   المتوقعة: ok
```

---

## 6) إعادة التشغيل + البيئة الجديدة (إلزامي مع v2.59)

### 6.1) المتغير الجديد `BOT_API_SECRET`
إن لم يُضبط، **كل** استدعاءات البوتات للـAPI تُرفض بـ401 (هذا مقصود — البوابة مغلقة). اضبطه في بيئتي pm2:
- `casino-server` (خادم الهاتف)
- `dtsg-voucher-bot` (بوت الأكواد)

القيمة: سلسلة عشوائية طويلة (≥32 حرفاً)، **مختلفة** عن `ADMIN_API_SECRET` إن أمكن. إن لم تغيّرها فوراً، يعمل البوت بـ`ADMIN_API_SECRET` الحالي (البوابة تقبلهما) لكن يُفضَل سرّ منفصل — لو تسرّب سرّ البوت لا يتأثر التحكم الإداري.

### 6.2) التسلسل الحرفي (على الهاتف)
```bash
cd ~/DTSG
git fetch origin main && git reset --hard origin/main     # أحدث الشيفرة فقط — لا فرع، لا merge
# أضف BOT_API_SECRET إلى ملف البيئة (عبر phone-env-restart.sh — لا pm2 حر):
bash scripts/phone-env-restart.sh                          # يعيد الإقلاع + يتحقق حيّاً من متغيرات العمليات (pm2 jlist)
curl -s http://127.0.0.1:3000/api/health                  # {"ok":true,...}
# فحص البوابة الجديدة من الهاتف نفسه:
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/bot/request -H 'content-type: application/json' -d '{}'
#   المتوقع: 401
BOT_API_SECRET=*** curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/bot/request -H 'content-type: application/json' -H "x-bot-secret: $BOT_API_SECRET" -d '{}'
#   المتوقع: 400 (عبر البوابة إلى المعالج — bad-input)
# السكربت الشامل (ينشئ طلبَيْ معاينة ثم يرفضهما — نظيف):
BOT_API_SECRET=*** bash scripts/verify-phone-v244.sh
```
### 6.3) إن ظهرت في اللوج عند الإقلاع:
```
⚠️️ DM_TEST_MODE=1 مفعّل مع علامات إنتاج (...)
```
⇒ **أطفئ `DM_TEST_MODE` من بيئة الهاتف فوراً** (يجب أن يكون `0`/غائباً في الإنتاج) وأعد الإقلاع عبر `phone-env-restart.sh` — هذا حارس R4-003 الجديد: العَلَم يفتح التسجيل العام بشحن 100,000 كوينز + باب `qa-admin-secret`.

---

## 7) تسلسل الإطلاق الكامل (ما بعد cat)

ترتيب تقرير الجولة-4 §7 — أنجزتُ (الجلسة) البندين 1-2 كودياً؛ الباقي على الهاتف/الحسابات:

| # | البند | الحالة |
|---|---|---|
| 1 | بوابة البوت (سرّ + حدّ معدل) | ✅ في `main` — **يتطلب `BOT_API_SECRET` في البيئة** (§6) |
| 2 | لاحقات الساندبوكس خلف `DM_TEST_MODE` + حارس الإقلاع | ✅ في `main` |
| 3 | نشر v2.59 على الهاتف (`update-phone-server.sh`) | ⏳ على الهاتف |
| 4 | رقعة الوسيط `casino-phone` (3 تعديلات حرفية موثقة في `CURRENT_TASK.md` §v2.58-أ) + `BOT_API_SECRET` في بيئة الوسيط إن مرّ البوت عبره | ⏳ على حساب dmgames-api |
| 5 | نشر الواجهة (`deploy-pages.sh` — يجلب أحدث من GitHub أولاً) | ⏳ |
| 6 | نافذة تحقق بعد النشر (≥ ساعة): `verify-phone-v244.sh` + فحص رؤوس الوسيط | ⏳ المالك + هذه الجلسة تعيد التدقيق على الطلب |

---

## 8) أسئلة متوقعة (إجابات حاسمة)

- **«السحب `wd-...` رُفض — هل عاد المالك للمال؟»** ⇒ نعم تلقائياً عبر الواجهة (رسالة `withdrawal-rejected-refunded`) — تحقّق من `users.gold` لـ id 252 و`money_log`. لو كان الرفض عبر SQL فتأكد أن سطر §3.1-3 (سجل المال) موجود.
- **«البوت لا يرد بعد النشر»** ⇒ 401: اضبط `BOT_API_SECRET` في بيئتي `casino-server` و`dtsg-voucher-bot` ثم `phone-env-restart.sh`. البوت نفسه (`scripts/voucher-bot.js`) أرسل الترويسة تلقائياً منذ v2.59.
- **«استدعاءات كثيرة 429 على /api/bot/*»** ⇒ طبيعي: حدّ 30/دقيقة لكل IP — حجم البوت المشروع أقل منه بكثير. إن حدث لبوتاتكم: أبلغ المالك (لا ترفع الحدّ بنفسك).
- **«أرى `DM_TEST_MODE=1` في بيئة الإنتاج»** ⇒ خطأ تشغيلي حقيقي: أطفئه الآن، أعد الإقلاع، وأرسل اللوج للمالك.
- **«أين النسخ الاحتياطية؟»** ⇒ `backups/` على الهاتف فقط — لا تُرفع إلى GitHub إطلاقاً.
