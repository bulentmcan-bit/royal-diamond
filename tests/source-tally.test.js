// ═══════════════════════════════════════════════════════════════════════════
// "Bizi nereden duydunuz?" — the real rdSrcTally sliced out of index.html.
// This is the only thing that turns advertising spend from a feeling into a
// number, so the counting has to be honest about what it does not know.
// It proves:
//   1. answers are tallied and ranked, commonest first
//   2. percentages are of the ANSWERED, never of everyone
//   3. an unanswered client is counted separately — never folded into "Diğer"
//   4. an unknown/typo source is folded into "Diğer" rather than dropped
//   5. the day window is judged on srcAt, falling back to the client id
//   6. days=0 means all time
//   7. an empty list does not throw
//
// Run:  node tests/source-tally.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const START = 'var SRC_LABELS = {';
const END = 'function rdSrcRender(){';
const i0 = html.indexOf(START);
const i1 = html.indexOf(END, i0);
if (i0 < 0 || i1 <= i0) { console.error('✗ marker not found — SRC_LABELS/rdSrcRender moved'); process.exit(1); }
const slice = html.slice(i0, i1);

const ctx = { Date, Math, String, Number, Object, JSON };
vm.createContext(ctx);
vm.runInContext(slice + '\n;__api={tally:rdSrcTally,labels:SRC_LABELS};', ctx, { filename: 'srctally.js' });
const api = ctx.__api;

let fails = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.error('  ✗ ' + msg); fails++; }
}

const NOW = Date.parse('2026-09-16T12:00:00Z');
const DAY = 86400000;
const ago = d => NOW - d * DAY;

function cli(src, daysAgo, opts) {
  opts = opts || {};
  const c = { id: opts.id !== undefined ? opts.id : ago(daysAgo), name: 'x' };
  if (src !== null) c.src = src;
  if (!opts.noSrcAt && src) c.srcAt = ago(daysAgo);
  return c;
}

console.log('\n1 — answers are tallied and ranked');
let t = api.tally([
  cli('google', 1), cli('google', 2), cli('google', 3),
  cli('instagram', 1), cli('instagram', 2),
  cli('tavsiye', 1),
], 30, NOW);
ok(t.answered === 6, 'six answers counted');
ok(t.rows.length === 3, 'three distinct sources');
ok(t.rows[0].key === 'google' && t.rows[0].n === 3, 'google leads with three');
ok(t.rows[1].key === 'instagram' && t.rows[1].n === 2, 'instagram second with two');
ok(t.rows[2].key === 'tavsiye' && t.rows[2].n === 1, 'tavsiye last with one');

console.log('\n2 — percentages are of the answered, not of everyone');
t = api.tally([
  cli('google', 1), cli('google', 2), cli('google', 3), cli('google', 4),
  cli('instagram', 1),
  cli('', 1), cli('', 2), cli('', 3), cli('', 4), cli('', 5),
], 30, NOW);
ok(t.answered === 5, 'five answered');
ok(t.unasked === 5, 'five never asked');
ok(t.total === 10, 'ten new clients in the window');
ok(t.rows[0].pct === 80, 'google is 80% of the ANSWERED, not 40% of everyone');

console.log('\n3 — an unanswered client is never folded into Diğer');
t = api.tally([cli('', 1), cli('', 2), cli('diger', 3)], 30, NOW);
const diger = t.rows.find(r => r.key === 'diger');
ok(diger && diger.n === 1, 'only the real "Diğer" answer lands in Diğer');
ok(t.unasked === 2, 'the two unasked stay in their own bucket');
ok(t.answered === 1, 'silence is not an answer');

console.log('\n4 — an unknown source is folded into Diğer, not dropped');
t = api.tally([cli('billboard', 1), cli('WhatsApp-durum', 2)], 30, NOW);
ok(t.answered === 2, 'both unknown answers are still counted');
ok(t.rows.length === 1 && t.rows[0].key === 'diger', 'they collapse into Diğer');
ok(t.rows[0].n === 2, 'Diğer holds both');

console.log('\n5 — the window is judged on srcAt, falling back to the id');
t = api.tally([cli('google', 5), cli('google', 40)], 30, NOW);
ok(t.answered === 1, 'the 40-day-old answer is outside a 30-day window');
// A client recorded before the field existed: no src, no srcAt — only an id.
t = api.tally([{ id: ago(5), name: 'old' }, { id: ago(40), name: 'older' }], 30, NOW);
ok(t.unasked === 1, 'a pre-field client falls in the window by her id alone');
// srcAt wins over id: added long ago, asked this week.
t = api.tally([{ id: ago(300), src: 'google', srcAt: ago(2) }], 30, NOW);
ok(t.answered === 1, 'an old customer asked this week counts this week');

console.log('\n6 — days=0 means all time');
t = api.tally([cli('google', 5), cli('google', 400)], 0, NOW);
ok(t.answered === 2, 'nothing is cut off when the range is Tümü');

console.log('\n7 — nothing blows up on rubbish input');
ok(api.tally([], 30, NOW).total === 0, 'an empty list gives an empty tally');
ok(api.tally(null, 30, NOW).total === 0, 'a missing list gives an empty tally');
ok(api.tally([null, undefined, cli('google', 1)], 30, NOW).answered === 1, 'holes in the list are skipped');

console.log('\n8 — every offered option has a label');
const OPTIONS = ['google', 'instagram', 'facebook', 'tiktok', 'tavsiye', 'tabela', 'otel', 'diger'];
OPTIONS.forEach(k => ok(!!api.labels[k], 'the dropdown value "' + k + '" has a label'));
// and the dropdown in the modal offers exactly these
const sel = html.match(/<select class="fctrl" id="c-src">[\s\S]*?<\/select>/);
ok(!!sel, 'the c-src dropdown is in the client modal');
const vals = [...sel[0].matchAll(/value="([^"]*)"/g)].map(m => m[1]).filter(Boolean);
ok(vals.join(',') === OPTIONS.join(','), 'the dropdown offers exactly the labelled keys, in order');

console.log('');
if (fails) { console.error(fails + ' FAILED'); process.exit(1); }
console.log('all source tally tests passed');
