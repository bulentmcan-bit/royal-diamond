// ═══════════════════════════════════════════════════════════════════════════
// ⏱ THE 2.7-SECOND REDRAW (7 Kasım 2026).
//
// Measured on the salon's own machines, from the health panel on their own
// screens:
//     reception (Toshiba):  renderDash 14 kez ·  37.684 ms  → 2.692 ms each
//     owner (Zenbook):      renderDash 31 kez ·   9.127 ms  →   294 ms each
//
// Thirty-seven seconds of frozen till in a few minutes at reception. That is
// the whole of "dead slow" and "not following commands".
//
// It is NOT the code. With the salon's full load — 3.565 appointments, 879
// customers, 1.400 Crown Board sessions — renderDash runs in 59 ms on a
// healthy machine, and the commission arithmetic inside it is 25 of those.
// What costs seconds is the BROWSER laying out and painting ~4.300 elements
// after renderDash rewrites the whole dashboard. No amount of tidier
// JavaScript changes that.
//
// So: stop asking for the redraw when the picture has not changed. Five calls
// a minute, almost all of them showing the same thing.
//
// Run:  node tests/dash-cizim.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function is(got, want, label) {
  const okk = JSON.stringify(got) === JSON.stringify(want);
  if (okk) pass++; else fail++;
  console.log((okk ? '  ✓ ' : '  ✗ ') + label + (okk ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
}
const ok = (c, l) => is(!!c, true, l);
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// the real signature function, run on its own
const from = html.indexOf('function rdDashSignature(){');
const to = html.indexOf('function rdDashForce(){');
if (from < 0 || to <= from) { console.error('could not slice rdDashSignature'); process.exit(1); }

function sigWith(state) {
  // Date is shared with the context: the state is built out here, and a
  // vm realm has its own Date, so `instanceof Date` in the signature would
  // fail open on a perfectly good day (null, never a string). The browser is
  // one realm; the test must be too.
  const ctx = Object.assign({
    console, Date,
    dtLocal: d => new Date(d).toISOString().slice(0, 16),
    cObj: id => (ctx.clients || []).find(c => String(c.id) === String(id)) || null,
    currentPage: 'dashboard', commSessions: [], dtState: { operators: [] },
    appointments: [], clients: []
  }, state);
  vm.createContext(ctx);
  vm.runInContext(html.slice(from, to) + '\nthis.sig = rdDashSignature();', ctx);
  return ctx.sig;
}
const DAY = new Date('2026-11-07T12:00:00');
const base = () => ({
  dashGridDate: DAY,
  clients: [{ id: 'c1', name: 'AYŞE', phone: '905330000000' }],
  appointments: [{ id: 'a1', clientId: 'c1', staff: 'Helen', service: 'Dolgu (Infill)',
    datetime: '2026-11-07T10:00', status: 'confirmed', price: 1700 }]
});

console.log('1. the same picture gives the same signature');
is(sigWith(base()), sigWith(base()), 'nothing changed → identical, so the redraw is skipped');

console.log('2. anything the screen SHOWS changes it');
const diff = (mut, label) => { const s = base(); mut(s); ok(sigWith(s) !== sigWith(base()), label); };
diff(s => s.appointments[0].status = 'completed', 'a card going to ✓ Completed');
diff(s => s.appointments[0].price = 2500, 'its price');
diff(s => s.appointments[0].sat = 'happy', 'the Memnun answer');
diff(s => s.appointments[0].staff = 'Lissa', 'moving it to another technician');
diff(s => s.appointments[0].datetime = '2026-11-07T15:00', 'moving its hour');
diff(s => s.appointments[0].service = 'Pedikür', 'changing the service');
diff(s => s.appointments[0].noShow = true, 'marking a no-show');
diff(s => s.appointments[0]._takingsAmount = 1700, 'money reaching the till');
diff(s => s.appointments[0].wa = { n: 123 }, 'the reminder going out');
diff(s => s.clients[0].name = 'AYŞE HANIM', 'correcting the customer’s NAME — it is on the card');
diff(s => s.clients[0].phone = '905339999999', '…and her number');
diff(s => s.clients.push({ id: 'c2', name: 'YENİ' }), 'a new customer (the birthday banner)');
diff(s => s.appointments.push({ id: 'a2', clientId: 'c1', datetime: '2026-12-01T10:00', status: 'confirmed' }),
     'a new booking, even on another day');
diff(s => s.dashGridDate = new Date('2026-11-06T12:00:00'), 'moving the diary to another day');
diff(s => s.dtState = { operators: [{ name: 'Helen', entries: [{ amount: 1700 }] }] }, 'a till line');
diff(s => s.commSessions = [{ id: 's1' }], 'a Crown Board job starting');

console.log('3. what it deliberately ignores');
{
  // The grid shows ONE day. Correcting the price of a job three weeks ago
  // changes nothing on that screen, so it must not force a 2.7-second redraw.
  // If money moved, dtState changes and the signature moves with it anyway.
  const s = base();
  s.appointments.push({ id: 'a9', clientId: 'c1', staff: 'Helen', datetime: '2026-10-01T10:00',
    status: 'completed', price: 1700 });
  const t = base();
  t.appointments.push({ id: 'a9', clientId: 'c1', staff: 'Helen', datetime: '2026-10-01T10:00',
    status: 'completed', price: 9999 });
  is(sigWith(s), sigWith(t), 'a price corrected on a day the grid is not showing → no redraw');
}

console.log('4. it fails open — a stale screen is worse than a slow one');
{
  const ctx = { console };   // nothing defined at all
  vm.createContext(ctx);
  vm.runInContext(html.slice(from, to) + '\nthis.sig = rdDashSignature();', ctx);
  is(ctx.sig, null, 'nothing defined → null, never a string that might match');
}
{
  const s = base(); delete s.dashGridDate;
  is(sigWith(s), null, 'no day on the grid → null, so it redraws rather than freeze');
}
{
  const s = base(); s.appointments = undefined;
  is(sigWith(s), null, 'no book → null for the same reason');
}
ok(/if\(_sig !== null && _sig === _rdDashSig\) return;/.test(html),
   '…and null never matches, so the dashboard redraws');
ok(/function rdDashForce\(\)\{ _rdDashSig = null; renderDash\(\); \}/.test(html),
   'and there is a force path for when something must be redrawn regardless');
{
  const r = html.slice(html.indexOf('function renderDash(){'), html.indexOf('function renderDash(){') + 400);
  ok(r.indexOf('_rdDashSig = _sig;') < r.indexOf('applyPriceOverrides'),
     'the signature is stored BEFORE the work, so a throw cannot wedge it');
}

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ all ') + pass + ' passed');
process.exit(fail ? 1 : 0);
