// ═══════════════════════════════════════════════════════════════════════════
// 💰 PARA SONDA — the price leaves the booking screen (6 Kasım 2026).
//
// Bülent, three times in one day:
//   "I want to put the price in at the end, because normally the technicians
//    talk them into doing something extra."
//   "I don't want a price to go in it before."
//   "It's messing up everything."
//
// He was right, and the reason is structural: ONE screen was doing TWO jobs.
// The appointment screen booked people AND took money. Every rule invented to
// tell those apart was a guess at intent, and each guess broke something —
// 15 Ekim's "untouched price" rule stopped bookings being checked out by
// accident; 4 Kasım's version of it stopped checkouts working AT ALL for two
// days, because on a day with no upsell the price the desk confirms IS the
// service's own figure and looked identical to one nobody had touched.
//
// So the guessing stops. The appointment screen has no money on it. The
// checkout panel has the money, and opens EMPTY, because the figure is only
// known once the technician has finished talking.
//
// Driven end-to-end in a real browser before shipping:
//   · Edit → change the hour → Save  → stays confirmed, no price, no till
//     line, no Memnun asked
//   · Done → empty box → type 2300 → Memnun → completed, ₺2.300 in the till
//     carrying the appointment id
//   · KOD "2" → ₺1.700 in the box, as it has since 9 Ekim
//
// Run:  node tests/para-sonda.test.js
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

console.log('1. the booking screen has no money on it');
ok(/<div class="fg" id="a-money-row" style="display:none;">/.test(html),
   'Kod and Fiyat are off the appointment screen');
{
  const row = html.slice(html.indexOf('id="a-money-row"'), html.indexOf('id="flabel-a-staff"'));
  ok(/id="a-code"/.test(row) && /id="a-price"/.test(row),
     '…hidden, not deleted — dozens of functions still read them and none of them break');
}
ok(/if\(pr\.dataset\.rdAuto != null && String\(pr\.value\)===String\(pr\.dataset\.rdAuto\)\) pr\.value='';\s*\n\s*delete pr\.dataset\.rdAuto;/.test(html),
   'and nothing writes a price into the hidden box, so rdApptPriceValue() is always 0');

console.log('2. the checkout panel takes the money');
ok(/id="ck-price"/.test(html) && /id="ck-code"/.test(html), 'Alınan tutar and Kod live here now');
ok(/oninput="rdCkPriceTyped\(\)"/.test(html) && /oninput="rdCkCodeTyped\(\)"/.test(html), 'both are wired');
{
  const i = html.indexOf('function rdCkMoneyInit(a)');
  const blk = html.slice(i, i + 1600);
  ok(/if\(pr\)\{ pr\.value=''/.test(blk), 'it opens EMPTY — the figure is only known at the end');
  ok(/var already = \(a && \(\(a\._takingsAmount>0/.test(blk),
     '…unless money was already taken for this visit, which is real and goes back in');
  ok(/fazlas\\u0131 varsa ekleyin/.test(blk) || /fazlası varsa ekleyin/.test(blk),
     'and the line underneath says what the service comes to, so the desk knows the baseline');
}
ok(/try\{ rdCkMoneyInit\(a\); \}catch\(e\)\{/.test(html), 'the panel fills it when it opens');

console.log('3. nothing finishes without a price');
{
  const g = html.slice(html.indexOf('function rdCkGate(){'), html.indexOf('function rdCkMark('));
  ok(/if\(ok && rdCkPriceValue\(\) <= 0\) ok=false;/.test(g),
     '✓ Çıkışı Tamamla stays grey until an amount is in the box');
  ok(g.indexOf('_ckState.sel') < g.indexOf('rdCkPriceValue'),
     'the next-appointment answer is still required too — both, not either');
}
ok(/const price=rdCkPriceValue\(\) \|\| parseInt\(document\.getElementById\('rb-price'\)\?\.value\)\|\|0;/.test(html),
   'and the checkout writes the figure the desk actually typed');

console.log('4. the code keys still work, at the right moment');
{
  const c = html.slice(html.indexOf('function rdCkCodeTyped()'), html.indexOf('function rdCkMoneyInit'));
  ok(/rdParseCode\(tok, ''\)/.test(c), '2, 5, D3 are still read as codes');
  ok(/if\(pr\.value && pr\.dataset\.rdAuto == null\)/.test(c),
     'a figure typed by hand is sacred — the code box never writes over it (9 Ekim)');
  ok(/pr\.dataset\.rdAuto = String\(total\)/.test(c), 'and the system owns its own number so it can update it');
}

console.log('5. the hidden rb-price still feeds the old machinery');
{
  const m = html.slice(html.indexOf('function rdCkMoneySync()'), html.indexOf('function rdCkPriceTyped()'));
  ok(/if\(h\) h\.value = rdCkPriceValue\(\) \|\| '';/.test(m), 'it mirrors into rb-price…');
  ok(/rdCkFxRender/.test(m) && /rdCkChgRender/.test(m),
     '…so the £/€/$ strip and the change calculator keep working');
}

console.log('6. ✕ Vazgeç — a way out');
/* 7 Kasım 2026. There was no way out of the checkout panel. Open it by
   mistake, or on the wrong customer, and the only exits were finishing a
   checkout you did not mean to make, or reloading the page. Bülent sent a
   photograph of himself stuck in it.
   Driven in a browser: open the panel, type ₺2.500, press Vazgeç — the
   appointment is still confirmed with no price, no till line and no Memnun
   on it, and the panel reopens with an empty box. */
ok(/id="btn-checkout-abandon" onclick="rdCkAbandon\(\)"/.test(html), 'the button exists, beside ✓ Çıkışı Tamamla');
ok(/function rdCkAbandon\(\)\{/.test(html), 'and has its own function');
{
  const a = html.slice(html.indexOf('function rdCkAbandon(){'), html.indexOf('function rdCkDropNewAppt(){'));
  ok(/rdCkDropNewAppt\(\)/.test(a),
     'a provisional next booking the calendar already made is removed');
  ok(/rebookPending=null; _ckState=null;/.test(a), 'and the checkout state is cleared');
  ok(!/saveAll\(\)/.test(a) && !/diAutoAdd/.test(a) && !/rdFinalizeCompletion/.test(a),
     'it writes NOTHING — no save, no till entry, no completion');
  ok(/rbkCalOv/.test(a), 'and the date picker closes with it, if it was open');
}
ok(html.indexOf('id="btn-checkout-abandon"') < html.indexOf('id="btn-checkout-done"'),
   'the way out sits to the left of the way on, where a cancel belongs');

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ all ') + pass + ' passed');
process.exit(fail ? 1 : 0);
