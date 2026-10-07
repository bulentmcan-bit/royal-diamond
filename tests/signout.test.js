// ═══════════════════════════════════════════════════════════════════════════
// Çıkış Yap — getting a phone off somebody else's account.
//
// There was no way out of this app. A device that had once signed in stayed
// signed in for good, and the only way off an account was to clear the
// browser's site data or delete the home-screen app and add it again. That
// held while the only devices were the owner's and reception's, and stopped
// holding the day a technician's phone was set up with the owner's own
// account — because the way back from that is a sign-out and there wasn't one.
//
//   1. the button exists, in Ayarlar, where account things belong
//   2. it asks first, and says nothing is deleted
//   3. it really signs out, and reloads so the login overlay returns
//   4. the page says WHOSE account this phone is on
//   5. and it is the only door: no other path calls signOut on a real user
//
// Run:  node tests/signout.test.js
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

console.log('1. the button');
{
  is(/id="rd-signout-btn"/.test(html), true, 'there is a sign-out button');
  is(/onclick="rdSignOut\(\)"/.test(html), true, '…wired to rdSignOut');
  is(/🚪 Çıkış Yap/.test(html), true, '…and it says Çıkış Yap in Turkish');
  // In Ayarlar, with the other account-level things, not on the dashboard
  // where a thumb lands all day.
  const settings = /<div class="page" id="page-settings">([\s\S]*?)\r?\n    <\/div>\r?\n\r?\n    <!-- ════ SALARY PAGE/.exec(html);
  is(!!settings, true, 'the Ayarlar page is found');
  is(settings ? /rd-signout-btn/.test(settings[1]) : false, true, '…and the button is inside it');
  is(/id="page-dashboard"[\s\S]{0,4000}rd-signout-btn/.test(html), false, '…and nowhere near the dashboard');
}

console.log('2. it asks first');
{
  const fn = /window\.rdSignOut = function\(\)\{([\s\S]*?)\n  \};/.exec(html);
  is(!!fn, true, 'rdSignOut is defined');
  const b = fn ? fn[1] : '';
  is(/if\(!confirm\(/.test(b), true, 'it confirms before doing anything — a mis-tap mid-shift would be its own disaster');
  is(/return;/.test(b), true, '…and stops when the answer is no');
  is(/Salonun verisi silinmez/.test(b), true, '…saying plainly that no salon data is deleted');
}

console.log('3. it really signs out');
{
  const fn = /window\.rdSignOut = function\(\)\{([\s\S]*?)\n  \};/.exec(html);
  const b = fn ? fn[1] : '';
  is(/firebase\.auth\(\)\.signOut\(\)/.test(b), true, 'it calls signOut');
  is(/\.then\(function\(\)\{ location\.reload\(\); \}\)/.test(b), true, '…then reloads, so the login overlay comes back');
  is(/\.catch\(/.test(b), true, '…and says so when it fails rather than looking like it worked');
  is((b.match(/alert\(/g) || []).length >= 1, true, '…out loud, not into the console');
}

console.log('4. whose phone is this');
{
  is(/id="rd-who-email"/.test(html), true, 'the page names the account signed in');
  is(/function rdShowWhoAmI\(\)/.test(html), true, '…filled in from the live auth state');
  is(/firebase\.auth\(\)\.onAuthStateChanged\(rdShowWhoAmI\)/.test(html), true, '…and refreshed when that changes');
  // Pinned loosely on purpose: Ayarlar now paints more than one card when it
  // opens, and this test is about the who-am-I line being one of them.
  is(/if\(page==="settings"\)\{[^}]*try\{ rdShowWhoAmI\(\); \}catch\(e\)\{\}/.test(html), true, '…and again whenever Ayarlar is opened');
  is(/el\.textContent=\(u&&u\.email\)\?u\.email:'—';/.test(html), true, '…showing the e-mail, or a dash when there is none');
}

console.log('5. the only door');
{
  // The one other signOut in the file drops the ANONYMOUS session the booking
  // page leaves behind. It must not be touched, and nothing else may sign a
  // real user out without asking.
  const all = [...html.matchAll(/signOut\(\)/g)].length;
  is(all, 2, 'exactly two signOut calls in the whole file');
  is(/if\(user&&user\.isAnonymous\)\{ try\{_fbAuth\.signOut\(\);\}catch\(e\)\{\} return; \}/.test(html), true,
     '…one of them the anonymous session, which is not a person and needs no confirm');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
