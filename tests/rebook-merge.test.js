// ═══════════════════════════════════════════════════════════════════════════
// Two laptops, one cloud — the SONRAKİ RANDEVU items must cross and never
// resurrect. Runs the REAL store/merge code sliced out of index.html between
// the RB-SLICE-START / RB-SLICE-END markers (not a re-implementation).
//
//   1. an item created on A reaches B                          (A → B)
//   2. resolving it on B (Saat ver → booked) crosses back to A (B → A, _uts)
//   3. items created on BOTH devices at once both survive      (union)
//   4. a missing item on one side is an addition, not a delete (no loss)
//   5. an owner delete (status:"deleted") wins over the old copy everywhere
//   6. every generated id and stored key is Firebase-legal     (no decimals)
//   7. rbUpsert refuses an illegal id outright
//
// Run:  node tests/rebook-merge.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const START = '// RB-SLICE-START';
const END = '// RB-SLICE-END';
const i0 = html.indexOf(START);
const i1 = html.indexOf(END);
if (i0 < 0 || i1 <= i0) {
  console.error('✗ RB-SLICE markers not found in index.html');
  process.exit(1);
}
const slice = html.slice(i0, i1);

function makeDevice(name) {
  const store = {};
  const ctx = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, JSON, Math, Object, Array, String, Number, Boolean, isNaN, parseFloat, parseInt, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(
    slice +
      '\n;__api = { store: function(){ return rbStore; }, items: rbItems, upsert: rbUpsert,' +
      ' merge: rbMergeRemote, persist: rbPersist, newId: rebookId, keyOk: RB_KEY_OK };',
    ctx, { filename: name + '.js' }
  );
  const api = ctx.__api;
  return {
    name,
    api,
    // what the app pushes to the cloud after every change
    save() { return JSON.parse(JSON.stringify(api.store())); },
    // what the listener does when a cloud snapshot arrives
    recv(cloud) { return api.merge(JSON.parse(JSON.stringify(cloud))); },
  };
}

let fails = 0;
function T(label, ok) {
  console.log((ok ? '✓ ' : '✗ ') + label);
  if (!ok) fails++;
}

const A = makeDevice('reception');
const B = makeDevice('owner');

// 1 — created on A, reaches B
const id1 = A.api.newId();
A.api.upsert({ id: id1, clientId: '42', fromApptId: '9001', staff: 'Hannah', service: 'Dolgu (Infill)', duration: 60, targetDate: '2026-09-16', source: '3w', status: 'pending', createdAt: Date.now(), createdBy: 'devA' });
B.recv(A.save());
T('A → B: pending item crosses', B.api.items().some(i => i.id === id1 && i.status === 'pending'));

// 2 — resolved on B, crosses back, does not resurrect on A
const itB = B.api.store().items[id1];
itB.status = 'booked'; itB.resolvedApptId = '9100'; itB.resolvedAt = Date.now();
B.api.upsert(itB);
A.recv(B.save());
T('B → A: booked status wins by _uts', A.api.store().items[id1].status === 'booked');
T('B → A: resolvedApptId travels', A.api.store().items[id1].resolvedApptId === '9100');

// 3 — simultaneous creation on both survives as a union
const id2 = A.api.newId();
A.api.upsert({ id: id2, clientId: '7', status: 'pending', targetDate: '2026-09-20', createdAt: Date.now(), createdBy: 'devA' });
const id3 = String(Date.now() + 5) + '_11111';
B.api.upsert({ id: id3, clientId: '8', status: 'declined', declineReason: 'fiyat', createdAt: Date.now(), createdBy: 'devB' });
const cloudA = A.save(), cloudB = B.save();
A.recv(cloudB); B.recv(cloudA);
T('union: A holds both new items', !!A.api.store().items[id2] && !!A.api.store().items[id3]);
T('union: B holds both new items', !!B.api.store().items[id2] && !!B.api.store().items[id3]);

// 4 — a cloud copy MISSING an item does not delete it locally, and the merge
//     reports the local side won so the app pushes the union back
const localWon = A.recv({ items: {} , _ts: Date.now(), _by: 'devB' });
T('missing on remote is not a deletion', !!A.api.store().items[id1] && !!A.api.store().items[id2]);
T('merge reports local-side win for push-back', localWon === true);

// 5 — owner delete travels as a status and wins
const itA = A.api.store().items[id2];
itA.status = 'deleted';
A.api.upsert(itA);
B.recv(A.save());
T('delete-as-status crosses and wins', B.api.store().items[id2].status === 'deleted');

// 6 — key hygiene: every id/key legal, no decimals anywhere
const KEY = A.api.keyOk;
let allOk = true;
for (let i = 0; i < 500; i++) { if (!KEY.test(A.api.newId())) allOk = false; }
T('500 generated ids all match /^[A-Za-z0-9_-]+$/', allOk);
const pushed = A.save();
T('pushed payload keys all legal', Object.keys(pushed.items).every(k => KEY.test(k) && !/\./.test(k)));

// 7 — an illegal id is refused outright
const refused = A.api.upsert({ id: '1779103044957.9568', clientId: '1', status: 'pending' });
T('decimal id refused by rbUpsert', refused === false && !A.api.store().items['1779103044957.9568']);

console.log(fails ? '\n' + fails + ' FAILED' : '\nall rebook merge tests passed');
process.exit(fails ? 1 : 0);
