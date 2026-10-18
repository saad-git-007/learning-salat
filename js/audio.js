// Recitation playback through one <audio> element (it plays even with the iPhone
// ringer switch off, unlike Web Audio), with phrase timing for highlighting.

function silentWav() {
  const n = 800, b = new ArrayBuffer(44 + n), v = new DataView(b);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}

export class Voice {
  constructor(manifest) {
    this.m = manifest;
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.setAttribute('playsinline', '');
    this.token = 0;
    this.playing = false;
    this.paused = false;
    this.waiters = [];
    this.epoch = 0;
    this.cache = new Map();
    this.rate = 1;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  }

  // Must run inside a tap so mobile browsers allow later playback.
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.el.src = silentWav();
    this.el.play().catch(() => {});
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  preload(ids) {
    for (const id of ids) {
      if (!this.m[id] || this.cache.has(id)) continue;
      const a = new Audio(); a.preload = 'auto'; a.src = this.url(id); this.cache.set(id, a);
    }
  }

  url(id) { return `audio/${this.m[id].file}`; }

  // Recitation speed (0.75-1.75x), pitch kept; applies at once to a clip that is playing.
  setRate(r) {
    this.rate = r;
    this.applyRate(this.el);
  }
  applyRate(el) {
    el.preservesPitch = el.mozPreservesPitch = el.webkitPreservesPitch = true;
    el.defaultPlaybackRate = this.rate;
    el.playbackRate = this.rate;
  }
  has(id) { return !!this.m[id]; }

  // Ends the current clip (its promise resolves false) but keeps a pause in force.
  halt() {
    this.token++;
    const c = this.cancel; this.cancel = null;
    if (c) c(); else { this.playing = false; cancelAnimationFrame(this.raf); }
    try { this.el.pause(); } catch (e) {}
  }

  // Stops everything and clears any pause; waiting plays resolve false.
  stop() {
    this.halt();
    this.epoch = (this.epoch || 0) + 1;
    const was = this.paused;
    this.paused = false;
    this.release();
    if (was) this.onchange && this.onchange();
  }

  // Pause keeps the position; queued plays and holds wait until resume().
  pause() {
    if (this.paused) return;
    this.paused = true;
    try { this.el.pause(); } catch (e) {}
    this.onchange && this.onchange();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.playing) { this.applyRate(this.el); this.el.play().catch(() => {}); }
    this.release();
    this.onchange && this.onchange();
  }

  release() { const w = this.waiters || []; this.waiters = []; w.forEach((f) => f()); }

  // Resolves now, or when playback is resumed (or stopped).
  gate() { return this.paused ? new Promise((r) => (this.waiters = this.waiters || []).push(r)) : Promise.resolve(); }

  // A pause-aware wait: time spent paused does not count; ends early on stop().
  async hold(ms) {
    const epoch = this.epoch;
    let left = ms;
    while (left > 0 && epoch === this.epoch) {
      await this.gate();
      if (epoch !== this.epoch) return;
      const t = performance.now();
      await wait(Math.min(left, 60));
      if (!this.paused) left -= performance.now() - t;
    }
  }

  // Plays a clip; resolves true when it ends, false if stopped. Survives pause/resume.
  play(id, { onPhrase } = {}) {
    this.halt();
    const clip = this.m[id];
    if (!clip) return Promise.resolve(true);
    const token = ++this.token;
    return this.gate().then(() => token !== this.token ? false : new Promise((resolve) => {
      const el = this.el;
      let last = -1, done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        el.onended = el.onerror = null;
        cancelAnimationFrame(this.raf);
        if (token === this.token) { this.playing = false; this.cancel = null; }
        onPhrase && onPhrase(-1);
        resolve(ok);
      };
      this.cancel = () => finish(false);
      this.playing = true;
      el.onended = () => finish(token === this.token);
      el.onerror = () => finish(token === this.token);
      el.src = this.url(id);
      el.currentTime = 0;
      this.applyRate(el);   // a new source resets the rate in some browsers
      el.play().catch((err) => {
        // A pause() right after starting interrupts play(); resume() restarts it.
        if (err && err.name === 'AbortError' && this.paused && token === this.token) return;
        if (token === this.token && !this.paused) finish(true);
      });
      const marks = clip.marks || [0];
      const tick = () => {
        if (token !== this.token) { finish(false); return; }
        const t = el.currentTime;
        let i = 0;
        while (i + 1 < marks.length && t >= marks[i + 1] - 0.05) i++;
        if (i !== last) { last = i; onPhrase && onPhrase(i); }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }));
  }

  // A soft two-note chime for stars (Web Audio; quiet by design).
  chime(high = false) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    [high ? 880 : 660, high ? 1318.5 : 990].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.11);
      g.gain.linearRampToValueAtTime(0.08, t + i * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.11 + 0.7);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.75);
    });
  }
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
