// confetti.js — lightweight 2D confetti / petal burst on a fixed overlay canvas
const canvas = document.getElementById('confetti');
const ctx = canvas.getContext('2d');
let particles = [];
let running = false;
let last = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

export function burstConfetti({ colors, count = 180, shape = 'mixed', origin = { x: 0.5, y: 0.42 }, angle = -Math.PI / 2, spread = 0.9 }) {
  const ox = innerWidth * origin.x, oy = innerHeight * origin.y;
  const scale = Math.min(1.4, Math.max(0.7, innerWidth / 1200));
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * spread;
    const speed = (14 + Math.random() * 16) * scale;
    const kind = shape === 'petal' ? 'petal' : shape === 'mixed' ? (Math.random() < 0.7 ? 'rect' : 'star') : shape;
    particles.push({
      x: ox + (Math.random() - 0.5) * 60, y: oy + (Math.random() - 0.5) * 30,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      w: (kind === 'petal' ? 12 : 8) + Math.random() * 8, h: (kind === 'petal' ? 8 : 12) + Math.random() * 6,
      rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.3,
      flip: Math.random() * Math.PI * 2, vflip: 0.08 + Math.random() * 0.12,
      color: colors[Math.floor(Math.random() * colors.length)], kind,
      life: 0, ttl: 170 + Math.random() * 90,
    });
  }
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
}

export function clearConfetti() {
  particles = [];
}

function star(r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r * 0.38 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

function frame(now) {
  const dt = Math.min(2.5, (now - last) / 16.67);
  last = now;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter((p) => p.life < p.ttl && p.y < innerHeight + 40);
  for (const p of particles) {
    p.life += dt;
    p.vx *= 1 - 0.02 * dt;
    p.vy = p.vy * (1 - 0.02 * dt) + 0.32 * dt;
    if (p.kind === 'petal') { p.vy = Math.min(p.vy, 2.6); p.vx += Math.sin(p.life * 0.08) * 0.12; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vr * dt; p.flip += p.vflip * dt;
    const alpha = Math.max(0, Math.min(1, (p.ttl - p.life) / 40));
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.cos(p.flip));
    ctx.fillStyle = p.color;
    if (p.kind === 'rect') ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    else if (p.kind === 'star') star(p.w * 0.7);
    else { ctx.beginPath(); ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  if (particles.length) requestAnimationFrame(frame);
  else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}
