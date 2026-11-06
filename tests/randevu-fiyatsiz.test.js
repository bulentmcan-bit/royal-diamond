// ═══════════════════════════════════════════════════════════════════════════
// FİYAT KUTUSU — randevu alırken ne yazar.  9 Ekim 2026 → 6 Kasım 2026.
//
// SABAH (9 Ekim) — "When we are making the initial appointment … I don't want
// the price to come out at that stage because the technician might be
// offering them designs." Kutuyu boşalttık.
//
// AKŞAM (9 Ekim) — "If I press number 2, I want it to come out where it says
// Çıkışta. I want it to be there, not at the bottom." Kutu geri geldi.
//
// 6 KASIM 2026 — ve ikisi de haklıydı, çünkü soru yanlıştı. Mesele rakamın
// kutuda mı altta mı duracağı değildi; TEK EKRANIN İKİ İŞ YAPMASIYDI. O ekran
// hem randevu yazıyor hem para alıyordu, ve ikisini ayırmak için uydurduğumuz
// her kural niyeti tahmin etmekti. 4 Kasım'da o tahminlerden biri çıkışı iki
// gün boyunca tamamen durdurdu.
//
// Artık para o ekranda DEĞİL. Randevu ekranı randevudur; fiyat ✓ Çıkışı
// Tamamla panelindedir ve orada boş açılır. "2'ye bas, lira kutuya düşsün"
// kuralı yaşıyor — ama çıkış kutusunda, doğru anda. Bu dosya artık randevu
// tarafının SESSİZ kaldığını doğrular; çıkış tarafı para-sonda.test.js'te.
//
//   1. seçim kutuya DÜŞMEZ — randevuya fiyat yazılmaz
//   2. okuma satırı yine ne olduğunu kelimeyle söyler
//   3. elle yazılan rakam hâlâ kutsaldır
//   4. toplam tek yerden hesaplanır
//
// Çalıştırma:  node tests/randevu-fiyatsiz.test.js
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
const codes = html.slice(html.indexOf('var RD_SVC_CODES'), html.indexOf('function rdDtEcho'));
const priceFns = html.slice(html.indexOf('  window.rdApptPriceFor = function(){'), html.indexOf('  function wire(){'));
if (!codes || !priceFns) { console.log('✗ could not find the code in index.html'); process.exit(1); }

// ── üç kutuluk bir diyalog: hizmet, 2. hizmet, tasarım, fiyat ────────────
function makeDom(o) {
  o = o || {};
  const el = {
    'a-service':  { value: o.s1 || '' },
    'a-service2': { value: o.s2 || '' },
    'a-addon':    { value: o.d || '', selectedIndex: 0,
                    options: [{ getAttribute: k => (k === 'data-p' ? String(o.dp || 0) : null) }] },
    'a-price':    { value: o.price == null ? '' : String(o.price), dataset: o.dataset || {} },
    'a-code':     { value: o.code || '', dataset: o.codeDataset || {} },
    'a-price-hint': { textContent: '' }
  };
  return { el, document: { getElementById: id => el[id] || null } };
}
function load(dom) {
  const ctx = { console, document: dom.document };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(codes + '\n' + priceFns, ctx);
  return ctx;
}
const box  = d => d.el['a-price'].value;
const line = d => d.el['a-price-hint'].textContent;

console.log('1. seçim kutuya düşer ve toplanır');
{
  const dom = makeDom({ s1: 'Dolgu (Infill)' });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(box(dom), '', '2\'ye basıldı → randevu kutusu BOŞ kalır (6 Kasım: para bu ekranda değil)');
  is(line(dom), 'Dolgu = ₺1.700 — farklıysa üzerine yazın.', '…ama altındaki satır tutarı yine söyler');
  is(dom.el['a-price'].dataset.rdAuto, undefined, '…ve sistem hiçbir rakamı sahiplenmez, çünkü hiçbirini yazmaz');
}
{
  const dom = makeDom({ s1: 'Dolgu (Infill)', s2: 'Pedikür' });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(box(dom), '', '5\'e de basıldı → kutu yine boş; toplam yalnızca okuma satırında');
  is(line(dom), 'Dolgu + Pedikür = ₺3.400 — farklıysa üzerine yazın.', '…ve ikisini birden adıyla okuyor');
}
{
  const dom = makeDom({ s1: 'Dolgu (Infill)', s2: 'Pedikür', d: 'D2', dp: 600 });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(box(dom), '', 'tasarım da eklendi → kutu hâlâ boş');
  is(line(dom), 'Dolgu + Pedikür + D2 = ₺4.000 — farklıysa üzerine yazın.', '…üçü birden tek satırda, okuma satırında');
}

console.log('2. seçim geri alınınca rakam da geri gider');
{
  // Sistemin kendi yazdığı rakam, eski seçimin fiyatı olarak kutuda unutulmamalı.
  const dom = makeDom({ s1: 'Dolgu (Infill)', price: '4000', dataset: { rdAuto: '4000' } });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(box(dom), '', 'tasarım ve ikinci iş kaldırıldı → kutuda unutulacak bir rakam zaten yok');
}
{
  const dom = makeDom({ price: '1700', dataset: { rdAuto: '1700' } });   // hiçbir şey seçili değil
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(box(dom), '', 'hizmet geri alındı → kutu boşalır');
  is(/Kod kutusuna duvardaki numaraları yazın — örnek: 2 5 D2/.test(line(dom)), true, '…ve satır kod kutusunu, örneğiyle birlikte gösterir');
}

console.log('3. elle yazılan rakam kutsaldır');
{
  // Resepsiyon indirim yapar, yuvarlar, hatır sayar. Sistem onunla tartışırsa
  // kasaya yanlış rakam girer — bu testin varlık sebebi odur.
  const dom = makeDom({ s1: 'Dolgu (Infill)', price: '2000' });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(box(dom), '2000', 'kız 2000 yazmış: hizmet değişse bile silinmez');
  is(line(dom), '→ ₺2.000', '…ve okunur, çünkü yanlış rakam ekranda görünmeli');
}
{
  const dom = makeDom({ s1: 'Dolgu (Infill)', price: '2 5 D3' });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(box(dom), '2 5 D3', 'elle yazılan KOD da öyle: sistem üzerine yazmaz');
  is(ctx.rdApptPriceValue(), 4200, '…ve ₺4.200 olarak kaydedilir');
}

console.log('4. kaydedilen rakam');
{
  const dom = makeDom({ s1: 'Dolgu (Infill)', s2: 'Pedikür' });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(ctx.rdApptPriceValue(), 0, 'randevu kaydına fiyat GİTMEZ — çıkış yapmadan para yazılmaz');
  is(ctx.rdApptPickedSum(), { parts: ['Dolgu', 'Pedikür'], codes: ['2','5'], total: 3400 }, 'toplam tek yerden hesaplanıyor — kutu, kod ve satır aynı şeyi söyler');
}

console.log('5. sayfanın kendisi');
{
  // Kutunun İÇİNDEKİ soluk örnek, hatırlanmış bir kayıt sanıldı — "it
  // remembers the old work we've done previously. That should not happen."
  // Sanılmaz hâle getirmenin en kestirme yolu: kutunun içini boş bırakmak,
  // örneği ALTTAKİ satırda vermek.
  is(/id="a-code"[\s\S]{0,120}placeholder=""/.test(html), true, 'KOD kutusunun içi boş — dolu sanılacak soluk yazı yok');
  is(/Kod kutusuna duvardaki numaraları yazın — örnek: 2 5 D2/.test(html), true, '…örnek kutunun ALTINDA veriliyor');
  is(/fiyat kutusuna ikisinin toplamı düşer/.test(html), true, '2. hizmet kutusunun altındaki yazı da aynı şeyi söylüyor');
  is(/pr\.value = String\(k\.total\);/.test(html), false, 'toplam artık randevu kutusuna YAZILMIYOR');
  is(/id="ck-price"/.test(html), true, '…çünkü para kutusu çıkış panelinde (para-sonda.test.js)');
  is(/if\(cur && cur !== mine\)\{ try\{ rdApptPriceEcho\(\); \}catch\(e\)\{\} return; \}/.test(html), true, '…ve elle yazılmışsa hiç dokunulmuyor');
}


console.log('6. KOD kutusu — "put the code in, and it does the price automatically"');
{
  const dom = makeDom({ s1: 'Dolgu (Infill)', s2: 'Pedikür', d: 'D2', dp: 600 });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(dom.el['a-code'].value, '2 5 D2', 'seçimler KOD kutusunu da doldurur — kız ne yazacağını görür, ezberlemez');
  is(box(dom), '', '…ama lira randevu kutusuna düşmez; o iş çıkışta yapılır');
}
{
  // Duvardaki listeden okuyup elle yazmak: asıl istenen bu.
  const dom = makeDom({ code: '3 7' });
  const ctx = load(dom);
  ctx.rdApptCodeTyped();
  is(box(dom), '2200', "KOD'a 3 7 yazıldı → ₺1.200 + ₺1.000 = ₺2.200 kendiliğinden");
  is(/Klasik Manikür \+ Renkli Jel — Ayak = ₺2\.200/.test(line(dom)), true, '…ve ikisini adıyla okur');
}
{
  const dom = makeDom({ code: '99' });
  const ctx = load(dom);
  ctx.rdApptCodeTyped();
  is(line(dom), '\u26A0 Tanınmayan kod', 'olmayan bir kod sessizce ₺0 yazmaz, UYARIR');
  is(box(dom), '', '…ve fiyat kutusuna hiçbir şey koymaz');
}
{
  // Elle girilen lira her zaman kazanır — kasaya yanlış rakam girmesin.
  const dom = makeDom({ code: '2', price: '1500' });
  const ctx = load(dom);
  ctx.rdApptPriceEcho();
  is(box(dom), '1500', 'FİYAT elle yazıldıysa kod onu ezmez');
  is(ctx.rdApptPriceValue(), 1500, '…ve kaydedilen de ₺1.500');
}
{
  const dom = makeDom({ code: '2 5', price: '3400', dataset: { rdAuto: '3400' } });
  const ctx = load(dom);
  dom.el['a-code'].value = '';
  ctx.rdApptCodeTyped();
  is(box(dom), '', 'kod silinince sistemin yazdığı lira da gider');
}

console.log('7. tuş takımı — basılan kod eklenir, kutu kendini bırakır');
{
  // "I want ALL to clear once the price lands." Basılan şey ekranda basılı
  // kalmaz; yapılan işin kaydı KOD kutusudur.
  const dom = makeDom({});
  const ctx = load(dom);
  ctx.rdApptAddCode('2');
  is([dom.el['a-code'].value, box(dom)], ['2', '1700'], '2 basıldı → kod "2", lira ₺1.700');
  ctx.rdApptAddCode('5');
  is([dom.el['a-code'].value, box(dom)], ['2 5', '3400'], '…5 basıldı → EKLENDİ, "2 5" ve ₺3.400');
  ctx.rdApptAddCode('D3');
  is([dom.el['a-code'].value, box(dom)], ['2 5 D3', '4200'], '…D3 de eklendi → ₺4.200');
  is(ctx.rdCodeServiceName(), 'Dolgu (Infill) + Pedikür', 'randevuya yazılacak iş adı kodlardan okunur — tasarım adın parçası değil');
  // rdApptServiceValue sayfanın başka bir yerinde tanımlı (bu dosya yalnızca
  // fiyat kutusunun kodunu yükler); onun kodları önce okuduğu
  // tests/ikinci-hizmet.test.js'te çivilendi.
}
{
  // Aynı işe iki kere basmak adı iki kere yazmasın.
  const dom = makeDom({ code: '2 2' });
  const ctx = load(dom);
  is(ctx.rdCodeServiceName(), 'Dolgu (Infill)', 'aynı koda iki kere basılırsa ad bir kere yazılır');
  ctx.rdApptCodeRecalc();
  is(box(dom), '3400', '…ama PARA iki kere sayılır: iki dolgu iki dolgudur');
}
{
  const dom = makeDom({ code: '2 5 D3', price: '4200', dataset: { rdAuto: '4200' } });
  const ctx = load(dom);
  ctx.rdApptClearWork();
  is([dom.el['a-code'].value, box(dom), dom.el['a-service'].value, dom.el['a-service2'].value, dom.el['a-addon'].value],
     ['', '', '', '', '0'], 'Temizle → kod, lira ve üç kutunun üçü birden sıfırlanır');
}
{
  // Elle yazılan lira, tuşlara basmaya devam edilse bile korunur.
  const dom = makeDom({ code: '2', price: '1500' });
  const ctx = load(dom);
  ctx.rdApptAddCode('5');
  is(box(dom), '1500', 'FİYAT elle yazılmışsa tuşlar onu ezmez');
  is(/Fiyat elle yazıldı/.test(line(dom)), true, '…ve satır bunu açıkça söyler');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
