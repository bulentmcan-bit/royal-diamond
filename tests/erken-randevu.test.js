// ═════════════════════════════════════════════════
// The appointment nobody cancelled.
//
// 22 Ekim 2026, Bülent: "when a customer books early because they've taken
// the option, we want it to automatically cancel their appointment that they
// originally had."
//
// The gap-filler offers an empty chair to somebody already in the book. She
// says yes, reception writes the earlier slot — and her ORIGINAL appointment
// is still sitting there a week later. Two chairs held for one woman, two
// sets of reminders sent, and the second one is a no-show that was never a
// no-show.
//
// Doing it automatically is only safe if it refuses to guess. Three
// conditions, all of them, or nothing is touched:
//   1. a real offer went to THAT number for THAT exact day and time, within
//      the last seven days;
//   2. she has a live appointment LATER than the new one;
//   3. there is exactly one of them. Two and it asks instead.
//
// Run:  node tests/erken-randevu.test.js
// ═════════════════════════════════════════════════
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

console.log('1. the wiring is in the one path every booking goes through');
{
  is(/try\{ rdEarlyMoveAutoCancel\(a\); \}catch\(e\)\{[^}]*\}/.test(html), true,
     'saveAppt calls it — and a fault in it can never lose the booking');
  const i = html.indexOf("_rdLogApptCreate(a,'saveAppt')");
  const j = html.indexOf('try{ rdEarlyMoveAutoCancel(a); }');
  is(i > 0 && j > i, true, '…after the booking itself is saved, never before');
  is(/window\._rdGapOffers=_offers/.test(html), true,
     'the offers the worker wrote are readable outside their own panel');
}

console.log('2. it does what it says, and nothing else');
{
  const src = (/function rdEarlyMoveAutoCancel\(a\)\{[\s\S]*?\n\}/.exec(html) || [''])[0];
  is(src.length > 400, true, 'the function is in the file');

  const mk = (over) => {
    const env = { saved: 0, toasts: [], waCancelled: [], logged: [] };
    const box = {
      appointments: over.appts,
      window: { _rdGapOffers: over.offers },
      cObj: () => ({ phone: over.phone }),
      cName: () => 'MÜŞTERİ',
      apptTouch: () => {}, priceOvrSealCancel: () => {},
      cancelLogAdd: (a, role) => env.logged.push(role),
      rdWaCancel: (a) => env.waCancelled.push(a.id),
      saveAll: () => { env.saved++; },
      renderAppts: () => {}, renderDash: () => {}, updateApptBadge: () => {},
      toast: (i, t) => env.toasts.push(t),
      console,
    };
    const keys = Object.keys(box);
    const fn = new Function(...keys, src + '\nreturn rdEarlyMoveAutoCancel;')(...keys.map(k => box[k]));
    return { fn, env };
  };

  const OFFER = { id: 'o1', d: '2026-10-23', t: '11:00', phone: '905338575576', ts: Date.now() - 3600000 };
  const NEWA  = { id: 2, clientId: 7, datetime: '2026-10-23T11:00', status: 'confirmed' };
  const OLDA  = { id: 1, clientId: 7, datetime: '2026-10-28T15:00', status: 'confirmed' };
  const copy  = (o, x) => Object.assign({}, o, x || {});

  const run = (over) => { const { fn, env } = mk(over); fn(over.a || NEWA); return { env, appts: over.appts }; };

  // the whole point
  let r = run({ appts: [copy(OLDA), copy(NEWA)], offers: { o1: OFFER }, phone: '905338575576' });
  is(r.appts[0].status, 'cancelled', 'offer taken → the old appointment is cancelled');
  is(r.env.waCancelled, [1], '…and its queued WhatsApp reminders are pulled with it');
  is(r.env.logged, ['otomatik · erken randevu'], '…and the cancellation is written down, not done quietly');
  is(r.appts[0].rdAutoCancel.newId, 2, '…and the record says which booking replaced it');

  // every refusal
  r = run({ appts: [copy(OLDA), copy(NEWA)], offers: { o1: copy(OFFER, { t: '09:00' }) }, phone: '905338575576' });
  is([r.appts[0].status, r.env.saved], ['confirmed', 0], 'a booking that matches no offer changes nothing');

  r = run({ appts: [copy(OLDA), copy(NEWA)], offers: { o1: OFFER }, phone: '905000000000' });
  is(r.appts[0].status, 'confirmed', 'someone else’s offer for that slot is not hers');

  r = run({ appts: [copy(OLDA), copy(NEWA)], offers: { o1: copy(OFFER, { ts: Date.now() - 9 * 86400000 }) }, phone: '905338575576' });
  is(r.appts[0].status, 'confirmed', 'an offer older than a week is not what this booking answers');

  r = run({ appts: [copy(OLDA, { datetime: '2026-10-21T10:00' }), copy(NEWA)], offers: { o1: OFFER }, phone: '905338575576' });
  is(r.appts[0].status, 'confirmed', 'an EARLIER appointment is never touched — only the one she moved off');

  r = run({ appts: [copy(OLDA), copy(OLDA, { id: 3, datetime: '2026-11-05T12:00' }), copy(NEWA)], offers: { o1: OFFER }, phone: '905338575576' });
  is([r.appts[0].status, r.appts[1].status, r.env.toasts.length], ['confirmed', 'confirmed', 1],
     'two later appointments → it asks and cancels neither');

  r = run({ appts: [copy(OLDA, { status: 'completed' }), copy(NEWA)], offers: { o1: OFFER }, phone: '905338575576' });
  is(r.appts[0].status, 'completed', 'a finished visit is not a booking to cancel');

  r = run({ appts: [copy(OLDA), copy(NEWA)], offers: null, phone: '905338575576' });
  is([r.appts[0].status, r.env.saved], ['confirmed', 0],
     'offers not loaded yet → it keeps its hands off rather than assuming there is none');
}

console.log(fail ? `\n✗ ${fail} FAILED, ${pass} passed` : `\n✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
