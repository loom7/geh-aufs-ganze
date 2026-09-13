// prizes.js — shared helpers, studio environment and the silver jewellery for Tor 1 (three.js r186)
// Everything is generated from code: no model files, no textures to download.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

// Small, fast, seedable PRNG -> deterministic wreath every page load.
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UP = new THREE.Vector3(0, 1, 0);

// Bake a transform into a geometry (so parts can later be merged into one draw call).
function baked(geo, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scl)
  );
  return geo.applyMatrix4(m);
}

// Replace NaN / zero-length normals (they turn into NaN pixels that bloom smears across the screen).
export function sanitizeNormals(geo) {
  const n = geo.attributes.normal;
  if (!n) return geo;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    const len = Math.hypot(x, y, z);
    if (!Number.isFinite(len) || len < 1e-6) n.setXYZ(i, 0, 0, 1);
    else if (Math.abs(len - 1) > 1e-3) n.setXYZ(i, x / len, y / len, z / len);
  }
  n.needsUpdate = true;
  return geo;
}

// Put the visual centre of an object at the origin and scale its largest half-extent to `radius`.
// Returns a wrapper group -> rotating the wrapper spins the prize around its own centre.
export function centerAndFit(object, radius = 1) {
  const box = new THREE.Box3().setFromObject(object);
  // largest half-extent (not the box's bounding sphere) so compact figures don't end up too small
  const halfSize = Math.max(...box.getSize(new THREE.Vector3()).toArray()) / 2;
  object.position.sub(box.getCenter(new THREE.Vector3()));
  const wrapper = new THREE.Group();
  wrapper.name = object.name + '_pivot';
  wrapper.add(object);
  wrapper.scale.setScalar(radius / halfSize);
  wrapper.userData.update = object.userData.update;
  return wrapper;
}

// Free GPU memory when a prize is removed (Object3D.dispose() in r186 does NOT do this).
export function disposeDeep(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    }
    if (o.isInstancedMesh) o.dispose();
  });
}

/* ------------------------------------------------------------------ */
/* Studio environment (procedural HDR softboxes -> PMREM)              */
/* ------------------------------------------------------------------ */
// RoomEnvironment is fine for general PBR, but polished silver needs contrasty
// highlight strips. PMREMGenerator renders into HalfFloat targets with tone mapping
// disabled, so colours > 1.0 act as HDR light sources.
export function createStudioEnvironment(renderer, { sigma = 0.02 } = {}) {
  const env = new THREE.Scene();

  const domeGeo = new THREE.SphereGeometry(50, 32, 16);
  const cols = [];
  const p = domeGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const h = (p.getY(i) / 50 + 1) / 2;             // 0 bottom .. 1 top
    const c = THREE.MathUtils.lerp(0.015, 0.22, h * h);
    cols.push(c, c, c * 1.08);
  }
  domeGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));

  const panel = (w, h, pos, intensity, color = 0xffffff) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  };
  panel(14, 2.5, [0, 15, 5], 9);              // top strip light
  panel(2.5, 16, [-15, 3, 6], 6);             // left strip
  panel(2.5, 16, [15, 2, -2], 5, 0xfff0dc);   // warm right strip
  panel(10, 10, [0, 5, -18], 1.8, 0xdde7ff);  // cool back fill
  panel(20, 6, [0, -14, 8], 0.5);             // soft floor bounce
  panel(18, 7, [0, 3, 20], 1.6);              // big front card behind the camera -> flat faces facing the viewer are not black

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, sigma);      // fromScene(scene, sigma, near, far, {size, position})
  env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  pmrem.dispose();
  return rt.texture;                           // keep rt alive while the texture is used
}

/* ------------------------------------------------------------------ */
/* Shared materials                                                    */
/* ------------------------------------------------------------------ */
export function createSilverMaterial(opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    // linear-sRGB base colour of silver from physicallybased.info
    color: new THREE.Color().setRGB(0.991, 0.985, 0.974),
    metalness: 1.0,
    roughness: 0.12,
    ...opts,
  });
}

export function createGemMaterial(opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0,
    transmission: 1,             // real refraction of what is behind (needs opaque objects behind it)
    thickness: 0.35,
    ior: 2.33,                   // three.js clamps ior to [1, 2.333]; diamond is ~2.42
    dispersion: 0.8,             // chromatic "fire"
    attenuationColor: new THREE.Color('#bfe6ff'),
    attenuationDistance: 1.2,
    specularIntensity: 1,
    flatShading: true,           // crisp facets without extra vertices
    envMapIntensity: 1.6,
    ...opts,
  });
}

// Round brilliant cut from a lathe profile (culet -> girdle -> crown -> table).
export function createBrilliantGeometry(radius = 1, facets = 16) {
  const r = radius;
  const profile = [
    new THREE.Vector2(0.0001, -0.86 * r),   // culet
    new THREE.Vector2(r, -0.03 * r),        // pavilion -> girdle
    new THREE.Vector2(r, 0.03 * r),         // girdle
    new THREE.Vector2(0.78 * r, 0.2 * r),   // lower crown break
    new THREE.Vector2(0.55 * r, 0.34 * r),  // table edge
    new THREE.Vector2(0.0001, 0.34 * r),    // table centre
  ];
  return new THREE.LatheGeometry(profile, facets);
}

// Additive 4-point star sprite for twinkles (generated on a canvas, no image file).
function createGlintTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const rad = g.createRadialGradient(h, h, 0, h, h, h);
  rad.addColorStop(0, 'rgba(255,255,255,1)');
  rad.addColorStop(0.15, 'rgba(220,235,255,0.6)');
  rad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  for (const [w, hgt] of [[size, 3], [3, size]]) {
    const lin = g.createLinearGradient(h - w / 2, h - hgt / 2, h + w / 2, h + hgt / 2);
    lin.addColorStop(0, 'rgba(255,255,255,0)');
    lin.addColorStop(0.5, 'rgba(255,255,255,1)');
    lin.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lin;
    g.fillRect(h - w / 2, h - hgt / 2, w, hgt);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGlint(scale = 0.3) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createGlintTexture(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true,
  }));
  s.scale.setScalar(scale);
  return s;
}

/* ------------------------------------------------------------------ */
/* TOR 1 — Silberschmuck: necklace with heart pendant + gem            */
/* ------------------------------------------------------------------ */
export function createSilverNecklace({ envMap = null, seed = 7 } = {}) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'Silberschmuck';
  const silver = createSilverMaterial({ envMap, envMapIntensity: 1.8 });

  // 1) Path: closed, drop-shaped loop, back part tilted away (as if lying around a neck).
  const pts = [];
  const K = 24;
  for (let i = 0; i < K; i++) {
    const t = (i / K) * Math.PI * 2;
    const c = Math.cos(t);                        // +1 top ... -1 bottom
    const w = 0.55 + 0.45 * (1 + c) / 2;          // narrower towards the pendant
    pts.push(new THREE.Vector3(Math.sin(t) * 1.1 * w, 0.3 + c * 1.2, -0.45 * (1 + c) / 2));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');

  // 2) Chain: one InstancedMesh of oval torus links, alternating 90° about the tangent.
  const R = 0.05, tube = 0.013, stretch = 1.55;
  // Centre distance of interlocking links: the end wires touch at 2·s·(R − tube); stay a bit below for slack.
  const pitch = 2 * stretch * (R - tube) - 0.006;
  let count = Math.round(curve.getLength() / pitch);
  if (count % 2) count++;                         // closed loop needs an even count
  const linkGeo = new THREE.TorusGeometry(R, tube, 10, 32);
  linkGeo.scale(stretch, 1, 1);
  const chain = new THREE.InstancedMesh(linkGeo, silver, count);
  chain.name = 'chain';

  const P = new THREE.Vector3(), T = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  const nY = new THREE.Vector3(), m = new THREE.Matrix4();
  const planeN = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < count; i++) {
    const u = i / count;
    curve.getPointAt(u, P);
    curve.getTangentAt(u, T);
    Z.copy(planeN).addScaledVector(T, -planeN.dot(T)).normalize();
    Y.crossVectors(Z, T).normalize();
    const twist = (rng() - 0.5) * 0.2;            // tiny irregularity reads as "real"
    Y.applyAxisAngle(T, twist); Z.applyAxisAngle(T, twist);
    if (i % 2 === 0) m.makeBasis(T, Y, Z);        // x = along chain
    else m.makeBasis(T, Z, nY.copy(Y).negate());  // rotated 90° about the tangent
    m.setPosition(P);
    chain.setMatrixAt(i, m);
  }
  chain.instanceMatrix.needsUpdate = true;
  chain.computeBoundingSphere();                  // required for culling/raycast since r151
  group.add(chain);

  // 3) Heart pendant: extruded, heavily bevelled shape -> "puffy" silver heart.
  const s = new THREE.Shape();
  s.moveTo(0, -1);
  s.bezierCurveTo(0.55, -0.45, 1.05, 0.0, 1.0, 0.45);
  s.bezierCurveTo(0.95, 1.0, 0.25, 1.05, 0, 0.62);
  s.bezierCurveTo(-0.25, 1.05, -0.95, 1.0, -1.0, 0.45);
  s.bezierCurveTo(-1.05, 0.0, -0.55, -0.45, 0, -1);
  let heartGeo = new THREE.ExtrudeGeometry(s, {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 12, curveSegments: 48,
  });
  heartGeo.center();
  heartGeo = toCreasedNormals(heartGeo, Math.PI / 3); // smooth bevels, keep hard creases
  sanitizeNormals(heartGeo);                          // degenerate bevel triangles produce NaN normals
  const heartScale = 0.24;
  const heart = new THREE.Mesh(heartGeo, silver);
  heart.scale.setScalar(heartScale);

  const bottom = curve.getPointAt(0.5);           // lowest point of the loop
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 12, 32), silver);
  bail.rotation.y = Math.PI / 2;                  // perpendicular to the chain there
  bail.position.copy(bottom).add(new THREE.Vector3(0, -0.055, 0));

  const pendant = new THREE.Group();
  pendant.name = 'pendant';
  heart.position.set(0, -0.3, 0);
  pendant.add(heart);

  // Gem set into the front of the heart, table facing the viewer (+Z).
  const frontZ = ((0.05 / 2) + 0.3) * heartScale;
  const gemR = 0.11;
  const gemGeo = createBrilliantGeometry(gemR, 16);
  gemGeo.rotateX(Math.PI / 2);
  const gem = new THREE.Mesh(gemGeo, createGemMaterial({ envMap }));
  gem.position.set(0, -0.26, frontZ + 0.012);
  pendant.add(gem);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(gemR * 1.02, 0.012, 10, 48), silver);
  bezel.position.copy(gem.position);
  pendant.add(bezel);

  const glint = createGlint(0.35);
  glint.position.copy(gem.position).add(new THREE.Vector3(0.03, 0.03, 0.06));
  pendant.add(glint);

  pendant.position.copy(bail.position).add(new THREE.Vector3(0, -0.03, 0));
  group.add(bail, pendant);

  group.userData.update = (t) => {
    // twinkle: short sharp pulse every ~2.2 s + a gentle pendant swing
    const phase = (t % 2.2) / 2.2;
    const pulse = Math.max(0, 1 - Math.abs(phase - 0.5) * 8);
    glint.material.opacity = pulse;
    glint.material.rotation = t * 0.8;
    glint.scale.setScalar(0.15 + 0.3 * pulse);
    pendant.rotation.z = Math.sin(t * 1.7) * 0.05;
  };
  return group;
}

// Optional alternative/extra: solitaire ring (CapsuleGeometry prongs merged into one draw call).
export function createSilverRing({ envMap = null } = {}) {
  const group = new THREE.Group();
  group.name = 'Ring';
  const silver = createSilverMaterial({ envMap, envMapIntensity: 1.3, roughness: 0.08 });

  const band = new THREE.TorusGeometry(0.9, 0.075, 24, 128);
  band.scale(1, 1, 1.7);                          // elliptical cross-section -> wider band

  const parts = [band];
  const headY = 0.97;
  parts.push(baked(new THREE.CylinderGeometry(0.2, 0.1, 0.16, 32, 1, true), [0, headY + 0.06, 0]));
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const prong = new THREE.CapsuleGeometry(0.022, 0.26, 4, 8, 1); // (radius, height, capSegments, radialSegments, heightSegments)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(ang), 0, -Math.cos(ang)), 0.35);
    prong.applyQuaternion(q);
    prong.translate(Math.cos(ang) * 0.2, headY + 0.2, Math.sin(ang) * 0.2);
    parts.push(prong);
  }
  const metal = new THREE.Mesh(mergeGeometries(parts, false), silver); // 1 draw call
  const gem = new THREE.Mesh(createBrilliantGeometry(0.24, 16), createGemMaterial({ envMap }));
  gem.position.y = headY + 0.33;
  group.add(metal, gem);
  return group;
}
