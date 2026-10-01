// ═══════════════════════════════════════════════════════════════════════════
// staff.html — a technician's own page.
//
// The point of it is what it CANNOT do. It has no login, publishes nothing
// new, and reads one world-readable feed that carries no customer data. A
// technician gets her own days and her own hours without the salon's books
// going onto a phone that is not the salon's.
//
//   1. who she is comes from crown-config, never from the address alone
//   2. her days come from rosterOn — change workdays and this page follows
//   3. her services come from canDo — she cannot book herself a pedicure
//   4. free/busy is read per technician, and missing data never refuses her
//   5. the request names her, and index.html honours that or refuses
//   6. the page keeps its hands off everything else
//
// Run:  node tests/staff-page.test.js
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
const page = fs.readFileSync(path.join(root, 'staff.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const crown = fs.readFileSync(path.join(root, 'crown-config.js'), 'utf8');

// The page's first script block is the pure one — no DOM at load.
const blocks = [...page.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
is(blocks.length, 2, 'the page keeps its pure logic and its DOM wiring apart');

function load(search) {
  const ctx = {
    window: {}, console: { log(){}, warn(){}, error(){} },
    location: { search: search || '' }, Date, module: { exports: {} },
  };
  vm.createContext(ctx);
  vm.runInContext(crown, ctx);
  ctx.CROWN = ctx.window.CROWN;
  vm.runInContext(blocks[0], ctx);
  return ctx;
}

console.log('1. who she is');
{
  is(!!load('?who=beyhan').ME, true, '?who=beyhan is a real technician');
  is(load('?who=beyhan').ME.name, 'Beyhan', '…and the page greets her by the name in crown-config');
  is(load('?who=BEYHAN').ME.key, 'beyhan', 'the key is read case-insensitively');
  is(load('?who=helen').ME.key, 'helen', 'nothing here is particular to Beyhan — any technician works');
  is(load('?who=nobody').ME, null, 'a name crown-config does not know is refused, not invented');
  is(load('').ME, null, 'no ?who at all is refused');
  is(load('?who=').ME, null, '…and an empty one too');
  is(/Bu bağlantı eksik/.test(page), true, '…and the page says so in Turkish rather than showing an empty diary');
  is(/\?who=<key>|\?who=beyhan/.test(page), true, 'the file documents how the link is formed');
}

console.log('2. her days');
{
  const ctx = load('?who=beyhan');
  // The week of 14 Eylül 2026: Pzt 14 … Pazar 20.
  const days = ctx.sfMyDays(new Date(2026, 8, 14), 7).map(d => ctx.sfKey(d));
  is(days, ['2026-09-15', '2026-09-17'], 'Beyhan sees her Salı and Perşembe, and no other day of that week');
  is(ctx.sfOnDuty(new Date(2026, 8, 16)), false, 'a Wednesday is not her day');
  is(ctx.sfClosed(new Date(2026, 8, 20)), true, 'Sunday is closed for everyone');

  // The roster is the gate, not a list in this file.
  is(/workdays\s*:\s*\[/.test(page), false, 'staff.html names no workdays of its own');
  is(/rosterOn\(/.test(page), true, '…it asks crown-config, so [2,4] there is all there is');
  const h = load('?who=helen');
  is(h.sfMyDays(new Date(2026, 8, 14), 7).length, 6, 'Helen, who carries no workdays, gets every open day');
}

console.log('3. her services');
{
  const ctx = load('?who=beyhan');
  const mine = ctx.sfMyServices(ctx.ALL_SERVICES);
  is(mine.indexOf('Kirpik Lifting & Boyama') > -1, true, 'the lash LIFT is offered to her');
  is(mine.indexOf('Altın Oran Kaş Alımı') > -1, true, 'brows are offered to her');
  is(mine.indexOf('Klasik Manikür'), -1, 'a manicure is NOT — she is not a nail technician');
  is(mine.indexOf('Klasik Pedikür (Ojesiz)'), -1, '…nor a pedicure');
  is(mine.indexOf('Tüm Yüz Ağda'), -1, '…nor a wax, which is Helen alone');
  is(mine.length > 0 && mine.length < ctx.ALL_SERVICES.length, true, 'she gets some of the list, not all of it and not none');
  const h = load('?who=helen');
  is(h.sfMyServices(h.ALL_SERVICES).indexOf('Tüm Yüz Ağda') > -1, true, 'Helen, who does wax, is offered it');

  /* HER OWN LIST, written out by the owner on 1 Ekim 2026 with the minutes
     beside each one. This is the whole of what she renders, and the thing it
     settles is that she does the lash LIFT and NOT lash extensions — a
     distinction the serviceSkill groups cannot make, because to them both are
     "kirpik". Until this list existed the salon would have sent her lash
     customers. */
  is(mine, ['Altın Oran Kaş Alımı', 'Kaş Boyama', 'Kaş Laminasyon', 'Kirpik Lifting & Boyama',
            'Kaş Vitamini (dermapen)', 'Kaş Silme (solüsyon)', 'Microblading', 'Pudralama'],
     'her eight, in the order crown-config names them');
  is(mine.indexOf('Klasik Kirpik Uygulaması'), -1, 'lash EXTENSIONS are not hers, though the kirpik group would have said they were');
  is(mine.indexOf('Volume / Rus Kirpiği'), -1, '…nor volume lashes');
  is(mine.indexOf('Kirpik Dolgu'), -1, '…nor a lash infill');
  is(mine.indexOf('Kirpik Çıkarma'), -1, '…nor a lash removal');
  is(mine.indexOf('Pudralama') > -1, true, 'and a treatment the salon menu has no line for is still hers');

  is([ctx.sfMinsOf('Altın Oran Kaş Alımı'), ctx.sfMinsOf('Microblading'), ctx.sfMinsOf('Pudralama')],
     [30, 90, 90], 'each one carries its own length, not a notional hour');
  is(ctx.sfMinsOf('Klasik Manikür'), null, 'a job that is not hers has no length from her');
  is(ctx.sfMinsOf(''), null, '…and neither has nothing');
  is(h.sfMinsOf('Klasik Manikür'), null, 'a technician with no list of her own gets no invented minutes either');

  // A service crown-config cannot categorise is open to EVERYBODY as far as
  // canDo is concerned — the right answer for the salon's diary, where an
  // unclassified job should not be blocked, and the wrong one here.
  is(h.sfMyServices(h.ALL_SERVICES).indexOf('Güzellik Uygulaması'), -1,
     'an uncategorised service is NOT offered just because nothing forbids it');
  is(/serviceGroup\(s\)/.test(page), true, '…because the page requires a real group as well as canDo');

  // The list lives in crown-config. The only array of service names in this
  // file is the salon's whole menu; a second one would be a per-technician
  // list living here instead, which is what ME.services exists to prevent.
  is((page.match(/'Klasik Kirpik Uygulaması'/g) || []).length, 1,
     'one service array in this file, the salon menu — no per-technician list is typed here');
  is(/ME\.services/.test(page), true, 'hers is read off the operator');
}

console.log('4. free or taken');
{
  const ctx = load('?who=beyhan');
  const S = ctx.sfSlotState;
  const BEY = ctx.ME, LIS = { key: 'lissa', name: 'Lissa' };
  /* The feed keys these maps by the technician's DISPLAY name, because that is
     what index.html publishes — not by the lower-case key everything in
     crown-config uses. Reading a[key] found nothing, every hour came back
     'unknown' and drew as bookable with no BOŞ or DOLU on it: the page looked
     like it was working and told her nothing. Caught on the live site on
     1 Ekim 2026, before the link went to her. */
  const feed = { days: { '2026-09-17': {
    '09:00': { b: 0, c: 3, t: { Beyhan: 0, Lissa: 1 }, a: { Beyhan: 1, Lissa: 0 } },
    '10:00': { b: 1, c: 3, t: { Beyhan: 1, Lissa: 0 }, a: { Beyhan: 0, Lissa: 1 } },
    '11:00': { b: 0, c: 3, t: { Lissa: 0 }, a: { Lissa: 1 } },
    '12:00': 0
  }, '2026-09-20': { _closed: 1 } } };
  is(S(feed, '2026-09-17', '09:00', BEY), 'free', 'free for her whole job → free, found under her DISPLAY name');
  is(S(feed, '2026-09-17', '10:00', BEY), 'busy', 'busy → busy');
  is(S(feed, '2026-09-17', '09:00', LIS), 'busy', "…and it is read PER technician — Lissa is busy in the hour Beyhan is free");
  is(S(feed, '2026-09-17', '11:00', BEY), 'unknown', 'an hour the feed says nothing about her is unknown');
  is(S(feed, '2026-09-17', '12:00', BEY), 'unknown', 'a malformed slot is unknown, not a crash');
  is(S(feed, '2026-09-17', '23:00', BEY), 'unknown', 'an hour that is not in the feed at all is unknown');
  is(S(feed, '2026-09-20', '09:00', BEY), 'closed', 'a closed day says closed');
  is(S(feed, '2026-09-19', '09:00', BEY), 'unknown', 'a day the feed has not got is unknown');
  is(S(null, '2026-09-17', '09:00', BEY), 'unknown', 'no feed at all is unknown');

  // Either spelling, whichever the feed happens to use.
  const byKey = { days: { '2026-09-17': { '09:00': { a: { beyhan: 1 }, t: { beyhan: 0 } } } } };
  is(S(byKey, '2026-09-17', '09:00', BEY), 'free', 'a feed keyed by the lower-case key works just as well');
  const shouty = { days: { '2026-09-17': { '09:00': { a: { BEYHAN: 0 }, t: { BEYHAN: 1 } } } } };
  is(S(shouty, '2026-09-17', '09:00', BEY), 'busy', '…and so does one that shouts');
  is(ctx.sfPick({ Beyhan: 1 }, BEY), 1, 'the lookup finds her by name');
  is(ctx.sfPick({ beyhan: 0 }, BEY), 0, '…and by key, and 0 is an answer, not a miss');
  is(ctx.sfPick({ Lissa: 1 }, BEY), undefined, '…and somebody else is not her');
  is(ctx.sfPick(null, BEY), undefined, 'no map, no answer');
  is(ctx.sfPick({ Beyhan: 1 }, null), undefined, 'no technician, no answer');
  // The page must pass the operator, not one of her two names — that was the bug.
  is(/sfSlotState\(avail, ymd, t, ME\)/.test(page), true, 'the grid asks with the operator herself');
  is(/sfSlotState\(avail, sfKey\(selDay\), selTime, ME\)/.test(page), true, '…and so does the check before saving');
  is(/sfSlotState\([^)]*ME\.key\)/.test(page), false, '…and never with the key alone, which found nothing');
  // Unknown must not be drawn as busy: a slow connection would otherwise cost
  // her the booking.
  is(/st==='busy'\?' disabled':''/.test(page), true, 'ONLY a busy slot is disabled — unknown stays bookable');
}

console.log('5. the request names her');
{
  const ctx = load('?who=beyhan');
  const r = ctx.sfRequest(ctx.ME, new Date(2026, 8, 17), '14:00', 'Kaş Laminasyon', '  Ayşe K  ', '0533 123 45 67', 1760000000000);
  is(r.tech, 'beyhan', 'the request carries WHO it is for — the whole point of the page');
  is(r.date, '2026-09-17', 'the date is the salon’s own key form');
  is(r.time, '14:00', 'the hour as chosen');
  is(r.name, 'Ayşe K', 'the name is trimmed');
  is(r.src, 'staff-beyhan', 'and it is marked as coming from her page, not from the public one');
  is(r.mins, 60, 'and how long it takes, so the confirmation line can say so');
  is('mins' in ctx.sfRequest(ctx.ME, new Date(2026, 8, 17), '14:00', 'Klasik Manikür', 'A', '05331234567', 1), false,
     '…left off entirely when there is no figure, never sent as a 0 something downstream might believe');
  is(r.ts, 1760000000000, 'the clock is passed in, so this is testable');

  is(ctx.sfPhoneOk('0533 123 45 67'), true, 'a Cyprus mobile passes');
  is(ctx.sfPhoneOk('+90 533 123 45 67'), true, '…in international form too');
  is(ctx.sfPhoneOk('12345'), false, 'a short number is refused before it reaches the diary');
  is(ctx.sfPhoneOk(''), false, '…and so is nothing');

  // index.html must actually honour it.
  is(/const _want=String\(req\.tech\|\|''\)\.trim\(\)\.toLowerCase\(\);/.test(index), true, 'index.html reads the requested technician');
  is(/if\(_want\) _able=_able\.filter\(t=>String\(t\)\.toLowerCase\(\)===_want\);/.test(index), true, '…and narrows the list to her ALONE');
  is(/let _able=_obTechs\(req\.date\)\.filter/.test(index), true, '…off the day’s roster and the service skill, as before');
  is(/o gün\/saat bu hizmet için müsait değil/.test(index), true, 'a refusal names her rather than saying "saat dolu"');
  // The old behaviour — first free technician wins — must not survive for a
  // named request, or a customer who asked for Beyhan gets Lissa.
  is(/const staffPick=_able\.find\(t=>_obTechCanStart\(t, req\.time, maps, _svcMins\(t\)\)\)\|\|'';/.test(index), true, 'the pick still comes from the narrowed list…');
  is(/function _obTechCanStart\(tech,slot,maps,mins\)\{/.test(index), true, '…and is asked whether she can start a job of THIS length');
  is(/const _reqDur=staffPick\?\(_svcMins\(staffPick\)\|\|_obSpacing\(staffPick\)\):60;/.test(index), true, '…and the appointment is written for that length, not a notional hour');
  is(/CROWN\.serviceMinutes\)\?CROWN\.serviceMinutes\(t, req\.service\|\|''\)/.test(index), true, '…read from crown-config, which is where the owner wrote the minutes');
}

console.log('6. what the page does NOT do');
{
  is(/signInAnonymously/.test(page), true, 'it signs in anonymously — no salon password on her phone');
  is(/setPersistence\(firebase\.auth\.Auth\.Persistence\.NONE\)/.test(page), true, '…and keeps no session');
  is(/'staffPage'/.test(page), true, '…in its own Firebase app instance, never the salon login');
  is(/rdns_public_availability\/days/.test(page), true, 'it reads the availability feed');
  is(/rdns_booking_requests/.test(page), true, '…and writes booking requests');
  // Everything else is off limits. These are the paths that hold money and
  // customers; none of them may appear in a file that runs on a phone the
  // salon does not control.
  ['rdns_main_v1', 'rdns_wa_replies_v1', 'rdns_gapfill_v1', 'rdns_msg_v1',
   'rdns_r24_sent_log_v1', 'rdns_takings', 'rdns_salary', 'payments']
    .forEach(p => is(page.indexOf(p), -1, 'staff.html never touches ' + p));
  is(/noindex/.test(page), true, 'and it is kept out of search engines');
  is(fs.existsSync(path.join(root, 'staff-manifest.json')), true, 'it has its own manifest, so adding it to a home screen does not install the salon app');
  const man = JSON.parse(fs.readFileSync(path.join(root, 'staff-manifest.json'), 'utf8'));
  is(man.start_url, '/staff.html', '…opening on her own page');
  is(man.scope, '/staff.html', '…and scoped to it, so the home-screen app cannot wander into index.html');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
