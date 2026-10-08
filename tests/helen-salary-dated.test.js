// ═══════════════════════════════════════════════════════════════════════════
// Helen's salary: $2,000 until Eylül, $2,500 from Ekim 2026.
//
// "Let's increase Helen's salary from 2,000 to 2,500 for the current month
//  that we're in, onwards." … "Only for the month of October onwards."
//
// This is the one cost in the file that has to be dated, and it is worth
// being clear why. Every other figure here is applied to EVERY month the P&L
// can draw — change the rent and August is recalculated with today's rent.
// For the rent that is a rounding matter nobody will ever look at.
//
// Not for this one. Helen is paid 25% of net profit. Raising her salary
// retrospectively lowers the profit of every month already settled and
// quietly restates what she was owed for each of them — against figures she
// has already been paid on, and in the middle of a conversation about her pay
// being unfair.
//
// Run:  node tests/helen-salary-dated.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const is = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
};
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

console.log('1. the table, and the month it turns on');
{
  const tbl = /const RD_STAR_SAL = \[([\s\S]*?)\];/.exec(html);
  const fn = /function rdStarSal\(ym\)\{([\s\S]*?)\n\}/.exec(html);
  is(!!tbl && !!fn, true, 'there is a dated table and a reader for it');
  const rdStarSal = new Function('const RD_STAR_SAL = [' + tbl[1] + '];\nfunction rdStarSal(ym){' + fn[1] + '}\nreturn rdStarSal;')();

  is(rdStarSal('2026-10'), 2500, 'Ekim 2026 — the month he asked for — is $2,500');
  is(rdStarSal('2026-11'), 2500, '…and every month after it');
  is(rdStarSal('2027-03'), 2500, '…including next year');
  is(rdStarSal('2026-09'), 2000, 'Eylül 2026 is still $2,000');
  is(rdStarSal('2026-08'), 2000, '…and Ağustos');
  is(rdStarSal('2025-12'), 2000, '…and last year');
  // A month with no figure must not come back undefined and multiply into NaN
  // across a whole P&L.
  is(rdStarSal(''), 2000, 'an empty month falls back rather than returning nothing');
  is(rdStarSal(null), 2000, '…and so does a missing one');
  is(rdStarSal(undefined), 2000, '…and an undefined one');
}

console.log('2. every place that spends it asks for the month');
{
  // The P&L expense row.
  is(/const helenSal   = rdStarSal\(mViewMonth\|\|mCurrentMonth\(\)\) \* usd;/.test(html), true,
     'the P&L row uses the month being VIEWED, not today');
  // mGetCalc, which both the P&L and the salary page go through.
  is(/const starSalTRY  = Math\.round\(rdStarSal\(viewMonth\) \* usd\);/.test(html), true,
     'mGetCalc uses the month it was handed');
  // The salary page's own fallback sum.
  is(/toTRY\(rdStarSal\(monthKey\),'USD'\)/.test(html), true,
     '…and the salary page fallback uses that month too');
  // Nothing may still spend a bare 2000.
  is(/Math\.round\(2000 \* usd\)|toTRY\(2000,'USD'\)|starSal = 2000|starSal:2000/.test(html), false,
     'no copy of the old flat $2,000 is left anywhere');
}

console.log('3. the cost form shows THIS month');
{
  // These two feed the editable form and the stored costs, which are about
  // the month the salon is in now.
  is(/costs\.starSal = rdStarSal\(new Date\(\)\.toISOString\(\)\.slice\(0,7\)\);/.test(html), true,
     'the forced reset stores the current month’s figure');
  is(/mCosts\.starSal = rdStarSal\(mCurrentMonth\(\)\);/.test(html), true, '…and so does the other reset');
  is(/starSal:2500,/.test(html), true, '…and the default is the current figure');
}

console.log('4. raising it again is adding a row, not editing one');
{
  const tbl = /const RD_STAR_SAL = \[([\s\S]*?)\];/.exec(html)[1];
  is(tbl.indexOf("2026-10") < tbl.indexOf("0000-00"), true, 'newest first, so the first match wins');
  is(/Add a row to raise it again, never edit the row below/.test(html), true,
     'and the file says so, because editing the old row is how history gets rewritten');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
