// prize-wreath.js — dense dried-hydrangea wreath (Hortensienkranz) on a 250 mm dummy ring (three.js r186)
// Everything procedural: florets/leaves are InstancedMeshes, textures are drawn on canvases.
//
//   import { createFlowerWreath } from './prize-wreath.js';
//   const wreath = createFlowerWreath({ quality: 'high', seed: 1994 });
//
// Orientation: ring lies in the XY plane, flower side faces +Z. Ring outer diameter = 2.0 units,
// the flowers add ~0.3 all around (overall ~2.6 wide, ~0.8 deep).
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/* ------------------------------------------------------------------ */
/* dummy ring proportions (250 mm outer -> 2.0 units)                  */
/* ------------------------------------------------------------------ */
const RING_A = 0.17;             // radial half width of the core (≈ 21 mm)
const RING_B = 0.11;             // half thickness (≈ 14 mm)
const RING_RC = 1.0 - RING_A;    // centre-line radius

// Point on the elliptical cross-section whose outward normal has angle psi
// (psi = 0 outward, 90° front/+Z, 180° inward, 270° back). Returns [radialOffset, z].
function ellipseAtNormal(psi) {
  const c = Math.cos(psi), s = Math.sin(psi);
  const d = Math.sqrt(RING_A * RING_A * c * c + RING_B * RING_B * s * s);
  return [(RING_A * RING_A * c) / d, (RING_B * RING_B * s) / d];
}

/* ------------------------------------------------------------------ */
/* canvas textures                                                     */
/* ------------------------------------------------------------------ */
function makePetalTexture(rng) {
  // uv.x = across the petal, uv.y = base (0) -> tip (1). Near-white so it only adds veins/mottling.
  const W = 128, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  // papery mottling
  for (let i = 0; i < 220; i++) {
    const v = 225 + Math.floor(rng() * 30);
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    const r = 2 + rng() * 7;
    g.beginPath();
    g.arc(rng() * W, rng() * H, r, 0, Math.PI * 2);
    g.fill();
  }
  // midrib + side veins (canvas top = tip)
  g.strokeStyle = 'rgba(150,150,150,0.55)';
  g.lineCap = 'round';
  g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 4); g.stroke();
  g.lineWidth = 1.2;
  g.strokeStyle = 'rgba(165,165,165,0.45)';
  for (let k = 0; k < 5; k++) {
    const y0 = H - 14 - k * 22;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2, y0);
      g.quadraticCurveTo(W / 2 + side * 26, y0 - 14, W / 2 + side * (50 - k * 5), y0 - 34);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeLeafTexture(rng) {
  // Serrated, pointed hydrangea leaf with alpha. uv.y = 0 base -> 1 tip.
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cx = W / 2;
  const pts = [];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const t = i / N;                                    // 0 base .. 1 tip
    let hw = 58 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.95);
    hw *= 1 - 0.07 * ((t * 22) % 1);                    // saw-tooth serration
    pts.push([hw, H - 4 - t * (H - 8)]);
  }
  g.beginPath();
  g.moveTo(cx, H - 2);
  for (const [hw, y] of pts) g.lineTo(cx + hw, y);
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(cx - pts[i][0], pts[i][1]);
  g.closePath();
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, '#4f6d33');
  grad.addColorStop(0.6, '#5d7b3a');
  grad.addColorStop(1, '#6a7a3c');
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  // mottling / dried patches
  for (let i = 0; i < 160; i++) {
    const r = 3 + rng() * 10;
    const warm = rng() < 0.25;
    g.fillStyle = warm ? 'rgba(120,95,50,0.18)' : `rgba(${30 + rng() * 40},${60 + rng() * 40},${25 + rng() * 20},0.18)`;
    g.beginPath(); g.arc(rng() * W, rng() * H, r, 0, Math.PI * 2); g.fill();
  }
  // darker rim
  g.strokeStyle = 'rgba(40,50,25,0.5)';
  g.lineWidth = 5;
  g.stroke();
  // veins
  g.strokeStyle = 'rgba(170,190,120,0.75)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, 10); g.stroke();
  g.lineWidth = 1.4;
  g.strokeStyle = 'rgba(150,170,105,0.55)';
  for (let k = 0; k < 8; k++) {
    const y0 = H - 24 - k * 27;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx, y0);
      g.quadraticCurveTo(cx + side * 26, y0 - 12, cx + side * 50, y0 - 40);
      g.stroke();
    }
  }
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------------ */
/* floret geometry: 4 rounded, cupped sepals + tiny centre             */
/* attributes: position, normal, uv, color (base darkening), aEdge     */
/* ------------------------------------------------------------------ */
function makeFloretGeometry(uSeg, vSeg, cfg, rng) {
  const P = [], C = [], UV = [], E = [], I = [];
  let vi = 0;
  const r0 = 0.05;
  const cols = vSeg + 1;
  for (let p = 0; p < 4; p++) {
    const ang = p * Math.PI / 2 + (rng() - 0.5) * cfg.angJit;
    const len = 1 - rng() * cfg.lenJit;
    const wmax = cfg.width * (1 + (rng() - 0.5) * 0.18);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ph = rng() * Math.PI * 2;
    const start = vi;
    for (let iu = 0; iu <= uSeg; iu++) {
      const u = iu / uSeg;
      const x = Math.pow(u, 0.8);
      const w = wmax * Math.pow(Math.max(0, Math.sin(Math.PI * (0.05 + cfg.tip * x))), cfg.round);
      const r = r0 + (len - r0) * u;
      for (let iv = 0; iv <= vSeg; iv++) {
        const v = (iv / vSeg) * 2 - 1;
        const av = Math.abs(v);
        const z = cfg.cup * u * u
          - cfg.droop * Math.pow(Math.max(0, u - 0.45) / 0.55, 2)
          + cfg.fold * av * Math.sin(Math.PI * Math.min(1, u * 1.15))
          + cfg.ruffle * av * Math.sin(u * Math.PI * 2.6 + ph + v * 1.7) * u;
        const lx = r, ly = v * w;
        P.push(lx * ca - ly * sa, lx * sa + ly * ca, z);
        const shade = 0.42 + 0.58 * smooth(0.0, 0.55, u);
        C.push(shade, shade, shade);
        UV.push(0.5 + 0.5 * v, u);
        E.push(Math.min(1, 0.72 * Math.pow(u, 1.3) + 0.5 * av * smooth(0.1, 0.6, u)));
        vi++;
      }
    }
    for (let iu = 0; iu < uSeg; iu++) {
      for (let iv = 0; iv < vSeg; iv++) {
        const a = start + iu * cols + iv, b = a + 1, c = a + cols, d = c + 1;
        I.push(a, d, b, a, c, d);
      }
    }
  }
  // centre: tiny 4-sided pyramid (the "eye" of the floret)
  const base = vi;
  const rc = 0.09, hc = 0.08;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    P.push(Math.cos(a) * rc, Math.sin(a) * rc, 0.0);
    C.push(0.35, 0.35, 0.3); UV.push(0.5, 0.02); E.push(0);
  }
  P.push(0, 0, hc); C.push(0.55, 0.55, 0.45); UV.push(0.5, 0.02); E.push(0);
  for (let k = 0; k < 4; k++) I.push(base + k, base + ((k + 1) % 4), base + 4);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(E, 1));
  geo.setIndex(I);
  geo.computeVertexNormals();
  return geo;
}

function makeLeafGeometry(uSeg) {
  // plane along +Y (length 1), width 0.5, gently V-folded and curling back at the tip
  const P = [], UV = [], I = [];
  const vSeg = 2, cols = vSeg + 1;
  for (let iu = 0; iu <= uSeg; iu++) {
    const u = iu / uSeg;
    for (let iv = 0; iv <= vSeg; iv++) {
      const v = (iv / vSeg) * 2 - 1;
      const z = 0.07 * Math.abs(v) * Math.sin(Math.PI * u) - 0.22 * u * u;
      P.push(v * 0.25, u, z);
      UV.push(0.5 + 0.5 * v, u);
    }
  }
  for (let iu = 0; iu < uSeg; iu++) {
    for (let iv = 0; iv < vSeg; iv++) {
      const a = iu * cols + iv, b = a + 1, c = a + cols, d = c + 1;
      I.push(a, b, d, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------ */
/* colour palettes (sRGB hex) — vintage dried hydrangea                */
/* ------------------------------------------------------------------ */
const HEAD_TYPES = [
  // green heads with raspberry/pink margins (most common in the reference)
  { w: 0.28, a: ['#a3bb56', '#90b04c', '#b0c262', '#8cab58'], b: ['#9ab655', '#b9c066'], odd: ['#c44878', '#b53a60', '#a6c07a'], oddP: 0.2, edge: ['#b3305c', '#c2466f'], edgeAmt: [0.7, 1.0] },
  // sage / soft green, faint blush
  { w: 0.1, a: ['#93ab78', '#a2b784', '#86a466'], b: ['#b0c07a', '#9aa9b8'], odd: ['#9aa6cc', '#b48cc2', '#c05c86'], oddP: 0.2, edge: ['#b56a8c'], edgeAmt: [0.2, 0.6] },
  // raspberry / wine red with green hearts
  { w: 0.14, a: ['#ad2e57', '#9b2748', '#bb3c66'], b: ['#c44f7c', '#9fb358'], odd: ['#9fb456', '#d06a9b'], oddP: 0.22, edge: ['#7e1c36', '#6e1a30'], edgeAmt: [0.3, 0.65] },
  // fuchsia / pink
  { w: 0.08, a: ['#c84d8a', '#d26a9e', '#b83e7c'], b: ['#d98ab2', '#a45bb0'], odd: ['#a45bb0', '#a9bf5c'], oddP: 0.2, edge: ['#9a2560'], edgeAmt: [0.2, 0.5] },
  // violet / purple
  { w: 0.1, a: ['#8a5cb4', '#7b4ea4', '#9870c2'], b: ['#8580bf', '#b06aa8'], odd: ['#c35b9b', '#9cb45e'], oddP: 0.18, edge: ['#583796', '#8a3a7e'], edgeAmt: [0.25, 0.55] },
  // lilac / dusty blue
  { w: 0.1, a: ['#8f9acb', '#a08fc6', '#8390c0'], b: ['#b0a2d0', '#9aaa8a'], odd: ['#a4b56c', '#bb7aae'], oddP: 0.22, edge: ['#7a62a8'], edgeAmt: [0.2, 0.5] },
  // green -> magenta split head
  { w: 0.2, a: ['#9cb856', '#a6bd5e'], b: ['#c03e72', '#b03462', '#8e5cb2'], odd: ['#c56a92', '#a9c06a'], oddP: 0.15, edge: ['#a8285a'], edgeAmt: [0.5, 0.9] },
];

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
export function createFlowerWreath({ quality = 'high', seed = 1994 } = {}) {
  const low = quality === 'low';
  const rng = mulberry32(seed >>> 0);
  const group = new THREE.Group();
  group.name = 'Hortensienkranz';

  const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const rr = (a, b) => a + (b - a) * rng();

  /* ---------- textures & materials ---------- */
  const petalTex = makePetalTexture(rng);
  const leafTex = makeLeafTexture(rng);

  const floretMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: petalTex,
    vertexColors: true,
    roughness: 0.8,
    metalness: 0,
    sheen: 0.2,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#d8d0c8'),
    side: THREE.DoubleSide,
  });
  // per-instance margin tint: vColor = shade * mix(instanceColor, edgeColor, smoothstep(edge))
  floretMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEdge;\nattribute vec4 aTint;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        {
          float et = smoothstep(0.48, 0.92, aEdge) * aTint.a;
          vColor.rgb = mix(vColor.rgb, color.rgb * aTint.rgb, et);
        }`);
  };
  floretMat.customProgramCacheKey = () => 'gag-hydrangea-floret';

  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex,
    alphaTest: 0.5,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const coreMat = new THREE.MeshStandardMaterial({ color: '#2e2d1f', roughness: 0.95, metalness: 0 });
  const wireMat = new THREE.MeshStandardMaterial({ color: '#3b4a2a', roughness: 0.45, metalness: 0.6 });

  /* ---------- base ring (the 3D-printed dummy) + binding wire ---------- */
  const core = new THREE.TorusGeometry(RING_RC, RING_A, low ? 10 : 16, low ? 64 : 96);
  core.scale(1, 1, RING_B / RING_A);
  const coreMesh = new THREE.Mesh(core, coreMat);
  coreMesh.name = 'dummyRing';
  group.add(coreMesh);

  class WireCurve extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const th = t * Math.PI * 2;
      const ps = t * Math.PI * 2 * 46;
      const a = RING_A + 0.012, b = RING_B + 0.012;
      const rad = RING_RC + a * Math.cos(ps);
      return target.set(Math.cos(th) * rad, Math.sin(th) * rad, b * Math.sin(ps));
    }
  }
  const wire = new THREE.Mesh(new THREE.TubeGeometry(new WireCurve(), low ? 460 : 920, 0.0065, low ? 3 : 4, true), wireMat);
  wire.name = 'bindingWire';
  group.add(wire);

  /* ---------- flower heads ---------- */
  const rows = [
    // psi = direction around the tube cross-section, n = heads in this row
    { psi: 88, jit: 12, n: 9, rs: [0.31, 0.36], alpha: 82 },    // front crown
    { psi: 30, jit: 9, n: 11, rs: [0.28, 0.33], alpha: 82 },    // front-outer
    { psi: 138, jit: 7, n: 7, rs: [0.2, 0.24], alpha: 78 },     // front-inner
    { psi: -25, jit: 8, n: 9, rs: [0.24, 0.29], alpha: 80 },    // outer rim (towards the back)
    { psi: 200, jit: 8, n: 5, rs: [0.16, 0.19], alpha: 72 },    // inner rim (towards the back)
    { psi: 270, jit: 12, n: 4, rs: [0.16, 0.2], alpha: 62 },    // a few on the back
  ];

  const floretRadius = low ? 0.135 : 0.118;
  const cover = low ? 2.3 : 2.7;
  const fillFrac = low ? 0.25 : 0.35;

  // instance buffers (2 floret variants -> 2 draw calls)
  const inst = [
    { mats: [], cols: [], tints: [] },
    { mats: [], cols: [], tints: [] },
  ];

  const R = new THREE.Vector3(), T1 = new THREE.Vector3(), T2 = new THREE.Vector3(), N = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  const S = new THREE.Vector3(), Hc = new THREE.Vector3(), dir = new THREE.Vector3(), nrm = new THREE.Vector3();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3(), jit = new THREE.Vector3();
  const qA = new THREE.Quaternion(), qS = new THREE.Quaternion(), q = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const colA = new THREE.Color(), colB = new THREE.Color(), edgeC = new THREE.Color();
  const gradDir = new THREE.Vector3();
  const heads = [];
  let prevType = -1;

  const pickType = () => {
    let t = 0;
    for (let tries = 0; tries < 3; tries++) {
      let x = rng();
      t = 0;
      while (t < HEAD_TYPES.length - 1 && x > HEAD_TYPES[t].w) { x -= HEAD_TYPES[t].w; t++; }
      if (t !== prevType) break;
    }
    prevType = t;
    return HEAD_TYPES[t];
  };

  const addFloret = (p, n, s, spin, color, tint) => {
    qA.setFromUnitVectors(Z, n);
    qS.setFromAxisAngle(Z, spin);
    q.multiplyQuaternions(qA, qS);
    scl.set(s * rr(0.88, 1.12), s * rr(0.88, 1.12), s * rr(0.8, 1.2));
    m4.compose(p, q, scl);
    const b = inst[rng() < 0.5 ? 0 : 1];
    b.mats.push(...m4.elements);
    b.cols.push(color.r, color.g, color.b);
    b.tints.push(tint[0], tint[1], tint[2], tint[3]);
  };

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const off = rng();
    for (let k = 0; k < row.n; k++) {
      const th = ((k + off + (rng() - 0.5) * 0.2) / row.n) * Math.PI * 2;
      const psi = (row.psi + (rng() - 0.5) * 2 * row.jit) * DEG;
      const Rs = rr(row.rs[0], row.rs[1]);
      const alpha = row.alpha * DEG;

      R.set(Math.cos(th), Math.sin(th), 0);
      T1.set(-Math.sin(th), Math.cos(th), 0);
      N.copy(R).multiplyScalar(Math.cos(psi)).addScaledVector(Z, Math.sin(psi)).normalize();
      T2.crossVectors(N, T1).normalize();
      const [er, ez] = ellipseAtNormal(psi);
      S.copy(R).multiplyScalar(RING_RC + er).addScaledVector(Z, ez);
      Hc.copy(S).addScaledVector(N, Rs * 0.92 - Rs);
      heads.push({ th, psi, Rs });

      // head colouring
      const type = pickType();
      colA.set(pick(type.a));
      colB.set(pick(type.b));
      edgeC.set(pick(type.edge));
      const edgeBase = rr(type.edgeAmt[0], type.edgeAmt[1]);
      const ga = rng() * Math.PI * 2;
      gradDir.copy(T1).multiplyScalar(Math.cos(ga)).addScaledVector(T2, Math.sin(ga));
      const gradSharp = rr(2.5, 5.0);

      const rf = floretRadius * rr(0.9, 1.12) * (0.75 + 0.25 * Rs / 0.27);
      const capArea = 2 * (1 - Math.cos(alpha));
      const nOuter = Math.max(8, Math.round(cover * capArea * (Rs / rf) ** 2));
      const nFill = Math.max(3, Math.round(nOuter * fillFrac));
      const phase = rng() * Math.PI * 2;

      for (let layer = 0; layer < 2; layer++) {
        const cnt = layer === 0 ? nOuter : nFill;
        const rad = layer === 0 ? Rs : Rs * 0.72;
        const capA = layer === 0 ? alpha : Math.min(alpha + 10 * DEG, 95 * DEG);
        const spacing = Math.sqrt((2 * (1 - Math.cos(capA))) / cnt);
        for (let i = 0; i < cnt; i++) {
          const f = (i + 0.5) / cnt;
          const cosT = 1 - (1 - Math.cos(capA)) * f;
          const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
          const ph = i * GOLDEN + phase;
          dir.copy(N).multiplyScalar(cosT)
            .addScaledVector(T1, Math.cos(ph) * sinT)
            .addScaledVector(T2, Math.sin(ph) * sinT);
          jit.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(spacing * 0.6);
          dir.add(jit).normalize();
          pos.copy(Hc).addScaledVector(dir, rad * rr(0.95, 1.05));
          nrm.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.7).add(dir).normalize();
          const edgeShrink = 1 - 0.22 * f * f;
          const s = rf * rr(0.8, 1.2) * edgeShrink * (layer ? 0.9 : 1);

          // colour: gradient A->B across the head, odd florets, HSL jitter
          const g = smooth(-1, 1, gradDir.dot(dir) * gradSharp / Math.max(0.3, Math.sin(capA)));
          tmpC.copy(colA).lerp(colB, g);
          if (rng() < type.oddP) tmpC.lerp(tmpC2.set(pick(type.odd)), rr(0.75, 1.0));
          tmpC.getHSL(hsl, THREE.SRGBColorSpace);
          tmpC.setHSL(
            (hsl.h + (rng() - 0.5) * 0.035 + 1) % 1,
            Math.min(1, Math.max(0, hsl.s + (rng() - 0.5) * 0.16 + 0.04)),
            Math.min(0.8, Math.max(0.1, hsl.l + (rng() - 0.5) * 0.1 - 0.04)),
            THREE.SRGBColorSpace);

          // baked occlusion: deeper florets and those near the core are darker
          const rho = Math.hypot(pos.x, pos.y);
          const dCore = Math.hypot(rho - RING_RC, pos.z / 0.8);
          let ao = (layer ? 0.5 : 1 - 0.28 * Math.pow(f, 1.6)) * (0.6 + 0.4 * smooth(0.18, 0.5, dCore));
          tmpC.multiplyScalar(ao);

          // margins: some florets strongly edged, others almost clean -> reads as contrast, not mud
          const ea = rng() < 0.3 + 0.6 * edgeBase ? Math.min(1, rr(0.8, 1.05) * (0.5 + 0.5 * edgeBase)) : rr(0, 0.15);
          const tint = [edgeC.r * ao, edgeC.g * ao, edgeC.b * ao, ea];
          addFloret(pos, nrm, s, rng() * Math.PI * 2, tmpC, tint);
        }
      }
    }
  }

  for (let vi = 0; vi < 2; vi++) {
    const cfg = vi === 0
      ? { width: 0.5, round: 0.5, tip: 0.87, cup: 0.2, droop: 0.04, fold: 0.07, ruffle: 0.05, angJit: 0.18, lenJit: 0.12 }
      : { width: 0.46, round: 0.6, tip: 0.91, cup: 0.08, droop: 0.16, fold: -0.05, ruffle: 0.09, angJit: 0.25, lenJit: 0.16 };
    const geo = low ? makeFloretGeometry(4, 2, cfg, rng) : makeFloretGeometry(4, 4, cfg, rng);
    const b = inst[vi];
    const count = b.cols.length / 3;
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(b.tints), 4));
    const mesh = new THREE.InstancedMesh(geo, floretMat, count);
    mesh.instanceMatrix.array.set(b.mats);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(b.cols), 3);
    mesh.name = 'hydrangeaFlorets' + vi;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  /* ---------- leaves ---------- */
  const leafData = [];
  const L = new THREE.Vector3(), Ln = new THREE.Vector3(), X = new THREE.Vector3();
  const addLeaf = (th, psi, lenDir, len, lift, tintHex) => {
    R.set(Math.cos(th), Math.sin(th), 0);
    T1.set(-Math.sin(th), Math.cos(th), 0);
    N.copy(R).multiplyScalar(Math.cos(psi)).addScaledVector(Z, Math.sin(psi)).normalize();
    const [er, ez] = ellipseAtNormal(psi);
    S.copy(R).multiplyScalar(RING_RC + er).addScaledVector(Z, ez).addScaledVector(N, lift);
    L.copy(lenDir).normalize();
    Ln.copy(N).addScaledVector(L, -N.dot(L));
    if (Ln.lengthSq() < 1e-4) Ln.copy(Z);
    Ln.normalize();
    X.crossVectors(L, Ln).normalize();
    m4.makeBasis(X, L, Ln);
    m4.scale(scl.set(len * rr(0.85, 1.1), len, len));
    m4.setPosition(S);
    tmpC.set(tintHex);
    tmpC.offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.06);
    leafData.push(m4.clone(), tmpC.clone());
  };
  const leafTints = ['#ffffff', '#f2f6e6', '#fff0d0', '#e8f0e0', '#ffe0d8'];
  const nLeafRim = low ? 8 : 12;
  for (let k = 0; k < nLeafRim; k++) {
    const th = ((k + rng() * 0.6) / nLeafRim) * Math.PI * 2;
    R.set(Math.cos(th), Math.sin(th), 0); T1.set(-Math.sin(th), Math.cos(th), 0);
    // outer rim, peeking out between heads
    const d = R.clone().multiplyScalar(0.8).addScaledVector(T1, (rng() < 0.5 ? -1 : 1) * rr(0.5, 1.0)).addScaledVector(Z, rr(-0.25, 0.1));
    addLeaf(th, rr(-20, 10) * DEG, d, rr(0.36, 0.44), 0.02, pick(leafTints));
  }
  const nLeafIn = low ? 4 : 6;
  for (let k = 0; k < nLeafIn; k++) {
    const th = ((k + rng() * 0.6) / nLeafIn) * Math.PI * 2;
    R.set(Math.cos(th), Math.sin(th), 0); T1.set(-Math.sin(th), Math.cos(th), 0);
    const d = R.clone().multiplyScalar(-1).addScaledVector(T1, (rng() - 0.5) * 0.8).addScaledVector(Z, rr(0.0, 0.3));
    addLeaf(th, rr(160, 185) * DEG, d, rr(0.3, 0.36), 0.02, pick(leafTints));
  }
  const nLeafBack = low ? 14 : 22;
  for (let k = 0; k < nLeafBack; k++) {
    const th = ((k + rng() * 0.5) / nLeafBack) * Math.PI * 2;
    T1.set(-Math.sin(th), Math.cos(th), 0);
    R.set(Math.cos(th), Math.sin(th), 0);
    const d = T1.clone().multiplyScalar(rng() < 0.5 ? 1 : -1).addScaledVector(R, (rng() - 0.5) * 0.8);
    addLeaf(th, rr(240, 300) * DEG, d, rr(0.44, 0.56), 0.015 + 0.01 * (k % 2), pick(leafTints));
  }
  const leafCount = leafData.length / 2;
  const leaves = new THREE.InstancedMesh(makeLeafGeometry(low ? 5 : 8), leafMat, leafCount);
  for (let i = 0; i < leafCount; i++) {
    leaves.setMatrixAt(i, leafData[i * 2]);
    leaves.setColorAt(i, leafData[i * 2 + 1]);
  }
  leaves.name = 'leaves';
  leaves.computeBoundingBox();
  leaves.computeBoundingSphere();
  group.add(leaves);

  group.userData.heads = heads.length;
  return group;
}
