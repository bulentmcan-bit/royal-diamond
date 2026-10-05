// ═══════════════════════════════════════════════════════════════════════════
// The Fark says WHY.
//
// The owner, on Kasa Kontrol: "⚠️ Fark: +₺2,100" against Helen, "+₺2,000"
// against Lissa. He read them as something entered twice — "can we fix, there
// are two double inputs."
//
// They are not double entries. Every Fark on this screen already has a named
// cause sitting in the rows below it: money in the till with no appointment
// behind it (⚠️ Karşılıksız), or an appointment finished with nothing in the
// till (⚠️ Kasa kaydı yok). The badges were there the whole time.
//
// But nobody connects a number at the top of a table to a badge eleven lines
// further down. So the number now carries the name and the figure.
//
// Run:  node tests/kasa-fark-why.test.js
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

console.log('1. the explanation is built from the rows themselves');
{
  is(/const _ccOrph=list\.filter\(r=>r\.orphan\), _ccNoTill=list\.filter\(r=>r\.noTill\), _ccDupe=list\.filter\(r=>r\.dupe\);/.test(html), true,
     'it reads the three kinds of row that create a Fark');
  // The one the owner spotted himself, and the likeliest of the three.
  is(/if\(diff>0\.5 && _ccDupe\.length\)/.test(html), true, '…including the same money entered twice');
  is(/çift girilmiş: /.test(html), true, '…named as such, ahead of the others');
  is(/const _ccWhy=\(function\(\)\{/.test(html), true, '…and turns them into a sentence');
  is(/↳ '\+_ccWhy\+'/.test(html), true, '…printed under the staff name, where there is room');
}

console.log('2. it names the right cause for the right direction');
{
  const m = /const _ccWhy=\(function\(\)\{([\s\S]*?)\n    \}\)\(\);/.exec(html);
  const b = m ? m[1] : '';
  // Till HIGHER than appointments → money with nothing behind it.
  is(/if\(diff>0\.5 && _ccOrph\.length\)/.test(b), true,
     'a POSITIVE Fark — till above appointments — is explained by the karşılıksız rows');
  // Till LOWER → an appointment finished whose money never went in.
  is(/if\(diff<-0\.5 && _ccNoTill\.length\)/.test(b), true,
     '…and a NEGATIVE one by the appointments with no till entry');
  is(/r\.client\+' ₺'\+r\.amount\.toLocaleString\(\)/.test(b), true,
     '…each named with the customer AND the figure, so it can be checked against the slip');
}

console.log('3. the case that used to be silent');
{
  const m = /const _ccWhy=\(function\(\)\{([\s\S]*?)\n    \}\)\(\);/.exec(html);
  const b = m ? m[1] : '';
  // A Fark with nothing flagged means the day's till total was typed by hand
  // and simply disagrees. That is the one you must not leave unexplained.
  is(/if\(!bits\.length && diff!==null && Math\.abs\(diff\)>0\.5\)/.test(b), true,
     'a Fark with no flagged row still says something');
  is(/kasa toplamı elle girilmiş olabilir/.test(b), true,
     '…namely that the till total was probably typed by hand');
}

console.log('4. nothing is said when nothing is wrong');
{
  const m = /const _ccWhy=\(function\(\)\{([\s\S]*?)\n    \}\)\(\);/.exec(html);
  const b = m ? m[1] : '';
  is(/return bits\.join\(' · '\);/.test(b), true, 'the line is empty when the day balances');
  is(/\(_ccWhy\?'<div/.test(html), true, '…and an empty line draws nothing at all');
  // The Fark badge itself must be untouched: it is the thing that catches
  // the eye, and this only adds underneath it.
  is(/⚠️ Fark: '\+\(diff>0\?"\+":""\)\+'₺'\+diff\.toLocaleString\(\)/.test(html), true,
     'the Fark figure itself is unchanged');
  is(/✓ Tutuyor/.test(html), true, '…and a balanced day still just says Tutuyor');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
