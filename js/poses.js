// Salat postures, following "Salat – The Muslim Prayer Book" (alislam.org), Chapter Two.
// Angles in degrees. The body faces +Z (the Qiblah). Hand specs are written for the left
// side (+X) and mirrored for the right unless both sides are given. Contacts (palms on the
// chest, knees, thighs and the floor) are snapped to the real posed surfaces by raycasting.
import * as THREE from 'three';

export const FLOOR = 0.006;          // top of the prayer mat
// Where the eyes rest: the place of Sajdah on the mat (sitting: just past the knees).
const GAZE_SAJDAH = [0, FLOOR, 0.78];
// Floor postures sit forward of the standing spot so the toes and knees stay put.
const KNEEL_Z = 0.37, SIT_Z = 0.17;

const flat = (yaw = 5) => ({ thigh: 0, knee: 0, abd: 2, foot: [0, yaw, 0], toe: 0 });
const toesBent = (thigh, knee) => ({ thigh, knee, abd: 3, foot: [90, 0, 0], toe: 90 });

// Arms hanging straight by the sides (targets beyond reach, so the IK keeps them straight).
const armsStraight = { frame: 'shoulder', o: [0.065, -0.6, 0.035], f: [0.04, -1, 0.05], n: [-1, 0, 0.12], pole: [0.1, 0, -1] };
// A resting hand: the thumb lies beside the index finger, its pad level with the finger pads.
const THUMB_REST = { thumb: -0.4, thumbOut: -0.4 };
const handsOnThighs = { frame: 'knee', o: [0.0, 0.35, -0.075], snap: [0, -1, 0], gap: 0.011, f: [0, -0.12, 1], n: [0, -1, 0], pole: [0.8, 0.2, -1], curl: 0.05, ...THUMB_REST };
const handsOnFloor = { frame: 'forehead', floorAbs: true, o: [0.12, 0, -0.035], f: [0, 0, 1], n: [0, -1, 0], pole: [1, 1.1, -0.3], curl: 0, flat: 1, thumb: -0.3, thumbOut: -0.4 };   // thumb pad on the mat

// Foot angles (the YXZ Euler of `foot`) from where the toes point and where the sole faces
// (left-side coordinates: +X is the child's left, +Z the Qiblah).
function footAim(toe, sole) {
  const z = new THREE.Vector3(...toe).normalize();
  const y = new THREE.Vector3(...sole).multiplyScalar(-1);
  y.addScaledVector(z, -y.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z), 'YXZ');
  return [e.x, e.y, e.z].map((r) => r * 180 / Math.PI);
}

const SIT_LEGS = {
  // Sit on the left foot: it lies on its outer edge under the seat, the sole facing back and
  // the toes pointing down towards the right. The right foot stands upright beside its heel,
  // the toes bent towards the Qiblah. (As in the book's photo of Jilsah from behind.)
  L: { thigh: 69, knee: 160, abd: 6, foot: footAim([-0.6, -0.75, -0.15], [0.25, 0.3, -0.92]), toe: 0 },
  R: { thigh: 69, knee: 168, abd: 5, foot: [94, 0, 0], toe: 92, shinOut: 5 },
};

export const POSES = {
  // Standing straight, arms hanging by the sides (Qaumah, and the Iqamah as the book says).
  stand: { torso: [0, 0, 9], legs: { L: flat(), R: flat() }, hands: armsStraight },
  iqamah: { torso: [0, 0, 9], legs: { L: flat(), R: flat() }, hands: armsStraight },

  // Takbir-i-Tahrimah (as in the book's picture): hands upright beside the face, palms towards
  // the Qiblah, fingers together and straight, the thumbs reaching to the earlobes; elbows low.
  takbir: {
    torso: [0, 0, 3], legs: { L: flat(), R: flat() },
    hands: { frame: 'ear', o: [0.04, -0.01, -0.03], f: [0.05, 1, -0.06], n: [0, 0, 1], pole: [0.5, -0.5, 1], curl: 0, flat: 1, close: 1.1, thumb: -0.2, thumbOut: 0.9 },
  },
  // In between: the hands rise (and come down again) in front of the body, palms turning from
  // the sides to the Qiblah, elbows kept low, so the arms never swing out sideways.
  raise: {
    torso: [0, 0, 5], legs: { L: flat(), R: flat() },
    hands: { frame: 'shoulder', o: [-0.005, -0.05, 0.26], f: [0.15, 0.75, 0.6], n: [-0.75, 0.25, 0.6], pole: [0.35, -1, 0.35], curl: 0, flat: 1, close: 0.8, ...THUMB_REST },
  },
  lower: {
    torso: [0, 0, 6], legs: { L: flat(), R: flat() },
    hands: { frame: 'shoulder', o: [-0.015, -0.13, 0.28], f: [-0.15, 0.55, 0.8], n: [-0.75, 0.3, 0.05], pole: [0.35, -1, 0.25], curl: 0.1, ...THUMB_REST },
  },

  // Qiyam: hands folded just above the navel, right hand over the left (the book allows
  // the hands a little above or below the navel as well as on the chest).
  qiyam: {
    torso: [0, 0, 10], legs: { L: flat(), R: flat() },
    hands: {
      L: { frame: 'chest', o: [0.012, -0.045, 0.3], snap: 'n', gap: 0.014, f: [-1, 0.08, 0], n: [0, 0, -1], pole: [1, -0.6, -0.4], curl: 0.08, ...THUMB_REST },
      R: { frame: 'handL', o: [0.03, 0.006, 0], lift: 0.024, f: [1, -0.1, 0.04], n: [0, 0, -1], pole: [-1, -0.6, -0.4], curl: 0.15, ...THUMB_REST },
    },
  },

  // Ruku': hands pressing the knees with fingers spread, back level from waist to head.
  ruku: {
    torso: [88, 6, -4], rootZ: -0.07,
    legs: { L: { ...flat(), thigh: 10, knee: 4 }, R: { ...flat(), thigh: 10, knee: 4 } },
    hands: { frame: 'knee', o: [0.0, -0.045, 0.3], snap: 'n', gap: 0.012, f: [0, -1, 0.28], n: [0, 0.2, -1], pole: [0.3, 0.2, -1], curl: 0.12, spread: 1, ...THUMB_REST },
  },

  // Going down: knees first, then hands, then nose and forehead.
  kneelMid: {
    torso: [16, 4, 10], rootZ: 0.02,
    legs: { L: { thigh: 42, knee: 88, abd: 3, foot: [30, 4, 0], toe: 30 }, R: { thigh: 42, knee: 88, abd: 3, foot: [30, 4, 0], toe: 30 } },
    hands: { frame: 'shoulder', o: [0.05, -0.24, 0.11], f: [0, -1, 0.3], n: [-0.6, 0, -0.6], pole: [0.3, 0, -1] },
  },
  // The kneeling postures keep the toes where the feet stood; the knees land a shin's length
  // forward and stay there for Jilsah and Sajdah (nothing slides on the mat).
  kneel: {
    settle: true, rootZ: KNEEL_Z,
    torso: [20, 4, 12],
    legs: { L: toesBent(6, 112), R: toesBent(6, 112) },
    hands: { frame: 'shoulder', o: [0.06, -0.22, 0.14], f: [0, -1, 0.4], n: [-0.4, 0, -0.8], pole: [0.4, 0, -1] },
  },
  handsDown: {
    settle: true, rootZ: KNEEL_Z,
    torso: [80, 14, 12],
    legs: { L: toesBent(14, 118), R: toesBent(14, 118) },
    hands: { frame: 'knee', floorAbs: true, o: [0.05, 0, 0.24], f: [0, 0, 1], n: [0, -1, 0], pole: [1, 1, -0.4], flat: 1, thumb: -0.3, thumbOut: -0.4 },
  },

  // Sajdah: knees, hands, nose and forehead on the ground; arms away from the ground and the
  // sides; toes bent towards the Qiblah.
  sajdah: {
    settle: true, rootZ: KNEEL_Z,
    torso: [0, 10, 0], headDown: true,
    legs: { L: toesBent(14, 118), R: toesBent(14, 118) },
    hands: handsOnFloor,
  },

  // Jilsah / Qa'dah: sitting on the left foot, hands on the thighs near the knees.
  sit: { torso: [8, -2, 11], settle: true, rootZ: SIT_Z, legs: SIT_LEGS, hands: handsOnThighs, gaze: [0, FLOOR, 0.66] },
  tashahhud: { torso: [8, -2, 11], settle: true, rootZ: SIT_Z, legs: SIT_LEGS, hands: handsOnThighs, gaze: [0, FLOOR, 0.66] },
  salamR: { torso: [8, -3, 2], yaw: -76, settle: true, rootZ: SIT_Z, legs: SIT_LEGS, hands: handsOnThighs, gaze: [-2, 0.3, 0.3] },
  salamL: { torso: [8, -3, 2], yaw: 76, settle: true, rootZ: SIT_Z, legs: SIT_LEGS, hands: handsOnThighs, gaze: [2, 0.3, 0.3] },

  // Getting up for the next rak'ah.
  kneelTall: {
    settle: true, rootZ: KNEEL_Z,
    torso: [18, 4, 10],
    legs: { L: toesBent(4, 108), R: toesBent(4, 108) },
    hands: { frame: 'shoulder', o: [0.05, -0.22, 0.16], f: [0, -1, 0.5], n: [-0.5, 0, -0.7], pole: [0.4, 0, -1] },
  },
  squat: {
    torso: [36, 10, 4], rootZ: -0.04,
    legs: { L: { thigh: 62, knee: 112, abd: 5, foot: [0, 6, 0], toe: 0 }, R: { thigh: 62, knee: 112, abd: 5, foot: [0, 6, 0], toe: 0 } },
    hands: { frame: 'knee', o: [0.0, 0.3, -0.02], snap: [0, -1, 0], gap: 0.011, f: [0, -0.4, 1], n: [0, -1, 0], pole: [0.6, 0.2, -1] },
  },
};

export const FAMILY = {
  stand: 'stand', iqamah: 'stand', takbir: 'stand', qiyam: 'stand', ruku: 'stand',
  sajdah: 'ground', sit: 'sit', tashahhud: 'sit', salamR: 'sit', salamL: 'sit',
};

// How long each hop takes (s). Going down to Sajdah and getting up again are brisk, as a
// child does them; the arm movements of the Takbir are quick too.
const HOP = { kneelMid: 0.42, kneel: 0.42, handsDown: 0.42, kneelTall: 0.42, squat: 0.42, stand: 0.45, sit: 0.6, raise: 0.055, lower: 0.055 };
// Going down to Sajdah from standing and standing up from it run twice as quick.
export const quickSajdah = (from, to) => (from === 'sajdah' && FAMILY[to] === 'stand') || (to === 'sajdah' && FAMILY[from] === 'stand');
export function hopTime(name, last, nHops, sajdah = false) {
  // Raising the hands for the Takbir and folding them after it: brisk (raise/lower + this hop).
  if (last && nHops === 2 && (name === 'qiyam' || name === 'takbir')) return 0.085;
  const t = last ? (nHops > 2 ? 0.6 : name === 'qiyam' || name === 'takbir' ? 0.55 : 0.95) : HOP[name] ?? 0.7;
  return sajdah ? t / 2 : t;
}

// The in-between postures to pass through, so movements look real.
export function route(from, to) {
  if (from === to) return [to];
  const a = FAMILY[from] || 'other', b = FAMILY[to] || 'other';
  if (to === 'takbir' && a === 'stand') return ['raise', 'takbir'];
  if (from === 'takbir' && to === 'qiyam') return ['lower', 'qiyam'];
  if (a === 'stand' && to === 'sajdah') return ['kneelMid', 'kneel', 'handsDown', 'sajdah'];
  if (from === 'sajdah' && b === 'sit') return ['handsDown', 'sit', ...(to === 'sit' ? [] : [to])];
  if (a === 'sit' && to === 'sajdah') return ['handsDown', 'sajdah'];
  if ((from === 'sajdah' || a === 'sit') && b === 'stand') return ['kneelTall', 'squat', 'stand', ...(to === 'stand' ? [] : [to])];
  if (a === 'stand' && b === 'sit') return ['kneelMid', 'kneel', 'sit', ...(to === 'sit' ? [] : [to])];
  return [to];
}

const mirror = (v, side) => [v[0] * side, v[1], v[2]];
const ray = new THREE.Raycaster();

function legContactMin(child, s) {
  let min = Infinity;
  for (const k of ['L', 'R']) {
    const p = child.legPoints(k, s.legs[k], s);
    for (const c of child.legContacts(p, s.legs[k])) min = Math.min(min, c.y);
  }
  return min;
}

// Cast from `from` along `dir` against the posed clothes and skin.
function surfaceHit(child, from, dir) {
  const meshes = [];
  child.model.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const m of meshes) m.computeBoundingSphere();
  ray.set(from, dir.clone().normalize());
  ray.far = 0.6;
  const hits = ray.intersectObjects(meshes, false);
  return hits.length ? hits[0].point : null;
}

// Resolve a pose spec into a flat numeric state using the posed model for anchors.
export function resolve(child, name) {
  const P = POSES[name];
  const s = {
    root: [0, 1, P.rootZ || 0], spine: P.torso[0], chest: P.torso[1], neck: P.torso[2],
    nod: 0, yaw: P.yaw || 0, gaze: P.gaze || GAZE_SAJDAH,
    legs: { L: structuredClone(P.legs.L), R: structuredClone(P.legs.R) },
    hands: {},
  };
  const ground = () => { child.setTorso(s); s.root[1] -= legContactMin(child, s) - FLOOR; child.setTorso(s); };
  ground();
  if (P.settle) {
    // Bend each knee until the foot and the knee both rest on the mat (nothing floats).
    const n = child.footSamples.length;
    for (const k of ['L', 'R']) {
      const L = s.legs[k];
      let lo = L.knee - 30, hi = Math.min(178, L.knee + 30);
      for (let i = 0; i < 24; i++) {
        L.knee = (lo + hi) / 2;
        child.setTorso(s);
        const pts = child.legContacts(child.legPoints(k, L, s), L);
        const foot = Math.min(...pts.slice(0, n).map((v) => v.y));
        if (foot > pts[n].y) hi = L.knee; else lo = L.knee;
      }
    }
    ground();
  }
  if (P.headDown) {
    // Find the trunk and neck angles that rest both the forehead and the nose on the mat.
    const contact = FLOOR + 0.004;
    const fitSpine = () => {
      let lo = 40, hi = 160;
      for (let i = 0; i < 32; i++) {
        s.spine = (lo + hi) / 2;
        ground();
        const f = child.anchor('forehead').y, n = child.noseTip.getWorldPosition(new THREE.Vector3()).y;
        if (Math.min(f, n) > contact) lo = s.spine; else hi = s.spine;
      }
      ground();
    };
    let lo = -90, hi = 70;
    for (let i = 0; i < 22; i++) {
      s.neck = (lo + hi) / 2;
      fitSpine();
      const f = child.anchor('forehead').y, n = child.noseTip.getWorldPosition(new THREE.Vector3()).y;
      if (n > f) hi = s.neck; else lo = s.neck;      // more head pitch lowers the forehead below the nose
    }
    fitSpine();
  }
  child.applyLegs(s);
  child.group.updateMatrixWorld(true);
  const legPts = { L: child.legPoints('L', s.legs.L, s), R: child.legPoints('R', s.legs.R, s) };
  const chestQ = child.chestG.getWorldQuaternion(new THREE.Quaternion());
  const explicit = P.hands.L && P.hands.R;
  for (const k of ['L', 'R']) {
    const side = k === 'L' ? 1 : -1;
    const H = explicit ? P.hands[k] : P.hands;
    const m = (v) => (explicit ? v : mirror(v, side));
    let p;
    const f = new THREE.Vector3(...m(H.f)), n = new THREE.Vector3(...m(H.n)), pole = new THREE.Vector3(...m(H.pole));
    const o = new THREE.Vector3(...m(H.o));
    if (H.frame === 'chest') {
      p = child.chestG.localToWorld(o.clone());
      f.applyQuaternion(chestQ); n.applyQuaternion(chestQ); pole.applyQuaternion(chestQ);
    } else if (H.frame === 'knee') {
      p = legPts[k].knee.clone().add(o);
    } else if (H.frame === 'handL') {
      const L = s.hands.L;
      p = new THREE.Vector3(...L.p).add(o).addScaledVector(new THREE.Vector3(...L.n).normalize(), -H.lift);
    } else {
      p = child.anchor(H.frame, k).add(o);
    }
    if (H.snap) {
      const dir = H.snap === 'n' ? n.clone().normalize() : new THREE.Vector3(...H.snap);
      const hit = surfaceHit(child, p.clone(), dir) || surfaceHit(child, p.clone().addScaledVector(dir, -0.3), dir);
      if (hit) p = hit.addScaledVector(dir, -H.gap);
    }
    if (H.floorAbs) p.y = FLOOR + 0.012;
    s.hands[k] = { p: p.toArray(), f: f.toArray(), n: n.toArray(), pole: pole.toArray(), curl: H.curl || 0, point: 0, spread: H.spread || 0, thumb: H.thumb || 0, thumbOut: H.thumbOut || 0, flat: H.flat || 0, close: H.close || 0 };
  }
  // Hands on the mat rest on it: lift each until its lowest skin (fingertips, palm) touches.
  for (let i = 0; i < 2; i++) {
    const floorHands = ['L', 'R'].filter((k) => (P.hands.L && P.hands.R ? P.hands[k] : P.hands).floorAbs);
    if (!floorHands.length) break;
    child.apply(s);
    for (const k of floorHands) s.hands[k].p[1] += FLOOR + 0.001 - child.handMinY(k === 'L' ? 'Left' : 'Right');
  }
  return s;
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

export function mix(a, b, t) {
  const legs = {};
  for (const k of ['L', 'R']) {
    const A = a.legs[k], B = b.legs[k];
    legs[k] = { thigh: lerp(A.thigh, B.thigh, t), knee: lerp(A.knee, B.knee, t), abd: lerp(A.abd, B.abd, t), foot: lerpArr(A.foot, B.foot, t), toe: lerp(A.toe, B.toe, t), shinOut: lerp(A.shinOut || 0, B.shinOut || 0, t) };
  }
  const hands = {};
  for (const k of ['L', 'R']) {
    const A = a.hands[k], B = b.hands[k];
    hands[k] = { p: lerpArr(A.p, B.p, t), f: lerpArr(A.f, B.f, t), n: lerpArr(A.n, B.n, t), pole: lerpArr(A.pole, B.pole, t), curl: lerp(A.curl, B.curl, t), point: lerp(A.point, B.point, t), spread: lerp(A.spread || 0, B.spread || 0, t), thumb: lerp(A.thumb || 0, B.thumb || 0, t), thumbOut: lerp(A.thumbOut || 0, B.thumbOut || 0, t), flat: lerp(A.flat || 0, B.flat || 0, t), close: lerp(A.close || 0, B.close || 0, t) };
  }
  return {
    root: lerpArr(a.root, b.root, t), spine: lerp(a.spine, b.spine, t), chest: lerp(a.chest, b.chest, t),
    neck: lerp(a.neck, b.neck, t), nod: lerp(a.nod, b.nod, t), yaw: lerp(a.yaw, b.yaw, t), legs, hands,
    gaze: lerpArr(a.gaze || GAZE_SAJDAH, b.gaze || GAZE_SAJDAH, t),
  };
}

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Keeps every leg contact on or above the mat while blending between poses.
// Every Salat movement keeps the feet or knees on the mat: blended in-between postures are
// set down on it too (neither sinking into it nor floating above it).
export function keepGrounded(child, s) {
  child.setTorso(s);
  s.root[1] += FLOOR - legContactMin(child, s);
}
