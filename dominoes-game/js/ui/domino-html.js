/**
 * ============================================================================
 *  DMN_HTML — بنية واجهة الضومنة (هوية «قهاوة مغربية»)
 * ============================================================================
 *  • شاشة القائمة: بطاقة قائمة قهوة — سبز داكن بإطار نحاسي، شعار قطعتين عاجيتين.
 *  • شاشة اللعب: طاولة جوخ أخضر تملأ الحاوية، قطع الخصم أعلى، وشارة اللاعب
 *    الرئيسية بجوار اليد والبنك أسفل اليسار في اللاندسكيب فقط [v2.57-DOMINO].
 *  • كل النصوص الثابتة عبر data-i18n — الكلاسات معزولة ببادئة dm-.
 *  • تُحقن في #gamePageBody عبر eDominoes() أو تعمل مستقلة في index.html.
 * ============================================================================
 */
window.DMN_HTML = (function () {
  'use strict';

  return '' +
  '<div class="stage dm-stage" id="dmStage">' +

    /* توست الوضع المستقل (داخل المنصة يُستخدم توست المنصة عبر root.toast) */
    '<div class="dm-toast" id="dmToast" role="status" aria-live="polite"></div>' +

    /* ════════════ شاشة القائمة ════════════ */
    '<section id="dmMenu" class="dm-screen dm-screen-active">' +
      '<div class="dm-menu-decor" aria-hidden="true"></div>' +
      '<div class="dm-menu-card">' +
        '<div class="dm-logo" aria-hidden="true">' +
          '<span class="dm-logo-tile"><i class="dp dp6"></i><i class="dp dp3"></i></span>' +
          '<span class="dm-logo-tile tilt"><i class="dp dp5"></i><i class="dp dp5"></i></span>' +
        '</div>' +
        '<h1 class="dm-title" data-i18n="dm.title">الضومنة</h1>' +
        '<p class="dm-tagline" data-i18n="dm.tagline">لعبة القهاوة المغربية</p>' +

        '<div class="dm-field">' +
          '<div class="dm-flabel" data-i18n="dm.mode">نمط اللعب</div>' +
          '<div class="dm-seg" id="dmModeSeg">' +
            '<button type="button" class="dm-segbtn selected" data-mode="ai" data-i18n="dm.mode.ai">ضد الحاسوب</button>' +
            '<button type="button" class="dm-segbtn" data-mode="local" data-i18n="dm.mode.local">لاعبان — جهاز واحد</button>' +
          '</div>' +
        '</div>' +

        '<div class="dm-field" id="dmPlayersField">' +
          '<div class="dm-flabel" data-i18n="dm.playersCount">عدد اللاعبين</div>' +
          '<div class="dm-seg" id="dmPlayersSeg">' +
            '<button type="button" class="dm-segbtn selected" data-players="2">2 لاعبين</button>' +
            '<button type="button" class="dm-segbtn" data-players="3">3 لاعبين</button>' +
            '<button type="button" class="dm-segbtn" data-players="4">4 لاعبين</button>' +
          '</div>' +
        '</div>' +

        '<div class="dm-field" id="dmLevelField">' +
          '<div class="dm-flabel" data-i18n="dm.level">المستوى</div>' +
          '<div class="dm-seg" id="dmLevelSeg">' +
            '<button type="button" class="dm-segbtn" data-level="0" data-i18n="dm.level.0">مبتدئ</button>' +
            '<button type="button" class="dm-segbtn" data-level="1" data-i18n="dm.level.1">متوسط</button>' +
            '<button type="button" class="dm-segbtn selected" data-level="2" data-i18n="dm.level.2">خبير</button>' +
          '</div>' +
        '</div>' +

        '<div class="dm-field">' +
          '<div class="dm-flabel" data-i18n="dm.target">نقاط الفوز</div>' +
          '<div class="dm-seg" id="dmTargetSeg">' +
            '<button type="button" class="dm-segbtn" data-target="50">50</button>' +
            '<button type="button" class="dm-segbtn selected" data-target="100">100</button>' +
            '<button type="button" class="dm-segbtn" data-target="150">150</button>' +
            '<button type="button" class="dm-segbtn" data-target="200">200</button>' +
          '</div>' +
        '</div>' +

        '<div class="dm-field">' +
          '<div class="dm-flabel" data-i18n="dm.drawRule">قاعدة السحب</div>' +
          '<div class="dm-seg" id="dmDrawSeg">' +
            '<button type="button" class="dm-segbtn selected" data-draw="1" data-i18n="dm.draw.classic">كلاسيكي</button>' +
            '<button type="button" class="dm-segbtn" data-draw="0" data-i18n="dm.draw.block">بدون بنك</button>' +
          '</div>' +
        '</div>' +

        '<div class="dm-field" id="dmBetField" hidden>' +
          '<div class="dm-flabel" data-i18n="dm.bet">الرهان</div>' +
          '<div class="dm-betrow">' +
            '<button type="button" class="dm-betbtn" data-betstep="-10" aria-label="−">−</button>' +
            '<span class="dm-betfield"><i class="dm-coin" aria-hidden="true"></i>' +
              '<input type="number" inputmode="numeric" id="dmBetInput" class="dm-betinput" value="25" min="10" aria-label="الرهان"></span>' +
            '<button type="button" class="dm-betbtn" data-betstep="10" aria-label="+">+</button>' +
          '</div>' +
          '<div class="dm-bethint" id="dmBetHint" data-i18n="dm.bet.hint"></div>' +
        '</div>' +
        '<div class="dm-field"><div class="gset-free" data-i18n="ui.trainingFree">🎓 تدريب مجاني بدون رهان — يُحدَّد الرهان في إعدادات الغرف أونلاين</div></div>' +

        '<button type="button" class="dm-go" id="dmStartBtn"><i class="fa-solid fa-trophy" aria-hidden="true"></i> <span data-i18n="dm.start">ابدأ المباراة</span></button>' +
        '<button type="button" class="dm-resume" id="dmResumeBtn" hidden><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> <span data-i18n="dm.resume">استئناف المباراة</span></button>' +
        '<button type="button" class="dm-ruleslink" id="dmRulesBtn"><i class="fa-solid fa-book-open" aria-hidden="true"></i> <span data-i18n="dm.rules">قواعد اللعبة</span></button>' +
      '</div>' +

      /* طبقة القواعد */
      '<div class="dm-layer" id="dmRulesLayer" hidden>' +
        '<div class="dm-sheet">' +
          '<h2 class="dm-sheet-title" data-i18n="dm.rules">قواعد اللعبة</h2>' +
          '<div class="dm-rules-doc" id="dmRulesDoc"></div>' +
          '<button type="button" class="dm-go" id="dmRulesClose" data-i18n="dm.close">فهمت، هيا نلعبو</button>' +
        '</div>' +
      '</div>' +
    '</section>' +

    /* ════════════ شاشة اللعب ════════════ */
    '<section id="dmPlay" class="dm-screen">' +

      /* حالة اللعبة المخفية للتوافق البرمجي */
      '<span id="dmStatus" hidden></span>' +

      /* بطاقة معلومات المباراة (الجولة والهدف) */
      '<div class="dm-matchcard" id="dmMatchCard">' +
        '<span class="dm-rt" id="dmRoundLbl">R1 T100</span>' +
      '</div>' +

      /* مقاعد اللاعبين الخصوم على أطراف الشاشة (يسار - أعلى - يمين) */
      '<div class="dm-seat seat-1 opp seat-left" id="dmSeatOpp">' +
        '<span class="dm-avatar" id="dmOppAvatar"><i class="fa-solid fa-robot" aria-hidden="true"></i></span>' +
        '<span class="dm-seatmeta"><span class="dm-seatname" id="dmOppName" hidden>الخصم 1</span>' +
        '<span class="dm-seatscore" id="dmOppScore">0</span></span>' +
        '<span class="dm-tilebadge" id="dmTileBadge1" hidden>7</span>' +
        '<div class="dm-opptiles dm-opptiles-v" id="dmOppTiles1"></div>' +
      '</div>' +

      '<div class="dm-seat seat-2 opp seat-top" id="dmSeat2" hidden>' +
        '<span class="dm-avatar" id="dmAvatar2"><i class="fa-solid fa-robot" aria-hidden="true"></i></span>' +
        '<span class="dm-seatmeta"><span class="dm-seatname" id="dmName2" hidden>الخصم 2</span>' +
        '<span class="dm-seatscore" id="dmScore2">0</span></span>' +
        '<span class="dm-tilebadge" id="dmTileBadge2" hidden>7</span>' +
        '<div class="dm-opprow" id="dmOppRow"></div>' +
      '</div>' +

      '<div class="dm-seat seat-3 opp seat-right" id="dmSeat3" hidden>' +
        '<span class="dm-avatar" id="dmAvatar3"><i class="fa-solid fa-robot" aria-hidden="true"></i></span>' +
        '<span class="dm-seatmeta"><span class="dm-seatname" id="dmName3" hidden>الخصم 3</span>' +
        '<span class="dm-seatscore" id="dmScore3">0</span></span>' +
        '<span class="dm-tilebadge" id="dmTileBadge3" hidden>7</span>' +
        '<div class="dm-opptiles dm-opptiles-v" id="dmOppTiles3"></div>' +
      '</div>' +

      /* الطاولة: جوخ أخضر */
      '<div class="dm-table" id="dmTable">' +
        '<div class="dm-felt" aria-hidden="true"></div>' +
        '<div class="dm-chain" id="dmChain"></div>' +
        '<button type="button" class="dm-endhint" id="dmHintL" hidden></button>' +
        '<button type="button" class="dm-endhint" id="dmHintR" hidden></button>' +
        '<div class="dm-boneyard" id="dmBoneyard" role="button" tabindex="0">' +
          '<div class="dm-by-stack" aria-hidden="true"><span></span><span></span><span></span></div>' +
          '<span class="dm-by-count" id="dmByCount">14</span>' +
          '<span class="dm-by-label" data-i18n="dm.boneyard">البنك</span>' +
        '</div>' +
      '</div>' +

      /* اليد + اللاعب الرئيسي + أدوات */
      '<div class="dm-handwrap">' +
        '<div class="dm-seat seat-0 me" id="dmSeatMe">' +
          '<span class="dm-avatar" id="dmMyAvatar"></span>' +
          '<span class="dm-seatmeta end"><span class="dm-seatname" id="dmMyName" hidden>أنت</span>' +
          '<span class="dm-seatscore" id="dmMyScore">0</span></span>' +
        '</div>' +
        '<div class="dm-hand" id="dmHand"></div>' +
        '<div class="dm-tools">' +
          '<button type="button" class="dm-tool" id="dmPassBtn" hidden><i class="fa-solid fa-forward" aria-hidden="true"></i> <span data-i18n="dm.mustPass">مرّر</span></button>' +
        '</div>' +
      '</div>' +

      /* طبقة نهاية الجولة */
      '<div class="dm-layer" id="dmRoundLayer" hidden>' +
        '<div class="dm-sheet small">' +
          '<div class="dm-sheet-em" id="dmRoundEm">🁫</div>' +
          '<h2 class="dm-sheet-title" id="dmRoundTitle"></h2>' +
          '<div class="dm-scorerows" id="dmRoundRows"></div>' +
          '<button type="button" class="dm-go" id="dmNextRoundBtn"><i class="fa-solid fa-forward" aria-hidden="true"></i> <span data-i18n="dm.nextRound">الجولة التالية</span></button>' +
        '</div>' +
      '</div>' +

      /* طبقة نهاية المباراة */
      '<div class="dm-layer" id="dmMatchLayer" hidden>' +
        '<div class="dm-sheet">' +
          '<div class="dm-sheet-em" id="dmMatchEm">🏆</div>' +
          '<h2 class="dm-sheet-title" id="dmMatchTitle"></h2>' +
          '<div class="dm-amount" id="dmMatchAmt"></div>' +
          '<div class="dm-scorerows" id="dmMatchRows"></div>' +
          '<button type="button" class="dm-go" id="dmNewMatchBtn"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> <span data-i18n="dm.newMatch">مباراة جديدة</span></button>' +
        '</div>' +
      '</div>' +

      /* طبقة تأكيد الانسحاب */
      '<div class="dm-layer" id="dmResignLayer" hidden>' +
        '<div class="dm-sheet small">' +
          '<h2 class="dm-sheet-title" id="dmResignText" data-i18n="dm.resignAsk">تنسحب؟</h2>' +
          '<div class="dm-askrow">' +
            '<button type="button" class="dm-go danger" id="dmResignYes" data-i18n="dm.yes">نعم</button>' +
            '<button type="button" class="dm-resume" id="dmResignNo" data-i18n="dm.no">متابعة</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>' +
  '</div>';
})();
