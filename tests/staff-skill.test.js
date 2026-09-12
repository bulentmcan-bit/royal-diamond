// ═══════════════════════════════════════════════════════════════════════════
// WHO CAN DO WHAT — crown-config.js staffPrefs.serviceSkill and every place
// that asks it. It proves:
//   1. serviceGroup sorts EVERY name in the service list into its heading
//      (manikur / pedikur / kirpik / kas / agda) and the odd ones into none
//   2. canDo: Helen never lashes, Lissa and Hannah never brows or wax, a
//      non-technician (Manager) and an ungrouped service are open
//   3. skilledOn / fillOrderOn answer in the configured order, per day
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
  const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(src, ctx);
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
  is(C.canDo('Manager', 'Bikini Ağda'), true, 'Manager is not a technician — the rule does not govern the name');
  is(C.canDo('Lissa', 'Güzellik Uygulaması'), true, 'an ungrouped service is open to everyone');
  is(C.canDo('', 'Kirpik Dolgu'), true, 'no staff chosen yet — nothing to refuse');
}

console.log('3. skilledOn / fillOrderOn');
{
  is(C.skilledOn('Klasik Kirpik Uygulaması', '2026-09-15').map(o => o.name), ['Lissa', 'Hannah'], 'lashes: Lissa then Hannah, the serviceSkill order');
  is(C.skilledOn('Tüm Yüz Ağda', '2026-09-15').map(o => o.name), ['Helen'], 'wax: Helen alone');
  is(C.skilledOn('Klasik Manikür', '2026-09-15').map(o => o.name), ['Helen', 'Lissa', 'Zara', 'Hannah'], 'manicure: everyone, best first — Zara after Lissa, ahead of Hannah');
  is(C.skilledOn('Jel Pedikür', '2026-09-15').map(o => o.name), ['Helen', 'Lissa', 'Zara', 'Hannah'], 'pedicure: the same four in the same order');
  is(C.skilledOn('Diğer / Other', '2026-09-15').map(o => o.name), ['Helen', 'Lissa', 'Zara', 'Hannah'], 'ungrouped: the whole roster in roster order');
  // The operators array IS the board's column order: Helen, Lissa, Zara,
  // Hannah left to right. Zara is hidden from the wall (hiddenOnBoard, and
  // only that — she keeps her key, skills, diary column and salary screens);
  // Hannah is on it. Zara has no photo on purpose (temporary staff).
  is(C.operators.map(o => o.key), ['helen', 'lissa', 'zara', 'hannah'], 'operators: helen, lissa, zara, hannah — the column order');
  is(C.operators.filter(o => !o.hiddenOnBoard).map(o => o.key), ['helen', 'lissa', 'hannah'], 'on the wall today: Helen, Lissa, Hannah — Zara hidden');
  is(C.find('zara').leftOn, undefined, 'Zara has no leftOn — hidden from the wall is not gone');
  is(C.rosterOn('2026-09-15').map(o => o.key), ['helen', 'lissa', 'zara', 'hannah'], 'the diary, booking page and free-time finder still see Zara');
  is('photo' in C.find('zara'), false, 'Zara names no photo file');
  is(C.find('hannah').commissionPaused, true, 'the commission pause on Hannah survives the reorder');
  is(C.fillOrderOn('2026-09-15').map(o => o.key), ['hannah', 'lissa', 'helen', 'zara'], 'fillOrder: Hannah, Lissa, Helen, then Zara — not in fillOrder yet, so appended last');
  is(C.staffPrefs.notBefore, { hannah: '2026-09-14' }, 'notBefore: Hannah not before 14 Eylül');
  // A technician who has left drops out of both answers for that date.
  const C2 = loadCrown(); C2.operators.find(o => o.key === 'hannah').leftOn = '2026-09-20';
  is(C2.skilledOn('Kirpik Dolgu', '2026-09-21').map(o => o.name), ['Lissa'], 'after Hannah leaves, lashes are Lissa only');
  is(C2.fillOrderOn('2026-09-21').map(o => o.key), ['lissa', 'helen', 'zara'], 'and the fill order skips her');
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
  is(/if\(staff && _svc && typeof rdCanDo==='function' && !rdCanDo\(staff, _svc\)\)/.test(html), true, 'saving a new booking refuses the pairing before the clash check');
  is(/\(_stv!==live\.staff \|\| _svv!==live\.service\) && typeof rdCanDo==='function' && !rdCanDo\(_stv,_svv\)/.test(html), true, 'editing refuses a CHANGED pairing only — an old record is never refused for what it always was');
  is(/addEventListener\('change',rdApplySkillToStaffSel\)/.test(html), true, 'the form greys out who does not do the chosen service');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
