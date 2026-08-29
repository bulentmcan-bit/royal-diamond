// ═══════════════════════════════════════════════════════════════════════════
// The app side of the WhatsApp reminders — the REAL code sliced out of
// index.html between the WA-SLICE-START / WA-SLICE-END markers (plus the real
// normalizeWaPhone), run against a stub fetch. No network, no worker, no key
// leaves this process.
//
//   1. rdWaPayload: a clean booking becomes the exact /wa/schedule body;
//      the KAPALI blocker, a mangled phone and a broken datetime become null
//   2. no key on the device → rdWaSchedule never even calls fetch
//   3. a scheduled booking stores its uids on the LIVE record (a.wa.u),
//      stamped for the sync merge
//   4. rdWaCancel posts exactly those uids, moves them to a.wa.x, and a
//      second cancel finds nothing to send
//   5. rdWaReschedule = cancel the old + schedule the new
//   6. TEMPLATES_NOT_CONFIGURED surfaces a toast; other errors stay quiet
//
// Run:  node tests/wa-app.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const i0 = html.indexOf('// WA-SLICE-START');
const i1 = html.indexOf('// WA-SLICE-END');
if (i0 < 0 || i1 <= i0) { console.error('✗ WA-SLICE markers not found in index.html'); process.exit(1); }
const slice = html.slice(i0, i1);
const npMatch = html.match(/function normalizeWaPhone\(phone\)\{[\s\S]*?\n\}/);
if (!npMatch) { console.error('✗ normalizeWaPhone not found in index.html'); process.exit(1); }

let pass = 0, fail = 0;
function is(actual, expected, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ✓', what); }
  else { fail++; console.log('  ✗', what, '\n      got     ', a, '\n      expected', e); }
}
const tick = () => new Promise(r => setTimeout(r, 0));

// One fresh device per scenario: its own localStorage, appointment book,
// fetch recorder and canned worker replies.
function makeDevice() {
  const store = {}, calls = [], toasts = [];
  let touched = 0, saved = 0;
  const ctx = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document: { getElementById: () => null },
    setTimeout, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Promise,
    clients: [], appointments: [],
    apptById: id => ctx.appointments.find(x => String(x.id) === String(id)) || null,
    apptTouch: () => { touched++; },
    saveAll: () => { saved++; },
    toast: (i, t, m) => { toasts.push(t); },
    prompt: () => null, ownerPin: () => true,
    reply: { ok: true, scheduled: [], skipped: [] },
    fetch: (url, opts) => {
      calls.push({ url, opts });
      return Promise.resolve({ json: () => Promise.resolve(ctx.reply) });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(npMatch[0] + '\n' + slice, ctx, { filename: 'wa-slice.js' });
  return { ctx, store, calls, toasts, touched: () => touched, saved: () => saved };
}

(async () => {
  console.log('1. rdWaPayload — the /wa/schedule body, or null');
  {
    const d = makeDevice();
    const a = { id: 1756000000001, clientId: 7, service: 'Manikür', datetime: '2026-09-01T14:00' };
    is(vm.runInContext('rdWaPayload(' + JSON.stringify(a) + ', {id:7,name:"Ayşe Yılmaz",phone:"0533 866 9933"})', d.ctx),
       { apptId: '1756000000001', phone: '905338669933', name: 'Ayşe Yılmaz', dateISO: '2026-09-01', timeHHMM: '14:00', service: 'Manikür' },
       'a clean booking, phone normalised through the real normalizeWaPhone');
    is(vm.runInContext('rdWaPayload({id:1,datetime:"2026-09-01T14:00"}, {id:7,name:"KAPALI — Personel",phone:"05338669933"})', d.ctx),
       null, 'the KAPALI blocker → null');
    is(vm.runInContext('rdWaPayload({id:1,datetime:"2026-09-01T14:00"}, {id:7,name:"Ayşe",phone:"12345"})', d.ctx),
       null, 'a phone that does not clean up → null');
    is(vm.runInContext('rdWaPayload({id:2,datetime:"2026-09-04T08:00",service:"M"}, {id:8,name:"Suzsanna",phone:"35799716784"}).phone', d.ctx),
       '35799716784', 'a south Cyprus 357… number now schedules');
    is(vm.runInContext('rdWaPayload({id:3,datetime:"2026-09-01T10:00",service:"M"}, {id:9,name:"Pınar",phone:"+44 7493 876052"}).phone', d.ctx),
       '447493876052', 'a UK +44 number now schedules');
    is(vm.runInContext('rdWaPayload({id:4,datetime:"2026-09-01T10:00"}, {id:10,name:"X",phone:"99716784"})', d.ctx),
       null, 'a bare 8-digit local number stays rejected — and visible in the manual list');
    is(vm.runInContext('rdWaPayload({id:1,datetime:"yarın"}, {id:7,name:"Ayşe",phone:"05338669933"})', d.ctx),
       null, 'a broken datetime → null');
    is(vm.runInContext('rdWaPayload({id:1,datetime:"2026-09-01T14:00"}, null)', d.ctx),
       null, 'no client record → null');
  }

  console.log('2. no key on the device → dormant');
  {
    const d = makeDevice();
    d.ctx.clients.push({ id: 7, name: 'Ayşe', phone: '05338669933' });
    d.ctx.appointments.push({ id: 1, clientId: 7, service: 'M', datetime: '2026-09-01T14:00' });
    vm.runInContext('rdWaSchedule(appointments[0])', d.ctx);
    await tick();
    is(d.calls.length, 0, 'rdWaSchedule never calls fetch');
    vm.runInContext('rdWaCancel({id:1, wa:{u:["U1"]}})', d.ctx);
    await tick();
    is(d.calls.length, 0, 'rdWaCancel never calls fetch');
  }

  console.log('3. a booking stores its uids on the live record');
  {
    const d = makeDevice();
    d.store.rdns_wa_key_v1 = 'testkey';
    d.ctx.clients.push({ id: 7, name: 'Ayşe Yılmaz', phone: '0533 866 9933' });
    d.ctx.appointments.push({ id: 42, clientId: 7, service: 'Manikür', datetime: '2026-09-01T14:00' });
    d.ctx.reply = { ok: true, scheduled: [{ kind: 'r24', uid: 'U24' }, { kind: 'r1', uid: 'U1' }], skipped: [] };
    vm.runInContext('rdWaSchedule(appointments[0])', d.ctx);
    await tick(); await tick();
    is(d.calls.length, 1, 'one fetch');
    is(d.calls[0].url, 'https://rd-buttons.royaldiamond.workers.dev/wa/schedule', 'to /wa/schedule');
    is(d.calls[0].opts.headers['x-rd-key'], 'testkey', 'carrying the device key');
    is(JSON.parse(d.calls[0].opts.body).timeHHMM, '14:00', 'with the booking\'s own hour');
    is(d.ctx.appointments[0].wa.u, ['U24', 'U1'], 'uids stored on the live record');
    is(d.touched() >= 1 && d.saved() >= 1, true, 'stamped (apptTouch) and persisted (saveAll)');
  }

  console.log('4. cancel posts those uids once, and only once');
  {
    const d = makeDevice();
    d.store.rdns_wa_key_v1 = 'testkey';
    const a = { id: 42, wa: { u: ['U24', 'U1'], t: 1 } };
    d.ctx.appointments.push(a);
    d.ctx.reply = { ok: true, results: [{ uid: 'U24', ok: true }, { uid: 'U1', ok: true }] };
    vm.runInContext('rdWaCancel(appointments[0])', d.ctx);
    await tick(); await tick();
    is(d.calls.length, 1, 'one fetch');
    is(d.calls[0].url, 'https://rd-buttons.royaldiamond.workers.dev/wa/cancel', 'to /wa/cancel');
    is(JSON.parse(d.calls[0].opts.body), { uids: ['U24', 'U1'] }, 'exactly the stored uids');
    is(a.wa.u, undefined, 'pending uids cleared from the record');
    is(a.wa.x, ['U24', 'U1'], 'kept as the killed trace (wa.x)');
    vm.runInContext('rdWaCancel(appointments[0])', d.ctx);
    await tick();
    is(d.calls.length, 1, 'a second cancel finds nothing to send');
  }

  console.log('5. a moved booking: kill the old, book the new');
  {
    const d = makeDevice();
    d.store.rdns_wa_key_v1 = 'testkey';
    d.ctx.clients.push({ id: 7, name: 'Ayşe', phone: '05338669933' });
    const a = { id: 42, clientId: 7, service: 'M', datetime: '2026-09-02T11:00', status: 'confirmed', wa: { u: ['OLD24', 'OLD1'], t: 1 } };
    d.ctx.appointments.push(a);
    d.ctx.reply = { ok: true, scheduled: [{ kind: 'r24', uid: 'NEW24' }], skipped: [{ kind: 'r1', why: 'past' }], results: [] };
    vm.runInContext('rdWaReschedule(appointments[0])', d.ctx);
    await tick(); await tick();
    const urls = d.calls.map(c => c.url.split('/wa/')[1]);
    is(urls, ['cancel', 'schedule'], 'cancel first, then schedule');
    is(JSON.parse(d.calls[0].opts.body), { uids: ['OLD24', 'OLD1'] }, 'the old uids die');
    is(JSON.parse(d.calls[1].opts.body).timeHHMM, '11:00', 'the new hour is scheduled');
    is(a.wa.u, ['NEW24'], 'the record now carries the new uid');
  }

  console.log('6. failure surfacing');
  {
    const d = makeDevice();
    d.store.rdns_wa_key_v1 = 'testkey';
    d.ctx.clients.push({ id: 7, name: 'Ayşe', phone: '05338669933' });
    d.ctx.appointments.push({ id: 42, clientId: 7, service: 'M', datetime: '2026-09-01T14:00' });
    d.ctx.reply = { ok: false, error: { code: 'TEMPLATES_NOT_CONFIGURED', message: 'fill WA_R24/WA_R1' } };
    vm.runInContext('rdWaSchedule(appointments[0])', d.ctx);
    await tick(); await tick();
    is(d.toasts.length, 1, 'the not-configured failure gets a toast');
    is(d.ctx.appointments[0].wa, undefined, 'and nothing false lands on the record');
    d.ctx.reply = { ok: false, error: { code: 'SEND_FAILED', message: 'x' } };
    vm.runInContext('rdWaSchedule(appointments[0])', d.ctx);
    await tick(); await tick();
    is(d.toasts.length, 1, 'other errors log quietly, no toast storm');
  }

  console.log('7. the backfill scan — who still needs reminders, and why not');
  {
    const d = makeDevice();
    const now = new Date('2026-08-29T12:00').getTime();
    const H = 3600e3;
    const cls = [
      { id: 1, name: 'Ayşe Yılmaz', phone: '05338669933' },
      { id: 2, name: 'KAPALI — Personel', phone: '05330000000' },
      { id: 3, name: 'Telefonsuz Müşteri', phone: '' },
    ];
    const appts = [
      { id: 10, clientId: 1, status: 'confirmed', datetime: '2026-08-31T14:00', service: 'M' },  // 50h out → both
      { id: 11, clientId: 1, status: 'confirmed', datetime: '2026-08-29T18:00', service: 'M' },  // 6h out → r1 only
      { id: 12, clientId: 1, status: 'confirmed', datetime: '2026-08-29T13:30', service: 'M' },  // 1.5h → both past
      { id: 13, clientId: 1, status: 'confirmed', datetime: '2026-08-28T10:00', service: 'M' },  // yesterday
      { id: 14, clientId: 1, status: 'cancelled', datetime: '2026-08-31T10:00', service: 'M' },  // dead
      { id: 15, clientId: 1, status: 'confirmed', datetime: '2026-09-01T10:00', service: 'M', wa: { u: ['X'], t: 1 } }, // has uids
      { id: 16, clientId: 2, status: 'confirmed', datetime: '2026-09-01T11:00', service: 'M' },  // blocker
      { id: 17, clientId: 3, status: 'confirmed', datetime: '2026-09-01T12:00', service: 'M' },  // no phone
    ];
    const scan = vm.runInContext(
      'rdWaBackfillScan(' + JSON.stringify(appts) + ',' + JSON.stringify(cls) + ',' + now + ')', d.ctx);
    is(scan.eligible.map(e => e.id), [10, 11], 'only the two un-reminded future bookings are eligible');
    is(scan.eligible.map(e => e.both), [true, false], '50h out gets both; 6h out gets only the 2-hour one');
    is([scan.already, scan.tooSoon, scan.blocked, scan.noPhone], [1, 1, 1, 1],
       'uids-already / too-soon / KAPALI / no-phone each counted, none scheduled');
    is(scan.eligible[0].payload.timeHHMM, '14:00', 'the payload is the same one a fresh booking would send');
  }

  console.log('8. the manual panel no longer double-messages');
  {
    const m = html.match(/function r24AutoCovered\(g\)\{[\s\S]*?\n\}/);
    if (!m) { fail++; console.log('  ✗ r24AutoCovered not found in index.html'); }
    else {
      const d = makeDevice();
      vm.runInContext(m[0] + ';__r24=r24AutoCovered;', d.ctx);
      const covered = { wa: { u: ['U24', 'U1'] } };
      const bare = {};
      const emptyU = { wa: { t: 1 } };                      // both sends were past — u stripped
      is(vm.runInContext('__r24(' + JSON.stringify([covered]) + ')', d.ctx), true,
         'a booking with stored uids offers NO Generate');
      is(vm.runInContext('__r24(' + JSON.stringify([bare]) + ')', d.ctx), false,
         'a booking with no reminder stays generatable — the exception report');
      is(vm.runInContext('__r24(' + JSON.stringify([emptyU]) + ')', d.ctx), false,
         'a same-day booking whose sends were both past stays generatable');
      is(vm.runInContext('__r24(' + JSON.stringify([covered, bare]) + ')', d.ctx), false,
         'a mixed client-group errs toward the manual list, never a silent skip');
      is(vm.runInContext('__r24([])', d.ctx), false, 'an empty group is not "covered"');
    }
  }

  console.log('9. the answer mark on the appointment itself');
  {
    const m = html.match(/function rdWaAnsMark\(a, mini\)\{[\s\S]*?\n\}/);
    if (!m) { fail++; console.log('  ✗ rdWaAnsMark not found'); }
    else {
      const d = makeDevice();
      d.ctx.clients.push({ id: 7, name: 'Ayşe', phone: '05338669933' });
      vm.runInContext(m[0] + ';__mark=rdWaAnsMark;', d.ctx);
      const mk = (a, mini) => vm.runInContext('__mark(' + JSON.stringify(a) + ',' + !!mini + ')', d.ctx);
      is(mk({ id: 1, clientId: 7, status: 'confirmed', waAns: { v: 'confirm', at: 1 } }).includes('🟢'), true,
         'confirmed → the green dot (not the checkout tick)');
      const ch = mk({ id: 1, clientId: 7, status: 'confirmed', waAns: { v: 'change', at: 1 } });
      is(ch.includes('↻') && ch.includes('tel:+905338669933') && ch.includes('Ara'), true,
         'change → amber ↻ with 📞 Ara right on the row');
      is(mk({ id: 1, clientId: 7, status: 'confirmed', waAns: { v: 'change', at: 1 } }, true).includes('Ara'), false,
         'mini variant (tight calendar cells) drops the Ara button, keeps the mark');
      is(mk({ id: 1, clientId: 7, status: 'confirmed' }), '', 'no answer → no mark');
      is(mk({ id: 1, clientId: 7, status: 'cancelled', waAns: { v: 'confirm', at: 1 } }), '',
         'a cancelled booking shows no mark');
    }
  }
  {
    // A moved booking drops its answer — the question is asked afresh.
    const d = makeDevice();
    d.store.rdns_wa_key_v1 = 'testkey';
    d.ctx.clients.push({ id: 7, name: 'Ayşe', phone: '05338669933' });
    const a = { id: 42, clientId: 7, status: 'confirmed', datetime: '2026-09-02T11:00',
                wa: { u: ['U1'], t: 1 }, waAns: { v: 'confirm', at: 5 } };
    d.ctx.appointments.push(a);
    d.ctx.reply = { ok: true, scheduled: [], skipped: [], results: [] };
    vm.runInContext('rdWaReschedule(appointments[0])', d.ctx);
    await tick(); await tick();
    is(a.waAns, undefined, 'rdWaReschedule clears the old hour\'s answer');
  }

  console.log('');
  console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
  process.exit(fail ? 1 : 0);
})();
