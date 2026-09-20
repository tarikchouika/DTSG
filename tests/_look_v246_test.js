process.chdir(require('path').resolve(__dirname, '..'));
/* ═══════════════════════════════════════════════════════════════════════════
   [v2.46-LOOK] حارس تصميم الضومنة والطاولة — يمنع الانحدار للوراء
   ───────────────────────────────────────────────────────────────────────────
   يُشغَّل عبر بيئة QA المعتمدة فقط:
       bash scripts/qa-env.sh            (خادم على 3000 + Playwright)
       export PATH=/tmp/node24/bin:$PATH
       export NODE_PATH=/tmp/pw/node_modules
       export PLAYWRIGHT_BROWSERS_PATH=/tmp/pw/browsers
       node tests/_look_v246_test.js
   الفحوص (بورتريه + لاندسكيب):
     أ) الطاولة: شاشة اللعب وحدها ظاهرة (لا عناصر من القائمة فوقها) ونافذة اللعب غير قابلة للتمرير.
     ب) الطاولة: بطاقة اللاعب ثلاثة أسطر (الاسم/Score/Pips) · النرد كبير عاجي · بلا تمرير.
     ج) الضومنة: كل قطع اليد كاملة داخل الشاشة (لا قصّ) · نقاط كل قطعة داخل حدودها ·
        النقاط داخل القطعة (لم تُرسم خارجها) · لا تمرير في شاشة اللعب ·
        البنك يساراً · رزمة الخصم يميناً · القابل للّعب أصفر متوهّج · الجوخ أخضر (لا بنّي خشبي).
   ═══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000/';

async function wait(page, fn, timeout) {
  timeout = timeout || 15000;
  const t0 = Date.now(); let last = null;
  while (Date.now() - t0 < timeout) {
    try { const r = await page.evaluate(fn); if (r) return r; } catch (e) { last = e; }
    await page.waitForTimeout(160);
  }
  throw new Error('wait timeout' + (last ? ' (' + last.message + ')' : ''));
}

async function setup(ctx, u) {
  await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  p._errs = errs;
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
  return p;
}

/* هندسة: هل العنصر كامل داخل حدود الحاضنة؟ */
const INSIDE = `(el, host) => {
  if (!el || !host) return null;
  const a = el.getBoundingClientRect(), b = host.getBoundingClientRect();
  return { top: a.top - b.top, left: a.left - b.left, right: b.right - a.right, bottom: b.bottom - a.bottom,
           w: a.width, h: a.height };
}`;

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? '  ✓ ' : '  ✗ ') + name); };

  for (const [label, vp] of [['portrait', { width: 390, height: 780, isMobile: true, hasTouch: true }],
                             ['landscape', { width: 1280, height: 600 }]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const page = await setup(ctx, 'lk' + label.slice(0, 3) + Date.now().toString().slice(-5));
    try {
      /* ════ أ) الطاولة: القائمة مخفية وشاشة اللعب وحدها ════ */
      await page.evaluate(() => openGame('bg'));
      await wait(page, () => { const m = document.getElementById('bwMenu'); return m && getComputedStyle(m).display !== 'none'; }, 12000);
      const menuOnly = await page.evaluate(() => {
        const m = document.getElementById('bwMenu'), pl = document.getElementById('bwPlay');
        const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 4;
        return { menu: vis(m), play: vis(pl) };
      });
      ok(label + ': القائمة ظاهرة وحدها (بلا شاشة لعب فوقها)', menuOnly.menu && !menuOnly.play);

      /* ابدأ ضد الآلي: زر البدء داخل القائمة */
      const started = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('#bwMenu button, #bwMenu .bw-segbtn, #bwMenu [onclick]'));
        const b = btns.find(x => /bgStart|start/i.test(x.getAttribute('onclick') || '') || x.id === 'bwStartBtn');
        if (b) { b.click(); return true; }
        if (typeof BGApp !== 'undefined' && BGApp && typeof BGApp.start === 'function') { return 'no-btn'; }
        return false;
      });
      if (started !== true) {
        /* مسار احتياطي: نقطة البداية عبر الـapp */
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('#bwMenu button'));
          const b = btns[btns.length - 1];
          if (b) b.click();
        });
      }
      await wait(page, () => { const pl = document.getElementById('bwPlay'); return pl && getComputedStyle(pl).display !== 'none'; }, 15000);
      await page.waitForTimeout(700);

      const bgView = await page.evaluate(() => {
        const vis = el => !!el && getComputedStyle(el).display !== 'none';
        const menu = document.getElementById('bwMenu'), play = document.getElementById('bwPlay');
        const stage = document.getElementById('bwStage');
        const seat = document.querySelector('#bwPlay .bw-seat');
        const score = document.querySelector('#bwPlay .bw-seatscore');
        const pip = document.querySelector('#bwPlay .bw-seatpip');
        const die = document.querySelector('#bwPlay .bw-die');
        const r = el => { const b = el && el.getBoundingClientRect(); return b ? { y: b.top, h: b.height, w: b.width } : null; };
        return {
          menuVisible: vis(menu), playVisible: vis(play),
          menuOverlap: vis(menu) && vis(play),
          stageScroll: stage ? (stage.scrollHeight - stage.clientHeight) : null,
          playScroll: play ? (play.scrollHeight - play.clientHeight) : null,
          nameY: r(document.querySelector('#bwPlay .bw-seatname')),
          scoreY: r(score), pipY: r(pip), seatR: r(seat), dieR: r(die),
          boardInView: (() => { const b = document.querySelector('#bwPlay .bw-board'); const s = document.getElementById('bwStage');
            if (!b || !s) return null; const rb = b.getBoundingClientRect(), rs = s.getBoundingClientRect();
            return rb.top >= rs.top - 2 && rb.bottom <= rs.bottom + 2; })()
        };
      });
      ok(label + ': شاشة اللعب وحدها ظاهرة (لا تراكب مع القائمة)', bgView.playVisible && !bgView.menuVisible);
      ok(label + ': اللوحة كاملة داخل الشاشة (لا قصّ)', !!bgView.boardInView);
      ok(label + ': شاشة اللعب بلا تمرير رأسي (' + bgView.playScroll + 'px)', bgView.playScroll !== null && bgView.playScroll <= 4);
      const threeLines = bgView.nameY && bgView.scoreY && bgView.pipY &&
        bgView.scoreY.y > bgView.nameY.y + bgView.nameY.h - 2 && bgView.pipY.y > bgView.scoreY.y + 2;
      ok(label + ': بطاقة اللاعب ثلاثة أسطر (اسم/Score/Pips)', threeLines);
      ok(label + ': النرد كبير عاجي (' + (bgView.dieR ? Math.round(bgView.dieR.w) + 'px' : 'مفقود') + ')',
        !!bgView.dieR && bgView.dieR.w >= 44);
      ok(label + ': 0 أخطاء صفحة (طاولة)', page._errs.length === 0);
      if (page._errs.length) console.log('    errs:', page._errs.slice(0, 3));
      await page.evaluate(() => { if (typeof closeGame === 'function') closeGame(); else if (typeof goHome === 'function') goHome(); });
      await page.waitForTimeout(500);

      /* ════ ب) الضومنة ════ */
      await page.evaluate(() => openGame('do'));
      await wait(page, () => { const m = document.getElementById('dmMenu'); return m && getComputedStyle(m).display !== 'none'; }, 12000);
      await page.evaluate(() => {
        const b = document.querySelector('#dmMenu .dm-start, #dmMenu .dm-gobtn, #dmMenu button.big, #dmMenu .dm-segbtn.selected + *')
              || Array.from(document.querySelectorAll('#dmMenu button')).pop();
        if (b) b.click();
      });
      await wait(page, () => { const pl = document.getElementById('dmPlay'); return pl && getComputedStyle(pl).display !== 'none' && document.querySelectorAll('#dmPlay .dm-hand .dm-htile').length > 0; }, 15000);
      await page.waitForTimeout(600);

      const dm = await page.evaluate(() => {
        const host = document.getElementById('dmStage');
        const play = document.getElementById('dmPlay');
        const hand = document.querySelector('#dmPlay .dm-hand');
        const felt = document.querySelector('#dmPlay .dm-felt');
        const chain = document.querySelector('#dmPlay .dm-chain');
        const table = document.querySelector('#dmPlay .dm-table');
        const by = document.querySelector('#dmPlay .dm-boneyard');
        const opp = document.querySelector('#dmPlay .dm-opprow');
        const tiles = Array.from(document.querySelectorAll('#dmPlay .dm-hand .dm-htile'));
        const hb = hand && hand.getBoundingClientRect();
        const sb = host && host.getBoundingClientRect();
        const tileInfo = tiles.map(t => {
          const b = t.getBoundingClientRect();
          const pips = Array.from(t.querySelectorAll('.dp-cell'));
          const badPip = pips.some(p => { const pb = p.getBoundingClientRect();
            return pb.width > 0 && (pb.top < b.top - 1 || pb.bottom > b.bottom + 1 || pb.left < b.left - 1 || pb.right > b.right + 1); });
          return { w: b.width, h: b.height, bottomGap: sb ? sb.bottom - b.bottom : null, badPip: badPip,
                   insideHand: hb ? (b.top >= hb.top - 1 && b.bottom <= hb.bottom + 1) : null };
        });
        const feltBg = felt ? getComputedStyle(felt).backgroundImage + ' ' + getComputedStyle(felt).backgroundColor : '';
        const canTiles = tiles.filter(t => t.classList.contains('can'));
        const canBg = canTiles[0] ? getComputedStyle(canTiles[0]).backgroundImage : '';
        const pick = el => { const b = el && el.getBoundingClientRect(); return b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null; };
        return {
          n: tiles.length, tileInfo: tileInfo,
          playScroll: play ? (play.scrollHeight - play.clientHeight) : null,
          handScrollX: hand ? (hand.scrollWidth - hand.clientWidth) : null,
          byX: pick(by), oppX: pick(opp), tableW: table ? table.getBoundingClientRect().width : null,
          feltBg: feltBg, canCount: canTiles.length, canBg: canBg,
          chainC: chain ? (() => { const b = chain.getBoundingClientRect(); return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; })() : null,
          tableC: table ? (() => { const b = table.getBoundingClientRect(); return { cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: b.width, h: b.height }; })() : null
        };
      });

      ok(label + ': قطع اليد مرسومة (' + dm.n + ')', dm.n >= 1);
      ok(label + ': لا قطعة مقصوصة أسفل الشاشة', dm.tileInfo.every(t => t.bottomGap === null || t.bottomGap >= -1));
      ok(label + ': كل القطع داخل شريط اليد (لا قصّ)', dm.tileInfo.every(t => t.insideHand !== false));
      ok(label + ': نقاط كل قطعة داخل حدودها (لا تسرّب للنقش)', dm.tileInfo.every(t => t.badPip === false));
      ok(label + ': شاشة اللعب بلا تمرير (' + dm.playScroll + 'px)', dm.playScroll !== null && dm.playScroll <= 4);
      ok(label + ': اليد بلا تمرير أفقي (' + dm.handScrollX + 'px)', dm.handScrollX !== null && dm.handScrollX <= 4);
      ok(label + ': ارتفاع القطعة منطقي (' + dm.tileInfo.map(t => Math.round(t.h)).join('/') + ')',
        dm.tileInfo.every(t => t.h >= 40 && t.h <= 110));
      ok(label + ': البنك على الحافة اليسرى (' + (dm.byX ? Math.round(dm.byX.x) + 'px' : 'مفقود') + ')', !!dm.byX && dm.byX.x >= 0 && dm.byX.x < 40);
      ok(label + ': رزمة الخصم على الحافة اليمنى', !!dm.oppX && (dm.oppX.x + dm.oppX.w) >= (dm.tableW || 0) - 40);
      ok(label + ': الجوخ أخضر (لا خشب بنّي)', !/#8c5c2c|#6b4423|rgb\(140, 92, 44\)/.test(dm.feltBg));
      if (dm.canCount > 0) {
        const x = dm.canBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        ok(label + ': القطعة القابلة للّعب صفراء (' + dm.canBg.slice(0, 42) + '…)',
          !!x && +x[1] > 200 && +x[2] > 170 && +x[3] < 140);
      } else ok(label + ': (لا قطعة قابلة للّعب في هذه الجولة — تُخطّى)', true);
      if (dm.chainC && dm.tableC) {
        ok(label + ': المسار متمركز في الطاولة (Δx=' + Math.round(dm.chainC.cx - dm.tableC.cx) + ')',
          Math.abs(dm.chainC.cx - dm.tableC.cx) <= dm.tableC.w * 0.14);
      }
      ok(label + ': 0 أخطاء صفحة (ضومنة)', page._errs.length === 0);
      if (page._errs.length) console.log('    errs:', page._errs.slice(0, 3));
    } catch (e) {
      ok(label + ': EXCEPTION ' + String(e.message).slice(0, 110), false);
    }
    await ctx.close();
  }

  const pass = results.filter(r => r[1]).length;
  console.log('\n═══ LOOK v2.46: ' + pass + ' نجح / ' + (results.length - pass) + ' فشل ═══');
  await browser.close();
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
