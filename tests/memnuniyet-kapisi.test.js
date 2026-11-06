// ═══════════════════════════════════════════════════════════════════════════
// THE SATISFACTION GATE (4 Kasım 2026).
//
// Lissa lost ₺2.124 of commission in October on nine jobs she had started on
// time, crowned, and finished inside the hour. The register called every one
// of them "memnuniyet sorulmadı" — but nobody at the desk had refused to
// answer. The question never appeared.
//
// Two holes did it:
//   1. ✓ Çıkışı Tamamla only asked when a price was being written for the
//      FIRST time. A free job, a ₺0 job, or one whose money had already
//      reached the till completed in silence with no a.sat.
//   2. The ✏ Fiyat / Edit save path skipped the question when the price box
//      still held the system's own untouched guess (the 15 Ekim rule) — but
//      went on completing the appointment and sending its money to the till
//      anyway. An Edit opened just to move an hour quietly checked the
//      customer out.
//
// Both are closed here: the question is the checkout. No answer, no
// completion — and a number nobody typed completes nothing.
//
// Run:  node tests/memnuniyet-kapisi.test.js
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
function ok(cond, label) { is(!!cond, true, label); }

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ── the real satAsk / satPick, sliced out and run ──────────────────────────
const from = html.indexOf('let _satCtx=null;');
const to   = html.indexOf('/* ⭐ The review request');
if (from < 0 || to < 0 || to <= from) { console.error('could not slice satAsk/satPick'); process.exit(1); }
const src = html.slice(from, to);

let reviewCalls, modalShown;
function freshCtx(appts) {
  reviewCalls = [];
  modalShown = false;
  const el = { style: { display: 'none', cssText: '' }, innerHTML: '', textContent: '', id: '' };
  const nodes = {};
  const ctx = {
    console,
    appointments: appts,
    // the real apptById reads the LIVE array, so the stub must too
    apptById: (id) => (ctx.appointments || []).find(a => String(a.id) === String(id)) || null,
    cObj: () => ({ name: 'Müşteri' }),
    rdReviewNow: (a) => reviewCalls.push(a && a.id),
    document: {
      getElementById: (id) => nodes[id] || null,
      createElement: () => {
        const m = Object.assign({}, el, { style: {}, });
        Object.defineProperty(m.style, 'display', {
          set(v) { if (v === 'flex') modalShown = true; }, get() { return ''; }, configurable: true
        });
        nodes.satModal = m; nodes.satSub = { textContent: '' };
        return m;
      },
      body: { appendChild: () => {} }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.api={satAsk,satPick};', ctx);
  return ctx;
}

console.log('1. the question itself');

{
  const a = { id: 1, clientId: 9, service: 'Dolgu', price: 1700 };
  const ctx = freshCtx([a]);
  let ran = false;
  ctx.api.satAsk(a, () => { ran = true; });
  is(ran, false, 'no answer yet → the parked checkout does NOT run');
  ok(modalShown, 'the question is on screen');
  ctx.api.satPick('happy');
  is(a.sat, 'happy', '😊 Memnun lands on the record');
  ok(a.satAt, 'and is time-stamped');
  is(reviewCalls, [1], 'the Google review request goes on the spot');
  is(ran, true, 'and the checkout finishes');
}

{
  const a = { id: 2, clientId: 9 };
  const ctx = freshCtx([a]);
  let ran = false;
  ctx.api.satAsk(a, () => { ran = true; });
  ctx.api.satPick('unhappy');
  is(a.sat, 'unhappy', '😕 Memnun değil lands on the record');
  is(reviewCalls, [], 'an unhappy customer is NEVER asked for a review');
  is(ran, true, 'the checkout still finishes');
}

{
  const a = { id: 3, clientId: 9 };
  const ctx = freshCtx([a]);
  let ran = false;
  ctx.api.satAsk(a, () => { ran = true; });
  ctx.api.satPick('not_asked');
  is(a.sat, 'not_asked', 'Sormadım is recorded as a real answer, not a blank');
  is(reviewCalls, [], 'and asks for no review');
  is(ran, true, 'the checkout still finishes');
}

{
  const a = { id: 4, clientId: 9, sat: 'happy' };
  const ctx = freshCtx([a]);
  let ran = false;
  ctx.api.satAsk(a, () => { ran = true; });
  is(ran, true, 'already answered → straight through, no second question');
  is(modalShown, false, 'and no modal (this is what stops the re-run looping)');
}

{
  // A cloud snapshot can swap the appointments array while the question is
  // open. satPick must re-find the live record, not write to a ghost.
  const a = { id: 5, clientId: 9 };
  const ctx = freshCtx([a]);
  ctx.api.satAsk(a, () => {});
  const live = { id: 5, clientId: 9 };
  ctx.appointments = [live];
  ctx.api.satPick('happy');
  is(live.sat, 'happy', 'the answer lands on the LIVE record after a sync swap');
}

console.log('2. no way round the question');
ok(!/satModal[\s\S]{0,2000}?addEventListener\(\s*['"]click/.test(src), 'no backdrop-click escape');
ok(!/Escape|keydown/.test(src), 'no Escape key escape');
ok(!/satPick\(['"]\w+['"]\)/.test(src.split('_satCtx={')[0]), 'nothing answers it for you');

console.log('3. ✓ Çıkışı Tamamla asks EVERY time');
const ck = html.slice(html.indexOf('function rdCheckoutDone()'), html.indexOf('function rdCheckoutDone()') + 2500);
ok(/if\(!appt\.sat\)\{\s*\n\s*satAsk\(appt, function\(\)\{ rdCheckoutDone\(\); \}\);/.test(ck),
   'the gate is now a bare !appt.sat — no price, no till conditions');
ok(!/price>0 && appt\.staff && !appt\._takingsAmount && !appt\.sat/.test(html),
   'the old four-part gate is gone (a ₺0 job was finishing in silence)');
ok(ck.indexOf('if(!appt.sat)') < ck.indexOf('rdFinalizeCompletion'),
   'the question comes BEFORE the completion, not after');

console.log('4. the Edit / ✏ Fiyat path — the desk’s real checkout');
/* ⚠ BROKEN FOR TWO DAYS by my own changes of 4 Kasım; found and undone on
   the 6th. Bülent: "I want to put the price in at the end, because normally
   the technicians talk them into doing something extra." The price is
   entered AT checkout — and on a day with no extras, the number the desk
   confirms is exactly the service's own figure. My test compared the VALUE
   to the system's guess, so a price the desk had looked at and accepted was
   indistinguishable from one nobody had touched, and the save did nothing at
   all: no completion, no money, no message, no error. On a quiet day that is
   every checkout in the salon.
   A price and a technician on an unfinished appointment is a checkout. The
   "Edit opened only to move an hour" annoyance returns with this, and it is
   by far the lesser evil; the proper cure is taking the money in the
   checkout panel, where the intention is never in doubt. */
ok(/const _isCheckout = enteredPrice>0 && !!_staffPick;/.test(html),
   'a price and a technician IS a checkout, wherever the number came from');
ok(!/_isCheckout = enteredPrice>0 && !!_staffPick && !_priceIsSystemGuess/.test(html),
   'the guess test no longer blocks it');
ok(!/const _priceUntouched/.test(html),
   'and nothing lumps the service guess in with the record figure any more');
ok(/if\(enteredPrice > 0 && live\.staff\)\{/.test(html),
   'the completion runs on the same plain test, so the two cannot disagree');
ok(/const _willComplete  = _isCheckout && live\.status!=='completed';/.test(html),
   'a save that completes the appointment asks Memnun…');
ok(/const _willTakeMoney = _isCheckout && !_moneyAlready;/.test(html),
   '…and so does one that moves its money for the first time');
ok(/if\(\(_willComplete \|\| _willTakeMoney\) && !live\.sat\)\{/.test(html),
   'either one asks — six jobs completed unasked through that gap on 6 Kasım');
ok(html.indexOf('const _isCheckout =') < html.indexOf('if(enteredPrice > 0 && live.staff){'),
   '_isCheckout is in scope where the completion reads it');

console.log('5. the ✓ Çıkışı Tamamla panel');
ok(/if\(!appt\.sat\)\{/.test(html), 'it asks on every checkout, with no price condition');
ok(/satAsk\(appt, function\(\)\{ rdCheckoutDone\(\); \}\);/.test(html),
   'and parks the checkout until the answer comes');
ok(!/price>0 && appt\.staff && !appt\._takingsAmount && !appt\.sat/.test(html),
   'the old four-part gate is gone — a ₺0 job was finishing in silence');

console.log('7. the rule that punished her is unchanged');
ok(/if\(COMM_STRICT && \(a\.sat==='not_asked' \|\| !a\.sat\) && day >= COMM_NOEVIDENCE_FROM\) return 'notasked';/.test(html),
   "commVerdict still cancels commission when there is no answer …");
const cv = html.slice(html.indexOf('function commVerdict(a)'), html.indexOf("return 'notasked';"));
ok(cv.indexOf("return 'nostart'") < cv.indexOf("COMM_STRICT"),
   '… but only AFTER the Crown Board checks — so "notasked" really does mean she did the rest right');

console.log('\n' + (fail ? '✗ ' + fail + ' failed, ' : '✓ ') + pass + ' passed');
process.exit(fail ? 1 : 0);
