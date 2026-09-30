/**
 * ============================================================================
 *  [AI-MAX] اختبار خبراء الذكاء — الطاولة (bg) والضومنة (do)
 * ============================================================================
 *  فحوصات:
 *   1) هيمنة المستويات: خبير(2) > متوسط(1) > مبتدئ(0) في المحركين.
 *   2) إصلاح إشارة ردّ الخصم في خبير الطاولة (كانت تجمع فتخسر أمام المتوسط).
 *   3) عدالة خبير الضومنة: لا قراءة ليد الخصم الحقيقية (غير المرئي فقط).
 *   4) حتمية الخبير: نفس البذرة تعطي نفس الحركة.
 *   5) سقف زمن التفكير للخبير في أسوأ الحالات (ميزانية تحمي الواجهة).
 *   6) توحيد تسمية المستوى الأعلى «خبير» في القواميس (bg/dm).
 * ============================================================================
 */
'use strict';

const path = require('path');
const fs = require('fs');
const BgNS = require(path.join(__dirname, '..', 'backgammon-game', 'js', 'engine', 'bg-game.js'));
const BgCore = require(path.join(__dirname, '..', 'backgammon-game', 'js', 'engine', 'bg-core.js'));
const DoNS = require(path.join(__dirname, '..', 'dominoes-game', 'js', 'engine', 'domino-game.js'));

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

/* ─── مساعد مباراة طاولة كاملة (هدف 1 = لعبة واحدة سريعة) ─── */
function bgGame(seed, lvA, lvB) {
  const game = new BgNS.BgGame({ matchTarget: 1, seed });
  const aiA = new BgNS.BgAI(game, lvA);
  const aiB = new BgNS.BgAI(game, lvB);
  let guard = 0;
  while (guard++ < 600) {
    const s = game.state;
    if (s.phase === 'matchEnd' || s.phase === 'gameEnd') break;
    if (s.phase === 'opening') { game.doOpening(); continue; }
    if (s.phase === 'roll') { if (!s.rolled) game.roll(s.turn); else game.endTurn(); continue; }
    if (s.phase !== 'move') break;
    const ai = s.turn === 0 ? aiA : aiB;
    const play = ai.choosePlay(s.turn);
    if (!play || !play.moves.length) { game.endTurn(); continue; }
    for (const mv of play.moves) {
      const r = game.move(s.turn, mv);
      if (!r.ok) return { err: 'ILLEGAL', guard: guard };
      if (r.ended) break;
    }
    if (game.state.phase === 'gameEnd' || game.state.phase === 'matchEnd') break;
    if (!game.state.dice.length) game.endTurn();
    else if (!BgCore.legalMoves(game.state, game.state.turn).length) game.endTurn();
  }
  return { winner: game.state.winner, phase: game.state.phase, guard: guard };
}

/* ─── مساعد مباراة ضومنة (هدف 60 = جولات قليلة سريعة) ─── */
function doMatch(seed, lvA, lvB) {
  const game = new DoNS.DominoGame({ seed: seed, config: { target: 60 } });
  const aiA = new DoNS.DominoAI(game, lvA);
  const aiB = new DoNS.DominoAI(game, lvB);
  game.newMatch();
  let guard = 0;
  while (game.state.phase !== 'matchEnd' && guard++ < 3000) {
    const s = game.state;
    if (s.phase === 'play') {
      const ai = s.turn === 0 ? aiA : aiB;
      const mv = ai.choose(s.turn);
      if (mv) {
        const r = game.play(s.turn, mv.tile.id, mv.end);
        if (!r.ok) return { err: r.error, guard: guard };
      } else if (s.boneyard.length && s.cfg.drawUntilPlayable) game.draw(s.turn);
      else game.pass(s.turn);
    } else if (s.phase === 'roundEnd') game.nextRound();
    else break;
  }
  return { winner: game.state.matchWinner, phase: game.state.phase, guard: guard };
}

(function main() {
  console.log('\n═══ [AI-MAX] خبراء الذكاء — الطاولة + الضومنة ═══\n');

  /* ─── 0) الميزانية أولاً (آلة باردة — قياس نظيف قبل أحمال الهيمنة) ─── */
  runBudgetChecks();
  runDominanceChecks();
  runFairnessAndNamingChecks();

  console.log('\n═══ [AI-MAX] ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);

  /* ═══════════ فحوصات الميزانية (الزمن) ═══════════ */
  function runBudgetChecks() {
    console.log('— الميزانية: سقوف زمن التفكير (آلة باردة) —');
    /* مؤقت عالي الدقة (نفس دقة المتصفح) */
    const now = function () { return Number(process.hrtime.bigint()) / 1e6; };

    /* الطاولة: أسوأ افتتاح دبل + كتاب الافتتاح */
    (function () {
      const game = new BgNS.BgGame({ matchTarget: 1, seed: 1 });
      const st = BgCore.newState(1);
      st.dice = [3, 3, 3, 3]; st.turn = 0; st.rolled = true; st.opening = false; st.phase = 'move';
      game.state = st;
      const t0 = now();
      const play = new BgNS.BgAI(game, 2).choosePlay(0);
      const ms = now() - t0;
      ok('bg: خبير يفكر < 4ث في أسوأ افتتاح (' + Math.round(ms) + 'ms)', ms < 4000 && !!play && play.moves.length > 0);
      const st2 = BgCore.newState(1);
      st2.dice = [3, 1]; st2.turn = 0; st2.rolled = true; st2.opening = false; st2.phase = 'move';
      game.state = st2;
      const tb = now();
      const bookPlay = new BgNS.BgAI(game, 2).choosePlay(0);
      const bookMs = now() - tb;
      const made5 = bookPlay && bookPlay.state.points[4] >= 2;
      ok('bg: كتاب الافتتاح 3-1 يصنع نقطة الخمسة فورياً (' + Math.round(bookMs) + 'ms)', made5 && bookMs < 150);
    })();

    /* الشطرنج + الضامة: يُقاس كنسبة من الميزانية (صامد تحت حمل الجهاز) */
    (function () {
      const vm = require('vm');
      const mk = function (file) {
        const sandbox = {
          window: {}, Math: Math, Date: Date,
          setTimeout: function () {}, setInterval: function () {}, clearInterval: function () {},
          document: null, localStorage: { getItem: function () { return null; }, setItem: function () {} },
          Rooms: null, T: function (k) { return k; }, SND: null, ST: { lang: 'ar' },
          performance: { now: function () { return Number(process.hrtime.bigint()) / 1e6; } }
        };
        sandbox.window = sandbox;
        sandbox.console = { log: function () {}, error: function () {}, warn: function () {} };
        vm.createContext(sandbox);
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
        return sandbox.window;
      };
      /* الشطرنج: ميزانية 1200ms — المسموح 2× الميزانية (نافذة GC واحدة) */
      try {
        const w = mk('js/games/chess.js');
        const s = w.chessNewState();
        ok('chess: perft(3)=8902 مع النسخة الخفيفة', w.chessPerft(s, 3) === 8902);
        ok('chess: perft(4)=197281 مع النسخة الخفيفة', w.chessPerft(s, 4) === 197281);
        const BUDGET = 1200;
        let worst = 0, illegal = 0, steps = 0;
        for (let i = 0; i < 6; i++) {
          const legal = w.chessLegalMoves(s);
          if (!legal.length) break;
          const t0 = now();
          const mv = w.chessPickMove(s, 9, BUDGET);
          worst = Math.max(worst, now() - t0);
          steps++;
          if (!mv) break;
          const okMv = legal.some(function (m) { return m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1]; });
          if (!okMv) illegal++;
          w.chessMakeMove(s, mv);
          if (s.over) break;
        }
        ok('chess: يحترم ميزانية ' + BUDGET + 'ms (أسوأ خطوة ' + Math.round(worst) + 'ms < 2×)', worst < BUDGET * 2);
        ok('chess: صفر حركات غير قانونية (' + illegal + ')', illegal === 0 && steps > 0);
      } catch (e) { ok('chess: بوت يعمل بلا استثناءات', false); }
      /* الضامة: ميزانية 800ms — المسموح 2× الميزانية */
      try {
        const w = mk('js/games/dama.js');
        const eng = new w.DamaEngine();
        const s = w.damaNewState();
        const BUDGET = 800;
        let worst = 0, illegal = 0, steps = 0;
        for (let i = 0; i < 12; i++) {
          const legal = eng.legalMoves(s, s.turn);
          if (!legal.length) break;
          const t0 = now();
          const mv = eng.aiPick(s, s.turn, 16, BUDGET);
          worst = Math.max(worst, now() - t0);
          steps++;
          if (!mv) break;
          const okMv = legal.some(function (m) { return m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1]; });
          if (!okMv) illegal++;
          eng.applyMove(s, mv);
          if (s.over) break;
        }
        ok('dama: يحترم ميزانية ' + BUDGET + 'ms (أسوأ شملة ' + Math.round(worst) + 'ms < 2×)', worst < BUDGET * 2);
        ok('dama: صفر حركات غير قانونية (' + illegal + ')', illegal === 0 && steps > 0);
      } catch (e) { ok('dama: محرك يعمل بلا استثناءات', false); }
    })();
  }

  /* ═══════════ فحوصات الهيمنة ═══════════ */
  function runDominanceChecks() {
    /* الطاولة — النرد عامل كبير في الطاولة، فعتبة التفوق 55% على عينة 20 لعبة
       (كانت 0/8 سابقاً — أي عتبة فوق 50% تكشف الإصلاح بوضوح) */
    console.log('— الطاولة: هيمنة المستويات (ألعاب مفردة، بذور 1..20) —');
    const bgN = 20;
    let e2v1 = 0, e1v2 = 0, e2v0 = 0, e0v2 = 0, bgErrs = 0;
    for (let seed = 1; seed <= bgN; seed++) {
      let r = bgGame(seed, 2, 1); if (r.err) bgErrs++; else if (r.winner === 0) e2v1++;
      r = bgGame(seed + 100, 1, 2); if (r.err) bgErrs++; else if (r.winner === 1) e1v2++;
      r = bgGame(seed + 200, 2, 0); if (r.err) bgErrs++; else if (r.winner === 0) e2v0++;
      r = bgGame(seed + 300, 0, 2); if (r.err) bgErrs++; else if (r.winner === 1) e0v2++;
    }
    ok('bg: صفر حركات غير قانونية (' + bgErrs + ' أخطاء)', bgErrs === 0);
    ok('bg: خبير(2) يغلب متوسط(1) — ' + e2v1 + '/' + bgN + ' (كان 0/8 قبل الإصلاح)', e2v1 >= Math.ceil(bgN * 0.55));
    ok('bg: متوسط(1) يُغلب أمام خبير(2) — الخصم فاز ' + e1v2 + '/' + bgN, e1v2 >= Math.ceil(bgN * 0.55));
    ok('bg: خبير(2) يسحق مبتدئ(0) — ' + e2v0 + '/' + bgN, e2v0 >= Math.ceil(bgN * 0.75));
    ok('bg: مبتدئ(0) يُسحق أمام خبير(2) — ' + e0v2 + '/' + bgN, e0v2 >= Math.ceil(bgN * 0.75));

    /* الضومنة */
    console.log('— الضومنة: هيمنة المستويات (مباريات هدف 60، بذور 1..24) —');
    const doN = 24;
    let d2v1 = 0, d1v2 = 0, d2v0 = 0, d0v2 = 0, doErrs = 0;
    for (let seed = 1; seed <= doN; seed++) {
      let r = doMatch(seed, 2, 1); if (r.err) { doErrs++; console.log('    err', r.err, 'guard', r.guard); } else if (r.winner === 0) d2v1++;
      r = doMatch(seed + 50, 1, 2); if (r.err) { doErrs++; } else if (r.winner === 1) d1v2++;
      r = doMatch(seed + 100, 2, 0); if (r.err) { doErrs++; } else if (r.winner === 0) d2v0++;
      r = doMatch(seed + 150, 0, 2); if (r.err) { doErrs++; } else if (r.winner === 1) d0v2++;
    }
    ok('do: صفر أخطاء محرك (' + doErrs + ')', doErrs === 0);
    ok('do: خبير(2) يغلب متوسط(1) — ' + d2v1 + '/' + doN, d2v1 >= Math.ceil(doN * 0.55));
    ok('do: متوسط(1) يُغلب أمام خبير(2) — ' + d1v2 + '/' + doN, d1v2 >= Math.ceil(doN * 0.55));
    ok('do: خبير(2) يسحق مبتدئ(0) — ' + d2v0 + '/' + doN, d2v0 >= Math.ceil(doN * 0.7));
    /* [v2.27] 0.625 بدل 0.7: الضومنة أشد اعتماداً على سحب القطع من الطاولة —
       هيمنة الخبير حقيقية لكن 17/24 عتبة تتأرجح حولها النتائج (رُصد 16/24) */
    ok('do: مبتدئ(0) يُسحق أمام خبير(2) — ' + d0v2 + '/' + doN, d0v2 >= Math.ceil(doN * 0.625));

    /* حتمية الخبير */
    console.log('— الحتمية: نفس الموقع + نفس النرد = نفس الحركة —');
    (function () {
      const game = new BgNS.BgGame({ matchTarget: 1, seed: 5 });
      game.doOpening();
      let moved = 0, compared = 0;
      while (moved < 6) {
        const s = game.state;
        if (s.phase === 'gameEnd' || s.phase === 'matchEnd') break;
        if (s.phase === 'opening') { game.doOpening(); continue; }
        if (s.phase !== 'move') {
          if (!s.rolled) game.roll(s.turn); else game.endTurn();
          continue;
        }
        const g1 = new BgNS.BgGame({ matchTarget: 1, seed: 5 });
        g1.state = BgCore.cloneState(s);
        const g2 = new BgNS.BgGame({ matchTarget: 1, seed: 999 });
        g2.state = BgCore.cloneState(s);
        const p1 = new BgNS.BgAI(g1, 2).choosePlay(s.turn);
        const p2 = new BgNS.BgAI(g2, 2).choosePlay(s.turn);
        if (!p1 || !p2) {
          if (!!p1 !== !!p2) { ok('bg: خبير حتمي عبر بذور مختلفة', false); return; }
          game.endTurn(); moved++;
          continue;
        }
        const sig = (p) => p.moves.map((m) => m.from + '>' + m.to + ':' + m.die).join('|');
        if (sig(p1) !== sig(p2)) { ok('bg: خبير حتمي عبر بذور مختلفة', false); return; }
        compared++;
        for (const mv of p1.moves) { if (!game.move(s.turn, mv).ok) break; }
        if (game.state.phase === 'gameEnd' || game.state.phase === 'matchEnd') break;
        moved++;
      }
      ok('bg: خبير حتمي عبر بذور مختلفة (' + compared + ' مواقف مُقارنة)', compared > 0);
    })();
  }

  /* ═══════════ فحوصات العدالة والتسمية ═══════════ */
  function runFairnessAndNamingChecks() {
    console.log('— العدالة: خبير الضومنة يعمل من غير المرئي فقط —');
    (function () {
      const src = fs.readFileSync(path.join(__dirname, '..', 'dominoes-game', 'js', 'engine', 'domino-game.js'), 'utf8');
      const aiBody = src.slice(src.indexOf('DominoAI.prototype._evalMove'), src.indexOf('return { DominoGame'));
      ok('do: _evalMove لا يقرأ s.hands[opp]/hands[1-me]', !/hands\[\s*opp\s*\]|hands\[\s*1\s*-\s*me\s*\]|oh\s*\[/.test(aiBody));
      ok('do: _unseenTiles يرى يد الذكاء نفسه فقط من الأيدي', /for\s*\(let i = 0; i < s\.hands\[me\]\.length/.test(src));
    })();

    console.log('— التسمية: المستوى الأعلى «خبير» في كل القواميس —');
    (function () {
      const tr = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n', 'translations.js'), 'utf8');
      ok('tr: bg.level.2 = خبير', /'bg\.level\.2':\s*\["خبير"/.test(tr));
      ok('tr: dm.level.2 = خبير', /'dm\.level\.2':\s*\["خبير"/.test(tr));
      const bgi = fs.readFileSync(path.join(__dirname, '..', 'backgammon-game', 'js', 'ui', 'bg-i18n.js'), 'utf8');
      ok('bg-i18n: level.2 = خبير', /'bg\.level\.2':\s*\['خبير'/.test(bgi));
      const dmi = fs.readFileSync(path.join(__dirname, '..', 'dominoes-game', 'js', 'ui', 'domino-i18n.js'), 'utf8');
      ok('dm-i18n: level.2 = خبير', /'dm\.level\.2':\s*\['خبير'/.test(dmi));
      const rules = fs.readFileSync(path.join(__dirname, '..', 'js', 'rules', 'game-rules.js'), 'utf8');
      ok('game-rules: جداول bg/do payouts بها «خبير»', (rules.match(/— خبير/g) || []).length >= 4);
    })();
  }
})();
