// The praying child: a MakeHuman (CC0) 6-year-old in a navy polo, black trousers and a topi, skinned to a
// Mixamo-style skeleton. Poses come from the solver in poses.js as joint targets; this module
// turns them into bone rotations (full target frames, so nothing twists), with natural
// finger curls and the right forefinger for the Tashahhud.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DEG = Math.PI / 180;
const LID_FOLLOW = 0.75, LID_CLOSE = 32 * DEG;   // upper lids: share of the gaze they follow; blink sweep
// From the knee and mid-shin joints down to the outside of the fitted trousers.
const KNEE_DEPTH = 0.027, SHIN_DEPTH = 0.024;
export const SCALE = 1.15;            // 1.0 m MakeHuman child → 1.15 m, average for age six
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion();

function basisQ(primary, secondary) {
  // Orthonormal frame with columns (primary, secondary', primary × secondary').
  const p = primary.clone().normalize();
  const s = secondary.clone().addScaledVector(p, -secondary.dot(p)).normalize();
  const t = new THREE.Vector3().crossVectors(p, s);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(p, s, t));
}
// World rotation that takes a rest frame (p0, s0) onto a target frame (p, s), applied to rest q0.
function frameQ(p0, s0, p, s, q0) {
  return basisQ(p, s).multiply(basisQ(p0, s0).invert()).multiply(q0);
}

export async function loadChild(url, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(url, onProgress);
  return new Child(gltf);
}

export class Child {
  constructor(gltf) {
    this.group = new THREE.Group();
    this.model = gltf.scene;
    this.model.scale.setScalar(SCALE);
    this.group.add(this.model);
    this.group.updateMatrixWorld(true);

    this.b = {}; this.m = {};
    this.model.traverse((o) => {
      const n = o.name.replace(/^mixamorig:?/, '');
      if (o.isBone) this.b[n] = o;
      if (o.name.startsWith('M_')) this.m[o.name.slice(2)] = o;
      if (o.isMesh) this.prepareMesh(o);
    });
    this.rest = {};
    for (const [n, bone] of Object.entries(this.b)) {
      this.rest[n] = { qw: bone.getWorldQuaternion(new THREE.Quaternion()), pw: bone.getWorldPosition(new THREE.Vector3()), ql: bone.quaternion.clone(), pl: bone.position.clone() };
    }
    this.measure();
    this.prepareFingers();

    // Things the solver and stage expect.
    this.chestG = new THREE.Object3D(); this.group.add(this.chestG);
    this.noseTip = this.m.Nose;
    this.forehead = this.m.Forehead;
    // A soft halo at the fingertip while the index finger is raised.
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g2 = c.getContext('2d'), rg = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,232,180,1)'); rg.addColorStop(0.3, 'rgba(255,214,140,.45)'); rg.addColorStop(1, 'rgba(255,200,120,0)');
    g2.fillStyle = rg; g2.fillRect(0, 0, 64, 64);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(0.045 / SCALE);
    this.m.IndexTipR.add(glow);
    this.arms = { R: { hand: { glow } } };
  }

  prepareMesh(o) {
    o.castShadow = true; o.receiveShadow = true;
    o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const n = m.name || '';
      if (n.startsWith('Eyes')) { m.transparent = false; m.alphaTest = 0.5; m.roughness = 0.3; m.envMapIntensity = 0.35; }
      else if (n.startsWith('Brows') || n.startsWith('Lashes')) { m.transparent = true; m.depthWrite = false; m.alphaTest = 0.04; }
      else if (n.startsWith('Skin')) {
        m.vertexColors = true; m.roughness = 0.55;
        m.color.setScalar(1.4); // the brown tint reads too dark under indoor light
        // The short crop is painted in vertex colours; make it matte instead of skin-glossy.
        m.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.92, clamp((1.0 - vColor.r) * 1.6, 0.0, 1.0));');
        };
      } else if (n.startsWith('Embroidery')) { m.roughness = 0.45; m.metalness = 0.2; }
      else { m.roughness = Math.max(m.roughness, 0.85); }
    }
  }

  // Lowest point of a hand's skin, in world space (for resting hands on the mat).
  handMinY(S) {
    if (!this.handVerts) {
      this.handVerts = { Left: [], Right: [] };
      this.model.traverse((o) => {
        if (!o.isSkinnedMesh || !(o.material.name || '').startsWith('Skin')) return;
        this.skinMesh = o;
        const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, bones = o.skeleton.bones;
        for (let v = 0; v < si.count; v++) {
          let best = 0, bw = 0;
          for (let j = 0; j < 4; j++) if (sw.getComponent(v, j) > bw) { bw = sw.getComponent(v, j); best = si.getComponent(v, j); }
          const m = bones[best].name.match(/(Left|Right)Hand/);
          if (m) this.handVerts[m[1]].push(v);
        }
      });
    }
    const o = this.skinMesh, t = new THREE.Vector3();
    this.model.updateMatrixWorld(true); o.skeleton.update();
    let min = Infinity;
    for (const v of this.handVerts[S]) { o.getVertexPosition(v, t); t.applyMatrix4(o.matrixWorld); if (t.y < min) min = t.y; }
    return min;
  }

  measure() {
    const P = (n) => this.rest[n].pw;
    const d = (a, b) => P(a).distanceTo(P(b));
    const hips = P('Hips'), up = P('LeftUpLeg'), ankle = P('LeftFoot');
    this.D = {
      hipW: up.x - hips.x, hipDrop: hips.y - up.y, hipZ: up.z - hips.z,
      thigh: d('LeftUpLeg', 'LeftLeg'), shin: d('LeftLeg', 'LeftFoot'),
      upper: d('LeftArm', 'LeftForeArm'), fore: d('LeftForeArm', 'LeftHand'),
      ankleH: ankle.y,
    };
    // Foot outline from the skinned body (rest pose), in the foot frame (origin at the ankle).
    let minZ = Infinity, maxZ = -Infinity;
    const footPts = [];
    this.model.traverse((o) => {
      if (!o.isSkinnedMesh || !o.material || !(o.material.name || '').startsWith('Skin')) return;
      const pos = o.geometry.attributes.position, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
      const foot = o.skeleton.bones.indexOf(this.b.LeftFoot), toe = o.skeleton.bones.indexOf(this.b.LeftToeBase);
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        let best = -1, bw = 0;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
        if (best !== foot && best !== toe) continue;
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.x < 0) continue;
        minZ = Math.min(minZ, v.z - ankle.z); maxZ = Math.max(maxZ, v.z - ankle.z);
        footPts.push({ p: v.clone().sub(ankle), toe: best === toe });
      }
    });
    this.D.heel = isFinite(minZ) ? -minZ : 0.055;
    this.D.toeTip = isFinite(maxZ) ? maxZ : 0.12;
    this.D.toeJoint = P('LeftToeBase').clone().sub(ankle);
    // Extreme points of the foot (sole, heel, top, sides, toes) as floor contacts.
    const dirs = [];
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) dirs.push(new THREE.Vector3(x, y, z).normalize());
    const picked = new Map();
    for (const d of dirs) {
      let best = null, bd = -Infinity;
      for (const f of footPts) { const t = f.p.dot(d); if (t > bd) { bd = t; best = f; } }
      if (best) picked.set(best, true);
    }
    this.footSamples = [...picked.keys()];
    // Hand frames at rest: finger direction and palm normal (out of the palm).
    this.handRest = {};
    for (const s of ['Left', 'Right']) {
      const f = P(s + 'HandMiddle1').clone().sub(P(s + 'Hand')).normalize();
      const across = P(s + 'HandIndex1').clone().sub(P(s + 'HandPinky1'));
      across.addScaledVector(f, -across.dot(f)).normalize();      // towards the thumb side
      const n = s === 'Left' ? new THREE.Vector3().crossVectors(f, across) : new THREE.Vector3().crossVectors(across, f);
      const palm = this.m['Palm' + s[0]].getWorldPosition(new THREE.Vector3());
      this.handRest[s] = { f, n: n.normalize(), palmOff: palm.sub(P(s + 'Hand')) };
    }
  }

  prepareFingers() {
    // Bend axis per finger bone in its own local space (curling towards the palm).
    this.fingers = {};
    for (const s of ['Left', 'Right']) {
      const { f, n } = this.handRest[s];
      for (const fin of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
        const chain = [1, 2, 3].map((k) => this.b[`${s}Hand${fin}${k}`]).filter(Boolean);
        this.fingers[s + fin] = chain.map((bone) => {
          const name = bone.name.replace(/^mixamorig:?/, '');
          const r = this.rest[name];
          let dir = f;
          if (fin === 'Thumb') {
            const nx = this.b[name.replace(/\d$/, (k) => String(Math.min(3, +k + 1)))];
            dir = (nx && nx !== bone ? this.rest[nx.name.replace(/^mixamorig:?/, '')].pw.clone().sub(r.pw) : f.clone()).normalize();
          }
          const curl = new THREE.Vector3().crossVectors(dir, n).normalize().applyQuaternion(r.qw.clone().invert());
          const spread = n.clone().applyQuaternion(r.qw.clone().invert());
          return { bone, ql: r.ql, curl, spread };
        });
      }
      // How far each finger fans out from the middle finger at rest (around the palm normal),
      // so `close` can bring the fingers together.
      const dirOf = (fin) => {
        const a = this.b[`${s}Hand${fin}1`], b = this.b[`${s}Hand${fin}2`];
        if (!a || !b) return null;
        const d = this.rest[b.name.replace(/^mixamorig:?/, '')].pw.clone().sub(this.rest[a.name.replace(/^mixamorig:?/, '')].pw);
        return d.sub(n.clone().multiplyScalar(d.dot(n))).normalize();
      };
      const mid = dirOf('Middle');
      for (const fin of ['Index', 'Ring', 'Pinky']) {
        const d = dirOf(fin), j = this.fingers[s + fin][0];
        if (!d || !mid || !j) continue;
        j.fan = Math.atan2(new THREE.Vector3().crossVectors(mid, d).dot(n), mid.dot(d));
      }
    }
  }

  // ---------- helpers ----------
  setWorldQ(bone, qw) {
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(tq);
    bone.quaternion.copy(tq.invert().multiply(qw));
    bone.updateMatrixWorld(true);
  }
  wp(bone) { return bone.getWorldPosition(new THREE.Vector3()); }
  // The bend happens mostly at the hip joints: the pelvis tilts with the trunk.
  pelvisOf(s) { return s.pelvis ?? Math.max(-8, Math.min(95, s.spine * 0.85)); }

  // ---------- torso ----------
  setTorso(s) {
    const Rx = (a) => new THREE.Quaternion().setFromAxisAngle(X, a * DEG);
    const pel = this.pelvisOf(s);
    const hips = this.b.Hips;
    this.setWorldQ(hips, Rx(pel).multiply(this.rest.Hips.qw));
    hips.parent.updateWorldMatrix(true, false);
    hips.position.copy(hips.parent.worldToLocal(new THREE.Vector3(...s.root)));
    hips.updateMatrixWorld(true);
    const total = s.spine + s.chest;
    this.setWorldQ(this.b.Spine, Rx(pel * 0.3 + s.spine * 0.7).multiply(this.rest.Spine.qw));
    this.setWorldQ(this.b.Spine1, Rx(s.spine).multiply(this.rest.Spine1.qw));
    this.setWorldQ(this.b.Spine2, Rx(total).multiply(this.rest.Spine2.qw));
    this.setWorldQ(this.b.Neck, Rx(total + s.neck * 0.45).multiply(this.rest.Neck.qw));
    const head = Rx(total + s.neck).multiply(new THREE.Quaternion().setFromAxisAngle(Y, s.yaw * DEG)).multiply(Rx(s.nod || 0));
    this.setWorldQ(this.b.Head, head.multiply(this.rest.Head.qw));
    // The chest frame used by pose offsets: origin at Spine1, axes turned with the chest.
    this.chestG.position.copy(this.wp(this.b.Spine1));
    this.chestG.quaternion.copy(Rx(total));
    this.group.updateMatrixWorld(true);
  }

  // ---------- legs (sagittal FK; same conventions as before) ----------
  legPoints(k, L, s) {
    const side = k === 'L' ? 1 : -1, D = this.D;
    const pel = s ? this.pelvisOf(s) : 0;
    const root = s ? new THREE.Vector3(...s.root) : this.wp(this.b.Hips);
    const hip = new THREE.Vector3(side * D.hipW, -D.hipDrop, D.hipZ).applyAxisAngle(X, pel * DEG).add(root);
    const dir = (pitch, abd) => new THREE.Vector3(0, -Math.cos(pitch * DEG), Math.sin(pitch * DEG)).applyAxisAngle(Z, side * abd * DEG);
    const ant = (pitch, abd) => new THREE.Vector3(0, Math.sin(pitch * DEG), Math.cos(pitch * DEG)).applyAxisAngle(Z, side * abd * DEG);
    const knee = hip.clone().addScaledVector(dir(L.thigh, L.abd), D.thigh);
    const q = L.thigh - L.knee;
    const shinAbd = L.abd * 0.5 + (L.shinOut || 0);
    const ankle = knee.clone().addScaledVector(dir(q, shinAbd), D.shin);
    const footQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(L.foot[0] * DEG, side * L.foot[1] * DEG, side * L.foot[2] * DEG, 'YXZ'));
    return { side, hip, knee, ankle, footQ, thighAnt: ant(L.thigh, L.abd), shinAnt: ant(q, shinAbd) };
  }

  legContacts(p, L) {
    const side = p.side, tj = this.D.toeJoint;
    const rt = new THREE.Quaternion().setFromAxisAngle(X, -L.toe * DEG);
    const pts = this.footSamples.map(({ p: q, toe }) => {
      const v = new THREE.Vector3(q.x * side, q.y, q.z);
      if (toe) { const j = new THREE.Vector3(tj.x * side, tj.y, tj.z); v.sub(j).applyQuaternion(rt).add(j); }
      return v.applyQuaternion(p.footQ).add(p.ankle);
    });
    pts.push(p.knee.clone().add(new THREE.Vector3(0, -KNEE_DEPTH, 0)));     // kneecap through the trousers
    pts.push(p.knee.clone().lerp(p.ankle, 0.5).add(new THREE.Vector3(0, -SHIN_DEPTH, 0)));
    return pts;
  }

  applyLegs(s) {
    const pts = {};
    for (const k of ['L', 'R']) {
      const S = k === 'L' ? 'Left' : 'Right', L = s.legs[k];
      const p = this.legPoints(k, L, s);
      const r = this.rest;
      const kneeR = r[S + 'Leg'].pw, hipR = r[S + 'UpLeg'].pw, ankR = r[S + 'Foot'].pw;
      this.setWorldQ(this.b[S + 'UpLeg'], frameQ(kneeR.clone().sub(hipR), Z, p.knee.clone().sub(p.hip), p.thighAnt, r[S + 'UpLeg'].qw));
      this.setWorldQ(this.b[S + 'Leg'], frameQ(ankR.clone().sub(kneeR), Z, p.ankle.clone().sub(p.knee), p.shinAnt, r[S + 'Leg'].qw));
      this.setWorldQ(this.b[S + 'Foot'], p.footQ.clone().multiply(r[S + 'Foot'].qw));
      const toe = new THREE.Quaternion().setFromAxisAngle(X, -L.toe * DEG);
      this.setWorldQ(this.b[S + 'ToeBase'], p.footQ.clone().multiply(toe).multiply(r[S + 'ToeBase'].qw));
      pts[k] = p;
    }
    return pts;
  }

  // ---------- arms ----------
  shoulder(k) { return this.wp(this.b[k === 'L' ? 'LeftArm' : 'RightArm']); }

  handFrame(S, H) {
    const hr = this.handRest[S];
    const f = new THREE.Vector3(...H.f).normalize();
    const n = new THREE.Vector3(...H.n);
    const qw = frameQ(hr.f, hr.n, f, n, this.rest[S + 'Hand'].qw);
    const delta = qw.clone().multiply(this.rest[S + 'Hand'].qw.clone().invert());
    const wrist = new THREE.Vector3(...H.p).sub(hr.palmOff.clone().applyQuaternion(delta));
    return { qw, wrist };
  }

  applyArms(s) {
    for (const k of ['L', 'R']) {
      const S = k === 'L' ? 'Left' : 'Right', H = s.hands[k], r = this.rest;
      const { qw: handQ, wrist: W } = this.handFrame(S, H);
      const Sp = this.shoulder(k);
      const a = this.D.upper, b = this.D.fore;
      const toW = W.clone().sub(Sp);
      let d = toW.length();
      const u = toW.clone().divideScalar(d || 1);
      d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-4);
      const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
      const pole = new THREE.Vector3(...H.pole); pole.addScaledVector(u, -pole.dot(u));
      if (pole.lengthSq() < 1e-8) pole.set(0, 0, -1);
      pole.normalize();
      const E = Sp.clone().addScaledVector(u, x).addScaledVector(pole, h);
      const Wr = Sp.clone().addScaledVector(u, d);
      const hinge = new THREE.Vector3().crossVectors(pole, u).normalize();
      // Rest frames of the upper arm and forearm (hinge from the rest elbow bend).
      const S0 = r[S + 'Arm'].pw, E0 = r[S + 'ForeArm'].pw, W0 = r[S + 'Hand'].pw;
      const hinge0 = new THREE.Vector3().crossVectors(E0.clone().sub(S0), W0.clone().sub(E0)).normalize();
      this.setWorldQ(this.b[S + 'Arm'], frameQ(E0.clone().sub(S0), hinge0, E.clone().sub(Sp), hinge, r[S + 'Arm'].qw));
      const foreQ = frameQ(W0.clone().sub(E0), hinge0, Wr.clone().sub(E), hinge, r[S + 'ForeArm'].qw);
      // Share the wrist's twist with the forearm, so the wrist never pinches.
      const axisW = Wr.clone().sub(E).normalize();
      const relHand = handQ.clone().multiply(r[S + 'Hand'].qw.clone().invert());
      const relFore = foreQ.clone().multiply(r[S + 'ForeArm'].qw.clone().invert());
      const diff = relHand.clone().multiply(relFore.clone().invert());
      const proj = new THREE.Vector3(diff.x, diff.y, diff.z).projectOnVector(axisW);
      const twist = new THREE.Quaternion(proj.x, proj.y, proj.z, diff.w).normalize();
      const half = new THREE.Quaternion().slerp(twist, 0.5);
      this.setWorldQ(this.b[S + 'ForeArm'], half.multiply(foreQ));
      this.setWorldQ(this.b[S + 'Hand'], handQ);
      this.applyFingers(S, H);
    }
  }

  applyFingers(S, H) {
    const curl = H.curl || 0, point = H.point || 0, spread = H.spread || 0, flat = H.flat || 0, close = H.close || 0;
    // Thumb lift (negative = away from the palm) and swing in the palm plane (negative = towards the index).
    const thumb = H.thumb || 0, thumbOut = (H.thumbOut || 0) * (S === 'Left' ? 1 : -1);
    const relaxed = { Thumb: [0.05, 0.15, 0.15], Index: [0.12, 0.18, 0.1], Middle: [0.15, 0.2, 0.12], Ring: [0.18, 0.22, 0.12], Pinky: [0.22, 0.25, 0.15] };
    const fist = { Thumb: [0.35, 0.55, 0.6], Index: [1.35, 1.55, 0.9], Middle: [1.45, 1.6, 0.9], Ring: [1.45, 1.6, 0.9], Pinky: [1.4, 1.5, 0.85] };
    const spreadA = { Thumb: 0, Index: 0.12, Middle: 0, Ring: -0.1, Pinky: -0.22 };
    for (const fin of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      const chain = this.fingers[S + fin];
      chain.forEach((j, i) => {
        const rest = fin === 'Thumb' ? relaxed[fin][i] : relaxed[fin][i] * (1 - flat);   // flat: fingers straight on the mat
        let ang = rest + (fist[fin][i] - rest) * curl;
        if (fin === 'Thumb') ang += thumb * [1, 0.7, 0.5][i];
        if (fin === 'Index' && point > 0) ang = ang * (1 - point) + (i === 0 ? -1.25 : -0.05) * point;
        const q = j.ql.clone().multiply(tq2.setFromAxisAngle(j.curl, ang));
        if (fin === 'Thumb' && i === 0 && thumbOut) q.multiply(new THREE.Quaternion().setFromAxisAngle(j.spread, thumbOut));
        if (i === 0 && spread) q.multiply(new THREE.Quaternion().setFromAxisAngle(j.spread, spreadA[fin] * spread));
        if (i === 0 && close && j.fan) q.multiply(new THREE.Quaternion().setFromAxisAngle(j.spread, -j.fan * close));
        j.bone.quaternion.copy(q);
      });
    }
    this.b[S + 'Hand'].updateMatrixWorld(true);
  }

  apply(s) {
    this.setTorso(s);
    this.applyLegs(s);
    this.applyArms(s);
    this.applyGaze(s);
    const g = this.arms.R.hand.glow;
    const p = s.hands.R.point || 0;
    g.material.opacity = p * 0.6;
    g.visible = p > 0.01;
  }

  // Eyes turn towards a point on the mat (the place of Sajdah when standing), within what
  // the eyelids allow; the head does the rest of the looking down.
  applyGaze(s) {
    if (!this.b.LeftEye || !s.gaze) return;
    const head = this.b.Head;
    head.updateMatrixWorld(true);
    const hq = head.getWorldQuaternion(new THREE.Quaternion());
    const delta = hq.clone().multiply(this.rest.Head.qw.clone().invert());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(delta);
    const target = new THREE.Vector3(...s.gaze);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(delta);
    for (const S of ['Left', 'Right']) {
      const eye = this.b[S + 'Eye'];
      const dir = target.clone().sub(eye.getWorldPosition(new THREE.Vector3())).normalize();
      const ang = fwd.angleTo(dir), max = 18 * DEG;   // the eyes look down at the mat
      const turn = new THREE.Quaternion().setFromUnitVectors(fwd, dir);
      if (ang > max) turn.slerp(new THREE.Quaternion(), 1 - max / ang);   // as far as the lids allow
      this.setWorldQ(eye, turn.clone().multiply(delta).multiply(this.rest[S + 'Eye'].qw));
      // The upper lid follows the eye most of the way down (about half covering it when looking
      // down), and closes over it for a blink.
      const lid = this.b[S + 'Lid'];
      if (!lid) continue;
      const lq = new THREE.Quaternion().slerp(turn, LID_FOLLOW);
      if (this.blink > 0) lq.premultiply(new THREE.Quaternion().setFromAxisAngle(right, this.blink * LID_CLOSE));
      this.setWorldQ(lid, lq.multiply(delta).multiply(this.rest[S + 'Lid'].qw));
    }
  }

  // ---------- anchors for the solver ----------
  anchor(name, k) {
    const w = (o) => o.getWorldPosition(new THREE.Vector3());
    switch (name) {
      case 'ear': return w(this.m['Ear' + k]);
      case 'forehead': return w(this.m.Forehead);
      case 'shoulder': return this.shoulder(k);
      default: return new THREE.Vector3();
    }
  }

  tick() {}
}
