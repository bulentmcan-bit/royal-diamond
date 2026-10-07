// ═══════════════════════════════════════════════════════════════════════════
// Zebo off the payroll, Nihal to ₺60,000, the lojman to £550.
//
// These three figures are not data, whatever the P&L screen suggests. A block
// at the top of index.html rewrites rdns_monthly_costs_v3 on EVERY load, so a
// salary typed into that screen is overwritten the next time somebody opens
// the app. They have to be changed in the code, and in every place that
// repeats them — including two separate blocks that hard-code the numbers
// again for the break-even sum and the salary cards.
//
// A missed copy does not throw. It quietly keeps paying a receptionist who
// has left, in a total nobody reads twice.
//
// Run:  node tests/payroll-change.test.js
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
const code = html.replace(/<!--[\s\S]*?-->/g, '');     // ignore prose in comments

console.log('1. Zebo is off the payroll — everywhere');
{
  // One mention survives on purpose: the note saying why the slot is deleted.
  const hits = (code.match(/Zebo/gi) || []).length;
  is(hits, 1, 'only the comment explaining the removal still names her');
  is(/delete costs\.extraStaff\[7\]; delete costs\.extraStaffCur\[7\];/.test(code), true,
     'and a device still carrying her ₺52,000 drops it on the next load');
  is(/extraStaff\[7\]\|\|0/.test(code), false, 'nothing reads slot 7 any more');
  is(/52000/.test(code), false, 'her figure appears nowhere at all');
  is(/zeboSal/.test(code), false, '…and neither does her variable');
  is(/const ADV_STAFF = \['Helen','Hannah','Lissa','Zara','Saeideh','Beyhan','Nihal'\];/.test(code), true,
     'she is off the advances list too, so nobody can book her an avans');
}

console.log('2. Nihal is on ₺60,000');
{
  is(/costs\.extraStaff\[6\] = 60000;/.test(code), true, 'the figure that is forced on every load');
  is(/6:60000/.test(code), true, '…and both default blocks');
  is((code.match(/6:60000/g) || []).length, 2, '…both of them, not one');
  is(/const nihalSal    = 60000;/.test(code), true, '…and the hard-coded break-even sum');
  is(/'₺60,000'/.test(code), true, '…and the label on the P&L row');
  is(/salary:60000/.test(code), true, '…and her salary card');
  // 50000 also turns up inside unrelated test fixtures in this file, so pin
  // the shapes that would actually keep paying her the old amount.
  is(/extraStaff\[6\] = 50000|6:50000|nihalSal    = 50000|salary:50000|'₺50,000'/.test(code), false,
     'the old figure is gone from every place that pays it');
}

console.log('3. The lojman is £550');
{
  is(/costs\.starFlat = 550;/.test(code), true, 'forced on every load');
  is(/starFlat:550/.test(code), true, '…and in the defaults');
  is(/Math\.round\(550  \* gbp\)/.test(code), true, '…and the break-even sum');
  is(/toTRY\(550,'GBP'\)/.test(code), true, '…and the salary screen');
  is((code.match(/£550|&pound;550/g) || []).length >= 2, true, '…and the labels say £550');
  is(/450,'GBP'|£450|&pound;450|starFlat:450|starFlat = 450|450  \* gbp/.test(code), false, 'no £450 left anywhere');
}

console.log('3b. Social media is ₺25,000 — and the utilities are NOT');
{
  is(/costs\.extraStaff\[3\] = 25000;/.test(code), true, 'forced on every load');
  is((code.match(/3:25000/g) || []).length, 2, '…and in both default blocks');
  is(/const socialMedia = 25000;/.test(code), true, '…and the break-even sum');
  is(/'₺25,000'/.test(code), true, '…and the P&L label');
  is(/extraStaff\[3\] = 20000|3:20000|socialMedia = 20000/.test(code), false, 'nothing still pays ₺20,000 for it');
}

console.log('3d. Electric (Fatura) is ₺25,000');
{
  is(/costs\.utils = 25000;/.test(code), true, 'forced on every load');
  is(/mCosts\.utils = 25000;/.test(code), true, '…and in the reset');
  is(/utils:25000/.test(code), true, '…and the defaults');
  is(/\+ 25000                     \/\/ Fatura ₺25,000/.test(code), true, '…and the fixed-cost sum');
  is(/utils = 20000|utils:20000/.test(code), false, 'nothing still bills ₺20,000');
  // Social media and the electric are both ₺25,000 now and sit in different
  // places; this is the pair most likely to be edited into each other.
  is(/costs\.extraStaff\[3\] = 25000;/.test(code), true, 'social media is still its own entry');
}

console.log('3c. the hand-written break-even sum was updated too');
{
  // This line adds the salaries as bare numbers, with no names and no config.
  // It is the easiest one in the file to miss and nothing would ever throw.
  is(/60000 \+ toTRY\(150,'GBP'\) \+ 25000 \+/.test(code), true,
     'the raw-number break-even carries Nihal at 60,000, social media at 25,000 and no Zebo');
}

console.log('4. the staff count follows the list');
{
  // The cost form loops i = 2 .. staffCount+1. Six slots became five; leaving
  // it at 6 would draw an empty seventh row where Zebo used to be.
  is(/costs\.staffCount = 5;/.test(code), true, 'the forced value is 5');
  is(/staffCount:5,/.test(code), true, '…and the default');
  is(/mCosts\.staffCount = 5;/.test(code), true, '…and the reset');
  is(/staffCount = 6|staffCount:6/.test(code), false, 'nothing still says 6');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
