/* ═══════════ Moroccan Rami Helpers ═══════════ */
function _ramiT(key, fallback) {
  if (typeof T === 'function') {
    const val = T(key);
    if (val && val !== key) return val;
  }
  if (typeof window !== 'undefined' && typeof window.T === 'function') {
    const val = window.T(key);
    if (val && val !== key) return val;
  }
  return fallback !== undefined ? fallback : key;
}
/* نسخة بقالب: تستبدل {x} بالقيم قبل/بعد الترجمة — _ramiF('k','fb',{a:5}) */
function _ramiF(key, fallback, vars) {
  let s = _ramiT(key, fallback);
  if (vars && typeof vars === 'object') {
    for (const k in vars) {
      s = s.split('{' + k + '}').join(vars[k]);
    }
  }
  return s;
}

var _lastRamiToast = { msg: '', t: 0, el: null, timer: null };
function _ramiToast(msg, type) {
  /* منع التوستات المكررة/المتناقضة في نفس اللحظة: نفس الرسالة خلال 400ms تُتجاهل */
  const now = Date.now();
  if (msg === _lastRamiToast.msg && (now - _lastRamiToast.t) < 400) return;
  _lastRamiToast.msg = msg;
  _lastRamiToast.t = now;

  /* [V14] توست واحد ثابت يُستبدل بدل التكديس: عنصر واحد يُعاد استخدامه */
  if (typeof document !== 'undefined') {
    let el = _lastRamiToast.el;
    const container = document.getElementById('toasts');
    if (!container) {
      if (typeof toast === 'function') return toast(msg, type);
      if (typeof window !== 'undefined' && typeof window.toast === 'function') return window.toast(msg, type);
      if (typeof console !== 'undefined') console.log('[TOAST ' + (type || 'info') + '] ' + msg);
      return;
    }
    const icons = { Ok: '✅', ok: '✅', Err: '❌', err: '❌', Warn: '⚠️', warn: '⚠️', Info: 'ℹ️', info: 'ℹ️' };
    if (!el || !el.parentNode) {
      /* إزالة أي توستات رامي سابقة متراكمة من جلسات أقدم */
      const prev = container.querySelectorAll('.toast.rami-toast');
      prev.forEach(function (p) { p.remove(); });
      el = document.createElement('div');
      el.className = 'toast rami-toast ' + (type || 'info');
      el.setAttribute('role', 'alert');
      container.appendChild(el);
      _lastRamiToast.el = el;
    } else {
      el.className = 'toast rami-toast ' + (type || 'info');
    }
    /* الرسائل تحمل رموزها التعبيرية مسبقاً — لا نضيف أيقونة مكررة */
    el.innerHTML = '<span>' + msg + '</span>';
    el.style.opacity = '1';
    el.style.transform = 'none';
    if (_lastRamiToast.timer) clearTimeout(_lastRamiToast.timer);
    _lastRamiToast.timer = setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
    }, 2600);
    return;
  }
  if (typeof toast === 'function') return toast(msg, type);
  if (typeof window !== 'undefined' && typeof window.toast === 'function') return window.toast(msg, type);
  if (typeof console !== 'undefined') console.log('[TOAST ' + (type || 'info') + '] ' + msg);
}

/* ═══════════ Crisp Vector Card HTML Generator (100% Zero Broken Images) ═══════════ */
/* ── [Assets] أوراق المنصة الحقيقية: كل وجه صورة أصل كاملة من assets/cards
   (الرقم والرمز مرسومان داخل الأصل) — rcard-vector يحمل الخلفية inline ── */
const RAMI_ASSET_SUIT = { heart: 'hearts', diamond: 'diamonds', sword: 'spades', grape: 'clubs' };
function ramiCardAsset(card) {
  if (!card || card.isJoker) return 'assets/cards/joker1.webp';
  const rankStr = RAMI_RANK_NAMES[card.rank - 1] || String(card.rank);
  const suitKey = RAMI_ASSET_SUIT[card.suit] || 'spades';
  return 'assets/cards/' + rankStr + '-' + suitKey + '.webp';
}
function getRamiCardHTML(card, isBack, extraClass) {
  if (isBack || !card) {
    return '<div class="rcard-vector rcard-back ' + (extraClass || '') + '" style="background-image:url(assets/cards/back.webp)" aria-hidden="true"></div>';
  }
  const asset = ramiCardAsset(card);
  return '<div class="rcard-vector rcard-img ' + (extraClass || '') + '" data-id="' + card.id + '" ' +
    'style="background-image:url(\'' + asset + '\')"></div>';
}

function getPlayerInitials(name, index) {
  if (!name) return 'P' + (index + 1);
  if (name.includes('AI')) return 'AI' + name.replace(/[^0-9]/g, '');
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}


/* ── خوارزمية تقسيم الأوراق المحددة إلى مجموعات متتالية ومتماثلة صالحة للافتتاح والإنزال ── */
/* [EXPERT-AI] ذاكرة نتائج التقسيم — التقسيم الدقيق أغلى عملية حسابية،
   ويُستدعى مراراً بنفس مجموعة الأوراق خلال الدور الواحد.
   المفتاح يشمل هوية الجوكر-المؤشر، والنتيجة تُستنسخ دائماً (المستدعي قد يعدّلها). */
const __ramiPartCache = new Map();
function clearRamiPartitionCache() { __ramiPartCache.clear(); }
if (typeof window !== 'undefined') window.clearRamiPartitionCache = clearRamiPartitionCache;

/* [FREEZE-CORE 2026-09-23] سقوف حتمية (بلا ساعة جدارية — قابلة للإعادة بالضبط):
   • PARTITION_FALLBACK_NODES: سقف عقد DFS لمسار الطوارئ فقط (أيدي أسوأ من كل
     ما يُلعب فعلياً — كانت تتجمد للأبد قبل هذا السقف).
   • PARTITION_EXACT_STATES: سقف حالات المحرك المُخزَّن؛ عند تجاوزه يُستدعى
     DFS المحدود كاحتياط حتمي بدل حجب الواجهة. */
const PARTITION_FALLBACK_NODES = 30000;
const PARTITION_EXACT_STATES = 250000;
/* [R5-FREEZE-FIX 2026-09-24] مهلة جدارية حقيقية لمسار بلا ميزانية: سقف الحالات
   (250k) وحده لا يقيّد الزمن — الحالة الواحدة تمرّ على كل المجموعات الجزئية،
   فكانت الأيدي الغنية (بريات + متتاليات مكررة) تحجب الخيط 1.6 ثانية/استدعاء
   على الحاسوب و5-20 ثانية على الهاتف، والاحتياطي (DFS 30k عقدة × آلاف
   المجموعات) يضيف مثلها. المهلة تُطبّق على المحرك المخزّن وعلى DFS
   الاحتياطي معاً، ويرجع أفضل نتيجة وُجدت — لا حجب للواجهة بعدها. */
const PARTITION_EXACT_TIME_MS = 120;

function partitionSelectedCards(cards, rules, mode, budgetMs) {
  if (!cards || cards.length < 3) return [];
  const validator = rules.validator;
  const n = cards.length;
  /* [AI-TIME-BOUND] البحث الدقيق مناسب لاختيار اللاعب، لكنه قد يمرّ بملايين
     التركيبات في يد بوت مليئة بنسخ متساوية. ميزانية اختيارية تعيد أفضل نتيجة
     وجدت حتى الآن بدل حجب خيط واجهة المتصفح. لا تُطبَّق على استدعاءات اللاعب
     العادية، لذلك لا تتغير دقة التحقق القانوني.
     [FREEZE-CORE 2026-09-23] الاستدعاء بلا ميزانية (getLegalMoves / canFinish /
     _doOpen / _doFinish — مسار اللاعب القانوني) كان يشغّل DFS أسّياً بلا سقف:
     يد طالاج واقعية (متتاليات مكررة + جوكرات) = 139 ألف عقدة ≈ 2.4 ثانية حجب
     للخيط الرئيسي بعد سحب البوت ⇒ «تجمّد» بالضبط عند أول ثانية من العدّاد.
     الآن مسار الميزانية يبقى DFS القديم حرفياً (قرارات الخبير كما هي)، ومسار
     اللاعب ينتقل إلى محرك DP مُخزَّن (bestInc/firstHit) مطابق تماماً للنتائج
     وكسر التعادل (أول عقدة في pre-order) — انظر tests/_rami_partition_exact_test.js. */
  const budget = Number(budgetMs) > 0 ? Number(budgetMs) : 0;
  const deadline = budget ? Date.now() + budget : 0;
  let aborted = false;
  let searchNodes = 0;
  let maxSearchNodes = budget ? 24000 : PARTITION_FALLBACK_NODES;
  /* [R5-FREEZE-FIX] مهلة مسار بلا ميزانية (0 = معطّلة): تُضبط قبل المحرك
     المخزّن وتشمل DFS الاحتياطي — رؤية الختام (closure) للدالتين معاً. */
  let exactDeadline = 0;
  const budgetExpired = () => {
    if (!budget || aborted) return aborted;
    if ((searchNodes & 127) === 0 && Date.now() >= deadline) aborted = true;
    return aborted;
  };
  /* mode='opening': تعظيم النقاط الحرة أولاً (للافتتاح/الإنهاء) —
     الافتراضي تعظيم التغطية (للإنزال بعد الافتتاح) */
  const openingMode = (mode === 'opening');

  const cacheKey = (openingMode ? 'O:' : 'C:') + n + '|' + (rules.jokerIndicator ? 'i' + rules.jokerIndicator.id + ':' : '-') +
    cards.map(c => c.id + '#' + c.rank + c.suit + (c.isJoker ? 'J' : '')).sort().join(',');
  if (!budget && __ramiPartCache.has(cacheKey)) {
    return __ramiPartCache.get(cacheKey).map(m => new RamiMeld(m.type, m.cards.slice()));
  }

  if (validator.isValidSet(cards, true)) return [new RamiMeld(MELD_TYPE.SET, cards.slice())];
  if (validator.isValidSequence(cards, true)) return [new RamiMeld(MELD_TYPE.SEQUENCE, cards.slice())];

  const validSubsets = [];
  const seenSubset = new Set();
  function pushIfValid(type, combo) {
    if (budgetExpired()) return;
    const key = combo.map(c => c.id).sort().join(',');
    if (seenSubset.has(key)) return;
    const ok = (type === MELD_TYPE.SET) ? validator.isValidSet(combo, true) : validator.isValidSequence(combo, true);
    if (ok) {
      seenSubset.add(key);
      validSubsets.push({ type, cards: combo.slice() });
    }
  }
  function getCombos(arr, k) {
    const res = [];
    function bt(start, cur) {
      if (aborted) return;
      if (cur.length === k) { res.push(cur.slice()); return; }
      for (let i = start; i < arr.length; i++) {
        /* [R5-FREEZE-FIX] التعداد أيضاً يحترم مهلة مسار بلا ميزانية — كان يستهلك
           ~0.6 ثانية وحده على يد غنية قبل أي بحث */
        if ((budget || exactDeadline) && ((res.length & 127) === 0) && Date.now() >= (budget ? deadline : exactDeadline)) { aborted = true; return; }
        cur.push(arr[i]); bt(i + 1, cur); cur.pop();
        if (aborted) return;
      }
    }
    bt(0, []);
    return res;
  }

  /* [EXPERT-AI] تعداد موجّه: المتتاليات من نفس الرمز فقط، والمتماثلات من نفس
     الرقم فقط (3-4 أوراق)، والجوكرات تنضم لكل مجموعة — نفس النتائج تماماً
     مع خفض حجم التعداد أضعافاً مضاعفة */
  const wilds = cards.filter(c => rules.isWildCard(c));
  const suitGroups = new Map();
  const rankGroups = new Map();
  for (const c of cards) {
    if (rules.isWildCard(c)) continue;
    if (!suitGroups.has(c.suit)) suitGroups.set(c.suit, []);
    suitGroups.get(c.suit).push(c);
    if (!rankGroups.has(c.rank)) rankGroups.set(c.rank, []);
    rankGroups.get(c.rank).push(c);
  }
  for (const group of suitGroups.values()) {
    if (aborted) break;
    const pool = group.concat(wilds);
    for (let sz = 3; sz <= Math.min(pool.length, 7) && !aborted; sz++) {
      for (const combo of getCombos(pool, sz)) {
        pushIfValid(MELD_TYPE.SEQUENCE, combo);
        if (aborted) break;
      }
    }
  }
  for (const group of rankGroups.values()) {
    if (aborted) break;
    const pool = group.concat(wilds);
    for (let sz = 3; sz <= Math.min(pool.length, 4) && !aborted; sz++) {
      for (const combo of getCombos(pool, sz)) {
        pushIfValid(MELD_TYPE.SET, combo);
        if (aborted) break;
      }
    }
  }

  if (validSubsets.length === 0) return [];

  let bestCombination = [];
  let maxCoveredCards = 0;
  let bestFreeScore = -1;

  const meldFreeScore = (m) => {
    if (m.cards.some(c => rules.isWildCard(c))) return 0;
    /* [v18] الآس سياقي: 10 في المتماثلة/نهاية المتتالية، 1 في بدايتها */
    return rules.meldPoints(m);
  };

  function search(idx, currentUsed, currentMelds) {
    searchNodes++;
    if (searchNodes > maxSearchNodes) { aborted = true; return; }
    if (budget && budgetExpired()) { aborted = true; return; }
    /* [R5-FREEZE-FIX] مهلة مسار بلا ميزانية: تشمل التعداد والمحرك والاحتياطي.
       لاحظ: إيقاف التعداد (aborted) لا يقتل هذا الاحتياطي — له فحصه الخاص. */
    if (exactDeadline && (searchNodes & 127) === 0 && Date.now() >= exactDeadline) { aborted = true; return; }
    const curFree = currentMelds.reduce((sm, m) => sm + meldFreeScore(m), 0);
    if (openingMode) {
      /* الافتتاح: النقاط الحرة أولاً ثم التغطية */
      if (curFree > bestFreeScore || (curFree === bestFreeScore && currentUsed.size > maxCoveredCards)) {
        bestFreeScore = curFree;
        maxCoveredCards = currentUsed.size;
        bestCombination = currentMelds.slice();
      }
    } else if (currentUsed.size > maxCoveredCards) {
      maxCoveredCards = currentUsed.size;
      bestCombination = currentMelds.slice();
    }
    for (let i = idx; i < validSubsets.length && !aborted; i++) {
      const sub = validSubsets[i];
      const hasOverlap = sub.cards.some(c => currentUsed.has(c.id));
      if (!hasOverlap) {
        const nextUsed = new Set(currentUsed);
        sub.cards.forEach(c => nextUsed.add(c.id));
        search(i + 1, nextUsed, [...currentMelds, new RamiMeld(sub.type, sub.cards.slice())]);
      }
    }
  }

  /* [FREEZE-CORE] محرك مُخزَّن مطابق تماماً لـ DFS أعلاه (نفس النتائج ونفس
     كسر التعادل: أول عقدة في pre-order تحقق أحسن قيمة) — بلا انفجار أسّي.
     bestInc(idx, used) = أحسن (نقاط حرة، تغطية) إضافي فوق العقدة الفارغة (0,0)،
     لأن قيمة التركيب جمعية على مجموعاته المختارة والاختيار المستقبلي مستقل
     عن السياق (مقارنة لكسية). firstHit يعيد بناء أول عقدة محقِّقة للقيمة
     بترتيب زيارة DFS نفسه (الفرع الأصغر فهرساً أولاً). */
  function exactMemoSearch() {
    const idxOf = new Map();
    for (let ci = 0; ci < cards.length; ci++) idxOf.set(cards[ci].id, ci);
    for (const s of validSubsets) {
      let mask = 0;
      for (const c of s.cards) mask |= (1 << idxOf.get(c.id));
      s.mask = mask;
      s.size = s.cards.length;
      s.free = meldFreeScore(new RamiMeld(s.type, s.cards.slice()));
    }
    const memo = new Map();
    let states = 0;
    let overflow = false;
    const better = (aF, aS, bF, bS) => openingMode
      ? (aF > bF || (aF === bF && aS > bS))
      : (aS > bS);
    function bestInc(idx, used) {
      /* [R5-FREEZE-FIX] مسار إيقاف سريع: بعد أول تجاوز (سقف حالات أو مهلة)
         يجب أن تعود كل الاستدعاءات التالية فوراً — بدون هذا كان فحص المهلة
         (كل 1024 حالة) يترك الحالات البينية تعيد العمل الكامل فينفجر الزمن. */
      if (overflow) return { f: 0, s: 0, take: -1 };
      const key = idx * 1048576 + used;
      const hit = memo.get(key);
      if (hit) return hit;
      if (++states > PARTITION_EXACT_STATES) { overflow = true; return { f: 0, s: 0, take: -1 }; }
      /* [R5-FREEZE-FIX] مهلة جدارية: تُفحص كل 1024 حالة (فحص كل حالة يكلف أكثر
         من البحث نفسه). التجاوز = نفس مسار overflow الموجود (احتياطي DFS محدود ومهيّل). */
      if (exactDeadline && (states & 1023) === 0 && Date.now() >= exactDeadline) { overflow = true; return { f: 0, s: 0, take: -1 }; }
      let bF = 0, bS = 0, bTake = -1;
      for (let i = idx; i < validSubsets.length; i++) {
        const sub = validSubsets[i];
        if ((used & sub.mask) !== 0) continue;
        const rest = bestInc(i + 1, used | sub.mask);
        const cF = sub.free + rest.f, cS = sub.size + rest.s;
        if (better(cF, cS, bF, bS)) { bF = cF; bS = cS; bTake = i; }
      }
      const out = { f: bF, s: bS, take: bTake };
      memo.set(key, out);
      return out;
    }
    function firstHit(idx, used, tF, tS) {
      if (tF === 0 && tS === 0) return [];
      for (let i = idx; i < validSubsets.length; i++) {
        const sub = validSubsets[i];
        if ((used & sub.mask) !== 0) continue;
        if (sub.free === tF && sub.size === tS) return [i];
        const rest = bestInc(i + 1, used | sub.mask);
        if (sub.free + rest.f === tF && sub.size + rest.s === tS) {
          return [i].concat(firstHit(i + 1, used | sub.mask, tF - sub.free, tS - sub.size));
        }
      }
      return [];
    }
    const top = bestInc(0, 0);
    if (overflow) return null;
    const chosen = firstHit(0, 0, top.f, top.s);
    return chosen.map(i => new RamiMeld(validSubsets[i].type, validSubsets[i].cards.slice()));
  }

  if (budget) {
    /* مسار الخبير: DFS القديم داخل الميزانية — بلا أي تغيير سلوكي */
    search(0, new Set(), []);
  } else {
    /* [R5-FREEZE-FIX] ضبط المهلة قبل المحرك المخزّن — تغطيه وتغطي احتياطيه */
    exactDeadline = Date.now() + PARTITION_EXACT_TIME_MS;
    /* مسار اللاعب: نتائج مطابقة حرفياً بلا حجب الخيط */
    const exact = exactMemoSearch();
    if (exact) {
      bestCombination = exact;
    } else {
      /* طوارئ حتمية (أيدي خارج كل القياسات أو تجاوز المهلة): DFS محدود */
      search(0, new Set(), []);
    }
    exactDeadline = 0;
  }
  if (!budget) {
    if (__ramiPartCache.size > 3000) __ramiPartCache.clear();
    __ramiPartCache.set(cacheKey, bestCombination.map(m => new RamiMeld(m.type, m.cards.slice())));
  }
  return bestCombination;
}

/* ═══════════════════════════════════════════════════════════════
   [EXPERT-AI] محرّك الخبير لرامي — قرارات أمثل بنسبة خطأ 0%:
   • السحب: لا يأخذ المرموق إلا إذا كان سيُنزَل في نفس الدور فعلاً
     (إنهاء فوري / إكمال افتتاح / إدراج في طاولة / إكمال مجموعة جديدة)
   • الإنزال: بعد الافتتاح يُنزّل كل مجموعة مكتمّلة في يده فوراً —
     أسرع طريق لتفريغ اليد والفوز، ويحمي من جزاء ورقة المرموق
   • الرمي: أسوأ ورقة حسابياً — لا يرمي جوكراً ولا ورقة داخل مجموعة
     حية ولا يُطعم خصماً مفتوحاً (خطر قانون الـ12) ويرمي الأعلى قيمة أولاً
   ═══════════════════════════════════════════════════════════════ */
const RamiExpertAI = {
  /* [AI-TIME-BOUND] القرار الخبير لا يملك حق حجب خيط الواجهة؛ إذا كانت
     اليد مليئة بنسخ متساوية يعيد partition أفضل نتيجة خلال هذه الميزانية. */
  PARTITION_BUDGET_MS: 4,

  /* محاكاة إنهاء الشوط بإضافة ورقة: كل اليد مجموعات + ورقة معزولة واحدة */
  simCanFinish(hand, extra, rules) {
    if (!extra) return false;
    const testHand = hand.concat([extra]);
    const melds = partitionSelectedCards(testHand, rules, undefined, this.PARTITION_BUDGET_MS);
    if (!melds || melds.length === 0) return false;
    const ids = new Set();
    for (const m of melds) for (const c of m.cards) ids.add(c.id);
    if (!ids.has(extra.id)) return false;            /* المرموق يجب أن يُنزّل ضمن المجموعات */
    const leftover = testHand.filter(c => !ids.has(c.id));
    if (leftover.length !== 1) return false;
    return rules.validateFinishStructure(melds, extra).valid;
  },

  /* هل تُكمل الورقة الإضافية مجموعة جديدة في اليد (ستُنزّل هذا الدور)؟ */
  completesNewMeld(hand, extra, rules) {
    if (!extra) return false;
    const melds = partitionSelectedCards(hand.concat([extra]), rules, undefined, this.PARTITION_BUDGET_MS);
    if (!melds) return false;
    for (const m of melds) if (m.cards.some(c => c.id === extra.id)) return true;
    return false;
  },

  /* هل تفيد ورقةٌ معروفة (مرموق/فوجوك) اليدَ فائدة مؤكدة؟ */
  _cardHelps(game, player, card, allowLayoffTake) {
    if (this.simCanFinish(player.hand, card, game.rules)) return true;
    if (!player.hasOpened) {
      /* [DRAW-CONSISTENT] بمحاكاة expertOpening الفعلية (تقسيم opening + حارس الورقتين) */
      const fake = Object.create(player);
      fake.hand = player.hand.concat([card]);
      fake.drawnDiscardCard = card;
      fake.hasOpened = false;
      return !!this.expertOpening(game, fake);
    }
    if (allowLayoffTake && player.hand.length >= 4 && game.doesCardFitAnyTableMeld(card)) return true;
    if (this.completesNewMeld(player.hand, card, game.rules)) return true;
    return false;
  },

  /* قرار السحب — allowLayoffTake: الإدراج المباشر في الطاولة (محلي فقط) */
  chooseDraw(game, player, allowLayoffTake) {
    const rm = game.roundManager;
    const isSample = (game.rules.mode !== 'talaj');

    /* [V19] السامبل: الفوجوك ورقة معروفة تُسحب في الدورة الأولى فقط —
       تُؤخذ إن أفادت (إنهاء/افتتاح/مجموعة)، وإلا ضاع الحق فيها بلا خسارة */
    if (isSample && rm.jokerIndicator && rm.isFirstTourCycle &&
        this._cardHelps(game, player, rm.jokerIndicator, allowLayoffTake)) {
      return 'draw_fojok';
    }

    if (rm.discardPile.length === 0) return 'draw_deck';
    const top = rm.discardPile[rm.discardPile.length - 1];

    if (!isSample) {
      /* موانع قانونية من سحب المرموق (طالاج) */
      const dealerBarred = (player.id === rm.dealerIndex && rm.dealerFirstCycle);
      if (dealerBarred || player.hand.length === 1 || player.meldCount() >= 13) return 'draw_deck';
      /* قانون الـ12: مع 12+ منزلة يجب أخذ الورقة المطابقة وإلا جزاء مؤكد */
      if (player.meldCount() >= 12 && game.doesCardFitAnyTableMeld(top)) return 'draw_discard';
    }

    /* [V19] السامبل: المرموق المسحوب «غير حر» في نفس الدور — سحبه لا يفيد إنهاء/افتتاح
       هذا الدور إلا في مجموعات الجوكر؛ لكنه حر بلا جزاء، فتُؤخذ الورقة إن أفادت اليد
       مستقبلاً (تكمل مجموعة تُنزل لاحقاً) */
    if (isSample) {
      if (this._cardHelps(game, player, top, allowLayoffTake)) return 'draw_discard';
      /* تكوين ثنائية قوية نحو مجموعة مستقبلية: أخذ حر بلا مخاطرة جزاء */
      let synergy = 0;
      for (const o of player.hand) {
        if (game.rules.isWildCard(o)) continue;
        if (o.rank === top.rank && RAMI_SUIT_COLOR[o.suit] !== undefined && o.suit !== top.suit) synergy++;
        else if (o.suit === top.suit && Math.abs(o.rank - top.rank) <= 2) synergy++;
      }
      return synergy >= 2 ? 'draw_discard' : 'draw_deck';
    }

    /* 1) إنهاء الشوط فوراً بهذه الورقة — [DRAW-CONSISTENT] للمفتوح فقط:
       غير المفتوح في طالاج لا يملك حركة إنهاء (بوابة اليد ≤7)، وإنهاؤه عبر
       الافتتاح الكامل يشترط صحة شروط الافتتاح — يُحسم في الفحص أدناه */
    if (player.hasOpened && this.simCanFinish(player.hand, top, game.rules)) {
      const testHand = player.hand.concat([top]);
      const hm = partitionSelectedCards(testHand, game.rules, undefined, this.PARTITION_BUDGET_MS);
      if (hm && hm.length) {
        player._drawPlanIds = hm.flatMap(m => m.cards.map(c => c.id));
      }
      return 'draw_discard';
    }
    /* 2) إكمال شروط الافتتاح — [DRAW-CONSISTENT] القرار بمحاكاة expertOpening
       الفعلية (نفس التقسيم ونفس حارس الورقتين): سحب المرموق في طالاج يلزم
       بالافتتاح وإلا جزاء 71 — فلا نسحبه إلا إذا كان الافتتاح المنفَّذ مضموناً */
    if (!player.hasOpened) {
      const fake = Object.create(player);
      fake.hand = player.hand.concat([top]);
      fake.drawnDiscardCard = top;
      fake.hasOpened = false;
      /* [PLAN-EXACT] إن كانت الورقة هي «لا تور» فالتنفيذ سيتحقق بشروطها */
      fake.tookLaTour = !!(rm.laTourCard && top.id === rm.laTourCard.id);
      const simOpen = this.expertOpening(game, fake);
      if (simOpen) {
        /* [PLAN-EXACT] احفظ الخطة الحرفية — تنفذ بلا إعادة تقسيم */
        player._openPlanMove = { type: 'open', playerId: player.id, cardIds: simOpen.cardIds, meldGroups: simOpen.meldGroups };
        return 'draw_discard';
      }
      return 'draw_deck';
    }
    /* 3) مفتوح: تصلح للإدراج الفوري في مجموعات الطاولة (بيد ≥ 4 فقط —
       أقل من ذلك لا يفرّغ اليد بل يقود للحصار)
       [DRAW-CONSISTENT] بنفس صرامة التنفيذ: canLayOff (يحترم حماية
       المجموعة الحرة _justOpened) لا doesCardFitAnyTableMeld المتساهلة.
       [LAYOUT-FIX] الإدراج في طاولة موجودة يجب أن يترك اليد ≥ 3 بعد
       السحب: يد 3 + مسحوبة = 4 أوراق، إدراج واحدة يبقي 3 قانونياً،
       لكن إن كانت اليد كلها (مع المسحوبة) مجموعةً واحدة كاملة فالإدراج
       يقود لحصار/جزاء — يُرفض إلا إذا كانت المسحوبة هي المدرجة (إلزام
       طالاجي يُحل بأولوية الإدراج المباشر للمسحوبة في _runBotTurn) */
    if (allowLayoffTake && player.hand.length >= 3) {
      let fits = false;
      for (const meld of rm.tableMelds) { if (this.canLayOff(game.rules, meld, top, top)) { fits = true; break; } }
      if (fits) {
        /* [TRAP-GUARD] يد صغيرة: كل اليد+المسحوبة مجموعة واحدة كاملة →
           الإدراج يستنزف اليد، والباقي لا يرمى بلا جزاء DISCARD_DRAW.
           المسموح فقط: المسحوبة نفسها تُدرج (إلزام طالاج، ولها أولوية
           داخل _runBotTurn قبل الرمي) — أو اليد ≥ 4 (إدراج آمن دائماً) */
        const testHand = player.hand.concat([top]);
        const hm = partitionSelectedCards(testHand, game.rules, undefined, this.PARTITION_BUDGET_MS);
        const ids = new Set(hm && hm.length ? hm.flatMap(m => m.cards.map(c => c.id)) : []);
        const leftovers = testHand.length - ids.size;
        const fullPartition = (ids.size === testHand.length);
        if (!fullPartition || player.hand.length >= 4) return 'draw_discard';
        /* ورقة التضحية موجودة (leftovers ≥ 1) والإدراج للمسحوبة نفسها:
           خطة الإنزال المحفوظة تشمل المجموعة كاملة فتُنزّل بأمان بلا جزاء */
        if (leftovers >= 1 && ids.has(top.id)) {
          player._drawPlanIds = Array.from(ids);
          return 'draw_discard';
        }
        return 'draw_deck';
      }
    }
    /* 4) مفتوح: تُكمل مجموعة جديدة تُنزَّل فعلاً هذا الدور —
       [DRAW-CONSISTENT] بنفس حرّاس التنفيذ (dump>=3 وليس leftovers==2):
       وإلا سحب المرموق يلزم بالإنزال ويرتدّ جزاء 71 عند التأجيل.
       [TRAP-GUARD] يد كاملة القسمة (بقايا 0) بعد الضم: الإنزال يترك
       0 ورقة (لا ورقة إنهاء) — فيفشل الإنزال ويرتدّ جزاء DISCARD_DRAW.
       يُقبل فقط إذا أمكن اقتطاع ورقة من مجموعة 4+ (تسقط لـ3 وتبقى
       صالحة) فتبقى ورقة الإنهاء = إنزال 3+ ورمي واحدة = فوز قانوني */
    if (this.completesNewMeld(player.hand, top, game.rules)) {
      const testHand = player.hand.concat([top]);
      const hm = partitionSelectedCards(testHand, game.rules, undefined, this.PARTITION_BUDGET_MS);
      if (hm && hm.length) {
        const ids = new Set(hm.flatMap(m => m.cards.map(c => c.id)));
        const leftovers = testHand.length - ids.size;
        if (ids.has(top.id) && ids.size >= 3 && leftovers !== 2) {
          if (leftovers === 0) {
            /* بقايا 0: ابحث مجموعة 4+ قابلة للاقتطاع (كما في _shrinkForFinish)؛
               إن وُجدت تُحفظ الخطة مُقلَّصة (المجموعة-1) فتتبقى ورقة الإنهاء —
               إنزال 3+ ورمي واحدة = فوز قانوني بلا جزاء */
            let shrinkId = null;
            for (const m of hm) {
              if (!m.cards || m.cards.length < 4) continue;
              let candidates;
              if (m.type === MELD_TYPE.SET) candidates = m.cards.slice();
              else {
                const ordered = ramiOrderSequenceCards(m.cards.slice(), c => game.rules.isWildCard(c));
                candidates = [ordered[0], ordered[ordered.length - 1]];
              }
              for (const drop of candidates) {
                if (!drop) continue;
                const kept = m.cards.filter(c => c.id !== drop.id);
                const okMeld = (m.type === MELD_TYPE.SET) ? game.rules.isValidSet(kept, true) : game.rules.isValidSequence(kept, true);
                if (okMeld) { shrinkId = drop.id; break; }
              }
              if (shrinkId != null) break;
            }
            if (shrinkId == null) return 'draw_deck';
            /* [DRAW-PLAN] الخطة المقلَّصة: المجموعات كاملة عدا ورقة الاقتطاع */
            player._drawPlanIds = Array.from(ids).filter(id => id !== shrinkId);
            return 'draw_discard';
          }
          /* [DRAW-PLAN] احفظ خطة الإنزال الملزمة — تنفذ حرفياً بعد السحب */
          player._drawPlanIds = Array.from(ids);
          return 'draw_discard';
        }
      }
      return 'draw_deck';
    }
    return 'draw_deck';
  },

  /* درجة إبقاء الورقة في اليد — الأدنى هي المرشّحة للرمي */
  keepScore(game, player, card, inMeldIds) {
    const rules = game.rules, rm = game.roundManager;
    if (rules.isWildCard(card)) {
      /* الجوكر لا يُرمى أبداً — إلا فائضاً ثالثاً فأكثر في نهاية ميتة.
         [Anti-Stall] جولة ماراثونية ويد شبه فارغة محشوة جوكرات = جمود أبدي
         (لا شيء يُرمى ولا شيء يكتمل) — يُسمح برمي الجوكر لكسر الجمود */
      const jc = player.hand.filter(c => rules.isWildCard(c)).length;
      const trn = (rm && rm.turnCount) || 0;
      if (trn > game.players.length * 90 && player.hand.length <= 3 && jc >= player.hand.length - 1) return 2500;
      return jc <= 2 ? 1e9 : 2500;
    }
    let s = 0;
    if (!player.hasOpened) {
      /* قبل الافتتاح: المهمة جمع 71 نقطة حرة + متتالية ومتماثلة نقطيتين —
         تُحفظ الأوراق العالية القيمة والثنائيات الواعدة، وتُرمى المنخفضة المعزولة */
      s += card.baseValue * 10;
      if (inMeldIds.has(card.id)) s += 1200 + card.baseValue * 20;  /* داخل مجموعة حية */
      for (const o of player.hand) {
        if (o.id === card.id) continue;
        if (rules.isWildCard(o)) { s += 200; continue; }
        if (o.rank === card.rank) s += 30 + o.baseValue * 4;        /* ثنائية عالية أفضل */
        else if (o.suit === card.suit) {
          const d = Math.abs(o.rank - card.rank);
          if (d === 1) s += 35 + o.baseValue * 3.5;                 /* جوار متتالية */
          else if (d === 2) s += 14 + o.baseValue * 1.5;
        }
      }
    } else {
      /* بعد الافتتاح: تفريغ اليد بأمان — رمي الأعلى قيمة أولاً لتقليل الحصيلة */
      if (inMeldIds.has(card.id)) s += 5000 + card.baseValue * 10;  /* داخل مجموعة حية */
      for (const o of player.hand) {
        if (o.id === card.id) continue;
        if (rules.isWildCard(o)) { s += 30; continue; }
        if (o.rank === card.rank) s += 60;
        else if (o.suit === card.suit) {
          const d = Math.abs(o.rank - card.rank);
          if (d === 1) s += 70; else if (d === 2) s += 35;
        }
      }
      s -= card.baseValue * 8;
      if (rm.tableMelds.length > 0 && game.doesCardFitAnyTableMeld(card)) s += 400;
    }
    /* [AI-FIX] خطر الإطعام: خصم مفتوح سيلتقطها وينهي بها — درجة الإبقاء تعلو
       (كانت الإشارة معكوسة: −8000 جعلت الورقة الخطرة أول مرشحة للرمي!)
       الوزن 2600 < قداسة مجموعة اليد (5000): لا يكسر البوت مجموعاته لتفادي الإطعام،
       لكنه يفضّل رمي أي ورقة حرة أخرى على إطعام خصم مفتوح */
    const openOpps = game.players.filter(p => p.id !== player.id && p.hasOpened);
    if (!inMeldIds.has(card.id) && openOpps.length > 0 && game.doesCardFitAnyTableMeld(card)) {
      /* التدرج حسب الخطر الفعلي: خصم مفتوح بيد صغيرة قد ينهي بهذه الورقة فوراً.
         [Anti-Stall] الحذر يتلاشى مع طول الجولة (بعد ~40 دورة كاملة) —
         حذر مطلق متبادل بين خبيرين = جولة لا تنتهي أبداً */
      const minHand = Math.min.apply(null, openOpps.map(o => o.hand.length));
      const turns = (rm && rm.turnCount) || 0;
      const decay = Math.max(0, 1 - Math.max(0, turns - game.players.length * 40) / (game.players.length * 40));
      s += (minHand <= 3 ? 4000 : (minHand <= 6 ? 2200 : 700)) * decay;
      /* [Anti-Stall] جولة ماراثونية (حذر متبادل مطلق): كسر الجمود بترجيح
         رمي المطابقة — أحد الطرفين سينهي وتُحسم الجولة بدل دوران أبدي */
      if (turns > game.players.length * 90) s -= 3000;
    }
    if (openOpps.some(o => o.meldCount() >= 12) && game.doesCardFitAnyTableMeld(card)) s += 1e8; /* قانون الـ12 */
    return s;
  },

  /* الافتتاح الخبير: افتتاح كامل التقسيم، إلا إذا ترك ورقتين فقط
     (حصار دائم بعد رمي التخلص) — حينها يُسقط أصغر مجموعة تبقي الشروط
     مستوفاة وبقايا >= 3، أو يؤجّل الافتتاح دوراً آخر */
  /* كل المتتاليات النقية المرشّحة (3-5 نفس الرمز بلا جوكر) */
  _pureSequences(hand, rules) {
    const res = [];
    const bySuit = new Map();
    for (const c of hand) {
      if (rules.isWildCard(c)) continue;
      if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
      bySuit.get(c.suit).push(c);
    }
    for (const arr of bySuit.values()) {
      const uniq = [];
      const seen = new Set();
      for (const c of arr.slice().sort((a, b) => a.rank - b.rank)) {
        const k = c.rank;                        /* نسخة واحدة من كل رتبة تكفي للمرشّح */
        if (!seen.has(k)) { seen.add(k); uniq.push(c); }
      }
      for (let i = 0; i < uniq.length; i++) {
        const run = [uniq[i]];
        for (let j = i + 1; j < uniq.length; j++) {
          if (uniq[j].rank === run[run.length - 1].rank + 1) {
            run.push(uniq[j]);
            if (run.length >= 3 && run.length <= 5) res.push(run.slice());
          } else break;
        }
      }
    }
    return res;
  },

  /* كل المتماثلات النقية المرشّحة (3-4 برموز مختلفة بلا جوكر) */
  _pureSets(hand, rules) {
    const res = [];
    const byRank = new Map();
    for (const c of hand) {
      if (rules.isWildCard(c)) continue;
      if (!byRank.has(c.rank)) byRank.set(c.rank, []);
      byRank.get(c.rank).push(c);
    }
    for (const arr of byRank.values()) {
      const suits = new Map();
      for (const c of arr) if (!suits.has(c.suit)) suits.set(c.suit, c);
      const uniq = [...suits.values()];
      if (uniq.length >= 3) {
        res.push(uniq.slice(0, 4));
      }
    }
    return res;
  },

  expertOpening(game, player, decisionDeadline) {
    const rm = game.roundManager;
    if (player.id === rm.dealerIndex && rm.dealerFirstCycle) return null;
    const rules = game.rules;
    const deadline = decisionDeadline || (Date.now() + 45);
    const partBudget = () => Math.max(1, Math.min(this.PARTITION_BUDGET_MS, deadline - Date.now()));
    let melds = partitionSelectedCards(player.hand, rules, 'opening', partBudget());
    if (!melds || melds.length === 0) return null;
    /* [0% خطأ] لا محاولة افتتاح إلا إذا كانت الشروط مستوفاة فعلاً.
       تقسيم التغطية القصوى قد يُفقد المتتالية/المتماثلة النقية المطلوبة —
       لذا نبحث عن تقسيم بديل يضمن وجودهما مع أعلى مجموع */
    let chk = rules.validateOpening(melds, player.drawnDiscardCard, rm.jokerIndicator, rm.highestOpeningScore || 0, !!player.tookLaTour);
    if (!chk.valid) {
      let bestMelds = null, bestScore = -1;
      const tryFix = (anchor) => {
        const anchorIds = new Set(anchor.map(c => c.id));
        const restCards = player.hand.filter(c => !anchorIds.has(c.id));
        const rest = partitionSelectedCards(restCards, rules, 'opening', partBudget());
        const cand = [new RamiMeld(
          (anchor[1] && anchor[0] && anchor[0].suit !== undefined && new Set(anchor.map(c => c.suit)).size === 1)
            ? MELD_TYPE.SEQUENCE : MELD_TYPE.SET, anchor.slice())].concat(rest || []);
        const c2 = rules.validateOpening(cand, player.drawnDiscardCard, rm.jokerIndicator, rm.highestOpeningScore || 0, !!player.tookLaTour);
        if (c2.valid && c2.score > bestScore) { bestScore = c2.score; bestMelds = cand; }
      };
      for (const seq of this._pureSequences(player.hand, rules)) tryFix(seq);
      for (const set of this._pureSets(player.hand, rules)) tryFix(set);
      if (!bestMelds) return null;
      melds = bestMelds;
      chk = { valid: true };
    }
    const total = player.hand.length;
    const covered = melds.reduce((sm, m) => sm + m.cards.length, 0);
    let chosen = melds;
    /* [R15-FIX] بقايا 0 = يد كاملة القسمة: الإنهاء القانوني هو اقتطاع ورقة
       من مجموعة 4+ (تبقى صالحة) فتصير 14 منزلة + ورقة إنهاء تُرمى = فوز فوري */
    if (total - covered === 0) {
      const shrink = this._shrinkForFinish(melds, rules, player, rm);
      if (shrink) return shrink;
    }
    /* بقايا 2 = حصار دائم؛ بقايا 0 بلا مجموعة قابلة للتقليص — كلاهما
       يُحل بإسقاط أصغر مجموعة أو تأجيل الافتتاح */
    if (total - covered === 2 || total - covered === 0) {
      const bySize = melds.slice().sort((a, b) => a.cards.length - b.cards.length);
      let ok = false;
      for (let i = 0; i < bySize.length && !ok; i++) {
        const keep = bySize.slice(0, i).concat(bySize.slice(i + 1));
        if (keep.length === 0) break;
        const keepCards = keep.flatMap(m => m.cards.map(c => c.id));
        if (total - keepCards.length >= 3) {
          /* تحقق على إعادة تقسيم الأوراق نفسها — نفس ما سيراه المحرك */
          const rePart = partitionSelectedCards(
            keepCards.map(id => player.hand.find(c => c.id === id)), game.rules, undefined, partBudget());
          const chk = game.rules.validateOpening(rePart, player.drawnDiscardCard, rm.jokerIndicator, rm.highestOpeningScore || 0, !!player.tookLaTour);
          if (chk.valid) { chosen = rePart.length ? rePart : keep; ok = true; }
        }
      }
      if (!ok) return null; /* تأجيل الافتتاح */
    }
    return { type: 'open', playerId: player.id, cardIds: chosen.flatMap(m => m.cards.map(c => c.id)), meldGroups: chosen.map(m => m.cards.map(c => c.id)) };
  },

  /* [R15-FIX] يد كاملة القسمة: جرّب اقتطاع ورقة واحدة من مجموعة 4+ بحيث تبقى
     المجموعات صالحة وشروط الافتتاح مستوفاة — النتيجة افتتاح 14 ورقة + ورقة إنهاء */
  _shrinkForFinish(melds, rules, player, rm) {
    for (let mi = 0; mi < melds.length; mi++) {
      const m = melds[mi];
      if (!m.cards || m.cards.length < 4) continue;
      /* مرشّحو الاقتطاع: أي ورقة في المتماثلة؛ طرفا المتتالية (تبقى متصلة) */
      let candidates;
      if (m.type === MELD_TYPE.SET) candidates = m.cards.slice();
      else {
        const ordered = ramiOrderSequenceCards(m.cards.slice(), c => rules.isWildCard(c));
        candidates = [ordered[0], ordered[ordered.length - 1]];
      }
      for (const drop of candidates) {
        if (!drop) continue;
        const kept = m.cards.filter(c => c.id !== drop.id);
        const okMeld = (m.type === MELD_TYPE.SET) ? rules.isValidSet(kept, true) : rules.isValidSequence(kept, true);
        if (!okMeld) continue;
        const cand = melds.map((x, xi) => xi === mi ? new RamiMeld(m.type, (m.type === MELD_TYPE.SEQUENCE) ? ramiOrderSequenceCards(kept.slice(), c => rules.isWildCard(c)) : kept.slice()) : x);
        const chk = rules.validateOpening(cand, player.drawnDiscardCard, rm.jokerIndicator, rm.highestOpeningScore || 0, !!player.tookLaTour);
        if (chk.valid) {
          return { type: 'open', playerId: player.id, cardIds: cand.flatMap(x => x.cards.map(c => c.id)), meldGroups: cand.map(x => x.cards.map(c => c.id)) };
        }
      }
    }
    return null;
  },

  /* النقاط الحرة لمجموعات التقسيم (بدون جوكر — كما في عتبة الافتتاح)
     [v18] الآس سياقي عبر rules.meldPoints */
  _freeScore(melds, rules) {
    /* [Ace] بالقيمة السياقية: A,2,3…=1 و…Q,K,A=10 (نفس منطق عتبة الافتتاح) */
    let f = 0;
    if (melds) for (const m of melds) {
      if (m.cards.some(c => rules.isWildCard(c))) continue;
      f += rules.meldPoints(m);
    }
    return f;
  },

  /* رمي مرحلة ما قبل الافتتاح: تحليل حديّ — أي ورقة إزالتها أخسر
     للمسار نحو 71 نقطة حرة؟ + كيمياء الثنائيات المستقبلية */
  _chooseOpeningDiscard(game, player, banned, decisionDeadline) {
    const rules = game.rules, hand = player.hand;
    const partBudget = () => decisionDeadline
      ? Math.max(1, Math.min(this.PARTITION_BUDGET_MS, decisionDeadline - Date.now()))
      : this.PARTITION_BUDGET_MS;
    const melds = partitionSelectedCards(hand, rules, 'opening', partBudget());
    const F0 = this._freeScore(melds, rules);
    const C0 = melds ? melds.reduce((sm, m) => sm + m.cards.length, 0) : 0;
    /* [AI-FIX] خطر الإطعام قبل الافتتاح أيضاً: لا ترمِ ورقة تدخل مجموعة ظاهرة لخصم مفتوح */
    const openOpps = game.players.filter(p => p.id !== player.id && p.hasOpened);
    const feedRisk = (c) => {
      if (!openOpps.length || !game.doesCardFitAnyTableMeld(c)) return 0;
      if (openOpps.some(o => o.meldCount() >= 12)) return 1e8;
      const minHand = Math.min.apply(null, openOpps.map(o => o.hand.length));
      const turns = (game.roundManager && game.roundManager.turnCount) || 0;
      const decay = Math.max(0, 1 - Math.max(0, turns - game.players.length * 40) / (game.players.length * 40));
      return (minHand <= 3 ? 4000 : (minHand <= 6 ? 2200 : 700)) * decay;
    };
    /* الجوكرات قبل الافتتاح: قيّمة للإكمال لكنها لا تساهم في الـ71 الحرة */
    const jokerCount = hand.filter(c => rules.isWildCard(c)).length;
    let best = null, bestScore = Infinity;
    for (const c of hand) {
      if (decisionDeadline && Date.now() >= decisionDeadline) break;
      if (banned.has(c.id)) continue;
      let keep;
      if (rules.isWildCard(c)) {
        keep = (jokerCount <= 2) ? 1e6 : 60000;   /* الفائض أقل قداسة */
      } else {
        const sub = hand.filter(x => x.id !== c.id);
        const pm = partitionSelectedCards(sub, rules, 'opening', partBudget());
        const F = this._freeScore(pm, rules);
        const C = pm ? pm.reduce((sm, m) => sm + m.cards.length, 0) : 0;
        const loss = (F0 - F) * 6 + (C0 - C) * 30;         /* ما نخسره بإزالتها */
        /* القيمة هي رصيد الافتتاح الحقيقي: الأوراق العالية تبني الـ71 */
        let syn = c.baseValue * 6;
        let dup = false;
        for (const o of hand) {
          if (o.id === c.id) continue;
          if (rules.isWildCard(o)) { syn += 25; continue; }
          if (o.rank === c.rank && o.suit === c.suit) { dup = true; continue; }  /* المكررة لا تشارك المجموعة */
          if (o.rank === c.rank) syn += 8 + o.baseValue;          /* ثنائية برموز مختلفة */
          else if (o.suit === c.suit) {
            const d = Math.abs(o.rank - c.rank);
            if (d === 1) syn += 14 + o.baseValue * 1.2;           /* جوار متتالية */
            else if (d === 2) syn += 5;
          }
        }
        if (dup) syn -= 60;                                 /* النسخة المكررة شبه ميتة */
        keep = loss + syn + feedRisk(c);                    /* [AI-FIX] */
      }
      /* الأدنى قيمةً في الإبقاء هي المرشّحة للرمي */
      if (keep < bestScore) { bestScore = keep; best = c; }
    }
    if (best) return best.id;
    /* احتياط: آخر ورقة غير محظورة (تفادي جزاء رمي المسحوبة نفس الدور) */
    for (let i = hand.length - 1; i >= 0; i--) if (!banned.has(hand[i].id)) return hand[i].id;
    return hand[hand.length - 1].id;
  },

  /* [V19.2] هل يجوز إدراج هذه الورقة في هذه المجموعة المنزلة؟
     «الحرة تبقى حرة في دور الافتتاح فقط»: الجوكر/الورقة البرية وورقة المرموق
     المسحوبة نفس الدور لا تُدرج في مجموعة حرة أُنزلت هذا الدور —
     وفي الأدوار الموالية يجوز إدراجهما في مجموعات الافتتاح الحرة */
  canLayOff(rules, meld, card, drawnCard) {
    if (!meld || !meld.cards || !card) return false;
    if (meld._justOpened && !meld.cards.some(c => rules.isWildCard(c))) {
      if (rules.isWildCard(card)) return false;
      if (drawnCard && card.id === drawnCard.id) return false;
    }
    if (typeof meld.findJokerSwapIndex === 'function' && meld.findJokerSwapIndex(card, rules) !== -1) return true;
    const temp = meld.cards.concat([card]);
    if (meld.type === MELD_TYPE.SET) return rules.isValidSet(temp, true);
    if (meld.type === MELD_TYPE.SEQUENCE) return rules.isValidSequence(temp, true);
    return false;
  },

  /* اختيار ورقة الرمي المثلى */
  chooseDiscard(game, player) {
    const hand = player.hand;
    if (!hand || hand.length === 0) return null;
    /* [V19.2] رمي المرموق/الفوجوك المسحوبة نفس الدور = جزاء 51 — الخبير لا يخطئها أبداً */
    const banned = new Set();
    if (player.drawnDiscardCard) banned.add(player.drawnDiscardCard.id);
    if (player.drawnLaTourCard) banned.add(player.drawnLaTourCard.id);
    if (player.drawnFojokCard) banned.add(player.drawnFojokCard.id);
    if (!player.hasOpened) {
      /* سقف إجمالي واحد للقرار، لا ميزانية منفصلة لكل ورقة تعيد التجمّد. */
      return this._chooseOpeningDiscard(game, player, banned, Date.now() + 45);
    }
    const melds = partitionSelectedCards(hand, game.rules, undefined, this.PARTITION_BUDGET_MS);
    const inMeldIds = new Set();
    if (melds) for (const m of melds) for (const c of m.cards) inMeldIds.add(c.id);
    let best = null, bestScore = Infinity;
    for (const c of hand) {
      if (banned.has(c.id)) continue;
      const sc = this.keepScore(game, player, c, inMeldIds);
      if (sc < bestScore) { bestScore = sc; best = c; }
    }
    if (best) return best.id;
    /* احتياط: آخر ورقة غير محظورة (تفادي جزاء رمي المسحوبة نفس الدور) */
    for (let i = hand.length - 1; i >= 0; i--) if (!banned.has(hand[i].id)) return hand[i].id;
    return hand[hand.length - 1].id;
  },

  /* ═══ [DECIDER] قرار الدور الكامل الخفيف — تسلسل الخبير القياسي ═══
     البوت (أو أي مستدعٍ خارجي مثل السائق المتزامن في الاختبارات) يستدعي
     decideMove فيحصل على حركة واحدة جاهزة للتنفيذ عبر executeMove،
     بنفس ترتيب _runBotTurn: السحب ← الافتتاح/الإنزال ← الإدراج ← الإنهاء ← الرمي.
     يعيد {move, done} — done=true انتهى الدور (لا حركات أخرى)؛ أو null عند التعذر.
     لا يغيّر أي حالة بنفسه (قرار فقط) باستثناء خطط السحب المحفوظة
     (_openPlanMove/_drawPlanIds) وهي نفس آلية _runBotTurn الموجودة. */
  decideMove(game, player, allowLayoffTake) {
    if (!game || !player) return null;
    const rm = game.roundManager;
    if (!rm || game.gamePhase !== 'PLAYING') return null;

    /* مرحلة السحب */
    if (rm.turnPhase === 'WAITING_DRAW') {
      if (player.hand.length < game.rules.playHandSize) {
        const drawType = this.chooseDraw(game, player, allowLayoffTake !== false);
        return { move: { type: drawType, playerId: player.id }, done: false };
      }
      /* يد ممتلئة: تخطَّ للرمي مباشرة */
    }

    /* الافتتاح (لمن لم يفتتح): الخطة المحفوظة أولاً ثم expertOpening */
    if (!player.hasOpened) {
      if (player._openPlanMove) {
        const pm = player._openPlanMove;
        player._openPlanMove = null;
        if (pm.cardIds.every(id => player.hand.some(c => c.id === id))) {
          return { move: pm, done: false };
        }
      }
      const open = this.expertOpening(game, player);
      if (open) return { move: open, done: false };
    }

    /* إنزال المجموعات المكتمّلة بعد الافتتاح (بخطة السحب إن وجدت) */
    if (player.hasOpened && rm.turnPhase !== 'WAITING_DRAW') {
      if (player._drawPlanIds && player._drawPlanIds.length) {
        const planIds = player._drawPlanIds.filter(id => player.hand.some(c => c.id === id));
        player._drawPlanIds = null;
        if (planIds.length >= 3) {
          return { move: { type: 'open', playerId: player.id, cardIds: planIds }, done: false };
        }
      }
      const handMelds = partitionSelectedCards(player.hand.slice(), game.rules, undefined, this.PARTITION_BUDGET_MS);
      if (handMelds && handMelds.length > 0) {
        let dumpIds = handMelds.flatMap(m => m.cards.map(c => c.id));
        /* [R15-FIX] يد كاملة القسمة: اقتطاع ورقة من مجموعة 4+ يترك ورقة الإنهاء */
        if (player.hand.length - dumpIds.length === 0) {
          let dropId = null;
          for (const m of handMelds) {
            if (m.cards.length < 4) continue;
            if (m.type === MELD_TYPE.SET) { dropId = m.cards[m.cards.length - 1].id; break; }
            const ordSeq = ramiOrderSequenceCards(m.cards.slice(), c => game.rules.isWildCard(c));
            const keptSeq = ordSeq.slice(0, -1);
            if (game.rules.isValidSequence(keptSeq, true)) { dropId = ordSeq[ordSeq.length - 1].id; break; }
            const keptSeq2 = ordSeq.slice(1);
            if (game.rules.isValidSequence(keptSeq2, true)) { dropId = ordSeq[0].id; break; }
          }
          if (dropId != null) dumpIds = dumpIds.filter(id => id !== dropId);
        }
        const leftovers = player.hand.length - dumpIds.length;
        if (dumpIds.length >= 3 && (leftovers === 1 || leftovers >= 3)) {
          return { move: { type: 'open', playerId: player.id, cardIds: dumpIds }, done: false };
        }
      }
    }

    /* الإدراج في الطاولة (layoff عبر canLayOff) — أولوية المسحوبة المطابقة */
    if (player.hasOpened && rm.tableMelds.length > 0) {
      const drawnCard = player.drawnDiscardCard || player.drawnLaTourCard;
      const fitsMeld = (card) => {
        for (const meld of rm.tableMelds) {
          if (this.canLayOff(game.rules, meld, card, drawnCard)) return meld;
        }
        return null;
      };
      if (drawnCard) {
        const meld = fitsMeld(drawnCard);
        if (meld) {
          return { move: { type: 'layoff', playerId: player.id, cardId: drawnCard.id, meld: meld }, done: false };
        }
      }
      for (const card of player.hand) {
        if (player.hand.length <= 3) break;
        const meld = fitsMeld(card);
        if (meld) {
          return { move: { type: 'layoff', playerId: player.id, cardId: card.id, meld: meld }, done: false };
        }
      }
      /* إنقاذ من 3: ورقتان تدخلان الطاولة → إدراجهما يترك ورقة الإنهاء = فوز */
      if (player.hand.length === 3) {
        const fitting = player.hand.filter(c => fitsMeld(c));
        if (fitting.length >= 2) {
          return { move: { type: 'layoff', playerId: player.id, cardId: fitting[0].id, meld: fitsMeld(fitting[0]) }, done: false };
        }
      }
      /* إنقاذ من ورقتين: إدراج إحداهما ثم رمي الأخيرة = فوز */
      if (player.hand.length === 2) {
        for (let ci = 0; ci < 2; ci++) {
          const card = player.hand[ci];
          if (!card) break;
          const meld = fitsMeld(card);
          if (meld) {
            return { move: { type: 'layoff', playerId: player.id, cardId: card.id, meld: meld }, done: false };
          }
        }
      }
    }

    /* الإنهاء إن أمكن (السامبل يسمح من اليد الكاملة) */
    if ((player.hasOpened || game.rules.mode !== 'talaj') && game.canFinish(player)) {
      return { move: { type: 'finish', playerId: player.id }, done: true };
    }

    /* الرمي الخبير (أو الاحتياطي القانوني عند تعذّره) */
    const discardMoves = game.getLegalMoves(player.id).filter(m => m.type === 'discard');
    if (discardMoves.length > 0) {
      const expertId = this.chooseDiscard(game, player);
      const discardMove = discardMoves.find(m => m.cardId === expertId) || discardMoves[0];
      return { move: discardMove, done: true };
    }
    return null;
  }
};
if (typeof window !== 'undefined') window.RamiExpertAI = RamiExpertAI;

/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Rami Engine (Multiplayer Rami/Talaj Card Game)
   محرك رامي — لعبة أوراق متعددة اللاعين (Talaj/Simple)
   ═══════════════════════════════════════════ */
"use strict";

/* ── بذرة عشوائية حتمية (mulberry32) للمزامنة والاختبار ── */
function mulberry32(a) {
  a |= 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── بطاريق Rami Core ── */
/* Ranks: 1–10, J, Q, K */
const RAMI_RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const RAMI_RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/* Suits: قلب، مربع، سيف، عنب (Moroccan style) */
const RAMI_SUITS = ['heart', 'diamond', 'sword', 'grape'];
const RAMI_SUIT_GLYPH = { heart: '♥', diamond: '♦', sword: '♠', grape: '♣', club: '♣' };
const RAMI_SUIT_COLOR = { heart: 'red', diamond: 'red', sword: 'black', grape: 'black' };
/* ── تعيين أسماء ملفات الأصول (تطابق assets/games/rami/*.webp) ── */
const RAMI_SUIT_ASSET = { heart: 'hearts', diamond: 'diamonds', sword: 'spades', grape: 'clubs' };
/* Maps internal suit keys to asset file names in assets/games/rami/ */

/* CardType */
const CARD_TYPE = { NORMAL: 0, JOKER: 1 };

/* ── صنف الورقة ── */
class RamiCard {
  constructor(id, rank, suit, type) {
    this.id = id;
    this.rank = rank;           // 1-13 (1=Ace, 11=J, 12=Q, 13=K)
    this.suit = suit;           // 'heart'|'diamond'|'sword'|'grape'
    this.type = type || CARD_TYPE.NORMAL;
    this.isJoker = (type === CARD_TYPE.JOKER);
  }

  get baseValue() {
    if (this.isJoker) return 10;
    if (this.rank === 1) return 10; // الآس A = 10 نقاط في حساب الافتتاح والرامي
    return this.rank >= 10 ? 10 : this.rank;
  }

  get rankName() {
    return RAMI_RANK_NAMES[this.rank - 1];
  }

  get suitGlyph() {
    return RAMI_SUIT_GLYPH[this.suit];
  }

  get colorClass() {
    return RAMI_SUIT_COLOR[this.suit];
  }

  get displayName() {
    return this.isJoker ? 'جوكر 🃏' : this.rankName + ' ' + (RAMI_SUIT_GLYPH[this.suit] || '♣');
  }

  clone() {
    return new RamiCard(this.id, this.rank, this.suit, this.type);
  }
}

/* ── مصنع المجموعة ── */
class RamiDeck {
  constructor(rules) {
    this.rules = rules;
    this.cards = [];
    this.build();
  }

  build() {
    this.cards = [];
    let id = 1;
    for (const rank of RAMI_RANKS) {
      for (const suit of RAMI_SUITS) {
        for (let copy = 0; copy < 2; copy++) {
          this.cards.push(new RamiCard(id++, rank, suit, CARD_TYPE.NORMAL));
        }
      }
    }
    if (this.rules.hasPhysicalJokers) {
      for (let i = 0; i < 4; i++) {
        this.cards.push(new RamiCard(id++, 1, 'heart', CARD_TYPE.JOKER));
      }
    }
  }

  shuffle(rng) {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = rng.next(i + 1);
      const t = this.cards[i];
      this.cards[i] = this.cards[j];
      this.cards[j] = t;
    }
  }

}

/* ── مزوّد عشوائية قابل للتحكم ── */
class DeterministicRng {
  constructor(seed) {
    this._fn = mulberry32(seed >>> 0);
  }
  next(max) {
    return Math.floor(this._fn() * max);
  }
}

/* ── اللاعب ── */
class RamiPlayer {
  constructor(id, name, isBot) {
    this.id = id;
    this.name = name;
    this.isBot = !!isBot;
    this.hand = [];      // RamiCard[]
    this.melds = [];     // RamiMeld[]
    this.totalScore = 0;
    this.hasOpened = false;
    this.penaltyScore = 0;
    this.drawnDiscardCard = null;
    this.drawnFojokCard = null; /* [V19.2] الفوجوك المسحوبة هذا الدور */
    this.displayCards = []; // ترتيب عرض ثابت: كل ورقة تحتفظ بموضعها وتنقلب في مكانها عند الإنزال
  }

  handSize() { return this.hand.length; }

  getCard(id) {
    return this.hand.find(c => c.id === id);
  }

  removeCard(id) {
    const idx = this.hand.findIndex(c => c.id === id);
    if (idx < 0) return null;
    return this.hand.splice(idx, 1)[0];
  }

  meldCount() {
    let n = 0;
    for (const m of this.melds) n += m.cards.length;
    return n;
  }
}

/* ── الـ Meld ── */
const MELD_TYPE = { SET: 'set', SEQUENCE: 'sequence' };

class RamiMeld {
  constructor(type, cards) {
    this.type = type;
    this.cards = cards.slice();
    this.id = Math.random().toString(36).slice(2, 10);
  }

  findJokerSwapIndex(card, rules) {
    /* [2026-09-12] استبدال الجوكر المنزل: يشمل الجوكر المطبوع (الطالاج)
       والجوكر البري (السامبل — الورقة المعكوسة). الورقة الحقيقية تحل محل
       الجوكر ويستعيده اللاعب ليده. الجوكرات لا تُستبدل بجوكرات. */
    if (!card || rules.isWildCard(card)) return -1;
    /* مواضع كل الجوكرات في المجموعة (مطبوعة + برية) */
    const jokerIdxs = [];
    this.cards.forEach(function (c, i) { if (rules.isWildCard(c)) jokerIdxs.push(i); });
    if (!jokerIdxs.length) return -1;
    for (const jokerIdx of jokerIdxs) {
      const testCards = this.cards.slice();
      testCards[jokerIdx] = card;
      /* المجموعة يجب أن تبقى صالحة بعد الاستبدال (ورقة واحدة لكل خانة) */
      let ok = false;
      if (this.type === MELD_TYPE.SET && rules.isValidSet(testCards, true)) ok = true;
      else if (this.type === MELD_TYPE.SEQUENCE && rules.isValidSequence(testCards, true)) ok = true;
      if (ok) {
        /* [SAMPEL-WILD] البرية قد تسد متتالية الآن (كجوكر) — الاستبدال وارد
           في المجموعتين؛ احرس فقط أن الورقة الحقيقية لا تكرر ورقة موجودة */
        const dup = this.cards.some(function (c, i) {
          return i !== jokerIdx && !rules.isWildCard(c) && c.rank === card.rank && c.suit === card.suit;
        });
        if (!dup) return jokerIdx;
      }
    }
    return -1;
  }

  clone() {
    return new RamiMeld(this.type, this.cards.map(c => c.clone()));
  }
}

/* ── Meld Validator ── */
class MeldValidator {
  constructor(wildChecker) {
    /* wildChecker(card) => true إذا كانت البطاقة جوكراً برياً (مثل جوكر السامبل المعكوس اللون) */
    this._wildChecker = wildChecker || null;
  }

  _isWild(c) {
    if (!c) return false;
    if (c.isJoker) return true;
    return this._wildChecker ? !!this._wildChecker(c) : false;
  }

  /* التحقق الصارم من الـ SET: نفس الرقم، رموز مختلفة بدون تكرار، من 3 إلى 4 بطاقات فقط، وجوكر واحد على الأكثر */
  isValidSet(cards, jokerAllowed) {
    if (!cards || cards.length < 3 || cards.length > 4) return false;

    // الأوراق الطبيعية غير الجوكر؛ الجوكرات: المطبوعة + البرية (في السامبل)
    const naturals = cards.filter(c => !this._isWild(c));
    const wilds = cards.filter(c => this._isWild(c) && !c.isJoker);
    const physJokers = cards.filter(c => c.isJoker);
    if (physJokers.length > 1) return false;
    if (physJokers.length === 1 && !jokerAllowed) return false;
    /* [قاعدة الجوكرين 2026-09-12] أي نوعين من الجوكر معاً في نفس المجموعة ممنوع:
       جوكر مطبوع + ورقة برية، أو بريتان (كلاهما يظهران كوجه جوكر معكوس اللون) —
       جوكر واحد على الأكثر في المتماثلة (قواعد الرامي) */
    if (physJokers.length + wilds.length > 1) return false;

    // تحديد الرتبة: من الأوراق الطبيعية، وإلا من الأوراق البرية (الجوكرات البرية تحدد الرتبة)
    let rank = null;
    if (naturals.length > 0) {
      rank = naturals[0].rank;
      if (naturals.some(c => c.rank !== rank)) return false;
    } else if (wilds.length > 0) {
      rank = wilds[0].rank;
    }
    if (rank === null) return false; // كل البطاقات جوكر مطبوع

    // الرموز يجب أن تكون مختلفة
    const suits = new Set();
    for (const card of naturals) {
      if (suits.has(card.suit)) return false;
      suits.add(card.suit);
    }

    // الجوكرات البرية: تُعامل كطبيعية إن تطابقت رتبتها ورمزها غير مكرر، وإلا كجوكر
    let jokers = physJokers.length;
    let members = naturals.length;
    for (const wc of wilds) {
      if (wc.rank === rank && !suits.has(wc.suit) && members < 4) {
        suits.add(wc.suit);
        members++;
      } else {
        jokers++;
      }
    }

    if (jokers > 1) return false;
    if (jokers === 1 && !jokerAllowed) return false;

    // لا يجوز وضع الجوكر مع متماثلة كاملة من 4 أوراق
    if (members === 4 && jokers > 0) return false;

    return (members + jokers >= 3) && (members + jokers <= 4);
  }

  /* [v18] هل تصحّ هذه المتتالية باعتبار الآس مرتفعاً (...Q-K-A)؟
     تُستعمل لتحديد قيمة الآس السياقية: 10 في نهاية المتتالية، و1 في بدايتها (A-2-3) */
  isAceHighSequence(cards, jokerAllowed) {
    return this._checkSequence(cards, jokerAllowed, 'high');
  }

  /* التحقق الصارم من الـ Sequence: رموز متطابقة، قيم متسلسلة، 3 بطاقات أو أكثر، وجوكر واحد على الأكثر */
  isValidSequence(cards, jokerAllowed) {
    return this._checkSequence(cards, jokerAllowed, 'any');
  }

  /* الفحص الداخلي للمتتالية — aceMode: 'any' (منخفض أو مرتفع) | 'high' (مرتفع فقط)
     [SAMPEL-WILD 2026-09-12 — توجيه المالك النهائي]:
     الورقة البرية (المعكوسة اللون في السامبل) تُعامل داخل المتتالية
     **كجوكر فقط** — ولو وُضعت في محل رقمها بالضبط (فهي تعمل جوكراً،
     والمتتالية بذلك غير حرة وليست ممنوعة). لذلك:
       • برية واحدة = جوكر واحد يسد فجوة (حد الجوكر الواحد يبقى محكماً).
       • بريتان معاً = جوكران → مرفوض (هذه هي حالة المستخدم J♣-Q♣-Q♣:
         برية عملت رقم Q ثم برية أخرى سدّت K — ورقة واحدة برقمها وجوكراً).
       • برية + جوكر مطبوع = جوكران → مرفوض.
       • أرقام البرية الطبيعية لا تُجرب أبداً في سلسلة الأرقام (ألغي
         منطق الـ mask «طبيعية أو جوكر» الذي سمح بالخطأ J-Q-Q).
     في الطالاج: الجوكر المطبوع (isJoker) وحده يسد الفجوات كالمعتاد. */
  _checkSequence(cards, jokerAllowed, aceMode) {
    if (!cards || cards.length < 3) return false;

    const naturals = cards.filter(c => !this._isWild(c));
    const wilds = cards.filter(c => this._isWild(c) && !c.isJoker);
    const physJokers = cards.filter(c => c.isJoker);
    /* جوكر واحد على الأكثر في المتتالية بأي نوع (مطبوع أو بري) */
    if (physJokers.length + wilds.length > 1) return false;
    if (physJokers.length + wilds.length === 1 && !jokerAllowed) return false;

    if (naturals.length === 0) return false;

    // جميع الأوراق الطبيعية يجب أن تكون من نفس الرمز وبرتب مختلفة
    const suit = naturals[0].suit;
    if (naturals.some(c => c.suit !== suit)) return false;
    const natRanks = naturals.map(c => c.rank);
    if (new Set(natRanks).size !== natRanks.length) return false;
    if (natRanks.length < 2) return false;   /* الجوكر يسد فجوة واحدة على الأكثر بين رقمين */

    const jokers = physJokers.length + wilds.length;

    function testSequence(ranks, jokers) {
      ranks.sort((a, b) => a - b);
      let needed = 0;
      for (let i = 1; i < ranks.length; i++) {
        if (ranks[i] === ranks[i - 1]) return false; // تكرار نفس الرقم في نفس الرمز غير مسموح
        needed += (ranks[i] - ranks[i - 1] - 1);
      }
      return needed <= jokers;
    }

    // 1. فحص الآس كرتبة منخفضة (A, 2, 3) — يُتجاوز في وضع 'high'
    if (aceMode !== 'high' && testSequence(natRanks.slice(), jokers)) return true;

    // 2. فحص الآس كرتبة مرتفعة (10, J, Q, K, A)
    if (natRanks.includes(1)) {
      const ranksHigh = natRanks.map(r => (r === 1 ? 14 : r));
      if (testSequence(ranksHigh, jokers)) return true;
    }

    return false;
  }

  /* التحقق العام للـ Meld (SET أو Sequence) */
  isValidMeld(cards, jokerAllowed) {
    return this.isValidSet(cards, jokerAllowed) || this.isValidSequence(cards, jokerAllowed);
  }

}

/* ── قواعد Joker Resolver (Simple Mode) ── */
/* في Simple، تظهر بطاقة جوكر محددة، وتصبح بطاقة معينة Joker بناءً على اللون المعاكس */
class OppositeColorJokerResolver {
  isJoker(card, indicator) {
    if (card.isJoker) return true;
    if (!indicator) return false;
    return card.rank === indicator.rank &&
           RAMI_SUIT_COLOR[card.suit] !== RAMI_SUIT_COLOR[indicator.suit];
  }
}

/* ── القواعد الأساسية للعبة ── */
class RamiRules {
  constructor(mode, turnSeconds) {
    this.mode = mode || 'talaj'; // 'talaj' or 'simple'
    this.turnSeconds = turnSeconds || 90;
    this.jokerIndicator = null;
    this.jokerResolver = new OppositeColorJokerResolver();
    this.validator = new MeldValidator((c) => this.isWildCard(c));
  }

  /* بطاقة جوكر بري؟ (مطبوعة في الطالاج، أو معكوسة اللون في السامبل) */
  isWildCard(c) {
    if (!c) return false;
    if (c.isJoker) return true;
    if (this.jokerIndicator && this.jokerResolver.isJoker(c, this.jokerIndicator)) return true;
    return false;
  }

  get deckSize() { return this.mode === 'talaj' ? 108 : 104; }
  get initialHandSize() { return this.mode === 'talaj' ? 14 : 13; }
  get dealerHandSize() { return this.mode === 'talaj' ? 15 : 13; }
  /* سقف عدد الأوراق في اليد أثناء اللعب (قبل رمي ورقة التخلص) */
  get playHandSize() { return this.mode === 'talaj' ? 15 : 14; }
  get openingThreshold() { return this.mode === 'talaj' ? 71 : 51; }
  get finishPenalty() { return this.mode === 'talaj' ? 71 : 51; }
  get fullHandPenalty() { return this.mode === 'talaj' ? 100 : 51; }
  get hasPhysicalJokers() { return this.mode === 'talaj'; }

  isValidSet(cards, jokerAllowed) {
    return this.validator.isValidSet(cards, jokerAllowed);
  }

  isValidSequence(cards, jokerAllowed) {
    return this.validator.isValidSequence(cards, jokerAllowed);
  }

  isValidMeld(cards, jokerAllowed) {
    return this.validator.isValidMeld(cards, jokerAllowed);
  }

  /* [v18] قيمة الورقة داخل مجموعة — الآس سياقي:
     A = 10 في المتماثلة وفي نهاية المتتالية (...Q-K-A / ...J-Q-K-A)
     A = 1  في بداية المتتالية (A-2-3 / A-2-3-4 ...) */
  cardPointsInMeld(card, meld) {
    if (this.isWildCard(card)) return 0;
    if (card.rank !== 1) return card.baseValue;
    if (meld && meld.type === MELD_TYPE.SEQUENCE &&
        !this.validator.isAceHighSequence(meld.cards, true)) {
      return 1; // متتالية تصح فقط بالآس المنخفض (A-2-3...)
    }
    return 10; // متماثلة، أو متتالية بالآس المرتفع (Q-K-A)
  }

  /* [v18] مجموع نقاط مجموعة (الجوكرات = 0، الآس سياقي) */
  meldPoints(meld) {
    let s = 0;
    for (const c of meld.cards) s += this.cardPointsInMeld(c, meld);
    return s;
  }

  /* التحقق من الافتتاح: SET + Sequence، المجموع > threshold، لا Joker */
    /* التحقق الصارم من شروط الافتتاح: متتالية نقية + متماثلة نقية + مجموع ≥ 71 بدون جوكر + تجاوز أعلى افتتاح سابق */
  validateOpening(melds, drawnDiscardCard, jokerIndicator, highestPrevScore, isLaTour) {
    if (!melds || melds.length === 0) return { valid: false, error: 'لا توجد مجموعات صالحة للافتتاح' };

    // 1. التحقق من وجود متماثلة نقية (Set) خالية من الجوكر ولا تعتمد على ورقة المرموق/لا تور للافتتاح
    const pureSets = melds.filter(m => {
      if (m.type !== MELD_TYPE.SET || m.cards.length < 3) return false;
      // خالية من الجوكر (المطبوع أو البري)
      if (m.cards.some(c => this.isWildCard(c))) return false;
      // خالية من ورقة المرموق المسحوبة / لا تور
      if (drawnDiscardCard && m.cards.some(c => c.id === drawnDiscardCard.id)) return false;
      return true;
    });

    // 2. التحقق من وجود متتالية نقية (Sequence) خالية من الجوكر ولا تعتمد على ورقة المرموق/لا تور للافتتاح
    const pureSequences = melds.filter(m => {
      if (m.type !== MELD_TYPE.SEQUENCE || m.cards.length < 3) return false;
      if (m.cards.some(c => this.isWildCard(c))) return false;
      if (drawnDiscardCard && m.cards.some(c => c.id === drawnDiscardCard.id)) return false;
      return true;
    });

    /* [V19] الطالاج والسامبل كلاهما: متتالية حرة + متماثلة حرة معاً
       (خاليتان من الجوكر ومن ورقة المرموق المسحوبة في نفس الدور). */
    const needsPureSet = true;
    if (pureSequences.length === 0 || (needsPureSet && pureSets.length === 0)) {
      return {
        valid: false,
        error: 'يجب أن يتضمن الافتتاح متتالية حرة من نفس الرمز (3+ أرقام) ومتماثلة حرة (3-4 أرقام برموز مختلفة) خاليتين تماماً من الجوكر وورقة المرموق المسحوبة في هذا الدور'
      };
    }

    // 3. [V19] حساب المجموع الحر: أوراق المجموعات الخالية تماماً من الجوكر فقط.
    //    المجموعات التي تحوي جوكراً لا تساهم في عتبة الافتتاح، بل تزيد المجموع الإجمالي
    //    لتجاوز أعلى افتتاح سابق فقط.
    //    [v18] الآس سياقي: A = 10 في المتماثلة وفي نهاية المتتالية (Q-K-A)،
    //    و A = 1 في بداية المتتالية (A-2-3). الصور = 10، الجوكر = 0.
    let freeScore = 0;
    let extraScore = 0;
    /* [قانون الطالاج — المرموق] ورقة المرموق/لا تور المسحوبة يجوز سحبها للافتتاح
       بضمّها لمجموعة صالحة تُكمل حساب الـ71 بشرطين: ألا تندرج في المتتالية أو
       المتماثلة الحرتين (مضمون أعلاه بمرشحي pureSequences/pureSets)، وألا يرافقها
       جوكر في نفس المجموعة. عندئذٍ يُحسب مجموع مجموعتها مع المجموعات الحرة التي
       تحقق شرط الـ71 بلا جوكر. (السامبل: العتبة 51 والقاعدة نفسها.) */
    const drawnOk = drawnDiscardCard && !this.isWildCard(drawnDiscardCard);
    for (const meld of melds) {
      /* المجموعة «غير الحرة» عن العتبة: تحوي جوكراً؛ أو تحوي ورقة المرموق المسحوبة
         هذا الدور مع جوكر أو كان المسحوب نفسه جوكراً */
      const hasJoker = meld.cards.some(c => this.isWildCard(c));
      const hasDrawn = drawnDiscardCard && meld.cards.some(c => c.id === drawnDiscardCard.id);
      const hasWild = hasJoker || (hasDrawn && !drawnOk);
      for (const card of meld.cards) {
        if (this.isWildCard(card)) continue;
        const pts = this.cardPointsInMeld(card, meld);
        if (hasWild) extraScore += pts;
        else freeScore += pts;
      }
    }
    const totalScore = freeScore + extraScore;

    if (freeScore < this.openingThreshold) {
      return {
        valid: false,
        score: totalScore,
        freeScore: freeScore,
        error: 'المجموع الحر للافتتاح (' + freeScore + ') أقل من الحد القانوني (' + this.openingThreshold + ' نقطة بدون جوكر) — مجموعات الجوكر لا تُحتسب في العتبة، يجب أن تحقق ' + this.openingThreshold + ' نقطة حرة أولاً'
      };
    }

    // 4. قاعدة تجاوز أعلى افتتاح سابق (> X) — تُقارن بالمجموع الإجمالي (يشمل مجموعات الجوكر)
    if (highestPrevScore && highestPrevScore > 0 && totalScore <= highestPrevScore) {
      return {
        valid: false,
        score: totalScore,
        freeScore: freeScore,
        error: 'يجب أن يتجاوز مجموع افتتاحك (' + totalScore + ') أعلى افتتاح سابق في الشوط (' + highestPrevScore + ' نقطة)'
      };
    }

    return { valid: true, score: totalScore, freeScore: freeScore };
  }

  /* [V28] البنية الهيكلية للإنهاء: متتالية حرة + متماثلة حرة خاليتين من الجوكر والمرموق —
     بدون عتبة الـ71 (العتبة تُطبَّق فقط في مسار الافتتاح). */
  validateFinishStructure(melds, drawnDiscardCard) {
    if (!melds || melds.length === 0) return { valid: false, pureSets: 0, pureSequences: 0 };
    const isPure = (m) => {
      if (!m.cards || m.cards.length < 3) return false;
      if (m.cards.some(c => this.isWildCard(c))) return false;
      if (drawnDiscardCard && m.cards.some(c => c.id === drawnDiscardCard.id)) return false;
      return true;
    };
    const pureSets = melds.filter(m => m.type === MELD_TYPE.SET && isPure(m)).length;
    const pureSequences = melds.filter(m => m.type === MELD_TYPE.SEQUENCE && isPure(m)).length;
    /* [V19] الطالاج والسامبل: الإنهاء يشترط متتالية حرة + متماثلة حرة معاً */
    const needsPureSet = true;
    return {
      valid: pureSequences > 0 && (!needsPureSet || pureSets > 0),
      pureSets: pureSets,
      pureSequences: pureSequences
    };
  }

}

/* ── مدير الجولة ── */
class RoundManager {
  constructor(rules, rng) {
    this.rules = rules;
    this.rng = rng;
    this.deck = new RamiDeck(rules);
    this.players = [];
    this.currentPlayerIndex = 0;
    this.dealerIndex = 0;
    this.drawPile = [];
    this.discardPile = [];
    this.tableMelds = [];
    this.jokerIndicator = null;
    this.jokerIndicatorInfo = null; /* [V19] وصف الجوكر الدائم (يبقى بعد سحب/خلط الفوجوك) */
    this.turnPhase = 'WAITING_DRAW';
    this.roundNumber = 0;
    this.turnSecondsRemaining = rules.turnSeconds;
    this.highestOpeningScore = 0;
    this.highestOpeningPlayer = null;
    this.jokerDouble = false; // تضاعف جزاء الشوط عند إنهاء بجوكر حر معزول
    /* [V29] دورة الموزع الأولى: لا يفتتح ولا يسحب المرموق قبل السحب من ورق التوزيع */
    this.dealerFirstCycle = false;
  }

  initPlayers(playerCount, botCount, botSeats) {
    this.players = [];
    const humanCount = Math.max(1, playerCount - (botCount || 0));
    /* botSeats: قائمة بمقاعد الآلي صراحةً (للغرف المختلطة بشر+آلي في مقاعد متفرقة) */
    const seatIsBot = (botSeats && botSeats.length)
      ? (i) => botSeats.indexOf(i) !== -1
      : (i) => (i >= humanCount);
    for (let i = 0; i < playerCount; i++) {
      const isBot = seatIsBot(i);
      const nm = isBot ? ('AI ' + (i + 1)) : _ramiT('parchisi.you', 'أنت');
      this.players.push(new RamiPlayer(i, nm, isBot));
    }
    this.dealerIndex = 0;
    this.currentPlayerIndex = (this.rules.mode === 'talaj') ? this.dealerIndex : (this.dealerIndex + 1) % playerCount;
  }

  startRound() {
    if (typeof clearRamiPartitionCache === 'function') clearRamiPartitionCache();
    this.roundNumber++;
    this.dealRound();
  }

  /* [V14] فحص سلامة الرزمة: العدد الكلي (108 طلاج / 104 سامبل) وتكرار كل ورقة مرتين فقط (جوكر 4) */
  verifyDeckIntegrity(cards) {
    const expected = this.rules.hasPhysicalJokers ? 108 : 104;
    const counts = new Map();
    for (const c of cards) {
      const k = c.isJoker ? 'JOKER' : (c.rank + ':' + c.suit);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    if (cards.length !== expected) {
      return { ok: false, problem: 'العدد الإجمالي ' + cards.length + ' بدل ' + expected };
    }
    for (const [k, n] of counts) {
      const limit = (k === 'JOKER') ? 4 : 2;
      if (n !== limit) {
        return { ok: false, problem: 'الورقة ' + k + ' تكررت ' + n + '× بدل ' + limit };
      }
    }
    return { ok: true, problem: null };
  }

  dealRound() {
    this.deck = new RamiDeck(this.rules);
    this.deck.shuffle(this.rng);
    /* [V14] حارس سلامة الرزمة: 108/104 ورقة بالضبط — زوجان من كل ورقة طبيعية + 4 جواكر.
       يمنع برمجياً أي تكرار لورقة معينة أكثر من مرتين قبل خلط المرموق. */
    const check = this.verifyDeckIntegrity(this.deck.cards);
    if (!check.ok && typeof console !== 'undefined') {
      console.error('[Rami] تكرار ورقة في الرزمة — تم إعادة البناء:', check.problem);
    }
    this.drawPile = this.deck.cards.slice();
    this.discardPile = [];
    this.tableMelds = [];
    this.jokerIndicator = null;
    this.laTourCard = null;
    this.turnCount = 0;
    this.isFirstTourCycle = true;
    this.turnPhase = 'WAITING_DRAW';
    this.jokerDouble = false;
    this.highestOpeningScore = 0;
    this.highestOpeningPlayer = null;
    this.turnSecondsRemaining = this.rules.turnSeconds;
    /* [V29] الموزع يبدأ دورته الأولى (لا افتتاح ولا سحب مرموق قبل السحب من التوزيع) —
       [V19] قاعدة طالاج فقط: في السامبل الموزع كسائر اللاعبين (13 ورقة) ولا قيود عليه */
    this.dealerFirstCycle = (this.rules.mode === 'talaj');

    /* مسح أيدي اللاعبين وكل الحالات العالقة من الشوط السابق (منع تسرب ورقة مرموق/لا تور بين الأشواط) */
    for (const p of this.players) {
      p.hand = [];
      p.melds = [];
      p.hasOpened = false;
      p.drawnDiscardCard = null;
      p.drawnLaTourCard = null;
      p.drawnFojokCard = null;
      p.tookLaTour = false;
    }

    /* توزيع البطاقات: Talaj يمنح الموزع 15 ورقة والآخرين 14 ورقة.
       [V18] اللاعبون المُقصون لا تُوزَّع لهم أوراق (خرجوا من الجولة). */
    for (let i = 0; i < this.players.length; i++) {
      const playerIdx = i;
      if (this.players[playerIdx].isEliminated) continue;
      const isDealer = (playerIdx === this.dealerIndex);
      const amount = isDealer ? this.rules.dealerHandSize : this.rules.initialHandSize;
      const cards = this.drawFromPile(amount);
      this.players[playerIdx].hand.push(...cards);
    }
    /* ترتيب عرض ثابت: الأوراق تحفظ مواضعها منذ التوزيع وتنقلب في مكانها عند الإنزال */
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].displayCards = this.players[i].hand.slice();
    }
    /* [V18] أول لاعب نشط يبدأ الشوط (تخطي المُقصيين) */
    this.currentPlayerIndex = this.firstActiveFrom((this.rules.mode === 'talaj') ? this.dealerIndex : (this.dealerIndex + 1));

    /* [V19] السامبل: تُقلب الورقة الأولى من ورق التوزيع = «الفوجوك».
       اللون المعاكس لها بنفس الرتبة هو الجوكر. تعريف الجوكر يُخزَّن كوصفٍ مستقل
       (rank/suit) في rules.jokerIndicator كي يبقى صالحاً حتى بعد سحب الفوجوك
       أو خلطها مع المرموق عند نفاد ورق التوزيع. */
    if (!this.rules.hasPhysicalJokers && this.drawPile.length > 0) {
      this.jokerIndicator = this.drawPile.pop();
      this.rules.jokerIndicator = {
        id: 'IND-' + this.jokerIndicator.rank + '-' + this.jokerIndicator.suit,
        rank: this.jokerIndicator.rank,
        suit: this.jokerIndicator.suit,
        isJoker: false
      };
      /* وصف عرضي دائم للواجهة (يبقى بعد زوال الورقة الفيزيائية) */
      this.jokerIndicatorInfo = this.rules.jokerIndicator;
    } else {
      this.rules.jokerIndicator = null;
      this.jokerIndicatorInfo = null;
    }

    /* في وضع الطالاج: الموزع يملك 15 ورقة بالفعل، ويبدأ دوره في مرحلة رمي الورقة الـ15 دون سحب.
       [V19] السامبل: لا تُقلب ورقة مرموق إضافية — المرموق يبدأ فارغاً ويُبنى من رميات اللاعبين،
       والفوجوك وحدها معروضة وقابلة للسحب في الدور الأول فقط. */
    if (this.rules.mode === 'talaj') {
      this.turnPhase = 'WAITING_DISCARD';
    } else {
      this.turnPhase = 'WAITING_DRAW';
    }
  }

  drawFromPile(n) {
    const result = [];
    for (let i = 0; i < n; i++) {
      if (this.drawPile.length === 0) {
        this.recycleDiscardPile();
        if (this.drawPile.length === 0) break;
      }
      result.push(this.drawPile.pop());
    }
    return result;
  }

  drawFromDiscard() {
    if (this.discardPile.length === 0) return null;
    return this.discardPile.pop();
  }

  recycleDiscardPile() {
    /* القاعدة الصحيحة: عند نفاد المجرف يُعاد خلط أوراق المرموق فقط (ما عدا أعلى ورقة)
       وتُترك مجموعات الطاولة المنزلة كما هي — لا يجوز المساس بها وإلا تكررت الأوراق.
       [V19] السامبل: ورقة الفوجوك غير المسحوبة تُخلط مع أوراق المرموق عند نفاد ورق
       التوزيع لتصبح قابلة للسحب ضمن التوزيع (تعريف الجوكر يبقى محفوظاً في
       rules.jokerIndicator كوصف مستقل). */
    if (this.drawPile.length > 0) return 0;

    const recycleCards = [];
    if (this.rules.mode !== 'talaj' && this.jokerIndicator) {
      recycleCards.push(this.jokerIndicator);
      this.jokerIndicator = null;
    }
    if (this.discardPile.length > 1) {
      const topCard = this.discardPile.pop();
      recycleCards.push(...this.discardPile.splice(0));
      this.discardPile = [topCard];
    }

    this.laTourCard = null;

    if (recycleCards.length === 0) return 0;

    // إعادة خلط أوراق المرموق المسترجعة عشوائياً إلى المجرف
    for (let i = recycleCards.length - 1; i > 0; i--) {
      const j = this.rng.next(i + 1);
      const t = recycleCards[i];
      recycleCards[i] = recycleCards[j];
      recycleCards[j] = t;
    }
    this.drawPile = recycleCards;
    return recycleCards.length;
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  /* [V18] أول لاعب نشط (غير مُقصى) ابتداءً من المؤشر المعطى */
  firstActiveFrom(index) {
    const n = this.players.length;
    for (let k = 0; k < n; k++) {
      const i = (index + k) % n;
      if (!this.players[i].isEliminated) return i;
    }
    return index % n;
  }

  nextPlayer() {
    this.turnCount = (this.turnCount || 0) + 1;
    if (this.turnCount >= this.players.length) {
      this.isFirstTourCycle = false; // انتهاء الدور الأول لكل لاعب -> إغلاق إمكانية أخذ ورقة الموزع الأولى (لا تور)
    }
    /* [V19.2] المجموعة الحرة محمية من الجوكر/المرموق في دور إنزالها فقط —
       بانتهاء الدور تسقط الحماية ويجوز إدراج الجوكر وورقة المرموق فيها */
    if (this.tableMelds) for (const m of this.tableMelds) m._justOpened = false;
    /* [V18] تخطي اللاعبين المُقصيين */
    this.currentPlayerIndex = this.firstActiveFrom(this.currentPlayerIndex + 1);
    this.turnPhase = 'WAITING_DRAW';
    this.turnSecondsRemaining = this.rules.turnSeconds;
  }

}

/* ── مدير الألعاب الكامل ── */
class RamiGame {
  constructor(mode, playerCount, botCount, seed, turnSeconds, botSeats) {
    this.mode = mode || 'talaj';
    this.seed = seed !== undefined ? seed : Math.floor(Math.random() * 0xFFFFFFFF);
    this.turnSeconds = turnSeconds || 90;
    this.rng = new DeterministicRng(this.seed);
    this.rules = new RamiRules(this.mode, this.turnSeconds);
    this.roundManager = new RoundManager(this.rules, this.rng);
    this.players = [];
    this.gamePhase = 'LOBBY'; // LOBBY, ROUND_SETUP, PLAYING, ROUND_END, MATCH_END
    this.targetScore = this.rules.mode === 'talaj' ? 701 : 501;
    this.playerCount = playerCount || 4;
    this.botCount = botCount || 0;
    this.botSeats = botSeats || null;   /* [MP-AI] مقاعد الآلي صراحةً (غرف مختلطة) */
  }

  get currentPlayerIndex() {
    return this.roundManager ? this.roundManager.currentPlayerIndex : 0;
  }
  set currentPlayerIndex(val) {
    if (this.roundManager) this.roundManager.currentPlayerIndex = val;
  }

  /* بدء المباراة */
  startMatch(targetScore) {
    this.targetScore = targetScore || this.targetScore;
    this.playerCount = Math.min(Math.max(this.playerCount, 2), 5);
    this.botCount = Math.min(Math.max(this.botCount, 0), this.playerCount - 1);
    this.roundManager.initPlayers(this.playerCount, this.botCount, this.botSeats);
    this.players = this.roundManager.players;
    this.dealRound();
    this.gamePhase = 'PLAYING';
  }

  startRound() {
    this.roundManager.startRound();
    this.players = this.roundManager.players;
    /* [V18] دور البداية يُحسب داخل roundManager.dealRound (يتخطى المُقصيين) */
    this.currentPlayerIndex = this.roundManager.currentPlayerIndex;
  }

  /* توزيع الأوراق فقط دون زيادة رقم الشوط (يُستخدم للشوط التجريبي قبل اختيار الموزع) */
  dealRound() {
    this.roundManager.dealRound();
    this.players = this.roundManager.players;
    this.currentPlayerIndex = this.roundManager.currentPlayerIndex;
  }

  /* مزامنة طور اللعب مع حجم اليد: اليد الممتلئة تعني أن اللاعب سحب بالفعل وعليه الرمي فقط.
     يمنع الـ Deadlock (يد ممتلئة + طور سحب = لا سحب ولا رمي). */
  normalizeTurnPhase() {
    const rm = this.roundManager;
    if (!rm || rm.turnPhase !== 'WAITING_DRAW') return;
    const curP = rm.getCurrentPlayer();
    if (curP && curP.hand && curP.hand.length >= this.rules.playHandSize) {
      rm.turnPhase = 'WAITING_DISCARD';
    }
  }

  doesCardFitAnyTableMeld(card) {
    if (!card || !this.roundManager.tableMelds) return false;
    for (const meld of this.roundManager.tableMelds) {
      /* [V19.2] الحرة تبقى حرة في دور إنزالها فقط: الجوكر لا يُدرج في مجموعة حرة
         أُنزلت هذا الدور؛ في الأدوار الموالية يجوز */
      if (meld._justOpened && this.rules.isWildCard(card) && !meld.cards.some(c => this.rules.isWildCard(c))) continue;
      const temp = meld.cards.concat([card]);
      if (meld.type === MELD_TYPE.SET && this.rules.isValidSet(temp, true)) return true;
      if (meld.type === MELD_TYPE.SEQUENCE && this.rules.isValidSequence(temp, true)) return true;
      if (typeof meld.findJokerSwapIndex === 'function' && meld.findJokerSwapIndex(card, this.rules) !== -1) return true;
    }
    return false;
  }

  /* منطق استخراج كل الحركات القانونية للاعب الحالي */
  getLegalMoves(playerId) {
    const moves = [];
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.gamePhase !== 'PLAYING') return moves;
    this.normalizeTurnPhase();

    if (this.roundManager.turnPhase === 'WAITING_DRAW') {
      const maxHand = this.rules.playHandSize;
      if (player.hand.length < maxHand) {
        if (this.roundManager.drawPile.length > 0 || this.roundManager.discardPile.length > 1) {
          moves.push({ type: 'draw_deck', playerId });
        }
        // قانون الـ 13 ورقة: إذا كانت اليد بها ورقة واحدة، يحرم من سحب المرموق
        // [V29] الموزع لا يسحب المرموق في دورته الأولى
        // [V19] السامبل: سحب المرموق حر بلا أي شرط (لا 13 ورقة ولا حظر الموزع)
        const isSample = (this.rules.mode !== 'talaj');
        const dealerBarred = !isSample && (player.id === this.roundManager.dealerIndex && this.roundManager.dealerFirstCycle);
        const marmouqAllowed = isSample
          ? (this.roundManager.discardPile.length > 0)
          : (!dealerBarred && this.roundManager.discardPile.length > 0 && player.hand.length > 1 && player.meldCount() < 13);
        if (marmouqAllowed) {
          moves.push({ type: 'draw_discard', playerId });
        }
        /* [V19] السامبل: سحب الفوجوك متاح خلال الدورة الأولى فقط */
        if (isSample && this.roundManager.jokerIndicator && this.roundManager.isFirstTourCycle) {
          moves.push({ type: 'draw_fojok', playerId });
        }
      } else {
        for (const card of player.hand) {
          moves.push({ type: 'discard', playerId, cardId: card.id });
        }
      }
    } else if (this.roundManager.turnPhase === 'WAITING_DISCARD' || this.roundManager.turnPhase === 'WAITING_ACTION') {
      // رمي ورقة التخلص
      for (const card of player.hand) {
        moves.push({ type: 'discard', playerId, cardId: card.id });
      }

      // إمكانية الافتتاح (لمن لم يفتتح بعد): تتطلب متتالية نقية + متماثلة نقية بمجموع كافٍ
      // نعتمد تقسيم كامل اليد (كما يفعل اللاعب البشري) لضمان احتساب كل المجموعات نحو عتبة الافتتاح
      // [V29] الموزع لا يفتتح في دورته الأولى
      const dealerFirstBarred = (player.id === this.roundManager.dealerIndex && this.roundManager.dealerFirstCycle);
      if (!player.hasOpened && !dealerFirstBarred) {
        /* نمطا التقسيم: التغطية القصوى ثم تعظيم النقاط الحرة —
           نشر الجوكرات قد يخفي مجموعات نقية يستحقها اللاعب للافتتاح */
        /* [V19.3] تمرير أعلى افتتاح سابق إلزامي هنا أيضاً — وإلا عُرض «افتتاح»
           كحركة قانونية ثم رُفض عند التنفيذ بجزاء ظالم (شرط التجاوز الصارم >) */
        let openingMelds = partitionSelectedCards(player.hand, this.rules, 'opening');
        let check = (openingMelds && openingMelds.length >= 1)
          ? this.rules.validateOpening(openingMelds, player.drawnDiscardCard, this.roundManager.jokerIndicator, this.roundManager.highestOpeningScore || 0, false)
          : { valid: false };
        if (!check.valid) {
          openingMelds = partitionSelectedCards(player.hand, this.rules);
          check = (openingMelds && openingMelds.length >= 1)
            ? this.rules.validateOpening(openingMelds, player.drawnDiscardCard, this.roundManager.jokerIndicator, this.roundManager.highestOpeningScore || 0, false)
            : { valid: false };
        }
        if (check.valid && openingMelds && openingMelds.length >= 1) {
          moves.push({ type: 'open', playerId, cardIds: openingMelds.flatMap(m => m.cards.map(c => c.id)) });
        }
      }

      // إمكانية إنهاء الشوط (للأيدي الصغيرة المتبقية — اليد الكبيرة تنهي عبر الافتتاح والإنزال)
      // [V19] السامبل: الإنهاء من اليد الكاملة (13 ورقة بمجموعات صالحة + ورقة الإنهاء الـ14)
      const finishGate = (this.rules.mode === 'talaj') ? (player.hand.length <= 7) : true;
      if (finishGate && this.canFinish(player)) {
        moves.push({ type: 'finish', playerId });
      }
    }

    return moves;
  }

  /* تنفيذ حركة — يُستخدم من قبل السيرفر أو الوضع المحلي */
  executeMove(move) {
    const player = this.players.find(p => p.id === move.playerId);
    if (!player) return { success: false, error: 'لاعب غير صالح' };
    this.normalizeTurnPhase();
    const currentPlayer = this.roundManager.getCurrentPlayer();
    if (currentPlayer.id !== player.id) {
      return { success: false, error: 'ليس دورك' };
    }

    try {
      switch (move.type) {
        case 'draw_deck':
          return this._doDrawDeck(player);
        case 'draw_discard':
          return this._doDrawDiscard(player);
        case 'draw_fojok':
          return this._doDrawFojok(player);
        case 'open':
          return this._doOpen(player, move.cardIds, move.meldGroups);
        case 'discard':
          return this._doDiscard(player, move.cardId);
        case 'finish':
          return this._doFinish(player, move);
      }
      return { success: false, error: 'نوع الحركة غير معروف' };
    } catch (e) {
      console.error('[Rami] executeMove error:', e && e.message, e);
      return { success: false, error: 'خطأ داخلي في الحركة — أعد المحاولة' };
    }
  }

  _doDrawDeck(player) {
    if (this.roundManager.turnPhase !== 'WAITING_DRAW') {
      return { success: false, error: 'لست في مرحلة السحب — يجب رمي ورقة التخلص' };
    }
    const maxHand = this.rules.playHandSize;
    if (player.hand.length >= maxHand) {
      return { success: false, error: 'يدك ممتلئة (' + player.hand.length + ' ورقة) — لا يجوز سحب ورقة إضافية، يجب التخلص من ورقة' };
    }

    // فحص قانون الـ 12 ورقة: إذا كان لدى اللاعب 12 ورقة منزلة وكانت ورقة المرموق تطابق مجموعات الطاولة.
    // لا يُطبَّق الجزاء إذا كان اللاعب ممنوعاً من سحب المرموق أصلاً (قانون الـ 13 ورقة: ورقة واحدة في اليد أو 13 ورقة منزلة).
    /* [V19] قوانين الـ12/13 ورقة خاصة بالطالاج — لا تُطبَّق في السامبل */
    const barredFromDiscard = (this.rules.mode !== 'talaj') || (player.hand.length === 1 || player.meldCount() >= 13);
    if (this.roundManager.feederDiscard && this.roundManager.feederDiscard.receiverId === player.id) {
      if (barredFromDiscard) {
        this.roundManager.feederDiscard = null; // اللاعب ممنوع من سحب المرموق — يسقط الالتزام
      } else {
        this._applyPenalty(player, 'RULE_12_IGNORED', '');
        _ramiToast('⚠️ قانون الـ 12 ورقة: غفلت عن سحب ورقة المرموق المطابقة لمجموعات الطاولة — تم تسجيل مخالفة +71 نقطة جزاء لحسابك بنهاية الشوط!', 'warn');
        this.roundManager.feederDiscard = null;
      }
    } else if (!barredFromDiscard && player.meldCount() >= 12 && this.roundManager.discardPile.length > 0) {
      const topDiscard = this.roundManager.discardPile[this.roundManager.discardPile.length - 1];
      if (this.doesCardFitAnyTableMeld(topDiscard)) {
        this._applyPenalty(player, 'RULE_12_IGNORED', topDiscard.displayName);
        _ramiToast('⚠️ قانون الـ 12 ورقة: ورقة المرموق (' + topDiscard.displayName + ') تطابق مجموعات الطاولة وكان يجب سحبها — تم تسجيل مخالفة +71 نقطة جزاء لحسابك بنهاية الشوط!', 'warn');
      }
    }

    // إذا نفدت أوراق المجرف، يُعاد خلط أوراق المرموق
    if (this.roundManager.drawPile.length === 0) {
      const recycledCount = this.roundManager.recycleDiscardPile();
      if (recycledCount > 0 && typeof SND !== 'undefined' && SND.shuffle) {
        SND.shuffle();
        _ramiToast(_ramiT('rami.recycledMsg') || '🔄 نفدت أوراق السحب — تم خلط المرموق وتجديد المجرف بنجاح!', 'info');
      }
    }

    if (this.roundManager.drawPile.length === 0) {
      return { success: false, error: 'نفدت جميع أوراق السحب والمرموق' };
    }

    const card = this.roundManager.drawFromPile(1)[0];
    player.hand.push(card);
    if (player.displayCards) player.displayCards.push(card);
    this.roundManager.turnPhase = 'WAITING_DISCARD';
    /* [V29] الموزع سحب من ورق التوزيع → انتهت دورة الموزع الأولى (يستطيع الافتتاح الآن) */
    if (player.id === this.roundManager.dealerIndex) this.roundManager.dealerFirstCycle = false;
    return { success: true, card: card };
  }

  _doDrawDiscard(player) {
    if (this.roundManager.turnPhase !== 'WAITING_DRAW') {
      return { success: false, error: 'لست في مرحلة السحب — يجب رمي ورقة التخلص' };
    }
    const maxHand = this.rules.playHandSize;
    if (player.hand.length >= maxHand) {
      return { success: false, error: 'يدك ممتلئة (' + player.hand.length + ' ورقة) — لا يجوز سحب ورقة إضافية، يجب التخلص من ورقة' };
    }
    if (this.roundManager.discardPile.length === 0) {
      return { success: false, error: 'المرموق فارغ' };
    }

    /* [V29] الموزع لا يسحب المرموق في دورته الأولى (أول ورقة بعد لا تور من ورق التوزيع) */
    if (player.id === this.roundManager.dealerIndex && this.roundManager.dealerFirstCycle) {
      return { success: false, error: 'لا يمكن للموزع سحب المرموق في دوره الأول — يجب السحب من ورق التوزيع أولاً' };
    }

    // قانون الـ 13 ورقة (طالاج فقط): اللاعب الذي تتبقى لديه ورقة واحدة يحرم من سحب المرموق
    // [V19] السامبل: سحب المرموق حر بلا شروط
    if (this.rules.mode === 'talaj' && (player.hand.length === 1 || player.meldCount() >= 13)) {
      return {
        success: false,
        error: 'لديك ورقة واحدة فقط في يدك — قانون الطالاج يفرض السحب من المجرف فقط لإنهاء الشوط'
      };
    }

    // فحص قانون «لا تور» (ورقة الموزع الأولى) / [V19] الفوجوك في السامبل: الدور الأول فقط
    const topDiscard = this.roundManager.discardPile[this.roundManager.discardPile.length - 1];
    const isLaTour = (this.roundManager.laTourCard && topDiscard.id === this.roundManager.laTourCard.id);
    
    if (isLaTour && !this.roundManager.isFirstTourCycle) {
      return {
        success: false,
        error: 'انتهى الدور الأول (لا تور) — لا يمكن أخذ ورقة الموزع الأولى بعد مرور الدور الأول لجميع اللاعبين'
      };
    }


    const card = this.roundManager.drawFromDiscard();
    /* وسم مصدر الورقة: ورقة المرموق/لا تور ليست «حرة» (لا تُفعّل تضاعف الجوكر) */
    card.fromDiscard = true;
    card.fromLaTour = !!isLaTour;
    if (isLaTour) {
      this.roundManager.laTourCard = null; // حرمان باقي اللاعبين بعد سحبها
      player.tookLaTour = true;
      player.drawnLaTourCard = card;
    }

    // فحص قانون الـ 12 ورقة: إذا سحب اللاعب صاحب الـ 12 ورقة الورقة المطابقة، يقيد جزاء 71 على من رماها
    if (this.roundManager.feederDiscard && this.roundManager.feederDiscard.receiverId === player.id) {
      const feeder = this.players.find(p => p.id === this.roundManager.feederDiscard.feederId);
      if (feeder) {
        this._applyPenalty(feeder, 'RULE_12_FED', feeder.name);
        _ramiToast('⚠️ قانون الـ 12 ورقة: سحب اللاعب الورقة المطابقة — تم تسجيل جزاء +71 نقطة على اللاعب السابق (' + feeder.name + ') الذي رمى الورقة!', 'warn');
      }
      this.roundManager.feederDiscard = null;
    }

    player.hand.push(card);
    player.drawnDiscardCard = card;
    if (player.displayCards) player.displayCards.push(card);
    
    this.roundManager.turnPhase = 'WAITING_DISCARD';
    return { success: true, card: card, isLaTour: isLaTour };
  }

  /* [V19] السامبل: سحب ورقة الفوجوك (الورقة المقلوبة بعد التوزيع) —
     متاح لأي لاعب في دوره الأول فقط (الدورة الأولى)؛ بعدها لا يحق سحبها،
     وتُخلط مع المرموق عند نفاد ورق التوزيع (recycleDiscardPile).
     الورقة المسحوبة حرة (من ورق التوزيع) — بلا التزام إنزال ولا جزاء. */
  _doDrawFojok(player) {
    if (this.rules.mode === 'talaj') {
      return { success: false, error: 'الفوجوك خاص بوضع السامبل' };
    }
    if (this.roundManager.turnPhase !== 'WAITING_DRAW') {
      return { success: false, error: 'لست في مرحلة السحب — يجب رمي ورقة التخلص' };
    }
    const maxHand = this.rules.playHandSize;
    if (player.hand.length >= maxHand) {
      return { success: false, error: 'يدك ممتلئة — لا يجوز سحب ورقة إضافية' };
    }
    const fojok = this.roundManager.jokerIndicator;
    if (!fojok) {
      return { success: false, error: 'ورقة الفوجوك غير متاحة' };
    }
    if (!this.roundManager.isFirstTourCycle) {
      return { success: false, error: 'انتهت الدورة الأولى — لا يحق سحب الفوجوك بعدها (ستُخلط مع المرموق عند نفاد ورق التوزيع)' };
    }
    this.roundManager.jokerIndicator = null; // حرمان الباقين بعد سحبها
    player.hand.push(fojok);
    if (player.displayCards) player.displayCards.push(fojok);
    /* [V19.2] تتبع الفوجوك المسحوبة: رميها في نفس الدور = جزاء 51
       وتصبح ورقة مرموق عادية في الكومة */
    player.drawnFojokCard = fojok;
    this.roundManager.turnPhase = 'WAITING_DISCARD';
    return { success: true, card: fojok, isFojok: true };
  }

      _doOpen(player, cardIds, meldGroups) {
    let meldObjects = [];
    /* [PLAN-EXACT] مجموعات صريحة (خطة البوت الخبيرة): تُبنى حرفياً بلا إعادة
       تقسيم — يستحيل اختلاف التنفيذ عن القرار. كل مجموعة تُتحقق كنسق صالح. */
    if (meldGroups && meldGroups.length) {
      const exact = [];
      let allOk = true;
      for (const grp of meldGroups) {
        const cards = grp.map(id => player.getCard(id)).filter(c => c);
        if (cards.length < 3 || cards.length !== grp.length) { allOk = false; break; }
        if (this.rules.isValidSet(cards, true)) exact.push(new RamiMeld(MELD_TYPE.SET, cards.slice()));
        else if (this.rules.isValidSequence(cards, true)) exact.push(new RamiMeld(MELD_TYPE.SEQUENCE, ramiOrderSequenceCards(cards.slice(), c => this.rules.isWildCard(c))));
        else { allOk = false; break; }
      }
      if (allOk && exact.length) meldObjects = exact;
    }
    const adapter = (typeof window !== 'undefined' && (window.RamiAdapter || window.RAMI_ADAPTER)) ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;

    /* [V29] الموزع لا يفتتح في دوره الأول (ملزم بالسحب من ورق التوزيع قبل الافتتاح) */
    if (player.id === this.roundManager.dealerIndex && this.roundManager.dealerFirstCycle) {
      return { success: false, error: 'لا يمكن للموزع الافتتاح في دوره الأول — يجب السحب من ورق التوزيع أولاً' };
    }

    /* الخانات الخمس تنتمي للاعب البشري فقط — لا يجوز أبداً للـ AI أن يستخدمها.
       لكل لاعب تُشتق المجموعات من يده هو (player.hand) حصراً. */
    const isHuman = !player.isBot;

    // 1. إذا تم تحديد بطاقات معينة
    if (cardIds && cardIds.length >= 3) {
      const ids = new Set(cardIds);
      /* [V29] للبشري: تُبنى المجموعة من الأوراق المحددة مباشرة (بغضّ النظر عن الخانة)،
         مع بقاء الجوكر في موضعه الذي وضعه اللاعب. لا إدراج تلقائي لأي ورقة أخرى. */
      if (isHuman) {
        const selCards = cardIds.map(id => player.getCard(id)).filter(c => c);
        if (selCards.length >= 3) {
          if (this.rules.isValidSet(selCards, true)) {
            meldObjects.push(new RamiMeld(MELD_TYPE.SET, selCards.slice()));
          } else if (this.rules.isValidSequence(selCards, true)) {
            const ordered = ramiOrderSequenceCards(selCards.slice(), c => this.rules.isWildCard(c));
            meldObjects.push(new RamiMeld(MELD_TYPE.SEQUENCE, ordered));
          }
        }
      }
      /* [BOT-OPEN-FIX] كان هنا فرع يقرأ خانات البشري (adapter.handSlots) للبوت — خطأ.
         للبوت وللبشري على السواء: إن لم تُبنَ مجموعة مباشرة من التحديد،
         جرّب تقسيم 'opening' أولاً (نفس ما تحقق منه الخبير) ثم تقسيم التغطية،
         واختر الصالح منهما لشروط الافتتاح */
      if (meldObjects.length === 0) {
        const cards = cardIds.map(id => player.getCard(id)).filter(c => c);
        if (!player.hasOpened) {
          const candA = partitionSelectedCards(cards, this.rules, 'opening');
          const candB = partitionSelectedCards(cards, this.rules);
          const okA = candA && candA.length && this.rules.validateOpening(candA, player.drawnDiscardCard, this.roundManager.jokerIndicator, this.roundManager.highestOpeningScore || 0, player.tookLaTour).valid;
          const okB = candB && candB.length && this.rules.validateOpening(candB, player.drawnDiscardCard, this.roundManager.jokerIndicator, this.roundManager.highestOpeningScore || 0, player.tookLaTour).valid;
          meldObjects = okA ? candA : (okB ? candB : ((candA && candA.length) ? candA : (candB || [])));
        } else {
          meldObjects = partitionSelectedCards(cards, this.rules);
        }
      }
    }

    // 2. للبشري فقط: إذا لم تكن هناك مجموعات محددة، نفحص الخانات الـ 5 المرتبة
    if (meldObjects.length === 0 && isHuman && adapter && adapter.handSlots) {
      /* الخانات اليدوية فقط (باستثناء الأوراق المنزلة سابقاً) */
      const activeSlots = (typeof adapter._activeHandSlots === 'function') ? adapter._activeHandSlots() : adapter.handSlots;
      for (let s = 0; s < 5; s++) {
        const slotCards = activeSlots[s];
        if (slotCards && slotCards.length >= 3) {
          if (this.rules.isValidSet(slotCards, true)) {
            meldObjects.push(new RamiMeld(MELD_TYPE.SET, slotCards.slice()));
          } else if (this.rules.isValidSequence(slotCards, true)) {
            const ordered = ramiOrderSequenceCards(slotCards.slice(), c => this.rules.isWildCard(c));
            meldObjects.push(new RamiMeld(MELD_TYPE.SEQUENCE, ordered));
          } else {
            /* [V29] إن لم تكن الخانة كلها مجموعة صالحة، ابحث عن مجموعة صالحة ضمنها
               (اللاعب عزل أوراقه في خانة خاصة لكنها قد تتضمن ورقة زائدة) */
            const found = partitionSelectedCards(slotCards, this.rules);
            for (const fm of found) {
              if (fm.type === MELD_TYPE.SEQUENCE) {
                fm.cards = ramiOrderSequenceCards(fm.cards.slice(), c => this.rules.isWildCard(c));
              }
              meldObjects.push(fm);
            }
          }
        }
      }
    }

    // 3. [V29] التقسيم الاحتياطي لكامل اليد يُستعمل للافتتاح الأولي فقط —
    //    لا للاعب المفتوح (منع الإنزال/الإدراج التلقائي غير المقصود)
    if (meldObjects.length === 0 && !player.hasOpened) {
      /* الورقة المعزولة تُستثنى من مجموعات الافتتاح */
      const handForOpen = (adapter && adapter.isolateCardId) ? player.hand.filter(c => c.id !== adapter.isolateCardId) : player.hand;
      meldObjects = partitionSelectedCards(handForOpen, this.rules);
    }

    if (meldObjects.length === 0) {
      /* [OPEN-DEFER] سامبل وطالاج: الإظهار الخاطئ لا يُحتسب فوراً — يُؤكَّد الخطأ
         فقط بعد رمي ورقة التخلص (للاعب مهلة إصلاح إظهاره في نفس الدور).
         مسار طالاج مع مرموق مسحوب يُحسم أصلاً في _doDiscard (استرجاع + جزاء). */
      if (!player.hasOpened) {
        player.pendingOpenError = 'لا توجد مجموعات صالحة للإنزال';
        return { success: false, deferred: true, error: 'لا توجد مجموعات صالحة للإنزال (تحتاج 3 بطاقات متتالية أو متماثلة على الأقل) — أصلح إظهارك قبل الرمي وإلا احتُسب الجزاء عند التخلص' };
      }
      return { success: false, error: 'لا توجد مجموعات صالحة للإنزال (تحتاج 3 بطاقات متتالية أو متماثلة على الأقل)' };
    }

    // إذا كان اللاعب قد افتتح بالفعل في دور سابق، يمكنه إنزال أي مجموعات جديدة صالحة
    if (player.hasOpened) {
      const allIds = new Set(meldObjects.flatMap(m => m.cards.map(c => c.id)));
      /* [R15-FIX] الإنزال الذي يفرغ اليد تماماً (بلا ورقة إنهاء تُرمى) غير قانوني */
      if (player.hand.filter(c => !allIds.has(c.id)).length === 0) {
        return { success: false, error: 'لا يجوز إنزال كل الأوراق — يجب الاحتفاظ بورقة الإنهاء' };
      }
      player.hand = player.hand.filter(c => !allIds.has(c.id));
      /* الأوراق المنزلة تبقى في خاناتها (تُحاط بحلقة ذهبية) — لا تُحذف من العرض */

      /* [V19.5] «الحرة تبقى حرة في دور الافتتاح فقط» — الإنزال الموالي للاعب
         المفتوح أصلاً لا يحمل وسم الحماية: يجوز فيه إدراج الجوكر وورقة المرموق
         المسحوبة فوراً (بما أن إنزالها ضمن المجموعة دفعة واحدة قانوني أصلاً) */
      player.melds = player.melds.concat(meldObjects);
      this.roundManager.tableMelds.push(...meldObjects);

      // إذا كانت ورقة المرموق/لا تور المسحوبة ضمن الأوراق المنزلة، تُسقَط إلزامية إنزالها
      if (player.drawnDiscardCard && allIds.has(player.drawnDiscardCard.id)) {
        player.drawnDiscardCard = null;
        player.tookLaTour = false;
      }
      if (player.drawnLaTourCard && allIds.has(player.drawnLaTourCard.id)) {
        player.drawnLaTourCard = null;
        player.tookLaTour = false;
      }

      // إذا فرغت اليد أو تبقت ورقة واحدة للرمي: إنهاء الشوط فوراً
      if (player.hand.length <= 1) {
        let iso = null;
        if (player.hand.length === 1) {
          iso = player.hand.pop();
          this.roundManager.discardPile.push(iso);
        }
        this._setJokerDoubleIfFree(iso);
        this._endRound(player);
        return { success: true, finished: true, melds: meldObjects };
      }

      if (adapter) adapter.isolateCardId = null; /* الورقة المعزولة تعود لليد للتخلص منها */
      return { success: true, melds: meldObjects, isSubsequent: true };
    }

    // الافتتاح الأولي: فحص شروط الافتتاح (متتالية نقية + متماثلة نقية + مجموع نقاط)
    const highestPrev = this.roundManager.highestOpeningScore || 0;
    const checkResult = this.rules.validateOpening(
      meldObjects,
      player.drawnDiscardCard,
      this.roundManager.jokerIndicator,
      highestPrev,
      player.tookLaTour
    );

    if (!checkResult.valid) {
      /* [OPEN-DEFER] سامبل وطالاج: خطأ شروط الافتتاح لا يُحتسب إلا بعد التخلص من ورقة —
         للاعب مهلة سحب إظهاره وإصلاحه في نفس الدور. التأكيد والجزاء في _doDiscard.
         (طالاج مع مرموق مسحوب: الاسترجاع + الجزاء يقعان هناك أيضاً عند الرمي) */
      if (!player.hasOpened) {
        player.pendingOpenError = checkResult.error || 'الأوراق لا تستوفي شروط الافتتاح';
      }
      return {
        success: false,
        deferred: !player.hasOpened,
        error: (checkResult.error || ('الأوراق لا تستوفي شروط الافتتاح — يلزم متتالية ومتماثلة نقيتين بمجموع ≥ ' + this.rules.openingThreshold + ' نقطة بدون جوكر'))
          + ' — أصلح إظهارك قبل رمي ورقة التخلص وإلا احتُسب الجزاء'
      };
    }

    /* [R15-FIX] قانون الإنهاء: تبقى ورقة الإنهاء دائماً — لا يجوز إنزال اليد كاملة
       (15 ورقة في 5 مجموعات = غير قانوني؛ الصحيح 14 في مجموعات + ورقة تُرمى) */
    {
      const openIds = new Set(meldObjects.flatMap(m => m.cards.map(c => c.id)));
      const leftAfter = player.hand.filter(c => !openIds.has(c.id)).length;
      if (leftAfter === 0) {
        return { success: false, error: 'لا يجوز إنزال كل الأوراق — يجب الاحتفاظ بورقة الإنهاء (14 ورقة في مجموعات + ورقة تُرمى)' };
      }
    }
    // الافتتاح الأولي ناجح!
    player.pendingOpenError = null;   /* [OPEN-DEFER] إظهار صالح يمحو أي خطأ معلق */
    player.drawnDiscardCard = null;
    player.drawnLaTourCard = null;
    player.tookLaTour = false;

    if (checkResult.score > (this.roundManager.highestOpeningScore || 0)) {
      this.roundManager.highestOpeningScore = checkResult.score;
      this.roundManager.highestOpeningPlayer = player;
    }

    // إزالة الأوراق المنزلة من يد اللاعب (تبقى ظاهرة في خاناتها بحلقة ذهبية)
    const allIds = new Set(meldObjects.flatMap(m => m.cards.map(c => c.id)));
    player.hand = player.hand.filter(c => !allIds.has(c.id));

    /* [V19.2] المجموعة الحرة تبقى حرة في دور الافتتاح فقط — بعده يجوز إدراج
       الجوكر/المرموق فيها (الوسم يسقط في nextPlayer) */
    meldObjects.forEach(m => { m._justOpened = true; });
    player.melds = player.melds.concat(meldObjects);
    player.hasOpened = true;
    this.roundManager.tableMelds.push(...meldObjects);

    // إذا تم إنزال كامل اليد (14 ورقة) وتبقت ورقة واحدة أو صفر: إنهاء الشوط فوراً
    if (player.hand.length <= 1) {
      let iso = null;
      if (player.hand.length === 1) {
        iso = player.hand.pop();
        this.roundManager.discardPile.push(iso);
      }
      this._setJokerDoubleIfFree(iso);
      this._endRound(player);
      return { success: true, finished: true, melds: meldObjects, score: checkResult.score };
    }

    if (adapter) adapter.isolateCardId = null; /* الورقة المعزولة تعود لليد للتخلص منها */
    this.roundManager.turnPhase = 'WAITING_DISCARD';
    return { success: true, melds: meldObjects, score: checkResult.score };
  }

  _doDiscard(player, cardId) {
    if (this.roundManager.turnPhase !== 'WAITING_DISCARD') {
      return { success: false, error: 'يجب سحب ورقة أولاً من المجرف أو المرموق قبل رمي ورقة التخلص' };
    }

    // قاعدة سحب المهملات و«لا تور» الصارمة (طالاج فقط): لا يجوز سحب ورقة المهملات أو لا تور والاحتفاظ بها دون افتتاح أو إنهاء الشوط أو دمجها
    // [V19] السامبل: اللاعب حر في سحب المرموق والاحتفاظ به بلا جزاء —
    // الورقة تبقى «غير حرة» هذا الدور فقط (لا تدخل متتالية/متماثلة حرة في افتتاح أو إنهاء
    // نفس الدور)، وتصبح حرة تماماً في الأدوار الموالية.
    // [V19.2] رمي ورقة المرموق أو الفوجوك المسحوبة في نفس الدور = مسموح لكنه خطأ:
    // جزاء +51 يضاف على مجموع نقاط الجولة في نهاية الشوط.
    if (this.rules.mode !== 'talaj' && (player.tookLaTour || player.drawnDiscardCard || player.drawnFojokCard)) {
      const freedCard = player.drawnDiscardCard || player.drawnLaTourCard;
      const fojokCard = player.drawnFojokCard || null;
      if (freedCard && cardId === freedCard.id) {
        /* رمى ورقة المرموق التي سحبها الآن → جزاء 51 والورقة تعود للكومة عادية */
        this._applyPenalty(player, 'SAME_TURN_THROWBACK', freedCard.displayName || '');
        freedCard.fromDiscard = false; freedCard.fromLaTour = false;
        _ramiToast('⚠️ رميت ورقة المرموق التي سحبتها في نفس الدور — جزاء +' + this.rules.finishPenalty + ' نقطة يضاف لمجموعك في نهاية الشوط', 'warn');
      } else if (fojokCard && cardId === fojokCard.id) {
        /* [V19.2] رمى الفوجوك التي سحبها الآن → جزاء 51، وتتحول لورقة مرموق عادية:
           لا يحق للاعبين الآخرين سحبها كفوجوك — إلا صاحب الدور التالي كمرموق عادي */
        this._applyPenalty(player, 'SAME_TURN_THROWBACK', (fojokCard.displayName || '') + ' (فوجوك)');
        fojokCard.fromDiscard = false; fojokCard.fromLaTour = false;
        _ramiToast('⚠️ رميت الفوجوك التي سحبتها في نفس الدور — جزاء +' + this.rules.finishPenalty + ' نقطة، وأصبحت ورقة مرموق عادية للاعب التالي', 'warn');
      }
      if (freedCard) { freedCard.fromDiscard = false; freedCard.fromLaTour = false; } /* تتحرر بنهاية الدور */
      player.tookLaTour = false;
      player.drawnLaTourCard = null;
      player.drawnDiscardCard = null;
      player.drawnFojokCard = null;
    }
    if (player.tookLaTour || player.drawnDiscardCard) {
      const adapter = (typeof window !== 'undefined' && (window.RamiAdapter || window.RAMI_ADAPTER)) ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
      const penaltyCard = player.drawnDiscardCard || player.drawnLaTourCard;

      if (penaltyCard) {
        const retCard = player.removeCard(penaltyCard.id);
        if (retCard) {
          this.roundManager.discardPile.push(retCard);
          if (player.displayCards) player.displayCards = player.displayCards.filter(c => c.id !== penaltyCard.id);
        }
        if (adapter && adapter.handSlots) {
          for (let s = 0; s < 5; s++) {
            adapter.handSlots[s] = adapter.handSlots[s].filter(c => c.id !== penaltyCard.id);
          }
        }
      }

      player.tookLaTour = false;
      player.drawnLaTourCard = null;
      player.drawnDiscardCard = null;
      player.pendingOpenError = null;   /* [OPEN-DEFER] جزاء واحد فقط — لا تراكم مع خطأ الإظهار المعلق */
      this._applyPenalty(player, 'DISCARD_DRAW', '');

      _ramiToast('⚠️ مخالفة: سحبت ورقة المرموق دون إنزالها في مجموعة أو دمجها في الطاولة — تم استرجاع الورقة وتسجيل جزاء +' + this.rules.finishPenalty + ' نقطة وتمرير الدور للاعب التالي!', 'err');
      
      if (adapter) {
        adapter.selectedCards.clear();
        adapter._updateUI();
      }

      this.roundManager.nextPlayer();
      return { success: false, penaltyApplied: true, error: 'مخالفة سحب المرموق دون إنزال — تم تطبيق جزاء +' + this.rules.finishPenalty + ' واسترجاع الورقة' };
    }

    const card = player.removeCard(cardId);
    if (!card) return { success: false, error: 'بطاقة غير موجودة في اليد' };
    if (player.displayCards) player.displayCards = player.displayCards.filter(c => c.id !== cardId);

    /* [OPEN-DEFER] تأكيد خطأ الإظهار/الافتتاح المعلق: اللاعب رمى ورقة التخلص
       دون إصلاح إظهاره الخاطئ ⇒ الآن فقط يُحتسب جزاء الافتتاح (+71) حسب القواعد */
    if (!player.hasOpened && player.pendingOpenError) {
      this._applyPenalty(player, 'OPEN_ERROR', player.pendingOpenError);
      _ramiToast('⚠️ تأكد خطأ الإظهار بعد التخلص: ' + player.pendingOpenError + ' — جزاء +' + this.rules.finishPenalty + ' نقطة', 'err');
      player.pendingOpenError = null;
    } else {
      player.pendingOpenError = null;
    }
    
    // إذا كانت هذه أول ورقة مرمية في الشوط (من الموزع)، تُعيّن كورقة «لا تور» — طالاج فقط
    // [V19] السامبل: لا «لا تور» — دور الورقة الأولى تلعبه الفوجوك المقلوبة من ورق التوزيع
    if (this.rules.mode === 'talaj' && this.roundManager.discardPile.length === 0 && !this.roundManager.laTourCard) {
      this.roundManager.laTourCard = card;
      this.roundManager.isFirstTourCycle = true;
    }

    // فحص قانون الـ 12 ورقة للاعب التالي (إذا كان اللاعب التالي قد أنزل 12 ورقة أو أكثر)
    const nextPlayerIdx = (this.roundManager.currentPlayerIndex + 1) % this.players.length;
    const nextPlayer = this.players[nextPlayerIdx];
    const nextBarredFromDiscard = nextPlayer && (nextPlayer.hand.length === 1 || nextPlayer.meldCount() >= 13);
    if (this.rules.mode === 'talaj' && nextPlayer && nextPlayer.meldCount() >= 12 && !nextBarredFromDiscard) {
      if (this.doesCardFitAnyTableMeld(card)) {
        this.roundManager.feederDiscard = { feederId: player.id, receiverId: nextPlayer.id, cardId: card.id };
      }
    }

    player.drawnDiscardCard = null;
    player.drawnLaTourCard = null;
    player.drawnFojokCard = null;
    player.tookLaTour = false;

    this.roundManager.discardPile.push(card);

    /* التحقق من إنهاء الجولة تلقائياً إذا كانت اليد فارغة أو بعد إنزال الأوراق */
    if (player.hand.length === 0) {
      this._setJokerDoubleIfFree(card);
      this._endRound(player);
      return { success: true, finished: true, card: card };
    }

    this.roundManager.nextPlayer();
    return { success: true, card: card };
  }

  _doFinish(player, move) {
    const adapter = (typeof window !== 'undefined' && (window.RamiAdapter || window.RAMI_ADAPTER)) ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;

    // الحالة 1: اليد فارغة أو تبقى ورقة واحدة فقط للرمي
    if (player.hand.length <= 1) {
      let iso = null;
      if (player.hand.length === 1) {
        iso = player.hand.pop();
        this.roundManager.discardPile.push(iso);
      }
      this._setJokerDoubleIfFree(iso);
      this._endRound(player);
      return { success: true, finished: true };
    }

    // الحالة 2: دمج الأوراق المتبقية التي تطابق مجموعات الطاولة
    if (player.hasOpened && this.roundManager.tableMelds.length > 0) {
      let laidOffAny = false;
      const handCopy = player.hand.slice();
      for (const card of handCopy) {
        /* [R15-FIX] قانون ورقة الإنهاء: الدمج يقف عند ورقة واحدة — تُرمى ولا تُدمج
           (تفريغ اليد كلياً بالدمج = إنهاء بلا ورقة إنهاء = مخالف للقواعد) */
        if (player.hand.length <= 1) break;
        for (const meld of this.roundManager.tableMelds) {
          /* [V19.2] الدمج التلقائي لا يُدخل جوكراً/مرموق الدور في مجموعة حرة
             أُنزلت هذا الدور — الحرة تبقى حرة في دور إنزالها فقط */
          if (meld._justOpened && !meld.cards.some(c => this.rules.isWildCard(c))) {
            if (this.rules.isWildCard(card)) continue;
            if (player.drawnDiscardCard && card.id === player.drawnDiscardCard.id) continue;
          }
          const temp = meld.cards.concat([card]);
          let canAdd = false;
          if (meld.type === MELD_TYPE.SET && this.rules.isValidSet(temp, true)) canAdd = true;
          if (meld.type === MELD_TYPE.SEQUENCE && this.rules.isValidSequence(temp, true)) canAdd = true;
          
          if (canAdd) {
            player.removeCard(card.id);
            meld.cards.push(card);
            laidOffAny = true;
            /* الورقة المركّبة تبقى ظاهرة في خانتها بحلقة ذهبية */
            break;
          }
        }
      }
      if (player.hand.length <= 1) {
        let iso = null;
        if (player.hand.length === 1) {
          iso = player.hand.pop();
          this.roundManager.discardPile.push(iso);
        }
        this._setJokerDoubleIfFree(iso);
        this._endRound(player);
        return { success: true, finished: true };
      }
    }

    // الحالة 3: إنهاء الشوط بإنزال ما تبقّى من اليد على شكل مجموعات صالحة
    // نجمع المجموعات المرشحة: من خانات اللاعب المرتبة أولاً، ثم من تقسيم كامل اليد كاحتياط
    let candidateMelds = [];
    if (adapter && adapter.handSlots) {
      const activeSlots = (typeof adapter._activeHandSlots === 'function') ? adapter._activeHandSlots() : adapter.handSlots;
      for (let s = 0; s < 5; s++) {
        const slotCards = activeSlots[s];
        if (slotCards && slotCards.length >= 3) {
          if (this.rules.isValidSet(slotCards, true)) {
            candidateMelds.push(new RamiMeld(MELD_TYPE.SET, slotCards.slice()));
          } else if (this.rules.isValidSequence(slotCards, true)) {
            /* [V21] ترتيب المتتالية: الأصغر يميناً ثم الأكبر شمالاً، والجوكر في موضع الناقص */
            const ordered = ramiOrderSequenceCards(slotCards.slice(), c => this.rules.isWildCard(c));
            candidateMelds.push(new RamiMeld(MELD_TYPE.SEQUENCE, ordered));
          }
        }
      }
    }

    /* ورقة معزولة (من خانة العزل ♛ بجنب تاج التوزيع): تُستثنى من المجموعات وتُقلب
       كالورقة الأخيرة. تصل عبر move.isolateCardId (للبثّ الجماعي) أو adapter.isolateCardId (محلياً). */
    const isoId = (move && move.isolateCardId != null) ? move.isolateCardId : (adapter ? adapter.isolateCardId : null);
    const effectiveIso = isoId || null;
    const handForMelds = effectiveIso ? player.hand.filter(c => c.id !== effectiveIso) : player.hand;

    const partitionMelds = partitionSelectedCards(handForMelds, this.rules);
    const slotCoverage = candidateMelds.reduce((sum, m) => sum + m.cards.length, 0);
    const partitionCoverage = partitionMelds.reduce((sum, m) => sum + m.cards.length, 0);

    /* احترام ترتيب اللاعب: إن كانت خاناته تشكّل إنهاءً قانونياً تُعتمد كما هي —
       مع الورقة المعزولة كالورقة الأخيرة بدل امتصاصها في المجموعات */
    const needLeftover = effectiveIso ? 0 : 1;
    let useSlotsAsIs = false;
    if (candidateMelds.length > 0) {
      const slotIds = new Set(candidateMelds.flatMap(m => m.cards.map(c => c.id)));
      const slotLeftover = handForMelds.filter(c => !slotIds.has(c.id));
      if (slotLeftover.length === needLeftover) useSlotsAsIs = true;
    }
    if (!useSlotsAsIs && partitionCoverage > slotCoverage) candidateMelds = partitionMelds;

    if (candidateMelds.length === 0) {
      return { success: false, error: 'لا يمكن إنهاء الشوط — لا توجد مجموعات صالحة (3 أوراق متتالية أو متماثلة على الأقل) بين أوراق يدك المتبقية' };
    }

    const meldedIds = new Set(candidateMelds.flatMap(m => m.cards.map(c => c.id)));
    const leftover = handForMelds.filter(c => !meldedIds.has(c.id));

    // يجب أن تغطي المجموعات اليد كلها ما عدا ورقة واحدة معزولة للتخلص منها (أو صفر إن وُجدت ورقة معزولة في خانة العزل)
    if (leftover.length !== needLeftover) {
      return {
        success: false,
        error: leftover.length === 0
          ? 'لا يمكن إنهاء الشوط — يجب عزل الورقة الـ15 وحدها (إنزال 14 ورقة في مجموعات صالحة + ورقة معزولة تُقلب ظهراً)؛ إنزال الـ15 كاملة مرفوض. ضع ورقة واحدة في خانة العزل ♛ بجنب تاج التوزيع'
          : 'لا يمكن إنهاء الشوط — تبقّى ' + leftover.length + ' أوراق خارج المجموعات. يجب أن تشكّل أوراق يدك مجموعات كاملة صالحة وتتبقى ورقة واحدة فقط للتخلص منها (' + (this.rules.mode === 'talaj' ? 'الطالاج' : 'السامبل') + ')'
      };
    }

    // ورقة المرموق / لا تور المسحوبة في هذا الدور يجب إنزالها ضمن المجموعات (طالاج فقط)
    // [V19] السامبل: لا التزام — لكن لا يجوز أن تكون هي ورقة الإنهاء الـ14 المرمية
    const drawnCard = player.drawnDiscardCard || player.drawnLaTourCard || null;
    if (this.rules.mode !== 'talaj' && drawnCard && !meldedIds.has(drawnCard.id)) {
      return { success: false, error: 'لا يمكن إنهاء الشوط بإرجاع ورقة المرموق التي سحبتها هذا الدور — يجب أن تكون ضمن المجموعات أو أنهِ بورقة أخرى' };
    }
    if (this.rules.mode === 'talaj' && drawnCard && !meldedIds.has(drawnCard.id)) {
      player.removeCard(drawnCard.id);
      this.roundManager.discardPile.push(drawnCard);
      if (player.displayCards) player.displayCards = player.displayCards.filter(c => c.id !== drawnCard.id);
      player.drawnDiscardCard = null;
      player.drawnLaTourCard = null;
      player.tookLaTour = false;
      this._applyPenalty(player, 'DISCARD_DRAW', 'عند إنهاء الشوط');
      if (adapter && adapter.handSlots) {
        for (let s = 0; s < 5; s++) adapter.handSlots[s] = adapter.handSlots[s].filter(c => c.id !== drawnCard.id);
      }
      this.roundManager.nextPlayer();
      return { success: false, penaltyApplied: true, penalty: this.rules.finishPenalty, error: 'مخالفة: ورقة المرموق المسحوبة يجب إنزالها ضمن المجموعات — تم استرجاعها وتطبيق جزاء +' + this.rules.finishPenalty + ' وتمرير الدور' };
    }

    /* [V28] شروط الإنهاء الأساسية: متتالية حرة + متماثلة حرة خاليتان من الجوكر والمرموق.
       عتبة الـ71 (شروط الافتتاح) لا تُطبَّق هنا — بل في مسار الافتتاح فقط. */
    const finishStruct = this.rules.validateFinishStructure(candidateMelds, player.drawnDiscardCard);
    if (!finishStruct.valid) {
      return {
        success: false,
        error: 'لا يمكن إنهاء الشوط — يجب أن تتضمن مجموعاتك متتالية حرة ومتماثلة حرة خاليتين تماماً من الجوكر وورقة المرموق'
      };
    }
    player.hasOpened = true;

    // إنزال المجموعات على الطاولة
    player.hand = player.hand.filter(c => !meldedIds.has(c.id));
    player.melds = player.melds.concat(candidateMelds);
    this.roundManager.tableMelds.push(...candidateMelds);
    /* الأوراق المنزلة تبقى ظاهرة في خاناتها بحلقة ذهبية */

    // التخلص من الورقة الأخيرة في المرموق (المعزولة إن وُجدت، أو الوحيدة المتبقية)
    let iso = null;
    if (player.hand.length === 1) {
      iso = player.hand.pop();
      this.roundManager.discardPile.push(iso);
    }
    this._setJokerDoubleIfFree(iso);
    if (adapter) adapter.isolateCardId = null; /* إفراغ خانة العزل بعد الإنهاء */

    this._endRound(player);
    return { success: true, finished: true };
  }

  canFinish(player) {
    if (!player || !player.hand) return false;
    if (player.hand.length <= 1) return true;

    let melds = partitionSelectedCards(player.hand, this.rules, 'opening');
    if (!melds || melds.length === 0) melds = partitionSelectedCards(player.hand, this.rules);
    if (!melds || melds.length === 0) return false;

    const ids = new Set();
    for (const m of melds) for (const c of m.cards) ids.add(c.id);
    const leftover = player.hand.filter(c => !ids.has(c.id));
    /* يجب عزل الورقة الـ15 وحدها — إنزال الـ15 كاملة لا يُعدّ إنهاءً قانونياً */
    if (leftover.length !== 1) return false;

    // ورقة المرموق/لا تور المسحوبة يجب أن تكون ضمن المجموعات
    const drawnCard = player.drawnDiscardCard || player.drawnLaTourCard || null;
    if (drawnCard && !ids.has(drawnCard.id)) return false;

    /* [V28] شروط الإنهاء الأساسية: متتالية حرة + متماثلة حرة (خاليتان من الجوكر والمرموق)
       + 14 ورقة في مجموعات + ورقة معزولة. عتبة الـ71 لا تُطبَّق هنا —
       تُطبَّق فقط في مسار الإنهاء عبر الافتتاح (إنزال 8+ + إدراج الباقي في مجموعات الخصوم). */
    const struct = this.rules.validateFinishStructure(melds, player.drawnDiscardCard);
    if (!struct.valid) return false;
    return true;
  }

  /* ═══ جدول الجزاءات الثابت: اسم القاعدة + قيمتها — يُطبَّق على الإنسان والـAI على حد سواء ═══ */
  penaltyValue(ruleKey) {
    switch (ruleKey) {
      case 'OPEN_ERROR':        // خطأ في شروط الافتتاح
      case 'DISCARD_DRAW':      // سحب المرموق دون إنزالها
      case 'SAME_TURN_THROWBACK': // [V19.2] رمي المرموق/الفوجوك المسحوبة في نفس الدور
        return this.rules.finishPenalty;   // 71 طلاج / 51 سامبل
      case 'RULE_12_IGNORED':   // قانون الـ 12 ورقة: غفلت عن ورقة مطابقة
      case 'RULE_12_FED':       // قانون الـ 12 ورقة: رميت ورقة غذّت منزلاً 12 ورقة
        return 71;                         // قيمة ثابتة في القانون
      default:
        return 0;
    }
  }

  penaltyLabel(ruleKey) {
    const labels = {
      OPEN_ERROR: 'خطأ في شروط الافتتاح',
      DISCARD_DRAW: 'سحب المرموق دون إنزالها',
      SAME_TURN_THROWBACK: 'رمي ورقة المرموق/الفوجوك المسحوبة في نفس الدور',
      RULE_12_IGNORED: 'قانون الـ 12 ورقة: غفلت عن سحب ورقة المرموق المطابقة',
      RULE_12_FED: 'قانون الـ 12 ورقة: رميت ورقة غذّت لاعباً منزلاً 12 ورقة'
    };
    return labels[ruleKey] || ruleKey;
  }

  /* تسجيل جزاء موحّد مع اسم القاعدة وقيمتها */
  _applyPenalty(player, ruleKey, detail) {
    const val = this.penaltyValue(ruleKey);
    player.penaltyScore = (player.penaltyScore || 0) + val;
    if (!player.penaltyReasons) player.penaltyReasons = [];
    player.penaltyReasons.push({ rule: ruleKey, label: this.penaltyLabel(ruleKey), value: val, detail: detail || '' });
  }

  /* إنهاء الشوط بجوكر حر معزول كالورقة الـ15 (مسحوب من ورق التوزيع، لا من المرموق/لا تور)
     ⇒ تضاعف نقاط الأوراق المتبقية/اليد الكاملة على الخاسرين، دون مضاعفة جزاء الخطأ.
     [2026-09-12] «الجوكر» هنا = الجوكر المطبوع (طالاج) أو البرية المعكوسة (سامبل) —
     المستخدم نصّ على العمل في الوضعين */
  _setJokerDoubleIfFree(isolatedCard) {
    if (!isolatedCard) return;
    const isJokerish = isolatedCard.isJoker ||
      (this.rules && typeof this.rules.isWildCard === 'function' && this.rules.isWildCard(isolatedCard));
    if (isJokerish && !isolatedCard.fromDiscard && !isolatedCard.fromLaTour) {
      this.roundManager.jokerDouble = true;
    }
  }

  _endRound(winner) {
    /* حراسة: لا يُحسب الشوط مرتين (منع مضاعفة النقاط) */
    if (this.gamePhase === 'ROUND_END' || this.gamePhase === 'MATCH_END') return;
    this.gamePhase = 'ROUND_END';
    this.roundManager.lastWinner = winner;

    /* تضاعف الشوط: إن أنهى الفائز بجوكر حر معزول كالورقة الـ15 تُضاعف نقاط
       الأوراق المتبقية / اليد الكاملة للخاسرين، دون مضاعفة جزاء الخطأ */
    const doubled = !!this.roundManager.jokerDouble;
    this.roundManager.jokerDouble = false;

    /* نموذج نقاط واحد متسق:
       - الفائز بالشوط: 0 نقطة أوراق متبقية.
       - من لم يفتتح إطلاقاً: عقوبة اليد الكاملة (طلاج 100 / سامبل 51).
       - المفتوح: مجموع قيم الأوراق المتبقية (الطلاج: 10 ثابتة/ورقة؛ السامبل: قيمة وجهية بحد 51).
       - عند التضاعف: تُضاعف هذه النقاط الأساسية فقط.
       - ثم تُضاف الجزاءات المسجلة خلال الشوط (لا تُضاعف أبداً).
       التفصيل الكامل لكل لاعب يُحفظ في lastRoundDetail. */
    for (const p of this.players) {
      let roundPts = 0;
      let detail = { kind: 'winner', cardsCount: 0, cardsValue: 0, penalty: 0, total: 0 };
      if (winner && p.id === winner.id) {
        roundPts = 0;
        detail.kind = 'winner';
      } else if (!p.hasOpened) {
        roundPts = this.rules.fullHandPenalty;
        detail = { kind: 'unopened', cardsCount: p.hand.length, cardsValue: 0, penalty: 0, total: roundPts };
      } else {
        let sum = 0;
        if (this.mode === 'talaj') {
          /* الطلاج: كل ورقة متبقية = 10 نقاط ثابتة بغضّ النظر عن رقمها */
          sum = p.hand.length * 10;
        } else {
          /* السامبل [S4]: الأرقام 1–10 بقيمتها الوجهية، J/Q/K/A وورقة الجوكر المعينة = 10،
             وإن تجاوز المجموع 51 = +51 */
          for (const card of p.hand) {
            sum += this.rules.isWildCard(card) ? 10 : card.baseValue;
          }
          if (sum > 51) sum = 51;
        }
        roundPts = sum;
        detail = { kind: 'opened', cardsCount: p.hand.length, cardsValue: sum, penalty: 0, total: sum };
      }
      if (doubled && (!winner || p.id !== winner.id)) {
        roundPts *= 2;
        detail.doubled = true;
        detail.total = roundPts;
      }
      p.lastRoundPoints = roundPts;
      p.lastRoundDetail = detail;
      p.totalScore += roundPts;
    }

    /* الجزاءات لا تسقط أبداً: تُقيّد على صاحبها وتُضاف للمجموع التراكمي ولو أنهى الشوط أو فاز به */
    for (const p of this.players) {
      const pen = p.penaltyScore || 0;
      const reasons = (p.penaltyReasons || []).slice();
      p.lastPenalty = pen;
      p.lastPenaltyReasons = reasons;
      p.lastRoundTotal = p.lastRoundPoints + pen;
      if (p.lastRoundDetail) {
        p.lastRoundDetail.penalty = pen;
        p.lastRoundDetail.total = p.lastRoundTotal;
      }
      p.totalScore += pen;
      p.penaltyScore = 0;
      p.penaltyReasons = [];
    }

    /* تسجيل سجل الشوط في تاريخ الجولة */
    if (!this.roundManager.roundHistory) this.roundManager.roundHistory = [];
    this.roundManager.roundHistory.push({
      roundNumber: this.roundManager.roundNumber,
      winnerName: winner ? winner.name : (_ramiT('rami.tie', 'تعادل')),
      doubled: doubled,
      playerScores: this.players.map(p => ({
        name: p.name,
        pts: p.lastRoundPoints || 0,   /* نقاط الأوراق فقط (بدون الجزاءات) */
        pen: p.lastPenalty || 0,
        penReasons: (p.lastPenaltyReasons || []).map(r => (typeof r === 'string' ? r : r.label)),
        cardsCount: p.lastRoundDetail ? p.lastRoundDetail.cardsCount : 0,
        cardsValue: p.lastRoundDetail ? p.lastRoundDetail.cardsValue : 0,
        total: p.totalScore
      }))
    });

    /* [V18] الإقصاء عند نهاية الشوط: من تجاوز سقف الجولة يُقصى.
       تنتهي الجولة بفائز واحد فقط: من بقي مجموعُه دون السقف (أو الأقل مجموعاً إذا تجاوز الجميع). */
    for (const p of this.players) {
      p.isEliminated = p.totalScore > this.targetScore;
    }
    const aliveCount = this.players.filter(p => !p.isEliminated).length;
    /* شوط واحد (رهان على شوط واحد): تنتهي المباراة فور انتهاء أول شوط */
    if (aliveCount <= 1 || this.isSingleRound) this.gamePhase = 'MATCH_END';

    /* ملاحظة: انتقال دور التوزيع للاعب التالي يتم في nextRound() فقط — لا تدوير هنا لتجنب القفز بلاعبين */
  }

  /* تصفير اللعبة للجولة التالية */
  nextRound() {
    if (this.gamePhase === 'MATCH_END') return;
    this.gamePhase = 'LOBBY';
    /* [V18] انتقال دور التوزيع للاعب النشط التالي (تخطي المُقصيين) */
    this.roundManager.dealerIndex = this.roundManager.firstActiveFrom(this.roundManager.dealerIndex + 1);
    this.startRound();
    this.gamePhase = 'PLAYING';
  }

  getMatchResult() {
    /* [V18] الفائز الواحد: من بقي مجموعُه دون سقف الجولة؛ إن تجاوز الجميع فالأقل مجموعاً.
       المَقصيون = من تجاوزوا السقف. */
    const over = this.players.filter(p => p.totalScore > this.targetScore);
    const alive = this.players.filter(p => p.totalScore <= this.targetScore);
    let winner = null;
    if (alive.length === 1) {
      winner = alive[0];
    } else if (alive.length === 0) {
      winner = this.players.slice().sort((a, b) => a.totalScore - b.totalScore)[0];
    } else {
      winner = alive.slice().sort((a, b) => a.totalScore - b.totalScore)[0];
    }
    const losers = this.players.filter(p => p.id !== (winner ? winner.id : -1));
    return {
      winners: winner ? [winner] : [],
      losers: losers,
      eliminated: over,
      rankings: this.players.slice().sort((a, b) => a.totalScore - b.totalScore)
    };
  }

  /* إعادة تشغيل اللعبة بالكامل */
  reset() {
    this.seed = Math.floor(Math.random() * 0xFFFFFFFF);
    this.rng = new DeterministicRng(this.seed);
    this.players = [];
    this.gamePhase = 'LOBBY';
    this.roundManager = new RoundManager(this.rules, this.rng);
    this.roundManager.initPlayers(this.playerCount, this.botCount);
    this.players = this.roundManager.players;
  }
}

/* ═══════════════════════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Rami UI Adapter & Interactive Controls
   طاولة كازينو دائرية مقسمة بقطاعات متساوية وخانات تفاعلية
   ═══════════════════════════════════════════════════════════ */

var RAMI_STATE = null;
var RAMI_BET = 50;
var RAMI_BUSY = false;
var RAMI_BUSY_OWNER = null;
var _lastBusyTime = 0;
var _draggedCardId = null;

/* [Safety 2026-09-22] الافتتاح والإنهاء إجراءان قد يطبّقان جزاءً عند الخطأ.
   لا ننفّذ أي حركة من النقرة الأولى: نطلب نقرة ثانية مستقلة خلال 2.5 ثانية. */
var _ramiConfirm = { action: '', at: 0, timer: null };
function ramiConfirmPending(action) {
  return !!(_ramiConfirm.action === action && (Date.now() - _ramiConfirm.at) <= 2500);
}
function clearRamiConfirm() {
  if (_ramiConfirm.timer) { clearTimeout(_ramiConfirm.timer); _ramiConfirm.timer = null; }
  _ramiConfirm.action = '';
  _ramiConfirm.at = 0;
}
function requireRamiConfirm(action) {
  if (ramiConfirmPending(action)) {
    clearRamiConfirm();
    return true;
  }
  clearRamiConfirm();
  _ramiConfirm.action = action;
  _ramiConfirm.at = Date.now();
  _ramiConfirm.timer = setTimeout(function () {
    if (ramiConfirmPending(action)) {
      clearRamiConfirm();
      try { if (window.RamiAdapter) window.RamiAdapter._updateControls(); } catch (e) {}
    }
  }, 2550);
  _ramiToast(action === 'open'
    ? 'اضغط «افتتاح» مرة ثانية خلال ثانيتين ونصف للتأكيد — لن تُحتسب أي مخالفة الآن.'
    : 'اضغط «إنهاء» مرة ثانية خلال ثانيتين ونصف للتأكيد — لن تُحتسب أي مخالفة الآن.', 'warn');
  try { if (window.RamiAdapter) window.RamiAdapter._updateControls(); } catch (e) {}
  return false;
}

function setRamiBusy(val, owner) {
  RAMI_BUSY = !!val;
  if (val) {
    _lastBusyTime = Date.now();
    RAMI_BUSY_OWNER = owner || null;
  } else {
    RAMI_BUSY_OWNER = null;
  }
}

function checkRamiBusy() {
  if (RAMI_BUSY && Date.now() - _lastBusyTime > 1200) {
    RAMI_BUSY = false;
    RAMI_BUSY_OWNER = null;
  }
  return RAMI_BUSY;
}

function eRami(g) {
  return '<div class="rami-stage" id="ramiContainer"></div>';
}

function initRami() {
  /* [R6-META-WATCHDOG 2026-09-25] حارس أعلى على مستوى النافذة (يُنشأ مرة واحدة):
     أثبت التشخيص الحي أن مؤقتات النافذة تنجو بينما تموت مؤقتات المحوّل داخلياً
     (سباقات gen / سلاسل مقدمة الشوط الميتة) فيتجمد الشوط الجديد على 90s.
     هذا الحارس لا يمكن لمحوّل معطوب أن يقتله: كل 2 ثانية يفحص الجولة الحية
     ويصلح ثلاث حالات: مقدمة عالقة، عدّاد ميت، قفل انشغال معلق. */
  if (typeof window !== 'undefined' && !window.__ramiMetaWd) {
    window.__ramiMetaWd = setInterval(function () {
      try {
        const ad = window.RamiAdapter || window.RAMI_ADAPTER;
        const g = window.RAMI_STATE;
        if (!ad || !g || !ad.game || ad.game !== g) return;
        if (g.gamePhase !== 'PLAYING') return;

        /* 1) مقدمة شوط عالقة بعد مهلتها القصوى ⇒ أتممها قسراً */
        if (typeof ad._introComplete === 'function' && ad._introDone === false &&
            ad._introStartedAt && (Date.now() - ad._introStartedAt) > 8000) {
          console.warn('[Rami] meta-watchdog: forcing stalled intro completion');
          ad._introComplete();
        }

        /* 2) عدّاد ميت (المعرفات معبأة لكن _lastTickAt متقادمة) ⇒ إعادة بناء */
        if (ad._tickEverStarted && ad._lastTickAt && (Date.now() - ad._lastTickAt) > 8000) {
          console.warn('[Rami] meta-watchdog: dead tick detected — restarting timers');
          try { ad._startTimer(true); } catch (e) {}
        }

        /* 3) قفل انشغال معلق بلا تقدم ⇒ حرّره وشغّل دور البوت إن لزم */
        if (RAMI_BUSY && (Date.now() - (_lastBusyTime || 0)) > 8000) {
          console.warn('[Rami] meta-watchdog: releasing stuck RAMI_BUSY');
          setRamiBusy(false);
          const cur = g.roundManager && g.roundManager.getCurrentPlayer ? g.roundManager.getCurrentPlayer() : null;
          if (cur && cur.isBot) {
            const st = ad._botStep;
            if (!(st && ad._botStepIsCurrent && ad._botStepIsCurrent(st))) {
              try { ad._runBotTurn(cur); } catch (e) {}
            }
          }
        }
      } catch (e) { /* الحارس الأعلى لا يرمي أبداً */ }
    }, 2000);
  }
  /* [FREEZE-FIX] العودة من خلفية الهاتف: المؤقتات كانت مجمدة — إيقاظ دور البوت فوراً */
  if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__rmVisBound) {
    window.__rmVisBound = true;
    document.addEventListener('visibilitychange', function () {
      try {
        if (document.hidden) return;
        const ad = window.RamiAdapter;
        if (!ad || !ad.game || ad.game.gamePhase !== 'PLAYING') return;
        const cur = ad.game.roundManager.getCurrentPlayer();
        if (!cur || !cur.isBot) return;
        /* لا نلغي خطوة صحيحة عند العودة: نشغّلها فوراً إن حان موعدها،
           وإلا نترك مؤقتها يكمل. أما الخطوة القديمة فنلغيها ونبدأ السياق الحالي. */
        const step = ad._botStep;
        if (step && ad._botStepIsCurrent(step)) {
          if (Date.now() >= step.at) step.run();
          return;
        }
        if (step) ad._cancelBotStep();
        RAMI_BUSY = false;   /* busy قديمة من سياق انتهى */
        ad._runBotTurn(cur);
      } catch (e) {}
    });
  }
  if (typeof window !== 'undefined' && window.RamiAdapter && typeof window.RamiAdapter.destroy === 'function') {
    try { window.RamiAdapter.destroy(); } catch (e) {}
  }
  const adapter = new RamiUIAdapter();
  if (typeof window !== 'undefined') {
    window.RamiAdapter = adapter;
    window.RAMI_ADAPTER = adapter;
  }
  adapter.start('ramiContainer');
  /* ربط معالجات الغرفة للمزامنة الجماعية */
  ramiRegisterRooms();
  /* [AutoResume 2026-09-13] بلاغ المالك: فتح الرامي بعد تحديث/إغلاق كان يظهر
     شاشة الإعدادات فقط والجولة المحفوظة لا تُستأنف (والرهان يبدو مقتطعاً).
     الاستئناف صار تلقائياً: فتح اللعبة + جولة محفوظة غير منتهية = تكمل فوراً
     (البوت يلتقط دوره) — الشفافية والاستمرارية التي طلبها. الغرف الجماعية
     مستثناة (لها إعادة بناء الخادم الخاصة بها). */
  try {
    if (ramiHasSavedRound() &&
        !(typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.status === 'playing' && Rooms.state.game_id === 'rm')) {
      var res = ramiDeserializeGame();
      if (res && res.gamePhase === 'PLAYING') {
        RAMI_STATE = res;
        window.RAMI_STATE = RAMI_STATE;
        try { var raw = JSON.parse(localStorage.getItem(RAMI_PERSIST_KEY) || 'null'); if (raw && raw.bet) { RAMI_BET = raw.bet; window.RAMI_BET = raw.bet; } } catch (e) {}
        adapter.game = RAMI_STATE;
        adapter.selectedCards.clear();
        if (RAMI_STATE._savedHandSlots && RAMI_STATE._savedHandSlots.length === 5) {
          adapter.handSlots = RAMI_STATE._savedHandSlots;
          adapter.isolateCardId = RAMI_STATE._savedIsolateCardId || null;
        } else {
          adapter.handSlots = [[], [], [], [], []];
        }
        /* [ClockCatchup] الجولة «استمرت» أثناء غيابك: الأدوار التي انقضى
           مؤقتها لُعبت آلياً (نفس العدالة) — ثم تكمل من مؤقت دورك الحالي */
        var __savedAt = Date.now();
        try { var __raw = JSON.parse(localStorage.getItem(RAMI_PERSIST_KEY) || 'null'); if (__raw && __raw.savedAt) __savedAt = __raw.savedAt; } catch (e) {}
        var caught = (typeof ramiCatchupOnResume === 'function') ? ramiCatchupOnResume(RAMI_STATE, __savedAt) : 0;
        adapter._renderGame();
        _ramiToast(_ramiT('rami.resumedRound', '↩️ استؤنفت جولتك السابقة — رهانك محفوظ' + (caught > 0 ? ' · تقدّمت ' + caught + ' دوراً آلياً' : '')), 'ok');
        ramiAutoSave();
        adapter._processTurn();
      } else if (res) {
        /* حالة غير PLAYING (ROUND_END مثلاً) — شاشة الإعدادات كالمعتاد */
      }
    }
  } catch (e) { console.warn('[Rami] auto-resume skip:', e && e.message); }
}

/* ── محرك واجهة المستخدم التفاعلي ── */
class RamiUIAdapter {
  constructor() {
    this.game = null;
    this.container = null;
    this.timerId = null;
    this.selectedCards = new Set();
    this.handSlots = [[], [], [], [], []];
    this._driverGrace = null;       /* [Resilience] مهلة السائق الاحتياطية */
    this._driverGraceMs = 4000;     /* [Resilience] مهلة الانتظار قبل نيابة السائق */
    /* ── ورقة معزولة (للفتح/الإنهاء الصحيح): تُخرج من المجموعات الخمس ── */
    this.isolateCardId = null;
    /* ── وضع الغرفة (متعدد اللاعبين) ── */
    this.multiplayer = false;   // true داخل غرفة جماعية
    this.myPlayerId = 0;        // مؤشر لاعبي داخل المحرك (0 في اللعب الفردي)
    this.room = null;           // { id, code, isOwner, order, players, mode, target, bet, seed, seq }
    this._netSeq = 0;           // عدّاد تسلسل حركاتي المُصدَرة
    this._netApplied = 0;       // آخر تسلسل طُبّق (إزالة التكرار)
    /* [BOT-TURN-GUARD] كل خطوة مؤجلة مرتبطة بهوية اللعبة والدور نفسه.
       لا يكفي إلغاء المؤقت المرئي: قد يكون callback قد دخل طابور المتصفح
       أثناء الخلفية أو قبل إعادة الدخول، لذلك نتحقق من السياق قبل كل تنفيذ. */
    this._botTurnEpoch = 0;
    this._botStepToken = 0;
    this._botStep = null;
  }

  start(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    ramiBindPointerEvents();
    this._bindLayoutResize();
    this._renderSetup();
  }

  /* نظام القياس السائل: متغير --card-w واحد مشتق من أبعاد الحاوية الفعلية،
     وكل الأبعاد الأخرى تتبعه. كما يملأ ارتفاع الطاولة كل المساحة المتاحة
     بين الشريط العلوي وقسم سجل الجولات. */
  _measureAndSetScale() {
    const stage = this.container;
    if (!stage || typeof window === 'undefined') return;

    /* تثبيت إزاحة صفحة اللعبة عن أعلى الـ viewport حتى تمتد بدقة حتى الأسفل */
    const pg = document.getElementById('pg-game');
    if (pg) {
      const pgTop = pg.getBoundingClientRect().top;
      document.documentElement.style.setProperty('--pg-top', Math.max(0, Math.round(pgTop)) + 'px');
    }

    /* الارتفاع المتاح = الارتفاع الفعلي لحاوية اللعب (flex) — وليس حسابات يدوية */
    const bodyEl = document.getElementById('gamePageBody');
    let availH = bodyEl ? bodyEl.clientHeight : 0;
    if (availH < 120) {
      const vv = window.visualViewport;
      availH = (vv ? vv.height : window.innerHeight) - 120;
    }
    availH = Math.max(260, availH);

    const availW = stage.clientWidth || (window.innerWidth - 24);
    /* [V18] سقف أعلى (60px) لتكون الأوراق أكبر وأوضح على الشاشات الواسعة؛
       الشاشات القصيرة تبقى محدودة بمصطلح الارتفاع availH/12 فلا تُكسَر. */
    const cardW = Math.max(24, Math.min(60, Math.floor(Math.min(availW / 10, availH / 12))));
    stage.style.setProperty('--card-w', cardW + 'px');

    /* ضبط تداخل أوراق اليد لكل خانة على حدة */
    if (typeof this._fitSlotOverlaps === 'function') this._fitSlotOverlaps(document.getElementById('rami5SlotsContainer'));
  }

  /* تداخل/تصغير محسوب لكل خانة: صف واحد بتراكب معتدل، وإن لم يكف تصغير تدريجي،
     وإن طال التسلسل كثيراً التفاف لصفين. يضمن احتواء كل الأوراق داخل الفتحة بلا قصّ. */
  _fitSlotOverlaps(container) {
    if (!container) return;
    const cw = this._cardWpx();
    const FMAX = 0.5; // أقصى نسبة تداخل قبل التصغير
    const boxes = container.querySelectorAll('.rami-slot-box');
    const setVars = (box, sc, ov, wrap) => {
      box.style.setProperty('--sc', String(sc));
      box.style.setProperty('--ov', ov + 'px');
      box.style.setProperty('--wrap', wrap);
    };
    for (let s = 0; s < boxes.length; s++) {
      const n = (this.handSlots && this.handSlots[s]) ? this.handSlots[s].length : 0;
      const box = boxes[s];
      const avail = Math.max(24, (box.clientWidth || 60) - 2);
      if (n <= 1) { setVars(box, 1, 0, 'nowrap'); continue; }
      const need = (k, sc) => cw * sc * (k - FMAX * (k - 1));
      if (need(n, 1) <= avail) {
        // صف واحد بحجم كامل: تراكب يتراوح بين 15% و 50%
        let ov = (avail - n * cw) / (n - 1);
        ov = Math.max(-FMAX * cw, Math.min(-0.15 * cw, ov));
        setVars(box, 1, ov, 'nowrap');
      } else {
        const sc1 = avail / (cw * (n - FMAX * (n - 1)));
        if (sc1 >= 0.42) {
          setVars(box, sc1, -FMAX * cw * sc1, 'nowrap');
        } else {
          const k2 = Math.ceil(n / 2);
          const sc2 = Math.max(0.5, avail / (cw * (k2 - FMAX * (k2 - 1))));
          setVars(box, sc2, -FMAX * cw * sc2, 'wrap');
        }
      }
    }
  }

  _cardWpx() {
    if (!this.container || typeof window === 'undefined') return 40;
    const v = getComputedStyle(this.container).getPropertyValue('--card-w');
    const px = parseFloat(v);
    return px || 40;
  }

  /* إعادة حساب التخطيط عند تغيير حجم النافذة أو اتجاه الشاشة */
  _bindLayoutResize() {
    if (this._onResize || typeof window === 'undefined') return;
    this._lastVw = window.innerWidth;
    this._onResize = function () {
      clearTimeout(this._resizeT);
      this._resizeT = setTimeout(function () {
        if (typeof _ramiDrag !== 'undefined' && _ramiDrag) return; // لا نزعج السحب الجاري
        /* الكيبورد: فتح لوحة الإيموجي/الكتابة يغيّر ارتفاع الـ viewport فقط —
           لا نعيد التخطيط إلا عند تغيّر العرض (دوران/تغيير مقاس حقيقي) */
        const vw = window.innerWidth;
        const widthChanged = vw !== this._lastVw;
        this._lastVw = vw;
        const ae = document.activeElement;
        const typing = !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'));
        if (!widthChanged && typing) return;
        if (this.container) {
          this._measureAndSetScale();
          if (this.game && this.game.gamePhase === 'PLAYING') this._updateUI();
        }
      }.bind(this), 120);
    }.bind(this);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._onResize);
    }
  }

  destroy() {
    /* [BOT-TURN-GUARD] مغادرة اللعبة تلغي callback البوت نفسه، لا المؤقت المرئي
       فقط. callback قديم يجب ألا يلمس الجولة التي ستُنشأ عند العودة. */
    this._cancelBotStep();
    this._botTurnEpoch = (this._botTurnEpoch || 0) + 1;
    this._botStepToken = (this._botStepToken || 0) + 1;
    setRamiBusy(false);
    if (this.timerId) clearInterval(this.timerId);
    if (this.watchdogId) clearInterval(this.watchdogId);
    if (this._resizeT) clearTimeout(this._resizeT);
    /* [V19.6] تنظيف تجميد لقطة الإنهاء عند مغادرة اللعبة */
    if (this._endFreezeTimer) { clearTimeout(this._endFreezeTimer); this._endFreezeTimer = null; }
    this._endFreezeDone = null;
    try { var fb = document.getElementById('ramiEndFreezeBanner'); if (fb && fb.parentNode) fb.parentNode.removeChild(fb); } catch (e) {}
    if (this._onResize && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('orientationchange', this._onResize);
    }
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this._onResize);
    }
    this._onResize = null;
    this.game = null;
    this.container = null;
    this.selectedCards.clear();
    this.handSlots = [[], [], [], [], []];
    this._driverGrace = null;       /* [Resilience] مهلة السائق الاحتياطية */
    this._driverGraceMs = 4000;     /* [Resilience] مهلة الانتظار قبل نيابة السائق */
  }

  _renderSetup() {
    if (!this.container) return;
    const bal = (typeof ST !== 'undefined' && typeof ST.gold === 'number') ? ST.gold : 1000;
    const balTxt = (typeof fmt === 'function') ? fmt(bal) : String(bal);
    const mode = window.RAMI_SETUP_MODE || 'talaj';
    const curBet = window.RAMI_BET || 50;

    this.container.innerHTML =
      '<div class="rami-setup-modal card">' +
        '<div class="rami-setup-header">' +
          '<div class="rami-setup-emblem">🃏</div>' +
          '<div class="rami-setup-title">' + (_ramiT('rami.title') || 'الرامي المغربي') + '</div>' +
        '</div>' +

        /* النوع: طالاج / سامبل — عنوانان فقط لاختيار صنف الجولة */
        '<div class="rami-field">' +
          '<label class="rami-field-label">' + (_ramiT('rami.type') || 'النوع') + '</label>' +
          '<div class="rami-seg" id="ramiModeSeg">' +
            '<button type="button" class="rami-seg-btn' + (mode === 'talaj' ? ' on' : '') + '" data-mode="talaj" onclick="ramiSetMode(\'talaj\')">' + _ramiT('rami.talaj', 'طالاج') + '</button>' +
            '<button type="button" class="rami-seg-btn' + (mode === 'simple' ? ' on' : '') + '" data-mode="simple" onclick="ramiSetMode(\'simple\')">' + _ramiT('rami.simple', 'سامبل') + '</button>' +
          '</div>' +
        '</div>' +

        /* الهدف: أول اختيار = رهان على شوط واحد، والباقي أرقام فقط */
        '<div class="rami-field">' +
          '<label class="rami-field-label">' + (_ramiT('rami.target') || 'الهدف') + '</label>' +
          '<select id="ramiTarget" class="rami-custom-select">' + this._targetOptions(mode) + '</select>' +
        '</div>' +

        /* اللاعبون + مؤقت الدور في صف واحد */
        '<div class="rami-field-row">' +
          '<div class="rami-field">' +
            '<label class="rami-field-label">' + (_ramiT('rami.players') || 'اللاعبون') + '</label>' +
            '<select id="ramiPlayers" class="rami-custom-select">' +
              [2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (n === 4 ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
            '</select>' +
          '</div>' +
          '<div class="rami-field">' +
            '<label class="rami-field-label">' + (_ramiT('rami.timerSelect') || 'مؤقت الدور') + '</label>' +
            '<select id="ramiTimerSelect" class="rami-custom-select">' +
              [30, 45, 60, 90, 120, 180, 300, 450, 600].map(function (s) { return '<option value="' + s + '"' + (s === 90 ? ' selected' : '') + '>' + s + 's</option>'; }).join('') +
            '</select>' +
          '</div>' +
        '</div>' +

        /* [Training 2026-09-16] المحلي تدريب مجاني — الرهان حصري للغرف */
        '<div class="rami-field" id="ramiBetField" hidden>' +
          '<label class="rami-field-label">🪙 ' + (_ramiT('g.bet') || 'الرهان') + ' <span class="rami-bal-hint">(' + balTxt + ')</span></label>' +
          '<div class="rami-bet-row">' +
            '<button type="button" class="bbtn" onclick="ramiChangeBet(-10)" aria-label="تقليل">−</button>' +
            '<input type="number" id="ramiBetInput" class="rami-bet-input" min="0.01" step="0.01" max="' + bal + '" value="' + curBet + '" inputmode="decimal" aria-label="قيمة الرهان">' +
            '<button type="button" class="bbtn" onclick="ramiChangeBet(10)" aria-label="زيادة">+</button>' +
            '<button type="button" class="bbtn small" onclick="ramiSetMaxBet()" title="' + T('g.max') + '">' + T('g.max') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="rami-note" style="text-align:center;color:var(--t3);font-size:.8rem">🎓 ' + (_ramiT('ui.trainingFree') || 'تدريب مجاني بدون رهان — الرهان متاح في الغرف أونلاين فقط') + '</div>' +

        '<button class="big rami-start-btn" onclick="ramiStartGame()">🚀 ' + (_ramiT('g.start') || 'ابدأ اللعب') + '</button>' +
      '</div>';
  }

  /* قائمة خيارات الهدف حسب النوع: «رهان على شوط واحد» ثم أرقام فقط */
  _targetOptions(mode) {
    var singleLabel = _ramiT('rami.singleRound') || 'رهان على شوط واحد';
    var nums = (mode === 'simple') ? [201, 301, 401, 501, 701, 801] : [301, 401, 501, 701, 801, 901, 1001];
    var opts = '<option value="single">' + singleLabel + '</option>';
    nums.forEach(function (n) { opts += '<option value="' + n + '">' + n + '</option>'; });
    return opts;
  }

  playIntroAndStart() {
    const table = document.getElementById('ramiRoundTable');
    if (!table || !this.game) { this._processTurn(); return; }

    /* [R6-INTRO-FREEZE-FIX 2026-09-25] المقدمة كانت تقفل RAMI_BUSY=true بلا مالك
       وتعتمد كلياً على سلسلة setTimeout (1100ms→900ms) لتحريره. أي موت/تأخير
       لتلك السلسلة (خنق المؤقتات على الهاتف، ثقل الرسم، سباقات gen للمؤقتات)
       يترك القفل معلقاً فيتجمد أول دور بوت في الشوط الجديد والمؤقت واقف على
       90s/89s — عطل المالك المُبلَّغ "التجمد بعد 10+ أشواط". الإصلاح:
       أ) القفل بمالك، ب) إتمام idempotent برمز لكل مقدمة يمنع سباق المقدمات،
       ج) مهلة قصوى تُنهي المقدمة قسراً وتحرر القفل وتشغّل الدور. */
    setRamiBusy(true, this);
    const players = this.game.players;
    const mode = this.game.mode;

    // اختيار الموزع بأصغر ورقة يحدث في الشوط الأول فقط؛
    // في باقي الأشواط ينتقل دور التوزيع للاعب التالي تلقائياً (nextRound)
    const isFirstRound = (this.game.roundManager.roundNumber === 0);
    const INTRO_MAX_MS = isFirstRound ? 6500 : 4000;

    /* رمز لكل مقدمة: مقدمة جديدة تُبطل كل callbacks للمقدمة السابقة */
    const myToken = (this._introToken = (this._introToken || 0) + 1);
    if (this._introDeadlineTimer) { try { clearTimeout(this._introDeadlineTimer); } catch (e) {} }
    this._introDone = false;
    this._introStartedAt = Date.now();

    const overlay = document.createElement('div');
    overlay.className = 'rami-intro-overlay';
    overlay.id = 'ramiIntroOverlay';
    overlay.innerHTML =
      '<div class="rami-shuffling-deck">' +
        '<div class="rcard-vector rcard-back rami-shuffle-card"><div class="rcard-back-pattern"></div></div>' +
        '<div class="rcard-vector rcard-back rami-shuffle-card"><div class="rcard-back-pattern"></div></div>' +
        '<div class="rcard-vector rcard-back rami-shuffle-card"><div class="rcard-back-pattern"></div></div>' +
      '</div>' +
      '<div class="rami-intro-title">🔄 ' + _ramiT('rami.shuffling', 'خلط الأوراق') + '...</div>';
    table.appendChild(overlay);

    if (typeof SND !== 'undefined' && SND.shuffle) SND.shuffle();

    /* الإتمام النهائي idempotent: يُنفَّذ مرة واحدة مهما تعددت مسارات الوصول
       (السلسلة الطبيعية أو المهلة القصوى أو meta-watchdog). */
    const completeIntro = () => {
      if (this._introToken !== myToken || this._introDone) return;
      this._introDone = true;
      if (this._introDeadlineTimer) { try { clearTimeout(this._introDeadlineTimer); } catch (e) {} this._introDeadlineTimer = null; }
      setRamiBusy(false);
      try {
        const ov = document.getElementById('ramiIntroOverlay');
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      } catch (e) {}
      this._renderGame();
      this._processTurn();
    };
    /* نموذج الإتمام قابل للاستدعاء من الخارج (meta-watchdog) */
    this._introComplete = completeIntro;

    /* شبكة الأمان: تنتهي المقدمة قسراً بعد INTRO_MAX_MS حتى لو ماتت سلسلة
       المؤقتات كلها — العدّاد يتحرر والدور يبدأ مهما حدث. */
    this._introDeadlineTimer = setTimeout(completeIntro, INTRO_MAX_MS);

    const finishIntro = () => {
      if (this._introToken !== myToken || this._introDone) return;
      if (!this.game) { completeIntro(); return; }
      overlay.innerHTML = '<div class="rami-intro-title">🃏 ' + (_ramiT('rami.dealing') || 'توزيع الأوراق في الطاولة...') + '</div>';
      if (typeof SND !== 'undefined' && SND.deal) SND.deal();
      setTimeout(() => { completeIntro(); }, 900);
    };

    setTimeout(() => {
      if (this._introToken !== myToken || this._introDone) return;
      if (!this.game) { completeIntro(); return; }

      // الأشواط اللاحقة: التوزيع تم مسبقاً في nextRound — لا إعادة اختيار للموزع
      if (!isFirstRound) {
        finishIntro();
        return;
      }

      // الشوط الأول فقط: انتقاء الموزع بأصغر ورقة
      const cutCards = [];
      for (let i = 0; i < players.length; i++) {
        const c = this.game.roundManager.drawPile.pop() || new RamiCard(100 + i, Math.floor(Math.random() * 10) + 1, 'heart');
        cutCards.push({ player: players[i], card: c });
      }

      let minCardIdx = 0;
      for (let i = 1; i < cutCards.length; i++) {
        if (cutCards[i].card.rank < cutCards[minCardIdx].card.rank) {
          minCardIdx = i;
        }
      }

      this.game.roundManager.dealerIndex = minCardIdx;

      let cutHtml = '<div class="rami-intro-title">👑 ' + (_ramiT('rami.cuttingDealer') || 'انتقاء الموزع — أصغر ورقة هي الموزع الأول') + '</div>' +
        '<div class="rami-intro-cards-row">';

      for (let i = 0; i < cutCards.length; i++) {
        const item = cutCards[i];
        const isWinner = (i === minCardIdx);
        cutHtml += '<div class="rami-cut-card-box' + (isWinner ? ' dealer-winner' : '') + '">' +
          getRamiCardHTML(item.card, false) +
          '<span class="rami-cut-pname">' + item.player.name + (isWinner ? ' ♛' : '') + '</span>' +
        '</div>';
      }
      cutHtml += '</div>';

      overlay.innerHTML = cutHtml;

      setTimeout(() => {
        if (!this.game) { setRamiBusy(false); return; }
        // إعادة التوزيع وفق الموزع المختار
        this.game.startRound();
        finishIntro();
      }, 1500);
    }, 1100);
  }

  _renderGame() {
    if (!this.container || !this.game) return;
    const modeTxt = _ramiT(this.game.mode === 'talaj' ? 'rami.talaj' : 'rami.simple', this.game.mode === 'talaj' ? 'طالاج' : 'سامبل');
    const target = (this.game.displayTarget !== undefined && this.game.displayTarget !== null) ? this.game.displayTarget : this.game.targetScore;
    /* [V20] رقم مجموع الرهان فقط (بدون نص وبدون رمز كوينز) — يُعرض ذهبياً أسفل العنوان */
    const betTotal = (window.RAMI_BET || 50) * this.game.playerCount;

    this.container.innerHTML =
      '<div class="rami-game">' +
        '<div class="rami-round-table" id="ramiRoundTable">' +
          '<div class="rami-seats-container rami-seats-above" id="ramiSeatsAbove"></div>' +
          '<div class="rami-center-zone">' +
            /* اليسار: الهدف (أعلى) + مجموع الرهان (أسفل) */
            '<div class="rami-rim-header">' +
              '<span class="rami-rim-title">' + target + '</span>' +
              '<span class="rami-rim-bet">' + betTotal + '</span>' +
            '</div>' +
            '<div class="rami-table-center" id="ramiTableCenter"></div>' +
            /* اليمين: نوع الرامي (طالاج/سامبل) */
            '<div class="rami-side-type"><span class="rami-side-type-txt">' + modeTxt + '</span></div>' +
            '<div class="rami-discard-dropzone" id="ramiDiscardDropZone"><span class="dz-label">🗑 أفلت الورقة هنا لرميها</span></div>' +
          '</div>' +
          '<div class="rami-seats-container rami-seats-below" id="ramiSeatsBelow"></div>' +
          '<div class="rami-player-bottom-wrap" id="ramiPlayerBottomWrap">' +
            '<div class="rami-human-melds-area" id="ramiHumanMeldsArea"></div>' +
            '<div class="rami-action-dock" id="ramiActionDock"></div>' +
            '<div class="rami-hint-line" id="ramiHintLine" hidden></div>' +
            '<div class="rami-5slots-container" id="rami5SlotsContainer"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    this._measureAndSetScale();
    this._updateUI();
    this._startTimer();
  }

  /* [BOT-TURN-GUARD] لقطة ثابتة للدور الذي يُسمح لخطوة البوت أن تلمسه. */
  _captureBotContext(bot) {
    const rm = this.game && this.game.roundManager;
    return {
      game: this.game,
      epoch: this._botTurnEpoch || 0,
      botId: bot && bot.id,
      playerIndex: rm ? rm.currentPlayerIndex : -1,
      roundNumber: rm ? (rm.roundNumber || 0) : 0,
      turnStartedAt: rm ? (rm._turnStartedAt || 0) : 0
    };
  }

  _botContextIsCurrent(ctx) {
    if (!ctx || !this.game || this.game !== ctx.game || this.game.gamePhase !== 'PLAYING') return false;
    if ((this._botTurnEpoch || 0) !== ctx.epoch) return false;
    const rm = this.game.roundManager;
    const cur = rm && rm.getCurrentPlayer ? rm.getCurrentPlayer() : null;
    if (!rm || !cur || cur.id !== ctx.botId) return false;
    if (rm.currentPlayerIndex !== ctx.playerIndex || (rm.roundNumber || 0) !== ctx.roundNumber) return false;
    /* بعض اختبارات المحرك لا تضع ختم البداية؛ في المتصفح نتحقق منه أيضاً. */
    if (ctx.turnStartedAt && rm._turnStartedAt && rm._turnStartedAt !== ctx.turnStartedAt) return false;
    return true;
  }

  _botStepIsCurrent(step) {
    return !!(step && !step.done && this._botStep === step && this._botContextIsCurrent(step.context));
  }

  _cancelBotStep() {
    const step = this._botStep;
    if (!step) return;
    step.done = true;
    if (step.timerId) {
      try { clearTimeout(step.timerId); } catch (e) {}
      step.timerId = null;
    }
    if (this._botStep === step) this._botStep = null;
  }

  /* [v2.43 TIMER-FIX] سبب تجمّد المؤقّت في دور البوت:
     كان كل tick يُلغي `this.timerId` الحاليّ إذا لم تكن المرحلة PLAYING —
     وبين الأشواط تمرّ المرحلة بـ LOBBY/ROUND_END، فأي tick متأخر (خلفية الهاتف/
     شوط جديد) كان يُلغي **المؤقّت الجديد** بدل مؤقّته ⇒ يتوقف العدّاد ولا يلعب البوت.
     الحل: كل مؤقّت يحمل رقم جيل (gen) ولا يلمس إلا نفسه، والمرحلة غير PLAYING
     = إيقاف مؤقت (return) لا إتلاف، مع شفاء ذاتي داخل الـ watchdog. */
  _startTimer(force) {
    /* [R6-TIMER-FIX 2026-09-25] idempotent: كانت _renderGame تعيد بناء المؤقتات
       في كل رسم (قتل+إحياء بأرقام gen متلاحقة) فتنشأ سباقات يموت فيها المؤقت
       الحي وتظل this.timerId معبأة بمعرف ميّت — يتعطل العدّ وwatchdog معاً
       (شوهد حياً: turnSecondsRemaining واقفة على 90 طوال 66 ثانية). الآن:
       مؤقتات حية = لا لمس إطلاقاً؛ الإعادة فقط بـ force أو عند فقد معرّف. */
    if (!force && this.timerId && this.watchdogId) return;
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    if (this.watchdogId) { clearInterval(this.watchdogId); this.watchdogId = null; }
    this._timerGen = (this._timerGen || 0) + 1;
    const gen = this._timerGen;

    const iv = setInterval(() => {
      if (this._timerGen !== gen) { clearInterval(iv); return; }   /* نسخة قديمة */
      if (!this.game) return;
      if (this.game.gamePhase !== 'PLAYING') return;               /* إيقاف مؤقت */
      try { this._tick(); } catch (e) { console.error('[Rami] tick error:', e && e.message, e); }
    }, 1000);
    this.timerId = iv;

    /* Watchdog مستقل يكتشف التجمد ويستعيد الحالة */
    const wd = setInterval(() => {
      if (this._timerGen !== gen) { clearInterval(wd); return; }
      try { this._watchdog(); } catch (e) { console.error('[Rami] watchdog error:', e && e.message); }
    }, 2000);
    this.watchdogId = wd;
  }

  /* [v2.43 + BOT-TURN-GUARD] خطوة بوت مؤجلة بمرجع واحد.
     كل استبدال يلغي المؤقت السابق، وكل callback يتحقق من اللعبة/الشوط/الدور
     قبل لمس الحالة. هذا يمنع callbackاً قديماً من تنفيذ سحب أو رمي بعد العودة
     من الخلفية أو بعد انتقال الدور. */
  _deferBotStep(bot, fn, delay, context) {
    const token = (this._botStepToken || 0) + 1;
    this._botStepToken = token;
    const now = Date.now();
    const ctx = context || this._captureBotContext(bot);

    /* لا يسمح بوجود خطوتين متنافستين في الدور نفسه. */
    this._cancelBotStep();
    const step = {
      token: token,
      botId: bot && bot.id,
      at: now + (delay || 0),
      createdAt: now,
      fn: fn,
      context: ctx,
      done: false,
      timerId: null
    };
    this._botStep = step;

    const run = () => {
      if (step.done) return;
      /* callback قديم لا يحرر RAMI_BUSY الخاص بخطوة أحدث ولا يمرر دوراً جديداً. */
      if (!this._botStepIsCurrent(step)) {
        step.done = true;
        if (this._botStep === step) this._botStep = null;
        return;
      }
      step.done = true;
      step.timerId = null;
      if (this._botStep === step) this._botStep = null;
      try { fn(); } catch (e) {
        console.error('[Rami] bot step error:', e && e.message, e);
        try {
          /* لا نصلح إلا نفس السياق؛ الدور الجديد قد يكون بدأ بالفعل. */
          if (!this._botContextIsCurrent(ctx)) return;
          setRamiBusy(false);
          const rm = this.game && this.game.roundManager;
          if (rm && rm.getCurrentPlayer() && rm.getCurrentPlayer().id === bot.id) {
            rm.nextPlayer();
          }
          this._processTurn();
        } catch (e2) {}
      }
    };
    step.run = run;
    step.timerId = setTimeout(run, Math.max(0, delay || 0));
    return step;
  }

  /* كشف التجمد: قفل انشغال عالق، عداد توقف، أو دور بوت بلا حركة */
  _watchdog() {
    if (!this.game) return;
    if (this.game.gamePhase !== 'PLAYING') return;

    /* [v2.43] شفاء ذاتي: مؤقّت/حارس متوقفان والمرحلة جارية ⇒ أعد تشغيلهما
       [R6-TIMER-FIX] + كشف العدّ الميت بالزمن: _lastTickAt متقادمة >6 ثوانٍ
       والمرحلة جارية = المؤقت معرّفه معبأ لكنه ميّت ⇒ إعادة بناء قسرية. */
    if (!this.timerId || !this.watchdogId ||
        (this._lastTickAt && (Date.now() - this._lastTickAt) > 6000) ||
        (!this._lastTickAt && this._tickEverStarted)) {
      try { this._startTimer(true); } catch (e) {}
    }
    this._tickEverStarted = true;

    /* [BOT-TURN-GUARD] تخلّص من خطوة تخص دوراً قديماً قبل أي استرداد. */
    let step = this._botStep;
    if (step && !this._botStepIsCurrent(step)) {
      this._cancelBotStep();
      step = null;
    }

    /* [v2.43] خطوة بوت مؤجّلة تأخّرت أكثر من 3 ثوانٍ ⇒ نفّذها الآن.
       استخدام at يجعل الاسترداد فورياً بعد عودة الصفحة، وشرط العمر يحافظ
       على اختبار/حالة المؤقت المتأخر حتى لو تغيرت ساعة الجهاز. */
    if (step && (Date.now() >= step.at || (Date.now() - (step.createdAt || step.at)) > 3000)) {
      console.warn('[Rami] watchdog: running delayed bot step for bot', step.botId);
      step.run();
      return;
    }

    // 1) قفل انشغال عالق لأكثر من 5 ثوانٍ → تحريره
    if (RAMI_BUSY && Date.now() - (_lastBusyTime || 0) > 5000) {
      console.warn('[Rami] watchdog: clearing stuck RAMI_BUSY');
      setRamiBusy(false);
      /* [R6-INTRO-FREEZE-FIX] تحرير القفل وحده لم يكن يكفي: إن كان دور بوت
         فالدور لا يبدأ من تلقاء نفسه — نشغّله فوراً بعد التحرير. */
      try {
        const rmB = this.game && this.game.roundManager;
        const curB = rmB && rmB.getCurrentPlayer ? rmB.getCurrentPlayer() : null;
        if (curB && curB.isBot && this.game.gamePhase === 'PLAYING') this._runBotTurn(curB);
      } catch (e) {}
    }

    // 2) دور بوت عالق بلا حركة لأكثر من 4 ثوانٍ → تشغيل اللعب الآلي لتمرير الدور فوراً ومنع أي تجمد
    const rm = this.game.roundManager;
    if (!rm) return;
    const curP = rm.getCurrentPlayer();
    const elapsed = Date.now() - (rm._turnStartedAt || Date.now());
    if (curP && curP.isBot && elapsed > 4000) {
      console.warn('[Rami] watchdog: bot turn stuck (' + elapsed + 'ms) — forcing auto-play recovery for', curP.name);
      setRamiBusy(false);
      rm._turnStartedAt = Date.now();
      this._doAutoPlay(curP, rm, this.multiplayer);
    }
  }

  _tick() {
    /* [R6-TIMER-FIX] بصمة الحياة: الـ watchdog والـ meta-watchdog يقرآنها
       لكشف مؤقت عدّ ميت (المعرفات لا تكفي — قد تشير لمؤقت ميّت). */
    this._lastTickAt = Date.now();
    if (!this.game || this.game.gamePhase !== 'PLAYING') return;
    const rm = this.game.roundManager;
    rm.turnSecondsRemaining--;
    const secStr = Math.max(0, rm.turnSecondsRemaining) + 's';
    const timerEls = document.querySelectorAll('.rami-avatar-timer');
    timerEls.forEach(el => {
      el.textContent = secStr;
    });

    // Bot Watchdog: إذا كان دور البوت ولم يقم بحركة خلال 3 ثوانٍ، استدعاء حركته فوراً
    const curP = rm.getCurrentPlayer();
    if (curP && curP.isBot && rm.turnSecondsRemaining < (this.game.rules.turnSeconds - 3)) {
      if (checkRamiBusy()) setRamiBusy(false);
      this._runBotTurn(curP);
    }

    if (rm.turnSecondsRemaining <= 0) {
      this._handleTurnTimeout();
    }
  }

  /* [Resilience] السائق الحالي: من يقود المؤقّتات والتقدّم الآلي (افتراضياً المُنشئ،
     يُعاد تعيينه خادمياً عند انقطاعه). في اللعب الفردي دائماً true. */
  _isDriver() {
    if (!this.multiplayer) return true;
    var room = (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state : (this.room || null);
    if (!room) return !!(this.room && this.room.isOwner);
    var driverId = (room.driverId != null) ? room.driverId : room.owner_id;
    return String(driverId) === String(ramiMyUserId());
  }

  /* [Resilience] بثّ الحركة الدقيقة لانتهاء المؤقّت (يتطابق الجميع عند تطبيقها) */
  _emitAutoTimeout(curP, rm, drew, discardCardId) {
    if (!this.multiplayer) return;
    this._netEmit('autoTimeout', { playerId: curP.id, drew: drew, discardCardId: discardCardId, dedup: 'auto-' + (rm.roundNumber||0) + '-' + curP.id + '-' + (rm._turnStartedAt||0) });
  }

  /* [Resilience] تنفيذ اللعب الآلي (سحب إن لزم + رمي ورقة لا منتمية) مع بثّ اختياري */
  _doAutoPlay(curP, rm, broadcast) {
    /* انتهاء الوقت/الاسترداد يتغلب على أي خطوة خبير مؤجلة؛ لا نتركها
       تستيقظ بعد الرمي الآلي وتنفذ حركة ثانية. */
    this._cancelBotStep();
    setRamiBusy(true, this);
    var drew = false, discardCardId = null;
    try {
      if (rm.turnPhase === 'WAITING_DRAW' && curP.hand.length < this.game.rules.playHandSize) {
        const r = this.game.executeMove({ type: 'draw_deck', playerId: curP.id });
        if (r && r.success) drew = true;
        else {
          rm.nextPlayer(); setRamiBusy(false);
          if (broadcast) this._emitAutoTimeout(curP, rm, false, null);
          if (this.game.gamePhase === 'PLAYING') this._processTurn(); else this._endRoundUI();
          return;
        }
      }
      if (rm.turnPhase === 'WAITING_DISCARD') {
        const hand = curP.hand.slice();
        let card = hand.find(c => !this.game.doesCardFitAnyTableMeld(c));
        if (!card) card = hand[hand.length - 1];
        if (card) {
          const res = this.game.executeMove({ type: 'discard', playerId: curP.id, cardId: card.id });
          if (res && (res.success || res.penaltyApplied)) { this.selectedCards.clear(); discardCardId = card.id; }
        }
      }

      /* [CRITICAL-SAFETY] ضمان تقدم الدور قطرياً: إذا لم ينقل الرمي الدور، نمرر الدور قسرياً لمنع تكرار المؤقت 90s والتجمد */
      if (this.game.gamePhase === 'PLAYING' && rm.getCurrentPlayer() && rm.getCurrentPlayer().id === curP.id) {
        rm.nextPlayer();
      }

      setRamiBusy(false);
      this.selectedCards.clear();
      if (broadcast) this._emitAutoTimeout(curP, rm, drew, discardCardId);
      _ramiToast('\u{1F916} ' + (_ramiT('rami.autoEnabled') || 'انتهى الوقت — تم رمي ورقة تلقائياً'), 'warn');
      if (this.game.gamePhase === 'PLAYING') this._processTurn(); else this._endRoundUI();
    } catch (e) {
      console.error('[Rami] auto-discard error:', e && e.message, e);
      setRamiBusy(false);
      try {
        if (this.game && this.game.gamePhase === 'PLAYING' && rm.getCurrentPlayer() && rm.getCurrentPlayer().id === curP.id) {
          rm.nextPlayer();
        }
        if (broadcast) this._emitAutoTimeout(curP, rm, false, null);
        if (this.game && this.game.gamePhase === 'PLAYING') this._processTurn();
      } catch (e2) { /* تجاهل */ }
    }
  }

  _handleTurnTimeout() {
    if (!this.game || this.game.gamePhase !== 'PLAYING') return;
    /* timeout هو مسار استرداد حتمي؛ ألغِ خطة البوت القديمة قبل تنفيذها. */
    this._cancelBotStep();
    const rm = this.game.roundManager;
    const curP = rm.getCurrentPlayer();
    if (!curP) return;

    /* تحرير قفل الانشغال قسرياً عند انتهاء الوقت لضمان تنفيذ المعالجة الآلية */
    setRamiBusy(false);

    /* [BOT-FREEZE-FIX] إذا انتهى وقت البوت وهو عالق:
       تحرير أي قفل قسرياً وتشغيل اللعب الآلي لتمرير الدور فوراً ومنع التجمد نهائياً */
    if (curP.isBot) {
      console.warn('[Rami] Bot turn timeout — forcing auto-play recovery for bot', curP.id);
      rm.turnSecondsRemaining = this.game.rules.turnSeconds;
      this._doAutoPlay(curP, rm, this.multiplayer);
      return;
    }

    const isMyTurn = (curP.id === (this.myPlayerId || 0));

    /* [V19.5] الوضع المحلي: انتهى وقت اللاعب البشري → حركة آلية فورية
       (سحب من الكومة إن لزم + رمي ورقة) كي لا يتجمد اللعب أبداً */
    if (!this.multiplayer) {
      rm.turnSecondsRemaining = this.game.rules.turnSeconds;
      this._doAutoPlay(curP, rm, false);
      return;
    }

    /* اللاعب الحالي المتصل: يلعب آلياً لنفسه فوراً (يحافظ على ترتيب يده المحلي ويمنع حركة متأخرة) */
    if (this.multiplayer && isMyTurn) {
      rm.turnSecondsRemaining = this.game.rules.turnSeconds;
      this._doAutoPlay(curP, rm, true);
      return;
    }

    /* [Resilience] السائق احتياطياً: يمنح مهلة قصيرة (4ث) قبل أن ينوب عن لاعب متجمّد/منقطع.
       إن كان دور اللاعب قد انتهى فعلاً (وصلت حركته) يتغير curP فيلغي المفتاح المطابقة. */
    if (this.multiplayer && this._isDriver()) {
      const key = (rm.roundNumber||0) + ':' + curP.id + ':' + (rm.turnPhase||'');
      if (!this._driverGrace || this._driverGrace.key !== key) {
        this._driverGrace = { key: key, deadline: Date.now() + (this._driverGraceMs||4000) };
      }
      if (Date.now() >= this._driverGrace.deadline) {
        this._driverGrace = null;
        rm.turnSecondsRemaining = this.game.rules.turnSeconds;
        this._doAutoPlay(curP, rm, true);
      }
      return;
    }
    /* غير السائق وغير صاحب الدور: لا شيء (ينتظر بثّ الحركة) */
  }
  _processTurn() {
    if (!this.game || this.game.gamePhase !== 'PLAYING') return;
    /* [BOT-TURN-GUARD] الانتقال إلى أي دور جديد يبطل كل callback سابق،
       حتى لو بقي مؤقت setTimeout في طابور المتصفح. */
    this._cancelBotStep();
    this._botTurnEpoch = (this._botTurnEpoch || 0) + 1;
    /* [Spectator] عرض فقط — لا مؤقّتات ولا أفعال */
    if (this.isSpectator) { this._updateUI(); return; }
    setRamiBusy(false);
    /* [Persist] حفظ الجولة بعد كل تقدّم دور — تستمر بعد إغلاق/تحديث المتصفح */
    if (typeof ramiAutoSave === 'function') ramiAutoSave();
    const curP = this.game.roundManager.getCurrentPlayer();
    this.game.roundManager.turnSecondsRemaining = this.game.rules.turnSeconds || 90;
    this.game.roundManager._turnStartedAt = Date.now();
    this._updateUI();

    const isMyTurn = !!(curP && curP.id === (this.myPlayerId || 0));
    if (curP && curP.isBot) {
      this._runBotTurn(curP);
    } else if (this.multiplayer && !isMyTurn) {
      /* وضع الغرفة: ليس دوري — عرض فقط (صامت، يدير صاحب الدور مؤقته) */
      return;
    } else {
      if (typeof SND !== 'undefined' && SND.notify) SND.notify();
      if (!this._uxHinted) {
        this._uxHinted = true;
        const hl = document.getElementById('ramiHintLine');
        if (hl) {
          hl.innerHTML = '💡 ' + (_ramiT('rami.uxHint') || 'انقر ورقة لتحديدها · اسحبها وأفلتها في وسط الطاولة للرمي · انقر مرتين على المجرف/المرموق للسحب');
          hl.hidden = false;
          clearTimeout(this._hintT);
          this._hintT = setTimeout(function () {
            const h2 = document.getElementById('ramiHintLine');
            if (h2) h2.hidden = true;
          }, 12000);
        }
      }
    }
  }

  /* [Spectator] شريط المراقبة: بانر + زر طلب الانضمام (بدل أزرار اللعب واليد) */
  _renderSpectatorBar() {
    if (typeof document === 'undefined') return;
    /* تفريغ خانات اليد البشرية (لا يد للمتفرج) */
    for (let s = 0; s < 5; s++) {
      const slot = document.getElementById('ramiHandSlot' + s);
      if (slot) slot.innerHTML = '';
    }
    const humanMeldsEl = document.getElementById('ramiHumanMeldsArea');
    if (humanMeldsEl) humanMeldsEl.innerHTML = '';
    const dock = document.getElementById('ramiActionDock');
    if (!dock) return;
    const seats = (this.room && this.room.seats) ? this.room.seats : null;
    const free = seats ? seats.free : 0;
    const max = seats ? seats.max : 0;
    const players_n = seats ? seats.players : 0;
    const pending = (typeof Rooms !== 'undefined' && typeof Rooms.myJoinPending === 'function') ? Rooms.myJoinPending() : false;
    let btnHtml = '';
    if (pending) {
      btnHtml = '<div class="rami-spec-pending">' + _ramiF('rami.specJoinQueued', '⏳ طلبك في الطابور — بانتظار تفرّغ مقعد ({n}/{max})', { n: players_n, max: max }) + '</div>';
    } else if (free > 0) {
      btnHtml = '<button class="big rami-start-btn" onclick="Rooms.requestJoin()">🎮 ' + _ramiT('rami.specJoinBtn', 'اطلب الانضمام كمشغل') + '</button>';
    } else {
      btnHtml = '<div class="rami-spec-full" style="opacity:.7;font-size:.78rem;">' + (max ? (players_n + '/' + max + ' — ') : '') + _ramiT('rami.specFull', 'لا توجد مقاعد شاغرة حالياً') + '</div>';
    }
    dock.innerHTML = '<div class="rami-spectator-bar" style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px 12px;">' +
      '<div class="rami-spec-banner" style="font-size:.78rem;color:rgba(255,255,255,.75);text-align:center;max-width:520px;">' + _ramiT('rami.specBanner', '👁️ وضع المتفرج — تشاهد الأفعال العامة وعدد أوراق كل لاعب دون كشف الوجوه') + '</div>' +
      btnHtml +
    '</div>';
  }

  /* [Spectator] شاشة انتظار بدء المباراة */
  _renderSpectatorWait() {
    if (!this.container) return;
    this.container.innerHTML =
      '<div class="rami-setup-modal card" style="text-align:center;padding:28px 16px;">' +
        '<div class="rami-setup-emblem">👁️</div>' +
        '<div class="rami-setup-title">' + _ramiT('rami.specWait', 'متفرّج — في انتظار بدء المالك للمباراة…') + '</div>' +
      '</div>';
  }

  _autoPlayTurn() {
    /* اللعب الأوتوماتيكي (عند انتهاء الوقت) يعيد استخدام منطق الذكاء الاصطناعي الذكي:
       سحب، افتتاح، تركيب، وإنهاء — بدل الرمي العشوائي الذي كان يعجز عن الافتتاح */
    if (!this.game || checkRamiBusy()) return;
    const curP = this.game.roundManager.getCurrentPlayer();
    if (!curP) return;
    this._runBotTurn(curP);
  }

  /* [MP-AI] بثّ حركة البوت للغرفة (السائق وحده يشغّل البوت في الوضع الجماعي) */
  _botEmit(action, data) { if (this.multiplayer) this._netEmit(action, data); }

  _runBotTurn(bot) {
    if (!this.game || this.game.gamePhase !== 'PLAYING') return;
    /* [MP-AI] في الوضع الجماعي السائق وحده يُشغّل البوت ويبثّه؛ البقية يطبّقون عبر room:move */
    if (this.multiplayer && !this._isDriver()) return;
    const rm = this.game.roundManager;
    const curP = rm && rm.getCurrentPlayer ? rm.getCurrentPlayer() : null;
    if (!curP || !bot || curP.id !== bot.id) return;

    /* tick/visibility قد يستدعيان هذا أكثر من مرة. وجود خطوة صحيحة يعني أن
       الدور جارٍ فعلاً، حتى لو انتهت مهلة RAMI_BUSY العامة البالغة 1.2s. */
    if (this._botStep) {
      if (this._botStepIsCurrent(this._botStep)) return;
      this._cancelBotStep();
      setRamiBusy(false);
    }
    if (checkRamiBusy()) {
      /* RAMI_BUSY عالمي تاريخياً؛ قد يكون من adapter غادر الصفحة. لا تسمح
         بهوية قديمة أن تمنع adapter الحالي من بدء دور البوت. */
      if (RAMI_BUSY_OWNER && RAMI_BUSY_OWNER !== this) setRamiBusy(false);
      else if (!RAMI_BUSY_OWNER || (RAMI_BUSY_OWNER === this && !this._botStep)) setRamiBusy(false);
      else return;
    }

    const botContext = this._captureBotContext(bot);
    setRamiBusy(true, this);

    this._deferBotStep(bot, () => {
      if (!this._botContextIsCurrent(botContext)) return;
      try {
      if (!this.game || this.game.gamePhase !== 'PLAYING') { setRamiBusy(false); return; }

      if (rm.turnPhase === 'WAITING_DRAW') {
        /* [EXPERT-AI] قرار السحب الخبير: لا يأخذ المرموق إلا إذا كان سيُنزّل
           هذا الدور فعلاً (إنهاء/افتتاح/إدراج محلي/مجموعة جديدة) */
        let drawType = RamiExpertAI.chooseDraw(this.game, bot, !this.multiplayer);

        /* [V24] فحص نتيجة السحب: إن فشل (نفاد الأوراق) تُجرَّب البديل ثم يمرر الدور لتجنب التجمد */
        let usedDraw = null;
        let drawRes = this.game.executeMove({ type: drawType, playerId: bot.id });
        if (drawRes && drawRes.success) usedDraw = drawType;
        else if (drawRes && drawRes.penaltyApplied) usedDraw = drawType;
        else {
          /* [V24+] البديل الآمن: draw_deck أولاً دائماً؛ سحب المرموق كملاذ أخير
             فقط في السامبل (بلا جزاء) — في طالاج يجر جزاء 71 فلا يُجرَّب قسراً */
          if (drawType !== 'draw_deck') {
            const altRes = this.game.executeMove({ type: 'draw_deck', playerId: bot.id });
            if (altRes && (altRes.success || altRes.penaltyApplied)) usedDraw = 'draw_deck';
          }
          if (!usedDraw && this.game.rules.mode !== 'talaj') {
            const altRes2 = this.game.executeMove({ type: 'draw_discard', playerId: bot.id });
            if (altRes2 && (altRes2.success || altRes2.penaltyApplied)) usedDraw = 'draw_discard';
          }
        }
        if (!usedDraw) {
          /* لا يمكن السحب إطلاقاً: تمرير الدور قسرياً */
          setRamiBusy(false);
          rm.nextPlayer();
          this._processTurn();
          return;
        }
        this._botEmit('draw', { drawType: usedDraw, playerId: bot.id });
        if (typeof SND !== 'undefined' && SND.card) SND.card();
        this._updateUI();
      }

      this._deferBotStep(bot, () => {
        try {
        if (!this.game || this.game.gamePhase !== 'PLAYING') { setRamiBusy(false); return; }

        /* [R5-FREEZE-FIX 2026-09-24] استدعاء getLegalMoves هنا كان ميتاً — النتيجة
           legalMoves لم تُستخدم قط في خطوة اللعب (رميات البوت تُجلب من جديد قبل
           الرمي عند الحاجة). الاستدعاء كان يشغّل تقسيمين كاملين بلا ميزانية على
           يد البوت: 1.7+1.7 ثانية حجب للخيط مع يد غنية = «تجمّد المؤقت عند
           الثانية الأولى أو الثانية العكسية» — عطل المستخدم المُبلّغ. حذفه لا
           يغيّر أي سلوك. */
        /* [EXPERT-AI] افتتاح خبير يتجنّب حصار الورقتين —
           [PLAN-EXACT] خطة السحب المحفوظة أولاً (كل أوراقها ما زالت في اليد) */
        let openMove = null;
        if (!bot.hasOpened && bot._openPlanMove) {
          const pm = bot._openPlanMove;
          bot._openPlanMove = null;
          if (pm.cardIds.every(id => bot.hand.some(c => c.id === id))) openMove = pm;
        }
        if (!openMove && !bot.hasOpened) openMove = RamiExpertAI.expertOpening(this.game, bot);
        if (openMove && !bot.hasOpened) {
          const or = this.game.executeMove(openMove);
          if (or && (or.success || or.penaltyApplied)) this._botEmit('open', { playerId: bot.id, cardIds: openMove.cardIds, meldGroups: openMove.meldGroups || null });
          if (typeof SND !== 'undefined' && SND.card) SND.card();
          this._updateUI();
          // إذا أنهى الافتتاح الشوط مباشرة (نزول كامل اليد) نتوقف فوراً لتجنب إنهاء مزدوج
          if (this.game.gamePhase !== 'PLAYING') {
            setRamiBusy(false);
            this._endRoundUI();
            return;
          }
        }

        /* [EXPERT-AI] بعد الافتتاح: إنزال كل مجموعة مكتمّلة في اليد فوراً —
           أسرع طريق لتفريغ اليد والفوز، ويحمي ورقة المرموق من الجزاء.
           حركة حتمية بمعرّفات صريحة: تعمل محلياً وجماعياً بنفس النتيجة. */
        if (bot.hasOpened && rm.turnPhase !== 'WAITING_DRAW') {
          /* [DRAW-PLAN] خطة الإنزال المرافقة لسحب المرموق تُنفَّذ حرفياً أولاً */
          if (bot._drawPlanIds && bot._drawPlanIds.length) {
            const planIds = bot._drawPlanIds.filter(id => bot.hand.some(c => c.id === id));
            bot._drawPlanIds = null;
            if (planIds.length >= 3) {
              const pr = this.game.executeMove({ type: 'open', playerId: bot.id, cardIds: planIds });
              if (pr && pr.success) {
                this._botEmit('open', { playerId: bot.id, cardIds: planIds });
                if (typeof SND !== 'undefined' && SND.card) SND.card();
                this._updateUI();
                if (this.game.gamePhase !== 'PLAYING') { setRamiBusy(false); this._endRoundUI(); return; }
              }
            }
          }
          const handMelds = partitionSelectedCards(bot.hand.slice(), this.game.rules, undefined, RamiExpertAI.PARTITION_BUDGET_MS);
          if (handMelds && handMelds.length > 0) {
            let dumpIds = handMelds.flatMap(m => m.cards.map(c => c.id));
            /* [R15-FIX] يد كاملة القسمة: استثناء ورقة من مجموعة 4+ يترك ورقة
               الإنهاء = إنزال 14 وفوز قانوني فوري */
            if (bot.hand.length - dumpIds.length === 0) {
              let dropId = null;
              for (const m of handMelds) {
                if (m.cards.length < 4) continue;
                if (m.type === MELD_TYPE.SET) { dropId = m.cards[m.cards.length - 1].id; break; }
                const ordSeq = ramiOrderSequenceCards(m.cards.slice(), c => this.game.rules.isWildCard(c));
                const keptSeq = ordSeq.slice(0, -1);
                if (this.game.rules.isValidSequence(keptSeq, true)) { dropId = ordSeq[ordSeq.length - 1].id; break; }
                const keptSeq2 = ordSeq.slice(1);
                if (this.game.rules.isValidSequence(keptSeq2, true)) { dropId = ordSeq[0].id; break; }
              }
              if (dropId != null) dumpIds = dumpIds.filter(id => id !== dropId);
            }
            /* [EXPERT-AI] حارس الحصار: بعد الإنزال تتبقى 0/1 = فوز فوري،
               3+ = آمن، أما ورقتان فقط فتعني حصاراً دائماً (يد من ورقة
               لا يمكنها الفوز) — نؤجّل الإنزال دوراً آخر */
            const leftovers = bot.hand.length - dumpIds.length;
            /* [R15-FIX] بقايا 1 = فوز قانوني (تُرمى ورقة الإنهاء)، بقايا ≥3 آمنة؛
               بقايا 0 (يد كاملة بلا رمية) أو 2 (حصار) ممنوعة */
            if (dumpIds.length >= 3 && (leftovers === 1 || leftovers >= 3)) {
              const dres = this.game.executeMove({ type: 'open', playerId: bot.id, cardIds: dumpIds });
              if (dres && (dres.success || dres.penaltyApplied)) {
                this._botEmit('open', { playerId: bot.id, cardIds: dumpIds });
                if (typeof SND !== 'undefined' && SND.card) SND.card();
                this._updateUI();
                /* إن أفرد هذا الإنزال إنهاء الشوط (يد فارغة/ورقة واحدة) نتوقف فوراً */
                if (this.game.gamePhase !== 'PLAYING') {
                  setRamiBusy(false);
                  this._endRoundUI();
                  return;
                }
              }
            }
          }
        }

        /* [AI-FIX] توسيع المجموعات محلياً وجماعياً: في الجماعي يُبث كل إدراج
           كحركة addToMeld حتمية (playerId/meldIndex/cardId) فيتطابق كل الأطراف —
           كان الإدراج معطلاً في الغرف فيرمي البوت أوراق الإنهاء بدل إدراجها */
        if (bot.hasOpened && rm.tableMelds.length > 0) {
          /* [V19.2] الحرة تبقى حرة في دور إنزالها فقط: البوت لا يُدرج جوكراً
             أو مرموق الدور في مجموعة حرة أُنزلت هذا الدور؛ بعده يجوز */
          const botDrawn = bot.drawnDiscardCard || bot.drawnLaTourCard || null;
          /* [AI-FIX] بث الإدراج في الجماعي: تحديد صاحب المجموعة وفهرسها الحتميين */
          const emitLayOff = (meld, card) => {
            if (!this.multiplayer) return;
            for (const pOwner of this.game.players) {
              const mi = (pOwner.melds || []).indexOf(meld);
              if (mi !== -1) {
                this._botEmit('addToMeld', { playerId: bot.id, targetPlayerId: pOwner.id, meldIndex: mi, cardIdx: null, cardId: card.id });
                return;
              }
            }
          };
          const fitsMeld = (card) => {
            for (let mIdx = 0; mIdx < rm.tableMelds.length; mIdx++) {
              const meld = rm.tableMelds[mIdx];
              if (RamiExpertAI.canLayOff(this.game.rules, meld, card, botDrawn)) return meld;
            }
            return null;
          };
          const onCardLaidOff = (cId) => {
            if (bot.drawnDiscardCard && bot.drawnDiscardCard.id === cId) bot.drawnDiscardCard = null;
            if (bot.drawnLaTourCard && bot.drawnLaTourCard.id === cId) bot.drawnLaTourCard = null;
            bot.tookLaTour = false;
          };
          const trySwapJoker = (card) => {
            for (const meld of rm.tableMelds) {
              if (typeof meld.findJokerSwapIndex === 'function') {
                const swapIdx = meld.findJokerSwapIndex(card, this.game.rules);
                if (swapIdx !== -1) {
                  const jokerCard = meld.cards[swapIdx];
                  for (const pOwner of this.game.players) {
                    const mi = (pOwner.melds || []).indexOf(meld);
                    if (mi !== -1 && this.multiplayer) {
                      this._botEmit('addToMeld', { playerId: bot.id, targetPlayerId: pOwner.id, meldIndex: mi, cardIdx: swapIdx, cardId: card.id });
                      break;
                    }
                  }
                  bot.removeCard(card.id);
                  meld.cards[swapIdx] = card;
                  bot.hand.push(jokerCard);
                  onCardLaidOff(card.id);
                  return true;
                }
              }
            }
            return false;
          };
          /* [EXPERT-AI] أولاً — إلزامي بأي حجم يد: ورقة المرموق/لا تور المسحوبة
             إن كانت تطابق الطاولة تُنزَّل فوراً (وإلا ارتدّت بجزاء 71) */
          const drawnCard = bot.drawnDiscardCard || bot.drawnLaTourCard;
          if (drawnCard) {
            if (!trySwapJoker(drawnCard)) {
              const meld = fitsMeld(drawnCard);
              if (meld) {
                emitLayOff(meld, drawnCard);   /* [AI-FIX] البث قبل التطبيق المحلي */
                bot.removeCard(drawnCard.id);
                meld.cards.push(drawnCard);
                onCardLaidOff(drawnCard.id);
              }
            }
          }
          /* [EXPERT-AI] ثم بقية الأوراق فوق 3 فقط (منع الحصار بعد الرمي) */
          const botCards = bot.hand.slice();
          for (const card of botCards) {
            if (bot.hand.length <= 3) break;
            if (!trySwapJoker(card)) {
              const meld = fitsMeld(card);
              if (meld) {
                emitLayOff(meld, card);   /* [AI-FIX] */
                bot.removeCard(card.id);
                meld.cards.push(card);
                onCardLaidOff(card.id);
              }
            }
          }
          /* [AI-FIX] إنقاذ من 3 أوراق: إن كانت ورقتان تدخلان الطاولة، إدراجهما
             يترك ورقة الإنهاء وحدها = فوز فوري (كان البوت يفوّت هذا الإنهاء) */
          if (bot.hand.length === 3) {
            const fitting = bot.hand.filter(c => fitsMeld(c) || (typeof c === 'object' && rm.tableMelds.some(m => typeof m.findJokerSwapIndex === 'function' && m.findJokerSwapIndex(c, this.game.rules) !== -1)));
            if (fitting.length >= 2) {
              for (let fi = 0; fi < fitting.length && bot.hand.length > 1; fi++) {
                const card = fitting[fi];
                if (!trySwapJoker(card)) {
                  const meld3 = fitsMeld(card);
                  if (meld3) {
                    emitLayOff(meld3, card);
                    bot.removeCard(card.id);
                    meld3.cards.push(card);
                    onCardLaidOff(card.id);
                  }
                }
              }
            }
          }
          /* [EXPERT-AI] إنقاذ من ورقتين: إدراج إحداهما في الطاولة ثم رمي
             الأخيرة = فوز فوري (الأولى ثم الثانية) */
          if (bot.hand.length === 2) {
            for (let ci = 0; ci < 2 && bot.hand.length === 2; ci++) {
              const card = bot.hand[ci];
              if (!card) break;
              if (!trySwapJoker(card)) {
                const meld2 = fitsMeld(card);
                if (meld2) {
                  emitLayOff(meld2, card);
                  bot.removeCard(card.id);
                  meld2.cards.push(card);
                  onCardLaidOff(card.id);
                }
              }
            }
          }
        }

        /* [V19] السامبل: الإنهاء المباشر من اليد الكاملة مسموح حتى دون افتتاح سابق */
        if ((bot.hasOpened || this.game.rules.mode !== 'talaj') && this.game.canFinish(bot)) {
          const finishRes = this.game.executeMove({ type: 'finish', playerId: bot.id });
          if (finishRes && (finishRes.success || finishRes.penaltyApplied)) {
            this._botEmit('finish', { playerId: bot.id, isolateCardId: null });
            setRamiBusy(false);
            /* [R7-FIX] شوط واحد: _endRound يقفز مباشرة إلى MATCH_END — يجب كشف الحالتين
               وإلا تبقى الواجهة على الطاولة الحية بعد فوز البوت (تجمّد يراه المستخدم) */
            if (this.game.gamePhase === 'ROUND_END' || this.game.gamePhase === 'MATCH_END') {
              this._endRoundUI();
            } else {
              this._processTurn();
            }
            return;
          }
        }

        /* [V29] رمي البوت مع فحص النتيجة: إن فشل الرمي تُرمى ورقة قسرياً (منع بقاء 15 ورقة) */
        let discarded = false, discardedCardId = null;
        const discardMoves = this.game.getLegalMoves(bot.id).filter(m => m.type === 'discard');
        if (discardMoves.length > 0) {
          /* [EXPERT-AI] ورقة الرمي المثلى بدل العشوائية */
          const expertId = RamiExpertAI.chooseDiscard(this.game, bot);
          const discardMove = discardMoves.find(m => m.cardId === expertId) || discardMoves[0];
          const dr = this.game.executeMove(discardMove);
          if (dr && dr.success) { discarded = true; discardedCardId = discardMove.cardId; }
          else if (dr && dr.penaltyApplied) { discarded = true; discardedCardId = discardMove.cardId; } /* جزاء المرموق مرّر الدور داخلياً */
          if (typeof SND !== 'undefined' && SND.card) SND.card();
        }
        if (!discarded && this.game.gamePhase === 'PLAYING' && bot.hand.length > 0) {
          /* محاولة قسرية أخيرة: إزالة ورقة زائدة إذا بقي فوق الحد أو أي ورقة باليد */
          if (rm.turnPhase === 'WAITING_DISCARD') {
            const forced = bot.hand[bot.hand.length - 1];
            const fr = this.game.executeMove({ type: 'discard', playerId: bot.id, cardId: forced.id });
            if (fr && (fr.success || fr.penaltyApplied)) { discarded = true; discardedCardId = forced.id; }
          }
        }
        if (discarded && discardedCardId != null) this._botEmit('discard', { playerId: bot.id, cardId: discardedCardId });

        /* [FALLBACK-ADVANCE] إن بقي الدور عند هذا البوت ولم يتقدم، نمرر الدور فوراً لمنع التجمد وتصفير المؤقت المتكرر */
        if (this.game.gamePhase === 'PLAYING' && rm.getCurrentPlayer() && rm.getCurrentPlayer().id === bot.id) {
          rm.nextPlayer();
        }

        setRamiBusy(false);
        /* [R7-FIX] نهاية مباراة الشوط الواحد تصل هنا كـ MATCH_END لا ROUND_END —
           الفحص الضيق كان يترك الواجهة مجمدة على الطاولة بعد رمي البوت الورقة الأخيرة */
        if (this.game.gamePhase === 'ROUND_END' || this.game.gamePhase === 'MATCH_END') {
          this._endRoundUI();
        } else {
          this._processTurn();
        }
        } catch (e) {
          console.error('[Rami] bot turn error:', e && e.message, e);
          if (!this._botContextIsCurrent(botContext)) return;
          setRamiBusy(false);
          if (this.game && this.game.gamePhase === 'PLAYING') {
            if (rm.getCurrentPlayer() && rm.getCurrentPlayer().id === bot.id) {
              rm.nextPlayer();
            }
            this._processTurn();
          }
        }
      }, 450, botContext);
      } catch (e) {
        console.error('[Rami] bot draw error:', e && e.message, e);
        if (!this._botContextIsCurrent(botContext)) return;
        setRamiBusy(false);
        if (this.game && this.game.gamePhase === 'PLAYING') {
          if (rm.getCurrentPlayer() && rm.getCurrentPlayer().id === bot.id) {
            rm.nextPlayer();
          }
          this._processTurn();
        }
      }
    }, 350, botContext);
  }

  toggleHumanAutoPlay() {
    const player = this.players()[0];
    if (!player) return;
    player.isAutoPlay = !player.isAutoPlay;
    if (!player.isAutoPlay) {
      player.consecutiveAutoTurns = 0;
      _ramiToast('✅ ' + (_ramiT('rami.autoDisabled') || 'تم إلغاء اللعب الأوتوماتيكي واستعادة التحكم اليدوي'), 'ok');
    } else {
      _ramiToast('🤖 ' + (_ramiT('rami.autoEnabled') || 'تم تفعيل اللعب الأوتوماتيكي'), 'info');
    }
    this._updateControls();
  }

  _distributeCardsToSlots(cards) {
    const slots = [[], [], [], [], []];
    if (!cards || cards.length === 0) return slots;

    const rules = this.game ? this.game.rules : new RamiRules('talaj');
    const melds = partitionSelectedCards(cards, rules);

    const placedIds = new Set();
    let slotIdx = 0;

    if (melds && melds.length > 0) {
      for (const m of melds) {
        if (slotIdx < 4) {
          /* [V16] كل مجموعة في خانة مستقلة ومرتبة: المتتاليات تصاعدياً (الجوكر في فجوة/طرفه) */
          const ordered = (m.type === MELD_TYPE.SEQUENCE)
            ? ramiOrderSequenceCards(m.cards.slice(), c => rules.isWildCard(c))
            : m.cards.slice();
          slots[slotIdx] = ordered;
          m.cards.forEach(c => placedIds.add(c.id));
          slotIdx++;
        }
      }
    }

    const remaining = cards.filter(c => !placedIds.has(c.id));
    if (slotIdx === 0) {
      for (let i = 0; i < remaining.length; i++) {
        const s = Math.min(Math.floor(i / 3), 4);
        slots[s].push(remaining[i]);
      }
    } else {
      for (let i = 0; i < remaining.length; i++) {
        const s = Math.min(slotIdx + Math.floor(i / 3), 4);
        slots[s].push(remaining[i]);
      }
    }
    return slots;
  }

  _updateUI() {
    if (!this.game) return;

    const rm = this.game.roundManager;
    const curIdx = this.game.currentPlayerIndex;
    const players = this.game.players;
    const isSpec = !!this.isSpectator;
    const myId = isSpec ? -1 : (this.myPlayerId || 0);
    /* [Spectator] المتفرج يرى كل اللاعبين كمقاعد (يد كل لاعب = عددها فقط) */
    const otherPlayers = isSpec ? players.slice() : players.filter((p, i) => i !== myId);
    const humanPlayer = isSpec ? null : players[myId];

    /* 1. مقاعد الخصوم مكدّسة عمودياً فوق اللاعب الرئيسي (لا مقاعد جانبية):
          الأعلى: AI4 ثم AI3 … الأسفل (الأقرب للاعب): AI2 ثم AI1.
          كل مقعد = صف أفقي: أوراق على اليسار + HUD (أيقونة/اسم/نقاط/مؤقت) على اليمين.
          مركز الطاولة (المجرف/المرموق) يفصل بين المجموعة العلوية والسفلية. */
    const seatsAboveEl = document.getElementById('ramiSeatsAbove');
    const seatsBelowEl = document.getElementById('ramiSeatsBelow');
    const oppCount = otherPlayers.length;
    const aboveCount = Math.floor(oppCount / 2);
    const isLandscape = (typeof window !== 'undefined') ? (window.innerWidth > window.innerHeight) : false;
    let abovePlayers, belowPlayers;
    if (oppCount === 4 && isLandscape) {
      /* [V28] لاندسكيب: AI2 يمين أعلى، AI3 يسار أعلى؛ AI1 يمين أسفل، AI4 يسار أسفل */
      abovePlayers = [otherPlayers[1], otherPlayers[2]]; // AI2, AI3
      belowPlayers = [otherPlayers[0], otherPlayers[3]]; // AI1, AI4
    } else {
      abovePlayers = otherPlayers.slice(oppCount - aboveCount, oppCount).reverse();
      belowPlayers = otherPlayers.slice(0, oppCount - aboveCount).reverse();
    }

    const gameRules = this.game.rules;

    const renderSeat = function (p, countMode) {
      const isCurrent = (p.id === players[curIdx].id);
      const isDealer = (p.id === rm.dealerIndex);
      const dealerIcon = isDealer ? ' ♛' : '';
      const activeCls = isCurrent ? ' active' : '';
      const activeHalo = isCurrent ? ' active-turn-halo' : '';
      const initials = getPlayerInitials(p.name, p.id);
      const timerHtml = '<span class="rami-avatar-timer">' + rm.turnSecondsRemaining + 's</span>';

      /* [V19] خمس خانات ثابتة (مثل اللاعب الرئيسي): المجموعات المنزلة أولاً وجوهاً،
         ثم أوراق اليد المتبقية ظهوراً موزعة على باقي الخانات. */
      const slots = [[], [], [], [], []];
      const slotMeld = [-1, -1, -1, -1, -1];
      let si = 0;
      if (p.melds && p.melds.length) {
        for (let mi = 0; mi < p.melds.length && si < 5; mi++) {
          if (!p.melds[mi].cards || !p.melds[mi].cards.length) continue;
          /* [V28] المتتاليات تُعرض مرتبة من الأصغر للأكبر (يمين←يسار) حتى لو لم تكن مرتّبة في الخانة */
          if (p.melds[mi].type === MELD_TYPE.SEQUENCE) {
            slots[si] = ramiOrderSequenceCards(p.melds[mi].cards.slice(), c => gameRules.isWildCard(c));
          } else {
            slots[si] = p.melds[mi].cards.slice();
          }
          slotMeld[si] = mi;
          si++;
        }
      }
      if (!countMode) {
        for (let c = 0; c < p.hand.length; c++) {
          const s = Math.min(si + Math.floor(c / 3), 4);
          slots[s].push(null); /* null = ظهر ورقة */
        }
      }
      let lineHtml = '<div class="rami-seat-line line-h line-slots" title="يد ' + p.name + ' — ' + p.hand.length + ' ورقة">';
      for (let s = 0; s < 5; s++) {
        const isEmpty = slots[s].length === 0;
        lineHtml += '<span class="rami-opp-slot' + (isEmpty ? ' empty' : '') + '" data-slot="' + s + '">';
        for (let ci = 0; ci < slots[s].length; ci++) {
          const card = slots[s][ci];
          if (card === null) {
            lineHtml += getRamiCardHTML(null, true, 'mini-back');
          } else {
            const mIdx = slotMeld[s];
            /* [V28] تمرير فهرس الورقة لتمييز الورقة الصغيرة عن الكبيرة عند إدراج الجوكر */
            lineHtml += '<span class="mini-meld-wrap" onclick="ramiAddCardToTableMeld(' + p.id + ',' + mIdx + ',' + ci + ')" title="إضافة ورقة أو استبدال الجوكر">' +
              getRamiCardHTML(card, false, 'mini-meld') +
            '</span>';
          }
        }
        lineHtml += '</span>';
      }
      lineHtml += '</div>';
      /* [Spectator] شارة عدد الأوراق المخفية بدل إظهار الوجوه */
      if (countMode) {
        lineHtml += '<span class="rami-spec-count">' + _ramiF('rami.specHandCount', '🃏 {n} ورقة', { n: p.hand.length }) + '</span>';
      }

      return '<div class="rami-seat-node seat-row' + activeCls + activeHalo + '">' +
        '<div class="rami-seat-hud">' +
          '<div class="rami-avatar-wrap">' +
            '<div class="rami-avatar-circle' + (isCurrent ? ' active' : '') + '">' + initials + '</div>' +
          '</div>' +
          '<span class="rami-node-score">' + p.totalScore + (p.isEliminated ? ' 🚫' : '') + '</span>' +
          '<span class="rami-dealer-crown">' + (isDealer ? '♛' : '') + '</span>' +
          timerHtml +
        '</div>' +
        lineHtml +
      '</div>';
    };

    if (seatsAboveEl) {
      let html = '';
      for (let i = 0; i < abovePlayers.length; i++) html += renderSeat(abovePlayers[i], isSpec);
      seatsAboveEl.innerHTML = html;
    }
    if (seatsBelowEl) {
      let html = '';
      for (let i = 0; i < belowPlayers.length; i++) html += renderSeat(belowPlayers[i], isSpec);
      seatsBelowEl.innerHTML = html;
    }

    /* 2. مركز الطاولة: أوراق التوزيع (المجرف) + أوراق المرموق (المهملة) — فيكتور نقي 100% في المركز الهندسي بدون عدادات أو أيقونات إضافية */
    const centerEl = document.getElementById('ramiTableCenter');
    if (centerEl) {
      let centerHtml = '<div class="rami-piles-row">';

      /* الأوراق المتخلص منها (المرموق) أولاً على اليسار، ثم المجرف (المقلوب) على اليمين */
      if (rm.discardPile.length > 0) {
        const topDiscard = rm.discardPile[rm.discardPile.length - 1];
        const isLaTour = (rm.laTourCard && topDiscard.id === rm.laTourCard.id);
        const laTourBadge = (isLaTour && rm.isFirstTourCycle) ? '<span class="rami-pile-label" style="background:#10B981;color:#fff">👑 لا تور</span>' : '';
        
        centerHtml += '<div class="rami-discard-box" data-ramidraw="discard" title="' + (isLaTour ? 'اضغط مرتين لأخذ ورقة لا تور' : 'اضغط مرتين لأخذ المرموق') + '">' +
          getRamiCardHTML(topDiscard, false) +
          laTourBadge +
        '</div>';
      }

      // أوراق التوزيع (المجرف) — مقلوبة، على يمين المرموق
      centerHtml += '<div class="rami-deck-box" data-ramidraw="deck" title="اضغط مرتين لسحب ورقة من المجرف">' +
        getRamiCardHTML(null, true) +
      '</div>';

      // [V19] ورقة الفوجوك في السامبل — قابلة للسحب في الدورة الأولى فقط (نقرتان)
      if (rm.jokerIndicator) {
        const fojokOpen = rm.isFirstTourCycle;
        centerHtml += '<div class="rami-indicator-box"' +
          (fojokOpen ? ' data-ramidraw="fojok"' : '') +
          ' title="' + (fojokOpen ? 'الفوجوك — اضغط مرتين لسحبها (الدور الأول فقط)' : 'الفوجوك — انتهى الدور الأول؛ تُخلط مع المرموق عند نفاد ورق التوزيع') + '"' +
          (fojokOpen ? '' : ' style="opacity:.55"') + '>' +
          getRamiCardHTML(rm.jokerIndicator, false) +
          '<span class="rami-pile-label" style="background:#F59E0B;color:#111">فوجوك</span>' +
        '</div>';
      } else if (this.game && this.game.mode !== 'talaj' && rm.jokerIndicatorInfo) {
        /* الفوجوك سُحبت/خُلطت — يبقى تعريف الجوكر ظاهراً كوصف */
        const info = rm.jokerIndicatorInfo;
        const rname = RAMI_RANK_NAMES[info.rank - 1] || info.rank;
        const indRed = (RAMI_SUIT_COLOR[info.suit] === 'red');
        const jColorName = indRed ? 'الأسود' : 'الأحمر';
        /* [V19b] وصف مضغوط بمقياس الطاولة (em لا rem) — بحجم ورقة تقريباً كي لا يزاحم
           عنوان سامبل وهدف الجولة ومجموع الرهان خارج المركز */
        centerHtml += '<div class="rami-indicator-box" title="جوكر الجولة: ' + rname + ' باللون ' + jColorName + '" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:1.2em;border:1px dashed rgba(245,158,11,.6);border-radius:0.12em;padding:0.04em 0.06em;box-sizing:border-box;cursor:default">' +
          '<span style="font-size:0.22em;font-weight:700;color:#F59E0B;line-height:1.2;white-space:nowrap">الجوكر</span>' +
          '<span style="font-size:0.3em;font-weight:800;line-height:1.25;white-space:nowrap;color:' + (indRed ? '#E5E7EB' : '#F87171') + '">' + rname + ' ' + jColorName + '</span>' +
        '</div>';
      }

      centerHtml += '</div>';
      centerEl.innerHTML = centerHtml;
    }

    /* 3. أوراق اللاعب المنزلة تعرض داخل خانات يده بحلقة ذهبية (لا فوق شريط التحكم) */
    const humanMeldsEl = document.getElementById('ramiHumanMeldsArea');
    if (humanMeldsEl) humanMeldsEl.innerHTML = '';

    /* 4 + 5. [Spectator] المتفرج: شريط مراقبة + زر طلب الانضمام بدل أزرار اللعب واليد */
    if (this.isSpectator) {
      this._renderSpectatorBar();
    } else {
      /* شريط أزرار اللعب والتحكم الموحد والأنيق بخلفية شفافة بدون آلة حاسبة */
      this._updateControls();
      /* يد اللاعب البشري في الخانات الخمس التفاعلية */
      this._updateHand();
    }

    /* 6. [V18] الفرد الهندسي لأوراق الخصوم: ملء كامل المساحة بلا إخفاء */
    this._fitSeatLines();
  }

  /* [V18] فرد هندسي: كل صف خصوم يملأ عرضه بتراكب موحّد، وكل ورقة يبقى منها ≥ 30% ظاهراً.
     وتُكبَّر الأوراق حسب ارتفاع الصف المتاح (حسب مساحة الشاشة). */
  _fitSeatLines() {
    if (typeof document === 'undefined') return;
    const cardW = this._cardWpx();
    const seats = document.querySelectorAll('.rami-seat-node.seat-row');
    for (const seat of seats) {
      const line = seat.querySelector('.rami-seat-line.line-slots');
      if (!line) continue;
      /* 1) القياس العمودي: كبّر الورقة لملء ارتفاع الخانات (بعد خصم ارتفاع شريط HUD) */
      const hud = seat.querySelector('.rami-seat-hud');
      const seatH = seat.clientHeight;
      const hudH = hud ? hud.clientHeight : 0;
      const lineH = Math.max(4, seatH - hudH);
      const baseH = cardW * 1.48;
      let sc = (lineH > 4) ? Math.min(1.35, lineH / baseH) : 1;
      sc = Math.max(0.5, sc);
      line.style.setProperty('--seat-sc', sc.toFixed(3));
      /* 2) تراكب داخل كل خانة: يملأ عرض الخانة، بحد أدنى 25% وحد أقصى 70% تغطية */
      const slots = line.querySelectorAll('.rami-opp-slot');
      for (const slot of slots) {
        const cards = slot.querySelectorAll('.mini-back, .mini-meld-wrap');
        const N = cards.length;
        if (N <= 1) { slot.style.setProperty('--slot-ov', '0px'); continue; }
        const sample = cards[0].querySelector('.mini-back, .mini-meld') || cards[0];
        const w = sample.getBoundingClientRect().width || cardW;
        const avail = slot.clientWidth;
        let ov = (w * N - avail) / (N - 1);
        const maxOv = w * 0.7;
        if (ov > maxOv) ov = maxOv;
        if (ov < w * 0.25) ov = w * 0.25;
        if (ov < 0) ov = 0;
        slot.style.setProperty('--slot-ov', (-ov).toFixed(1) + 'px');
      }
    }
  }

    _updateControls() {
    const controls = document.getElementById('ramiActionDock');
    if (!controls || !this.game) return;

    const rm = this.game.roundManager;
    const curIdx = this.game.roundManager.currentPlayerIndex;
    const players = this.game.players;
    const humanPlayer = players[this.myPlayerId || 0];
    const isCurrent = (humanPlayer && humanPlayer.id === players[curIdx].id);
    const isDealer = (humanPlayer && humanPlayer.id === rm.dealerIndex);
    const dealerIcon = isDealer ? ' ♛' : '';
    const initials = (typeof ST !== 'undefined' && ST.user && ST.user.username) ? ST.user.username.slice(0, 2).toUpperCase() : '👤';

    const threshold = this.game.rules.openingThreshold;

    let html = '';

    // [V25] أقصى اليسار: زر افتتاح / إنزال الأوراق (أصفر)
    const isReady = (humanPlayer && humanPlayer.hasOpened);
    const openPending = ramiConfirmPending('open');
    const openCls = (isReady ? 'rbtn rbtn-open ready' : 'rbtn rbtn-open') + (openPending ? ' confirm-pending' : '');
    const modeName = _ramiT(this.game.mode === 'talaj' ? 'rami.talaj' : 'rami.simple', this.game.mode === 'talaj' ? 'طالاج' : 'سامبل');
    const openTitle = (isReady ? 'إنزال مجموعات جديدة' : ('إظهار الأوراق (' + modeName + ' ≥ ' + threshold + ')')) + ' — اضغط مرتين للتأكيد';
    html += '<button class="' + openCls + '" onclick="ramiOpenMelds()" title="' + openTitle + '">' +
      '<i class="fa-solid fa-lock-open"></i> ' + (_ramiT('rami.open') || 'افتتاح') +
    '</button>';

    // [V25] الوسط: المؤقت ثم الأيقونة ثم النقاط
    const activeHalo = isCurrent ? ' active-turn-halo' : '';
    const timerDigits = '<span class="rami-avatar-timer" id="ramiTimerDisplay">' + rm.turnSecondsRemaining + 's</span>';
    html += '<div class="rami-dock-center' + activeHalo + '">' +
      timerDigits +
      '<div class="rami-avatar-wrap" style="background:transparent;border:none;box-shadow:none;padding:0;">' +
        '<div class="rami-avatar-circle' + (isCurrent ? ' active' : '') + '">' + initials + '</div>' +
      '</div>' +
      '<span class="rami-node-score">' + (humanPlayer ? humanPlayer.totalScore : 0) + dealerIcon + '</span>' +
      this._isolateSlotHtml() +
    '</div>';

    // [V25] أقصى اليمين: زر إنهاء الشوط — يتطلب تأكيداً بالنقرة الثانية
    const finishPending = ramiConfirmPending('finish');
    html += '<button class="rbtn rbtn-finish' + (finishPending ? ' confirm-pending' : '') + '" onclick="ramiAction(\'finish\')" title="إنهاء الشوط — اضغط مرتين للتأكيد">' +
      '<i class="fa-solid fa-trophy"></i> ' + (_ramiT('rami.finish') || 'إنهاء') +
    '</button>';

    // زر إلغاء التحديد إن وُجدت أوراق محددة
    if (this.selectedCards.size > 0) {
      html += '<button class="rbtn rbtn-clear" onclick="ramiClearSelection()" title="إلغاء التحديد"><i class="fa-solid fa-xmark"></i></button>';
    }

    // زر إلغاء اللعب التلقائي إن كان مفعلاً
    if (humanPlayer && humanPlayer.isAutoPlay) {
      html += '<button class="rbtn btn-cancel-auto" onclick="ramiToggleAutoPlay()"><i class="fa-solid fa-hand"></i> ' + (_ramiT('rami.cancelAuto') || 'إلغاء التلقائي') + '</button>';
    }

    controls.innerHTML = html;
  }

  /* خانة العزل (بجنب تاج التوزيع): تعرض الورقة المعزولة إن وُجدت، وإلا مكاناً فارغاً.
     تُقبل السحب والإفلات والنقر (تحديد ورقة مسبقاً ثم نقرها). الورقة المعزولة تُستثنى من
     المجموعات الخمس عند الافتتاح/الإنهاء وتُقلب كالورقة الأخيرة قانوناً. */
  _isolateSlotHtml() {
    const p = this.players()[0];
    if (!p || !p.hand) return '';
    const isoId = this.isolateCardId;
    if (isoId) {
      const card = p.hand.find(c => c.id === isoId);
      if (card) {
        return '<div class="rami-isolate-slot filled" id="ramiIsolateSlot" onclick="ramiClickIsolateSlot(event)" title="' + (_ramiT('rami.isolateClear', 'إرجاع الورقة المعزولة لليد')) + '">' +
          '<div class="rami-isolate-card">' + getRamiCardHTML(card, false) + '</div>' +
        '</div>';
      }
      this.isolateCardId = null;
    }
    return '<div class="rami-isolate-slot" id="ramiIsolateSlot" onclick="ramiClickIsolateSlot(event)" title="' + (_ramiT('rami.isolateSlot', 'ضع هنا الورقة المعزولة')) + '">' +
      '<span class="rami-isolate-ph">♛</span>' +
    '</div>';
  }

    /* معرفات الأوراق المنزلة (في مجموعات اللاعب أو مجموعات الطاولة) — تعرض بحلقة ذهبية */
  _meldedCardIds() {
    const ids = new Set();
    const p = this.players()[0];
    if (p && p.melds) {
      for (const m of p.melds) for (const c of m.cards) ids.add(c.id);
    }
    const rm = this.game && this.game.roundManager;
    if (rm && rm.tableMelds) {
      for (const m of rm.tableMelds) for (const c of m.cards) ids.add(c.id);
    }
    return ids;
  }

  /* الخانات اليدوية فقط (دون الأوراق المنزلة) — للمنطق الذي يحتاج يد اللاعب الحرة */
  _activeHandSlots() {
    const melded = this._meldedCardIds();
    return this.handSlots.map(s => s.filter(c => !melded.has(c.id)));
  }

  /* صاحب المجموعة المنزلة وفهرسها وفهرس الورقة داخلها (للتركيب/استبدال الجوكر مع موضع النقر) */
  _meldOwnerIndex(cardId) {
    const g = this.game;
    if (!g) return null;
    for (const p of g.players) {
      if (!p.melds) continue;
      for (let m = 0; m < p.melds.length; m++) {
        const ci = p.melds[m].cards.findIndex(c => c.id === cardId);
        if (ci !== -1) return { owner: p.id, idx: m, cardIdx: ci };
      }
    }
    return null;
  }

  _updateHand() {
    const slotsContainer = document.getElementById('rami5SlotsContainer');
    if (!slotsContainer || !this.game) return;

    const player = this.players()[0];
    if (!player || (!player.hand && !player.melds)) { slotsContainer.innerHTML = ''; return; }

    /* حراسة: الورقة المعزولة تبقى خارج الخانات الخمس؛ إن لم تعد في اليد يُلغى العزل */
    if (this.isolateCardId && (!player.hand || !player.hand.find(c => c.id === this.isolateCardId))) {
      this.isolateCardId = null;
    }

    const needsRebuild = !this.handSlots || this.handSlots.length !== 5 ||
      (this.handSlots.every(s => s.length === 0) && ((player.hand && player.hand.length > 0) || (player.melds && player.melds.length > 0)));

    if (needsRebuild) {
      this.handSlots = [[], [], [], [], []];
      let si = 0;
      if (player.melds && player.melds.length > 0) {
        for (let mi = 0; mi < player.melds.length && si < 5; mi++) {
          const m = player.melds[mi];
          if (!m.cards || !m.cards.length) continue;
          const ord = (m.type === MELD_TYPE.SEQUENCE)
            ? ramiOrderSequenceCards(m.cards.slice(), c => this.game.rules.isWildCard(c))
            : m.cards.slice();
          this.handSlots[si] = ord;
          si++;
        }
      }
      const unmeldedHand = this.isolateCardId ? (player.hand || []).filter(c => c.id !== this.isolateCardId) : (player.hand || []);
      if (si === 0) {
        this.handSlots = this._distributeCardsToSlots(unmeldedHand);
      } else {
        let targetSlot = Math.min(si, 4);
        for (const card of unmeldedHand) {
          this.handSlots[targetSlot].push(card);
        }
      }
    } else {
      /* نحافظ على أوراق اليد والأوراق المنزلة معاً في الخانات؛
         الورقة المرمية تُحذف لأنها ليست في اليد ولا في المنزلات */
      const meldedIds = this._meldedCardIds();
      const keepIds = new Set((player.hand || []).map(c => c.id));
      meldedIds.forEach(id => keepIds.add(id));
      const placedIds = new Set();
      for (let s = 0; s < 5; s++) {
        this.handSlots[s] = this.handSlots[s].filter(c => keepIds.has(c.id));
        this.handSlots[s].forEach(c => placedIds.add(c.id));
      }
      /* ضمان وجود كل أوراق المجموعات المنزلة في الخانات */
      if (player.melds && player.melds.length > 0) {
        for (const m of player.melds) {
          const unplaced = m.cards.filter(c => !placedIds.has(c.id));
          if (unplaced.length > 0) {
            let emptySlot = this.handSlots.findIndex(s => s.length === 0);
            if (emptySlot === -1) {
              emptySlot = 0;
              for (let s = 1; s < 5; s++) {
                if (this.handSlots[s].length < this.handSlots[emptySlot].length) emptySlot = s;
              }
            }
            const ord = (m.type === MELD_TYPE.SEQUENCE)
              ? ramiOrderSequenceCards(unplaced, c => this.game.rules.isWildCard(c))
              : unplaced;
            this.handSlots[emptySlot].push(...ord);
            unplaced.forEach(c => placedIds.add(c.id));
          }
        }
      }
      for (const card of (player.hand || [])) {
        if (this.isolateCardId && card.id === this.isolateCardId) continue; /* المعزولة تبقى بخارج الخانات */
        if (!placedIds.has(card.id)) {
          // وضع الورقة الجديدة في الخانة ذات الأقل أوراقاً
          let minSlot = 0;
          for (let s = 1; s < 5; s++) {
            if (this.handSlots[s].length < this.handSlots[minSlot].length) minSlot = s;
          }
          this.handSlots[minSlot].push(card);
          placedIds.add(card.id);
        }
      }
    }

    const meldedIds = this._meldedCardIds();
    let slotsHtml = '';
    for (let s = 0; s < 5; s++) {
      const slotCards = this.handSlots[s];
      let cardsHtml = '';
      
      for (let i = 0; i < slotCards.length; i++) {
        const card = slotCards[i];
        const isMelded = meldedIds.has(card.id);
        const selected = !isMelded && this.selectedCards.has(card.id);
        const cls = (isMelded ? ' melded' : '') + (selected ? ' selected' : '');
        const selBadge = selected ? '<span class="card-sel-badge">✓</span>' : '';
        /* [V15/V28] الورقة المنزلة (حلقة ذهبية) قابلة للنقر كهدف للتركيب/الاستبدال، مع فهرسها
           لتمييز الورقة الصغيرة (يمين) عن الكبيرة (يسار) عند إدراج الجوكر */
        let meldOnClick = '';
        if (isMelded) {
          const mi = this._meldOwnerIndex(card.id);
          if (mi) meldOnClick = ' onclick="ramiAddCardToTableMeld(' + mi.owner + ',' + mi.idx + ',' + mi.cardIdx + ')" ';
        }

        cardsHtml += '<div class="rami-card-wrap' + cls + '" ' +
          'data-id="' + card.id + '" data-slot="' + s + '" ' +
          (isMelded ? 'data-melded="1" ' : '') +
          meldOnClick +
          'title="' + card.displayName + '" role="button" aria-label="' + card.displayName + '">' +
          getRamiCardHTML(card, false) +
          selBadge +
        '</div>';
      }

      slotsHtml += '<div class="rami-slot-box" ' +
        'data-slot="' + s + '" ' +
        'onclick="ramiClickSlot(' + s + ', event)" title="نقل الأوراق المحددة إلى هذه الخانة">' +
        '<div class="rami-slot-cards">' + cardsHtml + '</div>' +
      '</div>';
    }

    slotsContainer.innerHTML = slotsHtml;
    this._fitSlotOverlaps(slotsContainer);
  }

  players() {
    if (!this.game) return [];
    /* وضع الغرفة: لاعبي هو players[myPlayerId]؛ اللعب الفردي: 0 (الإنسان) */
    return [this.game.players[this.myPlayerId || 0]];
  }

  _cardImage(card) {
    if (!card) return 'assets/cards/back.webp';
    if (card.isJoker) return 'assets/cards/joker1.webp';
    const rankStr = RAMI_RANK_NAMES[card.rank - 1] || 'A';
    const suitKey = RAMI_SUIT_ASSET[card.suit] || 'spades';
    return 'assets/cards/' + rankStr + '-' + suitKey + '.webp';
  }

  _endRoundUI() {
    if (!this.game) return;
    /* [V19.6] تجميد لقطة الإنهاء 6 ثوانٍ: يشاهد اللاعبون أوراق الإنهاء
       (مجموعات الفائز المنزلة ويده الفارغة) قبل نافذة نهاية الشوط.
       يُنفَّذ مرة واحدة لكل شوط مهما تكررت استدعاءات _endRoundUI. */
    if (this._endFreezeTimer) return;                    /* تجميد جارٍ */
    const freezeKey = (this.game.roundManager.roundNumber || 0) + ':' + this.game.gamePhase;
    if (this._endFreezeDone === freezeKey) return this._endRoundUIShow();
    this._endFreezeDone = freezeKey;

    /* لقطة الإنهاء النهائية على الطاولة (آخر تحديث للمقاعد والمجموعات) */
    try { this._updateUI(); } catch (e) {}

    /* بانر التجميد مع عدّاد تنازلي */
    let banner = null;
    try {
      banner = document.createElement('div');
      banner.id = 'ramiEndFreezeBanner';
      banner.setAttribute('dir', 'rtl');
      banner.style.cssText = 'position:fixed;top:12%;left:50%;transform:translateX(-50%);z-index:9999;' +
        'background:rgba(8,25,16,0.92);border:1px solid var(--gold,#FFD23F);border-radius:12px;' +
        'padding:10px 18px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,0.55);pointer-events:none;';
      const wName = (this.game.roundManager.lastWinner && this.game.roundManager.lastWinner.name) || '';
      banner.innerHTML = '<div style="font-size:0.95rem;font-weight:800;color:var(--gold,#FFD23F);">' +
          '🏆 ' + _ramiF('rami.endFreezeTitle', 'انتهى الشوط — فاز {w}', { w: wName }) + '</div>' +
        '<div style="font-size:0.72rem;color:rgba(255,255,255,0.85);margin-top:4px;">' +
          _ramiF('rami.endFreezeSub', 'شاهد أوراق الإنهاء — النتائج بعد {n} ث', { n: '<b id="ramiEndFreezeN">6</b>' }) + '</div>';
      document.body.appendChild(banner);
    } catch (e) { banner = null; }

    let remain = 6;
    const cdEl = banner ? banner.querySelector('#ramiEndFreezeN') : null;
    const iv = setInterval(() => {
      remain--;
      if (cdEl) cdEl.textContent = String(Math.max(0, remain));
      if (remain <= 0) { try { clearInterval(iv); } catch (e) {} }
    }, 1000);

    this._endFreezeTimer = setTimeout(() => {
      this._endFreezeTimer = null;
      try { clearInterval(iv); } catch (e) {}
      try { if (banner && banner.parentNode) banner.parentNode.removeChild(banner); } catch (e) {}
      this._endRoundUIShow();
    }, 6000);
  }

  _endRoundUIShow() {
    if (!this.game) return;

    for (const p of this.game.players) {
      if (p.isDisqualified) {
        p.totalScore = Math.max(p.totalScore, this.game.targetScore + 100);
        this.game.gamePhase = 'MATCH_END';
      }
    }

    /* [V18] نهاية الجولة تُحسم بالفائز الواحد فقط (منطق الإقصاء في _endRound) — لا بمجرد تجاوز لاعب للسقف */
    const isMatchOver = (this.game.gamePhase === 'MATCH_END');

    /* [Req6/Req3] عند انتهاء المباراة: المُنشئ يبدأ تصويت المباراة الجديدة (ويُعلن انتهاء الرهان) */
    /* [Resilience] أي مشارك يبدأ تصويت المباراة الجديدة (الخادم ينشئ مرة واحدة؛ يتحمّل غياب المُنشئ) */
    if (isMatchOver && this.multiplayer && typeof Rooms !== 'undefined' && Rooms.state && typeof AUTH !== 'undefined' && AUTH.user && Rooms.state.players.some(function (p) { return String(p.id) === String(AUTH.user.id) && !p.spectate; })) {
      try { Rooms.startRematch(); } catch (e) {}
    }

    const result = this.game.getMatchResult();

    /* [V29] تحويل أرباح الجولة إلى حساب الفائز (مرة واحدة فقط عند نهاية الجولة) */
    if (isMatchOver && !this.game._payoutDone) {
      this.game._payoutDone = true;
      const bet = window.RAMI_BET || 50;
      const pot = bet * this.game.playerCount;
      const winner = result.winners && result.winners.length ? result.winners[0] : null;
      if (winner && !winner.isBot) {
        /* [Training 2026-09-16] لا أرباح رصيد في التدريب */
        if (!(window.TRAINING && window.TRAINING.on)) {
          if (typeof ST !== 'undefined' && typeof ST.gold === 'number') {
            ST.gold += pot;
            if (typeof wallet === 'function') { try { wallet(); } catch (e) {} }
            if (typeof save === 'function') { try { save(); } catch (e) {} }
          }
          _ramiToast('🏆 ربحت الجولة — تم إضافة ' + pot + ' 🪙 إلى حسابك!', 'ok');
        } else {
          _ramiToast('🏆 ' + (_ramiT('dama.youWin') || 'ربحت الجولة') + ' — 🎓 ' + (_ramiT('ui.trainingFree') || 'تدريب مجاني'), 'ok');
        }
      }
      /* [BotsLedger v2.28] فردي فقط: دلتا المنصة = الرهان − الوعاء عند فوز بشري، +الرهان عند فوز بوت */
      if (!this.multiplayer && typeof window !== 'undefined' && window.BotsLedger) {
        try { window.BotsLedger.record('rm', (winner && !winner.isBot) ? bet - pot : bet); } catch (e) {}
      }
    }

    /* [V30] تسجيل الجولة المنتهية بشكل دائم في سجل رهانات اللعبة + سجل الحساب.
       نهاية الجولة قانوناً = نهاية المباراة (MATCH_END). عندئذٍ تُسجَّل مرة واحدة:
       - استدعاء SessionResume.onResolve() ينهي حالة «الجولة قيد التقدم».
       - recordRound يكتبها في السجل المحلي + يرسلها للخادم. */
    if (isMatchOver && !this.game._roundRecorded) {
      this.game._roundRecorded = true;
      const winner = result.winners && result.winners.length ? result.winners[0] : null;
      const humanWon = !!(winner && !winner.isBot);
      const bet = window.RAMI_BET || 50;
      const pot = bet * this.game.playerCount;
      try {
        /* [TicketFix] betOverride صريح: window.GB لا يغيّر رابطة let GB في engines.js —
           كانت التذكرة تسجّل رهان 10 الافتراضي بدل رهان الجولة الفعلي */
        if (typeof recordRound === 'function') {
          recordRound(humanWon, humanWon ? pot : 0, 'رامي', bet);
        }
      } catch (e) { /* تجاهل */ }
    }
    /* [Persist] نهاية المباراة: مسح الجولة المحفوظة (اكتملت وتسجّلت) —
       نهاية شوط فقط: تحديث الحفظ ليتابع الشوط التالي من حيث توقّف */
    if (isMatchOver) {
      ramiClearSavedRound();
    } else if (typeof ramiAutoSave === 'function') {
      ramiAutoSave();
    }
    const titleText = isMatchOver ? ('🏆 ' + _ramiT('rami.matchEnd', 'نهاية الجولة (انتهت المباراة)')) : ('🏆 ' + _ramiT('rami.roundEnd', 'نهاية الشوط'));
    const subText = isMatchOver
      ? _ramiT('rami.res.overall', 'النتيجة الإجمالية للمباراة')
      : _ramiF('rami.res.roundOf', 'الشوط رقم {n} من الجولة', { n: this.game.roundManager.roundNumber });

    /* صيغة جمع سليمة لعدد الأوراق (مترجَمة لكل لغة) */
    const cardsPhrase = (n) => {
      if (n === 0) return _ramiT('rami.cards.0', 'بدون أوراق متبقية');
      if (n === 1) return _ramiT('rami.cards.1', 'ورقة واحدة متبقية');
      if (n === 2) return _ramiT('rami.cards.2', 'ورقتان متبقيتان');
      if (n >= 3 && n <= 10) return _ramiF('rami.cards.few', '{n} أوراق متبقية', { n: n });
      return _ramiF('rami.cards.many', '{n} ورقة متبقية', { n: n });
    };

    /* سطر تفصيلي موحّد لكل لاعب (عدد الأوراق × قيمتها + جزاءات = المجموع) */
    const detailLine = (p) => {
      const d = p.lastRoundDetail;
      if (!d) return '';
      const penTxt = (d.penalty > 0) ? _ramiF('rami.res.penSuffix', ' + جزاءات {n}', { n: d.penalty }) : '';
      if (d.kind === 'winner') {
        return d.penalty > 0
          ? _ramiF('rami.res.winPen', 'فاز بالشوط — 0 نقطة أوراق + جزاءات {pen} = {tot} نقطة', { pen: d.penalty, tot: d.total })
          : _ramiT('rami.res.winNoPen', 'فاز بالشوط — 0 نقطة (بدون أي جزاء)');
      }
      if (d.kind === 'unopened') {
        const base = this.game.rules.fullHandPenalty;
        if (d.doubled) return _ramiF('rami.res.unopenDouble', 'يد كاملة دون افتتاح — عقوبة {base}×2 = {val}{pen} = {tot} نقطة', { base: base, val: base * 2, pen: penTxt, tot: d.total });
        return _ramiF('rami.res.unopenSingle', 'يد كاملة دون افتتاح — عقوبة {base}{pen} = {tot} نقطة', { base: base, pen: penTxt, tot: d.total });
      }
      if (d.doubled) return _ramiF('rami.res.openDouble', '{cards} بقيمة {val}×2{pen} = {tot} نقطة', { cards: cardsPhrase(d.cardsCount), val: d.cardsValue, pen: penTxt, tot: d.total });
      return _ramiF('rami.res.openSingle', '{cards} بقيمة {val}{pen} = {tot} نقطة', { cards: cardsPhrase(d.cardsCount), val: d.cardsValue, pen: penTxt, tot: d.total });
    };

    const lastRec = (this.game.roundManager.roundHistory && this.game.roundManager.roundHistory.length)
      ? this.game.roundManager.roundHistory[this.game.roundManager.roundHistory.length - 1] : null;
    const doubledBadge = (lastRec && lastRec.doubled)
      ? ('<div class="spill ok" style="display:inline-block;margin-top:4px;">' + _ramiT('rami.res.doubled', '⚡ شوط مضاعف — إنهاء بجوكر حر معزول') + '</div>') : '';

    let html = '<div class="rami-round-end card" style="max-width:560px;margin:16px auto;padding:18px 14px;text-align:center;">' +
      '<div class="ctitle" style="font-size:1.2rem;color:var(--gold,#FFD23F);margin-bottom:4px;">' + titleText + '</div>' +
      '<div class="ctext" style="font-size:0.78rem;color:rgba(255,255,255,0.65);margin-bottom:14px;">' + subText + doubledBadge + '</div>';

    /* بطاقات اللاعبين: الرقم = نقاط الشوط (نفس رقم السجل) + سطر تفصيلي */
    html += '<div class="rami-scores-final" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">';
    for (const p of this.game.players) {
      const disqBadge = p.isDisqualified ? (' <span class="spill bad">' + _ramiT('rami.res.dq', 'خاسر (3 أدوار أوتوماتيكية)') + '</span>') : '';
      /* [V18] شارة الإقصاء لمن تجاوز سقف الجولة */
      const elimBadge = (p.isEliminated && !isMatchOver) ? (' <span class="spill bad">' + _ramiT('rami.res.eliminated', '🚫 مُقصى') + '</span>') : '';
      let marker = '';
      if (isMatchOver) {
        if (result.winners && result.winners.length > 0 && result.winners.some(w => w.id === p.id) && !p.isDisqualified) {
          marker = ' <span class="spill ok">' + _ramiT('rami.res.winner', '🏆 الفائز') + '</span>';
        }
      } else {
        const lastWinner = this.game.roundManager.lastWinner;
        if (lastWinner && p.id === lastWinner.id) marker = ' <span class="spill ok">' + _ramiT('rami.res.roundWinner', '🏆 فائز الشوط') + '</span>';
      }
      const roundVal = p.lastRoundTotal || 0;
      const detail = detailLine(p);
      const totalPart = isMatchOver ? (' · ' + _ramiF('rami.res.totalLbl', 'الإجمالي: {n} pts', { n: p.totalScore })) : '';
      html += '<div class="rami-player-score" style="display:flex;flex-direction:column;gap:4px;padding:10px 14px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid rgba(255,255,255,0.08);text-align:start;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<span><b>' + p.name + '</b>' + marker + disqBadge + elimBadge + '</span>' +
          '<span class="gold-text" style="font-family:Orbitron,monospace;font-weight:800;font-size:0.95rem;">pts ' + roundVal + '</span>' +
        '</div>' +
        '<div style="font-size:0.7rem;color:rgba(255,255,255,0.72);">' + detail + totalPart + '</div>' +
      '</div>';
    }
    html += '</div>';

    /* سجل النقاط والمخالفات: جدول منظّم باتجاه RTL + زر نسخ */
    if (this.game.roundManager.roundHistory && this.game.roundManager.roundHistory.length >= 1) {
      html += '<div class="rami-history-box" dir="rtl" style="margin-top:12px;padding:12px;background:rgba(0,0,0,0.35);border-radius:10px;border:1px solid rgba(245,197,24,0.25);text-align:start;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<div style="font-size:0.76rem;font-weight:800;color:var(--gold,#FFD23F);">' + _ramiT('rami.res.historyTitle', '📊 سجل نقاط الأشواط والمخالفات:') + '</div>' +
          '<button class="rbtn" style="font-size:0.68rem;padding:3px 10px;" onclick="ramiCopyHistory()" title="' + _ramiT('rami.res.copyHistory', '📋 نسخ السجل') + '">' + _ramiT('rami.res.copyHistory', '📋 نسخ السجل') + '</button>' +
        '</div>' +
        '<div class="rami-hist-scroll">' +
          '<div class="rami-hist-table" dir="rtl" style="font-size:0.7rem;color:rgba(255,255,255,0.88);">' +
            '<div class="rami-hist-row rami-hist-head">' +
              '<span class="rami-hist-c-name">' + _ramiT('rami.res.hPlayer', 'اللاعب') + '</span>' +
              '<span class="rami-hist-c-pts">' + _ramiT('rami.res.hPts', 'نقاط الشوط') + '</span>' +
              '<span class="rami-hist-c-pen">' + _ramiT('rami.res.hPen', 'الجزاءات (السبب)') + '</span>' +
              '<span class="rami-hist-c-tot">' + _ramiT('rami.res.hTotal', 'الإجمالي') + '</span>' +
            '</div>';
      for (const rec of this.game.roundManager.roundHistory) {
        html += '<div class="rami-hist-round">' + _ramiF('rami.res.roundLine', 'شوط {n} — فاز {w}', { n: rec.roundNumber, w: rec.winnerName }) + '</div>';
        for (const ps of rec.playerScores) {
          let penTxt = '—';
          if (ps.pen > 0) {
            const agg = (typeof aggregatePenaltyText === 'function') ? aggregatePenaltyText(ps.penReasons) : ((ps.penReasons && ps.penReasons.length) ? ps.penReasons.join('؛ ') : '');
            penTxt = '+' + ps.pen + (agg ? (' — ' + agg) : '');
          }
          html += '<div class="rami-hist-row">' +
            '<span class="rami-hist-c-name">' + ps.name + '</span>' +
            '<span class="rami-hist-c-pts">' + ps.pts + ' pts</span>' +
            '<span class="rami-hist-c-pen">' + penTxt + '</span>' +
            '<span class="rami-hist-c-tot">' + (ps.total || 0) + '</span>' +
          '</div>';
        }
      }
      html += '</div></div></div>';
    }

    html += '<div class="rami-next-btn-zone">';
    if (isMatchOver) {
      if (this.multiplayer) {
        /* [Req3] لوحة تصويت المباراة الجديدة بدل الزر المباشر */
        html += this._rematchVoteHtml();
      } else {
        html += '<button class="big rami-start-btn" onclick="ramiReset()">🔄 ' + _ramiT('rami.playAgain', 'مباراة جديدة') + '</button>';
      }
    } else {
      /* [60ث] عدّاد تنازلي: يبدأ الشوط التالي تلقائياً عند بلوغ الصفر؛
         النقر اليدوي يلغي العدّاد. المالك وحده يُفعّل التقدم في الوضع الجماعي. */
      const clearAuto = "try{if(window._ramiAutoAdvTimer){clearInterval(window._ramiAutoAdvTimer);window._ramiAutoAdvTimer=null;}}catch(e){}";
      html += '<div id="ramiAutoAdvWrap" style="font-size:0.72rem;color:rgba(255,255,255,0.7);margin-bottom:8px;">' + _ramiF('rami.res.autoSoon', 'يلعب التالي تلقائياً بعد {n} ث', { n: '<span id="ramiAutoAdv">60</span>' }) + '</div>';
      html += '<button class="big rami-start-btn" onclick="' + clearAuto + 'ramiNextRound()">➡ ' + _ramiT('rami.nextRound', 'الشوط التالي') + '</button>';
    }
    html += '</div>';

    html += '</div>';
    if (this.container) this.container.innerHTML = html;

    /* تشغيل العدّاد التنازلي للشوط غير المنتهي للمباراة */
    if (!isMatchOver) this._startAutoAdvance();
  }

  /* [60ث] مؤقّت التقدم التلقائي بين الأشواط */
  _startAutoAdvance() {
    try { if (window._ramiAutoAdvTimer) { clearInterval(window._ramiAutoAdvTimer); window._ramiAutoAdvTimer = null; } } catch (e) {}
    let remaining = 60;
    const el = this.container ? this.container.querySelector('#ramiAutoAdv') : null;
    window._ramiAutoAdvTimer = setInterval(() => {
      remaining--;
      if (el) el.textContent = String(Math.max(0, remaining));
      if (remaining <= 0) {
        try { clearInterval(window._ramiAutoAdvTimer); } catch (e) {}
        window._ramiAutoAdvTimer = null;
        if (typeof ramiNextRound === 'function') ramiNextRound();
      }
    }, 1000);
  }

  /* [Req3] لوحة تصويت المباراة الجديدة (وضع جماعي، عند نهاية المباراة) */
  _rematchVoteHtml() {
    const rm = (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state.rematch : null;
    const me = ramiMyUserId();
    if (!rm) {
      return '<div class="rami-rematch-box"><div class="rami-rematch-title">' + _ramiT('rami.rematchTitle', '🔁 مباراة جديدة؟') + '</div><div class="rami-rematch-voted">' + _ramiT('rami.rematchVoted', 'بانتظار بدء التصويت…') + '</div></div>';
    }
    if (rm.resolved && !rm.rematch) {
      return '<div class="rami-rematch-box"><div class="rami-rematch-title">' + _ramiT('rami.rematchNo', 'لا توجد موافقة كافية على مباراة جديدة') + '</div></div>';
    }
    if (rm.resolved && rm.rematch) {
      return '<div class="rami-rematch-box"><div class="rami-rematch-title">' + _ramiT('rami.rematchStarted', 'بدأت مباراة جديدة بالموافقين') + '</div></div>';
    }
    /* تصويت نشط: سرد المشاركين وحالاتهم */
    let rows = '';
    const parts = rm.participants || [];
    for (const pid of parts) {
      const v = rm.votes ? rm.votes[pid] : null;
      const name = (rm.names && rm.names[pid]) ? rm.names[pid] : ('#' + pid);
      const mark = (v === 'agree') ? '✅' : (v === 'refuse') ? '❌' : '⏳';
      rows += '<div class="rami-rematch-row"><span>' + name + '</span><span>' + mark + '</span></div>';
    }
    const myVote = rm.votes ? rm.votes[me] : null;
    const isParticipant = (parts.indexOf(me) !== -1);
    let actions = '';
    if (isParticipant && !myVote) {
      actions = '<button class="big rami-start-btn" onclick="Rooms.voteRematch(\'agree\')">✅ ' + _ramiT('rami.rematchAgree', 'موافقة') + '</button>'
              + '<button class="big rami-start-btn rami-ghost-btn" onclick="Rooms.voteRematch(\'refuse\')">❌ ' + _ramiT('rami.rematchRefuse', 'رفض') + '</button>';
    } else if (isParticipant && myVote) {
      actions = '<div class="rami-rematch-voted">' + _ramiT('rami.rematchVoted', 'تم تسجيل صوتك — بانتظار البقية') + '</div>';
    } else {
      actions = '<div class="rami-rematch-voted">' + _ramiT('rami.rematchSpectator', 'بانتظار تصويت اللاعبين') + '</div>';
    }
    const remain = rm.ts ? Math.max(0, 60 - Math.floor((Date.now() - rm.ts) / 1000)) : 60;
    this._startRematchTicker(rm.ts);
    return '<div class="rami-rematch-box">'
      + '<div class="rami-rematch-title">' + _ramiT('rami.rematchTitle', '🔁 مباراة جديدة؟') + '</div>'
      + '<div class="rami-rematch-tally">' + rows + '</div>'
      + '<div class="rami-rematch-actions">' + actions + '</div>'
      + '<div class="rami-rematch-timer">' + _ramiF('rami.rematchTimer', '⏱ {n}ث للقرار', { n: '<span id="ramiRematchTimerN">' + remain + '</span>' }) + '</div>'
      + '</div>';
  }

  /* [Req3] عدّاد تنازلي لصلاحية التصويت */
  _startRematchTicker(ts) {
    try { if (window._ramiRematchTi) { clearInterval(window._ramiRematchTi); window._ramiRematchTi = null; } } catch (e) {}
    if (!ts) return;
    const el = this.container ? this.container.querySelector('#ramiRematchTimerN') : null;
    window._ramiRematchTi = setInterval(() => {
      const remain = Math.max(0, 60 - Math.floor((Date.now() - ts) / 1000));
      if (el) el.textContent = String(remain);
      if (remain <= 0) { try { clearInterval(window._ramiRematchTi); } catch (e) {} window._ramiRematchTi = null; }
    }, 1000);
  }
}

/* تجميع نصوص الجزاء المتطابقة: «السبب ×4» بدل تكراره 4 مرات */
function aggregatePenaltyText(labels) {
  if (!labels || !labels.length) return '';
  const counts = {};
  const order = [];
  for (const l of labels) {
    const key = (l == null) ? '' : String(l);
    if (!(key in counts)) { counts[key] = 0; order.push(key); }
    counts[key]++;
  }
  return order.map(function (l) {
    return counts[l] > 1 ? (l + ' ×' + counts[l]) : l;
  }).join('؛ ');
}

/* ═══ [V16] ترتيب أوراق المتتالية تصاعدياً مع وضع الجوكرات في فجواتها/أطرافها ═══
   يستخدم عند العرض وعند الإدراج: الأوراق الطبيعية مرتبة، والجوكر يوضع في الفجوة
   الوحيدة أو الطرف الصحيح — لضمان «ترتيب صحيح بالنسبة للمتتاليات». */
function ramiOrderSequenceCards(cards, isWild) {
  if (!cards || !cards.length) return cards || [];
  const nats = cards.filter(c => !isWild(c));
  const jokers = cards.filter(c => isWild(c));
  if (!nats.length) return jokers.slice();
  /* الآس عالٍ (14) إذا وُجدت صورة K/Q في نفس المتتالية حتى يُقرأ Q-K-A صحيحاً */
  const aceHigh = nats.some(c => c.rank >= 12);
  const rankOf = c => (c.rank === 1 ? (aceHigh ? 14 : 1) : c.rank);
  /* [V21] ترتيب تصاعدي: الأصغر يميناً ثم الأكبر شمالاً */
  const sorted = nats.slice().sort((a, b) => rankOf(a) - rankOf(b));
  if (!jokers.length) return sorted;
  /* [V23] موضع كل جوكر يُحدَّد حسب موضعه الأصلي الذي وضعه اللاعب:
     - وسط الترتيب (طبيعية قبله وطبيعية بعده) → الرقم الناقص في الفجوة
     - ثالثاً بعد رقمين متتاليين (طرفه الكبير) → الورقة التالية الأكبر
     - في البداية (قبل كل الطبيعيات) → الورقة السابقة الأصغر */
  const items = nats.map(c => ({ card: c, val: rankOf(c) }));
  for (const jk of jokers) {
    const idx = cards.indexOf(jk);
    const before = cards.slice(0, idx).filter(c => !isWild(c));
    const after = cards.slice(idx + 1).filter(c => !isWild(c));
    let val;
    if (before.length && after.length) {
      /* وسط الترتيب: الرقم الناقص بين آخر طبيعية قبله وأول طبيعية بعده */
      val = rankOf(before[before.length - 1]) + 1;
    } else if (before.length) {
      /* طرف كبير: الورقة التالية الأكبر بعد آخر طبيعية */
      val = rankOf(before[before.length - 1]) + 1;
    } else {
      /* طرف صغير: الورقة السابقة الأصغر قبل أول طبيعية */
      val = rankOf(after[0]) - 1;
    }
    items.push({ card: jk, val: val });
  }
  /* ترتيب تصاعدي (الأصغر يميناً)؛ عند التساوي تُوضع الطبيعية قبل الجوكر */
  items.sort((a, b) => (a.val - b.val) || ((isWild(a.card) ? 1 : 0) - (isWild(b.card) ? 1 : 0)));
  return items.map(it => it.card);
}

/* تحديد المواضع الممكنة لجوكر في متتالية (لإبلاغ اللاعب بالمكان) */
function ramiJokerSlotDescription(meld, rules) {
  const isWild = c => rules.isWildCard(c);
  const nats = meld.cards.filter(c => !isWild(c));
  const aceHigh = nats.some(c => c.rank >= 12);
  const rankOf = c => (c.rank === 1 ? (aceHigh ? 14 : 1) : c.rank);
  const sorted = nats.slice().sort((a, b) => rankOf(a) - rankOf(b));
  for (let i = 1; i < sorted.length; i++) {
    if (rankOf(sorted[i]) - rankOf(sorted[i - 1]) === 2) {
      return 'يسدّ الفجوة بين ' + sorted[i - 1].displayName + ' و' + sorted[i].displayName;
    }
  }
  const low = sorted[0], high = sorted[sorted.length - 1];
  return 'يمدّد المتتالية (بعد ' + high.displayName + ' أو قبل ' + low.displayName + ')';
}

/* ═══ آلة رسائل الحالة: حدث واحد = رسالة واحدة صحيحة حسب مرحلة الدور ═══
   الترتيب: سحب ← تنظيم/إنزال ← رمي؛ تمنع تكديس الرسائل المكررة أو المتناقضة */
function ramiStateInstruction(game) {
  if (!game) return '';
  const rm = game.roundManager;
  if (!rm) return '';
  if (game.gamePhase !== 'PLAYING') {
    return game.gamePhase === 'ROUND_END' ? 'انتهى الشوط — اضغط «الشوط التالي»' : 'انتهت المباراة';
  }
  const p = rm.getCurrentPlayer();
  if (!p) return '';
  if (p.isBot) return 'دور الخصم — انتظر';
  if (rm.turnPhase === 'WAITING_DRAW') {
    return 'اسحب ورقة واحدة: من المجرف أو خذ ورقة المرموق (انقر مرتين)';
  }
  if (p.drawnDiscardCard || p.tookLaTour || p.drawnFojokCard) {
    /* [V19] السامبل: سحب المرموق حر — تلميح مختلف */
    if (game.rules && game.rules.mode !== 'talaj') {
      /* [V19.2] رمي المسحوبة نفس الدور مسموح لكنه خطأ بجزاء 51 */
      return 'سحبت ' + (p.drawnFojokCard ? 'الفوجوك' : 'ورقة المرموق') + ' — تخلّص من ورقة أخرى (رميها في نفس الدور = جزاء +51)؛ تصبح حرة في الأدوار الموالية';
    }
    return 'أنزِل ورقة المرموق المسحوبة في مجموعة أو افتتح بها، وإلا فتُسترجع مع جزاء';
  }
  return 'نظّم أوراقك ثم ارمِ ورقة واحدة للتخلص';
}

/* هل تناسب الورقة هذه المجموعة للتركيب (Lay-off)؟
   متتالية: نفس الرمز وامتداد تسلسلي (±1 مع دعم الآس 1/14).
   متماثلة: نفس القيمة برمز غير مكرر وقبل امتلاء المجموعة (< 4).
   لا جوكر ولا ورقة مرموق مسحوبة تُستخدم كتطابق وهمي. */
function cardFitsMeld(card, meld, rules, drawnCard, ownerMelds) {
  if (!card || !meld || !meld.cards || !meld.cards.length) return false;
  if (!rules || typeof rules.isValidSet !== 'function') return false;
  /* بعد الافتتاح يُعفى اللاعب من شروطه ويصبح حراً في إدراج أي ورقة
     في أي مجموعة منزلة ظاهرة، متى أبقت المجموعة صالحة قانوناً.
     [V19.2] استثناء «الحرة تبقى حرة» في دور الإنزال فقط: الجوكر وورقة المرموق
     المسحوبة نفس الدور لا يُدرجان في مجموعة حرة أُنزلت هذا الدور —
     وفي الأدوار الموالية يجوز إدراجهما في مجموعات الافتتاح الحرة. */
  if (meld._justOpened && !meld.cards.some(function (c) { return rules.isWildCard(c); })) {
    if (rules.isWildCard(card)) return false;
    if (drawnCard && card.id === drawnCard.id) {
      /* [V19.5] ورقة المرموق المسحوبة هذا الدور يجوز إدراجها في مجموعة «إضافية»
         من مجموعات دور الافتتاح — بشرط بقاء متتالية حرة ومتماثلة حرة أساسيتين
         في غيرها (روح V19.3)؛ بدون سياق مجموعات المالك نتحفظ بالرفض */
      var okExtra = false;
      if (ownerMelds && ownerMelds.length) {
        var isPureOther = function (m) {
          return m !== meld && m.cards && m.cards.length >= 3 &&
            !m.cards.some(function (c) { return rules.isWildCard(c); }) &&
            !m.cards.some(function (c) { return c.id === drawnCard.id; });
        };
        var hasFreeSeq = ownerMelds.some(function (m) { return m.type === MELD_TYPE.SEQUENCE && isPureOther(m); });
        var hasFreeSet = ownerMelds.some(function (m) { return m.type === MELD_TYPE.SET && isPureOther(m); });
        okExtra = hasFreeSeq && hasFreeSet;
      }
      if (!okExtra) return false;
    }
  }
  var temp = meld.cards.concat([card]);
  if (meld.type === MELD_TYPE.SET) return rules.isValidSet(temp, true);
  if (meld.type === MELD_TYPE.SEQUENCE) return rules.isValidSequence(temp, true);
  return rules.isValidMeld(temp, true);
}

/* نسخ سجل الأشواط والمخالفات إلى الحافظة */
function ramiCopyHistory() {
  const game = RAMI_STATE || (typeof window !== 'undefined' ? window.RAMI_STATE : null);
  if (!game || !game.roundManager || !game.roundManager.roundHistory) return;
  const lines = [];
  lines.push('سجل أشواط الرامي المغربي');
  for (const rec of game.roundManager.roundHistory) {
    lines.push('شوط ' + rec.roundNumber + ' — فاز ' + rec.winnerName);
    for (const ps of rec.playerScores) {
      let pen = '—';
      if (ps.pen > 0) {
        const agg = (typeof aggregatePenaltyText === 'function') ? aggregatePenaltyText(ps.penReasons) : ((ps.penReasons && ps.penReasons.length) ? ps.penReasons.join('؛ ') : '');
        pen = '+' + ps.pen + (agg ? (' (' + agg + ')') : '');
      }
      lines.push('  ' + ps.name + ': ' + ps.pts + ' pts' + (ps.pen > 0 ? ' · جزاءات ' + pen : '') + ' · الإجمالي ' + (ps.total || 0));
    }
  }
  const text = lines.join('\n');
  const done = () => { if (typeof toast === 'function') toast('📋 تم نسخ السجل', 'ok'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
  } else {
    fallbackCopy(text);
    done();
  }
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (e) {}
}

/* ═══════════ [Persist] استمرارية جولة الرامي المحلية ═══════════
   بلاغ المالك: الجولة تتجمّد عند دور البوت، وعند إغلاق المتصفح/تحديثه
   يُفقد الرهان ولا تُسجَّل تذكرة ولا تكتمل الجولة. الحل الجذري:
   حفظ حالة الجولة كاملة في localStorage بعد كل حركة/شوط، واستعادتها
   عند فتح اللعبة إن لم تكن انتهت — فيكمل اللاعب من حيث توقّف (user vs ai
   و user vs user على نفس الجهاز). الخصم يحدث عند البدء فقط: الاستعادة
   لا تخصم رهاناً ثانياً، وعند انتهاء الجولة المستعادة يُسجَّل التيكيت
   والمعاملات كأي جولة عادية (نفس مسار recordRound). */
var RAMI_PERSIST_KEY = 'rc_rami_active_round';

function _ramiSerCard(c) {
  if (!c) return null;
  return { id: c.id, rank: c.rank, suit: c.suit, type: c.type, fromDiscard: !!c.fromDiscard, fromLaTour: !!c.fromLaTour, fromFojok: !!c.fromFojok };
}
function _ramiDeserCard(o) {
  if (!o) return null;
  const c = new RamiCard(o.id, o.rank, o.suit, o.type);
  if (o.fromDiscard) c.fromDiscard = true;
  if (o.fromLaTour) c.fromLaTour = true;
  if (o.fromFojok) c.fromFojok = true;
  return c;
}
function _ramiSerMeld(m) {
  return m ? { type: m.type, cards: (m.cards || []).map(_ramiSerCard), id: m.id } : null;
}
function _ramiDeserMeld(o) {
  if (!o) return null;
  const m = new RamiMeld(o.type, (o.cards || []).map(_ramiDeserCard));
  if (o.id) m.id = o.id;
  return m;
}

/* تسلسل الجولة كاملة — يُستدعى بعد كل حركة/تغير حالة */
function ramiSerializeGame(game) {
  try {
    if (!game || !game.roundManager || game.gamePhase === 'MATCH_END' || game.multiplayer) return;
    const rm = game.roundManager;
    const adapter = (typeof window !== 'undefined' && (window.RamiAdapter || window.RAMI_ADAPTER)) ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
    const data = {
      v: 1,
      savedAt: Date.now(),
      mode: game.mode, playerCount: game.playerCount, botCount: game.botCount,
      botSeats: game.botSeats || null, seed: game.seed, turnSeconds: game.rules.turnSeconds,
      targetScore: game.targetScore, isSingleRound: !!game.isSingleRound,
      bet: window.RAMI_BET || 0,
      gamePhase: game.gamePhase,
      handSlots: (adapter && adapter.handSlots) ? adapter.handSlots.map(function (s) { return (s || []).map(_ramiSerCard); }) : null,
      isolateCardId: (adapter && adapter.isolateCardId) || null,
      players: (game.players || []).map(function (p) {
        return {
          id: p.id, name: p.name, isBot: !!p.isBot,
          hand: (p.hand || []).map(_ramiSerCard),
          melds: (p.melds || []).map(_ramiSerMeld),
          displayCards: (p.displayCards || []).map(_ramiSerCard),
          totalScore: p.totalScore || 0, penaltyScore: p.penaltyScore || 0,
          hasOpened: !!p.hasOpened,
          drawnDiscardCard: _ramiSerCard(p.drawnDiscardCard),
          drawnFojokCard: _ramiSerCard(p.drawnFojokCard),
          drawnLaTourCard: _ramiSerCard(p.drawnLaTourCard),
          tookLaTour: !!p.tookLaTour,
          isEliminated: !!p.isEliminated,
          consecutiveAutoTurns: p.consecutiveAutoTurns || 0,
          lastRoundPoints: p.lastRoundPoints || 0,
          lastPenalty: p.lastPenalty || 0,
          lastPenaltyReasons: (p.lastPenaltyReasons || []).map(function (r) { return (typeof r === 'string') ? r : (r && r.label) || ''; }),
          lastRoundDetail: p.lastRoundDetail || null
        };
      }),
      rm: {
        currentPlayerIndex: rm.currentPlayerIndex,
        dealerIndex: rm.dealerIndex,
        drawPile: (rm.drawPile || []).map(_ramiSerCard),
        discardPile: (rm.discardPile || []).map(_ramiSerCard),
        tableMelds: (rm.tableMelds || []).map(_ramiSerMeld),
        jokerIndicator: _ramiSerCard(rm.jokerIndicator),
        jokerIndicatorInfo: rm.jokerIndicatorInfo || null,
        laTourCard: _ramiSerCard(rm.laTourCard),
        turnPhase: rm.turnPhase,
        roundNumber: rm.roundNumber || 0,
        turnSecondsRemaining: rm.turnSecondsRemaining,
        highestOpeningScore: rm.highestOpeningScore || 0,
        highestOpeningPlayer: rm.highestOpeningPlayer || null,
        jokerDouble: !!rm.jokerDouble,
        dealerFirstCycle: !!rm.dealerFirstCycle,
        turnCount: rm.turnCount || 0,
        isFirstTourCycle: (rm.isFirstTourCycle !== undefined) ? !!rm.isFirstTourCycle : true,
        feederDiscard: _ramiSerCard(rm.feederDiscard),
        roundHistory: rm.roundHistory || []
      }
    };
    localStorage.setItem(RAMI_PERSIST_KEY, JSON.stringify(data));
  } catch (e) { /* امتلاء التخزين أو نطاق خاص — تجاهل صامت */ }
}

/* هل توجد جولة محفوظة قابلة للاستئناف؟ (غير منتهية وضمن نافذة الاستئناف) */
function ramiHasSavedRound() {
  try {
    const raw = localStorage.getItem(RAMI_PERSIST_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    return !!(d && d.v === 1 && d.gamePhase && d.gamePhase !== 'MATCH_END' &&
      d.players && d.players.length >= 2 && d.rm && d.rm.players !== null);
  } catch (e) { return false; }
}

/* مسح الجولة المحفوظة (نهاية المباراة أو بدء جولة جديدة) */
function ramiClearSavedRound() {
  try { localStorage.removeItem(RAMI_PERSIST_KEY); } catch (e) {}
}

/* استعادة الجولة: تُنشئ كائن RamiGame مطابقاً للحالة المحفوظة.
   تعيد كائن اللعبة أو null. يعتمد الاستئناف في ramiResumeSavedRound(). */
function ramiDeserializeGame() {
  try {
    const raw = localStorage.getItem(RAMI_PERSIST_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1 || !d.players || !d.rm || d.gamePhase === 'MATCH_END') return null;
    const game = new RamiGame(d.mode, d.playerCount, d.botCount, d.seed, d.turnSeconds, d.botSeats);
    game.targetScore = d.targetScore;
    game.isSingleRound = !!d.isSingleRound;
    game.gamePhase = d.gamePhase || 'PLAYING';
    const rm = game.roundManager;
    /* اللاعبون بأيديهم وحالاتهم كاملة */
    rm.players = d.players.map(function (po) {
      const p = new RamiPlayer(po.id, po.name, po.isBot);
      p.hand = (po.hand || []).map(_ramiDeserCard);
      p.melds = (po.melds || []).map(_ramiDeserMeld);
      p.displayCards = (po.displayCards || []).map(_ramiDeserCard);
      p.totalScore = po.totalScore || 0;
      p.penaltyScore = po.penaltyScore || 0;
      p.hasOpened = !!po.hasOpened;
      p.drawnDiscardCard = _ramiDeserCard(po.drawnDiscardCard);
      p.drawnFojokCard = _ramiDeserCard(po.drawnFojokCard);
      p.drawnLaTourCard = _ramiDeserCard(po.drawnLaTourCard);
      p.tookLaTour = !!po.tookLaTour;
      p.isEliminated = !!po.isEliminated;
      p.consecutiveAutoTurns = po.consecutiveAutoTurns || 0;
      p.lastRoundPoints = po.lastRoundPoints || 0;
      p.lastPenalty = po.lastPenalty || 0;
      p.lastPenaltyReasons = po.lastPenaltyReasons || [];
      p.lastRoundDetail = po.lastRoundDetail || null;
      return p;
    });
    game.players = rm.players;
    /* حالة الجولة */
    rm.currentPlayerIndex = d.rm.currentPlayerIndex || 0;
    rm.dealerIndex = d.rm.dealerIndex || 0;
    rm.drawPile = (d.rm.drawPile || []).map(_ramiDeserCard);
    rm.discardPile = (d.rm.discardPile || []).map(_ramiDeserCard);
    rm.tableMelds = (d.rm.tableMelds || []).map(_ramiDeserMeld);
    rm.jokerIndicator = _ramiDeserCard(d.rm.jokerIndicator);
    rm.jokerIndicatorInfo = d.rm.jokerIndicatorInfo || null;
    rm.laTourCard = _ramiDeserCard(d.rm.laTourCard);
    rm.turnPhase = d.rm.turnPhase || 'WAITING_DRAW';
    rm.roundNumber = d.rm.roundNumber || 1;
    rm.turnSecondsRemaining = Math.max(10, d.rm.turnSecondsRemaining || game.rules.turnSeconds);
    rm.highestOpeningScore = d.rm.highestOpeningScore || 0;
    rm.highestOpeningPlayer = d.rm.highestOpeningPlayer || null;
    rm.jokerDouble = !!d.rm.jokerDouble;
    rm.dealerFirstCycle = !!d.rm.dealerFirstCycle;
    rm.turnCount = (d.rm.turnCount !== undefined) ? d.rm.turnCount : 0;
    rm.isFirstTourCycle = (d.rm.isFirstTourCycle !== undefined) ? !!d.rm.isFirstTourCycle : (rm.turnCount < game.players.length);
    rm.feederDiscard = _ramiDeserCard(d.rm.feederDiscard);
    rm.roundHistory = d.rm.roundHistory || [];

    if (rm.jokerIndicatorInfo) {
      game.rules.jokerIndicator = rm.jokerIndicatorInfo;
    } else if (rm.jokerIndicator) {
      game.rules.jokerIndicator = {
        id: 'IND-' + rm.jokerIndicator.rank + '-' + rm.jokerIndicator.suit,
        rank: rm.jokerIndicator.rank,
        suit: rm.jokerIndicator.suit,
        isJoker: false
      };
    } else {
      game.rules.jokerIndicator = null;
    }

    if (d.handSlots && Array.isArray(d.handSlots) && d.handSlots.length === 5) {
      game._savedHandSlots = d.handSlots.map(function (slot) {
        return (slot || []).map(_ramiDeserCard);
      });
    }
    if (d.isolateCardId !== undefined) {
      game._savedIsolateCardId = d.isolateCardId;
    }

    if (typeof clearRamiPartitionCache === 'function') clearRamiPartitionCache();
    return game;
  } catch (e) {
    return null;
  }
}

/* [ClockCatchup 2026-09-14] محرك اللحاق بالوقت — جوهر بلاغ المالك:
   «الجولة تستمر في الخلفية؛ عند انتهاء المؤقت يُلعب الدور آلياً».
   عند الاستئناف بعد غياب (إغلاق/تحديث/خلفية): نحسب الأدوار التي انقضى
   مؤقتها (90 ث لكل دور) وننفذ حركة آلية قانونية لكل واحد منها — نفس
   عدالة اللعب المحلي: السحب من الكومة + رمي ورقة لا تخدم المجموعات
   (نفس منطق انتهاء المؤقت _doAutoPlay). البشري والبوت سواسية؛ ثم يلعب
   المستخدم دوره الحالي من بقية المؤقت. أي عدم اتساق في الطاولة يُعالج
   بالتنفيذ الحتمي عبر executeMove لا بالقفز فوق الحالة. */
function ramiCatchupOnResume(game, savedAt) {
  try {
    if (!game || game.gamePhase !== 'PLAYING') return 0;
    const rm = game.roundManager;
    if (!rm) return 0;
    const turnSecs = Math.max(15, game.rules.turnSeconds || 90);
    const elapsed = Math.max(0, Date.now() - (savedAt || Date.now()));
    let turnsDue = Math.floor(elapsed / (turnSecs * 1000));
    if (turnsDue > 400) turnsDue = 400;   /* سقف أمان */
    if (turnsDue < 1) {
      /* أقل من دور: قصّ المؤقت المتبقي للدور الحالي */
      const rem = Math.ceil((turnSecs * 1000 - (elapsed % (turnSecs * 1000))) / 1000);
      rm.turnSecondsRemaining = Math.min(rm.turnSecondsRemaining || turnSecs, rem);
      return 0;
    }
    let played = 0;
    for (let i = 0; i < turnsDue; i++) {
      if (game.gamePhase !== 'PLAYING') break;
      const curP = rm.getCurrentPlayer();
      if (!curP) break;
      /* تنفيذ الحركة الآلية (سحب+رمي) — عبر نفس منطق _doAutoPlay بلا واجهة */
      try {
        if (rm.turnPhase === 'WAITING_DRAW' && curP.hand.length < game.rules.playHandSize) {
          const r = game.executeMove({ type: 'draw_deck', playerId: curP.id });
          if (!(r && (r.success || r.penaltyApplied))) { rm.nextPlayer(); played++; continue; }
        }
        if (rm.turnPhase === 'WAITING_DISCARD' && curP.hand.length > 0) {
          const hand = curP.hand.slice();
          let card = hand.find(function (c) { return !game.doesCardFitAnyTableMeld(c); });
          if (!card) card = hand[hand.length - 1];
          game.executeMove({ type: 'discard', playerId: curP.id, cardId: card.id });
        }
      } catch (e) { try { rm.nextPlayer(); } catch (e2) {} }
      /* تقدّم الدور (إن لم يكن الرمي قد نقل الدور عبر _endTurn) */
      if (game.gamePhase === 'PLAYING' && rm.getCurrentPlayer() && rm.getCurrentPlayer().id === curP.id) {
        try { rm.nextPlayer(); } catch (e) {}
      }
      played++;
    }
    /* المؤقت الحالي: دور كامل جديد (بدأ الآن) */
    rm.turnSecondsRemaining = turnSecs;
    rm._turnStartedAt = Date.now();
    if (typeof clearRamiPartitionCache === 'function') clearRamiPartitionCache();
    return played;
  } catch (e) { return 0; }
}
if (typeof window !== 'undefined') window.ramiCatchupOnResume = ramiCatchupOnResume;

/* حفظ تلقائي: يُستدعى من نقاط تغيّر الحالة كلها (بعد أي executeMove /
   نهاية شوط / تقدّم دور) — رخيص (تسلسل ~KB قليلة) */
function ramiAutoSave() {
  try {
    const g = RAMI_STATE || (typeof window !== 'undefined' ? window.RAMI_STATE : null);
    if (g && !g.multiplayer && g.gamePhase !== 'MATCH_END') ramiSerializeGame(g);
  } catch (e) {}
}

if (typeof window !== 'undefined') {
  window.ramiHasSavedRound = ramiHasSavedRound;
  window.ramiClearSavedRound = ramiClearSavedRound;
}

/* ═══════════ Actions and Event Handlers ═══════════ */
function ramiStartGame() {
  /* [Training 2026-09-16] رامي المحلي (ضد البوتات) تدريب مجاني بلا تسجيل؛
     غرفة الرهان الجارية وحدها تُسجَّل */
  window.TRAINING = window.TRAINING || { on: false };
  window.TRAINING.on = !(typeof Rooms !== 'undefined' && Rooms && Rooms.state && Rooms.state.game_id === 'rm' && Rooms.state.status === 'playing');
  /* [Persist] جولة محفوظة غير منتهية → استئنافها: بلا خصم رهان جديد
     (الرهان خُصم عند بدئها) — يكمل اللاعب من حيث توقف (بلاغ المالك:
     يجب أن يستطيع إتمام جولته مهما أغلق/حدّث/خرج وعاد).
     الاستئناف فقط إذا طابقت إعدادات الشاشة الجولة المحفوظة (الوضع/العدد/
     الهدف) — تغيير الإعدادات = نية جولة جديدة صريحة: تُلغى القديمة. */
  if (typeof ramiHasSavedRound === 'function' && ramiHasSavedRound() && !window.RAMI_SETUP_FORCE_NEW) {
    var _savedRaw = null;
    try { _savedRaw = JSON.parse(localStorage.getItem(RAMI_PERSIST_KEY) || 'null'); } catch (e) { _savedRaw = null; }
    var playersElQ = document.getElementById('ramiPlayers');
    var targetElQ = document.getElementById('ramiTarget');
    var modeQ = window.RAMI_SETUP_MODE || 'talaj';
    var playersQ = playersElQ ? parseInt(playersElQ.value, 10) : 4;
    var targetValQ = targetElQ ? targetElQ.value : '501';
    var singleQ = (targetValQ === 'single');
    var targetQ = singleQ ? 999999 : (parseInt(targetValQ, 10) || (modeQ === 'talaj' ? 501 : 301));
    var _matches = _savedRaw &&
      _savedRaw.mode === modeQ &&
      _savedRaw.playerCount === playersQ &&
      _savedRaw.targetScore === targetQ;
    if (_matches) {
      const saved = ramiDeserializeGame();
      if (saved) {
        RAMI_STATE = saved;
        window.RAMI_STATE = RAMI_STATE;
        if (_savedRaw.bet) { RAMI_BET = _savedRaw.bet; window.RAMI_BET = _savedRaw.bet; }
        if (window.RamiAdapter) {
          window.RamiAdapter.game = RAMI_STATE;
          window.RamiAdapter.selectedCards.clear();
          if (RAMI_STATE._savedHandSlots && RAMI_STATE._savedHandSlots.length === 5) {
            window.RamiAdapter.handSlots = RAMI_STATE._savedHandSlots;
            window.RamiAdapter.isolateCardId = RAMI_STATE._savedIsolateCardId || null;
          } else {
            window.RamiAdapter.handSlots = [[], [], [], [], []];
          }
          window.RamiAdapter._renderGame();
        }
        _ramiToast(_ramiT('rami.resumedRound', '↩️ استؤنفت جولتك السابقة — رهانك محفوظ'), 'ok');
        /* البوت يكمل إن كان دوره */
        if (window.RamiAdapter && window.RamiAdapter._processTurn) {
          var __sa = (_savedRaw && _savedRaw.savedAt) ? _savedRaw.savedAt : Date.now();
          var __c = (typeof ramiCatchupOnResume === 'function') ? ramiCatchupOnResume(RAMI_STATE, __sa) : 0;
          if (__c > 0) _ramiToast(_ramiT('rami.resumedRound', '↩️ استؤنفت جولتك — تقدّمت ' + __c + ' دوراً آلياً أثناء غيابك'), 'ok');
          if (typeof ramiAutoSave === 'function') ramiAutoSave();
          try { window.RamiAdapter._processTurn(); } catch (e) {}
        }
        return;
      }
    }
    /* إعدادات مختلفة أو بيانات تالفة = جولة جديدة صريحة: امسح القديمة.
       [TicketSafety] الجولة الملغاة رهانُها خُصم فعلاً — لا يضيع صامتاً:
       تُسجَّل تذكرة خسارة (بلا payout) في السجل المحلي و/ api/rounds كي
       يظهر الرهان في سجل التذاكر والمعاملات (حزام الأمان ضد فقدان المال) */
    if (_savedRaw && _savedRaw.bet && _savedRaw.gamePhase !== 'MATCH_END') {
      try {
        if (typeof recordRound === 'function') {
          recordRound(false, 0, 'رامي (أُلغيت ببدء جديدة)', _savedRaw.bet);
        }
      } catch (e) { /* تجاهل */ }
    }
    ramiClearSavedRound();
  }
  window.RAMI_SETUP_FORCE_NEW = false;

  const playersEl = document.getElementById('ramiPlayers');
  const targetEl = document.getElementById('ramiTarget');
  const timerEl = document.getElementById('ramiTimerSelect');
  const betInp = document.getElementById('ramiBetInput');

  const mode = window.RAMI_SETUP_MODE || 'talaj';
  const players = playersEl ? parseInt(playersEl.value, 10) : 4;
  const targetVal = targetEl ? targetEl.value : '501';
  const isSingle = (targetVal === 'single');
  const target = isSingle ? 999999 : (parseInt(targetVal, 10) || (mode === 'talaj' ? 501 : 301));
  const timerSec = timerEl ? (parseInt(timerEl.value, 10) || 90) : 90;

  /* الرهان من خانة الإدخال اليدوي (ضمن الرصيد المتاح) */
  let currentBet = 50;
  if (betInp) {
    let v = parseFloat(betInp.value);
    if (isNaN(v) || v < 0.01) v = 10;
    const maxGold = (typeof ST !== 'undefined' && typeof ST.gold === 'number') ? ST.gold : v;
    currentBet = Math.round(Math.min(v, maxGold) * 100) / 100;
    betInp.value = currentBet;
  } else {
    currentBet = window.RAMI_BET || 50;
  }
  RAMI_BET = currentBet;
  window.RAMI_BET = currentBet;

  /* [Training 2026-09-16] التدريب بلا خصم */
  if (!(window.TRAINING && window.TRAINING.on)) {
    if (typeof ST !== 'undefined' && typeof ST.gold === 'number') {
      if (ST.gold < currentBet) {
        _ramiToast((_ramiT('ts.noc') || 'رصيدك غير كافٍ للرهان') + ' (' + (typeof fmt === 'function' ? fmt(currentBet) : currentBet) + ' 🪙)', 'err');
        if (typeof SND !== 'undefined' && SND.lose) SND.lose();
        return;
      }
      ST.gold -= currentBet;
      if (typeof wallet === 'function') wallet();
      if (typeof save === 'function') save();
    }
  }

  const seed = Math.floor(Math.random() * 0xFFFFFFFF);
  RAMI_STATE = new RamiGame(mode, players, players - 1, seed, timerSec);
  RAMI_STATE.rules.turnSeconds = timerSec;
  RAMI_STATE.roundManager.turnSecondsRemaining = timerSec;
  RAMI_STATE.isSingleRound = isSingle;
  RAMI_STATE.displayTarget = isSingle ? _ramiT('rami.singleShort', 'ش و') : target;
  RAMI_STATE.startMatch(target);
  window.RAMI_STATE = RAMI_STATE;

  if (window.RamiAdapter) {
    window.RamiAdapter.game = RAMI_STATE;
    window.RamiAdapter.selectedCards.clear();
    window.RamiAdapter.handSlots = [[], [], [], [], []];
    /* [R7-FIX] مباراة جديدة: تصفير مفتاح لقطة الإنهاء — المفتاح القديم
       (رقم الشوط:المرحلة = 1:MATCH_END) يتعارض مع مباراة الشوط الواحد
       التالية فتتخطى لقطة المشاهدة وبانر النهاية بعد أول إعادة لعب */
    window.RamiAdapter._endFreezeDone = null;
    if (window.RamiAdapter._endFreezeTimer) { clearTimeout(window.RamiAdapter._endFreezeTimer); window.RamiAdapter._endFreezeTimer = null; }
    window.RamiAdapter._renderGame();
    window.RamiAdapter.playIntroAndStart();
  }
  /* [Persist] بدء جولة جديدة: تُحفظ فوراً — أول حفظ في سلسلة الاستمرارية */
  ramiAutoSave();
}

function ramiAction(type, cardId) {
  if (ramiIsSpectator()) return;
  const game = RAMI_STATE || (typeof window !== 'undefined' ? window.RAMI_STATE : null);
  if (!game || checkRamiBusy()) return;
  const player = game.roundManager.getCurrentPlayer();
  if (!player || player.isBot) return;
  /* لا نبني ولا ننفذ حركة الإنهاء من النقرة الأولى */
  if (type === 'finish' && !requireRamiConfirm('finish')) return;

  const adapter = (typeof window !== 'undefined' && (window.RamiAdapter || window.RAMI_ADAPTER)) ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
  if (typeof game.normalizeTurnPhase === 'function') game.normalizeTurnPhase();
  let move;
  if (type === 'discard') {
    if (game.roundManager.turnPhase === 'WAITING_DRAW' && player.hand.length < game.rules.playHandSize) {
      _ramiToast('يجب سحب ورقة أولاً من المجرف أو المرموق قبل رمي ورقة التخلص', 'warn');
      return;
    }
    let targetId = (cardId !== undefined && cardId !== null) ? cardId : null;
    if (targetId === null && adapter && adapter.selectedCards && adapter.selectedCards.size > 0) {
      targetId = Array.from(adapter.selectedCards)[0];
    }
    if (targetId === null && player.hand.length > 0) {
      _ramiToast(_ramiT('rami.chooseDiscard') || 'حدد الورقة التي تريد رميها أولاً بالنقر عليها', 'warn');
      return;
    }
    move = { type: 'discard', playerId: player.id, cardId: targetId };
  } else {
    move = { type: type, playerId: player.id };
    if (type === 'finish' && adapter && adapter.isolateCardId) move.isolateCardId = adapter.isolateCardId;
  }

  if (type === 'draw_deck') {
    if (typeof SND !== 'undefined' && SND.spin) SND.spin();
  } else if (type === 'draw_discard') {
    if (typeof SND !== 'undefined' && SND.card) SND.card();
  }

  setRamiBusy(true);
  setTimeout(() => {
    const activeGame = RAMI_STATE || (typeof window !== 'undefined' ? window.RAMI_STATE : null);
    if (!activeGame) { setRamiBusy(false); return; }
    const result = activeGame.executeMove(move);
    setRamiBusy(false);

    /* بثّ الحركة في وضع الغرفة (النجاح أو الجزاء الحتمي يتطابق عند الجميع) */
    if (adapter && adapter.multiplayer && (result.success || result.penaltyApplied)) {
      if (type === 'discard') adapter._netEmit('discard', { playerId: player.id, cardId: move.cardId });
      else if (type === 'draw_deck') adapter._netEmit('draw', { drawType: 'draw_deck', playerId: player.id });
      else if (type === 'draw_discard') adapter._netEmit('draw', { drawType: 'draw_discard', playerId: player.id });
      else if (type === 'draw_fojok') adapter._netEmit('draw', { drawType: 'draw_fojok', playerId: player.id });
      else if (type === 'finish') adapter._netEmit('finish', { playerId: player.id, isolateCardId: (move.isolateCardId || null) });
    }

    if (!result.success) {
      _ramiToast(result.error || 'خطأ في الحركة', 'err');
      if (result.penaltyApplied) {
        if (adapter) {
          adapter.selectedCards.clear();
          adapter._processTurn();
        }
      }
      return;
    }

    if (type === 'finish' || result.finished || activeGame.gamePhase === 'ROUND_END' || activeGame.gamePhase === 'MATCH_END' || player.hand.length === 0) {
      if (adapter) adapter._endRoundUI();
      return;
    }

    if (type === 'discard') {
      if (adapter) adapter.selectedCards.clear();
      if (typeof SND !== 'undefined' && SND.card) SND.card();
      if (activeGame.gamePhase === 'ROUND_END' || activeGame.gamePhase === 'MATCH_END' || player.hand.length === 0) {
        if (adapter) adapter._endRoundUI();
      } else {
        if (adapter) adapter._processTurn();
      }
    } else {
      if (activeGame.gamePhase === 'ROUND_END' || activeGame.gamePhase === 'MATCH_END' || player.hand.length === 0) {
        if (adapter) adapter._endRoundUI();
      } else {
        if (adapter) adapter._updateUI();
      }
    }
  }, 180);
}

function ramiOpenMelds() {
  if (ramiIsSpectator()) return;
  const game = RAMI_STATE || (typeof window !== 'undefined' ? window.RAMI_STATE : null);
  if (!game || checkRamiBusy()) return;
  const player = game.roundManager.getCurrentPlayer();
  if (!player || player.isBot) return;
  /* لا ننزل مجموعات ولا نتحقق من الجزاء حتى تأتي النقرة الثانية */
  if (!requireRamiConfirm('open')) return;

  const adapter = (typeof window !== 'undefined' && (window.RamiAdapter || window.RAMI_ADAPTER)) ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
  if (!adapter) return;

  let cardIds = [];
  if (adapter.selectedCards.size >= 3) {
    cardIds = Array.from(adapter.selectedCards);
  } else if (adapter.handSlots) {
    /* الخانات اليدوية فقط (باستثناء الأوراق المنزلة) */
    const activeSlots = (typeof adapter._activeHandSlots === 'function') ? adapter._activeHandSlots() : adapter.handSlots;
    for (let s = 0; s < 5; s++) {
      const sc = activeSlots[s];
      if (sc && sc.length >= 3) {
        if (game.rules.isValidSet(sc, true) || game.rules.isValidSequence(sc, true)) {
          sc.forEach(c => cardIds.push(c.id));
        } else {
          /* [V29] إن لم تكن الخانة كلها مجموعة صالحة، ابحث عن مجموعة صالحة ضمنها */
          const found = partitionSelectedCards(sc, game.rules);
          for (const fm of found) fm.cards.forEach(c => cardIds.push(c.id));
        }
      }
    }
    /* [V29] التقسيم التلقائي لكامل اليد للافتتاح الأولي فقط — لا للاعب المفتوح */
    if (cardIds.length === 0 && !player.hasOpened) {
      cardIds = player.hand.map(c => c.id);
    }
  }

  setRamiBusy(true);
  setTimeout(() => {
    const activeGame = RAMI_STATE || (typeof window !== 'undefined' ? window.RAMI_STATE : null);
    if (!activeGame) { setRamiBusy(false); return; }
    const move = { type: 'open', playerId: player.id, cardIds: cardIds };
    const result = activeGame.executeMove(move);
    setRamiBusy(false);
    if (result.success) {
      adapter.selectedCards.clear();
      if (adapter.multiplayer) adapter._netEmit('open', { playerId: player.id, cardIds: cardIds });
      if (typeof SND !== 'undefined' && SND.win) SND.win();
      _ramiToast('🎉 ' + (_ramiT('rami.openedSuccess') || 'تم إنزال الأوراق والافتتاح بنجاح في الطاولة!'), 'ok');
      if (typeof ramiAutoSave === 'function') ramiAutoSave();
      /* [R7-FIX] افتتاح اللاعب أنهى مباراة الشوط الواحد (MATCH_END) — أظهر شاشة النهاية */
      if (activeGame.gamePhase === 'ROUND_END' || activeGame.gamePhase === 'MATCH_END') {
        adapter._endRoundUI();
      } else {
        adapter._updateUI();
      }
    } else {
      if (result.penaltyApplied) {
        adapter.selectedCards.clear();
        if (typeof SND !== 'undefined' && SND.lose) SND.lose();
        _ramiToast('⚠️ ' + result.error, 'err');
        adapter._processTurn();
      } else {
        _ramiToast(result.error || 'لا يمكن الافتتاح بهذه الأوراق', 'warn');
      }
    }
  }, 180);
}

function ramiNextRound() {
  /* إيقاف عدّاد التقدم التلقائي فور المحاولة اليدوية/التلقائية للانتقال */
  try { if (window._ramiAutoAdvTimer) { clearInterval(window._ramiAutoAdvTimer); window._ramiAutoAdvTimer = null; } } catch (e) {}
  var ad = window.RamiAdapter || window.RAMI_ADAPTER;
  var mp = !!(ad && ad.multiplayer);
  if (!RAMI_STATE) return;

  /* [Resilience] تقدّم ديمقراطي: أي لاعب يبني الشوط التالي محلياً ويبثّ fromRound.
     الخادم يُلغّم التكرار، والآخرون يطبّقونه مع حارس fromRound (يتجاوزون إن سبقهم غيرهم). */
  var fromRound = (RAMI_STATE.roundManager) ? RAMI_STATE.roundManager.roundNumber : 0;
  RAMI_STATE._payoutDone = false;
  RAMI_STATE._roundRecorded = false;
  /* [V19.6] تصفير حالة تجميد لقطة الإنهاء للشوط الجديد */
  if (ad) { ad._endFreezeDone = null; if (ad._endFreezeTimer) { clearTimeout(ad._endFreezeTimer); ad._endFreezeTimer = null; } }
  RAMI_STATE.nextRound();
  if (mp) {
    ad._netEmit('nextRound', { fromRound: fromRound, dedup: 'nextround-' + fromRound });
    ad._renderGame();
    ad._processTurn();
  } else if (ad) {
    ad._renderGame();
    ad.playIntroAndStart();
  }
}

function ramiReset() {
  if (window.RamiAdapter) {
    window.RamiAdapter._renderSetup();
  }
}

function ramiSelectCard(cardId) {
  if (ramiIsSpectator()) return;
  const adapter = window.RamiAdapter || window.RAMI_ADAPTER;
  if (!adapter) return;
  /* الأوراق المنزلة (بحلقة ذهبية) لا تُحدَّد ولا تُحرَّك */
  if (adapter._meldedCardIds && adapter._meldedCardIds().has(cardId)) return;
  
  if (adapter.selectedCards.has(cardId)) {
    adapter.selectedCards.delete(cardId);
  } else {
    adapter.selectedCards.add(cardId);
  }
  if (typeof SND !== 'undefined' && SND.click) SND.click();
  adapter._updateHand();
  adapter._updateControls();
}

function ramiClearSelection() {
  const adapter = window.RamiAdapter || window.RAMI_ADAPTER;
  if (!adapter) return;
  adapter.selectedCards.clear();
  adapter._updateHand();
  adapter._updateControls();
  if (typeof SND !== 'undefined' && SND.click) SND.click();
}

/* ═══════════ سحب وإفلات الأوراق (Pointer Events) — يعمل باللمس والفأرة بسلاسة ═══════════ */
var _ramiDrag = null;
var _lastPileTap = null;
var _justDragged = false;

function ramiBindPointerEvents() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.__ramiPointerBound) return;
  window.__ramiPointerBound = true;

  document.addEventListener('pointerdown', ramiHandPointerDown, { passive: true });
  document.addEventListener('pointerdown', ramiPilePointerDown, { passive: true });

  document.addEventListener('pointermove', function (e) {
    if (!_ramiDrag) return;
    const d = _ramiDrag;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && (dx * dx + dy * dy) < 64) return; // عتبة 8px لتفريق النقرة عن السحب

    if (!d.moved) {
      d.moved = true;
      const adapter = window.RamiAdapter || window.RAMI_ADAPTER;
      let cardObj = null;
      if (adapter && adapter.handSlots) {
        for (let s = 0; s < 5; s++) {
          const found = adapter.handSlots[s].find(c => c.id === d.cardId);
          if (found) { cardObj = found; break; }
        }
      }
      if (!cardObj) { _ramiDrag = null; return; }

      const ghost = document.createElement('div');
      ghost.className = 'rami-drag-ghost';
      ghost.innerHTML = getRamiCardHTML(cardObj, false);
      document.body.appendChild(ghost);
      d.ghost = ghost;
      document.body.classList.add('rami-dragging');

      const dz = document.getElementById('ramiDiscardDropZone');
      if (dz) dz.classList.add('active');
    }

    if (d.ghost) {
      d.ghost.style.left = e.clientX + 'px';
      d.ghost.style.top = e.clientY + 'px';
    }

    const slot = ramiSlotAtPoint(e.clientX, e.clientY);
    document.querySelectorAll('.rami-slot-box').forEach(function (el, idx) {
      el.classList.toggle('drag-hover', idx === slot);
    });
    var _isoHover = document.getElementById('ramiIsolateSlot');
    if (_isoHover) _isoHover.classList.toggle('drag-hover', ramiPointInIsolateZone(e.clientX, e.clientY));
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  document.addEventListener('pointerup', function (e) {
    if (!_ramiDrag) return;
    const d = _ramiDrag;
    const adapter = window.RamiAdapter || window.RAMI_ADAPTER;

    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    document.body.classList.remove('rami-dragging');
    const dz = document.getElementById('ramiDiscardDropZone');
    if (dz) dz.classList.remove('active');
    document.querySelectorAll('.rami-slot-box').forEach(function (el) { el.classList.remove('drag-hover'); });
    var _isoCl = document.getElementById('ramiIsolateSlot'); if (_isoCl) _isoCl.classList.remove('drag-hover');
    _ramiDrag = null;

    if (!d.moved) {
      // نقرة بسيطة → تحديد / إلغاء تحديد الورقة
      ramiSelectCard(d.cardId);
      return;
    }

    _justDragged = true;
    setTimeout(function () { _justDragged = false; }, 160);

    if (!adapter || !adapter.game) return;

    // الإفلات في الثلث الأوسط للطاولة → رمي الورقة
    if (ramiPointInDiscardZone(e.clientX, e.clientY)) {
      if (typeof adapter.game.normalizeTurnPhase === 'function') adapter.game.normalizeTurnPhase();
      if (adapter.game.roundManager.turnPhase === 'WAITING_DISCARD') {
        ramiAction('discard', d.cardId);
      } else {
        _ramiToast(_ramiT('rami.mustDrawFirst') || 'اسحب ورقة أولاً من المجرف أو المرموق قبل الرمي', 'warn');
        adapter._updateHand();
      }
      return;
    }

    // الإفلات في خانة العزل ♛ → عزل الورقة الـ15 خارج المجموعات
    if (ramiPointInIsolateZone(e.clientX, e.clientY)) {
      ramiIsolateCard(d.cardId);
      return;
    }

    const slot = ramiSlotAtPoint(e.clientX, e.clientY);
    if (slot >= 0) {
      ramiMoveCardToSlot(d.cardId, slot);
    } else {
      adapter._updateHand(); // إرجاع الورقة لمكانها
    }
  }, { passive: false });

  document.addEventListener('pointercancel', function () {
    if (!_ramiDrag) return;
    const d = _ramiDrag;
    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    document.body.classList.remove('rami-dragging');
    const dz = document.getElementById('ramiDiscardDropZone');
    if (dz) dz.classList.remove('active');
    document.querySelectorAll('.rami-slot-box').forEach(function (el) { el.classList.remove('drag-hover'); });
    var _isoCl = document.getElementById('ramiIsolateSlot'); if (_isoCl) _isoCl.classList.remove('drag-hover');
    _ramiDrag = null;
    const adapter = window.RamiAdapter || window.RAMI_ADAPTER;
    if (adapter) adapter._updateHand();
  });
}

function ramiHandPointerDown(e) {
  if (ramiIsSpectator()) return;
  const adapter = window.RamiAdapter || window.RAMI_ADAPTER;
  if (!adapter || !adapter.game) return;
  if (checkRamiBusy()) return;
  const curP = adapter.game.roundManager.getCurrentPlayer();
  if (!curP || curP.isBot) return;
  const wrap = (e.target && e.target.closest) ? e.target.closest('.rami-card-wrap[data-id]') : null;
  if (!wrap) return;
  if (wrap.hasAttribute('data-melded')) return; /* الأوراق المنزلة غير قابلة للسحب/التحديد */
  const cardId = parseInt(wrap.getAttribute('data-id'), 10);
  if (isNaN(cardId)) return;
  /* setPointerCapture: يضمن استمرار تدفق أحداث المؤشر (ماوس/لمس) للعنصر حتى خارج حدوده */
  try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
  _ramiDrag = { cardId: cardId, startX: e.clientX, startY: e.clientY, moved: false, ghost: null, el: wrap, pointerId: e.pointerId };
}

function ramiPilePointerDown(e) {
  if (ramiIsSpectator()) return;
  const adapter = window.RamiAdapter || window.RAMI_ADAPTER;
  if (!adapter || !adapter.game) return;
  if (checkRamiBusy()) return;
  const curP = adapter.game.roundManager.getCurrentPlayer();
  if (!curP || curP.isBot) return;
  const el = (e.target && e.target.closest) ? e.target.closest('[data-ramidraw]') : null;
  if (!el) return;
  const kind = el.getAttribute('data-ramidraw');
  const now = Date.now();
  if (_lastPileTap && _lastPileTap.el === el && (now - _lastPileTap.t) < 420) {
    _lastPileTap = null;
    ramiAction(kind === 'deck' ? 'draw_deck' : (kind === 'fojok' ? 'draw_fojok' : 'draw_discard'));
    return;
  }
  _lastPileTap = { el: el, t: now };
  /* رسالة توجيه واحدة فقط في اللحظة نفسها: إن كان سطر الإرشاد ظاهراً لا نعرض توستاً إضافياً */
  const hintEl = document.getElementById('ramiHintLine');
  const hintVisible = hintEl && !hintEl.hidden;
  if (!hintVisible) {
    if (adapter.game.roundManager.turnPhase === 'WAITING_DRAW') {
      _ramiToast((kind === 'deck' ? '🃏 اضغط مرة ثانية للسحب من المجرف' : (kind === 'fojok' ? '🃏 اضغط مرة ثانية لسحب الفوجوك (الدور الأول فقط)' : '🃏 اضغط مرة ثانية لأخذ ' + (adapter.game.roundManager.laTourCard ? 'ورقة لا تور' : 'المرموق'))), 'info');
    } else {
      _ramiToast(_ramiT('rami.mustDrawFirst') || 'يجب السحب أولاً قبل الرمي', 'info');
    }
  }
}

/* ═══ خانة العزل ♛ (بجنب تاج التوزيع): عزل ورقة واحدة (الورقة الـ15) خارج المجموعات
   الخمس لتفعيل الافتتاح/الإنهاء الصحيح. تُقبل بالسحب والإفلات فيها أو بتحديد ورقة بالنقر
   ثم النقر على الخانة. النقر على الخانة المعبأة يُرجع الورقة لليد. ═══ */
function ramiPointInIsolateZone(x, y) {
  var el = document.getElementById('ramiIsolateSlot');
  if (!el) return false;
  var r = el.getBoundingClientRect();
  return (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
}

function ramiIsolateCard(cardId) {
  if (ramiIsSpectator()) return;
  var adapter = window.RamiAdapter || window.RAMI_ADAPTER;
  if (!adapter || !adapter.game) return;
  /* الورقة المنزلة (بحلقة ذهبية) لا تُعزل */
  if (adapter._meldedCardIds && adapter._meldedCardIds().has(cardId)) {
    adapter._updateHand();
    _ramiToast('لا يمكن عزل ورقة منزلة في المجموعات', 'warn');
    return;
  }
  /* يمكن عزل ورقة واحدة فقط في آنٍ واحد */
  if (adapter.isolateCardId && adapter.isolateCardId !== cardId) {
    _ramiToast('يمكن عزل ورقة واحدة فقط — أعد الورقة المعزولة الحالية لليد أولاً بالنقر على الخانة', 'warn');
    adapter._updateHand();
    return;
  }
  adapter.isolateCardId = cardId;
  /* إخراج الورقة من الخانات الخمس حتى لا تظهر مكررة (تُعرض في خانة العزل فقط) */
  if (adapter.handSlots) {
    for (var s = 0; s < 5; s++) {
      adapter.handSlots[s] = adapter.handSlots[s].filter(function (c) { return c.id !== cardId; });
    }
  }
  adapter.selectedCards.clear();
  adapter._updateHand();
  adapter._updateControls();
  if (typeof SND !== 'undefined' && SND.card) SND.card();
  _ramiToast(_ramiT('rami.isolateDone', 'تم عزل الورقة — ستُقلب كالورقة الأخيرة عند الإنهاء'), 'ok');
}

function ramiClickIsolateSlot(event) {
  if (event) { try { event.stopPropagation(); } catch (e) {} }
  var adapter = window.RamiAdapter || window.RAMI_ADAPTER;
  if (!adapter) return;
  /* نقر مع ورقة محددة مسبقاً ⇒ عزلها */
  if (adapter.selectedCards && adapter.selectedCards.size > 0) {
    var id = Array.from(adapter.selectedCards)[0];
    ramiIsolateCard(id);
    return;
  }
  /* الخانة معبأة ⇒ إرجاع الورقة المعزولة لليد */
  if (adapter.isolateCardId) {
    adapter.isolateCardId = null;
    adapter._updateHand();
    adapter._updateControls();
    if (typeof SND !== 'undefined' && SND.click) SND.click();
  } else {
    _ramiToast(_ramiT('rami.isolateSlot', 'اسحب ورقة وأفلتها هنا لعزلها، أو حدّد ورقة بالنقر ثم انقر هنا'), 'info');
  }
}

function ramiPointInDiscardZone(x, y) {
  const dz = document.getElementById('ramiDiscardDropZone');
  if (!dz) return false;
  const r = dz.getBoundingClientRect();
  return (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
}

function ramiSlotAtPoint(x, y) {
  const slots = document.querySelectorAll('.rami-slot-box');
  for (let i = 0; i < slots.length; i++) {
    const r = slots[i].getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
  }
  return -1;
}

/* [V28] ترتيب تلقائي للمتتالية في خانة: بمجرد وضع الأوراق (سحب/إفلات) تُرتَّب
   الأرقام من الأصغر للأكبر (يمين←يسار) والجوكر يوضع في موضع الرقم الناقص أو طرفه. */
function ramiAutoSortSlot(adapter, slotIdx) {
  if (!adapter || !adapter.handSlots || !adapter.game) return;
  const cards = adapter.handSlots[slotIdx];
  if (!cards || cards.length < 3) return;
  const rules = adapter.game.rules;
  if (rules.isValidSequence(cards, true)) {
    adapter.handSlots[slotIdx] = ramiOrderSequenceCards(cards.slice(), c => rules.isWildCard(c));
  }
}

function ramiMoveCardToSlot(cardId, targetSlotIdx) {
  const adapter = window.RamiAdapter || window.RAMI_ADAPTER;
  if (!adapter || !adapter.handSlots) return;
  let cardObj = null;
  for (let s = 0; s < 5; s++) {
    const idx = adapter.handSlots[s].findIndex(c => c.id === cardId);
    if (idx !== -1) {
      cardObj = adapter.handSlots[s].splice(idx, 1)[0];
      break;
    }
  }
  if (cardObj && targetSlotIdx >= 0 && targetSlotIdx < 5) {
    adapter.handSlots[targetSlotIdx].push(cardObj);
    ramiAutoSortSlot(adapter, targetSlotIdx);
    adapter._updateHand();
    if (typeof SND !== 'undefined' && SND.card) SND.card();
  }
}

function ramiClickSlot(slotIdx, event) {
  if (ramiIsSpectator()) return;
  if (_justDragged) return;
  if (event && event.target && event.target.closest && event.target.closest('.rami-card-wrap')) return;
  const adapter = window.RamiAdapter || window.RAMI_ADAPTER;
  if (!adapter || !adapter.selectedCards || adapter.selectedCards.size === 0) return;

  const selectedIds = Array.from(adapter.selectedCards);
  for (const cardId of selectedIds) {
    let cardObj = null;
    for (let s = 0; s < 5; s++) {
      const idx = adapter.handSlots[s].findIndex(c => c.id === cardId);
      if (idx !== -1) {
        cardObj = adapter.handSlots[s].splice(idx, 1)[0];
        break;
      }
    }
    if (cardObj && slotIdx >= 0 && slotIdx < 5) {
      adapter.handSlots[slotIdx].push(cardObj);
    }
  }

  ramiAutoSortSlot(adapter, slotIdx);
  adapter.selectedCards.clear();
  adapter._updateHand();
  adapter._updateControls();
  if (typeof SND !== 'undefined' && SND.card) SND.card();
}

function ramiToggleAutoPlay() {
  if (window.RamiAdapter || window.RAMI_ADAPTER) {
    const ad = window.RamiAdapter || window.RAMI_ADAPTER;
    if (typeof ad.toggleHumanAutoPlay === 'function') ad.toggleHumanAutoPlay();
  }
}

function ramiAddCardToTableMeld(targetPlayerId, meldIndex, cardIdx) {
  if (ramiIsSpectator()) return;
  const game = RAMI_STATE || (typeof window !== 'undefined' ? window.RAMI_STATE : null);
  if (!game) return;
  const player = game.roundManager.getCurrentPlayer();
  if (!player) return;

  /* [V15] استجابة واضحة لكل حالة: لا صمت أبداً */
  if (player.isBot) {
    _ramiToast('⏳ دور الخصم الآن — انتظر حتى يحين دورك', 'warn');
    return;
  }
  if (game.gamePhase !== 'PLAYING') {
    _ramiToast('انتهى الشوط — لا يمكن إضافة أوراق الآن', 'warn');
    return;
  }
  if (checkRamiBusy()) {
    _ramiToast('⏳ انتظر لحظة — يتم الآن تنفيذ الحركة السابقة', 'warn');
    return;
  }
  if (game.roundManager.turnPhase === 'WAITING_DRAW') {
    _ramiToast('اسحب ورقة أولاً من المجرف أو المرموق قبل إضافة الأوراق', 'warn');
    return;
  }
  if (!player.hasOpened) {
    _ramiToast(_ramiT('rami.mustOpenFirst') || 'يجب أن تفتتح مجموعاتك أولاً قبل إضافة أوراق للمجموعات المنزلة', 'warn');
    return;
  }

  const adapter = (typeof window !== 'undefined' && (window.RamiAdapter || window.RAMI_ADAPTER)) ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
  if (!adapter) return;

  let cardId = null;
  if (adapter.selectedCards && adapter.selectedCards.size === 1) {
    cardId = Array.from(adapter.selectedCards)[0];
  } else if (player.hand.length > 0) {
    const targetPlayer = game.players.find(p => p.id === targetPlayerId);
    if (targetPlayer && targetPlayer.melds && targetPlayer.melds[meldIndex]) {
      const tm = targetPlayer.melds[meldIndex];
      const fitting = player.hand.find(c => {
        if (cardFitsMeld(c, tm, game.rules, player.drawnDiscardCard || player.drawnLaTourCard, targetPlayer.melds)) return true;
        if (typeof tm.findJokerSwapIndex === 'function' && tm.findJokerSwapIndex(c, game.rules) !== -1) return true;
        return false;
      });
      if (fitting) cardId = fitting.id;
    }
  }

  if (cardId === null || cardId === undefined) {
    _ramiToast(_ramiT('rami.selectOneToAdd') || 'حدد ورقة واحدة من يدك أولاً (بالنقر عليها) ثم انقر على المجموعة المنزلة', 'info');
    return;
  }

  const card = player.getCard(cardId);
  if (!card) {
    _ramiToast('الورقة المحددة لم تعد في يدك', 'err');
    adapter.selectedCards.clear();
    adapter._updateUI();
    return;
  }

  const targetPlayer = game.players.find(p => p.id === targetPlayerId);
  if (!targetPlayer || !targetPlayer.melds || !targetPlayer.melds[meldIndex]) {
    _ramiToast('المجموعة المحددة لم تعد موجودة على الطاولة', 'err');
    return;
  }

  const targetMeld = targetPlayer.melds[meldIndex];

  // 1. فحص إمكانية استبدال الجوكر بالورقة الحقيقية التي يعوضها
  const jokerSwapIdx = (typeof targetMeld.findJokerSwapIndex === 'function') ? targetMeld.findJokerSwapIndex(card, game.rules) : -1;
  if (jokerSwapIdx !== -1) {
    const jokerCard = targetMeld.cards[jokerSwapIdx];
    player.removeCard(cardId);
    targetMeld.cards[jokerSwapIdx] = card;
    player.hand.push(jokerCard); // استعادة الجوكر ليد اللاعب
    
    if (player.drawnDiscardCard && player.drawnDiscardCard.id === cardId) player.drawnDiscardCard = null;
    if (player.drawnLaTourCard && player.drawnLaTourCard.id === cardId) player.drawnLaTourCard = null;
    player.tookLaTour = false;

    /* الورقة الحقيقية تبقى ظاهرة في خانتها بحلقة ذهبية، والجوكر يُضاف لليد تلقائياً عبر _updateHand */
    adapter.selectedCards.clear();
    if (adapter.multiplayer) adapter._netEmit('addToMeld', { playerId: player.id, targetPlayerId: targetPlayerId, meldIndex: meldIndex, cardIdx: jokerSwapIdx, cardId: cardId });
    if (typeof SND !== 'undefined' && SND.win) SND.win();
    _ramiToast('🃏 تم استبدال الجوكر بنجاح وأخذه إلى يدك!', 'ok');
    adapter._updateUI();
    return;
  }

  // 2. فحص إضافة الورقة لتوسيع المجموعة (تطابق دقيق: نفس الرمز تسلسلي / نفس القيمة برمز مختلف / جوكر بري)
  const isValid = (typeof cardFitsMeld === 'function') ? cardFitsMeld(card, targetMeld, game.rules, player.drawnDiscardCard || player.drawnLaTourCard, targetPlayer.melds) : false;

    if (isValid) {
    player.removeCard(cardId);
    /* [V28] إدراج مرتب: المتتالية تُرتَّب تصاعدياً.
       الجوكر: إن نُقر على الورقة الصغيرة (يمين) يوضع قبلها (مكان الورقة الأصغر)،
       وإن نُقر على الورقة الكبيرة (يسار) يوضع بعدها (مكان الورقة الأكبر). */
    if (targetMeld.type === MELD_TYPE.SEQUENCE) {
      if (game.rules.isWildCard(card)) {
        const naturals = targetMeld.cards.filter(c => !game.rules.isWildCard(c));
        let combined;
        if (naturals.length && cardIdx !== undefined && cardIdx !== null && cardIdx >= 0) {
          const aceHigh = naturals.some(c => c.rank >= 12);
          const rankOf = c => (c.rank === 1 ? (aceHigh ? 14 : 1) : c.rank);
          const clickedCard = targetMeld.cards[cardIdx];
          const clickedVal = clickedCard ? rankOf(clickedCard) : null;
          const minVal = Math.min.apply(null, naturals.map(rankOf));
          if (clickedVal === minVal) {
            /* الورقة الصغيرة → الجوكر قبلها (الأصغر) */
            combined = [card].concat(targetMeld.cards);
          } else {
            /* الورقة الكبيرة أو غيرها → الجوكر بعدها (الأكبر) */
            combined = targetMeld.cards.concat([card]);
          }
        } else {
          combined = targetMeld.cards.concat([card]);
        }
        targetMeld.cards = ramiOrderSequenceCards(combined, c => game.rules.isWildCard(c));
      } else {
        targetMeld.cards = ramiOrderSequenceCards(targetMeld.cards.concat([card]), c => game.rules.isWildCard(c));
      }
    } else {
      targetMeld.cards.push(card);
    }

    if (player.drawnDiscardCard && player.drawnDiscardCard.id === cardId) player.drawnDiscardCard = null;
    if (player.drawnLaTourCard && player.drawnLaTourCard.id === cardId) player.drawnLaTourCard = null;
    player.tookLaTour = false;
    /* الورقة المضافة تبقى ظاهرة في خانتها بحلقة ذهبية */

    adapter.selectedCards.clear();
    if (adapter.multiplayer) adapter._netEmit('addToMeld', { playerId: player.id, targetPlayerId: targetPlayerId, meldIndex: meldIndex, cardIdx: cardIdx, cardId: cardId });
    if (typeof SND !== 'undefined' && SND.card) SND.card();
    if (game.rules.isWildCard(card) && targetMeld.type === MELD_TYPE.SEQUENCE) {
      _ramiToast('🃏 تم إدراج الجوكر في المتتالية — ' + ramiJokerSlotDescription(targetMeld, game.rules), 'ok');
    } else {
      _ramiToast('✨ تمت إضافة الورقة إلى المجموعة في الطاولة بنجاح!', 'ok');
    }
    
    if (player.hand.length === 0) {
      adapter._endRoundUI();
    } else {
      adapter._updateUI();
    }
  } else {
    /* رسالة رفض دقيقة تميّز حالات الجوكر غير القانونية */
    const isWild = game.rules.isWildCard(card);
    if (isWild) {
      const hasWildInMeld = targetMeld.cards.some(c => game.rules.isWildCard(c));
      const naturals = targetMeld.cards.filter(c => !game.rules.isWildCard(c));
      const isSampeLWild = isWild && !card.isJoker;
      if (isSampeLWild && targetMeld.type === MELD_TYPE.SEQUENCE) {
        /* [SAMPEL-RULE] البرية (المعكوسة اللون) لا تدخل المتتاليات أصلاً — وظيفتها
           إكمال المتماثلة فقط. (رسالة السبب الحقيقي بدل «مكتملة من 4» الخاطئة) */
        _ramiToast('❌ قواعد السامبل: الورقة المعكوسة (الجوكر) تُكمل المتماثلة فقط — لا تُدرج في المتتاليات', 'err');
      } else if (hasWildInMeld) {
        _ramiToast('❌ لا يمكن إضافة جوكر ثانٍ إلى مجموعة تحتوي جوكراً أصلاً', 'err');
      } else if (targetMeld.type === MELD_TYPE.SET && naturals.length >= 4) {
        /* حد الـ4 أوراق خاص بالمتماثلة فقط — المتتالية تمتد بلا حد أقصى */
        _ramiToast('❌ لا يمكن إضافة جوكر إلى متماثلة مكتملة من 4 أوراق طبيعية', 'err');
      } else if (targetMeld._justOpened) {
        /* [V19.2] الحرة تبقى حرة في دور الإنزال فقط */
        _ramiToast('❌ المجموعة الحرة تبقى حرة في دور إنزالها — يمكن إدراج الجوكر فيها ابتداءً من الدور الموالي', 'err');
      } else if (targetMeld.type === MELD_TYPE.SEQUENCE) {
        /* متتالية طالاج: الجوكر المطبوع يقبلها الفاحص فقط لو سد فجوة حقيقية أو امتد السلسلة */
        _ramiToast('❌ الجوكر لا يجلس في مكانه الصحيح من هذه المتتالية (لا فجوة يسدها ولا امتداد متصل)', 'err');
      } else {
        _ramiToast('❌ لا يمكن إضافة هذا الجوكر إلى المجموعة المحددة', 'err');
      }
    } else {
      const drawn0 = player.drawnDiscardCard || player.drawnLaTourCard;
      if (targetMeld._justOpened && drawn0 && card.id === drawn0.id) {
        _ramiToast('❌ ورقة المرموق المسحوبة هذا الدور لا تُدرج في مجموعة أساسية من مجموعات الافتتاح في نفس الدور — يجوز في مجموعة إضافية أو ابتداءً من الدور الموالي', 'err');
      } else {
        _ramiToast('❌ هذه الورقة لا تتطابق مع نمط المجموعة المحددة', 'err');
      }
    }
  }
}

function ramiChangeBet(delta) {
  const maxGold = (typeof ST !== 'undefined' && ST.gold) ? ST.gold : 10000;
  RAMI_BET = Math.max(10, Math.min((RAMI_BET || 50) + delta, maxGold));
  window.RAMI_BET = RAMI_BET;
  const el = document.getElementById('ramiBetInput');
  if (el) el.value = RAMI_BET;
  if (typeof SND !== 'undefined' && SND.click) SND.click();
}

function ramiSetMaxBet() {
  const maxGold = (typeof ST !== 'undefined' && ST.gold) ? ST.gold : 1000;
  RAMI_BET = Math.max(10, maxGold);
  window.RAMI_BET = RAMI_BET;
  const el = document.getElementById('ramiBetInput');
  if (el) el.value = RAMI_BET;
  if (typeof SND !== 'undefined' && SND.coin) SND.coin();
}

/* تبديل نوع الجولة (طالاج/سامبل) وتحديث قائمة خيارات الهدف ديناميكياً */
function ramiSetMode(m) {
  window.RAMI_SETUP_MODE = m;
  const btns = document.querySelectorAll('#ramiModeSeg .rami-seg-btn');
  btns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === m); });
  const sel = document.getElementById('ramiTarget');
  if (sel && window.RamiAdapter && typeof window.RamiAdapter._targetOptions === 'function') {
    const prev = sel.value;
    sel.innerHTML = window.RamiAdapter._targetOptions(m);
    if ([].some.call(sel.options, function (o) { return o.value === prev; })) sel.value = prev;
  }
  if (typeof SND !== 'undefined' && SND.click) SND.click();
}

/* ═══════════════════════════════════════════════════════════
   وضع الغرفة: مزامنة لعب الرامي الجماعي بين بشر حقيقيين
   نمط البذرة المشتركة + إعادة تشغيل الحركات الحتمية (مثل رامي/رندا):
   - بذرة واحدة مشتركة للجولة كلها ⇒ نفس التوزيع على كل الأجهزة.
   - كل حركة تُبَثّ وتُطبَّق حتمياً محلياً ⇒ انسجام كامل دون خادم منطقي.
   - من يملك الدور يدير مؤقته ويبث حركته فقط؛ الآخرون يطبقون ويعرضون.
   ═══════════════════════════════════════════════════════════ */

/* معرف اللاعب (0 في اللعب الفردي) */
/* [Spectator] هل المستخدم الحالي متفرج؟ (يحظر الأفعال) */
function ramiIsSpectator() {
  var ad = (typeof window !== 'undefined') ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
  return !!(ad && ad.isSpectator);
}

function ramiMyPlayerId() {
  var ad = (typeof window !== 'undefined') ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
  return ad ? (ad.myPlayerId || 0) : 0;
}
/* معرّف المستخدم الحالي للمقارنة مع مصدر الحركة (تجاهل صدى حركاتي) */
function ramiMyUserId() {
  if (typeof AUTH !== 'undefined' && AUTH.user) return AUTH.user.id != null ? AUTH.user.id : AUTH.user.username;
  if (typeof ST !== 'undefined' && ST.user && ST.user.id) return ST.user.id;
  if (typeof ST !== 'undefined' && ST.user && ST.user.username) return ST.user.username;
  return (typeof Session !== 'undefined' && Session.user) ? (Session.user.id || Session.user.username) : 'me';
}

/* بدء اللعب الجماعي: يستدعيه الخادم عند تغيّر حالة الغرفة إلى «playing» */
function RM_roomStart(room) {
  var ad = (typeof window !== 'undefined') ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
  if (ad && typeof ad.enterRoom === 'function') ad.enterRoom(room);
}
/* استقبال حركة من غرفة عبر SSE room:move */
function RM_roomMove(d) {
  try {
    /* الغلاف: sendMove('rmove', payload) ⇒ يصل d={action:'rmove', data:payload} — نفكّ الحزمة */
    if (d && d.action === 'rmove' && d.data) d = d.data;
    var ad = (typeof window !== 'undefined') ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
    if (ad && typeof ad._netApplyMove === 'function') ad._netApplyMove(d);
  } catch (e) { if (typeof console !== 'undefined') console.error('[Rami MP] applyMove', e && e.message, e); }
}

/* [Req3] تحديث حالة الغرفة: إعادة رسم واجهة التصويت عند نهاية المباراة */
function RM_roomUpdate(room) {
  try {
    var ad = (typeof window !== 'undefined') ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
    if (ad && ad.multiplayer && ad.game && ad.game.gamePhase === 'MATCH_END' && typeof ad._endRoundUI === 'function') ad._endRoundUI();
  } catch (e) {}
}

/* ربط معالجات الغرفة عند فتح صفحة الرامي */
function ramiRegisterRooms() {
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.setGameHandler !== 'function') return;
  Rooms.setGameHandler(RM_roomMove);
  Rooms.setStartHandler(RM_roomStart);
  Rooms.setUpdateHandler(RM_roomUpdate);   /* [Req3] تحديث واجهة التصويت */
  /* [Resilience] استهلاك إعادة بناء الحالة عند العودة (انقطاع/إغلاق) إن وصلت قبل التسجيل */
  if (typeof Rooms.hasPendingReplay === 'function' && Rooms.hasPendingReplay()) {
    var rp = Rooms.consumePendingReplay();
    if (rp && rp.history && rp.history.length) { RM_applyReplay(rp); return; }
  }
  /* إن كانت غرفة رامي نشطة فعلاً ندخلها فوراً (استئناف) */
  if (Rooms.state && Rooms.state.game_id === 'rm' && Rooms.state.status === 'playing') {
    var ad2 = (typeof window !== 'undefined') ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
    if (ad2 && typeof ad2.enterRoom === 'function') ad2.enterRoom(Rooms.state);
    /* [Persist] لا replay معلق → اطلب سجل الحركات من الخادم لإعادة بناء الجولة */
    if (typeof Rooms.requestReplay === 'function') Rooms.requestReplay();
  }
}

/* [Resilience] تطبيق إعادة بناء الحالة (تصل عبر SSE room:replay بعد التسجيل) */
function RM_applyReplay(d) {
  try {
    var ad = (typeof window !== 'undefined') ? (window.RamiAdapter || window.RAMI_ADAPTER) : null;
    if (ad && typeof ad._netApplyReplay === 'function') ad._netApplyReplay((d && d.history) || [], (d && d.room_id) || null);
  } catch (e) { console.error('[Rami MP] applyReplay', e && e.message, e); }
}

/* ═══ امتداد النموذج الأولي لطبقة الشبكة ═══ */
/* الدخول في غرفة جماعية: المالك يبثّ التهيئة والبذرة، والضيوف ينتظرونها ثم يطبقونها */
RamiUIAdapter.prototype.enterRoom = function (room) {
  /* [Persist] استهلاك علم إعادة الانضمام (رهان الرامي يُدار خادمياً) */
  if (typeof Rooms !== 'undefined' && Rooms && Rooms._rejoinLive) Rooms._rejoinLive = false;
  this.multiplayer = true;
  this.room = room || null;

  /* اشتقاق ترتيب المقاعد ومعرف لاعبي */
  var order = (room && room.order) ? room.order.slice() : [];
  var me = ramiMyUserId();
  /* [Spectator] كشف وضع المتفرج: المستخدم في players لكنه spectate */
  var myEntry = null;
  if (room && room.players) {
    for (var pi = 0; pi < room.players.length; pi++) {
      if (String(room.players[pi].id) === String(me)) { myEntry = room.players[pi]; break; }
    }
  }
  this.isSpectator = !!(myEntry && myEntry.spectate);

  var mySeat = order.indexOf(me);
  if (mySeat === -1) {
    for (var i = 0; i < order.length; i++) { if (String(order[i]) === String(me)) { mySeat = i; break; } }
  }
  if (mySeat === -1) mySeat = 0;
  this.myPlayerId = this.isSpectator ? -1 : mySeat;

  var isOwner = !!(room && room.owner_id != null && me != null && String(room.owner_id) === String(me))
             || !!(room && room.isOwner)
             || !!(typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.isOwner);

  /* [Spectator] المتفرج: لا يستضيف ولا يلعب — ينتظر التهيئة ثم يبني الجولة محلياً لمراقبة الأفعال العامة */
  if (this.isSpectator) {
    this._renderSpectatorWait();
    return;
  }

  /* [Resilience] المالك يستضيف عند البدء الأولي/المباراة الجديدة (!hasHistory) حتى لو
     بقيت لعبة قديمة. عند العودة (hasHistory) ينتظر إعادة البناء من السجل — لكن لا يمسح
     لعبة بُنيت فعلاً (إعادة بناء من السجل عبر room:replay). */
  if (isOwner && !(room && room.hasHistory)) {
    if (!this._netHostInit) return;
    this._netHostInit(room);
  } else if (!this.game) {
    /* الضيف/العائد: انتظر استلام التهيئة أو إعادة البناء — فقط إن لم تُبنَ لعبة بعد */
    if (this.container) {
      this.container.innerHTML =
        '<div class="rami-setup-modal card" style="text-align:center;padding:28px 16px;">' +
          '<div class="rami-setup-emblem">\u{1F0CF}</div>' +
          '<div class="rami-setup-title">في انتظار بدء المالك للجولة…</div>' +
          '<div style="margin-top:12px;font-size:0.8rem;opacity:0.7;">' + (mySeat + 1) + ' / ' + (order.length || 1) + ' · ' + (me || '') + '</div>' +
        '</div>';
    }
  }
};

/* قراءة تهيئة الإعداد الحالية (المالك فقط) */
RamiUIAdapter.prototype._netConfig = function () {
  /* [RS-GameOpts] إعدادات الغرفة (من مودال إعدادات الغرفة) لها الأولوية */
  var rc = (typeof window !== 'undefined' && window.RAMI_ROOM_CFG) ? window.RAMI_ROOM_CFG : null;
  var mode = (rc && rc.mode) ? ((rc.mode === 'simple') ? 'simple' : 'talaj')
    : ((typeof window !== 'undefined' && window.RAMI_SETUP_MODE) ? window.RAMI_SETUP_MODE : 'talaj');
  var targetVal = 'single', target = 999999, isSingle = true;
  var tv = (rc && rc.target != null) ? String(rc.target) : null;
  if (tv == null) {
    var sel = document.getElementById('ramiTarget');
    if (sel && sel.value) tv = sel.value;
  }
  if (tv) {
    targetVal = tv;
    isSingle = (targetVal === 'single');
    target = isSingle ? 999999 : (parseInt(targetVal, 10) || (mode === 'talaj' ? 501 : 301));
  }
  var bet = (typeof window !== 'undefined' && window.RAMI_BET) ? window.RAMI_BET : 50;
  var timerSec = (rc && rc.timer) ? rc.timer : 90;
  if (!(rc && rc.timer)) {
    var tSel = document.getElementById('ramiTimerSelect');
    if (tSel) timerSec = parseInt(tSel.value, 10) || 90;
  }
  return { mode: mode, target: target, isSingle: isSingle, targetVal: targetVal, bet: bet, timer: timerSec };
};

/* [MP-AI] مقاعد الآلي من ترتيب الغرفة (المعرّفات التي تبدأ بـ bot) */
RamiUIAdapter.prototype._netBotSeats = function (order) {
  if (!order || !order.length) return [];
  var seats = [];
  for (var i = 0; i < order.length; i++) { if (String(order[i]).indexOf('bot') === 0) seats.push(i); }
  return seats;
};

/* المالك يبدأ الجولة ويبثّ البذرة الموحّدة */
RamiUIAdapter.prototype._netHostInit = function (room) {
  var cfg = this._netConfig();
  var order = (room && room.order) ? room.order.slice() : [];
  var playerCount = Math.max(2, order.length || 2);
  var seed = Math.floor(Math.random() * 0xFFFFFFFF);
  var botSeats = this._netBotSeats(order);   /* [MP-AI] مقاعد الآلي */

  /* بناء الجولة محلياً عند المالك */
  this._netBuildGame(cfg, seed, playerCount, botSeats);

  /* بثّ التهيئة للجميع (تُحفظ في room_state عبر Rooms.sendMove) */
  this._netEmit('init', { mode: cfg.mode, target: cfg.target, targetVal: cfg.targetVal, isSingle: cfg.isSingle, bet: cfg.bet, timer: cfg.timer, seed: seed, playerCount: playerCount, botSeats: botSeats, order: order });
};

/* بناء الجولة بالبذرة والتهيئة المعطاة (نفسها عند المالك والضيوف) */
RamiUIAdapter.prototype._netBuildGame = function (cfg, seed, playerCount, botSeats) {
  RAMI_STATE = new RamiGame(cfg.mode, playerCount, 0, seed, cfg.timer, botSeats);
  RAMI_STATE.rules.turnSeconds = cfg.timer;
  RAMI_STATE.roundManager.turnSecondsRemaining = cfg.timer;
  RAMI_STATE.isSingleRound = !!cfg.isSingle;
  RAMI_STATE.displayTarget = cfg.isSingle ? _ramiT('rami.singleShort', 'ش و') : cfg.target;
  RAMI_STATE.startMatch(cfg.target);
  window.RAMI_STATE = RAMI_STATE;
  if (typeof window !== 'undefined') window.RAMI_BET = cfg.bet;

  this.game = RAMI_STATE;
  this.selectedCards.clear();
  this.handSlots = [[], [], [], [], []];
  this._renderGame();
  /* مزامنة الدور الأول: عرض فقط (بدون إقحام بوت) — كل اللاعبين بشر */
  this._processTurn();
};

/* بثّ حركة للغرفة (تجاهلها اللاعب نفسه عند صدى العودة) */
RamiUIAdapter.prototype._netEmit = function (action, data) {
  if (!this.multiplayer) return;
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.sendMove !== 'function') return;
  this._netSeq = (this._netSeq || 0) + 1;
  var payload = { action: action, data: data, by: ramiMyUserId(), seq: this._netSeq, ts: Date.now() };
  try {
    Rooms.sendMove('rmove', payload, { game_id: 'rm', status: 'playing' });
  } catch (e) { if (typeof console !== 'undefined') console.error('[Rami MP] emit', e && e.message, e); }
};

/* تطبيق حركة وردت من لاعب آخر (أو التهيئة الأولية) */
RamiUIAdapter.prototype._netApplyMove = function (d) {
  if (!d || !this.multiplayer) return;
  /* تجاهل صدى حركاتي */
  if (d.by && String(d.by) === String(ramiMyUserId())) return;
  var action = d.action;
  if (action === 'init') {
    var data = d.data || {};
    this.myPlayerId = this._netResolveSeat(data.order);
    /* [Spectator] تحديث الوضع عند بدء كل مباراة: من رُقّي يصبح لاعباً */
    this.isSpectator = (this.myPlayerId === -1);
    this._netBuildGame(data, data.seed, data.playerCount || 2, data.botSeats || this._netBotSeats(data.order));
    return;
  }
  if (!this.game) return; /* لم تصل التهيئة بعد */

  var g = this.game;
  var data = d.data || {};
  if (typeof g.normalizeTurnPhase === 'function') g.normalizeTurnPhase();

  switch (action) {
    case 'draw':
      g.executeMove({ type: data.drawType, playerId: data.playerId });
      break;
    case 'discard':
      g.executeMove({ type: 'discard', playerId: data.playerId, cardId: data.cardId });
      break;
    case 'open':
      /* [PLAN-EXACT] المجموعات الصريحة تُمرَّر عبر الشبكة أيضاً — تطابق تام بين الأطراف */
      g.executeMove({ type: 'open', playerId: data.playerId, cardIds: data.cardIds || [], meldGroups: data.meldGroups || null });
      break;
    case 'finish':
      {
        var finMove = { type: 'finish', playerId: data.playerId };
        if (data.isolateCardId != null) finMove.isolateCardId = data.isolateCardId;
        g.executeMove(finMove);
      }
      break;
    case 'addToMeld':
      _ramiNetApplyAddToMeld(g, data);
      break;
    case 'nextRound':
      /* [Resilience] حارس fromRound: لا تُطبّق إن انتقلتُ محلياً (تقدّم ديمقراطي مكرَّر) */
      if (g.roundManager && data.fromRound != null && g.roundManager.roundNumber !== data.fromRound) return;
      try { if (window._ramiAutoAdvTimer) { clearInterval(window._ramiAutoAdvTimer); window._ramiAutoAdvTimer = null; } } catch (e2) {}
      g.nextRound();
      this.game._payoutDone = false;
      this.game._roundRecorded = false;
      this._renderGame();
      this._processTurn();
      return;
    case 'autoTimeout':
      /* [Resilience] تطبيق الحركة الدقيقة التي اختارها السائق (لا منطق محلي → لا تباين) */
      {
        var ap = data.playerId;
        if (data.drew) g.executeMove({ type: 'draw_deck', playerId: ap });
        if (data.discardCardId != null) g.executeMove({ type: 'discard', playerId: ap, cardId: data.discardCardId });
      }
      break;
    default:
      return;
  }

  /* بعد أي حركة: إدارة الدور — يُنبّه صاحب الدور الجديد ويشغّل مؤقته، صامت لغيره */
  var ended = (g.gamePhase === 'ROUND_END' || g.gamePhase === 'MATCH_END');
  if (ended) {
    this._endRoundUI();
  } else {
    this._processTurn();
  }
};

/* [Resilience] إعادة بناء الحالة الجارية من تاريخ الحركات عند العودة للاعب المنقطع.
   يطبّق الحركات مباشرةً (دلال by) صمتاً، ثم يعرض الحالة النهائية مرة واحدة. */
RamiUIAdapter.prototype._netApplyReplay = function (history, roomId) {
  if (!history || !history.length) return;
  /* [Resilience] لا تُعد بناء لعبة قائمة فعلًا (تظل متزامنة عبر room:move الحيّ)؛
     الإعادة تهمّ فقط العائد بعد إغلاق/إعادة تحميل (المحوّل جديد بلا لعبة) */
  if (this.game) return;
  try {
    this.multiplayer = true;
    if (!this.room && typeof Rooms !== 'undefined' && Rooms.state) this.room = Rooms.state;
    this._replaying = true;
    for (var i = 0; i < history.length; i++) {
      var m = history[i], md = m.data || {};
      try {
        if (this.game && typeof this.game.normalizeTurnPhase === 'function') this.game.normalizeTurnPhase();
        if (m.action === 'init') {
          this.myPlayerId = this._netResolveSeat(md.order);
          this.isSpectator = (this.myPlayerId === -1);
          this._netBuildGame(md, md.seed, md.playerCount || 2, md.botSeats || this._netBotSeats(md.order));
        } else if (!this.game) {
          continue;
        } else if (m.action === 'draw') {
          this.game.executeMove({ type: md.drawType, playerId: md.playerId });
        } else if (m.action === 'discard') {
          this.game.executeMove({ type: 'discard', playerId: md.playerId, cardId: md.cardId });
        } else if (m.action === 'open') {
          this.game.executeMove({ type: 'open', playerId: md.playerId, cardIds: md.cardIds || [] });
        } else if (m.action === 'finish') {
          var fm = { type: 'finish', playerId: md.playerId };
          if (md.isolateCardId != null) fm.isolateCardId = md.isolateCardId;
          this.game.executeMove(fm);
        } else if (m.action === 'addToMeld') {
          _ramiNetApplyAddToMeld(this.game, md);
        } else if (m.action === 'autoTimeout') {
          if (md.drew) this.game.executeMove({ type: 'draw_deck', playerId: md.playerId });
          if (md.discardCardId != null) this.game.executeMove({ type: 'discard', playerId: md.playerId, cardId: md.discardCardId });
        } else if (m.action === 'nextRound') {
          var rrm = this.game.roundManager;
          if (!(rrm && md.fromRound != null && rrm.roundNumber !== md.fromRound)) {
            this.game.nextRound();
            this.game._payoutDone = false;
            this.game._roundRecorded = false;
          }
        }
      } catch (e2) { console.error('[Rami] replay move', m && m.action, e2 && e2.message); }
    }
    this._replaying = false;
    var g = this.game;
    if (!g) return;
    if (this.isSpectator) { this._renderGame(); return; }
    var ended = (g.gamePhase === 'ROUND_END' || g.gamePhase === 'MATCH_END');
    this._renderGame();
    if (ended) this._endRoundUI(); else this._processTurn();
    _ramiToast('\u{1F501} ' + (_ramiT('rami.rejoined') || 'تمت استعادة الجولة الحالية'), 'ok');
  } catch (e) {
    this._replaying = false;
    console.error('[Rami] replay', e && e.message, e);
  }
};

/* حلّ مقعدي من ترتيب الغرفة */
RamiUIAdapter.prototype._netResolveSeat = function (order) {
  if (!order || !order.length) return 0;
  var me = ramiMyUserId();
  for (var i = 0; i < order.length; i++) { if (String(order[i]) === String(me)) return i; }
  return -1; /* [Spectator] ليس في الترتيب ⇒ متفرج */
};

/* تطبيق إدراج/استبدال الجوكر في مجموعة (نسخة نقية من ramiAddCardToTableMeld) */
function _ramiNetApplyAddToMeld(g, data) {
  var player = g.players.find(function (p) { return p.id === data.playerId; });
  if (!player) return;
  var targetPlayer = g.players.find(function (p) { return p.id === data.targetPlayerId; });
  if (!targetPlayer || !targetPlayer.melds || !targetPlayer.melds[data.meldIndex]) return;
  var targetMeld = targetPlayer.melds[data.meldIndex];
  var card = player.getCard(data.cardId);
  if (!card) return;

  var rules = g.rules;
  /* 1) استبدال جوكر */
  var jokerSwapIdx = (typeof targetMeld.findJokerSwapIndex === 'function') ? targetMeld.findJokerSwapIndex(card, rules) : -1;
  if (jokerSwapIdx !== -1) {
    var jokerCard = targetMeld.cards[jokerSwapIdx];
    player.removeCard(data.cardId);
    targetMeld.cards[jokerSwapIdx] = card;
    player.hand.push(jokerCard);
    if (player.drawnDiscardCard && player.drawnDiscardCard.id === data.cardId) player.drawnDiscardCard = null;
    if (player.drawnLaTourCard && player.drawnLaTourCard.id === data.cardId) player.drawnLaTourCard = null;
    player.tookLaTour = false;
    return;
  }
  /* 2) إضافة لتوسيع المجموعة */
  player.removeCard(data.cardId);
  if (targetMeld.type === MELD_TYPE.SEQUENCE) {
    var combined = targetMeld.cards.concat([card]);
    if (rules.isWildCard(card) && data.cardIdx !== undefined && data.cardIdx !== null) {
      var naturals = targetMeld.cards.filter(function (c) { return !rules.isWildCard(c); });
      if (naturals.length) {
        var aceHigh = naturals.some(function (c) { return c.rank >= 12; });
        var rankOf = function (c) { return c.rank === 1 ? (aceHigh ? 14 : 1) : c.rank; };
        var clickedCard = targetMeld.cards[data.cardIdx];
        var clickedVal = clickedCard ? rankOf(clickedCard) : null;
        var minVal = Math.min.apply(null, naturals.map(rankOf));
        combined = (clickedVal === minVal) ? [card].concat(targetMeld.cards) : targetMeld.cards.concat([card]);
      }
    }
    targetMeld.cards = ramiOrderSequenceCards(combined, function (c) { return rules.isWildCard(c); });
  } else {
    targetMeld.cards.push(card);
  }
  if (player.drawnDiscardCard && player.drawnDiscardCard.id === data.cardId) player.drawnDiscardCard = null;
  if (player.drawnLaTourCard && player.drawnLaTourCard.id === data.cardId) player.drawnLaTourCard = null;
  player.tookLaTour = false;
}

/* ── Global Window Exports ── */
window.RAMI_STATE = RAMI_STATE;
window.RAMI_BET = RAMI_BET;
window.ramiAction = ramiAction;
window.ramiOpenMelds = ramiOpenMelds;
window.ramiStartGame = ramiStartGame;
window.ramiNextRound = ramiNextRound;
window.ramiReset = ramiReset;
window.initRami = initRami;
window.eRami = eRami;
window.RamiCard = RamiCard;
window.RamiDeck = RamiDeck;
window.RamiGame = RamiGame;
window.RAMI_SUIT_GLYPH = RAMI_SUIT_GLYPH;
window.getRamiCardHTML = getRamiCardHTML;
window.ramiSelectCard = ramiSelectCard;
window.ramiClearSelection = ramiClearSelection;
window.ramiMoveCardToSlot = ramiMoveCardToSlot;
window.ramiSlotAtPoint = ramiSlotAtPoint;
window.ramiPointInDiscardZone = ramiPointInDiscardZone;
window.ramiPointInIsolateZone = ramiPointInIsolateZone;
window.ramiIsolateCard = ramiIsolateCard;
window.ramiClickIsolateSlot = ramiClickIsolateSlot;
window.ramiClickSlot = ramiClickSlot;
window.ramiAutoSortSlot = ramiAutoSortSlot;
window.ramiBindPointerEvents = ramiBindPointerEvents;
window.ramiHandPointerDown = ramiHandPointerDown;
window.ramiPilePointerDown = ramiPilePointerDown;
window.RamiUIAdapter = RamiUIAdapter;
window.ramiToggleAutoPlay = ramiToggleAutoPlay;
window.ramiAddCardToTableMeld = ramiAddCardToTableMeld;
window.ramiChangeBet = ramiChangeBet;
window.ramiSetMaxBet = ramiSetMaxBet;
window.ramiSetMode = ramiSetMode;
window.ramiCopyHistory = ramiCopyHistory;
window.fallbackCopy = fallbackCopy;
window.aggregatePenaltyText = aggregatePenaltyText;
window.cardFitsMeld = cardFitsMeld;
window.ramiStateInstruction = ramiStateInstruction;
window.ramiOrderSequenceCards = ramiOrderSequenceCards;
window.ramiJokerSlotDescription = ramiJokerSlotDescription;

/* وضع الغرفة الجماعي */
window.RM_roomStart = RM_roomStart;
window.RM_roomMove = RM_roomMove;
window.ramiRegisterRooms = ramiRegisterRooms;
window.ramiMyPlayerId = ramiMyPlayerId;
window.ramiIsSpectator = ramiIsSpectator;
window._ramiNetApplyAddToMeld = _ramiNetApplyAddToMeld;

window.RamiMeld = RamiMeld;
window.MELD_TYPE = MELD_TYPE;
window.RamiRules = RamiRules;
window.MeldValidator = MeldValidator;
window.partitionSelectedCards = partitionSelectedCards;
window.verifyRamiDeckIntegrity = verifyRamiDeckIntegrity;
window.ramiDeckAccounting = ramiDeckAccounting;

/* [V14] محاسبة دقيقة للأوراق: المتاحة + الموزعة + الباقية — كل ورقة فريدة ومحصاة مرة واحدة */
function ramiDeckAccounting(game) {
  const rm = game && game.roundManager;
  if (!rm) return null;
  const total = rm.rules.hasPhysicalJokers ? 108 : 104;
  const seen = new Set();
  let inDrawPile = 0, inDiscard = 0, inHands = 0, inMelds = 0;
  const count = (c, slot) => { if (!c || seen.has(c.id)) return; seen.add(c.id); if (slot === 'draw') inDrawPile++; else if (slot === 'discard') inDiscard++; else if (slot === 'hand') inHands++; else if (slot === 'meld') inMelds++; };
  for (const c of rm.drawPile) count(c, 'draw');
  for (const c of rm.discardPile) count(c, 'discard');
  if (rm.jokerIndicator) count(rm.jokerIndicator, 'discard');
  for (const p of game.players) {
    for (const c of p.hand) count(c, 'hand');
    for (const m of p.melds) for (const c of m.cards) count(c, 'meld');
  }
  return { total, inDrawPile, inDiscard, inHands, inMelds, remaining: total - seen.size };
}

/* فحص حي لسلامة الرزمة الحالية (أيدي + منزلات + مجرف + مرموق) */
function verifyRamiDeckIntegrity(game) {
  const rm = game && game.roundManager;
  if (!rm) return { ok: false, problem: 'no round manager' };
  const seenIds = new Set();
  const dupIds = [];
  const track = (c, loc) => { if (!c) return; if (seenIds.has(c.id)) dupIds.push(c.id); else seenIds.add(c.id); };
  for (const c of rm.drawPile) track(c, 'draw');
  for (const c of rm.discardPile) track(c, 'discard');
  if (rm.jokerIndicator) track(rm.jokerIndicator, 'ind');
  for (const p of game.players) {
    for (const c of p.hand) track(c, 'hand');
    for (const m of p.melds) for (const c of m.cards) track(c, 'meld');
  }
  if (dupIds.length) return { ok: false, problem: 'أوراق مكررة في مكانين: ' + dupIds.join(',') };
  return { ok: true, problem: null };
}
