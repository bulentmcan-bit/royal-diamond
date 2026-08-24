// ═══════════════════════════════════════════════════════════════════════════
// Two laptops, one cloud — the appointment RECORDS must cross.
//
// 24 Aug 2026: seven bookings made at reception never appeared on the owner's
// laptop, and one made on the owner's never appeared at reception. This test
// simulates exactly that desk: two devices, each running the REAL merge code
// sliced out of index.html (not a re-implementation), and a last-write-wins
// cloud between them. It proves:
//   1. a record created on A reaches B                          (A → B)
//   2. a record created on B reaches A                          (B → A)
//   3. records created on BOTH at the same time both survive    (union)
//   4. a record deleted on A stays deleted on B                 (tombstone)
//   5. a remote record with NO stamps at all is still adopted   (unstamped)
//   6. a tombstone removes ONLY its own id, never a new booking (no poisoning)
//   7. a status change (Done on A) crosses to B                 (_sts)
//
// Run:  node tests/sync-two-device.test.js
// Exits 1 if any assertion fails, so it can gate a commit.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// The real sync brain lives between these two markers in index.html: the
// stamp/tomb maps, the drop log, _mergeRemoteAppts, the audit, adopt/sync.
const START = "const APPT_STAMP_KEY='rdns_appt_stamp_v1';";
const END = '// One line per new booking';
const i0 = html.indexOf(START);
const i1 = html.indexOf(END);
if (i0 < 0 || i1 <= i0) {
  console.error('✗ marker not found in index.html — the slice boundaries moved');
  process.exit(1);
}
const slice = html.slice(i0, i1);

// ── one simulated laptop ────────────────────────────────────────────────────
function makeDevice(name) {
  const store = {};
  const ctx = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    window: {},
    document: { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild: () => {} } },
    console: { log: () => {}, warn: () => {}, error: () => {}, table: () => {} },
    setTimeout: () => 0,
    Blob: function () {},
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    appointments: [],
    clients: [],
    Date, JSON, Math, Object, Array, String, Number, Boolean, isNaN, parseFloat, parseInt,
  };
  vm.createContext(ctx);
  vm.runInContext(
    slice +
      '\n;__api = { merge: _mergeRemoteAppts, adopt: apptStampAdopt, stampSync: apptStampSync,' +
      ' touch: apptTouch, tombAdd: apptTombAdd, mergeTomb: mergeRemoteApptTomb,' +
      ' tomb: function(){ return apptTomb; }, kept: function(){ return _apptMergeKept; },' +
      ' drops: apptDropLogRead };',
    ctx, { filename: name + '.js' }
  );
  const api = ctx.__api;
  return {
    name,
    get appts() { return ctx.appointments; },
    set appts(v) { ctx.appointments = v; },
    find(id) { return ctx.appointments.find(a => a && String(a.id) === String(id)); },
    // What the app does on every save: stamp local edits, then hand the full
    // picture to the cloud (dbSave → apptStampSync → syncPush).
    save() {
      api.stampSync();
      return {
        appointments: JSON.parse(JSON.stringify(ctx.appointments)),
        apptTomb: JSON.parse(JSON.stringify(api.tomb())),
        _ts: Date.now(),
        _by: name,
      };
    },
    // What the live listener does on every snapshot: merge tombs, merge
    // records, adopt the stamps. Returns true when the merge had to defend a
    // local record — the app then pushes the corrected union back up.
    receive(snap) {
      api.mergeTomb(snap.apptTomb);
      const merged = api.merge(JSON.parse(JSON.stringify(snap.appointments || [])), snap._ts);
      const kept = api.kept();
      ctx.appointments = merged;
      api.adopt(ctx.appointments);
      return kept;
    },
    touch(a) { api.touch(a); },
    del(id, reason) {
      api.tombAdd(id, reason || 'test delete');
      ctx.appointments = ctx.appointments.filter(a => String(a.id) !== String(id));
    },
    drops() { return api.drops(); },
  };
}

// ── the cloud between them: .set() is last-write-wins, every set notifies the
//    OTHER device (its own echo is suppressed in the app and irrelevant here).
//    receive() returning true = the app would push back — modelled faithfully,
//    with a hop limit so a ping-pong bug fails the test instead of hanging it.
function makeCloud(devices) {
  return {
    snap: null,
    push(from) {
      this.snap = from.save();
      let hops = 0;
      let queue = devices.filter(d => d !== from);
      while (queue.length) {
        if (++hops > 20) throw new Error('sync ping-pong: no convergence after 20 hops');
        const d = queue.shift();
        const kept = d.receive(JSON.parse(JSON.stringify(this.snap)));
        if (kept) {
          this.snap = d.save();
          queue = queue.concat(devices.filter(x => x !== d));
        }
      }
    },
  };
}

// ── assertions ──────────────────────────────────────────────────────────────
let failed = 0;
function check(label, ok, detail) {
  if (ok) { console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}
function ids(dev) { return dev.appts.map(a => String(a.id)).sort().join(','); }
const mk = (id, extra) => Object.assign(
  { id, clientId: 1, service: 'Manikür', datetime: '2026-08-24T10:00', duration: 60, price: 0, staff: 'Hannah', status: 'confirmed', r24: false, r1: false },
  extra || {}
);

// 1 ── created on A reaches B ------------------------------------------------
{
  console.log('1) A’da oluşturulan kayıt B’ye ulaşıyor mu?');
  const A = makeDevice('A'), B = makeDevice('B');
  const cloud = makeCloud([A, B]);
  A.appts.push(mk(1001));
  cloud.push(A);
  check('B holds #1001', !!B.find(1001));
}

// 2 ── created on B reaches A ------------------------------------------------
{
  console.log('2) B’de oluşturulan kayıt A’ya ulaşıyor mu?');
  const A = makeDevice('A'), B = makeDevice('B');
  const cloud = makeCloud([A, B]);
  B.appts.push(mk(2001));
  cloud.push(B);
  check('A holds #2001', !!A.find(2001));
}

// 3 ── both create at once: the union survives, in both push orders ----------
{
  console.log('3) İkisi aynı anda oluşturunca: birlik (union) korunuyor mu?');
  const A = makeDevice('A'), B = makeDevice('B');
  const cloud = makeCloud([A, B]);
  A.appts.push(mk(3001, { staff: 'Helen' }));
  B.appts.push(mk(3002, { staff: 'Lissa' }));
  cloud.push(A);   // A's copy (without 3002) hits the cloud first
  cloud.push(B);   // then B's — which by now must already carry both
  check('A holds both', !!A.find(3001) && !!A.find(3002), 'A=' + ids(A));
  check('B holds both', !!B.find(3001) && !!B.find(3002), 'B=' + ids(B));
  check('A and B identical', ids(A) === ids(B), ids(A) + ' vs ' + ids(B));
}

// 4 ── deleted on A stays deleted on B, and never resurrects -----------------
{
  console.log('4) A’da silinen, B’de de siliniyor ve geri dirilmiyor mu?');
  const A = makeDevice('A'), B = makeDevice('B');
  const cloud = makeCloud([A, B]);
  A.appts.push(mk(4001));
  cloud.push(A);
  check('B got it first', !!B.find(4001));
  A.del(4001, 'test: deleted by hand');
  cloud.push(A);
  check('B dropped it', !B.find(4001));
  cloud.push(B);   // B pushes its world back — the tombstone must hold on A
  check('A still without it', !A.find(4001));
  check('the drop was logged on B', B.drops().some(r => String(r.id) === '4001'),
    'droplog: ' + JSON.stringify(B.drops().map(r => r.id)));
}

// 5 ── a remote record with NO stamps is still adopted -----------------------
{
  console.log('5) Damgasız (eski sürümden) uzak kayıt kabul ediliyor mu?');
  const B = makeDevice('B');
  const bare = { id: 5001, clientId: 9, service: 'Pedikür', datetime: '2026-08-24T12:00', status: 'confirmed' }; // no _ats, no _sts
  const kept = B.receive({ appointments: [bare], apptTomb: {}, _ts: Date.now(), _by: 'A' });
  check('B adopted the unstamped record', !!B.find(5001));
  check('nothing had to be defended', kept === false);
}

// 6 ── a tombstone kills only its own id -------------------------------------
{
  console.log('6) Tombstone sadece kendi id’sini mi düşürüyor?');
  const A = makeDevice('A'), B = makeDevice('B');
  const cloud = makeCloud([A, B]);
  A.appts.push(mk(6001));
  cloud.push(A);
  A.del(6001);
  cloud.push(A);
  B.appts.push(mk(6002)); // a NEW booking on B, different id
  cloud.push(B);
  check('new #6002 crossed to A', !!A.find(6002));
  check('#6001 stayed deleted everywhere', !A.find(6001) && !B.find(6001));
}

// 7 ── a status change (Done on A) crosses to B ------------------------------
{
  console.log('7) A’da basılan Done, B’ye geçiyor mu?');
  const A = makeDevice('A'), B = makeDevice('B');
  const cloud = makeCloud([A, B]);
  A.appts.push(mk(7001));
  cloud.push(A);
  const a = A.find(7001);
  a.status = 'completed';
  A.touch(a);           // what completeAppt does: fresh _ats + _sts
  cloud.push(A);
  check('B sees completed', B.find(7001) && B.find(7001).status === 'completed',
    'B status=' + (B.find(7001) && B.find(7001).status));
}

console.log('');
if (failed) { console.log('❌ ' + failed + ' assertion(s) FAILED'); process.exit(1); }
console.log('✅ all two-device sync assertions passed');
