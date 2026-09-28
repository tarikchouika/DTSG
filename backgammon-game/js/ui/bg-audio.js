/**
 * ============================================================================
 *  BgAudio — مؤثرات الطاولة (Web Audio بلا ملفات)
 *  الشخصية الصوتية: جوز فاخر — طرق أحجار خشبية، نرد يتدحرج، فانفار نحاسي
 * ============================================================================
 */
(function (root) {
  'use strict';

  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) { try { ctx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { ctx = null; } }
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

  function noise(dur, vol, delay, lp) {
    const c = ac(); if (!c || muted) return;
    const t0 = c.currentTime + (delay || 0);
    const n = Math.floor(c.sampleRate * (dur || 0.1));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 2400;
    const g = c.createGain(); g.gain.setValueAtTime(vol || 0.07, t0);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0);
  }

  function chord(freqs, dur, vol, delay) {
    (freqs || []).forEach((f, i) => tone(f, dur, 'triangle', vol, (delay || 0) + i * 0.012));
  }

  const SFX = {
    click() { tone(760, 0.04, 'square', 0.04); },
    /** نرد يتدحرج على الخشب */
    dice() { for (let i = 0; i < 7; i++) noise(0.045, 0.05, i * 0.055, 1900); tone(230, 0.05, 'sine', 0.05, 0.3); },
    /** حجر يُنقل */
    move() { tone(320, 0.06, 'triangle', 0.09); noise(0.04, 0.05, 0.01, 1400); },
    /** ضرب! حجر للأدمن */
    hit() { tone(160, 0.12, 'sine', 0.16); noise(0.09, 0.08, 0, 1100); tone(120, 0.16, 'sine', 0.08, 0.03); },
    /** إخراج حجر — نقرة جيب */
    bear() { tone(540, 0.06, 'triangle', 0.09); tone(760, 0.08, 'triangle', 0.07, 0.05); },
    /** إدخال من الأدمن */
    enter() { tone(260, 0.08, 'triangle', 0.1); tone(390, 0.1, 'triangle', 0.08, 0.07); },
    /** لا حركة — طرقتان */
    noMoves() { tone(180, 0.08, 'sine', 0.1); tone(180, 0.1, 'sine', 0.09, 0.14); },
    /** فوز لعبة */
    winGame() { chord([523, 659, 784], 0.22, 0.1); },
    /** فوز مباراة — نحاسي فاخر */
    winMatch() { chord([523, 659, 784, 1046], 0.3, 0.13); chord([659, 784, 1046, 1318], 0.34, 0.11, 0.18); },
    lose() { chord([330, 262, 196], 0.3, 0.06); },
    notify() { tone(920, 0.07, 'sine', 0.07); tone(1230, 0.1, 'sine', 0.06, 0.09); },
    error() { tone(185, 0.14, 'sawtooth', 0.05); },

    setMuted(m) { muted = !!m; },
    isMuted() { return muted; }
  };

  root.BgAudio = SFX;
})(typeof self !== 'undefined' ? self : this);
