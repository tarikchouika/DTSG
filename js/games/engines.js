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
function gres(m, w, noRec) {
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
    e.className = 'res ' + (w ? 'win' : 'lose');
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

/* ═══════════ 1. Slots ═══════════ */
/* 3 بكرات × 8 رموز متساوية الاحتمال:
   3 متطابقة = GB × pay[الرمز] | زوج = استرداد الرهان (×1) | لا شيء = خسارة
   RTP = P(pair)=32.8125% ×1 + P(triple)=1.5625% × avgPay(40.25) = 95.9% */
var slBusy = false;
/* رموز فاخرة (Font Awesome + رقم 7) بدل الإيموجي — كل رمز بلونه المتباين */
const SL_SYMS = ['7', 'cherry', 'lemon', 'bell', 'gem', 'star', 'crown', 'rocket'];
const SL_PAY = { '7': 120, 'cherry': 60, 'lemon': 40, 'star': 30, 'crown': 25, 'bell': 20, 'gem': 15, 'rocket': 12 };
const SL_ICON = {
  '7': '<i class="sl-sym sl-seven" aria-hidden="true">7</i>',
  cherry: '<i class="sl-sym sl-cherry fa-solid fa-cherry" aria-hidden="true"></i>',
  lemon: '<i class="sl-sym sl-lemon fa-solid fa-lemon" aria-hidden="true"></i>',
  bell: '<i class="sl-sym sl-bell fa-solid fa-bell" aria-hidden="true"></i>',
  gem: '<i class="sl-sym sl-gem fa-solid fa-gem" aria-hidden="true"></i>',
  star: '<i class="sl-sym sl-star fa-solid fa-star" aria-hidden="true"></i>',
  crown: '<i class="sl-sym sl-crown fa-solid fa-crown" aria-hidden="true"></i>',
  rocket: '<i class="sl-sym sl-rocket fa-solid fa-rocket" aria-hidden="true"></i>'
};
function slSetBusy(b) {
  slBusy = b;
  const btn = document.getElementById('sBtn');
  if (btn) btn.disabled = b;
}
function eSlots(g) {
  return gFrame(
    '<div class="sl-wrap">' +
      '<div class="sl-pay">' +
        SL_SYMS.map(function (s) {
          return '<span class="sl-pay-item"><b>' + SL_ICON[s] + '</b><i>×' + SL_PAY[s] + '</i></span>';
        }).join('') +
      '</div>' +
      '<div class="reels" aria-label="' + T('sl.reels') + '">' +
        '<div class="reel" id="r0"></div>' +
        '<div class="reel" id="r1"></div>' +
        '<div class="reel" id="r2"></div>' +
      '</div>' +
      '<div class="sl-status" id="slResult"></div>' +
    '</div>' +
    '<div style="text-align:center">' +
      '<button class="big" id="sBtn" onclick="spinS()"><i class="fa-solid fa-rotate" aria-hidden="true"></i> ' + T('g.spin') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function spinS() {
  if (slBusy) return; /* حماية الاستدعاء المزدوج */
  if (!take()) return;
  slSetBusy(true);
  SND.spin();
  const resEl = document.getElementById('slResult');
  if (resEl) { resEl.textContent = ''; resEl.className = 'sl-status'; }
  gres('', 0);
  const outcomes = [];
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById('r' + i);
    if (!el) continue;
    el.classList.remove('win', 'land');
    el.classList.add('spin');
    const s = SL_SYMS[Math.floor(Math.random() * SL_SYMS.length)];
    /* توقفات متدرجة عموداً بعد عمود مع تباطؤ أطول — صوت كلانك لكل توقف */
    setTimeout(function () {
      el.classList.remove('spin');
      el.innerHTML = SL_ICON[s];
      el.classList.add('land');
      SND.reelStop();
      setTimeout(function () { el.classList.remove('land'); }, 650);
      outcomes.push(s);
      if (outcomes.length === 3) {
        setTimeout(function () { slSettle(outcomes); }, 260);
      }
    }, 520 + i * 440);
  }
}
function slSettle(r) {
  const resEl = document.getElementById('slResult');
  let w = 0, cls = 'lose', msg = T('sl.none');
  if (r[0] === r[1] && r[1] === r[2]) {
    w = GB * (SL_PAY[r[0]] || 5);
    cls = 'win';
    msg = SL_ICON[r[0]] + ' ×3 — ' + T('sl.triple') + ' ×' + (SL_PAY[r[0]] || 5);
    for (let q = 0; q < 3; q++) {
      const el = document.getElementById('r' + q);
      if (el) el.classList.add('win');
    }
    const rl = document.querySelector('.reels');
    if (rl) shake(rl, 5, 380);
    if (typeof burst === 'function') {
      const rw = document.querySelector('.reels');
      if (rw) {
        const rr = rw.getBoundingClientRect();
        if (rr.width) burst(rr.left + rr.width / 2, rr.top + rr.height / 2, ['#F5C518', '#FFD93D', '#FFFFFF'], 24, 5.5);
      }
    }
  } else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) {
    w = GB; /* استرداد الرهان */
    cls = 'pair';
    const sym = r[0] === r[1] ? r[0] : r[2];
    msg = SL_ICON[sym] + ' — ' + T('sl.pair') + ' ' + T('sl.pairBack');
  }
  give(w);
  if (resEl) { resEl.innerHTML = msg; resEl.className = 'sl-status ' + cls; }
  gres(w > 0 ? '+' + fmt(w) : T('ts.lose'), w);
  winFX(w);
  if (w > 0 && cls === 'win') { /* جاكبوت: دفقة إضافية من الذهب */
    if (typeof coinRain === 'function') coinRain(8);
  }
  fairTick();
  slSetBusy(false);
}

/* ═══════════ 2. Mines ═══════════ */
let mState = { grid: [], opened: 0, mines: 5, playing: false, mult: 1 };
/* ── حساب مضاعف الألغام الرياضي العادل (Hypergeometric بدون إرجاع) ── */
function nCr(n, r) {
  if (r < 0 || r > n) return 0;
  if (r === 0 || r === n) return 1;
  let res = 1;
  for (let i = 1; i <= r; i++) res = (res * (n - i + 1)) / i;
  return res;
}
function calcMinesMultiplier(minesCount, openedCount) {
  const total = 25;
  const safe = total - minesCount;
  if (openedCount <= 0 || openedCount > safe) return 1;
  const houseEdge = 0.97;
  const prob = nCr(safe, openedCount) / nCr(total, openedCount);
  const mult = (1 / prob) * houseEdge;
  return Math.max(1.01, Math.round(mult * 100) / 100);
}

function eMines(g) {
  let cells = '';
  for (let i = 0; i < 25; i++) {
    cells += '<div class="mCell" data-idx="' + i + '" onclick="mClick(' + i + ')"><div class="mCover">?</div></div>';
  }
  return gFrame(
    '<div class="mn-wrap">' +
      '<div class="mn-top">' +
        '<div class="mn-counter" id="mnCnt">💎 <b>0</b>/' + (25 - 5) + ' ' + T('mines.safe') + '</div>' +
        '<div class="mn-mult" id="mnMult">×1.00</div>' +
      '</div>' +
      '<div class="bets">' +
        '<span class="ctext">💣 ' + T('g.pick') + '</span>' +
        '<select id="mCount" onchange="mSetCount(this.value)" aria-label="عدد الألغام">' +
          '<option value="3">3</option><option value="5" selected>5</option>' +
          '<option value="10">10</option><option value="15">15</option><option value="24">24</option>' +
        '</select>' +
      '</div>' +
      '<div class="mGrid" id="mGrid">' + cells + '</div>' +
      '<div class="mn-hint">💡 ' + T('mines.hint') + '</div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big" id="mStart" onclick="mStart()">⛏️ ' + T('g.start') + '</button>' +
      '<button class="big mn-cash" id="mCash" onclick="mCash()" disabled>💰 ' + T('g.cash') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function mSetCount(v) {
  mState.mines = parseInt(v, 10);
  const c = document.getElementById('mnCnt');
  if (c) c.innerHTML = '💎 <b>0</b>/' + (25 - mState.mines) + ' ' + T('mines.safe');
  const ml = document.getElementById('mnMult');
  if (ml) ml.textContent = '×1.00';
}
function mStart() {
  if (mState.playing) return; /* حماية الاستدعاء المزدوج */
  if (!take()) return;
  mState = { grid: [], opened: 0, mines: mState.mines, playing: true, mult: 1 };
  const mines = new Set();
  while (mines.size < mState.mines) mines.add(Math.floor(Math.random() * 25));
  for (let i = 0; i < 25; i++) mState.grid[i] = { mine: mines.has(i), open: false };
  document.querySelectorAll('.mCell').forEach(function (c) {
    c.className = 'mCell';
    c.innerHTML = '<div class="mCover">?</div>';
  });
  const c = document.getElementById('mnCnt');
  if (c) c.innerHTML = '💎 <b>0</b>/' + (25 - mState.mines) + ' ' + T('mines.safe');
  const ml = document.getElementById('mnMult');
  if (ml) ml.textContent = '×1.00';
  document.getElementById('mStart').disabled = true;
  document.getElementById('mCash').disabled = false;
  SND.click();
  gres('', 0);
}
function mClick(i) {
  if (!mState.playing || mState.grid[i].open) return;
  mState.grid[i].open = true;
  const cell = document.querySelector('.mCell[data-idx="' + i + '"]');
  if (!cell) return;
  if (mState.grid[i].mine) {
    cell.innerHTML = '<div class="mMine">💣</div>';
    cell.classList.add('boom');
    mState.playing = false;
    SND.lose();
    gres(T('mines.boom'), 0);
    document.getElementById('mStart').disabled = false;
    document.getElementById('mCash').disabled = true;
    document.querySelectorAll('.mCell').forEach((c, idx) => {
      if (mState.grid[idx].mine && !mState.grid[idx].open) c.innerHTML = '<div class="mMine">💣</div>';
    });
    return;
  }
  mState.opened++;
  mState.mult = calcMinesMultiplier(mState.mines, mState.opened);
  cell.innerHTML = '<div class="mSafe">💎</div>';
  cell.classList.add('safe');
  const c = document.getElementById('mnCnt');
  if (c) c.innerHTML = '💎 <b>' + mState.opened + '</b>/' + (25 - mState.mines) + ' ' + T('mines.safe');
  const ml = document.getElementById('mnMult');
  if (ml) ml.textContent = mState.mult + '×';
  SND.click();
  if (mState.opened === 25 - mState.mines) {
    mCash();
  }
}
function mCash() {
  if (!mState.playing) return;
  mState.playing = false;
  const w = Math.floor(GB * mState.mult);
  give(w);
  SND.coin();
  gres(mState.mult + '× +' + fmt(w) + ' 🪙', w);
  winFX(w);
  document.getElementById('mStart').disabled = false;
  document.getElementById('mCash').disabled = true;
  fairTick();
}

/* ═══════════ 3. Plinko ═══════════ */
let pRows = 12;
let pPays = null;
let pBalls = [];
let pRunning = false;
let pCanvas, pCtx;
/* جدول مضاعفات عادل: pays(s) = 0.95·2^n / (C(n,s)·(n+1)) مع توزيع ثنائي حتمي → RTP 95% */
function plinkoPays(n) {
  const row = [1];
  for (let r = 1; r <= n; r++) {
    for (let s = row.length - 1; s >= 1; s--) row[s] += row[s - 1];
    row.push(1);
  }
  const base = 0.95 * Math.pow(2, n) / (n + 1);
  return row.map(c => {
    let v = base / c;
    if (v < 0.1) v = 0.1;
    if (v > 10000) v = 10000;
    return Math.round(v * 100) / 100;
  });
}
function fmtMult(m) { return String(parseFloat(m.toFixed(2))); }
/* تنسيق مختصر داخل الكانفس: 3662.31 → ×3.7k ، 299.32 → ×299 ، 24.94 → ×24.9 */
function fmtMultC(m) {
  if (m >= 1000) return '×' + (Math.round(m / 100) / 10) + 'k';
  if (m >= 100) return '×' + Math.round(m);
  if (m >= 10) return '×' + (Math.round(m * 10) / 10);
  return '×' + fmtMult(m);
}
function ePlinko(g) {
  return gFrame(
    '<div class="bets">' +
      '<span class="ctext"> ' + T('g.pick') + '</span>' +
      '<select id="pRows" onchange="pSetRows(this.value)" aria-label="صفوف">' +
        '<option value="8">8</option><option value="10">10</option><option value="12" selected>12</option><option value="16">16</option>' +
      '</select>' +
    '</div>' +
    '<div class="pl-wrap">' +
      '<canvas id="pCv" class="game" width="400" height="500"></canvas>' +
    '</div>' +
    '<div class="mn-hint"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> ' + T('pl.hint') + '</div>' +
    '<div class="bets">' +
      '<button class="big" id="pDrop" onclick="pDrop()"><i class="fa-solid fa-circle-arrow-down" aria-hidden="true"></i> ' + T('g.drop') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function pSetRows(v) {
  if (pRunning) return; /* لا تغيير أثناء هبوط الكرة */
  pRows = parseInt(v, 10);
  initPlinko();
}
function initPlinko() {
  pCanvas = document.getElementById('pCv');
  if (!pCanvas) return;
  pCtx = pCanvas.getContext('2d');
  pPays = plinkoPays(pRows);
  pCanvas.width = pCanvas.clientWidth || 400;
  pCanvas.height = pCanvas.clientHeight || 500;
  drawPlinko();
}
function drawPlinko() {
  if (!pCtx || !pPays) return;
  const w = pCanvas.width, h = pCanvas.height;
  const top = 40, bottom = h - 56, left = 26, right = w - 26;
  const slots = pPays.length;
  pCtx.clearRect(0, 0, w, h);
  const bg = pCtx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0c1122');
  bg.addColorStop(1, '#151b36');
  pCtx.fillStyle = bg;
  pCtx.fillRect(0, 0, w, h);
  /* مسارات خلفية باهتة من الأعلى إلى كل خانة */
  pCtx.strokeStyle = 'rgba(245,197,24,0.05)';
  pCtx.lineWidth = 1;
  for (let s = 0; s < slots; s++) {
    const x = left + (right - left) * (s + 1) / (slots + 1);
    pCtx.beginPath();
    pCtx.moveTo(w / 2, top);
    pCtx.lineTo(x, bottom);
    pCtx.stroke();
  }
  /* الأوتاد الذهبية */
  const pegR = 3.6;
  for (let r = 0; r < pRows; r++) {
    const y = top + (bottom - top) * (r + 1) / (pRows + 1);
    const count = r + 2;
    for (let c = 0; c < count; c++) {
      const x = left + (right - left) * (c + 0.5) / count;
      const g = pCtx.createRadialGradient(x - 1, y - 1, 0.5, x, y, pegR + 2);
      g.addColorStop(0, '#ffe9a3');
      g.addColorStop(0.5, '#f5c518');
      g.addColorStop(1, 'rgba(180,130,10,0.9)');
      pCtx.beginPath();
      pCtx.arc(x, y, pegR, 0, Math.PI * 2);
      pCtx.fillStyle = g;
      pCtx.fill();
    }
  }
  /* الخانات السفلية مع مضاعفاتها */
  const cellW = (right - left) / slots;
  const flashSlot = pBalls.length ? pBalls[0].slot : -1;
  for (let s = 0; s < slots; s++) {
    const x = left + s * cellW;
    const hl = s === flashSlot;
    const grad = pCtx.createLinearGradient(0, bottom - 6, 0, bottom + 14);
    grad.addColorStop(0, hl ? 'rgba(245,197,24,0.55)' : 'rgba(245,197,24,0.22)');
    grad.addColorStop(1, hl ? 'rgba(245,197,24,0.12)' : 'rgba(245,197,24,0.06)');
    pCtx.fillStyle = grad;
    pCtx.fillRect(x + 1, bottom - 6, cellW - 2, 20);
    pCtx.strokeStyle = hl ? '#f5c518' : 'rgba(245,197,24,0.35)';
    pCtx.lineWidth = hl ? 1.6 : 1;
    pCtx.strokeRect(x + 1, bottom - 6, cellW - 2, 20);
    pCtx.font = '700 ' + Math.max(8, Math.min(11, cellW * 0.2)) + 'px system-ui';
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'middle';
    pCtx.fillStyle = hl ? '#fff8d8' : '#f5c518';
    pCtx.fillText(fmtMultC(pPays[s]), x + cellW / 2, bottom + 7);
  }
  /* أثر الكرات — نقاط ذهبية باهتة متلاشية */
  pBalls.forEach(b => {
    if (!b.trail || !b.trail.length) return;
    b.trail.forEach((pt, i) => {
      const a = 0.28 * (i / b.trail.length);
      pCtx.beginPath();
      pCtx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      pCtx.fillStyle = 'rgba(245,197,24,' + a.toFixed(3) + ')';
      pCtx.fill();
    });
  });
  /* الكرات الذهبية المتوهجة */
  pBalls.forEach(b => {
    const gr = pCtx.createRadialGradient(b.x - 2, b.y - 3, 1, b.x, b.y, 8);
    gr.addColorStop(0, '#fff8d8');
    gr.addColorStop(0.4, '#f5c518');
    gr.addColorStop(1, '#b8860b');
    pCtx.beginPath();
    pCtx.arc(b.x, b.y, 6.5, 0, Math.PI * 2);
    pCtx.shadowColor = 'rgba(245,197,24,0.8)';
    pCtx.shadowBlur = 14;
    pCtx.fillStyle = gr;
    pCtx.fill();
    pCtx.shadowBlur = 0;
  });
}
function pDrop() {
  if (pRunning) return; /* حماية الاستدعاء المزدوج */
  if (!take()) return;
  pRunning = true;
  const path = [];
  for (let r = 0; r < pRows; r++) path.push(Math.random() < 0.5 ? 1 : 0);
  pBalls.push({ path, t: 0, lastSeg: 0 });
  SND.spin();
  gres('', 0);
  animatePlinko(pBalls[0]);
}
function animatePlinko(ball) {
  if (!pRunning) return;
  const w = pCanvas.width, h = pCanvas.height;
  const top = 40, bottom = h - 56, left = 26, right = w - 26;
  const n = pRows;
  const ROWF = 13; /* عدد الإطارات لكل انتقال صف */
  const total = (n + 1) * ROWF;
  const prog = ball.t / ROWF;
  const seg = Math.min(n, Math.floor(prog));
  const f = Math.min(1, prog - seg);
  const ease = f * f * (3 - 2 * f); /* smoothstep */
  const y0 = 26;
  const yA = y0 + (bottom - y0) * seg / (n + 1);
  const yB = y0 + (bottom - y0) * (seg + 1) / (n + 1);
  ball.y = yA + (yB - yA) * ease;
  let px = 0;
  for (let r = 0; r < seg; r++) px += ball.path[r];
  const cellW = (right - left) / (n + 1);
  const xA = left + (right - left) * (px + 1) / (seg + 2);
  const px2 = px + (seg < n ? ball.path[seg] : 0);
  const xB = seg < n ? left + (right - left) * (px2 + 1) / (seg + 3) : left + (px2 + 0.5) * cellW;
  /* اهتزاز جانبي خفيف عند اجتياز الأوتاد */
  const wob = Math.sin(f * Math.PI * 2) * 3;
  ball.x = xA + (xB - xA) * ease + wob;
  /* صوت ارتطام بالوتد عند تغيّر الصف */
  if (seg !== ball.lastSeg) {
    SND.peg();
    ball.lastSeg = seg;
  }
  /* أثر متوهج خافت — آخر 12 موضعاً */
  if (ball.t % 2 === 0) {
    if (!ball.trail) ball.trail = [];
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 12) ball.trail.shift();
  }
  ball.t++;
  drawPlinko();
  if (ball.t <= total) {
    requestAnimationFrame(() => animatePlinko(ball));
    return;
  }
  /* الاستقرار والدفع */
  let peg = 0;
  for (let r = 0; r < n; r++) peg += ball.path[r];
  const mult = pPays[peg];
  const gw = Math.floor(GB * mult);
  give(gw);
  if (mult >= 1) {
    SND.coin();
    gres(fmtMult(mult) + '× +' + fmt(gw) + ' 🪙', gw);
    winFX(gw);
  } else {
    gres(fmtMult(mult) + '× −' + fmt(GB - gw) + ' 🪙', 0);
    winFX(0);
  }
  fairTick();
  ball.slot = peg;
  ball.flash = 42;
  (function flashLoop() {
    ball.flash--;
    drawPlinko();
    if (ball.flash <= 0) {
      pBalls = pBalls.filter(b => b !== ball);
      if (!pBalls.length) pRunning = false;
      return;
    }
    requestAnimationFrame(flashLoop);
  })();
}

/* ═══════════ 4. Dice — نرد فاخر ═══════════ */
let dTarget = 50;
let dUnder = true;
let dRolling = false;
function eDice(g) {
  return gFrame(
    '<div class="dc-hint">🎲 ' + T('dc.hint') + '</div>' +
    '<div class="dc-wrap">' +
      '<div class="sb-dice" id="dDice">' +
        '<div class="sb-die" id="dD0"><span>1</span></div>' +
        '<div class="sb-die" id="dD1"><span>1</span></div>' +
        '<div class="sb-die" id="dD2"><span>1</span></div>' +
      '</div>' +
      '<div class="dc-num"><span id="dRollNum">--.--</span><b id="dRollSide"></b></div>' +
    '</div>' +
    '<div class="dc-target">' +
      '<span class="ctext">' + T('dc.target') + '</span>' +
      '<input type="range" id="dTargetInput" min="1" max="98" value="50" oninput="dSetTarget(this.value)">' +
      '<b id="dTargetVal">50</b>' +
    '</div>' +
    '<div class="dc-mult">' + T('dc.mult') + ' <b id="dMult">×1.96</b></div>' +
    '<div class="bets dc-bets">' +
      '<button class="rb dc-under active" id="dBtnUnder" onclick="dSetUnder(true)">⬇ ' + T('g.under') + '</button>' +
      '<button class="rb dc-above" id="dBtnAbove" onclick="dSetUnder(false)">⬆ ' + T('g.above') + '</button>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big dc-roll" id="dRollBtn" onclick="dRoll()">🎲 ' + T('dc.roll') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function dMultCalc() {
  const P = dUnder ? dTarget : 100 - dTarget;
  return 0.98 * 100 / P;
}
function dSetTarget(v) {
  dTarget = parseInt(v, 10);
  const tv = document.getElementById('dTargetVal');
  if (tv) tv.textContent = dTarget;
  const m = document.getElementById('dMult');
  if (m) m.textContent = '×' + fmt(Math.round(dMultCalc() * 100) / 100);
}
function dSetUnder(v) {
  dUnder = v;
  const bu = document.getElementById('dBtnUnder');
  const ba = document.getElementById('dBtnAbove');
  if (bu) bu.classList.toggle('active', v);
  if (ba) ba.classList.toggle('active', !v);
  const m = document.getElementById('dMult');
  if (m) m.textContent = '×' + fmt(Math.round(dMultCalc() * 100) / 100);
  SND.click();
}
function dRoll() {
  if (dRolling) return;
  if (!take()) return;
  dRolling = true;
  SND.spin();
  const btn = document.getElementById('dRollBtn');
  if (btn) btn.disabled = true;
  const wrap = document.getElementById('dDice');
  const numEl = document.getElementById('dRollNum');
  const sideEl = document.getElementById('dRollSide');
  const diceEls = ['dD0', 'dD1', 'dD2'].map(function (id) { return document.getElementById(id); });
  diceEls.forEach(function (el) { if (el) el.classList.remove('won'); });
  if (wrap) wrap.classList.add('rolling');
  /* نتيجة حتمية من استدعاء واحد — النردات بصرية مشتقة من الرقم */
  const roll = Math.floor(Math.random() * 10000) / 100;
  const win = dUnder ? roll < dTarget : roll > dTarget;
  const P = dUnder ? dTarget : 100 - dTarget;
  const mult = 0.98 * 100 / P;
  const payout = win ? Math.floor(GB * mult) : 0;
  const faces = [
    (Math.floor(roll) % 6) + 1,
    ((Math.floor(roll) + 7) % 6) + 1,
    ((Math.floor(roll) + 14) % 6) + 1
  ];
  let ticks = 0;
  const timer = setInterval(function () {
    ticks++;
    diceEls.forEach(function (el) {
      if (el) el.querySelector('span').textContent = Math.floor(Math.random() * 6) + 1;
    });
    if (ticks >= 8) {
      clearInterval(timer);
      if (wrap) wrap.classList.remove('rolling');
      diceEls.forEach(function (el, i) {
        if (el) el.querySelector('span').textContent = faces[i];
      });
      if (numEl) numEl.textContent = roll.toFixed(2);
      if (sideEl) sideEl.textContent = dUnder ? '⬇' : '⬆';
      if (win) {
        give(payout);
        diceEls.forEach(function (el) { if (el) el.classList.add('won'); });
      }
      gres(win ? '×' + fmt(Math.round(mult * 100) / 100) + ' +' + fmt(payout) + ' 🪙' : T('ts.lose'), win ? payout : 0);
      winFX(payout);
      fairTick();
      dRolling = false;
      if (btn) btn.disabled = false;
    }
  }, 80);
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
  /* استدعاء واحد حتمي لـ Math.random — النتيجة محسوبة قبل الدوران */
  const win = Math.random() < 0.5;
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
    r: hRanks[Math.floor(Math.random() * 13)],
    s: ['♠','♥','♦','♣'][Math.floor(Math.random() * 4)]
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

/* ═══════════ 7. Wheel of Fortune ═══════════ */
/* 12 قطاعاً موزوناً — القوس ∝ 1/المضاعف، EV 11 ÷ مجموع الأوزان 11.282 = RTP 97.5% */
let wSegments = [
  { mult: 10, color: '#f43f5e' },
  { mult: 5, color: '#f97316' },
  { mult: 3, color: '#f59e0b' },
  { mult: 2, color: '#10b981' },
  { mult: 2, color: '#14b8a6' },
  { mult: 1.5, color: '#06b6d4' },
  { mult: 1, color: '#3b82f6' },
  { mult: 1, color: '#6366f1' },
  { mult: 0.5, color: '#7c3aed' },
  { mult: 0.5, color: '#a855f7' },
  { mult: 0.5, color: '#d946ef' },
  { mult: 0, color: '#991b1b' }
];
const wWeights = [0.1, 0.2, 0.333333, 0.5, 0.5, 0.666667, 1, 1, 2, 2, 2, 0.982];
const wWeightSum = wWeights.reduce((a, b) => a + b, 0);
let wAngle = 0, wSpinning = false, wLastIdx = -1;
function eWheel(g) {
  return gFrame(
    '<div class="wf-wrap">' +
      '<div class="wf-hint">' + T('wf.hint') + '</div>' +
      '<div class="wf-holder">' +
        '<div class="wf-pointer" aria-hidden="true"></div>' +
        '<canvas id="wCv" width="320" height="320"></canvas>' +
      '</div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big" id="wSpin" onclick="wSpin()"> ' + T('g.spin') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function initWheel() {
  const cv = document.getElementById('wCv');
  if (!cv) return;
  drawWheel(cv.getContext('2d'), 0, -1);
  wLastIdx = -1;
}
function drawWheel(ctx, rot, winIdx) {
  if (!ctx) return;
  const cx = 160, cy = 160, r = 145, a = (Math.PI * 2) / wSegments.length;
  ctx.clearRect(0, 0, 320, 320);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  /* الأقسام */
  wSegments.forEach((seg, i) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, i * a, (i + 1) * a);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,26,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  /* توهج القسم الفائز بعد التوقف */
  if (winIdx >= 0) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, winIdx * a, (winIdx + 1) * a);
    ctx.closePath();
    ctx.fillStyle = wSegments[winIdx].color;
    ctx.shadowColor = 'rgba(245,197,24,0.95)';
    ctx.shadowBlur = 26;
    ctx.fill();
    ctx.restore();
  }
  /* ملصقات شعاعية على امتداد نصف القطر */
  wSegments.forEach((seg, i) => {
    const center = i * a + a / 2;
    const flip = Math.cos(center) < 0;
    ctx.save();
    ctx.rotate(center + (flip ? Math.PI : 0));
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Cairo, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    /* هالة داكنة حول الحروف لضمان تباين ≥4.5:1 على الأقسام الفاتحة */
    ctx.strokeStyle = 'rgba(10,14,26,0.92)';
    ctx.lineWidth = 3;
    ctx.strokeText(seg.mult + '×', (flip ? -1 : 1) * r * 0.52, 0);
    ctx.fillText(seg.mult + '×', (flip ? -1 : 1) * r * 0.52, 0);
    ctx.restore();
  });
  ctx.restore();
  /* إطار ذهبي خارجي */
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#F5C518';
  ctx.lineWidth = 6;
  ctx.shadowColor = 'rgba(245,197,24,0.6)';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();
  /* مركز ذهبي */
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fillStyle = '#F5C518';
  ctx.shadowColor = 'rgba(245,197,24,0.8)';
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.strokeStyle = '#8a6a0a';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}
function wSpin() {
  const cv = document.getElementById('wCv');
  if (wSpinning || !cv) return;
  if (!take()) return;
  wSpinning = true;
  const btn = document.getElementById('wSpin');
  if (btn) btn.disabled = true;
  SND.spin();
  gres('', 0);
  const ctx = cv.getContext('2d');
  /* اختيار موزون — استدعاء Math.random واحد فقط */
  const r = Math.random();
  let idx = wSegments.length - 1;
  let acc = 0;
  for (let i = 0; i < wWeights.length; i++) {
    acc += wWeights[i];
    if (r < acc / wWeightSum) { idx = i; break; }
  }
  const a = (Math.PI * 2) / wSegments.length;
  /* المؤشر أعلى العجلة (−π/2) — يصطف مركز القسم الفائز تحته تماماً */
  const targetRot = 6 * Math.PI * 2 - Math.PI / 2 - (idx * a + a / 2);
  const start = performance.now();
  const DUR = 4200;
  let lastWIdx = -1;
  let lastTick = 0;
  function animate(now) {
    const progress = Math.min((now - start) / DUR, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    const rot = eased * targetRot;
    drawWheel(ctx, rot, -1);
    /* نقرات مرور الأقسام تحت المؤشر العلوي */
    const pAng = ((3 * Math.PI / 2 - rot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const curIdx = Math.floor(pAng / a);
    const nowMs = performance.now();
    if (curIdx !== lastWIdx && nowMs - lastTick > 30) {
      SND.tick();
      lastWIdx = curIdx;
      lastTick = nowMs;
    }
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      wAngle = targetRot;
      wLastIdx = idx;
      drawWheel(ctx, targetRot, idx);
      finishSpin(idx);
    }
  }
  requestAnimationFrame(animate);
}
function finishSpin(idx) {
  wSpinning = false;
  const btn = document.getElementById('wSpin');
  if (btn) btn.disabled = false;
  const seg = wSegments[idx];
  const w = Math.floor(GB * seg.mult);
  give(w); /* يُعيد دائماً: ×1 استرداد كامل، ×0.5 خسارة جزئية، ×0 خسارة */
  if (seg.mult > 1) {
    SND.coin();
    gres(seg.mult + '× +' + fmt(w) + ' 🪙', w);
    winFX(w);
  } else if (seg.mult === 1) {
    SND.click();
    gres('1× ' + T('wf.refund'), 0);
  } else if (seg.mult === 0.5) {
    SND.lose();
    gres('0.5× −' + fmt(GB - w) + ' 🪙', 0);
  } else {
    SND.lose();
    gres(T('ts.lose'), 0);
  }
  fairTick();
}

/* ═══════════ 8. Scratch — Diamond Mine ═══════════ */
let sGrid = [], sSafe = 0, sBombHit = 0, sBombs = 3, sPlaying = false;
function eScratch(g) {
  /* خلايا جاهزة عند الفتح — النقر قبل البدء لا يفعل شيئاً (sPlaying=false) */
  let cellsHtml = '';
  for (let i = 0; i < 9; i++) {
    cellsHtml += '<div class="sCell" data-idx="' + i + '" onclick="sReveal(' + i + ')"><span class="s-tile">🎫</span></div>';
  }
  return gFrame(
    '<div class="sc-wrap">' +
      '<div class="sc-counter" id="sCounter">💎 <b>0</b>/6 ' + T('sc.safe') + ' &nbsp;·&nbsp; 💣 <b>3</b> ' + T('sc.bomb') + ' ' + T('sc.left') + '</div>' +
      '<div class="sc-grid" id="sGrid">' + cellsHtml + '</div>' +
      '<div class="sc-hint">💎 ' + T('sc.hint') + '</div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big sc-start" id="sStart" onclick="sStart()">🎫 ' + T('g.start') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function sStart() {
  if (sPlaying) return;
  if (!take()) return;
  sPlaying = true;
  sSafe = 0;
  sBombHit = 0;
  /* 6 ماسات 💎 + 3 ألغام 💣 تُخلط عشوائياً في كل جولة */
  const symbols = ['💎', '💎', '💎', '💎', '💎', '💎', '💣', '💣', '💣'];
  for (let i = symbols.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = symbols[i]; symbols[i] = symbols[j]; symbols[j] = t;
  }
  sGrid = symbols.map(function (s) { return { symbol: s, revealed: false }; });
  const grid = document.getElementById('sGrid');
  if (grid) {
    grid.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'sCell';
      cell.dataset.idx = i;
      cell.onclick = () => sReveal(i);
      cell.innerHTML = '<span class="s-tile">🎫</span>';
      grid.appendChild(cell);
    }
  }
  const btn = document.getElementById('sStart');
  if (btn) btn.disabled = true;
  sCounter();
  SND.click();
  gres('', 0);
}
function sCounter() {
  const c = document.getElementById('sCounter');
  if (!c) return;
  c.innerHTML = '💎 <b>' + sSafe + '</b>/6 ' + T('sc.safe') + ' &nbsp;·&nbsp; 💣 <b>' + (sBombs - sBombHit) + '</b> ' + T('sc.bomb') + ' ' + T('sc.left');
}
function sReveal(i) {
  if (!sPlaying || sGrid[i].revealed) return;
  sGrid[i].revealed = true;
  const cell = document.querySelector('.sCell[data-idx="' + i + '"]');
  if (!cell) return;
  if (sGrid[i].symbol === '💣') {
    sPlaying = false;
    sBombHit++;
    cell.classList.add('revealed', 's-boom');
    cell.innerHTML = '<span class="s-tile">💥</span>';
    /* كشف باقي الألغام المخفية ليعرف اللاعب مكانها */
    sGrid.forEach(function (sym, idx) {
      if (!sym.revealed && sym.symbol === '💣') {
        const c2 = document.querySelector('.sCell[data-idx="' + idx + '"]');
        if (c2) { c2.classList.add('revealed'); c2.innerHTML = '<span class="s-tile">💣</span>'; }
      }
    });
    sCounter();
    SND.lose();
    gres(T('sc.lose'), 0);
    document.getElementById('sStart').disabled = false;
    return;
  }
  sSafe++;
  cell.classList.add('revealed', 's-safe');
  cell.innerHTML = '<span class="s-tile">💎</span>';
  SND.click();
  if (sSafe === 6) {
    sPlaying = false;
    /* إظهار الألغام المتبقية عند إكمال جميع الماسات */
    sGrid.forEach(function (sym, idx) {
      if (!sym.revealed) {
        const c2 = document.querySelector('.sCell[data-idx="' + idx + '"]');
        if (c2) { c2.classList.add('revealed', 's-won'); c2.innerHTML = '<span class="s-tile">💣</span>'; }
      }
    });
    sCounter();
    const w = Math.floor(GB * 80);
    give(w);
    SND.coin();
    gres(T('sc.win') + ' ×80 +' + fmt(w) + ' 🪙', w);
    winFX(w);
    fairTick();
    document.getElementById('sStart').disabled = false;
    return;
  }
  sCounter();
}

/* ═══════════ 9. Wingo ═══════════ */
/* 3 ألوان موزونة (أحمر 3/6، أخضر 2/6، أزرق 1/6) — مضاعفات تمنح RTP 95% لكل اختيار:
   أحمر 0.5×1.9 = 0.95، أخضر ⅓×2.85 = 0.95، أزرق ⅙×5.7 = 0.95 */
let wgPickColor = 'red', wgBusy = false;
const wgColors = [
  { key: 'red',   em: '🔴', mult: 1.9,  p: 3 },
  { key: 'green', em: '🟢', mult: 2.85, p: 2 },
  { key: 'blue',  em: '🔵', mult: 5.7,  p: 1 }
];
const wgPool = ['red', 'red', 'red', 'green', 'green', 'blue'];
function eWingo(g) {
  return gFrame(
    '<div class="wg-hint">' + T('wg.hint') + '</div>' +
    '<div class="wg-ball" id="wgBall"><span class="wg-ball-face" id="wgBallFace">?</span></div>' +
    '<div class="wg-picks">' +
      wgColors.map(c =>
        '<button class="wg-pick' + (c.key === wgPickColor ? ' sel' : '') + '" id="wgPick-' + c.key + '" data-c="' + c.key + '" onclick="wPick(\'' + c.key + '\')">' +
          '<span class="wg-dot ' + c.key + '"></span>' +
          '<span class="wg-lab">' + c.em + ' ×' + c.mult + '</span>' +
        '</button>'
      ).join('') +
    '</div>' +
    '<div class="bets">' +
      '<button class="big" id="wDraw" onclick="wDraw()"> ' + T('g.draw') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function wPick(c) {
  if (wgBusy) return;
  wgPickColor = c;
  document.querySelectorAll('.wg-pick').forEach(function (b) {
    b.classList.toggle('sel', b.getAttribute('data-c') === c);
  });
  SND.click();
}
function wDraw() {
  if (wgBusy) return;
  if (!take()) return;
  wgBusy = true;
  const btn = document.getElementById('wDraw');
  if (btn) btn.disabled = true;
  const ball = document.getElementById('wgBall');
  const face = document.getElementById('wgBallFace');
  if (ball) { ball.classList.remove('win', 'lose'); ball.classList.add('shuffle'); }
  SND.spin();
  /* كشف حتمي باستدعاء Math.random واحد: فهرس كرة من 6 موزونة */
  const c = wgPool[Math.floor(Math.random() * 6)];
  const col = wgColors.find(x => x.key === c);
  const win = c === wgPickColor;
  const w = Math.floor(GB * col.mult);
  /* وميض سريع ثم كشف اللون الفائز */
  let flashes = 0;
  const timer = setInterval(function () {
    flashes++;
    if (!ball) { clearInterval(timer); return; }
    ball.dataset.c = wgPool[Math.floor(Math.random() * 6)];
    if (flashes >= 3) clearInterval(timer);
  }, 280);
  setTimeout(function () {
    clearInterval(timer);
    if (ball) {
      ball.classList.remove('shuffle');
      ball.dataset.c = c;
      ball.classList.add(win ? 'win' : 'lose');
    }
    if (face) face.textContent = col.em;
    if (win) {
      give(w);
      SND.coin();
      gres(col.em + ' ×' + col.mult + ' +' + fmt(w) + ' 🪙', w);
      winFX(w);
    } else {
      SND.lose();
      gres(T('ts.lose') + ' — ' + col.em, 0);
      winFX(0);
    }
    fairTick();
    wgBusy = false;
    if (btn) btn.disabled = false;
  }, 1500);
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
  /* كشف حتمي باستدعاء Math.random واحد — حركة الحاسوب */
  const c = RPS_MOVES[Math.floor(Math.random() * 3)];
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
  /* كشف حتمي باستدعاء Math.random واحد — جهة الحارس من 9 جهات (P(تصدي)=1/9) */
  const gk = PN_DIRS[Math.floor(Math.random() * 9)];
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

/* ═══════════ 12. Lucky 7 ═══════════ */
/* تنبأ بالرقم (1-9): <7 (1-6) ×1.4 | =7 (7) ×8.6 | >7 (8-9) ×4.3
   RTP: low 93.3% / seven 95.6% / high 95.6% — متوسط 94.8% (هامش كازينو إيجابي على كل رهان) */
var l7Busy = false;
const L7_MULTS = { low: 1.4, high: 4.3, '7': 8.6 };
function l7Wins(g, ball) {
  if (g === '7') return ball === 7;
  return g === 'low' ? ball <= 6 : ball >= 8;
}
function l7SetBusy(b) {
  l7Busy = b;
  const btns = document.querySelectorAll('.l7Btn');
  for (let i = 0; i < btns.length; i++) btns[i].disabled = b;
}
function eLucky7(g) {
  return gFrame(
    '<div class="l7-hint">' + T('l7.hint') + '</div>' +
    '<div class="l7-arena">' +
      '<div class="l7-slot">' +
        '<div class="l7-ball" id="l7Ball">?</div>' +
        '<div class="l7-lane" id="l7Lane">' +
          [1,2,3,4,5,6,7,8,9].map(function (n) {
            return '<span data-n="' + n + '">' + n + '</span>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="l7-picks">' +
      '<button class="l7Btn l7-low" data-g="low" onclick="l7Guess(\'low\')"><span class="l7-nums">1-6</span><span class="l7-name">' + T('l7.low') + '</span><span class="l7-mult">×1.4</span></button>' +
      '<button class="l7Btn l7-seven" data-g="7" onclick="l7Guess(\'7\')"><span class="l7-nums">7</span><span class="l7-name">' + T('l7.seven') + '</span><span class="l7-mult">×8.6</span></button>' +
      '<button class="l7Btn l7-high" data-g="high" onclick="l7Guess(\'high\')"><span class="l7-nums">8-9</span><span class="l7-name">' + T('l7.high') + '</span><span class="l7-mult">×4.3</span></button>' +
    '</div>' +
    '<div class="l7-status" id="l7Result"></div>' +
    betRow(),
    g
  );
}
function l7Guess(g) {
  if (l7Busy) return;
  if (!take()) return;
  l7SetBusy(true);
  SND.spin();
  const ball = Math.floor(Math.random() * 9) + 1;
  const el = document.getElementById('l7Ball');
  const res = document.getElementById('l7Result');
  if (el) {
    el.classList.add('l7-roll');
    setTimeout(function () {
      el.classList.remove('l7-roll');
      el.textContent = ball;
    }, 350);
  }
  /* تمييز الرقم المسحوب في الشريط */
  const lane = document.getElementById('l7Lane');
  if (lane) {
    const prev = lane.querySelector('.hit');
    if (prev) prev.classList.remove('hit');
    const hit = lane.querySelector('span[data-n="' + ball + '"]');
    if (hit) hit.classList.add('hit');
  }
  const win = l7Wins(g, ball);
  const mult = win ? L7_MULTS[g] : 0;
  const w = Math.floor(GB * mult);
  setTimeout(function () {
    if (win) {
      give(w);
      SND.coin();
      if (res) { res.textContent = T('l7.ball') + ' ' + ball + ' — ' + T('l7.win'); res.className = 'l7-status win'; }
      gres('×' + mult + ' +' + fmt(w) + ' 🪙', w);
      winFX(w);
    } else {
      SND.lose();
      if (res) { res.textContent = T('l7.ball') + ' ' + ball + ' — ' + T('l7.lose'); res.className = 'l7-status lose'; }
      gres(T('ts.lose'), 0);
      winFX(0);
    }
    fairTick();
    setTimeout(function () {
      l7SetBusy(false);
      if (el) el.textContent = '?';
    }, 1300);
  }, 500);
}

/* ═══════════ 13. Sic Bo ═══════════ */
let sbBetType = 'small';
let sbRolling = false;
function eSicbo(g) {
  return gFrame(
    '<div class="sb-wrap">' +
      '<div class="sb-dice" id="sbDice">' +
        '<div class="sb-die" id="sbD0"><span>1</span></div>' +
        '<div class="sb-die" id="sbD1"><span>1</span></div>' +
        '<div class="sb-die" id="sbD2"><span>1</span></div>' +
      '</div>' +
      '<div class="sb-sum"><span id="sbSumLbl">' + T('sb.sum') + '</span><b id="sbSum">3</b></div>' +
    '</div>' +
    '<div class="bets sb-bets">' +
      '<button class="rb sb-rb sb-small active" id="sbBtnSmall" onclick="sbBet(\'small\')">' + T('sb.small') + ' <b>×2</b></button>' +
      '<button class="rb sb-rb sb-big" id="sbBtnBig" onclick="sbBet(\'big\')">' + T('sb.big') + ' <b>×2</b></button>' +
      '<button class="rb sb-rb sb-triple" id="sbBtnTriple" onclick="sbBet(\'triple\')">' + T('sb.triple') + ' <b>×30</b></button>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big sb-roll" id="sbRollBtn" onclick="sbRoll()">🎲 ' + T('sb.roll') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function sbBet(t) {
  sbBetType = t;
  [['small', 'sbBtnSmall'], ['big', 'sbBtnBig'], ['triple', 'sbBtnTriple']].forEach(function (pair) {
    const el = document.getElementById(pair[1]);
    if (el) el.classList.toggle('active', pair[0] === t);
  });
  SND.click();
}
function sbRoll() {
  if (sbRolling) return;
  if (!take()) return;
  sbRolling = true;
  SND.spin();
  const btn = document.getElementById('sbRollBtn');
  if (btn) btn.disabled = true;
  const diceEls = ['sbD0', 'sbD1', 'sbD2'].map(function (id) { return document.getElementById(id); });
  const diceWrap = document.getElementById('sbDice');
  const sumEl = document.getElementById('sbSum');
  if (diceWrap) diceWrap.classList.add('rolling');
  const rolls = [0, 0, 0];
  let ticks = 0;
  const timer = setInterval(function () {
    ticks++;
    rolls[0] = Math.floor(Math.random() * 6) + 1;
    rolls[1] = Math.floor(Math.random() * 6) + 1;
    rolls[2] = Math.floor(Math.random() * 6) + 1;
    diceEls.forEach(function (el, i) { if (el) el.querySelector('span').textContent = rolls[i]; });
    if (ticks >= 10) {
      clearInterval(timer);
      finishSbRoll(rolls, diceEls, diceWrap, sumEl, btn);
    }
  }, 90);
}
function finishSbRoll(rolls, diceEls, diceWrap, sumEl, btn) {
  const sum = rolls.reduce(function (a, b) { return a + b; }, 0);
  if (diceWrap) diceWrap.classList.remove('rolling');
  if (sumEl) sumEl.textContent = sum;
  let win = false, mult = 0;
  if (sbBetType === 'small') { win = sum >= 4 && sum <= 10 && !(rolls[0] === rolls[1] && rolls[1] === rolls[2]); mult = 2; }
  else if (sbBetType === 'big') { win = sum >= 11 && sum <= 17 && !(rolls[0] === rolls[1] && rolls[1] === rolls[2]); mult = 2; }
  else { win = rolls[0] === rolls[1] && rolls[1] === rolls[2]; mult = 30; }
  const w = Math.floor(GB * mult);
  if (win) {
    give(w);
    diceEls.forEach(function (el) { if (el) el.classList.add('won'); });
  }
  gres(win ? '×' + mult + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), win ? w : 0);
  winFX(w);
  fairTick();
  sbRolling = false;
  if (btn) btn.disabled = false;
}

/* ═══════════ 14. Roulette ═══════════ */
const rlNumbers = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
function rlColorOf(n) {
  if (n === 0) return 'green';
  const idx = rlNumbers.indexOf(n);
  return (idx % 2 === 0) ? 'red' : 'black';
}
let rlBetChoice = 'red';
let rlSpinning = false;
let rlLastRot = 0;
function eRoulette(g) {
  return gFrame(
    '<div class="rl-stage">' +
      '<div class="rl-wheel" id="rlWrap">' +
        /* [Real] عجلة المنصة الحقيقية (icon-roulette أصل مرقّم 0-36) تدور حول مركزها */
        '<div class="rl-real-wheel" id="rlRealWheel" style="background-image:url(assets/games/roulette/wheel.png)"></div>' +
        '<div class="rl-ball" id="rlBall" aria-hidden="true"></div>' +
        '<div class="rl-pointer" aria-hidden="true"></div>' +
      '</div>' +
      '<div class="rl-last" id="rlLast">' + T('rl.wait') + '</div>' +
    '</div>' +
    '<div class="grid g3 rl-bets">' +
      '<button class="rb rl-b red" id="rlBtnRed" onclick="rlBet(\'red\')"><i class="fa-solid fa-circle rl-dot red" aria-hidden="true"></i> ' + T('rl.red') + ' <b>×2</b></button>' +
      '<button class="rb rl-b black" id="rlBtnBlack" onclick="rlBet(\'black\')"><i class="fa-solid fa-circle rl-dot black" aria-hidden="true"></i> ' + T('rl.black') + ' <b>×2</b></button>' +
      '<button class="rb rl-b green" id="rlBtnGreen" onclick="rlBet(\'green\')"><i class="fa-solid fa-circle rl-dot green" aria-hidden="true"></i> ' + T('rl.green') + ' <b>×14</b></button>' +
      '<button class="rb rl-b" id="rlBtnEven" onclick="rlBet(\'even\')"><i class="fa-solid fa-plus" aria-hidden="true"></i> ' + T('rl.even') + ' <b>×2</b></button>' +
      '<button class="rb rl-b" id="rlBtnOdd" onclick="rlBet(\'odd\')"><i class="fa-solid fa-minus" aria-hidden="true"></i> ' + T('rl.odd') + ' <b>×2</b></button>' +
      '<button class="rb rl-b" id="rlBtn18" onclick="rlBet(\'1-18\')">1-18 <b>×2</b></button>' +
      '<button class="rb rl-b" id="rlBtn36" onclick="rlBet(\'19-36\')">19-36 <b>×2</b></button>' +
      '<button class="rb rl-b" id="rlBtnD1" onclick="rlBet(\'1-12\')">1-12 <b>×3</b></button>' +
      '<button class="rb rl-b" id="rlBtnD2" onclick="rlBet(\'13-24\')">13-24 <b>×3</b></button>' +
      '<button class="rb rl-b" id="rlBtnD3" onclick="rlBet(\'25-36\')">25-36 <b>×3</b></button>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big rl-spin" id="rlSpinBtn" onclick="rlSpin()"><i class="fa-solid fa-rotate" aria-hidden="true"></i> ' + T('rl.spin') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function rlBet(c) {
  rlBetChoice = c;
  [['red','rlBtnRed'],['black','rlBtnBlack'],['green','rlBtnGreen'],['even','rlBtnEven'],['odd','rlBtnOdd'],
   ['1-18','rlBtn18'],['19-36','rlBtn36'],['1-12','rlBtnD1'],['13-24','rlBtnD2'],['25-36','rlBtnD3']].forEach(function(pair) {
    const el = document.getElementById(pair[1]);
    if (el) el.classList.toggle('active', pair[0] === c);
  });
  SND.click();
}
function initRoulette() {
  /* [Real] العجلة صورة أصل حقيقية تدور بـ CSS transform — لا canvas */
  const wheel = document.getElementById('rlRealWheel');
  if (wheel) wheel.style.transform = 'rotate(0rad)';
  /* الحالة الافتراضية: رهان أحمر — ظهّره في الواجهة */
  const redBtn = document.getElementById('rlBtnRed');
  if (redBtn) redBtn.classList.add('active');
}
/* [Real] فيزياء دوران واقعية: العجلة تتباطأ أُسّياً من سرعة عالية،
   والكرة تدور عكس العجلة أسرع ثم تهبط تدريجياً نحو الجيب الفائز
   مع ارتدادات صغيرة عند اصطدامها بحواجز الجيوب (كما في العجلة الفعلية). */
function rlSpin() {
  if (rlSpinning) return;
  if (!take()) return;
  rlSpinning = true;
  SND.spin();
  gres('', 0);
  const spinBtn = document.getElementById('rlSpinBtn');
  if (spinBtn) spinBtn.disabled = true;
  const wheelEl = document.getElementById('rlRealWheel');
  const ballEl = document.getElementById('rlBall');
  const wrapEl = document.getElementById('rlWrap');
  if (wrapEl) wrapEl.classList.add('spinning');   /* تُظهر الكرة (opacity) */
  if (!wheelEl) { finishRoulette(Math.floor(Math.random() * rlNumbers.length)); return; }
  const seg = (Math.PI * 2) / rlNumbers.length;
  const stopAt = Math.floor(Math.random() * rlNumbers.length);
  /* المؤشر أعلى العجلة (-π/2): مركز الجيب الفائز يصطف تحته تماماً عند التوقف */
  const wheelTarget = (4 + Math.random() * 2) * Math.PI * 2 - Math.PI / 2 - (stopAt + 0.5) * seg;
  /* الكرة: تدور عكس اتجاه العجلة بسرعة أولية أعلى ثم تتباطأ أسرع وتسقط للجيب */
  const ballDir = -1; /* عكس عقارب الساعة بينما العجلة مع العقارب */
  const ballTotal = ballDir * (6 + Math.random() * 2) * Math.PI * 2 + (-Math.PI / 2 - (stopAt + 0.5) * seg - wheelTarget);
  const DUR = 6200;
  const t0 = performance.now();
  let lastTick = 0, lastBallAng = null;
  function frame(now) {
    const t = Math.min((now - t0) / DUR, 1);
    /* العجلة: تباطؤ أُسّي واقعي (سريعة ثم بطيئة جداً في النهاية) */
    const wEase = 1 - Math.pow(1 - t, 2.6);
    const rot = wEase * wheelTarget;
    wheelEl.style.transform = 'rotate(' + rot + 'rad)';
    /* الكرة: طور حر سريع عكسي (72%) ثم هبوط للجيب مع ارتداد صغير عند الحواجز */
    const dropAt = 0.72;
    let ballAng, ballR;
    if (t < dropAt) {
      const p = t / dropAt;
      const bEase = 1 - Math.pow(1 - p, 1.9);
      ballAng = ballTotal * bEase + rot * 0.35;   /* الكرة تنجرف مع دوران العجلة جزئياً */
      ballR = 44;                                  /* مسار الحافة الخارجية (%) */
    } else {
      const s = (t - dropAt) / (1 - dropAt);
      const smooth = s * s * (3 - 2 * s);          /* smoothstep هبوط ناعم */
      /* الجيب النهائي: زاوية مطلقة ثابتة تحت المؤشر (العجلة شبه متوقفة هنا) */
      const finalAbs = -Math.PI / 2 - (stopAt + 0.5) * seg;
      const freeAng = ballTotal * (1 - Math.pow(1 - 1, 1.9)) + rot * 0.35;
      const bounce = Math.sin(s * Math.PI * 7) * (1 - s) * seg * 1.6;
      ballAng = freeAng + (finalAbs + bounce - freeAng) * smooth;
      ballR = 44 - 26 * smooth;                    /* تهبط من الحافة نحو الجيب الداخلي */
    }
    /* تحديد موقع الكرة: مدار دائري حول مركز العجلة */
    if (ballEl) {
      const ang = ballAng - Math.PI / 2;
      const xPct = 50 + Math.cos(ang) * ballR;
      const yPct = 50 + Math.sin(ang) * ballR;
      ballEl.style.left = xPct + '%';
      ballEl.style.top = yPct + '%';
    }
    /* نقر عند عبور الكرة حدود جيب (فرق زاوي عن العجلة يقطع قطاعات) */
    if (lastBallAng !== null) {
      let d = ballAng - lastBallAng;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const crossed = Math.floor(Math.abs(d) / seg);
      if (crossed > 0 && now - lastTick > 24) {
        SND.tickSoft();
        lastTick = now;
      }
    }
    lastBallAng = ballAng;
    if (t < 1) requestAnimationFrame(frame);
    else {
      rlLastRot = wheelTarget;
      finishRoulette(stopAt);
    }
  }
  requestAnimationFrame(frame);
}
/* ضبط أبعاد canvas المتجاوب: حجم CSS من الحاوية (مربع) + backing store بدقة dpr */
function finishRoulette(idx) {
  rlSpinning = false;
  const spinBtn = document.getElementById('rlSpinBtn');
  if (spinBtn) spinBtn.disabled = false;
  /* [Real] إخفاء الكرة بعد التوقف على الجيب */
  const wrapEl0 = document.getElementById('rlWrap');
  if (wrapEl0) wrapEl0.classList.remove('spinning');
  const num = rlNumbers[idx];
  const color = rlColorOf(num);
  const lastEl = document.getElementById('rlLast');
  if (lastEl) lastEl.innerHTML = '<b class="' + color + '">' + num + '</b>';
  let win = false, mult = 0;
  if (rlBetChoice === 'red') { win = color === 'red'; mult = 2; }
  else if (rlBetChoice === 'black') { win = color === 'black'; mult = 2; }
  else if (rlBetChoice === 'green') { win = num === 0; mult = 14; }
  else if (rlBetChoice === 'even') { win = num !== 0 && num % 2 === 0; mult = 2; }
  else if (rlBetChoice === 'odd') { win = num % 2 === 1; mult = 2; }
  else if (rlBetChoice === '1-18') { win = num >= 1 && num <= 18; mult = 2; }
  else if (rlBetChoice === '19-36') { win = num >= 19 && num <= 36; mult = 2; }
  else if (rlBetChoice === '1-12') { win = num >= 1 && num <= 12; mult = 3; }
  else if (rlBetChoice === '13-24') { win = num >= 13 && num <= 24; mult = 3; }
  else if (rlBetChoice === '25-36') { win = num >= 25 && num <= 36; mult = 3; }
  const w = Math.floor(GB * mult);
  if (win) give(w);
  gres(win ? '×' + mult + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), win ? w : 0);
  winFX(w);
  fairTick();
  /* [Real] تثبيت العجلة الحقيقية على الرقم الفائز + اهتزاز عند الفوز الكبير */
  const wheel = document.getElementById('rlRealWheel');
  if (wheel) wheel.style.transform = 'rotate(' + rlLastRot + 'rad)';
  if (win && w >= GB * 5) {
    const wrap = document.getElementById('rlWrap');
    if (wrap) shake(wrap, 5, 380);
  }
}

/* ═══════════ 15. Baccarat ═══════════ */
let bacBetChoice = 'player';
let bcDealing = false;
function eBaccarat(g) {
  return gFrame(
    '<div class="bc-table">' +
      '<div class="bc-side">' +
        '<div class="bjal">' + T('bc.player') + '</div>' +
        '<div class="bc-cards" id="bcP"></div>' +
        '<div class="bc-total" id="bcPs">0</div>' +
      '</div>' +
      '<div class="bc-vs"><img src="assets/cards/back.webp" class="card-ic" alt=""></div>' +
      '<div class="bc-side">' +
        '<div class="bjal">' + T('bc.banker') + '</div>' +
        '<div class="bc-cards" id="bcB"></div>' +
        '<div class="bc-total" id="bcBs">0</div>' +
      '</div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="rb bc-b bc-player active" id="bcBtnPlayer" onclick="bacBet(\'player\')"> ' + T('bc.player') + ' <b>×2</b></button>' +
      '<button class="rb bc-b bc-banker" id="bcBtnBanker" onclick="bacBet(\'banker\')"> ' + T('bc.banker') + ' <b>×1.95</b></button>' +
      '<button class="rb bc-b bc-tie" id="bcBtnTie" onclick="bacBet(\'tie\')"> ' + T('bc.tie') + ' <b>×9</b></button>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big bc-deal" id="bcDealBtn" onclick="bacDeal()"><img src="assets/cards/back.webp" class="card-ic" alt=""> ' + T('bc.deal') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function bacBet(c) {
  bacBetChoice = c;
  [['player','bcBtnPlayer'],['banker','bcBtnBanker'],['tie','bcBtnTie']].forEach(function (pair) {
    const el = document.getElementById(pair[1]);
    if (el) el.classList.toggle('active', pair[0] === c);
  });
  SND.click();
}
function bcCardVal(c) {
  if (c.r === 'A') return 1;
  if (['10', 'J', 'Q', 'K'].indexOf(c.r) !== -1) return 0;
  return parseInt(c.r, 10);
}
function bcHandVal(h) {
  return h.reduce(function (a, c) { return a + bcCardVal(c); }, 0) % 10;
}
function bcBuildDeck() {
  const deck = [];
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push({ s: suits[s], r: ranks[r] });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  return deck;
}
function bcRenderCards(elId, cards) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = cards.map(function (c, i) {
    return '<div class="bc-card" style="animation-delay:' + (i * 0.12) + 's">' +
      '<img src="assets/cards/' + c.r + '-' + suitKey(c.s) + '.webp" alt="" draggable="false">' +
    '</div>';
  }).join('');
}
function bacDeal() {
  if (bcDealing) return;
  if (!take()) return;
  bcDealing = true;
  const btn = document.getElementById('bcDealBtn');
  if (btn) btn.disabled = true;
  SND.card();
  gres('', 0);
  const deck = bcBuildDeck();
  const p = [deck.pop(), deck.pop()];
  const b = [deck.pop(), deck.pop()];
  let pThird = null, bThird = null;
  const pv0 = bcHandVal(p), bv0 = bcHandVal(b);
  const pNat = pv0 >= 8, bNat = bv0 >= 8;
  if (!pNat && !bNat) {
    if (pv0 <= 5) pThird = deck.pop();
    const pv = pThird ? bcHandVal(p.concat([pThird])) : pv0;
    /* جدول السحب الثالث للبنك (قواعد الباكارات القياسية) */
    let bankerDraw;
    if (pThird === null) bankerDraw = bv0 <= 5;
    else {
      const ptVal = bcCardVal(pThird);
      if (bv0 <= 2) bankerDraw = true;
      else if (bv0 === 3) bankerDraw = ptVal !== 8;
      else if (bv0 === 4) bankerDraw = ptVal >= 2 && ptVal <= 7;
      else if (bv0 === 5) bankerDraw = ptVal >= 4 && ptVal <= 7;
      else if (bv0 === 6) bankerDraw = ptVal === 6 || ptVal === 7;
      else bankerDraw = false;
    }
    if (bankerDraw) bThird = deck.pop();
  }
  const finalP = pThird ? p.concat([pThird]) : p;
  const finalB = bThird ? b.concat([bThird]) : b;
  const pv = bcHandVal(finalP), bv = bcHandVal(finalB);
  bcRenderCards('bcP', finalP);
  bcRenderCards('bcB', finalB);
  const pe = document.getElementById('bcPs');
  const be = document.getElementById('bcBs');
  if (pe) pe.textContent = pv;
  if (be) be.textContent = bv;
  let win = false, mult = 0, resTxt = '';
  if (pv > bv) { resTxt = T('bc.player') + ' ' + T('bc.win') + (pNat ? ' (' + T('bc.natural') + ')' : ''); if (bacBetChoice === 'player') { win = true; mult = 2; } }
  else if (bv > pv) { resTxt = T('bc.banker') + ' ' + T('bc.win') + (bNat ? ' (' + T('bc.natural') + ')' : ''); if (bacBetChoice === 'banker') { win = true; mult = 1.95; } }
  else { resTxt = T('bc.tie') + '!'; if (bacBetChoice === 'tie') { win = true; mult = 9; } }
  const w = Math.floor(GB * mult);
  if (win) give(w);
  gres(resTxt + ' ' + (win ? '×' + mult + ' +' + fmt(w) + ' 🪙' : ''), win ? w : 0);
  winFX(w);
  fairTick();
  bcDealing = false;
  if (btn) btn.disabled = false;
}

/* ═══════════ 16. Dragon Tiger ═══════════ */
let dtBetChoice = 'dragon';
let dtDealing = false;
function eDragonTiger(g) {
  return gFrame(
    '<div class="bc-table dt-table">' +
      '<div class="bc-side">' +
        '<div class="bjal dt-label dt-label-dragon"><i class="fa-solid fa-dragon" aria-hidden="true"></i> ' + T('dt.dragon') + '</div>' +
        '<div class="bc-cards" id="dtD"></div>' +
      '</div>' +
      '<div class="dt-vs"><span class="vs-txt">VS</span></div>' +
      '<div class="bc-side">' +
        '<div class="bjal dt-label dt-label-tiger"><i class="fa-solid fa-paw" aria-hidden="true"></i> ' + T('dt.tiger') + '</div>' +
        '<div class="bc-cards" id="dtT"></div>' +
      '</div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="rb dt-b dt-dragon active" id="dtBtnDragon" onclick="dtBet(\'dragon\')"><i class="fa-solid fa-dragon" aria-hidden="true"></i> ' + T('dt.dragon') + ' <b>×2</b></button>' +
      '<button class="rb dt-b dt-tiger" id="dtBtnTiger" onclick="dtBet(\'tiger\')"><i class="fa-solid fa-paw" aria-hidden="true"></i> ' + T('dt.tiger') + ' <b>×2</b></button>' +
      '<button class="rb dt-b dt-tie" id="dtBtnTie" onclick="dtBet(\'tie\')"><i class="fa-solid fa-handshake" aria-hidden="true"></i> ' + T('dt.tie') + ' <b>×11</b></button>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big dt-deal" id="dtDealBtn" onclick="dtDeal()"><img src="assets/cards/back.webp" class="card-ic" alt=""> ' + T('dt.deal') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function dtBet(c) {
  dtBetChoice = c;
  [['dragon','dtBtnDragon'],['tiger','dtBtnTiger'],['tie','dtBtnTie']].forEach(function (pair) {
    const el = document.getElementById(pair[1]);
    if (el) el.classList.toggle('active', pair[0] === c);
  });
  SND.click();
}
function dtDeal() {
  if (dtDealing) return;
  if (!take()) return;
  dtDealing = true;
  const btn = document.getElementById('dtDealBtn');
  if (btn) btn.disabled = true;
  SND.card();
  gres('', 0);
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits = ['♠','♥','♦','♣'];
  const d = { r: ranks[Math.floor(Math.random()*13)], s: suits[Math.floor(Math.random()*4)] };
  const t = { r: ranks[Math.floor(Math.random()*13)], s: suits[Math.floor(Math.random()*4)] };
  const rv = ranks.indexOf(d.r), tv = ranks.indexOf(t.r);
  dtRenderCard('dtD', d);
  dtRenderCard('dtT', t);
  let win = false, mult = 0, resTxt = '';
  if (rv > tv) { resTxt = T('dt.dragon') + ' ' + T('dt.win'); if (dtBetChoice === 'dragon') { win = true; mult = 2; } }
  else if (tv > rv) { resTxt = T('dt.tiger') + ' ' + T('dt.win'); if (dtBetChoice === 'tiger') { win = true; mult = 2; } }
  else { resTxt = T('dt.tie') + '!'; if (dtBetChoice === 'tie') { win = true; mult = 11; } }
  const w = Math.floor(GB * mult);
  if (win) give(w);
  gres(resTxt + ' ' + (win ? '×' + mult + ' +' + fmt(w) + ' 🪙' : ''), win ? w : 0);
  winFX(w);
  fairTick();
  dtDealing = false;
  if (btn) btn.disabled = false;
}
function dtRenderCard(elId, c) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = '<div class="bc-card" style="animation-delay:0.15s">' +
    '<img src="assets/cards/' + c.r + '-' + suitKey(c.s) + '.webp" alt="" draggable="false">' +
  '</div>';
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

/* ═══════════ 19. Andar Bahar ═══════════ */
let abRunning = false, abJoker = null;
function abCard(c) {
  return '<span class="ab-card">' +
    '<img src="assets/cards/' + c.r + '-' + suitKey(c.s) + '.webp" alt="" draggable="false">' +
  '</span>';
}
function eAndarbahar(g) {
  return gFrame(
    '<div class="ab-hint">' + T('ab.hint') + '</div>' +
    '<div class="ab-joker-box">' +
      '<div class="ab-joker-label"><img src="assets/cards/back.webp" class="card-ic" alt=""> ' + T('ab.joker') + '</div>' +
      '<div class="ab-joker" id="abJoker"><img src="assets/cards/back.webp" class="card-ic" alt=""></div>' +
    '</div>' +
    '<div class="ab-sides">' +
      '<div class="ab-side ab-side-andar">' +
        '<div class="ab-side-name"><i class="fa-solid fa-circle ab-dot-a" aria-hidden="true"></i> ' + T('ab.andar') + '</div>' +
        '<div class="ab-cards" id="abAndar"></div>' +
        '<div class="ab-cnt" id="abAndarCnt">0</div>' +
      '</div>' +
      '<div class="ab-side ab-side-bahar">' +
        '<div class="ab-side-name"><i class="fa-solid fa-circle ab-dot-b" aria-hidden="true"></i> ' + T('ab.bahar') + '</div>' +
        '<div class="ab-cards" id="abBahar"></div>' +
        '<div class="ab-cnt" id="abBaharCnt">0</div>' +
      '</div>' +
    '</div>' +
    '<div class="ab-status" id="abResult"></div>' +
    '<div class="bets">' +
      '<button class="abBtn ab-andar" id="abBtnAndar" onclick="abGo(\'andar\')">' +
        '<span class="ab-name">' + T('ab.andar') + '</span><span class="ab-mult">×1.9</span>' +
      '</button>' +
      '<button class="abBtn ab-bahar" id="abBtnBahar" onclick="abGo(\'bahar\')">' +
        '<span class="ab-name">' + T('ab.bahar') + '</span><span class="ab-mult">×1.9</span>' +
      '</button>' +
    '</div>' +
    betRow(),
    g
  );
}
function abSetBusy(b) {
  const a = document.getElementById('abBtnAndar');
  const bb = document.getElementById('abBtnBahar');
  if (a) a.disabled = b;
  if (bb) bb.disabled = b;
}
function abGo(side) {
  if (abRunning) return;
  if (!take()) return;
  abRunning = true;
  abSetBusy(true);
  const deck = [];
  const suits = ['♠','♥','♦','♣'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  for (let s=0;s<4;s++) for (let r=0;r<13;r++) deck.push({s:suits[s],r:ranks[r]});
  for (let i=deck.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  abJoker = deck.pop();
  SND.card();
  const jk = document.getElementById('abJoker');
  jk.className = 'ab-joker';
  void jk.offsetWidth;
  jk.classList.add('deal');
  jk.innerHTML = '<img src="assets/cards/' + abJoker.r + '-' + suitKey(abJoker.s) + '.webp" alt="" draggable="false">';
  document.getElementById('abAndar').innerHTML = '';
  document.getElementById('abBahar').innerHTML = '';
  document.getElementById('abAndarCnt').textContent = '0';
  document.getElementById('abBaharCnt').textContent = '0';
  const res = document.getElementById('abResult');
  res.textContent = '';
  res.className = 'ab-status';
  let step = 0, found = false, winner = null;
  const mult = 1.9;
  function dealNext() {
    if (found) return;
    const card = deck.pop();
    if (step % 2 === 0) {
      document.getElementById('abAndar').insertAdjacentHTML('beforeend', abCard(card));
      document.getElementById('abAndarCnt').textContent = document.getElementById('abAndar').children.length;
      if (card.r === abJoker.r) { found = true; winner = 'andar'; }
    } else {
      document.getElementById('abBahar').insertAdjacentHTML('beforeend', abCard(card));
      document.getElementById('abBaharCnt').textContent = document.getElementById('abBahar').children.length;
      if (card.r === abJoker.r) { found = true; winner = 'bahar'; }
    }
    SND.card();
    step++;
    if (found || deck.length === 0) {
      abRunning = false;
      const win = winner === side;
      const w = win ? Math.floor(GB * mult) : 0;
      give(w);
      gres(win ? '×' + mult + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), win ? w : 0);
      const winName = winner === 'andar' ? T('ab.andar') : T('ab.bahar');
      res.className = 'ab-status ' + (win ? 'win' : 'lose');
      res.textContent = T('ab.winner') + ': ' + winName + (win ? ' — ×' + mult + ' +' + fmt(w) + ' 🪙' : ' — ' + T('ab.lost'));
      const winEl = document.getElementById(winner === 'andar' ? 'abAndar' : 'abBahar');
      const last = winEl.lastElementChild;
      if (last) last.classList.add('match');
      winFX(w);
      fairTick();
      abSetBusy(false);
    } else {
      setTimeout(dealNext, 350 + Math.random() * 200);
    }
  }
  setTimeout(dealNext, 600);
}

/* ═══════════ 20. Crabbin (Crab Loot) ═══════════ */
let crRunning = false;
function eCrabbin(g) {
  let cells = '';
  for (let i = 0; i < 9; i++) cells += '<div class="cr-cell idle"><span class="cr-emoji">🦀</span><span class="cr-val">?</span></div>';
  return gFrame(
    '<div class="cr-hint">' + T('cr.hint') + '</div>' +
    '<div class="cr-grid" id="crGrid">' + cells + '</div>' +
    '<div class="cr-status" id="crResult"></div>' +
    '<div class="bets"><button class="crBtn" id="crBtn" onclick="crGo()">🦀 ' + T('cr.go') + '</button></div>' +
    betRow(),
    g
  );
}
function crGo() {
  if (crRunning) return;
  if (!take()) return;
  crRunning = true;
  const btn = document.getElementById('crBtn');
  if (btn) btn.disabled = true;
  const vals = [1.3, 1.3, 1.4, 1.4, 1.5, 1.6, 0, 0, 0];
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  const grid = document.getElementById('crGrid');
  grid.innerHTML = '';
  const res = document.getElementById('crResult');
  res.textContent = '';
  res.className = 'cr-status';
  const cells = [];
  vals.forEach((v, idx) => {
    const c = document.createElement('div');
    c.className = 'cr-cell';
    c.innerHTML = '<span class="cr-emoji">🦀</span><span class="cr-val">?</span>';
    c.onclick = function () { crPick(idx); };
    grid.appendChild(c);
    cells.push(c);
  });
  function crPick(idx) {
    if (crRunning !== true) return;
    crRunning = 'done';
    cells.forEach((c, i) => c.onclick = null);
    let delay = 0;
    cells.forEach((c, i) => {
      setTimeout(() => {
        const v = vals[i];
        c.classList.add(v > 0 ? 'gold' : 'red', 'revealed');
        c.innerHTML = '<span class="cr-emoji">🦀</span><span class="cr-val">' + (v > 0 ? '×' + v : '×0') + '</span>';
      }, delay);
      delay += 70;
    });
    setTimeout(() => {
      const v = vals[idx];
      cells[idx].classList.add('match');
      const w = v > 0 ? Math.floor(GB * v) : 0;
      give(w);
      gres(v > 0 ? '×' + v + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), w);
      res.className = 'cr-status ' + (v > 0 ? 'win' : 'lose');
      res.textContent = v > 0 ? T('cr.win') + ' ×' + v + ' +' + fmt(w) + ' 🪙' : T('cr.lose');
      winFX(w);
      fairTick();
      crRunning = false;
      if (btn) btn.disabled = false;
    }, delay + 320);
  }
}

/* ═══════════ 21. Fishing (صيد السمك) ═══════════ */
let fhRunning = false;
const FH_FISH = [
  { mult: 1.1, p: 0.90, em: '🐟', n: 'Sardine' },
  { mult: 1.3, p: 0.75, em: '🐠', n: 'Dorade' },
  { mult: 1.6, p: 0.60, em: '🐡', n: 'Fugu' },
  { mult: 2,   p: 0.40, em: '🐙', n: 'Octopus' },
  { mult: 3,   p: 0.35, em: '🦈', n: 'Shark' }
];
function eFishing(g) {
  return gFrame(
    '<div class="fh-hint">' + T('fh.hint') + '</div>' +
    '<div class="fh-sea" id="fhSea">' +
      FH_FISH.map((f, i) =>
        '<div class="fh-fish" id="fhFish' + i + '" onclick="fhGo(' + i + ')">' +
          '<span class="fh-fish-em">' + f.em + '</span>' +
          '<span class="fh-fish-mult">×' + f.mult + '</span>' +
        '</div>'
      ).join('') +
    '</div>' +
    '<div class="fh-cannon" id="fhCannon">🔫</div>' +
    '<div class="cr-status" id="fhResult"></div>' +
    betRow(),
    g
  );
}
function fhGo(i) {
  if (fhRunning) return;
  if (!take()) return;
  fhRunning = true;
  const res = document.getElementById('fhResult');
  res.textContent = '';
  res.className = 'cr-status';
  const f = FH_FISH[i];
  const el = document.getElementById('fhFish' + i);
  const cn = document.getElementById('fhCannon');
  cn.textContent = '🎣';
  cn.classList.add('fh-shoot');
  FH_FISH.forEach((_, k) => {
    const fe = document.getElementById('fhFish' + k);
    if (fe) fe.classList.add('disabled');
  });
  setTimeout(() => {
    cn.textContent = '💥';
    el.classList.add('fh-hit');
    const caught = Math.random() < f.p;
    const w = caught ? Math.floor(GB * f.mult) : 0;
    give(w);
    gres(caught ? '×' + f.mult + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), w);
    res.className = 'cr-status ' + (caught ? 'win' : 'lose');
    res.textContent = caught ? T('fh.caught') + ' ×' + f.mult + ' +' + fmt(w) + ' 🪙' : T('fh.escaped');
    winFX(w);
    fairTick();
    setTimeout(() => {
      cn.textContent = '🔫';
      cn.classList.remove('fh-shoot');
      el.classList.remove('fh-hit');
      FH_FISH.forEach((_, k) => {
        const fe = document.getElementById('fhFish' + k);
        if (fe) fe.classList.remove('disabled');
      });
      fhRunning = false;
    }, 600);
  }, 700);
}

/* ═══════════ 22. Gates (بوابات أوليمبوس) ═══════════ */
let gtRunning = false;
function eGates(g) {
  let gates = '';
  for (let i = 0; i < 4; i++) gates += '<div class="gt-gate idle"><span class="gt-gate-em">⛩️</span><span class="gt-gate-val">?</span></div>';
  return gFrame(
    '<div class="gt-hint">' + T('gt.hint') + '</div>' +
    '<div class="gt-row" id="gtRow">' + gates + '</div>' +
    '<div class="gt-zeus" id="gtZeus">⚡</div>' +
    '<div class="cr-status" id="gtResult"></div>' +
    '<div class="bets"><button class="crBtn" id="gtBtn" onclick="gtGo()">⚡ ' + T('gt.go') + '</button></div>' +
    betRow(),
    g
  );
}
function gtGo() {
  if (gtRunning) return;
  if (!take()) return;
  gtRunning = true;
  const btn = document.getElementById('gtBtn');
  if (btn) btn.disabled = true;
  const vals = [1.2, 1.3, 1.3, 0];
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  const row = document.getElementById('gtRow');
  row.innerHTML = '';
  const res = document.getElementById('gtResult');
  res.textContent = '';
  res.className = 'cr-status';
  const zeus = document.getElementById('gtZeus');
  zeus.textContent = '⚡';
  const gates = [];
  vals.forEach((v, idx) => {
    const c = document.createElement('div');
    c.className = 'gt-gate';
    c.innerHTML = '<span class="gt-gate-em">⛩️</span><span class="gt-gate-val">?</span>';
    c.onclick = function () { gtPick(idx); };
    row.appendChild(c);
    gates.push(c);
  });
  function gtPick(idx) {
    if (gtRunning !== true) return;
    gtRunning = 'done';
    gates.forEach((c, i) => c.onclick = null);
    zeus.textContent = '⚡👑';
    let delay = 0;
    gates.forEach((c, i) => {
      setTimeout(() => {
        const v = vals[i];
        c.classList.add(v > 0 ? 'gold' : 'red', 'revealed');
        c.innerHTML = '<span class="gt-gate-em">' + (v > 0 ? '🗿' : '💀') + '</span><span class="gt-gate-val">' + (v > 0 ? '×' + v : '×0') + '</span>';
      }, delay);
      delay += 100;
    });
    setTimeout(() => {
      const v = vals[idx];
      gates[idx].classList.add('match');
      const w = v > 0 ? Math.floor(GB * v) : 0;
      give(w);
      gres(v > 0 ? '×' + v + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), w);
      res.className = 'cr-status ' + (v > 0 ? 'win' : 'lose');
      res.textContent = v > 0 ? T('gt.win') + ' ×' + v + ' +' + fmt(w) + ' 🪙' : T('gt.lose');
      winFX(w);
      fairTick();
      gtRunning = false;
      if (btn) btn.disabled = false;
    }, delay + 350);
  }
}

/* ═══════════ 23. Lightning (برق) ═══════════ */
let lgRunning = false;
function eLightning(g) {
  let cells = '';
  for (let i = 0; i < 12; i++) cells += '<div class="lg-cell idle"><span class="lg-emoji">⚡</span><span class="lg-val">?</span></div>';
  return gFrame(
    '<div class="lg-hint">' + T('lg.hint') + '</div>' +
    '<div class="lg-grid" id="lgGrid">' + cells + '</div>' +
    '<div class="cr-status" id="lgResult"></div>' +
    '<div class="bets"><button class="crBtn" id="lgBtn" onclick="lgGo()">⚡ ' + T('lg.go') + '</button></div>' +
    betRow(),
    g
  );
}
function lgGo() {
  if (lgRunning) return;
  if (!take()) return;
  lgRunning = true;
  const btn = document.getElementById('lgBtn');
  if (btn) btn.disabled = true;
  const vals = [1.1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.4, 1.5, 0, 0, 0];
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  const grid = document.getElementById('lgGrid');
  grid.innerHTML = '';
  const res = document.getElementById('lgResult');
  res.textContent = '';
  res.className = 'cr-status';
  const cells = [];
  vals.forEach((v, idx) => {
    const c = document.createElement('div');
    c.className = 'lg-cell';
    c.innerHTML = '<span class="lg-emoji">⚡</span><span class="lg-val">?</span>';
    c.onclick = function () { lgPick(idx); };
    grid.appendChild(c);
    cells.push(c);
  });
  function lgPick(idx) {
    if (lgRunning !== true) return;
    lgRunning = 'done';
    cells.forEach((c, i) => c.onclick = null);
    let delay = 0;
    cells.forEach((c, i) => {
      setTimeout(() => {
        const v = vals[i];
        c.classList.add(v > 0 ? 'gold' : 'red', 'revealed');
        c.innerHTML = '<span class="lg-emoji">' + (v > 0 ? '⚡' : '🌩️') + '</span><span class="lg-val">' + (v > 0 ? '×' + v : '×0') + '</span>';
      }, delay);
      delay += 60;
    });
    setTimeout(() => {
      const v = vals[idx];
      cells[idx].classList.add('match');
      const w = v > 0 ? Math.floor(GB * v) : 0;
      give(w);
      gres(v > 0 ? '×' + v + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), w);
      res.className = 'cr-status ' + (v > 0 ? 'win' : 'lose');
      res.textContent = v > 0 ? T('lg.win') + ' ×' + v + ' +' + fmt(w) + ' 🪙' : T('lg.lose');
      winFX(w);
      fairTick();
      lgRunning = false;
      if (btn) btn.disabled = false;
    }, delay + 320);
  }
}

/* ═══════════ 24. Lottery (اليانصيب) ═══════════ */
let ltRunning = false;
function eLottery(g) {
  let ticks = '';
  for (let i = 0; i < 6; i++) ticks += '<div class="lt-tick idle"><span class="lt-tick-em">🎟️</span><span class="lt-tick-val">؟</span></div>';
  return gFrame(
    '<div class="lt-hint">' + T('lt.hint') + '</div>' +
    '<div class="lt-row" id="ltRow">' + ticks + '</div>' +
    '<div class="cr-status" id="ltResult"></div>' +
    '<div class="bets"><button class="crBtn" id="ltBtn" onclick="ltGo()">🎟️ ' + T('lt.go') + '</button></div>' +
    betRow(),
    g
  );
}
function ltGo() {
  if (ltRunning) return;
  if (!take()) return;
  ltRunning = true;
  const btn = document.getElementById('ltBtn');
  if (btn) btn.disabled = true;
  const vals = [1.4, 1.9, 2.4, 0, 0, 0];
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  const row = document.getElementById('ltRow');
  row.innerHTML = '';
  const res = document.getElementById('ltResult');
  res.textContent = '';
  res.className = 'cr-status';
  const ticks = [];
  vals.forEach((v, idx) => {
    const c = document.createElement('div');
    c.className = 'lt-tick';
    c.innerHTML = '<span class="lt-tick-em">🎟️</span><span class="lt-tick-val">؟</span>';
    c.onclick = function () { ltPick(idx); };
    row.appendChild(c);
    ticks.push(c);
  });
  function ltPick(idx) {
    if (ltRunning !== true) return;
    ltRunning = 'done';
    ticks.forEach((c, i) => c.onclick = null);
    let delay = 0;
    ticks.forEach((c, i) => {
      setTimeout(() => {
        const v = vals[i];
        c.classList.add(v > 0 ? 'gold' : 'red', 'revealed');
        c.innerHTML = '<span class="lt-tick-em">🎫</span><span class="lt-tick-val">' + (v > 0 ? '×' + v : '×0') + '</span>';
      }, delay);
      delay += 90;
    });
    setTimeout(() => {
      const v = vals[idx];
      ticks[idx].classList.add('match');
      const w = v > 0 ? Math.floor(GB * v) : 0;
      give(w);
      gres(v > 0 ? '×' + v + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), w);
      res.className = 'cr-status ' + (v > 0 ? 'win' : 'lose');
      res.textContent = v > 0 ? T('lt.win') + ' ×' + v + ' +' + fmt(w) + ' 🪙' : T('lt.lose');
      winFX(w);
      fairTick();
      ltRunning = false;
      if (btn) btn.disabled = false;
    }, delay + 350);
  }
}

/* ═══════════ 25. Mahjong (بلاطات) ═══════════ */
let mjRunning = false;
function eMahjong(g) {
  let cells = '';
  for (let i = 0; i < 12; i++) cells += '<div class="mj-cell idle"><span class="mj-emoji">🀄</span><span class="mj-val">?</span></div>';
  return gFrame(
    '<div class="mj-hint">' + T('mj.hint') + '</div>' +
    '<div class="mj-grid" id="mjGrid">' + cells + '</div>' +
    '<div class="cr-status" id="mjResult"></div>' +
    '<div class="bets"><button class="crBtn" id="mjBtn" onclick="mjGo()">🀄 ' + T('mj.go') + '</button></div>' +
    betRow(),
    g
  );
}
function mjGo() {
  if (mjRunning) return;
  if (!take()) return;
  mjRunning = true;
  const btn = document.getElementById('mjBtn');
  if (btn) btn.disabled = true;
  const vals = [1.3, 1.3, 1.3, 1.4, 1.4, 1.5, 1.6, 1.6, 0, 0, 0, 0];
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  const grid = document.getElementById('mjGrid');
  grid.innerHTML = '';
  const res = document.getElementById('mjResult');
  res.textContent = '';
  res.className = 'cr-status';
  const cells = [];
  vals.forEach((v, idx) => {
    const c = document.createElement('div');
    c.className = 'mj-cell';
    c.innerHTML = '<span class="mj-emoji">🀄</span><span class="mj-val">?</span>';
    c.onclick = function () { mjPick(idx); };
    grid.appendChild(c);
    cells.push(c);
  });
  function mjPick(idx) {
    if (mjRunning !== true) return;
    mjRunning = 'done';
    cells.forEach((c, i) => c.onclick = null);
    let delay = 0;
    cells.forEach((c, i) => {
      setTimeout(() => {
        const v = vals[i];
        c.classList.add(v > 0 ? 'gold' : 'red', 'revealed');
        c.innerHTML = '<span class="mj-emoji">' + (v > 0 ? '🀄' : '🀆') + '</span><span class="mj-val">' + (v > 0 ? '×' + v : '×0') + '</span>';
      }, delay);
      delay += 60;
    });
    setTimeout(() => {
      const v = vals[idx];
      cells[idx].classList.add('match');
      const w = v > 0 ? Math.floor(GB * v) : 0;
      give(w);
      gres(v > 0 ? '×' + v + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), w);
      res.className = 'cr-status ' + (v > 0 ? 'win' : 'lose');
      res.textContent = v > 0 ? T('mj.win') + ' ×' + v + ' +' + fmt(w) + ' 🪙' : T('mj.lose');
      winFX(w);
      fairTick();
      mjRunning = false;
      if (btn) btn.disabled = false;
    }, delay + 320);
  }
}

/* ═══════════ 26. Money (الخزائن) ═══════════ */
let moRunning = false;
function eMoney(g) {
  let cells = '';
  for (let i = 0; i < 9; i++) cells += '<div class="mo-cell idle"><span class="mo-emoji">🔒</span><span class="mo-val">?</span></div>';
  return gFrame(
    '<div class="mo-hint">' + T('mo.hint') + '</div>' +
    '<div class="mo-grid" id="moGrid">' + cells + '</div>' +
    '<div class="cr-status" id="moResult"></div>' +
    '<div class="bets"><button class="crBtn" id="moBtn" onclick="moGo()">💰 ' + T('mo.go') + '</button></div>' +
    betRow(),
    g
  );
}
function moGo() {
  if (moRunning) return;
  if (!take()) return;
  moRunning = true;
  const btn = document.getElementById('moBtn');
  if (btn) btn.disabled = true;
  const vals = [1.3, 1.3, 1.4, 1.4, 1.5, 1.6, 0, 0, 0];
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  const grid = document.getElementById('moGrid');
  grid.innerHTML = '';
  const res = document.getElementById('moResult');
  res.textContent = '';
  res.className = 'cr-status';
  const cells = [];
  vals.forEach((v, idx) => {
    const c = document.createElement('div');
    c.className = 'mo-cell';
    c.innerHTML = '<span class="mo-emoji">🔒</span><span class="mo-val">?</span>';
    c.onclick = function () { moPick(idx); };
    grid.appendChild(c);
    cells.push(c);
  });
  function moPick(idx) {
    if (moRunning !== true) return;
    moRunning = 'done';
    cells.forEach((c, i) => c.onclick = null);
    let delay = 0;
    cells.forEach((c, i) => {
      setTimeout(() => {
        const v = vals[i];
        c.classList.add(v > 0 ? 'gold' : 'red', 'revealed');
        c.innerHTML = '<span class="mo-emoji">' + (v > 0 ? '🪙' : '💥') + '</span><span class="mo-val">' + (v > 0 ? '×' + v : '×0') + '</span>';
      }, delay);
      delay += 70;
    });
    setTimeout(() => {
      const v = vals[idx];
      cells[idx].classList.add('match');
      const w = v > 0 ? Math.floor(GB * v) : 0;
      give(w);
      gres(v > 0 ? '×' + v + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), w);
      res.className = 'cr-status ' + (v > 0 ? 'win' : 'lose');
      res.textContent = v > 0 ? T('mo.win') + ' ×' + v + ' +' + fmt(w) + ' 🪙' : T('mo.lose');
      winFX(w);
      fairTick();
      moRunning = false;
      if (btn) btn.disabled = false;
    }, delay + 320);
  }
}

/* ═══════════ 27. Olympus (آلهة أوليمبوس) ═══════════ */
let olRunning = false;
function eOlympus(g) {
  let gods = '';
  for (let i = 0; i < 4; i++) gods += '<div class="ol-god idle"><span class="ol-god-em">🏛️</span><span class="ol-god-val">?</span></div>';
  return gFrame(
    '<div class="ol-hint">' + T('ol.hint') + '</div>' +
    '<div class="ol-row" id="olRow">' + gods + '</div>' +
    '<div class="cr-status" id="olResult"></div>' +
    '<div class="bets"><button class="crBtn" id="olBtn" onclick="olGo()">🏛️ ' + T('ol.go') + '</button></div>' +
    betRow(),
    g
  );
}
function olGo() {
  if (olRunning) return;
  if (!take()) return;
  olRunning = true;
  const btn = document.getElementById('olBtn');
  if (btn) btn.disabled = true;
  const vals = [1.2, 1.3, 1.3, 0];
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  const row = document.getElementById('olRow');
  row.innerHTML = '';
  const res = document.getElementById('olResult');
  res.textContent = '';
  res.className = 'cr-status';
  const gods = [];
  vals.forEach((v, idx) => {
    const c = document.createElement('div');
    c.className = 'ol-god';
    c.innerHTML = '<span class="ol-god-em">🏛️</span><span class="ol-god-val">?</span>';
    c.onclick = function () { olPick(idx); };
    row.appendChild(c);
    gods.push(c);
  });
  function olPick(idx) {
    if (olRunning !== true) return;
    olRunning = 'done';
    gods.forEach((c, i) => c.onclick = null);
    let delay = 0;
    gods.forEach((c, i) => {
      setTimeout(() => {
        const v = vals[i];
        c.classList.add(v > 0 ? 'gold' : 'red', 'revealed');
        c.innerHTML = '<span class="ol-god-em">' + (v > 0 ? '⚡' : '💀') + '</span><span class="ol-god-val">' + (v > 0 ? '×' + v : '×0') + '</span>';
      }, delay);
      delay += 100;
    });
    setTimeout(() => {
      const v = vals[idx];
      gods[idx].classList.add('match');
      const w = v > 0 ? Math.floor(GB * v) : 0;
      give(w);
      gres(v > 0 ? '×' + v + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), w);
      res.className = 'cr-status ' + (v > 0 ? 'win' : 'lose');
      res.textContent = v > 0 ? T('ol.win') + ' ×' + v + ' +' + fmt(w) + ' 🪙' : T('ol.lose');
      winFX(w);
      fairTick();
      olRunning = false;
      if (btn) btn.disabled = false;
    }, delay + 350);
  }
}

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

/* ═══════════ 29. Rose (الوردة) ═══════════ */
let roRunning = false;
function eRose(g) {
  let roses = '';
  for (let i = 0; i < 6; i++) roses += '<div class="ro-rose idle"><span class="ro-rose-em">🌹</span><span class="ro-rose-val">?</span></div>';
  return gFrame(
    '<div class="ro-hint">' + T('ro.hint') + '</div>' +
    '<div class="ro-row" id="roRow">' + roses + '</div>' +
    '<div class="cr-status" id="roResult"></div>' +
    '<div class="bets"><button class="crBtn" id="roBtn" onclick="roGo()">🌹 ' + T('ro.go') + '</button></div>' +
    betRow(),
    g
  );
}
function roGo() {
  if (roRunning) return;
  if (!take()) return;
  roRunning = true;
  const btn = document.getElementById('roBtn');
  if (btn) btn.disabled = true;
  const vals = [1.2, 1.3, 1.5, 1.7, 0, 0];
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  const row = document.getElementById('roRow');
  row.innerHTML = '';
  const res = document.getElementById('roResult');
  res.textContent = '';
  res.className = 'cr-status';
  const roses = [];
  vals.forEach((v, idx) => {
    const c = document.createElement('div');
    c.className = 'ro-rose';
    c.innerHTML = '<span class="ro-rose-em">🌹</span><span class="ro-rose-val">?</span>';
    c.onclick = function () { roPick(idx); };
    row.appendChild(c);
    roses.push(c);
  });
  function roPick(idx) {
    if (roRunning !== true) return;
    roRunning = 'done';
    roses.forEach((c, i) => c.onclick = null);
    let delay = 0;
    roses.forEach((c, i) => {
      setTimeout(() => {
        const v = vals[i];
        c.classList.add(v > 0 ? 'gold' : 'red', 'revealed');
        c.innerHTML = '<span class="ro-rose-em">' + (v > 0 ? '🌹' : '🌵') + '</span><span class="ro-rose-val">' + (v > 0 ? '×' + v : '×0') + '</span>';
      }, delay);
      delay += 90;
    });
    setTimeout(() => {
      const v = vals[idx];
      roses[idx].classList.add('match');
      const w = v > 0 ? Math.floor(GB * v) : 0;
      give(w);
      gres(v > 0 ? '×' + v + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), w);
      res.className = 'cr-status ' + (v > 0 ? 'win' : 'lose');
      res.textContent = v > 0 ? T('ro.win') + ' ×' + v + ' +' + fmt(w) + ' 🪙' : T('ro.lose');
      winFX(w);
      fairTick();
      roRunning = false;
      if (btn) btn.disabled = false;
    }, delay + 350);
  }
}

/* ═══════════ 30. Sweet Bonanza (حلوى) ═══════════ */
let swRunning = false;
const SW_EM = { 1.2: '🍭', 1.3: '🍬', 1.4: '🍫', 1.5: '🍩', 1.8: '🧁' };
function eSweet(g) {
  let cells = '';
  for (let i = 0; i < 12; i++) cells += '<div class="sw-cell idle"><span class="sw-emoji">🍬</span><span class="sw-val">?</span></div>';
  return gFrame(
    '<div class="sw-hint">' + T('sw.hint') + '</div>' +
    '<div class="sw-grid" id="swGrid">' + cells + '</div>' +
    '<div class="cr-status" id="swResult"></div>' +
    '<div class="bets"><button class="crBtn" id="swBtn" onclick="swGo()">🍬 ' + T('sw.go') + '</button></div>' +
    betRow(),
    g
  );
}
function swGo() {
  if (swRunning) return;
  if (!take()) return;
  swRunning = true;
  const btn = document.getElementById('swBtn');
  if (btn) btn.disabled = true;
  const vals = [1.2, 1.3, 1.3, 1.4, 1.4, 1.5, 1.5, 1.8, 0, 0, 0, 0];
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  const grid = document.getElementById('swGrid');
  grid.innerHTML = '';
  const res = document.getElementById('swResult');
  res.textContent = '';
  res.className = 'cr-status';
  const cells = [];
  vals.forEach((v, idx) => {
    const c = document.createElement('div');
    c.className = 'sw-cell';
    c.innerHTML = '<span class="sw-emoji">🍬</span><span class="sw-val">?</span>';
    c.onclick = function () { swPick(idx); };
    grid.appendChild(c);
    cells.push(c);
  });
  function swPick(idx) {
    if (swRunning !== true) return;
    swRunning = 'done';
    cells.forEach((c, i) => c.onclick = null);
    let delay = 0;
    cells.forEach((c, i) => {
      setTimeout(() => {
        const v = vals[i];
        c.classList.add(v > 0 ? 'gold' : 'red', 'revealed');
        c.innerHTML = '<span class="sw-emoji">' + (v > 0 ? (SW_EM[v] || '🍭') : '💥') + '</span><span class="sw-val">' + (v > 0 ? '×' + v : '×0') + '</span>';
      }, delay);
      delay += 60;
    });
    setTimeout(() => {
      const v = vals[idx];
      cells[idx].classList.add('match');
      const w = v > 0 ? Math.floor(GB * v) : 0;
      give(w);
      gres(v > 0 ? '×' + v + ' +' + fmt(w) + ' 🪙' : T('ts.lose'), w);
      res.className = 'cr-status ' + (v > 0 ? 'win' : 'lose');
      res.textContent = v > 0 ? T('sw.win') + ' ×' + v + ' +' + fmt(w) + ' 🪙' : T('sw.lose');
      winFX(w);
      fairTick();
      swRunning = false;
      if (btn) btn.disabled = false;
    }, delay + 320);
  }
}

/* ═══════════ سجل المحركات ═══════════ */
const ENG = {
  ronda: eRonda,
  get rondacard() { return (typeof window.eRondaCard === 'function') ? window.eRondaCard : null; },
  chess: eChess,
  dama: eDama,
  /* [Billiards] المحرك يُعرَّف في billiards.js (يُحمَّل قبل engines.js) —
     قراءة كسولة عبر window لتفادي ReferenceError لو تغيّر الترتيب */
  get billiards() { return (typeof window.eBilliards === 'function') ? window.eBilliards : ((typeof eBilliards === 'function') ? eBilliards : null); },
  /* [BGDO] الطاولة والضومنة: مشروعان مستقلان محكومان بعقد المنصة —
     نفس نمط القراءة الكسولة (eBackgammon/eDominoes من ملفي الجسر) */
  get backgammon() { return (typeof window.eBackgammon === 'function') ? window.eBackgammon : null; },
  get dominoes() { return (typeof window.eDominoes === 'function') ? window.eDominoes : null; },
  /* crash.js هو module (يُنفَّذ بعد كل السكربتات العادية) — لذلك نقرأ eCrash
     كسولاً عند الفتح عبر window.eCrash بدلاً من الإشارة المباشرة (ReferenceError) */
  get crash() { return (typeof window.eCrash !== 'undefined') ? window.eCrash : null; },
  rami: eRami,
  andarbahar: eAndarbahar,
  bj: eBj,
  slots: eSlots,
  mines: eMines,
  plinko: ePlinko,
  dice: eDice,
  coin: eCoin,
  hilo: eHilo,
  wheel: eWheel,
  scr: eScratch,
  wingo: eWingo,
  rps: eRps,
  pen: ePenalty,
  l7: eLucky7,
  sicbo: eSicbo,
  rl: eRoulette,
  bac: eBaccarat,
  dt: eDragonTiger,
  vp: eVp,
  keno: eKeno,
  crabbin: eCrabbin,
  fishing: eFishing,
  gates: eGates,
  lightning: eLightning,
  lottery: eLottery,
  mahjong: eMahjong,
  money: eMoney,
  olympus: eOlympus,
  poker: ePoker,
  rose: eRose,
  'sweet-bonanza': eSweet
};

// Export to global for main.js
window.ENG = ENG;