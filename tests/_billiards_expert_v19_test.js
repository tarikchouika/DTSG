/* ═══ اختبار بوت البلياردو الخبير v19 ═══
   بوت ضد بوت في الأنماط الخمسة — قياس نسبة الأخطاء (foul rate).
   الخبير الحقيقي: أخطاء نادرة جداً (المحاكاة الحتمية ترفض الضربات المخالفة
   ما دام يوجد بديل قانوني). العتبة: ≤ 10% أخطاء لكل نمط (الوضعيات المقفلة
   قد لا تملك حلاً قانونياً إطلاقاً — كما عند المحترفين). */
const R = require('../js/games/billiards-rules.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name); }
}

function playFrames(makeGame, frames, maxShots) {
  let shots = 0, fouls = 0, crashes = 0, finished = 0, scratches = 0;
  for (let f = 0; f < frames; f++) {
    let G;
    try { G = makeGame(); } catch (e) { crashes++; continue; }
    let n = 0;
    try {
      while (!G.S.frameOver && n < maxShots) {
        const ev = G.aiShot();
        n++;
        if (!ev) break;
        shots++;
        if (ev.foul || (ev.foul_codes && ev.foul_codes.length)) fouls++;
        if (ev.cue_pocketed) scratches++;
      }
    } catch (e) { crashes++; console.log('   CRASH:', e.message); }
    if (G.S.frameOver) finished++;
  }
  return { shots, fouls, crashes, finished, rate: shots ? fouls / shots : 0, scratches };
}

console.log('── 8-Ball (WPA) ──');
{
  const r = playFrames(() => R.eightball({}), 4, 120);
  console.log('   shots=' + r.shots + ' fouls=' + r.fouls + ' rate=' + (r.rate * 100).toFixed(1) + '% finished=' + r.finished + '/4');
  ok(r.crashes === 0, '8ball: بلا أعطال');
  ok(r.rate <= 0.05, '8ball: نسبة الأخطاء ≤ 5% (' + (r.rate * 100).toFixed(1) + '%)');
  ok(r.finished >= 3, '8ball: الإطارات تنتهي (' + r.finished + '/4)');
}

console.log('── Blackball (EPA) ──');
{
  const r = playFrames(() => {
    const G = R.blackball({});
    return G;
  }, 4, 140);
  console.log('   shots=' + r.shots + ' fouls=' + r.fouls + ' rate=' + (r.rate * 100).toFixed(1) + '% finished=' + r.finished + '/4');
  ok(r.crashes === 0, 'blackball: بلا أعطال');
  ok(r.rate <= 0.05, 'blackball: نسبة الأخطاء ≤ 5% (' + (r.rate * 100).toFixed(1) + '%)');
}

console.log('── Golvazor (DIRECT) ──');
{
  const r = playFrames(() => R.golvazor({ finish: 'DIRECT' }), 4, 140);
  console.log('   shots=' + r.shots + ' fouls=' + r.fouls + ' rate=' + (r.rate * 100).toFixed(1) + '% finished=' + r.finished + '/4');
  ok(r.crashes === 0, 'golvazor: بلا أعطال');
  ok(r.rate <= 0.05, 'golvazor: نسبة الأخطاء ≤ 5% (' + (r.rate * 100).toFixed(1) + '%)');
}

console.log('── [V19.3] Golvazor — الأنواع الأربعة الأخرى (خبير بلا أخطاء) ──');
for (const fin of ['DERNIER', 'BOUND', 'ANNONCE', 'ANNONCE_BOUND']) {
  const r = playFrames(() => R.golvazor({ finish: fin, bound: 3 }), 3, 240);
  console.log('   ' + fin + ': shots=' + r.shots + ' fouls=' + r.fouls + ' rate=' + (r.rate * 100).toFixed(1) + '% finished=' + r.finished + '/3');
  ok(r.crashes === 0, 'golvazor ' + fin + ': بلا أعطال');
  ok(r.finished === 3, 'golvazor ' + fin + ': كل الإطارات تنتهي (' + r.finished + '/3)');
  ok(r.rate === 0, 'golvazor ' + fin + ': 0% أخطاء بوت ضد بوت (' + (r.rate * 100).toFixed(1) + '%)');
}

console.log('── [V19.3] أنونص: الإعلان يتجدد كل دور ──');
{
  const G = R.golvazor({ finish: 'ANNONCE' });
  const S = G.S;
  /* وضع اصطناعي: كلا اللاعبين على السوداء (الطور يبدأ PLACE للكسر — نتجاوزه) */
  S.breakShot = false; S.open = false; S.phase = 'AIM';
  S.groups[0] = 'BLACK'; S.groups[1] = 'BLACK';
  for (const b of S.balls) if (b.type !== 'CUE' && b.type !== 'BLACK') { b.status = 'POCKETED'; }
  ok(G.needAnnounce(), 'اللاعب 0 على السوداء بلا إعلان → needAnnounce');
  ok(G.nominatePocket(S.table.pockets[0].id), 'الإعلان قُبل');
  ok(!G.needAnnounce(), 'بعد الإعلان: لا حاجة لإعلان جديد في نفس الدور');
  /* ضربة لا تُنهي الإطار (لمسة خفيفة بعيدة عن الحفر) */
  const cue = S.balls.find(b => b.type === 'CUE');
  const blk = S.balls.find(b => b.type === 'BLACK');
  cue.x = 300; cue.y = 250; blk.x = 500; blk.y = 250;
  const ev = G.shootAndResolve(0, 18, null);
  ok(!!ev, 'الضربة نُفذت');
  ok(S.annPocket[0] === null, 'إعلان الضارب مُسح بعد الضربة (يتجدد كل دور)');
  if (!S.frameOver && S.active === 0) {
    ok(G.needAnnounce(), 'عاد الدور له وهو على السوداء → إعلان جديد مطلوب');
  } else if (!S.frameOver) {
    ok(G.needAnnounce(), 'اللاعب 1 على السوداء بلا إعلان → needAnnounce له');
  }
}

console.log('── Snooker (WPBSA) ──');
{
  const r = playFrames(() => R.snooker({}), 2, 250);
  console.log('   shots=' + r.shots + ' fouls=' + r.fouls + ' rate=' + (r.rate * 100).toFixed(1) + '% finished=' + r.finished + '/2');
  ok(r.crashes === 0, 'snooker: بلا أعطال');
  ok(r.rate <= 0.05, 'snooker: نسبة الأخطاء ≤ 5% (' + (r.rate * 100).toFixed(1) + '%)');
}

console.log('── Carom (FREE → 5 نقاط) ──');
{
  let crashes = 0, shots = 0, scored = 0, finished = 0;
  for (let f = 0; f < 2; f++) {
    let G;
    try { G = R.carom({ discipline: 'FREE', target: 5 }); } catch (e) { crashes++; continue; }
    let n = 0;
    try {
      while (!G.S.frameOver && n < 200) {
        const ev = G.aiShot();
        n++;
        if (!ev) break;
        shots++;
        if (ev.scored) scored++;
      }
    } catch (e) { crashes++; console.log('   CRASH:', e.message); }
    if (G.S.frameOver) finished++;
  }
  const rate = shots ? scored / shots : 0;
  console.log('   shots=' + shots + ' scored=' + scored + ' successRate=' + (rate * 100).toFixed(1) + '% finished=' + finished + '/2');
  ok(crashes === 0, 'carom: بلا أعطال');
  ok(rate >= 0.5, 'carom: نسبة نجاح الكاروم ≥ 50% (' + (rate * 100).toFixed(1) + '%)');
  ok(finished === 2, 'carom: المباريات تصل الهدف (' + finished + '/2)');
}

/* حتمية aiPlan: نفس الوضعية → نفس الخطة (شرط الأونلاين) */
console.log('── الحتمية ──');
{
  const G1 = R.eightball({});
  const G2 = R.eightball({});
  const p1 = G1.aiPlan(), p2 = G2.aiPlan();
  ok(p1 && p2 && p1.angle === p2.angle && p1.power === p2.power, 'aiPlan حتمي: نفس الوضعية = نفس الضربة');
}

console.log('\n═══ Billiards Expert v19: ' + pass + '/' + (pass + fail) + ' passed ═══');
process.exit(fail ? 1 : 0);
