// ═══════════════════════════════════════════════════════════════════════════
// The ladder of start times — crown-config.js `starts` and the helpers that
// read it, plus the customer booking page's own copy of the rule. Every job
// is 60 minutes, so a start on the half hour strands the hour after it; a new
// start is therefore offered on the whole hour only, except from 17:30 on,
// where a :30 strands nothing. It proves:
//   1. the ladder is 08:00 … 17:00 hourly, then 17:30 and 18:00 — 12 rungs
//   2. canStartAt says yes to a rung and no to 10:30, 18:30, 07:00, garbage
//   3. nextStartFrom snaps UP: 10:30 → 11:00, 17:10 → 17:30, after 18:00 → null
//   4. changing `step` in the one place changes the whole ladder
//   5. booking.html's SLOTS prints the same rungs, from CROWN and without it
//
// Run:  node tests/start-ladder.test.js
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

function loadCrown() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'crown-config.js'), 'utf8');
  const ctx = { window: {}, console, speechSynthesis: undefined };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.CROWN;
}

console.log('1. the ladder');
{
  const C = loadCrown();
  is(C.startLadderHM(), ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','17:30','18:00'],
     'whole hours 08:00–17:00, then 17:30 and 18:00');
  is(C.startLadder().length, 12, '12 rungs');
  is(C.startLadder()[0], 480, 'minutes of the day, first rung 08:00 = 480');
}

console.log('2. canStartAt');
{
  const C = loadCrown();
  is(C.canStartAt(600), true, '10:00 may be offered');
  is(C.canStartAt(630), false, '10:30 may not — it would strand 11:00');
  is(C.canStartAt(1050), true, '17:30 may — the exception at the end of the day');
  is(C.canStartAt(1080), true, '18:00 is the last start');
  is(C.canStartAt(1110), false, '18:30 is past the last start');
  is(C.canStartAt(420), false, '07:00 is before opening');
  is(C.canStartAt('x'), false, 'garbage is never a start');
}

console.log('3. nextStartFrom snaps up');
{
  const C = loadCrown();
  is(C.nextStartFrom(630), 660, '10:30 → 11:00');
  is(C.nextStartFrom(600), 600, '10:00 stays 10:00');
  is(C.nextStartFrom(1030), 1050, '17:10 → 17:30');
  is(C.nextStartFrom(1081), null, 'after 18:00 the day has no start left');
  is(C.nextStartFrom(0), 480, 'before opening → 08:00');
}

console.log('4. one place to change');
{
  const C = loadCrown();
  C.starts.step = 90;
  is(C.startLadderHM().slice(0, 4), ['08:00','09:30','11:00','12:30'], 'a 90-minute step re-rungs the ladder from opening');
  is(C.canStartAt(1050), true, 'the late half hour survives a different step');
  C.starts.step = 60;
  is(C.startLadder().length, 12, 'and back');
}

console.log('5. the customer page prints the same rungs');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'booking.html'), 'utf8');
  const m = html.match(/const SLOTS=\(function\(\)\{[\s\S]*?\n\}\)\(\);/);
  if (!m) { fail++; console.log('  ✗ booking.html SLOTS not found'); }
  else {
    const withC = { window: { CROWN: loadCrown() } };
    vm.createContext(withC);
    vm.runInContext(m[0] + ';__slots=SLOTS;', withC);
    is(withC.__slots, loadCrown().startLadderHM(), 'from CROWN: the ladder as crown-config writes it');
    const without = { window: {} };
    vm.createContext(without);
    vm.runInContext(m[0] + ';__slots=SLOTS;', without);
    is(without.__slots, loadCrown().startLadderHM(), 'without CROWN: the inline copy of the rule says the same');
  }
}

console.log(fail ? `\n✗ ${fail} failed, ${pass} passed` : `\n✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
