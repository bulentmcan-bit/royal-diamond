// ═══════════════════════════════════════════════════════════════════════════
// Kasa Kontrol's past-day arithmetic — the REAL code sliced out of index.html
// (KK-SLICE: ccPastDayTotals / ccFlagNoTill / dtOpTotal, and DI-SLICE:
// diAutoAdd / diAutoRemove), not a re-implementation.
//
// The day this reproduces: 28 August 2026, Hannah.
//   - the archive's entries for her sum to ₺9,300 (a duplicate ₺1,600 was
//     removed by hand)
//   - the archive's stored scalar still says ₺12,600 — the old till total
//     ₺10,900 (with the duplicate) plus a backdated ₺1,700 that raised the
//     scalar without writing any entry
//   - the page kept showing Kasa ₺12,600 through every refresh and force-pull
//
//   1. Kasa for that day = the sum of that day's till entries for that
//      operator, NOTHING else — the stale ₺12,600 scalar is never read
//   2. a legacy day with no per-entry detail still reads its scalar (there is
//      nothing better), and an op with an empty entries list reads 0
//   3. GAMZE TULUM ₺1,700: completed, _takingsAmount set, no till entry —
//      her row is flagged noTill, a matched row is not, and a detail-less
//      legacy day flags nothing (it cannot tell)
//   4. the root cause: a backdated diAutoAdd now writes a REAL entry and the
//      scalar is recomputed from the entries, so the two can never drift;
//      diAutoRemove takes the entry back out the same way
//
// Run:  node tests/kasa-kontrol.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function sliceOf(start, end) {
  const i0 = html.indexOf(start), i1 = html.indexOf(end);
  if (i0 < 0 || i1 <= i0) { console.error('✗ markers not found:', start); process.exit(1); }
  return html.slice(i0, i1);
}
const kk = sliceOf('// KK-SLICE-START', '// KK-SLICE-END');
const di = sliceOf('// DI-SLICE-START', '// DI-SLICE-END');

let pass = 0, fail = 0;
function is(actual, expected, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ✓', what); }
  else { fail++; console.log('  ✗', what, '\n      got     ', a, '\n      expected', e); }
}

function makeCtx(extra) {
  const ctx = Object.assign({
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp,
    dtState: null, appointments: [],
    dtSaveState: () => {}, renderDashTakings: () => {}, dtRender: () => {}, pmAsk: () => {},
    commPausedOn: () => false,
    dtLocal: d => { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); },
    dtDateKey: () => '2026-08-29',
    cName: () => 'GAMZE TULUM',
  }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(kk + '\n' + di, ctx, { filename: 'kasa-slice.js' });
  return ctx;
}

// The archive as it stands after the hand-fix: six entries totalling ₺9,300,
// the scalar still carrying the old wrong ₺12,600.
function hannah28Aug() {
  return {
    date: '2026-08-28',
    ops: [{
      name: 'Hannah',
      total: 12600,           // stale: 10,900 (old till, incl. duplicate) + 1,700 (entry-less backdate)
      count: 8,
      entries: [
        { service: 'Ceyda Kalfaoğlu — Manikür', amount: 1600, time: '13:50', apptId: 1787841190872 },
        { service: 'A', amount: 2000, time: '10:00', apptId: 101 },
        { service: 'B', amount: 1500, time: '11:00', apptId: 102 },
        { service: 'C', amount: 1400, time: '12:00', apptId: 103 },
        { service: 'D', amount: 1300, time: '15:00', apptId: 104 },
        { service: 'E', amount: 1500, time: '16:00', apptId: 105 },
      ],
    }],
    total: 12600,
  };
}

console.log('1. 28 Aug 2026, Hannah — Kasa is the entries, nothing else');
{
  const ctx = makeCtx();
  ctx.hd = hannah28Aug();
  const t = vm.runInContext('ccPastDayTotals(hd)', ctx);
  is(t, { Hannah: 9300 }, 'Kasa ₺9,300 = the six till entries; the stale ₺12,600 scalar is never read');
}

console.log('2. the fallbacks that must stay');
{
  const ctx = makeCtx();
  is(vm.runInContext('ccPastDayTotals({ops:[{name:"Helen",total:4200}]})', ctx),
     { Helen: 4200 }, 'a legacy day with no entry detail reads its scalar');
  is(vm.runInContext('ccPastDayTotals({ops:[{name:"Lissa",total:500,entries:[]}]})', ctx),
     { Lissa: 0 }, 'an op WITH an (empty) entry list reads its entries: 0');
  is(vm.runInContext('ccPastDayTotals(null)', ctx), {}, 'no archive day → empty, no crash');
}

console.log('3. the completed appointment the till never saw');
{
  const ctx = makeCtx();
  ctx.hd = hannah28Aug();
  ctx.rows = [
    { apptId: 1787841190872, amount: 1600, staff: 'Hannah' },   // Ceyda — matched
    { apptId: 1787992352415, amount: 1700, staff: 'Hannah' },   // GAMZE — no till entry anywhere
    { apptId: null, amount: 500, staff: 'Hannah' },             // a walk-in row
  ];
  vm.runInContext('ccFlagNoTill(rows, hd)', ctx);
  is(ctx.rows.map(r => !!r.noTill), [false, true, false],
     'GAMZE ₺1,700 is flagged; the matched row and the walk-in are not');
  const legacy = makeCtx();
  legacy.rows = [{ apptId: 9, amount: 100 }];
  vm.runInContext('ccFlagNoTill(rows, {ops:[{name:"Helen",total:4200}]})', legacy);
  is(!!legacy.rows[0].noTill, false, 'a detail-less legacy day flags nothing — it cannot tell');
}

console.log('4. the root cause: a backdated checkout now leaves a real entry');
{
  const ctx = makeCtx();
  ctx.dtState = { history: [hannah28Aug()] };
  ctx.appointments = [{ id: 1787992352415, clientId: 7, service: 'Protez Tırnak' }];
  vm.runInContext('diAutoAdd("Hannah", 1700, "2026-08-28T15:30", 1787992352415)', ctx);
  const op = ctx.dtState.history[0].ops[0];
  is(op.entries.length, 7, 'the ₺1,700 is a seventh ENTRY, not a scalar bump');
  const e = op.entries[6];
  is([e.amount, e.apptId, e.backdated], [1700, 1787992352415, true], 'carrying amount, apptId and the backdated mark');
  is(e.service, 'GAMZE TULUM — Protez Tırnak', 'labelled from the appointment like a live entry');
  is(op.total, 11000, 'and the scalar is recomputed FROM the entries (9,300 + 1,700) — the stale 12,600 is gone');
  const t = vm.runInContext('ccPastDayTotals(dtState.history[0])', ctx);
  is(t, { Hannah: 11000 }, 'so Kasa and the entries can never disagree again');

  vm.runInContext('diAutoRemove("Hannah", 1700, "2026-08-28T15:30", 1787992352415)', ctx);
  is(op.entries.length, 6, 'undo takes the entry back out');
  is(op.total, 9300, 'and the scalar follows the entries down');
}
{
  const ctx = makeCtx();
  ctx.dtState = { history: [{ date: '2026-08-20', ops: [{ name: 'Helen', total: 4200, count: 3, commission: 0 }], total: 4200 }] };
  vm.runInContext('diAutoAdd("Helen", 500, "2026-08-20T12:00", 55)', ctx);
  is(ctx.dtState.history[0].ops[0].total, 4700, 'a legacy detail-less day still adds to its scalar (nothing better exists)');
}

console.log('5. the one-time archive repair');
{
  const ctx = makeCtx();
  ctx.d = { history: [
    hannah28Aug(),                                                            // stale scalar 12,600, entries 9,300
    { date: '2026-08-20', ops: [{ name: 'Helen', total: 4200, count: 3 }], total: 4200 },  // legacy, no detail
    { date: '2026-08-27', ops: [{ name: 'Lissa', total: 3000, count: 2,
        entries: [{ amount: 2000, apptId: 1 }, { amount: 1000, apptId: 2 }] }], total: 3000 }, // already agrees
  ] };
  const scan = vm.runInContext('rdKasaRepairScan(d)', ctx);
  is(scan, [{ date: '2026-08-28', dayBefore: 12600, ops: [{ name: 'Hannah', before: 12600, after: 9300 }] }],
     'scan reports exactly the drifted day — legacy and agreeing days untouched');
  const changes = vm.runInContext('rdKasaRepairApply(d, 1756400000000)', ctx);
  is(changes[0].dayAfter, 9300, 'apply reports the day total after: ₺9,300');
  is(ctx.d.history[0].ops[0].total, 9300, 'the scalar now equals the entries');
  is(ctx.d.history[0].ops[0].commission, Math.round(9300 * 0.12), 'commission re-based on the true total');
  is(ctx.d.history[0].total, 9300, 'the day total follows');
  is(ctx.d.history[0].ts, 1756400000000, 'ts stamped — the repaired day wins the newest-edit merge everywhere');
  is(ctx.d.history[1].ts, undefined, 'the untouched legacy day is not re-stamped');
  is(vm.runInContext('rdKasaRepairScan(d)', ctx), [], 'a second scan finds nothing — the repair is idempotent');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
