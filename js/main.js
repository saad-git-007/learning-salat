import { Stage } from './scene.js?v=20261019b';
import { RECITE, buildSteps, QUIZ } from './content.js?v=20261019b';
import { Voice, wait } from './audio.js?v=20261019b';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('salat.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('salat.' + k, JSON.stringify(v)); } catch (e) {} },
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const manifest = await fetch('audio/clips.json').then((r) => r.json()).catch(() => ({}));
const voice = new Voice(manifest);
const stage = new Stage($('#scene'), { reducedMotion: reduced });
stage.setTheme(document.documentElement.dataset.theme);
stage.ready.then(() => $('#loading').classList.add('gone'));

const state = {
  rakat: store.get('rakat1', 1),
  steps: [], idx: 0,
  stars: store.get('stars', 0),
  done: new Set(),
  show: store.get('show', { ar: true, tr: true, en: true }),
  view: 'auto',
  running: 0,
  playState: 'idle',
  activeCard: null,
  mode: 'lesson',
};

// ---------- Segmented controls with a gliding pill ----------
function placePill(seg) {
  const pill = $('.seg-pill', seg), on = $('[aria-checked="true"]', seg);
  if (pill) pill.style.opacity = on ? '' : '0';
  if (!pill || !on || !seg.offsetParent) return;
  pill.style.width = on.offsetWidth + 'px';
  pill.style.translate = on.offsetLeft + 'px 0';
  if (pill.classList.contains('is-set')) pill.classList.add('glide');
  pill.classList.add('is-set');
}
function setRadio(group, attr, value) {
  for (const b of $$(`[${attr}]`, group)) b.setAttribute('aria-checked', String(b.getAttribute(attr) === String(value)));
  if (group.classList.contains('seg')) placePill(group);
}
addEventListener('resize', () => $$('.seg').forEach(placePill));

// ---------- Rendering ----------
const ICON = (id) => `<svg><use href="#i-${id}"/></svg>`;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Phrases that light up as they are recited; a one-phrase recitation is plain text (lighting
// up the whole of it would add nothing).
const phrases = (list, fmt) => list.length > 1 ? list.map((p, i) => `<span class="ph" data-i="${i}">${fmt(p)}</span>`).join(' ') : fmt(list.join(' '));

function reciteCard(item, { cue = false } = {}) {
  const R = RECITE[item.id];
  const times = item.times || 1;
  const el = document.createElement('article');
  el.className = 'recite' + (cue ? ' is-cue' : '');
  el.dataset.id = item.id;
  const label = cue ? 'Say while moving' : item.poses ? 'Right, then left' : times > 1 ? `Say ${times} times` : 'Say';
  el.innerHTML = `
    <div class="recite-head">
      <span class="recite-name">${esc(R.name)}</span>
      <span class="recite-tag">${label}${times > 1 ? `<span class="times">${'<i></i>'.repeat(times)}</span>` : ''}</span>
      ${voice.has(item.id) ? `<span class="recite-btns">
        <button class="recite-btn recite-toggle" aria-label="Play ${esc(R.name)}" aria-pressed="false"><svg class="i-on-play"><use href="#i-play"/></svg><svg class="i-on-pause"><use href="#i-pause"/></svg></button>
        <button class="recite-btn recite-replay" aria-label="Replay ${esc(R.name)} from the start">${ICON('replay')}</button>
      </span>` : ''}
    </div>
    <p class="ar" lang="ar" dir="rtl">${phrases(R.ar, (p) => p)}</p>
    <p class="tr">${phrases(R.tr, esc)}</p>
    <p class="en">${phrases(R.enP || [R.en], esc)}</p>
    ${R.after ? `<div class="after-line"><p class="ar" lang="ar" dir="rtl">${R.after.ar}</p><p class="tr">${R.after.tr}</p><p class="en">${esc(R.after.en)}</p></div>` : ''}`;
  const toggle = $('.recite-toggle', el), replay = $('.recite-replay', el);
  const playThis = () => { stopAll(); playItems([{ ...item, cue }], { only: true }); };
  toggle?.addEventListener('click', () => {
    voice.unlock();
    if (state.activeCard === el && state.playState === 'busy') { if (voice.paused) resumeAll(); else pauseAll(); return; }
    playThis();
  });
  replay?.addEventListener('click', () => { voice.unlock(); playThis(); });
  el.dataset.name = R.name;
  return el;
}

function applyShow() {
  const list = $('#recite');
  for (const k of ['ar', 'tr', 'en']) {
    if (state.show[k]) delete list.dataset['hide' + k[0].toUpperCase() + k.slice(1)];
    else list.dataset['hide' + k[0].toUpperCase() + k.slice(1)] = '';
    $(`.toggle[data-show="${k}"]`).setAttribute('aria-pressed', String(state.show[k]));
  }
}

function renderStep() {
  const s = state.steps[state.idx];
  const total = state.steps.length;
  const groupSteps = state.steps.filter((x) => x.group === s.group);
  const inGroup = groupSteps.indexOf(s) + 1;
  const rk = s.group.startsWith('Rak') ? `${s.group} of ${state.rakat}` : s.group;
  $('#eyebrow').textContent = `${rk} · Step ${inGroup} of ${groupSteps.length}`;
  $('#title').textContent = s.title;
  $('#sub').textContent = s.sub;
  $('#do').textContent = s.do;
  $('#do-icon').innerHTML = `<use href="#i-${s.icon || 'stand'}"/>`;
  $('#chip-group').textContent = s.group;
  $('#chip-title').textContent = s.title;
  $('#step-count').textContent = `${state.idx + 1} / ${total}`;
  $('#progress-fill').style.scale = `${(state.idx + 1) / total} 1`;
  $('#prev').disabled = state.idx === 0;
  $('#next span').textContent = state.idx === total - 1 ? 'Finish' : 'Next';

  const list = $('#recite');
  list.replaceChildren();
  if (s.cue) list.append(reciteCard({ id: s.cue }, { cue: true }));
  for (const item of s.recite || []) list.append(reciteCard(item));
  if (!s.cue && !(s.recite || []).length) {
    const n = document.createElement('div'); n.className = 'no-words';
    n.innerHTML = `<b>${state.idx === 0 ? 'Bismillah' : 'Nothing to say here'}</b>${state.idx === 0 ? 'Get ready for Salat. Tap Next when you are ready.' : 'Just do it, then tap Next.'}`;
    list.append(n);
  }
  applyShow();
  renderSkip(s);
  syncUI();
  $('#play').disabled = !s.cue && !(s.recite || []).length;
  $('#lesson .panel-scroll').scrollTop = 0;
  if (matchMedia('(max-width: 900px), (orientation: portrait) and (max-width: 1100px)').matches && state.started && scrollY > 0) {
    scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }
  // Warm the cache for this step and the next.
  const next = state.steps[state.idx + 1];
  voice.preload([s.cue, ...(s.recite || []).map((r) => r.id), next?.cue, ...((next?.recite) || []).map((r) => r.id)].filter(Boolean));
  renderSheet();
}

// "Skip to Qa‘dah": from rak‘ah 2 onwards, jump to the next Tashahhud.
function nextQadah() {
  const s = state.steps[state.idx];
  const r = +(s.group.match(/^Rak‘ah (\d)/) || [])[1];
  if (!r || r < 2) return -1;
  return state.steps.findIndex((x, j) => j > state.idx && (x.recite || []).some((it) => it.id === 'tashahhud'));
}
function renderSkip() {
  const j = nextQadah(), btn = $('#skip');
  btn.hidden = j < 0;
  if (j < 0) return;
  const t = state.steps[j];
  $('#skip-where').textContent = 'Tashahhud';
  btn.setAttribute('aria-label', `Skip to Qa‘dah, the Tashahhud of ${t.group}`);
}
$('#skip').addEventListener('click', () => { voice.unlock(); const j = nextQadah(); if (j >= 0) enterStep(j); });

// One place that paints the play state: the gold button and each card's buttons.
const PLAY_LABEL = { idle: 'Listen', busy: 'Pause', paused: 'Resume', done: 'Listen again' };
function syncUI() {
  const paused = voice.paused && state.playState === 'busy';
  const st = paused ? 'paused' : state.playState;
  const play = $('#play');
  play.dataset.state = st;
  play.setAttribute('aria-label', PLAY_LABEL[st]);
  for (const card of $$('.recite')) {
    const active = card === state.activeCard && state.playState === 'busy';
    const cs = active ? (paused ? 'paused' : 'playing') : '';
    if (cs) card.dataset.state = cs; else delete card.dataset.state;
    const t = $('.recite-toggle', card);
    if (!t) continue;
    t.setAttribute('aria-pressed', String(cs === 'playing'));
    t.setAttribute('aria-label', `${cs === 'playing' ? 'Pause' : cs === 'paused' ? 'Resume' : 'Play'} ${card.dataset.name}`);
  }
}
function setPlayState(st) {
  state.playState = st;
  if (st !== 'busy') state.activeCard = null;
  syncUI();
}
function pauseAll() { voice.pause(); syncUI(); }
function resumeAll() { voice.resume(); syncUI(); }
voice.onchange = syncUI;

function cameraFor(s) {
  if (state.view !== 'auto') return state.view;
  return s.view === 'side' && s.pose === 'sajdah' ? 'side' : s.view;
}

// ---------- Playback ----------
function highlight(card, i) {
  for (const ph of $$('.ph', card)) ph.classList.toggle('on', +ph.dataset.i === i);
}

async function playItems(items, { only = false } = {}) {
  const token = ++state.running;
  setPlayState('busy');
  const s = state.steps[state.idx];
  for (const item of items) {
    const card = $(`.recite[data-id="${item.id}"]${item.cue ? '.is-cue' : ':not(.is-cue)'}`) || $(`.recite[data-id="${item.id}"]`);
    const times = item.times || 1;
    for (let n = 0; n < times; n++) {
      if (token !== state.running) return false;
      // A recitation said in turn in different postures (the two Salams): turn first.
      if (item.poses && stage.poseName !== item.poses[n]) {
        await stage.goTo(item.poses[n]);
        if (token !== state.running) return false;
      }
      card?.classList.add('is-playing');
      state.activeCard = card; syncUI();
      if (card && n === 0) $$('.times i', card).forEach((d) => d.classList.remove('on'));
      if (card && n === 0) card.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      const pointAt = RECITE[item.id].pointPhrase;
      let pointing = false;
      const ok = await voice.play(item.id, {
        onPhrase: (i) => {
          if (card) highlight(card, i);
          if (pointAt !== undefined && s.point && (i === pointAt) !== pointing) {
            pointing = i === pointAt;
            stage.setPoint(pointing);
            stage.focusFinger(pointing);
          }
        },
      });
      card?.classList.remove('is-playing');
      if (card && times > 1) $$('.times i', card)[n]?.classList.add('on');
      if (pointing) { stage.setPoint(false); stage.focusFinger(false); }
      if (!ok || token !== state.running) { stage.setPoint(false); return false; }
      if (n < times - 1) await voice.hold(item.poses ? 200 : 350);
    }
    await voice.hold(250);
  }
  if (token !== state.running) return false;
  setPlayState(only ? 'idle' : 'done');
  return true;
}

function stopAll() {
  state.running++;
  voice.stop();
  stage.setPoint(false);
  setPlayState('idle');
  $$('.recite.is-playing').forEach((c) => c.classList.remove('is-playing'));
  $$('.ph.on').forEach((p) => p.classList.remove('on'));
}

// Enter a step: move into the posture (saying the takbir while moving), then recite.
async function enterStep(i, { play = true } = {}) {
  stopAll();
  const prev = state.steps[state.idx];
  state.idx = Math.max(0, Math.min(state.steps.length - 1, i));
  const s = state.steps[state.idx];
  renderStep();
  const token = state.running;
  const forward = prev && state.steps.indexOf(prev) < state.idx;
  stage.poseTarget = s.pose;
  stage.setView(cameraFor(s));
  const moving = stage.goTo(s.pose);
  const canPlay = play && voice.unlocked;
  // A step with `then` (the Takbir-i-Tahrimah) moves on to that posture once it is said.
  const settle = async (t = token) => { if (s.then && t === state.running) { await voice.hold(200); if (t === state.running) await stage.goTo(s.then); } };
  if (s.cue && canPlay && forward) {
    setPlayState('busy');
    const card = $('.recite.is-cue');
    card?.classList.add('is-playing');
    state.activeCard = card; syncUI();
    // Start the takbir a moment after the move begins, as the book describes.
    await Promise.all([moving, voice.hold(120).then(() => token === state.running && voice.play(s.cue, { onPhrase: (k) => card && highlight(card, k) }))]);
    card?.classList.remove('is-playing');
  } else {
    await moving;
  }
  if (token !== state.running) return;
  stage.setView(cameraFor(s));
  if (!canPlay || !(s.recite || []).length) {
    setPlayState('idle');
    if (s.then) { await voice.hold(500); await settle(); if (token !== state.running) return; }
    if (state.auto && canPlay) { await voice.hold(s.recite?.length ? 600 : 1800); if (token === state.running) advance(); }
    return;
  }
  await voice.hold(250);
  if (token !== state.running) return;
  const ok = await playItems(s.recite);
  if (ok) {
    // playItems took its own run token; fold and advance only if nothing has run since.
    const mine = state.running;
    await settle(mine);
    award(s);
    if (state.auto) { await voice.hold(900); if (mine === state.running && state.auto) advance(); }
  }
}

function award(s) {
  if (state.done.has(s.id)) return;
  state.done.add(s.id);
  addStars(1);
}
function addStars(n) {
  state.stars += n;
  store.set('stars', state.stars);
  $('#star-count').textContent = state.stars;
  const el = $('.stars');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  voice.chime();
}

function advance() {
  const s = state.steps[state.idx];
  if (!(s.recite || []).length) award(s);
  if (state.idx >= state.steps.length - 1) { finish(); return; }
  enterStep(state.idx + 1);
}

function finish() {
  stopAll();
  state.auto = false; $('#auto').checked = false;
  $('#done-text').textContent = state.rakat === 1 ? 'You practised 1 rak‘ah.' : `You offered all ${state.rakat} rak‘at.`;
  $('#done-stars').textContent = state.stars;
  $('#done').hidden = false;
  voice.chime(true);
}

// ---------- Steps sheet ----------
function renderSheet() {
  const body = $('#steps-body');
  const groups = [...new Set(state.steps.map((s) => s.group))];
  body.innerHTML = groups.map((g) => `<section class="sheet-group"><h3>${g}</h3><div class="chips">${state.steps.map((s, i) => s.group !== g ? '' :
    `<button class="chip${state.done.has(s.id) ? ' done' : ''}" data-i="${i}"${i === state.idx ? ' aria-current="step"' : ''}><b><span>${i + 1}</span></b>${esc(s.title)}</button>`).join('')}</div></section>`).join('');
}
$('#steps-body').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  $('#steps-sheet').close();
  enterStep(+b.dataset.i);
});
$('#steps-open').addEventListener('click', () => { renderSheet(); $('#steps-sheet').showModal(); });
$('#steps-close').addEventListener('click', () => $('#steps-sheet').close());
$('#steps-sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

// ---------- Controls ----------
$('#next').addEventListener('click', () => { voice.unlock(); advance(); });
$('#prev').addEventListener('click', () => { voice.unlock(); enterStep(state.idx - 1); });
$('#play').addEventListener('click', () => {
  voice.unlock();
  const s = state.steps[state.idx];
  if (state.playState === 'busy') { if (voice.paused) resumeAll(); else pauseAll(); return; }
  stopAll();
  const items = [...(s.cue ? [{ id: s.cue, cue: true }] : []), ...(s.recite || [])];
  const raising = stage.poseName !== s.pose ? stage.goTo(s.pose) : null;
  const token = state.running + 1;
  (s.then && raising ? raising.then(() => token === state.running + 1 ? playItems(items) : false) : playItems(items)).then(async (ok) => {
    if (!ok) return;
    if (s.then && token === state.running) { await voice.hold(200); if (token === state.running) await stage.goTo(s.then); }
    award(s);
    if (state.auto) { await voice.hold(900); if (state.auto && token === state.running) advance(); }
  });
});
$('#auto').addEventListener('change', (e) => {
  voice.unlock();
  state.auto = e.target.checked;
  if (state.auto && state.playState !== 'busy') enterStep(state.idx);
});
for (const t of $$('.toggle')) {
  t.addEventListener('click', () => {
    const k = t.dataset.show;
    state.show[k] = !state.show[k];
    if (!state.show.ar && !state.show.tr && !state.show.en) state.show[k] = true;
    store.set('show', state.show);
    applyShow();
  });
}
const viewSeg = $('.view-seg');
viewSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  // Tapping the chosen view again lets the camera follow each step again.
  state.view = state.view === b.dataset.view ? 'auto' : b.dataset.view;
  setRadio(viewSeg, 'data-view', state.view);
  stage.setView(state.mode === 'quiz' ? (state.view === 'auto' ? quiz.q?.view || 'front' : state.view) : cameraFor(state.steps[state.idx]));
});

function setRakat(n, { keep = true } = {}) {
  const cur = state.steps[state.idx];
  state.rakat = n;
  store.set('rakat1', n);
  state.steps = buildSteps(n);
  state.done = new Set();
  for (const g of $$('[data-rakat]')) g.setAttribute('aria-checked', String(+g.dataset.rakat === n));
  placePill($('.rakat-seg'));
  if (keep && cur) {
    const same = state.steps.findIndex((s) => s.group === cur.group && s.title === cur.title);
    state.idx = same >= 0 ? same : Math.min(state.idx, state.steps.length - 1);
  } else state.idx = 0;
  renderStep();
}
$('.rakat-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-rakat]'); if (b) { stopAll(); setRakat(+b.dataset.rakat); enterStep(state.idx, { play: false }); } });
$('.prayer-pick').addEventListener('click', (e) => { const b = e.target.closest('[data-rakat]'); if (b) setRakat(+b.dataset.rakat, { keep: false }); });

$('#theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  store.set('theme', next);
  stage.setTheme(next);
  $('meta[name="theme-color"]').content = next === 'light' ? '#f6f2e9' : '#07060f';
});

addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea') || $('#steps-sheet').open || $('#credits').open || $('#stars-sheet').open || $('#settings').open || state.mode !== 'lesson' || !$('#welcome').hidden) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); $('#next').click(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); $('#prev').click(); }
  if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); $('#play').click(); }
});

// ---------- Welcome / done ----------
function closeOverlay(el) {
  if (reduced) { el.hidden = true; return; }
  el.classList.add('leaving');
  setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); }, 260);
}
$('#start').addEventListener('click', () => {
  voice.unlock();
  state.started = true;
  closeOverlay($('#welcome'));
  enterStep(0);
});
$('#start-quiz').addEventListener('click', () => { voice.unlock(); state.started = true; closeOverlay($('#welcome')); openQuiz(); });
$('#again').addEventListener('click', () => { closeOverlay($('#done')); state.done = new Set(); stage.jump('stand'); enterStep(0); });
$('#done-quiz').addEventListener('click', () => { closeOverlay($('#done')); openQuiz(); });
$('#quiz-open').addEventListener('click', () => { voice.unlock(); if (state.mode === 'quiz') closeQuiz(); else openQuiz(); });

// ---------- Quiz ----------
const quiz = { qs: [], i: 0, score: 0, q: null, tries: 0 };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function openQuiz() {
  stopAll();
  state.auto = false; $('#auto').checked = false;
  state.mode = 'quiz';
  $('#lesson').hidden = true; $('#quiz').hidden = false;
  quiz.qs = shuffle([...QUIZ]).slice(0, 6); quiz.i = 0; quiz.score = 0;
  showQuestion();
}
function closeQuiz() {
  stopAll();
  state.mode = 'lesson';
  $('#quiz').hidden = true; $('#lesson').hidden = false;
  const s = state.steps[state.idx];
  stage.goTo(s.pose); stage.setView(cameraFor(s));
  renderStep();
  $$('.seg').forEach(placePill);
}
$('#quiz-close').addEventListener('click', closeQuiz);

function showQuestion() {
  const q = quiz.q = quiz.qs[quiz.i];
  quiz.tries = 0;
  $('#quiz-eyebrow').textContent = `Quiz · ${quiz.i + 1} of ${quiz.qs.length}`;
  $('#quiz-ask').textContent = q.ask;
  $('#quiz-dots').innerHTML = quiz.qs.map((_, k) => `<i class="${k < quiz.i ? 'on' : k === quiz.i ? 'cur' : ''}"></i>`).join('');
  $('#quiz-feedback').textContent = '';
  $('#quiz-next').disabled = true;
  $('#quiz-next .btn-state').innerHTML = `${quiz.i === quiz.qs.length - 1 ? 'Finish' : 'Next question'}${ICON('next')}`;
  const others = shuffle(QUIZ.filter((x) => x.answer !== q.answer).map((x) => x.answer)).slice(0, 2);
  const opts = shuffle([q.answer, ...others]);
  $('#quiz-options').innerHTML = opts.map((id) => {
    const R = RECITE[id];
    const tr = R.tr.length > 2 ? R.tr.slice(0, 2).join(' ') + ' …' : R.tr.join(' ');
    const en = R.en.length > 90 ? R.en.slice(0, R.en.indexOf(' ', 80)) + ' …' : R.en;
    return `<div class="opt" role="button" tabindex="0" data-id="${id}"><div><p class="tr">${esc(tr)}</p><p class="en">${esc(en)}</p></div>
      <button class="recite-play" data-listen="${id}" aria-label="Listen">${ICON('speaker')}</button></div>`;
  }).join('');
  $('#chip-group').textContent = 'Quiz';
  $('#chip-title').textContent = `${quiz.i + 1} of ${quiz.qs.length}`;
  stage.goTo(q.pose);
  stage.setView(state.view === 'auto' ? q.view : state.view);
}

$('#quiz-options').addEventListener('click', (e) => {
  const listen = e.target.closest('[data-listen]');
  if (listen) { e.stopPropagation(); voice.play(listen.dataset.listen); return; }
  const opt = e.target.closest('.opt');
  if (opt) choose(opt);
});
$('#quiz-options').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('opt')) { e.preventDefault(); choose(e.target); } });

function choose(opt) {
  if (!$('#quiz-next').disabled) return;
  const right = opt.dataset.id === quiz.q.answer;
  if (right) {
    opt.classList.add('right');
    $('#quiz-feedback').textContent = quiz.tries === 0 ? 'MashaAllah! That’s right.' : 'Yes! Well done.';
    if (quiz.tries === 0) { quiz.score++; addStars(1); } else voice.chime();
    $('#quiz-next').disabled = false;
    if (quiz.q.pose === 'tashahhud') stage.setPoint(true);
    voice.play(quiz.q.answer).then(() => stage.setPoint(false));
  } else {
    quiz.tries++;
    opt.classList.remove('wrong'); void opt.offsetWidth; opt.classList.add('wrong');
    $('#quiz-feedback').textContent = 'Not quite. Try again!';
  }
}
$('#quiz-next').addEventListener('click', () => {
  stopAll();
  quiz.i++;
  if (quiz.i >= quiz.qs.length) {
    $('#done-text').textContent = `You got ${quiz.score} of ${quiz.qs.length} right first time.`;
    $('#done-stars').textContent = state.stars;
    $('#done').hidden = false;
    voice.chime(true);
    closeQuiz();
    return;
  }
  showQuestion();
});

// ---------- Start ----------
window.salat = { stage, state, enterStep, voice };
$('#star-count').textContent = state.stars;
setRadio($('.view-seg'), 'data-view', 'auto');
setRakat(state.rakat, { keep: false });
document.fonts?.ready.then(() => $$('.seg').forEach(placePill));

// ---------- Credits ----------
const credits = $('#credits');
const settings = $('#settings');
$('#settings-open').addEventListener('click', () => settings.showModal());
$('#settings-close').addEventListener('click', () => settings.close());
settings.addEventListener('click', (e) => { if (e.target === settings) settings.close(); });
document.querySelectorAll('[data-credits]').forEach((b) => b.addEventListener('click', () => { settings.close(); credits.showModal(); }));
$('#credits-close').addEventListener('click', () => credits.close());
credits.addEventListener('click', (e) => { if (e.target === credits) credits.close(); });

// 3D view size: 120% → 100% → 80% → 60% and round again; a choice is remembered on this device.
const VIEW_SIZES = [120, 100, 80, 60];
function setViewSize(n) {
  const app = $('.app');
  if (n === 100) delete app.dataset.viewSize; else app.dataset.viewSize = String(n);
  const next = VIEW_SIZES[(VIEW_SIZES.indexOf(n) + 1) % VIEW_SIZES.length];
  $('#view-size-label').textContent = `${n}%`;
  $('#view-size use').setAttribute('href', next > n ? '#i-grow' : '#i-shrink');
  $('#view-size').setAttribute('aria-label', `3D view at ${n}%. Change it to ${next}%`);
}
// Phones start at 80% so more of the words show under the child.
let viewSize = matchMedia('(max-width: 640px)').matches ? 80 : 100;
try { viewSize = +localStorage.getItem('salat.viewSize2') || viewSize; } catch {}
setViewSize(VIEW_SIZES.includes(viewSize) ? viewSize : 100);
$('#view-size').addEventListener('click', () => {
  const cur = +($('.app').dataset.viewSize || 100);
  const n = VIEW_SIZES[(VIEW_SIZES.indexOf(cur) + 1) % VIEW_SIZES.length];
  setViewSize(n);
  try { localStorage.setItem('salat.viewSize2', String(n)); } catch {}   // only a choice is remembered
});

// Stars: tap the counter to see them, and start again from 0 if you like.
const starsSheet = $('#stars-sheet');
$('#stars-open').addEventListener('click', () => { $('#stars-total').textContent = state.stars; starsSheet.showModal(); });
$('#stars-close').addEventListener('click', () => starsSheet.close());
$('#stars-keep').addEventListener('click', () => starsSheet.close());
starsSheet.addEventListener('click', (e) => { if (e.target === starsSheet) starsSheet.close(); });
$('#stars-reset').addEventListener('click', () => {
  state.stars = 0; state.done.clear();
  store.set('stars', 0);
  $('#star-count').textContent = '0'; $('#stars-total').textContent = '0';
  starsSheet.close();
});

// Recitation speed, remembered on this device (1.25x unless chosen).
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75];
function setSpeed(r) {
  voice.setRate(r);
  $('#spd').textContent = `${r}×`;
  $('#spd-down').disabled = r === SPEEDS[0];
  $('#spd-up').disabled = r === SPEEDS[SPEEDS.length - 1];
}
const savedSpeed = store.get('speed', 1.25);
setSpeed(SPEEDS.includes(savedSpeed) ? savedSpeed : 1.25);
for (const [id, d] of [['#spd-down', -1], ['#spd-up', 1]]) {
  $(id).addEventListener('click', () => {
    const r = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, SPEEDS.indexOf(voice.rate) + d))];
    setSpeed(r); store.set('speed', r);
  });
}

// Text size under the 3D view, remembered on this device.
const TEXT_SIZES = [70, 80, 90, 100, 110];
function setTextSize(n) {
  document.documentElement.style.setProperty('--text-zoom', String(n / 100));
  $('#txt-size').textContent = `${n}%`;
  $('#txt-down').disabled = n === TEXT_SIZES[0];
  $('#txt-up').disabled = n === TEXT_SIZES[TEXT_SIZES.length - 1];
}
const textDefault = matchMedia('(max-width: 640px)').matches ? 80 : 100;
let textSize = store.get('textSize2', textDefault);
setTextSize(TEXT_SIZES.includes(textSize) ? textSize : textDefault);
for (const [id, d] of [['#txt-down', -1], ['#txt-up', 1]]) {
  $(id).addEventListener('click', () => {
    const i = TEXT_SIZES.indexOf(parseInt($('#txt-size').textContent, 10));
    const n = TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, i + d))];
    setTextSize(n); store.set('textSize2', n);   // only a choice is remembered
  });
}
