/* ══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Game Engines
   Slots, Mines, Plinko, Dice, Coin Flip, Hi-Lo,
   Wheel, Scratch, Wingo, RPS, Penalty, Lucky7,
   Sic Bo, Roulette, Baccarat, Dragon Tiger,
   Andar Bahar
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
  const GAME_BG = { andar_bahar: 1, baccarat: 1, backgammon: 1, blackjack: 1, 'coin-flip': 1, crabbin: 1, dice: 1, dominoes: 1, dragon: 1, fishing: 1, football: 1, gates: 1, 'hi-lo': 1, lightning: 1, lottery: 1, 'lucky-7': 1, mahjong: 1, mines: 1, money: 1, olympus: 1, parchisi: 1, plinko: 1, 'rock-paper': 1, ronda: 1, rose: 1, roulette: 1, scratch: 1, 'sic-bo': 1, 'slot-spin': 1, 'sweet-bonanza': 1, wheel: 1, wingo: 1 };
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
  coin: (typeof window.eCoin === 'function') ? window.eCoin : ((typeof eCoin === 'function') ? eCoin : null),
  hilo: (typeof window.eHilo === 'function') ? window.eHilo : ((typeof eHilo === 'function') ? eHilo : null),
  rps: (typeof window.eRps === 'function') ? window.eRps : ((typeof eRps === 'function') ? eRps : null),
  pen: (typeof window.ePenalty === 'function') ? window.ePenalty : ((typeof ePenalty === 'function') ? ePenalty : null),
};

if (typeof window !== 'undefined') {
  window.ENG = ENG;
}
