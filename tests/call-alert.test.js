// ═══════════════════════════════════════════════════════════════════════════
// The 1 SAAT KALA call alert — the pure decision sliced out of index.html
// between the CALLALERT-SLICE markers, run with the WA slice it leans on
// (rdWaGroup / rdWaDayOf come from there). No DOM, no network.
//
//   1. one alert per CUSTOMER per day, timed off her FIRST appointment —
//      never one per booking
//   2. outside the last hour → silent; inside it → due
//   3. a waAns anywhere in the group (WhatsApp button, earlier call) → silent
//   4. a completed booking in the group → she is in the salon → silent
//   5. desk answers and snoozes gate re-alerts; an expired snooze re-fires
//   6. KAPALI — Personel and cancelled bookings never ring anyone
//
// Run:  node tests/call-alert.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function slice(start, end) {
  const i0 = html.indexOf(start), i1 = html.indexOf(end);
  if (i0 < 0 || i1 <= i0) { console.error('✗ markers not found:', start); process.exit(1); }
  return html.slice(i0, i1);
}
const waSlice = slice('// WA-SLICE-START', '// WA-SLICE-END');
const caSlice = slice('// CALLALERT-SLICE-START', '// CALLALERT-SLICE-END');
const npMatch = html.match(/function normalizeWaPhone\(phone\)\{[\s\S]*?\n\}/);
if (!npMatch) { console.error('✗ normalizeWaPhone not found'); process.exit(1); }

let pass = 0, fail = 0;
function is(actual, expected, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ✓', what); }
  else { fail++; console.log('  ✗', what, '\n      got     ', a, '\n      expected', e); }
}

const store = {};
const ctx = {
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  console: { log: () => {}, warn: () => {}, error: () => {} },
  document: { getElementById: () => null },
  setTimeout, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Promise,
  clients: [], appointments: [],
  fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
};
vm.createContext(ctx);
vm.runInContext(npMatch[0] + '\n' + waSlice + '\n' + caSlice, ctx, { filename: 'call-slice.js' });

const scan = (appts, cls, st, now) => vm.runInContext(
  'rdCallScan(' + JSON.stringify(appts) + ',' + JSON.stringify(cls) + ',' + JSON.stringify(st) + ',' + now + ')', ctx);

const NOW = new Date('2026-09-02T08:15').getTime();   // salon clock, quarter past eight
const cls = [
  { id: 1, name: 'Pınar Mahşeker', phone: '05338669933' },
  { id: 2, name: 'Ayşe Yılmaz', phone: '05421112233' },
  { id: 3, name: 'KAPALI — Personel', phone: '' },
];

console.log('1. one alert per customer, off her FIRST appointment');
{
  const due = scan([
    { id: 10, clientId: 1, status: 'confirmed', service: 'M', datetime: '2026-09-02T09:00' },
    { id: 11, clientId: 1, status: 'confirmed', service: 'P', datetime: '2026-09-02T10:00' },
    { id: 12, clientId: 2, status: 'confirmed', service: 'M', datetime: '2026-09-02T09:05' },
  ], cls, {}, NOW);
  is(due.length, 2, 'two customers due — never three alerts for three bookings');
  is(due.map(d => d.key), ['p905338669933|2026-09-02', 'p905421112233|2026-09-02'],
     'keyed per PHONE and day — the same identity the reminders group on — earliest arrival first');
  is(due[0].carrier.id, 10, 'Pınar\'s alert rides her 09:00, not her 10:00');
  is(due[0].group.length, 2, 'and carries the whole visit for the card');
}

console.log('2. the hour window');
{
  const appts = [{ id: 10, clientId: 1, status: 'confirmed', datetime: '2026-09-02T09:00' }];
  is(scan(appts, cls, {}, new Date('2026-09-02T07:55').getTime()).length, 0, '65 minutes out → not yet');
  is(scan(appts, cls, {}, new Date('2026-09-02T08:05').getTime()).length, 1, '55 minutes out → ring now');
  is(scan(appts, cls, {}, new Date('2026-09-02T09:00').getTime()).length, 0, 'her hour arrived → too late to fill, no alert');
}

console.log('3. an answer anywhere in the group silences the call');
{
  const appts = [
    { id: 10, clientId: 1, status: 'confirmed', datetime: '2026-09-02T09:00' },
    { id: 11, clientId: 1, status: 'confirmed', datetime: '2026-09-02T10:00', waAns: { v: 'confirm', at: 1 } },
  ];
  is(scan(appts, cls, {}, NOW).length, 0, 'she tapped Onaylıyorum on WhatsApp — ringing her again is pestering');
}

console.log('4. a completed booking means she is standing in the salon');
{
  const appts = [
    { id: 10, clientId: 1, status: 'completed', datetime: '2026-09-02T08:00' },
    { id: 11, clientId: 1, status: 'confirmed', datetime: '2026-09-02T09:00' },
  ];
  is(scan(appts, cls, {}, NOW).length, 0, 'no call for a customer already here');
}

console.log('5. desk answers and snoozes');
{
  const appts = [{ id: 10, clientId: 1, status: 'confirmed', datetime: '2026-09-02T09:00' }];
  const K = 'p905338669933|2026-09-02';
  is(scan(appts, cls, { [K]: { s: 'ok', at: 1 } }, NOW).length, 0, 'Geliyor at the desk → done for the day');
  is(scan(appts, cls, { [K]: { s: 'no', at: 1 } }, NOW).length, 0, 'Gelemiyor → done (the amber flow owns it now)');
  is(scan(appts, cls, { [K]: { s: 'zzz', until: NOW + 60000 } }, NOW).length, 0, 'snoozed → quiet');
  is(scan(appts, cls, { [K]: { s: 'zzz', until: NOW - 1 } }, NOW).length, 1, 'snooze expired → it comes back');
}

console.log('6. who never gets rung');
{
  is(scan([{ id: 10, clientId: 3, status: 'confirmed', datetime: '2026-09-02T09:00' }], cls, {}, NOW).length, 0,
     'KAPALI — Personel is a door, not a customer');
  is(scan([{ id: 10, clientId: 1, status: 'cancelled', datetime: '2026-09-02T09:00' }], cls, {}, NOW).length, 0,
     'a cancelled booking rings nobody');
  const due = scan([
    { id: 10, clientId: 1, status: 'cancelled', datetime: '2026-09-02T08:30' },
    { id: 11, clientId: 1, status: 'confirmed', datetime: '2026-09-02T09:00' },
  ], cls, {}, NOW);
  is(due.length === 1 && due[0].carrier.id, 11, 'a cancelled first hands the alert to what is now first');
}

console.log('7. the alert is RECEPTION\'s screen only — role gate fails closed');
{
  const role = v => vm.runInContext(
    v === null ? 'localStorage.removeItem("rdns_msg_role"); rdCallRoleOk()'
               : 'localStorage.setItem("rdns_msg_role",' + JSON.stringify(v) + '); rdCallRoleOk()', ctx);
  is(role('reception'), true, 'reception → shown');
  is(role('owner'), false, 'owner → NEVER shown');
  is(role(null), false, 'no role set → doubt → not shown');
  is(role('Reception'), false, 'anything not exactly "reception" → not shown');
  // localStorage itself throwing (private mode, blocked storage) → not shown
  const broken = { localStorage: { getItem: () => { throw new Error('blocked'); } }, console: ctx.console, Date, JSON, String };
  vm.createContext(broken);
  vm.runInContext(caSlice.replace(/^[\s\S]*?function rdCallRoleOk/, 'function rdCallRoleOk'), broken);
  is(vm.runInContext('rdCallRoleOk()', broken), false, 'unreadable storage → doubt → not shown');
}

console.log('8. role=owner never RENDERS — the real rdCallTick, pinned');
{
  const tickSrc = html.match(/function rdCallTick\(\)\{[\s\S]*?\n\}/);
  if (!tickSrc) { fail++; console.log('  ✗ rdCallTick not found in index.html'); }
  else {
    // A customer genuinely due right now, so only the role gate can stop it.
    const p = n => String(n).padStart(2, '0');
    const soon = new Date(Date.now() + 30 * 60000);
    const dt = soon.getFullYear() + '-' + p(soon.getMonth() + 1) + '-' + p(soon.getDate()) + 'T' + p(soon.getHours()) + ':' + p(soon.getMinutes());
    ctx.appointments = [{ id: 10, clientId: 1, status: 'confirmed', datetime: dt }];
    ctx.clients = cls;
    const ov = { style: { display: 'flex' } };                       // an overlay already up
    ctx.document = { getElementById: id => (id === 'rdca-ov' ? ov : null) };
    vm.runInContext(
      'var _rdCallDue=[],_rdCallIx=0,_renders=0; function rdCallRender(){_renders++;}\n' + tickSrc[0], ctx);

    vm.runInContext('localStorage.setItem("rdns_msg_role","owner")', ctx);
    vm.runInContext('rdCallTick()', ctx);
    is(vm.runInContext('_renders', ctx), 0, 'owner + a due customer → rdCallRender is never called');
    is(ov.style.display, 'none', 'and an overlay somehow already up is taken DOWN');

    vm.runInContext('localStorage.removeItem("rdns_msg_role")', ctx);
    vm.runInContext('rdCallTick()', ctx);
    is(vm.runInContext('_renders', ctx), 0, 'no role → still never rendered');

    vm.runInContext('localStorage.setItem("rdns_msg_role","reception"); rdCallTick()', ctx);
    is(vm.runInContext('_renders', ctx), 1, 'reception with the same due customer → rendered, unchanged');
  }
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
