/* The Çağrı box — reception calling a technician out loud.

   Each minute button needs a recording of Emel saying it, at
   voice/cagri/<key>-<minutes>.mp3. Where the file is missing the box says
   NOTHING — a chime and the line on the screen. It used to fall back to the
   browser's speech engine, and the only Turkish voice on these laptops is
   Microsoft Tolga, a man; the salon rejected that out loud on 30 Eylül 2026.
   So this pins four things that are easy to get out of step: every button has
   a Turkish word to say, the box asks for recordedOnly, say() honours it, and
   the list of buttons is checked against the recordings that actually exist on
   disk, so a missing file is named here rather than discovered in front of a
   customer. */
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

/* Emel or nobody. Three links in one chain, and any one of them missing puts
   Tolga back in the room. */
{
  const box = /Çağrı — the dashboard's call box[\s\S]*?\n  \}\)\(\);/.exec(src);
  is(!!box, true, 'the Çağrı box is found in index.html');
  const b = box ? box[0] : '';
  is(/announce\(\{[^}]*recordedOnly:\s*true/.test(b), true, 'the call box asks for recordedOnly — the engine voice is not allowed here');
  is(/audio:\s*'cagri\/'/.test(b), true, "…and still names the recording it wants");
  is(/probe\(/.test(b), true, 'it probes for the file, so a silent minute is labelled before it is pressed');
  is(b.includes('⚠ sessiz'), true, '…and says "⚠ sessiz" on a minute with no recording');

  // say() must actually honour the flag, not merely accept it.
  is(/function say\(text, after, audioKey, recordedOnly\)/.test(src), true, 'say() takes recordedOnly');
  is(/var missTts\s*=\s*recordedOnly\s*\?\s*fin\s*:\s*tts;/.test(src), true, 'a missing file under recordedOnly finishes quietly instead of speaking');
  is(/if\(recordedOnly\)\{ fin\(\); return; \}\s*\n\s*tts\(\);/.test(src), true, '…and the no-Audio path stays quiet too');
  is(/say\(it\.text, finishTail, it\.audio, it\.recordedOnly\)/.test(src), true, 'pump() passes the flag through — without this the box asks and nothing listens');

  // The fifteen-minute warning and the crossing alarm KEEP their safety net:
  // they fire with nobody watching, and a wrong voice still carries the news.
  is(/announce\(\{lead:'alarm'[^}]*\}\)/.test(src), true, 'the crossing alarm is still there');
  is(/announce\(\{lead:'alarm'[^}]*recordedOnly/.test(src), false, '…and is NOT recordedOnly — it must speak even in a borrowed voice');
  is(/announce\(\{lead:'chime', text:'Canım '[^}]*recordedOnly/.test(src), false, 'nor is the fifteen-minute warning');
}

// Which technicians the call box offers — everyone not hidden from the wall.
const ctx = { window: {}, console, Date };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'crown-config.js'), 'utf8'), ctx);
const C = ctx.window.CROWN;
const onBox = (C.operators || []).filter(o => !o.hiddenOnBoard).map(o => o.key);
is(onBox.length > 0, true, 'somebody is on the call box');

// The recordings. A missing file is not a test failure — it is a fact worth
// printing, because the button still works: it chimes and writes the line on
// the screen, and stays silent until somebody records it.
const dir = path.join(root, 'voice', 'cagri');
const have = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
const missing = [];
onBox.forEach(k => MINS.forEach(m => {
  if (!have.includes(k + '-' + m + '.mp3')) missing.push(k + '-' + m + '.mp3');
}));
n++;
if (missing.length) {
  console.log('  NOTE: ' + missing.length + ' recording(s) not yet made — these chime but say nothing until they exist:');
  console.log('        ' + missing.join(', '));
} else {
  console.log('  ok every button on the call box has Emel saying it');
}

console.log((fails ? 'FAILED ' + fails + '/' + n : 'ok ' + n + ' checks') + ' — cagri-minutes');
process.exit(fails ? 1 : 0);
