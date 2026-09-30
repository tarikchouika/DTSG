/* ═══════════════════════════════════════════════════════════════════════════
   [v2.68] سجل الألعاب الموحّد — المصدر الوحيد للحقيقة لخصائص كل لعبة في الغرف
   ═══════════════════════════════════════════════════════════════════════════

   قبل v2.68 كانت خصائص الألعاب مبعثرة: قائمة بيضاء داخل معالج نقطة النهاية،
   حدّ مقاعد عالمي (2-8) لا يعرف حاجة أي لعبة، ولا أي تحقق من مطابقة الحركة
   أو الحالة للعبة الغرفة. النتيجة الموثّقة:
     • غرفة بلوت بمقعدين/ثلاثة تُنشأ بنجاح ثم يتعذر بناء المحرك (يشترط 4)
       ⇒ «اللاعب الثاني لا يستطيع فتح اللعبة».
     • غرفة أونو بـ8 مقاعد (الواجهة تقيد 4 والخادم لا يقيد شيئاً).
     • حركة بلوت (blmove) يمكن حقنها في غرفة أونو — لا أحد يتحقق.
     • أي عميل يكتب room_state كاملة (آخر كاتب يفوز) ⇒ انحراف دائم.

   هذا الملف يستبدل كل ذلك بتعريف تصريحي واحد لكل لعبة:
     seats    : المقاعد المقبولة (min/max/exact) — البلوت 4 بالضبط (فرق 2ضد2)
     actions  : قائمة بيضاء لأسماء حركات الغرفة (أي شيء آخر ⇒ 400)
     state    : مخطط room_state: المفاتيح المسموحة (البقية تُقصّ بلا رفض)
                + من يملك الكتابة: 'driver' (السائق/المضيف) أو 'any' (أي لاعب نشط)
     teams    : دعم تسوية الفرق (t0/t1) بدل المقاعد (w0..w3)
     settle   : نمط التسوية المقبول لهذه اللعبة

   المرجع: كل قيمة هنا موثّقة من كود اللعبة نفسه (جسور الواجهة + المحركات).
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

/* مفاتيح الحالة الأساسية المتسامحة معها في كل الألعاب (أثر الأزمنة القديمة —
   الجسور الحالية ترسل {game_id, status} مع كل حركة كمعلومات تشخيصية فقط) */
const BASE_STATE_KEYS = ['game_id', 'status'];

/* تعريف لعبة — الافتراضات آمنة ومحافظة */
function game(def) {
  const seats = def.seats || {};
  return {
    id: def.id,
    /* المقاعد: exact إن وُجد (البلوت 4) وإلا min..max */
    seats: {
      min: seats.exact != null ? seats.exact : (seats.min != null ? seats.min : 2),
      max: seats.exact != null ? seats.exact : (seats.max != null ? seats.max : (seats.min || 2))
    },
    exactSeats: seats.exact != null ? seats.exact : null,
    /* 'blind' متاحة للجميع (الاختيار الأعمى الزوجي — عدالة وجه لوجه) */
    actions: def.actions || ['rmove', 'blind'],
    state: {
      keys: BASE_STATE_KEYS.concat(def.stateKeys || []),
      owner: def.stateOwner || 'driver'
    },
    teams: !!def.teams,
    settle: def.settle || 'seat'
  };
}

/* ═════════════ سجل الألعاب الـ17 المدعومة في الغرف ═════════════ */
const REGISTRY = {
  /* ── الروندا الكلاسيكية (rn): محرك rooms القديم — حالة غنية يقرؤها العائد ── */
  rn: game({
    id: 'rn',
    seats: { min: 2, max: 4 },
    actions: ['mode', 'pick', 'round', 'deal', 'betpropose', 'betdecide', 'betstart', 'betphase', 'blind'],
    /* room_state الحقيقي: الترتيب/الجولة/الوضع/البذرة/الاختيار/الطور (ronda.js) */
    stateKeys: ['order', 'round', 'mode', 'seed', 'pick', 'phase'],
    stateOwner: 'driver'
  }),

  /* ── الروندا الجديدة (rd) — محرك ronda-game/ المستقل ── */
  rd: game({ id: 'rd', seats: { min: 2, max: 4 }, stateKeys: [], stateOwner: 'driver' }),

  /* ── الرامي (rm): 2-4 لاعبين ── */
  rm: game({ id: 'rm', seats: { min: 2, max: 4 }, stateOwner: 'driver' }),

  /* ── البرجيس (pr): 2-4 — يوثّق خريطة المقاعد في room_state للعائد ── */
  pr: game({
    id: 'pr',
    seats: { min: 2, max: 4 },
    stateKeys: ['seats', 'types'],
    stateOwner: 'driver'
  }),

  /* ── الشطرنج (ch) ودامة (dm): ثنائيتان ── */
  ch: game({ id: 'ch', seats: { min: 2, max: 2 }, settle: 'seat' }),
  dm: game({ id: 'dm', seats: { min: 2, max: 2 } }),

  /* ── الطاولة (bg) والضومنة (do) ── */
  bg: game({ id: 'bg', seats: { min: 2, max: 2 } }),
  do: game({ id: 'do', seats: { min: 2, max: 4 } }),

  /* ── البلياردو بأنماطه الخمسة: ثنائي حصراً ── */
  bl8:  game({ id: 'bl8',  seats: { min: 2, max: 2 } }),
  blbb: game({ id: 'blbb', seats: { min: 2, max: 2 } }),
  blgv: game({ id: 'blgv', seats: { min: 2, max: 2 } }),
  blsn: game({ id: 'blsn', seats: { min: 2, max: 2 } }),
  blca: game({ id: 'blca', seats: { min: 2, max: 2 } }),

  /* ── أونو (un): 2-4 لاعبين (فرق اختياري) ── */
  un: game({ id: 'un', seats: { min: 2, max: 4 }, actions: ['unmove', 'blind'], stateOwner: 'driver' }),

  /* ── البلوت (bl): 4 لاعبين بالضبط — فرق 2ضد2 (المحرك يرفض البناء بأقل:
         baloot-app.js «البلوت يشترط 4 لاعبين») — جذر «تعذر فتح اللعبة» ── */
  bl: game({
    id: 'bl',
    seats: { exact: 4 },
    actions: ['blmove', 'blind'],
    teams: true,
    settle: 'team'
  }),

  /* ── حجر-ورقة-مقص (rp) وبينالتي (pn): ثنائيات الاختيار الأعمى ── */
  rp: game({ id: 'rp', seats: { min: 2, max: 2 }, actions: ['blind'] }),
  pn: game({ id: 'pn', seats: { min: 2, max: 2 }, actions: ['blind'] })
};

/* ═════════════ واجهة السجل ═════════════ */

function getGame(id) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, id) ? REGISTRY[id] : null;
}

/* هل اللعبة مدعومة في الغرف؟ (يستبدل ROOM_GAMES_ALLOWED المبعثرة) */
function isRoomGame(id) { return !!getGame(id); }

/* كل معرفات الألعاب المدعومة */
function roomGameIds() { return Object.keys(REGISTRY); }

/* clamp عدد المقاعد وفق حاجة اللعبة — يعيد {ok, max_players} أو {ok:false, message} */
function resolveSeats(id, wanted) {
  const g = getGame(id);
  if (!g) return { ok: false, message: 'لعبة غير مدعومة في الغرف' };
  let n = parseInt(wanted, 10);
  if (isNaN(n)) n = g.seats.max;
  if (g.exactSeats != null) {
    /* لعبة بمقاعد حتمية (البلوت 4): نعيد التعديل للقيمة الصحيحة دائماً —
       الطلب المخالف لا يُرفض بل يُصحَّح (توافق مع عملاء قديماً أرسلوا 4 افتراضياً) */
    return { ok: true, max_players: g.exactSeats, corrected: n !== g.exactSeats };
  }
  n = Math.max(g.seats.min, Math.min(g.seats.max, n));
  return { ok: true, max_players: n, corrected: n !== parseInt(wanted, 10) };
}

/* هل عدد اللاعبين النشطين كافٍ لبدء جولة هذه اللعبة؟ */
function enoughToStart(id, nonSpectators) {
  const g = getGame(id);
  if (!g) return false;
  return nonSpectators >= g.seats.min && nonSpectators <= g.seats.max;
}

/* هل الحركة مسموحة لهذه اللعبة؟ */
function actionAllowed(id, action) {
  const g = getGame(id);
  if (!g || !action) return false;
  return g.actions.indexOf(action) !== -1;
}

/* تقصّ الحالة وفق مخطط اللعبة: يُبقي المفاتيح المسموحة فقط (بلا رفض —
   المفاتيح الغريبة أثر تشخيصي لا يضر، وحرمان اللعبة من حالتها هو الضرر) */
function sanitizeState(id, state) {
  const g = getGame(id);
  if (!g || !state || typeof state !== 'object' || Array.isArray(state)) return null;
  const out = {};
  let kept = 0;
  for (const k of g.state.keys) {
    if (state[k] !== undefined) { out[k] = state[k]; kept++; }
  }
  return kept ? out : null;
}

/* من يملك كتابة الحالة؟ true إن كان الكاتب مرخّصاً وفق ملكية اللعبة */
function canWriteState(id, isDriver, isActivePlayer) {
  const g = getGame(id);
  if (!g) return false;
  if (g.state.owner === 'any') return !!isActivePlayer;
  return !!isDriver;   /* الافتراضي: السائق/المضيف المرجع الحتمي للحالة */
}

/* تصدير الواجهة (CommonJS — نفس نمط الوحدات في server-*.js) */
module.exports = {
  REGISTRY: REGISTRY,
  getGame: getGame,
  isRoomGame: isRoomGame,
  roomGameIds: roomGameIds,
  resolveSeats: resolveSeats,
  enoughToStart: enoughToStart,
  actionAllowed: actionAllowed,
  sanitizeState: sanitizeState,
  canWriteState: canWriteState,
  BASE_STATE_KEYS: BASE_STATE_KEYS
};

/* [Self-test] تشغيل مباشر: node games/registry.js — يتحقق من الثوابت الحرجة */
if (require.main === module) {
  const assert = require('assert');
  assert.strictEqual(roomGameIds().length, 17, '17 لعبة في السجل');
  assert.strictEqual(getGame('bl').exactSeats, 4, 'البلوت 4 بالضبط');
  assert.deepStrictEqual(resolveSeats('bl', 2).max_players, 4, 'بلوت بطلب 2 ⇒ يُصحَّح 4');
  assert.deepStrictEqual(resolveSeats('un', 8).max_players, 4, 'أونو بطلب 8 ⇒ يُقصّ 4');
  assert.deepStrictEqual(resolveSeats('ch', 4).max_players, 2, 'شطرنج بطلب 4 ⇒ يُقصّ 2');
  assert.strictEqual(actionAllowed('un', 'unmove'), true);
  assert.strictEqual(actionAllowed('un', 'blmove'), false, 'حركة بلوت في غرفة أونو ⇒ مرفوضة');
  assert.strictEqual(actionAllowed('bl', 'blmove'), true);
  assert.strictEqual(actionAllowed('rn', 'pick'), true);
  assert.strictEqual(actionAllowed('rp', 'blind'), true);
  assert.strictEqual(actionAllowed('xx', 'rmove'), false);
  const st = sanitizeState('rn', { order: [1, 2], round: 3, evil: 'x' });
  assert.deepStrictEqual(st, { order: [1, 2], round: 3 }, 'مفاتيح غريبة تُقصّ');
  assert.strictEqual(sanitizeState('un', { game_id: 'un', status: 'playing' }) !== null, true);
  assert.strictEqual(canWriteState('bl', true, true), true);
  assert.strictEqual(canWriteState('bl', false, true), false, 'بلوت: غير السائق لا يكتب الحالة');
  assert.strictEqual(enoughToStart('bl', 3), false, 'بلوت بثلاثة لا يبدأ');
  assert.strictEqual(enoughToStart('bl', 4), true);
  console.log('games/registry.js — self-test 18/18 ✓');
}
