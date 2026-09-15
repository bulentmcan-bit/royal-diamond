// ═══════════════════════════════════════════════════════════════════════════
// ⭐ GOOGLE YORUM İSTEKLERİ — only a SATISFIED customer is asked. Bülent's
// decision, 15 Eylül 2026: a review request invites a public star rating,
// and sent to a customer who was not satisfied it invites a 1-star onto a
// profile just claimed and verified. The desk's 😊 Memnun at checkout
// (satPick → a.sat = 'happy') is the ticket; 'unhappy', 'not_asked' and a
// missing sat (records from before the checkout gate) are all out.
// rvTodayList() and rvClientAsked() are cut out of index.html and run on a
// fixture with a frozen clock. It proves:
//   1. completed, in the last 3 days, sat 'happy', a client with a phone → APPEARS
//   2. the same with sat 'unhappy' → not
//   3. the same with sat 'not_asked' → not (if the desk did not ask, we do
//      not ask for a review either — that is the incentive to ask)
//   4. the same with sat missing → not (nobody is chased retroactively)
//   5. a client already carrying reviewAskedTs → still not
//   6. a completed appointment older than 3 days → still not
//   7. the two empty-state strings say why a short list is right
//   8. a client the worker's automatic ask reached (rdns_review_v1/sent,
//      mirrored into _rvSent) inside cooldownDays → not; outside it → yes
//
// Run:  node tests/review-list.test.js
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
const fn = name => { const at = html.indexOf('function ' + name + '('); if (at < 0) throw new Error(name + ' not found'); return html.slice(at, html.indexOf('\n}', at) + 2); };
const src = fn('rvCooldownDays') + '\n' + fn('rvAutoAsked') + '\n' + fn('rvClientAsked') + '\n' + fn('rvTodayList');

// The clock is frozen at Tuesday 15 Eylül 2026, 14:00, so "the last 3 days"
// is the 13th, 14th and 15th whatever day this test is run on.
const FROZEN = new Date(2026, 8, 15, 14, 0).getTime();
class FrozenDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FROZEN); } static now() { return FROZEN; } }

// One list for one diary: the fixture is built per case so each case stands alone.
function listFor(appointments, clients, rvSent) {
  const ctx = { appointments, clients, Date: FrozenDate, String, Number, console, _rvSent: rvSent || {}, window: { CROWN: { reviewAsk: { cooldownDays: 180 } } } };
  ctx.CROWN = ctx.window.CROWN;
  vm.createContext(ctx);
  return vm.runInContext(src + '\nrvTodayList()', ctx).map(it => it.client.name);
}
const client = (over) => Object.assign({ id: 1, name: 'AYŞE KAYA', phone: '0533 123 4567' }, over || {});
const appt = (over) => Object.assign({ id: 101, clientId: 1, datetime: '2026-09-15T11:00', status: 'completed', service: 'Dolgu (Infill)', sat: 'happy', satAt: FROZEN - 3600e3 }, over || {});

console.log('1. the satisfied customer appears');
{
  is(listFor([appt()], [client()]), ['AYŞE KAYA'], 'completed today, sat happy, a client with a phone → on the list');
  is(listFor([appt({ datetime: '2026-09-13T11:00' })], [client()]), ['AYŞE KAYA'], 'completed 2 days ago (the 13th) → still on it: missed days can still be sent');
  is(listFor([appt(), appt({ id: 102, datetime: '2026-09-14T11:00' })], [client()]), ['AYŞE KAYA'], 'two happy visits in the window → listed once');
}

console.log('2. the rest do not');
{
  is(listFor([appt({ sat: 'unhappy' })], [client()]), [], "sat 'unhappy' → NOT on the list: a 1-star is never invited");
  is(listFor([appt({ sat: 'not_asked' })], [client()]), [], "sat 'not_asked' → NOT on the list: the desk did not ask, so neither do we");
  is(listFor([appt({ sat: undefined })], [client()]), [], 'sat missing (a record from before the checkout gate) → NOT on the list: nobody is chased retroactively');
  is(listFor([(() => { const a = appt(); delete a.sat; return a; })()], [client()]), [], '…and with no sat field at all');
  is(listFor([appt({ sat: '' })], [client()]), [], "…and with sat ''");
  is(listFor([appt({ sat: 'HAPPY' })], [client()]), [], "…'HAPPY' is not 'happy' — the exact value satPick writes, nothing looser");
  is(listFor([appt()], [client({ reviewAskedTs: FROZEN - 86400e3 })]), [], 'a client already carrying reviewAskedTs → still not: asked once, asked never again');
  is(listFor([appt({ datetime: '2026-09-12T11:00' })], [client()]), [], 'completed 3 days ago (the 12th) → still not: the window is today and the two days before');
  is(listFor([appt({ status: 'confirmed' })], [client()]), [], 'not completed → not');
  is(listFor([appt()], [client({ phone: '' })]), [], 'no phone → not');
  is(listFor([appt({ clientId: 99 })], [client()]), [], 'no client record → not');
  is(listFor([appt({ sat: 'unhappy' }), appt({ id: 102, datetime: '2026-09-14T11:00' })], [client()]), ['AYŞE KAYA'], 'an unhappy visit yesterday and a happy one today → the happy one lists her (the check is per appointment)');
}

console.log('3. the code and the words');
{
  is(fn('rvTodayList').includes("if(a.sat !== 'happy') return;"), true, "the gate is exactly a.sat !== 'happy', before the client lookup");
  const gateAt = fn('rvTodayList').indexOf("if(a.sat !== 'happy') return;"), lookupAt = fn('rvTodayList').indexOf('var c = clients.find(');
  is(gateAt > 0 && gateAt < lookupAt, true, '…and it sits before the client lookup');
  const msg = 'Gönderilecek yorum isteği yok — son 3 günde çıkışta 😊 Memnun işaretlenen her yeni müşteri burada belirir. ⭐';
  is(html.includes('<div id="dash-rv-list"><div class="r24-empty">' + msg + '</div></div>'), true, 'the dashboard placeholder says why a short list is right');
  is(fn('renderReviewCard').includes("'<div class=\"r24-empty\">" + msg + "</div>'"), true, 'and so does renderReviewCard\'s empty branch');
  is(html.includes('son 3 günde tamamlanan her yeni müşteri burada belirir'), false, 'the old "every completed customer" wording is gone');
  is(html.includes('Bugün gönderilecek yorum isteği yok.'), false, '…and so is the old placeholder');
  // The satisfaction gate itself is untouched: satPick still writes the three values and rdCheckoutDone still needs one.
  is(fn('satPick').includes('a.sat=val; a.satAt=new Date().toISOString();'), true, 'satPick still writes a.sat and a.satAt exactly as before — the checkout gate is untouched by this commit');
}

console.log('4. the automatic ask counts as asked');
{
  const D = 86400e3;
  is(listFor([appt()], [client()], { '1': FROZEN - 2 * D }), [], 'the worker asked her (by client id) 2 days ago → NOT on the list');
  is(listFor([appt()], [client()], { 'p5331234567': FROZEN - 100 * D }), [], '…asked by her PHONE (last ten digits) 100 days ago → still not: the cooldown is 180 days');
  is(listFor([appt()], [client()], { '1': FROZEN - 181 * D }), ['AYŞE KAYA'], '…asked 181 days ago → on the list again: the cooldown has passed');
  is(listFor([appt()], [client()], { '2': FROZEN - 2 * D, 'p5339999999': FROZEN - 2 * D }), ['AYŞE KAYA'], 'someone ELSE asked 2 days ago → she is on the list');
  is(fn('rvClientAsked').includes("if(typeof rvAutoAsked==='function' && rvAutoAsked(c)) return true;"), true, 'rvClientAsked defers to rvAutoAsked, guarded so a page without the mirror still works');
  is(html.includes("_fbDb.ref('rdns_review_v1/sent').orderByChild('ts').startAt(Date.now()-rvCooldownDays()*86400e3).on('value'"), true, 'the page mirrors rdns_review_v1/sent inside the cooldown, read-only');
  const rvBlock = html.slice(html.indexOf('var _rvSent = {};'), html.indexOf('</script>', html.indexOf('var _rvSent = {};')));
  is(/\.ref\([^\n]*\.(set|update|push|remove)\(/.test(rvBlock), false, '…and never writes there (no ref(…).set/update/push/remove in the block)');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
