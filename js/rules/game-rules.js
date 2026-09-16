/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Game Rules & Tutorial System
   ═══════════════════════════════════════════ */
"use strict";
/* ── قاعدة بيانات القواعد الكاملة ── */
var FULL_RULES = {
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
        'حدد مبلغ الرهان ثم اختر وضع اللعب: رقم فقط (×2) أو رقم + رمز (×3)',
        'اختر رقماً من الأوراق المغاربية (1-7، 10-12) ثم أكّد',
        'في وضع الرمز، اختر أيضاً الرمز: ◆ ذهب، ♥ كؤوس، ♠ سيوف، ♣ صولجان',
        'يتم سحب البطاقات بالتناوب بينك وبين الموزع (40 ورقة مغاربية)',
        'إذا ظهرت بطاقتك المختارة أولاً، تفوز وتتبادل الأدوار',
        'عند الخسارة يخصم الرهان من رصيدك — راقب رصيدك جيداً'
      ],
      fr: [
        'Choisissez votre mise puis le mode : numéro seul (×2) ou numéro + symbole (×3)',
        'Choisissez un numéro (1-7, 10-12) puis confirmez',
        'En mode symbole, choisissez aussi : ◆ Or, ♥ Coupes, ♠ Épées, ♣ Bâtons',
        'Les cartes sont tirées alternativement (jeu de 40 cartes marocaines)',
        'Si votre carte apparaît en premier, vous gagnez et les rôles s\'inversent',
        'En cas de défaite, la mise est déduite de votre solde'
      ],
      en: [
        'Set your bet, then choose game mode: number only (×2) or number + suit (×3)',
        'Pick a number (1-7, 10-12) and confirm',
        'In suit mode, also pick: ◆ Gold, ♥ Cups, ♠ Swords, ♣ Clubs',
        'Cards are drawn alternately between you and the dealer (40 Moroccan cards)',
        'If your card appears first, you win and roles swap',
        'On a loss, the bet is deducted from your balance'
      ]
    },
    payouts: {
      ar: '<tr><td>رقم فقط</td><td>×2</td></tr><tr><td>رقم + رمز</td><td>×3</td></tr>',
      fr: '<tr><td>Numéro seul</td><td>×2</td></tr><tr><td>Numéro + Symbole</td><td>×3</td></tr>',
      en: '<tr><td>Number only</td><td>×2</td></tr><tr><td>Number + Symbol</td><td>×3</td></tr>'
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
  /* ═══ Blackjack ═══ */
  bj: {
    name: { ar: 'بلاك جاك 21', fr: 'Blackjack 21', en: 'Blackjack 21' },
    goal: {
      ar: 'احصل على مجموع أقرب إلى 21 من الموزع دون تجاوزه.',
      fr: 'Obtenez un total plus proche de 21 que le donneur sans le dépasser.',
      en: 'Get a total closer to 21 than the dealer without going over.'
    },
    steps: {
      ar: [
        'اضغط "توزيع" لبدء الجولة',
        'تحصل على بطاقتين والموزع على بطاقتين (واحدة مخفية)',
        '"بطاقة" لسحب بطاقة إضافية',
        '"وقوف" للتوقف والمقارنة',
        '"Double" لمضاعفة الرهان مع بطاقة واحدة إضافية',
        '"Split" لتقسيم بطاقتين متساويتين'
      ],
      fr: [
        'Cliquez sur "Distribuer" pour commencer',
        'Vous recevez 2 cartes, le donneur 2 (une cachée)',
        '"Tirer" pour une carte supplémentaire',
        '"Rester" pour comparer',
        '"Double" pour doubler le pari avec une carte',
        '"Split" pour diviser deux cartes égales'
      ],
      en: [
        'Click "Deal" to start the round',
        'You get 2 cards, dealer gets 2 (one hidden)',
        '"Hit" to draw an additional card',
        '"Stand" to stop and compare',
        '"Double" to double bet with one more card',
        '"Split" to split two equal cards'
      ]
    },
    payouts: {
      ar: '<tr><td>فوز عادي</td><td>×2</td></tr><tr><td>Blackjack (21 بورقتين)</td><td>×2.5</td></tr><tr><td>Push (تعادل)</td><td>استرداد</td></tr>',
      fr: '<tr><td>Victoire normale</td><td>×2</td></tr><tr><td>Blackjack (21 en 2 cartes)</td><td>×2.5</td></tr><tr><td>Push (égalité)</td><td>Remboursé</td></tr>',
      en: '<tr><td>Normal win</td><td>×2</td></tr><tr><td>Blackjack (21 in 2 cards)</td><td>×2.5</td></tr><tr><td>Push (tie)</td><td>Refund</td></tr>'
    },
  },
  /* ═══ Mines ═══ */
  mn: {
    name: { ar: 'ماينز', fr: 'Mines', en: 'Mines' },
    goal: {
      ar: 'افتح الخانات وتجنب الألغام. كل خانة آمنة تزيد المضاعف!',
      fr: 'Ouvrez les cases et évitez les mines. Chaque case sûre augmente le multiplicateur !',
      en: 'Reveal tiles and avoid mines. Each safe tile increases the multiplier!'
    },
    steps: {
      ar: [
        'اختر عدد الألغام (3-24)',
        'حدد الرهان واضغط ابدأ',
        'اضغط على الخانات لكشفها',
        'كل خانة آمنة تزيد مضاعفك',
        'اسحب في أي وقت أو واصل حتى لغم'
      ],
      fr: [
        'Choisissez le nombre de mines (3-24)',
        'Définissez le pari et commencez',
        'Cliquez sur les cases pour les révéler',
        'Chaque case sûre augmente votre multiplicateur',
        'Encaissez à tout moment ou continuez'
      ],
      en: [
        'Choose number of mines (3-24)',
        'Set bet and start',
        'Click tiles to reveal them',
        'Each safe tile increases your multiplier',
        'Cash out anytime or push your luck'
      ]
    },
    payouts: {
      ar: '<tr><th colspan="2">مضاعفات الرهان (GB) — الصيغة: (1 ÷ (1 − ألغام/25)) أس عدد الخانات الآمنة</th></tr><tr><td><b>3</b> ألغام</td><td>5 → ×1.89 · 10 → ×3.59 · 15 → ×6.8 · 20 → ×12.89 · 22 → ×16.65</td></tr><tr><td><b>5</b> ألغام</td><td>5 → ×3.05 · 10 → ×9.31 · 15 → ×28.42 · 20 → ×86.74</td></tr><tr><td><b>10</b> ألغام</td><td>5 → ×12.86 · 10 → ×165.38 · 15 → ×2126.82</td></tr><tr><td><b>15</b> ألغام</td><td>5 → ×97.66 · 10 → ×9536.74</td></tr><tr><td><b>24</b> ألغام</td><td>1 → ×25</td></tr><tr><td colspan="2">مضاعفات عادلة رياضياً — RTP 100% (إما كاش بالمضاعف أو لغم = 0)</td></tr>',
      fr: '<tr><th colspan="2">Multiplicateurs de la mise (GB) — formule : (1 ÷ (1 − mines/25)) puissance cases sûres</th></tr><tr><td><b>3</b> mines</td><td>5 → ×1,89 · 10 → ×3,59 · 15 → ×6,8 · 20 → ×12,89 · 22 → ×16,65</td></tr><tr><td><b>5</b> mines</td><td>5 → ×3,05 · 10 → ×9,31 · 15 → ×28,42 · 20 → ×86,74</td></tr><tr><td><b>10</b> mines</td><td>5 → ×12,86 · 10 → ×165,38 · 15 → ×2126,82</td></tr><tr><td><b>15</b> mines</td><td>5 → ×97,66 · 10 → ×9536,74</td></tr><tr><td><b>24</b> mines</td><td>1 → ×25</td></tr><tr><td colspan="2">Multiplicateurs mathématiquement équitables — RTP 100 % (encaissez le multiplicateur ou mine = 0)</td></tr>',
      en: '<tr><th colspan="2">Bet multipliers (GB) — formula: (1 ÷ (1 − mines/25)) ^ safe tiles</th></tr><tr><td><b>3</b> mines</td><td>5 → ×1.89 · 10 → ×3.59 · 15 → ×6.8 · 20 → ×12.89 · 22 → ×16.65</td></tr><tr><td><b>5</b> mines</td><td>5 → ×3.05 · 10 → ×9.31 · 15 → ×28.42 · 20 → ×86.74</td></tr><tr><td><b>10</b> mines</td><td>5 → ×12.86 · 10 → ×165.38 · 15 → ×2126.82</td></tr><tr><td><b>15</b> mines</td><td>5 → ×97.66 · 10 → ×9536.74</td></tr><tr><td><b>24</b> mines</td><td>1 → ×25</td></tr><tr><td colspan="2">Mathematically fair multipliers — RTP 100% (cash out the multiplier or mine = 0)</td></tr>'
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
  /* ═══ Slots ═══ */
  sl: {
    name: { ar: 'رويال سلوتس', fr: 'Royal Slots', en: 'Royal Slots' },
    goal: {
      ar: 'أدر البكرات: 3 رموز متطابقة = جاكبوت (حتى ×120)، 2 متطابقة = استرداد رهانك!',
      fr: 'Faites tourner les rouleaux : 3 symboles identiques = jackpot (jusqu\'à ×120), 2 identiques = pari remboursé !',
      en: 'Spin the reels: 3 matching symbols = jackpot (up to ×120), 2 matching = bet refunded!'
    },
    steps: {
      ar: [
        'حدد الرهان ثم اضغط "🎰 لِف!"',
        '3 بكرات تتوقف تباعاً عن رمز من 8 رموز متساوية الاحتمال',
        '3 متطابقة: ربح = الرهان × مضاعف الرمز (7️⃣ ×120، 🍒 ×60 …)',
        '2 متطابقة: استرداد الرهان كاملاً (لا ربح ولا خسارة)',
        'بلا تطابق: خسارة الرهان — RTP 95.9%'
      ],
      fr: [
        'Définissez le pari puis cliquez "🎰 Tourner"',
        '3 rouleaux s\'arrêtent l\'un après l\'autre sur un symbole parmi 8 équiprobables',
        '3 identiques : gain = mise × multiplicateur (7️⃣ ×120, 🍒 ×60…)',
        '2 identiques : pari remboursé intégralement',
        'Aucune paire : mise perdue — RTP 95,9 %'
      ],
      en: [
        'Set your bet then hit "🎰 SPIN"',
        '3 reels stop one by one on a symbol among 8 equally likely',
        '3 matching: win = bet × symbol multiplier (7️⃣ ×120, 🍒 ×60…)',
        '2 matching: full bet refund',
        'No match: bet lost — RTP 95.9%'
      ]
    },
    payouts: {
      ar: '<tr><td>7️⃣7️⃣7️⃣</td><td>×120</td></tr><tr><td>🍒🍒🍒</td><td>×60</td></tr><tr><td>🍇🍇🍇</td><td>×40</td></tr><tr><td>⭐⭐⭐</td><td>×30</td></tr><tr><td>🍋🍋🍋</td><td>×25</td></tr><tr><td>🔔🔔🔔</td><td>×20</td></tr><tr><td>💎💎💎</td><td>×15</td></tr><tr><td>🚀🚀🚀</td><td>×12</td></tr><tr><td>رمزان متطابقان</td><td>استرداد الرهان</td></tr>',
      fr: '<tr><td>7️⃣7️⃣7️⃣</td><td>×120</td></tr><tr><td>🍒🍒🍒</td><td>×60</td></tr><tr><td>🍇🍇🍇</td><td>×40</td></tr><tr><td>⭐⭐⭐</td><td>×30</td></tr><tr><td>🍋🍋🍋</td><td>×25</td></tr><tr><td>🔔🔔🔔</td><td>×20</td></tr><tr><td>💎💎💎</td><td>×15</td></tr><tr><td>🚀🚀🚀</td><td>×12</td></tr><tr><td>2 identiques</td><td>pari remboursé</td></tr>',
      en: '<tr><td>7️⃣7️⃣7️⃣</td><td>×120</td></tr><tr><td>🍒🍒🍒</td><td>×60</td></tr><tr><td>🍇🍇🍇</td><td>×40</td></tr><tr><td>⭐⭐⭐</td><td>×30</td></tr><tr><td>🍋🍋🍋</td><td>×25</td></tr><tr><td>🔔🔔🔔</td><td>×20</td></tr><tr><td>💎💎💎</td><td>×15</td></tr><tr><td>🚀🚀🚀</td><td>×12</td></tr><tr><td>2 matching</td><td>bet refunded</td></tr>'
    },
  },
  /* ═══ Plinko ═══ */
  pl: {
    name: { ar: 'بلينكو', fr: 'Plinko', en: 'Plinko' },
    goal: {
      ar: 'أسقط الكرة من الأعلى؛ عند كل صف تتخذ الكرة قراراً عشوائياً (يمين/يسار) وتهبط في خانة مضاعف في الأسفل — الأطراف مضاعفات ضخمة واحتمالها منخفض، والوسط ربح متكرر صغير.',
      fr: 'Lâchez la balle depuis le haut ; à chaque rangée elle prend une décision aléatoire (droite/gauche) et atterrit dans une case multiplicateur en bas — les bords offrent d\'énormes multiplicateurs mais sont rares, le centre paie petit mais souvent.',
      en: 'Drop the ball from the top; at each row it makes a random left/right decision and lands in a multiplier slot below — edges pay huge multipliers but are rare, the center pays small but often.'
    },
    steps: {
      ar: [
        'اختر عدد الصفوف: 8 / 10 / 12 / 16 (عدد الخانات = الصفوف + 1)',
        'حدد مبلغ الرهان',
        'اضغط "أفلت الكرة" — قرار عشوائي واحد عند كل صف (توزيع ثنائي)',
        'تهبط في خانة مضاعف وتُدفع لك فوراً',
        'RTP 95% — متوسط العائد نظري على المدى الطويل'
      ],
      fr: [
        'Choisissez le nombre de rangées : 8 / 10 / 12 / 16 (cases = rangées + 1)',
        'Définissez le montant du pari',
        'Cliquez sur "Lâcher" — une décision aléatoire à chaque rangée (distribution binomiale)',
        'Elle atterrit dans une case multiplicateur et vous êtes payé immédiatement',
        'RTP 95 % — retour théorique à long terme'
      ],
      en: [
        'Choose the number of rows: 8 / 10 / 12 / 16 (slots = rows + 1)',
        'Set your bet amount',
        'Click "Drop" — one random decision at each row (binomial distribution)',
        'It lands in a multiplier slot and you are paid instantly',
        '95% RTP — theoretical long-term return'
      ]
    },
    payouts: {
      ar: '<tr><td colspan="2">12 صفاً افتراضياً (13 خانة) — يتغير الجدول مع عدد الصفوف</td></tr><tr><td>أقصى الطرف</td><td>×299.3</td></tr><tr><td>الثاني من الطرف</td><td>×24.9</td></tr><tr><td>الثالث من الطرف</td><td>×4.5</td></tr><tr><td>الرابع من الطرف</td><td>×1.4</td></tr><tr><td>الخامس من الطرف</td><td>×0.6</td></tr><tr><td>السادس من الطرف</td><td>×0.4</td></tr><tr><td>الوسط تماماً</td><td>×0.32</td></tr>',
      fr: '<tr><td colspan="2">12 rangées par défaut (13 cases) — le tableau change avec les rangées</td></tr><tr><td>Bord extrême</td><td>×299.3</td></tr><tr><td>Deuxième depuis le bord</td><td>×24.9</td></tr><tr><td>Troisième depuis le bord</td><td>×4.5</td></tr><tr><td>Quatrième depuis le bord</td><td>×1.4</td></tr><tr><td>Cinquième depuis le bord</td><td>×0.6</td></tr><tr><td>Sixième depuis le bord</td><td>×0.4</td></tr><tr><td>Centre exact</td><td>×0.32</td></tr>',
      en: '<tr><td colspan="2">12 default rows (13 slots) — table changes with rows</td></tr><tr><td>Extreme edge</td><td>×299.3</td></tr><tr><td>Second from edge</td><td>×24.9</td></tr><tr><td>Third from edge</td><td>×4.5</td></tr><tr><td>Fourth from edge</td><td>×1.4</td></tr><tr><td>Fifth from edge</td><td>×0.6</td></tr><tr><td>Sixth from edge</td><td>×0.4</td></tr><tr><td>Dead center</td><td>×0.32</td></tr>'
    },
  },
  /* ═══ Dice ═══ */
  dc: {
    name: { ar: 'نرد', fr: 'Dice', en: 'Dice' },
    goal: {
      ar: 'اضبط الهدف (1-98) واختر "أقل من" أو "فوق". تُرمى 3 نردات وتظهر النتيجة 0.00-99.99 — إذا تحقق شرطك تربح بمضاعف = 98 ÷ الاحتمال!',
      fr: 'Réglez la cible (1-98) et choisissez "Moins que" ou "Au-dessus". Trois dés roulent et le résultat va de 0.00 à 99.99 — si votre condition est remplie, vous gagnez avec un multiplicateur = 98 ÷ probabilité !',
      en: 'Set the target (1-98) and pick "Under" or "Above". Three dice roll and the result is 0.00-99.99 — if your condition is met you win with a multiplier = 98 ÷ probability!'
    },
    steps: {
      ar: [
        'اضبط الهدف بالمؤشر (من 1 إلى 98)',
        'اختر: أقل من الهدف ⬇ أو فوقه ⬆',
        'اضغط "ارمِ النرد!" — تُرمى 3 نردات',
        'النتيجة عشوائية بين 0.00 و99.99',
        'تربح إذا تحقق الشرط — المضاعف = 98 ÷ الاحتمال'
      ],
      fr: [
        'Réglez la cible avec le curseur (de 1 à 98)',
        'Choisissez : Moins que la cible ⬇ ou Au-dessus ⬆',
        'Cliquez sur "Lancer les dés!" — 3 dés roulent',
        'Le résultat est aléatoire entre 0.00 et 99.99',
        'Vous gagnez si la condition est remplie — multiplicateur = 98 ÷ probabilité'
      ],
      en: [
        'Set the target with the slider (from 1 to 98)',
        'Pick: Under the target ⬇ or Above it ⬆',
        'Click "ROLL DICE!" — 3 dice roll',
        'The result is random between 0.00 and 99.99',
        'You win if the condition is met — multiplier = 98 ÷ probability'
      ]
    },
    payouts: {
      ar: '<tr><td>تحت 2</td><td>×49</td></tr><tr><td>تحت 10</td><td>×9.8</td></tr><tr><td>تحت 25</td><td>×3.92</td></tr><tr><td>تحت 50</td><td>×1.96</td></tr><tr><td>فوق 90</td><td>×9.8</td></tr><tr><td>فوق 98</td><td>×49</td></tr>',
      fr: '<tr><td>Sous 2</td><td>×49</td></tr><tr><td>Sous 10</td><td>×9.8</td></tr><tr><td>Sous 25</td><td>×3.92</td></tr><tr><td>Sous 50</td><td>×1.96</td></tr><tr><td>Au-dessus 90</td><td>×9.8</td></tr><tr><td>Au-dessus 98</td><td>×49</td></tr>',
      en: '<tr><td>Under 2</td><td>×49</td></tr><tr><td>Under 10</td><td>×9.8</td></tr><tr><td>Under 25</td><td>×3.92</td></tr><tr><td>Under 50</td><td>×1.96</td></tr><tr><td>Above 90</td><td>×9.8</td></tr><tr><td>Above 98</td><td>×49</td></tr>'
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
  /* ═══ Wheel of Fortune ═══ */
  wf: {
    name: { ar: 'عجلة الحظ', fr: 'Wheel of Fortune', en: 'Wheel of Fortune' },
    goal: {
      ar: 'دوّر العجلة وتوقف عند قطاع عشوائي — كل قطاع له مضاعف مختلف (قد تخسر!)',
      fr: 'Faites tourner la roue et arrêtez-vous sur un secteur aléatoire — chaque secteur a un multiplicateur différent (vous pouvez perdre !)',
      en: 'Spin the wheel and land on a random sector — each sector has a different multiplier (you can lose!)'
    },
    steps: {
      ar: [
        'حدد مبلغ الرهان',
        'اضغط "دوران" لتحريك العجلة',
        'العجلة تحتوي 12 قطاعاً بمضاعفات مختلفة',
        'الأقسام موزونة — المضاعف الكبير أقل احتمالاً (RTP 97.5%)',
        'تتوقف على قطاع عشوائي يحدد الربح أو الخسارة'
      ],
      fr: [
        'Définissez le montant du pari',
        'Cliquez sur "Tourner" pour lancer la roue',
        'La roue a 12 secteurs avec des multiplicateurs différents',
        'Les secteurs sont pondérés — le gros multiplicateur est plus rare (RTP 97,5 %)',
        'Elle s\'arrête sur un secteur aléatoire qui détermine le gain ou la perte'
      ],
      en: [
        'Set your bet amount',
        'Click "Spin" to spin the wheel',
        'The wheel has 12 sectors with different multipliers',
        'Sectors are weighted — the big multiplier is rarer (RTP 97.5%)',
        'It stops on a random sector that decides win or loss'
      ]
    },
    payouts: {
      ar: '<tr><td>قطاع ×10</td><td>ربح الرهان ×10</td></tr><tr><td>قطاع ×5</td><td>ربح الرهان ×5</td></tr><tr><td>قطاع ×3</td><td>ربح الرهان ×3</td></tr><tr><td>قطاع ×2 (قطاعان)</td><td>ربح الرهان ×2</td></tr><tr><td>قطاع ×1.5</td><td>ربح الرهان ×1.5</td></tr><tr><td>قطاع ×1 (قطاعان)</td><td>استرداد الرهان</td></tr><tr><td>قطاع ×0.5 (3 قطاعات)</td><td>خسارة جزئية</td></tr><tr><td>قطاع ×0</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>Secteur ×10</td><td>Pari ×10</td></tr><tr><td>Secteur ×5</td><td>Pari ×5</td></tr><tr><td>Secteur ×3</td><td>Pari ×3</td></tr><tr><td>Secteur ×2 (deux secteurs)</td><td>Pari ×2</td></tr><tr><td>Secteur ×1.5</td><td>Pari ×1.5</td></tr><tr><td>Secteur ×1 (deux secteurs)</td><td>Pari remboursé</td></tr><tr><td>Secteur ×0.5 (trois secteurs)</td><td>Perte partielle</td></tr><tr><td>Secteur ×0</td><td>Perte du pari</td></tr>',
      en: '<tr><td>×10 sector</td><td>Bet ×10</td></tr><tr><td>×5 sector</td><td>Bet ×5</td></tr><tr><td>×3 sector</td><td>Bet ×3</td></tr><tr><td>×2 sector (two sectors)</td><td>Bet ×2</td></tr><tr><td>×1.5 sector</td><td>Bet ×1.5</td></tr><tr><td>×1 sector (two sectors)</td><td>Bet refunded</td></tr><tr><td>×0.5 sector (three sectors)</td><td>Partial loss</td></tr><tr><td>×0 sector</td><td>Lose bet</td></tr>'
    },
  },
  /* ═══ Scratch Card — Diamond Mine ═══ */
  sc: {
    name: { ar: 'كنز الماس', fr: 'Diamond Mine', en: 'Diamond Mine' },
    goal: {
      ar: 'اكشف الماسات 💎 الستة المخفية في شبكة 3×3 واجمع ×80، لكن تجنب الألغام 💣 الثلاثة!',
      fr: 'Révélez les 6 diamants 💎 cachés dans la grille 3×3 et empochez ×80, mais évitez les 3 mines 💣 !',
      en: 'Reveal the 6 hidden diamonds 💎 in the 3×3 grid to win ×80, but avoid the 3 mines 💣!'
    },
    steps: {
      ar: [
        'اضغط "ابدأ" — تُخلط الشبكة عشوائياً: 6 ماسات 💎 و3 ألغام 💣',
        'اضغط على كل خلية لكشف ما بداخلها',
        '💎 ماس = استمر بأمان، 💣 لغم = انفجار وخسارة الرهان',
        'كشف الماسات الست كلها = فوز ×80'
      ],
      fr: [
        'Cliquez sur "Démarrer" — la grille est mélangée aléatoirement : 6 diamants 💎 et 3 mines 💣',
        'Cliquez sur chaque case pour révéler son contenu',
        '💎 diamant = continuez, 💣 mine = explosion et perte de la mise',
        'Révélez les 6 diamants = gain ×80'
      ],
      en: [
        'Click "Start" — the grid is shuffled: 6 diamonds 💎 and 3 mines 💣',
        'Click each tile to reveal what is inside',
        '💎 diamond = safe, 💣 mine = boom, you lose the bet',
        'Reveal all 6 diamonds = win ×80'
      ]
    },
    payouts: {
      ar: '<tr><td>6 ماسات 💎</td><td>×80</td></tr><tr><td>أي لغم 💣</td><td>خسارة</td></tr>',
      fr: '<tr><td>6 diamants 💎</td><td>×80</td></tr><tr><td>Une mine 💣</td><td>Perte</td></tr>',
      en: '<tr><td>All 6 diamonds 💎</td><td>×80</td></tr><tr><td>Any mine 💣</td><td>Loss</td></tr>'
    },
  },
  /* ═══ Wingo Colors ═══ */
  wg: {
    name: { ar: 'وينجو كولرز', fr: 'Wingo Colors', en: 'Wingo Colors' },
    goal: {
      ar: 'اختر لوناً وتوقع لون الكرة العشوائية — أحمر ×1.9، أخضر ×2.85، أزرق ×5.7 (RTP 95%)!',
      fr: 'Choisissez une couleur et devinez la couleur de la boule aléatoire — rouge ×1,9, vert ×2,85, bleu ×5,7 (RTP 95 %) !',
      en: 'Pick a color and guess the color of the random ball — red ×1.9, green ×2.85, blue ×5.7 (RTP 95%)!'
    },
    steps: {
      ar: [
        'اختر لوناً: 🔴 أحمر، 🟢 أخضر، 🔵 أزرق',
        'تُسحب الكرة من مجموعة: أحمر 3 من 6، أخضر 2 من 6، أزرق 1 من 6',
        'إذا طابق اللون اختيارك تربح',
        'المضاعفات: أحمر ×1.9، أخضر ×2.85، أزرق ×5.7 — كل لون RTP 95%'
      ],
      fr: [
        'Choisissez une couleur : 🔴 rouge, 🟢 vert, 🔵 bleu',
        'La boule est tirée d\'un pool : rouge 3/6, vert 2/6, bleu 1/6',
        'Si la couleur correspond à votre choix, vous gagnez',
        'Multiplicateurs : rouge ×1,9, vert ×2,85, bleu ×5,7 — chaque couleur RTP 95 %'
      ],
      en: [
        'Pick a color: 🔴 red, 🟢 green, 🔵 blue',
        'The ball is drawn from a pool: red 3/6, green 2/6, blue 1/6',
        'If the color matches your choice, you win',
        'Multipliers: red ×1.9, green ×2.85, blue ×5.7 — every color RTP 95%'
      ]
    },
    payouts: {
      ar: '<tr><td>🔴 أحمر (احتمال 50%)</td><td>×1.9</td></tr><tr><td>🟢 أخضر (احتمال 33%)</td><td>×2.85</td></tr><tr><td>🔵 أزرق (احتمال 17%)</td><td>×5.7</td></tr>',
      fr: '<tr><td>🔴 Rouge (50%)</td><td>×1,9</td></tr><tr><td>🟢 Vert (33%)</td><td>×2,85</td></tr><tr><td>🔵 Bleu (17%)</td><td>×5,7</td></tr>',
      en: '<tr><td>🔴 Red (50%)</td><td>×1.9</td></tr><tr><td>🟢 Green (33%)</td><td>×2.85</td></tr><tr><td>🔵 Blue (17%)</td><td>×5.7</td></tr>'
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
  /* ═══ Lucky 7 ═══ */
  l7: {
    name: { ar: 'لاكي 7', fr: 'Lucky 7', en: 'Lucky 7' },
    goal: {
      ar: 'تنبأ بالرقم (1-9): أقل من 7 ×1.4 أو أكبر من 7 ×4.3، والرقم 7 بالضبط ×8.6!',
      fr: 'Prédisez le numéro (1-9) : moins de 7 ×1,4 ou plus de 7 ×4,3, ou exactement 7 ×8,6 !',
      en: 'Predict the number (1-9): below 7 ×1.4, above 7 ×4.3, or exactly 7 ×8.6!'
    },
    steps: {
      ar: [
        'اختر الرهان: "< 7" أو "= 7" أو "> 7"',
        'كُرة مرقمة (1-9) تُسحب عشوائياً',
        '"< 7" يفوز بالأرقام 1-6 (احتمال 6 من 9) — ×1.4',
        '"= 7" يفوز بالرقم 7 فقط (احتمال 1 من 9) — ×8.6',
        '"> 7" يفوز بالرقمين 8 و9 (احتمال 2 من 9) — ×4.3'
      ],
      fr: [
        'Choisissez le pari : "< 7", "= 7" ou "> 7"',
        'Une boule numérotée (1-9) est tirée au hasard',
        '"< 7" gagne avec 1-6 (6 chances sur 9) — ×1,4',
        '"= 7" gagne avec 7 seulement (1 sur 9) — ×8,6',
        '"> 7" gagne avec 8 et 9 (2 sur 9) — ×4,3'
      ],
      en: [
        'Pick your bet: "< 7", "= 7", or "> 7"',
        'A numbered ball (1-9) is drawn at random',
        '"< 7" wins with 1-6 (6 out of 9 chance) — ×1.4',
        '"= 7" wins with 7 only (1 in 9) — ×8.6',
        '"> 7" wins with 8 and 9 (2 out of 9) — ×4.3'
      ]
    },
    payouts: {
      ar: '<tr><td>< 7 (الأرقام 1-6)</td><td>×1.4</td></tr><tr><td>= 7 (الرقم 7 بالضبط)</td><td>×8.6</td></tr><tr><td>> 7 (الرقمان 8-9)</td><td>×4.3</td></tr>',
      fr: '<tr><td>< 7 (numéros 1-6)</td><td>×1,4</td></tr><tr><td>= 7 (exactement 7)</td><td>×8,6</td></tr><tr><td>> 7 (numéros 8-9)</td><td>×4,3</td></tr>',
      en: '<tr><td>< 7 (numbers 1-6)</td><td>×1.4</td></tr><tr><td>= 7 (exactly 7)</td><td>×8.6</td></tr><tr><td>> 7 (numbers 8-9)</td><td>×4.3</td></tr>'
    },
  },
  /* ═══ Sic Bo ═══ */
  sb: {
    name: { ar: 'سيك بو', fr: 'Sic Bo', en: 'Sic Bo' },
    goal: {
      ar: 'تنبأ بنتيجة 3 نردات: صغير/كبير بمضاعف ×2، أو تريبل (ثلاثة متطابقة) ×30!',
      fr: 'Prédisez le résultat de 3 dés : petit/grand ×2, ou triple (trois identiques) ×30 !',
      en: 'Predict the outcome of 3 dice: small/big ×2, or a triple (three of a kind) ×30!'
    },
    steps: {
      ar: [
        'اختر رهاناً: صغير (4-10)، كبير (11-17)، أو تريبل',
        'تُرمى 3 نردات (كل نرد من 1 إلى 6)',
        'الصغير/الكبير لا يشمل التريبلات',
        'تريبل = النردات الثلاثة متطابقة (مثل 3-3-3)',
        'أي تريبل يدفع ×30'
      ],
      fr: [
        'Choisissez un pari : petit (4-10), grand (11-17) ou triple',
        '3 dés sont lancés (chacun de 1 à 6)',
        'Petit/grand excluent les triples',
        'Triple = les trois dés identiques (ex. 3-3-3)',
        'Tout triple paie ×30'
      ],
      en: [
        'Choose a bet: small (4-10), big (11-17), or triple',
        '3 dice are rolled (each from 1 to 6)',
        'Small/big exclude triples',
        'Triple = all three dice identical (e.g. 3-3-3)',
        'Any triple pays ×30'
      ]
    },
    payouts: {
      ar: '<tr><td>صغير (مجموع 4-10، بدون تريبل)</td><td>×2</td></tr><tr><td>كبير (مجموع 11-17، بدون تريبل)</td><td>×2</td></tr><tr><td>تريبل (مثل 4-4-4)</td><td>×30</td></tr>',
      fr: '<tr><td>Petit (total 4-10, sans triple)</td><td>×2</td></tr><tr><td>Grand (total 11-17, sans triple)</td><td>×2</td></tr><tr><td>Triple (ex. 4-4-4)</td><td>×30</td></tr>',
      en: '<tr><td>Small (total 4-10, no triple)</td><td>×2</td></tr><tr><td>Big (total 11-17, no triple)</td><td>×2</td></tr><tr><td>Triple (e.g. 4-4-4)</td><td>×30</td></tr>'
    },
  },
  /* ═══ European Roulette ═══ */
  rl: {
    name: { ar: 'روليت أوروبي', fr: 'Roulette Européenne', en: 'European Roulette' },
    goal: {
      ar: 'تنبأ بلون أو نوع رقم الكرة على العجلة الأوروبية (37 خانة: 0-36). الأرقام الحمراء والسوداء والأخضر 0.',
      fr: 'Prédisez la couleur ou le type de numéro de la bille sur la roue européenne (37 cases : 0-36). Rouges, noirs et le vert 0.',
      en: 'Predict the color or number type of the ball on the European wheel (37 slots: 0-36). Reds, blacks, and green 0.'
    },
    steps: {
      ar: [
        'اختر رهانك: أحمر، أسود، أخضر (0)، زوجي، فردي، أو نطاق',
        'اضغط "دوران" لتحريك العجلة والكرة',
        'تستقر الكرة على رقم من 0 إلى 36',
        'أحمر/أسود/زوجي/فردي يدفع ×2',
        'الأخضر (0) يدفع ×14',
        'النطاقات 1-12 / 13-24 / 25-36 تدفع ×3، ونطاقا 1-18 / 19-36 يدفعان ×2'
      ],
      fr: [
        'Choisissez votre pari : rouge, noir, vert (0), pair, impair ou plage',
        'Cliquez sur "Tourner" pour lancer la roue et la bille',
        'La bille s\'arrête sur un numéro de 0 à 36',
        'Rouge/noir/pair/impair paie ×2',
        'Le vert (0) paie ×14',
        'Les plages 1-12 / 13-24 / 25-36 paient ×3, et 1-18 / 19-36 paient ×2'
      ],
      en: [
        'Pick your bet: red, black, green (0), even, odd, or a range',
        'Click "Spin" to spin the wheel and ball',
        'The ball lands on a number from 0 to 36',
        'Red/black/even/odd pays ×2',
        'Green (0) pays ×14',
        'Ranges 1-12 / 13-24 / 25-36 pay ×3, and 1-18 / 19-36 pay ×2'
      ]
    },
    payouts: {
      ar: '<tr><td>أحمر (18 رقماً)</td><td>×2</td></tr><tr><td>أسود (18 رقماً)</td><td>×2</td></tr><tr><td>فردي / زوجي</td><td>×2</td></tr><tr><td>1-18 / 19-36</td><td>×2</td></tr><tr><td>1-12 / 13-24 / 25-36</td><td>×3</td></tr><tr><td>أخضر (0)</td><td>×14</td></tr>',
      fr: '<tr><td>Rouge (18 numéros)</td><td>×2</td></tr><tr><td>Noir (18 numéros)</td><td>×2</td></tr><tr><td>Pair / Impair</td><td>×2</td></tr><tr><td>1-18 / 19-36</td><td>×2</td></tr><tr><td>1-12 / 13-24 / 25-36</td><td>×3</td></tr><tr><td>Vert (0)</td><td>×14</td></tr>',
      en: '<tr><td>Red (18 numbers)</td><td>×2</td></tr><tr><td>Black (18 numbers)</td><td>×2</td></tr><tr><td>Even / Odd</td><td>×2</td></tr><tr><td>1-18 / 19-36</td><td>×2</td></tr><tr><td>1-12 / 13-24 / 25-36</td><td>×3</td></tr><tr><td>Green (0)</td><td>×14</td></tr>'
    },
  },
  /* ═══ Baccarat ═══ */
  bc: {
    name: { ar: 'باكارات', fr: 'Baccarat', en: 'Baccarat' },
    goal: {
      ar: 'راهن على اليد الأقرب إلى 9: اللاعب (×2) أو البنك (×1.95) أو التعادل (×9).',
      fr: 'Pariez sur la main la plus proche de 9 : le joueur (×2), le banquier (×1.95) ou l\'égalité (×9).',
      en: 'Bet on the hand closest to 9: the player (×2), the banker (×1.95), or a tie (×9).'
    },
    steps: {
      ar: [
        'اختر رهانك: Player، Banker، أو Tie',
        'تُوزع ورقتان لكل من Player وBanker',
        'القيمة: الآس = 1، العشرة والصور = 0، الباقي حسب رقمه',
        'مجموع اليد = آخر رقم من مجموع القيم (مثلاً 17 = 7)',
        'اليد الأقرب إلى 9 تفوز — 8 أو 9 طبيعي ينهي الجولة فوراً',
        'اللاعب يسحب ورقة ثالثة إذا كان مجموعه ≤ 5',
        'البنك: يسحب إذا كان مجموعه ≤ 2 دائماً',
        'البنك على 3 يسحب إلا إذا كانت ثالثة اللاعب = 8',
        'البنك على 4 يسحب إذا كانت ثالثة اللاعب بين 2 و7',
        'البنك على 5 يسحب إذا كانت ثالثة اللاعب بين 4 و7',
        'البنك على 6 يسحب إذا كانت ثالثة اللاعب 6 أو 7',
        'البنك على 7 يقف، وبلا ثالثة للاعب يسحب البنك عند 0-5 فقط'
      ],
      fr: [
        'Choisissez votre pari : Player, Banker ou Tie',
        'Le joueur et le banquier reçoivent 2 cartes chacun',
        'Valeurs : As = 1, 10 et figures = 0, sinon la valeur nominale',
        'Total de la main = dernier chiffre de la somme (ex. 17 = 7)',
        'La main la plus proche de 9 gagne — un 8 ou 9 naturel stoppe le tour',
        'Le joueur tire une 3e carte si son total est ≤ 5',
        'Le banquier tire si son total est ≤ 2 (toujours)',
        'Banquier à 3 : tire sauf si la 3e du joueur = 8',
        'Banquier à 4 : tire si la 3e du joueur est entre 2 et 7',
        'Banquier à 5 : tire si la 3e du joueur est entre 4 et 7',
        'Banquier à 6 : tire si la 3e du joueur est 6 ou 7',
        'Banquier à 7 : reste ; sans 3e carte du joueur, tire seulement à 0-5'
      ],
      en: [
        'Pick your bet: Player, Banker, or Tie',
        'Both Player and Banker receive 2 cards each',
        'Values: Ace = 1, 10 and faces = 0, otherwise face value',
        'Hand total = last digit of the sum (e.g. 17 = 7)',
        'The hand closest to 9 wins — a natural 8 or 9 ends the round',
        'The Player draws a 3rd card when their total is ≤ 5',
        'The Banker draws when their total is ≤ 2 (always)',
        'Banker on 3: draws unless the Player 3rd card is 8',
        'Banker on 4: draws when the Player 3rd card is 2-7',
        'Banker on 5: draws when the Player 3rd card is 4-7',
        'Banker on 6: draws when the Player 3rd card is 6 or 7',
        'Banker on 7: stands; with no Player 3rd card, draws only at 0-5'
      ]
    },
    payouts: {
      ar: '<tr><td>Player يفوز</td><td>×2</td></tr><tr><td>Banker يفوز</td><td>×1.95</td></tr><tr><td>تعادل</td><td>×9</td></tr>',
      fr: '<tr><td>Player gagne</td><td>×2</td></tr><tr><td>Banker gagne</td><td>×1.95</td></tr><tr><td>Égalité</td><td>×9</td></tr>',
      en: '<tr><td>Player wins</td><td>×2</td></tr><tr><td>Banker wins</td><td>×1.95</td></tr><tr><td>Tie</td><td>×9</td></tr>'
    },
  },
  /* ═══ Dragon Tiger ═══ */
  dt: {
    name: { ar: 'دراغون تايغر', fr: 'Dragon Tiger', en: 'Dragon Tiger' },
    goal: {
      ar: 'تُسحب بطاقة للتنين وبطاقة للنمر — البطاقة الأعلى قيمة تفوز. تنبأ بالجانب الفائز!',
      fr: 'Une carte est tirée pour le dragon et une pour le tigre — la valeur la plus haute gagne. Devinez le vainqueur !',
      en: 'One card is dealt to the dragon and one to the tiger — the higher value wins. Predict the winner!'
    },
    steps: {
      ar: [
        'اختر رهانك: التنين، النمر، أو تعادل',
        'تُسحب بطاقة واحدة لكل جانب',
        'قارن القيم (الآس أعلى من الملك)',
        'الجانب الأعلى يفوز ×2',
        'تساوي القيم = تعادل ×11'
      ],
      fr: [
        'Choisissez votre pari : Dragon, Tigre ou Égalité',
        'Une carte est tirée pour chaque côté',
        'Comparez les valeurs (l\'As bat le Roi)',
        'Le côté le plus haut gagne ×2',
        'Valeurs égales = égalité ×11'
      ],
      en: [
        'Pick your bet: Dragon, Tiger, or Tie',
        'One card is drawn for each side',
        'Compare the values (Ace beats King)',
        'The higher side wins ×2',
        'Equal values = tie ×11'
      ]
    },
    payouts: {
      ar: '<tr><td>🐉 التنين يفوز</td><td>×2</td></tr><tr><td>🐯 النمر يفوز</td><td>×2</td></tr><tr><td>تعادل (نفس القيمة)</td><td>×11</td></tr>',
      fr: '<tr><td>🐉 Dragon gagne</td><td>×2</td></tr><tr><td>🐯 Tigre gagne</td><td>×2</td></tr><tr><td>Égalité (même valeur)</td><td>×11</td></tr>',
      en: '<tr><td>🐉 Dragon wins</td><td>×2</td></tr><tr><td>🐯 Tiger wins</td><td>×2</td></tr><tr><td>Tie (same value)</td><td>×11</td></tr>'
    },
  },
  /* ═══ Video Poker ═══ */
  vp: {
    name: { ar: 'فيديو بوكر', fr: 'Video Poker', en: 'Video Poker' },
    goal: {
      ar: 'كوّن أفضل يد بوكر من 5 بطاقات. احتفظ بالبطاقات الجيدة وأعد سحب الباقي — الأيدي الأعلى تدفع أكثر!',
      fr: 'Formez la meilleure main de poker avec 5 cartes. Gardez les bonnes cartes et remplacez le reste — les meilleures mains paient plus !',
      en: 'Make the best 5-card poker hand. Hold the good cards and redraw the rest — better hands pay more!'
    },
    steps: {
      ar: [
        'اضغط "توزيع" لسحب 5 بطاقات',
        'اضغط على أي بطاقة لتمييزها "احتفاظ" (أو أزل التمييز)',
        'اضغط "سحب" لاستبدال البطاقات غير المحتفظ بها',
        'تُقيَّم اليد النهائية حسب جدول الدفع',
        'زوج من J أو أعلى يبدأ الدفع'
      ],
      fr: [
        'Cliquez sur "Distribuer" pour recevoir 5 cartes',
        'Cliquez sur une carte pour la garder (ou retirer le marquage)',
        'Cliquez sur "Piocher" pour remplacer les autres',
        'La main finale est évaluée selon le tableau',
        'Une paire de Valets ou plus commence à payer'
      ],
      en: [
        'Click "Deal" to receive 5 cards',
        'Click a card to mark it as "held" (or unmark it)',
        'Click "Draw" to replace the unheld cards',
        'The final hand is rated by the pay table',
        'A pair of Jacks or higher starts paying'
      ]
    },
    payouts: {
      ar: '<tr><td>Royal Flush</td><td>×250</td></tr><tr><td>Straight Flush</td><td>×50</td></tr><tr><td>Four of a Kind</td><td>×25</td></tr><tr><td>Full House</td><td>×9</td></tr><tr><td>Flush</td><td>×6</td></tr><tr><td>Straight</td><td>×4</td></tr><tr><td>Three of a Kind</td><td>×3</td></tr><tr><td>Two Pair</td><td>×2</td></tr><tr><td>Jacks or Better (زوج J فأعلى)</td><td>×1</td></tr>',
      fr: '<tr><td>Royal Flush</td><td>×250</td></tr><tr><td>Quinte Flush</td><td>×50</td></tr><tr><td>Carré</td><td>×25</td></tr><tr><td>Full House</td><td>×9</td></tr><tr><td>Couleur</td><td>×6</td></tr><tr><td>Quinte</td><td>×4</td></tr><tr><td>Brelan</td><td>×3</td></tr><tr><td>Deux paires</td><td>×2</td></tr><tr><td>Jacks or Better (paire de Valets ou plus)</td><td>×1</td></tr>',
      en: '<tr><td>Royal Flush</td><td>×250</td></tr><tr><td>Straight Flush</td><td>×50</td></tr><tr><td>Four of a Kind</td><td>×25</td></tr><tr><td>Full House</td><td>×9</td></tr><tr><td>Flush</td><td>×6</td></tr><tr><td>Straight</td><td>×4</td></tr><tr><td>Three of a Kind</td><td>×3</td></tr><tr><td>Two Pair</td><td>×2</td></tr><tr><td>Jacks or Better (pair of 10 or higher)</td><td>×1</td></tr>'
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
  /* ═══ Andar Bahar ═══ */
  ab: {
    name: { ar: 'أندار باهار', fr: 'Andar Bahar', en: 'Andar Bahar' },
    goal: {
      ar: 'تُسحب بطاقة "Joker" ثم تُوزع البطاقات بالتناوب بين Andar وBahar. الجانب الذي تظهر فيه بطاقة بنفس رتبة الـ Joker أولاً يفوز.',
      fr: 'Une carte "Joker" est tirée, puis les cartes sont distribuées en alternance entre Andar et Bahar. Le côté où la carte de même rang apparaît en premier gagne.',
      en: 'A "Joker" card is drawn, then cards are dealt alternately to Andar and Bahar. The side where a matching-rank card appears first wins.'
    },
    steps: {
      ar: [
        'اختر الجانب: Andar أو Bahar (×1.9 لكلا الجانبين)',
        'تُسحب بطاقة Joker وتُعرض في الأعلى',
        'تُوزع البطاقات بالتناوب: Andar ثم Bahar ثم Andar...',
        'أول جانب تظهر فيه بطاقة بنفس رتبة الـ Joker يفوز',
        'الجانب الفائز يدفع ×1.9 — الربح يُحتسب من الرهان'
      ],
      fr: [
        'Choisissez votre côté : Andar ou Bahar (×1,9 des deux côtés)',
        'Une carte Joker est tirée et affichée en haut',
        'Les cartes sont distribuées en alternance : Andar, puis Bahar, puis Andar...',
        'Le premier côté où apparaît une carte du même rang que le Joker gagne',
        'Le côté gagnant paie ×1,9 — le gain est calculé sur la mise'
      ],
      en: [
        'Pick your side: Andar or Bahar (×1.9 on both sides)',
        'A Joker card is drawn and shown on top',
        'Cards are dealt alternately: Andar, then Bahar, then Andar...',
        'The first side to show a card matching the Joker\'s rank wins',
        'The winning side pays ×1.9 — payout is based on the bet'
      ]
    },
    payouts: {
      ar: '<tr><td>Andar يفوز</td><td>×1.9</td></tr><tr><td>Bahar يفوز</td><td>×1.9</td></tr>',
      fr: '<tr><td>Andar gagne</td><td>×1,9</td></tr><tr><td>Bahar gagne</td><td>×1,9</td></tr>',
      en: '<tr><td>Andar wins</td><td>×1.9</td></tr><tr><td>Bahar wins</td><td>×1.9</td></tr>'
    },
  },
  /* ═══ Crabbin ═══ */
  crabbin: {
    name: { ar: 'كريبن', fr: 'Crabbin', en: 'Crabbin' },
    goal: {
      ar: 'اضغط ابدأ ثم اختر سلطعوناً واحداً من 9. سلطعون ذهبي يربح بمضاعفه، وسلطعون أحمر يُخسر الرهان.',
      fr: 'Appuyez sur Démarrer puis choisissez un crabe parmi 9. Un crabe doré gagne son multiplicateur, un crabe rouge fait perdre la mise.',
      en: 'Press Start then pick one crab out of 9. A golden crab pays its multiplier, a red crab loses the bet.'
    },
    steps: {
      ar: ['اضغط زر «ابدأ الصيد» (يُسحب الرهان)', 'اختر أي سلطعون من الشبكة 3×3', 'تُكشف كل الخلايا: الذهبية ربح والحمراء خسارة', 'الذهب ×1.3/×1.4/×1.5/×1.6 حسب الخلية', 'الخسارة = فقدان الرهان كاملاً'],
      fr: ['Appuyez sur « Commencer » (la mise est débitée)', 'Choisissez n\'importe quel crabe de la grille 3×3', 'Toutes les cellules sont révélées : dorées gagnent, rouges perdent', 'Or ×1,3/×1,4/×1,5/×1,6 selon la cellule', 'Perdre = la mise entière est perdue'],
      en: ['Press the Start button (bet is taken)', 'Pick any crab from the 3×3 grid', 'All cells are revealed: golden win, red lose', 'Gold ×1.3/×1.4/×1.5/×1.6 depending on the cell', 'Losing = the whole bet is lost']
    },
    payouts: {
      ar: '<tr><td>سلطعون ذهبي ×1.3</td><td>×1.3</td></tr><tr><td>سلطعون ذهبي ×1.4</td><td>×1.4</td></tr><tr><td>سلطعون ذهبي ×1.5</td><td>×1.5</td></tr><tr><td>سلطعون ذهبي ×1.6</td><td>×1.6</td></tr><tr><td>سلطعون أحمر</td><td>×0</td></tr>',
      fr: '<tr><td>Crabe doré ×1,3</td><td>×1,3</td></tr><tr><td>Crabe doré ×1,4</td><td>×1,4</td></tr><tr><td>Crabe doré ×1,5</td><td>×1,5</td></tr><tr><td>Crabe doré ×1,6</td><td>×1,6</td></tr><tr><td>Crabe rouge</td><td>×0</td></tr>',
      en: '<tr><td>Golden crab ×1.3</td><td>×1.3</td></tr><tr><td>Golden crab ×1.4</td><td>×1.4</td></tr><tr><td>Golden crab ×1.5</td><td>×1.5</td></tr><tr><td>Golden crab ×1.6</td><td>×1.6</td></tr><tr><td>Red crab</td><td>×0</td></tr>'
    },
  },
  /* ═══ Fishing ═══ */
  fishing: {
    name: { ar: 'فيشينغ', fr: 'Fishing', en: 'Fishing' },
    goal: {
      ar: 'اختر سمكة وأطلق القذيفة. كل سمكة لها مضاعف واحتمال اصطياد: كلما كبر المضاعف قلّ الاحتمال.',
      fr: 'Choisissez un poisson et tirez. Chaque poisson a un multiplicateur et une probabilité de prise : plus le multiplicateur est grand, moins la probabilité est élevée.',
      en: 'Pick a fish and fire. Each fish has a multiplier and a catch chance: the bigger the multiplier, the lower the chance.'
    },
    steps: {
      ar: ['اختر إحدى السمكات الخمس', 'القذيفة تنطلق ويُحدَّد الاصطياد فوراً', 'اصطياد = ربح الرهان × المضاعف', 'هروب = خسارة الرهان'],
      fr: ['Choisissez l\'un des cinq poissons', 'Le boulet part et la prise est déterminée immédiatement', 'Prise = mise × multiplicateur', 'Évasion = mise perdue'],
      en: ['Pick one of the five fish', 'The shot fires and the catch is decided instantly', 'Catch = bet × multiplier', 'Escape = bet lost']
    },
    payouts: {
      ar: '<tr><td>سردين 🐟</td><td>×1.1 (90%)</td></tr><tr><td>دوراد 🐠</td><td>×1.3 (75%)</td></tr><tr><td>فوغو 🐡</td><td>×1.6 (60%)</td></tr><tr><td>أخطبوط 🐙</td><td>×2 (40%)</td></tr><tr><td>قرش 🦈</td><td>×3 (35%)</td></tr>',
      fr: '<tr><td>Sardine 🐟</td><td>×1,1 (90 %)</td></tr><tr><td>Dorade 🐠</td><td>×1,3 (75 %)</td></tr><tr><td>Fugu 🐡</td><td>×1,6 (60 %)</td></tr><tr><td>Poulpe 🐙</td><td>×2 (40 %)</td></tr><tr><td>Requin 🦈</td><td>×3 (35 %)</td></tr>',
      en: '<tr><td>Sardine 🐟</td><td>×1.1 (90%)</td></tr><tr><td>Dorade 🐠</td><td>×1.3 (75%)</td></tr><tr><td>Fugu 🐡</td><td>×1.6 (60%)</td></tr><tr><td>Octopus 🐙</td><td>×2 (40%)</td></tr><tr><td>Shark 🦈</td><td>×3 (35%)</td></tr>'
    },
  },
  /* ═══ Gates ═══ */
  gates: {
    name: { ar: 'بوابات زيوس', fr: 'Portes de Zeus', en: 'Gates of Zeus' },
    goal: {
      ar: 'اضغط ابدأ ثم افتح بوابة واحدة من أربع. ثلاث بوابات ذهبية تكافئك بمضاعفها وبوابة ملعونة تُخسر الرهان.',
      fr: 'Appuyez sur Démarrer puis ouvrez une porte parmi quatre. Trois portes dorées récompensent de leur multiplicateur, une porte maudite fait perdre la mise.',
      en: 'Press Start then open one of four gates. Three golden gates pay their multiplier, one cursed gate loses the bet.'
    },
    steps: {
      ar: ['اضغط زر «افتح البوابات» (يُسحب الرهان)', 'اختر إحدى البوابات الأربع', 'تُكشف البوابات: ذهبية 🗿 ربح / ملعونة 💀 خسارة', 'المضاعفات: ×1.2 / ×1.3 / ×1.3'],
      fr: ['Appuyez sur « Ouvrir les portes » (la mise est débitée)', 'Choisissez l\'une des quatre portes', 'Les portes sont révélées : dorée 🗿 gagne / maudite 💀 perd', 'Multiplicateurs : ×1,2 / ×1,3 / ×1,3'],
      en: ['Press Open gates (bet is taken)', 'Pick one of the four gates', 'Gates are revealed: golden 🗿 wins / cursed 💀 loses', 'Multipliers: ×1.2 / ×1.3 / ×1.3']
    },
    payouts: {
      ar: '<tr><td>بوابة ذهبية</td><td>×1.2 / ×1.3</td></tr><tr><td>بوابة ملعونة</td><td>×0</td></tr>',
      fr: '<tr><td>Porte dorée</td><td>×1,2 / ×1,3</td></tr><tr><td>Porte maudite</td><td>×0</td></tr>',
      en: '<tr><td>Golden gate</td><td>×1.2 / ×1.3</td></tr><tr><td>Cursed gate</td><td>×0</td></tr>'
    },
  },
  /* ═══ Lightning ═══ */
  lightning: {
    name: { ar: 'لايتنينغ', fr: 'Lightning', en: 'Lightning' },
    goal: {
      ar: 'اضغط ابدأ ثم اختر شرارة واحدة من 12. تسع برقات ذهبية تربح بمضاعفها وثلاث عواصف تُخسر الرهان.',
      fr: 'Appuyez sur Démarrer puis choisissez une étincelle parmi 12. Neuf éclairs dorés gagnent leur multiplicateur, trois tempêtes font perdre la mise.',
      en: 'Press Start then pick one spark out of 12. Nine golden bolts pay their multiplier, three storms lose the bet.'
    },
    steps: {
      ar: ['اضغط زر «أطلق البرق» (يُسحب الرهان)', 'اختر أي خلية برق من الشبكة', 'تُكشف كل الخلايا: برق ذهبي ⚡ ربح / عاصفة 🌩️ خسارة', 'المضاعفات: ×1.1 حتى ×1.5'],
      fr: ['Appuyez sur « Lancer l\'éclair » (la mise est débitée)', 'Choisissez n\'importe quelle cellule d\'éclair', 'Toutes les cellules sont révélées : éclair doré ⚡ gagne / tempête 🌩️ perd', 'Multiplicateurs : ×1,1 à ×1,5'],
      en: ['Press Strike (bet is taken)', 'Pick any lightning cell', 'All cells are revealed: golden bolt ⚡ wins / storm 🌩️ loses', 'Multipliers: ×1.1 up to ×1.5']
    },
    payouts: {
      ar: '<tr><td>برق ذهبي ×1.1 / ×1.2 / ×1.3 / ×1.4 / ×1.5</td><td>×1.1-×1.5</td></tr><tr><td>عاصفة</td><td>×0</td></tr>',
      fr: '<tr><td>Éclair doré ×1,1 / ×1,2 / ×1,3 / ×1,4 / ×1,5</td><td>×1,1-×1,5</td></tr><tr><td>Tempête</td><td>×0</td></tr>',
      en: '<tr><td>Golden bolt ×1.1 / ×1.2 / ×1.3 / ×1.4 / ×1.5</td><td>×1.1-×1.5</td></tr><tr><td>Storm</td><td>×0</td></tr>'
    },
  },
  /* ═══ Lottery ═══ */
  lottery: {
    name: { ar: 'لوترية', fr: 'Lottery', en: 'Lottery' },
    goal: {
      ar: 'اضغط ابدأ ثم اختر تذكرة واحدة من 6. ثلاث تذاكر رابحة بمضاعفات ×1.4/×1.9/×2.4 وثلاث فارغة.',
      fr: 'Appuyez sur Démarrer puis choisissez un billet parmi 6. Trois billets gagnants ×1,4/×1,9/×2,4 et trois vides.',
      en: 'Press Start then pick one ticket out of 6. Three winning tickets ×1.4/×1.9/×2.4 and three empty.'
    },
    steps: {
      ar: ['اضغط زر «اسحب تذكرة» (يُسحب الرهان)', 'اختر إحدى التذاكر الست', 'تُكشف التذاكر: ذهبية ربح / حمراء فارغة', 'الجوائز: ×1.4 / ×1.9 / ×2.4'],
      fr: ['Appuyez sur « Tirer un billet » (la mise est débitée)', 'Choisissez l\'un des six billets', 'Les billets sont révélés : dorés gagnent / rouges vides', 'Prix : ×1,4 / ×1,9 / ×2,4'],
      en: ['Press Draw ticket (bet is taken)', 'Pick one of the six tickets', 'Tickets are revealed: golden win / red empty', 'Prizes: ×1.4 / ×1.9 / ×2.4']
    },
    payouts: {
      ar: '<tr><td>تذكرة ذهبية</td><td>×1.4 / ×1.9 / ×2.4</td></tr><tr><td>تذكرة فارغة</td><td>×0</td></tr>',
      fr: '<tr><td>Billet doré</td><td>×1,4 / ×1,9 / ×2,4</td></tr><tr><td>Billet vide</td><td>×0</td></tr>',
      en: '<tr><td>Golden ticket</td><td>×1.4 / ×1.9 / ×2.4</td></tr><tr><td>Empty ticket</td><td>×0</td></tr>'
    },
  },
  /* ═══ Mahjong ═══ */
  mahjong: {
    name: { ar: 'ماهجونغ', fr: 'Mahjong', en: 'Mahjong' },
    goal: {
      ar: 'اضغط ابدأ ثم اختر بلاطة واحدة من 12. ثماني بلاطات ذهبية 🀄 تربح بمضاعفها وأربع حمراء 🀆 تُخسر الرهان.',
      fr: 'Appuyez sur Démarrer puis choisissez une tuile parmi 12. Huit tuiles dorées 🀄 gagnent leur multiplicateur, quatre rouges 🀆 font perdre la mise.',
      en: 'Press Start then pick one tile out of 12. Eight golden tiles 🀄 pay their multiplier, four red tiles 🀆 lose the bet.'
    },
    steps: {
      ar: ['اضغط زر «اقلب البلاطات» (يُسحب الرهان)', 'اختر أي بلاطة من الشبكة 4×3', 'تُكشف البلاطات: ذهبية 🀄 ربح / حمراء 🀆 خسارة', 'المضاعفات: ×1.3 حتى ×1.6'],
      fr: ['Appuyez sur « Retourner les tuiles » (la mise est débitée)', 'Choisissez n\'importe quelle tuile de la grille 4×3', 'Les tuiles sont révélées : dorées 🀄 gagnent / rouges 🀆 perdent', 'Multiplicateurs : ×1,3 à ×1,6'],
      en: ['Press Flip tiles (bet is taken)', 'Pick any tile from the 4×3 grid', 'Tiles are revealed: golden 🀄 win / red 🀆 lose', 'Multipliers: ×1.3 up to ×1.6']
    },
    payouts: {
      ar: '<tr><td>بلاطة ذهبية ×1.3 / ×1.4 / ×1.5 / ×1.6</td><td>×1.3-×1.6</td></tr><tr><td>بلاطة حمراء</td><td>×0</td></tr>',
      fr: '<tr><td>Tuile dorée ×1,3 / ×1,4 / ×1,5 / ×1,6</td><td>×1,3-×1,6</td></tr><tr><td>Tuile rouge</td><td>×0</td></tr>',
      en: '<tr><td>Golden tile ×1.3 / ×1.4 / ×1.5 / ×1.6</td><td>×1.3-×1.6</td></tr><tr><td>Red tile</td><td>×0</td></tr>'
    },
  },
  /* ═══ Money ═══ */
  money: {
    name: { ar: 'خزائن المال', fr: 'Money Safes', en: 'Money Safes' },
    goal: {
      ar: 'اضغط ابدأ ثم اختر خزنة واحدة من 9. ست خزائن ذهبية 🔒 تكشف كنزها 🪙 وثلاث قنابل 💥 تُخسر الرهان.',
      fr: 'Appuyez sur Démarrer puis choisissez un coffre parmi 9. Six coffres dorés 🔒 révèlent leur trésor 🪙, trois bombes 💥 font perdre la mise.',
      en: 'Press Start then pick one safe out of 9. Six golden safes 🔒 reveal their treasure 🪙, three bombs 💥 lose the bet.'
    },
    steps: {
      ar: ['اضغط زر «افتح الخزائن» (يُسحب الرهان)', 'اختر أي خزنة من الشبكة 3×3', 'تُكشف الخزائن: ذهبية 🔒→🪙 ربح / قنبلة 💥 خسارة', 'المضاعفات: ×1.3 حتى ×1.6'],
      fr: ['Appuyez sur « Ouvrir les coffres » (la mise est débitée)', 'Choisissez n\'importe quel coffre de la grille 3×3', 'Les coffres sont révélés : dorés 🔒→🪙 gagnent / bombe 💥 perd', 'Multiplicateurs : ×1,3 à ×1,6'],
      en: ['Press Open safes (bet is taken)', 'Pick any safe from the 3×3 grid', 'Safes are revealed: golden 🔒→🪙 win / bomb 💥 loses', 'Multipliers: ×1.3 up to ×1.6']
    },
    payouts: {
      ar: '<tr><td>خزنة ذهبية ×1.3 / ×1.4 / ×1.5 / ×1.6</td><td>×1.3-×1.6</td></tr><tr><td>قنبلة</td><td>×0</td></tr>',
      fr: '<tr><td>Coffre doré ×1,3 / ×1,4 / ×1,5 / ×1,6</td><td>×1,3-×1,6</td></tr><tr><td>Bombe</td><td>×0</td></tr>',
      en: '<tr><td>Golden safe ×1.3 / ×1.4 / ×1.5 / ×1.6</td><td>×1.3-×1.6</td></tr><tr><td>Bomb</td><td>×0</td></tr>'
    },
  },
  /* ═══ Olympus ═══ */
  olympus: {
    name: { ar: 'أوليمبوس', fr: 'Olympus', en: 'Olympus' },
    goal: {
      ar: 'اضغط ابدأ ثم اختر إلهاً واحداً من أربعة. ثلاثة آلهة ذهبية 🏛️ تُطلق البرق ⚡ والإله الملعون 💀 يُخسر الرهان.',
      fr: 'Appuyez sur Démarrer puis choisissez un dieu parmi quatre. Trois dieux dorés 🏛️ lancent l\'éclair ⚡, le dieu maudit 💀 fait perdre la mise.',
      en: 'Press Start then pick one god out of four. Three golden gods 🏛️ strike lightning ⚡, the cursed god 💀 loses the bet.'
    },
    steps: {
      ar: ['اضغط زر «استدعِ الآلهة» (يُسحب الرهان)', 'اختر إحدى الآلهة الأربع', 'تُكشف الآلهة: ذهبية 🏛️→⚡ ربح / ملعونة 💀 خسارة', 'المضاعفات: ×1.2 / ×1.3 / ×1.3'],
      fr: ['Appuyez sur « Invoquer les dieux » (la mise est débitée)', 'Choisissez l\'un des quatre dieux', 'Les dieux sont révélés : dorés 🏛️→⚡ gagnent / maudit 💀 perd', 'Multiplicateurs : ×1,2 / ×1,3 / ×1,3'],
      en: ['Press Summon gods (bet is taken)', 'Pick one of the four gods', 'Gods are revealed: golden 🏛️→⚡ win / cursed 💀 loses', 'Multipliers: ×1.2 / ×1.3 / ×1.3']
    },
    payouts: {
      ar: '<tr><td>إله ذهبي</td><td>×1.2 / ×1.3</td></tr><tr><td>إله ملعون</td><td>×0</td></tr>',
      fr: '<tr><td>Dieu doré</td><td>×1,2 / ×1,3</td></tr><tr><td>Dieu maudit</td><td>×0</td></tr>',
      en: '<tr><td>Golden god</td><td>×1.2 / ×1.3</td></tr><tr><td>Cursed god</td><td>×0</td></tr>'
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
  /* ═══ Rose ═══ */
  rose: {
    name: { ar: 'وردة الحظ', fr: 'Rose de chance', en: 'Lucky Rose' },
    goal: {
      ar: 'اضغط ابدأ ثم اختر وردة واحدة من 6. أربع وردات ذهبية 🌹 تربح بمضاعفها وصبارتان 🌵 تُخسران الرهان.',
      fr: 'Appuyez sur Démarrer puis choisissez une rose parmi 6. Quatre roses dorées 🌹 gagnent leur multiplicateur, deux cactus 🌵 font perdre la mise.',
      en: 'Press Start then pick one rose out of 6. Four golden roses 🌹 pay their multiplier, two cactus 🌵 lose the bet.'
    },
    steps: {
      ar: ['اضغط زر «ازرع الورد» (يُسحب الرهان)', 'اختر أي وردة من الصف', 'تُكشف الورود: ذهبية 🌹 ربح / صبار 🌵 خسارة', 'المضاعفات: ×1.2 حتى ×1.7'],
      fr: ['Appuyez sur « Planter la rose » (la mise est débitée)', 'Choisissez n\'importe quelle rose de la rangée', 'Les roses sont révélées : dorées 🌹 gagnent / cactus 🌵 perd', 'Multiplicateurs : ×1,2 à ×1,7'],
      en: ['Press Plant rose (bet is taken)', 'Pick any rose from the row', 'Roses are revealed: golden 🌹 win / cactus 🌵 loses', 'Multipliers: ×1.2 up to ×1.7']
    },
    payouts: {
      ar: '<tr><td>وردة ذهبية ×1.2 / ×1.3 / ×1.5 / ×1.7</td><td>×1.2-×1.7</td></tr><tr><td>صبار</td><td>×0</td></tr>',
      fr: '<tr><td>Rose dorée ×1,2 / ×1,3 / ×1,5 / ×1,7</td><td>×1,2-×1,7</td></tr><tr><td>Cactus</td><td>×0</td></tr>',
      en: '<tr><td>Golden rose ×1.2 / ×1.3 / ×1.5 / ×1.7</td><td>×1.2-×1.7</td></tr><tr><td>Cactus</td><td>×0</td></tr>'
    },
  },
  /* ═══ Sweet Bonanza ═══ */
  "sweet-bonanza": {
    name: { ar: 'سويت بونانزا', fr: 'Sweet Bonanza', en: 'Sweet Bonanza' },
    goal: {
      ar: 'اضغط ابدأ ثم اختر حلوى واحدة من 12. ثماني حلوى لذيذة 🍬 تربح بمضاعفها وأربع قنابل 💥 تُخسر الرهان.',
      fr: 'Appuyez sur Démarrer puis choisissez un bonbon parmi 12. Huit bonbons sucrés 🍬 gagnent leur multiplicateur, quatre bombes 💥 font perdre la mise.',
      en: 'Press Start then pick one candy out of 12. Eight sweet candies 🍬 pay their multiplier, four bombs 💥 lose the bet.'
    },
    steps: {
      ar: ['اضغط زر «فجّر الحلوى» (يُسحب الرهان)', 'اختر أي حلوى من الشبكة 4×3', 'تُكشف الحلوى: لذيذة 🍬 ربح / قنبلة 💥 خسارة', 'المضاعفات: ×1.2 حتى ×1.8'],
      fr: ['Appuyez sur « Éclater les bonbons » (la mise est débitée)', 'Choisissez n\'importe quel bonbon de la grille 4×3', 'Les bonbons sont révélés : sucrés 🍬 gagnent / bombe 💥 perd', 'Multiplicateurs : ×1,2 à ×1,8'],
      en: ['Press Pop candies (bet is taken)', 'Pick any candy from the 4×3 grid', 'Candies are revealed: sweet 🍬 win / bomb 💥 loses', 'Multipliers: ×1.2 up to ×1.8']
    },
    payouts: {
      ar: '<tr><td>حلوى 🍭 ×1.2</td><td>×1.2</td></tr><tr><td>حلوى 🍬 ×1.3</td><td>×1.3</td></tr><tr><td>شوكولاتة 🍫 ×1.4</td><td>×1.4</td></tr><tr><td>دونات 🍩 ×1.5</td><td>×1.5</td></tr><tr><td>كب كيك 🧁 ×1.8</td><td>×1.8</td></tr><tr><td>قنبلة</td><td>×0</td></tr>',
      fr: '<tr><td>Bonbon 🍭 ×1,2</td><td>×1,2</td></tr><tr><td>Bonbon 🍬 ×1,3</td><td>×1,3</td></tr><tr><td>Chocolat 🍫 ×1,4</td><td>×1,4</td></tr><tr><td>Donut 🍩 ×1,5</td><td>×1,5</td></tr><tr><td>Cupcake 🧁 ×1,8</td><td>×1,8</td></tr><tr><td>Bombe</td><td>×0</td></tr>',
      en: '<tr><td>Lollipop 🍭 ×1.2</td><td>×1.2</td></tr><tr><td>Candy 🍬 ×1.3</td><td>×1.3</td></tr><tr><td>Chocolate 🍫 ×1.4</td><td>×1.4</td></tr><tr><td>Donut 🍩 ×1.5</td><td>×1.5</td></tr><tr><td>Cupcake 🧁 ×1.8</td><td>×1.8</td></tr><tr><td>Bomb</td><td>×0</td></tr>'
    },
  },
  bl8: {
    name: { ar: 'البلياردو — 8-بول (WPA) 🎱', da: 'البلياردو — 8-بول (WPA) 🎱', fr: 'Billard — 8-Ball (WPA) 🎱', en: 'Billiards — 8-Ball (WPA) 🎱' },
    goal: {
      ar: 'أدخل كل كرات مجموعتك (الممتلئة 1-7 أو المخططة 9-15) ثم أدخل الكرة 8 إدخالاً قانونياً لتفوز بالإطار.',
      da: 'دخل كاع كورات مجموعة ديالك (الممتلئة 1-7 ولا المخططة 9-15) ومن بعد دخل كورة 8 بقانون باش تربح الشوط.',
      fr: 'Empochez toutes les boules de votre groupe (pleines 1-7 ou rayées 9-15) puis la 8 légalement pour gagner la manche.',
      en: 'Pot every ball of your group (solids 1-7 or stripes 9-15) then pot the 8 legally to win the frame.'
    },
    steps: {
      ar: [
        'اختر الصنف (8-بول متاح الآن؛ بلاك بول وسنوكر وكاروم قريباً) والرهان ومظهر الطاولة',
        'اختر الوضع: وجه لوجه على جهاز واحد، أو ضد الحاسوب، أو غرفة أونلاين برهان',
        'الكسر: البيضاء من خلف خط الكسر تضرب المثلث — كسر قانوني = دخول كرة أو ملامسة 4 كرات للوسائد',
        'الطاولة مفتوحة بعد الكسر: أول كرة تُدخلها قانونياً تحدّد مجموعتك ومجموعة الخصم',
        'وجّه بالسحب على الطاولة، اضبط القوة بالشرائط والدوران بالقرص الأبيض، ثم اضغط ✔️',
        'نظّف مجموعتك ثم أدخل الكرة 8 — إدخالها مبكراً أو مع مخالفة يخسرك الإطار فوراً'
      ],
      da: [
        'عزل الصنف (8-بول متاح دابا؛ بلاك بول وسنوكر وكاروم قريباً) والرهان ومظهر الطبلة',
        'عزل الوضع: وجه لوجه على جهاز واحد، ولا ضد الحاسوب، ولا بيت أونلاين برهان',
        'الكسر: البيضة من ورا خط الكسر كتضرب المثلث — كسر قانوني = كورة تدخل ولا 4 كورات يلمسو الباندة',
        'الطبلة محلولة من بعد الكسر: أول كورة دخلتيها بقانون هي اللي كتحدد مجموعة ديالك وديال الخصم',
        'وجّه بالجر على الطبلة، ضبط القوة بالشرائط والدوران بالقرص الأبيض، ومن بعد ضغط ✔️',
        'نقّي مجموعة ديالك ومن بعد دخل كورة 8 — إلا دخلتيها بكري ولا مع مخالفة كتخسر الشوط دغيا'
      ],
      fr: [
        'Choisissez la discipline (8-Ball disponible ; Blackball, Snooker et Carom bientôt), la mise et l\'apparence',
        'Choisissez le mode : face à face sur un appareil, contre l\'IA, ou salle en ligne avec mise',
        'La casse : la blanche derrière la ligne de casse frappe le triangle — casse légale = une empochée ou 4 bandes touchées',
        'Table ouverte après la casse : la première boule empochée légalement définit votre groupe',
        'Visez en glissant sur la table, réglez la puissance et l\'effet, puis appuyez sur ✔️',
        'Nettoyez votre groupe puis empochez la 8 — trop tôt ou sur faute, vous perdez la manche'
      ],
      en: [
        'Pick the discipline (8-Ball live; Blackball, Snooker and Carom soon), the stake and the table look',
        'Pick the mode: hot-seat on one device, versus the AI, or an online room with a stake',
        'The break: the cue ball behind the head string strikes the rack — legal break = a ball potted or 4 balls to a rail',
        'The table is open after the break: the first ball you pot legally sets your group and your opponent\'s',
        'Aim by dragging on the table, set power with the slider and spin with the white disc, then press ✔️',
        'Clear your group then pot the 8 — potted early or on a foul, you lose the frame at once'
      ]
    },
    details: {
      ar: [
        { h: 'المواصفات (WPA)', items: [
          'سطح لعب 9 أقدام ≈ 100 × 50 بوصة (نسبة 2:1) و6 جيوب',
          '16 كرة: بيضاء + 15 كرة مرقمة (1-7 ممتلئة، 9-15 مخططة، 8 سوداء)',
          'الفيزياء بخطوة زمنية ثابتة 240Hz — نفس الضربة تعطي نفس النتيجة على كل الأجهزة'
        ]},
        { h: 'الأخطاء (كرة بيد للخصم)', items: [
          'SCRATCH: سقوط الكرة البيضاء في جيب أو خروجها من الطاولة',
          'NO_CONTACT: عدم ملامسة أي كرة',
          'ILLEGAL_FIRST_CONTACT: ملامسة كرة ليست من مجموعتك أولاً (أو الكرة 8 والطاولة مفتوحة)',
          'NO_RAIL: عدم وصول أي كرة إلى وسادة بعد التلامس وعدم دخول كرة',
          'BALL_OFF_TABLE: إخراج كرة من الطاولة (تُعاد إلى نقطة القدم)',
          'ILLEGAL_BREAK: كسر لا يُدخل كرة ولا يلمس 4 كرات الوسائد'
        ]},
        { h: 'الكرة 8', items: [
          'دخولها في الكسر: تُعاد إلى نقطة القدم والإطار يستمر (بلا خسارة)',
          'إدخالها قبل تنظيف مجموعتك: خسارة فورية',
          'إدخالها مع أي مخالفة: خسارة فورية',
          'إدخالها قانونياً بعد تنظيف المجموعة: فوز'
        ]}
      ],
      da: [
        { h: 'المواصفات (WPA)', items: [
          'سطح اللعب 9 قدم ≈ 100 × 50 بوصة (2:1) و6 حفر',
          '16 كورة: بيضة + 15 مرقمة (1-7 ممتلئة، 9-15 مخططة، 8 كحلة)',
          'الفيزياء بخطوة ثابتة 240Hz — نفس الضربة كتعطي نفس النتيجة فكاع الأجهزة'
        ]},
        { h: 'المخالفات (كورة بيد للخصم)', items: [
          'SCRATCH: البيضة طاحت فالحفرة ولا خرجات من الطبلة',
          'NO_CONTACT: ما لمس حتى كورة',
          'ILLEGAL_FIRST_CONTACT: لمس كورة ماشي من مجموعة ديالك أول (ولا 8 والطبلة محلولة)',
          'NO_RAIL: حتى كورة ما وصلت للباند من بعد التلامس وما دخلات حتى كورة',
          'BALL_OFF_TABLE: كورة خرجات من الطبلة (كترجع لنقطة الرجل)',
          'ILLEGAL_BREAK: كسر ما دخل كورة وما لمس 4 كورات الباند'
        ]},
        { h: 'كورة 8', items: [
          'إلا دخلات فالكسر: كترجع لنقطة الرجل والشوط كيكمل (بلا خسارة)',
          'إلا دخلتيها قبل تنقّي مجموعة ديالك: خسارة ديال الوقت',
          'إلا دخلتيها مع أي مخالفة: خسارة ديال الوقت',
          'إلا دخلتيها بقانون من بعد ما نقّيتي مجموعة ديالك: ربح'
        ]}
      ],
      fr: [
        { h: 'Spécifications (WPA)', items: [
          'Surface de 9 pieds ≈ 100 × 50 pouces (ratio 2:1) et 6 poches',
          '16 boules : blanche + 15 numérotées (1-7 pleines, 9-15 rayées, 8 noire)',
          'Physique à pas de temps fixe 240 Hz — le même coup donne le même résultat sur tous les appareils'
        ]},
        { h: 'Fautes (bille en main)', items: [
          'SCRATCH : la blanche est empochée ou sort de la table',
          'NO_CONTACT : aucune boule touchée',
          'ILLEGAL_FIRST_CONTACT : première boule touchée hors de votre groupe (ou la 8 sur table ouverte)',
          'NO_RAIL : aucune boule à la bande après contact et aucune empochée',
          'BALL_OFF_TABLE : une boule quitte la table (elle est respotée)',
          'ILLEGAL_BREAK : casse sans empochée et sans 4 bandes touchées'
        ]},
        { h: 'La boule 8', items: [
          'Empochée à la casse : respotée, la manche continue (pas de perte)',
          'Empochée avant d\'avoir nettoyé votre groupe : perte immédiate',
          'Empochée sur une faute : perte immédiate',
          'Empochée légalement après nettoyage du groupe : victoire'
        ]}
      ],
      en: [
        { h: 'Specifications (WPA)', items: [
          '9-foot playing surface ≈ 100 × 50 inches (2:1 ratio) with 6 pockets',
          '16 balls: cue ball + 15 numbered (1-7 solids, 9-15 stripes, black 8)',
          'Physics on a fixed 240 Hz timestep — the same shot yields the same result on every device'
        ]},
        { h: 'Fouls (ball in hand)', items: [
          'SCRATCH: the cue ball is pocketed or leaves the table',
          'NO_CONTACT: no ball is struck',
          'ILLEGAL_FIRST_CONTACT: first ball struck is outside your group (or the 8 on an open table)',
          'NO_RAIL: no ball reaches a rail after contact and nothing is potted',
          'BALL_OFF_TABLE: a ball leaves the table (it is re-spotted)',
          'ILLEGAL_BREAK: a break with no pot and fewer than 4 balls to a rail'
        ]},
        { h: 'The 8 ball', items: [
          'Potted on the break: re-spotted and the frame continues (no loss)',
          'Potted before clearing your group: immediate loss',
          'Potted along with any foul: immediate loss',
          'Potted legally after clearing your group: win'
        ]}
      ]
    },
    payouts: {
      ar: '<tr><td>الفوز بالإطار في غرفة برهان</td><td>الرهان × 2</td></tr><tr><td>الوجه لوجه أو ضد الحاسوب</td><td>بلا تسجيل مالي</td></tr><tr><td>الانسحاب أو إدخال 8 مخالفاً</td><td>خسارة الرهان</td></tr>',
      da: '<tr><td>الربح بالشوط فبيت برهان</td><td>الرهان × 2</td></tr><tr><td>وجه لوجه ولا ضد الحاسوب</td><td>بلا تسجيل مالي</td></tr><tr><td>الانسحاب ولا إدخال 8 مخالف</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>Victoire en salle avec mise</td><td>Mise × 2</td></tr><tr><td>Face à face ou contre l\'IA</td><td>Aucun enjeu financier</td></tr><tr><td>Abandon ou 8 fautive</td><td>Perte de la mise</td></tr>',
      en: '<tr><td>Winning the frame in a staked room</td><td>Stake × 2</td></tr><tr><td>Hot-seat or versus AI</td><td>No money recorded</td></tr><tr><td>Resigning or fouling the 8</td><td>Loss of the stake</td></tr>'
    },
  },
  blbb: {
    name: {
      ar: 'البلياردو الإنجليزي — Blackball (EPA) 🔴',
      da: 'البلياردو الإنجليزي — Blackball (EPA) 🔴',
      fr: 'Blackball — Billard Anglais (EPA) 🔴',
      en: 'Blackball — English Pool (EPA) 🔴'
    },
    goal: {
      ar: 'نظّف مجموعتك (7 كرات حمراء أو صفراء) ثم أدخل السوداء إدخالاً قانونياً. الخطأ يعطي الخصم كرة يد في أي مكان، لكن الإطار لا يُخسر إلا بالسوداء.',
      da: 'نقّي مجموعة ديالك (7 كورات حمر ولا صفر) ومن بعد دخل الكحلاء بقانون. الخطأ كيعطي للخصم كورة يد فأي بلاصة، ولكن الشوط كيتخسر غير بالكحلاء.',
      fr: 'Nettoyez votre groupe (7 rouges ou jaunes) puis empochez la noire légalement. Une faute donne bille en main partout, mais la manche ne se perd que sur la noire.',
      en: 'Clear your group (7 reds or yellows) then pot the black legally. A foul gives the opponent ball in hand anywhere, but the frame is only lost on the black.'
    },
    steps: {
      ar: [
        'الكسر من الباولك (خلف خط خُمس الطاولة): كسر قانوني = 3 نقاط على الأقل — نقطة لكل كرة دخلت (بما فيها السوداء) أو تجاوزت خط الوسط كاملة',
        'كسر غير قانوني: إعادة الرفّ إلزامية والخصم يختار أن يكسر أو يعيد الكسر لك',
        'لا تعيين للمجموعات في الكسر أبداً: كرات الكسر لا تُحتسب، وتسقط السوداء من الكسر فتُعاد إلى نقطة الرفّ',
        'الطاولة مفتوحة بعد الكسر: أول إدخال قانوني يحدد مجموعتك — وإن دخل لونان معاً فالمجموعة هي لون أول كرة لُمست',
        'الخطأ القياسي (سقوط البيضاء، عدم لمس كرة، لمس كرة الخصم أولاً، ضربة بلا إدخال ولا وسادة...) = كرة يد للخصم في أي مكان بزيارة واحدة',
        'إدخال كرة الخصم وحدها بعد لمس كرّتك أولاً = خسارة دور فقط (بلا خطأ) والبيضاء من حيث وقفت',
        'خسارة الإطار: السوداء مع مخالفة، أو السوداء وكرات مجموعتك باقية (وإن دخلت آخر كرة معها بنفس الضربة)',
        'حالات خاصة: جمود = إعادة رفّ ويكسر من كسر أصلاً، تدخل خارجي = إرجاع الكرات بلا عقوبة، كرة ملتصقة = لعب بعيداً عنها 90 درجة على الأقل'
      ],
      da: [
        'الكسر من الباولك (ورا خط خُمس الطبلة): كسر قانوني = 3 نقاط ولا كتر — نقطة لكل كورة دخلت (حتى الكحلاء) ولا فاتت خط الوسط كاملة',
        'كسر ماشي قانوني: الرف كيرجع غصبا والخصم كيختار يكسر ولا يعاود ليك الكسر',
        'ماكاينش تعيين للمجموعات فالكسر أبدا: كورات الكسر ماكتحسبش، والكحلاء إلا طاحت فالكسر كترجع لنقطة الرف',
        'الطبلة محلولة من بعد الكسر: أول كورة دخلتيها بقانون كتحدد مجموعة ديالك — إلا دخلو جوج ألوان المجموعة هي لون أول كورة تلمسات',
        'الخطأ العادي (البيضة طاحت، ماتلمساتش كورة، كورة الخصم تلمسات الأول، ضربة بلا إدخال ولا باندة...) = كورة يد للخصم فأي بلاصة بزيارة وحدة',
        'كورة الخصم دخلت بوحدها من بعد ما لمستي كورتك الأول = غير خسارة دور (بلا خطأ) والبيضة منين وقفات',
        'خسارة الشوط: الكحلاء مع مخالفة، ولا الكحلاء وكورات مجموعة ديالك مازالين (حتى إلا دخلت آخر كورة معها فنفس الضربة)',
        'حالات خاصة: الجمود = إعادة رف وكيسبق اللي كسر الأول، تدخل خارجي = الكرات كيرجعو بلا عقوبة، كورة لازقة = لعب بعيد منها 90 درجة ولا كتر'
      ],
      fr: [
        'Casse depuis la zone de casse (derrière la ligne du cinquième) : casse légale = 3 points minimum — 1 point par boule empochée (noire comprise) ou ayant entièrement dépassé la ligne médiane',
        'Casse illégale : remise du triangle obligatoire, l\'adversaire choisit de casser ou de vous rendre la casse',
        'Aucune attribution de groupe sur la casse : les boules de la casse ne comptent pas, et la noire empochée à la casse est remise sur sa mouche',
        'Table ouverte après la casse : la première boule empochée légalement définit le groupe — si deux couleurs tombent, le groupe est celui de la première boule touchée',
        'Faute standard (blanche empochée, aucun contact, boule adverse touchée d\'abord, coup sans empochée ni bande...) = bille en main partout pour l\'adversaire, une seule visite',
        'Empocher seule une boule adverse après avoir touché la vôtre = simple perte de main (sans faute), la blanche reste où elle est',
        'Manche perdue : la noire avec une faute, ou la noire alors que votre groupe n\'est pas fini (même si la dernière tombe avec elle au même coup)',
        'Cas spéciaux : impasse = remise du triangle par le premier casseur ; intervention extérieure = boules replacées sans pénalité ; bille collée = jouer en s\'en éloignant d\'au moins 90°'
      ],
      en: [
        'Break from baulk (behind the one-fifth line): legal break = at least 3 points — 1 point per ball potted (black included) or wholly past the centre line',
        'Illegal break: mandatory re-rack; the opponent chooses to break or hand the break back',
        'Groups are never assigned on the break: break pots are disregarded, and the black potted on the break is re-spotted',
        'The table is open after the break: the first legal pot sets the group — if both colours drop, the group is that of the first ball contacted',
        'Standard foul (cue potted, no contact, opponent\'s ball first, no pot and no cushion...) = ball in hand anywhere for the opponent, one visit',
        'Potting only an opponent\'s ball after striking your own first = loss of turn only (no foul), cue ball as it lies',
        'Loss of frame: the black with a foul, or the black while your group remains (even if the last group ball drops in the same shot)',
        'Special states: stalemate = re-rack by the original breaker; outside interference = balls replaced, no penalty; touching ball = play away at 90° or more'
      ]
    },
    details: {
      ar: [
        { h: 'المواصفات (EPA v2d)', items: [
          '16 كرة: بيضاء + 7 حمراء + 7 صفراء + سوداء',
          'خط الكسر عند خُمس طول الطاولة — المنطقة خلفه هي الباولك',
          'الفيزياء بخطوة ثابتة 240Hz — الضربة نفسها تعطي النتيجة نفسها على كل الأجهزة'
        ]},
        { h: 'الفرق الجوهري عن 8-Ball', items: [
          'الخطأ لا يخسرك الإطار — كرة يد للخصم فقط',
          'إدخال كرة الخصم وحدها ليس خطأً بل خسارة دور',
          'الكسر بالنقاط (3+) وليس بالكرة/الوسائد',
          'المجموعة لا تُحدد في الكسر مطلقاً'
        ]},
        { h: 'خسارة الإطار (6f)', items: [
          'السوداء مع مخالفة في نفس الضربة',
          'السوداء وكرات مجموعتك ما زالت على الطاولة',
          'آخر كرة من مجموعتك مع السوداء بنفس الضربة'
        ]}
      ],
      da: [
        { h: 'المواصفات (EPA v2d)', items: [
          '16 كورة: بيضة + 7 حمر + 7 صفر + كحلاء',
          'خط الكسر فخُمس طول الطبلة — البلاصة وراه هي الباولك',
          'الفيزياء بخطوة ثابتة 240Hz — نفس الضربة كتعطي نفس النتيجة فكل الأجهزة'
        ]},
        { h: 'الفرق الكبير مع 8-Ball', items: [
          'الخطأ ماكيخسرش الشوط — غير كورة يد للخصم',
          'كورة الخصم بوحدها ماشي خطأ، غير خسارة دور',
          'الكسر بالنقاط (3+) وماشي بالكورة/الباندات',
          'المجموعة ماكتحددش فالكسر أبدا'
        ]},
        { h: 'خسارة الشوط (6f)', items: [
          'الكحلاء مع مخالفة فنفس الضربة',
          'الكحلاء وكورات مجموعة ديالك مازال فالطبلة',
          'آخر كورة ديالك مع الكحلاء فنفس الضربة'
        ]}
      ],
      fr: [
        { h: 'Spécifications (EPA v2d)', items: [
          '16 boules : blanche + 7 rouges + 7 jaunes + noire',
          'Ligne de casse au cinquième de la table — la zone derrière est le baulk',
          'Physique à pas fixe 240 Hz — le même coup donne le même résultat sur tous les appareils'
        ]},
        { h: 'Différences clés avec le 8-Ball', items: [
          'Une faute ne perd pas la manche — seulement bille en main',
          'Empocher seul une boule adverse n\'est pas une faute, juste une perte de main',
          'Casse aux points (3+) et non à la boule/bande',
          'Le groupe n\'est jamais défini à la casse'
        ]},
        { h: 'Manche perdue (6f)', items: [
          'La noire avec une faute au même coup',
          'La noire alors que votre groupe reste sur la table',
          'La dernière boule du groupe avec la noire au même coup'
        ]}
      ],
      en: [
        { h: 'Specifications (EPA v2d)', items: [
          '16 balls: cue + 7 reds + 7 yellows + black',
          'Break line at one fifth of the table — the area behind it is baulk',
          'Fixed-step 240 Hz physics — the same shot gives the same result on every device'
        ]},
        { h: 'Key differences from 8-Ball', items: [
          'A foul does not lose the frame — only ball in hand',
          'Potting only an opponent\'s ball is no foul, just loss of turn',
          'Points break (3+) rather than ball/rail requirement',
          'The group is never set on the break'
        ]},
        { h: 'Loss of frame (6f)', items: [
          'The black with a foul in the same shot',
          'The black while your group balls remain on the table',
          'Your last group ball with the black in the same shot'
        ]}
      ]
    },
    payouts: {
      ar: '<tr><td>الفوز بالإطار في غرفة برهان</td><td>الرهان × 2</td></tr><tr><td>الوجه لوجه أو ضد الحاسوب</td><td>بلا تسجيل مالي</td></tr><tr><td>الانسحاب أو إدخال السوداء مخالفاً</td><td>خسارة الرهان</td></tr>',
      da: '<tr><td>الربح بالشوط فبيت برهان</td><td>الرهان × 2</td></tr><tr><td>وجه لوجه ولا ضد الحاسوب</td><td>بلا تسجيل مالي</td></tr><tr><td>الانسحاب ولا الكحلاء مخالفة</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>Victoire en salle avec mise</td><td>Mise × 2</td></tr><tr><td>Face à face ou contre l\'IA</td><td>Sans enjeu financier</td></tr><tr><td>Abandon ou noire fautive</td><td>Perte de la mise</td></tr>',
      en: '<tr><td>Frame win in a staked room</td><td>Stake × 2</td></tr><tr><td>Hot-seat or versus AI</td><td>No financial stake</td></tr><tr><td>Resign or black on a foul</td><td>Stake lost</td></tr>'
    },
  },
  blsn: {
    name: {
      ar: 'السنوكر — Snooker (WPBSA) 🟥',
      da: 'السنوكر — Snooker (WPBSA) 🟥',
      fr: 'Snooker — Règles WPBSA 🟥',
      en: 'Snooker — WPBSA Rules 🟥'
    },
    goal: {
      ar: 'اجمع نقاطاً أكثر من خصمك: أدخل حمراء (نقطة) ثم لوناً مرشَّحاً (2-7) بالتناوب، وبعد آخر حمراء نظّف الألوان تصاعدياً حتى السوداء. الأخطاء تمنح الخصم نقاطاً — لا كرة يد حرة كما في البولينغ الأمريكي.',
      da: 'جمع نقاط كتر من الخصم ديالك: دخل حمرة (نقطة) من بعد لون مرشّح (2-7) بالتناوب، ومن بعد آخر حمرة نقّي الألوان بالتصاعد حتى الكحلاء. الأخطاء كيعطيو نقاط للخصم — ماشي كورة يد حرة بحال فالبلياردو الأمريكي.',
      fr: 'Marquez plus de points que votre adversaire : empochez une rouge (1 point) puis une couleur nommée (2-7) en alternance, puis après la dernière rouge, nettoyez les couleurs en ordre croissant jusqu\'à la noire. Les fautes donnent des points à l\'adversaire — pas de bille en main libre.',
      en: 'Outscore your opponent: pot a red (1 point) then a nominated colour (2-7) alternately; after the last red, clear the colours in ascending order up to the black. Fouls award points to the opponent — no free ball-in-hand.'
    },
    steps: {
      ar: [
        '22 كرة على طاولة 12 قدماً: بيضاء + 15 حمراء (نقطة لكل منها) + 6 ألوان على بقعها: صفراء 2، خضراء 3، بنية 4، زرقاء 5، وردية 6، سوداء 7',
        'البداية من داخل قوس D خلف خط الباولك — وأي سقوط للبيضاء يعيدها إلى D',
        'ما دامت الحُمر على الطاولة: أدخل حمراء (أو أكثر بنفس الضربة — نقطة لكل منها) ثم رشّح لوناً بالأزرار وأدخله — اللون المُدخل يعود إلى بقعته',
        'بعد آخر حمراء ولونها: مرحلة التنظيف — الألوان تُدخل تصاعدياً صفراء→خضراء→بنية→زرقاء→وردية→سوداء وتبقى في الجيوب',
        'الأخطاء = نقاط للخصم (4 على الأقل، وحتى 7): عدم لمس أي كرة، لمس/إدخال كرة غير القانونية أولاً، سقوط البيضاء، إخراج كرة، التماس المزدوج (إلا حمراوان)',
        'في ضربة الخطأ لا يُسجَّل شيء وتعود الألوان المُدخلة إلى بقعها — والأخطاء المتعددة تُحتسب بأعلاها فقط',
        'السوداء الأخيرة تحسم الإطار؛ والتعادل يعيد السوداء إلى بقعتها لموتٍ مفاجئ: أول نقطة أو خطأ ينهي الإطار',
        'تبسيطات رقمية موثقة: بلا قاعدة «مِس»، بلا طلب إعادة الضربة من الخصم، بلا كرة حرة بعد الخطأ'
      ],
      da: [
        '22 كورة فطبلة 12 قدم: بيضة + 15 حمرة (نقطة لكل وحدة) + 6 ألوان فبلايصهم: صفرة 2، خضرة 3، بنية 4، زرقا 5، وردية 6، كحلاء 7',
        'البداية من داخل قوس D ورا خط الباولك — وأي طيحة للبيضة كترجعها لـ D',
        'مادام الحمر فالطبلة: دخل حمرة (ولا كتر فنفس الضربة — نقطة لكل وحدة) من بعد رشّح لون بالأزرار ودخلو — اللون اللي دخل كيرجع لبلاصتو',
        'من بعد آخر حمرة ولونها: مرحلة التنقية — الألوان كيدخلو بالتصاعد صفرة→خضرة→بنية→زرقا→وردية→كحلاء وكيبقاو فالجيوب',
        'الأخطاء = نقاط للخصم (4 ولا كتر، حتى 7): ماتلمساتش كورة، تلمس/تدخل كورة ماشي قانونية الأول، البيضة طاحت، كورة خرجات، تماس مزدوج (إلا جوج حمر)',
        'فضربة الخطأ ماكيحتسب والو والألوان اللي دخلو كيرجعو لبلايصهم — والأخطاء المتعددة كيتحسب غير أعلاها',
        'الكحلاء الأخيرة كتحدد الشوط؛ والتعادل كيرجع الكحلاء لبلاصتها لموت مفاجئ: أول نقطة ولا خطأ كيسالي الشوط',
        'تبسيطات رقمية موثقة: بلا قاعدة «مِس»، بلا طلب إعادة الضربة، بلا كورة حرة من بعد الخطأ'
      ],
      fr: [
        '22 boules sur table 12 pieds : blanche + 15 rouges (1 point) + 6 couleurs sur leurs mouches : jaune 2, verte 3, marron 4, bleue 5, rose 6, noire 7',
        'Ouverture depuis le demi-cercle D derrière la ligne de casse — toute blanche empochée revient dans le D',
        'Tant qu\'il reste des rouges : empochez une rouge (ou plusieurs au même coup — 1 point chacune) puis nommez une couleur avec les boutons et empochez-la — la couleur est remise sur sa mouche',
        'Après la dernière rouge et sa couleur : phase de nettoyage — couleurs en ordre croissant jaune→verte→marron→bleue→rose→noire, elles restent empochées',
        'Fautes = points pour l\'adversaire (4 minimum, jusqu\'à 7) : aucun contact, mauvaise boule touchée/empochée d\'abord, blanche empochée, boule hors table, double contact simultané (sauf deux rouges)',
        'Aucun point sur un coup fautif et les couleurs empochées sont remises — plusieurs fautes au même coup : seule la plus lourde compte',
        'La noire finale décide de la manche ; à égalité elle est remise sur sa mouche pour une mort subite : premier point ou première faute termine la manche',
        'Simplifications numériques documentées : pas de règle du « miss », pas de rejeu demandé, pas de bille libre après faute'
      ],
      en: [
        '22 balls on a 12ft table: cue + 15 reds (1 point each) + 6 colours on their spots: yellow 2, green 3, brown 4, blue 5, pink 6, black 7',
        'Opening from within the D behind the baulk line — any potted cue ball returns to the D',
        'While reds remain: pot a red (or several in one stroke — 1 point each) then nominate a colour with the buttons and pot it — potted colours are re-spotted',
        'After the last red and its colour: clearance phase — colours potted in ascending order yellow→green→brown→blue→pink→black and stay down',
        'Fouls = points to the opponent (4 minimum, up to 7): no contact, wrong ball first hit/potted, cue potted, ball off table, simultaneous double contact (except two reds)',
        'Nothing scores on a fouled stroke and potted colours are re-spotted — multiple fouls in one stroke: only the highest penalty counts',
        'The final black decides the frame; if scores are level it is re-spotted for sudden death: the first score or foul ends the frame',
        'Documented digital simplifications: no "miss" rule, no opponent-requested replay, no free ball after a foul'
      ]
    },
    details: {
      ar: [
        { h: 'قيم الكرات والأخطاء (WPBSA 10)', items: [
          'أساس العقوبة 4 نقاط؛ عدم لمس كرة أو سقوط البيضاء = قيمة الكرة القانونية (4 على الأقل)',
          'لمس أو إدخال كرة غير القانونية = الأعلى بين قيمة الكرة القانونية والكرة المعنية (حتى 7)',
          'التماس المزدوج المتزامن = الأعلى بين القيمتين (تماس حمراوين معاً قانوني)',
          'ضرب الحُمر في ضربتين متتاليتين أو ضربة بلون غير مرشَّح = 7 نقاط'
        ]},
        { h: 'إعادة الألوان (WPBSA 3.7)', items: [
          'كل لون يُعاد إلى بقعته؛ فإن شُغلت فإلى أعلى بقعة شاغرة قيمةً',
          'وإن شُغلت كل البقع: بين البقعة والوسادة العليا، والوردية/السوداء نحو الأسفل عند الحاجة',
          'الحُمر لا تعود أبداً — ومن يخرج كرة من الطاولة يعاقَب وتبقى الحمراء خارجاً'
        ]}
      ],
      da: [
        { h: 'قيم الكورات والأخطاء (WPBSA 10)', items: [
          'أساس العقوبة 4 نقاط؛ ماتلمساتش كورة ولا البيضة طاحت = قيمة الكورة القانونية (4 ولا كتر)',
          'تلمس ولا تدخل كورة ماشي قانونية = الأعلى بين قيمة الكورة القانونية والكورة المعنية (حتى 7)',
          'التماس المزدوج فنفس الوقت = الأعلى بين الجوج قيم (تماس جوج حمر مع بعض قانوني)',
          'تضرب الحمر فجوج ضربات ورا بعض ولا لون مرشّح = 7 نقاط'
        ]},
        { h: 'إرجاع الألوان (WPBSA 3.7)', items: [
          'كل لون كيرجع لبلاصتو؛ إلا كانت معمرة كيمشي لأعلى بلاصة خاوية قيمةً',
          'إلا عمرو كامل البلايص: بين البلاصة والباندة الفوقية، والوردية/الكحلاء للتحت منين خاص',
          'الحمر ماكيرجعوش أبدا — واللي كيخرج كورة من الطبلة كيتعاقب والحمرة كتبقى برا'
        ]}
      ],
      fr: [
        { h: 'Valeurs et fautes (WPBSA 10)', items: [
          'Pénalité de base 4 points ; aucun contact ou blanche empochée = valeur de la boule « on » (4 minimum)',
          'Boule non autorisée touchée ou empochée = le plus élevé entre la boule « on » et la boule concernée (jusqu\'à 7)',
          'Double contact simultané = la plus haute des deux valeurs (deux rouges ensemble : légal)',
          'Jouer les rouges deux coups de suite ou une couleur non nommée = 7 points'
        ]},
        { h: 'Remise des couleurs (WPBSA 3.7)', items: [
          'Chaque couleur revient sur sa mouche ; si elle est occupée, sur la mouche libre de plus haute valeur',
          'Si toutes sont occupées : entre la mouche et la bande du haut ; rose/noire vers le bas si besoin',
          'Les rouges ne reviennent jamais — une boule sortie de la table est une faute et la rouge reste dehors'
        ]}
      ],
      en: [
        { h: 'Values & fouls (WPBSA 10)', items: [
          'Base penalty 4 points; no contact or cue potted = value of the ball on (4 minimum)',
          'Wrong ball first hit or potted = the higher of ball on / ball concerned (up to 7)',
          'Simultaneous double contact = the higher of the two values (two reds together is legal)',
          'Playing reds in successive strokes, or a colour without nomination = 7 points'
        ]},
        { h: 'Re-spotting colours (WPBSA 3.7)', items: [
          'Each colour returns to its own spot; if occupied, to the highest-value spot available',
          'If all spots are taken: between its spot and the top cushion; pink/black towards the bottom if needed',
          'Reds are never re-spotted — forcing a ball off the table is a foul and a red stays off'
        ]}
      ]
    },
    payouts: {
      ar: '<tr><td>الفوز بالإطار في غرفة برهان</td><td>الرهان × 2</td></tr><tr><td>الوجه لوجه أو ضد الحاسوب</td><td>بلا تسجيل مالي</td></tr><tr><td>الانسحاب</td><td>خسارة الرهان</td></tr>',
      da: '<tr><td>الربح بالشوط فبيت برهان</td><td>الرهان × 2</td></tr><tr><td>وجه لوجه ولا ضد الحاسوب</td><td>بلا تسجيل مالي</td></tr><tr><td>الانسحاب</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>Victoire en salle avec mise</td><td>Mise × 2</td></tr><tr><td>Face à face ou contre l\'IA</td><td>Sans enjeu financier</td></tr><tr><td>Abandon</td><td>Perte de la mise</td></tr>',
      en: '<tr><td>Frame win in a staked room</td><td>Stake × 2</td></tr><tr><td>Hot-seat or versus AI</td><td>No financial stake</td></tr><tr><td>Resign</td><td>Stake lost</td></tr>'
    },
  },
  blca: {
    name: {
      ar: 'البلياردو الفرنسي — Carom (UMB) ⚪',
      da: 'البلياردو الفرنسي — Carom (UMB) ⚪',
      fr: 'Billard Français — Carom (UMB) ⚪',
      en: 'Carom Billiards — French Billiards (UMB) ⚪'
    },
    goal: {
      ar: 'لكل لاعب كرته (بيضاء أو صفراء) وحمراء مشتركة على طاولة بلا جيوب: اجعل كرته تلمس الكرتين في ضربة واحدة (كاروم) لتكسب نقطة وتستمر — وحسب الاختصاص قد تُشترط وسائد قبل الكرة الثانية.',
      da: 'كل لاعب عندو الكورتو (بيضة ولا صفرة) وحمراء مشتركة فطبلة بلا جيوب: خلي الكورتك تلمس الكورتين فضربة وحدة (كاروم) باش تربح نقطة وتكمل — وحسب الاختصاص خاص وسائد قبل الكورة الثانية.',
      fr: 'Chaque joueur a sa bille (blanche ou jaune) et une rouge commune sur une table sans poches : faites toucher votre bille les deux autres en un coup (carambole) pour marquer un point et continuer — selon la discipline, des bandes sont exigées avant la seconde boule.',
      en: 'Each player has their own ball (white or yellow) plus a shared red on a pocketless table: make your ball contact both others in one stroke (a carom) to score a point and continue — depending on the discipline, cushions are required before the second ball.'
    },
    steps: {
      ar: [
        'ثلاث كرات فقط: بيضاء (اللاعب الأول)، صفراء (اللاعب الثاني)، حمراء مشتركة — والفيزياء بلا جيوب إطلاقاً',
        'الكاروم الصحيح = كرته تلمس الكرتين الأخريين في نفس الضربة: +1 نقطة ويستمر اللاعب',
        'الحرة (Libre): بلا شرط وسائد — التماسان يكفيان',
        'وسادة (One-Cushion): وسادة واحدة على الأقل قبل لمس الكرة الثانية',
        'ثلاث وسائد (Three-Cushion): 3 وسائد على الأقل قبل الكرة الثانية — يجوز قبل الأولى أو بعدها وبأي وسادة ولو مكررة',
        'الإخفاق (بلا كاروم أو بلا تماس) ينقل الدور بلا عقوبة نقاط',
        'المباراة حتى هدف النقاط المختار (5/10/25) — من يبلغه أولاً يفوز',
        'تبسيطات رقمية موثقة: بلا حدود balkline/crotch وبلا أخطاء كرة باليد — الإخفاق ينهي الدور فقط'
      ],
      da: [
        'غير 3 كورات: بيضة (اللاعب الأول)، صفرة (اللاعب الثاني)، حمراء مشتركة — والفيزياء بلا جيوب أصلاً',
        'الكاروم الصحيح = الكورتو تلمس الكورتين الآخرين فنفس الضربة: +1 نقطة وكيكمل اللاعب',
        'الحرة (Libre): بلا شرط وسائد — التماسان كيفيو',
        'وسادة (One-Cushion): وسادة وحدة على الأقل قبل لمس الكورة الثانية',
        'ثلاث وسائد (Three-Cushion): 3 وسائد على الأقل قبل الكورة الثانية — يجوز قبل الأولى ولا من بعدها وبأي وسادة ولو معودة',
        'الإخفاق (بلا كاروم ولا بلا تماس) كينقل الدور بلا عقوبة',
        'الماتش حتى الهدف اللي تخترتو (5/10/25) — اللي وصل ليه الأول كيربح',
        'تبسيطات رقمية موثقة: بلا حدود balkline وبلا أخطاء كورة بيد — الإخفاق كيسالي الدور غير'
      ],
      fr: [
        'Trois billes seulement : blanche (joueur 1), jaune (joueur 2), rouge commune — physique sans aucune poche',
        'Carambole réussie = votre bille touche les deux autres dans le même coup : +1 point et vous continuez',
        'Libre : aucune exigence de bande — les deux contacts suffisent',
        'Une bande : au moins une bande avant de toucher la seconde boule',
        'Trois bandes : au moins 3 bandes avant la seconde boule — avant ou après la première, même bande répétée admise',
        'Un échec (sans carambole ou sans contact) passe la main sans pénalité',
        'Partie au premier à l\'objectif choisi (5/10/25 points)',
        'Simplifications numériques documentées : pas de limites balkline/crotch, pas de faute à bille en main — l\'échec termine seulement le tour'
      ],
      en: [
        'Only three balls: white (player 1), yellow (player 2), shared red — the physics has no pockets at all',
        'A valid carom = your ball contacts both others in the same stroke: +1 point and you shoot again',
        'Libre: no cushion requirement — the two contacts suffice',
        'One-cushion: at least one cushion before touching the second object ball',
        'Three-cushion: at least 3 cushions before the second ball — before or after the first, same cushion may repeat',
        'A miss (no carom or no contact) passes the turn with no penalty',
        'The match runs to the chosen target (5/10/25) — first to reach it wins',
        'Documented digital simplifications: no balkline/crotch limits, no ball-in-hand fouls — a miss only ends the turn'
      ]
    },
    details: {
      ar: [
        { h: 'الاختصاصات (UMB)', items: [
          'الحرة: الأسهل للمبتدئين — التماسان فقط',
          'وسادة واحدة: جسر طبيعي بين الحرة والثلاث',
          'ثلاث وسائد: الاختصاص المهيمن عالمياً — الوسائد تُحسب قبل الكرة الثانية بأي ترتيب'
        ]},
        { h: 'كرات اللاعبين', items: [
          'الأبيض يبدأ والصفراء للخصم — وعند تبديل الدور تُعاد تسمية الكرة المضروبة تلقائياً',
          'الحمراء هدف مشترك ولا تُدخل في أي مكان — لا جيوب في الطاولة أصلاً'
        ]}
      ],
      da: [
        { h: 'الاختصاصات (UMB)', items: [
          'الحرة: الساهلة للمبتدئين — غير التماسين',
          'وسادة وحدة: القنطرة الطبيعية بين الحرة والثلاث',
          'ثلاث وسائد: الاختصاص العالمي المهيمن — الوسائد كيتحسبو قبل الكورة الثانية بأي ترتيب'
        ]},
        { h: 'كورات اللاعبين', items: [
          'البيضة كتبدأ والصفرة للخصم — ومنين كيتبدل الدور كتتسمى الكورة المضروبة تلقائياً',
          'الحمراء هدف مشترك وماكتدخلش حتى بلاصة — ماكاينش جيوب فالطبلة أصلاً'
        ]}
      ],
      fr: [
        { h: 'Disciplines (UMB)', items: [
          'Libre : la plus simple — deux contacts seulement',
          'Une bande : le pont naturel entre libre et trois bandes',
          'Trois bandes : la discipline reine mondiale — les bandes comptent avant la seconde boule, dans tout ordre'
        ]},
        { h: 'Billes des joueurs', items: [
          'Le blanc commence, le jaune pour l\'adversaire — au changement de main la bille frappée est renommée automatiquement',
          'La rouge est un objectif commun et ne rentre nulle part — la table n\'a aucune poche'
        ]}
      ],
      en: [
        { h: 'Disciplines (UMB)', items: [
          'Libre: the simplest — two contacts only',
          'One-cushion: the natural bridge from libre to three-cushion',
          'Three-cushion: the world\'s dominant discipline — cushions count before the second ball, in any order'
        ]},
        { h: 'Players\' balls', items: [
          'White opens, yellow is the opponent\'s — on turn changes the struck ball is re-tagged automatically',
          'The red is a shared object and never drops anywhere — the table has no pockets'
        ]}
      ]
    },
    payouts: {
      ar: '<tr><td>الفوز بالمباراة في غرفة برهان</td><td>الرهان × 2</td></tr><tr><td>الوجه لوجه أو ضد الحاسوب</td><td>بلا تسجيل مالي</td></tr><tr><td>الانسحاب</td><td>خسارة الرهان</td></tr>',
      da: '<tr><td>الربح بالماتش فبيت برهان</td><td>الرهان × 2</td></tr><tr><td>وجه لوجه ولا ضد الحاسوب</td><td>بلا تسجيل مالي</td></tr><tr><td>الانسحاب</td><td>خسارة الرهان</td></tr>',
      fr: '<tr><td>Victoire de partie en salle avec mise</td><td>Mise × 2</td></tr><tr><td>Face à face ou contre l\'IA</td><td>Sans enjeu financier</td></tr><tr><td>Abandon</td><td>Perte de la mise</td></tr>',
      en: '<tr><td>Match win in a staked room</td><td>Stake × 2</td></tr><tr><td>Hot-seat or versus AI</td><td>No financial stake</td></tr><tr><td>Resign</td><td>Stake lost</td></tr>'
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
    var payoutContent = rules.payouts[lang] || rules.payouts[fallbackLang] || rules.payouts['ar'] || rules.payouts['en'];
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
