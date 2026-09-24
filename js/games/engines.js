/* ══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Game Engines
   Slots, Mines, Plinko, Dice, Coin Flip, Hi-Lo,
   Wheel, Scratch, Wingo, RPS, Penalty, Lucky7,
   Sic Bo, Roulette, Baccarat, Dragon Tiger,
   Video Poker, Keno, Andar Bahar, Crash
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
  const GAME_BG = { andar_bahar: 1, baccarat: 1, backgammon: 1, blackjack: 1, 'coin-flip': 1, crabbin: 1, crash: 1, dice: 1, dominoes: 1, dragon: 1, fishing: 1, football: 1, gates: 1, 'hi-lo': 1, keno: 1, lightning: 1, lottery: 1, 'lucky-7': 1, mahjong: 1, mines: 1, money: 1, olympus: 1, parchisi: 1, plinko: 1, poker: 1, 'rock-paper': 1, ronda: 1, rose: 1, roulette: 1, scratch: 1, 'sic-bo': 1, 'slot-spin': 1, 'sweet-bonanza': 1, wheel: 1, wingo: 1 };
  const gbg = (typeof GAME_IMG !== 'undefined' && GAME_IMG[g.id] && GAME_BG[GAME_IMG[g.id]])
    ? '<div class="gstage-bg" style="background-image:url(assets/games/' + GAME_IMG[g.id] + '/background.webp)"></div>'
    : '';
  return '<div class="stage">' + gbg +
    '<div class="glogo-wm" aria-hidden="true"></div>' +
    '<div class="gtop">' +
      '<span class="pf"> Provably Fair</span>' +
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

/* ═══════════ 5. Coin Flip ═══════════ */
/* ×1.95 ربح → RTP = 0.5 × 1.95 = 97.5% (هامش كازينو) */
let cSide = 'heads', cBusy = false, cLast = null;
function eCoin(g) {
  return gFrame(
    '<div class="cf-wrap" style="text-align:center;margin:20px 0">' +
      '<div class="cf-hint">' + T('cf.hint') + '</div>' +
      '<div class="coin3d" id="cCoin" style="margin:0 auto">' +
        '<div class="coinInner" style="width:100%;height:100%;position:relative;transform-style:preserve-3d;transition:transform 2s cubic-bezier(0.17,0.67,0.83,0.67)">' +
          '<div class="coinFace heads" style="position:absolute;width:100%;height:100%;backface-visibility:hidden;border-radius:50%"></div>' +
          '<div class="coinFace tails" style="position:absolute;width:100%;height:100%;backface-visibility:hidden;border-radius:50%;transform:rotateY(180deg)"></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="rb blue active" onclick="cSetSide(\'heads\')" id="cBtnHeads">🦁 ' + T('g.heads') + '</button>' +
      '<button class="rb red" onclick="cSetSide(\'tails\')" id="cBtnTails">👑 ' + T('g.tails') + '</button>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big" id="cFlipBtn" onclick="cFlip()"> ' + T('g.flip') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function cSetSide(s) {
  if (cBusy) return;
  cSide = s;
  document.getElementById('cBtnHeads').classList.toggle('active', s === 'heads');
  document.getElementById('cBtnTails').classList.toggle('active', s === 'tails');
  SND.click();
}
function cSetBusy(b) {
  cBusy = b;
  ['cFlipBtn', 'cBtnHeads', 'cBtnTails'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.disabled = b;
  });
}
function cFlip() {
  if (cBusy) return;
  cSetBusy(true);
  if (!take()) { cSetBusy(false); return; }
  SND.spin();
  const coin = document.querySelector('.coinInner');
  /* استدعاء واحد حتمي لـ _rng — النتيجة محسوبة قبل الدوران */
  const win = _rng() < 0.5;
  const resultSide = win ? cSide : (cSide === 'heads' ? 'tails' : 'heads');
  cLast = { win: win, side: resultSide };
  /* heads = 2160deg (6 دورات كاملة)، tails = 1980deg (5.5 دورات → نصف دورة زائدة تظهر الوجه الخلفي).
     القيمة 2340 (6.5 دورات) يسوّيها المتصفح في هذا السياق إلى 1.80216e+06 (مهملة → heads دائماً)؛
     جرّبت 1980/1620/900 وهي سليمة ثابتة في كل السياقات. */
  const target = 'rotateY(' + (resultSide === 'tails' ? 1980 : 2160) + 'deg)';
  /* دورن حاسم: استخدم WAAPI — keyframes صريحة من rotateY(0) إلى الهدف.
     المتصفح يسوّي زوايا CSS transition الكبيرة (rotateY(2340) → قيم مهملة
     كـ 1.80216e+06) فلا تصل العملة للوجه؛ الـ WAAPI يحسب keyframes رياضياً
     بلا قيمة محمولة ولا تسوية، والـ fill:forwards يثبت الوجه النهائي. */
  coin.getAnimations().forEach(function (a) { a.cancel(); });
  coin.animate([
    { transform: 'rotateY(0deg)' },
    { transform: target }
  ], { duration: 2000, easing: 'cubic-bezier(0.17,0.67,0.83,0.67)', fill: 'forwards' });
  setTimeout(() => {
    if (win) {
      const w = Math.floor(GB * 1.95);
      give(w);
      gres('×1.95 +' + fmt(w) + ' 🪙', w);
      winFX(w);
    } else {
      gres(T('ts.lose'), 0);
      winFX(0);
    }
    fairTick();
    cSetBusy(false);
  }, 2200);
}

/* ═══════════ 6. Hi-Lo ═══════════ */
/* ×1.9 ربح + تعادل = استرداد → RTP = (6×1.9 + 1×1)/13 = 95.4% */
let hCard = null, hBusy = false;
const hRanks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function hDrawCard() {
  /* استدعاءان ثابتان: الرتبة ثم الشكل — حتمي للاختبار */
  return {
    r: hRanks[Math.floor(_rng() * 13)],
    s: ['♠','♥','♦','♣'][Math.floor(_rng() * 4)]
  };
}
function hRenderCard(el, card, animate) {
  if (!el) return;
  if (animate !== false) {
    el.classList.remove('hl-flip');
    void el.offsetWidth; /* إعادة تشغيل أنيميشن القلب */
    el.classList.add('hl-flip');
  } else {
    el.classList.remove('hl-flip');
  }
  if (!card) {
    el.innerHTML = '<img class="hl-img" src="assets/cards/back.webp" alt="" draggable="false">';
    return;
  }
  const red = (card.s === '♥' || card.s === '♦');
  el.style.color = red ? '#d32f2f' : '#16213e';
  el.innerHTML = '<img class="hl-img" src="assets/cards/' + card.r + '-' + suitKey(card.s) + '.webp" alt="' + card.r + ' ' + card.s + '" draggable="false">';
}
function eHilo(g) {
  return gFrame(
    '<div class="hl-hint">' + T('hl.hint') + '</div>' +
    '<div class="hl-table">' +
      '<div class="hl-side">' +
        '<div class="hl-tag">' + T('hl.current') + '</div>' +
        '<div class="hl-card hl-cur" id="hCard"><img class="hl-img" src="assets/cards/back.webp" alt="" draggable="false"></div>' +
      '</div>' +
      '<div class="hl-vs">VS</div>' +
      '<div class="hl-side">' +
        '<div class="hl-tag">' + T('hl.next') + '</div>' +
        '<div class="hl-card hl-next" id="hCard2"><img class="hl-img" src="assets/cards/back.webp" alt="" draggable="false"></div>' +
      '</div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="rb blue" id="hHigh" onclick="hGuess(\'high\')"> ' + T('g.high') + ' ↑</button>' +
      '<button class="rb red" id="hLow" onclick="hGuess(\'low\')"> ' + T('g.low') + ' ↓</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function initHilo() {
  hCard = hDrawCard();
  hBusy = false;
  hRenderCard(document.getElementById('hCard'), hCard, false);
  hRenderCard(document.getElementById('hCard2'), null, false);
}
function hSetBusy(b) {
  hBusy = b;
  ['hHigh', 'hLow'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.disabled = b;
  });
}
function hGuess(guess) {
  if (hBusy) return;
  hSetBusy(true);
  if (!take()) { hSetBusy(false); return; }
  SND.card();
  const newCard = hDrawCard();
  const hVal = hRanks.indexOf(hCard.r);
  const nVal = hRanks.indexOf(newCard.r);
  hRenderCard(document.getElementById('hCard2'), newCard, true);
  const win = (guess === 'high' && nVal > hVal) || (guess === 'low' && nVal < hVal);
  const lose = (guess === 'high' && nVal < hVal) || (guess === 'low' && nVal > hVal);
  if (win) {
    const w = Math.floor(GB * 1.9);
    give(w);
    SND.coin();
    gres('×1.9 +' + fmt(w) + ' 🪙', w);
    winFX(w);
  } else if (lose) {
    gres(T('ts.lose'), 0);
    winFX(0);
  } else {
    give(GB); /* تعادل — استرداد الرهان */
    SND.click();
    gres(T('hl.push'), 0);
  }
  fairTick();
  /* البطاقة المسحوبة تصبح الحالية للجولة التالية */
  hCard = newCard;
  const cur = document.getElementById('hCard');
  if (cur) hRenderCard(cur, hCard, false);
  setTimeout(function () {
    hRenderCard(document.getElementById('hCard2'), null, false);
    hSetBusy(false);
  }, 650);
}

/* ═══════════ 10. RPS ═══════════ */
/* حجر/ورقة/مقص — فوز ×1.95، تعادل = استرداد، خسارة = −GB
   RTP = (1.95 + 1 + 0) ÷ 3 = 98.3% — هامش كازينو 1.7% */
var rpRoom = null;
var rpsBusy = false;
var rpsLastPick = null;
const RPS_MOVES = ['✊', '✋', '✌️'];
const RPS_BEATS = { '✊': '✌️', '✋': '✊', '✌️': '✋' };
const RPS_KEYS = { '✊': 'rp.rock', '✋': 'rp.paper', '✌️': 'rp.scissors' };
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
function eRps(g) {
  rpRoomReset();
  rpsBusy = false;
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
      '</div>' +
      '<div class="rps-vs"><span>VS</span></div>' +
      '<div class="rps-side">' +
        '<div class="rps-side-tag opp" id="rpsOppTag">' + T('rp.computer') + '</div>' +
        '<div class="rps-card" id="rpsOppCard"><span class="rps-card-face" id="rpsOppFace">❓</span></div>' +
      '</div>' +
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
  if (myFace) myFace.textContent = p;
  if (myCard) { myCard.classList.remove('win', 'lose', 'tie'); }
  if (oppCard) { oppCard.classList.remove('win', 'lose', 'tie'); oppCard.classList.add('shaking'); }
  if (oppFace) oppFace.textContent = '❔';
  if (resEl) resEl.textContent = '';
  SND.card();
  /* كشف حتمي باستدعاء _rng واحد — حركة الحاسوب */
  const c = RPS_MOVES[Math.floor(_rng() * 3)];
  setTimeout(function () {
    if (oppCard) oppCard.classList.remove('shaking');
    if (oppFace) oppFace.textContent = c;
    const win = RPS_BEATS[p] === c;
    const tie = p === c;
    let w = 0;
    if (win) {
      w = Math.floor(GB * 1.95);
      give(w);
      SND.coin();
      if (myCard) myCard.classList.add('win');
      if (oppCard) oppCard.classList.add('lose');
      if (resEl) resEl.textContent = T('rp.you') + ': ' + p + '  vs  ' + T('rp.computer') + ': ' + c + ' — ' + T('rp.winRound');
      gres('×1.95 +' + fmt(w) + ' 🪙', w);
      winFX(w);
    } else if (tie) {
      give(GB); /* تعادل — استرداد الرهان */
      SND.click();
      if (myCard) myCard.classList.add('tie');
      if (oppCard) oppCard.classList.add('tie');
      if (resEl) resEl.textContent = T('rp.you') + ': ' + p + '  vs  ' + T('rp.computer') + ': ' + c + ' — ' + T('rp.tieRound');
      gres(T('rp.tie'), 0);
    } else {
      SND.lose();
      if (myCard) myCard.classList.add('lose');
      if (oppCard) oppCard.classList.add('win');
      if (resEl) resEl.textContent = T('rp.you') + ': ' + p + '  vs  ' + T('rp.computer') + ': ' + c + ' — ' + T('rp.loseRound');
      gres(T('ts.lose'), 0);
      winFX(0);
    }
    fairTick();
    setTimeout(function () {
      if (oppFace) oppFace.textContent = '❓';
      if (myFace) myFace.textContent = '❓';
      rpsSetBusy(false);
    }, 1400);
  }, 800);
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
    const oppFace = document.getElementById('rpsOppFace');
    const oppTag = document.getElementById('rpsOppTag');
    if (oppFace) oppFace.textContent = rpRoom.oppPick;
    if (oppTag) oppTag.textContent = rpRoom.oppName || T('rp.opp');
    rpsRoomSettle();
  }
}
function rpsRoomSettle() {
  var myWin = RPS_BEATS[rpRoom.myPick] === rpRoom.oppPick;
  var oppWin = RPS_BEATS[rpRoom.oppPick] === rpRoom.myPick;
  if (myWin) rpRoom.myWins++;
  if (oppWin) rpRoom.oppWins++;
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
    if (mf) mf.textContent = '❓';
    if (of) of.textContent = '❓';
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
   اختيار أعمى متزامن (sendBlind): الخادم يكشف الزوج معاً فلا يرى من يختار ثانياً حركة الأول */
var pnRoom = null;
var pnBusy = false;
/* ترتيب الجهات: أعلى-يسار، أعلى، أعلى-يمين، يسار-وسط، وسط، يمين-وسط، أسفل-يسار، أسفل، أسفل-يمين */
const PN_DIRS = ['↖️', '⬆️', '↗️', '⬅️', '🎯', '➡️', '↙️', '⬇️', '↘️'];
const PN_KEYS = { '↖️': 'pn.tl', '⬆️': 'pn.tc', '↗️': 'pn.tr', '⬅️': 'pn.ml', '🎯': 'pn.mc', '➡️': 'pn.mr', '↙️': 'pn.bl', '⬇️': 'pn.bc', '↘️': 'pn.br' };
/* إحداثيات الشبكة 3×3: x نسبة مئوية للعرض (translateX%) و y بالبكسل (translateY) —
   القيم العلوية سالبة (الكرة/الحارس فوق المنتصف) والسفلية موجبة */
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
    role: document.getElementById('pnRole')
  };
}
function penMoveBall(d) {
  const f = penField();
  if (!f.ball) return;
  /* شبكة 3×3: x كنسبة من عرض المرمى (translateX%) و y بالبكسل */
  const p = PN_POS[d] || PN_POS['🎯'];
  f.ball.style.transform = 'translateX(' + p.x + '%) translateY(' + p.y + 'px)';
}
function penMoveKeeper(d) {
  const f = penField();
  if (!f.keeper) return;
  /* نفس إحداثيات الكرة مع دوران خفيف حسب العمود: يسار → -12deg، يمين → 12deg */
  const p = PN_POS[d] || PN_POS['🎯'];
  const rot = p.x < 0 ? -12 : p.x > 0 ? 12 : 0;
  f.keeper.style.transform = 'translateX(' + p.x + '%) translateY(' + p.y + 'px) rotate(' + rot + 'deg)';
}
function penResetField() {
  const f = penField();
  if (f.ball) f.ball.style.transform = 'translateX(0) translateY(0)';
  if (f.keeper) f.keeper.style.transform = 'translateX(0) translateY(0) rotate(0deg)';
  if (f.arena) f.arena.classList.remove('pn-goal', 'pn-saved');
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
      '<div class="goal">' +
        '<div class="gpost gl"></div><div class="gpost gr"></div>' +
        '<div class="gnet"></div>' +
        '<span class="keeper" id="pnKeeper">🧤</span>' +
        '<span class="pball2" id="pnBall">⚽</span>' +
      '</div>' +
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
  if (f.role) f.role.textContent = '🧤 ' + T('pn.saving');
  if (f.res) f.res.textContent = '';
  penMoveBall(d);
  /* كشف حتمي باستدعاء _rng واحد — جهة الحارس من 9 جهات (P(تصدي)=1/9) */
  const gk = PN_DIRS[Math.floor(_rng() * 9)];
  setTimeout(function () {
    penMoveKeeper(gk);
    const win = gk !== d;
    /* P(goal)=8/9 → ×1.08 → RTP = 8/9 × 1.08 ≈ 96% (هامش كازينو 4%) */
    const w = win ? Math.floor(GB * 1.08) : 0;
    if (win) {
      give(w);
      SND.coin();
      if (f.arena) f.arena.classList.add('pn-goal');
      if (f.res) f.res.textContent = T('pn.shot') + ': ' + pnLabel(d) + '  —  ' + T('pn.keep') + ': ' + pnLabel(gk) + '\n🥅 ' + T('pn.goal');
      gres('×1.08 +' + fmt(w) + ' 🪙', w);
      winFX(w);
    } else {
      SND.lose();
      if (f.arena) f.arena.classList.add('pn-saved');
      if (f.res) f.res.textContent = T('pn.shot') + ': ' + pnLabel(d) + '  —  ' + T('pn.keep') + ': ' + pnLabel(gk) + '\n🙌 ' + T('pn.save');
      gres(T('ts.lose'), 0);
      winFX(0);
    }
    fairTick();
    setTimeout(function () {
      penResetField();
      pnSetBusy(false);
      if (f.role) f.role.textContent = '⚽ ' + T('pn.youShoot');
    }, 1500);
  }, 700);
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
  /* كشف بصري متزامن على الشاشتين: الحارس يغوص ثم الكرة تنطلق */
  penMoveKeeper(pnRoom.saveD);
  setTimeout(function () { penMoveBall(pnRoom.shootD); }, 150);
  var f = penField();
  if (f.arena) f.arena.classList.add(goal ? 'pn-goal' : 'pn-saved');
  if (f.res) {
    f.res.textContent = T('pn.shot') + ': ' + pnLabel(pnRoom.shootD) + '  —  ' + T('pn.keep') + ': ' + pnLabel(pnRoom.saveD) +
      (goal ? '\n🥅 ' + T('pn.goal') : '\n🙌 ' + T('pn.save'));
  }
  var pnMax = (window.HTH_ROUNDS && window.HTH_ROUNDS.pn) || (Rooms.state && Rooms.state.game_opts && Rooms.state.game_opts.rounds) || 5;   /* [RS-GameOpts] */
  if (pnRoom.round >= pnMax) {
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
  }, 1700);
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

/* ═══════════ 17. Video Poker ═══════════ */
function eVp(g) {
  return gFrame(
    '<div class="vp-wrap">' +
      '<div class="vp-pt">' +
        '<div class="vp-pt-title"><i class="fa-solid fa-gem" aria-hidden="true"></i> ' + T('vp.paytitle') + '</div>' +
        '<div class="vp-pt-grid">' +
          '<div class="vp-pt-row"><span>' + T('vp.hand.royal') + '</span><b>×250</b></div>' +
          '<div class="vp-pt-row"><span>' + T('vp.hand.sflush') + '</span><b>×50</b></div>' +
          '<div class="vp-pt-row"><span>' + T('vp.hand.four') + '</span><b>×25</b></div>' +
          '<div class="vp-pt-row"><span>' + T('vp.hand.full') + '</span><b>×9</b></div>' +
          '<div class="vp-pt-row"><span>' + T('vp.hand.flush') + '</span><b>×6</b></div>' +
          '<div class="vp-pt-row"><span>' + T('vp.hand.straight') + '</span><b>×4</b></div>' +
          '<div class="vp-pt-row"><span>' + T('vp.hand.trips') + '</span><b>×3</b></div>' +
          '<div class="vp-pt-row"><span>' + T('vp.hand.twopair') + '</span><b>×2</b></div>' +
          '<div class="vp-pt-row"><span>' + T('vp.hand.jacks') + '</span><b>×1</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="vp-hand" id="vpHand"></div>' +
      '<div class="vp-hint" id="vpHint"><img src="assets/cards/back.webp" class="card-ic" alt=""> ' + T('vp.dealhint') + '</div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big vp-deal" id="vpDeal" onclick="vpDeal()"><img src="assets/cards/back.webp" class="card-ic" alt=""> ' + T('g.deal') + '</button>' +
      '<button class="big vp-draw" id="vpDraw" onclick="vpDraw()" disabled> ' + T('g.draw') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
let vpCards = [], vpHeld = [], vpStage = 0;
function vpDeck() {
  /* مجموعة جديدة كاملة ناقص بطاقات اليد الحالية — يمنع تكرار البطاقات في السحب */
  const deck = bcBuildDeck();
  const inHand = vpCards.map(function (c) { return c.r + c.s; });
  return deck.filter(function (c) { return inHand.indexOf(c.r + c.s) === -1; });
}
function vpRenderHand() {
  const el = document.getElementById('vpHand');
  if (!el) return;
  el.innerHTML = vpCards.map(function (c, i) {
    return '<div class="vp-card' + (vpHeld[i] ? ' held' : '') + '" data-idx="' + i + '" onclick="vpToggle(' + i + ')" style="animation-delay:' + (i * 0.08) + 's">' +
      '<img src="assets/cards/' + c.r + '-' + suitKey(c.s) + '.webp" alt="" draggable="false">' +
      '<span class="vp-hold">' + T('vp.hold') + '</span>' +
    '</div>';
  }).join('');
}
function vpDeal() {
  if (vpStage !== 0) return;
  if (!take()) return;
  vpStage = 1;
  vpHeld = [false, false, false, false, false];
  vpCards = vpDeck().slice(0, 5);
  vpRenderHand();
  const dl = document.getElementById('vpDeal');
  const dr = document.getElementById('vpDraw');
  if (dl) dl.disabled = true;
  if (dr) dr.disabled = false;
  const h = document.getElementById('vpHint');
  if (h) h.textContent = T('vp.holdhint');
  SND.card();
  gres('', 0);
}
function vpToggle(i) {
  if (vpStage !== 1) return;
  vpHeld[i] = !vpHeld[i];
  const card = document.querySelector('.vp-card[data-idx="' + i + '"]');
  if (card) card.classList.toggle('held', vpHeld[i]);
  SND.click();
}
function vpDraw() {
  if (vpStage !== 1) return;
  vpStage = 2;
  const deck = vpDeck();
  let di = 0;
  vpCards = vpCards.map(function (c, i) { return vpHeld[i] ? c : deck[di++]; });
  vpHeld = [false, false, false, false, false];
  vpRenderHand();
  const dl = document.getElementById('vpDeal');
  const dr = document.getElementById('vpDraw');
  if (dl) dl.disabled = true;
  if (dr) dr.disabled = true;
  SND.card();
  setTimeout(evaluateVP, 900);
}
function evaluateVP() {
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const vals = vpCards.map(function (c) { return ranks.indexOf(c.r); }).sort(function (a, b) { return a - b; });
  const suits = vpCards.map(function (c) { return c.s; });
  const isFlush = suits.every(function (s) { return s === suits[0]; });
  const straightSeq = vals.every(function (v, i) { return i === 0 || v === vals[i - 1] + 1; });
  const vj = vals.join();
  const isStraight = straightSeq || vj === '0,1,2,3,12' || vj === '0,8,9,10,11';
  const isRoyal = vj === '0,8,9,10,11';
  const counts = {};
  vals.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
  const countVals = Object.values(counts).sort(function (a, b) { return b - a; });
  const pairRank = vals.filter(function (v) { return counts[v] === 2; })[0];
  let hand = '', mult = 0;
  if (isFlush && isStraight && isRoyal) { hand = T('vp.hand.royal'); mult = 250; }
  else if (isFlush && isStraight) { hand = T('vp.hand.sflush'); mult = 50; }
  else if (countVals[0] === 4) { hand = T('vp.hand.four'); mult = 25; }
  else if (countVals[0] === 3 && countVals[1] === 2) { hand = T('vp.hand.full'); mult = 9; }
  else if (isFlush) { hand = T('vp.hand.flush'); mult = 6; }
  else if (isStraight) { hand = T('vp.hand.straight'); mult = 4; }
  else if (countVals[0] === 3) { hand = T('vp.hand.trips'); mult = 3; }
  else if (countVals[0] === 2 && countVals[1] === 2) { hand = T('vp.hand.twopair'); mult = 2; }
  else if (countVals[0] === 2 && pairRank >= 9) { hand = T('vp.hand.jacks'); mult = 1; }
  else { hand = T('vp.hand.none'); mult = 0; }
  const w = Math.floor(GB * mult);
  if (mult) give(w);
  gres(hand + (mult ? ' ×' + mult + ' +' + fmt(w) + ' 🪙' : ''), mult ? w : 0);
  winFX(w);
  fairTick();
  vpStage = 0;
  const dl = document.getElementById('vpDeal');
  if (dl) dl.disabled = false;
  const h = document.getElementById('vpHint');
  if (h) h.innerHTML = '<img src=\"assets/cards/back.webp\" class=\"card-ic\" alt=\"\"> ' + T('vp.dealhint');
}

/* ═══════════ 18. Keno ═══════════ */
/* جداول دفع حسب عدد الأرقام المختارة k — مضاعفات GB (RTP ≈ 95%) */
const KENO_PAYS = [
  null,
  [0, 3.8],
  [0, 1, 10],
  [0, 0, 3, 38],
  [0, 0, 1, 9, 100],
  [0, 0, 0, 4, 26, 448],
  [0, 0, 0, 2, 9, 85, 1324],
  [0, 0, 0, 0, 6, 39, 270, 4199],
  [0, 0, 0, 0, 3, 18, 98, 684, 8924],
  [0, 0, 0, 0, 0, 10, 63, 313, 2170, 28930],
  [0, 0, 0, 0, 0, 5, 28, 154, 794, 4205, 56061]
];
let kPicks = [], kNumbers = [], kDrawing = false, kPlacedBets = [];
function eKeno(g) {
  let cells = '';
  for (let n = 1; n <= 80; n++) {
    cells += '<button type="button" class="kc" data-num="' + n + '" onclick="kToggle(' + n + ')">' + n + '</button>';
  }
  return gFrame(
    '<div id="gpanel"></div>' +
    '<div class="ke-wrap">' +
      '<div class="ke-top">' +
        '<div class="ke-counter" id="kCounter"><i class="fa-solid fa-hashtag" aria-hidden="true"></i> <b>0</b>/10 ' + T('ke.sel') + '</div>' +
        '<button type="button" class="ke-clear" id="kClear" onclick="kClear()"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> ' + T('ke.clear') + '</button>' +
      '</div>' +
      '<div class="kgrid" id="kGrid">' + cells + '</div>' +
      '<div class="ke-hint"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ' + T('ke.hint') + '</div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big ke-draw" id="kDraw" onclick="kStart()"><i class="fa-solid fa-play" aria-hidden="true"></i> ' + T('ke.draw') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function kToggle(n) {
  if (kDrawing) return;
  /* [MultiBet] رقم مرهون عليه في تذكرة سابقة لا يُختار ثانية — أرقام مختلفة لكل رهان */
  for (let bi = 0; bi < kPlacedBets.length; bi++) {
    if (kPlacedBets[bi].picks.indexOf(n) !== -1) { toast(T('ke.dupWarn'), 'warn'); return; }
  }
  const idx = kPicks.indexOf(n);
  if (idx !== -1) {
    kPicks.splice(idx, 1);
  } else {
    if (kPicks.length >= 10) { toast(T('ke.maxWarn'), 'warn'); return; }
    kPicks.push(n);
  }
  const cell = document.querySelector('.kc[data-num="' + n + '"]');
  if (cell) cell.classList.toggle('sel', idx === -1);
  const c = document.getElementById('kCounter');
  if (c) c.innerHTML = '🔢 <b>' + kPicks.length + '</b>/10 ' + T('ke.sel');
  SND.click();
}
function kClear() {
  if (kDrawing) return;
  kPicks = [];
  document.querySelectorAll('.kc.sel').forEach(function (c) { c.classList.remove('sel'); });
  const c = document.getElementById('kCounter');
  if (c) c.innerHTML = '🔢 <b>0</b>/10 ' + T('ke.sel');
  SND.click();
}
/* ── كينو جماعي: الرهان يُرسل للخادم، والسحب من الجولة الجماعية ── */
function kStart() {
  if (kDrawing) return;
  if (kPicks.length < 1 || kPicks.length > 10) { toast(T('ke.hitWarn'), 'warn'); return; }
  const btn = document.getElementById('kDraw');
  if (btn) btn.disabled = true;
  SND.click();
  API.post('/api/games/ke/bet', { amount: GB, picks: kPicks.slice() }).then(function (r) {
    if (!r.ok || !r.data || !r.data.ok) {
      const msg = (r.data && r.data.message) || T('auth.error');
      toast(msg, 'err');
      SND.lose();
      if (btn) btn.disabled = false;
      if (typeof Group !== 'undefined' && Group.setGold && typeof r.data.gold === 'number') Group.setGold(r.data.gold);
      return;
    }
    /* الرصيد يتحدث حصرياً من السيرفر */
    if (typeof Group !== 'undefined' && Group.setGold && typeof r.data.gold === 'number') Group.setGold(r.data.gold);
    /* [MultiBet] الرهان قُبل: يُحفظ محلياً وتُفرَّغ الاختيارات — يمكن رهان آخر
       بأرقام مختلفة في نفس الجولة حتى إقفال نافذة الرهان */
    kPlacedBets.push({ picks: kPicks.slice(), bet: GB });
    kPicks.forEach(function (n) {
      const cell = document.querySelector('.kc[data-num="' + n + '"]');
      if (cell) { cell.classList.remove('sel'); cell.classList.add('placed'); }
    });
    kPicks = [];
    const cc = document.getElementById('kCounter');
    if (cc) cc.innerHTML = '🔢 <b>0</b>/10 ' + T('ke.sel') + ' · 🎫 ' + kPlacedBets.length;
    if (btn) btn.disabled = false;
    SND.spin();
    /* عرض تأكيد الرهان فقط — التذكرة تُسجَّل مرة واحدة عند النتيجة (لا تكرار) */
    gres(T('grp.placeBet') + ' 🎫 ' + kPlacedBets.length, 0, true);
  });
}
/* كشف أرقام الجولة المسحوبة (يستدعيها Group.keOnDraw عبر SSE/round API) */
function keReveal(numbers) {
  if (!numbers || !numbers.length) return;
  kNumbers = numbers.slice();
  kDrawing = true;
  const btn = document.getElementById('kDraw');
  if (btn) btn.disabled = true;
  gres('', 0);
  /* إزالة ألوان الجولة السابقة وإبقاء الاختيارات الحالية */
  document.querySelectorAll('.kc').forEach(function (c) {
    c.classList.remove('drawn', 'match', 'miss');
  });
  /* كشف الأرقام المسحوبة تباعاً */
  /* [MultiBet] كل الأرقام المرهون عليها (من كل التذاكر) تُلوَّن كإصابة/إخفاق */
  const allPicked = {};
  kPlacedBets.forEach(function (b) { b.picks.forEach(function (n) { allPicked[n] = 1; }); });
  kPicks.forEach(function (n) { allPicked[n] = 1; });
  numbers.forEach(function (n, di) {
    setTimeout(function () {
      const cell = document.querySelector('.kc[data-num="' + n + '"]');
      if (!cell) return;
      cell.classList.add('drawn');
      if (allPicked[n]) cell.classList.add('match');
      else cell.classList.add('miss');
      if (di === numbers.length - 1) keFinish();
    }, di * 120);
  });
}
function keFinish() {
  /* [MultiBet] تجميع نتائج كل التذاكر المرهونة في الجولة */
  const bets = kPlacedBets.length ? kPlacedBets : (kPicks.length ? [{ picks: kPicks, bet: GB }] : []);
  let totalWin = 0;
  const parts = [];
  bets.forEach(function (b, i) {
    const hits = b.picks.filter(function (n) { return kNumbers.indexOf(n) !== -1; }).length;
    const mult = (KENO_PAYS[b.picks.length] && KENO_PAYS[b.picks.length][hits]) || 0;
    const w = Math.floor(b.bet * mult);
    totalWin += w;
    parts.push(hits + '/' + b.picks.length + (mult ? '×' + mult : ''));
    /* [Tickets] تذكرة مستقلة لكل رهان بأرقامه الخاصة ورهانه الخاص */
    if (typeof recordRound === 'function') {
      const nums = b.picks.slice().sort(function (x, y) { return x - y; }).join('·');
      recordRound(w > 0, w, '🎫 ' + (i + 1) + '/' + bets.length + ' [' + nums + '] ← ' + hits + '/' + b.picks.length + (mult ? ' ×' + mult : ''), b.bet);
    }
  });
  /* العرض محلي فقط (التذاكر سُجلت أعلاه واحدة واحدة) — الرصيد يتحدث من السيرفر */
  gres(T('ke.result') + ' ' + parts.join(' · '), totalWin, true);
  if (totalWin > 0) winFX(totalWin);
  fairTick();
}
/* نتيجة الجولة الجماعية من السيرفر (winners/total_paid) */
function keResolveResult(result) {
  if (result && result.winners !== undefined) {
    /* عرض ملخص الجولة الجماعية فقط — تذكرتي سُجلت في keFinish (لا تكرار) */
    gres('🏆 ' + T('grp.winners') + ': ' + result.winners + ' · ' + T('grp.totalPaid') + ': ' + fmt(result.total_paid) + ' 🪙', 0, true);
  }
}
/* جولة جديدة: إعادة تعيين الاختيارات والتمكين */
function keNewRound() {
  kPicks = [];
  kNumbers = [];
  kDrawing = false;
  kPlacedBets = [];
  document.querySelectorAll('.kc').forEach(function (c) {
    c.classList.remove('drawn', 'match', 'miss', 'sel', 'placed');
  });
  const c = document.getElementById('kCounter');
  if (c) c.innerHTML = '🔢 <b>0</b>/10 ' + T('ke.sel');
  const d = document.getElementById('kDraw');
  if (d) d.disabled = false;
}
/* مزامنة حالة زر السحب مع نافذة الرهان الخادمية */
function kePanelSync(status) {
  const d = document.getElementById('kDraw');
  if (!d) return;
  if (kDrawing) { d.disabled = true; return; }
  if (status === 'betting') { d.disabled = false; d.textContent = '🎯 ' + T('ke.draw'); }
  else { d.disabled = true; d.textContent = '⏳ ' + T('grp.notBetting'); }
}
window.keReveal = keReveal;
window.keResolveResult = keResolveResult;
window.keNewRound = keNewRound;
window.kePanelSync = kePanelSync;

/* ═══════════ 28. Poker (اختر بطاقة) ═══════════ */
let pkRunning = false;
const PK_FACE = { 1.4: 'A♠', 1.6: 'K♥', 1.75: 'Q♦' };
function ePoker(g) {
  let cards = '';
  for (let i = 0; i < 5; i++) cards += '<div class="pk-card idle"><img src="assets/cards/back.webp" alt="" draggable="false"><span class="pk-val">?</span></div>';
  return gFrame(
    '<div class="pk-hint">' + T('pk.hint') + '</div>' +
    '<div class="pk-row" id="pkRow">' + cards + '</div>' +
    '<div class="cr-status" id="pkResult"></div>' +
    '<div class="bets"><button class="crBtn" id="pkBtn" onclick="pkGo()"><i class="fa-solid fa-clone" aria-hidden="true"></i> ' + T('pk.go') + '</button></div>' +
    betRow(),
    g
  );
}
function pkGo() {
  if (pkRunning) return;
  if (!take()) return;
  pkRunning = true;
  const btn = document.getElementById('pkBtn');
  if (btn) btn.disabled = true;
  const vals = [1.4, 1.6, 1.75, 0, 0];
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  const row = document.getElementById('pkRow');
  row.innerHTML = '';
  const res = document.getElementById('pkResult');
  res.textContent = '';
  res.className = 'cr-status';
  const cards = [];
  vals.forEach((v, idx) => {
    const c = document.createElement('div');
    c.className = 'pk-card';
    c.innerHTML = '<img src="assets/cards/back.webp" alt="" draggable="false"><span class="pk-val">?</span>';
    c.onclick = function () { pkPick(idx); };
    row.appendChild(c);
    cards.push(c);
  });
  function pkPick(idx) {
    if (pkRunning !== true) return;
    pkRunning = 'done';
    cards.forEach((c, i) => c.onclick = null);
    let delay = 0;
    cards.forEach((c, i) => {
      setTimeout(() => {
        const v = vals[i];
        c.classList.add(v > 0 ? 'gold' : 'red', 'revealed');
        const face = v > 0 ? (PK_FACE[v] || 'A♠') : '2♣';
        const faceR = face.slice(0, -1);
        const faceS = face.slice(-1);
        c.innerHTML = '<img src="assets/cards/' + faceR + '-' + suitKey(faceS) + '.webp" alt="" draggable="false"><span class="pk-val">' + (v > 0 ? '×' + v : '×0') + '</span>';
      }, delay);
      delay += 120;
    });
    setTimeout(() => {
      const v = vals[idx];
      cards[idx].classList.add('match');
      const w = v > 0 ? Math.floor(GB * v) : 0;
      give(w);
      gres(v > 0 ? '×' + v + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), w);
      res.className = 'cr-status ' + (v > 0 ? 'win' : 'lose');
      res.textContent = v > 0 ? T('pk.win') + ' ×' + v + ' +' + fmt(w) + ' 🪙' : T('pk.lose');
      winFX(w);
      fairTick();
      pkRunning = false;
      if (btn) btn.disabled = false;
    }, delay + 350);
  }
}

