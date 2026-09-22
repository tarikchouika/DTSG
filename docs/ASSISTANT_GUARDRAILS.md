# 🛡️ ملف تحذيري إلزامي — DTSG: مستودع واحد · فرع واحد

> **اقرأه كاملاً قبل أي `git push`.** مستخدَم مع [`AGENTS.md`](../AGENTS.md) في جذر المستودع.
> آخر تحديث: 2026-09-21 · السبب: حادثة فرع `arena/01a0bd39-dtsg` (تحقيق كامل أدناه).

---

## 1) الحادثة: ماذا حدث بالضبط

| الحدث | التفصيل |
|---|---|
| المالك لاحظ | وجود **فرعين** في `github.com/tarikchouika/DTSG` بينما السياسة فرع واحد (`main`) |
| الفرع الملاحظ | `arena/01a0bd39-dtsg` — رأسُه `eb26dd1d4` |
| ما ظنّناه أولاً | أنه فرع من الريبو **القديم** دُفع للجديد بالخطأ |
| التحقيق | أُجري عبر GitHub API على المستودعين (النتائج في القسم 2) |
| الإجراء | حُذف الـref بعد إثبات `behind_by = 0` (صفر كوميت غير مدموج) — الكائن `eb26dd1d4` لا يزال قابلاً للاسترجاع على GitHub |

---

## 2) الأدلة الرقمية (كلها قابلة لإعادة التحقق)

### أ) تواريخ الإنشاء والدفع

| المستودع | أُنشئ | آخر دفع |
|---|---|---|
| `tarikchouika/digital-moroccan-casino` (**القديم**) | 2026-08-12 | **2026-09-16 07:45** |
| `tarikchouika/DTSG` (**الجديد**) | **2026-09-16 07:56** | متجدد |

⇒ الجديد أُنشئ بعد آخر دفع للقديم بـ**11 دقيقة** — لحظة الترحيل.

### ب) مصدر الفرع المحذوف

| الفحص | النتيجة |
|---|---|
| `GET /repos/DTSG/git/ref/heads/arena/01a0bd39-dtsg` | **كان موجوداً** في الجديد |
| `GET /repos/digital-moroccan-casino/git/ref/heads/arena/01a0bd39-dtsg` | **404 — لم يوجد في القديم إطلاقاً** |
| كوميتات الفرع (`eb26dd1d4` · `973691885` · `34f55af19`) في القديم؟ | **غير موجودة** (كلها DTSG) |
| `compare/arena/01a0bd39-dtsg...main` | `behind_by = 0` ⇒ **صفر محتوى فريد** |
| آخر كوميت في القديم | `f2a401565` · 2026-09-16 07:17 · دمج `arena/01a0a670-digital-moroccan-casino` |

**الاستنتاج:** الفرع المحذوف كان **فرع جلسة داخل DTSG** (معرّف الجلسة `01a0bd39`)، محتواه (v2.46–v2.48:
الضومنة/الطاولة/تدوير المفاتيح) لا وجود له في الريبو القديم، وكل كوميتاته صارت داخل `main`.
⇒ الحذف لم يُفقد شيئاً.

### ج) لكن الهاجس كان صحيحاً — والسبب الجذري موثّق في شجرتنا نفسها

`docs/PHONE_HANDOFF_v248.md` (سطر 139) يقول حرفياً:

> `/root/dmgames-arena` **ليست** نسخة من مستودع DTSG: هي worktree للمستودع `digital-moroccan-casino`
> (فرع `arena/samsung-fixes-20260911`). أي `git checkout main && git pull` داخلها يطمس الموقع الحيّ بكود قديم.

و`GITHUB_SYNC.md` (سطر 226) يوثّق نفس اللبس: مسار `/root/digital-moroccan-casino/` القديم + فرع
`arena/01a081af-digital-moroccan-casino`.

و`scripts/deploy-pages.sh` (سطر 28) **كان** يجلب افتراضياً فرع الريبو القديم:

```bash
BRANCH_SOURCE="${DMG_SOURCE_BRANCH:-origin/arena/01a081af-digital-moroccan-casino}"   # ← أُصلح ليصير origin/main
```

**الخلاصة السببية:** وجود **مجلدين على الهاتف** (قديم worktree للقديم + جديد للمستودع DTSG)
+ **تشابه أسماء فروع الجلسات** (`arena/<id>-dtsg` ⟷ `arena/<id>-digital-moroccan-casino`)
+ **مصدر فرع قديم افتراضي في سكربت النشر** = بيئة جاهزة للدفع إلى المستودع الخطأ.
الفرع المحذوف لم يكن من القديم — لكن الخطر الذي أنذر به المالك **حقيقي وموجود**، وقد أُغلق الآن (القسم 4).

---

## 3) القواعد: افعل / لا تفعل

### ✅ افعل

1. **قبل أي عمل:** `bash scripts/preflight-repo.sh` (يفحص الهوية والفرع والنظافة ويفشل بصوت عالٍ).
2. اعمل في مجلد المستودع الجديد فقط، على `main`:
   `git fetch origin main && git reset --hard origin/main` (بعد التأكد أنك في المجلد الصحيح).
3. بعد كل إصلاح: `bash scripts/qa-env.sh` ثم الأجنحة المعنية، وتحقق بمتصفح حقيقي، ثم تحقّق من الإنتاج ببصمة `sha256`.
4. قبل الدفع: `node tests/_repo_hygiene_test.js` (لا أسرار) + `node tests/_repo_origin_test.js` (لا مصادر بائتة).
5. عند أي شك: **توقّف واكتب تقريراً** للمالك بالدليل (`git remote -v` · `git log` · `compare`).

### ⛔ لا تفعل

| ممنوع | لماذا |
|---|---|
| `git push` لأي فرع غير `main`، أو إنشاء `arena/*` | يكسر سياسة «فرع واحد» ويُربك المالك |
| `git push --all` / `--mirror` | يدفع كل المراجع (بما فيها فروع قديمة عالقة) |
| `git push -f` على `main` | يمحو كوميتات الآخرين |
| `git checkout/pull` داخل `/root/dmgames-arena` أو `/root/digital-moroccan-casino` | worktree للمستودع **القديم** ⇒ يطمس الموقع الحيّ بكود v2.28 |
| حذف فرع/وسم بلا إثبات `behind_by = 0` + إذن المالك | احتمال فقدان عمل غير مدموج |
| تغيير أسماء موارد الإنتاج (`casino-phone` · `casino-api` · `dmgames-api.workers.dev` · `casino-server`) | كسر الخادم الحيّ والنفق |
| كتابة أي توكن/سرّ في ملف متتبَّع | المستودع **عام** |
| `BRANCH_SOURCE` أو أي مصدر git يشير إلى `*-digital-moroccan-casino` | يعيد لبس المستودعين |

---

## 4) ما أُصلح فعلاً في هذه الجولة

| الإصلاح | الملف |
|---|---|
| مصدر الفرع الافتراضي للنشر صار `origin/main` + تحذير صريح عند تجاوزه | `scripts/deploy-pages.sh` |
| فحص ما قبل العمل (هوية المستودع + الفرع + الفروع الغريبة + علامات المجلد القديم) | `scripts/preflight-repo.sh` (جديد) |
| حارس دائم يمنع رجوع المصادر البائتة وصيغ الدفع الخطِرة | `tests/_repo_origin_test.js` (جديد) |
| مرجع قصير إلزامي للوكلاء في جذر المستودع | `AGENTS.md` (جديد) |
| هذا الملف (السرد + القواعد + الأدلة) | `docs/ASSISTANT_GUARDRAILS.md` (جديد) |

---

## 5) إجراءات الطوارئ

**إن اكتشفت أنك دفعت إلى المستودع الخطأ:**
1. لا تحذف ولا تدفع شيئاً آخر.
2. سجّل: `git remote -v` · `git branch -vv` · `git log --oneline -5` · رابط الكوميت.
3. أبلغ المالك فوراً مع الدليل، واقترح الخيارات (إبقاء · حذف الـref بعد إثبات `behind_by=0` · دمج).

**إن شككت أن مجلداً هو القديم:**
```bash
git -C <المجلد> remote -v    # إن ظهر digital-moroccan-casino أو فرع samsung-fixes ⇒ هذا القديم: لا git pull فيه
```
⚠️ المجلدان القديمان `/root/dmgames-arena` و`/root/digital-moroccan-casino` **حُذفا نهائياً (2026-09-22)**؛
قواعد بياناتهما في `/root/dtsg-db-archive-*`. إن ظهر أي منهما مرة أخرى فذلك خطأ من مساعد: لا تعمل فيه وأبلغ.

**إن أردت استرجاع فرع حُذف:**
```bash
# الكائنات تبقى على GitHub بعد حذف الـref لفترة
curl -s -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/tarikchouika/DTSG/commits/<SHA>
# ثم: POST /git/refs  {"ref":"refs/heads/<name>","sha":"<SHA>"}
```

---

## 6) المراجع

- `AGENTS.md` — القواعد المختصرة (تُقرأ أولاً).
- `GITHUB_SYNC.md` — تاريخ المزامنة والبنية التحتية (مسار الخادم القديم، الفروع القديمة).
- `docs/PHONE_HANDOFF_v248.md` — تحذير الـworktree القديم + إجراءات الهاتف.
- `docs/PHONE_DB_TUNNEL_GUIDE.md` — تشغيل خادم الهاتف والنفق.
- `tests/_repo_origin_test.js` · `tests/_repo_hygiene_test.js` — الحرّاس الآليون.

---

## 7) حادثة 2026-09-22 — مسح بيئة الخادم (درس مُوثَّق) 🚨

**الجلسة المرجعية:** `session_03706ffb-d786-4c39-a96c-e6603e1c6d36` (أداة مساعدة ثانية) —
سجلها الكامل: `/root/.kimi-code/server/events/session_03706ffb-d786-4c39-a96c-e6603e1c6d36.jsonl`
ونسخة محفوظة: `/root/_dtsg-safety-20260922-1603/kimi-session/` (وقبلها في `/root/_dtsg-safety-20260922-1603/pm2/`).

### ماذا فعلت بالضبط
1. بدأت بـ`cd /root/digital-moroccan-casino && git checkout main` — **المستودع القديم** ⇒ ‏`fatal: 'main' is already used by worktree at '/root/dmgames-arena'` (دليل اللبس).
2. نفّذت أمراً واحداً قاتلاً:
   ```bash
   export PRIVATE_CHAT_BOT_TOKEN=... PRIVATE_CHAT_BOT_USERNAME=... PRIVATE_CHAT_WEBHOOK_SECRET=...
   pm2 restart casino-server --update-env
   ```
   `--update-env` يستبدل بيئة العملية ببيئة **الصدفة الحالية** ⇒ مُسحت من `casino-server`:
   `BINANCE_PAY_*` (تعطّل التحقق التلقائي) · `SUPPORT_WEBHOOK_SECRET` (صار الويبهوك يقبل أي سرّ) ·
   `SUPPORT_BOT_USERNAME` · `ADMIN_API_SECRET` · `TELEGRAM_BOT_TOKEN` (إشعارات الدفع) ·
   وقيم `CASH_PLUS_ACCOUNT`/`CIH_*`/`BINANCE_TRC20`.
3. **ولّدت سرّاً جديداً لبوت الدردشة الخاصة** (`crypto.randomBytes(32)`) ووضعته على الخادم
   **دون** `setWebhook` ⇒ تيليغرام بقيت ترسل السرّ القديم (أو بلا ويبهوك إطلاقاً) ⇒ البوت لا يستجيب.
4. ثم `pm2 save` ⇒ **حُفظت الحالة المكسورة** فأصبح أي `pm2 restart` (وأي `pm2 resurrect` بعد إعادة تشغيل)
   يعيد العطل تلقائياً.

### الأدلة التي تثبت الأثر
- `pm2 jlist` آنذاك: `BINANCE_PAY_*: MISSING` · `SUPPORT_WEBHOOK_SECRET: MISSING` · `ADMIN_API_SECRET: MISSING` · `TELEGRAM_BOT_TOKEN: MISSING`.
- `getWebhookInfo` لبوت الدعم: `url=https://a3acb985c03e27.lhr.life/api/support/webhook` (نفق مؤقت ميت) ·
  `last_error="Wrong response from the webhook: 503"` · `pending_update_count=4`.
- بوت الدردشة الخاصة: `url=""` (بلا ويبهوك) — أي معطّل تماماً.
- ويبهوك بوت المنصة (المالي): `https://dtsg-payments.tarikc.workers.dev/api/telegram/webhook` ⇒ **404 · error code 1042**
  (الووركر غير موجود في أي حساب: قائمة ووركرات الحسابين لا تحوي `dtsg-payments`).
- سطر KODE مُنشأ 13:53 بقيمة 450$ ببونص **0%** ⇒ دليل عطل شرائح البونص للحساب الإداري.

### الإجراء الصحيح (الوحيد المسموح)
```bash
cd /root/DTSG
bash scripts/phone-env-restart.sh
```
المصدر الوحيد للأسرار: `/root/DTSG/.env.local` (chmod 600 · مُستثنى في `.gitignore`).
السكربت يرفض العمل إن نقص أي مفتاح أو إن كان المجلد/الـremote هو المستودع القديم، ويتحقق من البيئة
**داخل العملية الحيّة** قبل `pm2 save`.

### ما أُصلح في هذه الجولة
| المتضرّر | الحالة بعد الإصلاح |
|---|---|
| Binance Pay (تحقّق تلقائي) | `pay_id=132972522` · `binance_readonly=configured` · `live` |
| بوت الدعم @dtsgsupports_bot | ويبهوك على `casino-phone.dmgames-api.workers.dev` + سرّ متطابق · `pending=0` · بلا `last_error` |
| بوت الدردشة الخاصة @dtsgprivatechat_bot | ويبهوك جديد + سرّ متطابق · الوصول للخادم 200 |
| بوت المنصة (المالي) | وُجّه إلى `/api/telegram/webhook` على خادم الهاتف (نطاقه القديم كان ميتاً) |
| بوت أكواد التعبئة | بيانات الاستلام الحقيقية لكل وسيلة + شرائح البونص + رابط DTSG |
| شرائح البونص | الحساب الإداري = الأعلى بين شريحته وشريحة المستخدمين |
| رقم Cash Plus | `0766672027` مطابقةً لرمز QR الرسمي |

### التنظيف الجذري (لا عودة للبس)
- حُذفت: `/root/dmgames-arena` · `/root/digital-moroccan-casino` · `/root/dtsg-voucher-bot` ·
  `/root/dtsg-v241-backup-20260918-2159` · `/root/dmgames-payments` · `/tmp/full`.
- **بقيت**: `/root/DTSG` (المشروع الحيّ) · `/root/dmgames-proxy-worker` (ووركر `casino-phone` الإنتاجي) ·
  `/root/dmgames-tunnel.sh` (سكربت النفق الحيّ) — أسماء الإنتاج لا تُغيَّر.
- **قواعد البيانات كلها محفوظة**: `/root/dtsg-db-archive-20260922-1644/` + لقطة متسقة و`tar` كامل في
  `/root/_dtsg-safety-20260922-1603/`.

