// ═══════════════════════════════════════════════════════════════════════════
// The commission rule (5 Oct 2026): a scheme technician earns commission on a
// job only if ▶ Başladı was tapped on time AND checkout said 😊 Memnun.
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
const ctx = { console, window: {}, appointments: [], dedState: { items: [] } };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.api={commVerdict,dedItemsForMonth,dedNoCommByTech};', ctx);
const { commVerdict, dedItemsForMonth, dedNoCommByTech } = ctx.api;
const at = (hm) => new Date('2026-10-06T' + hm).getTime();

console.log('1. verdicts');
const base = { id: 1, staff: 'Lissa', status: 'completed', datetime: '2026-10-06T10:00', price: 1000 };
is(commVerdict({ ...base, startedAt: at('10:05'), sat: 'happy' }), null, 'on time + happy → commission');
is(commVerdict({ ...base, startedAt: at('10:10'), sat: 'happy' }), null, 'exactly 10 min → still on time');
is(commVerdict({ ...base, startedAt: at('10:25'), sat: 'happy' }), 'late', '25 min late → no commission');
is(commVerdict({ ...base, startedAt: at('10:00'), sat: 'unhappy' }), 'unsat', 'unhappy → no commission');
is(commVerdict({ ...base, sat: 'happy' }), 'nostart', 'never tapped ▶ → no commission');
is(commVerdict({ ...base, startedAt: at('10:00'), sat: 'not_asked' }), 'notasked', 'Sormadım → no commission');
is(commVerdict({ ...base, datetime: '2026-10-05T10:00', sat: 'happy' }), null, 'no tap on the 5th is not held against her');
is(commVerdict({ ...base, datetime: '2026-10-04T10:00', sat: 'unhappy' }), null, 'before the rule → untouched');
is(commVerdict({ ...base, staff: 'Beyhan', sat: 'unhappy' }), null, 'off-scheme technician → untouched');
is(commVerdict({ ...base, status: 'confirmed' }), null, 'not finished → no verdict yet');

console.log('2. it reaches the commission maths');
ctx.appointments.push({ ...base, id: 7, startedAt: at('10:30'), sat: 'happy' });
ctx.appointments.push({ ...base, id: 8, startedAt: at('11:00'), datetime: '2026-10-06T11:00', sat: 'happy' });
is(dedItemsForMonth('2026-10').map(x => x.type), ['late'], 'one auto record, for the late job');
is(dedNoCommByTech('2026-10'), { Lissa: 1000 }, 'its ₺1000 is out of her commission base');
ctx.dedState.items.push({ id: 'm1', apptId: 7, tech: 'Lissa', type: 'late', date: '2026-10-06', amount: 1000 });
is(dedItemsForMonth('2026-10').length, 1, 'marked by hand too → counted once');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
