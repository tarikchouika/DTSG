# 🛠️ إصلاح خادم الهاتف (v2.40.4) — لأن المدفوعات كانت معطّلة والقاعدة مكشوفة

**تاريخ التشخيص:** 2026-09-17 · **الموقع:** https://dtsg.pages.dev · **الشجرة في GitHub:** v2.40.4

---

## 1) ما رُصد حيّاً (بالأدلة)

| # | المشكلة | الدليل الحيّ |
|---|---|---|
| 🔴 1 | **خادم الهاتف يعمل بشجرة قديمة جداً** — بلا طبقة المدفوعات | `package.json` المُخدَم يقول `"version": "2.5.1"` · `js/wallet.js` → 404 · `server-payments.js` → 404 · `payments-url.json` → 404 · `/api/health` بلا `build` |
| 🔴 2 | **كل مسارات المدفوعات معطّلة** (السحب/الإيداع/الكوبونات/الويب هوك) | العشرة كلها تردّ `{"ok":false,"error":"not_found"}`: `/api/payments/methods` · `/crypto` · `/p2p` · `/wallet/balance` · `/vouchers/*` · `/withdrawals/request` · `/api/webhooks/*` · `/api/telegram/webhook` |
| 🔴 3 | **قاعدة بيانات المستخدمين مكشوفة للإنترنت** | `https://casino-phone.dmgames-api.workers.dev/data/royalcoin.db` → **200 · 1.7 م.ب · SQLite format 3** (كذلك `server.js` 129ك.ب و `package.json`) |
| 🟠 4 | النفق يعيد 503 بعد كل إعادة تشغيل | العنوان في KV يتغيّر: كان `7502226724a23c` صار `a3f694ab99a2e4` — سليم تشغيلياً لكنه يعني أن أي إعادة تشغيل تحتاج تحديث KV (يفعله سكربت النفق تلقائياً) |
| 🟢 5 | بقية المنصة سليمة | 52 مساراً تعمل · `/api/health` 200 · `/api/rooms/*` · `/api/chat` · `/api/2fa/*` · تسجيل الدخول يعمل |

### السبب الجذري للمشكلة 1 و 2
`pm2` يشغّل مجلداً **غير** `/root/dmgames-arena`، أو التحديث لم يُطبَّق على المجلد المشغَّل أصلاً —
لذلك لا وجود لملفات v2.40 فيه. الشجرة المشغّلة شجرة النفق القديمة (قاعدة 2.5.1 + تعديلات النفق).

### السبب الجذري للمشكلة 3
خادم الهاتف القديم يخدم **أي ملف** داخل مجلده كملف ثابت: `data/royalcoin.db` و `server.js`
و `package.json` كانت متاحة لأي أحد يعرف الرابط. أُضيفت الحماية في v2.40.4.

---

## 2) الإصلاح في هذه النسخة (v2.40.4)

1. **حماية الملفات الحساسة في `server.js`** (`isDeniedStatic`):
   تُحجب `data/**` (كل قواعد البيانات) · `server*.js` · `package*.json` · `cf-worker/**` ·
   `scripts/**` · `tests/**` · `.env` · `.git/**` · `tunnel-live.json` — كلها تردّ 404 كأنها غير موجودة،
   مع حماية من تجاوز المسار (`..`, `%2e%2e`, `DATA/`, `Server.js`).
2. **`/api/health` يحمل هوية الإصدار:** `{"ok":true,"service":"dmgames-arena","build":"2.40.4","payments":true}` —
   للتحقق عن بُعد من أي جهاز أن الشجرة المشغَّلة جديدة فعلاً (لا «نجاح شكلي»).
3. **`scripts/phone-doctor.sh` (جديد):** تشخيص كامل بلا تعديل أي ملف — يطبع عمليات pm2 ومجلدها،
   من يخدم المنفذ، شجرة القرص مقابل ما يخدمه الخادم فعلاً، مسارات المدفوعات، والفحص الأمني، ثم حُكم نهائي.
4. **`scripts/update-phone-server.sh` (مُقوّاة):** تكتشف مجلد pm2 الحقيقي تلقائياً، تأخذ نسخة احتياطية
   للشجرة وللقاعدة، تتحقق من وجود ملفات المدفوعات بعد الجلب، وتتحقق **بعد** إعادة التشغيل من النسخة
   المشغَّلة محلياً وعبر الرابط العام، وتفشل بصوت عالٍ إن لم تنجح.
5. **`tests/_security_static_test.js` (جديد):** 34 فحصاً — يمنع رجوع التسريب مستقبلاً (34/34 ✓).

---

## 3) ما يجب فعله على الهاتف (بالترتيب)

```bash
# 0) تشخيص أولاً (بلا أي تغيير) — سيخبرك أي مجلد يخدم فعلاً
cd /root/dmgames-arena && git fetch origin && git reset --hard origin/main
bash scripts/phone-doctor.sh

# 1) التحديث الكامل (يكتشف مجلد pm2 تلقائياً + نسخة احتياطية + تحقق نهائي)
bash scripts/update-phone-server.sh

# 2) من أي جهاز آخر — التأكيد النهائي
curl -s https://casino-phone.dmgames-api.workers.dev/api/health
#    المتوقع: {"ok":true,"service":"dmgames-arena","build":"2.40.4","payments":true,...}
curl -s https://casino-phone.dmgames-api.workers.dev/api/payments/methods
#    المتوقع: {"ok":true,"methods":[...6 وسائل...]}
curl -o /dev/null -w '%{http_code}\n' https://casino-phone.dmgames-api.workers.dev/data/royalcoin.db
#    المتوقع: 404  (كان 200 — قاعدة البيانات مكشوفة!)
```

> ⚠️ إن أظهر `phone-doctor` أن pm2 يشغّل مجلداً آخر (مثلاً `/root/digital-moroccan-casino`)،
> فلا تحدّث ذاك المجلد يدوياً: السكربت سيتولّى ذلك، أو اضبط `DTSG_DIR=/المجلد/الصحيح`.

### حماية فورية للقاعدة قبل التحديث (اختياري)
إن أردت إغلاق التسريب قبل تنفيذ التحديث: أوقف النفق مؤقتاً (`pm2 stop dmgames-tunnel`) حتى تنتهي،
ثم أعد تشغيله (`pm2 start dmgames-tunnel`). لا تحاول نقل/حذف `data/` يدوياً — التحديث يتولّى كل شيء.
