// ═══════════════════════════════════════════════════════════════════════════
// One speaker, many remotes — the music commands must cross, and only cross.
//
// Two devices run the REAL remote-music module sliced out of index.html (not
// a re-implementation), with a fake last-write-wins cloud between them:
//   A = reception (claims the speaker role), B = the owner's laptop.
// It proves:
//    1. claiming writes player.deviceId + heartbeat, and only A may play
//    2. an owner tap sends ONE cmd with a legal id, and A acts on it once
//    3. the same cmd replayed does nothing (lastCmdId)
//    4. a cmd older than 60s does nothing (a reconnecting device's past)
//    5. volume arrives clamped; a null arg is ABSENT, never zero
//    6. the library is published once, sanitised, and only re-published on change
//    7. the heartbeat write refreshes player.heartbeat and nothing else
//    8. a stale heartbeat greys the owner's controls and says çevrimdışı
//    9. a command nobody answers shows "Cevap yok" after ten seconds
//   10. the track list filters Turkish-blind: melısa finds MELİSA
//   11. every key ever pushed is legal for Firebase — the 24 Aug rule
//
// Run:  node tests/music-remote.test.js
// Exits 1 if any assertion fails, so it can gate a commit.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// The module lives in the <script> right after this banner.
const BANNER = 'REMOTE MUSIC CONTROL — rdns_audio_v1 (player / cmd / state / library)';
const b = html.indexOf(BANNER);
if (b < 0) { console.error('✗ banner not found — the module moved'); process.exit(1); }
const s0 = html.indexOf('<script>', b);
const s1 = html.indexOf('</script>', s0);
if (s0 < 0 || s1 < 0) { console.error('✗ script bounds not found'); process.exit(1); }
const slice = html.slice(s0 + '<script>'.length, s1);

// ── the cloud between them ──────────────────────────────────────────────────
function makeCloud() {
  const data = {}, subs = {}, writes = [];
  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  function resolve(v) {
    if (v && typeof v === 'object') {
      if (v['.sv'] === 'timestamp') return Date.now();
      const o = Array.isArray(v) ? [] : {};
      for (const k in v) o[k] = resolve(v[k]);
      return o;
    }
    return v;
  }
  function checkKeys(v, at) {
    if (v && typeof v === 'object')
      for (const k of Object.keys(v)) {
        if (/[.#$\[\]\/]/.test(k)) throw new Error('illegal key "' + k + '" under ' + at);
        checkKeys(v[k], at + '/' + k);
      }
  }
  function notify(p) {
    (subs[p] || []).forEach(cb => setTimeout(() => cb({ val: () => clone(data[p]) }), 0));
  }
  return {
    data, writes,
    ref(p) {
      return {
        on(ev, cb) { (subs[p] = subs[p] || []).push(cb); setTimeout(() => cb({ val: () => clone(data[p]) }), 0); },
        set(v) {
          const r = resolve(clone(v)); checkKeys(r, p);
          data[p] = r; writes.push({ path: p, op: 'set', value: clone(r) }); notify(p);
          return Promise.resolve();
        },
        update(v) {
          const r = resolve(clone(v)); checkKeys(r, p);
          data[p] = Object.assign({}, data[p] || {}, r);
          writes.push({ path: p, op: 'update', value: clone(r) }); notify(p);
          return Promise.resolve();
        },
      };
    },
    // wind the cloud by hand, listeners told — for staging stale states
    setRaw(p, v) { data[p] = clone(v); notify(p); },
    writesTo(p) { return writes.filter(w => w.path === p); },
  };
}

// ── a fake player engine: records every call the module makes ───────────────
function makeMusic(names) {
  const calls = [];
  let playing = false, wanted = false, vol = 50, shuf = true, idx = 0;
  return {
    calls, _names: names.slice(),
    play() { calls.push(['play']); wanted = true; playing = true; },
    pause() { calls.push(['pause']); wanted = false; playing = false; },
    next() { calls.push(['next']); },
    prev() { calls.push(['prev']); },
    playTrack(i) { calls.push(['playTrack', i]); wanted = true; playing = true; idx = i; },
    setVolume(v) { calls.push(['setVolume', v]); vol = v; },
    setShuffle(on) { calls.push(['setShuffle', on]); shuf = !!on; },
    playing: () => playing, wanted: () => wanted,
    ducked: () => 0, scanning: () => false,
    hasList() { return this._names.length > 0; },
    title() { return this._names[idx] || ''; },
    index: () => idx,
    count() { return this._names.length; },
    volume: () => vol, shuffled: () => shuf,
    names() { return this._names.slice(); },
    note() {},
  };
}

// ── one simulated device ────────────────────────────────────────────────────
function makeDevice(devId, role, cloud, music, clock) {
  clock = clock || { skew: 0 };
  // the device's own clock, windable — how ten silent seconds pass in a test
  const DeviceDate = Object.assign(function (...a) { return new Date(...a); }, Date, { now: () => Date.now() + clock.skew });
  const store = { rdns_device_id_v1: devId };
  if (role) store.rdns_msg_role = role;
  const intervals = [], longTimeouts = [];
  const elements = {};
  function makeEl(id) {
    const el = {
      id, style: {}, value: '', disabled: false,
      children: [], listeners: {},
      addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
      classList: { _s: {}, toggle(c, on) { this._s[c] = !!on; }, add(c) { this._s[c] = true; }, remove(c) { delete this._s[c]; } },
      querySelector() { return null; },
      appendChild(c) { this.children.push(c); },
      removeChild() {},
    };
    // like the real DOM: assigning textContent empties the element
    let tc = '';
    Object.defineProperty(el, 'textContent', {
      get: () => tc,
      set: v => { tc = String(v); el.children.length = 0; },
    });
    return el;
  }
  const firebase = {
    apps: [1],
    auth() { return { onAuthStateChanged(cb) { setTimeout(() => cb({ isAnonymous: false }), 0); } }; },
    database() { return { ref: p => cloud.ref(p) }; },
  };
  firebase.database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };
  const win = { cbmMusic: music, firebase, cbmUnlockAudio() { win.unlocks = (win.unlocks || 0) + 1; } };
  const ctx = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    document: {
      readyState: 'complete', activeElement: null,
      getElementById(id) { return elements[id] || (elements[id] = makeEl(id)); },
      createElement: t => makeEl('<' + t + '>'),
      createDocumentFragment() { return { children: [], appendChild(c) { this.children.push(c); } }; },
      addEventListener() {},
    },
    window: win, confirm: () => true,
    console: { log() {}, warn() {}, error() {} },
    setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; },
    // the 10-second "Cevap yok" clock is held for the test to fire by hand;
    // everything short (listener delivery, auth) runs for real
    setTimeout(fn, ms) { if (ms > 5000) { longTimeouts.push({ fn, ms }); return -1; } return setTimeout(fn, ms); },
    clearTimeout, firebase,
    Date: DeviceDate, JSON, Math, Object, Array, String, Number, Boolean,
    isFinite, isNaN, parseInt, parseFloat, Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(slice, ctx, { filename: devId + '.js' });
  return {
    ctx, store, music,
    el: id => elements[id] || null,
    elMake: id => ctx.document.getElementById(id),
    click(id) { const e = elements[id]; ((e && e.listeners.click) || []).forEach(f => f.call(e)); },
    fire(id, ev) { const e = elements[id]; ((e && e.listeners[ev]) || []).forEach(f => f.call(e)); },
    tick(ms) { intervals.filter(t => t.ms === ms).forEach(t => t.fn()); },
    fireLong() { const q = longTimeouts.splice(0); q.forEach(t => t.fn()); },
    mayPlay() { return ctx.window.rdnsAudioRole.mayPlay(); },
    claim() { return ctx.window.musClaim(); },
  };
}

const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));
let fails = 0;
function ok(cond, label) {
  console.log((cond ? '✓ ' : '✗ ') + label);
  if (!cond) fails++;
}

(async function () {
  const NAMES = ['Sunset Drive', 'MELİSA gecesi', 'Bad<b>"name"</b>&co'];
  const cloud = makeCloud();
  const A = makeDevice('deva11', null, cloud, makeMusic(NAMES));        // reception
  const B = makeDevice('devb22', 'owner', cloud, makeMusic([]));        // the owner
  await tick();

  // 1 — the claim
  A.claim(); await tick();
  const p = cloud.data['rdns_audio_v1/player'];
  ok(p && p.deviceId === 'deva11', 'claim writes player.deviceId');
  ok(p && typeof p.heartbeat === 'number' && typeof p.claimedAt === 'number', 'claim stamps are numbers, not sentinels');
  ok(A.mayPlay() === true, 'the speaker may play');
  ok(B.mayPlay() === false, 'the remote may NEVER play');

  // 2 — an owner tap becomes one command, acted on once
  B.click('rmus-toggle'); await tick();
  const cmd = cloud.data['rdns_audio_v1/cmd'];
  ok(cmd && cmd.verb === 'play' && cmd.by === 'devb22', 'toggle sent a play cmd');
  ok(cmd && /^[A-Za-z0-9_-]+$/.test(cmd.id) && /^\d+_\d+$/.test(cmd.id), 'cmd id follows the id rule');
  ok(A.music.calls.filter(c => c[0] === 'play').length === 1, 'A played, once');
  const st = cloud.data['rdns_audio_v1/state'];
  ok(st && st.playing === true && st.trackName === 'Sunset Drive' && st.trackCount === 3, 'state answered with the truth');
  ok(typeof st.ts === 'number', 'state.ts is a real timestamp');
  B.fireLong();
  ok((B.el('rmus-ack') || {}).textContent === '', 'an answered command shows no complaint');

  // 3 — replaying the same command does nothing
  cloud.setRaw('rdns_audio_v1/cmd', cmd); await tick();
  ok(A.music.calls.filter(c => c[0] === 'play').length === 1, 'same id replayed → not acted on again');

  // 4 — a stale command from a reconnecting device does nothing
  cloud.setRaw('rdns_audio_v1/cmd', { id: '999999_1', verb: 'pause', arg: null, ts: Date.now() - 120000, by: 'ghost1' });
  await tick();
  ok(A.music.calls.filter(c => c[0] === 'pause').length === 0, 'a 2-minute-old cmd is ignored');

  // 5 — volume: clamped, and null is absent, never zero
  B.elMake('rmus-vol').value = '140'; B.fire('rmus-vol', 'change'); await tick();
  ok(A.music.calls.some(c => c[0] === 'setVolume' && c[1] === 100), 'volume clamped to 100');
  cloud.setRaw('rdns_audio_v1/cmd', { id: String(Date.now()) + '_77', verb: 'volume', arg: null, ts: Date.now(), by: 'devb22' });
  await tick();
  ok(!A.music.calls.some(c => c[0] === 'setVolume' && c[1] === 0), 'volume null arg never becomes zero');

  // 6 — the library: once, sanitised, and only again on change
  A.tick(2000); await tick();
  A.tick(2000); await tick();
  ok(cloud.writesTo('rdns_audio_v1/library').length === 1, 'library written once, not per tick');
  const lib = cloud.data['rdns_audio_v1/library'];
  ok(lib && lib.count === 3 && lib.tracks.length === 3, 'library carries all names');
  ok(lib.tracks[2].n.indexOf('<') < 0 && lib.tracks[2].n.indexOf('"') < 0, 'names are sanitised to plain text');
  A.music._names.push('Yeni Parça');
  A.tick(2000); await tick();
  ok(cloud.writesTo('rdns_audio_v1/library').length === 2, 'a changed library IS re-published');

  // 7 — the heartbeat refreshes and touches nothing else
  const hb0 = cloud.data['rdns_audio_v1/player'].heartbeat;
  await tick(5); A.tick(15000); await tick();
  const p2 = cloud.data['rdns_audio_v1/player'];
  ok(p2.heartbeat >= hb0 && p2.deviceId === 'deva11', 'heartbeat refreshed, claim untouched');

  // 8 — the Turkish-blind filter on the owner's list
  B.click('rmus-list-btn'); await tick();
  B.elMake('rmus-filter').value = 'melısa'; B.fire('rmus-filter', 'input'); await tick();
  const rows = (B.el('rmus-tracks') || { children: [] }).children.flatMap(f => f.children || [f]);
  ok(rows.length === 1 && /MELİSA/.test(rows[0].textContent), 'melısa finds MELİSA and only her');
  // and tapping the row commands that exact track
  (rows[0].listeners.click || []).forEach(f => f.call(rows[0])); await tick();
  ok(A.music.calls.some(c => c[0] === 'playTrack' && c[1] === 1), 'tapping a row plays that index');

  // 9 — a dead speaker: greyed controls and the offline line, on every screen
  cloud.setRaw('rdns_audio_v1/player', { deviceId: 'deva11', claimedAt: Date.now() - 300000, heartbeat: Date.now() - 90000 });
  await tick(); B.tick(1000);
  ok(/çevrimdışı/.test((B.el('rmus-warn') || {}).textContent), 'owner panel says çevrimdışı');
  ok((B.el('rmus-toggle') || {}).disabled === true, 'remote controls grey out');
  A.tick(1000);
  // (reception keeps its badge — it IS the claimed device; only remotes grey)

  // 10 — "Cevap yok": a command nobody answers
  const cloud2 = makeCloud();
  cloud2.setRaw('rdns_audio_v1/player', { deviceId: 'phantom', claimedAt: Date.now(), heartbeat: Date.now() });
  const clockC = { skew: 0 };
  const C = makeDevice('devc33', 'owner', cloud2, makeMusic([]), clockC);
  await tick();
  C.click('rmus-toggle'); await tick();
  clockC.skew = 11000;   // ten seconds pass with no state written back
  C.fireLong();
  ok((C.el('rmus-ack') || {}).textContent === 'Cevap yok', 'ten silent seconds show Cevap yok');

  // 11 — every key that ever crossed is legal (checkKeys throws inside set/update,
  //      so reaching here with writes recorded is itself the proof)
  ok(cloud.writes.length + cloud2.writes.length > 6, 'writes were recorded and every key passed the legality gate');

  console.log('');
  if (fails) { console.error(fails + ' FAILED'); process.exit(1); }
  console.log('all music remote tests passed');
})().catch(e => { console.error('✗ harness error:', e); process.exit(1); });
