// ═══════════════════════════════════════════════════════════════════════════
// THE WATCHDOG AND THE NIGHT'S OWN REFRESH (5 Kasım 2026).
//
// A freshly loaded page is fast — measured on Bülent's own laptop the same
// evening he said it was crawling: interactive in 1.5 s, nothing on the wire
// over a second, 4,481 elements, 90 MB. The tab he was working in had been
// open since morning. So: take the pulse through the day, and never let a
// tab live into the next one.
//
// The reload decision is the dangerous half. A page that throws away a
// half-finished checkout is far worse than a slow one, so every test below
// that ends in "no reload" matters more than the ones that reload.
//
// Run:  node tests/gece-yenileme.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function is(got, want, label) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
}
const ok = (c, l) => is(!!c, true, l);

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ── the real decision, lifted out and run ─────────────────────────────────
const from = html.indexOf('  function rdReloadDue(now, openedAt, openedDay, lastTouch, isBusy, todayStr){');
const to   = html.indexOf('  window.rdReloadDue = rdReloadDue;');
if (from < 0 || to <= from) { console.error('could not slice rdReloadDue'); process.exit(1); }
const rdReloadDue = new Function('IDLE_MIN', 'OPEN_HOURS',
  html.slice(from, to) + '\nreturn rdReloadDue;')(15, 8);

const H = 3600e3, M = 60e3;
const NOW = new Date('2026-11-06T09:00:00').getTime();
const TODAY = new Date(NOW).toDateString();
const YESTERDAY = new Date(NOW - 24 * H).toDateString();

console.log('1. it reloads when it should');
ok(rdReloadDue(NOW, NOW - 9 * H, TODAY, NOW - 20 * M, false, TODAY),
   'nine hours open, untouched for twenty minutes → reload');
ok(rdReloadDue(NOW, NOW - 2 * H, YESTERDAY, NOW - 20 * M, false, TODAY),
   'opened yesterday → reload even after only two hours');
ok(rdReloadDue(NOW, NOW - 8 * H, TODAY, NOW - 15 * M, false, TODAY),
   'exactly on both thresholds → reload');

console.log('2. it leaves the desk alone');
is(rdReloadDue(NOW, NOW - 9 * H, TODAY, NOW - 20 * M, true, TODAY), false,
   'a window is open → NEVER, however old the tab is');
is(rdReloadDue(NOW, NOW - 30 * H, YESTERDAY, NOW - 5 * H, true, TODAY), false,
   '…and that holds for a tab open thirty hours — busy is busy');
is(rdReloadDue(NOW, NOW - 9 * H, TODAY, NOW - 14 * M, false, TODAY), false,
   'touched fourteen minutes ago → not yet');
is(rdReloadDue(NOW, NOW - 9 * H, TODAY, NOW - 1 * M, false, TODAY), false,
   'somebody is working → no');
is(rdReloadDue(NOW, NOW - 7 * H, TODAY, NOW - 3 * H, false, TODAY), false,
   'seven hours and idle all afternoon → still the same day, leave it');
is(rdReloadDue(NOW, NOW - 10 * M, TODAY, NOW - 20 * M, false, TODAY), false,
   'a tab opened ten minutes ago is not reloaded');

console.log('3. the page it is written into');
ok(/if\(isBusy\) return false;/.test(html), 'busy is the FIRST thing checked');
{
  const b = html.slice(html.indexOf('  function busy(){'), html.indexOf('  // Pulled out so it can be tested'));
  ok(/\.overlay\.open/.test(b), 'an open modal counts as busy');
  ok(/satModal/.test(b) && /pmModal/.test(b) && /rbkCalOv/.test(b),
     'the satisfaction, payment and rebook-calendar windows count too');
  ok(/tag==='input' \|\| tag==='textarea'/.test(b), 'so does a cursor sitting in a box');
  ok(/catch\(e\)\{ return true; \}/.test(b), 'and if it cannot tell, it says busy — never reload on a guess');
}
{
  // scoped to the watchdog — the app reloads itself elsewhere for other reasons
  const w = html.slice(html.indexOf('window.rdReloadDue = rdReloadDue;'));
  ok(/location\.reload\(\);/.test(w), 'it does actually reload');
  ok(w.indexOf('if(!rdReloadDue(') < w.indexOf('location.reload();'),
     'and only after the decision says so');
  ok(/if\(!rdReloadDue\([\s\S]*?\)\) return;/.test(w),
     'the check is a guard clause — nothing runs past it when the answer is no');
}

console.log('4. the watchdog');
ok(/window\.__rdPerf = log;/.test(html), 'the pulse is readable from the console');
ok(/window\.rdPerfReport = function\(\)/.test(html), 'and printable as a table');
ok(/entryTypes: \['longtask'\]/.test(html), 'it counts the freezes the desk actually feels');
ok(/var SAMPLE_MS  = 3\*60e3;/.test(html) && /var KEEP       = 240;/.test(html),
   'every three minutes, twelve hours kept');
ok(/while\(log\.length > KEEP\) log\.shift\(\);/.test(html),
   'the log is capped — a watchdog must not become the leak it is hunting');
{
  const t = html.slice(html.indexOf('window.setInterval=function()'), html.indexOf('window.__rdTimerCount'));
  ok(/return _si\.apply\(window, arguments\);/.test(t),
     'the timer counter is pure pass-through — it changes no behaviour');
  ok(html.indexOf('window.__rdTimerCount') < html.indexOf('firebase-app-compat.js'),
     '…and runs before everything else, or it would count nothing');
}
ok(/\[\s*'mousedown','keydown','touchstart','wheel'\s*\]/.test(html.replace(/\n/g,'')),
   'four kinds of touch keep the tab alive');

console.log('5. the pulse, on the screen');
// rdPerfReport() in the console was no use: asked to run it at reception, the
// desk typed it into Edge's search bar and got a page about Red Dead
// Redemption. The machine that is slow is never the one with developer tools
// open. One button, a table, photograph it.
ok(/window\.rdHealthPanel = function\(\)\{/.test(html), 'there is a button, not a console incantation');
ok(/id="rd-health-box"/.test(html) && /onclick="rdHealthPanel\(\)"/.test(html),
   'and it is wired into Ayarlar where anyone can reach it');
{
  const h = html.slice(html.indexOf('window.rdHealthPanel = function(){'), html.indexOf('/* Is somebody in the middle of something?'));
  ok(/if\(!log\.length\)/.test(h), 'a tab too new to have a pulse says so instead of showing nothing');
  ok(/log\.slice\(-24\)/.test(h), 'it shows the last couple of hours, not twelve hours of rows');
  ok(/parça/.test(h) && /bellek/.test(h) && /donma/.test(h),
     'elements, memory and freezes — in Turkish, for the desk');
  ok(/_rdRedrawStats/.test(h), 'and what the redraw scheduler saved');
}

console.log('6. which redraw — by name');
/* 7 Kasım 2026. Reception's own figures: nine minutes open, 368 freezes,
   283.7 SECONDS of blocked main thread — about half of every three minutes
   unable to answer a click. The watchdog could say THAT it froze and not
   what froze it, and I have guessed wrong enough times this week. */
ok(/window\.__rdFnStats = _rdFn;/.test(html), 'every heavy redraw is timed by name');
{
  const w = html.slice(html.indexOf("var _rdFn = {};"), html.indexOf('var ltN = 0, ltMs = 0;'));
  ok(/'renderDash','renderAppts'/.test(w), 'the heavy ones are in the list');
  ok(/try\{ return f\.apply\(this, arguments\); \}/.test(w),
     'the wrapper calls the real function and returns what it returned — measurement only');
  ok(/finally\{/.test(w), '…and counts the milliseconds even when it throws');
  ok(/if\(typeof f !== 'function' \|\| f\.__rdTimed\) return;/.test(w),
     'nothing is wrapped twice');
  ok(/\}, 6000\);/.test(w), 'it waits until the page has finished defining them');
}
ok(/En çok zaman yiyen çizimler/.test(html), 'and the health panel names the worst offenders');

console.log('7. the last redraws that bypassed the scheduler');
{
  const c = html.slice(html.indexOf("_fbDb.ref('timers/sessions')"), html.indexOf("_fbDb.ref('timers/ops')"));
  ok(/rdSyncRender\('renderDash', renderDash\)/.test(c),
     'the Crown Board listener no longer calls the heaviest render straight off a cloud event');
  ok(/else\{/.test(c), '…with the direct call kept as a fallback if the scheduler is not there yet');
}

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ all ') + pass + ' passed');
process.exit(fail ? 1 : 0);
