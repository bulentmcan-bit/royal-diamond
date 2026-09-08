// ═══════════════════════════════════════════════════════════════════════════
// The appointment log must hear EVERY change to a confirmed future booking.
//
// 3 Sep 2026: the drop log (rdns_appt_droplog_v1) had been silent since 30 Aug
// while bookings kept going missing — it only ever heard from the paths that
// KNEW they were deleting (a tombstone, a merge drop). This test runs the REAL
// watch sliced out of index.html against a shadow of confirmed future
// bookings and proves a line is written, with old/new value, device and path,
// when a booking:
//   1. changes status                        (confirmed → cancelled)
//   2. has its datetime moved
//   3. leaves the array with no tombstone    (the silent case)
//   4. leaves the array with a tombstone     (a real deletion, still logged)
//   5. is changed by a cloud merge           (source device + the merge's why)
//   6. changed while the page was closed     (shadow survives a reload)
// and that a PAST booking, an already-cancelled booking, and a checkpoint with
// nothing new write nothing — the log must not drown in noise. Finally, the
// on-screen viewer's selection (newest 50, newest first) is pinned.
//
// Run:  node tests/appt-droplog.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function sliceBetween(start, end) {
  const i0 = html.indexOf(start);
  const i1 = html.indexOf(end, i0);
  if (i0 < 0 || i1 <= i0) {
    console.error('✗ marker not found in index.html: ' + JSON.stringify(start) + ' … ' + JSON.stringify(end));
    process.exit(1);
  }
  return html.slice(i0, i1);
}
// The key hygiene helpers the sync brain leans on, then the sync brain itself:
// stamps, tombs, the drop log, the merge, and the watch.
const slice =
  sliceBetween('const _RD_BAD_KEY=', '  function _rdTsOf(v){') +
  '\n' +
  sliceBetween("const APPT_STAMP_KEY='rdns_appt_stamp_v1';", '// One line per new booking');

function makeDevice(name, store) {
  store = store || {};
  store['rdns_device_id_v1'] = name;
  const ctx = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    window: {},
    document: { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild: () => {} } },
    console: { log: () => {}, warn: (...a) => console.warn('[ctx ' + name + ']', ...a), error: () => {}, table: () => {} },
    setTimeout: () => 0,
    Blob: function () {},
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    appointments: [],
    clients: [{ id: 7, name: 'Ayşe Yılmaz' }],
    Date, JSON, Math, Object, Array, String, Number, Boolean, isNaN, isFinite, parseFloat, parseInt, Error, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(
    slice +
      '\n;__api = { merge: _mergeRemoteAppts, adopt: apptStampAdopt, stampSync: apptStampSync,' +
      ' touch: apptTouch, tombAdd: apptTombAdd, mergeTomb: mergeRemoteApptTomb,' +
      ' why: function(){ return _apptMergeWhy; }, watch: apptWatchDiff,' +
      ' log: apptDropLogRead, last: apptDropLogLast, write: apptDropLog, fmt: _apptDropFmt };',
    ctx, { filename: name + '.js' }
  );
  const api = ctx.__api;
  return {
    name, store, ctx, api,
    get appts() { return ctx.appointments; },
    set appts(v) { ctx.appointments = v; },
    find(id) { return ctx.appointments.find(a => a && String(a.id) === String(id)); },
    // What dbSave does: the watch first, then the stamps, then the push.
    save(where) {
      const n = api.watch(where || 'kayıt (saveAll)');
      api.stampSync();
      return n;
    },
    // What the live listener does, watch included.
    receive(snap) {
      api.mergeTomb(snap.apptTomb);
      const merged = api.merge(JSON.parse(JSON.stringify(snap.appointments || [])), snap._ts);
      ctx.appointments = merged;
      api.adopt(ctx.appointments);
      return api.watch('bulut birleştirme (canlı dinleyici)', { by: snap._by, why: api.why() });
    },
    snapshot() {
      api.stampSync();
      return {
        appointments: JSON.parse(JSON.stringify(ctx.appointments)),
        apptTomb: JSON.parse(JSON.stringify(JSON.parse(store['rdns_appt_tomb_v1'] || '{}'))),
        _ts: Date.now(),
        _by: name,
      };
    },
    log() { return api.log(); },
    newest() { const l = api.log(); return l[l.length - 1]; },
  };
}

function iso(offsetDays, hh) {
  const d = new Date(Date.now() + offsetDays * 86400e3);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(hh || 14) + ':00';
}
const FUT = iso(3), FUT2 = iso(4, 15), PAST = iso(-3);
let seq = 100;
function mk(o) {
  return Object.assign({ id: ++seq, clientName: 'Ayşe Yılmaz', datetime: FUT, service: 'Manikür', staff: 'Helen', price: 800, status: 'confirmed' }, o || {});
}

let failed = 0;
function check(label, ok, detail) {
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok || !detail ? '' : ' — ' + detail));
  if (!ok) failed++;
}
function section(t) { console.log('\n' + t); }

// ── 0. first checkpoint: builds the shadow, writes nothing ──────────────────
section('0) İlk kontrol noktası: gölge kurulur, satır yazılmaz');
{
  const A = makeDevice('A');
  A.appts = [mk({ id: 101 }), mk({ id: 102, datetime: PAST })];
  check('nothing logged on the first save', A.save() === 0 && A.log().length === 0, JSON.stringify(A.log()));
  const shadow = JSON.parse(A.store['rdns_appt_watch_v1'] || '{}');
  check('shadow holds the future booking only', !!shadow['101'] && !shadow['102'], JSON.stringify(shadow));
  check('second save with nothing new writes nothing', A.save() === 0);
}

// ── 1. status change ────────────────────────────────────────────────────────
section('1) Onaylı gelecek randevunun durumu değişince');
{
  const A = makeDevice('A');
  A.appts = [mk({ id: 111 })];
  A.save();
  A.find(111).status = 'cancelled';
  const n = A.save();
  const r = A.newest();
  check('one line written', n === 1 && A.log().length === 1, 'n=' + n);
  check('kind=status, old/new carried', r && r.kind === 'status' && r.old === 'confirmed' && r.new === 'cancelled', JSON.stringify(r));
  check('id, name, datetime, device on the line', r && r.id === '111' && r.name === 'Ayşe Yılmaz' && r.when === FUT && r.dev === 'A', JSON.stringify(r));
  check('reason says the change', r && /DURUM confirmed → cancelled/.test(r.reason), r && r.reason);
  check('note names the checkpoint', r && /kayıt \(saveAll\)/.test(r.note), r && r.note);
  check('not written twice', A.save() === 0);
  A.find(111).status = 'confirmed';
  check('cancelled → confirmed is not watched (was not in the shadow)', A.save() === 0);
  A.find(111).status = 'completed';
  check('…but the re-confirmed booking is watched again', A.save() === 1 && A.newest().new === 'completed');
}

// ── 2. datetime moved ───────────────────────────────────────────────────────
section('2) Onaylı gelecek randevunun saati taşınınca');
{
  const A = makeDevice('A');
  A.appts = [mk({ id: 121 })];
  A.save();
  A.find(121).datetime = FUT2;
  const n = A.save();
  const r = A.newest();
  check('one line written', n === 1, 'n=' + n);
  check('kind=moved with old and new datetime', r && r.kind === 'moved' && r.old === FUT && r.new === FUT2, JSON.stringify(r));
  check('reason shows the move', r && r.reason.indexOf('TAŞINDI ' + FUT + ' → ' + FUT2) === 0, r && r.reason);
  A.find(121).datetime = PAST;
  check('moved into the past is still logged once', A.save() === 1 && A.newest().new === PAST);
  A.find(121).status = 'completed';
  check('…and a past booking then leaves the watch', A.save() === 0);
}

// ── 3. removed with no tombstone — the silent case ─────────────────────────
section('3) Diziden tombstone olmadan çıkınca (sessiz vaka)');
{
  const A = makeDevice('A');
  A.appts = [mk({ id: 131 }), mk({ id: 132 })];
  A.save();
  A.appts = A.appts.filter(a => a.id !== 131);
  const n = A.save();
  const r = A.newest();
  check('one line written', n === 1, 'n=' + n);
  check('kind=removed, old carries status @ datetime', r && r.kind === 'removed' && r.old === 'confirmed @ ' + FUT && r.new === '(yok)', JSON.stringify(r));
  check('reason shouts TOMBSTONE YOK', r && /TOMBSTONE YOK/.test(r.reason), r && r.reason);
  check('the surviving booking is untouched', A.log().every(x => x.id !== '132'));
}

// ── 4. removed WITH a tombstone ─────────────────────────────────────────────
section('4) Tombstone ile silinince');
{
  const A = makeDevice('A');
  A.appts = [mk({ id: 141 })];
  A.save();
  A.api.tombAdd(141, 'deleted by hand (deleteAppt)');
  A.appts = A.appts.filter(a => a.id !== 141);
  A.save();
  const lines = A.log().filter(x => x.id === '141');
  check('tombstone line + watch line', lines.length === 2, JSON.stringify(lines.map(x => x.reason)));
  const w = lines.find(x => x.kind === 'removed');
  check('watch line says the tombstone exists', !!w && /tombstone var/.test(w.reason), w && w.reason);
  check('every line carries the device', lines.every(x => x.dev === 'A'));
}

// ── 5. past / cancelled bookings write nothing ──────────────────────────────
section('5) Geçmiş ve zaten iptal randevular gürültü yapmaz');
{
  const A = makeDevice('A');
  A.appts = [mk({ id: 151, datetime: PAST }), mk({ id: 152, status: 'cancelled' }), mk({ id: 153, status: 'completed' })];
  A.save();
  A.find(151).status = 'completed';         // the normal checkout of a past booking
  A.find(152).datetime = FUT2;              // a cancelled one being shuffled
  A.appts = A.appts.filter(a => a.id !== 153);
  check('nothing logged', A.save() === 0 && A.log().length === 0, JSON.stringify(A.log()));
}

// ── 6. cloud merge ──────────────────────────────────────────────────────────
section('6) Bulut birleştirmesi değiştirince: kaynak cihaz ve sebep yazılır');
{
  const A = makeDevice('A'), B = makeDevice('B');
  A.appts = [mk({ id: 161, clientName: undefined, clientId: 7 }), mk({ id: 162 })];
  A.save();
  B.receive(A.snapshot());
  check('B logs nothing on first sight', B.log().length === 0, JSON.stringify(B.log()));
  // B cancels #161 (Done/iptal path: apptTouch writes _sts) and moves #162.
  B.find(161).status = 'cancelled'; B.api.touch(B.find(161));
  B.find(162).datetime = FUT2;
  B.save();
  const n = A.receive(B.snapshot());
  check('A writes two lines', n === 2, 'n=' + n + ' ' + JSON.stringify(A.log()));
  const s = A.log().find(x => x.id === '161'), m = A.log().find(x => x.id === '162');
  check('status line: name resolved from the client list', !!s && s.kind === 'status' && s.name === 'Ayşe Yılmaz' && s.new === 'cancelled', JSON.stringify(s));
  check('status line names the source device', !!s && /kaynak cihaz=B/.test(s.note), s && s.note);
  check('status line carries the merge\'s own why', !!s && /durum kendi damgasıyla|bulut kopyası kazandı/.test(s.note), s && s.note);
  check('moved line: old/new datetime', !!m && m.kind === 'moved' && m.old === FUT && m.new === FUT2, JSON.stringify(m));
  check('moved line says the cloud copy won', !!m && /bulut kopyası kazandı/.test(m.note), m && m.note);
  check('lines are stamped with the receiving device', s.dev === 'A' && m.dev === 'A');
  // The tombstone route: B deletes #162 for real.
  B.api.tombAdd(162, 'deleted by hand'); B.appts = B.appts.filter(a => a.id !== 162); B.save();
  A.receive(B.snapshot());
  const gone = A.log().filter(x => x.id === '162' && x.kind === 'removed');
  check('a tombstoned removal arriving by merge is logged with the tombstone noted', gone.length === 1 && /tombstone var/.test(gone[0].reason), JSON.stringify(gone));
}

// ── 7. the shadow survives a reload ─────────────────────────────────────────
section('7) Sayfa kapalıyken kaybolan randevu açılışta yazılır');
{
  const store = {};
  const A1 = makeDevice('A', store);
  A1.appts = [mk({ id: 171 }), mk({ id: 172 })];
  A1.save();
  // "Reload": a fresh context over the same localStorage, the array short one.
  const A2 = makeDevice('A', store);
  A2.appts = [mk({ id: 172 })];
  const n = A2.api.watch('açılış (localStorage yüklendi)');
  const r = A2.newest();
  check('one line at startup', n === 1, 'n=' + n);
  check('it is the missing booking, with its old values', !!r && r.id === '171' && r.kind === 'removed' && r.old === 'confirmed @ ' + FUT && /açılış/.test(r.note), JSON.stringify(r));
}

// ── 8. the on-screen selection: newest 50, newest first ────────────────────
section('8) Ekran: en yeni 50 kayıt, en yenisi başta');
{
  const A = makeDevice('A');
  for (let i = 1; i <= 60; i++) A.api.write({ id: i, clientName: 'M' + i, datetime: FUT }, i, 'test', '');
  const last = A.api.last(50);
  check('50 rows', last.length === 50, 'len=' + last.length);
  check('newest first', last[0].id === '60' && last[49].id === '11', last[0].id + '…' + last[49].id);
  check('0 = all rows', A.api.last(0).length === 60);
  const legacy = A.api.fmt({ t: Date.now(), id: '1', name: 'X', reason: 'r' });
  check('a pre-3-Sep line (no dev/kind) still formats', typeof legacy === 'string' && legacy.indexOf('#1') > 0, legacy);
  const withDev = A.api.fmt(last[0]);
  check('a new line shows its device', /cihaz=A/.test(withDev), withDev);
}

console.log('\n' + (failed ? '✗ ' + failed + ' assertion(s) failed' : '✓ all assertions passed'));
process.exit(failed ? 1 : 0);
