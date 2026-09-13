// main.js — "Geh aufs Ganze!" fan site: renderer, choreography, UI state
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase.js';
import { createStudioEnvironment, createSilverNecklace, createSilverRing, centerAndFit } from './prizes.js';
import { createZonk } from './prize-zonk.js';
import { createFlowerWreath } from './prize-wreath.js';
import { createStudio, createGate, Sparks, GATE_GAP, GATE_W, GATE_H, PRIZE_R } from './stage.js';
import { SoundBoard } from './audio.js';
import { burstConfetti, clearConfetti } from './confetti.js';

gsap.registerPlugin(CustomEase);
CustomEase.create('curtain', 'M0,0 C0.22,0 0.3,0.66 0.52,0.94 0.66,1.1 0.8,1.01 1,1');

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */
const PRIZES = [
  {
    title: 'Silberschmuck',
    text: 'Eine Kette aus Sterlingsilber mit Herzanhänger, funkelndem Stein und passendem Ring. Herzlichen Glückwunsch!',
    win: true,
    confetti: ['#ffffff', '#e8edf4', '#b9c4d2', '#ffd76a', '#9fb2c8'],
    confettiShape: 'mixed',
    sparks: ['#ffffff', '#dfe8ff', '#ffe7a8'],
  },
  {
    title: 'Der Zonk',
    text: '',
    win: false,
    sparks: ['#ff5a4a', '#ff9a3c', '#ffd0a0'],
  },
  {
    title: 'Blumenkranz',
    text: 'Ein üppiger Kranz aus Hortensien in Pink, Violett und frischem Grün. Herzlichen Glückwunsch!',
    win: true,
    confetti: ['#e0468a', '#b04fc9', '#f59ac0', '#8fbf5a', '#c9e07a', '#8f9fe8'],
    confettiShape: 'petal',
    sparks: ['#ffd0e6', '#e3b5ff', '#d9ffb0'],
  },
];

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const ui = {
  loader: $('loader'), loaderText: $('loaderText'),
  gates: $('gates'), buttons: [...document.querySelectorAll('.gate-btn')],
  hint: $('hint'), hintText: document.querySelector('.hint__text'), hintCount: $('hintCount'), hintReset: $('hintReset'),
  result: $('result'), resultEyebrow: $('resultEyebrow'), resultTitle: $('resultTitle'), resultText: $('resultText'),
  backBtn: $('backBtn'), resetBtn: $('resetBtn'),
  zonkText: $('zonkText'), status: $('status'), dim: $('dim'), soundToggle: $('soundToggle'),
};

function fail(message) {
  window.__gagFailed = true;
  clearTimeout(window.__gagWatchdog);
  ui.loaderText.textContent = message;
  ui.loader.classList.remove('is-done');
  ui.loader.setAttribute('aria-busy', 'false');
  ui.loader.querySelector('.loader__ring')?.remove();
}

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches;
motionQuery.addEventListener('change', (e) => { reduced = e.matches; });
const coarse = matchMedia('(pointer: coarse)').matches;
const quality = coarse || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high';

const sound = new SoundBoard();

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
if (!WebGL.isWebGL2Available()) {
  fail('Dein Browser oder Gerät unterstützt kein WebGL 2 – die 3D-Show kann leider nicht starten.');
} else {
  init().catch((err) => {
    console.error(err);
    fail('Die Show konnte nicht gestartet werden. Bitte lade die Seite neu.');
  });
}

async function init() {
  // canvas textures (gate numbers) need the web fonts
  await Promise.race([
    Promise.all([
      document.fonts.load('400 120px Bungee'),
      document.fonts.load('800 40px Manrope'),
      document.fonts.load('400 100px "Titan One"', 'Schade, schade!'),
      document.fonts.load('100px "Noto Color Emoji"', '\u{1F972}'),
    ]),
    new Promise((r) => setTimeout(r, 3000)),
  ]);

  /* ---------- renderer & scene ---------- */
  const canvas = $('stage');
  const testLoop = new URLSearchParams(location.search).has('timerloop');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: testLoop });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.transmissionResolutionScale = quality === 'low' ? 0.33 : 0.5;   // the gem's refraction pass
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fail('Die Grafik wurde vom Browser zurückgesetzt. Bitte lade die Seite neu.');
  });

  const scene = new THREE.Scene();
  const BG = new THREE.Color('#05041a');
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 20, 44);

  const envMap = createStudioEnvironment(renderer);
  scene.environment = envMap;
  scene.environmentIntensity = 0.5;

  const hemi = new THREE.HemisphereLight('#7b6cff', '#12081c', 0.6);
  const hemiBase = hemi.color.clone();
  scene.add(hemi);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 140);
  const HOME = { pos: new THREE.Vector3(0, 2.9, 14), look: new THREE.Vector3(0, 2.75, 0) };
  const camPos = HOME.pos.clone();
  const look = HOME.look.clone();
  const tmpCam = new THREE.PerspectiveCamera();

  /* ---------- set, gates, prizes ---------- */
  const studio = createStudio(scene, { quality });
  const bulbGeo = new THREE.SphereGeometry(0.055, 14, 10);
  const gates = [0, 1, 2].map((i) => {
    const g = createGate(i, { envMap, bulbGeo, quality });
    scene.add(g.root, g.spot, g.spot.target);
    return g;
  });
  const SPOT_BASE = gates[0].spot.intensity;
  const sparks = new Sparks(scene);

  const models = [buildJewelry(envMap), createZonk({ quality }), createFlowerWreath({ quality })];
  models.forEach((m, i) => {
    const fitted = centerAndFit(m, PRIZE_R);
    gates[i].spinner.add(fitted);
    gates[i].model = fitted;
    gates[i].win = PRIZES[i].win;
  });

  const presentKey = new THREE.SpotLight('#fff3e2', 0, 30, Math.PI / 7, 0.6, 2);
  const presentRim = new THREE.PointLight('#a9b8ff', 0, 14, 2);
  scene.add(presentKey, presentKey.target, presentRim);

  /* ---------- post-processing ---------- */
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const composer = new EffectComposer(renderer, rt);
  // RenderPass draws into renderTarget2 every frame (the chain below swaps buffers 4x, an even number),
  // so only that target needs depth + MSAA; the full-screen passes stay single-sampled.
  composer.renderTarget2.depthBuffer = true;
  composer.renderTarget2.samples = quality === 'low' ? 2 : 4;
  composer.addPass(new RenderPass(scene, camera));
  // guard: a single NaN/Inf pixel would be smeared over the whole frame by the bloom blur
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
        gl_FragColor = vec4(min(c.rgb, vec3(64.0)), c.a);
      }`,
  }));
  const BLOOM_BASE = 0.24;
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_BASE, 0.4, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.offset.value = 1.0;
  vignette.uniforms.darkness.value = 1.1;
  composer.addPass(vignette);
  if (quality !== 'low') composer.addPass(new FilmPass(0.045, false));
  else composer.addPass(new ShaderPass({    // keeps the swap count even without the grain pass
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }',
  }));

  /* ---------- state ---------- */
  let state = 'loading';          // loading | intro | idle | busy | presenting
  let focus = null;
  let presentTl = null;           // running present timeline (killed if the viewer leaves early)
  let resultShown = false;        // result card visible and actionable
  const dim = { value: 0 };
  const shake = { amp: 0 };

  /* ---------- layout ---------- */
  const v3 = new THREE.Vector3();
  function layout() {
    const w = innerWidth, h = innerHeight, aspect = w / h;
    const portrait = aspect < 0.8;
    camera.aspect = aspect;
    camera.fov = portrait ? 48 : 36;
    camera.updateProjectionMatrix();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfWidth = GATE_GAP + GATE_W / 2 + 0.95;
    const z = Math.max(15.5, halfWidth / (tanV * aspect));
    HOME.pos.set(0, portrait ? 3.6 : 3.3, z);
    scene.fog.near = z + 5;
    scene.fog.far = z + 29;
    HOME.look.set(0, portrait ? 3.5 : 3.55, 0);

    if (state === 'presenting' && focus) {
      const p = presentPose(focus);
      camPos.copy(p.camEnd); look.copy(p.lookEnd);
      focus.holder.position.copy(p.target);
      placePresentLights(p.target);
    } else if (state === 'idle' || state === 'loading') {
      camPos.copy(HOME.pos); look.copy(HOME.look);
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    placeButtons();
  }

  function placeButtons() {
    const w = innerWidth, h = innerHeight;
    tmpCam.copy(camera);
    tmpCam.position.copy(HOME.pos);
    tmpCam.lookAt(HOME.look);
    tmpCam.updateMatrixWorld();
    scene.updateMatrixWorld();
    gates.forEach((g, i) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of [[-GATE_W / 2 - 0.45, 0], [GATE_W / 2 + 0.45, 0], [-GATE_W / 2 - 0.45, GATE_H + 2.1], [GATE_W / 2 + 0.45, GATE_H + 2.1]]) {
        v3.set(x, y, 0.3);
        g.root.localToWorld(v3).project(tmpCam);
        const sx = (v3.x + 1) / 2 * w, sy = (1 - v3.y) / 2 * h;
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      }
      Object.assign(ui.buttons[i].style, {
        left: `${minX}px`, top: `${minY}px`, width: `${maxX - minX}px`, height: `${maxY - minY}px`,
      });
    });
  }

  function presentPose(g) {
    const aspect = camera.aspect;
    const portrait = aspect < 0.8;
    const gx = g.root.position.x;
    const camEnd = portrait ? new THREE.Vector3(gx, 2.7, 11.5) : new THREE.Vector3(gx * 0.55, 2.55, 10.4);
    const lookEnd = portrait ? new THREE.Vector3(gx, 2.4, -1) : new THREE.Vector3(gx * 0.7, 2.3, -1);
    tmpCam.copy(camera);
    tmpCam.position.copy(camEnd);
    tmpCam.lookAt(lookEnd);
    tmpCam.updateMatrixWorld();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanMin = Math.min(tanV, tanV * aspect);
    const win = PRIZES[g.index].win;
    const fill = portrait ? (win ? 0.78 : 0.72) : (win ? 0.5 : 0.5);
    const dist = PRIZE_R / (fill * tanMin);
    // the Zonk sits a little higher so its head stays visible above the centred "Schade, schade!"
    const short = innerHeight < 520 && !portrait;
    const ndcY = win ? (portrait ? 0.12 : short ? 0.18 : 0.06) : (portrait ? 0.12 : short ? 0.22 : 0.14);
    const target = new THREE.Vector3(0, ndcY * dist * tanV, -dist).applyMatrix4(tmpCam.matrixWorld);
    return { camEnd, lookEnd, target };
  }

  function placePresentLights(target) {
    presentKey.position.set(target.x + 2.2, target.y + 3.6, target.z + 3.2);
    presentRim.position.set(target.x - 1.8, target.y + 1.4, target.z - 1.8);
  }

  /* ---------- helpers ---------- */
  const toColors = (list) => list.map((c) => new THREE.Color(c));
  const play = (tl) => {
    if (reduced) tl.progress(1);
    return tl.then(() => undefined);
  };
  const setInteractive = (on) => {
    ui.gates.inert = !on;
    ui.hint.classList.toggle('is-hidden', !on);
  };

  function updateLabels() {
    ui.buttons.forEach((b, i) => {
      b.querySelector('.sr-only').textContent = gates[i].opened
        ? `Tor ${i + 1}: ${PRIZES[i].title} noch einmal ansehen`
        : `Tor ${i + 1} öffnen`;
    });
  }

  function updateHint() {
    const n = gates.filter((g) => g.opened).length;
    ui.hintCount.textContent = `${n} von 3 geöffnet`;
    ui.hintText.textContent = n === 3 ? 'Alle Tore sind offen' : n ? 'Wähle das nächste Tor' : 'Wähle ein Tor';
    ui.hintReset.hidden = n === 0;
  }

  /* ---------- choreography ---------- */
  function openCurtainTimeline(g) {
    const warm = (k) => ({ r: 1.0 * k, g: 0.86 * k, b: 0.68 * k });
    const accent = { r: g.accent.r * 2.4, g: g.accent.g * 2.4, b: g.accent.b * 2.4 };
    const ripples = g.curtains;
    const tl = gsap.timeline();
    tl.add(() => { g.holder.visible = true; sound.drumroll(1.25); }, 0)
      .to(g.chase, { value: 1, duration: 0.3, ease: 'power2.out' }, 0)
      .to(ripples.map((u) => u.uRipple), { value: 1, duration: 0.35 }, 0)
      .to(g.glowMat.color, { ...warm(0.3), duration: 1.1, ease: 'power1.in' }, 0)
      .to(dim, { value: 0.35, duration: 1.0 }, 0)
      .to(g.holder.position, { y: g.restPos.y + 0.12, duration: 1.2, ease: 'sine.inOut' }, 0)
      .addLabel('open', 1.25)
      .add(() => sound.swoosh(), 'open')
      .to(ripples[0].uOpen, { value: 1, duration: 1.7, ease: 'curtain' }, 'open')
      .to(ripples[1].uOpen, { value: 1, duration: 1.7, ease: 'curtain' }, 'open+=0.06')
      .to(ripples.map((u) => u.uRipple), { value: 0.12, duration: 1.4 }, 'open')
      .to(g.glowMat.color, { ...warm(1.5), duration: 0.9, ease: 'power2.out' }, 'open+=0.15')
      .to(g.boothLight, { intensity: 22, duration: 0.9 }, 'open+=0.1')
      .to(g.beam.material.uniforms.uOpacity, { value: 0.55, duration: 1.0 }, 'open+=0.25')
      .to(g.ringMat.color, { ...accent, duration: 0.8 }, 'open+=0.35')
      .to(g.spillMat, { opacity: 0.5, duration: 0.9 }, 'open+=0.2')
      .to(bloom, { strength: 0.7, duration: 0.45, ease: 'power2.out' }, 'open+=0.25')
      .to(bloom, { strength: BLOOM_BASE, duration: 1.3, ease: 'power2.inOut' }, 'open+=0.7')
      .add(() => {
        if (!reduced) sparks.emit(g.root.localToWorld(new THREE.Vector3(0, GATE_H * 0.55, 0.3)), 180, toColors(PRIZES[g.index].sparks));
      }, 'open+=0.3')
      .to(g.chase, { value: 0.25, duration: 1.2 }, 'open+=0.6');
    return tl;
  }

  function presentTimeline(g) {
    const { camEnd, lookEnd, target } = presentPose(g);
    const tl = gsap.timeline();
    tl.add(() => {
      scene.attach(g.holder);
      presentKey.target = g.holder;
      placePresentLights(target);
      focus = g;
    }, 0)
      .to(camPos, { x: camEnd.x, y: camEnd.y, z: camEnd.z, duration: 1.7, ease: 'power3.inOut' }, 0)
      .to(look, { x: lookEnd.x, y: lookEnd.y, z: lookEnd.z, duration: 1.7, ease: 'power3.inOut' }, 0)
      .to(dim, { value: 1, duration: 1.2 }, 0)
      .to(ui.dim, { opacity: 1, duration: 1.2 }, 0.2)
      .to(g.holder.position, { x: target.x, y: target.y, z: target.z, duration: 1.8, ease: 'expo.inOut' }, 0.1)
      .fromTo(g.holder.scale, { x: 0.7, y: 0.7, z: 0.7 }, { x: 1, y: 1, z: 1, duration: 2.1, ease: 'elastic.out(1, 0.5)', immediateRender: false }, 0.55)
      .to(g.extraSpin, { value: `+=${Math.PI * 4}`, duration: 2.6, ease: 'power3.out' }, 0.2)
      .to(g.tilt, { value: 0.14, duration: 1.2 }, 0.3)
      .to(g.float, { value: 1, duration: 1 }, 1.4)
      .to(presentKey, { intensity: 240, duration: 1.0 }, 0.7)
      .to(presentRim, { intensity: 18, duration: 1.0 }, 0.7)
      .add(() => reveal(g), 1.55)
      .add(() => showResult(g), 2.1);
    return tl;
  }

  function reveal(g) {
    const prize = PRIZES[g.index];
    ui.status.textContent = `Tor ${g.index + 1}: ${prize.title}. ${prize.win ? 'Herzlichen Glückwunsch!' : 'Schade, schade!'}`;
    if (prize.win) {
      sound.fanfare();
      if (!reduced) {
        burstConfetti({ colors: prize.confetti, shape: prize.confettiShape, count: 120, origin: { x: 0.04, y: 0.98 }, angle: -1.05 });
        burstConfetti({ colors: prize.confetti, shape: prize.confettiShape, count: 120, origin: { x: 0.96, y: 0.98 }, angle: -2.09 });
        sparks.emit(g.holder.position, 160, toColors(prize.sparks), { spread: 1.6, up: 3.6, forward: 1.2 });
        gsap.fromTo(bloom, { strength: 0.6 }, { strength: BLOOM_BASE, duration: 1.4, ease: 'power2.out' });
      }
      return;
    }
    // Zonk
    sound.zonk();
    ui.zonkText.hidden = false;
    const line = ui.zonkText.querySelector('p');
    const emoji = ui.zonkText.querySelector('.zonk-text__emoji');
    gsap.set(ui.zonkText, { autoAlpha: 1 });
    if (reduced) {
      gsap.set([line, emoji], { autoAlpha: 1, scale: 1, y: 0, rotate: 0 });
    } else {
      gsap.fromTo(line, { scale: 2.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.8, ease: 'back.out(2.2)' });
      gsap.fromTo(emoji, { y: 40, rotate: -25, autoAlpha: 0 }, { y: 0, rotate: 0, autoAlpha: 1, duration: 1.0, delay: 0.4, ease: 'elastic.out(1, 0.45)' });
      gsap.fromTo(shake, { amp: 0.09 }, { amp: 0, duration: 0.9, ease: 'power2.out' });
      sparks.emit(g.holder.position, 70, toColors(prize.sparks), { spread: 1.2, up: 2.2, forward: 0.8 });
    }
    gsap.to(g.alarm, { value: 1, duration: reduced ? 0 : 0.35 });
    gsap.to(hemi.color, { r: 0.85, g: 0.22, b: 0.28, duration: reduced ? 0 : 0.8 });
  }

  function showResult(g) {
    const prize = PRIZES[g.index];
    const remaining = gates.filter((x) => !x.opened).length;
    let text = prize.text;
    if (!prize.win) {
      text = remaining === 0
        ? 'Leider nur der Trostpreis – aber dafür mit ganz viel Fell.'
        : `Leider nur der Trostpreis. ${remaining === 1 ? 'Ein Tor wartet' : 'Zwei Tore warten'} noch auf dich.`;
    }
    ui.result.style.setProperty('--accent', g.style.accent);
    ui.resultEyebrow.textContent = `Hinter Tor ${g.index + 1}`;
    ui.resultTitle.textContent = prize.title;
    ui.resultText.textContent = text;
    ui.result.hidden = false;
    document.body.classList.add('is-presenting');
    gsap.killTweensOf(ui.result);
    gsap.set(ui.result, { autoAlpha: 1, y: 0 });                 // visible first, otherwise focus() is ignored
    if (!reduced) gsap.from(ui.result, { opacity: 0, y: 28, duration: 0.7, ease: 'power3.out' });
    resultShown = true;
    ui.backBtn.focus({ preventScroll: true });
  }

  function hideOverlays() {
    document.body.classList.remove('is-presenting');
    const els = [ui.result, ui.zonkText].filter((el) => !el.hidden);
    gsap.killTweensOf([ui.result, ui.zonkText.querySelector('p'), ui.zonkText.querySelector('.zonk-text__emoji')]);
    gsap.to(els, {
      autoAlpha: 0, duration: reduced ? 0 : 0.35,
      onComplete: () => {
        ui.result.hidden = true;
        ui.zonkText.hidden = true;
        gsap.set(els, { clearProps: 'opacity,visibility,transform' });
      },
    });
  }

  async function openGate(i) {
    if (state !== 'idle') return;
    const g = gates[i];
    state = 'busy';
    setInteractive(false);
    sound.click();
    gsap.to(g.hover, { value: 0, duration: 0.4 });
    if (!g.opened) {
      ui.status.textContent = `Tor ${i + 1} öffnet sich …`;
      await play(openCurtainTimeline(g));
      g.opened = true;
      updateLabels();
      updateHint();
    }
    presentTl = presentTimeline(g);
    await play(presentTl);
    presentTl = null;
    state = 'presenting';
    layout();                     // catch viewport changes that happened mid-animation
  }

  async function backToStage() {
    if (!focus || !(state === 'presenting' || (state === 'busy' && resultShown))) return;
    if (presentTl) { presentTl.kill(); presentTl = null; }   // its pending promise never resolves, so openGate stops there
    state = 'busy';
    resultShown = false;
    const g = focus;
    hideOverlays();
    const tl = gsap.timeline();
    tl.add(() => g.root.attach(g.holder), 0)
      .to(g.holder.position, { x: g.restPos.x, y: g.restPos.y, z: g.restPos.z, duration: 1.4, ease: 'power3.inOut' }, 0)
      .to(g.holder.scale, { x: 1, y: 1, z: 1, duration: 0.6 }, 0)
      .to([g.tilt, g.float], { value: 0, duration: 1 }, 0)
      .to(camPos, { x: HOME.pos.x, y: HOME.pos.y, z: HOME.pos.z, duration: 1.6, ease: 'power3.inOut' }, 0.1)
      .to(look, { x: HOME.look.x, y: HOME.look.y, z: HOME.look.z, duration: 1.6, ease: 'power3.inOut' }, 0.1)
      .to(dim, { value: 0, duration: 1.3 }, 0.2)
      .to(ui.dim, { opacity: 0, duration: 1.0 }, 0)
      .to([presentKey, presentRim], { intensity: 0, duration: 0.8 }, 0)
      .to(g.alarm, { value: 0, duration: 0.6 }, 0)
      .to(hemi.color, { r: hemiBase.r, g: hemiBase.g, b: hemiBase.b, duration: 0.8 }, 0);
    await play(tl);
    focus = null;
    state = 'idle';
    layout();
    setInteractive(true);
    ui.status.textContent = 'Zurück auf der Bühne.';
    ui.buttons[g.index].focus({ preventScroll: true });
  }

  async function resetGame() {
    if (state === 'presenting' || resultShown) await backToStage();
    if (state !== 'idle') return;
    const opened = gates.filter((g) => g.opened);
    if (!opened.length) return;
    state = 'busy';
    setInteractive(false);
    clearConfetti();
    sound.close();
    const tl = gsap.timeline();
    opened.forEach((g, k) => {
      const at = k * 0.15;
      tl.to(g.holder.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.55, ease: 'back.in(1.7)' }, at)
        .to(g.curtains.map((u) => u.uOpen), { value: 0, duration: 1.25, ease: 'power3.inOut' }, at + 0.25)
        .to(g.curtains.map((u) => u.uRipple), { value: 0, duration: 1.2 }, at + 0.25)
        .to(g.glowMat.color, { r: 0.02, g: 0.02, b: 0.03, duration: 0.8 }, at + 0.7)
        .to(g.boothLight, { intensity: 0, duration: 0.8 }, at + 0.5)
        .to(g.beam.material.uniforms.uOpacity, { value: 0, duration: 0.6 }, at + 0.4)
        .to(g.ringMat.color, { r: 0, g: 0, b: 0, duration: 0.6 }, at + 0.4)
        .to(g.spillMat, { opacity: 0, duration: 0.6 }, at + 0.4)
        .to(g.chase, { value: 0, duration: 0.8 }, at + 0.4)
        .add(() => {
          g.holder.visible = false;
          g.holder.scale.setScalar(1);
          g.holder.position.copy(g.restPos);
          g.spin = 0;
          g.extraSpin.value = 0;
          g.opened = false;
        }, at + 1.5);
    });
    await play(tl);
    updateLabels();
    updateHint();
    state = 'idle';
    layout();
    setInteractive(true);
    ui.status.textContent = 'Neues Spiel. Wähle Tor 1, 2 oder 3.';
    ui.buttons[0].focus({ preventScroll: true });
  }

  function intro() {
    state = 'intro';
    document.body.classList.add('is-live');
    const tl = gsap.timeline();
    camPos.set(0, 7.5, HOME.pos.z + 14);
    look.set(0, 4.2, 0);
    tl.to(camPos, { x: HOME.pos.x, y: HOME.pos.y, z: HOME.pos.z, duration: 3.2, ease: 'power3.inOut' }, 0)
      .to(look, { x: HOME.look.x, y: HOME.look.y, z: HOME.look.z, duration: 3.2, ease: 'power3.inOut' }, 0);
    gates.forEach((g, i) => {
      tl.to(g.power, {
        keyframes: [
          { value: 0.8, duration: 0.05 }, { value: 0.05, duration: 0.09 }, { value: 1, duration: 0.07 },
          { value: 0.3, duration: 0.06 }, { value: 1, duration: 0.25 },
        ],
      }, 1.1 + i * 0.35);
    });
    tl.add(() => {
      state = 'idle';
      layout();
      setInteractive(true);
      ui.status.textContent = 'Willkommen! Wähle Tor 1, 2 oder 3.';
    }, reduced ? 0 : 3.2);
    if (reduced) tl.progress(1);
  }

  /* ---------- events ---------- */
  ui.buttons.forEach((b, i) => {
    b.addEventListener('click', () => openGate(i));
    const on = () => { if (state === 'idle') gsap.to(gates[i].hover, { value: 1, duration: 0.5, ease: 'power2.out' }); };
    const off = () => gsap.to(gates[i].hover, { value: 0, duration: 0.6, ease: 'power2.out' });
    b.addEventListener('pointerenter', on);
    b.addEventListener('pointerleave', off);
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) on(); });
    b.addEventListener('blur', off);
  });
  ui.backBtn.addEventListener('click', backToStage);
  ui.resetBtn.addEventListener('click', resetGame);
  ui.hintReset.addEventListener('click', resetGame);
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (state === 'idle' && ['1', '2', '3'].includes(e.key)) openGate(Number(e.key) - 1);
    else if (e.key === 'Escape' && (state === 'presenting' || resultShown)) backToStage();
  });

  const syncSound = () => {
    ui.soundToggle.setAttribute('aria-pressed', String(sound.enabled));
    ui.soundToggle.querySelector('.icon-btn__label').textContent = sound.enabled ? 'Ton an' : 'Ton aus';
  };
  ui.soundToggle.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    syncSound();
    sound.click();
  });
  syncSound();

  addEventListener('resize', layout);
  layout();

  /* ---------- render loop ---------- */
  const timer = new THREE.Timer();
  timer.connect(document);
  const shakeOffset = new THREE.Vector3();
  function frame(timestamp) {
    timer.update(timestamp);
    const dt = Math.min(timer.getDelta(), 1 / 20);
    const t = timer.getElapsed();
    studio.update(t, dt, { dim: dim.value, reduced });
    for (const g of gates) {
      const focused = g === focus;
      g.update(t, dt, { dim: dim.value, focused, reduced });
      g.spot.intensity = SPOT_BASE * (focused ? 1 - 0.45 * dim.value : 1 - 0.85 * dim.value);
    }
    sparks.update(dt);
    if (shake.amp > 0.0001) shakeOffset.set(Math.sin(t * 53) * shake.amp, Math.sin(t * 41 + 1.3) * shake.amp * 0.6, 0);
    else shakeOffset.set(0, 0, 0);
    camera.position.copy(camPos).add(shakeOffset);
    camera.lookAt(look);
    composer.render(dt);
  }

  // warm up: compile every material (incl. hidden prizes) before the curtain rises
  gates.forEach((g) => { g.holder.visible = true; });
  camera.position.copy(HOME.pos);
  camera.lookAt(HOME.look);
  renderer.setRenderTarget(composer.readBuffer);
  await renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(null);
  composer.render(0);
  gates.forEach((g) => { g.holder.visible = false; });

  updateLabels();
  updateHint();
  setInteractive(false);
  if (testLoop) {
    window.__gag = { gates, camPos, look, bloom, renderer, composer, scene, camera, frame, openGate, backToStage, resetGame, get state() { return state; } };
    // test hook for headless/hidden previews where requestAnimationFrame is paused
    gsap.ticker.remove(gsap.updateRoot);
    setInterval(() => {
      const now = performance.now();
      gsap.updateRoot(now / 1000);
      frame(now);
    }, 1000 / 30);
  } else {
    renderer.setAnimationLoop(frame);
  }
  window.__gagReady = true;
  clearTimeout(window.__gagWatchdog);
  ui.loader.classList.add('is-done');
  ui.loader.setAttribute('aria-busy', 'false');
  intro();
}

/* ------------------------------------------------------------------ */
/* Tor 1 prize: necklace + matching ring                               */
/* ------------------------------------------------------------------ */
function buildJewelry(envMap) {
  const group = new THREE.Group();
  group.name = 'Silberschmuck';
  const necklace = createSilverNecklace({ envMap });
  const ring = createSilverRing({ envMap });
  ring.scale.setScalar(0.3);
  ring.position.set(0.78, -1.05, 0.3);
  ring.rotation.set(0.35, -0.5, 0.25);
  group.add(necklace, ring);
  group.userData.update = (t) => necklace.userData.update?.(t);
  return group;
}
