// ═══════════════════════════════════════════════════════════════════════════
// The fill-call list's distance rule — crown-config.js `fillMinDaysAhead` and
// the reader in index.html that the candidate loop starts from. Moving a
// customer up by a day or two adds no booking: it relocates one and opens a
// fresh gap with no time to re-sell it. It proves:
//   1. the setting is 3 whole days
//   2. fclMinAhead() reads it, floors it, and answers 3 without a config or
//      with a nonsense value — never 0 or 1, which would suggest tomorrow
//   3. the candidate loop starts at that distance and skips a customer who
//      has two bookings on the same day
//
// Run:  node tests/fill-call.test.js
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
  const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx.window.CROWN;
}
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

console.log('1. the setting');
{
  is(loadCrown().fillMinDaysAhead, 3, 'fillMinDaysAhead is 3 whole days');
}

console.log('2. the reader');
{
  const m = html.match(/function fclMinAhead\(\)\{[\s\S]*?\n  \}/);
  if (!m) { fail++; console.log('  ✗ fclMinAhead not found'); }
  else {
    // In a page window.CROWN is also the global CROWN; give the context both.
    const run = crown => { const c = crown === undefined ? { window: {} } : { window: { CROWN: crown }, CROWN: crown }; vm.createContext(c); return vm.runInContext(m[0] + ';fclMinAhead()', c); };
    is(run(loadCrown()), 3, 'from crown-config: 3');
    is(run(undefined), 3, 'no config yet: 3, never tomorrow');
    is(run({ fillMinDaysAhead: 5 }), 5, 'a different number in the one place is read');
    is(run({ fillMinDaysAhead: 2.7 }), 2, 'whole days — floored');
    is(run({ fillMinDaysAhead: 0 }), 3, '0 would suggest today\'s own bookings — refused, back to 3');
    is(run({ fillMinDaysAhead: 'x' }), 3, 'nonsense falls back to 3');
  }
}

console.log('3. the candidate loop');
{
  const a = html.indexOf('// ── o güne çekilebilecek randevular (sonraki günlerden)');
  const b = html.indexOf('// Bugünün temas durumu', a);
  if (a < 0 || b < 0) { fail++; console.log('  ✗ candidate loop not found'); }
  else {
    const loop = html.slice(a, b);
    is(/for\(var i=minAhead; i<=Math\.max\(FCL_SOURCE, minAhead\); i\+\+\)/.test(loop), true, 'the loop starts fclMinAhead() days out, never at tomorrow');
    is(/perClient\[String\(a\.clientId\)\] > 1\) return;/.test(loop), true, 'a customer with two bookings that day is skipped — her visit is never split');
    // Run the loop's selection against a small diary: gap day 11 Eylül.
    const ctx = {
      window: { CROWN: loadCrown() }, used: {}, base: new Date(2026, 8, 11, 12), win: {}, dayTechs: ['Helen', 'Lissa'],
      appts: [
        { id: 1, clientId: 1, staff: 'Helen', status: 'confirmed', datetime: '2026-09-12T10:00', duration: 60 },   // 1 day out
        { id: 2, clientId: 2, staff: 'Helen', status: 'confirmed', datetime: '2026-09-13T10:00', duration: 60 },   // 2 days out
        { id: 3, clientId: 3, staff: 'Helen', status: 'confirmed', datetime: '2026-09-14T10:00', duration: 60 },   // 3 days out
        { id: 4, clientId: 4, staff: 'Helen', status: 'confirmed', datetime: '2026-09-14T09:00', duration: 60 },   // Claire, twice that day
        { id: 5, clientId: 4, staff: 'Helen', status: 'confirmed', datetime: '2026-09-14T11:00', duration: 60 },
        { id: 6, clientId: 5, staff: 'Lissa', status: 'confirmed', datetime: '2026-09-15T10:00', duration: 60 } ], // 4 days out
      clis: [1, 2, 3, 4, 5].map(id => ({ id, name: 'C' + id, phone: '0533' })),
    };
    ctx.FCL_SOURCE = 4;
    ctx._appts = () => ctx.appts; ctx._clis = () => ctx.clis;
    ctx.key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    ctx.apptKey = a => String(a.id); ctx.techOf = a => a.staff; ctx.durOf = () => 60;
    ctx.fits = () => '10:00';   // every day has room — only the distance and the split rules decide
    ctx.fclMinAhead = () => ctx.window.CROWN.fillMinDaysAhead;
    vm.createContext(ctx);
    vm.runInContext(loop + ';__ids=cands.map(function(x){ return x.a.id; });', ctx);
    is(ctx.__ids, [3, 6], 'only the 3-day and 4-day customers are offered: not tomorrow, not the day after, and not Claire');
  }
}

console.log(fail ? `\n✗ ${fail} failed, ${pass} passed` : `\n✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
