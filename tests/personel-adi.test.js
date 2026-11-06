// ═══════════════════════════════════════════════════════════════════════════
// 🚪 PERSONEL ADI — the door, and the clean-up behind it (6 Kasım 2026).
//
// 87 appointments stood against names not in the roster. A name with no
// column is invisible on the diary but entirely real in the book: it holds
// the hour, and it can become the carrier of the customer's one WhatsApp
// message of the day. Çiğdem Yaşar Çankaya, 5 Kasım — a "Manager" booking at
// 19:22 took the reminder her real 17:00 appointment should have had.
//
// Three problems wearing one face, and only one is safe to delete:
//   Hanna   63, June, 53 completed, ₺90.100 — Hannah misspelt → RENAME
//   Manager 22, never completed, never a lira → CANCEL
//   Saeideh  2, a real person missing from the list → LEAVE ALONE
//
// Run:  node tests/personel-adi.test.js
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

// ── the real CROWN ────────────────────────────────────────────────────────
const cfg = { window: {}, console };
vm.createContext(cfg);
vm.runInContext(cfgSrc + '\nthis.CROWN=CROWN;', cfg);
const CROWN = cfg.CROWN;

console.log('1. who counts as a technician');
is(CROWN.knownStaff('Helen'), true, 'Helen is one of ours');
is(CROWN.knownStaff('Hannah'), true, 'Hannah still is, though she has left — an old booking must stay editable');
is(CROWN.knownStaff('helen'), true, 'case does not matter at a busy desk');
is(CROWN.knownStaff('Hanna'), false, 'the misspelling is NOT a technician');
is(CROWN.knownStaff('Manager'), false, '"Manager" never was');
is(CROWN.knownStaff(''), false, 'and nothing is nobody');
is(CROWN.canonicalStaff('Hanna'), 'Hannah', 'the misspelling points at the real person');
is(CROWN.canonicalStaff('HANNA'), 'Hannah', '…in any case');
is(CROWN.canonicalStaff('Manager'), '', 'nothing stands behind "Manager"');
is(CROWN.canonicalStaff('Lissa'), 'Lissa', 'a real name returns itself');
is(CROWN.isPhantomStaff('Manager'), true, '"Manager" is named as a phantom');
is(CROWN.isPhantomStaff('Saeideh'), false, 'Saeideh is NOT — she is a real person off the list');

console.log('2. the three buckets');
const buckets = (function () {
  const from = html.indexOf('function rdOffRosterBuckets(book){');
  const to = html.indexOf('function rdOffRosterScan(){');
  const ctx = { window: { CROWN }, CROWN, console, appointments: [] };
  vm.createContext(ctx);
  vm.runInContext(html.slice(from, to) + '\nthis.f=rdOffRosterBuckets;', ctx);
  return ctx.f;
})();
const A = (staff, status, price, extra) => Object.assign({ id: Math.random(), staff, status, price: price || 0 }, extra || {});
{
  const b = buckets([
    A('Helen', 'completed', 1700),                       // fine
    A('Hanna', 'completed', 1700),                       // misspelt, has money
    A('Hanna', 'confirmed', 0),                          // misspelt, stuck open
    A('Manager', 'confirmed', 0),                        // phantom
    A('Manager', 'confirmed', 0),                        // phantom
    A('Saeideh', 'completed', 3500),                     // real person, real money
    A('Saeideh', 'confirmed', 0)                         // real person, no money
  ]);
  is(b.rename.length, 2, 'both Hanna bookings are renamed — money or not');
  is(b.rename[0].to, 'Hannah', '…to Hannah');
  is(b.cancel.length, 2, 'both Manager phantoms are cancelled');
  is(b.leave.length, 2, 'and BOTH Saeideh records are left alone — she is a real person');
  is(b.rename.concat(b.cancel).some(x => (x.a || x).staff === 'Helen'), false,
     'a real technician is never touched');
}
console.log('3. it never cancels money');
{
  const b = buckets([A('Manager', 'completed', 2000)]);
  is([b.cancel.length, b.leave.length], [0, 1], 'a phantom that COMPLETED is left for a human to look at');
}
{
  const b = buckets([A('Manager', 'confirmed', 1700)]);
  is([b.cancel.length, b.leave.length], [0, 1], 'a phantom with a price on it is left alone');
}
{
  const b = buckets([A('Manager', 'confirmed', 0, { _takingsAmount: 900 })]);
  is([b.cancel.length, b.leave.length], [0, 1], '…and so is one whose money reached the till');
}
{
  const b = buckets([A('Nihal', 'confirmed', 0)]);
  is([b.cancel.length, b.leave.length], [0, 1], 'an unknown name nobody has classified is listed, never guessed at');
}
{
  const b = buckets([A('', 'confirmed', 0), A(null, 'confirmed', 0)]);
  is([b.rename.length, b.cancel.length, b.leave.length], [0, 0, 0],
     'a booking with no technician yet is not a ghost — that is normal');
}

console.log('4. the door on the save button');
{
  const d = html.slice(html.indexOf('🚪 6 Kasım 2026 — THE DOOR'), html.indexOf('// Always write to the LIVE appointment object'));
  ok(/!CROWN\.knownStaff\(_st\)/.test(d), 'an unknown name is caught before anything is written');
  ok(/CROWN\.canonicalStaff\(_st\)/.test(d), 'a misspelling is corrected rather than refused');
  ok(/Böyle bir teknisyen yok/.test(d), '…and a name with nobody behind it is refused, out loud');
  ok(/return;/.test(d.slice(d.indexOf('Böyle bir teknisyen yok'))), 'the save really does stop');
  ok(d.indexOf('if(_st &&') < d.indexOf('CROWN.knownStaff'), 'an empty staff box still saves — that is a normal booking');
}

console.log('5. a ghost can no longer take the message');
ok(/function rdWaOffRoster\(a\)\{/.test(html), 'the reminder code knows what a ghost is');
ok(/a\.status!=='cancelled' && !rdWaOffRoster\(a\) && rdWaDayOf\(a\)===dayISO/.test(html),
   'and leaves it out of the visit group entirely — it can neither carry nor swallow');
{
  const g = html.slice(html.indexOf('function rdWaOffRoster(a){'), html.indexOf('// The visit `of` belongs to'));
  ok(/if\(!s\) return false;/.test(g), 'a booking with no technician is still reminded');
  ok(/catch\(e\)\{ return false; \}/.test(g), 'and if it cannot tell, the customer still gets her message');
}

console.log('6. the clean-up is answerable for itself');
ok(/x\.a\.rdStaffWas=x\.from;/.test(html), 'a renamed booking remembers what it said before');
ok(/a\.rdStaffWas=String\(a\.staff\|\|''\);/.test(html), '…and so does a cancelled ghost');
ok(/a\.rdGhostCleared=now;/.test(html), 'with the moment it was cleared');
ok(/if\(typeof ownerPin==='function' && !ownerPin\(\)\) return;/.test(html), 'it asks for the owner’s password');
{
  const fx = html.slice(html.indexOf('function rdFixOffRoster(){'), html.indexOf('// ── 🔑 RESEPSİYON ŞİFRESİ'));
  ok(fx.indexOf("if(!confirm('Personel adı temizliği") < fx.indexOf("ownerPin()"),
     '…after showing the counts, so nobody types a password blind');
  ok(fx.indexOf('ownerPin()') < fx.indexOf('x.a.staff=x.to;'),
     'and before a single record is changed');
}
ok(/cancelLogAdd\(a,'otomatik · personel listesinde olmayan isim'\)/.test(html),
   'every cancellation goes in the cancellation log');
ok(/id="rd-offroster-report"/.test(html) && /onclick="rdOffRosterScan\(\)"/.test(html),
   'and you can look before you touch anything');

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ all ') + pass + ' passed');
process.exit(fail ? 1 : 0);
