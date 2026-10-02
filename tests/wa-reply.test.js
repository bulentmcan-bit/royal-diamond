// ═══════════════════════════════════════════════════════════════════════════
// Answering from inside the salon's own app.
//
// Reading the customers' messages was never the hard part — Piyzi's webhook
// has been handing every one of them over all along. ANSWERING was. Reception
// would read "saat 3'e alabilir miyiz" on the screen and then have to pick up
// her own telephone, a DIFFERENT number from the one the customer wrote to,
// and the customer gets a message from a stranger.
//
// Şahin (Piyzi), 2 Ekim 2026, and their documentation agree: POST
// /whatsapp/messages carrying { phone, text }. The catch is WhatsApp's own
// rule — a typed sentence may only be sent inside the 24-hour window the
// CUSTOMER opens by writing. After that: 409 SERVICE_WINDOW_CLOSED, and
// nothing but an approved template will go.
//
// So the two things this must get right are the body shape and the window.
//
// Run:  node tests/wa-reply.test.js
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
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'worker', 'src', 'index.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

console.log('1. the worker route, exactly as Piyzi documents it');
{
  const m = /if \(route === '\/wa\/reply'\) \{([\s\S]*?)\n  \}/.exec(src);
  const b = m ? m[1] : '';
  is(!!b, true, 'POST /wa/reply exists');
  is(/piyziCall\(env, 'POST', '\/whatsapp\/messages', \{ phone: to, text: msg \}\)/.test(b), true,
     "…sending { phone, text } — and NOTHING else");
  // The one rule that silently breaks it: Piyzi refuses a body carrying both.
  is(/templateName/.test(b), false, '…never templateName in the same request, which Piyzi refuses outright');
  is(/msg\.length > 4096/.test(b), true, "…and it stops at WhatsApp's 4096 characters rather than losing her words to a 400");
  is(/code: 'INVALID_PHONE'/.test(b), true, '…a bad number is refused here, not at Piyzi');
  is(/op: 'reply'/.test(b), true, '…and every send is logged');
}

console.log('2. the shut window is the failure that matters');
{
  const m = /if \(route === '\/wa\/reply'\) \{([\s\S]*?)\n  \}/.exec(src);
  const b = m ? m[1] : '';
  is(/err\.code === 'SERVICE_WINDOW_CLOSED' \|\| r\.status === 409/.test(b), true,
     'a shut window is recognised by code OR by the 409, not by one of them');
  is(/closed: true/.test(b), true, '…and flagged so the screen can say it plainly');
  is(/Müşteriyi arayın/.test(b), true, '…in Turkish, telling reception the only thing left is the telephone');
}

console.log('3. the window state is carried off the webhook');
{
  const m = /function hookParse\(evt\) \{([\s\S]*?)\n\}/.exec(src);
  const b = m ? m[1] : '';
  is(/const win = d\.serviceWindow \|\| \{\};/.test(b), true, 'the hook reads serviceWindow, which Piyzi puts on every event');
  is(/winUntil = Date\.parse\(win\.expiresAt/.test(b), true, '…keeping when it shuts');
  is(/winOpen: \(win\.open === true\) \|\| null/.test(b), true, '…and whether Piyzi says it is open');
}

console.log('4. rdWrWindow — judged BEFORE she types a paragraph');
{
  const i = html.indexOf('function rdWrWindow(');
  let d = 0, body = '';
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (!d) { body = html.slice(i, k + 1); break; } }
  }
  const clock = /function rdWrClock\(ts\)\{[\s\S]*?\n\}/.exec(html);
  const rdWrWindow = new Function(clock[0] + '\n' + body + '\nreturn rdWrWindow;')();

  const NOW = Date.parse('2026-10-02T18:00:00Z');
  const H = 3600000;

  is(rdWrWindow({ ts: NOW - 2 * H, winOpen: true, winUntil: NOW + 22 * H }, NOW).open, true,
     'Piyzi says open and the hour has not come → she can type');
  is(rdWrWindow({ ts: NOW - 30 * H, winOpen: true, winUntil: NOW - 6 * H }, NOW).open, false,
     '…the hour has passed → closed, whatever the flag said when it arrived');
  is(rdWrWindow({ ts: NOW - 2 * H, winOpen: false, winUntil: NOW + 22 * H }, NOW).open, false,
     "…an explicit open:false from Piyzi closes it whatever the clock says");

  // Every message stored before the hook started keeping the window has no
  // field at all. Her own timestamp is not a guess — the window is defined
  // from exactly that moment.
  is(rdWrWindow({ ts: NOW - 2 * H }, NOW).open, true, 'an older message, 2 hours ago → still inside the 24 hours');
  is(rdWrWindow({ ts: NOW - 25 * H }, NOW).open, false, '…25 hours ago → outside it');
  is(rdWrWindow({ ts: NOW - 23.9 * H }, NOW).open, true, '…and the edge is the full 24, not a rounded day');
  is(rdWrWindow({}, NOW).open, false, 'a record with no time at all → closed, never assumed open');
  is(rdWrWindow({ ts: NOW - 2 * H }, NOW).untilTxt.length > 0, true, '…and an open window says the hour it shuts');
  is(rdWrWindow({ ts: NOW - 25 * H }, NOW).untilTxt, '', '…a shut one says no hour at all');
}

console.log('5. the box on the screen');
{
  is(/window\.rdWrSend=function\(id, phone\)\{/.test(html), true, 'there is a sender');
  is(/rdWaFetch\('\/wa\/reply', \{ phone:String\(phone\|\|''\), text:text \}\)/.test(html), true, '…calling the worker route');
  is(/box\.disabled=true; tell\('Gönderiliyor…'\);/.test(html), true, '…locking the box so a double tap cannot send twice');
  // If it fails, what she wrote must still be there. Clearing on failure is
  // how you lose a sentence somebody composed with a customer waiting.
  const m = /window\.rdWrSend=function\(id, phone\)\{([\s\S]*?)\n  \};/.exec(html);
  const b = m ? m[1] : '';
  is((b.match(/box\.value=''/g) || []).length, 1, '…and emptying it ONLY on success, so a failure never loses her words');
  is(/if\(res && res\.ok\)\{[\s\S]{0,80}box\.value=''/.test(b), true, '…that one clear sitting inside the success branch');
  is(/24 saatlik pencere kapandı/.test(b), true, '…a shut window reported in her language');
  is(/24 saatlik yanıt penceresi kapalı — serbest metin gönderilemez/.test(html), true,
     'and a closed window hides the box entirely, before she starts typing into it');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
