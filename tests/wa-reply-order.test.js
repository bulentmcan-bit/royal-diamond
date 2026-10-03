// ═══════════════════════════════════════════════════════════════════════════
// The line that hid half the customers' messages.
//
// 3 Ekim 2026. The owner, in Piyzi's own panel: three messages from a lady
// asking for a lash appointment — "İyi gunler", "Yarin için randevu almak
// isterdim", "Kirpik için" — sent at 13:10 the day before. Not one of them in
// the salon's own inbox. "I have no record of this person at all."
//
// Piyzi had delivered all three. The webhook log showed 200 against each. The
// worker had stored them. They were in Firebase the whole time.
//
// The fault was one word in the query the app makes:
//
//     _fbDb.ref('rdns_wa_replies_v1').limitToLast(100)
//
// limitToLast() takes the last children BY KEY. Under a push id that means
// the newest, because push ids climb with the clock. These are not push ids —
// the worker keys every reply by Piyzi's deliveryId, 'evt_' plus twenty-four
// RANDOM hex characters. So "the last hundred" meant the hundred that sort
// highest in the ALPHABET, forever.
//
// Checked live that morning: exactly 100 records, running evt_88… to evt_fe…
// Every message whose id began evt_0… through evt_87… had never been asked
// for. Close to half of everything customers had written — including the
// "gelemiyorum" that cost two hours.
//
// Run:  node tests/wa-reply-order.test.js
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

console.log('1. the query asks the real question');
{
  is(/\.ref\('rdns_wa_replies_v1'\)\s*\.orderByChild\('ts'\)\.limitToLast\(300\)/.test(html), true,
     "the replies are ordered by ts — the time we write on every record");
  // The exact old shape must never reappear. This is the whole bug.
  is(/\.ref\('rdns_wa_replies_v1'\)\.limitToLast\(/.test(html), false,
     "and the bare limitToLast on this node is GONE — under random keys it means 'alphabetically last', not 'newest'");
  is(/indexOn.*ts|"\.indexOn": \["ts"\]/.test(html), true,
     '…with the Firebase index it wants written down beside it');
}

console.log('2. a query snapshot is read as a query snapshot');
{
  // s.val() on an ordered query gives an object whose key order is not
  // guaranteed. forEach() is the API that respects the ordering, and falling
  // back to val() keeps an old client working rather than showing nothing.
  is(/var m=\{\}; try\{ s\.forEach\(function\(c\)\{ m\[c\.key\]=c\.val\(\); \}\); \}catch\(e\)\{ m=s\.val\(\)\|\|\{\}; \}/.test(html), true,
     'the snapshot is walked with forEach, with val() as a fallback');
}

console.log('3. the keys really are random — the reason the old query failed');
{
  // Straight from the live data that morning, and from Piyzi's documented
  // shape: evt_ + 24 hex. Nothing in them climbs with the clock.
  const live = ['evt_88efb7af28fb44eeb06a4de7', 'evt_894ce58f49d6d7e4ca5c029f', 'evt_fe3d2fdfdc6ac04b85b51a7a'];
  is(live.every(k => /^evt_[0-9a-f]{24}$/.test(k)), true, 'a deliveryId is evt_ and 24 random hex characters');
  // The proof the old query was wrong, stated as arithmetic: sorting those
  // keys is sorting noise, so the newest message is as likely to be dropped
  // as the oldest.
  const sorted = live.slice().sort();
  is(sorted[0], 'evt_88efb7af28fb44eeb06a4de7', '…and sorting them is sorting noise, not time');
  // What the salon actually held: 100 records from evt_88 to evt_fe. The
  // window 0x00–0x87 was invisible — a third of a hex space it had no claim on.
  const lo = parseInt('88', 16), hi = 255;
  is(Math.round(((hi - lo + 1) / 256) * 100), 47, 'the visible slice was about 47% of the key space — the rest was never asked for');
}

console.log('4. the list itself still sorts newest-first');
{
  const i = html.indexOf('function rdWrList(');
  let d = 0, body = '';
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (!d) { body = html.slice(i, k + 1); break; } }
  }
  const rdWrList = new Function(body + '\nreturn rdWrList;')();
  const out = rdWrList({
    evt_ff: { phone: '905331112233', text: 'eski', ts: 1000 },
    evt_00: { phone: '905331112233', text: 'yeni', ts: 9000 },
    evt_7a: { phone: '905331112233', text: 'orta', ts: 5000 }
  });
  is(out.map(r => r.text), ['yeni', 'orta', 'eski'],
     'whatever the keys look like, the newest message is first');
  is(out[0].id, 'evt_00', '…and a key that sorts LAST alphabetically can still be the newest of all');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
