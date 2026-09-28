/**
 * ============================================================================
 *  BG ROOM — وضع الغرفة للطاولة (أونلاين بمزامنة خادمية) — نمط dama.js
 * ============================================================================
 *  • bgRegisterRooms(): تسجيل معالجات Rooms (setGameHandler/setStartHandler)
 *    + window.applyRoomReplay + استئناف الجولة الجارية عند إعادة الفتح.
 *  • الترميم مطلق كما في المحرك: لاعب المحرك 0 = مقعد الغرفة 0 (المضيف/الأسفل)،
 *    لاعب 1 = مقعد 1 (الضيف/الأعلى). الرقعة مشتركة حتمية — الحركات تُبَثّ
 *    برقم اللاعب المطلق وتُطبَّق عند الجميع بالتحقق القانوني الكامل.
 *  • البروتوكول عبر rmove (نمط ضاما): init {len} | roll {kind, forced, player}
 *    | move {mv, player} | endturn | nextgame | resign — يُخزَّن في moveHistory
 *    (إعادة بناء عند العودة/للمتفرج المتأخر).
 *  • النرد يُبَثّ بالقيم الصريحة (forced) — حتمية تامة بلا بذور ولا قرعة.
 *  • الرهان خادمي بالكامل (اقتطاع عند البدء + settleRound للمضيف) — لا محفظة
 *    محلية ولا تذاكر في وضع الغرفة؛ الأرصدة عبر Rooms._onSettle العام.
 * ============================================================================
 */
(function (root) {
  'use strict';

  const T = root.BWG_T;

  function app() { return root.BackgammonApp; }
  function room() { const a = app(); return (a && a.room) || null; }

  /* ── هويتي في الغرفة ── */
  function meId() {
    try {
      if (typeof root.AUTH !== 'undefined' && root.AUTH && root.AUTH.user) return root.AUTH.user.id;
      if (typeof root.ST !== 'undefined' && root.ST && root.ST.user) return root.ST.user.id;
    } catch (e) {}
    return null;
  }

  /* ── البث (نمط damaEmit: غلاف rmove + dedup) ── */
  let _seq = 0;
  function emit(action, data) {
    if (typeof root.Rooms === 'undefined' || !root.Rooms || typeof root.Rooms.sendMove !== 'function') return;
    _seq++;
    /* [dedup] مفتاح بمعرّف المُرسِل — كلا الطرفين يبدأ seq من 0 فمفتاح 'bg-N' وحده
       كان يجعل رمية الخصم الأولى تُبتلع كتكرار لرسالتي السابقة بالمفتاح نفسه */
    const payload = { action: action, data: data || {}, by: meId(), seq: _seq, ts: Date.now(), dedup: 'bg-' + meId() + '-' + _seq };
    try { root.Rooms.sendMove('rmove', payload, { game_id: 'bg', status: 'playing' }); }
    catch (e) { if (typeof console !== 'undefined') console.error('[BG MP] emit', e && e.message, e); }
  }

  /* ══════════ بدء المباراة (status=playing — من startHandler) ══════════ */
  function start(rm) {
    if (!rm || rm.game_id !== 'bg' || rm.status !== 'playing') return;
    const a = app();
    if (!a) return;
    const order = (rm.order && rm.order.length) ? rm.order.slice() : [];
    if (!order.length) return;
    const my = meId();
    let mySeat = -1;
    for (let i = 0; i < order.length; i++) if (String(order[i]) === String(my)) { mySeat = i; break; }
    const spec = mySeat === -1;
    let oppBot = false;
    if (rm.players) {
      for (let j = 0; j < rm.players.length; j++) {
        const p = rm.players[j];
        if (p.spectate || String(p.id) === String(my)) continue;
        oppBot = !!p.isBot;
        break;
      }
    }
    /* [RS-GameOpts] طول المباراة من إعدادات الغرفة (اختيار المالك) */
    const cfg = (typeof root.BG_ROOM_CFG === 'object' && root.BG_ROOM_CFG) || {};
    const len = Math.max(1, Math.min(5, parseInt(cfg.len, 10) || 3));
    a.room = { on: true, order: order, mySeat: mySeat, spec: !!spec, oppBot: !!oppBot, len: len, ended: false };
    a.config.mode = 'room';
    a.betPlaced = 0;            /* لا محفظة في الغرفة — الاقتطاع تم في /api/rooms/start */
    a.finished = false;
    a.clearTimers();
    buildLocal(a, len);
    /* السائق (مقعد 0) يبثّ التهيئة — الطرف الآخر بنى محلياً وسيتجاهل init المطابق */
    if (!spec && mySeat === 0) emit('init', { len: len });
    if (spec || mySeat === 0) flow();
  }

  /* بناء مباراة محلية نظيفة (شاشة اللعب + أسماء + رقعة) */
  function buildLocal(a, len) {
    a.makeGame(len);
    if (a.room.oppBot && !a.ai) a.ai = new root.BgGameNS.BgAI(a.game, 2);   /* [v18] بوت الغرفة خبير دائماً */
    a.sel = null; a.undoStack = []; a.busy = false;
    a.showScreen('play');
    a.showLayer('bwOverLayer', false);
    a.showLayer('bwResignLayer', false);
    const rc = a.room;
    a.$('bwTopName').textContent = rc.spec ? spectLabel() : oppName();
    a.$('bwBotName').textContent = rc.spec ? spectLabel() : (T('bg.you') || 'أنت');
    const av = a.$('bwTopAvatar');
    if (av) av.innerHTML = '<i class="fa-solid ' + (rc.oppBot ? 'fa-robot' : 'fa-user') + '" aria-hidden="true"></i>';
    a.refresh();
  }

  function oppName() {
    if (!root.Rooms || !root.Rooms.state) return T('bg.opp') || 'الخصم';
    const my = meId();
    const players = root.Rooms.state.players || [];
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.spectate || String(p.id) === String(my)) continue;
      return p.username || (T('bg.opp') || 'الخصم');
    }
    return T('bg.opp') || 'الخصم';
  }
  function spectLabel() { return '👁️ ' + (T('bg.room.watch') || 'تشاهد المباراة'); }

  /* ══════════ سير اللعب في الغرفة (بديل continueFlow) ══════════ */
  function flow() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game) return;
    const s = a.game.state;
    if (s.phase === 'gameEnd' || s.phase === 'matchEnd') { showEnd(); return; }
    if (s.phase === 'opening') {
      /* الافتتاح: مقعد 0 يرمي ويبثّ النتيجة للجميع (البوت يُدار من مضيفه) */
      if (!rc.spec && rc.mySeat === 0) a.later(doOpening, 420);
      return;
    }
    if (s.phase === 'roll') {
      if (s.rolled) {
        /* استُنفد النرد بلا حركة: صاحب الدور يمرّر (وقد سبقه بثّه).
           [fix] البوت أيضاً: رمى بلا حركة قانونية → تمرير دوره وإلا تجمّدت
           المباراة (كان المسار يغطي صاحب الدور البشري فقط). */
        if (myTurn()) a.later(endTurn, 880);
        else if (rc.oppBot && s.turn === 1) a.later(endTurn, 620);
        return;
      }
      if (myTurn()) { /* دورك — زر الرمي يلمع في الواجهة */ }
      else if (rc.oppBot && s.turn === 1) a.later(botRoll, 620);
      return;
    }
    if (s.phase === 'move') {
      if (myTurn()) { /* دورك — انقر أحجارك */ }
      else if (rc.oppBot && s.turn === 1) botPlay();
    }
  }

  /* هل الدور الحالي لي؟ (المحرك مطلق: لاعب المحرك == مقعدي الغرفي) */
  function myTurn() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game || rc.spec) return false;
    return a.game.state.turn === rc.mySeat;
  }

  /* ── الافتتاح (مقعد 0 يرمي ويبثّ النتيجة) ── */
  function doOpening() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game || a.game.state.phase !== 'opening') return;
    const r = a.game.doOpening();
    a._toast(T('bg.starter'));
    a.refresh();
    if (!rc.spec) emit('roll', { kind: 'opening', forced: [r.dice[0], r.dice[1]] });
    flow();
  }

  /* ── رمي الدور (صاحب الدور يرمي ويبثّ القيمتين الصريحتين) ── */
  function roll() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game) return;
    const s = a.game.state;
    if (s.phase !== 'roll' || s.rolled || !myTurn()) return;
    const p = s.turn;
    a.game.roll(p);
    a.refresh();
    emit('roll', { kind: 'turn', forced: [s.lastRoll[0], s.lastRoll[1]], player: p });
    flow();
  }

  /* ── بثّ حركة (كل نقرة حجر) — من bg-app doMove ── */
  function emitMove(mv) {
    emit('move', { mv: { from: mv.from, to: mv.to, die: mv.die }, player: room().mySeat });
  }

  /* ── تمرير الدور بعد استنفاد النرد (مع البثّ) ── */
  function endTurn() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game) return;
    const s = a.game.state;
    if (s.phase !== 'move' && !(s.phase === 'roll' && s.rolled)) return;
    if (s.phase === 'move' && !myTurn() && !rc.oppBot) return;
    a.game.endTurn();
    a.sel = null; a.undoStack = [];
    a.refresh();
    if (!rc.spec) emit('endturn', {});
    flow();
  }

  /* ── لعبة تالية داخل المباراة (النقاط تبقى) ── */
  function nextGame() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game) return;
    if (a.game.state.phase !== 'gameEnd') return;
    a.game.nextGame();
    a.sel = null; a.undoStack = [];
    a.showLayer('bwOverLayer', false);
    a.refresh();
    emit('nextgame', {});
    flow();
  }

  /* ── دور البوت (المضيف البشري يشغّل مقعد الآلي ويبثّ حركاته) ── */
  function botRoll() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !rc.oppBot || !a.game) return;
    const s = a.game.state;
    if (s.phase !== 'roll' || s.rolled || s.turn !== 1) return;
    a.game.roll(1);
    a.refresh();
    emit('roll', { kind: 'turn', forced: [s.lastRoll[0], s.lastRoll[1]], player: 1 });
    flow();
  }
  function botPlay() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !rc.oppBot || !a.game || a.finished) return;
    const s = a.game.state;
    if (s.phase !== 'move' || s.turn !== 1 || a.busy) return;
    a.busy = true;
    a.later(function () {
      try {
        a.busy = false;
        const play = a.ai ? a.ai.choosePlay(1) : null;
        if (!play || !play.moves.length) { endTurn(); return; }
        botStep(play.moves.slice(), 0);
      } catch (e) { if (typeof console !== 'undefined') console.error('[BG MP] bot', e); }
    }, 560);
  }
  function botStep(moves, i) {
    const a = app();
    if (!a || a.finished) return;
    const s = a.game.state;
    if (i >= moves.length) {
      if (s.phase === 'gameEnd' || s.phase === 'matchEnd') { a.later(showEnd, 650); return; }
      a.later(endTurn, 460);
      return;
    }
    const r = a.game.move(1, moves[i]);
    a.refresh();
    emit('move', { mv: { from: moves[i].from, to: moves[i].to, die: moves[i].die }, player: 1 });
    if (r.ended || s.phase === 'gameEnd' || s.phase === 'matchEnd') { a.later(showEnd, 650); return; }
    a.later(function () { botStep(moves, i + 1); }, 440);
  }

  /* ══════════ استقبال أحداث الغرفة (SSE room:move) ══════════ */
  function onMove(d) {
    try {
      const a = app(), rc = room();
      if (!d || !a) return;
      if (d.action === 'rmove' && d.data) d = d.data;   /* فكّ غلاف rmove */
      const by = d.by;
      if (by != null && String(by) === String(meId())) return;   /* تجاهل صدى حركاتي */
      if (!rc || !rc.on) return;
      const action = d.action;
      const data = d.data || {};
      if (action === 'init') {
        /* تهيئة السائق (متفرج متأخر/عائد بعد أن بنى المضيف): نفس طول المباراة */
        rc.len = Math.max(1, Math.min(5, parseInt(data.len, 10) || 3));
        rc.ended = false;
        a.config.mode = 'room';
        a.finished = false;
        a.clearTimers();
        buildLocal(a, rc.len);
        return;
      }
      if (!a.game) return;
      if (action === 'roll') { applyRoll(data); return; }
      if (action === 'move') { applyMove(data); return; }
      if (action === 'endturn') {
        const s = a.game.state;
        if (s.phase === 'move' || (s.phase === 'roll' && s.rolled)) {
          a.game.endTurn();
          a.sel = null; a.undoStack = [];
          a.refresh();
          flow();
        }
        return;
      }
      if (action === 'nextgame') {
        const s = a.game.state;
        if (s.phase === 'gameEnd') {
          a.game.nextGame();
          a.sel = null; a.undoStack = [];
          a.showLayer('bwOverLayer', false);
          a.refresh();
          flow();
        }
        return;
      }
      if (action === 'resign') {
        const s = a.game.state;
        if (s.phase === 'gameEnd' || s.phase === 'matchEnd') return;
        /* خصمي انسحب → فاز الطرف الآخر (ترقيم مطلق: مقعد الراسل في order) */
        const idx = seatOf(by);
        if (idx < 0) return;
        const w = 1 - idx;
        s.matchScore[w] = s.matchTarget;
        s.winner = w;
        s.gameType = 'single';
        s.phase = 'matchEnd';
        rc.ended = true;
        a.refresh();
        showEnd();
        return;
      }
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[BG MP] onMove', e && e.message, e);
    }
  }

  /* مقعد غرفي من معرّف لاعب (سجل order) */
  function seatOf(uid) {
    const rc = room();
    if (!rc || !rc.order) return -1;
    for (let i = 0; i < rc.order.length; i++) if (String(rc.order[i]) === String(uid)) return i;
    return -1;
  }

  /* تطبيق رميّ وارد (قيم صريحة — حتمية عند الطرفين) */
  function applyRoll(data) {
    const a = app();
    if (!a || !a.game) return;
    const s = a.game.state;
    const f = data.forced;
    /* الدبل ممنوع في الافتتاح فقط (rollOpening يعيده) — أما رمي الأدوار فالدبل
       قانوني و4 حركات: رفضه هنا كان يجمّد المباراة عند أول دبل يرميه الخصم */
    if (!f || f.length < 2) return;
    if (data.kind === 'opening') {
      if (f[0] === f[1]) return;
      if (s.phase !== 'opening') return;
      root.BgCore.rollOpening(s, undefined, f);   /* يحسم البادئ من الزوج نفسه — مطابق عند الجميع */
      a._toast(T('bg.starter'));
      a.refresh();
      flow();
      return;
    }
    /* رمي دور: الطرفان يطبّقان نفس القيمتين (بلا قرعة rng) */
    if (s.phase !== 'roll' || s.rolled) return;
    const p = (typeof data.player === 'number') ? data.player : s.turn;
    if (s.turn !== p) return;
    root.BgCore.roll(s, p, undefined, f);
    a.refresh();
    flow();
  }

  /* تطبيق حركة واردة (تحقق قانونية كامل — نمط damaApplyRemoteMove) */
  function applyMove(data) {
    const a = app(), rc = room();
    if (!a || !a.game) return;
    const s = a.game.state;
    const mv = data.mv;
    if (!mv || s.phase !== 'move') return;
    const p = (typeof data.player === 'number') ? data.player : s.turn;
    if (!rc.spec && s.turn === rc.mySeat) return;   /* مكرّر/قديم — ليس دور الخصم */
    const legal = root.BgCore.legalMoves(s, p);
    let valid = false;
    for (let i = 0; i < legal.length; i++) {
      if (legal[i].from === mv.from && legal[i].to === mv.to && legal[i].die === mv.die) { valid = true; break; }
    }
    if (!valid) return;
    const r = a.game.move(p, mv);
    a.sel = null;
    a.refresh();
    if (r.ended) { a.later(showEnd, 650); return; }
    if (!s.dice.length || !root.BgCore.legalMoves(s, p).length) {
      /* الخصم استنفد نرده — endturn بثّه مسؤوليته؛ سلامة الشبكة: نكمّل بعد مهلة */
      a.later(function () {
        const st = a.game && a.game.state;
        if (st && st.phase === 'move' && !st.dice.length && !root.BgCore.legalMoves(st, st.turn).length) {
          a.game.endTurn();
          a.refresh();
          flow();
        }
      }, 900);
    }
  }

  /* ══════════ نهاية المباراة في الغرفة ══════════ */
  /* [B-settle] تسوية رهان غرفة الطاولة خادمياً: المضيف فقط يُعلن النتيجة
     (result: 'w0' فاز صاحب order[0] | 'w1' فاز order[1] | 'draw'). */
  function settle(winner) {
    if (typeof root.Rooms === 'undefined' || !root.Rooms || typeof root.Rooms.roomSettle !== 'function') return;
    if (!root.Rooms.state || root.Rooms.state.game_id !== 'bg' || root.Rooms.state.settled) return;
    const u = (typeof root.AUTH !== 'undefined' && root.AUTH && root.AUTH.user) || null;
    if (!u || root.Rooms.state.owner_id !== u.id) return;   /* المضيف فقط */
    const result = (winner === 0) ? 'w0' : (winner === 1 ? 'w1' : 'draw');
    try { root.Rooms.roomSettle(result); } catch (e) {}
  }

  function showEnd() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game) return;
    const s = a.game.state;
    if (s.phase !== 'gameEnd' && s.phase !== 'matchEnd') return;
    rc.ended = (s.phase === 'matchEnd');
    if (s.phase === 'matchEnd') {
      settle(s.winner);            /* المضيف فقط — الخادم يحرسها بـ settled */
      a.finished = true;
      try { a.clearSave(); } catch (e) {}
      /* مباراة جديدة في الغرفة: ضد بوت = إعادة محلية فورية (البوت لا يصوّت)؛
         ضد بشري = تصويت المشاركين عبر الخادم (المضيف يفتحه — نمط ضاما) */
      if (rc.oppBot) {
        a.later(function () {
          if (!a.room || !a.room.on || !a.game) return;
          a.game.newMatch();
          a.room.ended = false;
          a.finished = false;
          a.sel = null; a.undoStack = []; a.busy = false;
          a.showLayer('bwOverLayer', false);
          a.refresh();
          a.later(doOpening, 420);
        }, 1400);
      } else if (typeof root.Rooms !== 'undefined' && root.Rooms && typeof root.Rooms.startRematch === 'function') {
        const u = (typeof root.AUTH !== 'undefined' && root.AUTH && root.AUTH.user) || null;
        if (u && root.Rooms.state && String(root.Rooms.state.owner_id) === String(u.id)) {
          try { root.Rooms.startRematch(); } catch (e) {}
        }
      }
    }
    const em = a.$('bwOverEm'), tt = a.$('bwOverTitle'), ty = a.$('bwOverType'),
      amt = a.$('bwOverAmt'), rows = a.$('bwOverRows'), btn = a.$('bwOverBtn');
    const iWon = !rc.spec && s.winner === rc.mySeat;
    if (em) em.textContent = (rc.spec || iWon) ? '🏆' : '💀';
    if (tt) {
      if (rc.spec) tt.textContent = s.winner === 0 ? (T('bg.p1won') || 'اللاعب 1 يفوز') : (T('bg.p2won') || 'اللاعب 2 يفوز');
      else if (iWon) tt.textContent = T('bg.match.won') || 'فزت بالمباراة!';
      else tt.textContent = T('bg.match.lost') || 'خسرت المباراة';
    }
    if (ty) {
      const typeT = s.gameType === 'gammon' ? T('bg.gammon') : (s.gameType === 'backgammon' ? T('bg.backgammon') : T('bg.single'));
      const ptsW = s.gameType === 'gammon' ? 2 : (s.gameType === 'backgammon' ? 3 : 1);
      ty.textContent = typeT + ' +' + ptsW;
    }
    if (amt) amt.innerHTML = '<span style="opacity:.75">🪙 ' + (T('bg.room.settleNote') || 'الرهان يُسوّى خادمياً') + '</span>';
    if (rows) rows.innerHTML = root.BgRenderer.scoreRowsHTML(a.game.view(), 'local');
    if (btn) btn.textContent = (s.phase === 'matchEnd') ? (T('bg.newMatch') || 'مباراة جديدة') : (T('bg.nextGame') || 'اللعبة التالية');
    a.showLayer('bwOverLayer', true);
    try { root.BgAudio.lose(); } catch (e) {}
  }

  /* زر طبقة النهاية في الغرفة: لعبة تالية = بثّ الفائز · نهاية مباراة = الغرفة */
  function overBtn() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game) return false;
    const s = a.game.state;
    if (s.phase === 'gameEnd') {
      /* الفائز باللعبة هو من يبثّ التالية (مرة واحدة — phase تتحوّل play) */
      if (!rc.spec && s.winner === rc.mySeat) nextGame();
      return true;
    }
    if (s.phase === 'matchEnd') {
      if (typeof root.Rooms !== 'undefined' && root.Rooms && typeof root.Rooms.openModal === 'function') {
        try { root.Rooms.openModal(); } catch (e) {}
      }
      return true;
    }
    return false;
  }

  /* انسحاب في الغرفة: بثّ + خسارة محلية فورية — المضيف يسوّي خادمياً */
  function resign() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || rc.spec || !a.game) return false;
    const s = a.game.state;
    if (s.phase === 'gameEnd' || s.phase === 'matchEnd') return true;
    if (!rc.oppBot) emit('resign', {});
    const w = 1 - rc.mySeat;
    s.matchScore[w] = s.matchTarget;
    s.winner = w;
    s.gameType = 'single';
    s.phase = 'matchEnd';
    rc.ended = true;
    a.finished = true;
    try { a.clearSave(); } catch (e) {}
    a.refresh();
    settle(w);
    showEnd();
    return true;
  }

  /* ══════════ إعادة البناء من سجل الخادم (room:replay — عائد/متفرج متأخر) ══════════ */
  function applyReplay(d) {
    try {
      const a = app();
      if (!d || !d.history || !d.history.length) return;
      let rc = room();
      if (!rc || !rc.on) {
        /* فتحنا اللعبة متأخرين: أدخل وضع الغرفة أولاً ثم طبّق السجل */
        if (!root.Rooms || !root.Rooms.state || root.Rooms.state.game_id !== 'bg' || root.Rooms.state.status !== 'playing') return;
        start(root.Rooms.state);
        rc = room();
        if (!rc || !rc.on) return;
      }
      for (let i = 0; i < d.history.length; i++) {
        const h = d.history[i];
        if (!h || !h.action || h.action === 'init') continue;   /* init داخل start() */
        const hd = h.data || {};
        if (h.action === 'roll') applyRoll(hd);
        else if (h.action === 'move') applyMove(hd);
        else if (h.action === 'endturn') {
          const s = a.game && a.game.state;
          if (s && (s.phase === 'move' || (s.phase === 'roll' && s.rolled))) a.game.endTurn();
        } else if (h.action === 'nextgame') {
          const s = a.game && a.game.state;
          if (s && s.phase === 'gameEnd') {
            a.game.nextGame();
            a.sel = null; a.undoStack = [];
          }
        } else if (h.action === 'resign') {
          const s = a.game && a.game.state;
          if (s && s.phase !== 'gameEnd' && s.phase !== 'matchEnd') {
            const idx = seatOf(h.by);
            if (idx >= 0) {
              const w = 1 - idx;
              s.matchScore[w] = s.matchTarget;
              s.winner = w;
              s.gameType = 'single';
              s.phase = 'matchEnd';
              rc.ended = true;
            }
          }
        }
      }
      if (!a.game) return;
      a.sel = null; a.undoStack = [];
      a.refresh();
      const s = a.game.state;
      if (s.phase === 'gameEnd' || s.phase === 'matchEnd') { showEnd(); return; }
      flow();
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[BG MP] replay', e && e.message, e);
    }
  }

  /* ══════════ التسجيل عند فتح اللعبة (نمط damaRegisterRooms) ══════════ */
  function register() {
    if (typeof root.Rooms === 'undefined' || !root.Rooms || typeof root.Rooms.setGameHandler !== 'function') return;
    root.Rooms.setGameHandler(onMove);
    root.Rooms.setStartHandler(start);
    if (typeof root.Rooms.setUpdateHandler === 'function') {
      root.Rooms.setUpdateHandler(function () {
        /* تحديث اسم الخصم عند تغيّر اللاعبين — بلا إعادة بناء */
        const a = app();
        if (a && a.room && a.room.on && !a.room.spec) {
          const el = a.$('bwTopName');
          if (el) el.textContent = oppName();
        }
      });
    }
    root.applyRoomReplay = applyReplay;
    /* [Resilience] استئناف مباراة جارية عند فتح اللعبة (عائد بعد انقطاع/مشاهد متأخر):
       ندخل وضع الغرفة أولاً ثم نطبّق سجل الإعادة المعلّق بالترتيب الصحيح. */
    if (root.Rooms.state && root.Rooms.state.game_id === 'bg' && root.Rooms.state.status === 'playing') {
      const rp = (typeof root.Rooms.hasPendingReplay === 'function' && root.Rooms.hasPendingReplay()) ? root.Rooms.consumePendingReplay() : null;
      start(root.Rooms.state);
      if (rp && rp.history && rp.history.length) applyReplay(rp);
      /* [Persist] عائد من لعبة أخرى/تجديد: لا replay معلق — اطلبه من الخادم */
      else if (typeof root.Rooms.requestReplay === 'function') root.Rooms.requestReplay();
    }
  }

  /* ── التصدير (window) ── */
  root.bgRegisterRooms = register;
  root.bgRoomStart = start;
  root.bgRoomMove = onMove;
  root.bgApplyReplay = applyReplay;
  root.BG_ROOM = {
    register: register,
    start: start,
    move: onMove,
    replay: applyReplay,
    myTurn: myTurn,
    emitMove: emitMove,
    endTurn: endTurn,
    roll: roll,
    doOpening: doOpening,
    resign: resign,
    overBtn: overBtn,
    showEnd: showEnd,
    flow: flow
  };
})(typeof self !== 'undefined' ? self : this);
