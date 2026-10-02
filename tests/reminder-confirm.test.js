// ═══════════════════════════════════════════════════════════════════════════
// randevu_onay — the reminder that has to be answered.
//
// Twenty-five reminders went out and twenty-five customers said nothing, and
// the owner was right to call that broken: nothing in either message ever
// ASKED them to answer. Piyzi's stock reminders carry one button and it is a
// "Detaylar" link. Silence meant nothing at all, so a cancellation only ever
// arrived if somebody thought to type one — which is how an unread "Hello ı
// cannot come today" cost two hours.
//
// The replacement is two taps. And the whole thing turns on one fact that is
// easy to break and silent when broken: a quick-reply tap comes back as a
// message whose TEXT IS THE BUTTON'S LABEL. So the labels are not wording.
// They are the input to rdWrIsConfirm and rdWrIsCancel, and if somebody
// softens "Geleceğim" to "Tamam" in Piyzi's form one afternoon, the green
// band goes blind and nobody finds out.
//
// This test reads the labels out of the template file and runs them through
// the dashboard's REAL functions.
//
// Run:  node tests/reminder-confirm.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const is = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
};
const root = path.join(__dirname, '..');
const md = fs.readFileSync(path.join(root, 'worker', 'templates', 'reminder-confirm.md'), 'utf8');
const toml = fs.readFileSync(path.join(root, 'worker', 'wrangler.toml'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// The live readers, lifted straight out of the dashboard.
function grab(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let d = 0;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (!d) return html.slice(i, k + 1); }
  }
}
const rd = new Function(grab('rdWrIsCancel') + '\n' + grab('rdWrIsConfirm') +
  '\nreturn { cancel: rdWrIsCancel, confirm: rdWrIsConfirm };')();

console.log('1. the two labels, read out of the template itself');
const labels = (md.match(/Quick reply `([^`]+)`/g) || []).map(s => s.replace(/.*`([^`]+)`.*/, '$1'));
{
  is(labels.length, 2, 'the template declares exactly two quick-reply buttons');
  is(labels.filter(l => /^✅/.test(l)).length, 1, '…one of them a yes');
  is(labels.filter(l => /^❌/.test(l)).length, 1, '…and one a no');
}

console.log('2. the dashboard understands them — the whole point');
{
  const yes = labels.find(l => /^✅/.test(l)) || '';
  const no  = labels.find(l => /^❌/.test(l)) || '';
  is(rd.confirm(yes), true,  'a tap on “' + yes + '” reads as COMING — straight into the green band');
  is(rd.cancel(yes),  false, '…and is never mistaken for a cancellation');
  is(rd.cancel(no),   true,  'a tap on “' + no + '” reads as NOT COMING — the red band, with ✕ İptal et');
  is(rd.confirm(no),  false, '…and is never mistaken for a confirmation');
}

console.log('3. Piyzi will actually accept the labels');
{
  // bosluk_teklifi had to lose three words to this limit. It is real.
  labels.forEach(l => is([...l].length <= 25, true, '“' + l + '” is within Piyzi’s 25-character button limit (' + [...l].length + ')'));
  is(/Do not reword these buttons without re-running that\s+check/.test(md), true,
     'and the file warns the next person what rewording them costs');
}

console.log('4. it is written down, and it ships OFF');
{
  is(/randevu_onay/.test(md), true, 'the template has a name');
  is(/UTILITY/.test(md), true, '…and is UTILITY, like the two reminders it replaces — never MARKETING');
  is(/\{\{1\}\}[\s\S]*\{\{2\}\}/.test(md), true, '…and carries the date and the hour');
  is(/NOT yet submitted to Meta/.test(md), true, '…and says plainly that Meta has not seen it yet');
  // Nothing may point at an unapproved name. This is the guard that matters.
  const live = toml.split('\n').filter(l => /^\s*WA_R(24|1)\s*=/.test(l));
  is(live.length, 2, 'both reminders are still configured');
  is(live.every(l => /pyz_randevu_hatirlatma_/.test(l)), true,
     '…and BOTH still point at the approved Piyzi templates, not at a name Meta has never seen');
  is(/^#\s+WA_R24 = '\{"templateName":"randevu_onay"/m.test(toml), true,
     'the new wiring is written down beside them, commented out and ready');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
