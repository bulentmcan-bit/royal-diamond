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

console.log('4. the Edit / ✏ Fiyat path');
ok(/const _isCheckout = enteredPrice>0 && !!_staffPick && !_priceUntouched;/.test(html),
   'one definition of what a checkout is');
ok(/if\(_isCheckout && !_moneyAlready && !live\.sat\)\{\s*\n\s*satAsk\(live/.test(html),
   'the satisfaction gate is driven by it');
ok(/if\(enteredPrice > 0 && live\.staff && \(_isCheckout \|\| _moneyAlready\)\)\{/.test(html),
   'and so is the completion — the two can no longer disagree');
ok(!/if\(enteredPrice > 0 && live\.staff\)\{\s*\n\s*if\(live\.status !== 'completed'\)/.test(html),
   'the old unguarded completion is gone (this is what checked people out silently)');
ok(html.indexOf('const _isCheckout =') < html.indexOf('if(enteredPrice > 0 && live.staff && (_isCheckout'),
   '_isCheckout is in scope at the completion');

console.log('5. editing must not check anybody out');
// "when I want to edit something it on lots of occasions takes me to check
// out" — same root. A price read off the RECORD looked identical to one the
// girl had typed, so saving a time change completed the job, moved its money
// and threw up the rebook panel.
ok(/pr\.dataset\.rdSeed = String\(pr\.value\|\|''\);/.test(html),
   'the figure loaded from the record is stamped as a seed');
ok(/const _priceFromRecord = !!\(_prEl && _prSeed!=null && _prSeed!==''/.test(html),
   'and recognised at save time as "nobody typed this"');
ok(/const _priceUntouched = _priceIsSystemGuess \|\| _priceFromRecord;/.test(html),
   'the service guess and the record figure are judged the same way');
ok(/const _isCheckout = enteredPrice>0 && !!_staffPick && !_priceUntouched;/.test(html),
   'so neither one counts as a checkout');
ok(/pr\.value=''; delete pr\.dataset\.rdAuto; delete pr\.dataset\.rdSeed;/.test(html),
   'a fresh modal carries no stale seed from the last appointment');
{
  const open = html.indexOf("pr.dataset.rdSeed = String(pr.value||'');");
  const read = html.indexOf('const _prSeed = _prEl ? _prEl.dataset.rdSeed : undefined;');
  ok(open > 0 && read > open, 'the seed is stamped when Edit opens, read when Save runs');
}

console.log('6. the rule that punished her is unchanged');
ok(/if\(COMM_STRICT && \(a\.sat==='not_asked' \|\| !a\.sat\) && day >= COMM_NOEVIDENCE_FROM\) return 'notasked';/.test(html),
   "commVerdict still cancels commission when there is no answer …");
const cv = html.slice(html.indexOf('function commVerdict(a)'), html.indexOf("return 'notasked';"));
ok(cv.indexOf("return 'nostart'") < cv.indexOf("COMM_STRICT"),
   '… but only AFTER the Crown Board checks — so "notasked" really does mean she did the rest right');

console.log('\n' + (fail ? '✗ ' + fail + ' failed, ' : '✓ ') + pass + ' passed');
process.exit(fail ? 1 : 0);
