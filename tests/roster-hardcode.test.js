// ═══════════════════════════════════════════════════════════════════════════
// NO HARD-CODED ROSTER. crown-config.js is THE ONE PLACE TO ADD OR REMOVE A
// TECHNICIAN, and on 12 Eylül 2026 Zara never reached reception's Personel
// dropdown because popStaffSel listed the names by hand. This test reads the
// pages and FAILS THE BUILD on any array literal of strings that holds two or
// more technician names from crown-config.js operators — a hard-coded roster
// should break here, not reach reception.
//
// What is allowed, each by its exact text and each exactly once:
//   · the two "window.CROWN is absent" fallbacks (the online-booking handler's
//     and rdStaffOn's) — reached only if crown-config.js failed to load
//   · the money screens Bülent keeps by hand — avans (ADV_STAFF), the salary
//     page's commission rows and the Aylık page's commission cards. Zara's
//     pay arrangement is his to decide; nothing puts her on a money screen by
//     side effect. (DI_STAFF and the takings seed are object arrays with
//     names inside them, not lists of names, and are not matched.)
//   · the historical takings seed data (JUNE_SEED)
// Anything else is a bug. Add a name to crown-config.js, not to a page.
//
// It also pins the booking-side readers that were de-hardcoded that day:
// popStaffSel, rbFreeTimes, rdGapEmptyToday, the clash checker and the
// old-staff page all read rdStaffOn (the roster for a day) now.
//
// Run:  node tests/roster-hardcode.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function is(got, want, label) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
}
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const crown = (() => { const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(read('crown-config.js'), ctx); return ctx.window.CROWN; })();
const NAMES = crown.operators.map(o => o.name);
const KEYS = crown.operators.map(o => o.key);
const isTech = s => NAMES.includes(s) || KEYS.includes(String(s).toLowerCase());

// An array literal made only of string literals, e.g. ['Helen','Lissa'].
const STR_ARRAY = /\[\s*(?:(?:'[^'\n]*'|"[^"\n]*")\s*,\s*)*(?:'[^'\n]*'|"[^"\n]*")\s*,?\s*\]/g;

// Allowed, by exact text. Each must occur exactly once — a second copy of the
// same text is a new hard-coded list hiding behind an allowed one.
const ALLOWED = [
  { file: 'index.html', text: "const RD_OB_FALLBACK_TECHS=['Helen','Lissa'];", why: 'online-booking fallback, CROWN absent only' },
  { file: 'index.html', text: "return ['Helen','Lissa'];", why: "rdStaffOn's fallback, CROWN absent only" },
  { file: 'index.html', text: "const ADV_STAFF = ['Helen','Hannah','Lissa','Zara','Saeideh','Zebo','Nihal'];", why: 'avans money screen — Bülent\'s list' },
  { file: 'index.html', text: "['Hannah','Lissa','Zara','Saeideh'].forEach(function(n){", why: 'salary page commission rows — Bülent\'s list' },
  { file: 'index.html', text: "const commOrder=['Lissa','Hannah','Zara','Saeideh'];", why: 'Aylık page commission cards — Bülent\'s list' },
];

console.log('1. the roster this test reads');
{
  is(NAMES.length >= 2, true, 'crown-config.js names at least two technicians (' + NAMES.join(', ') + ')');
}

console.log('2. no page holds a list of technician names');
for (const file of ['index.html', 'booking.html', 'timers.html']) {
  const src = read(file);
  // The takings seed: from its opening line to the first line that is just "];".
  let seedFrom = -1, seedTo = -1;
  const seedAt = src.indexOf('const JUNE_SEED = [');
  if (seedAt >= 0) { seedFrom = seedAt; seedTo = src.indexOf('\n];', seedAt); }
  const inSeed = i => seedFrom >= 0 && i >= seedFrom && i <= seedTo;

  const offenders = [];
  let m;
  STR_ARRAY.lastIndex = 0;
  while ((m = STR_ARRAY.exec(src))) {
    const els = m[0].match(/'[^']*'|"[^"]*"/g).map(x => x.slice(1, -1));
    if (els.filter(isTech).length < 2) continue;
    if (inSeed(m.index)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    const lineText = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index)).trim();
    const allowed = ALLOWED.find(a => a.file === file && lineText.includes(a.text));
    if (allowed) continue;
    offenders.push(file + ':' + line + '  ' + m[0].slice(0, 70));
  }
  is(offenders, [], file + ': no array literal of two or more technician names (outside the allowed lines and the takings seed)');
  for (const a of ALLOWED.filter(a => a.file === file)) {
    is(src.split(a.text).length - 1, 1, 'allowed exactly once — ' + a.why + ': ' + a.text.slice(0, 50));
  }
}

console.log('3. the booking-side readers take the roster from crown-config.js');
{
  const html = read('index.html');
  const fn = name => { const at = html.indexOf('function ' + name + '('); return at < 0 ? '' : html.slice(at, html.indexOf('\n}', at)); };
  const pop = fn('popStaffSel');
  is(pop.includes('["Manager"].concat(rdStaffOn(day||new Date()))'), true, 'popStaffSel: "Manager" first, then rdStaffOn for the date in the form (today when empty)');
  is(pop.includes('(document.getElementById("a-dt")||{}).value'), true, 'popStaffSel reads the date off a-dt');
  is(pop.includes('if(prev && [...sel.options].some(o=>o.value===prev)) sel.value = prev;'), true, 'popStaffSel keeps the previous selection if she is still on the list');
  is(pop.includes("if(typeof rdApplySkillToStaffSel==='function') rdApplySkillToStaffSel();"), true, 'popStaffSel re-applies the "bu hizmeti yapmıyor" labels to the new options');
  is(html.includes('document.getElementById("a-dt").addEventListener("change", popStaffSel)'), true, 'the dropdown is rebuilt when a-dt changes');
  is(fn('rbFreeTimes').includes('const tech=rdStaffOn(ds).find('), true, 'rbFreeTimes matches the column against the roster for that day');
  is(fn('rdGapEmptyToday').includes('const TECHS=rdStaffOn(todayStr());'), true, 'rdGapEmptyToday counts the roster today');
  is(html.includes('const TECHS=()=>rdStaffOn(new Date());'), true, 'the clash checker reads the roster when asked, not at parse time');
  is(html.includes('const ACTIVE=()=>rdStaffOn(new Date());'), true, 'the old-staff page counts as active whoever is on the roster');
  const staffOn = fn('rdStaffOn');
  is(staffOn.includes('if(C&&C.rosterOn) return C.rosterOn(date)'), true, 'rdStaffOn asks rosterOn first');
  is(/function _obTechs\(dateKey\)\{[\s\S]*?if\(C&&C\.rosterOn\) return C\.rosterOn\(dateKey\)/.test(html), true, 'the online handler asks rosterOn first');
  // The one thing the whole test is for:
  is(html.includes('["Manager","Helen","Hannah","Lissa"]'), false, 'the hand-written dropdown list is gone');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
