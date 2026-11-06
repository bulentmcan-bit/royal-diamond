// ═══════════════════════════════════════════════════════════════════════════
// 💰 KASAYA YAZ — the missing till line, repaired (6 Kasım 2026).
//
// A completed appointment whose money never reached the till. Named cases:
// 28 Ağustos ₺1.700 · 2 Kasım ZEHRA UZMANER · 3 Kasım ABEER NASSOUR ₺2.500.
// Each leaves a negative Fark that nothing on the screen could close. The
// badge said "complete the till by hand" and there was no by-hand that did
// not break something else: Geçmiş Gün Girişi overwrites the whole day with
// flat totals, and ✏ Fiyat writes nothing because the appointment still
// carries _takingsAmount — the stamp saying the money already went.
//
// The stamp is the lie. The till is the truth. These tests run the REAL
// ccWriteMissingTill against the REAL diAutoAdd.
//
// Run:  node tests/kasaya-yaz.test.js
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
function slice(startMark, endMark) {
  const a = html.indexOf(startMark);
  const b = html.indexOf(endMark, a);
  if (a < 0 || b <= a) { console.error('could not slice ' + startMark); process.exit(1); }
  return html.slice(a, b);
}
const src = slice('function diAutoAdd(staffName, amount, datetime, apptId){', '\nfunction diAutoRemove')
          + '\n' + slice('function ccTillLineFor(apptId, day){', '\n// ── Manual cash-up override');

const TODAY = '2026-11-06';
function build(opts) {
  opts = opts || {};
  const appt = Object.assign({
    id: 99, clientId: 7, staff: 'Emma', status: 'completed',
    datetime: '2026-11-03T16:00', price: 2500, _takingsAmount: 2500
  }, opts.appt || {});
  // Emma's real 3 Kasım: seven itemised lines adding to ₺15.100
  const seven = [1700, 2700, 2500, 1700, 2900, 1900, 1700].map((amt, i) =>
    ({ service: 'müşteri ' + i + ' — Dolgu (Infill)', amount: amt, apptId: 1000 + i, backdated: true }));
  const state = {
    operators: [{ name: 'Emma', entries: [] }],
    history: [{ date: '2026-11-03', ops: [{ name: 'Emma', total: 15100, count: 7, entries: seven.concat(opts.existing || []) }], total: 15100 }]
  };
  const calls = { saved: 0, toasts: [], pm: [], confirms: 0, rendered: 0 };
  const ctx = {
    console, appointments: [appt], dtState: state,
    dtDateKey: () => TODAY,
    dtLocal: d => new Date(d).toISOString().slice(0, 16),
    dtOpTotal: o => (o.entries || []).reduce((s, e) => s + (e.amount || 0), 0),
    commPausedOn: () => false,
    cName: () => 'ABEER NASSOUR',
    rdIsBlocker: () => !!opts.blocker,
    dtSaveState: () => { calls.saved++; },
    dtRender: () => {}, renderDashTakings: () => {}, renderCashCheck: () => { calls.rendered++; },
    apptTouch: () => {}, saveAll: () => { calls.saved++; },
    pmAsk: e => calls.pm.push(e),
    toast: (i, t, s2) => calls.toasts.push(t),
    confirm: () => { calls.confirms++; return opts.decline ? false : true; }
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.api={ccWriteMissingTill,ccTillLineFor,diAutoAdd};', ctx);
  return { ctx, appt, state, calls };
}

console.log('1. the repair');
{
  const { ctx, appt, state, calls } = build();
  const emma = state.history[0].ops[0];
  is(emma.total, 15100, 'before: Emma’s 3 Kasım till is ₺15.100');
  ctx.api.ccWriteMissingTill(99);
  is(emma.total, 17600, 'after: ₺17.600 — exactly her appointments');
  is(state.history[0].total, 17600, 'and the day’s own total is re-summed, not left behind');
  const line = emma.entries[emma.entries.length - 1];
  is([line.amount, String(line.apptId), line.backdated], [2500, '99', true],
     'the line carries the amount, the appointment id and the backdated mark');
  ok(/ABEER NASSOUR/.test(line.service), '…and names the customer, so the row is readable');
  is(appt._takingsAmount, 2500, 'the stamp is set again — truthfully this time');
  is(calls.pm.length, 1, 'it asks how the money was taken');
  is(calls.pm[0], line, '…about the line it just wrote');
  ok(calls.saved > 0, 'and saves');
}

console.log('2. it writes once, and only once');
{
  const { ctx, state, calls } = build({ existing: [{ service: 'ABEER NASSOUR — Medikal Pedikür', amount: 2500, apptId: 99 }] });
  const emma = state.history[0].ops[0];
  const before = emma.entries.length;
  ctx.api.ccWriteMissingTill(99);
  is(emma.entries.length, before, 'a line with this appointment’s id already exists → nothing written');
  is(calls.confirms, 0, '…and it does not even ask');
  ok(/Zaten kasada/.test(calls.toasts.join('|')), 'it says so plainly');
}
{
  const { ctx, state } = build();
  ctx.api.ccWriteMissingTill(99);
  ctx.api.ccWriteMissingTill(99);
  is(state.history[0].ops[0].total, 17600, 'pressed twice → still ₺17.600, never ₺20.100');
}

console.log('3. it refuses what it should');
{
  const { ctx, state, calls } = build({ decline: true });
  is(state.history[0].ops[0].entries.length, 7, 'İptal on the confirmation → nothing written');
  ctx.api.ccWriteMissingTill(99);
  is(state.history[0].ops[0].entries.length, 7, '…still nothing');
  is(calls.confirms, 1, 'but it did ask first');
}
{
  const { ctx, state, calls } = build({ appt: { status: 'confirmed' } });
  ctx.api.ccWriteMissingTill(99);
  is(state.history[0].ops[0].entries.length, 7, 'an appointment that was never checked out → no');
  ok(/Çıkışı yapılmamış/.test(calls.toasts.join('|')), '…and it says why');
}
{
  const { ctx, state, calls } = build({ appt: { price: 0 } });
  ctx.api.ccWriteMissingTill(99);
  is(state.history[0].ops[0].entries.length, 7, 'no price → nothing to write');
  ok(/Tutar yok/.test(calls.toasts.join('|')), '…and it says why');
}
{
  const { ctx, state, calls } = build({ appt: { staff: '' } });
  ctx.api.ccWriteMissingTill(99);
  is(state.history[0].ops[0].entries.length, 7, 'no technician → no');
}
{
  const { ctx, state, calls } = build({ blocker: true });
  ctx.api.ccWriteMissingTill(99);
  is(state.history[0].ops[0].entries.length, 7, 'a KAPALI slot-blocker is not a customer — money never touches it');
  ok(/KAPALI/.test(calls.toasts.join('|')), '…and it says so');
}
{
  const { ctx, calls } = build();
  ctx.api.ccWriteMissingTill(12345);
  ok(/bulunamadı/.test(calls.toasts.join('|')), 'an appointment that is not there is not a crash');
}

console.log('4. today goes to today’s till, not the archive');
{
  const { ctx, state } = build({ appt: { datetime: TODAY + 'T11:00', _takingsAmount: 1700, price: 1700 } });
  ctx.api.ccWriteMissingTill(99);
  const live = state.operators[0];
  is([live.entries.length, live.entries[0] && live.entries[0].amount], [1, 1700],
     'a line written today lands on the live operator card');
  is(state.history[0].ops[0].entries.length, 7, '…and the archive is untouched — still its own seven');
}

console.log('5. the button on the row');
ok(/onclick="ccWriteMissingTill\('\+r\.apptId\+'\)"/.test(html), 'the row calls it with the appointment id');
ok(/\(r\.noTill&&r\.apptId!=null\)/.test(html), 'and only shows on a row flagged ⚠️ Kasa kaydı yok');
{
  const btn = html.slice(html.indexOf('// 💰 Kasaya yaz is the one action'), html.indexOf('// An archived row is a read-only copy'));
  ok(btn.indexOf('r.archived') < 0, 'it is NOT hidden on an archived day — that is where the fault lives');
}
ok(html.indexOf('function ccWriteMissingTill') > 0 && html.indexOf('a._takingsAmount=0;') > 0,
   'the false stamp is cleared before the write, or diAutoAdd would skip it');

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ all ') + pass + ' passed');
process.exit(fail ? 1 : 0);
