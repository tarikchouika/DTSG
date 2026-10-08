# ❄️ الميثاق المُجمَّد — DTSG (v2.45.2)

> **الغرض:** كل إصلاح مُثبَّت هنا له **حارس آلي** يمنع الانحدار للوراء.
> أي وكيل (بشري أو آلي) يعدّل سلوكاً في هذا الجدول **يجب** أن: (1) يشغّل الحارس قبل وبعد،
> (2) يحدّث هذا الملف، (3) يذكر ذلك في `GITHUB_SYNC.md` و`CHANGELOG.md`.
>
> **الفرع المرجعي:** `arena/01a0bd39-dtsg` · **الأساس:** `711fc10` (main) · **آخر تثبيت:** v2.45.2 — 2026-09-20.

---

## 0) قرارات المالك الملزمة (2026-09-20)

> ⛔ **تنبيه — أُلغي جزئياً بـ[v2.81.3] بتوجيه المالك 2026-10-04 («أضف الترويسة الناقصة»):** البند الوحيد الملغى هو ما يتعلق بـ`vercel.json`/`.vercelignore` في **القرار 1** أدناه. `vercel.json` **صار مُتعقَّباً في git** (أُزيل من `.gitignore` لأن `dtsg.vercel.app` ينشر من git ولا يصلُه ملف مستثنى أبداً) ⇒ النص أدناه محفوظ **كتاريخ موثَّق لا كقاعدة سارية**، وتطبيقه يعني حذف ملفٍّ يعتمد عليه نشر Vercel. **ما زال سارياً من القرار 1:** Cloudflare هو مسار النشر الأمامي (`Pages` + `Worker + KV` + خادم الهاتف بـSQLite · **لا R2**) و**`Dockerfile`/`.dockerignore` لا يُحذفان** من أجل ڤيرسيل. **ولا `.vercelignore`** على القرص ولا يلزم إطلاقاً. وأي تعديل ترويسات يُطبَّق على `vercel.json` (ڤيرسيل) و`_headers` (Pages) **معاً**.

| # | القرار (نصّ المالك) | ما يبقى في الكود |
|---|---|---|
| 1 | «إنسى أمر ڤيرسيل… نستخدمها إحتياطياً من أجل التجريب» | **Cloudflare** هي مسار النشر: **Pages** (الفرونت) + **Worker + KV** (عنوان النفق) + خادم الهاتف بـ**SQLite محلية**. **لا يُستعمل R2** (راجع `scripts/deploy-pages.sh`). `vercel.json` و`.vercelignore` **مستثناة في `.gitignore`** ولا تُرفع. **لا تُحذف** `Dockerfile`/`.dockerignore` من أجل ڤيرسيل. **[⛔ الجملة السابقة ملغاة v2.81.3 — انظر التنبيه أعلاه: `vercel.json` متتبَّع في git الآن.]** |
| 2 | «لماذا ستضيف شريط رهان؟ اللهب ضد اللاعب الآلي مجاني/تدريبي بدون رهان» | شاشة الشطرنج **بلا أي عنصر رهان**: لا `#chessStake`، ولا شريط، ولا شريحة. اللعب ضد الآلي و«وجه لوجه» = **تدريب مجاني** (`window.TRAINING.on` و`takeBet()` لا تخصم). الرهان **حصري للغرف أونلاين**. |
| 3 | «نوثّق جميع الإصلاحات لكي لا ننحدر للوراء» | هذا الملف + أقسام `GITHUB_SYNC.md` — كل إصلاح مذكور مع حارسه. |

---

## 1) جدول الإصلاحات المُجمَّدة وحُرّاسها

### أ) واجهة/تخطيط (v2.45-LOOK — `css/21-classic.css`)
| # | الإصلاح | الحارس |
|---|---|---|
| 1 | **الطاولة (bg) لا تبدأ**: قواعد `#bwStage #bwPlay{display:grid/flex!important}` كانت تُظهر شاشة اللعب المخفية فوق القائمة ⇒ قُيّدت بـ`.bw-screen-active` | `tests/_layout_test.js`, `tests/_bg_do_room_test.js` (متصفح) + `grep -c bw-screen-active css/21-classic.css` |
| 2 | **زر «مرّر» في الضومينو** ظاهر رغم `hidden` ⇒ `#dmStage .dm-tool[hidden]{display:none!important}` | `tests/_do_visual_test.js` / `_layout_test.js` |
| 3 | **«لاعبان — جهاز واحد»**: `#dmStage .dm-opprow{pointer-events:none}` كان يمنع نقر يد P2 ⇒ `… > *{pointer-events:auto}` | `tests/_do_visual_test.js` (متصفح) |
| 4 | **fr/en**: رزمة الخصم كانت تغطي البنك وتفيض على اليد (لاندسكيب) ⇒ إزاحة يمين + `max-height` | `tests/_layout_test.js` |

### ب) Binance Pay (v2.45/v2.45.1 — `cf-worker/payments-core.js` + `server-payments.js`)
| # | الإصلاح | الحارس |
|---|---|---|
| 5 | `merchantTradeNo` **حروف/أرقام فقط** (كان `dtsg-…` بشرطة ⇒ خطأ 400103/400201) | `tests/_cf_payments_test.js` |
| 6 | التحقق من إشعارات Binance = **RSA-SHA256** بمفتاح البوابة (لا HMAC بسرّ التاجر) + ذاكرة شهادات | `tests/_cf_payments_test.js` (‏«توقيع مزوَّر ⇒ mismatch») |
| 7 | إشعار `PAY_CLOSED/CANCELED/EXPIRED` ⇒ **إغلاق الطلب المعلّق** (`rejected`) بلا شحن | `tests/_cf_payments_test.js` |
| 8 | المبلغ المدفوع يُقرأ من **ردّ الاستعلام الموقَّع فقط** | `tests/_cf_payments_test.js` |
| 9 | حالة `live` تشترط `API_KEY` **و** `SECRET_KEY` معاً | `tests/_cf_payments_test.js`, `tests/_pay_methods_v240_test.js` |
| 10 | `binance_pay` مقبول في قائمة `/api/payments/p2p` | `tests/_pay_methods_v240_test.js` |
| 11 | ترحيل `pay_transactions`: `PRAGMA foreign_keys=OFF`…`ON` حول إعادة البناء + شرط CHECK يضمّ `binance_pay` (كان يفشل كلياً بصمت عند صفّ يتيم) | `tests/_cf_payments_test.js` |
| 12 | تمرير `BINANCE_PAY_*` (CURRENCY/CERT_SN/PUBLIC_KEY/API_BASE) في `buildEnv` | `tests/_cf_payments_test.js` |

### ج) خادم/أمان
| # | الإصلاح | الحارس |
|---|---|---|
| 13 | **مسح الحساب**: لم يعد `{ok:true}` كاذباً فوق فشل قيد FK — يعيد **409** برسالة صريحة، و`force:true` يحذف السجلات المالية المرتبطة في معاملة واحدة (مع `String(id)` لأن `user_id` نصّي في `pay_transactions`/`pay_vouchers`) | `tests/_security_static_test.js` + فحص حي (409 ثم force) |
| 14 | **QR محلي** (`js/vendor/qr-mini.js`) لرمز الدفع و`otpauth` بدل `api.qrserver.com` + `_headers` مضيّق (`img-src 'self' data: blob:`) | `tests/_v219_check.js` (يقبل `data:image/svg`) + `tests/_repo_hygiene_test.js` |

### د) الشطرنج = تدريب مجاني بلا رهان (قرار المالك §0/2)
| # | الإصلاح | الحارس |
|---|---|---|
| 15 | لا عنصر رهان في شاشة اللعب: أُزيلت الكتلة الميتة `#chessStake` من `chessUpdateHUD()`؛ صفّ الرهان `#chessBet` **مخفي** في الإعداد؛ التدريب لا يخصم من الرصيد (`chessStartLocal()` ⇒ `window.TRAINING.on` ⇒ `trainingOn()` تُرجع `true` في `takeBet()` بلا خصم) | `tests/_chess_browser_test.js` (الجزء 1 §8 + الجزء 2) |
| 16 | توقعات الرصيد صارت **بالفروق (Δ)** عن رصيد الخادم المرجعي لا بقيم مطلقة (49975/50025/49950 كانت تفشل لأن مزوّد الرصيد هو الخادم) | `tests/_chess_browser_test.js` |
| 17 | الترقية تُفحص كـ **SVG** (‏`chessPieceSVG`) لا كمحرف `♛` | `tests/_chess_browser_test.js` §2 |

---

## 2) الحرّاس القابلة للتشغيل بلا متصفح (هذا الصندوق) — النتائج المُتحقَّق منها

```
node tests/_cf_payments_test.js        → 80 نجح / 0 فشل
node tests/_parchisi_engine_test.js    → 155 نجح / 0 فشل
node tests/_chess_engine_test.js       →  52 نجح / 0 فشل
node tests/_pay_methods_v240_test.js   → exit 0
node tests/_security_static_test.js    → 37 نجح / 0 فشل
   (ملاحظة: إن تكرّر تشغيله ≥5 مرات خلال ساعة يعطي `POST /api/contact → 429` — حدّ معدّل
    محفوظ في `contact_messages`؛ امسح صفوف `ip='127.0.0.1'` أو انتظر ساعة، ليس عطلاً)
node tests/_frontend_tx_test.js        → exit 0
node tests/_repo_hygiene_test.js       → exit 0
node tests/_money_idempotency_test.js  → exit 0
node tests/_money_invariants_test.js   → exit 0
   # ⚠ [2026-10-07] الجناحان أعلاه (_money_idempotency / _money_invariants) **لم يعودا موجودين في `tests/`**
   #    ⇒ السطران محفوظان كسجلّ نتائج تاريخي (v2.44 وما قبله) لا كأمرين قابلين للتشغيل اليوم.
node tests/_bot_v244_test.js           → exit 0
node tests/_ai_expert_test.js          →  26 نجح / 0 فشل (طويل: مهلة ≥ 10 دقائق)
```
> ملاحظة: `_blind_pair_test.js` و`_money_v244_test.js` يحتاجان خادماً حياً على المنفذ المعني؛
> وأجنحة `/tmp/sweep` كاملة: **36 جناحاً أخضر**.
>
> ⛔ **[2026-10-07] أجنحة المال الثلاثة كلها لم تعد في المستودع — لا واحد منها:** `tests/_money_idempotency_test.js` و`tests/_money_invariants_test.js` — وهما السطران 72-73 أعلاه — و**`tests/_money_v244_test.js`** المذكور في §2 أعلاه (سطر 79) وفي §3 أدناه (سطر 89). `ls tests/ | grep -i money` **فارغ اليوم**. وأول السببين موثَّق أصلاً في `CHANGELOG.md` (v2.69.0: «قائمة ما بعد إعادة التشغيل في `AGENTS.md` كانت تشير إلى `tests/_money_invariants_test.js` **غير الموجود** ⇒ استُبدلت باختبارات المال الحقيقية»). **تغطية عقد المال اليوم هي:** قاعدة 12 في `AGENTS.md` و`docs/MONEY_CONTRACT_ROOMS.md`، وحراسها `tests/_bet_settle_v269_test.js` · `_rm_guard_settle_v270_test.js` · `_leave_settle_v271_test.js` · `_v274_settle_vote_nokia_test.js` · `_rn_roundjoin_v273_test.js` (وكلها تُشغَّل على خادم معزول — القاعدة 13). **لا تُحاول تشغيل الأجنحة المحذوفة، ولا تُعِد بناءها بلا عقد جديد يحكمها.**

## 3) أجنحة تحتاج **متصفحاً** (لا تُعتبر فاشلة عند غيابه)

`_chess_browser_test.js` · `_chess_spec_test.js` · `_chess_v244_test.js` · `_chess_bot_test.js` ·
`_parchisi_browser_test.js` · `_iso_ui_test.js` · `_unified_ui_test.js` · `_layout_test.js` ·
`_do_visual_test.js` · `_classic_look_test.js` · `_dama_browser_test.js` · `_dama_browser_v244_test.js` ·
`_pay_v243_test.js` · `_money_v244_test.js` · `_bg_do_room_test.js` · `_v217_final_check.js` ·
`_v219_check.js` · `_rd_*` (كلها) · `_billiards_*` (المتصفحية).

**طريقة التشغيل المعتمدة الوحيدة:** `bash scripts/qa-env.sh` (يجهّز Playwright + الخادم).

---

## 4) الممنوعات (قواعد منع الانحدار)

1. ❌ **لا** تُضِف `#chessStake` أو أي شريط/شريحة رهان إلى شاشة الشطرنج أو لأي وضع تدريبي ضد الآلي.
2. ❌ **لا** تُعيد `api.qrserver.com` إلى `_headers` أو إلى أي CSP (QR محلي عبر `qr-mini.js`).
3. ❌ **لا** تُحوّل توقيع إشعار Binance إلى HMAC، ولا تقرأ المبلغ المدفوع من إشعار غير موقَّع.
4. ❌ **لا** تُرجع `try{…}catch(e){}` حول `DELETE FROM users` (فشل FK يجب أن يظهر 409).
> ⛔ **البند الثاني من البند 5 أدناه مُلغى (v2.81.3 — بتوجيه المالك 2026-10-04 «أضف الترويسة الناقصة»):** **`vercel.json` يُضاف إلى git — لا العكس**؛ فهو صار **مُتعقَّباً** (أُزيل من `.gitignore` لأن `dtsg.vercel.app` ينشر من git، وتطبيق البند الملغى يعني حذف الملف الذي يعتمد عليه نشر ڤيرسيل فتعود `dtsg.vercel.app` إلى افتراضيات Vercel وحدها بلا CSP ولا `Referrer-Policy`). **ولا `.vercelignore`**: غير موجود على القرص ولا يلزم. **البند الأول من 5 باقٍ بحرفه:** `Dockerfile`/`.dockerignore` لا يُحذفان. وأي تعديل ترويسات يُطبَّق على `vercel.json` و`_headers` معاً.

5. ❌ **لا** تحذف `Dockerfile`/`.dockerignore`، ~~ولا تُضِف `vercel.json`/`.vercelignore` إلى git.~~ **[⛔ الجملة المشطوبة ملغاة v2.81.3 — النص التاريخي محفوظ للسجل، والساري هو نقيضها.]**
   ❌ **R2 غير مستعمل — ممنوع حفظ أو ذكر مفاتيحه (Access Key/Secret/Endpoint) أو توكن Cloudflare**
   في الكود أو التوثيق أو رسائل التنسيق. الأسرار تُقرأ من البيئة فقط على الخادم، لا من المستودع (المستودع عام).
6. ❌ **لا** تربط `pay_transactions.user_id` كعدد (العمود **نصّي** — استعمل `String(id)`).
7. ❌ **لا** تخفض تعقيد كلمة الاختبار أو تُكتب أسرار في الكود (المستودع **عام**؛ كلمات الإنتاج من البيئة `DM_LIVE_PW`/`DM_SEED_*`).
8. ❌ **لا** تُزل قيود `.bw-screen-active` أو `[hidden]` أو `pointer-events` في CSS (تُعيد أعطال «اللعبة لا تبدأ»).
