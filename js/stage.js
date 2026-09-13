// stage.js — studio set, three curtained gates with marquee lights, sparks (three.js r186)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const GATE_W = 2.5;
export const GATE_H = 3.7;
export const GATE_GAP = 3.6;
export const PLATFORM_H = 0.45;
export const BOOTH_D = 2.8;
export const PODIUM_Z = -1.35;
export const PRIZE_R = 0.78;

export const GATE_STYLES = [
  { velvet: '#8f0b1d', velvetHi: '#d42a3f', sheen: '#ff9aa4', accent: '#ff4d61' },
  { velvet: '#13237a', velvetHi: '#3552d6', sheen: '#a9bcff', accent: '#5b8cff' },
  { velvet: '#07573a', velvetHi: '#16966a', sheen: '#a6f5cf', accent: '#35d991' },
];

const BULB_WARM = new THREE.Color(1.0, 0.72, 0.38);
const BULB_RED = new THREE.Color(1.0, 0.08, 0.1);

/* ------------------------------------------------------------------ */
/* Canvas texture helpers                                              */
/* ------------------------------------------------------------------ */
function canvasTexture(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dotTexture() {
  return canvasTexture(64, 64, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  });
}

/* ------------------------------------------------------------------ */
/* Volumetric-looking light beam (additive, fresnel edge fade)         */
/* ------------------------------------------------------------------ */
function beamMaterial(color, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */`
      varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        vY = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float fade = pow(vY, 1.8);
        gl_FragColor = vec4(uColor * uOpacity * edge * fade, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

function createBeam(color, opacity, length, rTop, rBottom) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, length, 48, 1, true);
  geo.translate(0, -length / 2, 0);                // apex at the origin, cone points down
  const mesh = new THREE.Mesh(geo, beamMaterial(color, opacity));
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Velvet curtain: geometry is computed in the vertex shader           */
/* ------------------------------------------------------------------ */
const CURTAIN_GLSL = /* glsl */`
uniform float uOpen;
uniform float uTime;
uniform float uSide;
uniform float uHalfW;
uniform float uH;
uniform float uFolds;
uniform float uAmp;
uniform float uHover;
uniform float uRipple;
uniform float uLift;

vec3 curtainPos(vec2 q) {
  // no clamping: the finite-difference normal samples slightly past the edges
  float u = max(q.x, 0.0);                  // 0 = outer edge, 1 = inner edge
  float v = q.y;                            // 0 = hem, 1 = rod
  float d = max(1.0 - v, 0.0);              // distance from rod
  float o = uOpen;
  // fabric slides to the outer side; lower parts are gathered a little less (tie-back look)
  float gather = o * mix(0.80, 0.90, smoothstep(0.0, 1.0, v));
  float width = uHalfW * (1.0 - gather);
  float x = u * width;
  // tie-back: the inner hem is lifted up and out in a swag
  float lift = uLift * o * pow(d, 1.5) * pow(u, 0.8) * uH;
  float y = -d * uH + lift;
  // folds get deeper when the fabric bunches up
  float comp = 1.0 + 2.8 * gather;
  float wob = sin(v * 3.3 + u * 2.1) * 0.45;
  float amp = uAmp * (0.6 + 0.4 * d) * comp;
  float z = (sin(u * uFolds * 6.28318 + wob) * 0.5 + 0.5) * amp;
  // idle drift, hover billow, anticipation ripple, forward swag when gathered
  z += 0.025 * sin(uTime * 0.8 + u * 5.0 + v * 2.2) * d;
  z += uHover * 0.14 * sin(v * 3.14159) * sin(u * 3.14159);
  z += uRipple * 0.06 * sin(uTime * 9.0 + v * 7.0 + u * 5.0) * d;
  z += o * 0.22 * u * pow(d, 1.1);
  // hover: inner hem peeks open a little
  x -= uHover * 0.08 * pow(u, 3.0) * d;
  return vec3(uSide * (uHalfW - x), y, z);
}

// remap so both halves keep the same triangle winding (front faces toward the viewer)
vec3 curtainAt(vec2 st) {
  return curtainPos(vec2(uSide > 0.0 ? 1.0 - st.x : st.x, st.y));
}

float curtainFold(vec2 st) {
  float u = uSide > 0.0 ? 1.0 - st.x : st.x;
  float wob = sin(st.y * 3.3 + u * 2.1) * 0.45;
  return sin(u * uFolds * 6.28318 + wob) * 0.5 + 0.5;
}
`;

const velvetCache = new Map();
function velvetTextures(style, { fringe = true } = {}) {
  const key = `${style.velvet}|${fringe}`;
  if (velvetCache.has(key)) return velvetCache.get(key);
  const W = 256, H = 1024;
  const rng = mulberry32(99);
  const map = canvasTexture(W, H, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, style.velvet);
    grd.addColorStop(0.35, style.velvetHi);
    grd.addColorStop(0.85, style.velvet);
    grd.addColorStop(1, style.velvet);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // soft pile variation
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'},${0.01 + rng() * 0.02})`;
      g.fillRect(rng() * W, 0, 6 + rng() * 18, H);
    }
    if (fringe) {
      const band = 0.075, tassel = 0.045;
      const y0 = H * (1 - band), y1 = H * (1 - tassel);
      const gold = g.createLinearGradient(0, y0, 0, y1);
      gold.addColorStop(0, '#6b4a10'); gold.addColorStop(0.2, '#ffe08a'); gold.addColorStop(0.55, '#d19a2a'); gold.addColorStop(1, '#7a5212');
      g.fillStyle = gold; g.fillRect(0, y0, W, y1 - y0);
      g.fillStyle = 'rgba(80,50,10,0.55)';
      for (let x = 0; x < W; x += 16) g.fillRect(x, y0 + (y1 - y0) * 0.35, 8, 3);
      for (let x = 0; x < W; x += 3) {
        const l = g.createLinearGradient(0, y1, 0, H);
        l.addColorStop(0, '#f6cf6a'); l.addColorStop(1, '#8a5d14');
        g.fillStyle = l; g.fillRect(x, y1, 2, H - y1);
      }
    }
  });
  const alpha = canvasTexture(W, H, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    if (!fringe) return;
    const tassel = 0.045;
    const y1 = H * (1 - tassel);
    g.fillStyle = '#000';
    for (let x = 0; x < W; x += 3) {
      g.fillRect(x + 2, y1, 1, H - y1);                              // gaps between threads
      g.fillRect(x, H - (H - y1) * (0.05 + rng() * 0.25), 2, H);       // ragged thread ends
    }
  }, { srgb: false });
  const result = { map, alpha };
  velvetCache.set(key, result);
  return result;
}

function createCurtain(style, opts) {
  const { side, halfW, h, folds = 6, amp = 0.1, lift = 0.42, fringe = true } = opts;
  const uniforms = {
    uOpen: { value: 0 }, uTime: { value: 0 }, uSide: { value: side }, uHalfW: { value: halfW },
    uH: { value: h }, uFolds: { value: folds }, uAmp: { value: amp }, uHover: { value: 0 },
    uRipple: { value: 0 }, uLift: { value: lift },
  };
  const { map, alpha } = velvetTextures(style, { fringe });
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map, alphaMap: alpha, alphaTest: 0.5, roughness: 0.92,
    sheen: 1, sheenColor: new THREE.Color(style.sheen), sheenRoughness: 0.42, side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${CURTAIN_GLSL}\nvarying float vFold;`)
      .replace('#include <beginnormal_vertex>', `
        vec3 cP = curtainAt(uv);
        vec3 cPx = curtainAt(uv + vec2(0.002, 0.0));
        vec3 cPy = curtainAt(uv - vec2(0.0, 0.002));
        vec3 cN = cross(cPx - cP, cP - cPy);
        vec3 objectNormal = dot(cN, cN) > 1e-12 ? normalize(cN) : vec3(0.0, 0.0, 1.0);
        vFold = curtainFold(uv);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(1.0, 0.0, 0.0);
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = cP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFold;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= mix(0.32, 1.12, smoothstep(0.0, 1.0, vFold));');
  };
  mat.customProgramCacheKey = () => 'velvet-curtain';
  const geo = new THREE.PlaneGeometry(1, 1, 90, 110);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/* ------------------------------------------------------------------ */
/* Studio                                                              */
/* ------------------------------------------------------------------ */
export function createStudio(scene, { quality = 'high' } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const width = GATE_GAP * 3 + 2.2;

  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 60),
    new THREE.MeshStandardMaterial({ color: '#0a0822', roughness: 0.32, metalness: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // floor pattern: concentric glowing rings in front of the stage
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(34, 20), new THREE.MeshBasicMaterial({
    map: canvasTexture(1024, 600, (g, w, h) => {
      const cx = w / 2, cy = 40;
      for (let r = 80; r < 1100; r += 70) {
        g.strokeStyle = `rgba(120,100,255,${Math.max(0, 0.22 - r / 5200)})`;
        g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI); g.stroke();
      }
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, 700);
      grd.addColorStop(0, 'rgba(90,70,220,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.set(0, 0.01, 2.2 + 10);
  group.add(floorGlow);

  // platform + steps
  const platMat = new THREE.MeshPhysicalMaterial({ color: '#17133f', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const platform = new THREE.Mesh(new RoundedBoxGeometry(width, PLATFORM_H, 5.2, 3, 0.05), platMat);
  platform.position.set(0, PLATFORM_H / 2, -0.3);
  group.add(platform);
  const step = new THREE.Mesh(new RoundedBoxGeometry(width - 1.2, PLATFORM_H / 2, 0.7, 3, 0.04), platMat);
  step.position.set(0, PLATFORM_H / 4, 2.6);
  group.add(step);

  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.55, 0.5), fog: false });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, 0.035), stripMat);
  strip.position.set(0, PLATFORM_H - 0.01, 2.31);
  const strip2 = new THREE.Mesh(new THREE.BoxGeometry(width - 1.2, 0.03, 0.03), stripMat);
  strip2.position.set(0, PLATFORM_H / 2 - 0.01, 2.96);
  group.add(strip, strip2);

  // back wall with sunburst + LED dot matrix
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(64, 26), new THREE.MeshBasicMaterial({
    map: canvasTexture(2048, 832, (g, w, h) => {
      const cx = w / 2, cy = h * 0.72;
      const bg = g.createRadialGradient(cx, cy, 20, cx, cy, w * 0.62);
      bg.addColorStop(0, '#3a1f8c'); bg.addColorStop(0.35, '#1a1158'); bg.addColorStop(1, '#040316');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.save(); g.translate(cx, cy);
      for (let i = 0; i < 64; i++) {
        g.rotate((Math.PI * 2) / 64);
        if (i % 2) continue;
        g.fillStyle = 'rgba(150,120,255,0.07)';
        g.beginPath(); g.moveTo(0, 0); g.lineTo(-40, -w); g.lineTo(40, -w); g.closePath(); g.fill();
      }
      g.restore();
      for (let y = 10; y < h; y += 22) {
        for (let x = 10; x < w; x += 22) {
          const d = Math.hypot(x - cx, y - cy) / (w * 0.6);
          const a = Math.max(0, 0.22 - d * 0.22);
          if (a < 0.01) continue;
          g.fillStyle = `rgba(170,150,255,${a})`;
          g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
        }
      }
    }),
    fog: false,
  }));
  wall.position.set(0, 9, -7.5);
  group.add(wall);

  // neon arches behind the gates
  const neon = [];
  const arch = (radius, tube, color, z, y) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 16, 200, Math.PI),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), fog: false }));
    m.position.set(0, y, z);
    group.add(m);
    neon.push({ mesh: m, base: new THREE.Color(color) });
  };
  arch(8.6, 0.06, new THREE.Color(2.6, 1.6, 0.35), -6.2, 0.5);
  arch(9.3, 0.045, new THREE.Color(2.2, 0.35, 1.9), -6.4, 0.5);
  arch(10.0, 0.035, new THREE.Color(0.45, 0.8, 2.6), -6.6, 0.5);

  // LED columns
  const columns = [];
  const colGeo = new RoundedBoxGeometry(0.22, 9, 0.22, 2, 0.05);
  [-13.5, -11.4, 11.4, 13.5].forEach((x, i) => {
    const c = new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    c.position.set(x, 4.5, -6);
    group.add(c);
    columns.push({ mesh: c, base: i % 3 === 0 ? new THREE.Color(0.5, 0.75, 2.4) : new THREE.Color(2.2, 0.4, 1.9), phase: i * 1.3 });
  });

  // moving light beams from the rig
  const beams = [];
  const beamColors = ['#b9a4ff', '#ffd27a', '#8fd0ff', '#ffd27a', '#ff9be0'];
  beamColors.forEach((col, i) => {
    const b = createBeam(col, 0.16, 16, 0.08, 2.4);
    const x = (i - 2) * 4.2;
    b.position.set(x, 12.5, -3.5);
    group.add(b);
    beams.push({ mesh: b, baseZ: -0.25 + (i - 2) * -0.1, phase: i * 1.7, baseOpacity: 0.16 });
  });

  // floating dust in the light
  const dustCount = quality === 'low' ? 250 : 500;
  const rng = mulberry32(7);
  const dPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dPos[i * 3] = (rng() - 0.5) * 22;
    dPos[i * 3 + 1] = rng() * 10;
    dPos[i * 3 + 2] = -5 + rng() * 12;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.045, map: dotTexture(), color: new THREE.Color('#ffe7c2'), transparent: true, opacity: 0.35,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  group.add(dust);

  const tmp = new THREE.Color();
  function update(t, dt, { dim = 0, reduced = false } = {}) {
    const k = 1 - 0.75 * dim;
    neon.forEach((n, i) => {
      const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 1.4 + i * 1.1);
      n.mesh.material.color.copy(n.base).multiplyScalar(pulse * k);
    });
    columns.forEach((c) => {
      const pulse = reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 2.0 + c.phase);
      c.mesh.material.color.copy(tmp.copy(c.base)).multiplyScalar(pulse * k);
    });
    beams.forEach((b) => {
      if (!reduced) b.mesh.rotation.z = Math.sin(t * 0.35 + b.phase) * 0.32;
      b.mesh.rotation.x = b.baseZ;
      b.mesh.material.uniforms.uOpacity.value = b.baseOpacity * (1 - 0.8 * dim);
    });
    if (!reduced) {
      dust.rotation.y = t * 0.01;
      dust.position.y = Math.sin(t * 0.2) * 0.15;
    }
    wall.material.color.setScalar(1 - 0.55 * dim);
    stripMat.color.setRGB(2.2 * k, 1.55 * k, 0.5 * k);
  }

  return { group, update };
}

/* ------------------------------------------------------------------ */
/* Gate                                                                */
/* ------------------------------------------------------------------ */
function signTexture(n, style) {
  return canvasTexture(512, 512, (g, w) => {
    const bg = g.createRadialGradient(w / 2, w / 2, 20, w / 2, w / 2, w / 2);
    bg.addColorStop(0, '#26207a'); bg.addColorStop(1, '#07061f');
    g.fillStyle = bg; g.fillRect(0, 0, w, w);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 58px Manrope, "Segoe UI", sans-serif';
    g.fillStyle = '#ffd34d';
    if ('letterSpacing' in g) g.letterSpacing = '14px';
    g.fillText('TOR', w / 2 + 7, 118);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.font = '400 300px Bungee, "Arial Black", Impact, sans-serif';
    g.shadowColor = style.accent; g.shadowBlur = 40;
    const grd = g.createLinearGradient(0, 170, 0, 440);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.55, '#fff1c4'); grd.addColorStop(1, '#ffc93c');
    g.fillStyle = grd;
    g.fillText(String(n), w / 2, 318);
    g.shadowBlur = 0;
    g.lineWidth = 6; g.strokeStyle = 'rgba(120,70,0,0.55)';
    g.strokeText(String(n), w / 2, 318);
  });
}

function glowTexture() {
  return canvasTexture(512, 768, (g, w, h) => {
    g.fillStyle = '#0b0820'; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.5;
    // sunburst rays behind the prize
    g.save(); g.translate(cx, cy);
    for (let i = 0; i < 28; i++) {
      g.rotate((Math.PI * 2) / 28);
      const ray = g.createLinearGradient(0, 0, 0, -h * 0.75);
      ray.addColorStop(0, 'rgba(255,230,190,0.55)'); ray.addColorStop(1, 'rgba(255,230,190,0)');
      g.fillStyle = ray;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-26, -h * 0.75); g.lineTo(26, -h * 0.75); g.closePath(); g.fill();
    }
    g.restore();
    const core = g.createRadialGradient(cx, cy, 4, cx, cy, h * 0.42);
    core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.3, 'rgba(255,214,160,0.65)'); core.addColorStop(1, 'rgba(40,20,40,0)');
    g.fillStyle = core; g.fillRect(0, 0, w, h);
    // vertical light strips at the sides
    for (const x of [26, w - 42]) {
      const s = g.createLinearGradient(0, 0, 0, h);
      s.addColorStop(0, 'rgba(255,240,210,0.1)'); s.addColorStop(0.5, 'rgba(255,240,210,0.9)'); s.addColorStop(1, 'rgba(255,240,210,0.1)');
      g.fillStyle = s; g.fillRect(x, 0, 16, h);
    }
    const vig = g.createRadialGradient(cx, cy, h * 0.3, cx, cy, h * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.fillStyle = vig; g.fillRect(0, 0, w, h);
  });
}

function spillTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,236,200,1)'); grd.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(w * 0.2, 0); g.lineTo(w * 0.8, 0); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
  });
}

export function createGate(index, { envMap, bulbGeo, quality = 'high' }) {
  const style = GATE_STYLES[index];
  const W = GATE_W, H = GATE_H;
  const root = new THREE.Group();
  root.position.set((index - 1) * GATE_GAP, PLATFORM_H, 0);

  const lacquer = new THREE.MeshPhysicalMaterial({ color: '#1c1954', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
  const gold = new THREE.MeshPhysicalMaterial({ color: '#f0c25a', metalness: 1, roughness: 0.26, envMap, envMapIntensity: 1.1 });

  // proscenium frame
  const pillarGeo = new RoundedBoxGeometry(0.42, H + 0.52, 0.56, 3, 0.07);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(pillarGeo, lacquer);
    p.position.set(sx * (W / 2 + 0.21), (H + 0.52) / 2, 0);
    root.add(p);
    const trim = new THREE.Mesh(new RoundedBoxGeometry(0.06, H + 0.06, 0.6, 2, 0.02), gold);
    trim.position.set(sx * (W / 2 + 0.02), (H + 0.06) / 2, 0);
    root.add(trim);
  }
  const lintel = new THREE.Mesh(new RoundedBoxGeometry(W + 0.84, 0.52, 0.56, 3, 0.07), lacquer);
  lintel.position.set(0, H + 0.26, 0);
  root.add(lintel);
  const lintelTrim = new THREE.Mesh(new RoundedBoxGeometry(W + 0.1, 0.06, 0.6, 2, 0.02), gold);
  lintelTrim.position.set(0, H + 0.02, 0);
  root.add(lintelTrim);

  // number sign
  const signY = H + 0.52 + 0.7;
  const sign = new THREE.Group();
  sign.position.set(0, signY, 0.05);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.2, 64), lacquer);
  back.rotation.x = Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 16, 96), gold);
  ring.position.z = 0.11;
  const faceMat = new THREE.MeshBasicMaterial({ map: signTexture(index + 1, style), color: new THREE.Color(1.15, 1.15, 1.15) });
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.69, 64), faceMat);
  face.position.z = 0.105;
  sign.add(back, ring, face);
  root.add(sign);

  // marquee bulbs: frame rectangle + sign circle
  const bulbPts = [];
  const fx = W / 2 + 0.21, top = H + 0.26;
  const path = [[-fx, 0.22], [-fx, top], [fx, top], [fx, 0.22]];
  let total = 0;
  const segs = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, len }); total += len;
  }
  const spacing = 0.27;
  const n = Math.round(total / spacing);
  for (let k = 0; k <= n; k++) {
    let d = (k / n) * total;
    for (const s of segs) {
      if (d <= s.len + 1e-6) {
        const f = d / s.len;
        bulbPts.push({ x: s.a[0] + (s.b[0] - s.a[0]) * f, y: s.a[1] + (s.b[1] - s.a[1]) * f, z: 0.3, s: k / n, ring: false });
        break;
      }
      d -= s.len;
    }
  }
  const ringBulbs = 22;
  for (let k = 0; k < ringBulbs; k++) {
    const a = (k / ringBulbs) * Math.PI * 2;
    bulbPts.push({ x: Math.sin(a) * 0.8, y: signY + Math.cos(a) * 0.8, z: 0.17, s: k / ringBulbs, ring: true });
  }
  const bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbPts.length);
  const m4 = new THREE.Matrix4();
  bulbPts.forEach((p, k) => { m4.makeTranslation(p.x, p.y, p.z); bulbs.setMatrixAt(k, m4); bulbs.setColorAt(k, BULB_WARM); });
  bulbs.instanceMatrix.needsUpdate = true;
  bulbs.computeBoundingSphere();
  root.add(bulbs);

  // booth behind the curtain
  const booth = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, H + 0.3, BOOTH_D),
    new THREE.MeshStandardMaterial({ color: '#15113c', roughness: 0.75, side: THREE.BackSide }));
  booth.position.set(0, (H + 0.3) / 2, -BOOTH_D / 2 - 0.03);
  root.add(booth);
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(0.02, 0.02, 0.03) });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.58, H + 0.28), glowMat);
  glow.position.set(0, (H + 0.3) / 2, -BOOTH_D + 0.01);
  root.add(glow);

  const boothLight = new THREE.PointLight('#ffe3bd', 0, 8, 2);
  boothLight.position.set(0, H - 0.4, -0.6);
  root.add(boothLight);

  const beam = createBeam('#fff1d6', 0, H + 0.1, 0.1, 1.05);
  beam.position.set(0, H + 0.25, PODIUM_Z);
  root.add(beam);

  const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.92, 0.3, 64),
    new THREE.MeshPhysicalMaterial({ color: '#0d0b20', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }));
  podium.position.set(0, 0.15, PODIUM_Z);
  root.add(podium);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  const podiumRing = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.028, 12, 120), ringMat);
  podiumRing.rotation.x = Math.PI / 2;
  podiumRing.position.set(0, 0.3, PODIUM_Z);
  root.add(podiumRing);

  // light spill on the platform in front of the opening
  const spillMat = new THREE.MeshBasicMaterial({ map: spillTexture(), color: '#ffe9c9', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.05, 2.3), spillMat);
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.006, 1.2);
  root.add(spill);

  // curtains (two halves + valance)
  const halfW = W / 2 + 0.12;
  const left = createCurtain(style, { side: -1, halfW, h: H + 0.02 });
  left.mesh.position.set(0.035, H + 0.01, 0.02);
  const right = createCurtain(style, { side: 1, halfW, h: H + 0.02 });
  right.mesh.position.set(-0.035, H + 0.01, 0.045);
  const valance = createCurtain(style, { side: 1, halfW: W + 0.4, h: 0.62, folds: 14, amp: 0.06, lift: 0 });
  valance.mesh.position.set(-(W + 0.4) / 2, H + 0.03, 0.2);
  root.add(left.mesh, right.mesh, valance.mesh);

  // key spot for this gate (from the lighting rig)
  const spot = new THREE.SpotLight('#fff0dc', 170, 26, Math.PI / 9, 0.55, 2);
  spot.position.set(root.position.x, 9.5, 7.5);
  spot.target.position.set(root.position.x, 2.3, 0);

  // prize mount: holder (flight) -> spinner (rotation) -> model
  const holder = new THREE.Group();
  const spinner = new THREE.Group();
  holder.add(spinner);
  holder.position.set(0, 0.3 + PRIZE_R + 0.05, PODIUM_Z);
  holder.visible = false;
  root.add(holder);

  const gate = {
    index, style, root, spot, holder, spinner, bulbs, bulbPts, glowMat, boothLight, beam, ringMat, spillMat,
    curtains: [left.uniforms, right.uniforms], valance: valance.uniforms, faceMat,
    restPos: holder.position.clone(),
    model: null, opened: false, win: true,
    hover: { value: 0 }, power: { value: 0 }, chase: { value: 0 }, alarm: { value: 0 },
    spin: 0, extraSpin: { value: 0 }, tilt: { value: 0 }, float: { value: 0 },
    accent: new THREE.Color(style.accent),
  };

  const col = new THREE.Color();
  gate.update = (t, dt, { dim = 0, focused = false, reduced = false }) => {
    // curtains
    for (const u of gate.curtains) { u.uTime.value = t; u.uHover.value = gate.hover.value; }
    gate.valance.uTime.value = t;
    // bulbs
    const others = focused ? 1 : 1 - 0.7 * dim;
    const power = gate.power.value * others;
    const speed = 0.9 + gate.hover.value * 2.2 + gate.chase.value * 5;
    for (let k = 0; k < bulbPts.length; k++) {
      const p = bulbPts[k];
      let v;
      if (reduced) v = 0.85;
      else {
        const wave = 0.5 + 0.5 * Math.cos((p.s * (p.ring ? 3 : 7) - t * speed * (p.ring ? 0.6 : 1)) * Math.PI * 2);
        v = 0.3 + 0.95 * Math.pow(wave, 3);
      }
      col.copy(BULB_WARM);
      if (gate.alarm.value > 0) {
        const blink = reduced ? 1 : (Math.sin(t * 10 + k * 0.6) > 0 ? 1 : 0.2);
        col.lerp(BULB_RED, gate.alarm.value);
        v = THREE.MathUtils.lerp(v, blink, gate.alarm.value);
      }
      bulbs.setColorAt(k, col.multiplyScalar(v * power * 2.2));
    }
    bulbs.instanceColor.needsUpdate = true;
    faceMat.color.setScalar((0.35 + 0.8 * gate.power.value) * others);
    // prize idle
    if (holder.visible) {
      if (!reduced) {
        gate.spin += dt * (focused ? 0.8 : 0.5);
        spinner.rotation.x = gate.tilt.value + Math.sin(t * 0.9) * 0.05;
        spinner.position.y = Math.sin(t * 1.6 + index) * 0.045 * (0.4 + gate.float.value);
        gate.model?.userData.update?.(t);
      }
      spinner.rotation.y = gate.spin + gate.extraSpin.value;
    }
  };

  return gate;
}

/* ------------------------------------------------------------------ */
/* Sparks                                                              */
/* ------------------------------------------------------------------ */
export class Sparks {
  constructor(scene, max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max * 3);
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.09, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.rng = mulberry32(3);
    scene.add(this.points);
  }

  emit(origin, count, colors, { spread = 1.2, up = 3.2, forward = 2.6 } = {}) {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const k = this.head++ % this.max;
      this.pos[k * 3] = origin.x + (r() - 0.5) * spread;
      this.pos[k * 3 + 1] = origin.y + (r() - 0.5) * spread * 1.4;
      this.pos[k * 3 + 2] = origin.z + r() * 0.3;
      this.vel[k * 3] = (r() - 0.5) * 4.2;
      this.vel[k * 3 + 1] = r() * up;
      this.vel[k * 3 + 2] = 0.4 + r() * forward;
      this.maxLife[k] = this.life[k] = 0.7 + r() * 1.2;
      const c = colors[Math.floor(r() * colors.length)];
      this.base[k * 3] = c.r; this.base[k * 3 + 1] = c.g; this.base[k * 3 + 2] = c.b;
    }
  }

  update(dt) {
    let alive = false;
    for (let k = 0; k < this.max; k++) {
      if (this.life[k] <= 0) continue;
      alive = true;
      this.life[k] -= dt;
      const i = k * 3;
      this.vel[i + 1] -= 4.2 * dt;
      const drag = 1 - 1.1 * dt;
      this.vel[i] *= drag; this.vel[i + 1] *= drag; this.vel[i + 2] *= drag;
      this.pos[i] += this.vel[i] * dt; this.pos[i + 1] += this.vel[i + 1] * dt; this.pos[i + 2] += this.vel[i + 2] * dt;
      const f = Math.max(0, this.life[k] / this.maxLife[k]);
      const b = f * f * 3.2 * (0.7 + 0.3 * Math.sin(k + this.life[k] * 40));
      this.col[i] = this.base[i] * b; this.col[i + 1] = this.base[i + 1] * b; this.col[i + 2] = this.base[i + 2] * b;
    }
    if (alive) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
  }
}
