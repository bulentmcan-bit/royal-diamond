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

console.log(fail ? `\n✗ ${fail} FAILED, ${pass} passed` : `\n✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
