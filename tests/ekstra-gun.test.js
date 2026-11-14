/* ekstra-gun.test.js — extraDays: a single date a technician is in on, when
   her weekly pattern does not cover it.

   Beyhan works Salı and Perşembe. The owner wanted her on the diary for
   Cumartesi 14 Kasım 2026. Adding 6 to her workdays would have done it — and
   would also have given her a column EVERY Cumartesi afterwards, until
   somebody remembered to take it out. A wrong column is noticed in a minute;
   one nobody remembers to remove is noticed in March.

   So extraDays names the date and nothing else. The day passes and she is off
   again with nothing to undo. These tests pin the two halves of that: the day
   is open, and the week is not changed — and that a one-off day can never
   bring back someone who has left or someone who has not started, because
   leftOn and joinedOn are asked first.

   Run: node tests/ekstra-gun.test.js
*/

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'crown-config.js'), 'utf8');
const CROWN = new Function(src + '; return CROWN;')();

let pass = 0, fail = 0;
function test(name, fn){
  try { fn(); pass++; }
  catch (e) { fail++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}
const names = d => CROWN.rosterOn(d).map(o => o.name);
const on = (who, d) => names(d).indexOf(who) !== -1;

// ── the day itself ────────────────────────────────────────────────────────
console.log('\nthe one day that was asked for');

test('Beyhan is on the diary for Cumartesi 14 Kasım', () => {
  assert.ok(on('Beyhan', '2026-11-14'), 'Beyhan is missing from 14 Kasım');
});

test('she is NOT there the following Cumartesi', () => {
  assert.ok(!on('Beyhan', '2026-11-21'), 'the extra day repeated into 21 Kasım');
});

test('nor the Cumartesi before it', () => {
  assert.ok(!on('Beyhan', '2026-11-07'));
});

test('her Salı and Perşembe are untouched', () => {
  assert.ok(on('Beyhan', '2026-11-17'), 'Salı');
  assert.ok(on('Beyhan', '2026-11-19'), 'Perşembe');
  assert.ok(on('Beyhan', '2026-11-10'), 'Salı');
  assert.ok(on('Beyhan', '2026-11-12'), 'Perşembe');
});

test('she is still off on the days she has never worked', () => {
  for (const d of ['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-15'])
    assert.ok(!on('Beyhan', d), d);
});

test('nobody else moved on 14 Kasım', () => {
  const got = names('2026-11-14').sort();
  assert.deepStrictEqual(got, ['Beyhan', 'Emma', 'Haley', 'Helen', 'Lissa', 'Saeideh'].sort());
});

// ── the helper ────────────────────────────────────────────────────────────
console.log('\nreading the list');

test('a good list comes back', () => {
  assert.deepStrictEqual(CROWN.extraDaysOf({ extraDays: ['2026-11-14'] }), ['2026-11-14']);
});

test('no list at all is null, not a crash', () => {
  assert.strictEqual(CROWN.extraDaysOf({}), null);
  assert.strictEqual(CROWN.extraDaysOf(null), null);
  assert.strictEqual(CROWN.extraDaysOf({ extraDays: [] }), null);
  assert.strictEqual(CROWN.extraDaysOf({ extraDays: 'nope' }), null);
});

test('a malformed date is dropped, the good ones kept', () => {
  assert.deepStrictEqual(
    CROWN.extraDaysOf({ extraDays: ['14/11/2026', '2026-11-14', 20261114, null, '2026-13-99x'] }),
    ['2026-11-14']);
});

test('a list of nothing but rubbish is null, so her week still decides', () => {
  assert.strictEqual(CROWN.extraDaysOf({ extraDays: ['soon', '', 7] }), null);
});

// ── it can only ever ADD a day ────────────────────────────────────────────
console.log('\nwhat it must never do');

function roster(ops, d){
  const saved = CROWN.operators;
  CROWN.operators = ops;
  try { return CROWN.rosterOn(d).map(o => o.name); }
  finally { CROWN.operators = saved; }
}

test('it cannot bring back someone who has left', () => {
  const ops = [{ key: 'x', name: 'Gitmis', leftOn: '2026-06-30', extraDays: ['2026-11-14'] }];
  assert.deepStrictEqual(roster(ops, '2026-11-14'), [], 'leftOn must still win');
});

test('it cannot bring in someone before she started', () => {
  const ops = [{ key: 'y', name: 'Yeni', joinedOn: '2026-12-01', extraDays: ['2026-11-14'] }];
  assert.deepStrictEqual(roster(ops, '2026-11-14'), [], 'joinedOn must still win');
});

test('it does not take a day away from anyone', () => {
  const ops = [{ key: 'z', name: 'Zed', workdays: [1], extraDays: ['2026-11-14'] }];
  assert.deepStrictEqual(roster(ops, '2026-11-16'), ['Zed'], 'her Pazartesi must survive');
  assert.deepStrictEqual(roster(ops, '2026-11-14'), ['Zed'], 'and the extra day is added');
  assert.deepStrictEqual(roster(ops, '2026-11-17'), [], 'and nothing else is');
});

test('an extra day on someone with no workdays changes nothing', () => {
  const ops = [{ key: 'a', name: 'Herkes', extraDays: ['2026-11-14'] }];
  for (const d of ['2026-11-13', '2026-11-14', '2026-11-15'])
    assert.deepStrictEqual(roster(ops, d), ['Herkes'], d);
});

test('several extra days all work', () => {
  const ops = [{ key: 'b', name: 'Bir', workdays: [1], extraDays: ['2026-11-14', '2026-12-25'] }];
  assert.deepStrictEqual(roster(ops, '2026-11-14'), ['Bir']);
  assert.deepStrictEqual(roster(ops, '2026-12-25'), ['Bir']);
  assert.deepStrictEqual(roster(ops, '2026-12-26'), []);
});

test('a Date object is read the same as the string', () => {
  assert.ok(CROWN.rosterOn(new Date(2026, 10, 14, 12, 0)).some(o => o.name === 'Beyhan'));
  assert.ok(!CROWN.rosterOn(new Date(2026, 10, 21, 12, 0)).some(o => o.name === 'Beyhan'));
});

// ── the file itself ───────────────────────────────────────────────────────
console.log('\nthe file');

test('crown-config.js is still LF only', () => {
  assert.ok(!/\r/.test(src), 'a carriage return appeared in crown-config.js');
});

test('only Beyhan carries an extra day', () => {
  const who = CROWN.operators.filter(o => o.extraDays).map(o => o.name);
  assert.deepStrictEqual(who, ['Beyhan']);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
