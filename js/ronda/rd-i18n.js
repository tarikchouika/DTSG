/**
 * ============================================================================
 *  RD_T — نصوص الروندا الكلاسيكية (النسخة المستوردة من Ronda-Game)
 *  مساعد قاموس داخل المنصة: يقرأ القالب [ar, fr, en, da] من القاموس العام TR
 *  (مفاتيح rdc.*) ويستبدل الوسوم {x}. الوثائق الطويلة (قواعد اللعبة) هنا.
 * ============================================================================
 *  اللغات: ar (افتراضي) / fr / en / da — الدارجة المغربية ترجع للعربية
 *  في المواضع غير المتاحة.
 * ============================================================================
 */
(function (root) {
  'use strict';

  function curLang() {
    if (typeof ST !== 'undefined' && ST.lang) return ST.lang;
    return 'ar';
  }

  function curIndex() {
    if (typeof langIndex === 'function') return langIndex();
    const m = { ar: 0, fr: 1, en: 2, da: 3 };
    return m[curLang()] || 0;
  }

  /** استبدال {token} بقيمة */
  function fill(s, vars) {
    if (!vars) return s;
    return String(s).replace(/\{(\w+)\}/g, function (_, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : '{' + k + '}';
    });
  }

  /**
   * رسالة مترجمة من القاموس العام TR (مفاتيح rdc.*)
   * msg('rdc.log.played', { name: 'أنت', card: '6 الخال' })
   */
  function msg(key, vars) {
    let s = key;
    if (typeof TR !== 'undefined' && TR[key]) {
      const entry = TR[key];
      s = entry[curIndex()] || entry[0] || key;
    } else if (key.indexOf('.') !== -1) {
      /* قاموس محلي احتياطي (نصوص نادرة غير موجودة في TR) */
      const local = LOCAL[key];
      if (local) s = local[curIndex()] || local[0] || key;
    }
    return fill(s, vars);
  }

  /* قاموس محلي احتياطي صغير (يُستعمل فقط إن غاب المفتاح من TR العام) */
  const LOCAL = {
    'rdc.close': ['إغلاق', 'Fermer', 'Close', 'سد'],
    'rdc.hand.waiting': ['انتظر دورك', 'Attendez votre tour', 'Wait for your turn', 'سنا دورك'],
    'rdc.tblEmpty': ['الطاولة', 'Table', 'Table', 'الطابلة'],
    'rdc.mode.ai.fam': ['ضد الكمبيوتر', "Contre l'ordinateur", 'Vs computer', 'ضد الكمبيوتر'],
    'rdc.mode.pvp.fam': ['وجهًا لوجه — نفس الجهاز', 'Face à face — même appareil', 'Face-to-face — same device', 'وجها لوجه على نفس الجهاز'],
    'rdc.shape.ai.1v1': ['مبارزة: أنت ضد كمبيوتر واحد', 'Duel : vous contre un ordinateur', 'Duel: you vs one computer', 'مبارزة: نتا ضد كمبيوتر واحد'],
    'rdc.shape.ai.1v2': ['أنت ضد آليين — كلٌّ لنفسه', 'Vous contre deux IA — chacun pour soi', 'You vs 2 AIs — each for himself', 'نتا ضد جوج آليين — كل واحد لحاله'],
    'rdc.shape.ai.1v3': ['أنت ضد 3 آليين — كلٌّ لنفسه', 'Vous contre trois IA — chacun pour soi', 'You vs 3 AIs — each for himself', 'نتا ضد 3 آليين — كل واحد لحاله'],
    'rdc.shape.ai.2v2': ['2 ضد 2: رفيقك آلي وخصماك آليان', '2v2 : partenaire et adversaires IA', '2v2: AI partner and AI opponents', '2 ضد 2: رفيقك آلي والخصوم آليين'],
    'rdc.shape.pvp.1v1': ['لاعبان يتناوبان', 'Deux joueurs à tour de rôle', 'Two players take turns', 'جوج لاعبين بلدور'],
    'rdc.shape.pvp.1v2': ['3 لاعبين — كلٌّ لنفسه', 'Trois joueurs — chacun pour soi', '3 players — each for himself', '3 لاعبين — كل واحد لحاله'],
    'rdc.shape.pvp.1v3': ['4 لاعبين — كلٌّ لنفسه', 'Quatre joueurs — chacun pour soi', '4 players — each for himself', '4 لاعبين — كل واحد لحاله'],
    'rdc.shape.pvp.2v2': ['زوجان ضد زوجين', 'Deux équipes de deux', '2 vs 2 teams', 'جوج ضد جوج'],
    'rdc.target.round': ['جولة', 'Manche', 'One round', 'جولة'],
    'rdc.target.roundSub': ['توزيع 40 ورقة', 'Donne des 40 cartes', 'Full 40-card deal', 'تفريقة الـ40 ورقة'],
    'rdc.timer.label': ['مؤقت الدور', 'Minuteur de tour', 'Turn timer', 'الميقاتة ديال الدور'],
    'rdc.timer.sec': ['ث', 's', 's', 'ث'],
    'rdc.timer.hint': ['من 30 إلى 300 ثانية — لعب آلي عند انتهاء الوقت', '30 à 300 s — coup auto à la fin du temps', '30–300 s — auto move when time runs out', '30 لـ300 ثانية — اللعب الآلي إلا سال الوقت'],
    'rdc.round.results': ['نتائج الجولة', 'Résultats de la manche', 'Round results', 'النتيجة ديال الجولة'],
    'rdc.round.autoLocal': ['انتقال تلقائي خلال {s} ث — أو اضغط «الجولة التالية»', 'Passage auto dans {s} s — ou « manche suivante »', 'Auto-advance in {s}s — or press "Next round"', 'غادي تمشي فـ {s} ث — ولا دوس على «الجولة الجاية»'],
    'rdc.round.autoRoom': ['انتقال تلقائي خلال {s} ث — أو اضغط «الجولة التالية»', 'Passage auto dans {s} s — ou « manche suivante »', 'Auto-advance in {s}s — or press "Next round"', 'غادي تمشي فـ {s} ث — ولا دوس على «الجولة الجاية»'],
    'rdc.round.autoVotes': ['وافق {v}/{n} — انتقال تلقائي خلال {s} ث', '{v}/{n} ont validé — auto dans {s} s', '{v}/{n} confirmed — auto in {s}s', 'وافقو {v}/{n} — غادي تمشي فـ {s} ث']
  };

  /* ============================ أسماء اللاعبين ============================ */

  const NAMES = {
    ar: { ai: ['أنت', 'الكمبيوتر'], '2p': ['اللاعب ١', 'اللاعب ٢'], '4p': ['اللاعب ١', 'اللاعب ٢', 'اللاعب ٣', 'اللاعب ٤'] },
    fr: { ai: ['Vous', 'Ordinateur'], '2p': ['Joueur 1', 'Joueur 2'], '4p': ['Joueur 1', 'Joueur 2', 'Joueur 3', 'Joueur 4'] },
    en: { ai: ['You', 'Computer'], '2p': ['Player 1', 'Player 2'], '4p': ['Player 1', 'Player 2', 'Player 3', 'Player 4'] },
    da: { ai: ['نتا', 'الكمبيوتر'], '2p': ['اللاعب ١', 'اللاعب ٢'], '4p': ['اللاعب ١', 'اللاعب ٢', 'اللاعب ٣', 'اللاعب ٤'] }
  };

  function namesFor(mode) {
    const byLang = NAMES[curLang()] || NAMES.ar;
    return (byLang[mode] || NAMES.ar[mode]).slice();
  }

  function teamName(idx) {
    return msg(idx === 0 ? 'rdc.team.a' : 'rdc.team.b');
  }

  /* ============================ قواعد اللعبة ============================ */

  const RULES = {
    ar: `
      <h3>التعريف</h3>
      <p>لعبة الروندا تلعب بين لاعبين اثنين (أو زوجين ضد زوجين). تُستخدم 40 ورقة مقسمة إلى 4 أنواع:
      <span class="rule-term">الخال، الكوباس، شبادا، دهاب</span>، والأرقام من 1-7 ومن 10-12،
      حيث أن الـ 7 متصلة بالـ 10 مباشرة (لا توجد أوراق 8 و 9).</p>
      <h3>طريقة اللعب</h3>
      <ul>
        <li>الموزع يوزع 3 أوراق على كل لاعب، ثم يضع 4 أوراق مكشوفة على الطاولة.</li>
        <li>الهدف الرئيسي: الحصول على أوراق الطاولة.</li>
        <li>اللاعب المقابل للموزع يبدأ دائماً، وكل لاعب يضع ورقة واحدة في دوره.</li>
        <li>من يلعب ورقة مشابهة لورقة على الطاولة يلتقطها <b>مع كل الأوراق المتتابعة لها</b>
        (مثال: لعب 6 مع وجود 1، 6، 7، 12 → يأخذ 6 و 6 و 7 فقط، لأن 12 غير متصلة بـ 10).</li>
        <li>من يلعب ورقة لا مثلها على الطاولة تبقى هناك حتى الدور القادم.</li>
        <li>عند نفاد أوراق اللاعبين يوزع الموزع 3 أوراق جديدة حتى تنتهي الـ 40 ورقة.</li>
      </ul>
      <h3>الحالات الخاصة</h3>
      <ul>
        <li><span class="rule-term">ضربة</span> <span class="rule-pts">+1</span>: لعب ورقة بنفس رتبة
        آخر ورقة لعبها الخصم مباشرة.</li>
        <li><span class="rule-term">حبل</span> <span class="rule-pts">+5</span>: بعد الضربة، يرد صاحب
        الورقة الأصلية بنفس الرتبة فيلتقط الأوراق.</li>
        <li><span class="rule-term">جوج حبال</span> <span class="rule-pts">+10</span>: إذا امتلك صاحب
        الضربة الورقة الرابعة ولعبها بعد الحبل.</li>
        <li><span class="rule-term">ميسا</span> <span class="rule-pts">+1</span>: من يلتقط كل أوراق
        الطاولة.</li>
        <li>الأوراق المتبقية على الطاولة في النهاية تذهب لآخر لاعب التقط.</li>
      </ul>
      <h3>الإعلانات</h3>
      <ul>
        <li><span class="rule-term">روندا</span> <span class="rule-pts">+1</span>: ورقتان متشابهتان في
        يدك عند بداية أي توزيعة.</li>
        <li><span class="rule-term">تريندا</span> <span class="rule-pts">+3</span>: ثلاث متشابهات.</li>
        <li>الأقوى يفوز على الجميع (تريندا &gt; روندا، ثم الرتبة الأعلى)، ويحصل الفائز على مجموع نقاط
        كل الإعلانات المعلنة في التوزيعة.</li>
      </ul>
      <h3>قاعا راي / قاعا أص (الرمية الأخيرة للموزع)</h3>
      <ul>
        <li>الموزع يلتقط <b>12</b> برميته الأخيرة → <span class="rule-pts">+5</span> له
        (<span class="rule-term">قاعا راي</span>).</li>
        <li>الموزع يلتقط <b>1</b> برميته الأخيرة → <span class="rule-pts">+5</span> للخصم
        (<span class="rule-term">قاعا أص</span>).</li>
        <li>الموزع لا يلتقط شيئاً برميته الأخيرة → <span class="rule-pts">+5</span> للخصم.</li>
        <li>الموزع يلتقط 2-7 أو 10 أو 11 → لا شيء إضافي.</li>
      </ul>
      <h3>حساب النقاط والفوز</h3>
      <ul>
        <li>كل ورقة ملتقطة <b>فوق 20</b> تحتسب نقطة (27 ورقة = 7 نقاط).</li>
        <li>الفوز: أول لاعب/فريق يصل إلى العدد المتفق عليه (41 أو 51 أو 61 نقطة).</li>
      </ul>
    `,
    fr: `
      <h3>Présentation</h3>
      <p>La Ronda se joue à deux joueurs (ou deux équipes de deux). On utilise 40 cartes réparties en 4 couleurs :
      <span class="rule-term">Khal (épées), Kobbas (coupes), Chebada (bâtons), Dhab (deniers)</span>,
      avec les valeurs de 1 à 7 et de 10 à 12 — le 7 est directement suivi du 10 (pas de 8 ni de 9).</p>
      <h3>Déroulement</h3>
      <ul>
        <li>Le donneur distribue 3 cartes à chaque joueur, puis pose 4 cartes face visible sur la table.</li>
        <li>Objectif principal : ramasser les cartes de la table.</li>
        <li>Le joueur opposé au donneur commence toujours ; chacun joue une carte à son tour.</li>
        <li>Qui joue une carte de même valeur qu'une carte de la table la ramasse, <b>avec toutes les cartes
        qui la suivent dans la chaîne</b> (ex. : jouer un 6 alors que 1, 6, 7, 12 sont sur la table →
        on prend les deux 6 et le 7 seulement, car le 12 ne suit pas le 10).</li>
        <li>Une carte sans correspondance reste sur la table jusqu'au tour suivant.</li>
        <li>Quand les mains sont vides, le donneur redistribue 3 cartes jusqu'à épuisement des 40 cartes.</li>
      </ul>
      <h3>Cas particuliers</h3>
      <ul>
        <li><span class="rule-term">Frappe</span> <span class="rule-pts">+1</span> : jouer une carte de la
        même valeur que la toute dernière carte jouée par l'adversaire.</li>
        <li><span class="rule-term">Corde</span> <span class="rule-pts">+5</span> : après une frappe, le
        joueur de la carte d'origine répond avec la même valeur et ramasse les cartes.</li>
        <li><span class="rule-term">Double corde</span> <span class="rule-pts">+10</span> : si l'auteur de
        la frappe possède la quatrième carte et la joue après la corde.</li>
        <li><span class="rule-term">Mesa</span> <span class="rule-pts">+1</span> : ramasser toutes les
        cartes de la table d'un coup.</li>
        <li>Les cartes restées sur la table en fin de donne vont au dernier joueur ayant ramassé.</li>
      </ul>
      <h3>Déclarations</h3>
      <ul>
        <li><span class="rule-term">Ronda</span> <span class="rule-pts">+1</span> : deux cartes de même
        valeur en main au début d'une donne.</li>
        <li><span class="rule-term">Trenda</span> <span class="rule-pts">+3</span> : trois cartes identiques.</li>
        <li>La plus forte l'emporte sur toutes (Trenda &gt; Ronda, puis la valeur la plus haute) ; le gagnant
        reçoit la somme des points de toutes les déclarations de la donne.</li>
      </ul>
      <h3>Qaâ Ray / Qaâ As (dernier lancer du donneur)</h3>
      <ul>
        <li>Le donneur ramasse un <b>12</b> à son dernier lancer → <span class="rule-pts">+5</span> pour lui
        (<span class="rule-term">Qaâ Ray</span>).</li>
        <li>Le donneur ramasse un <b>1</b> à son dernier lancer → <span class="rule-pts">+5</span> pour
        l'adversaire (<span class="rule-term">Qaâ As</span>).</li>
        <li>Le donneur ne ramasse rien à son dernier lancer → <span class="rule-pts">+5</span> pour
        l'adversaire.</li>
        <li>Le donneur ramasse 2-7, 10 ou 11 → aucun bonus.</li>
      </ul>
      <h3>Points et victoire</h3>
      <ul>
        <li>Chaque carte ramassée <b>au-delà de 20</b> vaut 1 point (27 cartes = 7 points).</li>
        <li>Victoire : le premier joueur/équipe à atteindre le score convenu (41, 51 ou 61 points).</li>
      </ul>
    `,
    en: `
      <h3>Overview</h3>
      <p>Ronda is played by two players (or two teams of two). It uses 40 cards in 4 suits —
      <span class="rule-term">Khal (swords), Kobbas (cups), Chebada (clubs), Dhab (coins)</span> —
      with values 1–7 and 10–12: the 7 is followed directly by the 10 (there are no 8s or 9s).</p>
      <h3>Gameplay</h3>
      <ul>
        <li>The dealer gives 3 cards to each player, then places 4 cards face-up on the table.</li>
        <li>Main goal: capture the cards on the table.</li>
        <li>The player opposite the dealer always starts; each player plays one card per turn.</li>
        <li>Playing a card matching one on the table captures it <b>along with every card that follows it
        in the chain</b> (example: playing a 6 while 1, 6, 7, 12 are on the table → you take the two 6s and
        the 7 only, because 12 does not follow 10).</li>
        <li>A card that matches nothing stays on the table until the next turn.</li>
        <li>When hands run out, the dealer deals 3 new cards until all 40 cards are used.</li>
      </ul>
      <h3>Special plays</h3>
      <ul>
        <li><span class="rule-term">Strike</span> <span class="rule-pts">+1</span>: playing a card of the
        same value as the opponent's very last played card.</li>
        <li><span class="rule-term">Rope</span> <span class="rule-pts">+5</span>: after a strike, the owner
        of the original card answers with the same value and captures the cards.</li>
        <li><span class="rule-term">Double rope</span> <span class="rule-pts">+10</span>: if the striker
        holds the fourth card and plays it after the rope.</li>
        <li><span class="rule-term">Mesa</span> <span class="rule-pts">+1</span>: clearing the whole table
        in one capture.</li>
        <li>Cards left on the table at the end of the deal go to the last player who captured.</li>
      </ul>
      <h3>Declarations</h3>
      <ul>
        <li><span class="rule-term">Ronda</span> <span class="rule-pts">+1</span>: two matching cards in
        hand at the start of any deal.</li>
        <li><span class="rule-term">Trenda</span> <span class="rule-pts">+3</span>: three matching cards.</li>
        <li>The strongest beats everyone (Trenda &gt; Ronda, then the higher value); the winner receives the
        total points of every declaration made in the deal.</li>
      </ul>
      <h3>Qaa Rey / Qaa As (dealer's last throw)</h3>
      <ul>
        <li>Dealer captures a <b>12</b> on the final throw → <span class="rule-pts">+5</span> for the dealer
        (<span class="rule-term">Qaa Rey</span>).</li>
        <li>Dealer captures a <b>1</b> on the final throw → <span class="rule-pts">+5</span> for the opponent
        (<span class="rule-term">Qaa As</span>).</li>
        <li>Dealer captures nothing on the final throw → <span class="rule-pts">+5</span> for the opponent.</li>
        <li>Dealer captures 2–7, 10 or 11 → no bonus.</li>
      </ul>
      <h3>Scoring &amp; winning</h3>
      <ul>
        <li>Every captured card <b>beyond 20</b> counts as 1 point (27 cards = 7 points).</li>
        <li>Win: the first player/team to reach the agreed score (41, 51 or 61 points).</li>
      </ul>
    `,
    da: null /* الدارجة المغربية تستعمل نص العربية الفصحى نفسه */
  };

  function rulesHtml() {
    const html = RULES[curLang()];
    return (html !== null && html !== undefined) ? html : RULES.ar;
  }

  root.RD_T = {
    lang: curLang,
    index: curIndex,
    msg: msg,
    namesFor: namesFor,
    teamName: teamName,
    rulesHtml: rulesHtml
  };
})(typeof self !== 'undefined' ? self : this);
