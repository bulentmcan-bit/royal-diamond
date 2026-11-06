// ═══════════════════════════════════════════════════════════════════════════
// HALEY — the seventh column (6 Kasım 2026).
//
// Manikür and pedikür, alongside Emma. Salaried: $1.000 a month, and NO
// commission until further notice — so her rate is an explicit zero rather
// than a missing name, and she is nowhere near DED_RATES, the Crown Board's
// 12% scheme. She starts today, so no column appears on any earlier day and
// last month's diary and Kasa Kontrol are untouched.
//
// Run:  node tests/haley.test.js
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

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cfgSrc = fs.readFileSync(path.join(root, 'crown-config.js'), 'utf8');
const cfg = { window: {}, console };
vm.createContext(cfg);
vm.runInContext(cfgSrc + '\nthis.CROWN=CROWN;', cfg);
const C = cfg.CROWN;

console.log('1. her column');
ok(C.knownStaff('Haley'), 'the roster knows her, so a booking in her name saves');
is(C.canonicalStaff('haley'), 'Haley', 'and spells her properly whatever case is typed');
is(C.operators.map(o => o.key).indexOf('haley'), C.operators.map(o => o.key).indexOf('emma') + 1,
   'her column sits straight after Emma, with the nail technicians');
ok(C.rosterOn('2026-11-06').some(o => o.name === 'Haley'), 'she is on the roster from today');
is(C.rosterOn('2026-11-05').some(o => o.name === 'Haley'), false,
   'and on no day before it — yesterday’s diary grows no new column');
is(C.rosterOn('2026-10-15').some(o => o.name === 'Haley'), false,
   'nor last month’s, nor its Kasa Kontrol');

console.log('2. what she does');
ok(C.staffPrefs.serviceSkill.manikur.indexOf('haley') >= 0, 'manikür');
ok(C.staffPrefs.serviceSkill.pedikur.indexOf('haley') >= 0, 'pedikür');
ok(C.staffPrefs.fillOrder.indexOf('haley') >= 0, 'and a gap gets offered to her');

console.log('3. her money');
is(/const TECH_COMM_RATES = \{[^}]*Haley:0\}/.test(html), true,
   'commission rate is an explicit zero — not a missing name somebody later reads as a default');
ok(!/const DED_RATES = \{[^}]*Haley/.test(html),
   'she is NOT in the Crown Board’s 12% scheme, so no job of hers is ever marked KOMİSYON YOK');
ok(/\{name:'Haley',   role:'Nail Technician',    color:'#e8b4c8', salary:1000, cur:'USD'/.test(html),
   'payroll shows $1.000 a month');
ok(/commLabel:'Salary only — no commission until further notice', comm:0\}/.test(html),
   '…and says plainly that there is no commission yet');
{
  const rateLines = html.split('\n').filter(l => /Beyhan:0\.80/.test(l) && /Emma:0\.40/.test(l));
  is(rateLines.length, 4, 'there are four copies of the rate table in the file');
  is(rateLines.filter(l => /Haley:0/.test(l)).length, 4, '…and Haley is in every one of them');
}

console.log('4. her till card');
ok(/\{id:8,name:'Haley',entries:\[\],active:true\}/.test(html), 'Daily Takings has a card for her');
ok(/if\(!d\.operators\.find\(function\(x\)\{return x\.name==='Haley';\}\)\) d\.operators\.push/.test(html),
   '…and a machine that already holds a takings record grows one too');
{
  const seed = html.indexOf("{id:8,name:'Haley'");
  const emma = html.indexOf("{id:7,name:'Emma'");
  ok(emma > 0 && seed > emma, 'she sits after Emma on the takings page as well');
}

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ all ') + pass + ' passed');
process.exit(fail ? 1 : 0);
