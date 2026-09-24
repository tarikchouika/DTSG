# أونو (Uno) — دليل الدمج في منصة DTSG

> لعبة أوراق كاملة القواعد (108 بطاقة، 4 ألوان، تخطي/رجوع/+2/+4/براغي، UNO وجزاءاته) —
> 2 إلى 4 لاعبين، ضد البوت (3 مستويات) أو محلياً على جهاز واحد أو أونلاين بغرف المنصة.
> مبنية على عقد المنصة نفسه (نمط البلوت bl / الطاولة bg / الضومنة do): مشروع مستقل
> بلا اعتماد على المنصة، يقرأ العقد الاختياري `ST/toast/TR/langIndex/AUTH/Rooms`
> ويعمل مستقلاً في غيابها.
>
> **تعليمي مجاني في وضعي البوت/المحلي (بلا رهان) — الرهان بين اللاعبين في الغرف فقط.**
> **بلا أزرار قواعد/إيقاف داخل اللعبة — القواعد في أيقونة الكتاب بهيدر اللعبة (FULL_RULES.un).**

---

## 1) ما الذي يُدمج (قائمة الملفات)

| الملف | الدور |
|---|---|
| `uno-game/js/engine/uno-core.js` | المحرك الحتمي (UNCore): بناء 108 بطاقة، توزيع، حركات قانونية، إعادة تدوير الكوم، قيم الأوراق |
| `uno-game/js/engine/uno-game.js` | سير المباراة (UNGameNS) + ذكاء اصطناعي 3 مستويات + `aiPlan` (قرارات نقية للسائق) |
| `uno-game/js/ui/uno-audio.js` | مؤثرات Web Audio (بلا ملفات صوت) |
| `uno-game/js/ui/uno-i18n.js` | قاموس 80 مفتاح × 4 لغات (الأولوية لقاموس المنصة TR) |
| `uno-game/js/ui/uno-html.js` | بنية الشاشات (القائمة + الطاولة + الطبقات) — بلا رهان ولا إيقاف |
| `uno-game/js/ui/uno-renderer.js` | أوراق SVG + ظهر البطاقة + لوغو المنصة في مركز الطاولة |
| `uno-game/js/ui/uno-app.js` | المتحكم (UnoApp): تدفق ai/local/room + **عقد الغرف** (سائق/منقطعون/تسوية/ريماش/Replay) |
| `uno-game/uno-bridge.js` | جسر الدمج: `eUno / initUno / cleanupUno` + معالجات الغرف + `applyRoomReplay` المتسلسل |
| `uno-game/css/uno.css` | الهوية البصرية (كلاسات معزولة `un-`) — الممشع الأزرق حسب مرجع التصميم |
| `uno-game/index.html` | صفحة مستقلة للاختبار (QA) — غير مطلوب للنشر |
| `uno-game/tests/test-engine.js` | 25 تحقّقاً آلياً على المحرك |
| `uno-game/integration/un-translations-snippet.js` | مفاتيح TR الجاهزة للصق (80 × 4) |
| `assets/games/uno/icon.webp` (+ `icon.png`) | أيقونة كتالوج الألعاب |

**تعديلات المنصة (خطوات 3–9):** ملفات `index.html`، `js/games/catalog.js`، `js/games/engines.js`،
`js/main.js`، `js/core/rooms.js`، `js/rules/game-rules.js`، `js/i18n/translations.js` —
محددة حرفياً أدناه، **وقد نُفّذت في هذا الدمج** (النسخة المرفقة تعمل مباشرة).

---

## 2) خطوات الدمج (بالترتيب)

### الخطوة 1 — نسخ مجلد اللعبة
```bash
cp -r uno-game/ <جذر المستودع>/uno-game/
```

### الخطوة 2 — أيقونة الكتالوج
```bash
mkdir -p <جذر المستودع>/assets/games/uno
cp assets/games/uno/icon.webp assets/games/uno/icon.png <جذر المستودع>/assets/games/uno/
```

### الخطوة 3 — `index.html`: الورقة + السكربتات (بعد البلوت وقبل `engines.js`)
```html
<!-- [UN] أونو: هوية المشروع المستقل (بادئة un-) -->
<link rel="stylesheet" href="uno-game/css/uno.css?v=un1">
...
<!-- [UN] أونو: مشروع مستقل محكوم بعقد المنصة (نمط البلوت) -->
<script src="uno-game/js/engine/uno-core.js?v=un1"></script>
<script src="uno-game/js/engine/uno-game.js?v=un1"></script>
<script src="uno-game/js/ui/uno-audio.js?v=un1"></script>
<script src="uno-game/js/ui/uno-i18n.js?v=un1"></script>
<script src="uno-game/js/ui/uno-renderer.js?v=un1"></script>
<script src="uno-game/js/ui/uno-html.js?v=un1"></script>
<script src="uno-game/js/ui/uno-app.js?v=un1"></script>
<script src="uno-game/uno-bridge.js?v=un1"></script>
```

### الخطوة 4 — `js/games/catalog.js`: إدخال `un` + قواعد مختصرة
داخل `GAMES` (فئة `card`) — بعد `bl`:
```js
{
  id: 'un', eng: 'uno', em: '🃏', art: 'bj', cat: 'card', tag: 'NEW', rtp: 96, pl: 0,
  n: ['أونو', 'Uno', 'Uno', 'أونو'],
  d: ['اللون والرقم — ضد البوت أو 4 لاعبين (محلياً أو أونلاين) · تعليمي مجاني، والرهان في الغرف فقط',
      'Couleur et chiffre — contre l’IA ou 4 joueurs (local ou en ligne) · gratuit, mise en salle uniquement',
      'Color and number — vs AI or 4 players (local/online) · free to play, betting in rooms only',
      'اللون والرقم — ضد البوت ولا 4 لاعيب (محلي ولا أونلاين) · تعليمي مجاني، والرهان غير الغرف']
}
```
وداخل `RULES`: مفتاح `un` (7 أسطر مختصرة — في هذا الملف بالخطوة 4 من المستودع المدمج).

### الخطوة 5 — `js/games/engines.js`: قيد المحرك في `ENG`
```js
/* [UN] أونو: مشروع مستقل محكوم بعقد المنصة (نفس نمط البلوت) */
get uno() { return (typeof window.eUno === 'function') ? window.eUno : null; },
```

### الخطوة 6 — `js/main.js`: ثلاثة مواضع
```js
/* خريطة الأيقونات GAME_IMG: */
bg: 'backgammon', do: 'dominoes', bl: 'baloot', un: 'uno',
/* خريطة المبادِرين: */
uno: (typeof initUno === 'function') ? initUno : null,
/* داخل closeGamePage — بعد cleanupBaloot: */
if (typeof cleanupUno === 'function') {
  try { cleanupUno(); } catch (e) { console.error('cleanupUno error:', e); }
}
```

### الخطوة 7 — `js/core/rooms.js`: ثلاث مواضع
```js
/* أ) roomGameIds: */
roomGameIds: { ..., bl: 4, un: 4, ... }

/* ب) _gameOptsDefs — بعد فرع 'bl': */
if (gid === 'un') return [
  { key: 'target', label: T('un.target') || 'نقاط المباراة', opts: [[200, '200'], [500, '500'], [1000, '1000']], def: 200 },
  timer
];

/* ج) _applyGameOpts — بعد فرع 'bl': */
} else if (gid === 'un') {
  window.UN_ROOM_CFG = o;
  try {
    if (window.UnoApp) {
      if (o.target) window.UnoApp.config.target = Math.max(100, Math.min(2000, parseInt(o.target, 10) || 200));
    }
  } catch (e) {}
}
```

### الخطوة 8 — `js/rules/game-rules.js`: `FULL_RULES.un`
كتلة كاملة (name/goal/steps/details/payouts × 4 لغات) — موجودة في المستودع المدمج بعد `FULL_RULES.bl`.

### الخطوة 9 — `js/i18n/translations.js`: مفاتيح `un.`
الصق `integration/un-translations-snippet.js` داخل كائن `TR` قبل الـ `};` الختامي (80 مفتاح × 4 لغات).

---

## 3) عقد الغرف (نفس البلوت)

| العنصر | القيمة |
|---|---|
| الوسم | `un` — حتى 4 لاعبين (المباراة تبدأ عند اكتمال المقاعد الأربعة) |
| الإعدادات | `target` (200/500/1000 — الافتراضي 200) + `timer` (مؤقت الدور، الافتراضي بلا مؤقت) |
| القناة | `Rooms.sendMove('unmove', { action, data, by, seq, ts })` |
| الإجراء `init` | `{ seed, order[4], names[4], target, level }` — يبثه السائق (المضيف) مرة واحدة |
| الإجراء `play` | `{ seat, cardId, color? }` — `color` للبراغي |
| الإجراء `draw` | `{ seat }` |
| الإجراء `pass` | `{ seat }` — بعد سحبة قابلة للعب |
| الإجراء `uno` | `{ seat }` — صياح UNO |
| الإجراء `next` | `{ round }` من السائق بعد اكتمال تصويت الحاضرين / `{ round, vote: 1 }` من غير السائق |
| السائق | المضيف: يلعب عن المقاعد المنقطعة بذكاء `aiPlan`، ويقدّم الجولات، ويسلّم التسوية |
| التسوية | `Rooms.settleTeam('t0'|'t1')` — فريق الفائز حسب `UNGameNS.teamOf(matchWinner)` (رهان > 0، المضيف، مرة واحدة) |
| الريماش | `Rooms.startRematch()` من السائق بعد نهاية المباراة |
| الاستئناف | `applyRoomReplay` (سلسلة متسلسلة مع بقية الألعاب) + `Rooms.requestReplay` عند العودة |
| إعادة البناء | `applyReplay(history)` — يعيد بناء الحالة من سجل الحركات (init أولًا) |

---

## 4) قواعد اللعب كما نُفّذت

- **108 بطاقة:** لكل لون (أحمر/أزرق/أخضر/أصفر) 0 واحدة، 1-9 بطاقتان، S/R/D بطاقتان لكل منها — مع 4 WILD (W) و4 WILD+4 (X).
- **التوزيع:** 7 لكل لاعب؛ أول بطاقة غير براغي تفتح (إلا ذلك أعيدت مع خلط جديد).
- **المطابقة:** اللون أو الرقم أو براغي. S تخطي · R عكس الاتجاه · D/X السحب +2/+4 وإلغاء الدور.
- **السحب:** بلا حركة قانونية — السحبة القابلة للعب تبقي الدور (العبها أو مرّر)؛ الكوم الفارغ يُعاد تدويره من الطابور (بلا البراغي).
- **UNO:** من بقيت له بطاقة واحدة يصيح — المنسى يسحب بطاقتين (يُنفَّذ تلقائياً على اللاعب البشري عند إهماله).
- **النقاط:** الرقيم بقيمته · S/R/D = 20 · براغي = 50 — مجموع أوراق الخاسرين يضاف للفائز.
- **المباراة:** حتى الهدف (200 افتراضياً) — فردية بلاعبين، وفرقية (المقابِلان) بأربعة.
- **الذكاء الاصطناعي:** مبتدئ (عشوائي) / متوسط (أفضليات مرقّمة، +4 عند ضعف الخصم، تأجيل البراغي) / خبير (اختيار لون البراغي بمنحى الخسارة للضحية).

---

## 5) نتائج الاختبار (أُنفّذت في هذا الدمج)

| المجموعة | النتيجة |
|---|---|
| `uno-game/tests/test-engine.js` | 25/25 نجح |
| `qa/uno-ui-smoke.js` — مباراة كاملة ضد البوت عبر الواجهة (jsdom) | ✓ (لون براغي + UNO + مودال النهاية + العودة للقائمة) |
| `qa/uno-local-smoke.js` — 4 لاعبين محلياً بتسليم الجهاز | ✓ (تسليم يد لكل مقعد + مباراة كاملة) |
| `qa/uno-room-smoke.js` — عقد الغرف (سائق + 3 منقطعين) | ✓ (init/play/draw/pass/uno/next + settleTeam + startRematch) |
| `qa/e2e-platform.js` — الصفحة الحقيقية index.html | ✓ (فتح من الكتالوج + مباراة حيّة + cleanup) |
| استمرارية بلوت (ui/platform/room) | ✓ بلا انكسار |

### عيوب اكتُشفت خلال QA وأُصلحت في هذا الإصدار
1. **جمود الغرف:** `_buildRoomGame` كان ينشئ حالة جديدة بـ `NS.newMatch` دون إعادة ربط `onchange`
   — فيموت سلك `notify → tick` وتجمد الواجهة بعد أول حركة بشرية. أُعيد الربط (`_attachOnChange`)
   بعد `newMatch` بنمط `startMatch`.
2. **الوضع المحلي:** `_mySeat` كان يعيد 0 دائماً فتُعرض يد اللاعب الأول على كل المقاعد.
   صار يعيد المقعد المكشوف (`_revealedSeat`) بعد تسليم الجهاز، مع تصفير `_awaitReveal`
   عند البدء (التسليم الأول كان لا يظهر).
3. **الطبقة العلوية:** `hideOverlay` كان يترك عناصر تفاعلية قديمة في الـ DOM (أزرار اختيار
   اللون) — تُمسح الآن عند الإغلاق.
4. **تسوية الفرق:** خسارة الفريق في 4 لاعبين (المقاعد 0,2 ضد 1,3) كانت قد تُسوّى للفريق
   الخاطئ عند فوز المقعد 2 — أصبحت عبر `UNGameNS.teamOf(matchWinner)`.
