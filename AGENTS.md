# ⚠️ تعليمات إلزامية لكل الوكلاء والمساعدين — DTSG

> هذا الملف يُقرأ **قبل أي عمل**. التفاصيل الكاملة والحادثة الموثّقة: [`docs/ASSISTANT_GUARDRAILS.md`](docs/ASSISTANT_GUARDRAILS.md)

---

## 🔴 القواعد الصارمة (لا استثناء)

| # | القاعدة |
|---|---|
| 1 | **مستودع واحد وفرع واحد:** `tarikchouika/DTSG` → `main` فقط. لا تُنشئ فروعاً، ولا تدفع `arena/*`، ولا تدفع أي فرع آخر. |
| 2 | **لا مستودعَ قديم أصلاً (حُذف نهائياً 2026-09-22):** `/root/dmgames-arena` و`/root/digital-moroccan-casino` كانا worktree للمستودع القديم (`digital-moroccan-casino`) وحُذفا — وقواعد بياناتهما مؤرشفة في `/root/dtsg-db-archive-*`. أي **مجلد قديم** يظهر على القرص أو في `git remote` ⇒ توقّف وأبلغ قبل أي `checkout/pull`. |
| 3 | **تحقّق من هوية المستودع قبل أي دفع:** شغّل `bash scripts/preflight-repo.sh` — إن فشل، **توقّف**. |
| 4 | **ممنوع منعاً باتاً:** `git push --all` · `git push --mirror` · `git push -f` على main · حذف فرع أو وسم بلا تحقّق · `git reset --hard` على فرع ليس main. |
| 5 | **لا أسرار في المستودع** (عام): التوكنات في البيئة فقط. شغّل `node tests/_repo_hygiene_test.js` قبل كل دفع. |
| 6 | **بعد كل إصلاح:** الاختبارات كاملة (`bash scripts/qa-env.sh` ثم الأجنحة) + تحقّق بمتصفح حقيقي + بصمة sha256 للإنتاج. |
| 7 | **لا تُغيّر معرّفات الإنتاج** (`dmgames-api.workers.dev` · `casino-phone` · `casino-api` · مسار pm2) — تغيير الاسم = كسر الموقع الحيّ. |
| 8 | **قبل حذف أي شيء:** أثبت أنه لا يحوي محتوى فريداً (`compare/<sha>...main` ⇒ `behind_by=0`) واعرض الدليل على المالك، ثم انتظر موافقته. |
| 9 | **بيئة الخادم من `.env.local` فقط:** ممنوع `pm2 restart --update-env` من صدفة ناقصة (حادثة 2026-09-22: مُسحت كل متغيرات الدفع والبوتات ثم حُفظت بـ`pm2 save`). الاستعمال الإلزامي: `bash scripts/phone-env-restart.sh`. |
| 10 | **أي تغيير في الأسرار أو الويبهوك يتحقق من الطرفين:** الخادم (البيئة) + تيليغرام (`setWebhook` بالسرّ نفسه) — ثم `getWebhookInfo` بلا `last_error`. |
| 11 | **أي مجلد لعبة مستقلة جديد (⇐ `-game/`) يجب إضافته فوراً إلى سطر `cp -r` في `scripts/deploy-pages.sh` و`deploy-clean.sh`.** حادثة 2026-09-28 (v2.65.1): أُدمجت أونو والبلوت دون تحديث السكربت ⇒ نشر Cloudflare Pages بلا المجلدين ⇒ Pages تخدم `index.html` بدل ملفات JS (200 + `text/html` + etag المطابق لـ index.html) فتعطلتا على `dtsg.pages.dev` بينما Vercel (نشر المستودع كاملاً) يعمل. الحارس الآلي: `node tests/_deploy_coverage_test.js`. |
| 12 | **عقد مال الغرف (v2.70) — لا يُغيَّر إلا بتوجيه صريح من المالك:** يُقتطع الرهان عند بدء الجولة (صف `bet` وحيد) · **الرسم 5% من الجرة كاملة** (مجموع رهانات المراهنين كافة — لا رهان لاعب واحد) · تسوية آلية عند النهاية (صف `win` للرابح فقط) · **المغادر لا يستلم قرشاً أبداً** · **الانقطاع ≠ المغادرة** (الانقطاع يوسم المقعد `isBot` بلا خصم وتستعيده العودة؛ المغادرة الصريحة تُصوّر إيداعه) · التسوية مصرَّح بها للمالك **أو السائق أو أي لاعب نشط** (أول تقرير + `room.settled` يمنع الازدواج) · `order` ثابت حرفياً — وسم المقعد لا حذفه · **لا صف bet للخاسرين عند التسوية ولا تذاكر لجولات الغرف** (السجل الموحّد transactions؛ التذاكر للفردي ضد الآلي فقط) · **الاستردادات كلها بصف refund** (ريماش جولة غير مسوّاة يستردّ قبل التصويت). التفصيل: [`docs/MONEY_CONTRACT_ROOMS.md`](docs/MONEY_CONTRACT_ROOMS.md). شرط أي تعديل مالي: `node tests/_bet_settle_v269_test.js` + `node tests/_rm_guard_settle_v270_test.js` + `node tests/_ops_guards_test.js` أخضران. |
| 13 | **لا تُشغّل اختبار غرف/مال بلا `QA_BASE`.** المنفذ 3000 على هذا الهاتف = خادم المنصة الحيّ وقاعدتها المالية. الاختبارات تأخذ عنوانها من `tests/_safe_base.js`: بلا `QA_BASE` ترجع للقيمة التاريخية (3000) لكن **ترفض التشغيل** (exit 2) إن كان ذلك المنفذ يردّ كبصمة المنصة تحت pm2. الشكل الصحيح: `QA_BASE=http://127.0.0.1:3971/ node tests/_bet_settle_v269_test.js` — والعدّاء الكامل `bash tests/_run_regression_rooms.sh` يعمل في نسخة معزولة تلقائياً. |

---

## 🖥️ بيئة خادم الهاتف — إلزامي

```bash
cd /root/DTSG
bash scripts/phone-env-restart.sh     # يقرأ .env.local → يعيد التشغيل → يتحقق من المفاتيح (منها مفاتيح بوت المالية) → pm2 save
```

**بعد كل إعادة تشغيل تحقّق من (خطأ صامت = منصة معطّلة):**
1. `curl -s http://127.0.0.1:3000/api/payments/methods` ⇒ `binance_pay_id` غير فارغ · وسيلة `live`.
2. `curl -s https://api.telegram.org/bot$SUPPORT_BOT_TOKEN/getWebhookInfo` ⇒ بلا `last_error`.
3. `tests/_support_bot_test.js` · `_private_chat_test.js` · `_voucher_bot_scope_test.js` · `_financial_bot_test.js`.
   [v2.70] عقد مال الغرف: `node tests/_bet_settle_v269_test.js` (46) · `node tests/_rm_guard_settle_v270_test.js` (16) · `node tests/_rooms_v267_test.js` (36) —
   تُشغَّل على خادم معزول: `QA_BASE=http://127.0.0.1:3971/ node tests/_bet_settle_v269_test.js` (القاعدة 13).
4. `[v2.66] بوت المالية (dtsgfinancials_bot)`: `node tests/_financial_bot_test.js` + `_financial_bot_db_test.js` ·
   `curl -s http://127.0.0.1:3000/api/financials/status` ⇒ `ok:true` ·
   `curl -s https://api.telegram.org/bot$FINANCIALS_BOT_TOKEN/getWebhookInfo` ⇒ بلا `last_error`.
5. `pm2 save` بعد نجاح الفحوص فقط.

---

## ✅ قبل أن تلمس أي ملف

```bash
cd /path/to/DTSG-main            # مجلد المستودع الجديد حصراً
bash scripts/preflight-repo.sh   # هوية + فرع + نظافة — يفشل بصوت عالٍ إن كان شيء خطأ
git fetch origin main && git log --oneline -1 origin/main   # اقرأ آخر حالة قبل أي تعديل
```

**علامات أنك في المكان الخطأ (توقّف فوراً):**
- `git remote -v` يُظهر `digital-moroccan-casino` أو مساراً غير `tarikchouika/DTSG`
- مسار المجلد يحتوي `dmgames-arena` أو `digital-moroccan-casino`
- `git branch` يُظهر فروعاً مثل `arena/samsung-fixes-*` أو `backup/new-improvements-*`
- `HEAD` ليس على `main`

---

## 🧭 خريطة الملفات الحسّاسة (لا تُعدّل بلا سبب قوي)

| الملف | لماذا حسّاس |
|---|---|
| `scripts/deploy-pages.sh` | النشر الحيّ — مصدر الفرع يجب أن يبقى `origin/main` · أي مجلد لعبة مستقلة يجب أن يُدرج في سطر `cp -r` (قاعدة 11) |
| `_headers` · `api-url2.json` · `tunnel-live.json` | تربط الواجهة بخادم الهاتف — كسرها = تعطّل الموقع |
| `js/core/api.js` · `js/core/live-ws-bridge.js` | حلّ عنوان الباكأند + الاحتياطي السحابي |
| `server.js` · `server-payments.js` · `cf-worker/*` | المال والمصادقة |
| `css/15-edge.css` · `css/21-classic.css` · `css/22-look.css` | ترتيب التحميل مهم — الملفات تُحمَّل بالترتيب في `index.html` |

---

## 🚨 عند الشك

1. **توقّف** — لا تدفع ولا تحذف.
2. اجمع الدليل: `git log` · `git remote -v` · `git status` · بصمات sha256.
3. اكتب تقريراً مختصراً للمالك (ماذا وجدت، ما الخطر، ما تقترح).
4. لا تُنفّذ قراراً حساساً بلا إذن صريح.

> **الحادثة المرجعية (2026-09-21):** فُقدت ثقة في فرع `arena/01a0bd39-dtsg` بسبب تشابه أسماء فروع الجلسات مع الريبو القديم. التقرير الكامل بالشهادات الرقمية في `docs/ASSISTANT_GUARDRAILS.md`.
