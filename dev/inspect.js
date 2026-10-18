// Dev-only inspection helpers (not deployed). In the console:
//   const I = await import('/dev/inspect.js'); await I.sheet([...])
const S = () => window.salat;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function go(idx, point = false, ms = 2600) {
  const { state, enterStep, stage } = S();
  document.querySelector('#welcome')?.style.setProperty('display', 'none');
  state.idx = idx; enterStep(idx); stage.setPoint(!!point);
  await wait(ms);
}

// rows: [{ step, point, target: boneName | 'body' | [x,y,z], views: [[dx,dy,dz],...], dist, mirror }]
// views are directions from the target (child's left = +X); with mirror, Right* bones flip x.
export async function sheet(rows, tile = 240) {
  const { stage } = S();
  const V = stage.camera.position.constructor;
  const cols = Math.max(...rows.map((r) => r.views.length));
  const cv = document.createElement('canvas'); cv.width = cols * tile; cv.height = rows.length * tile;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  const cam = stage.camera.clone(), R = stage.renderer, sz = R.getSize(new V());
  let last = null;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const key = `${row.step}:${!!row.point}`;
    if (key !== last) { await go(row.step, row.point); last = key; }
    const c = stage.child;
    let t;
    if (Array.isArray(row.target)) t = new V(...row.target);
    else if (row.target === 'body') t = c.b.Hips.getWorldPosition(new V()).add(new V(0, -0.05, 0));
    else t = c.b[row.target].getWorldPosition(new V());
    if (row.offset) t.add(new V(...row.offset));
    const sx = row.mirror && /Right/.test(row.target) ? -1 : 1;
    row.views.forEach((v, i) => {
      cam.position.copy(t).add(new V(v[0] * sx, v[1], v[2]).normalize().multiplyScalar(row.dist || 0.3));
      cam.near = row.near || 0.02; cam.far = 50; cam.fov = row.fov || 40; cam.aspect = sz.x / sz.y;
      cam.lookAt(t); cam.updateProjectionMatrix();
      R.render(stage.scene, cam);
      const W = R.domElement.width, H = R.domElement.height, s = Math.min(W, H);
      g.drawImage(R.domElement, (W - s) / 2, (H - s) / 2, s, s, i * tile, r * tile, tile, tile);
    });
    g.fillStyle = '#ff0'; g.font = '15px sans-serif';
    g.fillText(`${S().state.steps[row.step].pose}${row.point ? '+pt' : ''} ${row.label || (typeof row.target === 'string' ? row.target : '')}`, 4, r * tile + 16);
  }
  let im = document.getElementById('sheet');
  if (!im) { im = document.createElement('img'); im.id = 'sheet'; im.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;max-width:100vw;max-height:100vh'; document.body.appendChild(im); }
  im.src = cv.toDataURL(); im.style.display = 'block';
  return `${cv.width}x${cv.height}`;
}

export function hide() { const im = document.getElementById('sheet'); if (im) im.style.display = 'none'; }

// Run a sheet in the background; poll window._done.
export function bg(rows, tile) { window._done = null; hide(); sheet(rows, tile).then((r) => (window._done = r), (e) => (window._done = 'ERR ' + e.stack)); return 'started'; }

export const AROUND = [[0, 0.15, 1], [1, 0.15, 0.4], [1, 0.1, -0.6], [0, 0.2, -1], [-1, 0.1, -0.6], [-1, 0.15, 0.4]];

// Render named poses (including in-between ones) directly, synchronously.
// rows: [{ pose, target, views, dist, offset, point }]
export async function poseSheet(rows, tile = 240) {
  const { stage } = S();
  const P = await import('/js/poses.js');
  const V = stage.camera.position.constructor;
  const cols = Math.max(...rows.map((r) => r.views.length));
  const cv = document.createElement('canvas'); cv.width = cols * tile; cv.height = rows.length * tile;
  const g = cv.getContext('2d');
  const cam = stage.camera.clone(), R = stage.renderer, sz = R.getSize(new V());
  const c = stage.child;
  rows.forEach((row, r) => {
    const s = P.resolve(c, row.pose);
    if (row.point) s.hands.R.point = 1;
    c.apply(s); c.model.updateMatrixWorld(true);
    let t = row.target === 'body' ? c.b.Hips.getWorldPosition(new V()) : c.b[row.target].getWorldPosition(new V());
    if (row.offset) t.add(new V(...row.offset));
    row.views.forEach((v, i) => {
      cam.position.copy(t).add(new V(...v).normalize().multiplyScalar(row.dist || 0.3));
      cam.near = 0.02; cam.far = 50; cam.fov = 40; cam.aspect = sz.x / sz.y; cam.lookAt(t); cam.updateProjectionMatrix();
      R.render(stage.scene, cam);
      const W = R.domElement.width, H = R.domElement.height, s2 = Math.min(W, H);
      g.drawImage(R.domElement, (W - s2) / 2, (H - s2) / 2, s2, s2, i * tile, r * tile, tile, tile);
    });
    g.fillStyle = '#ff0'; g.font = '15px sans-serif'; g.fillText(`${row.pose} ${row.target}`, 4, r * tile + 16);
  });
  let im = document.getElementById('sheet');
  if (!im) { im = document.createElement('img'); im.id = 'sheet'; im.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;max-width:100vw;max-height:100vh'; document.body.appendChild(im); }
  im.src = cv.toDataURL(); im.style.display = 'block';
  return `${cv.width}x${cv.height}`;
}

export function lightPants(on = true) {
  S().stage.child.model.traverse((o) => {
    if (o.name !== 'Pants') return;
    if (on) { o.userData.mat ??= o.material; o.material = o.material.clone(); o.material.map = null; o.material.color.setRGB(0.6, 0.6, 0.65); }
    else if (o.userData.mat) o.material = o.userData.mat;
  });
}

// Film real transitions: for each [from, to] step pair, jump to `from`, then play `to` and
// grab `frames` tiles across `ms` from a fixed camera. One row per transition.
export async function film(pairs, { frames = 8, ms = 3200, tile = 180, cam: camSpec = [[-1.6, 0.9, 1.0], [0, 0.42, 0.25]] } = {}) {
  const { stage, state, enterStep } = S();
  const V = stage.camera.position.constructor;
  const cv = document.createElement('canvas'); cv.width = frames * tile; cv.height = pairs.length * tile;
  const g = cv.getContext('2d');
  const cam = stage.camera.clone(), R = stage.renderer, sz = R.getSize(new V());
  cam.position.set(...camSpec[0]); cam.fov = 40; cam.aspect = sz.x / sz.y; cam.near = 0.05; cam.lookAt(new V(...camSpec[1])); cam.updateProjectionMatrix();
  const grab = (c, r) => { R.render(stage.scene, cam); const W = R.domElement.width, H = R.domElement.height, s = Math.min(W, H); g.drawImage(R.domElement, (W - s) / 2, (H - s) / 2, s, s, c * tile, r * tile, tile, tile); };
  for (let r = 0; r < pairs.length; r++) {
    const [a, b] = pairs[r];
    state.idx = a; enterStep(a); await wait(3500);
    state.idx = b; enterStep(b);
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) {
      const due = t0 + (ms * f) / (frames - 1);
      await new Promise((ok) => { const tick = () => (performance.now() >= due ? ok() : requestAnimationFrame(tick)); tick(); });
      await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
      grab(f, r);
    }
    g.fillStyle = '#ff0'; g.font = '13px sans-serif';
    g.fillText(`${state.steps[a].pose} → ${state.steps[b].pose}`, 4, r * tile + 14);
  }
  let im = document.getElementById('sheet');
  if (!im) { im = document.createElement('img'); im.id = 'sheet'; im.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;max-width:100vw;max-height:100vh'; document.body.appendChild(im); }
  im.src = cv.toDataURL(); im.style.display = 'block';
  return `${cv.width}x${cv.height}`;
}
export function filmBg(pairs, o) { window._done = null; hide(); film(pairs, o).then((r) => (window._done = r), (e) => (window._done = 'ERR ' + e.stack)); return 'started'; }

// Deterministic transition strip: route from pose a to b, `frames` evenly in time, rendered
// from each camera [pos, target] given (one row per camera).
export async function trans(a, b, cams, { frames = 10, tile = 150 } = {}) {
  const { stage } = S();
  const P = await import('/js/poses.js');
  const V = stage.camera.position.constructor;
  const c = stage.child, R = stage.renderer, sz = R.getSize(new V());
  const hops = P.route(a, b);
  const durs = hops.map((h, i) => P.hopTime(h, i === hops.length - 1, hops.length));
  const total = durs.reduce((x, y) => x + y, 0);
  const st = (n) => stage.states[n];
  const at = (t) => { let from = st(a); for (let i = 0; i < hops.length; i++) { if (t <= durs[i] || i === hops.length - 1) { const s = P.mix(from, st(hops[i]), P.easeInOut(Math.min(1, t / durs[i]))); P.keepGrounded(c, s); return s; } t -= durs[i]; from = st(hops[i]); } };
  const cv = document.createElement('canvas'); cv.width = frames * tile; cv.height = cams.length * tile;
  const g = cv.getContext('2d'); const cam = stage.camera.clone();
  for (let f = 0; f < frames; f++) {
    c.apply(at((total * f) / (frames - 1))); c.model.updateMatrixWorld(true);
    cams.forEach(([p, t], r) => {
      cam.position.set(...p); cam.fov = 40; cam.aspect = sz.x / sz.y; cam.near = 0.05; cam.lookAt(new V(...t)); cam.updateProjectionMatrix();
      R.render(stage.scene, cam);
      const W = R.domElement.width, H = R.domElement.height, s2 = Math.min(W, H);
      g.drawImage(R.domElement, (W - s2) / 2, (H - s2) / 2, s2, s2, f * tile, r * tile, tile, tile);
    });
  }
  g.fillStyle = '#ff0'; g.font = '13px sans-serif'; g.fillText(`${a} → ${b} (${total.toFixed(2)}s: ${hops.join(', ')})`, 4, 14);
  let im = document.getElementById('sheet');
  if (!im) { im = document.createElement('img'); im.id = 'sheet'; im.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;max-width:100vw;max-height:100vh'; document.body.appendChild(im); }
  im.src = cv.toDataURL(); im.style.display = 'block';
  return `${cv.width}x${cv.height}`;
}

// Close-ups of the eyes for named poses, seen from each app camera preset's direction.
export async function eyeSheet(poses, views = ['face', 'front'], tile = 260, dist = 0.2, one = false) {
  const { stage } = S();
  const P = await import('/js/poses.js');
  const V = stage.camera.position.constructor;
  const c = stage.child, R = stage.renderer, cam = stage.camera.clone();
  const cv = document.createElement('canvas'); cv.width = views.length * tile; cv.height = poses.length * tile;
  const g = cv.getContext('2d');
  poses.forEach((pose, r) => {
    c.apply(P.resolve(c, pose)); c.model.updateMatrixWorld(true);
    const e = one ? c.b.LeftEye.getWorldPosition(new V()) : c.b.LeftEye.getWorldPosition(new V()).add(c.b.RightEye.getWorldPosition(new V())).multiplyScalar(0.5);
    views.forEach((v, i) => {
      const p = Array.isArray(v) ? e.clone().add(new V(...v)) : stage.framing(v).p;
      cam.position.copy(e).add(p.clone().sub(e).normalize().multiplyScalar(dist));
      cam.near = 0.01; cam.fov = 40; cam.aspect = 1; cam.lookAt(e); cam.updateProjectionMatrix();
      R.render(stage.scene, cam);
      const W = R.domElement.width, H = R.domElement.height, m = Math.min(W, H);
      g.drawImage(R.domElement, (W - m) / 2, (H - m) / 2, m, m, i * tile, r * tile, tile, tile);
    });
    g.fillStyle = '#ff0'; g.font = '14px sans-serif'; g.fillText(pose, 4, r * tile + 15);
  });
  let im = document.getElementById('sheet');
  if (!im) { im = document.createElement('img'); im.id = 'sheet'; im.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;max-width:100vw;max-height:100vh'; document.body.appendChild(im); }
  im.src = cv.toDataURL(); im.style.display = 'block';
  return `${cv.width}x${cv.height}`;
}

// The left eye as the app camera sees it, for steps by pose (crop around the eye, 2x).
export async function appEyes(poses, crop = 150, tile = 300) {
  const { stage, state } = S();
  const V = stage.camera.position.constructor, R = stage.renderer;
  const out = document.createElement('canvas'); out.width = tile * poses.length; out.height = tile;
  const g = out.getContext('2d');
  for (let k = 0; k < poses.length; k++) {
    const st = state.steps.find((s) => s.pose === poses[k]);
    const P = await import('/js/poses.js');
    const c = stage.child; c.apply(P.resolve(c, poses[k])); c.model.updateMatrixWorld(true);
    const { p, t } = stage.framing(st.view);
    const cam = stage.camera.clone(); cam.position.copy(p); cam.lookAt(t); cam.updateProjectionMatrix();
    R.render(stage.scene, cam);
    const e = c.b.LeftEye.getWorldPosition(new V()).project(cam);
    const W = R.domElement.width, H = R.domElement.height;
    g.drawImage(R.domElement, (e.x + 1) / 2 * W - crop / 2, (1 - e.y) / 2 * H - crop / 2, crop, crop, k * tile, 0, tile, tile);
  }
  let im = document.getElementById('sheet');
  if (!im) { im = document.createElement('img'); im.id = 'sheet'; im.style.cssText = 'position:fixed;left:0;top:0;z-index:99999'; document.body.appendChild(im); }
  im.src = out.toDataURL(); im.style.display = 'block';
  return 'ok';
}
