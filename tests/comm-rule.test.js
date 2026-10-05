// ═══════════════════════════════════════════════════════════════════════════
// The commission rule (5 Oct 2026): a scheme technician earns commission on a
// job only if the Crown Board gave it a crown (started on time, long press
// inside 60 min) AND checkout said 😊 Memnun.
// Runs the REAL code sliced out of index.html (DED_RATES … dedNoCommByTech).
//
// Run:  node tests/comm-rule.test.js
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

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const from = html.indexOf('const DED_RATES = ');
const to = html.indexOf('// The record the technician is entitled to see');
const src = html.slice(from, to);
const ctx = { console, window: {}, appointments: [], dedState: { items: [] }, setInterval: () => 0 };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.api={commVerdict,dedItemsForMonth,dedNoCommByTech,commReasonShort,commProofShort};', ctx);
const { commVerdict, dedItemsForMonth, dedNoCommByTech, commReasonShort, commProofShort } = ctx.api;
const at = (hm) => new Date('2026-10-06T' + hm).getTime();

const T = (hm, d) => new Date((d||'2026-10-06') + 'T' + hm).getTime();
const sess = (id, hm, crown, extra) => Object.assign({ id, operator: 'Lissa', startAt: T(hm), crown, elapsedMin: crown ? 50 : 75 }, extra || {});
function run(appts, sessions, ops) {
  ctx.appointments = appts;
  vm.runInContext('commSessions = __s; commOps = __o; commSessionsLoaded = true;', Object.assign(ctx, { __s: sessions, __o: ops || {} }));
}

console.log('1. verdicts');
const base = { id: 1, staff: 'Lissa', status: 'completed', datetime: '2026-10-06T10:00', price: 1000, sat: 'happy' };
run([base], [sess('s1', '10:03', true)]);
is(commVerdict(base), null, 'started on time, crown, happy → commission');
run([base], [sess('s1', '10:03', false)]);
is(commVerdict(base), 'nocrown', 'no long press inside 60 min → no commission');
run([base], [sess('s1', '10:25', true)]);
is(commVerdict(base), 'latestart', 'started 25 min after booking → no commission');
run([base], []);
is(commVerdict(base), 'nostart', 'never started on the Crown Board → no commission');
run([base], [], { lissa: { current: { startAt: T('10:02') } } });
is(commVerdict(base), null, 'job still running on the board → not judged yet');
run([base], [sess('s1', '10:00', false, { noPress: true })]);
is(commVerdict(base), 'nostart', 'filed as "no press" → no commission');
run([{ ...base, sat: 'unhappy' }], [sess('s1', '10:00', true)]);
is(commVerdict(ctx.appointments[0]), 'unsat', 'unhappy → no commission');
run([{ ...base, sat: 'not_asked' }], [sess('s1', '10:00', true)]);
is(commVerdict(ctx.appointments[0]), 'notasked', 'Sormadım → no commission');
run([{ ...base, datetime: '2026-10-04T10:00' }], []);
is(commVerdict(ctx.appointments[0]), null, 'before the rule → untouched');
run([{ ...base, staff: 'Beyhan' }], []);
is(commVerdict(ctx.appointments[0]), null, 'off-scheme technician → untouched');
vm.runInContext('commSessionsLoaded = false;', ctx);
ctx.appointments = [base];
is(commVerdict(base), null, 'board data not loaded yet → nobody loses anything');

run([{ ...base, datetime: '2026-10-05T10:00' }], []);
is(commVerdict(ctx.appointments[0]), null, '5 Oct, no board record → not penalised (rule went live that morning)');
run([{ ...base, datetime: '2026-10-05T10:00', sat: 'not_asked' }], [sess('s1', '10:01', true, { startAt: T('10:01', '2026-10-05') })]);
is(commVerdict(ctx.appointments[0]), null, '5 Oct, Sormadım → not penalised');
run([{ ...base, datetime: '2026-10-05T10:00' }], [sess('s1', '10:20', true, { startAt: T('10:20', '2026-10-05') })]);
is(commVerdict(ctx.appointments[0]), 'latestart', '5 Oct, real late start on the board → penalised');

console.log('1b. the reason on the card carries the board times');
run([base], [sess('s1', '10:25', true)]);
is(commReasonShort(base), '10:25 başladı (25 dk geç)', 'late start shows when she started');
run([base], [Object.assign(sess('s1', '10:02', false), { endAt: T('11:17'), elapsedMin: 75, limitMin: 60 })]);
is(commReasonShort(base), '10:02–11:17 · 75 dk (sınır 60)', 'no crown shows start, finish and minutes');
run([base], []);
is(commReasonShort(base), 'Crown Board\u2019da başlatılmadı', 'never started says so');

run([base], [Object.assign(sess('s1', '10:02', true), { endAt: T('10:55'), elapsedMin: 53 })]);
is(commProofShort(base), '👑 10:02–10:55 · 53 dk · 😊', 'an earned job shows its crown times and the smile');

console.log('2. two jobs in a row pair up in order');
const a1 = { ...base, id: 1 }, a2 = { ...base, id: 2, datetime: '2026-10-06T11:00' };
run([a1, a2], [sess('s1', '10:01', true), sess('s2', '11:02', false)]);
is([commVerdict(a1), commVerdict(a2)], [null, 'nocrown'], '10:00 gets the 10:01 crown, 11:00 gets the 11:02 sad face');

console.log('3. it reaches the commission maths');
run([a1, a2], [sess('s1', '10:01', true), sess('s2', '11:02', false)]);
is(dedItemsForMonth('2026-10').map(x => x.type), ['nocrown'], 'one auto record, for the job with no crown');
is(dedNoCommByTech('2026-10'), { Lissa: 1000 }, 'its ₺1000 is out of her commission base');
ctx.dedState.items.push({ id: 'm1', apptId: 2, tech: 'Lissa', type: 'late', date: '2026-10-06', amount: 1000 });
is(dedItemsForMonth('2026-10').length, 1, 'marked by hand too → counted once');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
