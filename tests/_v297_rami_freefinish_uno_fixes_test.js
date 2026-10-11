/* ═══════════════════════════════════════════════════════════════════════════
   [v2.97] حرس الإنهاء الحر في رامي + إصلاحا أونو (زر التخطي + ملاءمة اليد)
   بلاغ المالك 2026-10-12 — ثلاثة أعطال ميدانية:
   ① رامي: «سحبت ورقة المرموق وأنهيت الشوط بورقة إنهاء جوكر وتم احتساب جزاء
      مضاعف للخصوم — المفروض الجزاء المضاعف يحتسب فقط إذا كان الإنهاء حراً
      (السحب من ورق التوزيع كما في قواعد اللعبة)».
      الجذر: _setJokerDoubleIfFree كان يفحص وسم الورقة المعزولة وحدها
      (fromDiscard/fromLaTour) — وهي صادقة لجوكر قديم حر في اليد — بينما
      حرية الإنهاء يحددها مصدر سحبة الدور الحاسم نفسها.
   ② أونو: «زر تخطي الدور يظهر ولا يستجيب للنقر» — الربط كان يجري قبل
      box.innerHTML فلا يجد الزر أصلاً (أو يربط عنصراً على وشك الاستبدال).
   ③ أونو: «عندما يزيد عدد أوراق اللاعب الرئيسي تُقص الأوراق وتختفي في نهاية
      سلسلة الأوراق أسفل الشاشة — لاندسكيب وبورتريه» — خطوة المروحة ثابتة
      (34/30/26px) والقوس تربيعي بلا سقف فيفيضان أفقي وعمودي خارج المسرح.
   تشغيل:  node tests/_v297_rami_freefinish_uno_fixes_test.js  (محرك خالص + ساكن)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name); }
}

/* ═══════════ جزء 1: فحوص مصدر ساكنة ═══════════ */
console.log('── 1) رامي: عقود الإنهاء الحر في المصدر ──');
{
  const rami = read('js/games/rami.js');
  ok(rami.indexOf('this.turnDrawSource = null;') !== -1, 'roundManager: حقل turnDrawSource مُصرَّح ويُصفَّر');
  ok(rami.indexOf("this.roundManager.turnDrawSource = 'deck';") !== -1, 'سحب المجرف يوسم الدور deck');
  ok(rami.indexOf("this.roundManager.turnDrawSource = isLaTour ? 'latour' : 'discard';") !== -1, 'سحب المرموق/لا تور يوسم الدور discard/latour');
  ok(rami.indexOf("this.roundManager.turnDrawSource = 'fojok';") !== -1, 'سحب الفوجوك يوسم الدور fojok (حرة من ورق التوزيع)');
  ok(/nextPlayer\(\)[\s\S]{0,900}turnDrawSource = null/.test(rami), 'nextPlayer يصفّر مصدر السحبة (لا تسرب بين الأدوار)');
  const fn = rami.slice(rami.indexOf('_setJokerDoubleIfFree(isolatedCard)'));
  ok(fn.indexOf("const src = this.roundManager.turnDrawSource;") !== -1 &&
    fn.indexOf("(src === 'deck' || src === 'fojok')") !== -1,
    '_setJokerDoubleIfFree يشترط سحبة الدور من ورق التوزيع (deck/fojok)');
  ok(rami.indexOf('turnDrawSource: (rm.turnDrawSource ===') !== -1 &&
    rami.indexOf('rm.turnDrawSource = (d.rm.turnDrawSource ===') !== -1,
    'مصدر السحبة يدخل التسلسل والاستعادة (استئناف الجولة محفوظ الحرية)');
}

console.log('── 2) أونو: زر التخطي بتفويض دائم + ملاءمة اليد ──');
{
  const app = read('uno-game/js/ui/uno-app.js');
  ok(app.indexOf("closest('#unPassBtn')") !== -1 && /_bindGame[\s\S]{0,2200}unActions/.test(app),
    'النقر على زر التخطي مُفوَّض على حاوية #unActions الدائمة من _bindGame');
  const ra = app.slice(app.indexOf('_renderActions: function'), app.indexOf('_renderActions: function') + 1400);
  ok(ra.indexOf("this.$('unPassBtn')") === -1,
    '_renderActions لم يعد يربط قبل innerHTML (الجذر القاتم للعطل ②)');
  ok(app.indexOf("s.phase !== 'play' || s.turn !== my || !this._isHumanSeat(s, my)) return;") !== -1,
    '_doPass محصَّن: لا تخطي إلا لصاحب الدور في مرحلة اللعب');
  ok(app.indexOf('_fitHand: function') !== -1 &&
    app.indexOf("this._fitHand();") !== -1,
    '_fitHand موجودة وتُستدعى من بناء اليد');
  ok(app.indexOf('addEventListener(\'resize\', this._fitHandBound)') !== -1 &&
    app.indexOf("removeEventListener('resize', this._fitHandBound)") !== -1,
    'إعادة الاشتقاق عند تغيّر المقاس/الاتجاه (attach/detach متوازنان)');

  const css = read('uno-game/css/uno.css');
  ok(css.indexOf('--un-fan-step: min(var(--un-fan-base, 34px), var(--un-fan-fit, 999px));') !== -1,
    'خطوة المروحة مطاطية: min(الأساس، سقف الملاءمة)');
  ok(css.indexOf('--un-fan-base: 34px;') !== -1 &&
    css.indexOf('--un-fan-base: 30px;') !== -1 &&
    css.indexOf('--un-fan-base: 26px;') !== -1,
    'قيم الاستجابة الثلاث منقولة إلى --un-fan-base على المسرح');
  ok(css.indexOf('translateY(min(calc(var(--un-d) * var(--un-d) * 2.4px), 30px))') !== -1,
    'سقف هبوط قوس اليد 30px (الطرفان لا يهبطان تحت الشاشة)');
  ok(css.indexOf('rotate(clamp(-22deg, calc(var(--un-d) * 3.6deg), 22deg))') !== -1,
    'سقف ميلان طرفي اليد ±22deg');
}

/* ═══════════ جزء 2: محرك رامي — سلوك الإنهاء الحر ═══════════ */
console.log('── 3) المحرك: بلاغ المالك بالضبط وسيناريوهات الحرية ──');
const code = read('js/games/rami.js');
const storage = {};
const ctx = {
  console, Date, Math, JSON, Set, Map, Array, Object, Number, String,
  setTimeout: (fn) => fn(), window: {},
  localStorage: {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  },
  _ramiToast: () => {}, SND: {}
};
vm.createContext(ctx);
vm.runInContext(code + '\n;globalThis.__X = { RamiGame, ramiSerializeGame, ramiDeserializeGame };', ctx);
const { RamiGame, ramiSerializeGame, ramiDeserializeGame } = ctx.__X;

let _cid = 9000;
function C(rank, suit) {
  const baseValue = rank === 1 ? 10 : (rank > 10 ? 10 : rank);
  return { id: 'T' + (_cid++), rank, suit, baseValue, isJoker: false, displayName: rank + suit };
}
function JOKER() {
  return { id: 'J' + (_cid++), rank: 99, suit: 'joker', baseValue: 10, isJoker: true, displayName: 'جوكر' };
}
/* يد الإنهاء: متتالية حرة + متماثلة حرة + مجموعات مكملة (والمرموق داخلها) + جوكر للعزل */
function meldables() {
  return [
    C(10, 'heart'), C(11, 'heart'), C(12, 'heart'),          /* متتالية حرة */
    C(13, 'spade'), C(13, 'heart'), C(13, 'diamond'),        /* متماثلة حرة */
    C(7, 'club'), C(7, 'diamond'),                           /* +7♥ المكمّلة */
    C(3, 'spade'), C(4, 'spade'), C(5, 'spade'), C(6, 'spade') /* +7♠ المكمّلة */
  ];
}
function lastRec(g) { return g.roundManager.roundHistory[g.roundManager.roundHistory.length - 1]; }

/* ═══ 3-أ) بلاغ المالك بالضبط (طالاج): سحب المرموق + إنهاء بجوكر ⇒ لا تضاعف ═══ */
{
  const g = new RamiGame('talaj', 2, 1, 42, 90);
  g.startMatch();
  const rm = g.roundManager;
  const dealer = g.players[rm.dealerIndex];
  const p2 = g.players.find(x => x.id !== dealer.id);

  /* الموزع (طالاج: يبدأ بورقة الرمي) يرمي أي ورقة ⇒ تنتقل الدورة للاعب */
  g.executeMove({ type: 'discard', playerId: dealer.id, cardId: dealer.hand[dealer.hand.length - 1].id });

  const jok = JOKER();
  p2.hand = meldables().concat([jok]);
  p2.hasOpened = true;
  const marmouq = C(7, 'heart');
  rm.discardPile.push(marmouq);            /* أعلى المرموق = 7♥ (لا تور ليست هي */

  const dr = g.executeMove({ type: 'draw_discard', playerId: p2.id });
  ok(dr.success === true, 'أ) سحب المرموق نجح');
  ok(rm.turnDrawSource === 'discard', 'أ) مصدر السحبة موسوم discard');
  const fin = g.executeMove({ type: 'finish', playerId: p2.id, isolateCardId: jok.id });
  ok(fin.success === true && fin.finished === true, 'أ) الإنهاء بجوكر معزول نجح');
  ok(lastRec(g).doubled === false, 'أ) ★ لا شوط مضاعف: السحبة من المرموق = إنهاء غير حر');
  ok(dealer.lastRoundPoints === g.rules.fullHandPenalty,
    'أ) الخصم غير المفتوح = ' + g.rules.fullHandPenalty + ' لا ' + (g.rules.fullHandPenalty * 2) + ' (كان يُحتسب مضاعفاً قبل الإصلاح)');
}

/* ═══ 3-ب) الإنهاء الحر يبقى مضاعفاً: سحب المجرف + إنهاء بجوكر ═══ */
{
  const g = new RamiGame('talaj', 2, 1, 42, 90);
  g.startMatch();
  const rm = g.roundManager;
  const dealer = g.players[rm.dealerIndex];
  const p2 = g.players.find(x => x.id !== dealer.id);
  g.executeMove({ type: 'discard', playerId: dealer.id, cardId: dealer.hand[dealer.hand.length - 1].id });

  const jok = JOKER();
  p2.hand = meldables().concat([jok]);
  p2.hasOpened = true;
  rm.drawPile.push(C(7, 'heart'));         /* أعلى المجرف = 7♥ */

  const dr = g.executeMove({ type: 'draw_deck', playerId: p2.id });
  ok(dr.success === true, 'ب) السحب من ورق التوزيع نجح');
  ok(rm.turnDrawSource === 'deck', 'ب) مصدر السحبة موسوم deck');
  const fin = g.executeMove({ type: 'finish', playerId: p2.id, isolateCardId: jok.id });
  ok(fin.success === true && fin.finished === true, 'ب) الإنهاء بجوكر معزول نجح');
  ok(lastRec(g).doubled === true, 'ب) ★ الشوط مضاعف محفوظ: الإنهاء الحر من ورق التوزيع');
  ok(dealer.lastRoundPoints === g.rules.fullHandPenalty * 2,
    'ب) الخصم غير المفتوح = ' + (g.rules.fullHandPenalty * 2) + ' (المضاعف لا يُفقد)');
}

/* ═══ 3-ج) السامبل: سحب المرموق + إنهاء بجوكر ⇒ لا تضاعف ═══ */
{
  const g = new RamiGame('samel', 2, 1, 7, 90);
  g.startMatch();
  const rm = g.roundManager;
  /* عزل السيناريو من عشوائية الجوكر المعيَّن (الفوجوك) — الحرية تُختبر لا التعيين */
  rm.jokerIndicator = null;
  g.rules.jokerIndicator = null;
  rm.jokerIndicatorInfo = null;
  /* السامبل: اللاعب بعد الموزع يبدأ (المرموق فارغ أصلاً) */
  const p2 = g.players[(rm.dealerIndex + 1) % g.players.length];
  const other = g.players.find(x => x.id !== p2.id);

  const jok = JOKER();
  p2.hand = meldables().slice(0, 12).concat([jok]);   /* 12 مكملة + جوكر = 13 */
  p2.hasOpened = true;
  const marmouq = C(7, 'heart');
  rm.discardPile.push(marmouq);

  const dr = g.executeMove({ type: 'draw_discard', playerId: p2.id });
  ok(dr.success === true, 'ج) سامبل: سحب المرموق نجح');
  const fin = g.executeMove({ type: 'finish', playerId: p2.id, isolateCardId: jok.id });
  ok(fin.success === true && fin.finished === true, 'ج) سامبل: الإنهاء بجوكر نجح (المرموق داخل المجموعات)');
  ok(lastRec(g).doubled === false, 'ج) ★ سامبل: لا تضاعف بعد سحب المرموق');
  ok(other.lastRoundPoints === g.rules.fullHandPenalty, 'ج) الخصم = ' + g.rules.fullHandPenalty + ' لا المضاعف');
}

/* ═══ 3-د) الفوجوك حرة (من ورق التوزيع): سحبها + إنهاء بجوكر ⇒ تضاعف ═══ */
{
  const g = new RamiGame('samel', 2, 1, 7, 90);
  g.startMatch();
  const rm = g.roundManager;
  g.rules.jokerIndicator = null;           /* الفوجوك ورقة عادية هنا لا معيَّنة */
  rm.jokerIndicatorInfo = null;
  const p2 = g.players[(rm.dealerIndex + 1) % g.players.length];
  const other = g.players.find(x => x.id !== p2.id);

  const jok = JOKER();
  const fojok = C(7, 'heart');
  rm.jokerIndicator = fojok;               /* الفوجوك المطروحة للسحب */
  p2.hand = meldables().slice(0, 12).concat([jok]);
  p2.hasOpened = true;

  const dr = g.executeMove({ type: 'draw_fojok', playerId: p2.id });
  ok(dr.success === true, 'د) سحب الفوجوك نجح');
  ok(rm.turnDrawSource === 'fojok', 'د) مصدر السحبة موسوم fojok');
  const fin = g.executeMove({ type: 'finish', playerId: p2.id, isolateCardId: jok.id });
  ok(fin.success === true && fin.finished === true, 'د) الإنهاء بجوكر نجح');
  ok(lastRec(g).doubled === true, 'د) ★ الفوجوك من ورق التوزيع = إنهاء حر ⇒ شوط مضاعف');
  ok(other.lastRoundPoints === g.rules.fullHandPenalty * 2, 'د) الخصم = ' + (g.rules.fullHandPenalty * 2));
}

/* ═══ 3-هـ) لا تسرب بين الأدوار: مصدر السحبة يخص دوره فقط ═══ */
{
  /* السامبل: الاحتفاظ بورقة المرموق قانوني (غير حرة هذا الدور فقط) —
     فيكون تناوب السحبتين عبر دورين كاملاً بلا ضجيج جزاءات الطالاج */
  const mkSamel = () => {
    const g = new RamiGame('samel', 2, 1, 7, 90);
    g.startMatch();
    g.rules.jokerIndicator = null;
    g.roundManager.jokerIndicator = null;
    g.roundManager.jokerIndicatorInfo = null;
    return g;
  };
  const seatAfter = (g) => g.players[(g.roundManager.dealerIndex + 1) % g.players.length];
  const otherOf = (g, p) => g.players.find(x => x.id !== p.id);

  /* هـ1: مرموق في دورٍ سابق ثم مجرف في دور الإنهاء ⇒ مضاعف (لا بقايا discard) */
  const g = mkSamel();
  const rm = g.roundManager;
  const p2 = seatAfter(g);
  const dealer = otherOf(g, p2);
  const jok = JOKER();
  const filler = C(2, 'diamond');
  /* الدور 1: يد 13 (11 مكملة + حشوة + جوكر) — يسحب 6♠ مرموقاً ويرمي الحشوة */
  p2.hand = [C(10, 'heart'), C(11, 'heart'), C(12, 'heart'),
    C(13, 'spade'), C(13, 'heart'), C(13, 'diamond'),
    C(7, 'club'), C(7, 'diamond'),
    C(3, 'spade'), C(4, 'spade'), C(5, 'spade'), filler, jok];
  p2.hasOpened = true;
  rm.discardPile.push(C(6, 'spade'));
  ok(g.executeMove({ type: 'draw_discard', playerId: p2.id }).success === true, 'هـ1) الدور 1: سحب المرموق');
  ok(g.executeMove({ type: 'discard', playerId: p2.id, cardId: filler.id }).success === true, 'هـ1) الدور 1: رمي الحشوة (الاحتفاظ بالمرموق قانوني في السامبل)');
  /* الخصم يلعب دوره ثم دور اللاعب من جديد */
  g.executeMove({ type: 'draw_deck', playerId: dealer.id });
  g.executeMove({ type: 'discard', playerId: dealer.id, cardId: dealer.hand[dealer.hand.length - 1].id });
  ok(rm.turnDrawSource === null, 'هـ1) تصفير المصدر عند انتقال الدور');
  /* الدور 2: يسحب المجرف (7♥) وينهي بجوكر */
  rm.drawPile.push(C(7, 'heart'));
  g.executeMove({ type: 'draw_deck', playerId: p2.id });
  const fin = g.executeMove({ type: 'finish', playerId: p2.id, isolateCardId: jok.id });
  ok(fin.success === true && fin.finished === true, 'هـ1) الإنهاء بعد دورين نجح');
  ok(lastRec(g).doubled === true, 'هـ1) ★ سحبة المجرف في دور الإنهاء تضاعف — لا بقايا سحبة المرموق السابقة');

  /* هـ2: مجرف في دور سابق ثم مرموق في دور الإنهاء ⇒ لا مضاعف (لا بقايا deck) */
  const g2 = mkSamel();
  const rm2 = g2.roundManager;
  const q2 = seatAfter(g2);
  const d2 = otherOf(g2, q2);
  const jok2 = JOKER();
  const filler2 = C(2, 'diamond');
  q2.hand = [C(10, 'heart'), C(11, 'heart'), C(12, 'heart'),
    C(13, 'spade'), C(13, 'heart'), C(13, 'diamond'),
    C(7, 'club'), C(7, 'diamond'),
    C(3, 'spade'), C(4, 'spade'), C(5, 'spade'), filler2, jok2];
  q2.hasOpened = true;
  rm2.drawPile.push(C(6, 'spade'));        /* الدور 1: يسحب مجرفاً */
  g2.executeMove({ type: 'draw_deck', playerId: q2.id });
  g2.executeMove({ type: 'discard', playerId: q2.id, cardId: filler2.id });
  g2.executeMove({ type: 'draw_deck', playerId: d2.id });
  g2.executeMove({ type: 'discard', playerId: d2.id, cardId: d2.hand[d2.hand.length - 1].id });
  /* الدور 2: يسحب المرموق (7♥) وينهي بجوكر */
  rm2.discardPile.push(C(7, 'heart'));
  g2.executeMove({ type: 'draw_discard', playerId: q2.id });
  const fin2 = g2.executeMove({ type: 'finish', playerId: q2.id, isolateCardId: jok2.id });
  ok(fin2.success === true && fin2.finished === true, 'هـ2) الإنهاء بعد دورين نجح');
  ok(lastRec(g2).doubled === false, 'هـ2) ★ سحبة المرموق في دور الإنهاء تمنع التضاعف — لا بقايا سحبة المجرف السابقة');
}

/* ═══ 3-و) التسلسل: حرية الإنهاء تنجو من الحفظ والاستئناف ═══ */
{
  const g = new RamiGame('talaj', 2, 1, 42, 90);
  g.startMatch();
  const rm = g.roundManager;
  const dealer = g.players[rm.dealerIndex];
  const p2 = g.players.find(x => x.id !== dealer.id);
  g.executeMove({ type: 'discard', playerId: dealer.id, cardId: dealer.hand[dealer.hand.length - 1].id });
  p2.hand = meldables().concat([JOKER()]);
  p2.hasOpened = true;
  rm.discardPile.push(C(7, 'heart'));
  g.executeMove({ type: 'draw_discard', playerId: p2.id });

  ramiSerializeGame(g);
  const g2 = ramiDeserializeGame();
  ok(!!g2, 'و) الاستعادة من التخزين نجحت');
  ok(g2.roundManager.turnDrawSource === 'discard', 'و) ★ مصدر السحبة نجا من التسلسل (discard)');
  const before = g2.roundManager.roundHistory.length;
  g2.roundManager.nextPlayer();
  ok(g2.roundManager.turnDrawSource === null, 'و) nextPlayer بعد الاستعادة يصفّر المصدر');
  ok(g2.roundManager.roundHistory.length === before, 'و) لا أثر جانبي على سجل الأشواط');
}

/* ═══════════ جزء 3: البصمات والتغطية (اشتقاق قاعدة 22) ═══════════ */
console.log('── 4) البصمات والتغطية ──');
{
  const pkgV = JSON.parse(read('package.json')).version;
  const stamp = 'v' + pkgV.split('.').slice(0, 2).join('');
  const idx = read('index.html');
  ok(idx.indexOf('js/games/rami.js?v=' + stamp) !== -1, 'بصمة rami.js = ' + stamp);
  ok(idx.indexOf('uno-game/js/ui/uno-app.js?v=' + stamp) !== -1, 'بصمة uno-app.js = ' + stamp);
  ok(/uno-game\/css\/uno\.css\?v=un[1-9][0-9]*/.test(idx), 'بصمة uno.css مرفوعة (un)');
  ['js/i18n/translations.js', 'js/games/ronda.js', 'js/games/billiards.js', 'js/core/arb-client.js']
    .forEach(function (f) {
      ok(new RegExp(f.replace(/\./g, '\\.') + '\\?v=' + stamp).test(idx), 'بصمة ' + f + ' = ' + stamp);
    });
  ok(read('js/main.js').indexOf("window.DTSG_BUILD = 'v" + pkgV + "';") !== -1, 'DTSG_BUILD = v' + pkgV);
  const runner = read('tests/_run_regression_rooms.sh');
  ok(runner.indexOf('_v297_rami_freefinish_uno_fixes_test.js') !== -1, 'الحرس مُدرج في عدّاء البطارية');
  ok(read('CHANGELOG.md').indexOf('## v2.97.0') !== -1, 'CHANGELOG: كتلة v2.97.0 موجودة');
  ok(read('AGENTS.md').indexOf('[v2.97]') !== -1, 'AGENTS.md: قاعدة v2.97 موثّقة');
}

console.log('\nالنتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل');
process.exit(fail ? 1 : 0);
