/**
 * ============================================================================
 *  BgI18n — نصوص الطاولة بأربع لغات + وثيقة القواعد
 *  القاموس الداخلي يعمل مستقلًا؛ وإن وُجد قاموس المنصة فله الأولوية.
 * ============================================================================
 */
(function (root) {
  'use strict';

  const T = {
    'bg.title':     ['الطاولة', 'Tawla', 'Backgammon', 'الطاولة'],
    'bg.tagline':   ['لعبة الجوز والنرد — قواعد قياسية', 'Le backgammon aux règles standard', 'Classic walnut-board backgammon', 'لعبة الجوز والنرد بالقواعد'],
    'bg.mode':      ['نمط اللعب', 'Mode de jeu', 'Game mode', 'كيفاش تلعب'],
    'bg.mode.ai':   ['ضد الحاسوب', 'Contre l’IA', 'Vs Computer', 'ضد الكمبيوتر'],
    'bg.mode.local':['لاعبان — جهاز واحد', 'Deux joueurs', '2 Players', 'جوج لاعبين'],
    'bg.level':     ['المستوى', 'Difficulté', 'Difficulty', 'المستوى'],
    'bg.level.0':   ['مبتدئ', 'Facile', 'Easy', 'ساهل'],
    'bg.level.1':   ['متوسط', 'Moyen', 'Medium', 'وسط'],
    'bg.level.2':   ['خبير', 'Expert', 'Expert', 'خبير'],
    'bg.match':     ['طول المباراة', 'Longueur du match', 'Match length', 'طول الماتش'],
    'bg.pts':       ['نقاط', 'points', 'points', 'نقط'],
    'bg.bet':       ['الرهان', 'Mise', 'Bet', 'الرهان'],
    'bg.bet.hint':  ['الفوز بالمباراة يضاعف رهانك حسب المستوى', 'Gagner double votre mise selon le niveau', 'Winning multiplies your bet by level', 'اللي كيربح كيضاعف الرهان'],
    'bg.start':     ['ابدأ المباراة', 'Commencer le match', 'Start match', 'بدا الماتش'],
    'bg.resume':    ['استئناف المباراة', 'Reprendre le match', 'Resume match', 'كمّل الماتش'],
    'bg.newMatch':  ['مباراة جديدة', 'Nouveau match', 'New match', 'ماتش جديد'],
    'bg.nextGame':  ['اللعبة التالية', 'Jeu suivant', 'Next game', 'اللعبة الجاية'],
    'bg.rules':     ['قواعد اللعبة', 'Règles du jeu', 'Game rules', 'قواعد اللعبة'],
    'bg.close':     ['فهمت، هيا نلعبو', 'Compris, on joue', 'Got it, let’s play', 'فهمت، يالله نلعبو'],

    'bg.you':       ['أنت', 'Vous', 'You', 'نتا'],
    'bg.opp':       ['الخصم', 'Adversaire', 'Opponent', 'الخصم'],
    'bg.p1':        ['اللاعب 1', 'Joueur 1', 'Player 1', 'اللاعب 1'],
    'bg.p2':        ['اللاعب 2', 'Joueur 2', 'Player 2', 'اللاعب 2'],
    'bg.pip':       ['نقاط', 'Pips', 'Pips', 'النقط'],
    'bg.off':       ['الخارج', 'Sortis', 'Off', 'البرا'],
    'bg.matchTo':   ['المباراة حتى {n}', 'Match jusqu’à {n}', 'Match to {n}', 'الماتش حتى {n}'],

    'bg.roll':      ['ارمِ النرد', 'Lancer les dés', 'Roll dice', 'ارمي النرد'],
    'bg.opening':   ['نرد الافتتاح…', 'Dé d’ouverture…', 'Opening roll…', 'نرد البداية…'],
    'bg.turn.you':  ['دورك — حرّك أحجارك', 'À vous — jouez', 'Your turn — move', 'دورك — تحرك'],
    'bg.turn.opp':  ['دور الخصم…', 'Tour de l’adversaire…', 'Opponent…', 'دور الخصم…'],
    'bg.turn.p1':   ['دور اللاعب 1', 'Tour du Joueur 1', 'Player 1’s turn', 'دور اللاعب 1'],
    'bg.turn.p2':   ['دور اللاعب 2', 'Tour du Joueur 2', 'Player 2’s turn', 'دور اللاعب 2'],
    'bg.enterBar':  ['أدخل أحجارك من الأدمن', 'Réintégrez depuis la barre', 'Re-enter from the bar', 'دخل الحجور من الأدمن'],
    'bg.noMoves':   ['لا توجد حركة قانونية!', 'Aucun coup légal !', 'No legal moves!', 'ما كاين حتى حركة!'],
    'bg.starter':   ['الأعلى يبدأ بالرقمين', 'Le plus haut commence', 'Higher roll starts', 'الأعلى كيبدا بجوج'],
    'bg.undo':      ['تراجع', 'Annuler', 'Undo', 'رجّع'],

    'bg.game.won':  ['فزت باللعبة', 'Manche gagnée', 'Game won', 'ربحتي اللعبة'],
    'bg.game.lost': ['خسرت اللعبة', 'Manche perdue', 'Game lost', 'خسرتي اللعبة'],
    'bg.p1won':     ['اللاعب 1 يفوز', 'Le Joueur 1 gagne', 'Player 1 wins', 'اللاعب 1 ربح'],
    'bg.p2won':     ['اللاعب 2 يفوز', 'Le Joueur 2 gagne', 'Player 2 wins', 'اللاعب 2 ربح'],
    'bg.single':    ['فوز عادي', 'Victoire simple', 'Single win', 'ربح عادي'],
    'bg.gammon':    ['مارس!', 'Mars !', 'Gammon!', 'مارس!'],
    'bg.backgammon':['باك جامون!', 'Backgammon !', 'Backgammon!', 'باك كامون!'],
    'bg.match.won': ['فزت بالمباراة!', 'Vous avez gagné le match !', 'You won the match!', 'ربحتي الماتش!'],
    'bg.match.lost':['خسرت المباراة', 'Vous avez perdu le match', 'You lost the match', 'خسرتي الماتش'],
    'bg.payout':    ['المكافأة', 'Gain', 'Payout', 'الربح'],
    'bg.resign':    ['إنهاء وانسحاب', 'Abandonner', 'Resign & exit', 'سالِ وخروج'],
    'bg.resignAsk': ['تنسحب وتخسر المباراة؟', 'Abandonner le match ?', 'Resign the match?', 'بغيتي تسالِ وخروج؟'],
    'bg.yes':       ['نعم، انسحب', 'Oui, abandonner', 'Yes, resign', 'آه، سالِ'],
    'bg.no':        ['متابعة اللعب', 'Continuer', 'Keep playing', 'كمّل'],

    /* ── الغرف (bg.room.*) ── */
    'bg.room.watch':      ['وضع المتفرج — تشاهد المباراة', 'Mode spectateur — vous regardez', 'Spectator mode — watching', 'وضع المتفرج — كتشوف الماتش'],
    'bg.room.settleNote':  ['الرهان يُسوّى خادمياً', 'La mise est réglée par le serveur', 'The bet is settled by the server', 'الرهان كيتسوّى عند السيرفر']
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

  function translateStatic(scope) {
    const rootEl = scope || document;
    const els = rootEl.querySelectorAll('[data-i18n]');
    for (let i = 0; i < els.length; i++) {
      const v = tr(els[i].getAttribute('data-i18n'));
      if (v) els[i].textContent = v;
    }
  }

  const RULES_DOC = [
    ['الهدف', 'انقل أحجارك الخمسة عشر حول الرقعة إلى بيتك ثم أخرِجها كلها قبل خصمك.'],
    ['الافتتاح', 'كل لاعب يرمي نردًا واحدًا؛ الأعلى يبدأ ويلعب برقمي النردَين معًا — والتعادل يُعاد.'],
    ['الحركة', 'كل نرد حركة مستقلة (الدبل = 4 حركات). لا هبوط على نقطة فيها حجاران للخصم — والحجر المفرد يُضرب إلى الأدمن (الحاجز).'],
    ['الأدمن', 'لا حركة قبل إدخال كل أحجار الأدمن — الدخول بنقطة 24−نرد (لك) أو نرد−1 (لخصمك)، وإن كانت النقطة مغلقة يضيع الدور.'],
    ['الإخراج', 'لا يبدأ إلا بوجود كل الأحجار في البيت: بالرقم المطابق لمسافة الحجر، أو برقم أكبر إن لم توجد أحجار أبعد — ولا إلزام بالإخراج إن أمكن التحريك.'],
    ['النرد الإجباري', 'يجب استخدام أكبر عدد ممكن من النردات؛ وإن أمكن استخدام نرد واحدة فقط وجب استخدام الأكبر؛ وبلا أي حركة يُمرَّر الدور.'],
    ['الحسم', 'فوز عادي ×1 — مارس (خصمك لم يُخرج شيئًا) ×2 — باك جامون (وكائن في بيتك أو على الأدمن) ×3.'],
    ['المباراة', 'أول من يجمع طول المباراة (1 / 3 / 5 نقاط) يفوز — بلا مكعب مضاعفة في هذه النسخة.'],
    ['الرهان', 'في نمط ضد الحاسوب: يُخصم الرهان عند البدء ويتضاعف حسب المستوى عند فوز المباراة (×1.5 / ×2 / ×3).']
  ];

  root.BWG_T = tr;
  root.BWG_FMT = fmt;
  root.BWG_LANG_INDEX = langIndex;
  root.BWG_RULES_DOC = RULES_DOC;
  root.BGTranslateStatic = translateStatic;
})(typeof self !== 'undefined' ? self : this);
