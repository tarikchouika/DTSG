/* ════════════════════════════════════════════════════════════════════
   أونو — قاموس 4 لغات (عربية · فرنسية · إنجليزية · دارجة)
   الأولوية: قاموس المنصة الرسمي TR ثم القاموس الداخلي UN.
   البادئة un. متعمدة (بلا تصادم) — تُدمج في js/i18n/translations.js.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* [عربية، فرنسية، إنجليزية، دارجة] */
  const UN = {
    'un.title': ['أونو', 'Uno', 'Uno', 'أونو'],
    'un.tagline': ['اللون والرقم — والبراغي يغيّر كل شيء', 'Couleur et chiffre — la jolly change tout', 'Color and number — the wild changes it all', 'اللون والرقم — والبراغي يبدّل كلشي'],
    'un.modeLabel': ['نمط اللعب', 'Mode de jeu', 'Game mode', 'نمط اللعب'],
    'un.mode.1v1': ['1 ضد 1', '1 vs 1', '1 vs 1', '1 ضد 1'],
    'un.mode.1v2': ['1 ضد 2', '1 vs 2', '1 vs 2', '1 ضد 2'],
    'un.mode.1v3': ['1 ضد 3 (فردي)', '1 vs 3 (Solo)', '1 vs 3 (FFA)', '1 ضد 3 (فردي)'],
    'un.mode.2v2': ['2 ضد 2 (فرق)', '2 vs 2 (Équipes)', '2 vs 2 (Teams)', '2 ضد 2 (فراقي)'],
    'un.level.0': ['مبتدئ', 'D\u00e9butant', 'Beginner', 'مبتدئ'],
    'un.level.1': ['متوسط', 'Moyen', 'Medium', 'وسط'],
    'un.level.2': ['خبير', 'Expert', 'Expert', 'خبير'],
    'un.target': ['نقاط المباراة', 'Points de la partie', 'Match target', 'نقاط الماتش'],
    'un.start': ['ابدأ المباراة', 'Lancer la partie', 'Start match', 'ابدا الماتش'],
    'un.us': ['فريقنا', 'Notre \u00e9quipe', 'Our team', 'فريقنا'],
    'un.them': ['الخصم', 'L\u2019adversaire', 'Their team', 'الخصم'],
    'un.round': ['الدور {r}', 'Manche {r}', 'Round {r}', 'الجولة {r}'],
    'un.turn': ['دورك — العب بطاقة', 'Votre tour \u2014 jouez une carte', 'Your turn \u2014 play a card', 'دورك — لعب بطاقة'],
    'un.thinking': ['يفكّر…', 'R\u00e9flexion\u2026', 'Thinking\u2026', 'كيفّف…'],
    'un.colorPicker': ['اختر اللون', 'Choisissez la couleur', 'Pick a color', 'ختار اللون'],
    'un.color.R': ['أحمر', 'Rouge', 'Red', 'أحمر'],
    'un.color.B': ['أزرق', 'Bleu', 'Blue', 'أزرق'],
    'un.color.G': ['أخضر', 'Vert', 'Green', 'أخضر'],
    'un.color.Y': ['أصفر', 'Jaune', 'Yellow', 'أصفر'],
    'un.color.K': ['براغي', 'Jolly', 'Wild', 'براغي'],
    'un.uno': ['UNO!', 'UNO !', 'UNO!', 'أونو!'],
    'un.unoHint': ['قلها قبل ما تخلص بطاقتك الثانية!', 'Dites-le avant de jouer la derni\u00e8re !', 'Call it before your last card!', 'قولها قبل ما تلعب آخر بطاقة!'],
    'un.unoCalled': ['UNO!', 'UNO !', 'UNO!', 'أونو!'],
    'un.unoPenalty': ['نسي UNO — اسحب 2!', 'Oubli de UNO \u2014 tirez 2 !', 'Forgot UNO \u2014 draw 2!', 'نسى أونو — سيب 2!'],
    'un.skip': ['تخطي!', 'Pass\u00e9 !', 'Skip!', 'تخطي!'],
    'un.reverse': ['انعكاس!', 'Invers\u00e9 !', 'Reversed!', 'انعكاس!'],
    'un.draw2': ['اسحب 2!', 'Tirez 2 !', 'Draw 2!', 'سيب 2!'],
    'un.draw4': ['اسحب 4!', 'Tirez 4 !', 'Draw 4!', 'سيب 4!'],
    'un.drawnPlayable': ['البطاقة المرسومة قابلة للعب — العبها أو تخطَّ', 'La carte tir\u00e9e est jouable \u2014 jouez ou passez', 'Drawn card is playable \u2014 play or pass', 'السيبة قابلة للعب — لعب ولا تخطي'],
    'un.pass': ['تخطي', 'Passez', 'Pass', 'تخطي'],
    'un.roundEnd': ['نهاية الدور', 'Fin de la manche', 'Round over', 'نهاية الجولة'],
    'un.roundWon': ['فاز {name}! +{v} نقطة', '{name} gagne ! +{v} pts', '{name} wins! +{v} pts', '{name} ربحت! +{v} نقطة'],
    'un.continue': ['الدور التالي', 'Manche suivante', 'Next round', 'الجولة الجاية'],
    'un.nextRound': ['الدور التالي', 'Manche suivante', 'Next round', 'الجولة الجاية'],
    'un.voteNext': ['الموافقة على الدور التالي', 'Valider la manche', 'Approve next round', 'وافقة على الجولة الجاية'],
    'un.waitPlayers': ['بانتظار اللاعبين…', 'En attente des joueurs\u2026', 'Waiting for players\u2026', 'خناص على اللاعبين…'],
    'un.scores': ['النقاط', 'Scores', 'Scores', 'النقاط'],
    'un.you': ['أنت', 'Vous', 'You', 'نت'],
    'un.hand': ['اليد', 'Main', 'Hand', 'اليد'],
    'un.matchOver': ['انتهت المباراة', 'Partie termin\u00e9e', 'Match over', 'انتهى الماتش'],
    'un.matchWin': ['فزت بالمباراة!', 'Victoire !', 'You win the match!', 'ربحت الماتش!'],
    'un.matchLose': ['خسرت المباراة', 'D\u00e9faite', 'You lose the match', 'خسرت الماتش'],
    'un.wonBy': ['الفائز: {name}', 'Victoire : {name}', 'Winner: {name}', 'الرابح: {name}'],
    'un.newMatch': ['مباراة جديدة', 'Nouvelle partie', 'New match', 'ماتش جديد'],
    'un.backMenu': ['القائمة', 'Menu', 'Menu', 'القائمة'],
    'un.handoverTap': ['المس للمتابعة', 'Touchez pour continuer', 'Tap to continue', 'مس للكملة'],
    'un.handoverTitle': ['سلم الجهاز إلى {name}', 'Passez l\u2019appareil \u00e0 {name}', 'Pass device to {name}', 'سلّي الجهاز على {name}'],
    'un.local.0': ['اللاعب 1', 'Joueur 1', 'Player 1', 'لاعب 1'],
    'un.local.1': ['اللاعب 2', 'Joueur 2', 'Player 2', 'لاعب 2'],
    'un.local.2': ['اللاعب 3', 'Joueur 3', 'Player 3', 'لاعب 3'],
    'un.local.3': ['اللاعب 4', 'Joueur 4', 'Player 4', 'لاعب 4'],
    'un.deck': ['الطاقم', 'Paquet', 'Deck', 'الطاقم'],
    'un.deckCount': ['{n} بطاقة', '{n} cartes', '{n} cards', '{n} بطاقة'],
    'un.direction': ['الاتجاه', 'Sens', 'Direction', 'الاتجاه'],
    'un.gameColor': ['لون اللعبة', 'Couleur du jeu', 'Game color', 'لون اللعبة'],
    'un.room.title': ['غرفة أونلاين', 'Ghrafya online', 'Salle en ligne', 'Online room'],
    'un.room.players': ['اللاعبون', 'L7itab', 'Joueurs', 'Players'],
    'un.room.bet': ['الرهان', 'Rmise', 'Mise', 'الرهان'],
    'un.room.waitStart': ['بانتظار بدء المضيف للجولة…', 'Khnas 3la li mzyed l3a joula\u2026', 'En attente de l\u2019h\u00f4te\u2026', 'Waiting for the host\u2026'],
    'un.room.waitStartHost': ['أنت المضيف — ابدأ المباراة من مودال الغرفة', 'Nti l mzyed \u2014 bda l7oba mn modal l ghrafya', 'Vous \u00eates l\u2019h\u00f4te \u2014 lancez depuis la salle', 'You are the host \u2014 start from the room panel'],
    'un.room.backGame': ['العودة للعبة', 'Rj3 3la l7oba', 'Retour au jeu', 'Back to game'],
    'un.room.open': ['مودال الغرفة', 'Modal l ghrafya', 'Fen\u00eatre de salle', 'Room panel'],
    'un.room.rematchQ': ['مباراة جديدة؟', 'Match jdid?', 'Nouvelle partie ?', 'New match?'],
    'un.room.rematchYes': ['موافقة', 'M3ada', 'Accord', 'Agree'],
    'un.room.rematchNo': ['رفض', 'Rfod', 'Refus', 'Refuse'],
    'un.room.voted': ['تم تسجيل صوتك — بانتظار البقية', 'Tsujsawtek \u2014 khnas 3la lbaqi', 'Vote enregistr\u00e9 \u2014 en attente du reste', 'Vote recorded \u2014 waiting for others'],
    'un.room.waitVotes': ['بانتظار تصويت اللاعبين…', 'Khnas 3la tsawit l7itab\u2026', 'En attente des votes\u2026', 'Waiting for votes\u2026'],
    'un.room.restarting': ['تبدأ مباراة جديدة…', 'Katabda match jdid\u2026', 'Nouvelle partie en cours\u2026', 'New match starting\u2026'],
    'un.room.noRematch': ['لا موافقة كافية على مباراة جديدة', 'Ma kayach m3ada kafiya 3la match jdid', 'Pas assez d\u2019accords pour rejouer', 'Not enough votes for a rematch'],
    'un.room.newMatch': ['مباراة جديدة', 'Match jdid', 'Nouvelle partie', 'New match'],
    'un.room.ended': ['انتهت جلسة الغرفة', 'T3mnt jlasa l ghrafya', 'La session de salle est termin\u00e9e', 'Room session ended'],
    'un.room.needFour': ['يبدأ اللعب بأربعة لاعبين', 'Khas 4 l7itab bach tbda', '4 joueurs sont n\u00e9cessaires pour commencer', '4 players are needed to start'],
    'un.educational': ['لعب تعليمي — بلا رهان', 'Jeu \u00e9ducatif \u2014 sans mise', 'Educational play \u2014 no bet', 'لعب تعليمي — بلا رهان'],
    'un.settingsTitle': ['إعدادات الطاولة', 'R\u00e8gles de la table', 'Table rules', 'إعدادات الطاولة'],
    'un.wild4': ['براغي +4', 'Jolly +4', 'Wild +4', 'براغي +4'],
    'un.wild': ['براغي', 'Jolly', 'Wild', 'براغي'],
    'un.skipCard': ['تخطي', 'Passage', 'Skip', 'تخطي'],
    'un.reverseCard': ['انعكاس', 'Inversion', 'Reverse', 'انعكاس'],
    'un.draw2Card': ['اسحب 2', 'Tirez 2', 'Draw 2', 'سيب 2'],
    'un.rulesHint': ['طابق اللون أو الرقم — البراغي تلعب بأي وقت وتختار اللون', 'Match couleur ou chiffre \u2014 le jolly joue toujours', 'Match color or number \u2014 wilds play anytime', 'طابق اللون ولا الرقم — والبراغي تلعب بواقت']
  };

  const LANGS = ['ar', 'fr', 'en', 'da'];

  function T(key, params) {
    let s = null;
    if (typeof root.T === 'function') {
      try { s = root.T(key, params); } catch (e) {}
      if (!s) s = null;
    }
    if (!s && root.TR && root.TR[key]) {
      const idx = (typeof root.langIndex === 'function') ? root.langIndex() : 0;
      s = root.TR[key][idx] != null ? root.TR[key][idx] : root.TR[key][0];
    }
    if (!s && UN[key]) {
      const li = (typeof root.UN_LANG_INDEX === 'function') ? root.UN_LANG_INDEX() : (typeof root.langIndex === 'function' ? root.langIndex() : 0);
      s = UN[key][li] != null ? UN[key][li] : UN[key][0];
    }
    if (!s) s = key;
    if (params) {
      for (const k in params) s = s.replace('{' + k + '}', params[k]);
    }
    return s;
  }

  function langIndex() {
    if (typeof root.langIndex === 'function') {
      try { return root.langIndex(); } catch (e) {}
    }
    return 0;
  }

  root.UN = UN;
  root.UN_LANGS = LANGS;
  root.UN_T = T;
  root.UN_LANG_INDEX = langIndex;

  /* ترجمة عناصر ثابتة (data-un-i18n) عند بناء المسرح */
  root.UNTranslateStatic = function (rootEl) {
    if (!rootEl) return;
    const els = rootEl.querySelectorAll('[data-un-i18n]');
    for (let i = 0; i < els.length; i++) {
      els[i].textContent = T(els[i].getAttribute('data-un-i18n'));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
