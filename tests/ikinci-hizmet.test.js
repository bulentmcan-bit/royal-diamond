// ═══════════════════════════════════════════════════════════════════════════
// İKİNCİ HİZMET — one booking, two treatments.  9 Ekim 2026.
//
// "If you have a pedicure and a manicure done for the same customer, how do
//  we add them both together? At the moment it's either one or the other."
//  …"TASARIM EK HİZMET IS FOR THE DESIGN."
//
// Quite right: the only extra-service slot on the booking form was D1–D6.
// So there is now a second treatment box, and a booking that carries two
// jobs is stored under ONE name — "Dolgu (Infill) + Pedikür". Fifty-six
// places in index.html read a.service; a separate field would have meant
// changing all of them, and the one that got missed would be the one on the
// wall. A combined name is right everywhere without touching any of them.
//
// Two places must KNOW about the "+", and this file is why they can be
// trusted:
//   1. serviceGroup — a job has ONE group (the board column, the reports,
//      the staff filter) and it is the FIRST treatment's.
//   2. canDo — the girl must be able to do BOTH. By group alone,
//      "Dolgu + Pedikür" reads as pedicure, and somebody who does not do
//      nails could be booked for it.
//
// Çalıştırma:  node tests/ikinci-hizmet.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const is = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
};
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = { window: {}, console }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'crown-config.js'), 'utf8'), c);
const C = c.window.CROWN;

console.log('1. one job, one group — and it is the first treatment\'s');
{
  is(C.serviceGroup('Dolgu (Infill)'), 'manikur', 'a plain infill is manicure');
  is(C.serviceGroup('Pedikür'), 'pedikur', '…and a pedicure is pedicure');
  is(C.serviceGroup('Dolgu (Infill) + Pedikür'), 'manikur', 'both together → the FIRST one decides: she came for the infill');
  is(C.serviceGroup('Pedikür + Dolgu (Infill)'), 'pedikur', '…and written the other way round, the pedicure decides');
  is(C.serviceGroup('Renkli Jel — El'), 'manikur', 'a name with a dash in it is NOT split — only " + " splits');
  is(C.serviceGroup('Klasik Manikür + Pedikür'), 'manikur', 'manicure first → manicure');
}

console.log('2. she must be able to do BOTH');
{
  is(C.canDo('Lissa', 'Dolgu (Infill)'), true, 'Lissa does infills');
  is(C.canDo('Lissa', 'Pedikür'), true, '…and pedicures');
  is(C.canDo('Lissa', 'Dolgu (Infill) + Pedikür'), true, '…so she may be booked for both in one go');
  is(C.canDo('Beyhan', 'Dolgu (Infill) + Pedikür'), false, 'Beyhan does neither → refused, not quietly allowed');
  // The trap this exists to catch: by GROUP alone the pair reads as whatever
  // the first word matches, and the other treatment is never checked at all.
  const g = C.serviceGroup('Pedikür + Dolgu (Infill)');
  is(g, 'pedikur', 'by group the pair reads "pedicure"…');
  is(C.canDo('Beyhan', 'Pedikür + Dolgu (Infill)'), false, '…and yet somebody who does not do nails still cannot take it');
}

console.log('3. the form');
{
  is(/id="a-service2"/.test(html), true, 'the booking form has a second treatment box');
  is(/2\. Hizmet \(isteğe bağlı\)/.test(html), true, '…labelled as optional, so nothing changes for a single job');
  is(/function rdApptServiceValue\(\)/.test(html) && /return v1 \+ ' \+ ' \+ v2;/.test(html), true, 'saving joins them with " + "');
  is(/function rdApptServiceSet\(/.test(html), true, '…and opening a saved booking splits them back into the two boxes');
  is(/const svc=rdApptServiceValue\(\);/.test(html), true, 'a NEW booking saves the combined name');
  is(/const _svcVal = rdApptServiceValue\(\);/.test(html), true, '…and so does an edit');
  is(/_svv=rdApptServiceValue\(\)\|\|live\.service/.test(html), true, '…and the "she does not do this" warning judges the WHOLE job');
  is(/if\(o\.value && o\.value === a\.value\) o\.remove\(\);/.test(html), true, 'the same treatment cannot be picked twice');
  is(/b\.innerHTML = a\.innerHTML;/.test(html), true, "the second box carries the first's list, so the staff filter applies to both");
  // The duration ceiling is NOT touched. The crown rule is start on time and
  // finish inside the hour, and commission hangs off it; two treatments are
  // two slots. This box fixes the NAME of the job, not its length.
  is(/<option value="60" selected="">60 min<\/option>/.test(html), true, 'the 60-minute ceiling is untouched — two hours of work is still two bookings');
  const dur = html.slice(html.indexOf('<select class="fctrl" id="a-dur">'), html.indexOf('<select class="fctrl" id="a-dur">') + 400);
  is(/value="90"|value="120"/.test(dur), false, '…and nothing longer was slipped into the Süre list');
}

console.log('3b. the three choices are added up IN THE PRICE BOX');
{
  // "If I press number 2, I want it to come out where it says Çıkışta. I want
  //  it to be there, not at the bottom. That's confusing, not for me, for the
  //  others. If I then press number 5 then the figure … to add that on."
  // The figure now lands in the box the girl types into, not on a line below
  // it. tests/randevu-fiyatsiz.test.js runs that behaviour for real.
  is(/window\.rdApptPickedSum = function\(\)/.test(html), true, 'the form adds up what has been picked');
  is(/\['a-service','a-service2'\]\.forEach/.test(html), true, '…both treatments');
  is(/parseInt\(o\.getAttribute\('data-p'\)\|\|'0', 10\)/.test(html), true, '…and the design on top');
  is(/pr\.value = String\(k\.total\);/.test(html), true, 'and the total goes INTO the price box');
  is(/k\.parts\.join\(' \+ '\)/.test(html), true, '…with the names of all three under it');
  is(/sv2\.addEventListener\('change', rdApptAutoPrice\)/.test(html), true, 'picking the second treatment changes the figure');
  is(/Randevuda boş kalır — fiyat çıkışta yazılır/.test(html), false, "and the morning's \"the box stays empty\" line is no longer shown to anyone");
}

console.log('4. the price read-back is bound for real');
{
  // It carried oninput="rdApptPriceEcho()" as an attribute and on the live
  // page that attribute was not compiled into a handler — typing "2 5" left
  // yesterday's figure underneath. The saved amount was always right; the
  // line a person is TOLD to trust was not.
  is(/pr\._rdEchoWired = true;/.test(html), true, 'a real listener is attached to the price box');
  is(/\['input','change','blur','keyup','paste'\]\.forEach/.test(html), true, '…on typing, pasting, autofill and leaving the box');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
