/* ══════════════════════════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Crash Engine v2 (Three.js + 3D Plane)
   ═══════════════════════════════════════════════════════════════ */
"use strict";

import * as THREE from 'three';
const { gFrame, betRow, take, give, gres, winFX, shake } = window;
const { ST, fairTick, celebrate, fmt, T, SND, flash } = window;

// ── حالة Crash ───────────────────────────────────────────────
let cPhase = 0;
let cMult = 1;
let cPts = [];
let cAnimId = null;
let cHist = [2.14, 1.02, 7.8, 1.45, 3.2, 12.5, 1.8, 2.63, 1.12, 4.4, 6.9, 1.35, 8.2, 2.1, 15.3, 1.05, 3.8, 5.4, 1.9, 2.3];

// Three.js objects
let renderer, scene, camera, plane, trailParticles, explosionParticles;
let elapsed = 0;
let startTime = 0;
let isAnimating = false;
/* الجولة الجماعية: الطيران يقاد من started_at الخادمي، والانفجار من الخادم */
let avStartedAt = 0;   // مللي ثانية (خادمية) — نقطة بداية الطيران
let crashAt = 0;       // قيمة الانفجار في الجولة الحالية (من الخادم)
let cCashered = 0;     // مبلغ السحب في الجولة الحالية (إن سحبت)
let cCashMult = 0;     // مضاعف السحب

// ── بناء واجهة Crash ─────────────────────────────────────────
export function eCrash(g) {
  return gFrame(
    '<div id="gpanel"></div>' +
    '<div class="chist" id="cHist"></div>' +
    '<div class="crash-3d-container" id="crash3d">' +
      '<canvas id="cChart" width="640" height="180"></canvas>' +
    '</div>' +
    '<div class="cmult-wrap">' +
      '<div class="cmult" id="cM">1.00×</div>' +
      '<div class="cwin" id="cWin"></div>' +
    '</div>' +
    '<div class="bets">' +
      '<button class="big" id="cStart" onclick="crashGo()"> ' + T('g.start') + '</button>' +
      '<button class="big" id="cCash" onclick="crashOut()" disabled style="background:linear-gradient(135deg,#10B981,#34D399);color:#fff"> ' + T('g.cash') + '</button>' +
    '</div>' +
    betRow(),
    g
  );
}

// ── تهيئة Three.js ───────────────────────────────────────────
async function initCrashThree() {
  const container = document.getElementById('crash3d');
  if (!container) return;

  try {
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0e1a, 0.002);

  // Camera
  camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(0, 5, 15);
  camera.lookAt(0, 0, 0);

  // Lighting
  const ambient = new THREE.AmbientLight(0x404060, 0.5);
  scene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xffddaa, 1.5);
  sunLight.position.set(10, 20, 10);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  scene.add(sunLight);

  const glowLight = new THREE.PointLight(0xf5c518, 2, 30);
  glowLight.position.set(0, 3, 0);
  scene.add(glowLight);

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(100, 100);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0f1524,
    roughness: 0.8,
    metalness: 0.2
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid helper
  const grid = new THREE.GridHelper(100, 50, 0x1a6cf6, 0x0f1524);
  grid.material.opacity = 0.15;
  grid.material.transparent = true;
  scene.add(grid);

  // Build plane
  await buildPlane();

  // حارس: cleanupCrash() قد يُستدعى أثناء الـ await (إغلاق سريع للصفحة)
  if (!scene) return;

  // Trail particles
  createTrailSystem();

  // Explosion particles
  createExplosionSystem();

  // Resize handler
  window.addEventListener('resize', onCrashResize);

  // Start render loop
  animateCrash();
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('Crash 3D init failed:', e && e.message);
  }
}

// ── بناء الطائرة 3D ──────────────────────────────────────────
async function buildPlane() {
  const planeGroup = new THREE.Group();

  // Body
  const bodyGeo = new THREE.CapsuleGeometry(0.5, 2, 8, 16);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf5c518,
    metalness: 0.7,
    roughness: 0.2,
    emissive: 0x332200,
    emissiveIntensity: 0.3
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  planeGroup.add(body);

  // Wings
  const wingGeo = new THREE.BoxGeometry(4, 0.1, 1.5);
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xd4a82a,
    metalness: 0.5,
    roughness: 0.3
  });
  const wings = new THREE.Mesh(wingGeo, wingMat);
  wings.position.y = 0.2;
  wings.castShadow = true;
  planeGroup.add(wings);

  // Tail
  const tailGeo = new THREE.ConeGeometry(0.3, 1, 8);
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xd4a82a,
    metalness: 0.5,
    roughness: 0.3
  });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -1.5;
  tail.position.y = 0.3;
  tail.castShadow = true;
  planeGroup.add(tail);

  // Engine glow
  const engineLight = new THREE.PointLight(0xff8800, 1, 10);
  engineLight.position.set(0, 0, -2);
  planeGroup.add(engineLight);

  // Propeller (animated)
  const propGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.5, 16);
  const propMat = new THREE.MeshBasicMaterial({
    color: 0x333333,
    transparent: true,
    opacity: 0.6
  });
  const propeller = new THREE.Mesh(propGeo, propMat);
  propeller.position.z = 2.2;
  propeller.rotation.x = Math.PI / 2;
  planeGroup.add(propeller);

  planeGroup.userData = { propeller, engineLight, glowLight: engineLight };
  plane = planeGroup;
  scene.add(plane);

  // Initial position
  plane.position.set(0, 2, 0);
  plane.rotation.x = -0.1;
}

// ── نظام أثر الدخان (Trail) ─────────────────────────────────
function createTrailSystem() {
  const trailCount = 200;
  const trailGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(trailCount * 3);
  const alphas = new Float32Array(trailCount);
  const sizes = new Float32Array(trailCount);

  for (let i = 0; i < trailCount; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    alphas[i] = 0;
    sizes[i] = 0.3 + Math.random() * 0.4;
  }

  trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  trailGeo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  trailGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const trailMat = new THREE.PointsMaterial({
    size: 0.5,
    vertexColors: false,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  trailParticles = new THREE.Points(trailGeo, trailMat);
  scene.add(trailParticles);
  trailParticles.userData = { positions, alphas, sizes, index: 0 };
}

// ── نظام الانفجار ────────────────────────────────────────────
function createExplosionSystem() {
  const expCount = 500;
  const expGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(expCount * 3);
  const velocities = new Float32Array(expCount * 3);
  const alphas = new Float32Array(expCount);
  const sizes = new Float32Array(expCount);
  const colors = new Float32Array(expCount * 3);

  for (let i = 0; i < expCount; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    velocities[i * 3] = (Math.random() - 0.5) * 0.5;
    velocities[i * 3 + 1] = Math.random() * 0.3;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    alphas[i] = 0;
    sizes[i] = 0.2 + Math.random() * 0.5;
    const colorChoice = Math.random();
    if (colorChoice < 0.4) {
      colors[i * 3] = 1; colors[i * 3 + 1] = 0.8; colors[i * 3 + 2] = 0.1;
    } else if (colorChoice < 0.7) {
      colors[i * 3] = 1; colors[i * 3 + 1] = 0.4; colors[i * 3 + 2] = 0;
    } else {
      colors[i * 3] = 0.9; colors[i * 3 + 1] = 0.1; colors[i * 3 + 2] = 0.1;
    }
  }

  expGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  expGeo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
  expGeo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  expGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  expGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const expMat = new THREE.PointsMaterial({
    size: 0.4,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  explosionParticles = new THREE.Points(expGeo, expMat);
  explosionParticles.visible = false;
  scene.add(explosionParticles);
  explosionParticles.userData = { positions, velocities, alphas, sizes, active: false, time: 0 };
}

// ── حلقة الرسم ───────────────────────────────────────────────
function animateCrash() {
  if (!renderer) return;
  requestAnimationFrame(animateCrash);

  const time = performance.now() * 0.001;

  // Propeller spin
  if (plane && plane.userData.propeller) {
    plane.userData.propeller.rotation.x += 0.5;
  }

  // Engine light flicker
  if (plane && plane.userData.engineLight) {
    plane.userData.engineLight.intensity = 1 + Math.sin(time * 50) * 0.3;
  }

  // Update trail
  updateTrail();

  // Update explosion
  updateExplosion(time);

  // Camera follow plane during flight
  if (cPhase === 1 && plane) {
    const targetX = plane.position.x;
    const targetY = plane.position.y + 3;
    const targetZ = plane.position.z + 10;
    camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.05);
    camera.lookAt(plane.position.x, plane.position.y, plane.position.z);
  }

  renderer.render(scene, camera);
}

// ── تحديث أثر الدخان ────────────────────────────────────────
function updateTrail() {
  if (!trailParticles || cPhase !== 1 || !plane) return;

  const { positions, alphas, sizes, index } = trailParticles.userData;
  const trailCount = positions.length / 3;

  // Add new particle at plane position
  const i = index % trailCount;
  positions[i * 3] = plane.position.x + (Math.random() - 0.5) * 0.5;
  positions[i * 3 + 1] = plane.position.y + (Math.random() - 0.5) * 0.3;
  positions[i * 3 + 2] = plane.position.z + (Math.random() - 0.5) * 0.5;
  alphas[i] = 1;
  sizes[i] = 0.3 + Math.random() * 0.4;

  trailParticles.userData.index = (index + 1) % trailCount;

  // Fade old particles
  for (let j = 0; j < trailCount; j++) {
    if (alphas[j] > 0) {
      alphas[j] *= 0.98;
      positions[j * 3 + 1] -= 0.01;
    }
  }

  trailParticles.geometry.attributes.position.needsUpdate = true;
  trailParticles.geometry.attributes.alpha.needsUpdate = true;
  trailParticles.geometry.attributes.size.needsUpdate = true;
}

// ── تحديث الانفجار ──────────────────────────────────────────
function updateExplosion(time) {
  if (!explosionParticles || !explosionParticles.userData.active) return;

  const { positions, velocities, alphas, sizes, time: expTime } = explosionParticles.userData;
  const expCount = positions.length / 3;
  const dt = Math.min(0.033, time - expTime);
  explosionParticles.userData.time = time;

  let allDead = true;
  for (let i = 0; i < expCount; i++) {
    if (alphas[i] > 0) {
      allDead = false;
      positions[i * 3] += velocities[i * 3] * dt * 60;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt * 60;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt * 60;
      velocities[i * 3 + 1] -= 0.01 * dt * 60;
      alphas[i] -= 0.01 * dt * 60;
      sizes[i] *= 1.01;
    }
  }

  if (allDead) {
    explosionParticles.visible = false;
    explosionParticles.userData.active = false;
    plane.visible = true;
    trailParticles.visible = true;
  }

  explosionParticles.geometry.attributes.position.needsUpdate = true;
  explosionParticles.geometry.attributes.alpha.needsUpdate = true;
  explosionParticles.geometry.attributes.size.needsUpdate = true;
}

// ── تشغيل الانفجار ──────────────────────────────────────────
function triggerExplosion() {
  if (!explosionParticles || !plane) return;

  const { positions, velocities, alphas, sizes } = explosionParticles.userData;
  const expCount = positions.length / 3;

  for (let i = 0; i < expCount; i++) {
    positions[i * 3] = plane.position.x + (Math.random() - 0.5) * 2;
    positions[i * 3 + 1] = plane.position.y + (Math.random() - 0.5) * 2;
    positions[i * 3 + 2] = plane.position.z + (Math.random() - 0.5) * 2;
    velocities[i * 3] = (Math.random() - 0.5) * 0.8;
    velocities[i * 3 + 1] = Math.random() * 0.5 + 0.2;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
    alphas[i] = 1;
    sizes[i] = 0.2 + Math.random() * 0.5;
  }

  explosionParticles.visible = true;
  explosionParticles.userData.active = true;
  explosionParticles.userData.time = performance.now() * 0.001;

  plane.visible = false;
  trailParticles.visible = false;
}

// ── Resize ───────────────────────────────────────────────────
function onCrashResize() {
  const container = document.getElementById('crash3d');
  if (!container || !renderer || !camera) return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

// ── عرض التاريخ ──────────────────────────────────────────────
function cHistRender() {
  const e = document.getElementById('cHist');
  if (!e) return;
  e.innerHTML = cHist.slice(0, 12).map(function(m) {
    let col = m < 2 ? 'rgba(239,68,68,.25)' :
              m < 5 ? 'rgba(245,197,24,.25)' :
              m < 15 ? 'rgba(124,58,237,.25)' :
              'rgba(16,185,129,.25)';
    return '<span style="background:' + col + ';border:1px solid rgba(255,255,255,.1)">' + m.toFixed(2) + '×</span>';
  }).join('');
}

// ── لون المضاعف الديناميكي ───────────────────────────────────
function cMultColor(m) {
  if (m < 2) return '#4ADE80';
  if (m < 5) return '#F5C518';
  if (m < 15) return '#A78BFA';
  return '#F87171';
}

// ── رسم المنحنى الحي (Chart) ─────────────────────────────────
function cChartDraw() {
  const cv = document.getElementById('cChart');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);

  const pts = cPts;
  if (pts.length < 2) return;

  // المقياس اللوغاريتمي: النمو الأسي يُعرض كخط مستقيم تصاعدي
  const endVal = cPhase === 2 ? crashAt : pts[pts.length - 1];
  const maxM = Math.max(2, endVal * 1.08);

  const yOf = m => H - 8 - (Math.log(m) / Math.log(maxM)) * (H - 24);

  // ── شبكة مستويات ×2 ×5 ×10 ×20 ×50
  ctx.font = 'bold 10px "Segoe UI",sans-serif';
  ctx.textAlign = 'left';
  const levels = [2, 5, 10, 20, 50];
  for (const lv of levels) {
    if (lv > maxM * 0.98) continue;
    const y = Math.round(yOf(lv)) + 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(lv + '×', 6, y - 3);
  }

  // ── التعبئة المتدرجة تحت المنحنى
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(245,197,24,0.28)');
  grad.addColorStop(1, 'rgba(245,197,24,0)');
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let i = 0; i < pts.length; i++) {
    const x = (i / (pts.length - 1)) * W;
    ctx.lineTo(x, yOf(pts[i]));
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // ── خط المنحنى الذهبي المتوهج
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = (i / (pts.length - 1)) * W;
    const y = yOf(pts[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#F5C518';
  ctx.lineWidth = 2.6;
  ctx.shadowColor = 'rgba(245,197,24,0.8)';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ── نقطة النهاية (حية أو تحطم)
  const ex = W - 2;
  const ey = yOf(endVal);
  if (cPhase === 2) {
    // خط التحطم الأحمر المتقطع
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(248,113,113,0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, ey);
    ctx.lineTo(W, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#F87171';
  } else {
    ctx.fillStyle = '#F5C518';
  }
  ctx.shadowColor = 'rgba(248,113,113,0.9)';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(ex, ey, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

// ── بدء الجولة: رهان جماعي عبر الخادم ────────────────────────
export function crashGo() {
  if (cPhase !== 0) return;
  const btn = document.getElementById('cStart');
  if (btn) btn.disabled = true;
  SND.click();
  API.post('/api/games/av/bet', { amount: GB }).then(function (r) {
    if (!r.ok || !r.data || !r.data.ok) {
      const msg = (r.data && r.data.message) || T('auth.error');
      toast(msg, 'err');
      SND.lose();
      if (btn) btn.disabled = false;
      if (typeof Group !== 'undefined' && Group.setGold && typeof r.data.gold === 'number') Group.setGold(r.data.gold);
      return;
    }
    /* الرصيد يتحدث حصرياً من السيرفر */
    if (typeof Group !== 'undefined' && Group.setGold && typeof r.data.gold === 'number') Group.setGold(r.data.gold);
    cPhase = 1;            /* راهنت — الطيران يبدأه السيرفر عبر 'fly' */
    cMult = 1;
    cPts = [1];
    elapsed = 0;
    SND.spin();
    /* عرض تأكيد الرهان فقط — التذكرة تُسجَّل مرة واحدة عند النتيجة (لا تكرار) */
    gres(T('grp.placeBet'), 0, true);
    const cEl = document.getElementById('cCash');
    if (cEl) cEl.disabled = true;
  });
}

/* ── بدء الطيران من started_at الخادمي (يستدعيها Group.avOnFly) ── */
export function avStartFly(startedAt) {
  if (cPhase === 2) return;   /* الجولة انفجرت بالفعل */
  cPhase = 1;
  isAnimating = true;
  avStartedAt = startedAt;
  cMult = 1;
  cPts = [1];
  startTime = performance.now();

  const sEl = document.getElementById('cStart');
  if (sEl) sEl.disabled = true;
  const cEl = document.getElementById('cCash');
  if (cEl) cEl.disabled = false;

  // Reset plane position
  if (plane) {
    plane.position.set(0, 2, 0);
    plane.rotation.x = -0.1;
    plane.rotation.y = 0;
    plane.rotation.z = 0;
    plane.visible = true;
  }
  if (trailParticles) trailParticles.visible = true;
  // إطفاء انفجار الجولة السابقة نهائياً حتى لا يتداخل مع الطيران الجديد
  if (explosionParticles) {
    explosionParticles.visible = false;
    explosionParticles.userData.active = false;
  }

  // إعادة ضبط الواجهة
  const mEl = document.getElementById('cM');
  if (mEl) {
    mEl.textContent = '1.00×';
    mEl.style.color = cMultColor(1);
  }
  const wEl = document.getElementById('cWin');
  if (wEl) wEl.textContent = '';

  animateFlight();
}

// ── أنيميشن الطيران (يقاد من زمن الخادم) ──────────────────────
function animateFlight() {
  if (!isAnimating || cPhase !== 1) return;

  const now = Date.now();
  elapsed = (now - avStartedAt) / 1000;

  cMult = Math.exp(0.00006 * (now - avStartedAt));
  cPts.push(cMult);
  // حد أقصى للنقاط — نحتفظ بآخر 1000 فقط (رسم المنحنى + الذاكرة)
  if (cPts.length > 1000) cPts = cPts.slice(-1000);

  const mEl = document.getElementById('cM');
  if (mEl) {
    mEl.textContent = cMult.toFixed(2) + '×';
    mEl.style.color = cMultColor(cMult);
  }

  // المكسب الحي الممكن سحبه الآن (فرجة)
  const wEl = document.getElementById('cWin');
  if (wEl) wEl.textContent = '≈ ' + fmt(Math.floor(GB * cMult)) + ' 🪙';

  if (plane) {
    const speed = 0.3 + cMult * 0.05;
    plane.position.z -= speed;
    plane.position.y += 0.02 * Math.log(cMult + 1);

    plane.rotation.z = Math.sin(elapsed * 2) * 0.15;
    plane.rotation.x = -0.1 - Math.log(cMult) * 0.05;

    if (plane.userData.glowLight) {
      plane.userData.glowLight.intensity = 1 + Math.log(cMult) * 0.5;
    }
  }

  cChartDraw();

  cAnimId = requestAnimationFrame(animateFlight);
}

// ── معالجة التحطم (crash_at من الخادم) ────────────────────────
function handleCrash(crashAtVal) {
  SND.boom();
  flash();

  const cvEl = document.getElementById('crash3d');
  if (cvEl) shake(cvEl, 15, 600);

  triggerExplosion();

  cHist.unshift(+crashAtVal.toFixed(2));
  if (cHist.length > 50) cHist.length = 50;
  cHistRender();

  const mEl = document.getElementById('cM');
  if (mEl) {
    mEl.textContent = ' ' + crashAtVal.toFixed(2) + '×';
    mEl.style.color = '#F87171';
  }
  const wEl = document.getElementById('cWin');
  if (wEl) wEl.textContent = '';

  cChartDraw();

  /* إن كنت سحبت في هذه الجولة → أبقِ نتيجة سحبي بدل رسالة الخسارة
     (عرض فقط — التذكرة سُجلت لحظة السحب في crashOut، فلا تُكرَّر) */
  if (cCashered > 0) {
    gres(' ' + cCashMult.toFixed(2) + '× +' + fmt(cCashered) + ' 🪙', cCashered, true);
    cCashered = 0;
    cCashMult = 0;
  } else {
    gres(' ' + crashAtVal.toFixed(2) + '× — ' + T('ts.lose'), false);
  }
  const sEl = document.getElementById('cStart');
  if (sEl) sEl.disabled = false;
  const cEl = document.getElementById('cCash');
  if (cEl) cEl.disabled = true;
  fairTick();

  /* إعادة الطور إلى 0 حتى يمكن بدء جولة جديدة بعد التحطم */
  cPhase = 0;

  setTimeout(() => {
    if (camera) {
      camera.position.set(0, 5, 15);
      camera.lookAt(0, 0, 0);
    }
  }, 2000);
}

/* ── انفجار من الخادم (يستدعيها Group.avOnCrash) ── */
export function avCrashNow(crashAtVal) {
  if (cPhase !== 1) return;
  cPhase = 2;
  isAnimating = false;
  if (cAnimId) { cancelAnimationFrame(cAnimId); cAnimId = null; }
  crashAt = crashAtVal;
  handleCrash(crashAtVal);
}

/* ── جولة جديدة (يستدعيها Group عبر SSE 'new') ── */
export function avNewRound() {
  cPhase = 0;
  isAnimating = false;
  if (cAnimId) { cancelAnimationFrame(cAnimId); cAnimId = null; }
  cMult = 1;
  cPts = [1];
  cCashered = 0;
  cCashMult = 0;
  avStartedAt = 0;
  crashAt = 0;
  const sEl = document.getElementById('cStart');
  if (sEl) { sEl.disabled = false; sEl.textContent = ' ' + T('g.start'); }
  const cEl = document.getElementById('cCash');
  if (cEl) cEl.disabled = true;
  const mEl = document.getElementById('cM');
  if (mEl) { mEl.textContent = '1.00×'; mEl.style.color = cMultColor(1); }
  const wEl = document.getElementById('cWin');
  if (wEl) wEl.textContent = '';
  gres('', 0);
  if (plane) {
    plane.position.set(0, 2, 0);
    plane.rotation.x = -0.1;
    plane.rotation.y = 0;
    plane.rotation.z = 0;
    plane.visible = true;
  }
  if (trailParticles) trailParticles.visible = true;
  if (explosionParticles) {
    explosionParticles.visible = false;
    explosionParticles.userData.active = false;
  }
  cChartDraw();
}

/* ── مزامنة الأزرار مع نافذة الرهان الخادمية ── */
export function avPanelSync(status) {
  const sEl = document.getElementById('cStart');
  if (!sEl) return;
  if (cPhase === 1 || cPhase === 2) { sEl.disabled = true; return; }
  const cEl = document.getElementById('cCash');
  if (status === 'betting') {
    sEl.disabled = false;
    sEl.textContent = ' ' + T('g.start');
  } else {
    sEl.disabled = true;
    sEl.textContent = '⏳ ' + T('grp.notBetting');
  }
  if (cEl) cEl.disabled = true;
}

// ── السحب (عبر الخادم — payout/mult من السيرفر) ───────────────
export function crashOut() {
  if (cPhase !== 1) return;
  const cEl = document.getElementById('cCash');
  if (cEl) cEl.disabled = true;
  SND.click();
  API.post('/api/games/av/cashout').then(function (r) {
    if (!r.ok || !r.data || !r.data.ok) {
      const msg = (r.data && r.data.message) || T('auth.error');
      toast(msg, 'err');
      if (cEl && cPhase === 1) cEl.disabled = false;
      return;
    }
    /* الرصيد يتحدث حصرياً من السيرفر */
    if (typeof Group !== 'undefined' && Group.setGold && typeof r.data.gold === 'number') Group.setGold(r.data.gold);
    const mult = r.data.mult || 0;
    const payout = r.data.payout || 0;

    cCashered = payout;
    cCashMult = mult;
    SND.coin();
    const mEl = document.getElementById('cM');
    if (mEl) {
      mEl.textContent = ' ' + mult.toFixed(2) + '×';
      mEl.style.color = '#4ADE80';
    }
    const wEl = document.getElementById('cWin');
    if (wEl) wEl.textContent = '';

    cChartDraw();

    gres(' ' + mult.toFixed(2) + '× +' + fmt(payout) + ' 🪙', payout);
    celebrate(payout >= (r.data.amount || GB) * 5);

    const sEl = document.getElementById('cStart');
    if (sEl) sEl.disabled = true;   /* لا رهان جديد حتى جولة جديدة */
    if (cEl) cEl.disabled = true;
    fairTick();
  });
}

// ── تهيئة ────────────────────────────────────────────────────
export async function initCrash() {
  /* التاريخ الحقيقي من سجل الجولات الجماعية (بدل المصفوفة الوهمية) */
  API.get('/api/games/av/group-history').then(function (r) {
    if (r.ok && r.data && r.data.rounds && r.data.rounds.length) {
      cHist = r.data.rounds.map(function (x) {
        return (x.outcome && x.outcome.crash_at) ? +x.outcome.crash_at.toFixed(2) : 0;
      });
      if (cHist.length > 50) cHist.length = 50;
      cHistRender();
    }
  }).catch(function () { /* لا شيء */ });
  cHistRender();
  await initCrashThree();
}

// ── تنظيف عند الإغلاق ────────────────────────────────────────
export function cleanupCrash() {
  cPhase = 0;
  isAnimating = false;
  if (cAnimId) {
    cancelAnimationFrame(cAnimId);
    cAnimId = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  scene = null;
  camera = null;
  plane = null;
  trailParticles = null;
  explosionParticles = null;
  window.removeEventListener('resize', onCrashResize);
}

// ── Export to global for non-module scripts ──────────────────
window.eCrash = eCrash;
window.initCrash = initCrash;
window.cleanupCrash = cleanupCrash;
window.crashGo = crashGo;
window.crashOut = crashOut;
window.avStartFly = avStartFly;
window.avCrashNow = avCrashNow;
window.avNewRound = avNewRound;
window.avPanelSync = avPanelSync;