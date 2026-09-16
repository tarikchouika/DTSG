/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Visual Effects Engine
   ═══════════════════════════════════════════ */
"use strict";
let fxCanvas = null;
let fxCtx = null;
let particles = [];
/* ── تهيئة Canvas التأثيرات ── */
function fxInit() {
  fxCanvas = document.getElementById('fxCanvas');
  if (!fxCanvas) return;
  fxCtx = fxCanvas.getContext('2d');
  function resize() {
    fxCanvas.width = window.innerWidth;
    fxCanvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);
  /* حلقة الرسم */
  function loop() {
    if (!fxCtx) return;
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += (p.grav !== undefined ? p.grav : 0.05);
      p.rotation += p.vr;
      if (p.life !== undefined) {
        p.life--;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
      }
      fxCtx.save();
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate(p.rotation);
      fxCtx.fillStyle = p.color;
      if (p.shape === 'circle') {
        fxCtx.beginPath();
        fxCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        fxCtx.fill();
      } else if (p.shape === 'coin') {
        fxCtx.beginPath();
        fxCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        fxCtx.fill();
        fxCtx.fillStyle = 'rgba(120, 80, 0, 0.55)';
        fxCtx.fillRect(-p.size / 2, -p.size * 0.18, p.size, p.size * 0.36);
        fxCtx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        fxCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.22);
      } else {
        fxCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      }
      fxCtx.restore();
      if (p.y > fxCanvas.height + 30) {
        particles.splice(i, 1);
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
/* ── إطلاق Confetti ── */
function confetti(count) {
  const colors = ['#F5C518', '#FFD93D', '#1A6CF6', '#10B981', '#EF4444', '#A78BFA'];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * fxCanvas.width,
      y: -20 - Math.random() * 80,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      size: 4 + Math.random() * 5,
      color: colors[i % colors.length],
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3
    });
  }
}
/* ── وميض الشاشة ── */
function flash() {
  const el = document.getElementById('flash');
  if (!el) return;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}
/* ── احتفال بالفوز ── */
function celebrate(isBig) {
  if (isBig) {
    SND.bigWin();
    confetti(140);
    flash();
  } else {
    SND.win();
    confetti(60);
  }
}
/* ── تنظيف التأثيرات ── */
function clearFX() {
  particles = [];
  if (fxCtx && fxCanvas) {
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  }
}
/* ── هز عنصر (Shake) ── */
function shake(el, intensity, duration) {
  if (!el) return;
  const i = intensity || 6;
  const dur = duration || 400;
  const start = performance.now();
  function step(now) {
    const t = (now - start) / dur;
    if (t >= 1) {
      el.style.transform = '';
      return;
    }
    const damp = 1 - t;
    el.style.transform = 'translate(' +
      (Math.random() * 2 - 1) * i * damp + 'px,' +
      (Math.random() * 2 - 1) * i * damp + 'px)';
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
/* ── انفجار جسيمات في نقطة (Burst) ── */
function burst(x, y, colors, count, speed) {
  if (!fxCanvas) return;
  const cs = colors || ['#F5C518', '#FFD93D', '#FFFFFF'];
  const n = count || 26;
  const sp = speed || 6;
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const v = sp * (0.3 + Math.random() * 0.9);
    particles.push({
      x: x, y: y,
      vx: Math.cos(ang) * v,
      vy: Math.sin(ang) * v,
      size: 3 + Math.random() * 4,
      color: cs[i % cs.length],
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
      shape: 'circle',
      grav: 0.06,
      life: 40 + Math.random() * 30
    });
  }
}
/* ── مطر عملات ذهبية (Coin Rain) ── */
function coinRain(n) {
  if (!fxCanvas) return;
  const c = n || 20;
  for (let i = 0; i < c; i++) {
    particles.push({
      x: Math.random() * fxCanvas.width,
      y: -30 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 3 + Math.random() * 3,
      size: 7 + Math.random() * 5,
      color: Math.random() > 0.35 ? '#F5C518' : '#FFD93D',
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.2,
      shape: 'coin'
    });
  }
}
/* ── عدّاد متحرك (Count Up) ── */
function countUp(el, from, to, duration, fmtFn) {
  if (!el) return;
  const dur = duration || 900;
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(from + (to - from) * eased);
    el.textContent = fmtFn ? fmtFn(val) : String(val);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
