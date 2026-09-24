/* ════════════════════════════════════════════════════════════════════
   UNHTML — بنية شاشات أونو (القائمة + الطاولة + الطبقات)
   بلا رهان وبلا إيقاف — القواعد من أيقونة كتاب المنصة.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  function seg(opts, value, cls) {
    /* opts: [value, labelKey] */
    let h = '';
    for (let i = 0; i < opts.length; i++) {
      h += '<button type="button" class="' + cls + (String(opts[i][0]) === String(value) ? ' on' : '') + '" data-v="' + opts[i][0] + '">' + (opts[i][1] || '') + '</button>';
    }
    return h;
  }

  function stageHTML() {
    const T = root.UN_T;
    return '' +
    /* ═══════════ شاشة القائمة ═══════════ */
    '<section class="un-screen un-screen-active" id="unMenu">' +
      '<div class="un-menuwrap">' +
        '<header class="un-menuhead">' +
          '<h1 class="un-menutitle" data-un-i18n="un.title"></h1>' +
          '<p class="un-menutag" data-un-i18n="un.tagline"></p>' +
        '</header>' +
        '<div class="un-menucard">' +
          '<div class="un-field" id="unModeField">' +
            '<p class="un-flabel" data-un-i18n="un.mode.ai"></p>' +
            '<div class="un-seg" id="unModeSeg">' +
              '<button type="button" class="un-segbtn on" data-v="ai" data-un-i18n="un.mode.ai"></button>' +
              '<button type="button" class="un-segbtn" data-v="local" data-un-i18n="un.mode.local"></button>' +
            '</div>' +
            '<p class="un-mode-desc" id="unModeDesc" data-un-i18n="un.rulesHint"></p>' +
          '</div>' +
          '<div class="un-field" id="unLevelField">' +
            '<p class="un-flabel" data-un-i18n="un.level.1"></p>' +
            '<div class="un-seg" id="unLevelSeg">' +
              '<button type="button" class="un-segbtn" data-v="0" data-un-i18n="un.level.0"></button>' +
              '<button type="button" class="un-segbtn on" data-v="1" data-un-i18n="un.level.1"></button>' +
              '<button type="button" class="un-segbtn" data-v="2" data-un-i18n="un.level.2"></button>' +
            '</div>' +
          '</div>' +
          '<div class="un-field" id="unTargetField">' +
            '<p class="un-flabel" data-un-i18n="un.target"></p>' +
            '<div class="un-seg" id="unTargetSeg">' +
              '<button type="button" class="un-segbtn" data-v="200">200</button>' +
              '<button type="button" class="un-segbtn on" data-v="500">500</button>' +
              '<button type="button" class="un-segbtn" data-v="1000">1000</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="un-go" id="unStartBtn" data-un-i18n="un.start"></button>' +
      '</div>' +
    '</section>' +

    /* ═══════════ شاشة الطاولة ═══════════ */
    '<section class="un-screen" id="unGame">' +
      '<div class="un-table" id="unTable">' +
        '<div class="un-felt" aria-hidden="true"></div>' +
        '<div class="un-tablelogo" aria-hidden="true"><img id="unTableLogoImg" alt=""></div>' +

        /* ── HUD ─ */
        '<header class="un-hud">' +
          '<div class="un-hudside" id="unHudUs"><p class="un-hudlabel" data-un-i18n="un.us"></p><p class="un-hudscore" id="unScoreUs">0</p><p class="un-hudsub" id="unSubUs">0/500</p></div>' +
          '<div class="un-hudcenter">' +
            '<p class="un-hudround" id="unRoundLbl">1</p>' +
            '<div class="un-hudcolor" title=""><span class="un-color-dot" id="unColorDot"></span><span id="unColorTxt"></span></div>' +
          '</div>' +
          '<div class="un-hudside" id="unHudThem"><p class="un-hudlabel" data-un-i18n="un.them"></p><p class="un-hudscore" id="unScoreThem">0</p><p class="un-hudsub" id="unSubThem">0/500</p></div>' +
        '</header>' +

        /* ── المقاعد ── */
        '<div class="un-seat un-seat-top" id="unSeatTop">' +
          '<div class="un-stack" id="unStack2"></div>' +
          '<div class="un-plate" id="unPlate2"><span class="un-platebadge" id="unBadge2"></span><div class="un-av" id="unName2">…</div><span class="un-platecount" id="unCount2">7</span></div>' +
        '</div>' +
        '<div class="un-seat un-seat-right" id="unSeatRight">' +
          '<div class="un-stack" id="unStack1"></div>' +
          '<div class="un-plate" id="unPlate1"><span class="un-platebadge" id="unBadge1"></span><div class="un-av" id="unName1">…</div><span class="un-platecount" id="unCount1">7</span></div>' +
        '</div>' +
        '<div class="un-seat un-seat-left" id="unSeatLeft">' +
          '<div class="un-stack" id="unStack3"></div>' +
          '<div class="un-plate" id="unPlate3"><span class="un-platebadge" id="unBadge3"></span><div class="un-av" id="unName3">…</div><span class="un-platecount" id="unCount3">7</span></div>' +
        '</div>' +

        /* ── الوسط: طاقم + رمية + اتجاه ── */
        '<div class="un-center">' +
          '<div class="un-dir" id="unDirArrow" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M20 6 L30 16 H24 V26 H16 V16 H10 Z" fill="currentColor"/></svg></div>' +
          '<div class="un-pile" id="unDeckPile" title=""></div>' +
          '<div class="un-pile un-pile-discard" id="unDiscard"></div>' +
        '</div>' +

        /* ── يد اللاعب ── */
        '<div class="un-handwrap" id="unHandWrap">' +
          '<div class="un-handplate" id="unHandPlate"><span class="un-platebadge" id="unBadge0"></span><div class="un-av" id="unName0">…</div><span class="un-platecount" id="unCount0">7</span></div>' +
          '<div class="un-hand" id="unHand"></div>' +
        '</div>' +

        /* ── زر UNO ── */
        '<button type="button" class="un-unobtn" id="unUnoBtn" hidden>UNO</button>' +

        /* ── شريط أفعال ── */
        '<div class="un-actions" id="unActions"></div>' +
      '</div>' +
    '</section>' +

    /* ═══════════ الطبقات ═══════════ */
    '<div class="un-overlay" id="unOverlay"></div>' +
    '<div class="un-toast" id="unToast" hidden></div>';
  }

  root.UNHTML = { stageHTML: stageHTML, seg: seg };
})(typeof window !== 'undefined' ? window : globalThis);
