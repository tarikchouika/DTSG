# 🛡️ ملف تحذيري إلزامي — DTSG: مستودع واحد · فرع واحد

> **اقرأه كاملاً قبل أي `git push`.** مستخدَم مع [`AGENTS.md`](../AGENTS.md) في جذر المستودع.
> آخر تحديث: 2026-09-28 · السبب: حادثة نشر Cloudflare Pages (أونو/البلوت غائبتان عن مجلد النشر — القسم 8) + حادثة فرع `arena/01a0bd39-dtsg` (القسم 1).

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


---

## 8) حادثة 2026-09-28 — أونو/البلوت معطلتان على Cloudflare Pages فقط 🚨

### العَرَض
على `https://dtsg.pages.dev` (Cloudflare Pages): لعبتا **أونو (un)** و**البلوت (bl)** لا تعملان.
على `https://dtsg.vercel.app`: تعملان بشكل جيد. نفس المستودع، نفس الكود.

### السبب الجذري (مؤكد بالقياس الحيّ)
`scripts/deploy-pages.sh` **لا ينسخ مجلدي اللعبتين** إلى مجلد النشر:

```bash
# قبل الإصلاح (السطر 64):
cp -r js css assets ronda-game backgammon-game dominoes-game "$OUT/"
#                                                     ↑ بلا uno-game و baloot-game
```

السكربت حُدِّث تاريخياً عند دمج روندا والطاولة والضومنة (تعليقات `[BGDO]` في السكربت
نفسه تشهد لذلك)، لكن عند دمج أونو (UN) والبلوت (BL) لاحقاً **نُسي تحديث سطر النسخ** —
فهما موجودان في المستودع وفي `index.html` لكنهما يسقطان من النشر.

### لماذا «تعمل على Vercel ولا تعمل على Cloudflare»؟
| المنصة | آلية النشر | النتيجة |
|---|---|---|
| Vercel | نشر المستودع كاملاً (تكامل Git) | `uno-game/*` و`baloot-game/*` موجودان ⇒ اللعبتان تعملان |
| Cloudflare Pages | `scripts/deploy-pages.sh` (نسخة انتقائية) | المجلدان غائبان ⇒ كسر كامل |

### بصمة الخطأ المميزة (كيف تُشخَّص مستقبلاً في دقائق)
طلب ملف لعبة على Pages يعيد **صفحة index.html نفسها** بدل الملف:
- الحالة: `HTTP 200` (ليست 404! — احتياط SPA يخدع الفاحص)
- النوع: `content-type: text/html; charset=utf-8` بدل `application/javascript`
- البصمة: `etag` **مطابق تماماً لـ etag الخاص بـ `/index.html`**
- الأثر في المتصفح: فشل تحليل السكربت (HTML بدل JS) ⇒ `window.UnoApp`/`eUno`/`BalootApp`
  غير معرفة ⇒ مسرح اللعبة فارغ عند الفتح.
- التحقق ببساطة: `curl -sI https://dtsg.pages.dev/uno-game/uno-bridge.js | grep -i etag`
  وقارنه بـ etag الخاص بـ `https://dtsg.pages.dev/index.html`.

### الإصلاح (v2.65.1)
1. `scripts/deploy-pages.sh`: أُضيف `uno-game baloot-game` إلى سطر `cp -r` + قواعد تقليم
   الملفات التطويرية (tests/README/INTEGRATION/صفحة QA المستقلة + `baloot-game/integration`
   و`baloot-game/assets` المخصصين للنسخة المستقلة فقط — أيقونات الكتالوج تعيش في
   `assets/games/<un|baloot>` المرفوعة أصلاً).
2. `deploy-clean.sh`: نفس فئة الخلل (لم يكن ينسخ **أي** مجلد ألعاب مستقلة) — أُصلح بالمثل.
3. **حارس آلي جديد** `tests/_deploy_coverage_test.js` (14 تحققاً): كل مجلد علوي يُشار إليه من
   صفحات HTML المنشورة يجب أن يظهر في سطر `cp -r` في سكربتي النشر + لا مجلدات وهمية +
   قواعد التقليم موجودة + كل ملف مُشار من `index.html` موجود فعلاً. **التقط الخطأ الأصلي
   عند اختباره على النسخة المعطوبة (فشل صريح: `baloot-game, uno-game غير منسوخة`)**.
4. التحقق الحي: بناء مجلد النشر محلياً (`DMG_STAGE_ONLY=1` ⇒ 310 ملفاً يحوي المجلدين) +
   تقديمه بخادم محلي + فحص متصفح حقيقي: كل globals أونو/البلوت معرفة، مسرحا اللعبتين
   يُبنيان، صفر أخطاء سكربت.

### القاعدة المستخلصة (أُضيفت قاعدة 11 في AGENTS.md)
> **أي مجلد لعبة مستقلة جديد (`<name>-game/`) ⇒ إضافته فوراً إلى سطر `cp -r` في
> `scripts/deploy-pages.sh` و`deploy-clean.sh`** — والتحقق آلي عبر
> `node tests/_deploy_coverage_test.js` قبل كل دفع. «موجود في المستودع» لا يعني
> «منشور على Pages» — النشر انتقائي والسكربت هو نقطة الفشل الوحيدة.

## 9) حادثة 2026-09-30 — نشر إلى حساب Cloudflare ثانٍ «نجح» ولم يحدث شيء 🚨

### العَرَض
`bash scripts/deploy-pages.sh` أنهى بـ«Deployment complete» و`a80832a7…`/`b7e29853…`
— بينما `https://dtsg.pages.dev` كان يقدّم بناء **2.69.1** كما لم يحدث شيء.

### السبب الجذري (مؤكَّد)
`/root/.secrets/cloudflare.txt` كان يحمل توكن حساب **آخر** (توكن قديم). السكربت:
1. صدّق `wrangler pages project list | grep dtsg` — وفي ذلك الحساب **يوجد**
   مشروع باسم `dtsg`، فمرّ الفحص.
2. لم يسأل `wrangler whoami` «أي حساب؟».
3. أعلن رابطاً **ثابتاً مكتوباً في السكربت** (`dtsg.pages.dev`) دون أن
   يتحقق أن هذا النطاق هو نطاق ذلك المشروع فعلاً.
4. لم يفحص **محتوى الموقع الحيّ بعد الرفع** — فحتى لو كان النطاق صحيحاً
   لكاش أو نطاق مخصّص، يمرّ «النجاح» بلا دليل.

### بصمة الخطأ (كيف تُشخَّص في دقيقة)
```
curl -s https://dtsg.pages.dev/js/main.js | grep DTSG_BUILD   # ⇒ يجب أن يطابق package.json
```
إن اختلف ⇒ الرفع وصل مكاناً آخر. لا تعِد الرفع مراراً قبل معرفة أي مشروع حيّ:
```
npx wrangler@4 pages project list     # Project Domains لكل مشروع
```

### الإصلاح (في السكربت نفسه — قاعدة AGENTS 14)
`EXPECT_ACCOUNT` مثبّت · رفض عند اختلاف `CLOUDFLARE_ACCOUNT_ID` أو جواب `whoami`
(خروج 4) · **تحقّق بعد الرفع** يقارن بصمة البناء الحيّة بـ`package.json`
(خروج 5) · رسالة النجاح تطبع الرابط المتحقَّق منه.

> **قاعدة عامة من الحادثة:** «النشر نجح» ادّعاءٌ من الأداة، لا دليل. الدليل
> أن يُقرأ الموقع الحيّ بعد النشر ويطابق البصمة المرجّحة. وينطبق الأمر نفسه على
> كل أداة نشر: نجاح wrangler ≠ نشرٌ على النطاق الذيheuيمه الناس.
