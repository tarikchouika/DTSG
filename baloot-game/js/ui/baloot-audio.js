/* ════════════════════════════════════════════════════════════════════
   BLAudio — مؤثرات البلوت (Web Audio — بلا ملفات صوتية)
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  let ctx = null, master = null, muted = false;

  function ac() {
    if (ctx) return ctx;
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function ready() {
    const c = ac();
    if (!c) return false;
    if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
    return !muted;
  }

  function tone(freq, dur, opts) {
    if (!ready()) return;
    const c = ac();
    try {
      const o = c.createOscillator();
      const g = c.createGain();
      const t = c.currentTime + (opts && opts.delay || 0);
      o.type = (opts && opts.type) || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (opts && opts.glide) o.frequency.exponentialRampToValueAtTime(opts.glide, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime((opts && opts.vol != null ? opts.vol : 0.2), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  }

  function noise(dur, opts) {
    if (!ready()) return;
    const c = ac();
    try {
      const n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = (opts && opts.freq) || 1800;
      f.Q.value = (opts && opts.q) || 0.9;
      const g = c.createGain();
      const t = c.currentTime + (opts && opts.delay || 0);
      g.gain.setValueAtTime((opts && opts.vol != null ? opts.vol : 0.18), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t);
    } catch (e) {}
  }

  const S = {
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; },
    prime: function () { ac(); },

    click: function () { tone(660, 0.07, { type: 'triangle', vol: 0.12 }); },
    select: function () { tone(520, 0.08, { type: 'triangle', vol: 0.14 }); tone(780, 0.09, { type: 'triangle', vol: 0.1, delay: 0.05 }); },
    deal: function () {
      for (let i = 0; i < 5; i++) noise(0.06, { freq: 2400 + i * 300, vol: 0.1, delay: i * 0.07 });
    },
    snap: function () {
      noise(0.05, { freq: 2600, vol: 0.22, q: 1.4 });
      tone(180, 0.07, { type: 'sine', vol: 0.16 });
    },
    lift: function () { tone(340, 0.05, { type: 'triangle', vol: 0.08 }); },
    err: function () { tone(140, 0.18, { type: 'square', vol: 0.12 }); tone(110, 0.2, { type: 'square', vol: 0.1, delay: 0.09 }); },
    coin: function () {
      tone(1318, 0.14, { vol: 0.16 });
      tone(1760, 0.2, { vol: 0.16, delay: 0.06 });
    },
    trickBig: function () {
      tone(1046, 0.12, { vol: 0.15 });
      tone(1318, 0.12, { vol: 0.15, delay: 0.07 });
      tone(1760, 0.22, { vol: 0.17, delay: 0.14 });
      tone(2093, 0.28, { vol: 0.13, delay: 0.22 });
    },
    naming: function () {
      tone(523, 0.14, { type: 'triangle', vol: 0.15 });
      tone(659, 0.14, { type: 'triangle', vol: 0.15, delay: 0.09 });
      tone(784, 0.24, { type: 'triangle', vol: 0.16, delay: 0.18 });
    },
    ashur: function () {
      [1568, 1865, 2349].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.11, delay: i * 0.07 }));
    },
    roundWin: function () {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.16, delay: i * 0.11 }));
    },
    roundLose: function () {
      [392, 330, 262].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.13, delay: i * 0.13 }));
    },
    matchWin: function () {
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.24, { type: 'triangle', vol: 0.18, delay: i * 0.14 }));
      [1568, 2093].forEach((f, i) => tone(f, 0.5, { vol: 0.08, delay: 1.0 + i * 0.1 }));
    },
    matchLose: function () {
      [330, 294, 262, 196].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.14, delay: i * 0.18 }));
    },
    kabot: function () {
      [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.17, delay: i * 0.08 }));
      noise(0.5, { freq: 5000, vol: 0.05, delay: 0.4 });
    }
  };

  root.BLAudio = S;
})(typeof window !== 'undefined' ? window : globalThis);
