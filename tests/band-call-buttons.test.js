// ═══════════════════════════════════════════════════════════════════════════
// "Can I have buttons on the amber once I've called them."
//
// The amber band is the list of customers who were sent a reminder and said
// nothing, and the owner's instruction for it was always "leave the ones that
// don't reply for us to call and check up with". Twenty-two of them on the
// morning of 3 Ekim.
//
// Ringing them was never the hard part. Writing the answer down was: it meant
// leaving the band, finding her in the diary and doing something there, so it
// did not get done — and the band showed the same twenty-two names the next
// morning whether or not anybody had spoken to a single one of them.
//
// Two buttons on the row. Green keeps her hour and moves her to the confirmed
// list. Red asks once and frees the hour, exactly as the red band's ✕ does.
//
// Run:  node tests/band-call-buttons.test.js
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
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function grab(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let d = 0;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (!d) return html.slice(i, k + 1); }
  }
}

console.log('1. the buttons are on the amber row, beside the telephone');
{
  is(/rdBandSaidYes\('\+x\.a\.id\+'\)|rdBandSaidYes\(/.test(html), true, 'a green ✅ Geliyor');
  is(/rdBandSaidNo\(/.test(html), true, '…and a red ✕ Gelmiyor');
  is(/✅ Geliyor/.test(html), true, '…labelled in Turkish, as reception reads them');
  is(/✕ Gelmiyor/.test(html), true, '…both of them');
  // Red must end the same way the red band's own ✕ does, not invent a second
  // way of cancelling that frees the hour differently.
  is(/window\.rdBandSaidNo=function\(id\)\{ try\{ rdNoShowCancel\(id\); \}catch\(e\)\{\} \};/.test(html), true,
     'and ✕ goes through rdNoShowCancel — one way of freeing an hour, not two');
}

console.log('2. what she said is written down, not guessed');
{
  const fn = /window\.rdBandSaidYes=function\(id\)\{([\s\S]*?)\n\};/.exec(html);
  const y = fn ? fn[1] : '';
  is(/a\.rdCall='yes'; a\.rdCallAt=Date\.now\(\);/.test(y), true, 'the booking carries that she was rung, and when');
  is(/rdns_msg_role/.test(y), true, '…and who rang her');
  is(/saveAll\(\)/.test(y), true, '…and it is saved, so the desk and the owner’s phone agree');
  is(/window\.rdBandUndoCall=function\(id\)\{/.test(html), true, 'and a mis-tap can be undone');
  const u = /window\.rdBandUndoCall=function\(id\)\{([\s\S]*?)\n\};/.exec(html)[1];
  is(/delete a\.rdCall; delete a\.rdCallAt; delete a\.rdCallBy;/.test(u), true, '…by clearing the mark entirely');
  // The undo belongs only to rows reception marked. A customer's own written
  // "tamam" is hers and no button here should rub it out.
  is(/x\.byCall\?'<button onclick="rdBandUndoCall/.test(html), true,
     'the undo shows ONLY on rows marked by telephone, never on her own written words');
}

console.log('3. the triage moves her — and her own words still win');
{
  const t = new Function('appointments', 'clients', 'rdWrAll', 'rdWrLatestFor', 'rdWrIsCancel', 'rdWrIsConfirm', 'rdIsBlocker',
    grab('rdWrTriage') + '\nreturn rdWrTriage;');

  const NOW = Date.now();
  // The diary stores "YYYY-MM-DDTHH:MM" in SALON time and the triage parses it
  // as local time, so the test must build it the same way — toISOString()
  // gives UTC, which on a UTC+3 desk turned "in one hour" into "two hours ago".
  const local = ms => { const d = new Date(ms); const z = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  const inHours = h => local(NOW + h * 3600000);
  const clients = [{ id: 1, name: 'Yagmur Özyay', phone: '905331112233' }];
  const mk = extra => Object.assign({ id: 7, clientId: 1, datetime: inHours(1), staff: 'Lissa', status: 'confirmed', r24: true }, extra);

  const run = (appt, reply) => t([appt], clients,
    () => ({}),
    () => reply || null,
    txt => /gelemiyorum|iptal/i.test(String(txt || '')),
    txt => /tamam|evet/i.test(String(txt || '')),
    () => false)();

  is(run(mk({})).amber.length, 1, 'a reminder sent and nothing back → she is on the list to ring');
  // Only chase where a reminder actually went: no r24 and no r1 means she was
  // never asked, and a silence nobody asked for is not a silence.
  is(run(mk({ r24: false })).amber.length, 0, 'no reminder ever went → nobody to ring, she was never asked');
  is(run(mk({ r24: false, r1: true })).amber.length, 1, '…but the 90-minute one on its own is enough');
  // Today and tomorrow only: the list is for ringing people whose hour is
  // close, not a fortnight's diary.
  is(run(mk({ datetime: inHours(40) })).amber.length, 0, 'a booking beyond 36 hours is not on the list, reminder or not');
  ['cancelled', 'noshow', 'deleted', 'declined'].forEach(st =>
    is(run(mk({ status: st })).amber.length, 0, 'a ' + st + ' booking is nobody to ring'));
  is(run(mk({ datetime: inHours(5) })).amber.length, 0, '…but not before the 1.5-hour button message has gone (7 Ekim)');
  is(run(mk({ rdCall: 'yes' })).amber.length, 0, '…pressing ✅ takes her off that list');
  is(run(mk({ wa: { n: NOW - 60000 } })).amber.length, 0, '…and so does 📨: she has just been asked by WhatsApp, nobody rings her too');
  is(run(mk({ rdCall: 'yes' })).green.length, 1, '…and puts her in the confirmed one');
  is(run(mk({ rdCall: 'yes' })).green[0].byCall, true, '…marked as a telephone confirmation, not a message');
  is(/Telefonla teyit edildi/.test(run(mk({ rdCall: 'yes' })).green[0].r.text), true, '…and it says so in plain Turkish');

  // The one case that must not go wrong: she says yes on the telephone at
  // nine and writes "gelemiyorum" at eleven. She is not coming.
  const cancelled = run(mk({ rdCall: 'yes' }), { text: 'gelemiyorum', ts: NOW });
  is(cancelled.red.length, 1, 'her own written cancellation OVERRULES a telephone yes');
  is(cancelled.green.length, 0, '…and she is not left sitting in the green list as well');
}

console.log('3b. one row per visit');
{
  const t2 = new Function('appointments', 'clients', 'rdWrAll', 'rdWrLatestFor', 'rdWrIsCancel', 'rdWrIsConfirm', 'rdIsBlocker', 'rdWaGroup',
    grab('rdWrTriage') + '\nreturn rdWrTriage;');
  const NOW = Date.now();
  const at = m => { const d = new Date(NOW + m * 60000); const z = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  const clients = [{ id: 1, name: 'RUHŞEN', phone: '905331112233' }];
  const book = [
    { id: 11, clientId: 1, datetime: at(60), staff: 'Helen', status: 'confirmed', r24: true },
    { id: 12, clientId: 1, datetime: at(120), staff: 'Hannah', status: 'confirmed', r24: true },
  ];
  const grp = a => book.filter(x => x.clientId === a.clientId);
  const go = reply => t2(book, clients, () => ({}), (m, c, a) => (reply && a.id === reply.on ? reply : null),
    x => /gelemiyorum/i.test(x), x => /tamam/i.test(x), () => false, grp)();
  is(go().amber.map(x => x.a.id), [11], 'two bookings the same day are one row, on the first');
  is(go({ on: 12, text: 'tamam', ts: NOW }).green.map(x => x.a.id), [11], 'an answer on either booking answers the visit');
  is(go({ on: 12, text: 'tamam', ts: NOW }).amber.length, 0, '…and takes it off the call list');
}

console.log('4. the card says it too, not only the band');
{
  is(/if\(appt && appt\.rdCall==='yes'\)\{/.test(html), true, 'an appointment card marked by telephone carries the green strip');
  is(/📞 telefonla teyit edildi/.test(html), true, '…saying how it was confirmed');
  is(/if\(!\(rr && rdWrIsCancel\(rr\.text\)\)\)\{/.test(html), true, '…unless she has since written that she is not coming');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
