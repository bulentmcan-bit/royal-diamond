// ═══════════════════════════════════════════════════════════════════════════
// Vadeli ödeme — the merge may add and correct, it may never take away.
//
// 11 Sep 2026: two deferred payments entered on the owner's laptop and one at
// reception all saved, all toasted, all vanished, badge Synced throughout.
// deferredPayments had none of the merge-never-replace protection given to
// appointments and clients in August: both cloud read paths replaced the array
// wholesale, dbSave pushed whatever the device held, and a stale copy erased
// the new record. This test runs the REAL slice out of index.html on two
// devices, A and B, exchanging snapshots, and pins:
//   1. A adds dp1, B's pre-dp1 snapshot arrives → dp1 survives, _dpMergeKept
//   2. A's snapshot reaches B → B gains dp1
//   3. dpDelete on A (tombstone, then filter) → B's snapshot still carrying dp1
//      does not resurrect it, on either device, on either read path
//   4. dpMarkPaid on A beats B's unpaid copy by _dts, whichever side sends
//   5. a record with no _dts at all — everything in the salon's data today —
//      is never dropped by either walk
//   6. a snapshot with deferredPayments undefined leaves the local array as is
//   7. ccOverrides: a correction on A survives B's stale snapshot; ccClear on
//      A removes it on B
// and that every removal leaves a line in rdns_dp_log_v1, and that both read
// paths, dbSave and the write paths are wired.
//
// Run:  node tests/deferred-merge.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function sliceBetween(start, end) {
  const i0 = html.indexOf(start), i1 = html.indexOf(end, i0);
  if (i0 < 0 || i1 <= i0) { console.error('✗ marker not found in index.html: ' + start); process.exit(1); }
  return html.slice(i0, i1);
}
const slice = sliceBetween('// DP-SLICE-START', '// DP-SLICE-END');
const clone = o => JSON.parse(JSON.stringify(o === undefined ? null : o));

function makeDevice(name) {
  const store = { 'rdns_device_id_v1': name };
  const ctx = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    window: {}, document: { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild: () => {} } },
    console: { log: () => {}, warn: (...a) => console.warn('[ctx ' + name + ']', ...a), error: () => {}, table: () => {} },
    deferredPayments: [], ccOverrides: {}, clients: [],
    Date, JSON, Math, Object, Array, String, Number, Boolean, isNaN, Error, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(slice + '\n;__api = { touch: dpTouch, tombAdd: dpTombAdd, tombHas: dpTombHas, mergeTomb: mergeRemoteDpTomb, merge: _mergeRemoteDp,' +
    ' kept: function(){ return _dpMergeKept; }, ccMerge: _mergeRemoteCcOverrides, ccKept: function(){ return _ccMergeKept; }, ccOf: ccOvrOf, log: dpLogRead, last: dpLogLast };', ctx, { filename: name + '.js' });
  const api = ctx.__api;
  return {
    name, store, ctx, api,
    get dps() { return ctx.deferredPayments; }, set dps(v) { ctx.deferredPayments = v; },
    find(id) { return ctx.deferredPayments.find(p => p && p.id === id); },
    // What both read paths do — the live listener and syncForceLoad call the
    // same three functions in the same order.
    receive(snap) {
      api.mergeTomb(snap.dpTomb);
      ctx.deferredPayments = api.merge(snap.deferredPayments === undefined ? undefined : clone(snap.deferredPayments), snap._ts, snap._by);
      const kept = api.kept();
      ctx.ccOverrides = api.ccMerge(clone(snap.ccOverrides), snap._ts);
      return kept;
    },
    snapshot() {
      return { deferredPayments: clone(ctx.deferredPayments), ccOverrides: clone(ctx.ccOverrides), dpTomb: clone(JSON.parse(store['rdns_dp_tomb_v1'] || '{}')), _ts: Date.now(), _by: name };
    },
    // What dpDelete does: tombstone first, then the filter.
    del(id) { const p = this.find(id); api.tombAdd(id, 'deleted by hand (dpDelete)', p); ctx.deferredPayments = ctx.deferredPayments.filter(x => x.id !== id); },
    // What dpMarkPaid does to the record.
    pay(id) { const p = this.find(id); p.paid = true; p.paidAt = '2026-09-11'; api.touch(p); },
    add(o) { const p = api.touch(Object.assign({ id: 'dp' + Date.now() + Math.floor(Math.random() * 1000), name: 'Ayşe', cur: '₺', amount: 1500, due: '2026-09-20', paid: false, created: '2026-09-11' }, o || {})); ctx.deferredPayments.push(p); return p; },
    log() { return api.log(); },
  };
}
const tick = () => new Promise(r => setTimeout(r, 3));

let failed = 0;
function check(label, ok, detail) { console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok || !detail ? '' : ' — ' + detail)); if (!ok) failed++; }
function section(t) { console.log('\n' + t); }

(async () => {
  // ── 1 ────────────────────────────────────────────────────────────────────
  section('1) A dp1 ekler, B\'nin dp1 öncesi anlık görüntüsü gelir → dp1 kalır');
  {
    const A = makeDevice('A'), B = makeDevice('B');
    const stale = B.snapshot();            // B knows nothing yet
    await tick();
    const dp1 = A.add({ id: 'dp1', name: 'Zerin', amount: 3300 });
    const kept = A.receive(stale);
    check('dp1 survives the stale snapshot', !!A.find('dp1') && A.dps.length === 1, JSON.stringify(A.dps));
    check('_dpMergeKept is true — A pushes it back', kept === true);
    check('dp1 carries a _dts from dpTouch', typeof dp1._dts === 'number' && dp1._dts > 0);
    check('nothing logged as lost', A.log().length === 0, JSON.stringify(A.log()));
    void B;
  }

  // ── 2 ────────────────────────────────────────────────────────────────────
  section('2) A\'nın anlık görüntüsü B\'ye ulaşır → B dp1\'i kazanır');
  {
    const A = makeDevice('A'), B = makeDevice('B');
    A.add({ id: 'dp1', name: 'Zerin', amount: 3300 });
    B.add({ id: 'dp2', name: 'Kader', amount: 900 });
    await tick();
    const kept = B.receive(A.snapshot());
    check('B now holds dp1 AND its own dp2', !!B.find('dp1') && !!B.find('dp2') && B.dps.length === 2, JSON.stringify(B.dps.map(p => p.id)));
    check('B defended dp2, so it pushes back', kept === true);
    A.receive(B.snapshot());
    check('…and A gains dp2 the same way', !!A.find('dp2') && A.dps.length === 2);
  }

  // ── 3 ────────────────────────────────────────────────────────────────────
  section('3) A\'da dpDelete → B\'nin dp1 taşıyan anlık görüntüsü onu geri getirmez (iki cihaz, iki yol)');
  {
    const A = makeDevice('A'), B = makeDevice('B');
    A.add({ id: 'dp1', name: 'Zerin', amount: 3300 });
    B.receive(A.snapshot());
    await tick();
    const bStale = B.snapshot();          // B still carries dp1, no tombstone
    A.del('dp1');
    check('A: dp1 gone, tombstone written', !A.find('dp1') && A.api.tombHas('dp1') > 0);
    A.receive(bStale);                    // live listener path
    check('A, live listener: B\'s stale copy does not resurrect dp1', !A.find('dp1'), JSON.stringify(A.dps));
    A.receive(bStale);                    // the same merge again, as syncForceLoad would
    check('A, syncForceLoad path: still gone', !A.find('dp1'));
    B.receive(A.snapshot());              // the tombstone travels
    check('B learns the deletion and drops dp1', !B.find('dp1') && B.api.tombHas('dp1') > 0, JSON.stringify(B.dps));
    B.receive(bStale);                    // B\'s own old copy comes round again
    check('B: an old snapshot still carrying dp1 does not bring it back', !B.find('dp1'));
    const lines = A.log().filter(l => l.id === 'dp1');
    check('A logged the tombstone and the arrival', lines.length >= 2 && lines.every(l => /tombstone|deleted by hand/.test(l.reason)), JSON.stringify(lines.map(l => l.reason)));
    const l0 = lines[lines.length - 1];
    check('a line carries id, name, amount, due, this device and the snapshot\'s device', l0.id === 'dp1' && l0.name === 'Zerin' && l0.amount === 3300 && l0.due === '2026-09-20' && l0.dev === 'A' && l0.by === 'B', JSON.stringify(l0));
    check('B logged its drop with A as the source', B.log().some(l => l.id === 'dp1' && l.by === 'A'), JSON.stringify(B.log()));
  }

  // ── 4 ────────────────────────────────────────────────────────────────────
  section('4) A\'da dpMarkPaid, B\'nin ödenmemiş kopyasını _dts ile yener — hangi taraf gönderirse');
  {
    const A = makeDevice('A'), B = makeDevice('B');
    A.add({ id: 'dp1', name: 'Zerin', amount: 3300 });
    B.receive(A.snapshot());
    await tick();
    A.pay('dp1');
    await tick();
    const bUnpaid = B.snapshot();         // written AFTER the payment, still says unpaid
    A.receive(bUnpaid);
    check('A keeps paid=true against B\'s later-but-older-stamped copy', A.find('dp1').paid === true, JSON.stringify(A.find('dp1')));
    B.receive(A.snapshot());
    check('B takes paid=true from A', B.find('dp1').paid === true && B.find('dp1').paidAt === '2026-09-11');
    check('B logged that the cloud copy won', B.log().some(l => l.id === 'dp1' && /cloud copy won/.test(l.reason)), JSON.stringify(B.log()));
    // A same-millisecond double edit still orders.
    const p = A.find('dp1'); const t1 = p._dts; A.api.touch(p); const t2 = p._dts;
    check('a second touch is strictly later', t2 > t1, t1 + ' → ' + t2);
  }

  // ── 5 ────────────────────────────────────────────────────────────────────
  section('5) _dts taşımayan kayıt — bugünkü verinin tamamı — hiçbir yürüyüşte düşmez');
  {
    const A = makeDevice('A'), B = makeDevice('B');
    A.dps = [{ id: 'old1', name: 'Eski', amount: 500, due: '2026-08-01', paid: false }];              // held locally, unstamped
    B.dps = [{ id: 'old2', name: 'Eski2', amount: 700, due: '2026-08-02', paid: false }];             // arrives in snapshot, unstamped
    A.receive(B.snapshot());
    check('A keeps its unstamped record and gains the unstamped remote one', !!A.find('old1') && !!A.find('old2') && A.dps.length === 2, JSON.stringify(A.dps.map(p => p.id)));
    B.receive(A.snapshot());
    check('B the same', !!B.find('old1') && !!B.find('old2') && B.dps.length === 2);
    // Same unstamped id on both sides: the cloud copy is taken, nothing dropped.
    const C = makeDevice('C'); C.dps = [{ id: 'old1', name: 'Eski', amount: 500, paid: true }];
    A.receive(C.snapshot());
    check('same unstamped id both sides → the record stays (cloud version)', !!A.find('old1') && A.dps.length === 2 && A.find('old1').paid === true);
  }

  // ── 6 ────────────────────────────────────────────────────────────────────
  section('6) deferredPayments alanı olmayan anlık görüntü yerel diziyi olduğu gibi bırakır');
  {
    const A = makeDevice('A');
    A.add({ id: 'dp1' }); A.add({ id: 'dp2' });
    const before = clone(A.dps);
    const snap = A.snapshot(); delete snap.deferredPayments;
    A.receive(snap);
    check('both records still there, same order', JSON.stringify(A.dps) === JSON.stringify(before), JSON.stringify(A.dps.map(p => p.id)));
    const snap2 = A.snapshot(); snap2.deferredPayments = null;
    A.receive(snap2);
    check('null too', A.dps.length === 2);
  }

  // ── 7 ────────────────────────────────────────────────────────────────────
  section('7) ccOverrides: A\'daki düzeltme B\'nin bayat görüntüsünü atlatır; A\'daki temizleme B\'de de kaldırır');
  {
    const A = makeDevice('A'), B = makeDevice('B');
    const stale = B.snapshot();
    await tick();
    A.ctx.ccOverrides['2026-09-11'] = { nakit: 5000, kart: 2000, iban: 0, alacak: 300, ts: Date.now() };
    A.receive(stale);
    check('the correction survives B\'s stale snapshot', !!A.api.ccOf(A.ctx.ccOverrides, '2026-09-11') && A.api.ccOf(A.ctx.ccOverrides, '2026-09-11').nakit === 5000, JSON.stringify(A.ctx.ccOverrides));
    check('_ccMergeKept is true', A.api.ccKept() === true);
    B.receive(A.snapshot());
    check('B gains the correction', !!B.api.ccOf(B.ctx.ccOverrides, '2026-09-11'));
    await tick();
    // ccEditReset on A: a dated clearing, never a delete.
    A.ctx.ccOverrides['2026-09-11'] = { _del: true, ts: Math.max(Date.now(), (A.ctx.ccOverrides['2026-09-11'].ts || 0) + 1) };
    check('A reads the day as "no override"', A.api.ccOf(A.ctx.ccOverrides, '2026-09-11') === null);
    B.receive(A.snapshot());
    check('B reads it as "no override" too — the clearing won by ts', B.api.ccOf(B.ctx.ccOverrides, '2026-09-11') === null, JSON.stringify(B.ctx.ccOverrides));
    // And B's earlier copy, coming back, does not undo the clearing.
    const bOld = { ccOverrides: { '2026-09-11': { nakit: 5000, kart: 2000, iban: 0, alacak: 300, ts: Date.now() - 60000 } }, deferredPayments: [], _ts: Date.now(), _by: 'B' };
    A.receive(bOld);
    check('an older correction arriving later does not undo the clearing', A.api.ccOf(A.ctx.ccOverrides, '2026-09-11') === null);
  }

  // ── 8 ────────────────────────────────────────────────────────────────────
  section('8) Bağlantılar: iki okuma yolu, dbSave, yazma yolları, günlük');
  {
    const live = html.slice(html.indexOf("try{ console.log('[sync] ↓ snapshot:'"), html.indexOf('_mainSnapRecheck();},800);'));
    check('live listener: tomb merged, array merged, ccOverrides merged, both written back into the stored snapshot', /mergeRemoteDpTomb\(remote\.dpTomb\)/.test(live) && /deferredPayments=_mergeRemoteDp\(remote\.deferredPayments, remote\._ts, remote\._by\)/.test(live) && /ccOverrides=_mergeRemoteCcOverrides\(remote\.ccOverrides, remote\._ts\)/.test(live) && /remote\.deferredPayments=deferredPayments;/.test(live) && /remote\.dpTomb=dpTomb;/.test(live));
    check('live listener pushes back when it defended a record', /if\(phonesFixed\|\|moneyKept\|\|apptsKept\|\|clientsKept\|\|dpKept\|\|ccKept\)/.test(html));
    const force = html.slice(html.indexOf('function syncForceLoad(){'), html.indexOf("console.log('Loaded from Firebase:'"));
    check('syncForceLoad: the same three, written back', /mergeRemoteDpTomb\(val\.dpTomb\)/.test(force) && /deferredPayments=_mergeRemoteDp\(val\.deferredPayments, val\._ts, val\._by\)/.test(force) && /ccOverrides=_mergeRemoteCcOverrides\(val\.ccOverrides, val\._ts\)/.test(force) && /val\.dpTomb=dpTomb;/.test(force));
    check('syncForceLoad pushes back too', /if\(apptsKept\|\|_apptMoneyKept\|\|clientsKept\|\|dpKept\|\|ccKept\)/.test(force));
    check('no wholesale replacement is left', !/deferredPayments=(remote|val)\.deferredPayments\|\|\[\];/.test(html) && !/ccOverrides=(remote|val)\.ccOverrides\|\|\{\};/.test(html));
    check('dbSave carries dpTomb', /payMethods, apptTomb, clientTomb, dpTomb\};/.test(html));
    check('startup folds in the stored tombstones', /mergeRemoteDpTomb\(_dbLoaded\?\.dpTomb\)/.test(html));
    check('dpAdd and dpSaveFromAppt stamp the new record', (html.match(/dpList\(\)\.push\(dpTouch\(\{/g) || []).length === 2);
    check('dpMarkPaid and dpKasaCollect stamp the payment', (html.match(/p\.paid=true; p\.paidAt=(dpToday\(\)|today);\r?\n\s*dpTouch\(p\);/g) || []).length === 2);
    check('dpKasaLater stamps the snooze', /p\.kasaSnooze=today; dpTouch\(p\);/.test(html));
    check('dpDelete writes the tombstone BEFORE it filters', /dpTombAdd\(id,'deleted by hand \(dpDelete\)',p\);\r?\n\s*deferredPayments=dpList\(\)\.filter/.test(html));
    check('ccEditReset writes a dated clearing, not a delete', /ccOverrides\[day\]=\{_del:true, ts:Math\.max/.test(html) && !/delete ccOverrides\[day\]/.test(html));
    check('the two read sites go through ccOvrOf', /const ovr=ccOvrOf\(ccOverrides,day\);/.test(html) && /const ovr=\(typeof ccOverrides!=='undefined'\)\?ccOvrOf\(ccOverrides,day\):null;/.test(html));
    check('rdDpLog on window, the viewer, and the Kasa Kontrol link', /window\.rdDpLog=function\(n\)/.test(html) && /window\.rdShowDpLog=function\(limit\)/.test(html) && /onclick="rdShowDpLog\(\);return false;"[^>]*>📒 Vadeli Ödeme Günlüğü<\/a>/.test(html));
    // The log keeps the newest 200.
    const A = makeDevice('A');
    for (let i = 0; i < 230; i++) A.api.tombAdd('x' + i, 'r');
    check('the log keeps the newest 200', A.log().length === 200 && A.log()[199].id === 'x229' && A.api.last(5)[0].id === 'x229', A.log().length + ' ' + A.log()[199].id);
  }

  console.log('\n' + (failed ? '✗ ' + failed + ' assertion(s) failed' : '✓ all assertions passed'));
  process.exit(failed ? 1 : 0);
})();
