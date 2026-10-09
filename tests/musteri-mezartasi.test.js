// ═══════════════════════════════════════════════════════════════════════════
// Bir müşteriyi silmek, KOMŞUSUNU silmeyecek.
//
// 8 Ekim 2026: duplicate ve telefonsuz kayıtlar temizlendi. 6 müşteri silindi.
// 53 müşteri kayboldu ve 304 randevu "?" olarak kaldı.
//
// Sebep tek satırdaydı. Silinen müşterinin mezar taşı _rdIdKey ile, yani
// id'nin NOKTADAN ÖNCEKİ kısmıyla yazılıyordu:
//
//     1779103044930.6755   silindi
//     clientTomb['1779103044930'] = <damga>        ← kuyruk atıldı
//
// Müşteri listesi tek seferde içeri alındığı için yüzlerce müşteri aynı
// milisaniyeyi paylaşıyor; sadece ondalık kuyrukta ayrılıyorlar. Okuma
// tarafı da aynı kısaltmaya düşüyordu:
//
//     _clientTombHas(k) → clientTomb[k] || clientTomb[_rdIdKey(k)]
//
// …yani 1779103044930.965, 1779103044930.7332 ve o milisaniyedeki herkes
// "silinmiş" sayıldı. Tek anahtar 22 kişiyi götürdü.
//
// Firebase anahtarında nokta yasaktır — kısaltmanın sebebi oydu. Çözüm
// kısaltmak değil, noktayı alt çizgiye çevirmek: her id kendi anahtarını
// alır ve kimse komşusunu sürüklemez.
//
// Bugün listede hâlâ ondalık id taşıyan 140 müşteri var. Bu dosya, onlardan
// birini silmenin bir daha diğerlerini götürmediğini tutar.
//
// Çalıştırma:  node tests/musteri-mezartasi.test.js
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

// ── lift the three functions out and run them for real ───────────────────
const grab = (name) => {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  // walk braces to the end of the function
  let d = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (!d) return html.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
};
const ctx = { clientTomb: {}, clientStamps: {}, Date: Date };
vm.createContext(ctx);
vm.runInContext([grab('_rdIdKey'), grab('_rdTombKey'), grab('_clientTombHas')].join('\n'), ctx);

console.log('1. every customer gets a key of her own');
{
  is(ctx._rdTombKey('1779103044930.6755'), '1779103044930_6755', 'the dot becomes an underscore, nothing is cut off');
  is(ctx._rdTombKey('1779103044930'), '1779103044930', 'a plain integer id is unchanged');
  is(ctx._rdTombKey('1779103044930.965') === ctx._rdTombKey('1779103044930.6755'), false,
     'two customers from the same millisecond get DIFFERENT keys');
  // Firebase refuses . # $ [ ] / in a key — that restriction is why the old
  // code truncated. The underscore form is legal, so nothing is lost.
  is(/[.#$\[\]/]/.test(ctx._rdTombKey('1779103044930.6755')), false, '…and the key is still legal in Firebase');
}

console.log('2. deleting one customer does not delete her neighbours');
{
  ctx.clientTomb = { '1779103044930_6755': 1760000000000 };
  is(!!ctx._clientTombHas('1779103044930.6755'), true, 'the one actually deleted reads as deleted');
  ['1779103044930.965','1779103044930.7332','1779103044930.201','1779103044930'].forEach(n =>
    is(!!ctx._clientTombHas(n), false, `…and ${n} is NOT — this is the bug that cost 53 customers`));
}

console.log('3. the 8 Ekim damage cannot repeat');
{
  // The real keys from that day, and the real customers they swallowed.
  ctx.clientTomb = { '1779103044929':1, '1779103044930':1, '1779103044931':1,
                     '1779103044932':1, '1779103044933':1, '1779103044957':1, '1779103045023':1 };
  const swallowed = ['1779103044930.6755','1779103044930.965','1779103044930.7332',
                     '1779103044931.9824','1779103044932.7686','1779103044933.2192',
                     '1779103044929.4993','1779103044957.9568','1779103045023.9568'];
  swallowed.forEach(n => is(!!ctx._clientTombHas(n), false, `${n} is no longer hidden by an integer key`));
  // The six he DID mean to delete carry plain integer ids, so they stay gone.
  ['1779103044930','1779103045090'].forEach(n => {
    ctx.clientTomb[n] = 1;
    is(!!ctx._clientTombHas(n), true, `${n} — a real deletion — still reads as deleted`);
  });
}

console.log('4. the page itself is wired to the new key');
{
  is(/const kRaw=String\(id\), k=_rdTombKey\(kRaw\);/.test(html), true, 'clientTombAdd writes the per-customer key');
  is(html.includes('const kRaw=String(id), k=_rdIdKey(kRaw);'), false, '…the truncating version is gone');
  // Bookings carry the identical line. No booking has a decimal id today, so
  // it has never gone off — but it is one character of difference from doing
  // to the diary what it did to the customer list.
  is(/function _apptTombHas\(k\)\{ return apptTomb\[String\(k\)\]\|\|apptTomb\[_rdTombKey\(k\)\]\|\|0; \}/.test(html), true,
     'the appointment tombstones got the same fix');
  is(html.includes('return apptTomb[k]||apptTomb[_rdIdKey(k)]||0;'), false, '…and their truncating fallback is gone too');
  is(/function _clientTombHas\(k\)\{ return clientTomb\[String\(k\)\]\|\|clientTomb\[_rdTombKey\(k\)\]\|\|0; \}/.test(html), true,
     'the read side no longer falls back to the integer part');
  is(html.includes('return clientTomb[k]||clientTomb[_rdIdKey(k)]||0;'), false, '…that fallback is gone for good');
  // _rdIdKey still has a job: repairing illegal keys that arrive from elsewhere.
  is(/function _rdIdKey\(id\)/.test(html), true, '_rdIdKey stays — it still repairs keys arriving from the cloud');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
