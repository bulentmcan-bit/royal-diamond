// ═══════════════════════════════════════════════════════════════════════════
// The robot confirmation call — demo (worker /call/demo, /call/answer).
//
//   1. the door: no key, no Twilio secrets, no number → nothing is dialled
//   2. the call Twilio is asked to place: right number, right words
//   3. what each key says: 1, 2, a wrong key once, then giving up
//
// Run:  node tests/call-demo.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
const is = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
};

(async () => {
  const w = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'src', 'index.js')).href);
  const worker = w.default;
  const env = { BTN_KEY: 'kk', TWILIO_SID: 'AC1', TWILIO_TOKEN: 'tok', TWILIO_FROM: '+15550001111' };
  const calls = [];
  globalThis.fetch = async (u, o) => { calls.push({ u, o }); return new Response(JSON.stringify({ sid: 'CA9' }), { status: 201 }); };
  const get = (q, e = env) => worker.fetch(new Request('https://w.dev/call/demo' + q), e, {});

  console.log('1. the door');
  is((await get('?to=905338669933')).status, 403, 'no key → 403');
  is((await get('?k=bad&to=905338669933')).status, 403, 'wrong key → 403');
  is((await get('?k=kk&to=905338669933', { BTN_KEY: 'kk' })).status, 503, 'no Twilio secrets → 503');
  is((await get('?k=kk')).status, 400, 'no number → 400');
  is(calls.length, 0, '…and nothing was dialled');

  console.log('2. the call');
  const r = await get('?k=kk&to=0090 533 866 9933&t=10:30');
  is(r.status, 200, 'good request → 200');
  is(calls.length, 1, 'one call to Twilio');
  is(calls[0].u, 'https://api.twilio.com/2010-04-01/Accounts/AC1/Calls.json', 'the Calls endpoint of this account');
  is(calls[0].o.headers.authorization, 'Basic ' + btoa('AC1:tok'), 'basic auth with SID:token');
  const p = new URLSearchParams(calls[0].o.body.toString());
  is(p.get('To'), '+905338669933', '0090… → +90533…');
  is(p.get('From'), '+15550001111', 'from the Twilio number');
  is(p.get('Twiml').includes("saat 10:30&apos;da randevunuz var"), true, 'speaks the appointment time');
  is(p.get('Twiml').includes('voice="Polly.Filiz"'), true, 'Turkish voice');
  is(p.get('Twiml').includes('action="https://w.dev/call/answer?n=1"'), true, 'keys go to /call/answer');
  calls.length = 0;
  await get('?k=kk&to=0533 866 9933');
  is(new URLSearchParams(calls[0].o.body.toString()).get('To'), '+905338669933', '0533… → +90533…');
  calls.length = 0;
  await get('?k=kk&to=905338669933&t=<x>');
  is(new URLSearchParams(calls[0].o.body.toString()).get('Twiml').includes('saat 14:30'), true, 'a bad time falls back to 14:30');

  console.log('3. the keys');
  const ans = async (n, digits) => {
    const body = digits == null ? undefined : new URLSearchParams({ Digits: digits });
    return (await worker.fetch(new Request('https://w.dev/call/answer?n=' + n, { method: 'POST', body }), env, {})).text();
  };
  is((await ans(1, '1')).includes('sizi bekliyoruz'), true, '1 → "sizi bekliyoruz"');
  is((await ans(1, '1')).includes('<Hangup/>'), true, '…and hangs up');
  is((await ans(1, '2')).includes('Yeni bir randevu için sizi arayacağız'), true, '2 → rebook line');
  const wrong = await ans(1, '7');
  is(wrong.includes('Lütfen geliyorsanız') && wrong.includes('n=2'), true, 'wrong key → asks again (try 2)');
  is((await ans(1, null)).includes('Lütfen geliyorsanız'), true, 'silence → asks again');
  is((await ans(2, '9')).includes('Size ulaşamadık'), true, 'second wrong key → gives up politely');
  is((await ans(2, '1')).includes('sizi bekliyoruz'), true, '1 on the second try still counts');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
