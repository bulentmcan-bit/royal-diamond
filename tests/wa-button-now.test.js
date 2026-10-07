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
  is(/\(!showBtn \? '' : '<button onclick="rdWaSendNow\(/.test(html), true, '…which disappears once the message has gone');
  is(/rdWaGroup\(a, rdWaDayOf\(a\)\)\.concat\(\[a\]\)\.some\(function\(x\)\{ return x && x\.wa && x\.wa\.n; \}\)\)\{ toast\('📨','Zaten gönderildi'/.test(html), true, '…and a second send to the same visit is refused even if called');
  is(/rdWaFetch\('\/wa\/send', \{ phone:p\.phone, templateName:RD_WA_BTN_TEMPLATE/.test(html), true, 'sent through /wa/send under the button template');
  is(/confirm\(\(c\.name\|\|'Müşteri'\)\+' — '\+p\.timeHHMM/.test(html), true, '…only after reception confirms');
  is(/if\(role!=='owner'\) return;/.test(html), true, 'the re-plan runs on the owner machine only');
  is(/try\{ await rdWaFetch\('\/wa\/cancel', \{ uids:old \}\); \}/.test(html), true, '…booking the new reminders before cancelling the old');
}

console.log('4. a booking made too late for its 1.5-hour message is asked at once');
{
  const src2 = ['rdWaLateAsk'].map(grab).join('\n');
  const sent = [];
  const mk = (book, cls) => new Function('apptById', 'clients', 'rdWaPayload', 'rdWaSendButtons', src2 + '\nreturn rdWaLateAsk;')(
    id => book.find(a => String(a.id) === String(id)), cls,
    (a, c) => (a && c ? { phone: c.phone, dateISO: a.datetime.slice(0, 10), timeHHMM: a.datetime.slice(11, 16) } : null),
    (id, p) => sent.push(id));
  const at = d => { const t = new Date(Date.now() + d); const z = n => String(n).padStart(2, '0');
    return t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate()) + 'T' + z(t.getHours()) + ':' + z(t.getMinutes()); };
  const cls = [{ id: 1, name: 'Bülent', phone: '905338669933' }];
  const book = [
    { id: 'late', clientId: 1, datetime: at(89 * 60e3) },
    { id: 'imminent', clientId: 1, datetime: at(5 * 60e3) },
    { id: 'done-by-hand', clientId: 1, datetime: at(60 * 60e3), wa: { n: 1 } },
  ];
  const L = mk(book, cls);
  const past = { ok: true, scheduled: [], skipped: [{ kind: 'r1', why: 'past' }] };
  is(L(book[0], past), true, 'booked 89 min ahead: the button message goes now');
  is(L(book[1], past), false, '…but not when she is five minutes away');
  is(L(book[2], past), false, '…nor twice, once it has gone by hand');
  is(L(book[0], { ok: true, scheduled: [{ kind: 'r1', uid: 'u' }], skipped: [] }), false, 'a booking whose 1.5-hour send is scheduled waits for it');
  is(sent, ['late'], 'exactly one message sent');
  is(/rdWaLateAsk\(live, j\)/.test(html), true, 'checked every time a booking is scheduled');
}

console.log('5. a later booking the same day follows the first one');
{
  const src3 = ['RD_WA_BTN_LIVE_AT', 'RD_WA_BTN_MIN', 'rdWaRemLine'].map(grab).join('\n');
  const day = new Date(Date.now() + 86400e3); const z = n => String(n).padStart(2, '0');
  const ymd = day.getFullYear() + '-' + z(day.getMonth() + 1) + '-' + z(day.getDate());
  const cls = [{ id: 1, name: 'EMİNE', phone: '905338669933' }, { id: 2, name: 'RUHŞEN', phone: '905330000000' }];
  const sentAt = new Date(ymd + 'T08:39').getTime();
  const A = (id, cid, hm, wa) => ({ id, clientId: cid, status: 'confirmed', datetime: ymd + 'T' + hm, wa });
  const book = [
    A('e9', 1, '09:00', { u: ['x'], t: 1, n: sentAt }), A('e10', 1, '10:00'),
    A('r11', 2, '11:00', { u: ['x'], t: 1 }), A('r12', 2, '12:00'),
  ];
  const line = new Function('rdWaOn', 'clients', 'rdWaGroup', 'rdWaDayOf', 'rdWaHasUids', src3 + '\nreturn rdWaRemLine;')(
    () => true, cls,
    (of, d) => book.filter(a => a.clientId === of.clientId && a.datetime.slice(0, 10) === d).sort((x, y) => x.datetime.localeCompare(y.datetime)),
    a => String(a.datetime).slice(0, 10),
    a => !!(a && a.wa && Array.isArray(a.wa.u) && a.wa.u.length));
  const L = id => line(book.find(a => a.id === id));
  is(/Gönderildi 08:39/.test(L('e9')) && !/Şimdi gönder/.test(L('e9')), true, '09:00: a yellow "Gönderildi 08:39", no button');
  is(/#f5c518/.test(L('e9')) && !/<button/.test(L('e9')), true, '…yellow, and not something to press');
  is(/İlk randevuyla/.test(L('e10')) && /Gönderildi 08:39/.test(L('e10')), true, '10:00: says it went with the first booking');
  is(/Şimdi gönder/.test(L('e10')), false, '…and has no 📨 to send it again');
  is(/📨 Eski hatırlatma \(butonsuz\)/.test(L('r11')) && /Şimdi gönder/.test(L('r11')), true, '11:00 first booking, not yet asked: keeps its 📨');
  is(/11:00 randevusuyla: eski hatırlatma \(butonsuz\)/.test(L('r12')), true, '12:00: shows the 11:00 plan');
  is(/Şimdi gönder/.test(L('r12')), false, '…and its 📨 lives on the 11:00 card only');
}

console.log('6. the 1.5-hour message turns the button yellow on its own');
{
  const src4 = ['RD_WA_BTN_LIVE_AT', 'RD_WA_BTN_MIN', 'rdWaRemLine'].map(grab).join('\n');
  const z = n => String(n).padStart(2, '0');
  const at = m => { const t = new Date(Date.now() + m * 60e3); return t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate()) + 'T' + z(t.getHours()) + ':' + z(t.getMinutes()); };
  const LIVE = Date.UTC(2026, 9, 6, 13, 22);
  const planned = Date.now() - 86400e3;
  const book = [
    { id: 'gone', clientId: 1, status: 'confirmed', datetime: at(60), wa: { u: ['x'], t: Math.max(planned, LIVE + 1) } },
    { id: 'ahead', clientId: 2, status: 'confirmed', datetime: at(150), wa: { u: ['x'], t: Math.max(planned, LIVE + 1) } },
    { id: 'old', clientId: 3, status: 'confirmed', datetime: at(60), wa: { u: ['x'], t: LIVE - 86400e3 } },
    { id: 'begun', clientId: 4, status: 'confirmed', datetime: at(-10), wa: { u: ['x'], t: Math.max(planned, LIVE + 1) } },
  ];
  const cls = [1, 2, 3, 4].map(id => ({ id, name: 'C' + id, phone: '9053300000' + id }));
  const line = new Function('rdWaOn', 'clients', 'rdWaGroup', 'rdWaDayOf', 'rdWaHasUids', src4 + '\nreturn rdWaRemLine;')(
    () => true, cls, of => book.filter(a => a.clientId === of.clientId), a => String(a.datetime).slice(0, 10),
    a => !!(a && a.wa && Array.isArray(a.wa.u) && a.wa.u.length));
  const L = id => line(book.find(a => a.id === id));
  is(/Gönderildi/.test(L('gone')) && !/Şimdi gönder/.test(L('gone')), true, '60 min away, button plan: it went at −90 → yellow');
  is(/Şimdi gönder/.test(L('ahead')) && !/Gönderildi/.test(L('ahead')), true, '150 min away: still green, not yet gone');
  is(/Gönderildi/.test(L('old')), false, 'old plan (no buttons): never claimed as sent');
  is(/Gönderildi/.test(L('begun')), true, 'her hour has begun: the yellow mark stays on the card');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
