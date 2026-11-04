// ═════════════════════════════════════════════════
// The second and a half nobody was looking at.
//
// 31 Ekim 2026, Bülent: "The system has gone ridiculously slow specially on
// reception… the laptop hardly has anything else on it."
//
// It was not the laptop. Measured live that morning:
//
//     page elements          104,389
//     page-appointments       76,526   (3,433 rows)   hidden
//     page-clients            22,359     (859 rows)   hidden
//     renderAppts()            1,212 ms
//     whole redraw after one save  ~2,100 ms
//
// Both tables were rebuilt from scratch on every save, every ✓ Done and every
// cloud sync — while sitting behind other pages where nobody could see them.
// Reception saves constantly, so reception paid that bill constantly, and it
// grew by one row a day.
//
// Two rules now:
//   1. a page that is not open is not built — _gotoActual() already renders a
//      page when it is opened, so nothing is lost;
//   2. even when it IS open, the table draws the newest 250 and offers the
//      rest on a button, the same bargain the Gelen Kutusu page struck.
//
// Run:  node tests/sayfa-hizi.test.js
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
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

console.log('1. a hidden page is not built');
{
  is(/function rdPageShown\(id\)\{/.test(html), true, 'the one question both tables ask');
  is(/catch\(e\)\{ return true; \}/.test(html), true,
     '…and it fails OPEN — an error must never make a page vanish');
  const ra = (/function renderAppts\(\)\{[\s\S]*?\n\}/.exec(html) || [''])[0];
  const rc = (/function renderClients\(\)\{[\s\S]*?\n\}/.exec(html) || [''])[0];
  is(/^\s*if\(!rdPageShown\('page-appointments'\)\) return;/m.test(ra), true,
     'renderAppts gives up when its page is behind another');
  is(/^\s*if\(!rdPageShown\('page-clients'\)\) return;/m.test(rc), true,
     'renderClients does the same');
  // The guard is only safe because opening a page renders it. If that ever
  // stops being true, these tables go stale and this test is the warning.
  is(/if\(page==="appointments"\)renderAppts\(\);/.test(html), true,
     'opening Randevular still renders it — what makes the guard safe');
  is(/if\(page==="clients"\)renderClients\(\);/.test(html), true,
     'opening Müşteriler still renders it');
}

console.log('2. the open page draws a window, not three years');
{
  const fn = (/function rdApptWindow\(list, showAll, cap\)\{[\s\S]*?\n\}/.exec(html) || [''])[0];
  is(fn.length > 80, true, 'the windowing rule is a function of its own, so it can be tested');
  const rdApptWindow = new Function(fn + '\nreturn rdApptWindow;')();

  const L = Array.from({ length: 3433 }, (_, i) => i);
  is([rdApptWindow(L, false, 250).rows.length, rdApptWindow(L, false, 250).hidden], [250, 3183],
     '3,433 rows become 250 drawn and 3,183 held back');
  is(rdApptWindow(L, false, 250).rows[0], 0,
     '…and it keeps the TOP of the list — the table is sorted newest first');
  is([rdApptWindow(L, true, 250).rows.length, rdApptWindow(L, true, 250).hidden], [3433, 0],
     'the button brings every one of them back');
  is(rdApptWindow([1, 2, 3], false, 250).hidden, 0, 'a short list is left alone');
  is(rdApptWindow(Array(250).fill(0), false, 250).hidden, 0, 'exactly at the cap, no footer');
  is(rdApptWindow(null, false, 250).rows, [], 'no list at all is not a crash');

  is(/RD_APPT_CAP = 250/.test(html), true, 'the cap is a named number, not buried in the markup');
  is(/eski randevu daha var — hepsini göster/.test(html), true,
     'the page SAYS how many it is holding back — a silent cap is a lie');
  is(/window\.rdApptsShowAll = function\(\)/.test(html), true, '…and the button that undoes it exists');
}

// ── 4 Kasım 2026 · THE SLOW START-UP ──────────────────────────────────────
// Measured on Bülent's own laptop: the page itself was interactive in 882 ms,
// but two public relay services were being asked for the exchange rate, one
// after the other, 6.0 s each — while the salon's own 1.3 MB of data was
// still coming down. Plus three dead files left behind by a "save page as",
// two of them scripts in the head, which the browser waits for.
console.log('\n4. start-up');
{
  is(/(?:src|href)="\.\/[^"]*_files\//.test(html), false,
     'nothing is loaded from a saved copy of the page — those 404 on every load');
  is(/xlsx\.full\.min\(1\)\.js\.download/.test(html), false,
     'and no duplicate SheetJS in the head');
  is(/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\//.test(html), true,
     'SheetJS still loads on demand, from cdnjs, where it is used');

  is(/async function sunAutoRates\(force\)\{/.test(html), true,
     'the rate fetch can be forced when somebody really wants it refreshed');
  is(/if\(!force && _c && String\(_c\.d\|\|''\)>=String\(_want\) && parseFloat\(_c\.g\)>0\)\{/.test(html), true,
     '…but a rate already held for the working day is used instead of asking');
  is(/ctl\.abort\(\);\},2500\)/.test(html), true,
     'and a relay that has not answered in 2.5 s is given up on (was 6 s)');
  is(/ctl\.abort\(\);\},6000\)/.test(html), false, 'the six-second wait is gone');

  const fxBlock = html.slice(html.indexOf('// FX rates: refreshed every 30 minutes'),
                             html.indexOf('// FX rates: refreshed every 30 minutes') + 700);
  is(fxBlock.length > 100, true, 'the start-up FX block is where it says it is');
  is((fxBlock.match(/setInterval\(/g) || []).length, 1,
     'the 30-minute refresh is registered ONCE, not twice');
  is(/\n  fetchFX\(\);\n  setInterval/.test(html), false,
     'and nothing fetches rates on the way in any more');
  is(/if\(page==="monthly"\)\{mInitCosts\(\);mEnsureSeed\(\);renderMonthly\(\);fetchFX\(\)/.test(html), true,
     'the P&L page still fetches them when it is actually opened');
  is(/if\(page==="salary"\)\{ fetchFX\(\);/.test(html), true, '…and so does Salary');
}

console.log(fail ? `\n✗ ${fail} FAILED, ${pass} passed` : `\n✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
