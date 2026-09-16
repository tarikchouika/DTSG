/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Blackjack Engine
   ═══════════════════════════════════════════ */
"use strict";
/* ═══════════ BJMP — بلاك جاك الجماعي (2-4 لاعبين بلا بانكر) ═══════════
   دوال نقية خالصة بلا DOM: السائق (driverId) يدير الحالة محلياً ويبث
   snapshot عبر غلاف rmove (نفس نمط بارشيسي/البلياردو)؛ moveHistory
   يسجّلها فيعيد العائدون بناء الجولة عبر room:replay.
   snapshot = { seq, phase:'play'|'settled', bet,
                players:[{id,name,cards:[{s,r}],total,busted,stood,doubled,done}],
                turnIdx, deck:['A♠',…] (رموز ورق نصية) } */
var BJMP = (function () {
  /* مجموعة 52 رمز ورق ('A♠') مخلوطة Fisher-Yates بـMath.random */
  function mkDeckToks() {
    var toks = [];
    var suits = ['♠', '♥', '♦', '♣'];
    var ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    for (var si = 0; si < 4; si++) for (var ri = 0; ri < 13; ri++) toks.push(ranks[ri] + suits[si]);
    for (var i = toks.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = toks[i]; toks[i] = toks[j]; toks[j] = t;
    }
    return toks;
  }
  /* رمز '10♥' → {s:'♥', r:'10'} */
  function tok2card(t) { return { r: String(t).slice(0, -1), s: String(t).slice(-1) }; }
  function cardVal(c) {
    if (c.r === 'A') return 11;
    if (c.r === 'J' || c.r === 'Q' || c.r === 'K') return 10;
    return parseInt(c.r, 10);
  }
  /* مجموع يد بآسات مرنة (نفس منطق hv في الوضع الفردي) */
  function handVal(cards) {
    var v = 0, aces = 0;
    for (var i = 0; i < cards.length; i++) { v += cardVal(cards[i]); if (cards[i].r === 'A') aces++; }
    while (v > 21 && aces > 0) { v -= 10; aces--; }
    return v;
  }
  function cloneSnap(s) { return JSON.parse(JSON.stringify(s)); }
  /* أول مقعد لم يُنهِ يده بعد */
  function nextTurn(ps) {
    var i = 0;
    while (i < ps.length && ps[i].done) i++;
    return (i < ps.length) ? i : -1;
  }
  /* جولة جديدة: players=[{id,name}] — ورقتان لكل لاعب (seed محفوظ للتوسعة؛ الخلط Math.random) */
  function newRound(players, seed, bet) {
    var deck = mkDeckToks();
    var ps = (players || []).map(function (p) {
      return { id: p.id, name: p.name || String(p.id), cards: [], total: 0, busted: false, stood: false, doubled: false, done: false };
    });
    for (var d = 0; d < 2; d++) {
      for (var i = 0; i < ps.length; i++) {
        if (!deck.length) break;
        ps[i].cards.push(tok2card(deck.pop()));
      }
    }
    ps.forEach(function (p) {
      p.total = handVal(p.cards);
      if (p.total === 21) { p.stood = true; p.done = true; }   /* بلاك جاك طبيعي → وقوف تلقائي */
    });
    return { seq: 1, phase: 'play', bet: bet || 0, players: ps, turnIdx: nextTurn(ps), deck: deck };
  }
  /* حركة لاعب: act = 'hit'|'stand'|'double' — تُطبَّق فقط على صاحب الدور — تعيد snapshot جديدة */
  function applyAct(snap, pid, act) {
    if (!snap || snap.phase !== 'play') return snap;
    var cur = snap.players[snap.turnIdx];
    if (!cur || String(cur.id) !== String(pid) || cur.done) return snap;
    var ns = cloneSnap(snap);
    var p = ns.players[ns.turnIdx];
    if (act === 'hit') {
      if (!ns.deck.length) return snap;
      p.cards.push(tok2card(ns.deck.pop()));
      p.total = handVal(p.cards);
      if (p.total > 21) { p.busted = true; p.done = true; }
      else if (p.total === 21) { p.stood = true; p.done = true; }
    } else if (act === 'stand') {
      p.stood = true; p.done = true;
    } else if (act === 'double') {
      /* مضاعفة بالورقتين الأولى فقط: سحب واحدة ثم وقوف (سقف الرصيد يُفحص في الواجهة لا هنا) */
      if (p.cards.length !== 2 || !ns.deck.length) return snap;
      p.cards.push(tok2card(ns.deck.pop()));
      p.total = handVal(p.cards);
      p.doubled = true;
      if (p.total > 21) p.busted = true;
      p.stood = true; p.done = true;
    } else return snap;
    ns.turnIdx = nextTurn(ns.players);
    ns.seq = (ns.seq || 0) + 1;
    return ns;
  }
  /* تسوية عند اكتمال done للجميع: الأعلى دون 21 يفوز بالقدح (رهانات الجميع)
     بعد رسم 5% (متسق مع room_type percentage) — التعادل يتقاسم بالتساوي.
     تعيد { snap, results:[{id, won, share}] } */
  function settle(snap) {
    if (!snap || !snap.players || !snap.players.length) return null;
    var ns = cloneSnap(snap);
    if (ns.players.some(function (p) { return !p.done; })) return null;   /* الجولة لم تكتمل */
    var results = ns.players.map(function (p) { return { id: p.id, won: false, share: 0 }; });
    var live = ns.players.filter(function (p) { return !p.busted; });
    if (live.length) {
      var top = 0;
      live.forEach(function (p) { if (p.total > top) top = p.total; });
      var winners = live.filter(function (p) { return p.total === top; });
      var stake = (ns.bet || 0) * ns.players.length;   /* القدح = مجموع رهانات الجميع */
      var net = Math.round(stake * 0.95);              /* رسم 5% */
      var share = Math.floor(net / winners.length);
      var remainder = net - share * winners.length;     /* الكسور توزَّع +1 على الأوائل */
      winners.forEach(function (w, wi) {
        for (var k = 0; k < results.length; k++) {
          if (String(results[k].id) === String(w.id)) {
            results[k].won = true;
            results[k].share = share + (wi < remainder ? 1 : 0);
          }
        }
      });
    }
    ns.phase = 'settled';
    ns.turnIdx = -1;
    return { snap: ns, results: results };
  }
  return { newRound: newRound, applyAct: applyAct, settle: settle };
})();

/* ── حالة Blackjack ── */
let bDeck = [];
let bP = [];
let bD = [];
let bOn = false;
let bSplit = false;
let bSplitHand = [];
let bSplitActive = 0;
let bDbl = [false, false]; /* مضاعفة لكل يد: [اليد الأصلية, اليد الثانية بعد التقسيم] */
let bSeq = 0; /* عدّاد الجولات — لإبطال الأنيميشن القديم عند توزيع جولة جديدة */
/* ── نبض عدّاد الرهان عند تغيّر قيمته ── */
function bindBetPulse() {
  /* [BetUI] GBd صار <input> — النبض عند تغيّر القيمة (input event بدل MutationObserver) */
  setTimeout(function () {
    const el = document.getElementById('GBd');
    if (!el) return;
    const fire = function () {
      const b = el.closest('.bet-field') || el.closest('.bamt');
      if (!b) return;
      b.classList.remove('pulse');
      void b.offsetWidth;
      b.classList.add('pulse');
    };
    if (el.tagName === 'INPUT') { el.addEventListener('input', fire); el.addEventListener('change', fire); }
    else if (typeof MutationObserver === 'function') {
      new MutationObserver(fire).observe(el, { childList: true, characterData: true, subtree: true });
    }
  }, 0);
}
/* ── بناء الواجهة ── */
function eBj(g) {
  /* وضع الغرفة النشطة: بطاقات أفقية لكل اللاعبين + أزرار الجماعي */
  if (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.game_id === 'bj' && Rooms.state.status === 'playing') {
    Rooms.setGameHandler(bjRoomMove);
    Rooms.setStartHandler(bjRoomStart);
    /* [Resilience] إعادة بناء الجولة للعائد (room:replay) + تنظيف عند نهاية الجولة */
    if (typeof window !== 'undefined') {
      window.applyRoomReplay = bjApplyReplay;
      window.onRoomRoundEnded = bjOnRoundEnded;
    }
    /* إعادة معلّقة وصلت قبل فتح اللعبة → طبّقها فوراً */
    if (typeof Rooms.hasPendingReplay === 'function' && Rooms.hasPendingReplay()) {
      var rp = Rooms.consumePendingReplay();
      if (rp) setTimeout(function () { bjApplyReplay(rp); }, 50);
    } else if (typeof Rooms.requestReplay === 'function') {
      setTimeout(function () { try { Rooms.requestReplay(); } catch (e) {} }, 300);
    }
    return gFrame(bjRoomFrame(g), g);
  }
  bindBetPulse();
  return gFrame(
    betRow() +
    '<div class="bjt">' +
      '<div class="bja">' +
        '<div class="bjal">' + T('bj.dealer') + '</div>' +
        '<div class="bjcs" id="bDc"></div>' +
        '<div class="bjs" id="bDs">?</div>' +
      '</div>' +
      '<div class="bja" id="bAreaP">' +
        '<div class="bjal">' + T('bj.you') + '</div>' +
        '<div class="bjcs" id="bPc"></div>' +
        '<div class="bjs" id="bPs">0</div>' +
      '</div>' +
      '<div class="bja" id="bAreaS" style="display:none">' +
        '<div class="bjal"> Split</div>' +
        '<div class="bjcs" id="bSc"></div>' +
        '<div class="bjs" id="bSs">0</div>' +
      '</div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big" id="bDeal" onclick="dealB()"><i class="fa-solid fa-hand" aria-hidden="true"></i> ' + T('g.deal') + '</button>' +
      '<button class="big" id="bHit" onclick="hitB()" disabled style="background:var(--gb);color:#fff"><i class="fa-solid fa-plus" aria-hidden="true"></i> ' + T('g.hit') + '</button>' +
      '<button class="big" id="bStand" onclick="standB()" disabled style="background:linear-gradient(135deg,#10B981,#34D399);color:#fff"><i class="fa-solid fa-stop" aria-hidden="true"></i> ' + T('g.stand') + '</button>' +
      '<button class="big" id="bDouble" onclick="doubleB()" disabled style="background:linear-gradient(135deg,#7C3AED,#A78BFA);color:#fff"><i class="fa-solid fa-angles-up" aria-hidden="true"></i> ' + T('g.double') + '</button>' +
      '<button class="big" id="bSplit" onclick="splitB()" disabled style="background:linear-gradient(135deg,#F5C518,#FF8C00);color:#0A0E1A"><i class="fa-solid fa-shuffle" aria-hidden="true"></i> ' + T('g.split') + '</button>' +
    '</div>',
    g
  );
}
/* ── إنشاء مجموعة ورق ── */
function mkDeck() {
  bDeck = [];
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  for (let s = 0; s < 4; s++) {
    for (let r = 0; r < 13; r++) {
      bDeck.push({ s: suits[s], r: ranks[r] });
    }
  }
  /* خلط Fisher-Yates */
  for (let i = bDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = bDeck[i];
    bDeck[i] = bDeck[j];
    bDeck[j] = t;
  }
}
/* ── قيمة الورقة ── */
function cv2(c) {
  if (c.r === 'A') return 11;
  if (c.r === 'J' || c.r === 'Q' || c.r === 'K') return 10;
  return parseInt(c.r, 10);
}
/* ── قيمة اليد ── */
function hv(h) {
  let v = 0;
  let a = 0;
  for (let i = 0; i < h.length; i++) {
    v += cv2(h[i]);
    if (h[i].r === 'A') a++;
  }
  while (v > 21 && a > 0) {
    v -= 10;
    a--;
  }
  return v;
}
/* ── عرض الأوراق (limit يحدّ عدد الأوراق الظاهرة أثناء التوزيع المتدرج) ── */
function renderB(hide, limit) {
  const pEl = document.getElementById('bPc');
  const dEl = document.getElementById('bDc');
  const psEl = document.getElementById('bPs');
  const dsEl = document.getElementById('bDs');
  const pn = (limit && limit.p != null) ? limit.p : bP.length;
  const dn = (limit && limit.d != null) ? limit.d : bD.length;
  if (pEl) pEl.innerHTML = bP.slice(0, pn).map(c => cardHTML(c, false)).join('');
  if (dEl) {
    dEl.innerHTML = bD.slice(0, dn).map((c, i) => {
      return (hide && i === 1) ? cardHTML(c, true) : cardHTML(c, false);
    }).join('');
  }
  if (psEl) psEl.textContent = hv(bP.slice(0, pn));
  if (dsEl) dsEl.textContent = (hide && bOn) ? '?' : hv(bD.slice(0, dn));
  if (bSplit) {
    const scEl = document.getElementById('bSc');
    const ssEl = document.getElementById('bSs');
    const areaS = document.getElementById('bAreaS');
    if (areaS) areaS.style.display = 'block';
    if (scEl) scEl.innerHTML = bSplitHand.map(c => cardHTML(c, false)).join('');
    if (ssEl) ssEl.textContent = hv(bSplitHand);
  }
}
/* ── التوزيع (متدرج: ورقة كل 280ms مع صوت) ── */
function dealB() {
  if (!take()) return;
  bSeq++;
  mkDeck();
  bP = [bDeck.pop(), bDeck.pop()];
  bD = [bDeck.pop(), bDeck.pop()];
  bOn = true;
  bSplit = false;
  bSplitHand = [];
  bSplitActive = 0;
  bDbl = [false, false];
  /* بداية جولة بلاك جاك — قابلة للاستئناف عند العودة */
  if (typeof window.SessionResume !== 'undefined') {
    try { window.SessionResume.markRoundStart({ gameId: 'bj' }); } catch (e) {}
  }
  const seq = bSeq;
  /* تعطيل كل الأزرار حتى اكتمال التوزيع */
  document.getElementById('bDeal').disabled = true;
  document.getElementById('bHit').disabled = true;
  document.getElementById('bStand').disabled = true;
  document.getElementById('bDouble').disabled = true;
  document.getElementById('bSplit').disabled = true;
  gres('', 0);
  /* توزيع الورق ورقةً ورقة مع صوت حفيف */
  const steps = [
    { t: 0,   f: () => { SND.deal(); renderB(true, { p: 1, d: 0 }); } },
    { t: 280, f: () => { SND.deal(); renderB(true, { p: 2, d: 0 }); } },
    { t: 560, f: () => { SND.deal(); renderB(true, { p: 2, d: 1 }); } },
    { t: 840, f: () => { SND.deal(); renderB(true, { p: 2, d: 2 }); } }
  ];
  steps.forEach(s => setTimeout(function () {
    if (seq !== bSeq) return;
    s.f();
  }, s.t));
  const areaP = document.getElementById('bAreaP');
  if (areaP) areaP.classList.add('bj-live');
  const areaS = document.getElementById('bAreaS');
  if (areaS) areaS.style.display = 'none';
  /* تفعيل الأزرار بعد اكتمال التوزيع + فحص Blackjack الطبيعي */
  setTimeout(function () {
    if (seq !== bSeq) return;
    document.getElementById('bHit').disabled = false;
    document.getElementById('bStand').disabled = false;
    document.getElementById('bDouble').disabled = false;
    document.getElementById('bSplit').disabled = (cv2(bP[0]) === cv2(bP[1]) && ST.gold >= GB) ? false : true;
    if (hv(bP) === 21) {
      if (hv(bD) === 21) {
        /* تعادل Blackjack متبادل — استرداد الرهان */
        give(GB);
        gres(T('bj.bjpush') + ' +' + fmt(GB) + ' 🪙', GB);
        toast('<i class="fa-solid fa-handshake"></i> 21/21 — ' + T('bj.bjpush') + ' +' + fmt(GB) + ' 🪙', 'warn');
      } else {
        const w = Math.floor(GB * 2.5);
        give(w);
        gres(T('ts.blackjack') + ' +' + fmt(w) + ' 🪙', w);
        celebrate(true);
        toast('<i class="fa-solid fa-trophy"></i> ' + T('ts.blackjack') + ' +' + fmt(w) + ' 🪙', 'ok');
      }
      endB();
    }
  }, 920);
}
/* ── التقسيم ── */
function splitB() {
  if (!bOn || cv2(bP[0]) !== cv2(bP[1]) || ST.gold < GB) return;
  ST.gold -= GB;
  save();
  wallet();
  bSplit = true;
  bSplitHand = [bP.pop()];
  bP.push(bDeck.pop());
  bSplitHand.push(bDeck.pop());
  bDbl = [false, false];
  SND.deal();
  renderB(true);
  document.getElementById('bSplit').disabled = true;
}
/* ── المضاعفة ── */
function doubleB() {
  if (!bOn || ST.gold < GB) return;
  ST.gold -= GB;
  save();
  wallet();
  bDbl[bSplitActive] = true;
  bP.push(bDeck.pop());
  SND.deal();
  renderB(true);
  if (hv(bP) > 21) {
    if (bSplit && bSplitActive === 0) {
      /* اليد الأولى تجاوزت 21 بعد المضاعفة → الانتقال لليد الثانية بدلاً من إنهاء اللعبة */
      bSplitActive = 1;
      const done = bP;
      bP = bSplitHand;
      bSplitHand = done;
      gres(T('bj.hand1bust'), false);
      renderB(true);
      document.getElementById('bDouble').disabled = (ST.gold >= GB) ? false : true;
      return;
    }
    if (bSplit && bSplitActive === 1) {
      /* اليد الثانية تجاوزت 21 → الموزع يلعب ويحسم اليدين معاً */
      SND.lose();
      standB();
      return;
    }
    gres(' ' + T('ts.lose'), false);
    SND.lose();
    bjEncourage('lose', 0);
    endB();
  } else {
    standB();
  }
}
/* ── سحب ورقة ── */
function hitB() {
  if (!bOn) return;
  bP.push(bDeck.pop());
  SND.deal();
  document.getElementById('bDouble').disabled = true;
  document.getElementById('bSplit').disabled = true;
  const seq = bSeq;
  /* تأخير قصير لرؤية الورقة قبل الحسم */
  setTimeout(function () {
    if (seq !== bSeq) return;
    renderB(true);
    if (hv(bP) > 21) {
      if (bSplit && bSplitActive === 0) {
        /* اليد الأولى تجاوزت 21 → الانتقال لليد الثانية (تبادل الأدوار) */
        bSplitActive = 1;
        const done = bP;
        bP = bSplitHand;
        bSplitHand = done;
        gres(T('bj.hand1bust'), false);
        renderB(true);
        document.getElementById('bDouble').disabled = (ST.gold >= GB) ? false : true;
        return;
      }
      if (bSplit && bSplitActive === 1) {
        /* اليد الثانية تجاوزت 21 → الموزع يلعب ويحسم اليدين معاً
           (اليد التي bust تخسر، والأولى قد تكون stand رابحة) */
        SND.lose();
        standB();
        return;
      }
      gres(' ' + T('ts.lose'), false);
      SND.lose();
      bjEncourage('lose', 0);
      endB();
    }
  }, 180);
}
/* ── رسالة تشجيعية بعد نتيجة الجولة ── */
function bjEncourage(kind, w) {
  if (kind === 'win') {
    toast('<i class="fa-solid fa-trophy"></i> ' + (w >= GB * 2 ? 'ربح رائع!' : 'فوز!') + ' +' + fmt(w) + ' 🪙', 'ok');
  } else if (kind === 'lose') {
    toast('<i class="fa-solid fa-heart"></i> لا بأس — الحظ في الجولة القادمة!', 'warn');
  }
}
/* ── الوقوف ── */
function standB() {
  if (!bOn) return;
  if (bSplit && bSplitActive === 0) {
    /* اليد الأولى وقفت → الانتقال لليد الثانية (تبادل الأدوار) بلا لعب الموزع */
    bSplitActive = 1;
    const done = bP;
    bP = bSplitHand;
    bSplitHand = done;
    gres(T('bj.hand1done'), false);
    renderB(true);
    document.getElementById('bDouble').disabled = (ST.gold >= GB) ? false : true;
    return;
  }
  bOn = false;
  const btnDeal = document.getElementById('bDeal');
  const btnHit = document.getElementById('bHit');
  const btnStand = document.getElementById('bStand');
  const btnDouble = document.getElementById('bDouble');
  const btnSplit = document.getElementById('bSplit');
  if (btnDeal) btnDeal.disabled = true;
  if (btnHit) btnHit.disabled = true;
  if (btnStand) btnStand.disabled = true;
  if (btnDouble) btnDouble.disabled = true;
  if (btnSplit) btnSplit.disabled = true;
  /* مؤشر تفكير الموزع ثم سحب الورق ورقةً ورقة مع صوت */
  const dsEl = document.getElementById('bDs');
  if (dsEl) {
    dsEl.textContent = '…';
    dsEl.classList.add('thinking');
  }
  const seq = bSeq;
  const toDraw = [];
  /* محاكاة يد الموزع في نسخة مؤقتة حتى تُحسم القيمة قبل الأنيميشن
     (كانت الحلقة تنفجر حتى يفرغ السطح لأنها لم تحدّث bD داخلها) */
  const sim = bD.slice();
  while (hv(sim) < 17) {
    const c = bDeck.pop();
    if (!c) break;
    sim.push(c);
    toDraw.push(c);
  }
  toDraw.forEach(function (c, i) {
    setTimeout(function () {
      if (seq !== bSeq) return;
      bD.push(c);
      SND.deal();
      renderB(false);
    }, 420 + i * 320);
  });
  setTimeout(function () {
    if (seq !== bSeq) return;
    if (dsEl) dsEl.classList.remove('thinking');
    finishStandB();
  }, 420 + toDraw.length * 320 + 350);
}
function finishStandB() {
  renderB(false);
  const d = hv(bD);
  /* اليدان بالترتيب الأصلي: الأولى في bSplitHand (منتهية)، الثانية في bP (نشطة) */
  const hands = bSplit ? [bSplitHand, bP] : [bP];
  let totalW = 0;
  let sumBets = 0;
  let wHands = 0, lHands = 0;
  hands.forEach(function (hand, i) {
    const bet = GB * (bDbl[i] ? 2 : 1);
    sumBets += bet;
    const p = hv(hand);
    if (p > 21) {
      lHands++;
    } else if (d > 21 || p > d) {
      totalW += bet * 2;
      wHands++;
    } else if (p === d) {
      totalW += bet;
    } else {
      lHands++;
    }
  });

  let m = '';
  let kind = 'lose';
  if (totalW > sumBets) {
    kind = 'win';
    m = ' +' + fmt(totalW) + ' 🪙';
  } else if (totalW > 0) {
    kind = 'push';
    m = ' Push +' + fmt(totalW) + ' 🪙';
  } else {
    m = ' ' + T('ts.lose');
  }

  give(totalW);
  gres(m, totalW);
  if (kind === 'win' && typeof burst === 'function') {
    const area = document.getElementById('bAreaP');
    if (area) {
      const r = area.getBoundingClientRect();
      if (r.width) burst(r.left + r.width / 2, r.top + r.height / 2, ['#F5C518', '#FFD93D', '#34D399'], 20, 5);
    }
  }
  if (totalW >= GB * 2) celebrate(true);
  bjEncourage(kind, totalW);
  fairTick();
  endB();
}
/* ── إنهاء الجولة ── */
function endB() {
  bOn = false;
  const d = document.getElementById('bDeal');
  const h = document.getElementById('bHit');
  const s = document.getElementById('bStand');
  const dd = document.getElementById('bDouble');
  const sp = document.getElementById('bSplit');
  if (d) d.disabled = false;
  if (h) h.disabled = true;
  if (s) s.disabled = true;
  if (dd) dd.disabled = true;
  if (sp) sp.disabled = true;
  const areaP = document.getElementById('bAreaP');
  if (areaP) areaP.classList.remove('bj-live');
  const areaS = document.getElementById('bAreaS');
  if (areaS) areaS.style.display = 'none';
  renderB(false);
}

/* ═══════════════════════════════════════════
   بلاك جاك الجماعي (bjRoom) — 2-4 لاعبين بلا بانكر
   السائق (owner/driverId) يدير BJMP محلياً ويبث snapshot عبر
   غلاف rmove (تسجيل moveHistory + dedup للعائدين)؛ غير السائق
   يرسل bjact فيطبّقها السائق ويبث bjmove جديدة للجميع.
   ═══════════════════════════════════════════ */
var bjRoom = {
  snap: null,        /* snapshot الجولة الحالية (BJMP) */
  results: null,     /* نتائج التسوية [{id,won,share}] */
  seq: 0,           /* عدّاد البث (dedup) */
  turnTimer: null,   /* مهلة 30ث لكل دور — انتهاؤها = stand تلقائي */
  settleT: null,     /* مؤقّت إعادة الغرفة لحالة waiting بعد التسوية */
  replaying: false   /* يحرس إعادة البناء من السجل (لا بث أثناء الإعادة) */
};
function bjMeId() {
  return (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user.id : null;
}
function bjIsDriver() {
  var room = (typeof Rooms !== 'undefined' && Rooms.state) || null;
  if (!room) return false;
  var me = bjMeId();
  return me != null && String(room.driverId != null ? room.driverId : room.owner_id) === String(me);
}
function bjIsSpectator() {
  var room = (typeof Rooms !== 'undefined' && Rooms.state) || null;
  var me = bjMeId();
  if (!room || !room.players || me == null) return false;
  for (var i = 0; i < room.players.length; i++) {
    if (String(room.players[i].id) === String(me)) return !!room.players[i].spectate;
  }
  return true;
}
/* بث snapshot موحّد بغلاف rmove — action فرعي يميّز نوع الحدث */
function bjEmit(action, extra) {
  if (typeof Rooms === 'undefined' || !Rooms.state) return;
  bjRoom.seq++;
  var payload = {
    action: 'rmove',
    data: { t: action, snap: bjRoom.snap, results: bjRoom.results || null, dedup: 'bj' + Date.now() + Math.random() },
    by: bjMeId(), seq: bjRoom.seq, ts: Date.now()
  };
  if (extra) { for (var k in extra) payload.data[k] = extra[k]; }
  try { Rooms.sendMove('rmove', payload, { game_id: 'bj', status: 'playing' }); } catch (e) {}
}
/* بدء الجولة: السائق فقط يبني BJMP.newRound ويبث — البقية يرسمون عند الاستقبال */
function bjRoomStart(room) {
  bjRoom.turnTimer && clearTimeout(bjRoom.turnTimer);
  bjRoom.settleT && clearTimeout(bjRoom.settleT);
  bjRoom.turnTimer = null;
  bjRoom.settleT = null;
  bjRoom.results = null;
  bjRoom.replaying = false;
  if (!bjIsDriver()) { bjRoomUi(); return; }
  var players = (room.order || []).map(function (id) {
    var p = (room.players || []).filter(function (x) { return String(x.id) === String(id); })[0];
    return { id: id, name: p ? p.username : String(id) };
  });
  if (!players.length) return;
  bjRoom.snap = BJMP.newRound(players, 0, (room && room.bet) || 0);
  bjEmit('bjmove');
  bjArmTurnTimer();
  bjRoomUi();
}
/* [Resilience] إعادة بناء الجولة للعائد: آخر bjmove/bjsettle في السجل هو الحالة الحالية */
function bjApplyReplay(d) {
  if (!d || !d.history || !d.history.length) return;
  if (typeof Rooms === 'undefined' || !Rooms.state || Rooms.state.game_id !== 'bj') return;
  if (!document.getElementById('bjRoomAreas')) return;   /* اللعبة غير مفتوحة — سيُطلب عند الفتح */
  var last = null;
  for (var i = 0; i < d.history.length; i++) {
    var it = d.history[i];
    if (it && (it.t === 'bjmove' || it.t === 'bjsettle')) last = it;
  }
  if (!last || !last.snap) { bjRoomUi(); return; }   /* لم تبدأ الجولة بعد */
  bjRoom.snap = last.snap;
  bjRoom.results = last.results || null;
  /* جولة نشطة والسائق عاد: أعِد تسليح مؤقت الدور الحالي */
  if (bjRoom.snap.phase === 'play' && bjRoom.snap.turnIdx >= 0) bjArmTurnTimer();
  bjRoomUi();
}
/* [SYNC-FIX] انتهت الجولة (playing→waiting): صفّر المحرك وأوقف المؤقتات عند الجميع */
function bjOnRoundEnded() {
  bjRoom.turnTimer && clearTimeout(bjRoom.turnTimer);
  bjRoom.settleT && clearTimeout(bjRoom.settleT);
  bjRoom.turnTimer = null;
  bjRoom.settleT = null;
  bjRoom.snap = null;
  bjRoom.results = null;
}
/* صدى الذات: الخادم يعيد بثّ حركتي للجميع — تجاهل نسختي */
function bjRoomMove(d) {
  if (!d) return;
  if (d.action === 'rmove' && d.data) d = d.data;
  var by = d.by;
  if (by != null && bjMeId() != null && String(by) === String(bjMeId())) return;
  if (d.t === 'bjmove' || d.t === 'bjsettle') {
    if (d.snap) {
      bjRoom.snap = d.snap;
      bjRoom.results = d.results || null;
    }
    bjRoomUi();
    if (d.t === 'bjsettle') {
      /* انتهت الجولة عند الجميع — السائق يعيد الغرفة لانتظار جولة جديدة */
      if (bjIsDriver()) bjScheduleEndBet();
    }
  } else if (d.t === 'bjact') {
    /* حركة لاعب غير السائق: السائق يطبّقها على snapshot النشط ويبث */
    if (!bjIsDriver() || !bjRoom.snap) return;
    if (d.pid != null && d.act && String(d.seqRef || bjRoom.snap.seq) === String(bjRoom.snap.seq)) {
      bjApplyAct(String(d.pid), d.act, true);
    }
  }
}
/* فعل (hit/stand/double) من أي لاعب: السائق محلياً؛ غيره يرسل bjact للسائق */
function bjAct(act) {
  var snap = bjRoom.snap;
  if (!snap || snap.phase !== 'play') return;
  var me = bjMeId();
  if (me == null) return;
  var cur = snap.players[snap.turnIdx];
  if (!cur || String(cur.id) !== String(me) || cur.done) return;
  /* double: سقف الرصيد يُفحص هنا (الواجهة) — رهان المضاعفة = رهان الجولة */
  if (act === 'double') {
    var bet = (typeof Rooms !== 'undefined' && Rooms.state) ? (Rooms.state.bet || 0) : 0;
    if (typeof ST !== 'undefined' && ST.gold < bet) { toast(T('ts.noc'), 'err'); return; }
  }
  if (bjIsDriver()) bjApplyAct(String(me), act, true);
  else {
    try { Rooms.sendMove('rmove', { action: 'rmove', data: { t: 'bjact', act: act, pid: me, seqRef: snap.seq }, by: bjMeId() }); } catch (e) {}
  }
}
/* السائق: تطبيق فعل على snapshot ثم بث/bust-vote التسوية عند اكتمال done للجميع */
function bjApplyAct(pid, act, broadcast) {
  var snap = bjRoom.snap;
  if (!snap || snap.phase !== 'play') return;
  var ns = BJMP.applyAct(snap, pid, act);
  if (ns === snap) return;   /* حركة غير نافذة */
  bjRoom.snap = ns;
  bjRoom.turnTimer && clearTimeout(bjRoom.turnTimer);
  bjRoom.turnTimer = null;
  if (broadcast) bjEmit('bjmove');
  /* اكتمال done للجميع → التسوية */
  if (ns.turnIdx === -1 && ns.phase === 'play') bjDoSettle();
  else bjArmTurnTimer();
  bjRoomUi();
}
/* التسوية: السائق يحسب النتائج ويبث bjsettle — ثم settleRound خادمياً (draw/w0/w1) */
function bjDoSettle() {
  var out = BJMP.settle(bjRoom.snap);
  if (!out) return;
  bjRoom.snap = out.snap;
  bjRoom.results = out.results;
  bjEmit('bjsettle');
  /* تسوية خادمية بنفس مسار ضاما: pot مخصص (رهانات البشر) يوزَّع برسم 5%
     — هنا نستدعي /api/rooms/settle بالفائز/الخاسر (مسار روندا) */
  bjServerSettle();
}
/* تسوية الأرصدة خادمياً: السائق يعلن النتيجة — الأرصدة تصرف من الخادم حصراً.
   نفس مسار ضاما/الروندا: roomSettle('w'+seat) → /api/rooms/settleRound
   (الرهانات اقتُطعت عند /api/rooms/start؛ هنا تُوزَّع فقط بعد رسم 5%).
   draw → استرجاع كامل للجميع (بما فيه حالة «الكل احترق»). */
function bjServerSettle() {
  if (typeof Rooms === 'undefined' || !Rooms.state || !bjIsDriver()) return;
  var room = Rooms.state;
  var order = room.order || [];
  var results = bjRoom.results || [];
  var winners = results.filter(function (r) { return r.won; });
  var res = null;
  if (!winners.length) {
    /* لا فائز (الكل احترق) → استرجاع الرهانات للجميع بلا رسوم */
    res = 'draw';
  } else if (winners.length === 1) {
    /* فائز واحد: مقعده في order — يأخذ القدح كاملاً بعد رسم 5% */
    var wIdx = order.findIndex(function (id) { return String(id) === String(winners[0].id); });
    if (wIdx >= 0 && wIdx < 4) res = 'w' + wIdx;
  } else {
    /* تعادل جماعي: التقاسم الحقيقي يحتاج تقسيم القدح — الأقرب لمسار الخادم
       الحالي: الفائز الأول (بالمقعد) يأخذ القدح، ثم تحويلات بينية تعيد
       التوزيع العادل. عملياً أعلمنا تعادلاً واسترجاعاً كاملاً (لا خسارة
       لأحد) — الأبسط والأسلم محاسبياً بلا تحويلات محلية. */
    res = 'draw';
  }
  try { Rooms.roomSettle(res); } catch (e) {}
}
/* بعد التسوية: إعادة الغرفة لحالة waiting بعد 4 ثوان (نمط endBet الموجود) */
function bjScheduleEndBet() {
  if (!bjIsDriver()) return;
  if (bjRoom.settleT) return;
  bjRoom.settleT = setTimeout(function () {
    bjRoom.settleT = null;
    if (typeof Rooms !== 'undefined' && Rooms.state && typeof Rooms.endBet === 'function') {
      try { Rooms.endBet(); } catch (e) {}
    }
  }, 4000);
}
/* ── [Bot] استراتيجية الآلي الأساسية — Basic Strategy قياسي (لاس فيغاس، S17) ──
   الجدول الكامل (الموزع يقف على 17):
   • hard: ≤8 hit | 9 double×3-6 | 10 double×2-9 | 11 double×2-10 (hit vs A)
     | 12 stand×4-6 وhit vs 2-3/7+ | 13-16 stand×2-6 وhit×7+ | 17+ stand
   • soft: 13-14 double×5-6 | 15-16 double×4-6 | 17 double×3-6
     | 18 hit×9-10-A وstand×2/7/8 وdouble×3-6 | 19+ stand
   • أزواج: A,A و 8,8 = Split مثالي لكن split غير مدعوم في محرك BJMP →
     تسقط لقاعدة المجموع (soft 12 → hit دائماً، hard 16 → جدول hard)؛
     5,5 لا تُقسّم أبداً (hard 10)، 9,9 → hard 18، 10,10 → hard 20.
   BJMP جماعي بلا موزع → dealerUp=null يُفترض 10 (أشيع قيمة ورقة) فتتحقق
   القواعد: 16 vs 10 = Hit، 12 vs 2-3 = Hit، soft 18 vs 9-10-A = Hit.
   الصادر حركات المحرك المدعومة فقط: hit/stand/double (بلا split). */
function bjBotHandInfo(cards) {
  var v = 0, aces = 0;
  for (var i = 0; i < cards.length; i++) {
    v += cv2(cards[i]);
    if (String(cards[i].r) === 'A') aces++;
  }
  while (v > 21 && aces > 0) { v -= 10; aces--; }
  return { total: v, soft: aces > 0 };
}
function bjBotBasicAct(cards, dealerUp, canDouble) {
  var d = (dealerUp >= 2 && dealerUp <= 11) ? dealerUp : 10;   /* بلا موزع → 10 */
  var hi = d >= 7;
  var info = bjBotHandInfo(cards);
  var t = info.total;
  var soft = info.soft;
  var dbl = !!canDouble;
  if (t >= 21) return 'stand';                                  /* 21 = وقوف */
  if (!soft) {
    /* hard totals — أزواج بلا split تُقيَّم بمجموعها (8,8→16، 5,5→10، 9,9→18، 10,10→20) */
    if (t >= 17) return 'stand';
    if (t >= 13) return hi ? 'hit' : 'stand';                   /* 13-16: hit×7+ */
    if (t === 12) return (d >= 4 && d <= 6) ? 'stand' : 'hit';  /* 12 vs 2-3 = Hit */
    if (t === 11) return (dbl && d <= 10) ? 'double' : 'hit';
    if (t === 10) return (dbl && d <= 9) ? 'double' : 'hit';
    if (t === 9) return (dbl && d >= 3 && d <= 6) ? 'double' : 'hit';
    return 'hit';                                                /* ≤ 8 */
  }
  /* soft totals — A,A (soft 12) بلا split → hit */
  if (t >= 19) return 'stand';
  if (t === 18) {
    if (d >= 9) return 'hit';                                   /* soft 18 vs 9-10-A = Hit */
    if (dbl && d >= 3 && d <= 6) return 'double';
    return 'stand';                                             /* soft 18 vs 2/7/8 */
  }
  if (t === 17) return (dbl && d >= 3 && d <= 6) ? 'double' : 'hit';
  if (t >= 15) return (dbl && d >= 4 && d <= 6) ? 'double' : 'hit';
  if (t >= 13) return (dbl && d >= 5 && d <= 6) ? 'double' : 'hit';
  return 'hit';                                                  /* soft 12 */
}
/* مهلة الدور: 30ث للبشري → stand تلقائي؛ البوت يلعب بالاستراتيجية الأساسية
   (السائق فقط — إلغاء سلس عند تغيّر الدور) */
function bjArmTurnTimer() {
  if (!bjIsDriver() || !bjRoom.snap || bjRoom.snap.phase !== 'play') return;
  bjRoom.turnTimer && clearTimeout(bjRoom.turnTimer);
  bjRoom.turnTimer = null;
  var cur = bjRoom.snap.players[bjRoom.snap.turnIdx];
  if (!cur) return;
  var room = (typeof Rooms !== 'undefined' && Rooms.state) || null;
  var pEntry = room && room.players ? room.players.filter(function (p) { return String(p.id) === String(cur.id); })[0] : null;
  var pid = cur.id;
  if (pEntry && pEntry.isBot) {
    /* البوت الآلي: يلعب بعد 800ms (أنيميشن إدراك) بالاستراتيجية الأساسية
       bjBotBasicAct — double متاح بالورقتين الأوليتين فقط (شرط المحرك) */
    bjRoom.turnTimer = setTimeout(function () {
      bjRoom.turnTimer = null;
      if (!bjRoom.snap || bjRoom.snap.phase !== 'play') return;
      var c = bjRoom.snap.players[bjRoom.snap.turnIdx];
      if (!c || String(c.id) !== String(pid)) return;
      var canDouble = c.cards.length === 2;
      bjApplyAct(String(pid), bjBotBasicAct(c.cards, null, canDouble), true);
    }, 800);
    return;
  }
  bjRoom.turnTimer = setTimeout(function () {
    bjRoom.turnTimer = null;
    if (!bjRoom.snap || bjRoom.snap.phase !== 'play') return;
    var c2 = bjRoom.snap.players[bjRoom.snap.turnIdx];
    if (!c2 || String(c2.id) !== String(pid)) return;
    bjApplyAct(String(pid), 'stand', true);
  }, 30000);
}
/* واجهة الغرفة: شبكة بطاقات أفقية لكل اللاعبين + شريط القدح + الأزرار */
function bjRoomFrame(g) {
  var st = (typeof Rooms !== 'undefined' && Rooms.state) || {};
  return betRow() +
    '<div class="bjt" id="bjRoomTable">' +
      '<div class="bjal" id="bjPotBar" style="text-align:center"></div>' +
      '<div id="bjRoomAreas" style="min-height:120px"></div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big" id="bHit" onclick="bjAct(\'hit\')" disabled style="background:var(--gb);color:#fff"><i class="fa-solid fa-plus" aria-hidden="true"></i> ' + T('g.hit') + '</button>' +
      '<button class="big" id="bStand" onclick="bjAct(\'stand\')" disabled style="background:linear-gradient(135deg,#10B981,#34D399);color:#fff"><i class="fa-solid fa-stop" aria-hidden="true"></i> ' + T('g.stand') + '</button>' +
      '<button class="big" id="bDouble" onclick="bjAct(\'double\')" disabled style="background:linear-gradient(135deg,#7C3AED,#A78BFA);color:#fff"><i class="fa-solid fa-angles-up" aria-hidden="true"></i> ' + T('g.double') + '</button>' +
    '</div>';
}
/* رسم وضع الغرفة من bjRoom.snap — بطاقة أفقية لكل لاعب */
function bjRoomUi() {
  var host = document.getElementById('bjRoomAreas');
  if (!host) return;
  var snap = bjRoom.snap;
  var st = (typeof Rooms !== 'undefined' && Rooms.state) || {};
  var pot = (st.bet || 0) * ((st.players || []).filter(function (p) { return !p.spectate; }).length);
  var potEl = document.getElementById('bjPotBar');
  if (potEl) potEl.innerHTML = '💰 ' + T('bj.pot') + ': <b>' + fmt(pot) + '</b> ' + T('rm.bet') + '×' + ((st.players || []).filter(function (p) { return !p.spectate; }).length);
  if (!snap) {
    host.innerHTML = '<div class="bjal" style="padding:24px;text-align:center">' + T('bj.waitPlayers') + '</div>';
    bjSyncButtons(false, false, false);
    return;
  }
  var me = bjMeId();
  var html = '';
  for (var i = 0; i < snap.players.length; i++) {
    var p = snap.players[i];
    var mine = String(p.id) === String(me);
    var state = '';
    if (snap.phase === 'settled') {
      var res = (bjRoom.results || []).filter(function (r) { return String(r.id) === String(p.id); })[0];
      state = res && res.won ? '🏆 ' + T('bj.winner') + ' +' + fmt(res.share) : (p.busted ? T('bj.bustedM') : '');
    } else if (p.busted) state = '💥 ' + T('bj.bustedM');
    else if (p.done) state = '⏸ ' + T('bj.stoodM');
    else if (String(snap.players[snap.turnIdx] && snap.players[snap.turnIdx].id) === String(me)) state = '🎮 ' + T('bj.yourTurn');
    else if (i === snap.turnIdx) state = '🎮 ' + T('bj.turn');
    html += '<div class="bja' + (i === snap.turnIdx && snap.phase === 'play' ? ' bj-live' : '') + (mine ? ' bj-mine' : '') + '" id="bjAreaP' + i + '">' +
      '<div class="bjal">' + (mine ? T('bj.you') : p.name) + (state ? ' — ' + state : '') + '</div>' +
      '<div class="bjcs">' + p.cards.map(function (c) { return cardHTML(c, false); }).join('') + '</div>' +
      '<div class="bjs">' + p.total + '</div>' +
    '</div>';
  }
  host.innerHTML = html;
  var myTurn = !!(snap && snap.phase === 'play' && !bjIsSpectator() &&
    snap.players[snap.turnIdx] && String(snap.players[snap.turnIdx].id) === String(me));
  var canDouble = myTurn && snap.players[snap.turnIdx].cards.length === 2;
  bjSyncButtons(myTurn, myTurn, myTurn && canDouble);
  if (snap.phase === 'settled') {
    var winners = (bjRoom.results || []).filter(function (r) { return r.won; });
    var names = winners.map(function (w) {
      var p = snap.players.filter(function (x) { return String(x.id) === String(w.id); })[0];
      return p ? p.name : '';
    }).filter(Boolean).join(' و ');
    gres(T('bj.roundDone') + (winners.length > 1 ? ' — ' + T('bj.tieM') : ' — ' + T('bj.winner') + ': ') + (names || ''), 0, true);
  }
}
function bjSyncButtons(hit, stand, dbl) {
  var h = document.getElementById('bHit');
  var s = document.getElementById('bStand');
  var d = document.getElementById('bDouble');
  if (h) h.disabled = !hit;
  if (s) s.disabled = !stand;
  if (d) d.disabled = !dbl;
}

/* ── Export to window ── */
window.eBj = eBj;
window.BJMP = BJMP;
