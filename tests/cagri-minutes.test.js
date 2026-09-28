/* The Çağrı box — reception calling a technician out loud.

   Each minute button needs a recording of Emel saying it, at
   voice/cagri/<key>-<minutes>.mp3. Where the file is missing, say() falls back
   to the browser's own voice, which is the one the salon rejected. So this
   pins two things that are easy to get out of step: every button has a Turkish
   word to say, and the list of buttons is checked against the recordings that
   actually exist on disk, so a missing file is named here rather than
   discovered out loud in front of a customer. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let fails = 0, n = 0;
const is = (got, want, what) => {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log('FAIL: ' + what + '\n  got:  ' + JSON.stringify(got) + '\n  want: ' + JSON.stringify(want)); }
};

// The two literals, read out of the page.
const grab = (name) => {
  const m = new RegExp('var ' + name + '\\s*=\\s*([^;]+);').exec(src);
  if (!m) throw new Error(name + ' not found in index.html');
  return vm.runInNewContext('(' + m[1] + ')');
};
const WORD = grab('WORD'), MINS = grab('MINS');

is(MINS, [5, 10, 15, 20, 30], 'the buttons: 5, 10, 15, 20 and 30');
MINS.forEach(m => is(typeof WORD[m], 'string', m + ' has a Turkish word to say'));
is(WORD[30], 'otuz', '30 says otuz');
// Ascending, so the row reads left to right the way a person counts.
is(MINS.slice().sort((a, b) => a - b), MINS, 'the buttons are in order');

// Which technicians the call box offers — everyone not hidden from the wall.
const ctx = { window: {}, console, Date };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'crown-config.js'), 'utf8'), ctx);
const C = ctx.window.CROWN;
const onBox = (C.operators || []).filter(o => !o.hiddenOnBoard).map(o => o.key);
is(onBox.length > 0, true, 'somebody is on the call box');

// The recordings. A missing file is not a test failure — it is a fact worth
// printing, because the button still works and simply speaks in the wrong
// voice until somebody records it.
const dir = path.join(root, 'voice', 'cagri');
const have = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
const missing = [];
onBox.forEach(k => MINS.forEach(m => {
  if (!have.includes(k + '-' + m + '.mp3')) missing.push(k + '-' + m + '.mp3');
}));
n++;
if (missing.length) {
  console.log('  NOTE: ' + missing.length + ' recording(s) not yet made — these speak in the browser voice until they exist:');
  console.log('        ' + missing.join(', '));
} else {
  console.log('  ok every button on the call box has Emel saying it');
}

console.log((fails ? 'FAILED ' + fails + '/' + n : 'ok ' + n + ' checks') + ' — cagri-minutes');
process.exit(fails ? 1 : 0);
