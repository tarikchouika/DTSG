/* ══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Audio Engine (Web Audio API)
   ═══════════════════════════════════════════ */
"use strict";
let audioContext = null;
/* ── الحصول على AudioContext مع معالجة الحالات ── */
function getAudioContext() {
  if (ST.mute) return null;
  if (!audioContext) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
    } catch (e) {
      console.warn('Audio not supported');
      return null;
    }
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}
/* ── توليد ضوضاء (Noise) ── */
function playNoise(duration, volume, type) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + white * 0.5362) * 0.11 * volume;
      }
    } else {
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * volume * (1 - i / length);
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch (e) {
    // صامت — لا نريد كسر اللعبة بسبب الصوت
  }
}
/* ── توليد نغمة (Tone) ── */
function playTone(freq, duration, type, volume, delay, pan) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const startTime = ctx.currentTime + (delay || 0);
    if (pan !== undefined && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      osc.connect(panner);
      panner.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(volume || 0.15, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
  } catch (e) {
    // صامت
  }
}
/* ── توليد كورد (Chord) ── */
function playChord(notes, duration, volume, delay) {
  notes.forEach((freq, i) => {
    playTone(
      freq,
      duration,
      'triangle',
      (volume || 0.1) / notes.length,
      (delay || 0) + i * 0.02
    );
  });
}
/* ── مكتبة الأصوات ── */
const SND = {
  /* ── أصوات الروندا المغربية التقليدية ── */
  ronda() {
    playChord([523, 659, 784, 1046], 0.3, 0.22);
    setTimeout(() => playChord([659, 830, 987, 1318], 0.35, 0.22), 150);
  },
  trenta() {
    playChord([440, 554, 659, 880], 0.4, 0.22);
    playNoise(0.2, 0.12, 'pink');
  },
  messa() {
    for (let i = 0; i < 6; i++) playTone(320 + i * 90, 0.05, 'triangle', 0.12, i * 0.035);
  },
  byebye() {
    playChord([587, 740, 880, 1174], 0.3, 0.2);
  },
  click() { playTone(700, 0.05, 'square', 0.07); },
  spin() { for (let i = 0; i < 12; i++) playTone(280 + i * 35, 0.03, 'square', 0.04, i * 0.05); },
  tick() { playTone(1100, 0.03, 'square', 0.05); },
  card() { playTone(950, 0.06, 'triangle', 0.14); playTone(1300, 0.08, 'triangle', 0.08, 0.04); },
  coin() { playTone(1250, 0.08, 'triangle', 0.14); playTone(1650, 0.1, 'triangle', 0.11, 0.06); },
  win() { playChord([523, 659, 784, 1046], 0.25, 0.2); },
  bigWin() { playChord([392, 523, 659, 784, 1046, 1318], 0.3, 0.2); },
  jackpot() { playChord([392, 523, 659, 784, 1046, 1318, 1568, 2093], 0.8, 0.3, 0.6); playNoise(0.5, 0.3, 'pink'); },
  lose() { playChord([320, 240, 170], 0.3, 0.06); },
  boom() { playNoise(0.45, 0.3); playTone(70, 0.4, 'sine', 0.2); playTone(50, 0.5, 'sine', 0.15, 0.1); },
  flip() { playTone(500, 0.07, 'sine', 0.12); playTone(800, 0.07, 'sine', 0.12, 0.07); },
  shuffle() { for (let i = 0; i < 10; i++) playTone(380 + i * 12, 0.04, 'triangle', 0.05, i * 0.04); },
  swap() { playTone(400, 0.12, 'sine', 0.1); playTone(600, 0.12, 'sine', 0.1, 0.1); playTone(800, 0.12, 'sine', 0.1, 0.2); },
  draw() { playTone(600, 0.06, 'triangle', 0.12); playTone(900, 0.06, 'triangle', 0.1, 0.06); },
  match() { playChord([523, 659, 784], 0.2, 0.18); },
  mismatch() { playTone(300, 0.15, 'sawtooth', 0.06); playTone(200, 0.2, 'sawtooth', 0.05, 0.12); },
  dice() { for (let i = 0; i < 6; i++) playTone(400 + Math.random() * 400, 0.05, 'square', 0.06, i * 0.06); },
  notify() { playTone(880, 0.08, 'sine', 0.1); playTone(1174, 0.12, 'sine', 0.09, 0.1); },
  /* نقر الكرة على جيوب الروليت — نغمة خفيفة سريعة */
  tickSoft() { playTone(1500 + Math.random() * 250, 0.03, 'sine', 0.045); },
  /* ارتطام الكرة بأوتاد البليينكو — خشخشة خشبية */
  peg() { playTone(520 + Math.random() * 90, 0.04, 'triangle', 0.05); },
  /* توقف بكرات الفواكه — كلانك معدني */
  reelStop() { playTone(180, 0.07, 'square', 0.05); playTone(95, 0.1, 'sine', 0.09, 0.01); },
  /* توزيع ورقة — حفيف خفيف مرتفع */
  deal() { playTone(700, 0.05, 'triangle', 0.09); playTone(1100, 0.06, 'triangle', 0.06, 0.04); },

  /* ══ [B9] أصوات ضاما المميزة لكل نوع حركة ══ */
  /* حركة هادئة لبيدق: انزلاق خشبي قصير بطرقة خفيفة */
  damaMove() { playNoise(0.05, 0.05, 'pink'); playTone(210, 0.06, 'sine', 0.14); playTone(140, 0.05, 'sine', 0.08, 0.03); },
  /* حركة هادئة للضائمة (الملك): أثقل وأعمق — طيران أطول */
  damaKingMove() { playNoise(0.09, 0.06, 'pink'); playTone(150, 0.1, 'sine', 0.16); playTone(98, 0.08, 'sine', 0.09, 0.04); },
  /* قفزة أكل: ارتطام عميق + طقطقة الضحية */
  damaCapture() { playTone(95, 0.11, 'sine', 0.2); playTone(230, 0.05, 'triangle', 0.12, 0.02); playNoise(0.08, 0.09); },
  /* ضحايا متتالية في السلسلة: نغمة ترتفع مع كل ضحية */
  damaChain(n) { var k = (n || 0) % 6; playTone(95 + k * 26, 0.1, 'sine', 0.18); playTone(230 + k * 40, 0.05, 'triangle', 0.1, 0.02); playNoise(0.07, 0.08); },
  /* تتويج ضائمة: رنّة تتويج صاعدة */
  damaKing() { playChord([523, 659, 784], 0.22, 0.16); playTone(1046, 0.32, 'triangle', 0.1, 0.12); playTone(1318, 0.3, 'sine', 0.07, 0.22); },
  /* انتظار التتويج المؤجل: نغمة توقّف هادئة */
  damaPending() { playTone(392, 0.14, 'sine', 0.09); playTone(330, 0.18, 'sine', 0.07, 0.1); },

  /* ══ [B10] أصوات الشطرنج المميزة ══ */
  /* حركة هادئة: طرقة خشبية ناعمة */
  chessMove() { playNoise(0.04, 0.045, 'pink'); playTone(230, 0.05, 'sine', 0.13); playTone(150, 0.04, 'sine', 0.07, 0.03); },
  /* أكل: ارتطام أعمق وطقطقة القطعة المأكولة */
  chessCapture() { playTone(120, 0.09, 'sine', 0.2); playNoise(0.07, 0.09); playTone(260, 0.04, 'triangle', 0.1, 0.02); },
  /* تبييت: طرقتان متتاليتان للملك والرخ */
  chessCastle() { playTone(210, 0.05, 'sine', 0.12); playTone(180, 0.06, 'sine', 0.12, 0.09); },
  /* كش: تنبيه حاد مزدوج */
  chessCheck() { playTone(880, 0.08, 'square', 0.07); playTone(660, 0.11, 'square', 0.06, 0.09); },
  /* ترقية: رنّة صاعدة */
  chessPromote() { playChord([523, 659, 784], 0.22, 0.16); playTone(1046, 0.3, 'triangle', 0.09, 0.12); },
  /* نهاية الجولة */
  chessEnd() { playChord([392, 523, 659, 784], 0.5, 0.2); },

  /* ══ [PR-SND] أصوات بارتشي المميزة لكل حركة ══ */
  /* رمية النرد: خشخشة مكعبات على الخشب — أثقل من dice العام */
  prDice() { for (let i = 0; i < 7; i++) playTone(300 + Math.random() * 350, 0.045, 'square', 0.07, i * 0.05); playNoise(0.12, 0.06, 'pink'); playTone(140, 0.09, 'sine', 0.1, 0.3); },
  /* بداية تحريك بيدق: انزلاق خشبي ناعم */
  prMove() { playNoise(0.05, 0.045, 'pink'); playTone(330, 0.06, 'sine', 0.11); playTone(220, 0.05, 'sine', 0.07, 0.04); },
  /* خطوة بين خانتين: طقطقة خفيفة جداً */
  prStep() { playTone(290 + Math.random() * 70, 0.03, 'triangle', 0.045); },
  /* دخول بيدق للعبة (من البيت إلى الساليدة): نغمة صعود مفتوحة */
  prEnter() { playTone(392, 0.09, 'triangle', 0.13); playTone(523, 0.1, 'triangle', 0.11, 0.08); playTone(659, 0.12, 'sine', 0.09, 0.16); },
  /* قتل: ارتطام عميق + سقوط الضحية بنغمة هابطة */
  prCapture() { playTone(100, 0.13, 'sine', 0.22); playNoise(0.1, 0.11); playTone(600, 0.1, 'sawtooth', 0.07, 0.08); playTone(380, 0.12, 'sawtooth', 0.06, 0.18); playTone(220, 0.16, 'sawtooth', 0.05, 0.3); },
  /* إنهاء بيدق للدورة (الوصول للمركز): رنّة احتفالية صاعدة */
  prFinish() { playChord([523, 659, 784, 1046], 0.32, 0.18); playTone(1318, 0.28, 'triangle', 0.09, 0.16); playTone(1568, 0.24, 'sine', 0.06, 0.3); }
};
/* ── كتم / تشغيل الصوت ── */
function syncMuteBtns() {
  const btns = document.querySelectorAll('#muteBtn, .sound-btn');
  btns.forEach(function (btn) {
    btn.setAttribute('aria-pressed', ST.mute ? 'true' : 'false');
    btn.classList.toggle('active', ST.mute);
    const ico = btn.querySelector('i');
    if (ico) {
      ico.className = ST.mute ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    }
  });
  /* زر الهيدر هو مصدر الصوت الوحيد: ينعكس أيضاً على روندا الكلاسيكية */
  if (typeof window !== 'undefined' && window.RondaAudio && window.RondaAudio.setMuted) {
    try { window.RondaAudio.setMuted(!!ST.mute); } catch (e) { /* تجاهل */ }
  }
}
function toggleMute() {
  ST.mute = !ST.mute;
  sSet('rc_mute', ST.mute ? '1' : '0');
  syncMuteBtns();
  if (!ST.mute) SND.click();
}
/* ── Export to global ────────────────── */
window.SND = SND;
window.toggleMute = toggleMute;
window.getAudioContext = getAudioContext;