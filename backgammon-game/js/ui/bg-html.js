/**
 * ============================================================================
 *  BWG_HTML — بنية واجهة الطاولة (هوية «جوز فاخر»)
 * ============================================================================
 *  • شاشة القائمة: بطاقة خشب جوز بنقشة طبيعية، نردان كبيران شعارًا.
 *  • شاشة اللعب: رقعة جوز كاملة العرض — أوتاد عنبرية/فيروزية متناوبة،
 *    أدمن وسطي، صوانا إخراج، نرد حمراء تقليدية في شريط سفلي.
 *  • الكلاسات معزولة ببادئة bw- والنصوص عبر data-i18n.
 * ============================================================================
 */
window.BWG_HTML = (function () {
  'use strict';

  return '' +
  '<div class="stage bw-stage" id="bwStage">' +

    /* ════════════ القائمة ════════════ */
    '<section id="bwMenu" class="bw-screen bw-screen-active">' +
      '<div class="bw-menu-decor" aria-hidden="true"></div>' +
      '<div class="bw-menu-card">' +
        '<div class="bw-logo" aria-hidden="true">' +
          '<span class="bw-logo-die"><i class="bp on"></i><i class="bp"></i><i class="bp on"></i><i class="bp"></i><i class="bp on"></i><i class="bp"></i><i class="bp on"></i><i class="bp"></i><i class="bp on"></i></span>' +
          '<span class="bw-logo-die alt"><i class="bp on"></i><i class="bp"></i><i class="bp on"></i><i class="bp on"></i><i class="bp"></i><i class="bp on"></i><i class="bp on"></i><i class="bp"></i><i class="bp on"></i></span>' +
        '</div>' +
        '<h1 class="bw-title" data-i18n="bg.title">الطاولة</h1>' +
        '<p class="bw-tagline" data-i18n="bg.tagline">لعبة الجوز والنرد</p>' +

        '<div class="bw-field">' +
          '<div class="bw-flabel" data-i18n="bg.mode">نمط اللعب</div>' +
          '<div class="bw-seg" id="bwModeSeg">' +
            '<button type="button" class="bw-segbtn selected" data-mode="ai" data-i18n="bg.mode.ai">ضد الحاسوب</button>' +
            '<button type="button" class="bw-segbtn" data-mode="local" data-i18n="bg.mode.local">لاعبان</button>' +
          '</div>' +
        '</div>' +

        '<div class="bw-field" id="bwLevelField">' +
          '<div class="bw-flabel" data-i18n="bg.level">المستوى</div>' +
          '<div class="bw-seg" id="bwLevelSeg">' +
            '<button type="button" class="bw-segbtn" data-level="0" data-i18n="bg.level.0">مبتدئ</button>' +
            '<button type="button" class="bw-segbtn" data-level="1" data-i18n="bg.level.1">متوسط</button>' +
            '<button type="button" class="bw-segbtn selected" data-level="2" data-i18n="bg.level.2">خبير</button>' +
          '</div>' +
        '</div>' +

        '<div class="bw-field">' +
          '<div class="bw-flabel" data-i18n="bg.match">طول المباراة</div>' +
          '<div class="bw-seg" id="bwLenSeg">' +
            '<button type="button" class="bw-segbtn" data-len="1">1</button>' +
            '<button type="button" class="bw-segbtn" data-len="3">3</button>' +
            '<button type="button" class="bw-segbtn selected" data-len="5">5</button>' +
          '</div>' +
        '</div>' +

        '<div class="bw-field" id="bwBetField" hidden>' +
          '<div class="bw-flabel" data-i18n="bg.bet">الرهان</div>' +
          '<div class="bw-betrow">' +
            '<button type="button" class="bw-betbtn" data-betstep="-10" aria-label="−">−</button>' +
            '<span class="bw-betfield"><i class="bw-coin" aria-hidden="true"></i>' +
              '<input type="number" inputmode="numeric" id="bwBetInput" class="bw-betinput" value="25" min="10" aria-label="الرهان"></span>' +
            '<button type="button" class="bw-betbtn" data-betstep="10" aria-label="+">+</button>' +
          '</div>' +
          '<div class="bw-bethint" id="bwBetHint" data-i18n="bg.bet.hint"></div>' +
        '</div>' +
        '<div class="bw-field"><div class="gset-free" data-i18n="ui.trainingFree">🎓 تدريب مجاني بدون رهان — يُحدَّد الرهان في إعدادات الغرف أونلاين</div></div>' +

        '<button type="button" class="bw-go" id="bwStartBtn"><i class="fa-solid fa-trophy" aria-hidden="true"></i> <span data-i18n="bg.start">ابدأ المباراة</span></button>' +
        '<button type="button" class="bw-resume" id="bwResumeBtn" hidden><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> <span data-i18n="bg.resume">استئناف المباراة</span></button>' +
        '<button type="button" class="bw-ruleslink" id="bwRulesBtn"><i class="fa-solid fa-book-open" aria-hidden="true"></i> <span data-i18n="bg.rules">قواعد اللعبة</span></button>' +
      '</div>' +

      '<div class="bw-layer" id="bwRulesLayer" hidden>' +
        '<div class="bw-sheet">' +
          '<h2 class="bw-sheet-title" data-i18n="bg.rules">قواعد اللعبة</h2>' +
          '<div class="bw-rules-doc" id="bwRulesDoc"></div>' +
          '<button type="button" class="bw-go" id="bwRulesClose"><i class="fa-solid fa-check" aria-hidden="true"></i> <span data-i18n="bg.close">فهمت</span></button>' +
        '</div>' +
      '</div>' +
    '</section>' +

    /* ════════════ اللعب ════════════ */
    '<section id="bwPlay" class="bw-screen">' +

      '<div class="bw-hud">' +
        '<div class="bw-seat" id="bwSeatTop">' +
          '<span class="bw-avatar" id="bwTopAvatar"><i class="fa-solid fa-robot" aria-hidden="true"></i></span>' +
          '<span class="bw-seatmeta"><span class="bw-seatname" id="bwTopName">الخصم</span>' +
          '<span class="bw-seatrow"><span class="bw-seatscore" id="bwTopScore">0</span>' +
          '<span class="bw-seatpip" id="bwTopPip"></span></span></span>' +
        '</div>' +
        '<div class="bw-hudmid">' +
          '<span class="bw-hudmatch" id="bwMatchLbl"></span>' +
          '<span class="bw-hudstatus" id="bwStatus"></span>' +
        '</div>' +
        '<div class="bw-seat me" id="bwSeatBot">' +
          '<span class="bw-seatmeta end"><span class="bw-seatname" id="bwBotName">أنت</span>' +
          '<span class="bw-seatrow end"><span class="bw-seatscore" id="bwBotScore">0</span>' +
          '<span class="bw-seatpip" id="bwBotPip"></span></span></span>' +
          '<span class="bw-avatar"><i class="fa-solid fa-user" aria-hidden="true"></i></span>' +
        '</div>' +
      '</div>' +

      /* الرقعة — dir=ltr ثابتة منطقيًا */
      '<div class="bw-board" id="bwBoard" dir="ltr">' +
        '<div class="bw-points" id="bwPoints"></div>' +
        '<div class="bw-traycol">' +
          '<div class="bw-tray top" id="bwTrayTop"><span class="bw-tray-lbl" data-i18n="bg.off">الخارج</span><div class="bw-tray-pile" id="bwTrayTopPile"></div></div>' +
          '<div class="bw-tray bottom" id="bwTrayBot"><div class="bw-tray-pile" id="bwTrayBotPile"></div><span class="bw-tray-lbl" data-i18n="bg.off">الخارج</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="bw-dicebar">' +
        '<div class="bw-dice" id="bwDice"></div>' +
        '<button type="button" class="bw-rollbtn" id="bwRollBtn"><i class="fa-solid fa-dice" aria-hidden="true"></i> <span data-i18n="bg.roll">ارمِ النرد</span></button>' +
        '<div class="bw-tools">' +
          '<button type="button" class="bw-tool" id="bwUndoBtn" disabled><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> <span data-i18n="bg.undo">تراجع</span></button>' +
          '<button type="button" class="bw-tool danger" id="bwResignBtn"><i class="fa-solid fa-flag" aria-hidden="true"></i></button>' +
        '</div>' +
      '</div>' +

      /* نهاية اللعبة/المباراة */
      '<div class="bw-layer" id="bwOverLayer" hidden>' +
        '<div class="bw-sheet">' +
          '<div class="bw-sheet-em" id="bwOverEm">🏆</div>' +
          '<h2 class="bw-sheet-title" id="bwOverTitle"></h2>' +
          '<div class="bw-overtype" id="bwOverType"></div>' +
          '<div class="bw-amount" id="bwOverAmt"></div>' +
          '<div class="bw-scorerows" id="bwOverRows"></div>' +
          '<button type="button" class="bw-go" id="bwOverBtn"></button>' +
        '</div>' +
      '</div>' +

      '<div class="bw-layer" id="bwResignLayer" hidden>' +
        '<div class="bw-sheet small">' +
          '<h2 class="bw-sheet-title" id="bwResignText" data-i18n="bg.resignAsk">تنسحب؟</h2>' +
          '<div class="bw-askrow">' +
            '<button type="button" class="bw-go danger" id="bwResignYes"><i class="fa-solid fa-flag" aria-hidden="true"></i> <span data-i18n="bg.yes">نعم</span></button>' +
            '<button type="button" class="bw-resume" id="bwResignNo"><i class="fa-solid fa-play" aria-hidden="true"></i> <span data-i18n="bg.no">متابعة</span></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>' +
  '</div>';
})();
