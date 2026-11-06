// ═══════════════════════════════════════════════════════════════════════════
// ➗ İKİ SATIR, TEK ÖDEME — a split is not a double entry (6 Kasım 2026).
//
// Kasa Kontrol treated every second till line for one appointment as money
// counted twice. But two lines are just as often ONE payment written in two
// pieces — part cash, part card, put in as two rows instead of through
// ➗ Bölünmüş Ödeme.
//
//   Dinara Shirnazarova, 5 Kasım: ₺200 kart + ₺1.800 nakit against a ₺2.000
//   job. Real money, correctly recorded. The screen called the second line a
//   duplicate and reported a ₺1.800 Fark that did not exist — and the only
//   safe fix on offer would have DELETED ₺1.800 of the salon's cash.
//
//   Kader Bigili, 2 Kasım: ₺1.700 + ₺2.200 against a ₺2.200 job. That one
//   really is counted twice.
//
// The arithmetic is the only thing that tells them apart.
//
// Run:  node tests/bolunmus-odeme.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function is(got, want, label) {
  const okk = JSON.stringify(got) === JSON.stringify(want);
  if (okk) pass++; else fail++;
  console.log((okk ? '  ✓ ' : '  ✗ ') + label + (okk ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
}
const ok = (c, l) => is(!!c, true, l);

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('      const _ccGrp={};');
const b = html.indexOf('      const _ccSeen=new Set();');
if (a < 0 || b <= a) { console.error('could not slice the grouping rule'); process.exit(1); }
const rule = html.slice(a, b);

// Run the REAL rule against a day's rows and till entries.
function decide(rows, entries) {
  const ctx = { rows, hd: { ops: [{ name: 'Helen', entries }] } };
  vm.createContext(ctx);
  vm.runInContext(rule + '\nthis.out=_ccSplitSum;', ctx);
  return ctx.out;
}
const R = (apptId, amount) => ({ apptId, amount });
const E = (apptId, amount, pay) => ({ apptId, amount, pay });

console.log('1. Dinara — one payment, two lines');
{
  const out = decide([R(1793699657358, 2000)],
                     [E(1793699657358, 200, 'kart'), E(1793699657358, 1800, 'nakit')]);
  is(out['1793699657358'], 2000, '₺200 + ₺1.800 against a ₺2.000 job → one payment of ₺2.000');
}

console.log('2. Kader — genuinely counted twice');
{
  const out = decide([R(555, 2200)], [E(555, 1700, 'iban'), E(555, 2200, 'iban')]);
  is(out['555'], undefined, '₺1.700 + ₺2.200 against a ₺2.200 job → NOT a split, still a double entry');
}
{
  const out = decide([R(556, 2000)], [E(556, 2000, 'nakit'), E(556, 2000, 'nakit')]);
  is(out['556'], undefined, 'the same amount entered twice is the classic double entry, never a split');
}

console.log('3. it leaves everything else alone');
{
  is(decide([R(1, 1700)], [E(1, 1700, 'nakit')])['1'], undefined,
     'one line for one job is not a split');
  is(decide([R(2, 1700)], [E(2, 1500, 'nakit')])['2'], undefined,
     'one line that disagrees with the price is a correction, not a split');
  is(Object.keys(decide([], [E(3, 500, 'nakit'), E(3, 500, 'nakit')])).length, 0,
     'lines whose appointment is gone (orphans) are never folded together');
  is(decide([R(4, 3000)], [E(4, 1000, 'nakit'), E(4, 1000, 'kart'), E(4, 1000, 'iban')])['4'], 3000,
     'three ways of paying one job still add up to one payment');
  is(decide([R(5, 2000)], [E(5, 200, 'kart'), E(5, 1700, 'nakit')])['5'], undefined,
     '…but ₺1.900 against a ₺2.000 job does not add up, so it is left flagged');
}

console.log('4. the page it is written into');
ok(/if\(_ccSplitSum\[_k\]!=null\)\{/.test(html), 'the merge happens before the duplicate check');
ok(html.indexOf('if(_ccSplitSum[_k]!=null){') < html.indexOf('if(_ccSeen.has(_k)){'),
   '…so a split can never fall through and be flagged as a duplicate');
{
  const m = html.slice(html.indexOf('if(_ccSplitSum[_k]!=null){'), html.indexOf('if(_ccSeen.has(_k)){'));
  ok(/rs\.amount=_ccSplitSum\[_k\];/.test(m), 'the row shows the whole payment, not the first piece');
  ok(/rs\.pay='split';/.test(m) && /rs\.splits=/.test(m),
     'and renders as a split, so the desk sees 💳 ₺200 + 💵 ₺1.800');
  ok(/rs\.splitRows=\(rs\.splitRows\|\|0\)\+1;/.test(m), 'it counts the pieces');
}
ok(/r\.splitRows>1\?' <span class="badge"/.test(html),
   'the row carries a quiet mark saying the lines add up — not a red duplicate');
ok(/çift giriş değil, bölünmüş ödeme/.test(html), '…and the tooltip says exactly that');
ok(/⚠️ Çift giriş/.test(html), 'the real duplicate badge is still there for the real ones');

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ all ') + pass + ' passed');
process.exit(fail ? 1 : 0);
