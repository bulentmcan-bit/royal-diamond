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

  console.log('');
  if (fails) { console.error(fails + ' FAILED'); process.exit(1); }
  console.log('all music player tests passed');
})().catch(e => { console.error('✗ harness error:', e); process.exit(1); });
