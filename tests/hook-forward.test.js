// ═══════════════════════════════════════════════════════════════════════════
// hookForward — every reply to 0539, onto the 0548 telephone.
//
// The salon has two numbers and that is the whole of the problem. Reception
// works from 0548 893 33 33, the WhatsApp on her own phone. Everything
// automatic goes out from 0539 140 3333, the Piyzi number, so that is where
// customers reply — and 0548 never sees a word of it. A customer wrote
// "Hello ı cannot come today" to 0539; reception saw nothing; the owner rang
// her the next morning and she said she had already cancelled. The hour sat
// in the diary the whole time, so nobody else could have it. Two hours lost
// from one message that went to the other telephone.
//
// WhatsApp cannot divert one number to another. So the worker does it.
//
//   1. it is wired into the hook, AFTER the reply is safely stored
//   2. it is off until configured, and never guesses a template name
//   3. it carries who wrote and what she wrote
//   4. it never loops, never throws, never costs a reply
//
// Run:  node tests/hook-forward.test.js
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
const toml = fs.readFileSync(path.join(root, 'worker', 'wrangler.toml'), 'utf8');

console.log('1. wired into the hook');
{
  is(/async function hookForward\(env, ctx, rec\)/.test(src), true, 'hookForward exists');
  is(/try \{ await hookForward\(env, ctx, rec\); \} catch \(e\) \{ console\.log\('\[hook\] forward failed:', String\(e\)\); \}/.test(src), true,
     '…called from the hook, inside its own try — a forward can never fail a delivery');
  // ORDER MATTERS: the reply must be in Firebase before anything is sent on.
  const store = src.indexOf("await fbWrite(env, 'PUT', HOOK_REPLIES");
  const fwd = src.indexOf('await hookForward(env, ctx, rec)');
  is(store > 0 && fwd > store, true, '…and only AFTER the reply is safely stored');
  const ret = src.indexOf("return hookText('ok', 200)", store);
  is(fwd < ret, true, '…and before the 200, so Piyzi is not kept waiting on a retry loop');
}

console.log('2. off until configured');
{
  const fn = /async function hookForward\(env, ctx, rec\) \{([\s\S]*?)\n\}/.exec(src);
  const b = fn ? fn[1] : '';
  is(/if \(!to \|\| !spec\) \{/.test(b), true, 'no number or no template → it does nothing');
  is(/forward not configured/.test(b), true, '…and says so in the log rather than failing silently');
  is(/waSpec\(env\.WA_FORWARD\)/.test(b), true, 'the template comes from WA_FORWARD, like every other one here');
  is(b.indexOf("String(env.WA_FORWARD_TO || '').replace(") > -1, true, '…and the destination from WA_FORWARD_TO');
  is(/WA_FORWARD = ''/.test(toml), true, 'and it ships OFF — empty until Meta approves the template');
  is(/WA_FORWARD_TO = '905488933333'/.test(toml), true, "…with reception's own number already written down");
}

console.log('3. who wrote, and what she wrote');
{
  const fn = /async function hookForward\(env, ctx, rec\) \{([\s\S]*?)\n\}/.exec(src);
  const b = fn ? fn[1] : '';
  is(/const who = String\(rec\.name \|\| ''\)\.trim\(\) \|\| \('\+' \+ String\(rec\.phone \|\| ''\)\);/.test(b), true,
     'her name, falling back to her number — never blank');
  is(b.indexOf("replace(/\\s+/g, ' ')") > -1, true, 'her message flattened to one line — Meta rejects a newline in a parameter');
  is(/said = '\(mesaj metni yok\)'/.test(b), true, '…and a message with no text still says something');
  is(/said\.length > 300/.test(b), true, '…and a very long one is cut');
  is(/waFill\(spec, \{ who, said \}\)/.test(b), true, 'both are handed to the template in its own order');
  is(src.indexOf('apptId|day|who|said') > -1, true,
     '…and waFill knows those two placeholders');
  is(fs.existsSync(path.join(root, 'worker', 'templates', 'forward-reply.md')), true, 'the template is written down beside the others');
  const md = fs.readFileSync(path.join(root, 'worker', 'templates', 'forward-reply.md'), 'utf8');
  is(/musteri_yazdi/.test(md), true, '…under the name the config will use');
  is(/UTILITY/.test(md), true, '…as UTILITY: a notification to the salon itself, not marketing');
  is(/Coexistence/.test(md), true, '…and it records the thing that would make it unnecessary');
}

console.log('4. it cannot do harm');
{
  const fn = /async function hookForward\(env, ctx, rec\) \{([\s\S]*?)\n\}/.exec(src);
  const b = fn ? fn[1] : '';
  is(/rec\.phone[\s\S]{0,70}=== to\) return;/.test(b), true,
     'a message from the salon’s own number is never forwarded to itself — a loop would be a loop');
  is(/catch \(e\) \{ err = 'PIYZI_UNREACHABLE'; \}/.test(b), true, 'Piyzi being down is caught, not thrown');
  is(/waLog\(env, ctx, \{\s*op: 'hook-forward'/.test(b), true, '…and every attempt is logged, sent or failed');
  is(/outcome: err \? \('failed:' \+ err\) : 'sent'/.test(b), true, '…with the reason when it failed');
  is(/throw/.test(b), false, 'it throws nothing of its own');
  // The reply itself must be untouchable by any of this.
  is(/return hookText\('store failed', 503\)/.test(src), true, 'a STORE failure still tells Piyzi to retry');
  is(/\[hook\] forward failed/.test(src), true, '…while a FORWARD failure is only a log line');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
