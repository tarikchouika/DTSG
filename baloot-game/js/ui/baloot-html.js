/* ════════════════════════════════════════════════════════════════════
   BLHTML — بنية شاشات البلوت (القائمة + الطاولة + الطبقات)
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const R = root.BLRender;

  const SUIT_GLYPH = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };

  function suitBtn(s) {
    return '<button class="bl-nbtn bl-suitbtn" data-suit="' + s + '">' +
      '<svg viewBox="0 0 24 24" class="bl-npip"><use href="#bl-pip-' + s + '" width="24" height="24"/></svg>' +
      '<span data-bl-i18n="blt.suit.' + s + '"></span>' +
      '<i class="bl-nmult">\u00d7</i></button>';
  }

  function stageHTML() {
    return R.defsSVG() +
    '<div class="bl-scene">' +
      /* ═══════════ شاشة القائمة ═══════════ */
      '<section class="bl-screen bl-screen-active" id="blMenu">' +
        '<div class="bl-menu-bg" aria-hidden="true"></div>' +
        '<div class="bl-menuwrap">' +
          '<header class="bl-menuhead">' +
            '<div class="bl-menucards" aria-hidden="true">' +
              '<span class="bl-mcard m1"><svg viewBox="0 0 24 24"><use href="#bl-pip-S" width="24" height="24"/></svg></span>' +
              '<span class="bl-mcard m2"><svg viewBox="0 0 24 24"><use href="#bl-pip-H" width="24" height="24"/></svg></span>' +
              '<span class="bl-mcard m3"><svg viewBox="0 0 24 24"><use href="#bl-pip-D" width="24" height="24"/></svg></span>' +
            '</div>' +
            '<h1 class="bl-menutitle" data-bl-i18n="blt.title"></h1>' +
            '<p class="bl-menutag" data-bl-i18n="blt.tagline"></p>' +
          '</header>' +

          '<div class="bl-menucard">' +
            '<div class="bl-field" id="blModeField">' +
              '<p class="bl-flabel" data-bl-i18n="blt.mode.ai"></p>' +
              '<div class="bl-seg" id="blModeSeg">' +
                '<button class="bl-segbtn selected" data-mode="ai" data-bl-i18n="blt.mode.ai"></button>' +
                '<button class="bl-segbtn" data-mode="local" data-bl-i18n="blt.mode.local"></button>' +
              '</div>' +
              '<p class="bl-mdesc" id="blModeDesc"></p>' +
            '</div>' +

            '<div class="bl-field" id="blLevelField">' +
              '<p class="bl-flabel" data-bl-i18n="blt.vsBot"></p>' +
              '<div class="bl-seg" id="blLevelSeg">' +
                '<button class="bl-segbtn" data-level="0" data-bl-i18n="blt.level.0"></button>' +
                '<button class="bl-segbtn" data-level="1" data-bl-i18n="blt.level.1"></button>' +
                '<button class="bl-segbtn selected" data-level="2" data-bl-i18n="blt.level.2"></button>' +
              '</div>' +
            '</div>' +

            '<div class="bl-field" id="blTargetField">' +
              '<p class="bl-flabel" data-bl-i18n="blt.target"></p>' +
              '<div class="bl-seg" id="blTargetSeg">' +
                '<button class="bl-segbtn" data-target="51">51</button>' +
                '<button class="bl-segbtn" data-target="100">100</button>' +
                '<button class="bl-segbtn selected" data-target="152">152</button>' +
                '<button class="bl-segbtn" data-target="200">200</button>' +
              '</div>' +
            '</div>' +

            '<div class="bl-field bl-fieldfold" id="blTableRulesField">' +
              '<p class="bl-flabel bl-foldhead" id="blFoldHead"><span data-bl-i18n="blt.settingsTitle"></span> \u25be</p>' +
              '<div class="bl-foldbody" id="blFoldBody" hidden>' +
                '<p class="bl-flabel" data-bl-i18n="blt.firstLead"></p>' +
                '<div class="bl-seg" id="blLeadSeg">' +
                  '<button class="bl-segbtn selected" data-lead="left" data-bl-i18n="blt.firstLead.left"></button>' +
                  '<button class="bl-segbtn" data-lead="namer" data-bl-i18n="blt.firstLead.namer"></button>' +
                '</div>' +
                '<p class="bl-flabel" data-bl-i18n="blt.kabotBonus"></p>' +
                '<div class="bl-seg" id="blKabotSeg">' +
                  '<button class="bl-segbtn" data-kabot="0">0</button>' +
                  '<button class="bl-segbtn selected" data-kabot="30">30</button>' +
                  '<button class="bl-segbtn" data-kabot="50">50</button>' +
                  '<button class="bl-segbtn" data-kabot="90">90</button>' +
                '</div>' +
                '<label class="bl-checkrow"><input type="checkbox" id="blMustBeat">' +
                  '<span class="bl-checkmark" aria-hidden="true"></span>' +
                  '<span><b data-bl-i18n="blt.mustBeat"></b><br><small data-bl-i18n="blt.mustBeatHint"></small></span></label>' +
              '</div>' +
            '</div>' +

            '<button class="bl-go" id="blStartBtn"><span data-bl-i18n="blt.start"></span></button>' +

            /* بطاقة الغرفة (تظهر فقط في وضع غرفة الأونلاين) */
            '<div class="bl-roommenu-wrap" id="blRoomMenu" style="display:none"></div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      /* ═══════════ شاشة الطاولة ═══════════ */
      '<section class="bl-screen" id="blGame">' +
        '<div class="bl-table" id="blTable">' +
          '<div class="bl-felt" aria-hidden="true"></div>' +
          '<div class="bl-tablelogo" aria-hidden="true"><img id="blTableLogoImg" alt=""></div>' +
          '<div class="bl-emblem" aria-hidden="true"><svg viewBox="0 0 200 200">' +
            '<path d="M100 18 L118 82 L182 100 L118 118 L100 182 L82 118 L18 100 L82 82 Z" fill="none" stroke-width="2"/>' +
            '<path d="M100 52 L111 89 L148 100 L111 111 L100 148 L89 111 L52 100 L89 89 Z" fill="none" stroke-width="1.4"/>' +
          '</svg></div>' +

          /* ── لوحة النتائج العلوية ── */
          '<header class="bl-hud">' +
            '<div class="bl-hudside bl-hud-us" id="blHudUs">' +
              '<p class="bl-hudlabel" data-bl-i18n="blt.us"></p>' +
              '<p class="bl-hudscore" id="blScoreUs">0</p>' +
              '<p class="bl-hudsub" id="blSubUs">0/152</p>' +
            '</div>' +
            '<div class="bl-hudcenter">' +
              '<p class="bl-hudround" id="blRoundLbl">1</p>' +
              '<div class="bl-hudtrump" id="blTrumpBadge"><svg viewBox="0 0 24 24"><use id="blTrumpPip" href="#bl-pip-S" width="24" height="24"/></svg><span id="blTrumpTxt">\u2014</span></div>' +
            '</div>' +
            '<div class="bl-hudside bl-hud-them" id="blHudThem">' +
              '<p class="bl-hudlabel" data-bl-i18n="blt.them"></p>' +
              '<p class="bl-hudscore" id="blScoreThem">0</p>' +
              '<p class="bl-hudsub" id="blSubThem">0/152</p>' +
            '</div>' +
          '</header>' +

          /* ── المقاعد ── */
          '<div class="bl-seat bl-seat-top" id="blSeatTop"><div class="bl-stack" id="blStack2"></div>' +
            '<div class="bl-plate" id="blPlate2"><span class="bl-platebadge" id="blBadge2"></span><div class="bl-av" id="blName2">\u2026</div><span class="bl-platecount" id="blCount2">8</span><p class="bl-platesub" id="blSub2"></p></div></div>' +
          '<div class="bl-seat bl-seat-right" id="blSeatRight"><div class="bl-stack" id="blStack1"></div><div class="bl-plate" id="blPlate1"><span class="bl-platebadge" id="blBadge1"></span><div class="bl-av" id="blName1">\u2026</div><span class="bl-platecount" id="blCount1">8</span><p class="bl-platesub" id="blSub1"></p></div></div>' +
          '<div class="bl-seat bl-seat-left" id="blSeatLeft"><div class="bl-stack" id="blStack3"></div><div class="bl-plate" id="blPlate3"><span class="bl-platebadge" id="blBadge3"></span><div class="bl-av" id="blName3">\u2026</div><span class="bl-platecount" id="blCount3">8</span><p class="bl-platesub" id="blSub3"></p></div></div>' +

          /* ── منطقة الأكلة ── */
          '<div class="bl-trickzone" id="blTrickZone">' +
            '<div class="bl-trick" id="blTrick"></div>' +
            '<div class="bl-ashurchip" id="blAshurChip" hidden></div>' +
          '</div>' +

          /* ── بانر الأحداث ── */
          '<div class="bl-banner" id="blBanner"></div>' +

          /* ── أزرار الإجراءات (تسمية/أشور) ── */
          '<div class="bl-actions" id="blActions"></div>' +

          /* ── يد اللاعب ── */
          '<div class="bl-handwrap" id="blHandWrap">' +
            '<div class="bl-handplate" id="blHandPlate"><div class="bl-av" id="blName0">\u0623\u0646\u062a</div><span class="bl-platecount" id="blCount0">8</span></div>' +
            '<div class="bl-hand" id="blHand"></div>' +
          '</div>' +

        '</div>' +

        /* ── طبقة المودالات ── */
        '<div class="bl-overlay" id="blOverlay"></div>' +
        '<div class="bl-floats" id="blFloats"></div>' +
      '</section>' +

      '<div class="bl-toast" id="blToast"></div>' +
    '</div>';
  }

  root.BLHTML = { stageHTML: stageHTML, suitBtn: suitBtn, SUIT_GLYPH: SUIT_GLYPH };
})(typeof window !== 'undefined' ? window : globalThis);
