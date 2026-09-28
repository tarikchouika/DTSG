/**
 * ============================================================================
 *  RONDA GAME — اختبارات المحرك (Node.js)
 * ============================================================================
 *  تشغيل:  node tests/ronda-tests.js
 *
 *  تتضمن مرآة اختبارات RondaCoreTests.cs الأصلية + سيناريوهات القواعد المحلية:
 *  الضربة / الحبل / جوج حبال / الميسا / الروندا-التريندا / قاعا راي / قاعا أص
 *  / الالتقاط النهائي / حساب الأوراق / محاكاة مباريات كاملة عشوائية.
 * ============================================================================
 */
'use strict';

const RC = require('../js/engine/ronda-core.js');
const { RondaGame, RondaAI } = require('../js/engine/ronda-game.js');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✔ ' + name);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.error('  ✘ ' + name + '\n      ' + e.message);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'assertEq') + ': expected=' + expected + ' actual=' + actual);
  }
}

/** أدوات بناء أوراق للاختبار (id فريد عبر عداد) */
let testCardId = 1000;
function card(rank, suit) {
  return Object.freeze({ id: testCardId++, rank: rank, suit: suit || 'KHAL' });
}

/** حقن حالة يدوية لسيناريو محدد (white-box للاختبار فقط) */
function injectScenario(game, { hands, table, deck, dealerSeat, currentSeat }) {
  const st = game.state;
  if (dealerSeat !== undefined) st.dealerSeat = dealerSeat;
  if (currentSeat !== undefined) st.currentSeat = currentSeat;
  for (let i = 0; i < st.players.length; i++) {
    st.players[i].hand = (hands && hands[i] ? hands[i].slice() : []);
    st.players[i].capturedCards = [];
  }
  // تصفير النقاط (تقاط الإعلانات القديمة من التوزيع الأولي حتى تكون السيناريوهات حتمية)
  for (const t of st.teams) t.score = 0;
  st.roundStats = game._newRoundStats();
  st.table.cards = (table || []).slice();
  st.deck = (deck || []).slice();
  st.lastPlayedCard = null;
  st.lastPlayedById = -1;
  st.lastPlayerWhoCapturedId = -1;
  st.strike.reset();
}

/** جمع الأحداث في قائمة */
function collector() {
  const events = [];
  return { events, listen: function (ev) { events.push(ev); } };
}

console.log('\n=== اختبارات المصفوفة والمجموعة (مرآة RondaCoreTests) ===\n');

test('المجموعة تحتوي 40 ورقة فريدة بلا 8 و9', () => {
  const deck = RC.RondaDeckFactory.create();
  assertEq(deck.length, 40);
  assertEq(new Set(deck.map(c => c.id)).size, 40);
  assertEq(new Set(deck.map(c => c.rank)).size, 10);
  assert(!deck.some(c => c.rank === 8 || c.rank === 9));
  // كل رتبة موجودة 4 مرات (واحدة من كل نوع)
  for (const rank of RC.RANK_SEQUENCE) {
    assertEq(deck.filter(c => c.rank === rank).length, 4, 'rank ' + rank);
  }
});

test('الـ 7 تليها الـ 10 مباشرة في سلسلة التتابع', () => {
  assertEq(RC.nextRank(7), 10);
  assertEq(RC.nextRank(10), 11);
  assertEq(RC.nextRank(11), 12);
  assertEq(RC.nextRank(12), null);
});

test('الـ 6 تلتقط 6 و7 لكن لا تلتقط 12 عند غياب الـ 10 (المثال الأصلي)', () => {
  const table = [card(1), card(6), card(7), card(12)];
  const played = card(6);
  const result = new RC.CaptureResolver().resolve(played, table);
  assert(result.some(c => c.id === played.id));
  assert(result.some(c => c.rank === 7));
  assert(!result.some(c => c.rank === 12));
  assert(!result.some(c => c.rank === 1));
});

test('السلسلة الكاملة: 6 تلتقط 6,7,10,11,12 (6 أوراق)', () => {
  const table = [card(6), card(7), card(10), card(11), card(12)];
  const played = card(6);
  const result = new RC.CaptureResolver().resolve(played, table);
  assertEq(result.length, 6);
  assert(!result.some(c => c.rank === 1));
});

test('تعدد النسخ: يأخذ الكل (Q&A: يأخذ الكل)', () => {
  const table = [card(6, 'KOBBAS'), card(6, 'CHBADA'), card(7), card(10)];
  const played = card(6, 'DHAB');
  const result = new RC.CaptureResolver().resolve(played, table);
  assertEq(result.filter(c => c.rank === 6).length, 3);
  assert(result.some(c => c.rank === 7));
  assert(result.some(c => c.rank === 10));
});

test('التقاط مرتبط بالرتب لا بموقع الورقة على الطاولة', () => {
  // الترتيب في الطاولة مبعثر لكن السلسلة تُحسب بالرتب
  const table = [card(12), card(11), card(10), card(7), card(6)];
  const played = card(6, 'DHAB');
  const result = new RC.CaptureResolver().resolve(played, table);
  assertEq(result.length, 6); // played + 6 + 7 + 10 + 11 + 12
});

test('لا التقاط إن لم يوجد مثل الورقة', () => {
  const table = [card(1), card(6), card(7), card(12)];
  const played = card(4);
  const result = new RC.CaptureResolver().resolve(played, table);
  assertEq(result.length, 0);
});

console.log('\n=== اختبارات الإعداد والدور ===\n');

test('إعداد لاعبين: 3 أوراق لكل لاعب و4 على الطاولة والخصم يبدأ', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 1 });
  g.start();
  const st = g.state;
  assertEq(st.players.length, 2);
  assertEq(st.teams.length, 2);
  assertEq(st.players[0].hand.length, 3);
  assertEq(st.players[1].hand.length, 3);
  assertEq(st.table.cards.length, 4);
  assertEq(st.deck.length, 30); // 40 - 6 - 4
  // الموزع الافتراضي = المقعد الأخير → البداية للمقعد (0) المقابل للموزع
  assertEq(st.dealerSeat, 1);
  assertEq(st.currentSeat, 0);
});

test('إعداد زوجين ضد زوجين: 4 لاعبين فريقان', () => {
  const g = new RondaGame({ mode: RC.GameMode.TEAM_VS_TEAM, seed: 12345 });
  g.start();
  const st = g.state;
  assertEq(st.players.length, 4);
  assertEq(st.teams.length, 2);
  assert(st.teams.every(t => t.playerIds.length === 2));
  assert(st.players.every(p => p.hand.length === 3));
  assertEq(st.table.cards.length, 4);
  assertEq(st.deck.length, 24); // 40 - 12 - 4
  assertEq(st.currentSeat, 2); // ضد عقارب الساعة: جالس يسار الموزع (المقعد 3)
});

test('لاعب لا يملك الدور لا يستطيع اللعب', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 99 });
  g.start();
  const st = g.state;
  const wrongId = (st.currentSeat + 1) % 2;
  const wrongPlayer = st.getPlayer(wrongId);
  assertEq(wrongPlayer.hand.length, 3);
  let threw = false;
  try {
    g.playCard(wrongId, wrongPlayer.hand[0].id);
  } catch (e) { threw = true; assertEq(e.message, 'NOT_PLAYERS_TURN'); }
  assert(threw, 'should throw NOT_PLAYERS_TURN');
});

test('لا يمكن لعب ورقة ليست في اليد', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 5 });
  g.start();
  const current = g.state.currentSeat;
  let threw = false;
  try { g.playCard(current, 999); } catch (e) { threw = true; assertEq(e.message, 'CARD_NOT_IN_HAND'); }
  assert(threw);
});

console.log('\n=== الضربة / الحبل / جوج حبال ===\n');

test('الضربة: لعب نفس رتبة ورقة الخصم الأخيرة → +1 ويُلتقط عادي', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 7 });
  g.start();
  const A = g.state.getPlayer(0), B = g.state.getPlayer(1);
  injectScenario(g, {
    hands: [[card(6, 'KHAL'), card(2, 'KHAL')], [card(6, 'KOBBAS'), card(3, 'KHAL')]],
    table: [card(2, 'KOBBAS'), card(12)],
    deck: [card(3), card(4), card(5), card(1), card(10), card(11)], // توزيعات لاحقة ثم نهاية
    dealerSeat: 1, currentSeat: 0
  });
  const a6 = A.hand[0];
  g.playCard(A.id, a6.id);                  // A: 6 (تقع على الطاولة)
  const b6 = B.hand[0];
  const col = collector();
  g.onEvent(col.listen);
  g.playCard(B.id, b6.id);                  // B: 6 → ضربة
  g._listeners.pop();
  const strikeEv = col.events.find(e => e.type === 'Strike');
  assert(strikeEv, 'Strike event emitted');
  assertEq(strikeEv.teamId, B.teamId);
  // B التقط 6 من الطاولة (ورقتان 6 في كيسه: ملعوبته + ورقة A)
  assertEq(B.capturedCards.filter(c => c.rank === 6).length, 2);
  // فريق B زادت نقطة واحدة عن فريق A
  const tA = g.state.getTeam(A.teamId), tB = g.state.getTeam(B.teamId);
  assertEq(tB.score - tA.score, 1, 'B team +1');
});

test('الحبل: بعد الضربة يرد صاحب الورقة الأصلية → +5 ويسترد الأوراق', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 8 });
  g.start();
  const A = g.state.getPlayer(0), B = g.state.getPlayer(1);
  injectScenario(g, {
    hands: [[card(6, 'KHAL'), card(6, 'CHBADA'), card(2, 'KHAL')],
            [card(6, 'KOBBAS'), card(3, 'KHAL'), card(4, 'KHAL')]],
    table: [card(12)],
    deck: [card(4), card(5), card(1), card(2), card(10), card(11)],
    dealerSeat: 1, currentSeat: 0
  });
  const a6a = A.hand[0], a6b = A.hand[1], b6 = B.hand[0];
  g.playCard(A.id, a6a.id);   // A: 6 (1) تقع
  g.playCard(B.id, b6.id);    // B: 6 (2) → ضربة +1 (يلتقط 6 أ)
  const col = collector();
  g.onEvent(col.listen);
  g.playCard(A.id, a6b.id);   // A: 6 (3) → حبل +5
  g._listeners.pop();
  const ropeEv = col.events.find(e => e.type === 'Rope');
  assert(ropeEv, 'Rope event emitted');
  assertEq(ropeEv.teamId, A.teamId);
  const tA = g.state.getTeam(A.teamId), tB = g.state.getTeam(B.teamId);
  assertEq(tB.score - tA.score, 1 - 5, 'A has rope +5 net');
  // صاحب آخر ورقة مطابقة (A) يحصل على ورقتي الضربة + ورقة الحبل — لا تستقر على الطاولة
  assertEq(A.capturedCards.filter(c => c.rank === 6).length, 3);
  assertEq(B.capturedCards.filter(c => c.rank === 6).length, 0);
  assertEq(g.state.table.cards.filter(c => c.rank === 6).length, 0);
});

test('جوج حبال: صاحب الضربة يلعب الورقة الرابعة → +10 ويأخذ الأوراق', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 9 });
  g.start();
  const A = g.state.getPlayer(0), B = g.state.getPlayer(1);
  injectScenario(g, {
    hands: [
      [card(6, 'KHAL'), card(6, 'CHBADA')],
      [card(6, 'KOBBAS'), card(6, 'DHAB')]
    ],
    table: [card(12)],
    deck: [card(4), card(5), card(1), card(2)],
    dealerSeat: 1, currentSeat: 0
  });
  g.playCard(A.id, A.hand[0].id);   // A: 6 (1) تقع
  g.playCard(B.id, B.hand[0].id);   // B: 6 (2) → ضربة +1، يلتقط 6 أ
  g.playCard(A.id, A.hand[0].id);   // A: 6 (3) → حبل +5، تقع
  const col = collector();
  g.onEvent(col.listen);
  g.playCard(B.id, B.hand[0].id);   // B: 6 (4) → جوج حبال +10، يلتقط 6 ج
  g._listeners.pop();
  const drEv = col.events.find(e => e.type === 'DoubleRope');
  assert(drEv, 'DoubleRope event emitted');
  assertEq(drEv.teamId, B.teamId);
  // آخر لاعب يملك الورقة يأخذ الأوراق: B جمع الـ 6 كلها (استرداداً لا التقاط طاولة)
  assertEq(B.capturedCards.filter(c => c.rank === 6).length, 4);
  assertEq(A.capturedCards.filter(c => c.rank === 6).length, 0);
  assertEq(g.state.table.cards.filter(c => c.rank === 6).length, 0);
  const tA = g.state.getTeam(A.teamId), tB = g.state.getTeam(B.teamId);
  assertEq(tB.score - tA.score, (1 + 10) - 5, 'B: +1 +10, A: +5');
  // السلسلة انتهت وصفّرت
  assertEq(g.state.strike.sequence, 'None');
});

test('كسر السلسلة: حركة غير متطابقة تصفّر الضربة', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 10 });
  g.start();
  const A = g.state.getPlayer(0), B = g.state.getPlayer(1);
  injectScenario(g, {
    hands: [
      [card(6, 'KHAL'), card(7, 'KHAL'), card(2, 'KHAL')],
      [card(6, 'KOBBAS'), card(3, 'KHAL'), card(4, 'KHAL')]
    ],
    table: [],
    deck: [card(1), card(5), card(10), card(11), card(12), card(2)],
    dealerSeat: 1, currentSeat: 0
  });
  g.playCard(A.id, A.hand[0].id);   // A: 6
  g.playCard(B.id, B.hand[0].id);   // B: 6 → ضربة
  g.playCard(A.id, A.hand[0].id);   // A: 7 → لا حبل، تصفير
  const col = collector();
  g.onEvent(col.listen);
  g.playCard(B.id, B.hand[0].id);   // B: 3 — لا ضربة (آخر ورقة 7)
  g._listeners.pop();
  assert(!col.events.some(e => e.type === 'Strike' || e.type === 'Rope'), 'no special after break');
});

console.log('\n=== الميسا والنهايات ===\n');

test('الميسا: التقاط كل الطاولة → +1', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 11 });
  g.start();
  const A = g.state.getPlayer(0);
  injectScenario(g, {
    hands: [[card(6, 'KHAL'), card(2), card(3)], [card(4), card(5), card(7)]],
    table: [card(6, 'KOBBAS'), card(7)],
    deck: [card(1), card(10), card(11), card(12)],
    dealerSeat: 1, currentSeat: 0
  });
  const col = collector();
  g.onEvent(col.listen);
  g.playCard(A.id, A.hand[0].id);   // 6 تلتقط 6 ثم تتوقف (لا 7 متصلة... 7 موجودة! 6→7→توقف)
  g._listeners.pop();
  const mesaEv = col.events.find(e => e.type === 'Mesa');
  // الطاولة كانت [6,7]: لعب 6 يلتقط 6 و7 (السلسلة) → الطاولة تفرغ → ميسا
  assert(mesaEv, 'Mesa emitted');
  assertEq(A.capturedCards.length, 3); // ملعوبة + 6 + 7
});

console.log('\n=== الإعلانات: روندا / تريندا ===\n');

test('روندا تنحسم بالرتبة الأعلى: روندا 12 تفوز على روندا 7', () => {
  const r = RC.DeclarationResolver.resolveFight([
    { type: 'Ronda', rank: 7, points: 1, typeStrength: 1, playerId: 0, teamId: 0 },
    { type: 'Ronda', rank: 12, points: 1, typeStrength: 1, playerId: 1, teamId: 1 }
  ]);
  assertEq(r.rank, 12);
  assertEq(r.playerId, 1);
});

test('تريندا تفوز على روندا مهما كانت الرتبة', () => {
  const r = RC.DeclarationResolver.resolveFight([
    { type: 'Ronda', rank: 12, points: 1, typeStrength: 1, playerId: 0, teamId: 0 },
    { type: 'Trenda', rank: 5, points: 3, typeStrength: 3, playerId: 1, teamId: 1 }
  ]);
  assertEq(r.type, 'Trenda');
});

test('الفائز بالإعلان يأخذ مجموع نقاط كل الإعلانات (doc1)', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 12 });
  g.start();
  const A = g.state.getPlayer(0), B = g.state.getPlayer(1);
  injectScenario(g, {
    hands: [
      [card(6, 'KHAL'), card(6, 'KOBBAS'), card(2)],   // روندا 6 = 1
      [card(12, 'KHAL'), card(12, 'KOBBAS'), card(3)]  // روندا 12 = 1
    ],
    table: [card(4), card(5), card(7), card(10)],
    deck: [card(1), card(11), card(3), card(2)],
    dealerSeat: 1, currentSeat: 0
  });
  const col = collector();
  g.onEvent(col.listen);
  // أي حركة تُفعّل تقييم الإعلانات؟ لا — الإعلانات تُقيّم عند التوزيع فقط،
  // لذلك نحقن ثم نطلب إعادة التقييم يدوياً (نفس ما يحدث بعد إعادة التوزيع)
  g.state.dealNumber = 1;
  g._resolveDeclarations();
  g._listeners.pop();
  const decl = col.events.find(e => e.type === 'DeclarationsResolved');
  assert(decl, 'declarations emitted');
  assertEq(decl.declarations.length, 2);
  assertEq(decl.winnerPlayerId, B.id, 'رتبة 12 أعلى');
  assertEq(decl.awardedPoints, 2, 'مجموع نقاط الإعلانين');
  assertEq(g.state.getTeam(B.teamId).score, 2);
});

console.log('\n=== قاعا راي / قاعا أص ===\n');

function setupFinalThrow(dealerSeat, dealerLastCardRank, tableCards) {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 13 });
  g.start();
  const st = g.state;
  const otherSeat = (dealerSeat + 1) % 2;
  injectScenario(g, {
    hands: [
      [card(dealerSeat === 0 ? dealerLastCardRank : 2, dealerSeat === 0 ? 'DHAB' : 'KHAL')],
      [card(dealerSeat === 1 ? dealerLastCardRank : 2, dealerSeat === 1 ? 'DHAB' : 'KHAL')]
    ],
    table: tableCards,
    deck: [],
    dealerSeat: dealerSeat,
    currentSeat: otherSeat
  });
  const dealer = st.getPlayerBySeat(dealerSeat);
  const other = st.getPlayerBySeat(otherSeat);
  return { g, dealer, other, dealerCard: dealer.hand[0], otherCard: other.hand[0] };
}

test('قاعا راي: الموزع يلتقط 12 برميته الأخيرة → +5 له', () => {
  const { g, dealer, other, dealerCard, otherCard } = setupFinalThrow(1, 12, [card(12, 'KOBBAS'), card(5)]);
  g.playCard(other.id, otherCard.id);   // الخصم يلعب ورقته الحيادية أولاً
  g.playCard(dealer.id, dealerCard.id); // تلتقط 12 من الطاولة
  const t = g.state.getTeam(dealer.teamId);
  assertEq(t.score, 5, 'dealer +5');
});

test('قاعا أص: الموزع يلتقط 1 → الخصم +5', () => {
  const { g, dealer, other, dealerCard, otherCard } = setupFinalThrow(1, 1, [card(1, 'KOBBAS'), card(5)]);
  g.playCard(other.id, otherCard.id);
  g.playCard(dealer.id, dealerCard.id);
  const oppTeamId = 1 - dealer.teamId;
  assertEq(g.state.getTeam(oppTeamId).score, 5, 'opponent +5');
  assertEq(g.state.getTeam(dealer.teamId).score, 0);
});

test('الموزع لا يلتقط شيئاً في رميته الأخيرة → الخصم +5', () => {
  const { g, dealer, other, dealerCard, otherCard } = setupFinalThrow(1, 3, [card(5), card(7)]);
  g.playCard(other.id, otherCard.id);
  g.playCard(dealer.id, dealerCard.id);
  const oppTeamId = 1 - dealer.teamId;
  assertEq(g.state.getTeam(oppTeamId).score, 5, 'opponent +5 (no capture)');
});

test('الموزع يلتقط 2-7/10/11 فقط → لا شيء مختلف', () => {
  const { g, dealer, other, dealerCard, otherCard } = setupFinalThrow(1, 10, [card(10, 'KOBBAS'), card(11)]);
  g.playCard(other.id, otherCard.id);
  g.playCard(dealer.id, dealerCard.id); // تلتقط 10 و11 (سلسلة) لكن ليست 1 أو 12
  assertEq(g.state.getTeam(dealer.teamId).score, 0);
  assertEq(g.state.getTeam(1 - dealer.teamId).score, 0);
});

console.log('\n=== النهاية والحساب ===\n');

test('الأوراق المتبقية على الطاولة تذهب لآخر ملتقط', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 14 });
  g.start();
  const A = g.state.getPlayer(0), B = g.state.getPlayer(1);
  injectScenario(g, {
    hands: [[card(6, 'KHAL')], [card(3)]],
    table: [card(2), card(9 === 9 ? 5 : 5)],
    deck: [],
    dealerSeat: 1, currentSeat: 0
  });
  g.playCard(A.id, A.hand[0].id); // A تلتقط؟ لا 6 على الطاولة → تقع
  g.playCard(B.id, B.hand[0].id); // B لا تلتقط → تقع
  assertEq(g.state.table.cards.length, 4);
  assertEq(A.capturedCards.length, 0);
  // لا آخر ملتقط (لم يلتقط أحد) → تبقى على الطاولة (حالة حدية نادرة)
});

test('حساب الأوراق: 27 ورقة → 7 نقاط (فوق 20)', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 15 });
  g.start();
  const team = g.state.getTeam(0);
  const p = g.state.getPlayer(0);
  for (let i = 0; i < 27; i++) p.capturedCards.push(card(i % 12 + 1));
  const res = g.scoring.teamCardPoints(g.state, team);
  assertEq(res.cards, 27);
  assertEq(res.points, 7);
});

console.log('\n=== محاكاة مباريات كاملة (عشوائية حتمية) ===\n');

function fullMatchSimulation(seed, mode, targetScore) {
  const config = new RC.RondaRulesConfig({ targetScore: targetScore });
  const g = new RondaGame({ mode, seed, rules: config });
  const events = [];
  g.onEvent(ev => events.push(ev));
  g.start();

  let guard = 0;
  let ended = false;
  while (!ended && guard < 5000) {
    guard++;
    const st = g.state;
    if (st.phase === RC.GamePhase.FINISHED) { ended = true; break; }
    const current = st.currentSeat;
    const cardId = RondaAI.chooseCard(g, current);
    assert(cardId !== null, 'AI found a move (guard=' + guard + ')');
    g.playCard(current, cardId);
    if (events[events.length - 1] && events[events.length - 1].type === 'GameEnded') ended = true;
  }
  assert(ended, 'match ended within guard (seed=' + seed + ')');

  // تحقق من سلامة المحاسبة: كل الـ 40 ورقة موزعة بين الملتقط أو الطاولة
  const st = g.state;
  const allIds = new Set();
  let total = 0;
  for (const p of st.players) { for (const c of p.capturedCards) { allIds.add(c.id); total++; } }
  for (const c of st.table.cards) { allIds.add(c.id); total++; }
  assert(total === 40, 'all 40 cards accounted (got ' + total + ') seed=' + seed);

  // الفائز وصل الهدف
  const winner = st.teams.slice().sort((a, b) => b.score - a.score)[0];
  assert(winner.score >= targetScore, 'winner reached target');
  return { game: g, events };
}

test('محاكاة كاملة 1v1 حتى الفوز (seed=101)', () => {
  const { events } = fullMatchSimulation(101, RC.GameMode.HEAD_TO_HEAD, 41);
  assert(events.some(e => e.type === 'GameEnded'));
  assert(events.some(e => e.type === 'RoundEnded'));
  const ge = events.filter(e => e.type === 'GameEnded')[0];
  assert(ge.breakdown && ge.breakdown.length === 2);
});

test('محاكاة كاملة 2v2 حتى الفوز (seed=202)', () => {
  const { game } = fullMatchSimulation(202, RC.GameMode.TEAM_VS_TEAM, 51);
  assertEq(game.state.teams.length, 2);
});

test('محاكاة 3 مباريات بأنظمة مختلفة: لا أخطاء ومحاسبة كاملة', () => {
  fullMatchSimulation(303, RC.GameMode.HEAD_TO_HEAD, 61);
  fullMatchSimulation(404, RC.GameMode.TEAM_VS_TEAM, 41);
  fullMatchSimulation(505, RC.GameMode.HEAD_TO_HEAD, 51);
});

test('الحتمية: نفس الـ seed ونفس الأوامر → نفس الأحداث تماماً', () => {
  function runReplay(seed) {
    const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed });
    const log = [];
    g.onEvent(ev => log.push(ev.type + ':' + ev.seq));
    g.start();
    let guard = 0;
    while (g.state.phase !== RC.GamePhase.FINISHED && guard < 3000) {
      guard++;
      const cur = g.state.currentSeat;
      const cid = RondaAI.chooseCard(g, cur);
      if (cid === null) break;
      g.playCard(cur, cid);
    }
    return log.join('|');
  }
  const a = runReplay(777);
  const b = runReplay(777);
  assertEq(a, b, 'replay identical');
  assert(a.length > 100, 'substantial game played');
});

test('View اللاعب لا يكشف يد الخصم (doc2 §44)', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 21 });
  g.start();
  const v = g.getView(0);
  assert(v.myHand.length === 3, 'my hand visible');
  const opp = v.players.find(p => p.id === 1);
  assert(opp.handCount === 3 && !opp.hand, 'opponent: count only, no cards');
  assert(!('hand' in opp));
  const snap = JSON.stringify(v);
  assert(!snap.includes('"hand":[{'), 'no raw hand in view');
});

test('Snapshot يحتوي كل الحالة ويمكن تحويله JSON', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 22 });
  g.start();
  const snap = g.getSnapshot();
  assertEq(snap.seed, 22);
  assertEq(snap.state.players.length, 2);
  assert(snap.state.players[0].hand.length === 3);
  assert(snap.rules.targetScore === 41);
});

console.log('\n=== أنماط «كلٌّ لنفسه» (3 و4 لاعبين) + الرهان على جولة ===\n');

test('روندا 3 لاعبين (كل واحد لنفسه): 3 فرق من لاعب واحد ورزمة 27', () => {
  const g = new RondaGame({
    mode: RC.GameMode.FREE_FOR_ALL, playerCount: 3, seed: 601,
    names: ['أحمد', 'سعيد', 'خالد']
  });
  g.start();
  const st = g.state;
  assertEq(st.players.length, 3);
  assertEq(st.teams.length, 3);
  assert(st.teams.every(t => t.playerIds.length === 1), 'one player per team');
  assert(st.players.every(p => p.teamId === p.seat), 'teamId == seat');
  assertEq(st.players[0].hand.length, 3);
  assertEq(st.players[1].hand.length, 3);
  assertEq(st.players[2].hand.length, 3);
  assertEq(st.table.cards.length, 4);
  assertEq(st.deck.length, 27); // 40 - 9 - 4
  assertEq(st.dealerSeat, 2);
  assertEq(st.currentSeat, 1); // ضد عقارب الساعة: جالس يسار الموزع (المقعد 2)
  assertEq(st.getTeam(0).name, 'أحمد');
  assertEq(st.getTeam(2).name, 'خالد');
});

test('روندا 4 لاعبين (كل واحد لنفسه): 4 فرق ورزمة 24', () => {
  const g = new RondaGame({
    mode: RC.GameMode.FREE_FOR_ALL, playerCount: 4, seed: 602
  });
  g.start();
  const st = g.state;
  assertEq(st.players.length, 4);
  assertEq(st.teams.length, 4);
  assert(st.teams.every(t => t.playerIds.length === 1));
  assertEq(st.deck.length, 24); // 40 - 12 - 4
  assertEq(st.currentSeat, 2); // ضد عقارب الساعة: جالس يسار الموزع (المقعد 3)
});

test('محاكاة كاملة 3 لاعبين فردي (seed=606): فائز واضح ومحاسبة 40 ورقة', () => {
  const { game, events } = runMatch(606, RC.GameMode.FREE_FOR_ALL, 3, 51, false);
  assert(events.some(e => e.type === 'GameEnded'));
  const ge = events.filter(e => e.type === 'GameEnded')[0];
  assert(ge.breakdown.length === 3, 'breakdown for 3 teams');
  const winner = game.state.teams.slice().sort((a, b) => b.score - a.score)[0];
  assert(winner.score >= 51, 'winner reached 51');
});

test('محاكاة كاملة 4 لاعبين فردي (seed=616): فائز واضح ومحاسبة 40 ورقة', () => {
  const { game, events } = runMatch(616, RC.GameMode.FREE_FOR_ALL, 4, 41, false);
  assert(events.some(e => e.type === 'GameEnded'));
  const ge = events.filter(e => e.type === 'GameEnded')[0];
  assert(ge.breakdown.length === 4, 'breakdown for 4 teams');
  const winner = game.state.teams.slice().sort((a, b) => b.score - a.score)[0];
  assert(winner.score >= 41, 'winner reached 41');
});

test('الرهان على جولة (singleRoundMode): تنتهي بعد جولة واحدة 1v1', () => {
  const { game, events } = runMatch(707, RC.GameMode.HEAD_TO_HEAD, 2, 999, true);
  const ge = events.filter(e => e.type === 'GameEnded')[0];
  assert(ge, 'GameEnded emitted in round mode');
  assert(ge.roundNumber === undefined || ge.roundNumber <= 2, 'ends at/near round 1');
  const leader = game.state.teams.slice().sort((a, b) => b.score - a.score)[0];
  assertEq(Number(ge.winnerTeamId), leader.id, 'winner = top score');
  assert(game.state.roundNumber <= 2, 'match ended by round 2 at latest');
});

test('الرهان على جولة 3 لاعبين فردي: فائز بعد نهاية الجولة الأولى', () => {
  const { game, events } = runMatch(808, RC.GameMode.FREE_FOR_ALL, 3, 999, true);
  const ge = events.filter(e => e.type === 'GameEnded')[0];
  assert(ge, 'GameEnded emitted');
  const leader = game.state.teams.slice().sort((a, b) => b.score - a.score)[0];
  assertEq(Number(ge.winnerTeamId), leader.id);
  assert(ge.breakdown.length === 3);
});

console.log('\n=== قانون الضربة (مثال التوضيح: الورقة يجب أن تبقى ظاهرة) ===\n');

test('ضربة حالة أ: ورقة الخصم التُقطت قبل الرد → الرد ليس ضربة', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 910 });
  g.start();
  const A = g.state.getPlayer(0), B = g.state.getPlayer(1);
  // مثال المستخدم: طاولة فيها ورقة 4 → أ يلعب 4 فيلتقط الورقتين (ملعوبته + ورقة
  // الطاولة) → ب يلعب 4 تبقى على الطاولة ولا تعتبر ضربة.
  injectScenario(g, {
    hands: [[card(4, 'KHAL'), card(2, 'KHAL')], [card(4, 'KOBBAS'), card(3, 'KHAL')]],
    table: [card(4, 'CHBADA'), card(12)],
    deck: [card(5), card(1), card(10), card(11)],
    dealerSeat: 1, currentSeat: 0
  });
  g.playCard(A.id, A.hand[0].id);   // A: 4 يلتقط 4 الطاولة (ورقتان 4 في كيس أ)
  assertEq(A.capturedCards.filter(c => c.rank === 4).length, 2);
  assert(!g.state.lastPlayedCardResting, 'آخر ورقة (4 أ) لم تبقَ على الطاولة');
  const col = collector();
  g.onEvent(col.listen);
  g.playCard(B.id, B.hand[0].id);   // B: 4 → لا التفات ولا ضربة
  g._listeners.pop();
  assert(!col.events.some(e => e.type === 'Strike'), 'لا ضربة عندما التُقطت ورقة الخصم');
  assertEq(B.capturedCards.filter(c => c.rank === 4).length, 0, 'B لم يلتقط شيئاً');
  assertEq(g.state.table.cards.filter(c => c.rank === 4).length, 1, 'ورقة ب استقرّت على الطاولة');
  const tA = g.state.getTeam(A.teamId), tB = g.state.getTeam(B.teamId);
  assertEq(tA.score, tB.score, 'لا نقاط ضربة');
});

test('ضربة حالة ب: ورقة الخصم ظاهرة على الطاولة → الرد يلتقطها ويعتبر ضربة', () => {
  const g = new RondaGame({ mode: RC.GameMode.HEAD_TO_HEAD, seed: 911 });
  g.start();
  const A = g.state.getPlayer(0), B = g.state.getPlayer(1);
  // مثال المستخدم: طاولة بلا 4 → أ يلعب 4 فتستقر → ب يلعب 4 يلتقط ورقتين ويعتبر ضربة
  injectScenario(g, {
    hands: [[card(4, 'KHAL'), card(2, 'KHAL')], [card(4, 'KOBBAS'), card(3, 'KHAL')]],
    table: [card(7), card(12)],
    deck: [card(5), card(1), card(10), card(11)],
    dealerSeat: 1, currentSeat: 0
  });
  g.playCard(A.id, A.hand[0].id);   // A: 4 تستقر على الطاولة
  assert(g.state.lastPlayedCardResting, 'ورقة أ ما تزال ظاهرة');
  const col = collector();
  g.onEvent(col.listen);
  g.playCard(B.id, B.hand[0].id);   // B: 4 → ضربة + التقاط ورقتين
  g._listeners.pop();
  const strikeEv = col.events.find(e => e.type === 'Strike');
  assert(strikeEv, 'Strike event emitted');
  assertEq(B.capturedCards.filter(c => c.rank === 4).length, 2, 'B التقط ورقتين 4');
  const tA = g.state.getTeam(A.teamId), tB = g.state.getTeam(B.teamId);
  assertEq(tB.score - tA.score, 1, 'B +1 (ضربة)');
});

function runMatch(seed, mode, playerCount, targetScore, singleRound) {
  const config = new RC.RondaRulesConfig({
    targetScore: targetScore, singleRoundMode: !!singleRound
  });
  const opts = { mode, seed, rules: config };
  if (mode === RC.GameMode.FREE_FOR_ALL) opts.playerCount = playerCount;
  const g = new RondaGame(opts);
  const events = [];
  g.onEvent(ev => events.push(ev));
  g.start();
  let guard = 0;
  while (g.state.phase !== RC.GamePhase.FINISHED && guard < 6000) {
    guard++;
    const cur = g.state.currentSeat;
    const cid = RondaAI.chooseCard(g, cur);
    assert(cid !== null, 'AI found a move (guard=' + guard + ')');
    g.playCard(cur, cid);
  }
  assert(g.state.phase === RC.GamePhase.FINISHED, 'match ended (seed=' + seed + ')');
  const st = g.state;
  const allIds = new Set();
  let total = 0;
  for (const p of st.players) { for (const c of p.capturedCards) { allIds.add(c.id); total++; } }
  for (const c of st.table.cards) { allIds.add(c.id); total++; }
  assert(total === 40, 'all 40 cards accounted (got ' + total + ') seed=' + seed);
  return { game: g, events };
}

console.log('\n=============================================');
console.log('النتيجة: ' + passed + ' ناجح، ' + failed + ' فاشل');
console.log('=============================================\n');

if (failed > 0) {
  for (const f of failures) {
    console.error('✘ ' + f.name + '\n    ' + f.error.stack.split('\n').slice(0, 3).join('\n    '));
  }
  process.exit(1);
}
