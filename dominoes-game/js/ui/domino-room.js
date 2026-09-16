/**
 * ============================================================================
 *  DOMINO ROOM — وضع الغرفة للضومنة (أونلاين بمزامنة خادمية) — نمط dama.js
 * ============================================================================
 *  • doRegisterRooms(): تسجيل معالجات Rooms (setGameHandler/setStartHandler)
 *    + window.applyRoomReplay + استئناف الجولة الجارية عند إعادة الفتح.
 *  • doRoomStart(room): دخول وضع الغرفة من room.order (مقعد 0 = المضيف).
 *    السائق (مقعد 0) يبثّ «init» بالبذرة والهدف → نفس التوزيعة عند الجميع
 *    (محرك الضومنة حتمي من البذرة — نمط روندا-game).
 *  • البروتوكول عبر rmove (نمط ضاما): init {seed, target, draw} | play {tile, end}
 *    | draw {} | pass {} | nextround | resign — يُخزَّن في moveHistory.
 *  • الترميم مطلق كما في المحرك: لاعب المحرك 0 = مقعد الغرفة 0 (الأسفل).
 *  • الرهان خادمي بالكامل (اقتطاع عند البدء + settleRound للمضيف) — لا محفظة
 *    محلية ولا تذاكر في وضع الغرفة؛ الأرصدة عبر Rooms._onSettle العام.
 * ============================================================================
 */
(function (root) {
  'use strict';

  const T = root.DMN_T;

  function app() { return root.DominoApp; }
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
    /* [dedup] مفتاح بمعرّف المُرسِل — كلا الطرفين يبدأ seq من 0 فمفتاح 'do-N' وحده
       كان يجعل بثّ الخصم الأول يُبتلع كتكرار لرسالة سابقة بالمفتاح نفسه */
    const payload = { action: action, data: data || {}, by: meId(), seq: _seq, ts: Date.now(), dedup: 'do-' + meId() + '-' + _seq };
    try { root.Rooms.sendMove('rmove', payload, { game_id: 'do', status: 'playing' }); }
    catch (e) { if (typeof console !== 'undefined') console.error('[DO MP] emit', e && e.message, e); }
  }

  /* ══════════ بدء المباراة (status=playing — من startHandler) ══════════ */
  function start(rm) {
    if (!rm || rm.game_id !== 'do' || rm.status !== 'playing') return;
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
    /* [RS-GameOpts] الهدف وقاعدة السحب من إعدادات الغرفة (اختيار المالك) */
    const cfg = (typeof root.DO_ROOM_CFG === 'object' && root.DO_ROOM_CFG) || {};
    const target = Math.max(50, Math.min(200, parseInt(cfg.target, 10) || 100));
    const drawRule = (cfg.draw === 0 || cfg.draw === '0' || cfg.draw === false) ? false : true;
    a.room = { on: true, order: order, mySeat: mySeat, spec: !!spec, oppBot: !!oppBot, target: target, draw: drawRule, seed: null, ended: false };
    a.config.mode = 'room';
    a.betPlaced = 0;            /* لا محفظة في الغرفة — الاقتطاع تم في /api/rooms/start */
    a.finished = false;
    a.clearTimers();
    /* السائق (مقعد 0) يبثّ التهيئة: بذرة موحّدة → نفس التوزيعة عند الجميع */
    if (!spec && mySeat === 0) {
      const seed = ((Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0) || 1;
      a.room.seed = seed;
      emit('init', { seed: seed, target: target, draw: drawRule });
    }
    enterPlay(a);
  }

  /* دخول شاشة اللعب بوضع الغرفة (بلا بناء حتى وصول init — عدا السائق) */
  function enterPlay(a) {
    const rc = a.room;
    a.showScreen('play');
    a.selTile = null; a.selOwner = 0;
    a.busy = false;
    a.showLayer('dmRoundLayer', false);
    a.showLayer('dmMatchLayer', false);
    a.showLayer('dmResignLayer', false);
    a.$('dmOppName').textContent = rc.spec ? spectLabel() : oppName();
    a.$('dmMyName').textContent = rc.spec ? spectLabel() : (T('dm.you') || 'أنت');
    const av = a.$('dmOppAvatar');
    if (av) av.innerHTML = '<i class="fa-solid ' + (rc.oppBot ? 'fa-robot' : 'fa-user') + '" aria-hidden="true"></i>';
    if (rc.seed != null) {
      buildFromInit(a, { seed: rc.seed, target: rc.target, draw: rc.draw });
      return;
    }
    /* في انتظار init السائق: مؤقت سلامة إن تأخر البث (أعد الطلب) */
    a.later(function () {
      const rc2 = room();
      if (rc2 && rc2.on && rc2.seed == null && typeof root.Rooms !== 'undefined' && root.Rooms && typeof root.Rooms.requestReplay === 'function') {
        try { root.Rooms.requestReplay(); } catch (e) {}
      }
    }, 2500);
  }

  /* بناء المباراة من إشارة init (بذرة + هدف + قاعدة سحب) — متطابق عند الجميع */
  function buildFromInit(a, d) {
    const rc = a.room;
    rc.seed = (Number(d.seed) >>> 0) || 1;
    rc.target = Math.max(50, Math.min(200, parseInt(d.target, 10) || rc.target || 100));
    rc.draw = (d.draw === 0 || d.draw === '0' || d.draw === false) ? false : true;
    a.config.mode = 'room';
    a.finished = false;
    a.clearTimers();
    const cfg = root.DominoCore.normalizeConfig({
      target: rc.target,
      drawUntilPlayable: rc.draw
    });
    const self = a;
    a.game = new root.DominoGameNS.DominoGame({
      config: cfg,
      seed: rc.seed,
      onEvent: function (ev) { self.onGameEvent(ev); }
    });
    if (rc.oppBot && !a.ai) a.ai = new root.DominoGameNS.DominoAI(a.game, 2);   /* [v18] بوت الغرفة خبير دائماً */
    a.game.newMatch();
    a.selTile = null; a.selOwner = 0;
    a.busy = false;
    a.showScreen('play');
    a.showLayer('dmRoundLayer', false);
    a.showLayer('dmMatchLayer', false);
    a.showLayer('dmResignLayer', false);
    a.$('dmOppName').textContent = rc.spec ? spectLabel() : oppName();
    a.$('dmMyName').textContent = rc.spec ? spectLabel() : (T('dm.you') || 'أنت');
    const av = a.$('dmOppAvatar');
    if (av) av.innerHTML = '<i class="fa-solid ' + (rc.oppBot ? 'fa-robot' : 'fa-user') + '" aria-hidden="true"></i>';
    try { root.DominoAudio.shuffle(); } catch (e) {}
    a.refresh();
    flow();
  }

  function oppName() {
    if (!root.Rooms || !root.Rooms.state) return T('dm.opp') || 'الخصم';
    const my = meId();
    const players = root.Rooms.state.players || [];
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.spectate || String(p.id) === String(my)) continue;
      return p.username || (T('dm.opp') || 'الخصم');
    }
    return T('dm.opp') || 'الخصم';
  }
  function spectLabel() { return '👁️ ' + (T('dm.room.watch') || 'تشاهد المباراة'); }

  /* ══════════ سير اللعب في الغرفة (بديل kickAI) ══════════ */
  function flow() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game || !a.game.state) return;
    const s = a.game.state;
    if (s.phase === 'matchEnd') { showMatchEnd(); return; }
    if (s.phase === 'roundEnd') { showRoundEnd(); return; }
    if (s.phase !== 'play') return;
    if (rc.oppBot && s.turn === 1) botTurn();
    /* دور بشري: الواجهة تنتظر نقرات صاحبها */
  }

  /* هل الدور الحالي لي؟ (المحرك مطلق: لاعب المحرك == مقعدي الغرفي) */
  function myTurn() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game || rc.spec) return false;
    const s = a.game.state;
    return s.phase === 'play' && s.turn === rc.mySeat;
  }

  /* ── بثّ وضع قطعة (من playerPlay) ── */
  function emitPlay(owner, tile, end) {
    emit('play', { owner: owner, tile: tile.id, end: end });
  }

  /* ── سحب من البنك (بثّ فقط — الطرفان يسحبان محلياً نفس القطعة) ── */
  function emitDraw() {
    emit('draw', {});
  }

  /* ── تمرير الدور ── */
  function emitPass() {
    emit('pass', {});
  }

  /* ── دور البوت (المضيف البشري يشغّل مقعد الآلي ويبثّ أفعاله) ── */
  function botTurn() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !rc.oppBot || !a.game || a.finished) return;
    const s = a.game.state;
    if (s.phase !== 'play' || s.turn !== 1 || a.busy) return;
    a.busy = true;
    a.refresh();
    a.later(function () {
      try {
        const st = a.game.state;
        if (!st || st.phase !== 'play' || st.turn !== 1) { a.busy = false; a.refresh(); return; }
        a.busy = false;
        const mv = a.ai ? a.ai.choose(1) : null;
        if (mv) {
          const r = a.game.play(1, mv.tile.id, mv.end);
          if (r.ok) {
            emit('play', { owner: 1, tile: mv.tile.id, end: mv.end });
            a.refresh();
            if (st.phase !== 'play') { a.later(showRoundOrMatch, 520); return; }
            flow();
            return;
          }
        }
        if (st.boneyard.length && st.cfg.drawUntilPlayable) {
          a.game.draw(1);
          emit('draw', {});
          a.refresh();
          a.later(botTurn, 520);
          return;
        }
        const r2 = a.game.pass(1);
        if (r2.ok) {
          emit('pass', {});
          a.refresh();
          if (st.phase !== 'play') { a.later(showRoundOrMatch, 520); return; }
          flow();
        }
      } catch (e) { if (typeof console !== 'undefined') console.error('[DO MP] bot', e); }
    }, 620);
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
        /* تهيئة السائق: بذرة موحّدة → نفس التوزيعة (متفرج/عائد/ضيف متأخر) */
        rc.ended = false;
        buildFromInit(a, data);
        return;
      }
      if (!a.game || !a.game.state) return;
      const s = a.game.state;
      if (action === 'play') {
        if (s.phase !== 'play') return;
        const owner = (typeof data.owner === 'number') ? data.owner : 1 - rc.mySeat;
        if (!rc.spec && s.turn === rc.mySeat) return;   /* مكرّر/قديم — ليس دور الخصم */
        if (s.turn !== owner) return;
        const r = a.game.play(owner, data.tile, data.end);
        if (!r.ok) return;
        a.selTile = null;
        a.refresh();
        if (s.phase !== 'play') a.later(showRoundOrMatch, 480);
        return;
      }
      if (action === 'draw') {
        /* السحب حتمي من البذرة: نفس القطعة تُسحب عند الطرفين (boneyard متطابق) */
        if (s.phase !== 'play') return;
        const owner = (typeof data.owner === 'number') ? data.owner : s.turn;
        if (!rc.spec && s.turn === rc.mySeat) return;
        a.game.draw(owner);
        a.refresh();
        if (owner !== rc.mySeat) a._toast(T('dm.drew'));
        return;
      }
      if (action === 'pass') {
        if (s.phase !== 'play') return;
        const owner = (typeof data.owner === 'number') ? data.owner : s.turn;
        if (!rc.spec && s.turn === rc.mySeat) return;
        a.game.pass(owner);
        a.refresh();
        if (owner !== rc.mySeat) a._toast(T('dm.passed'));
        if (s.phase !== 'play') a.later(showRoundOrMatch, 480);
        return;
      }
      if (action === 'nextround') {
        if (s.phase !== 'roundEnd') return;
        a.game.nextRound();
        a.busy = false; a.selTile = null;
        a.showLayer('dmRoundLayer', false);
        a.refresh();
        flow();
        return;
      }
      if (action === 'resign') {
        if (s.phase === 'matchEnd') return;
        /* خصمي انسحب → فاز الطرف الآخر (ترقيم مطلق: مقعد الراسل في order) */
        const idx = seatOf(by);
        if (idx < 0) return;
        const w = 1 - idx;
        s.scores[w] = s.cfg.target;
        s.matchWinner = w;
        s.phase = 'matchEnd';
        rc.ended = true;
        a.refresh();
        showMatchEnd();
        return;
      }
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[DO MP] onMove', e && e.message, e);
    }
  }

  /* مقعد غرفي من معرّف لاعب (سجل order) */
  function seatOf(uid) {
    const rc = room();
    if (!rc || !rc.order) return -1;
    for (let i = 0; i < rc.order.length; i++) if (String(rc.order[i]) === String(uid)) return i;
    return -1;
  }

  /* ══════════ نهاية الجولة/المباراة في الغرفة ══════════ */
  function showRoundOrMatch() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game) return;
    const s = a.game.state;
    if (s.phase === 'matchEnd') { showMatchEnd(); return; }
    if (s.phase === 'roundEnd') { showRoundEnd(); return; }
    flow();
  }

  function showRoundEnd() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game || !a.game.state) return;
    const s = a.game.state;
    if (s.phase !== 'roundEnd' || !s.result) return;
    a.$('dmOppScore').textContent = String(s.scores[1]);
    a.$('dmMyScore').textContent = String(s.scores[0]);
    const r = s.result;
    a.$('dmRoundEm').textContent = r.reason === 'blocked' ? '🚧' : '🁫';
    const winnerTxt = r.tie ? T('dm.tie') : (r.winner === 0 ? (T('dm.p1') || 'اللاعب 1') : (T('dm.p2') || 'اللاعب 2'));
    a.$('dmRoundTitle').textContent = winnerTxt + ' — ' + T(r.reason === 'blocked' ? 'dm.end.blocked' : 'dm.end.empty');
    a.$('dmRoundRows').innerHTML = root.DominoRenderer.scoreRowsHTML(a.game.view(), 'local');
    a.showLayer('dmRoundLayer', true);
    try { root.DominoAudio.notify(); } catch (e) {}
    /* الجولة التالية في الغرفة: أول من يضغط الزر يبثّ nextround — البقية تتبعه */
  }

  function showMatchEnd() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game || !a.game.state) return;
    const s = a.game.state;
    if (s.phase !== 'matchEnd') return;
    rc.ended = true;
    a.finished = true;
    try { a.clearSave(); } catch (e) {}
    /* [B-settle] تسوية رهان غرفة الضومنة خادمياً: المضيف فقط يُعلن النتيجة
       (result: 'w0' فاز صاحب order[0] | 'w1' فاز order[1] | 'draw'). */
    settle(s.matchWinner);
    const iWon = !rc.spec && s.matchWinner === rc.mySeat;
    /* [BotsLedger v2.28] مؤشر المنصة لغرف البوت: +الرهان خسارة، −الرهان فوزاً */
    if (rc.oppBot && !rc.spec) {
      try {
        const _b = (root.Rooms && root.Rooms.state && root.Rooms.state.bet) || 0;
        if (_b > 0 && root.BotsLedger) root.BotsLedger.record('do', iWon ? -_b : _b);
      } catch (e) {}
    }
    a.$('dmMatchEm').textContent = (rc.spec || iWon) ? '🏆' : '💀';
    a.$('dmMatchTitle').textContent = rc.spec
      ? (s.matchWinner === 0 ? (T('dm.p1won') || 'اللاعب 1 يفوز') : (T('dm.p2won') || 'اللاعب 2 يفوز'))
      : (iWon ? (T('dm.won') || 'فزت بالمباراة!') : (T('dm.lost') || 'خسرت المباراة'));
    a.$('dmMatchAmt').innerHTML = '<span style="opacity:.75">🪙 ' + (T('dm.room.settleNote') || 'الرهان يُسوّى خادمياً') + '</span>';
    a.$('dmMatchRows').innerHTML =
      '<div class="dm-srow"><span>' + (T('dm.p1') || 'اللاعب 1') + '</span><b>' + s.scores[0] + '</b></div>' +
      '<div class="dm-srow"><span>' + (T('dm.p2') || 'اللاعب 2') + '</span><b>' + s.scores[1] + '</b></div>';
    a.showLayer('dmMatchLayer', true);
    try { if (iWon || rc.spec) root.DominoAudio.winMatch(); else root.DominoAudio.lose(); } catch (e) {}
    /* مباراة جديدة في الغرفة: ضد بوت = إعادة محلية فورية؛ ضد بشري = تصويت
       المشاركين عبر الخادم (المضيف يفتحه — نمط ضاما) */
    if (rc.oppBot) {
      a.later(function () {
        if (!a.room || !a.room.on || !a.game) return;
        a.game.newMatch();
        /* [fix] بذرة عشوائية جديدة للمباراة الجديدة ضد البوت — القيمة السابقة
           كانت تتحول دائماً إلى 1 (نفس التوزيعة في كل مباراة متتالية) */
        a.room.seed = ((Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0) || 1;
        a.room.ended = false;
        a.finished = false;
        a.selTile = null; a.busy = false;
        a.showLayer('dmMatchLayer', false);
        a.showLayer('dmRoundLayer', false);
        try { root.DominoAudio.shuffle(); } catch (e) {}
        a.refresh();
        flow();
      }, 1400);
    } else if (typeof root.Rooms !== 'undefined' && root.Rooms && typeof root.Rooms.startRematch === 'function') {
      const u = (typeof root.AUTH !== 'undefined' && root.AUTH && root.AUTH.user) || null;
      if (u && root.Rooms.state && String(root.Rooms.state.owner_id) === String(u.id)) {
        try { root.Rooms.startRematch(); } catch (e) {}
      }
    }
  }

  function settle(winner) {
    if (typeof root.Rooms === 'undefined' || !root.Rooms || typeof root.Rooms.roomSettle !== 'function') return;
    if (!root.Rooms.state || root.Rooms.state.game_id !== 'do' || root.Rooms.state.settled) return;
    const u = (typeof root.AUTH !== 'undefined' && root.AUTH && root.AUTH.user) || null;
    if (!u || root.Rooms.state.owner_id !== u.id) return;   /* المضيف فقط */
    const result = (winner === 0) ? 'w0' : (winner === 1 ? 'w1' : 'draw');
    try { root.Rooms.roomSettle(result); } catch (e) {}
  }

  /* زر «الجولة التالية» في الغرفة: بثّ nextround مرة واحدة (phase يحرسها) */
  function nextRoundBtn() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || !a.game || !a.game.state) return false;
    const s = a.game.state;
    if (s.phase !== 'roundEnd') return true;
    if (rc.spec) { a.showLayer('dmRoundLayer', false); return true; }
    a.showLayer('dmRoundLayer', false);
    a.game.nextRound();
    a.busy = false; a.selTile = null;
    a.refresh();
    emit('nextround', {});
    flow();
    return true;
  }

  /* زر «مباراة جديدة» في الغرفة = مودال الغرفة (التصويت/الخروج هناك) */
  function newMatchBtn() {
    if (typeof root.Rooms !== 'undefined' && root.Rooms && typeof root.Rooms.openModal === 'function') {
      try { root.Rooms.openModal(); } catch (e) {}
    }
    return true;
  }

  /* انسحاب في الغرفة: بثّ + خسارة محلية فورية — المضيف يسوّي خادمياً */
  function resign() {
    const a = app(), rc = room();
    if (!a || !rc || !rc.on || rc.spec || !a.game || !a.game.state) return false;
    const s = a.game.state;
    if (s.phase === 'matchEnd') return true;
    if (!rc.oppBot) emit('resign', {});
    const w = 1 - rc.mySeat;
    s.scores[w] = s.cfg.target;
    s.matchWinner = w;
    s.phase = 'matchEnd';
    rc.ended = true;
    a.finished = true;
    try { a.clearSave(); } catch (e) {}
    a.refresh();
    settle(w);
    showMatchEnd();
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
        if (!root.Rooms || !root.Rooms.state || root.Rooms.state.game_id !== 'do' || root.Rooms.state.status !== 'playing') return;
        start(root.Rooms.state);
        rc = room();
        if (!rc || !rc.on) return;
      }
      for (let i = 0; i < d.history.length; i++) {
        const h = d.history[i];
        if (!h || !h.action) continue;
        const hd = h.data || {};
        if (h.action === 'init') { buildFromInit(a, hd); continue; }
        if (!a.game || !a.game.state) continue;
        const s = a.game.state;
        if (h.action === 'play') {
          if (s.phase === 'play' && (typeof hd.owner !== 'number' || s.turn === hd.owner)) {
            a.game.play((typeof hd.owner === 'number') ? hd.owner : s.turn, hd.tile, hd.end);
          }
        } else if (h.action === 'draw') {
          if (s.phase === 'play') a.game.draw((typeof hd.owner === 'number') ? hd.owner : s.turn);
        } else if (h.action === 'pass') {
          if (s.phase === 'play') a.game.pass((typeof hd.owner === 'number') ? hd.owner : s.turn);
        } else if (h.action === 'nextround') {
          if (s.phase === 'roundEnd') a.game.nextRound();
        } else if (h.action === 'resign') {
          if (s.phase !== 'matchEnd') {
            const idx = seatOf(h.by);
            if (idx >= 0) {
              const w = 1 - idx;
              s.scores[w] = s.cfg.target;
              s.matchWinner = w;
              s.phase = 'matchEnd';
              rc.ended = true;
            }
          }
        }
      }
      if (!a.game || !a.game.state) return;
      a.selTile = null; a.busy = false;
      a.refresh();
      const s = a.game.state;
      if (s.phase === 'matchEnd') { showMatchEnd(); return; }
      if (s.phase === 'roundEnd') { showRoundEnd(); return; }
      flow();
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[DO MP] replay', e && e.message, e);
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
          const el = a.$('dmOppName');
          if (el) el.textContent = oppName();
        }
      });
    }
    root.applyRoomReplay = applyReplay;
    /* [Resilience] استئناف مباراة جارية عند فتح اللعبة (عائد بعد انقطاع/مشاهد متأخر):
       ندخل وضع الغرفة أولاً ثم نطبّق سجل الإعادة المعلّق بالترتيب الصحيح. */
    if (root.Rooms.state && root.Rooms.state.game_id === 'do' && root.Rooms.state.status === 'playing') {
      const rp = (typeof root.Rooms.hasPendingReplay === 'function' && root.Rooms.hasPendingReplay()) ? root.Rooms.consumePendingReplay() : null;
      start(root.Rooms.state);
      if (rp && rp.history && rp.history.length) applyReplay(rp);
      /* [Persist] عائد من لعبة أخرى/تجديد: لا replay معلق — اطلبه من الخادم */
      else if (typeof root.Rooms.requestReplay === 'function') root.Rooms.requestReplay();
    }
  }

  /* ── التصدير (window) ── */
  root.doRegisterRooms = register;
  root.doRoomStart = start;
  root.doRoomMove = onMove;
  root.doApplyReplay = applyReplay;
  root.DOMINO_ROOM = {
    register: register,
    start: start,
    move: onMove,
    replay: applyReplay,
    myTurn: myTurn,
    emitPlay: emitPlay,
    emitDraw: emitDraw,
    emitPass: emitPass,
    resign: resign,
    nextRoundBtn: nextRoundBtn,
    newMatchBtn: newMatchBtn,
    showMatchEnd: showMatchEnd,
    flow: flow
  };
})(typeof self !== 'undefined' ? self : this);
