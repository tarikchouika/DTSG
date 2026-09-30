/**
 * ============================================================================
 *  RondaAudio — مؤثرات صوتية مولدة بالكامل عبر Web Audio API
 *  (بدون أي ملفات خارجية — تعمل أوفلاين)
 * ============================================================================
 */
(function (root) {
  'use strict';

  const RondaAudio = {
    ctx: null,
    master: null,
    muted: false,

    init: function () {
      if (this.ctx) return;
      try {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch (e) { /* الصوت غير متاح */ }
    },

    resume: function () {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setMuted: function (m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.5;
    },

    /** نغمة أساسية */
    tone: function (freq, dur, opts) {
      if (!this.ctx || this.muted) return;
      const o = opts || {};
      const t0 = this.ctx.currentTime + (o.delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.glide), t0 + dur);
      const vol = o.vol || 0.2;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain); gain.connect(this.master);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    },

    /** ضجيج مفلتر (لحركة الأوراق) */
    noise: function (dur, opts) {
      if (!this.ctx || this.muted) return;
      const o = opts || {};
      const t0 = this.ctx.currentTime + (o.delay || 0);
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = o.hp ? 'highpass' : 'lowpass';
      filter.frequency.value = o.freq || 1800;
      const gain = this.ctx.createGain();
      gain.gain.value = o.vol || 0.25;
      src.connect(filter); filter.connect(gain); gain.connect(this.master);
      src.start(t0);
    },

    /* ---------------- المؤثرات المركبة ---------------- */

    /** نقر زر */
    click: function () {
      this.resume();
      this.tone(660, 0.06, { type: 'triangle', vol: 0.12 });
    },

    /** لعب ورقة */
    flip: function (delay) {
      this.resume();
      this.noise(0.09, { freq: 2400, hp: true, vol: 0.22, delay: delay || 0 });
      this.tone(340, 0.08, { type: 'triangle', vol: 0.08, glide: 220, delay: delay || 0 });
    },

    /** توزيع */
    deal: function () {
      this.resume();
      for (let i = 0; i < 4; i++) {
        this.noise(0.06, { freq: 2600, hp: true, vol: 0.14, delay: i * 0.09 });
      }
    },

    /** التقاط أوراق — عدد الأوراق يحدد ثراء الصوت */
    capture: function (count) {
      this.resume();
      this.tone(520, 0.14, { type: 'triangle', vol: 0.22, glide: 240 });
      this.noise(0.12, { freq: 1500, vol: 0.18 });
      const notes = [784, 988, 1175, 1319, 1568];
      const n = Math.min(5, Math.max(1, (count || 1) - 1));
      for (let i = 0; i < n; i++) {
        this.tone(notes[i], 0.16, { vol: 0.13, delay: 0.06 + i * 0.055 });
      }
    },

    /** ضربة */
    strike: function () {
      this.resume();
      this.tone(880, 0.1, { type: 'square', vol: 0.1 });
      this.tone(1320, 0.18, { vol: 0.2, delay: 0.07 });
    },

    /** حبل */
    rope: function () {
      this.resume();
      this.tone(784, 0.12, { vol: 0.18 });
      this.tone(1046, 0.14, { vol: 0.18, delay: 0.1 });
      this.tone(1318, 0.2, { vol: 0.16, delay: 0.2 });
    },

    /** جوج حبال */
    doubleRope: function () {
      this.resume();
      [659, 784, 988, 1318].forEach((f, i) => {
        this.tone(f, 0.22, { vol: 0.18, delay: i * 0.11 });
      });
      this.tone(1568, 0.4, { vol: 0.14, delay: 0.44 });
    },

    /** ميسا */
    mesa: function () {
      this.resume();
      [523, 659, 784].forEach((f, i) => this.tone(f, 0.3, { vol: 0.14, delay: i * 0.03 }));
    },

    /** إعلان روندا/تريندا */
    declare: function (big) {
      this.resume();
      this.tone(988, 0.16, { vol: 0.16 });
      this.tone(1244, 0.22, { vol: big ? 0.18 : 0.12, delay: 0.12 });
      if (big) this.tone(1480, 0.3, { vol: 0.14, delay: 0.26 });
    },

    /** قاعا */
    qa3a: function () {
      this.resume();
      this.tone(392, 0.24, { type: 'triangle', vol: 0.18 });
      this.tone(587, 0.3, { vol: 0.16, delay: 0.14 });
      this.tone(880, 0.36, { vol: 0.14, delay: 0.3 });
    },

    /** فوز بالمباراة */
    win: function () {
      this.resume();
      const seq = [523, 659, 784, 1046, 784, 1046, 1318];
      seq.forEach((f, i) => this.tone(f, 0.28, { vol: 0.17, delay: i * 0.13 }));
      this.tone(1568, 0.6, { vol: 0.12, delay: seq.length * 0.13 });
    },

    /** خسارة */
    lose: function () {
      this.resume();
      [523, 466, 392, 311].forEach((f, i) => this.tone(f, 0.32, { type: 'triangle', vol: 0.14, delay: i * 0.17 }));
    }
  };

  root.RondaAudio = RondaAudio;
})(typeof self !== 'undefined' ? self : this);
