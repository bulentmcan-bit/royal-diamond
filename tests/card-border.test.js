// ═══════════════════════════════════════════════════════════════════════════
// A black line round every booking.
//
// "Can we have a black border line around all the slots because they look as
// if they're in each other."
//
// He was right, and the reason was in the stylesheet: the card's border was
// rgba(37,211,102,0.25) — a quarter-opacity green — sitting on a card whose
// background was rgba(37,211,102,0.13), a near-identical green. A border that
// close to its own background is the same thing as no border at all, so a
// column of eight customers read as one long smear.
//
// A diary is a list of separate hours. It has to look like separate hours.
//
// Run:  node tests/card-border.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const is = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
};
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// The one line that draws an appointment on the dashboard grid.
const card = (html.split('\n').find(l => l.includes('border-left:4px solid ') && l.includes('margin-bottom:8px')) || '');

console.log('1. the border is black, and it is actually there');
{
  is(/border:1\.5px solid #1f1f1f;/.test(card), true, 'a solid near-black border on every booking');
  is(card.includes('rgba(37,211,102,0.25)'), false,
     '…and the quarter-opacity green that was invisible on a green card is gone');
  // Done and past cards must get it too. They were the worst of the three,
  // because their old border was rgba(255,255,255,0.1) — white on white.
  is(/isDone\?doneBorder/.test(card), false, 'done and past bookings get the same line, not a fainter one');
  is(card.includes("rgba(255,255,255,0.1)'"), false, '…no more white border on a white card');
}

console.log('2. the technician is still readable, and the hours are apart');
{
  is(/border-left:4px solid '\+col\+'/.test(card), true, "the technician's colour keeps the left edge");
  is(/margin-bottom:8px/.test(card), true, '…and there is air between one hour and the next');
  is(/background:'\+\(isDone\?doneBg:isPast\?'rgba\(255,255,255,0\.04\)':'rgba\(37,211,102,0\.13\)'\)\+'/.test(card), true,
     'the backgrounds are untouched — done, past and live still read differently');
  is(/opacity:0\.85/.test(card), true, '…and a finished booking still sits back');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
