# ⚠️ تعليمات إلزامية لكل الوكلاء والمساعدين — DTSG

> هذا الملف يُقرأ **قبل أي عمل**. التفاصيل الكاملة والحادثة الموثّقة: [`docs/ASSISTANT_GUARDRAILS.md`](docs/ASSISTANT_GUARDRAILS.md)

---

## 🔴 القواعد الصارمة (لا استثناء)

| # | القاعدة |
|---|---|
| 1 | **مستودع واحد وفرع واحد:** `tarikchouika/DTSG` → `main` فقط. لا تُنشئ فروعاً، ولا تدفع `arena/*`، ولا تدفع أي فرع آخر. |
| 2 | **لا تعمل من مجلد قديم:** `/root/dmgames-arena` و`/root/digital-moroccan-casino` هما worktree للمستودع **القديم** (`digital-moroccan-casino`). أي `git checkout/pull` فيهما يطمس الموقع الحيّ بكود قديم. |
| 3 | **تحقّق من هوية المستودع قبل أي دفع:** شغّل `bash scripts/preflight-repo.sh` — إن فشل، **توقّف**. |
| 4 | **ممنوع منعاً باتاً:** `git push --all` · `git push --mirror` · `git push -f` على main · حذف فرع أو وسم بلا تحقّق · `git reset --hard` على فرع ليس main. |
| 5 | **لا أسرار في المستودع** (عام): التوكنات في البيئة فقط. شغّل `node tests/_repo_hygiene_test.js` قبل كل دفع. |
| 6 | **بعد كل إصلاح:** الاختبارات كاملة (`bash scripts/qa-env.sh` ثم الأجنحة) + تحقّق بمتصفح حقيقي + بصمة sha256 للإنتاج. |
| 7 | **لا تُغيّر معرّفات الإنتاج** (`dmgames-api.workers.dev` · `casino-phone` · `casino-api` · مسار pm2) — تغيير الاسم = كسر الموقع الحيّ. |
| 8 | **قبل حذف أي شيء:** أثبت أنه لا يحوي محتوى فريداً (`compare/<sha>...main` ⇒ `behind_by=0`) واعرض الدليل على المالك، ثم انتظر موافقته. |

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
| `scripts/deploy-pages.sh` | النشر الحيّ — مصدر الفرع يجب أن يبقى `origin/main` |
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
