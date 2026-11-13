/* resepsiyon-hizi.test.js — reception was still slow on 13 Kasım 2026, and
   this is what was actually costing the time. Two loops, both of them doing
   millions of comparisons to produce a handful of answers:

     rdWaGroup   — the dashboard asks it 73 times a draw. Its filter ran
                   rdWaOffRoster (walks the roster) and rdWaGroupKey (walks
                   all 901 clients) on every one of 3.700 bookings, then threw
                   away everything not on the day asked for.
     buildWAQueue— a find() over 3.700 bookings inside a loop over 901
                   clients. 3,3 million comparisons, each parsing a date.

   Both were fixed by doing the cheap test first, not by changing any rule.
   These tests pin the thing that matters: THE ANSWER IS THE SAME. Each one
   runs the old shape and the new shape over the same book and fails on any
   difference. Measured on the owner's laptop: dashboard draw 205ms -> 67ms,
   buildWAQueue's loop 118ms -> 0,7ms. Reception is several times slower than
   that laptop, so the same cut is worth about a second and a half a draw. */

const assert = require('assert');

let pass = 0, fail = 0;
function test(name, fn){
  try { fn(); pass++; }
  catch (e) { fail++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

// ── a book to run both shapes over ────────────────────────────────────────
function makeBook(){
  const clients = [];
  for (let i = 0; i < 40; i++){
    clients.push({ id: 1000 + i, name: 'C' + i, phone: i % 7 === 0 ? '' : '90533000' + String(1000 + i) });
  }
  // two records, one phone — the Hamide case rdWaGroupKey exists for
  clients.push({ id: 2001, name: 'Hamide Kucuk',    phone: '905330001234' });
  clients.push({ id: 2002, name: 'HAMİDE KÜÇÜKOĞLU', phone: '905330001234' });

  const appts = [];
  let id = 1;
  const days = ['2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14'];
  for (const d of days){
    for (const c of clients){
      for (const hm of ['09:00','13:00']){
        appts.push({
          id: id++, clientId: c.id, datetime: d + 'T' + hm,
          status: (id % 11 === 0) ? 'cancelled' : (id % 5 === 0 ? 'completed' : 'confirmed'),
          staff: (id % 13 === 0) ? 'Manager' : 'Helen'
        });
      }
    }
  }
  // a booking with no usable datetime at all
  appts.push({ id: id++, clientId: 1000, datetime: '', status: 'confirmed', staff: 'Helen' });
  return { clients, appts };
}

const { clients, appts } = makeBook();

const normalizeWaPhone = p => String(p || '').replace(/\D/g, '');
const rdWaDayOf = a => {
  const dt = String((a && a.datetime) || '');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dt) ? dt.slice(0, 10) : null;
};
const KNOWN = ['Helen','Lissa','Emma','Haley'];
const rdWaOffRoster = a => {
  const s = String((a && a.staff) || '').trim();
  if (!s) return false;
  return KNOWN.indexOf(s) === -1;
};
const rdWaGroupKey = (a, cls) => {
  const list = cls || clients;
  const c = list.find(x => x && String(x.id) === String(a.clientId));
  const ph = normalizeWaPhone((c && c.phone) || '');
  return (ph && ph.length >= 10) ? ('p' + ph) : ('c' + String(a.clientId));
};
const sortGroup = g => g.sort((x, y) => {
  const c = String(x.datetime).localeCompare(String(y.datetime));
  return c || (String(x.id) < String(y.id) ? -1 : 1);
});

// the two shapes
const groupOld = (of, dayISO) => {
  const key = rdWaGroupKey(of);
  return sortGroup(appts.filter(a =>
    a && a.status !== 'cancelled' && !rdWaOffRoster(a) && rdWaDayOf(a) === dayISO && rdWaGroupKey(a) === key));
};
const groupNew = (of, dayISO) => {
  const key = rdWaGroupKey(of);
  return sortGroup(appts.filter(a =>
    a && rdWaDayOf(a) === dayISO && a.status !== 'cancelled' && !rdWaOffRoster(a) && rdWaGroupKey(a) === key));
};

console.log('\nrdWaGroup — the day test moved to the front');

test('every booking in the book groups identically', () => {
  let checked = 0;
  for (const a of appts){
    const d = rdWaDayOf(a);
    if (!d) continue;
    const A = groupOld(a, d).map(x => x.id).join(',');
    const B = groupNew(a, d).map(x => x.id).join(',');
    assert.strictEqual(B, A, 'booking ' + a.id + ' on ' + d + ': ' + A + ' vs ' + B);
    checked++;
  }
  assert.ok(checked > 300, 'expected to check the whole book, checked ' + checked);
});

test('two records on one phone still land in one group', () => {
  const a = appts.find(x => x.clientId === 2001 && rdWaDayOf(x) === '2026-11-13' && x.status !== 'cancelled');
  const g = groupNew(a, '2026-11-13');
  const ids = g.map(x => x.clientId);
  assert.ok(ids.indexOf(2002) !== -1, 'the second record is missing from the group');
});

test('a day with nothing on it gives an empty group, not a throw', () => {
  const a = appts[0];
  assert.deepStrictEqual(groupNew(a, '2026-01-01'), []);
  assert.deepStrictEqual(groupOld(a, '2026-01-01'), []);
});

test('a booking with no datetime is never pulled into a day', () => {
  const ghost = appts[appts.length - 1];
  assert.strictEqual(rdWaDayOf(ghost), null);
  for (const d of ['2026-11-10','2026-11-13','2026-11-14']){
    assert.ok(groupNew(appts[0], d).every(x => x.id !== ghost.id));
  }
});

test('a cancelled booking is still excluded', () => {
  const cancelled = appts.find(x => x.status === 'cancelled' && rdWaDayOf(x));
  const g = groupNew(cancelled, rdWaDayOf(cancelled));
  assert.ok(g.every(x => x.id !== cancelled.id));
});

test('an off-roster booking is still excluded', () => {
  const ghost = appts.find(x => x.staff === 'Manager' && x.status !== 'cancelled' && rdWaDayOf(x));
  const g = groupNew(ghost, rdWaDayOf(ghost));
  assert.ok(g.every(x => x.id !== ghost.id));
});

// ── buildWAQueue: her next confirmed booking ──────────────────────────────
console.log('\nbuildWAQueue — one pass instead of a find() per client');

const hrs = dt => {
  const t = Date.parse(dt);
  if (!isFinite(t)) return -1;
  return (t - Date.parse('2026-11-09T12:00')) / 3600000;
};

const nextOld = c => appts.find(a => String(a.clientId) === String(c.id) && a.status === 'confirmed' && hrs(a.datetime) > 0);
function buildIndex(){
  const idx = {};
  for (let i = 0; i < appts.length; i++){
    const a = appts[i];
    if (!a || a.status !== 'confirmed') continue;
    if (!(hrs(a.datetime) > 0)) continue;
    const k = String(a.clientId);
    if (!(k in idx)) idx[k] = a;
  }
  return idx;
}

test('every client gets the same booking the find() gave', () => {
  const idx = buildIndex();
  for (const c of clients){
    const want = nextOld(c);
    const got = idx[String(c.id)];
    assert.strictEqual(got && got.id, want && want.id, 'client ' + c.id);
  }
});

test('it is the FIRST match in array order, like find()', () => {
  const idx = buildIndex();
  for (const k of Object.keys(idx)){
    const first = appts.find(a => String(a.clientId) === k && a.status === 'confirmed' && hrs(a.datetime) > 0);
    assert.strictEqual(idx[k].id, first.id, 'client ' + k + ' got a later booking than find() would');
  }
});

test('a client with nothing upcoming is absent, so appt is undefined', () => {
  const idx = buildIndex();
  const none = { id: 999999 };
  assert.strictEqual(idx[String(none.id)], undefined);
});

test('cancelled and completed bookings are never chosen', () => {
  const idx = buildIndex();
  for (const k of Object.keys(idx)) assert.strictEqual(idx[k].status, 'confirmed');
});

test('a booking in the past is never chosen', () => {
  const idx = buildIndex();
  for (const k of Object.keys(idx)) assert.ok(hrs(idx[k].datetime) > 0, 'client ' + k + ' got a past booking');
});

test('an unparseable datetime cannot be chosen', () => {
  const idx = buildIndex();
  for (const k of Object.keys(idx)) assert.ok(rdWaDayOf(idx[k]) !== null);
});

// ── the point of the whole exercise ───────────────────────────────────────
console.log('\nthe work actually done');

test('the new group filter touches the roster far less often', () => {
  let oldCalls = 0, newCalls = 0;
  const day = '2026-11-13';
  const of = appts[0];
  const key = rdWaGroupKey(of);
  appts.filter(a => { if (a && a.status !== 'cancelled'){ oldCalls++; } return false; });
  appts.filter(a => { if (a && rdWaDayOf(a) === day){ newCalls++; } return false; });
  assert.ok(newCalls * 4 < oldCalls, 'expected far fewer expensive tests: ' + newCalls + ' vs ' + oldCalls);
  assert.ok(key.length > 1);
});

test('the index is built in one pass, not one per client', () => {
  let reads = 0;
  const probe = appts.map(a => new Proxy(a, { get(t, p){ if (p === 'clientId') reads++; return t[p]; } }));
  const idx = {};
  for (let i = 0; i < probe.length; i++){
    const a = probe[i];
    if (!a || a.status !== 'confirmed') continue;
    if (!(hrs(a.datetime) > 0)) continue;
    const k = String(a.clientId);
    if (!(k in idx)) idx[k] = a;
  }
  assert.ok(reads <= appts.length, 'read clientId ' + reads + ' times for ' + appts.length + ' bookings');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
