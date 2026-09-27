/* ══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Game Engines
   Slots, Mines, Plinko, Dice, Wheel, Scratch,
   Wingo, RPS, Penalty, Lucky7, Sic Bo,
   Roulette, Baccarat, Dragon Tiger, Andar Bahar
   ══════════════════════════════════════════════════════════════════ */
"use strict";

// Access globals set by regular scripts (state.js, audio.js, catalog.js, main.js).
// ملاحظة: هذه الأسماء عامة (window) — الوصول إليها بالاسم المباشر ديناميكياً عند
// الاستدعاء يتجنب تعارض إعلانات top-level const بين السكربتات العادية المتعددة.
// لا تعرّف bindings محلية بأسماء عامة (SND/ST/GAME_IMG/...) هنا.

// ── Shared state ──
let GB = 10;

/* [DTSG-009 SEC] عشوائية آمنة تشفيرياً (CSPRNG) تمنع التلاعب عبر Math.random في المتصفح */
function _rng() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] / 4294967296;
  }
  return Math.random();
}

// ── Shared functions ──
function betRow() {
  /* [BetUI] حلقتان دائريتان − / + وخانة رقمية للإدخال اليدوي — بلا حاوية مستطيلة */
  return '<div class="bets bets-min">' +
    '<button class="bbtn" onclick="chB(-10)" aria-label="تقليل الرهان">−</button>' +
    '<span class="bet-field"><i class="fa-solid fa-coins" aria-hidden="true"></i>' +
      '<input type="number" inputmode="numeric" class="bet-input" id="GBd" value="' + GB + '" min="10"' +
      ' onfocus="this.select()" onchange="setBetInput(this)" aria-label="مبلغ الرهان"></span>' +
    '<button class="bbtn" onclick="chB(10)" aria-label="زيادة الرهان">+</button>' +
    '</div>';
}
/* [BetUI] GBd صار <input> — التحديث عبر value مع دعم أي عنصر نصي قديم */
function _setGBd(v) {
  const el = document.getElementById('GBd');
  if (!el) return;
  if ('value' in el && el.tagName === 'INPUT') el.value = v;
  else el.textContent = v;
}
/* [Decimal 2026-09-13] الرهان العام يقبل القيم العشرية (0.00) — بحد أدنى 0.01 */
function setBetInput(el) {
  const v = parseFloat(el.value);
  GB = Math.max(0.01, Math.round(Math.min(ST.gold || 100, isNaN(v) ? 10 : v) * 100) / 100);
  _setGBd(GB);
  SND.click();
}
function chB(d) {
  SND.click();
  GB = Math.max(0.01, Math.round(Math.min(ST.gold || 100, GB + d) * 100) / 100);
  _setGBd(GB);
}
function _training() { return !!(window.TRAINING && window.TRAINING.on); }
function take() {
  /* [Training 2026-09-16] الجولات التدريبية (بوت/وجه لوجه محلي) مجانية بلا خصم */
  if (_training()) return true;
  if (ST.gold < GB) {
    toast(T('ts.noc'), 'err');
    SND.lose();
    return false;
  }
  ST.gold -= GB;
  wallet();
  save();
  return true;
}
function give(w) {
  /* [Training 2026-09-16] لا تُضاف أرباح الجولات التدريبية للرصيد */
  if (_training()) return;
  ST.gold += w;
  wallet();
  save();
}
function gres(m, w, noRec, forceWin) {
  /* [BotsLedger v2.28] مؤشر المنصة: كل جولة محرك تُسجَّل تلقائياً —
     دلتا المنصة = الرهان − المدفوع (موجب = ربح منصة، سالب = دفع للفائز).
     الاسترداد الكامل (w==GB) يعطي صفراً فيتجاهله record(). */
  if (!noRec && typeof window !== 'undefined' && window.BotsLedger && window._currentGameId && typeof GB === 'number' && GB > 0) {
    try { window.BotsLedger.record(window._currentGameId, (w > 0 ? GB - w : GB)); } catch (e) {}
  }
  /* noRec=true: عرض فقط بلا تسجيل تذكرة (ملخصات جماعية مثلاً) */
  if (!noRec && (m !== '' || w > 0) && typeof recordRound === 'function') {
    recordRound(w > 0, (typeof w === 'number' && w > 0) ? w : 0, m);
  }
  const e = document.getElementById('GRes');
  if (e) {
    /* نص آمن: هروب HTML أولاً ثم استبدال رمز العملة بأيقونة FA */
    let html = String(m == null ? '' : m)
      .replace(/[<>&"']/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[ch]))
      .replace(/🪙/g, '<i class="fa-solid fa-coins" aria-hidden="true"></i>');
    e.innerHTML = html;
    e.className = 'res ' + ((w > 0 || forceWin) ? 'win' : 'lose');
    if (w > 0 && typeof burst === 'function') {
      const r = e.getBoundingClientRect();
      if (r.width) {
        burst(r.left + r.width / 2, r.top + r.height / 2, ['#F5C518', '#FFD93D', '#34D399'], 18, 4.5);
        if (typeof coinRain === 'function') coinRain(5);
      }
    }
  }
}
function gFrame(inner, g) {
  const R = RULES[g.id];
  const rulesContent = R ? (R[langIndex()] || R[0]).map((r, i) =>
    '<div class="rline"><b>' + (i + 1) + '.</b> ' + r + '</div>'
  ).join('') : '';
  /* [GFrame-BG] خلفية فقط للألعاب التي لديها background.webp فعلياً
     (chess/dama/billiards/rami بلا خلفية — منع طلبات 404) */
  const GAME_BG = { andar_bahar: 1, baccarat: 1, backgammon: 1, blackjack: 1, crabbin: 1, dice: 1, dominoes: 1, dragon: 1, fishing: 1, football: 1, gates: 1, lightning: 1, lottery: 1, 'lucky-7': 1, mahjong: 1, mines: 1, money: 1, olympus: 1, parchisi: 1, plinko: 1, 'rock-paper': 1, ronda: 1, rose: 1, roulette: 1, scratch: 1, 'sic-bo': 1, 'slot-spin': 1, 'sweet-bonanza': 1, wheel: 1, wingo: 1 };
  const gbg = (typeof GAME_IMG !== 'undefined' && GAME_IMG[g.id] && GAME_BG[GAME_IMG[g.id]])
    ? '<div class="gstage-bg" style="background-image:url(assets/games/' + GAME_IMG[g.id] + '/background.webp)"></div>'
    : '';
  return '<div class="stage">' + gbg +
    '<div class="glogo-wm" aria-hidden="true"></div>' +
    '<div class="gtop">' +
      '<span class="ctext">RTP <b style="color:var(--green2)">' + g.rtp + '%</b></span>' +
      '<button class="btn ghost small" onclick="toggleRules()" aria-label="القواعد"> ' + T('g.rules') + '</button>' +
    '</div>' +
    '<div class="rulesBox" id="rulesBox">' + rulesContent + '</div>' +
    inner +
    '<div class="res" id="GRes" aria-live="polite"></div>' +
    '</div>';
}
function toggleRules() {
  const b = document.getElementById('rulesBox');
  if (b) {
    b.classList.toggle('open');
    SND.click();
  }
}
function winFX(w, bigThresh) {
  if (w > 0) {
    const big = w >= (bigThresh || GB * 5);
    celebrate(big);
    if (big && typeof coinRain === 'function') coinRain(16);
  } else {
    SND.lose();
  }
}
function shake(el, intensity, duration) {
  if (!el) return;
  const start = performance.now();
  const originalTransform = el.style.transform;
  function doShake() {
    const elapsed = performance.now() - start;
    if (elapsed > duration) {
      el.style.transform = originalTransform;
      return;
    }
    const progress = elapsed / duration;
    const currentIntensity = intensity * (1 - progress);
    const x = (Math.random() - 0.5) * currentIntensity;
    const y = (Math.random() - 0.5) * currentIntensity;
    el.style.transform = originalTransform + ` translate(${x}px, ${y}px)`;
    requestAnimationFrame(doShake);
  }
  doShake();
}

/* ═══════════ 10. RPS ═══════════ */
/* حجر/ورقة/مقص — فوز ×1.95، تعادل = استرداد، خسارة = −GB
   RTP = (1.95 + 1 + 0) ÷ 3 = 98.3% — هامش كازينو 1.7%
   [v2.62 PRO] حلبة مبارزة احترافية: عد تنازلي 3-2-1 مع نبض البطاقتين،
   كشف بقلب 3D، صوت مميز لكل حركة (حجر/ورقة/مقص)، فانفار فوز،
   عدّاد نتيجة الجلسة، وميض نتيجة ملوّن — منطق الدفع والعشوائية كما هو. */
var rpRoom = null;
var rpsBusy = false;
var rpsLastPick = null;
var rpsMyScore = 0, rpsAiScore = 0;
const RPS_MOVES = ['✊', '✋', '✌️'];
const RPS_BEATS = { '✊': '✌️', '✋': '✊', '✌️': '✋' };
const RPS_KEYS = { '✊': 'rp.rock', '✋': 'rp.paper', '✌️': 'rp.scissors' };
/* [v2.62] صوت الحركة الغالبة — الصوت الذي يميّز الجولة */
const RPS_SND = { '✊': 'rockThud', '✋': 'paperSwish', '✌️': 'scissorsSnip' };
function rpsLabel(m) {
  return T(RPS_KEYS[m] || '');
}
function rpRoomReset() {
  rpRoom = { myPick: null, oppPick: null, round: 1, myWins: 0, oppWins: 0, waiting: false, oppName: '', oppPicked: false };
}
function rpsSetBusy(b) {
  rpsBusy = b;
  var btns = document.querySelectorAll('.rpsBtn');
  for (var i = 0; i < btns.length; i++) btns[i].disabled = b;
}
/* [v2.62] تحديث عدّاد نتيجة الجلسة (أنا / الحاسوب) */
function rpsSyncScore() {
  var my = document.getElementById('rpsMyScore');
  var ai = document.getElementById('rpsAiScore');
  if (my) my.textContent = String(rpsMyScore);
  if (ai) ai.textContent = String(rpsAiScore);
  var myWrap = document.getElementById('rpsMyScoreW');
  var aiWrap = document.getElementById('rpsAiScoreW');
  if (myWrap) myWrap.classList.toggle('lead', rpsMyScore > rpsAiScore);
  if (aiWrap) aiWrap.classList.toggle('lead', rpsAiScore > rpsMyScore);
}
/* [v2.62] كشف بطاقة بقلب 3D: المحتوى يُستبدل في منتصف الدوران */
function rpsRevealCard(cardEl, faceEl, emoji) {
  if (!cardEl || !faceEl) return;
  cardEl.classList.remove('reveal-pop');
  void cardEl.offsetWidth;
  faceEl.textContent = emoji;
  cardEl.classList.add('reveal-pop');
}
/* [v2.62] شارة العد التنازلي: 3 → 2 → 1 → ! */
function rpsCountBadge(txt) {
  var el = document.getElementById('rpsCount');
  if (!el) return;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.textContent = txt;
  el.classList.add('pop');
}
/* [v2.62] صوت الحركة الغالبة في الجولة */
function rpsMoveSound(move) {
  var fn = RPS_SND[move];
  if (fn && typeof SND !== 'undefined' && typeof SND[fn] === 'function') {
    try { SND[fn](); } catch (e) {}
  }
}
function eRps(g) {
  rpRoomReset();
  rpsBusy = false;
  rpsMyScore = 0;
  rpsAiScore = 0;
  if (typeof Rooms !== 'undefined') {
    Rooms.setGameHandler(rpRoomMove);
    Rooms.setStartHandler(function (room) {
      rpRoomReset();
      if (room && room.players) {
        var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
        var opp = room.players.find(function (p) { return p.id !== (me && me.id); });
        rpRoom.oppName = opp ? opp.username : '';
      }
      rpsRoomUi();
    });
  }
  return gFrame(
    '<div class="rps-hint">' + T('rp.hint') + '</div>' +
    '<div class="rps-arena">' +
      '<div class="rps-side">' +
        '<div class="rps-side-tag you">' + T('rp.you') + '</div>' +
        '<div class="rps-card" id="rpsMyCard"><span class="rps-card-face" id="rpsMyFace">❓</span></div>' +
        '<div class="rps-score-w" id="rpsMyScoreW"><span class="rps-score" id="rpsMyScore">0</span></div>' +
      '</div>' +
      '<div class="rps-vs"><span>VS</span></div>' +
      '<div class="rps-side">' +
        '<div class="rps-side-tag opp" id="rpsOppTag">' + T('rp.computer') + '</div>' +
        '<div class="rps-card" id="rpsOppCard"><span class="rps-card-face" id="rpsOppFace">❓</span></div>' +
        '<div class="rps-score-w" id="rpsAiScoreW"><span class="rps-score" id="rpsAiScore">0</span></div>' +
      '</div>' +
      '<div class="rps-count" id="rpsCount" aria-hidden="true"></div>' +
    '</div>' +
    '<div class="rps-picks">' +
      RPS_MOVES.map(function (m) {
        return '<button class="rpsBtn" data-m="' + m + '" onclick="rpsPlay(\'' + m + '\')">' +
          '<span class="rps-emoji">' + m + '</span>' +
          '<span class="rps-label">' + rpsLabel(m) + '</span>' +
        '</button>';
      }).join('') +
    '</div>' +
    '<div class="rps-status" id="rpsResult"></div>' +
    betRow(),
    g
  );
}
function rpsPlay(p) {
  /* وضع الغرفة: اختيار متزامن ضد صديق (بدون رهان) */
  if (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.game_id === 'rp' && Rooms.state.status === 'playing') {
    rpsRoomPlay(p);
    return;
  }
  if (rpsBusy) return;
  if (!take()) return;
  rpsSetBusy(true);
  rpsLastPick = p;
  SND.click();
  const myFace = document.getElementById('rpsMyFace');
  const myCard = document.getElementById('rpsMyCard');
  const oppFace = document.getElementById('rpsOppFace');
  const oppCard = document.getElementById('rpsOppCard');
  const resEl = document.getElementById('rpsResult');
  if (myCard) { myCard.classList.remove('win', 'lose', 'tie', 'reveal-pop'); }
  if (oppCard) { oppCard.classList.remove('win', 'lose', 'tie', 'reveal-pop'); }
  if (resEl) resEl.textContent = '';
  /* كشف حتمي باستدعاء _rng واحد — حركة الحاسوب محسوبة قبل العدّ */
  const c = RPS_MOVES[Math.floor(_rng() * 3)];
  /* [v2.62 PRO] تسلسل سينمائي: صافرة → عدّ تنازلي 3-2-1 بنبض البطاقتين → كشف مزدوج بقلب 3D → حسم */
  var arena = document.querySelector('.rps-arena');
  if (arena) arena.classList.add('dueling');
  if (myCard) myCard.classList.add('counting');
  if (oppCard) oppCard.classList.add('counting');
  var step = 3;
  rpsCountBadge('3');
  SND.rpsCount(0);
  var countTimer = setInterval(function () {
    step--;
    if (step >= 1) {
      rpsCountBadge(String(step));
      SND.rpsCount(3 - step);
    } else {
      clearInterval(countTimer);
      /* لحظة الكشف */
      rpsCountBadge(T('rp.shoot'));
      SND.rpsShoot();
      if (arena) arena.classList.remove('dueling');
      if (myCard) myCard.classList.remove('counting');
      if (oppCard) oppCard.classList.remove('counting');
      SND.rpsReveal();
      rpsRevealCard(myCard, myFace, p);
      rpsRevealCard(oppCard, oppFace, c);
      /* صوت الحركة الغالبة + الحسم بعد لحظة الكشف */
      setTimeout(function () {
        const win = RPS_BEATS[p] === c;
        const tie = p === c;
        rpsMoveSound(win ? p : c);   /* صوت الحركة التي حسمت الجولة */
        let w = 0;
        if (win) {
          w = Math.floor(GB * 1.95);
          give(w);
          rpsMyScore++;
          SND.rpsWin();
          if (myCard) myCard.classList.add('win');
          if (oppCard) oppCard.classList.add('lose');
          if (typeof flashColor === 'function') flashColor('rgba(52, 211, 153, 0.4)');
          if (resEl) resEl.textContent = T('rp.you') + ': ' + p + '  vs  ' + T('rp.computer') + ': ' + c + ' — ' + T('rp.winRound');
          gres('×1.95 +' + fmt(w) + ' 🪙', w);
          winFX(w);
        } else if (tie) {
          give(GB); /* تعادل — استرداد الرهان */
          SND.rpsTie();
          if (myCard) myCard.classList.add('tie');
          if (oppCard) oppCard.classList.add('tie');
          if (resEl) resEl.textContent = T('rp.you') + ': ' + p + '  vs  ' + T('rp.computer') + ': ' + c + ' — ' + T('rp.tieRound');
          gres(T('rp.tie'), 0);
        } else {
          rpsAiScore++;
          SND.rpsLose();
          if (myCard) myCard.classList.add('lose');
          if (oppCard) oppCard.classList.add('win');
          if (typeof flashColor === 'function') flashColor('rgba(244, 63, 94, 0.32)');
          if (resEl) resEl.textContent = T('rp.you') + ': ' + p + '  vs  ' + T('rp.computer') + ': ' + c + ' — ' + T('rp.loseRound');
          gres(T('ts.lose'), 0);
          winFX(0);
        }
        rpsSyncScore();
        setTimeout(function () {
          if (oppFace) oppFace.textContent = '❓';
          if (myFace) myFace.textContent = '❓';
          if (myCard) myCard.classList.remove('reveal-pop');
          if (oppCard) oppCard.classList.remove('reveal-pop');
          rpsSetBusy(false);
        }, 1500);
      }, 480);
    }
  }, 420);
}
/* ── RPS وضع الغرفة (2 لاعبين: اختيار أعمى متزامن — يكشف الخادم الزوج معاً، النتيجة محلية — بلا رهان) ── */
function rpsRoomPlay(p) {
  if (!rpRoom || rpRoom.waiting) return;
  SND.click();
  rpRoom.myPick = p;
  rpRoom.waiting = true;
  const myFace = document.getElementById('rpsMyFace');
  if (myFace) myFace.textContent = p;
  rpsSetBusy(true);
  Rooms.sendBlind({ d: p });
  rpsRoomUi();
}
function rpRoomMove(d) {
  if (!rpRoom) return;
  if (d.action === 'blind') {
    /* الخصم اختار — لا نعرف قيمته (اختيار أعمى) */
    rpRoom.oppPicked = true;
    rpsRoomUi();
  } else if (d.action === 'blindResult') {
    var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
    var myId = me ? String(me.id) : null;
    var oppId = null;
    if (Rooms.state && Rooms.state.players) {
      Rooms.state.players.forEach(function (p) {
        if (String(p.id) !== myId) oppId = String(p.id);
      });
    }
    rpRoom.myPick = (myId && d.data.dirs[myId]) ? d.data.dirs[myId] : rpRoom.myPick;
    rpRoom.oppPick = oppId ? d.data.dirs[oppId] : null;
    if (!rpRoom.oppName && Rooms.state && Rooms.state.players) {
      Rooms.state.players.forEach(function (p) {
        if (String(p.id) === oppId) rpRoom.oppName = p.username;
      });
    }
    rpRoom.oppPicked = false;
    rpRoom.waiting = false;
    const oppTag = document.getElementById('rpsOppTag');
    if (oppTag) oppTag.textContent = rpRoom.oppName || T('rp.opp');
    rpsRoomSettle();
  }
}
function rpsRoomSettle() {
  var myWin = RPS_BEATS[rpRoom.myPick] === rpRoom.oppPick;
  var oppWin = RPS_BEATS[rpRoom.oppPick] === rpRoom.myPick;
  if (myWin) rpRoom.myWins++;
  if (oppWin) rpRoom.oppWins++;
  /* [v2.62 PRO] كشف الغرفة بنفس السينما: قلب 3D + أصوات + وميض */
  var myCard = document.getElementById('rpsMyCard');
  var oppCard = document.getElementById('rpsOppCard');
  var myFace = document.getElementById('rpsMyFace');
  var oppFace = document.getElementById('rpsOppFace');
  SND.rpsReveal();
  rpsRevealCard(myCard, myFace, rpRoom.myPick);
  rpsRevealCard(oppCard, oppFace, rpRoom.oppPick);
  if (myCard) myCard.classList.remove('counting');
  if (oppCard) oppCard.classList.remove('counting');
  rpsMoveSound(myWin ? rpRoom.myPick : (oppWin ? rpRoom.oppPick : rpRoom.myPick));
  if (myWin) { SND.rpsWin(); if (myCard) myCard.classList.add('win'); if (oppCard) oppCard.classList.add('lose'); if (typeof flashColor === 'function') flashColor('rgba(52, 211, 153, 0.4)'); }
  else if (oppWin) { SND.rpsLose(); if (myCard) myCard.classList.add('lose'); if (oppCard) oppCard.classList.add('win'); if (typeof flashColor === 'function') flashColor('rgba(244, 63, 94, 0.32)'); }
  else { SND.rpsTie(); if (myCard) myCard.classList.add('tie'); if (oppCard) oppCard.classList.add('tie'); }
  var el = document.getElementById('rpsResult');
  var txt = T('rp.you') + ': ' + rpRoom.myPick + '  vs  ' + (rpRoom.oppName || T('rp.opp')) + ': ' + rpRoom.oppPick;
  if (myWin) txt += '\n🏆 ' + T('rp.winRound');
  else if (oppWin) txt += '\n😅 ' + T('rp.loseRound');
  else txt += '\n🤝 ' + T('rp.tieRound');
  if (el) el.textContent = txt;
  var rpMax = (window.HTH_ROUNDS && window.HTH_ROUNDS.rp) || (Rooms.state && Rooms.state.game_opts && Rooms.state.game_opts.rounds) || 3;   /* [RS-GameOpts] */
  if (rpRoom.round >= rpMax) {
    var finalTxt = '';
    if (rpRoom.myWins > rpRoom.oppWins) finalTxt = '\n🏆 ' + T('rp.matchWin') + ' ' + rpRoom.myWins + ':' + rpRoom.oppWins + '!';
    else if (rpRoom.oppWins > rpRoom.myWins) finalTxt = '\n' + T('rp.matchLose') + ' ' + rpRoom.myWins + ':' + rpRoom.oppWins;
    else finalTxt = '\n🤝 ' + T('rp.matchTie') + ' ' + rpRoom.myWins + ':' + rpRoom.oppWins;
    if (el) el.textContent = txt + finalTxt + '\n(' + T('rp.again') + ')';
    return;
  }
  rpRoom.round++;
  rpRoom.myPick = null;
  rpRoom.oppPick = null;
  rpRoom.oppPicked = false;
  rpRoom.waiting = false;
  setTimeout(function () {
    const mf = document.getElementById('rpsMyFace');
    const of = document.getElementById('rpsOppFace');
    const mc = document.getElementById('rpsMyCard');
    const oc = document.getElementById('rpsOppCard');
    if (mf) mf.textContent = '❓';
    if (of) of.textContent = '❓';
    if (mc) mc.classList.remove('reveal-pop');
    if (oc) oc.classList.remove('reveal-pop');
    rpsSetBusy(false);
    rpsRoomUi();
  }, 1600);
}
function rpsRoomUi() {
  var el = document.getElementById('rpsResult');
  if (!el || !rpRoom) return;
  if (typeof Rooms === 'undefined' || !Rooms.state) return;
  if (Rooms.state.status !== 'playing') {
    el.textContent = '🛡️ ' + T('rp.roomWait');
    return;
  }
  if (rpRoom.waiting) {
    el.textContent = '⏳ ' + T('rp.roomWaiting') + (rpRoom.oppPicked ? ' — ' + T('rp.oppPicked') : '') + ' (' + T('rp.round') + ' ' + rpRoom.round + '/' + ((window.HTH_ROUNDS && window.HTH_ROUNDS.rp) || (Rooms.state && Rooms.state.game_opts && Rooms.state.game_opts.rounds) || 3) + ' — ' + (rpRoom.oppName || T('rp.opp')) + ')';
  } else {
    el.textContent = '🎮 ' + T('rp.roomGo') + '  (' + T('rp.round') + ' ' + rpRoom.round + '/' + ((window.HTH_ROUNDS && window.HTH_ROUNDS.rp) || (Rooms.state && Rooms.state.game_opts && Rooms.state.game_opts.rounds) || 3) + ' — ' + T('rp.you') + ' ' + rpRoom.myWins + ' : ' + rpRoom.oppWins + ')';
  }
}

/* ═══════════ 11. Penalty ═══════════ */
/* solo: تسديدة ضد حارس — 9 جهات (يمين/وسط/يسار × أعلى/وسط/أسفل) — جهة مختلفة = هدف
   P(goal)=8/9 → ×1.08 → RTP = 8/9 × 1.08 = 0.96 (هامش كازينو 4%)
   غرفة (2 لاعبين وجهاً لوجه): 5 جولات متناوبة — seat 0 يهاجم 1/3/5، seat 1 في 2/4 —
   اختيار أعمى متزامن (sendBlind): الخادم يكشف الزوج معاً فلا يرى من يختار ثانياً حركة الأول
   [v2.62 PRO] استاد كامل: جمهور وومضات كاميرات، قائم/عارضة معدنية، شبكة وتموّج عند الهدف،
   علامة الجزاء، طيران قوسي للكرة (WAAPI) بذيل حركة ودوران، غوص الحارس بتمدد ودوران،
   لافتة نتيجة عملاقة (هدف/تصدي)، صافرة/ركلة/هدير جمهور/شبكة/قفاز — منطق الدفع والعشوائية كما هو. */
var pnRoom = null;
var pnBusy = false;
/* ترتيب الجهات: أعلى-يسار، أعلى، أعلى-يمين، يسار-وسط، وسط، يمين-وسط، أسفل-يسار، أسفل، أسفل-يمين */
const PN_DIRS = ['↖️', '⬆️', '↗️', '⬅️', '🎯', '➡️', '↙️', '⬇️', '↘️'];
const PN_KEYS = { '↖️': 'pn.tl', '⬆️': 'pn.tc', '↗️': 'pn.tr', '⬅️': 'pn.ml', '🎯': 'pn.mc', '➡️': 'pn.mr', '↙️': 'pn.bl', '⬇️': 'pn.bc', '↘️': 'pn.br' };
/* إحداثيات الشبكة 3×3: x قيَم معيارية -112..112 (تُحوَّل لبكسل من عرض المرمى الفعلي)
   و y بالبكسل — القيم العلوية سالبة (الكرة/الحارس فوق المنتصف) والسفلية موجبة */
const PN_POS = {
  '↖️': { x: -112, y: -36 }, '⬆️': { x: 0, y: -46 }, '↗️': { x: 112, y: -36 },
  '⬅️': { x: -112, y: 0 }, '🎯': { x: 0, y: 0 }, '➡️': { x: 112, y: 0 },
  '↙️': { x: -112, y: 30 }, '⬇️': { x: 0, y: 38 }, '↘️': { x: 112, y: 30 }
};
function pnLabel(d) {
  return T(PN_KEYS[d] || '');
}
function pnSetBusy(b) {
  pnBusy = b;
  const btns = document.querySelectorAll('.pnBtn');
  for (let i = 0; i < btns.length; i++) btns[i].disabled = b;
}
function pnRoomReset() {
  pnRoom = { round: 1, mySeat: 0, myDir: null, oppDir: null, shootD: null, saveD: null, waiting: false, myScore: 0, oppScore: 0, oppName: '', oppPicked: false };
}
function pnRoomAttackerSeat() {
  return (pnRoom.round % 2 === 1) ? 0 : 1;
}
function penField() {
  return {
    arena: document.querySelector('.pn-arena'),
    keeper: document.getElementById('pnKeeper'),
    ball: document.getElementById('pnBall'),
    res: document.getElementById('penResult'),
    role: document.getElementById('pnRole'),
    banner: document.getElementById('pnBanner'),
    ripple: document.getElementById('pnRipple')
  };
}
/* [v2.62] تحويل الإحداثيات المعيارية إلى بكسل من عرض المرمى الفعلي —
   الجهات القصوى تلامس القوائم فعلاً (كانت % من حجم الرمز فلا تكاد تتحرك) */
function penTargetPx(d) {
  const f = penField();
  const p = PN_POS[d] || PN_POS['🎯'];
  const goal = f.arena ? f.arena.querySelector('.goal') : null;
  const w = goal ? goal.clientWidth : 260;
  const h = goal ? goal.clientHeight : 140;
  const x = (p.x / 112) * (w / 2 - 16);
  const y = p.y * (h / 140);
  return { x: x, y: y };
}
/* [v2.62] طيران قوسي للكرة بمنحنى WAAPI: صعود ثم هبوط على الهدف + دوران + ذيل حركة */
function penFlyBall(d, done) {
  const f = penField();
  if (!f.ball) return;
  const t = penTargetPx(d);
  const ball = f.ball;
  try { ball.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {}
  ball.classList.add('flying');
  const anim = ball.animate([
    { transform: 'translateX(0px) translateY(0px) scale(1) rotate(0deg)', offset: 0 },
    { transform: 'translateX(' + (t.x * 0.4) + 'px) translateY(' + (t.y * 0.85 - 14) + 'px) scale(1.16) rotate(260deg)', offset: 0.4 },
    { transform: 'translateX(' + t.x + 'px) translateY(' + t.y + 'px) scale(0.9) rotate(540deg)', offset: 1 }
  ], { duration: 520, easing: 'cubic-bezier(0.22, 0.9, 0.36, 1)', fill: 'forwards' });
  if (anim && anim.onfinish !== undefined) {
    anim.onfinish = function () {
      ball.classList.remove('flying');
      if (done) done();
    };
  } else {
    setTimeout(function () { ball.classList.remove('flying'); if (done) done(); }, 540);
  }
}
function penMoveBall(d) {
  const f = penField();
  if (!f.ball) return;
  const t = penTargetPx(d);
  try { f.ball.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {}
  f.ball.classList.remove('flying');
  f.ball.style.transform = 'translateX(' + t.x + 'px) translateY(' + t.y + 'px)';
}
/* [v2.62] غوص الحارس: اندفاع بكسل من عرض المرمى + دوران غوص + تمدد رأسي */
function penMoveKeeper(d) {
  const f = penField();
  if (!f.keeper) return;
  const t = penTargetPx(d);
  const rot = t.x < -20 ? -46 : t.x > 20 ? 46 : 0;
  try { f.keeper.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {}
  f.keeper.classList.remove('idle');
  const stretch = t.y < -18 ? ' scaleY(1.18)' : ' scaleY(1.05)';
  f.keeper.animate([
    { transform: 'translateX(0px) translateY(0px) rotate(0deg) scaleY(1)' },
    { transform: 'translateX(' + t.x + 'px) translateY(' + (t.y + 6) + 'px) rotate(' + rot + 'deg)' + stretch }
  ], { duration: 460, easing: 'cubic-bezier(0.25, 0.9, 0.3, 1)', fill: 'forwards' });
}
/* [v2.62] لافتة النتيجة العملاقة: هدف/تصدي */
function penBanner(kind) {
  const f = penField();
  if (!f.banner) return;
  f.banner.classList.remove('show', 'goal', 'saved');
  void f.banner.offsetWidth;
  f.banner.textContent = kind === 'goal' ? T('pn.goal') : T('pn.save');
  f.banner.classList.add('show', kind);
}
function penResetField() {
  const f = penField();
  if (f.ball) {
    try { f.ball.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {}
    f.ball.classList.remove('flying');
    f.ball.style.transform = 'translateX(0) translateY(0)';
  }
  if (f.keeper) {
    try { f.keeper.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {}
    f.keeper.style.transform = 'translateX(0) translateY(0) rotate(0deg)';
    f.keeper.classList.add('idle');
  }
  if (f.arena) f.arena.classList.remove('pn-goal', 'pn-saved', 'cheer');
  if (f.banner) f.banner.classList.remove('show', 'goal', 'saved');
  if (f.ripple) f.ripple.classList.remove('wave');
}
function ePenalty(g) {
  pnRoomReset();
  pnBusy = false;
  if (typeof Rooms !== 'undefined') {
    Rooms.setGameHandler(pnRoomMove);
    Rooms.setStartHandler(function (room) {
      pnRoomReset();
      if (room && room.players) {
        var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
        var mine = room.players.find(function (p) { return p.id === (me && me.id); });
        var opp = room.players.find(function (p) { return p.id !== (me && me.id); });
        if (mine) pnRoom.mySeat = mine.seat;
        if (opp) pnRoom.oppName = opp.username;
      }
      pnRoomUi();
    });
  }
  return gFrame(
    '<div class="pn-hint">' + T('pn.hint') + '</div>' +
    '<div class="pn-arena">' +
      '<div class="pn-crowd" aria-hidden="true"></div>' +
      '<div class="goal">' +
        '<div class="gbar"></div>' +
        '<div class="gpost gl"></div><div class="gpost gr"></div>' +
        '<div class="gnet"></div>' +
        '<div class="gripple" id="pnRipple" aria-hidden="true"></div>' +
        '<span class="keeper idle" id="pnKeeper">🧤</span>' +
        '<span class="pball2" id="pnBall">⚽</span>' +
      '</div>' +
      '<div class="pn-grass" aria-hidden="true"></div>' +
      '<div class="pn-spot" aria-hidden="true"></div>' +
      '<div class="pn-banner" id="pnBanner" aria-live="polite"></div>' +
    '</div>' +
    '<div class="pn-role" id="pnRole">⚽ ' + T('pn.youShoot') + '</div>' +
    /* تسعة أزرار 3×3 — نمط .nine في CSS (شبكة بدل الصف الواحد القديم) */
    '<div class="pn-picks nine">' +
      PN_DIRS.map(function (d) {
        return '<button class="pnBtn" data-d="' + d + '" onclick="penShoot(\'' + d + '\')">' +
          '<span class="pn-arrow">' + d + '</span>' +
          '<span class="pn-dir">' + pnLabel(d) + '</span>' +
        '</button>';
      }).join('') +
    '</div>' +
    '<div class="pn-status" id="penResult"></div>' +
    betRow(),
    g
  );
}
function penShoot(d) {
  /* وضع الغرفة: اختيار أعمى متزامن حسب دورك هذه الجولة */
  if (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.game_id === 'pn' && Rooms.state.status === 'playing') {
    pnRoomAct(d);
    return;
  }
  if (pnBusy) return;
  if (!take()) return;
  pnSetBusy(true);
  SND.click();
  const f = penField();
  if (f.res) f.res.textContent = '';
  /* كشف حتمي باستدعاء _rng واحد — جهة الحارس من 9 جهات (P(تصدي)=1/9) محسوبة قبل الحركة */
  const gk = PN_DIRS[Math.floor(_rng() * 9)];
  const win = gk !== d;
  /* [v2.62 PRO] التسلسل السينمائي: صافرة → استعداد (الحارس يتراقص) → ركلة → طيران قوسي
     → غوص الحارس → الحسم (لافتة + أصوات + تموّج شبكة + وميض + اهتزاز) */
  if (f.role) f.role.textContent = '🧤 ' + T('pn.saving');
  if (typeof SND.pnWhistle === 'function') { try { SND.pnWhistle(); } catch (e) {} }
  const goal = f.arena ? f.arena.querySelector('.goal') : null;
  if (goal) goal.classList.add('tense');   /* توهج المرمى أثناء الترقب */
  /* شحن الكرة لحظة قبل الركل */
  if (f.ball) {
    f.ball.animate([
      { transform: 'translateX(0px) translateY(0px) scale(1)' },
      { transform: 'translateX(0px) translateY(0px) scale(1.14)' }
    ], { duration: 260, easing: 'ease-out', fill: 'forwards' });
  }
  setTimeout(function () {
    /* الركلة */
    if (typeof SND.pnKick === 'function') { try { SND.pnKick(); } catch (e) {} }
    if (goal) goal.classList.remove('tense');
    penFlyBall(d, function () {
      /* الحسم فور وصول الكرة */
      /* P(goal)=8/9 → ×1.08 → RTP = 8/9 × 1.08 ≈ 96% (هامش كازينو 4%) */
      const w = win ? Math.floor(GB * 1.08) : 0;
      if (win) {
        give(w);
        if (f.arena) { f.arena.classList.add('pn-goal', 'cheer'); }
        if (f.ripple) { void f.ripple.offsetWidth; f.ripple.classList.add('wave'); }
        penBanner('goal');
        if (typeof SND.pnGoal === 'function') { try { SND.pnGoal(); } catch (e) {} }
        if (typeof SND.pnNet === 'function') { try { SND.pnNet(); } catch (e) {} }
        if (typeof flashColor === 'function') flashColor('rgba(52, 211, 153, 0.42)');
        if (typeof shake === 'function' && f.arena) shake(f.arena, 7, 500);
        if (f.res) f.res.textContent = T('pn.shot') + ': ' + pnLabel(d) + '  —  ' + T('pn.keep') + ': ' + pnLabel(gk) + '\n🥅 ' + T('pn.goal');
        gres('×1.08 +' + fmt(w) + ' 🪙', w);
        winFX(w);
      } else {
        if (f.arena) f.arena.classList.add('pn-saved');
        penBanner('saved');
        if (typeof SND.pnSave === 'function') { try { SND.pnSave(); } catch (e) {} }
        if (typeof flashColor === 'function') flashColor('rgba(244, 63, 94, 0.34)');
        if (typeof shake === 'function' && f.arena) shake(f.arena, 5, 380);
        if (f.res) f.res.textContent = T('pn.shot') + ': ' + pnLabel(d) + '  —  ' + T('pn.keep') + ': ' + pnLabel(gk) + '\n🙌 ' + T('pn.save');
        gres(T('ts.lose'), 0);
        winFX(0);
      }
      setTimeout(function () {
        penResetField();
        pnSetBusy(false);
        if (f.role) f.role.textContent = '⚽ ' + T('pn.youShoot');
      }, 2100);
    });
    /* الحارس يغوص بالتوازي مع الطيران — يسبقها قليلاً كالمبارة الحقيقية */
    setTimeout(function () { penMoveKeeper(gk); }, 330);
  }, 560);
}
/* ── Penalty وضع الغرفة (اختيار أعمى: كل طرف يختار جهته دون رؤية الآخر — يكشف الخادم الزوج معاً) ── */
function pnRoomAct(d) {
  if (!pnRoom || pnRoom.waiting) return;
  SND.click();
  pnRoom.myDir = d;
  pnRoom.waiting = true;
  pnSetBusy(true);
  Rooms.sendBlind({ d: d });
  pnRoomUi();
}
function pnRoomMove(d) {
  if (!pnRoom) return;
  if (d.action === 'blind') {
    pnRoom.oppPicked = true;
    pnRoomUi();
  } else if (d.action === 'blindResult') {
    var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
    var myId = me ? String(me.id) : null;
    var oppId = null;
    if (Rooms.state && Rooms.state.players) {
      Rooms.state.players.forEach(function (p) {
        if (String(p.id) !== myId) oppId = String(p.id);
      });
    }
    var myD = (myId && d.data.dirs[myId]) ? d.data.dirs[myId] : pnRoom.myDir;
    var oppD = oppId ? d.data.dirs[oppId] : null;
    var attacker = pnRoomAttackerSeat() === pnRoom.mySeat;
    if (attacker) { pnRoom.shootD = myD; pnRoom.saveD = oppD; }
    else { pnRoom.shootD = oppD; pnRoom.saveD = myD; }
    pnRoom.waiting = false;
    pnRoom.oppPicked = false;
    pnRoomSettle();
  }
}
function pnRoomSettle() {
  var goal = pnRoom.shootD !== pnRoom.saveD;
  var attacker = pnRoomAttackerSeat() === pnRoom.mySeat;
  if (goal) {
    if (attacker) pnRoom.myScore++; else pnRoom.oppScore++;
  }
  var f = penField();
  /* [v2.62 PRO] كشف متزامن سينمائي على الشاشتين: صافرة → ركلة → طيران → غوص → حسم */
  if (typeof SND.pnWhistle === 'function') { try { SND.pnWhistle(); } catch (e) {} }
  if (f.res) {
    f.res.textContent = T('pn.shot') + ': ' + pnLabel(pnRoom.shootD) + '  —  ' + T('pn.keep') + ': ' + pnLabel(pnRoom.saveD);
  }
  setTimeout(function () {
    if (typeof SND.pnKick === 'function') { try { SND.pnKick(); } catch (e) {} }
    penFlyBall(pnRoom.shootD, function () {
      /* الحسم فور وصول الكرة */
      if (goal) {
        if (f.arena) { f.arena.classList.add('pn-goal', 'cheer'); }
        if (f.ripple) { void f.ripple.offsetWidth; f.ripple.classList.add('wave'); }
        penBanner('goal');
        if (typeof SND.pnGoal === 'function') { try { SND.pnGoal(); } catch (e) {} }
        if (typeof SND.pnNet === 'function') { try { SND.pnNet(); } catch (e) {} }
        if (typeof flashColor === 'function') flashColor('rgba(52, 211, 153, 0.42)');
        if (typeof shake === 'function' && f.arena) shake(f.arena, 7, 500);
      } else {
        if (f.arena) f.arena.classList.add('pn-saved');
        penBanner('saved');
        if (typeof SND.pnSave === 'function') { try { SND.pnSave(); } catch (e) {} }
        if (typeof flashColor === 'function') flashColor('rgba(244, 63, 94, 0.34)');
        if (typeof shake === 'function' && f.arena) shake(f.arena, 5, 380);
      }
      if (f.res) {
        f.res.textContent = T('pn.shot') + ': ' + pnLabel(pnRoom.shootD) + '  —  ' + T('pn.keep') + ': ' + pnLabel(pnRoom.saveD) +
          (goal ? '\n🥅 ' + T('pn.goal') : '\n🙌 ' + T('pn.save'));
      }
      /* نتيجة المباراة إن انتهت */
      var pnMax = (window.HTH_ROUNDS && window.HTH_ROUNDS.pn) || (Rooms.state && Rooms.state.game_opts && Rooms.state.game_opts.rounds) || 5;   /* [RS-GameOpts] */
      var finishMatch = pnRoom.round >= pnMax;
      if (finishMatch) {
        var finalTxt = '';
        if (pnRoom.myScore > pnRoom.oppScore) finalTxt = '\n🏆 ' + T('pn.matchWin') + ' ' + pnRoom.myScore + ':' + pnRoom.oppScore + '!';
        else if (pnRoom.oppScore > pnRoom.myScore) finalTxt = '\n' + T('pn.matchLose') + ' ' + pnRoom.myScore + ':' + pnRoom.oppScore;
        else finalTxt = '\n🤝 ' + T('pn.matchTie') + ' ' + pnRoom.myScore + ':' + pnRoom.oppScore;
        if (f.res) f.res.textContent += finalTxt + '\n(' + T('pn.again') + ')';
        return;
      }
      pnRoom.round++;
      pnRoom.shootD = null;
      pnRoom.saveD = null;
      pnRoom.myDir = null;
      pnRoom.waiting = false;
      setTimeout(function () {
        penResetField();
        pnSetBusy(false);
        pnRoomUi();
      }, 2200);
    });
    /* الحارس يغوص بالتوازي */
    setTimeout(function () { penMoveKeeper(pnRoom.saveD); }, 330);
  }, 520);
}
function pnRoomUi() {
  var el = document.getElementById('penResult');
  var role = document.getElementById('pnRole');
  if (!el || !pnRoom) return;
  if (typeof Rooms === 'undefined' || !Rooms.state) return;
  if (Rooms.state.status !== 'playing') {
    el.textContent = '🛡️ ' + T('pn.roomWait');
    if (role) role.textContent = '';
    return;
  }
  var attacker = pnRoomAttackerSeat() === pnRoom.mySeat;
  var score = '(' + T('pn.you') + ' ' + pnRoom.myScore + ' : ' + pnRoom.oppScore + ')';
  if (pnRoom.waiting) {
    if (role) role.textContent = attacker ? '⚽ ' + T('pn.shotSent') : '🧤 ' + T('pn.saveSent');
    el.textContent = '⏳ ' + T('pn.roomWaiting') + (pnRoom.oppPicked ? ' — ' + T('pn.oppPicked') : '') + ' (' + T('pn.round') + ' ' + pnRoom.round + '/' + ((window.HTH_ROUNDS && window.HTH_ROUNDS.pn) || (Rooms.state && Rooms.state.game_opts && Rooms.state.game_opts.rounds) || 5) + ') ' + score;
  } else {
    if (role) role.textContent = attacker ? '⚽ ' + T('pn.youShoot') : '🧤 ' + T('pn.youSave');
    el.textContent = (attacker ? '🎮 ' + T('pn.roomGo') : '🎮 ' + T('pn.roomGoSave')) + ' (' + T('pn.round') + ' ' + pnRoom.round + '/' + ((window.HTH_ROUNDS && window.HTH_ROUNDS.pn) || (Rooms.state && Rooms.state.game_opts && Rooms.state.game_opts.rounds) || 5) + ') ' + score;
  }
}

/* ═══════════ سجل المحركات ═══════════ */
const ENG = {
  ronda: (typeof window.eRonda === 'function') ? window.eRonda : ((typeof eRonda === 'function') ? eRonda : null),
  get rondacard() { return (typeof window.eRondaCard === 'function') ? window.eRondaCard : null; },
  chess: (typeof window.eChess === 'function') ? window.eChess : ((typeof eChess === 'function') ? eChess : null),
  dama: (typeof window.eDama === 'function') ? window.eDama : ((typeof eDama === 'function') ? eDama : null),
  get billiards() { return (typeof window.eBilliards === 'function') ? window.eBilliards : ((typeof eBilliards === 'function') ? eBilliards : null); },
  get backgammon() { return (typeof window.eBackgammon === 'function') ? window.eBackgammon : null; },
  get dominoes() { return (typeof window.eDominoes === 'function') ? window.eDominoes : null; },
  get baloot() { return (typeof window.eBaloot === 'function') ? window.eBaloot : null; },
  get uno() { return (typeof window.eUno === 'function') ? window.eUno : null; },
  rami: (typeof window.eRami === 'function') ? window.eRami : ((typeof eRami === 'function') ? eRami : null),
  rps: (typeof window.eRps === 'function') ? window.eRps : ((typeof eRps === 'function') ? eRps : null),
  pen: (typeof window.ePenalty === 'function') ? window.ePenalty : ((typeof ePenalty === 'function') ? ePenalty : null),
};

if (typeof window !== 'undefined') {
  window.ENG = ENG;
}
