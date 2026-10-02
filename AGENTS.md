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
| 12 | **عقد مال الغرف (v2.71) — لا يُغيَّر إلا بتوجيه صريح من المالك:** يُقتطع الرهان عند بدء الجولة (صف `bet` وحيد) · **الرسم 5% من الجرة كاملة** (مجموع رهانات المراهنين كافة — لا رهان لاعب واحد) · تسوية آلية عند النهاية (صف `win` للرابح فقط) · **المغادر لا يستلم قرشاً أبداً** · **الانقطاع ≠ المغادرة** (الانقطاع يوسم المقعد `isBot` بلا خصم وتستعيده العودة؛ المغادرة الصريحة تُصوّر إيداعه) · التسوية مصرَّح بها للمالك **أو السائق أو أي لاعب نشط** (أول تقرير + `room.settled` يمنع الازدواج) · `order` ثابت حرفياً — وسم المقعد لا حذفه · **لا صف bet للخاسرين عند التسوية** (السجل الموحّد transactions) · **الاستردادات كلها بصف refund** (ريماش جولة غير مسوّاة يستردّ قبل التصويت) · **التذاكر في كل لعبة** وربطها بـ`round_id` فلا تتكرر الجولة في السجل المدمج · **المغادرة تُنهي الجولة فوراً**: بقي مقعد واحد ⇒ فوز مباشر ثم التصويت على جولة جديدة · رحل الجميع ⇒ حلّ الغرفة · **الطابور يملأ المقعد الشاغر بعد الجولة** (لا أثناءها). التفصيل: [`docs/MONEY_CONTRACT_ROOMS.md`](docs/MONEY_CONTRACT_ROOMS.md). شرط أي تعديل مالي: `node tests/_bet_settle_v269_test.js` + `node tests/_rm_guard_settle_v270_test.js` + `node tests/_leave_settle_v271_test.js` + `node tests/_ops_guards_test.js` أخضران. **[v2.73·توجيه المالك 2026-10-01] استثناء فلات دوغ (rn):** عقد **رهان الجولة بالمشاركة** — لا اقتطاع عند البدء إطلاقاً؛ كل جولة تجمع رهانها من المتحدين الاثنين (الموزّع + المتخمّن الموالي) **لحظة نقر كل منهما على «المشاركة»** (نقطتا `/api/rooms/roundJoin` و`roundWithdraw`)؛ الجرة = الإيداعات الفعلية وحدها (لا قيمة افتراضية للمتفرجين)؛ التسوية بكل جولة على حدة والرابح بالمعرّف `u<id>`؛ الانسحاب/صمت 30ث = تحرير المقعد للمتفرج الراغب (ترقية الطابور) مع استرداد غير المنطلقين. الحارس: `node tests/_rn_roundjoin_v273_test.js` (52) + `node tests/_rn_bet_test.js` (متصفحان). **[v2.72] استثناء بلوت (bl):** غرف 2-4 لاعبين — **فردي** (2-3 لاعبين، أو 4 بنمط `mode4=ffa`) ⇒ `settleRound` بمقعد الفائز `w0..w3`؛ **فرق** (4 لاعبين بنمط `mode4=tt` الافتراضي) ⇒ `settleTeam` `t0/t1` كما كان. الحارس: `node tests/_v272_solo_ui_test.js` (33) + قسم «بدء/فردي» في `tests/_rooms_isolation_v268_test.js`. **[v2.74] لا تسوية محلية أبداً:** البلياردو الخمسة (`bl8/blbb/blgv/blsn/blca`) والشطرنج (`ch`) كانا يدفعان للرابح في المتصفح فقط (`giveWin`) بلا `roomSettle` ⇒ لا رسم ولا توزيع خادمي، وتُسترد الإيدادات كلها عند الريماش. التوصيل الآن **إلزامي** لكل لعبة وجهاً لوجه: `Rooms.roomSettle('w0'\|'w1'\|'draw')` عند نهاية الإطار/المباراة، و`takeBet` المحلي ممنوع في الواجهة (الخادم هو من يقتطع). وخط دفاع ثانٍ: `escrowOf` لا يخترع بديلاً (`pot`/`bet`) لمقعد بلا إيداع أبداً، و`spectate()` يرفض التفعيل أثناء جولة غير مسوّاة (400). الحارس: `node tests/_v274_settle_vote_nokia_test.js` (82). |
| 13 | **لا تُشغّل اختبار غرف/مال بلا `QA_BASE`.** المنفذ 3000 على هذا الهاتف = خادم المنصة الحيّ وقاعدتها المالية. الاختبارات تأخذ عنوانها من `tests/_safe_base.js`: بلا `QA_BASE` ترجع للقيمة التاريخية (3000) لكن **ترفض التشغيل** (exit 2) إن كان ذلك المنفذ يردّ كبصمة المنصة تحت pm2. الشكل الصحيح: `QA_BASE=http://127.0.0.1:3971/ node tests/_bet_settle_v269_test.js` — والعدّاء الكامل `bash tests/_run_regression_rooms.sh` يعمل في نسخة معزولة تلقائياً. |
| 14 | **النشر إلى Cloudflare لا يجري إلا بالحساب المثبّت، ولا يُعدّ ناجحاً قبل فحص النطاق الحيّ.** حادثة 2026-09-30: رُفع نشر كامل بحساب Cloudflare **ثانٍ** وأعلن wrangler «Deployment complete» بينما `dtsg.pages.dev` لم يتغيّر بايتاً واحداً. `scripts/deploy-pages.sh` صار يثبّت `EXPECT_ACCOUNT` ويرفض النشر عند اختلاف `CLOUDFLARE_ACCOUNT_ID` **أو** جواب `wrangler whoami` (خروج 4)، وبعد الرفع يقارن بصمة البناء في `/js/main.js` الحيّة بـ`package.json` (خروج 5 عند اختلافها). الأسرار من `/root/.secrets/cloudflare.txt` وحده — لا تُكتب في المستودع ولا في الصدفة. |
| 15 | **بصمة البناء `DTSG_BUILD` تُرفع مع كل إصدار — انشرها أو لا تعلن نجاحاً.** حادثة 2026-10-01: رُفع v2.73.0 و`package.json` فيه `2.73.0` بينما `window.DTSG_BUILD` في `js/main.js:8` بقي `v2.71.0` منذ v2.71.0 ⇒ حارس ما بعد الرفع (`scripts/deploy-pages.sh`) قارَن البصمة القديمة فأعلن **فشلاً كاذباً** على نشر صحيح، وبالمقابل لا يستطيع الحارس كشف نشر بُني من شجرة قديمة ما دامت البصمة لا تُحرَّك. **الواجب مع كل إصدار:** (1) `window.DTSG_BUILD` في `js/main.js` = إصدار `package.json` · (2) `?v=` في `index.html` لكل ملف مُعدَّل · (3) إصدار `package-lock.json` يوافق `package.json`. **وقبل رفع أو إعلان «نشر ناجح»:** `grep -o "DTSG_BUILD = 'v[^']*'" js/main.js` مطابق لـ`package.json`. |
| 16 | **ما يراه كل المستخدمين = سوبر أدمن حصراً + تحقّق من طرفَي السلسلة.** [v2.73] أمر `/news` في `@dtsgfinancials_bot` يكتب في **الشريط الإشعاري الذي يراه كل المستخدمين** — فسوبر أدمن حصراً (بوابة تُرفض وتُقيَّد في `fin_audit`) · ≤200 حرفاً مع تنظيف محارف التحكم · يُقرأ عبر `/api/promotions` (`news: {text, at}`) بلا أي بيانات مستخدم · يتبلّغ ≤5 دقائق. **الطرفان يُتحققان معاً:** الأمر (تيليغرام) + العرض الحيّ (`/api/promotions`) — الحارس: `node tests/_news_banner_v273_test.js` (25). |
| 17 | **التحكيم المباشر = قرار سوبر أدمن، وبُثّ لا يمرّ بالخادم.** [v2.75→v2.77] مباريات PES/eFootball الخارجية تُحسم بـ`POST /api/matches/:roomId/resolve` — **أدمن/سوبر حصراً** (`winner_id` أو `disputed`) · الإلغاء/الاسترداد الكامل كذلك · **لا** يُكتب مال جديد: الحسم يمرّ بنواة التسوية المعتمدة نفسها (`arbResolve/arbCancel` عبر `settleSeatCore`) فتبقى قاعدة 12 سارية بلا استثناء. الفيديو **WebRTC P2P** (الإشارة فقط عبر `server-arbitration.js`؛ الفيديو لا يمرّ بالخادم إطلاقاً — صفر باندويث على الهاتف/النفق)، و`MEDIAMTX_WHIP_URL` في `.env.local` = **مرحّل احتياطي اختياري** فقط — غيابه لا يُعطّل شيئاً. **واجهة `#arb` مبنية ببوابة توقّع (فرق التوقيع):** ممنوع تدمير عنصر `<video>` حيّ أو إعادة رسم بطاقة الجلسة بلا تغيّر — إعادة الرسم هي جذر الوميض (كل 6ث) الذي عولج في v2.77. الحارس: `node tests/_v275_arbitration_test.js` (30) + `node tests/_v276_lb_arbpage_test.js` (39). الدليل: [`docs/ARBITRATION_SETUP.md`](docs/ARBITRATION_SETUP.md). |

---

## 🖥️ بيئة خادم الهاتف — إلزامي

```bash
cd /root/DTSG
bash scripts/phone-env-restart.sh     # يقرأ .env.local → يعيد التشغيل → يتحقق من المفاتيح (منها مفاتيح بوت المالية) → pm2 save
```

> **تغطية السكربت:** `phone-env-restart.sh` يغطي البنود **1 و5** أدناه (سلامة البيئة · `pm2 save` · فحص سريع للدفع).
> البندان **2 و3 و4** (ويبهوك تيليغرام · اختبارات البوتات · عقد المال) **لا يغطّيهما** — نفّذها يدوياً بعده.

**بعد كل إعادة تشغيل تحقّق من (خطأ صامت = منصة معطّلة):**
1. `curl -s http://127.0.0.1:3000/api/payments/methods` ⇒ `binance_pay_id` غير فارغ · وسيلة `live`.
2. `curl -s https://api.telegram.org/bot$SUPPORT_BOT_TOKEN/getWebhookInfo` ⇒ بلا `last_error`.
3. `tests/_support_bot_test.js` · `_private_chat_test.js` · `_voucher_bot_scope_test.js` · `_financial_bot_test.js`.
   [v2.71] عقد مال الغرف: `node tests/_bet_settle_v269_test.js` (46) · `node tests/_rm_guard_settle_v270_test.js` (18) · `node tests/_leave_settle_v271_test.js` (25) · `node tests/_rooms_v267_test.js` (36) —
   تُشغَّل على خادم معزول: `QA_BASE=http://127.0.0.1:3971/ node tests/_bet_settle_v269_test.js` (القاعدة 13).
   [v2.73] خادمي وبلا متصفح: `node tests/_rn_roundjoin_v273_test.js` (52) · `node tests/_news_banner_v273_test.js` (25) — وهما كافيان لتغطية العقدين الجديدين دون متصفح.
   [v2.74] التسوية الخادمية + التصويت الموحّد: `node tests/_v274_settle_vote_nokia_test.js` (82).
   [v2.75→v2.77] التحكيم (قاعدة 17): `node tests/_v275_arbitration_test.js` (30) · `node tests/_v276_lb_arbpage_test.js` (39) · `node tests/_v277_ui_fixes_test.js` · `node tests/_v277_rami_marmouq_test.js`.
4. `[v2.66] بوت المالية (dtsgfinancials_bot)`: `node tests/_financial_bot_test.js` + `_financial_bot_db_test.js` ·
   `curl -s http://127.0.0.1:3000/api/financials/status` ⇒ `ok:true` ·
   `curl -s https://api.telegram.org/bot$FINANCIALS_BOT_TOKEN/getWebhookInfo` ⇒ بلا `last_error` ·
   [v2.73] `curl -s http://127.0.0.1:3000/api/promotions` ⇒ الحقل `news` موجود (يعني أن أمر `/news` حيّ في هذه العملية — القاعدة 16).
5. [v2.75] **وحدة التحكيم محمّلة** (قاعدة 17): `curl -s http://127.0.0.1:3000/api/matches/mine` مع ترويسة جلسة ⇒ `200` بلا خطأ 500 (يعني أن `server-arbitration.js` رُكّبت والجدول `arb_sessions` أُنشئ) · ولا حاجة إلى MediaMTX ليعمل النظام بوضع P2P.
6. `pm2 save` بعد نجاح الفحوص فقط.

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
| `server-arbitration.js` · `rooms/room-manager.js` (`arbResolve`/`arbCancel`) | تحكيم المباريات الخارجية — **حسم الأدمن يُفرج عن المال** (قاعدة 17) |
| `js/core/arb-page.js` · `js/core/arb-admin.js` · `js/core/arb-client.js` | واجهة التحكيم — الرسم التزايدي إجباري (إعادة الرسم = وميض) |
| `mediamtx.yml` | إعداد المرحّل الاحتياطي — اختياري، لا يُنشر إلى Pages |
| `css/15-edge.css` · `css/21-classic.css` · `css/22-look.css` | ترتيب التحميل مهم — الملفات تُحمَّل بالترتيب في `index.html` |
| `docs/ARBITRATION_SETUP.md` · `docs/MONEY_CONTRACT_ROOMS.md` | عقدا المال والتحكيم — أي تعديل مالي/تحكيمي بلا تحديثهما = قاعدة مكسورة |

---

## 🚨 عند الشك

1. **توقّف** — لا تدفع ولا تحذف.
2. اجمع الدليل: `git log` · `git remote -v` · `git status` · بصمات sha256.
3. اكتب تقريراً مختصراً للمالك (ماذا وجدت، ما الخطر، ما تقترح).
4. لا تُنفّذ قراراً حساساً بلا إذن صريح.

> **الحادثة المرجعية (2026-09-21):** فُقدت ثقة في فرع `arena/01a0bd39-dtsg` بسبب تشابه أسماء فروع الجلسات مع الريبو القديم. التقرير الكامل بالشهادات الرقمية في `docs/ASSISTANT_GUARDRAILS.md`.
