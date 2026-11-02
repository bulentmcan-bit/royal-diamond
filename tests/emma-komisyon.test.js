// ═════════════════════════════════════════════════
// Emma — 40%, no salary, and Helen's 25% keeps its hands off.
//
// 2 Kasım 2026, Bülent: "can we add in as from tomorrow 1 more column for a
// new employee called emma she will not be earning salary she will be on 40%
// but whatever she generates helen 25% is not to get anything from what she
// generates."
//
// Two separate pay rules, and it matters that they ARE separate:
//   · the technicians' commission is a cut of their own jobs — Emma 40%;
//   · Helen's 25% is not a cut of anybody's jobs. It is a quarter of the
//     month's NET PROFIT on the Aylık P&L.
// So "Helen gets nothing from Emma" is not a rate change. It is the figure
// Helen's share is computed FROM that has to lose Emma's takings — and lose
// Emma's own 40% from the cost side with them, or the commission on income
// that is no longer in the base would be charged against Helen twice.
//
// Emma's money is still the salon's: banked, counted as revenue, part of the
// turnover and of break-even. Only Helen's base changes.
//
// Run:  node tests/emma-komisyon.test.js
// ═════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const is = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
};
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

console.log('1. she exists, from the day she started and not before');
{
  global.window = {};
  eval(fs.readFileSync(path.join(root, 'crown-config.js'), 'utf8'));
  const C = global.window.CROWN;
  const names = d => C.rosterOn(d).map(o => o.name);

  is(names('2026-11-02').indexOf('Emma'), -1, 'she is not in yesterday’s diary');
  is(names('2026-11-03').indexOf('Emma') !== -1, true, 'she is in from 3 Kasım — the day she started');
  is(names('2026-11-30').indexOf('Emma') !== -1, true, '…and every open day after it');
  is(names('2026-10-22').indexOf('Emma'), -1, 'last month keeps the column list it always had');
  is(C.find('emma').joinedOn, '2026-11-03', 'the start date is written down, not implied');

  is([C.canDo('emma', 'Klasik Manikür'), C.canDo('emma', 'Pedikür'), C.canDo('emma', 'Dolgu (Infill)')], [true, true, true],
     'nails: manicure, pedicure and infill');
  is(C.canDo('emma', 'Kaş Boyama'), false, '…and not brows — that stays Helen’s');
  is(C.skilledOn('Dolgu (Infill)', '2026-11-03').map(o => o.name).indexOf('Emma') !== -1, true,
     'so the booking page and the gap-filler can offer her from day one');
}

console.log('2. 40% of her own work, and no salary');
{
  const m = /const TECH_COMM_RATES = \{([^}]*)\}/.exec(html);
  is(/Emma:0\.40/.test(m[1]), true, 'Emma is on 40% in the one table every screen reads');
  is(/Helen:0\b/.test(html), true, 'Helen stays 0 there — her share is not a cut of jobs');
  const row = /\{name:'Emma',[^}]*\}/.exec(html);
  is(/salary:0/.test(row[0]), true, 'no salary on the salary page');
  is(/40% of own client income/.test(row[0]), true, '…and the page says what she is on');
  // Every copy of the rate map must agree, or a backdated checkout pays her
  // a different percentage from a live one.
  const maps = html.match(/\{Helen:\s*0,?\s*Hannah:0\.12[^}]*\}/g) || [];
  is(maps.length >= 3, true, 'the backdated-checkout copies of the table exist');
  is(maps.every(x => /Emma:0\.40/.test(x)), true, '…and every one of them carries her 40% too');
}

console.log('3. Helen’s 25% is not taken from what Emma makes');
{
  is(/const RD_NO_BONUS_FROM = \['Emma'\];/.test(html), true,
     'one named list decides it, rather than a rule buried in the arithmetic');

  const fn = (/function rdBonusExcluded\(monthKey\)\{[\s\S]*?\n\}/.exec(html) || [''])[0];
  is(fn.length > 200, true, 'the exclusion is its own function');

  const mk = (ops) => ({ history: [{ date: '2026-11-10', ops }] });
  const list = (/const RD_NO_BONUS_FROM = \[[^\]]*\];/.exec(html) || [''])[0];
  const run = (dtState) => {
    const box = { dtState, dtOpTotal: (o) => (o.entries || []).reduce((s, e) => s + (e.amount || 0), 0),
                  TECH_COMM_RATES: { Emma: 0.40, Lissa: 0.12 }, console };
    const keys = Object.keys(box);
    const f = new Function(...keys, list + '\n' + fn + '\nreturn rdBonusExcluded;')(...keys.map(k => box[k]));
    return f('2026-11');
  };

  is(run(mk([{ name: 'Emma', entries: [{ amount: 1000 }, { amount: 1500 }] }])), { rev: 2500, comm: 1000 },
     'her takings and her 40% are both found');
  is(run(mk([{ name: 'Lissa', entries: [{ amount: 2000 }] }])), { rev: 0, comm: 0 },
     'nobody else is excluded');
  is(run(mk([{ name: 'Emma', total: 800, entries: null, commission: 320 }])), { rev: 800, comm: 320 },
     'a legacy day with no entry list still answers');
  is(run({ history: [] }), { rev: 0, comm: 0 }, 'a month with no takings is not a crash');

  // The shape of the sum itself: revenue AND the cost of her own commission
  // both leave the base. Charging one without the other is the easy mistake.
  is(/const bonusRev\s*=\s*Math\.max\(0, rev - ex\.rev\);/.test(html), true,
     'her takings come out of the revenue Helen’s share is worked out on');
  is(/const bonusAfter\s*=\s*bonusRev - \(breakeven - ex\.comm\);/.test(html), true,
     '…and her 40% comes out of the costs with them, so Helen is not charged for it twice');
  is(/const comm\s*=\s*Math\.round\(bonusNet \* 0\.25\);/.test(html), true,
     'Helen is still on 25% — of that figure');
  is(/const netAfterAll\s*=\s*Math\.max\(0, afterBreakeven - vatDue - taxDue\);/.test(html), true,
     'the salon’s own profit line is untouched — Emma’s money is still the salon’s');
}

console.log('4. her till column');
{
  const dflt = (/function dtDefaultState\(\)\{[\s\S]*?\n\}/.exec(html) || [''])[0];
  is(/name:'Emma',entries:\[\],active:true/.test(dflt), true, 'a card for her on a fresh device');
  const load = (/function dtLoadState\(\)\{[\s\S]*?\n\}/.exec(html) || [''])[0];
  is(/name==='Emma'/.test(load), true, '…and on a device that already had a takings record');
}

console.log(fail ? `\n✗ ${fail} FAILED, ${pass} passed` : `\n✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
