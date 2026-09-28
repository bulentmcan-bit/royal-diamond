/* Saying a Piyzi message out loud.

   Every message a customer sends already reaches the page: the worker's
   /wa/hook writes it to rdns_wa_replies_v1 and the dashboard's replies
   watcher picks it up. But it only raised a SILENT corner toast, and
   reception is not looking at the screen — so messages sat unread until
   somebody happened to open Piyzi. This is the announcement that stops that.

   Three things this pins:
     the words, and that four messages at once are ONE line, not four;
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

// ── 1. the words ─────────────────────────────────────────────────────────
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(slice('WRSAY'), ctx);

is(ctx.rdWrSayLine(0), null, 'nothing new: nothing is said');
is(ctx.rdWrSayLine(-1), null, 'a nonsense count says nothing rather than talking rubbish');
is(ctx.rdWrSayLine(null), null, 'a missing count says nothing');
has(ctx.rdWrSayLine(1), 'Piyzi', 'one message names Piyzi, so reception knows where to look');
has(ctx.rdWrSayLine(1), 'yeni mesaj geldi', 'and says a new message arrived');
hasNot(ctx.rdWrSayLine(1), '1 yeni', 'one message is not read out as a number');
has(ctx.rdWrSayLine(4), '4 yeni mesaj geldi', 'four at once are counted in a single line');
is(typeof ctx.rdWrSayLine(9), 'string', 'a busy minute still produces one line');

// It is spoken aloud in a room with customers in it: no names, no numbers,
// no words of the message itself. Only that something arrived.
const line = ctx.rdWrSayLine(3);
['+90', '905', 'telefon'].forEach(bad => hasNot(line, bad, 'the spoken line carries no phone number'));

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
has(wire, 'rdWrSayLine(fresh)', 'the line is built from that count');
has(wire, "typeof window.rdAnnounce==='function'", 'the board is checked before it is called');
has(wire, "lead:'chime'", 'the SHORT chime — a message is not an emergency');
hasNot(wire.slice(wire.indexOf('rdWrSayLine(fresh)')), "lead:'alarm'", 'never the crossing alarm');
has(wire, 'tail:null', 'no tail chime after it');

// Order: the toast is on the screen before the room is told to look up.
n++;
if (!(wire.indexOf('toast(') < wire.indexOf('rdWrSayLine(fresh)'))) {
  fails++; console.log('FAIL: the announcement must come after the toasts, not before');
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
