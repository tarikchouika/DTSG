/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Game Rules & Tutorial System
   ═══════════════════════════════════════════ */
"use strict";
/* ── قاعدة بيانات القواعد الكاملة ── */
var FULL_RULES = {
  /* ═══ البلوت (bl) — 4 لاعبين، فرق 2 ضد 2 ═══ */
  bl: {
    name: {
      ar: 'البلوت 🃏',
      da: 'Lbaloot 🃏',
      fr: 'Baloot 🃏',
      en: 'Baloot 🃏'
    },
    goal: {
      ar: 'فرقتان (كل لاعبين مقابِلَين فريق) تنافسان على بلوغ هدف النقاط (51/100/152) أولًا — النقاط من الأكلات وأوراقها وأشور المعلن عنها والبلوت والكابوت.',
      da: 'Frin (koul 32b m9abil f riq) khyam 3la l7itab li 7all l3a hadaf l n9at (51/100/152) — l n9at mn l7ikl w l7out w l7ichour w lbaloot w lkabot.',
      fr: 'Deux équipes (joeurs face à face) s’affrontent pour atteindre l’objectif (51/100/152) — points des plis, des cartes, des Ashour, du Baloot et du Cabot.',
      en: 'Two teams (opposite players) race to the target score (51/100/152) — points from tricks, card values, declared Ashour, Baloot and Cabot.'
    },
    steps: {
      ar: [
        'التوزيع: 32 ورقة تُوزَّع كاملة، 8 لكل لاعب؛ كل لاعبين مقابِلَين فريقان (أنت وشريكك مقابل الخصمين).',
        'مرحلة الأشور: من يملك 4 أوراق متصلة (مثل 7-8-9-10) أو رباعية (مثل 4×9) يُعلن أشوره قبل التسمية — نقاطه تُخزَّن له.',
        'التسمية: يبدأ يسار الموزع (أو المسمّي) بالتسمية: يرشّح هوكم (سيت) أو يمرّ؛ إن مرّ الجميع تكون يد صن (بلا هوكم).',
        'اللعب: 8 أكلات؛ صاحب الأكلة يبدأ التالية، ولازم تلوّي السيت المطروح إن كان عندك.',
        'كل أكلة = مجموع أوراقها + 10، تروح للفريق اللي أخذها.',
        'الفريق اللي يأخذ الـ8 أكلات كاملة: كابوت — يجيب بونص + أشور الخصم، وتنقلب نقاط أوراق الخصم لصالحه.',
        'تستمر الجولات حتى فريق يوصل الهدف — والفوز له.'
      ],
      da: [
        'Tawzib: 32 kotta kitawz3o kamlin, 8 lkoul 32b; koul 32b m9abil f 2 riq (nti w shrik m9ab l khsam).',
        'M7ilat l7ichour: may 3ndo 4 kottat muttasil (bhal 7-8-9-10) wla rbia3a (bhal 4×9) y3lan l7ichor qbl tsmita — n9atoh t7sen lh.',
        'Tsmiya: yabda ysar l mzyed y3an tsmita: y3tan coup (citt) wla ymer; ila marrou kolhom kayna yd sun (bla coup).',
        'L7oba: 8 hikl; sd l7ika yabda li mbach, w kanchi talwi l citt lmtrouh ila kan 3ndk.',
        'Koul 7ika = majmo3 kottath + 10, twah l riq li akhdah.',
        'Riq li kaykhod l 8 hikl kamlin: kabot — yjib bonus + l7ichor l khsam, w n9at kott l khsam tntagh leh.',
        'Kiykmlu l joulat hatta riq ywah l hadaf — w l ghaba lih.'
      ],
      fr: [
        'Donne : les 32 cartes sont distribuées, 8 par joueur ; les joueurs face à face forment deux équipes.',
        'Phase Ashour : quiconque détient 4 cartes consécutives (ex. 7-8-9-10) ou un quadruplet (ex. 4×9) déclare son Ashour avant la nomination — ses points sont mis de côté.',
        'Nomination : à gauche du donneur, chacun nomme un atout (coup) ou passe ; si tout le monde passe, la donne est « Sun » (sans atout).',
        'Jeu : 8 plis ; le gagnant du pli mène le suivant ; il faut suivre le premier jeu.',
        'Chaque pli = somme de ses cartes + 10, pour l’équipe qui l’emporte.',
        'L’équipe qui prend les 8 plis : Cabot — bonus + les Ashour adverses, et les points de cartes adverses lui reviennent.',
        'Les manches continuent jusqu’à ce qu’une équipe atteigne l’objectif — et elle gagne.'
      ],
      en: [
        'Deal: all 32 cards are dealt, 8 each; opposite players form two teams.',
        'Ashour phase: a player holding 4 consecutive cards (e.g. 7-8-9-10) or a quad (e.g. 4×9) declares Ashour before naming — the points are banked.',
        'Naming: starting left of the dealer, each player names a trump (coup) or passes; if everyone passes the hand is « Sun » (no trump).',
        'Play: 8 tricks; the trick winner leads next; you must follow the led suit if you can.',
        'Each trick = its card points + 10, to the winning team.',
        'A team taking all 8 tricks: Cabot — bonus + the opponents’ Ashour, and the opponents’ card points flip to them.',
        'Rounds continue until a team reaches the target — it wins.'
      ]
    },
    details: {
      ar: [
        { h: 'قيم الأوراق', items: [
          'بلا هوكم (صن): آس 11 · عشرة 10 · شايب (K) 4 · بنت (Q) 3 · ولد (J) 2 — الإجمالي 120.',
          'مع هوكم: ولد (J) 20 · تسعة 14 · آس 11 · عشرة 10 · شايب 4 · بنت 3 · الإجمالي 152.'
        ] },
        { h: 'الأشور', items: [
          'سلسلة متصلة: 4 أوراق متتالية من نفس السيت (7-8-9-10 أو 10-J-Q-K) قبل التسمية.',
          'رباعية: 4 أوراق من نفس الرتبة (4×9 على الأقل؛ رباعية 7 أو 8 لا قيمة لها).',
          'يُعلن مرة واحدة لكل فريق؛ إن أعلن الخصم بعده بترتيب أقوى تُلغى (قطع).',
          'أشور غير مثبت (مكذوب) = لا قيمة له.'
        ] },
        { h: 'البلوت', items: [
          'بلوت = رباعية (مثل 4×10 أو 4×K) أو سلسلة طويلة (5 أوراق متصلة) تظهر أثناء اللعب.',
          'الفريق المعلن عنها يجيب +20 نقطة فورًا.'
        ] },
        { h: 'الكابوت', items: [
          'فريق يأخذ الـ8 أكلات كاملة في يد.',
          'يجيب بونص الكابوت (0/30/50/90 بالاتفاق) + أشور الخصم + نقاط أوراقه.'
        ] },
        { h: 'يد الصن', items: [
          'لم يسمِّ أحد هوكم: تُلعب بلا هوكم (قيم بلا هوكم: الإجمالي 120).',
          'البلوت والأشور ما زالوا حاضرين.'
        ] }
      ],
      da: [
        { h: 'Qim l7out', items: [
          'Bla coup (sun): as 11 · 10 → 10 · chaib (K) 4 · bnt (Q) 3 · wallad (J) 2 — l3ami 120.',
          'M3a coup: wallad (J) 20 · 9 → 14 · as 11 · 10 → 10 · chaib 4 · bnt 3 · l3ami 152.'
        ] },
        { h: 'L7ichour', items: [
          'Silsila muttasil: 4 kottat muttalihat mn nafs l citt (7-8-9-10 wla 10-J-Q-K) qbl tsmita.',
          'Rbia3a: 4 kottat mn nafs rttba (4×9 3la l aqal).',
          'Y3lan merra wahda lkoul riq; ila 3lan l khsam mbach b trtib a9wa ttaghla (qta3).',
          '7ichour bla tbit (mkhdo) = bla qima.'
        ] },
        { h: 'Lbaloot', items: [
          'Baloot = rbia3a (bhal 4×10 wla 4×K) wla silsila t7ila (5 kottat) tzher 3d l7oba.',
          'Riq lm3lan 3ndah yjib +20 n9ta fora.'
        ] },
        { h: 'Lkabot', items: [
          'Riq yakhd l 8 hikl kamlin f yd wahda.',
          'Yjib bonus l kabot (0/30/50/90 b l ittifagh) + l7ichor l khsam + n9at kottath.'
        ] },
        { h: 'Yd sun', items: [
          'May tsmiya coup: tl3a bla coup (qim bla coup: l3ami 120).',
          'Baloot w l7ichour mazalou haddirin.'
        ] }
      ],
      fr: [
        { h: 'Valeurs des cartes', items: [
          'Sans atout (Sun) : As 11 · 10 → 10 · Roi 4 · Dame 3 · Valet 2 — total 120.',
          'Avec atout : Valet 20 · 9 → 14 · As 11 · 10 → 10 · Roi 4 · Dame 3 — total 152.'
        ] },
        { h: 'Ashour', items: [
          'Série : 4 cartes consécutives de même couleur (7-8-9-10 ou 10-V-D-R) avant la nomination.',
          'Quadruplet : 4 cartes de même rang (4×9 minimum).',
          'Une seule déclaration par équipe ; une déclaration plus forte adverse coupe (annule).',
          'Un Ashour non validé = sans valeur.'
        ] },
        { h: 'Baloot', items: [
          'Baloot = un quadruplet (ex. 4×10 ou 4×R) ou une série de 5 révélé pendant le jeu.',
          "L'équipe déclaratrice marque +20 points immédiatement."
        ] },
        { h: 'Cabot', items: [
          "Une équipe prend les 8 plis d'une donne.",
          'Bonus Cabot (0/30/50/90 convenu) + les Ashour adverses + leurs points de cartes.'
        ] },
        { h: 'Donne Sun', items: [
          'Personne ne nomme d’atout : jeu sans atout (total 120).',
          'Baloot et Ashour restent en vigueur.'
        ] }
      ],
      en: [
        { h: 'Card values', items: [
          'No trump (Sun): Ace 11 · Ten 10 · King 4 · Queen 3 · Jack 2 — total 120.',
          'With trump: Jack 20 · Nine 14 · Ace 11 · Ten 10 · King 4 · Queen 3 — total 152.'
        ] },
        { h: 'Ashour', items: [
          'Serial: 4 consecutive same-suit cards (7-8-9-10 or 10-J-Q-K) declared before naming.',
          'Quad: 4 cards of the same rank (4×9 minimum).',
          'One declaration per team; a stronger late declaration by opponents cancels it.',
          'An unvalidated Ashour is void.'
        ] },
        { h: 'Baloot', items: [
          'Baloot = a quad revealed in play (e.g. 4×10, 4×K) or a 5-card serial.',
          'The declaring team banks +20 points immediately.'
        ] },
        { h: 'Cabot', items: [
          'A team takes all 8 tricks of a hand.',
          'Cabot bonus (0/30/50/90 by agreement) + opponents’ Ashour + their card points.'
        ] },
        { h: 'Sun hand', items: [
          'Nobody named trump: play with no trump (total 120).',
          'Baloot and Ashour still apply.'
        ] }
      ]
    },
    payouts: {
      ar: '<tr><td>فوز مباراة (غرفة)</td><td>الفريق الفائز يقسم الرهان (رسم المنصة 5%)</td></tr><tr><td>أشور</td><td>+8 إلى +36 حسب التشكيلة</td></tr><tr><td>بلوت</td><td>+20</td></tr><tr><td>كابوت</td><td>بونص (0/30/50/90) + أشور الخصم + نقاط أوراقه</td></tr><tr><td>تدريبي (ضد الآلي/محلي)</td><td>تعليمي — بلا رهان</td></tr>',
      da: '<tr><td>Ghaba match (ghrafya)</td><td>Riq lgheb yqssem l mise (rsm l mnassa 5%)</td></tr><tr><td>7ichour</td><td>+8 3la +36 3la tshkil</td></tr><tr><td>Baloot</td><td>+20</td></tr><tr><td>Kabot</td><td>Bonus (0/30/50/90) + l7ichor l khsam + n9at kottath</td></tr><tr><td>Tadbir (m3a bot/makani)</td><td>Tbdiri — bla mise</td></tr>',
      fr: '<tr><td>Victoire d’une partie (salle)</td><td>L’équipe gagnante se partage la mise (commission 5%)</td></tr><tr><td>Ashour</td><td>+8 à +36 selon la combinaison</td></tr><tr><td>Baloot</td><td>+20</td></tr><tr><td>Cabot</td><td>Bonus (0/30/50/90) + Ashour adverses + points de cartes</td></tr><tr><td>Entraînement (IA/local)</td><td>Éducatif — sans mise</td></tr>',
      en: '<tr><td>Match win (room)</td><td>Winning team splits the bet (5% platform fee)</td></tr><tr><td>Ashour</td><td>+8 to +36 by combo</td></tr><tr><td>Baloot</td><td>+20</td></tr><tr><td>Cabot</td><td>Bonus (0/30/50/90) + opponents’ Ashour + card points</td></tr><tr><td>Practice (AI/local)</td><td>Educational — no bet</td></tr>'
    },
  },
  /* ═══ أونو (un) — 2-4 لاعبين، ألوان وأرقام وبراغي ═══ */
  un: {
    name: {
      ar: 'أونو 🃏',
      da: 'L’Uno 🃏',
      fr: 'Uno 🃏',
      en: 'Uno 🃏'
    },
    goal: {
      ar: 'لاعبون (2 إلى 4) يتنافسون على إفراغ أيدائهم أولاً — كل جولة يفوز فيها لاعب تمنح نقاط أوراق الخاسرين، وأول من يبلغ هدف النقاط (200/500/1000) يفوز المباراة.',
      da: 'L3aeibin (2 l 4) khyam 3la l ifra9 dyal l7itathom ola — kol joule 3et l n9at dyal l kottath dyal l khssasim, w l awla li ywalli l hadaf (200/500/1000) khebba l match.',
      fr: 'Des joueurs (2 à 4) s’affrontent pour vider leur main en premier — chaque manche rapporte les points des cartes des perdants, et le premier à atteindre l’objectif (200/500/1000) gagne la partie.',
      en: 'Players (2–4) race to empty their hands first — each round scores the losers’ card points, and the first to reach the target (200/500/1000) wins the match.'
    },
    steps: {
      ar: [
        'الطابور: 108 بطاقات بأربعة ألوان (أحمر/أزرق/أخضر/أصفر) — من كل لون: 0 واحدة، 1-9 بطاقتان، وتخطي S ورجوع R و+2 D بطاقتان لكل منهما؛ مع 4 براغي W و4 براغي +4 (X).',
        'التوزيع: 7 بطاقات لكل لاعب، وتُوضع أول بطاقة غير براغي كافتتاح — من يسارها يبدأ اللعب.',
        'الطابق: تلعب بطاقة تطابق لون الطابق أو رقمه، أو براغي بأي لون.',
        'الأوراق الخاصة: التخطي S يلغي دور التالي · الرجوع R يعكس اتجاه الدور · +2 D و+4 X التالي يسحب بطاقتين/أربعاً ويُخسر دوره.',
        'السحب: بلا بطاقة قانونية تسحب من الكوم — إن كانت السحبة مفيدة تبقى يدك (العبها أو مرّر)، وإلا ينتقل الدور.',
        'UNO: لما يبقالك بطاقة واحدة صوّح UNO — المنسى يسحب بطاقتين جزاءً.',
        'نهاية الجولة: من يفوّت يده يفوز — نقاط الجولة = مجموع أوراق كل الخاسرين (الرقم بقيمته، S/R/D = 20، براغي = 50) تضاف لفائزها.',
        'المباراة: تستمر الجولات حتى يبلغ لاعب الهدف — والفوز له.'
      ],
      da: [
        'L tabour: 108 cartes b 4 lwan (7mer/l7der/lkhder/lsfar) — mn kol lo: 7ed 0, 1-9 bj2, w S w R w D bj2 l kol we7da; m3a 4 W w 4 X.',
        'L tabi3: 7 cartes l kol l3a3ib, w l awla carte li ma kaynach bra7i katwda bch touftah — li f rih ybda yel3ab.',
        'L tamth: tsawb carte li kayt7ama b lwan l tab9 wla 7erhom, wla bra7i b kol lo.',
        'Cartes khouss: S katnsa dour l tayfin · R katrdd l atjo · D w X l tayfin yssaf 2/4 w kheir dour.',
        'L saf: ma l3endkch carte légale — tsaf men l koma; il kan l saf moufa3et tbed b idk (sawbha wla mrr), ila la dour kaymchi.',
        'UNO: il bqa lik carte we7da — goul UNO; li ynaso yssaf 2 b jaza3.',
        'Tama l joule: li ifra9 l idt khbeb — n9at l joule = mjmom l kottath dyal khl 7akhsasim (7er b9atou, S/R/D = 20, bra7i = 50).',
        'L match: les joules kamla l had l w7t li wahd ywalli l hadaf — w l khbba lih.'
      ],
      fr: [
        'Le paquet : 108 cartes en 4 couleurs (rouge/bleu/vert/jaune) — par couleur : un 0, deux 1-9, deux SKIP, deux REVERSE, deux +2 ; plus 4 JOKER et 4 JOKER+4.',
        'Distribution : 7 cartes par joueur, la première carte non-joker posée en ouverture — le joueur de sa gauche joue le premier.',
        'Jouer : une carte qui correspond à la couleur ou au chiffre de la carte du dessus, ou un joker n’importe quand.',
        'Cartes spéciales : SKIP annule le tour du suivant · REVERSE inverse le sens · +2 et +4 : le suivant tire 2/4 cartes et perd son tour.',
        'Tirer : sans joue possible, piochez — si la carte tirée est jouable, c’est toujours votre tour (jouez-la ou passez), sinon le tour passe.',
        'UNO : à une carte restante, criez UNO — l’oubli coûte 2 cartes de pénalité.',
        'Fin de manche : qui vide sa main gagne — points de la manche = somme des cartes des perdants (chiffre = sa valeur, S/R/D = 20, joker = 50).',
        'Partie : les manches continuent jusqu’à ce qu’un joueur atteigne l’objectif — il gagne.'
      ],
      en: [
        'The deck: 108 cards in 4 colors (red/blue/green/yellow) — per color: one 0, two 1-9, two SKIP, two REVERSE, two +2; plus 4 WILD and 4 WILD+4.',
        'Dealing: 7 cards each; the first non-wild card opens the game — the player to its left plays first.',
        'Match: play a card matching the color or number of the top card, or a wild anytime.',
        'Action cards: SKIP cancels the next player’s turn · REVERSE flips direction · +2 / +4: the next player draws 2/4 and is skipped.',
        'Draw: with no legal play, draw from the deck — if the drawn card is playable it’s still your turn (play it or pass), otherwise the turn moves on.',
        'UNO: at one card left, call UNO — forgetting costs a 2-card penalty.',
        'Round end: emptying your hand wins it — round points = sum of all losers’ cards (number = its value, S/R/D = 20, wild = 50) go to the winner.',
        'Match: rounds continue until a player reaches the target — they win.'
      ]
    },
    details: {
      ar: [
        { h: 'قيم الأوراق في حساب الجولة', items: [
          'الأرقام 0-9: قيمتها الظاهرة (0 لا يساوي شيئاً).',
          'التخطي S والرجوع R و+2: 20 نقطة.',
          'البراغي W والبراغي +4: 50 نقطة.'
        ] },
        { h: 'الوضع الفردي والفرقي', items: [
          'لاعبان: مباراة فردية — الفائز يأخذ نقاط الجميع.',
          '4 لاعبين: فريقان (المقابِلان) — نقاط الخاسرين تذهب لفريق الفائز.'
        ] },
        { h: 'الوضع التعليمي', items: [
          'ضد البوت (3 مستويات) أو محلياً على جهاز واحد (4 لاعبين بتسليم الجهاز) — مجاني بلا رهان.'
        ] }
      ],
      da: [
        { h: 'B9a3at l kottath f l joule', items: [
          'Les 7arag 0-9: b9a3athom l zabha (0 ma kayb9ach 7ta).',
          'S w R w D: 20 n9at.',
          'Bra7i W w X: 50 n9a.'
        ] },
        { h: 'Wajh frdi w wa9t riq', items: [
          'L3a3ibin 2: match frdi — l khbeb kaykhod l n9at dyal kol chi.',
          'L3a3ibin 4: riqayn (l m9abilin) — n9at l khssasim khedha riq l khbeb.'
        ] },
        { h: 'L wajh tbdiri', items: [
          'M3a l bot (3 mstarat) wla makani 3la device we7da (4 l3a3ibin b taslim l device) — mjani bla mise.'
        ] }
      ],
      fr: [
        { h: 'Valeur des cartes en fin de manche', items: [
          'Chiffres 0-9 : leur valeur affichée (le 0 ne compte pas).',
          'SKIP, REVERSE et +2 : 20 points.',
          'Joker et Joker+4 : 50 points.'
        ] },
        { h: 'Individuel et par équipes', items: [
          '2 joueurs : match individuel — le gagnant prend les points de tous.',
          '4 joueurs : deux équipes (joeurs face à face) — les points des perdants vont à l’équipe du gagnant.'
        ] },
        { h: 'Mode éducatif', items: [
          'Contre l’IA (3 niveaux) ou en local sur un même appareil (4 joueurs, passage de main) — gratuit, sans mise.'
        ] }
      ],
      en: [
        { h: 'Card values at round end', items: [
          'Numbers 0-9: their face value (0 counts nothing).',
          'SKIP, REVERSE and +2: 20 points each.',
          'WILD and WILD+4: 50 points each.'
        ] },
        { h: 'Individual and teams', items: [
          '2 players: individual match — the winner takes everyone’s points.',
          '4 players: two teams (opposite players) — the losers’ points go to the winner’s team.'
        ] },
        { h: 'Educational mode', items: [
          'Vs AI (3 levels) or local on one device (4 players, device passing) — free, no bet.'
        ] }
      ]
    },
    payouts: {
      ar: '<tr><td>فوز مباراة (غرفة)</td><td>الفائز يأخذ رهان الخصوم (رسم المنصة 5%)</td></tr><tr><td>بطاقة 0-9</td><td>قيمتها الظاهرة</td></tr><tr><td>S / R / +2</td><td>20 نقطة</td></tr><tr><td>براغي / +4</td><td>50 نقطة</td></tr><tr><td>جزاء UNO</td><td>+2 بطاقات للمنسى</td></tr><tr><td>تدريبي (ضد الآلي/محلي)</td><td>تعليمي — بلا رهان</td></tr>',
      da: '<tr><td>Ghaba match (ghrafya)</td><td>L khbeb kaykhod l mise dyal l khssasim (rsm l mnassa 5%)</td></tr><tr><td>Carte 0-9</td><td>B9a3a 7a3a</td></tr><tr><td>S / R / D</td><td>20 n9a</td></tr><tr><td>Bra7i / X</td><td>50 n9a</td></tr><tr><td>Jaza3 UNO</td><td>+2 cartes l li ynaso</td></tr><tr><td>Tadbir (m3a bot/makani)</td><td>Tbdiri — bla mise</td></tr>',
      fr: '<tr><td>Victoire d’une partie (salle)</td><td>Le gagnant prend la mise des adversaires (commission 5%)</td></tr><tr><td>Carte 0-9</td><td>Sa valeur affichée</td></tr><tr><td>S / R / +2</td><td>20 points</td></tr><tr><td>Joker / +4</td><td>50 points</td></tr><tr><td>Pénalité UNO</td><td>+2 cartes à l’oublié</td></tr><tr><td>Entraînement (IA/local)</td><td>Éducatif — sans mise</td></tr>',
      en: '<tr><td>Match win (room)</td><td>Winner takes the opponents’ bet (5% platform fee)</td></tr><tr><td>Card 0-9</td><td>Face value</td></tr><tr><td>S / R / +2</td><td>20 points</td></tr><tr><td>Wild / +4</td><td>50 points</td></tr><tr><td>UNO penalty</td><td>+2 cards for the forgetful</td></tr><tr><td>Practice (AI/local)</td><td>Educational — no bet</td></tr>'
    },
  },
  /* ═══ روندا الكلاسيكية — الطاولة (rd) ═══ */
  rd: {
    name: {
      ar: 'روندا الكلاسيكية — الطاولة 🎴',
      da: 'الروندا الكلاسيكية — الطبلة 🎴',
      fr: 'Ronda Classique — La table 🎴',
      en: 'Classic Ronda — The Table 🎴'
    },
    goal: {
      ar: 'التقط أوراق الطاولة بالورقة المطابقة (مع السلسلة الصاعدة)، واجمع الأوراق والنقاط الخاصة (ضربة/حبل/جوج حبال/ميسا/قاعا راي/قاعا أص) حتى تبلغ الهدف المتفق عليه (41/51/61 أو نهاية توزيعة كاملة).',
      da: 'جبد كوط الطبلة بالكطة المطابقة (مع السلسلة)، وجمع النقط الخاصة (ضربة/حبل/جوج حبال/ميسا/قاعا راي/قاعا أص) حتى توصل للهدف المتفق عليه.',
      fr: 'Capturez les cartes de la table avec la carte correspondante (et la chaîne montante) et cumulez cartes et points spéciaux (Frappe/Corde/Double Corde/Mesa/Qaâa Raï/Qaâa As) jusqu’à l’objectif convenu (41/51/61 ou une donne complète).',
      en: 'Capture table cards by matching rank (plus the rising chain), and accumulate cards and special points (Strike/Rope/Double-Rope/Mesa/Qaâa Raï/Qaâa As) until the agreed target (41/51/61 or one full deal).'
    },
    steps: {
      ar: [
        'الجلوس والاتجاه: كل لاعب في زاوية؛ الدور ينتقل عكس اتجاه عقارب الساعة (بعدك يلعب الجالس على يمينك).',
        'التوزيع: 3 أوراق لكل لاعب و4 أوراق مكشوفة على الطاولة؛ الهدف 41/51/61 نقطة أو «جولة» (توزيع الـ40 ورقة).',
        'في دورك العب ورقة من يدك: إن وُجدت على الطاولة ورقة بنفس رقمها تلتقطها هي وكل ما يليها في السلسلة (6←7←10←11←12) وكل النسخ من نفس الرقم.',
        'إن لم يوجد مثلها تستقر ورقتك على الطاولة ليلتقطها غيرك لاحقاً.',
        'أوراق فوق 20 (10/11/12) كل واحدة = نقطة عند نهاية الجولة؛ والجولة الأخيرة لآخر لاعب التقط.'
      ],
      da: [
        'الجلوس والاتجاه: كل لعاب فزاوية؛ الدور كيمشي ضد عقارب الساعة.',
        'التوزيع: 3 كوط لكل لعاب و4 كوط مكشوفة فالطبلة؛ الهدف 41/51/61 ولا «جولة».',
        'فدورك العب ورقة: إلا كان كاين فالطبلة ورقة بنفس الرقم كتشدها هي وكل اللي من موراها فالسلسلة (6←7←10←11←12) وكل النسخ.',
        'إلا ما كان كاين مثلها كتستقر ورقتك فالطبلة.',
        'الكوط اللي فوق 20 (10/11/12) كل وحدة بنقطة فالأخير.'
      ],
      fr: [
        'Placement : chaque joueur dans un coin ; le tour progresse dans le sens inverse des aiguilles d’une montre.',
        'Donne : 3 cartes par joueur et 4 cartes ouvertes sur la table ; objectif 41/51/61 points ou « manche » (les 40 cartes).',
        'À votre tour jouez une carte : si une carte de même rang est sur la table, capturez-la avec toute la chaîne montante (6←7←10←11←12) et tous les doubles du rang.',
        'Sinon votre carte reste sur la table.',
        'En fin de manche chaque carte au-dessus de 20 (10/11/12) vaut 1 point ; le dernier preneur reçoit les cartes restantes.'
      ],
      en: [
        'Seating: each player in a corner; turns move counter-clockwise (the player on your right plays after you).',
        'Deal: 3 cards per player and 4 face-up table cards; target 41/51/61 points or “round” (all 40 cards).',
        'On your turn play a card: if the same rank is on the table you capture it plus the rising chain (6←7←10←11←12) and all copies of the rank.',
        'Otherwise your card rests on the table.',
        'At round end every card above 20 (10/11/12) scores 1 point; the last capturer takes remaining table cards.'
      ]
    },
    details: {
      ar: [
        { h: 'الالتقاط بالسلسلة', items: [
          'الورقة المرمية تلتقط كل أوراق نفس الرقم فوق الطاولة (مهما كان عددها) ثم كل رتبة تالية موجودة بالترتيب 6 ثم 7 ثم 10 ثم 11 ثم 12 — تقف عند أول رتبة غائبة. لا توجد 8 ولا 9 في المجموعة.',
          'الورقة المرمية نفسها تُضم للملتقَط (مع الورقة/الأوراق الملتقطة).',
          'مثال: رميت 6 وهناك 6 و7 على الطاولة → تلتقط 6 و6 و7 (وتتوقف لأن 10 غائبة).'
        ] },
        { h: 'الضربة والحبل وجوج حبال (استرجاع الأوراق)', items: [
          'الضربة (+1): تلعب رقماً مطابقاً لآخر ورقة لعبها الخصم مباشرة وما زالت ظاهرة على الطاولة — تلتقطها مع سلسلتها، وتصبح أوراق السلسلة في كيسك.',
          'الحبل (+5): يعيد صاحب الورقة الأصلية نفس الرقم بعد الضربة — يسترد من كيس الضارب ورقتي الضربة + ورقة الحبل + السلسلة (لا تستقر ورقة الحبل على الطاولة).',
          'جوج حبال (+10): يلعب صاحب الضربة الرقم الرابع — يسترد كل الأوراق: ورقتي الضربة + ورقة الحبل + ورقة الحبلين + السلسلة. صاحب آخر ورقة مطابقة يلتقط الأوراق المعنية جميعها.',
          'سلسلة الضربة تنكسر بأي رتبة مختلفة ولا تُحتسب ضربةً إن كانت ورقة الخصم قد التُقطت قبل الرد.'
        ] },
        { h: 'الميسا والنهايات', items: [
          'ميسا (+1): التقاط آخر أوراق الطاولة دفعة واحدة (تصبح الطاولة فارغة).',
          'نهاية التوزيعة: من نفدت أوراق يده والرزمة فارغة تنتهي الجولة؛ الأوراق الباقية لآخر ملتقط، وكل ورقة فوق 20 = نقطة.',
          'قاعا راي (+5): الموزع يلتقط 12 برميتة الأخيرة. قاعا أص (+5 للخصم): الموزع يلتقط 1 — أو لا يلتقط شيئاً — برميتة الأخيرة.',
          'الفوز الفوري: من بلغ الهدف (41/51/61) وسط الجولة يُعلن فائزاً فوراً.'
        ] },
        { h: 'اتجاه اللعب', items: [
          'الدور يدور عكس اتجاه عقارب الساعة: بعد اللاعب الأسفل-يمين يلعب الأعلى-يمين ثم الأعلى-يسار ثم الأسفل-يسار، وهكذا، والموزع يتناوب بنفس الاتجاه.'
        ] }
      ],
      da: [
        { h: 'الالتقاط بالسلسلة', items: [
          'الكطة كتشد كل الكوط ديال نفس الرقم ف الطبلة ومن بعد كل رتبة متابعين بالترتيب 6→7→10→11→12 حتى أول رتبة غايبة. ما كاين لا 8 لا 9.',
          'الكطة اللي ترميها كتدخل للملتقط (مع اللي التقطاتي).'
        ] },
        { h: 'الضربة والحبل وجوج حبال', items: [
          'ضربة +1: تلعب نفس رقم آخر ورقة لعبها الخصم وما زالت ظاهرة → كتشديها مع السلسلة.',
          'حبل +5: صاحب الورقة الأصلية كيرجع بنفس الرقم → كيسترجع ورقتي الضربة + ورقة الحبل + السلسلة.',
          'جوج حبال +10: الرقم الرابع لصاحب الضربة → كيسترجع جميع الأوراق. صاحب آخر ورقة مطابقة كياخذ كلشي.'
        ] }
      ],
      fr: [
        { h: 'Capture en chaîne', items: [
          'La carte jouée capture toutes les cartes de même rang puis chaque rang suivant présent dans l’ordre 6→7→10→11→12, en s’arrêtant au premier rang absent (pas de 8 ni de 9).'
        ] },
        { h: 'Frappe, Corde, Double Corde (cartes récupérées)', items: [
          'Frappe +1 : jouer le même rang que la dernière carte adverse encore visible — capture + chaîne.',
          'Corde +5 : le propriétaire de la carte d’origine répond du même rang — il récupère les deux cartes de la frappe + la corde + la chaîne.',
          'Double Corde +10 : le quatrième même rang — récupération totale (le dernier à poser le rang prend toutes les cartes concernées).'
        ] }
      ],
      en: [
        { h: 'Chain capture', items: [
          'A played card captures every same-rank card on the table, then each following rank present in the order 6→7→10→11→12, stopping at the first missing rank (no 8 or 9 exist).'
        ] },
        { h: 'Strike, Rope, Double-Rope (card recovery)', items: [
          'Strike +1: play the same rank as the opponent’s last card still resting on the table — capture it and its chain.',
          'Rope +5: the owner of the original card answers with the same rank — he retrieves the two strike cards + the rope card + the chain.',
          'Double-Rope +10: the striker plays the fourth rank — full recovery. The player of the last matching card takes all the cards involved.'
        ] }
      ]
    },
    payouts: {
      ar: '<tr><td>كل ورقة فوق 20 عند النهاية</td><td>1 نقطة</td></tr><tr><td>ضربة</td><td>+1</td></tr><tr><td>ميسا</td><td>+1</td></tr><tr><td>حبل</td><td>+5</td></tr><tr><td>جوج حبال</td><td>+10</td></tr><tr><td>قاعا راي (الموزع يلتقط 12)</td><td>+5</td></tr><tr><td>قاعا أص (الموزع يلتقط 1 أو لا شيء)</td><td>+5 للخصم</td></tr>',
      da: '<tr><td>كل ورقة فوق 20 فالأخير</td><td>1 نقطة</td></tr><tr><td>ضربة</td><td>+1</td></tr><tr><td>ميسا</td><td>+1</td></tr><tr><td>حبل</td><td>+5</td></tr><tr><td>جوج حبال</td><td>+10</td></tr><tr><td>قاعا راي / قاعا أص</td><td>+5</td></tr>',
      fr: '<tr><td>Chaque carte au-dessus de 20 en fin de manche</td><td>1 point</td></tr><tr><td>Frappe</td><td>+1</td></tr><tr><td>Mesa</td><td>+1</td></tr><tr><td>Corde</td><td>+5</td></tr><tr><td>Double Corde</td><td>+10</td></tr><tr><td>Qaâa Raï / Qaâa As</td><td>+5</td></tr>',
      en: '<tr><td>Each card above 20 at round end</td><td>1 point</td></tr><tr><td>Strike</td><td>+1</td></tr><tr><td>Mesa</td><td>+1</td></tr><tr><td>Rope</td><td>+5</td></tr><tr><td>Double-Rope</td><td>+10</td></tr><tr><td>Qaâa Raï / Qaâa As</td><td>+5</td></tr>'
    }
  },
  /* ═══ Moroccan Ronda ♦️♠️ ═══ */
    /* ═══ Moroccan Rami (Talaj & Simple) ═══ */
  rm: {
    name: {
      ar: 'الرامي المغربي (طلاح + سامبل) 🃏',
      da: 'الرامي المغربي (طالاج وسامبل) 🃏',
      fr: 'Rami Marocain (Talaj + Sample) 🃏',
      en: 'Moroccan Rami (Talaj + Sample) 🃏'
    },
    goal: {
      ar: 'كوّن مجموعات (متماثلات ومتتاليات) وأنزلها في الطاولة، وأنهِ الشوط بأقل مجموع نقاط، وتجنّب تجاوز هدف الجولة (501–1001) لتبقى الفائز.',
      da: 'جمع المجموعات (متشابهات وتسلسلات) ونزلها فالطبلة، وسالي الشوط بأقل مجموع نقاط، وتجنب تفوت هدف الجولة (501–1001) باش تبقى رابح.',
      fr: 'Formez des combinaisons (brelans et suites), posez-les sur la table et finissez la manche avec le moins de points possible, sans dépasser l\'objectif de la partie (501–1001).',
      en: 'Form melds (sets and sequences), lay them on the table, and finish each round with the lowest score, avoiding exceeding the match target (501–1001) to remain the winner.'
    },
    steps: {
      ar: [
        'اختر الوضع: طلاح (108 أوراق + 4 جوكر) أو سامبل (104 أوراق بجوكر معكوس اللون)',
        'التوزيع: 14 ورقة لكل لاعب و15 للموزع في الطلاح (13 لكل لاعب في السامبل)؛ أول موزع = صاحب أصغر ورقة',
        'في دورك (مؤقت 90 ثانية): اسحب ورقة واحدة بالضبط من المجرف أو خذ ورقة المرموق، ثم ارمِ ورقة واحدة بالضبط (اليد 14 بين الأدوار و15 أثناء الدور)',
        'الافتتاح: متماثلة ≥3 + متتالية ≥3 ومجموع ≥ 71 نقطة في الطلاح (≥ 51 في السامبل) بدون جوكر في الحساب',
        'بعد الافتتاح: أضف الأوراق الصالحة لأي مجموعة ظاهرة (له أو لغيره) أو استبدل الجوكر بورقة من يدك',
        'الإنهاء: 14 ورقة كلها مجموعات صالحة + الورقة الـ15 تُقلب ظهراً على الطاولة (في السامبل: 13 مجموعة + الـ14 ظهراً)'
      ],
      da: [
        'عزل الوضع: طالاج (108 ورقة + 4 جوكير) ولا سامبل (104 ورقة بجوكر معكوس)',
        'التوزيع: 14 ورقة لكل لعاب و15 للموزع فالطالاج (13 لكل واحد فالسامبل)',
        'فدورك (90 ثانية): جبد ورقة وحدة بالضبط من الباكي ولا خود المرموق، وارمي ورقة وحدة بالضبط',
        'الافتتاح: مجموعة متشابهة ≥3 + تسلسل ≥3 والمجموع ≥ 71 فالطالاج (≥ 51 فالسامبل) بلا جوكر فالحساب',
        'من بعد الافتتاح: زيد الأوراق الصالحة لأي مجموعة ظاهرة ولا بدل الجوكر بورقة من يدك',
        'الإنهاء: 14 ورقة كلها مجموعات صالحة + الورقة 15 تنقلب على ضهرها'
      ],
      fr: [
        'Choisissez le mode : Talaj (108 cartes + 4 jokers) ou Sample (104 cartes avec joker de couleur inversée)',
        'Distribution : 14 cartes par joueur et 15 au donneur en Talaj (13 chacun en Sample) ; le premier donneur est celui qui détient la plus petite carte',
        'À votre tour (90 s) : piochez exactement une carte (talon ou défausse) puis défaussez exactement une carte (14 cartes entre les tours, 15 pendant le tour)',
        'Ouverture : brelan ≥3 + suite ≥3 et total strictement supérieur à 71 en Talaj (51 en Sample), sans joker dans le compte',
        'Après l\'ouverture : ajoutez les cartes valides à toute combinaison exposée (la vôtre ou celle d\'un adversaire) ou remplacez un joker par une carte de votre main',
        'Fin de manche : 14 cartes toutes en combinaisons valides + la 15e posée face cachée (en Sample : 13 combinaisons + la 14e face cachée)'
      ],
      en: [
        'Choose the mode: Talaj (108 cards + 4 Jokers) or Sample (104 cards with a colour-reversed Joker)',
        'Deal: 14 cards per player and 15 to the dealer in Talaj (13 each in Sample); the first dealer is the holder of the lowest card',
        'On your turn (90s timer): draw exactly one card (stock or discard) then discard exactly one (14 cards between turns, 15 during the turn)',
        'Opening: Set ≥3 + Sequence ≥3 and a total ≥ 71 in Talaj (≥ 51 in Sample), excluding Jokers from the count',
        'After opening: add valid cards to any exposed meld (yours or an opponent\'s) or replace a Joker with one card from your hand',
        'Finish: all 14 cards form valid melds + the 15th card placed face-down (in Sample: 13 melds + the 14th face-down)'
      ]
    },
    details: {
      ar: [
        { h: 'تعريفات عامة', items: [
          'الرموز: قلب/مربع (أحمر)، سيف/عنب (أسود). قيم الافتتاح: الرقم = قيمته؛ J/Q/K/A = 10.',
          'متماثلة (Set): 3 أوراق أو أكثر بنفس العدد وبرموز مختلفة، بلا تكرار رمز داخل المجموعة.',
          'متتالية (Sequence): 3 أوراق أو أكثر متتابعة بنفس الرمز.',
          'المجرف = أوراق السحب؛ المرموق = أوراق الرمي.'
        ]},
        { h: 'قانون الطلاح — التوزيع والدور', items: [
          '2–5 لاعبين؛ 108 أوراق (8 لكل رقم + 4 جوكر). أول موزع = صاحب أصغر ورقة، والتعاقب يميناً كل شوط.',
          '14 ورقة لكل لاعب و15 للموزع؛ يرمي الموزع أول ورقة لبدء المرموق.',
          'الدور: سحب واحد (مجرف أو مرموق) ثم رمي واحد بالضبط؛ اليد 14 بين الأدوار و15 أثناء الدور — مستحيل 13 أو 16.',
          'مؤقت 90 ثانية؛ عند انتهائه لعب أوتوماتيكي وتمرير الدور.'
        ]},
        { h: 'قانون الطلاح — الافتتاح (الإظهار)', items: [
          'شرطان معاً: متماثلة ≥3 + متتالية ≥3، ومجموع الأوراق المُظهرة ≥ 71 (بالحساب الوجهي) دون جوكر في الحساب.',
          'إن وُجد افتتاح سابق: يجب تجاوز مجموع آخر مُظهِر.',
          'ورقة الموزع الأولى تُؤخذ فقط في حالتين: إكمال افتتاحٍ مستوفٍ، أو إنهاء الشوط كاملاً.',
          'إظهار بدون شروط = +71، تُجمع الأوراق ويُرمى ورقة ويستمر الشوط.',
          'أخذ ورقة (مرموق/سابقة) دون شروط = +71 مع إرجاع الورقة.'
        ]},
        { h: 'قانون الطلاح — الإضافة واستبدال الجوكر', items: [
          'بعد تحقق الشروط يجوز إنقاص ورقة من اليد بإضافتها لأي مجموعة ظاهرة (له أو لغيره) بشرط التجانس وعدم التكرار: متتالية ← نفس الرمز وتمدد التسلسل؛ متماثلة ← نفس العدد برمز غير موجود.',
          'استبدال الجوكر: ورقة واحدة من اليد تُضاف للمجموعة أو يُستبدل بها الجوكر فيها.',
          'كل ورقة صالحة تُقبل، وغير الصالحة تُرفض فقط، برسالة واحدة غير مكررة.'
        ]},
        { h: 'قانون الطلاح — إنهاء الشوط', items: [
          'حالة أ (أساسية): 14 ورقة كلها مجموعات صالحة (الجوكر مسموح للتكملة) + الورقة الـ15 تُقلب ظهراً → إنهاء بدون أي شرط نقاط.',
          'حالة ب: سحب المرموق ثم الإنهاء كحالة أ → بدون شرط افتتاح.',
          'حالة ج: سحب المرموق + الإنهاء مع إضافة ورقة لمجموعة لاعبٍ منزِلٍ قبله → يلزم الافتتاح وتجاوز مجموع آخر منزِل.',
          'يمنع ظهور خطأ «شروط الافتتاح» في الحالتين أ/ب.',
          'شوط مضاعف: إن أنهى الفائز بجوكر حر معزول كالورقة الـ15 (جوكر مسحوب من ورق التوزيع، لا من المرموق أو لا تور) تُضاعف نقاط الأوراق المتبقية/اليد الكاملة على الخاسرين، دون مضاعفة جزاء الخطأ.'
        ]},
        { h: 'قانون الطلاح — قاعدة الـ12 ورقة', items: [
          'من أنزل 12 ورقة: يلزمه في دوره التالي أخذ ورقة السابق إن انتمت لأي مجموعة ظاهرة؛ غفل وسحب من المجرف = +71 نهاية الشوط (ويُعفى الرامي).',
          'من بيده كاملة: يمنع أن يرمي ورقة منتمية لمجموعة ظاهرة والتالي صاحب 12 ورقة؛ فعلها وأخذها التالي = +71 على الرامي.'
        ]},
        { h: 'قانون الطلاح — النفاد والحساب والنهاية', items: [
          'نفاد المجرف: يُخلط المرموق فقط (لا تُمس مجموعات اللاعبين) ويُستأنف عند من توقف عنده الدور.',
          'حساب نهاية الشوط: يد كاملة دون إنزال = +100؛ أنزل بعضاً = كل ورقة متبقية 10 نقاط ثابتة بغضّ النظر عن رقمها.',
          'الجزاءات تُضاف للمجموع التراكمي وتُعرض بسببها مرة واحدة.',
          'نهاية الجولة: الهدف (501–1001)؛ يخسر من يتجاوز مجموعه التراكمي الهدف، والفائز من بقي دونه؛ لا تُعلن النهاية قبل التجاوز.'
        ]},
        { h: 'قانون السامبل (104 أوراق)', items: [
          'بلا جوكر مطبوع؛ بعد توزيع 13 ورقة لكل لاعب تُقلب أول ورقة من ورق التوزيع = «الفوجوك»، واللون المعاكس لها بنفس الرقم هو جوكر الجولة.',
          'اللاعب الذي يلي الموزع صاحب أول دور.',
          'الفوجوك: يحق لأي لاعب سحبها في دوره الأول فقط؛ إن لم تُسحب في الدورة الأولى سقط الحق فيها نهائياً، وتُخلط مع أوراق المرموق عند نفاد ورق التوزيع لتصبح ضمن السحب العادي.',
          'المرموق: اللاعب حر في سحب ورقة المرموق والتخلص من ورقة أخرى بدون شروط الافتتاح أو الإنهاء وبلا أي جزاء؛ لكنها لا تُعتبر حرة في نفس الدور — بعد رمي ورقة التخلص تصبح من أوراقه الحرة في الأدوار الموالية.',
          'رمي المسحوبة في نفس الدور: من سحب ورقة المرموق أو الفوجوك ورماها في نفس الدور يعتبر مخطئاً ويقيد عليه جزاء +51 نقطة يضاف لمجموع نقاط الجولة في نهاية الشوط.',
          'الفوجوك المرمية: إن سحب لاعب الفوجوك ورماها في نفس الدور تتحول لورقة مرموق عادية — لا يحق للاعبين الآخرين سحبها كفوجوك، وإنما لصاحب الدور التالي أخذها كمرموق عادي.',
          'الافتتاح: متتالية حرة + متماثلة حرة (خاليتان من الجوكر ومن ورقة مرموق نفس الدور) ومجموع الافتتاح ≥ 51؛ يجوز إدخال ورقة المرموق المسحوبة في مجموعة إضافية صالحة وتُحتسب ضمن الـ51 بشكل قانوني — بشرط ألا تكون جوكراً وألا تكون في المتتالية أو المتماثلة الحرتين الأساسيتين؛ مجموعات الجوكر لا تدخل العتبة لكنها تصلح لتجاوز حساب المفتتح السابق؛ وإن سبق لأحد اللاعبين الافتتاح وجب أن يكون مجموع افتتاحك أكبر تماماً من أعلى افتتاح سابق في الشوط (التساوي مرفوض).',
          'الحرة تبقى حرة في دور الافتتاح فقط: لا يُدرج جوكر أو مرموق نفس الدور في مجموعة حرة أُنزلت في نفس الدور؛ وفي الأدوار الموالية يجوز إدراج الجوكر وورقة المرموق في مجموعات الافتتاح الحرة.',
          'الإنهاء: متتالية حرة + متماثلة حرة + 13 ورقة مرتبة في مجموعات صالحة (مع أو بدون الورقة المعينة كجوكر) + ورقة الإنهاء الـ14 تُرمى ظهراً.',
          'عند الإنهاء يكشف الجميع: من لم يفتتح = +51؛ ومن افتتح تُحسب أوراقه المتبقية بقيمتها الوجهية (J/Q/K/A وورقة الجوكر = 10)؛ إن تجاوزت 51 = +51.',
          'خطأ الإظهار (افتتاح بلا شروط) = +51 واستمرار الشوط.'
        ]}
      ],
      en: [
        { h: 'General Definitions', items: [
          'Suits: Hearts/Diamonds (Red), Spades/Clubs (Black). Opening values: number cards = face value; J/Q/K/A = 10.',
          'Set: 3 or more cards of the same rank with different suits; no duplicate suits within the set.',
          'Sequence: 3 or more consecutive cards of the same suit.',
          'Stock = draw pile; Discard pile = discard pile.'
        ]},
        { h: 'Talaj — Dealing and Turn', items: [
          '2–5 players; 108 cards (8 per rank + 4 Jokers). First dealer = player holding the lowest card; deal rotates to the right each round.',
          '14 cards per player, 15 for the dealer; the dealer discards first to start the discard pile.',
          'Turn: draw exactly one card (stock or discard) then discard exactly one; hand size is 14 between turns and 15 during the turn — 13 or 16 is impossible.',
          '90-second timer; on timeout, auto-play executes and the turn passes.'
        ]},
        { h: 'Talaj — Opening (Melding)', items: [
          'Both conditions required: Set ≥3 + Sequence ≥3, and the total face value of melded cards is ≥ 71, excluding Jokers from the calculation.',
          'If a prior opening exists: you must exceed the last opener\'s total.',
          'The dealer\'s first discarded card may only be taken to complete a valid opening or to end the round entirely.',
          'Showing without conditions = +71: cards are collected, one is discarded, and the round continues.',
          'Taking a card (discard/previous) without conditions = +71 with the card returned.'
        ]},
        { h: 'Talaj — Adding to Melds & Joker Replacement', items: [
          'After meeting conditions, you may reduce your hand by adding a card to any exposed meld (yours or an opponent\'s) provided it fits legally without duplication: Sequence ← same suit extending the run; Set ← same rank with a suit not already present.',
          'Joker replacement: one card from hand is either added to the meld OR used to replace a Joker within it.',
          'All valid cards must be accepted; only invalid cards rejected — with a single, non-repeating message.'
        ]},
        { h: 'Talaj — Ending the Round', items: [
          'Case A (Standard): all 14 cards form valid melds (Jokers allowed as wildcards) + the 15th card placed face-down → ends the round with no point requirement.',
          'Case B: draw from the discard pile then end as in Case A → no opening requirement.',
          'Case C: draw from the discard pile + end by adding a card to a previous player\'s meld → must meet opening conditions AND exceed the last opener\'s total.',
          'The "opening conditions" error must NOT trigger in Cases A/B.',
          'Doubled round: if the winner ends with a free isolated Joker as the 15th card (a Joker drawn from the draw pile, not from the discard pile or La Tour), the losers\' remaining-card / full-hand points are doubled, while violation penalties are NOT doubled.'
        ]},
        { h: 'Talaj — 12-Card Rule', items: [
          'A player who has laid down 12 cards MUST take the previous player\'s discard on their next turn if it belongs to any exposed meld; failure (drawing from stock instead) = +71 at round end (the thrower is exempt).',
          'A player with a full hand MAY NOT discard a card belonging to an exposed meld when the next player holds 12 cards; violation + next player takes it = +71 on the thrower.'
        ]},
        { h: 'Talaj — Exhaustion, Scoring and Match End', items: [
          'Stock exhaustion: reshuffle the discard pile ONLY (players\' melds untouched); resume from the current turn position.',
          'End-of-round scoring: full hand without laying down = +100; partial lay-down = each remaining card is a flat 10 points, regardless of rank.',
          'Penalties are added to the cumulative score and displayed once with reason.',
          'Match end: target (501–1001); a player loses upon exceeding the target cumulative score; the winner stays below it; the game does NOT end before the threshold breach.'
        ]},
        { h: 'Sample Rules (104 Cards)', items: [
          'No printed Jokers; after dealing 13 cards each, the first stock card is flipped = the "Fojok"; its opposite-colour counterpart of the same rank is the round\'s Joker.',
          'The player after the dealer takes the first turn.',
          'Fojok: any player may draw it only on their own first turn; if nobody takes it during the first cycle the right lapses forever, and it is shuffled into the discard pile when the stock runs out, becoming drawable again.',
          'Discard pile: a player may freely draw the top discard and throw away another card — no opening/finishing conditions and no penalty; however that card is NOT free the same turn — after discarding, it becomes one of the player\'s free cards on following turns.',
          'Same-turn throwback: drawing the discard-pile card or the Fojok and throwing it back on the same turn is a mistake — a +51 penalty is added to the player\'s round score at the end of the round.',
          'Thrown-back Fojok: if a player draws the Fojok and discards it the same turn, it becomes an ordinary discard-pile card — no other player may draw it as the Fojok; only the next player in turn may take it as a normal discard.',
          'Opening: a free Sequence + a free Set (containing no Joker and no same-turn discard-pile card) with an opening total ≥ 51; the drawn discard-pile card may legally be placed in an additional valid meld that counts toward the 51 — provided it is not a Joker and not part of the two essential free opening melds; Joker melds do not count toward the threshold but do count toward beating the previous opener\'s total; if any player has already opened, your opening total must be strictly greater than the highest previous opening of the round (a tie is refused).',
          'Free stays free only on the opening turn: no Joker or same-turn discard card may be laid onto a free meld during the turn it was laid down; on following turns Jokers and discard-pile cards may be added to free opening melds.',
          'Finishing: free Sequence + free Set + all 13 cards arranged in valid melds (with or without the designated Joker) + the 14th finishing card thrown face-down.',
          'At round end all hands are revealed: unopened players = +51; opened players count remaining cards at face value (J/Q/K/A & the Joker = 10); if the total exceeds 51 = +51.',
          'Invalid opening attempt = +51 and the round continues.'
        ]}
      ],
      fr: [
        { h: 'Définitions générales', items: [
          'Symboles : Cœur/Carreau (rouge), Épée/Trèfle (noir). Valeurs d\'ouverture : chiffre = valeur ; V/D/R/As = 10.',
          'Brelan (Set) : 3 cartes ou plus de même rang avec des symboles différents, sans doublon de symbole.',
          'Suite (Sequence) : 3 cartes consécutives ou plus de même symbole.',
          'Talon = pioche ; Défausse = pile de défausse.'
        ]},
        { h: 'Talaj — Distribution et tour', items: [
          '2–5 joueurs ; 108 cartes (8 par rang + 4 jokers). Premier donneur = plus petite carte ; rotation à droite chaque manche.',
          '14 cartes par joueur, 15 au donneur ; le donneur défausse en premier.',
          'Tour : piocher exactement une carte puis défausser exactement une carte ; 14 cartes entre les tours, 15 pendant le tour — 13 ou 16 impossible.',
          'Minuteur 90 s ; à expiration, jeu automatique et passage du tour.'
        ]},
        { h: 'Talaj — Ouverture', items: [
          'Deux conditions : brelan ≥3 + suite ≥3, et total ≥ 71 (sans joker dans le compte).',
          'Si une ouverture existe : dépasser le total du dernier ouvreur.',
          'La première défausse du donneur ne se prend que pour compléter une ouverture valide ou pour finir la manche.',
          'Montrer sans conditions = +71 (cartes reprises, une défaussée, la manche continue).',
          'Prendre une carte sans conditions = +71 avec la carte rendue.'
        ]},
        { h: 'Talaj — Ajouts et joker', items: [
          'Après conditions : ajouter une carte à toute combinaison exposée si elle convient sans doublon (suite ← même symbole ; brelan ← même rang, symbole absent).',
          'Joker : une carte de la main est ajoutée OU remplace un joker.',
          'Toute carte valide est acceptée ; seule l\'invalide est rejetée, avec un message unique.'
        ]},
        { h: 'Talaj — Fin de manche', items: [
          'Cas A : 14 cartes en combinaisons valides (jokers permis) + la 15e face cachée → fin sans condition de points.',
          'Cas B : prise de la défausse puis fin comme Cas A → sans condition d\'ouverture.',
          'Cas C : prise de la défausse + fin en ajoutant à la combinaison d\'un joueur précédent → conditions d\'ouverture + dépasser le total du dernier ouvreur.',
          'L\'erreur « conditions d\'ouverture » ne doit PAS apparaître dans les cas A/B.'
        ]},
        { h: 'Talaj — Règle des 12 cartes', items: [
          'Un joueur ayant posé 12 cartes DOIT prendre la défausse du précédent si elle appartient à une combinaison exposée ; sinon +71 (le lanceur est exempté).',
          'Un joueur à main pleine ne PEUT PAS défausser une carte appartenant à une combinaison exposée si le suivant a 12 cartes ; violation + prise = +71 au lanceur.'
        ]},
        { h: 'Talaj — Épuisement, score et fin', items: [
          'Épuisement du talon : mélanger la défausse SEULEMENT (les combinaisons restent intactes).',
          'Score de fin : main pleine sans pose = +100 ; pose partielle = 10 points fixes par carte restante.',
          'Les pénalités s\'ajoutent au cumul et s\'affichent une fois avec leur raison.',
          'Fin de partie : objectif (501–1001) ; on perd en dépassant le cumul ; le gagnant reste en dessous ; pas de fin avant dépassement.'
        ]},
        { h: 'Sample (104 cartes)', items: [
          'Sans joker imprimé ; après la donne de 13 cartes, la première carte de la pioche est retournée = le « Fojok » ; sa contrepartie de couleur opposée et de même rang est le joker de la manche.',
          'Le joueur suivant le donneur commence.',
          'Fojok : chaque joueur peut le prendre uniquement à son premier tour ; non pris au premier cycle, le droit est perdu et il est mélangé à la défausse quand la pioche s\'épuise.',
          'Défausse : le joueur peut librement prendre la carte du dessus et se défausser d\'une autre — sans conditions d\'ouverture/de fin et sans pénalité ; cette carte n\'est PAS libre le même tour, elle le devient aux tours suivants.',
          'Rejet le même tour : prendre la carte de défausse ou le Fojok puis le rejeter le même tour est une faute — pénalité de +51 points ajoutée au score de la manche en fin de manche.',
          'Fojok rejeté : si un joueur prend le Fojok et le rejette le même tour, il devient une carte de défausse ordinaire — aucun autre joueur ne peut le prendre comme Fojok ; seul le joueur suivant peut le prendre comme défausse normale.',
          'Ouverture : suite libre + brelan libre (sans joker ni carte de défausse du même tour), total d\'ouverture ≥ 51 ; la carte de défausse prise peut légalement entrer dans une combinaison supplémentaire valide comptée dans les 51 — à condition qu\'elle ne soit pas un joker et ne figure pas dans les deux combinaisons libres essentielles ; les combinaisons avec joker ne comptent pas dans le seuil mais servent à dépasser le total de l\'ouvreur précédent ; si un joueur a déjà ouvert, votre total d\'ouverture doit être strictement supérieur à la plus haute ouverture précédente de la manche (l\'égalité est refusée).',
          'Le libre reste libre au tour d\'ouverture seulement : aucun joker ni carte de défausse du même tour ne peut être ajouté à une combinaison libre posée ce tour-là ; aux tours suivants, jokers et cartes de défausse peuvent rejoindre les combinaisons libres de l\'ouverture.',
          'Fin : suite libre + brelan libre + 13 cartes en combinaisons valides (avec ou sans le joker désigné) + la 14e carte de fin face cachée.',
          'À la fin, révélation : non-ouvreur = +51 ; ouvreur : cartes restantes à leur valeur faciale (V/D/R/As et joker = 10) ; si > 51 = +51.',
          'Ouverture invalide = +51, la manche continue.'
        ]}
      ],
      da: [
        { h: 'تعريفات عامة', items: [
          'الرموز: قلب/مربع حمر، سيف/عنب كحل. قيم الافتتاح: الرقم بقيمتو؛ J/Q/K/A = 10.',
          'مجموعة متشابهة: 3 أوراق ولا كتر بنفس العدد وبرموز مختلفة بلا تكرار.',
          'تسلسل: 3 أوراق ولا كتر متتابعين بنفس الرمز.',
          'الباكي = أوراق السحب؛ المرموق = أوراق الرمي.'
        ]},
        { h: 'الطلاح — التوزيع والدور', items: [
          '2–5 لعابا؛ 108 ورقة. أول موزع = صاحب أصغر ورقة؛ الدور يمشي لليمين.',
          '14 ورقة لكل لعاب و15 للموزع؛ الموزع يرمي اللولة.',
          'الدور: جبد ورقة وحدة (باكي ولا مرموق) وارمي ورقة وحدة بالضبط؛ اليد 14 بين الأدوار و15 فالدور.',
          '90 ثانية؛ ملي يسالي الوقت كيلعب الأوتوماتيك.'
        ]},
        { h: 'الطلاح — الافتتاح', items: [
          'جوج شروط: متشابهة ≥3 + تسلسل ≥3 والمجموع ≥ 71 بلا جوكر فالحساب.',
          'إلا كان افتتاح قبل: خاصك تفوت مجموع آخر مظهر.',
          'ورقة الموزع اللولة كتاخذ غير باش تكمل افتتاح ولا تسالي الشوط.',
          'إظهار بلا شروط = +71.',
          'أخذ ورقة بلا شروط = +71 وترجع الورقة.'
        ]},
        { h: 'الطلاح — الإضافة والجوكر', items: [
          'من بعد الشروط: زيد ورقة لأي مجموعة ظاهرة إلا جات قانونية بلا تكرار.',
          'الجوكر: ورقة وحدة من اليد كتزاد ولا كتتبدل بيه الجوكر.',
          'كل ورقة صالحة كتقبل وغير الصالحة كترفض برسالة وحدة.'
        ]},
        { h: 'الطلاح — إنهاء الشوط', items: [
          'حالة أ: 14 ورقة كلها مجموعات صالحة + الورقة 15 على ضهرها = ساليتي بلا شرط نقاط.',
          'حالة ب: جبدتي المرموق وساليتي = بلا شرط افتتاح.',
          'حالة ج: جبدتي المرموق وساليتي بزيادة ورقة لمجموعة لعاب آخر = خاصك الافتتاح وتفوت مجموع آخر منزل.',
          'ما كيبانش خطأ الافتتاح فالحالتين أ/ب.'
        ]},
        { h: 'الطلاح — قاعدة الـ12', items: [
          'لي نزل 12 ورقة خاصو ياخد ورقة السابق إلا كانت كتسالي مجموعة ظاهرة؛ غفل = +71.',
          'لي عندو يد كاملة ممنوع يرمي ورقة كتسالي مجموعة والتالي عندو 12؛ دارها = +71 عليه.'
        ]},
        { h: 'الطلاح — النفاد والحساب والنهاية', items: [
          'نفاد الباكي: تخبل المرموق غير، والمجموعات ما كتتمسش.',
          'حساب نهاية الشوط: يد كاملة بلا إنزال = +100؛ نزل شوية = كل ورقة متبقية 10 نقاط ثابتة.',
          'الجزاءات كتزيد للمجموع التراكمي وكتعرض مرة وحدة بالسبب.',
          'نهاية الجولة: الهدف (501–1001)؛ لي فوت التراكمي ديالو الهدف خسر، والرابح لي بقى تحتو.'
        ]},
        { h: 'السامبل (104 ورقة)', items: [
          'بلا جوكر مطبوع؛ من بعد ما يتوزعو 13 ورقة لكل واحد، كتنقلب اللولة من ورق التوزيع = «الفوجوك»، واللون المعكوس ديالها بنفس الرقم هو جوكر الدورة.',
          'اللعاب لي مور الموزع هو اللول.',
          'الفوجوك: أي لعاب يقدر ياخدها غير فالدور اللول ديالو؛ إلا ما تاخداتش فالدورة اللولة ضاع الحق فيها نهائياً، وكتخلط مع المرموق ملي يسالي ورق التوزيع وترجع تتسحب عادي.',
          'المرموق: اللعاب حر ياخد ورقة المرموق ويرمي ورقة خرى — بلا شروط افتتاح ولا إنهاء وبلا جزاء؛ ولكن ماشي حرة فنفس الدور — من بعد ما يرمي، كتولي من الأوراق الحرة ديالو فالأدوار الجاية.',
          'الرمية فنفس الدور: لي سحب ورقة المرموق ولا الفوجوك ورماها فنفس الدور راه غالط — كيتقيد عليه جزاء +51 نقطة كيتزاد على مجموع الدورة فآخر الشوط.',
          'الفوجوك المرمية: إلا سحب شي لعاب الفوجوك ورماها فنفس الدور، كتولي ورقة مرموق عادية — ماعندهمش الحق اللعابة الآخرين ياخدوها كفوجوك، غير مول الدور الجاي ياخدها كمرموق عادي.',
          'الافتتاح: تسلسل حر + متشابهة حرة (بلا جوكر وبلا ورقة مرموق ديال نفس الدور) ومجموع الافتتاح ≥ 51؛ يمكن دخل ورقة المرموق المسحوبة فمجموعة زايدة صالحة وكتحسب فالـ51 بشكل قانوني — بشرط ماتكونش جوكر وماتكونش فالتسلسل ولا المتشابهة الحرين الأساسيين؛ مجموعات الجوكر مادخلوش العتبة ولكن كيصلحو باش تفوت حساب المفتتح اللي قبل منك؛ وإلا سبق شي لاعب فتح، خاص مجموع الافتتاح ديالك يفوت أعلى افتتاح سبق فالشوط ولو بنقطة وحدة (التعادل مرفوض).',
          'الحرة كتبقى حرة غير فدور الافتتاح: ما يتزادش جوكر ولا مرموق نفس الدور فمجموعة حرة نزلات فنفس الدور؛ وفالأدوار الجاية يقدر يتزاد الجوكر وورقة المرموق فمجموعات الافتتاح الحرة.',
          'الإنهاء: تسلسل حر + متشابهة حرة + 13 ورقة كاملين فمجموعات صحيحة (بالجوكر المعين ولا بلاه) + ورقة الإنهاء 14 على ضهرها.',
          'فالآخر كيكشفو الكل: لي ما فتحش = +51؛ لي فتح كيتحسبو أوراقو بقيمتهم (J/Q/K/A والجوكر = 10)؛ إلا فاتو 51 = +51.',
          'خطأ الإظهار = +51 والشوط كيكمل.'
        ]}
      ]
    },
    payouts: {
      ar: '<tr><td>إنهاء الشوط (Finish)</td><td>0 نقطة جزاء (الفوز بالشوط)</td></tr><tr><td>إظهار/افتتاح خاطئ — طلاح</td><td>+71 نقطة جزاء</td></tr><tr><td>إظهار/افتتاح خاطئ — سامبل</td><td>+51 نقطة جزاء</td></tr><tr><td>أخذ ورقة دون شروط — طلاح</td><td>+71 (مع إرجاع الورقة)</td></tr><tr><td>سحب المرموق — سامبل</td><td>حر بلا جزاء (غير حرة في نفس الدور)</td></tr><tr><td>رمي المرموق/الفوجوك المسحوبة في نفس الدور — سامبل</td><td>+51 تضاف لمجموع الجولة في نهاية الشوط</td></tr><tr><td>مخالفة قاعدة الـ12 ورقة</td><td>+71</td></tr><tr><td>يد كاملة دون إنزال — طلاح</td><td>+100</td></tr><tr><td>يد كاملة دون إنزال — سامبل</td><td>+51</td></tr><tr><td>أوراق متبقية بعد إنزال جزئي — طلاح</td><td>10 نقاط ثابتة لكل ورقة</td></tr><tr><td>أوراق متبقية بعد إنزال جزئي — سامبل</td><td>قيمتها الوجهية (J/Q/K/A والجوكر = 10)</td></tr><tr><td>شوط مضاعف (إنهاء بجوكر حر معزول)</td><td>نقاط الأوراق المتبقية/اليد الكاملة ×2 (الجزاءات لا تُضاعف)</td></tr>',
      da: '<tr><td>إنهاء الشوط</td><td>0 نقطة جزاء (ربحتي الشوط)</td></tr><tr><td>إظهار خاطئ — طالاج</td><td>+71</td></tr><tr><td>إظهار خاطئ — سامبل</td><td>+51</td></tr><tr><td>أخذ ورقة بلا شروط — طالاج</td><td>+71 (وترجع الورقة)</td></tr><tr><td>سحب المرموق — سامبل</td><td>حر بلا جزاء (ماشي حرة فنفس الدور)</td></tr><tr><td>رمي المرموق/الفوجوك المسحوبة فنفس الدور — سامبل</td><td>+51 كتزاد على مجموع الدورة فآخر الشوط</td></tr><tr><td>قاعدة الـ12</td><td>+71</td></tr><tr><td>يد كاملة بلا إنزال — طالاج</td><td>+100</td></tr><tr><td>يد كاملة بلا إنزال — سامبل</td><td>+51</td></tr><tr><td>أوراق متبقية — طالاج</td><td>10 ثابتة لكل ورقة</td></tr><tr><td>أوراق متبقية — سامبل</td><td>قيمتها الوجهية (J/Q/K/A والجوكر = 10)</td></tr>',
      fr: '<tr><td>Finir la manche</td><td>0 point de pénalité (victoire)</td></tr><tr><td>Ouverture invalide — Talaj</td><td>+71 points</td></tr><tr><td>Ouverture invalide — Sample</td><td>+51 points</td></tr><tr><td>Prise de carte sans conditions — Talaj</td><td>+71 (carte rendue)</td></tr><tr><td>Prise de la défausse — Sample</td><td>Libre, sans pénalité (non libre le même tour)</td></tr><tr><td>Rejet de la défausse/du Fojok le même tour — Sample</td><td>+51 ajoutés au score de la manche en fin de manche</td></tr><tr><td>Violation de la règle des 12 cartes</td><td>+71</td></tr><tr><td>Main pleine sans pose — Talaj</td><td>+100</td></tr><tr><td>Main pleine sans pose — Sample</td><td>+51</td></tr><tr><td>Cartes restantes après pose partielle — Talaj</td><td>10 fixes par carte</td></tr><tr><td>Cartes restantes après pose partielle — Sample</td><td>Valeur faciale (V/D/R/As et joker = 10)</td></tr>',
      en: '<tr><td>Finish Round</td><td>0 penalty points (Round Win)</td></tr><tr><td>Invalid meld/opening — Talaj</td><td>+71 penalty points</td></tr><tr><td>Invalid meld/opening — Sample</td><td>+51 penalty points</td></tr><tr><td>Take card without conditions — Talaj</td><td>+71 (card returned)</td></tr><tr><td>Discard-pile draw — Sample</td><td>Free, no penalty (not free the same turn)</td></tr><tr><td>Same-turn throwback of drawn discard/Fojok — Sample</td><td>+51 added to the round score at round end</td></tr><tr><td>Violate 12-card rule</td><td>+71</td></tr><tr><td>Full hand without lay-down — Talaj</td><td>+100</td></tr><tr><td>Full hand without lay-down — Sample</td><td>+51</td></tr><tr><td>Remaining after partial lay-down — Talaj</td><td>Flat 10 per card</td></tr><tr><td>Remaining after partial lay-down — Sample</td><td>Face value (J/Q/K/A & Joker = 10)</td></tr><tr><td>Doubled round (free isolated Joker finish)</td><td>Remaining/full-hand points ×2 (penalties not doubled)</td></tr>'
    },
  },

rn: {
    name: { ar: 'روندا المغربية ♦️♠️', fr: 'Ronda Marocaine ♦️♠️', en: 'Moroccan Ronda ♦️♠️' },
    goal: {
      ar: 'خمّن البطاقة الصحيحة (رقم أو رقم + رمز) قبل الموزع للفوز بالجولة.',
      fr: 'Devinez la bonne carte (numéro ou numéro + symbole) avant le donneur pour gagner.',
      en: 'Guess the correct card (number or number + symbol) before the dealer to win the round.'
    },
    steps: {
      ar: [
        'اختر وضع التخمين: رقم فقط أو رقم + رمز',
        'اختر رقماً من الأوراق المغربية (1-7، 10-12) ثم أكّد اختيارك',
        'في وضع الرمز، اختر أيضاً الرمز: ◆ ذهب، ♥ كؤوس، ♠ سيوف، ♣ صولجان',
        'تُسحب الأوراق بالتناوب بينك وبين الموزع من رزمة 40 ورقة مغربية',
        'إذا ظهرت بطاقتك المختارة أولاً تفوز بالجولة وتتبادل الأدوار مع الموزع',
        'الفوز ضد الآلي أو وجهاً لوجه يبادل الأدوار؛ اللعب المحلي تدريب مجاني بلا رهان',
        'الرهان يُحدَّد حصرياً من طرف فاتح الغرفة في إعدادات الغرف أونلاين'
      ],
      fr: [
        'Choisissez le mode de devinette : numéro seul ou numéro + symbole',
        'Choisissez un numéro (1-7, 10-12) puis confirmez',
        'En mode symbole, choisissez aussi : ◆ Or, ♥ Coupes, ♠ Épées, ♣ Bâtons',
        'Les cartes sont tirées alternativement (jeu de 40 cartes marocaines)',
        'Si votre carte apparaît en premier, vous gagnez et les rôles s\'inversent',
        'Le jeu local (IA / face à face) est un entraînement gratuit sans mise',
        'La mise est fixée uniquement par le créateur de la salle en ligne'
      ],
      en: [
        'Choose the guess mode: number only or number + suit',
        'Pick a number (1-7, 10-12) and confirm',
        'In suit mode, also pick: ◆ Gold, ♥ Cups, ♠ Swords, ♣ Clubs',
        'Cards are drawn alternately between you and the dealer (40 Moroccan cards)',
        'If your card appears first, you win and roles swap',
        'Local play (vs AI / face to face) is free training without stakes',
        'The stake is set only by the room creator in online room settings'
      ]
    },
    payouts: {
      ar: '<tr><td>رقم فقط</td><td>تخمّن رقم الورقة (1-7، 10-12)</td></tr><tr><td>رقم + رمز</td><td>تخمّن الرقم والرمز معاً — تحدٍّ أدق</td></tr><tr><td>الرهان</td><td>يُحدَّد من فاتح الغرفة في إعدادات الغرف أونلاين</td></tr>',
      fr: '<tr><td>Numéro seul</td><td>Devinez le numéro (1-7, 10-12)</td></tr><tr><td>Numéro + Symbole</td><td>Devinez numéro et symbole — plus précis</td></tr><tr><td>Mise</td><td>Fixée par le créateur de la salle en ligne</td></tr>',
      en: '<tr><td>Number only</td><td>Guess the card number (1-7, 10-12)</td></tr><tr><td>Number + Symbol</td><td>Guess number and suit — sharper challenge</td></tr><tr><td>Stake</td><td>Set by the room creator in online rooms</td></tr>'
    },
  },
  /* ═══ Crash ═══ */
  av: {
    name: { ar: 'أفياتور كراش', fr: 'Aviator Crash', en: 'Aviator Crash' },
    goal: {
      ar: 'اسحب أرباحك قبل أن يتحطم المضاعف. كلما انتظرت أكثر، زاد الربح — لكن الخطر أيضاً!',
      fr: 'Encaissez avant que le multiplicateur ne crash. Plus vous attendez, plus vous gagnez — mais le risque aussi !',
      en: 'Cash out before the multiplier crashes. The longer you wait, the more you win — but so does the risk!'
    },
    steps: {
      ar: [
        'حدد مبلغ الرهان',
        'اضغط "ابدأ" لإقلاع الطائرة',
        'المضاعف يبدأ من 1.00× ويزداد',
        'اضغط "سحب" في أي وقت لأخذ الربح',
        'إذا تحطمت الطائرة قبل السحب، تخسر الرهان'
      ],
      fr: [
        'Définissez le montant du pari',
        'Cliquez sur "Démarrer" pour lancer l\'avion',
        'Le multiplicateur commence à 1.00× et augmente',
        'Cliquez sur "Encaisser" à tout moment pour prendre le gain',
        'Si l\'avion crash avant l\'encaissement, vous perdez le pari'
      ],
      en: [
        'Set your bet amount',
        'Click "Start" to launch the plane',
        'Multiplier starts at 1.00× and increases',
        'Click "Cash Out" anytime to take profit',
        'If the plane crashes before cashing out, you lose the bet'
      ]
    },
    payouts: {
      ar: '<tr><td>سحب عند 2.00×</td><td>×2 الرهان</td></tr><tr><td>سحب عند 5.00×</td><td>×5 الرهان</td></tr><tr><td>سحب عند 10.00×</td><td>×10 الرهان</td></tr>',
      fr: '<tr><td>Encaisser à 2.00×</td><td>×2 le pari</td></tr><tr><td>Encaisser à 5.00×</td><td>×5 le pari</td></tr><tr><td>Encaisser à 10.00×</td><td>×10 le pari</td></tr>',
      en: '<tr><td>Cash at 2.00×</td><td>×2 bet</td></tr><tr><td>Cash at 5.00×</td><td>×5 bet</td></tr><tr><td>Cash at 10.00×</td><td>×10 bet</td></tr>'
    },
  },
  /* ═══ Parchisi ═══ */
  pr: {
    name: { ar: 'بارشيسي', fr: 'Parchisi', en: 'Parchisi' },
    goal: {
      ar: 'أوّل لاعب يوصل كل قطعه الأربع إلى النهاية يفوز!',
      fr: 'Le premier joueur à amener ses 4 pièces à l\'arrivée gagne !',
      en: 'First player to bring all 4 pieces to the finish wins!'
    },
    steps: {
      ar: [
        'ارمِ النرد للتحرك',
        'الخروج من القاعدة يتطلب نرد 5',
        'النرد 6 = رمية إضافية (حتى 3 رميات متتالية)',
        '3 ستات متتالية = كارثة: آخر قطعة تحركت تعود للقاعدة',
        'لا قطع في القاعدة + نرد 6 = حركة 7 خانات',
        '12 خلية آمنة (4 ساليدات + 8): لا أكل فيها',
        'أكل قطعة خصم وحيدة = +20 خانة للقطعة الآكلة',
        'قطعتان من لونك في خلية = حاجز يمنع مرور الخصوم والهبوط فوقه — رمي 6 يلزمك بتحريكه',
        'الدخول للميتا بنرد مضبوط — إدخال قطعة = +10 لقطعة أخرى',
        'أول من يُدخل قطعه الأربع يفوز'
      ],
      fr: [
        'Lancez le dé pour avancer',
        'Il faut un 5 pour sortir une pièce de la base',
        'Un 6 donne un lancer supplémentaire (max 3 lancers)',
        '3 six consécutifs = catastrophe : la dernière pièce déplacée rentre à la base',
        'Aucune pièce en base + 6 = avance de 7 cases',
        '12 cases sûres (4 sorties + 8) : aucune capture',
        'Capturer une pièce seule = +20 cases pour la pièce qui capture',
        'Deux pièces de même couleur = barrage bloquant passage et atterrissage — un 6 oblige à l\'ouvrir',
        'Entrée à la maison avec un score exact — entrer une pièce = +10 pour une autre',
        'Le premier à entrer ses 4 pièces gagne'
      ],
      en: [
        'Roll the dice to move',
        'You need a 5 to bring a piece out of base',
        'A 6 grants an extra roll (max 3 rolls in a row)',
        '3 consecutive 6s = disaster: the last moved piece returns to base',
        'No pieces in base + roll 6 = move 7 squares',
        '12 safe cells (4 exits + 8): no capture there',
        'Capturing a lone piece = +20 squares for the capturing piece',
        'Two same-color pieces on a cell = barrier blocking passage and landing — rolling 6 forces you to move it',
        'Enter home with an exact roll — entering a piece = +10 for another',
        'First to bring all 4 pieces home wins'
      ]
    },
    payouts: {
      ar: '<tr><td>فوز (لاعبان)</td><td>×1.9 الرهان</td></tr><tr><td>فوز (ثلاثة)</td><td>×2.85 الرهان</td></tr><tr><td>فوز (أربعة)</td><td>×3.8 الرهان</td></tr><tr><td>خسارة</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>Victoire (2 joueurs)</td><td>×1.9 la mise</td></tr><tr><td>Victoire (3 joueurs)</td><td>×2.85 la mise</td></tr><tr><td>Victoire (4 joueurs)</td><td>×3.8 la mise</td></tr><tr><td>Défaite</td><td>Perte de la mise</td></tr>',
      en: '<tr><td>Win (2 players)</td><td>×1.9 bet</td></tr><tr><td>Win (3 players)</td><td>×2.85 bet</td></tr><tr><td>Win (4 players)</td><td>×3.8 bet</td></tr><tr><td>Loss</td><td>Lose bet</td></tr>'
    },
  },
  /* ═══ Coin Flip 3D ═══ */
  cf: {
    name: { ar: 'قلب العملة 3D', fr: 'Coin Flip 3D', en: 'Coin Flip 3D' },
    goal: {
      ar: 'اختر وجه العملة أو كتابتها. إذا طابق اختيارك النتيجة بعد الدوران، تربح!',
      fr: 'Choisissez pile ou face. Si votre choix correspond après la rotation, vous gagnez !',
      en: 'Pick heads or tails. If your choice matches after the spin, you win!'
    },
    steps: {
      ar: [
        'اختر "🪙 Heads" أو "Tails"',
        'اضغط على اختيارك لقلب العملة',
        'العملة تدور 3D وتستقر على وجه عشوائي',
        'تطابق الاختيار = ربح ×1.95'
      ],
      fr: [
        'Choisissez "🪙 Heads" ou "Tails"',
        'Cliquez pour lancer la pièce',
        'La pièce tourne en 3D et retombe sur une face aléatoire',
        'Correspondance = gain ×1.95'
      ],
      en: [
        'Choose "🪙 Heads" or "Tails"',
        'Click to flip the coin',
        'The coin spins in 3D and lands on a random face',
        'Match = win ×1.95'
      ]
    },
    payouts: {
      ar: '<tr><td>تطابق الوجه المختار</td><td>×1.95</td></tr><tr><td>عدم التطابق</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>Face choisie</td><td>×1.95</td></tr><tr><td>Pas de correspondance</td><td>Perte du pari</td></tr>',
      en: '<tr><td>Chosen side matches</td><td>×1.95</td></tr><tr><td>No match</td><td>Lose bet</td></tr>'
    },
  },
  /* ═══ Hi-Lo Cards ═══ */
  hl: {
    name: { ar: 'هاي لو كاردز', fr: 'Hi-Lo Cartes', en: 'Hi-Lo Cards' },
    goal: {
      ar: 'خمّن ما إذا كانت البطاقة التالية أعلى أم أقل من البطاقة الحالية.',
      fr: 'Devinez si la carte suivante est plus haute ou plus basse que la carte actuelle.',
      en: 'Guess whether the next card is higher or lower than the current card.'
    },
    steps: {
      ar: [
        'تظهر بطاقة البداية تلقائياً عند فتح اللعبة',
        'اضغط "أعلى" أو "أقل" لتوقع البطاقة التالية',
        'تُسحب بطاقة جديدة من المجموعة',
        'تساوي القيم = تعادل (استرداد الرهان)',
        'تخمين صحيح = ربح ×1.9'
      ],
      fr: [
        'La carte de départ est distribuée automatiquement à l\'ouverture',
        'Cliquez sur "Plus haut" ou "Plus bas" pour prédire',
        'Une nouvelle carte est tirée du jeu',
        'Valeurs égales = égalité (pari remboursé)',
        'Bonne prédiction = gain ×1.9'
      ],
      en: [
        'The starting card is dealt automatically when the game opens',
        'Click "Higher" or "Lower" to predict the next card',
        'A new card is drawn from the deck',
        'Equal values = push (bet refunded)',
        'Correct guess = win ×1.9'
      ]
    },
    payouts: {
      ar: '<tr><td>تخمين صحيح</td><td>×1.9</td></tr><tr><td>تعادل (نفس القيمة)</td><td>استرداد</td></tr><tr><td>تخمين خاطئ</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>Bonne prédiction</td><td>×1.9</td></tr><tr><td>Égalité (même valeur)</td><td>Remboursé</td></tr><tr><td>Mauvaise prédiction</td><td>Perte du pari</td></tr>',
      en: '<tr><td>Correct guess</td><td>×1.9</td></tr><tr><td>Push (same value)</td><td>Refund</td></tr><tr><td>Wrong guess</td><td>Lose bet</td></tr>'
    },
  },
  /* ═══ Rock Paper Scissors ═══ */
  rp: {
    name: { ar: 'حجر ورقة مقص', fr: 'Pierre Papier Ciseaux', en: 'Rock Paper Scissors' },
    goal: {
      ar: 'اهزم الحاسوب في حجر/ورقة/مقص: الحجر يكسر المقص، المقص يقطع الورقة، الورقة تغطي الحجر.',
      fr: 'Battez l\'IA à pierre/papier/ciseaux : la pierre bat les ciseaux, les ciseaux coupent le papier, le papier couvre la pierre.',
      en: 'Beat the computer at rock/paper/scissors: rock crushes scissors, scissors cut paper, paper covers rock.'
    },
    steps: {
      ar: [
        'اختر ✊ حجر أو ✋ ورقة أو ✌️ مقص',
        'الحاسوب يختار عشوائياً في نفس اللحظة',
        'قارن الاختيارين حسب القاعدة',
        'فوز = ×1.95، تعادل = استرداد، خسارة = خسارة الرهان'
      ],
      fr: [
        'Choisissez ✊ pierre, ✋ papier ou ✌️ ciseaux',
        'L\'IA choisit au hasard au même moment',
        'Comparez les deux choix selon la règle',
        'Victoire = ×1.95, égalité = remboursé, défaite = perte'
      ],
      en: [
        'Choose ✊ rock, ✋ paper, or ✌️ scissors',
        'The AI picks randomly at the same moment',
        'Compare the two choices using the rule',
        'Win = ×1.95, tie = refund, loss = lose bet'
      ]
    },
    payouts: {
      ar: '<tr><td>فوز</td><td>×1.95</td></tr><tr><td>تعادل</td><td>استرداد الرهان</td></tr><tr><td>خسارة</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>Victoire</td><td>×1.95</td></tr><tr><td>Égalité</td><td>Pari remboursé</td></tr><tr><td>Défaite</td><td>Perte du pari</td></tr>',
      en: '<tr><td>Win</td><td>×1.95</td></tr><tr><td>Tie</td><td>Bet refunded</td></tr><tr><td>Loss</td><td>Lose bet</td></tr>'
    },
  },
  /* ═══ Penalty Shootout ═══ */
  pn: {
    name: { ar: 'ركلات الترجيح', fr: 'Penalty Shootout', en: 'Penalty Shootout' },
    goal: {
      ar: 'سجّل ركلة الجزاء: اختر الاتجاه بينما يغوص الحارس. جهة مختلفة عن الحارس = هدف ×1.45!',
      fr: 'Marquez le penalty : choisissez la direction pendant que le gardien plonge. Direction différente du gardien = but ×1.45 !',
      en: 'Score the penalty: pick a direction while the keeper dives. A different direction from the keeper = goal ×1.45!'
    },
    steps: {
      ar: [
        'حدد مبلغ الرهان',
        'اختر جهة التسديد: ⬅️ يسار، ⬆️ وسط، ➡️ يمين',
        'الحارس يختار جهة عشوائياً',
        'جهات مختلفة = هدف ×1.45',
        'نفس الجهة = تصدي وخسارة',
        'الاحتمال: تسجيل 2 من 3 (الحارس 3 جهات) — RTP 96.7%'
      ],
      fr: [
        'Définissez le montant du pari',
        'Choisissez la direction : ⬅️ gauche, ⬆️ centre, ➡️ droite',
        'Le gardien choisit une direction aléatoire',
        'Directions différentes = but ×1.45',
        'Même direction = arrêt et perte',
        'Chances : marquer 2 fois sur 3 (gardien : 3 directions) — RTP 96.7%'
      ],
      en: [
        'Set your bet amount',
        'Choose the direction: ⬅️ left, ⬆️ center, ➡️ right',
        'The keeper picks a random direction',
        'Different directions = goal ×1.45',
        'Same direction = save and loss',
        'Odds: score 2 out of 3 (keeper has 3 directions) — RTP 96.7%'
      ]
    },
    payouts: {
      ar: '<tr><td>هدف (جهة مختلفة عن الحارس)</td><td>×1.45</td></tr><tr><td>تصدي (نفس الجهة)</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>But (direction différente)</td><td>×1.45</td></tr><tr><td>Arrêt (même direction)</td><td>Perte du pari</td></tr>',
      en: '<tr><td>Goal (different direction)</td><td>×1.45</td></tr><tr><td>Save (same direction)</td><td>Lose bet</td></tr>'
    },
  },
  /* ═══ Keno ═══ */
  ke: {
    name: { ar: 'كينو', fr: 'Keno', en: 'Keno' },
    goal: {
      ar: 'اختر من 1 إلى 10 أرقام من 1 إلى 80. يُسحب 20 رقماً عشوائياً — كلما زادت مطابقاتك، زاد المضاعف!',
      fr: 'Choisissez 1 à 10 numéros de 1 à 80. 20 numéros sont tirés au hasard — plus de correspondances, plus le multiplicateur est élevé !',
      en: 'Pick 1 to 10 numbers from 1 to 80. 20 numbers are drawn at random — the more matches, the higher the multiplier!'
    },
    steps: {
      ar: [
        'اضغط على الأرقام لتحديدها (من 1 إلى 10 أرقام)',
        'اضغط "سحب!" لبدء القرعة — يُخصم الرهان',
        'يُسحب 20 رقماً من 1 إلى 80 بالتتابع',
        'تُحتسب مطابقاتك مع الأرقام المسحوبة',
        'المضاعف حسب عدد المطابقات وعدد الأرقام المختارة (RTP ≈ 95%)'
      ],
      fr: [
        'Cliquez sur les numéros pour les choisir (1 à 10)',
        'Cliquez sur "Tirer !" pour lancer le tirage — la mise est déduite',
        '20 numéros sont tirés de 1 à 80 un par un',
        'Vos correspondances avec les numéros tirés sont comptées',
        'Le multiplicateur dépend des correspondances et du nombre choisi (RTP ≈ 95%)'
      ],
      en: [
        'Click numbers to select them (1 to 10)',
        'Click "DRAW!" to start the draw — the bet is deducted',
        '20 numbers are drawn from 1 to 80 one by one',
        'Your matches with the drawn numbers are counted',
        'The multiplier depends on matches and numbers picked (RTP ≈ 95%)'
      ]
    },
    payouts: {
      ar: '<tr><th colspan="2">مضاعفات الرهان (GB)</th></tr><tr><td><b>1</b> رقم: 1 → ×3.8</td></tr><tr><td><b>2</b> رقمان: 1 → ×1 · 2 → ×10</td></tr><tr><td><b>3</b> أرقام: 2 → ×3 · 3 → ×38</td></tr><tr><td><b>4</b> أرقام: 2 → ×1 · 3 → ×9 · 4 → ×100</td></tr><tr><td><b>5</b> أرقام: 3 → ×4 · 4 → ×26 · 5 → ×448</td></tr><tr><td><b>6</b> أرقام: 3 → ×2 · 4 → ×9 · 5 → ×85 · 6 → ×1324</td></tr><tr><td><b>7</b> أرقام: 4 → ×6 · 5 → ×39 · 6 → ×270 · 7 → ×4199</td></tr><tr><td><b>8</b> أرقام: 4 → ×3 · 5 → ×18 · 6 → ×98 · 7 → ×684 · 8 → ×8924</td></tr><tr><td><b>9</b> أرقام: 5 → ×10 · 6 → ×63 · 7 → ×313 · 8 → ×2170 · 9 → ×28930</td></tr><tr><td><b>10</b> أرقام: 5 → ×5 · 6 → ×28 · 7 → ×154 · 8 → ×794 · 9 → ×4205 · 10 → ×56061</td></tr>',
      fr: '<tr><th colspan="2">Multiplicateurs de la mise (GB)</th></tr><tr><td><b>1</b> numéro : 1 → ×3,8</td></tr><tr><td><b>2</b> numéros : 1 → ×1 · 2 → ×10</td></tr><tr><td><b>3</b> numéros : 2 → ×3 · 3 → ×38</td></tr><tr><td><b>4</b> numéros : 2 → ×1 · 3 → ×9 · 4 → ×100</td></tr><tr><td><b>5</b> numéros : 3 → ×4 · 4 → ×26 · 5 → ×448</td></tr><tr><td><b>6</b> numéros : 3 → ×2 · 4 → ×9 · 5 → ×85 · 6 → ×1324</td></tr><tr><td><b>7</b> numéros : 4 → ×6 · 5 → ×39 · 6 → ×270 · 7 → ×4199</td></tr><tr><td><b>8</b> numéros : 4 → ×3 · 5 → ×18 · 6 → ×98 · 7 → ×684 · 8 → ×8924</td></tr><tr><td><b>9</b> numéros : 5 → ×10 · 6 → ×63 · 7 → ×313 · 8 → ×2170 · 9 → ×28930</td></tr><tr><td><b>10</b> numéros : 5 → ×5 · 6 → ×28 · 7 → ×154 · 8 → ×794 · 9 → ×4205 · 10 → ×56061</td></tr>',
      en: '<tr><th colspan="2">Bet multipliers (GB)</th></tr><tr><td><b>1</b> number: 1 → ×3.8</td></tr><tr><td><b>2</b> numbers: 1 → ×1 · 2 → ×10</td></tr><tr><td><b>3</b> numbers: 2 → ×3 · 3 → ×38</td></tr><tr><td><b>4</b> numbers: 2 → ×1 · 3 → ×9 · 4 → ×100</td></tr><tr><td><b>5</b> numbers: 3 → ×4 · 4 → ×26 · 5 → ×448</td></tr><tr><td><b>6</b> numbers: 3 → ×2 · 4 → ×9 · 5 → ×85 · 6 → ×1324</td></tr><tr><td><b>7</b> numbers: 4 → ×6 · 5 → ×39 · 6 → ×270 · 7 → ×4199</td></tr><tr><td><b>8</b> numbers: 4 → ×3 · 5 → ×18 · 6 → ×98 · 7 → ×684 · 8 → ×8924</td></tr><tr><td><b>9</b> numbers: 5 → ×10 · 6 → ×63 · 7 → ×313 · 8 → ×2170 · 9 → ×28930</td></tr><tr><td><b>10</b> numbers: 5 → ×5 · 6 → ×28 · 7 → ×154 · 8 → ×794 · 9 → ×4205 · 10 → ×56061</td></tr>'
    },
  },
  /* ═══ Poker ═══ */
  poker: {
    name: { ar: 'بوكر', fr: 'Poker', en: 'Poker' },
    goal: {
      ar: 'اضغط ابدأ ثم اختر بطاقة واحدة من خمس. ثلاث بطاقات ملكية A♠/K♥/Q♦ تربح بمضاعفها وبطاقتان منخفضتان 2♣ تُخسران الرهان.',
      fr: 'Appuyez sur Démarrer puis choisissez une carte parmi cinq. Trois cartes royales A♠/K♥/Q♦ gagnent leur multiplicateur, deux cartes basses 2♣ font perdre la mise.',
      en: 'Press Start then pick one card out of five. Three royal cards A♠/K♥/Q♦ pay their multiplier, two low cards 2♣ lose the bet.'
    },
    steps: {
      ar: ['اضغط زر «وزّع البطاقات» (يُسحب الرهان)', 'اختر إحدى البطاقات الخمس', 'تُكشف البطاقات: ملكية ربح / 2♣ خسارة', 'الجوائز: A♠ ×1.4 / K♥ ×1.6 / Q♦ ×1.75'],
      fr: ['Appuyez sur « Distribuer » (la mise est débitée)', 'Choisissez l\'une des cinq cartes', 'Les cartes sont révélées : royales gagnent / 2♣ perd', 'Prix : A♠ ×1,4 / K♥ ×1,6 / Q♦ ×1,75'],
      en: ['Press Deal cards (bet is taken)', 'Pick one of the five cards', 'Cards are revealed: royal win / 2♣ loses', 'Prizes: A♠ ×1.4 / K♥ ×1.6 / Q♦ ×1.75']
    },
    payouts: {
      ar: '<tr><td>آس البستوني A♠</td><td>×1.4</td></tr><tr><td>ملك القلوب K♥</td><td>×1.6</td></tr><tr><td>ملكة الديناري Q♦</td><td>×1.75</td></tr><tr><td>بطاقة منخفضة 2♣</td><td>×0</td></tr>',
      fr: '<tr><td>As de pique A♠</td><td>×1,4</td></tr><tr><td>Roi de cœur K♥</td><td>×1,6</td></tr><tr><td>Dame de carreau Q♦</td><td>×1,75</td></tr><tr><td>Carte basse 2♣</td><td>×0</td></tr>',
      en: '<tr><td>Ace of spades A♠</td><td>×1.4</td></tr><tr><td>King of hearts K♥</td><td>×1.6</td></tr><tr><td>Queen of diamonds Q♦</td><td>×1.75</td></tr><tr><td>Low card 2♣</td><td>×0</td></tr>'
    },
  },
  /* ═══ [BGDO] الطاولة — Backgammon (bg) ═══ */
  bg: {
    name: {
      ar: 'الطاولة 🎲',
      da: 'الطاولة ديال الجوز والنرد 🎲',
      fr: 'Tawla — Backgammon 🎲',
      en: 'Backgammon — Tawla 🎲'
    },
    goal: {
      ar: 'انقل أحجارك الخمسة عشر حول الرقعة إلى بيتك ثم أخرِجها كلها قبل خصمك — والفوز بمارس أو باك جامون يضاعف نقاط الجولة.',
      da: 'دور الجوج ديالك الخمسة عشر على الرقعة حتى لدار ديالك ومن بعد أخرجهم كاملين قبل الخصم — ومارس ولا باك جامون كيضاعفو نقط الجولة.',
      fr: 'Faites le tour du plateau avec vos quinze dames jusqu\'à votre zone, puis sortez-les toutes avant votre adversaire — un gammon ou un backgammon double les points de la manche.',
      en: 'Race your fifteen checkers around the board into your home quadrant, then bear them all off before your opponent — a gammon or backgammon doubles the game points.'
    },
    steps: {
      ar: [
        'الافتتاح: كل لاعب يرمي نرداً واحداً — الأعلى يبدأ ويلعب برقمي النردَين معاً (والتعادل يُعاد).',
        'الحركة: كل نرد حركة مستقلة، والدبل يمنح 4 حركات — لا هبوط على نقطة فيها حجاران للخصم.',
        'الضرب: الحجر المفرد يُضرب إلى الأدمن (الحاجز) — ولا حركة قبل إدخال كل أحجار الأدمن (نقطة مغلقة = دور ضائع).',
        'الإخراج: لا يبدأ إلا بوجود كل الأحجار في البيت — بالرقم المطابق لمسافة الحجر أو برقم أكبر إن لم توجد أحجار أبعد.',
        'النرد الإجباري: يجب استخدام أكبر عدد ممكن من النردات — وإن أمكن واحدة فوجب استخدام الأكبر.',
        'الحسم: فوز عادي ×1 — مارس (خصمك لم يُخرج شيئاً) ×2 — باك جامون (وحجر له في بيتك أو على الأدمن) ×3.',
        'المباراة: أول من يجمع طول المباراة (1/3/5 نقاط) يفوز — بلا مكعب مضاعفة في هذه النسخة.'
      ],
      da: [
        'البداية: كل واحد كيرمي نرد واحد — الأعلى كيبدا وكيدير بجوج نْيَمْ مع بعضهم.',
        'الحركة: كل نرد حركة بوحدو، والدبل كيعطي 4 حركات — ما كتهبطش على نقطة فيها جوج حجور ديال الخصم.',
        'الضرب: الحجر بوحدو كيتضرب للأدمن — وما كاين حركة قبل ما تدخل كلش من الأدمن.',
        'الإخراج: ما كيبدا حتى يكون كلشي فالدار — بالرقم المطابق ولا بالأكبر إلا ما كانش حجر أبعد.',
        'خاصك تستعمل أكبر عدد ممكن من النردات — وإلا أمكنت وحدة خاصك تستعمل الكبيرة.',
        'الحسم: عادي ×1 — مارس ×2 — باك جامون ×3.',
        'الماتش: أول واحد كيجمع الطول (1/3/5) كيربح.'
      ],
      fr: [
        'Ouverture : chaque joueur lance un dé — le plus haut commence et joue les deux numéros ensemble (égalité = relancer).',
        'Déplacement : chaque dé est un coup indépendant, un double donne 4 coups — pas d\'atterrissage sur un point tenu par deux dames adverses.',
        'Frappe : une dame isolée est envoyée à la barre — aucun coup avant d\'avoir rentré toutes les dames (point fermé = tour perdu).',
        'Sortie : impossible avant que toutes les dames soient dans la zone — par le numéro exact, ou un plus grand s\'il ne reste aucune dame plus lointaine.',
        'Dés obligatoires : jouez le maximum de dés possible — si un seul, jouez le plus grand.',
        'Résultat : victoire simple ×1 — gammon (adversaire sorti de rien) ×2 — backgammon (dame adverse dans votre zone ou à la barre) ×3.',
        'Match : le premier à atteindre la longueur du match (1/3/5 points) gagne — pas de cube de doubler dans cette version.'
      ],
      en: [
        'Opening: each player rolls one die — the higher starts and plays both numbers together (a tie re-rolls).',
        'Movement: each die is an independent move, a double grants 4 moves — no landing on a point held by two enemy checkers.',
        'Hitting: a lone checker is sent to the bar — no move until every bar checker re-enters (a closed point loses the turn).',
        'Bearing off: only when all your checkers are home — by the exact die, or a larger one if no farther checker exists.',
        'Forced play: use the maximum number of dice possible — if only one, play the larger.',
        'Result: single win ×1 — gammon (opponent bore off nothing) ×2 — backgammon (a checker in your home or on the bar) ×3.',
        'Match: first to reach the match length (1/3/5 points) wins — no doubling cube in this version.'
      ]
    },
    payouts: {
      ar: '<tr><td>فوز المباراة — مبتدئ</td><td>الرهان ×1.5</td></tr><tr><td>فوز المباراة — متوسط</td><td>الرهان ×2</td></tr><tr><td>فوز المباراة — خبير</td><td>الرهان ×3</td></tr><tr><td>خسارة أو انسحاب</td><td>خسارة الرهان</td></tr>',
      da: '<tr><td>ربح الماتش — ساهل</td><td>الرهان ×1.5</td></tr><tr><td>ربح الماتش — وسط</td><td>الرهان ×2</td></tr><tr><td>ربح الماتش — خبير</td><td>الرهان ×3</td></tr><tr><td>خسارة ولا انسحاب</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>Match gagné — Facile</td><td>Mise ×1,5</td></tr><tr><td>Match gagné — Moyen</td><td>Mise ×2</td></tr><tr><td>Match gagné — Expert</td><td>Mise ×3</td></tr><tr><td>Défaite ou abandon</td><td>Perte de la mise</td></tr>',
      en: '<tr><td>Match won — Easy</td><td>Bet ×1.5</td></tr><tr><td>Match won — Medium</td><td>Bet ×2</td></tr><tr><td>Match won — Expert</td><td>Bet ×3</td></tr><tr><td>Loss or resign</td><td>Bet lost</td></tr>'
    },
  },
  /* ═══ [BGDO] الضومنة — Dominoes (do) ═══ */
  do: {
    name: {
      ar: 'الضومنة 🁫',
      da: 'الضومنة ديال القهاوة 🁫',
      fr: 'Domino Marocain — Double-Six 🁫',
      en: 'Moroccan Dominoes — Double-Six 🁫'
    },
    goal: {
      ar: 'أفرغ يدك من قطع الدومينو قبل خصمك أو اجمع أقل النقاط عند الانسداد — وأول من يبلغ النقاط المستهدفة (50-200) يفوز بالمباراة.',
      da: 'خوي يدك من القطع قبل الخصم ولا جمع أقل النقط ملي تسدات اللعبة — وأول واحد كيوصل للهدف (50-200) كيربح الماتش.',
      fr: 'Videz votre main de dominos avant l\'adversaire, ou totalisez le moins de points au blocage — le premier à la cible (50-200) gagne le match.',
      en: 'Empty your hand of dominoes before your opponent, or hold the fewest pips when the game blocks — first to the target score (50-200) wins the match.'
    },
    steps: {
      ar: [
        'المجموعة: Double-Six من 28 قطعة فريدة — 7 قطع لكل لاعب والـ 14 الباقية «البنك».',
        'البداية: يبدأ صاحب أعلى دبل ويلعبه إلزامياً — وإن لم يوجد دبل بدأ صاحب أثقل قطعة بحرة الاختيار.',
        'الحركة: القطعة قانونية إذا طابقت إحدى قيميها أحد طرفي السلسلة — الدبل يوضع عرضياً ولا يفتح طرفاً ثالثاً.',
        'السحب: بلا حركة؟ اسحب من البنك قطعةً قطعة حتى تصل قطعة صالحة ثم العبها فوراً (نمط Block بلا سحب).',
        'التمرير: بنك فارغ بلا حركة؟ مرّر الدور — وتمريران متتاليان = انسداد وتنتهي الجولة.',
        'الحساب: إفراغ اليد تأخذ مجموع نقاط يد خصمك — والانسداد يفوز صاحب اليد الأخف بالفرق، والتعادل بلا نقاط.'
      ],
      da: [
        'المجموعة: Double-Six ديال 28 قطعة — 7 لكل لعاب والـ 14 الباقية «البنك».',
        'البداية: صاحب أكبر دبل كيبدا وكيضطر يلعبو — وإلا ما كانش دبل، صاحب أثقل قطعة كيبدا وكيختار.',
        'الحركة: القطعة صالحة إلا وافقت شي قيمة ديالها مع طرف من السلسلة — والدبل كيتحط بالعرض وماكيفتحش طرف ثالث.',
        'السحب: ما عندك حركة؟ جبد من البنك حتى توصلك قطعة صالحة وتلعبها دغيا (Block: بلا سحب).',
        'التمرير: البنك خاوي وما كاين حركة؟ دوز الدور — وجوج تمريرات = تسداد وتسالي الجولة.',
        'الحساب: لي خلص يده كياخذ مجموع نقط يد الخصم — والتسداد كيربح صاحب اليد الخفيفة بالفرق.'
      ],
      fr: [
        'Le jeu : Double-Six de 28 tuiles uniques — 7 par joueur, les 14 restantes forment le talon.',
        'Départ : le plus grand double commence et doit le jouer — sinon le joueur à la tuile la plus lourde ouvre librement.',
        'Coup : une tuile est légale si l\'une de ses valeurs correspond à une extrémité de la chaîne — le double se pose en travers et n\'ouvre pas de troisième bout.',
        'Pioche : sans coup, piochez au talon jusqu\'à une tuile jouable, puis jouez-la immédiatement (mode Bloc : sans pioche).',
        'Passe : talon vide sans coup ? Passez — deux passes successives bloquent la manche.',
        'Score : vider sa main rapporte le total de la main adverse — au blocage, la main la plus légère gagne la différence (égalité : aucun point).'
      ],
      en: [
        'The set: a Double-Six of 28 unique tiles — 7 per player, the remaining 14 form the boneyard.',
        'Start: the highest double begins and must play it — with no double, the heaviest tile opens with a free choice.',
        'Play: a tile is legal when either of its values matches an open chain end — doubles sit crosswise and open no third end.',
        'Drawing: no move? Draw from the boneyard one tile at a time until playable, then play it at once (Block mode: no drawing).',
        'Passing: empty boneyard and no move? Pass — two consecutive passes block the round.',
        'Scoring: going out takes the opponent\'s hand total — at a block, the lighter hand wins the difference (a tie scores nothing).'
      ]
    },
    payouts: {
      ar: '<tr><td>فوز المباراة — مبتدئ</td><td>الرهان ×1.5</td></tr><tr><td>فوز المباراة — متوسط</td><td>الرهان ×2</td></tr><tr><td>فوز المباراة — خبير</td><td>الرهان ×3</td></tr><tr><td>خسارة أو انسحاب</td><td>خسارة الرهان</td></tr>',
      da: '<tr><td>ربح الماتش — ساهل</td><td>الرهان ×1.5</td></tr><tr><td>ربح الماتش — وسط</td><td>الرهان ×2</td></tr><tr><td>ربح الماتش — خبير</td><td>الرهان ×3</td></tr><tr><td>خسارة ولا انسحاب</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>Match gagné — Facile</td><td>Mise ×1,5</td></tr><tr><td>Match gagné — Moyen</td><td>Mise ×2</td></tr><tr><td>Match gagné — Expert</td><td>Mise ×3</td></tr><tr><td>Défaite ou abandon</td><td>Perte de la mise</td></tr>',
      en: '<tr><td>Match won — Easy</td><td>Bet ×1.5</td></tr><tr><td>Match won — Medium</td><td>Bet ×2</td></tr><tr><td>Match won — Expert</td><td>Bet ×3</td></tr><tr><td>Loss or resign</td><td>Bet lost</td></tr>'
    },
  },
  /* ═══ البلياردو — الأصناف الخمسة (R8: زر القواعد داخل اللعبة كان ميتاً) ═══ */
  bl8: {
    name: { ar: '8-بول 🎱', da: 'L8-Ball 🎱', fr: '8-Ball 🎱', en: '8-Ball Pool 🎱' },
    goal: {
      ar: 'قوانين WPA: لاعبان (أحمر ضد الأصفر) — من يُسقط مجموعته السبعة أولاً ثم الكرة السوداء 8 بنظافة يفوز بالإطار؛ إسقاط السوداء مبكراً أو مع الكرة البيضاء = خسارة فورية.',
      da: 'Joueurs 2 (7mer dd 9ssaf) — li ynqes l 7 dyalo lwlin w mn b3d l kahla 8 b nqa9a yrbah; kahla bkrik wla m3a l bidha = khssara.',
      fr: 'Deux joueurs (rouges contre jaunes) — descendre ses 7 boules puis la noire 8 proprement pour gagner ; noire trop tôt ou avec la blanche = défaite.',
      en: 'WPA rules: two players (reds vs yellows) — pot your seven balls then the black 8 cleanly to win; early black or a scratch on it loses the frame.'
    },
    steps: {
      ar: ['الكسر: تُرتب 15 كرة في المثلث والبيضاء من خلف خط الرأس — هدف الكسر إخراج 4 كرات أو إرجاع كرتين للوسادة.', 'المجموعات: أول كرة مسقطة قانونياً بعد الكسر تحدد مجموعتك (مزيج في الكسر يُعاد الكسر).', 'الضربة: البيضاء يجب أن تلمس أولاً كرة من مجموعتك — لا لمس = خطأ (كرة يد للخصم خلف أي وسادة).', 'بعد خطأ الخصم: كرة يد — تضع البيضاء حيث تشاء وتلعب أي اتجاه.', 'السوداء 8: قانونية فقط بعد إسقاط مجموعتك كاملة — التسمية غير مطلوبة.', 'إسقاط السوداء مبكراً أو مع البيضاء أو قذفها خارج الطاولة = خسارة الإطار.'],
      da: ['Lksr: 15 kora f l motalat w l bidha mor l khat — lhadaf nkhrj 4 wla nrdd 2 l l وسادة.', 'Lmajmo3at: awla kora msqota b7okan ba3d l ksr kat7dd l majmo3a dyalk.', 'Dharba: l bidha khsaha tlmss kora mn l majmo3a dyalk — ila la ghalta (kora yd l l khssim).', 'Ba3d ghalta: kora yd — tdir l bidda fin bghiti.', 'Lkahla 8: m3qola ghir mn b3d ma tkml l majmo3a — ma kayn tasmia.', 'Kahla bkrik wla m3a l bidha = khssara.'],
      fr: ['Casse : 15 boules en triangle, blanche derrière la ligne — but : 4 boules sorties ou 2 reviennent à la bande.', 'Groupes : la première boule légalement empochée après la casse fixe votre groupe.', 'Frappe : la blanche doit toucher d\'abord votre groupe — sinon faute (boule en main).', 'Après faute : boule en main derrière la ligne de casse (WPA).', 'La noire 8 : jouable seulement après votre groupe complet — sans annonce.', 'Noire trop tôt, avec la blanche ou hors table = frame perdue.'],
      en: ['Break: 15 balls racked, cue-ball behind the head string — 4 balls driven out or 2 back to a rail.', 'Groups: first ball legally potted after the break assigns your group (mixed break = re-break).', 'Shots: the cue ball must first contact your own group — a miss is a foul (ball in hand anywhere).', 'After a foul: ball in hand — place the cue ball anywhere and play any direction.', 'The black 8: legal only after clearing your whole group — no nomination needed.', 'Potting the 8 early, scratching on it, or jumping it off the table loses the frame.']
    }
  },
  blbb: {
    name: { ar: 'بلاك بول 🎱', da: 'LBlackball 🎱', fr: 'Blackball 🎱', en: 'Blackball Pool 🎱' },
    goal: {
      ar: 'القوانين البريطانية EPA: أحمر ضد أصفر — السقوط المزدوج في الضربة الواحدة مسموح، وبعد كل خطأ كرة يد كاملة الحرة في أي مكان.',
      da: 'L9wanin l bretaniya EPA: 7mer dd 9ssaf — jouj m3a jouj msbo7in, w mn b3d kol ghalta kora yd 7orra fin ma bghiti.',
      fr: 'Règles britanniques EPA : rouges contre jaunes — double empochage autorisé, et après chaque faute boule en main libre n\'importe où.',
      en: 'British EPA rules: reds vs yellows — a potted pair in one shot is fine, and every foul gives a fully free ball in hand.'
    },
    steps: {
      ar: ['الكرة البيضاء من خلف خط الباولك عند البداية وبعد كل خطأ في الجيب.', 'لا تُعاد الضربة إن سقطت كرتان من مجموعتك معاً — كلتاهما محسوبة.', 'بعد الخطأ: خصمك يضع البيضاء أين شاء ويُسمح له بلمس أي كرة (تسديد مباشر على أي مجموعة).', 'الخطأ الشامل (سقوط البيضاء) يمنح كرة يد حرة كاملة.', 'السوداء 8: بعد تنظيف مجموعتك — التسمية غير مطلوبة في النسخة المبسطة.', 'إسقاط السوداء مع أي خطأ = خسارة الإطار.'],
      da: ['L bidha mor khat l boulk f l bdya w mn b3d kol ghalta f l jib.', 'Ma kayn 3awt dharba ila tq3o 2 khorat mn l majmo3a — bjouj m7sobin.', 'Ba3d ghalta: l khssim ydir l bidda fin bgha w yqdr ylmss ay kora.', 'Ghalta kobra (tq3 l bidha) = kora yd 7orra kamla.', 'L kahla 8: mn b3d l majmo3a — bla tasmia.', 'Kahla m3a ay ghalta = khssara.'],
      fr: ['La blanche se place derrière la ligne de baulk au départ et après chaque faute en poche.', 'Deux boules de son groupe empochées ensemble restent valides.', 'Après faute : l\'adversaire place la blanche où il veut et peut toucher n\'importe quelle boule.', 'Faute sur la blanche empochée : boule en main totalement libre.', 'La noire 8 après son groupe — sans annonce dans cette version.', 'Noire empochée avec une faute = frame perdue.'],
      en: ['Cue ball goes behind the baulk line at the start and after any in-off.', 'Two of your group potted together both count — the shot is never replayed.', 'After a foul your opponent places the white anywhere and may hit any ball first.', 'A scratch awards a fully free ball in hand.', 'The black 8 after clearing your group — no nomination in this version.', 'Potting the black together with any foul loses the frame.']
    }
  },
  blsn: {
    name: { ar: 'سنوكر 🎱', da: 'LSnooker 🎱', fr: 'Snooker 🎱', en: 'Snooker 🎱' },
    goal: {
      ar: 'قوانين WPBSA: 15 حمراء (نقطة لكل) و6 ألوان (2-7) — التناوب أحمر فلون؛ من يجمع نقاطاً أكثر عند نهاية الكرات يفوز الإطار.',
      da: 'L9wanin WPBSA: 15 7mor (no9ta l kol wa7da) w 6 lwan (2-7) — tnaweb 7mar mn b3d lo — li jme3 ktar dyal lno9at yrbah.',
      fr: 'Règles WPBSA : 15 rouges (1 point) et 6 couleurs (2-7) — alternance rouge puis couleur ; le meilleur score remporte la frame.',
      en: 'WPBSA rules: 15 reds (1 point each) and 6 colours (2-7) — alternate red then colour; the higher score takes the frame.'
    },
    steps: {
      ar: ['التسلسل: أحمر ثم لون يعود لمكانه حتى تنفد الحمر — ثم الألوان بترتيبها (أصفر 2 → أخضر 3 → بني 4 → أزرق 5 → وردي 6 → أسود 7).', 'الخطأ يمنح الخصم 4 نقاط (أو قيمة الكرة المتضررة إن كانت أعلى).', 'بعد سقوط لون في طور الألوان لا يعود — يبقى في الجيب.', 'بيضاء في الجيب: الخصم يلعب من داخل منطقة D (بولك) فقط.', 'الترشيح: عند الالتزام بلون معين أعلنه من شريط الترشيح.', 'طابور 22 كرة وطاولة 12 قدماً — دقة الوسادة هي روح اللعبة.'],
      da: ['Ttansi: 7mar mn b3d lo — 7ta ykmlou l 7mor, mn b3d l lwan b tartibhom.', 'Ghalta kat3ti l khssim 4 no9at (wla 9ima dyal kora ila kter).', 'Lo f tor l lwan ma kayerja3ch.', 'Bidha f jib: khssim yel3ab men dakhil D.', 'Trchih: 3and l iltizam b lo mou3ayan barra men charit trchih.', '22 kora w tabla 12 9dam.'],
      fr: ['Séquence : rouge puis couleur respotée jusqu\'à épuisement des rouges — puis les couleurs dans l\'ordre (jaune 2 → vert 3 → marron 4 → bleu 5 → rose 6 → noir 7).', 'Une faute offre 4 points (ou la valeur de la boule concernée si supérieure).', 'En phase de couleurs, rien n\'est respoté.', 'Blanche en poche : l\'adversaire joue depuis la zone D uniquement.', 'Nomination : annoncez la couleur visée via la barre de nomination.', '22 boules, table de 12 pieds.'],
      en: ['Sequence: red then a re-spotted colour until reds run out — then colours in order (yellow 2 → green 3 → brown 4 → blue 5 → pink 6 → black 7).', 'A foul gives the opponent 4 points (or the ball\'s value if higher).', 'In the colours phase nothing is re-spotted.', 'In-off: the opponent plays from the D only.', 'Nomination: declare your colour on the nomination bar when required.', '22 balls on a 12ft table.']
    }
  },
  blca: {
    name: { ar: 'كاروم 🎱', da: 'LCarom 🎱', fr: 'Billard Carambole 🎱', en: 'Carom Billiards 🎱' },
    goal: {
      ar: 'قوانين UMB: طاولة بلا جيوب و3 كرات فقط (بيضاء، صفراء، حمراء) — الأهداف تتحقق بلمس الكرتين الأخريين بضربة واحدة وفق اختصاصك.',
      da: 'Tabla bla jyob w 3 khorat (bidha, ssafra, 7amra) — lhadaf lmass l khorat bjouj f dharba wa7da 7sab ikhtissask.',
      fr: 'Table sans poches et 3 boules (blanche, jaune, rouge) — toucher les deux autres en un seul coup selon votre discipline.',
      en: 'UMB rules: a pocketless table with 3 balls (white, yellow, red) — hit both other balls in one shot per your discipline.'
    },
    steps: {
      ar: ['الاختصاصات: مباشر (لمسة الكرتين) · 3 وسادات (لمسة الكرتين + 3 وسادات) · اختصاص واحد (كرة واحدة مرتين + وسادة).', 'الهدف (3/5/8) = عدد الضربات الناجحة لإنهاء المباراة.', 'الخطأ (كرة خارج الطاولة) ينهي الضربة دون نقاط ويجير الخصم.', 'موضع البداية: البيضاء والصفراء خلف الخط، الحمراء على نقطة القدم.', 'كل ضربة ناجحة = نقطة واحدة وتستمر في اللعب — الفشل ينقل الدور.', 'الفائز أول من يبلغ الهدف المحدد.'],
      da: ['Ikhtissasat: direct · 3 midad · ikhtissas wa7ed.', 'Lhadaf (3/5/8) = 3dad d dharabat naja7a.', 'Ghalta (kora barra) katkml dharba bla no9at.', 'Mawdi3 l bdya: bidha w ssafra mor khat, 7amra 3la no9ta l rijl.', 'Kol dharba naja7a = no9ta w tkml — fchel kayn9l dour.', 'Li ywssel l hadaf lwla yrbah.'],
      fr: ['Disciplines : direct (toucher les deux) · 3 bandes (les deux + 3 bandes) · une bande.', 'Objectif (3/5/8) = nombre de réussites pour gagner.', 'Faute (boule hors table) : coup terminé sans point.', 'Départ : blanche et jaune derrière la ligne, rouge au point de pied.', 'Chaque réussite = 1 point et on rejoue — l\'échec passe la main.', 'Le premier à l\'objectif gagne.'],
      en: ['Disciplines: direct (hit both) · 3-cushion (both balls + 3 cushions) · 1-cushion.', 'Target (3/5/8) = successful strokes needed to win.', 'A foul (ball off table) ends the stroke without a point.', 'Start: white and yellow behind the line, red on the foot spot.', 'Each success = 1 point and you continue — a miss passes the turn.', 'First to the target wins.']
    }
  },
  blgv: {
    name: { ar: 'غولڤازور 🎱', da: 'LGolvazor 🎱', fr: 'Golvazor 🎱', en: 'Golvazor 🎱' },
    goal: {
      ar: 'البلياردو المغربي الأصيل بقواعده الخاصة: خطأ الخصم يمنحك ضربتين متتاليتين، والسوداء وحدها في الكسر فوز ساحق — لكن مع كرة أخرى انتحار!',
      da: 'Lbilyardo lmghribi b 9wa3ido: ghalta dyal khssim kat3tik 2 dharabat, w l kahla bo7dha f ksr = rbah — walakin m3a kora okhra = intihar!',
      fr: 'Le billard marocain authentique : la faute adverse offre deux coups consécutifs, et la noire seule à la casse gagne — mais avec une autre boule c\'est le suicide !',
      en: 'Authentic Moroccan billiards: an opponent foul grants two consecutive shots, and potting only the black on the break is a crushing win — with another ball it\'s suicide!'
    },
    steps: {
      ar: ['سقوط البيضاء = كرة يد خلف خط الباولك حصراً.', 'الخطأ يمنح الخصم ضربتين — لا جزاء قبل تحديد المجموعات إطلاقاً.', 'كسر بسوداء وحدها = فوز ساحق فوري؛ سوداء + كرة أخرى = انتحار.', 'لونان ساقطان في الكسر = اختيار مجموعتك يدوياً بالنقر.', 'الأنونص: السوداء تتطلب لمس وسادة (بيضاء أو سوداء) قبل سقوطها وإلا انتحار.', '5 طرق لإنهاء الإطار — راجع شاشة القواعد داخل اللعبة.'],
      da: ['Tq3 l bidha = kora yd mor khat l boulk.', 'Ghalta kat3ti khssim 2 dharabat — bla jza2 qbl l majmo3at.', 'Ksr b kahla bo7dha = rbah kahra7; kahla m3a lokhra = intihar.', '2 lwan f ksr = khtiyar majmo3a b l yed.', 'L annonss: kahla khasaha tlmss midada 9bl ma tq3.', '5 toro9 dyal kamal l frame.'],
      fr: ['Blanche en poche = boule en main derrière la ligne de baulk uniquement.', 'Une faute offre deux coups — aucune pénalité avant l\'attribution des groupes.', 'Noire seule à la casse = victoire écrasante ; noire + autre boule = suicide.', 'Deux couleurs à la casse = choix manuel du groupe.', 'L\'annonce : la noire exige un contact de bande avant sa chute, sinon suicide.', '5 façons de terminer une frame.'],
      en: ['In-off = ball in hand behind the baulk line only.', 'A foul grants two shots — never any penalty before groups are set.', 'Black alone on the break = crushing win; black plus any other ball = suicide.', 'Two colours dropped on the break = pick your group by tapping.', 'The announce: the black requires a rail contact (white or black) before dropping, else suicide.', 'Five ways to finish a frame.']
    }
  },
};
/* ═══════════════════════════════════════════
   Tutorial System
   ═══════════════════════════════════════════ */
var Tutorial = {
  /* عرض القواعد الكاملة */
  showFullRules: function(gameId) {
    var rules = FULL_RULES[gameId];
    if (!rules) return;
    var lang = (ST.lang === 'fr' || ST.lang === 'en' || ST.lang === 'da') ? ST.lang : 'ar';
    var fallbackLang = (lang === 'da') ? 'ar' : (lang === 'fr' ? 'fr' : (lang === 'en' ? 'en' : 'ar'));
    
    var modal = document.getElementById('rulesModal');
    var title = document.getElementById('rulesTitle');
    var body = document.getElementById('rulesBody');
    
    var gName = rules.name[lang] || rules.name[fallbackLang] || rules.name['ar'] || rules.name['en'] || 'اللعبة';
    if (title) title.textContent = '📖 ' + gName;
    
    var html = '<div class="rules-full">';
    
    /* الهدف */
    var goalText = rules.goal[lang] || rules.goal[fallbackLang] || rules.goal['ar'] || rules.goal['en'] || '';
    html += '<div class="rules-section">';
    html += '<h4><i class="fa-solid fa-bullseye" aria-hidden="true"></i> ' + (T('ui.goal') || 'الهدف') + '</h4>';
    html += '<p>' + goalText + '</p>';
    html += '</div>';
    
    /* الخطوات */
    var stepsList = rules.steps[lang] || rules.steps[fallbackLang] || rules.steps['ar'] || rules.steps['en'] || [];
    if (stepsList.length > 0) {
      html += '<div class="rules-section">';
      html += '<h4><i class="fa-solid fa-list-ol" aria-hidden="true"></i> ' + (T('ui.steps') || 'طريقة اللعب') + '</h4>';
      html += '<ol class="rules-steps">';
      stepsList.forEach(function(step) {
        html += '<li>' + step + '</li>';
      });
      html += '</ol>';
      html += '</div>';
    }
    
    /* القواعد الرسمية التفصيلية */
    var detailsList = rules.details ? (rules.details[lang] || rules.details[fallbackLang] || rules.details['ar'] || rules.details['en']) : null;
    if (detailsList && detailsList.length > 0) {
      html += '<div class="rules-section">';
      html += '<h4><i class="fa-solid fa-gavel" aria-hidden="true"></i> ' + (T('ui.officialRules') || 'القواعد الرسمية') + '</h4>';
      detailsList.forEach(function(sec) {
        html += '<h5 class="rules-sub">' + sec.h + '</h5>';
        html += '<ul class="rules-details">';
        sec.items.forEach(function(it) {
          html += '<li>' + it + '</li>';
        });
        html += '</ul>';
      });
      html += '</div>';
    }
    
    /* جدول الدفع */
    var payoutContent = rules.payouts ? (rules.payouts[lang] || rules.payouts[fallbackLang] || rules.payouts['ar'] || rules.payouts['en']) : null;
    if (payoutContent) {
      html += '<div class="rules-section">';
      html += '<h4><i class="fa-solid fa-table-list" aria-hidden="true"></i> ' + (T('ui.payouts') || 'جدول الأرباح والمضاعفات') + '</h4>';
      html += '<table class="atable">';
      html += '<thead><tr><th>' + (T('ui.outcome') || 'النتيجة') + '</th><th>' + (T('ui.reward') || 'المضاعف / المكسب') + '</th></tr></thead>';
      html += '<tbody>' + payoutContent + '</tbody>';
      html += '</table>';
      html += '</div>';
    }
    
    html += '</div>';
    if (body) body.innerHTML = html;
    if (modal) modal.classList.add('show');
    if (typeof SND !== 'undefined' && SND.click) SND.click();
  },
  /* فحص أول مرة لعب */
  checkFirstPlay: function(gameId) {
    var key = 'rc_played_' + gameId;
    if (!sGet(key, null)) {
      Tutorial.showFullRules(gameId);
      sSet(key, '1');
      return true;
    }
    return false;
  },
  /* Tutorial تفاعلي خطوة بخطوة */
  startInteractive: function(gameId) {
    var steps = {
      rn: [
        { target: '.ronda-nums', text: 'اختر رقماً من هنا', arrow: 'down' },
        { target: '.ronda-syms', text: 'ثم اختر رمزاً', arrow: 'down' },
        { target: '.ronda-btn.primary', text: 'اضغط للبدء!', arrow: 'up' }
      ],
      av: [
        { target: '.bets', text: 'حدد مبلغ الرهان أولاً', arrow: 'down' },
        { target: '#cStart', text: 'اضغط هنا للإقلاع', arrow: 'up' },
        { target: '#cCash', text: 'اسحب قبل التحطم!', arrow: 'up' }
      ],
      bj: [
        { target: '#bDeal', text: 'اضغط توزيع لبدء الجولة', arrow: 'up' },
        { target: '#bHit', text: 'اسحب بطاقة إضافية', arrow: 'up' },
        { target: '#bStand', text: 'أو قف وقارن', arrow: 'up' }
      ]
    };
    if (!steps[gameId]) return;
    var currentStep = 0;
    var overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    overlay.innerHTML = '<div class="tutorial-tooltip"></div>';
    document.body.appendChild(overlay);
    function showStep() {
      if (currentStep >= steps[gameId].length) {
        overlay.remove();
        return;
      }
      var step = steps[gameId][currentStep];
      var target = document.querySelector(step.target);
      var tooltip = overlay.querySelector('.tutorial-tooltip');
      if (target) {
        var rect = target.getBoundingClientRect();
        tooltip.textContent = step.text;
        tooltip.style.top = (step.arrow === 'up' ? rect.top - 50 : rect.bottom + 10) + 'px';
        tooltip.style.left = rect.left + 'px';
        target.classList.add('tutorial-highlight');
      }
      overlay.onclick = function() {
        if (target) target.classList.remove('tutorial-highlight');
        currentStep++;
        showStep();
      };
    }
    showStep();
  }
};
/* إغلاق modal القواعد */
function closeRulesModal() {
  document.getElementById('rulesModal').classList.remove('show');
}
function showFullRules() {
  var currentGame = window._currentGameId;
  if (currentGame) {
    Tutorial.showFullRules(currentGame);
  }
}
/* CSS إضافي للـ Tutorial (أضف إلى 03-components.css أو ملف منفصل) */
var tutorialCSS = document.createElement('style');
tutorialCSS.textContent = `
  .tutorial-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 9998;
    cursor: pointer;
  }
  .tutorial-tooltip {
    position: absolute;
    background: var(--gold);
    color: #0A0E1A;
    padding: 10px 16px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 0.85rem;
    max-width: 250px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    animation: pgIn 0.3s ease;
  }
  .tutorial-highlight {
    position: relative;
    z-index: 9999;
    box-shadow: 0 0 0 4px var(--gold), 0 0 30px rgba(245, 197, 24, 0.5);
    border-radius: 10px;
  }
  .rules-section {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--bd);
  }
  .rules-section:last-child {
    border-bottom: none;
  }
  .rules-section h4 {
    color: var(--gold);
    font-size: 0.95rem;
    margin-bottom: 10px;
  }
  .rules-section p {
    color: var(--t2);
    font-size: 0.85rem;
    line-height: 1.7;
  }
  .rules-steps {
    padding-inline-start: 20px;
    color: var(--t2);
    font-size: 0.85rem;
  }
  .rules-steps li {
    margin-bottom: 8px;
    line-height: 1.6;
  }
`;
document.head.appendChild(tutorialCSS);
