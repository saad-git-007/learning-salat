// The 3D stage: a prayer hall with baked day and night light (models/room), the prayer
// mat, the child, camera presets and the pose player.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { loadChild } from './child.js?v=20261018u';
import { POSES, resolve, route, mix, easeInOut, keepGrounded, hopTime } from './poses.js?v=20261018u';

const VIEWS = {
  front: { pos: [0.75, 1.0, 1.95], target: [0, 0.6, 0.12] },
  frontLow: { pos: [1.15, 0.72, 1.55], target: [0, 0.28, 0.08] },
  side: { pos: [2.05, 0.82, 0.32], target: [0, 0.45, 0.06] },
  sideLow: { pos: [1.85, 0.55, 0.4], target: [0, 0.24, 0.05] },
  back: { pos: [-1.15, 1.25, -1.65], target: [0, 0.55, 0.35] },
  face: { pos: [0.0, 0.85, 1.6], target: [0, 0.6, 0.05] },
  hands: { pos: [-0.95, 0.95, 1.3], target: [-0.05, 0.44, 0.1] },
};

// Lower the framing to the body when sitting or prostrating.
const FRAME_Y = { stand: 0, takbir: 0, qiyam: 0, ruku: -0.1, sajdah: -0.25, sit: -0.18, tashahhud: -0.18, salamR: -0.16, salamL: -0.16 };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// The mat lies so the standing feet are on its last fifth (its back edge just behind the heels).
const MAT_Z = 0.49;

function matTexture() {
  return canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#1f5a46'; g.fillRect(0, 0, w, h);
    const gold = '#d9b36a', cream = '#efe3c4', red = '#8e2f2f';
    g.strokeStyle = gold; g.lineWidth = 10; g.strokeRect(22, 22, w - 44, h - 44);
    g.strokeStyle = cream; g.lineWidth = 3; g.strokeRect(42, 42, w - 84, h - 84);
    // Border band of small diamonds.
    g.fillStyle = red;
    for (let y = 60; y < h - 60; y += 34) { for (const x of [58, w - 58]) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-7, -7, 14, 14); g.restore(); } }
    for (let x = 80; x < w - 60; x += 34) { for (const y of [58, h - 58]) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-7, -7, 14, 14); g.restore(); } }
    // Mihrab arch at the top (the end the forehead touches).
    g.save(); g.translate(w / 2, 0);
    g.beginPath(); g.moveTo(-150, 640); g.lineTo(-150, 300);
    g.quadraticCurveTo(-150, 160, 0, 100); g.quadraticCurveTo(150, 160, 150, 300); g.lineTo(150, 640);
    g.fillStyle = '#17463a'; g.fill(); g.strokeStyle = gold; g.lineWidth = 6; g.stroke();
    g.beginPath(); g.moveTo(-120, 620); g.lineTo(-120, 310); g.quadraticCurveTo(-120, 190, 0, 138); g.quadraticCurveTo(120, 190, 120, 310); g.lineTo(120, 620);
    g.strokeStyle = cream; g.lineWidth = 2; g.stroke();
    g.restore();
    // Lower field: lattice of stars.
    g.strokeStyle = 'rgba(217,179,106,.45)'; g.lineWidth = 2;
    for (let y = 720; y < h - 90; y += 70) for (let x = 110; x < w - 80; x += 75) { g.save(); g.translate(x + ((y / 70) % 2) * 37, y); for (let i = 0; i < 2; i++) { g.rotate(Math.PI / 4); g.strokeRect(-12, -12, 24, 24); } g.restore(); }
  });
}

export class Stage {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.reduced = reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 0.4, maxDistance: 3.3, minPolarAngle: 0.2, maxPolarAngle: Math.PI * 0.49, rotateSpeed: 0.7 });
    this.controls.addEventListener('start', () => { this.camTween = null; this.userMoved = true; });

    this.buildWorld();
    this.point = 0; this.pointTarget = 0;
    this.queue = null;
    this.view = 'front';
    this.poseName = 'stand';
    this.clock = new THREE.Clock();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.ready = this.init();
  }

  async init() {
    const [child] = await Promise.all([loadChild('models/child.glb?v=20261018u'), this.loadRoom()]);
    this.child = child;
    this.scene.add(this.child.group);
    this.states = {};
    for (const name of Object.keys(POSES)) this.states[name] = resolve(this.child, name);
    this.current = structuredClone(this.states.stand);
    this.child.apply(this.current);
    this.setView('front', true);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  buildWorld() {
    const s = this.scene;
    s.background = new THREE.Color(0x0b0a0c);
    // Real-time lights reach the child (and the prayer mat) only; the hall's light is baked.
    // Day: daylight through the windows on both sides; night: the hanging lanterns.
    this.hemi = new THREE.HemisphereLight(0xfff1dc, 0x7a3a2a, 1); s.add(this.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 1.4, bottom: -1.2, near: 0.5, far: 8 });
    s.add(key, key.target); this.key = key;
    this.fill = new THREE.DirectionalLight(0xffffff, 1); s.add(this.fill);
    this.lampFront = new THREE.PointLight(0xffb870, 0, 7, 1.6); this.lampFront.position.set(0, 2.45, 2.6); s.add(this.lampFront);
    this.lampMid = new THREE.PointLight(0xffb870, 0, 7, 1.6); this.lampMid.position.set(0, 2.6, 0.6); s.add(this.lampMid);

    // The child's own prayer mat, with fringes.
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.012, 1.22), [
      new THREE.MeshStandardMaterial({ color: 0x1f5a46 }), new THREE.MeshStandardMaterial({ color: 0x1f5a46 }),
      new THREE.MeshStandardMaterial({ map: (() => { const t = matTexture(); t.rotation = Math.PI; t.center.set(0.5, 0.5); return t; })(), roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ color: 0x1f5a46 }), new THREE.MeshStandardMaterial({ color: 0x1f5a46 }), new THREE.MeshStandardMaterial({ color: 0x1f5a46 }),
    ]);
    mat.position.set(0, 0.006, MAT_Z); s.add(mat);
    const fringeMat = new THREE.MeshStandardMaterial({ color: 0xefe3c4, roughness: 1 });
    for (const z of [MAT_Z - 0.61 - 0.025, MAT_Z + 0.61 + 0.025]) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.004, 0.05), fringeMat); fr.position.set(0, 0.003, z); fr.receiveShadow = true; s.add(fr);
    }
    // The child's shadow, one strength on the carpet and on the mat (so it stays joined to the
    // feet): shadow-only layers over the baked carpet and over the mat's top.
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), new THREE.ShadowMaterial({ opacity: 0.32 }));
    catcher.rotation.x = -Math.PI / 2; catcher.position.set(0, 0.001, MAT_Z - 0.1); catcher.receiveShadow = true; s.add(catcher);
    const onMat = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 1.22), catcher.material);
    onMat.rotation.x = -Math.PI / 2; onMat.position.set(0, 0.0125, MAT_Z); onMat.receiveShadow = true; s.add(onMat);
    this.catcher = catcher;
    this.nightK = 1; this.nightTarget = 1;
  }

  // The hall: albedo from its own textures, diffuse light from two baked lightmaps (day and
  // night, stored as sqrt(irradiance / scale)) cross-faded by uNight; metals reflect the
  // matching baked 360° probe.
  async loadRoom() {
    const base = 'models/room/';
    const tl = new THREE.TextureLoader();
    const tex = (f) => new Promise((ok, no) => tl.load(base + f, ok, undefined, no));
    const hdr = (f) => new Promise((ok, no) => new RGBELoader().load(base + f, ok, undefined, no));
    const [gltf, lmD, lmN, sky, meta, probeD, probeN, wall] = await Promise.all([
      new GLTFLoader().loadAsync(base + 'room.glb'), tex('lightmap_day.jpg'), tex('lightmap_night.jpg'), tex('window.png'),
      fetch(base + 'lightmap.json').then((r) => r.json()), hdr('probe_day.hdr'), hdr('probe_night.hdr'), tex('wall.jpg'),
    ]);
    for (const t of [lmD, lmN]) { t.flipY = false; t.channel = 1; t.colorSpace = THREE.NoColorSpace; }
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envs = [probeD, probeN].map((t) => { t.mapping = THREE.EquirectangularReflectionMapping; const e = pm.fromEquirectangular(t).texture; t.dispose(); return e; });
    pm.dispose();
    this.scene.environmentRotation.set(0, Math.PI / 2, 0);
    this.lmUniforms = { uNight: { value: this.nightK }, uLmNight: { value: lmN }, uScaleD: { value: meta.day.scale }, uScaleN: { value: meta.night.scale } };
    const U = this.lmUniforms;
    const patch = (m) => {
      m.lightMap = lmD; m.lightMapIntensity = Math.PI;
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        const from = 'vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );';
        if (!sh.fragmentShader.includes(from)) throw new Error('lightmap chunk changed');
        sh.fragmentShader = 'uniform float uNight, uScaleD, uScaleN;\nuniform sampler2D uLmNight;\n' + sh.fragmentShader.replace(from,
          `vec3 lmD = texture2D( lightMap, vLightMapUv ).rgb, lmN = texture2D( uLmNight, vLightMapUv ).rgb;
           vec4 lightMapTexel = vec4( mix( lmD * lmD * uScaleD, lmN * lmN * uScaleN, uNight ), 1.0 );`);
      };
      m.customProgramCacheKey = () => 'lm2';
    };
    this.glows = [];
    const room = gltf.scene;
    room.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material, name = src.name;
      let m;
      if (name === 'Gold' || name === 'Brass') {
        m = new THREE.MeshStandardMaterial({ color: name === 'Gold' ? 0xd8b26a : 0xb08a48, metalness: 1, roughness: name === 'Gold' ? 0.32 : 0.42, envMapIntensity: 1 });
      } else if (name === 'Window') {
        m = new THREE.MeshBasicMaterial({ map: sky, toneMapped: true }); sky.colorSpace = THREE.SRGBColorSpace;   // the sky through the glass
        this.glows.push({ m, day: new THREE.Color(1.0, 0.98, 0.95).multiplyScalar(1.5), night: new THREE.Color(0.025, 0.04, 0.1) });
      } else if (name === 'LampGlass') {
        m = new THREE.MeshBasicMaterial();
        this.glows.push({ m, day: new THREE.Color(1.0, 0.8, 0.55).multiplyScalar(1.1), night: new THREE.Color(1.0, 0.7, 0.4).multiplyScalar(4.5) });
      } else {
        // Walls, ceiling and drum: a limewash plaster with a faint star pattern (albedo only;
        // the light is in the lightmap, so swapping it needs no re-bake).
        const map = name === 'Plaster' ? Object.assign(wall, { colorSpace: THREE.SRGBColorSpace, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, flipY: src.map?.flipY ?? false }) : src.map;
        m = new THREE.MeshBasicMaterial({ map }); patch(m);
        if (m.map) m.map.anisotropy = 8;
      }
      o.material = m;
      o.matrixAutoUpdate = false; o.updateMatrix();
    });
    room.updateMatrixWorld(true);
    this.scene.add(room);
    this.room = room;
    this.applyLight(this.nightK);
  }

  // Lights for the child, matched to the bake: k = 0 day, 1 night.
  applyLight(k) {
    const L = (a, b) => a + (b - a) * k;
    const C = (c, a, b) => c.setRGB(L(a[0], b[0]), L(a[1], b[1]), L(a[2], b[2]));
    C(this.hemi.color, [1.0, 0.95, 0.86], [1.0, 0.78, 0.55]); C(this.hemi.groundColor, [0.55, 0.3, 0.24], [0.4, 0.18, 0.12]);
    this.hemi.intensity = L(1.3, 0.55);
    // Day key: the window on the child's right, high; night key: the lantern before the mihrab.
    this.key.position.set(L(2.6, 0.6), L(2.6, 2.45), L(0.8, 2.4)); C(this.key.color, [1.0, 0.96, 0.9], [1.0, 0.74, 0.46]);
    this.key.intensity = L(2.2, 1.5);
    this.fill.position.set(L(-2.6, -1.6), L(2.2, 2.6), L(-0.4, 0.6)); C(this.fill.color, [0.92, 0.95, 1.0], [1.0, 0.7, 0.42]);
    this.fill.intensity = L(1.0, 0.45);
    this.lampFront.intensity = L(0, 1.6); this.lampMid.intensity = L(0, 1.1);
    this.catcher.material.opacity = L(0.48, 0.5);
    this.renderer.toneMappingExposure = L(1.0, 1.15);
    if (this.lmUniforms) this.lmUniforms.uNight.value = k;
    if (this.envs) this.scene.environment = this.envs[k < 0.5 ? 0 : 1];
    for (const g of this.glows || []) g.m.color.copy(g.day).lerp(g.night, k);
  }

  setTheme(theme) {
    this.nightTarget = theme === 'light' ? 0 : 1;
    if (this.reduced || !this.room) { this.nightK = this.nightTarget; this.applyLight(this.nightK); }
  }

  resize() {
    const el = this.canvas.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    // Cap the drawing buffer at about 2.4 MP whatever the screen density.
    this.renderer.setPixelRatio(Math.min(this.dpr, Math.sqrt(2.4e6 / (w * h))));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved) this.setView(this.view, true);
  }

  // Portrait screens need the camera further back to fit the child.
  framing(name) {
    const v = VIEWS[name] || VIEWS.front;
    const a = this.camera.aspect || 1;
    const small = (this.canvas.parentElement?.clientHeight || 600) < 440 ? 0.88 : 1;
    const k = 1.42 * small * (a < 1 ? Math.pow(1 / a, 0.6) : a > 1.9 ? 0.78 : a > 1.45 ? 0.85 : 1);
    const dy = FRAME_Y[this.poseTarget || this.poseName] ?? 0;
    const t = new THREE.Vector3(...v.target); t.y = Math.max(0.18, t.y + dy * (name.endsWith('Low') ? 0.3 : 1));
    const p = new THREE.Vector3(...v.pos).sub(new THREE.Vector3(...v.target)).multiplyScalar(k).add(t);
    return { p, t };
  }

  setView(name, instant = false) {
    this.view = name;
    this.userMoved = false;
    const { p, t } = this.framing(name);
    if (instant || this.reduced) {
      this.camera.position.copy(p); this.controls.target.copy(t); this.controls.update(); this.camTween = null;
    } else {
      this.camTween = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p, t, time: 0, dur: 1.1 };
    }
  }

  // Animate to a posture through natural in-between postures.
  goTo(name, opts = {}) {
    if (!this.child) return this.ready.then(() => this.goTo(name, opts));
    const { speed = 1 } = opts;
    const hops = route(this.poseName, name);
    this.poseTarget = name;
    if (this.reduced) {
      this.current = structuredClone(this.states[name]); this.poseName = name; this.queue = null;
      return Promise.resolve();
    }
    return new Promise((done) => {
      const from = structuredClone(this.current);
      const segs = hops.map((h, i) => ({ to: h, dur: hopTime(h, i === hops.length - 1, hops.length) / speed }));
      if (this.queue) this.queue.done();
      this.queue = { from, segs, i: 0, t: 0, done };
    });
  }

  totalTime(name, speed = 1) {
    if (!this.child) return 0;
    return route(this.poseName, name).reduce((a, h, i, arr) => a + hopTime(h, i === arr.length - 1, arr.length) / speed, 0);
  }

  jump(name) {
    if (!this.child) { this.ready.then(() => this.jump(name)); return; }
    if (this.queue) { this.queue.done(); this.queue = null; }
    this.current = structuredClone(this.states[name]);
    this.poseName = name; this.poseTarget = name;
  }

  setPoint(on) { this.pointTarget = on ? 1 : 0; }

  // Close-up on the right forefinger while "Ashhadu alla ilaha illallahu" is recited.
  focusFinger(on) {
    if (!this.child) return;
    if (!on) { this.setView(this.view); return; }
    const tip = this.child.arms.R.hand.glow.getWorldPosition(new THREE.Vector3());
    const t = tip.clone().add(new THREE.Vector3(-0.03, -0.01, -0.04));
    const p = tip.clone().add(new THREE.Vector3(-0.36, 0.12, 0.2));   // from his right, where the raised finger reads clearly
    if (this.reduced) { this.camera.position.copy(p); this.controls.target.copy(t); this.camTween = null; return; }
    this.camTween = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p, t, time: 0, dur: 0.9 };
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.elapsedTime;
    if (this.nightK !== this.nightTarget) {
      const d = this.nightTarget - this.nightK, step = dt / 1.4;
      this.nightK = Math.abs(d) <= step ? this.nightTarget : this.nightK + Math.sign(d) * step;
      this.applyLight(easeInOut(this.nightK));
    }
    const q = this.queue;
    if (q) {
      const seg = q.segs[q.i];
      q.t += dt;
      const k = easeInOut(Math.min(1, q.t / seg.dur));
      this.current = mix(q.from, this.states[seg.to], k);
      keepGrounded(this.child, this.current);
      if (q.t >= seg.dur) {
        q.from = structuredClone(this.states[seg.to]);
        this.poseName = seg.to;
        q.i++; q.t = 0;
        if (q.i >= q.segs.length) { this.queue = null; q.done(); }
      }
    }
    // Index finger for the Tashahhud.
    this.point += (this.pointTarget - this.point) * Math.min(1, dt * 10);
    const s = this.current;
    const shown = this.point > 0.001 ? { ...s, hands: { ...s.hands, R: { ...s.hands.R, point: this.point } } } : s;
    // Blinks every 2.5-6 s: the lids close in 0.09 s and open again in 0.17 s.
    if (!this.reduced) {
      this.blinkAt ??= time + 2;
      const b = time - this.blinkAt, e = (x) => x * x * (3 - 2 * x);
      this.child.blink = b < 0 ? 0 : b < 0.09 ? e(b / 0.09) : b < 0.26 ? e(1 - (b - 0.09) / 0.17) : 0;
      if (b >= 0.26) this.blinkAt = time + 2.5 + Math.random() * 3.5;
    }
    // Gentle breathing.
    const breath = this.reduced ? 0 : Math.sin(time * 1.6) * 0.5;
    this.child.apply({ ...shown, chest: shown.chest + breath });

    if (this.camTween) {
      const c = this.camTween; c.time += dt;
      const k = easeInOut(Math.min(1, c.time / c.dur));
      this.camera.position.lerpVectors(c.p0, c.p, k);
      this.controls.target.lerpVectors(c.t0, c.t, k);
      if (k >= 1) this.camTween = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

export { VIEWS };
