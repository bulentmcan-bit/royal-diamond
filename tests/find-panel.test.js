// ═══════════════════════════════════════════════════════════════════════════
// 🔍 MÜŞTERİ BUL — the call panel in index.html, the answer to "I have an
// appointment but I don't know when". The row-building functions are pure
// and run here on a fixture; the screen is pinned by text. It proves:
//   1. ONE search: the panel matches with rdClientMatcher, the Müşteriler
//      list's own matcher — a Turkish name is found by its unaccented
//      spelling, a customer by the last four digits of her number
//   2. the rows: the NEXT appointment first and the right one when she has
//      three (a cancelled one never), "Yaklaşan randevusu yok" when none,
//      a deferred payment surfaced (by clientId, by phone, by a unique
//      name — never by a name two customers share), last visit and count
//   3. two customers sharing a name are BOTH listed, never one guessed at;
//      never more than 8 rows and the rest counted; an empty box shows
//      nothing; one match alone is the signal to jump to the card
//   4. the screen: "/" and the 🔍 button open it, Esc closes it, the card
//      hands over to dashEditAppt / cancelAppt / quickBook /
//      showClientDetail, and the panel itself never saves anything
//
// Run:  node tests/find-panel.test.js
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

// The panel's script block, without the key handler at its foot, plus the
// matcher it shares with the Müşteriler list.
const blockAt = html.lastIndexOf('/*', html.indexOf('🔍 MÜŞTERİ BUL — the call panel.'));
const blockEnd = html.indexOf('</script>', blockAt);
const block = html.slice(blockAt, blockEnd);
const scriptSrc = block.slice(0, block.indexOf("document.addEventListener('keydown'"));
const norm = html.slice(html.indexOf('const rdNorm = s =>'), html.indexOf('.toLowerCase().trim();', html.indexOf('const rdNorm = s =>')) + '.toLowerCase().trim();'.length);
const matcherAt = html.indexOf('function rdClientMatcher(q){');
const matcher = html.slice(matcherAt, html.indexOf('\n}', html.indexOf('function rdFindEmpty', matcherAt)) + 2);
const ctx = { window: {}, console, document: { addEventListener() {} } };
vm.createContext(ctx);
vm.runInContext(norm + '\n' + matcher + '\n' + scriptSrc, ctx);
const F = ctx;

// ── the fixture: Tuesday 15 Eylül 2026, 10:00 at the desk ──────────────────
const NOW = '2026-09-15T10:00';
const clients = [
  { id: 1, name: 'AYŞE KAYA', phone: '+905331234567', visits: 14, lastVisit: '2026-09-02' },
  { id: 2, name: 'ŞEYMA ÖZTÜRK', phone: '0533 987 6543', visits: 3 },
  { id: 3, name: 'Elif Demir', phone: '0533 111 2222', visits: 2 },
  { id: 4, name: 'ELİF DEMİR', phone: '0542 333 4444', visits: 1 },
  { id: 5, name: 'Zeynep Arslan', phone: '0533 555 6666', visits: 6, lastVisit: '2026-08-20' },
  { id: 6, name: 'Gül Yılmaz', phone: '0533 777 4567', visits: 0 },
];
const A = (id, cid, dt, staff, svc, status) => ({ id, clientId: cid, datetime: dt, staff, service: svc, status: status || 'confirmed' });
const appointments = [
  A(101, 1, '2026-09-02T11:00', 'Helen', 'Dolgu (Infill)', 'completed'),
  A(102, 1, '2026-08-05T11:00', 'Helen', 'Dolgu (Infill)', 'completed'),
  A(103, 1, '2026-07-08T11:00', 'Lissa', 'Klasik Pedikür', 'completed'),
  A(104, 1, '2026-09-17T14:00', 'Helen', 'Dolgu (Infill)'),           // next but one
  A(105, 1, '2026-09-16T09:00', 'Lissa', 'Klasik Pedikür'),           // NEXT
  A(106, 1, '2026-09-25T10:00', 'Helen', 'Dolgu (Infill)'),           // third
  A(107, 1, '2026-09-15T09:00', 'Helen', 'x', 'completed'),           // earlier today, done
  Object.assign(A(108, 1, '2026-09-16T15:00', 'Hannah', 'Kirpik Dolgu'), { status: 'cancelled' }),   // cancelled: not ahead
  A(201, 2, '2026-09-01T10:00', 'Hannah', 'Klasik Manikür', 'completed'),
  A(202, 2, '2026-09-15T13:00', 'Hannah', 'Klasik Manikür'),          // later TODAY: upcoming
  A(301, 3, '2026-09-20T10:00', 'Helen', 'Klasik Manikür'),
  A(501, 5, '2026-08-20T10:00', 'Lissa', 'Jel Pedikür', 'completed'),
  Object.assign(A(502, 5, '2026-09-10T10:00', 'Lissa', 'Jel Pedikür'), { status: 'cancelled', noShow: true }),
];
const dps = [
  { id: 'dp1', clientId: 1, name: 'AYŞE KAYA', cur: '₺', amount: 3300, due: '2026-08-01', paid: false },
  { id: 'dp2', clientId: 1, name: 'AYŞE KAYA', cur: '₺', amount: 500, due: '2026-05-01', paid: true },     // paid: gone
  { id: 'dp3', name: 'Seyma Ozturk', phone: '905339876543', cur: '$', amount: 40, due: '2026-10-05', paid: false },   // by phone
  { id: 'dp4', name: 'zeynep arslan', cur: '₺', amount: 1200, due: '2026-09-30', paid: false },                       // by unique name
  { id: 'dp5', name: 'Elif Demir', cur: '₺', amount: 900, due: '2026-09-30', paid: false },                           // two Elifs: nobody's
];
const apptsOf = id => appointments.filter(a => String(a.clientId) === String(id));
const C = { clients, apptsOf, dps, now: NOW };
const rows = q => F.rdFindRows(q, C);
const names = q => rows(q).rows.map(r => r.c.name);

console.log('1. one search — the list\'s own matcher');
{
  is(html.includes('const list=clients.filter(rdClientMatcher(q))'), true, 'renderClients (the Müşteriler list) filters with rdClientMatcher');
  is(scriptSrc.includes('.filter(rdClientMatcher(q))'), true, 'and so does the call panel — one matcher, not two');
  is(names('seyma'), ['ŞEYMA ÖZTÜRK'], 'a Turkish name found by its unaccented spelling: "seyma"');
  is(names('ozturk'), ['ŞEYMA ÖZTÜRK'], '…"ozturk"');
  is(names('ŞEYMA'), ['ŞEYMA ÖZTÜRK'], '…and by its accented one');
  is(names('ayse'), ['AYŞE KAYA'], '"ayse" finds AYŞE');
  is(names('4567'), ['AYŞE KAYA', 'Gül Yılmaz'], 'the LAST FOUR DIGITS of a number find her: "4567" — both numbers ending in them, both listed');
  is(names('1234'), ['AYŞE KAYA'], 'any run of digits works: "1234" from the middle of her number');
  is(names('987 6543'), ['ŞEYMA ÖZTÜRK'], 'digits typed with a space still match (digits only, both sides)');
  is(names('+90533123'), ['AYŞE KAYA'], 'a +90 prefix is just more digits');
}

console.log('2. the rows');
{
  const r = rows('ayse').rows[0];
  is(r.future.map(a => a.id), [105, 104, 106], 'her three bookings ahead, soonest first — the NEXT is the 16th 09:00, not the 17th she booked first');
  is(F.rdFindApptLine(r.future[0]), 'Çar 16 Eyl 09:00 · Lissa · Klasik Pedikür', 'the next appointment line: weekday, day, month, time · technician · service');
  is(F.rdFindApptLine(r.future[1]), 'Perş 17 Eyl 14:00 · Helen · Dolgu (Infill)', '…the second');
  is(r.future.some(a => a.id === 108), false, 'the cancelled 16th 15:00 is not ahead of her');
  is(r.future.some(a => a.id === 107), false, 'this morning\'s completed visit is not ahead either');
  is(F.rdFindDay(r.last), '15 Eyl', 'last visit: the most recent COMPLETED one — this morning');
  is(r.visits, 14, '14 visits — the card\'s counter, higher than the 4 the diary holds (her history predates it)');
  is(F.rdFindRow(clients[1], C).visits, 3, 'ŞEYMA: 3 on the card, 1 in the diary → 3');
  is(F.rdFindRow({ id: 9, name: 'X', visits: 0 }, { clients, apptsOf: () => [A(1, 9, '2026-08-01T10:00', 'Helen', 'x', 'completed'), A(2, 9, '2026-08-20T10:00', 'Helen', 'x', 'completed')], dps: [], now: NOW }).visits, 2, 'a stale 0 on the card, 2 in the diary → 2');
  is([r.staff, r.service], ['Helen', 'Dolgu (Infill)'], 'usually Helen, usually an infill');
  is(r.debts.map(p => p.id), ['dp1'], 'her open deferred payment, by clientId — the paid one is gone');
  is(F.rdFindDebtLine(r.debts[0]), '⚠ ₺3.300 vadeli ödeme — vade 1 Ağustos', 'said the way reception needs it before the call ends');

  const s = rows('seyma').rows[0];
  is(s.future.map(a => a.id), [202], 'ŞEYMA: her 13:00 later TODAY is upcoming — the day is not over');
  is(F.rdFindApptLine(s.future[0]), 'Sal 15 Eyl 13:00 · Hannah · Klasik Manikür', '…as a line');
  is(s.debts.map(p => p.id), ['dp3'], 'her deferred payment, linked by PHONE (no clientId on the record)');
  is(F.rdFindDebtLine(s.debts[0]), '⚠ $40 vadeli ödeme — vade 5 Ekim', 'in its own currency');

  const z = rows('zeynep').rows[0];
  is(z.future, [], 'Zeynep has nothing ahead — her no-show is not a booking');
  is(scriptSrc.split('Yaklaşan randevusu yok').length - 1, 2, 'and the screen says "Yaklaşan randevusu yok" plainly — on the row and on the card');
  is(F.rdFindDay(z.last), '20 Ağu', 'her last visit');
  is(z.debts.map(p => p.id), ['dp4'], 'her deferred payment, linked by a name exactly one customer carries');

  const g = rows('gul').rows[0];
  is([g.future, g.last, g.visits], [[], null, 0], 'a customer with no diary at all: nothing ahead, no last visit, 0 visits — no crash');
  is(F.rdFindDay(g.last), '—', '…shown as a dash');
}

console.log('3. the list rules');
{
  const e = rows('elif demir');
  is(e.total, 2, 'two customers called Elif Demir: total 2…');
  is(e.rows.map(r => r.c.phone), ['0533 111 2222', '0542 333 4444'], '…BOTH listed with their phones, nobody guessed at');
  is(e.rows.map(r => r.debts.length), [0, 0], 'the deferred payment under that shared name is linked to NEITHER — a name two customers carry is no answer');
  is(e.rows.map(r => r.future.length), [1, 0], 'and each row carries her own diary');
  is(rows('').total, 0, 'an empty box: nothing');
  is(rows('   ').total, 0, 'spaces: nothing');
  is(rows('-').total, 0, 'a stray dash: nothing — never all 700 customers');
  is(F.rdFindEmpty(''), true, 'rdFindEmpty says so');
  is(rows('ayse').total, 1, 'one match and only one — the signal the screen turns into a jump to the card');
  is(scriptSrc.includes('if(total===1){ rdFindCard(rows[0].c.id); return; }'), true, '…and it does: the list is skipped');
  const many = { clients: Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, name: 'Test Müşteri ' + (i + 1), phone: '0533 000 00' + String(i).padStart(2, '0') })), apptsOf: () => [], dps: [], now: NOW };
  const m = F.rdFindRows('test', many);
  is([m.rows.length, m.total], [8, 12], 'twelve matches: eight rows on screen, twelve counted');
  is(vm.runInContext('RD_FIND_MAX', ctx), 8, 'never more than 8');
  is(scriptSrc.includes("… ve '+(total-rows.length)+' müşteri daha — daraltmak için yazmaya devam edin ('+total+' eşleşme)"), true, 'and the screen says how many more and tells her to keep typing');
}

console.log('4. the screen');
{
  is(html.includes('<button class="lang-btn" id="tb-find" onclick="rdFindOpen()"'), true, 'the 🔍 button in the top bar');
  is(/if\(e\.key==='\/'&&!typing&&!e\.ctrlKey&&!e\.metaKey&&!e\.altKey\)\{ e\.preventDefault\(\); rdFindOpen\(\); \}/.test(block), true, '"/" opens it from anywhere…');
  is(block.includes("const typing=tag==='input'||tag==='textarea'||tag==='select'||(t&&t.isContentEditable);"), true, '…unless she is typing in a field');
  is(block.includes("if(e.key==='Escape'&&rdFindIsOpen()){ e.preventDefault(); rdFindClose(); return; }"), true, 'Esc closes it');
  is(scriptSrc.includes('q&&q.focus()'), true, 'the cursor lands in the box');
  is(html.includes('<div class="overlay" id="mFind"'), true, 'a full-screen overlay over whatever page she is on');
  is(html.includes('oninput="rdFindRender()"'), true, 'it renders as she types');
  // The card's buttons hand over to the existing paths — and in the order the call needs.
  const card = scriptSrc.slice(scriptSrc.indexOf('function rdFindCard('));
  is(card.includes("rdFindClose();dashEditAppt("), true, '✏️ Saati değiştir → dashEditAppt');
  is(card.includes("rdFindClose();cancelAppt("), true, '❌ İptal → cancelAppt (its PIN and confirmations included)');
  is(card.includes("rdFindClose();showClientDetail("), true, '👁 Tüm geçmiş → showClientDetail, not a new thing');
  is(card.includes("rdFindClose();quickBook("), true, '"Yaklaşan randevusu yok" comes with ➕ Saat ver → quickBook');
  is(card.includes("href=\"tel:"), true, '📞 Ara is a tel: link');
  is(card.indexOf('const nxt=') < card.indexOf('Son ziyaret:') && card.indexOf('Son ziyaret:') < card.indexOf('+debt') && card.indexOf('+debt') < card.indexOf('👁 Tüm geçmiş'), true, 'in this order: next appointment, last visit / usual technician and service, debt, then the buttons');
  is(/saveAll\(|syncPush\(|localStorage\.setItem|\.status\s*=[^=]|\.datetime\s*=[^=]|appointments\.push|clients\.push|dpList\(\)\.push/.test(block), false, 'the panel never writes: no saveAll, no syncPush, no status or time change, nothing pushed');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
