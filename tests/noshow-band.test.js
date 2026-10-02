// ═══════════════════════════════════════════════════════════════════════════
// "GELMİYORUM dedi" — a cancellation that cannot be missed.
//
// A customer wrote "Hello I cannot come today" at 16:03. It went into the
// replies panel, which is a list below the fold. Nobody looked. The owner rang
// her the next day to ask whether she was coming and she told him she had
// already cancelled — and because nobody had cancelled it in the diary, the
// hour sat there all that time and could not be sold to anybody else either.
// Two losses from one unread line, and his staff calling the system stupid.
//
//   1. the words that mean "I am not coming" — and the ones that do not
//   2. the right message for the right appointment, newest first
//   3. her own words on her own card, red when she is not coming
//   4. a red band above everything, with the hour and one tap to free it
//   5. nothing is ever cancelled automatically
//   6. and it refreshes the moment a message lands
//
// Run:  node tests/noshow-band.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const is = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
};
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const slice = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b); if (i < 0 || j <= i) throw new Error('markers'); return html.slice(i, j); };
const np = html.match(/function normalizeWaPhone\(phone\)\{[\s\S]*?\n\}/)[0];
const ctx = { console: { log(){}, warn(){}, error(){} }, Date, Intl };
vm.createContext(ctx);
vm.runInContext(np + '\n' + slice('// WAREPLY-SLICE-START', '// WAREPLY-SLICE-END'), ctx, { filename: 'wareply.js' });

console.log('1. what counts as "I am not coming"');
{
  const C = ctx.rdWrIsCancel;
  [
    'Hello ı cannot come today', "I can't come today", 'I cannot come',
    'sorry not coming today', "won't make it", 'I have to cancel',
    'I need to cancel my appointment', 'Cancelling today sorry',
    'Merhaba gelemiyorum', 'bugün gelemeyeceğim', 'gelemiycem kusura bakma',
    'randevumu iptal edebilir miyiz', 'İPTAL LÜTFEN', 'gelmiyorum',
    'maalesef gelemem', 'bugün gelmeyeceğim',
  ].forEach(t => is(C(t), true, 'cancels: “' + t + '”'));

  /* The other way is the dangerous one: a band that cries wolf gets ignored
     within a week, and then the real one is missed too. Past tense is about a
     visit already gone; a question is a question. */
  [
    'geçen hafta gelemedim özür dilerim', 'gelemez miyim acaba',
    'yarın gelebilir miyim', 'Tamamdır', 'teşekkürler', 'saat kaçta',
    'Konum atarmısın', 'geliyorum', 'başka saat', '', '   ',
  ].forEach(t => is(C(t), false, 'does NOT cancel: “' + t + '”'));
  is(C(null), false, 'nor does nothing at all');
}

console.log('2. the right message for the right appointment');
{
  const L = ctx.rdWrLatestFor;
  const c = { id: 7, name: 'Pelin', phone: '0533 866 72 01' };
  const at = new Date('2026-10-01T17:00').getTime();
  const appt = { id: 1, clientId: 7, datetime: '2026-10-01T17:00' };
  const R = (id, ts, text, phone) => ({ id, ts, text, phone: phone || '905338667201' });
  const map = {
    a: R('a', at - 3 * 86400000, 'çok eski bir mesaj'),
    b: R('b', at - 3600000, 'Hello ı cannot come today'),
    c: R('c', at - 7200000, 'merhaba'),
    d: R('d', at - 3600000, 'BAŞKA BİRİ', '905330000000'),
  };
  is(L(map, c, appt).id, 'b', 'the newest message inside the window wins');
  is(L(map, c, { id: 2, clientId: 7, datetime: '2026-10-20T17:00' }), null, 'a booking three weeks later is not what she was writing about');
  is(L(map, c, appt).phone, '905338667201', '…and it is HER number, never the next customer’s');
  is(L(map, null, appt), null, 'no customer, no message');
  is(L(map, c, null), null, 'no appointment, no message');
  is(L(map, { id: 9, name: 'X', phone: '' }, appt), null, 'a customer with no telephone matches nobody');
  is(L({}, c, appt), null, 'an empty inbox is empty');
  // a message that lands while she is in the chair still belongs to that hour
  is(L({ z: R('z', at + 1800000, 'kapıdayım') }, c, appt).id, 'z', 'a message during the appointment still belongs to it');
  is(L({ z: R('z', at + 9 * 3600000, 'teşekkürler') }, c, appt), null, '…but one nine hours later does not');
}

console.log('3. her words on her own card');
{
  const S = ctx.rdWrApptStrip;
  const c = { id: 7, name: 'Pelin', phone: '905338667201' };
  const appt = { id: 1, clientId: 7, datetime: '2026-10-01T17:00' };
  const at = new Date(appt.datetime).getTime();
  const mk = text => ({ b: { id: 'b', ts: at - 3600000, text, phone: '905338667201' } });

  const cancel = S(mk('Hello ı cannot come today'), c, appt);
  is(/GELMİYOR/.test(cancel), true, 'a cancellation says GELMİYOR on the card');
  is(/#c0392b/.test(cancel), true, '…in red');
  is(/Hello ı cannot come today/.test(cancel), true, '…with HER OWN WORDS, not a mark to go looking for');

  const chat = S(mk('Konum atarmısın'), c, appt);
  is(/GELMİYOR/.test(chat), false, 'an ordinary message does not shout');
  is(/Konum atarmısın/.test(chat), true, '…but her words are still there');
  is(/#fdf3e0/.test(chat), true, '…quietly, in gold');

  const yes = S(mk('Tamamdır geliyorum'), c, appt);
  is(/GELİYOR/.test(yes), true, 'a confirmation says GELİYOR on the card');
  is(/#1e7a44/.test(yes), true, '…in green');
  is(/GELMİYOR/.test(yes), false, '…and never the red one');

  is(S({}, c, appt), '', 'nothing written, nothing shown');
  is(S(mk('   '), c, appt), '', 'a blank message is nothing');
  is(S(mk('<img src=x onerror=alert(1)>'), c, appt).indexOf('<img'), -1, 'and a customer cannot put HTML on the board');
  is(S(mk('x'.repeat(200)), c, appt).length < 400, true, 'a very long message is cut so the card still fits');
}

console.log('4. the band');
{
  is(/id="dash-noshow-band"/.test(html), true, 'the band has its own place on the dashboard');
  is(/<div id="dash-noshow-band"[\s\S]{0,120}<div id="dash-actions"/.test(html), true, '…ABOVE the actions list, not under it');
  is(/function rdNoShowSaid\(\)/.test(html), true, 'it reads every upcoming appointment against what she wrote');
  is(/if\(!a \|\| a\.status==='cancelled' \|\| a\.status==='completed'\) return;/.test(html), true, '…skipping the already cancelled and the already done');
  // The owner watched a band of 25 at ten to six and the top of it was a five
  // o'clock that had already come and gone. "Don't show the ones where their
  // time has passed." An hour that is behind you cannot be sold, confirmed or
  // usefully telephoned about — it is only in the way of the ones that can.
  is(/if\(!at \|\| at < now\) return;/.test(html), true, 'an appointment whose hour has passed is gone from all three bands');
  is(/at < now-6\*3600000/.test(html), false, '…not kept for six hours afterwards, as it once was');
  // And the clock has to keep moving while nobody touches the page.
  is(/setInterval\(function\(\)\{[\s\S]{0,400}?rdRenderNoShowBand\(\);[\s\S]{0,60}?\}, 60000\);/.test(html), true,
     'the bands redraw once a minute, so a passed hour drops off on its own');
  is(/el\.offsetParent===null\) return;/.test(html), true, '…and do nothing at all while the band is off screen');
  is(/⚠ '\+t\.red\.length\+' müşteri GELMİYORUM dedi — saati boşaltın/.test(html), true, 'the red heading says how many and what to do');

  /* THREE STATES, in the order a salon cares about them at eight in the
     morning: free the hour, ring the silent one, leave the confirmed alone. */
  is(/📞 '\+t\.amber\.length\+' müşteri hatırlatmaya cevap vermedi — arayıp teyit edin/.test(html), true,
     "the amber heading — the owner's own ask, the ones who didn't reply");
  is(/✅ '\+t\.green\.length\+' müşteri geleceğini onayladı — yapılacak bir şey yok/.test(html), true,
     'the green heading says plainly that there is nothing to do');
  is(/if\(t\.red\.length\)\{[\s\S]*?if\(t\.amber\.length\)\{[\s\S]*?if\(t\.green\.length\)\{/.test(html), true,
     '…and they are drawn red, amber, green in that order');
  is(/📞 Ara/.test(html), true, 'each silent customer has one tap to ring her');
  is(/if\(t\.green\.length\)\{[\s\S]{0,900}rdNoShowCancel/.test(html), false,
     'the green list has no buttons — it must never compete with the red one');
  is(/✕ İptal et — saati boşalt/.test(html), true, 'and each row has one tap that frees the hour');
  is(/📞 '\+esc\(x\.c\.phone\)/.test(html), true, '…beside her telephone, to ring her first');
  is(/el\.style\.display='none'/.test(html), true, 'and the band disappears entirely when nobody has written');
}

console.log('4b. who lands in which list');
{
  const C = ctx.rdWrIsConfirm;
  ['Tamam', 'tamamdır', 'Evet', 'olur', 'geliyorum', 'geleceğim', 'görüşürüz',
   'yes', 'OK', 'okay', 'coming', 'see you', 'confirmed', 'Peki'].forEach(t =>
    is(C(t), true, 'confirms: “' + t + '”'));

  /* A confirmation caught by mistake is worse than a cancellation caught by
     mistake: the row turns green, everybody relaxes, and the one customer who
     was actually asking a question never gets rung. So this is narrow. */
  ['tamam mı', 'geliyor muyum', 'saat kaçta?', 'olur mu acaba',
   'Konum atarmısın', 'başka saat', 'iptal edelim tamam mı', ''].forEach(t =>
    is(C(t), false, 'does NOT confirm: “' + t + '”'));
  is(C('iptal, tamam mı'), false, 'a cancellation with "tamam" in it is still a cancellation');
  is(/if\(t\.indexOf\('\?'\)!==-1\) return false;/.test(html), true, '…and a question mark is never a yes');
  is(/if\(rdWrIsCancel\(t\)\) return false;/.test(html), true, '…and iptal always wins over tamam');

  // Amber is only claimed where a reminder really went.
  is(/if\(!\(a\.r24 \|\| a\.r1\)\) return;/.test(html), true, 'nobody is called "no answer" unless a reminder actually went to her');
  is(/if\(at > now\+36\*3600000\) return;/.test(html), true, '…and only for today and tomorrow, not next week');
  is(/if\(typeof rdIsBlocker==='function' && rdIsBlocker\(a\.clientId\)\) return;/.test(html), true,
     'a held hour is not a person and never appears in any of the three');
  is(/if\(r\) return;\s+\/\/ she wrote something else/.test(html), true,
     'a customer who wrote something else is in none of them — her words are on her card');
  is(/\(\^\|\\s\)\(mi\|mu\|ma\|me\)/.test(html), true,
     'and a Turkish question with no question mark — "tamam mı", "olur mu" — is not read as a yes');
}

console.log('5. nothing is cancelled on its own');
{
  const fn = /window\.rdNoShowCancel=function\(id\)\{([\s\S]*?)\n\};/.exec(html);
  is(!!fn, true, 'the cancel is a function of its own');
  const b = fn ? fn[1] : '';
  is(/if\(!confirm\(/.test(b), true, 'it asks first — cancelling the wrong booking is worse than leaving it');
  is(/dashCancelAppt\(id\)/.test(b), true, '…and goes through the same path reception’s own ✕ uses, so the hour is really released');
  // A machine reading "cannot come" is a guess. A guess must never empty a chair.
  is(/rdWrIsCancel[\s\S]{0,400}dashCancelAppt\(/.test(html.replace(/window\.rdNoShowCancel[\s\S]*/, '')), false,
     'nothing cancels an appointment straight off the back of reading a message');
}

console.log('6. it appears the moment she writes');
{
  is(/try\{ if\(typeof rdDashActions==='function'\) rdDashActions\(\); \}catch\(e\)\{\}/.test(html), true, 'new replies refresh the dashboard');
  is(/try\{ if\(typeof renderDashGrid==='function'\) renderDashGrid\(\); \}catch\(e\)\{\}/.test(html), true, '…and the day’s columns, so the card is marked at once');
  is(/function rdDashActions\(\)\{\s*\n\s*try\{ rdRenderNoShowBand\(\); \}catch\(e\)\{\}/.test(html), true, '…and the band is drawn first, before anything else on the page');
  is(/window\.rdWrAll=function\(\)\{ return _wr; \};/.test(html), true, 'the diary can read the replies');
  is(/window\.rdWrStripFor=function\(appt\)\{/.test(html), true, '…and ask for one appointment’s strip');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
