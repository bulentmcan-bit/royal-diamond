// ═══════════════════════════════════════════════════════════════════════════
// The player itself — the REAL Music module sliced out of index.html, driven
// through a fake <audio> element. It proves:
//   1. play/next/prev/playTrack work and index() names the right track
//   2. a device denied the speaker role never calls play() on the element
//   3. a NotAllowedError does not fail silently: the stall hook fires,
//      wanted survives, and the next revive() resumes
//   4. the reload stall bar appears on refusal and one gesture removes it
//
// Run:  node tests/music-player.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function sliceBetween(a, b) {
  const i0 = html.indexOf(a), i1 = html.indexOf(b, i0);
  if (i0 < 0 || i1 <= i0) { console.error('✗ marker not found: ' + a.slice(0, 40)); process.exit(1); }
  return html.slice(i0, i1);
}
const musicSlice = sliceBetween('var Music=(function(){', '// Reachable from the console');
const barSlice = sliceBetween('/* ── the reload stall bar', '\n  // The baseline came down');

let fails = 0;
function ok(cond, label) { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) fails++; }
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

// ── the fake <audio> element ────────────────────────────────────────────────
function makeAudioEl() {
  const listeners = {};
  return {
    src: '', paused: true, ended: false, volume: 1,
    refuse: false, playCalls: 0,
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    fire(ev) { (listeners[ev] || []).forEach(f => f()); },
    play() {
      this.playCalls++;
      if (this.refuse) return Promise.reject({ name: 'NotAllowedError' });
      this.paused = false;
      const self = this;
      setTimeout(() => self.fire('playing'), 0);
      return Promise.resolve();
    },
    pause() { this.paused = true; },
  };
}

(async function () {
  const el = makeAudioEl();
  const store = { rdns_cbm_shuffle: '0' };   // straight order: the test can name its expectations
  const blocked = { n: 0 };
  const win = {};
  const ctx = {
    window: win,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    document: { getElementById: id => (id === 'cbm-audio' ? el : null) },
    navigator: {},                       // no OPFS: the library paths bow out cleanly
    indexedDB: undefined,
    URL: { createObjectURL: f => 'blob:' + (f && f.name), revokeObjectURL() {} },
    C: {
      music: { volume: 21, duckTo: 8, fadeDownMs: 5, fadeUpMs: 5, loop: true, maxTracks: 1000, maxDepth: 3, maxLibraryMB: 1, leadGapMs: 0, holdMs: 0, shuffle: false },
      isMusicFile: n => /\.mp3$/i.test(String(n)),
      trackName: n => String(n).replace(/\.mp3$/i, ''),
    },
    paintMusic() {},
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, isFinite, isNaN, parseInt, parseFloat,
  };
  vm.createContext(ctx);
  vm.runInContext(musicSlice + '\n;__music = Music;', ctx, { filename: 'music.js' });
  const Music = ctx.__music;
  win.cbmMusic = Music;
  win.rdnsMusicBlocked = () => { blocked.n++; };

  // 1 — ordinary life: play, next, prev, playTrack
  Music.fromFiles([{ name: 'Alpha.mp3' }, { name: 'Beta.mp3' }, { name: 'Gamma.mp3' }, { name: 'skip.txt' }]);
  ok(Music.count() === 3, 'fromFiles kept the three mp3s');
  Music.play(); await tick();
  ok(!el.paused && Music.playing() && Music.index() === 0 && Music.title() === 'Alpha', 'play starts the first track');
  Music.next(); await tick();
  ok(Music.index() === 1 && Music.title() === 'Beta', 'next moves forward');
  Music.prev(); await tick();
  ok(Music.index() === 0, 'prev moves back');
  Music.playTrack(2); await tick();
  ok(Music.index() === 2 && Music.title() === 'Gamma' && Music.wanted(), 'playTrack jumps straight to the named index');
  ok(Music.names().join(',') === 'Alpha,Beta,Gamma', 'names() lists the display names in file order');

  // 2 — a device that is not the speaker never touches play()
  Music.pause(); await tick();
  win.rdnsAudioRole = { mayPlay: () => false };
  const callsBefore = el.playCalls;
  Music.play(); Music.revive(); Music.playTrack(1); await tick();
  ok(el.playCalls === callsBefore, 'denied the role, play()/revive()/playTrack() never reach the element');
  ok(!Music.wanted(), 'and wanted stays off — no phantom stall on a silent remote');
  win.rdnsAudioRole = { mayPlay: () => true };

  // 3 — the autoplay refusal is loud, and survives to the next gesture
  el.refuse = true;
  Music.play(); await tick();
  ok(blocked.n > 0, 'NotAllowedError raised the stall hook');
  ok(Music.wanted() && !Music.playing(), 'wanted survives the refusal');
  el.refuse = false;
  Music.revive(); await tick();
  ok(Music.playing(), 'the next revive (a real tap) resumes the music');

  // 4 — the stall bar itself: appears on refusal, one gesture removes it
  const docListeners = {};
  const body = { children: [], appendChild(c) { this.children.push(c); } };
  let unlocked = 0;
  const barCtx = {
    window: win,
    document: {
      createElement: () => ({ style: {}, set textContent(v) {}, get textContent() { return ''; } }),
      body,
      addEventListener(ev, fn) { (docListeners[ev] = docListeners[ev] || []).push(fn); },
      removeEventListener(ev, fn) { docListeners[ev] = (docListeners[ev] || []).filter(f => f !== fn); },
    },
    Music,
    unlockAudio() { unlocked++; Music.revive(); },
    console: { log() {}, warn() {}, error() {} },
    setInterval: () => 0, clearInterval: () => {}, setTimeout, clearTimeout,
    Date, Math, Object, Array, String, Number, Boolean,
  };
  vm.createContext(barCtx);
  // wrap: the slice is an IIFE statement `(function(){...})();`
  vm.runInContext(barSlice.slice(barSlice.indexOf('(function(){')), barCtx, { filename: 'bar.js' });
  el.refuse = true;
  Music.pause(); Music.play(); await tick();       // wanted on, refusal fires the hook → real bar module now
  ok(body.children.length === 1, 'the bar is on screen after a refused comeback');
  ok((docListeners.click || []).length === 1, 'one gesture listener is armed');
  el.refuse = false;
  (docListeners.click || []).slice().forEach(f => f()); await tick();
  ok(unlocked > 0 && Music.playing(), 'the first click resumes the music');
  ok((docListeners.click || []).length === 0 && (docListeners.keydown || []).length === 0, 'the bar and its listeners are gone');

  // ── a fake OPFS, so the library paths run for real ─────────────────────────
  function makeOpfs() {
    const files = {};   // name → size
    const dir = {
      values() {
        const names = Object.keys(files);
        let i = 0;
        return { next: () => Promise.resolve(i < names.length
          ? { done: false, value: { kind: 'file', name: names[i], getFile: (n => () => Promise.resolve({ name: n, size: files[n] }))(names[i++]) } }
          : { done: true }) };
      },
      getFileHandle(n) {
        return Promise.resolve({
          createWritable: () => Promise.resolve({ write(f) { files[n] = f.size || 1; return Promise.resolve(); }, close: () => Promise.resolve() }),
          getFile: () => Promise.resolve({ name: n, size: files[n] }),
        });
      },
      removeEntry(n) { delete files[n]; return Promise.resolve(); },
    };
    return { files, storage: { getDirectory: () => Promise.resolve({ getDirectoryHandle: () => Promise.resolve(dir) }), persist: () => Promise.resolve(true) } };
  }
  function makeLibCtx(store, opfs) {
    const el2 = makeAudioEl();
    const win2 = {};
    const c = {
      window: win2,
      localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
      },
      document: { getElementById: id => (id === 'cbm-audio' ? el2 : null) },
      navigator: { storage: opfs.storage },
      indexedDB: undefined,
      URL: { createObjectURL: f => 'blob:' + (f && f.name), revokeObjectURL() {} },
      // the shared config caps the library at 1 MB (for the cap test above);
      // these scenarios need room, so they carry a real-sized cap
      C: Object.assign({}, ctx.C, { music: Object.assign({}, ctx.C.music, { maxLibraryMB: 2048 }) }),
      paintMusic() {},
      console: { log() {}, warn() {}, error() {} },
      setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
      Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, isFinite, isNaN, parseInt, parseFloat,
    };
    vm.createContext(c);
    vm.runInContext(musicSlice + '\n;__music = Music;', c, { filename: 'music-lib.js' });
    win2.cbmMusic = c.__music;
    return { Music: c.__music, el: el2 };
  }

  // 5 — a folder ADDS to the library, never replaces it
  {
    const store2 = { rdns_cbm_shuffle: '0' };
    const opfs = makeOpfs();
    opfs.files['English1.mp3'] = 5e6; opfs.files['English2.mp3'] = 5e6;   // the 77 English tracks, in miniature
    const d = makeLibCtx(store2, opfs);
    d.Music.fromFiles([{ name: 'Turkish1.mp3', size: 4e6 }]);             // the owner's Turkish folder
    await tick(50);
    ok(Object.keys(opfs.files).sort().join(',') === 'English1.mp3,English2.mp3,Turkish1.mp3',
       'the Turkish folder went IN — and the English tracks are still there');
    ok(d.Music.count() === 3, 'playback now runs on the merged library, all three');
    ok(/1 yeni eklendi/.test(d.Music.note()), 'the import says how many were added');
  }

  // 6 — the import tally: skipped non-music, the giant single file, duplicates kept
  {
    const store2 = { rdns_cbm_shuffle: '0' };
    const opfs = makeOpfs();
    opfs.files['Same.mp3'] = 5e6;
    const d = makeLibCtx(store2, opfs);
    d.Music.fromFiles([
      { name: 'Same.mp3', size: 5e6 },                 // identical: kept, not re-copied
      { name: 'BigMix.mp3', size: 1300 * 1048576 },    // the 1.3 GB album-in-one-file
      { name: 'cover.jpg', size: 1e5 },                // not music
    ]);
    await tick(50);
    const n = d.Music.note();
    ok(/1 yeni eklendi/.test(n) && /1 zaten vardı/.test(n), 'added and already-there both counted');
    ok(/1 dosya müzik değil/.test(n), 'the skipped cover.jpg is said out loud');
    ok(/⚠ 100 MB üzeri dosya: BigMix \(1300 MB\)/.test(n) && /karıştırılamaz/.test(n),
       'the continuous-mix warning names the file and says why it is a problem');
  }

  // 6b — same name, DIFFERENT song → suffixed, never overwritten
  {
    const store2 = { rdns_cbm_shuffle: '0' };
    const opfs = makeOpfs();
    opfs.files['01 Intro.mp3'] = 5e6;
    const d = makeLibCtx(store2, opfs);
    d.Music.fromFiles([{ name: '01 Intro.mp3', size: 7e6 }]);   // another album's intro
    await tick(50);
    ok(opfs.files['01 Intro.mp3'] === 5e6 && opfs.files['01 Intro (2).mp3'] === 7e6,
       'the twin keeps its own file under a suffix — nothing is written over');
  }

  // 7 — the morning carries on where the evening stopped
  {
    const store2 = { rdns_cbm_shuffle: '0', rdns_cbm_musicvol: '21' };
    const opfs = makeOpfs();
    opfs.files['Alpha.mp3'] = 1e6; opfs.files['Beta.mp3'] = 1e6; opfs.files['Gamma.mp3'] = 1e6;
    const evening = makeLibCtx(store2, opfs);
    evening.Music.restore(); await tick(50);
    evening.Music.play(); await tick();
    evening.Music.next(); await tick();
    ok(evening.Music.title() === 'Beta', 'the evening ends on Beta');
    const saved = JSON.parse(store2.rdns_cbm_pos || 'null');
    ok(saved && saved.n === 'Beta.mp3' && saved.a === 1, 'the position is written down as it plays');
    // the same laptop, next morning: same localStorage, same OPFS, fresh page
    const morning = makeLibCtx(store2, opfs);
    morning.Music.restore(); await tick(50);
    ok(morning.Music.index() === 1 && morning.Music.title() === 'Beta',
       'the morning remembers where the evening stopped');
    morning.Music.play(); await tick();
    ok(morning.Music.playing() && morning.Music.index() === 1,
       'play resumes the saved track — never track one');
    morning.Music.next(); await tick();
    ok(morning.Music.title() === 'Gamma', 'and the round carries on into the unheard half');
  }

  // 7c — the reload lands mid-song: saved seconds, applied to the right track
  {
    const store2 = { rdns_cbm_shuffle: '0',
      rdns_cbm_pos: JSON.stringify({ o: [0, 1, 2], a: 1, n: 'Beta.mp3', s: 120 }) };
    const opfs = makeOpfs();
    opfs.files['Alpha.mp3'] = 1e6; opfs.files['Beta.mp3'] = 1e6; opfs.files['Gamma.mp3'] = 1e6;
    const d = makeLibCtx(store2, opfs);
    d.Music.restore(); await tick(50);
    d.Music.play(); await tick();
    d.el.duration = 200; d.el.currentTime = 0; d.el.fire('loadedmetadata'); await tick();
    ok(d.Music.title() === 'Beta' && d.el.currentTime === 120,
       'the reload lands 2:00 into Beta — the middle of the song, not its top');
  }
  {
    // a stale figure at the very end must not seek past it and skip the track
    const store2 = { rdns_cbm_shuffle: '0',
      rdns_cbm_pos: JSON.stringify({ o: [0, 1], a: 0, n: 'Alpha.mp3', s: 198 }) };
    const opfs = makeOpfs();
    opfs.files['Alpha.mp3'] = 1e6; opfs.files['Beta.mp3'] = 1e6;
    const d = makeLibCtx(store2, opfs);
    d.Music.restore(); await tick(50);
    d.Music.play(); await tick();
    d.el.duration = 200; d.el.currentTime = 0; d.el.fire('loadedmetadata'); await tick();
    ok(d.el.currentTime === 0, 'seconds within a breath of the end are ignored — the song plays, never skips');
  }

  // 7b — a changed library refuses yesterday's round and starts clean
  {
    const store2 = { rdns_cbm_shuffle: '0', rdns_cbm_musicon: '0',
      rdns_cbm_pos: JSON.stringify({ o: [0, 1], a: 1, n: 'Beta.mp3' }) };
    const opfs = makeOpfs();
    opfs.files['Alpha.mp3'] = 1e6; opfs.files['Beta.mp3'] = 1e6; opfs.files['New.mp3'] = 1e6;
    const d = makeLibCtx(store2, opfs);
    d.Music.restore(); await tick(50);
    d.Music.play(); await tick();
    ok(d.Music.index() === 0, 'a saved round that no longer fits is discarded — play starts fresh, no wrong song');
  }

  console.log('');
  if (fails) { console.error(fails + ' FAILED'); process.exit(1); }
  console.log('all music player tests passed');
})().catch(e => { console.error('✗ harness error:', e); process.exit(1); });
