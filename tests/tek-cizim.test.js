// ═══════════════════════════════════════════════════════════════════════════
// ⏱ TEK ÇİZİM — one redraw, however many snapshots arrive (6 Kasım 2026).
//
// Nineteen redraws were wired straight to cloud events. Every snapshot from
// every machine redrew the screen the instant it landed, one call per event,
// blocking. Quiet morning: nothing. Saturday afternoon with three technicians
// checking out, the Crown Board writing and reminders going: the screen
// redrew several times a second for a picture that had not changed.
//
// Both other explanations were measured and ruled out first:
//   · the page does not leak — 300 full redraw cycles moved the DOM by five
//     elements and the heap by nothing at all
//   · the data is not heavy — the whole 1.4 MB book parses in 6 ms
// What was left was the NUMBER of redraws.
//
// Run:  node tests/tek-cizim.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function is(got, want, label) {
  const okk = JSON.stringify(got) === JSON.stringify(want);
  if (okk) pass++; else fail++;
  console.log((okk ? '  ✓ ' : '  ✗ ') + label + (okk ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
}
const ok = (c, l) => is(!!c, true, l);

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ── the real scheduler, lifted out and run on a fake clock ───────────────
function build() {
  const from = html.indexOf('  var RD_SYNC_REDRAW_MS = 150;');
  const to = html.indexOf('  window.rdSyncRender = rdSyncRender;');
  if (from < 0 || to <= from) { console.error('could not slice the scheduler'); process.exit(1); }
  let timers = [], now = 0;
  const ctx = {
    console, window: {},
    setTimeout: (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length; }
  };
  vm.createContext(ctx);
  vm.runInContext(html.slice(from, to) + '\nthis.f=rdSyncRender;', ctx);
  return {
    render: ctx.f,
    stats: () => ctx.window._rdRedrawStats,
    tick: ms => { now += ms; const due = timers.filter(t => t.at <= now); timers = timers.filter(t => t.at > now); due.forEach(t => t.fn()); }
  };
}

console.log('1. a burst becomes one redraw');
{
  const h = build();
  let drew = 0;
  const dash = () => drew++;
  for (let i = 0; i < 12; i++) h.render('renderDash', dash);   // twelve snapshots in a flurry
  is(drew, 0, 'nothing is drawn while the snapshots are still arriving');
  h.tick(150);
  is(drew, 1, 'twelve snapshots → ONE redraw');
  is(h.stats(), { asked: 12, drawn: 1 }, 'and it says so: 12 asked, 1 drawn');
}
{
  const h = build();
  let a = 0, b = 0;
  h.render('renderDash', () => a++);
  h.render('renderAppts', () => b++);
  h.render('renderDash', () => a++);
  h.tick(150);
  is([a, b], [1, 1], 'two different screens still both get drawn — once each');
}

console.log('2. it keeps up — it does not fall behind');
{
  const h = build();
  let drew = 0;
  const f = () => drew++;
  h.render('x', f); h.tick(150);
  is(drew, 1, 'first burst drawn');
  h.render('x', f); h.tick(150);
  is(drew, 2, 'a later snapshot opens a new window and is drawn');
  h.render('x', f); h.render('x', f); h.tick(150);
  is(drew, 3, '…and that window coalesces too');
}
{
  const h = build();
  let drew = 0;
  h.render('x', () => drew++);
  h.tick(149);
  is(drew, 0, 'at 149 ms, not yet');
  h.tick(1);
  is(drew, 1, 'at 150 ms, drawn — nobody can see that');
}

console.log('3. one bad screen cannot take the others down');
{
  const h = build();
  let good = 0;
  h.render('bad', () => { throw new Error('boom'); });
  h.render('good', () => good++);
  h.tick(150);
  is(good, 1, 'a redraw that throws does not stop the rest');
}
{
  const h = build();
  h.render('nothing', null);
  h.render('nothing2', undefined);
  h.tick(150);
  is(h.stats().asked, 0, 'a missing renderer is ignored, not queued');
}

console.log('4. how it is wired into the page');
{
  const a = html.indexOf("_fbDb.ref('rdns_main_v1').on('value'");
  const b = html.indexOf('rdns_rebook_v1');
  const region = html.slice(a, b + 3000);
  const direct = region.split('\n').filter(l =>
    /try\{\s*(render[A-Za-z]*|dtRender)\(\);/.test(l));
  is(direct, [], 'no cloud listener redraws the screen directly any more');
  is((region.match(/rdSyncRender\(/g) || []).length, 20, 'all twenty go through the scheduler');
}
{
  const multi = html.split('\n').filter(l => (l.match(/rdSyncRender\(/g) || []).length > 1);
  ok(multi.every(l => l.includes('{')), 'a line with two redraws keeps them inside its if — none made unconditional');
}
ok(html.indexOf('function rdSyncRender(name, fn)') < html.indexOf("_fbDb.ref('rdns_main_v1').on('value'"),
   'the scheduler is defined before any listener can fire');
ok(/window\._rdRedrawStats = \{ asked: 0, drawn: 0 \};/.test(html),
   'and it counts what it saved, so the gain can be checked on the real machine');

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ all ') + pass + ' passed');
process.exit(fail ? 1 : 0);
