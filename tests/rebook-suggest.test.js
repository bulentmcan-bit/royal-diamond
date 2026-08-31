// ═══════════════════════════════════════════════════════════════════════════
// The suggested day — the REAL rbSuggestSource + rbTargetFrom sliced out of
// index.html, now that the 3/4 hafta shortcut buttons are gone and the rhythm
// only shows as the gold "önerilen" day in the calendar. It proves:
//   1. two completed same-service visits under 25 days apart → 3 weeks
//   2. 25+ days apart → 4 weeks
//   3. a different service does not count toward the rhythm
//   4. a suggested day landing on Sunday shifts to the Saturday BEFORE
//
// Run:  node tests/rebook-suggest.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const START = 'function rbSuggestSource(a){';
const i0 = html.indexOf(START);
const END = 'function rdCkGate(){';
const i1 = html.indexOf(END, i0);
if (i0 < 0 || i1 <= i0) { console.error('✗ marker not found — rbSuggestSource/rdCkGate moved'); process.exit(1); }
// rbTargetFrom walks closed days through the REAL rdIsClosedDay (closed-day
// work, Aug 2026) — pull it in too, with the CROWN config it consults absent
// so its Sunday fallback answers, same as a page where crown-config failed.
const closedFn = html.match(/function rdIsClosedDay\(d\)\{[\s\S]*?\n  \}/);
if (!closedFn) { console.error('✗ rdIsClosedDay not found'); process.exit(1); }
const slice = closedFn[0] + '\n' + html.slice(i0, i1);

const ctx = {
  appointments: [],
  // same shape as index.html's own dtLocal
  dtLocal(d) { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); },
  Date, Math, String, Number, JSON,
};
vm.createContext(ctx);
vm.runInContext(slice + '\n;__api={suggest:rbSuggestSource,target:rbTargetFrom};', ctx, { filename: 'suggest.js' });
const api = ctx.__api;

let fails = 0;
function ok(cond, label) { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) fails++; }

function visit(clientId, service, iso) { return { status: 'completed', clientId, service, datetime: iso }; }
const a = { clientId: 'c1', service: 'Manikür', datetime: '2026-08-27T14:00' };

// 1 — a 21-day rhythm stays a 3-week girl
ctx.appointments = [visit('c1', 'Manikür', '2026-08-27T14:00'), visit('c1', 'Manikür', '2026-08-06T14:00')];
ok(api.suggest(a) === '3w', '21-day gap suggests three weeks');

// 2 — 25+ days apart → four weeks
ctx.appointments = [visit('c1', 'Manikür', '2026-08-27T14:00'), visit('c1', 'Manikür', '2026-08-01T14:00')];
ok(api.suggest(a) === '4w', '26-day gap suggests four weeks');

// 3 — a different service does not count
ctx.appointments = [visit('c1', 'Manikür', '2026-08-27T14:00'), visit('c1', 'Pedikür', '2026-08-01T14:00')];
ok(api.suggest(a) === '3w', 'a different service leaves her on three weeks');

// 4 — Sunday shifts back to the Saturday before
// 2026-08-30 is a Sunday: 27 Aug (Thu) + 3 days lands on it.
ok(api.target({ datetime: '2026-08-27T14:00' }, 3) === '2026-08-29', 'a Sunday target becomes the Saturday before');
ok(api.target({ datetime: '2026-08-27T14:00' }, 21) === '2026-09-17', 'an ordinary target is day + N, untouched');

console.log('');
if (fails) { console.error(fails + ' FAILED'); process.exit(1); }
console.log('all rebook suggest tests passed');
