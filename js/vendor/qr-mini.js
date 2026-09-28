/* ════════════════════════════════════════════════════════════════
   QR Mini — مُولّد رموز QR محلياً في المتصفح (بلا أي خدمة خارجية)
   [v2.45.1] سبب الإضافة: كان رمز الدفع يُبنى من api.qrserver.com
   ⇒ يُرسَل رابط دفع المستخدم (ورابط otpauth لـ2FA) لطرف ثالث.
   المواصفة: ISO/IEC 18004 (وضع البايت فقط · مستويات L/M/Q/H · الإصدارات 1–10
   أي حتى 119–271 بايت بحسب المستوى — يكفي لروابط الدفع ورموز TOTP).
   جداول كتل تصحيح الخطأ ومواضع أنماط المحاذاة هي جداول المواصفة المعيارية
   (نفسها الواردة في مشروع qrcode المفتوح — رخصة BSD).
   الاستعمال:
     QRMini.svg('نص', { ecc:'M', size:190, margin:2 }) → نص SVG جاهز
     QRMini.matrix('نص', { ecc:'M' })                  → { size, version, mask, modules }
   ════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* كتل RS لكل إصدار (1–10) × مستوى (L,M,Q,H): قوائم [عدد الكتل, الطول الكلي, كلمات البيانات] */
  var RS = [
    [[[1, 26, 19]], [[1, 26, 16]], [[1, 26, 13]], [[1, 26, 9]]],                                        /* v1  */
    [[[1, 44, 34]], [[1, 44, 28]], [[1, 44, 22]], [[1, 44, 16]]],                                       /* v2  */
    [[[1, 70, 55]], [[1, 70, 44]], [[2, 35, 17]], [[2, 35, 13]]],                                       /* v3  */
    [[[1, 100, 80]], [[2, 50, 32]], [[2, 50, 24]], [[4, 25, 9]]],                                       /* v4  */
    [[[1, 134, 108]], [[2, 67, 43]], [[2, 33, 15], [2, 34, 16]], [[2, 33, 11], [2, 34, 12]]],           /* v5  */
    [[[2, 86, 68]], [[4, 43, 27]], [[4, 43, 19]], [[4, 43, 15]]],                                       /* v6  */
    [[[2, 98, 78]], [[4, 49, 31]], [[2, 32, 14], [4, 33, 15]], [[4, 39, 13], [1, 40, 14]]],             /* v7  */
    [[[2, 121, 97]], [[2, 60, 38], [2, 61, 39]], [[4, 40, 18], [2, 41, 19]], [[4, 40, 14], [2, 41, 15]]],/* v8 */
    [[[2, 146, 116]], [[3, 58, 36], [2, 59, 37]], [[4, 36, 16], [4, 37, 17]], [[4, 36, 12], [4, 37, 13]]],/* v9 */
    [[[2, 86, 68], [2, 87, 69]], [[4, 69, 43], [1, 70, 44]], [[6, 43, 19], [2, 44, 20]], [[6, 43, 15], [2, 44, 16]]] /* v10 */
  ];
  /* مواضع أنماط المحاذاة (فارغة للإصدار 1) */
  var PP = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54]];
  var ECC_BITS = { L: 1, M: 0, Q: 3, H: 2 };      /* بِتّا مستوى التصحيح في تنسيق الترميز */
  var ECC_IDX = { L: 0, M: 1, Q: 2, H: 3 };
  var G15 = 0x537, G15_MASK = 0x5412, G18 = 0x1F25;

  /* حقول GF(256) */
  var EXP = new Array(256), LOG = new Array(256);
  (function () {
    var i;
    for (i = 0; i < 8; i++) EXP[i] = 1 << i;
    for (i = 8; i < 256; i++) EXP[i] = EXP[i - 4] ^ EXP[i - 5] ^ EXP[i - 6] ^ EXP[i - 8];
    for (i = 0; i < 255; i++) LOG[EXP[i]] = i;
  })();
  function gmul(a, b) { return (!a || !b) ? 0 : EXP[(LOG[a] + LOG[b]) % 255]; }

  function rsGenPoly(deg) {
    var poly = [1], i, a, b, next;
    for (i = 0; i < deg; i++) {
      next = new Array(poly.length + 1);
      for (a = 0; a < next.length; a++) next[a] = 0;
      for (a = 0; a < poly.length; a++) {
        next[a] ^= poly[a];
        next[a + 1] ^= gmul(poly[a], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }
  function rsEncode(data, eccLen) {
    var gen = rsGenPoly(eccLen), res = data.concat(new Array(eccLen)), i, j;
    for (i = 0; i < data.length; i++) {
      var coef = res[i];
      if (!coef) continue;
      for (j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], coef);
    }
    return res.slice(data.length);
  }
  function utf8(str) {
    var out = [], s = String(str), i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xD800 && c <= 0xDBFF) {               /* زوج بديل ⇒ 4 بايتات */
        var c2 = s.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function dataCapacity(version, ecc) {
    var blocks = RS[version - 1][ECC_IDX[ecc]], n = 0, i;
    for (i = 0; i < blocks.length; i++) n += blocks[i][0] * blocks[i][2];
    return n;
  }
  /* كلمات البيانات + ECC مُشابكة (interleaved) */
  function buildCodewords(bytes, version, ecc) {
    var cap = dataCapacity(version, ecc), bits = [], i, j;
    function push(val, len) { for (var k = len - 1; k >= 0; k--) bits.push((val >> k) & 1); }
    push(4, 4);                                            /* وضع البايت */
    push(bytes.length, version <= 9 ? 8 : 16);             /* عدد البايتات */
    for (i = 0; i < bytes.length; i++) push(bytes[i], 8);
    var maxBits = cap * 8;
    for (i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);        /* نهاية */
    while (bits.length % 8) bits.push(0);
    var pads = [0xEC, 0x11];
    i = 0;
    while (bits.length < maxBits) { push(pads[i++ % 2], 8); }
    var cw = [];
    for (i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      cw.push(v);
    }
    var dblocks = [], eblocks = [], off = 0, b, k;
    var spec = RS[version - 1][ECC_IDX[ecc]];
    for (b = 0; b < spec.length; b++) {
      var group = spec[b];
      for (k = 0; k < group[0]; k++) {
        var d = cw.slice(off, off + group[2]); off += group[2];
        dblocks.push(d);
        eblocks.push(rsEncode(d, group[1] - group[2]));
      }
    }
    var out = [], maxD = 0, maxE = 0;
    for (i = 0; i < dblocks.length; i++) maxD = Math.max(maxD, dblocks[i].length);
    for (i = 0; i < eblocks.length; i++) maxE = Math.max(maxE, eblocks[i].length);
    for (i = 0; i < maxD; i++) for (b = 0; b < dblocks.length; b++) if (i < dblocks[b].length) out.push(dblocks[b][i]);
    for (i = 0; i < maxE; i++) for (b = 0; b < eblocks.length; b++) if (i < eblocks[b].length) out.push(eblocks[b][i]);
    return out;
  }
  function bchTypeInfo(data) {                             /* 5 بتات ⇒ 15 بتاً */
    var d = data << 10;
    while (bitLen(d) - bitLen(G15) >= 0) d ^= G15 << (bitLen(d) - bitLen(G15));
    return ((data << 10) | d) ^ G15_MASK;
  }
  function bchVersion(version) {                           /* 6 بتات ⇒ 18 بتاً */
    var d = version << 12;
    while (bitLen(d) - bitLen(G18) >= 0) d ^= G18 << (bitLen(d) - bitLen(G18));
    return (version << 12) | d;
  }
  function bitLen(v) { var n = 0; while (v) { n++; v >>>= 1; } return n; }
  function maskFn(p) {
    if (p === 0) return function (i, j) { return (i + j) % 2 === 0; };
    if (p === 1) return function (i) { return i % 2 === 0; };
    if (p === 2) return function (i, j) { return j % 3 === 0; };
    if (p === 3) return function (i, j) { return (i + j) % 3 === 0; };
    if (p === 4) return function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0; };
    if (p === 5) return function (i, j) { return (i * j) % 2 + (i * j) % 3 === 0; };
    if (p === 6) return function (i, j) { return ((i * j) % 2 + (i * j) % 3) % 2 === 0; };
    return function (i, j) { return ((i * j) % 3 + (i + j) % 2) % 2 === 0; };
  }
  /* بناء المصفوفة لإصدار/قناع محدّدين */
  function buildMatrix(codewords, version, ecc, mask) {
    var size = version * 4 + 17, i, j, r, c;
    var mod = [], fn = [];
    for (i = 0; i < size; i++) {
      mod.push(new Array(size));
      fn.push(new Array(size));
      for (j = 0; j < size; j++) { mod[i][j] = 0; fn[i][j] = false; }
    }
    function set(rr, cc, v) { if (rr < 0 || cc < 0 || rr >= size || cc >= size) return; mod[rr][cc] = v ? 1 : 0; fn[rr][cc] = true; }
    function finder(r0, c0) {
      for (var a = -1; a <= 7; a++) for (var b = -1; b <= 7; b++) {
        var on = (a >= 0 && a <= 6 && (b === 0 || b === 6)) || (b >= 0 && b <= 6 && (a === 0 || a === 6)) ||
                 (a >= 2 && a <= 4 && b >= 2 && b <= 4);
        set(r0 + a, c0 + b, on);
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (i = 8; i < size - 8; i++) {                       /* أنماط التزامن */
      var tv = (i % 2 === 0) ? 1 : 0;
      set(6, i, tv); set(i, 6, tv);
    }
    var pos = PP[version - 1];
    for (i = 0; i < pos.length; i++) for (j = 0; j < pos.length; j++) {
      var ar = pos[i], ac = pos[j];
      if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) continue;
      for (r = -2; r <= 2; r++) for (c = -2; c <= 2; c++) set(ar + r, ac + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }
    if (version >= 7) {                                    /* معلومات الإصدار */
      var vi = bchVersion(version);
      for (i = 0; i < 18; i++) {
        var vb = (vi >> i) & 1;
        set(Math.floor(i / 3), i % 3 + size - 11, vb);
        set(i % 3 + size - 11, Math.floor(i / 3), vb);
      }
    }
    /* معلومات التنسيق (تحتلّ مواضعها كوحدات وظيفية قبل توزيع البيانات) */
    var fmt = bchTypeInfo((ECC_BITS[ecc] << 3) | mask), fb = [];
    for (i = 0; i < 15; i++) fb.push((fmt >> i) & 1);
    for (i = 0; i <= 5; i++) set(i, 8, fb[i]);
    set(7, 8, fb[6]); set(8, 8, fb[7]); set(8, 7, fb[8]);
    for (i = 9; i < 15; i++) set(8, 14 - i, fb[i]);
    for (i = 0; i < 8; i++) set(8, size - 1 - i, fb[i]);
    for (i = 8; i < 15; i++) set(size - 15 + i, 8, fb[i]);
    set(size - 8, 8, 1);                                    /* الوحدة الداكنة */
    /* توزيع الكلمات على شكل zigzag من أسفل اليمين */
    var maskfn = maskFn(mask), bit = 0, total = codewords.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && bit < total) {
            var v = (codewords[bit >> 3] >> (7 - (bit & 7))) & 1;
            if (maskfn(y, x)) v ^= 1;
            mod[y][x] = v;
            bit++;
          }
        }
      }
    }
    return mod;
  }
  /* جزاء القناع (قواعد ISO الأربعة) */
  function penalty(m) {
    var size = m.length, i, j, score = 0, run, color, dark = 0;
    for (i = 0; i < size; i++) {
      run = 1; color = m[i][0];
      for (j = 1; j < size; j++) {
        if (m[i][j] === color) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; color = m[i][j]; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (j = 0; j < size; j++) {
      run = 1; color = m[0][j];
      for (i = 1; i < size; i++) {
        if (m[i][j] === color) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; color = m[i][j]; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (i = 0; i < size - 1; i++) for (j = 0; j < size - 1; j++) {
      var c0 = m[i][j];
      if (c0 === m[i][j + 1] && c0 === m[i + 1][j] && c0 === m[i + 1][j + 1]) score += 3;
    }
    var p1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], p2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function matches(get, len) {
      var n = 0, k, ok1, ok2;
      for (k = 0; k + 11 <= len; k++) {
        ok1 = ok2 = true;
        for (var q = 0; q < 11; q++) {
          var v = get(k + q);
          if (v !== p1[q]) ok1 = false;
          if (v !== p2[q]) ok2 = false;
        }
        if (ok1 || ok2) n += 40;
      }
      return n;
    }
    for (i = 0; i < size; i++) {
      (function (row) {
        score += matches(function (k) { return m[row][k]; }, size);
      })(i);
      (function (col) {
        score += matches(function (k) { return m[k][col]; }, size);
      })(i);
    }
    for (i = 0; i < size; i++) for (j = 0; j < size; j++) if (m[i][j]) dark++;
    var pct = dark * 100 / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }
  function matrix(text, opts) {
    var o = opts || {};
    var ecc = String(o.ecc || 'M').toUpperCase();
    if (!(ecc in ECC_IDX)) ecc = 'M';
    var bytes = utf8(text);
    var version = 0, v;
    for (v = 1; v <= 10; v++) {
      var cap = dataCapacity(v, ecc);
      var need = Math.ceil((4 + (v <= 9 ? 8 : 16) + bytes.length * 8) / 8);
      if (need <= cap) { version = v; break; }
    }
    if (!version) throw new Error('QRMini: النص أطول من سعة الإصدار 10 لهذا المستوى');
    var cw = buildCodewords(bytes, version, ecc);
    var best = null, bestScore = 0, bestMask = 0, k;
    if (typeof o.mask === 'number') {
      bestMask = o.mask & 7;
      best = buildMatrix(cw, version, ecc, bestMask);
    } else {
      for (k = 0; k < 8; k++) {
        var m = buildMatrix(cw, version, ecc, k);
        var s = penalty(m);
        if (best === null || s < bestScore) { best = m; bestScore = s; bestMask = k; }
      }
    }
    return { size: version * 4 + 17, version: version, mask: bestMask, ecc: ecc, modules: best };
  }
  function svg(text, opts) {
    var o = opts || {};
    var r = matrix(text, o);
    var margin = (typeof o.margin === 'number') ? o.margin : 2;
    var px = (typeof o.size === 'number') ? o.size : 190;
    var dim = r.size + margin * 2;
    var path = '', i, j;
    for (i = 0; i < r.size; i++) for (j = 0; j < r.size; j++) {
      if (r.modules[i][j]) path += 'M' + (j + margin) + ' ' + (i + margin) + 'h1v1h-1z';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 ' + dim + ' ' + dim +
      '" shape-rendering="crispEdges" role="img">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="#fff"/>' +
      '<path d="' + path + '" fill="#000"/></svg>';
  }
  root.QRMini = { matrix: matrix, svg: svg, version: '1.0' };
})(typeof window !== 'undefined' ? window : this);
