// ═══════════════════════════════════════════════════════════════════════════
// 7 Ekim: the 09:00 customer had booked before the button reminder went live,
// so she never got it, and there was no way to ask her from the screen.
//
//   1. the date in the hand-sent message is worded exactly like the worker's
//   2. the re-plan picks only old-plan visits whose 1.5-hour moment is ahead
//   3. it never touches a visit already on the new plan or asked by hand
//   4. the card carries the 📨 line and the send goes through /wa/send
//
// Run:  node tests/wa-button-now.test.js
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
const grab = name => {
  const one = new RegExp('\\n(const ' + name + ' = [^\\n]*;)\\n').exec(html);
  if (one) return one[1];
  const m = new RegExp('\\n(function ' + name + '\\b[\\s\\S]*?\\n\\}\\n)').exec(html);
  if (!m) throw new Error('missing ' + name);
  return m[1];
};
const src = ['RD_WA_BTN_TEMPLATE', 'RD_WA_BTN_LIVE_AT', 'rdWaDateLong', 'rdWaReplanScan'].map(grab).join('\n');
const ctx = new Function('rdWaPayload', src + '\nreturn { RD_WA_BTN_TEMPLATE, RD_WA_BTN_LIVE_AT, rdWaDateLong, rdWaReplanScan };')(
  (a, c) => (a && c && c.phone ? { apptId: String(a.id), phone: c.phone, dateISO: a.datetime.slice(0, 10), timeHHMM: a.datetime.slice(11, 16) } : null));

console.log('1. the date, as the worker words it');
{
  is(ctx.rdWaDateLong('2026-10-07'), '7 Ekim Çarşamba', '7 Ekim Çarşamba');
  is(ctx.rdWaDateLong('2026-12-31T09:00'), '31 Aralık Perşembe', '…takes a full datetime too');
  is(ctx.rdWaDateLong('nonsense'), '', 'and nothing for nonsense');
  is(ctx.RD_WA_BTN_TEMPLATE, 'randevu_onay2', 'sent under the approved template');
}

console.log('2. which visits are set up again');
{
  const now = new Date('2026-10-07T08:30').getTime();   // the salon clock, as the device reads datetimes
  const before = ctx.RD_WA_BTN_LIVE_AT - 86400e3, after = ctx.RD_WA_BTN_LIVE_AT + 60e3;
  const c = [{ id: 1, phone: '905338669933' }, { id: 2, phone: '' }];
  const A = (id, dt, wa, extra) => Object.assign({ id, clientId: 1, status: 'confirmed', datetime: dt, wa }, extra || {});
  const book = [
    A('old-later', '2026-10-07T14:00', { u: ['x'], t: before }),
    A('old-tomorrow', '2026-10-08T09:00', { u: ['x', 'y'], t: before }),
    A('old-too-soon', '2026-10-07T09:30', { u: ['x'], t: before }),
    A('new-plan', '2026-10-07T15:00', { u: ['x'], t: after }),
    A('asked-by-hand', '2026-10-07T16:00', { u: ['x'], t: before, n: now - 60e3 }),
    A('no-uids', '2026-10-07T17:00', { x: ['x'], t: before }),
    A('cancelled', '2026-10-07T18:00', { u: ['x'], t: before }, { status: 'cancelled' }),
    A('no-phone', '2026-10-07T18:30', { u: ['x'], t: before }, { clientId: 2 }),
  ];
  const ids = ctx.rdWaReplanScan(book, c, now).map(e => e.id);
  is(ids, ['old-later', 'old-tomorrow'], 'only old-plan visits whose 1.5-hour send is still ahead');
}

console.log('3. the card and the send');
{
  is(/rdWaRemLine\(a\)/.test(html), true, 'the 📨 line sits on every dashboard card');
  is(/📨 Şimdi gönder/.test(html), true, '…with a "send now" button');
  is(/rdWaFetch\('\/wa\/send', \{ phone:p\.phone, templateName:RD_WA_BTN_TEMPLATE/.test(html), true, 'sent through /wa/send under the button template');
  is(/confirm\(\(c\.name\|\|'Müşteri'\)\+' — '\+p\.timeHHMM/.test(html), true, '…only after reception confirms');
  is(/if\(role!=='owner'\) return;/.test(html), true, 'the re-plan runs on the owner machine only');
  is(/try\{ await rdWaFetch\('\/wa\/cancel', \{ uids:old \}\); \}/.test(html), true, '…booking the new reminders before cancelling the old');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
