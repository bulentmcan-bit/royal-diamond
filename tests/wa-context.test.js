// ═══════════════════════════════════════════════════════════════════════════
// "Neye cevap veriyor" — turning a reply back into the thing it answers.
//
// Piyzi's inbox shows an outgoing message as its template NAME: a blue box
// reading "bosluk_teklifi". The owner looked at one and said he could not
// relate to it. He was right. These helpers put the sentence back, and say
// which of the two reminders went out and when, so reception can answer
// "Evet" knowing what the yes was to.
//
//   1. the template dictionary — and the line it must not cross: a body is
//      quoted only where the body is actually in this repository
//   2. the offer's own clock, read out of its id, and whether the slot was
//      still held when she finally answered
//   3. the reminders: exact when the app logged them, derived when only the
//      appointment's flag says one went, never one sent after the reply
//   4. the panel is really wired to all of it
//
// Run:  node tests/wa-context.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function is(got, want, label) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
}

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const slice = (a, b) => {
  const i0 = html.indexOf(a), i1 = html.indexOf(b);
  if (i0 < 0 || i1 <= i0) throw new Error('markers not found: ' + a);
  return html.slice(i0, i1);
};
const ctx = { console: { log(){}, warn(){}, error(){} }, Intl, Date };
vm.createContext(ctx);
vm.runInContext(slice('// WAREPLY-SLICE-START', '// WAREPLY-SLICE-END'), ctx, { filename: 'wareply.js' });
const F = n => ctx[n];

console.log('1. the template dictionary');
{
  const t = F('rdWrTemplate')('bosluk_teklifi');
  is(!!t, true, 'bosluk_teklifi is known');
  is(t.exact, true, '…and its body IS in this repo, so it is quoted');
  is(/yerimiz açıldı/.test(t.body), true, '…the real sentence, not a paraphrase');
  is(t.buttons.indexOf('Evet / Yes please') > -1, true, '…with the button the customer actually taps');

  const r24 = F('rdWrTemplate')('pyz_randevu_hatirlatma_24saat');
  is(r24.exact, false, 'the 24-hour reminder was written inside Piyzi, not here');
  is('body' in r24, false, '…so NO body is quoted for it — nothing is invented to fill the gap');
  is(/24 saat/.test(r24.label), true, '…but it is named in plain Turkish');
  is(r24.vars, ['randevu saati'], '…and the variable we fill in is named truthfully');

  // The rule, swept across the whole dictionary: a quoted body must come with
  // exact:true, and anything exact:true must have a body beside it in
  // worker/templates/. This is the check that stops a plausible-sounding
  // invention being pasted in later.
  const D = F('RD_WA_TEMPLATES');
  const liars = Object.keys(D).filter(k => (('body' in D[k]) !== (D[k].exact === true)));
  is(liars, [], 'every quoted body is marked exact, and every exact one is quoted');
  const repo = fs.readdirSync(path.join(root, 'worker', 'templates')).join(' ');
  const unbacked = Object.keys(D).filter(k => D[k].exact === true && !new RegExp(k.replace(/_/g, '[-_]')).test(repo + ' ' + fs.readFileSync(path.join(root, 'worker', 'templates', 'gapfill-offer.md'), 'utf8') + fs.readFileSync(path.join(root, 'worker', 'templates', 'gapfill-offer-gun.md'), 'utf8')));
  is(unbacked, [], 'every exact body names a template that really exists in worker/templates/');

  const u = F('rdWrTemplate')('pyz_something_added_tomorrow');
  is(u.unknown, true, 'a template added at Piyzi tomorrow is still recognised as a template');
  is(u.label, 'pyz_something_added_tomorrow', '…and reads as its own name rather than as nothing');
  is(F('rdWrTemplate')(''), null, 'no name, no template');
  is(F('rdWrTemplate')(null), null, '…and null is not a name either');
}

console.log('2. the offer clock');
{
  const ID = '1790488822000-hannah-2026-09-28-0900';   // SERAL's real offer
  is(F('rdWrOfferSentAt')(ID), 1790488822000, "the offer's id carries the moment it was sent");
  is(F('rdWrOfferSentAt')('hannah-2026-09-28'), 0, 'an id without a timestamp gives 0, not NaN');
  is(F('rdWrOfferSentAt')(null), 0, '…and nothing gives 0');

  // Sent 27 Eylül 09:00, answered 30 Eylül 20:38. Three days.
  const late = F('rdWrOfferLate')(ID, 1790789937000, 45);
  is(late.days, 3, 'she answered three days later');
  is(late.pastHold, true, '…so the slot was long out of hold');
  is(late.holdMinutes, 45, '…and the hold it is measured against is the configured 45, not a guess');

  const quick = F('rdWrOfferLate')(ID, 1790488822000 + 10 * 60000, 45);
  is(quick.pastHold, false, 'ten minutes later the slot is still hers');
  is(quick.mins, 10, '…and the wait is reported in minutes while it is small');
  is(F('rdWrOfferLate')(ID, 1790488822000 + 60 * 60000, 45).hours, 1, 'an hour reads as an hour');
  is(F('rdWrOfferLate')(ID, 1790488822000 + 10 * 60000).holdMinutes, 45, 'a missing hold falls back to 45 rather than to zero');
  is(F('rdWrOfferLate')(ID, 1790488822000 + 10 * 60000, 0).holdMinutes, 45, '…and so does a zero');
  is(F('rdWrOfferLate')(ID, 1790488822000 - 1000, 45), null, 'a reply BEFORE the offer is not a late reply, it is nonsense — null');
  is(F('rdWrOfferLate')('no-ts', 1790789937000, 45), null, 'no send time, no verdict');

  const NOW = new Date('2026-10-01T09:00:00').getTime();
  is(F('rdWrSlotGone')('2026-09-28', NOW), true, 'a slot on a day already gone is gone');
  is(F('rdWrSlotGone')('2026-10-01', NOW), false, "…today's is not");
  is(F('rdWrSlotGone')('2026-10-05', NOW), false, '…nor is next week');
  is(F('rdWrSlotGone')('', NOW), false, 'no date, no claim');
}

console.log('3. the reminders');
{
  const client = { id: 7, name: 'Seral' };
  const A = (id, dt, extra) => Object.assign({ id, clientId: 7, datetime: dt, staff: 'Helen', service: 'Dolgu (Infill)' }, extra || {});
  const t = d => new Date(d).getTime();
  const APPT = '2026-09-30T17:00';
  const REPLY = t('2026-09-30T20:38');

  // exact: the app's own panel sent it and wrote down the words
  {
    const log = { 101: { sentAt: t('2026-09-29T16:40'), text: 'Merhaba, yarın 17:00 randevunuz var.' } };
    const out = F('rdWrRemindersFor')([A(101, APPT, { r24: true })], client, REPLY, log);
    is(out.length, 1, 'the 24-hour reminder is found');
    is(out[0].exact, true, '…and it is exact, because the app logged it');
    is(out[0].at, t('2026-09-29T16:40'), '…at the time it really went');
    is(out[0].text, 'Merhaba, yarın 17:00 randevunuz var.', '…with the words the customer really read');
  }
  // derived: the flag says one went, nothing says when
  {
    const out = F('rdWrRemindersFor')([A(102, APPT, { r24: true })], client, REPLY, {});
    is(out[0].exact, false, 'with no log entry the time is DERIVED, and says so');
    is(out[0].at, t('2026-09-29T17:00'), '…24 hours before the appointment');
    is(out[0].text, '', '…and no words are invented');
    is(out[0].tpl, 'pyz_randevu_hatirlatma_24saat', '…but the template is named');
  }
  // the two-hour one
  {
    const out = F('rdWrRemindersFor')([A(103, APPT, { r1: true })], client, REPLY, {});
    is(out[0].kind, 'r1', 'the second reminder is the 2-hour one');
    is(out[0].at, t('2026-09-30T15:00'), '…two hours before, not one — the template is hatirlatma_2saat');
  }
  // both on one appointment
  is(F('rdWrRemindersFor')([A(104, APPT, { r24: true, r1: true })], client, REPLY, {}).length, 2,
     'an appointment that got both reminders contributes both');

  // the ones that must NOT appear
  is(F('rdWrRemindersFor')([A(105, APPT, {})], client, REPLY, {}), [],
     'an appointment with no reminder flag is not a reminder');
  is(F('rdWrRemindersFor')([A(106, '2026-10-20T16:00', { r24: true })], client, REPLY, {}), [],
     'a reminder due AFTER the reply cannot be what she is answering');
  is(F('rdWrRemindersFor')([Object.assign(A(107, APPT, { r24: true }), { clientId: 99 })], client, REPLY, {}), [],
     "another customer's reminder never leaks into this panel");
  is(F('rdWrRemindersFor')([A(108, '2026-06-01T10:00', { r24: true })], client, REPLY, {}), [],
     'a reminder from four months ago is not context, it is noise');
  is(F('rdWrRemindersFor')([A(109, 'not a date', { r24: true })], client, REPLY, {}), [],
     'an unparseable datetime is skipped, not crashed on');
  is(F('rdWrRemindersFor')([A(110, APPT, { r24: true })], null, REPLY, {}), [],
     'no customer, no reminders — a stranger gets no invented history');
  is(F('rdWrRemindersFor')(null, client, REPLY, null), [],
     'no appointments and no log is empty, not a throw');

  // newest first, capped
  {
    const many = [1, 2, 3, 4, 5, 6].map((n, i) => A(200 + n, '2026-09-' + (10 + i) + 'T10:00', { r24: true }));
    const out = F('rdWrRemindersFor')(many, client, REPLY, {});
    is(out.length, 4, 'at most four — a panel is not a history');
    is(out[0].at > out[1].at, true, '…newest first');
  }

  is(F('rdWrReminderLine')({ kind: 'r24', appt: A(1, APPT, {}) }).indexOf('24 saat önce') === 0, true,
     'the line opens by saying WHICH reminder it was');
  is(/17:00/.test(F('rdWrReminderLine')({ kind: 'r1', appt: A(1, APPT, {}) })), true,
     '…and carries the appointment it was for');
}

console.log('4. the panel is wired to it');
{
  is(/rdWrRemindersFor\(appointments, c, r\.ts,/.test(html), true, 'the panel asks for HER reminders, up to the moment of THIS reply');
  is(/typeof getR24SentLog==='function'\?getR24SentLog\(\):\{\}/.test(html), true, '…reading the real sent log, guarded for a page that has not defined it');
  is(/rdWrOfferLate\(o\.id, r\.ts, hold\)/.test(html), true, 'the offer is measured against the reply');
  is(/C\.gapFill&&C\.gapFill\.holdMinutes/.test(html), true, '…with holdMinutes read from crown-config, never hardcoded');
  is(/Ona yeni bir saat teklif edin/.test(html), true, 'a late reply tells reception what to DO, not just what happened');
  is(/if\(!sent\.length && !rems\.length && !\(hadSent>0\)\)\{/.test(html), true, 'the "we sent her nothing" line appears only when BOTH are empty (and nothing was merely folded away)');
  is(/son 14 günde sistemden teklif gitmemiş/.test(html), false, 'the old line that blamed the offer matcher alone is gone');
  is(/Piyzi\\'den kendi yazdığı bir mesaja/.test(html), true, '…replaced by the one true remaining case: reception typed it in Piyzi');
  is(/Resepsiyonun Piyzi\\'ye yazdığı cevaplar burada görünmez/.test(html), true, 'and the honest footnote still stands');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
