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
cat /root/dmgames-arena/.git 2>/dev/null || git -C /root/dmgames-arena remote -v
# إن ظهر digital-moroccan-casino أو فرع samsung-fixes ⇒ هذا القديم: لا git pull فيه
```

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
