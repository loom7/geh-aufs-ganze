// prize-zonk.js — procedural plush "Zonk" mascot (three.js r186)
// Red velvet head with a long drooping trunk-snout, shaggy anthracite faux fur (shell texturing),
// floppy fur ears with red velvet inner side, red hugging arms and red boots.
// No external assets: all textures are generated on a canvas.
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
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

function bake(geo, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scl)
  );
  return geo.applyMatrix4(m);
}

function ellipsoid(ws, hs, radii, center, rot = [0, 0, 0]) {
  return bake(new THREE.SphereGeometry(1, ws, hs), center, rot, radii);
}

// Minimal merge (all inputs: indexed, position + normal only). Avoids attribute-set mismatches.
function mergeSimple(geos) {
  let vCount = 0, iCount = 0;
  for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3), nrm = new Float32Array(vCount * 3), col = new Float32Array(vCount * 3).fill(1);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nrm.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, vo * 3);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
    vo += g.attributes.position.count;
    io += src.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// Cheap baked contact occlusion: darken vertices whose normal points into a nearby ellipsoid.
// occluders: [{ c: [x,y,z], r: [rx,ry,rz] }]. Always adds a 'color' attribute (velvet uses vertexColors).
function bakeAO(geo, occluders = [], strength = 0.6) {
  const p = geo.attributes.position.array, n = geo.attributes.normal.array;
  const count = geo.attributes.position.count;
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let occ = 0;
    for (const o of occluders) {
      for (const k of [0.035, 0.09]) {
        const qx = (p[i * 3] + n[i * 3] * k - o.c[0]) / o.r[0];
        const qy = (p[i * 3 + 1] + n[i * 3 + 1] * k - o.c[1]) / o.r[1];
        const qz = (p[i * 3 + 2] + n[i * 3 + 2] * k - o.c[2]) / o.r[2];
        const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
        occ = Math.max(occ, smooth(1.22, 0.92, d) * (k < 0.05 ? 1 : 0.7));
      }
    }
    const v = 1 - strength * occ;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// Tube along a Catmull-Rom spline with a radius profile r(u) and analytic normals (no seam).
function taperedTube(points, tubular, radial, radiusFn, squash = 1) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const frames = curve.computeFrenetFrames(tubular, false);
  const L = curve.getLength();
  const pos = [], nrm = [], idx = [];
  const P = new THREE.Vector3(), D = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    curve.getPointAt(u, P);
    const T = frames.tangents[i], N = frames.normals[i], B = frames.binormals[i];
    const r = radiusFn(u);
    const e = 0.004;
    const slope = THREE.MathUtils.clamp((radiusFn(Math.min(1, u + e)) - radiusFn(Math.max(0, u - e))) / (2 * e) / L, -40, 40);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = -Math.cos(a), s = Math.sin(a);
      pos.push(
        P.x + r * (c * N.x + s * squash * B.x),
        P.y + r * (c * N.y + s * squash * B.y),
        P.z + r * (c * N.z + s * squash * B.z)
      );
      D.set(c * N.x + (s / squash) * B.x, c * N.y + (s / squash) * B.y, c * N.z + (s / squash) * B.z).normalize();
      D.addScaledVector(T, -slope).normalize();
      nrm.push(D.x, D.y, D.z);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1, c = b + 1, d = a + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.userData.curve = curve;
  return g;
}

/* ------------------------------------------------------------------ */
/* Fur: strand texture, shell geometry, patched materials              */
/* ------------------------------------------------------------------ */

// R = tapered strand height (cone), G = strand tone (0 dark .. 1 silver), B = strand length.
function createStrandTexture(rng, size) {
  const R = new Float32Array(size * size), G = new Float32Array(size * size), B = new Float32Array(size * size);
  const fine = 23;
  const grid2 = new Float32Array(fine * fine).map(() => rng());
  const vnoise = (gr, n, x, y) => {
    const gx = (x / size) * n, gy = (y / size) * n;
    const ix = Math.floor(gx), iy = Math.floor(gy);
    let fx = gx - ix, fy = gy - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = gr[((iy % n) * n + (ix % n)) % (n * n)], b = gr[((iy % n) * n + ((ix + 1) % n))];
    const c = gr[(((iy + 1) % n) * n + (ix % n))], d = gr[(((iy + 1) % n) * n + ((ix + 1) % n))];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  // locks/clumps: strands gather around clump centres and share their length and tone
  const nClumps = 150;
  const clumps = [];
  for (let c = 0; c < nClumps; c++) {
    clumps.push({ x: rng() * size, y: rng() * size, len: 0.5 + 0.5 * Math.pow(rng(), 0.6), tone: rng() });
  }
  const wrapD = (a) => { a = Math.abs(a) % size; return Math.min(a, size - a); };
  const count = Math.floor((size * size) / 4.0);
  for (let k = 0; k < count; k++) {
    let cx = rng() * size, cy = rng() * size;
    let best = clumps[0], bd = 1e9, bdx = 0, bdy = 0;
    for (const c of clumps) {
      let dx = c.x - cx, dy = c.y - cy;
      if (dx > size / 2) dx -= size; else if (dx < -size / 2) dx += size;
      if (dy > size / 2) dy -= size; else if (dy < -size / 2) dy += size;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = c; bdx = dx; bdy = dy; }
    }
    const dist = Math.sqrt(bd) / (size / Math.sqrt(nClumps));   // ~0 centre .. ~0.7 border
    cx += bdx * 0.12; cy += bdy * 0.12;                           // pull towards the lock centre -> partings
    const rad = 1.1 + rng() * 1.2;
    const fineN = vnoise(grid2, fine, cx, cy);
    const len = Math.min(1, best.len * (0.6 + 0.4 * rng()) * (1.0 - 0.3 * dist) * (0.8 + 0.35 * fineN));
    const tone = Math.min(1, best.tone * 0.35 + rng() * 0.75);
    const ir = Math.ceil(rad);
    const px0 = Math.floor(cx), py0 = Math.floor(cy);
    for (let dy = -ir; dy <= ir; dy++) {
      for (let dx = -ir; dx <= ir; dx++) {
        const px = px0 + dx, py = py0 + dy;
        const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
        if (d >= rad) continue;
        const v = len * Math.pow(1 - d / rad, 0.6);
        const i = (((py % size) + size) % size) * size + (((px % size) + size) % size);
        if (v > R[i]) { R[i] = v; G[i] = tone; B[i] = len; }
      }
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    img.data[i * 4] = Math.round(R[i] * 255);
    img.data[i * 4 + 1] = Math.round(Math.min(1, G[i]) * 255);
    img.data[i * 4 + 2] = Math.round(B[i] * 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;      // data texture, not colour
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;        // no mipmaps: averaging would erase the strands
  tex.generateMipmaps = false;
  return tex;
}

// Build a fur base from an ellipsoid; fn(i, unit[x,y,z], out) sets out.len (0..1) and out.u/out.v (fur uv).
function furBase({ ws, hs, radii, center = [0, 0, 0], rot = [0, 0, 0], poleAxis = 'y', fn }) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  if (poleAxis === 'x') g.rotateZ(Math.PI / 2);
  if (poleAxis === 'z') g.rotateX(Math.PI / 2);
  const unit = g.attributes.position.array.slice();
  const uv = g.attributes.uv.array;
  bake(g, center, rot, radii);
  const n = g.attributes.position.count;
  const len = new Float32Array(n), fuv = new Float32Array(n * 2);
  const P = g.attributes.position.array;
  const out = { len: 1, u: 0, v: 0 };
  const U = [0, 0, 0], W = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    out.len = 1; out.u = uv[i * 2]; out.v = uv[i * 2 + 1];
    U[0] = unit[i * 3]; U[1] = unit[i * 3 + 1]; U[2] = unit[i * 3 + 2];
    W[0] = P[i * 3]; W[1] = P[i * 3 + 1]; W[2] = P[i * 3 + 2];
    fn(i, U, W, out);
    len[i] = out.len; fuv[i * 2] = out.u; fuv[i * 2 + 1] = out.v;
  }
  g.userData.len = len;
  g.userData.fuv = fuv;
  return g;
}

// N copies of the base surface, each tagged with its shell index (0 = skin .. 1 = tips). One draw call.
function buildShells(base, shells, reach) {
  const pos = base.attributes.position.array, nrm = base.attributes.normal.array;
  const { len, fuv } = base.userData;
  const n = base.attributes.position.count;
  const src = base.index.array;
  const P = new Float32Array(n * shells * 3), N = new Float32Array(n * shells * 3);
  const UV = new Float32Array(n * shells * 2), S = new Float32Array(n * shells), F = new Float32Array(n * shells);
  const I = new Uint32Array(src.length * shells);
  for (let s = 0; s < shells; s++) {
    const sh = s / (shells - 1);
    P.set(pos, s * n * 3);
    N.set(nrm, s * n * 3);
    UV.set(fuv, s * n * 2);
    F.set(len, s * n);
    S.fill(sh, s * n, (s + 1) * n);
    const off = s * n, io = s * src.length;
    for (let i = 0; i < src.length; i++) I[io + i] = src[i] + off;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('aFurUv', new THREE.BufferAttribute(UV, 2));
  g.setAttribute('aShell', new THREE.BufferAttribute(S, 1));
  g.setAttribute('aFurLen', new THREE.BufferAttribute(F, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingSphere();
  g.boundingSphere.radius += reach;
  g.computeBoundingBox();
  g.boundingBox.expandByScalar(reach * 0.6);
  return g;
}

const FUR_VERT_HEAD = /* glsl */`
attribute float aShell;
attribute float aFurLen;
attribute vec2 aFurUv;
uniform float uTime;
uniform float uFurLength;
uniform float uDroop;
uniform float uCurl;
uniform float uWind;
varying float vShell;
varying float vFurLen;
varying vec2 vFurUv;
`;

const FUR_VERT_BODY = /* glsl */`
#include <begin_vertex>
{
  float sh = aShell;
  float L = uFurLength * aFurLen;
  vec3 gDir = normalize((vec4(0.0, -1.0, 0.0, 0.0) * modelMatrix).xyz);   // world down in object space
  vec3 p = position * 6.0;
  vec3 flow = vec3(sin(p.y * 1.3 + p.z * 1.7), 0.5 * sin(p.z * 1.1 + p.x * 1.9), sin(p.x * 1.5 + p.y * 1.2));
  vec3 wind = vec3(sin(uTime * 1.6 + position.y * 5.0 + position.x * 3.0), 0.0, cos(uTime * 1.2 + position.x * 4.0 + position.z * 3.0));
  float s2 = sh * sh;
  transformed += normal * (sh * L);
  transformed += gDir * (s2 * L * uDroop);
  transformed += (flow * uCurl + wind * uWind) * (s2 * L);
  vShell = sh;
  vFurLen = aFurLen;
  vFurUv = aFurUv;
}
`;

const FUR_FRAG_HEAD = /* glsl */`
#include <common>
uniform sampler2D uStrandMap;
uniform vec3 uRoot;
uniform vec3 uTipDark;
uniform vec3 uTipLight;
varying float vShell;
varying float vFurLen;
varying vec2 vFurUv;
`;

const FUR_FRAG_COLOR = /* glsl */`
#include <color_fragment>
vec4 furS = texture2D(uStrandMap, vFurUv);
if (vShell > 0.001) {
  if (vFurLen < 0.04 || furS.r < vShell + 0.015) discard;
}
float furRel = clamp(vShell / max(furS.b, 0.06), 0.0, 1.0);
vec3 furTip = mix(uTipDark, uTipLight, smoothstep(0.55, 0.9, furS.g));
diffuseColor.rgb = mix(uRoot, furTip, smoothstep(0.2, 1.0, furRel));
float furAO = mix(0.4, 1.0, smoothstep(0.0, 0.8, vShell));
diffuseColor.rgb *= mix(0.55, 1.0, furAO);
`;

const FUR_FRAG_AO = /* glsl */`
#include <aomap_fragment>
reflectedLight.indirectDiffuse *= furAO;
reflectedLight.indirectSpecular *= furAO * furAO;
reflectedLight.directDiffuse *= mix(0.6, 1.0, furAO);
`;

function createFurMaterial(shared, { length, droop, curl = 0.3, wind = 0.07, root = '#161415', tipDark = '#46403f', tipLight = '#c2bebc' }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0 });
  const uniforms = {
    uFurLength: { value: length },
    uDroop: { value: droop },
    uCurl: { value: curl },
    uWind: { value: wind },
    uRoot: { value: new THREE.Color(root) },
    uTipDark: { value: new THREE.Color(tipDark) },
    uTipLight: { value: new THREE.Color(tipLight) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uStrandMap = shared.strandMap;
    shader.vertexShader = FUR_VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', FUR_VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FUR_FRAG_HEAD)
      .replace('#include <color_fragment>', FUR_FRAG_COLOR)
      .replace('#include <aomap_fragment>', FUR_FRAG_AO);
  };
  mat.customProgramCacheKey = () => 'zonk-fur-shells-v1';
  mat.userData.furUniforms = uniforms;
  return mat;
}

// Long single guard hairs: frayed silhouettes like real faux fur.
function createHairMaterial(shared, { droop = 0.8, wind = 0.12 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uDroop = { value: droop };
    shader.uniforms.uWind = { value: wind };
    shader.vertexShader = 'uniform float uTime;\nuniform float uDroop;\nuniform float uWind;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      /* glsl */`
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        float hLen = length(instanceMatrix[1].xyz);
      #else
        float hLen = 0.1;
      #endif
      {
        float ht = position.y;
        vec3 gDir = normalize((vec4(0.0, -1.0, 0.0, 0.0) * modelMatrix).xyz);
        vec3 w = vec3(sin(uTime * 1.6 + mvPosition.y * 5.0 + mvPosition.x * 3.0), 0.0, cos(uTime * 1.2 + mvPosition.x * 4.0 + mvPosition.z * 3.0));
        mvPosition.xyz += (gDir * uDroop + w * uWind) * (hLen * ht * ht);
      }
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
      `
    );
  };
  mat.customProgramCacheKey = () => 'zonk-guard-hair-v1';
  return mat;
}

function strandGeometry(segs = 4, sides = 3) {
  const pos = [], col = [], idx = [];
  const root = new THREE.Color('#1c1a1b'), tip = new THREE.Color('#b9b5b2'), c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const r = Math.pow(1 - t, 0.85);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      pos.push(Math.cos(a) * r, t, Math.sin(a) * r);
      c.copy(root).lerp(tip, Math.pow(t, 1.3));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + ((j + 1) % sides), c2 = a + sides, d = b + sides;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Scatter guard hairs over a fur base (area * fur length weighted).
function createGuardHairs(base, count, rng, material, strandGeo, { length, width = 0.006, outward = 1 }) {
  const pos = base.attributes.position.array, nrm = base.attributes.normal.array, idx = base.index.array;
  const len = base.userData.len;
  const triCount = idx.length / 3;
  const cdf = new Float32Array(triCount);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), E = new THREE.Vector3();
  let acc = 0;
  for (let t = 0; t < triCount; t++) {
    const ia = idx[t * 3], ib = idx[t * 3 + 1], ic = idx[t * 3 + 2];
    A.fromArray(pos, ia * 3); B.fromArray(pos, ib * 3); C.fromArray(pos, ic * 3);
    const area = E.subVectors(B, A).cross(C.sub(A)).length() * 0.5;
    const l = (len[ia] + len[ib] + len[ic]) / 3;
    const ny = (nrm[ia * 3 + 1] + nrm[ib * 3 + 1] + nrm[ic * 3 + 1]) / 3;
    acc += area * (l > 0.35 ? l * l : 0) * smooth(-0.55, -0.1, ny);
    cdf[t] = acc;
  }
  const mesh = new THREE.InstancedMesh(strandGeo, material, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), P = new THREE.Vector3(), N = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), col = new THREE.Color();
  const dark = new THREE.Color(0.35, 0.33, 0.33), silver = new THREE.Color(1, 1, 1);
  for (let k = 0; k < count; k++) {
    const r = rng() * acc;
    let lo = 0, hi = triCount - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
    const ia = idx[lo * 3], ib = idx[lo * 3 + 1], ic = idx[lo * 3 + 2];
    let u = rng(), v = rng();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    P.set(0, 0, 0).addScaledVector(A.fromArray(pos, ia * 3), w).addScaledVector(B.fromArray(pos, ib * 3), u).addScaledVector(C.fromArray(pos, ic * 3), v);
    N.set(0, 0, 0).addScaledVector(A.fromArray(nrm, ia * 3), w).addScaledVector(B.fromArray(nrm, ib * 3), u).addScaledVector(C.fromArray(nrm, ic * 3), v).normalize();
    const l = (len[ia] * w + len[ib] * u + len[ic] * v);
    dir.copy(N).multiplyScalar(outward).add(E.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.7)).normalize();
    q.setFromUnitVectors(up, dir);
    P.addScaledVector(N, -0.01);
    const hl = length * l * (0.8 + rng() * 0.9);
    const hw = width * (0.7 + rng() * 0.6);
    m.compose(P, q, s.set(hw, hl, hw));
    mesh.setMatrixAt(k, m);
    mesh.setColorAt(k, col.copy(dark).lerp(silver, rng() < 0.35 ? 0.55 + rng() * 0.45 : rng() * 0.3));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Zonk                                                                */
/* ------------------------------------------------------------------ */

export function createZonk({ quality = 'high', seed = 7 } = {}) {
  const hi = quality !== 'low';
  const rng = mulberry32(seed);
  const Q = (a, b) => (hi ? a : b);

  const root = new THREE.Group();
  root.name = 'Zonk';

  const shared = {
    uTime: { value: 0 },
    strandMap: { value: createStrandTexture(rng, 256) },
  };
  const SHELLS = Q(22, 12);

  /* ---------------- materials ---------------- */
  const velvet = new THREE.MeshPhysicalMaterial({
    color: '#d20f18', roughness: 0.88, metalness: 0, vertexColors: true,
    sheen: 1, sheenColor: new THREE.Color('#ff7a66'), sheenRoughness: 0.4,
    specularIntensity: 0.18,
  });
  const noseMat = new THREE.MeshPhysicalMaterial({
    color: '#0b0a0c', roughness: 0.7, sheen: 1, sheenColor: new THREE.Color('#5a5560'), sheenRoughness: 0.45,
  });
  const eyeBlack = new THREE.MeshPhysicalMaterial({
    color: '#040405', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03,
  });
  const eyeWhite = new THREE.MeshPhysicalMaterial({
    color: '#e9e6e2', roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#ffffff'),
  });
  const hairMat = createHairMaterial(shared, { droop: 1.0, wind: 0.1 });
  const strandGeo = strandGeometry(3, 3);

  /* ---------------- torso (breathing group) ---------------- */
  const torsoPivot = new THREE.Vector3(0, -0.32, 0);
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.copy(torsoPivot);
  const torsoInner = new THREE.Group();
  torsoInner.position.copy(torsoPivot).negate();
  torso.add(torsoInner);
  root.add(torso);

  // arms: thick velvet tubes hugging the chest
  const armR = [
    new THREE.Vector3(-0.26, 0.17, -0.1), new THREE.Vector3(-0.385, 0.15, 0.04), new THREE.Vector3(-0.36, 0.12, 0.21),
    new THREE.Vector3(-0.22, 0.1, 0.355), new THREE.Vector3(-0.07, 0.12, 0.42),
  ];
  const armL = [
    new THREE.Vector3(0.26, 0.1, -0.1), new THREE.Vector3(0.385, 0.08, 0.04), new THREE.Vector3(0.365, 0.03, 0.21),
    new THREE.Vector3(0.23, -0.01, 0.36), new THREE.Vector3(0.1, 0.01, 0.44),
  ];
  const armProfile = (u) => 0.088 + 0.01 * (1 - u) * (1 - u) - 0.006 * smooth(0.6, 1, u);
  const bodyC = [0, 0.04, -0.02], bodyRad = [0.37, 0.46, 0.37];
  const bodyOcc = { c: bodyC, r: bodyRad.map((v) => v + 0.02) };
  const handA = { c: [0.005, 0.15, 0.435], r: [0.13, 0.092, 0.064] }, handB = { c: [0.085, 0.01, 0.475], r: [0.135, 0.097, 0.068] };
  const redTorso = [];
  const armGeoR = taperedTube(armR, Q(48, 24), Q(18, 12), armProfile);
  const armGeoL = taperedTube(armL, Q(48, 24), Q(18, 12), armProfile);
  redTorso.push(bakeAO(armGeoR, [bodyOcc, handA]), bakeAO(armGeoL, [bodyOcc, handB]));
  // mitten hands
  redTorso.push(bakeAO(ellipsoid(Q(30, 16), Q(20, 12), handA.r, handA.c, [0.2, 0.25, 0.5]), [bodyOcc, handB], 0.45));
  redTorso.push(bakeAO(ellipsoid(Q(30, 16), Q(20, 12), handB.r, handB.c, [0.1, -0.3, -0.55]), [bodyOcc], 0.45));
  const torsoRed = new THREE.Mesh(mergeSimple(redTorso), velvet);
  torsoRed.name = 'arms';
  torsoInner.add(torsoRed);

  // body fur: plump egg, fur shortened where the arms press into it
  const armSamples = [];
  for (const c of [armGeoR.userData.curve, armGeoL.userData.curve]) {
    for (let i = 8; i <= 40; i++) armSamples.push(c.getPointAt(i / 40));
  }
  const tmp = new THREE.Vector3();
  const bodyBase = furBase({
    ws: Q(42, 28), hs: Q(28, 18), radii: bodyRad, center: bodyC,
    fn: (i, U, W, out) => {
      tmp.fromArray(W);
      let dmin = 10;
      for (const s of armSamples) { const d = tmp.distanceToSquared(s); if (d < dmin) dmin = d; }
      dmin = Math.sqrt(dmin);
      out.len = (0.12 + 0.88 * smooth(0.075, 0.2, dmin)) * (0.85 + 0.25 * smooth(0.2, -0.8, U[1]));
      out.u *= 8; out.v *= 4;
    },
  });
  const bodyFurMat = createFurMaterial(shared, { length: 0.14, droop: 1.2, curl: 0.2, wind: 0.06 });
  const bodyFur = new THREE.Mesh(buildShells(bodyBase, SHELLS, 0.3), bodyFurMat);
  bodyFur.name = 'bodyFur';
  torsoInner.add(bodyFur);
  const bodyHair = createGuardHairs(bodyBase, Q(240, 120), rng, hairMat, strandGeo, { length: 0.13, width: 0.004 });
  bodyHair.name = 'bodyHair';
  torsoInner.add(bodyHair);

  /* ---------------- legs + boots (static) ---------------- */
  const legParts = [];
  for (const sx of [-1, 1]) {
    legParts.push(bakeAO(taperedTube(
      [new THREE.Vector3(sx * 0.15, -0.2, -0.01), new THREE.Vector3(sx * 0.165, -0.48, 0.0), new THREE.Vector3(sx * 0.19, -0.75, 0.03)],
      Q(20, 10), Q(18, 12), (u) => 0.1 + 0.025 * u * u
    ), [bodyOcc, { c: [-sx * 0.16, -0.5, 0], r: [0.11, 0.36, 0.11] }], 0.5));
    const foot = ellipsoid(Q(32, 18), Q(22, 12), [0.16, 0.12, 0.27], [sx * 0.215, -0.8, 0.12], [0.05, sx * 0.18, 0]);
    const p = foot.attributes.position;
    for (let i = 0; i < p.count; i++) {       // flatten the sole
      const y = p.getY(i);
      if (y < -0.86) p.setY(i, -0.86 - (y + 0.86) * 0.35);
    }
    foot.computeVertexNormals();
    legParts.push(bakeAO(foot, [{ c: [sx * 0.19, -0.55, 0.02], r: [0.11, 0.25, 0.11] }], 0.35));
  }
  const legs = new THREE.Mesh(mergeSimple(legParts), velvet);
  legs.name = 'legs';
  root.add(legs);

  /* ---------------- head ---------------- */
  const headPivot = new THREE.Vector3(0, 0.52, 0);
  const head = new THREE.Group();
  head.name = 'head';
  head.position.copy(headPivot);
  head.rotation.set(0.04, 0.06, 0.1);
  const headInner = new THREE.Group();
  headInner.position.copy(headPivot).negate();
  head.add(headInner);
  root.add(head);

  const HC = new THREE.Vector3(0, 0.76, 0.0), HR = new THREE.Vector3(0.175, 0.215, 0.18);
  const mopC = [0, 0.8, -0.1], mopR = [0.3, 0.235, 0.21];
  const headRed = new THREE.Mesh(bakeAO(ellipsoid(Q(40, 24), Q(28, 16), HR.toArray(), HC.toArray()), [bodyOcc, { c: mopC, r: mopR }], 0.45), velvet);
  headRed.name = 'headDome';
  headInner.add(headRed);

  // eyes: glossy black beads with a thin white rim
  const whites = [], beads = [];
  for (const sx of [-1, 1]) {
    const d = new THREE.Vector3(sx * 0.46, 0.1, 0.88).normalize();
    const p = new THREE.Vector3(d.x * HR.x, d.y * HR.y, d.z * HR.z).add(HC);
    const n = new THREE.Vector3(d.x / HR.x, d.y / HR.y, d.z / HR.z).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const rot = new THREE.Euler().setFromQuaternion(q);
    whites.push(bake(new THREE.SphereGeometry(1, 20, 14), p.clone().addScaledVector(n, -0.004).toArray(), [rot.x, rot.y, rot.z], [0.031, 0.029, 0.012]));
    beads.push(bake(new THREE.SphereGeometry(1, 20, 14), p.clone().addScaledVector(n, 0.003).toArray(), [rot.x, rot.y, rot.z], [0.025, 0.025, 0.017]));
  }
  headInner.add(new THREE.Mesh(mergeSimple(whites), eyeWhite), new THREE.Mesh(mergeSimple(beads), eyeBlack));

  // snout: long trunk curving forward and down, slightly thicker again at the tip
  const snoutPivot = new THREE.Vector3(0, 0.66, 0.08);
  const snout = new THREE.Group();
  snout.name = 'snout';
  snout.position.copy(snoutPivot);
  const snoutInner = new THREE.Group();
  snoutInner.position.copy(snoutPivot).negate();
  snout.add(snoutInner);
  headInner.add(snout);
  const snoutPts = [
    new THREE.Vector3(0, 0.67, -0.02), new THREE.Vector3(0.0, 0.645, 0.15), new THREE.Vector3(0.015, 0.57, 0.31),
    new THREE.Vector3(0.045, 0.44, 0.44), new THREE.Vector3(0.075, 0.3, 0.52), new THREE.Vector3(0.1, 0.19, 0.6),
  ];
  const capStart = 0.925;
  const snoutProfile = (u) => {
    let r = 0.07 + 0.08 * Math.pow(1 - u, 2.2) + 0.024 * smooth(0.55, 0.9, u);
    if (u > capStart) r *= Math.sqrt(Math.max(0, 1 - Math.pow((u - capStart) / (1 - capStart), 2)));
    return r;
  };
  const snoutGeo = taperedTube(snoutPts, Q(72, 36), Q(24, 14), snoutProfile, 1.08);
  bakeAO(snoutGeo, [{ c: HC.toArray(), r: HR.toArray() }, { c: [bodyC[0], bodyC[1], bodyC[2]], r: bodyRad.map((v) => v + 0.1) }, handA, handB], 0.5);
  const snoutMesh = new THREE.Mesh(snoutGeo, velvet);
  snoutMesh.name = 'snoutTube';
  snoutInner.add(snoutMesh);
  const sc = snoutGeo.userData.curve;
  const tipP = sc.getPointAt(1), tipT = sc.getTangentAt(1);
  const noseP = tipP.clone().addScaledVector(tipT, -0.012);
  const noseQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tipT);
  const noseE = new THREE.Euler().setFromQuaternion(noseQ);
  const nose = new THREE.Mesh(bake(new THREE.SphereGeometry(1, Q(28, 16), Q(20, 12)), noseP.toArray(), [noseE.x, noseE.y, noseE.z], [0.066, 0.06, 0.058]), noseMat);
  nose.name = 'nose';
  snoutInner.add(nose);

  // shaggy fur mop on top/back of the head, connecting the ears
  const mopBase = furBase({
    ws: Q(32, 20), hs: Q(18, 12), radii: mopR, center: mopC, rot: [0.3, 0, 0], poleAxis: 'x',
    fn: (i, U, W, out) => {
      // ellipsoidal distance to the red head: no fur growing out of the face
      const ex = W[0] / HR.x, ey = (W[1] - HC.y) / HR.y, ez = W[2] / HR.z;
      const dh = Math.sqrt(ex * ex + ey * ey + ez * ez);
      const front = smooth(0.0, 0.6, (W[2] - 0.02) / 0.15) * smooth(0.95, 0.8, (W[1] - 0.6) / 0.4);
      out.len = smooth(0.92, 1.12, dh) * (1 - 0.85 * front);
      out.u *= 4; out.v *= 4;
    },
  });
  const mopFurMat = createFurMaterial(shared, { length: 0.16, droop: 0.7, curl: 0.45, wind: 0.08 });
  const mopFur = new THREE.Mesh(buildShells(mopBase, SHELLS, 0.3), mopFurMat);
  mopFur.name = 'mopFur';
  headInner.add(mopFur);
  const mopHair = createGuardHairs(mopBase, Q(140, 70), rng, hairMat, strandGeo, { length: 0.16, width: 0.004 });
  headInner.add(mopHair);

  // ears: floppy, drooping sideways; red velvet oval inside, fur on back and frayed rim
  const earFurMat = createFurMaterial(shared, { length: 0.16, droop: 1.0, curl: 0.25, wind: 0.09 });
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    ear.name = sx < 0 ? 'earR' : 'earL';
    ear.position.set(sx * 0.13, 0.9, -0.05);
    ear.rotation.set(0.1, sx * 0.38, -sx * 0.7);
    ear.userData.baseZ = ear.rotation.z;
    headInner.add(ear);
    const EC = [sx * 0.33, -0.08, 0], ER = [0.36, 0.29, 0.07];
    const IC = [sx * 0.39, -0.12, 0.042], IR = [0.215, 0.15, 0.044];
    const earBase = furBase({
      ws: Q(30, 20), hs: Q(18, 12), radii: ER, center: EC, poleAxis: 'x',
      fn: (i, U, W, out) => {
        const ox = (W[0] - IC[0]) / IR[0], oy = (W[1] - IC[1]) / IR[1];
        const e = Math.sqrt(ox * ox + oy * oy);
        const frontness = smooth(-0.15, 0.35, U[2]);
        const rootSide = smooth(0.25, 0.0, Math.abs(W[0]) );  // shorter near the head, the mop covers it
        out.len = (1 - frontness * (1 - smooth(0.78, 1.15, e))) * (1 - 0.4 * rootSide);
        out.u = W[0] * 4.0 + W[2] * 2.0; out.v = W[1] * 4.0 + W[2] * 1.0;
      },
    });
    const earFur = new THREE.Mesh(buildShells(earBase, SHELLS, 0.3), earFurMat);
    earFur.name = 'earFur';
    const inner = new THREE.Mesh(bakeAO(ellipsoid(Q(32, 18), Q(20, 12), IR, IC, [0, 0, sx * 0.1]), [{ c: [EC[0], EC[1], EC[2] - 0.01], r: [ER[0] * 0.9, ER[1] * 0.9, ER[2]] }], 0.35), velvet);
    inner.name = 'earInner';
    const earHair = createGuardHairs(earBase, Q(110, 55), rng, hairMat, strandGeo, { length: 0.15, width: 0.004 });
    ear.add(earFur, inner, earHair);
    ears.push(ear);
  }

  /* ---------------- idle animation ---------------- */
  const headBase = head.rotation.clone();
  root.userData.update = (t) => {
    shared.uTime.value = t;
    const br = Math.sin(t * 2.0);
    torso.scale.set(1 + 0.012 * br, 1 + 0.018 * br, 1 + 0.012 * br);
    head.position.y = headPivot.y + 0.008 * br;
    head.rotation.z = headBase.z + Math.sin(t * 0.7) * 0.03;
    head.rotation.x = headBase.x + Math.sin(t * 1.1 + 0.6) * 0.012;
    snout.rotation.x = Math.sin(t * 1.3) * 0.03;
    snout.rotation.z = Math.sin(t * 0.9 + 1.2) * 0.045;
    for (let i = 0; i < ears.length; i++) {
      const e = ears[i];
      e.rotation.z = e.userData.baseZ + Math.sin(t * 1.8 + i * 1.9) * 0.05 + Math.sin(t * 0.6 + i) * 0.03;
    }
  };
  root.userData.update(0);
  return root;
}
