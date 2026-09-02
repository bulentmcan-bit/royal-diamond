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
  // The page template module is ESM; the vm slice gets a token-only stand-in
  // so rRender's substitution and escaping can be tested without the 165KB.
  R_PAGE: '{{BODY}}|{{HEADLINE}}|{{DATE}}|{{TIME}}|{{SVC}}|{{DONE_T}}|{{DONE_P}}',
};
vm.createContext(ctx);
vm.runInContext(src.slice(0, cut).replace(/^import .*$/gm, '') +
  '\n;__api = { waPhone, waBlockedName, nicosiaWallToUtc, waWhen, waReminders, waNeedsR1, waSpec, waFill, rRender, rDateStr };',
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
is(api.waPhone('35799716784'), '35799716784', 'south Cyprus 357… (the SUZSANNA case) accepted as-is');
is(api.waPhone('447493876052'), '447493876052', 'UK 44… (the PINAR case) accepted as-is');
is(api.waPhone('+44 7493 876052'), '447493876052', '+44 form → digits with country code');
is(api.waPhone('0035799716784'), '35799716784', '00357 international prefix stripped');
is(api.waPhone('07493876052'), null, 'a UK 07… home-format number is REFUSED (no longer TR-ified into a number that goes nowhere) — store it with 44');
is(api.waPhone('05338669933'), '905338669933', 'a real TRNC local 05… still lifts to 90 5…');
is(api.waPhone('99716784'), null, 'a bare 8-digit local number is ambiguous → null, shown for a human');
console.log('1b. per-country length — the salon\'s real broken numbers stay refused');
is(api.waPhone('44796186474'), null, 'PEMBE: UK one digit short (11) → null, never a stranger\'s phone');
is(api.waPhone('357971569520027'), null, 'JULİA: 15-digit nonsense on 357 → null');
is(api.waPhone('35797466005875'), null, 'Duaa: 357 too long → null');
is(api.waPhone('3579973291211'), null, 'Yana: 357 too long → null');
is(api.waPhone('9090909090'), null, 'OTEL: 10-digit placeholder → null');
is(api.waPhone('9099801007'), null, 'Noni: too short → null');
is(api.waPhone('61412345678'), '61412345678', 'Australia 61 at 11 digits passes');
is(api.waPhone('966501234567'), '966501234567', 'Saudi 966 at 12 digits passes');
is(api.waPhone('35850123456'), '35850123456', 'Finland 358 — unknown code → accepted UNVERIFIED, not rejected');
is(api.waPhone('4479618647'), null, 'UK ten digits → null (basic shape)');

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
{
  // The 1 SAAT KALA call covers the working day, so the 2-hour message goes
  // only where the call cannot be made: the one-hour mark before reception
  // is at the desk (opening minus ten minutes). Derived from WA_OPEN, never
  // a hard-coded 08:00.
  is(api.waNeedsR1('08:00', '08:00'), true, '08:00 start: its 07:00 call moment has nobody at the desk → message');
  is(api.waNeedsR1('08:30', '08:00'), true, '08:30 start: 07:30 call moment → message');
  is(api.waNeedsR1('08:50', '08:00'), false, '08:50 start: 07:50 call moment IS the desk moment → call, no message');
  is(api.waNeedsR1('09:00', '08:00'), false, '09:00 start → the call covers it');
  is(api.waNeedsR1('14:00', '08:00'), false, 'an afternoon start → the call covers it');
  is(api.waNeedsR1('08:00', '07:00'), false, 'salon opening at 07:00: the 08:00 gets its call instead — the line MOVED');
  is(api.waNeedsR1('07:00', '07:00'), true, 'and the 07:00 start becomes the one that needs the message');
  is(api.waNeedsR1('09:00', 'garbage'), false, 'an unreadable opening falls back to 08:00, not to silence');
  const now = Date.UTC(2026, 7, 29, 9, 0);
  const r = api.waReminders(now + 26 * 3600e3, now, false);
  is(r.due.map(d => d.kind), ['r24'], 'needR1=false: only the 24-hour goes');
  is(r.skipped, [{ kind: 'r1', why: 'call-covers' }], 'and the log says WHY the 2-hour did not');
  const r2 = api.waReminders(now + 26 * 3600e3, now, true);
  is(r2.due.map(d => d.kind), ['r24', 'r1'], 'needR1=true: the early start keeps both');
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
{
  // The booking confirmation spec (WA_CONF): {{1}} the Turkish long date,
  // {{2}} the hour — {dateLong} computed by the worker so every device words
  // it identically, and rDateStr accepts the bare dateISO the route passes.
  const spec = { templateName: 'pyz_appointment_booked_v2', languageCode: 'tr', body: ['{dateLong}', '{time}'] };
  const out = api.waFill(spec, { dateLong: api.rDateStr('2026-09-02'), time: '15:00', date: '2026-09-02', apptId: '1' });
  is(out.parameters.body, ['2 Eylül Çarşamba', '15:00'], 'the confirmation body: long date + hour');
  is(api.waFill({ templateName: 'x', body: ['{date}'] }, { dateLong: 'L', date: 'D' }).parameters.body, ['D'],
     '{date} still means the ISO date — {dateLong} did not shadow it');
}
{
  // The REAL approved templates (read 29 Aug): one body variable = the hour,
  // one URL-button variable = the apptId, landing on this worker's /r/ page.
  const spec = { templateName: 'pyz_randevu_hatirlatma_24saat', languageCode: 'tr', body: ['{time}'], buttons: { 0: '{apptId}' } };
  const out = api.waFill(spec, { name: 'Ayşe', when: 'x', service: 'x', date: '2026-09-01', time: '14:00', apptId: '1756000000001' });
  is(out.parameters.body, ['14:00'], 'the live 24h spec: body carries the hour alone');
  is(out.parameters.buttons, { 0: '1756000000001' }, 'the live spec: button carries the apptId');
}

console.log('7. the confirm page render');
is(api.rDateStr('2026-09-02T16:00'), '2 Eylül Çarşamba', 'the date reads as the design\'s own example did');
{
  const out = api.rRender('pending', { dt: '2026-09-02T16:00', svc: 'Manikür <b>&</b>', st: 'pending' });
  is(out.includes('|16:00|'), true, 'the hour lands in its slot');
  is(out.includes('Manikür &lt;b&gt;&amp;&lt;/b&gt;'), true, 'the service is HTML-escaped');
  is(out.startsWith('|'), true, 'pending state: no body class');
}
{
  const out = api.rRender('answered', { dt: '2026-09-02T16:00', svc: 'M', st: 'change' });
  is(out.startsWith('answered|'), true, 'answered state class set');
  is(out.includes('Aldık, teşekkürler'), true, 'the change thank-you text');
}
{
  const out = api.rRender('na', null);
  is(out.startsWith('na|Sizi bekliyoruz||||'), true, 'unknown id: na class, no data leaked into the slots');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
