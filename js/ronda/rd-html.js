/**
 * ============================================================================
 *  RD_HTML — بنية واجهة الروندا الكلاسيكية داخل المنصة (v2.6 — الطاولة المرغوبة)
 *  • الطاولة تملأ 100% من حاوية اللعبة (لا شريط علوي بني، لا أزرار رجوع/صوت).
 *  • المعلومات أعلى: زر «؟» أعلى المنتصف بين لوحتي الخصمين + عنوان «روندا»
 *    أصفر عريض + سطر أصفر (الهدف يميناً/الجولة وسطاً/التوزيعة يساراً).
 *  • كل الورق على الحواف: صفّا ورق مقلوب بحجم كامل للخصمين العلويين، وصف
 *    في نفس صف اليد للخصم أسفل-يمين، واليد مكشوفة بالكامل أسفل المنتصف.
 *  • الرزمة أسفل المنتصف بين البيضاوية واليد؛ سجل الأحداث مخفي افتراضياً
 *    بمقبض نصف دائري أصفر أسفل المنتصف. الهوية الذهبية المغربية.
 *  • الأوراق إسبانية حقيقية (assets/cards/es/) — النصوص عبر data-i18n.
 *  • لا توجد أي شاشة «كشف أوراق الخصم» — أيدي غير النشط تبقى ظهراً دائماً.
 *  • القائمة (إعدادات): نمط + الهدف + مبلغ الرهان (إدخال يدوي) + الصوت.
 *    قواعد اللعبة تفتح من أيقونة «؟» الشفافة وسط الطاولة (لا زر في القائمة).
 * ============================================================================
 *  يُحقن في #gamePageBody عبر eRondaCard() (js/games/rondacard.js).
 * ============================================================================
 */
window.RD_HTML = (function () {
  'use strict';

  return '' +
  '<div class="stage rd-stage" id="rdStage">' +

    /* ─────────────── شاشة البداية (الإعدادات) ─────────────── */
    '<section id="screen-menu" class="rd-screen active">' +
      '<div class="rd-menu-decor" aria-hidden="true"></div>' +
      '<div class="rd-menu-card">' +
        '<div class="rd-logo-cards" aria-hidden="true">' +
          '<div class="rd-logo-card rd-lc-1"></div>' +
          '<div class="rd-logo-card rd-lc-2"></div>' +
          '<div class="rd-logo-card rd-lc-3"></div>' +
        '</div>' +
        '<h1 class="rd-game-title" data-i18n="rdc.title">الروندا</h1>' +
        '<p class="rd-game-subtitle" data-i18n="rdc.subtitle">اللعبة المغربية التقليدية بالأوراق</p>' +
        '<div class="rd-menu-section">' +
          '<h2 class="rd-menu-label" data-i18n="rdc.playLabel">نمط اللعب</h2>' +
          '<div class="rd-family-options" id="family-options" role="tablist" aria-label="نمط اللعب">' +
            '<button type="button" class="rd-family-btn selected" id="fam-ai" data-family="ai" role="tab" aria-selected="true">' +
              '<span class="rd-family-name" data-i18n="rdc.mode.ai.fam">ضد الكمبيوتر</span>' +
            '</button>' +
            '<button type="button" class="rd-family-btn" id="fam-pvp" data-family="pvp" role="tab" aria-selected="false">' +
              '<span class="rd-family-name" data-i18n="rdc.mode.pvp.fam">وجهًا لوجه — نفس الجهاز</span>' +
            '</button>' +
          '</div>' +
          '<div class="rd-mode-options" id="mode-options">' +
            '<button type="button" class="rd-mode-btn selected" data-shape="1v1">' +
              '<span class="rd-mode-name">1v1</span>' +
              '<span class="rd-mode-desc"></span>' +
            '</button>' +
            '<button type="button" class="rd-mode-btn" data-shape="1v2">' +
              '<span class="rd-mode-name">1v2</span>' +
              '<span class="rd-mode-desc"></span>' +
            '</button>' +
            '<button type="button" class="rd-mode-btn" data-shape="1v3">' +
              '<span class="rd-mode-name">1v3</span>' +
              '<span class="rd-mode-desc"></span>' +
            '</button>' +
            '<button type="button" class="rd-mode-btn" data-shape="2v2">' +
              '<span class="rd-mode-name">2v2</span>' +
              '<span class="rd-mode-desc"></span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="rd-menu-row">' +
          '<div class="rd-menu-section rd-menu-half">' +
            '<h2 class="rd-menu-label" data-i18n="rdc.targetLabel">هدف الفوز</h2>' +
            '<div class="rd-target-options" id="target-options">' +
              '<button type="button" class="rd-target-pill" data-target="round">' +
                '<span class="rd-target-txt" data-i18n="rdc.target.round">جولة</span>' +
                '<small class="rd-target-sub" data-i18n="rdc.target.roundSub">توزيع 40 ورقة</small>' +
              '</button>' +
              '<button type="button" class="rd-target-pill" data-target="41">41</button>' +
              '<button type="button" class="rd-target-pill selected" data-target="51">51</button>' +
              '<button type="button" class="rd-target-pill" data-target="61">61</button>' +
            '</div>' +
          '</div>' +
          '<div class="rd-menu-section rd-menu-half">' +
            '<h2 class="rd-menu-label" data-i18n="rdc.timer.label">مؤقت الدور</h2>' +
            '<div class="rd-timer-box" id="timer-box">' +
              '<button type="button" class="rd-timer-btn" id="timer-dec" aria-label="-10 ثوانٍ">−</button>' +
              '<span class="rd-timer-val" id="timer-val">60</span>' +
              '<span class="rd-timer-unit" data-i18n="rdc.timer.sec">ث</span>' +
              '<button type="button" class="rd-timer-btn" id="timer-inc" aria-label="+10 ثوانٍ">+</button>' +
            '</div>' +
            '<p class="rd-timer-hint" data-i18n="rdc.timer.hint">من 30 إلى 300 ثانية — بعد انتهاء الوقت يلعب بدلًا عنك تلقائيًا</p>' +
          '</div>' +
        '</div>' +
        '<div class="rd-menu-row">' +
          '<div class="rd-menu-section rd-menu-half">' +
            '<h2 class="rd-menu-label" data-i18n="rdc.betLabel">مبلغ الرهان</h2>' +
            '<div class="rd-bet-box">' +
              '<span class="rd-bet-coin" aria-hidden="true">🪙</span>' +
              '<input type="number" class="rd-bet-input" id="bet-input" min="0" step="10" value="10" inputmode="numeric" aria-label="مبلغ الرهان">' +
            '</div>' +
          '</div>' +
        '<div class="rd-menu-section rd-menu-half rd-menu-toggles">' +
          '<p class="rd-snd-hint" data-i18n="rdc.tgl.soundHint">🔊 الصوت من زر السماعة في رأس اللعبة</p>' +
        '</div>' +
        '</div>' +
        '<button type="button" class="rd-btn-primary" id="btn-start" data-i18n="rdc.btn.start">ابدأ اللعب</button>' +
      '</div>' +
    '</section>' +

    /* ─────────────── شاشة اللعب — الطاولة (100% من الحاوية) ─────────────── */
    '<section id="screen-game" class="rd-screen">' +
      '<div class="rd-table" id="felt">' +

        /* العمود العلوي الأوسط: عنوان «روندا» أصفر عريض + سطر المعلومات
           الأصفر (الهدف يميناً / الجولة وسطاً / التوزيعة يساراً) بلا خلفيات.
           لا زر «؟» على الطاولة — القواعد من كتاب الهيدر في المنصة. */
        '<div class="rd-tophead" id="rd-tophead">' +
          '<h2 class="rd-bigtitle" data-i18n="rdc.title">الروندا</h2>' +
          '<div class="rd-roundline" id="rd-roundline">' +
            '<span class="rd-inf-seg rd-inf-round"><i data-i18n="rdc.hud.round">الجولة</i><b id="hud-round">1</b></span>' +
          '</div>' +
          '<div class="rd-infline" id="rd-infline">' +
            '<span class="rd-inf-seg rd-inf-deal"><i data-i18n="rdc.hud.deal">التوزيعة</i><b id="hud-deal">1</b></span>' +
            '<span class="rd-inf-seg rd-inf-target"><i data-i18n="rdc.hud.target">الهدف</i><b id="hud-target">51</b></span>' +
          '</div>' +
        '</div>' +

        /* زوايا الطاولة الأربع (تعبؤها أيقونات اللاعبين + صفوف الورق المقلوب) */
        '<div class="rd-corner rd-corner-tl" id="rd-corner-tl" data-corner="tl"></div>' +
        '<div class="rd-corner rd-corner-tr" id="rd-corner-tr" data-corner="tr"></div>' +
        '<div class="rd-corner rd-corner-br" id="rd-corner-br" data-corner="br"></div>' +
        '<div class="rd-corner rd-corner-bl" id="rd-corner-bl" data-corner="bl"></div>' +

        /* القاعة المركزية: بيضاوية اللعب — الأوراق المرمية داخلها.
           [v2.13] الرزمة خرجت من القاعة إلى المسرح مباشرة (level المسرح)
           كي يمكن تثبيتها في الهامش الأسفل للشاشة (طلب المستخدم) بلا معادلات
           نسبية معقدة داخل حدود القاعة. */
        '<div class="rd-court" id="rd-court">' +
          '<div class="rd-court-rug" aria-hidden="true"></div>' +
          '<div class="rd-table-cards" id="table-cards"></div>' +
        '</div>' +
        '<div class="rd-deck" id="rd-deck" title="الرزمة" data-i18n-title="rdc.hud.deckTitle">' +
          '<div class="rd-dk-card rd-dk-1"></div>' +
          '<div class="rd-dk-card rd-dk-2"></div>' +
          '<div class="rd-dk-card rd-dk-3"></div>' +
          '<span class="rd-deck-count" id="deck-count">40</span>' +
        '</div>' +

        /* الصف السفلي: يد اللاعب (مكشوفة بالكامل) + شريط المتفرج */
        '<div class="rd-botrail">' +
          '<div class="rd-hand" id="hand"></div>' +
          '<div class="rd-specbar rd-hidden" id="rd-specbar" role="status"></div>' +
        '</div>' +
      '</div>' +

      /* سجل الأحداث — مخفي افتراضياً: مقبض نصف دائري أصفر أسفل المنتصف */
      '<aside class="rd-log-panel" id="log-panel" aria-label="سجل الأحداث">' +
        '<button type="button" class="rd-log-handle" aria-label="سجل الأحداث" data-i18n-title="rdc.logTitle">' +
          '<span class="rd-log-hic" aria-hidden="true"></span>' +
        '</button>' +
        '<div class="rd-log-body">' +
          '<h3 class="rd-log-title" data-i18n="rdc.logTitle">سجل الأحداث</h3>' +
          '<ul class="rd-log-list" id="log-list"></ul>' +
        '</div>' +
      '</aside>' +

      '<div class="rd-banner-layer" id="banner-layer" aria-live="polite"></div>' +

      /* حالة انتظار (غرفة: بانتظار تهيئة الموزع أو إعادة بناء الجولة) */
      '<div class="rd-wait rd-hidden" id="rd-waiting" role="status">' +
        '<div class="rd-wait-box">' +
          '<div class="rd-wait-spin" aria-hidden="true"></div>' +
          '<div class="rd-wait-txt" id="rd-wait-txt"></div>' +
          '<div class="rd-wait-sub" id="rd-wait-sub"></div>' +
        '</div>' +
      '</div>' +
    '</section>' +

    /* ─────────────── الطبقات العلوية ─────────────── */
    '<div class="rd-overlay rd-hidden" id="overlay-rules" role="dialog" aria-modal="true">' +
      '<div class="rd-modal rd-rules-modal">' +
        '<button type="button" class="rd-modal-close" id="btn-rules-close" title="إغلاق" data-i18n-title="ui.close" aria-label="إغلاق">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
        '<h2 class="rd-modal-title" data-i18n="rdc.rules.title">قواعد لعبة الروندا</h2>' +
        '<div class="rd-rules-body" id="rules-body"></div>' +
      '</div>' +
    '</div>' +

    '<div class="rd-overlay rd-hidden" id="overlay-round" role="dialog" aria-modal="true">' +
      '<div class="rd-modal rd-round-modal">' +
        '<h2 class="rd-modal-title" id="round-modal-title" data-i18n="rdc.round.title">انتهت الجولة</h2>' +
        '<div class="rd-breakdown-wrap" id="round-breakdown"></div>' +
        '<div class="rd-round-auto" id="round-auto-hint"></div>' +
        '<button type="button" class="rd-btn-primary" id="btn-next-round" data-i18n="rdc.round.next">الجولة التالية</button>' +
      '</div>' +
    '</div>' +

    '<div class="rd-overlay rd-hidden" id="overlay-match" role="dialog" aria-modal="true">' +
      '<div class="rd-modal rd-match-modal">' +
        '<div class="rd-confetti" aria-hidden="true"></div>' +
        '<p class="rd-match-kicker" data-i18n="rdc.match.kicker">نهاية المباراة</p>' +
        '<h2 class="rd-match-winner" id="match-winner-name">الفريق أ</h2>' +
        '<p class="rd-match-score" id="match-final-score"></p>' +
        '<div class="rd-breakdown-wrap" id="match-breakdown"></div>' +
        '<div class="rd-match-room rd-hidden" id="match-room-actions"></div>' +
        '<button type="button" class="rd-btn-primary" id="btn-new-match" data-i18n="rdc.match.new">مباراة جديدة</button>' +
        '<button type="button" class="rd-btn-ghost" id="btn-back-menu" data-i18n="rdc.match.menu">القائمة الرئيسية</button>' +
      '</div>' +
    '</div>' +
  '</div>';
})();
