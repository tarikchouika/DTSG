# DTSG — ألعاب الدكاء التقليدية الرقمية (Digital Traditional Skills Games)

> **النسخة الحية:** `v2.28.1` — التحقق من كونسول المتصفح: `window.DTSG_BUILD` ← `"v2.28.1"`

منصة ألعاب تراثية ومهارات تقليدية (Vanilla JS + Node.js SSE): الروندا المغربية، الرامي
(طلاح/سامبل)، الطاولة (Backgammon)، الضومنة (Dominoes)، البارتشي، البلياردو، الشطرنج
والضاما — عبر المتصفح مباشرة بلا تحميل، مع غرف لعب جماعية ودردشة حية.

هذا المستودع هو **النسخة النظيفة الكاملة**: تاريخ قصير ونظيف بلا فروع قديمة، ومصدر
النشر المباشر على Vercel.

## 🚀 النشر على Vercel (دقيقتان)

1. في Vercel: **Add New… → Project** ← استيراد مستودع `DTSG`.
2. **Framework Preset:** اختر **`Other`** (لا أمر بناء — موقع ثابت).
3. **Deploy** — بلا أي دمج مع فروع أخرى.
4. التحقق: افتح الموقع → الكونسول → `window.DTSG_BUILD` يجب أن يعيد `"v2.28.1"`.

> ملف `vercel.json` في الجذر يضبط تلقائياً رؤوس الأمان (CSP/HSTS/XFO — مطابقة
> لملف `_headers` الخاص بـ Cloudflare Pages) وقواعد الكاش. لا حاجة لأي إعداد يدوي.

## 🖥️ التشغيل محلياً (الخادم الكامل)

```bash
node --experimental-sqlite server.js
# → http://localhost:3000  (Node ≥ 22.12)
```

أو عبر Docker:

```bash
docker build -t dtsg . && docker run -p 3000:3000 dtsg
```

## 🗂️ البنية

| المسار | الوصف |
|---|---|
| `index.html` + `css/` + `js/` + `assets/` | الواجهة الرئيسية (المنصة) |
| `ronda-game/` `backgammon-game/` `dominoes-game/` | مشاريع الألعاب المستقلة |
| `server.js` | خادم Node.js (SSE + غرف + تسوية + SQLite) |
| `cf-worker/` | ووركر Cloudflare الوسيط/السحابي |
| `scripts/deploy-pages.sh` | نشر Cloudflare Pages البديل (`dtsg.pages.dev`) |
| `tests/` + `_*.js` | الاختبارات (محركات + غرف + E2E) |
| `GITHUB_SYNC.md` / `CURRENT_TASK.md` | سجل التنسيق بين الوكلاء |

## 🔌 البنية الحية (الإنتاج)

```
المتصفح → Vercel (الواجهة الثابتة)
   api.js يقرأ /api-url2.json (بلا كاش)
 → Worker وسيط دائم (casino-phone…) → نفق الهاتف → server.js + SQLite
```

- `api-url2.json` — عنوان الـ Worker الدائم (لا يتغير أبداً).
- `tunnel-live.json` — آخر عنوان نفق معروف (للعرض/التشخيص فقط).

## 🧪 الاختبارات السريعة

```bash
node tests/_blind_pair_test.js   # الزوج الأعمى pn/rps (9/9)
node --check server.js && node --check js/core/utils.js
```

## 📌 الإصدارات

- **v2.28.1** — النسخة النظيفة الكاملة: وسم `window.DTSG_BUILD` في كل الصفحات،
  رفع الكاش (`dtsg6` / `bgdo5` / `lu6` — روندا وبلياردو بلا تغيير)، `vercel.json`
  (رؤوس + كاش)، وهذا الـ README. الأساس: `v2.27.0`.
- **v2.27.0** — الإصدار المدموج الكامل (خط sam + خط cat v2.26 + إغلاق الثغرات +
  blindResult + قاعدة النفخ في الضاما). التفاصيل: `GITHUB_SYNC.md` و`V227_PLAN.md`.
