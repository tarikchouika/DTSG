/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Provably Fair (Group Rounds)
   sha256 نقي بلغة JS + المولد الحتمي للنتائج + التحقق
   يجب أن يطابق توليد الخادم (server.cjs: groupOutcome) حرفياً
   ═══════════════════════════════════════════ */
"use strict";

/* ── SHA-256 نقي (نفس مخرجات node crypto كـ hex) ── */
const SHA256 = (function () {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const H0 = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function toBytes(s) {
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) {
        bytes.push(c);
      } else if (c < 0x800) {
        bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      } else if (c < 0xd800 || c >= 0xe000) {
        bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      } else {
        i++;
        const c2 = s.charCodeAt(i);
        const v = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
        bytes.push(0xf0 | (v >> 18), 0x80 | ((v >> 12) & 63), 0x80 | ((v >> 6) & 63), 0x80 | (v & 63));
      }
    }
    return bytes;
  }
  return function sha256hex(str) {
    const msg = toBytes(String(str));
    const bitLen = msg.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    const lenHi = Math.floor(bitLen / 0x100000000) >>> 0;
    const lenLo = bitLen >>> 0;
    msg.push((lenHi >>> 24) & 255, (lenHi >>> 16) & 255, (lenHi >>> 8) & 255, lenHi & 255);
    msg.push((lenLo >>> 24) & 255, (lenLo >>> 16) & 255, (lenLo >>> 8) & 255, lenLo & 255);
    const h = H0.slice();
    const w = new Array(64);
    for (let i = 0; i < msg.length; i += 64) {
      for (let t = 0; t < 16; t++) {
        w[t] = ((msg[i + t * 4] << 24) | (msg[i + t * 4 + 1] << 16) | (msg[i + t * 4 + 2] << 8) | msg[i + t * 4 + 3]) >>> 0;
      }
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;
        hh = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    let hex = '';
    for (let i = 0; i < 8; i++) hex += ('00000000' + h[i].toString(16)).slice(-8);
    return hex;
  };
})();

/* ── SHA-256 على مصفوفة بايتات (لأجل HMAC-SHA256) ── */
function _utf8Bytes(s) {
  var bytes = [];
  s = String(s);
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
    else if (c < 0xd800 || c >= 0xe000) { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    else { i++; var c2 = s.charCodeAt(i); var v = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff)); bytes.push(0xf0 | (v >> 18), 0x80 | ((v >> 12) & 63), 0x80 | ((v >> 6) & 63), 0x80 | (v & 63)); }
  }
  return bytes;
}
function _sha256bytes(msg) {
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var H0 = [ 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 ];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  var bitLen = msg.length * 8;
  var m = msg.slice();
  m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  var lenHi = Math.floor(bitLen / 0x100000000) >>> 0;
  var lenLo = bitLen >>> 0;
  m.push((lenHi >>> 24) & 255, (lenHi >>> 16) & 255, (lenHi >>> 8) & 255, lenHi & 255);
  m.push((lenLo >>> 24) & 255, (lenLo >>> 16) & 255, (lenLo >>> 8) & 255, lenLo & 255);
  var h = H0.slice();
  var w = new Array(64);
  for (var i = 0; i < m.length; i += 64) {
    for (var t = 0; t < 16; t++) {
      w[t] = ((m[i + t * 4] << 24) | (m[i + t * 4 + 1] << 16) | (m[i + t * 4 + 2] << 8) | m[i + t * 4 + 3]) >>> 0;
    }
    for (var t = 16; t < 64; t++) {
      var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (var t = 0; t < 64; t++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var ch = (e & f) ^ (~e & g);
      var temp1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  var out = new Array(32);
  for (var j = 0; j < 8; j++) {
    out[j * 4] = (h[j] >>> 24) & 255; out[j * 4 + 1] = (h[j] >>> 16) & 255;
    out[j * 4 + 2] = (h[j] >>> 8) & 255; out[j * 4 + 3] = h[j] & 255;
  }
  return out;
}
function _bytesToHex(b) {
  var hex = '';
  for (var i = 0; i < b.length; i++) hex += ('00' + (b[i] >>> 0).toString(16)).slice(-2);
  return hex;
}
/* ── HMAC-SHA256 نقي (يطابق RFC 2104) — يعتمد على SHA-256 أعلاه ── */
function hmacSha256(key, msg) {
  var blockSize = 64;
  var keyBytes = _utf8Bytes(key);
  if (keyBytes.length > blockSize) keyBytes = _sha256bytes(keyBytes);
  var padded = new Array(blockSize);
  for (var i = 0; i < blockSize; i++) padded[i] = (i < keyBytes.length) ? keyBytes[i] : 0;
  var msgBytes = _utf8Bytes(msg);
  var ipad = new Array(blockSize), opad = new Array(blockSize);
  for (var i = 0; i < blockSize; i++) { ipad[i] = padded[i] ^ 0x36; opad[i] = padded[i] ^ 0x5c; }
  var inner = _sha256bytes(ipad.concat(msgBytes));
  var outer = _sha256bytes(opad.concat(inner));
  return _bytesToHex(outer);
}

/* ── المولد الحتمي — يطابق server.cjs groupOutcome ── */
const Fair = {
  sha256: SHA256,
  /* بذرة الجولة = HMAC(serverSeed, clientSeed:nonce) — تطابق الخادم حرفياً */
  roundSeed: function (serverSeed, clientSeed, nonce) {
    return hmacSha256(String(serverSeed), String(clientSeed) + ':' + String(nonce));
  },
  /* نتيجة جولة — شكل متوافق مع القديم (<=2 وسطاء) أو الجديد (>=4 وسطاء) */
  outcome: function (serverSeed, clientSeed, nonce, gameId) {
    var seed, gid;
    if (arguments.length <= 2) { seed = serverSeed; gid = clientSeed; }
    else { seed = this.roundSeed(serverSeed, clientSeed, nonce); gid = gameId; }
    const h = (i) => parseInt(SHA256(seed + ':' + i).slice(0, 8), 16);
    if (gid === 'ke') {
      const pool = [];
      for (let n = 1; n <= 80; n++) pool.push(n);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = h(i) % (i + 1);
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      return { numbers: pool.slice(0, 20) };
    }
    if (gid === 'av') {
      const u = Math.min(h(1) / 0xFFFFFFFF, 0.999999999);
      return { crash_at: Math.max(1.02, 0.97 / (1 - u)) };
    }
    return null;
  },
  /* تحقق من جولة منتهية — شكل قديم (3 وسطاء) أو جديد (5 وسطاء) */
  verify: function (serverSeed, clientSeed, nonce, gameId, outcomeData) {
    if (arguments.length >= 5) {
      if (!serverSeed || !outcomeData) return false;
      var derived = null;
      try { derived = this.outcome(serverSeed, clientSeed, nonce, gameId); } catch (e) { return false; }
      return JSON.stringify(derived) === JSON.stringify(outcomeData);
    }
    var seed = serverSeed, gid = clientSeed, outcome = nonce;
    if (!seed || !outcome) return false;
    var d2 = null;
    try { d2 = this.outcome(seed, gid); } catch (e) { return false; }
    return JSON.stringify(d2) === JSON.stringify(outcome);
  },
  hmacSha256: hmacSha256
};

window.SHA256 = SHA256;
window.Fair = Fair;
