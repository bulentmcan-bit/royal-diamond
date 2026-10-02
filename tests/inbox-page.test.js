// ═══════════════════════════════════════════════════════════════════════════
// Gelen Kutusu — the messages get a room of their own.
//
// Piyzi's answer to the two-number problem (Şahin, 2 Ekim 2026) was not a
// second telephone and not Coexistence: "gelen mesajları size iletiyoruz
// (webhook ile alabilirsiniz) ... uygulamanızda bir gelen kutusu
// oluşturabilirsiniz." They already hand us every incoming message, and we
// already store every one. The messages were never missing. They were in a
// panel that stayed SHUT until somebody clicked it, on a dashboard nobody
// scrolled, which is precisely how "Hello ı cannot come today" went unread
// and cost the salon two hours.
//
// So this test is about one thing: can it be walked past?
//
// Run:  node tests/inbox-page.test.js
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

console.log('1. it is a page, not a panel somebody has to find');
{
  is(/<div class="page" id="page-inbox">/.test(html), true, 'there is a page-inbox');
  is(/goto\(&#39;inbox&#39;,this\)/.test(html), true, '…reachable from the sidebar');
  is(/inbox:\["Gelen Kutusu"/.test(html), true, '…with a title of its own');
  // It must sit ABOVE the WhatsApp Centre: that page is for messages going
  // OUT, and the ones coming in are the ones that cost money when missed.
  is(html.indexOf("goto(&#39;inbox&#39;,this)") < html.indexOf("goto(&#39;whatsapp&#39;,this)"), true,
     '…and above WhatsApp Merkezi in the sidebar, because incoming beats outgoing');
  is(/id="page-inbox"[\s\S]{0,900}id="inbox-list"/.test(html), true, '…and the page holds the list');
}

console.log('2. the badge is the whole point');
{
  is(/id="wa-inbox-badge"/.test(html), true, 'the sidebar carries its own badge');
  is(/id="wa-inbox-badge"[^>]*background:#c0392b/.test(html), true, '…in red, not the quiet house colour');
  is(/function paintInboxBadge\(n\)\{/.test(html), true, '…painted by its own function');
  is(/b\.style\.display = n \? '' : 'none';/.test(html), true,
     '…and HIDDEN at zero — a badge that always shows a number stops being a signal');
  // It counts UNREAD, not everything. A count of 400 old messages tells nobody
  // anything; a count of 2 unread is a job.
  is(/paintInboxBadge\(unread\.length\)/.test(html), true, '…and it counts the UNREAD ones, not the lot');
  is(/0539 140 3333/.test(html.slice(html.indexOf('id="page-inbox"'), html.indexOf('id="page-inbox"') + 1400)), true,
     'and the page says plainly which number the customers are writing to');
}

console.log('3. one renderer, so the page cannot fall behind the panel');
{
  // There are several render() functions in this file; the one that matters is
  // the WhatsApp slice's, which sits just after paintInboxBadge.
  const from = html.indexOf('function paintInboxBadge');
  const r = /function render\(\)\{([\s\S]*?)\n  \}/.exec(html.slice(from));
  const b = r ? r[1] : '';
  is(/var targets=\[document\.getElementById\('dash-wa-replies-list'\), document\.getElementById\('inbox-list'\)\]/.test(b), true,
     'the dashboard panel and the page are filled from the same rows');
  is(/targets\.forEach\(function\(el\)\{ el\.innerHTML=html; \}\);/.test(b), true, '…by the same write');
  is((b.match(/el\.innerHTML=/g) || []).length >= 2, true, '…including the empty state, so neither is left stale');
  is(/var ic=document\.getElementById\('inbox-count'\)/.test(b), true, '…and the page has the unread count too');
}

console.log('4. opening the page draws it');
{
  is(/window\.rdWrRefresh=function\(\)\{ try\{ render\(\); \}catch\(e\)\{\} \};/.test(html), true,
     'the slice exposes a refresh');
  is(/if\(page==="inbox"\)\{ try\{ if\(typeof rdWrRefresh==="function"\) rdWrRefresh\(\); \}catch\(e\)\{\} \}/.test(html), true,
     '…and goto calls it, so the page is never blank waiting on the next message');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
