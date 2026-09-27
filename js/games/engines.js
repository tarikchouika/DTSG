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
  const GAME_BG = { andar_bahar: 1, baccarat: 1, backgammon: 1, crabbin: 1, dice: 1, dominoes: 1, dragon: 1, fishing: 1, football: 1, gates: 1, lightning: 1, lottery: 1, 'lucky-7': 1, mahjong: 1, mines: 1, money: 1, olympus: 1, parchisi: 1, plinko: 1, 'rock-paper': 1, ronda: 1, rose: 1, roulette: 1, scratch: 1, 'sic-bo': 1, 'slot-spin': 1, 'sweet-bonanza': 1, wheel: 1, wingo: 1 };
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
  rpRoom = { myPick: null, oppPick: null, round: 1, myWins: 0, oppWins: 0, waiting: false, oppName: '', oppPicked: false, mySeat: 0 };
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
        var mine = room.players.find(function (p) { return p.id === (me && me.id); });
        if (mine) rpRoom.mySeat = mine.seat;   /* [RoomSettle] مقعدي لتسوية رهان المباراة */
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
    '<div class="rps-status" id="rpsResult"></div>',
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
  /* [Free-EDU] اللعب ضد الحاسوب مجاني وتعليمي — لا خصم ولا أرباح:
     الرهان بين المستخدمين فقط في الغرف ويُحدد في إعدادات الغرفة عند فتحها */
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
        if (win) {
          rpsMyScore++;
          SND.rpsWin();
          if (myCard) myCard.classList.add('win');
          if (oppCard) oppCard.classList.add('lose');
          if (typeof flashColor === 'function') flashColor('rgba(52, 211, 153, 0.4)');
          if (resEl) resEl.textContent = T('rp.you') + ': ' + p + '  vs  ' + T('rp.computer') + ': ' + c + ' — ' + T('rp.winRound');
          gres(T('rp.winRound'), 0, true, true);   /* [Free-EDU] عرض فقط بلا تسجيل مالي */
          winFX(1);
        } else if (tie) {
          SND.rpsTie();
          if (myCard) myCard.classList.add('tie');
          if (oppCard) oppCard.classList.add('tie');
          if (resEl) resEl.textContent = T('rp.you') + ': ' + p + '  vs  ' + T('rp.computer') + ': ' + c + ' — ' + T('rp.tieRound');
          gres(T('rp.tie'), 0, true, true);
        } else {
          rpsAiScore++;
          SND.rpsLose();
          if (myCard) myCard.classList.add('lose');
          if (oppCard) oppCard.classList.add('win');
          if (typeof flashColor === 'function') flashColor('rgba(244, 63, 94, 0.32)');
          if (resEl) resEl.textContent = T('rp.you') + ': ' + p + '  vs  ' + T('rp.computer') + ': ' + c + ' — ' + T('rp.loseRound');
          gres(T('rp.loseRound'), 0, true);
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
    /* [RoomSettle] الرهان وجهاً لوجه يُحسم هنا: المضيف فقط يبث التسوية للخادم
       (خصم الرهان تم عند بدء الجولة — هنا تُوزَّع الأرباح: الفائز يأخذ القدح بعد رسم 5%) */
    if (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.game_id === 'rp' && Rooms.roomSettle) {
      var mySeat = rpRoom.mySeat || 0;
      var s0 = (mySeat === 0) ? rpRoom.myWins : rpRoom.oppWins;
      var s1 = (mySeat === 0) ? rpRoom.oppWins : rpRoom.myWins;
      try { Rooms.roomSettle(s0 > s1 ? 'w0' : (s1 > s0 ? 'w1' : 'draw')); } catch (e) {}
    }
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

/* ═══════════ 11. Penalty — v2.63 ملء الشاشة ═══════════ */
/* [v2.63 REDESIGN] إعادة تصميم كاملة وفق المواصفة:
   • عشب أخضر يملأ الشاشة 100% في البورتريه واللاندسكيب (طبقة fixed inset:0).
   • بورتريه: المرمى في وسط الشاشة من الحد الأيمن للأيسر بشكل مريح، مقسّم لتسع مناطق
     تُحدد باللمس أو السحب (تصويب بالإفلات) للتسديد أو للتصدي حسب الدور.
   • أسفل الشاشة: شريطا نتائج أفقيان (اللاعب الرئيسي + الخصم) بعلامات ✔/✕ لكل تسديدة.
   • أعلى الشاشة: أيقونات المتفرجين + مجموع رهان الجولة (وضع الغرفة) أو شارة التدريب المجاني.
   • لاندسكيب: كل العناصر تبقى في مواقعها وتُدار 90° هندسياً (الشريط الأفقي يصبح عمودياً،
     قائما المرمى يلتقيان بالحدّ الأعلى والأسفل للشاشة).
   • [Free-EDU] اللعب ضد الحاسوب مجاني وتعليمي — بلا خانة رهان في الواجهة:
     الرهان بين المستخدمين فقط في الغرف ويُحدد في إعدادات الغرفة عند فتحها.
   • غرفة (2 لاعبين وجهاً لوجه): ركلات متناوبة — seat 0 يهاجم 1/3/5 وseat 1 في 2/4 —
     اختيار أعمى متزامن (sendBlind) كما هو، وفي نهاية المباراة يوزّع المضيف القدح
     عبر Rooms.roomSettle (w0/w1/draw) — الخصم تم عند بدء الجولة والفائز يأخذه برسم 5%.
   التصويب عبر elementFromPoint (اختبار الإصابة من المتصفح يتكفل بدوران اللاندسكيب)،
   والإحداثيات كلها offset* (محلية لا تتأثر بالتحويلات). */
var pnRoom = null;
var pnBusy = false;
var pnSolo = null;
/* ترتيب المناطق: أعلى-يسار، أعلى، أعلى-يمين، يسار-وسط، وسط، يمين-وسط، أسفل-يسار، أسفل، أسفل-يمين */
const PN_DIRS = ['↖️', '⬆️', '↗️', '⬅️', '🎯', '➡️', '↙️', '⬇️', '↘️'];
const PN_KEYS = { '↖️': 'pn.tl', '⬆️': 'pn.tc', '↗️': 'pn.tr', '⬅️': 'pn.ml', '🎯': 'pn.mc', '➡️': 'pn.mr', '↙️': 'pn.bl', '⬇️': 'pn.bc', '↘️': 'pn.br' };
function pnLabel(d) {
  return T(PN_KEYS[d] || '');
}
function pnMaxRounds() {
  return (window.HTH_ROUNDS && window.HTH_ROUNDS.pn) || (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.game_opts && Rooms.state.game_opts.rounds) || 5;
}
function pnSetBusy(b) {
  pnBusy = b;
  var fs = document.getElementById('pnFs');
  if (fs) fs.classList.toggle('busy', !!b);
}
function pnRoomReset() {
  pnRoom = { round: 1, mySeat: 0, myDir: null, oppDir: null, shootD: null, saveD: null, waiting: false, myScore: 0, oppScore: 0, oppName: '', oppPicked: false, myShots: [], oppShots: [] };
}
function pnRoomAttackerSeat() {
  return (pnRoom.round % 2 === 1) ? 0 : 1;
}
function pnInRoom() {
  return !!(typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.game_id === 'pn');
}
function penField() {
  return {
    fs: document.getElementById('pnFs'),
    pitch: document.getElementById('pnPitch'),
    goal: document.getElementById('pnGoal'),
    zones: document.getElementById('pnZones'),
    keeper: document.getElementById('pnKeeper'),
    ball: document.getElementById('pnBall'),
    banner: document.getElementById('pnBanner'),
    ripple: document.getElementById('pnRipple'),
    turn: document.getElementById('pnTurn'),
    spot: document.getElementById('pnSpot')
  };
}
function pnOffsetsIn(el, ancestor) {
  var x = 0, y = 0, n = el;
  while (n && n !== ancestor) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x: x, y: y };
}
/* مركز منطقة داخل فضاء عنصر (سير offsetParent — لا يتأثر بتحويلات الأسلاف) */
function pnZoneCenterIn(d, ancestor) {
  var f = penField();
  var z = f.zones ? f.zones.querySelector('[data-d="' + d + '"]') : null;
  if (!f.zones || !z || !ancestor) return null;
  var zo = pnOffsetsIn(z, ancestor);
  return { x: zo.x + z.offsetWidth / 2, y: zo.y + z.offsetHeight / 2 };
}
/* [v2.63] طيران قوسي للكرة من علامة الجزاء إلى المنطقة: قوس صاعد + دوران + تقليص عمق
   + ارتداد مطاطي عند الوصول — الكرة مُركّزة بهوامش سالبة فالترجمة بكسل صافية */
function penFlyBall(d, done) {
  var f = penField();
  if (!f.ball || !f.pitch) { if (done) done(); return; }
  var t = pnZoneCenterIn(d, f.pitch);
  if (!t) { if (done) done(); return; }
  var dx = t.x - (f.ball.offsetLeft + f.ball.offsetWidth / 2);
  var dy = t.y - (f.ball.offsetTop + f.ball.offsetHeight / 2);
  var ball = f.ball;
  try { ball.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {}
  ball.classList.add('flying');
  var lift = Math.min(130, Math.abs(dy) * 0.34);
  var anim = ball.animate([
    { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', offset: 0 },
    { transform: 'translate(' + (dx * 0.44) + 'px, ' + (dy * 0.55 - lift) + 'px) scale(1.15) rotate(240deg)', offset: 0.42 },
    { transform: 'translate(' + (dx * 0.94) + 'px, ' + (dy * 0.97) + 'px) scale(0.84) rotate(480deg)', offset: 0.9 },
    { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(0.88) scaleX(1.26) scaleY(0.74) rotate(540deg)', offset: 1 }
  ], { duration: 620, easing: 'cubic-bezier(0.22, 0.9, 0.36, 1)', fill: 'forwards' });
  var fin = function () {
    ball.classList.remove('flying');
    if (done) done();
  };
  if (anim && anim.onfinish !== undefined) anim.onfinish = fin;
  else setTimeout(fin, 640);
}
/* [v2.63] غوص الحارس نحو المنطقة: اندفاع + دوران + تمدد رأسي — من موقعه الأرضي لمركز المنطقة */
function penMoveKeeper(d) {
  var f = penField();
  if (!f.keeper || !f.zones) return;
  var t = pnZoneCenterIn(d, f.goal);
  if (!t) return;
  var dx = t.x - (f.keeper.offsetLeft + f.keeper.offsetWidth / 2);
  var dy = t.y - (f.keeper.offsetTop + f.keeper.offsetHeight / 2);
  var rot = dx < -18 ? -52 : dx > 18 ? 52 : 0;
  try { f.keeper.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {}
  f.keeper.classList.remove('idle');
  f.keeper.classList.add('diving');
  var stretch = dy < -16 ? ' scaleY(1.18)' : ' scaleY(1.07)';
  var anim = f.keeper.animate([
    { transform: 'translate(0px, 0px) rotate(0deg) scaleY(1)' },
    { transform: 'translate(' + dx + 'px, ' + dy + 'px) rotate(' + rot + 'deg)' + stretch }
  ], { duration: 470, easing: 'cubic-bezier(0.2, 0.85, 0.3, 1)', fill: 'forwards' });
  if (!anim || anim.onfinish === undefined) {
    f.keeper.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) rotate(' + rot + 'deg)' + stretch;
  }
}
/* [v2.63] لافتة النتيجة العملاقة */
function penBanner(kind) {
  var f = penField();
  if (!f.banner) return;
  f.banner.classList.remove('show', 'goal', 'saved');
  void f.banner.offsetWidth;
  f.banner.textContent = kind === 'goal' ? '🥅 ' + T('pn.goal') : '🙌 ' + T('pn.save');
  f.banner.classList.add('show', kind);
}
/* [v2.63] تموّج الشبكة عند الهدف — مركز الموجة عند منطقة الإصابة */
function penRipple(d) {
  var f = penField();
  if (!f.ripple || !f.zones) return;
  var t = pnZoneCenterIn(d, f.goal);
  if (t) {
    f.ripple.style.left = t.x + 'px';
    f.ripple.style.top = t.y + 'px';
  }
  f.ripple.classList.remove('wave');
  void f.ripple.offsetWidth;
  f.ripple.classList.add('wave');
}
function penResetField() {
  var f = penField();
  if (f.ball) {
    try { f.ball.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {}
    f.ball.classList.remove('flying');
    f.ball.style.transform = '';
  }
  if (f.keeper) {
    try { f.keeper.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {}
    f.keeper.style.transform = '';
    f.keeper.classList.remove('diving');
    f.keeper.classList.add('idle');
  }
  if (f.fs) f.fs.classList.remove('pn-goal', 'pn-saved');
  if (f.goal) f.goal.classList.remove('tense');
  if (f.banner) f.banner.classList.remove('show', 'goal', 'saved');
  if (f.ripple) f.ripple.classList.remove('wave');
  if (f.zones) {
    var z = f.zones.querySelectorAll('.pnz.aim');
    for (var i = 0; i < z.length; i++) z[i].classList.remove('aim');
  }
}
/* ── الشريط العلوي: متفرجون + رهان الجولة (غرفة) أو تدريب مجاني (فردي) ── */
function pnTopRender() {
  var specEl = document.getElementById('pnSpecs');
  var betEl = document.getElementById('pnBet');
  if (!specEl || !betEl) return;
  var inRoom = pnInRoom() && Rooms.state;
  if (inRoom) {
    /* متفرجو الغرفة: اللاعبون بعلم spectate */
    var specs = (Rooms.state.players || []).filter(function (p) { return p.spectate; });
    var html = '';
    var shown = specs.slice(0, 6);
    for (var i = 0; i < shown.length; i++) {
      html += '<span class="pn-spec" title="' + esc(String(shown[i].username || '')) + '"><i class="fa-solid fa-user" aria-hidden="true"></i></span>';
    }
    if (specs.length > 6) html += '<span class="pn-spec more">+' + (specs.length - 6) + '</span>';
    specEl.innerHTML = specs.length ? ('<span class="pn-specs-n">' + esc(T('pn.spect')) + ' ' + specs.length + '</span>' + html) : '';
    specEl.style.display = specs.length ? 'flex' : 'none';
    /* مجموع رهان الجولة: كل لاعب يراهن بقيمة الغرفة — القدح = رهان اللاعبَين */
    var bet = Number(Rooms.state.bet) || 0;
    var pot = bet * 2;
    betEl.innerHTML = '<i class="fa-solid fa-coins" aria-hidden="true"></i> ' + esc(T('pn.pot')) + ': <b>' + fmt(pot) + '</b>';
    betEl.className = 'pn-bet room';
  } else {
    specEl.innerHTML = '';
    specEl.style.display = 'none';
    betEl.innerHTML = '🎓 ' + esc(T('pn.free'));
    betEl.className = 'pn-bet';
  }
}
/* ── شريطا النتائج السفليان: اللاعب الرئيسي + الخصم وعلامات تسديداتهما ── */
function pnBarTokens(seq, max) {
  var html = '';
  var start = Math.max(0, seq.length - 11);
  if (start > 0) html += '<span class="pn-tok more">…</span>';
  for (var i = start; i < seq.length; i++) {
    html += '<span class="pn-tok ' + (seq[i] ? 'ok' : 'no') + '">' + (seq[i] ? '✔' : '✕') + '</span>';
  }
  var total = (typeof max === 'number' && max > 0) ? max : 0;
  if (total) {
    for (var j = seq.length; j < Math.min(total, start + 11); j++) html += '<span class="pn-tok empty"></span>';
  }
  return html;
}
function pnBarsRender() {
  var seqMe = document.getElementById('pnSeqMe');
  var seqOpp = document.getElementById('pnSeqOpp');
  var nickMe = document.getElementById('pnNickMe');
  var nickOpp = document.getElementById('pnNickOpp');
  var scMe = document.getElementById('pnScMe');
  var scOpp = document.getElementById('pnScOpp');
  var barMe = document.getElementById('pnBarMe');
  var barOpp = document.getElementById('pnBarOpp');
  if (!seqMe || !seqOpp) return;
  var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
  var myName = me ? me.username : (T('pn.you') || 'أنت');
  if (pnInRoom() && pnRoom) {
    nickMe.textContent = myName;
    nickOpp.textContent = pnRoom.oppName || T('pn.opp');
    seqMe.innerHTML = pnBarTokens(pnRoom.myShots, Math.ceil(pnMaxRounds() / 2));
    seqOpp.innerHTML = pnBarTokens(pnRoom.oppShots, Math.floor(pnMaxRounds() / 2));
    scMe.textContent = String(pnRoom.myScore);
    scOpp.textContent = String(pnRoom.oppScore);
    var attacker = pnRoomAttackerSeat() === pnRoom.mySeat;
    var playing = Rooms.state.status === 'playing';
    if (barMe) barMe.classList.toggle('active', playing && attacker && !pnRoom.waiting);
    if (barOpp) barOpp.classList.toggle('active', playing && !attacker && !pnRoom.waiting);
  } else if (pnSolo) {
    nickMe.textContent = myName;
    nickOpp.textContent = T('rp.computer') || 'الحاسوب';
    seqMe.innerHTML = pnBarTokens(pnSolo.myShots, 0);
    seqOpp.innerHTML = pnBarTokens(pnSolo.aiSaves, 0);
    scMe.textContent = String(pnSolo.goals);
    scOpp.textContent = String(pnSolo.saves);
    if (barMe) barMe.classList.toggle('active', !pnBusy);
    if (barOpp) barOpp.classList.remove('active');
  }
}
/* ── شريط الدور/الحالة ── */
function pnTurnSet(text, kind) {
  var el = document.getElementById('pnTurn');
  if (!el) return;
  el.textContent = text;
  el.className = 'pn-turn' + (kind ? ' ' + kind : '');
}
function pnSoloIdleTurn() {
  pnTurnSet('⚽ ' + (T('pn.tapShoot') || 'المس منطقة أو اسحب ثم أفلت للتسديد'), 'shoot');
}
function pnRoomIdleTurn() {
  if (!pnRoom || !pnInRoom()) return;
  if (Rooms.state.status !== 'playing') {
    pnTurnSet('🛡️ ' + T('pn.roomWait'), 'wait');
    return;
  }
  var attacker = pnRoomAttackerSeat() === pnRoom.mySeat;
  var score = T('pn.you') + ' ' + pnRoom.myScore + ' : ' + pnRoom.oppScore + ' — ' + T('pn.round') + ' ' + pnRoom.round + '/' + pnMaxRounds();
  if (pnRoom.waiting) {
    pnTurnSet('⏳ ' + T('pn.roomWaiting') + (pnRoom.oppPicked ? ' — ' + T('pn.oppPicked') : '') + ' (' + score + ')', 'wait');
  } else if (attacker) {
    pnTurnSet('⚽ ' + T('pn.youShoot') + ' — ' + (T('pn.tapShoot') || '') + ' (' + score + ')', 'shoot');
  } else {
    pnTurnSet('🧤 ' + T('pn.youSave') + ' — ' + (T('pn.tapSave') || '') + ' (' + score + ')', 'save');
  }
}
function pnRoomUi() {
  pnRoomIdleTurn();
  pnBarsRender();
  pnTopRender();
}
/* ── أبعاد الطبقة: يضبط متغيرات الحجم لدوران اللاندسكيب بدقة بكسل ── */
function pnLayout() {
  var fs = document.getElementById('pnFs');
  if (!fs) return;
  var r = fs.getBoundingClientRect();
  if (r.height > 0) fs.style.setProperty('--pnH', r.height + 'px');
  if (r.width > 0) fs.style.setProperty('--pnW', r.width + 'px');
}
/* ── التصويب باللمس والسحب: down يبدأ، move يضيء المنطقة تحت الإصبع (elementFromPoint
   يتكفّل باختبار الإصابة عبر دوران اللاندسكيب)، up يطلق على المنطقة المضاءة ── */
function pnBindAim() {
  var pitch = document.getElementById('pnPitch');
  if (!pitch || pitch._aimBound) return;
  pitch._aimBound = true;
  var aimDir = null;
  var active = false;
  function zoneFromPoint(x, y) {
    var el = null;
    try { el = document.elementFromPoint(x, y); } catch (e) { return null; }
    if (!el || !el.closest) return null;
    var z = el.closest('.pnz');
    return z ? z.getAttribute('data-d') : null;
  }
  function highlight(d) {
    var f = penField();
    if (!f.zones) return;
    if (d === aimDir && !d) return;
    var prev = f.zones.querySelectorAll('.pnz.aim');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('aim');
    aimDir = d;
    if (d) {
      var z = f.zones.querySelector('[data-d="' + d + '"]');
      if (z) z.classList.add('aim');
    }
  }
  function clearWin() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  }
  function onMove(e) {
    if (!active) return;
    e.preventDefault();
    highlight(zoneFromPoint(e.clientX, e.clientY));
  }
  function onUp() {
    if (!active) return;
    active = false;
    clearWin();
    var d = aimDir;
    highlight(null);
    if (!d || pnBusy) return;
    if (pnInRoom() && (Rooms.state.status !== 'playing' || (pnRoom && pnRoom.waiting))) return;
    penShoot(d);
  }
  function onCancel() {
    active = false;
    clearWin();
    highlight(null);
  }
  pitch.addEventListener('pointerdown', function (e) {
    if (pnBusy) return;
    if (pnInRoom() && (Rooms.state.status !== 'playing' || (pnRoom && pnRoom.waiting) || !pnIAmActive())) return;
    var d = zoneFromPoint(e.clientX, e.clientY);
    if (!d) return;   /* التصويب يبدأ من فوق المرمى فقط — ثم يُسحب أو يُطلق */
    e.preventDefault();
    active = true;
    highlight(d);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: false });
    window.addEventListener('pointercancel', onCancel);
  }, { passive: false });
}
/* ── بناء واجهة اللعبة ── */
function ePenalty(g) {
  pnRoomReset();
  pnSolo = { myShots: [], aiSaves: [], goals: 0, saves: 0 };
  pnBusy = false;
  if (typeof Rooms !== 'undefined') {
    Rooms.setGameHandler(pnRoomMove);
    /* [v2.63] تحديثات الغرفة (انضمام متفرج، تغيّر الرهان/الحالة) تُحدّث الشريط
       العلوي وشريطي النتائج فوراً — كانت تُرسم مرة عند الفتح فقط */
    if (typeof Rooms.setUpdateHandler === 'function') {
      Rooms.setUpdateHandler(function () {
        pnTopRender();
        pnBarsRender();
        if (pnInRoom() && typeof pnRoom !== 'undefined' && pnRoom) pnRoomIdleTurn();
      });
    }
    Rooms.setStartHandler(function (room) {
      pnRoomReset();
      if (room && room.players) {
        var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
        var mine = room.players.find(function (p) { return p.id === (me && me.id); });
        var opp = room.players.find(function (p) { return p.id !== (me && me.id) && !p.spectate; });
        if (mine) pnRoom.mySeat = mine.seat;
        if (opp) pnRoom.oppName = opp.username;
      }
      pnRoomUi();
    });
  }
  var zones = PN_DIRS.map(function (d) {
    return '<button type="button" class="pnz" data-d="' + d + '" aria-label="' + pnLabel(d) + '" tabindex="-1"><span class="pnz-reticle" aria-hidden="true"></span></button>';
  }).join('');
  return '<div class="stage pn-stage" id="pnStage">' +
    '<div class="pn-fs" id="pnFs">' +
      '<div class="pn-wrap" id="pnWrap">' +
        /* أعلى الشاشة: متفرجون + مجموع رهان الجولة */
        '<div class="pn-top">' +
          '<div class="pn-specs" id="pnSpecs"></div>' +
          '<div class="pn-bet" id="pnBet"></div>' +
        '</div>' +
        /* الملعب: العشب يملأ الشاشة */
        '<div class="pn-pitch" id="pnPitch">' +
          '<div class="pn-turn" id="pnTurn">⚽</div>' +
          '<div class="pn-goalwrap">' +
            '<div class="pn-goal" id="pnGoal">' +
              '<div class="pn-net" aria-hidden="true"></div>' +
              '<div class="pn-rip" id="pnRipple" aria-hidden="true"></div>' +
              '<div class="pn-zones" id="pnZones">' + zones + '</div>' +
              '<span class="pn-post gl" aria-hidden="true"></span>' +
              '<span class="pn-post gr" aria-hidden="true"></span>' +
              '<span class="pn-cross" aria-hidden="true"></span>' +
              '<div class="pn-gk idle" id="pnKeeper">' +
                '<span class="pn-gk-head" aria-hidden="true"></span>' +
                '<span class="pn-gk-body" aria-hidden="true"></span>' +
                '<span class="pn-gk-arm la" aria-hidden="true"></span>' +
                '<span class="pn-gk-arm ra" aria-hidden="true"></span>' +
                '<span class="pn-gk-leg ll" aria-hidden="true"></span>' +
                '<span class="pn-gk-leg rl" aria-hidden="true"></span>' +
              '</div>' +
            '</div>' +
            /* خطوط منطقة الجزاء (طباشير) + قوس المنطقة + الكرة وعلامتها */
            '<div class="pn-box" aria-hidden="true"></div>' +
            '<div class="pn-arc" aria-hidden="true"></div>' +
            '<div class="pn-spot" id="pnSpot" aria-hidden="true"></div>' +
            '<span class="pn-ball" id="pnBall" aria-hidden="true">⚽</span>' +
          '</div>' +
          '<div class="pn-banner" id="pnBanner" aria-live="polite"></div>' +
        '</div>' +
        /* أسفل الشاشة: شريطا نتائج اللاعبين */
        '<div class="pn-bars">' +
          '<div class="pn-bar me active" id="pnBarMe">' +
            '<span class="pn-av me" aria-hidden="true"><i class="fa-solid fa-user"></i></span>' +
            '<span class="pn-nick" id="pnNickMe"></span>' +
            '<span class="pn-seq" id="pnSeqMe"></span>' +
            '<span class="pn-sc" id="pnScMe">0</span>' +
          '</div>' +
          '<div class="pn-bar opp" id="pnBarOpp">' +
            '<span class="pn-av opp" aria-hidden="true"><i class="fa-solid fa-robot"></i></span>' +
            '<span class="pn-nick" id="pnNickOpp"></span>' +
            '<span class="pn-seq" id="pnSeqOpp"></span>' +
            '<span class="pn-sc" id="pnScOpp">0</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}
/* ── تهيئة ما بعد الرسم: ربط التصويب + الأبعاد + الشريطان + الشريط العلوي ── */
function pnInit() {
  pnBindAim();
  pnLayout();
  pnSoloIdleTurn();
  pnBarsRender();
  pnTopRender();
  if (pnInRoom()) pnRoomUi();
}
/* هل أنا لاعب نشط (غير متفرج) في غرفة pn؟ */
function pnIAmActive() {
  var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
  if (!me || !pnInRoom()) return false;
  return (Rooms.state.players || []).some(function (p) { return p.id === me.id && !p.spectate; });
}
/* ── مدخل التسديد (فردي أو غرفة) ── */
function penShoot(d) {
  if (pnInRoom() && Rooms.state.status === 'playing' && pnIAmActive()) {
    pnRoomAct(d);
    return;
  }
  if (!pnInRoom()) penFire(d);
}
/* ── التسديدة الفردية: مجانية تعليمية — بلا خصم ولا أرباح ولا خانة رهان ── */
function penFire(d) {
  if (pnBusy) return;
  pnSetBusy(true);
  var f = penField();
  /* كشف حتمي باستدعاء _rng واحد — منطقة الحارس من 9 محسوبة قبل الحركة */
  var gk = PN_DIRS[Math.floor(_rng() * 9)];
  var win = gk !== d;
  pnTurnSet('🧤 ' + T('pn.saving'), 'wait');
  if (typeof SND.pnWhistle === 'function') { try { SND.pnWhistle(); } catch (e) {} }
  if (f.goal) f.goal.classList.add('tense');
  /* شحن الكرة لحظة قبل الركل */
  if (f.ball) {
    f.ball.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.22)' }
    ], { duration: 300, easing: 'ease-out' });
  }
  setTimeout(function () {
    if (typeof SND.pnKick === 'function') { try { SND.pnKick(); } catch (e) {} }
    if (f.goal) f.goal.classList.remove('tense');
    penFlyBall(d, function () {
      if (win) {
        if (f.fs) f.fs.classList.add('pn-goal');
        penRipple(d);
        penBanner('goal');
        if (typeof SND.pnGoal === 'function') { try { SND.pnGoal(); } catch (e) {} }
        if (typeof SND.pnNet === 'function') { try { SND.pnNet(); } catch (e) {} }
        if (typeof flashColor === 'function') flashColor('rgba(52, 211, 153, 0.42)');
        if (typeof shake === 'function' && f.pitch) shake(f.pitch, 7, 500);
        pnTurnSet('⚽ ' + T('pn.shot') + ': ' + pnLabel(d) + ' — ' + T('pn.keep') + ': ' + pnLabel(gk) + ' 🥅 ' + T('pn.goal'), 'goal');
        pnSolo.myShots.push(true);
        pnSolo.aiSaves.push(false);
        pnSolo.goals++;
      } else {
        if (f.fs) f.fs.classList.add('pn-saved');
        penBanner('saved');
        if (typeof SND.pnSave === 'function') { try { SND.pnSave(); } catch (e) {} }
        if (typeof flashColor === 'function') flashColor('rgba(244, 63, 94, 0.34)');
        if (typeof shake === 'function' && f.pitch) shake(f.pitch, 5, 380);
        pnTurnSet('⚽ ' + T('pn.shot') + ': ' + pnLabel(d) + ' — ' + T('pn.keep') + ': ' + pnLabel(gk) + ' 🙌 ' + T('pn.save'), 'save');
        pnSolo.myShots.push(false);
        pnSolo.aiSaves.push(true);
        pnSolo.saves++;
      }
      pnBarsRender();
      setTimeout(function () {
        penResetField();
        pnSetBusy(false);
        pnSoloIdleTurn();
      }, 2200);
    });
    /* الحارس يغوص بالتوازي — يسبق وصول الكرة قليلاً كالمباراة الحقيقية */
    setTimeout(function () { penMoveKeeper(gk); }, 240);
  }, 460);
}
/* ── Penalty وضع الغرفة (اختيار أعمى متزامن — يكشف الخادم الزوج معاً) ── */
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
        if (String(p.id) !== myId && !p.spectate) oppId = String(p.id);
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
  /* سجل الشريطين: نتيجة المهاجم (هدف=✔) ونظيرها عند الخصم */
  if (attacker) pnRoom.myShots.push(!!goal);
  else pnRoom.oppShots.push(!!goal);
  var f = penField();
  pnTurnSet('⏳ ' + T('pn.shot') + ': ' + pnLabel(pnRoom.shootD) + ' — ' + T('pn.keep') + ': ' + pnLabel(pnRoom.saveD), 'wait');
  if (typeof SND.pnWhistle === 'function') { try { SND.pnWhistle(); } catch (e) {} }
  setTimeout(function () {
    if (typeof SND.pnKick === 'function') { try { SND.pnKick(); } catch (e) {} }
    penFlyBall(pnRoom.shootD, function () {
      if (goal) {
        if (f.fs) f.fs.classList.add('pn-goal');
        penRipple(pnRoom.shootD);
        penBanner('goal');
        if (typeof SND.pnGoal === 'function') { try { SND.pnGoal(); } catch (e) {} }
        if (typeof SND.pnNet === 'function') { try { SND.pnNet(); } catch (e) {} }
        if (typeof flashColor === 'function') flashColor('rgba(52, 211, 153, 0.42)');
        if (typeof shake === 'function' && f.pitch) shake(f.pitch, 7, 500);
        pnTurnSet('⚽ ' + T('pn.shot') + ': ' + pnLabel(pnRoom.shootD) + ' — ' + T('pn.keep') + ': ' + pnLabel(pnRoom.saveD) + ' 🥅 ' + T('pn.goal'), 'goal');
      } else {
        if (f.fs) f.fs.classList.add('pn-saved');
        penBanner('saved');
        if (typeof SND.pnSave === 'function') { try { SND.pnSave(); } catch (e) {} }
        if (typeof flashColor === 'function') flashColor('rgba(244, 63, 94, 0.34)');
        if (typeof shake === 'function' && f.pitch) shake(f.pitch, 5, 380);
        pnTurnSet('⚽ ' + T('pn.shot') + ': ' + pnLabel(pnRoom.shootD) + ' — ' + T('pn.keep') + ': ' + pnLabel(pnRoom.saveD) + ' 🙌 ' + T('pn.save'), 'save');
      }
      pnBarsRender();
      /* نتيجة المباراة إن انتهت */
      var finishMatch = pnRoom.round >= pnMaxRounds();
      if (finishMatch) {
        var finalTxt = '';
        if (pnRoom.myScore > pnRoom.oppScore) finalTxt = '🏆 ' + T('pn.matchWin') + ' ' + pnRoom.myScore + ':' + pnRoom.oppScore + '!';
        else if (pnRoom.oppScore > pnRoom.myScore) finalTxt = T('pn.matchLose') + ' ' + pnRoom.myScore + ':' + pnRoom.oppScore;
        else finalTxt = '🤝 ' + T('pn.matchTie') + ' ' + pnRoom.myScore + ':' + pnRoom.oppScore;
        pnTurnSet(finalTxt + ' — (' + T('pn.again') + ')', pnRoom.myScore > pnRoom.oppScore ? 'goal' : 'save');
        /* [RoomSettle] الرهان وجهاً لوجه: المضيف فقط يوزّع القدح (الخصم تم عند البدء) */
        if (typeof Rooms !== 'undefined' && Rooms.roomSettle) {
          var s0 = (pnRoom.mySeat === 0) ? pnRoom.myScore : pnRoom.oppScore;
          var s1 = (pnRoom.mySeat === 0) ? pnRoom.oppScore : pnRoom.myScore;
          try { Rooms.roomSettle(s0 > s1 ? 'w0' : (s1 > s0 ? 'w1' : 'draw')); } catch (e) {}
        }
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
    setTimeout(function () { penMoveKeeper(pnRoom.saveD); }, 240);
  }, 460);
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
