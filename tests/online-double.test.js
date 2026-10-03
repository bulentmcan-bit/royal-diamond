// ═══════════════════════════════════════════════════════════════════════════
// Two of the same lady, in one chair, at two o'clock.
//
// 3 Ekim 2026, the owner looking at his own board: "14:00 beyza soydemir ·
// Jel Başlangıç (Full Set)" — and underneath it, again, "14:00 beyza soydemir
// · Jel Başlangıç (Full Set)". Both came in through the online page. Both
// were written into the diary.
//
// Two separate faults made that possible.
//
//  1. THE RACE. Each arriving request was handed to its own setTimeout and
//     then waited on Firebase. Two of them therefore read the diary BEFORE
//     either had written to it, both found the hour free, and both booked it.
//     The `handled` flag never covered this: it stops a second DEVICE taking
//     a request that is already done, and cannot stop one device running two
//     requests side by side, because neither is finished when the other looks.
//
//  2. NO DUPLICATE CHECK. The booking page disables its button and hides the
//     form, and none of that survives a reload, a back button or a tapped-
//     twice link on a bad line. Nothing downstream asked whether this lady
//     was already in the book at that minute.
//
// Run:  node tests/online-double.test.js
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

console.log('1. the race is gone — one request at a time');
{
  is(/let _obChain = Promise\.resolve\(\);/.test(html), true, 'there is a chain');
  is(/function _obQueue\(id, req\)\{/.test(html), true, '…and a queue that feeds it');
  is(/_obQueue\(snap\.key, req\);/.test(html), true, '…which the Firebase listener uses');
  // The old shape must be GONE, not merely unused: a stray setTimeout call
  // site is how this comes back.
  is(/setTimeout\(\(\)=>\{ try\{_obProcessRequest\(snap\.key,req\);/.test(html), false,
     '…and the old side-by-side setTimeout is gone, not just bypassed');
  is(/return _fbDb\.ref\('rdns_booking_requests\/'\+id\+'\/handled'\)/.test(html), true,
     'the processor RETURNS its promise, so the queue truly waits for the write');
  is(/\.catch\(function\(e\)\{ console\.warn\('OB process error:', e\); \}\);/.test(html), true,
     'and one bad request cannot wedge every booking behind it');
}

console.log('2. the same lady, the same minute — refused');
{
  const fn = new Function('appointments', 'clients',
    grab('_obDuplicateOf') + '\nreturn _obDuplicateOf;');

  const clients = [
    { id: 1, name: 'beyza soydemir', phone: '0533 111 22 33' },
    { id: 2, name: 'Beyza Soydemir', phone: '+90 533 111 22 33' },  // same woman, typed differently
    { id: 3, name: 'Ayşe Demir',     phone: '0548 999 88 77' },
    { id: 4, name: 'Walk-in',        phone: '' }
  ];
  const appts = [
    { id: 90, clientId: 1, datetime: '2026-10-03T14:00', service: 'Jel Başlangıç (Full Set)', staff: 'Lissa', status: 'confirmed' },
    { id: 91, clientId: 3, datetime: '2026-10-03T15:00', service: 'Dolgu (Infill)', staff: 'Helen', status: 'confirmed' },
    { id: 92, clientId: 1, datetime: '2026-10-04T11:00', service: 'Jel Pedikür', staff: 'Lissa', status: 'cancelled' }
  ];
  const dup = (req) => fn(appts, clients)(req);

  is(!!dup({ phone: '0533 111 22 33', date: '2026-10-03', time: '14:00' }), true,
     'the second tap at the same minute is caught');
  // The real screenshot: one row read "beyza soydemir", the other the same
  // name typed another way. The telephone is what settles it.
  is(!!dup({ phone: '+90 533 111 22 33', date: '2026-10-03', time: '14:00' }), true,
     '…however the number was typed — +90, spaces, leading zero');
  is(!!dup({ phone: '0533 111 22 33', date: '2026-10-03', time: '15:00' }), false,
     'a DIFFERENT hour for the same lady is a real booking and goes through');
  is(!!dup({ phone: '0533 111 22 33', date: '2026-10-05', time: '14:00' }), false,
     '…and so is the same hour on another day');
  is(!!dup({ phone: '0548 999 88 77', date: '2026-10-03', time: '14:00' }), false,
     'another customer at that hour is not a duplicate — two chairs, two people');
  is(!!dup({ phone: '0533 111 22 33', date: '2026-10-04', time: '11:00' }), false,
     'a CANCELLED booking does not block her rebooking the hour she cancelled');
  // Guessing from a name would merge two different women. Worse than the bug.
  is(!!dup({ phone: '', date: '2026-10-03', time: '14:00' }), false,
     'a request with no telephone is never matched by name alone');
  is(!!dup({ date: '2026-10-03', time: '14:00' }), false, '…nor one with no telephone field at all');
}

console.log('3. refused OUT LOUD — reception is told, never a silent drop');
{
  is(/handled:'duplicate'/.test(html), true, 'the request is marked duplicate, not simply dropped');
  is(/AYNI RANDEVU İKİNCİ KEZ GELDİ/.test(html), true, '…and reception is told in Turkish');
  is(/İkincisi kaydedilmedi/.test(html), true, '…told plainly that the second one was NOT booked');
  is(/apptId:dup\.id/.test(html), true, '…with the booking it collided with recorded against it');
  // It must be judged before any of the capacity work, or a duplicate can
  // still be refused as "full" and reception gets the wrong story.
  is(html.indexOf("const dup=_obDuplicateOf(req);") < html.indexOf("const maps=_obDayMaps(req.date);"), true,
     'and it is judged before the capacity checks, so the message is the true one');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
