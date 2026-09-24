/* ════════════════════════════════════════════════════════════════════
   البلوت — قاموس 4 لغات (عربية · فرنسية · إنجليزية · دارجة) + وثيقة القواعد
   الأولوية: قاموس المنصة الرسمي TR ثم القاموس الداخلي BLT.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* [عربية، فرنسية، إنجليزية، دارجة] */
  const BLT = {
    'blt.title': ['بلوت', 'Baloot', 'Baloot', 'بلوت'],
    'blt.tagline': ['أصالة الورق الخليجي — هوكم، صن، وأشور', 'L\u2019authentique jeu de cartes du Golfe — Hokm, Sun & Ashour', 'The Gulf card classic — Hokm, Sun & Ashour', 'عزيزة الورق الخليجية — هوكم وصن واشور'],
    'blt.mode.ai': ['ضد البوت', 'Contre l\u2019IA', 'vs AI', 'ضد البوت'],
    'blt.mode.local': ['4 لاعبين (محلي)', '4 joueurs (local)', '4 players (hot-seat)', '4 لاعيب (محلي)'],
    'blt.level.0': ['مبتدئ', 'D\u00e9butant', 'Beginner', 'مبتدئ'],
    'blt.level.1': ['متوسط', 'Moyen', 'Medium', 'وسط'],
    'blt.level.2': ['خبير', 'Expert', 'Expert', 'خبير'],
    'blt.target': ['نقاط المباراة', 'Points de la partie', 'Match target', 'نقاط الماتش'],
    'blt.start': ['ابدأ المباراة', 'Lancer la partie', 'Start match', 'ابدا الماتش'],
    'blt.settingsTitle': ['إعدادات الطاولة', 'R\u00e8gles de la table', 'Table rules', 'إعدادات الطاولة'],
    'blt.firstLead': ['أول طرح', 'Premi\u00e8re carte', 'First lead', 'أول طرح'],
    'blt.firstLead.left': ['يسار الموزع', 'Gauche du donneur', 'Left of dealer', 'يسار الموزع'],
    'blt.firstLead.namer': ['من قام بالتسمية', 'Le d\u00e9clarant', 'The namer', 'من سمّى'],
    'blt.mustBeat': ['التغطية إلزامية', 'Couverture obligatoire', 'Must beat trump', 'التغطية إلزامية'],
    'blt.mustBeatHint': ['عند طرح هوكم: يلزم تغطيته إن أمكن', 'Si le coup est jou\u00e9 : il faut le couvrir si possible', 'When trump is led: must beat it if possible', 'ما طرح هوكم: يلزم تغطيته'],
    'blt.kabotBonus': ['مكافأة الكابوت', 'Bonus kabot', 'Kabot bonus', 'مكافأة الكابوت'],
    'blt.yourTurn': ['دورك — العب ورقة', '\u00c0 vous — jouez une carte', 'Your turn — play a card', 'دورك — لعب ورقة'],
    'blt.thinking': ['يفكّر…', 'R\u00e9flexion\u2026', 'Thinking\u2026', 'كيفّف…'],
    'blt.suit.S': ['بستوني', 'Pique', 'Spades', 'بستوني'],
    'blt.suit.H': ['كوبة', 'C\u0153ur', 'Hearts', 'كوبة'],
    'blt.suit.D': ['دينار', 'Carreau', 'Diamonds', 'دينار'],
    'blt.suit.C': ['سباتي', 'Tr\u00e8fle', 'Clubs', 'سباتي'],
    'blt.trump': ['هوكم', 'Coup', 'Trump', 'هوكم'],
    'blt.sun': ['صن (بلا هوكم)', 'Sun (sans coup)', 'Sun (no trump)', 'صن (بلا هوكم)'],
    'blt.pass': ['بَس', 'Passe', 'Pass', 'بس'],
    'blt.naming': ['التسمية', 'La mise', 'Naming', 'التسمية'],
    'blt.namingQ': ['اختر: هوكم صن؟ أم بَس؟', 'Choisissez : un coup, le Sun\u2026 ou passe ?', 'Choose a trump suit, Sun\u2026 or pass?', 'اختار: هوكم صن؟ ولا بس؟'],
    'blt.ashur': ['إعلان الأشور', 'D\u00e9clarer l\u2019ashour', 'Declare Ashour', 'اعلان اشور'],
    'blt.ashurQ': ['لديك تشكيلة — تعلنها؟', 'Vous avez une combinaison — la d\u00e9clarez ?', 'You hold a combo — declare it?', 'عندك تشكيل — تسوّبه؟'],
    'blt.ashurNone': ['بدون إعلان', 'Aucune', 'None', 'بلا اعلان'],
    'blt.ashur.serial': ['سلاسل {len} — {v}ن', 'S\u00e9rie de {len} — {v}pts', 'Run of {len} — {v}pts', 'تتابع {len} — {v}ن'],
    'blt.ashur.quad': ['رباعية {r} — {v}ن', 'Quatre {r} — {v}pts', 'Four {r} — {v}pts', 'رباعية {r} — {v}ن'],
    'blt.ashur.serialName': ['سرا', 'S\u00e9ra', 'Run of 3', 'سرا'],
    'blt.ashur.serial4Name': ['خمسين', 'Khamsin', 'Run of 4', 'خمسين'],
    'blt.ashur.serial5Name': ['مية', 'Mia', 'Run of 5+', 'مية'],
    'blt.baloot': ['بَلوت! K+Q من هوكم', 'BALOOT ! R+D du coup', 'BALOOT! K+Q of trump', 'بلوت! K+Q من هوكم'],
    'blt.dealer': ['الموزع', 'Donneur', 'Dealer', 'الموزع'],
    'blt.redDeal': ['الكل بَس — إعادة توزيع', 'Tous passent — nouveau don', 'All passed — redeal', 'كلهم بس — توزيع جديد'],
    'blt.named': ['{name} يسمّي {trump}', '{name} d\u00e9clare {trump}', '{name} names {trump}', '{name} سمّى {trump}'],
    'blt.namedSun': ['{name} يسمّي صن', '{name} d\u00e9clare Sun', '{name} declares Sun', '{name} سمّى صن'],
    'blt.passed': ['{name}: بَس', '{name} : passe', '{name} passes', '{name}: بس'],
    'blt.declared': ['{name} يعلن: {combo}', '{name} d\u00e9clare : {combo}', '{name} declares: {combo}', '{name} سوّب: {combo}'],
    'blt.lastTrick': ['اليد', 'La main', 'Last trick', 'اليد'],
    'blt.kabot': ['كابوت!', 'KABOT !', 'KABOT!', 'كابوت!'],
    'blt.round': ['الدور', 'Manche', 'Round', 'الدور'],
    'blt.targetLabel': ['الهدف', 'Objectif', 'Target', 'الهدف'],
    'blt.us': ['لنا', 'Nous', 'Us', 'لينا'],
    'blt.them': ['الخصم', 'Eux', 'Them', 'الخصم'],
    'blt.name.0': ['أنت', 'Vous', 'You', 'نتا'],
    'blt.name.1': ['فيصل', 'Faisal', 'Faisal', 'فيصل'],
    'blt.name.2': ['عمران', 'Imran', 'Imran', 'عمران'],
    'blt.name.3': ['ضغام', 'Dgham', 'Dgham', 'ضغام'],
    'blt.local.0': ['اللاعب 1', 'Joueur 1', 'Player 1', 'اللاعيبة 1'],
    'blt.local.1': ['اللاعب 2', 'Joueur 2', 'Player 2', 'اللاعيبة 2'],
    'blt.local.2': ['اللاعب 3', 'Joueur 3', 'Player 3', 'اللاعيبة 3'],
    'blt.local.3': ['اللاعب 4', 'Joueur 4', 'Player 4', 'اللاعيبة 4'],
    'blt.partner': ['شريك', 'Partenaire', 'Partner', 'شريك'],
    'blt.cards': ['أوراق', 'Cartes', 'Cards', 'كاارت'],
    'blt.roundEnd': ['نتيجة الدور', 'Fin de manche', 'Round result', 'نتيجة الدور'],
    'blt.cardPts': ['نقاط الأوراق', 'Points des cartes', 'Card points', 'نقاط الكاارت'],
    'blt.tricks': ['الأكلات', 'Prises', 'Tricks', 'الأكلات'],
    'blt.ashurPts': ['الأشور', 'Ashour', 'Ashour', 'اشور'],
    'blt.balootPts': ['بلوت', 'Baloot', 'Baloot', 'بلوت'],
    'blt.lastTrickPts': ['اليد +10', 'Main +10', 'Last trick +10', 'اليد +10'],
    'blt.kabotPts': ['كابوت +{n}', 'Kabot +{n}', 'Kabot +{n}', 'كابوت +{n}'],
    'blt.cut': ['مقطوع (الأعلى يقطع)', 'Coupe (le plus haut gagne)', 'Cut (highest wins)', 'مقطوع'],
    'blt.total': ['مجموع الدور', 'Total de la manche', 'Round total', 'مجموع الدور'],
    'blt.teamScore': ['مجموع المباراة', 'Score de la partie', 'Match score', 'مجموع الماتش'],
    'blt.continue': ['الدور التالي', 'Manche suivante', 'Next round', 'الدور اللي جاي'],
    'blt.matchWin': ['فزت بالمباراة!', 'Vous avez gagn\u00e9 la partie !', 'You won the match!', 'ربحت الماتش!'],
    'blt.matchLose': ['خسرت المباراة', 'Vous avez perdu la partie', 'You lost the match', 'خسرت الماتش'],
    'blt.matchOver': ['انتهت المباراة', 'Partie termin\u00e9e', 'Match over', 'سالي الماتش'],
    'blt.wonBy': ['فاز: {name}', 'Victoire : {name}', 'Winner: {name}', 'ربح: {name}'],
    'blt.newMatch': ['مباراة جديدة', 'Nouvelle partie', 'New match', 'ماتش جديد'],
    'blt.backMenu': ['القائمة الرئيسية', 'Menu principal', 'Main menu', 'القائمة'],
    'blt.settings': ['الإعدادات', 'Param\u00e8tres', 'Settings', 'الإعدادات'],
    'blt.handover': ['سلّم الجهاز إلى {name}', 'Passez l\u2019appareil \u00e0 {name}', 'Pass the device to {name}', 'سلّم الجهاز لـ {name}'],
    'blt.handoverTap': ['انقر لإظهار الأوراق', 'Touchez pour r\u00e9v\u00e9ler les cartes', 'Tap to reveal hand', 'نقر باش تبان الكاارت'],
    'blt.wrongCard': ['الزم اللون!', 'Jouez la m\u00eame couleur !', 'Follow suit!', 'زم اللون!'],
    'blt.mustTrump': ['اضرب هوكم!', 'Jouez le coup !', 'Must trump!', 'ضرّب هوكم!'],
    'blt.roundOf': ['الدور {r}', 'Manche {r}', 'Round {r}', 'الدور {r}'],
    'blt.trumpOf': ['هوكم: {t}', 'Coup : {t}', 'Trump: {t}', 'هوكم: {t}'],
    'blt.sunGame': ['دور صن', 'Manche Sun', 'Sun round', 'دور صن'],
    'blt.modeDesc.ai': ["تعليمي ضد 3 أدمغة اصطناعية — بلا رهان", "Tbdiri m3a 3 IA — bla mise", "Éducatif contre 3 IA — sans mise", "Educational vs 3 AI — no bet"],
    'blt.modeDesc.local': ['أربعة لاعبين يتناوبون على نفس الجهاز', 'Quatre joueurs sur le m\u00eame appareil', 'Four players sharing one device', 'ربعات لاعيب يتقاسمو نفس الجهاز'],
    'blt.vsBot': ['البوت', 'IA', 'Bot', 'البوت'],
    'blt.educational': ["تعليمي — بلا رهان ولا تذاكر", "Tbdiri — bla mise wla tiquet", "Éducatif — sans mise ni ticket", "Educational — no bet, no ticket"],
    'blt.spectator': ["متفرج", "Khati", "Spectateur", "Spectator"],
    'blt.nextRound': ["الجولة التالية", "Joula li mbach", "Manche suivante", "Next round"],
    'blt.voteNext': ["الجولة التالية (صوّت)", "Joula li mbach (wadd sawtek)", "Manche suivante (votez)", "Next round (vote)"],
    'blt.waitPlayers': ["بانتظار اللاعبين…", "Khnas 3la l7itab…", "En attente des joueurs…", "Waiting for players…"],
    'blt.room.title': ["غرفة أونلاين", "Ghrafya online", "Salle en ligne", "Online room"],
    'blt.room.players': ["اللاعبون", "L7itab", "Joueurs", "Players"],
    'blt.room.bet': ["الرهان", "Rmise", "Mise", "Bet"],
    'blt.room.waitStart': ["بانتظار بدء الموزع للجولة…", "Khnas 3la li mzyed l3a joula…", "En attente du donneur…", "Waiting for the host to start…"],
    'blt.room.waitStartHost': ["أنت الموزع — ابدأ المباراة من مودال الغرفة", "Nti l mzyed — bda l7oba mn modal l ghrafya", "Vous êtes le donneur — lancez depuis la salle", "You are the host — start from the room panel"],
    'blt.room.backGame': ["العودة للعبة", "Rj3 3la l7oba", "Retour au jeu", "Back to game"],
    'blt.room.open': ["مودال الغرفة", "Modal l ghrafya", "Fenêtre de salle", "Room panel"],
    'blt.room.rematchQ': ["مباراة جديدة؟", "Match jdid?", "Nouvelle partie ?", "New match?"],
    'blt.room.rematchYes': ["موافقة", "M3ada", "Accord", "Agree"],
    'blt.room.rematchNo': ["رفض", "Rfod", "Refus", "Refuse"],
    'blt.room.voted': ["تم تسجيل صوتك — بانتظار البقية", "Tsujsawtek — khnas 3la lbaqi", "Vote enregistré — en attente du reste", "Vote recorded — waiting for others"],
    'blt.room.waitVotes': ["بانتظار تصويت اللاعبين…", "Khnas 3la tsawit l7itab…", "En attente des votes…", "Waiting for votes…"],
    'blt.room.restarting': ["تبدأ مباراة جديدة…", "Katabda match jdid…", "Nouvelle partie en cours…", "New match starting…"],
    'blt.room.noRematch': ["لا موافقة كافية على مباراة جديدة", "Ma kayach m3ada kafiya 3la match jdid", "Pas assez d’accords pour rejouer", "Not enough votes for a rematch"],
    'blt.room.newMatch': ["مباراة جديدة", "Match jdid", "Nouvelle partie", "New match"],
    'blt.room.ended': ["انتهت جلسة الغرفة", "T3mnt jlasa l ghrafya", "La session de salle est terminée", "Room session ended"],
    'blt.room.needFour': ["يبدأ اللعب بأربعة لاعبين", "Khas 4 l7itab bach tbda", "4 joueurs sont nécessaires pour commencer", "4 players are needed to start"],
  };

  /* ── ترقيم ── */
  function blLangIndex() {
    try { if (typeof root.langIndex === 'function') return root.langIndex(); } catch (e) {}
    const l = (root.navigator && root.navigator.language || 'ar').toLowerCase();
    if (l.indexOf('fr') === 0) return 1;
    if (l.indexOf('en') === 0) return 2;
    return 0; // العربية (والدارجة)
  }

  function tr(key, vars) {
    let row = null;
    try { if (root.TR && root.TR[key]) row = root.TR[key]; } catch (e) {}
    if (!row && BLT[key]) row = BLT[key];
    if (!row) return key;
    let s = row[blLangIndex()] || row[0] || key;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }

  function fmtNum(n) {
    try { return Number(n).toLocaleString('en-US'); } catch (e) { return String(n); }
  }

  function translateStatic(el) {
    if (!el) return;
    const nodes = el.querySelectorAll('[data-bl-i18n]');
    for (let i = 0; i < nodes.length; i++) {
      const key = nodes[i].getAttribute('data-bl-i18n');
      const t = tr(key);
      if (t) nodes[i].textContent = t;
    }
  }

  /* ═══════════ وثيقة القواعد الكاملة ═══════════ */
  const RULES_DOC = {
    ar: [
      ['اللعبة', 'البلوت لعبة ورق لـ 4 لاعبين على فريقين (متقابلان). تُلعب بـ 32 ورقة: من 7 إلى الآس في كل نوع. الهدف: الوصول أولاً إلى نقاط المباراة (51/100/152/200).'],
      ['التوزيع', 'الموزع يوزع 8 أوراق لكل لاعب (بنظام 3-2-3) ويبدأ من يساره. دور التوزيع ينتقل يميناً بعد كل دور.'],
      ['الأشور', 'بعد التوزيع، كل لاعب يمكنه إعلان تشكيلة: سرا (3 متتالية من نوع واحد) 20ن · خمسين (4 متتالية) 50ن · مية (5+) 100ن · رباعية: 4 وجوهر 200ن، 4 تسعات 150ن، 4 (آس/عشرة/ملك/بنت) 100ن. بلوت (ملك وبنت هوكم معاً) 20ن يُعلن عند لحظة اللعب ولا يُقطع.'],
      ['قطع الأشور', 'إذا أعلن الفريقان أشوراً: يُحتسب أشور الفريق الأعلى قيمة فقط، ويُلغى أشور الفريق الآخر.'],
      ['التسمية', 'يبدأ يسار الموزع: إما يسمّي نوعاً هوكم (بستوني/كوبة/دينار/سباتي)، أو يسمّي صن (بلا هوكم)، أو يقول «بَس». إن قال الجميع بَس أُعيد التوزيع من اللاعب التالي.'],
      ['هوكم وصن', 'في هوكم: أوراق النوع المُعلن أقوى وترتيبها: وجوهر > 9 > آس > 10 > ملك > بنت > 8 > 7. نقاط هوكم: وجوهر 20، التسعة 14، الآس 11، العشرة 10، الملك 4، البنت 3. في صن: ترتيب موحد (آس > 10 > ملك > بنت > وجوهر > 9 > 8 > 7) ونقاط: آس 11، عشرة 10، ملك 4، بنت 3، وجوهر 2.'],
      ['سير الأكلة', 'يُطرح نوع، ويجب على كل لاعب التزامه إن توفر لديه. من لا يملكه يضرب هوكم (إلزامي)، ومن لا يملك هوكم يلعب أي ورقة. أعلى ورقة في النوع المطروح (أو أعلى هوكم إن ضُرب) يفوز بالأكلة ويبدأ الأكلة التالية.'],
      ['اليد', 'آخر أكلة في الدور (الثامنة) تمنح فريقها 10 نقاط إضافية.'],
      ['حساب الدور', 'كل فريق يأخذ مجموع نقاط الأوراق التي كسبها + اليد + أشوره (إن لم يُقطع) + بلوت.'],
      ['الكابوت', 'إذا كسح فريق الأكلات الثماني كاملة: يأخذ كل نقاط الدور (بما فيها أشور الخصم) + مكافأة كابوت المتفق عليها (0/10/30/50).'],
      ['الفوز', 'الفريق الذي يبلغ نقاط المباراة أولاً في نهاية دور مكتمل يفوز.']
    ],
    fr: [
      ['Jeu', 'Baloot : jeu de cartes \u00e0 4 joueurs en deux \u00e9quipes (assis en face \u00e0 face). 32 cartes : du 7 \u00e0 l\u2019as. Objectif : atteindre en premier le score de la partie (51/100/152/200).'],
      ['Distribution', 'Le donneur distribue 8 cartes \u00e0 chacun (syst\u00e8me 3-2-3), \u00e0 sa gauche d\u2019abord. Le don passe \u00e0 droite apr\u00e8s chaque manche.'],
      ['Ashour', 'Apr\u00e8s le don, chaque joueur peut d\u00e9clarer une combinaison : S\u00e9ra (3 cartes suivies m\u00eame couleur) 20 \u00b7 Khamsin (4) 50 \u00b7 Mia (5+) 100 \u00b7 Quatre : 4 valets 200, 4 neufs 150, 4 (as/10/rois/dames) 100. Baloot (R+D du coup) 20, d\u00e9clar\u00e9 au moment du jeu, jamais coup\u00e9.'],
      ['Coupure', 'Si les deux \u00e9quipes d\u00e9clarent : seul l\u2019ashour le plus élevé est compt\u00e9, l\u2019autre est annul\u00e9.'],
      ['Mise', 'La gauche du donneur commence : nommer une couleur comme coup, nommer Sun (sans coup), ou passer (\u00ab passe \u00bb). Tous en passe \u2192 nouveau don par le joueur suivant.'],
      ['Coup & Sun', 'Coup : la couleur nomm\u00e9e est la plus forte \u2014 V > 9 > A > 10 > R > D > 8 > 7. Points du coup : V 20, 9 14, A 11, 10 10, R 4, D 3. Sun : ordre uniforme (A > 10 > R > D > V > 9 > 8 > 7) ; A 11, 10 10, R 4, D 3, V 2.'],
      ['Prise', 'La couleur jou\u00e9e doit \u00eatre suivie. Sans elle : obligatoire de couper. Sans coup : n\u00e9ant. La plus haute carte de la couleur jou\u00e9e (ou du coup) remporte la prise et m\u00e8ne la suivante.'],
      ['Main', 'La derni\u00e8re prise de la manche donne +10 \u00e0 son \u00e9quipe.'],
      ['Score', 'Chaque \u00e9quipe marque : points des cartes prises + main + ashour (si non coup\u00e9) + baloot.'],
      ['Kabot', 'Si une \u00e9quipe prend les 8 prises : elle encaisse tous les points de la manche (ashours compris) + bonus kabot (0/10/30/50).'],
      ['Victoire', 'L\u2019\u00e9quipe qui atteint en premier le score de la partie en fin de manche remporte.']
    ],
    en: [
      ['Game', 'Baloot is a 4-player card game in two teams (sitting opposite). 32 cards: 7 to Ace in each suit. Goal: reach the match score first (51/100/152/200).'],
      ['Dealing', 'The dealer deals 8 cards to each player (3-2-3 system), starting to their left. Dealing passes to the right after each round.'],
      ['Ashour', 'After dealing, each player may declare a combo: Sera (3 same-suit consecutive) 20 \u00b7 Khamsin (4) 50 \u00b7 Miya (5+) 100 \u00b7 Four-of-a-kind: 4 Jacks 200, 4 Nines 150, 4 (A/10/K/Q) 100. Baloot (K+Q of trump) 20 is declared at the moment of play and is never cut.'],
      ['Cutting', 'If both teams declare: only the higher-value ashour counts; the other is cancelled.'],
      ['Naming', 'Left of dealer starts: name a suit as trump, name Sun (no trump), or say \u201cpass\u201d. Everyone passes \u2192 redeal by the next player.'],
      ['Trump & Sun', 'Trump: the named suit ranks J > 9 > A > 10 > K > Q > 8 > 7. Trump points: J 20, 9 14, A 11, 10 10, K 4, Q 3. Sun: uniform order (A > 10 > K > Q > J > 9 > 8 > 7); A 11, 10 10, K 4, Q 3, J 2.'],
      ['Trick', 'The led suit must be followed. If you cannot, trumping is mandatory. With no trump either: discard anything. Highest card of the led suit (or of trump) wins the trick and leads the next.'],
      ['Hand', 'The last trick of the round gives its team +10 points.'],
      ['Scoring', 'Each team scores: card points captured + hand + ashour (if not cut) + baloot.'],
      ['Kabot', 'If a team takes all 8 tricks: it collects every point of the round (including the opponents\u2019 ashour) + the agreed kabot bonus (0/10/30/50).'],
      ['Winning', 'The team that reaches the match score first at the end of a completed round wins.']
    ],
    dj: [
      ['اللعب', 'البلوت لعب كاارت لـ 4 لاعيب فـ فريقين (واقفين وقاقيع). كاارت 32: من 7 لل\u00c9as. الهدف: توصل أول لفريقك لنقاط الماتش (51/100/152/200).'],
      ['التوزيع', 'الموزع كيزع 8 كاارت لكل لاعب (3-2-3)، يبدع من يسره. الموزع كيكون يمين بعد كل دور.'],
      ['اشور', 'بعد التوزيع، كل لاعب يقدر يسوّب تشكيل: سرا (3 متتابعة من نوع واحد) 20 · خمسين (4) 50 · مية (5+) 100 · رباعية: 4 وجوهر 200، 4 تسعات 150، 4 (\u00c9as/10/ملوك/بنت) 100. بلوت (ملك وبنت من هوكم) 20 كيسوّب فـ لحظة اللعب وما كيضربش.'],
      ['الضرب', 'إلا الفريقين سوّبو اشور: كيحسب اشور الفريق اللي أعلى قيمة، واللي خايس كيضرب.'],
      ['التسمية', 'يسار الموزع كيبدع: يسمّي نوع هوكم، ولا صن (بلا هوكم)، ولا كيقول «بس». إلا كلهم قالو بس: توزيع جديد من اللاعب اللي من بعدو.'],
      ['هوكم وصن', 'فـ هوكم: النوع اللي سمّوه أقوى والترتيب: وجوهر > 9 > \u00c9as > 10 > ملك > بنت > 8 > 7. نقاط هوكم: وجوهر 20، التسعة 14، \u00c9as 11، العشرة 10، الملك 4، البنت 3. فـ صن: ترتيب واحد (\u00c9as > 10 > ملك > بنت > وجوهر > 9 > 8 > 7).'],
      ['الأكلة', 'النوع اللي طُرح، كل لاعب لازم يزمه إلا عندو. إلا ما عندوش: ضروري يضرب هوكم. إلا ما عندو حتى هوكم: كيعربد كاارت. أعلى كاارت فـ النوع المطروح (ولا أعلى هوكم) كيربح الأكلة وكيبدع اللي من بعد.'],
      ['اليد', 'آخر أكلة فـ الدور (الثمنية) كتعطي فريقها 10 نقاط زيادة.'],
      ['الحساب', 'كل فريق كيجمع: نقاط الكاارت اللي أخذ + اليد + اشورو (إلا ما ضُرب) + البلوت.'],
      ['الكابوت', 'إلا فريق كيسخ 8 أكلات كاملين: كيخوذ كل نقاط الدور (حتى اشور الخصم) + مكافأة الكابوت (0/10/30/50).'],
      ['الفوز', 'الفريق اللي يوصل أول لنقاط الماتش فـ نهاية دور كامل، كييربح.']
    ]
  };

  root.BLT = BLT;
  root.BL_T = tr;
  root.BL_LANG_INDEX = blLangIndex;
  root.BL_FMT = fmtNum;
  root.BLTranslateStatic = translateStatic;
  root.BL_RULES_DOC = RULES_DOC;
})(typeof window !== 'undefined' ? window : globalThis);
