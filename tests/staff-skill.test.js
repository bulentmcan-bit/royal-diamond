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
  for (const h of Object.keys(want)) {
    const got = (groups[h] || []).map(n => C.serviceGroup(n));
    is(got, (groups[h] || []).map(() => want[h]), h + ' → ' + want[h] + ' for all ' + (groups[h] || []).length);
  }
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
  is(C.canDo('Beyhan', 'Klasik Kirpik Uygulaması'), true, 'Beyhan does lashes');
  is(C.canDo('beyhan', 'Kirpik Dolgu'), true, 'Beyhan does lash infills (by key)');
  is(C.canDo('Beyhan', 'Altın Oran Kaş Alımı'), true, 'Beyhan does brows');
  is(C.canDo('Beyhan', 'Kaş Laminasyon'), true, 'Beyhan does brow lamination');
  is(C.canDo('Beyhan', 'Microblading'), true, 'Beyhan does microblading');
  is(C.canDo('Beyhan', 'Klasik Manikür'), false, 'Beyhan is REFUSED a manicure');
  is(C.canDo('Beyhan', 'Dolgu (Infill)'), false, 'Beyhan is REFUSED a nail infill');
  is(C.canDo('Beyhan', 'Jel Pedikür'), false, 'Beyhan is REFUSED a pedicure');
  is(C.canDo('Beyhan', 'Bikini Ağda'), false, 'Beyhan is REFUSED a wax');
  is(C.canDo('Beyhan', 'Bıyık / Çene Ağda'), false, 'Beyhan is REFUSED the lip/chin wax — that is agda, Helen only');
  is(C.staffPrefs.serviceSkill.kirpik, ['lissa', 'hannah', 'beyhan'], 'kirpik: Lissa, Hannah, Beyhan');
  is(C.staffPrefs.serviceSkill.kas, ['helen', 'beyhan'], 'kas: Helen, Beyhan');
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
  is(names(TUE), ['Helen', 'Lissa', 'Beyhan', 'Hannah'], 'Salı: Helen, Lissa, Beyhan, Hannah');
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
  is(['helen', 'lissa', 'hannah'].map(k => 'workdays' in C.find(k)), [false, false, false], 'Helen, Lissa and Hannah carry no workdays — every open day, exactly as before');

  is(C.skilledOn('Klasik Kirpik Uygulaması', TUE).map(o => o.name), ['Lissa', 'Hannah', 'Beyhan'], 'lashes on a Tuesday: Lissa, Hannah, then Beyhan — the serviceSkill order');
  is(C.skilledOn('Klasik Kirpik Uygulaması', MON).map(o => o.name), ['Lissa', 'Hannah'], 'lashes on a Monday: Lissa, Hannah — Beyhan is not in');
  is(C.skilledOn('Kaş Laminasyon', THU).map(o => o.name), ['Helen', 'Beyhan'], 'brows on a Thursday: Helen, then Beyhan');
  is(C.skilledOn('Kaş Laminasyon', WED).map(o => o.name), ['Helen'], 'brows on a Wednesday: Helen alone');
  is(C.skilledOn('Tüm Yüz Ağda', TUE).map(o => o.name), ['Helen'], 'wax: Helen alone, Beyhan or no Beyhan');
  is(C.skilledOn('Klasik Manikür', MON).map(o => o.name), ['Helen', 'Lissa', 'Zara', 'Hannah'], 'manicure on a Monday: Helen, Lissa, Zara, Hannah — never Beyhan');
  is(C.skilledOn('Klasik Manikür', TUE).map(o => o.name), ['Helen', 'Lissa', 'Hannah'], 'manicure on a Tuesday: Helen, Lissa, Hannah — no Zara (her day off), no Beyhan (not a nail technician)');
  is(C.skilledOn('Klasik Manikür', THU).map(o => o.name), ['Helen', 'Lissa', 'Zara', 'Hannah'], 'manicure on a Thursday: the four nail technicians, Beyhan still not among them');
  is(C.skilledOn('Jel Pedikür', THU).map(o => o.name), ['Helen', 'Lissa', 'Zara', 'Hannah'], 'pedicure on a Thursday: the same four');
  is(C.skilledOn('Diğer / Other', THU).map(o => o.name), ['Helen', 'Lissa', 'Zara', 'Beyhan', 'Hannah'], 'ungrouped on a Thursday: the whole roster in roster order');
  // The operators array IS the column order: Helen, Lissa, Zara, Beyhan,
  // Hannah left to right. Zara and Beyhan are hidden from the wall
  // (hiddenOnBoard, and only that — they keep their keys, skills, diary
  // columns and salary screens); neither has a photo, on purpose.
  is(C.operators.map(o => o.key), ['helen', 'lissa', 'zara', 'beyhan', 'hannah'], 'operators: helen, lissa, zara, beyhan, hannah — Beyhan after Zara, before Hannah');
  is(C.operators.filter(o => !o.hiddenOnBoard).map(o => o.key), ['helen', 'lissa', 'hannah'], 'on the wall today: Helen, Lissa, Hannah — Zara and Beyhan hidden');
  is(C.find('zara').leftOn, undefined, 'Zara has no leftOn — hidden from the wall is not gone');
  is(C.find('beyhan').leftOn, undefined, 'Beyhan has no leftOn');
  is(C.find('zara').hiddenOnBoard, true, 'Zara keeps hiddenOnBoard');
  is(C.find('beyhan').hiddenOnBoard, true, 'Beyhan is off the wall board for now, like Zara');
  is('photo' in C.find('zara'), false, 'Zara names no photo file');
  is('photo' in C.find('beyhan'), false, 'Beyhan names no photo file');
  is(C.find('hannah').commissionPaused, true, 'the commission pause on Hannah survives the reorder');
  is(C.fillOrderOn(TUE).map(o => o.key), ['hannah', 'lissa', 'helen', 'beyhan'], 'fillOrder on a Tuesday: Hannah, Lissa, Helen, then Beyhan — not in fillOrder, so appended; Zara is off');
  is(C.fillOrderOn(MON).map(o => o.key), ['hannah', 'lissa', 'helen', 'zara'], 'fillOrder on a Monday: Hannah, Lissa, Helen, then Zara; Beyhan is off');
  is(C.fillOrderOn(THU).map(o => o.key), ['hannah', 'lissa', 'helen', 'zara', 'beyhan'], 'fillOrder on a Thursday: the three, then Zara and Beyhan in roster order');
  is(C.fillOrderOn(WED).map(o => o.key), ['hannah', 'lissa', 'helen'], 'fillOrder on a Wednesday: the three only');
  is(C.staffPrefs.notBefore, { hannah: '2026-09-14' }, 'notBefore: Hannah not before 14 Eylül');
  // A technician who has left drops out of both answers for that date —
  // leftOn is tested first, whatever her workdays say.
  const C2 = loadCrown(); C2.operators.find(o => o.key === 'hannah').leftOn = '2026-09-20';
  is(C2.skilledOn('Kirpik Dolgu', '2026-09-21').map(o => o.name), ['Lissa'], 'after Hannah leaves, lashes on a Monday are Lissa only (Beyhan is off Mondays)');
  is(C2.skilledOn('Kirpik Dolgu', '2026-09-22').map(o => o.name), ['Lissa', 'Beyhan'], '…and on a Tuesday Lissa and Beyhan');
  is(C2.fillOrderOn('2026-09-21').map(o => o.key), ['lissa', 'helen', 'zara'], 'and the fill order skips her');
  const C3 = loadCrown(); C3.operators.find(o => o.key === 'beyhan').leftOn = '2026-09-17';
  is(C3.rosterOn('2026-09-17').map(o => o.key).includes('beyhan'), false, 'a leftOn on one of her workdays: out from that day, the leftOn test comes first');
  is(C3.rosterOn('2026-09-15').map(o => o.key).includes('beyhan'), true, '…and in on her workday before it');
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
  is(html.includes("const ADV_STAFF = ['Helen','Hannah','Lissa','Zara','Saeideh','Beyhan','Zebo','Nihal'];"), true, 'ADV_STAFF (avans): Beyhan after Saeideh');
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
    const avail = { '2026-09-15': { '10:00': { a: { Helen: 1, Lissa: 0, Hannah: 0 } }, '11:00': { a: { Helen: 0, Lissa: 1, Hannah: 0 } }, '12:00': { a: { Helen: 0, Lissa: 0, Hannah: 0 } } } };
    const run = (svc, slot, crown) => {
      const c = {
        window: { CROWN: crown === undefined ? C : crown }, CROWN: crown === undefined ? C : crown, Date, Number, Object, String,
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

console.log('6. the check is carried everywhere it must be');
{
  is(/const _able=_obTechs\(req\.date\)\.filter\(t=>rdCanDo\(t, req\.service\|\|''\)\);\s*const staffPick=_able\.find/.test(html), true, 'the online request handler picks only from technicians who do the requested service');
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
