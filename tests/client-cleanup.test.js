// ═══════════════════════════════════════════════════════════════════════════
// 🧹 LİSTE TEMİZLİĞİ — rdCleanupPlan on a fixture. It proves:
//   1. same number + compatible name is one customer, ticked, and the record
//      kept is the one with the number and the most bookings
//   2. same name with one number between them (others blank) is merged
//   3. same number, different names (a family phone) is shown UNticked
//   4. same name, two different numbers is two people — never grouped
//   5. no number + no bookings is ticked; no number + bookings is not;
//      a copy that will be merged away is not listed as numberless
//   6. the merge moves bookings onto the kept record and tombstones the rest
//
// Run:  node tests/client-cleanup.test.js
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
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cut = (from, to) => { const a = html.indexOf(from); const b = html.indexOf(to, a); if (a < 0 || b < 0) throw new Error('not found: ' + from); return html.slice(a, b); };
const norm = cut('const rdNorm = s =>', '\n\n');
const issue = cut('function _phoneIssue(p){', 'function phoneCleanupToggle(){');
const plan = cut('function _rdCleanPhoneKey(p){', 'let _rdCleanPlan=null;');
const merge = cut('function rdCleanMergeGroup(g){', 'function rdCleanMergeRun(){');

const tombs = [];
const ctx = { console, tombs };
vm.createContext(ctx);
vm.runInContext(norm + '\n' + issue + '\n' + plan + '\n' + merge +
  '\nvar clients=[],appointments=[],payments=[];' +
  '\nfunction rbItems(){return [];} function rbUpsert(){}' +
  '\nfunction clientTombAddMany(ids){ ids.forEach(i=>tombs.push(i)); }' +
  '\nthis.setData=(c,a,p)=>{clients=c;appointments=a;payments=p;};' +
  '\nthis.getData=()=>({clients,appointments,payments});', ctx);
const F = ctx;

const clients = [
  { id: 1, name: 'AYŞE KAYA', phone: '05331234567', visits: 5 },
  { id: 2, name: 'Ayse', phone: '+90 533 123 45 67', visits: 1 },
  { id: 3, name: 'Zeynep Arslan', phone: '', visits: 0 },
  { id: 4, name: 'ZEYNEP ARSLAN', phone: '0533 555 6666', visits: 2 },
  { id: 5, name: 'Elif Demir', phone: '0533 111 2222' },
  { id: 6, name: 'ELİF DEMİR', phone: '0542 333 4444' },
  { id: 7, name: 'Gül Yılmaz', phone: '0533 777 8888' },
  { id: 8, name: 'Merve Yılmaz', phone: '0533 777 8888' },
  { id: 9, name: 'Boş Kayıt', phone: '' },
  { id: 10, name: 'Randevulu Numarasız', phone: '—' },
  { id: 11, name: 'Hatalı', phone: '123' },
];
const appointments = [
  { id: 101, clientId: 2, datetime: '2026-09-01T10:00' },
  { id: 102, clientId: 2, datetime: '2026-09-10T10:00' },
  { id: 103, clientId: 3, datetime: '2026-09-02T10:00' },
  { id: 104, clientId: 10, datetime: '2026-09-03T10:00' },
];
const P = F.rdCleanupPlan(clients, appointments);
const g = id => P.dups.find(d => [d.keep, ...d.drop].some(c => c.id === id));

console.log('çift kayıtlar');
is([g(1).keep.id, g(1).drop.map(c => c.id), g(1).auto, g(1).name], [2, [1], true, 'AYŞE KAYA'], 'Ayşe: same number, keeps the one with bookings, ticked');
is([g(4).keep.id, g(4).drop.map(c => c.id), g(4).auto], [4, [3], true], 'Zeynep: blank copy folds into the one with a number');
is(g(5), undefined, 'Elif Demir with two numbers is two people');
is([g(7) && g(7).auto, g(7) && g(7).why], [false, 'aynı numara, farklı isim — aile olabilir'], 'family phone shown unticked');
is(P.dups.length, 3, 'three groups in all');

console.log('numarasız');
const np = id => P.nophone.find(x => x.c.id === id);
is([np(9).auto, np(9).appts], [true, 0], 'no number, no bookings: ticked');
is([np(10).auto, np(10).appts], [false, 1], 'no number with a booking: not ticked');
is([np(11).issue, np(11).auto], ['hatali', false], 'bad number listed, not ticked');
is(np(3), undefined, 'a copy being merged away is not listed again');

console.log('birleştirme');
const cs = JSON.parse(JSON.stringify(clients)), as = JSON.parse(JSON.stringify(appointments));
const ps = [{ id: 1, clientId: 3, amount: 100 }];
F.setData(cs, as, ps);
const P2 = F.rdCleanupPlan(cs, as);
P2.dups.filter(d => d.auto).forEach(F.rdCleanMergeGroup);
const D = F.getData();
is(D.clients.map(c => c.id).sort((a, b) => a - b), [2, 4, 5, 6, 7, 8, 9, 10, 11], 'copies removed, everyone else kept');
is(D.appointments.find(a => a.id === 103).clientId, 4, 'Zeynep\'s booking moved to the kept record');
is(D.payments[0].clientId, 4, 'payment moved too');
is(D.clients.find(c => c.id === 2).name, 'AYŞE KAYA', 'fuller name kept');
is(D.clients.find(c => c.id === 2).visits, 6, 'visits added up');
is(F.tombs.slice().sort(), [1, 3].map(String), 'tombstones written for the removed copies');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
