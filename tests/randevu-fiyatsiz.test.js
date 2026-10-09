// ═══════════════════════════════════════════════════════════════════════════
// FİYAT KUTUSU — randevu alırken ne yazar.  9 Ekim 2026.
//
// (Dosyanın adı "randevu-fiyatsiz" olarak kaldı: sabah kutu BOŞ kalsın diye
//  yazılmıştı. Akşam karar döndü, gerekçesiyle birlikte aşağıda duruyor. Adı
//  tarih olarak değerli; içeriği bugünün kuralıdır.)
//
// SABAH — "When we are making the initial appointment … I don't want the
// price to come out at that stage because the technician might be offering
// them designs." Kutuyu boşalttık; toplamı kutunun ALTINDA ayrı bir satırda
// gösterdik.
//
// AKŞAM, ekranda deneyince — "If I press number 2, I want it to come out
// where it says Çıkışta. I want it to be there, not at the bottom. That's
// confusing, not for me, for the others. If I then press number 5 then the
// figure … to add that on and change the price."
//
// İkincisi kazandı ve doğrusu da o: rakamın YAZILDIĞI yer ile GÖRÜNDÜĞÜ yer
// aynı olmalı. Tezgâhın arkasındaki kıza, altta duran ayrı bir rakam ile
// kutudaki boşluk iki ayrı şey gibi görünüyor.
//
// Sabahki endişe yine de karşılıksız değil, ve kuralın ikinci yarısı odur:
// sistem kendi yazdığı rakamı günceller, ELLE yazılana asla dokunmaz.
//
//   1. seçim kutuya düşer, ve her seçimde toplanır
//   2. seçim geri alınınca rakam da geri gider
//   3. elle yazılan rakam kutsaldır
//   4. okuma satırı ne olduğunu kelimeyle söyler
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
  is(box(dom), '1700', '2\'ye basıldı → kutuda ₺1.700, aşağıda değil KUTUDA');
  is(line(dom), 'Dolgu = ₺1.700 — farklıysa üzerine yazın.', '…ve altındaki satır neyin ne olduğunu söylüyor');
  is(dom.el['a-price'].dataset.rdAuto, '1700', '…sistem yazdığı rakamı sahipleniyor, ki sonra güncelleyebilsin');
}
{
  const dom = makeDom({ s1: 'Dolgu (Infill)', s2: 'Pedikür' });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(box(dom), '3400', '5\'e de basıldı → ₺1.700 + ₺1.700 = ₺3.400, kutudaki rakam DEĞİŞTİ');
  is(line(dom), 'Dolgu + Pedikür = ₺3.400 — farklıysa üzerine yazın.', '…ve ikisini birden adıyla okuyor');
}
{
  const dom = makeDom({ s1: 'Dolgu (Infill)', s2: 'Pedikür', d: 'D2', dp: 600 });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(box(dom), '4000', 'tasarım da eklendi → ₺4.000');
  is(line(dom), 'Dolgu + Pedikür + D2 = ₺4.000 — farklıysa üzerine yazın.', '…üçü birden tek satırda');
}

console.log('2. seçim geri alınınca rakam da geri gider');
{
  // Sistemin kendi yazdığı rakam, eski seçimin fiyatı olarak kutuda unutulmamalı.
  const dom = makeDom({ s1: 'Dolgu (Infill)', price: '4000', dataset: { rdAuto: '4000' } });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(box(dom), '1700', 'tasarım ve ikinci iş kaldırıldı → ₺4.000 kutuda UNUTULMADI, ₺1.700 oldu');
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
  is(ctx.rdApptPriceValue(), 3400, 'kutudaki ₺3.400 kayda da ₺3.400 olarak gider');
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
  is(/pr\.value = String\(k\.total\);/.test(html), true, 'toplam KUTUYA yazılıyor');
  is(/if\(cur && cur !== mine\)\{ try\{ rdApptPriceEcho\(\); \}catch\(e\)\{\} return; \}/.test(html), true, '…ve elle yazılmışsa hiç dokunulmuyor');
}


console.log('6. KOD kutusu — "put the code in, and it does the price automatically"');
{
  const dom = makeDom({ s1: 'Dolgu (Infill)', s2: 'Pedikür', d: 'D2', dp: 600 });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(dom.el['a-code'].value, '2 5 D2', 'seçimler KOD kutusunu da doldurur — kız ne yazacağını görür, ezberlemez');
  is(box(dom), '4000', '…ve lira yanındaki kutuya düşer');
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

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
