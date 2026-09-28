/* Telling reception a Piyzi message has landed.

   Every message a customer sends already reaches the page: the worker's
   /wa/hook writes it to rdns_wa_replies_v1 and the dashboard's replies
   watcher picks it up. But it only raised a SILENT corner toast, and
   reception is not looking at the screen — so messages sat unread until
   somebody happened to open Piyzi. This is the announcement that stops that.

   Three things this pins:
     that it sounds once per batch and only for genuinely new messages;
     the door (window.rdAnnounce) that lets the watcher reach the Crown
       Board's queue at all, since they are separate script blocks;
     the wiring — short chime not the alarm, after the toast, never on the
       first snapshot, and never fatal to the page if the board never loaded. */
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let fails = 0, n = 0;
const is = (got, want, what) => {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log('FAIL: ' + what + '\n  got:  ' + JSON.stringify(got) + '\n  want: ' + JSON.stringify(want)); }
};
const has = (hay, needle, what) => { n++; if (String(hay).indexOf(needle) < 0) { fails++; console.log('FAIL: ' + what + ' — missing: ' + needle); } };
const hasNot = (hay, needle, what) => { n++; if (String(hay).indexOf(needle) >= 0) { fails++; console.log('FAIL: ' + what + ' — must not contain: ' + needle); } };

const slice = (name) => {
  const a = src.indexOf('// ' + name + '-SLICE-START');
  const b = src.indexOf('// ' + name + '-SLICE-END');
  if (a < 0 || b < 0) throw new Error(name + ' slice markers missing from index.html');
  return src.slice(src.indexOf('\n', a) + 1, b);
};

// ── 1. when it sounds ────────────────────────────────────────────────────
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(slice('WRSAY'), ctx);

is(ctx.rdWrShouldSound(0), false, 'nothing new: no sound');
is(ctx.rdWrShouldSound(-1), false, 'a nonsense count makes no sound rather than a wrong one');
is(ctx.rdWrShouldSound(null), false, 'a missing count makes no sound');
is(ctx.rdWrShouldSound(1), true, 'one new message sounds');
is(ctx.rdWrShouldSound(9), true, 'and so does a busy minute — once');

// ── 2. the door into the Crown Board's queue ─────────────────────────────
const door = slice('ANNOUNCE-DOOR');
has(door, 'window.rdAnnounce', 'the queue is exposed under its own name');
has(door, 'try{', 'the door never throws back at its caller');
has(door, 'announce(spec)', 'and it goes through announce(), not straight to the speech engine');

const dctx = { window: {}, console, announce: (s) => { dctx.said = s; } };
vm.createContext(dctx);
vm.runInContext(door, dctx);
dctx.window.rdAnnounce({ lead: 'chime', text: 'x' });
is(dctx.said, { lead: 'chime', text: 'x' }, 'a spec passes straight through');
n++; try { dctx.window.rdAnnounce(null); dctx.window.rdAnnounce('nope'); }
catch (e) { fails++; console.log('FAIL: rubbish passed to the door must not throw'); }

// ── 3. the wiring in the replies watcher ─────────────────────────────────
const i = src.indexOf('function onData(map){');
const wire = src.slice(i, i + 1800);

has(wire, 'var fresh=0', 'the batch counts what is genuinely new');
has(wire, 'fresh++', 'and counts it where the unread ones are found');
has(wire, 'rdWrShouldSound(fresh)', 'the decision is made from that count');
has(wire, "typeof window.rdAnnounce==='function'", 'the board is checked before it is called');
has(wire, "lead:'message'", 'its own light three-note tone, not the fifteen-minute chime');
hasNot(wire, "lead:'alarm'", 'never the crossing alarm');
has(wire, 'tail:null', 'no tail chime after it');
// A tone, not a voice. Nothing is spoken and nothing is read out in a room
// full of customers.
hasNot(wire, 'text:', 'no spoken line at all');
hasNot(wire, 'audio:', 'and no recording either — the tone is the whole message');

// ── 4. the tone itself ───────────────────────────────────────────────────
n++;
if (src.indexOf("if(which==='message') return chimeMsg();") < 0) {
  fails++; console.log('FAIL: playSound must know the message tone');
}
const tone = src.slice(src.indexOf('function chimeMsg()'), src.indexOf('function chimeMsg()') + 400);
has(tone, '1318.5', 'three rising notes, the motif the replies card already dings');
has(tone, '2217.5', 'up to the top note');
// Twice over: once was tried and lost under a dryer. The repeat is what makes
// it carry without making it as long or as loud as the crossing alarm.
has(tone, '[0, .53]', 'the motif is played twice, a short gap between');
n++;
if (!/return\s*1\.15/.test(tone)) { fails++; console.log('FAIL: the tone must report its real length, or the music comes back over it'); }
n++;
if (!/return\s*[01]?\.?\d+/.test(tone) || parseFloat((tone.match(/return\s*([\d.]+)/) || [])[1]) > 1.6) {
  fails++; console.log('FAIL: still shorter than the crossing alarm — a message must never sound like one');
}

// Order: the toast is on the screen before the room is told to look up.
n++;
if (!(wire.indexOf('toast(') < wire.indexOf('rdWrShouldSound(fresh)'))) {
  fails++; console.log('FAIL: the sound must come after the toasts, not before');
}
// Only inside the "we have seen a batch before" guard, so opening the app in
// the morning does not read out yesterday's unread messages.
n++;
if (!(wire.indexOf('if(_seen){') < wire.indexOf('fresh++'))) {
  fails++; console.log('FAIL: the count must sit inside the _seen guard — no announcement on the first snapshot');
}
// One call per batch, not one per message.
n++;
if ((wire.match(/rdAnnounce\(/g) || []).length !== 1) {
  fails++; console.log('FAIL: exactly one announcement per batch');
}

console.log((fails ? 'FAILED ' + fails + '/' + n : 'ok ' + n + ' checks') + ' — piyzi-announce');
process.exit(fails ? 1 : 0);
