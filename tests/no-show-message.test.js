/* The no-show message — the 🚫 button's polite follow-up.
   A booking nobody cancelled costs the hour twice. When reception closes an
   appointment as GELMEDİ the page now OFFERS to send the customer a message
   (WhatsApp hand-off, the same road the ⭐ review ask takes — no Meta
   template, no API fee). It must never send by itself: some absences have
   reasons a message would insult, so a confirm stands in front of it. */
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let fails = 0, n = 0;
const is = (got, want, what) => {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log('FAIL: ' + what + '\n  got:  ' + JSON.stringify(got) + '\n  want: ' + JSON.stringify(want)); }
};
const has = (hay, needle, what) => { n++; if (String(hay).indexOf(needle) < 0) { fails++; console.log('FAIL: ' + what + ' — missing: ' + needle); } };

// ── 1. nsMsg, cut out of the page and run ────────────────────────────────
const cut = (name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found in index.html');
  let d = 0, started = false, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) { j++; break; } }
  }
  return src.slice(i, j);
};
const ctx = { NS_PHONE: '0548 893 33 33', console };
vm.createContext(ctx);
vm.runInContext(cut('nsMsg'), ctx);

const m = ctx.nsMsg('Ayşe', '14:00');
has(m, 'Ayşe', 'the message greets her by name');
has(m, '14:00', 'and names the hour she was expected');
has(m, 'yalnızca size ayrılır', 'it says the hour was reserved for her alone');
has(m, 'bekleme listemizdeki', 'and that somebody else missed out');
has(m, 'tek bir mesaj yeterli', 'it asks for a message next time');
has(m, '0548 893 33 33', 'the salon number is in it');
has(m, "we kept your 14:00 appointment open", 'an English half for the foreign customers');
// Tone: this is not a telling-off. No money, no threats, no shaming.
['ücret', 'ceza', 'kara liste', 'saygısız'].forEach(bad => {
  n++; if (m.indexOf(bad) >= 0) { fails++; console.log('FAIL: the message must not say "' + bad + '"'); }
});
is(ctx.nsMsg('', '').indexOf('undefined'), -1, 'no name and no hour still reads as a sentence');
has(ctx.nsMsg('', ''), 'değerli müşterimiz', 'a nameless record gets a neutral greeting');

// ── 2. The page wiring, pinned by text ───────────────────────────────────
has(src, 'nsOffer(a);', 'noShowAppt hands over to nsOffer after closing the booking');
const ns = cut('nsOffer');
has(ns, 'confirm(', 'nsOffer ASKS before anything is sent');
has(ns, 'https://wa.me/', 'it hands over to WhatsApp rather than the API');
has(ns, 'noShowMsgTs', 'it records that the message went');
n++; if (/fetch\(|\/wa\/send/.test(ns)) { fails++; console.log('FAIL: nsOffer must not call the worker — no template, no fee'); }
n++; if (src.indexOf('nsOffer(a);') < src.indexOf("noShowClose(a, auth.role, 'gelmedi');")) { fails++; console.log('FAIL: the offer must come AFTER the booking is closed'); }

// ── 3. The 24-hour reminder now asks for punctuality ─────────────────────
has(src, 'a late start makes the next customer wait', 'the tomorrow-reminder prompt asks them to arrive on time');
has(src, 'send a message if they cannot come', 'and to say so if they cannot come');

console.log((fails ? '✗ ' + fails + ' failed' : '✓ all pass') + ' — ' + n + ' checks (no-show message)');
process.exit(fails ? 1 : 0);
