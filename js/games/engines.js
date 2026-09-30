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

/* ═══════════ 11. Penalty — v2.64 إعادة بناء شاملة ═══════════ */
/* [v2.64 REBUILD] وفق مواصفة المالك:
   • الجولة = 3–9 تسديدات لكل لاعب (مسدد/متصدي) تُختار وتُحدد قبل بدء الجولة
     من إعدادات الغرفة — وعند التعادل تضاف تسديدة لكل لاعب (موت فجائي)
     حتى يُكسر التعادل ويفوز أحد اللاعبين (لا تعادل نهائي أبداً).
   • نظام الغرفة = نفس نظام التصويت وانتقال الأدوار (لاعب-متفرج) للبلياردو:
     عند نهاية المباراة يفتح المضيف تصويت «مباراة جديدة» (60ث) — الموافقون
     لاعبون والباقون متفرجون، والخادم يعيد إطلاق المباراة عبر startHandler.
   • بلا أي عبارات مكتوبة أعلى الشاشة (بورتريه) / يمين الشاشة (لاندسكيب):
     أعلى = حلقات المتفرجين (أيقونات فقط) + رقاقة القدح (أيقونة + رقم).
   • أيقونات اللاعبين = حلقة بداخلها أول حرفين من اسم المستخدم بلا عبارات.
   • بورتريه: المرمى في وسط الشاشة تماماً من الحد الأيمن للأيسر (9 مناطق).
   • لاندسكيب (هاتف لمسي): تخطيط أصلي — القائمان عموديان يلتقيان بالحدّين
     الأعلى/الأسفل والعارضة ملتصقة بالحد الأعلى، شريطا النتائج عمودان
     جانبيان بمحتوى مستقيم الاتجاه، والكرة أسفل الوسط تصعد إلى المنطقة.
   • الحركة (كرة/حارس) بحساب getBoundingClientRect الصافي — دقة بكسل
     للمنطقة المحددة في الوضعين (لا تحويلات على الأسلاف إطلاقاً).
   • [v2.64-fix] فئات وميض النتيجة pn-fx-goal/pn-fx-saved منفصلة عن
     .pn-goal (عنصر المرمى) — كانت collide فتنهار طبقة ملء الشاشة إلى
     أعلى الشاشة عند كل هدف/إضاعة (خلل «اختفاء 70% من الأرضية»).
   • اللعب ضد الحاسوب مجاني تعليمي — الرهان في الغرف فقط (تسوية القدح
     عند نهاية المباراة: الفائز يأخذ الرهانين بعد رسم 5%). */
var pnRoom = null;
var pnSolo = null;
var pnBusy = false;
/* ترتيب المناطق: أعلى-يسار، أعلى، أعلى-يمين، يسار-وسط، وسط، يمين-وسط، أسفل-يسار، أسفل، أسفل-يمين */
const PN_DIRS = ['↖️', '⬆️', '↗️', '⬅️', '🎯', '➡️', '↙️', '⬇️', '↘️'];
/* عدد التسديدات لكل لاعب: 3–9 تُحدد قبل الجولة (إعدادات الغرفة) — فردي: 5 */
function pnShotsPer() {
  var n = (window.HTH_ROUNDS && window.HTH_ROUNDS.pn) || (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.game_opts && Rooms.state.game_opts.rounds) || 5;
  n = parseInt(n, 10);
  if (isNaN(n)) n = 5;
  return Math.max(3, Math.min(9, n));
}
function pnSetBusy(b) {
  pnBusy = b;
  var fs = document.getElementById('pnFs');
  if (fs) fs.classList.toggle('busy', !!b);
}
function pnRoomReset() {
  pnRoom = { shot: 1, mySeat: null, myDir: null, waiting: false, oppPicked: false, seatGoals: [0, 0], seatShots: [[], []], shootD: null, saveD: null, over: false };
}
/* المهاجم بالتسديدة رقم k: المقعد 0 بالفردية والمقعد 1 بالزوجية (تبادل مسدد/متصدي) */
function pnAttackerSeat(shot) {
  return (shot % 2 === 1) ? 0 : 1;
}
function pnInRoom() {
  return !!(typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.game_id === 'pn');
}
function pnIAmActive() {
  var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
  if (!me || !pnInRoom()) return false;
  return (Rooms.state.players || []).some(function (p) { return p.id === me.id && !p.spectate; });
}
function pnMySeat() {
  var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
  if (!me || !pnInRoom()) return null;
  var mine = (Rooms.state.players || []).find(function (p) { return p.id === me.id && !p.spectate; });
  return mine ? mine.seat : null;
}
/* أسماء أصحاب المقعدَين (للحلقات) — متفرج يرى اسمَي اللاعبَين الفعليين */
function pnSeatNames() {
  if (pnInRoom() && Rooms.state) {
    var ps = (Rooms.state.players || []).filter(function (p) { return !p.spectate; });
    var n0 = '', n1 = '';
    ps.forEach(function (p) { if (p.seat === 0) n0 = p.username; else if (p.seat === 1) n1 = p.username; });
    return [n0, n1];
  }
  var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
  return [me ? me.username : '', 'AI'];
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
    rematch: document.getElementById('pnRematch'),
    replay: document.getElementById('pnReplay')
  };
}
/* أول حرفين من اسم المستخدم (يعمل مع العربية أيضاً) */
function pnInitials(name) {
  var s = String(name || '').trim().replace(/\s+/g, ' ');
  if (!s) return '?';
  return s.slice(0, 2);
}
function pnRingHtml(cls, initials, title) {
  return '<span class="pn-ring ' + (cls || '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '><b>' + esc(initials) + '</b></span>';
}
/* ── نهاية المباراة: جُعبت كل التسديدات المسموحة لكل لاعب (زوجية مكتملة)
   والنتيجتان مختلفتان → فائز؛ التعادل بعد الجُعبة → موت فجائي (تستمر) ── */
function pnCheckOver(st) {
  var done = st.shot - 1;                       /* التسديدات المكتملة */
  var per = pnShotsPer();
  return done >= per * 2 && done % 2 === 0 && st.seatGoals[0] !== st.seatGoals[1];
}
function pnSuddenDeath(st) {
  return st.shot - 1 > pnShotsPer() * 2;
}
/* ═══ الحركة الدقيقة: كل القياسات بالمستطيلات الصافية (بلا تحويلات أسلاف) ═══ */
function pnZoneCenter(d) {
  var f = penField();
  if (!f.zones) return null;
  var z = f.zones.querySelector('[data-d="' + d + '"]');
  if (!z) return null;
  var r = z.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function pnStopAnims(el) {
  if (!el) return;
  try { el.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {}
}
/* طيران قوسي للكرة من موضعها الحالي إلى مركز المنطقة المحددة — دقة بكسل */
function penFlyBall(d, done) {
  var f = penField();
  if (!f.ball) { if (done) done(); return; }
  pnStopAnims(f.ball);
  f.ball.classList.remove('flying');
  var br = f.ball.getBoundingClientRect();
  var t = pnZoneCenter(d);
  if (!t) { if (done) done(); return; }
  var dx = t.x - (br.left + br.width / 2);
  var dy = t.y - (br.top + br.height / 2);
  var ball = f.ball;
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
/* غوص الحارس من موقعه الحالي إلى مركز المنطقة المحددة — اندفاع + دوران + تمدد */
function penMoveKeeper(d) {
  var f = penField();
  if (!f.keeper) return;
  f.keeper.classList.remove('idle');
  f.keeper.classList.add('diving');
  pnStopAnims(f.keeper);
  f.keeper.style.transform = '';
  var kr = f.keeper.getBoundingClientRect();
  var t = pnZoneCenter(d);
  if (!t) return;
  var dx = t.x - (kr.left + kr.width / 2);
  var dy = t.y - (kr.top + kr.height / 2);
  var rot = dx < -18 ? -52 : dx > 18 ? 52 : 0;
  var stretch = dy < -16 ? ' scaleY(1.18)' : ' scaleY(1.07)';
  var anim = f.keeper.animate([
    { transform: 'translate(0px, 0px) rotate(0deg) scaleY(1)' },
    { transform: 'translate(' + dx + 'px, ' + dy + 'px) rotate(' + rot + 'deg)' + stretch }
  ], { duration: 470, easing: 'cubic-bezier(0.2, 0.85, 0.3, 1)', fill: 'forwards' });
  if (!anim || anim.onfinish === undefined) {
    f.keeper.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) rotate(' + rot + 'deg)' + stretch;
  }
}
/* [v2.64] لافتة النتيجة: هدف/تصدي أثناء اللعب — 🏆/😞 عند نهاية المباراة (أيقونات بلا عبارات) */
function penBanner(kind) {
  var f = penField();
  if (!f.banner) return;
  f.banner.classList.remove('show', 'goal', 'saved', 'win', 'lose');
  void f.banner.offsetWidth;
  if (kind === 'goal') f.banner.textContent = '🥅 ' + T('pn.goal');
  else if (kind === 'saved') f.banner.textContent = '🙌 ' + T('pn.save');
  else if (kind === 'win') f.banner.textContent = '🏆';
  else if (kind === 'lose') f.banner.textContent = '😞';
  else return;
  f.banner.classList.add('show', kind);
}
/* تموّج الشبكة عند الهدف — مركز الموجة عند منطقة الإصابة (قياس مستطيلي) */
function penRipple(d) {
  var f = penField();
  if (!f.ripple || !f.goal) return;
  var t = pnZoneCenter(d);
  if (!t) return;
  var gr = f.goal.getBoundingClientRect();
  f.ripple.style.left = (t.x - gr.left) + 'px';
  f.ripple.style.top = (t.y - gr.top) + 'px';
  f.ripple.classList.remove('wave');
  void f.ripple.offsetWidth;
  f.ripple.classList.add('wave');
}
function penResetField() {
  var f = penField();
  if (f.ball) {
    pnStopAnims(f.ball);
    f.ball.classList.remove('flying');
    f.ball.style.transform = '';
  }
  if (f.keeper) {
    pnStopAnims(f.keeper);
    f.keeper.style.transform = '';
    f.keeper.classList.remove('diving');
    f.keeper.classList.add('idle');
  }
  if (f.fs) f.fs.classList.remove('pn-fx-goal', 'pn-fx-saved');
  if (f.goal) f.goal.classList.remove('tense');
  if (f.banner) f.banner.classList.remove('show', 'goal', 'saved', 'win', 'lose');
  if (f.ripple) f.ripple.classList.remove('wave');
  if (f.zones) {
    var z = f.zones.querySelectorAll('.pnz.aim');
    for (var i = 0; i < z.length; i++) z[i].classList.remove('aim');
  }
}
/* ═══ سينما التسديدة المشتركة (فردي + غرفة + متفرجون)
   onOutcome: تُستدعى لحظة ظهور النتيجة (تسجيل ✔/✕ فوراً مع اللافتة)
   onDone: تُستدعى بعد إعادة ضبط الملعب (جولة اللعب التالية) ═══ */
function pnPlayShot(shootD, saveD, goal, onOutcome, onDone) {
  var f = penField();
  if (typeof SND.pnWhistle === 'function') { try { SND.pnWhistle(); } catch (e) {} }
  if (f.goal) f.goal.classList.add('tense');
  if (f.ball) {
    f.ball.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.22)' }
    ], { duration: 300, easing: 'ease-out' });
  }
  setTimeout(function () {
    if (typeof SND.pnKick === 'function') { try { SND.pnKick(); } catch (e) {} }
    if (f.goal) f.goal.classList.remove('tense');
    penFlyBall(shootD, function () {
      if (goal) {
        if (f.fs) f.fs.classList.add('pn-fx-goal');
        penRipple(shootD);
        penBanner('goal');
        if (typeof SND.pnGoal === 'function') { try { SND.pnGoal(); } catch (e) {} }
        if (typeof SND.pnNet === 'function') { try { SND.pnNet(); } catch (e) {} }
        if (typeof flashColor === 'function') flashColor('rgba(52, 211, 153, 0.42)');
        if (typeof shake === 'function' && f.pitch) shake(f.pitch, 7, 500);
      } else {
        if (f.fs) f.fs.classList.add('pn-fx-saved');
        penBanner('saved');
        if (typeof SND.pnSave === 'function') { try { SND.pnSave(); } catch (e) {} }
        if (typeof flashColor === 'function') flashColor('rgba(244, 63, 94, 0.34)');
        if (typeof shake === 'function' && f.pitch) shake(f.pitch, 5, 380);
      }
      if (onOutcome) onOutcome();
      setTimeout(function () {
        penResetField();
        if (onDone) onDone();
      }, 2000);
    });
    setTimeout(function () { penMoveKeeper(saveD); }, 240);
  }, 460);
}
/* ═══ الشريط العلوي: حلقات المتفرجين (يسار) + رقاقة القدح (يمين) — بلا عبارات ═══ */
function pnTopRender() {
  var specEl = document.getElementById('pnSpecs');
  var betEl = document.getElementById('pnBet');
  if (!specEl || !betEl) return;
  if (pnInRoom() && Rooms.state) {
    var specs = (Rooms.state.players || []).filter(function (p) { return p.spectate; });
    var html = '';
    var shown = specs.slice(0, 5);
    for (var i = 0; i < shown.length; i++) {
      html += pnRingHtml('spec', pnInitials(shown[i].username), shown[i].username);
    }
    if (specs.length > 5) html += '<span class="pn-ring spec more">+' + (specs.length - 5) + '</span>';
    specEl.innerHTML = html;
    specEl.style.display = specs.length ? 'flex' : 'none';
    var bet = Number(Rooms.state.bet) || 0;
    var pot = bet * 2;
    betEl.innerHTML = '<i class="fa-solid fa-coins" aria-hidden="true"></i> <b>' + fmt(pot) + '</b>';
    betEl.style.display = 'flex';
    betEl.className = 'pn-bet room';
  } else {
    specEl.innerHTML = '';
    specEl.style.display = 'none';
    betEl.innerHTML = '';
    betEl.style.display = 'none';
    betEl.className = 'pn-bet';
  }
}
/* ═══ جانبا النتائج: حلقة الحرفين + علامات ✔/✕ + النتيجة ═══ */
function pnTokens(seq, per, sudden) {
  var html = '';
  var total = Math.max(per, seq.length);
  var start = Math.max(0, total - 11);
  if (start > 0) html += '<span class="pn-tok more">…</span>';
  for (var i = start; i < total; i++) {
    if (i < seq.length) html += '<span class="pn-tok ' + (seq[i] ? 'ok' : 'no') + '">' + (seq[i] ? '✔' : '✕') + '</span>';
    else html += '<span class="pn-tok empty"></span>';
  }
  if (sudden && seq.length >= per) html += '<span class="pn-tok sd">⚡</span>';
  return html;
}
function pnBarsRender() {
  var f0 = document.getElementById('pnSeq0'), f1 = document.getElementById('pnSeq1');
  if (!f0 || !f1) return;
  var i0 = document.getElementById('pnIni0'), i1 = document.getElementById('pnIni1');
  var s0 = document.getElementById('pnSc0'), s1 = document.getElementById('pnSc1');
  var side0 = document.getElementById('pnSide0'), side1 = document.getElementById('pnSide1');
  var names = pnSeatNames();
  var per = pnShotsPer();
  var st = pnInRoom() ? pnRoom : pnSolo;
  if (!st) return;
  if (i0) i0.textContent = pnInitials(names[0]);
  if (i1) i1.textContent = pnInitials(names[1]);
  f0.innerHTML = pnTokens(st.seatShots[0], per, pnSuddenDeath(st));
  f1.innerHTML = pnTokens(st.seatShots[1], per, pnSuddenDeath(st));
  if (s0) s0.textContent = String(st.seatGoals[0]);
  if (s1) s1.textContent = String(st.seatGoals[1]);
  /* أهلية اللعب: فردي = أنا دائماً؛ غرفة = لاعب نشط والجولة جارية ولم تنتهِ */
  var canAct = pnSolo ? true : (pnInRoom() && Rooms.state.status === 'playing' && pnIAmActive() && pnRoom && !pnRoom.over);
  /* شارات الدور ⚽/🧤/⏳ على جانبَي المقعدَين */
  var atk = pnAttackerSeat(st.shot);
  var role0 = '', role1 = '';
  if (!st.over) {
    if (st === pnRoom && Rooms.state.status !== 'playing') { role0 = '⏳'; role1 = '⏳'; }
    else {
      role0 = atk === 0 ? '⚽' : '🧤';
      role1 = atk === 1 ? '⚽' : '🧤';
      /* غرفة: من لم يختر بعد بعد اختياري → ⏳ عنده */
      if (st === pnRoom && pnRoom.waiting && pnMySeat() !== null) {
        var oppSeat = 1 - pnMySeat();
        if (oppSeat === 0) role0 = '⏳';
        if (oppSeat === 1) role1 = '⏳';
      }
    }
  }
  var r0 = document.getElementById('pnRole0'), r1 = document.getElementById('pnRole1');
  if (r0) r0.textContent = role0;
  if (r1) r1.textContent = role1;
  var isSpec = pnInRoom() && !pnIAmActive();
  var mySeat = pnMySeat();
  var activeGlow = !st.over && (pnSolo ? !pnBusy : (Rooms.state.status === 'playing' && !(st === pnRoom && st.waiting)));
  if (side0) side0.classList.toggle('active', activeGlow && atk === 0);
  if (side1) side1.classList.toggle('active', activeGlow && atk === 1);
  if (side0) side0.classList.toggle('mine', !isSpec && mySeat === 0);
  if (side1) side1.classList.toggle('mine', !isSpec && mySeat === 1);
}
function pnRoomUi() {
  pnBarsRender();
  pnTopRender();
  pnRematchRender();
}
/* ═══ التصويب باللمس/السحب: down يبدأ، move يضيء المنطقة تحت الإصبع، up يطلق ═══ */
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
    penShoot(d);
  }
  function onCancel() {
    active = false;
    clearWin();
    highlight(null);
  }
  pitch.addEventListener('pointerdown', function (e) {
    if (pnBusy) return;
    if (pnInRoom()) {
      if (Rooms.state.status !== 'playing' || (pnRoom && (pnRoom.waiting || pnRoom.over)) || !pnIAmActive()) return;
    } else if (!pnSolo || pnSolo.over) return;
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
  if (pnBusy || !pnSolo || pnSolo.over) return;
  pnSetBusy(true);
  var atk = pnAttackerSeat(pnSolo.shot);   /* فردي: المقعد 0 = أنا */
  var aiD = PN_DIRS[Math.floor(_rng() * 9)];
  var shootD = (atk === 0) ? d : aiD;
  var saveD = (atk === 0) ? aiD : d;
  var goal = shootD !== saveD;
  pnPlayShot(shootD, saveD, goal, function () {
    /* النتيجة تُسجّل فور ظهور اللافتة — العلامة تظهر في الشريط لحظياً */
    pnSolo.seatShots[atk].push(goal);
    if (goal) pnSolo.seatGoals[atk]++;
    pnSolo.shot++;
    pnBarsRender();
  }, function () {
    if (pnCheckOver(pnSolo)) { pnSoloEnd(); return; }
    pnSetBusy(false);
    pnBarsRender();
  });
}
function pnSoloEnd() {
  pnSolo.over = true;
  pnSetBusy(true);
  var winSeat = pnSolo.seatGoals[0] > pnSolo.seatGoals[1] ? 0 : 1;
  var iWon = winSeat === 0;
  penBanner(iWon ? 'win' : 'lose');
  if (iWon) {
    if (typeof SND.rpsWin === 'function') { try { SND.rpsWin(); } catch (e) {} }
    if (typeof flashColor === 'function') flashColor('rgba(52, 211, 153, 0.4)');
  } else {
    if (typeof SND.rpsLose === 'function') { try { SND.rpsLose(); } catch (e) {} }
  }
  var f = penField();
  if (f.replay) f.replay.hidden = false;
  pnBarsRender();
}
function pnSoloRestart() {
  pnSolo = { shot: 1, seatGoals: [0, 0], seatShots: [[], []], over: false };
  pnSetBusy(false);
  penResetField();
  var f = penField();
  if (f.replay) f.replay.hidden = true;
  pnBarsRender();
}
/* ── Penalty وضع الغرفة (اختيار أعمى متزامن — يكشف الخادم الزوج معاً) ── */
function pnRoomAct(d) {
  /* [v2.64-hardening] pnBusy يقفل أثناء سينما النتيجة — لا يُقبل اختيار
     مبكر يتسرّب للخادم ويزاوج أزواجاً من تسديدات مختلفة */
  if (!pnRoom || pnRoom.waiting || pnRoom.over || pnBusy) return;
  SND.click();
  pnRoom.myDir = d;
  pnRoom.waiting = true;
  pnSetBusy(true);
  Rooms.sendBlind({ d: d });
  pnBarsRender();
}
function pnRoomMove(d) {
  if (!pnRoom) return;
  if (d.action === 'blind') {
    pnRoom.oppPicked = true;
    pnBarsRender();
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
    var attacker = pnAttackerSeat(pnRoom.shot);
    var mySeat = pnMySeat();
    if (mySeat === attacker) { pnRoom.shootD = myD; pnRoom.saveD = oppD; }
    else { pnRoom.shootD = oppD; pnRoom.saveD = myD; }
    pnRoom.waiting = false;
    pnRoom.oppPicked = false;
    pnRoomSettle();
  }
}
function pnRoomSettle() {
  if (!pnRoom) return;
  var goal = pnRoom.shootD !== pnRoom.saveD;
  var atk = pnAttackerSeat(pnRoom.shot);
  pnPlayShot(pnRoom.shootD, pnRoom.saveD, goal, function () {
    /* النتيجة تُسجّل فور ظهور اللافتة عند الجميع (لاعبين + متفرجين) */
    pnRoom.seatShots[atk].push(goal);
    if (goal) pnRoom.seatGoals[atk]++;
    pnRoom.shot++;
    pnRoom.waiting = false;
    pnRoom.myDir = null;
    pnRoom.shootD = null;
    pnRoom.saveD = null;
    pnRoom.oppPicked = false;
    pnBarsRender();
  }, function () {
    if (pnCheckOver(pnRoom)) { pnMatchEnd(); return; }
    pnSetBusy(false);
    pnRoomUi();
  });
}
/* ═══ نهاية مباراة الغرفة: تسوية القدح + فتح تصويت المباراة الجديدة (نظام البلياردو) ═══ */
function pnMatchEnd() {
  pnRoom.over = true;
  pnSetBusy(true);
  var g0 = pnRoom.seatGoals[0], g1 = pnRoom.seatGoals[1];
  var winSeat = (g0 > g1) ? 0 : 1;
  var mySeat = pnMySeat();
  var iWon = (mySeat === winSeat);
  penBanner(iWon === false ? 'lose' : 'win');
  if (typeof flashColor === 'function') flashColor(iWon ? 'rgba(52, 211, 153, 0.4)' : 'rgba(244, 63, 94, 0.32)');
  if (typeof SND.rpsWin === 'function') { try { SND[iWon ? 'rpsWin' : 'rpsLose'](); } catch (e) {} }
  var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
  var isOwner = Rooms.state && me && Rooms.state.owner_id === me.id;
  /* [v2.69·آلي] أي لاعب نشط يوزّع القدح — الخادم يقبل الأول ويمنع التكرار
     (كان المضيف حصراً فتموت التسوية بغيابه) */
  if (typeof Rooms.roomSettle === 'function') {
    try { Rooms.roomSettle(winSeat === 0 ? 'w0' : 'w1'); } catch (e) {}
  }
  /* [Rematch-vote] فتح تصويت المباراة الجديدة فور النهاية — نفس نظام البلياردو:
     الموافقون (≥2 ويحويهم المالك) يبدؤون مباراة جديدة، الباقون متفرجون */
  if (isOwner && typeof Rooms.startRematch === 'function') {
    try { Rooms.startRematch(); } catch (e) {}
  }
  pnRematchRender();
  pnBarsRender();
}
/* ═══ لوحة تصويت المباراة الجديدة (لاعب-متفرج — انتقال الأدوار بالتصويت) ═══ */
function pnRematchRender() {
  var host = document.getElementById('pnRematch');
  if (!host) return;
  try { if (window._pnRmTi) { clearInterval(window._pnRmTi); window._pnRmTi = null; } } catch (e) {}
  var inRoom = pnInRoom() && Rooms.state;
  if (!inRoom) { host.hidden = true; host.innerHTML = ''; return; }
  var rm = Rooms.state.rematch;
  var me = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
  var myId = me ? String(me.id) : null;
  if (!rm) {
    if (pnRoom && pnRoom.over && Rooms.state.status !== 'playing') {
      host.hidden = false;
      host.innerHTML = '<div class="pn-rm-box"><span class="pn-rm-ico">⏳</span></div>';
    } else { host.hidden = true; host.innerHTML = ''; }
    return;
  }
  if (rm.resolved && !rm.rematch) {
    host.hidden = false;
    host.innerHTML = '<div class="pn-rm-box"><span class="pn-rm-ico">🚫</span><div class="pn-rm-note">' + esc(T('pn.rematchNo')) + '</div></div>';
    return;
  }
  if (rm.resolved && rm.rematch) {
    host.hidden = false;
    host.innerHTML = '<div class="pn-rm-box"><span class="pn-rm-ico">▶️</span></div>';
    return;
  }
  /* تصويت نشط: صفوف المشاركين (حلقة + علامة الصوت) + أزرار + عدّاد
     [v2.64-fix] معرّفات المشاركين تُوحَّد نصياً — الخادم يرسلها أرقاماً
     بينما me.id يُقارن نصياً فكان indexOf يفشل ويحجب أزرار التصويت */
  var rows = '';
  var parts = (rm.participants || []).map(String);
  for (var i = 0; i < parts.length; i++) {
    var pid = parts[i];
    var v = rm.votes ? rm.votes[pid] : null;
    var name = (rm.names && rm.names[pid]) ? rm.names[pid] : ('#' + pid);
    var mark = (v === 'agree') ? '✅' : (v === 'refuse') ? '❌' : '⏳';
    rows += '<div class="pn-rm-row">' + pnRingHtml('', pnInitials(name), name) + '<span class="pn-rm-mark">' + mark + '</span></div>';
  }
  var myVote = rm.votes ? rm.votes[myId] : null;
  var isParticipant = (parts.indexOf(myId) !== -1);
  var actions = '';
  if (isParticipant && !myVote) {
    actions = '<button type="button" class="pn-rm-btn yes" onclick="Rooms.voteRematch(\'agree\')">✅ ' + esc(T('pn.rematchAgree')) + '</button>' +
      '<button type="button" class="pn-rm-btn no" onclick="Rooms.voteRematch(\'refuse\')">❌ ' + esc(T('pn.rematchRefuse')) + '</button>';
  } else if (isParticipant && myVote) {
    actions = '<div class="pn-rm-note">' + esc(T('pn.rematchVoted')) + '</div>';
  } else {
    actions = '<div class="pn-rm-note">' + esc(T('pn.rematchWaitVotes')) + '</div>';
  }
  var remain = rm.ts ? Math.max(0, 60 - Math.floor((Date.now() - rm.ts) / 1000)) : 60;
  host.hidden = false;
  host.innerHTML = '<div class="pn-rm-box">' +
    '<div class="pn-rm-title">🔁 ' + esc(T('pn.rematchTitle')) + '</div>' +
    '<div class="pn-rm-rows">' + rows + '</div>' +
    '<div class="pn-rm-actions">' + actions + '</div>' +
    '<div class="pn-rm-timer">⏱ <span id="pnRmTimerN">' + remain + '</span></div>' +
    '</div>';
  if (rm.ts) {
    var ts = rm.ts;
    window._pnRmTi = setInterval(function () {
      var r = Math.max(0, 60 - Math.floor((Date.now() - ts) / 1000));
      var el = document.getElementById('pnRmTimerN');
      if (el) el.textContent = String(r);
      if (r <= 0) { try { clearInterval(window._pnRmTi); } catch (e) {} window._pnRmTi = null; }
    }, 1000);
  }
}
/* ── بناء واجهة اللعبة ── */
function ePenalty(g) {
  pnRoomReset();
  pnSolo = null;
  pnBusy = false;
  if (typeof Rooms !== 'undefined') {
    Rooms.setGameHandler(pnRoomMove);
    /* [v2.64] تحديثات الغرفة (أصوات، انضمام متفرج، تغيّر الرهان/الحالة)
       تُحدّث الشرائط ولوحة التصويت فوراً */
    if (typeof Rooms.setUpdateHandler === 'function') {
      Rooms.setUpdateHandler(function () {
        pnTopRender();
        pnBarsRender();
        pnRematchRender();
      });
    }
    Rooms.setStartHandler(function (room) {
      /* مباراة جديدة (تصويت موافق أو بدء أول): مقاعد جديدة + حالة نظيفة */
      pnRoomReset();
      pnSolo = null;
      pnSetBusy(false);
      penResetField();
      var f = penField();
      if (f.rematch) { f.rematch.hidden = true; f.rematch.innerHTML = ''; }
      if (f.replay) f.replay.hidden = true;
      pnRoomUi();
    });
  }
  var zones = PN_DIRS.map(function (d) {
    return '<button type="button" class="pnz" data-d="' + d + '" tabindex="-1" aria-label="zone"><span class="pnz-reticle" aria-hidden="true"></span></button>';
  }).join('');
  var side = function (n) {
    return '<div class="pn-side s' + n + '" id="pnSide' + n + '">' +
      '<span class="pn-ring"><b id="pnIni' + n + '"></b></span>' +
      '<i class="pn-role" id="pnRole' + n + '"></i>' +
      '<span class="pn-seq" id="pnSeq' + n + '"></span>' +
      '<b class="pn-sc" id="pnSc' + n + '">0</b>' +
      '</div>';
  };
  return '<div class="stage pn-stage" id="pnStage">' +
    '<div class="pn-fs" id="pnFs">' +
      '<div class="pn-wrap">' +
        /* أعلى: حلقات المتفرجين + رقاقة القدح (أيقونات بلا عبارات) */
        '<div class="pn-top">' +
          '<div class="pn-specs" id="pnSpecs"></div>' +
          '<div class="pn-bet" id="pnBet"></div>' +
        '</div>' +
        '<div class="pn-mid">' +
          side(0) +
          '<div class="pn-pitch" id="pnPitch">' +
            '<div class="pn-goalwrap">' +
              '<div class="pn-gz">' +
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
                /* خطوط منطقة الجزاء (طباشير) تحت المرمى — بورتريه فقط */
                '<div class="pn-box" aria-hidden="true"></div>' +
                '<div class="pn-arc" aria-hidden="true"></div>' +
              '</div>' +
            '</div>' +
            /* علامة الجزاء + الكرة أسفل الملعب أمام المرمى (الوضعان) */
            '<span class="pn-spot" id="pnSpot" aria-hidden="true"></span>' +
            '<span class="pn-ball" id="pnBall" aria-hidden="true">⚽</span>' +
            '<div class="pn-banner" id="pnBanner" aria-live="polite"></div>' +
            '<button type="button" class="pn-replay" id="pnReplay" hidden>🔄</button>' +
            '<div class="pn-rematch" id="pnRematch" hidden></div>' +
          '</div>' +
          side(1) +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}
/* ── تهيئة ما بعد الرسم: ربط التصويب + الشرائط + الشريط العلوي + إعادة اللعب ── */
function pnInit() {
  pnBindAim();
  var f = penField();
  if (f.replay && !f.replay._bound) {
    f.replay._bound = true;
    f.replay.addEventListener('click', function (e) {
      e.stopPropagation();
      SND.click();
      pnSoloRestart();
    });
  }
  if (pnInRoom()) {
    pnRoomUi();
  } else {
    pnSolo = { shot: 1, seatGoals: [0, 0], seatShots: [[], []], over: false };
    pnBarsRender();
    pnTopRender();
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
