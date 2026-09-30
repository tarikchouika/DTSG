# DTSG Worklog — Multi-Agent Shared Log

---
Task ID: 1
Agent: main (Super Z)
Task: استكشاف مشروع DTSG بعد الدمج من GitHub (v2.65.1) — فهم البنية قبل الإصلاحات المطلوبة

Work Log:
- Merge origin/main (v2.65.1, commit 2189e78) إلى main المحلي مع حل تعارض .gitignore (دمج إدخالات الطرفين)
- قراءة AGENTS.md (القواعد الصارمة: مستودع واحد main فقط، لا أسرار، preflight قبل الدفع، لا --force)
- تحليل بنية أونو: uno-game/css/uno.css — سلسلة أوراق اللاعب الرئيسي = .un-handcard { bottom: 20px } داخل .un-handwrap (bottom:0)
- تحليل داشبورد السوپر أدمين (js/main.js): التبويبات المالية = fin (إحصاءات + طلبات معلقة بموافقة/رفض) · money (سجل المال + مجاميع) · logs (سجل المعاملات المدمج من 3 مصادر) · users (سجلات المستخدمين) · botpl (أرباح البوت)
- تحليل البنية الخلفية: server.js (SQLite royalcoin.db + جداول users/transactions/bet_tickets/money_log) · server-payments.js (pay_transactions/pay_vouchers + adminApprove/adminReject/listPending) · server-support.js (نمط بوت الويب-هوك: /api/support/webhook بسِرّ x-telegram-bot-api-secret-token)
- دراسة نمط الاختبارات: tests/_support_bot_test.js (خادم تيليغرام وهمي + قاعدة في الذاكرة) و _voucher_bot_scope_test.js

Stage Summary:
- المشروع جاهز للتطوير. خطة التنفيذ: (2) إزاحة أوراق أونو +15px، (4) بوت المالية server-financials.js بنمط support-bot، (3) تفويض مدقق قاعدة البيانات، ثم اختبارات ودفع.
- قرار معماري: بوت المالية module داخل server.js (نفس قاعدة البيانات والصلاحيات) — نفس خصائص داشبورد السوپر أدمن حرفياً (نفس الاستعلامات ونفس دوال الموافقة/الرفض pay.adminApprove/adminReject).

---
Task ID: 3
Agent: مساعد قاعدة البيانات (Database Management Assistant)
Task: تدقيق توافق قاعدة البيانات لبوت المالية server-financials.js (v2.66.0) — «مواكبة الإصلاحات» (تحليل READ-ONLY + ملف اختبار واحد جديد فقط، بلا أي تعديل على ملفات المصدر)

Work Log:
- قراءة worklog.md أولاً (مهمة 1: الدمج والتحليل)، ثم جرد كامل لكل استعلامات SQL في server-financials.js (19 موقع استعلام) ومطابقتها مع المخططات الفعلية: server.js (users + transactions/bet_tickets + money_log سطر 615 + group_rounds/group_bets + كل ALTERs users سطر 65-72) و server-payments.js (pay_transactions/pay_vouchers/tg_admin_sessions سطر 61-89 + ALTERs reviewed_by/reviewed_at سطر 53-56)
- تدقيق عمودَي المراجعة المُضافَين بـ ALTER (v2.41.1): استعلام وحيد يذكر reviewed_by صراحة — payList سطر 195 (سجل /deposits و/withdrawals) — وهو محمي بـ try/catch ⇒ على قاعدة legacy ناقصة العمودين يظهر «📭 لا سجلات» بدل الانهيار (تدهور رشيق، موثّق في الاختبار بدليل حرفي: prepare يرمي «no such column: reviewed_by»). كل الاستعلامات الأخرى (pendingData سطر 180، mergedLog سطر 277، cmdTx سطر 546، payAct سطر 654) تستعمل أعمدة أساسية فقط أو SELECT * المتحمّلة للغياب
- initFinancials (سطر 103-112): fin_audit جدول جديد كلياً بـ CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS — تحقق ديناميكي أن الاسم لا يظهر إطلاقاً في server.js ولا server-payments.js (لا صراع ملكية/أسماء مع أي من 15 جدولاً) — idempotent (3 استدعاءات متتالية بلا خطأ، الجدول والفهرس مرة واحدة)
- التحقق من صيغ التخزين الثلاث للطوابع: money_log=ms (Date.now) · transactions/bet_tickets=ثوانٍ · pay_transactions=TEXT 'YYYY-MM-DD HH:MM:SS' (TIMESTAMP DEFAULT CURRENT_TIMESTAMP) — الدالة ts() (سطر 51-61) تصيغ الثلاث بلا انهيار (تأكيد عبر /tx و/log و/money: التواريخ تظهر 2026) و ago() يتحمّل النص
- كشف quirk موروث (ليس انحداراً من البوت): mergedLog سطر 290 يحوّل تاريخ المحفظة النصي بـ Number() ⇒ NaN ⇒ created_at=0 فترتب صفوف الشحن/السحب آخر السجل المدمج وتعرض «—» — لكنه نسخ حرفي من داشبورد السوپر أدمن نفسه (server.js:1861) أي تكافؤ تام مع المنصة؛ إصلاحه يتطلب تعديل الملفين معاً (الاقتراح: Date.parse للنص 'YYYY-MM-DD HH:MM:SS')
- توثيق خطر مستور (بلاغ بلا إصلاح): cmdCharge سطر 595 — UPDATE users SET gold = ?, first_topup_done = 1 يفشل صامتاً على قاعدة ultra-legacy بلا عمود first_topup_done ⇒ الرصيد لا يُحفَظ في DB (يتحدّث في الذاكرة فقط) رغم تسجيل charge في transactions — مرآة حرفية لسلوك الداشبورد (server.js:1630) ومُخفَّف عملياً لأن إقلاع server.js ينفّذ ALTER دائماً (سطر 72) قبل تركيب البوت (سطر 348)
- إنشاء tests/_financial_bot_db_test.js (الملف الوحيد المُنشأ في المهمة): 90 تأكيدات في 8 أقسام — (أ) قاعدة legacy بلا reviewed_by/reviewed_at: كل القرائن تعمل و payList يتدهور برشاقة بلا انهيار (ب) قاعدة fresh بنفس سلاسل DDL/ALTER الحقيقية المستخرجة من server.js/server-payments.js + initFinancials مرتين (ج) جداول فارغة: statsData/payTotals/mergedLog (بفلترات '' deposit withdrawal bet win transfer_out charge + uid)/moneyLogData/gamesStats/pendingData/usersList والأوامر العشرة كلها ok (د) الصيغ الثلاث للطوابع + reviewed_at=ms عبر مسار fapp/payAct (هـ) logTxLocal يطابق مخطط transactions بثوانٍ
- النتائج: node tests/_financial_bot_test.js ⇒ 56 ✓ · 0 ✗ — node tests/_financial_bot_db_test.js ⇒ 90 ✓ · 0 ✗ (بلا شبكة خارجية: :memory: + خادم تيليغرام وهمي محلي 127.0.0.1:3995)
- الالتزام بالقراءة فقط: git status يؤكد أن التعديلات (server.js/scripts/uno.css) من المهام السابقة فقط؛ إضافتي = tests/_financial_bot_db_test.js غير المتتبَّع + هذا السجل

Stage Summary:
- الخلاصة: بوت المالية متوافق مع قاعدة SQLite المشتركة (royalcoin.db) — لا انهيار ممكن من جهة الاستعلامات: كل عمود مُضاف بـ ALTER إما غير مذكور صراحة أو محمي بـ try/catch، و fin_audit بلا صراع و idempotent، والتكافؤ مع الداشبورد حرفي حتى في المواضع الموروثة
- ثلاث ملاحظات للمالك (لم تُصلَح تنفيذاً للقيود): (1) payList سطر 195 — تحسين اختياري: SELECT * أو فحص PRAGMA table_info كي لا تختفي السجلات على قاعدة legacy ناقصة العمودين (2) quirk الطوابع سطر 290 = server.js:1861 — يستحق إصلاحاً مشتركاً مستقبلياً للبوت والداشبورد معاً (3) first_topup_done سطر 595 = server.js:1630 — فشل صامت نظري على مخطط قديم جداً
- الجاهزية: المهمة 3 مكتملة (تدقيق + اختبار)؛ المهمة التالية تقع على الوكلاء اللاحقين (اختبارات موسّعة أو دفع بعد موافقة المالك وفق AGENTS.md)

---
Task ID: 2
Agent: main (Super Z)
Task: إزاحة سلسلة أوراق اللاعب الرئيسي في أونو للأعلى 15px في الوضعين (لاندسكيپ + بورتريه) مع حفظ الشكل والحجم

Work Log:
- التعديل الجراحي الوحيد: uno-game/css/uno.css · .un-handcard { bottom: 20px → 35px } (قاعدة أساسية واحدة تشمل الوضعين)
- فحص هندسي ثابت (10/10): مقاس الورقة --un-cw · قوس المروحة 2.4px · الخطوة 34px · ارتفاع الحاوية +46px · رفع hover -18px · شريط الأفعال +86px · اللوحة top:-2px · زر UNO 120px — كلها دون تغيير
- تحقق بمتصفح حقيقي (Playwright · scripts/_uno_15px_browser_test.js — 8/8): بورتريه 390×844 + لاندسكيب 844×390: 7 أوراق مرئية · أسفل الورقة عند 35px بالضبط من أسفل المسرح (كانت 20px ⇒ +15px) · نسبة الورقة 1:1.4 محفوظة · بلا أخطاء JS

Stage Summary:
- الطلب نُفّذ حرفياً: الورقة فقط تتحرك +15px في الوضعين؛ كل عنصر آخر (اللوحة · زر UNO · الأفعال · الخصوم · الطاقم) بلا أي حركة، والشكل والحجم كما هما.

---
Task ID: 4
Agent: main (Super Z)
Task: بوت تيليغرام المالية @dtsgfinancials_bot — خاص بالسوپر أدمين، نفس خصائص داشبورد السوپر أدمين (شحن · سحب · سجلات المستخدمين · جميع السجلات)

Work Log:
- ملف جديد server-financials.js (نمط server-support.js): ويب هوك POST /api/financials/webhook بسِرّ FINANCIALS_WEBHOOK_SECRET + GET /api/financials/status
- البوابة: السوپر أدمين حصراً (FINANCIALS_SUPER_TG || TELEGRAM_ADMIN_CHAT_ID) — الغريب يُرفض بلا تسريب + قيد fin_audit (جدول تدقيق جديد idempotent)
- تكافؤ الداشبورد: /stats (=بطاقات المالية) · /pending بأزرار fapp:/frej: عبر pay.adminActOnPlatformTx نفسها · /deposits · /withdrawals (pay_transactions) · /users · /user · /search (نفس حقول /api/admin/users) · /log (الدمج الثلاثي نفسه) · /money (+مجاميعه) · /games (نفس SQL) · /tx · /audit
- الأفعال المالية: /charge · /deduct · /setbalance بنفس منطق /api/admin/user/:id/balance (logTx نفسه + مكافأة الإحالة 10% + منع السالب) + إشعار المستخدم عبر sup.notifyUser (نفس سلوك الداشبورد)
- التركيب في server.js: fin.initFinancials(db) + setCtx(db, users, sessions, { pay, logTx, notifyUser }) + التوجيه بعد مسارات الدعم
- setup-telegram-bots.sh (v2.66): getMe + setWebhook بسِرّ + 16 أمراً + وصف + اسم «مالية DTSG | Financials» + فحص وصول 4.c + getWebhookInfo 8)
- phone-env-restart.sh: FINANCIALS_BOT_TOKEN · FINANCIALS_WEBHOOK_SECRET · FINANCIALS_SUPER_TG في فحص المفاتيح الإلزامية
- التوثيق: FINANCIALS_BOT.md + CHANGELOG v2.66.0 + AGENTS.md (قائمة ما بعد إعادة التشغيل) + package.json 2.66.0
- إصلاحان بعد تدقيق قاعدة البيانات (مهمة 3): (1) payList → SELECT * (مقاومة قاعدة قديمة بلا reviewed_by)، (2) toSeconds() يحلّ تواريخ pay_transactions النصية في السجل المدمج

Stage Summary:
- tests/_financial_bot_test.js: 56/56 ✓ (بوابة · تكافؤ · أفعال مالية · ترقيم fnv · ويب هوك 403)
- tests/_financial_bot_db_test.js: 91/91 ✓ (بعد تحديث فحوص الإصلاحين — من إنتاج مساعد قاعدة البيانات في المهمة 3)
- لا مسار مالي جديد: كل الأفعال عبر نفس دوال الداشبورد — سجل transactions/pay_transactions واحد للمنصة والبوت

---
Task ID: 5
Agent: main (Super Z)
Task: اختبارات الانحدار الكاملة (حفظ المكتسبات السابقة) + نظافة المستودع

Work Log:
- بوت الدعم: 72/72 ✓ · نطاق الفاوتشر: 27/27 ✓ · تغطية النشر: 14/14 ✓ · أمن الملفات: 37/37 ✓
- نظافة المستودع: 4/4 بعد git rm --cached .env (كان متتبَّعاً محلياً من الالتزام الأولي فقط — غير موجود في origin/main البتة)
- فحص بناء الخادم: node server.js يقلع سليماً بمركّب المالية + اختبار حي للنقاط (status:200 · سرّ خاطئ:403)
- أزالة ملفات التنقيح المؤقتة من الجلسة

Stage Summary:
- كل المكتسبات السابقة خضراء. المستودع نظيف ولا أسرار متتبَّعة. جاهز للدفع إلى main.

---
Task ID: 6
Agent: main (Super Z)
Task: إصلاحات الأداء والمزامنة والمحاسبة والخصوصية (H1-H4 + C1) الرافعة لتقييم أمني خارجي — رقعة جراحية تحفظ كل المكتسبات + دفع v2.67.0

Work Log:
- الرقعة على server.js: verifyPasswordAsync (scrypt في طاقم libuv — جذر سقف 27rps) + زمن دخول موحّد للاسم الموجود وغير الموجود · ROOM_GAMES_ALLOWED أُضيف un/bl (جذر رفض أونو/بلوت 400) · ترقيم rev للمصالحة + ‎?since=rev يبث room:replay للمتخلف فقط · room.escrow: تسجيل الإيداعات الفعلية واستردادها عند المغادرة/endBet/الإغلاق وتسوية بالمجموع الفعلي (إعادة المباراة كانت تضخ نقوداً بلا اقتطاع — أُصلحت) · C1: دردشة وحركات الغرفة لأعضائها المصادقين (401/403) · منظّف أشباح 3 دقائق (SSE حية + lastActivity) مع استرداد الإيداع · معرفات غرف رتيبة عبر جدول meta · keepAliveTimeout 65ث مواءم مع نفق CF
- الواجهة: Rooms.reopenSse بعد الدخول (قناة كانت مجهولة الهوية) + requestReplay بمسار SSE في وضع الهاتف + تسلسل آمن لـapplyRoomReplay في 7 جسور (البلياردو كان يلتقط البلوت بـ/^bl/) + توحيد شكل وسيط أونو + ترقيم أصول index.html
- جلسة تدقيق هذه المرة: اكتشاف وإصلاح تشبع طاقم الخيوط (fs.stat/readStream خلف scrypt — قياس 765ms أثناء عاصفة 40 دخولاً) عبر ذاكرة ملفات ساخنة (≤256KB/ملف، ≤48MB، إعادة تحقق 5ث) + ETag/304 + Cache-Control (‎?v=‎ يوماً) + UV_THREADPOOL_SIZE=8 في npm start/Dockerfile/phone-env-restart.sh — القياس بعد: 0.9ms متوسط / 28.6ms أقصى للطلبات الخفيفة أثناء العاصفة نفسها
- الاختبارات: v267 الجديد 34/34 ✓ (قائمة بيضاء · rev/مصالحة · محاسبة جولتين دقيقة 100% · C1 · أشباح · رتابة معرفات) + انحدار كامل: دعم 72/72 · مالية 56/56 · فاوتشر 27/27 · نشر 14/14 · أمن ملفات 37/37 · نظافة 4/4 · لحاق 7/7 · صمود 10/10 · mp_e2e بمتصفحين حقيقيين على المسار الساكن الجديد بلا أخطاء JS
- تحقق يدوي للترويسات: 200+ETag · 304 بـIf-None-Match · ‎?v=‎ →max-age=86400 · webp بث بـContent-Length · المسارات المحجوبة 404 كما كانت
- التوثيق: CHANGELOG v2.67.0 كامل + package.json 2.67.0

Stage Summary:
- كل المكتسبات خضراء بعد الرقعة (261+ فحصاً). خادم الهاتف: 40 دخولاً متزامناً 0.85ث والبث اللحظي 2-3ms. أونو/بلوت: دورة كاملة. المحاسبة دقيقة بلا مال من فراغ. جاهز للدفع v2.67.0 إلى main بعد preflight + hygiene.

---
Task ID: 7
Agent: main (Super Z)
Task: عزل الألعاب المعماري بتوجيه المالك: نظام غرف مستقل لكل لعبة + إصلاح الأعطال الجذرية المستمرة (بلوت/أونو/انحراف/تأخير) — على مراحل مع حفظ كل المكتسبات + دفع v2.68.0

Work Log:
- التشخيص العميق بعد استمرار الأعطال رغم v2.67.0: خريطة rooms عالمية واحدة لـ17 لعبة + حدّ مقاعد عالمي 2-8 + تمرير حركات أعمى بلا تحقق + room_state بلا ملكية (آخر كاتب يفوز) + فتحة معالج واحدة في الواجهة تُستبدل مع كل لعبة + setTimeout(400) أعمى لحدث البدء
- المرحلة 1 — games/registry.js: سجل موحّد (مقاعد exact/min/max + قائمة أكشنات + مخطط حالة + فرق) مع اختبار ذاتي 18/18؛ البلوت 4 بالضبط وأونو ≤4 والثنائيات 2 — الطلب المخالف يُصحَّح
- المرحلة 2 — rooms/: room-manager.js (دورة حياة لكل لعبة بخريطتها) + index.js (محور: توجيه معرف/رمز عالمي + رموز فريدة عالمياً + رتابة meta محفوظة) + shared.js (توابت v2.67 حرفياً)؛ server.js 2663→2059 سطراً وكل /api/rooms/* عبر المحور بعقود متطابقة
- عزل الحركات (قائمة بيضاء لكل لعبة — حقن unmove في غرفة رامي ⇒ 400) + عزل الحالة (قصّ بالمخطط + ملكية السائق + base_rev ضد الكتابة المتقادمة — نهاية آخر-كاتب-يفوز) + تسجيل unmove/blmove وأكشنات الروندا في سجل الحركات (كانت تُبث ولا تُسجَّل فلا يُعاد بناؤها للعائد) + تعميم تسوية الفرق على مقاعد زوجية (أونو الثنائية كانت لا تُسوّى أبداً)
- المرحلة 3 — js/core/rooms.js: سجل معالجات لكل لعبة بمفتاح معرفها + تخزين مؤقت للحركات (سقف 300) يُدفع عند التسجيل بدل الإسقاط + تسليم حدث البدء لحظة التسجيل (لا setTimeout 400) + حارس الطزاجة في _onUpdate (استجابة ready متأخرة كانت تطمس بثّ البدء فتُنهي الجولة وهمياً — موثّق بقياس rev7 بعد rev8 بـ70ms) + sendMove بbase_rev ومصالحة مقيّدة
- المرحلة 4 — الأعطال التاريخية: (1) تصادم اسم blRegisterRooms بين جسر البلوت والبلياردو — البلياردو يبسط تعريفه فيستدعي initBaloot نسخة البلياردو فتُختطف مفاتيح 'bl' (جذر خلل غرفة البلوت المستمر) ⇒ billiardsRegisterRooms + مطابقة تامة للمعرفات الخمسة في blRoomStart؛ (2) توقيع UN_roomMove بمعاملين والنداء بواحد ⇒ حركات أونو الحية لم تصل أبداً (اعتماد كلي على إعادة البناء الدورية = تأخير 2-6ث) ⇒ إصلاح التوقيع؛ (3) دوران requestReplay↔reopenSse المتبادل (~10آلاف EventSource لكل طلب) ⇒ فتح واحد + خنق 1.2ث + نافذة رحمة 350ms؛ (4) أونو الفردي يسوّي بالمقعد الفائز
- الاختبارات: جناحان جديدان — _rooms_isolation_v268_test.js (28/28) و_un_bl_room_v268_test.js بمتصفحات حقيقية (17/17 × 6 جولات متتالية: أونو بضيف خارج الصفحة يُفتح ويُبنى وتصله حركة حية فورية متطابقة، وبلوت بأربعة متصفحات بنفس البذرة)؛ انحدار كامل: v267 35/35 · لحاق 7/7 · صمود 10/10 · طاولة/ضومنة متصفح 25/25 · بينالتي متصفح 21/21 · فاوتشر 27/27 · نظافة 4/4 · نشر 14/14 — المجموع 188 فحصاً أخضر
- منهجية: اكتُشف أن _bg_do_room_test.js القديم كان ok(label) بمعامل واحد فيطبع ✅ دائماً — الجناح الجديد ok(cond,label) شرطية
- التوثيق: CHANGELOG v2.68.0 (خمسة أقسام أ-هـ) + package.json 2.68.0

Stage Summary:
- كل لعبة معزولة معماريّاً: مديرها وغرفها وحركاتها وحالتها — عطل لعبة لا يمس الأخريات (طلب المالك منفَّذ حرفياً)
- الجذور الخمسة للأعطال المستمرة قُلعت: تلوث بلوت↔بلياردو · توقيع أونو · عاصفة إعادة الاتصال · طمس الحالة المتقادمة · سباق 400ms
- 188 فحصاً أخضر (10 أجنحة) — المكتسبات كلها محفوظة. جاهز للدفع v2.68.0 إلى main بعد preflight + hygiene.

---
Task ID: v2.69.0-a
Agent: main (Super Z)
Task: تحليل جذر خلل تسوية الرهان + متطلبات المغادرة/اللاعب الآلي/الواجهة (بتوجيه المالك 2026-09-30)

Work Log:
- قراءة كاملة لـ rooms/room-manager.js و rooms/shared.js و rooms/index.js و games/registry.js ومسارات /api/rooms/* في server.js
- تتبع مسار المال: start() يقتطع فعلاً ويودع escrow (v2.67 سليم) — لكن التسوية settleRound/settleTeamRound محصورة في المالك (owner_id) وتعتمد كلياً على استدعاء عميل المالك عند نهاية المباراة
- اكتشاف الجذر: leave() أثناء جولة جارية كان يسترد الإيداع ويحذف اللاعب من players ⇒ order الغرفة يتغير منتصف الجولة ⇒ مقاعد التسوية (w0-w3) تنزاح إلى لاعبين خاطئين أو تفشل («الرابح لاعب آلي أو غير موجود») ⇒ الرابح لا يُدفع
- اكتشاف ثانٍ: منظّف الأشباح (ghostSweepPass) يحذف اللاعب + يسترد إيداعه منتصف الجولة = نفس جذر انزياح order
- عدم وجود logTx في settleRound/settleTeamRound (لا سجل معاملات رهان/فوز للغرف عدا settleLegacy القديم)
- تأكيد بنية الذكاء البديل: أونو/بلوت يملكان roomDriverTick + aiPlan (السائق يلعب للمقاعد الغائبة عبر _seatPresent)؛ روندا rd عبر room.online — كلها تتأهب للعمل فور وسم المقعد isBot
- جرد الواجهة: أيقونة اللعبة #gamePageIcon في هيدر اللعبة (index.html:384) + زر مغادرة بنص gl-txt (index.html:381) + مودال تأكيد مغادرة بلا تحذير خسارة الرهان + doLeaveGame لا يغادر الغرفة فعلياً أثناء جولة (منطق Persist)

Stage Summary:
- الخطة المعتمدة (v2.69.0): (1) المغادرة الصريحة أثناء الجولة = خسارة: وسم المقعد isBot+leftRound مع بقاء order ثابتاً والإيداع مصادراً؛ ثنائي = تسوية فورية للرابح الباقي (2) الأشباح: وسم isBot بدل الحذف + استرداد العضوية عند العودة (الإغلاق/الانقطاع/التحديث ≠ مغادرة) (3) التسوية: المالك أو السائق + استثناء leftRound من المكاسب + logTx (4) روماتش/endBet يطردان الآليين (5) الواجهة: إزالة أيقونة الهيدر + زر مغادرة رمزي + تحذير الخسارة في المودال (6) أونو/بلوت: _isDriver من driverId الخادمي + _seatPresent يستثني isBot

---
Task ID: v2.69.0-b
Agent: main (Super Z)
Task: تنفيذ تسوية الرهان الآلية + مغادرة=خسارة + لاعب آلي بديل + تجريد الواجهة (توجيه المالك 2026-09-30)

Work Log:
- الخادم rooms/room-manager.js: نواة settleSeatCore (تسوية مقاعد بمسار API ومسار المغادرة الفورية) + settleTeamRound بإعادة كتابة كاملة: تصريح المالك/السائق/أي لاعب نشط + استثناء leftRound من كل مكسب (ثنائي: الباقي يرث الجرة · متعدد: استرداد+تقاسم مصادرات · فرق: نصيب المغادر لزميله البشري وانقلاب الفوز عند فريق مغادر كله) + logTx (bet/win/refund) في البدء والتسويات والريماش
- المغادرة leave(): أثناء الجولة = وسم isBot+leftRound بلا حذف (ثبات order) + بث room:leave + ثنائي=تسوية آنية w(الباقي) + انتقال ملكية المالك المغادر + خارج الجولة: انتقال ملكية بدل حذف الغرفة المأهولة + حذف نظيف عبر ctx.removeRoom (كان فهرس المحور يبقى عالقاً)
- server.js ghostSweepPass: وسم isBot بدل حذف+استرداد (الانقطاع ≠ مغادرة) + حالة الجميع آليين=dissolveRoom بالاسترداد
- rooms/shared.js: leftRound في serializeRoom + resumeIfGhost (العودة تستعيد المقعد عبر markOnline/SSE hello) + promoteQueued معطلة أثناء الجولة + logTx في إعادة اقطاع الريماش
- rooms/index.js: تمرير removeRoom للمديرين (حذف نظيف من المحور والمدير معاً)
- الواجهة: index.html (إزالة #gamePageIcon + زر مغادرة رمزي + سطر تحذير الخسارة hidden) + css/09-chrome.css (زر دائري رمزي موحّد + .leave-loss و.gl-confirm-loss) + js/main.js (بلا أيقونة + confirmLeaveGame يُظهر التحذير أثناء الجولة + doLeaveGame يمرّ بleaveForfeit) + ترجمات 4 لغات (g.leaveLossMsg/rm.youLeftLost/rm.leftAiTook) + رفع إصدارات الكاش
- js/core/rooms.js: leaveForfeit + مستمع room:leave (إشعارات) + فتح roomSettle/settleTeam للجميع مع كتم رسالة «مسبقاً»
- الألعاب: uno-app/baloot-app (_seatPresent يستثني isBot + _isDriver من driverId + تسوية أي نشط) + rd-app وengines.js (rp/pn) وbg-room وdomino-room: فتح بوابة التسوية
- الاختبارات: جديد tests/_bet_settle_v269_test.js 45/45 ✓ (10 أقسام تغطي العقد المالي كاملاً) + تحديث v267 (36/36 · سلوك الاسترداد→الخسارة وفق التوجيه) وreq678 (16/16 · قفل المالك→مغادرة=خسارة + إصلاح تقادم كلمة المرور والرهان) و_leave_btn_static (43/43) + عدّاء tests/_run_regression_rooms.sh
- توثيق: CHANGELOG v2.69.0 (أ-د) + package.json 2.69.0

Stage Summary:
- جذر «الرهان لا يُقتطع ولا يُضاف للرابح» = انزياح order بحذف المغادر/الشبح منتصف الجولة + حصر التسوية في جهاز المالك — كلاهما قُلع جذرياً
- التحقق بالمقارنة النسبية: فشل req3 «لوحة المتفرج» أُثبت موروثاً على كود v2.68 (worktree بنفس النتيجة 9/10) — ليس انحداراً من v2.69
- كل الأخضر: v269 45 · v267 36 · v268 28 · leave-btn 43 · req678 16 · داما 12 · روندا 24 · لحاق 7 · صمود 10 · أمن 37 · نظافة 4 · نشر 14 · حارس 20 · v262 44
- جاهز للالتزام والدفع v2.69.0
