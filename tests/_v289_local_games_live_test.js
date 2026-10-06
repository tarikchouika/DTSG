/* ═══════════════════════════════════════════════════════════════════════════
   [v2.89] المختبر الحي لألعاب الغرف المحلية — عبر جسر DTSGNative مزيف
   ───────────────────────────────────────────────────────────────────────────
   بلاغ المالك 2026-10-06 (بعد تثبيت v2.88.0-build27):
     «بعض الألعاب في الغرف المحلية بها مشاكل — الرامي والبلوت والأونو
      وحجر-ورقة-مقص تحصل مشكلة مزامنة، وروندا الكلاسيكية تلعب تلقائياً
      بلا تحكم اللاعبين البشريين»

   هذا المختبر يعيد إنتاج بيئة تطبيق الأندرويد حرفياً في متصفحين حقيقيين:
     • جسر DTSGNative مزيف يطابق عقد جافا LocalNet حرفياً
       (lnVersion/hostRoom/joinRoom/sendMsg/leaveRoom + الأحداث
        __dtsgLnEvt: peerOpen/data/peerClose/joined/hostReady) — نفس
       المحاكاة التي شُخِّص بها البلياردو في v2.88 لكن الآن لكل الألعاب.
     • مضيف مسجَّل (خادم QA) + ضيف بهوية محلية بلا إنترنت (برومبت مُحاكى)
       — كما في الواقع تماماً.
   التغطية لكل لعبة (13 لعبة):
     أ) عقد النقل: الاقتران + welcome + order متطابق + البدء playing
     ب) التهيئة: init يصل للضيف واللعبة تُبنى عند الطرفين بنفس البذرة
     ج) حركة حقيقية: فعل لاعب يصل للطرف الآخر ويُطبَّق
     د) لا سرقة أدوار: سائق الغرفة لا يلعب آلياً مكان البشري المتصل
        (جذر روندا الكلاسيكية الموثَّق: online كائنٌ لا مصفوفة)
     هـ) حجر-ورقة-مقص وبينالتي: blindResult يُصنَّع في الغرفة المحلية
        (جذر التجمّد الموثَّق: لا مجمِّع أعمى محلياً)
   تشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_v289_local_games_live_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
const SB = require('./_safe_base.js');
const BASE = SB.BASE, BASE_SLASH = SB.BASE_SLASH;
let pass = 0, fail = 0;
function ok(cond, label, detail) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail !== undefined ? ' — ' + detail : '')); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(cookie, method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { status: r.status, json, cookie: r.headers.get('set-cookie') ? r.headers.get('set-cookie').split(';')[0] : cookie };
}
async function ensureUser(name, pw) {
  let l = await api(null, 'POST', '/api/login', { username: name, password: pw });
  if (l.status !== 200) {
    await api(null, 'POST', '/api/register', { username: name, password: pw });
    l = await api(null, 'POST', '/api/login', { username: name, password: pw });
  }
  return { name, id: l.json && l.json.user && l.json.user.id, cookie: l.cookie };
}
async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) { lastErr = e; }
    await page.waitForTimeout(150);
  }
  throw new Error('wait timeout: ' + (lastErr ? lastErr.message : ''));
}

/* ── الجسر الأصلي المزيف — يُركَّب قبل كل سكربت (addInitScript) ── */
function fakeNativeBridge(TAG) {
  if (window.__dtsgNativeFakeInstalled) return;
  window.__dtsgNativeFakeInstalled = true;
  var lnEv = function (o) { try { window.__dtsgLnEvt && window.__dtsgLnEvt(o); } catch (e) {} };
  var arbEv = function (o) { try { window.__dtsgArbEvt && window.__dtsgArbEvt(o); } catch (e) {} };
  window.__fakeLnEv = lnEv;
  window.__fakeArbEv = arbEv;
  window.__arbStarts = [];
  window.DTSGNative = {
    lnVersion: function () { return '2'; },
    hostRoom: function (json) {
      var j = {}; try { j = JSON.parse(json || '{}'); } catch (e) {}
      try { window.__hubHost(TAG, String(j.code || '')); } catch (e) {}
      setTimeout(function () { lnEv({ t: 'hostReady' }); }, 20);
    },
    hostUpdate: function () {},
    discoverStart: function () {},
    discoverStop: function () {},
    joinRoom: function (json) {
      var j = {}; try { j = JSON.parse(json || '{}'); } catch (e) {}
      try { window.__hubJoin(TAG, String(j.code || '')); } catch (e) {}
    },
    sendMsg: function (id, s) {
      try { window.__hubSend(TAG, Number(id) || 0, String(s || '')); } catch (e) {}
    },
    leaveRoom: function () { try { window.__hubLeave(TAG); } catch (e) {} },
    btPerms: function () { return 'granted'; },
    btOn: function () { return true; },
    btEnable: function () {},
    requestBtPerms: function () {},
    getInsets: function () { return '0|0'; },
    setBarsLight: function () {},
    arbShareVersion: function () { return '1'; },
    arbShareStart: function (json) {
      window.__arbStarts.push(String(json || ''));
      try { window.__hubArbStart(TAG, String(json || '')); } catch (e) {}
    },
    arbShareStop: function () { lnEv({}); arbEv({ t: 'state', state: 'stopped' }); }
  };
}

(async () => {
  const A = await ensureUser('v289_lab_host', 'Pw123456!');

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns'] });

  /* محور التوجيه في Node — يُعرَّض للسياقات قبل إنشاء أي صفحة (شرط exposeFunction) */
  let hostCode = null;
  let Hside = null, Gside = null;
  const evTo = async (side, o) => { await side.page.evaluate(arg => { try { window.__dtsgLnEvt(arg.o); } catch (e) {} }, { o }); };
  const mkSide = async (tag, login) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 820 } });
    await ctx.addInitScript(fakeNativeBridge, tag);
    /* المحور نفسه على السياقين — الوسم يميّز المتصل (كلا الطرفين يستدعي كل العمليات) */
    await ctx.exposeFunction('__hubHost', async (t, code) => { if (t === 'H') hostCode = code; });
    await ctx.exposeFunction('__hubJoin', async (t, code) => {
      if (t !== 'G' || !hostCode || code !== hostCode) return;
      await evTo(Hside, { t: 'peerOpen', id: 1, kind: 'wifi' });
      await evTo(Gside, { t: 'joined', kind: 'wifi' });
    });
    await ctx.exposeFunction('__hubSend', async (t, id, s) => {
      if (t === 'H') await evTo(Gside, { t: 'data', id: 0, s });
      else if (t === 'G' && id === 0) await evTo(Hside, { t: 'data', id: 1, s });
    });
    await ctx.exposeFunction('__hubLeave', async (t) => {
      if (t === 'H') await evTo(Gside, { t: 'data', id: 0, s: JSON.stringify({ t: 'bye' }) });
      else if (t === 'G') await evTo(Hside, { t: 'peerClose', id: 1 });
    });
    await ctx.exposeFunction('__hubArbStart', async (t, json) => {
      const side = t === 'H' ? Hside : Gside;
      await side.page.evaluate(() => { try { window.__dtsgArbEvt({ t: 'state', state: 'connecting' }); } catch (e) {} });
      setTimeout(() => { side.page.evaluate(() => { try { window.__dtsgArbEvt({ t: 'state', state: 'live' }); } catch (e) {} }); }).catch(() => {});
    });
    const page = await ctx.newPage();
    page._errs = [];
    page.on('pageerror', e => page._errs.push('[pageerror] ' + e.message));
    page.on('console', m => {
      if (m.type() === 'error' && !/^Failed to load resource/i.test(m.text())) page._errs.push('[console] ' + m.text());
    });
    page.on('dialog', d => { d.accept(tag === 'G' ? 'Guest289' : ''); });
    if (login) await ctx.request.post(BASE_SLASH + 'api/login', { data: { username: A.name, password: 'Pw123456!' } });
    await page.goto(BASE_SLASH, { waitUntil: 'domcontentloaded' });
    await wait(page, () => !!(window.Rooms && window.LocalMP && window.DTSGNative && DTSGNative.lnVersion() === '2' && typeof window.__hubSend === 'function'));
    return { tag, ctx, page };
  };
  const H = await mkSide('H', true);
  const G = await mkSide('G', false);
  Hside = H; Gside = G;
  ok(await H.page.evaluate(() => !!(window.AUTH && window.AUTH.user)), 'المضيف مسجَّل بخادم QA');
  ok(await G.page.evaluate(() => !window.AUTH || !window.AUTH.user), 'الضيف بلا جلسة (هوية محلية بلا إنترنت)');


  /* ── مفتاح الغرفة عند الضيف قبل joinByCode (كما يكتشفه NSD) ── */
  async function pairGame(gid) {
    await H.page.evaluate((g) => LocalMP.hostRoom(g, {}), gid);
    const code = await wait(H.page, () => (window.LocalMP.state().room && window.LocalMP.state().room.code) || null, 8000);
    hostCode = code;
    await G.page.evaluate((c) => {
      LocalMP.state().lnRooms[c] = { code: c, ip: '127.0.0.1', port: 1, game: '', name: 'H', players: 1, transport: 'wifi' };
      LocalMP.joinByCode(c);
    }, code);
    await wait(H.page, () => (window.LocalMP.state().peers || []).some(p => p.userId != null) ? 1 : null, 8000);
    await wait(G.page, () => window.Rooms.state && window.Rooms.state.players && window.Rooms.state.players.length === 2 ? 1 : null, 8000);
    await wait(H.page, () => window.Rooms.state && window.Rooms.state.players && window.Rooms.state.players.length === 2 ? 1 : null, 8000);
    return code;
  }
  async function bothReadyAndStart() {
    await H.page.evaluate(() => LocalMP.setReady(true));
    await G.page.evaluate(() => LocalMP.setReady(true));
    await sleep(250);
    await H.page.evaluate(() => LocalMP.startGame());
    await wait(H.page, () => window.Rooms.state && window.Rooms.state.status === 'playing' ? 1 : null, 8000);
    await wait(G.page, () => window.Rooms.state && window.Rooms.state.status === 'playing' ? 1 : null, 8000);
  }
  async function teardownPair() {
    try { await G.page.evaluate(() => { try { LocalMP.leaveRoom(); } catch (e) {} }); } catch (e) {}
    try { await H.page.evaluate(() => { try { LocalMP.leaveRoom(); } catch (e) {} }); } catch (e) {}
    await sleep(300);
  }
  const hist = (side) => side.page.evaluate(() => (window.LocalMP.state().history || []).map(h => (h.data && h.data.action) || h.action));

  /* ═══ اختبار عام لكل لعبة: النقل + التهيئة ═══ */
  const gameProbes = {
    rm: {
      label: 'الرامي (rm)',
      built: 'return !!(window.RAMI_STATE && window.RAMI_STATE.gamePhase)',
      stateKey: 'return window.RAMI_STATE ? (window.RAMI_STATE.roundNumber || 0) + ":" + (window.RAMI_STATE.gamePhase || "") : null'
    },
    rp: { label: 'حجر-ورقة-مقص (rp)', blind: true },
    pn: { label: 'بينالتي (pn)', blind: true },
    rd: { label: 'روندا الكلاسيكية (rd)', ronda: true },
    rn: { label: 'فلات دوگ (rn)', generic: 'return !!(document.getElementById("rnContainer") && document.getElementById("rnContainer").innerHTML.length > 100)' },
    ch: { label: 'الشطرنج (ch)', generic: 'return !!(typeof CHESS !== "undefined" && CHESS && CHESS.state && CHESS.mode === "room")' },
    dm: { label: 'الضامة (dm)', generic: 'return !!(typeof DAMA !== "undefined" && DAMA && DAMA.state && DAMA.mode === "room")' },
    do: { label: 'الضومنة (do)', generic: 'return !!(window.DominoApp && window.DominoApp.room && window.DominoApp.room.on)' },
    bg: { label: 'الطاولة (bg)', generic: 'return !!(window.BackgammonApp && window.BackgammonApp.room && window.BackgammonApp.room.on)' },
    bl8: { label: 'البلياردو (bl8)', generic: 'return !!(window.BILLIARDS && window.BILLIARDS.G)' },
    pr: { label: 'البارتشيس (pr)', generic: 'return !!(window.PR || window.ParchisiApp || document.querySelector("#parchisiBoard"))' },
    bl: { label: 'البلوت (bl)', baloot: true },
    un: { label: 'الأونو (un)', uno: true }
  };

  for (const gid of Object.keys(gameProbes)) {
    const cfg = gameProbes[gid];
    console.log('═══ ' + cfg.label + ' ═══');
    let code = null;
    try {
      code = await pairGame(gid);
      ok(!!code && /^[A-Z0-9]{8}$/.test(code), 'الاقتران عبر الجسر الأصلي (كود 8 حروف)', code);

      const [ordH, ordG] = await Promise.all([
        H.page.evaluate(() => (window.Rooms.state && window.Rooms.state.order) || []),
        G.page.evaluate(() => (window.Rooms.state && window.Rooms.state.order) || [])
      ]);
      ok(ordH.length === 2 && JSON.stringify(ordH) === JSON.stringify(ordG), 'order متطابق عند الطرفين (لاعبان)', JSON.stringify(ordH));

      const onlineH = await H.page.evaluate(() => window.Rooms.state && window.Rooms.state.online);
      const onlineShape = Array.isArray(onlineH) ? 'array' : (onlineH ? typeof onlineH : 'none');
      ok(Array.isArray(onlineH) && onlineH.length === 2,
        'online مصفوفة تحمل اللاعبين المتصلين (شكل الخادم)', 'shape=' + onlineShape + ' val=' + JSON.stringify(onlineH));

      await bothReadyAndStart();
      const [stH, stG] = await Promise.all([
        H.page.evaluate(() => window.Rooms.state && window.Rooms.state.status),
        G.page.evaluate(() => window.Rooms.state && window.Rooms.state.status)
      ]);
      ok(stH === 'playing' && stG === 'playing', 'الجولة انطلقت عند الطرفين', stH + '/' + stG);

      /* init يصل: سجل المضيف يحوي حركة واحدة على الأقل (rp/pn يبدآن فوراً بلا بذرة) */
      /* pr كذلك: يبدأ محلياً وحركاته تحمل قيمها (نرد/حركة) كاملة بلا بذرة */
      if (gid !== 'rp' && gid !== 'pn' && gid !== 'rn' && gid !== 'ch' && gid !== 'dm' && gid !== 'pr') {
        const initH = await wait(H.page, () => (window.LocalMP.state().history || []).length > 0 ? 1 : null, 10000).catch(() => null);
        ok(!!initH, 'السائق بثّ init (سجل المضيف يحوي حركات)');
      }

      /* اللعبة بُنيت عند الضيف */
      if (cfg.built) {
        const builtG = await wait(G.page, new Function(cfg.built), 12000).catch(() => null);
        ok(!!builtG, 'الضيف بنى اللعبة من init (نفس البذرة)');
      }

      /* ── فحوص محددة ── */
      if (cfg.ronda) {
        /* جذر البلاغ: لا تولٍّ آلي لمقعد بشري متصل */
        const drv = await H.page.evaluate(() => {
          var A = window.RondaApp;
          if (!A || !A.game) return { err: 'no-game' };
          var st = A.game.state;
          var seat = st ? st.currentSeat : null;
          var needs = [];
          for (var s = 0; s < (st.players || []).length; s++) {
            try { needs.push(A._seatNeedsDriver ? A._seatNeedsDriver(s) : 'no-fn'); } catch (e) { needs.push('err'); }
          }
          return { phase: st && st.phase, seat: seat, needs: needs, online: (A._roomState() || {}).online };
        });
        ok(drv && drv.err !== 'no-game', 'الروندا الكلاسيكية: المحرك قائم عند المضيف', JSON.stringify(drv && drv.phase));
        const humansNeedDriver = (drv && drv.needs || []).filter(v => v === true).length;
        ok(humansNeedDriver === 0,
          'الروندا الكلاسيكية: لا مقعد بشري يحتاج تولياً آلياً (جذر البلاغ: online كائن لا مصفوفة)',
          'needs=' + JSON.stringify(drv && drv.needs) + ' online=' + JSON.stringify(drv && drv.online));

        /* تسكين 6 ثوانٍ: لا حركة play آلية إطلاقاً */
        await sleep(6000);
        const acts = await hist(H);
        const autoPlays = acts.filter(a => a === 'play').length;
        ok(autoPlays === 0, 'الروندا الكلاسيكية: صفر أفعال آلية أثناء تسكين 6ث (التحكم بشري)', 'plays=' + autoPlays + ' acts=' + acts.join(','));

        /* حركة بشرية فعلية: بطاقة من يد صاحب الدور تصل للضيف */
        const played = await H.page.evaluate(() => {
          var A = window.RondaApp;
          if (!A || !A.game) return null;
          var st = A.game.state;
          var seat = st.currentSeat;
          if (seat == null) return null;
          var hand = ((st.players && st.players[seat] && st.players[seat].hand) || (st.hands && st.hands[seat]) || []);
          if (!hand.length) return null;
          var cid = hand[0].id;
          try { A.game.playCard(seat, cid); } catch (e) { return 'err:' + e.message; }
          A._lastActAt = Date.now();
          A._netEmit('play', { playerId: seat, cardId: cid });
          return { seat: seat, cid: cid };
        });
        ok(!!played && typeof played === 'object', 'الروندا الكلاسيكية: اختيار بشري نُفِّذ وبُثّ', JSON.stringify(played));
        const guestPlayed = await wait(G.page, () => {
          var A = window.RondaApp;
          if (!A || !A.game) return null;
          var st = A.game.state;
          var playedCards = (st.playedCardsInCurrentDeal || 0);
          return playedCards > 0 ? playedCards : null;
        }, 8000).catch(() => null);
        ok(!!guestPlayed, 'الروندا الكلاسيكية: حركة المضيف وصلت وطُبِّقت عند الضيف', 'played=' + guestPlayed);
      }

      if (cfg.blind) {
        /* جذر البلاغ: blindResult لا يُصنَّع محلياً → الجمود الأبدي */
        /* rp: إيموجي (✊ حجر · ✋ ورقة) — ✋ تغلب ✊ · pn: اتجاه تسديدة من PN_DIRS */
        const pick = gid === 'rp' ? '✊' : '⬆️';
        const pick2 = gid === 'rp' ? '✋' : '↗️';
        const playFn = gid === 'rp' ? 'rpsRoomPlay' : 'pnRoomAct';
        /* انتظار شاشة اللعبة عند الطرفين (rpRoom/pnRoom تُنشأ بمعالج البدء) */
        await wait(H.page, () => (gid === 'rp' ? window.rpRoom : window.pnRoom) ? 1 : null, 8000).catch(() => null);
        await wait(G.page, () => (gid === 'rp' ? window.rpRoom : window.pnRoom) ? 1 : null, 8000).catch(() => null);
        await H.page.evaluate((a) => { try { window[a.f] && window[a.f](a.p); } catch (e) { window.__rpErr = e.message; } }, { f: playFn, p: pick });
        await sleep(400);
        await G.page.evaluate((a) => { try { window[a.f] && window[a.f](a.p); } catch (e) { window.__rpErr = e.message; } }, { f: playFn, p: pick2 });
        const isRp = gid === 'rp';
        const revealed = await wait(H.page, (g) => {
          if (g === 'rp') {
            var r = window.rpRoom;
            return (r && (r.myWins + r.oppWins) >= 1) ? { my: r.myWins, opp: r.oppWins, round: r.round } : null;
          }
          var pn = window.pnRoom;
          return (pn && pn.shot > 1 && (pn.seatShots[0].length + pn.seatShots[1].length) >= 1) ? { shot: pn.shot, goals: pn.seatGoals } : null;
        }, 6000, gid).catch(() => null);
        if (!revealed) {
          const dbgH = await H.page.evaluate((isRp) => {
            if (isRp) return window.rpRoom ? { my: rpRoom.myWins, opp: rpRoom.oppWins, wait: rpRoom.waiting, picked: rpRoom.oppPicked, round: rpRoom.round, err: window.__rpErr || null } : 'no-rpRoom';
            return window.pnRoom ? { shot: pnRoom.shot, shots: pnRoom.seatShots, goals: pnRoom.seatGoals, err: window.__rpErr || null } : 'no-pnRoom';
          }, isRp);
          console.log('    [تشخيص ' + gid + '-H]', JSON.stringify(dbgH));
        }
        ok(!!revealed, gid + ': الزوج انكشف وحُسم عند المضيف (blindResult محلي)', JSON.stringify(revealed));
        const revealedG = await wait(G.page, (g) => {
          if (g === 'rp') {
            var r = window.rpRoom;
            return (r && (r.myWins + r.oppWins) >= 1) ? { my: r.myWins, opp: r.oppWins, round: r.round } : null;
          }
          var pn = window.pnRoom;
          return (pn && pn.shot > 1 && (pn.seatShots[0].length + pn.seatShots[1].length) >= 1) ? { shot: pn.shot, goals: pn.seatGoals } : null;
        }, 6000, gid).catch(() => null);
        ok(!!revealedG, gid + ': الزوج انكشف وحُسم عند الضيف (blindResult محلي)', JSON.stringify(revealedG));
        if (revealed && revealedG) {
          ok(revealed.my === revealedG.opp && revealed.opp === revealedG.my, 'الانكشاف متطابق ومتقاطع (اختياري لكل طرف)');
        }
      }

      if (gid === 'rm') {
        /* الرامي: البذرة نفسها + حركة سحب تصل وتُطبَّق */
        const [stateH, stateG] = await Promise.all([
          H.page.evaluate(new Function(cfg.stateKey)),
          G.page.evaluate(new Function(cfg.stateKey))
        ]);
        ok(stateH === stateG, 'الرامي: حالة الجولة متطابقة عند الطرفين (نفس البذرة)', stateH + ' vs ' + stateG);
        const drew = await H.page.evaluate(() => {
          var AD = window.RAMI_ADAPTER, ST = window.RAMI_STATE;
          if (!AD || !ST || !ST.roundManager) return null;
          var rm = ST.roundManager;
          var cur = rm.getCurrentPlayer();
          if (!cur) return null;
          if (cur.id !== (AD.myPlayerId || 0)) return { skip: 'not-my-turn', cur: cur.id, me: AD.myPlayerId };
          var phase = rm.turnPhase;
          if (phase === 'WAITING_DRAW' && cur.hand.length < ST.rules.playHandSize) {
            var r = ST.executeMove({ type: 'draw_deck', playerId: cur.id });
            if (!r || !r.success) return { err: 'draw-failed:' + (r && r.error) };
            AD._netEmit('draw', { drawType: 'draw_deck', playerId: cur.id });
            return { act: 'draw', pid: cur.id };
          }
          /* يد ممتلئة ⇒ رمي ورقة لا تنتمي لمجموعات الطاولة (نمط _doAutoPlay) */
          var hand = cur.hand.slice();
          var card = hand.find(c => !ST.doesCardFitAnyTableMeld(c));
          if (!card) card = hand[hand.length - 1];
          if (!card) return { err: 'no-card' };
          var res = ST.executeMove({ type: 'discard', playerId: cur.id, cardId: card.id });
          if (!res || (!res.success && !res.penaltyApplied)) return { err: 'discard-failed:' + (res && res.error) };
          AD._netEmit('discard', { playerId: cur.id, cardId: card.id });
          return { act: 'discard', pid: cur.id };
        });
        if (drew && (drew.act === 'draw' || drew.act === 'discard')) {
          /* الحركة وصلت: تغيّر الدور عند الضيف — وعدادا رصد: Rooms._onMove
             (وصل النقل) وadapter._netApplyMove (طبّقها محرك الرامي) */
          await G.page.evaluate(() => {
            window.__rmIn = window.__rmIn || [];
            window.__roomsIn = window.__roomsIn || [];
            var R = window.Rooms;
            if (R && R._onMove && !R.__tapWrapped) {
              R.__tapWrapped = true;
              var origR = R._onMove;
              R._onMove = function (d) { try { window.__roomsIn.push(String(d && d.action) + ':' + String((d && d.data && d.data.action) || '')); } catch (e) {} return origR.call(this, d); };
            }
            var AD = window.RAMI_ADAPTER;
            if (AD && AD._netApplyMove && !AD.__wrapped) {
              AD.__wrapped = true;
              var orig = AD._netApplyMove.bind(AD);
              AD._netApplyMove = function (d) { try { window.__rmIn.push((d && d.action) || '?'); } catch (e) {} return orig(d); };
            }
          });
          const guestMoved = await wait(G.page, (pid) => {
            var ST = window.RAMI_STATE;
            if (!ST || !ST.roundManager) return null;
            var cur = ST.roundManager.getCurrentPlayer();
            return (cur && cur.id !== pid) ? 'turn:' + cur.id : null;
          }, 8000, drew.pid).catch(() => null);
          const inMoves = await G.page.evaluate(() => ({ rm: window.__rmIn || [], rooms: window.__roomsIn || [] }));
          if (!guestMoved) {
            const [hh, gs] = await Promise.all([
              H.page.evaluate(() => ({ hist: (window.LocalMP.state().history || []).map(h => (h.data && h.data.action) || h.action), peers: (window.LocalMP.state().peers || []).map(p => ({ id: p.id, uid: p.userId })), mode: window.LocalMP.state().mode, mpActive: window.RAMI_ADAPTER ? window.RAMI_ADAPTER.multiplayer : null, myPid: window.RAMI_ADAPTER ? window.RAMI_ADAPTER.myPlayerId : null, seq: window.RAMI_ADAPTER ? window.RAMI_ADAPTER._netSeq : null })),
              G.page.evaluate(() => ({ mode: window.LocalMP.state().mode, joined: window.LocalMP.state().lnJoined, room: !!(window.Rooms.state && window.Rooms.state.id), gid: window._currentGameId, st: window.RAMI_STATE ? (window.RAMI_STATE.roundManager.getCurrentPlayer().id + ':' + window.RAMI_STATE.roundManager.turnPhase) : null }))
            ]);
            console.log('    [تشخيص rm-H]', JSON.stringify(hh));
            console.log('    [تشخيص rm-G]', JSON.stringify(gs));
          }
          ok(!!guestMoved, 'الرامي: حركة المضيف (' + drew.act + ') وصلت وطُبّقت عند الضيف', String(guestMoved) + ' in=' + JSON.stringify(inMoves));
        } else {
          ok(false, 'الرامي: تعذّر تنفيذ حركة من صاحب الدور', JSON.stringify(drew));
        }
        /* لا تولٍّ آلي خلال 6ث من بدء الدور (مهلة السائق 4ث كانت تلتهم الأدوار) */
        await sleep(6000);
        const acts = await hist(H);
        const autoTO = acts.filter(a => a === 'autoTimeout').length;
        ok(autoTO === 0, 'الرامي: صفر لعب آلي باسم البشري المتصل خلال 6ث', 'autoTimeout=' + autoTO);
      }

      if (cfg.baloot) {
        const blProbe = () => {
          var A = window.BalootApp;
          var NS = window.BLGameNS;
          return { seat: A._roomSeat, driver: !!A._isDriver, phase: (NS && NS.state && NS.state.phase) || null, turn: (NS && NS.state && NS.state.turn), hands: (NS && NS.state && NS.state.hands && NS.state.hands.length) || 0 };
        };
        const ids = await H.page.evaluate(blProbe);
        const idsG = await G.page.evaluate(blProbe);
        ok(ids.seat === 0 && idsG.seat === 1, 'البلوت: مقاعد اللاعبين مشتقة من order (0 و1)', JSON.stringify([ids.seat, idsG.seat]));
        ok(ids.driver === true && idsG.driver === false, 'البلوت: السائق = المضيف حصراً');
        ok(!!ids.phase && ids.phase === idsG.phase, 'البلوت: الطور متطابق عند الطرفين', JSON.stringify([ids.phase, idsG.phase]));
        /* تسكين: لا أفعال آلية باسم البشري */
        await sleep(6000);
        const acts = await hist(H);
        const initCount = acts.filter(a => a === 'init').length;
        const leaked = acts.filter(a => a === 'autoTimeout').length;
        const blPlays = acts.filter(a => a === 'play' || a === 'choose').length;
        ok(initCount === 1, 'البلوت: init واحد حصراً (لا إعادة بناء عمياء)', 'init=' + initCount);
        ok(blPlays <= initCount && leaked === 0, 'البلوت: لا تولٍّ آلي على مقاعد البشري ولا تسرب ألعاب أخرى', 'acts=' + acts.join(','));
      }

      if (cfg.uno) {
        const ids = await H.page.evaluate(() => {
          var A = window.UnoApp;
          var NS = window.UNGameNS;
          return { seat: A._roomSeat, driver: !!A._isDriver, phase: NS && NS.st && NS.st.phase, turn: NS && NS.st && NS.st.turn, hands: NS && NS.st && NS.st.hands && NS.st.hands.length };
        });
        const idsG = await G.page.evaluate(() => {
          var A = window.UnoApp;
          var NS = window.UNGameNS;
          return { seat: A._roomSeat, driver: !!A._isDriver, phase: NS && NS.st && NS.st.phase, turn: NS && NS.st && NS.st.turn, hands: NS && NS.st && NS.st.hands && NS.st.hands.length };
        });
        ok(ids.seat === 0 && idsG.seat === 1, 'الأونو: مقاعد اللاعبين مشتقة من order (0 و1)', JSON.stringify([ids.seat, idsG.seat]));
        ok(ids.phase === idsG.phase && ids.turn === idsG.turn, 'الأونو: الطور والدور متطابقان عند الطرفين', JSON.stringify([ids.phase, ids.turn]) + ' vs ' + JSON.stringify([idsG.phase, idsG.turn]));
        await sleep(6000);
        const acts = await hist(H);
        const unPlays = acts.filter(a => a === 'play' || a === 'draw').length;
        ok(unPlays === 0, 'الأونو: لا تولٍّ آلي على مقاعد البشري خلال 6ث', 'acts=' + acts.join(','));
      }

      if (gid === 'ch' || gid === 'dm' || gid === 'do' || gid === 'bg' || gid === 'rn') {
        const conv = await Promise.all([
          H.page.evaluate(new Function(cfg.generic || 'return null')),
          G.page.evaluate(new Function(cfg.generic || 'return null'))
        ]);
        ok(!!(conv[0] && conv[1]), 'اللعبة قائمة عند الطرفين من التهيئة', JSON.stringify([!!conv[0], !!conv[1]]));
      }

      const errsH = H.page._errs.length, errsG = G.page._errs.length;
      const relevantErrs = H.page._errs.concat(G.page._errs).filter(e => !/favicon|jsQR|googleapis/i.test(e));
      ok(relevantErrs.length === 0, 'صفر أخطاء كونسول عند الطرفين', relevantErrs.slice(0, 3).join(' | ').slice(0, 160));
    } catch (e) {
      ok(false, 'استثناء في ' + cfg.label, e.message);
    } finally {
      await teardownPair();
    }
  }

  console.log('\n═══ الخلاصة ═══');
  console.log('PASS=' + pass + ' FAIL=' + fail);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
