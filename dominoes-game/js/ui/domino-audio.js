/**
 * ============================================================================
 *  DominoAudio — مؤثرات صوتية للضومنة (Web Audio بلا ملفات)
 *  نفس منهجية RondaAudio: نغمات مركّبة آنيًا + كتم مربوط بالمنصة (ST.mute)
 *  الشخصية الصوتية: «قهاوة» — خشبية دافئة، نقرات عاجية، وسقط ماء للسحب
 * ============================================================================
 */
(function (root) {
  'use strict';

  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      try { ctx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  function tone(freq, dur, type, vol, delay) {
    const c = ac(); if (!c || muted) return;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol || 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.1));
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + (dur || 0.1) + 0.03);
  }

  function noise(dur, vol, delay, hp) {
    const c = ac(); if (!c || muted) return;
    const t0 = c.currentTime + (delay || 0);
    const n = Math.floor(c.sampleRate * (dur || 0.1));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 900;
    const g = c.createGain(); g.gain.setValueAtTime(vol || 0.06, t0);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0);
  }

  function chord(freqs, dur, vol, delay) {
    (freqs || []).forEach((f, i) => tone(f, dur, 'triangle', vol, (delay || 0) + i * 0.012));
  }

  const SFX = {
    /** نقر عاجي — اختيار قطعة */
    click() { tone(820, 0.045, 'square', 0.045); },
    /** ارتطام قطعة على الخشب */
    place() { tone(190, 0.09, 'sine', 0.14); noise(0.05, 0.05, 0, 1400); tone(320, 0.05, 'triangle', 0.07, 0.01); },
    /** سحب من البنك — حفيف ثم سقوط */
    draw() { noise(0.08, 0.045, 0, 1600); tone(520, 0.06, 'triangle', 0.07, 0.06); },
    /** تمرير الدور — نفخة منخفضة */
    pass() { tone(240, 0.16, 'sine', 0.07); tone(180, 0.2, 'sine', 0.05, 0.08); },
    /** انسداد — ضربتان على الطاولة */
    blocked() { tone(150, 0.1, 'sine', 0.13); tone(150, 0.12, 'sine', 0.12, 0.16); },
    /** نهاية جولة بربح */
    winRound() { chord([523, 659, 784], 0.22, 0.1); },
    /** فوز المباراة — فانفار قهاوي */
    winMatch() { chord([523, 659, 784, 1046], 0.3, 0.13); chord([659, 784, 1046, 1318], 0.34, 0.11, 0.18); noise(0.25, 0.04, 0.05, 2200); },
    /** خسارة */
    lose() { chord([330, 262, 196], 0.3, 0.06); },
    /** خلط البنك */
    shuffle() { for (let i = 0; i < 9; i++) noise(0.03, 0.035, i * 0.045, 1800); },
    /** تنبيه (دورك / لازم تسحب) */
    notify() { tone(940, 0.07, 'sine', 0.07); tone(1240, 0.1, 'sine', 0.06, 0.09); },
    /** خطأ — حركة غير قانونية */
    error() { tone(190, 0.14, 'sawtooth', 0.05); },

    setMuted(m) { muted = !!m; },
    isMuted() { return muted; }
  };

  root.DominoAudio = SFX;
})(typeof self !== 'undefined' ? self : this);
