// ═══════════════════════════════════════════════════════════════════════════
// Kasaya fiyat yerine KOD yazmak.
//
// "I want to change the method of getting paid, whereas all I do is insert the
//  numbers instead of the price, and then the numbers and the prices should be
//  related in the system."
//
// Duvardaki fiyat listesindeki numaralar kasaya girilir: 2 yazınca Dolgu ve
// ₺1.700 kendiliğinden oluşur. Tasarım D1–D6 ile üstüne eklenir.
//
// Üç şey bu dosyanın varlık sebebi:
//
//   1. Kod ile gerçek para birbirine karışmayacak. 1–10 koddur, 100 ve üzeri
//      her sayı liradır. Salonun ₺100'ün altında hiçbir hizmeti yok, bu yüzden
//      kural güvenli — ama bir gün ₺50'lik bir şey satılırsa burası patlar.
//
//   2. Eski usul bozulmayacak. "Kirpik 1800" yazan kız bugüne kadar ne
//      yapıyorsa aynısını yapabilmeli.
//
//   3. Kaydetmeden önce kelimeyle okunacak. 8 yerine 3'e kayan bir parmak
//      ₺1.300 demek ve ekranda hiçbir izi yok. Okuma satırı o yüzden var.
//
// Çalıştırma:  node tests/fiyat-kodu.test.js
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

// ── The parser, lifted out of the page and run for real ──────────────────
const src = html.slice(html.indexOf('var RD_SVC_CODES'), html.indexOf('function rdDtEcho'));
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const P = (t, a) => ctx.rdParseCode(t, a);

console.log('1. the table is the wall list, to the lira');
{
  const want = { 1:1900, 2:1700, 3:1200, 4:1700, 5:1700, 6:1500, 7:1000, 8:2500, 9:1500, 10:800 };
  Object.keys(want).forEach(k => is(ctx.RD_SVC_CODES[k].p, want[k], `${k} → ₺${want[k]}`));
  is(ctx.RD_SVC_CODES[2].n, 'Dolgu', '2 is Dolgu');
  is(ctx.RD_SVC_CODES[10].n, 'Tırnak Çıkarma', '10 is Tırnak Çıkarma — the row he moved up from 11');
  is(Object.keys(ctx.RD_SVC_CODES).length, 10, 'ten services, no more: French/Ombre came off the sheet');
  is(ctx.RD_DSG_CODES, { D1:300, D2:600, D3:800, D4:1000, D5:1200, D6:1500 }, 'D1–D6 as he set them — D3 went 750 → 800 on 9 Ekim 2026');
}

console.log('2. a bare number is a service');
{
  is(P('2').amount, 1700, '2 → ₺1.700');
  is(P('2').name, 'Dolgu', '…and it writes the service name in too');
  is(P('8').amount, 2500, '8 → Medikal Pedikür ₺2.500');
  is(P('10').amount, 800, '10 → Tırnak Çıkarma ₺800');
  is(P(' 3 ').amount, 1200, 'spaces round it make no difference');
}

console.log('3. design is added on top, never instead');
{
  is(P('2 D3').amount, 2500, '2 D3 → ₺1.700 + ₺800');
  is(P('2 D3').name, 'Dolgu + D3', '…and it reads as both');
  is(P('2+D3').amount, 2500, 'a + between them works the same');
  is(P('8 D6').amount, 4000, '8 D6 → 2500 + 1500');
  is(P('2 d3').amount, 2500, 'lower-case d3 is the same code');
  is(P('D4').amount, 1000, 'design on its own is allowed — she only did the art');
}

console.log('4. real money and codes cannot be confused');
{
  is(P('1750').amount, 1750, '1750 is ₺1.750, not code 1 then 750');
  is(P('1750').name, '', '…and it claims no service name');
  is(P('100').amount, 100, '100 is the floor: still money');
  is(P('99').amount, 0, "99 is neither — it is refused rather than guessed at");
  is(P('11').amount, 0, '11 was Tırnak Çıkarma before he renumbered; now it means nothing');
}

console.log('5. the old way still works, untouched');
{
  is(P('Kirpik 1800').amount, 1800, 'name and price typed out by hand');
  is(P('Kirpik 1800').name, 'Kirpik', '…the name is kept');
  is(P('Kaş Laminasyon', '2200').amount, 2200, 'or the name in one box and the price in the other');
  is(P('', '1500').amount, 1500, 'or just a price, nothing else');
}

console.log('6. the amount box always overrules the code');
{
  const p = P('2', '2000');
  is(p.amount, 2000, 'Dolgu entered at ₺2.000 because that is what was charged');
  is(p.name, 'Dolgu', '…the service is still named');
  is(p.override, true, '…and it is flagged as hand-priced so the screen can say so');
  is(P('2', '0').amount, 1700, 'an empty-ish 0 is not an override');
}

console.log('7. the till is wired to it');
{
  is(/const parsed = rdParseCode\(svcEl\.value, amtEl\.value\);/.test(html), true,
     'dtAddEntry runs what was typed through the parser');
  is(/const amt = parsed\.amount;/.test(html), true, '…and takes its amount from there');
  is(html.includes("const amt = parseFloat(amtEl.value);"), false,
     '…the old bare parseFloat is gone');
  is(/const parsed = rdParseCode\(svcEl\.value, amtEl\.value\);/.test(html.slice(html.indexOf('function dtDashAddEntry'))), true,
     'the DASHBOARD till — the one they actually use all day — goes through it too');
  is(/id="dtDashEcho\$\{realIdx\}"/.test(html), true, '…and it has its own read-back line');
  is(/onkeydown="rdDashSvcKey\(event,\$\{realIdx\}\)"/.test(html), true, '…and the same Enter behaviour');
  is(/_pmE\.code = parsed\.code/.test(html), true, 'the code typed is kept on the entry for the audit trail');
  is(/service:svc,amount:amt,time/.test(html), true,
     'what is STORED is still the service name and the lira — never the code');
}

console.log('8. nothing is saved before it has been read back');
{
  is(/id="dtEcho\$\{idx\}"/.test(html), true, 'every operator card has a read-back line');
  is(/oninput="rdDtEcho\(\$\{idx\}\)"/.test(html), true, '…that updates as she types');
  is(/function rdDtEcho/.test(html), true, '…and the function behind it exists');
  is(/Tanınmayan kod/.test(html), true, 'an unknown code says so instead of sitting at ₺0');
  is(/onkeydown="rdDtSvcKey\(event,\$\{idx\}\)"/.test(html), true,
     'Enter on a recognised code adds the entry; Tab still goes to the amount box');
}

console.log('9. the booking dropdown carries the same numbers');
{
  // The VALUE is what gets written on an appointment and what every other
  // screen matches on. Numbering the LABEL and leaving the value alone is the
  // whole trick: not one booking already in the diary changes meaning.
  is(/<option value="Dolgu \(Infill\)">2 · Dolgu \(Infill\)<\/option>/.test(html), true,
     '2 is in front of Dolgu, and the stored value is untouched');
  is(/<option value="Jel Başlangıç \(Full Set\)">1 · /.test(html), true, '1 · Jel Başlangıç');
  is(/<option value="Klasik Pedikür \(Ojesiz\)">9 · /.test(html), true,
     '9 keeps the old "(Ojesiz)" value even though the wall list says only Klasik Pedikür');
  ['Man Pedi','Pedikür','Renkli Jel — El','Renkli Jel — Ayak'].forEach(n => {
    is(html.includes('<option value="'+n+'">'), true, `"${n}" was missing from the list — now added`);
  });
  is(/<option value="Nail Art">Nail Art<\/option>/.test(html), true,
     'the services with no code keep their plain names — nothing was renamed');
  is(/<option value="Jel Pedikür">Jel Pedikür<\/option>/.test(html), true, '…Jel Pedikür too');
}

console.log('10. picking a service fills the price');
{
  is(ctx.RD_SVC_CODES[2].v, 'Dolgu (Infill)', 'the table knows what the dropdown calls code 2');
  is(ctx.RD_SVC_CODES[9].v, 'Klasik Pedikür (Ojesiz)', '…and the awkward one');
  Object.keys(ctx.RD_SVC_CODES).forEach(k => {
    is(html.includes('<option value="'+ctx.RD_SVC_CODES[k].v+'">'+k+' · '), true,
       `code ${k} points at a real option in the list`);
  });
  is(/if\(RD_SVC_CODES\[k\]\.v === sv\.value\)/.test(html), true, 'the price is looked up by that value');
  is(/sv\.addEventListener\('change', rdApptAutoPrice\)/.test(html), true, '…whenever the service changes');
  is(/ad\.addEventListener\('change', rdApptAutoPrice\)/.test(html), true, '…and whenever the design changes');
}

console.log('11. a price typed by hand is never overwritten — and the system writes none');
{
  // This is the one that protects the takings. Reception discounts, rounds and
  // does favours; the moment the system argues with her the figure is wrong.
  is(/if\(cur && cur !== mine\)\{ try\{ rdApptPriceEcho\(\); \}catch\(e\)\{\} return; \}/.test(html), true,
     'anything the SYSTEM did not write is left alone — and still reads back');
  // 9 Ekim 2026 — Bülent: "I don't want the price to come out at that stage
  // because the technician might be offering them designs." The list price no
  // longer drops into the box when a service is picked; the box is filled at
  // checkout. tests/randevu-fiyatsiz.test.js runs that behaviour for real.
  // 9 Ekim, akşam: the figure is back IN the box, now covering BOTH treatments
  // and the design, because a total shown anywhere else reads as a different
  // number to the person typing. It still never overwrites a hand-typed one.
  // NB: \s+ between the two statements, not \n — index.html is CRLF on the
  // salon's machine and LF here, and a regex anchored on a bare newline
  // passes in one place and fails in the other.
  is(/pr\.value = String\(k\.total\);\s+pr\.dataset\.rdAuto = String\(k\.total\);/.test(html), true,
     'the list price goes in the box, and the system marks it as its own');
  is(/farklıysa üzerine yazın/.test(html), true, "…and says plainly that it can be written over");
}

console.log('11b. two treatments in one go');
{
  // "If we have two treatments done, for example #2 and #5, how can we add
  //  them both up together?" — 9 Ekim 2026. You already can: write both.
  is(P('2 5').amount, 3400, '2 5 → Dolgu ₺1.700 + Pedikür ₺1.700 = ₺3.400');
  is(P('2 5').name, 'Dolgu + Pedikür', '…and the read-back names BOTH, so a wrong code is visible before it is saved');
  is(P('2+5').amount, 3400, 'a plus between them works too');
  is(P('2,5').amount, 3400, '…and a comma, because that is what a hurried hand types');
  is(P('2 5 D3').name, 'Dolgu + Pedikür + D3', 'two treatments and a design: all three read back');
  is(P('2 5 D3').amount, 4200, '…₺1.700 + ₺1.700 + ₺800');
  is(P('1 7 D1').amount, 3200, 'a full set, colour on the feet and a small design = ₺3.200');
  is(P('2 5 1').amount, 5300, 'three treatments add up as readily as two');
  // The trap this read-back exists to catch: a bare number over 100 is LIRA,
  // and lira are ADDED, not substituted. "5 1500" is not "pedicure for 1500".
  is(P('5 1500').amount, 3200, '5 1500 → ₺1.700 + ₺1.500 = ₺3.200, because a figure is money and money is added');
  is(P('5 1500').name, 'Pedikür + ₺1.500', '…and it SAYS so, so the girl sees it rather than taking ₺3.200 off a customer who owed ₺1.500');
  is(P('Kirpik 1800').name, 'Kirpik', 'one priced thing on its own does not repeat its own figure');
  is(P('Kirpik 1800').amount, 1800, '…and the old free-typed way is untouched');
}

console.log('12. the design box is D1–D6, and still sets the time');
{
  is(/<option value="D3" data-min="30" data-p="800">/.test(html), true, 'D3 — ₺800, +30 dk');
  is(/<option value="D1" data-min="15" data-p="300">/.test(html), true, 'D1 — ₺300, +15 dk');
  is(/<option value="D6" data-min="60" data-p="1500">/.test(html), true, 'D6 — ₺1.500, +60 dk');
  ['D2','D4','D5'].forEach(d => is(new RegExp('<option value="'+d+'" data-min=').test(html), true, d+' is there'));
  is(html.includes('>French / Ombre  (+15 dk)<'), false, 'the two old add-ons are gone');
  is(html.includes('>Full Design  (+60 dk)<'), false, '…both of them');
  // The duration code used to read the option VALUE as minutes. It can't any
  // more, because the value is now D1–D6.
  is(/if\(o && o\.getAttribute\('data-min'\) != null\) return parseInt\(o\.getAttribute\('data-min'\)\)\|\|0;/.test(html), true,
     'addonMins reads the minutes off data-min instead of the value');
}

console.log('13. the four new names land in the right skill group');
{
  // "Man Pedi" fell through every branch of serviceGroup — the pedicure test
  // looks for "pedik", and "Man Pedi" has not got it. A service in no group is
  // open to EVERYONE, so Beyhan, who does not touch nails, was bookable for it.
  require(path.join(__dirname, '..', 'crown-config.js'));
  const C = globalThis.CROWN;
  is(C.serviceGroup('Man Pedi'), 'pedikur', 'Man Pedi is a pedicure, not a free-for-all');
  is(C.canDo('beyhan', 'Man Pedi'), false, '…so Beyhan is no longer offered it');
  ['helen','lissa','zara','hannah'].forEach(w =>
    is(C.canDo(w, 'Man Pedi'), true, `…and ${w} still is`));
  is(C.serviceGroup('Pedikür'), 'pedikur', '5 Pedikür lands right');
  is(C.serviceGroup('Renkli Jel — El'), 'manikur', '6 Renkli Jel — El is hand work');
  is(C.serviceGroup('Renkli Jel — Ayak'), 'pedikur',
     '7 Renkli Jel — Ayak is foot work, whatever the word "jel" in the middle of it says');
  is(C.serviceGroup('Renkli Jel — El'), 'manikur', '…and its hand twin is still a manicure');

  // Nothing else moved group because of the widened test.
  is(C.serviceGroup('Kirpik Dolgu'), 'kirpik', 'lashes unmoved');
  is(C.serviceGroup('Kaş Boyama'), 'kas', 'brows unmoved');
  is(C.serviceGroup('Tüm Yüz Ağda'), 'agda', 'waxing unmoved');
  is(C.serviceGroup('Dolgu (Infill)'), 'manikur', 'infill unmoved');
  is(C.serviceGroup('Güzellik Uygulaması'), null, '…and the one that belongs to nobody still does');
}

console.log('14. the Fiyat box at checkout takes a code too');
{
  // This is where the money is actually entered: a technician finishes, you
  // open the booking and type the price. It was type="number", so "D3" could
  // not even be typed into it.
  // 9 Ekim, akşam: the two jobs were split. A KOD box for the wall-list
  // numbers, a FİYAT box for lira. One box doing both is what nobody could
  // read at a glance.
  is(/id="a-code"/.test(html), true, 'there is a KOD box for the wall-list numbers');
  is(/id="a-code"[\s\S]{0,120}placeholder=""/.test(html), true, '…and it is EMPTY when empty: grey example text inside it read as a remembered value');
  is(/<input class="fctrl" type="text" inputmode="text" autocomplete="off" id="a-code"/.test(html), true,
     '…and the KOD box is a text box, so the letter in D3 goes in');
  is(html.includes('type="number" id="a-price"'), false, '…the old number box is gone');

  // Every place that READS it must go through the parser. A half-typed "2 D3"
  // read by parseInt is ₺2 — the sort of thing that empties a till quietly.
  is(/let enteredPrice = rdApptPriceValue\(\);/.test(html), true, 'the checkout save reads it through the parser');
  is(/price:rdApptPriceValue\(\),/.test(html), true, '…and so does a brand new booking');
  is(/parseInt\(document\.getElementById\('a-price'\)\.value\)/.test(html), false,
     '…no raw parseInt is left anywhere on that box');
  is(/parseInt\(document\.getElementById\("a-price"\)\.value\)/.test(html), false, '…in either quote style');

  is(/oninput="rdApptPriceEcho\(\)"/.test(html), true, 'it reads back as you type');
  is(/delete pr\.dataset\.rdAuto/.test(html), true,
     '…and once you type in it yourself, the list never overwrites you again');
}

console.log('15. a technician is not offered work she does not do');
{
  // Beyhan does brows and the lash lift. The box had no "nothing chosen" row,
  // so the browser selected the first manicure on its own — and the filter,
  // seeing a selection, PROTECTED it. Her list opened on
  // "Jel Başlangıç — Beyhan bu hizmeti yapmıyor", under a MANİKÜR heading, and
  // + Randevu would have booked exactly that.
  is(/<select class="fctrl" id="a-service">\s*<option value="">— Hizmet seçin —<\/option>/.test(html), true,
     'the list opens on an empty row, not on the first manicure');
  // saveAppt already refuses an empty service, so the empty row cannot be saved.
  is(/if\(!cid\|\|!svc\|\|!dt\)\{toast/.test(html), true, '…and an empty service still cannot be saved');
}

console.log('16. the WhatsApp price message is built from the same table');
{
  // It used to be typed out by hand, and nobody remembered to update it: the
  // wall said Dolgu ₺1.700 while WhatsApp was still telling customers ₺1.600.
  // Every price enquiry was being answered ₺100 light.
  const body = html.slice(html.indexOf('function rdPriceTL'),
                          html.indexOf('function rdPriceMsg'));
  is(/RD_SVC_CODES\[k\]/.test(body), true, 'the services come out of the price table');
  is(/RD_DSG_CODES\[c\]/.test(body), true, '…and so do D1–D6');
  ['1.700 TL','1.600 TL','1.400 TL'].forEach(n =>
    is(body.includes(n), false, `the hand-typed ${n} is gone`));
  is(body.indexOf('hizmete ek') > -1, true, 'design is named as an extra on top');

  // Run it for real and check the figures match the wall list to the lira.
  const ctx2 = { RD_SVC_CODES: ctx.RD_SVC_CODES, RD_DSG_CODES: ctx.RD_DSG_CODES };
  vm.createContext(ctx2);
  vm.runInContext(body, ctx2);
  const msg = ctx2.rdDefaultPriceMsg();
  is(/^1\. Jel Ba.*: 1\.900 TL$/m.test(msg), true, '1 quotes ₺1.900');
  is(/^2\. Dolgu: 1\.700 TL$/m.test(msg), true, '2 quotes ₺1.700, not the old ₺1.600');
  is(/^10\. T.rnak .*: 800 TL$/m.test(msg), true, '10 quotes ₺800');
  is(/D1 300  \u00b7  D2 600  \u00b7  D3 800 TL/.test(msg), true, 'D1–D3 on one line');
  is(/D4 1\.000  \u00b7  D5 1\.200  \u00b7  D6 1\.500 TL/.test(msg), true, 'D4–D6 on the next');
  is(msg.indexOf('0548 893 3333') > -1, true, 'the salon number is still on it');
  is(msg.indexOf('booking.html') > -1, true, '…and the online booking link');
  is(msg.indexOf('pek Kirpik Klasik: 1.800 TL') > -1, true,
     'the lash prices are kept — they are real prices and the wall list has no line for them');
  // Nothing may quote a figure the table does not hold.
  (msg.match(/^\d+\. .*: ([\d.]+) TL$/gm)||[]).forEach(line => {
    const n = parseInt(line.split(':').pop().replace(/[^\d]/g,''), 10);
    const ok = Object.keys(ctx.RD_SVC_CODES).some(k => ctx.RD_SVC_CODES[k].p === n);
    is(ok, true, `"${line.trim()}" matches the price table`);
  });
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
