# مواصفة تصميم «الضومنة والطاولة» — مرجع مُلزِم (v2.48)

> **إلى كل المساعدين الآليين:** هذا الملف هو مرجع التصميم الملزِم للعبتَي **الضومنة (do/dm)** و**الطاولة (bg/bw)**.
> أي تعديل على `css/21-classic.css` أو `css/22-look.css` أو DOM هاتين اللعبتين **يجب** أن يمرّ بالحارس
> `tests/_look_v248_test.js` (متصفح) وأن يُحدَّث هذا الملف. المستودع عام ⇒ لا أسرار هنا.
>
> آخر تحديث: 2026-09-20 (v2.48) — وكيل Arena. **مدموج في `main`** (PR #2 · merge `9736918`).
> تنبيه: لا تخلطوا `v2.48` (تصميم/لعب الضومنة والطاولة) مع `v2.46`/`v2.46.1` (شرائح البونص/المحفظة).

---

## 1) قرارات المالك الملزمة (لا تُناقش مرة أخرى)

1. **الضومنة جوخ أخضر في الوضعين** (بورتريه + لاندسكيب). مرفوض: الطاولة الخشب البنّي، و«الرفّ الخشبي»
   المنفصل أسفل اليد. (كانت مواصفة v2.45-LOOK تقول «خشب طبيعي في اللاندسكيب» — **أُلغيت**.)
2. **كل قطع اليد كاملة الظهور دائماً**: لا قصّ، لا شريط تمرير، ولا نقاط تُرسم خارج القطعة.
3. **اللاعبان غير محشورين في الأعلى**: بورتريه ⇒ الخصم أعلى-يسار وأنا أعلى-يمين (شريط الحالة)،
   لاندسكيب ⇒ الخصم أعلى-يمين وأنا أسفل-يسار.
4. **لا شريط/عنصر رهان في شاشة الشطرنج أو أي وضع تدريبي** (انظر `docs/FIXES_FROZEN_v2451.md`).
5. **الطاولة (bg) يجب أن تكون قابلة للعب**: شاشة الإعدادات تُخفى كلياً عند بدء اللعب
   (كانت `#bwPlay{display:grid/flex!important}` تُظهرها فوق القائمة ⇒ لا نقرة تصل).

---

## 2) عقد DOM (لا تُغيّر الأسماء/البنية بلا تحديث هذا الملف)

### الضومنة — `dominoes-game/js/ui/domino-html.js`
```
#dmStage.stage
├─ #dmMenu.dm-screen.dm-screen-active      شاشة الإعداد
├─ #dmPlay.dm-screen                        شاشة اللعب
│  ├─ .dm-hud   (#dmSeatOpp · .dm-hudmid · #dmSeatMe)
│  ├─ .dm-opprow (#dmOppRow)               رزم/يد الخصم — عمود رأسي على الحافة اليمنى
│  ├─ .dm-table (#dmTable)
│  │  ├─ .dm-felt                          الجوخ الأخضر (+ .dm-felt::after حدّ داخلي رفيع)
│  │  ├─ .dm-chain (#dmChain)              المسار — متمركز في وسط الطاولة
│  │  ├─ .dm-endhint (#dmHintL/#dmHintR)
│  │  └─ .dm-boneyard (#dmBoneyard)        البنك — صندوق على الحافة اليسرى
│  └─ .dm-handwrap → .dm-tools (أقراص دائرية) + .dm-hand (.dm-htile → .dm-face → .dm-half/.dm-sep)
```
- القطعة: `<button class="dm-htile[ can][ forced]" disabled?>` داخلها `.dm-face` (absolute inset:0)
  ثم `.dm-half` (شبكة 3×3 من `.dp-cell[.on]`) و`.dm-sep`.
- **`.dm-face` يجب أن يكون `position:absolute; inset:0`** — بدونه تُرسم النقاط خارج حدود القطعة
  فتبدو «ناقصة/مقصوصة» (هذا سبب العطل الذي أبلغ عنه المالك).

### الطاولة — `backgammon-game/js/ui/bg-html.js`
```
#bwStage.stage
├─ #bwMenu.bw-screen.bw-screen-active       شاشة الإعداد
└─ #bwPlay.bw-screen                        شاشة اللعب
   ├─ .bw-hud  (#bwSeatTop · .bw-hudmid · #bwSeatBot)
   │  └─ .bw-seat → .bw-avatar + .bw-seatmeta(.bw-seatname + .bw-seatrow(.bw-seatscore + .bw-seatpip))
   ├─ .bw-board (#bwBoard) → .bw-points (#bwPoints) + .bw-traycol
   └─ .bw-dicebar → .bw-dice + .bw-rollbtn + .bw-tools
```
- بطاقة اللاعب **ثلاثة أسطر**: الاسم · `Score:` (ذهبي كبير) · `Pips:` (فاتح).
  العناوين تأتي من `::before` على `.bw-seatrow` و`.bw-seatpip` (كما في مرجع المالك: `Score:` / `Pips:`).
- حالات اللوحة التي يولّدها `bg-renderer.js`: `.bw-col.src` (مصدر قانوني) · `.bw-col.dst` (وجهة) ·
  `.bw-col.selc` (المختار) · `.bw-bar.src` · `.bw-tray.dst`.

---

## 3) المقاسات المُلزِمة (CSS)

| العنصر | القيمة | الملف |
|---|---|---|
| المرحلتان `#dmStage`/`#bwStage` | `position:absolute; inset:0` داخل `#gamePageBody` (بلا تحجيم transform) | `css/21-classic.css` §v2.48-FIT |
| شاشة اللعب | `overflow:hidden` **في شاشتَي اللعب فقط** (شاشات الإعداد تبقى قابلة للتمرير على الشاشات الصغيرة) | نفس الموضع |
| ارتفاع قطعة يد الضومنة | `--dm-tile-h: clamp(44px, min(23dvh, (100vw - 64px)/7*1.86), 100px)` | `css/22-look.css` |
| عرض القطعة | `height × 0.54` (ثابت) | `css/22-look.css` |
| اليد | `overflow:visible` · `flex-wrap:nowrap` · `gap:6px` · حشو علوي 12px | `css/22-look.css` |
| البنك | الحافة اليسرى · عمودياً في الوسط · 64×88px | `css/22-look.css` |
| رزمة الخصم | الحافة اليمنى · عمود رأسي · `max-height:52%` · ظهر عاجي 20×38 | `css/22-look.css` |
| المسار | `inset: 12% 22%` (وسط الطاولة) | `css/22-look.css` |
| القطعة القابلة للّعب | تدرّج `#ffe873→#e9c62f` + توهّج + `translateY(-5px)` في اليد | `css/22-look.css` |
| النرد | 56×56px (بورتريه) · 46×46px (لاندسكيب) عاجي ونقاط داكنة | `css/22-look.css` |
| تلميح الحركة | المصادر `.src` خضراء نابضة · الوجهات `.dst` خضراء متقطعة نابضة · المختار `.selc` ذهبي | `css/22-look.css` |
| مواضع اللاعبين | **بورتريه**: الخصم أعلى-يسار · الحالة وسطاً · أنا أعلى-يمين — **لاندسكيب**: الخصم أعلى-يسار الطاولة · أنا أسفل-يمين فوق اليد | `css/22-look.css` §v2.48-SEATS |
| ترتيب المقاعد | يُضبط بالـ`order` لا بترتيب DOM: في RTL **الأول = اليمين** ⇒ `#dmSeatMe{order:1}` و`#dmSeatOpp{order:3}` (ونفسه لبطاقتَي الطاولة) | نفس الموضع |

كاش الملفات: `css/21-classic.css?v=look2` و`css/22-look.css?v=look2`. **أي تعديل على هذين الملفين
يستوجب رفع رقم `?v=`** وإلا بقي الزائر العائد على نسخة قديمة.

---

## 4) الممنوعات (منع الانحدار)

1. ❌ `#bwStage #bwPlay{display:grid|flex!important}` بلا شرط `.bw-screen-active` — يُظهر شاشة اللعب
   فوق الإعدادات فتصبح اللعبة غير قابلة للعب.
2. ❌ إعادة `aspect-ratio` أو `width:auto` على `.dm-htile` داخل اليد.
3. ❌ `overflow-y:auto/visible` على `.dm-hand` أو `.dm-htile` (يقتطع القطع).
4. ❌ إعادة الرفّ الخشبي `.dm-handwrap::before` أو جوخ بنّي في اللاندسكيب.
5. ❌ حذف `inset:0` من `.dm-htile .dm-face`.
6. ❌ إعادة `.bw-seatrow` سطراً واحداً (Score وPips في نفس السطر) — المرجع ثلاثة أسطر.
7. ❌ جعل `.dm-screen/.bw-screen` كلها `overflow:hidden` — يكسر قوائم الإعداد الطويلة على الشاشات الصغيرة.
8. ❌ الاعتماد على ترتيب DOM لمواضع اللاعبين — في RTL ينعكس. استعملوا `order` أو مواضع صريحة.

---

## 5) الفحوص الإلزامية

```bash
bash scripts/qa-env.sh                     # خادم + Playwright
export PATH=/tmp/node24/bin:$PATH
export NODE_PATH=/tmp/pw/node_modules
export PLAYWRIGHT_BROWSERS_PATH=/tmp/pw/browsers
node tests/_look_v248_test.js              # حارس التصميم (بورتريه + لاندسكيب)
node tests/_do_visual_test.js              # لعب كامل + لقطات الضومنة
node tests/_bg_do_integration_test.js      # تكامل الطاولة/الضومنة
```
**بلا متصفح** (خادم فقط): `_repo_hygiene_test` · `_frontend_tx_test` · `_security_static_test` ·
`_parchisi_engine_test` · `_cf_payments_test` — كلها مستقلة عن التصميم.

> ⚠️ بيئات بلا متصفح (مثل صندوق Arena هذا): التحقق البصري يتم عبر **معاينة محلية** لكامل الفرع
> قبل أي دمج، ثم الحارس أعلاه عند أول بيئة تملك Playwright.
