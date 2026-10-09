// ═══════════════════════════════════════════════════════════════════════════
// RANDEVU ALIRKEN FİYAT YAZILMAZ.  9 Ekim 2026.
//
// "When we are making the initial appointment, we put down the name and what
//  they want done. I don't want the price to come out at that stage because
//  the technician might be offering them designs or something, so I don't want
//  the price to go on at that stage."
//
// Randevu alınırken iş daha belli değildir. Kız tasarım önerir, müşteri ayağı
// da ekletir, jel yerine dolgu çıkar. O anda kutuya düşen rakam iki şey yapar:
// müşteriye söz verir, ve kasaya "bu işin fiyatı buydu" diye geçer. İkisi de
// yanlış. Fiyat ÇIKIŞTA yazılır.
//
// Bu dosya üç şeyi çiviliyor:
//   1. Hizmet (ve tasarım) seçmek kutuya rakam YAZMAZ — hiçbir seçimde.
//   2. Sistemin daha önce yazdığı bir rakam kalmışsa, hizmet değişince
//      temizlenir: eski hizmetin fiyatı kutuda unutulmaz.
//   3. ELLE yazılan rakama ya da koda dokunulmaz — çıkış hâlâ çalışır.
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

// ── the real code, lifted out of the page ────────────────────────────────
const codes = html.slice(html.indexOf('var RD_SVC_CODES'), html.indexOf('function rdDtEcho'));
const priceFns = html.slice(html.indexOf('  window.rdApptPriceFor = function(){'),
                            html.indexOf('  function wire(){'));
if (!codes || !priceFns) { console.log('✗ could not find the code in index.html'); process.exit(1); }

// ── a dialog made of three boxes, which is all these functions touch ─────
function makeDom(over) {
  over = over || {};
  const el = {
    'a-service': { value: over.service || '', options: [], selectedIndex: -1 },
    'a-addon':   { value: over.addon || '', selectedIndex: 0,
                   options: [{ getAttribute: k => (k === 'data-p' ? String(over.addonPrice || 0) : null) }] },
    'a-price':   { value: over.price == null ? '' : String(over.price), dataset: over.dataset || {} },
    'a-price-hint': { textContent: over.hint || '' }
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
const GUIDE = 'Randevuda boş kalır — fiyat çıkışta yazılır (lira ya da kod: 1-10, D1-D6).';

console.log('1. seçim yapmak fiyat yazmaz');
{
  const dom = makeDom({ service: 'Jel Başlangıç (Full Set)' });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(dom.el['a-price'].value, '', 'Jel Başlangıç seçildi — kutu BOŞ (eskiden 1900 düşerdi)');
  // 9 Ekim, ikinci tur: satır artık seçilenlerin TOPLAMINI da söylüyor —
  // ama kutuya hâlâ hiçbir şey yazmıyor, ki bu dosyanın derdi odur.
  is(/^Seçilenler: Jel Başlangıç \(Full Set\) = ₺1\.900 — kutu boş kalır/.test(dom.el['a-price-hint'].textContent), true,
     '…ve altındaki satır seçileni, tutarını ve kutunun boş kalacağını söylüyor');
  is(dom.el['a-price'].dataset.rdAuto, undefined, 'sistem hiçbir rakamı sahiplenmedi');
}
{
  const dom = makeDom({ service: 'Medikal Pedikür', addonPrice: 750 });   // 2500 + D3
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(dom.el['a-price'].value, '', 'hizmet + tasarım birlikte seçildi — yine BOŞ');
  is(ctx.rdApptPriceFor(), 3250, '…oysa liste fiyatı hâlâ doğru hesaplanıyor: ₺2.500 + ₺750');
}
{
  const dom = makeDom({ service: 'Dolgu (Infill)' });
  const ctx = load(dom);
  ctx.rdApptAutoPrice(); ctx.rdApptAutoPrice(); ctx.rdApptAutoPrice();
  is(dom.el['a-price'].value, '', 'üç kere seçim değiştirildi — kutu hâlâ boş');
}

console.log('2. sistemin eski rakamı temizlenir');
{
  // Eski sürümden kalmış bir kayıt: kutuda sistemin yazdığı 1900 var.
  const dom = makeDom({ service: 'Dolgu (Infill)', price: '1900', dataset: { rdAuto: '1900' } });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(dom.el['a-price'].value, '', 'hizmet Dolgu\'ya çevrildi: Jel\'in 1900\'ü kutuda UNUTULMADI, silindi');
  is(dom.el['a-price'].dataset.rdAuto, undefined, '…ve sistem artık hiçbir rakamı sahiplenmiyor');
  is(/kutu boş kalır, çıkışta yazılır/.test(dom.el['a-price-hint'].textContent), true, '…satır yine çıkışı söylüyor');
}

console.log('3. ELLE yazılana dokunulmaz — çıkış çalışmaya devam eder');
{
  const dom = makeDom({ service: 'Dolgu (Infill)', price: '2000' });
  const ctx = load(dom);
  ctx.rdApptAutoPrice();
  is(dom.el['a-price'].value, '2000', 'kız 2000 yazmış: hizmet değişse bile silinmez');
  is(dom.el['a-price-hint'].textContent, '→ ₺2.000', '…ve okunur, çünkü yanlış rakam ekranda görünmeli');
}
{
  const dom = makeDom({ price: '2 D3' });
  const ctx = load(dom);
  ctx.rdApptPriceEcho();
  is(dom.el['a-price'].value, '2 D3', 'çıkışta kod yazmak hâlâ serbest');
  is(dom.el['a-price-hint'].textContent, '→ Dolgu + D3 = ₺2.450', '…ve kelimeyle okunuyor: Dolgu ₺1.700 + D3 ₺750');
  is(ctx.rdApptPriceValue(), 2450, '…kaydedilecek rakam ₺2.450');
}
{
  const dom = makeDom({ price: '' });
  const ctx = load(dom);
  ctx.rdApptPriceEcho();
  is(dom.el['a-price-hint'].textContent, GUIDE, 'yazılanı silince satır yine "çıkışta" diyor, boş kalmıyor');
  is(ctx.rdApptPriceValue(), 0, 'boş kutu = ₺0: randevu fiyatsız kaydedilir, kasaya hiçbir şey geçmez');
}

console.log('4. sayfanın kendisi');
{
  is(/placeholder="Çıkışta — kod veya ₺ \(örn\. 2 D3\)"/.test(html), true, 'kutunun içindeki soluk yazı da "Çıkışta" diyor');
  is(/const pr=document\.getElementById\('a-price'\); if\(pr\)\{ pr\.value=''; delete pr\.dataset\.rdAuto; \}/.test(html), true, 'yeni + Randevu açılınca kutu ve sistemin işareti sıfırlanıyor');
  is(/pr\.value = String\(v\); pr\.dataset\.rdAuto = String\(v\);/.test(html), false, 'fiyatı kutuya yazan eski satır sayfada KALMADI');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
