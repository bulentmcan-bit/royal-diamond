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
  // She survives only in the comments that explain where her slot went.
  const live = code.split('\n').filter(l => /Zebo/i.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l.trim()));
  is(live, [], 'no line of actual code still mentions her');
  is(/'Zebo'|"Zebo"|name:'Zebo'/.test(code), false, '…she is not a string anywhere either');
  // Her slot is now Glyn's. ASSIGNING it is what clears her from a device that
  // still holds her ₺52,000 — deleting it would have done the same, but the
  // slot had to be reused, so the assignment carries that job now.
  is(/costs\.extraStaff\[7\] = 10000;/.test(code), true,
     'and slot 7 is overwritten, so a stale device drops her ₺52,000 on the next load');
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

console.log('3b. The social media BUDGET is ₺25,000, split two ways');
{
  /* "We are budgeting the social media costs us ₺25,000. Of that ₺25,000 give
     Helen ₺10,000 to pay her husband." So the budget is the total, not the
     agency line: ₺15,000 stays as Sosyal Medya and ₺10,000 goes through Helen.
     Raise one without lowering the other and the salon quietly pays ₺35,000. */
  is(/costs\.extraStaff\[3\] = 15000;/.test(code), true, 'Sosyal Medya is the remainder, ₺15,000');
  is((code.match(/3:15000/g) || []).length, 2, '…in both default blocks');
  is(/const socialMedia = 15000;/.test(code), true, '…and the break-even sum');
  is(/'₺15,000'/.test(code), true, '…and the P&L label');
  is(/extraStaff\[3\] = 20000|3:20000|socialMedia = 20000|extraStaff\[3\] = 25000|3:25000|socialMedia = 25000/.test(code), false,
     'neither the old ₺20,000 nor the undivided ₺25,000 is left');
  // THE INVARIANT: the two halves must still add up to the budget.
  const soc = /const socialMedia = (\d+);/.exec(code), gly = /const glynSal     = (\d+);/.exec(code);
  is(Number(soc[1]) + Number(gly[1]), 25000, 'and the two halves still come to the ₺25,000 budget');
}

console.log('3d. Electric (Fatura) is ₺25,000');
{
  is(/costs\.utils = 25000;/.test(code), true, 'forced on every load');
  is(/mCosts\.utils = 25000;/.test(code), true, '…and in the reset');
  is(/utils:25000/.test(code), true, '…and the defaults');
  is(/\+ 25000                     \/\/ Fatura ₺25,000/.test(code), true, '…and the fixed-cost sum');
  is(/utils = 20000|utils:20000/.test(code), false, 'nothing still bills ₺20,000');
  // The electric is ₺25,000 and the social media BUDGET is ₺25,000 — the same
  // figure in two unrelated places, which is the pair most likely to be edited
  // into each other by mistake.
  is(/costs\.extraStaff\[3\] = 15000;/.test(code), true, 'social media is still its own entry, at ₺15,000');
}

console.log('3c. the hand-written break-even sum was updated too');
{
  // This line adds the salaries as bare numbers, with no names and no config.
  // It is the easiest one in the file to miss and nothing would ever throw.
  is(/60000 \+ toTRY\(150,'GBP'\) \+ 15000 \+ 10000 \+/.test(code), true,
     'the raw-number break-even carries Nihal at 60,000, the split social media, and no Zebo');
}

console.log('3e. Glyn — ₺10,000 through Helen, in slot 7');
{
  /* "ALSO add ₺10,000 into Helen's salary for Glyn her husband who is doing
     the social media." Read as an addition, not a replacement: the Sosyal
     Medya line stays at ₺25,000 and Glyn is paid on top, through Helen.
     The two sit next to each other on the P&L on purpose — if it turns out
     Glyn WAS the ₺25,000, a double payment is obvious at a glance instead of
     buried in a total. */
  is(/costs\.extraStaff\[7\] = 10000;/.test(code), true, 'forced on every load');
  is((code.match(/7:10000/g) || []).length, 2, '…and in both default blocks');
  is(/const glynSal     = 10000;/.test(code), true, '…and the hand-written break-even sum');
  is(/60000 \+ toTRY\(150,'GBP'\) \+ 15000 \+ 10000 \+/.test(code), true, '…and the raw-number one');
  is(/'Helen — Glyn \(Sosyal Medya\)'/.test(code), true, 'named so nobody wonders what it is');
  // Taking the slot also wipes Zebo from any device that still holds her.
  is(/delete costs\.extraStaff\[7\]/.test(code), false,
     'slot 7 is assigned, not deleted — which overwrites Zebo on a stale device');
  is(/52000/.test(code), false, '…and her figure is still nowhere');
  // The whole point of the layout: both social-media costs visible together.
  const pnl = code.slice(code.indexOf("row('Social Media'"), code.indexOf("row('Social Media'") + 300);
  is(/Helen — Glyn/.test(pnl), true, 'the P&L prints Glyn directly under Social Media');
  is(/totalExpenses = [^;]*\+glynSal;/.test(code), true, 'and he is actually counted in the expenses');
}

console.log('4. the staff count follows the list');
{
  // The cost form loops i = 2 .. staffCount+1. Six slots became five; leaving
  // it at 6 would draw an empty seventh row where Zebo used to be.
  // Six slots again: Zebo's seat became Glyn's. The cost form loops
  // i = 2 .. staffCount+1, so this must match or a row goes missing.
  is(/costs\.staffCount = 6;/.test(code), true, 'the forced value is 6');
  is(/staffCount:6,/.test(code), true, '…and the default');
  is(/mCosts\.staffCount = 6;/.test(code), true, '…and the reset');
  is(/staffCount = 5|staffCount:5/.test(code), false, 'nothing still says 5');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
