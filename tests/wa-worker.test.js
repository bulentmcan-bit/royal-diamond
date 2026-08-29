// ═══════════════════════════════════════════════════════════════════════════
// The WhatsApp reminders' pure half — the REAL functions out of
// worker/src/index.js (everything above the named exports), run as they are,
// not a re-implementation. No network, no Piyzi, no key.
//
//   1. phone cleanup: every accepted spelling lands on 90XXXXXXXXXX,
//      and a mangled number lands on null, never on a send
//   2. the blocker "client" KAPALI — Personel is refused by name
//   3. salon wall time → UTC honours the seasonal clocks: 14:00 in the salon
//      is 11:00Z in August and 12:00Z in January, from the timezone database,
//      not a hard-coded "+3"
//   4. the two reminders: 24h and 2h before, and a send time already past is
//      skipped as normal (same-day booking), never treated as an error
//   5. a template spec is null until it is genuinely configured
//   6. placeholder filling matches the template's own variable order and
//      omits parameter groups the spec leaves out
//
// Run:  node tests/wa-worker.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');
const cut = src.indexOf('\nexport {');
if (cut < 0) { console.error('✗ named export block not found in worker/src/index.js'); process.exit(1); }

const ctx = {
  console: { log: () => {}, warn: () => {}, error: () => {} },
  TextEncoder, Intl, Date, JSON, Math, Object, Array, String, Number, Boolean,
  isNaN, parseFloat, parseInt, RegExp, Response: class {}, fetch: () => { throw new Error('no network in tests'); },
};
vm.createContext(ctx);
vm.runInContext(src.slice(0, cut) +
  '\n;__api = { waPhone, waBlockedName, nicosiaWallToUtc, waWhen, waReminders, waSpec, waFill };',
  ctx, { filename: 'worker-index-slice.js' });
const api = ctx.__api;

let pass = 0, fail = 0;
function is(actual, expected, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ✓', what); }
  else { fail++; console.log('  ✗', what, '\n      got     ', a, '\n      expected', e); }
}

console.log('1. phone cleanup → 90XXXXXXXXXX or null');
is(api.waPhone('0533 866 9933'), '905338669933', 'local 0533… form');
is(api.waPhone('+90 533 866 9933'), '905338669933', '+90 form');
is(api.waPhone('90 533 866 9933'), '905338669933', 'bare 90 form');
is(api.waPhone('5338669933'), '905338669933', 'bare 5… form');
is(api.waPhone('0090 533 866 9933'), '905338669933', '0090 international form');
is(api.waPhone('12345'), null, 'too-short junk → null');
is(api.waPhone(''), null, 'empty → null');
is(api.waPhone(null), null, 'missing → null');

console.log('2. the blocker client');
is(api.waBlockedName('KAPALI — Personel'), true, 'the exact record name');
is(api.waBlockedName('kapalı'), true, 'lowercase with dotless ı');
is(api.waBlockedName('Ayşe Yılmaz'), false, 'a real customer passes');

console.log('3. salon wall clock → UTC across the seasonal clocks');
is(new Date(api.nicosiaWallToUtc('2026-08-30', '14:00')).toISOString(),
   '2026-08-30T11:00:00.000Z', 'summer: 14:00 salon = 11:00Z (+3)');
is(new Date(api.nicosiaWallToUtc('2026-01-15', '14:00')).toISOString(),
   '2026-01-15T12:00:00.000Z', 'winter: 14:00 salon = 12:00Z (+2)');
is(Number.isNaN(api.nicosiaWallToUtc('garbage', '14:00')), true, 'garbage date → NaN, never a send');
{
  const w = api.waWhen(Date.UTC(2026, 8, 1, 11, 0)); // 1 Sep 14:00 salon clock
  is(/1 Eylül.*14[:.]00/.test(w), true, 'waWhen renders Turkish salon time: ' + w);
}

console.log('4. which reminders are still ahead');
{
  const now = Date.UTC(2026, 7, 29, 9, 0);
  const appt = now + 26 * 3600e3;
  const r = api.waReminders(appt, now);
  is(r.due.map(d => d.kind), ['r24', 'r1'], 'booked 26h ahead → both go');
  is(r.due[0].at, appt - 24 * 3600e3, 'r24 fires 24h before');
  is(r.due[1].at, appt - 2 * 3600e3, 'r1 fires 2h before');
}
{
  const now = Date.UTC(2026, 7, 29, 9, 0);
  const r = api.waReminders(now + 3 * 3600e3, now);
  is(r.due.map(d => d.kind), ['r1'], 'same-day booking 3h ahead → only the 2h reminder');
  is(r.skipped, [{ kind: 'r24', why: 'past' }], 'the 24h one is skipped as normal');
}
{
  const now = Date.UTC(2026, 7, 29, 9, 0);
  const r = api.waReminders(now + 1 * 3600e3, now);
  is(r.due, [], 'booked 1h ahead → nothing to schedule');
  is(r.skipped.length, 2, 'both skipped, no error');
}
{
  const now = Date.UTC(2026, 7, 29, 9, 0);
  const r = api.waReminders(now + 2 * 3600e3 + 60e3, now); // r1 would be 1 min out
  is(r.due, [], 'a send under Piyzi\'s 2-minute floor is skipped, not raced');
}

console.log('5. template spec: null until genuinely configured');
is(api.waSpec(''), null, 'empty var → null');
is(api.waSpec('not json'), null, 'broken JSON → null');
is(api.waSpec('{"languageCode":"tr"}'), null, 'no templateName → null');
is(api.waSpec('{"templateName":"x"}') !== null, true, 'a real spec parses');

console.log('6. placeholder filling, in the template\'s own order');
{
  const spec = { templateName: 'hatirlatma_24', languageCode: 'tr',
                 header: ['{name}'], body: ['{name}', '{when}', '{service}'] };
  const out = api.waFill(spec, { name: 'Ayşe Yılmaz', when: '1 Eylül 14:00', service: 'Manikür', date: '2026-09-01', time: '14:00' });
  is(out.templateName, 'hatirlatma_24', 'name passes through untouched');
  is(out.parameters.header, ['Ayşe Yılmaz'], 'header variables in order');
  is(out.parameters.body, ['Ayşe Yılmaz', '1 Eylül 14:00', 'Manikür'], 'body variables in order');
}
{
  const out = api.waFill({ templateName: 'x', body: ['{when}'] }, { when: '1 Eylül 14:00' });
  is('header' in out.parameters, false, 'no header in the spec → none sent (Piyzi rejects a count mismatch)');
  is(out.languageCode, 'tr', 'language defaults to tr');
}
{
  const out = api.waFill({ templateName: 'x', body: ['{name}'], buttons: { 0: 'g-{date}' } }, { name: 'A', date: '2026-09-01' });
  is(out.parameters.buttons, { 0: 'g-2026-09-01' }, 'button values substituted by index');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
