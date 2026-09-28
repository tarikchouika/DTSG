/* ════════════════════════════════════════════════════════════════════
   UNAudio — مؤثرات أونو (Web Audio — بلا ملفات صوت)
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  let ctx = null;
  let muted = false;

  function ac() {
    if (muted) return null;
    try {
      if (!ctx) ctx = new (root.AudioContext || root.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function tone(freq, dur, type, delay, vol) {
    const c = ac(); if (!c) return;
    try {
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(vol || 0.18, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }

  root.UNAudio = {
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; },
    click: function () { tone(520, 0.05, 'triangle', 0, 0.12); },
    play: function () { tone(420, 0.07, 'triangle', 0, 0.16); tone(560, 0.06, 'triangle', 0.05, 0.12); },
    draw: function () { tone(250, 0.09, 'sine', 0, 0.16); },
    action: function () { tone(300, 0.12, 'sawtooth', 0, 0.14); tone(440, 0.1, 'sawtooth', 0.08, 0.12); },
    uno: function () { tone(620, 0.1, 'square', 0, 0.16); tone(830, 0.16, 'square', 0.1, 0.16); },
    roundWin: function () { [392, 494, 587].forEach(function (f, i) { tone(f, 0.14, 'sine', i * 0.09, 0.16); }); },
    matchWin: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.16, 'sine', i * 0.11, 0.18); }); },
    matchLose: function () { [330, 262, 196].forEach(function (f, i) { tone(f, 0.18, 'sine', i * 0.12, 0.14); }); },
    error: function () { tone(180, 0.12, 'square', 0, 0.12); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
