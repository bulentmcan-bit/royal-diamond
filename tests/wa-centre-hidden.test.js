// ═══════════════════════════════════════════════════════════════════════════
// WhatsApp Merkezi, out of the sidebar.
//
// "Do I need to see this page if it's on automation?" — No. Checked on the
// live salon the same morning: the key is on the device, 28 of today's 30
// appointments already had their 24-hour reminder sent, and every one carries
// the worker's own scheduled-message record. One item sat in the manual queue.
//
// So the page offers work that is already done, its badge makes it look like
// something is waiting, and pressing Generate on a customer who has had her
// reminder sends her a SECOND one. "The less traffic the better."
//
// HIDDEN, not deleted: gotoWAfor() still opens it from a client card, and the
// badge element still exists for the three places that write to it. Deleting
// a page that other code navigates to is how you trade a tidy sidebar for a
// broken button.
//
// Run:  node tests/wa-centre-hidden.test.js
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

console.log('1. it is gone from the sidebar');
{
  const nav = (html.split('\n').find(l => l.includes("goto(&#39;whatsapp&#39;,this)") && l.includes('nav-item')) || '');
  is(!!nav, true, 'the nav item is still in the markup');
  is(/class="nav-item" style="display:none;"/.test(nav), true, '…and hidden, so nobody is invited to work that is already done');
}

console.log('2. but the page and everything pointing at it still work');
{
  is(/<div class="page" id="page-whatsapp">/.test(html), true, 'the page itself is untouched');
  is(/function gotoWAfor\(cid\)\{goto\("whatsapp",null\);/.test(html), true,
     '…and a client card can still open it — deleting the page would have broken that button');
  is(/whatsapp:\["WhatsApp Centre"/.test(html), true, '…with its title intact, so the header is not blank when it opens');
  // Three places write the badge. If the element went, they would throw.
  is(/id="wa-badge"/.test(html), true, 'the badge element survives');
  is((html.match(/getElementById\("wa-badge"\)/g) || []).length >= 3, true,
     '…because several places still write to it and would throw on null');
}

console.log('3. the inbox is the one that stays');
{
  // The whole point: incoming messages are the ones that cost money when
  // missed. That nav item must NOT be hidden with it.
  const inbox = (html.split('\n').find(l => l.includes("goto(&#39;inbox&#39;,this)")) || '');
  is(!!inbox, true, 'Gelen Kutusu is still in the sidebar');
  is(/style="display:none;"/.test(inbox), false, '…and visible — it is the one that matters');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
