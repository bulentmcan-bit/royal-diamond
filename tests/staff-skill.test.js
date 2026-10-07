// ═══════════════════════════════════════════════════════════════════════════
// WHO CAN DO WHAT — crown-config.js staffPrefs.serviceSkill and every place
// that asks it. It proves:
//   1. serviceGroup sorts EVERY name in the service list into its heading
//      (manikur / pedikur / kirpik / kas / agda) and the odd ones into none
//   2. canDo: Helen never lashes, Lissa and Hannah never brows or wax, a
//      non-technician (Manager) and an ungrouped service are open; Beyhan
//      (from 15 Eylül 2026) does brows and lashes and NEVER nails or wax
//   3. skilledOn / fillOrderOn answer in the configured order, per day —
//      and the day-by-day roster under `workdays`: Pzt Helen, Lissa, Zara,
//      Hannah · Salı Helen, Lissa, Beyhan, Hannah · Çar/Cum/Cmt Helen,
//      Lissa, Hannah · Perş all five
//   3b. `workdays` FAILS OPEN: a missing, malformed, empty or out-of-range
//      value puts her on every day — a typo never deletes a column
//   3c. Beyhan on the money screens of index.html: rate 0.80 (what the
//      salon OWES her, never 0.20) in every rate map, her row, her colour,
//      and the Aylık page's "Salona kalan (%20)" card
//   4. index.html's rdCanDo / rdSkilledOn read the config, and answer the
//      open way round before it is there
//   5. the booking page: a time with only Helen free is "free" for a
//      manicure and "full" for lashes — nobody is substituted
//   6. the online request handler, Uygun Saat Bul and the save paths all
//      carry the check (pinned by text, so a refactor cannot drop one)
//
// Run:  node tests/staff-skill.test.js
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
function loadCrown() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'crown-config.js'), 'utf8');
  // Date is shared with the vm so `date instanceof Date` inside rosterOn sees
  // a Date the test built — a second realm's Date is not instanceof this one.
  const ctx = { window: {}, console, Date }; vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx.window.CROWN;
}
const C = loadCrown();
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const bk = fs.readFileSync(path.join(__dirname, '..', 'booking.html'), 'utf8');

console.log('1. every service name in the list lands in its heading');
{
  // The option lists themselves, read off the booking page: heading → names.
  const groups = {};
  const re = /<optgroup label="([^"]+)">([\s\S]*?)<\/optgroup>/g;
  let m;
  while ((m = re.exec(bk))) {
    const names = [...m[2].matchAll(/<option value="([^"]+)"/g)].map(x => x[1].replace(/&amp;/g, '&'));
    groups[m[1]] = names;
  }
  const want = { '💅 MANİKÜR': 'manikur', '🦶 PEDİKÜR': 'pedikur', '👁 KİRPİK': 'kirpik', '🤨 KAŞ': 'kas', '🪒 AĞDA': 'agda', '✨ DİĞER': null };
  is(Object.keys(groups), Object.keys(want), 'the five headings plus DİĞER, as the page lists them');
  /* soloServices are the exception, and deliberately so. Pudralama, Kaş
     Vitamini and Kaş Silme came in with Beyhan on 1 Ekim 2026 and nobody else
     does them. Two of the three would otherwise fall into `kas` on the word
     "kaş" alone, and Helen — who IS in `kas` — would silently become bookable
     for a dermapen she has never done. Having no group, they belong to
     whoever names them in a list of her own, and Helen keeps every brow
     service she really does. */
  const solo = n => (C.soloServices || []).some(x => C.svcKey(x) === C.svcKey(n));
  for (const h of Object.keys(want)) {
    const got = (groups[h] || []).map(n => C.serviceGroup(n));
    is(got, (groups[h] || []).map(n => solo(n) ? null : want[h]),
       h + ' → ' + want[h] + ' for all ' + (groups[h] || []).length + ((groups[h] || []).some(solo) ? ', bar the solo ones' : ''));
  }
  is(C.soloServices.filter(n => C.serviceGroup(n) !== null), [], 'every solo service really is left ungrouped');
  is(C.soloServices.filter(n => C.claimedBy(n).length === 0), [], '…and every one of them is claimed by somebody, or nobody could do it at all');
  is(C.serviceGroup('Kaş Laminasyon'), 'kas', 'and an ordinary brow service is still a brow service');
  is(C.serviceGroup('Bıyık / Çene Ağda'), 'agda', 'the lip/chin wax is a wax — there is no separate lip category');
  is(C.serviceGroup('KİRPİK'), 'kirpik', 'upper-case Turkish İ folds');
  is(C.serviceGroup('Kalıcı Ojeli Pedikür'), 'pedikur', 'a pedicure with polish is a pedicure, not a manicure');
  is(C.serviceGroup('Online Randevu'), null, 'an online request with no service named fits no group');
  is(C.serviceGroup(''), null, 'empty → none');
}

console.log('2. canDo');
{
  is(C.canDo('Helen', 'Klasik Kirpik Uygulaması'), false, 'Helen does not do lashes');
  is(C.canDo('lissa', 'Kirpik Dolgu'), true, 'Lissa does (by key)');
  is(C.canDo('Hannah', 'Volume / Rus Kirpiği'), true, 'Hannah does');
  is(C.canDo('Lissa', 'Bikini Ağda'), false, 'Lissa does not wax');
  is(C.canDo('Hannah', 'Altın Oran Kaş Alımı'), false, 'Hannah does not do brows');
  is(C.canDo('Helen', 'Microblading'), true, 'Helen only — brows');
  is(C.canDo('Helen', 'Tam Kol Ağda'), true, 'Helen only — wax');
  is(C.canDo('Hannah', 'Jel Pedikür'), true, 'everyone does pedicures');
  // Zara (temporary, 12 Eylül): manicure and pedicure, nothing else — her
  // absence from kirpik, kas and agda is deliberate, not an omission.
  is(C.canDo('Zara', 'Klasik Manikür'), true, 'Zara does manicures');
  is(C.canDo('zara', 'Jel Pedikür'), true, 'Zara does pedicures (by key)');
  is(C.canDo('Zara', 'Kirpik Dolgu'), false, 'Zara does not do lashes');
  is(C.canDo('Zara', 'Kaş Laminasyon'), false, 'Zara does not do brows');
  is(C.canDo('Zara', 'Bikini Ağda'), false, 'Zara does not wax');
  // Beyhan (15 Eylül 2026): a brow and lash specialist, NOT a nail
  // technician. She must never be offered a manicure by the diary, the
  // booking page or the gap-filler — canDo is what all three ask.
  /* Beyhan does the lash LIFT and NOT lash extensions. The owner wrote her
     list out on 1 Ekim 2026 and that is the whole of her work; the kirpik
     group cannot make the distinction, because to it both are "kirpik". Until
     the list existed the salon would have sent her lash customers. */
  is(C.canDo('Beyhan', 'Klasik Kirpik Uygulaması'), false, 'Beyhan does NOT do lash extensions');
  is(C.canDo('beyhan', 'Kirpik Dolgu'), false, 'Beyhan does NOT do lash infills (by key)');
  is(C.canDo('beyhan', 'Kirpik Lifting & Boyama'), true, '…but she DOES do the lash lift');
  is(C.canDo('beyhan', 'Pudralama'), true, '…and a treatment the salon menu has no line for, because she named it');
  is(C.canDo('lissa', 'Pudralama'), false, '…which nobody else may be booked for');
  is(C.canDo('helen', 'Kaş Laminasyon'), true, 'Helen keeps every brow service she really does');
  is(C.canDo('helen', 'Kaş Vitamini (dermapen)'), false, "…and is not quietly given one she doesn't, on the word kaş alone");
  is(C.canDo('Beyhan', 'Altın Oran Kaş Alımı'), true, 'Beyhan does brows');
  is(C.canDo('Beyhan', 'Kaş Laminasyon'), true, 'Beyhan does brow lamination');
  is(C.canDo('Beyhan', 'Microblading'), true, 'Beyhan does microblading');
  is(C.canDo('Beyhan', 'Klasik Manikür'), false, 'Beyhan is REFUSED a manicure');
  is(C.canDo('Beyhan', 'Dolgu (Infill)'), false, 'Beyhan is REFUSED a nail infill');
  is(C.canDo('Beyhan', 'Jel Pedikür'), false, 'Beyhan is REFUSED a pedicure');
  is(C.canDo('Beyhan', 'Bikini Ağda'), false, 'Beyhan is REFUSED a wax');
  is(C.canDo('Beyhan', 'Bıyık / Çene Ağda'), false, 'Beyhan is REFUSED the lip/chin wax — that is agda, Helen only');
  is(C.staffPrefs.serviceSkill.kirpik, ['lissa', 'hannah'], 'kirpik: Lissa and Hannah — Beyhan carries her own list instead');
  is(C.staffPrefs.serviceSkill.kas, ['helen'], 'kas: Helen — likewise');
  is(Object.keys(C.servicesOf('beyhan')).length, 8, "…and Beyhan's own list names eight treatments");
  is(C.servicesOf('helen'), null, 'nobody else carries one, so the groups still answer for them');
  is(C.staffPrefs.serviceSkill.manikur.includes('beyhan') || C.staffPrefs.serviceSkill.pedikur.includes('beyhan') || C.staffPrefs.serviceSkill.agda.includes('beyhan'), false, 'Beyhan is under neither manikur, pedikur nor agda');
  is(C.canDo('Manager', 'Bikini Ağda'), true, 'Manager is not a technician — the rule does not govern the name');
  is(C.canDo('Lissa', 'Güzellik Uygulaması'), true, 'an ungrouped service is open to everyone');
  is(C.canDo('', 'Kirpik Dolgu'), true, 'no staff chosen yet — nothing to refuse');
}

console.log('3. skilledOn / fillOrderOn — and the day-by-day roster under workdays');
{
  // The week of 14 Eylül 2026: Pzt 14, Salı 15, Çar 16, Perş 17, Cum 18, Cmt 19, Pazar 20.
  const MON = '2026-09-14', TUE = '2026-09-15', WED = '2026-09-16', THU = '2026-09-17', FRI = '2026-09-18', SAT = '2026-09-19', SUN = '2026-09-20';
  const names = d => C.rosterOn(d).map(o => o.name);
  is(names(MON), ['Helen', 'Lissa', 'Zara', 'Hannah'], 'Pazartesi: Helen, Lissa, Zara, Hannah');
  is(names(TUE), ['Helen', 'Lissa', 'Beyhan', 'Hannah'], 'Salı: Helen, Lissa, Beyhan, Hannah — her Tuesday went back on 30 Eylül 2026');
  is(names(WED), ['Helen', 'Lissa', 'Hannah'], 'Çarşamba: Helen, Lissa, Hannah');
  is(names(THU), ['Helen', 'Lissa', 'Zara', 'Beyhan', 'Hannah'], 'Perşembe: all five — Zara and Beyhan both present');
  is(names(FRI), ['Helen', 'Lissa', 'Hannah'], 'Cuma: Helen, Lissa, Hannah');
  is(names(SAT), ['Helen', 'Lissa', 'Hannah'], 'Cumartesi: Helen, Lissa, Hannah');
  is(names(SUN), ['Helen', 'Lissa', 'Hannah'], 'Pazar (closed anyway): the every-day three');
  is(names(new Date(2026, 8, 17, 9)), names(THU), 'a Date is read in local time — a Thursday morning is Thursday');
  is(names(new Date(2026, 8, 17, 23, 30)), names(THU), '…and so is a Thursday night');
  is(names(THU + 'T10:00'), names(THU), 'a datetime string is read by its date');
  is(C.find('zara').workdays, [1, 4], 'Zara: Pazartesi and Perşembe');
  is(C.find('beyhan').workdays, [2, 4], 'Beyhan: Salı and Perşembe');
  // RECEPTION'S GRID on a Perşembe — the columns the desk is shown. It is
  // rosterOn for that day minus hiddenOnDash, which is a different flag from
  // the television's hiddenOnBoard: Beyhan is off the wall and on the desk.
  const dashOn = ymd => C.rosterOn(ymd).filter(o => !o.hiddenOnDash).map(o => o.name);
  is(dashOn(THU), ['Helen', 'Lissa', 'Beyhan', 'Hannah'], "the dashboard on a Perşembe: Helen, Lissa, Beyhan, Hannah — Zara stays off");
  is(dashOn(TUE), ['Helen', 'Lissa', 'Beyhan', 'Hannah'], 'on a Salı: her column is back on the desk as well');
  is(dashOn(MON), ['Helen', 'Lissa', 'Hannah'], 'on a Pazartesi: the three — Zara is rostered but off the grid');
  // And the page really reads that flag, not the wall's.
  {
    const page = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
    const i = page.indexOf('function renderDashGrid()');
    const head = page.slice(i, i + 900);
    is(head.includes('o.hiddenOnDash'), true, "renderDashGrid filters on hiddenOnDash");
    is(head.includes('o.hiddenOnBoard'), false, "and no longer on the television's flag");
  }
  is(['helen', 'lissa', 'hannah'].map(k => 'workdays' in C.find(k)), [false, false, false], 'Helen, Lissa and Hannah carry no workdays — every open day, exactly as before');

  is(C.skilledOn('Klasik Kirpik Uygulaması', TUE).map(o => o.name), ['Lissa', 'Hannah'], 'lash extensions on a Tuesday: Lissa and Hannah — Beyhan does not do them');
  is(C.skilledOn('Kirpik Lifting & Boyama', TUE).map(o => o.name), ['Lissa', 'Hannah', 'Beyhan'], '…but the lash LIFT on a Tuesday is hers as well');
  is(C.skilledOn('Pudralama', TUE).map(o => o.name), ['Beyhan'], 'and a treatment only she does is hers alone');
  is(C.skilledOn('Pudralama', '2026-09-16').map(o => o.name), [], '…and nobody at all on a day she is not in');
  is(C.skilledOn('Klasik Kirpik Uygulaması', MON).map(o => o.name), ['Lissa', 'Hannah'], 'lashes on a Monday: Lissa, Hannah — Beyhan is not in');
  is(C.skilledOn('Kaş Laminasyon', TUE).map(o => o.name), ['Helen', 'Beyhan'], 'brows on a Tuesday too: Helen, then Beyhan — the card advertises Salı, so the diary allows it');
  is(C.skilledOn('Kaş Laminasyon', THU).map(o => o.name), ['Helen', 'Beyhan'], 'brows on a Thursday: Helen, then Beyhan');
  is(C.skilledOn('Kaş Laminasyon', WED).map(o => o.name), ['Helen'], 'brows on a Wednesday: Helen alone');
  is(C.skilledOn('Tüm Yüz Ağda', TUE).map(o => o.name), ['Helen'], 'wax: Helen alone, Beyhan or no Beyhan');
  is(C.skilledOn('Klasik Manikür', MON).map(o => o.name), ['Helen', 'Lissa', 'Zara', 'Hannah'], 'manicure on a Monday: Helen, Lissa, Zara, Hannah — never Beyhan');
  is(C.skilledOn('Klasik Manikür', TUE).map(o => o.name), ['Helen', 'Lissa', 'Hannah'], 'manicure on a Tuesday: Helen, Lissa, Hannah — no Zara (her day off), and no Beyhan even though she is in (not a nail technician)');
  is(C.skilledOn('Klasik Manikür', THU).map(o => o.name), ['Helen', 'Lissa', 'Zara', 'Hannah'], 'manicure on a Thursday: the four nail technicians, Beyhan still not among them');
  is(C.skilledOn('Jel Pedikür', THU).map(o => o.name), ['Helen', 'Lissa', 'Zara', 'Hannah'], 'pedicure on a Thursday: the same four');
  is(C.skilledOn('Diğer / Other', THU).map(o => o.name), ['Helen', 'Lissa', 'Zara', 'Hannah'], 'ungrouped on a Thursday: everyone the groups govern, in roster order');
  is(C.skilledOn('Diğer / Other', THU).map(o => o.name).indexOf('Beyhan'), -1,
     '…and NOT Beyhan: an unnamed job is open to whoever the groups leave open, and her own list names what she does');
  // The operators array IS the column order: Helen, Lissa, Zara, Beyhan,
  // Hannah left to right. Zara and Beyhan are hidden from the wall
  // (hiddenOnBoard, and only that — they keep their keys, skills, diary
  // columns and salary screens); neither has a photo, on purpose.
  is(C.operators.map(o => o.key), ['helen', 'lissa', 'zara', 'beyhan', 'hannah'], 'operators: helen, lissa, zara, beyhan, hannah — Beyhan after Zara, before Hannah');
  is(C.operators.filter(o => !o.hiddenOnBoard).map(o => o.key), ['helen', 'lissa', 'hannah'], 'on the wall today: Helen, Lissa, Hannah — Zara and Beyhan hidden');
  is(C.find('zara').leftOn, undefined, 'Zara has no leftOn — hidden from the wall is not gone');
  is(C.find('beyhan').leftOn, undefined, 'Beyhan has no leftOn');
  is(C.find('zara').hiddenOnBoard, true, 'Zara keeps hiddenOnBoard');
  is(C.find('beyhan').hiddenOnBoard, true, 'Beyhan is off the wall board');
  // The wall and reception's grid are two questions with two flags. Beyhan is
  // off the television and ON the desk's grid, which is where her Perşembe
  // customers are booked; Zara is off both.
  is(C.find('beyhan').hiddenOnDash, undefined, "and ON reception's dashboard — no hiddenOnDash");
  is(C.find('zara').hiddenOnDash, true, 'Zara is off both the wall and the dashboard');
  is(C.find('beyhan').workdays, [2, 4], 'Beyhan works Salı and Perşembe again since 30 Eylül 2026');
  is('photo' in C.find('zara'), false, 'Zara names no photo file');
  is('photo' in C.find('beyhan'), false, 'Beyhan names no photo file');
  is(C.find('hannah').commissionPaused, true, 'the commission pause on Hannah survives the reorder');
  is(C.fillOrderOn(TUE).map(o => o.key), ['hannah', 'lissa', 'helen', 'beyhan'], 'fillOrder on a Tuesday: the three, then Beyhan — Zara is the one who is off');
  is(C.fillOrderOn(MON).map(o => o.key), ['hannah', 'lissa', 'helen', 'zara'], 'fillOrder on a Monday: Hannah, Lissa, Helen, then Zara; Beyhan is off');
  is(C.fillOrderOn(THU).map(o => o.key), ['hannah', 'lissa', 'helen', 'zara', 'beyhan'], 'fillOrder on a Thursday: the three, then Zara and Beyhan in roster order');
  is(C.fillOrderOn(WED).map(o => o.key), ['hannah', 'lissa', 'helen'], 'fillOrder on a Wednesday: the three only');
  is(C.staffPrefs.notBefore, { hannah: '2026-09-14' }, 'notBefore: Hannah not before 14 Eylül');
  // A technician who has left drops out of both answers for that date —
  // leftOn is tested first, whatever her workdays say.
  const C2 = loadCrown(); C2.operators.find(o => o.key === 'hannah').leftOn = '2026-09-20';
  is(C2.skilledOn('Kirpik Dolgu', '2026-09-21').map(o => o.name), ['Lissa'], 'after Hannah leaves, lashes on a Monday are Lissa only (Beyhan is off Mondays)');
  is(C2.skilledOn('Kirpik Dolgu', '2026-09-24').map(o => o.name), ['Lissa'], '…and on a Thursday Lissa alone — Beyhan does not do lash infills');
  is(C2.skilledOn('Kirpik Lifting & Boyama', '2026-09-24').map(o => o.name), ['Lissa', 'Beyhan'], '…though the lash LIFT that Thursday is Lissa and Beyhan');
  is(C2.fillOrderOn('2026-09-21').map(o => o.key), ['lissa', 'helen', 'zara'], 'and the fill order skips her');
  const C3 = loadCrown(); C3.operators.find(o => o.key === 'beyhan').leftOn = '2026-09-17';
  is(C3.rosterOn('2026-09-17').map(o => o.key).includes('beyhan'), false, 'a leftOn on one of her workdays: out from that day, the leftOn test comes first');
  is(C3.rosterOn('2026-09-10').map(o => o.key).includes('beyhan'), true, '…and in on her workday before it');
}

console.log('3b. workdays FAILS OPEN — a typo never deletes a column');
{
  // Every malformed value puts her on EVERY day. A wrong column is noticed in
  // a minute; a missing one is noticed when a customer arrives.
  const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'];
  const everyDay = (crown, key) => week.map(d => crown.rosterOn(d).map(o => o.key).includes(key));
  const withZara = v => { const c = loadCrown(); const z = c.operators.find(o => o.key === 'zara'); if (v === undefined) delete z.workdays; else z.workdays = v; return c; };
  is(everyDay(C, 'zara'), [true, false, false, true, false, false], 'the good value first: Zara on Pzt and Perş only');
  for (const [v, why] of [
    [undefined, 'the field missing'],
    [null, 'null'],
    ['1,4', 'a string'],
    ['Salı', 'a weekday name'],
    [[], 'an empty array'],
    [[7], 'a number out of range (7)'],
    [[-1], 'a negative number'],
    [[1, 4, 9], 'a good list with one number out of range'],
    [[1, 'x'], 'a good number and a string'],
    [[1, '4'], 'a number written as a string'],
    [[1, null], 'a null in the list'],
    [[1.5], 'not a whole number'],
    [[NaN], 'NaN'],
    [{ 1: true, 4: true }, 'an object'],
    [true, 'true'],
    [14, 'a bare number'],
  ]) {
    is(everyDay(withZara(v), 'zara'), [true, true, true, true, true, true], 'workdays = ' + (v === undefined ? '(missing)' : JSON.stringify(v) === undefined ? String(v) : JSON.stringify(v)) + ' — ' + why + ': she is on every day');
    is(withZara(v).workdaysOf(withZara(v).find('zara')), null, '…and workdaysOf calls it no rule');
  }
  is(C.workdaysOf(C.find('beyhan')), [2, 4], 'workdaysOf hands back a good list as it is');
  is(everyDay(withZara([0, 1, 2, 3, 4, 5, 6]), 'zara'), [true, true, true, true, true, true], 'all seven days written out = every day');
  is(everyDay(withZara([6]), 'zara'), [false, false, false, false, false, true], 'Cumartesi only, the edge of the range');
  is(everyDay(withZara([0]), 'zara'), [false, false, false, false, false, false], 'Pazar only: on no open day of the week (0 is a real value, not a typo)');
}

console.log('3c. Beyhan on the money screens — 0.80, what the salon OWES her');
{
  // Every money screen means the same thing by "commission": what the salon
  // owes the technician on her own income. 80% of Beyhan's income is hers
  // (no salary, paid monthly; the salon keeps 20%), so every rate map must
  // say 0.80 — 0.20 would pay her a fifth of what she is owed. The
  // history-repair routines that run on every page load recompute
  // commission = total × rate, and a name missing from a map is rate 0: her
  // earnings wiped, silently, whenever anyone opens the app.
  const lit = (re) => [...html.matchAll(re)].map(m => vm.runInNewContext('(' + m[1] + ')'));
  const diComm = lit(/const DI_COMM = (\{[^}\n]*\});/g);
  is(diComm.length, 2, 'the two DI_COMM maps inside the history-repair routines');
  is(diComm.map(m => m.Beyhan), [0.80, 0.80], 'DI_COMM: Beyhan 0.80 in both');
  const rates = lit(/var rates=(\{[^}\n]*\});/g);
  is(rates.length, 3, 'the three var rates={…} maps (the load-time fix, the June bake, the after-load fix)');
  is(rates.map(m => m.Beyhan), [0.80, 0.80, 0.80], 'var rates: Beyhan 0.80 in all three');
  const tcr = lit(/const TECH_COMM_RATES = (\{[^}\n]*\});/g);
  is(tcr.length === 1 && tcr[0].Beyhan, 0.80, 'TECH_COMM_RATES: Beyhan 0.80 — what techCommFromDays, the salary page, the Aylık page and the kasa repair all read');
  const RATES = lit(/const RATES=(\{[^}\n]*\});/g);
  is(RATES.length === 1 && RATES[0].Beyhan, 0.80, 'rdKasaRepairApply RATES: Beyhan 0.80');
  const diStaff = lit(/const DI_STAFF = (\[[\s\S]*?\n\]);/g);
  const bey = diStaff.length === 1 && diStaff[0].find(s => s.name === 'Beyhan');
  is(bey && [bey.commRate, bey.color, bey.commExtra, bey.salaryOnly, bey.extraOnWorkDay], [0.80, '#7aaae8', 0, undefined, undefined], 'DI_STAFF (Daily Takings): Beyhan 0.80, her blue, no extra, not salary-only');
  is(diStaff[0].map(s => s.name), ['Helen', 'Hannah', 'Lissa', 'Zara', 'Saeideh', 'Beyhan'], 'DI_STAFF: Beyhan after Saeideh');
  is(/Beyhan:0\.2\b|Beyhan:0\.20\b|commRate:0\.20?,?\s*[^\n]*Beyhan|Beyhan[^\n]*commRate:0\.20?\b/.test(html), false, 'nowhere is Beyhan on 0.20');
  // The other lists and rows she must be on.
  is(html.includes("const ADV_STAFF = ['Helen','Hannah','Lissa','Zara','Saeideh','Beyhan','Nihal'];"), true, 'ADV_STAFF (avans): Beyhan after Saeideh');
  const row = html.match(/\{name:'Beyhan',\s*role:'([^']*)',\s*color:'([^']*)',\s*salary:(\d+),\s*cur:'([^']*)',\s*commLabel:'([^']*)',\s*comm:commTotals\['Beyhan'\]\|\|0\}/);
  is(row && row.slice(1), ['Kaş & Kirpik Uzmanı', '#7aaae8', '0', 'TL', '80% of own client income (salon keeps 20%) — no salary, paid monthly'], 'the salary page row: Kaş & Kirpik Uzmanı, her blue, salary 0, the 80% label');
  is(html.includes("['Hannah','Lissa','Zara','Saeideh','Beyhan'].forEach(function(n){") && html.includes("const rates = {Hannah:'12%',Lissa:'12%',Zara:'25%',Saeideh:'50%',Beyhan:'80%'};"), true, 'the salary page commission rows list her at 80%');
  is(html.includes("const commOrder=['Lissa','Hannah','Zara','Saeideh','Beyhan'];") && html.includes("const commRateLabels={Lissa:'12%',Hannah:'12%',Zara:'25%',Saeideh:'50%',Beyhan:'80%'};"), true, 'the Aylık commission cards list her at 80%');
  is(html.includes("Zara:'var(--lavender)', Saeideh:'var(--orange)', Beyhan:'var(--blue)'"), true, 'STAFF_COLORS: Beyhan is var(--blue)');
  is(html.includes("Zara:'#b8a0d8',Saeideh:'#f5c27a',Beyhan:'#7aaae8'"), true, 'the dashboard grid colours: Beyhan is #7aaae8');
  is(/--blue:#7aaae8;/.test(html), true, '#7aaae8 is the page\'s var(--blue)');
  {
    // Every line that gives a technician #7aaae8 gives it to Beyhan: the
    // colour maps name her before it, the staff rows carry name:'Beyhan'.
    // (The Manager chip and a payment button use the same blue — they are
    // not technicians.)
    const lines = html.split('\n').filter(l => l.includes('#7aaae8'));
    const techLines = lines.filter(l => /(\w+):'#7aaae8'/.test(l) || /name:'/.test(l));
    is(techLines.length, 3, 'three technician lines carry #7aaae8 — the grid colours, the salary row, DI_STAFF');
    is(techLines.every(l => { const m = l.match(/(\w+):'#7aaae8'/); return m && (m[1] === 'Beyhan' || (m[1] === 'color' && /name:'Beyhan'/.test(l))); }), true, '…and on each it is Beyhan\'s');
    is(lines.some(l => /(Helen|Hannah|Lissa|Zara|Saeideh|Zebo|Nihal|Lilly)\s*:\s*'#7aaae8'|name:'(Helen|Hannah|Lissa|Zara|Saeideh|Zebo|Nihal|Lilly)'[^\n]*'#7aaae8'/.test(l)), false, 'no other technician has it');
  }
  is(html.includes("{id:6,name:'Beyhan',entries:[],active:true},") && html.includes("if(!d.operators.find(function(x){return x.name==='Beyhan';})) d.operators.push({id:6,name:'Beyhan',entries:[],active:true});"), true, 'Daily Takings: seeded as operator 6 and pushed in on an old saved state');
  is(html.includes("['Zara','Saeideh','Beyhan'].forEach(function(n){ var o=d.operators.find(function(x){return x.name===n;}); if(o) o.active=true; });"), true, 'Daily Takings: kept active');
  is(html.includes("'Beyhan': (techComms['Beyhan']||0)"), true, 'the Aylık avans base knows her');
  // The Aylık page: her group, her 80% card, the salon's 20% as its own card.
  const grp = html.match(/if\(techTotals\['Beyhan'\]>0\)\{[\s\S]*?\n    \}/);
  is(!!grp, true, 'the Aylık page has a Beyhan group, shown when she earned anything that month');
  is(grp && grp[0].includes("mkGroup('🔷 Beyhan'"), true, '…in her own blue group');
  is(grp && grp[0].includes("'Beyhan — '+_('m_tech_commission')+' (80%)'") && grp[0].includes("mFmtTRY(techComms['Beyhan']||0)"), true, '…her commission card says 80% and reads techCommFromDays like everyone else');
  is(grp && grp[0].includes("mkCard('Salona kalan (%20)', mFmtTRY(beyhanSalon)"), true, '…and "Salona kalan (%20)" is its own card');
  is(grp && grp[0].includes("const beyhanSalon = Math.round(beyhanGross*0.20);") && grp[0].includes("const beyhanGross = techTotals['Beyhan']||0;"), true, '…20% of her GROSS');
  is(grp && /kdv|vergi/i.test(grp[0].replace(/KDV\/vergi düşülmeden/g, '')), false, '…with no KDV or vergi taken off it');
  is(grp && grp[0].includes("mkCard('Beyhan — TOPLAM', mFmtTRY(techComms['Beyhan']||0)"), true, '…and her TOPLAM is the commission alone — no salary');
  // And she is on no automatic-side list by hand: the roster comes from crown-config.js.
  is(html.includes("const DED_RATES = {Hannah:0.12, Lissa:0.12};"), true, 'the Kesintiler form still offers only Hannah and Lissa');
}

console.log('4. index.html: rdCanDo / rdSkilledOn');
{
  const m1 = html.match(/function rdCanDo\(staff, service\)\{[\s\S]*?\n\}/);
  const m2 = html.match(/function rdSkilledOn\(service, date\)\{[\s\S]*?\n\}/);
  const m3 = html.match(/function rdStaffOn\(date\)\{[\s\S]*?\n\}/);
  if (!m1 || !m2 || !m3) { fail++; console.log('  ✗ helpers not found'); }
  else {
    const run = (crown, expr) => { const c = { window: crown === undefined ? {} : { CROWN: crown } }; vm.createContext(c); return vm.runInContext(m3[0] + m1[0] + m2[0] + ';' + expr, c); };
    is(run(C, "rdCanDo('Helen','Kirpik Dolgu')"), false, 'with the config: Helen, lashes → no');
    is(run(C, "rdCanDo('Lissa','Kirpik Dolgu')"), true, 'with the config: Lissa, lashes → yes');
    is(run(C, "rdSkilledOn('Bikini Ağda','2026-09-15')"), ['Helen'], 'rdSkilledOn answers names');
    is(run(undefined, "rdCanDo('Helen','Kirpik Dolgu')"), true, 'no config yet: open, the old behaviour');
    is(run(undefined, "rdSkilledOn('Bikini Ağda','2026-09-15')"), ['Helen', 'Lissa'], 'no config yet: the working pair');
  }
}

console.log('5. booking.html: a time is free only if someone who does the service can start there');
{
  const m1 = bk.match(/function svcNow\(\)\{[^\n]*\n/);
  const m2 = bk.match(/function techCan\(name\)\{[^\n]*\n/);
  const m3 = bk.match(/function slotState\(day,slot\)\{[\s\S]*?\n\}/);
  if (!m1 || !m2 || !m3) { fail++; console.log('  ✗ booking page functions not found'); }
  else {
    const day = new Date(2026, 8, 15, 12);   // a Tuesday
    // slotState calls a start "past" within 30 minutes of NOW, so the clock
    // is frozen at 08:00 on the fixture's day — the test fixture is 15 Eylül
    // 2026, and on that very morning, at 09:30, the wall clock walked past
    // the 10:00 slot and the assertions below went red for no reason.
    const FROZEN = new Date(2026, 8, 15, 8, 0).getTime();
    class FrozenDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FROZEN); } static now() { return FROZEN; } }
    const avail = { '2026-09-15': { '10:00': { a: { Helen: 1, Lissa: 0, Hannah: 0 } }, '11:00': { a: { Helen: 0, Lissa: 1, Hannah: 0 } }, '12:00': { a: { Helen: 0, Lissa: 0, Hannah: 0 } } } };
    const run = (svc, slot, crown) => {
      const c = {
        window: { CROWN: crown === undefined ? C : crown }, CROWN: crown === undefined ? C : crown, Date: FrozenDate, Number, Object, String,
        document: { getElementById: () => ({ value: svc }) },
        avail, bkClosed: () => false, dKey: d => '2026-09-15', CAP: 3
      };
      vm.createContext(c);
      return vm.runInContext(m1[0] + m2[0] + m3[0] + ';slotState(new Date(2026,8,15,12),' + JSON.stringify(slot) + ')', c);
    };
    is(run('Klasik Manikür', '10:00'), 'free', '10:00, only Helen free: free for a manicure');
    is(run('Klasik Kirpik Uygulaması', '10:00'), 'full', '10:00, only Helen free: FULL for lashes — she is not substituted');
    is(run('Klasik Kirpik Uygulaması', '11:00'), 'free', '11:00, Lissa free: free for lashes');
    is(run('Bikini Ağda', '11:00'), 'full', '11:00, Lissa free: FULL for wax');
    is(run('Diğer / Other', '11:00'), 'free', 'an ungrouped service takes anyone');
    is(run('Klasik Kirpik Uygulaması', '12:00'), 'full', 'nobody free: full for everyone');
    is(run('Klasik Kirpik Uygulaması', '10:00', null), 'free', 'no config on the page: anyone free counts (the desk re-checks)');
    is(/getElementById\('svc'\)\.addEventListener\('change'/.test(bk), true, 'a changed service redraws the times');
    is(/id="skillNote"/.test(bk), true, 'the who-does-it line is on the page');
  }
}

console.log('5b. pick the technician, get HER treatments');
{
  /* The owner asked for this in as many words: she books for herself and her
     treatments come out. The form has always worked the other way round —
     choose the service, and the Personel list labels whoever does not do it.
     Scrolling past thirty-one services to find Pudralama, in a salon, with a
     customer waiting, is how a till starts to feel like paperwork. */
  is(/function rdApplyStaffToServiceSel\(/.test(html), true, 'choosing a technician narrows the Hizmet list');
  is(/document\.getElementById\('a-staff'\)\.addEventListener\('change'/.test(html), true, '…wired to the Personel box');
  is(/if\(typeof rdApplyStaffToServiceSel==='function'\) rdApplyStaffToServiceSel\(\);/.test(html), true, '…and run again whenever that list is rebuilt');
  is(/id="a-allsvc"/.test(html), true, 'with "Tüm hizmetleri göster" to bring the whole list back');
  is(/Tüm hizmetleri göster/.test(html), true, '…labelled in Turkish');
  /* iOS DRAWS ITS OWN PICKER AND IGNORES `hidden`. The first version hid the
     options, which works on a laptop and does nothing at all on an iPhone:
     Safari builds the native wheel from the option list and shows every one,
     hidden or not. The owner opened her column on a phone, the label above
     the box correctly read "BEYHAN'IN YAPTIKLARI", and the list under it
     still had every pedicure in the salon in it. */
  is(/o\.hidden\s*=/.test(html), false, 'nothing is merely hidden — iOS ignores that and shows it anyway');
  is(/o\.parentNode\.removeChild\(o\);/.test(html), true, '…the options she does not do are REMOVED');
  is(/var RD_SVC_ALL_HTML = null;/.test(html), true, 'the full list is kept once, as the markup wrote it');
  is(/sv\.innerHTML=RD_SVC_ALL_HTML;/.test(html), true, '…and the box is rebuilt from it every time, never from the last run\u2019s leftovers');
  is(/if\(!g\.querySelector\('option'\)\) g\.parentNode\.removeChild\(g\);/.test(html), true, '…with an emptied group dropped, not left as a heading over nothing');
  is(/var keep=\(o\.value===chosen\);/.test(html), true, 'a service already chosen is kept, never dropped');
  is(/sv\.insertBefore\(o, sv\.firstChild\);/.test(html), true, '…and put back on its own if the rebuild lost it');
  is(/if\(chosen\) sv\.value=chosen;/.test(html), true, '…and re-selected afterwards, so nothing is silently re-billed');
  is(/bu hizmeti yapmıyor/.test(html), true, '…shown with a mark on it instead');
  is(/if\(known && !showAll\)\{/.test(html), true, 'Manager, a blank and an unknown name all still see everything');
  is(/var ok=rdCanDo\(who, o\.value\);/.test(html), true, '…and the question asked of each one is crown-config\u2019s canDo');

  /* Her eight must actually EXIST in that form. Four of them did not: the
     + Randevu service list had never been given Kirpik Lifting, Kaş Boyama,
     Kaş Laminasyon, Pudralama, Kaş Vitamini or Kaş Silme, so picking Beyhan
     would have narrowed the list to two. */
  const form = /<select class="fctrl" id="a-service">([\s\S]*?)<\/select>/.exec(html);
  is(!!form, true, 'the + Randevu service list is found');
  const opts = [...(form ? form[1] : '').matchAll(/<option value="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
  const hers = Object.keys(C.servicesOf('beyhan'));
  is(hers.filter(n => !opts.includes(n)), [], 'every one of Beyhan\u2019s eight is in the form');
  is(opts.filter(n => C.canDo('beyhan', n)).length, 8, '…and picking her leaves exactly those eight');
  is(opts.filter(n => C.canDo('helen', n)).length > 8, true, '…while Helen still has her own, much longer list');
  is(opts.includes('Pudralama'), true, 'Pudralama is bookable at the desk, not only online');
}

console.log('5c. …however her name got into the box');
{
  /* THE BUG THE OWNER SAW. Setting a <select>'s .value in code does NOT fire
     a change event. Tapping an empty slot in a technician's column, and
     opening an existing booking to edit it, both set a-staff that way — so
     the filter never ran and he saw his whole business's menu under Beyhan's
     name. The listener was right and simply never fired.

     The reaction lives in one function now, and every path calls it. */
  is(/window\.rdStaffSelChanged = function\(\)\{/.test(html), true, 'one function reacts to the technician changing');
  is(/rdApplyStaffToServiceSel\(\);/.test(html), true, '…narrowing the service list');
  is(/if\(typeof autoDurFill==='function'\) autoDurFill\(\);/.test(html), true, '…and filling in the length');
  is(/addEventListener\('change',function\(\)\{ rdStaffSelChanged\(\); \}\)/.test(html), true, 'a tap on the box calls it');
  is(/if\(o\.value===staffName\)\{ staffSel\.value=staffName; break; \}\s*\n\s*\}\s*\n\s*\/\/[^\n]*\n\s*try\{ rdStaffSelChanged\(\); \}catch\(e\)\{\}/.test(html), true,
     'tapping an empty slot in her column calls it — the case he reported');
  is(/if\(st\)\{ st\.value = a\.staff \|\| ''; try\{ rdStaffSelChanged\(\); \}catch\(e\)\{\} \}/.test(html), true,
     'opening an existing booking calls it');
  is(/if\(st\)\{ st\.value=''; try\{ rdStaffSelChanged\(\); \}catch\(e\)\{\} \}/.test(html), true,
     'and clearing the form calls it, so the whole list comes back');
  /* No path may set that box and leave the list stale again. Every place the
     a-staff element is fetched and then written to must call the reaction
     within a few lines — counting `.value=` across the whole file would catch
     half a dozen other variables that happen to be called `st`. */
  const sites = [...html.matchAll(/getElementById\(['"]a-staff['"]\)/g)].map(m => m.index);
  // Only a write to the technician box itself counts — autoDurFill fetches it
  // and then writes to a-dur, which is not the same thing at all.
  const writes = sites.filter(i => /(?:st|staffSel)\.value\s*=\s*[^=]/.test(html.slice(i, i + 260)));
  is(writes.length, 7, 'seven places fetch the technician box and write to it');
  is(writes.filter(i => !/rdStaffSelChanged/.test(html.slice(i, i + 400))), [],
     '…and every one of them calls the reaction straight after');
  is((html.match(/rdStaffSelChanged\(\)/g) || []).length >= 8, true,
     'the reaction is called from the change event and from every one of those seven');
}

console.log('5d. and the system offers her empty slots');
{
  /* "for our system to be able to offer her empty slots" — Uygun Saat Bul.
     It already asks skilledOn, so her own list governs who it searches. What
     it did NOT do was measure her job properly. */
  is(/const able=\(typeof rdSkilledOn==='function'\)\?rdSkilledOn\(svc, dayStr\):rdStaffOn\(dayStr\);/.test(html), true,
     'the finder searches only the technicians who do the service');
  is(/bu hizmeti yapmıyor \('\+svc\+'\)/.test(html), true, '…and refuses a named one who does not, with the reason');
  // The 60 cap was right for a salon where everyone ran on the hour. Her
  // microblading really is 90, and an hour-long hole for it does the exact
  // harm the cap existed to prevent, to the customer after her.
  is(/window\.rdSvcDur = function\(service, who\)\{/.test(html), true, 'rdSvcDur can be asked about a particular technician');
  is(/CROWN\.serviceMinutes\(who, service\) : null;\s*\n\s*if\(m\) return m;/.test(html), true, '…and her own figure comes back UNCAPPED');
  is(/return Math\.min\(60, best \|\| 60\);/.test(html), true, '…while everyone else keeps the 60 ceiling exactly as before');
  is(/const durOf=function\(t\)\{ return \(typeof rdSvcDur==='function'\)\?rdSvcDur\(svc,t\):60; \};/.test(html), true,
     'the finder measures each technician separately');
  is(/fitsAt\(busy\[t\], want, durOf\(t\)\)/.test(html), true, '…for the exact time asked');
  is(/if\(fitsAt\(busy\[t\], s, d\)\)/.test(html), true, '…and for every alternative rung, against HER length');
}

console.log('6. the check is carried everywhere it must be');
{
  // The skill filter and the pick are no longer adjacent lines: a REQUESTED
  // technician now narrows _able in between (staff.html, where Beyhan books
  // her own customers). So the two halves are pinned separately, and the
  // invariant that matters — staffPick comes out of _able and nowhere else —
  // is pinned on its own.
  is(/let _able=_obTechs\(req\.date\)\.filter\(t=>rdCanDo\(t, req\.service\|\|''\)\);/.test(html), true, 'the online request handler starts from technicians who do the requested service');
  is(/const staffPick=_able\.find\(t=>_obTechCanStart\(t, req\.time, maps, _svcMins\(t\)\)\)\|\|'';/.test(html), true, '…and picks only from that list, never from the whole roster');
  is(/function _obTechCanStart\(tech,slot,maps,mins\)\{/.test(html), true, '…asked whether she can start a job of THIS service\u2019s length');
  is(/if\(_want\) _able=_able\.filter\(t=>String\(t\)\.toLowerCase\(\)===_want\);/.test(html), true, '…a named technician narrows it further, never widens it');
  is(/bu hizmeti \('\+\(req\.service\|\|''\)\+'\) yapan personel yok/.test(html), true, '…and says so when nobody does');
  is(/const able=\(typeof rdSkilledOn==='function'\)\?rdSkilledOn\(svc, dayStr\):rdStaffOn\(dayStr\);/.test(html), true, 'Uygun Saat Bul searches only those who do the service');
  is(/bu hizmeti yapmıyor \('\+svc\+'\)/.test(html), true, '…and refuses a named technician who does not, by name');
  // The DIARY is the one place that warns instead of refusing: reception
  // knows the staff better than the config does, so she is told and asked,
  // never blocked. Everything automatic or customer-facing above still refuses.
  const bump = (a, b) => "if(!confirm(" + a + "+' — '+" + b + "+' — bu hizmeti yapmıyor olarak kayıtlı.\\n\\nYine de kaydedilsin mi?')) return;";
  const saveAt = html.indexOf("if(staff && _svc && typeof rdCanDo==='function' && !rdCanDo(staff, _svc)){");
  const editAt = html.indexOf("(_stv!==live.staff || _svv!==live.service) && typeof rdCanDo==='function' && !rdCanDo(_stv,_svv)){");
  is(saveAt > 0 && html.slice(saveAt, saveAt + 400).includes(bump('staff', '_svc')), true, 'saving a new booking ASKS ("Yine de kaydedilsin mi?") before the clash check and goes on if she says yes');
  is(editAt > 0 && html.slice(editAt, editAt + 400).includes(bump('_stv', '_svv')), true, 'editing asks about a CHANGED pairing only — an old record is never even asked about for what it always was');
  is(html.split('Yine de kaydedilsin mi?').length - 1, 2, 'exactly the two speed bumps — the save and the edit');
  is(html.includes('Personel bu hizmeti yapmıyor'), false, 'the red refusal toast is gone from the diary');
  const fStart = html.indexOf('function rdApplySkillToStaffSel(){'); const form = fStart < 0 ? '' : html.slice(fStart, html.indexOf('\n}', fStart));
  is(fStart > 0 && form.includes("o.textContent=o.value+(ok?'':' — bu hizmeti yapmıyor')"), true, 'the form LABELS who is not down for the chosen service…');
  is(fStart > 0 && !form.includes('o.disabled') && !form.includes("st.value=''") && !form.includes('toast('), true, '…and only labels: nobody is disabled, the selection is not cleared, no toast');
  is(html.includes("addEventListener('change',rdApplySkillToStaffSel)"), true, 'the labels refresh when the service changes');
  is(fs.readFileSync(path.join(__dirname, '..', 'crown-config.js'), 'utf8').includes('cannot be booked for it ANYWHERE'), false, 'crown-config.js no longer claims the diary refuses');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
