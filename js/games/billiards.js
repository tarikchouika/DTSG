/* ══════════════════════════════════════════════════════════════════
   Billiards — واجهة اللعبة (Canvas + HUD + إعدادات)
   ══════════════════════════════════════════════════════════════════
   النمط المتّبع في المنصة: eBilliards(g) يُرجع HTML، initBilliards() يهيّئ.
   يعتمد على:
     • js/games/billiards-physics.js  (BilliardsPhysics)
     • js/games/billiards-rules.js    (BilliardsRules)
   يُحمَّل قبل engines.js (يُستعمل في ENG) وقبل rooms.js (يُستعمل في Rooms).
   ══════════════════════════════════════════════════════════════════ */
"use strict";

var BILLIARDS = null;
var BILLIARDS_BETS = [0, 50, 100, 250, 500];

/* ── ألوان الكرات المرقمة ── */
var BL_COLORS = {
  1: '#ffc107', 2: '#1e5bd6', 3: '#e53935', 4: '#7b2fa0', 5: '#fb8c00',
  6: '#2e9e44', 7: '#8d2b2b', 8: '#101010',
  9: '#ffc107', 10: '#1e5bd6', 11: '#e53935', 12: '#7b2fa0', 13: '#fb8c00',
  14: '#2e9e44', 15: '#8d2b2b'
};
var BL_BBCOLORS = { RED: '#d32f2f', YELLOW: '#f5c400', BLACK: '#111111' };
var BL_SNCOLORS = { RED: '#c62828', YELLOW: '#f2c200', GREEN: '#1b7a34', BROWN: '#7a4a21', BLUE: '#1e5bd6', PINK: '#f06292', BLACK: '#111111' };
var BL_SNORDER = ['YELLOW', 'GREEN', 'BROWN', 'BLUE', 'PINK', 'BLACK'];
var BL_CLOTHS = { green: ['#14713d', '#1e9a52'], blue: ['#175a8c', '#2e86c1'], maroon: ['#571a24', '#7a2230'] };
var BL_RAILS = { wood: ['#d19a5b', '#b57a3e'], ornate: ['#d19a5b', '#c19055'], black: ['#2a2c33', '#17181d'] };

/* [UI-v3] كل صنف بلياردو لعبة مستقلة — هوية شاشة الإعداد حسب معرف اللعبة */
var BL_VAR_EM    = { bl8: '🎱', blbb: '🔴', blgv: '🟡', blsn: '🟥', blca: '⚪' };
var BL_VAR_TITLE = { bl8: 'bl.v8ball', blbb: 'bl.vBlackball', blgv: 'bl.vGolvazor', blsn: 'bl.vSnooker', blca: 'bl.vCarom' };
var BL_VAR_SUB   = { bl8: 'bl.v8ballSub', blbb: 'bl.vBlackballSub', blgv: 'bl.vGolvazorSub', blsn: 'bl.vSnookerSub', blca: 'bl.vCaromSub' };

function blShade(hex, f) {
  var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}

/* ═══════════ HTML ═══════════ */
function eBilliards(g) {
  var betChips = BILLIARDS_BETS.map(function (b, i) {
    return '<button class="dama-chip' + (i === 0 ? ' on' : '') + '" data-bet="' + b + '" onclick="billiardsSetBet(' + b + ')">'
      + (b === 0 ? T('chess.friendly') : b + ' 🪙') + '</button>';
  }).join('');
  var clothOpts = [['green', T('bl.clothGreen')], ['blue', T('bl.clothBlue')], ['maroon', T('bl.clothMaroon')]]
    .map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('');
  var railOpts = [['wood', T('bl.railWood')], ['ornate', T('bl.railOrnate')], ['black', T('bl.railBlack')]]
    .map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('');

  return gFrame(
    '<div class="bl-wrap" id="blWrap">' +
      /* ── شاشة الإعداد — [UI-v3] كل صنف لعبة مستقلة: لا اختيار صنف هنا ── */
      '<div class="dama-setup" id="blSetup">' +
        '<div class="dama-logo"><span class="bl-logo-em">' + (BL_VAR_EM[g.id] || '🎱') + '</span></div>' +
        '<div class="dama-title">' + T(BL_VAR_TITLE[g.id] || 'bl.title') + '</div>' +
        '<div class="dama-sub">' + T(BL_VAR_SUB[g.id] || 'bl.sub') + '</div>' +
        '<div class="dama-field" id="blCaromField" hidden>' +
          '<div class="dama-flab">' + T('bl.caDisc') + '</div>' +
          '<div class="dama-pick" id="blCaDisc"></div>' +
          '<div class="dama-flab">' + T('bl.caTarget') + '</div>' +
          '<div class="dama-pick" id="blCaTarget"></div>' +
        '</div>' +
        '<div class="dama-field" id="blGvField" hidden>' +
          '<div class="dama-flab">' + T('bl.gvFinish') + '</div>' +
          '<div class="dama-pick" id="blGvFinish"></div>' +
          '<div class="dama-flab" id="blGvBoundLab" hidden>' + T('bl.gvBoundN') + '</div>' +
          '<div class="dama-pick" id="blGvBound" hidden></div>' +
        '</div>' +
        '<div class="dama-field"><div class="dama-flab">⏱ ' + T('bl.turnTimer') + '</div>' +
          '<div class="dama-pick" id="blTimerPick"></div>' +
        '</div>' +
        '<div class="dama-field" id="blBetField" hidden><div class="dama-flab">' + T('chess.roomBet') + '</div>' +
          '<div class="dama-pick" id="blBet">' + betChips + '</div>' +
        '</div>' +
        '<div class="dama-pay ch-hint">🎓 ' + (T('ui.trainingFree') || 'تدريب مجاني بدون رهان — الرهان متاح في الغرف أونلاين فقط') + '</div>' +
        '<div class="dama-field"><div class="dama-flab">' + T('bl.appearance') + '</div>' +
          '<div class="bl-look">' +
            '<select id="blCloth" onchange="billiardsLook()">' + clothOpts + '</select>' +
            '<select id="blRailSel" onchange="billiardsLook()">' + railOpts + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="bl-modes">' +
          '<button class="big dama-go" onclick="billiardsStartAI()"><i class="fa-solid fa-robot" aria-hidden="true"></i> ' + T('bl.vsAI') + '</button>' +
          '<button class="big ch-online" onclick="billiardsOnline()"><i class="fa-solid fa-globe" aria-hidden="true"></i> ' + T('chess.onlineRoom') + '</button>' +
        '</div>' +
        '<div class="dama-pay bl-hint" id="blVariantHint"></div>' +
      '</div>' +

      /* ── شاشة اللعب [UI-v3] — تصميم الصورة المركبة:
         بورتريه: شريط علوي (تدوير + صينية) + عمود أيمن يضم كل الأدوات؛
         لاندسكيب: عمودان خشبيان — يسار (تدوير+أفاتار الخصم/لونه/صينيته/التنفيذ/الدوران)
         ويمين (أفاتاري+خروج/لوني/صينيتي/شريط القوة الطويل) ── */
      '<div class="dama-play" id="blPlay" hidden>' +
      /* [UI-v4] لاندسكيب مرجعي: عمود أيسر (تدوير+أفاتار الخصم بلون كراته
         وحرفَي اسمه، كراته الساقطة بخط مستقيم تحته، السبين أسفلاً) وعمود
         أيمن (أفاتاري وكراتي | القوة والتنفيذ تحت زر التصغير). البورتريه =
         قلب الحاوية 90°: العمود الأيسر يصير الشريط الأعلى والأيمن الأسفل. */
      '<div class="bl-frame" id="blFrame">' +
        '<div class="bl-topbar bl-sr" id="blTopbar"><div class="bl-tray" id="blTray"></div></div>' +
        '<div class="bl-lrail" id="blLRail">' +
          '<div class="bl-srow" id="blLTop">' +
            '<button class="bl-rotbtn" id="blRotBtn" onclick="billiardsFlipView()" title="&#8635;">🔄</button>' +
            '<span class="bl-av p2" id="blAv1">2</span>' +
          '</div>' +
          '<b class="bl-score" id="blScore1" hidden></b>' +
          '<div class="bl-vtray" id="blTrayL"></div>' +
          '<div class="bl-spin" id="blSpin" title="' + T('bl.spinHint') + '"><i id="blSpinDot"></i></div>' +
        '</div>' +
        '<div class="bl-mid" id="blMid">' +
          '<div class="bl-stage" id="blStageBox"><canvas id="blCv"></canvas></div>' +
          '<div class="bl-turnpill" id="blTurn">…</div>' +
          '<div class="bl-noms bl-sr" id="blNoms" hidden></div>' +
          '<div class="bl-msg bl-sr" id="blMsg"></div>' +
          '<div class="bl-stake" id="blStake" hidden></div>' +
          '<div class="bl-minis bl-sr">' +
            '<button class="dama-mini" id="blStale" onclick="billiardsStalemate()" hidden>🤝 ' + T('bl.stalemateBtn') + '</button>' +
            '<button class="dama-mini" onclick="billiardsRules()">📖 ' + T('g.rules') + '</button>' +
            '<button class="dama-mini" onclick="billiardsResign()">🏳️ ' + T('dama.resignBtn') + '</button>' +
            '<button class="dama-mini" onclick="billiardsToSetup()">↩️ ' + T('dama.newGame') + '</button>' +
          '</div>' +
          '<div class="bl-rerack" id="blRerack" hidden><div class="bl-rerack-card">' +
            '<b id="blRerackTx"></b>' +
            '<button class="big dama-go" onclick="billiardsChooseBreak(true)">🎯 ' + T('bl.takeBreak') + '</button>' +
            '<button class="big ch-online" onclick="billiardsChooseBreak(false)">↩️ ' + T('bl.giveBreak') + '</button>' +
          '</div></div>' +
        '</div>' +
        '<div class="bl-rail" id="blRail">' +
          '<div class="bl-srow" id="blRTop">' +
            '<span class="bl-av p1" id="blAv0">1</span>' +
          '</div>' +
          '<b class="bl-score" id="blScore0" hidden></b>' +
          '<div class="bl-vtray" id="blTrayR"></div>' +
          '<div class="bl-cue-track" id="blCueTrack">' +
            '<div class="bl-cue-stick" id="blCueStick"></div>' +
          '</div>' +
          '<div class="bl-sr">' +
            '<div class="bl-pl" id="blPl0"><span class="bl-nm" id="blNm0">' + T('bl.player1') + '</span><span class="bl-grp" id="blGrp0"></span></div>' +
            '<div class="bl-pl" id="blPl1"><span class="bl-nm" id="blNm1">' + T('bl.player2') + '</span><span class="bl-grp" id="blGrp1"></span></div>' +
            '<b id="blPowVal">75</b>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +

      /* ── نافذة النتيجة ── */
      '<div class="dama-over" id="blOver" hidden>' +
        '<div class="dama-over-card">' +
          '<div class="dama-over-em" id="blOverEm">🏆</div>' +
          '<div class="dama-over-tx" id="blOverTx"></div>' +
          '<div class="dama-over-amt" id="blOverAmt"></div>' +
          '<button class="big dama-go" onclick="billiardsNewFrame()">↩️ ' + T('dama.newMatch') + '</button>' +
          '<button class="big ch-online" onclick="billiardsToSetup()">⚙️ ' + T('bl.settings') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  , g).replace('<div class="stage">', '<div class="stage" id="billiardsStage">');
}

/* ═══════════ التهيئة ═══════════ */
function initBilliards() {
  document.body.classList.add('bl-game-open');   /* v10: خلفية الحاوية خشب دموي */
  var gid = window._currentGameId || 'bl8';
  BILLIARDS = {
    mode: 'local', variant: (gid === 'blbb') ? 'blackball' : (gid === 'blgv') ? 'golvazor' : (gid === 'blsn') ? 'snooker' : (gid === 'blca') ? 'carom' : 'eightball',
    caromDisc: 'THREE', caromTarget: 10, bet: 0,
    gvFinish: 'DIRECT', gvBound: 2,
    turnTimer: 60, timerLeft: 0, timerLastSec: 0,
    cloth: 'green', rail: 'wood', aimGuide: true,
    G: null, aim: 0, power: 75, spin: { x: 0, y: 0 },
    raf: 0, lastT: 0, acc: 0, drawing: false,
    aiPending: false, msgT: null, over: false,
    isSpectator: false, oppBot: false, mySeat: 0,
    cv: null, ctx: null, dpr: 1, VT: null, ro: null, flip: false
  };
  blBuildCaromOpts();
  blBuildGvOpts();
  blBuildTimerOpts();
  blUpdateHint();
  blRegisterRooms();
}

/* ── [V19.5] مؤقت الدور: 30..300 ثانية — عند انتهائه تُنفَّذ ضربة آلية كي لا يتجمد اللعب ── */
function blBuildTimerOpts() {
  var box = document.getElementById('blTimerPick');
  if (!box || !BILLIARDS) return;
  box.innerHTML = [30, 60, 90, 120, 180, 300].map(function (n) {
    return '<button class="dama-chip' + (BILLIARDS.turnTimer === n ? ' on' : '') + '" onclick="billiardsSetTimer(' + n + ')">' + n + 's</button>';
  }).join('');
}
function billiardsSetTimer(n) {
  if (!BILLIARDS) return;
  BILLIARDS.turnTimer = Math.max(30, Math.min(300, n | 0));
  blBuildTimerOpts();
  if (typeof SND !== 'undefined' && SND.click) { try { SND.click(); } catch (e) {} }
}

/* [UI-v3] blBuildVariants أُزيلت — كل صنف لعبة مستقلة من الكتالوج */

/* ── كاروم: اختصاص صريح (§4) وهدف المباراة ── */
function blBuildCaromOpts() {
  var dBox = document.getElementById('blCaDisc'), tBox = document.getElementById('blCaTarget');
  if (!BILLIARDS) return;
  if (dBox) dBox.innerHTML = [['FREE', T('bl.caFree')], ['ONE', T('bl.caOne')], ['THREE', T('bl.caThree')]].map(function (d) {
    return '<button class="dama-chip' + (BILLIARDS.caromDisc === d[0] ? ' on' : '') + '" onclick="billiardsSetDisc(\'' + d[0] + '\')">' + d[1] + '</button>';
  }).join('');
  if (tBox) tBox.innerHTML = [5, 10, 25].map(function (n) {
    return '<button class="dama-chip' + (BILLIARDS.caromTarget === n ? ' on' : '') + '" onclick="billiardsSetTarget(' + n + ')">' + n + '</button>';
  }).join('');
  var f = document.getElementById('blCaromField');
  if (f) f.hidden = (BILLIARDS.variant !== 'carom');
}
/* ── غولڤازور: نوع الإنهاء وعدد البوند ── */
function blBuildGvOpts() {
  var fBox = document.getElementById('blGvFinish'), bBox = document.getElementById('blGvBound');
  var bLab = document.getElementById('blGvBoundLab');
  if (!BILLIARDS) return;
  if (fBox) fBox.innerHTML = [
    ['DIRECT', T('bl.gvDirect')], ['DERNIER', T('bl.gvDernier')], ['BOUND', T('bl.gvBound')],
    ['ANNONCE', T('bl.gvAnnonce')], ['ANNONCE_BOUND', T('bl.gvAnnBound')]
  ].map(function (d) {
    return '<button class="dama-chip' + (BILLIARDS.gvFinish === d[0] ? ' on' : '') + '" onclick="billiardsSetGvFinish(\'' + d[0] + '\')">' + d[1] + '</button>';
  }).join('');
  var showB = (BILLIARDS.gvFinish === 'BOUND' || BILLIARDS.gvFinish === 'ANNONCE_BOUND');
  if (bLab) bLab.hidden = !showB;
  if (bBox) {
    bBox.hidden = !showB;
    bBox.innerHTML = [2, 3, 4, 5].map(function (n) {
      return '<button class="dama-chip' + (BILLIARDS.gvBound === n ? ' on' : '') + '" onclick="billiardsSetGvBound(' + n + ')">' + n + '</button>';
    }).join('');
  }
  var f = document.getElementById('blGvField');
  if (f) f.hidden = (BILLIARDS.variant !== 'golvazor');
}
function billiardsSetGvFinish(d) {
  if (!BILLIARDS) return;
  BILLIARDS.gvFinish = d;
  blBuildGvOpts();
  if (typeof SND !== 'undefined' && SND.click) { try { SND.click(); } catch (e) {} }
}
function billiardsSetGvBound(n) {
  if (!BILLIARDS) return;
  BILLIARDS.gvBound = n;
  blBuildGvOpts();
  if (typeof SND !== 'undefined' && SND.click) { try { SND.click(); } catch (e) {} }
}

function billiardsSetDisc(d) {
  if (!BILLIARDS) return;
  BILLIARDS.caromDisc = d;
  blBuildCaromOpts();
  if (typeof SND !== 'undefined' && SND.click) { try { SND.click(); } catch (e) {} }
}
function billiardsSetTarget(n) {
  if (!BILLIARDS) return;
  BILLIARDS.caromTarget = n;
  blBuildCaromOpts();
  if (typeof SND !== 'undefined' && SND.click) { try { SND.click(); } catch (e) {} }
}

function blUpdateHint() {
  var el = document.getElementById('blVariantHint');
  if (el) el.textContent = (BILLIARDS && BILLIARDS.variant === 'blackball') ? T('bl.hintBlackball')
    : (BILLIARDS && BILLIARDS.variant === 'golvazor') ? T('bl.hintGolvazor')
    : (BILLIARDS && BILLIARDS.variant === 'snooker') ? T('bl.hintSnooker')
    : (BILLIARDS && BILLIARDS.variant === 'carom') ? T('bl.hintCarom') : T('bl.hint8ball');
}

function billiardsSetBet(b) {
  if (!BILLIARDS) return;
  BILLIARDS.bet = b;
  var chips = document.querySelectorAll('#blBet .dama-chip');
  for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('on', +chips[i].getAttribute('data-bet') === b);
  if (typeof SND !== 'undefined' && SND.click) SND.click();
}

function billiardsLook() {
  if (!BILLIARDS) return;
  var c = document.getElementById('blCloth'), r = document.getElementById('blRailSel');
  if (c) BILLIARDS.cloth = c.value;
  if (r) BILLIARDS.rail = r.value;
  if (BILLIARDS.G) blDraw();
}

/* ═══════════ بدء الإطار ═══════════ */
function billiardsStart(mode) {
  if (!BILLIARDS) return;
  var RS = BilliardsRules.RULESETS[BILLIARDS.variant];
  if (!RS || !RS.ready) { toast(T('bl.soon'), 'warn'); return; }
  BILLIARDS.mode = mode || 'local';
  /* [Training 2026-09-16] المحلي/الآلي تدريب بلا تسجيل؛ الغرف وحدها تُسجَّل */
  window.TRAINING = window.TRAINING || { on: false };
  window.TRAINING.on = (BILLIARDS.mode !== 'room');
  BILLIARDS.G = RS.create(BILLIARDS.variant === 'carom'
    ? { firstPlayer: 0, discipline: BILLIARDS.caromDisc, target: BILLIARDS.caromTarget }
    : BILLIARDS.variant === 'golvazor'
    ? { firstPlayer: 0, finish: BILLIARDS.gvFinish, bound: BILLIARDS.gvBound }
    : { firstPlayer: 0 });
  BILLIARDS.over = false;
  BILLIARDS.aim = 0; BILLIARDS.power = 75; BILLIARDS.spin = { x: 0, y: 0 };
  BILLIARDS.G.on(blOnShotEvent);

  var su = document.getElementById('blSetup'), pl = document.getElementById('blPlay'),
      ov = document.getElementById('blOver');
  if (su) su.hidden = true;
  if (ov) ov.hidden = true;
  if (pl) pl.hidden = false;

  var pw = document.getElementById('blPower');
  if (pw) pw.value = 75;
  billiardsPowerUi();
  blResetSpinUi();

  var nm0 = document.getElementById('blNm0'), nm1 = document.getElementById('blNm1');
  if (nm0) nm0.textContent = T('bl.player1');
  if (nm1) nm1.textContent = (BILLIARDS.mode === 'ai') ? T('bl.computer') : T('bl.player2');

  /* [v23] «مجموع الرهان» أزيل نهائياً — كان يحجب حفر الطاولة بلا فائدة */
  var st = document.getElementById('blStake');
  if (st) st.hidden = true;

  var stl = document.getElementById('blStale');
  if (stl) stl.hidden = (BILLIARDS.variant !== 'blackball');
  blSyncRerack();

  blFitCanvas();
  blBindInput();
  blUpdateHud();
  blTray();
  BILLIARDS._trayOwner = {};   /* [UI-v5] تصفير ملكية الكرات الساقطة */
  blSay(BILLIARDS.variant === 'snooker' ? T('bl.msgSnookerStart') : T('bl.msgBreak'));

  if (BILLIARDS.raf) cancelAnimationFrame(BILLIARDS.raf);
  BILLIARDS.lastT = 0; BILLIARDS.acc = 0;
  BILLIARDS.raf = requestAnimationFrame(blTick);
  blMaybeAI();
}

function billiardsStartLocal() { billiardsStart('local'); }
function billiardsStartAI() { billiardsStart('ai'); }
function billiardsOnline() {
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.toggleFromGame !== 'function') {
    toast(T('bl.soon'), 'warn'); return;
  }
  Rooms.toggleFromGame();
}

function billiardsToSetup() {
  if (!BILLIARDS) return;
  if (BILLIARDS.raf) { cancelAnimationFrame(BILLIARDS.raf); BILLIARDS.raf = 0; }
  var su = document.getElementById('blSetup'), pl = document.getElementById('blPlay'),
      ov = document.getElementById('blOver');
  if (pl) pl.hidden = true;
  if (ov) ov.hidden = true;
  if (su) su.hidden = false;
}

function billiardsNewFrame() {
  var ov = document.getElementById('blOver');
  if (ov) ov.hidden = true;
  if (BILLIARDS.mode === 'room') {
    if (typeof Rooms !== 'undefined' && Rooms && typeof Rooms.startRematch === 'function') Rooms.startRematch();
    else billiardsStart('room');
    return;
  }
  billiardsStart(BILLIARDS.mode);
}

function billiardsRules() { if (typeof showFullRules === 'function') showFullRules(); }

function billiardsResign() {
  if (!BILLIARDS || !BILLIARDS.G || BILLIARDS.over) return;
  var me = (BILLIARDS.mode === 'room') ? BILLIARDS.mySeat : BILLIARDS.G.S.active;
  BILLIARDS.G.S.frameOver = true;
  BILLIARDS.G.S.winner = 1 - me;
  BILLIARDS.G.S.endReason = 'RESIGN';
  BILLIARDS.G.S.phase = 'END';
  blEndFrame();
}

/* ═══════════ التحكم ═══════════ */
function billiardsPowerUi() {
  var el = document.getElementById('blPower'), lb = document.getElementById('blPowVal');
  if (!BILLIARDS || !el) return;
  BILLIARDS.power = +el.value;
  if (lb) lb.textContent = el.value;
}

function blResetSpinUi() {
  BILLIARDS.spin = { x: 0, y: 0 };
  var d = document.getElementById('blSpinDot');
  if (d) { d.style.left = '50%'; d.style.top = '50%'; }
}

function blHumanTurn() {
  var S = BILLIARDS.G.S;
  if (BILLIARDS.mode === 'ai' && S.active === 1) return false;
  if (BILLIARDS.mode === 'room' && (BILLIARDS.isSpectator || S.active !== BILLIARDS.mySeat)) return false;
  return true;
}

function billiardsShoot() {
  var B = BILLIARDS;
  if (!B || !B.G) return;
  var S = B.G.S;
  if (S.phase !== 'AIM' || S.frameOver) return;
  if (!blHumanTurn()) return;
  if (B.variant === 'snooker' && S.turnState === 'COLOUR' && !S.nominated) { blSay('🎯 ' + T('bl.snNominatePrompt')); return; }
  if (B.variant === 'golvazor' && typeof B.G.needChoice === 'function' && B.G.needChoice()) { blSay('🎯 ' + T('bl.gvChoosePrompt')); return; }
  if (B.variant === 'golvazor' && typeof B.G.needAnnounce === 'function' && B.G.needAnnounce()) { blSay('🎯 ' + T('bl.gvAnnPrompt')); return; }
  var c = B.G.cue();
  if (!c || c.status !== 'ON_TABLE') return;
  var pl = B.G.shotPayload(B.aim, B.power, (B.spin.x || B.spin.y) ? B.spin : null);
  
  if (B.mode === 'room') {
    B.G.shoot(B.aim, B.power, (B.spin.x || B.spin.y) ? B.spin : null);
    blSendRoom(pl);
  } else {
    B.G.shoot(B.aim, B.power, (B.spin.x || B.spin.y) ? B.spin : null);
  }
  
  /* Reset Power UI */
  B.power = 75;
  var stick = document.getElementById('blCueStick');
  var frm = document.getElementById('blFrame');
  var lb = document.getElementById('blPowVal');
  if (lb) lb.textContent = '75';
  if (stick && frm) {
    if (frm.classList.contains('bl-land')) { stick.style.bottom = '25%'; stick.style.left = ''; }
    else { stick.style.left = '25%'; stick.style.bottom = ''; }
  }
  blResetSpinUi();
  if (typeof SND !== 'undefined' && SND.peg) { try { SND.peg(); } catch (e) {} }
  blUpdateHud();
}

function billiardsPlace(x, y) {
  var B = BILLIARDS;
  if (!B || !B.G) return;
  if (B.G.S.phase !== 'PLACE' || !blHumanTurn()) return;
  var placed = B.G.place(x, y);
  if (B.mode === 'room') blSendRoom(B.G.shotPayload(0, 0, null, { x: x, y: y }));
  if (placed) {
    blUpdateHud();
    blSay(T('bl.msgPlaced'));
  } else blSay(T('bl.msgBadPlace'));
}

/* ═══════════ أحداث القاعدة ═══════════ */
function blOnShotEvent(ev) {
  if (!BILLIARDS) return;
  var G = BILLIARDS.G;
  if (ev.pocketed.length) { blTray(); if (typeof SND !== 'undefined' && SND.coin) { try { SND.coin(); } catch (e) {} } }
  if (ev.illegal_break) {
    blSay('⚠️ ' + T('bl.illegalBreak') + ' (' + ev.break_points + '/3)');
    if (typeof SND !== 'undefined' && SND.lose) { try { SND.lose(); } catch (e) {} }
  } else if (ev.foul) {
    if (BILLIARDS.variant === 'snooker') {
      blSay('⚠️ ' + T('bl.foul') + ' — +' + ev.penalty + ' ' + T('bl.snFoulPen'));
    } else if (BILLIARDS.variant === 'golvazor') {
      var gvw = (G && G.S.placeRestriction === 'GV_BAULK') ? (' — ' + T('bl.biHGvBaulk')) : '';
      blSay('⚠️ ' + T('bl.foul') + ' [' + ev.foul_codes.join(', ') + '] — ' + T('bl.gvPenalty') + gvw);
    } else {
      var bih = (G && G.S.placeRestriction === 'BAULK') ? T('bl.biHBaulk') : T('bl.ballInHand');
      blSay('⚠️ ' + T('bl.foul') + ' [' + ev.foul_codes.join(', ') + '] — ' + bih);
    }
    if (typeof SND !== 'undefined' && SND.lose) { try { SND.lose(); } catch (e) {} }
  } else if (ev.loss_of_turn) blSay(T('bl.msgLossOfTurn'));
  if (ev.turn_state_after === 'COLOUR' && BILLIARDS.variant === 'snooker' && !ev.foul) blSay('🎯 ' + T('bl.snNominatePrompt'));
  if (BILLIARDS.variant === 'golvazor') {
    if (ev.notes && ev.notes.indexOf('PENALTY_SHOT_LEFT') !== -1) blSay('🎯 ' + T('bl.gvShotsLeft') + ' 1');
    if (ev.notes && ev.notes.some(function (n) { return n.indexOf('PENALTY_CANCELLED_BLACK') === 0; })) blSay('ℹ️ ' + T('bl.gvPenCancel'));
    if (ev.notes && ev.notes.indexOf('NO_PENALTY_OPEN_TABLE') !== -1) blSay('ℹ️ ' + T('bl.gvNoPenOpen'));
    if (ev.await_choice && blHumanTurn()) blSay('🎯 ' + T('bl.gvChoosePrompt'));
    else if (!ev.foul && G && typeof G.needAnnounce === 'function' && G.needAnnounce() && blHumanTurn()) blSay('🎯 ' + T('bl.gvAnnPrompt'));
  }
  if (BILLIARDS.variant === 'carom' && !ev.foul) {
    blSay(ev.carom_valid ? '🎯 ' + T('bl.msgCaromOk') : (ev.first_contact ? '↩️ ' + T('bl.msgCaromMiss') : '↩️ ' + T('bl.msgCaromNone')));
  }
  if (G.S.suddenDeath && G.S.phase === 'PLACE') blSay('🔥 ' + T('bl.suddenDeathMsg'));
  if (ev.notes && (ev.notes.indexOf('EIGHT_RESPOTTED_ON_BREAK') !== -1 || ev.notes.indexOf('BLACK_RESPOTTED_ON_BREAK') !== -1)) blSay(T('bl.msgEightRespotted'));
  blUpdateHud();
  blSyncRerack();
  if (G.S.frameOver) blEndFrame();
  else blMaybeAI();
}

/* ═══════════ إعادة الرفّ (4g) والجمود (6g) ═══════════ */
function blSyncRerack() {
  var el = document.getElementById('blRerack');
  if (!el || !BILLIARDS || !BILLIARDS.G) return;
  var show = (BILLIARDS.G.S.phase === 'RERACK');
  el.hidden = !show;
  if (show) {
    var tx = document.getElementById('blRerackTx');
    if (tx) tx.textContent = T('bl.rerackChoice');
  }
}
function billiardsChooseBreak(take) {
  if (!BILLIARDS || !BILLIARDS.G) return;
  if (BILLIARDS.G.S.phase !== 'RERACK') return;
  BILLIARDS.G.chooseBreak(!!take);
  blSyncRerack(); blUpdateHud();
  blSay(T('bl.msgBreak'));
  blMaybeAI();
}
function billiardsStalemate() {
  if (!BILLIARDS || !BILLIARDS.G) return;
  if (typeof BILLIARDS.G.declareStalemate !== 'function') { toast(T('bl.soon'), 'warn'); return; }
  if (BILLIARDS.G.S.frameOver) return;
  BILLIARDS.G.declareStalemate();
  blUpdateHud(); blTray();
  blSay('🤝 ' + T('bl.stalemateMsg'));
}

function blEndFrame() {
  var B = BILLIARDS;
  if (!B || B.over) return;
  B.over = true;
  var S = B.G.S;
  var em = document.getElementById('blOverEm'), tx = document.getElementById('blOverTx'),
      amt = document.getElementById('blOverAmt'), ov = document.getElementById('blOver');
  var reasons = {
    EIGHT_LEGAL: T('bl.reasonLegal'), EIGHT_EARLY: T('bl.reasonEarly'),
    EIGHT_ON_FOUL: T('bl.reasonFoul'), RESIGN: T('dama.resignBtn'),
    BLACK_LEGAL: T('bl.reasonBlackLegal'), BLACK_EARLY: T('bl.reasonBlackEarly'),
    BLACK_ON_FOUL: T('bl.reasonBlackFoul'), POINTS: T('bl.reasonPoints'), TARGET: T('bl.reasonTarget'),
    GV_WIN: T('bl.reasonGvWin'), GV_WIN_BREAK: T('bl.reasonGvWinBreak'), GV_SUICIDE_EARLY: T('bl.reasonGvEarly'),
    GV_SUICIDE_CUEBLACK: T('bl.reasonGvCue'), GV_SUICIDE_TOUCH: T('bl.reasonGvTouch'),
    GV_SUICIDE_POCKET: T('bl.reasonGvPocket'), GV_SUICIDE_BOUND: T('bl.reasonGvBound'),
    GV_SUICIDE_NORAIL: T('bl.reasonGvNoRail')
  };
  var snScore = (B.variant === 'snooker' && S.scores) ? ' (' + S.scores[0] + ' – ' + S.scores[1] + ')' : '';
  var reasonTxt = reasons[S.endReason] || '';
  var iWon = (B.mode === 'local') ? null : (S.winner === B.mySeat);

  if (em) em.textContent = '🏆';
  if (tx) {
    if (B.mode === 'local') tx.textContent = T('bl.winnerIs') + ' ' + (S.winner === 0 ? T('bl.player1') : T('bl.player2')) + snScore + (reasonTxt ? ' — ' + reasonTxt : '');
    else tx.textContent = (iWon ? T('dama.win') : T('dama.lose')) + snScore + (reasonTxt ? ' — ' + reasonTxt : '');
  }
  if (amt) {
    if (B.mode === 'room' && B.bet > 0 && !B.isSpectator) {
      if (iWon) {
        var payout = B.bet * 2;
        if (typeof giveWin === 'function') giveWin(payout);
        if (typeof gres === 'function') gres(T('dama.win') + ' +' + payout + ' 🪙', payout, true);
        if (typeof winFX === 'function') winFX(payout);
        /* [BotsLedger v2.28] غرفة بوت: دلتا المنصة */
        if (B.oppBot && !B.isSpectator && typeof window !== 'undefined' && window.BotsLedger) {
          try { window.BotsLedger.record(window._currentGameId || 'bl8', B.bet - payout); } catch (e) {}
        }
        amt.innerHTML = '+' + payout + ' 🪙';
      } else {
        if (typeof gres === 'function') gres(T('dama.lose') + ' — ' + T('ts.lose'), 0, true);
        if (B.oppBot && !B.isSpectator && typeof window !== 'undefined' && window.BotsLedger) {
          try { window.BotsLedger.record(window._currentGameId || 'bl8', B.bet); } catch (e) {}
        }
        amt.textContent = '−' + B.bet + ' 🪙';
      }
    } else amt.textContent = reasonTxt || '';
  }
  if (ov) ov.hidden = false;
  if (typeof SND !== 'undefined' && SND.chessEnd) { try { SND.chessEnd(); } catch (e) {} }
  if (B.mode === 'room') blSendRoom({ t: 'end', winner: S.winner, reason: S.endReason });
}

/* ═══════════ HUD ═══════════ */
function blUpdateHud() {
  var B = BILLIARDS;
  if (!B || !B.G) return;
  var S = B.G.S;
  var p0 = document.getElementById('blPl0'), p1 = document.getElementById('blPl1');
  if (p0) p0.classList.toggle('active', S.active === 0 && !S.frameOver);
  if (p1) p1.classList.toggle('active', S.active === 1 && !S.frameOver);
  var a0 = document.getElementById('blAv0'), a1 = document.getElementById('blAv1');
  if (a0) a0.classList.toggle('active', S.active === 0 && !S.frameOver);
  if (a1) a1.classList.toggle('active', S.active === 1 && !S.frameOver);

  var isSn = (BILLIARDS.variant === 'snooker' || BILLIARDS.variant === 'carom');
  var labels = { SOLID: T('bl.groupSolid'), STRIPE: T('bl.groupStripe'), EIGHT: T('bl.groupEight'),
    RED: T('bl.groupRed'), YELLOW: T('bl.groupYellow'), BLACK: T('bl.groupBlack') };
  for (var i = 0; i < 2; i++) {
    var el = document.getElementById('blGrp' + i);
    if (!el) continue;
    if (isSn) {
      el.textContent = '🏆 ' + (S.scores ? S.scores[i] : 0);
      el.className = 'bl-grp g-score' + (S.active === i && !S.frameOver ? ' on' : '');
    } else {
      var g = S.groups[i];
      el.textContent = g ? (labels[g] || g) : (S.open ? T('bl.tableOpen') : '');
      el.className = 'bl-grp' + (g ? ' g-' + g.toLowerCase() : '');
    }
  }
  /* [v23] رسالة انتقال الدور أزيلت — كانت تحجب حفر الطاولة؛ الدور يُشار إليه
     بتوهج أفاتار اللاعب النشط، والمؤقت يُعرض بجانب شارة مجموعته */
  var tn = document.getElementById('blTurn');
  if (tn) tn.hidden = true;
  if (!S.frameOver && BILLIARDS.turnTimer && blHumanTurn() &&
      (S.phase === 'AIM' || S.phase === 'PLACE' || S.phase === 'RERACK') &&
      !BILLIARDS._aiAim && !BILLIARDS.aiPending) {
    var tl = Math.ceil(BILLIARDS.timerLeft || BILLIARDS.turnTimer);
    var gEl = document.getElementById('blGrp' + S.active);
    if (gEl) {
      gEl.textContent = (gEl.textContent ? gEl.textContent + ' · ' : '') + '⏱' + tl;
      gEl.classList.toggle('bl-time-low', tl <= 10);
    }
  }
  blSyncNoms();
  blCellRender();
  var sh = document.getElementById('blShoot');
  if (sh) sh.disabled = !(blHumanTurn() && S.phase === 'AIM' && !S.frameOver && S.balls[0].status === 'ON_TABLE');
}

/* ── كاروم: نص الاختصاص والهدف ── */
function blCaromTurnText() {
  var S = BILLIARDS.G.S;
  var d = { FREE: T('bl.caFree'), ONE: T('bl.caOne'), THREE: T('bl.caThree') }[S.discipline] || S.discipline;
  return d + ' · ' + T('bl.caTarget') + ' ' + S.target;
}

/* ── سنوكر: نص الكرة القانونية ── */
function blSnColorName(nm) {
  var k = { RED: 'bl.cRed', YELLOW: 'bl.cYellow', GREEN: 'bl.cGreen', BROWN: 'bl.cBrown', BLUE: 'bl.cBlue', PINK: 'bl.cPink', BLACK: 'bl.cBlack' };
  return T(k[nm] || 'bl.cRed');
}
function blSnBallOnText() {
  var S = BILLIARDS.G.S;
  if (S.turnState === 'REDS') return T('bl.snOnReds');
  if (S.turnState === 'COLOUR') return S.nominated ? (T('bl.snOnNom') + ' ' + blSnColorName(S.nominated)) : T('bl.snNominatePrompt');
  var on = null;
  try { on = BILLIARDS.G.ballOnTypes(); } catch (e) {}
  return T('bl.snOnClear') + ' ' + (on && on[0] ? blSnColorName(on[0]) : '');
}

/* ── سنوكر: شريط الترشيح ── */
function blSyncNoms() {
  var B = BILLIARDS, bar = document.getElementById('blNoms');
  if (!bar) return;
  var G = B && B.G, S = G && G.S;
  var show = !!(G && B.variant === 'snooker' && S && S.turnState === 'COLOUR' && !S.nominated &&
    S.phase === 'AIM' && !S.frameOver && blHumanTurn());
  var key = show ? BL_SNORDER.join() : 'off';
  bar.hidden = !show;
  if (!show || bar._k === key) return;
  bar._k = key;
  bar.innerHTML = BL_SNORDER.filter(function (nm) {
    return S.balls.some(function (b) { return b.type !== 'RED' && b.type !== 'CUE' && b.group === nm && b.status === 'ON_TABLE'; });
  }).map(function (nm) {
    return '<button class="bl-nom" style="background:' + BL_SNCOLORS[nm] + '" onclick="billiardsNominate(\'' + nm + '\')">' + blSnColorName(nm) + '</button>';
  }).join('');
}

function billiardsGvChoose(g) {
  var B = BILLIARDS;
  if (!B || !B.G || typeof B.G.chooseGroup !== 'function') return;
  if (B.G.chooseGroup(g)) {
    if (B.mode === 'room') blSendRoom({ t: 'grp', g: g });
    blSay('🎯 ' + T('bl.gvChosen') + ' ' + (g === 'RED' ? T('bl.groupRed') : T('bl.groupYellow')));
    blUpdateHud();
    if (typeof SND !== 'undefined' && SND.click) { try { SND.click(); } catch (e) {} }
  }
}

function billiardsGvAnnounce(pk) {
  var B = BILLIARDS;
  if (!B || !B.G || typeof B.G.nominatePocket !== 'function') return;
  if (B.G.nominatePocket(pk)) {
    if (B.mode === 'room') blSendRoom({ t: 'annp', pk: pk });
    blSay('🎯 ' + T('bl.gvAnnounced') + ' ' + pk);
    blUpdateHud();
    if (typeof SND !== 'undefined' && SND.click) { try { SND.click(); } catch (e) {} }
  }
}

function billiardsNominate(nm) {
  var B = BILLIARDS;
  if (!B || !B.G) return;
  if (B.G.nominate(nm)) {
    if (B.mode === 'room') blSendRoom({ t: 'nom', n: nm });
    blSay('🎯 ' + T('bl.nominatedIs') + ' ' + blSnColorName(nm));
    blUpdateHud();
    if (typeof SND !== 'undefined' && SND.click) { try { SND.click(); } catch (e) {} }
  }
}

function blTray() {
  var B = BILLIARDS, box = document.getElementById('blTray');
  var lb = document.getElementById('blTrayL'), rb = document.getElementById('blTrayR');
  if (!B || !B.G || !box) return;
  box.innerHTML = '';
  if (lb) lb.innerHTML = '';
  if (rb) rb.innerHTML = '';
  if (!B.G.S.table.pockets.length || !B.G.S.pocketOrder.length) { box.style.display = 'none'; return; }  /* كاروم/قبل السقوط */
  box.style.display = 'none';   /* [UI-v4] الصينية الأفقية أُلغيت — الكرات في العمودين */
  var S = B.G.S;
  var BBC = { RED: '#d32f2f', YELLOW: '#f5c400', BLACK: '#111111' };
  var groups = B.G.S.groups || [];
  var all = B.G.S.pocketOrder.slice();               /* كل الكرات الساقطة */
  all.forEach(function (id, idx) {
    var cell = document.createElement('span');
    cell.className = 'bl-tcell' + (idx === all.length - 1 ? ' hot' : '');
    var isBB = (typeof id === 'string');
    var c, grp = null;
    if (isBB) {
      var tb = null;
      try { tb = B.G.byId(id); } catch (e) {}
      c = (tb && (BBC[tb.type] || BL_SNCOLORS[tb.group])) || '#888';
      grp = tb ? (BBC[tb.type] ? tb.type : tb.group) : null;
    } else {
      c = BL_COLORS[id] || '#888';
      grp = (id === 8) ? 'EIGHT' : (id < 8 ? 'SOLID' : 'STRIPE');
    }
    var d = document.createElement('span');
    d.className = 'bl-tb' + (!isBB && id > 8 ? ' stripe' : '');
    if (!isBB && id > 8) d.style.background = 'linear-gradient(180deg,#fff 18%,' + c + ' 18% 82%,#fff 82%)';
    else d.style.background = 'radial-gradient(circle at 35% 30%,' + blShade(c, .5) + ',' + c + ' 55%,' + blShade(c, -.45) + ')';
    if (!isBB) d.innerHTML = '<i>' + id + '</i>';
    cell.appendChild(d);
    /* [UI-v5] ملكية الكرة تثبت عند أول سقوط ولا تتغير عند بلوغ السوداء
       (تحول group اللاعب إلى BLACK كان ينقل كراته القديمة للصينية الأخرى) */
    var own = B._trayOwner || (B._trayOwner = {});
    if (own[id] === undefined) {
      if (grp && groups[1] === grp) own[id] = 1;
      else if (grp && groups[0] === grp) own[id] = 0;
      else own[id] = (S.pocketedBy && S.pocketedBy[id] !== undefined) ? S.pocketedBy[id] : 0;
    }
    var target = (own[id] === 1) ? (lb || box) : (rb || box);
    target.appendChild(cell);
  });
}

/* خلايا فوج كل لاعب في الشريط الجانبي (كرة ملونة = الفوج/اللون) */
/* [UI-v4] أفاتار كل لاعب: خلفيته = لون كراته، وداخله أول حرفين من اسم
   المستخدم. سنوكر/كاروم: النقاط في شارة صغيرة تحت الأفاتار. */
function blPlayerName(i) {
  var mySeat = (BILLIARDS && BILLIARDS.mySeat) || 0;
  if (BILLIARDS && BILLIARDS.mode === 'room' && typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.players) {
    var seats = Rooms.state.players.filter(function (p) { return !p.spectate; });
    var p = seats[i];
    if (p && p.username) return p.username;
  }
  if (i === mySeat && typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) return AUTH.user.username;
  if (BILLIARDS && BILLIARDS.mode === 'ai' && i !== mySeat) return T('bl.computer');
  return T(i === 0 ? 'bl.player1' : 'bl.player2');
}
function blCellRender() {
  var B = BILLIARDS;
  if (!B || !B.G) return;
  var S = B.G.S;
  var isSnCa = (B.variant === 'snooker' || B.variant === 'carom');
  for (var i = 0; i < 2; i++) {
    var av = document.getElementById('blAv' + i);
    var sc = document.getElementById('blScore' + i);
    if (!av) continue;
    /* حرفان من اسم المستخدم داخل الحلقة */
    var nm = String(blPlayerName(i) || '').trim();
    av.textContent = nm ? nm.slice(0, 2) : String(i + 1);
    av.title = nm;
    /* لون الأفاتار = لون كرات اللاعب */
    var g = S.groups ? S.groups[i] : null;
    var col = null;
    if (B.variant === 'eightball') col = (g === 'SOLID') ? '#f5c400' : (g === 'STRIPE') ? '#f2f2ea' : (g === 'EIGHT') ? '#181818' : null;
    else if (B.variant === 'blackball' || B.variant === 'golvazor') col = (g === 'RED') ? '#d32f2f' : (g === 'YELLOW') ? '#f5c400' : (g === 'BLACK') ? '#181818' : null;
    if (col) {
      av.style.background = 'radial-gradient(circle at 34% 30%,' + blShade(col, .5) + ',' + col + ' 62%,' + blShade(col, -.45) + ')';
      av.style.color = (col === '#f5c400' || col === '#f2f2ea') ? '#241500' : '#fff';
    } else { av.style.background = ''; av.style.color = ''; }
    /* سنوكر/كاروم: شارة نقاط تحت الأفاتار */
    if (sc) {
      if (isSnCa) { sc.hidden = false; sc.textContent = (S.scores && S.scores[i]) || 0; }
      else sc.hidden = true;
    }
  }
}

function blSay(t) {
  var el = document.getElementById('blMsg');
  if (!el) return;
  el.textContent = t;
  el.classList.add('show');
  if (BILLIARDS.msgT) clearTimeout(BILLIARDS.msgT);
  BILLIARDS.msgT = setTimeout(function () { el.classList.remove('show'); }, 2800);
}

/* ═══ v13: انزلاق الكرة في الحفرة (بصري بحت — الفيزياء والقواعد بلا تغيير) ═══ */
function blPocketCenter(t, id) {
  /* مراكز أقراص الحفر المرسومة (blDrawPockets) — لا مراكز القنص الفيزيائي
     v15: تتبع إزاحتي cc/cm المُحجّمتين (سنوكر −10%) */
  var W = t.W, H = t.H, ns = blNeckScale(t.id);
  var oc = 20 * ns, om = 28 * ns;
  switch (id) {
    case 'TL': return { x: -oc, y: -oc };
    case 'TR': return { x: W + oc, y: -oc };
    case 'BL': return { x: -oc, y: H + oc };
    case 'BR': return { x: W + oc, y: H + oc };
    case 'TC': return { x: W / 2, y: -om };
    case 'BC': return { x: W / 2, y: H + om };
  }
  return { x: -oc, y: -oc };
}
function blBallCol(b) {
  if (b.type === 'CUE' || b.group === 'WHITE') return null;   /* أبيض */
  return BL_SNCOLORS[b.group] || BL_BBCOLORS[b.type] || BL_COLORS[b.value] || '#c0392b';
}
function blTrackSinks() {
  var B = BILLIARDS;
  if (!B || !B.G) return;
  var rec = B.G.S.rec;
  if (!rec) { B._sinkRec = null; return; }
  if (B._sinkRec !== rec) { B._sinkRec = rec; B._sinkSeen = 0; }
  if (!B._sinks) B._sinks = [];
  while ((B._sinkSeen || 0) < rec.pocketed.length) {
    var pb = rec.pocketed[B._sinkSeen++];
    var pc = blPocketCenter(B.G.S.table, pb.pocket || null);
    B._sinks.push({
      x: pb.x, y: pb.y, tx: pc.x, ty: pc.y,
      col: blBallCol(pb), stripe: (pb.type === 'STRIPE'), value: pb.value,
      t0: performance.now()
    });
  }
}
function blDrawSinks(ctx, R) {
  var B = BILLIARDS;
  if (!B || !B._sinks || !B._sinks.length) return;
  var nowT = performance.now(), keep = [];
  for (var i = 0; i < B._sinks.length; i++) {
    var sk = B._sinks[i];
    var p = Math.min(1, (nowT - sk.t0) / 240);          /* ~ربع ثانية */
    if (p >= 1) continue;
    keep.push(sk);
    var e = p * p;                                       /* تسارع نحو الفوهة */
    var sx = sk.x + (sk.tx - sk.x) * p;
    var sy = sk.y + (sk.ty - sk.y) * p;
    var rr = R * (1 - 0.62 * e);                         /* تقلّص الغوص */
    if (!isFinite(rr) || rr <= 0.1) continue;            /* [SYNC-FIX] حارس: نصف قطر شاذ يكسر حلقة الرسم كلها */
    ctx.save();
    ctx.globalAlpha = 1 - 0.9 * e * e;                   /* تعتيم متأخر داخل الفوهة */
    var col = sk.col;
    ctx.beginPath(); ctx.arc(sx, sy, rr, 0, 7);
    if (!col || sk.stripe) {
      var g0 = ctx.createRadialGradient(sx - rr * 0.35, sy - rr * 0.4, rr * 0.1, sx, sy, rr);
      g0.addColorStop(0, '#ffffff'); g0.addColorStop(.8, '#dcdcd2'); g0.addColorStop(1, '#9a9a8e');
      ctx.fillStyle = g0;
    } else {
      var g1 = ctx.createRadialGradient(sx - rr * 0.35, sy - rr * 0.4, rr * 0.1, sx, sy, rr);
      g1.addColorStop(0, blShade(col, .5)); g1.addColorStop(.7, col); g1.addColorStop(1, blShade(col, -.5));
      ctx.fillStyle = g1;
    }
    ctx.fill();
    if (sk.stripe && col) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = col;
      ctx.fillRect(sx - rr, sy - rr * 0.45, 2 * rr, rr * 0.9);
      ctx.restore();
    }
    ctx.restore();
  }
  B._sinks = keep;
}

/* ═══════════ حلقة المحاكاة ═══════════ */
function blTick(now) {
  var B = BILLIARDS;
  if (!B) return;
  if (!B.raf) return;
  if (!B.lastT) B.lastT = now;
  var dtms = Math.min(50, now - B.lastT);
  B.lastT = now;
  var S = B.G ? B.G.S : null;
  if (S && S.phase === 'SHOT') {
    B.acc += dtms;
    var Hstep = 1000 / BilliardsPhysics.HZ;
    var guard = 0;
    while (B.acc >= Hstep && guard++ < 60) { B.G.stepPhysics(); B.acc -= Hstep; }
    blTrackSinks();   /* v13: التقاط الساقطات لتحريك انزلاقها في الفوهة */
    if (!B.G.shotRunning()) {
      B.acc = 0;
      var ev = B.G.resolve();
      if (ev && B.mode !== 'room') { /* blOnShotEvent يُستدعى عبر G.on */ }
      /* [BL-Anim] وصف وارد وصل أثناء الحركة → طبّقه الآن بالترتيب */
      if (B._pendQ && B._pendQ.length && B.G.S.phase !== 'SHOT' && !B.G.S.frameOver) {
        var nx = B._pendQ.shift();
        setTimeout(function () { blApplyIncoming(nx); }, 350);
      }
    }
  } else B.acc = 0;
  /* تحريك تصويب الآلي أمام اللاعب قبل تنفيذ الضربة */
  if (B._aiAim && B.G && B.G.S.phase === 'AIM') {
    var at = Math.min(1, (now - B._aiAim.t0) / B._aiAim.dur);
    var ae = at * at * (3 - 2 * at);
    var ad = B._aiAim.to - B._aiAim.from;
    while (ad > Math.PI) ad -= 2 * Math.PI;
    while (ad < -Math.PI) ad += 2 * Math.PI;
    B.aim = B._aiAim.from + ad * ae;
    B.power = B._aiAim.power;
    if (B._aiAim.spin) B.spin = B._aiAim.spin;
    if (at >= 1) {
      var pl = B._aiAim; B._aiAim = null; B.aim = pl.to;
      B.G.shoot(pl.to, pl.power, pl.spin);
      if (typeof SND !== 'undefined' && SND.peg) { try { SND.peg(); } catch (e2) {} }
    }
  }
  blMaybeAI();
  blTimerTick(now);
  /* [SYNC-FIX] استثناء في الرسم يجب ألا يقتل الحلقة — موتها = تجمد كامل وفقدان مزامنة */
  try { blDraw(); blUpdateHud(); } catch (e) { if (!B._drawErrOnce) { B._drawErrOnce = true; console.error('[bl] draw', e && e.message); } }
  B.raf = requestAnimationFrame(blTick);
}

/* ═══════════ [V19.5] مؤقت الدور — عند انتهائه تُنفَّذ حركة آلية عشوائية كي لا يتجمد اللعب ═══════════ */
function blTimerTick(now) {
  var B = BILLIARDS;
  if (!B || !B.G || B.over || !B.turnTimer) return;
  var S = B.G.S;
  var waiting = (S.phase === 'AIM' || S.phase === 'PLACE' || S.phase === 'RERACK') && !S.frameOver;
  var humanWait = waiting && blHumanTurn() && !B._aiAim && !B.aiPending;
  var key = S.active + ':' + S.phase + ':' + (S.history ? S.history.length : 0);
  if (key !== B._timerKey) { B._timerKey = key; B._timerT0 = now; }
  if (!humanWait) { B._timerT0 = now; B.timerLeft = B.turnTimer; return; }
  B.timerLeft = Math.max(0, B.turnTimer - (now - B._timerT0) / 1000);
  if (B.timerLeft <= 0) blAutoShot();
}

/* الحركة الآلية عند نفاد الوقت: وضع البيضاء إن لزم، اختيارات إجبارية (مجموعة/حفرة/لون)، ثم ضربة عشوائية */
function blAutoShot() {
  var B = BILLIARDS, G = B.G, S = G.S;
  B._timerKey = null;               /* إعادة تصفير المؤقت فور التنفيذ */
  B._timerT0 = performance.now();
  B.timerLeft = B.turnTimer;
  if (S.phase === 'RERACK') {
    if (B.mode === 'room') return;  /* الريراك الجماعي يُدار من صاحبه */
    billiardsChooseBreak(true);
    blSay('⏱ ' + T('bl.timeUpAuto'));
    return;
  }
  if (S.phase === 'PLACE') {
    var W = (S.table && S.table.w) || 1000, H = (S.table && S.table.h) || 500;
    for (var x = 60; x < W - 60; x += 25)
      for (var y = 40; y < H - 30; y += 25)
        if (G.validPlace(x, y)) { billiardsPlace(x, y); blSay('⏱ ' + T('bl.timeUpAuto')); return; }
    return;
  }
  if (S.phase !== 'AIM') return;
  /* الاختيارات الإجبارية قبل الضربة (تُبثّ للغرفة عبر الدوال القائمة) */
  if (B.variant === 'golvazor' && typeof G.needChoice === 'function' && G.needChoice())
    billiardsGvChoose(Math.random() < 0.5 ? 'RED' : 'YELLOW');
  if (B.variant === 'golvazor' && typeof G.needAnnounce === 'function' && G.needAnnounce() && S.table && S.table.pockets)
    billiardsGvAnnounce(S.table.pockets[Math.floor(Math.random() * S.table.pockets.length)].id);
  if (B.variant === 'snooker' && S.turnState === 'COLOUR' && !S.nominated) {
    var avail = BL_SNORDER.filter(function (nm) {
      return S.balls.some(function (b) { return b.type !== 'RED' && b.type !== 'CUE' && b.group === nm && b.status === 'ON_TABLE'; });
    });
    if (avail.length) billiardsNominate(avail[0]);
  }
  /* ضربة عشوائية: زاوية حرة وقوة متوسطة — تُنفَّذ وتُبثّ بنفس مسار الضربة اليدوية */
  B.aim = Math.random() * Math.PI * 2;
  var pw = document.getElementById('blPower');
  var p = 25 + Math.round(Math.random() * 55);
  if (pw) pw.value = p;
  B.power = p;
  B.spin = { x: 0, y: 0 };
  billiardsShoot();
  blSay('⏱ ' + T('bl.timeUpAuto'));
}

/* ═══════════ ذكاء الحاسوب ═══════════ */
function blMaybeAI() {
  var B = BILLIARDS;
  if (!B || !B.G || B.over) return;
  var S = B.G.S;
  if (S.frameOver) return;
  var isAI = (B.mode === 'ai' && S.active === 1) || (B.mode === 'room' && B.oppBot && S.active !== B.mySeat);
  if (!isAI) return;
  if (S.phase === 'RERACK') {
    if (!B.aiPending) {
      B.aiPending = true;
      setTimeout(function () {
        B.aiPending = false;
        if (!B.G || B.over) return;
        if (B.G.S.phase === 'RERACK') { B.G.chooseBreak(true); blSyncRerack(); blUpdateHud(); }
      }, 900);
    }
    return;
  }
  if ((S.phase === 'AIM' || S.phase === 'PLACE') && !B.aiPending && !B._aiAim) {
    B.aiPending = true;
    setTimeout(function () {
      B.aiPending = false;
      if (!B.G || B.over) return;
      var St = B.G.S;
      if (St.phase === 'PLACE') {
        var placed = false;
        for (var x = 60; x < 940 && !placed; x += 25)
          for (var y = 40; y < 470 && !placed; y += 25)
            if (B.G.validPlace(x, y)) placed = B.G.place(x, y);
        blUpdateHud();
      }
      if (B.G.S.phase === 'AIM') {
        /* الآلي يلعب مرئياً كالإنسان: تصويب متدرّج ثم ضربة حقيقية متحركة */
        var plan = (typeof B.G.aiPlan === 'function') ? B.G.aiPlan() : null;
        if (plan) {
          B._aiAim = { from: B.aim, to: plan.angle, power: plan.power, spin: plan.spin,
                       t0: performance.now(), dur: 1400 };
        } else {
          B.G.aiShot();
          if (typeof SND !== 'undefined' && SND.peg) { try { SND.peg(); } catch (e) {} }
        }
      }
    }, 850);
  }
}

/* ═══════════ الإدخال (تصويب باللمس/الفأرة) ═══════════ */
function blBindInput() {
  var B = BILLIARDS;
  if (!B) return;
  var cv = document.getElementById('blCv');
  if (!cv || B._bound) return;
  B._bound = true;
  B.cv = cv;
  B.ctx = cv.getContext('2d');

  function pos(e) {
    var r = cv.getBoundingClientRect();
    var src = (e.touches && e.touches[0]) ? e.touches[0] : e;
    return { px: src.clientX - r.left, py: src.clientY - r.top };
  }
  function toLogical(p) {
    var VT = B.VT;
    if (!VT) return { x: 0, y: 0 };
    /* الأمام: px = a·x + c·y + e ، py = b·x + d·y + f → العكس بمصفوفة [[a,c],[b,d]] */
    var det = VT.a * VT.d - VT.c * VT.b;
    if (!det) return { x: 0, y: 0 };
    var dx = p.px - VT.e, dy = p.py - VT.f;
    return { x: (VT.d * dx - VT.c * dy) / det, y: (-VT.b * dx + VT.a * dy) / det };
  }
  function down(e) {
    if (!B.G) return;
    var S = B.G.S;
    var p = toLogical(pos(e));
    if (S.phase === 'PLACE') {
      if (blHumanTurn()) { if (e.cancelable) e.preventDefault(); billiardsPlace(p.x, p.y); }
      return;
    }
    if (S.phase !== 'AIM' || !blHumanTurn()) return;
    /* سنوكر: التصريح باللون بالنقر عليه في مكانه داخل الطاولة (بلا أزرار خارجية) */
    if (B.variant === 'snooker' && S.turnState === 'COLOUR' && !S.nominated) {
      var hb = null;
      for (var bi = 0; bi < S.balls.length; bi++) {
        var bb = S.balls[bi];
        if (bb.status === 'ON_TABLE' && bb.type !== 'RED' && bb.type !== 'CUE' &&
            Math.hypot(p.x - bb.x, p.y - bb.y) <= S.table.R + 9) { hb = bb; break; }
      }
      if (hb) { if (e.cancelable) e.preventDefault(); billiardsNominate(hb.group); return; }
    }
    /* غولڤازور: اختيار اللون بعد كسر بلونين — نقر مباشر على كرة في الطاولة */
    if (B.variant === 'golvazor' && typeof B.G.needChoice === 'function' && B.G.needChoice()) {
      for (var ci = 0; ci < S.balls.length; ci++) {
        var cb = S.balls[ci];
        if (cb.status !== 'ON_TABLE' || (cb.type !== 'RED' && cb.type !== 'YELLOW')) continue;
        if (Math.hypot(p.x - cb.x, p.y - cb.y) <= S.table.R + 9) {
          if (e.cancelable) e.preventDefault();
          billiardsGvChoose(cb.type);
          return;
        }
      }
    }
    /* غولڤازور: إعلان حفرة الإنهاء بالنقر على الحفرة (أنونص) */
    if (B.variant === 'golvazor' && typeof B.G.needAnnounce === 'function' && B.G.needAnnounce()) {
      var pks = S.table.pockets;
      for (var pi = 0; pi < pks.length; pi++) {
        if (Math.hypot(p.x - pks[pi].x, p.y - pks[pi].y) <= pks[pi].r + 14) {
          if (e.cancelable) e.preventDefault();
          billiardsGvAnnounce(pks[pi].id);
          return;
        }
      }
    }
    if (e.cancelable) e.preventDefault();
    B.drawing = true;
    blAimTo(p);
  }
  function move(e) {
    if (!B.drawing || !B.G) return;
    if (e.cancelable) e.preventDefault();
    blAimTo(toLogical(pos(e)));
  }
  function up() { B.drawing = false; }

  cv.addEventListener('mousedown', down);
  cv.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  cv.addEventListener('touchstart', down, { passive: false });
  cv.addEventListener('touchmove', move, { passive: false });
  cv.addEventListener('touchend', up);

  /* قرص الدوران */
  var sp = document.getElementById('blSpin');
  if (sp) {
    var spinMove = function (e) {
      var r = sp.getBoundingClientRect();
      var src = (e.touches && e.touches[0]) ? e.touches[0] : e;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2 - 8;
      var dx = src.clientX - cx, dy = src.clientY - cy;
      var d = Math.hypot(dx, dy) || 1;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      B.spin = { x: dx / max, y: -dy / max };
      var dot = document.getElementById('blSpinDot');
      if (dot) { dot.style.left = (50 + dx / r.width * 100) + '%'; dot.style.top = (50 + dy / r.height * 100) + '%'; }
      if (e.cancelable) e.preventDefault();
    };
    sp.addEventListener('mousedown', function (e) { spinMove(e); sp._d = true; });
    sp.addEventListener('touchstart', spinMove, { passive: false });
    window.addEventListener('mousemove', function (e) { if (sp._d) spinMove(e); });
    window.addEventListener('mouseup', function () { sp._d = false; });
    sp.addEventListener('dblclick', blResetSpinUi);
  }

  /* سحب عصا التسديد */
  var cTrack = document.getElementById('blCueTrack');
  if (cTrack) {
    var cueMove = function (e) {
      var r = cTrack.getBoundingClientRect();
      var src = (e.touches && e.touches[0]) ? e.touches[0] : e;
      var land = document.getElementById('blFrame').classList.contains('bl-land');
      var val = 0;
      if (land) {
        /* Landscape: vertical track, tip faces UP. Pulling DOWN (higher Y) = more power */
        val = ((src.clientY - r.top) / r.height) * 100;
      } else {
        /* Portrait: horizontal track, tip faces RIGHT. Pulling LEFT (lower X) = more power */
        val = 100 - (((src.clientX - r.left) / r.width) * 100);
      }
      val = Math.max(1, Math.min(100, val));
      B.power = val;
      var lb = document.getElementById('blPowVal');
      if (lb) lb.textContent = Math.round(val);
      var stick = document.getElementById('blCueStick');
      if (stick) {
        if (land) { stick.style.bottom = (100 - val) + '%'; stick.style.left = ''; }
        else { stick.style.left = (100 - val) + '%'; stick.style.bottom = ''; }
      }
      if (e.cancelable) e.preventDefault();
    };
    cTrack.addEventListener('mousedown', function (e) { cueMove(e); cTrack._d = true; });
    cTrack.addEventListener('touchstart', function(e){ cueMove(e); cTrack._d = true; }, { passive: false });
    window.addEventListener('mousemove', function (e) { if (cTrack._d) cueMove(e); });
    window.addEventListener('touchmove', function (e) { if (cTrack._d) cueMove(e); }, { passive: false });
    var cueUp = function () {
      if (cTrack._d) {
        cTrack._d = false;
        billiardsShoot();
      }
    };
    window.addEventListener('mouseup', cueUp);
    window.addEventListener('touchend', cueUp);
  }

  /* إعادة القياس */
  var box = document.getElementById('blStageBox');
  if (box && typeof ResizeObserver !== 'undefined') {
    if (B.ro) { try { B.ro.disconnect(); } catch (e) {} }
    B.ro = new ResizeObserver(function () { blFitCanvas(); });
    B.ro.observe(box);
  }
  window.addEventListener('resize', blFitCanvas);
  window.addEventListener('orientationchange', blFitCanvas);
  window.addEventListener('fullscreenchange', blFitCanvas);
}

function blAimTo(p) {
  var B = BILLIARDS;
  if (!B || !B.G) return;
  var c = B.G.cue();
  if (!c) return;
  B.aim = Math.atan2(p.y - c.y, p.x - c.x);
}

/* ═══ [UI-v6] الاتجاه حسب الصورتين المرجعيتين ═══
   لاندسكيب: يسار = تدوير بالزاوية + أفاتار الخصم وكراته بخط عمودي مستقيم
   تحته + السبين أسفلاً؛ يمين = أفاتاري (بجوار زر الخروج) وكراتي بخط
   عمودي تحته + القوة + التنفيذ — كله على محور عمودي واحد.
   بورتريه: شريط علوي واحد مستقيم (تدوير أقصى يسار، أفاتار الخصم+كراته،
   ثم كراتي+أفاتاري، زر الخروج أقصى يمين) وشريط سفلي (سبين، قوة، تنفيذ). */
function blOrientLayout() {
  var B = BILLIARDS;
  if (!B) return;
  var frame = document.getElementById('blFrame');
  if (!frame) return;
  var land = frame.clientWidth > frame.clientHeight;
  if (B._blLand === land && frame._blOriented) return;
  B._blLand = land; frame._blOriented = true;
  frame.classList.toggle('bl-land', land);
  frame.classList.toggle('bl-port', !land);
  frame.style.gridTemplateColumns = '';
  frame.style.gridTemplateRows = '';
  frame._blColsT = frame._blRowsT = null;
  
  var g = function (id) { return document.getElementById(id); };
  var lr = g('blLRail'), rail = g('blRail'), ltop = g('blLTop');
  var av0 = g('blAv0'), trayR = g('blTrayR'), spin = g('blSpin'),
      pow = g('blCueTrack'), sc0 = g('blScore0'), rtop = g('blRTop'),
      trayL = g('blTrayL'), av1 = g('blAv1'), sc1 = g('blScore1');

  if (!g('blPortLeft')) {
    var pL = document.createElement('div'); pL.id = 'blPortLeft'; pL.className = 'bl-port-col bl-port-left';
    var pR = document.createElement('div'); pR.id = 'blPortRight'; pR.className = 'bl-port-col bl-port-right';
    if (lr) { lr.appendChild(pL); lr.appendChild(pR); }
  }
  var pL = g('blPortLeft'), pR = g('blPortRight');

  if (lr && rail && ltop && av0 && trayR && spin && pow && rtop) {
    if (land) {
      lr.appendChild(ltop);
      if (sc1) lr.appendChild(sc1);
      lr.appendChild(trayL);
      lr.appendChild(spin);
      
      rail.insertBefore(rtop, rail.firstChild);
      rtop.appendChild(av0);
      if (sc0) rail.insertBefore(sc0, trayR.parentNode === rail ? trayR : null);
      rail.insertBefore(trayR, pow);
    } else {
      /* Portrait: Opponent (Top) goes to Left column under rotate, Main (Bot) goes to Right column under minimize */
      if (pL && pR) {
        pL.appendChild(ltop);
        if (sc1) pL.appendChild(sc1);
        pL.appendChild(trayL);
        
        pR.appendChild(rtop);
        rtop.appendChild(av0);
        if (sc0) pR.appendChild(sc0);
        pR.appendChild(trayR);
      }
      rail.insertBefore(spin, rail.firstChild);
    }
  }
  blTray();
}

/* ═══════════ القياس والرسم ═══════════ */
function blFitCanvas() {
  var B = BILLIARDS;
  if (!B || !B.G) return;
  blOrientLayout();
  var cv = document.getElementById('blCv'), box = document.getElementById('blStageBox');
  if (!cv || !box) return;
  var r = box.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  B.cv = cv; B.ctx = cv.getContext('2d');
  var t = B.G.S.table, W = t.W, H = t.H;   /* أبعاد الخشب الفعلية: ±60 خارج خط اللعب */
  B.dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(r.width * B.dpr);
  cv.height = Math.round(r.height * B.dpr);
  var cw = r.width, ch = r.height, L = W + 120, S2 = H + 120;
  var portrait = cw < ch, s, ox, oy = ch / 2;
  if (!portrait) { s = Math.min(cw / L, ch / S2); ox = cw / 2; }
  else { s = Math.min(cw / S2, ch / L); ox = cw / 2; }
  /* الإلصاق: الضلع الأيسر والأسفل للطاولة (الإطار الخشبي ±60) يمسّان حافتي العلبة تماماً */
  var EDGE = 60;
  /* v12c: التصاق علوي دائم — وضع الصفحة يحاكي الشاشة الممتلئة تماماً:
     الطاولة تلتصق بأعلى العلبة (تحت الصينية مباشرة) وفائض الأسفل يُطلى خشباً */
  var topAnchor = true;
  /* [Orient] توسيط أفقي: فائض العرض يتوزع نصفين (خشب متناظر) بدل التصاق يسار
     يترك شريطاً خشبياً عريضاً في جهة واحدة — المحور الرأسي يبقى بالتصاق علوي (v12c) */
  var padX = Math.max(0, (cw - (portrait ? S2 : L) * s) / 2);
  /* [UI-v5 fix] زر التدوير في اللاندسكيب كان بلا أثر — flip يقلب المنظور 180° */
  if (!portrait && !B.flip) B.VT = { a: s, b: 0, c: 0, d: s, e: padX + EDGE * s, f: topAnchor ? EDGE * s : ch - s * (H + EDGE), portrait: false, s: s };
  else if (!portrait) B.VT = { a: -s, b: 0, c: 0, d: -s, e: padX + s * (W + EDGE), f: s * (H + EDGE), portrait: false, flip180: true, s: s };
  else if (!B.flip) B.VT = { a: 0, b: -s, c: s, d: 0, e: padX + EDGE * s, f: topAnchor ? s * (W + EDGE) : ch - s * EDGE, portrait: true, s: s };
  else B.VT = { a: 0, b: s, c: -s, d: 0, e: padX + s * (H + EDGE), f: topAnchor ? EDGE * s : ch - s * (H + EDGE), portrait: true, s: s };   /* مقلوب 180° */

  /* [UI-v4] أبعاد الأعمدة/الشرائط يحكمها CSS (bl-land/bl-port) — هنا فقط:
     امتصاص فائض العرض في اللاندسكيب كي تملأ الطاولة الوسط بلا letterbox،
     وامتصاص فائض عرض البورتريه في الحاويتين الأفقيتين تلقائياً (CSS). */
  var frame = cv.closest('.bl-frame');
  if (frame) {
    var F = frame.getBoundingClientRect();
    var AR = (W + 120) / (H + 120);
    var wantCols = '', wantRows = '';
    if (B._blLand) {
      /* عرض العمودين = نصف فائض العرض بعد منح الوسط عرضه الأمثل */
      var minSide = Math.max(64, Math.round(Math.min(F.width * 0.09, 110)));
      var midW = Math.min(F.width - minSide * 2, Math.round(F.height * AR));
      var sideW = Math.max(minSide, Math.floor((F.width - midW) / 2));
      wantCols = sideW + 'px minmax(0,1fr) ' + sideW + 'px';
      wantRows = 'minmax(0,1fr)';
      if (frame._blColsT !== wantCols || frame._blRowsT !== wantRows) {
        frame._blColsT = wantCols; frame._blRowsT = wantRows;
        frame.style.gridTemplateColumns = wantCols;
        frame.style.gridTemplateRows = wantRows;
        if (!frame._blRaf) { frame._blRaf = true; requestAnimationFrame(function () { frame._blRaf = false; blFitCanvas(); }); }
      }
    } else {
      /* [R8-FIX] تخطيط البورتريه الجديد صفّان فقط: الوسط (1fr) ثم الشريط السفلي (auto).
         القالب القديم كان 3 صفوف (barH/1fr/barH) يطابق الهيكل القديم — مع الهيكل
         الجديد (mid=row1, rail=row2, lrail=overlay) كان ينضغط الوسط إلى barH
         (~75px) ويلتهم الشريط السفلي كل المتبقي فتصغر الطاولة جذرياً */
      wantRows = 'minmax(0,1fr) auto';
      wantCols = 'minmax(0,1fr)';
      if (frame._blColsT !== wantCols || frame._blRowsT !== wantRows) {
        frame._blColsT = wantCols; frame._blRowsT = wantRows;
        frame.style.gridTemplateColumns = wantCols;
        frame.style.gridTemplateRows = wantRows;
        if (!frame._blRaf) { frame._blRaf = true; requestAnimationFrame(function () { frame._blRaf = false; blFitCanvas(); }); }
      }
    }
  }
}

/* أيقونة تصغير الشاشة: ملء الشاشة وإلغاؤه */
function billiardsToggleScreen() {
  try {
    if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
    else {
      var st = document.getElementById('billiardsStage');
      if (st && st.requestFullscreen) st.requestFullscreen();
    }
  } catch (e) {}
}

/* زر التدوير الذهبي: قلب منظور الطاولة 180° */
function billiardsFlipView() {
  var B = BILLIARDS;
  if (!B || !B.G) return;
  B.flip = !B.flip;
  blFitCanvas();
  blDraw();
}

function blDraw() {
  var B = BILLIARDS;
  if (!B || !B.G || !B.ctx) return;
  var ctx = B.ctx, S = B.G.S, t = S.table;
  var W = t.W, H = t.H, R = t.R;
  var dpr = B.dpr, VT = B.VT;
  if (!VT) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, B.cv.width / dpr, B.cv.height / dpr);
  /* أي فراغ letterbox حول الطاولة يُطلَى خشباً (امتداد الخزانة) — لا سواد */
  var bg = ctx.createLinearGradient(0, 0, 0, B.cv.height / dpr);
  bg.addColorStop(0, '#d9a566'); bg.addColorStop(.55, '#c08a4a'); bg.addColorStop(1, '#a9753a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, B.cv.width / dpr, B.cv.height / dpr);
  ctx.setTransform(dpr * VT.a, dpr * VT.b, dpr * VT.c, dpr * VT.d, dpr * VT.e, dpr * VT.f);

  var cloth = BL_CLOTHS[B.cloth] || BL_CLOTHS.green;
  var rail = BL_RAILS[B.rail] || BL_RAILS.wood;
  var bed = cloth[0], hasPk = !!t.pockets.length;

  /* 1. الإطار الخشبي: خارجي فاتح / داكن داخلي / خط فصل عند −25 (الخشب يظهر خلف ظهر الوسادة فقط) */
  ctx.fillStyle = rail[0];
  ctx.fillRect(-60, -60, W + 120, H + 120);
  ctx.fillStyle = rail[1];
  ctx.fillRect(-25, -25, W + 50, H + 50);
  ctx.strokeStyle = 'rgba(255,241,214,.38)'; ctx.lineWidth = 1;
  ctx.strokeRect(-25, -25, W + 50, H + 50);
  blDrawOrnate(ctx, W, H);

  /* 2. أرضية القماش تغطي حتى −3 */
  ctx.fillStyle = bed;
  ctx.fillRect(-3, -3, W + 6, H + 6);

  /* [Logo] اللوغو الرسمي بمنتصف قماش الطاولة — علامة مائية خفيفة تحت الكرات */
  if (!B._logoImg) {
    B._logoImg = new Image();
    B._logoImg.src = 'assets/dtsg/dtsg-logo-watermark.png';
    B._logoImg.onload = function () { try { blDraw(); } catch (e) {} };
  }
  if (B._logoImg.complete && B._logoImg.naturalWidth) {
    var lw = W * 0.34, lh = lw * B._logoImg.naturalHeight / B._logoImg.naturalWidth;
    if (lh > H * 0.62) { lh = H * 0.62; lw = lh * B._logoImg.naturalWidth / B._logoImg.naturalHeight; }
    ctx.save();
    ctx.globalAlpha = 0.16;
    /* في البورتريه المنظور مُدار — اللوغو يُرسم بدوران معاكس ليظهر معتدلاً للاعب */
    ctx.translate(W / 2, H / 2);
    if (VT.portrait) ctx.rotate(B.flip ? -Math.PI / 2 : Math.PI / 2);
    else if (VT.flip180) ctx.rotate(Math.PI);
    ctx.drawImage(B._logoImg, -lw / 2, -lh / 2, lw, lh);
    ctx.restore();
  }

  /* 3. الأعناق الستة بلون فراش الأرضية تماماً (بلا تدرج ولا خشب) */
  if (hasPk) blDrawNecks(ctx, W, H, bed, t.id === 'snooker' ? 0.75 : 1, blNeckScale(t.id));

  /* 4. الوسائد بلون القماش معتّم 30% بنهايات حادة */
  blDrawCushions(ctx, W, H, bed, hasPk, t.id === 'snooker' ? 0.75 : 1, blNeckScale(t.id));
  /* 5. أقراص الحفر فوق الوسائد */
  if (hasPk) blDrawPockets(ctx, t, W, H);
  /* علامات الطاولة */
  blDrawMarks(ctx, t, W, H);

  /* غولڤازور: إبراز الحفر عند طلب الإعلان + وسم الحفرة المعلنة/المطلوبة */
  if (B.variant === 'golvazor' && B.G) {
    var needA = (typeof B.G.needAnnounce === 'function') && B.G.needAnnounce() && blHumanTurn();
    var reqPk = null;
    if (S.finish === 'DERNIER' && S.groups && S.groups[S.active] === 'BLACK') reqPk = S.lastPocket[S.active];
    else if (S.annPocket && S.annPocket[S.active]) reqPk = S.annPocket[S.active];
    for (var gp = 0; gp < t.pockets.length; gp++) {
      var gpk = t.pockets[gp];
      if (needA) {
        ctx.beginPath(); ctx.arc(gpk.x, gpk.y, gpk.r + 6, 0, 7);
        ctx.strokeStyle = 'rgba(255,215,94,.85)'; ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      } else if (reqPk && gpk.id === reqPk) {
        ctx.beginPath(); ctx.arc(gpk.x, gpk.y, gpk.r + 6, 0, 7);
        ctx.strokeStyle = 'rgba(120,220,120,.9)'; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1;
      }
    }
  }
  /* دليل التصويب */
  if (B.aimGuide && S.phase === 'AIM' && (blHumanTurn() || B._aiAim)) blDrawAim(ctx, S, t, R);
  /* منطقة الوضع (كرة بيد) */
  if (S.phase === 'PLACE' && blHumanTurn()) blDrawPlaceZone(ctx, t, W, H);

  /* الكرات */
  for (var i = 0; i < S.balls.length; i++) {
    var b = S.balls[i];
    if (b.status !== 'ON_TABLE') continue;
    blDrawBall(ctx, b, R, S);
  }
  /* v13: الكرات المنزلقة داخل الفوهات (تحريك بصري قصير بعد القنص) */
  blDrawSinks(ctx, R);
  /* العصا */
  if (S.phase === 'AIM' && (blHumanTurn() || B._aiAim)) {
    var c = B.G.cue();
    if (c && c.status === 'ON_TABLE') blDrawCue(ctx, c, R, B.aim);
  }
}

function blDrawOrnate(ctx, W, H) {
  var m = 40, x, y;   /* منتصف الشريط الخشبي بين −20 و−60 */
  function dia(px, py) {
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4.2, -4.2, 8.4, 8.4); ctx.restore();
  }
  ctx.fillStyle = '#6B4A26';
  for (x = 36; x < W - 20; x += 72) { dia(x, -m); dia(x, H + m); }
  for (y = 36; y < H - 20; y += 72) { dia(-m, y); dia(W + m, y); }
  ctx.fillStyle = 'rgba(60,38,16,.55)';
  for (x = 72; x < W - 20; x += 72) {
    ctx.beginPath(); ctx.arc(x, -m, 1.8, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x, H + m, 1.8, 0, 7); ctx.fill();
  }
  for (y = 72; y < H - 20; y += 72) {
    ctx.beginPath(); ctx.arc(-m, y, 1.8, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(W + m, y, 1.8, 0, 7); ctx.fill();
  }
}

/* v15: معامل تحجيم هندسة الوسائد والأعناق — سنوكر −10% بطلب المستخدم
   (الوسائد أرفع والأعناق أقصر وأضيق نسبةً لكرات السنوكر الصغيرة R=7.65)
   بصري بحت: لا يمسّ الفيزياء ولا بقية الطاولات (ns=1) */
function blNeckScale(tid) { return tid === 'snooker' ? 0.9 : 1; }

function blJawTips(W, H, pk, ns) {
  ns = ns || 1;
  var g = { rc: 26 * pk, rm: 24 * pk, cc: 20 * ns, cm: 28 * ns,
            aC: Math.atan2(3, 26), aM: Math.atan2(18, -16) };
  g.cTop  = [ -g.cc + g.rc * Math.cos(g.aC), -g.cc + g.rc * Math.sin(g.aC) ];          /* فك الزاوية على الشريط العلوي */
  g.cLeft = [ -g.cc + g.rc * Math.sin(g.aC), -g.cc + g.rc * Math.cos(g.aC) ];          /* فك الزاوية على الشريط الأيسر */
  g.mL = [ W / 2 + g.rm * Math.cos(g.aM), -g.cm + g.rm * Math.sin(g.aM) ];             /* فك الوسط الأيسر */
  g.mR = [ W / 2 - g.rm * Math.cos(g.aM), -g.cm + g.rm * Math.sin(g.aM) ];             /* فك الوسط الأيمن */
  g.cTopB = [g.cTop[0], H - g.cTop[1]]; g.cLeftB = [g.cLeft[0], H - g.cLeft[1]];
  g.mLB = [g.mL[0], H - g.mL[1]]; g.mRB = [g.mR[0], H - g.mR[1]];
  return g;
}

/* الأعناق: بلون فراش الأرضية تماماً (بلا تدرّج/خشب/داكن) — تسدّ فم الجيب حتى مركز القرص */
function blDrawNecks(ctx, W, H, bed, pk, ns) {
  ns = ns || 1;
  var g = blJawTips(W, H, pk, ns);
  function poly(pts, mx, my) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var px = mx ? W - pts[i][0] : pts[i][0], py = my ? H - pts[i][1] : pts[i][1];
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }
  var corner = [[30 * ns, 0], g.cTop, [-g.cc, -g.cc], g.cLeft, [0, 30 * ns]];
  var mid = [[W / 2 - 26 * ns, 0], g.mL, [W / 2, -g.cm], g.mR, [W / 2 + 26 * ns, 0]];
  ctx.fillStyle = bed;
  poly(corner, false, false); poly(corner, true, false);
  poly(corner, false, true); poly(corner, true, true);
  poly(mid, false, false); poly(mid, false, true);
}

function blDrawCushions(ctx, W, H, cc, hasPk, pk, ns) {
  ns = ns || 1;
  var CT = 20 * ns;                      /* سماكة الوسادة البصرية (v15: −10% للسنوكر) */
  var jc = 28 * ns, jm = 26 * ns;        /* بدايتا فكّي الزاوية والوسط على حافة الفراش */
  ctx.fillStyle = blShade(cc, -0.30);   /* لون القماش معتّم 30% */
  var g = hasPk ? blJawTips(W, H, pk || 1, ns) : null;
  var segs = hasPk ? [
    /* كل وسادة تنتهي برأسين حادّين (فكّين) يمسّان محيطي قرصي الجيبين تماماً */
    [g.cTop, [jc, 0], [W / 2 - jm, 0], g.mL, [W / 2 - jm, -CT], [10, -CT]],
    [[W - g.cTop[0], g.cTop[1]], [W - jc, 0], [W / 2 + jm, 0], g.mR, [W / 2 + jm, -CT], [W - 10, -CT]],
    [g.cTopB, [jc, H], [W / 2 - jm, H], g.mLB, [W / 2 - jm, H + CT], [10, H + CT]],
    [[W - g.cTopB[0], g.cTopB[1]], [W - jc, H], [W / 2 + jm, H], g.mRB, [W / 2 + jm, H + CT], [W - 10, H + CT]],
    [g.cLeft, [0, jc], [0, H - jc], g.cLeftB, [-CT, H - 12], [-CT, 12]],
    [[W - g.cLeft[0], g.cLeft[1]], [W, jc], [W, H - jc], [W - g.cLeftB[0], g.cLeftB[1]], [W + CT, H - 12], [W + CT, 12]]
  ] : [   /* طاولة بلا جيوب (كاروم): وسائد متصلة بزوايا مشطوفة 45° */
    [[6, -17], [28, 0], [W - 28, 0], [W - 6, -17], [W - 10, -20], [10, -20]],
    [[6, H + 17], [28, H], [W - 28, H], [W - 6, H + 17], [W - 10, H + 20], [10, H + 20]],
    [[-17, 6], [0, 28], [0, H - 28], [-17, H - 6], [-20, H - 12], [-20, 12]],
    [[W + 17, 6], [W, 28], [W, H - 28], [W + 17, H - 6], [W + 20, H - 12], [W + 20, 12]],
    [[28, 0], [0, 28], [-17, 6], [-20, -20], [6, -17]],
    [[W - 28, 0], [W, 28], [W + 17, 6], [W + 20, -20], [W - 6, -17]],
    [[28, H], [0, H - 28], [-17, H - 6], [-20, H + 20], [6, H + 17]],
    [[W - 28, H], [W, H - 28], [W + 17, H - 6], [W + 20, H + 20], [W - 6, H + 17]]
  ];
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]);
    for (var k = 1; k < s.length; k++) ctx.lineTo(s[k][0], s[k][1]);
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(jc, 0.8); ctx.lineTo(W / 2 - jm, 0.8); ctx.moveTo(W / 2 + jm, 0.8); ctx.lineTo(W - jc, 0.8);
  ctx.moveTo(jc, H - 0.8); ctx.lineTo(W / 2 - jm, H - 0.8); ctx.moveTo(W / 2 + jm, H - 0.8); ctx.lineTo(W - jc, H - 0.8);
  ctx.moveTo(0.8, jc); ctx.lineTo(0.8, H - jc); ctx.moveTo(W - 0.8, jc); ctx.lineTo(W - 0.8, H - jc);
  ctx.stroke();
}

function blDrawPockets(ctx, t, W, H) {
  /* v11: الأقراص فوق الوسائد ومحيطها يمرّ تماماً من رؤوس الأفكاك (نصف القطر نفسه المستخدم للأفكاك)
     v15: مراكز الأقراص تتبع cc/cm المُحجّمة (سنوكر −10%) فتبقى ملامسة لرؤوس الأفكاك */
  var pk = t.id === 'snooker' ? 0.75 : 1;
  var ns = blNeckScale(t.id);
  var oc = 20 * ns, om = 28 * ns;        /* إزاحتا مركزي قرص الزاوية والوسط */
  var rc = 26 * pk, rm = 24 * pk;
  function grad(cx, cy, r) {
    var g = ctx.createRadialGradient(cx, cy, 3, cx, cy, r);
    g.addColorStop(0, '#000'); g.addColorStop(.7, '#160404'); g.addColorStop(1, '#2b0a0a');
    return g;
  }
  var corners = [[-oc, -oc], [W + oc, -oc], [-oc, H + oc], [W + oc, H + oc]];
  for (var i = 0; i < corners.length; i++) {
    var cx = corners[i][0], cy = corners[i][1];
    ctx.beginPath(); ctx.arc(cx, cy, rc, 0, 7);
    ctx.fillStyle = grad(cx, cy, rc); ctx.fill();
  }
  var half = Math.sqrt(rm * rm - (0.75 * rm) * (0.75 * rm));   /* نصف وتر القص الخارجي */
  for (var sgn = -1; sgn <= 1; sgn += 2) {
    var mx = W / 2, my = (sgn < 0) ? -om : H + om, chord = (sgn < 0) ? -(om + 0.75 * rm) : H + om + 0.75 * rm;
    ctx.save();
    ctx.beginPath();
    if (sgn < 0) ctx.rect(mx - (rm + 8), chord, 2 * (rm + 8), rm + 12);
    else ctx.rect(mx - (rm + 8), chord - (rm + 12), 2 * (rm + 8), rm + 12);
    ctx.clip();
    ctx.beginPath(); ctx.arc(mx, my, rm, 0, 7);
    ctx.fillStyle = grad(mx, my, rm); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(mx - half, chord); ctx.lineTo(mx + half, chord); ctx.stroke();
  }
}

function blDrawMarks(ctx, t, W, H) {
  ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.lineWidth = 1;
  if (t.headStringX) {
    ctx.beginPath(); ctx.moveTo(t.headStringX, 0); ctx.lineTo(t.headStringX, H); ctx.stroke();
  }
  if (t.baulkD) {
    ctx.beginPath(); ctx.arc(t.baulkD.cx, t.baulkD.cy, t.baulkD.r, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(t.baulkLineX || t.baulkD.cx, 0); ctx.lineTo(t.baulkLineX || t.baulkD.cx, H); ctx.stroke();
  }
  if (t.footSpot) {
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.beginPath(); ctx.arc(t.footSpot.x, t.footSpot.y, 2.5, 0, 7); ctx.fill();
  }
  if (t.spots) {
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    for (var k in t.spots) {
      ctx.beginPath(); ctx.arc(t.spots[k].x, t.spots[k].y, 2.5, 0, 7); ctx.fill();
    }
  }
}

function blDrawPlaceZone(ctx, t, W, H) {
  var S = BILLIARDS.G.S;
  ctx.save();
  ctx.fillStyle = 'rgba(255,215,94,.10)';
  var x1 = W;
  if (S.placeRestriction === 'D' && t.baulkD) {
    ctx.beginPath();
    ctx.moveTo(t.baulkD.cx, t.baulkD.cy - t.baulkD.r);
    ctx.arc(t.baulkD.cx, t.baulkD.cy, t.baulkD.r, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }
  if (S.placeRestriction === 'BAULK' && t.baulkLineX) x1 = t.baulkLineX + t.R;   /* 4e/4j1 */
  else if (S.placeRestriction === 'HEAD' && t.headStringX) x1 = t.headStringX;
  else if (S.placeRestriction === 'GV_BAULK') x1 = t.baulkLineX - t.R;           /* غولڤازور: وراء الخط الأبيض حصراً */
  ctx.fillRect(0, 0, x1, H);
  ctx.restore();
}

/* هل الكرة المستهدفة كرة خصم (غير قانونية كتماس أول)؟ */
function blAimTargetIsOpp(ball) {
  var B = BILLIARDS;
  if (!ball || !B || !B.G) return false;
  var S = B.G.S;
  var v = B.variant;
  if (v === 'carom') return false;                       /* الكاروم: كل الكرات هدف */
  if (S.breakShot) return false;                         /* الكسر: أي كرة */
  if (v === 'snooker') {
    if (S.turnState === 'COLOUR' && !S.nominated) return (ball.type === 'RED');
    var onT = null;
    try { onT = B.G.ballOnTypes(); } catch (e) {}
    if (!onT) return false;
    var nm = (ball.type === 'RED') ? 'RED' : ball.group;
    return onT.indexOf(nm) === -1;
  }
  /* 8بول / بلاكبول / غولڤازور */
  if (S.open) return (v !== 'eightball' && ball.type === 'BLACK') ||
                     (v === 'eightball' && ball.type === 'EIGHT');
  var g = S.groups ? S.groups[S.active] : null;
  if (!g) return false;
  if (g === 'BLACK') {
    if (ball.type === 'BLACK') return false;
    /* غولڤازور: الضربة الحرة من الجزاء تسمح بألوان الخصم */
    if (v === 'golvazor' && S.penaltyFree && S.penaltyFree[S.active] &&
        (ball.type === 'RED' || ball.type === 'YELLOW')) return false;
    return true;
  }
  if (g === 'EIGHT') return ball.type !== 'EIGHT';
  var isMine = (ball.type === g);
  if (isMine) return false;
  /* غولڤازور: أول ضربة من الجزاء يجوز فيها لمس ألوان الخصم (لا السوداء) */
  if (v === 'golvazor' && S.penaltyFree && S.penaltyFree[S.active] &&
      (ball.type === 'RED' || ball.type === 'YELLOW')) return false;
  return true;
}

function blDrawAim(ctx, S, t, R) {
  var B = BILLIARDS;
  var c = B.G.cue();
  if (!c) return;
  var hit = BilliardsPhysics.castAim(t, S.balls, c.x, c.y, B.aim, 1600);
  var oppAim = false;
  if (hit.kind === 'ball') {
    var tb = null;
    try { tb = B.G.byId(hit.id); } catch (e) {}
    oppAim = blAimTargetIsOpp(tb);
  }
  /* أحمر عند التوجيه لكرة الخصم، أبيض في الحالات القانونية */
  var lineCol = oppAim ? 'rgba(229,57,53,.85)' : 'rgba(255,255,255,.55)';
  var ringCol = oppAim ? 'rgba(229,57,53,.95)' : 'rgba(255,255,255,.7)';
  ctx.save();
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(hit.x, hit.y); ctx.stroke();
  ctx.setLineDash([]);
  if (hit.kind === 'ball') {
    ctx.beginPath(); ctx.arc(hit.x, hit.y, R, 0, 7);
    ctx.strokeStyle = ringCol; ctx.stroke();
  }
  ctx.restore();
}

function blDrawCue(ctx, cue, R, ang) {
  var L = 290, off = R + 7;
  var dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  var tx = cue.x - dx * off, ty = cue.y - dy * off;
  var bx = cue.x - dx * (off + L), by = cue.y - dy * (off + L);
  var wT = 2.4, wB = 6;
  var grd = ctx.createLinearGradient(tx, ty, bx, by);
  grd.addColorStop(0, '#e8d7b0'); grd.addColorStop(.25, '#c9a25f');
  grd.addColorStop(.7, '#8a5a2e'); grd.addColorStop(1, '#3a2312');
  ctx.beginPath();
  ctx.moveTo(tx + px * wT, ty + py * wT); ctx.lineTo(bx + px * wB, by + py * wB);
  ctx.lineTo(bx - px * wB, by - py * wB); ctx.lineTo(tx - px * wT, ty - py * wT);
  ctx.closePath(); ctx.fillStyle = grd; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = .8; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx + px * wT, ty + py * wT); ctx.lineTo(tx - dx * 7 + px * wT, ty - dy * 7 + py * wT);
  ctx.lineTo(tx - dx * 7 - px * wT, ty - dy * 7 - py * wT); ctx.lineTo(tx - px * wT, ty - py * wT);
  ctx.closePath(); ctx.fillStyle = '#f4f2ea'; ctx.fill();
  ctx.beginPath(); ctx.arc(tx + dx * 1.2, ty + dy * 1.2, 2.4, 0, 7); ctx.fillStyle = '#2a6bd4'; ctx.fill();
}

function blDrawBall(ctx, b, R, S) {
  /* بلاكبول: البيضاء 47.6مم مقابل 50.8مم لكرات الهدف (رسمياً) */
  if (b.type === 'CUE' && S && S.table && S.table.cueScale) R = R * S.table.cueScale;
  var x = b.x, y = b.y;
  if (!isFinite(x) || !isFinite(y) || !isFinite(R) || R <= 0) return;   /* [SYNC-FIX] كرة بموضع شاذ تكسر الرسم كله */
  ctx.beginPath(); ctx.ellipse(x + R * 0.16, y + R * 0.24, R * 1.02, R * 0.9, 0, 0, 7);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
  var col = (b.type === 'CUE' || b.group === 'WHITE') ? null : (BL_SNCOLORS[b.group] || BL_BBCOLORS[b.type] || BL_COLORS[b.value] || '#c0392b');
  var g = ctx.createRadialGradient(x - R * 0.38, y - R * 0.44, R * 0.12, x, y, R * 1.02);
  if (!col || b.type === 'STRIPE') {
    g.addColorStop(0, '#ffffff'); g.addColorStop(.45, '#f6f6f0');
    g.addColorStop(.8, '#dcdcd2'); g.addColorStop(1, '#9a9a8e');
  } else {
    g.addColorStop(0, blShade(col, .62)); g.addColorStop(.42, blShade(col, .18));
    g.addColorStop(.78, col); g.addColorStop(1, blShade(col, -.55));
  }
  ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.save(); ctx.beginPath(); ctx.arc(x, y, R * 0.985, 0, 7); ctx.clip();
  ctx.translate(x, y); ctx.rotate(Math.atan2(b.dy || 1, b.dx || 0));
  var th = b.phase || 0, cs = Math.cos(th), sN = Math.sin(th);
  if (b.type === 'STRIPE') {
    var off = sN * R * 0.35, hw = R * 0.62;
    var bg = ctx.createLinearGradient(off - hw, 0, off + hw, 0);
    bg.addColorStop(0, blShade(col, -.38)); bg.addColorStop(.5, blShade(col, .12)); bg.addColorStop(1, blShade(col, -.38));
    ctx.fillStyle = bg; ctx.fillRect(off - hw, -R, hw * 2, 2 * R);
  }
  if (b.type === 'CUE') {
    for (var o = 0; o < 3; o += 2.4) {
      var cc = Math.cos(th + o);
      if (cc > 0.25) {
        ctx.beginPath();
        ctx.ellipse(R * Math.sin(th + o) * 0.9, 0, R * 0.14 * cc, R * 0.14, 0, 0, 7);
        ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fill();
      }
    }
  } else if (cs > 0.15 && !BL_BBCOLORS[b.type] && b.type !== 'COLOUR' && b.type !== 'OBJECT') {
    var rB = R * 0.45, sc = 0.55 + 0.45 * cs, bx = R * sN * 0.98;
    ctx.beginPath();
    ctx.ellipse(bx, 0, Math.max(rB * 0.22, rB * cs), rB * (0.7 + 0.3 * cs), 0, 0, 7);
    var bg2 = ctx.createRadialGradient(bx - 2, -2, 1, bx, 0, rB);
    bg2.addColorStop(0, '#fff'); bg2.addColorStop(1, '#d6d6ce');
    ctx.fillStyle = bg2; ctx.fill();
    ctx.save(); ctx.translate(bx, 0); ctx.scale(Math.max(0.25, cs), 1);
    ctx.fillStyle = '#111';
    ctx.font = 'bold ' + Math.max(6, Math.round(R * 0.6 * sc)) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.value, 0, 0.5);
    ctx.restore();
  }
  ctx.restore();

  ctx.beginPath(); ctx.ellipse(x - R * 0.4, y - R * 0.46, R * 0.32, R * 0.2, -0.6, 0, 7);
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
  /* (أزيلت الهالة المحيطة بالكرات بطلب المستخدم — لا حلقات حول الكرات) */
}

/* ═══════════ أونلاين (المرحلة 6) ═══════════ */
function blSendRoom(payload) {
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.sendMove !== 'function') return;
  payload.by = blMeId();
  payload.action = payload.t || 'shot';   /* [مرونة] الخادم يسجّل في moveHistory فقط إن وُجد payload.action */
  try { Rooms.sendMove('rmove', payload, { game_id: window._currentGameId || 'bl8', status: 'playing' }); } catch (e) {}
}

function blRoomMove(d) {
  if (!BILLIARDS || !d) return;
  if (d.action === 'rmove' && d.data) d = d.data;
  if (d.by != null && String(d.by) === String(blMeId())) return;   /* صدى الذات */
  if (d.t === 'cfg') {
    /* صاحب الغرفة يبثّ إعدادات الكاروم/الغولڤازور قبل أول ضربة */
    BILLIARDS.caromDisc = d.d || BILLIARDS.caromDisc;
    BILLIARDS.caromTarget = d.g || BILLIARDS.caromTarget;
    if (d.f) BILLIARDS.gvFinish = d.f;
    if (d.b) BILLIARDS.gvBound = d.b;
    if (d.tm) BILLIARDS.turnTimer = Math.max(30, Math.min(300, d.tm | 0));   /* [V19.5] مزامنة المؤقت */
    if (BILLIARDS.mode === 'room' && (BILLIARDS.variant === 'carom' || BILLIARDS.variant === 'golvazor') &&
        BILLIARDS.G && BILLIARDS.G.S.history.length === 0) billiardsStart('room');
    return;
  }
  if (!BILLIARDS.G) return;
  if (d.t === 'end') {
    if (BILLIARDS.over) return;
    BILLIARDS.G.S.frameOver = true;
    BILLIARDS.G.S.winner = d.winner;
    BILLIARDS.G.S.endReason = d.reason || 'RESIGN';
    BILLIARDS.G.S.phase = 'END';
    blEndFrame();
    return;
  }
  /* [BL-Anim] ضربة جارية على اللوحة → صفّ الوارد حتى تستقر (يُصرف في blTick) */
  if (BILLIARDS.G.S.phase === 'SHOT') {
    BILLIARDS._pendQ = BILLIARDS._pendQ || [];
    BILLIARDS._pendQ.push(d);
    return;
  }
  blApplyIncoming(d);
}
/* [BL-Anim] تطبيق وصف وارد: الوضع place فوري، والضربة تُعرض متحركة كما عند الرامي.
   [SYNC-FIX] صفحة مخفية (هاتف بالخلفية): rAF متوقف — أنيميشن SHOT لن يُحسم أبداً
   فتتجمد اللعبة؛ يُحسم فوراً بنفس الحتمية (shootAndResolve) بلا عرض */
function blApplyIncoming(d) {
  if (!BILLIARDS || !BILLIARDS.G || !d) return;
  var hidden = (typeof document !== 'undefined' && document.hidden);
  if (d.t === 'place') { BILLIARDS.G.applyPayload(d); }
  else if (d.t === 'shot') {
    if (hidden) BILLIARDS.G.applyPayload(d);          /* حسم فوري حتمي */
    else BILLIARDS.G.shoot(d.a, d.p, d.s);            /* عرض متحرك */
  }
  else { BILLIARDS.G.applyPayload(d); }
  blUpdateHud(); blTray();
}
/* [SYNC-FIX] العودة من الخلفية: حسم الضربة العالقة وصرف الطابور المتكدس فوراً */
if (typeof document !== 'undefined' && !window.__blVisBound) {
  window.__blVisBound = true;
  document.addEventListener('visibilitychange', function () {
    var B = BILLIARDS;
    if (!B || !B.G || document.hidden) return;
    try {
      var guard = 0;
      if (B.G.S.phase === 'SHOT') {
        while (B.G.shotRunning() && guard++ < 60000) B.G.stepPhysics();
        B.G.resolve();
        B.acc = 0;
      }
      while (B._pendQ && B._pendQ.length && B.G.S.phase !== 'SHOT' && !B.G.S.frameOver) {
        blApplyIncoming(B._pendQ.shift());
        guard = 0;
        while (B.G.shotRunning() && guard++ < 60000) B.G.stepPhysics();
        if (B.G.S.phase === 'SHOT') B.G.resolve();
      }
      blUpdateHud(); blTray(); blDraw();
    } catch (e) {}
  });
}

function blMeId() {
  if (typeof AUTH !== 'undefined' && AUTH.user) return AUTH.user.id;
  if (typeof ST !== 'undefined' && ST.user) return ST.user.id;
  return null;
}

/* بدء الغرفة: المقاعد والرهان والتفرّج (نمط chessRoomStart) */
function blRoomStart(room) {
  if (!room || !BILLIARDS) return;
  if (!/^bl/.test(String(room.game_id || ''))) return;
  if (room.status !== 'playing') return;
  var order = (room.order && room.order.length) ? room.order.slice() : [];
  if (!order.length) return;
  var meId = blMeId(), mySeat = -1, i;
  for (i = 0; i < order.length; i++) if (String(order[i]) === String(meId)) mySeat = i;
  var spec = (mySeat === -1);
  var oppBot = false, bet = 0;
  try {
    if (room.players) {
      for (var j = 0; j < room.players.length; j++) {
        var pl = room.players[j];
        if (pl.spectate || String(pl.id) === String(meId)) continue;
        oppBot = !!pl.isBot;
        break;
      }
    }
  } catch (e) {}
  try { bet = parseInt(room.bet, 10) || 0; } catch (e) {}
  BILLIARDS.mySeat = spec ? 0 : mySeat;
  BILLIARDS.oppBot = !!oppBot;
  BILLIARDS.isSpectator = spec;
  BILLIARDS.bet = spec ? 0 : bet;
  /* [Persist] عائد لجولة جارية: لا خصم رهان مكرر (خُصم قبل الانقطاع) */
  var _rejoin = (typeof Rooms !== 'undefined' && Rooms && Rooms._rejoinLive);
  if (_rejoin && typeof Rooms !== 'undefined') Rooms._rejoinLive = false;
  if (!spec && bet > 0 && !_rejoin && typeof takeBet === 'function' && !takeBet(bet)) BILLIARDS.bet = 0;  /* رصيد غير كافٍ → ودية */
  billiardsStart('room');
  if (!spec && mySeat === 0 && BILLIARDS.variant === 'carom') {
    blSendRoom({ t: 'cfg', d: BILLIARDS.caromDisc, g: BILLIARDS.caromTarget, tm: BILLIARDS.turnTimer });
  } else if (!spec && mySeat === 0 && BILLIARDS.variant === 'golvazor') {
    blSendRoom({ t: 'cfg', f: BILLIARDS.gvFinish, b: BILLIARDS.gvBound, tm: BILLIARDS.turnTimer });
  } else if (!spec && mySeat === 0) {
    /* [V19.5] بث مؤقت الدور لبقية الأنواع أيضاً */
    blSendRoom({ t: 'cfg', tm: BILLIARDS.turnTimer });
  }
}

/* [مرونة] إعادة بناء الإطار للعائد من انقطاع: إعادة تشغيل وصفات الضربات حتمياً */
function blApplyReplay(d) {
  if (!BILLIARDS || !d || !d.history || !d.history.length) return;
  var room = (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state : null;
  if (!room || room.status !== 'playing' || !/^bl/.test(String(room.game_id || ''))) return;
  if (BILLIARDS.G && BILLIARDS.G.S.history.length >= d.history.length) return;  /* متزامن حيّاً */
  billiardsStart('room');
  for (var i = 0; i < d.history.length; i++) {
    var h = d.history[i];
    var pl = (h && h.data) ? h.data : h;
    if (!pl || !pl.t) continue;
    if (pl.t === 'cfg') {
      BILLIARDS.caromDisc = pl.d || BILLIARDS.caromDisc;
      BILLIARDS.caromTarget = pl.g || BILLIARDS.caromTarget;
      if (pl.f) BILLIARDS.gvFinish = pl.f;
      if (pl.b) BILLIARDS.gvBound = pl.b;
      if (pl.tm) BILLIARDS.turnTimer = Math.max(30, Math.min(300, pl.tm | 0));   /* [V19.5] */
      if (BILLIARDS.variant === 'carom' || BILLIARDS.variant === 'golvazor') billiardsStart('room');
      continue;
    }
    if (pl.t === 'end') {
      BILLIARDS.G.S.frameOver = true;
      BILLIARDS.G.S.winner = pl.winner;
      BILLIARDS.G.S.endReason = pl.reason || 'RESIGN';
      BILLIARDS.G.S.phase = 'END';
      continue;
    }
    BILLIARDS.G.applyPayload(pl);
  }
  BILLIARDS.over = !!BILLIARDS.G.S.frameOver;
  blUpdateHud(); blTray();
  if (BILLIARDS.over) blEndFrame();
}

function blRegisterRooms() {
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.setGameHandler !== 'function') return;
  Rooms.setGameHandler(blRoomMove);
  Rooms.setStartHandler(blRoomStart);
  if (typeof window !== 'undefined') window.applyRoomReplay = blApplyReplay;
  /* وصل room:replay قبل فتح اللعبة → استهلكه الآن */
  try {
    if (typeof Rooms.consumePendingReplay === 'function') {
      var pr = Rooms.consumePendingReplay();
      if (pr) blApplyReplay(pr);
      /* [Persist] غرفة بلياردو جارية بلا replay معلق → اطلبه من الخادم */
      else if (Rooms.state && /^bl/.test(String(Rooms.state.game_id || '')) && Rooms.state.status === 'playing' &&
               typeof Rooms.requestReplay === 'function') Rooms.requestReplay();
    }
  } catch (e) {}
}

/* [UI-v5] أزيل نظام الإيموجي الخاص — أيقونة التفاعلات العائمة للمنصة (roomReactBtn) هي الوحيدة في الغرف */

/* ═══════════ تنظيف عند مغادرة اللعبة ═══════════ */
function cleanupBilliards() {
  if (!BILLIARDS) return;
  if (BILLIARDS.raf) { cancelAnimationFrame(BILLIARDS.raf); BILLIARDS.raf = 0; }
  if (BILLIARDS.ro) { try { BILLIARDS.ro.disconnect(); } catch (e) {} BILLIARDS.ro = null; }
  if (BILLIARDS.msgT) clearTimeout(BILLIARDS.msgT);
  BILLIARDS._bound = false;
  BILLIARDS.G = null;
}

window.eBilliards = eBilliards;
window.initBilliards = initBilliards;
window.cleanupBilliards = cleanupBilliards;
window.billiardsChooseBreak = billiardsChooseBreak;
window.billiardsStalemate = billiardsStalemate;
window.billiardsNominate = billiardsNominate;
window.billiardsSetDisc = billiardsSetDisc;
window.billiardsSetTarget = billiardsSetTarget;
window.billiardsSetGvFinish = billiardsSetGvFinish;
window.billiardsSetGvBound = billiardsSetGvBound;
window.billiardsSetTimer = billiardsSetTimer;
window.billiardsGvAnnounce = billiardsGvAnnounce;
window.billiardsGvChoose = billiardsGvChoose;
