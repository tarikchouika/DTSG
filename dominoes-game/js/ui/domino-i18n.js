/**
 * ============================================================================
 *  DominoI18n — نصوص الضومنة بأربع لغات + وثيقة القواعد
 *  [عربية، فرنسية، إنجليزية، دارجة] — نفس ترتيب المنصة (langIndex)
 *  القاموس الداخلي يعمل مستقلًا؛ وإن وُجد قاموس المنصة TR بمفاتيح dm.*
 *  فله الأولوية (تمهيدًا للتوحيد لاحقًا).
 * ============================================================================
 */
(function (root) {
  'use strict';

  const T = {
    'dm.title':     ['الضومنة', 'Domino', 'Dominoes', 'الضومنة'],
    'dm.tagline':   ['لعبة القهاوة المغربية', 'Le domino du café marocain', 'The Moroccan café classic', 'لعبة القهوة ديالنا'],
    'dm.mode':      ['نمط اللعب', 'Mode de jeu', 'Game mode', 'كيفاش تلعب'],
    'dm.mode.ai':   ['ضد الحاسوب', 'Contre l’IA', 'Vs Computer', 'ضد الكمبيوتر'],
    'dm.mode.local':['لاعبان — جهاز واحد', 'Deux joueurs', '2 Players', 'جوج لاعبين'],
    'dm.level':     ['المستوى', 'Difficulté', 'Difficulty', 'المستوى'],
    'dm.level.0':   ['مبتدئ', 'Facile', 'Easy', 'ساهل'],
    'dm.level.1':   ['متوسط', 'Moyen', 'Medium', 'وسط'],
    'dm.level.2':   ['خبير', 'Expert', 'Expert', 'خبير'],
    'dm.target':    ['نقاط الفوز', 'Score cible', 'Target score', 'النقط ديال الربح'],
    'dm.drawRule':  ['قاعدة السحب', 'Règle de pioche', 'Drawing rule', 'قاعدة السحب'],
    'dm.draw.classic': ['كلاسيكي — اسحب حتى تلعب', 'Classique : piocher jusqu’à jouer', 'Classic — draw until playable', 'كلاسيكي — جرب حتى تلعب'],
    'dm.draw.block': ['بدون بنك (Block)', 'Bloc (sans pioche)', 'Block (no draw)', 'بلا بنك'],
    'dm.bet':       ['الرهان', 'Mise', 'Bet', 'الرهان'],
    'dm.bet.hint':  ['الفوز بالمباراة يضاعف رهانك حسب المستوى', 'Gagner double votre mise selon le niveau', 'Winning multiplies your bet by level', 'اللي كيربح كيضاعف الرهان حسب المستوى'],
    'dm.start':     ['ابدأ المباراة', 'Commencer le match', 'Start match', 'بدا الماتش'],
    'dm.resume':    ['استئناف المباراة', 'Reprendre le match', 'Resume match', 'كمّل الماتش'],
    'dm.newMatch':  ['مباراة جديدة', 'Nouveau match', 'New match', 'ماتش جديد'],
    'dm.rules':     ['قواعد اللعبة', 'Règles du jeu', 'Game rules', 'قواعد اللعبة'],
    'dm.close':     ['فهمت، هيا نلعبو', 'Compris, on joue', 'Got it, let’s play', 'فهمت، يالله نلعبو'],

    'dm.you':       ['أنت', 'Vous', 'You', 'نتا'],
    'dm.opp':       ['الخصم', 'Adversaire', 'Opponent', 'الخصم'],
    'dm.p1':        ['اللاعب 1', 'Joueur 1', 'Player 1', 'اللاعب 1'],
    'dm.p2':        ['اللاعب 2', 'Joueur 2', 'Player 2', 'اللاعب 2'],
    'dm.round':     ['الجولة', 'Manche', 'Round', 'الجولة'],
    'dm.toTarget':  ['أول من يبلغ {n} يفوز', 'Premier à {n} gagne', 'First to {n} wins', 'اللي يوصل ل {n} كيربح'],
    'dm.boneyard':  ['البنك', 'Pioche', 'Boneyard', 'البنك'],

    'dm.turn.you':  ['دورك — اختر قطعة', 'À vous', 'Your turn', 'دورك'],
    'dm.turn.opp':  ['دور الخصم…', 'Tour de l’adversaire…', 'Opponent thinking…', 'دور الخصم…'],
    'dm.turn.p2':   ['دور اللاعب 2', 'Tour du Joueur 2', 'Player 2’s turn', 'دور اللاعب 2'],
    'dm.turn.p1':   ['دور اللاعب 1', 'Tour du Joueur 1', 'Player 1’s turn', 'دور اللاعب 1'],
    'dm.mustDraw':  ['ما عندك حركة — اسحب من البنك', 'Aucun coup — piochez', 'No move — draw from the boneyard', 'ما عندك والو — جرب من البنك'],
    'dm.mustPass':  ['بنك فارغ — مرّر الدور', 'Pioche vide — passez', 'Boneyard empty — pass', 'البنك خاوي — دوز الدور'],
    'dm.mustPlayDrawn': ['العب القطعة المسحوبة!', 'Jouez la tuile piochée !', 'Play the drawn tile!', 'تلعب القطعة لي سحبت!'],
    'dm.pickEnd':   ['اختر الطرف', 'Choisissez le côté', 'Pick a side', 'ختار الجيهة'],
    'dm.passed':    ['مرّر الدور', 'Il passe son tour', 'Passed', 'داز الدور'],
    'dm.drew':      ['سحب من البنك', 'Il a pioché', 'Drew a tile', 'سحب من البنك'],

    'dm.end.empty': ['أفرغ يده أولًا', 'a vidé sa main le premier', 'went out first', 'خلص يدهو لول'],
    'dm.end.blocked': ['انسداد!', 'Blocage !', 'Blocked!', 'تسدات اللعبة!'],
    'dm.tie':       ['تعادل — لا نقاط', 'Égalité — aucun point', 'Tie — no points', 'تعادل — حتى نقطة'],
    'dm.nextRound': ['الجولة التالية', 'Manche suivante', 'Next round', 'الجولة الجاية'],
    'dm.handPips':  ['نقاط اليد', 'Pips en main', 'Hand pips', 'نقط اليد'],
    'dm.total':     ['المجموع', 'Total', 'Total', 'المجموع'],

    'dm.won':       ['فزت بالمباراة!', 'Vous avez gagné le match !', 'You won the match!', 'ربحتي الماتش!'],
    'dm.lost':      ['خسرت المباراة', 'Vous avez perdu le match', 'You lost the match', 'خسرتي الماتش'],
    'dm.p1won':     ['اللاعب 1 يفوز بالمباراة!', 'Le Joueur 1 gagne !', 'Player 1 wins the match!', 'اللاعب 1 ربح الماتش!'],
    'dm.p2won':     ['اللاعب 2 يفوز بالمباراة!', 'Le Joueur 2 gagne !', 'Player 2 wins the match!', 'اللاعب 2 ربح الماتش!'],
    'dm.payout':    ['المكافأة', 'Gain', 'Payout', 'الربح'],
    'dm.resign':    ['إنهاء وانسحاب', 'Abandonner', 'Resign & exit', 'سالِ وخروج'],
    'dm.resignAsk': ['تنسحب وتخسر المباراة؟', 'Abandonner le match ?', 'Resign the match?', 'بغيتي تسالِ وخروج؟'],
    'dm.yes':       ['نعم، انسحب', 'Oui, abandonner', 'Yes, resign', 'آه، سالِ'],
    'dm.no':        ['متابعة اللعب', 'Continuer', 'Keep playing', 'كمّل'],
    'dm.noMoves':   ['لا توجد حركة قانونية', 'Aucun coup légal', 'No legal move', 'ما كاين حتى حركة'],

    /* ── الغرف (dm.room.*) ── */
    'dm.room.watch':      ['وضع المتفرج — تشاهد المباراة', 'Mode spectateur — vous regardez', 'Spectator mode — watching', 'وضع المتفرج — كتشوف الماتش'],
    'dm.room.settleNote': ['الرهان يُسوّى خادمياً', 'La mise est réglée par le serveur', 'The bet is settled by the server', 'الرهان كيتسوّى عند السيرفر']
  };

  function langIndex() {
    try { if (typeof root.langIndex === 'function') return root.langIndex(); } catch (e) {}
    try { if (typeof langIndex === 'function') return langIndex(); } catch (e) {}
    return 0;
  }

  function tr(key) {
    let li = langIndex();
    try {
      if (typeof root.TR === 'object' && root.TR && root.TR[key]) return root.TR[key][li] || root.TR[key][0];
      if (typeof TR === 'object' && TR && TR[key]) return TR[key][li] || TR[key][0];
    } catch (e) {}
    const row = T[key];
    if (!row) return key;
    return row[li] || row[0];
  }

  function fmt(key, n) { return String(tr(key)).replace('{n}', n); }

  /** ترجمة العناصر الثابتة ذات data-i18n */
  function translateStatic(scope) {
    const rootEl = scope || document;
    const els = rootEl.querySelectorAll('[data-i18n]');
    for (let i = 0; i < els.length; i++) {
      const v = tr(els[i].getAttribute('data-i18n'));
      if (v) els[i].textContent = v;
    }
  }

  /** وثيقة القواعد الكاملة (تُعرض في طبقة داخل اللعبة) */
  const RULES_DOC = [
    ['المجموعة', 'مجموعة Double-Six من 28 قطعة فريدة — 7 قطع لكل لاعب والـ 14 الباقية «البنك».'],
    ['البداية', 'يبدأ صاحب أعلى دبل ويلعبها إلزاميًا؛ وإن لم يوجد دبل في اليدين بدأ صاحب أثقل قطعة بحرة الاختيار. في الجولات التالية يبدأ فائز الجولة السابقة.'],
    ['الحركة', 'القطعة قانونية إذا طابقت إحدى قيميها أحد طرفي السلسلة المفتوحين. الدبل يوضع عرضيًا على السلسلة ولا يفتح طرفًا ثالثًا.'],
    ['السحب', 'إن لم تكن لديك حركة تسحب من البنك قطعةً قطعة حتى تصل قطعة صالحة ثم تلعبها فورًا. في نمط Block لا يوجد سحب إطلاقًا.'],
    ['التمرير', 'بنك فارغ بلا حركة؟ تمرّر الدور. تمريران متتاليان = انسداد وتنتهي الجولة.'],
    ['الحساب', 'إفراغ اليد: تأخذ مجموع نقاط يد خصمك. الانسداد: يفوز صاحب اليد الأخف ويأخذ الفرق — والتعادل بلا نقاط.'],
    ['المباراة', 'أول من يبلغ النقاط المستهدفة (50 / 100 / 150 / 200) يفوز بالمباراة.'],
    ['الرهان', 'في نمط ضد الحاسوب: الرهان يُخصم عند البدء ويتضاعف حسب المستوى عند الفوز (×1.5 / ×2 / ×3).']
  ];

  root.DMN_T = tr;
  root.DMN_FMT = fmt;
  root.DMN_LANG_INDEX = langIndex;
  root.DMN_RULES_DOC = RULES_DOC;
  root.DMNTranslateStatic = translateStatic;
})(typeof self !== 'undefined' ? self : this);
