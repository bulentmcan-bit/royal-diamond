// ═══════════════════════════════════════════════════════════════════════════
// The WhatsApp key, somewhere a person can find it.
//
// The key is per DEVICE. A device without one sends nothing at all: no booking
// confirmation, no 24-hour or 2-hour reminder, and reception cannot answer a
// customer from it. Silently — no error, nothing in the diary to show for it.
//
// The salon's tablet ran that way for who knows how long. Nobody found out
// until a customer said she had never been sent anything, and even then the
// only sign of it was one line of red text inside a reply box that has to be
// opened to be seen.
//
// And the only control was a button inside the "24 Saat Kala Hatırlatmalar"
// panel — which carries style="display:none" and is shown only when reminders
// are due. On the tablet there was usually nothing to press. The owner opened
// the menu, looked down the whole list, and said: "I can't find it."
//
// Run:  node tests/wa-key-settings.test.js
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

console.log('1. it lives in Ayarlar, which is always reachable');
{
  const page = html.slice(html.indexOf('id="page-settings"'), html.indexOf('id="page-settings"') + 2600);
  is(/🤖 WhatsApp — bu cihaz/.test(page), true, 'there is a card for it on the Settings page');
  is(/id="rd-wa-key-state"/.test(page), true, '…showing this device’s state');
  is(/onclick="rdWaSetup\(\)"/.test(page), true, '…and the same setter the old button used');
  // Settings is a permanent sidebar item. The 24-saat panel is not.
  is(/goto\(&#39;settings&#39;,this\)/.test(html), true, 'Ayarlar is in the sidebar');
  is(/<div class="r24-panel" id="dash-r24-panel" style="display:none;">/.test(html), true,
     'whereas the panel the button was hidden in is display:none by default');
  // It must come FIRST on the page: it is the thing somebody is hunting for.
  const iKey = html.indexOf('🤖 WhatsApp — bu cihaz'), iBackup = html.indexOf('📂 Yedekten Geri Yükle');
  is(iKey > 0 && iKey < iBackup, true, '…and it sits at the top of Settings, before the backup card');
}

console.log('2. it says what being off COSTS, not just that it is off');
{
  const m = /function rdWaKeyCard\(\)\{([\s\S]*?)\n\}/.exec(html);
  const b = m ? m[1] : '';
  is(/⛔ KAPALI — bu cihaz HİÇBİR mesaj göndermiyor/.test(b), true,
     'off is stated as a fault, not as a setting somebody chose');
  is(/onay göndermez ve hatırlatma kurmaz/.test(b), true, '…naming what stops: confirmations and reminders');
  is(/Gelen Kutusu/.test(b), true, '…and that reception cannot reply either');
  is(/✅ AÇIK — bu cihaz mesaj gönderiyor/.test(b), true, 'and on is stated just as plainly');
  is(/#c0392b/.test(b) && /#1e7a44/.test(b), true, '…in red and green, so it reads from across the desk');
}

console.log('3. it is painted when it needs to be');
{
  is(/if\(page==="settings"\)\{ try\{ rdShowWhoAmI\(\); \}catch\(e\)\{\} try\{ rdWaKeyCard\(\); \}catch\(e\)\{\} \}/.test(html), true,
     'opening Ayarlar draws it');
  // And again after the key is entered, or the card would still say KAPALI
  // on the very screen that just turned it on.
  is(/if\(b\) b\.textContent = rdWaOn\(\) \? '🤖 Oto: AÇIK' : '🤖 Oto: KAPALI';\s*\n\s*try\{ rdWaKeyCard\(\); \}catch\(e\)\{\}/.test(html), true,
     '…and setting the key repaints it, so it cannot still read KAPALI afterwards');
  is(/try\{ rdWaKeyCard\(\); \}catch\(e\)\{\}/.test(html), true, 'guarded, so an old page without the card cannot throw');
}

console.log('4. the old button still works');
{
  // Reception may know it by now. Removing it would be a second surprise.
  is(/id="dash-wa-auto"[\s\S]{0,260}onclick="rdWaSetup\(\)"/.test(html), true,
     'the 🤖 button in the reminders panel is untouched');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
